---
title: Sector layers
---

# Sector layers: what else is in this place

Draft 0.2. Agreed with the owner on 2026-11-24, with all five recommendations under Decisions; details may change in testing. **L1 to L4 are built** (L1 released in 0.10.17; L2, L3 and L4 on 2026-11-25, hand tests pending): see each stage's as built section. **The Overlaps tab's matching is being redone** after a modder's report (2026-11-26): see [Sector overlaps and the world index](sector-overlaps.html).

A modder sent the owner a feature request for a world editor that understands data across sectors (the "EDGEkit World Editor" request, 2026-11-24). Its point: one sector on its own does not show what the player sees. Many sectors, from several kinds and levels, add to one place. This page is REDcode's first part of the answer: the sectors that reach into the one you opened, drawn as layers you switch on, select in and edit.

The owner's choices so far (2026-11-24):

- The sector view's side panel gets two tabs: **Selections** (today's list) and **Overlaps** (the layers).
- Layers start with nothing checked. Turning one on shows a spinner and progress while it loads.
- Things in a layer can be selected and changed like the opened sector's.
- A change lands only in a sector already in the project. A game sector gets the question REDcode asks today: values change only in a project's copy, with **Add to Project**. Scripts cannot add a sector to a project. Built-in scripts never do it without a confirmation; a modder's own script that does is the modder's call.

## Where this page sits in the request

The request has eight parts. REDcode, EDGEbuilder, REDbridge and REDnode each take some.

| Part of the request | Where | Here? |
|---|---|---|
| 1. Everything that adds to a place, drawn together with a switch per source | REDcode (layers), EDGEbuilder (World > Sectors, in the game) | **Yes**: layers |
| 2. A comparison that understands the data (added, removed, moved, changed, only overlapping) | REDcode, over REDbridge | No: its own page next |
| 3. Every link in a placement's data, both ways | REDcode | **Yes**: the picked panel's links |
| 4. Copies that keep every native field | REDbridge, EDGEbuilder | No |
| 5. Batch edits with a preview and one undo | REDcode | Built as **sector scripts**; scripts over layers are here |
| 6. Assemblies: capture in the game, reuse, replace the originals | EDGEbuilder (its scenes and ArchiveXL removals), REDcode opens and edits them | No: to agree with EDGEbuilder |
| 7. Checks before and after a bake | REDbridge, EDGEbuilder, REDcode shows them | No |
| 8. What the running game actually loaded | EDGEbuilder's Sector drawer (● streamed in), REDnode's registry | No |

Plus the owner's idea: **open REDcode's sector view for the place you are in the game**. It is here, both ways.

## What overlap means in the game's data

Measured on `exterior_-22_7_0_0` on 2026-11-24 (REDbridge 0.19.0, `sector.find` and `sector.nodes`):

- **A level 0 exterior sector is a grid cell about 64 m across.** 549 of its 571 placed things stand in cell -22, 7; the other 22 stand just over one edge. That a thing goes to the cell it stands in is a reading of these numbers, **unverified** across the city.
- **The sector's streaming box is much larger than its things.** Its things fill a box about 63 × 51 × 22 m, close to the cell; its streaming box is about 268 m across, and none of its things reaches past it. Neighbours' things that stand near an edge can reach into this cell.
- **Many sectors' streaming boxes meet that 268 m box:** 105 other level 0 exteriors, 320 coarser exteriors (levels 1 to 6), 50 interiors, 10 navigation, 4 always loaded, and 2,789 quest sectors, many with very large boxes.

So a box that meets this one says only that a sector **might** reach in. The layer list narrows it to sectors with things that do.

## What the modder sees

