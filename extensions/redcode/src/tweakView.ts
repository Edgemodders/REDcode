// The TweakDB view (C5 V3): the game's TweakDB as shipped, read offline through REDbridge 0.8.0's
// tweakdb.* methods. Record types with their counts, each opening to its records grouped by the
// first part of the path; a filter that searches record paths; a hover on record paths in YAML and
// .tweak files. The first TweakDB call loads it in the bridge, about 12 s, so the view says so.
// See docs/design/view.md, V3.

import * as vscode from "vscode";
import type { BridgeClient } from "./bridgeClient";
import { flatIs, matchKey, readClaims, type TweakClaim, type TweakMatch } from "./opens";
import { mainFlats, shortType, shortValue } from "./tweakYaml";
import type { TweakRecordFull, TweakTypes } from "./types";

export interface TweakRef {
  id: string;
  path: string | null;
  type: string;
}

export type TweakNode =
  | { kind: "type"; type: string; count: number; records?: TweakRef[] }
  | { kind: "group"; type: string; prefix: string; records: TweakRef[] }
  | { kind: "record"; ref: TweakRef; claims?: TweakClaim[] }
  | { kind: "note"; text: string };

/** Records a group shows; past this, the filter narrows. */
const GroupCap = 2000;
/** Results the filter asks for. */
const FilterCap = 5000;

/** TweakDB through the bridge, cached for as long as the bridge process runs. */
export class TweakDb {
  private types: Promise<TweakTypes> | undefined;
  private byType = new Map<string, Promise<TweakRef[]>>();
  private records = new Map<string, Promise<TweakRecordFull | undefined>>();
  private matching = new Map<string, Promise<Set<string>>>();
  private readonly changed = new vscode.EventEmitter<void>();
  readonly onDidLoad = this.changed.event;
  loaded = false;

  constructor(private readonly getBridge: () => BridgeClient | undefined) {}

  bridge(): BridgeClient {
    const b = this.getBridge();
    if (!b?.running) throw new Error("The REDbridge process is not running.");
    return b;
  }

  /** Forgets everything, for a restarted bridge. */
  reset(): void {
    this.types = undefined;
    this.byType.clear();
    this.records.clear();
    this.matching.clear();
    this.loaded = false;
  }

  allTypes(): Promise<TweakTypes> {
    this.types ??= this.bridge()
      .tweakTypes()
      .then((t) => {
        this.loaded = true;
        this.changed.fire();
        return t;
      })
      .catch((e) => {
        this.types = undefined;
        throw e;
      });
    return this.types;
  }

  /** The records of exactly this type, in pages; tweakdb.records includes subtypes, which other nodes show. */
  recordsOf(type: string): Promise<TweakRef[]> {
    let p = this.byType.get(type);
    if (!p) {
      p = (async () => {
        const out: TweakRef[] = [];
        for (let offset = 0; ; offset += 20000) {
          const page = await this.bridge().tweakRecords({ type, offset, limit: 20000 });
          out.push(...page.items.filter((r) => r.type === type).map((r) => ({ id: r.id, path: r.path, type: r.type })));
          if (offset + page.items.length >= page.total || page.items.length === 0) break;
        }
        return out;
      })();
      p.catch(() => this.byType.delete(type));
      this.byType.set(type, p);
    }
    return p;
  }

  /** The ids of the records a claim matches: its type with subtypes, and the flat's value when it names one. */
  idsMatching(m: TweakMatch): Promise<Set<string>> {
    const key = matchKey(m);
    let p = this.matching.get(key);
    if (!p) {
      p = (async () => {
        const ids = new Set<string>();
        for (let offset = 0; ; offset += 20000) {
          const page = await this.bridge().tweakRecords({ type: m.type, ...(m.flat ? { flats: [m.flat] } : {}), offset, limit: 20000 });
          for (const r of page.items) if (!m.flat || flatIs(r.flats?.[m.flat], m.is)) ids.add(r.id);
          if (offset + page.items.length >= page.total || page.items.length === 0) break;
        }
        return ids;
      })();
      p.catch(() => this.matching.delete(key));
      this.matching.set(key, p);
    }
    return p;
  }

  /** One record with its flats and LocKey text, or undefined when there is none at that path. */
  record(pathOrId: string): Promise<TweakRecordFull | undefined> {
    let p = this.records.get(pathOrId);
    if (!p) {
      p = this.bridge()
        .tweakRecord(pathOrId, true)
        .catch((e: Error) => {
          if (/No TweakDB record/.test(e.message)) return undefined;
          this.records.delete(pathOrId);
          throw e;
        });
      this.records.set(pathOrId, p);
    }
    return p;
  }
}

/** The records other tools open (the open contract, src/opens.ts, REDcode issue #22), read from every installed extension. */
export class TweakClaims {
  private list: TweakClaim[] = [];

