// Search game files: game files by file name or path, and clothing items by in-game name or TweakDB id
// with the meshes they wear (REDcode issue #28, docs/design/item-search.md). A pick opens the file as a
// click in Game Assets does; the other actions are buttons on the row.

import * as path from "node:path";
import * as vscode from "vscode";
import type { BridgeClient } from "./bridgeClient";
import { meshesByBody, type ItemEntry, type ItemIndex } from "./itemSearch";
import type { GameFileInfo } from "./types";

export interface SearchActions {
  /** Opens a game file as a click in Game Assets does. */
  open(file: GameFileInfo): Promise<void>;
  /** Adds it to the open project; undefined when no project is open. */
  addToProject?: (file: GameFileInfo) => Promise<void>;
  openAsJson(file: GameFileInfo): Promise<void>;
  log(line: string): void;
}

/** Item rows shown at most; more are counted in a last row. */
const MaxItems = 20;
const Placeholder = "Search game files (file name, path or item name)";

const AddButton: vscode.QuickInputButton = { iconPath: new vscode.ThemeIcon("add"), tooltip: "Add to project" };
const CopyButton: vscode.QuickInputButton = { iconPath: new vscode.ThemeIcon("copy"), tooltip: "Copy path" };
const JsonButton: vscode.QuickInputButton = { iconPath: new vscode.ThemeIcon("json"), tooltip: "Open as JSON" };

type Row = vscode.QuickPickItem & { file?: GameFileInfo; item?: ItemEntry; mesh?: string };

const separator = (label: string): Row => ({ label, kind: vscode.QuickPickItemKind.Separator });
const count = (n: number, word: string) => `${n.toLocaleString()} ${word}${n === 1 ? "" : "s"}`;
const BodyNames = { feminine: "Feminine", masculine: "Masculine", any: "Any body" } as const;

/** A game file's entry by its exact path, for a mesh an item names; a bare one when the search misses it. */
async function fileInfo(b: BridgeClient, gamePath: string): Promise<GameFileInfo> {
  const r = await b.search(gamePath, 20).catch(() => undefined);
  return r?.items.find((f) => f.name.toLowerCase() === gamePath.toLowerCase()) ?? { name: gamePath, archive: "", size: 0, hash: "" };
}

