---
title: Sector view
---

# Sector view: a streaming sector in 3D

Draft 0.3, 2026-11-20, agreed with the owner (decisions below); the package's API agreed with EDGEbuilder on 2026-11-20. The owner asked on 2026-11-19 whether EDGEbuilder could open a 3D sector view of REDcode's instead of hosting one of its own. Nothing is built. It comes after Animations A3 and New File, unless the owner moves it. EDGEbuilder's E0 has answered its questions (below).

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

Agreed with EDGEbuilder in [#8](https://github.com/Edgemodders/EDGEbuilder/issues/8) on 2026-11-20; its answers were agreed with the owner. TypeScript, ES modules. `three` is a peer dependency, so each extension bundles its own copy.

**Names.** Every drawn thing has a string id. A sector's item is `<sector path>#<entry>`, with `entry` the node data index: what ArchiveXL's deletions and REDnode's registry use, and what a scene format 3 removal names. `#<entry>.<copy>` is one copy of an instanced mesh. EDGEbuilder does not use it yet (ArchiveXL's sub-element deletions come later), but the form leaves room for it. Any other id belongs to the caller (EDGEbuilder's scene objects), and the page treats both alike for picking, highlighting and hiding.

**Host half** (`@edgemodders/world-view/host`, Node, no VS Code imports):

```ts
interface Bridge { request<T>(method: string, params?: object): Promise<T> }   // REDcode's BridgeClient fits

const loader = createSectorLoader(bridge, {
  cacheDir: string,
  kinds?: string[],
  onMesh(m: { mesh: string; glb: string; placements: { id: string; matrix: number[] }[] }): void,
  onMarkers(ms: { id: string; kind: string; class: string; resource?: string; matrix: number[]; box?: Box }[]): void,
  onUnload(sector: string): void,                    // every id under "<sector>#" leaves the page
  onProgress(p: { done: number; total: number; etaMs?: number }): void,
})
loader.set(sectors: { path: string; archive?: string; root?: string }[]): Promise<{ skipped: { id: string; why: string }[] }>
    // loads the sectors new to the list and unloads those that left it; a newer set() cancels the exports an older one still has queued
loader.dispose()

sectorsOver(bridge, path): Promise<string[]>                                       // a level-0 sector and the coarser ones over it
sectorsNear(bridge, point: number[], distance: number, { levels? }): Promise<string[]>   // for a view that follows its camera
texturedGlb(bridge, mesh, cacheDir): Promise<string>                               // the mesh with its materials, for one picked object
entityGlb(bridge, ent, appearance, cacheDir): Promise<string>
```

`sectorsOver` and `sectorsNear` only return lists, through `sector.find`; loading by point and distance is `loader.set(await sectorsNear(...))`. Meshes come as they are exported, cached ones first, so the page fills in while the rest export. A mesh shared by two sectors is exported once, and its placements are sent per sector. `glb` is a file path; each host turns it into a webview URI or bytes.

**Page half** (`@edgemodders/world-view/page`):

```ts
const view = createWorldView(canvas, { colourBy: "mesh" | "material", culling: "streaming" | "none" })
view.addMesh(mesh, glb: ArrayBuffer, placements)        // one InstancedMesh per GLB primitive
view.addMarkers(markers)
view.unloadSector(path)                                 // what the host's onUnload asks for
view.addObject(id, object3d) / view.removeObject(id)    // the caller's own things, in the same scene
view.replaceMesh(id, glb)                               // a textured or entity GLB for one id
view.setHidden(ids, "hidden" | "ghost" | "shown")       // a removal: its entry and its proxies' entries together
view.highlight(ids)
view.pick(x, y) -> { id, point } | null / view.onPick(cb)
view.onPointer(cb)                                      // down, move and up on the canvas, with the id under it
view.toCanvas(worldPoint) -> [x, y] / view.rayFrom(x, y) -> { origin, direction }   // for a gizmo and box selection
view.camera.pose / view.camera.setPose(pose) / view.frame(ids)
view.flyTo(ids?, "top" | "start"?)                     // frame, gliding there
view.hold(move, on, { fast?, slow? }) / view.flySpeed / view.onFlySpeed(cb)   // on-screen camera buttons
view.scene, view.camera, view.renderer
view.dispose()
```

- **The gizmo is the caller's.** EDGEbuilder brings its own, with the in-game viewport's keys (G, R, S, axis locks, typed numbers), over `scene`, `camera`, `onPointer` and the two projection helpers. The package has no gizmo, since REDcode's sector mode is read-only.
- **A removal hides its proxies too.** A scene format 3 removal lists an entity's proxy meshes beside it (`proxies`, each `<sector>#<entry>`), so it is `setHidden([entry, ...proxies], "ghost")`. EDGEbuilder's D1a test showed why: after a save loads, a hidden entity does not come in, and the game shows its proxy in its place.

## As built, part 1

Built 2026-11-20 on REDbridge 0.12.0's `sector.find` and `sector.nodes`; hand test pending ([testing](../testing.html#sector-view)).

- **The package**, `packages/world-view`: `src/host.ts`, `src/page.ts` and `src/stage.ts`, with its own `package.json` (`@edgemodders/world-view` 0.1.0, unpublished), README and CHANGELOG. It builds to `dist/` (ES modules and CommonJS for the host half, ES modules with `three` as a peer for the page half, and type declarations). REDcode bundles it from its source, as `redcode-mcp` bundles the bridge client. The API is as agreed above, with these settled while building:
  - **`sector.nodes`** answers one item per node data entry (`index`, `node`, `kind`, `resource`, `transform` with `position`, the `rotation` quaternion x, y, z, w and `scale`, `instances`, `streaming`, `bounds`). The host turns each placement into a glTF-axes matrix, the conjugate of the game transform by (x, y, z) to (x, z, −y). A unit check holds it against three.js's own matrices.
  - **Meshes** export with `meshMaterials: false` and `meshLodFilter: true`: the most detailed level of detail, no materials. They go into a folder per game version (`mesh\world\<game stamp>` in REDcode's cache).
  - **`markers`** is an option of the page half (on at first), beside `colourBy` and `culling`.
  - **`camera`** is the three.js camera itself, with `pose` and `setPose` added, so a gizmo can use it directly.
- **REDcode's sector mode** (`webview/sectorViewer.ts`, `sectorPayload` and `sectorLoad` in `src/cr2wEditor.ts`). A `worldStreamingSector` opens on **3D**. The host makes a loader per page and streams meshes, markers and progress to it.
  - **A project's copy** is read from the project's loose files (`root`), and the coarser sectors come from the game.
  - **Picking:** a pick posts the entry's tree path (`nodeData.Data.<entry>`), so the Properties view follows, and **Show in Tree** goes there.
  - **Defaults:** culling is off at first, since a file viewer shows the whole file. **Streamed** turns it on. Markers show for the opened sector only: the coarser sectors over a busy one hold more than 20,000.
- **`REDcodeApi.openSector(path, { select })`.**

Checked before the hand test:
- **Unit checks:** 66 pass, three of them for the host half: the matrices against three.js, items to batches and markers, and the loader against a stand-in bridge (one export per mesh, the cached first, unloading).
- **REDcode's page in Chrome** over the real bridge (scratchpad `svharness.mjs`), on E0's busiest sector `exterior_-22_7_0_0`:
  - **The load:** 105 meshes drawn 8,986 times and 202 markers, nothing skipped; read in 3.3 s the first time with the meshes cached by E0, 0.5 s again.
  - **The picture:** buildings stand upright on their ground.
  - **A pick:** a click on a building picked `#780.8`, and its path `nodeData.Data.780` was sent on.
  - **Coarser levels:** loaded their markers at once, while their meshes exported.

### Part 2: #31's light everywhere

Built the same day. The mesh view (`webview/meshViewer.ts`) and the animation view (`webview/animViewer.ts`) light through the package's stage, as the sector view does, in place of their own hemisphere and camera light. **Light** (0.5×, 1×, 1.5× and 2.5×) and **Fixed light** are one shared control (`lightControls` in `webview/viewerKit.ts`). The setting is kept in the workspace's state under `redcode.light`, so per window as #31 asks, and passed in by both the CR2W editor's host and the glTF viewer's host.

A directional light needs only a direction, so the stage keeps one. In camera mode it comes from over the viewer's shoulder, and Fixed light freezes the direction it had. That works the same for a mesh at the origin and for a sector 1,400 m from it.

Checked in Chrome: the mesh view with a game mesh exported with its materials showed the control and readable shading. The first tone and environment values washed the sector's colours almost to white, so they were turned down: exposure 0.8, environment 0.45. Not judged yet: EDGEmat's rendered metals and roughness, which #31 is for. EDGEmat sends those next. Glass and glow, #31's later rows, wait for EDGEmat's new fields.

### Part 3: the camera (2026-11-21)

The owner asked after the M1 hand test: buttons for zooming, panning, strafing and speed, as EDGEbuilder's free camera works, and a double-click that flies close to a thing. Built the same day.

| Input | Does |
|---|---|
| Left drag | Orbit, as before |
| Right drag | Look round where the camera stands; **W A S D** fly and **Q E** go down and up while it is held (they work without it too, once the view has the keys) |
| Middle drag, or Shift or Ctrl with the left | Pan |
| Wheel | Closer, towards the cursor (`zoomToCursor`); with the right button held, the fly speed |
| Shift, Ctrl | Faster (×4), slower (×0.25), with the keys and the buttons |
| **F** | Frame the picked thing, gliding there |
| Double-click | Pick the thing and glide close to it |

These are the package's own (EDGEbuilder's in-game viewport uses the same mapping), so EDGEbuilder's sector view gets them too. A right click no longer picks, since the right button is the look.

REDcode's camera row under the toolbar: **Zoom** + and −, **Move** (Forward, Back, strafe left and right), **Pan** up and down, **Height** up and down, **Orbit** both ways, each moving while its button is held (`view.hold`); **Speed** − and + (`view.flySpeed`, shown as ×1.0 and following the wheel); **Top** (from above, on the picked thing or the sector) and **Reset** (the view it opened with), both gliding (`view.flyTo`); and **?** for a line naming the mouse and keys. **Frame** glides too.

Checked in Chrome over the real bridge: every held move goes the right way (forward and back along the view, strafing level, height along the world's up, zoom changing the distance only, orbit keeping the target), Top looks straight down, Reset comes back to the opening side, a double-click on node 848.7 picked it and glided to 2.5 m from it, a right click kept the pick, the wheel with the right button held raised the speed to ×1.3. Chrome drew 2 frames a second in that window, so how the moves feel is the hand test's.

## Order

1. **EDGEbuilder's E0** (done 2026-11-19, above) runs with REDcode's mesh viewer code as it is, from a script, and answers the timing question. The package's shape follows from its answer: how many meshes a downtown sector has, how long their exports take, and whether instancing and culling are enough.
2. The package and REDcode's sector mode, on the API above (agreed 2026-11-20). The API is the contract between the two, so a change to it is agreed in [EDGEbuilder #8](https://github.com/Edgemodders/EDGEbuilder/issues/8) or a later issue first.
3. EDGEbuilder's E2 on the package.
4. Right after REDcode's part: REDcode's half of [Sector Tools](sector-tools.html) (the owner, 2026-11-20). The app is an EDGEbuilder app pack ([EDGEbuilder #9](https://github.com/Edgemodders/EDGEbuilder/issues/9)) that draws with the same package in the game; REDcode links its sector mode to it.

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
