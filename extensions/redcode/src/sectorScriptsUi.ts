// Sector scripts in VS Code (docs/design/sector-scripts.md): the Scripts menu of a sector's 3D view, a run
// with its progress on the view's button, the preview of its changes and one undoable edit on Apply, Debug
// under VS Code's JavaScript debugger, and what a script asks of REDcode: another file, another EDGE
// extension's API, a request for an assistant.

import * as fs from "node:fs";
import * as path from "node:path";
import * as vscode from "vscode";
import type { BridgeClient } from "./bridgeClient";
import type { Cr2wDocument } from "./cr2wEditor";
import { findProject, ProjectFolders, projectPathFor } from "./project";
import type { PatchOp } from "./types";
import { changeToOp, describeChange, sectorOfChange, type NodeChange } from "./sectorNodes";
import { isKnownScript, knowsScriptFile, withKnownScript, listScripts, myScriptsDir, projectScriptsDir, runScript, scriptFileName, scriptTemplate, ScriptStopped, type ScriptInfo, type ScriptPlace, type ScriptResult, type ScriptRun } from "./sectorScripts";

/** The scripts the modder has let run on this machine, by file and text (sectorScripts.ts): another is read before it runs. */
const KnownKey = "redcode.scriptsKnown";

/** What a run needs of the editor page it was started from. */
export interface ScriptHost {
  document: Cr2wDocument;
  bridge: BridgeClient;
  /** The sector's game path, which names its nodes. */
  sector: string;
  /** To the page that asked. */
  post(message: unknown): void;
  /** To every page of the document: an edit was made. */
  changed(): void;
  /** The layers turned on in the view, by game path (docs/design/sector-layers.md, L2). */
  layers?: string[];
  /** The view's selection by id (`<sector>#<entry>`), the layers' things too. */
  selectedIds?: string[];
  /** Writes a layer's CR2W JSON to a file: the project's copy (with its unsaved edits when open) or the game's. */
  layerJson?(sector: string, file: string): Promise<void>;
}

const PlaceLabel: Record<ScriptPlace, string> = { project: "This project", mine: "My scripts", example: "Examples" };

interface ScriptItem extends vscode.QuickPickItem {
  script?: ScriptInfo;
  action?: "new" | "folder";
}

const button = (icon: string, tooltip: string, id: string) => ({ iconPath: new vscode.ThemeIcon(icon), tooltip, id }) as vscode.QuickInputButton & { id: string };

export class SectorScriptsUi {
  private readonly running = new Map<Cr2wDocument, ScriptRun>();

  constructor(
    private readonly context: vscode.ExtensionContext,
    private readonly log: vscode.OutputChannel,
    /** The editor's: opens a project's copy of a sector and applies a run's changes there as one edit. */
    private readonly applyToCopy: (file: string, ops: PatchOp[], label: string, entries: number[], line: { name: string; line: string }) => Promise<void>,
  ) {
    // A known script saved in VS Code's editor is the modder's own change: it stays known. A file changed any
    // other way (an assistant, a download) does not pass through here, and is asked about before it runs again.
    context.subscriptions.push(
      vscode.workspace.onDidSaveTextDocument((d) => {
        if (d.uri.scheme === "file" && /\.mjs$/i.test(d.uri.fsPath) && knowsScriptFile(this.knownList(), d.uri.fsPath)) void this.remember(d.uri.fsPath);
      }),
    );
  }

