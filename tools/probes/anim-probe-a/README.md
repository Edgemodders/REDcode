# Animation Probe A: does an imported clip play in the game?

The first probe of the animation research (`docs/research/animation-authoring.md`, section 8). One standing idle of the game, `stand__2h_on_sides__01` (on `man_base.rig`, the set `generic_male_average__stand__2h_on_sides__01.anims`), three ways:

| Clip | What it is |
|---|---|
| `game` | The game's own clip: the control |
| `probe_a__same` | Exported through REDbridge and imported back unchanged |
| `probe_a__arm` | The same through Blender in the background, the left arm turned 70 degrees in every frame |

Both probe clips go into one new set, `probe\anims\probe_a.anims`, in the WolvenKit project `AnimProbeA`. Nothing from the game is in this folder: `prepare.mjs` makes everything on the PC.

## Files

| File | What it does |
|---|---|
| `prepare.mjs` | `node prepare.mjs <REDbridge.exe> <game folder> <blender.exe> <project folder>`: exports the clip, imports the unchanged copy, runs `arm.py` in Blender, puts WolvenKit's clip extras back (Blender drops them), imports the arm copy, then exports the written set again and measures the left arm against the game's clip |
| `arm.py` | Inside Blender: imports the one-clip GLB at 30 fps, turns `LeftArm` 70 degrees about its own Z in every frame, exports |
| `rednode/anim-probe-a` | The REDnode package for the game: writes a workspot naming the three clips (`world.writeWorkspot`), spawns a Trauma Team paramedic with it, and switches between the clips |

## Run on 2026-11-20 (offline)

REDbridge 0.17.0, Blender 5.3, project `C:\Users\VYRAL\Documents\AnimProbeA`:

- The unchanged copy comes back exact: the left arm is 0.0 degrees from the game's clip at the start and at 10.8 s; 765 frames at 30 fps, as the game's.
- **Blender's glTF export drops WolvenKit's clip extras** (`wkit.cp2077.gltf.anims`), even with extras export on; it has no place for them on an action. The probe copies them back from the clip that went in, as REDcode's Edit in Blender for clips would. Then the import takes it.
- Blender at its default 24 fps resampled the clip (764 frames at 29.97 fps); at 30 fps it keeps 765 frames.
- The arm copy: 70.0 degrees from the game's clip at the start, 70.4 at 10.8 s; 765 keys on the left arm (Blender keys every frame), the rest as the game's.

## In the game (the owner)

1. In REDcode, open the `AnimProbeA` folder (`C:\Users\VYRAL\Documents\AnimProbeA`) and open `source\archive\probe\anims\probe_a.anims`. Pick `probe_a__arm`: the left arm is held out. `probe_a__same` looks like the game's idle.
2. Start the game with REDnode, load a save, stand somewhere open. In REDcode, **Pack and Play** on the project (it swaps `AnimProbeA.archive` in through REDnode).
3. In the REDnode overlay, switch on **Animation Probe A**, with its bridge and archives permissions.
4. **Write and swap**, **Spawn**, **Play**. Say whether the paramedic shows a brief T pose first (expected once, for the first play).
5. Press **game**, **same** and **arm**, a few seconds apart. Expected: `same` looks exactly like `game`; `arm` holds the left arm out, the rest the same. Say what you see, and whether anything twitches or snaps.
6. **Remove the paramedic** and switch the package off.

What each answer means is in the research report, Probe A.
