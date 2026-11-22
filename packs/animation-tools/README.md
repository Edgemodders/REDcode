# Animation Tools (a REDnode pack)

A REDnode app shipped beside REDcode, with its own version (`pack.json`), changelog and, once released, its own Nexus page. Design: `docs/design/animation-tools.md` (AT3).

In the game: pick a character and **Spawn** them in front of V, say what they should do and **Generate**. Uthana makes the motion on the game's own skeleton, the clip goes into REDcode's open project (the app's own, `Documents\REDnode\Animation Tools`, when none is open), the project is packed and swapped into the running game, and the character plays it. **Custom animations** lists the clips made for that character's rig.

| File | What it is |
|---|---|
| `pack.json` | The pack's id, name, version, the REDnode it needs, its apps |
| `changelog.md` | Its own changelog, with the Nexus summary under each version |
| `apps/animation-tools/rednode-app.json` | The app's manifest: `bridge`, `archives` and `keys:uthana` |
| `src/mod.mjs` | The app. It bundles `@edgemodders/anim-core` (`packages/anim-core`) and REDcode's `src/pack.ts` and `src/project.ts`; `rednode` is the host's |
| `build.mjs` | `node packs/animation-tools/build.mjs [--install <game folder>]`: builds into `dist/packs/animation-tools`, and copies into the game's REDnode apps folder for a hand test |
| `check.mjs` | The check on the PC: the built app outside the game, a stand-in `rednode` over the real REDbridge, and a fake Uthana serving a motion already on the game's skeleton, so the whole chain runs with no paid job |

How it plays a clip: each made clip has its own set (`<mod>\anims\<name>\<name>.anims`) and record (`<name>.edgefab.json`). For the picked character's rig, REDnode's `world.writeWorkspot` writes one workspot, `animtools_<rig>`, holding every made clip on that rig, which the character carries; **Play** jumps to the clip. The project is packed (REDcode's `packProject`) and swapped in (`archives.reload`) only when a file under its `source/archive` changed since the last swap.

Its release: the release workflow's **Animation Tools** choice (`npm run release:animation-tools`, with Nexus `release:animation-tools:nexus`) builds `dist/AnimationTools-<version>.zip` (`tools/release/pack-zip.mjs`), makes the GitHub release `animation-tools-v<version>` and updates its Nexus page from `nexus/` (the owner makes the page first; see `nexus/README.md`). Release only after the in-game test (AT3) passes.

Not yet: V (REDnode #47), clips that move the character (Probe B).
