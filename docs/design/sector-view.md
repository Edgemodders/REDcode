---
title: Sector view
---

# Sector view: a streaming sector in 3D

Draft 0.2, 2026-11-19, agreed with the owner (decisions below); the package's API is still to agree with EDGEbuilder. The owner asked on 2026-11-19 whether EDGEbuilder could open a 3D sector view of REDcode's instead of hosting one of its own. Nothing is built. It comes after Animations A3 and New File, unless the owner moves it, and its drawing code waits for EDGEbuilder's E0 answer (below).

## What there is today

- **In REDcode:** a `.streamingsector` opens in the CR2W editor as a tree and property grid. `nodes` holds the placed things, and `nodeData` places each one (`nodeIdx`, `transform`, `scale`, `streamingDistance`, ...). There is no 3D view. The mesh viewer (`src/meshViewer.ts`, `webview/meshViewer.ts`, `webview/viewerKit.ts`) draws one mesh or entity from a GLB that `project.export` writes into the export cache (`src/exportCache.ts`).
- **In REDbridge (0.12.0, 2026-11-05, [REDbridge #11](https://github.com/Edgemodders/REDbridge/issues/11)):** `sector.find` lists the game's 26,347 sectors with their boxes. `sector.nodes(path, { kinds?, bounds?, archive?, root? })` gives one item per node-data entry: class, resource and appearance, world transform, streaming ranges, and one world placement per copy for instanced meshes. REDcode already requires REDbridge 0.13.0, so every install has both.
- **In EDGEbuilder's plan** ([Library and world view](https://github.com/Edgemodders/EDGEbuilder/blob/main/docs/library.md), B7 as EDGEbuilder for VS Code):
  - **E0:** a probe that draws one sector with REDcode's viewer from a script. Its question is how long a busy downtown sector takes, the first time and after.
  - **E1:** the world map.
  - **E2:** the sector view.
  - **E3:** adding, moving and deleting Library scene objects in it, with the in-game gizmo.
  - Its table of needs asks REDcode for "its mesh viewer usable from another extension for many meshes at once, or its three.js scene shared".

## The split

One VS Code extension cannot put another extension's webview inside its own. EDGEbuilder could only open REDcode's panel as a tab of its own, or bundle the drawing code itself. Hosting EDGEbuilder's editing (gizmos, selection, scene state, Library overlays) inside REDcode would make REDcode the host of EDGEbuilder's editor and tie the two release cycles. The owner took the same line on 2026-11-15, when #2's scene tree and Bake moved to EDGEbuilder for VS Code. So the view is in three layers:

| Layer | What | Where |
|---|---|---|
| **1. The drawing package** | The game's things in a three.js scene: a sector's items from `sector.nodes`, each unique mesh loaded once from its GLB and drawn as instances, distance culling by the items' streaming ranges, markers for lights and other kinds that have no mesh, the flying camera, a pick that answers the item. Two halves: a host half (no VS Code imports) that asks the bridge, exports through a cache folder it is given, and streams progress; a page half that draws. The mesh viewer's own code moves into it, so there is one renderer | An npm package from this repo, beside `packages/redcode-mcp`, like `@edgemodders/edgemat-core` and EDGEfab's core. MIT. Name to agree: `@edgemodders/world-view` |
| **2. REDcode's sector mode** | A `.streamingsector` opens in 3D, read-only, as a mesh does, with **Tree** one click away. A click on a thing selects its `nodeData` entry and node in the tree and the Properties view. Game sectors and a project's copies, a mod's through `archive`. `REDcodeApi.openSector(path, { select? })` opens it at one entry, for EDGEbuilder's "show me" and any other tool | `src/sectorView.ts` and a `sector` mode in `media/cr2w/editor.js`, over the package |
| **3. EDGEbuilder's sector view** | Its own panel over the same package: Library scenes over the sector, add and move objects with its gizmo, B4b's edits, bake and Open in game | EDGEbuilder for VS Code, its E2 and E3 |

## What layer 1 starts with

- **Meshes only**, in flat colours: `worldMeshNode`, instanced meshes and the meshes of cooked nodes, the same scope as E2's first step. Entities as their meshes when the bridge names them, otherwise boxes from `bounds`. Textures, EDGEmat's materials, terrain and whole entities come later.
- **One export per mesh**, cached by game path as the mesh viewer's are now. The first visit to a sector is slow: a progress bar says how many meshes are left.
- **Each extension keeps its own cache**, so a mesh both have shown is on disk twice. A shared cache folder is possible later, if the space matters.
- **REDbridge answers one call at a time.** A sector's exports queue behind each other, and behind any other call that extension makes. Each extension runs its own bridge, so REDcode's and EDGEbuilder's do not queue for each other.

## Order

1. **EDGEbuilder's E0** runs with REDcode's mesh viewer code as it is, from a script, and answers the timing question. The package's shape follows from its answer: how many meshes a downtown sector has, how long their exports take, and whether instancing and culling are enough.
2. The package and REDcode's sector mode, agreed with EDGEbuilder's session first. The package's API is the contract between the two, so it is agreed before either builds on it.
3. EDGEbuilder's E2 on the package.

## Decisions

Agreed with the owner on 2026-11-19: each of the three as proposed. The owner expects EDGEbuilder to reach its E0 probe soon, after its Doors phase.


1. **The three layers**, rather than REDcode alone hosting the view or EDGEbuilder alone writing its own. Proposal: the three layers.
2. **Where the package lives:** in this repo, since the mesh viewer is here and its code moves into it. The other way is a repo of its own. Proposal: this repo.
3. **When:** after A3 and New File, with E0 free to run before that on today's viewer code. Proposal: as said.

The request to agree the package's shape with EDGEbuilder is [EDGEbuilder #8](https://github.com/Edgemodders/EDGEbuilder/issues/8).

## Not in this design

- The world map (EDGEbuilder's E1): it is EDGEbuilder's.
- Editing a sector's own nodes in 3D. The tree edits them today; EDGEbuilder's B4b removes them as ArchiveXL node deletions.
- Terrain, foliage and whole entities with their components.
