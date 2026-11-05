---
title: Animations (C5)
---

# Animations: a game animation played on its rig

Draft 0.1, 2026-11-05, **for the owner to agree**. Asked for in [REDcode issue #21](https://github.com/Edgemodders/REDcode/issues/21) by EDGEquest, whose Animation picker needs a preview without a 3D viewer of its own. It is the "Animations" step that [View (C5)](view.html) deferred. Not urgent: EDGEquest needs it when its happenings around V (Q8 H4) are planned.

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
| **A3 Synced sets** (nice to have) | The files of a synced set (`synced__q001_00c__trauma_*.anims`: the AV, the pack and the crew) play together on one clock, each on its own rig, at the reference point they share. | Probably none |

Each step is a commit or two with a hand test on the owner's machine, as before.

## Choices to agree

1. **The order and the cut:** A1 alone first (bones only, no bridge release), then A2, which needs the bridge release. Or hold A1 until A2 is done, so the first version EDGEquest sees already shows bodies.
2. **A body when the caller passes none:** the base body for human rigs (my suggestion), or the skeleton only until an entity is given.
3. **A3:** in this design, or left for later.
4. **The view:** a mode of the CR2W editor, as the mesh viewer is (my suggestion: same three.js bundle, same toolbar), rather than a separate panel.

## Not in this design

- Editing animations, or making new ones: WolvenKit and Blender do that.
- Playing an animation in the running game: that is REDnode's, and the owner's Trauma Team experiments already do it there.
- Facial animation and lip sync (`.anims` under `base\localization`): different data, not asked for.
