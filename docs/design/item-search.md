---
title: Item search (#28)
---

# Item search: from an in-game name to the files

Draft 0.1, 2026-11-15, for the owner to agree; nothing is built. Asked for in [REDcode issue #28](https://github.com/Edgemodders/REDcode/issues/28) by EDGEmat, after the owner searched Game Assets for `comfy rocker` and found nothing. Its first part, the wording "Search game files (file name or path)", shipped in REDcode 0.10.10. This page is its second part: **Search game files** also finds clothing items by in-game name or TweakDB id, and leads from an item to the meshes it wears.

The owner's rule from the issue holds: a **search** goes and finds, in its own result list, and may match data the tree does not show; a **filter** narrows the tree in place. So this is for **Search game files** (the magnifier on Game Assets) only. **Filter Game Assets** stays a file filter.

## What edgemat-core gives

[`@edgemodders/edgemat-core`](https://www.npmjs.com/package/@edgemodders/edgemat-core) 0.3.2 (npm, 2026-11-13, MIT) does the lookup EDGEmat's Find view does. Checked on game 2.5 with REDbridge 0.12.1 on 2026-11-15, over REDcode's own bridge client through `bridgeOver` (scratchpad `probe28.mjs`):

| Call | What it does | Measured |
|---|---|---|
| `loadItems(bridge, dir)` | Every clothing record in TweakDB (`tweakdb.records`, type `Clothing`) with its English name, entity, appearance and slot. Cached in `dir/items.json`, keyed by game version | 2,074 items, 161 with no name. 14.4 s the first time (the issue said about 8 s; this machine took longer), 5 ms from the cache, which is 350 KB |
| `searchItems(items, query)` | Items whose name, id or slot holds every word. Whole-phrase hits first, then the game's own `Items.` records before crafting and test records | Under 10 ms. `comfy rocker`: 2 (`Items.Pants_01_basic_01` first, then `TEST.ItemPass_LegArmor`). `slim fits`: 9. `jacket`: 327. `aramid`: 87 |
| `itemMaterials(bridge, item)` | Walks the item to its `.app` and meshes for each body: feminine, masculine or any | 0.1 to 0.6 s an item; 6.4 s for ten jackets. `Items.Pants_01_basic_01`: feminine `l1_012_pwa_pants__jeans_tight.mesh` and masculine `l1_012_pma_pants__jeans_tight.mesh`, both appearance `leather` |

What this means for the design:

- **Items come up as fast as files.** After the first load, item hits cost nothing next to the file search (about 230 ms).
- **Meshes come one item at a time.** At about half a second an item, they cannot be shown under every hit of a search like `jacket`. They are walked when an item is picked.
- **The first load is long.** 14 s once for each game version, so it cannot block the box.
- **Names are English.** `loadItems` reads `en-us` only. An item with no name shows its id.
- **Matches are by substring.** `door` finds `Used outdoorsman ripstop novawear pants`, so item hits are kept short and above the files, not mixed in with them.

## The design

**One box, two groups.** Search game files keeps its box and its three-character minimum. Under it, a group **Items**, then a group **Files**, with VS Code's quick pick separators:

```
Search game files (file name, path or item name)
comfy rocker
─── Items (2) ─────────────────────────────────────────────
Comfy rocker aramid-weave slim-fits    Items.Pants_01_basic_01     LegArmor
Comfy rocker aramid-weave slim-fits    TEST.ItemPass_LegArmor      LegArmor
─── Files (0) ─────────────────────────────────────────────
```

- An item row: the in-game name, then the record id, then the slot. It shows at most 20 items, in `searchItems`' order, with "and N more: type more words" when there are more.
- Files list as now, up to 200.
- When no item matches, the Items group is not shown, so a path search looks as it does today.

**Picking an item shows its meshes in the same box.** The box turns into the item's page, with a Back button to the search:

```
Comfy rocker aramid-weave slim-fits  (Items.Pants_01_basic_01)
─── Feminine ──────────────────────────────────────────────
l1_012_pwa_pants__jeans_tight.mesh    appearance leather
    base\characters\garment\player_equipment\legs\l1_012_pants__jeans_tight
─── Masculine ─────────────────────────────────────────────
l1_012_pma_pants__jeans_tight.mesh    appearance leather
    base\characters\garment\player_equipment\legs\l1_012_pants__jeans_tight
```

A busy bar shows while `itemMaterials` walks the item. Picking a mesh does what picking a file does (see decision 3).

**The first load runs in the background.** The first time Search game files opens in a session with no cache for this game version, it starts `loadItems` and shows files at once. While it runs, the Items group is one row: "Loading item names, the first time for this game version (about 15 s)". When it ends, the box searches again with what is typed. It runs once, even when the box is closed and opened again. Nothing loads at REDcode's start.

## How it is built

- **edgemat-core is a dependency** of `extensions/redcode`, bundled by esbuild into `dist` (210 KB). It brings `pngjs`, which goes into `ThirdPartyNotices.txt`. REDcode imports only `loadItems`, `searchItems`, `itemMaterials` and `bridgeOver` from it. edgemat-core's own `BridgeClient` is not used: REDcode keeps its own bridge process.
- **`bridgeClient.ts` gets a public `request(method, params)`**, so `bridgeOver((m, p) => client.request(m, p))` gives edgemat-core REDcode's bridge. Today that is the private `call`. The file stays free of VS Code imports.
- **`pickGameFile` in `extension.ts`** takes an option for items. **Search game files** turns it on. **Open game file as JSON** keeps files only, since an item is not a file to open as JSON.
- **The cache** is in `items.json`, in the folder decision 2 picks.
- **No bridge change.** `tweakdb.records` and the CR2W reads it uses are in REDbridge 0.12.0, which REDcode already needs.
- **No new MCP tool.** EDGEmat's MCP server already has item search (`mat_find`) for assistants.

One step, with one hand test: search by name and by id, an item's meshes for each body, a mesh opened, the first load with no cache, and a path search that looks as it does today.

## For the owner to decide

1. **Which items.** edgemat-core finds clothing only. Weapons, vehicles and other items have other records and other walks to their files. Proposed: clothing now, as the issue asks; the rest later, each on request.
2. **Where the cache lives.**
   - **(a) Share EDGEmat's**, `%LOCALAPPDATA%\EDGEmat\items.json` (edgemat-core's `defaultCacheDir()`): when EDGEmat has loaded the items, REDcode skips the 14 s, and the other way round. The file is whole, keyed by game version, and written by the same code, so the two tools agree on it.
   - **(b) REDcode's own**, in its global storage: each tool pays the first load once.

   Proposed: (a).
3. **What picking a mesh, or a file, does.** Today a pick ends in a toast with Open as JSON, Add to project and Copy path. On 2026-10-26 you noted that this toast comes up for every file.
   - **(a) Keep the toast** for files and meshes alike.
   - **(b) A pick opens the file** in REDcode's editor, read-only, as a click in Game Assets does: a mesh opens on its 3D view. The other actions move onto the row as buttons (Add to project, Copy path, Open as JSON).

   Proposed: (b), for files too, so both groups behave alike. **Reveal in Game Assets** is left out: the Game Assets tree cannot yet find a node by path (it has no `getParent`), so that would be work of its own.
4. **Test records.** `TEST.ItemPass_LegArmor` and crafting records show after the game's own items. Proposed: keep them, last, since a modder may want them; hide only records with no name and no `Items.` id.

## Not in this design

- In-game names in Filter Game Assets: the owner's rule keeps the filter on files.
- Names in other languages: `loadItems` reads English only.
- Item search in the TweakDB view, which has its own record search.
