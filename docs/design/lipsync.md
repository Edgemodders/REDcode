---
title: Lip Sync
---

# Lip Sync: the Lip Sync editor in REDcode

Draft 0.1, 2026-11-22, for the owner. On 2026-11-22 the owner moved the Lip Sync editor from EDGEfab to REDcode. EDGEfab now covers props and clothing only. EDGEfab's session pushed the editor, as EDGEfab had it, to the branch `lipsync` (6303a5b), all in one folder, `lipsync/`. Nothing there is wired into REDcode yet. The owner's plan is to merge the branch into `main` after the REDcode release now being tested, and then keep building it here.

This page says where each part goes in REDcode, how a modder reaches it, and what comes after the merge. The editor itself is described in its research page, `lipsync/docs/lipsync.md` on the branch (docs/research/lipsync.md after the merge). `lipsync/README.md` lists what each file is, and `lipsync/wiring.md` holds EDGEfab's wiring as extracts.

## The rule this follows

REDcode takes over editors that make sense for it (the owner, 2026-11-22), each reached through commands. It still keeps its own basic view of every file: the deeper editor adds to that view and never replaces it. For lip sync:

- **The basic view stays.** A lip sync `.anims` set still opens in the animation view, with its clips and their float tracks.
- **The deeper editor is a command.** Open Lip Sync shows a character's lines, plays a line on its head, and adds new lines.

## What it is, as built in EDGEfab