  /**
   * A run on the game's copy, which cannot change (the owner, 2026-11-24): one question, then the whole job. The
   * sector is added to the project (or its copy found), shown in the Project view, opened in its own tab with the
   * changed nodes selected, and the changes applied there as one unsaved edit.
   */
  private async applyInProject(host: ScriptHost, s: ScriptInfo, changes: NodeChange[], title: string): Promise<void> {
    const gamePath = host.document.gamePath!;
    const dir = this.projectDir(host.document);
    const project = dir ? findProject(dir) : undefined;
    if (!project) {
      void vscode.window.showInformationMessage(`${title} Values change only in a project's copy of a sector: open or make a project first. The list is in the REDcode output.`);
      return;
    }
    const copy = projectPathFor(project, gamePath);
    const there = fs.existsSync(copy);
    const go = there ? "Open the Project's Copy and Apply" : "Add to Project and Apply";
    for (;;) {
      const pick = await vscode.window.showInformationMessage(
        title,
        {
          modal: true,
          detail:
            (there
              ? `The game's copy cannot change. ${project.name} has its own copy of this sector: REDcode opens it and makes the changes there, unsaved; one Undo takes them all back.`
              : `The game's copy cannot change. REDcode adds this sector to ${project.name}, opens the copy, and makes the changes there, unsaved; one Undo takes them all back.`) +
            "\n\nPacked, a project's copy replaces the game's whole sector, which undoes what other mods change in it, such as EDGEbuilder's ArchiveXL deletions.",
        },
        go,
        "Show List",
      );
      if (pick === "Show List") {
        this.log.show(true);
        continue;
      }
      if (pick !== go) {
        this.log.appendLine(`script: ${s.name}: not applied`);
        return;
      }
      break;
    }
    if (!there) {
      // REDcode's own Add to Project: it extracts the file and shows it in the Project view.
      await vscode.commands.executeCommand("redcode.addToProject", { kind: "file", file: { name: gamePath } });
      if (!fs.existsSync(copy)) {
        this.log.appendLine(`script: ${s.name}: the sector was not added to ${project.name}`);
        return;
      }
    } else {
      await vscode.commands.executeCommand("redcode.revealInProject", copy);
    }
    const entries = [...new Set(changes.map((c) => c.entry))];
    const line = `${s.name}: ${changes.length.toLocaleString()} value${changes.length === 1 ? "" : "s"} changed in ${project.name}'s copy (unsaved) · Ctrl+Z takes them back`;
    await this.applyToCopy(copy, changes.map(changeToOp), `Script: ${s.name}`, entries, { name: s.name, line });
    this.log.appendLine(`script: ${s.name}: ${changes.length} change(s) applied to ${copy}`);
    host.post({ type: "sectorScript", state: "applied", name: s.name, line: `${s.name}: applied in ${project.name}'s copy, opened in its own tab` });
  }

  /** The project a document belongs to: the one it is in, or the workspace's. */
  private projectDir(document: Cr2wDocument): string | undefined {
    if (!document.gamePath) {
      const marker = `${path.sep}${ProjectFolders.archive.toLowerCase()}${path.sep}`;
      const at = document.uri.fsPath.toLowerCase().indexOf(marker);
      if (at >= 0) return document.uri.fsPath.slice(0, at);
    }
    for (const f of vscode.workspace.workspaceFolders ?? []) {
      const p = findProject(f.uri.fsPath);
      if (p) return p.dir;
    }
    return undefined;
  }

  private places(document: Cr2wDocument): { place: ScriptPlace; dir: string }[] {
    const project = this.projectDir(document);
    return [
      ...(project ? [{ place: "project" as const, dir: projectScriptsDir(project) }] : []),
      { place: "mine", dir: myScriptsDir() },
      { place: "example", dir: path.join(this.context.extensionPath, "media", "scripts") },
    ];
  }

  private knownList(): string[] {
    return this.context.globalState.get<string[]>(KnownKey, []);
  }

  private known(file: string): boolean {
    return isKnownScript(this.knownList(), file);
  }

  private async remember(file: string): Promise<void> {
    await this.context.globalState.update(KnownKey, withKnownScript(this.knownList(), file));
  }

  isRunning(document: Cr2wDocument): boolean {
    return this.running.has(document);
  }

  stop(document: Cr2wDocument): void {
    this.running.get(document)?.stop();
  }

