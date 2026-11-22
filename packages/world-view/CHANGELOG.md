# Changelog

What changed in each release of `@edgemodders/world-view`. Changes are grouped as **New**, **Changed**, **Fixed** and **Other**.

## Unreleased

**New**

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
