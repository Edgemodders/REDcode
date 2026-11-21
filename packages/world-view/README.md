# @edgemodders/world-view

Cyberpunk 2077's streaming sectors in three.js, for the EDGE tools. REDcode's sector view draws with it, and EDGEbuilder's Sector Tools and world view will too. The API was agreed between REDcode and EDGEbuilder in [EDGEbuilder #8](https://github.com/Edgemodders/EDGEbuilder/issues/8). The design is at https://edgemodders.github.io/REDcode/design/sector-view.html.

It needs [REDbridge](https://github.com/Edgemodders/REDbridge) 0.12.0 or later, for `sector.find` and `sector.nodes`. Not published to npm yet.

## The host half (Node)

```js
import { createSectorLoader, sectorsOver, sectorsNear, texturedGlb, entityGlb } from "@edgemodders/world-view/host";

const loader = createSectorLoader(bridge, {   // REDcode's BridgeClient or REDnode's kernel.bridge()
  cacheDir,                                   // meshes are exported once and kept here
  onMesh: ({ sector, mesh, glb, placements }) => {},   // one unique mesh of a sector, and every place it is drawn
  onMarkers: (sector, markers) => {},         // things with no mesh: entities, decals, lights, collision...
  onUnload: (sector) => {},                   // every id under "<sector>#" goes
  onProgress: ({ phase, done, total, etaMs, current }) => {}, // phase "reading": sectors read; "exporting": meshes
});
await loader.set(["base\\worlds\\03_night_city\\_compiled\\default\\exterior_-22_7_0_0.streamingsector"]);
```

- **`set(list)`:** loads the sectors new to the list and unloads those that left it. A newer `set()` cancels the exports an older one still has queued.
- **Ids:** `<sector path>#<entry>`, where entry is the node data index (what ArchiveXL and REDnode's node registry use). One copy of an instanced mesh is `#<entry>.<copy>`.
- **Placements:** column-major matrices in glTF axes (Y up), with each node's streaming distance as `range`.
- **Other helpers:** `toGltf`, `toGame`, `boxToGltf` and `transformToGltf` convert between the game's axes (Z up) and glTF's.

## The page half (browser)

```js
import { createWorldView } from "@edgemodders/world-view/page";

const view = createWorldView(canvas, { colourBy: "mesh", culling: "none" });
await view.addMesh(mesh, glbBytes, placements);   // one InstancedMesh per GLB primitive
view.addMarkers(markers);
view.onPick((picked) => console.log(picked?.id));
view.frame();
```

- **Drawing:** `addMesh`, `addMarkers`, `unloadSector`, `addObject` and `removeObject` for the caller's own things, and `replaceMesh` to draw one placement with a textured or entity GLB.
- **Showing:** `setHidden(ids, "hidden" | "ghost" | "shown")` and `highlight(ids)`.
- **Picking:** `pick(x, y)`, `onPick` and `onPointer`, a ray against each placement's box.
- **For a gizmo:** `toCanvas(point)` and `rayFrom(x, y)`.
- **The camera:** `camera`, the three.js camera, with `pose` and `setPose`. `frame(ids?)` fits the view. WASD, Q and E fly, Shift is faster.
- **Light:** `lighting`, the shared stage below.

`three` is a peer dependency: the page's own bundler brings it.

## The stage

`@edgemodders/world-view/stage` gives every 3D view the same light (REDcode issue #31):
- an environment for reflections (three's `RoomEnvironment` through `PMREMGenerator`);
- ACES filmic tone mapping;
- a light the modder controls: `brightness`, and `mode`, either `"camera"` (over the shoulder) or `"fixed"` (stays while the model turns).

MIT. Built on WolvenKit's work through REDbridge.
