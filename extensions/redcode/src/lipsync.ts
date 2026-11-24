// The Lip Sync editor's wiring (docs/design/lipsync.md, L1): the command, the tab restored after a window
// reload, the ways in from the audio player and the animation view, and REDcodeApi.openLipSync. The tab itself
// is src/lipsyncTab.ts; the reading and the making are packages/lipsync-core.

import * as fs from "node:fs";
import * as path from "node:path";
import * as vscode from "vscode";
import { callOf, lineOfVoice, lipsyncOfClip, lipsyncOfSet, lipsyncOfVoice, lipsyncSetLanguage, setLipsyncCacheDir, type BridgeCall, type LipsyncPlace } from "../../../packages/lipsync-core/src/index";
import type { BridgeClient } from "./bridgeClient";
import { openLipSync, restoreLipSync, type LipSyncAt, type LipSyncHost, type SpokenLine } from "./lipsyncTab";

export interface LipSyncDeps {
  /** REDcode's REDbridge; throws in plain words when it is not running. */
  bridge(): BridgeClient;
  /** A game sound file as audio a webview decodes (REDcodeApi.sound). */
  sound(gamePath: string): Promise<{ data: Uint8Array; mime: string }>;
  log: vscode.OutputChannel;
  /** REDcode's global storage folder: the lip sync cache goes under its `cache\lipsync`. */
  storageDir: string;
  /** The extension's folder, for the head viewer's script. */
  extensionDir: string;
}

/** What the rest of REDcode asks of the Lip Sync editor. */
export interface LipSync {
  /** Opens the tab: on a character (a voice tag's name or id) and one of their lines (a clip's name) when given. */
  open(character?: string, clip?: string): Promise<void>;
  /** Whether a game path is a voice line the game may have lip sync for, by its name alone. */
  isVoice(gamePath: string): boolean;
  /** The lip sync of a voice file, or undefined when the game has no clip for that line. */
  ofVoice(gamePath: string): Promise<LipsyncPlace | undefined>;
  /** Opens the tab at a voice file's line; false when the game has no clip for it. */
  openVoice(gamePath: string): Promise<boolean>;
  /** Whether a game path is a lip sync set, by its path alone. */
  isSet(gamePath: string): boolean;
  /** Opens the tab at a lip sync set's character and scene, on `clip` when given; false when the game's lip
   *  sync map does not have the set. */
  openSet(gamePath: string, clip?: string): Promise<boolean>;
}

const message = (e: unknown) => (e instanceof Error ? e.message : String(e));
/** The scene filter that lists a scene: its file's name, or its hash when the name is not known. */
const sceneFilter = (scene: string) => /([^\\/]+)\.scene$/i.exec(scene)?.[1] ?? scene;

/** EDGEfab's cache of Audio2Face versions, moved over once (docs/design/lipsync.md, decision 3). The heads and
 *  clips beside them are exports and are made again on first use, so they stay behind. */
function moveVersions(cacheDir: string, log: vscode.OutputChannel): void {
  const old = path.join(process.env.LOCALAPPDATA ?? "", "EDGEfab", "cache", "lipsync", "versions");
  const mine = path.join(cacheDir, "versions");
  try {
    if (!process.env.LOCALAPPDATA || !fs.existsSync(old) || fs.existsSync(mine)) return;
    fs.mkdirSync(cacheDir, { recursive: true });
    fs.cpSync(old, mine, { recursive: true });
    fs.rmSync(old, { recursive: true, force: true });
    log.appendLine(`Lip Sync: moved the lip sync versions from ${old} to ${mine}`);
  } catch (e) {
    log.appendLine(`Lip Sync: the lip sync versions in ${old} were not moved: ${message(e)}`);
  }
}