  /** The Scripts button: the menu, then what was chosen. selection: the view's selected node data entries. */
  async menu(host: ScriptHost, selection: number[]): Promise<void> {
    if (this.running.has(host.document)) {
      void vscode.window.showInformationMessage("A script is running on this sector. Stop it with the Scripts button first.");
      return;
    }
    const scripts = listScripts(this.places(host.document));
    const layerPicks = (host.selectedIds ?? []).filter((id) => !id.startsWith(`${host.sector}#`)).length;
    const n = selection.length + layerPicks;
    const items: ScriptItem[] = [];
    let place: ScriptPlace | undefined;
    for (const s of scripts) {
      if (s.place !== place) {
        place = s.place;
        items.push({ label: PlaceLabel[s.place], kind: vscode.QuickPickItemKind.Separator });
      }
      items.push({
        label: s.name,
        description: path.basename(s.file),
        detail: s.description || undefined,
        script: s,
        buttons: [
          ...(n ? [button("filter", `Run on Selection (${n.toLocaleString()})`, "selection")] : []),
          button("debug-alt", "Debug: run under VS Code's debugger, to its breakpoints", "debug"),
          ...(s.place === "example"
            ? [button("eye", "View", "edit"), button("copy", "Copy to My Scripts", "copy")]
            : [button("edit", "Edit", "edit"), button("trash", "Remove", "remove")]),
        ],
      });
    }
    items.push({ label: "", kind: vscode.QuickPickItemKind.Separator });
    items.push({ label: "$(add) New Script…", action: "new" });
    items.push({ label: "$(folder-opened) Open Scripts Folder", action: "folder" });

    const qp = vscode.window.createQuickPick<ScriptItem>();
    qp.title = "Sector scripts";
    qp.placeholder = n ? `Enter runs on every node; the filter button runs on the ${n.toLocaleString()} selected` : "Enter runs on every node";
    qp.items = items;
    qp.matchOnDescription = true;
    qp.matchOnDetail = true;
    const chosen = await new Promise<{ item: ScriptItem; how: string } | undefined>((resolve) => {
      qp.onDidAccept(() => {
        const item = qp.selectedItems[0];
        resolve(item ? { item, how: "all" } : undefined);
        qp.hide();
      });
      qp.onDidTriggerItemButton((e) => {
        resolve({ item: e.item, how: (e.button as vscode.QuickInputButton & { id: string }).id });
        qp.hide();
      });
      qp.onDidHide(() => resolve(undefined));
      qp.show();
    });
    qp.dispose();
    if (!chosen) return;
    const { item, how } = chosen;
    if (item.action === "new") return this.newScript(host.document);
    if (item.action === "folder") return this.openFolder(host.document);
    const s = item.script;
    if (!s) return;
    switch (how) {
      case "all":
        return this.run(host, s, { selection });
      case "selection":
        return this.run(host, s, { only: selection, selection });
      case "debug": {
        const on = n ? await this.debugOn(n) : "all";
        if (!on) return;
        return this.run(host, s, { debug: true, selection, ...(on === "selection" ? { only: selection } : {}) });
      }
      case "edit":
        await vscode.window.showTextDocument(vscode.Uri.file(s.file), { preview: s.place === "example" });
        return;
      case "copy":
        return this.copyToMine(s);
      case "remove":
        return this.remove(s);
    }
  }

  /** Debug with a selection: on it, or on every node; undefined when the question is closed. */
  private async debugOn(n: number): Promise<"all" | "selection" | undefined> {
    const pick = await vscode.window.showQuickPick(
      [
        { label: "Every Node", on: "all" as const },
        { label: `The Selection (${n.toLocaleString()})`, on: "selection" as const },
      ],
      { title: "Debug on" },
    );
    return pick?.on;
  }

  private async newScript(document: Cr2wDocument): Promise<void> {
    const name = await vscode.window.showInputBox({ title: "New Script", prompt: "The script's name, as the menu shows it", value: "Short streaming distance" });
    if (!name?.trim()) return;
    const project = this.projectDir(document);
    let dir = myScriptsDir();
    if (project) {
      const where = await vscode.window.showQuickPick(
        [
          { label: "This Project", detail: "In the project's .redcode/scripts: it travels with the project and is never packed", dir: projectScriptsDir(project) },
          { label: "My Scripts", detail: "Offered in every project on this computer", dir: myScriptsDir() },
        ],
        { title: `Where does "${name.trim()}" go?` },
      );
      if (!where) return;
      dir = where.dir;
    }
    fs.mkdirSync(dir, { recursive: true });
    let file = path.join(dir, scriptFileName(name.trim()));
    for (let i = 2; fs.existsSync(file); i++) file = path.join(dir, scriptFileName(`${name.trim()} ${i}`));
    fs.writeFileSync(file, scriptTemplate(name.trim()));
    await this.remember(file);
    await vscode.window.showTextDocument(vscode.Uri.file(file));
  }

