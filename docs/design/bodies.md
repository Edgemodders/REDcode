---
title: Bodies
---

# Bodies

Draft 0.1 for the owner, 2026-11-26. Not agreed yet; the decisions at the end are open.

The owner asked on 2026-11-26: is a clip locked to one body? The game has several body builds, modders make new male and female bodies, and EDGEfab is to make new body types. REDcode's animation view should list the bodies a clip fits and draw the one picked. The same day, a modder's eye found the shoulders and chest of the body REDcode draws creasing with the arms crossed, which comes from the body's deformation graph (below). This page covers both.

## What there is today

- The view draws a body only for exactly `man_base.rig` (the base male body) or `woman_base.rig` (the base female body), or a game entity a caller passes (`REDcodeApi.openAnimation(path, name, { entity })`). Any other rig shows its bones.
- The body is the game's own mesh, exported once through REDbridge with its rig, without materials.
- Nothing runs the body's deformation graph, so its muscle and twist helpers stay at rest (the creases).

## What the game has (probe, 2026-11-26)

`tools/probes/bodies/rigs.mjs` reads every character rig's bone names through REDbridge.

| Rigs | Bones | Of the 71 the clips drive |
|---|---|---|
| `man_base`, `man_big`, `man_fat`, `man_massive`, `man_child`, `woman_base`, `woman_small` | 71 | All 71 |
| V's `player_man_skeleton`, `player_woman_skeleton` | 152 | All 71 |
| `man_small`, `man_teen`, `woman_big`, `woman_fat`, `woman_teen` (249), `woman_child` (243) | 243 to 249 | 68: no `reference_joint` or eyes |
| Each build's `*_deformations.rig` | 181 | 65 (the body's bones), plus 110 muscle and twist helpers |

- Each build has a folder under `base\characters\base_entities` with its rig, a deformations rig and its deformation graph (`*_deformations.animgraph`), and some have more: breast rigs and graphs on `woman_base` and `man_massive`, shirt-collar rigs.
- The bodies are under `base\characters\common\base_bodies\<build>\` (for example `man_average\t0_000_ma_base__full.mesh`, `man_big\t0_000_mb_base__full.mesh`, `man_fat\t0_000_mf_base__full.mesh`, `man_child\t0_000_mc_base__full.mesh`, `woman_average\t0_000_wa_base__full.mesh`, `woman_small\t0_000_ws_base__full.mesh`), and V's under `player_base_bodies` (`t0_000_pma_base__full.mesh`, `t0_000_pwa_base__full.mesh`). Folders named `_old_to_delete` are left out.

**So by name, a person's clip fits every main build and V.** What differs is proportion: the game's clips key a translation on every bone (Animation Probe D), which carries the clip's own bone lengths. Played as it is on another build, a `man_base` clip would stretch `man_big`'s bones to `man_base`'s. On a body whose rig is not the clip's, the view takes the clip's rotations, and translations only for the root and hips, scaled by the hips' height. That is how the clip would look on that build; whether the game does the same when a clip is shared is **unverified**.

Modded bodies: not probed (none installed here). The common case is a mesh at a game body's path in a mod's archive, replacing it, on the same rig. REDbridge's `sources: mods` (#23) finds those.

## B1: the Bodies tab

A **Bodies** tab beside Edit, Animations and Bones:

- **Lists the bodies the clip fits:** the game's base body of every main build, V's two, the project's own bodies, a mod's replacement of any of them, and EDGEfab's, each with its build, where it comes from (game, mod, project, EDGEfab) and how many of the clip's bones its rig has ("71 of 71"). A body short of bones shows how many and which, and stays pickable.
- **The clip's own build first, picked:** today's body.
- **A pick swaps the body** in the view, on its own rig, the clip retargeted as above when the rig is another build's. The camera, the time and the timeline stay.
- Kept per clip while REDcode runs, as an entity passed through `openAnimation` is today.
- `REDcodeApi.openAnimation(path, name, { body })` names one, for EDGEfab and EDGEdir.

## B2: the deformation graph

Each build's body runs its deformation graph after the clip, so its muscle and twist helpers move as in the game.

- **Probe so far** (`docs/testing.md`, "Body deformation graph (probe)"): `webview/deformGraph.ts` runs `man_base_deformations.animgraph`'s 417 nodes. In the export's own pose it puts the helpers within 1.7 cm of where the export has them (median 1.7 mm). Left: four right-hand knuckle helpers half a turn off, and creases at the armpits with the arms crossed.
- **Next:** REDnode's `world_bones` (REDnode #62, in 0.76.0) reads a live NPC's helpers in the game; REDcode compares them with its own run and fixes the conventions.
- **Then, for every body:** the host finds the body's deformations rig and graph (from its build, or the entity's `deformations` component), reads the graph through REDbridge once, and keeps the cut-down graph in the cache (the graph's JSON is 100 MB; the part the view needs is 150 KB). A **Muscles** switch turns it off to compare.
- Breast rigs and graphs (`woman_base_breasts`, `man_massive_breasts`) are the same kind of graph, on more helpers: after the main one works. Jiggle with a delay (22 of 90 bulge nodes have one) is EDGEfab's later work, likely through REDbridge.

## B3: EDGEfab's bodies

EDGEfab is to make new body types. A body REDcode can draw and animate is:

- its mesh or meshes, skinned to a rig whose bones the clips name: one of the builds' rigs or V's; a new skeleton would need its clips converted, a different job;
- optionally its own deformations rig and graph, else its build's;
- in the project at its game path (with its skin GLB at the same path under `source/raw`, as #37's props), or in the Library.

To agree with EDGEfab on a request when its body work is designed: which rigs it keeps, where it writes, and how a body says its build.

## Order

| Stage | Delivers |
|---|---|
| **B0** | The probes above (done 2026-11-26) |
| **B2a** | The deformation graph compared with the game through REDnode #62, its conventions fixed, on `man_base` |
| **B1** | The Bodies tab: the game's builds and V's, the clip retargeted on another build |
| **B2b** | The graph for every build's body, cached; Muscles |
| **B1b** | Mods' and the project's bodies (REDbridge #23's sources), `openAnimation`'s `body` |
| **B3** | EDGEfab's bodies, when EDGEfab's body work is agreed |

## Decisions for the owner

1. **Retargeting on another build:** rotations, with only the root's and hips' translation scaled by the hips' height. *Recommended.* The other choice is the clip as it is, which stretches the body to the clip's build.
2. **What the tab lists:** the main builds and V's, leaving out the 243 to 249 bone rigs (`man_small`, `woman_fat` and the rest), which look unused and lack the eyes. *Recommended*; they can be added if a modder needs them.
3. **The deformation graph on by default** once it matches the game (B2a), with Muscles to turn it off. *Recommended.*
4. **Order:** B2a first, since it fixes what the modder saw, then the tab. *Recommended.*