export function searchGameFiles(b: BridgeClient, index: ItemIndex, actions: SearchActions): void {
  const picker = vscode.window.createQuickPick<Row>();
  picker.placeholder = Placeholder;
  picker.matchOnDescription = true;
  // Keep the Items and Files groups in order while typing. Not in the typed API (proposed
  // quickPickSortByLabel), but taken by VS Code 1.146; where it is not, the rows mix by match.
  (picker as unknown as { sortByLabel: boolean }).sortByLabel = false;
  const buttons = [...(actions.addToProject ? [AddButton] : []), CopyButton, JsonButton];
  let page: { item: ItemEntry; query: string } | undefined;
  let timer: NodeJS.Timeout | undefined;
  let latest = 0;
  let closed = false;
  let itemsFailed = false;

  const fileRow = (file: GameFileInfo): Row => ({
    label: path.basename(file.name),
    description: path.dirname(file.name),
    detail: `${file.archive}  ${file.size.toLocaleString()} bytes`,
    // The bridge matched it already; VS Code's own match would hide a path typed across folder and name.
    alwaysShow: true,
    buttons,
    file,
  });
  const itemRow = (item: ItemEntry): Row => ({
    label: `$(tag) ${item.name ?? item.id}`,
    description: [item.name ? item.id : "", item.slot].filter(Boolean).join("  "),
    alwaysShow: true,
    item,
  });

  const search = async (query: string) => {
    const mine = ++latest;
    const q = query.trim();
    if (q.length < 3) {
      picker.items = [];
      picker.title = "Type at least 3 characters";
      return;
    }
    picker.busy = true;
    try {
      const items = index.loaded(b);
      const hits = items && index.search(items, q);
      const loading: Row[] = !hits && !itemsFailed ? [separator("Items"), { label: "$(loading~spin) Loading item names", detail: "The first time for a game version takes about 15 seconds", alwaysShow: true }] : [];
      // REDbridge answers one call at a time, so during the first load the file search waits for it too.
      // Say so at once, rather than leave the box empty.
      if (loading.length) {
        picker.items = loading;
        picker.title = "Files come when the item names are loaded";
      }
      const files = await b.search(q, 200);
      if (mine !== latest || page || closed) return;
      const rows: Row[] = [...loading];
      if (hits?.length) {
        rows.push(separator(`Items (${hits.length.toLocaleString()})`), ...hits.slice(0, MaxItems).map(itemRow));
        if (hits.length > MaxItems) rows.push({ label: `$(ellipsis) and ${(hits.length - MaxItems).toLocaleString()} more: type more words`, alwaysShow: true });
      }
      if (rows.length) rows.push(separator(`Files (${files.total.toLocaleString()})`));
      rows.push(...files.items.map(fileRow));
      picker.items = rows;
      const counts = [hits?.length ? count(hits.length, "item") : "", `${count(files.total, "file")}${files.total > files.items.length ? `, showing ${files.items.length}` : ""}`];
      picker.title = counts.filter(Boolean).join(", ");
    } catch (e) {
      if (mine === latest) picker.title = `Search failed: ${e instanceof Error ? e.message : e}`;
    } finally {
      if (mine === latest) picker.busy = false;
    }
  };

  /** The item's page: its meshes for each body, with Back to the search. */
  const showItem = async (item: ItemEntry) => {
    page = { item, query: picker.value };
    const mine = ++latest;
    picker.value = "";
    picker.items = [];
    picker.title = `${item.name ?? item.id}  (${item.id})`;
    picker.placeholder = "Pick a mesh to open it";
    picker.buttons = [vscode.QuickInputButtons.Back];
    picker.busy = true;
    try {
      const m = await index.meshes(b, item);
      if (mine !== latest || closed) return;
      const rows: Row[] = [];
      for (const g of meshesByBody(m)) {
        rows.push(separator(BodyNames[g.body]));
        for (const x of g.meshes) rows.push({ label: path.basename(x.mesh), description: `appearance ${x.appearance}`, detail: path.dirname(x.mesh), buttons, mesh: x.mesh });
      }
      if (!rows.length) rows.push({ label: "No meshes found for this item", detail: m.warnings.join("; ") || undefined });
      for (const w of m.warnings) actions.log(`Search game files: ${item.id}: ${w}`);
      picker.items = rows;
    } catch (e) {
      if (mine === latest) picker.items = [{ label: "Its meshes could not be read", detail: e instanceof Error ? e.message : String(e) }];
    } finally {
      if (mine === latest) picker.busy = false;
    }
  };

  const back = () => {
    const query = page?.query ?? "";
    page = undefined;
    picker.buttons = [];
    picker.placeholder = Placeholder;
    picker.value = query;
    void search(query);
  };

  /** The file a row stands for: its own, or a mesh's looked up by path. */
  const fileOf = async (row: Row): Promise<GameFileInfo | undefined> => row.file ?? (row.mesh ? fileInfo(b, row.mesh) : undefined);

  picker.onDidChangeValue((value) => {
    if (page) return;
    clearTimeout(timer);
    timer = setTimeout(() => void search(value), 150);
  });
  picker.onDidTriggerButton((button) => {
    if (button === vscode.QuickInputButtons.Back) back();
  });
  picker.onDidAccept(async () => {
    const row = picker.selectedItems[0];
    if (!row) return;
    if (row.item) return void showItem(row.item);
    const file = await fileOf(row);
    if (!file) return;
    picker.hide();
    await actions.open(file);
  });
  picker.onDidTriggerItemButton(async ({ item: row, button }) => {
    const file = await fileOf(row);
    if (!file) return;
    if (button === CopyButton) {
      await vscode.env.clipboard.writeText(file.name);
      vscode.window.setStatusBarMessage(`Copied ${file.name}`, 3000);
      return;
    }
    picker.hide();
    if (button === AddButton) await actions.addToProject?.(file);
    else if (button === JsonButton) await actions.openAsJson(file);
  });
  picker.onDidHide(() => {
    closed = true;
    clearTimeout(timer);
    picker.dispose();
  });
  picker.show();

  // The first load runs behind the box; when it ends, the box searches again with what is typed.
  index.load(b).then(
    () => {
      if (!closed && !page) void search(picker.value);
    },
    (e) => {
      actions.log(`Search game files: item names could not be loaded: ${e instanceof Error ? e.message : e}`);
      itemsFailed = true;
      if (!closed && !page) void search(picker.value);
    },
  );
}