  private async openFolder(document: Cr2wDocument): Promise<void> {
    const project = this.projectDir(document);
    let dir = myScriptsDir();
    if (project) {
      const pick = await vscode.window.showQuickPick(
        [
          { label: "This Project's", dir: projectScriptsDir(project) },
          { label: "My Scripts", dir: myScriptsDir() },
        ],
        { title: "Open which scripts folder?" },
      );
      if (!pick) return;
      dir = pick.dir;
    }
    fs.mkdirSync(dir, { recursive: true });
    await vscode.env.openExternal(vscode.Uri.file(dir));
  }

  private async copyToMine(s: ScriptInfo): Promise<void> {
    const dir = myScriptsDir();
    fs.mkdirSync(dir, { recursive: true });
    let file = path.join(dir, path.basename(s.file));
    for (let i = 2; fs.existsSync(file); i++) file = path.join(dir, path.basename(s.file).replace(/\.mjs$/i, `-${i}.mjs`));
    fs.copyFileSync(s.file, file);
    await this.remember(file);
    await vscode.window.showTextDocument(vscode.Uri.file(file));
  }

  private async remove(s: ScriptInfo): Promise<void> {
    const pick = await vscode.window.showWarningMessage(`Remove the script "${s.name}"?`, { modal: true, detail: `${s.file} goes to the Recycle Bin.` }, "Remove");
    if (pick !== "Remove") return;
    await vscode.workspace.fs.delete(vscode.Uri.file(s.file), { useTrash: true });
  }

  /** A script not made or run here before is read first: it runs with the modder's rights. */
  private async trusted(s: ScriptInfo): Promise<boolean> {
    if (!vscode.workspace.isTrusted) {
      void vscode.window.showWarningMessage("Scripts run only in a trusted workspace. Trust this folder first (Manage Workspace Trust).");
      return false;
    }
    if (s.place === "example" || this.known(s.file)) return true;
    const changed = knowsScriptFile(this.knownList(), s.file);
    await vscode.window.showTextDocument(vscode.Uri.file(s.file), { preview: true, viewColumn: vscode.ViewColumn.Beside });
    const pick = await vscode.window.showWarningMessage(
      changed ? `Run "${s.name}"? It was changed outside REDcode since it last ran here.` : `Run "${s.name}"? It has not run on this computer before.`,
      {
        modal: true,
        detail: changed
          ? "A script runs as you, with your files and network. It is open beside: read what it says now. A script you save in this editor stays known."
          : "A script runs as you, with your files and network. It is open beside: read it first, above all one from someone else.",
      },
      "Run",
    );
    if (pick !== "Run") return false;
    await this.remember(s.file);
    return true;
  }