| Part | What it does | Where it stands |
|---|---|---|
| See (FL1) | A character's lip synced lines, scene by scene (by voice tag), each with its words, voice and length. One line's clip as curves, under a timeline with play, a draggable marker and a volume slider | Passed without VS Code. **The tab in VS Code: not run** |
| The head (R-face) | The line plays in 3D on the head it was made for, through EDGEfab's own face solver (`faceSolve.ts`). The solver was written from the rules in plain words, never from WolvenKit's GPL Blender add-on | Passed without VS Code. **The tab: not run** |
| Add a Line | A typed line, voiced by EDGEwave's `speakLine` (EDGEwave #13) with each letter's timing. `speech.ts` turns the letters into mouth shapes and the game's lip sync tracks, and the line plays on the head | Steps 1 and 2 passed. In step 3 (the owner, 2026-11-21) the voice wasn't the character's and the mouth was exaggerated. The shapes were retuned since; the result hasn't been seen again |
| Versions (A2F) | Lip sync from NVIDIA's Audio2Face-3D, shown beside the game's clip (`arkit.ts` maps its 52 ARKit shapes to the game's poses) | The owner: "Audio2Face reads better" than the game's clip. **The owner's second look, at the newer `multi` model: not run** |
| Live (LS1, LS2) | Spikes: an NPC speaking a line made while the game runs | LS1 (the jaw) **passed in the game** 2026-11-20. LS2 (13 mouth shapes) is built; **not run in the game** |
| MCP | `fab_lipsync_lines`, `fab_lipsync_line`, `fab_lipsync_make` | Ran in EDGEfab's MCP server |

None of it was ever released.

## Decisions for the owner

| # | Question | Recommendation |
|---|---|---|
| 1 | Where does the core live? | **A package, `packages/lipsync-core`** (`@edgemodders/lipsync-core`, not published), as `anim-core` is. It is pure Node already. The extension, redcode-mcp and a future REDnode pack for live lip sync can then all use it, and the pack works without VS Code, as Animation Tools does. The other choice is `extensions/redcode/src/lipsync/`, which only the extension and the MCP server could use |
| 2 | How does a modder open it? | **Open Lip Sync**, a command and a Lip Sync tab, plus links from what they already open (below). No sidebar view of its own: the character picker inside the tab is enough |
| 3 | What happens to EDGEfab's cache? | **Start afresh** in REDcode's own cache, `<global storage>\cache\lipsync`, beside `cache\anim`. The heads and clips are exports and are made again on first use. The A2F versions under `%LOCALAPPDATA%\EDGEfab\cache\lipsync\versions` are moved over once, when that folder exists |
| 4 | What are the MCP tools called? | **`lipsync_lines`, `lipsync_line`, `lipsync_make`** in redcode-mcp, the same tools with REDcode's naming (as `anim_*` and `loc_*`). EDGEfab's MCP server no longer has them |

## How a modder reaches it

| From | What it does |
|---|---|
| The Command Palette: **REDcode: Open Lip Sync** | Asks for a character (voice tags, most scenes first, with a filter), then opens the tab |
| The audio player, on a voice line (`base\localization\<language>\vo\...wem`) | A **Lip Sync** button, when the game has a clip for that line, opens the tab at that line |
| The animation view of a lip sync set | **Open in Lip Sync** in its bar opens the tab at the shown clip's line. The animation view stays the file's basic view |
| LocKeys | Not in L1. A voiced entry could later offer its line's lip sync |
| `REDcodeApi.openLipSync(character?, clip?)` | For other tools, such as EDGEquest or EDGEbuilder's scenes. Since the release with L1; check for it with `typeof` first |

## Where each file goes

| On the branch | In REDcode |
|---|---|
| `src/core/lipsync/*.ts` | `packages/lipsync-core/src/` (decision 1). `BridgeCall` becomes anim-core's `Bridge` type, through `asBridge`, so REDcode's `BridgeClient` fits as it is. `dataDir()` becomes a `cacheDir` the caller gives |
| `src/lipsyncTab.ts`, `src/lipsyncPage.ts` | `extensions/redcode/src/lipsyncTab.ts` and `src/lipsyncPage.ts`. The panel type becomes `redcode.lipsync` and the command `redcode.openLipSync`. Its serializer brings the tab back after a reload |
| `src/webview/lipsyncHead.ts` | `extensions/redcode/webview/lipsyncHead.ts`, its own browser bundle in `esbuild.mjs`, on the three.js 0.170.0 REDcode already bundles. Its tsconfig joins `webview/tsconfig.json` |
| The host (`wiring.md`) | Simpler in REDcode: the bridge is REDcode's own, with no second REDbridge. The voice plays through REDcode's audio code directly, not through `REDcodeApi.sound`. Only `speakLine` is another tool's, EDGEwave's, through `extensions.getExtension("edgemodders.edgewave")`, called with `by: "REDcode"` |
| `scripts/lipsync*.mjs` | `packages/lipsync-core/scripts/` (the checks against the game) and `tools/probes/lipsync-live/` (the LS1 and LS2 builders) |
| `spikes/a2f`, `spikes/ls1-jaw`, `spikes/ls2-shapes` | `tools/probes/lipsync-a2f/` and `tools/probes/lipsync-live/`, beside Probe A and Probe D |
| `docs/lipsync.md`, `docs/faces.md` | `docs/research/lipsync.md` and `docs/research/faces.md`, added to the nav |
| `docs/testing.md` | Its six tests, with every run, join REDcode's `docs/testing.md` under **Lip Sync** |
| The MCP tools | `packages/redcode-mcp/src/server.ts` (decision 4) |
| The changelog lines | Under Unreleased in REDcode's CHANGELOG, written again for REDcode, in the release that carries L1 |

The ThirdPartyNotices need no new entry: three.js is already in them, and the core adds no other package.

## Phases

| Phase | What | Needs |
|---|---|---|
| **L1: merge and wire** | After this REDcode release: merge `lipsync`, move each file to its place (above), wire the command, the tab, the two links and the MCP tools. The checks without VS Code run again from their new places. Then the tab's first hand test in VS Code, which never ran in EDGEfab: see, the head, Add a Line | REDbridge 0.16.0 for the head (REDcode's minimum is 0.18.0 already). EDGEwave with `speakLine` for Add a Line (EDGEwave #13: on its main, released with EDGEwave 0.3.0?, **unverified**) |
| L2: write a made line into a project | Add a Line's clip as the game's lip sync `.anims`, named and registered like the game's, so it plays in the game. Probably through `anim-core`'s `addClip` | REDbridge's `.anims` import keeping float tracks (REDbridge #14, open; whether its float track part is on main or released is **unverified**). Its own short design page |
| L3: Audio2Face as a choice | The A2F version as a way to make a line's lip sync, beside the letter timing | A local Docker container and the modder's NVIDIA NGC key (a key store service, `ngc`?). Its own page; it may stay a power-user path |
| L4: live lip sync | LS2 in the game, then perhaps a REDnode pack that speaks a made line on a spawned NPC, as Animation Tools plays a made clip | LS2's run in the game first |

Open from EDGEfab's notes, for L2 and after:

- How the fit gets timings for the game's own lines without uploading them: a local aligner, shipped fitted numbers, or no alignment.
- V's female head with a Change Head button, the scene's actor for minor characters' heads, the head's textures, eyes and hair, and the mood under a line.

## Left on the owner's PC from EDGEfab

| What | Where | When to remove it |
|---|---|---|
| The LS2 test archive and app | `edgefab_ls2_shapes.archive` in `archive\pc\mod`, and the app `edgefab-ls2-shapes` in REDnode's apps folder | Both replace the women's face graph. Remove them once LS2 has run, or before playing normally |
| The Audio2Face container | Docker: container `a2f-nim`, network `a2f`, volume `a2f-cache`, client image `edgefab-a2f-client` | Keep it for L3; it holds the owner's NGC key, never printed |
| EDGEfab's cache | `%LOCALAPPDATA%\EDGEfab\cache\lipsync` | After L1 has moved the A2F versions over (decision 3) |
