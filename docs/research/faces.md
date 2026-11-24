---
title: NPC faces
---

# NPC faces: expressions and lip sync

**Status: research.** Asked for by the owner on 2026-11-17, for EDGEfab's animation work and for the tools that use faces: EDGEquest (playing conversations) and EDGEdir (directing NPCs on a timeline). Read from the game's files (2.5 with Phantom Liberty; `Cyberpunk2077.exe` product version 2.5, file version 3.0.5813403; 57 archives, 592,071 files) through the `redcode` server (REDbridge 0.12.1, WolvenKit 10.0.0) on 2026-11-17. The running game was not used (the `rednode` server was not connected), so nothing here was watched in the game. Facts read from files are stated plainly; what is inferred from them is marked **inferred**, and what was not checked is marked **unverified**.

## The short answer

| Question | Answer |
|---|---|
| What moves a face? | Mostly **pose weights**, not bones. Each head has a `.facialsetup` that turns about 140 named face poses (plus correctives, wrinkles, tongue and eyes) into joint movement. Facial clips animate those weights as float tracks |
| How are emotions made? | A scene event on the actor's `head` changes its **facial idle**: a key pose (`idle__joy__female__fake_smile`) blending into a looping mood (`idle__joy__female`) over a set time. About 20 moods, each with named variants |
| What else plays on the face? | Short **gestures** on top of the mood (glances, nods, a wink, a resentful look), played as ordinary scene animation events on the `head` component |
| How does lip sync follow a voice line? | By the line's string id. A line `0x2CE9C077837E0000` plays the voice file `..._f_2ce9c077837e0000.wem` and the lip sync clip `f_2CE9C077837E0000`. A per-language **lip sync map** says which clip set holds each speaking actor's clips for each scene |
| Is lip sync generated at run time? | No. Every voiced line has a baked clip per language (7,408 clip sets for English) |
| Can one clip play on different heads? | **Inferred yes**, within a body type: the clips drive pose weights, and the generic facial sets are shared by every head of a gender |

## The parts of a face

