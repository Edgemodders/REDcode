---
title: Sector Tools
---

# REDcode and Sector Tools

Draft 0.3, 2026-11-20; **agreed 2026-11-25** (the three decisions below). **Sector Tools** shows the sector renderer in the game, finds sectors and nodes, and flies a free camera to a node, with an **Edit** switch as EDGEbuilder has. The owner asked for it on 2026-11-20.

- **Draft 0.1:** REDcode drafted it first, as an app pack of REDcode's own.
- **To EDGEbuilder:** the same day the owner agreed it fits better with EDGEbuilder. It went to EDGEbuilder's session in [EDGEbuilder #9](https://github.com/Edgemodders/EDGEbuilder/issues/9).
- **Inside EDGEbuilder's World tab:** EDGEbuilder's answer, agreed with the owner the same day ([its comment](https://github.com/Edgemodders/EDGEbuilder/issues/9#issuecomment-7041693362)), puts Sector Tools inside EDGEbuilder, not in a pack of its own, so there is one camera and one Edit switch:
  - **World > Sectors** finds sectors, beside **World > Nearby**.
  - A **Sector** drawer holds the nodes, and the 3D view later.
  - One **Picked in the world** panel shows what is picked.
  - Remove Doors stays the separate pack for players.
- **EDGEbuilder's stages:** S1 sectors without 3D, S2 the 3D view on REDcode's drawing package, S3 the previews.

This page is REDcode's half: what REDcode gives Sector Tools, and the link between REDcode and the game. It comes right after REDcode's [Sector view](sector-view.html). The owner said the parts may change after user testing.

## The principle

REDcode views and edits every game file sensibly by itself, and the specialised tools add their deeper editors when they are present (the owner, 2026-11-20). A modder often browses game files to see what they are before deciding on deeper changes. Without REDcode's own views, they would need every tool and a lot of tool hopping just to see a file's structure or render. The audio player is the example: it plays a sound while the modder hunts for an asset, without the full EDGEwave editor.

So REDcode keeps its read-only 3D sector mode for any sector. EDGEbuilder's Sector Tools in the game (its World tab), and EDGEbuilder for VS Code's world map and sector view, are the deeper tools beside it.

## What REDcode gives Sector Tools

| Part | What | Where |
|---|---|---|
| **The drawing package** | The host half and the page half, as agreed with EDGEbuilder in [#8](https://github.com/Edgemodders/EDGEbuilder/issues/8). The page half has no VS Code parts: it takes the GLBs as bytes or URLs it is given, so it runs in a REDnode overlay page as in a webview. The host half takes any `Bridge` with `request`, so REDnode's shared `kernel.bridge()` serves it in the game | `@edgemodders/world-view`, built with the sector view |
| **Open in REDcode, from the game** | The `redcode` REDnode package gets a `reveal({ sector, entry })` function. The REDcode window holding the open project shows the sector in its sector mode at that node, with **Add to Project** offered when the sector is not in the project | `rednode/redcode/service.mjs`, and a watched request file in each window (decision 1) |
| **Show in Game** | REDcode's sector mode gets **Show in Game** on a node (a button, and the context menu), which calls Sector Tools' `focus`. As nodes are picked in REDcode, it sends `select` | `src/sectorView.ts` |
| **Live previews** | When the project's copy of a game sector is saved, REDcode works out the changed nodes against the game's own sector (moved, removed, added) and sends them to Sector Tools' `preview`. **Pack and Play** then makes them real | `src/sectorView.ts`, with the CR2W editor's save |
| **A warning for replaced sectors** | A project that replaces a game sector can break EDGEbuilder's ArchiveXL node deletions on that sector (each checks `expectedNodes`), and two mods replacing one sector clash. REDcode says so when a game sector is added to a project, naming EDGEbuilder's scenes that edit it if its service can tell | Add to Project, and the sector mode's title |
| **Offering EDGEbuilder** | Once, when a sector opens in the sector mode and EDGEbuilder is not in the game: a link to its Nexus page, or **Install with EDGEdeck** when EDGEdeck is there. Never installed without asking | `src/sectorView.ts` |

## The calls

Agreed in EDGEbuilder #9 on 2026-11-20: EDGEbuilder proposed the shape, and REDcode confirmed it with three points ([REDcode's comment](https://github.com/Edgemodders/EDGEbuilder/issues/9#issuecomment-7042638612)). `sector` is the game path, and `entry` the node data index, as in the drawing package's ids (`<sector>#<entry>`).

The first four are `@tool` functions on EDGEbuilder's service (`edgebuilder/service.mjs`). REDcode calls them through REDnode's MCP server, with its port and token, as Pack and Play calls `archives_reload`; they are listed there as `edgebuilder__select` and so on.

| Call | Does | Answers |
|---|---|---|
| `select({ sector, entry })` | Opens the Sector drawer on that sector with the node selected, and outlines it when streamed in | `{ selected: true, streamed }` |
| `focus({ sector, entry })` | As `select`, then flies the camera there and turns Edit on | `{ focused: true, streamed }`, or `{ focused: false, why }` (no game loaded), which REDcode shows as it is |
| `preview({ sector, nodes: [{ entry, action: "move" \| "remove" \| "add", mesh?, position?, orientation?, scale? }] })` (EDGEbuilder's S3) | Shows REDcode's edits: a removed node hidden, a moved node hidden with a stand-in mesh at its new place, an added mesh spawned. The place is in the node data's own form and the game's axes (Z up), as REDcode reads it from the sector: `position` [x, y, z], `orientation` the quaternion [i, j, k, r], `scale` [x, y, z]. `move` and `add` carry all three. `mesh` is a game path, left out for a move that keeps its mesh. Entry numbers are the project copy's, so an added node's is past the game's count | `{ shown, refused: [{ entry, why }] }`. A mesh only in the project is refused until it is packed into the game ("... is not in the game yet: Pack and Play first"), and REDcode then offers Pack and Play |
| `clearPreviews({ sector? })` (S3) | Takes them away, for one sector or all | `{ cleared }` |
| `scenesEditing(sector)` | The scenes (Library, the open project, This PC) whose world edits name that sector, for REDcode's warning | `[{ name, file, place, removals }]` |
| `reveal({ sector, entry })`, the other way | On REDcode's `redcode` REDnode package: the REDcode window holding the project shows the sector at the node | Through a request file to the right window (decision 1) |

When REDnode or EDGEbuilder is not running, REDcode's Show in Game says so and offers **Run Game**, and nothing else changes.

## Steps

| Step | What | Waits on |
|---|---|---|
| **L1 Show in Game and Open in REDcode** | `reveal` in the `redcode` package and its request file; Show in Game and `select` in the sector mode; the pack offer | REDcode's sector view; EDGEbuilder's S1 (`select`, `focus`, `scenesEditing`) |
| **L2 Live previews and the warning** | The changed nodes on save, sent to `preview`; the replaced-sector warning | L1; EDGEbuilder's S3 (`preview`, `clearPreviews`) |

Each step with a hand test in the game, together with EDGEbuilder's matching step.

## Decisions for the owner

**Decided by the owner on 2026-11-25:** 1 as (a), already the way since Sector layers' L4 (`openSector` writes `open-request.json` beside `project.json`, [Sector layers](sector-layers.html)), with (b) only to bring VS Code to the front if a link proves possible; **2 (a)**, a warning the modder can dismiss, never a block; **3 (a)**, offered once, not again after it is dismissed. REDcode's half is built after EDGEbuilder's S1.

1. **How the game reaches REDcode.**
   - **(a)** The `redcode` service writes the request to a file for the window holding that project, which that REDcode window watches. This builds on #32's file of every window's project.
   - **(b)** The app opens a `vscode://edgemodders.redcode-cyberpunk/reveal?...` link, which VS Code routes to REDcode and which brings VS Code to the front. Whether a REDnode app may open a link is unverified, and with two windows open VS Code chooses one.

   Proposal: (a), with (b) only to bring VS Code to the front, if EDGEbuilder's probe shows a link can be opened.
2. **The replaced-sector warning:** when a game sector is added to a project, and in the sector mode's title. Proposal: as said, as a warning the modder can dismiss, not a block.
3. **Offering EDGEbuilder** from REDcode once, when a sector opens and EDGEbuilder is not in the game. Proposal: as said.

## Not in REDcode

- The Sector Tools app, its camera and its Edit switch: EDGEbuilder's ([#9](https://github.com/Edgemodders/EDGEbuilder/issues/9)).
- Editing nodes in a 3D view: the CR2W editor's tree edits a sector, and EDGEbuilder places and removes things.
- The world map: EDGEbuilder for VS Code's E1.