  /** Runs a script on the sector: the entries in only when given, else every node; selection is what ctx.selected() gives. */
  async run(host: ScriptHost, s: ScriptInfo, o: { only?: number[]; selection?: number[]; debug?: boolean } = {}): Promise<void> {
    if (!(await this.trusted(s))) return;
    const { document } = host;
    const only = o.only;
    // Layers on: asked each run (docs/design/sector-layers.md, decision 3).
    let layers: string[] = [];
    if (host.layers?.length && host.layerJson) {
      const name = (p: string) => p.slice(p.lastIndexOf("\\") + 1).replace(/\.streamingsector$/i, "");
      const pick = await vscode.window.showQuickPick(
        [
          { label: "This Sector", detail: name(host.sector), on: false },
          { label: `This Sector and Its Layers On (${host.layers.length})`, detail: host.layers.map(name).join(", "), on: true },
        ],
        { title: `Run "${s.name}" on` },
      );
      if (!pick) return;
      if (pick.on) layers = host.layers;
    }
    const inLayers = (id: string) => layers.some((l) => id.toLowerCase().startsWith(`${l.toLowerCase()}#`));
    const layerIds = (host.selectedIds ?? []).filter(inLayers);
    const scratch = path.join(this.context.globalStorageUri.fsPath, "scripts");
    fs.mkdirSync(scratch, { recursive: true });
    const json = path.join(scratch, "sector.json");
    host.post({ type: "sectorScript", state: "running", name: s.name, done: 0, total: 0, note: "Reading the sector…" });
    this.log.appendLine(`script: ${s.name} on ${host.sector}${only ? `, ${only.length} selected` : ""}${o.debug ? ", under the debugger" : ""}`);
    let lastPost = 0;
    let lastLog: string | undefined;
    let run: ScriptRun | undefined;
    let cancelled = false;
    // The slot is taken now, so a second Run waits for this one; Stop while the sector is read cancels it.
    const placeholder: ScriptRun = {
      result: Promise.reject(new ScriptStopped()),
      stop: () => {
        cancelled = true;
        run?.stop();
      },
    };
    placeholder.result.catch(() => undefined);
    this.running.set(document, placeholder);
    try {
      await document.snapshotJson(host.bridge, json, path.join(scratch, "sector.streamingsector"));
      const layerFiles: { sector: string; json: string }[] = [];
      for (const [i, l] of layers.entries()) {
        if (cancelled) throw new ScriptStopped();
        host.post({ type: "sectorScript", state: "running", name: s.name, done: 0, total: 0, note: `Reading the layers… ${i + 1} of ${layers.length}` });
        const file = path.join(scratch, `layer-${i}.json`);
        await host.layerJson!(l, file);
        layerFiles.push({ sector: l, json: file });
      }
      if (cancelled) throw new ScriptStopped();
      run = runScript({
        runner: path.join(this.context.extensionPath, "dist", "scriptRunner.js"),
        script: s.file,
        sector: host.sector,
        json,
        only,
        selection: o.selection,
        ...(layerFiles.length ? { layers: layerFiles, selectionIds: layerIds, ...(only ? { onlyIds: layerIds } : {}) } : {}),
        debug: o.debug,
        onLog: (line) => {
          lastLog = line;
          this.log.appendLine(`[${s.name}] ${line}`);
        },
        onProgress: (done, total) => {
          const now = Date.now();
          if (now - lastPost < 150 && done < total) return;
          lastPost = now;
          host.post({ type: "sectorScript", state: "running", name: s.name, done, total });
        },
        onDebug: (port) => void this.attach(s, port),
        onCall: (method, params) => this.answer(host, s, method, params),
      });
      const started = run;
      this.running.set(document, { result: started.result, stop: () => started.stop() });
      const result = await run.result;
      await this.finish(host, s, result, lastLog);
    } catch (e) {
      if (e instanceof ScriptStopped) {
        this.log.appendLine(`script: ${s.name} stopped`);
        host.post({ type: "sectorScript", state: "done", name: s.name, selected: null, line: `${s.name}: stopped` });
      } else {
        const message = e instanceof Error ? e.message : String(e);
        this.log.appendLine(`script: ${s.name} failed: ${message}`);
        host.post({ type: "sectorScript", state: "done", name: s.name, selected: null, line: `${s.name}: failed: ${message.split("\n")[0]}` });
        void vscode.window.showErrorMessage(`The script "${s.name}" failed: ${message.split("\n")[0]}`, "Show Output", "Edit").then((pick) => {
          if (pick === "Show Output") this.log.show(true);
          if (pick === "Edit") void vscode.window.showTextDocument(vscode.Uri.file(s.file));
        });
      }
    } finally {
      this.running.delete(document);
    }
  }

