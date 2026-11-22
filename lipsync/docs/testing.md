# Lip sync tests, as EDGEfab's testing.md had them

Moved from EDGEfab's docs/testing.md on 2026-11-22. Paths and commands are EDGEfab's (`npm run lipsync --workspace extensions/edgefab`); they become REDcode's when the editor is wired in.

## FL1: lip sync, reading the game (without VS Code)

For the Lip Sync tab's first slice ([Made lip sync](lipsync.html), "Review, and what is built"). Needs the game (2.5) and REDbridge 0.14.0 or later. Not a test of a released build.

1. `npm run build`, then `npm run lipsync --workspace extensions/edgefab`. It starts REDbridge, lists the characters, reads Angie's lines in `mq306_04b_angie_meeting`, reads the clip of "There you are." and V's first three scenes. **Expected:** every line `ok`, then `ok`.
2. The MCP server: `fab_lipsync_lines` with `find: "jud"`, then with `character: "angelica_whelan", scene: "mq306_04b"`; `fab_lipsync_line` on its first line with `tracks: ["jaw_mid_openLipsyncPoseOutput"], every: 30`. **Expected:** judy; 9 lines, the first "There you are."; 99 moving tracks, the jaw with its keys and 49 samples.
3. The page, in a browser: the tab's HTML with the clip from step 1 (`-- <outFolder>` writes `lines.json` and `clip.json`) sent to it as the extension would. **Expected:** the lines listed, the curves in lanes, the track table with Track names, the value under the pointer.
4. **In VS Code (not run):** **EDGEfab: Open Lip Sync**, pick a character, pick a line. **Expected:** the voice as a waveform, Play plays it with the playhead over the curves, Change Character, Show More Scenes, the scene filter.

