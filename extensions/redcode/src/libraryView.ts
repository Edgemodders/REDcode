// The Library view (REDcode issue #23, docs/design/library-view.md): the EDGE Library's folders and
// items, as EDGEfab's view shows them, with Add to Project for REDcode's own kinds and Refresh Project
// from Library. Reading the Library and writing the project's came-from note are library.ts.

import * as fs from "node:fs";
import * as path from "node:path";
import * as vscode from "vscode";
import { addItemToProject, listLibraryFolder, planAddToProject, projectLibraryState, readLibraryRoot, type AddToProjectPlan, type LibraryItem } from "./library";

export type LibraryNode =
  | { kind: "folder"; dir: string }
  | { kind: "item"; item: LibraryItem }
  | { kind: "model"; file: string }
  | { kind: "line"; label: string; description?: string; icon?: string };

/** What the view needs from the rest of REDcode. */
export interface LibraryHost {
  /** The open project, or undefined. */
  project(): { name: string; dir: string } | undefined;
  /** Opens a file on disk in REDcode's editor, as a project file opens. */
  openFile(file: string): Promise<void>;
  /** Shows the project's files again, and selects one. */
  projectChanged(select?: string): Promise<void>;
  log(line: string): void;
}

/** Words for a kind, as EDGEfab says them. */
const KindWords: Record<string, string> = {
  mesh: "a game mesh",
  ent: "an entity",
  app: "an appearance file",
  mi: "a material instance",
  mlsetup: "a multilayer setup",
  xbm: "a texture",
  prop: "a prop",
  sound: "a sound",
  quickhack: "a quickhack",
  bake: "a Library bake",
};

export class LibraryTree implements vscode.TreeDataProvider<LibraryNode> {
  private readonly changed = new vscode.EventEmitter<LibraryNode | undefined>();
  readonly onDidChangeTreeData = this.changed.event;

  refresh(): void {
    this.changed.fire(undefined);
  }

  getChildren(node?: LibraryNode): LibraryNode[] {
    if (!node) {
      const root = readLibraryRoot();
      void vscode.commands.executeCommand("setContext", "redcode.hasLibrary", !!root);
      if (!root) return [];
      if (!fs.existsSync(root)) return [{ kind: "line", label: "The Library's folder is missing", description: root, icon: "warning" }];
      const nodes = this.listing(root);
      return nodes.length ? nodes : [{ kind: "line", label: "Empty so far", description: "Add to Library puts items here", icon: "info" }];
    }
    if (node.kind === "folder") return this.listing(node.dir);
    if (node.kind === "item") return itemLines(node.item);
    return [];
  }

  private listing(dir: string): LibraryNode[] {
    const l = listLibraryFolder(dir);
    return [
      ...l.folders.map((d): LibraryNode => ({ kind: "folder", dir: d })),
      ...l.items.map((i): LibraryNode => ({ kind: "item", item: i })),
      ...l.models.map((f): LibraryNode => ({ kind: "model", file: f })),
    ];
  }

