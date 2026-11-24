---
title: Made lip sync
---

# Made lip sync: from a talking video (or a voice) to the game's lip sync clips

**Moved from EDGEfab to REDcode on 2026-11-22**, with the Lip Sync editor it describes; REDcode's plan for it is [Lip Sync](../design/lipsync.html). The page stands as EDGEfab wrote it, so it names EDGEfab's files and commands of the day. In REDcode they are:

| On this page | In REDcode |
|---|---|
| Core `src/core/lipsync` | `packages/lipsync-core/src` (`@edgemodders/lipsync-core`) |
| **EDGEfab: Open Lip Sync** | **REDcode: Open Lip Sync** |
| MCP `fab_lipsync_lines`, `fab_lipsync_line`, `fab_lipsync_make` | redcode-mcp's `lipsync_lines`, `lipsync_line`, `lipsync_make` |
| `npm run lipsync`, `lipsync:face`, `lipsync:speech` | `node packages/lipsync-core/scripts/check-lines.mjs`, `check-face.mjs`, `check-speech.mjs` |
| `npm run lipsync:jaw`, `lipsync:shapes`, `tools\spikes` | `tools\probes\lipsync-live` (`build-jaw.mjs`, `build-shapes.mjs`, `ls1-jaw`, `ls2-shapes`) and `tools\probes\lipsync-a2f` |
| The cache `%LOCALAPPDATA%\EDGEfab\cache\lipsync` | REDcode's global storage, `cache\lipsync` |
| The build plan, `docs/tools-together.md`, `docs/ue-assets.md` | EDGEfab's own pages, linked there |

