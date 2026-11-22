# Animation Probe D: can Uthana alone make a clip on the game's skeleton?

The fourth probe of the animation research (`docs/research/animation-authoring.md`, section 8), after Probe A showed an imported clip plays. Here the clip comes from Uthana's text to motion, retargeted by Uthana onto a stand-in character made from the game's own files, with no Blender in the loop. The owner agreed to the paid test and to uploading the stand-in (2026-11-20 and 2026-11-22).

| Step | What it does |
|---|---|
| `character` | Exports the base male body skinned on `man_base.rig` (through REDcode's `baseBodyGlb`: the game's 187 joints and rest pose, no materials, 2.1 MB) and uploads it to Uthana once with auto-rig off. Its id goes in `probe-d.json` in the project |
| `generate "<prompt>" [seconds] [model]` | A text-to-motion job (`text-to-motion-3.0` by default) onto that character; downloads the GLB at 30 fps, with root motion and in place, into the project's `uthana` folder |
| `fit [name] [variant]` | The fitting step: Uthana's keys by bone name onto the nodes of the game's own clip export, translation on `Hips` only, WolvenKit's extras from the game idle with its 13 float tracks held constant and no fallback frames; then REDbridge's import into `probe\anims\probe_d.anims`, a new set on `man_base.rig`, as `probe_d__<name>`. Reads the set back and measures the arm |
| `replace [variant]` | The same motion over the game's own clip `stand__2h_on_sides__01`, in a copy of its set at the game's path (the other 291 clips kept) |

```
node probe.mjs <command> <REDbridge.exe> <game folder> <project folder> [arguments]
```

The key comes from the shared key store (service `uthana`) through REDbridge's `keys.get`, so REDbridge 0.18.0 or later. `replace` and the cleared fallback frames want REDbridge's main after 0.18.0 (its Unreleased fix); `fit` clears them itself too. Nothing from the game or from Uthana is kept in this folder.

`uthana.mjs` is the small client, from Uthana's API docs (https://uthana.com/docs/api, read 2026-11-22): GraphQL at `https://uthana.com/graphql`, HTTP Basic with the key as the user, uploads as GraphQL multipart, files from `/motion/file/motion_viewer/<character>/<motion>/glb/`.

## Run on 2026-11-22 (offline)

REDbridge main (0.18.0 and the fallback frames fix), project `C:\Users\VYRAL\Documents\AnimProbeD`:

- **The upload:** taken as is, auto-rig off (character `cz6QP1PNTjpH`, confidence 0, as no auto-rig ran).
- **The motion:** "A man stands relaxed, raises his right hand and waves hello, then lowers his arm and stands still.", 5 s on `text-to-motion-3.0` (about $0.50).
- **Uthana kept the game's skeleton exactly:** its GLB has the same 199 nodes, all 71 bones the game's clips animate, by the game's names, and the rest pose identical (0.0 degrees on every bone, the same `Hips` place). It keys rotation on 185 bones and translation on 2, at 30 fps, linear. So no retargeting of our own was needed: the fit is copying keys by name.
- **The import:** REDbridge took it with no skips and no notes: 4.97 s, 150 frames, 71 joints, 13 const float tracks, no fallback frames.
- **Read back:** the right arm turns up to 54 degrees, the forearm and hand about 77 near 1.8 s; the left arm 5, the spine 1, the head 2. A one-handed wave.
- **The replacement:** the game's set copied with `stand__2h_on_sides__01` updated and 291 clips kept (5.4 MB).

## Steps in the game

The package **Animation Probe D** (`rednode/anim-probe-d`) is in the game's REDnode apps folder. It writes a workspot with three clips and plays them on a spawned Trauma Team paramedic:

| Button | Clip | Expected |
|---|---|---|
| **kept** | `stand__2h_on_sides__01__stretch_arms__01` | A game clip the rewritten set kept: he stretches his arms (the control) |
| **added** | `probe_d__wave` in `probe\anims\probe_d.anims` | Uthana's wave, as a new clip |
| **replaced** | `stand__2h_on_sides__01`, the game's idle | The same wave, in place of the game's idle |

1. In REDcode, open the `AnimProbeD` folder and open `source\archive\probe\anims\probe_d.anims`. `probe_d__wave` should wave its right hand on the base body. Say whether it looks natural.
2. Start the game with REDnode, load a save, stand somewhere open. In REDcode, **Pack and Play** on the project.
3. In the REDnode overlay, switch on **Animation Probe D**, with its bridge and archives permissions.
4. **Write and swap**, **Spawn**, **Play**.
5. Press **kept**, **added** and **replaced**, a few seconds apart. Say what each shows, and whether anything twitches, slides or snaps.
6. **Remove the paramedic** and switch the package off.

If **added** waves but **replaced** shows the game's own idle, the game may still hold the set it loaded before the swap (unverified): then **Pack and Install** the project, restart the game, and try **replaced** again.