| Where | What |
|---|---|
| The side panel | Two tabs: **Selections** (the list as it is now, with Back, Forward and the icon buttons) and **Overlaps** |
| Overlaps | The sectors whose things reach into this one, in groups: **Neighbours** (level 0 of the same kind), **Coarser** (higher levels), **Interiors**, **Global** (quest and always loaded), **Other** (navigation and the rest). Each group heading shows its count and switches the whole group |
| A layer's row | The sector's name, its level, how many of its things reach in, a state switch **Off**, **Ghost** or **Shown**, and **Open** (the sector in its own tab). Tags: **project** when the project has its own copy, **variants** when it has named variants, **replaced** when a Phantom Liberty sector stands in for it |
| Turning a layer on | The row shows a spinner and "12 of 40 meshes" while its meshes export, the same cost as opening that sector the first time. Each mesh is exported once and cached |
| In the 3D view | Ghost draws a layer's things see-through in one colour per group; Shown draws them as the opened sector's are. Clicking one picks it like any other thing; the picked panel names its sector first |
| Selections | One selection can hold things from several sectors, since every id names its sector (`exterior_-20_7_-1_0#12`). Each row shows its sector when it is not the opened one |

**Defaults:** every layer Off; the Global group collapsed. A layer's state is kept per sector in the workspace, so reopening the sector brings its layers back the way they were, still loading only on demand.

## How the list is found

1. **Candidates by box.** REDbridge's `sector.find` with the box around the opened sector's own things: every sector whose streaming box meets it, of every kind and level. A few seconds the first time; REDbridge keeps the list.
2. **Narrowed by the things themselves.** For each candidate, `sector.nodes` with `bounds`, no mesh export. A sector stays on the list when at least one of its things' bounds meets that box; the count on its row is how many do. A thing with no bounds counts as reaching in when its position is inside the box, and is marked so.
3. **Kept.** The narrowed list is cached per game build, so the tab opens at once the second time.

**Probe P1 (2026-11-24, `exterior_-22_7_0_0`, REDbridge 0.19.0):** the box around the sector's own things is 63 × 51 × 22 m. Its candidates and what step 2 found:

| Kind | Candidates | Reach in | First read |
|---|---|---|---|
| Exterior | 283 | 13 (295 things, 71 by position only) | 42 s, 148 ms each, slowest 1.4 s |
| Interior | 20 | 0 | 0.3 s |
| Quest | 2,789 | 0 | 14 s, 5 ms each |
| Navigation | 9 | 0 | 2 s |
| Always loaded | 4 | 0 | 5 s |

So the narrowing is worth it (13 of 3,105 candidates), but about a minute the first time, and reading again costs nearly as much (200 sectors in 12 s): REDbridge keeps no bounds between calls. **As built in L1:** REDcode keeps each sector's things' boxes in a disk cache (`overlaps/`, per game build, beside the mesh cache), checks the candidates nearest first, and fills the list as it goes ("Checking 120 of 283…"), with the Global group last. A place is slow once. REDbridge's one-call narrowing (#23, item 3) is not needed for now.

## Selecting and changing across layers

- **Every look and copy action works on any thing:** Fly To, Only, Isolate, Copy, Open Mesh, Open in EDGEmat, Add Mesh to Project, Back and Forward.
- **Scripts.** When layers are on, the Scripts menu asks once per run: **This Sector** or **This Sector and Its Layers On**. `ctx.nodes()` then holds the layers' nodes too, each with its sector; `node.id` already names it.
- **Changes are grouped by sector.** A change to a game sector's thing is listed with **Add to Project**, one question naming every such sector. Apply then writes each project sector in its own tab: each sector's change is one undo step in that tab, and each tab is saved on its own.
- **The opened sector stays the one in focus.** A layer is a way to see and reach its things, not a second file open in the same tab.

## Links in the picked panel (part 3)

The picked panel gains a **Links** row for the thing picked:

| Link | What it does |
|---|---|
| **Definition** | Its node in `nodes[k]`, in the tree (Show in Tree) |
| **Placements** | How many node data entries use the same definition: a click selects them all |
| **Inner** | For a cooked node (instanced and cooked static meshes): the inner record this entry places, in the tree |
| **Files** | The mesh, appearance and other files it uses: each opens in REDcode |

The way back, from a definition or an inner record to its placements, is a tree context menu item: **Select Placements in 3D**.

## Open in REDcode, both ways