  private async attach(s: ScriptInfo, port: number): Promise<void> {
    this.log.appendLine(`script: ${s.name} waits for the debugger on port ${port}`);
    await vscode.window.showTextDocument(vscode.Uri.file(s.file), { preview: true, viewColumn: vscode.ViewColumn.Beside });
    const ok = await vscode.debug.startDebugging(undefined, {
      type: "node",
      request: "attach",
      name: `Script: ${s.name}`,
      address: "127.0.0.1",
      port,
      continueOnAttach: true,
      skipFiles: ["<node_internals>/**", path.join(this.context.extensionPath, "dist", "**")],
    });
    if (!ok) {
      this.log.appendLine(`script: ${s.name}: the debugger did not attach; Stop ends the run`);
      void vscode.window.showWarningMessage(`The debugger did not attach to "${s.name}". Stop it with the Scripts button.`);
    }
  }

  /** What a script asks of REDcode. */
  private async answer(host: ScriptHost, s: ScriptInfo, method: string, params: unknown): Promise<unknown> {
    const p = (params ?? {}) as Record<string, unknown>;
    switch (method) {
      case "read": {
        const gamePath = String(p.path ?? "");
        if (!gamePath) throw new Error("game.read needs a game path");
        const project = this.projectDir(host.document);
        const own = project ? path.join(project, ProjectFolders.archive, ...gamePath.split(/[\\/]/)) : undefined;
        const r = own && fs.existsSync(own) ? await host.bridge.fileToJson(own) : await host.bridge.toJson(gamePath);
        if (r.json === null) throw new Error(`No JSON for ${gamePath}`);
        return r.json;
      }
      case "tool": {
        const id = String(p.extension ?? "");
        const name = String(p.method ?? "");
        if (!/^edgemodders\./i.test(id)) throw new Error(`tools.call reaches the EDGE tools only (edgemodders.*), not ${id}`);
        const ext = vscode.extensions.getExtension(id);
        if (!ext) throw new Error(`${id} is not installed`);
        const api = (ext.isActive ? ext.exports : await ext.activate()) as Record<string, unknown> | undefined;
        const fn = api?.[name];
        if (typeof fn !== "function") throw new Error(`${id} has no ${name} in its API`);
        const value = await (fn as (...a: unknown[]) => unknown).apply(api, Array.isArray(p.args) ? p.args : []);
        // What goes back is what JSON can carry.
        return value === undefined ? null : JSON.parse(JSON.stringify(value));
      }
      case "agent":
        return this.request(host, s, String(p.text ?? ""), (p.nodes as unknown[]) ?? []);
      default:
        throw new Error(`No ${method} in REDcode`);
    }
  }

  /** agent.request: a request saved in the project for an assistant, which reads it through MCP (request_get). */
  private async request(host: ScriptHost, s: ScriptInfo, text: string, nodes: unknown[]): Promise<{ id: number; file: string }> {
    const project = this.projectDir(host.document);
    if (!project) throw new Error("agent.request saves the request in a project: open one first");
    const dir = path.join(project, ".redcode", "requests");
    fs.mkdirSync(dir, { recursive: true });
    const ids = fs
      .readdirSync(dir)
      .map((n) => /^(\d+)\.json$/.exec(n)?.[1])
      .filter((x): x is string => !!x)
      .map(Number);
    const id = (ids.length ? Math.max(...ids) : 0) + 1;
    const file = path.join(dir, `${id}.json`);
    const sectorName = host.sector.slice(host.sector.lastIndexOf("\\") + 1);
    fs.writeFileSync(
      file,
      JSON.stringify(
        {
          id,
          state: "open",
          text,
          script: s.name,
          sector: host.sector,
          file: host.document.gamePath ? null : host.document.uri.fsPath,
          created: new Date().toISOString(),
          nodes,
        },
        null,
        2,
      ) + "\n",
    );
    const prompt = `Do REDcode request ${id}: ${text} (${nodes.length} node${nodes.length === 1 ? "" : "s"} of ${sectorName}; read it with the redcode MCP tool request_get).`;
    await vscode.env.clipboard.writeText(prompt);
    this.log.appendLine(`script: ${s.name} saved request ${id} (${nodes.length} nodes) in ${file}`);
    void vscode.window.showInformationMessage(`Request ${id} is saved, and its prompt is copied: paste it to your assistant.`, "Open Request").then((pick) => {
      if (pick) void vscode.window.showTextDocument(vscode.Uri.file(file));
    });
    return { id, file };
  }

