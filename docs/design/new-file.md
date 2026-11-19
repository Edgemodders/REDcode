---
title: New File
---

# New File: make a game file from nothing

Draft 0.2, 2026-11-19, agreed with the owner (decisions below). The owner asked for it on 2026-11-19, after right-clicking a project folder under Archive and finding no **New...** entry. It comes after Animations A3 (the owner, the same day). Nothing is built yet.

Today REDcode makes new files only from something else:

| File | How, today |
|---|---|
| `.xbm` | An image (PNG, TGA, DDS) in Raw at the game path, then **Import from Raw** on that one file |
| `.mesh` | **Import from Raw** on a GLB, with a game mesh as template when the GLB has none |
| `.inkatlas`, `.mi`, `.ent`, `.app` and the rest | **Add to Project** on a game file, then rename it and edit it |
| Onscreens and its `.xl` | **Add to Project Onscreens** on a LocKey, the first time |
| `.tweak` | **New Tweak from This Record...** in the TweakDB view |

## What WolvenKit does

Read from WolvenKit's source on GitHub on 2026-11-19 (`WolvenKit.App/ViewModels/Dialogs/NewFileViewModel.cs`, `WolvenKit.App/Resources/WolvenKitFileDefinitions.xml`):

- **Add New File** has four groups: CR2W Files, TweakDB (a blank TweakXL `.yaml`), ArchiveXL (a blank `<project>.archive.xl`) and Scripts (a blank `.reds`, and an `init.lua` for Cyber Engine Tweaks).
- **CR2W Files** lists every game file extension WolvenKit knows. Each gets the class of its root: a new `.inkatlas` holds an empty `inkTextureAtlas`.
- A file starts empty, from the class's defaults. WolvenKit's type templates (`RedTypeTemplateService`, kept in the WolvenKit-Resources repo) are quest node definitions for its graph editors, not file templates.
- The file goes where the dialog is opened, named `<Type>1.<ext>` until renamed. Text files go to their usual folders (`r6/tweaks`, `r6/scripts`, the CET folder).

## What REDbridge can do already

Checked on 2026-11-19 with REDbridge 0.13.0 through the MCP tools: `cr2w.createInstance("inkTextureAtlas")` gives the root with three empty slots, as game atlases have, and `cr2w.fromJson` writes a file from `{ Header, Data: { Version: 195, BuildVersion: 0, RootChunk, EmbeddedFiles: [] } }`. The 670-byte atlas it wrote opened again with `cr2w.open` as an `inkTextureAtlas`, with its slot texture and part. So **no REDbridge release is needed** for the CR2W types. Found on the way: inside `fromJson`, a CName must be in its full form (`{ "$type": "CName", "$storage": "string", "$value": "..." }`); a plain string is refused. Game files carry `cookingPlatform: PLATFORM_PC` where the default is `PLATFORM_None`; REDcode would write `PLATFORM_PC` like the game. Whether the game minds either value is unverified.

## The design

**New File...** on any folder in the Project view, and on the project itself. A quick pick lists the types; then a name; then the file is written, selected in the Project view and opened in its editor.

```
New File in base\gameplay\gui\mymod
  GAME FILES
    Texture from an Image...        .xbm   picks a PNG, TGA or DDS
    Ink Atlas                       .inkatlas
    Material Instance               .mi
    Entity                          .ent
    Appearance                      .app
    Multilayer Setup                .mlsetup
    Start from a Game File...       searches the game, copies it here
  TEXT FILES
    TweakXL                         .yaml     goes to r6/tweaks
    ArchiveXL                       .xl       goes to resources
    Redscript                       .reds     goes to r6/scripts
```

**The name:** one input box, with the extension added. It is checked as a game path: lowercase, no spaces, no characters the game cannot hash. The folder's game path comes from where it was opened.

**Each type:**

| Type | Starts as |
|---|---|
| Texture from an Image | Picks the image, copies it into Raw at the same game path, and imports it as a new `.xbm` (REDbridge `project.import` with a texture setup, as `importFile` does since #25). A small choice of setups: color, normal map, mask. The values of each are to be read from game textures when it is built |
| Ink Atlas | Asks for its texture: an `.xbm` in the project, or **Texture from an Image...** first. Writes one slot on that texture with one part, `whole`, covering it, so the atlas view opens on something to draw on |
| Material Instance | Asks for its base material from a short list (`engine\materials\multilayered.mt` and the other common ones, to be read from the game) or any `.mt` or `.mi` path |
| Entity, Appearance, Multilayer Setup | Empty, from the class's defaults, as in WolvenKit |
| Start from a Game File | **Search game files**, then copies the pick into this folder under the new name. Today's Add to Project and a rename, in one step |
| Text files | A blank file with a comment line saying what it is, in its usual folder, not the one clicked |

**In code:** `src/newFile.ts` with no VS Code imports (the type table, the root's JSON, the name check), so an MCP tool `project_new_file` can follow from the same code; `src/newFileCommand.ts` for the picker. The command `redcode.newFile` on `projectFolder` and project items.

One step with one hand test: each type made in a project folder, opened in its editor, packed, and the atlas and the material instance read back by the game (an atlas drawn by a widget, a material on a mesh), which needs a small test mod.

## Decisions

Agreed with the owner on 2026-11-19: each of the three as proposed.

1. **Which types at first.**
   - **(a) A short list of REDcode's own**, as above: the six game file types modders make most, each with a sensible start, plus Start from a Game File for everything else.
   - **(b) Every game file type, as WolvenKit does.** It needs the extension-to-class table, which REDbridge would give through a new method (a REDbridge release), and most of those types are useless empty.

   Proposal: (a), with (b) later if asked.
2. **Empty or with a start.** Proposal: the start in the table above for the texture, the atlas and the material instance, where an empty file is of no use until it names its texture or material; empty for the rest.
3. **Text files in the same menu.** Proposal: yes, as WolvenKit does, since a mod needs them as often. The TweakXL file as `.yaml` (WolvenKit's choice) or as `.tweak` (REDcode's own language support): proposal `.yaml`, with `.tweak` offered by New Tweak from This Record as today.

## Not in this design

- Renaming or moving files in the Project view, which would have to rewrite the paths other files hold.
- Templates a modder saves for later.
- New meshes from nothing (a GLB import does that).