export function registerLipSync(context: vscode.ExtensionContext, deps: LipSyncDeps): LipSync {
  const cacheDir = path.join(deps.storageDir, "cache", "lipsync");
  setLipsyncCacheDir(cacheDir);
  moveVersions(cacheDir, deps.log);

  // One call function for the tab's life and the core's lists, on whichever bridge runs now.
  const call: BridgeCall = (method, params) => callOf(deps.bridge())(method, params);
  const host: LipSyncHost = {
    log: (line) => deps.log.appendLine(line),
    call,
    sound: deps.sound,
    headScript: path.join(deps.extensionDir, "media", "lipsync", "head.js"),
    // EDGEwave speaks a new line (its speakLine, EDGEwave #13). It is started here if it is installed and not
    // yet running: asking for a line is the modder asking for it.
    speak: async (request) => {
      const wave = vscode.extensions.getExtension<{ speakLine?: (o: Record<string, unknown>) => Promise<SpokenLine | { reason: string }> }>("edgemodders.edgewave");
      if (!wave) return { reason: "EDGEwave makes the voice: install EDGEwave to add a line." };
      const api = wave.isActive ? wave.exports : await wave.activate();
      if (typeof api?.speakLine !== "function") {
        // Which EDGEwave answered, since an installed one and a development build can both be on the machine.
        deps.log.appendLine(`Lip Sync: EDGEwave ${wave.packageJSON?.version} at ${wave.extensionPath} has no speakLine (its API has: ${Object.keys(api ?? {}).join(", ") || "nothing"})`);
        return { reason: `The EDGEwave that is running (${wave.packageJSON?.version}) can't speak a line with its timings yet: it needs a newer EDGEwave.` };
      }
      return api.speakLine({ ...request, by: "REDcode" });
    },
  };

  const failed = (e: unknown) => {
    deps.log.appendLine(`Lip Sync: ${message(e)}`);
    void vscode.window.showErrorMessage(`Lip Sync: ${message(e)}`);
  };
  const openAt = (place: LipsyncPlace, clip = place.clip) => openLipSync(host, place.character.id, { clip, scene: sceneFilter(place.scene) });

  const lipSync: LipSync = {
    async open(character, clip) {
      let at: LipSyncAt | undefined;
      if (character && clip) {
        // The line's scene, so the tab lists it; a clip the game does not have opens the character alone.
        const place = await lipsyncOfClip(call, character, clip).catch(() => undefined);
        if (place) return openAt(place);
        at = { clip };
      }
      return openLipSync(host, character, at);
    },
    isVoice: (gamePath) => lineOfVoice(gamePath) !== undefined,
    ofVoice: (gamePath) => lipsyncOfVoice(call, gamePath),
    async openVoice(gamePath) {
      const place = await lipsyncOfVoice(call, gamePath);
      if (place) await openAt(place);
      return !!place;
    },
    isSet: (gamePath) => lipsyncSetLanguage(gamePath) !== undefined,
    async openSet(gamePath, clip) {
      const place = await lipsyncOfSet(call, gamePath);
      if (place) await openAt(place, clip);
      return !!place;
    },
  };

  context.subscriptions.push(
    vscode.commands.registerCommand("redcode.openLipSync", (character?: unknown, clip?: unknown) =>
      lipSync.open(typeof character === "string" ? character : undefined, typeof clip === "string" ? clip : undefined).catch(failed),
    ),
    // The Lip Sync tab comes back after a window reload, on the character and line it showed.
    vscode.window.registerWebviewPanelSerializer("redcode.lipsync", {
      deserializeWebviewPanel: async (panel, state) => {
        try {
          // After a reload the tab can come back before REDbridge has started: give it half a minute.
          for (let i = 0; i < 60; i++) {
            try {
              deps.bridge();
              break;
            } catch {
              await new Promise((r) => setTimeout(r, 500));
            }
          }
          await restoreLipSync(host, panel, state);
        } catch (e) {
          deps.log.appendLine(`Lip Sync: the tab did not come back: ${message(e)}`);
          panel.dispose();
        }
      },
    }),
  );
  return lipSync;
}