| Part | Where | What it holds |
|---|---|---|
| Head rig | `<head folder>\<head>_skeleton.rig` | The face's joints (344 on the sample heads) |
| Facial setup | `<head folder>\<head>_rigsetup.facialsetup` (`animFacialSetup`), about 400 in the game, plus small `_lc` ones for light crowds | The poses for that head: face 133 main poses and 255 correctives, tongue 21 and 4, eyes 12. Track mapping: 141 main poses, 86 lip sync overrides, 33 wrinkles, 13 envelopes. `useFemaleAnimSet` picks the female or male clip set. The pose data itself is in binary buffers |
| Face graph | `base\animations\facial\_facial_graphs\<body>_sermo.animgraph`: `woman_average`, `man_average`, `man_big`, `man_fat`, light crowd `_lc` versions, and the player's paperdoll and photo mode ones | How the face layers: a `Sermo` solver (the pose system), a facial mixer slot for scene clips, additive blends, eye and head look-at, and gameplay states (Idle, Fear, Reactions, Hurt, Death) chosen by anim features such as `FacialReaction` |
| Shared facial clips | `base\animations\facial\` (67 files): `female_average`, `male_average`, `generic`, `gameplay`, `main_characters`, `quest_custom` | Moods, transitions, gestures, combat and finisher faces, characters' own idles |
| Lip sync clips | `base\localization\<language>\lipsync\<scene folder>\<actor>.anims` | One clip set per speaking actor per scene, one clip per line |
| Lip sync map | `base\localization\<language>.lipmap` (`animLipsyncMapping`) | For each scene: the speaking actors' voice tags and their clip sets (3,527 scenes for English) |
| Voice files and maps | `base\localization\<language>\vo\*.wem`; `voiceovermap.json`, `voiceovermap_1.json` and Phantom Liberty's `ep1\localization\<language>\voiceovermap.json`, with `_helmet`, `_holocall` and `_rewinded` versions | The `.wem` for each line by string id, a female and a male path |
| Line lengths | `base\localization\<language>\stringidvariantlengthsreport.json` | Each line's length in seconds, female and male |

### How a character is hooked up

Every NPC appearance (`.app`) read has the same two pieces. Checked on a crowd NPC (`citizen__biker_wa.app`, 4 appearances) and a main character (`judy.app`, 22 appearances).

| Component | Fields |
|---|---|
| `entAnimatedComponent` named `face_rig` | `rig`: the head's skeleton. `graph`: a face graph (crowd: `woman_average_sermo.animgraph`; Judy: `player_woman_photomode_sermo.animgraph` in every appearance, reason **unverified**). `facialSetup`: the head's `.facialsetup`. `animations.cinematics`: a main character's own facial sets (Judy: `judy_facial_idle.anims`, `judy_facial_idle_poses.anims`); empty for crowds |
| `entAnimationSetupExtensionComponent` named `man_face_base_animations` (the same name on women) | 57 facial clip sets as `gameplay`: both genders' generic idles, idle poses, transitions, gestures and quirks, lip sync gestures, combat and finisher faces, and some quest custom sets |

Tears are geometry, not animation: Judy has a `h0_001_wa_c__judy_cry.mesh` with its own textures.

## Emotions

### The vocabulary

The female set, `generic_average_female_facial_idle.anims`, has 20 looping moods (21 to 29 seconds each). `generic_average_female_facial_idle_poses.anims` has 55 still key poses: a `default` per mood and named variants. The male sets (`generic_average_male_facial_idle*.anims`) have the same 20 moods and the same variants with `male` in the name, plus one more: `disinterested` `dismissive` (56 key poses).

| Mood | Key pose variants |
|---|---|
| `neutral` | default |
| `joy` | pleased, full, fake_smile |
| `happy` | charming, excited, thrilled |
| `sadness` | full, overwhelmed, bored |
| `anger` | defensive, full |
| `aggression` | furious |
| `fear` (and a `fear_reaction` loop) | worried, paralyzed, before_death |
| `surprise` | shock |
| `disgust` | repulsion, contempt |
| `disappointed` | offended |
| `interested` | awed, focused, confident, cautious, respectful, suspicious, aiming_weapon |
| `disinterested` | uncertain, sceptical (men also dismissive) |
| `nervous` | full |
| `pain` | agony |
| `exertion` | full |
| `tiredness` | sleeping |
| `unconscious` | braindance, drunk, stoned |
| `sex` | intense |
| `dead` | default |

Names follow `idle__<mood>__<female|male>` for loops and `idle__<mood>__<female|male>__<variant>` for key poses. Transition clips exist for a few pairs (`transition__neutral__to__anger__female`, `__fast` versions; 8 female ones). Main characters have their own idles and poses (Judy, Johnny, Jackie, Panam, Evelyn, Rogue and others under `main_characters`).

### The scene event

A mood change is a `scnChangeIdleAnimEvent` on the actor's `head` component. From `mq306_04b_angie_meeting.scene`:

| Field | Value in the sample | Meaning |
|---|---|---|
| `actorComponent` | `head` | The face, not the body |
| `performer` | the actor | Who |
| `startTime`, `duration` | 1219, 2730 | Milliseconds; the duration is the transition |
| `bakedFacialTransition.facialKey_Female` / `_Male` | `idle__joy__female__fake_smile` / `idle__joy__male__fake_smile` | The key pose to pass through |
| `bakedFacialTransition.toIdleFemale` / `toIdleMale` | `idle__joy__female` / `idle__joy__male` | The loop to settle in |
| `facialKeyWeight`, `toIdleWeight`, `toIdleNeckWeight` | 1, 1, 0.75 | How strong |
| `transitionDuration`, `transitionType`, `timeScale` | 2.73, `Fast`, 1 | How it blends |
| `customTransitionAnim` | `None` | A hand-made transition instead of the baked one |
| `facialInstantTransition` | 0 | Snap instead of blend |
| `upperFaceBlendAdditive`, `lowerFaceBlendAdditive`, `eyesBlendAdditive` | 1, 1, 1 | Which face regions blend additively |

Both genders are named in every event; **inferred**: the head's `useFemaleAnimSet` decides which is played. The mood then holds until the next change.

### Gestures on top

Short clips play over the mood as `scnPlaySkAnimEvent` on the `head` component, with `animName` set directly. The male gesture set has 94: `emotional_gesture` (33: impressed, shocked, confident, resentful ...), `other_gesture` (grimace, wink, eye roll, asymmetrical smile ...), `glance` (13), `phrasal_gesture` ("what do you want", "maybe"), `no` and `yes` (head shakes and nods), `eyes` (darts). `generic_facial_lipsync_gestures.anims` has 9 sound faces: pfft, hahaha, sniff, ahaaa, heh, huh, haaa, sigh, hmm (how they are triggered is **unverified**).

Body events carry face fields too: `muteAnimEvents` (flag `FACE_ANIMS`), the three face blend flags and `neckWeight`, so a body clip can leave the face alone or override it.

### In gameplay

Outside scenes, the face graph's states are picked by anim features the game's code sets: `FacialReaction` (ints `category` and `idle`), `hit`, `highLevelState`, `upperBodyState`, `lookAt`. Clips for that are in `base\animations\facial\gameplay` (bumps, `set_friendly`, deaths) and the finisher and takedown face sets. Which code sets which values is **unverified** (not read here).

## Lip sync and voice lines

### From a line to its sound and its mouth

Traced on line 1 of `mq306_04b_angie_meeting.scene` (Phantom Liberty), spoken by Angie.

| Step | File | Follow | In the example |
|---|---|---|---|
| 1 | The scene's graph | A `scnDialogLineEvent`: `startTime`, `duration` (ms), `screenplayLineId`, `voParams` (`voContext`, `voExpression`, `disableHeadMovement`, `isHolocallSpeaker`) | Starts at 2203 ms, 1620 ms long, line item 1, `Vo_Context_Quest`, `Vo_Expression_Spoken` |
| 2 | The scene's `screenplayStore.lines` | That item: `speaker`, `addressee`, `locstringId.ruid`, `femaleLipsyncAnimationName`, `maleLipsyncAnimationName` | ruid `3236329426782126080` (hex `2CE9C077837E0000`), clips `f_2CE9C077837E0000` and `m_2CE9C077837E0000` |
| 3 | The voice map for the language | The entry whose `stringId` is the ruid: `femaleResPath`, `maleResPath` | `ep1\localization\en-us\vo\angelica_whelan_mq306_f_2ce9c077837e0000.wem`, both genders. For V's lines the two differ (`v_mq306_f_...` and `v_mq306_m_...`) |
| 4 | `base\localization\en-us.lipmap` | The index of the scene's path hash in `scenePaths`; that `sceneEntries` item lists `actorVoiceTags` (the actors' `voicetagId`) and `animSets`, in step | Entry 3130: Aaron and Angie, `base\localization\en-us\lipsync\ep1\quest\minor_quests\mq306\scenes\mq306_04b_angie_meeting\angelica_whelan.anims` |
| 5 | That clip set | The clip named in step 2 | `f_2CE9C077837E0000` |

So the string id is the key everywhere: decimal in the maps, hex (upper case in clip names, lower case in `.wem` names) with an `f_` or `m_` gender prefix. 14 of the scene's 19 lines have a voice file; the rest are not voiced.

The scene also lists lip sync sets of its own (`resouresReferences.lipsyncAnimSets`, each actor's `lipsyncAnimSet` an index into it) at `ep1\quest\...\scenes\lipsync\en\<scene>\<actor>.anims`. Those paths are not in the archives. **Inferred**: the game finds the clips through the language's `.lipmap`, which is why lip sync changes with the voice language. In the sample, only the two NPCs who speak have lip sync; V's set is listed in the scene but not in the map (**inferred**: V's face is not seen there).

Gameplay barks use the same map: voice sets are scenes too (`base\open_world\voicesets\fixers\vset_mr_hands.scene` maps to `...\vset_mr_hands\wade_bleecker.anims`).

### Inside a lip sync clip

From `aaron_waines.anims` (English):

| Field | Value |
|---|---|
| `rig` | The head's skeleton (`h0_005_mb_c__middle_skeleton.rig`) |
| One `animAnimation` per line | `f_305EC8FCC3453000`, 2.4 s, 73 frames (30 fps), `AdditiveFromRefPose` |
| Content | 344 joints but only 31 animated joint keys (1,029 constant); 414 float tracks with 2,863 keys. **Inferred**: the float tracks are the facial setup's pose weights, so the mouth shapes come from the head's poses |
| Events | None |

Clips are additive, so they ride on top of the mood: a sad face keeps its brows while the mouth talks.

## What this means for each tool

### EDGEquest: playing conversations

- Everything to play a line is reachable from the scene and the language: the line's times from the event, the `.wem` from the voice map, the clip from the `.lipmap`. Pick `f_`/`m_` and the female or male `.wem` by V's gender for V's lines.
- A preview needs facial clips evaluated through the head's `.facialsetup`. Playing them as bones alone shows almost nothing (31 animated joint keys in a 2.4 s line). **REDcode #21 (`openAnimation`) should cover facial clips with the facial setup**, or the preview runs in the game through REDnode #39.
- **New voice lines in a mod** need four things: the `.wem`, a voice map entry, a lip sync clip, and a lip sync map entry. A mod brings its own `.lipmap` per language and lists it in an ArchiveXL file under `localization: lipmaps:`, so mods don't change the game's map (WolvenKit's lip sync generator writes these; RED modding wiki, read 2026-11-17; see [Made lip sync](lipsync.html)). Without lip sync, the mouth would not move (**unverified**).

### EDGEdir: directing on a timeline

An actor's face is three lanes, all in milliseconds like the rest of a scene:

| Lane | Event | What the user picks |
|---|---|---|
| Mood | `scnChangeIdleAnimEvent` on `head` | A mood and a variant from the table above, the transition length, weights. The genders are written by the tool |
| Gestures | `scnPlaySkAnimEvent` on `head` | A gesture clip, blend in and out, which face regions blend |
| Lip sync | Comes with each `scnDialogLineEvent` | Nothing: it follows the line. The lane shows it |

Plus look-at (`scnLookAtEvent`, 26 in the sample scene) for eyes and head. The animation index should know facial clips by kind (mood, key pose, transition, gesture), gender and body, and that they play on the `head` component.

### EDGEfab: one clip

- A facial clip is a float-track clip on a head rig. EDGEfab's import, change and convert steps (F7b) must keep float tracks, not only bones. WolvenKit's glTF export keeps them: a lip sync clip's 414 tracks come out as `trackKeys` in the animation's extras (checked 2026-11-17, [Made lip sync](lipsync.html)). Import through REDbridge is not checked (REDbridge #14).
- Trim, loop and speed apply to facial clips as they are. Mirror needs the left and right pose pairs swapped (`eye_l_...` with `eye_r_...`), not bones mirrored.
- **Made lip sync** (from a new voice line, or a video of someone saying it) means writing the head rig's lip sync tracks. The track names are in the head rig (`trackNames`, 414); the routes, the services and the long pole are in [Made lip sync](lipsync.html).
- **A new head that speaks** (the UE5 faces question) needs its own `.facialsetup`. The poses are baked binary buffers in that file; whether any tool can author one is **unverified**. A borrowed game head stays the practical path ([UE5 assets](ue-assets.html), "Faces").

## Open questions

| Question | How to find out |
|---|---|
| Do lip sync clips play by the `.lipmap` alone, or also by the scene's own paths? | Change a line's map entry in a test mod and watch it in the game (REDnode) |
| Can two mods add lip sync without conflict? | Mostly answered: each mod's own `.lipmap` through ArchiveXL's `lipmaps` ([Made lip sync](lipsync.html)). Test two mods in the game |
| Do facial float tracks survive WolvenKit's glTF import? | Export keeps them (checked 2026-11-17). Import one back (REDbridge #14) |
| Why does Judy's face use the photo mode graph? | Compare other main characters' `.app` files |
| What sets the `FacialReaction` anim feature in gameplay? | Read the game's scripts |
