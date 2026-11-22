---
title: Sector scripts
---

# Sector scripts: small JavaScript tools over a sector's nodes

Draft 0.1, 2026-11-22, for the owner. The owner asked for it on 2026-11-22. A sector has thousands of nodes, and a few may have wrong values, such as a streaming distance below 45. Nobody can find those by hand. A short script can: walk every node, or only the selected ones, and select the ones that match, change a value, or hand them to another EDGE tool or to an assistant. The owner also asked for MCP tools for sector editing, which assistants need either way.

## How it differs from the script runner dropped in October

The C5 design dropped a general script runner on 2026-10-14 (`docs/design/view.md`, point 4): asking an agent covered what WolvenKit's scripts did. This is narrower, and it covers a case agents handle badly:

- **It works on the document open in the editor**, through the editor's own selection, undo and save. It is not a free-standing runner over files.
- **It is exact and cheap.** "Every node whose streaming distance is under 45" is a loop. An agent reading 9,000 nodes would be slow, costly and liable to miss some.
- **Agents still do the judgment work.** A script can pick the nodes and hand them to an assistant with a request, such as "check these for wrong values and fix them". The assistant then uses the MCP tools.

## What the modder sees

| Where | What |
|---|---|
| The sector view's bar | A **Scripts** button with a dropdown menu: the scripts, each with **Run on All** and **Run on Selection**; then **New Script…**, **Edit**, **Remove**, **Debug** and **Open Scripts Folder** |
| While a script runs | The button shows a spinner and a count of nodes visited. **Stop** ends it. Nothing changes in the sector until it finishes |
| When it finishes | A line under the view, such as "Short streaming distance: 312 selected, 0 changed, 0.4 s". The selection list shows what it picked. Its log goes to the REDcode output channel |
| When it changes values | A preview first: "312 changes to `streamingDistance`" with the list, then **Apply** or **Cancel**. Apply is one edit, so one Ctrl+Z undoes all of it. Values change only in a project's copy of the sector; on a game file the preview offers **Add to Project** first |

**New Script…** asks for a name and starts from a template, then opens the file in an editor tab. **Debug** runs the script under VS Code's own JavaScript debugger, stopped at its first line, so breakpoints, stepping and the Debug Console work.

## The script

A script is one `.mjs` file. Its default export names it and gives either `visit`, called for each node, or `run`, for full control.

```js
// Short streaming distance: selects nodes the game stops drawing closer than 45 m, and offers to set them to 90.
export default {
  name: "Short streaming distance",
  description: "Nodes drawn only within 45 m",
  visit(node, ctx) {
    if (node.streamingDistance < 45) {
      ctx.select(node);
      node.set("streamingDistance", 90); // a change for the preview, applied only on Apply
    }
  },
};
```

| `node` | What it has |
|---|---|
| `id`, `entry` | The node data entry's id (`<sector>#<entry>`), as the sector view, ArchiveXL and REDnode name it |
| `type` | The node's class, such as `worldMeshNode` |
| `mesh`, `appearance`, `position`, `streamingDistance` | The usual facts, read from the node and its node data entry |
| `get(path)`, `set(path, value)` | Any property, by its path in the node's JSON. `set` records a change for the preview |
| `json` | The node's JSON, read-only, for anything else |

| `ctx` | What it does |
|---|---|
| `nodes()`, `selected()` | Every node, or the ones selected when it ran (`run` uses these) |
| `select(node)`, `deselect(node)` | Builds the selection the view shows when the script ends |
| `log(...)` | A line in REDcode's output channel |
| `game.read(path)` | Another game or project file as JSON, such as a node's mesh |
| `tools.call(extension, method, ...args)` | Another EDGE extension's API, by its extension id: EDGEmat's `renderMaterials`, `REDcodeApi.openFile`. REDcode passes the call on, and only to extensions that export an API |
| `agent.request(text, nodes)` | Hands nodes to an assistant with a request (below) |

## Where scripts run

In a **separate Node process** that REDcode starts and talks to over a pipe, not inside VS Code's extension host. That means:

