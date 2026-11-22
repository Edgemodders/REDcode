# The Lip Sync editor, moved from EDGEfab

Moved here on 2026-11-22 at the owner's word. EDGEfab now covers props and clothing only, and the Lip Sync editor goes to REDcode. This branch holds it as EDGEfab had it, in this folder alone. **It is not wired into REDcode yet**: nothing outside `lipsync/` changed. Wiring it in, and when, is the REDcode session's and the owner's call.

The source is EDGEfab main as of the move: every file under `extensions/edgefab/src/core/lipsync`, the tab, the head viewer, the scripts, the spikes and the two research pages. The extracts of EDGEfab's own wiring are in [wiring.md](wiring.md). EDGEfab's git history has the full story: `git log -- extensions/edgefab/src/core/lipsync docs/lipsync.md` in EDGEfab.

## What it does

| Part | What |
|---|---|
| See (FL1) | A character's lip synced lines, scene by scene (by voice tag), with each line's words, voice and length. One line's clip as curves. A timeline with play, a draggable marker and a volume slider |
| The head (R-face) | The line plays in 3D on the head it was made for. The solver is EDGEfab's own (`faceSolve.ts`), written from the rules in plain words and never from WolvenKit's GPL Blender add-on: keep it that way. The head comes from `project.export`, drawn with three.js 0.170.0 (MIT) |
| Add a Line | Type a new line. EDGEwave's `speakLine` (EDGEwave #13, on its main, not released) voices it with ElevenLabs and gives each letter's timing. `speech.ts` turns letters into mouth shapes and the game's lip sync tracks, and the new line plays on the head |
| Versions (A2F) | Lip sync from NVIDIA's Audio2Face-3D (`arkit.ts` maps its 52 ARKit shapes to the game's poses), shown beside the game's clip |
| Live (LS1, LS2) | Spikes for an NPC speaking a line made while the game runs: a number set through an anim feature in a copy of the face graph moves the jaw (LS1 passed in the game), and 13 whole mouth shapes (LS2, built, not run in the game) |
| MCP | `fab_lipsync_lines`, `fab_lipsync_line`, `fab_lipsync_make` (in wiring.md) |

## Where each file goes

| Here | Was in EDGEfab | Notes |
|---|---|---|
| `src/core/lipsync/` | `extensions/edgefab/src/core/lipsync/` | Pure Node, no VS Code. It uses only `BridgeCall` (a type from `@edgemodders/edgemat-core`: any REDbridge call function fits) and `dataDir()` from EDGEfab's `core/config.ts`, for the cache at `%LOCALAPPDATA%\EDGEfab\cache\lipsync`. Give it REDcode's own cache folder |
| `src/lipsyncTab.ts`, `src/lipsyncPage.ts` | `extensions/edgefab/src/` | The webview tab and its page. The tab takes a `LipSyncHost` (wiring.md): the bridge, EDGEwave's `speakLine`, a log. Its panel type was `edgefab.lipsync` and its command `edgefab.openLipSync` |
| `src/webview/lipsyncHead.ts`, `tsconfig.webview.json` | the same | The head viewer, bundled by esbuild into its own browser script (wiring.md, esbuild) |
| `scripts/` | `extensions/edgefab/scripts/lipsync*.mjs` | The tests: `lipsync.mjs` (FL1), `lipsync-face.mjs`, `lipsync-speech.mjs`, and the builders of the LS1 and LS2 archives |
| `spikes/` | `tools/spikes/` | `a2f/` (the Audio2Face runs), `ls1-jaw/` and `ls2-shapes/` (REDnode test apps) |
| `docs/lipsync.md`, `docs/faces.md` | `docs/` | The research and the review of what was built. faces.md is about NPC faces in general (expressions, moods, lip sync) |
| `docs/testing.md` | EDGEfab's `docs/testing.md` | The six lip sync tests and every run |

## Where it stands

| Test | Result |
|---|---|
| FL1, reading the game (without VS Code) | Passed. **The tab in VS Code, with the voice: not run** |
| Spike LS1, the jaw on command | **Passed in the game** 2026-11-20 (the owner): an anim feature moves the jaw. `SetInputFloat` does nothing |
| Spike LS2, mouth shapes | The archive builds. **In the game: not run** |
| The head in the tab (without VS Code) | Passed. **The tab in VS Code: not run** |
| Add a Line | Steps 1 and 2 passed. Step 3 ran (the owner, 2026-11-21): it works, but the voice wasn't the character's and the mouth was exaggerated. The shapes were retuned to the game's range since, not seen again |
| Spike A2F | The owner: "Audio2Face reads better" than the game's clip. Full strength was too extreme, and the lips didn't round on "you" and "go". Of the three models run since, the newest (`multi`) rounds and closes the lips far more. **The owner's second look: not run** |

None of it was ever released: it sat under Unreleased in EDGEfab's changelog (lines in wiring.md).

## Left on the owner's PC

| What | Where |
|---|---|
| The LS2 test archive and app | `edgefab_ls2_shapes.archive` in the game's `archive\pc\mod`, the app `edgefab-ls2-shapes` in REDnode's apps folder. Both replace the women's face graph: take them out when the spikes are done |
| The Audio2Face container | Docker: container `a2f-nim`, network `a2f`, cache volume `a2f-cache`; the client image `edgefab-a2f-client` (`Tools\a2f`). Needs the owner's NGC key, never printed |
| The cache | `%LOCALAPPDATA%\EDGEfab\cache\lipsync` (heads, clips, the A2F versions under `versions\<clip name>\`) |

## Open, from EDGEfab's notes

- How the fit gets timings for the game's own lines without uploading them: a local aligner, shipped fitted numbers, or no alignment.
- Writing a made line into a project waits on REDbridge #14's `.anims` import keeping float tracks (on REDbridge's main).
- Next on the list was V's female head with a Change Head button, the scene's actor for minor characters' heads, the head's textures, eyes and hair, and the mood under a line.
- EDGEwave #13 (`speakLine`) was filed for this editor. Its consumer is now REDcode, which EDGEfab has said on #13.
