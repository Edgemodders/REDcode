---
title: Animations (C5)
---

# Animations: a game animation played on its rig

Draft 0.5, 2026-11-19, agreed with the owner up to A2 (decisions below); the A3 plan is a draft for the owner. A1 is built and passed its hand test on 2026-11-06 ([testing](../testing.html#animations-a1)). A2 is built on REDbridge 0.13.0 and passed its hand test on 2026-11-15, with three fixes to the framing ([testing](../testing.html#animations-a2)). Asked for in [REDcode issue #21](https://github.com/Edgemodders/REDcode/issues/21) by EDGEquest, whose Animation picker needs a preview without a 3D viewer of its own. It is the "Animations" step that [View (C5)](view.html) deferred. Not urgent: EDGEquest needs it when its happenings around V (Q8 H4) are planned.

## What the game gives

Checked on game 2.5 with REDbridge 0.11.0, on the issue's prologue Trauma Team files (scratchpad `probe21.mjs`, 2026-11-05):

| File | Rig it names | Animations | `project.export` |
|---|---|---|---|
| `synced__q001_00c__trauma_av.anims` | `av_zetatech_atlus_skeleton.rig` | 6: the AV lands, idles, arrives and leaves | GLB, 0.25 s, 23 bones, 6 clips |
| `q001_00c_trauma_arrives_male_average.anims` | `man_base.rig` | 13: the crew's idles, looks, shifts and points | GLB, 0.3 s, 71 bones, 13 clips |

- **An `.anims` exports today.** WolvenKit reads the rig the file names and writes a GLB with the skeleton as a skin and each animation as a glTF clip, named as in the file. three.js plays such clips with its `AnimationMixer`, so the skeleton plays with no bridge change.
- **Root motion is off** in WolvenKit's default export: the AV lands without moving through the air. Turning it on is an export setting.
- **A body has no bones in the default mesh export.** A man's body mesh exported as now gives a GLB with no skin, so the clips have nothing to move. WolvenKit's "with rig" mesh export writes the skin; REDbridge does not expose it yet. With it, the 71 bone names the crew's clips drive (`Root`, `Hips`, `Spine`, ...) are expected to match a man's body. That is unverified until the option exists.

## Steps

| Step | What | Bridge |
|---|---|---|
| **A1 The animation view** | An `.anims` opens in a new CR2W editor mode, **Animations**, with **Tree** one click away as for meshes. On the left, the file's animations with name, length and frame rate, and the rig. On the right, the skeleton in the 3D view, as bones and joints, playing the one picked: play and pause, a scrub bar with the time, loop, speed. `REDcodeApi.openAnimation(path, animationName?)` opens it at one animation, for EDGEquest's Preview button. | None: `project.export` as it is, through the export cache |
| **A2 A body on the rig** | The skeleton wears a body: the meshes of a character or vehicle entity the caller passes (`openAnimation(path, name, { entity })`), or the base body of the rig's kind when none is passed (`man_base` and `woman_base` to the base male and female bodies; a vehicle rig to nothing, so the skeleton stays). A **Root motion** switch moves the whole rig through the scene, as the AV's landing needs. | A REDbridge export option for meshes with their rig, and one for root motion in animations: a minor release |
| **A3 Synced sets** | The files of a synced set (`synced__q001_00c__trauma_*.anims`: the AV, the pack and the crew) play together on one clock, each on its own rig, placed where they are relative to each other. | Not "probably none" after all: `syncTrajectory` keys and a root motion fix, a minor release (see the A3 plan) |

Each step is a commit or two with a hand test on the owner's machine, as before.

## A1 as built

- **The export stays on the host.** The mesh view sends the page its whole GLB; an `.anims` export is too large for that (on game 2.5, GLBs of 38 MB and 122 MB for ordinary V animation files, and 233 MB with 1,246 clips and a 52 s export for the largest, `generic_average_male_transitions.anims`). `src/animsGlb.ts` (no VS Code imports) reads the GLB's JSON once and gives the page the skeleton (about 11 KB, no keys) and the list, then cuts out each animation as its own small GLB when it is picked (135 KB to 151 KB in that file). Each accessor's own bytes are copied, since accessors may share a buffer view.
- **Frames come from the file.** The export thins its tracks (87 keys for a clip of 106 frames), so `numFrames` is read from the document, and the frame rate follows from it and the length. All 1,246 clips of the largest file and all 13 of the crew file are 30 fps.
- **The page:** `webview/animViewer.ts`, in the same bundle as the mesh viewer. Bones are three.js's `SkeletonHelper`, joints are dots, and clips are bound to the bones by name, which A2's bodies will rely on. The eight clips picked last are kept. Time advances by at most a tenth of a second per frame, so coming back to a hidden tab does not skip ahead.
- **In the editor:** a mode, `anims`, beside `mesh`, in `media/cr2w/editor.js`.
- **The cache:** exports go to the mesh cache in REDcode's global storage, and stay there, so a very large file costs its GLB's size on disk until the cache is cleared.

Found on the way: a vehicle rig hangs every bone off one root, so the AV is a star of lines, not a shape. Bones alone say little for vehicles, and root motion is off, so the AV's landing does not move through the air until A2. Some long lines on a human rig look like helper bones from the floor: unverified.

## A2 as built

Built 2026-11-15 on REDbridge 0.13.0, which took A2's part of [REDbridge #14](https://github.com/Edgemodders/REDbridge/issues/14) (`project.export` options `rig`/`rigs`, `appearance` and `rootMotion`). Checked on game 2.5 before the hand test (scratchpad `a2probe.mjs`, `a2mod.mjs`, and `a2harness.mjs` in Chrome with the real bundle):

| Body | Export | Bones the clips drive that it has |
|---|---|---|
| Base male body, `t0_000_ma_base__full.mesh` on `man_base.rig` and `man_base_deformations.rig` | 1.2 s the first time, 2.1 MB, 187 joints | 71 of 71 (the crew's clips) |
| Base female body, `t0_000_wa_base__full.mesh` on `woman_base.rig` and `woman_base_deformations.rig` | 0.2 s, 2.2 MB, 187 joints | 71 of 71 (two `woman_average` NPC clips) |
| The Trauma Team paramedic, `corpo__ep1_traumateam_ma.ent` in `corpo__traumateam_ma_paramedic__lvl1_01` | 1.6 s, 13.8 MB, 22 meshes on 512 joints (its far proxy left out) | 71 of 71 |

- **`src/animsGlb.ts`:** `baseBodyFor(rig)` gives the base body for exactly `man_base.rig` or `woman_base.rig`; any other rig (a vehicle's, a prop's, a cyberware rig) keeps its bones alone. The body needs its deformations rig for its muscle and twist bones, and the base rig for the six bones the clips drive that the deformations rig lacks (eyes, weapons, `Trajectory`, `reference_joint`). `baseBodyGlb` and `entityBodyGlb` export without materials. The bridge's account of an entity (meshes, joints, what was left out) is kept beside its GLB, since a cached export does not ask again.
- **The export cache** takes a variant (`src/exportCache.ts`), so a mesh on its rig, an entity in each appearance and an `.anims` with root motion do not overwrite the plain export of the same file.
- **The page** (`webview/animViewer.ts`) plays the clips on the body's own bones, bound by name, with one plain grey material. **Body** and **Bones** switch each on and off; with a body, the bones are off at first. **Root motion** asks for each clip again from the root motion export, at the same moment. With it on, the view follows the body's `Hips` (a vehicle rig's `Root`; `Root` stays on the ground while a body drops from the AV) and the grid spans at least 50 m, so the travel shows against it. **Frame** leaves out `reference_joint`, `Root` and `Trajectory`, which can sit metres from the body (`reference_joint` 3.9 m mid-way through the soldiers' landing, `Root` 3.1 m below the hips at its start, while the body is up in the AV; `reference_joint` is probably a synced set's shared point, for A3, unverified). In place it fits the whole animation, sampled at nine moments, so a drop or a climb stays in view; with Root motion on it fits the pose of the moment. The first animation shown fits the view. Its setting is kept in global state (`cr2w.animsRootMotion`), off at first.
- **`REDcodeApi.openAnimation(path, name, { entity, appearance })`**: an entity is kept per `.anims` while REDcode runs. A tab already open is built again on the new entity. An entity that cannot be exported falls back to the base body, and the status line says why.

Found on the way:
- The base bodies have no heads: a character's head is a mesh of its own. An entity has its head.
- With root motion, the soldiers' landing carries the rig about 14 m. The drop from the AV is in the body's own bones (Root's height stays 0), so it shows with root motion on or off.

## A3: what the game gives

Probed on 2026-11-19 on game 2.5 with REDbridge 0.15.0, on the prologue's Trauma Team set in `base\animations\quest\main_quests\prologue\q001\q001_00c_rescuing_girl\anim\synced\` (scratchpad `a3origin.mjs`, `a3frame.mjs`, `a3sync.mjs` with a probe method in a scratch bridge build that was not committed, and `a3check.mjs`):

- **How a set is named.** A synced clip is named `synced__<moment>__<role>`, and the members of one moment are the clips with the same `<moment>` across the `.anims` files of one folder. `synced__q001_00c_trauma_arrives_soldiers__land_v1` has three: `__av` in `synced__q001_00c__trauma_av.anims`, and `__soldier_01` and `__soldier_02`, both in `synced__q001_00c__male_average.anims`. So one file can hold several members. The role is only a label, and the game misspells some (`__slodier_01`).
- **Each member starts at its own origin.** Every member's Root is at 0 at the start, so playing them on top of each other is wrong: in the landing, the soldiers start 14 m from where they end, up in the AV.
- **Where the others are: `syncTrajectory`.** Each clip's buffer holds one extra joint per partner, past its rig's own joints: `syncTrajectory`, `syncTrajectory1` and on. Each one is a partner's Root as seen from this member's own Root at the same moment. Checked: soldier_02 placed from soldier_01's track stays at one place through both clips of the landing and the take-off, to the centimetre. The AV placed the same way stays at one place through the 15 s take-off. In the landing, the AV holds one place only from about 2 s on, since its touch-down is partly in its own `base` bone. The tracks are not named by partner; a pair's tracks are each other's inverse, which is how they are matched. A human rig's `reference_joint` is also a fixed point of the set, but vehicle and prop rigs have none.
- **REDbridge does not give them today.** WolvenKit decodes every joint of a buffer, but its glTF export writes only the rig's joints, so the extras are dropped.
- **A WolvenKit bug in root motion.** For `animSplineCompressedMotionExtraction` (the AV's), WolvenKit writes each key at its fraction of the clip (0 to 1) rather than in seconds (`AnimRootMotion.cs` keys by `TimePercent` and never uses the duration it reads). So with **Root motion** on, the AV's whole flight plays in the first second of a 7.9 s clip; this is in A2 already. `animPlaneUncompressedMotionExtraction` (the humans') is right.

## A3 plan

Draft, for the owner (2026-11-19):

| Part | What | Where |
|---|---|---|
| REDbridge | `anims.sync(path, clips?)`: for each clip, its extra joints' names and their position and rotation keys, in seconds and glTF axes. And `project.export` with `rootMotion` puts spline root motion keys in seconds. A minor release | A `request` issue on REDbridge, as A2's part was [#14](https://github.com/Edgemodders/REDbridge/issues/14) |
| REDcode | A synced clip shows its set under the list: each member's role and file, from the folder's `anims.info`. **Play the Set** adds each member to the scene on its own rig, placed from the sync tracks, on one clock with one scrub bar. Each member gets the body A2 gives its rig (the base body for `man_base` and `woman_base`, bones for vehicles and props), and a check box to hide it. Root motion is on while the set plays. The opened clip's member stays at the origin. `openAnimation(path, name, { set: true, entities: { <role>: { entity, appearance } } })` gives members bodies of their own | `src/animsGlb.ts`, `webview/animViewer.ts` |

A member that shares no track with the opened clip is placed through another member that does. One hand test: the Trauma Team landing and take-off, the AV and the two soldiers together, and the medics' set with the trauma pack.

## Decisions

Agreed with the owner, 2026-11-06:

1. **The order:** A1 first (bones only, no bridge release), then A2, which needs the bridge release, then A3.
2. **A body when the caller passes none:** the base body of the rig's kind for human rigs. A vehicle rig keeps the skeleton.
3. **A3 Synced sets** is in this design.
4. **The view** is a mode of the CR2W editor, as the mesh viewer is: the same three.js bundle and toolbar.

Agreed with the owner, 2026-11-15, for A2: bodies come without textures for now, and root motion is off at first.

## Not in this design

- Editing animations, or making new ones: WolvenKit and Blender do that.
- Playing an animation in the running game: that is REDnode's, and the owner's Trauma Team experiments already do it there.
- Facial animation and lip sync (`.anims` under `base\localization`): different data, not asked for.
