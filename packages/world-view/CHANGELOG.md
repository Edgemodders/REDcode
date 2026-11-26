# Changelog

What changed in each release of `@edgemodders/world-view`. Changes are grouped as **New**, **Changed**, **Fixed** and **Other**.

## Unreleased

**Changed**

- `findOverlaps` matches thing to thing (REDcode's `docs/design/sector-overlaps.md`, O1): the footprint is the sector's own detail things, each by its own box, in a grid; helpers and proxies take part only with `helpers` or `proxies`; boxes that are not numbers, inside out, over 2 km or worked out at the origin are left out. New options `margin`, `area`, `matchLimit` and `onQuery`. Each layer carries its first `matches` (its thing and the thing it meets, or null for the area) and a `leftOut` count. The per-sector cache is a new version (`<hash>-v2.json`, with each thing's entry, class and file); the old files are not read.

**New**

- `roleOf(class)`: detail, proxy, helper or unknown, by node class.
- The page half's `volume.set(box)` puts a box there as if drawn, with its handles.

## 0.1.0 (2026-11-25)

The first release: what draws the sector view of REDcode 0.10.17.

**New**

- **Overlaps:** `findOverlaps` in the host half lists the sectors whose things reach into one, grouped and nearest first, keeping each sector's boxes in a cache folder; `setSectorLook` in the page half draws a sector's things see-through in a colour, still pickable.
- **The host half:** `createSectorLoader`, `sectorsOver`, `sectorsNear`, `texturedGlb`, `entityGlb`, and the axis helpers. It reads a sector through REDbridge's `sector.nodes`, exports each unique mesh once into a cache folder, and hands over every placement in glTF axes with its streaming distance.
- **The page half:** `createWorldView`.
  - **Drawing:** one instanced draw per GLB primitive, markers for things with no mesh, and the caller's own objects in the same scene.
  - **Picking and showing:** picking by each placement's box, highlight, hide and ghost.
  - **View:** culling by streaming distance as a switch, a flying camera, and colour by mesh or by material.
- **Materials** (REDcode's `docs/design/sector-materials.md`):
  - The host half's `meshMaterials` reads each appearance's material per submesh once, and keeps it beside the export. `appearanceOf` finds one by name, and `cachedGlb` gives the plain export already in the cache.
  - Placements carry their node's `appearance`.
  - The page half's `setMaterials` colours each copy by its appearance's materials when colouring by material. `replaceMesh` takes a `prepare` step for the loaded scene, and `restoreMesh` draws the plain mesh again.
  - `texturedGlb` exports a mod's own mesh from its file.
- **The camera** (REDcode's `docs/design/sector-view.md`, part 3): the right button looks round and flies with W A S D Q E, the middle pans, the wheel zooms towards the cursor and sets the fly speed while the right button is held; Shift is faster and Ctrl slower. `flyTo` frames with a glide, from above or the opening side if asked; `hold` moves the camera while an on-screen button is held; `flySpeed` and `onFlySpeed`. A right click no longer picks. Any button on the view gives it the keyboard, so its keys work after a plain click.
- **Selection** (REDcode's `docs/design/sector-selection.md`): `highlight(ids, current)` draws the current one apart; `idsInRect`, `idsInBox` and `idsShown` answer what a box takes, by middle or touching; Shift+drag draws a box on the screen for `onBoxSelect` (it no longer pans); `volume` is a box in the world to select with, drawn with the mouse, with handles to resize and move it.
- **The stage:** an environment for reflections, tone mapping, and a light with brightness and a camera or fixed mode (REDcode issue #31, https://github.com/Edgemodders/REDcode/issues/31).
