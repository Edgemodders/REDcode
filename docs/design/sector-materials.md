---
title: Materials in the sector view
---

# Materials in the sector view

Draft 0.1, 2026-11-21, agreed with the owner the same day: M1 first, then M2, then M3 with (a) before (b). The owner asked for it on 2026-11-21: pick a thing in the sector view, see its real material there, open it in EDGEmat to choose or make another game material, see that on the mesh, add it to the project, and see it in the game.

## What there is today

- **The sector view** ([Sector view](sector-view.html)) draws plain exports, with no materials, in flat colours. **By mesh** colours by a hash of the mesh's game path. Only the hue changes, at a low saturation, so neighbouring hues look alike. **By material** does not work: a plain export names every part's material `Default`, so everything gets one colour (six cached exports checked on 2026-11-21).
- **The drawing package** already has `texturedGlb` (a mesh with WolvenKit's materials and textures, for one picked object) and `replaceMesh` (one placement drawn with another GLB). REDcode's sector mode uses neither yet.
- **EDGEmat** has Open in EDGEmat (`edgemat.openMesh`: the mesh on its Desk at a look), `renderMaterials` (baked maps by material name, which REDcode's mesh view draws), game materials on a mesh's parts (EDGEmat #12), New Material, and Add to Project from the Desk.
- **ArchiveXL's node mutations** can change a node's resource and appearance. EDGEbuilder's D0 read this in ArchiveXL's source (`WorldStreaming/Config.hpp`), but nobody has tried it in the game. REDbridge's `sector.build` writes node deletions only.

## The steps

| Step | What | Where | Waits on |
|---|---|---|---|
| **M1 Picked materials** | Colours by the real material names; the picked thing drawn with its materials in place; a picked panel | REDcode and the drawing package | Nothing |
| **M2 Live from EDGEmat** | The sector view redraws the picked thing while EDGEmat changes its material on the Desk | REDcode, with an EDGEmat `request` | EDGEmat saying which Desk item a change is for, and rendering it |
| **M3a Every copy** | EDGEmat's Add to Project writes the mesh at its game path, then Pack and Play. Every place in the game that uses the mesh changes | EDGEmat and REDcode, as today | M2 for the preview; works without it |
| **M3b This node only** | The changed mesh under a new path, and the bake points the node at it through an ArchiveXL mutation | REDbridge (`sector.build` mutations), EDGEbuilder (a world edit and its bake), REDcode (the button) | A probe in the game first, then requests to REDbridge and EDGEbuilder |

## M1 as planned

- **Material names.** The host half gets `meshMaterials(bridge, cacheDir, mesh, from?)`: each appearance of a mesh with the material it names per submesh (`chunkMaterials`), read once through `cr2w.open` and kept beside the mesh's export as a `.materials.json`. It is lazy: only when **By material** is on, or a thing is picked, so a plain load costs nothing more.
- **Appearances per placement.** `sector.nodes` gives each node's `appearance`. Placements carry it (`appearance`, optional), since one mesh can be placed in different looks.
- **By material** colours each part of each placement by the material that the placement's appearance names for that submesh (`setMaterials(mesh, byAppearance)` on the page half). The material is found by the appearance's name, or the first appearance for `default` or none, as the game does (unverified for `default` when a mesh has no appearance of that name). Colours are spread over hue, saturation and lightness, in both modes.
- **Materials** (a toolbar switch): the picked thing is drawn with its materials, through `texturedGlb` and `replaceMesh`, and with EDGEmat's rendered maps by material name when EDGEmat is installed. Without EDGEmat it is WolvenKit's own export of the materials, which leaves multilayered materials mostly bare. Picking another thing puts the last one back (`restoreMesh`, new) and draws the new one. A project's own mesh is exported from the project's file.
- **The picked panel**, under the view: the mesh, its appearance and its materials, with **Open in EDGEmat** (at the node's appearance), **Open Mesh**, **Add Mesh to Project** and **Show in Tree**. Add Mesh to Project says that the mesh then changes everywhere it is used.
- **EDGEmat's changes** to the picked mesh redraw it (`onDidChangeMaterials`), as the mesh view does. Changes on the Desk's copy are M2's.

The page half's additions (`setMaterials`, `restoreMesh`, `replaceMesh`'s optional `prepare`, `Placement.appearance`) and the host half's `meshMaterials` are additive. EDGEbuilder hears of them in [EDGEbuilder #8](https://github.com/Edgemodders/EDGEbuilder/issues/8) before the package is published.

## M1 as built

Built 2026-11-21; hand test passed by the owner the same day, all 10 steps, with one fix: Add to Project now asks before it writes over a file already in the project ([testing](../testing.html#sector-materials-m1)). Two things changed from the plan, after a check in Chrome over the real bridge:

- **No WolvenKit textures.** WolvenKit's export "with materials" writes a `.Material.json` beside the .glb and puts no textures in the .glb. So `texturedGlb` adds nothing to look at. The picked thing is drawn from its plain export, already in the cache (`cachedGlb`), with rendered maps put on its parts by material name. `texturedGlb` stays as the fallback for a mesh not in the cache.
- **REDcode renders by itself.** Without EDGEmat installed, REDcode renders the materials with `renderMaterials` from `@edgemodders/edgemat-core`, which it already bundles for item search. This follows the owner's rule that REDcode views every file by itself. With EDGEmat installed, EDGEmat's API renders them, since it sees setups being edited on its Desk. The note under the view says which one did.

Found: the world's multilayered materials come out a flat grey from EDGEmat's renderer (edgemat-core 0.3.2). These are `multilayered.mt` with an `.mlsetup` and an `..._masksset.mlmask`, such as the corporate plaza buildings and the sidewalks. Plain textured materials render properly; the cardboard trash got its 1.6 MB colour map. Better world materials are EDGEmat's, asked with M2's needs in [EDGEmat #17](https://github.com/Edgemodders/EDGEmat/issues/17) (2026-11-21). The package's additions are noted on [EDGEbuilder #8](https://github.com/Edgemodders/EDGEbuilder/issues/8#issuecomment-7065042770).

**EDGEmat #17 done (2026-11-22):** its hand test "The Desk's edits in the 3D view" passed (the owner, all 8 steps, with REDcode main). A Desk entry's change names that entry's copy of its mesh in `onDidChangeMaterials`; `edgemat.openMesh` answers `{ desk, mesh }`; `renderMaterials` without the library draws layered materials. It ships in EDGEmat 0.3.4, held for the joint K4d release. That unblocks M2, which starts after the REDcode release now in test.

Timings, with the game running:
- **Material names:** 105 meshes in about 2 s the first time, then from the cache.
- **A building's rendering:** 1.5 to 2.4 s.

## Not in this design

- Changing one copy of an instanced mesh: a mutation changes the whole node, every copy with it.
- Materials on entities, decals and terrain.
- Editing a sector's own nodes in 3D: the tree, and EDGEbuilder.
