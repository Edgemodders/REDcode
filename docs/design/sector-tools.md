---
title: Sector Tools
---

# Sector Tools: the sector view in the game

Draft 0.1, 2026-11-20, for the owner. The owner asked for it on 2026-11-20, as the follow-up right after REDcode's [Sector view](sector-view.html): an optional REDnode app pack, **Sector Tools**, built and released from this repo beside REDcode. Its app, also **Sector Tools**, shows the same sector renderer in the game, finds sectors and their nodes, and flies a free camera to a node. With REDcode it makes one loop: pick a node in either place and see it in the other, and see an edit in the game as soon as it can be shown. Nothing is built.

## What there is to build on

| Piece | Where | State |
|---|---|---|
| The drawing package, host half and page half | This repo, [Sector view](sector-view.html#the-packages-api) | API agreed with EDGEbuilder on 2026-11-20; built after A3 |
| REDcode's read-only sector mode and `REDcodeApi.openSector` | This repo | Same |
| REDbridge `sector.find`, `sector.nodes` | REDbridge 0.12.0 | Released |
| A shared REDbridge for packages, `kernel.bridge()` | REDnode 0.17 and later | Released; EDGEbuilder uses it |
| The world node registry: `world.pick`, `world.node`, `world.setVisible`, `world.highlight` | REDnode 0.66 ([world.md](https://edgemodders.github.io/REDnode/world.html), REDnode #24) | S24 built; on 2.5 `highlight` was not working yet in 0.66.1, and `world.nodes` and `world.lookup` are planned (N2). Unverified where it stands now |
| Ids for the game's nodes | The registry | `0x<sector path hash>:<instance index>`, the same at every load, and what REDbridge reads from the sector outside the game. So it maps onto the package's `<sector path>#<entry>` by the FNV1a64 hash of the path |
| A free camera with an **Edit** switch in the title bar | EDGEbuilder's own code (`src/mod.ts`) | Built and tested in EDGEbuilder: an empty entity with a `gameCameraComponent`, `alwaysSpawned`, the HUD hidden, put back after a crash. Not a REDnode API |
| REDcode calling into the game | REDnode's MCP server, with its port and token | REDcode's Pack and Play already does (`archives.reload`) |
| The game calling into REDcode | REDcode's own REDnode package, `redcode` (`rednode/redcode/service.mjs`) | Today it only reads `%LOCALAPPDATA%\REDcode\project.json`; #32 asks for every window's project |
| An app pack released from outside REDnode | EDGEbuilder's Remove Doors (`packs/remove-doors`) | Released 2026-11-19: its `pack.json`, changelog, zip and Nexus page from EDGEbuilder's release workflow |

## The app

One window, **Sector Tools**, in REDnode's window style, with **Edit** in its title bar as EDGEbuilder has.

| Part | What it does |
|---|---|
| **Find** | Sectors by name or grid (`exterior_-25_18`), and **Near me**: the sectors whose box holds V or the camera (`sector.find` with a box). Kind and level filters as in EDGEbuilder's world map plan. A sector picked shows its nodes |
| **Nodes** | The sector's nodes from `sector.nodes`: class, resource, appearance, distance from the camera, with a filter (`door`, `.mesh`, a class). The ones the game has streamed in now are marked, from the registry |
| **3D view** | The drawing package's page half: the picked sector, and the coarser sectors over it with `sectorsOver`, drawn as in REDcode. It runs in the overlay's own Chromium; whether three.js's WebGL runs well there is the probe's first question |
| **A click on a node** (list or 3D view) | Selects it in both, and outlines it in the game when the game has it streamed in (`world.highlight`) |
| **A double-click** | Flies the free camera to the node: to its box's nearest good side, at a distance that fits the box in view, looking at its centre. Edit goes on if it was off. A node far from V works too, since the camera is `alwaysSpawned` and the world streams around it (as far as EDGEbuilder's #41 test showed) |
| **Edit on** | The free camera, the game's HUD hidden, the mouse in the world: a click on anything picks it with `world.pick`, and it is selected in the list and the 3D view, with its sector loaded if it was another |
| **Edit off** | V's own view and control back. The window stays, and list clicks still outline |
| **Hide** | Hides the node for the session (`world.setVisible`), shown again when the app stops, as EDGEbuilder's world inspector does |
| **Open in REDcode** | The sector opens in REDcode's sector mode at that node; with **Add to Project**, a copy of the sector goes into the open project first |

**Only one app has the camera.** Sector Tools' Edit and EDGEbuilder's Edit cannot both be on: turning one on turns the other off. How depends on decision 2.

## Between REDcode and the game

| From | To | What happens | How |
|---|---|---|---|
| REDcode's sector mode, a node selected | The game | The node is outlined there, if streamed in | REDcode calls Sector Tools' service tool `select({ sector, entry })` through REDnode's MCP server, as Pack and Play calls `archives.reload` |
| REDcode, **Show in Game** on a node (a button, and double-click) | The game | The game flies its camera there and outlines it, and the Sector Tools window comes up on the same node | Its tool `focus({ sector, entry })` |
| The game, **Open in REDcode** or a pick with Edit on | REDcode | The REDcode window with that project shows the sector at the node; VS Code comes to the front | The `redcode` service gets `reveal({ sector, entry })`, and the REDcode window it belongs to picks it up. Channel: decision 3 |
| REDcode, an edit to the project's copy of a sector | The game | Shown at once as a preview, then for real after Pack and Play | Below |

**Seeing edits in the game.** REDcode's sector mode stays read-only, as agreed; a sector's nodes are edited in the CR2W editor's tree, in the project's copy. Three speeds:

1. **At once, as a preview** (after each saved edit): REDcode sends the changed nodes to Sector Tools. A moved, turned or scaled mesh node: the game's own instance is hidden (`world.setVisible`) and a stand-in mesh spawned at the new transform (`world.spawn({ mesh })`, as EDGEbuilder's previews). A removed node: hidden. An added mesh node: a stand-in. Previews go when the app stops, or with **Clear Previews**.
2. **For real, a few seconds later:** Pack and Play swaps the project's archive into the running game (REDnode's REDswap, `archives.reload`). Whether a running game streams a sector in again from a swapped archive, rather than keeping the copy it has, is **unverified**: the probe's second question. If it does not, the previews stay until the next load of a save.
3. **After a restart:** always works, as today.

**Rendering selections with the game.** Seen from REDcode, the game is a second viewport: a node picked in REDcode's sector view can be looked at in the game, with the game's own lighting, materials and everything around it, by the camera flight above. REDcode's own view stays plain (flat colours, as E0 advised), and the game answers "what does it really look like".

## Sector Tools and EDGEbuilder

EDGEbuilder plans a world inspector ([world-inspector.md](https://github.com/Edgemodders/EDGEbuilder/blob/main/docs/world-inspector.md), B3b, with B4b's world edits): Inspect what the cursor points at with Edit on, a **World** tab with everything streamed in near the camera, Look up, Hide for the session, Add to scene, and the world streamed around its camera. EDGEbuilder for VS Code (B7) plans a world map (E1) and a sector view (E2) over the same drawing package. The roles, as the owner put them on 2026-11-20:

| | Sector Tools | EDGEbuilder |
|---|---|---|
| Works on | The game's sector **files**: any sector in the game, streamed in or not, as the file has it | The **live world** around the camera, as the game has streamed it in |
| Finds | Sectors by name, grid or place, and their nodes | What is near the camera now, or under the cursor |
| Changes | Nothing itself. REDcode edits a project's copy of a sector, and Sector Tools previews it | Scenes: objects added, game nodes removed as world edits, baked into new sectors and ArchiveXL node deletions |
| Its 3D view | The picked sector, from the file, beside the game | E2, its own sector view in VS Code, with scenes on it |

**Where they overlap, and the proposal for each:**

| Overlap | Proposal |
|---|---|
| **Two free cameras and two Edit switches** | One camera for both: decision 2 (a). Until then, each turns the other's Edit off when its own goes on |
| **Picking in the world** (Sector Tools' Edit-on click, EDGEbuilder's Inspect) | Both call REDnode's `world.pick`, so nothing is built twice below the window. Sector Tools' pick answers only "which sector and node is this", for its list, its 3D view and REDcode; Inspect stays EDGEbuilder's, with its Selected panel and Add to scene. Decision 5 |
| **Hide for the session** | Both, through REDnode's `world.setVisible`, which keeps a hidden list per app. Independent, and each shows its own nodes again when it stops |
| **Lists of nodes** | Different sources, so both stay: Sector Tools lists a sector's file, EDGEbuilder's World tab what is streamed in. Each row links to the other: **Edit in EDGEbuilder** on a Sector Tools node (EDGEbuilder's service selects it, if EDGEbuilder is on), **Show in Sector Tools** on an EDGEbuilder row |
| **Streaming around the camera** | It goes with the camera: whichever app holds the camera sets where the world streams |

**One real conflict: two ways to change a game sector.**
- **REDcode replacing a sector:** a project's copy of a game sector, edited in the tree, replaces the whole sector in the game.
- **EDGEbuilder's world edits:** these leave the sector as it is and remove nodes with ArchiveXL node deletions. Each deletion checks the sector's node data count (`expectedNodes`).

If a project replaces a sector that an EDGEbuilder scene also edits, the replaced sector's count may differ, and ArchiveXL then refuses the deletions. The same goes for two mods that each replace one sector: the one loaded first wins it whole. Proposals:
- **Warn:** REDcode warns when a project replaces a game sector, and Sector Tools marks such sectors. The warning names an EDGEbuilder scene that edits the same sector, when EDGEbuilder's service can say so.
- **Point the way:** the guide says to remove or add things with EDGEbuilder, which other mods can live with, and to edit a sector copy only for what world edits cannot do, such as moving a game node.

## The pack and its release

| What | Where |
|---|---|
| The pack | `packs/sector-tools/` in this repo: `pack.json` (`"id": "sector-tools"`, its own version, `"rednode": ">=..."`), `changelog.md` with a Nexus summary per version, `apps/sector-tools/` (`rednode-app.json`, the Node mod, the page built with the drawing package's page half), `nexus/` for its page |
| The build | `tools/release/pack-zip.mjs`, as REDnode's and EDGEbuilder's: a zip laid out like the game folder (`red4ext/plugins/REDnode/apps/sector-tools/`), with its licences |
| The release | REDcode's release workflow, with a **Sector Tools** choice beside REDcode, the theme and redcode-mcp: the zip on a GitHub release tagged `sector-tools-vX.Y.Z`, and **Update Nexus Mods** for its page |
| Installing | Vortex, EDGEdeck or by hand from Nexus, as REDnode's packs. REDcode offers it once, when a sector opens in its sector mode and Sector Tools is not in the game (decision 4) |

## Steps

| Step | What | Ends with |
|---|---|---|
| **ST0 Probe** | A test app: the drawing package's page in the overlay (WebGL, frame time for a busy sector); a sector swapped in with `archives.reload` while V stands in it (does it come back changed); the registry's ids against `sector.nodes` entries for one sector; a camera flight to a node 1 km from V | The four answers in this page |
| **ST1 The app** | Find, Nodes, the 3D view, click and double-click, Edit, Hide; the pack and its zip | A node found by name, flown to and outlined, with V left standing |
| **ST2 The link** | `select`, `focus`, `reveal` both ways; Show in Game and Open in REDcode | A node picked in the game opens in REDcode, and back |
| **ST3 Live previews** | Edits in the project's sector copy shown at once as previews, then Pack and Play | A moved lamp post shows in its new place in the game seconds after the save |

Each step with a hand test in the game. Its place in the order: after REDcode's sector view, which builds the package Sector Tools draws with.

## Decisions for the owner

1. **Where the pack lives and ships.** Proposal: this repo, `packs/sector-tools/`, built and released by REDcode's release workflow with its own version, tag and Nexus page, as EDGEbuilder does Remove Doors. The other way is a repo of its own.
2. **The free camera.** Three ways:
   - **(a)** REDnode gives every app one free camera: an API that owns the camera entity, the HUD and the clean-up, with one app at a time holding it. EDGEbuilder moves onto it, and two apps cannot fight over the camera. It needs a REDnode request and EDGEbuilder's agreement.
   - **(b)** Sector Tools has a copy of EDGEbuilder's camera code, and the two apps tell each other when Edit goes on.
   - **(c)** Sector Tools asks EDGEbuilder's service to fly, so it needs EDGEbuilder installed.

   Proposal: (a), since a third app with a camera will come, with (b) as the fallback if REDnode's version is not ready when ST1 is.
3. **How the game reaches REDcode.** Two ways:
   - **(a)** The `redcode` service writes the request to a file for the window with that project, and that REDcode window watches its file. This builds on #32's file of every window's project.
   - **(b)** The app opens a `vscode://edgemodders.redcode-cyberpunk/reveal?...` link, which VS Code routes to REDcode and which brings VS Code to the front. Whether a REDnode app may open a link is unverified, and with two windows open VS Code chooses one.

   Proposal: (a), with (b) only to bring VS Code to the front, if the probe shows a link can be opened.
4. **REDcode offering the pack.** Proposal: once, from the sector mode, with a link to its Nexus page or **Install with EDGEdeck** when EDGEdeck is there. Never installed without asking.
5. **The roles beside EDGEbuilder's world inspector** (above). Proposal:
   - Sector Tools stays on the game's sector files and REDcode's loop.
   - Its in-world pick only answers which sector and node something is.
   - Inspect, Add to scene and world edits stay EDGEbuilder's.
   - Each tool links its rows to the other.
   - REDcode warns when a project replaces a game sector.

   EDGEbuilder's session agrees its side in a `request` issue on EDGEbuilder, after this page is agreed.

## Not in this design

- Editing nodes in the 3D view, in REDcode or in the game: the tree edits them, and EDGEbuilder places and removes things.
- The whole world map (EDGEbuilder's E1).
- Terrain, foliage and whole entities in the 3D view, as for REDcode's view.
