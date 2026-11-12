# <span class="y">Tests</span>

Every test of REDcode on record: how to run it again, what to expect, and what it showed. Each step of the build ends with a hand test by the owner in VS Code ([CR2W editor](design/cr2w-editor.html#milestones), [Ship](design/ship.html), [View](design/view.html)). Add new tests here when they are first run.

Gathered on 2026-10-16 from the design pages, the project notes and the session logs. Last updated 2026-10-16.

## At a glance

| Test | Kind | Phase | Last run | Result |
|---|---|---|---|---|
| [Type check and build](#type-check-and-build) | Automated | All | 2026-10-16 | Pass |
| [Smoke test](#smoke-test-the-bridge-client-against-the-game) | Automated, needs the game | C1 on | 2026-10-16 | Pass |
| [Bridge checks against the game](#bridge-checks-against-the-game) | Scripts outside the repo | C3 on | 2026-10-16 | Pass |
| [MCP server](#mcp-server) | MCP client script | C3 on | 2026-11-10 | Pass |
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
| [No Red Hot Tools](#no-red-hot-tools) | By hand | C4 | 2026-11-10 | Pass, one fix |
| importFile's texture (#25) | By hand, through EDGEhack | Requests | 2026-11-10 | Pass: EDGEhack 0.0.19's H3b.2 Upload test (EDGEhack's `docs/testing.md`), all 10 steps, run by the owner with REDcode main e9b5e7b; the icons showed in the game. Reported by the EDGEhack session |
| [Resizable table columns (#26)](#resizable-table-columns-26) | By hand | Requests | 2026-11-10 | Pass, one fix |
| [Export every LOD](#export-every-lod) | By hand | C4 | | Not run yet |
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

## No Red Hot Tools

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

Built 2026-11-12, asked for on the Discord ("Is possible to export a mesh to raw folder including all LOD levels?"): the setting `redcode.export.meshLods` turns WolvenKit's LOD filter off for **Export to Raw**, and the MCP tool `project_export` takes `meshLods`. Edit in Blender keeps the filter on. Checked before the hand test by the smoke step above.

| # | Do | Expected |
|---|---|---|
| 1 | F5. In a test project, add a mesh with LODs from Game Assets, such as `v_standard2_archer_hella_police__ext01_door_fl_01.mesh` (search `archer_hella_police__ext01_door`). **Export to Raw** on it | The `.glb` in Raw. Opened in Blender or a glTF viewer, it has only the `_LOD_1` submeshes (5 for the door) |
| 2 | Settings: tick **Redcode > Export: Mesh Lods**. **Export to Raw** again | The `.glb` now has every LOD's submeshes (15 for the door: `_LOD_1`, `_LOD_2` and `_LOD_0`) |
| 3 | **Import from Raw** on that `.glb` | The mesh in Archive keeps its LODs: open it, `renderResourceBlob` > `header` > `renderChunkInfos` still has 15 entries |
| 4 | Untick the setting | Export to Raw writes the most detailed LOD only again |

## Never run

| Test | Why |
|---|---|
| The EDGEmat material hook in the mesh viewer | Waits on EDGEmat shipping `renderMaterials`; checked only with a stand-in |
| The .NET runtime prompt | Needs a machine without .NET 10 |
| Open in EDGEwave with EDGEwave from a store | Run only with EDGEwave from source (F5, 2026-10-16), where it works |
| A custom sound from a REDmod pack, or a sound override, in game | Not tried in the game |
| A new mesh from a template with a different submesh count | Step 2 of the 0.10.0 test used the GLB's own mesh |
| Blender found by the search into an empty `redcode.blenderPath` in VS Code | The owner set the path by hand before the fix; the search itself finds the Steam copy when run outside VS Code |
