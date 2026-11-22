---
title: Animation Tools
---

# Animation Tools: prompt, add and replace clips

Draft 0.2, 2026-11-22, agreed with the owner the same day (every decision below), with the owner's wishes for the pack added. AT1 is built and checked the same day; the rest is not built.

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
| Added clips | `<project>\anims\<rig>.anims` (`mymod\anims\man_base.anims`), one set per rig per project, lowercase |
| Replaced clips | The game's set at the game's path, a copy in the project with every other clip kept |
| The sources | `source/raw/<set path>.sources/<clip>.glb` and `<clip>.json` |

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
| **Clips** | The custom animations for the picked character: every clip in the project's set for its rig (made or imported), newest first, with the prompt as the clip's description from its `.json`. Pick one and **Play**, or play it as soon as it is made (**Play when made**, on by default). **Stop** returns the NPC to standing |
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
| **A package that plays a clip on V**: a workspot on the player, or a stand-in copy of V | REDnode #47 (V as an actor), open, filed by EDGEdir. The pack's need goes on it, with the owner's go |
| **V's own rig**: V's skeleton has about 152 joints where the NPCs' have 71, and FPP and TPP differ | A probe first (**Probe E**): whether V's TPP rig has a body REDbridge exports skinned (REDcode has none for V yet), whether Uthana keeps it as it kept `man_base`, and whether a clip on the 71 shared bones plays on V |

Until both are in, the pack's **V** entry says what it waits on, and the rest works on NPCs.

## Order

| Step | What | Ends with |
|---|---|---|
| **AT0** | REDbridge's fallback frames fix released (REDbridge 0.19.0, by the REDnode session, on the owner's go). Not a blocker: the fit empties each clip's fallback frames itself, so made clips are safe on 0.18.0; the fix matters for GLBs imported without the fit | `redcode.minBridgeVersion` raised with a REDcode release, when it comes |
| **AT1** | `@edgemodders/anim-core` from the probe's scripts, with checks run on the PC against the game and Uthana (a recorded Uthana GLB is never committed) | The probe's own clips made again through the library, byte for byte |
| **AT2** | REDcode: Generate, Add and Replace in the animation view, the commands, the MCP tools, `uthana` in the Keys view | A hand test: a clip from words in REDcode, then in the game through Pack and Play and Probe D's package |
| **AT3** | The Animation Tools pack, on NPCs: character, spawn, prompt, the clip list, play; its own release and Nexus page | A hand test in the game, with REDcode closed, then with it open |
| **AT4** | V: Probe E, then V in the pack once REDnode #47 lands | A clip made for V plays on V |

Each step has its hand test in [testing](../testing.html) before the next starts.

## Decisions for the owner

| # | Question | Recommendation |
|---|---|---|
| 1 | Where clips made from the game go | **Agreed 2026-11-22:** REDcode's open project; the pack's own project when none is open |
| 2 | Does the pack work without VS Code | **Agreed 2026-11-22:** yes, through REDnode's REDbridge |
| 3 | The library's name | **Agreed 2026-11-22:** `@edgemodders/anim-core`, like `edgemat-core` |
| 4 | Added clips in one set per rig per project (`<project>\anims\<rig>.anims`) | **Agreed 2026-11-22**: simple to find, and a workspot names the set |
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

Not yet run: `generate` end to end, which starts a paid job. Its first run is AT2's hand test.

## Not in this design

- Video to motion: the same chain with a video upload instead of a prompt, once text to motion is in use.
- Editing a clip by hand, and retargeting from other skeletons: EDGEfab's.
- Clips that move the character, and overriding one of V's clips without replacing the file: after Probes B and C.
- Facial animation, events (footsteps) on made clips, synced sets of made clips.
