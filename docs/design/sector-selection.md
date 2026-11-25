---
title: Selecting many things in the sector view
---

# Selecting many things in the sector view

Draft 0.2, 2026-11-21, agreed with the owner the same day (all four recommendations below), and built the same day; hand test pending. A modder asked for volume selection: a 3D box, like a rubber band, that selects the things inside it. The sector view picks one thing at a time today, so this adds multi-select with it: a list of what is selected, where a click flies the camera to a thing and hover buttons give each thing's actions.

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

## As built (2026-11-21)

Built the same day. What differs from the design above:

- **The list is always there.** Shown only once something was selected, it narrowed the view, and the scene moved under the cursor: the next click at the same place landed on nothing and cleared the selection. Found in Chrome. Empty, it says how to select.
- **The volume moves by a round handle** above its top, not by dragging its inside, so a click inside the volume still picks the thing there.
- **The volume is the view's own** (`view.volume`, `packages/world-view/src/volume.ts`), not a helper the caller makes: it needs the camera's controls, which the view keeps to itself. It takes the pointer only while it is drawn or a handle is dragged.
- **Ctrl+A** selects everything shown and does not also strafe left (A).

Where it is:

| Part | Where |
|---|---|
| The page half | `highlight(ids, current)`, `idsInRect`, `idsInBox`, `idsShown`, `onBoxSelect` and Shift+drag in `src/page.ts`; the volume in `src/volume.ts` |
| REDcode | The selection, the list and its actions, Volume and Touching in `webview/sectorViewer.ts`; `addMeshes` and `copy` in `sectorAction` (`src/cr2wEditor.ts`); Add to Project takes several files and asks once (`src/extension.ts`); `openSector`'s `select` takes a list |

Checked in Chrome over the real bridge, on `exterior_-22_7_0_0`:
- **Picks:** a click, the same click again (it stays), Ctrl+click to add two and to take one out.
- **The screen box:** Shift+drag over the middle took 4,376 things, or 4,404 with Touching. Ctrl+A took all 9,188 (8,986 copies and 202 markers), and Esc cleared them.
- **The list:** a row click glided the camera 80 m to it. A row's buttons: Fly To, Tree, Mesh, EDGEmat, Add, ×. × took the row out. Isolate ghosted all but the 2 selected, and pressed again it showed all 8,986.
- **The volume:**
  - Drawn: 21 × 20 × 27 m, taking 2,919 things from 369 node entries, many of them instanced 96 times.
  - Its +x face handle widened it by 11 m, and the round handle moved it 9.4 m, level.
  - Touching took 8 more. Volume off removed the box and kept the selection; Esc while armed turned it off.

Chrome drew 2 frames a second there, so how it feels is the hand test's.

## Not in this design

- Moving, turning or deleting the selected things: the sector view is read-only. That is EDGEbuilder's world editing.
- Materials on many things at once: **Materials** draws the current one only, since each rendering takes one or two seconds.
- Selecting across sectors the view has not loaded.

## Next: every copy of a mesh (the owner, 2026-11-22)

Asked in the Add to Project retest: a modder with sector meshes in the project cannot tell where they are in the sector view. Agreed: both places, built after the release now in test (with M2 and Lip Sync L1).

- **Project view:** a hover button on a `.mesh`, **Select in Sector View**, shown while a sector view is open. It selects every copy of that mesh in the open sector view and frames them.
- **The selected list:** an **All Copies** hover button on each row, selecting every copy of that row's mesh.
- **Either asks first** when it would replace a selection of more than one thing. With no copy of the mesh in the sector, it says so.

## The Properties tab (a modder's request, 2026-11-24)

Asked by the owner for a modder: a third tab beside Selections and Overlaps with only the properties every selected thing shares, so a mass edit is made in one place, with a question that says how many edits it makes. Built the same day:

- **Two parts:** the node data entries (where each thing streams: `streamingDistance`, `streamingPriority`, `nodeFlags`, `dataGroup`…) and the nodes they name (what is drawn and how: `meshAppearance`, `castShadows`, `isVisibleInGame`…). Several entries can name one node, such as an instanced mesh's copies, and a node is changed once. With nodes of several kinds, only what every kind has shows.
- **A property shows** when every one has it with the same type and it is a plain value (a number, text, a name, a yes or no, an enum); its value, or **mixed**. Left out on purpose: `nodeIdx`, `instanceIndex`, `sourcePrefabHash` and node references, since one value for all of them would break what ties the sector together.
- **An edit** (a value typed and Enter, a box ticked, an enum picked) becomes one change per entry or node that differs, through the sector scripts' question and Apply: "Set streamingPriority on 4 node data entries would change 4 values…", **Apply** as one edit that one Undo takes back, **Show List**; on the game's copy, **Add to Project and Apply**, as a script's change does. Only this sector's own things: a layer's are changed in their sector.
- **Built in:** `src/sectorProps.ts` (no VS Code imports: `sharedProps`, `propChanges`), `sectorProps` and `sectorPropsSet` in `src/cr2wEditor.ts`, `applyChanges` in `src/sectorScriptsUi.ts`, the tab in `webview/sectorViewer.ts`. Checked by a unit check and in Chrome over REDbridge 0.19.0 on `exterior_-22_7_0_0` (four soda cans: 4 entries naming 4 `worldInstancedDestructibleMeshNode`s; streamingPriority 1 → 5 gives 4 changes, castShadows on the nodes 4; with an ambient area added, only what both kinds share).
