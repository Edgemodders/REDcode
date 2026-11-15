// Clothing items by in-game name or TweakDB id, for Search game files (REDcode issue #28,
// docs/design/item-search.md), through edgemat-core, which EDGEmat's Find view uses too.
// No VS Code imports.

import { bridgeOver, defaultCacheDir, itemMaterials, loadItems, searchItems, type ItemEntry, type ItemLook, type ItemMaterials } from "@edgemodders/edgemat-core";
import type { BridgeClient } from "./bridgeClient";

export type { ItemEntry, ItemLook, ItemMaterials };

/** The game's clothing items, loaded once per bridge process. */
export class ItemIndex {
  private state?: { bridge: BridgeClient; items: Promise<ItemEntry[]>; done?: ItemEntry[] };

  /**
   * The cache is items.json in EDGEmat's folder (%LOCALAPPDATA%\EDGEmat), shared with EDGEmat by
   * decision 2: whichever tool loads the items first spares the other the first load (about 15 s).
   * The file is keyed by game version and written by the same code in both.
   */
  constructor(private readonly dir = defaultCacheDir()) {}

  /** The items when they are loaded for this bridge, else undefined. */
  loaded(bridge: BridgeClient): ItemEntry[] | undefined {
    return this.state?.bridge === bridge ? this.state.done : undefined;
  }

  /** Loads the items for this bridge once; a failed load is tried again on the next call. */
  load(bridge: BridgeClient): Promise<ItemEntry[]> {
    if (this.state?.bridge !== bridge) {
      const state: NonNullable<ItemIndex["state"]> = { bridge, items: loadItems(over(bridge), this.dir) };
      state.items.then(
        (items) => (state.done = items),
        () => this.state === state && (this.state = undefined),
      );
      this.state = state;
    }
    return this.state.items;
  }

  /**
   * Items whose name, id or slot holds every word of the query, in edgemat-core's order: whole-phrase
   * hits first, the game's own Items. records before crafting and test ones. Records with no name and
   * no Items. id are left out (decision 4).
   */
  search(items: ItemEntry[], query: string): ItemEntry[] {
    return searchItems(items, query).filter((i) => i.name || i.id.startsWith("Items."));
  }

  /** An item's looks for each body, with their meshes. About half a second an item. */
  meshes(bridge: BridgeClient, item: ItemEntry): Promise<ItemMaterials> {
    return itemMaterials(over(bridge), item);
  }
}

/** edgemat-core's bridge, over REDcode's own bridge process. */
function over(bridge: BridgeClient): ReturnType<typeof bridgeOver> {
  return bridgeOver((method, params) => bridge.request(method, params));
}

/** Each mesh an item wears, once per body, in the order of its looks. */
export function meshesByBody(m: ItemMaterials): { body: ItemLook["body"]; meshes: { mesh: string; appearance: string }[] }[] {
  const out: { body: ItemLook["body"]; meshes: { mesh: string; appearance: string }[] }[] = [];
  for (const look of m.looks) {
    let group = out.find((g) => g.body === look.body);
    if (!group) out.push((group = { body: look.body, meshes: [] }));
    for (const x of look.meshes) {
      if (!group.meshes.some((g) => g.mesh.toLowerCase() === x.mesh.toLowerCase() && g.appearance === x.appearance)) group.meshes.push({ mesh: x.mesh, appearance: x.appearance });
    }
  }
  return out;
}
