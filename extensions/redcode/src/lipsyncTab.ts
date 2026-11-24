// The Lip Sync tab (docs/design/lipsync.md; the research is docs/research/lipsync.md): pick a character, see its
// lip synced lines by scene, hear a line and see its clip as curves and on its head, and add a line of your own.
// The reading and the making are @edgemodders/lipsync-core's (packages/lipsync-core), which the MCP server
// shares; this file is the tab and its messages. Moved from EDGEfab on 2026-11-22.

import * as vscode from "vscode";
import * as fs from "node:fs";
import * as path from "node:path";
import { headModel, lipsyncCacheDir, lipsyncCharacters, lipsyncClip, lipsyncLines, speechClip, DefaultLanguage, type BridgeCall, type LineTimings, type LipsyncCharacter } from "../../../packages/lipsync-core/src/index";
import { lipsyncHtml } from "./lipsyncPage";

export interface LipSyncHost {
  log(line: string): void;
  /** REDbridge: a call on the bridge REDcode runs now. It throws in plain words when none is running. */
  call: BridgeCall;
  /** A game sound file as audio a webview decodes (what REDcodeApi.sound gives). */
  sound(gamePath: string): Promise<{ data: Uint8Array; mime: string }>;
  /** The head viewer's script (media/lipsync/head.js), built by esbuild.mjs; without the file the tab shows the sketch. */
  headScript: string;
  /** Speaks a new line in a character's voice, with when each letter is spoken: EDGEwave's speakLine (its #13).
   *  The voice, the key, the consent and the cost are EDGEwave's; a refusal comes back as a reason in plain words. */
  speak?: (request: { text: string; character: string; take?: "new" }) => Promise<SpokenLine | { reason: string }>;
}

/** Where the tab opens: a line by its clip's name, and a scene filter that lists that line's scene. */
export interface LipSyncAt {
  clip?: string;
  scene?: string;
}

/** What EDGEwave's speakLine answers, as far as the tab uses it. */
export interface SpokenLine {
  /** The WAV, a full path. */
  wav: string;
  seconds: number;
  /** Seconds from the WAV's first sample. */
  timings: LineTimings;
  voice?: { id: string; name?: string };
  model?: string;
  take?: number;
  cached?: boolean;
  notes?: string[];
}

const message = (e: unknown) => (e instanceof Error ? e.message : String(e));
const pretty = (voiceTag: string) => voiceTag.replace(/_/g, " ").replace(/\b[a-z]/g, (c) => c.toUpperCase());

let panel: vscode.WebviewPanel | undefined;
/** Shows a character, and a line when asked, in the open tab. */
let goTo: ((character: string, at?: LipSyncAt) => Promise<void>) | undefined;

/** Asks which character, by voice tag: the ones with the most lip synced scenes first. */
async function pickCharacter(call: BridgeCall, language: string): Promise<LipsyncCharacter | undefined> {
  const all = await lipsyncCharacters(call, { language });
  const picked = await vscode.window.showQuickPick(
    all.map((c) => ({ label: pretty(c.voiceTag), description: c.voiceTag, detail: `${c.scenes} ${c.scenes === 1 ? "scene" : "scenes"} with lip sync`, character: c })),
    { title: "Lip Sync: whose lines?", placeHolder: `Type a name: judy, panam, jackie ... (${all.length} characters speak in ${language})`, matchOnDescription: true },
  );
  return picked?.character;
}

/** Brings the tab back after a window reload: VS Code hands over the panel it kept and what the page saved
 *  (the character, and the line that was open). A tab that can't come back is closed. */
export async function restoreLipSync(host: LipSyncHost, kept: vscode.WebviewPanel, saved: unknown): Promise<void> {
  const state = (saved ?? {}) as { character?: unknown; clip?: unknown; scene?: unknown };
  if (panel || typeof state.character !== "string") return void kept.dispose();
  await openLipSync(host, state.character, { clip: typeof state.clip === "string" ? state.clip : undefined, scene: typeof state.scene === "string" ? state.scene : undefined }, kept);
}

/** Opens the Lip Sync tab, on `character` (a voice tag's name or id) when given, else on the one the modder
 *  picks; `at` opens a line of theirs. `restored` is a panel VS Code kept over a window reload. */
