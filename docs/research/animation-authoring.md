---
title: Animation authoring (research)
---

# Animation authoring: new and changed animations for V and NPCs

Research for the owner, 2026-11-20. Not a design and nothing agreed. Read from the REDcode, REDbridge, REDnode, EDGEfab and EDGEdir repos, WolvenKit's source (the copy in REDbridge's `external/WolvenKit`), ArchiveXL's source, the game's files (read through REDbridge on game 2.5) and the web. Anything not checked is marked **unverified**.

## 1. Summary

**What is possible today.** The game's animations are clips inside `.anims` files, played on a skeleton (a rig) by an animation graph or a workspot. Modders already change them: they export a clip to glTF, change it in Blender, and import it back over a clip of the same name. REDbridge 0.15.0 and later can already do the import (`project.import` of a `<name>.anims.glb`, through WolvenKit's `ImportAnims`), and REDcode already exports and plays clips on the right body. REDnode can already play a written workspot on a spawned NPC, and can swap a changed archive into the running game. So most pieces of the round trip exist. The one big unknown is the last step: **nobody has yet seen a clip imported by REDbridge play in the game.**

**What is hard.** Getting a clip into the game is easy. Getting the game to *choose* it is the hard part. The choice belongs to the animation graph (`.animgraph`) and to workspots. A new run for V is a replacement: the graph already asks for its run clips by name, so a clip with the same name wins. A new behaviour, such as V looking at a phone while she stands, needs something that plays it: a workspot (AMM's way), or a change to the graph. A phone held *while walking* needs an upper-body layer in V's locomotion graph, which is a big job with high risk. Facial animation, cloth, hair and footstep events are separate systems, and AI services have licence limits.

**Recommended path.** Build in small steps, each ending in the game:

1. **Probe A (no code):** export a Trauma Team medic's idle, raise one arm in Blender, import it with REDbridge, pack, swap it in with REDnode, and play it on a spawned medic with the workspot REDnode already writes. This answers the biggest unknown cheaply.
2. **REDcode: Edit in Blender for an animation**, with **Try in Game** through REDnode, from the animation view. This is REDcode's basic edit, by the house rule.
3. **EDGEfab: the animation tab**: timing, mirror, root motion, then retargeting and AI motion (Uthana first), as EDGEfab's plan and the EDGEdir split already say. REDcode gets an **Open in EDGEfab** button.
4. **V's own animations**: replacement clips first (a new run), then a workspot on V for still behaviours with a prop (the phone), through REDnode #47.

**AI motion in short.** Uthana is the best fit found: an API, text to motion and video to motion, FBX/GLB/BVH out, retargeting onto an uploaded skeleton that keeps its own bone names, and clear commercial terms for paying users. Going through an AI video first adds cost and errors; real phone footage of a person, or text to motion directly, is the better first try. Open models (HY-Motion) exist but carry territory or SMPL licence limits.

## 2. Background: how the game's animations work

### A short glossary

| Term | Plain meaning |
|---|---|
| **Rig** (`.rig`) | The skeleton: a list of named bones (joints), each with a parent and a rest position. Clips move the bones; meshes follow the bones they are skinned to |
| **Clip** (an animation) | One movement, such as one walk cycle or one idle. It stores, for each bone, rotations (and some positions and scales) over time |
| **Animation set** (`.anims`, type `animAnimSet`) | A file holding many clips for one rig, each with a name, length and frame count |
| **Keyframe** | A bone's pose at one moment. The game samples at 30 frames a second |
| **Root motion** | The movement of the whole character through the world, stored apart from the body's pose (a "motion extraction" in the file). A walk clip with root motion moves the character forward |
| **Additive clip** | A clip that adds to whatever pose is playing, rather than replacing it (for example a breath or a flinch) |
| **Partial or layered clip** | A clip that only drives some bones (the arms, the upper body), mixed over another (the legs walking). The mixing is done by the graph with a bone mask |
| **Animation graph** (`.animgraph`) | The logic that picks and mixes clips at runtime from the game's state (speed, stance, weapon, cover). Think of it as a flowchart of states and blends |
| **Anim feature, variable** | Values the game's code sends into a graph (speed, aim, stance) to steer it |
| **Workspot** (`.workspot`) | A small script of clips for a person: enter, idle loop, reactions, exit, and props to hold. Used by NPCs sitting, leaning, smoking or on the phone, and by scenes |
| **Retargeting** | Moving a clip made for one skeleton onto another, with different bone names, proportions or rest pose |
| **FPP / TPP** | First person (the player's normal view) and third person (photo mode, mirrors, third-person mods) |
| **glTF / GLB** | An open 3D file format. WolvenKit and REDbridge write `.anims` as GLB, one glTF animation per clip |

### Clips, sets and rigs

- An `.anims` file names one rig and holds its clips. The game has 14,028 `.anims` files and about 146,800 clips (REDbridge `anims.info` over the whole game, 2.5; EDGEdir's index).
- **NPC rigs.** Average men and women play on `man_base.rig` and `woman_base.rig`. Their clips drive 71 bones (`Root`, `Hips`, `Spine` to `Spine3`, `Neck`, `Head`, arms, legs and more). The body mesh is skinned to a larger **deformations rig** (`man_base_deformations.rig`, 187 joints on the base body): the extra bones are muscle and twist bones, which the deformations graph moves from the 71 (A2, checked 2026-11-15). Other body kinds have their own rigs (`man_big.rig` for Jackie, child, fat, massive).
- **V's rig.** In normal play V is `player_ma_fpp.ent` (or `player_wa_fpp.ent`). Its animated component `root` uses `player_man_skeleton.rig`, the graph `player_base.animgraph`, and 118 animation sets: `player_locomotion.anims`, `player_exploration.anims`, weapons, cyberware, consumables and more (read on 2.5). V's clips carry about 152 joints (REDbridge #20). The body uses `player_man_fpp_deformations.rig` and its own deformations graph. `player_ma_tpp.ent` is a separate entity for photo mode and the paperdoll, with UI and vehicle sets only.
- **FPP and TPP.** V has one full body in first person too: the camera sits at the head and the head mesh is hidden. First-person clips are made to look right from that camera (arms in view, camera bob from `head_bobbing.anims`). A clip that looks good from outside can look wrong from the eyes, and the other way round. Third-person mods play V's body from outside and expose clips that were never meant to be seen (**unverified** in detail).

### Compressed and SIMD buffers

A clip's keys are stored in one of two packed forms. **Compressed** buffers keep keys per bone, thinned where nothing changes. **SIMD** buffers keep every bone at every frame, packed for fast decoding (cinematic and some player clips). WolvenKit reads both and writes both. REDbridge 0.17.0 fixed WolvenKit's SIMD reading for clips with sync joints (WolvenKit #3306). Imports are written compressed unless the clip's extras ask for SIMD.

### Root motion

Root motion lives in a separate block of the clip (`animLinearCompressedMotionExtraction`, `animSplineCompressedMotionExtraction`, `animPlaneUncompressedMotionExtraction`). WolvenKit can write only the linear kind, so REDbridge turns spline root motion into linear on import (#19, WolvenKit #3305). **Whether the game plays such a clip as before is unverified.** Workspots do not apply root motion: REDnode measured 0.00 m of travel from a step-off clip.

### Additive clips, events, float tracks

- Each clip has a type, `Normal` or additive (`anims.info` reports it).
- Clips carry **events**: footsteps and foot plants, sounds, effects, item effects, voice, facial animation starts, workspot items. WolvenKit's export writes them into the clip's glTF extras, and its import writes them back, or copies the old clip's events when the glTF has none.
- Clips can carry **float tracks** (`TrackKeys`, extra curves such as facial and lip sync weights). They travel in the extras too.

### Facial animation

Faces are a separate system: a face rig, a `.facialsetup` of poses, and lip sync clips under `base\localization` with about 414 float tracks a clip (EDGEfab's lip sync work, FL1). EDGEfab has moved a live NPC's jaw through a modded face graph (LS1, passed in the game 2026-11-20). Body clips and face clips are made separately.

### How a clip is chosen at runtime

1. The entity's animated component lists its **animation sets**, each with a priority (128 or 200 on V).
2. Its **graph** reads the game's state (anim features such as `stanceState`, `upperBodyState`, `highLevelState`, read on V's entity) and decides which clips play, mixed and layered.
3. The graph asks for clips **by name**. The engine finds the name in the entity's sets; a higher priority wins when two sets have the same name (**unverified** as a rule; ArchiveXL's priority field relies on something like it).
4. Some actions come from databases instead (`action_animation.actionanimdb`, `crowd_bumps.csv`, read on V's entity).

So a clip with a new name plays only if something asks for that name: a graph, a workspot, or a scene.

### Workspots, scenes and props

- A workspot is a tree of sequences, each holding clips by name, with entries, exits and reactions, and an animation setup (`finalAnimsets`) that lists its sets. REDnode found the engine looks that setup up by a hash: a written workspot needs a new hash (FNV-1a 64 of its set paths) or its new sets are ignored (REDnode #46, round 4).
- Scenes (`.scene`) drive quest clips and workspots through their own graph nodes.
- **Props in hand.** The game has many phone workspots for NPCs, for example `base\workspots\common\ground\generic__stand_ground_cellphone__check_phone__01.workspot` (719 files match "phone" on 2.5). A workspot spawns its own props and attaches them to a hand slot (REDnode saw a quest workspot put a rifle in a medic's hands, `ItemPolicy_SpawnItemOnIdleChange`). The base rig has `WeaponRight` and `WeaponLeft` bones for held items. V's phone calls in the base game have no phone in her hand (it is an implant), so a phone in V's hand is a new behaviour.
- **AMM** (Appearance Menu Mod) plays poses on V and NPCs through a workspot carried by an entity it spawns or attaches (its collab format: a `.lua`, an `.ent` with an `amm_workspot_collab` component, a `.workspot` and an `.anims`).

## 3. Today's modding routes

| Route | How | Gives V a new run | Gives V a phone in hand | Gives an NPC a new clip | Limits |
|---|---|---|---|---|---|
| **Replace a clip in a game `.anims`** | Export, edit in Blender, import over the same name, ship the whole file | Yes: replace the run clips the graph asks for (`player_locomotion.anims`) | Only by hijacking an existing idle or emote | Yes, every NPC that uses that clip | A whole-file replacement: one mod per file wins; changes every user of the clip (MaxTac too, in EDGEfab's Trauma Team case) |
| **ArchiveXL `animations:`** | An `.xl` entry with `entity` (one or a list), `set`, and optional `priority`, `vars`, `component`; ArchiveXL adds the set to the entity's animated component as it starts (read in ArchiveXL's source, `Extensions/Animation`) | Possibly, as a small set of override clips at a higher priority (**unverified** that a higher priority overrides a same-named clip) | Adds clips, but something must still ask for them | Adds sets to any entity file | Documented only for photo mode poses on the wiki; whether it works on `player_ma_fpp.ent` is **unverified** |
| **Photo mode poses** | ArchiveXL `animations:` on the photo mode entities, plus TweakXL pose records | No | A still pose with a prop (`acceptedWeaponConfig`, player only) | Photo mode NPCs | Poses in photo mode only; animated poses not supported there (wiki, March 2025) |
| **AMM poses** | AMM's collab files: `.lua`, `.ent`, `.workspot`, `.anims` | No | Yes, as a pose or loop, with V standing still | Yes | Needs AMM; still, no walking; done through AMM's UI |
| **Workspots** | A `.workspot` naming the clips, played by a quest, a device or a script | No | Yes for an NPC (the game's phone workspots); V needs a way in (REDnode #47) | Yes. REDnode's `world.writeWorkspot` writes one with any clips and plays it on a spawned person (passed in game, 2026-11-16) | No root motion; a brief T pose at a file's first play; quest clips need the hash fix |
| **Animgraph edits** | Change or add graph nodes (a JSON edit through WolvenKit or REDbridge) | Yes, in principle | Yes in principle: an upper-body layer with a mask | Yes | Whole-file replacement of a huge file; no graph editor; EDGEfab LS1 proved a small graph edit works (a face graph) |
| **Scripts (redscript, CET, Codeware, REDnode)** | Start workspots, send anim features (`ApplyFeature`), push events | Steers what exists | Starts a workspot | Starts a workspot | No base-game call plays a clip by name (REDnode #39); `SetInputFloat` did nothing in LS1, `ApplyFeature` did |
| **Blender with the Cyberpunk add-on** | WolvenKit Blender IO Suite 2.5.0: import `.anims` GLBs, animation tools, export for Cyberpunk; its main branch also has a mocap import (BVH, Reallusion `.rlmotion`) retargeted onto game rigs (read in its source, 2026-11-17) | The tool for the edit | The tool for the edit | The tool for the edit | Manual; the mocap import's use is **unverified** |
| **WolvenKit** | Export `.anims` to GLB, import GLB as "Anims" over an existing file | | | | Desktop app, by hand |

**What this means for the owner's examples:**

- **A new run for V:** replace the run clips in V's locomotion set (by name), first as a whole-file replacement, later as an ArchiveXL override set if the probe shows priority works. V's FPP and TPP views both see it.
- **V looking at a phone in her hand:** standing still, it is a workspot with a phone prop on V, the AMM way (REDnode #47 asks how a package can do it). While walking, it needs a graph change (an upper-body layer), which is the hardest case.
- **Trauma Team medics doing something new:** a written workspot with the new clip on a spawned medic, through REDnode. This is the cheapest first test.

## 4. Editing from existing animations

| Edit | Plain meaning | In Blender | In code (no Blender) |
|---|---|---|---|
| **Retime** | Faster, slower, trim the start or end | Scale keys, set the frame range | Easy: scale and cut the key times in the glTF |
| **Loop** | Make the end meet the start | Match the last pose to the first | Medium: blend the last frames into the first |
| **Mirror** | Left becomes right | Pose library flip, by bone names `Left*`/`Right*` | Medium: swap left and right tracks and flip one axis; the game's bone axes must be checked |
| **Offset root motion** | Move or scale how far the character travels (EDGEfab's Trauma Team drop) | Edit the `Root` curves | Easy once the root's keys are separate (REDbridge exports them on `Root`) |
| **Layer one bone** | Turn the head, lift an arm over the whole clip | An NLA layer or extra keys | Easy: add a rotation to one track |
| **Arms only** | Take the arms of clip A over the legs of clip B | Copy the arm bones' curves | Medium: copy tracks by a bone list; the spine joint between them needs care |
| **Blend two clips** | Cross-fade from one to the other | NLA strips | Medium; in EDGEdir's split this is a transition, EDGEdir's |
| **New pose by hand** | Keyframes bone by bone | The normal way | Not practical |

Points that matter:

- **Rotate, don't move.** The community's guides say to rotate bones only: moving a bone in a clip stretches the joint (the wiki's pose guide).
- **NPC arms on V:** the wiki notes NPC arm keys often look wrong on V's rig, so arm keys may need leaving out when reusing an NPC clip for V.
- **Twitching:** the community sets each new clip's `numTracks` to 0 or 2 after import (the wiki's pose and retargeting guides). Why it helps is **unverified**.
- **Extras must survive.** WolvenKit's import refuses a glTF clip without its `wkit.cp2077.gltf.anims` extras ("has no extra data"). A clip edited in Blender's plain glTF exporter may lose them (**unverified** for Blender 5.3). REDcode can copy them back by clip name from its own export before the import, since `animsGlb.ts` already reads and writes GLB JSON.
- **What WolvenKit's import takes** (read in `AnimationTools.cs`): channels only on bones the rig has (any other node is an error), linear or step keys (not cubic), no morph weights, one clip per name. Duration sets the frame count at 30 fps. Float tracks, events and frame clamping come from the extras; additional tracks, transforms and tags are copied from the old clip of the same name, so a brand-new clip has none.

## 5. AI motion

### The services and models

Checked on their own pages on 2026-11-20 where a URL is given; prices change often.

| Service | Input | Output | Skeleton | Hands | Root motion | API | Price | Terms for mods |
|---|---|---|---|---|---|---|---|---|
| **Uthana** video to motion 3.0 | MP4/MOV/AVI, 2 to 60 s, one person, whole body | FBX, GLB, BVH at 24, 30, 60 fps | Its own, or **your uploaded biped, keeping its bone names** | Yes, with a hand refinement step | Not stated (**unverified**) | Yes, GraphQL | $0.06 per second of output (3.0) | Paid users own outputs and may distribute them in games; free users must credit Uthana. Outputs may not be used to train competing models; Uthana may train on inputs unless agreed otherwise |
| **Uthana** text to motion 3.0 | A prompt | FBX, GLB, BVH | As above | Not stated | Not numeric; Locomotion model for travel | Yes | $0.10 a second (Mini $0.075) | As above |
| **DeepMotion** Animate 3D, SayMotion | Video; text | FBX, BVH, GLB (third-party listings) | Own, or uploaded FBX/GLB | Optional, extra credits (**unverified**) | **Unverified** | SayMotion API limited to partners | Plans from about $9 to $83 a month (**unverified**) | Free tier non-commercial (third-party listing, **unverified**) |
| **Rokoko Vision** | Video, one or two cameras | FBX free; BVH and 60 fps paid | Rokoko's | **Unverified** | **Unverified** | No public API found | Free quota small; paid from about $20 a month | **Unverified** |
| **Move.ai** Move One | Phone video, one person | FBX, USD | Own | Pro only (multi-camera) | **Unverified** | Yes, usage priced | Plans from about $18 to $30 a month (**unverified**) | **Unverified** |
| **Meshy** text to motion | Prompt, 2 to 10 s | FBX (prime) or BVH (swift) | Not stated | Not stated | Not stated | Yes | 10 or 3 credits a task, paid plan | **Unverified** |
| **Radical** | | | | | | | | Shut down: Autodesk bought its technology, portal closing (data until 6 July 2026) |
| **Meshcapade** MoCapade | Video | GLB, FBX, SMPL | SMPL | | | B2B | | Reported closed in 2026 (**unverified**); SMPL commercial licence €2,000 a year and up |
| **Plask**, **Kinetix** | | | | | | | | No 2026 status found (**unverified**) |
| **HY-Motion 1.0** (Tencent, open) | Prompt under 60 words | SMPL-H motion; FBX through its scripts | SMPL-H, 22 body joints | No fingers (22 joints) | Yes, in SMPL's root | Run locally, a large GPU | Free | Tencent's community licence **does not apply in the EU, the UK or South Korea**; outputs may not be used there. FlowHMR (2026-10) adds video to motion on top |
| **Older open models** (MDM, MotionGPT, MoMask, GVHMR for video) | Text or video | SMPL | SMPL, no fingers | No | Yes | Local | Free | Research licences; the SMPL body model is non-commercial without a paid licence. Whether a mod clip made from SMPL joints is bound by it is **unverified** |
| **Mixamo** (Adobe, not AI) | A library to pick from | FBX | Mixamo's | Yes | Optional ("in place") | No | Free with an Adobe ID | Royalty-free in projects; raw files not to be redistributed (**unverified** for mods) |

**What this means.** Uthana fits best: it has an API an EDGE tool can drive, both text and video, and it can retarget onto a skeleton the modder uploads while keeping that skeleton's bone names. If a stand-in character with the game's bone names is uploaded, motions could come back on `Hips`, `Spine` and so on, ready for the import (**unverified** until tried). Two points to decide first: uploading anything made from the game's files to a third-party service (a skeleton with a plain stand-in mesh, not CDPR's body, is safer), and Uthana's right to train on inputs.

### Video first, or text first?

| Route | Good | Bad |
|---|---|---|
| **Text to motion directly** | One step, cheap (10 s for about $1 with Uthana), clean skeletal data, no video artefacts | Less control over style; short (10 s); prompts are qualitative |
| **AI video, then video to motion** | The modder can see and choose the performance first; style and moves (kung fu) are easier to show than describe | Two paid steps; AI video has physics errors (feet sliding, limbs merging, hands melting) that the mocap will copy; camera moves confuse the solve |
| **Real footage, then video to motion** | The best control and realism; a phone and a friend are enough | Needs a person who can do the move |

Video-to-motion on AI-made footage is **unverified**: no published test was found. The suggestion is to try text to motion first, then real footage, and AI video only for moves nobody can film.

**Prompt shape for reference video** (for Veo, Sora, Kling, Runway and others; general practice, **unverified** per model): one person only; whole body in frame head to feet, with space around; a locked camera on a tripod, no zoom, no cuts; a plain, even background and floor; side or three-quarter view, the same all clip; even light, no motion blur; fitted clothes (no long coat hiding the legs); a short neutral stand at the start and end; real-time speed, no slow motion. For example: "Static wide shot on a tripod, plain grey studio, one martial artist in a fitted black tracksuit, whole body in frame, three-quarter view. He stands still for one second, then performs a slow kung fu form, then stands still again. No camera movement, no cuts." Clips are typically 5 to 10 s per generation (**unverified** per model). Kling's "motion control" goes the other way (a video's motion onto a picture) and does not help here.

## 6. Retargeting onto the game's rigs

**Why it is needed.** Every service has its own skeleton. Moving a clip onto the game's rig means matching bones by role, then fixing the differences.

| Difference | What goes wrong | Fix |
|---|---|---|
| **Bone names** | Nothing moves, or the wrong bone moves | A map by role. The game's 71 bones use Mixamo-like names without the prefix (`Hips`, `Spine1`, `LeftForeArm`, `LeftUpLeg`); SMPL uses `pelvis`, `spine1`, `left_elbow` |
| **Bone count** | SMPL has 3 spine joints, the game 4 (`Spine` to `Spine3`), Fortnite 5 | Spread the turn over the extra joints |
| **Rest pose** | A T-pose source on an A-pose target bends every arm | Compare in a shared pose, or turn the target's rest to match first (the wiki's way) |
| **Bone axes** | The same rotation turns the wrong way | Retarget in world space, not by copying local rotations |
| **Proportions and scale** | Feet slide or float, hands miss the prop | Scale the root's travel by leg length; foot locking (IK) |
| **Units and up axis** | Centimetres or metres; Y-up or Z-up | glTF is metres and Y-up; REDbridge converts to the game's axes |
| **Root motion** | The body walks off its root, or the root never moves | Put the travel on `Root` as the game's clips do; leave `Trajectory` and `reference_joint` alone (the wiki's retargeting guide) |
| **Fingers** | SMPL and many services have none | Keep the game's own finger keys, or a hand pose from a game clip |
| **Twist and muscle bones** | | Not needed: the game's deformations graph drives them from the 71 |
| **V's rig** | V's skeleton has about 152 joints, the NPC clips 71 | Retarget to the 71 shared bones first; what V's extra joints need is **unverified** |

**Tools.**

| Tool | Kind | Fit |
|---|---|---|
| **Cyberpunk Blender add-on** (WolvenKit Blender IO Suite) | Free; its main branch has a BVH and `.rlmotion` import retargeted onto game rigs, with a bone map that knows Mixamo, HumanIK and common names, hinge-aware arms and legs, and the game's extras written for export | The best candidate: made for these rigs, runs in Blender. Its licence is not stated on GitHub (EDGEfab's notes call it GPL, **unverified**), so EDGE tools should call it, not copy it |
| **Rokoko Studio Live for Blender** | Free with an account | The wiki's retargeting guide uses it, by hand |
| **Auto-Rig Pro** (Remap) | Paid add-on | Strong, by hand |
| **A retarget script of EDGE's own** in `blender --background` or in Node | Our code | Fully automatic, MIT; most work; SMPL and Uthana skeletons first |
| **Uthana's own retargeting** | The service | Skips local retargeting if its result on an uploaded game skeleton is good (**unverified**) |

**Can REDbridge's import take the result?** Yes, if: the GLB's clips target only the rig's bone names, keys are linear or step, each clip has WolvenKit's extras (copied from a game clip, or written with defaults), and the target is an existing set, a template, or a new set on a game rig (`rig` parameter). Then `project.import` writes the `.anims`. Whether the game plays it is the open question of Probe A.

## 7. Gaps and risks

| Gap | Why it matters | What it means for the plan |
|---|---|---|
| **An imported clip in the game is unverified** | Everything else depends on it | Probe A first, before any build |
| **Root motion is rewritten as linear** | A walk or a drop may move differently in the game | Probe it with a moving clip; until then, root-motion clips are marked |
| **No graph editor** | New behaviours on V (phone while walking) need graph changes; the graph files are large and whole-file | Start with replacements and workspots; a graph change is research, not a phase |
| **Whole-file replacements conflict** | Two mods changing `player_locomotion.anims` cannot both win | Probe ArchiveXL's priority override; if it works, ship override sets instead |
| **No base-game call plays a clip by name** | Every played clip needs a workspot, a graph or a scene | REDnode's written workspots for NPCs; REDnode #47 for V |
| **V cannot act yet from a package** | V's behaviours cannot be tried live | REDnode #47 (V as an actor) is on the critical path for V |
| **No V body in REDcode's viewer** | V's rig has no base body; her entity does not export (EDGEdir D3) | Show V's clips on `man_base`'s body as a stand-in (most bone names shared, **unverified**), or ask REDbridge for the player body |
| **FPP and TPP differ** | A clip good from outside can look wrong from V's eyes, and the camera rides the head | Test V's clips in both views; FPP-only clips for arms in view |
| **Facial animation** | A new body clip does not move the face; a smile or speech is separate | Out of the body path; EDGEfab's lip sync work covers faces |
| **Cloth, hair, physics** | Driven by their own dangle graphs; they react, not animated by clips | Nothing to do, but fast clips may make cloth misbehave (**unverified**) |
| **Events** | Footsteps and effects keep their old times on a retimed clip; a new clip has none | Move event times with retiming; add footsteps for new walks later |
| **SIMD writing** | WolvenKit writes SIMD only when the extras ask for it | Write compressed; fine for gameplay clips (**unverified** for cinematic ones) |
| **Twitching, frame clamping** | Community fixes (`numTracks`, frame clamping) are folklore | Build the probe's findings into the import |
| **WolvenKit bugs** | #3304, #3305, #3306 worked around in REDbridge | Watch WolvenKit releases; take the workarounds out when fixed |
| **AI licences** | Free tiers need credit or forbid commercial use; HY-Motion excludes the EU, UK and South Korea; SMPL is non-commercial; Uthana may train on inputs | Record the source and licence with each clip (EDGEfab's anim item already does); paid Uthana first; the owner decides on uploads |
| **AI quality** | Video errors, foot sliding, no fingers, short clips | Short clips, simple moves, a cleanup step (foot lock, smoothing) |
| **Synced clips** | Two people's clips must line up (`syncTrajectory`) | Out of scope for made clips at first |

## 8. Recommendations

### Tool roles

| Tool | Role |
|---|---|
| **REDcode** | Views every animation on its body (A1 to A3, built). Basic editing by itself, by the house rule: **Edit in Blender** for a clip, **Replace Clip from GLB** (a clip already on the game rig, imported over a clip by name), **Export Clip**, **Try in Game** through REDnode, and showing a clip's facts (type, root motion, events). **Open in EDGEfab** on the animation view when EDGEfab is installed |
| **REDbridge** | Reads and writes: export with `options.animations` and `rootMotion`; import over a set, a template or a rig. Probably small requests later: write default extras for a clip that has none; report a clip's events and float tracks |
| **EDGEfab** | The deeper fabricator, as its plan already says (F7b-1, F7b-2, the EDGEdir split of 2026-11-16): trim, loop, speed, mirror, root offsets, one-bone layers, retargeting from other skeletons, text and video to motion through Uthana (key from the shared key store), the `anim` Library item. Yes, EDGEfab is the right home |
| **EDGEdir** | The animation index and putting clips together into scenes; it needs made clips to reach the game, which is Probe A plus EDGEfab's anim item |
| **REDnode** | Trying live: `archives_reload` swaps the new `.anims` in, `world.writeWorkspot` and `world_animate` play it on a spawned NPC. V needs #47 |
| **Blender** | Hand edits and retargeting, driven by REDcode's and EDGEfab's scripts, with the Cyberpunk add-on when installed |

### Phases

Each phase ends in the game, as the house rule asks.

| Phase | What | What it proves | Probe first on the real game |
|---|---|---|---|
| **P0 Probe A: the round trip** (no code, a script and the owner) | Export `q001_00c_trauma_arrives___med_1_idle__01` (or the gameplay `stand__2h_on_sides__01`) with REDbridge; import it back **unchanged**; then a copy with one arm raised in Blender; pack each into a scratch mod; swap in with `archives_reload`; play on a spawned paramedic with `world.writeWorkspot` | An imported clip plays; Blender's export keeps what the import needs; how big the twitch is; whether a new clip name in a new `.anims` plays from a written workspot | Whether Blender 5.3 keeps the extras; whether `numTracks` needs the community fix; T pose at first play |
| **P0 Probe B: a clip that moves** | The same with a root-motion clip (the soldier's landing, or a step-off) | Linear root motion in the game | Workspots apply no root motion, so this may need a scene or a replaced gameplay clip |
| **P0 Probe C: override by priority** | An ArchiveXL `animations:` entry adding a small set with one of V's idle clips changed, at priority 250, to `player_ma_fpp.ent` component `root` | Whether a mod can override one of V's clips without replacing the whole file | ArchiveXL's log lines ("Merging animations from ...") show the set was added |
| **P0 Probe D: Uthana, generate and retarget in one step** (the owner, 2026-11-20; after Probe A) | One paid test, with the owner's Uthana account and its key in the shared key store: REDcode makes a stand-in character from the game's files (the base body on `man_base.rig`, the game's bone names and rest pose, as the animation view already exports it), it is uploaded to Uthana once, and a 10-second text-to-motion clip (and, if that works, a video-to-motion one) comes back retargeted onto it as GLB. A short fitting step in code, no Blender: WolvenKit's clip extras added, channels for bones the rig lacks dropped, travel moved from the hips to the root-motion joint if Uthana puts it there. Then REDbridge's import, REDcode's view, and Probe A's package in the game | Whether Uthana alone can generate and retarget onto the game's skeleton, with no Blender in the loop | Whether Uthana's bone matching takes the game's names (`Hips`, `Spine`, `LeftArm` and the rest); whether the output keeps the game's rest pose; root motion; fingers; what it does with the roughly 80 helper bones (twist and muscle) it will not animate; the owner's decision on uploading a character made from the game's files |
| **R1 REDcode: Edit in Blender for a clip** | In the animation view: Edit in Blender on the clip shown (export it alone, open in Blender with the action active and the timeline set, export on save, copy back the extras, import over the clip in the project, refresh the view). Uses `blender.ts`'s pattern | A modder edits a game clip and sees it at once in REDcode | P0's findings |
| **R2 REDcode: Try in Game** | Pack, `archives_reload`, and play the clip on a spawned NPC of the clip's rig through a written workspot | The loop from edit to game in one button | REDnode's package call for it (a `redcode` package service, like `reveal`) |
| **R3 REDcode: Open in EDGEfab** | The button, through EDGEfab's API, as Open in EDGEmat works | The handover | EDGEfab's animation tab exists |
| **E1 EDGEfab: F7b-1** | Already planned: timing and root offsets, the Trauma Team drop as the test | Level 1 and 2 edits | P0 Probe B |
| **E2 EDGEfab: Import and retarget** | A GLB, FBX or BVH from elsewhere onto `man_base`/`woman_base`, through Blender in the background (the Cyberpunk add-on's mocap import if it works, else EDGE's own script) | A Mixamo or BVH walk plays on a medic | The add-on's mocap import on a BVH, in the background |
| **E3 EDGEfab: Uthana** | Text to motion and video to motion through the API, onto an uploaded stand-in skeleton with the game's bone names, then E2's path | "A medic does a kung fu form" from words or a video | One paid test: Uthana's output on the uploaded skeleton (names kept, rest pose, root motion, fingers); the owner's decision on uploads |
| **V1 V's run** | Replacement run clips for V (a set of named clips from `player_locomotion.anims`), shipped as an override set if Probe C passes, else as a whole-file mod | A new run in both views | Which clips the run uses (names, FPP and TPP); a third-person view to look at it |
| **V2 V with a phone** | A workspot on V with a phone prop and a looping clip (made from an NPC phone clip, retargeted to V's rig), started from a REDnode package | A still behaviour with a prop on V | REDnode #47 (V as an actor); how a workspot attaches a prop on V |
| **Later, research** | An upper-body layer in V's graph (phone while walking); new events; faces with lip sync | | |

**Probe A, the offline half, ran on 2026-11-20** (`tools/probes/anim-probe-a`): the game's idle `stand__2h_on_sides__01` exported and imported back unchanged is exact (the left arm 0.0 degrees from the game's clip); through Blender 5.3 in the background with the left arm turned 70 degrees it imports and reads back at 70.0 degrees, 765 frames at 30 fps. Found: **Blender's glTF export drops WolvenKit's clip extras** even with extras on, so a fitting step must copy them back (the probe does); and Blender's default 24 fps resamples a clip unless the scene is set to 30. 

**Probe A in the game, 2026-11-21: an imported clip plays.** On a Trauma Team paramedic, through a workspot written by REDnode: `same` plays as the game's clip, and `arm` holds the left arm raised while the rest of the idle plays. One more fix was needed first: **a new set from WolvenKit's import crashes the game** when a clip starts. Each clip keeps the game clip's `fallbackFrameIndices`, the frames the game shows while the clip's data streams in, but WolvenKit never writes the set's fallback tables, so they are empty. With `fallbackFrameIndices` cleared, as the game's own additive clips have them, both clips play. So REDcode's import for clips must clear them (or, later, write real fallback frames). A brief T pose shows when the workspot first starts, before the first clip, the game's own one; it is not the imported clips. R1 and R2 can go ahead on this.

**Probe D, the offline half, ran on 2026-11-22** (`tools/probes/anim-probe-d`): **Uthana keeps the game's skeleton exactly.** The base male body skinned on `man_base.rig` (REDcode's `baseBodyGlb`, 187 joints, 2.1 MB) was uploaded as is, auto-rig off. A 5 s text-to-motion clip ("a man stands relaxed, raises his right hand and waves hello, then lowers his arm and stands still", `text-to-motion-3.0`, about $0.50) came back as GLB at 30 fps with the same 199 nodes, all 71 animated bones by the game's names, and the rest pose identical on every bone. So the fit is copying keys by name onto the game clip's nodes, writing every channel the game clip has (run 1 in the game warped the body with translation on `Hips` alone: the game needs each bone's translation keyed), with WolvenKit's extras from a game clip (its 13 float tracks held constant, no fallback frames): no retargeting and no Blender. REDbridge imported it with no skips, as a new clip and over the game's own idle clip in a copy of its set. It keys rotation on every bone, fingers and helper bones included (185 channels); whether the fingers move usefully is unverified. **In the game, 2026-11-22: it plays**, added and replacing the game's idle clip, once the fit keyed every bone's translation as well as its rotation (run 1 warped the body without them; run 2 sank a little, as Uthana grounds the heel joints where the game keeps them about 3 cm up, so the fit now lifts the hips to match; [testing](../testing.html#animation-probe-d)). So the path from words to a clip in the game needs no Blender: Uthana onto the stand-in, the fit, REDbridge's import, Pack and Play. Unverified point 6 is settled for text to motion; video to motion is not yet tried.

**The first two steps to take:** P0 Probe A, then R1. Probe A costs no code (scripts against REDbridge and REDnode, as REDnode's spikes were) and settles the one unknown everything else needs. R1 is small, since Edit in Blender for meshes, the clip export and the import all exist.

### Unverified points that matter for the plan

1. A clip imported by REDbridge (WolvenKit's `ImportAnims`) plays in the game, with or without the `numTracks` fix.
2. Linear root motion written by the import moves a character as the original did.
3. Blender 5.3's glTF exporter keeps WolvenKit's animation extras through a round trip.
4. A higher ArchiveXL priority overrides a same-named clip, and ArchiveXL's `animations:` works on `player_ma_fpp.ent`.
5. A package can make V play a workspot (REDnode #47).
6. Uthana's output on an uploaded game skeleton is usable as is (names, rest pose, root motion, fingers), and uploading such a skeleton is acceptable.
7. The Cyberpunk Blender add-on's mocap import works in the background and its licence lets EDGE tools call it.
8. Video to motion on AI-made video gives usable clips.
9. NPC clips can be shown and retargeted for V's rig through the 71 shared bones.

## 9. Sources

Repos on this machine (read 2026-11-20):

- REDcode: `CLAUDE.md`, `docs/design/animation.md`, `docs/design/view.md`, `docs/api.md`, `docs/testing.md`, `extensions/redcode/src/blender.ts`, `animsGlb.ts`, `animsSet.ts`.
- REDbridge: `CLAUDE.md`, `CHANGELOG.md`, `src/REDbridge/BridgeApi.Anims.cs`, `BridgeApi.AnimsImport.cs`, `BridgeApi.Modkit.cs`; WolvenKit's `WolvenKit.Modkit/RED4/Tools/AnimationTools.cs` and `Animation/Shared.cs` in `external/WolvenKit`.
- REDnode: `docs/world.md` ("Animations on a spawned character (#39)", "A written workspot (#46)").
- EDGEfab: `CLAUDE.md`, `docs/plan.md` ("Animation: a key focus", "Rigs and animation", "Animations: the split with EDGEdir").
- EDGEdir: `CLAUDE.md`, `docs/design.md`.
- The game's files (2.5, through REDbridge): `base\characters\entities\player\player_ma_fpp.ent`, `player_ma_tpp.ent`, the `base\animations\player\` folder, phone workspots.

Web:

- ArchiveXL animation extension source: https://github.com/psiberx/cp2077-archive-xl/tree/main/src/App/Extensions/Animation
- ArchiveXL wiki: https://github.com/psiberx/cp2077-archive-xl/wiki
- Poses and animations, make your own: https://wiki.redmodding.org/cyberpunk-2077-modding/modding-guides/animations/animations/poses-animations-make-your-own
- Retargeting poses and animations: https://wiki.redmodding.org/cyberpunk-2077-modding/modding-guides/animations/animations/retargeting-poses-animations
- Editing V's actual in-game animations: https://wiki.redmodding.org/cyberpunk-2077-modding/modding-guides/animations/creating-animations-editing-vs-actual-in-game-animations
- ArchiveXL, adding photo mode poses: https://wiki.redmodding.org/cyberpunk-2077-modding/modding-guides/animations/animations/archivexl-adding-photo-mode-poses
- AMM collab animations and poses: https://wiki.redmodding.org/cyberpunk-2077-modding/modding-guides/animations/animations/amm-collab-anims-poses
- WolvenKit Blender plugin import and export: https://wiki.redmodding.org/cyberpunk-2077-modding/for-mod-creators-theory/modding-tools/wolvenkit-blender-io-suite/wkit-blender-plugin-import-export
- Cyberpunk Blender add-on: https://github.com/WolvenKit/Cyberpunk-Blender-add-on (release 2.5.0: https://github.com/WolvenKit/Cyberpunk-Blender-add-on/releases/tag/V2.5.0)
- WolvenKit issues: https://github.com/WolvenKit/WolvenKit/issues/3304, https://github.com/WolvenKit/WolvenKit/issues/3305, https://github.com/WolvenKit/WolvenKit/issues/3306
- Uthana video to motion: https://uthana.com/models/video-to-motion
- Uthana text to motion: https://uthana.com/product/text-to-motion
- Uthana API pricing: https://uthana.com/docs/api/pricing
- Uthana API quickstart: https://uthana.com/docs/api
- Uthana retargeting: https://uthana.com/docs/api/capabilities/retargeting and https://uthana.com/product/flexible-retargeting
- Uthana terms: https://uthana.com/terms
- DeepMotion SayMotion pricing: https://deepmotion.com/pricing-saymotion and API: https://deepmotion.com/saymotion-api
- Rokoko pricing: https://rokoko.com/pricing/ and Vision: https://rokoko.com/products/video
- Move.ai pricing: https://www.move.ai/pricing and API: https://move.ai/api
- Meshy text to motion API: https://docs.meshy.ai/en/api/text-to-motion
- Radical's technology to Autodesk: https://www.cgchannel.com/?p=175200
- Meshcapade SMPL: https://meshcapade.com/smpl and licences: https://meshcapade.com/assets/avatar-tech
- HY-Motion 1.0: https://github.com/Tencent-Hunyuan/HY-Motion-1.0 (licence in `License.txt`), paper: https://arxiv.org/abs/2512.23464
- Kinetix research: https://kinetix.tech/research-3d
- Kling motion control guide: https://kling.ai/blog/ai-motion-transfer-video-tutorial