  getTreeItem(node: LibraryNode): vscode.TreeItem {
    switch (node.kind) {
      case "folder": {
        const t = new vscode.TreeItem(path.basename(node.dir), vscode.TreeItemCollapsibleState.Collapsed);
        t.iconPath = vscode.ThemeIcon.Folder;
        t.contextValue = "libfolder";
        t.tooltip = node.dir;
        return t;
      }
      case "item": {
        const i = node.item;
        const t = new vscode.TreeItem(i.name, vscode.TreeItemCollapsibleState.Collapsed);
        const other = i.tool && i.tool !== "REDcode" && i.tool !== "redcode-mcp" ? i.tool : undefined;
        t.description = [i.kind || "item", other].filter(Boolean).join(" · ");
        t.iconPath = new vscode.ThemeIcon(i.kind === "bake" ? "layers" : i.kind === "prop" ? "package" : i.addable ? "file-symlink-file" : "archive");
        t.contextValue = i.addable ? "libitem.add" : "libitem";
        const tip = new vscode.MarkdownString();
        tip.appendMarkdown(`**${i.name}**\n\n`);
        tip.appendText(`${i.kind || "item"}${i.version !== undefined ? `, version ${i.version}` : ""}${i.tool ? `, by ${i.tool}` : ""}\n`);
        if (i.main) tip.appendText(`${i.main}\n`);
        tip.appendText(path.dirname(i.dir));
        if (!i.addable) tip.appendMarkdown(`\n\n_${i.kind === "bake" ? "EDGEbuilder" : other ?? "Its own tool"} adds it to a project._`);
        t.tooltip = tip;
        if (i.addable && i.main) t.command = { command: "redcode.library.open", title: "Open", arguments: [node] };
        return t;
      }
      case "model": {
        const t = new vscode.TreeItem(path.basename(node.file), vscode.TreeItemCollapsibleState.None);
        t.iconPath = new vscode.ThemeIcon("file-binary");
        t.contextValue = /\.(glb|gltf)$/i.test(node.file) ? "libmodel.glb" : "libmodel";
        t.tooltip = node.file;
        t.resourceUri = vscode.Uri.file(node.file);
        if (/\.(glb|gltf)$/i.test(node.file)) t.command = { command: "vscode.openWith", title: "Open", arguments: [vscode.Uri.file(node.file), "redcode.mesh"] };
        return t;
      }
      case "line": {
        const t = new vscode.TreeItem(node.label, vscode.TreeItemCollapsibleState.None);
        t.description = node.description;
        if (node.icon) t.iconPath = new vscode.ThemeIcon(node.icon);
        t.contextValue = "libline";
        return t;
      }
    }
  }
}

function itemLines(i: LibraryItem): LibraryNode[] {
  const lines: LibraryNode[] = [];
  const words = KindWords[i.kind] ?? (i.kind ? `a ${i.kind}` : "an item");
  lines.push({ kind: "line", label: i.tool && i.tool !== "REDcode" && i.tool !== "redcode-mcp" ? `${words}, from ${i.tool}` : words, ...(i.main ? { description: i.main } : {}) });
  if (i.version !== undefined) lines.push({ kind: "line", label: `version ${i.version}` });
  return lines;
}

const fileOfLibrary = (node: LibraryNode): string | undefined => (node.kind === "folder" ? node.dir : node.kind === "item" ? node.item.dir : node.kind === "model" ? node.file : undefined);

/** The item's main file in its source/archive. */
function mainFileOf(item: LibraryItem): string | undefined {
  if (!item.main) return undefined;
  const f = path.join(item.dir, "source", "archive", ...item.main.split("\\"));
  return fs.existsSync(f) ? f : undefined;
}

/** Asks once before files the project has are replaced; true to go on. */
async function confirmClashes(clashes: string[], what: string): Promise<boolean> {
  if (!clashes.length) return true;
  const shown = clashes.slice(0, 10).map((f) => `  ${f}`).join("\n");
  const more = clashes.length > 10 ? `\n  and ${clashes.length - 10} more` : "";
  const answer = await vscode.window.showWarningMessage(
    `${what} would replace ${clashes.length === 1 ? "1 file" : `${clashes.length} files`} the project already has, which did not come from it.`,
    { modal: true, detail: `${shown}${more}\n\nA project's files are often your own edits.` },
    "Replace",
  );
  return answer === "Replace";
}

function requireProject(host: LibraryHost): { name: string; dir: string } | undefined {
  const p = host.project();
  if (!p) {
    void vscode.window.showInformationMessage("REDcode: open a REDcode project to add Library items to it.", "Open Folder").then((a) => {
      if (a) void vscode.commands.executeCommand("vscode.openFolder");
    });
  }
  return p;
}

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;