| Run | Result |
|---|---|
| 2026-11-17, REDbridge 0.14.0, game 2.5 | Steps 1 to 3 **pass**. Step 1: 806 characters, all named (v 487, johnny 301, panam 84); lines in 2.6 s (the game's line index loads once), a clip in 0.24 s, again in 0.11 s; 99 of 414 tracks move (lipsync 44, override 30, control 7, pose 18). Found and fixed: a scene can list a character twice (V), so the lines missed a set the count had. Step 3: Play in the browser was not timed (a background tab). Step 4 not run |

## Spike LS1: the jaw on command

The key spike of live lip sync ([Made lip sync](lipsync.html#live-lip-sync-a-line-made-while-the-game-runs)): can a script move a live NPC's jaw? It decides whether the live course goes on. Needs the game (2.5), REDbridge, REDnode with Codeware. Not a test of a released build.

**What is tested.** A test archive replaces the women's face graph (`woman_average_sermo.animgraph`) with a copy that has six new nodes before the pose solver (`Sermo`): each adds a number to one track. At rest every number is 0, so the face should look as it always does.

| Track | Set with `SetInputFloat` | Or through the anim feature `edgefab_lipsync` (the game's `AnimFeature_Bump` class) |
|---|---|---|
| `jaw_mid_openLipsyncPoseOutput` | `edgefab_jaw` | `direction` |
| `lipSyncEnvelope` | `edgefab_envelope` | `source` |
| `jaw_mid_openAnimOverrideWeight` | `edgefab_override` | `intensity` |

1. `npm run build`, then `npm run lipsync:jaw --workspace extensions/edgefab -- <outFolder>` (a folder outside the repo). **Expected:** every line `ok`, then `ok`; `<outFolder>\tests\edgefab_ls1_jaw.archive` (about 20 KB).
2. Put `edgefab_ls1_jaw.archive` in the game's `archive\pc\mod` folder (with the game closed). In REDnode's Settings add `tools\spikes\ls1-jaw` of this repo as a development folder. Start the game, load a save, stand somewhere quiet. Start REDnode's Test timer.
3. **The control:** look at women in the street. **Expected:** faces as always (talking, blinking). A crash on load or frozen faces means the changed graph is at fault: remove the archive and say so.
4. Switch on **EDGEfab spike LS1** in the Mod Manager. **Spawn the person**. **Expected:** a woman stands facing V; the log says her `face_rig` was found.
5. **Say it** (the bark). Say whether her lips move with the line.
6. Under **3. Inputs**: **jaw 1**, then **jaw 0**. If nothing moves: **envelope 1**, then **jaw 1** again; then **override 1**, then **jaw 1**. Say what the mouth does at each press.
7. If step 6 moved nothing: **All to 0**, then the same presses under **4. The same through an anim feature**.
8. With a way that moved the jaw: **10 a second**, then **30 a second**, then **Stop the wave**. Say whether the jaw opens and closes smoothly; the log gives the time per change.
9. **Remove**, switch the app off, close the game and take the archive out.

**Passes when** the jaw follows the number (step 6 or 7) and the wave is smooth at 30 a second (step 8). If nothing moves the jaw, the spike's next tries are in the plan (the input placed elsewhere in the graph, then a workspot of mouth-shape clips).

| Run | Result |
|---|---|
| 2026-11-17, REDbridge 0.14.0, game 2.5 | Step 1 **passes**: the graph reads as JSON, takes 12 new nodes (475 to 487) and a declared feature, writes back (56,552 bytes), reads back with the new nodes wired as written, and packs (20,480 bytes). The test app is written from REDnode's Animation test and the game's type dump and **has not run in the game**. Steps 2 to 9 not run |
| 2026-11-20, in the game (the owner; REDbridge 0.16.0's archive from the run above, the app from REDnode's apps folder; the app's log read by Claude) | **Pass.** The app ran first time. **Say it:** she spoke a line and her lips read it, so the game's lip sync runs on a spawned NPC outside a scene. **`SetInputFloat` moved nothing**, with the envelope and the override at 1 too. **The anim feature moved the jaw:** 1 an open mouth (not a yawn), 0.5 about half, 0 closed; the envelope made no difference seen (the override not tried this way). **The wave** (through the feature, after the app's wave buttons were changed to use it: 0.2.0) opened and closed at 10, 20 and 30 asked changes a second; 10 a little choppy, 30 better, fine for the most part. **The cost: 46 to 51 ms a change** (making the feature and applying it are two calls, each answered a frame or two later), so 20 asked gave about 13 a second and 30 asked about 13 too (187 of 467 skipped). The control (street faces as always) was not reported either way |

## Spike LS2: mouth shapes

After LS1 ([Made lip sync](lipsync.html#live-lip-sync-a-line-made-while-the-game-runs)): can a whole mouth shape, many tracks, be shown from one number, and do shapes in a row read as speech? Needs the game (2.5), REDbridge, REDnode with Codeware. Not a test of a released build.

**What is tested.** The test archive replaces the women's face graph with a copy that holds 13 mouth shapes made by hand (core `src/core/lipsync/shapes.ts`, version 0: aa, eh, ee, oh, oo, mbp, fv, th, tdn, kg, sz, sh, r). Each shape is one number in the anim feature `edgefab_mouth` (the game's `AnimFeature_FPPCamera` class, for its many floats); the graph eases the number (a damp node, 14 units a second) and adds it, times a weight, to each of the shape's lip sync tracks (56 weights in all). One call carries every shape. It replaces the same game file as LS1's archive, so only one of the two is in the game at a time.

1. `npm run build`, then `npm run lipsync:shapes --workspace extensions/edgefab -- <outFolder>` (a folder outside the repo). **Expected:** every line `ok`, then `ok`; `<outFolder>\tests\edgefab_ls2_shapes.archive`.
2. With the game closed: take `edgefab_ls1_jaw.archive` out of the game's `archive\pc\mod` and put `edgefab_ls2_shapes.archive` in; the app `tools\spikes\ls2-shapes` into REDnode's apps folder as `edgefab-ls2-shapes` (or as a development folder). Start the game, load a save.
3. **The control:** women in the street. **Expected:** faces as always.
4. Switch on **EDGEfab spike LS2**, **Spawn the person**.
5. Press each shape's button in turn, then **Rest**. For each, say whether the mouth looks like the sound on the button (and which look wrong, too strong or too weak).
6. Switch on **As sent** and press a few shapes: say whether the change is a snap now, and a glide with it off.
7. **4 a second**, then **8 a second**, then **Stop**. Say whether the shapes flow into each other.
8. **Say it** ("Hello there, how are you", no sound), then **At half speed**. Say whether it reads as someone speaking.
9. **Remove**, switch the app off.

**Passes when** most shapes look like their sounds, the easing shows, and the line reads as speech. The shapes are a first guess: which ones are wrong is the result that matters.

| Run | Result |
|---|---|
| 2026-11-20, REDbridge 0.16.0, game 2.5 | Step 1 **passes**: 13 shapes, 56 pose weights, 298 new nodes (475 to 773), the graph 79,225 bytes, the archive 24,576. Found: a new node's `$type` must be its first key or WolvenKit's reader refuses the file; a value used in several places is written once and pointed at (13 damp nodes, not 56). The damp and math nodes are new to this graph (none to copy), so their fields are from the type dump: **untried in the game**. The app has not run. Steps 2 to 9 not run |

## The head in the Lip Sync tab (without VS Code)

For the talking head ([Made lip sync](lipsync.html#r-face-the-head-in-the-tab-sized-2026-11-20)): a head read and exported from the game, EDGEfab's own face solver, and the head in the tab's page. Needs the game (2.5) and REDbridge 0.16.0 or later.

1. `npm run build`, then `npm run lipsync:face --workspace extensions/edgefab`. It reads a crowd woman's head (parts, facial setup, meshes as glTF on the face rig), runs the solver on numbers, solves every frame of "There you are." and reads a man's head. **Expected:** every line `ok`, then `ok`.
2. The page, in a browser: the tab's own HTML with the head viewer's script, the clip of "There you are." and the head its lip sync set's rig belongs to, sent as the extension would. **Expected:** the head shows in place of the mouth sketch; with the playhead in the middle of the line the mouth is open.
3. **In VS Code (not run):** **EDGEfab: Open Lip Sync**, pick a character and a line. **Expected:** the head shows beside the curves within a few seconds, moves with the voice on Play, turns when dragged; another character's line brings that character's head.

| Run | Result |
|---|---|
| 2026-11-20, REDbridge 0.16.0, game 2.5 | Steps 1 and 2 **pass**. Step 1, 24 checks: 344 bones and 414 tracks; face 121 poses and 255 correctives, tongue 18, eyes 12; the jaw's lip sync output at 1 turns the jaw bone 20.0 degrees, 9.4 at 0.5 (the half-open in-between), 4.7 at 0.25; the upper and lower face, the override weights and the correctives act as the rules say; 0.04 ms a solve; the jaw opens up to 9.4 degrees in "There you are."; a head 1 s the first time, 0.6 s from the cache; the man's head has the same tracks. Before it, by eye: `jaw_mid_open` on the exported head is an open mouth, front and side. Step 2: the clip names the rig of the head it was made on (`h0_019_wa_c__young`), and that head's meshes and setup are found from the rig's folder; at 0.93 s the mouth is open with the teeth showing and the brows raised. The head's message to the page is 2 MB. Meshes are plain colours (no textures), the eyes are white shells, no hair. Step 3 not run |

## Add a Line in the Lip Sync tab

The editor's main use ([Made lip sync](lipsync.html)): type a new line, EDGEwave voices it through ElevenLabs, and the audio and its lip sync play on the head. EDGEfab's part is the lip sync, made from the words and when each letter is spoken (core `src/core/lipsync/speech.ts`, version 0: spelling rules and a short list of common words, 13 hand-made mouth shapes).

1. `npm run build`, then `npm run lipsync:speech --workspace extensions/edgefab`. Words with evenly spaced letter timings become mouth shapes and a clip; no game, no service. **Expected:** every line `ok`, then `ok`. With words after `--` it prints their shapes in time.
2. The page, in a browser: a line typed into the box, made with evenly spaced timings, sent to the page as the extension would. **Expected:** the words, the shapes in the line under them, curves for the jaw, lips and tongue, and the head moving with the marker.
3. **In VS Code, with EDGEwave from its main (its #13; not run):** F5 with **Run EDGEfab with EDGEwave's build**; **EDGEfab: Open Lip Sync**, pick a character, type a line, press Enter. **Expected:** EDGEwave asks once before EDGEfab first spends credits; then the line plays in the character's voice with the head speaking it. **New Take** speaks it again. Say how well the mouth matches the voice, and which sounds look wrong.

| Run | Result |
|---|---|
| 2026-11-20 | Steps 1 and 2 **pass**. Step 1, 23 checks: "mama" is closed, open, closed, open; "the", "you" from the word list; "time" leaves its e silent; "city" starts with an s; letters marked not spoken (a direction in brackets) move nothing; on an m the lips are together and the jaw shut; the mouth starts before the sound. Found and fixed: lips that close must snap (45 ms), or a short vowel beside them never opens; at 14 letters a second a vowel between two closed lips opens to about two thirds. Step 2: "Hello there, how are you my friend?" gave 19 shapes and 16 tracks, and the head moved. Step 3 not run: **the real voice and real timings have not been through it** |
| 2026-11-21, step 3 (the owner; EDGEwave's main beside EDGEfab's) | **It works, with two faults.** A typed line for Panam came back voiced and played on her head. (1) **The voice "very clearly did not sound like Panam"**: EDGEwave's side, told to its session (which voice it used; a clone from a dozen of her lines). (2) **The mouth was "very exaggerated and unnatural"**: EDGEfab's shapes, version 0. Measured after it, over 95 lines of five main characters: the game's jaw peaks at about 0.45 in a line (0.63 at most), lip poses at 0.15 to 0.3, only "lips together" at 1, and the jaw turns about 4.4 times a second; version 0 went to 0.7 and 1 and turned with every letter. **Shapes version 1** takes the game's range and poses: vowels open the jaw, consonants only shut it by their own amount, and the jaw is averaged over about 0.12 s. Step 1 again: 25 checks pass, no pose past 0.59, the jaw turning 5.5 times a second on a fast sentence. **Not seen by the owner again yet.** First try the same day: the test window had loaded the installed EDGEwave of 4 November (no Speak a Line); the message now names which EDGEwave answered |

## Spike A2F: Audio2Face against the game's clip

Can lip movement made from a line's audio alone read better than the game's own on the words the owner finds stiff ([Made lip sync](lipsync.html#a2f-finer-mouth-movement-from-audio-sized-2026-11-21))? On the owner's PC only: NVIDIA's Audio2Face-3D container on the RTX 4090, the game's voice lines never leaving it. The setup is in [Development setup](dev-setup.html).

1. Start the container: `docker run -d --name a2f-nim --network a2f --gpus all -e NGC_API_KEY -v a2f-cache:/opt/nim/.cache -p 52000:52000 -p 8000:8000 nvcr.io/nim/nvidia/audio2face-3d:2.0` (the key from the owner's own environment). **Expected:** `http://127.0.0.1:8000/v1/health/ready` says ready within a few minutes.
2. A line's voice as a WAV (mono, 16-bit, 16 kHz), through NVIDIA's sample client: `a2f_3d.py run_inference voice.wav config/config_claire.yml -u a2f-nim:52000`. **Expected:** `SUCCESS`, and `output_000001\animation_frames.csv` with one row a frame.
3. The CSV through core `arkitClip` (`src/core/lipsync/arkit.ts`) into a clip, written under EDGEfab's cache as `versions\<clip name>\<version>.json`.
4. **In VS Code (the owner):** open Lip Sync on the character and the line. **Expected:** a row "Lip sync: The game's | Audio2Face | Audio2Face, full strength" under the words; each plays on the same voice and head. Say, for the words agreed, which reads better.

| Run | Result |
|---|---|
| 2026-11-21, the owner's PC (RTX 4090, Docker Desktop 29.9.3, driver 621.24), container 2.0 | Steps 1 to 3 **work**. The container (26.4 GB) was ready about a minute after its first start; the first try failed on its model cache (a Docker volume a non-root container can't write: `chmod 777` on it fixed that). The driver's CUDA 13.5 and Docker Desktop's WSL2 were no trouble. Four of Panam's lines (4.8 to 5.8 s), a few seconds each: **30.0 frames a second, the first frame at 0, 52 ARKit shapes and 16 tongue shapes** in columns `blendShapes.<name>`. **Against the game's own clips:** the jaw follows the game's with r 0.25 to 0.64 at no lag (within 33 ms): in time, and a different performance, not a copy. It is stronger than the game (jaw 0.54 to 0.77 against 0.27 to 0.52; `MouthPucker` up to 1.11 against the game's purse at 0.28), so the "Audio2Face" version is scaled to the game's range (0.65 overall, some poses less). **Its weak point, as feared: closed lips.** Where the game shuts the lips on a b, m or p (lips together at 1), Audio2Face often leaves `MouthClose` at 0 and only lowers the jaw. On stills of one line both look like speech; Audio2Face's mouth is more closed most of the time. **Step 4, the owner's judgement with the voice: not run** |
| 2026-11-21, step 4 (the owner, two lines) | **"Audio2Face reads better."** Full strength is too extreme. One fault seen: on words like "you" and "go" the game's lips move outward as they should, and Audio2Face's stay where they are. **The data agrees:** where the game purses for "go" and "you" (about 0.25), that run had almost nothing (`MouthPucker` 0.06 and 0). **And that run was on the container's default model, James (a man's voice), with Claire's settings**: the model is chosen when the container starts (`NIM_MODEL_PROFILE`), not by the client's settings file. The four lines again on **Claire** and on the **newest model (`multi`, the diffusion one)**, scored against the game's clips (`tools/spikes/a2f/04-models.cjs`), averages: rounding where the game rounds, James 0.25, Claire 0.25, **newest 0.62** (the game 0.20; on "go" and "you" 0.67 against James's 0.06); closed lips where the game closes them, James 0.33, Claire 0.17, **newest 0.84**; the jaw follows the game's less (r 0.32 against 0.47 and 0.50), so it is more its own performance. The tab's versions are now one a model, scaled to the game's range (0.65, rounding kept at 0.6 of that): **Audio2Face 1, newest model**, **2, Claire**, **3, James**; full strength is gone. Each model started in 30 to 40 s. **The owner's look at the newest model: not run** |

