# <span class="y">Tests</span>

Every test of REDcode on record: how to run it again, what to expect, and what it showed. Each step of the build ends with a hand test by the owner in VS Code ([CR2W editor](design/cr2w-editor.html#milestones), [Ship](design/ship.html), [View](design/view.html)). Add new tests here when they are first run.

Gathered on 2026-10-16 from the design pages, the project notes and the session logs. Last updated 2026-10-16.

## At a glance

| Test | Kind | Phase | Last run | Result |
|---|---|---|---|---|
| [Type check and build](#type-check-and-build) | Automated | All | 2026-10-16 | Pass |
| [Smoke test](#smoke-test-the-bridge-client-against-the-game) | Automated, needs the game | C1 on | 2026-10-16 | Pass |
| [Bridge checks against the game](#bridge-checks-against-the-game) | Scripts outside the repo | C3 on | 2026-10-16 | Pass |
| [MCP server](#mcp-server) | MCP client script | C3 on | 2026-11-12 | Pass |
| [WolvenKit round trip](#c2-wolvenkit-round-trip-and-extract-to) | By hand | C2 | 2026-10-11 | Pass |
| [Save JSON to Project](#save-json-to-project) | By hand | C3 | 2026-10-11 | Pass |
| [Texture viewer](#texture-viewer) | By hand | C3 | 2026-10-11 | Pass after a fix |
| [TweakXL language](#tweakxl-language) | By hand | C3 | 2026-10-11 | Pass |
| [E2 CR2W editor](#e2-the-cr2w-editor) | By hand | C3 | 2026-10-12 | Pass after a fix |
| [E3 search and table](#e3-search-and-the-table-view) | By hand | C3 | 2026-10-13 | Pass, three fixes |
| [E4 atlas view](#e4-the-atlas-view) | By hand | C3 | 2026-10-13 | Pass after REDbridge 0.5.1 |
| [Bridge install and update](#bridge-install-and-update) | By hand | C3 | 2026-10-13 | Pass |
| [E5 texture view, read-only files, Properties](#e5-texture-view-read-only-game-files-properties-view) | By hand | C3 | 2026-10-13 | Pass, three fixes |
| [S1 Pack](#s1-pack) | By hand | C4 | 2026-10-13 | Pass after two fixes |
| [S2 Install and Run](#s2-install-and-run) | By hand | C4 | 2026-10-14 | Pass; hot folder not run |
| [S3 Export, S4 Import](#s3-export-and-s4-import) | By hand | C4 | 2026-10-14 | Pass, one fix |
| [V1 mesh viewer](#v1-mesh-viewer) | By hand | C5 | 2026-10-14 | Pass |
| [Tree filter](#tree-filter) | By hand | C5 | 2026-10-14 | Pass |
| [Copy path](#copy-path) | By hand | C5 | 2026-10-14 | Pass |
| [V2 audio player](#v2-audio-player) | By hand | C5 | 2026-10-15 | Pass on the retest |
| [V3 TweakDB view](#v3-tweakdb-view) | By hand | C5 | 2026-10-15 | Pass, one fix |
| [Add to Library (#19)](#add-to-library-19) | By hand | Requests | 2026-11-06 | Pass, one fix |
| [Open contract (#22)](#open-contract-22) | By hand | Requests | 2026-11-06 | Pass |
| [Animations A1 (#21)](#animations-a1) | By hand | Requests | 2026-11-06 | Pass |
| [Animations A2 (#21)](#animations-a2) | By hand | Requests | 2026-11-15 | Pass, three fixes |
| [Animations A3 (#21)](#animations-a3) | By hand | Requests | 2026-11-20 | Pass (owner, REDbridge 0.17.0), with three fixes |
| [Edit in Blender: skinned meshes](#edit-in-blender-skinned-meshes) | By hand | | 2026-11-20 | Pass (owner) |
| [Keys (K4b)](#keys-k4b) | By hand | Requests | 2026-11-21 | Pass (owner), steps 1 to 8 on REDbridge 0.18.0; the optional step 9 not run |
| [Animation Probe A](#animation-probe-a) | By hand, in the game | Research | 2026-11-21 | Pass (owner), run 2, once the clips' fallback frames were cleared |
| [Animation Probe D](#animation-probe-d) | By hand, in the game | Research | 2026-11-22 | Pass (owner), run 2, once every bone's translation was keyed |
| [anim-core check](#anim-core-check) | Automated, on the PC (game and Uthana key) | Animation Tools AT1 | 2026-11-22 | Pass, 22 of 22 |
| [Animation Tools AT2](#animation-tools-at2) | By hand, in REDcode and the game | Animation Tools AT2 | 2026-11-22 | Not run (checked offline: typecheck, unit 75, anim-core 22, the MCP tools over stdio) |
| [Animation Tools pack (AT3)](#animation-tools-pack-at3) | By hand, in the game | Animation Tools AT3 | 2026-11-22 | Not run (checked outside the game: `packs/animation-tools/check.mjs`) |
| [Replace with a WAV, titled models (#29), every window's project (#32)](#replace-with-a-wav-titled-models-29-and-every-windows-project-32) | By hand, in the game | Requests | 2026-11-20 | Pass (owner), with two fixes |
| [Replace All](#replace-all) | By hand, in the game | Requests | 2026-11-20 | Pass (owner), with one fix |
| [Sector view](#sector-view) | By hand | C5 | 2026-11-20 | Pass (owner), with two fixes and five changes, each retested |
| [Sector materials (M1)](#sector-materials-m1) | By hand | C5 | 2026-11-21 | Pass (owner), all 10 steps, with one fix (retest pending) |
| [Sector camera](#sector-camera) | By hand | C5 | 2026-11-21 | Not run (checked in Chrome over the real bridge) |
| [Sector selection](#sector-selection) | By hand | C5 | 2026-11-21 | Not run (checked in Chrome over the real bridge) |
| [Library view (#23)](#library-view-23) | By hand | Requests | 2026-11-15 | Pass, two fixes |
| [Run Game without ELECTRON_RUN_AS_NODE (#24)](#run-game-without-electron_run_as_node-24) | By hand, in the game | Requests | 2026-11-20 | Pass |
| [New File](#new-file) | By hand | Requests | 2026-11-20 | Pass, steps 1 to 13, four fixes |
| [New File hover button](#new-file-hover-button) | By hand | Requests | 2026-11-20 | Pass |
| [No Red Hot Tools](#no-red-hot-tools) | By hand | C4 | 2026-11-10 | Pass, one fix |
| importFile's texture (#25) | By hand, through EDGEhack | Requests | 2026-11-10 | Pass: EDGEhack 0.0.19's H3b.2 Upload test (EDGEhack's `docs/testing.md`), all 10 steps, run by the owner with REDcode main e9b5e7b; the icons showed in the game. Reported by the EDGEhack session |
| [Resizable table columns (#26)](#resizable-table-columns-26) | By hand | Requests | 2026-11-10 | Pass, one fix |
| [Export every LOD](#export-every-lod) | By hand | C4 | 2026-11-12 | Pass |
| [Reveal in Project (#27) and the search wording (#28)](#reveal-in-project-27-and-the-search-wording-28) | By hand | Requests | 2026-11-15 | Pass |
| [Item search (#28)](#item-search-28) | By hand | Requests | 2026-11-15 | Pass, one fix |
| [Release 0.10.0: issues #5 to #8 and V4](#release-0100-issues-5-to-8-and-v4) | By hand | C5 | 2026-10-16 | Pass, ten fixes retested |
| [Unit checks](#unit-checks) | Automated | C4 on | 2026-10-25 | Pass |
| [Issue #11: Pack and Try through REDnode](#issue-11-pack-and-try-through-rednode) | By hand, in the game | C4 | Partly passed | On game 2.5, A and B pass (2026-10-26); steps 1 to 6 wait for Red Hot Tools on 2.5 |
| [Issue #16: EDGEmat colors repeat past the UV square](#issue-16-edgemat-colors-repeat-past-the-uv-square) | By hand | C5 | 2026-10-26 | Pass |
| [Release 0.10.5: requests #2, #13, #14, #15, #18 and deployMod](#release-0105-requests-2-13-14-15-18-and-edgedecks-deploymod) | By hand | C5 | 2026-10-29 | Pass, steps 1 to 11 |
| [Never run](#never-run) | | | Not run | |

## Automated

### Type check and build

```powershell
npm install
npm run typecheck
npm run build
```

Expected: no errors. `npm run build` bundles every extension and the MCP server with esbuild.

### Unit checks

```powershell
cd extensions/redcode
npm run build
npm test
```

Expected: `39 passed`. `scripts/unit.mjs` runs `dist/hotSwap.js`, `dist/exportCache.js`, `dist/library.js`, `dist/opens.js` and `dist/animsGlb.js` with no VS Code or game: REDnode's settings, what Pack and Play says when it installs, REDnode's replies, the export cache's stamp, and Add to Library's walk and item, the open contract's reader and matcher (#22), and the animation view's list, skeleton and clips (#21). Added 2026-10-25 for issue #11; pass.

### Smoke test: the bridge client against the game

```powershell
cd extensions\redcode
$env:DOTNET_ROOT = "$env:LOCALAPPDATA\Microsoft\dotnet"
npm run smoke -- "<path to REDbridge.exe>" "<Cyberpunk 2077 folder>"
```

Drives `bridgeClient.ts` without VS Code ([dev setup](dev-setup.html), section 4). It prints one line per step with its time; any step that throws stops the run.

| Step | Checks |
|---|---|
| `bridge.info`, `archive.archives`, `archive.search nokota` | The bridge starts and indexes the game |
| `cr2w.toJson`, `hash.fnv1a64`, `hash.resolve` | Conversion and hashing on the first search hit |
| `sound.events`, `tweakdb` | Event names (bridge 0.7.2) and TweakDB reads (bridge 0.8.0); skipped on an older bridge |
| `archive.tree`, `archive.extractMany`, `cr2w.fileToJson` | Browsing and extraction |
| `cr2w.open`, `getNode`, `patch` and its inverse, `save` | A document session: a value patched, undone, saved to a new file and read back after reopening |
| `texture.toPng`, `texture.fileToPng` | Textures from the game and from disk |
| `project.pack`, `archive.openMod`, `archive.extractFromMod` | Pack the extracted files and read the archive back (bridge 0.6.1 on) |
| `project.export`, `project.import` | A texture to PNG and back, keeping its setup (bridge 0.7.0 on); then imported with the game's UI setup (`TEXG_Generic_UI`, `TCM_QualityColor`, `TRF_TrueColor`, gamma, no mips, not streamed), and the answer's `texture` matches it field by field (bridge 0.12.0 on, REDcode #25; passed 2026-11-10 against REDbridge 0.12.1, 16.2 s in all) |
| `project.export` with every LOD, and back | A police Archer Hella door (15 submeshes over three LODs) exported as WolvenKit does (5 meshes in the `.glb`) and with `meshLodFilter: false` (15), then that `.glb` imported back over the mesh, which keeps its 15 submeshes (`redcode.export.meshLods`; passed 2026-11-12 against REDbridge 0.12.1, 21.7 s in all) |

About 8 seconds on the reference machine before TweakDB; the first TweakDB load adds about 12 seconds.

### Bridge checks against the game

Each new bridge method was checked by a script against the owner's game before the hand test. The scripts lived in the session's scratch folder and are **not in the repo**, so they cannot be rerun as they are. What they showed:

| Date | Bridge | Checks | Result |
|---|---|---|---|
| 2026-10-12 | 0.5.0 document sessions (E1) | 40: node reads at every level of an entity, replace with its inverse, add, insert, move and remove on a mesh's bone names, a bad operation leaves nothing applied, a wrong value type is rejected with its path, save and reopen, `compiledData` rebuilt after save, read-only game opens refuse patches, the onscreens file | Pass. Open the 8.8 MB onscreens file 377 ms, a page of 200 rows under 1 ms |
| 2026-10-13 | 0.5.1 to 0.7.0 (C4) | Pack against WolvenKit's pack of TestMod; export and re-import of a texture keeps all ten setup fields and the image the right way up | Pass |
| 2026-10-14 | 0.7.2 sound (V2) | 74 sounds sampled across all packages come out as valid Ogg | Pass |
| 2026-10-15 | 0.8.0 TweakDB (V3) | 843 types; Clothing has `Items` (1,991) and `TEST` (6); "quadra type66" finds 415 records in 38 ms | Pass |
| 2026-10-15 | `REDcodeApi` (#4) | Sound index in 126 ms, a sound effect as WAV in 16 ms, voice lines, project files, bad references | Pass |
| 2026-10-16 | 0.9.0 (REDbridge #5, #6) | A GLB imported over a game mesh template; sound effect WAVs back into `.opuspak` and `.opusinfo` | Pass |
| 2026-10-16 | 0.10.0 game entries' file and row | 10: for `Johnny Silverhand` and `LocKey#7052` (en-us) and `Dogtown` (de-de), each entry names its game onscreens file, and that row holds the same LocKey | Pass |
| 2026-10-16 | 0.10.0 onscreens by folder | 4 on TestMod: its `en-us\onscreens\onscreens.json` copy is found, its subtitles file is not, de-de has none, `LocKey#7052` comes from the project | Pass |
| 2026-10-16 | 0.10.0 `loc` (V4) | 22: 19 languages; search by words, `LocKey#n`, number and secondary key; an unknown key gives null; a project `.xl` overlay wins for its language only; `loc.newFile` with no `.xl`, with an `.xl` holding other blocks (CRLF kept), a second language, a flow list; a row added through a patch reads back as the project's row 0 | Pass |

The editor page, the mesh viewer, the audio player and the TweakDB record page were also run in Chrome over a recorded bridge fixture before each hand test. That checks the page, not the extension host.

### MCP server

Register the server ([MCP](mcp.html)) and run a client against it. Checked by an MCP client script each time tools were added:

| Date | Tools | Result |
|---|---|---|
| 2026-10-12 | The first 23 (archives, conversion, document sessions, `cr2w_read`, `cr2w_edit_file`) | 21 checks pass, including a game light copied with a bigger radius and both `components` and the rebuilt `compiledData` holding it |
| 2026-10-14 | `sound_events`, `sound_extract` | Pass |
| 2026-10-15 | The six `tweakdb_*` tools | Pass |
| 2026-10-16 | `@edgemodders/redcode-mcp` 0.2.0 installed from its packed `.tgz` into an empty folder and started through `npx` | All 38 tools listed; bridge, TweakDB and sound tools answer |
| 2026-10-27 | `loc_languages`, `loc_search`, `loc_get`, `mesh_items` (Claude Code through the edge plugin, which in the REDcode checkout runs the workspace build; REDbridge 0.11.0, game 2.5) | Pass: 19 languages; "sunny ammo high-tops" finds LocKey#4123 with its onscreens file and row; de-de text for it and `null` for an unknown key; `mesh_items` on the high-tops mesh, `red_yellow_graphic`, gives `Items.CasualShoes_01_basic_01` and two more |
| 2026-11-10 | `project_import` with `texture`, before redcode-mcp 0.5.0 (an MCP SDK client script against the workspace build, REDbridge 0.12.1, game 2.5). `library_add` was checked the same way for REDcode 0.10.6 (16 checks) | 5 checks pass: `texture` in the tool's schema; a game texture's PNG imported as a new `.xbm` with `TEXG_Generic_UI`, with the six fields, and with the preset `normal`, each answering that setup read back; a number for `texture` refused |
| 2026-11-12 | `project_export` with `meshLods`, before redcode-mcp 0.5.1 (an MCP SDK client script against the workspace build, REDbridge 0.12.1, game 2.5) | 4 checks pass: `meshLods` in the tool's schema; the police Archer Hella door (15 submeshes over three LODs) exports 5 meshes without it and with `false`, 15 with `true` |

## Before any hand test

| Need | Why |
|---|---|
| The repo built and **F5** with **Run REDcode** (or **Run REDcode and EDGEdeck** when EDGEdeck is part of the test) | Runs the source in an Extension Development Host; the installed copy is replaced while it runs |
| **REDcode: Update REDbridge** first when the test needs a new bridge | The checkout path pulls and builds. Other windows' bridges lock the exe; the command offers to stop them |
| The test project `E:\Modding\Cyberpunk 2077\Projects\TestMod` | WolvenKit project with an `.ent`, `.app`, atlas, onscreens file, `tower.mesh`, a decal `.xbm` and tweaks. Nothing from it goes into this repo |
| The REDcode output channel | Most steps log there; send its lines with any failure |

**Known: the development host sometimes aborts at startup** (exit code 134, seen on 2026-10-12, 10-13, 10-14 and 10-15). Pressing F5 again works, sometimes on the third try. Cause unverified. Next time, read the Debug Console of the F5 window for the assertion text.

## C2: WolvenKit round trip and Extract To

Run 2026-10-11 by the owner: **pass.**

| # | Do | Expected |
|---|---|---|
| 1 | **New Project**, then add one file and one whole folder from Game Assets | Files under `source/archive` |
| 2 | Open the `.cpmodproj` in WolvenKit | It loads, shows the same files and packs |
| 3 | Edit or add a file in WolvenKit, save, then **Refresh Project** in REDcode | The view picks it up; the XML diffs cleanly |
| 4 | **Extract To** on a folder; extract the same folder in WolvenKit | Same output |

## C3: Edit

### Save JSON to Project

Run 2026-10-11: **pass.** On the first try the value reverted, because the edit was under `compiledData`, which WolvenKit rebuilds from `components`. Numbers come back as 32-bit floats (0.22 reads 0.219999...).

| # | Do | Expected |
|---|---|---|
| 1 | Add an `.ent` or `.app` from Game Assets, click it under Archive | It opens as JSON with the yellow Save JSON to Project icon in the editor title |
| 2 | Change a value under `components`, Ctrl+S | The project file is not touched yet |
| 3 | Click the yellow icon and confirm | "Saved" with the byte count; the Project view refreshes |
| 4 | Click the file again | The JSON shows the new value |
| 5 | Open the project in WolvenKit | The file loads with the value |
| 6 | Break the JSON and click the icon | Refused with "not valid JSON"; the file is left alone |

### Texture viewer

Run 2026-10-11: **pass after a fix.** The image first showed as broken (401 from the webview resource URL); the viewer now sends the PNG inline when the URL fails.

| # | Do | Expected |
|---|---|---|
| 1 | Click an `.xbm` in Game Assets | The image over a checkerboard, its size in the header |
| 2 | Fit, 1:1, Pixels | Each works |
| 3 | Add it to the project and click it under Archive; open it from the Explorer too | The same viewer, from the file on disk |
| 4 | Open With... the text editor | Still possible |
| 5 | Stop the bridge and reopen a project `.xbm` | "Bridge is not running", not an empty tab |

### TweakXL language

Run 2026-10-11: **pass.**

| # | Do | Expected |
|---|---|---|
| 1 | Open `extensions/redcode/samples/example.tweak` | Keywords, names, types, numbers, strings and comments each coloured |
| 2 | `record`, `append`, `fk` and Tab | Snippets expand |
| 3 | Ctrl+/ on some lines | `//` comments toggle |
| 4 | Type `{` | `}` auto-closes; brackets highlight their pair |

### E2: the CR2W editor

Run 2026-10-12 on an `.ent` and an `.app`: **pass after a fix.** Found: after an edit and Ctrl+S, a duplicate row appeared and the tab stayed dirty until a second save. Fixed (pending input is flushed before every save) and retested the same day.

| # | Do | Expected |
|---|---|---|
| 1 | Click an `.ent` under Archive | The CR2W editor: yellow file name, root type and size, tree and property grid |
| 2 | Expand `components`, click one | Its properties with types; small structs inline |
| 3 | Change a number, Enter | "Set components.0.radius" in the footer, dirty dot |
| 4 | Ctrl+Z, Ctrl+Y | Reverts and reapplies |
| 5 | Click `compiledData` | Yellow banner, fields disabled |
| 6 | Change a value, Ctrl+S, reopen | The value is there, in `compiledData` too |
| 7 | Close the host with an unsaved edit, reopen | The edit is restored, the tab dirty |
| 8 | On an array, + add, remove, move | Each works |
| 9 | JSON button | The file as text |

### E3: search and the table view

Run 2026-10-13: **pass, three fixes.** Found: Add row did not scroll to the new row; long search hits overflowed the pane; the tree pane needed a resizable divider. All three fixed the same night; no separate retest is recorded.

Setup: add `base\localization\en-us\onscreens\onscreens.json`, one file from `base\localization\en-us\subtitles\` and an `.ent` to the project.

| # | Do | Expected |
|---|---|---|
| 1 | In the `.ent`, type in the footer search, Enter | A results list: path, type, preview |
| 2 | Click a hit | The tree expands to it, the grid shows it |
| 3 | Search a component name | Two hits; the `compiledData` one dimmed and read-only with its banner |
| 4 | Esc | Results clear |
| 5 | Open `onscreens.json` | The CR2W editor in table mode: keys, female and male text, 200 rows a page |
| 6 | Type in the filter | Rows narrow, the count in the status line |
| 7 | Edit a text and a key cell; undo, redo | The cells follow |
| 8 | + add row, edit, delete, undo the delete | Lands on the new row; the row returns |
| 9 | Tree, then Table | Same file; filter and page kept |
| 10 | Ctrl+S, close, reopen | Edits kept; the file still opens in WolvenKit |
| 11 | Open the subtitles file | The same table with a `stringId` column |
| 12 | Open a plain settings `.json` | The normal text editor |

### E4: the atlas view

Run 2026-10-13: **pass after REDbridge 0.5.1.** Found: on `item_icons.inkatlas` the parts did not sit on their icons, while WolvenKit's did. Game textures are stored bottom-up; REDbridge 0.5.1 flips them on `toPng` as WolvenKit does. Use `base\gameplay\gui\common\icons\items\item_icons0.inkatlas`; `item_icons.inkatlas` one folder up, in `basegame_1_engine`, is an older leftover.

| # | Do | Expected |
|---|---|---|
| 1 | Add `base\gameplay\gui\common\icons\achievement_icons.inkatlas`, open it | The texture with five rectangles, labels on, the first part selected |
| 2 | Click rectangles and list rows; change a pixel value, Enter; Ctrl+Z | The rectangle moves and back |
| 3 | Slot picker to slot 1 and back | The 1080p texture |
| 4 | Add a part, rename, delete, undo | Each works |
| 5 | Save, reopen | Edits kept |
| 6 | Open `base\gameplay\gui\common\icons\items\item_icons0.inkatlas` | Hundreds of parts, labels off, each on its icon; filter, Fit and 1:1 work |
| 7 | Tree, then Atlas | The part expanded and selected |

### Bridge install and update

Run 2026-10-13: **pass.** Not run: the .NET runtime prompt, which needs a machine without .NET 10.

| # | Do | Expected |
|---|---|---|
| 1 | Reload with a checkout one commit behind | The old version in the status bar |
| 2 | **REDcode: Update REDbridge** | Build lines in the log, about a minute, then "REDbridge 0.5.0 → 0.5.1" |
| 3 | Update again | A quick rebuild, "0.5.1 is running" |
| 4 | Clear `redcode.bridgePath` | A prompt offers Install REDbridge |
| 5 | Accept | Download with progress; the setting points under the extension's storage |
| 6 | Update on that install | "Already the latest release" |
| 7 | Set `redcode.bridgePath` back to the checkout exe | |

Install REDbridge overwrites `redcode.bridgePath`, so note the old value first. EDGEdeck has its own `edgedeck.bridgePath`.

### E5: texture view, read-only game files, Properties view

Run 2026-10-13: **pass, three fixes.** Found: the Open With list lacked the editor for `.xbm` (a second view type fixed it); the Project view needed the project as its root node; the Properties view did not follow a newly opened file after all editors were closed (it now follows the editor's own shown event). No separate retest is recorded.

| # | Do | Expected |
|---|---|---|
| 1 | Open With **REDcode CR2W Editor** on a project `.xbm` | The image above the grid, `setup` selected |
| 2 | Click an `.ent` in Game Assets | The editor with a lock on the tab, "game copy, read-only", no edit controls; Open as JSON still in the menu |
| 3 | Open the Properties view with a project `.ent` active; click nodes, edit on each side; Ctrl+Z in the editor | The sidebar follows; edits show on both sides; undo reverts both |
| 4 | Switch to a text tab, then close the editor | The sidebar keeps the node, then shows the empty message |

## C4: Ship

### S1 Pack

Run 2026-10-13 on TestMod: **pass after two fixes.** Found: Update REDbridge failed while other windows ran bridges from the same exe (it now offers to stop them); the build task failed with EPERM on cleaning `packed` (fixed). Against WolvenKit's pack of TestMod: the same 21 resources, same sizes, same archive size, identical loose files. Kept on purpose: `.tweak` files in `r6/tweaks` are packed, where WolvenKit drops them.

| # | Do | Expected |
|---|---|---|
| 1 | **REDcode: Update REDbridge** | "REDbridge 0.5.1 → 0.6.1" |
| 2 | Open TestMod, press the package button | `packed/archive/pc/mod/TestMod.archive` revealed; the tweak under `packed/r6/tweaks` |
| 3 | Ctrl+Shift+B, `redcode: pack` | The same log in a terminal |
| 4 | Pack the same project in WolvenKit into a copy and compare | Same file list |
| 5 | Turn on `redcode.pack.redmod`, pack | The archive in `packed/mods/<mod>/archives`, `info.json` from the project file. Turn it off and pack again after |

### S2 Install and Run

Run 2026-10-14 through REDdeck: **pass.** The direct install (no REDdeck) was checked against a fake game folder only. Not run: the hot folder, since Red Hot Tools is not installed here.

TestMod carries edited copies of real game files; while installed they replace the game's. Uninstall takes them out.

| # | Do | Expected |
|---|---|---|
| 1 | F5 with **Run REDcode and EDGEdeck** | EDGEdeck's Mods view shows the library |
| 2 | Open TestMod, press the rocket (**Pack and Install**) | A pack, then EDGEdeck adds "TestMod" version dev and deploys; a question first if other mods have changes waiting |
| 3 | Look in the game folder | `archive/pc/mod/TestMod.archive`, the `.xl`, the YAML in `r6/tweaks`, all in `edgedeck.deployment.json` |
| 4 | Rocket again | The same TestMod refreshed, not a second one |
| 5 | **Uninstall** from the Project view's `...` | EDGEdeck turns it off and deploys; the files leave |
| 6 | Play button, **Run Game** | Steam starts the game |

### S3 Export and S4 Import

Run 2026-10-14: **pass, one fix.** Found: a click on a `.png` in Raw gave a "cannot open" toast. Fixed: files with no REDcode editor open as VS Code would, and `.tga` and `.dds` open in the texture viewer (`texture.imageToPng`). A follow-up the same day sends project PNG, JPG, BMP and TIFF to the texture viewer too, for its checkerboard behind an all-black texture; **that follow-up has not been retested.**

| # | Do | Expected |
|---|---|---|
| 1 | **REDcode: Update REDbridge** | "REDbridge 0.6.1 → 0.7.0" |
| 2 | Export button on `tower.mesh` | `tower.glb`, a `.Material.json` and material textures under Raw, the `.glb` selected |
| 3 | Export `w_borg_decal_01_n01_alpha.xbm`, edit the PNG, **Import from Raw**, open the `.xbm` in the editor | The edit shows; setup fields unchanged |
| 4 | **Import from Raw** on the Raw root | Only the mesh and the decal, not the `engine/textures/editor` images |
| 5 | Right-click an `.ent` | No Export entry |
| 6 | Optional: change `tower.glb` in Blender, import, Pack and Install, look in game | Not reported |

## C5: View

### V1 mesh viewer

Run 2026-10-14: **pass** (step 2 first, steps 3 to 5 after the filter below).

| # | Do | Expected |
|---|---|---|
| 1 | Click `tower.mesh` under Archive | The 3D view; orbit, wireframe and submesh checkboxes work; Tree and 3D switch |
| 2 | Open `ep1\weapons\firearms\rifle_sniper\nokota_osprey\entities\meshes\w_rifle_sniper__nokota_osprey__base1_01.mesh` from Game Assets | The LOD picker: 44,459 triangles at LOD 1, 4,638 at LOD 2 |
| 3 | Click `tower.glb` under Raw | The same viewer |
| 4 | Look at the contrast in the dark theme and how it navigates | Acceptable |

### Tree filter

Run 2026-10-14: **pass.**

| # | Do | Expected |
|---|---|---|
| 1 | Game Assets, Filter, `osprey mesh` | The Osprey meshes as you type, folders open |
| 2 | Enter | The filter stays; the pattern and count above the tree |
| 3 | `ep1/weapons/*.xbm`, then `*.mesh` | The second says it shows only part (5,000 of about 102,000) |
| 4 | Add to Project on a folder in the filtered tree | Only the matching files |
| 5 | Clear Filter | The full tree |
| 6 | Project view, filter `.xbm`, clear | Roots with no match hidden, then back |

### Copy path

Run 2026-10-14: **pass.**

| # | Do | Expected |
|---|---|---|
| 1 | Copy button on a file and a folder in Game Assets, paste | The game path, without quotes |
| 2 | Copy button on a file, a folder and a root in the Project view, paste | The full path on disk |

### V2 audio player

First run 2026-10-14: sound effects failed with "no supported source was found" (VS Code's webview decodes no Opus), and a `.wav` in Raw had no Open With. Fixed: REDcode decodes Opus itself (opus-decoder) and sends WAV; the Project view runs VS Code's Open With. **Retest 2026-10-15: pass.**

| # | Do | Expected |
|---|---|---|
| 1 | **REDcode: Update REDbridge** | 0.7.2 or later in the status bar |
| 2 | **Browse Game Sounds**, filter `revol reload`, click a row, then a variation | It plays, the clock moves; the format line says "Played as WAV, decoded from Opus by REDcode" |
| 3 | Loop, seek, Space, arrow keys, Copy Hash, Save | Each works |
| 4 | Game Assets filter `vo .wem`, click one | A voice line plays |
| 5 | Save a sound as `.opus` into Raw, click it | The same player |
| 6 | Right-click a `.wav` in Raw, Open With..., **REDcode Audio** | The player |
| 7 | Set `redcode.gamePath` to a wrong folder, reload | REDcode offers the found install (EDGEdeck's or Steam's); **Use It** restores it |

Found in step 7: the host aborted at startup twice after the setting change (see [Before any hand test](#before-any-hand-test)).

### V3 TweakDB view

Run 2026-10-15: **pass, one fix.** Found: the new tweak file stayed buried in the Project view; it is now revealed. No separate retest is recorded. Open in EDGEwave was checked without EDGEwave installed.

| # | Do | Expected |
|---|---|---|
| 1 | Open the **TweakDB** view | A loading message for about 10 s, then 843 types |
| 2 | Clothing, Items, click a record | The record page with its flats |
| 3 | Click a link such as `equipArea`, then Back | Follows and returns |
| 4 | Filter `quadra type66`, then Clear | 415 records, then the types |
| 5 | Right-click a record, **New Tweak from This Record**, Clone, keep the path | A YAML file under `source/resources/r6/tweaks/<mod>/` opens |
| 6 | Hover the `$base` path in it | Type and main flats, with a link |
| 7 | **REDcode: Open TweakDB Record...**, type `jacket` | Matching records |
| 8 | Play a sound in Browse Game Sounds, **Open in EDGEwave** | Without EDGEwave: an offer to install it |

## Release 0.10.0: issues #5 to #8 and V4

Run 2026-10-16: **pass, with ten fixes and their retests the same day.** REDbridge 0.10.0 from the checkout (`f38162e`), REDcode main. Steps 1 and 6 ran through EDGEwave in **Run EDGEwave with REDcode main** (EDGEwave's F5 configuration).

| # | Do | Expected |
|---|---|---|
| 1 | **Sound WAV import** (REDbridge #6): in Browse Game Sounds pick a sound, **Open in EDGEwave**, edit, **Into the Game... > Override this variation** | A message naming the files; `sfx_container_<n>.opuspak` and `sfx_container.opusinfo` in `source/archive`, the `.opuspak` selected in the Project view |
| 2 | **GLB as a new mesh** (REDbridge #5): **Export to Raw** on a project `.mesh`, copy the `.glb` to a new name under `source/raw`, **Import from Raw**, **Choose a Template...** | A new `.mesh` at the GLB's path; the log reports submeshes, materials and appearances; it renders in the viewer |
| 3 | **Viewer appearances** (#6): a garment `.mesh` with several appearances; a GLB with its own textures | An Appearance list that changes the materials; the GLB's textures, with Shading back to flat colours |
| 4 | **Pack and Try** (#7) | Without Red Hot Tools: Pack and Install |
| 5 | **Edit in Blender** (#7): right-click a `.glb` in Raw, change the model in Blender, Ctrl+S, again, close Blender | Blender opens; each save re-imports into Archive and the viewer shows it; the status bar watch goes when Blender closes |
| 6 | **Custom sounds** (#8): `redcode.pack.redmod` on, EDGEwave **Into the Game... > Replace the event with REDmod**, Pack | The WAV in `packed/mods/<mod>/customSounds`, the entry in `packed/mods/<mod>/info.json` |
| 6a | Rename the WAV, Pack; then **Pack and Install** | Pack warns the WAV is missing; Pack and Install asks "Install anyway?", Cancel logs "Install cancelled" and installs nothing |
| 6b | Rename it back, Pack and Install | Installs with no question |
| 7 | **LocKeys** (V4): search `Johnny Silverhand`, then `LocKey#7052`; the globe on the view's title bar to switch language | Results with key and texts in each language |
| 8 | In a language the project has no file for (de-de for TestMod), **+** on a result | `source/archive/<mod>/localization/de-de.json` made and selected; a `de-de:` line under `localization: onscreens:` in the project's `.xl`; the table on the new row |
| 9 | Change the text, save, search again; click it, then click a game entry | The project's version with a pencil icon (the key and "project" show when the sidebar is wide enough); the click opens the project's file on its row, the game entry the game's `onscreens.json` read-only on its row |
| 10 | Hover a `LocKey#` in a `.yaml` file; open `base\gameplay\devices\vending_machines\vending_machine_v.ent`, search `LocKey#`, hover a hit, click it | The text in the hover, in the chosen language and the project's version; the hit's hover and the grid show the text of `LocKey#176` |

Found and fixed during the run (each retested the same day):

| Found | Fix |
|---|---|
| The test window ran REDbridge 0.8.0: the checkout's exe had not been rebuilt since 2026-10-15, as seven windows' bridges locked it | The checkout rebuilt with the update marker, so every window's bridge restarted on 0.10.0 by itself |
| An import through the API (EDGEwave's Into the Game) did not show its result | It reveals what it wrote, a sound's `.opuspak` first (`93c0ba2`) |
| **Edit in Blender** missing from the Project view menu: the menu tested `resourceExtname`, which the tree does not set | Models carry `.model` in their `contextValue` (`4f353e9`) |
| An empty `redcode.blenderPath` read as "Blender not found"; its description had lost a backslash | A found Blender is written to the setting, and a gone path is searched again (`67df54d`, `1cbba95`) |
| `source/customSounds` missing from the Project view | A Custom Sounds root when the project has the folder (`e052105`) |
| Pack and Install installed a REDmod that REDmod refuses (a missing custom sound) after only a warning | Pack and Install and Pack and Try ask first (`1b33596`) |
| A LocKeys click only copied the key, with no visible sign | A click opens the entry in its file on its row; game entries carry their file and row (REDbridge `40ae414`, REDcode `e7ad7fe`) |
| **+** did not show where the file went | The onscreens file is selected in the Project view (`9cd04ed`) |
| A project's onscreens files by folder took any JSON under the language, subtitles included | Only files under `<language>\onscreens` (REDbridge `f38162e`) |
| CR2W editor search hits showed no LocKey text | On hover (`3adf1ae`) |

Not seen: the plain-pack custom sound warning as a toast (it is in the log on every pack; REDdeck's install messages covered it). Not covered: a GLB template whose submesh count differs from the GLB's, so the appearance resizing; step 2 used the GLB's own mesh as the template.

Also found: TestMod has `.vscode/settings.json` with its own `redcode.pack.redmod`, which wins over the user setting (the Settings editor says "Also modified in Workspace"); and an English copy of the game's whole `onscreens.json`, so every English entry is a project entry there.

## Issue #9: Install through EDGEdeck

Given to the owner 2026-10-17. REDcode main (`8ba7879`) with EDGEdeck 0.27.1 installed from the store. **Run REDcode** keeps installed extensions, so it needs no EDGEdeck clone.

| # | Do | Expected |
|---|---|---|
| 1 | F5 with **Run REDcode**; open the REDcode log | REDcode starts; EDGEdeck is in the Extensions view |
| 2 | Open TestMod, press the rocket (**Pack and Install**) | A pack, then the log says "Added TestMod in EDGEdeck" (or "Refreshed"); EDGEdeck deploys, asking first if other mods have changes waiting |
| 3 | Look in the game folder | `archive/pc/mod/TestMod.archive` and its files listed in `edgedeck.deployment.json` |
| 4 | **Uninstall** from the Project view's `...` | The log says "Uninstalled TestMod through EDGEdeck"; the files leave |
| 5 | Set `redcode.gamePath` to a wrong folder, reload the window | REDcode offers the install EDGEdeck uses, labelled "(EDGEdeck)", when EDGEdeck started first; otherwise a found Steam install. **Use It** restores it |

Run 2026-10-17: **pass, with one fix, retested the same day.** Step 3: TestMod's own `.vscode/settings.json` turns on `redcode.pack.redmod`, so the archive went to `mods/TestMod/archives/` as packed, not to `archive/pc/mod`; the expected result above did not allow for that. Step 5: the wrong path was in TestMod's workspace settings, and **Use It** wrote the user setting, which the workspace value hides, so the setting still showed the wrong path. Fixed: Use It and Set Game Folder write the workspace setting when the workspace has one. Retest of step 5: **pass**; TestMod's `.vscode/settings.json` holds the path chosen.

Released as 0.10.1 on 2026-10-18. The smoke test on the release commit (`7f0ea36`) with the REDbridge checkout build: **pass** (14.3 s).

## Close Project

Given to the owner 2026-10-19. REDcode main, F5 with **Run REDcode**.

| # | Do | Expected |
|---|---|---|
| 1 | Open TestMod; open the Project view's `...` menu | **Close Project** below Install and Uninstall, in its own group |
| 2 | Edit a project file without saving, then **Close Project** | VS Code asks to save; Cancel keeps the project open |
| 3 | **Close Project** again, saving or not | The window has no folder; the Project view shows New Project and Open Folder |
| 4 | **File > Open Recent**, TestMod | The project is back, with its tree |
| 5 | Optional: **File > Add Folder to Workspace** with another folder, then **Close Project** | Only TestMod's folder leaves the workspace; the other stays |

Released in 0.10.2 (2026-10-20) at the owner's request before this test was run.

## A project with no files

Given to the owner 2026-10-19. REDcode main, F5 with **Run REDcode**, EDGEdeck installed. Found by the owner: Pack and Try on a project with only its folders left showed an unclear error, most likely EDGEdeck's "has no packed output yet. Pack the project first".

| # | Do | Expected |
|---|---|---|
| 1 | **New Project**, then **Pack** | A warning: nothing to pack, `source\archive` and `source\resources` have no files |
| 2 | **Pack and Install** (the rocket), then **Pack and Try** | Each: a warning that the project has nothing to install yet, no error, no "packed and installed" |
| 3 | Add one file from Game Assets, **Pack and Install** | Installs through EDGEdeck as usual |
| 4 | Delete the file from the project, **Pack and Install** | A question: nothing to install, an earlier install is still in EDGEdeck, **Uninstall** or Cancel |
| 5 | **Uninstall** | The log says it was uninstalled through EDGEdeck; the file leaves the game |

Released in 0.10.2 (2026-10-20) at the owner's request before this test was run.

## A mesh opens on the 3D view

Given to the owner 2026-10-20. REDcode main, F5 with **Run REDcode**. Found by the owner: a `.mesh` clicked in the Project view showed the property grid with a **Tree** button, and 3D only after Tree and back. Cause: the Properties view sent its selection back to the editor when it loaded, often before the editor had chosen the file's view, and the editor drew the grid. First fix (e8a5746, 3670598) only guarded the editor once it was deciding; the owner still saw the grid before the atlas (2026-10-20). Second fix: the Properties view no longer sends that selection back, and the editor ignores selections until its view is chosen.

| # | Do | Expected |
|---|---|---|
| 1 | With the Properties view open, click a `.mesh` in the Project view | The 3D view, with the **Tree** button |
| 2 | **Tree**, then **3D** | The tree, then the 3D view again |
| 3 | Click an `.inkatlas`, then a localization `.json` | The atlas view, then the table view, with no flash of the grid before either (the owner saw one on the atlas, 2026-10-20) |
| 4 | In the Properties view, click **open** on a field, then **Tree** in the editor | The 3D, atlas or table view stays until Tree; the tree then shows that field selected |

Result 2026-10-20: pass after the second fix (618f012), reported by the owner. Released in 0.10.2; smoke test passed (19.5 s) before the tag.

## Release 0.10.3: menu kinds and an awaited install

Run 2026-10-21 before the tag, on bda36ce's successor with 3a6ac88, 4db10b8 and fd6a92a: build and type check pass, smoke test passed (19.3 s). No hand test: released at the owner's request so EDGEwave (#6) and EDGEmat (#2) can test against the installed REDcode. Their tests cover the `.sound` and `.mlsetup` kinds; the awaited `installProject` waits on EDGEdeck #3.

## Issue #12: journals and opening at a node

Given to the owner 2026-10-22. REDcode main, F5 with **Run REDcode**. Steps 2 and 3 need a caller: EDGEquest's raw nodes link, once it uses `openFile`. Checked before: REDbridge opens both game journals (`gameJournalResource`, root `entry` with 9 folders; base 1.4 s, ep1 0.2 s), and the build and type check pass.

| # | Do | Expected |
|---|---|---|
| 1 | Game Assets: the funnel button (**Filter Game Assets**, not the magnifier), `cooked_journal`, then click `base\journal\cooked_journal.journal` in the tree | The CR2W editor, read-only, `gameJournalResource` with `entry` |
| 2 | From EDGEquest, open a quest node's raw nodes (it calls `openFile(gamePath, nodePath)`) | The file opens, or its tab is focused, with the tree expanded to the node and the node selected; the Properties view shows it |
| 3 | Optional, from any extension: `openFile` on a `.mesh` game path with `appearances.0` | The tree, not the 3D view, at that node; the header button offers **3D** |
| 4 | A test project open: File, Open Folder on the folder that holds its `.cpmodproj` (a parent folder does not count; the Project view shows the project). The entry is written into its onscreens file. REDcode sidebar: open the **Properties** view, then the **LocKeys** view, magnifier, search a word such as `jacket`. Hover a game entry and press its **+** (or right-click, **Add to Project Onscreens**) | The project's onscreens file opens in the table view, scrolled to the new last row with the entry's key and texts; the Properties view does not take it. The first time, the file is created under `source\archive` and named in the project's `.xl`; the Output channel REDcode says so |

Result 2026-10-26, reported by the owner: steps 1 and 4 pass. Step 1 was first tried through the magnifier (Search game files), whose pick list ends in a toast for every file; the step now names the filter. Step 4 needs the project folder itself open, which the step now says. Steps 2 and 3 wait for EDGEquest to call `openFile` ([EDGEquest #2](https://github.com/Edgemodders/EDGEquest/issues/2)); they do not hold up the release.

## Issue #11: Pack and Try through REDnode

Built 2026-10-25, given to the owner the same day. REDcode main, F5 with **Run REDcode**. Needs a game with REDnode 0.26.8 or later and Red Hot Tools, a loaded save, and two projects: one plain (a mesh or texture change) and one with a sound override (`.opuspak` and `sfx_container.opusinfo` under Archive, from Import of a `<hash>.wav` or from EDGEwave).

Checked before: `npm test` (26 pass), and the MCP call against REDnode's own `mcp.js` with a stand-in host on another port: the answer, a sound answer, a failed file, a refusal (no save loaded), a wrong token and the launcher switch off (both 401, `unauthorized`), the tool switched off in the Tools Manager (refused, with a hint), and the server stopped (`unreachable`). A `tools/call` with no `initialize` works on REDnode's stateless server.

| # | Do | Expected |
|---|---|---|
| 0 | In REDnode's launcher, switch on the **Test timer**, press **Start**, and press **Mark** after each step | Marks in REDnode's Mod log |
| 1 | REDnode's launcher, Settings drawer: **MCP server** on. In the plain project, **Pack and Try** | A notification: REDnode swapped `<name>.archive` in some ms; the REDcode log has REDnode's answer as JSON; the change shows after a respawn or re-equip |
| 2 | In the sound project, **Pack and Try** | REDnode swaps it; the notification has REDnode's note on sounds; the new sound plays (equip the weapon again if it played just before) |
| 3 | **MCP server** off. Plain project, **Pack and Try** | The archive goes to the hot folder; the notification adds a hint to switch REDnode's MCP server on (with the official Red Hot Tools and a mixed-case archive name, step 6's warning instead) |
| 4 | Sound project, **Pack and Try** (MCP server still off) | No hot swap, no crash: a warning that sound archives swap only through REDnode 0.26.8 or later, with **Install for Next Start** |
| 5 | Quit the game. Sound project, **Pack and Try** | The same warning; **Install for Next Start** installs it |
| 6 | Optional, official Red Hot Tools 1.3.0 only: a project whose archive name mixes capitals (`MyMod`), installed once, then **Pack and Try** without REDnode | A warning that the swap would end the game, with **Get the Edgemodders Build** and **Install for Next Start** |

**On game 2.5, until RED Hot Tools has a 2.5 build** (it is not installed on the dev PC, and REDnode swaps through it): steps 1 to 6 cannot run. These two can, and are what every 2.5 user gets from Pack and Try today. Given to the owner 2026-10-26.

| # | Do | Expected |
|---|---|---|
| A | Game running with REDnode, a save loaded; REDnode's **MCP server** on. Plain project, **Pack and Try** | Packs, asks REDnode ("swapping through REDnode"); REDnode cannot swap without RED Hot Tools, and REDcode shows its reason (an error or a warning with **Show log**). No crash. REDnode's wording is not known yet |
| B | **MCP server** off. Plain project, **Pack and Try**; then **Uninstall** from the Project view's `...` menu | Packed and installed (through EDGEdeck when present), with a notice to restart the game, since hot swaps need REDnode or RED Hot Tools. No crash. With the game still running, EDGEdeck first asks to quit it (it keeps mod files open, so a deploy would fail partway): quit, then **The game is closed now** |

Result (owner, 2026-10-26): A passes. B ran against the wrong game: `redcode.gamePath` (user settings) was `L:\Backups\Cyberpunk 2077 (2026-10-21)`, the 2.31 backup, which still has a RedHotTools folder, so Pack and Try took the hot route ("packed and sent to the hot folder", with the MCP server hint) and copied `EDGEquest_Q2.archive` into the backup's `archive/pc/hot`. Uninstall then said the mod was "not installed in EDGEdeck or by REDcode": it does not look in the hot folder. Fixed the same day: Uninstall removes the project's archives from `archive/pc/hot` first (checked against a fake game folder; the two archives left in the backup's hot folder were removed by hand). B to run again with the game folder on the 2.5 game (**REDcode: Set Game Folder**, `E:\SteamLibrary\steamapps\common\Cyberpunk 2077`). Retest the same day on the 2.5 game: B passes (EDGEdeck asked to quit the game, then installed the mod with the restart notice; Uninstall took it out through EDGEdeck). Steps 1 to 6 wait for a Red Hot Tools build for 2.5.

Since REDnode 0.41.0 (2026-10-27), REDnode swaps archives on game 2.5 through REDswap, its own plugin, with no Red Hot Tools, and its answer says `via: "redswap"`. So steps 1 and 2 (through REDnode) can run on 2.5 now, with REDnode 0.41.0 or later. Steps 3 to 6 are the hot folder, which still needs Red Hot Tools. The command is called **Pack and Play** since issue #14. Steps 3 to 6 are retired: REDcode 0.10.8 drops the hot folder ([No Red Hot Tools](#no-red-hot-tools)).

## Find Items in the 3D view

Built 2026-10-26, given to the owner the same day. REDcode main, F5 with **Run REDcode**, with a REDbridge from main (REDbridge 1412a1d or later; **REDcode: Update REDbridge** on a checkout). Checked before: REDbridge's probe passes with a `mesh.items` step (17 items for the Converse high-tops, `Items.CasualShoes_01_basic_01` on `red_yellow_graphic`; 0.4 s after TweakDB), the smoke test passes with the same check (14.7 s), and type check, build and `npm test` (26) pass. The result matches the chain traced by hand on 2026-10-25.

| # | Do | Expected |
|---|---|---|
| 1 | Game Assets: open `base\characters\garment\player_equipment\feet\s1_055_shoe__converse\s1_055_pma_shoe__converse.mesh`, pick appearance `red_yellow_graphic`, **Find Items** | A progress notification (about 10 s the first time, while TweakDB loads), then a list: under **Shows red_yellow_graphic**, `Items.CasualShoes_01_basic_01` (Sunny Ammo synthetic high-tops) and two more; under **Other appearances of this mesh**, the other high-tops, `Items.Q001_Shoes` and two outfits |
| 2 | Pick `Items.CasualShoes_01_basic_01` | Its TweakDB record page opens |
| 3 | **Find Items** again; on a row, the copy button, then the file button | The record name is on the clipboard; the file button opens `s1_casual_01.app` in the CR2W editor |
| 4 | Open the same mesh from a project's Archive (add it to a project first), **Find Items** | The same list |
| 5 | A weapon mesh, such as one under `base\weapons`, **Find Items** | A message that no item record shows it, or a list of `.app` looks to open |
| 6 | With the released REDbridge 0.10.0 (optional) | A warning that Find Items needs a newer REDbridge |

Result 2026-10-26, reported by the owner: steps 1 to 5 pass, with REDbridge main through Update REDbridge. Step 6 not run yet (optional).

## Issue #16: EDGEmat colors repeat past the UV square

Built 2026-10-26, given to the owner the same day. REDcode main, F5 with **Run REDcode**, with EDGEmat installed. Found in the owner's EDGEmat test: the 3D view clamped EDGEmat's maps, so UVs outside 0 to 1 took the map's edge color. The fix sets three.js's `RepeatWrapping` on the maps EDGEmat provides. Own textures (a `.glb` opened with its textures; a game mesh is exported without them) load through three.js's glTF loader, which takes the file's samplers, and glTF repeats when a file names none. Checked before: type check and build pass. Not checked: whether any game material relies on clamping.

| # | Do | Expected |
|---|---|---|
| 1 | Game Assets: open `base\characters\garment\player_equipment\legs\l1_012_pants__jeans_tight\l1_012_pwa_pants__jeans_tight.mesh`, appearance `leather`, EDGEmat shading | The pants are even all over; no seam or edge-colored patch on the left leg below the thigh |
| 2 | Another appearance or two, and a garment you tried with EDGEmat before | No new seams or stripes where the maps used to stop at the edge |

Result 2026-10-26, reported by the owner: pass, run in the EDGEmat session as part of EDGEmat's own tests.

## Release 0.10.5: requests #2, #13, #14, #15, #18 and EDGEdeck's deployMod

Built 2026-10-27, given to the owner the same day. REDcode main, F5 with **Run REDcode**. Checked before: type check, build and `npm test` (26) pass. Steps 2 and 3 need EDGEmat installed (its `edgemat.openMesh`); step 4 needs it uninstalled or disabled, or skip it. Steps 6 and 7 need EDGEdeck 0.28.0 or later (0.29.0 is installed here). Steps 8 to 10 (#18, built 2026-10-29) need REDnode in the game; the project file is `project.json` in the `REDcode` folder under `%LOCALAPPDATA%`. Checked before: a mock check of the state file, the package's `service.mjs` (with a stand-in `rednode` module) and its install (scratchpad `svc18/check.mjs`, 14 checks), and REDnode's `rednode describe` reads the service with no warnings.

| # | Do | Expected |
|---|---|---|
| 1 | Command Palette: type **Pack and** | **REDcode: Pack and Play** is listed, and no Pack and Try. The flame button in the Project view's title bar says Pack and Play on hover and packs as before |
| 2 | Game Assets: open `base\characters\garment\player_equipment\feet\s1_055_shoe__converse\s1_055_pma_shoe__converse.mesh`, pick appearance `red_yellow_graphic`, press **Open in EDGEmat** in the 3D view's toolbar | EDGEmat shows the mesh on its Desk, with `red_yellow_graphic` open. Output > REDcode has an "Open in EDGEmat" line |
| 3 | Game Assets: right-click that `.mesh`, then an `.mlsetup` and an `.ent`. Project view: right-click a `.mesh` and a `.glb` | EDGEmat's Open in EDGEmat entry shows on the `.mesh` and `.mlsetup` game files, and on the project `.mesh`. Whether it shows on the `.ent` and the `.glb` depends on EDGEmat's own menus: its current `when` still takes plain `assetFile` and every project model, until it narrows them to the new kinds (#15) |
| 4 | Without EDGEmat: **Open in EDGEmat** in the 3D view | "Open in EDGEmat needs EDGEmat, the EDGE material editor." with **Install EDGEmat** |
| 5 | In a project, make a folder `source\scenes` with a file `test.scene.json` holding `{}` | The Project view shows a **Scenes** root holding it (refresh the view if it does not show), and a click opens it as JSON. **Pack** leaves it out of `packed` |
| 6 | With EDGEdeck 0.28.0 or later: in EDGEdeck, turn some other mod off (so it has a change waiting), then in REDcode **Pack and Install** the project | No question about deploying other mods. The project goes into the game; the other mod's change still waits in EDGEdeck. Output > REDcode: "EDGEdeck deployed: ..." ending with how many files of other mods' changes still wait |
| 7 | **Uninstall** | The project's files come out; the other mod's change still waits. Then turn that mod back on in EDGEdeck |
| 8 | (#18) With `redcode.gamePath` on the game with REDnode, reload the window with a project open | Output > REDcode: "Installed REDcode's REDnode package 0.1.0 in ..." naming the game's REDnode apps folder, which now has a `redcode` folder with `rednode-app.json` and `service.mjs`. The project file under LOCALAPPDATA (see below) names the project and a `pid` |
| 9 | Start the game with REDnode, MCP server on in its launcher's Settings drawer. Ask Claude to call the tool `redcode__project` | The Mod Manager lists **REDcode** with the function `project`. The tool answers the open project: name, mod name, the `.cpmodproj` file and its folders. It runs without asking (read-only) |
| 10 | Close the project's folder in VS Code (File > Close Folder), call `redcode__project` again; then open the project again, close the VS Code window, wait 5 seconds and call it again | `null` after the folder closes, the project again after it opens, `null` after the window closes |

**Result (2026-10-29, the owner):** steps 1 to 10 pass, with no fixes.

Added 2026-10-29 for the game file cache fix (3ebf726, six unit checks). The cache is `cache\audio\game` in REDcode's global storage (`%APPDATA%\Code\User\globalStorage\edgemodders.redcode-cyberpunk`); on this machine the fix had already stamped it for game 2.5 at 21:12 and extracted the sound index again.

| # | Do | Expected |
|---|---|---|
| 11 | F5 on main. **REDcode: Browse Game Sounds**, play three sound effects. Then open `cache\audio\game\stamp.txt`, change its text to `x`, save, reload the window (Developer: Reload Window) and play one of them again | Each sound plays. After the reload, `stamp.txt` holds the game folder again and the files beside it are newly written (their times are now) |

**Result (2026-10-29, the owner):** step 11 passes.

## Add to Library (#19)

REDcode 0.10.6: `code --install-extension "E:\Modding\Cyberpunk 2077\REDcode\dist\redcode-cyberpunk-0.10.6.vsix"`, then **Developer: Reload Window**. Checked before: type check, build, `npm test` (43), the smoke test's new step, `library_add` through the real MCP server (16 checks) and the command driven in real VS Code with a scratch Library (all but the menus themselves and Show in Explorer), each on game 2.5. No game needs to run. This writes into your real Library; delete `Test19` from it after.

| # | Do | Expected |
|---|---|---|
| 1 | Game Assets: filter on `henry_2020_rockerboy`, right-click `henry_2020_rockerboy.mesh` | **Add to Library...** under Add to Project and Extract to |
| 2 | Click it. In the picker, select **Use the game path** twice | Title `Add to Library: henry_2020_rockerboy.mesh.asset`; your Library folders, The Library's root and **New Folder...**. The switch goes On and Off, and the picker stays open |
| 3 | **New Folder...**, type `Test19/Meshes`, Enter | A notice: `Added Test19/Meshes/henry_2020_rockerboy.mesh.asset to the Library: 5 file(s) copied, 3 stay in the game.` |
| 4 | Click **Show in Explorer** on the notice | Explorer on `asset.json`, beside `source`. Under `source\archive\base\characters\...`: the mesh and four `.xbm` |
| 5 | Open `asset.json` | `format` 1, an `id`, `name`, `kind` mesh, `main`, `version` 1, `from` with `gameVersion` 2.5, `license` game, one `history` line `REDcode 0.10.6` |
| 6 | Add the same file again | `Test19/Meshes` comes first, marked Last used. Picking it asks: **Replace It** or **Add Another**. Add Another makes `henry_2020_rockerboy_2.mesh.asset` |
| 7 | Again, **Replace It** | `henry_2020_rockerboy.mesh.asset` keeps its `id`, `version` 2, two `history` lines |
| 8 | Filter on `vending_machine_v`, Add to Library on `vending_machine_v.ent`. Switch **Use the game path** on, pick `Test19` | The item in `Test19\base\gameplay\devices\vending_machines\`: about 41 files, about 54 staying, 1 it names not in the game. If it warns of paths past 259 characters, try opening the item's deepest folders in Explorer and say what happens |
| 9 | Add a third file | Use the game path is still on, as you left it |
| 10 | Add `henry_2020_rockerboy.mesh` to a test project, then right-click it in the Project view | **Add to Library...** is there. In the item's `asset.json`, `from` names the project and the path |
| 11 | In the Project view, right-click a file under `source/raw` | No Add to Library |
| 12 | Delete `Test19` from the Library | Your other Library folders are untouched |

**Found on 2026-11-06, the owner, on the laptop, step 8:** the toast `EPERM: operation not permitted, rename` for the move of the finished item into place. Windows refuses to rename a folder while anything has a file inside open (reproduced with a file held open). Which program held it on the laptop is unverified; an antivirus or the search indexer is the likely one, as the 41 files were just written. Fixed: `renameFolder` in `src/library.ts` tries for about 13 seconds, then says what is wrong. One unit check.

**Result (2026-11-06, the owner, on the laptop, from F5 on main):** steps 1 to 12 pass, with that fix. The owner turned Windows Search off around the retry of step 8, which may be why it passed, so the retry itself is checked only by its unit check.

## Open contract (#22)

Built 2026-11-05 for EDGEhack, in REDcode 0.10.6. F5 with **Run REDcode with Opens Test (no other extensions)**: it loads `tools/test-extensions/opens-test`, a stand-in that claims EDGEhack's two kinds of record (items of type `ItemType.Prt_Program`, object actions with `isQuickHack` true) and shows a notice with what it was given. Checked before: type check, build, `npm test` (46, three for the contract). On game 2.5 the two claims match 92 of 10,203 items and 417 of 2,195 object actions, in under 0.1 s (scratchpad `probe22.mjs`).

| # | Do | Expected |
|---|---|---|
| 1 | TweakDB view: open **Item**, find `Items.BlackWallProgramLvl2`, hover it, then click it | The tooltip ends "Click opens it in Opens Test". The click shows "Opens Test got "Items.BlackWallProgramLvl2"", and REDcode's record page does not open |
| 2 | Filter the view on `Preset_Lexington_Default`, click `Items.Preset_Lexington_Default` (a WeaponItem, no program) | REDcode's record page, as before |
| 3 | Right-click `Items.BlackWallProgramLvl2` | **Open Record**, **Open In...**, New Tweak and Copy Path. **Open Record** opens REDcode's page. **Open In...** lists **Open in Opens Test** and **Open Record** |
| 4 | Filter the view on `AIHackDeath`, click `AIQuickHack.AIHackDeath` (an ObjectAction) | The Opens Test notice with `AIQuickHack.AIHackDeath` |
| 5 | On REDcode's page for `Items.BlackWallProgramLvl2` (from step 3) | An **Open in Opens Test** button beside Copy Path; it shows the notice. On the page of a record no tool claims, such as a link from it to its `ItemType`, the button is gone |
| 6 | Restart with plain **Run REDcode**, without Opens Test | Every record opens REDcode's page on a click again, and no record has **Open In...** |

**Result (2026-11-06, the owner, on the laptop):** steps 1 to 6 pass, with no fixes.

Before release 0.10.6 with `redcode.minBridgeVersion` 0.12.0: the smoke test passes against REDbridge 0.12.0, built from its tag (2026-11-06, game 2.5, in 21.4 s).

## Animations A1

Built 2026-11-06 for REDcode issue #21 ([design](design/animation.html)). F5 with **Run REDcode with Opens Test (no other extensions)**. No game needs to run. Checked before: type check, build, `npm test` (50, three for the clips), the smoke test's new step against REDbridge 0.12.0, and in Chrome with the real bundle and the real bridge (scratchpad `harnessA1.mjs` and `harnessA1e.mjs`, the second with the real editor page and a fake VS Code host): the crew file, the AV and the largest file, every control, Tree and back, `showAnimation` from each state and a name not in the file. That automated tab ran at about one frame a second, so smooth playback has not been seen.

| # | Do | Expected |
|---|---|---|
| 1 | Game Assets: filter on `q001_00c_trauma_arrives_male_average`, click `q001_00c_trauma_arrives_male_average.anims` | It opens on **Animations**. Toolbar: Frame, `Rig man_base.rig`. On the right, 13 animations with their lengths, the first selected. A figure in lines and dots stands on the grid and moves smoothly. Hover a row: its length, frames and 30 fps |
| 2 | **Pause**, then **◀** and **▶** | It holds still, and each press moves one frame (about 0.03 s). The time shows under the view |
| 3 | Drag the scrub bar | The figure follows, and playback stays paused |
| 4 | Press **Play**, then turn **Loop** off and let it reach the end | It stops at the end, and the button says Play. **Play** starts it again from 0. Turn Loop back on: it repeats |
| 5 | Set the speed to 0.25×, then back to 1× | A quarter speed, then normal |
| 6 | Type `soldier point` in the filter, click a row | Three rows are left, and the one clicked plays. Clear the filter: all 13 are back |
| 7 | Orbit and zoom with the mouse, then **Frame** | The view moves as in the 3D mesh view, and Frame fits the rig again |
| 8 | Press **Tree**, then **Animations** | The file's tree and grid, then the view again, playing |
| 9 | Switch to another editor tab for a while, then back | It carries on without jumping far ahead |
| 10 | Command Palette: **Opens Test: Open an Animation** | The crew file opens with `q001_00c_trauma_arrives___med_2_idle__01` selected and playing, whether or not its tab was already open. Run it once with the tab closed and once with it open on another animation |
| 11 | Command Palette: **Opens Test: Open an Animation from a File That Is Not One** | A notice: REDcode refused it, as `openAnimation` takes an `.anims` file |
| 12 | Game Assets: filter on `synced__q001_00c__trauma_av`, click the `.anims` | `Rig av_zetatech_atlus_skeleton.rig`, 6 animations, and a star of lines that moves. It does not fly through the air: that is root motion, in A2 |
| 13 | Filter on `generic_average_male_transitions`, click the `.anims` | "Exporting the animations..." for up to about two minutes, and VS Code stays usable. Then 1,246 animations. Filter on `walk` and pick one: it plays within a moment. Close it and open it again: the export is not repeated. **Say how the wait felt** |
| 14 | Add `q001_00c_trauma_arrives_male_average.anims` to a test project and click it in the Project view | The same view, not read-only. Then delete the project's copy |

Tell me if anything looks wrong about the figure itself: its proportions, or a limb bending the wrong way.

**Result (2026-11-06, the owner, on the laptop):** steps 1 to 14 pass, with no fixes. In step 14 the project's copy showed "Exporting the animations..." on its first open, as expected: it is a separate file with its own export.

## Library view (#23)

Built 2026-11-15 ([design](design/library-view.html)). F5 with **Run REDcode with Opens Test (no other extensions)**. No game needs to run, but REDbridge must be running for Add to Library. Checked before: type check, build, `npm test` (48, six of them for the view's logic: the listing, the note keeping other tools' entries, the clashes, the files an item drops, nothing removed outside the project's `source` folder, Refresh's newer, same and missing). The view's VS Code side has not run yet.

| # | Do | Expected |
|---|---|---|
| 1 | Rename `%APPDATA%\EDGE\library.json` to `library.json.bak`. Open the REDcode sidebar | A **Library** view under Game Assets: "The EDGE Library is one folder of assets that every EDGE tool shares..." and **Set Up the Library...**. Rename the file back and press the view's **Refresh**: your Library shows |
| 2 | Look through the Library view | Your folders, then items by name, then loose `.glb` and other model files. A REDcode mesh says `mesh`; an EDGEfab prop says `prop · EDGEfab`; a Library bake says `bake`. Hover an item: name, kind, version, the tool, the main game path, its folder. Expand it: a line in words with the main path, and its version |
| 3 | Game Assets: **Add to Library...** on a small mesh (a chair or a crate), into a folder `REDcode test` | The Library view shows `REDcode test` with the new item, without pressing Refresh |
| 4 | Open a test project. Click the new item | Its main file opens in REDcode's editor, the mesh on its 3D view |
| 5 | The item's **+** (Add to Project) | "added <name> in <project>: N files", with **Pack and Play**. The Project view shows the files with the mesh selected. `source/library.json` has an entry with `"by": "redcode"`; any other tool's entries in it are still there |
| 6 | **+** on the same item again | No question: the files are its own. The message says "updated" |
| 7 | Game Assets: **Add to Project** on another small mesh. Then **Add to Library...** on that same game file, and **+** on its new Library item | A warning: adding it "would replace N files the project already has, which did not come from it", listing them. **Cancel**: nothing changes. **+** again and **Replace**: they are replaced |
| 8 | The view's title bar: **Refresh Project from Library** (the sync icon) | "everything <project> took from the Library is up to date" |
| 9 | Game Assets: **Add to Library...** on the step 3 mesh again, into the same folder, and choose **Replace**. Then **Refresh Project from Library** | A list with that item ticked, "version 1 → 2". Accept: "refreshed 1 item" |
| 10 | Right-click an EDGEfab prop, then a Library bake, then a folder | Only **Reveal in File Explorer**, and no **+** on the prop or the bake. Reveal opens File Explorer at it |
| 11 | **File > Close Folder**, then **+** on a REDcode item | "open a REDcode project to add Library items to it", with **Open Folder** |
| 12 | Optional, with EDGEfab installed: open the test project in a window with EDGEfab, and its **Refresh Project from Library** | It works as before: REDcode's entries in `source/library.json` do not trouble it |

Afterwards: delete the `REDcode test` folder from the Library in File Explorer, and press Refresh.

Run 1 (2026-11-15, scripted by the EDGEweb session: an EDGEkit trial editor on a267d78, `APPDATA` on a scratch folder with a copy of the owner's Library, an invented EDGEfab prop and a loose `.glb`; the owner's Library untouched), in progress: steps 1 and 2 pass. Step 3 failed: the item was written (`REDcode test/delivery_crate_a.mesh.asset`, 3 files copied, 12 left in the game) but the view showed it only after Refresh. The cause, as EDGEweb read it: the view refreshed after Add to Library's command ended, and the command ends only when its closing message is closed or its button pressed. Fixed: Add to Library tells the view as soon as the item is written (`libraryChanged` in `src/libraryCommand.ts`). Step 3 waits for a rerun.

Run 1, the rest: steps 4 to 8, 10 and 11 pass; step 12 not run yet. A made-up `"by": "edgefab"` entry in the note was kept through steps 6, 7 and 9. Step 7 asked about the one file, Cancel changed nothing, Replace replaced it. Step 9 failed while the item's mesh was still open from step 4: **Replace It** in Add to Library waited about 13 s and said something had a file open, "such as an antivirus" (EPERM), twice; the item stayed whole at version 1. With the editors closed it worked at once, and Refresh Project from Library offered "version 1 → 2" and refreshed 3 files. Fixed: Replace It first closes REDcode's editors on files inside the item (one with unsaved changes asks), and the message names an editor among the causes. Steps 3 and 9 wait for a rerun. Seen, as designed: quickhack items show with Reveal only; `.scene.json` files in the Library are not listed (EDGEbuilder's, as EDGEfab's view does not list them either).

Reruns on 032a635 (2026-11-15, the same setup): steps 3, 9 and 12 pass. Step 3: the new item showed a second later, with the message still up, no Refresh pressed (also on 6709eb5). Step 9 as written, with the step 4 tab open: Replace It took under a second, the tab closed by itself, the item went from version 2 to 3, and Refresh Project from Library offered "version 2 → 3" and refreshed 3 files. The question for a tab with unsaved changes was not tried. Step 12 (on 6709eb5, EDGEfab 0.1.0 loaded, two REDcode entries in the note): EDGEfab's Refresh Project from Library said the project has no props from the Library and left `source/library.json` byte for byte the same; EDGEfab refreshing its own item beside REDcode's was not tried, as the project had none. **The Library view passes.**

## Animations A2

Built 2026-11-15 for REDcode issue #21 ([design](design/animation.html#a2-as-built)), on REDbridge 0.13.0. No game needs to run. Checked before: type check, build, `npm test` (42), the smoke test against REDbridge 0.13.0 (23.6 s), and against the game with REDbridge 0.13.0 built from its tag: scratchpad `a2probe.mjs` (each body has all the bones its clips drive), `a2mod.mjs` (8 checks of `src/animsGlb.ts`: bodies, the cache's variants, the entity's account) and `a2harness.mjs` in Chrome with the real bundle (the base male body on the crew's clips, the paramedic with root motion on and off, the AV with bones only; no console errors). That automated tab ran slowly, so smooth playback has not been seen.

| # | Do | Expected |
|---|---|---|
| 1 | F5 with **Run REDcode with Opens Test (no other extensions)**. If REDcode says REDbridge is older than 0.13.0, press **Update REDbridge** | The REDcode output says REDbridge 0.13.0 |
| 2 | Game Assets: filter on `q001_00c_trauma_arrives_male_average`, click `q001_00c_trauma_arrives_male_average.anims` | It opens on **Animations**. Toolbar: Frame, **Body** (on), Bones, Root motion, `Rig man_base.rig`, `On Base male body`. A plain grey male body, with no head (heads are meshes of their own), stands on the grid and plays the first animation smoothly |
| 3 | **Bones** on, then **Body** off, then **Body** on and **Bones** off | Lines and dots over the body, moving with it; then the bones alone, as in A1; then the body again |
| 4 | Pick a few animations: `soldier_2_point_left`, `soldier_1_look_down`, `med_2_idle` | The body points, looks down, idles. **Say if a limb bends the wrong way, or the body tears** |
| 5 | Filter on `synced__q001_00c__male_average`, click the `.anims`. Pick `synced__q001_00c_trauma_arrives_soldiers__land_v1__soldier_01` | The base male body crouches and drops, in place |
| 6 | **Root motion** on. Let it play, then pause and drag the scrub bar | A moment's "Loading…", then the same animation goes on from the same moment. The body travels about 14 m and the view follows it, with the grid passing under it. Dragging moves the body along its path |
| 7 | **Root motion** off. Close the tab, open the file again, turn **Root motion** on, close and open it again | Back in place, and the view fits the body again. The second time it opens with Root motion on: REDcode remembers it. Turn it off again |
| 8 | Command Palette: **Opens Test: Open an Animation on the Paramedic** | The same file switches to the Trauma Team paramedic: helmet, clothes and a head, plain grey, playing `..._land_v1__soldier_01`. Toolbar: `On corpo__ep1_traumateam_ma.ent, corpo__traumateam_ma_paramedic__lvl1_01`; hover it: 22 meshes on 512 joints, and the far proxy left out. A couple of seconds the first time |
| 9 | Close the tab and run the same command again | It opens on the paramedic straight away |
| 10 | Filter on `synced__q001_00c__trauma_av`, click the `.anims`. **Root motion** on | The AV's bones only, with no Body button, as in A1. With Root motion on, its landing moves through the air (it ends about 2 m from where it starts) |
| 11 | Filter on `wa_gang_rifle_exploration`, click the `.anims` | `On Base female body`: a plain grey female body plays the clips |
| 12 | Command Palette: **Opens Test: Open an Animation** (the A1 command) | The crew file at `q001_00c_trauma_arrives___med_2_idle__01`, on the base male body |

Run 1 (2026-11-15, scripted by the EDGEweb session at the owner's request: an EDGEkit 1.140.6 trial editor with a scratch profile, REDcode from daf799c, Opens Test and the theme as development extensions, driven over CDP with screenshots): all 12 steps pass, with one finding. Update REDbridge took 0.12.1 to 0.13.0 (59 MB). The view ran at 60 fps, its longest gap 18 ms. No limb bent the wrong way and nothing tore in step 4. The paramedic opened in 1.8 s, and again in 0.6 s after the tab closed.
- **Finding, step 6:** with Root motion on, the body sat small at the left edge of the view. Frame fitted every bone, and `reference_joint` (a child of Root) stays several metres from the body: 3.9 m in that clip, mid-way. Also, in steps 5, 9 and 11, a clip that starts high (the drop from the AV) or climbs left the view for part of it, since the view was fitted to one moment. Fixed: Frame leaves `reference_joint` and `Trajectory` out (the bones view still draws them). In place it fits the whole animation, sampled at nine moments; with Root motion on it fits the pose of that moment, since the view follows the rig. The first animation shown fits the view to itself. Checked in Chrome with the harness: the soldiers' landing is in view and centred at 0.1 s in place, and at 4 s with Root motion on.
- A reopened file selects its first animation, not the last one picked; that is as in A1.
- Once used, **Open an Animation on the Paramedic** ranks above **Open an Animation** in the Command Palette, so step 12 needs the second row.

Rerun on 9b1f4b8 (2026-11-15, the same setup): steps 2, 5, 9 and 11 pass. The landing, the paramedic and the climb stay in view at every moment checked. Step 6 passes at 3.95 s and 7.74 s, and playing from 3.6 s to 6.4 s keeps the body centred while the grid passes. At 0.16 s, though, the body was still small. The cause: at the landing's start, `Root` (and `Trajectory` under it) stays on the ground 3.1 m below the hips while the body starts up in the AV. Fixed: Frame leaves `Root` out too. Checked in Chrome with the harness: at 0.16 s with Root motion on, the body fills the view; the AV's bones still frame as before. Step 6 waits for a rerun.

Step 6 rerun on 5469a6c (2026-11-15, the same setup): Frame fills the view at 0.16 s, 3.95 s and 7.74 s. But after Frame at 0.16 s, Play lost the body at 1.72 s and 3.37 s: the view followed `Root`, which stays on the ground while the body drops 3 m to it. Fixed: with Root motion on, the view follows `Hips` (a rig with none, such as the AV's, follows `Root`). Checked in Chrome with the harness: Frame at 0.16 s, then on to 1.72 s and 3.37 s, and the body stays in view. Step 6 waits for a rerun.

Step 6 rerun on 75cb474 (2026-11-15, the same setup): pass. With Root motion on, Frame at 0.16 s fills the view, and playing on, the whole body stays in view at 1.72 s, 3.41 s, 5.52 s and 7.42 s, a little right of centre at 3.4 s and 5.5 s. Frame at 3.95 s and 7.74 s centres it. The AV with Root motion on (it follows `Root`): its bones stay in the middle of the view at every moment, with the grid shifting under them. **Animations A2 passes.**

## Animation Probe A

Does a clip imported through REDbridge play in the game? The research's first probe ([report](research/animation-authoring.html), section 8; files and results in `tools/probes/anim-probe-a/README.md`). The offline half ran on 2026-11-20: the unchanged copy is exact, the Blender copy carries its 70-degree arm, and Blender's export drops WolvenKit's clip extras (copied back). The package `anim-probe-a` is installed in the game's REDnode apps folder.

| # | Do | Expected |
|---|---|---|
| 1 | In REDcode, open the folder `C:\Users\VYRAL\Documents\AnimProbeA`, then `source\archive\probe\anims\probe_a.anims`; pick `probe_a__arm`, then `probe_a__same` | The arm copy holds its left arm out; the same copy looks like the game's idle |
| 2 | Start the game with REDnode, load a save, stand somewhere open; in REDcode, **Pack and Play** on the project | REDcode says it swapped the archive through REDnode |
| 3 | In the REDnode overlay, switch on **Animation Probe A** with its bridge and archives permissions | Its window: Write and swap, Spawn, Play, game, same, arm |
| 4 | **Write and swap**, **Spawn**, **Play** | A paramedic 3 m in front of V starts the game's idle, perhaps after a brief T pose |
| 5 | **game**, **same**, **arm**, a few seconds apart | `same` looks exactly like `game`; `arm` holds the left arm out, the rest the same. Note any twitch or snap |
| 6 | **Remove the paramedic**, switch the package off | |

Run 1 (owner, 2026-11-21): step 4 first failed, because the package named its workspot `probe-a` and REDnode's `world.writeWorkspot` takes only a to z, 0 to 9 and `_` (package 0.1.1 uses `probe_a`). Then steps 4 and 5's **game** passed. **same** crashed the game: an access violation reading 0x3F69C, right after the jump (crash report `Cyberpunk2077-20261121-014819`, no stack). The likely cause (**unverified**): each imported clip keeps the game clip's `fallbackFrameIndices` (`[0]`, from WolvenKit's clip extras), but a new set from WolvenKit's import has empty fallback tables (`fallbackDataAddresses`, `fallbackDataAddressIndexes`, `fallbackAnimFrameDescs`, `fallbackAnimDescIndexes`, `fallbackAnimDataBuffer`), which WolvenKit never writes. The game's set fills them for 289 of its 292 clips; the 3 left out are additive clips with empty `fallbackFrameIndices`. Tried next: both probe clips' `fallbackFrameIndices` cleared (the project's copy patched; the first version kept in the scratchpad), packed and swapped in again.

Run 2 (owner, 2026-11-21), after Pack and Play of the patched set: **pass.** `same` plays as `game`, and `arm` raises the left arm, animated, the rest as the game's idle. **Play** put the paramedic in a very brief T pose first, before the first clip, which is the game's own (expected in step 4). So clearing `fallbackFrameIndices` was the fix; `prepare.mjs` now does it (step 3b). REDbridge does it too since 442721a (on its main, unreleased): `project.import` clears them on the clips it writes and says so in its notes. Run with that build and without step 3b, the probe writes a set byte for byte the one that passed here; REDbridge's probe checks it, and it and REDcode's smoke test pass. The comment on WolvenKit's fallback item: https://github.com/WolvenKit/WolvenKit/issues/1425#issuecomment-7059024153.

**Kept clips, checked the same day** (the REDnode session's question: the fix reads and writes the whole set again after WolvenKit's write). The arm clip imported over a copy of the game's 292-clip idle set (`template`, keep), once with REDbridge 0.18.0 and once with the fix, each result turned to WolvenKit JSON, whose buffers carry their bytes: **one difference**, the imported clip's `fallbackFrameIndices` (1 item, then none). The 292 kept clips, all 293 data chunks and the set's fallback tables are the same. Seen on the way, in both builds and so WolvenKit's own: the import puts the new clip first and writes one data chunk per clip (68 in the game's set), while the fallback tables stay as the game's (211 entries). Whether those still match the kept clips in the game is **unverified**. **Animation Probe A passes:** a clip imported through REDbridge, unchanged or edited in Blender, plays in the game.

## Animation Probe D

Can Uthana alone make a clip on the game's skeleton, and does it play, added as a new clip and in place of a game clip? ([report](research/animation-authoring.html), section 8; files and results in `tools/probes/anim-probe-d/README.md`.) The offline half ran on 2026-11-22: the base male body on `man_base.rig` uploaded to Uthana as is (auto-rig off), a 5 s text-to-motion wave generated onto it (`text-to-motion-3.0`), and Uthana's GLB came back on the game's own skeleton: all 71 animated bones by the game's names, the rest pose identical. Fitted by name (no retargeting), imported by REDbridge with no skips: `probe_d__wave` in a new set, and the same motion over `stand__2h_on_sides__01` in a copy of the game's idle set (291 clips kept). The package `anim-probe-d` is installed in the game's REDnode apps folder.

| # | Do | Expected |
|---|---|---|
| 1 | In REDcode, open the folder `C:\Users\VYRAL\Documents\AnimProbeD`, then `source\archive\probe\anims\probe_d.anims`; pick `probe_d__wave` | The base body raises its right hand and waves. Say whether it looks natural |
| 2 | Start the game with REDnode, load a save, stand somewhere open; in REDcode, **Pack and Play** on the project | REDcode says it swapped the archive through REDnode |
| 3 | In the REDnode overlay, switch on **Animation Probe D** with its bridge and archives permissions | Its window: Write and swap, Spawn, Play, kept, added, replaced |
| 4 | **Write and swap**, **Spawn**, **Play** | A paramedic 3 m in front of V starts **kept**: he stretches his arms |
| 5 | **kept**, **added**, **replaced**, a few seconds apart | **kept** stretches (a game clip the rewritten set kept: this also answers Probe A's open point on the kept clips' fallback tables); **added** and **replaced** both wave the right hand. Note any twitch, slide or snap |
| 6 | **Remove the paramedic**, switch the package off | |

If **added** waves but **replaced** shows the game's own idle, the game may still hold the set it loaded before the swap (**unverified**): **Pack and Install**, restart the game, and try **replaced** again.

Run 1 (owner, 2026-11-22): **kept** played (he stretched his arms), but on **Play** the paramedic sank about a foot into the ground. **added** and **replaced** were wild and scattered, the mesh warped; no wave. The cause: the fit wrote rotation on every bone but translation on `Hips` only, and the game reads a bone with no translation keys as not at its rest length, so the skeleton collapsed (REDcode's view falls back on the rest pose, so it looked right there). The game's clip keys translation and rotation on all 71 bones. Fixed the same day: the fit writes every channel the game clip has, Uthana's where it has them (rotation on every bone, translation on `Root` and `Hips`), the rig's rest value otherwise; read back, 71 translation and 71 rotation channels, every bone at its rig length. The sinking is not in the clip: the game's stretch clip holds `Hips` at 0.96 m throughout, as the idle does; where the workspot puts him is the likely cause (**unverified**). Next: run 2, Pack and Play again.

Run 2 (owner, 2026-11-22), after Pack and Play of the refitted sets: **pass** ("It worked now"). **Animation Probe D passes:** a clip Uthana made from a text prompt, on the game's own skeleton, with no Blender and no retargeting of our own, plays in the game, both as a new clip and in place of a game clip, and the rewritten set's kept clip plays too. The paramedic still sank a little, less than in run 1 (the owner). Measured by forward kinematics on the written clips: Uthana puts the heel joints on its floor (the wave's lowest heel -0.9 cm, hips 90.5 cm), where the game's standing clips keep them about 3 cm up, the sole being below the joint (the stretch clip: heels 2.9 cm, toes 2.2 cm, hips 95.9 cm). Fixed the same day: the fit lifts the hips until the clip's lowest heel or toe is as high as the game idle's (3.1 cm here; heels now 2.2 and 3.0 cm, hips 93.8 cm). Uthana's toes stay a little higher than the game's (4 to 5 cm against 2.2 cm): its feet tip up slightly, a cleanup for later. Not yet seen in the game.

## anim-core check

`node packages/anim-core/scripts/check.mjs <REDbridge.exe> <game folder> <Probe D's project folder>` ([design](design/animation-tools.html#at1-as-built-2026-11-22)). It needs the game, the Uthana key in the shared store and Probe D's project; it starts no paid job and writes only into a scratch folder.

| # | Checks |
|---|---|
| 1 | The probe's own fit and replace, into a fresh project from Probe D's downloaded motion |
| 2 | The library's fit: every channel, on the game's own skeleton (rest pose within 0.04 degrees) |
| 3 | The library's add and replace into another fresh project; both sets byte for byte the probe's; the replaced set keeps its 292 clips |
| 4 | Uthana: the key works; the stand-in uploads to Probe D's character; a second ask uses the record; the record holds no key; the download matches the probe's file |
| 5 | A made clip in its own set with its `.glb` and record (EDGEfab #7's layout); made again, its id stays |
| 6 | The woman's rig: her reference clip's 71 bones, all in her stand-in |
| 7 | `rigFor`, clip names, costs |

Run 2026-11-22 with REDbridge main (0.18.0 and the fallback frames fix): **pass, 18 of 18**, after two fixes found by the first run (the woman's reference clip, `-0` in rest translations). Then **20 of 20** with EDGEfab #7's layout, and EDGEdir's own reader (`projectAnims`) found both made clips in the check's project.

## Animation Tools AT2

Making clips in REDcode ([design](design/animation-tools.html#at2-as-built-2026-11-22)): the Make panel in the animation view, the commands, and the first paid Generate through REDcode. Two Generates, about $1 on the owner's Uthana account; the rest is free. REDbridge 0.18.0 is enough, and is the release's minimum (2026-11-22: 0.18.0 reads any service id, and the fit clears fallback frames itself); on 0.18.0 step 1's row reads `uthana`, where REDbridge 0.19.0 names it Uthana.

| # | Do | Expected |
|---|---|---|
| 1 | F5 with **Run REDcode with Opens Test (no other extensions)**, the folder `C:\Users\VYRAL\Documents\AnimProbeD` open. Look at the Keys view | Uthana is listed, set |
| 2 | In Game Assets, open `base\animations\npc\generic_characters\male_average\interactive_scene\generic_male_average__stand__2h_on_sides__01.anims`; press **Make** in the animation view's bar | A panel above the clip list: the words, the model (3.0, $0.10/s), the length (5 s), In place, As written, a name, **As a new clip in the project**, **Generate, $0.50** and **From a GLB…** |
| 3 | Words: "a man stands relaxed, then crosses his arms and taps his right foot". **Generate** | The stages show under the panel; in a minute or two the new clip opens in a new tab on the base body and plays. The Project view shows `animprobed\anims\man_stands_relaxed_crosses\` with the set, and under source/raw the clip's `.glb`, `.source.glb` and `.edgefab.json` |
| 3b | Look at the new clip's tab | Its Make panel is open: a line says how it was made (Uthana 3.0, 5 s, about $0.50, when, with the grounding rule), and the words, model, length and switches are the ones used |
| 4 | Back in the game set's tab, **Generate** again with the same words and no name | It is made as `man_stands_relaxed_crosses_2`, beside the first |
| 5 | Type the first clip's name (`man_stands_relaxed_crosses`) in Name and press **Generate**; at the question, press Escape | Before anything is paid, a question: **Make It Again** (it keeps its id) or **Keep Both**. Escape makes nothing and the panel is quiet |
| 6 | In the game set's tab, pick `stand__2h_on_sides__01__stretch_arms__01` in the clip list. In the Make panel's second dropdown (beside Name, "As a new clip in the project"), choose **Replace stand__2h_on_sides__01__stretch_arms__01 (a copy of this set in the project)**; then **From a GLB…** and pick `C:\Users\VYRAL\Documents\AnimProbeD\uthana\mz78xjkXMWPK-inplace.glb` | Free. The project's copy of the set opens at that clip, and it waves (Probe D's motion). The note says the copy replaces the game's whole set |
| 7 | In the Project view, right-click `source/raw/animprobed/anims/man_stands_relaxed_crosses/man_stands_relaxed_crosses.glb` and **Add a Clip from GLB**, man's rig, name `crossed_arms_copy` | Free. A new clip `crossed_arms_copy` opens and plays the same motion as step 3's |
| 8 | Start the game with REDnode; **Pack and Play** the project; in the overlay, **Animation Probe D**: **Write and swap**, **Spawn**, **Play**, then **kept** | **kept** now waves (its clip was replaced in step 6); **replaced** waves too (Probe D's replacement) |
| 9 | Optional: the Command Palette's **Generate an Animation with Uthana** (a third $0.50) | It asks the rig, the words and the length, shows the stages in a notification, and opens the clip |

Run 1 (owner, 2026-11-22), in progress: step 3 made the clip with Name empty, as meant (the name comes from the words). Found: nothing showed that Generate was working, and the panel's inputs could still be changed. Fixed the same day: while a make runs, every input in the panel is off, the button shows a spinner, the stage and the time so far (its tooltip says it is generating), a bar under it steps through the stages, and a notification shows each stage; a second make from any animation view is refused until it ends. Typecheck, build and unit checks pass; not run in VS Code yet.

### The Project view after a reload

Asked in AT2's run (the owner, 2026-11-22): after **Developer: Reload Window** the Project view came back with every folder shut. Built the same day: the view remembers the roots and folders opened or shut (workspace state `redcode.projectTreeOpen`) and opens them again. Collapse All is not seen by the extension, so folders shut that way open again after a reload until opened and shut by hand. Typecheck, build and unit checks pass; **not run** in VS Code.

| # | Do | Expected |
|---|---|---|
| P1 | Open a few folders under Archive and Raw, shut the Packed root, then **Developer: Reload Window** | The same folders are open and Packed is shut |
| P2 | Shut one of those folders, reload | It stays shut; the others stay open |

## Animation Tools pack (AT3)

The REDnode pack in the game ([design](design/animation-tools.html#at3-as-built-2026-11-22); files in `packs/animation-tools/README.md`). Installed in the game's REDnode apps folder on 2026-11-22 (`node packs/animation-tools/build.mjs --install <game>`). Up to four Generates, about $2 on the owner's Uthana account. REDnode 0.68.0 or later, with REDbridge found by REDnode (its Mod Manager offers **Get REDbridge** when not).

| # | Do | Expected |
|---|---|---|
| 1 | Close VS Code. Start the game with REDnode, load a save, stand V somewhere open. In the Mod Manager, switch on **Animation Tools** and allow its bridge, archives and Uthana key permissions | Its window: the project line, Character, Make a clip, Custom animations |
| 2 | Read the project line | With no REDcode window open on a project: the pack's own project, `Documents\REDnode\Animation Tools` |
| 3 | Character **Trauma Team medic (man)**, **Spawn** | The medic 3 m in front of V, facing V. Say if he faces away |
| 4 | What it shows: "a man stands relaxed, then crosses his arms and taps his right foot", 5 s; **Generate, $0.50** | The first time, REDnode's key window asks for the Uthana key (Allow). The status line goes through the stages; in a minute or two the medic plays it, after a brief T pose (the game's own, the first time a workspot plays) |
| 5 | Generate a second: "a man looks around nervously, then shrugs" | It plays on the medic at once; **Custom animations** lists both, newest first, with their words |
| 6 | Pick the first in the list, **Play**; then **Stop** | He switches to it at once; Stop returns him to standing. Note any twitch or snap |
| 7 | Character **Corpo plaza woman (woman)**, **Spawn** | The medic goes and a woman stands in front of V; her list says no made clips on this rig yet |
| 8 | "a woman stretches her arms above her head, then relaxes", **Generate** | The woman's stand-in uploads first (once, free), then she plays it. Say if her body looks wrong (it is her rig's first clip) |
| 9 | Open VS Code with REDcode on a project (`C:\Users\VYRAL\Documents\AnimProbeD`); in the game, press the window's refresh icon | The project line names REDcode's project AnimProbeD; the lists show that project's made clips |
| 10 | Optional: one more Generate there | The clip shows in REDcode's Project view under `animprobed\anims\<name>\` |
| 11 | **Remove**, switch the app off | The character is gone |

Run 1 (owner, 2026-11-22), in progress: at step 4, **Generate** showed nothing while it worked. Fixed the same day: while a Generate runs, the button is disabled and shows a spinner, the stage and the time so far ("◓ Uthana is making it… 0:42"); a progress bar under it steps through the 8 stages; a line under it says what each stage is doing, since REDnode's UI kit has no tooltips; Spawn, Remove, Play and Stop are off until it ends. Checked outside the game (`check.mjs`: the button disabled with the spinner and stages, then enabled with its price; the bar at 8 of 8). Installed again: switch the app off and on in the Mod Manager to load it. The owner also asked for a tooltip on the busy button that says only that it is generating: REDnode #55, built in REDnode 0.70.0 (f39ffbb, not released). The pack sets `tip: 'Generating…'` in the click and clears it at the end (`check.mjs` sees both); an older REDnode ignores `tip`, so the pack's range stays `>=0.68.0` until the release that carries it.

Run 1, more (owner, 2026-11-22): the character **turned away from V** when the clip started, and in the crossed-arms clip **the feet floated**: neither was fully planted, and one drifted aside while the other lifted to tap. Found and fixed the same day:
- **Facing:** Uthana starts its motion turned 146 degrees from the game's facing (both made clips measured the same), and the game plays a clip from the character's own facing. The fit now turns the whole motion about the vertical so its first frame faces as the game's idle does (checked: the hips' facing 93 degrees, as the idle's). The test clip `man_stands_relaxed_crosses` in AnimProbeD was fitted again from its kept motion, id kept, so it shows the fix without a new Generate.
- **The feet:** every prompt now carries a grounding rule (anim-core's `GroundingRule`, the owner's words: lifting a leg, stepping, running and jumping are normal; a foot that bears weight is flat and does not slide; no foot floats, drifts or hovers; no shuffling unless asked). **Upper body only** (Uthana's `torso_only`) holds the legs still for arm motions. Whether the rule is enough is this test's next Generate; a foot lock in the fit is the next step if it is not.

## Keys (K4b)

Built 2026-11-20 (REDcode issue #33, [design](design/keys.html#k4b-as-built-2026-11-20)). Checked before: 3 unit checks, and REDcode's key calls against REDbridge built from main on a scratch folder with test keys (see the design page). **Not run:** anything in VS Code. These steps use your real key store, `%APPDATA%\Edgemodders\keys`, which REDnode's in-game Keys view shares: use a test key you can remove, or note which keys are set first.

| # | Do | Expected |
|---|---|---|
| 1 | In the F5 window, **REDcode: Update REDbridge** (REDbridge 0.18.0, released 2026-11-21, has the key store) | The REDcode output says REDbridge 0.18.0 |
| 2 | Open the **Keys** view in REDcode's sidebar (below LocKeys) | Anthropic, Gemini, OpenAI, ElevenLabs and Tripo, each with "not set", or the last four characters and the tools that read it for keys you already have |
| 3 | The pencil on Tripo (or any service you do not use), paste `tsk-test-1234` | The row shows `…1234 · not used yet`. REDnode's in-game Keys view, if open, shows it too |
| 4 | The pencil again, type `not a key` | The box asks again with REDbridge's reason; Escape leaves the key as it was |
| 5 | Command Palette: **Opens Test: Read a Key** (it calls `REDcodeApi.keys.get("tripo", "Opens Test")`) | A question: "Opens Test wants your Tripo key", Allow or Don't Allow. **Allow**: a message shows the key's last four characters. The row now says `used by Opens Test` |
| 6 | **Opens Test: Read a Key** again | No question this time |
| 7 | The view's `...` menu: **Forget Tool Permissions for Keys**, then **Opens Test: Read a Key**, and **Don't Allow** | The question comes back; Don't Allow gives "no key", and the next read does not ask again |
| 8 | The trash can on Tripo, **Remove** | The row is back to "not set" |
| 9 | Optional, only if you keep a REDbridge 0.17.0 somewhere: point `redcode.bridgePath` at it, **Restart REDbridge**, then put it back | The Keys view says the key store needs REDbridge 0.18.0, with Update REDbridge (already checked against 0.17.0 outside VS Code on 2026-11-20) |

Result 2026-11-21, reported by the owner: steps 1 to 8 pass, on REDbridge 0.18.0 through Update REDbridge. Step 9, the optional one, was not run; its message was checked against REDbridge 0.17.0 outside VS Code on 2026-11-20. **Keys (K4b) passes.** What is left for the key API is K4c, the pilot in EDGEwave (EDGEwave #12), MCP use included, before any REDcode release with it.

### Key status

Built 2026-11-22, from EDGEfab's K4d test (a tool could not tell "no key" from "you said no"; [design](design/keys.html#open)): `REDcodeApi.keys.status(service, caller)`, and Opens Test's **Read a Key** says why it got no key; then (the owner, the same day) an unlock button on each key's row that forgets the tool permissions for that key only, and the row's tooltip naming the tools allowed and refused (S6, S7). Checked before: typecheck and the unit checks (77, for `keyStatus`, `answersFor` and `withoutService`). **Not run:** anything in VS Code. It also checks what closing the question does, which EDGEfab's test left open.

| # | Do | Expected |
|---|---|---|
| S1 | F5 with **Run REDcode with Opens Test (no other extensions)**. The Keys view's `...` menu: **Forget Tool Permissions for Keys**. Then **Opens Test: Read a Key**, and close the question with **Esc** | "no key (the question was dismissed)", with `"access":"unasked"`. Nothing is remembered |
| S2 | **Read a Key** again, and close the question with its **X** (or **Cancel**) | The question came back; the same "dismissed" message |
| S3 | **Read a Key** again, and **Don't Allow** | "no key (you said Don't Allow)", with `"access":"denied"` |
| S4 | **Read a Key** again | No question; "you said Don't Allow" again |
| S5 | **Forget Tool Permissions for Keys**, **Read a Key**, **Allow** | The key's last four characters, as before |
| S6 | Hover the Tripo row in the Keys view | Its tooltip ends "Allowed: opens test". An unlock button shows beside Set Key; rows no tool has asked for have none |
| S7 | Allow another tool on another key first (say EDGEmat's Gemini or OpenAI). Then the Tripo row's unlock button, **Forget** | A question lists "opens test: allowed". After Forget the row has no unlock button, **Read a Key** asks again, and the other key's row still shows its tool |

If S1 or S2 says "you said Don't Allow", closing the question is saved as a no on this PC, and that is a bug to fix.

## Edit in Blender: skinned meshes

A modder found that **Edit in Blender** opened nothing for a skinned mesh: Blender's glTF importer failed with "'Context' object has no attribute 'object'", since the script's context had no window after `read_factory_settings`. Fixed on 2026-11-20 (8624c65, from the REDnode session, with the modder's fix): the import, and the export on each save, run with a window and a 3D view in their context.

- **Checked outside VS Code:** Blender 5.3 (Steam), the base male body exported on its deformations rig (`t0_000_ma_base__full.mesh` with `man_base_deformations.rig`): the old script saved no `.blend`; the new one opened it (1 armature, 187 bones, 11 skinned meshes) and exported it again on save (1 skin, 187 joints, tangents on all 11 meshes). A stand-in `bpy` covered no window, Blender before 3.2 and an exporter without the normals and tangents keywords.

| Step | Do | Expect |
|---|---|---|
| 1 | F5 (REDcode main). Add a skinned mesh to a project, such as `base\characters\common\base_bodies\man_average\t0_000_ma_base__full.mesh` or any garment, and **Export to Raw** it (no rig to choose: the export skins it on the mesh's own bones, 172 for this body, checked 2026-11-20) | A `.glb` in Raw |
| 2 | Right-click the `.glb`, **Edit in Blender** | Blender opens with the body and its armature, no error in Blender's console |
| 3 | Move a vertex, Ctrl+S | REDcode imports the mesh back; the mesh view shows the change |
| 4 | A plain mesh (a prop), **Edit in Blender**, change it, Ctrl+S | As before the fix |

Result 2026-11-20, reported by the owner: steps 1 to 4 pass, on the base male body in Blender 5.3. Step 1 no longer names a rig (Export to Raw asks for none; the plain export skins the body on its own 172 bones). A first try added an Icosphere, which the import leaves out (it writes back only the mesh's own parts, by name), so nothing showed; an edit to a body part showed at once.

**The warning for objects the import leaves out** (built 2026-11-20 after that test, unreleased): the save hook names mesh objects that were not the file's parts when Blender opened it, and REDcode warns once for each new set of names. Checked in Blender 5.3 in the background: a save with only the body names nothing, and after adding a sphere the next save names `Icosphere.001`. **Not run:** the warning in VS Code.

| # | Do | Expected |
|---|---|---|
| W1 | **Edit in Blender** on a mesh's `.glb`, add a sphere (Add > Mesh > Ico Sphere), Ctrl+S | After the import, a warning names the sphere, says the import left it out, and says to join it into a part with Ctrl+J. Saving again with the sphere still there does not warn again |
| W2 | Join the sphere into a part (select it, then the part, Ctrl+J), Ctrl+S | No warning |

Result 2026-11-20, reported by the owner: W1 and W2 pass; the warning named `Icosphere.001`.

## Animations A3

Built 2026-11-20 ([design](design/animation.html#a3-as-built), REDcode issue #21). Synced sets: a synced clip's members across the `.anims` files of its folder, placed by the sync tracks and played on one clock. **Needs REDbridge 0.17.0** (`anims.sync` and root motion in seconds, REDbridge #19), which REDcode's minimum is raised to at the release; until it is out, a REDbridge built from its main. Checked before:
- **Unit checks:** 62, six for A3: names, members and alternatives; the rigid math; a placement from either side; members in step told apart; a member nothing places; seconds against fractions; Root keys from a GLB.
- **The solve on the Trauma Team folder:** the landing and the take-off match the placements worked out by hand on 2026-11-19, from either the AV or a soldier as the opened clip.
- **The view in Chrome over the real bridge** (scratchpad `a3harness.mjs`):
  - The landing played as a set, with no errors. At the start both soldiers stand inside the AV's bones; at the end they are on the ground out from the AV, about 4 m apart.
  - The `injector` set placed the player, Jackie and Sandra, and marked the player's files SIMD.

| # | Do | Expected |
|---|---|---|
| 1 | **REDcode: Update REDbridge** to 0.17.0 (released 2026-11-20; REDcode's minimum since then), then F5 with **Run REDcode with Opens Test (no other extensions)**. **REDcode: Search game files**, `synced__q001_00c__male_average.anims`, open it. In the list, pick `synced__q001_00c_trauma_arrives_soldiers__land_v1__soldier_01` | Under the list, **Synced set**: soldier_01 (this file), av and soldier_02, each with a colour and a tick, and **Play the Set**. Before the pick, the first animation (`girl_start_idles`, a still pose) shows 0.40 s and the time bar runs forward, not backwards (fixed 2026-11-20); `body_end_idle` (2 frames) opens paused |
| 1a | Drag the splitter between the 3D view and the list to the left; double-click it; drag it again, close the editor and open the file again | The list widens and the 3D view narrows, so the long names show whole; double-click puts back the default width; the dragged width is kept on reopening (also in a mesh's 3D view, which shares it) |
| 2 | **Play the Set** | **Root motion** turns on; the button says Placing, then Loading. Then the AV (bones only: a vehicle rig) and soldier_02 (a body) join soldier_01, and both rows say **placed**. Hovering a row says which track placed it |
| 3 | Drag the time to the start, then to the end | At the start both soldiers stand up inside the AV's bones; at the end both are on the ground well out from it, about 4 m apart. Play, Pause, the frame steps, **Loop** and the speed move all three together |
| 4 | **Bones**, **Body** and **Frame** | They act on every member; Frame fits the whole set over the clip |
| 5 | Untick soldier_02; then tick it again | soldier_02 goes, then comes back where it was |
| 6 | Turn **Root motion** off | The set stops; soldier_01 plays alone, in place |
| 7 | Pick a clip that is not synced, such as `q001_00c_trauma_av_idle__02` in `synced__q001_00c__trauma_av.anims` | No **Synced set** section |
| 8 | In `synced__q001_00c__trauma_av.anims`, pick `synced__q001_00c_trauma_leaves_soldiers__av`, **Play the Set** | The soldiers walk to the AV and leave with it; the AV's flight spreads over the whole 15 s, not its first second |
| 9 | Open `synced__q001_00c__syringe.anims`, pick `synced__q001_00c_injector__syringe` | The set lists fpp twice (player_female and player_male, one ticked), jackie and sandra. Ticking one fpp unticks the other |
| 10 | **Play the Set** | Sandra kneels; Jackie (bones only: `man_big.rig`) stands by her; the player (bones only: the player rig has no base body) is a whole skeleton beside them, not collapsed to one point: REDbridge 0.17.0 fixed that SIMD export (REDbridge #20) |
| 11 | In the Command Palette (Ctrl+Shift+P), run **Opens Test: Play an Animation's Synced Set** (from the Opens Test extension, which this launch config loads; it calls `REDcodeApi.openAnimation` with `set: true`) | The landing opens with its set playing, soldier_02 on the Trauma Team paramedic's meshes |

Result 2026-11-20, reported by the owner: steps 1 to 11 pass on REDbridge 0.17.0. Fixes it raised, each in before the steps were finished: a splitter to widen the list (step 1a; the names did not fit), each animation's length from the file rather than its last key (the first clip, a still pose, looped 0.017 s and its time bar seemed to run backwards), and checkboxes in the theme's colours. Step 11 now says it is a Command Palette command.

## Replace with a WAV, titled models (#29) and every window's project (#32)

Built 2026-11-20 after 0.10.14, three small items. Checked before:
- **Unit checks:** 63 pass, one new for #32. The extension's state files for two live windows and a closed one, read by the package's own `service.mjs` with a stand-in `rednode` module: `projects()` lists the live ones, the last focused first; the closed one's file is cleared; `project()` is unchanged; withdrawing removes the window's file; the package's version is raised.
- **A WAV against REDbridge:** a WAV named by a game sound's hash (832549876) imports through `sound.importWavs`, and an unknown hash is refused with the reason the button shows.
- **Not run:** anything in VS Code, and `projects()` in the game.

| # | Do | Expected |
|---|---|---|
| 1 | F5 with **Run REDcode with Opens Test (no other extensions)**. First with no project open: **REDcode: Browse Game Sounds**, pick a sound, **Replace…**. Then open a test project (a folder with a `.cpmodproj`; the Project view shows it) and browse again | **Replace…** beside Copy Hash, enabled once a sound is picked. Without a project, it says a project is needed and offers **New Project** and **Open Folder** |
| 2 | **Replace…**, pick any WAV | The project gets `source\raw\sounds\<hash>.wav`, and the Project view selects the new `sfx_container_*.opuspak` under Archive. A message offers **Pack and Play** |
| 3 | **Replace…** on the same sound with another WAV | It asks before putting it in place of the first one |
| 4 | **Pack and Play** with the game running under REDnode (MCP server on), and make the sound happen in the game | Your WAV plays instead of the game's sound |
| 5 | Close the project's folder, open Browse Game Sounds again | **Replace…** still shows; a click says it needs a project and offers **New Project** and **Open Folder** (changed 2026-11-20 in step 1) |
| 6 | **Opens Test: Open a Model with a Title**, pick a `.glb`, title `a battered vending machine` | A 3D tab titled **a battered vending machine**, with the model |
| 7 | The same command, same file, title `vending machine, renamed` | The same tab comes forward with the new title; no second tab |
| 8 | Change the `.glb` on disk (export it again, or copy another over it) | The tab redraws |
| 9 | **Opens Test: Close the Models in a Folder**, pick the `.glb`'s folder | The tab closes; the message says 1 tab closed |
| 10 | **REDcode: New Project** in a folder VS Code has not seen | Before it opens, a message says to trust the folder if VS Code asks. **Open Project** opens it; **Open, and Don't Say This Again** stops the message |
| 11 | Two windows of the development build, each with a REDcode project: in the F5 window, **File > New Window** (Ctrl+Shift+N) opens a second window that runs the same build; a normal VS Code window runs the store REDcode, whose older REDnode package lacks `projects`. Start the game with REDnode, MCP server on. Ask Claude to call `redcode__projects` | Both projects, the window focused last first, each with `focusedAt`. `redcode__project` answers the one focused last |
| 12 | Focus the other window, call `redcode__projects` again; then close one window and call it within 5 seconds | The order follows the focus; the closed window's project drops out |

Result 2026-11-20, reported by the owner: steps 1 to 12 pass. Step 4 in the game: `cmn_generic_work_inhaler` picks one of four sounds, so replacing one was heard one time in four; with all four replaced the game played the WAV (Replace All is next, from this). Fixes it raised: **Replace…** shows without a project and offers New Project or Open Folder (steps 1 and 5); and an older REDcode in another window no longer puts its older REDnode package back over a newer one (found in step 11: the store 0.10.14 put 0.1.0 back over 0.2.0; a New Window from the F5 window is a normal window with the store REDcode, so steps 11 and 12 ran with today's build installed from a vsix).

## Replace All

Built 2026-11-20 from the hand test above, where `cmn_generic_work_inhaler` picks one of four sounds and replacing one was heard one time in four. Checked before: typecheck and the unit checks (67); REDbridge's `sound.importWavs` lists the hashes it imported, which the partial case relies on. **Not run:** anything in VS Code.

| # | Do | Expected |
|---|---|---|
| 1 | F5 with **Run REDcode with Opens Test (no other extensions)**, a test project open. **REDcode: Browse Game Sounds**, filter `cmn_generic_work_inhaler`, play variation 2, **Replace…** | A question: the event plays one of 4 sounds at random, with **Replace All 4** and **Only This One** |
| 2 | **Replace All 4**, pick a WAV | The file dialog's title names the 4 sounds. Since the project already has replacements from the test above, a second question names them, with **Replace Them** |
| 3 | **Replace Them** | One progress message; then "All 4 sounds of cmn_generic_work_inhaler are replaced" with **Pack and Play**. `source\raw\sounds` has the four `<hash>.wav`, each the picked WAV |
| 4 | Pick a single-sound event, such as `it_inhaler_heal`, **Replace…** | No question about variations: straight to the file dialog, as before |
| 5 | **Pack and Play**; in the game, watch an NPC use an inhaler a few times | Your WAV every time |

Result 2026-11-20, reported by the owner: steps 1 to 5 pass. Step 5 ran as Pack and Install with the game closed, which raised a fix: the earlier Pack and Play had swapped the archive in through REDnode, which REDcode did not record, so Pack and Install took the project's own archive for someone else's and asked to back it up. Archives swapped in through REDnode are now recorded as the project's (`recordSwapped` in `src/install.ts`, a unit check).

## Sector view

Built 2026-11-20 ([design](design/sector-view.html#as-built-part-1)). A `.streamingsector` in 3D, read-only, on the `@edgemodders/world-view` package. Needs REDbridge 0.12.0 or later. Checked before:
- **Unit checks:** 66 pass, three for the package's host half: the matrices against three.js, items to batches and markers, and the loader against a stand-in bridge.
- **The page in Chrome over the real bridge** (scratchpad `svharness.mjs`), on `exterior_-22_7_0_0`:
  - 105 meshes drawn 8,986 times and 202 markers, nothing skipped;
  - buildings upright on their ground;
  - a pick sending `nodeData.Data.780`;
  - Coarser levels loading.

| # | Do | Expected |
|---|---|---|
| 1 | F5 with **Run REDcode with Opens Test (no other extensions)**. **REDcode: Search game files**, `exterior_-22_7_0_0.streamingsector`, open it | The editor opens on **3D**: the sector's buildings and street, with a progress line while meshes export the first time (E0 measured 2 to 11 s for a busy sector), then a count such as "105 meshes, 8,986 of 8,986 copies shown, 202 markers" |
| 2 | Drag to turn, right-drag to pan, the wheel to zoom; click the view, then W, A, S, D, Q, E, and Shift with them | The camera turns, pans and flies; Shift is faster |
| 3 | Click a building | It is outlined in the accent colour; the line below says its id (`...#<entry>` or `...#<entry>.<copy>`); the Properties view shows `nodeData.Data.<entry>` |
| 4 | **Show in Tree** | The tree opens at that node data entry |
| 5 | **3D** again, **Streamed** | Only what is within each thing's streaming distance of the camera shows; fly closer and more appears |
| 6 | **Markers** off and on; **By material**; the light from 0.5× to 2.5×; **Fixed light**, then turn the view | Markers go and come back; the colours change; the scene gets darker and brighter; with Fixed light the shading stays put on the buildings while the view turns |
| 7 | **Coarser levels** | The coarser sectors over this one load (their meshes export the first time, which can take minutes for a busy area), and the progress line counts them |
| 8 | Close the tab and open the sector again | It draws at once from the cache |
| 9 | **Add to Project** on the sector (the **+** on its row in **Search game files**, or on the file in **Game Assets**), open the project's copy from the Project view, change a node data entry's `position` in the tree, save | The 3D view draws the saved copy, the moved thing in its new place |
| 10b | Open any `.mesh` (3D), then an `.anims` (Animations) | Both have **Light** and **Fixed light** in their toolbars. A dark material is easier to read at 1.5× or 2.5×; metals are not black. The light chosen in one view is the one the next view opens with, in this window (REDcode issue #31) |
| 10 | Close the sector's tab. In the Command Palette (Ctrl+Shift+P), **Opens Test: Open a Sector at Entry 780** (it calls `REDcodeApi.openSector(path, { select: 780 })`) | The sector opens with entry 780 picked and framed |

Result 2026-11-20, reported by the owner: steps 1 to 10b pass. Two fixes came first: the mesh cache folder was named by the raw game stamp (its `:` and `|` made every export fail, so step 1 showed 202 markers and no meshes; now a hash of it, with a unit check, and the load is logged), and the 3D view is built once at a time (a guard; not the cause here). Step 9 now says where Add to Project is. The owner asked for three changes: progress while **Coarser levels** loads (it looked as if nothing happened), and **Show in Tree** and back keeping the 3D view, its camera and the coarser sectors loaded.

Built the same day (checked in Chrome with the editor page over REDbridge 0.17.0, scratchpad `edharness.mjs`: Coarser levels found 238 sectors and counted them as it read; Tree and back while it loaded gave the same canvas, and the reading went on). To retest:

| # | Do | Expected |
|---|---|---|
| R1 | **Coarser levels** | The button says **Loading coarser levels…** and is greyed; a bar moves over the top of the view, then fills as "Reading sectors: n of 238" counts up, then "Exporting meshes: n of m". When done the button is back |
| R2 | While it loads, or after: turn the camera somewhere, pick a building, **Show in Tree**, then **3D** in the header | The same view: the camera where you left it, the coarser sectors still there (and still loading if they were) |
| R3 | An `.anims`: play an animation, **Tree**, then **Animations** | The same animation, where it had got to |

Result 2026-11-20, reported by the owner: R1 to R3 pass. Found in it: **Show in Tree** on entry 729 stopped at the tree's first 200 entries. Fixed the same day (the tree loads the pages on the way and scrolls to the row; checked in Chrome on entry 960), with **Add to Project** in the header of a game file, which the owner asked for. To retest:

| # | Do | Expected |
|---|---|---|
| R4 | Pick a building far down the list (an entry above 200), **Show in Tree** | The tree opens at `nodeData.Data.<entry>`, selected and scrolled into view |
| R5 | On the game sector, **Add to Project** in the header | The copy is added and selected in the Project view; the button shows on game files only, not on the project's copy |

Result 2026-11-20, reported by the owner: R4 and R5 pass. The Sector view test is complete.

## Sector materials (M1)

Built 2026-11-21 ([design](design/sector-materials.html)): **By material** by the real material names, the **Materials** switch for the picked thing, and the picked panel. Checked before:
- **Type check, build, unit checks:** 75 pass, one new for the host half's `meshMaterials` (read once, kept beside the export, found by appearance) and the placements' appearance.
- **The page in Chrome over REDbridge 0.18.0** (scratchpad `sm/svharness2.mjs`, the game running), on `exterior_-22_7_0_0`:
  - **By material:** 105 meshes' names read in about 2 s; the buildings share `ml_cct_cpz_building_a_masksset` and show one colour.
  - **A pick:** the panel named the mesh, its appearance and its material.
  - **Materials:** the cardboard trash (#357) drew with its colour map, rendered by edgemat-core 0.3.2 in REDcode.

Found while checking:
- **No textures from WolvenKit:** its export "with materials" writes a `.Material.json` beside the .glb and no textures in it. So the switch puts rendered maps on the plain export instead, and renders with the edgemat-core REDcode bundles when EDGEmat is not installed.
- **World materials render flat grey:** the world's multilayered materials (`multilayered.mt` with an `.mlsetup` and an `..._masksset.mlmask`, as on the corporate plaza buildings and the sidewalk) come out a flat grey from EDGEmat's renderer. That is EDGEmat's to improve, asked in M2's request.

| # | Do | Expected |
|---|---|---|
| 1 | F5 with **Run REDcode with Opens Test (no other extensions)**. Open `exterior_-22_7_0_0.streamingsector` (Search game files) | As before: the sector in 3D, in colours by mesh, which now differ in lightness and strength as well as hue |
| 2 | **By material** | "Reading material names: n of 105" below the view, then the colours change: the tall buildings all one colour (they share one material), other things in others |
| 3 | Click the cardboard and bottles on the street (or any small thing) | The line below: its id, then the mesh's file name, its appearance and its materials. Hover that text: the mesh's path and the material per submesh. **Open Mesh**, **Open in EDGEmat** and **Add Mesh to Project** show beside **Show in Tree** |
| 4 | **Materials** on | "Exporting its materials…", then the cardboard drawn with its own texture, and "Materials by REDcode (EDGEmat's renderer), approximate" |
| 5 | Click a building | The cardboard goes back to its flat colour; the building is drawn with its material: flat grey for now (the finding above) |
| 6 | **Materials** off | The building goes back to its flat colour |
| 7 | **Open Mesh** | The mesh opens in REDcode's mesh view |
| 8 | Back on the sector, **Add Mesh to Project** with a project open | A question says that a change to the mesh then shows everywhere the game uses it. **Add It** adds the mesh to the project |
| 9 | F5 with **Run REDcode with Opens Test and EDGEmat** (the EDGEmat clone). Steps 1, 3 and 4 again, then **Open in EDGEmat** | The note says "Materials by EDGEmat"; EDGEmat's Desk opens the mesh at the node's appearance |
| 10 | On a project's copy of the sector (from the Sector view test, step 9), pick a thing whose mesh is also in the project (step 8), **Materials** | The project's mesh is drawn with the project's own materials |

Result 2026-11-21, reported by the owner: all 10 steps pass. The first run stopped at step 9 because the no-extensions launch config has no EDGEmat; the second used **Run REDcode with Opens Test and EDGEmat**.

Found: **Add to Project wrote over a file already in the project without asking.** The owner added the mesh through Open Mesh and the mesh view's **Add to Project**, then step 8's **Add Mesh to Project** added it again with no question. That was not REDcode knowing it was the same file: Add to Project (Game Assets, Search game files, the CR2W editor's header and the sector view) wrote the game's file over the project's copy every time, so changes made to that copy would have been lost. Fixed the same day: Add to Project asks first.

| # | Do | Expected |
|---|---|---|
| R1 | With the mesh from step 8 in the project, pick it in the sector view again and **Add Mesh to Project** | One question: "<mesh> is already in <project>", with **Open the Project's Copy** and **Replace It**. Open opens the project's copy and shows it in the Project view; cancel changes nothing |
| R2 | Change something in the project's copy and save; open the game's mesh (Game Assets) and its header's **Add to Project**, then **Replace It** | An editor open on the project's copy closes first (asking about unsaved changes), then the project's copy is the game's again |
| R3 | In Game Assets, **Add to Project** on a folder that holds the mesh and other files | "1 of these n files are already in <project>", with **Add the Others** (the project's copy stays as it is) and **Replace All** |

Retest 2026-11-22, reported by the owner: R1 to R3 pass, on a mesh added from the sector view just before (Add Mesh to Project twice). Found: no way to find the project's sector meshes in the sector view; agreed for after the release ([Sector selection](design/sector-selection.html), every copy of a mesh). **Sector materials (M1) passes, with its retest.**

## Sector camera

Built 2026-11-21 ([design](design/sector-view.html#part-3-the-camera-2026-11-21)): the camera row, the right button's look, the wheel towards the cursor, F and double-click. Checked in Chrome over the real bridge on `exterior_-22_7_0_0`: each held move, Top, Reset, a double-click on node 848.7 gliding to 2.5 m from it, a right click keeping the pick, the wheel's speed with the right button held. Chrome drew 2 frames a second there, so the feel is this test's.

| # | Do | Expected |
|---|---|---|
| 1 | F5 with **Run REDcode with Opens Test (no other extensions)**. Open `exterior_-22_7_0_0.streamingsector` | Under the toolbar a second row: **Zoom**, **Move**, **Pan**, **Height**, **Orbit**, **Speed ×1.0**, **Top**, **Reset**, **?** |
| 2 | Hold each button of Zoom, Move, Pan, Height and Orbit, then let go | The camera moves while the button is held and stops when it is let go: Forward and Back along the view, the arrows strafe level, Up and Down straight up and down, Zoom closer and further, Orbit round the middle. With Shift held as you press, faster; with Ctrl, slower |
| 3 | Speed + twice, then hold Forward | ×1.6, and faster flying |
| 4 | Right-drag in the view, and press W, A, S, D, Q, E while holding it; turn the wheel while holding it | The view turns where the camera stands, flies with the keys, and Speed follows the wheel |
| 5 | Middle-drag, and Ctrl with a left drag | The view pans |
| 6 | The wheel over a building at the edge of the view | The camera goes towards that building, not the middle |
| 7 | Double-click a small thing, such as the cardboard on the street | It is picked and the camera glides close to it |
| 8 | **F**, then **Top**, then **Reset**; **Frame** | F frames the picked thing; Top looks down on it from above; Reset goes back to the view the sector opened with; Frame glides to the picked thing |
| 9 | A right click on a thing, without dragging | The pick does not change |
| 10 | **?** | A line names the mouse and keys; **?** again hides it |


## Sector selection

Built 2026-11-21 ([design](design/sector-selection.html#as-built-2026-11-21)): Ctrl+click, Shift+drag, Volume and Touching, Ctrl+A and Esc, the selected list with its rows' buttons, Isolate, Add Meshes to Project, Copy, and `openSector` with a list. Checked in Chrome over the real bridge (the design page has what); the feel, Add Meshes to Project and Copy are this test's.

| # | Do | Expected |
|---|---|---|
| 1 | F5 with **Run REDcode with Opens Test (no other extensions)**, a project open. Open `exterior_-22_7_0_0.streamingsector` | A list on the right of the view: "Nothing selected", with how to select |
| 2 | Click a thing, then Ctrl+click two more, then Ctrl+click one of them again | One row, then three, then two. The last added is the current one, in the accent colour, the others paler; the line under the view and the Properties view follow the current one |
| 3 | Click a row; hover a row | The camera glides to it and it becomes the current one. The hover shows **Fly To**, **Tree**, **Mesh**, **EDGEmat**, **Add** and **×**; each does what its name says (× takes it out of the selection) |
| 4 | Shift+drag a box over part of the view | Everything whose middle is in the box is selected and listed, sorted by mesh; with Ctrl held as well, added to what was selected |
| 5 | **Touching** on, the same box again | A few more: long things whose box reaches in |
| 6 | **Volume**, then drag on the street, move the mouse up, and click | The hint says what to do; a see-through box grows on the street, then upwards; after the click it keeps a handle on each face and a round one above, and what is inside is selected |
| 7 | Drag a face handle, then the round handle | The box resizes and moves level, and the selection follows. A click inside the box still picks the thing there |
| 8 | **Isolate**, then **Isolate** again | Everything else goes ghostly, then comes back |
| 9 | **Add Meshes to Project** | One question naming how many meshes; **Add Them** adds each mesh once (and asks once if some are already in the project) |
| 10 | **Copy**, then paste into a text file | One line per thing: its id and its mesh |
| 11 | Click in the view (the 3D view, the list or its line), then Ctrl+A, then Esc; **Volume** and Esc before drawing | All shown things are selected, then none; Volume turns off |
| 12 | **Opens Test: Open a Sector at Entries 780, 692 and 443** | The sector opens with those three entries selected (780 current) and framed |
## No Red Hot Tools

Run 1 (owner, 2026-11-22), in progress: at step 11, Ctrl+A selected the page's text. The view's keys were on the 3D canvas alone, which took the keyboard only with the right button. Fixed the same day: any button on the canvas gives it the keyboard, and Ctrl+A, F and Esc work anywhere in the view after a click (a text box keeps its own Ctrl+A). Rerun: still the page's text. VS Code's webview hands every key to the workbench from the page's window (its `pre/index.html`, `handleInnerKeydown`), and the workbench's Select All then runs `execCommand("selectAll")` in the page. Fixed: the view stops Ctrl+A before it reaches the window, and undoes a page selection that comes within a second of it. Rerun: Ctrl+A works. Found then: with a volume and Isolate on, Ctrl+A selected everything but left the volume, and Isolate still showed the volume's things; Esc cleared the selection only. Fixed the same day: Isolate follows the selection while it is on and ends when nothing is selected; Ctrl+A takes the volume away (the selection is no longer its); Esc takes away the selection, the volume and Isolate. Checked in Chrome over the real bridge (volume, Isolate, Ctrl+A: 9,188 selected, no volume, Isolate on; Esc: nothing selected, no volume, Isolate off). Rerun in VS Code: pass.

Result 2026-11-22, reported by the owner: steps 1 to 12 pass, with the two fixes above (Ctrl+A in VS Code; the volume and Isolate with Ctrl+A and Esc). **Sector selection passes.**

Built 2026-11-07, after REDcode 0.10.7: Red Hot Tools has no build for game 2.5, so REDcode drops its hot folder. Pack and Play swaps through REDnode (REDswap) or installs for the next start, and **Install to the Hot Folder** is gone. F5 with **Run REDcode**. Checked before: type check, build, `npm test` (39, one new for the install notice).

| # | Do | Expected |
|---|---|---|
| 1 | Open a test project. Look at the Project view's title bar, then type `hot` in the Command Palette | No **Install to the Hot Folder** button or command. **Pack and Play** (the flame) is still there |
| 2 | Game running with REDnode 0.41.0 or later, a save loaded, its **MCP server** on. A plain project (a mesh or texture change), **Pack and Play** | "Swapping through REDnode", then REDnode's answer: the archive swapped, in some milliseconds. Re-equip or respawn what uses it to see the change |
| 3 | Close the game. **Pack and Play** again | Packed and installed (through EDGEdeck), with "Restart the game to see the change" and a line on starting the game with REDnode. Nothing goes into `archive\pc\hot` |
| 4 | **Uninstall** from the Project view's `...` menu | The mod comes out through EDGEdeck, as before |
| 5 | Added 2026-11-10, after the owner's EDGEhack_Test1 report. With the mod uninstalled (step 4), the game running with REDnode as in step 2, a project with tweaks or scripts (EDGEhack_Test1): **Pack and Play** | REDnode swaps the archive, then a warning: the swap carries archives only, and names what is not in the game yet (for EDGEhack_Test1: 5 tweaks, 1 script and 1 ArchiveXL file), with **Install for Next Start**. Press it: EDGEdeck asks to quit the game first, then installs |
| 6 | **Pack and Play** again, with the mod installed and nothing changed | The plain "swapped" notice, with no warning |

Result (owner, 2026-11-10, F5 on main at d081a9b, EDGEhack_Test1, in the order given in chat: icons and buttons, swap of the installed mod, Uninstall, swap of the uninstalled mod with the warning and Install for Next Start, Pack and Play with the game closed, the new-file icons): **pass**. Found: at Uninstall, EDGEdeck asked whether to keep the "changed" archive. The bytes were the same; REDswap's copy breaks EDGEdeck's hardlink, which it checks by file identity. Filed as EDGEdeck #13, fixed there (e3d6f63, unreleased). Fix here: in LocKeys, Add to Project Onscreens now comes before Copy LocKey among the hover buttons.

Step 5's check (`looseNotInGame` in `src/hotSwap.ts`) was run on 2026-11-10 against the real EDGEhack_Test1 pack: nothing listed against the game after the owner's deploy, and all 7 files against an empty folder. Unit checks: 42.

## Resizable table columns (#26)

Built 2026-11-10 for EDGEhack (REDcode issue #26): a localization file's table has a drag handle on each column header but maleVariant's, a double-click fits a key column to its content (femaleVariant goes back to sharing the width), maleVariant takes what the others leave and the ✕ column sticks to the right edge, and the widths are kept for every localization file in VS Code's global state. Run before the hand test in a page harness against REDbridge 0.12.1 and EDGEhack_Test1's `en-us.json` (read only, never saved): first widths # 52, primaryKey 120, secondaryKey 314 pixels with every key in full; drag, fit, reopen with the kept widths, a text column back to sharing, a 600-pixel pane with the texts kept at 240 pixels, the sticky header and the six ✕ buttons.

| # | Do | Expected |
|---|---|---|
| 1 | F5. Open EDGEhack_Test1's `source/archive/edgehack_test1/localization/en-us.json` | The table. **secondaryKey** is as wide as its widest key, so every EDGEhack key reads in full; femaleVariant and maleVariant share the rest |
| 2 | Hover a header's right edge, then drag it left and right | A resize cursor and a cyan handle; the column follows the mouse, the text columns give or take the width |
| 3 | Double-click **secondaryKey**'s handle | It fits its keys again |
| 4 | Drag **femaleVariant** narrower, then double-click its handle | It narrows, then shares the width with maleVariant again. maleVariant has no handle |
| 4b | Added after the owner's first run (the ✕ column could scroll out of view, and its button's right border was cut off). Drag **secondaryKey**, then **femaleVariant**, as wide as they go; hover a row's ✕ | Each stops where maleVariant keeps 120 pixels. The ✕ column stays at the right edge, and the button's hover border shows on all four sides |
| 5 | Set a width, close the file and open it again, then open another onscreens file (a game one from Game Assets) | The widths you set come back, in both files |
| 6 | Make the editor narrow | The table scrolls sideways only when the set widths no longer fit, and the ✕ column stays at the right edge while it does. Scroll down: the header stays on top. A row's ✕ still deletes it (Undo brings it back) |

Result (owner, 2026-11-10, F5 on main): the first run passed but found that the ✕ column could scroll out of view with some widths, and that its button's right border was cut off on hover. Fixed in 1eb37da: maleVariant takes the width the others leave and has no handle, drags stop where the shared columns keep 120 pixels, the ✕ column sticks to the right edge and is 36 pixels wide. Step 4b was added for it. The retest passed, all steps. The same run checked the LocKeys hover order (Add to Project Onscreens before Copy LocKey, 358c89d): pass.

## Export every LOD

Built 2026-11-12, asked for on the Discord ("Is possible to export a mesh to raw folder including all LOD levels?"): the setting `redcode.export.meshLods` turns WolvenKit's LOD filter off for **Export to Raw**, and the MCP tool `project_export` takes `meshLods`. Edit in Blender keeps the filter on. Checked before the hand test by the smoke step above. The mesh viewer now orders LODs by triangles, most detailed first: WolvenKit names the least detailed parts `LOD_0` (lodMask 0), which the viewer had listed first as "most detail".

First run (owner, 2026-11-12, on the laptop): step 2 showed 5 submeshes. Not a fault: the search in step 1 also finds a `decoration` copy of the door with a single LOD, and that was the one exported. Step 1 now names the full path.

Result (owner, 2026-11-12, on the laptop, with the `standard` door): pass.

| # | Do | Expected |
|---|---|---|
| 1 | F5. In a test project, add the door under `base\vehicles\standard\v_standard2_archer_hella\entities\meshes\v_standard2_archer_hella_police__ext01_door_fl_01.mesh` from Game Assets (search `archer_hella_police__ext01_door_fl_01`; the copy under `base\vehicles\decoration` has one LOD only). **Export to Raw** on it, then click the `.glb` | REDcode's viewer: 5 submeshes, no LOD picker in the toolbar |
| 2 | Settings: tick **Redcode > Export: Mesh Lods**. **Export to Raw** again, click the `.glb` | An LOD picker in the toolbar: **LOD 1 (most detail)** first with 5 submeshes (body 1,903 triangles), then **LOD 2** (917) and **LOD 0** (468) |
| 3 | **Import from Raw** on that `.glb` | The mesh in Archive keeps its LODs: open it, `renderResourceBlob` > `header` > `renderChunkInfos` still has 15 entries |
| 4 | Untick the setting | Export to Raw writes the most detailed LOD only again |

## Reveal in Project (#27) and the search wording (#28)

Built 2026-11-13 for EDGEmat: `REDcodeApi.revealInProject(file)` selects a project file in the Project view and focuses the view, and Search Game Files says "file name or path". **Opens Test: Reveal in Project** (`tools/test-extensions/opens-test`) calls the API as EDGEmat does.

Result (owner, 2026-11-15, F5 on main, EDGEmat 0.3.2 from its clone): pass, all steps. Step 6 was rewritten before the run: EDGEmat asks for a project only when REDcode has none open, so the folder is closed first.

| # | Do | Expected |
|---|---|---|
| 1 | Launch config **Run REDcode with Opens Test**, on a test project with files a few folders deep in Archive. Collapse every folder in the Project view, then switch the side bar to the Explorer | |
| 2 | Open a project file under `source\archive` (a `.json` or `.xl` opens as text; or copy a path with Copy path). **Opens Test: Reveal in Project**, with that path | REDcode's side bar comes up with the Project view focused, its folders unfolded down to the file, the file selected. The message says `true` |
| 3 | The same, with a path under `source\raw` and with a folder's path | Each is selected the same way, `true` |
| 4 | The same, with a path in the project that does not exist, and with a file outside the project | Nothing moves; the message says `false` |
| 5 | **REDcode: Search game files** and **REDcode: Open game file as JSON** (Command Palette) | The box says "Search game files (file name or path)" |
| 6a | Launch config **Run REDcode with Opens Test and EDGEmat** (EDGEmat from its clone beside REDcode; a vsix installed in the other configs stays off, as they run with `--disable-extensions`). In Game Assets, right-click a mesh, **Open in EDGEmat** | The mesh is on EDGEmat's **Desk** (the EDGEmat icon in the activity bar, the first view) |
| 6b | **File > Close Folder**, so REDcode has no project open (EDGEmat asks for a project only then; with a project open it adds to that one and opens nothing) | |
| 6c | On the Desk's line for the mesh, the new-file icon (**Add to Project...**). Pick **A project folder or .cpmodproj...** and choose the test project. Say yes to adding it | The window reloads on the project (the Desk stays). REDcode's Project view is focused with the mesh selected under `source\archive`, and EDGEmat's message says what was added |

## Item search (#28)

Built 2026-11-15 ([design](design/item-search.html)): Search game files also finds clothing items by in-game name or TweakDB id, through `@edgemodders/edgemat-core` 0.3.2, and a pick opens the file. Checked before the hand test by scratchpad `items28.mjs` against the game: 2,074 items loaded in 14.4 s with no cache and 4 ms from it, `comfy rocker` first finds `Items.Pants_01_basic_01`, whose meshes are `l1_012_pwa_pants__jeans_tight.mesh` (feminine) and `l1_012_pma_pants__jeans_tight.mesh` (masculine), in 0.47 s.

Run 1 (2026-11-15, scripted by the EDGEweb session for the owner: an EDGEkit 1.140.6 trial editor with `--extensionDevelopmentPath` on de86cfa, its own profile, `LOCALAPPDATA` on a scratch folder so there was no cache, a scratch REDbridge 0.12.1, a scratch REDcode project): 10 of 11 steps pass, and step 2 passes in part. In step 2, the box stayed empty under a busy bar for 10.3 s and then filled in by itself as expected, but the "Loading item names" row never showed. The cause: REDbridge answers one call at a time, the file search waited behind the item load, and the rows were set only when it came back. Fixed: the loading row and a title saying files wait show at once, and step 2 now expects that, not files at once. Also seen:
- Step 4: Items stayed above Files on EDGEkit 1.140.6 too.
- Step 9: the texture case was not run (no `.xbm` among the rows).
- "Type at least 3 characters" shows only after the first character is typed.
- EDGEkit's Command Palette has no Close Folder; Ctrl+K F does it.

Rerun on 036f110 (2026-11-15, the same setup, the cache deleted first): step 2 passes. The loading row and its title came 0.3 s after typing, and the results by themselves at 9.5 s. Step 9's texture case passes too: `pants__jeans_tight_n01.xbm` opened in the texture viewer, with no message. The title said "1 files" for one hit; it now says "1 file" (not rerun, wording only).

Owner's check on a5a34a6 (2026-11-15, VS Code, **Run REDcode**, the owner's real cache folder): `comfy rocker` shows **Items (2)** above **Files (0)**, the first item's page lists a feminine and a masculine mesh, and the feminine mesh opens on its 3D view. The items came up at once, with no loading row: REDcode read the `%LOCALAPPDATA%\EDGEmat\items.json` that EDGEmat had written, so the shared cache works.

| # | Do | Expected |
|---|---|---|
| 1 | Close VS Code windows that run EDGEmat. Rename `%LOCALAPPDATA%\EDGEmat\items.json` to `items.json.bak`, so there is no cache. F5 (**Run REDcode**), open a test project | |
| 2 | The magnifier on Game Assets (**Search game files**). Type `comfy rocker` | The box says "file name, path or item name". At once: under **Items**, "Loading item names" with a spinner, and the title "Files come when the item names are loaded" (REDbridge answers one call at a time, so files wait for the load). After about 15 s the box fills in by itself: **Items (2)**, **Comfy rocker aramid-weave slim-fits** with `Items.Pants_01_basic_01  LegArmor` first, then the `TEST.ItemPass_LegArmor` one; **Files (0)** |
| 3 | Type `rocker comfy`, then `Items.Pants_01_basic_01`, then `slim fits` | The same item first each time. `slim fits` lists 9. While typing, the Items group stays above the Files group |
| 4 | Type `jacket` | **Items (327)** with 20 rows and "and 307 more: type more words", then **Files** with 200 of 3,027 rows |
| 5 | Type `comfy rocker` again and pick the first item | The box turns into the item's page: its name and id on top, a Back arrow, a busy bar for under a second, then **Feminine** `l1_012_pwa_pants__jeans_tight.mesh` and **Masculine** `l1_012_pma_pants__jeans_tight.mesh`, each "appearance leather", with the folder under it |
| 6 | Back arrow | The search again, with `comfy rocker` in the box and the same results |
| 7 | On the item's page, pick the feminine mesh | The search closes and the mesh opens on its 3D view, read-only, as a click in Game Assets opens it |
| 8 | Search again, on the item's page hover the masculine mesh: the three buttons. **Copy path**, then **Add to project** | Copy path: the status bar says it was copied, and the path pastes. Add to project: the box closes, and the mesh is in the project and selected in the Project view |
| 9 | Search a path, such as `legs\l1_012`: pick a file; then on a file row the **Open as JSON** button | The file opens as a click in Game Assets does (a texture in the texture viewer); Open as JSON opens its JSON. No message comes up after a pick |
| 10 | Close the project folder (**File > Close Folder**), search again and hover a file | Two buttons only: Copy path and Open as JSON |
| 11 | **Developer: Reload Window**, search `comfy rocker` | Items come up at once, with no loading row: the cache from step 2. Delete `items.json.bak` |

## Run Game without ELECTRON_RUN_AS_NODE (#24)

Built 2026-11-17 for [REDcode issue #24](https://github.com/Edgemodders/REDcode/issues/24), from REDnode. When Run Game starts the exe (a GOG or Epic install, or `redcode.launch` set to `exe`), the game used to inherit VS Code's `ELECTRON_RUN_AS_NODE`, pass it on, and so stop REDnode's overlay host on REDnode 0.58.0 or older. REDcode now starts the game without it (`gameEnv` in `src/install.ts`); its own Node children keep it. Checked before: `npm test` (49, one new: the variable goes, everything else stays, REDcode's own environment is untouched), and a child process started from a Node with the variable set, through `gameEnv`, does not see it. The Steam route is not affected and is not part of this test.

REDnode 0.59.1 and later start their host without the variable anyway, so on a current REDnode this test shows only that nothing broke. The bug itself shows only with REDnode 0.58.0 or older.

| # | Do | Expected |
|---|---|---|
| 1 | F5 with **Run REDcode**. Settings: **REDcode: Launch** to `exe` (Always bin\x64\Cyberpunk2077.exe directly) | |
| 2 | **REDcode: Run Game** | The game starts; the REDcode log says `Run game: ...\bin\x64\Cyberpunk2077.exe` |
| 3 | In the game, with a save loaded, press F10 | REDnode's launcher and apps show, not only its cursor |
| 4 | Quit the game. Set **REDcode: Launch** back to `auto` | |

Result (owner, 2026-11-20, F5 on main): **pass**, all four steps. On a current REDnode (0.59.1 or later) this shows only that nothing broke, as said above.

## New File

Built 2026-11-20 from [the design](design/new-file.html) (`src/newFile.ts`, `src/newFileCommand.ts`). Checked before: `npm run typecheck`, `npm test` (54, five new: the name check, the folder from where it was clicked, the text files' folders and comment line, the atlas and material roots, the type table and the presets), and a script outside the repo against the game with REDbridge 0.15.0 (scratchpad `nf-e2e.mjs`). In that script, a PNG imports in each of the four presets with exactly that setup; the atlas, material instance, entity, appearance and multilayer setup each read back as their class, written for the PC; the atlas's slot 0 names its new texture with one part, `whole`, over all of it; and a game atlas copied under a new name keeps its parts. Not checked by the script: anything in VS Code, and the game reading the new files.

First run (owner, 2026-11-20, on the laptop): step 3 failed on an image with an odd side. WolvenKit refuses to compress one ("Image dimension (width and/or height) is an odd number. To import regardless, set Compression to TCM_None at own risk"), and the copy left in Raw then blocked the same name. Fixed the same day: New File reads the image's size first (PNG, JPEG, TGA, DDS, BMP) and asks, offering **Import Uncompressed** (`TCM_None`, checked against the bridge: an odd PNG fails compressed and imports uncompressed). A failed import now removes its Raw copy. Step 3b was added for it. The owner then asked for a Resize button in that warning, naming the size it gives: built the same day (each odd side one pixel shorter; checked against the bridge: an odd PNG, and an odd TGA through `texture.imageToPng`, both 65 × 33 to 64 × 32 with their colour, then imported compressed). Steps 3c and 3d were added. At step 6 the owner noted two things. The atlas made from a photo showed the photo as its "background": not a fault, since an atlas's texture is the icon sheet its parts are cut from, but the picker now says so ("the icon sheet the parts are cut from: usually a PNG with a transparent background"). And the atlas view's parts filter had the browser's own style, not the theme's, which dates from E4: fixed in `media/cr2w/editor.css`. At step 13 the owner noted that Pack said what it did only in the status bar, so it was not clear it had run: a plain Pack now ends with a message and Show log, as the other commands do. Pack and Install and Pack and Play keep the status bar line, since the install's own message follows.

**Result (owner, 2026-11-20, on the laptop, F5 on main):** steps 1 to 13 pass, with the four fixes above (the odd-sided image with Resize and Import Uncompressed, the atlas picker's wording, the parts filter's style, Pack's message), plus wording in steps 5 and 8. The old step 14, the game reading the new files, was optional and not run; it is under Never run.

### New File hover button

Asked for by the owner on 2026-11-20, after 0.10.14: New File as a hover button wherever its menu entry shows (`inline@0`, the same `when` as the menu). Checked before: the `when` rule matches `project`, `projectRoot...` and `projectFolder...` items and no `projectFile` item; files keep Export or Import in that place.

| # | Do | Expected |
|---|---|---|
| 1 | F5 with **Run REDcode** on a project. Hover the project's top node, a root (**Archive**, **Raw**, **Resources**) and a folder | Each shows a **New File...** icon first, before Copy Path |
| 2 | Hover a file | No New File icon; a texture under Archive still shows Export there |
| 3 | Click the icon on a folder under **Archive** | The same type list as the right-click menu, titled with that folder's game path |

Result (owner, 2026-11-20): **pass**, all three steps.

Use a test project. Have a small PNG ready, an icon for example.

| # | Do | Expected |
|---|---|---|
| 1 | F5 with **Run REDcode** on the test project. In the Project view, right-click a folder under **Archive** | **New File...** is first in the menu. It is also on the project, on each root and in the view's **...** menu, but not on files |
| 2 | **New File...** | A list headed **New File in** the folder's game path, with **Game files** (Texture from an Image, Ink Atlas, Material Instance, Entity, Appearance, Multilayer Setup, Start from a Game File) and **Text files** (TweakXL, ArchiveXL, Redscript) |
| 3 | **Texture from an Image...**, pick the PNG, **Color**, keep the name | A `.xbm` of that name in the folder, selected in the Project view and open in the texture viewer. The PNG is in **Raw** at the same path |
| 3b | **Texture from an Image...** with an image that has an odd width or height | Before anything is written, a warning gives the size and says WolvenKit compresses only even sides. It names the size **Resize** would give (each odd side one pixel shorter) and what each choice does. **Cancel** leaves nothing |
| 3c | The same image again, **Resize to** *w* × *h* | Raw has a PNG of the new size at the texture's path; your image is unchanged; the `.xbm` imports compressed and shows the whole picture in the texture viewer. With a JPG, TGA or DDS too, which come to PNG through REDbridge first |
| 3d | The same image again, **Import Uncompressed** | The `.xbm` keeps the image's size, with compression `TCM_None` |
| 4 | **New File...**, **Ink Atlas**, **Texture from an Image...**, the PNG again, keep **UI** (first in the list), name it `icon_ui`, then keep the atlas's name | `icon_ui.xbm` and `icon_ui.inkatlas` in the folder. The atlas opens in the atlas view with the image and one part, `whole`, around all of it |
| 5 | **New File...**, **Ink Atlas**. In the texture list, skip **Texture from an Image...** and pick the `.xbm` from step 3 under **Textures in the project**; keep the name | A second `.inkatlas` opens in the atlas view on the step 3 texture, with its one part, `whole`, already around it. Nothing more to do: **Add Part** is not part of this test |
| 6 | **New File...**, **Material Instance**, **multilayered.mt** | A `.mi` opens in the CR2W editor with `baseMaterial` set to `engine\materials\multilayered.mt` |
| 7 | **New File...**, **Material Instance**, **Another material...**, type `base\materials\Glass.mesh`, then `base\materials\glass_onesided.mt` | The first is refused (an `.mt`, `.remt` or `.mi`, and lowercase); the second makes a `.mi` on it |
| 8 | Three runs of **New File...**: one picking **Entity**, one **Appearance** and one **Multilayer Setup**, each from the first list, then a name | Each opens in the CR2W editor, empty |
| 9 | **New File...**, **Start from a Game File...**, search `achievement_icons.inkatlas`, pick it, name it `my_icons` | `my_icons.inkatlas` in the folder, open in the atlas view with the game's icons and parts. The search box has no row buttons here |
| 10 | In any name box, type `My Icon`, then `my icon`, then the name of a file already there | Each is refused with why: lowercase, no spaces, already in the project |
| 11 | **New File...** on the project itself (the top node) | The name box offers `<mod name>\<name>`; the file goes to `source\archive\<mod name>\` |
| 12 | **New File...**, **TweakXL**, **ArchiveXL** and **Redscript**, from any folder | `source\resources\r6\tweaks\<mod>\<mod>.yaml`, `source\resources\<mod>.archive.xl` and `source\resources\r6\scripts\<mod>\<mod>.reds`, each with one comment line, open in the text editor |
| 13 | **REDcode: Pack** | A message says what was packed (files into the archive, ArchiveXL files, resource files), with **Show log**. The archive holds the new game files; `<mod>.archive.xl` is beside it in `archive\pc\mod`; the `.yaml` and `.reds` are under `r6` in `packed` |

## Never run

| Test | Why |
|---|---|
| New File's files read by the game | An atlas from New File drawn by an ink widget, or its material instance on a mesh, in the game. Needs a small test mod; it was step 14 of the New File test, optional, and not run |
| The EDGEmat material hook in the mesh viewer | Waits on EDGEmat shipping `renderMaterials`; checked only with a stand-in |
| The .NET runtime prompt | Needs a machine without .NET 10 |
| Open in EDGEwave with EDGEwave from a store | Run only with EDGEwave from source (F5, 2026-10-16), where it works |
| A custom sound from a REDmod pack, or a sound override, in game | Not tried in the game |
| A new mesh from a template with a different submesh count | Step 2 of the 0.10.0 test used the GLB's own mesh |
| Blender found by the search into an empty `redcode.blenderPath` in VS Code | The owner set the path by hand before the fix; the search itself finds the Steam copy when run outside VS Code |