| From | How |
|---|---|
| **The game** | The `redcode` REDnode package gets `openSector({ sector, entry })`. It writes `open-request.json` beside `project.json`, and the REDcode window that is open on a project (or the one used last) opens the sector at that entry. Game tabs and the size selector already work this way. EDGEbuilder adds **Open in REDcode** to its Sector drawer and to Picked in the world (its Sector Tools page lists it as missing) |
| **REDcode** | **EDGEworld: Open Sector Here** (the sector view's commands take the category EDGEworld, the owner's name for it, 2026-11-24) asks the package where V stands, through a request file answered as `display()` is. REDcode finds the sector there with `sector.find`: the interior sector when V is inside one, else the level 0 exterior. It opens it with the nearest thing picked. EDGEbuilder's camera place goes through EDGEbuilder's own button, since it knows its camera |

**Probe (P2):** which REDnode call gives V's position and facing inside a package, and whether the camera's place is readable too. **Answered from EDGEbuilder's code** (2026-11-25), which passed in the game in its S1: `api.GetPlayer(game.instance)`, then `GetWorldPosition()` and `GetWorldForward()`. The camera's place is EDGEbuilder's (its own camera, or V's first-person camera component), so REDcode reads only V's.

## Order

| Stage | Delivers |
|---|---|
| **P1, P2** | The two probes |
| **L1 Layers** | The tabs, the narrowed list, Off, Ghost and Shown, loading progress, picking a layer's thing |
| **L2 Across layers** (built 2026-11-25, hand test pending) | Selections across sectors, scripts over layers, Apply into each project sector |
| **L3 Links** (built 2026-11-25, hand test pending) | The picked panel's Links row and Select Placements in 3D |
| **L4 Open in REDcode** (built 2026-11-25, hand test pending) | `openSector` in the package (its version bumped), Open Sector Here; the request to EDGEbuilder for its buttons |

## L1 as built (2026-11-24)