  /** The result: the selection to the view, then the changes, previewed. The line under the view ends with the script's last ctx.log line, often its answer. */
  private async finish(host: ScriptHost, s: ScriptInfo, r: ScriptResult, lastLog?: string): Promise<void> {
    const secs = `${(r.ms / 1000).toFixed(1)} s`;
    const on = r.visited < r.total ? `${r.visited.toLocaleString()} of ${r.total.toLocaleString()} nodes` : `${r.total.toLocaleString()} nodes`;
    const picked = r.selected === null ? "" : `${r.selected.length.toLocaleString()} selected, `;
    const line = `${s.name}: ${picked}${r.changes.length.toLocaleString()} changed, ${on}, ${secs}`;
    this.log.appendLine(`script: ${line}`);
    const said = lastLog ? ` · ${lastLog.length > 160 ? `${lastLog.slice(0, 157)}…` : lastLog}` : "";
    host.post({ type: "sectorScript", state: "done", name: s.name, selected: r.selected, selectedIds: r.selectedIds ?? null, line: `${line}${said}` });
    if (r.changes.length) await this.preview(host, s, r.changes);
  }

  /**
   * Changes made elsewhere than a script (the sector view's Properties tab): the same question, list and one
   * undoable edit as a script's, or on the game's sector the same Add to Project and Apply.
   */
  async applyChanges(host: ScriptHost, label: string, changes: NodeChange[]): Promise<void> {
    if (!changes.length) {
      void vscode.window.showInformationMessage(`${label}: nothing to change, every one has that value already.`);
      return;
    }
    await this.preview(host, { file: "", place: "example", name: label, description: "" }, changes);
  }

  /**
   * Changes in several sectors (a run over layers, docs/design/sector-layers.md L2): one question naming each
   * sector and where its changes go, the game's sectors added to the project together, then each sector's changes
   * as one edit in its own tab (this one in place), each with its own Undo.
   */
  private async applyAcross(host: ScriptHost, s: ScriptInfo, changes: NodeChange[], title: string): Promise<void> {
    const bySector = new Map<string, NodeChange[]>();
    for (const c of changes) {
      const k = sectorOfChange(c);
      bySector.set(k, [...(bySector.get(k) ?? []), c]);
    }
    const dir = this.projectDir(host.document);
    const project = dir ? findProject(dir) : undefined;
    const name = (p: string) => p.slice(p.lastIndexOf("\\") + 1).replace(/\.streamingsector$/i, "");
    type Target = { sector: string; changes: NodeChange[]; here: boolean; copy?: string; add: boolean };
    const targets: Target[] = [];
    for (const [sector, list] of bySector) {
      const here = sector.toLowerCase() === host.sector.toLowerCase() && !host.document.gamePath;
      if (here) {
        targets.push({ sector, changes: list, here, add: false });
        continue;
      }
      if (!project) {
        void vscode.window.showInformationMessage(`${title} Values change only in a project's copy of a sector: open or make a project first. The list is in the REDcode output.`);
        return;
      }
      const copy = projectPathFor(project, sector);
      targets.push({ sector, changes: list, here, copy, add: !fs.existsSync(copy) });
    }
    const adds = targets.filter((t) => t.add);
    const lines = targets.map((t) => {
      const n = `${t.changes.length.toLocaleString()} in ${name(t.sector)}`;
      return t.here ? `${n}: here, in this tab` : t.add ? `${n}: the game's, added to ${project!.name} and changed there in its own tab` : `${n}: ${project!.name}'s copy, in its own tab`;
    });
    const go = adds.length ? `Add ${adds.length === 1 ? "It" : `${adds.length} Sectors`} to Project and Apply` : "Apply";
    for (;;) {
      const pick = await vscode.window.showInformationMessage(
        title,
        {
          modal: true,
          detail:
            `${lines.join("\n")}\n\nEach sector's changes are one edit in its own tab, unsaved: one Undo there takes them back. The list is in the REDcode output.\n\n` +
            "Packed, a project's copy replaces the game's whole sector, which undoes what other mods change in it, such as EDGEbuilder's ArchiveXL deletions.",
        },
        go,
        "Show List",
      );
      if (pick === "Show List") {
        this.log.show(true);
        continue;
      }
      if (pick !== go) {
        this.log.appendLine(`script: ${s.name}: not applied`);
        return;
      }
      break;
    }
    if (adds.length) {
      // REDcode's own Add to Project, for all of them at once: one question if any is there already.
      await vscode.commands.executeCommand("redcode.addToProject", { kind: "file", file: { name: adds[0].sector } }, { files: adds.map((t) => ({ name: t.sector })) });
    }
    const label = `Script: ${s.name}`;
    let done = 0;
    for (const t of targets) {
      const ops = t.changes.map(changeToOp);
      const entries = [...new Set(t.changes.map((c) => c.entry))];
      if (t.here) {
        await host.document.edit(host.bridge, ops, label);
        host.changed();
      } else {
        if (!fs.existsSync(t.copy!)) {
          this.log.appendLine(`script: ${s.name}: ${t.sector} was not added to ${project!.name}; its ${t.changes.length} change(s) were not applied`);
          continue;
        }
        const line = `${s.name}: ${t.changes.length.toLocaleString()} value${t.changes.length === 1 ? "" : "s"} changed here (unsaved) · Ctrl+Z takes them back`;
        await this.applyToCopy(t.copy!, ops, label, entries, { name: s.name, line });
      }
      done += t.changes.length;
      this.log.appendLine(`script: ${s.name}: ${t.changes.length} change(s) applied to ${t.here ? host.sector : t.copy}`);
    }
    host.post({ type: "sectorScript", state: "applied", name: s.name, line: `${s.name}: ${done.toLocaleString()} change${done === 1 ? "" : "s"} applied in ${targets.length} sectors, each in its own tab; Ctrl+Z there takes them back` });
  }

