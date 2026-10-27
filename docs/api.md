---
title: Extension API
---

# REDcode's API for other extensions

REDcode returns an API from `activate()`, so other VS Code extensions can use REDcode without importing its code. EDGEwave, the EDGE sound studio, asked for it in [REDcode issue #4](https://github.com/Edgemodders/REDcode/issues/4); REDcode uses EDGEdeck's API the same way.

## Getting it

List REDcode in your `package.json`, so VS Code activates it first:

```json
"extensionDependencies": ["edgemodders.redcode-cyberpunk"]
```

Then:

```ts
const ext = vscode.extensions.getExtension<REDcodeApi>("edgemodders.redcode-cyberpunk");
const api = ext?.isActive ? ext.exports : await ext?.activate();
if (api?.apiVersion === 1) {
  // use it
}
```

`activate()` returns `undefined` when REDcode could not start, such as when an old REDcode id is still installed beside it. Copy the interfaces from [`src/api.ts`](https://github.com/Edgemodders/REDcode/blob/main/extensions/redcode/src/api.ts) into your extension; they are the contract. New members may be added within version 1. A change that breaks callers raises `apiVersion`.

## Version 1

| Member | What it does |
|---|---|
| `apiVersion` | `1` |
| `version` | REDcode's version, such as `0.9.0` |
| `bridge()` | The running REDbridge client, or `undefined`. Its methods mirror REDbridge's JSON-RPC methods |
| `gamePath()` | The game folder REDcode reads, or `undefined` when `redcode.gamePath` is not the game |
| `project()` | The open WolvenKit project: name, mod name, `.cpmodproj` file, folder, and its `archive`, `raw`, `resources` and `packed` folders. Or `undefined` |
| `onDidChangeProject` | Fires with the new `project()` when a project opens or closes |
| `soundIndex()` | The game's sound effects: `{ count, events }`, where each event has `hash`, `name` (or `null`), `tags` and `sounds` (the hashes of its variations). Loaded once per bridge process |
| `sound(ref)` | A sound's audio as `{ data, mime, codec, channels, sampleRate, name }`, in a form a webview decodes |
| `importFile(file, options?)` | Imports a file under the project's `source/raw` back into `source/archive`, as Import from Raw does, and returns `{ ok, written, mesh? }`. A GLB with no `.mesh` at its path needs `{ template }`, a game path or `.mesh` to start from; `mesh` reports the submeshes, the GLB's material names per submesh, the material entries, appearances and what was resized. A `<hash>.wav` replaces that game sound effect. Needs REDbridge 0.9.0 for templates and sounds |
| `pack()` | Packs the open project, as REDcode: Pack does, and returns `{ packedDir, archive, archiveFiles }` |
| `packAndTry()` | Packs and gets the mod into the game: `"rednode"` when REDnode's `archives_reload` swapped it into the running game (REDnode running with its MCP server on; sound archives too); `"hot"` when it went to Red Hot Tools' hot folder, which the running game reloads (never for an archive with sound paks); `"installed"` when it was installed for the next start; `undefined` when the pack failed, REDnode refused or swapped nothing, a hot swap was refused and the user did not install instead, or when it would break the mod (a missing REDmod custom sound) and the user cancelled. `"rednode"` is on `main`, in the next release after 0.10.3 |
| `editInBlender(file)` | Opens a project `.glb`, `.gltf` or `.mesh` in Blender; each save there is imported back into `source/archive` |
| `openFile(target, node?)` | Opens a file in the CR2W editor. `target` is a game path (`base\journal\cooked_journal.journal`, opened read-only), a file on disk, or a `file:` or `redcode-game:` URI string. With `node`, a path as in the JSON (`graph.Data.nodes.12`), the tree opens expanded to it with the node selected, also in a file that has its own view (3D, atlas, table). On `main`, in the next release after 0.10.3 |

### Sound references

`sound(ref)` takes one of these, the shape EDGEwave's `edgewave.openSound` takes too:

| Reference | For | Comes back as |
|---|---|---|
| `{ soundHash, eventHash? }` | A sound effect in the game's `sfx_container.opusinfo` | 16-bit WAV at 48 kHz |
| `{ path }` | A game file, such as a voice line (`base\localization\en-us\vo\...wem`) | Ogg Vorbis for a `.wem`, through REDcode's export cache |
| `{ uri }` | A file on disk or a `redcode-game:` URI | Ogg Vorbis for a `.wem`, WAV for Opus, other formats as they are |

VS Code's webview cannot decode Opus, so REDcode decodes it and returns WAV. Ogg Vorbis and WAV decode with the webview's `decodeAudioData`, so a caller needs no decoder of its own.

## Open in EDGEwave

REDcode's audio player and its sound list (Browse Game Sounds) have an **Open in EDGEwave** button. It runs EDGEwave's command `edgewave.openSound` with the reference of the sound now playing:
- A sound effect gives `{ soundHash, eventHash }`.
- A game file gives `{ path }`.
- A file on disk gives `{ uri }`.

Without EDGEwave installed, the button offers to install it.

## Menus in the Project view

Another extension can add entries to the right-click menu of REDcode's Project view (`view == redcode.project`). Each file's `viewItem` is `projectFile`, then a kind, then tags, so a `when` clause can match the files an entry is for.

| Part | Values | For |
|---|---|---|
| Kind | `.texture` (`.xbm`), `.model.mesh` (`.mesh`), `.model` (`.glb`, `.gltf`), `.sound` (`.wem`, `.wav`, `.ogg`, `.opus`, `.mp3`, `.flac`), `.mlsetup`, `.mltemplate`, or none | What the file is |
| Tag | `.export` (under `source/archive`, exportable), `.import` (under `source/raw`, importable), or none | What Export and Import take |

For example, `projectFile.sound.import` is a `.wav` under `source/raw`. Match the start, so later tags do not break an entry:

```json
{ "command": "edgewave.open", "when": "view == redcode.project && viewItem =~ /^projectFile\\.sound/" }
```

The kinds `.sound` and `.mlsetup` are there since REDcode 0.10.3, for EDGEwave and EDGEmat; `.model.mesh` and `.mltemplate` since 0.10.5 (`/^projectFile\.model/` still matches every model). Folders are `projectFolder` and the source roots `projectRoot`, with the same tags.

## Menus in the Game Assets view

Game files in Game Assets (`view == redcode.assets`) are `assetFile`, with a kind for some: `assetFile.texture` (`.xbm`), `assetFile.mesh`, `assetFile.mlsetup` and `assetFile.mltemplate` (since 0.10.5). Folders are `assetFolder`. An entry's command gets the node, `{ kind: "file", file: { name, archive, size, hash } }`, where `name` is the game path.

```json
{ "command": "edgemat.openMesh", "when": "view == redcode.assets && viewItem =~ /^assetFile\\.(mesh|mlsetup|mltemplate)$/" }
```