/** The view's commands. */
export function registerLibraryView(context: vscode.ExtensionContext, host: LibraryHost, setUp: () => Promise<string | undefined>): LibraryTree {
  const tree = new LibraryTree();
  const view = vscode.window.createTreeView("redcode.library", { treeDataProvider: tree, showCollapseAll: true });

  const addToProject = async (node?: LibraryNode) => {
    if (node?.kind !== "item") return;
    const p = requireProject(host);
    if (!p) return;
    const root = readLibraryRoot();
    if (!root) return;
    const plan = planAddToProject(node.item.dir, p.dir);
    if (!(await confirmClashes(plan.clashes, `Adding ${plan.item.name}`))) return;
    const r = addItemToProject(plan, root, p.dir);
    host.log(`Library: ${r.replaced ? "updated" : "added"} ${plan.item.name} (version ${plan.item.version ?? 1}) in ${p.name}: ${r.files} files${r.removed ? `, ${r.removed} earlier files removed` : ""}`);
    const main = plan.item.main && path.join(p.dir, "source", "archive", ...plan.item.main.split("\\"));
    await host.projectChanged(main && fs.existsSync(main) ? main : undefined);
    const a = await vscode.window.showInformationMessage(`REDcode: ${r.replaced ? "updated" : "added"} ${plan.item.name} in ${p.name}: ${plural(r.files, "file")}.`, "Pack and Play");
    if (a) await vscode.commands.executeCommand("redcode.packAndPlay");
  };

  const refreshProject = async () => {
    const p = requireProject(host);
    if (!p) return;
    const root = readLibraryRoot();
    if (!root) {
      void vscode.window.showInformationMessage("REDcode: no EDGE Library is set up yet.");
      return;
    }
    const states = projectLibraryState(p.dir, root);
    const missing = states.filter((s) => s.state === "missing");
    const newer = states.filter((s) => s.state === "newer" && s.item);
    const gone = missing.length ? ` Not in the Library any more: ${missing.map((m) => m.entry.path).join(", ")}.` : "";
    if (!states.length) {
      void vscode.window.showInformationMessage(`REDcode: ${p.name} has nothing REDcode added from the Library.`);
      return;
    }
    if (!newer.length) {
      void vscode.window.showInformationMessage(`REDcode: everything ${p.name} took from the Library is up to date.${gone}`);
      return;
    }
    const picked = await vscode.window.showQuickPick(
      newer.map((s) => ({ label: s.item!.name, description: `version ${s.entry.version} → ${s.item!.version ?? 1}`, detail: s.entry.path, picked: true, s })),
      { canPickMany: true, title: `Refresh ${p.name} from the Library`, placeHolder: "Items with a newer version in the Library" },
    );
    if (!picked?.length) return;
    const plans: AddToProjectPlan[] = picked.map((x) => planAddToProject(x.s.item!.dir, p.dir));
    if (!(await confirmClashes(plans.flatMap((pl) => pl.clashes), "Refreshing"))) return;
    let files = 0;
    for (const plan of plans) files += addItemToProject(plan, root, p.dir).files;
    host.log(`Library: refreshed ${plans.map((pl) => pl.item.name).join(", ")} in ${p.name}`);
    await host.projectChanged();
    void vscode.window.showInformationMessage(`REDcode: refreshed ${plural(plans.length, "item")} in ${p.name}: ${plural(files, "file")}.${gone}`);
  };

  const wrap = (fn: (node?: LibraryNode) => Promise<void>) => async (node?: LibraryNode) => {
    try {
      await fn(node);
    } catch (e) {
      void vscode.window.showErrorMessage(`REDcode: ${e instanceof Error ? e.message : String(e)}`);
    }
  };

  context.subscriptions.push(
    view,
    vscode.commands.registerCommand("redcode.library.refresh", () => tree.refresh()),
    vscode.commands.registerCommand(
      "redcode.library.setUp",
      wrap(async () => {
        if (await setUp()) tree.refresh();
      }),
    ),
    vscode.commands.registerCommand("redcode.library.addToProject", wrap(addToProject)),
    vscode.commands.registerCommand("redcode.library.refreshProject", wrap(refreshProject)),
    vscode.commands.registerCommand(
      "redcode.library.open",
      wrap(async (node) => {
        if (node?.kind !== "item") return;
        const f = mainFileOf(node.item);
        if (!f) throw new Error(`${node.item.name}'s main file is not in its source/archive`);
        await host.openFile(f);
      }),
    ),
    vscode.commands.registerCommand(
      "redcode.library.reveal",
      wrap(async (node) => {
        const f = node && fileOfLibrary(node);
        if (f) await vscode.commands.executeCommand("revealFileInOS", vscode.Uri.file(f));
      }),
    ),
  );
  return tree;
}
