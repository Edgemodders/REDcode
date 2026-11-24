---
title: Sector layers
---

# Sector layers: what else is in this place

Draft 0.1 for the owner, 2026-11-24. Nothing here is built.

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
- **What stands in the cell reaches much further.** The sector's own things fill a box about 268 m across, and none reaches past the sector's streaming box. So the neighbours' things reach into this cell the same way.
- **Many sectors meet that box:** 105 other level 0 exteriors, 320 coarser exteriors (levels 1 to 6), 50 interiors, 10 navigation, 4 always loaded, and 2,789 quest sectors, many with very large boxes.

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

**Probe first (P1):** how long step 2 takes on three busy sectors, quest sectors included. If it is slow, the Global group is narrowed only when opened, or REDbridge does steps 1 and 2 in one call (a request, below).

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

**Probe (P2):** which REDnode call gives V's position and facing inside a package, and whether the camera's place is readable too.

## Order

| Stage | Delivers |
|---|---|
| **P1, P2** | The two probes |
| **L1 Layers** | The tabs, the narrowed list, Off, Ghost and Shown, loading progress, picking a layer's thing |
| **L2 Across layers** | Selections across sectors, scripts over layers, Apply into each project sector |
| **L3 Links** | The picked panel's Links row and Select Placements in 3D |
| **L4 Open in REDcode** | `openSector` in the package (its version bumped), Open Sector Here; the request to EDGEbuilder for its buttons |

## Requests to others

To draft for the owner, posted on the owner's go:

- **REDbridge:** each sector's variants by name with their node ranges (`sector.find` counts them now); sectors that mods register through ArchiveXL, as another source; perhaps steps 1 and 2 above in one call.
- **EDGEbuilder:** the Open in REDcode buttons (L4); who owns assemblies (part 6), and what REDcode shows of them.

## Not in this page

The comparison (part 2, its own page next), copies that keep every field (4), assemblies (6), checks around a bake (7), and what the running game loaded (8). Also not here: a Set, ± and × panel for the selection's values; sector scripts cover batch edits for now.

## Decisions for the owner

1. **What "reaches in" means.** A thing whose bounds meet the box around the opened sector's own things. *Recommended:* this one. The other choice, the sector's streaming box, is a little larger and lists more.
2. **Undo across sectors.** Each sector changed gets its own undo step in its own tab. *Recommended:* this one, since it uses what VS Code already does. One Undo for a change over several sectors is possible, but REDcode would keep its own undo for it.
3. **Scripts over layers.** Ask **This Sector** or **This Sector and Its Layers On** each run when layers are on. *Recommended.*
4. **The Global group** (quest and always loaded): listed, collapsed, narrowed the same way. *Recommended.* Many quest sectors load only while their quest runs, so the group's heading says so.
5. **Open Sector Here:** the interior sector when V stands inside one, else the level 0 exterior. *Recommended.*
