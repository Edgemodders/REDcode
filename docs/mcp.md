# MCP server

`@edgemodders/redcode-mcp` ([npm](https://www.npmjs.com/package/@edgemodders/redcode-mcp)) exposes REDbridge to AI assistants as an MCP server over stdio. Claude Code, REDagent or any MCP client gets the same engine the REDcode editor uses: the archives, CR2W files as JSON, textures, hashes, and node-by-node editing through document sessions. This is the "mcp" row of the bridge protocol in the [design document](design.html).

The package lives at `packages/redcode-mcp` and is MIT: it spawns REDbridge and talks JSON-RPC over stdio, the same boundary the extension keeps.

## Setup

```
claude mcp add redcode -- npx -y @edgemodders/redcode-mcp
```

It needs Windows, the game, the .NET 10 runtime and REDbridge 0.10.0 for every tool, 0.8.0 for most (REDcode's Install REDbridge fetches the latest). To run it from a REDcode checkout instead: `npm install`, `npm run mcp:build`, then `claude mcp add redcode -- node "<REDcode checkout>\packages\redcode-mcp\dist\server.cjs"`.

Releases go out from `.github/workflows/release.yml`, run with What redcode-mcp and Make a release ticked (`npm run release:mcp`): it stops when `mcp-v<version>` exists or the CHANGELOG has no section for the version, builds, publishes to npm with provenance (secret `NPM_TOKEN`) and makes a GitHub release from `packages/redcode-mcp/CHANGELOG.md`, which tags the commit `mcp-vX.Y.Z`.

The server finds REDbridge.exe and the game folder from `--bridge` and `--game`, from `REDBRIDGE_EXE` and `REDCODE_GAME_PATH`, or from the VS Code settings `redcode.bridgePath` and `redcode.gamePath`. On a machine with REDcode set up, no configuration is needed. The bridge starts on the first tool call, loads the archive index in about three seconds, and stays up for the session.

## Tools

| Group | Tools |
|---|---|
| Archives | `bridge_info`, `archive_search`, `archive_list`, `archive_tree`, `archive_extract`, `archive_extract_many`, `archive_open_mod`, `archive_extract_from_mod` |
| Conversion | `cr2w_to_json`, `cr2w_file_to_json`, `cr2w_from_json`, `texture_to_png`, `texture_file_to_png`, `hash_fnv1a64`, `hash_resolve` |
| Project | `project_export` (a game file under `source/archive` to glTF, an image, Ogg and so on under `source/raw`), `project_import` (back again), `project_pack` |
| Lip sync | `lipsync_lines` (the characters with lip sync, by voice tag, and a character's lip synced lines scene by scene: each line's clip, words, voice file and length), `lipsync_line` (one line's clip as curves: every track that moves, with its group, face part, keys and peak; `tracks` and `every` give keys and samples in full), `lipsync_make` (a spoken line into mouth shapes and lip sync tracks from when each letter is spoken, as EDGEwave's `voice_speak_line` gives it; no game needed). The twins of REDcode's Lip Sync editor ([Lip Sync](design/lipsync.html)). Unreleased |
| Animations | `anim_generate` (a clip from words with Uthana, onto the game's own skeleton; it costs the modder money, $0.10 a second, so ask first), `anim_add_clip` (from a `.glb` on the game's rig), `anim_replace_clip` (in place of a game clip, in a copy of its set), `anim_made_clips`; the Animation Editor's `anim_edit_info` (a made clip's steps, the bone groups, and its feet: where each rests, how far it slides, the pins that would hold it) and `anim_edit` (set, add or remove steps: trim, loop, key, pin, layer; the clip rebuilt from the clip as made, so any step can be changed later; [design](design/animation-editor.html)). Each made clip gets its own set and the record EDGEdir reads ([Animation Tools](design/animation-tools.html)). The Uthana key comes from `UTHANA_API_KEY` or the shared key store, through REDbridge started with `--keys`. Unreleased |
| The game | `game_start` (windowed at a small size, or in REDcode's game tab when a REDcode window offers one), `game_status` (running, and whether REDnode answers yet), `game_stop`. For a test an assistant runs by itself ([design](design/game-testing.html)); it asks the player before starting or stopping the game. The player's window mode and size go back after the game ends. Held back from releases until their hand test has run with the game: offered only when `REDCODE_MCP_GAME_TOOLS` is `1` |
| Sectors | `sector_nodes` (a `.streamingsector`'s nodes, filtered by class, mesh, property tests such as `streamingDistance < 45`, or a box, a page at a time), `sector_node` (one node and its node data entry in full), `sector_patch` (values changed in a project's copy, saved; the game's copy is refused) ([design](design/sector-scripts.html)). Unreleased |
| Sector scripts | `script_list`, `script_run` (the modder's scripts on a sector, with what they select and would change; `apply` writes the changes to a project's copy), `script_read` (a script's text) and `script_write` (a new script, or a changed one, written into the project's or the modder's scripts, where REDcode's Scripts menu lists it at once; the text is parsed, not run, and REDcode asks the modder before a new script's first run), `request_get` and `request_done` (the requests a script hands to an assistant). Unreleased |
| Library | `library_add`: a game file or a project's file, with the files it needs, as one asset item in the EDGE Library. It never picks a folder or a Library place on its own: with none given, it answers what to ask the modder |
| LocKeys | `loc_languages`, `loc_search` (by LocKey, secondary key or words of the text), `loc_get` (by LocKey or secondary key): the game's on-screen texts per language, with a project's own over them |
| TweakDB | `tweakdb_types`, `tweakdb_records` (by type or prefix, with chosen flats and LocKey text), `tweakdb_record`, `tweakdb_flat`, `tweakdb_search`, `tweakdb_names`: the game's TweakDB as shipped, read offline (REDnode reads the live one) |
| Items | `mesh_items`: the item records whose look shows a mesh (clothing; not weapons), with the `.app` look and root entity on the way |
| Sounds | `sound_events` (find sound effect events by name or tag, with their variations), `sound_extract` (write them as `.opus`) and `sound_import` (replace them in a project from `<hash>.wav` files) |
| Document sessions | `cr2w_open`, `cr2w_get_node`, `cr2w_get_nodes`, `cr2w_search`, `cr2w_patch`, `cr2w_save`, `cr2w_close`, `cr2w_documents`, `cr2w_describe_type`, `cr2w_create_instance` |
| One call | `cr2w_read` (open, read paths, close) and `cr2w_edit_file` (open, patch, save, close; a game path with `outFile` gives a modified copy, the archives are never changed) |

The tool descriptions carry the path convention and the three format rules, so an assistant that has only the tool list can work correctly: paths are dotted from the root chunk as in WolvenKit's JSON; numbers are 32-bit floats; `compiledData` is rebuilt from `components` on save; defaults are not stored.

Verified on 2026-10-12 with an MCP client script against a game install: 21 checks covering every tool group, including a one-call edit of a game light into a mod folder with `compiledData` rebuilt to match.

Full tool reference: [packages/redcode-mcp/README.md](https://github.com/Edgemodders/REDcode/blob/main/packages/redcode-mcp/README.md).