export async function openLipSync(host: LipSyncHost, character?: string, at?: LipSyncAt, restored?: vscode.WebviewPanel): Promise<void> {
  if (panel) {
    panel.reveal();
    if (character) await goTo?.(character, at);
    return;
  }
  const call = host.call;
  const language = DefaultLanguage;
  let current: LipsyncCharacter | undefined;
  let sceneFilter = at?.scene?.trim() || undefined;
  const find = async (who: string) => (await lipsyncCharacters(call, { language })).find((c) => c.voiceTag === who || c.id === who);
  try {
    if (character) current = await vscode.window.withProgress({ location: vscode.ProgressLocation.Window, title: "Lip Sync: reading the game's lines" }, () => find(character));
    if (character && !current && !restored) void vscode.window.showWarningMessage(`Lip Sync: the game has no lip synced lines for "${character}" in ${language}. Pick a character.`);
    // A restored tab never asks who: without its character it closes.
    if (!restored) current ??= await pickCharacter(call, language);
  } catch (e) {
    restored?.dispose();
    host.log(`Lip Sync: ${message(e)}`);
    void vscode.window.showErrorMessage(`Lip Sync: ${message(e)}${/anims\.info|loc\.lines|method/i.test(message(e)) ? " Lip Sync needs REDbridge 0.16.0 or later (REDcode: Update REDbridge)." : ""}`);
    return;
  }
  if (!current || panel) {
    restored?.dispose();
    return;
  }

  // The page may load two kinds of file: the head viewer's script from the extension, and heads from the cache.
  const webviewDir = path.dirname(host.headScript);
  const headsDir = path.join(lipsyncCacheDir(), "heads");
  const localResourceRoots = [vscode.Uri.file(webviewDir), vscode.Uri.file(headsDir)];
  const p = (panel = restored ?? vscode.window.createWebviewPanel("redcode.lipsync", "Lip Sync", vscode.ViewColumn.Active, { enableScripts: true, retainContextWhenHidden: true, localResourceRoots }));
  if (restored) p.webview.options = { enableScripts: true, localResourceRoots };
  // The line to open once its scene is listed: the one asked for, or after a reload the one that was open.
  let reopen = at?.clip;
  const post = (m: unknown) => void p.webview.postMessage(m);

  // The head for a clip: the one its lip sync set's rig belongs to, else the plain head of that gender. Read and
  // exported once a rig, then sent to the page when the rig changes.
  let shownRig: string | undefined;
  const showHead = async (rig: string | undefined) => {
    if (!rig || rig === shownRig) return;
    shownRig = rig;
    const started = Date.now();
    try {
      const head = await headModel(call, { rig });
      if (rig !== shownRig) return;
      const own = head.rig === rig;
      post({
        type: "head",
        models: head.models.map((m) => ({ kind: m.kind, uri: p.webview.asWebviewUri(vscode.Uri.file(m.file)).toString() })),
        face: head.face,
        note: own ? "The head this line was made on, moved by the clip's tracks. Drag to turn it." : "A plain head (this line's own was not found), moved by the clip's tracks. Drag to turn it.",
      });
      host.log(`Lip Sync: the head of ${path.basename(head.rig)}, ${head.models.length} meshes, ${Date.now() - started} ms`);
    } catch (e) {
      shownRig = undefined;
      host.log(`Lip Sync: no head: ${message(e)}`);
      post({ type: "head", error: "The head didn't load; this is a sketch from the jaw and lip tracks" });
    }
  };
  p.onDidDispose(() => {
    panel = undefined;
    goTo = undefined;
  });

  const showLines = async (offset: number) => {
    if (!current) return;
    post({ type: "busy", text: offset ? "Reading more scenes" : `Reading ${pretty(current.voiceTag)}'s lines` });
    try {
      const data = await lipsyncLines(call, { character: current.id, language, scene: sceneFilter, offset, limit: 12 });
      post({ type: "lines", data, append: offset > 0 });
    } catch (e) {
      host.log(`Lip Sync: ${message(e)}`);
      post({ type: "error", text: message(e) });
    }
  };
  const showCharacter = async () => {
    if (!current) return;
    p.title = `Lip Sync: ${pretty(current.voiceTag)}`;
    post({ type: "character", character: { ...current, name: pretty(current.voiceTag) }, language, audio: true, reopen, scene: sceneFilter });
    reopen = undefined;
    await showLines(0);
  };
  goTo = async (who, where) => {
    const next = await find(who);
    if (!next) return void vscode.window.showWarningMessage(`Lip Sync: the game has no lip synced lines for "${who}" in ${language}.`);
    current = next;
    sceneFilter = where?.scene?.trim() || undefined;
    reopen = where?.clip;
    await showCharacter();
  };

  let asked = 0;
  p.webview.onDidReceiveMessage(async (m: any) => {
    try {
      if (m?.type === "ready") await showCharacter();
      else if (m?.type === "more") await showLines(Number(m.offset) || 0);
      else if (m?.type === "filter") {
        sceneFilter = String(m.scene ?? "").trim() || undefined;
        await showLines(0);
      } else if (m?.type === "pick") {
        const next = typeof m.character === "string" ? await find(m.character) : await pickCharacter(call, language);
        if (next) {
          current = next;
          sceneFilter = undefined;
          await showCharacter();
        }
      } else if (m?.type === "speak") {
        // Add a Line: the words, spoken by EDGEwave in this character's voice, then turned into mouth shapes
        // from when each letter is spoken, and played on the head. Nothing is written into a project.
        const words = String(m.text ?? "").trim();
        if (!words || !current) return;
        if (!host.speak) return void post({ type: "made", error: "EDGEwave makes the voice: install it to add a line." });
        const mine = ++asked;
        const started = Date.now();
        post({ type: "made", busy: "Voicing the line" });
        const spoken = await host.speak({ text: words, character: current.voiceTag, take: m.take === "new" ? "new" : undefined });
        if (mine !== asked) return;
        if ("reason" in spoken) return void post({ type: "made", error: spoken.reason });
        const name = `made_${mine}`;
        const clip = speechClip(spoken.timings, { name, seconds: spoken.seconds });
        // The head: this character's own, from the rig its first lip synced scene names; else a plain one.
        const first = (await lipsyncLines(call, { character: current.id, language, limit: 1 }).catch(() => undefined))?.scenes[0]?.rig;
        post({
          type: "made",
          words,
          clip,
          said: clip.events.map((e) => e.shape).join(" "),
          voice: spoken.voice?.name ?? spoken.voice?.id,
          take: spoken.take,
          cached: !!spoken.cached,
          notes: spoken.notes ?? [],
        });
        post({ type: "audio", clip: name, mime: "audio/wav", base64: fs.readFileSync(spoken.wav).toString("base64") });
        // ("plain" is no rig: the head falls back to the plain one.)
        void showHead(first ?? shownRig ?? "plain");
        host.log(`Lip Sync: made "${words}", ${clip.events.length} shapes, ${clip.tracks.length} tracks, ${Date.now() - started} ms${spoken.cached ? " (a kept take)" : ""}`);
      } else if (m?.type === "open") {
        const mine = ++asked;
        const started = Date.now();
        // The curves and the voice at once; whichever comes first shows first.
        const audio =
          m.audio
            ? host.sound(String(m.audio)).then(
                (a) => mine === asked && post({ type: "audio", clip: m.clip, mime: a.mime, base64: Buffer.from(a.data).toString("base64") }),
                (e) => mine === asked && post({ type: "audio", clip: m.clip, error: message(e) }),
              )
            : Promise.resolve(post({ type: "audio", clip: m.clip, error: "This line has no voice file in this language." }));
        const clip = await lipsyncClip(call, { set: String(m.set), clip: String(m.clip) });
        if (mine === asked) post({ type: "clip", data: clip });
        if (mine === asked) void showHead(clip.rig);
        // Other versions of this line's lip sync, to switch to on the same voice and head: clips kept as
        // JSON under the cache's `versions\<clip name>\` (the A2F spike writes Audio2Face's there).
        if (mine === asked) {
          const dir = path.join(lipsyncCacheDir(), "versions", String(m.clip));
          const versions = fs.existsSync(dir)
            ? fs.readdirSync(dir).filter((f) => f.toLowerCase().endsWith(".json")).sort().flatMap((f) => {
                try {
                  return [{ name: f.slice(0, -5), clip: JSON.parse(fs.readFileSync(path.join(dir, f), "utf8")) }];
                } catch {
                  return [];
                }
              })
            : [];
          if (versions.length) post({ type: "versions", clip: m.clip, versions });
        }
        host.log(`Lip Sync: ${m.clip}, ${clip.tracks.length} of ${clip.trackCount} tracks move, ${Date.now() - started} ms`);
        await audio;
      }
    } catch (e) {
      host.log(`Lip Sync: ${message(e)}`);
      post({ type: "error", text: message(e) });
    }
  });
  p.webview.html = lipsyncHtml(p.webview.cspSource, fs.existsSync(host.headScript) ? p.webview.asWebviewUri(vscode.Uri.file(host.headScript)).toString() : undefined);
}
