---
title: Selecting many things in the sector view
---

# Selecting many things in the sector view

Draft 0.1, 2026-11-21, for the owner. Nothing is built. A modder asked for volume selection: a 3D box, like a rubber band, that selects the things inside it. The sector view picks one thing at a time today, so this adds multi-select with it: a list of what is selected, where a click flies the camera to a thing and hover buttons give each thing's actions.

## What there is today

- **One pick:** a left click picks one thing, and the line under the view names it, with **Show in Tree**, **Open Mesh**, **Open in EDGEmat** and **Add Mesh to Project**. **Materials** draws it with its own materials.
- **The package** already highlights many ids at once (`highlight(ids)`), hides or ghosts many (`setHidden`), and has `toCanvas` and `rayFrom` for a box. Each placement and marker has a world box, so "what is inside" is a test of boxes, quick for the 9,000 copies of a busy sector.
- **EDGEbuilder's in-game viewport** selects with a click, Ctrl+click to add, and Shift+drag for a box on the screen. The sector view's camera follows its mapping (the [camera](sector-view.html#part-3-the-camera-2026-11-21)), so selection should too.

## The design

### Ways to select

| Input | Selects |
|---|---|
| Click | That thing alone, as now |
| Ctrl+click | Adds that thing, or takes it out if it is in |
| Shift+drag | **A box on the screen:** everything whose middle falls inside the rectangle, at any depth. With Ctrl as well, added to what is selected |
| **Volume** (a toolbar switch) | **A box in the world:** drag on the ground for its base, move the mouse up or down for its height, and click. The box stays in the view, see-through, with a handle on each face to resize it and its inside to drag it. What is inside updates as it changes |
| Esc | Nothing (clears the selection and the volume) |
| Ctrl+A | Everything shown |

Shift with a left drag pans today; it would box instead, as in EDGEbuilder. Panning stays on the middle button and on Ctrl+left drag (a Ctrl+click without a drag still adds).

**What counts as inside**, for both boxes: a thing whose middle is in the box. A **Touching** switch beside Volume takes everything whose box touches it as well, for long things like roads and walls whose middle is far off. Hidden things are never selected; ghosted ones are.

**The volume's base** lies on the height of what is under the cursor where the drag starts, or the camera's target height over empty space. The base is level with the world (no turning, unverified whether a turned box is wanted).

### The selected list

A side panel on the right of the view, resizable like the animation view's list, shown once anything is selected.

- **The header:** how many are selected, and buttons for all of them:
  - **Frame All** (glides to them);
  - **Isolate** (ghosts everything else; again to undo);
  - **Add Meshes to Project** (each mesh once, one question naming how many);
  - **Copy** (their ids and mesh paths as text, for an issue or an assistant);
  - **Clear**.
- **A row per thing:** its kind (a mesh, or a marker's kind), the mesh's file name or the marker's class, and its entry (`#848.7`). Rows are sorted by mesh, so copies of one mesh sit together.
- **A click on a row** makes it the current one and glides the camera to it. The line under the view, Show in Tree, the Properties view and **Materials** all follow the current one. Ctrl+click on a row takes it out of the selection.
- **Hover buttons on a row**, as in REDcode's other lists: Fly To, Show in Tree, Open Mesh, Open in EDGEmat, Add Mesh to Project, and Remove. A marker's row has Fly To, Show in Tree and Remove.
- **Many rows:** the list draws the first 500, with "and n more". The header's buttons still act on all of them.

The current thing is drawn in the accent colour, and the rest of the selection in a paler accent, so the current one stands out.

### The package and the API

Additive, so EDGEbuilder's sector view can use the same selection:

- **The page half:**
  - `idsInRect(x0, y0, x1, y1, { touching? })` and `idsInBox(box, { touching? })` answer what a box takes.
  - `highlight(ids, current?)` draws the current one apart.
  - `createVolume()` gives the volume tool: drawing, handles, `onChange(box)`. It goes over the scene like a gizmo, as the design keeps gizmos the caller's, so it is a helper the caller turns on, not part of the view.
- **`REDcodeApi.openSector`'s `select`** takes a list of entries as well as one, for EDGEbuilder's `select` with many.

## Decisions for the owner

| # | Question | Recommendation |
|---|---|---|
| 1 | Shift+drag boxes, as in EDGEbuilder, and pan moves to the middle button and Ctrl+drag | **Yes**: one mapping for the EDGE tools |
| 2 | What counts as inside: the thing's middle, with a Touching switch | **Yes**: predictable for small things, and Touching covers roads and walls |
| 3 | The volume: drag the base, then the height, then a click; face handles to resize | **Yes**, level with the world. A turned volume later if modders ask |
| 4 | The list on the right, current thing drawn apart, first 500 rows drawn | **Yes** |

## Order

Built in one piece once agreed, with a hand test in [testing](../testing.html). EDGEbuilder hears of the package's additions on [EDGEbuilder #8](https://github.com/Edgemodders/EDGEbuilder/issues/8).

## Not in this design

- Moving, turning or deleting the selected things: the sector view is read-only. That is EDGEbuilder's world editing.
- Materials on many things at once: **Materials** draws the current one only, since each rendering takes one or two seconds.
- Selecting across sectors the view has not loaded.
