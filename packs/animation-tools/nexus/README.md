# Animation Tools on Nexus Mods

The source of Animation Tools' own Nexus Mods page, beside REDcode's (`nexus/` at the repo root), as EDGEbuilder keeps Remove Doors'. Animation Tools is a REDnode app in this repo (`packs/animation-tools/`, its own version in `pack.json`), released with the release workflow's **Animation Tools** choice: its own GitHub release (tag `animation-tools-v<version>`) and, with **Update Nexus Mods**, its zip, changelog and this description on the page (`npm run release:animation-tools:nexus`).

**The page does not exist yet.** The owner makes it, with the form below, after the pack's in-game test (AT3) passes. Then put its number in `nexus.json` as `page`, and pull once (`node ../EDGErepo/tools/nexus/nexus.mjs pull packs/animation-tools/nexus`), which records the mod and file ids.

| File | What it is |
|---|---|
| `nexus.json` | The page id and how a new version is uploaded (the Nexus tool in EDGErepo writes the rest) |
| `description.bbcode` | The page's description, in Nexus's BBCode, pushed by the release run. Check it with `node tools/check-bbcode.mjs packs/animation-tools/nexus/description.bbcode`. Pull before changing it, once the page exists |
| `README.md` | This page |

Brand images (a banner, the page's primary image, an icon) come with the page, made as Remove Doors' were (EDGEbuilder's `packs/remove-doors/nexus/brand/`).

## The Nexus form

| Field | Value |
|---|---|
| Mod name | Animation Tools for REDnode |
| Version | From `packs/animation-tools/pack.json`; the release run sets it |
| Category | Utilities |
| Brief overview | Make animations from your own words with Uthana and play them on a character in front of V, straight into the running game. A small REDnode app; the clips go into your REDcode project, ready to pack into a mod. (255 characters at most; this is 205) |
| Author | Edgemodders |
| Language | English |
| Primary image | The pack's own, with the EDGEmodders header added |
| Requirements | REDnode (note: "0.68.0 or later"), Codeware, REDbridge (REDcode installs it), an Uthana account and key (https://uthana.com) |
| Permissions | MIT, as REDcode |
| Tags | Utility, Animations |

## Pictures for the description

After the in-game test passes: the window with a character picked and a clip being made (the busy Generate), and a character playing a made clip in front of V, uploaded to the page's Images tab and added under "What it does".

## The download

One main file: `AnimationTools-<version>.zip` (`tools/release/pack-zip.mjs`), laid out like the game folder, so Vortex, EDGEdeck and an extract by hand put it in the same place: `red4ext/plugins/REDnode/apps/animation-tools/`. It holds only the app, never REDnode's or REDcode's files.
