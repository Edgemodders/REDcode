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

## E0's answers

EDGEbuilder ran E0 on 2026-11-19 (REDbridge 0.15.0, game 2.5, an RTX 4090), on this repo's mesh viewer approach as it is: plain GLBs (no materials, the most detailed LOD), three.js 0.170 ([its results](https://edgemodders.github.io/EDGEbuilder/library.html#e0-results), [EDGEbuilder #8](https://github.com/Edgemodders/EDGEbuilder/issues/8)):

| | `exterior_-22_7_0_0` (most copies) | `exterior_-23_-3_0_0` (most entries) | City Center, level 0 |
|---|---|---|---|
| Unique meshes in copies | 105 in 8,986 | 347 in 3,616 | 6,522 in 605,801, over 577 sectors |
| Other things | 202 | 1,703 (765 decals, 242 lights, 189 entities, ...) | |
| GLB export, first and again | 2.1 s (8.8 MB), 0.04 s | 11.4 s (29 MB), 0.23 s | about 3 to 4 min and 0.5 GB, estimated |
| Everything drawn | 193 draw calls, 2.2 M triangles, 1,760 fps | 711 calls, 3.0 M triangles, 680 fps | |

What follows for the package:

- **Plain by default, textures on demand.** A mesh with its materials and textures took 0.8 s and about 6 MB, against 20 to 35 ms and about 85 KB plain. The view colours by mesh or by material and textures the one object picked.
- **One instanced draw per GLB primitive**, with every placement of the mesh: never one object per copy.
- **Several sectors at once.** Level 0 is the near layer: culled by streaming distance, 17 of 8,986 copies remain when seen from 80 m up. So the host half takes a list of sectors (a level-0 sector and the coarser ones over it), and culling by streaming distance is a switch.
- **Entities as markers** at first, an entity's GLB on demand like textures.
- **A laptop run** before any frame budget is set: a 4090 hides everything.

## What layer 1 starts with

- **Meshes only**, in flat colours: `worldMeshNode`, instanced meshes and the meshes of cooked nodes, the same scope as E2's first step. Entities as markers, with their GLB on demand. Textures for one picked object on demand. EDGEmat's materials, terrain and whole entities come later.
- **One export per mesh**, cached by game path as the mesh viewer's are now. The first visit to a sector is slow: a progress bar says how many meshes are left.
- **Each extension keeps its own cache**, so a mesh both have shown is on disk twice. A shared cache folder is possible later, if the space matters.
- **REDbridge answers one call at a time.** A sector's exports queue behind each other, and behind any other call that extension makes. Each extension runs its own bridge, so REDcode's and EDGEbuilder's do not queue for each other.

## The package's API

Draft 0.1 (2026-11-19), to agree with EDGEbuilder in [#8](https://github.com/Edgemodders/EDGEbuilder/issues/8). TypeScript, ES modules. `three` is a peer dependency, so each extension bundles its own copy.

**Names.** Every drawn thing has a string id. A sector's item is `<sector path>#<entry>`, with `entry` the node data index (what ArchiveXL's deletions and REDnode's registry use), and `#<entry>.<copy>` for one copy of an instanced mesh. Any other id belongs to the caller (EDGEbuilder's scene objects), and the page treats both alike for picking, highlighting and hiding.

**Host half** (`@edgemodders/world-view/host`, Node, no VS Code imports):

```ts
interface Bridge { request<T>(method: string, params?: object): Promise<T> }   // REDcode's BridgeClient fits

loadSectors(bridge, {
  sectors: { path: string; archive?: string; root?: string }[],
  cacheDir: string,
  kinds?: string[],
  signal?: AbortSignal,
  onMesh(m: { mesh: string; glb: string; placements: { id: string; matrix: number[] }[] }): void,
  onMarkers(ms: { id: string; kind: string; class: string; resource?: string; matrix: number[]; box?: Box }[]): void,
  onProgress(p: { done: number; total: number; etaMs?: number }): void,
}): Promise<{ skipped: { id: string; why: string }[] }>

sectorsOver(bridge, path): Promise<string[]>        // a level-0 sector and the coarser sectors over it, through sector.find
texturedGlb(bridge, mesh, cacheDir): Promise<string>  // the mesh with its materials, for one picked object
entityGlb(bridge, ent, appearance, cacheDir): Promise<string>
```

Meshes come as they are exported, cached ones first, so the page fills in while the rest export. `glb` is a file path; each host turns it into a webview URI or bytes.

**Page half** (`@edgemodders/world-view/page`):

```ts
const view = createWorldView(canvas, { colourBy: "mesh" | "material", culling: "streaming" | "none" })
view.addMesh(mesh, glb: ArrayBuffer, placements)        // one InstancedMesh per GLB primitive
view.addMarkers(markers)
view.addObject(id, object3d)                            // the caller's own things, in the same scene
view.replaceMesh(id, glb)                               // a textured or entity GLB for one id
view.setHidden(ids, "hidden" | "ghost" | "shown")       // a scene's removals, shown as they will bake
view.highlight(ids)
view.onPick((id, point) => ...)                         // the id under the pointer, or null
view.attachGizmo(id, { mode: "translate" | "rotate" }, onChange)   // three's TransformControls
view.camera.pose / view.camera.setPose(pose) / view.frame(ids)
view.scene, view.renderer                               // for what the package does not do yet
view.dispose()
```

Open questions for EDGEbuilder:

1. **The gizmo:** is `attachGizmo` over three's TransformControls enough, or does EDGEbuilder bring its own, with the same keys as in game? Then the package only hands over `scene`, `camera` and the pointer events.
2. **Removals:** is `setHidden` with `ghost` the right shape for scene format 3's `worldEdits`, or does a removal name something other than `<sector>#<entry>`?
3. **Coarser levels:** should `loadSectors` take the sectors already chosen, with `sectorsOver` as a helper, or should one call take a point and a distance?

## Order

1. **EDGEbuilder's E0** (done 2026-11-19, above) runs with REDcode's mesh viewer code as it is, from a script, and answers the timing question. The package's shape follows from its answer: how many meshes a downtown sector has, how long their exports take, and whether instancing and culling are enough.
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