- **The package:** `findOverlaps(bridge, sector, { cacheDir, onLayer, onProgress, stopped })` in `packages/world-view/src/host.ts` (each sector's things' boxes kept as JSON in `overlaps/` under the mesh cache, per game build), and `setSectorLook(sector, { colour, opacity } | null)` in `page.ts`: a layer's things in their own see-through instanced draw, still pickable.
- **REDcode:** `sectorOverlaps`, `sectorLayers` and `sectorOpen` in `src/cr2wEditor.ts` (the loader draws the opened sector, the coarser ones when on, and the layers on; a layer is the project's copy when the project has one); the tabs and the Overlaps list in `webview/sectorViewer.ts`. A new view starts with every layer off.
- **Changed from the plan:** Ghost and Shown are the only states drawn; the layer states are not kept when the tab closes (nothing checked at first, as the owner asked). The **variants** tag was dropped from the rows, since most sectors have variants; the count is in the row's tooltip. Off is lit in grey, so only layers that are on stand out.
- **Checked:** see `docs/testing.md`, Sector layers (L1).

## L2 and L3 as built (2026-11-25)

- **Scripts over layers** (`src/sectorScriptsUi.ts`, `src/scriptRunner.ts`): with layers on, a run asks **This Sector** or **This Sector and Its Layers On** (decision 3). For the second, each layer's JSON is read (the project's copy when it has one, with an open tab's unsaved edits; else the game's) and its nodes follow the opened sector's in `ctx.nodes()`, each with its own `node.sector`; `ctx.sectors()` lists the run's sectors. The selection goes by id, so **Run on Selection** and `ctx.selected()` hold the layers' things too, and what a script selects comes back by id and is selected in any sector.
- **Changes in several sectors** (`applyAcross`): one question lists each sector, how many values change there, and where they go (here; the project's copy, in its own tab; or the game's, added to the project). The game's sectors are added together through Add to Project (one question when any is there already); then each sector's changes are one edit in its own tab, unsaved, with its own Undo (decision 2). A run whose changes are all in the opened sector goes the way it went before.
- **Changes are kept by sector and path** (`src/sectorNodes.ts`), so the same value in two sectors is two changes.
- **Links** (`entryLinks`, the host's `sectorLinks`): the picked thing's **Node** (its definition, Show in Tree), its **placements** (select them all), a cooked node's **Inner** record (Show in Tree, at `nodes.<k>.Data.buffer.Data.InnerNodes.<i>`), and the **files** it uses (each opens in REDcode, the project's copy first). For a layer's thing, Node and Inner open its sector at it, and **Open Its Sector** does too. A cooked node's definition is the inner record each entry places: its placements are the entries placing the same record, and its files that record's, with the node's own outside its buffer (a destructible's effect).
- **Select Placements in 3D**: right-click a node (`nodes.<k>`) or a cooked node's inner record in the tree; the view goes to 3D with the entries that place it selected (`placementsOf`, the host's `sectorPlacements`).
- **Checked** on `exterior_-22_7_0_0` through REDbridge 0.19.0 (1,233 entries of 14 node classes: an AI spot's workspot, a smart object's workspot and action database, a decal's materials, a destructible's effect and mesh, cooked and instanced nodes with one placement per inner record) and by the unit checks (94).
- **Not built:** the Properties tab across layers (it still changes only the opened sector's things, and says so); every other look and copy action already worked on any thing.

## L4 as built (2026-11-25)

- **The package** (`extensions/redcode/rednode/redcode`, **0.4.0**): `openSector({ sector, entry })` (or `(sector, entry)`) writes `open-request.json` beside `project.json` and waits up to 4 seconds for a window's claim, answering `{ opened: true, window }` or `{ opened: false, why }`; `place()` gives V's position and facing. Both are tools for assistants (`redcode__openSector`, `redcode__place`). REDcode asks for V's place through `place-request.json`, answered in `place.json`, as the display is asked.
- **Which window:** each REDcode window watches the request (`watchOpenRequests` in `src/rednodeService.ts`). The window last focused with a project takes it at once; other windows with a project after 0.3 s (with the focus) or 0.7 s, and windows with none after 1.2 s, so a request is still taken when that window does not answer. The first claim (`open-<id>.claim`) wins. VS Code does not come to the front: whether a REDnode app can open a `vscode://` link is still unverified (Sector Tools, decision 1 b).
- **Open Sector Here** (`redcode.openSectorHere`, **EDGEworld: Open Sector Here**; `src/sectorHere.ts` without VS Code imports, `src/sectorGame.ts`): `sector.find` with a 2 m box around V. An interior counts when V is inside the box around its things (half a metre more each way, two up for the head); the six smallest interiors around V are read, smallest first. Else the level 0 exterior whose streaming box's middle is nearest V across the ground. The thing picked is the nearest one that shows a resource (a mesh, an entity), by its box, its nearest instanced copy or its place. The project's copy opens when the project has one.
- **Not built:** EDGEbuilder's buttons (its side; told in its #9 with the package version).
- **Checked:** `docs/testing.md`, Sector layers L4 and Sector Tools L1 (by script; the hand test pending).

## Requests to others

Filed on 2026-11-24 with the owner's go: [REDbridge #23](https://github.com/Edgemodders/REDbridge/issues/23) and [EDGEbuilder #11](https://github.com/Edgemodders/EDGEbuilder/issues/11).

- **REDbridge:** each sector's variants by name with their node ranges (`sector.find` counts them now); sectors that mods register through ArchiveXL, as another source; perhaps steps 1 and 2 above in one call.
- **EDGEbuilder:** the Open in REDcode buttons (L4); who owns assemblies (part 6), and what REDcode shows of them.

## Not in this page

The comparison (part 2, its own page next), copies that keep every field (4), assemblies (6), checks around a bake (7), and what the running game loaded (8). Also not here: a Set, ± and × panel for the selection's values; sector scripts cover batch edits for now.

## Decisions (taken 2026-11-24: the recommended one each time)

1. **What "reaches in" means.** A thing whose bounds meet the box around the opened sector's own things. *Recommended:* this one. The other choice, the sector's streaming box, is a little larger and lists more.
2. **Undo across sectors.** Each sector changed gets its own undo step in its own tab. *Recommended:* this one, since it uses what VS Code already does. One Undo for a change over several sectors is possible, but REDcode would keep its own undo for it.
3. **Scripts over layers.** Ask **This Sector** or **This Sector and Its Layers On** each run when layers are on. *Recommended.*
4. **The Global group** (quest and always loaded): listed, collapsed, narrowed the same way. *Recommended.* Many quest sectors load only while their quest runs, so the group's heading says so.
5. **Open Sector Here:** the interior sector when V stands inside one, else the level 0 exterior. *Recommended.*
