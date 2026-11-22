# How EDGEfab wired the Lip Sync editor in (extracts, EDGEfab main 8a9184f)

## extension.ts: the host the tab needs (REDcode's bridge, EDGEwave's speakLine, the log)

```ts
/** What the Lip Sync tab needs from the extension. REDcode is looked for at each call, not once: after a
 *  window reload the tab can come back before REDcode has started. */
function lipSyncHost(): LipSyncHost {
  return {
    log,
    // REDcode's REDbridge when REDcode runs, else one of our own that ends with the tab.
    bridge: async () => {
      const shared = redcode()?.bridge();
      if (shared) return { call: callOf(shared) };
      const own = await startBridge(log);
      return { call: own.call, stop: () => own.client.stop() };
    },
    sound: async (gamePath) => {
      const api = redcode();
      if (typeof api?.sound !== "function") throw new Error("REDcode plays the voice: install it, or open the line again once it has started.");
      return api.sound({ path: gamePath });
    },
    extensionPath: extensionUri?.fsPath,
    // EDGEwave speaks a new line (its speakLine, EDGEwave #13). It is started here if it is installed and not
    // yet running: asking for a line is the modder asking for it.
    speak: async (request) => {
      const wave = vscode.extensions.getExtension<{ apiVersion?: number; speakLine?: (o: Record<string, unknown>) => Promise<SpokenLine | { reason: string }> }>("edgemodders.edgewave");
      if (!wave) return { reason: "EDGEwave makes the voice: install EDGEwave to add a line." };
      const api = wave.isActive ? wave.exports : await wave.activate();
      if (typeof api?.speakLine !== "function") {
        // Which EDGEwave answered, since an installed one and a development build can both be on the machine.
        log(`Lip Sync: EDGEwave ${wave.packageJSON?.version} at ${wave.extensionPath} has no speakLine (its API has: ${Object.keys(api ?? {}).join(", ") || "nothing"})`);
        return { reason: `The EDGEwave that is running (${wave.packageJSON?.version}, from ${wave.extensionPath}) can't speak a line with its timings yet: it needs a newer EDGEwave.` };
      }
      return api.speakLine({ ...request, by: "EDGEfab" });
    },
  };
}
```

## extension.ts: the command and the tab restored after a reload

```ts
import { openLipSync, restoreLipSync, type LipSyncHost, type SpokenLine } from "./lipsyncTab";
    vscode.commands.registerCommand("edgefab.openLipSync", (character?: unknown) => openLipSync(lipSyncHost(), typeof character === "string" ? character : undefined)),
    // The Lip Sync tab comes back after a window reload, on the character and line it showed.
    vscode.window.registerWebviewPanelSerializer("edgefab.lipsync", {
      deserializeWebviewPanel: async (panel, state) => restoreLipSync(lipSyncHost(), panel, state),
```

## package.json

```json
{
  "activationEvents": [
    "onWebviewPanel:edgefab.lipsync",
    "onCommand:edgefab.openLipSync"
  ],
  "commands": [
    {
      "command": "edgefab.openLipSync",
      "title": "Open Lip Sync",
      "category": "EDGEfab",
      "icon": "$(comment-discussion)"
    }
  ],
  "scripts": {
    "lipsync": "node scripts/lipsync.mjs",
    "lipsync:jaw": "node scripts/lipsync-live-jaw.mjs",
    "lipsync:shapes": "node scripts/lipsync-live-shapes.mjs",
    "lipsync:face": "node scripts/lipsync-face.mjs",
    "lipsync:speech": "node scripts/lipsync-speech.mjs"
  },
  "dependencies": {
    "three": "0.170.0",
    "@types/three": "0.170.0"
  }
}
```

## esbuild.mjs: the head's own bundle (the one script the webview loads from a file)

```js
  // The Lip Sync tab's head: three.js and the face solver for the tab's page, the one script a webview loads from a file.
  { bundle: true, platform: "browser", format: "iife", target: "es2022", minify: true, sourcemap: true, logLevel: "info", entryPoints: ["src/webview/lipsyncHead.ts"], outfile: "dist/webview/lipsyncHead.js" },
```

## core/index.ts: the exports

```ts
export {
  lineOfClip, lipsyncCacheDir, lipsyncCharacter, lipsyncCharacters, lipsyncClip, lipsyncLines, sampleTrack, trackGroups, voiceTags, DefaultLanguage, LipsyncError,
  type LipsyncCharacter, type LipsyncClip, type LipsyncLine, type LipsyncLines, type LipsyncScene, type LipsyncTrack, type TrackGroup,
} from "./lipsync";
export { mouthFeatureFields, MouthFeature, MouthShapes, type MouthShape } from "./lipsync/shapes";
export { arkitClip, ArkitToPose, type ArkitOptions, type ShapeFrame } from "./lipsync/arkit";
export { mouthEvents, shapeWeights, speechClip, DefaultSpeechTiming, type LineTimings, type MouthEvent, type SpeechTiming } from "./lipsync/speech";
export { faceSetupCached, headModel, headOfRig, headParts, readFaceSetup, rigGender, DefaultHeads, type HeadModel, type HeadParts } from "./lipsync/face";
export { boneToGltf, clipValues, faceSolver, type ClipTracks, type FaceChanges, type FacePart, type FaceSetup } from "./lipsync/faceSolve";
```

## The MCP tools (packages/edgefab-mcp/src/server.ts): fab_lipsync_lines, fab_lipsync_line, fab_lipsync_make

```ts
// Lip sync, the reading half (docs/lipsync.md, FL1): the twins of the Lip Sync tab.
server.registerTool(
  "fab_lipsync_lines",
  {
    description:
      "Lip sync, reading the game (the extension's Lip Sync tab): a character's lip synced lines, scene by scene, each with its clip name (f_<HEX> or m_<HEX>, from the line's string id), words, voice file (.wem game path), length and the clip set it is in. " +
      "The game keys lip sync by voice tag (judy, panam, angelica_whelan), not by head: one clip plays on any head. Without character it lists the characters that have lip sync, most scenes first; find narrows them by name. " +
      "Scenes come a page at a time (V has hundreds): offset and limit, with total. Voice sets (gameplay barks) are scenes too. Needs REDbridge 0.14.0 and the game folder; the first call starts REDbridge (about 5 seconds). " +
      "fab_lipsync_line then reads one line's clip as curves.",
    inputSchema: {
      character: z.string().optional().describe("The voice tag's name or id; a part of a name works when only one character has it."),
      find: z.string().optional().describe("Without character: only the characters whose voice tag contains this."),
      scene: z.string().optional().describe("Only the scenes whose path contains this, such as mq306 or vset_."),
      language: z.string().default(DefaultLanguage).describe("The voice language, as the game names it: en-us, pl-pl, jp-jp, ..."),
      offset: z.number().int().min(0).default(0),
      limit: z.number().int().min(1).max(200).default(20).describe("Scenes per call (characters: this many names)."),
    },
  },
  async ({ character, find, scene, language, offset, limit }) => {
    try {
      const { call } = await getBridge();
      if (!character) {
        const all = await lipsyncCharacters(call, { language, find });
        return text({ language, total: all.length, offset, characters: all.slice(offset, offset + limit) });
      }
      return text(await lipsyncLines(call, { character, language, scene, offset, limit }));
    } catch (e) {
      return failure(e);
    }
  },
);

server.registerTool(
  "fab_lipsync_line",
  {
    description:
      "Lip sync, reading the game: one line's clip as curves (what the Lip Sync tab draws). Give the set and clip from fab_lipsync_lines. Answers the clip's length and, for every track that moves, its name, group, face part, " +
      "number of keys, lowest and highest value and when it peaks. Groups: 'lipsync' (<pose>LipsyncPoseOutput, what the clip drives, 0 to about 1: the mouth, and also brows, blinks and the throat; part says which), 'override' (<pose>AnimOverrideWeight, mostly the negative of its lipsync track: " +
      "it mutes other face animation), 'control' (lipSyncEnvelope, jaliJaw, jaliLips, muzzleLips, upperFace, ...), 'pose' (eyes, head and neck riding along) and 'wrinkle'. " +
      "tracks: names to get in full, as [seconds, value] keys; every: also each of those sampled at that many frames a second (30 is the game's), for comparing clips. About a third of a second a clip.",
    inputSchema: {
      set: z.string().describe("The clip set's game path (.anims), as fab_lipsync_lines gives it."),
      clip: z.string().describe("The clip's name in the set, such as f_2CE9C077837E0000."),
      tracks: z.array(z.string()).optional().describe("Track names to return with their keys, such as jaw_mid_openLipsyncPoseOutput; 'lipsync', 'control', 'override' or 'pose' for a whole group."),
      every: z.number().positive().max(120).optional().describe("Also sample the asked tracks at this many frames a second."),
    },
  },
  async ({ set, clip, tracks, every }) => {
    try {
      const { call } = await getBridge();
      const c = await lipsyncClip(call, { set, clip });
      const want = new Set((tracks ?? []).map((t) => t.toLowerCase()));
      return text({
        set: c.set, clip: c.clip, rig: c.rig, seconds: c.seconds, fps: c.fps, frames: c.frames, trackCount: c.trackCount,
        moving: c.tracks.map((t) => {
          let peak = 0;
          for (let i = 0; i < t.keys.length; i += 2) if (Math.abs(t.keys[i + 1]) > Math.abs(t.keys[peak + 1] ?? 0)) peak = i;
          const full = want.has(t.name.toLowerCase()) || want.has(t.group);
          const samples = full && every ? Array.from({ length: Math.floor(c.seconds * every) + 1 }, (_, i) => +sampleTrack(t, i / every).toFixed(4)) : undefined;
          const keys = full ? Array.from({ length: t.keys.length / 2 }, (_, i) => [t.keys[i * 2], t.keys[i * 2 + 1]]) : undefined;
          return { name: t.name, group: t.group, part: t.part, keys: t.keys.length / 2, min: t.min, max: t.max, peakAt: t.keys[peak], values: keys, samples };
        }),
        held: c.held,
      });
    } catch (e) {
      return failure(e);
    }
  },
);

server.registerTool(
  "fab_lipsync_make",
  {
    description:
      "Lip sync, making it: a spoken line into mouth shapes and the game's lip sync tracks, from when each letter is spoken (what the Lip Sync tab's Add a Line does). " +
      "Give the timings as EDGEwave's voice_speak_line returns them (characters, starts and ends in seconds from the audio's start, and spoken, which marks letters that are not said), or timingsFile, the file it keeps beside the WAV. " +
      "Answers the shapes in time (aa, eh, ee, oh, oo, mbp, fv, th, tdn, kg, sz, sh, r) and each lip sync track's keys; out writes the whole clip as JSON, in the shape of a game clip read by fab_lipsync_line. " +
      "No game, no network. The sounds come from spelling rules and a short word list, version 0: judge it on the head in the tab. Writing it into a project as an .anims comes later.",
    inputSchema: {
      timings: z
        .object({ characters: z.array(z.string()), starts: z.array(z.number()), ends: z.array(z.number()), spoken: z.array(z.boolean()).optional() })
        .optional()
        .describe("When each character is spoken."),
      timingsFile: z.string().optional().describe("A timings file from EDGEwave (<take>.timings.json), in place of timings."),
      seconds: z.number().positive().optional().describe("The audio's length, so the clip is as long."),
      out: z.string().optional().describe("A file to write the clip to, as JSON."),
    },
  },
  async ({ timings, timingsFile, seconds, out }) => {
    try {
      const read = timingsFile ? (JSON.parse(fs.readFileSync(timingsFile, "utf8")) as { timings?: LineTimings } & LineTimings) : undefined;
      const t: LineTimings | undefined = timings ?? read?.timings ?? read;
      if (!t || !Array.isArray(t.characters) || t.characters.length !== t.starts?.length || t.characters.length !== t.ends?.length) throw new Error("Give timings (characters, starts and ends, the same number of each) or a timingsFile.");
      const clip = speechClip(t, { seconds });
      if (out) fs.writeFileSync(out, JSON.stringify(clip));
      return text({
        seconds: clip.seconds,
        shapes: clip.events.map((e) => ({ shape: e.shape, start: +e.start.toFixed(3), end: +e.end.toFixed(3), letters: e.letters })),
        tracks: clip.tracks.map((k) => ({ name: k.name, keys: k.keys.length / 2, max: k.max })),
        out,
      });
    } catch (e) {
      return failure(e);
    }
  },
);

```

## Changelog lines (Unreleased in EDGEfab, never released)

- **Lip Sync: add a line.** Type a new line for the character in the Lip Sync tab and press Enter: EDGEwave speaks it in the character's voice (ElevenLabs, your own key), and EDGEfab makes the lip sync from the words and the voice's timing and plays both on the head. **New Take** speaks it again. It stays in the tab for now: writing it into a mod comes later. Needs EDGEwave with Speak a Line. For assistants, `fab_lipsync_make`.
- **Lip Sync: a volume slider** beside the play buttons, kept with the tab.
- **Lip Sync: the timeline.** Drag the marker along the curves; buttons and keys for play or pause (Space), a frame back or forward (arrows), the start and the end (Home, End). The curves scroll in their own box, and the tab comes back after a window reload.
- **Lip Sync: the head.** A line in the Lip Sync tab now shows on the head it was made on, in 3D: the mouth, jaw, brows and eyelids move with the voice as the game's own face solver would move them. Drag the head to turn it. The head is plain (no skin texture or hair yet). Needs REDbridge 0.16.0.
- **Lip Sync, a first look**: **EDGEfab: Open Lip Sync** asks for a character and opens a tab with every lip synced line the game has for them, scene by scene. Pick a line to hear it and see what the game's clip moves for it, as curves under the voice: jaw, lips, tongue, brows, blinks, throat. Point at a curve to read it; the game's own track names are one click away. Needs REDbridge 0.14.0; REDcode plays the voice. For assistants, `fab_lipsync_lines` and `fab_lipsync_line`. Making new lip sync comes later ([Made lip sync](https://edgemodders.github.io/EDGEfab/lipsync.html)).