**Status: research, with a proposal** ([the Lip Sync tab](#the-lip-sync-tab-a-proposal), 2026-11-17; where it goes in the build plan is the EDGEfab build session's call). Asked for by the owner on 2026-11-17: can a generated video of a person speaking a line be turned into the game's own lip sync clip, by one service built for it or by several steps put together? It decides where the long pole is for new voiced lines. Follows [NPC faces](faces.html). The game side was read from game 2.5 through the `redcode` server on 2026-11-17; the services from their own pages and reviews the same day (sources at the end). Nothing here was tried in the game. **Reviewed by the EDGEfab build session on 2026-11-17** ([Review](#review-and-what-is-built), below; and [Live lip sync](#live-lip-sync-a-line-made-while-the-game-runs), the owner's ask the same day, with the spikes that decide it), which checked the reading half against game 2.5 and built it (on the `lipsync` branch, merged into main on 2026-11-19). **Inferred** and **unverified** mark what was not checked.

## The short answer

| Question | Answer |
|---|---|
| Can it be done? | **Yes, by steps.** No service turns a video into Cyberpunk lip sync. Every step exists as a service or a free tool, except one: turning a service's face curves into the game's face tracks. That one EDGEfab would write |
| Is a video the best input? | **Not for the mouth.** A talking-head video made from a line's audio has a mouth the video model made from that audio. Reading it back adds a lossy step. Going from the audio straight to face curves gives the same mouth for less. Video earns its place for brows, eyes and head (a performance), and for a modder filming themselves |
| What is the long pole? | **The translation into the game's tracks**: about 100 tracks (mouth shapes, the overrides that mute other animation, envelopes, JALI's jaw and lips controls), at 30 fps. The services speak ARKit's 52 blendshapes or MetaHuman's controls. Writing the `.anims`, naming the clips and registering them are already solved |
| Is there ground truth to build the translation from? | **Yes.** The game has a baked clip for every voiced line, beside its `.wem`. A front end run on the game's own lines gives pairs to fit the translation on, on the modder's own PC (game data stays local) |
| Has anyone done part of this? | **Yes.** The community's [Lipsync Animator](https://github.com/andreaolivato/cyberpunk2077-lipsync-animator) (MIT, October 2026, tested on 2.5) makes lip sync clips from a line's audio and text, writes them through WolvenKit's own anims import, and documents the tracks. English only; mouth and blinks only |

## What the game wants

Read from the head rig `h0_005_mb_c__middle_skeleton.rig` (414 track names) and the English clip `aaron_waines.anims`, exported to glTF through REDbridge 0.12.1 (WolvenKit 10.0.0) on 2026-11-17. **The float tracks survive the export**: WolvenKit writes them in the animation's extras as `trackKeys` (`trackIndex`, `time`, `value`) and `constTrackKeys`, under the schema `wkit.cp2077.gltf.anims` version 5. Lipsync Animator found the same 414 names, in the same order, on three heads in 2.31 and 2.5.

| Track group | Count | In one line (2.4 s, 73 frames) |
|---|---|---|
| Poses (`jaw_mid_open`, `lips_l_funnel`, `lips_together_up`, `tongue_mid_tip_up`, ...: FACS-like, left and right) | about 140 | Only eye direction, head, neck and `face_gravity_*` move (17) |
| `<pose>LipsyncPoseOutput` | 141 | **The mouth**: 46 move, 0 to about 1 |
| `<pose>AnimOverrideWeight` | 86 | 40 move, mostly the negative of their `LipsyncPoseOutput` (26 of 36 pairs exactly): they mute other face animation on the poses lip sync drives |
| `<pose>Wrnkl` | 33 | None |
| Controls | 13 | 7 move: `lipSyncEnvelope`, `jaliJaw`, `jaliLips`, `muzzleLips`, `muzzleBrows`, `upperFace`, `lowerFace` |

Other facts the clip must keep: 30 frames a second; `AdditiveFromRefPose`; the clip named `f_<HEX>` or `m_<HEX>` from the line's string id; one set per speaking actor and scene; the set's `rig` the head's skeleton. `jaliJaw` and `jaliLips` are JALI's two controls (JALI is the research company that made the game's lip sync from audio, with no facial capture). Lipsync Animator found `jaliJaw` follows neither loudness nor any sound group, so what it does is **unverified**. It also measured that the mouth leads the voice by 60 to 70 ms.

Registering is solved too. WolvenKit's Scene Editor has **Generate vanilla lipsync anim sets**, and the RED modding wiki describes what it writes: a mod's own clip sets under `localization\<language>\lipsync\<scene>\<actor>.anims`, a mod's own `<project>.lipmap` per language, and an ArchiveXL file listing them under `localization: lipmaps:`. So mods add lip sync maps without changing the game's `.lipmap` (this answers an open question on [NPC faces](faces.html)). The generator copies existing clips only; new audio needs a made clip.

## The routes

| Route | Steps | Gives | Cost and terms |
|---|---|---|---|
| **A. Audio, by sounds** | Audio + text, forced alignment, a per-sound mouth table learned from the game's lines (Lipsync Animator) | Mouth and blinks. Scores against CDPR's clips 0.01 to 0.85 per part; lip closing 0.85 with the aligner | Free, MIT, local. English only (others need a pronunciation dictionary) |
| **B. Audio, by a speech-to-face model** | Audio, NVIDIA **Audio2Face-3D** (open source since 2025), ARKit's 52 blendshapes plus 16 tongue shapes | Mouth, jaw, tongue, some emotion | Free, local; SDK MIT; models under NVIDIA's own licence (read before shipping); needs an NVIDIA GPU (CUDA 12.8+, TensorRT 10.13+, 4 GB+), Windows or Linux. Audio2Emotion may be used only inside Audio2Face |
| B'. The same, Unreal | Audio, **MetaHuman Animator** audio-driven solve (UE 5.6), MetaHuman's face controls | Mouth, head movement | Free with Unreal Engine; needs UE (FA's Unreal path, [UE5 assets](https://edgemodders.github.io/EDGEfab/ue-assets.html)) |
| B''. The same, licensed | Audio, **JALI** or **Speech Graphics SGX** | The game's own method (JALI) or its peer | Quote only; JALI offers evaluations and C++ libraries. No hosted API found |
| **C. Video (the owner's route)** | 1. The line's voice. 2. A talking head **driven by that audio**. 3. Face capture from the video. 4. Translate. 5. Write. 6. Register | Mouth, plus brows, eyes and head from the video's performance | Per second of video (below), plus a free capture step |
| D. A real performance | The modder films themselves saying the line (webcam), then C3 to C6 | The modder's own acting | Free |

### The video route's steps

| Step | Candidates | Notes |
|---|---|---|
| 1. Voice | The modder's recording, or a generated voice (EDGEwave's job) | The `.wem` the game plays. Everything else follows it |
| 2. Talking head from that audio | **HeyGen** (REST API, script or uploaded audio, paid plans), **Hedra** (image plus audio), **VEED Fabric 1.0** (about $0.15 a second), **sync.so**, or local **SadTalker** and **Wav2Lip** | Must take the line's own audio. **Veo 3** makes speech with its video (about $0.05 a second at its lowest tier, per a 2026 estimate), but in its own voice, so the line would have to use Veo's audio. Rankings are mostly the vendors' own; test on a front-facing, evenly lit head |
| 3. Face capture | **MediaPipe Face Landmarker** (`pip install mediapipe`, VIDEO mode, 52 blendshape scores per frame, ARKit-style names, local and free); **MetaHuman Animator** from mono video (UE 5.6, offline, high quality); **DeepMotion** face tracking (39 ARKit blendshapes, web portal; no public API found); QuickMagic (52, no API docs found) | MediaPipe's set has no tongue (**unverified**: not on its page); lip closure from video is the weak point of all single-camera capture |
| 4. Translate to the game's tracks | **None exists.** EDGEfab's own | The long pole; below |
| 5. Write the `.anims` | A glTF with `trackKeys` in WolvenKit's extras, imported by WolvenKit's `ImportAnims` | Proven by Lipsync Animator (through WolvenKit's libraries). For EDGEfab, through REDbridge: [REDbridge #14](https://github.com/Edgemodders/REDbridge/issues/14), which must keep float tracks |
| 6. Register | Line clip names in the scene, a mod `.lipmap` per language, the ArchiveXL `lipmaps` entry | What WolvenKit's generator writes; EDGEquest's side |

## Using Lipsync Animator from EDGE

Read from its source (0.1.0, 2026-10-27) on 2026-11-17; not run here.

| Question | Answer |
|---|---|
| Does it need the WolvenKit app's window? | **No.** It loads WolvenKit's libraries into its own Python process (pythonnet) and calls WolvenKit's `ModTools` directly (`ImportAnims`, export, archive reads). The libraries come from the WolvenKit app's folder (self-contained) or the WolvenKit CLI's (needs .NET 10). Tested with WolvenKit 9.1 |
| Can it use the WolvenKit that REDbridge carries? | **Not as written.** REDbridge's folder has WolvenKit's libraries (`WolvenKit.Modkit` 10.0.0-beta.1, on .NET 10, which this PC has), but its loader starts .NET from `WolvenKit.CLI.dll` or `WolvenKit.dll`, and REDbridge's folder has neither. Neither the app nor the CLI is installed on this PC. Whether it works with WolvenKit 10 at all is **unverified** (it finds `ModTools`' constructor by reflection) |
| Which steps need WolvenKit? | Exporting an `.anims` to glTF, importing back, reading `.wem`, and `scene` (the project's scene, voice maps, lipmap). **`make` does not** when the audio is `.wav`, `.ogg` or `.flac`: it takes an exported `.anims.glb` and writes the new lines' tracks into it, with numpy and soundfile only (Montreal Forced Aligner, a separate conda install, if present) |
| So how would EDGE use it? | **Split it at the glTF.** REDbridge exports the actor's set (`project.export`, which writes this `.anims.glb`, checked 2026-11-17), Lipsync Animator's `make` adds the lines as a separate process, REDbridge imports the result (REDbridge #14). EDGEquest does the scene's part (line names, the mod `.lipmap`, the ArchiveXL entry). WolvenKit stays inside REDbridge; Lipsync Animator is MIT, called as a separate process |
| What it gives | English, from audio and the exact words: mouth, jaw, tongue and cheeks, and blinks; the rest of the face, head and neck stay as the game has them. A new line can borrow another line's bone layout (`--template`) |
| What the modder installs | Python 3.12 to 3.15 with numpy and soundfile; for good lip closing, Montreal Forced Aligner (Kaldi, through conda or mamba) |

This would make route A usable as soon as REDbridge #14 imports. **Proposed instead (2026-11-17, at the owner's question): EDGE builds its own, in its own stack**, and runs Lipsync Animator only as the baseline to score against. Why: its install (Python, and conda for the aligner) is too much for non-coders and can't ship in a Marketplace extension; the translation below is needed for routes B, C and D anyway, and the same core serves route A; and the conventions forbid copying other mods' code or data (its dictionary is numbers from the game). Its documented method and measurements are fair to learn from. The [Lip Sync tab](#the-lip-sync-tab-a-proposal) below is built on this.

## The long pole: the translation

ARKit's 52 shapes and the game's poses are both FACS-like, but they don't line up one to one. The game has more lip parts (`lips_together_up` and `_dn`, `lips_suck_*`, `lips_puff_*`, sticky corners), 16 tongue poses, throat poses, and the controls. A hand-made table would get the jaw and the big mouth shapes; it would miss the controls and the overrides.

**Proposed: learn it from the game.** For a few hundred of the game's lines (their `.wem` and their clip), run the chosen front end on the audio (route B) or on a video made from it (route C), then fit, per game track, a small model from the front end's curves (with a few frames of lead, the 60 to 70 ms Lipsync Animator measured). Overrides are set from their outputs (mostly the negative), envelopes from the speech's start and end. Score it as Lipsync Animator does: leave one character out, remake its lines, compare with CDPR's. The game's files stay on the modder's PC; EDGEfab ships the method, or only the fitted numbers (whether numbers fitted on game data may ship is a question for the owner).

One translation serves every front end that speaks ARKit's 52: Audio2Face (B), MediaPipe on any video (C, D). MetaHuman's controls would need their own fit.

## Recommendation

1. **Build the translation once, on ARKit's 52 shapes**, fitted on the game's own lines. It is the only missing piece and every route needs it.
2. **Feed it from audio first** (Audio2Face-3D, local and free), since a voiced line always has audio and the mouth is best from audio.
3. **Add video as a second front end** for performance: MediaPipe on a talking-head video (HeyGen, Hedra, VEED Fabric) or the modder's webcam, taking brows, eyes and head from the video and the mouth from audio, or both from the video when only a video exists.
4. **Keep Lipsync Animator as the baseline**: run it once on a test machine and score EDGE's clips against it. Its notes on the tracks match what was read here.
5. **Take the timing from EDGEwave**: a line voiced through ElevenLabs can come back with per-character timings, so the first version needs no aligner of its own ([below](#the-lip-sync-tab-a-proposal)).

## Experiments, smallest first

| # | Experiment | Answers |
|---|---|---|
| L1 | Export a game clip to glTF and import it back with WolvenKit's `ImportAnims`; compare the bytes or play both in the game | The write step through REDbridge (#14), with float tracks |
| L2 | MediaPipe on a HeyGen or Hedra video made from one game line's audio; plot its curves beside the game's clip | Whether video capture follows the game's mouth at all |
| L3 | Audio2Face-3D on the same line's audio; the same plot | Audio front end against video front end |
| L4 | Fit the translation on about 300 lines, score left-out characters | The long pole's quality, against Lipsync Animator's scores |
| L5 | A new line in a test scene with the made clip, a mod `.lipmap` and its ArchiveXL entry, watched in the game (REDnode) | The whole route |

## The Lip Sync tab: a proposal

Proposed by the owner on 2026-11-17: a command in EDGEfab opens a **Lip Sync** tab where the modder picks a character, sees and hears its lip synced lines, and adds new ones from typed text. The owner calls it a foundational capability for the platform, needed by EDGEdir (a face's lip sync lane) and EDGEquest (new voiced lines). **Where it goes in the build plan is for the EDGEfab build session to decide** (plan.md); this page proposes its shape and a course.

### Who owns what

| Part | Owner | Why |
|---|---|---|
| The tab, the made clip, the translation into the game's tracks | **EDGEfab** | A lip sync clip is one clip ([plan.md](https://edgemodders.github.io/EDGEfab/plan.html), the split with EDGEdir, 2026-11-16) |
| The voice: cloned voice, speaking a line, re-voicing, the `.wem` | **EDGEwave** | It already does this through **ElevenLabs** (voice cloning and speech, with the modder's key), and has a Voice Lines contract with EDGEquest keyed by the line's decimal ruid. Its `.wem` route goes through the modder's own Wwise (spiked offline 2026-10-23, not finished) |
| The line in a scene: its id, the screenplay line's clip names, voice map, subtitles, the mod `.lipmap` and its ArchiveXL entry | **EDGEquest** | It owns scenes |
| Lip sync on a timeline: the face's lip sync lane, moods and gestures beside it | **EDGEdir** | It puts clips together; it asks EDGEfab for a line's clip |
| Game files: read clip tracks, write the `.anims` | **REDbridge** | Every game file read and write |
| Hearing and watching the line on a character in the game | **REDnode** | The running game |

The tab calls the other tools through their extension APIs and never does their part (docs/tools-together.md, rule 2). Every action is also an MCP tool (`fab_lipsync_*`), as every EDGEfab feature is.

### What the modder sees

**Pick a character, not a head.** Lip sync is stored per line, per speaking character (its voice tag), per scene and per language, and all heads share the same 414 tracks in the same order, so one clip plays on any head. The tab opens on a character (from a scene, an NPC's record, or the command's search), or on a scene's speaker; the head is only the preview, taken from the character's appearance.

| Part of the tab | What it shows | Comes from |
|---|---|---|
| Character | Name, voice tag, head | The scene's actor, or an NPC record and its appearance |
| Lines | Every lip synced line of the character, by scene: text, length, language | The `.lipmap` entries that list the voice tag; each clip name `f_<hex>` gives the line's id, the voice maps its `.wem`, the subtitles its text |
| A line | ▶ the audio; the clip as curves under the waveform: mouth (`LipsyncPoseOutput`), jaw, tongue, envelopes and JALI's controls | The `.anims` tracks (REDbridge), the `.wem` decoded (EDGEwave or REDcode) |
| **Add a Line** | Type the words (and a delivery note); voice it; see and hear the made clip; keep it | Below |
| Tune (later) | Nudge the timing, the strength per mouth part, edit keys on a curve | EDGEfab |
| **Watch in the Game** | The character spawned beside V says the line | REDnode |

A 3D face in the tab needs the head's `.facialsetup` and a solver for it. **Corrected 2026-11-20:** the file is already decoded by WolvenKit and comes through REDbridge as tables; what is missing is the solver, the head as glTF and playback ([R-face](#r-face-the-head-in-the-tab-sized-2026-11-20), about 1 to 2 weeks to a first talking head). Until then the tab shows curves and the game shows the face.

### From a typed line to a clip

| Step | Done by | Automatic? |
|---|---|---|
| 1. The words, in English | The modder | Their input |
| 2. A new line id (a CRUID) | EDGEfab, or EDGEquest when the line is in a scene | Yes |
| 3. The voice: the character's cloned voice speaks the words | EDGEwave, Speak Line | Yes. The modder listens and asks for another take until it sounds right |
| 4. When each letter is spoken | ElevenLabs returns per-character start and end times with the speech when called with timestamps (`/v1/text-to-speech/{voice_id}/with-timestamps`). For Re-Voice (speech to speech) or a recorded line, ElevenLabs' forced alignment takes the audio and the words and returns the same | Yes, from EDGEwave, once it asks for the timings and passes them on (a request to EDGEwave). **Unverified:** that timings come with every model EDGEwave uses (v3 and its tags) and with cloned voices; that `normalized_alignment` covers text ElevenLabs rewrites (numbers) |
| 5. Letters to speech sounds | A pronunciation dictionary (CMUdict, BSD) with rules for unknown words, spread over each word's time | Yes |
| 6. Speech sounds to the game's tracks | EDGEfab's sound model, fitted on the game's own lines (the mouth 60 to 70 ms ahead of the voice, the overrides, the envelopes, JALI's controls) | Yes. **How good it looks is the research** (L4) |
| 7. Brows, eyes, head | The character's own from the game by default; from the voice's pitch and loudness later | Yes |
| 8. The `.anims` | REDbridge imports the made `.anims.glb` with its float tracks (REDbridge #14) | Yes, once #14 imports |
| 9. The `.wem` | EDGEwave's Wwise route | Yes, but **the modder must have Wwise installed**; that is heavy for a non-coder |
| 10. Into a scene: the line, its clip names, voice map, subtitles, the mod `.lipmap` and ArchiveXL entry | EDGEquest | Yes |
| 11. Check | REDnode plays the line on the character | The modder judges |

So the modder types, listens and approves. Everything else can run by itself. A shortcut to keep in view: Azure's speech returns 55 face blend shapes at 60 fps with its audio, but only in Azure's own voices; it could drive the mouth while ElevenLabs drives the sound, with the two time-matched. An option, not the plan.

### Lip sync as a service for other tools

Asked by the owner on 2026-11-17: another tool must be able to run the whole pipeline. EDGEdir's example: on its timeline the modder asks a character to say a line; under the hood EDGEdir hands the words to EDGEfab and gets back a voiced line with its clip, which it places on its lanes. The tab is then one caller of the pipeline among others, not the only way in. Proposed shape, following [Tools working together](https://edgemodders.github.io/EDGEfab/tools-together.html):

| Caller | Calls | Rule |
|---|---|---|
| Another extension in VS Code (EDGEdir, EDGEquest) | `EDGEfabApi.lipsync`, from EDGEfab's `activate()` | Rule 2: an API with `apiVersion`; callers copy the interface and check each member with `typeof` |
| Another tool's core or MCP server (EDGEdir's, or a REDnode package) | `speakLine(bridge, voice, request)` in `@edgemodders/edgefab-core` (already a package, EDGEfab #5) | Rule 1; rule 4: the caller passes its REDbridge in |
| An assistant (Claude Code, EDGEchat, EDGEfab's agent) | MCP `fab_lipsync_speak`, `fab_lipsync_lines` | Rule 3. EDGEdir's server never calls EDGEfab's server |
| The modder | The Lip Sync tab | Uses the same core |

**The request.**

| Field | Meaning |
|---|---|
| `character` | Who speaks: the voice tag (as in a scene's `voicetagId`), with the appearance or head for preview |
| `words` | The line, in English |
| `delivery` | Optional: a direction for the voice ("tired, quiet"), passed to EDGEwave |
| `lineId` | Optional: the caller's line id, when it has already made one (EDGEdir or EDGEquest holding a screenplay line); otherwise EDGEfab makes one |
| `gender` | Optional, for V's lines: `female`, `male` or both (two voices and two clips, `f_` and `m_`) |
| `project` | The REDcode project the files go into |
| `review` | `none`: return when done. `tab`: open the Lip Sync tab on the take, resolve when the modder keeps it or cancels |

**The result: files, plus the facts to place them.** As rule 2 asks, the line is a file on disk that every tab watches, so a change made later in EDGEfab's tab (another take, a timing nudge) redraws EDGEdir's lane by itself.

| Field | Meaning |
|---|---|
| `record` | The line's record, `source/raw/<mod>/lipsync/<voicetag>/<line>.edgefab.json`: everything below, the take and its history |
| `lineId` | The decimal ruid and its 16 hex digits |
| `clips` | Clip names (`f_<HEX>`, `m_<HEX>`) and the `.anims` set each is in (the depot path in the project) |
| `durationMs` | The line's length, for the caller's dialogue line event and lanes |
| `audio` | The WAV, and the `.wem` once EDGEwave's route makes one (`wem: null` and a plain reason until then) |
| `timings` | The per-character timings from ElevenLabs, so a caller can show words on its timeline |
| `take` | Which take this is; the caller can ask for another (`speakLine` again with the same `lineId`) and keep one |

**What it doesn't do.** It doesn't put the line in a scene: the caller places it (EDGEdir on its timeline, EDGEquest in the scene graph), and the scene's owner writes the screenplay line, voice map, subtitles, the mod `.lipmap` and its ArchiveXL entry from the result. That keeps the pipeline usable by any caller, with or without a scene.

**Along the way.** Progress comes back in plain steps (voicing, timing, shaping, writing), and a call can be cancelled. EDGEwave's own rules stay in force when another tool calls: its one-time consent before cloning a voice, the modder's ElevenLabs key in EDGEwave, the cost before paying. A missing piece comes back as a plain reason the caller can show: no ElevenLabs key, no voice for this character yet, Wwise not installed.

**What the voice step needs.** In VS Code, EDGEfab calls `EDGEwaveApi` (v1 exists). Outside VS Code, EDGEfab's core would need EDGEwave's speaking as a package (`@edgemodders/edgewave-core`), with the key taken from the environment as MCP servers do. That is a request to EDGEwave (below).

### A course: phase FL, Lip sync

Proposed steps; the build session decides where they go. Each ends in a test, as every phase does.

| Step | What it builds | Needs first | Its test |
|---|---|---|---|
| **FL0 Checks** (no UI) | L1, the import round trip; ElevenLabs timings on the owner's key (v3, a cloned voice, a line with numbers); Lipsync Animator's baseline scores on a test machine | REDbridge #14's import | A game clip exported and imported back plays the same; timings match the audio |
| **FL1 See** | **EDGEfab: Open Lip Sync** (command, and on a character, a scene's speaker or an `.anims`); the tab: character, lines, ▶ audio, curves under the waveform. MCP `fab_lipsync_lines`, `fab_lipsync_line`. An API for EDGEdir and EDGEquest: a line's clip and its tracks | REDbridge: an `.anims` clip's tracks as data, many at once (`anims.info`/`infoMany`, already asked in #14); `.wem` to WAV (EDGEwave or REDcode) | Angie in `mq306_04b_angie_meeting`: her lines with text, audio and moving curves |
| **FL2 Make** | **Add a Line**: words to voice (EDGEwave), timings, sounds, the sound model v1, the `.anims` into the project. The fitting step: the model fitted on the modder's own game lines, scored by leaving characters out. **The service**: `speakLine` in the core, `EDGEfabApi.lipsync.speakLine`, MCP `fab_lipsync_speak`, with the request, result and line record above | FL1; EDGEwave's timings; REDbridge #14 | Offline: the scores against CDPR's lines, beside Lipsync Animator's. Heard and seen as curves. **EDGEdir's first call**: a line asked for on its timeline comes back as a clip on its lane |
| **FL3 Into the game** | The made line in a scene with EDGEquest (line, voice map, subtitles, `.lipmap`, ArchiveXL) and its `.wem` from EDGEwave; **Watch in the Game** | FL2; EDGEquest's API for a new line; EDGEwave's `.wem` route; REDnode playing a line on a spawned character | **A new line, typed in EDGEfab, spoken in the game with moving lips** (the phase test) |
| FL4 Tune | Timing nudge, strength per part, curve keys; Re-Voice a game line (if a mod `.lipmap` can override a game entry, unverified) | FL3 | The owner tunes a line and sees it in the game |
| FL5 More inputs | Audio2Face-3D and video (MediaPipe on a talking-head video or a webcam) through ARKit's 52 shapes; other languages | FL2's fitting step | A line from video beside the same line from text |
| R-face (research) | Decode the `.facialsetup` poses for a 3D face in the tab (REDcode's viewer) | None | A clip plays on a head in the tab as it does in the game |

### Requests this needs (proposed; not filed)

| Tool | Request | For |
|---|---|---|
| REDbridge | #14 (open): `.anims` import from glTF **keeping float tracks**, and `anims.info`/`infoMany` returning a clip's tracks | FL0 to FL2 |
| EDGEwave | **Filed 2026-11-20 as [EDGEwave #13](https://github.com/Edgemodders/EDGEwave/issues/13)** (`speakLine`, one line with timings, no project needed). Speak Line with ElevenLabs timings (`with-timestamps`), forced alignment for Re-Voice and recorded lines; the timings beside the WAV (its `voice.json`) and through `EDGEwaveApi` | FL2 |
| EDGEwave | The `.wem` route finished (its V2 step 5) | FL3 |
| EDGEwave | Speaking a line as a package, `@edgemodders/edgewave-core` (ElevenLabs speech with timings and its voice clones, the key passed in or from the environment), so EDGEfab's core can voice a line outside VS Code | FL2, for callers outside VS Code |
| EDGEquest | An API to add a voiced line to a scene with given clip names, and to write the mod `.lipmap` and its ArchiveXL entry | FL3 |
| REDnode | Play a scene line (voice and lip sync) on a spawned character; #39 (play an animation on a spawned character) may cover part | FL3 |
| EDGEdir | Nothing of EDGEdir: it calls `EDGEfabApi.lipsync` (reading a line's clip in FL1, `speakLine` in FL2) and places the result. Worth agreeing the request and result shapes with the EDGEdir session before FL2 | FL1, FL2 |

The license boundary holds: ElevenLabs is reached through EDGEwave with the modder's key; Audio2Face, MediaPipe and video services are separate tools or services; WolvenKit only through REDbridge. Whether numbers fitted on the game's lines may ship with EDGEfab, or each modder fits on their own game, is the owner's question.

## Review, and what is built

Reviewed on 2026-11-17 by the EDGEfab build session, with REDbridge 0.14.0 (WolvenKit 10.0.0) on game 2.5. The proposal's shape stands: the owners of each part, a character and not a head, the pipeline as a service. What the checks change:

| Finding | Checked how | What it changes |
|---|---|---|
| **FL1 See waits on nothing.** REDbridge 0.14.0 (2026-11-16, a day before this page, which cites 0.12.1) has `anims.info` (a set's clips, without decoding) and `options.animations` on `project.export` (one clip to glTF). One clip's tracks read in 0.24 s, a second read 0.11 s; a 9-clip set in 0.9 s | Run on `angelica_whelan.anims` | FL1 no longer needs "an `.anims` clip's tracks as data" from #14. Built (below). `anims.info` returning tracks would only save the glTF step |
| **A character is a voice tag id.** The `.lipmap` holds ids, not names; the names are in `base\sound\localization\voicetaglist.voicetags` and Phantom Liberty's under `ep1` (`locVoiceTagListResource`: `id`, `voiceTag`). 806 characters have lip sync in English, all named; `v` has 487 sets, `johnny` 301. A scene can list a character twice, each with its own set (one of V's) | Read from both files and the map | "Pick a character" is a search over voice tags. [NPC faces](faces.html) inferred V is not in the map for its sample scene: V is in most |
| **A line's words, voice file and length come from one call**, `loc.lines` by string id (3.5 s the first time, then 1 ms) | Run on Angie's 9 lines | No reading of voice maps or subtitles in EDGEfab |
| **`LipsyncPoseOutput` is not only the mouth.** In "There you are." (1.63 s) 99 of 414 tracks move: 44 outputs, 30 overrides, 7 controls, 18 plain poses. The outputs are jaw 1, lips 14, tongue 2, **brows 6, eyes and blinks 12, throat and neck 9** | The tab's lanes | Step 7 ("brows, eyes, head: the character's own from the game by default") is wrong for the outputs: a made clip with mouth tracks alone has no brow raise and no blink where the game's clips have them. The sound model must make them (Lipsync Animator makes blinks), or FL2 says plainly it doesn't yet |
| **Keys are sparse**, not one per frame: 1,581 keys on 99 tracks over 50 frames (about 16 a track) | The exported clip | The writer can write sparse keys; the fit should compare sampled curves, not keys |
| **The write step is still closed.** `project.import` turns every GLB into a `.mesh` | REDbridge's source, 0.14.0 (not run) | FL2's last step and L1 wait on #14. Everything before it (voice, timings, the sound model, scoring against the game) does not |
| **The fit needs timings for the game's own lines, and the page gives no local way to get them.** ElevenLabs' forced alignment would mean uploading the game's voice files, against "the game's files stay on the modder's PC" | Reading steps 4 and 6 together | **The owner's call before FL2:** a local aligner (heavy for a non-coder), numbers fitted once and shipped (the open question on shipping fitted numbers), or a fit that needs no alignment (the line's words spread over the voice's loud parts; weaker) |
| A made line has no home before a project: `speakLine` requires `project` | Against the Desk norm (2026-11-02) | Proposed: takes wait on the Desk (`<name>.lipsync.asset`), as props do; `project` optional |
| The Recommendation (audio through Audio2Face first) and the tab's course (words through timings and a sound model first) disagree | Reading | The course is the later decision; Audio2Face and video are FL5 |
| English only, and one `.lipmap` per language | Reading | A made line has lip sync in the languages it is made for; say so in the tab |

**Proposed order:** FL1 (built), then FL0's checks that are open today (ElevenLabs timings; the baseline), then FL2's model and scoring offline while #14's import is asked for, then the write.

**Built 2026-11-17 on the `lipsync` branch, on main since 2026-11-19 (FL1 See, first slice; not released):**

| Part | Where |
|---|---|
| The reading: characters, a character's lines by scene, one clip as curves | Core `src/core/lipsync` (`lipsyncCharacters`, `lipsyncLines`, `lipsyncClip`); exported clips are kept under `%LOCALAPPDATA%\EDGEfab\cache\lipsync` |
| **EDGEfab: Open Lip Sync** | The command asks for a character; the tab lists its lines by scene (12 scenes a page, a scene filter), and a line shows its words, the voice as a waveform (through REDcode's `sound()`), the clip as curves in lanes (jaw, lips, tongue, brows, eyes, throat, controls, head and eye direction, overrides), a playhead, the value under the pointer, the game's track names one click away, and a mouth sketch from the jaw and lip tracks |
| For assistants | MCP `fab_lipsync_lines`, `fab_lipsync_line` |
| Tested | The reading against the game and the MCP tools, automated; the page in a browser with a real clip ([Tests](../testing.html)). **Not yet opened in VS Code; the voice not yet heard** |
| Not built yet from FL1 | Opening from a scene's speaker or an `.anims`; the API for EDGEdir and EDGEquest; other languages in the tab (the core takes `language`) |

## Live lip sync: a line made while the game runs

Asked by the owner on 2026-11-17, for an **NPC conversation mod**: an NPC answers with a line that did not exist a moment before. The voice comes from ElevenLabs while the game runs and plays through REDnode; the NPC's mouth must move with it. This is why lip sync came up at all, so **its key spike (LS1) goes first, and the owner continues down this path only if it bears fruit**. Nothing below was tried in the game.

### What differs from the tab's course

The tab's course ends in files: an `.anims` clip found through a `.lipmap` by the line's id. A line made on the fly has no file, and packing one per line takes seconds and waits on REDbridge #14. So the live route drives the face while the line plays.

| Part | The tab's course (FL2, FL3) | Live |
|---|---|---|
| The voice | EDGEwave, a take the modder approves | A voice package in the game (REDnode's `voice` role, built for EDGEwave's #20), no approval |
| The timings | ElevenLabs, with the speech | The same |
| Words to mouth shapes | Text to speech sounds, placed by the timings, then curves on about 44 tracks | The same first half; then a **sequence of banked mouth shapes** |
| Into the game | An `.anims` and a `.lipmap` in a mod | **Open: LS1** |
| The `.wem` through Wwise | Needed | Not needed: REDnode plays the file (`audio.play` from the package's data folder) |

### What a spoken line needs

Both the words and the voice's timings. Neither is enough alone.

| Input | Gives | Without it |
|---|---|---|
| The words, turned into speech sounds (a pronouncing dictionary, rules for unknown words) | Which mouth shapes, in which order | No shapes |
| ElevenLabs' timings (a start and end per character of the text) | When each shape starts and how long it lasts. A word's sounds are spread over that word's span | Shapes at a guessed pace, off the voice within a second or two |
| The audio's loudness (optional) | How far the jaw opens, where the pauses are | Flatter, still in time |

About 40 speech sounds share about 15 mouth shapes (p, b and m are all closed lips).

### The numbers

Fitting on the game's lines gives **one small set of numbers, not a set per line** (estimated at a few thousand numbers, a few KB; nothing is fitted yet):

| Numbers | What they are | Used by |
|---|---|---|
| The shapes | For each mouth shape, how far each lip sync track moves | The tab's course as curves; live as the bank |
| The timing behaviour | How early a shape starts before its sound (the game's mouth leads by 60 to 70 ms), how long shapes blend, which shapes give way to their neighbours, how loudness scales the jaw | Both |
| Per rig | Likely one set for the man's head rig and one for the woman's | Both |
| Per character (optional) | A small adjustment for one character's way of speaking, fitted on the modder's PC from that character's lines; never shipped | Later |

**The working assumption for the timings question** (the Review's open call; proposed, not decided): fit once on our machine with a local aligner and ship the numbers. The game's lines are only the examples; their timings are used once and thrown away, and the modder never installs an aligner. The numbers come from the game's animation data as averages over thousands of lines; whether they may ship stays the owner's call. For the spikes the shapes are made by hand, so nothing waits on the fit.

### Ways onto a live face

Read on 2026-11-17 from REDnode's type dump of game 2.5 and, through REDbridge, the face graph `woman_average_sermo.animgraph` (it reads as JSON in 1.8 s).

| Fact | Consequence |
|---|---|
| The game's script calls on a character's animation controller: `SetInputFloat(name, value)`, `SetInputInt`, `SetInputBool`, `ApplyFeature`, `PushEvent`. No call plays an animation by name | A script can feed numbers to a graph; it can't hand it a clip |
| The face graph already takes inputs: 10 float inputs (`facialKeyWeight`, the eyes' `blendWeight`), 16 int inputs (`FacialReaction`'s `category` and `idle`), 8 bool inputs | Inputs do reach the face graph in the game's own use. **Unverified** that `SetInputFloat` on a spawned NPC reaches the `face_rig` component's graph |
| The graph already changes float tracks by name: 5 `animAnimNode_FloatTrackModifier` (Override, on neck tracks) and a `animAnimNode_TrackSetter`. A modifier takes a track name, an operation (Override, Multiply, Add, ...) and a float link | A new input wired to a modifier on a lip sync track is made of node types the graph already uses |
| `animAnimNode_SkFrameAnim` plays an animation at a time, frame or progress given by a float link | One number could pick a mouth shape out of a banked clip |
| Scenes play facial clips through one `animAnimNode_FacialMixerSlot` | The scene route; no script call fills it |
| REDnode plays a workspot on a spawned character and jumps to a clip in it (its A2, built) | A second way to play banked clips, if a workspot's clip can move the face (**unverified**) |
| REDnode's `audio.play` takes a file the package writes while it runs; sound at a character's position is not built yet | The spike's voice is heard flat, not from the NPC |

| Route | How | Needs | For |
|---|---|---|---|
| **A. Inputs into the face graph** | A mod's copy of the face graph gains float inputs wired to the lip sync tracks; a script sets them many times a second | A changed `.animgraph` in a mod archive (it replaces the game's, so other mods changing the same graph conflict); a script that ticks | True live, any line. **The key spike** |
| B. A workspot of mouth-shape clips | Banked clips in a `.workspot`, jumped through in time | Made `.anims` (REDbridge #14); a workspot that moves the face | The fallback; coarser, and it takes the body's workspot |
| C. A file per line | Write the `.anims`, pack, hot load | #14; seconds per line | Lines prepared ahead; this is FL3 |

### The spikes

Smallest first within each; LS1 decides the path. LS3 and LS4 need no game and can run beside it.

| Spike | Question | Steps | Passes when |
|---|---|---|---|
| **LS1 The jaw on command** (the key spike; in the game) | Can a script move a live NPC's mouth? | 1. Barks: `PlayVoiceOver` on an NPC spawned by REDnode; do the lips move outside a scene? 2. A test archive with the women's face graph changed: one float input, `edgefab_jaw`, into a `FloatTrackModifier` on `jaw_mid_openLipsyncPoseOutput`, before the `Sermo` node. 3. A REDnode test app sets the input on a spawned woman: 0, 1, then a slow wave. 4. The same at 30 changes a second: is it smooth, and what does it cost? | The jaw follows the number, smoothly. **If not:** try the override weights and `lipSyncEnvelope` beside it, the input as an anim feature, then route B's workspot. If none moves the face, the live path stops and lines are prepared ahead (route C) |
| LS2 Whole shapes from few numbers (in the game, after LS1) | How does a mouth shape, about 44 tracks, reach the graph cheaply? | Compare: one input per track; one input per shape, the shape's weights as constants in the graph; a banked clip read by `SkFrameAnim` with two readers and a blend (three numbers a frame; the clip can be a game clip's frames for the spike, a made one needs #14) | Twelve shapes shown one after another on the NPC, blended, at a cost that holds with several NPCs talking |
| LS3 Voice and timings in time (no game) | How long from words to sound, and are the timings right? | ElevenLabs `with-timestamps` on the owner's key, a fast model, a 2 to 3 second line, plain and streamed; the timings laid over the waveform; a line with a number in it; an instant clone of a voice the owner has rights to | The delay to the first sound and to the whole line, measured; timings within about 50 ms of the audio by eye |
| LS4 Words to a shape schedule (no game) | Does text and timings give a believable sequence? | In core: words to speech sounds (CMUdict, BSD, with rules for unknown words), spread over each word's span, mapped to about 15 shapes made by hand from the track names, with the lead and blends; shown in the Lip Sync tab's lanes and mouth sketch under LS3's audio | The sketch reads as the line when played with the audio |
| **LS5 An NPC says a typed line** (in the game; the phase test) | The whole path | A REDnode test app: type a line; ElevenLabs speaks it; `audio.play`; LS4's schedule drives LS2's inputs on a spawned NPC | The owner sees the mouth move in time with a line that did not exist before, and judges the delay and the look |

**Built for LS1, 2026-11-17 (not run in the game):** the test archive's builder (`npm run lipsync:jaw --workspace extensions/edgefab -- <outFolder>`: the women's face graph with three numbers added to the jaw's lip sync track, the lip sync envelope and the jaw's override weight, each settable by `SetInputFloat` and through an anim feature) and a REDnode test app (`tools/spikes/ls1-jaw`: spawn, bark, the numbers, a wave at 10 and 30 changes a second). Found while building: the graph round trips through REDbridge's JSON with new nodes; a graph's inputs with a group read an **anim feature** declared in the graph (name and class), so the second way in uses a game class with three floats under a new feature name. The steps are on the [Tests](../testing.html#spike-ls1-the-jaw-on-command) page.

**LS1 passed in the game on 2026-11-20** ([Tests](../testing.html#spike-ls1-the-jaw-on-command)). What it settles:

| Finding | Meaning |
|---|---|
| A number set through an **anim feature** the graph declares moves the jaw of a spawned NPC; `SetInputFloat` does nothing | Route A works. The way in is `ApplyFeature` with a feature class's fields, not loose inputs. A feature class limits how many numbers one call carries (the spike's has three floats) |
| 0.5 opens the mouth about half as far as 1 | The tracks can be driven in proportion, which mouth shapes need |
| The jaw's lip sync track works alone; the envelope changed nothing seen | No switch to hold open while speaking |
| The game's own bark moved her lips | The game's lip sync runs on a spawned NPC outside a scene; the numbers add to a working face |
| A change costs about 50 ms from a REDnode Node mod, so about 13 changes a second at most; the wave still looked fine | One track at speech pace is within reach. A whole mouth shape, many tracks, is not, a call per number: LS2's question, now the main one |

**For LS2, from this:** send few numbers, seldom, and let the graph do the rest. The graph has nodes that smooth a number over time (`animAnimNode_DampFloat`, `animAnimNode_FloatInterpolation`), so shape weights sent about 10 times a second could be eased inside the graph; and a shape's many tracks can be constants in the graph scaled by one number. A feature class with more floats, or several features, carries more shapes per call (to look up). Asked of REDnode after LS2 if still needed: a feature applied in one call, or numbers set each frame on the game's side.

**The bar is above the game's barks (owner, 2026-11-20).** Watching the bark again, the owner found some of the game's own lip sync a poor match for what an English speaker's lips do, and hopes made lines can do better. A fit copies its examples, so numbers fitted on every line would land at the game's average. Proposed: the shapes come from how each sound is formed (closed lips for p, b, m; teeth on lip for f, v; rounded for oo, w), checked against the game's best lines (main characters in main quests) and not its crowd barks; the fit gives the timing behaviour only. LS4's test is then judged against the sound, not against the game's clip. **Unverified:** that main characters' lines are better than barks; the tab can show both side by side.

**Built for LS2, 2026-11-20 (not run in the game):** 13 mouth shapes made by hand in core (`src/core/lipsync/shapes.ts`, with the feature's slots), the archive's builder (`npm run lipsync:shapes --workspace extensions/edgefab -- <outFolder> [speed]`) and the test app `tools/spikes/ls2-shapes` (each shape, every shape in turn, and "Hello there, how are you" as a hand-timed sequence without sound). One feature carries all 13 numbers, eased in the graph. Steps on the [Tests](../testing.html#spike-ls2-mouth-shapes) page.

**Order:** LS1 steps 1 to 3 first. LS3 and LS4 beside it. LS2 and LS5 only after LS1 passes.

### Open, and who owns it

| Point | State |
|---|---|
| Whose voice | Instant cloning of a game character uploads that actor's voice to ElevenLabs, and ElevenLabs asks for rights to the voice. The modder's own or a licensed voice has no such problem. EDGEwave's consent rule covers cloning; the conversation mod's owner decides. **Decided by the owner, 2026-11-21:** no more game audio sent to ElevenLabs. A character's voice is one of ElevenLabs' own, or one designed from a description of the character (EDGEwave's suggestion); a clone of the character's lines was tried once and is not the route |
| Brows and blinks | The game's lip sync clips carry them (Review). Live, the face's own idle keeps blinking; brows on stressed words can come from loudness later |
| Other heads | Men's graphs and the big and fat bodies' need the same change; V's and Judy's use other graphs. LS1 uses a crowd woman |
| The graph as a mod | Route A replaces game files. An ArchiveXL way to add to a graph without replacing it is **unverified** |
| Who builds what | EDGEfab: the shapes, the numbers and the scheduler, as a function in `@edgemodders/edgefab-core` that a REDnode Node mod calls (as EDGEbuilder calls the core). The conversation mod: the voice, the talk, the ticking. REDnode: setting graph inputs each frame without a call per number, and sound at a character's place (requests, after LS1) |
| The ElevenLabs key in a spike | The product goes through EDGEwave or the game's voice package. LS3 reads `ELEVENLABS_API_KEY` from the environment and spends a few credits of the owner's |

## R-face: the head in the tab (sized 2026-11-20)

The owner asked on 2026-11-20 whether the tab will show the character's head speaking, and to bring the research forward. A side agent sized it the same day (read-only; game 2.5, REDbridge 0.16.0). **Confirmed** means run or seen in the data; **read** means from WolvenKit's source or its Blender add-on (both GPL: facts only, no code taken); the rest is marked.

**The decode is already done.** WolvenKit parses a `.facialsetup`'s three buffers, so `cr2w.toJson` returns them today as tables: "pose N moves bone B by this rotation and translation" (confirmed on 7 files, 0.2 to 1.3 s each). This page's and [NPC faces](faces.html)' "binary data no tool reads yet" was wrong. What is left is building, not reverse engineering.

| Fact | Value | Mark |
|---|---|---|
| Facial setups in the game | 406: 400 full (about 400 KB each, 14.7 MB as JSON), 6 light crowd ones | Confirmed |
| A head's rig | 344 bones, 414 tracks | Confirmed |
| The 414 tracks | 13 envelopes, 141 main pose weights, 86 override weights, 141 lip sync outputs (the main poses' order), 33 wrinkles | Confirmed |
| Every full head | The same counts: face 121 poses and 255 correctives, tongue 18 and 4, eyes 12; only the transforms differ | Confirmed on 6 |
| A pose | A list of bone changes: a rotation, a translation, the bone; small steps from the rest pose | Confirmed (sizes exact, every rotation a unit quaternion, bones inside the rig) |
| The rules table | Which track is which pose, limits under lip sync, poses that reduce others, upper or lower face, left or right, in-betweens (the jaw has a half-open one), correctives and their parents, wrinkles | Layout read; most meanings confirmed by the names |
| `jaw_mid_open` applied to the rig | The jaw turns 20 degrees, the lower lip's middle drops 2.5 cm, the upper lip stays: an open mouth | Confirmed, as numbers (no picture yet) |

**How tracks become a face** (read from the Blender add-on's solver, new on 2026-11-07, which says it follows the game's `Sermo` node; **not checked against the game**), in short: each main pose's weight is its track, clamped; under lip sync some are capped by limits that `jaliJaw` and `jaliLips` move; poses reduce other poses; `upperFace` and `lowerFace` scale their halves; **an override weight scales the acting on its pose while `lipSyncEnvelope` is up, then the pose's lip sync output is added and clamped**; in-betweens and correctives follow from the weights; the bones get every active pose's change on top of the rest pose. Not covered by anyone: the left and right lip sync envelopes, `faceEnvelope`, `antiStretch`, pose scales (pupils, tongue thickness).

| Step to a head in the tab | Work | Effort (the agent's estimate) |
|---|---|---|
| Read a head's setup | `cr2w.toJson`, kept compact | Hours |
| EDGEfab's own solver in core | The rules above, with tests on numbers | 2 to 4 days |
| The head as glTF | `project.export` of the head's meshes on the head rig (several meshes: head, eyes, teeth, lashes). **Not tried: the least known step** | 1 to 3 days |
| Playback | Solve each frame, write the bones as a plain glTF animation, play it in REDcode's viewer with the sound | 2 to 4 days |
| **A first talking head** | | **1 to 2 weeks** |
| As in the game | The mood under the line, wrinkles, pupils, every body type | Open-ended; by need |

| Hard part | State |
|---|---|
| **License: the owner's call.** The only solver in public is GPL (the Blender add-on). EDGEfab is MIT | Write EDGEfab's own from the rules as described here (no code read into it), or run the solve in a GPL process, as REDbridge is. Proposed: its own |
| Nothing gives the game's bones for a set of tracks | "Right" is judged by eye beside the same line in the game |
| The head's export | Not checked that every head mesh comes out on the 344-bone rig with weights a web viewer plays |

**The smallest proof** (half a day, no solver): export the sample head with its rig, apply `jaw_mid_open` at 1 by the plain rule, and open it in REDcode's viewer: an open mouth. Then one frame of a real line beside the game.

**Decided by the owner, 2026-11-20:** EDGEfab writes its own solver, and **the talking head in the tab comes first**, since it is how a modder judges lip sync; then the rest of the editor. **The editor's main use, the owner's goal:** type a new line's words, EDGEwave makes the voice with ElevenLabs behind the scenes, and the new audio and its lip sync play on the head.

**Built 2026-11-20 (first slice; not yet opened in VS Code):**

| Part | Where |
|---|---|
| The solver: 414 track values in, the bones out | Core `src/core/lipsync/faceSolve.ts`, EDGEfab's own, written from the rules above in plain words; no GPL code was read into it. Pure, so the tab's page runs the same file. Left out for now: the left and right lip sync envelopes, `faceEnvelope`, `antiStretch`, pose scales, levels of detail. Limits and the kinds of influence are as described, not checked against the game |
| A head from the game | Core `src/core/lipsync/face.ts`: `headModel` by the face rig a lip sync set names (the head's folder holds its meshes and setup) or by appearance; the setup in the solver's shape; each mesh as a GLB on the face rig, without materials; kept under `%LOCALAPPDATA%\EDGEfab\cache\lipsync\heads` |
| The head in the tab | `src/webview/lipsyncHead.ts` (three.js, bundled to `dist/webview/lipsyncHead.js`, 585 KB): the head in place of the mouth sketch, posed at the playhead every frame, turned by dragging. A line shows the head it was made on |
| Tested | The reading and the solver against the game; the page in a browser with a real line ([Tests](../testing.html#the-head-in-the-lip-sync-tab-without-vs-code)) |
| Not yet | Textures and eyes that look like eyes, hair, the mood under a line, the clip's own bone keys (head and neck), wrinkles; a head by character when no line is open |

**Add a Line, built 2026-11-20 (first version; the real voice not yet through it):** a box in the tab takes the words; EDGEwave's `speakLine` ([EDGEwave #13](https://github.com/Edgemodders/EDGEwave/issues/13), on its main) gives the WAV and when each letter is spoken; core `speech.ts` turns the letters into mouth shapes by spelling rules and a short list of common words (each letter has its own time, so no pronouncing dictionary and no aligner), then into the game's lip sync tracks as a clip the head plays. **New Take** asks again. MCP `fab_lipsync_make` does the same from timings. Nothing is written into a project yet. Version 0: the shapes and rules are by hand, to be judged on the head.

**More detail than letters can give (owner, 2026-11-20):** the owner finds some of the game's own lines stiff on certain syllables and asked for a service that gives detailed lip movement from an audio clip. ElevenLabs gives timings only (its forced alignment takes audio and words and returns times). NVIDIA's Audio2Face-3D gives 52 face shape values a frame from audio alone, locally or as a service; mapping them to the game's tracks is this page's long pole, now judgeable on the head beside the game's own clip. **Decided by the owner, 2026-11-20: it moves up, right after Add a Line.** The game's lip movement is fine, but some words don't read well, and the owner wants to know sooner rather than later whether audio-driven shapes do better. So it is a spike first (**A2F**): one game line's own voice through Audio2Face, its shapes mapped by hand to the game's tracks, played on the head beside the game's clip for the same line. Unverified today: its current terms and setup; a side agent is sizing it.

**For live lip sync, from the same rules:** the lip sync output is added to the acted face and clamped at 1, which fits LS1 (the jaw's output alone opened the mouth). A pose's limit applies only while `lipSyncEnvelope` is above 0, so leaving the envelope at 0 keeps the shapes uncapped. Half-open in-betweens and correctives come for free from the game's solver. A made shape can also be previewed on the head offline once the solver exists, without starting the game.

## A2F: finer mouth movement from audio (sized 2026-11-21)

The owner's question (2026-11-20): can a service give more detailed lip movement from an audio clip than the game's own, which is stiff on some words? Moved up to right after Add a Line, as a spike. A side agent sized it on 2026-11-21 (read-only: nothing installed, signed up for or called). **Read** means from NVIDIA's pages; **confirmed** means run on the owner's PC; the pairings are proposals.

**How Audio2Face-3D is run**

| Way | What it takes | Fit |
|---|---|---|
| **The container (NIM 2.0), on the PC** | Docker in WSL2 with the GPU, a free NVIDIA NGC account and key to pull the image, NVIDIA's Python sample client. `python3 a2f_3d.py run_inference <line.wav> config/config_james.yml -u 127.0.0.1:52000` writes `animation_frames.csv` (read) | **The spike's route.** Local, so a game voice line stays on the PC. The owner's RTX 4090 has a ready profile (read); Docker 29.9.3, WSL2 with Ubuntu and the driver are there (confirmed). NVIDIA's 2.0 pages name only Ubuntu 24.04; WSL2 was last documented for 1.2 |
| NVIDIA's hosted service | An NVIDIA account and key, a Python client; no GPU | Uploads the audio: only for audio the modder made (a line from Add a Line), not a game line. Price and allowance not found |
| The open-source kit (SDK, MIT) | Built from source on Windows: Visual Studio, CUDA 12.9, TensorRT 10.13, and our own C++ to get shape values out (its samples only count frames) | 2 to 3 days before the first number. The route a modder could use later, as a helper beside the models (the model licence allows commercial use and redistribution, read) |

| Fact | Value | Mark |
|---|---|---|
| Audio in | WAV, mono, 16-bit, 16 kHz advised | Read |
| Out | ARKit's 52 face shapes, plus 16 tongue shapes when enabled, **30 frames a second (the game's rate)** | Read |
| Not in it | Eye direction and head movement (always 0) | Read |
| A trap | Its `MouthClose` includes jaw opening, so closed lips (p, b, m) need tuning | Read |
| Values | Not bounded unless clamping is on; per-shape multipliers | Read |

**The mapping, by hand** (proposals, none tried on the head). The big speech shapes all have a partner among the game's 141 lip sync poses: `JawOpen` to `jaw_mid_open`, `MouthFunnel` to `lips_*_funnel`, `MouthPucker` to `lips_*_purse`, `MouthClose` to `lips_together_*`, the upper and lower lip, the corners, the tongue tip. The game's finest lip poses have none (sticky corners, sharp corners, lip puff). So the spike can show whether Audio2Face's **timing and choice of shape** read better on words; it cannot add lip detail the game's rig only reaches in its own clips. The full table is in the agent's report, kept in this session's notes; it goes in core with the spike.

**The spike (about a day, half of it setup):**

| Step | Work |
|---|---|
| 1 | The owner makes a free NGC account and key (kept in WSL's environment, never printed) |
| 2 | Docker sees the GPU in WSL; pull and start the container. **Most of the risk** (1 to 3 hours) |
| 3 | Two or three game lines the owner finds stiff, and one that reads well, as WAV (mono, 16 kHz) |
| 4 | Run the sample client, clamping on; read the CSV |
| 5 | CSV to the tab's clip through the hand table (2 to 4 hours) |
| 6 | On the head beside the game's own clip for the same line; the owner judges the words agreed beforehand |

**A quicker first look, if the owner accepts a sign-up:** the hosted service on a line voiced through Add a Line (the modder's own audio), beside today's letter-based version of the same line. About two hours, no Docker. It answers "better than letters", not "better than the game".

**Run 2026-11-21: it works on the owner's PC** ([Tests](../testing.html#spike-a2f-audio2face-against-the-games-clip)). The container starts in about a minute; a line takes seconds; the output is a CSV, 30 frames a second from 0, columns `blendShapes.<name>`. Core `src/core/lipsync/arkit.ts` maps it by hand to the game's tracks, and the tab now offers **other versions of a line's lip sync** beside the game's (clips under the cache's `versions\<clip name>\`), on the same voice and head. Four of Panam's lines are there as "Audio2Face" (scaled to the game's range) and "Audio2Face, full strength". In numbers it is in time with the game's clip and a different performance (jaw r 0.25 to 0.64), stronger than the game, and weak on closed lips. **Whether it reads better is the owner's look, not yet had.**

**What could make it fail:** the container under WSL2 (undocumented for 2.0); the driver reports CUDA 13.5 where the pages ask for below 13.0; closed lips wrong until `MouthClose` is tuned; amplitudes solved for NVIDIA's own faces; it hears sound only, so it may smear consonants the game's clips hit. **Not verified:** the hosted service's terms on uploaded audio, its price, the CSV's columns, whether the container runs with no network after its first start.

## Sources

- JALI and Cyberpunk: [80.lv, a new look at JALI](https://80.lv/articles/cyberpunk-2077-a-new-look-at-jali-tech-for-facial-animation); [TechSpot](https://www.techspot.com/news/87205-cd-projekt-red-used-ai-lip-sync-cyberpunk.html); [JALI research page](https://www.dgp.toronto.edu/~karan/jali/index.html); [JALI at Annecy 2025](https://www.gamedeveloper.com/press-release/jali-inc-returns-to-annecy-2025-to-showcase-next-gen-automated-facial-animation-tools-and-workflows)
- Community tools: [Lipsync Animator on GitHub](https://github.com/andreaolivato/cyberpunk2077-lipsync-animator) (its `docs/face-tracks.md`); [on Nexus](https://www.nexusmods.com/cyberpunk2077/mods/36187); [lipsync.tools](https://lipsync.tools/); RED modding wiki, [Generating vanilla lipsync animation sets](https://wiki.redmodding.org/cyberpunk-2077-modding/modding-guides/quest/generating-vanilla-lipsync-animation-sets)
- Audio to face: [Audio2Face-3D paper](https://arxiv.org/abs/2508.16401v1); [Audio2Face-3D SDK](https://github.com/NVIDIA/Audio2Face-3D-SDK); [NIM release notes](https://docs.nvidia.com/ace/audio2face-3d-microservice/2.0/text/changelog.html); [NGC catalog](https://catalog.ngc.nvidia.com/orgs/nim/teams/nvidia/containers/audio2face-3d); [MetaHuman audio-driven animation](https://dev.epicgames.com/documentation/metahuman/audio-driven-animation); [Speech Graphics, 80.lv](https://80.lv/articles/a-deep-dive-into-speech-graphics-facial-animation-solutions)
- Video to face: [MediaPipe Face Landmarker](https://developers.google.com/edge/mediapipe/solutions/vision/face_landmarker); [MetaHuman animation from mono video](https://dev.epicgames.com/documentation/metahuman/animation-from-mono-video); [DeepMotion face tracking FAQ](https://deepmotion.com/post/animate-3d-face-tracking-faq); [QuickMagic face mocap](https://www.quickmagic.ai/tools/face-mocap-ai); [Video2ARKitBlendshapes](https://github.com/hillday/Video2ARKitBlendshapes)
- Timings with speech: [ElevenLabs, convert with timestamps](https://elevenlabs.io/docs/fr/api-reference/text-to-speech/convert-with-timestamps.md); [ElevenLabs, streaming with timestamps](https://elevenlabs.io/docs/api-reference/streaming-with-timestamps); [ElevenLabs forced alignment (fal.ai listing)](https://fal.ai/models/fal-ai/elevenlabs/forced-alignment/api); [Azure, facial position with viseme](https://learn.microsoft.com/azure/ai-services/speech-service/how-to-speech-synthesis-viseme)
- Talking-head video: [VEED, best talking head APIs 2026](https://www.veed.io/learn/best-talking-head-video-apis); [VEED, best lip sync API](https://www.veed.io/learn/best-lipsync-api); [HeyGen, talking head APIs](https://www.heygen.com/blog/best-talking-head-video-apis); [Hedra, AI lip sync](https://mkt.hedra.com/uses/ai-lip-sync)
