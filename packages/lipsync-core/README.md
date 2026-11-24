# @edgemodders/lipsync-core

Lip sync for Cyberpunk 2077, for the EDGE tools. REDcode's Lip Sync editor and its MCP server use it. The design is at https://edgemodders.github.io/REDcode/design/lipsync.html and the research behind it at https://edgemodders.github.io/REDcode/research/lipsync.html.

It reads the game's own lip sync through [REDbridge](https://github.com/Edgemodders/REDbridge), gives a head to play a line on, and makes lip sync for a new line from when each letter is spoken. Node 18 or later, no dependencies. It needs REDbridge 0.16.0 or later and the game. Not published to npm yet. It was made in EDGEfab and moved to REDcode on 2026-11-22.

```js
import { callOf, headModel, lipsyncCharacters, lipsyncClip, lipsyncLines, setLipsyncCacheDir, speechClip } from "@edgemodders/lipsync-core";

const call = callOf(redbridge);               // REDcode's BridgeClient, or REDnode's kernel.bridge()
setLipsyncCacheDir(cacheDir);                 // exported heads and clips are kept here: game data, never in a project

const who = await lipsyncCharacters(call, { find: "judy" });
const lines = await lipsyncLines(call, { character: "judy", limit: 12 });
const line = lines.scenes[0].lines[0];        // { clip: "f_...", text, audio: "...wem", seconds }
const clip = await lipsyncClip(call, { set: lines.scenes[0].set, clip: line.clip });
const head = await headModel(call, { rig: clip.rig });   // meshes as .glb and the face setup for faceSolver

const made = speechClip(timings, { seconds }); // timings as EDGEwave's speakLine gives them
```

| Part | |
|---|---|
| `lipsyncCharacters`, `lipsyncCharacter`, `voiceTags` | The characters with lip sync in a language. The game keys lip sync by voice tag (`judy`, `panam`), not by head |
| `lipsyncLines` | A character's lines scene by scene, a page at a time: each line's clip, words, voice file and length |
| `lipsyncClip`, `sampleTrack`, `trackGroups` | One line's clip as curves: every track that moves, sorted into `lipsync`, `override`, `control`, `pose` and `wrinkle` |
| `lipsyncOfVoice`, `lipsyncOfSet`, `lipsyncOfClip`, `lineOfVoice`, `lineOfClip`, `lipsyncSetLanguage` | From a voice file, a lip sync set or a clip's name to whose line it is and where |
| `headModel`, `headOfRig`, `headParts`, `faceSetupCached`, `readFaceSetup`, `rigGender`, `DefaultHeads` | A head from the game: its meshes exported on the face rig, and its facial setup in the solver's shape |
| `faceSolver`, `clipValues`, `boneToGltf` | The face solver: a head's 414 track values in, its bones out. Pure, so a page runs the same file. Written from the rules in plain words; no code from WolvenKit or its Blender add-on (both GPL) was read into it: keep it that way |
| `speechClip`, `mouthEvents`, `shapeWeights`, `MouthShapes` | Lip sync from when each letter of a line is spoken: 13 mouth shapes, then the game's tracks |
| `arkitClip`, `ArkitToPose` | Audio2Face's 52 ARKit shapes as the game's poses |
| `callOf`, `setLipsyncCacheDir`, `lipsyncCacheDir` | The bridge call and the cache folder |

## Checks

Against the game, never in CI, and nothing they read or write is committed. They find REDbridge and the game from `REDBRIDGE_EXE` and `REDCODE_GAME_PATH`, else from VS Code's settings (`redcode.bridgePath`, `redcode.gamePath`). Build this package and the extension (for its bridge client) first.

| Script | Checks |
|---|---|
| `node scripts/check-lines.mjs [<outFolder>]` | The characters, one scene's lines, one clip as curves, and the ways in from a voice file and a set |
| `node scripts/check-face.mjs [<outFolder>]` | A head's parts, setup and meshes, and the solver on numbers and on a real line |
| `node scripts/check-speech.mjs ["<words>"]` | Words with letter timings into mouth shapes and a clip. No game |

The spikes for lip sync made while the game runs, and for Audio2Face, are in the repository's `tools/probes/lipsync-live` and `tools/probes/lipsync-a2f`.