  constructor(
    private readonly db: TweakDb,
    private readonly log: (line: string) => void,
  ) {
    this.reload();
  }

  /** Reads the claims again, after extensions were installed or removed. */
  reload(): void {
    this.list = readClaims(vscode.extensions.all, (m) => this.log(`Open contract: ${m}`));
  }

  get all(): readonly TweakClaim[] {
    return this.list;
  }

  /** The claims on each record, by record id; records no tool claims are left out. A claim whose type the bridge refuses is logged and skipped. */
  async of(refs: readonly { id: string }[]): Promise<Map<string, TweakClaim[]>> {
    const out = new Map<string, TweakClaim[]>();
    for (const claim of this.list) {
      let ids: Set<string>;
      try {
        ids = await this.db.idsMatching(claim.tweakdb);
      } catch (e) {
        this.log(`Open contract: ${claim.extension}'s claim on ${claim.tweakdb.type}: ${(e as Error).message}`);
        continue;
      }
      for (const r of refs) {
        if (!ids.has(r.id)) continue;
        const list = out.get(r.id) ?? [];
        if (!list.some((c) => c.extension === claim.extension && c.command === claim.command)) list.push(claim);
        out.set(r.id, list);
      }
    }
    return out;
  }
}

export class TweakTree implements vscode.TreeDataProvider<TweakNode> {
  private readonly changed = new vscode.EventEmitter<TweakNode | undefined>();
  readonly onDidChangeTreeData = this.changed.event;
  private filtered: { text: string; total: number; byType: Map<string, TweakRef[]> } | undefined;
  view: vscode.TreeView<TweakNode> | undefined;

  constructor(
    private readonly db: TweakDb,
    private readonly claims: TweakClaims,
  ) {}

  refresh(): void {
    this.changed.fire(undefined);
  }

  get filter(): string | undefined {
    return this.filtered?.text;
  }

  /** Narrows the tree to records whose path has every word of the text; an empty text clears it. */
  async setFilter(text: string): Promise<{ shown: number; total: number } | undefined> {
    const words = text.trim();
    if (!words) {
      this.filtered = undefined;
      this.refresh();
      return undefined;
    }
    await this.loadWithProgress();
    const r = await this.db.bridge().tweakSearch(words, undefined, FilterCap);
    const byType = new Map<string, TweakRef[]>();
    for (const item of r.items) {
      const list = byType.get(item.type) ?? [];
      list.push({ id: item.id, path: item.path, type: item.type });
      byType.set(item.type, list);
    }
    this.filtered = { text: words, total: r.total, byType };
    this.refresh();
    return { shown: r.items.length, total: r.total };
  }

  /** The first load takes about 12 s in the bridge: show it in the view rather than look frozen. */
  async loadWithProgress(): Promise<TweakTypes> {
    if (this.db.loaded) return this.db.allTypes();
    if (this.view) this.view.message = "Loading TweakDB from the game, about 12 seconds the first time…";
    try {
      return await vscode.window.withProgress({ location: { viewId: "redcode.tweakdb" }, title: "Loading TweakDB" }, () => this.db.allTypes());
    } finally {
      if (this.view && !this.filtered) this.view.message = undefined;
    }
  }

  getTreeItem(node: TweakNode): vscode.TreeItem {
    switch (node.kind) {
      case "type": {
        const item = new vscode.TreeItem(shortType(node.type), this.filtered ? vscode.TreeItemCollapsibleState.Expanded : vscode.TreeItemCollapsibleState.Collapsed);
        item.id = `${this.filtered ? `f:${this.filtered.text}:` : ""}type:${node.type}`;
        item.description = node.count.toLocaleString();
        item.tooltip = `${node.type}\n${node.count.toLocaleString()} records`;
        item.iconPath = new vscode.ThemeIcon("symbol-class");
        item.contextValue = "tweakType";
        return item;
      }
      case "group": {
        const item = new vscode.TreeItem(node.prefix, vscode.TreeItemCollapsibleState.Collapsed);
        item.id = `group:${node.type}:${node.prefix}`;
        item.description = node.records.length.toLocaleString();
        item.iconPath = new vscode.ThemeIcon("folder", new vscode.ThemeColor("redcode.folder"));
        return item;
      }
      case "record": {
        const label = node.ref.path ?? node.ref.id;
        const item = new vscode.TreeItem(this.filtered || !node.ref.path ? label : label.slice(label.indexOf(".") + 1), vscode.TreeItemCollapsibleState.None);
        item.id = `${this.filtered ? `f:${this.filtered.text}:` : ""}record:${node.ref.id}`;
        item.description = node.ref.path ? undefined : "unnamed";
        item.tooltip = `${label}\n${node.ref.type}\n${node.ref.id}`;
        item.iconPath = new vscode.ThemeIcon("symbol-field");
        item.contextValue = "tweakRecord";
        item.command = { command: "redcode.openTweakRecord", title: "Open Record", arguments: [node.ref.path ?? node.ref.id] };
        // A record another tool claims opens in that tool on a click; Open Record stays in the menu.
        const claim = node.claims?.[0];
        if (claim) {
          item.contextValue = "tweakRecord.claimed";
          item.command = { command: claim.command, title: `Open in ${claim.title}`, arguments: [node.ref.path ?? node.ref.id] };
          item.tooltip += `\nClick opens it in ${claim.title}`;
        }
        return item;
      }
      case "note": {
        const item = new vscode.TreeItem(node.text, vscode.TreeItemCollapsibleState.None);
        item.iconPath = new vscode.ThemeIcon("info");
        return item;
      }
    }
  }

