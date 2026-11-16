---
title: Library view (#23)
---

# Library view: browse the EDGE Library, and take items back out

Draft 0.1, 2026-11-15, for the owner to agree. Asked for in [REDcode issue #23](https://github.com/Edgemodders/REDcode/issues/23), agreed on 2026-11-06 to wait for EDGEfab's Library view and work as it does. EDGEfab's view is built (EDGEfab ba48d79, 2026-11-13; not released yet, and its own notes say its Library commands are untested).

REDcode can put things into the Library (**Add to Library**, [#19](https://github.com/Edgemodders/REDcode/issues/19), REDcode 0.10.6) but cannot see the Library or take anything back out. Today a modder finds and deletes items in File Explorer, and nothing copies an item into a project.

The owner, 2026-11-15: each tool keeps its own view of the Library, even when two tools show the same Library, so a modder does not have to switch tools to see it. The rules are the shared ones: [EDGEbuilder's Library page](https://edgemodders.github.io/EDGEbuilder/library.html#shared-rules).

## What EDGEfab's view does

Read from EDGEfab's checkout on 2026-11-15 (`extensions/edgefab/src/libraryView.ts`, `src/core/library.ts`):

| Part | EDGEfab |
|---|---|
| Tree | The modder's folders, then items (`<name>.<kind>.asset`) by name, then loose model files (`.glb`, `.gltf`, `.fbx`, `.blend`). Hidden folders, `.asset` and `.bake` folders are not shown as folders |
| An item | Its name from `asset.json`; the version (props) or the kind as description; a tooltip with name, kind, version and folder. Children: for its own props, version, date, entity, size, parts, licence; for other tools' items, a line in words ("a game mesh, from another EDGE tool") and the main game path |
| No Library | An empty view with **Set Up the Library...**; a recorded folder that is gone shows one warning line; an empty one says "Empty so far" |
| Refresh | A button only: no file watcher. Also after Add to Library and setting the folder |
| Actions on its own props | **Add to Project**, **Open in 3D**, **Edit on the Desk**, **Reveal in File Explorer** |
| Actions on other tools' items | **Reveal in File Explorer** only |
| Title bar | **Refresh Project from Library** (items with a newer version in the Library), Refresh, the Library folder, the game path folder |
| Rename, delete | Not in the view: those stay with File Explorer |
| Add to Project | Copies the prop's files (its record lists them) into the project at the same relative paths, after deleting the files its earlier entry put there; no question asked. Writes the came-from note `source/library.json`, rewriting only its own entry (`by: "edgefab"`, the same `id`) and keeping every other tool's |
| The project | REDcode's open project through `REDcodeApi.project()`, else an Open dialog for a `.cpmodproj` |

## The design

**A Library view in REDcode's activity bar**, under Project and Game Assets, built as EDGEfab's is:

```
LIBRARY                                   ⟳  ⇣  …
▾ Development
  ▾ Meshes
      w_rifle_sniper__nokota_osprey…      mesh
      ▸ jacket_red                        prop · EDGEfab
  ▸ Bakes
```

- **The tree:** folders, then items by name, then loose model files, with EDGEfab's rules for what is a folder. An item's description is its kind; another tool's item also says which tool, from `asset.json`'s `history` (REDcode writes `tool` there; whether every other tool does is unverified, and without it the kind alone shows). The tooltip: name, kind, version, folder, the main game path, and where it came from.
- **No Library:** an empty view with **Set Up the Library...**, which is REDcode's existing root picker from Add to Library. A recorded folder that is gone: one warning line.
- **Refresh:** a title-bar button, and after REDcode's own Add to Library. No file watcher, as in EDGEfab.

**Actions:**

| On | Action | Does |
|---|---|---|
| REDcode's kinds (an item with a `source/archive` whose kind is a game file type: `mesh`, `ent`, `app`, `mi`, `mlsetup`, `xbm` and the like) | **Add to Project** (inline and menu) | Copies the item's `source/archive` into the open project's, at the same game paths, and writes REDcode's entry in `source/library.json` |
| The same | Click | Opens the item's main file in REDcode's editor, as a project file opens (a mesh on its 3D view) |
| Every item, folder and model file | **Reveal in File Explorer** | As in EDGEfab |
| Other tools' items (`prop`, `sound`, `quickhack`, `.bake` folders) | Reveal only | Each tool adds its own kinds to a project, so the files and records it keeps stay right. As EDGEfab does with REDcode's items |
| Title bar | **Refresh Project from Library** | The project's REDcode entries whose Library item has a newer `version`, offered ticked in a list, as in EDGEfab; entries whose item is gone are named |

**Add to Project in detail:**
- **No project open:** it says so, with **Open Project**. (EDGEfab's Open dialog is for a tool that is not REDcode; REDcode has its own project.)
- **The came-from note** follows the shared rules: `{ format: 1, items: [...] }`, REDcode's entry `{ id, kind, path, version, hash?, added, by: "redcode", files }`, with `path` relative to the Library root with `/`, and `files` relative to the project. It rewrites only entries with `by: "redcode"` and the same `id`, and keeps every other tool's entries and any other fields.
- **The same item again:** its earlier files (from its entry) are replaced, as in EDGEfab.
- **A file the project already has that is not from this item:** see decision 2.
- After it: the files are selected in the Project view (`revealInProject`), and the message offers **Pack and Play**.

**In code:** the view in a new `src/libraryView.ts`; the reading and the note in `src/library.ts`, which has no VS Code imports, so the MCP server can bundle it (decision 1). An MCP tool `library_add_to_project` would follow the same code; not in this step unless asked.

One step, with one hand test: the view with no Library, with REDcode's and EDGEfab's items, Add to Project into a project with and without the files, Refresh Project from Library after Add to Library again, and EDGEfab's view beside it reading the same note.

## Decisions

For the owner:

1. **Whose code reads the Library and writes the note.**
   - **(a) REDcode's own,** in `src/library.ts`: a folder listing, `asset.json` reading and the note's read and write, a few small functions. REDcode already owns its side of the Library rules (Add to Library is its own code, not EDGEfab's). It can start now. The risk is drift from EDGEfab's reading of the same rules; the hand test reads one note with both tools to catch it.
   - **(b) EDGEfab's,** through `@edgemodders/edgefab-core`, as REDcode uses edgemat-core. One reading of the rules. But the package is not on npm yet (EDGEfab has no release), it brings EDGEfab's own code and edgemat-core with it, and its Add to Project takes props only, so REDcode would still write its own add.

   Proposed: (a). (Earlier in chat I leaned to (b); reading the package changed that: REDcode would use only its readers, and it waits on EDGEfab's first release.)
2. **A file the project already has that did not come from this item.**
   - **(a) Ask once:** "3 files in the project would be replaced: Replace, or Cancel", listing them. A project's files are usually the modder's own edits.
   - **(b) Overwrite**, as EDGEfab does.

   Proposed: (a).
3. **Rename and delete in the view.** Proposed: not at first, as in EDGEfab; File Explorer does them, and REDcode's Refresh shows the result.

## Not in this design

- Adding EDGEfab's props, sounds or quickhacks to a project from REDcode: their tools do it.
- Library bakes (`.bake` folders): EDGEbuilder's **Include in project** does them.
- A file watcher on the Library.
- Opening a prop in 3D from REDcode's view: EDGEfab's view does it, through REDcode's mesh viewer.
