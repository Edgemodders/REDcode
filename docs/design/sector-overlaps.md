---
title: Sector overlaps and the world index
---

# Sector overlaps and the world index

Agreed with the owner on 2026-11-26, with all five recommendations (the decisions at the end). O1 is built (2026-11-26, [as built](#o1-as-built)), hand test pending.

A modder sent a bug report and a plan on 2026-11-26: the sector view's **Overlaps** tab ([Sector layers](sector-layers.html), L1) lists sectors that are nowhere near the one opened, and turning one on draws the whole other sector. The plan goes further: a shared index of the game's sectors and placed things, a Night City map over it, and reusable assemblies. This page is REDcode's answer: what is wrong, what changes, and how the index is built.

The owner's choice so far (2026-11-26): **the index is built locally to start**, on the modder's own PC, after asking them, with a progress bar while it runs. No index made from the game's files is shipped.

## Where each part of the request goes

| Part of the request | Where | Here? |
|---|---|---|
| Overlaps that match thing to thing, with the reason shown | REDcode, `@edgemodders/world-view` | **Yes**, O1 |
| A search over an area: a drawn box, typed XYZ, or a radius | REDcode | **Yes**, O1 |
| A layer that draws only the things that matched, with Full sector per row | REDcode, the package | **Yes**, O2 |
| Proxies as their own layer, left out of searches | REDcode, the package | **Yes**, O3 |
| A world index of every sector and placed thing, shared by the tools | The package (renderer-free), REDbridge reads | **Yes**, W1 to W3 |
| Every placement of one mesh across the city | The index | **Yes**, W3 |
| The Night City map and the grid map | EDGEbuilder (its world map, E1), over this index | No: EDGEbuilder's |
| Reusable assemblies (a rooftop's HVAC, a decoration set) | EDGEbuilder ([#11](https://github.com/Edgemodders/EDGEbuilder/issues/11)), from REDcode's selection | No: to agree there |
| Named places (apartments, districts, quest sites) | Later, after the geometry search works | No |
| What the running game loaded | EDGEbuilder's Sector drawer, REDnode | No |

The modder offered two layouts: **A**, the index as a module in the existing package, or **B**, a package of its own. This page takes **A**: a module of `@edgemodders/world-view` with no drawing code and no VS Code imports, so EDGEbuilder, the MCP server and scripts call the same functions. It can move to its own package later without changing its calls.

## What is wrong today (probe O0)

How L1 finds the list ([host.ts](https://github.com/Edgemodders/REDcode/blob/main/packages/world-view/src/host.ts), `findOverlaps`):

1. One box is drawn around **every** thing in the opened sector: each thing's bounds, or its position when it has none.
2. Every sector whose streaming box meets that box is a candidate.
3. A candidate stays when any of its things meets that **one box**.

Probe O0 (`tools/probes/sector-overlaps/diagnose.mjs`, REDbridge 0.19.0, 2026-11-26) ran the modder's example:

| | `exterior_-11_11_0_1` (opened) | `exterior_-6_6_0_1` (listed) |
|---|---|---|
| Level | 1 | 1 |
| Streaming boxes meet | No | |
| Things | 1,551 (1,350 with bounds) | 2,407 |
| The box around its things | 1,440 × 1,549 × 125 m, from x −1440 to **0** and y **0** to 1548 | |
| Things inside the opened sector's box (today's count) | | 2,404 of 2,407 |
| Things that meet one of the opened sector's things | | 1 |

**The cause:** one thing in each sector sits at the world's origin. In the opened sector it is entry 899, a `worldInstancedOccluderNode` (`plane_occluder_twosided_yz.mesh`). An occluder is a helper the game uses to hide what is behind walls, never drawn. Its node data's own placement is 0, 0, 0, since its real places are kept in the node's buffer, and REDbridge reads a node's copies only for instanced meshes and instanced destructibles. So its box is worked out at the origin, and it stretches the opened sector's box by more than a kilometre, over `-6_6`. The one match left, thing to thing, is `-6_6`'s own occluder at the origin meeting entry 899.

So the example is two bugs on top of each other:

- **A helper with a wrong place.** Occluders are not something a modder sees, and this one's box is wrong.
- **One box for the whole sector.** Even with the box right, the test overcounts. On the level 0 neighbours `exterior_-22_7_0_0` and `-21_7_0_0` (a box that is right, 63 × 55 × 48 m), today's count is 10 things, and only 4 of them meet one of the opened sector's things.

Also found:

- Instanced meshes are placed at the origin in their node data too (662 in `-22_7_0_0`), but REDbridge gives them the right box from the node's buffer. They are not affected.
- One box covers all copies of an instanced mesh group, not each copy.
- Many things have no bounds: collision, acoustics, crowd parking spaces, light channel volumes, entities. Today they count by their position, and they widen the box.
- A candidate must have a streaming box that meets the opened sector's box. A thing that reaches past its own sector's streaming box would be missed. None did in probe P1 (`exterior_-22_7_0_0`); across the city it is **unverified**. The index (W) removes this step.

## O1: matching thing to thing

| Change | What it does |
|---|---|
| **Roles** | Each thing gets a role from its node class (and a cooked node's inner record): **Detail** (meshes the game draws), **Proxy** (stand-in meshes for distance, O3), **Helper** (occluders, collision, acoustics, navigation, crowd, light volumes, areas, markers) or **Unknown**. Roles are REDcode's labels, not the game's. |
| **The footprint** | The opened sector's Detail things only, each by its own box. Helpers and proxies make no footprint. A **Helpers** checkbox in the tab adds them, off by default. |
| **The test** | A candidate's thing counts when its box meets at least one footprint box. The footprint's boxes go into a small grid (16 m cells), so the test stays quick. No single box around the sector is used in the test. |
| **Things without bounds** | An entity, decal or light counts when its position is inside a footprint box, marked **by position**. A helper without bounds counts only with Helpers on. |
| **Boxes left out** | A box that is not a number, inverted, or larger than 2 km, and a thing at exactly 0, 0, 0 whose node keeps its places in a buffer, take no part in matching. They are listed under **Left out** in the diagnostics, not dropped silently. |
| **Nearby** | A margin in metres, 0 by default, grows every footprint box. 0 is the strict test. |
| **Scope** | **Whole sector** (default) or **Area**. Area is the selection volume (the Volume tool), a typed min and max XYZ, or a radius around the camera. Area tests things against that one box and ignores the footprint. The query's box is drawn in the 3D view. |
| **Why** | A layer's row opens to list its matches: its thing, the opened sector's thing it meets (or the area), and their boxes. A click selects both. **Copy Diagnostics** copies the query, the counts (with bounds, by position, left out) and each match as text. |
| **Instanced copies** | One box per group today. A box per copy needs REDbridge: asked below. Until then the group's box, marked as a group in Why. |
| **Groups and levels** | As now: Neighbours, Coarser, Interiors, Global, Other, each level in its own colour. Coarser levels are never mixed into the detail view without being switched on. |

Candidates still come from streaming boxes until the index is built: the box around the footprint meets their streaming box. With helpers out and bad boxes left out, that box is the sector's real extent. The tab says when a list came this way: **Found by streaming boxes; things past their own sector's box are not seen.**

### O1 as built

Built 2026-11-26. In the package (`packages/world-view/src/host.ts`): `roleOf`, the per-sector cache in a second version (`<hash>-v2.json`: each thing's entry, class, file, flags and box; the old files are read no more), `BoxGrid` (16 m cells, boxes over 256 m kept apart), and `findOverlaps` with `margin`, `helpers`, `proxies`, `area`, `matchLimit` and `onQuery`. Each layer carries its first 50 `matches` and a `leftOut` count; the query carries the footprint, the counts and the opened sector's left-out things. In REDcode (`webview/sectorViewer.ts`): the tab's controls, Why, and Copy Diagnostics. The package's `volume.set` puts a box there as if drawn.

**Roles** from the classes in five sectors (probe `tools/probes/sector-overlaps/classes.mjs`, 2026-11-26):

| Role | Classes seen |
|---|---|
| Proxy | Any class with *Proxy* in its name: `worldCookedGenericProxyMeshNode` (617 in five sectors), `worldEntityProxyMeshNode`, `worldDestructibleProxyMeshNode`, `worldDestructibleEntityProxyMeshNode`, `worldBuildingProxyMeshNode` |
| Helper | Occluders (`worldInstancedOccluderNode`, `worldStaticOccluderMeshNode`), collision, acoustics, AI spots, community and other areas, GI, traffic, crowd parking, sound emitters, fog volumes, reflection probes, interior maps, light channel volumes, population spawners, smart objects |
| Detail | Meshes (instanced, cooked static, bended, rotating, terrain, `worldMeshNode`), advertisements, physical destruction, decals, lights, particles, entities and devices |

Things with no box count **by position** only when they are entities, devices, decals, lights, particles or decorations. The only class seen at 0, 0, 0 with no copies read is `worldInstancedOccluderNode`: those are the things left out today (117 in `exterior_-3_2_0_3`). A box that is not a number, inside out or over 2 km on a side is left out too.

**Changed from the page above:** Include proxies came forward from O3 as a **Proxies** checkbox in the tab, beside Helpers, since decision 2 keeps proxies out of searches and the matching had to know them already. O3 keeps the drawing switch. **Camera** in Area takes the box round the point the camera orbits, not the camera: a framed view's camera stands far off, often in the air. Area, typed numbers and Camera all set the Volume, so the box is drawn, its handles work, and it selects what is in it as the Volume tool does.

**Measured** (REDbridge 0.19.0, `tools/probes/sector-overlaps/o1-check.mjs`):

| Opened | Before | Now |
|---|---|---|
| `exterior_-11_11_0_1` | Lists `exterior_-6_6_0_1`; the box 1,440 × 1,549 m | 27 layers, `-6_6_0_1` not among them; the footprint 1,215 things, its extent 173 × 160 × 114 m; one thing left out (entry 899, the occluder) |
| `exterior_-22_7_0_0` | 13 to 16 layers; `-21_7_0_0` with 10 things | 4 layers; `-21_7_0_0` with 3 things |

The first search after the update reads every candidate again for the new cache: 47 s on `exterior_-22_7_0_0` (3,105 candidates, most of them quest sectors whose streaming box covers the city), then about 5 s.

## O2: draw only what matched

- A layer that is turned on draws **only its matching things**. A **Full sector** checkbox on its row draws the whole sector, for that row only.
- Off, Ghost and Shown stay as they are.
- The package's loader takes a list of ids per sector (`<sector>#<entry>` or `<sector>#<entry>.<copy>`, the ids selections use). Things not on the list are not exported, so turning a layer on costs only what it draws.
- Selecting, scripts over layers, and Add to Project work on what is drawn, as L2 does now.

## O3: proxies as their own layer

- A **Proxies** switch, **Off**, **Ghost** or **Shown**, in the sector view's bar. It covers the opened sector and its layers.
- It shows how many are hidden ("Proxies: 14 off"), so nothing disappears without a word.
- Proxies take no part in overlap matching unless **Include proxies** is ticked in the Overlaps tab.
- A proxy is found by its class: `worldBuildingProxyMeshNode`, `worldGenericProxyMeshNode`, `worldDestructibleProxyMeshNode`, `worldTerrainProxyMeshNode`, and for a cooked node, its inner record's class. A cooked node is never a proxy because it is cooked: some hold detail meshes. Anything not sure is **Unknown**, which shows with Detail and can be switched off on its own.
- **Probe O3** comes first: which proxy classes the game's sectors use, at which levels, and how many cooked inner records are proxies. The list above is from WolvenKit's class names and is **unverified** against the game's sectors.

## The world index

### What it holds

| Part | Per | Fields |
|---|---|---|
| **Sectors** | Sector | Path, source (base, ep1, later mods and projects), kind, level, grid cell, streaming box, variant count |
| **Things** | Placed thing | Id (`<sector>#<entry>[.<copy>]`), node class, role, resource path (or its hash when unnamed), position, box or none, where the box came from (mesh, group, none, left out), variant range |
| **The grid** | 64 m cell, in the game's X and Y | Which things' boxes reach into the cell, with their Z range |

Coordinates stay in the game's axes (Z up). The viewer converts when it draws. Meshes, textures and the game's file data are never stored: the index is numbers, names and paths.

The format is chosen after probe **W0**, which measures the whole game: how many sectors and things, how long a full read takes, and how big the index is. A JSON file per sector plus the grid, as the overlaps cache keeps today, is the first choice: no native module to ship. SQLite with an R-tree is the second, if W0 shows JSON is too slow to query. Whether VS Code's Node has `node:sqlite` is **unverified**.

### Building it: asked first, with progress

The index is built on the modder's PC, once per game build.

1. **Asked when first needed.** The first time something would use it (the Overlaps tab, an Area search, Find Every Copy), REDcode asks once:

   > **Build the world index?** REDcode reads every sector of the game once (about *N* minutes, about *M* MB on disk) so overlaps and searches answer at once. Without it, Overlaps reads sectors as you go.
   >
   > **Build** · **Not Now**

   *N* and *M* come from W0. **Not Now** keeps today's way for that window and asks again in a later session. The command **EDGEworld: Build World Index** builds it at any time.
2. **Progress while it runs.** A VS Code notification with a bar and **Cancel**: "World index: 4,210 of 31,000 sectors". The Overlaps tab shows the same state. Building runs in the background; REDcode stays usable, though REDbridge answers one call at a time, so other bridge calls wait between sectors.
3. **Cancel or a crash** keeps every sector already read; the next build goes on from there. Each sector's part is written to a temporary file and renamed, so a cut-off build never leaves a broken file.
4. **Stale.** The index records the game's version and its archives' sizes and dates. When they change (a game update), the index is **Stale**: REDcode says so and asks again. A stale or partial index never answers "nothing here". It says **Partial** or **Stale** with the answer, and Overlaps goes back to reading as it goes.
5. **Rebuild** (the command **EDGEworld: Rebuild World Index**) starts again from nothing.

The index lives in one folder for every tool, `%LOCALAPPDATA%\Edgemodders\world-index\<game build>`, so EDGEbuilder and the MCP server read the same files as REDcode and nothing is read twice.

### Mods and projects

- The open project's own sectors are read as they are now, at the time of the query, and stand over the game's in the answer. They are never written into the index.
- Sectors from installed mods come later, through REDbridge's `sector.find` `sources: ["mods"]` (REDbridge #23), as a source of their own in the index.

### Queries

One set of functions, in the package and as MCP tools, so REDcode, EDGEbuilder, scripts and assistants get the same answers:

| Function | Answers |
|---|---|
| `findThings({ box, roles, kinds, margin })` | The things in a box, by sector |
| `findOverlaps({ sector, scope, area, margin, helpers, proxies })` | O1's list, from the index when it is complete, else read as it goes |
| `findCopies({ mesh })` | Every placement of a mesh across the city, with role and sector |
| `indexStatus()` | Complete, Partial (how much) or Stale, and the game build |
| `buildIndex({ onProgress, stopped })` | The build above |

With the index, candidates come from the grid, not from streaming boxes, so a thing that reaches past its own sector's box is found.

## Order

| Stage | Delivers |
|---|---|
| **O0** | The probe above (done 2026-11-26) |
| **O1** | Roles, the footprint, thing-to-thing matching, Nearby, Area, Why and Copy Diagnostics |
| **O2** | Layers draw only their matches; Full sector per row; the loader's id list |
| **O3** | Probe O3, then the Proxies switch and Include proxies |
| **W0** | The measurement probe: the whole game's sectors and things, time and size |
| **W1** | The index: the build, the question, progress, Cancel, Stale, the shared folder |
| **W2** | Overlaps and Area from the index; `findThings`; the MCP tools |
| **W3** | Find Every Copy of a mesh (the picked panel and the tree's mesh path), over the city |

O1 and O2 come first, since they fix a released feature (Sector layers, 0.10.17). They come before sector materials M2 in REDcode's order.

## Requests to others

- **REDbridge:** read the copies of every node kind that keeps its places in a buffer, starting with `worldInstancedOccluderNode`, so no box is worked out at the origin; a box per instanced copy; and a field saying where each box came from (the mesh, the group, none). Filed as [REDbridge #25](https://github.com/Edgemodders/REDbridge/issues/25) on 2026-11-26. REDcode does not wait on it.
- **EDGEbuilder** (on [#11](https://github.com/Edgemodders/EDGEbuilder/issues/11)): its world map over this index (W2's calls and the shared folder), and assemblies from REDcode's selection, which keep each thing's id and transform.

## Tests

From the modder's list, with what this page changes:

1. **The example:** with `exterior_-11_11_0_1` open, `exterior_-6_6_0_1` is not listed. Copy Diagnostics names the opened sector's occluder under Left out (the other sector's, no longer listed, is not named).
2. **Two groups far apart:** things at x 0 to 10 and x 1000 to 1010 in the opened sector; a thing at x 500 to 510 elsewhere does not match.
3. **A long thing over a boundary:** a bridge or road from a neighbour that reaches into the opened sector matches, and Why names both things.
4. **Height:** things straight above or below each other with Z ranges apart do not match.
5. **Helpers:** an occluder, a collision node or an area makes no match until Helpers is ticked.
6. **Area:** a drawn volume and the same min and max typed give the same list.
7. **Draw only matches:** a layer turned on draws only its matches; Full sector on one row leaves the other rows drawing only theirs.
8. **Proxies:** Off hides them and says how many; Ghost and Shown bring them back without reading again; a cooked node's detail meshes stay.
9. **The index:** the question comes once; the bar moves and Cancel stops it; the next build goes on from there; a second query of the same place gives the same list as one without the index; a changed game marks it Stale.
10. **The tools agree:** the same box gives the same things to REDcode, the MCP tools and EDGEbuilder.
11. **Nothing else changed:** Frame All, selection, Volume, materials, coarser levels and a whole-sector layer work as before.

## Decisions

All five agreed by the owner on 2026-11-26, as recommended.

1. **Helpers out by default.** Occluders, collision, acoustics, navigation, crowd and light volumes take no part in matching unless Helpers is ticked. *Recommended.* This replaces L1's decision 1 (the box around the sector's things).
2. **Proxies by default.** Off in searches and in layers. In the opened sector, Shown, as it is now, since that is the file being edited and hiding part of it would surprise. The switch turns them off there too. *Recommended.* The other choice is Off everywhere, the modder's own preference.
3. **Layers draw only their matches by default**, with Full sector per row. *Recommended*, as the modder asks.
4. **The index's folder is shared** by every tool, under `%LOCALAPPDATA%\Edgemodders\world-index`. *Recommended.* The other choice is REDcode's own storage, with EDGEbuilder building its own.
5. **When to ask about the index:** the first time something would use it, not when REDcode starts. *Recommended.*
