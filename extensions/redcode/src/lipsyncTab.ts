// The Lip Sync tab (docs/lipsync.md, FL1 See): pick a character, see its lip synced lines by scene, hear a line
// and see its clip as curves. The reading is core's (src/core/lipsync), which the MCP server shares; this file
// is the tab and its messages. The audio comes from REDcode (its API's sound()), so without REDcode the curves
// still show and play silently.

import * as vscode from "vscode";
import * as fs from "node:fs";
import * as path from "node:path";
import { headModel, lipsyncCacheDir, lipsyncCharacters, lipsyncClip, lipsyncLines, speechClip, DefaultLanguage, type LineTimings, type LipsyncCharacter } from "./core";
import type { BridgeCall } from "@edgemodders/edgemat-core";
import { lipsyncHtml } from "./lipsyncPage";

export interface LipSyncHost {
  log(line: string): void;
  /** REDbridge for the tab's life: REDcode's, or one of our own that `stop` ends. */
  bridge(): Promise<{ call: BridgeCall; stop?: () => void }>;
  /** A game sound file as audio a webview decodes (REDcode's sound()); undefined when REDcode isn't there. */
  sound?: (gamePath: string) => Promise<{ data: Uint8Array; mime: string }>;
  /** The extension's folder, for the head viewer's script (dist/webview); without it the tab shows the sketch. */
  extensionPath?: string;
  /** Speaks a new line in a character's voice, with when each letter is spoken: EDGEwave's speakLine (its #13).
   *  The voice, the key, the consent and the cost are EDGEwave's; a refusal comes back as a reason in plain words. */
  speak?: (request: { text: string; character: string; take?: "new" }) => Promise<SpokenLine | { reason: string }>;
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
let tell: ((m: unknown) => void) | undefined;

/** Asks which character, by voice tag: the ones with the most lip synced scenes first. */
async function pickCharacter(call: BridgeCall, language: string): Promise<LipsyncCharacter | undefined> {
  const all = await lipsyncCharacters(call, { language });
  const picked = await vscode.window.showQuickPick(
    all.map((c) => ({ label: pretty(c.voiceTag), description: c.voiceTag, detail: `${c.scenes} ${c.scenes === 1 ? "scene" : "scenes"} with lip sync`, character: c })),
    { title: "EDGEfab: whose lip sync?", placeHolder: `Type a name: judy, panam, jackie ... (${all.length} characters speak in ${language})`, matchOnDescription: true },
  );
  return picked?.character;
}

/** Brings the tab back after a window reload: VS Code hands over the panel it kept and what the page saved
 *  (the character, and the line that was open). A tab that can't come back is closed. */
export async function restoreLipSync(host: LipSyncHost, kept: vscode.WebviewPanel, saved: unknown): Promise<void> {
  const state = (saved ?? {}) as { character?: unknown; clip?: unknown };
  if (panel || typeof state.character !== "string") return void kept.dispose();
  await openLipSync(host, state.character, { panel: kept, clip: typeof state.clip === "string" ? state.clip : undefined });
}

/** Opens the Lip Sync tab, on `character` (a voice tag) when given, else on the one the modder picks.
 *  `restored` is a panel VS Code kept over a reload, with the line to open again. */
export async function openLipSync(host: LipSyncHost, character?: string, restored?: { panel: vscode.WebviewPanel; clip?: string }): Promise<void> {
  if (panel) {
    panel.reveal();
    if (character) tell?.({ type: "pick", character });
    return;
  }
  let bridge: Awaited<ReturnType<LipSyncHost["bridge"]>>;
  try {
    bridge = await vscode.window.withProgress({ location: vscode.ProgressLocation.Notification, title: "EDGEfab: reading the game's lip sync" }, () => host.bridge());
  } catch (e) {
    void vscode.window.showErrorMessage(`EDGEfab: Lip Sync needs the game's files through REDbridge: ${message(e)}`);
    restored?.panel.dispose();
    return;
  }
  const call = bridge.call;
  const language = DefaultLanguage;
  let current: LipsyncCharacter | undefined;
  let sceneFilter: string | undefined;
  try {
    if (character) current = (await lipsyncCharacters(call, { language })).find((c) => c.voiceTag === character || c.id === character);
    // A restored tab never asks who: without its character it closes.
    if (!restored) current ??= await pickCharacter(call, language);
  } catch (e) {
    bridge.stop?.();
    restored?.panel.dispose();
    host.log(`Lip Sync: ${message(e)}`);
    void vscode.window.showErrorMessage(`EDGEfab: ${message(e)}${/anims\.info|method/i.test(message(e)) ? " Lip Sync needs REDbridge 0.14.0 or later." : ""}`);
    return;
  }
  if (!current || panel) {
    bridge.stop?.();
    restored?.panel.dispose();
    return;
  }

  // The page may load two kinds of file: the head viewer's script from the extension, and heads from the cache.
  const webviewDir = host.extensionPath ? path.join(host.extensionPath, "dist", "webview") : undefined;
  const headsDir = path.join(lipsyncCacheDir(), "heads");
  const localResourceRoots = [...(webviewDir ? [vscode.Uri.file(webviewDir)] : []), vscode.Uri.file(headsDir)];
  const p = (panel = restored?.panel ?? vscode.window.createWebviewPanel("edgefab.lipsync", "Lip Sync", vscode.ViewColumn.Active, { enableScripts: true, retainContextWhenHidden: true, localResourceRoots }));
  if (restored) p.webview.options = { enableScripts: true, localResourceRoots };
  // After a reload, the line that was open: the page opens it again once its scene is listed.
  let reopen = restored?.clip;
  const post = (tell = (m: unknown) => void p.webview.postMessage(m));

  // The head for a clip: the one its lip sync set's rig belongs to, else the plain head of that gender. Read and
  // exported once a rig, then sent to the page when the rig changes.
  let shownRig: string | undefined;
  const showHead = async (rig: string | undefined) => {
    if (!webviewDir || !rig || rig === shownRig) return;
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
    tell = undefined;
    bridge.stop?.();
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
    post({ type: "character", character: { ...current, name: pretty(current.voiceTag) }, language, audio: !!host.sound, reopen });
    reopen = undefined;
    await showLines(0);
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
        const next = typeof m.character === "string" ? (await lipsyncCharacters(call, { language })).find((c) => c.voiceTag === m.character || c.id === m.character) : await pickCharacter(call, language);
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
          m.audio && host.sound
            ? host.sound(String(m.audio)).then(
                (a) => mine === asked && post({ type: "audio", clip: m.clip, mime: a.mime, base64: Buffer.from(a.data).toString("base64") }),
                (e) => mine === asked && post({ type: "audio", clip: m.clip, error: message(e) }),
              )
            : Promise.resolve(post({ type: "audio", clip: m.clip, error: m.audio ? "Install REDcode to hear the line: it decodes the game's voice files." : "This line has no voice file in this language." }));
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
  p.webview.html = lipsyncHtml(p.webview.cspSource, webviewDir ? p.webview.asWebviewUri(vscode.Uri.file(path.join(webviewDir, "lipsyncHead.js"))).toString() : undefined);
}
