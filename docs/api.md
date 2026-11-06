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
| `packAndPlay()` | Packs and gets the mod into the game: `"rednode"` when REDnode's `archives_reload` swapped it into the running game (REDnode running with its MCP server on; sound archives too); `"hot"` when it went to Red Hot Tools' hot folder, which the running game reloads (never for an archive with sound paks); `"installed"` when it was installed for the next start; `undefined` when the pack failed, REDnode refused or swapped nothing, a hot swap was refused and the user did not install instead, or when it would break the mod (a missing REDmod custom sound) and the user cancelled. `"rednode"` since 0.10.4. `packAndTry()` is the same function under its old name, kept for tools that call it; `packAndPlay()` since 0.10.5 |
| `editInBlender(file)` | Opens a project `.glb`, `.gltf` or `.mesh` in Blender; each save there is imported back into `source/archive` |
| `openFile(target, node?)` | Opens a file in the CR2W editor. `target` is a game path (`base\journal\cooked_journal.journal`, opened read-only), a file on disk, or a `file:` or `redcode-game:` URI string. With `node`, a path as in the JSON (`graph.Data.nodes.12`), the tree opens expanded to it with the node selected, also in a file that has its own view (3D, atlas, table). On `main`, in the next release after 0.10.3 |
| `openAnimation(path, animationName?)` | Opens an `.anims` file on its Animations view, playing on the rig the file names. `path` is what `openFile` takes. With `animationName` it opens at that animation; a name not in the file is said in the editor's status line, and the first animation plays. A path that is not an `.anims` is refused. For a Preview button: check `typeof api.openAnimation === "function"` first. Since 0.10.7 |

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
| Tag | `.export` (under `source/archive`, exportable), `.archive` (under `source/archive`, not exportable), `.import` (under `source/raw`, importable), or none | What Export, Import and Add to Library take |

For example, `projectFile.sound.import` is a `.wav` under `source/raw`. Match the start, so later tags do not break an entry:

```json
{ "command": "edgewave.open", "when": "view == redcode.project && viewItem =~ /^projectFile\\.sound/" }
```

The kinds `.sound` and `.mlsetup` are there since REDcode 0.10.3, for EDGEwave and EDGEmat; `.model.mesh` and `.mltemplate` since 0.10.5 (`/^projectFile\.model/` still matches every model); the tag `.archive` since 0.10.6. Folders are `projectFolder` and the source roots `projectRoot`, with the same tags.

## Menus in the Game Assets view

Game files in Game Assets (`view == redcode.assets`) are `assetFile`, with a kind for some: `assetFile.texture` (`.xbm`), `assetFile.mesh`, `assetFile.mlsetup` and `assetFile.mltemplate` (since 0.10.5). Folders are `assetFolder`. An entry's command gets the node, `{ kind: "file", file: { name, archive, size, hash } }`, where `name` is the game path.

```json
{ "command": "edgemat.openMesh", "when": "view == redcode.assets && viewItem =~ /^assetFile\\.(mesh|mlsetup|mltemplate)$/" }
```

## Opening TweakDB records in your tool

A tool can claim the TweakDB records it is made for, so a click on one in REDcode's TweakDB view opens it in the tool, not in REDcode's record page (REDcode issue #22, for EDGEhack; since 0.10.6). Declare them in your extension's `package.json`. REDcode reads every installed extension's `package.json`, so your extension need not be running, and needs no `extensionDependencies` for this.

```json
"edgemodders": {
  "opens": [
    { "tweakdb": { "type": "Item", "flat": "itemType", "is": "ItemType.Prt_Program" }, "command": "edgehack.openQuickhack" },
    { "tweakdb": { "type": "ObjectAction", "flat": "isQuickHack", "is": true }, "command": "edgehack.openQuickhack" }
  ]
}
```

| Field | Means |
|---|---|
| `tweakdb.type` | A record type as `tweakdb.records` takes it: the short form (`Item`) or the RED class (`gamedataItem_Record`). Subtypes are included |
| `tweakdb.flat`, `tweakdb.is` | Optional, and only together: only records whose flat has that value. A record link or name matches ignoring case (`ItemType.Prt_Program`), a number or boolean exactly, a list when one of its elements does |
| `command` | Your command. It gets one argument: the record's path, or its id (`0x...`) when it has no path |

What REDcode does with it:

- A click on a matching record runs your command, in the TweakDB view and its filter results. The record's tooltip says so.
- The record's right-click menu keeps **Open Record** for REDcode's page, and adds **Open In...**, which lists every tool that claims it.
- The record page has an **Open in <tool>** button, for a record reached by a link.
- When two tools claim a record, the first one found wins the click; both are in **Open In...**.
- A claimed record's `viewItem` is `tweakRecord.claimed`; others stay `tweakRecord`. Match `/^tweakRecord/` for an entry on every record.
- REDcode works out a claim's records when the view first lists them, once per bridge: for EDGEhack's two claims on game 2.5, 92 of 10,203 items and 417 of 2,195 object actions, in under 0.1 s.

A malformed entry is skipped, with a line in Output > REDcode. `"files"` entries, for files in the Project and Game Assets views, are planned and are not read yet.

## REDnode packages: the redcode service

REDnode packages, such as EDGEbuilder, cannot reach a VS Code extension's API. For them REDcode installs a small REDnode package with the id `redcode` into the game's `red4ext/plugins/REDnode/apps` folder, when the game has REDnode (REDcode issue #18, since 0.10.5; the setting `redcode.rednode.installPackage` turns it off). It has no window, only a service:

```js
import { service } from 'rednode';

const redcode = await service.connect('redcode');
const project = await redcode.project();   // or null
redcode.$on('project-changed', (p) => console.log(p?.modName ?? 'no project'));
```

| Member | What it does |
|---|---|
| `project()` | The open project, in the same shape as `project()` above: `{ name, modName, file, dir, archive, raw, resources, packed }`. `null` when REDcode is not running or has no project open. Read-only, and a tool for AI assistants (`redcode__project`) |
| `project-changed` | An event with the new `project()`, when a project opens or closes, another VS Code window with a project gets the focus, or VS Code closes (seen within 5 seconds) |

With several VS Code windows, the window last focused with a project open is the one that counts. Without the package or without REDcode, `service.connect('redcode')` fails or `project()` answers `null`: carry on without a project. How it works: each REDcode window writes its project to `project.json` in the `REDcode` folder under `%LOCALAPPDATA%`, with its process id, and the package reads that file.
