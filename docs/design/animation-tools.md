---
title: Animation Tools
---

# Animation Tools: prompt, add and replace clips

Draft 0.2, 2026-11-22, agreed with the owner the same day (every decision below), with the owner's wishes for the pack added. AT1, AT2 and AT3 are built the same day (the AT2 and AT3 hand tests pending); AT3r (its release) and AT4 (V) are not.

The owner, 2026-11-22: a REDnode tool pack, **Animation Tools**, to prompt an animation and play it on a spawned NPC in the game, beside REDcode's own viewing, prompting and importing, so the workflow is seamless. EDGEfab's part (manual editing) is still being thought about. It may share a library with REDcode.

## What the probes settled

From the [animation research](../research/animation-authoring.html) and its probes ([testing](../testing.html#animation-probe-a)):

| Probe | Settled |
|---|---|
| **A** (2026-11-21) | A clip imported through REDbridge plays in the game, once its fallback frames are cleared (REDbridge main, unreleased) |
| **D** (2026-11-22) | Uthana makes a clip from a text prompt onto a stand-in character made from the game's files, **with the game's own bone names and rest pose**, so no retargeting and no Blender. It plays in the game as a new clip and in place of a game clip |
| **D, run 1** | The game needs every channel its clips have: rotation and translation on all 71 bones. With translation on `Hips` alone, the body warped |
| **D, run 2** | Uthana stands the heel joints on its floor; the game keeps them about 3 cm up. The fit lifts the hips to match |

Still open: a clip that moves (Probe B: workspots apply no root motion), overriding one of V's clips without replacing the whole file (Probe C), V as an actor (REDnode #47), video to motion, and a woman's rig (only `man_base` was tried).

## The parts

| Part | What | Where |
|---|---|---|
| **`@edgemodders/anim-core`** | The shared library: the Uthana client, the stand-in character for a rig, the fit, and adding or replacing a clip through REDbridge. No VS Code and no REDnode imports | `packages/anim-core` in this repo, beside `world-view` |
| **REDcode** | In the animation view: **Generate with Uthana**, **Add Clip from GLB**, **Replace Clip from GLB**; the commands, and MCP tools for assistants | `extensions/redcode` |
| **Animation Tools** | A REDnode pack: prompt, generate, swap and play on a spawned NPC, all in the game; and play any clip the project has | `packs/animation-tools/` in this repo, released on its own, as EDGEbuilder's Remove Doors is |
| **EDGEfab** (later) | Manual editing: timing, trim, loop, mirror, posing, over the same library | EDGEfab, once the owner decides |

So Uthana moves from EDGEfab's planned E3 to REDcode. EDGEfab hears of it on its repo once this page is agreed, with the owner's go.

## 1. `@edgemodders/anim-core`

Made from the probe's scripts (`tools/probes/anim-probe-d`), with the same rules:

| Part | Does |
|---|---|
| `uthana(key)` | `createCharacter`, `textToMotion` (3.0, Lite, Mini), `job`, `wait`, `download` (GLB, 30 fps, in place or moving). Uthana's GraphQL at `https://uthana.com/graphql`, Basic auth with the key |
| `standIn(bridge, rig)` | The rig's base body skinned on its rigs (`man_base`, `woman_base`; REDcode's `baseBodyGlb`), uploaded once per Uthana account with auto-rig off. The character id is kept in `%LOCALAPPDATA%\Edgemodders\anim\characters.json`, by rig and by a fingerprint of the key (a hash, never the key). Uthana answers the same id for the same file, so a lost record costs only an upload |
| `fitClip(motionGlb, rigClip, name)` | Uthana's keys by bone name onto the nodes of a game clip on the same rig. Every channel that game clip has: Uthana's rotation on every bone and translation on `Root` and `Hips`, the rig's rest value elsewhere. The hips lifted until the lowest heel or toe is as high as the game clip's. WolvenKit's extras from the game clip, its float tracks held constant, no fallback frames, no events. Answers the GLB, and its checks: channels, bone lengths, the grounding |
| `addClip(bridge, project, glb, set)` | REDbridge's `project.import` into the project's set for the rig (a new set on the rig the first time, `keep` after) |
| `replaceClip(bridge, project, glb, gameSet, clip)` | The same over the game's set: a copy at the game's path (`template` the first time), that clip updated, every other clip kept |
| `fitFromGlb(...)` | The fit for a GLB from elsewhere (Blender, Mixamo): by bone name only, so it must already be on the game's rig. Retargeting from other skeletons is EDGEfab's |

Each made clip keeps its source beside it in the project's `source/raw/<set>.sources/`: Uthana's GLB, and a `.json` with the prompt, model, length, Uthana's motion id and the date. Uthana's terms give a paying customer the output, and may use inputs and outputs for training.

The rig's reference game clip is a standing idle: `stand__2h_on_sides__01` for `man_base` (Probe D's), and `stand__2h_on_sides__02` for `woman_base` (her `__01` set has only variations: warm-ups, exercises).