- A script that loops forever or crashes does not hang or crash VS Code. **Stop** kills the process.
- **Debug** starts the process with Node's inspector and attaches VS Code's built-in JavaScript debugger.
- The script gets the sector's JSON once, at the start, as a snapshot. Its `set` calls come back as a list of changes, which REDcode applies to the open document as one JSON Patch. That is the editor's usual `cr2w.patch`, with undo.
- `tools.call` and `agent.request` are messages back to REDcode, which runs them in the extension host.

Scripts are code the modder runs, with the modder's rights. They run only in a trusted workspace (VS Code's Workspace Trust), and a script from someone else is opened for reading before it can be run.

## Handing work to an assistant

Claude Code has no API another extension can send a prompt through, and EDGEchat is a Claude Code plugin, not an extension. So `agent.request(text, nodes)` makes a **request** the assistant picks up through MCP:

1. REDcode saves the request to the project's `.redcode/requests/<id>.json`: the text, the sector's game path, and each node's id, type, mesh and the properties the script names.
2. It copies a one-line prompt, such as "Do REDcode request 3: check these 40 nodes for wrong values", and offers **Open Claude Code**.
3. The assistant reads the request with the MCP tool `request_get`, does the work with the sector tools below, and marks it done with `request_done`. REDcode shows the request's state in the output channel.

## MCP tools for sectors

In redcode-mcp, the server assistants already use. They work on files on disk through its own REDbridge, as every redcode-mcp tool does. A sector open in REDcode reloads when its file changes. If the open copy has unsaved edits, REDcode asks which copy to keep, as for any file changed outside the editor.

| Tool | What it does |
|---|---|
| `sector_nodes` | A sector's nodes, filtered by type, mesh, property path and value, or a box in the world; a page at a time |
| `sector_node` | One node and its node data entry, in full |
| `sector_patch` | Changes to a project's copy of a sector, as JSON Patch on nodes and node data. Refuses a game file and says to add it to the project first |
| `script_list`, `script_run` | The modder's scripts, run by name on a sector, returning what they selected and the changes they would make. Changes are applied only with `apply: true` |
| `request_get`, `request_done` | The requests scripts made |

## Phases

| Phase | What | Test |
|---|---|---|
| SC1 Read | The Scripts menu: new, edit, remove, run on all or on the selection, debug, stop. `visit` and `run`, the node and `ctx` with `select`, `log` and `game.read`. No changes yet | A short streaming distance script selects the right nodes on `exterior_-22_7_0_0`, checked against the tree |
| SC2 Change | `set`, the preview, one undoable patch, project copies only, and the replaced-sector warning | Set 90 on the found nodes, undo, redo, save, pack, see it in the game |
| SC3 Other tools and assistants | `tools.call`, `agent.request` and the request files | A script hands 10 nodes to Claude Code, which reads them through `request_get` |
| SC4 MCP | The sector, script and request tools in redcode-mcp, released as its next version | An assistant finds and fixes the same nodes with no REDcode window open |

## Decisions for the owner

| # | Question | Recommendation |
|---|---|---|
| 1 | Where scripts live | **Two places.** A project's own scripts in its `.redcode/scripts/` (REDcode already keeps `.redcode/` in projects; it is never packed). Your own scripts in `%APPDATA%\Edgemodders\redcode\scripts`, offered in every project. Plus a few examples shipped with REDcode, read-only, with **Copy to My Scripts** |
| 2 | What changing a game sector means | **Editing a project's copy of the sector**, which replaces the whole sector in the game, with the warning REDcode is to give anyway (it can undo EDGEbuilder's ArchiveXL deletions). Changing single nodes through ArchiveXL mutations, which leave the rest of the sector to the game and other mods, is EDGEbuilder's world editing and a later step |
| 3 | Only sectors, or the whole CR2W editor | **Sectors first**, with the API shaped so `.ent`, `.app` and `.mesh` follow: a node is "an entry in this file", and `visit` walks whatever the file holds |
| 4 | How an assistant receives a request | **The request files and MCP tools above.** The other choice is REDcode calling Claude's API itself with the Anthropic key in the Keys store. That would make REDcode an agent, which the owner set aside when C6 was dropped (2026-10-16) |

## Not in this design

- Moving, adding or deleting nodes in the 3D view: EDGEbuilder's.
- Scripts that run by themselves on save or import (the "hooks" gap from October). They could come later as a script setting, if wanted.
- Sharing scripts through the EDGE Library.