  private async preview(host: ScriptHost, s: ScriptInfo, changes: NodeChange[]): Promise<void> {
    const MaxLines = 2000;
    this.log.appendLine(`script: ${s.name} would change:`);
    for (const c of changes.slice(0, MaxLines)) this.log.appendLine(`  ${describeChange(c)}`);
    if (changes.length > MaxLines) this.log.appendLine(`  and ${(changes.length - MaxLines).toLocaleString()} more`);
    const counts = new Map<string, number>();
    for (const c of changes) counts.set(c.property, (counts.get(c.property) ?? 0) + 1);
    const what = [...counts].map(([p, k]) => `${p} on ${k.toLocaleString()} node${k === 1 ? "" : "s"}`).join(", ");
    const title = `"${s.name}" would change ${changes.length.toLocaleString()} value${changes.length === 1 ? "" : "s"}: ${what}.`;
    const { document } = host;
    if (changes.some((c) => sectorOfChange(c).toLowerCase() !== host.sector.toLowerCase())) return this.applyAcross(host, s, changes, title);
    if (document.gamePath) return this.applyInProject(host, s, changes, title);
    for (;;) {
      const pick = await vscode.window.showInformationMessage(
        title,
        {
          modal: true,
          detail:
            "Apply makes them one edit: one Undo takes them all back. The list is in the REDcode output.\n\n" +
            "This sector is a project's copy: packed, it replaces the game's whole sector, which undoes what other mods change in it, such as EDGEbuilder's ArchiveXL deletions.",
        },
        "Apply",
        "Show List",
      );
      if (pick === "Show List") {
        this.log.show(true);
        continue;
      }
      if (pick !== "Apply") {
        this.log.appendLine(`script: ${s.name}: not applied`);
        return;
      }
      break;
    }
    await document.edit(host.bridge, changes.map(changeToOp), `Script: ${s.name}`);
    host.changed();
    this.log.appendLine(`script: ${s.name}: ${changes.length} change(s) applied`);
    host.post({ type: "sectorScript", state: "applied", name: s.name, line: `${s.name}: ${changes.length.toLocaleString()} change${changes.length === 1 ? "" : "s"} applied; Ctrl+Z takes ${changes.length === 1 ? "it" : "them"} back` });
  }
}