Published to npm as `world-view` is, when the owner says. REDcode bundles it from source.

## 2. REDcode

### In the animation view

A **Generate** button in the view's bar opens a panel above the clip list:

| Field | |
|---|---|
| Prompt | The words. Uthana rewrites them unless **As written** is ticked |
| Length | 4 to 10 s (3.0), 5 to 10 s (Lite, Mini) |
| Model | 3.0 (best, $0.10 a second), Lite ($0.10), Mini ($0.075) |
| In place | On by default: workspots apply no root motion. Off keeps the travel (**unverified** in the game, Probe B) |
| Name | The clip's name, from the prompt (`wave_hello`), editable |
| Goes to | **Add to the project** (the project's set for this rig), or **Replace `<clip>`** when a game clip is shown |

The button says the cost (**Generate, $0.50**). Uthana charges only a finished job. The panel shows each stage (the stand-in uploaded once, the job queued and running, downloaded, fitted, imported) and then the new clip plays on its body. A failed check (a bone without its length, a bone the rig lacks) stops before the import and says which.

**Add Clip from GLB** and **Replace Clip from GLB** sit beside it: a GLB already on the game's rig, through the same fit. They serve Blender, and the planned Edit in Blender for a clip ([research](../research/animation-authoring.html), R1).

### The project's sets

| Kind | Path |
|---|---|
| Added clips | `<mod>\anims\<name>\<name>.anims` (`mymod\anims\wave_hello\wave_hello.anims`), one set per clip, lowercase: the place EDGEfab and EDGEdir agreed for a made animation ([EDGEfab #7](https://github.com/Edgemodders/EDGEfab/issues/7)) |
| Each added clip's record | `source/raw/<mod>/anims/<name>/<name>.edgefab.json` (`kind: "anim"`, an `id` made once and kept, `name`, and `anim`: `rig`, `seconds`, `fps`, `rootMotion`, `loop`, `name`), beside the clip `<name>.glb` on the game's rig and the motion as it came, `<name>.source.glb`. EDGEdir's index finds made animations by this record |
| Replaced clips | The game's set at the game's path, a copy in the project with every other clip kept |
| A replacement's sources | `source/raw/<game set>.sources/<clip>.glb` and `<clip>.json`: no record, since the clip is the game's |

A replacement swaps the whole file, so two mods that replace clips in the same set conflict, the first loaded wins. The panel says so once. If Probe C passes, replacements become ArchiveXL override sets.

### Commands and MCP

`redcode.anims.generate`, `redcode.anims.addClip`, `redcode.anims.replaceClip`, and MCP tools `anim_generate`, `anim_add_clip`, `anim_replace_clip` (redcode-mcp), so an assistant can make a clip from words. `REDcodeApi.generateAnimation(...)` for other tools, such as EDGEdir.

### Keys

The Uthana key from the shared store, service `uthana`, which joins the Keys view's list. It is already saved on this machine.

## 3. The Animation Tools pack

What the owner wants of it (2026-11-22), among the rest:

- **Pick a character** (an NPC), **spawn** it in front of V, **prompt** a new animation for it, **pick** it from a list of the custom animations for that character, and **play** it on the NPC.
- **Prompt animations for V**, pick them, and play them on V at once.

Its own release and Nexus page, as EDGEbuilder's Remove Doors has: `packs/animation-tools/` with `pack.json` (id, name, version, the REDnode it needs, its guide), its own changelog with Nexus lines, `nexus/` for the page, and its apps under `apps/`. REDcode's release workflow gains **Animation Tools** beside REDcode, the theme, redcode-mcp and world-view, with its own tag (`animation-tools-v<version>`) and **Update Nexus Mods**, through EDGErepo's Nexus tool. Its wiki page in EDGEweb follows each of its releases.

A REDnode Node mod with one window, made in Node with REDnode's `ui`, as Remove Doors and the probes are:

| Part | |
|---|---|
| **Project** | REDcode's open project, from `%LOCALAPPDATA%\REDcode\project.json`, which the `redcode` package reads. A menu when several windows have one (`projects()`). When none is open, the pack's own WolvenKit project, made on first use in `Documents\REDnode\Animation Tools` (**unverified** whether REDnode would rather name the place) |
| **Prompt** | Prompt, length, model, in place, name, as in REDcode; **Generate** with its cost |
| **Character** | A list to pick from: **V**, and NPCs by their records, each with its rig (`man_base` or `woman_base`), searchable, with a few to start (the Trauma Team paramedic, Probe D's, and a woman's). **Spawn** puts the NPC 3 m in front of V, facing V; **Remove** takes it away. Only NPCs on a rig anim-core knows are offered (**unverified** how a record names its rig: through its entity's skeleton, to be read when built) |
| **Clips** | The custom animations for the picked character: every made clip in the project on its rig, found by their records (`madeClips`), newest first, with the prompt from the record as its description. Pick one and **Play**, or play it as soon as it is made (**Play when made**, on by default). **Stop** returns the NPC to standing |
| **Status** | Each stage, as REDcode's panel shows them |

The pack bundles `anim-core` into its `mod.mjs` at build. Generate runs the whole chain with no VS Code: the key, the stand-in, Uthana, the fit, the import into the project's set, the pack (REDcode's `src/pack.ts`, which has no VS Code imports), the swap, a workspot written with the clip, and play. If REDcode has the same project open, its Project view and animation view refresh by themselves.

| Permission | For |
|---|---|
| `keys:uthana` | `secrets.askShared('uthana')`: REDnode's own window asks the first time. **Unverified** whether REDnode's Keys view and its key check know the service `uthana` (nothing in REDnode's source names it); if not, that is a small request to REDnode |
| `bridge` | REDbridge through REDnode, for the stand-in, the import and the pack |
| `archives` | The swap into the running game |

`requires`: the REDnode with `world.writeWorkspot`, and the REDbridge that clears fallback frames (the next release after 0.18.0).

### V

Prompting and playing on V, as the owner asked, needs two things the NPCs do not:

| Need | State |
|---|---|
| **A package that plays a clip on V**: a workspot on the player, or a stand-in copy of V | REDnode #47 (V as an actor), open, filed by EDGEdir. The pack's need is on it (2026-11-22, https://github.com/Edgemodders/REDnode/issues/47#issuecomment-7080037970). REDnode's V actor spike (REDnode 0.70.0, built, not yet run in the game) tries both ways; its 0.2.0 adds REDcode's test (steps 13 to 17): two written workspots, one on V's skeleton and one on the NPC rig, each with V's own clip and two NPC clips, played on V with jumps, and the NPC-rig one on the copy |
| **V's own rig**: V's skeleton has about 152 joints where the NPCs' have 71, and FPP and TPP differ | REDnode's answer (2026-11-22, from the game's files): V's own clips and the player workspots are on `player_man_skeleton.rig` or `player_woman_skeleton.rig`; the photo mode copy of V animates on `man_base`, so way B may take NPC clips as a spawned NPC does (**unverified** until the spike runs). Then **Probe E**, if V needs clips on V's own rig: whether that rig has a body REDbridge exports skinned, and whether Uthana keeps it as it kept `man_base` |

Until both are in, the pack's **V** entry says what it waits on, and the rest works on NPCs.

## Order

| Step | What | Ends with |
|---|---|---|
| **AT0** | REDbridge's fallback frames fix released (REDbridge 0.19.0, by the REDnode session, on the owner's go). Not a blocker: the fit empties each clip's fallback frames itself, so made clips are safe on 0.18.0; the fix matters for GLBs imported without the fit | `redcode.minBridgeVersion` raised with a REDcode release, when it comes |
| **AT1** | `@edgemodders/anim-core` from the probe's scripts, with checks run on the PC against the game and Uthana (a recorded Uthana GLB is never committed) | The probe's own clips made again through the library, byte for byte |
| **AT2** | REDcode: Generate, Add and Replace in the animation view, the commands, the MCP tools, `uthana` in the Keys view. **Built 2026-11-22**, hand test pending | A hand test: a clip from words in REDcode, then in the game through Pack and Play and Probe D's package |
| **AT3** | The Animation Tools pack, on NPCs: character, spawn, prompt, the clip list, play. **Built 2026-11-22**, hand test pending | A hand test in the game, with REDcode closed, then with it open |
| **AT3r** | Its release: the zip, a GitHub release `animation-tools-v<version>` from REDcode's release workflow, and its own Nexus page, which the owner makes (the page, then its images) | After AT3's hand test passes, on the owner's go |
| **AT4** | V: Probe E, then V in the pack once REDnode #47 lands | A clip made for V plays on V |

Each step has its hand test in [testing](../testing.html) before the next starts.

## Decisions for the owner

| # | Question | Recommendation |
|---|---|---|
| 1 | Where clips made from the game go | **Agreed 2026-11-22:** REDcode's open project; the pack's own project when none is open |
| 2 | Does the pack work without VS Code | **Agreed 2026-11-22:** yes, through REDnode's REDbridge |
| 3 | The library's name | **Agreed 2026-11-22:** `@edgemodders/anim-core`, like `edgemat-core` |
| 4 | Where added clips go | **Agreed 2026-11-22**, then changed the same day by the owner: one set per clip with its record, as agreed on [EDGEfab #7](https://github.com/Edgemodders/EDGEfab/issues/7), so EDGEdir finds REDcode's clips with no change (one set per rig was the first answer) |
| 5 | In place by default | **Agreed 2026-11-22**, until Probe B shows how a moving clip plays |
| 6 | MCP tools in AT2, not later | **Agreed 2026-11-22**: an assistant making clips from words is the AI-first path, and EDGEdir will want it |

## AT1 as built (2026-11-22)

`packages/anim-core` (`@edgemodders/anim-core` 0.1.0, not published), Node 18, no dependencies:

| File | |
|---|---|
| `src/uthana.ts` | The client, the models and their prices, `cost` |
| `src/fit.ts` | `fitClip` and `lowestFoot`, from the probe |
| `src/game.ts` | `Rigs`, `rigFor`, `exportGame` (its own cache, emptied when the game changes), `referenceClip`, `standInGlb`, `standIn`, `ensureProject`, `addedSet`, `addClip`, `replaceClip`, `clipsIn`, `asBridge` (REDcode's `request` or REDnode's `call`) |
| `src/generate.ts` | `generate`, `clipNameFor` |
| `src/glb.ts` | `readGlb`, `writeGlb`, `readAccessor`, `readGlbHead`, `clipOf` |

`scripts/check.mjs`, run on the PC with the game and the Uthana key: **all 18 checks pass.**
- The library makes Probe D's two sets again from Probe D's downloaded motion, **byte for byte** the probe's: the added set (45,378 bytes) and the replaced idle set (5,660,892 bytes, its 292 clips kept). One difference had to go first: the game's export has `-0` in six rest translations, which the probe's script had turned into `0`; WolvenKit keeps the sign, so the fit now writes `0`.
- Uthana, with no paid job: the key works, the stand-in uploads to Probe D's character (`cz6QP1PNTjpH`), a second ask is answered from the record, the record holds no key, and the download of Probe D's motion is the probe's file.
- The woman's rig: her reference clip animates the same 71 bones, and her stand-in (187 joints) has all of them. Her stand-in is not uploaded yet.

Then the layout of [EDGEfab #7](https://github.com/Edgemodders/EDGEfab/issues/7) (decision 4, changed): `addClip` writes each clip in its own set with its record, and `madeClips(project)` lists them by their records. Two more checks pass (20 of 20): a clip gets its own set, `.glb` and record, and made again keeps its id. **EDGEdir's own reader** (`projectAnims` in EDGEdir's `src/core/made.ts`, bundled and run on the check's project) finds both clips with their rig, length, frame rate and `.glb`.

Not yet run: `generate` end to end, which starts a paid job. Its first run is AT2's hand test.

**EDGEfab's answer on #7** (2026-11-22, https://github.com/Edgemodders/EDGEfab/issues/7#issuecomment-7080113370): the record's name `<name>.edgefab.json`, and `madeBy` and `source`, are fine; it asked for a `license` shaped like its prop records' (`{ source, plan, terms, note }`), and for the modder to be asked before a clip it has edited is made again or replaced. An EDGEfab edit keeps `id`, `madeBy`, `made`, `source` and `license`, and adds `edited` and `edits`. Both asks are in: `uthanaLicense()` (from Uthana's terms 2.0.0, read 2026-11-22: a paying customer owns the output to the extent rights exist, 4.2; Uthana may train on inputs and outputs, 6.2), and `EditedClipError`, which `generate` raises before Uthana is paid. Checks 22 of 22. EDGEfab will use anim-core from npm once it is published.

## AT2 as built (2026-11-22)

| Part | Where |
|---|---|
| The Make panel | `webview/animViewer.ts` (`makePanel`): **Make** in the animation view's bar opens it above the clip list: the words, model and length (with the price on **Generate**), In place, As written, the name, and **As a new clip in the project** or **Replace <clip>** (on a game set, in a copy of its set; on a made clip's own set, **Make <clip> again**). **From a GLB…** beside it. Each stage shows under it. Offered on `man_base` and `woman_base` sets with a project open; otherwise the panel says why |
| The host | `src/animMake.ts` (`makeClip`): the name (a taken name made from the words gets `_2`; a typed one asks **Make It Again** or **Keep Both**, and says when EDGEfab has edited it), closing tabs on a set it replaces, the key, anim-core's `generate` or the fit of a `.glb`, then the Project view refreshed. `src/cr2wEditor.ts` (`animsMake`, `make` in the payload, stages as `animsMakeStage`), `src/animCommands.ts` (the commands, the editor's hook, `generateAnimation`) |
| Commands | **Generate an Animation with Uthana**, **Add a Clip from GLB** (also on a `.glb` in the Project view), **Replace a Game Clip**, each with a notification for its stages; the made clip opens in the animation view |
| `REDcodeApi.generateAnimation(options, caller)` | The key through `keys.get` for the caller, so the modder is asked once ([API](../api.html)) |
| MCP | `anim_generate`, `anim_add_clip`, `anim_replace_clip`, `anim_made_clips` in redcode-mcp, which now starts REDbridge with `--keys`; the key from `UTHANA_API_KEY` or the store ([MCP](../mcp.html)) |
| Keys | `uthana` in REDcode's known services, and in REDbridge's (REDbridge main 4942dc3, unreleased: its name and `UTHANA_API_KEY`) |

Checked offline: typecheck and build; the unit checks (75); anim-core's check (22); the MCP tools over stdio (`anim_add_clip` writes the clip, its set and record; a second of the same name is refused without `again`; `anim_made_clips` lists it; `anim_generate` read the key from the store through REDbridge and stopped at its length check, with no job). The panel and the commands are the hand test's, with the first paid Generate ([testing](../testing.html#animation-tools-at2)).

## AT3 as built (2026-11-22)

`packs/animation-tools/` (Animation Tools 0.1.0, unreleased; its `README.md` has the files): one REDnode Node mod, `src/mod.mjs`, built by `build.mjs` into `dist/packs/animation-tools` with anim-core and REDcode's `pack.ts` bundled in (52 KB). Permissions `bridge`, `archives`, `keys:uthana`; REDnode 0.68.0 or later (`ui.select`).

| Part of the window | |
|---|---|
| The project line | REDcode's open project, from `%LOCALAPPDATA%\REDcode\project.json`; otherwise the pack's own WolvenKit project, `Documents\REDnode\Animation Tools`, made on first use. The title bar's refresh looks again |
| **Character** | The Trauma Team medic (`Character.trauma_team_paramedic`, man), a corpo plaza man and woman (`Character.LightCrowd_corpoplaza_ma` and `_wa`), or another record with its rig picked; **V** is listed and waits on REDnode #47. **Spawn** puts them 3 m in front of V, facing V (Probe A's yaw); **Remove** |
| **Make a clip** | The words, the model and length, a name, **In place** and **Play when made**; **Generate, $0.50** with its price. A taken name gets `_2` (the pack never makes a clip again in place, so EDGEfab's edits cannot be lost from the game). The key through `secrets.askShared('uthana')`; each stage on the status line |
| **Custom animations** | The made clips on the character's rig (`madeClips`), newest first, with their words; **Play** and **Stop** |

**Play:** the project is packed and swapped in only when a file under its `source/archive` changed since the last swap; the rig's workspot `animtools_<rig>` is written again (REDnode's `world.writeWorkspot`, on `man_base.rig` or `woman_base.rig`) only when its clips changed; a new workspot respawns the character carrying it (`world.useWorkspot` with `workspot` and `entry`), otherwise `world.jumpWorkspot`.

Checked outside the game (`packs/animation-tools/check.mjs`): the built `mod.mjs` with a stand-in `rednode` over the real REDbridge and a fake Uthana serving Probe D's motion. The window finds a REDcode project from a stand-in `project.json`; Spawn; Generate runs the whole chain (stand-in upload, job, download in place at 30 fps, fit with the hips lifted 3.1 cm, import into its own set with its record, pack, swap, workspot, play); a second Generate of the same words is `_2` and the workspot then holds both; Play of the first jumps, with no pack or swap; Stop; the woman's list is empty. Found and fixed there: the character faced away from V (a turn too many), and every Play packed and swapped again.

**Unverified until the hand test:** the corpo plaza crowd records on their rigs with a written workspot; the woman's stand-in on Uthana (not uploaded yet, so its first Generate uploads it); REDnode's key window for `uthana` (it takes any service id, unnamed).

## Not in this design

- Video to motion: the same chain with a video upload instead of a prompt, once text to motion is in use.
- Editing a clip by hand, and retargeting from other skeletons: EDGEfab's.
- Clips that move the character, and overriding one of V's clips without replacing the file: after Probes B and C.
- Facial animation, events (footsteps) on made clips, synced sets of made clips.