  async getChildren(node?: TweakNode): Promise<TweakNode[]> {
    try {
      this.db.bridge();
    } catch {
      return [];
    }
    if (!node) {
      if (this.filtered) {
        return [...this.filtered.byType]
          .sort((a, b) => shortType(a[0]).localeCompare(shortType(b[0])))
          .map(([type, records]): TweakNode => ({ kind: "type", type, count: records.length, records }));
      }
      const types = await this.loadWithProgress();
      return types.types.slice().sort((a, b) => shortType(a.type).localeCompare(shortType(b.type))).map((t): TweakNode => ({ kind: "type", type: t.type, count: t.count }));
    }
    if (node.kind === "type") {
      const records = node.records ?? (await this.db.recordsOf(node.type));
      return this.withClaims(this.grouped(node.type, records, !!node.records));
    }
    if (node.kind === "group") return this.withClaims(this.capped(node.records));
    return [];
  }

  /** Record nodes with the tools that claim them, so a click opens the tool. */
  private async withClaims(nodes: TweakNode[]): Promise<TweakNode[]> {
    if (this.claims.all.length === 0) return nodes;
    const records = nodes.flatMap((n) => (n.kind === "record" ? [n.ref] : []));
    if (records.length === 0) return nodes;
    const claims = await this.claims.of(records);
    return nodes.map((n) => (n.kind === "record" && claims.has(n.ref.id) ? { ...n, claims: claims.get(n.ref.id) } : n));
  }

  /** Records under a type: grouped by the part of the path before the first dot when there are many. */
  private grouped(type: string, records: TweakRef[], flat: boolean): TweakNode[] {
    const sorted = records.slice().sort((a, b) => (a.path ?? "~" + a.id).localeCompare(b.path ?? "~" + b.id));
    if (flat || sorted.length <= 200) return this.capped(sorted);
    const groups = new Map<string, TweakRef[]>();
    for (const r of sorted) {
      const prefix = r.path ? r.path.slice(0, Math.max(0, r.path.indexOf(".")) || r.path.length) : "(unnamed)";
      const list = groups.get(prefix) ?? [];
      list.push(r);
      groups.set(prefix, list);
    }
    if (groups.size === 1) return this.capped(sorted);
    return [...groups].map(([prefix, list]): TweakNode => ({ kind: "group", type, prefix, records: list }));
  }

  private capped(records: TweakRef[]): TweakNode[] {
    const shown = records.slice(0, GroupCap).map((ref): TweakNode => ({ kind: "record", ref }));
    if (records.length > GroupCap) shown.push({ kind: "note", text: `${(records.length - GroupCap).toLocaleString()} more: use the filter to find them` });
    return shown;
  }
}

/** Hover on record paths in YAML and .tweak files: the type and the main flats. Only once TweakDB is loaded, so a hover never starts the 12 s load. */
export class TweakHover implements vscode.HoverProvider {
  constructor(private readonly db: TweakDb) {}

  async provideHover(document: vscode.TextDocument, position: vscode.Position): Promise<vscode.Hover | undefined> {
    if (!this.db.loaded) return undefined;
    const range = document.getWordRangeAtPosition(position, /[A-Za-z_][\w]*(?:\.[\w$]+)+/);
    if (!range) return undefined;
    const path = document.getText(range);
    let record: TweakRecordFull | undefined;
    try {
      record = await this.db.record(path);
    } catch {
      return undefined;
    }
    if (!record) return undefined;
    const md = new vscode.MarkdownString(undefined, true);
    // Trusted for the Open record link; flat values have their Markdown characters escaped.
    md.isTrusted = true;
    md.appendMarkdown(`**${record.path}** · ${shortType(record.type)}\n\n`);
    for (const f of mainFlats(record)) md.appendMarkdown(`\`${f.name}\` ${shortValue(f.value).replace(/[\\`*_[\]<>]/g, "\\$&")}  \n`);
    md.appendMarkdown(`\n[Open record](command:redcode.openTweakRecord?${encodeURIComponent(JSON.stringify([record.path ?? record.id]))})`);
    return new vscode.Hover(md, range);
  }
}
