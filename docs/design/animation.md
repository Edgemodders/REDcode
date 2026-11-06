---
title: Animations (C5)
---

# Animations: a game animation played on its rig

Draft 0.3, 2026-11-06, agreed with the owner (decisions below). A1 is built, its hand test pending ([testing](../testing.html#animations-a1)). Asked for in [REDcode issue #21](https://github.com/Edgemodders/REDcode/issues/21) by EDGEquest, whose Animation picker needs a preview without a 3D viewer of its own. It is the "Animations" step that [View (C5)](view.html) deferred. Not urgent: EDGEquest needs it when its happenings around V (Q8 H4) are planned.

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
| **A3 Synced sets** | The files of a synced set (`synced__q001_00c__trauma_*.anims`: the AV, the pack and the crew) play together on one clock, each on its own rig, at the reference point they share. | Probably none |

Each step is a commit or two with a hand test on the owner's machine, as before.

## A1 as built

- **The export stays on the host.** The mesh view sends the page its whole GLB; an `.anims` export is too large for that (on game 2.5, GLBs of 38 MB and 122 MB for ordinary V animation files, and 233 MB with 1,246 clips and a 52 s export for the largest, `generic_average_male_transitions.anims`). `src/animsGlb.ts` (no VS Code imports) reads the GLB's JSON once and gives the page the skeleton (about 11 KB, no keys) and the list, then cuts out each animation as its own small GLB when it is picked (135 KB to 151 KB in that file). Each accessor's own bytes are copied, since accessors may share a buffer view.
- **Frames come from the file.** The export thins its tracks (87 keys for a clip of 106 frames), so `numFrames` is read from the document, and the frame rate follows from it and the length. All 1,246 clips of the largest file and all 13 of the crew file are 30 fps.
- **The page:** `webview/animViewer.ts`, in the same bundle as the mesh viewer. Bones are three.js's `SkeletonHelper`, joints are dots, and clips are bound to the bones by name, which A2's bodies will rely on. The eight clips picked last are kept. Time advances by at most a tenth of a second per frame, so coming back to a hidden tab does not skip ahead.
- **In the editor:** a mode, `anims`, beside `mesh`, in `media/cr2w/editor.js`.
- **The cache:** exports go to the mesh cache in REDcode's global storage, and stay there, so a very large file costs its GLB's size on disk until the cache is cleared.

Found on the way: a vehicle rig hangs every bone off one root, so the AV is a star of lines, not a shape. Bones alone say little for vehicles, and root motion is off, so the AV's landing does not move through the air until A2. Some long lines on a human rig look like helper bones from the floor: unverified.

## Decisions

Agreed with the owner, 2026-11-06:

1. **The order:** A1 first (bones only, no bridge release), then A2, which needs the bridge release, then A3.
2. **A body when the caller passes none:** the base body of the rig's kind for human rigs. A vehicle rig keeps the skeleton.
3. **A3 Synced sets** is in this design.
4. **The view** is a mode of the CR2W editor, as the mesh viewer is: the same three.js bundle and toolbar.

## Not in this design

- Editing animations, or making new ones: WolvenKit and Blender do that.
- Playing an animation in the running game: that is REDnode's, and the owner's Trauma Team experiments already do it there.
- Facial animation and lip sync (`.anims` under `base\localization`): different data, not asked for.
