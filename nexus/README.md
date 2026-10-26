# REDcode on Nexus Mods

The source of REDcode's Nexus Mods page lives here, so updates are edits in the repo, not in Nexus's text box. **Live at [mod 35421](https://www.nexusmods.com/cyberpunk2077/mods/35421).**

Since 2026-10-26 the page is kept through Nexus's v3 API, as REDnode's, EDGEdeck's, EDGEmat's, EDGEchat's and REDagent's are: `tools/nexus/` (copied from REDnode; keep the copies the same) and `nexus.json` (the page, and how a release uploads: Mod Manager Download off, the old version archived). The release workflow's **Update Nexus Mods** box, with What REDcode, uploads the Nexus zip, adds the changelog and pushes `description.bbcode`.

| File | What it is |
|---|---|
| `description.bbcode` | The page's description, in Nexus's BBCode |
| `README.md` | This page: the other fields of the Nexus form, the download file, and how to update |
| `nexus.json` | The page, its internal mod id and main file (written by `pull`), how a release uploads, and the hash of the description last pulled |
| `images/` | The screenshots the description shows |

## The Nexus form

| Field | Value |
|---|---|
| Mod name | REDcode for Cyberpunk 2077 |
| Version | REDcode's version, from `extensions/redcode/package.json` (for example 0.9.0) |
| Category | Modders Resources and Tutorials (check the list for Cyberpunk 2077 when creating the page) |
| Brief overview | A Cyberpunk 2077 modding workspace in VS Code, built on WolvenKit: browse the archives, edit CR2W files, view textures, meshes and sounds, browse the TweakDB, pack and install. A VS Code extension, not a game mod. (255 characters at most; this is 213) |
| Author | Edgemodders |
| Language | English |
| Primary image | `docs/assets/brand/social.png` (1280 x 640). The banner (`docs/assets/brand/banner.png`) is already at the top of the description |
| Requirements | None on Nexus. Off-site: VS Code 1.70 or later (or VSCodium, or EDGEkit); REDbridge and the .NET 10 runtime, which REDcode offers to install. Optional: EDGEdeck (linked to GitHub until it has a Nexus page) |
| Permissions | MIT: open source, free to modify and redistribute with the license notice. Bundled packages keep their licenses (`ThirdPartyNotices.txt`). REDbridge, a separate download, is GPL-3.0 |
| Tags | Modders resource, utility, tools |

The screenshots live in `images/` (WebP, as Nexus serves them; saved from the first page, 35356, on 2026-10-18) and the description links them from this repo's `main` branch on GitHub, like the banner, so the page does not depend on one Nexus page. A new screenshot: add it to `images/`, push, then link it as `[img]https://raw.githubusercontent.com/Edgemodders/REDcode/main/nexus/images/<name>[/img]` with a one-line caption. Uploading it to the page's Images tab too puts it in the gallery.

## The download

One main file: `REDcode-<version>-nexus.zip`, with:

| File | What it is |
|---|---|
| `redcode-cyberpunk-<version>.vsix` | The extension, the same file the Marketplace and Open VSX have |
| `README.txt` | How to install it: Install from VSIX in VS Code, or `code --install-extension` |
| `LICENSE.txt`, `ThirdPartyNotices.txt` | REDcode's license and its bundled packages' |

REDbridge is not in it: REDcode downloads the release it needs on first start.

**When uploading, turn off the Mod Manager Download button** for this file (Nexus's file form has the option). It is a VS Code extension: Vortex would deploy it into the game folder, where it does nothing.

File description on Nexus:

> REDcode for Cyberpunk 2077 &lt;version&gt;, the VS Code extension. Extract, then in VS Code: Extensions view, ..., Install from VSIX. Or install it from the Marketplace or Open VSX, where it updates itself.

### Building it

The release workflow (`.github/workflows/release.yml`) builds it whenever it builds REDcode (not the theme), keeps it in the run's artifact, and attaches it to the GitHub release beside the `.vsix`. A release, as in CLAUDE.md: bump the version and the CHANGELOG, push, then Run workflow with What REDcode and Make a release ticked (or `npm run release`). Tick **Update Nexus Mods** too to upload it to Nexus (below).

By hand, after packaging the vsix: `node tools/nexus-zip.mjs` writes `dist/REDcode-<version>-nexus.zip`.

## Updating the page

1. Edit `description.bbcode` here, check it with `node tools/check-bbcode.mjs nexus/description.bbcode`, commit, push.
2. With a release: tick **Update Nexus Mods** beside **Make a release**, What REDcode (or `npm run release:nexus`). After the GitHub release the workflow uploads `REDcode-<version>-nexus.zip` as the main file's new version (the old one archived, Mod Manager Download off), adds the version's changelog (`npm run release:notes -- extensions/redcode --nexus`) and pushes `description.bbcode` when it differs from the live one.
3. The push never overwrites an edit made on Nexus: if the live description is neither the one last pulled nor the one the previous release pushed, the run stops before it builds. Then `npm run nexus:pull`, merge with `git diff`, commit, and run again. `npm run nexus:status` shows the page's version, files and whether its description matches.
4. If the Nexus step fails after the GitHub release, run `node tools/nexus/nexus.mjs release --version <version> --zip <the release's Nexus zip> --notes <notes file>` on the dev PC: it skips what is already done. Add `--dry-run` to see what it would do.

The key: in CI the organisation secret `NEXUS_KEY`; on the dev PC the DPAPI file `%APPDATA%\Edgemodders\nexus-key.txt` (`tools/nexus/api.mjs`). Never print it or pass it on a command line.

When it was set up (2026-10-26) the live description was the one pasted for 0.10.2, older than the repo's: it showed the screenshots from the first page (35356) and linked EDGEdeck and REDnode to their removed first pages. `nexus.json` records it as last pulled, so the next release with **Update Nexus Mods** pushes the repo's.

Keep these in step with the extension (its README and CHANGELOG):

| Where in the description | Update when |
|---|---|
| The STATUS box near the top | The preview flag goes |
| "Highlights" | A release adds a view, an editor or a command a modder would notice |
| "Coming next" | Its items are released (move them to Highlights) or new ones are built |
| "Requirements" | The VS Code minimum (`engines.vscode`) or REDbridge's runtime changes |

## BBCode used

Nexus's BBCode has no tables or Markdown, so the page uses only: `[b]`, `[i]`, `[size=2..5]`, `[color=#hex]`, `[center]`, `[quote]`, `[line]`, `[list]` with `[*]`, `[url=...]` and `[img]`. The banner and the screenshots are linked from this repo's `main` branch on GitHub, so they must stay at their paths. The colours are the house palette: yellow `#fcee0a` for headings, cyan `#19f3ff` for highlights.
