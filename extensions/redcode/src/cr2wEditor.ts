// The CR2W editor: a custom editor over a bridge document session. See docs/design/cr2w-editor.md.
//
// The bridge keeps the parsed file; the page reads one node at a time and sends edits as patches. The
// document keeps the forward operations since the last save, so a backup is that log and a bridge
// restart is survived by reopening the file and replaying it.

import { readNode, type Cr2wNode } from "./cr2wValues";
import * as fs from "node:fs";
import * as path from "node:path";
import * as vscode from "vscode";
import type { BridgeClient } from "./bridgeClient";
import { gameUri, gamePathOfUri } from "./gameFs";
import { meshGlbFor, meshPayload } from "./meshExport";
import { animsClip, animsGlbFor, animsList, animsSkeleton, baseBodyFor, baseBodyGlb, entityBodyGlb, readAnimsGlb, type AnimsGlb, type BodyGlb } from "./animsGlb";
import { listSet, memberGlb, newSetSession, placeSet, toMatrix, type SetMember } from "./animsSet";
import { SectorScriptsUi, type ScriptHost } from "./sectorScriptsUi";
import { appearanceOf, cachedGlb, createSectorLoader, findOverlaps, meshMaterials, sectorsOver, texturedGlb, type SectorLoader, type SectorRef } from "../../../packages/world-view/src/host";
import { bridgeOver, renderMaterials } from "@edgemodders/edgemat-core";
import { gameCacheReady, stampFolder } from "./exportCache";
import { findEdgemat, mapsForWebview, openInEdgemat, type RenderedMaterial } from "./edgemat";
import type { LipSync } from "./lipsync";
import { ProjectFolders } from "./project";
import type { TextureViewer } from "./textureViewer";
import type { DocumentInfo, MeshItem, PatchOp, PatchResult } from "./types";

export const Cr2wViewType = "redcode.cr2w";
/**
 * The same editor under a second view type, offered under Open With for .xbm, .json and .csv. VS Code
 * keeps one manifest entry per view type, so a default and an option registration need two names.
 */
export const Cr2wOptionViewType = "redcode.cr2wOption";

/** The view type to open a file with: the default one for the editor's own types, else the option one. */
export function cr2wViewTypeFor(file: string): string {
  return Cr2wExtensions.has(path.extname(file).toLowerCase()) ? Cr2wViewType : Cr2wOptionViewType;
}

/** File types the CR2W editor opens by default. Others get it through Open With. */
export const Cr2wExtensions = new Set([
  ".ent", ".app", ".mesh", ".inkatlas", ".mi", ".mt", ".mlsetup", ".mltemplate", ".mlmask", ".anims", ".animgraph", ".rig",
  ".morphtarget", ".inkwidget", ".inkmenu", ".inkstyle", ".scene", ".quest", ".questphase", ".journal", ".streamingsector", ".streamingblock",
  ".physicalscene", ".workspot", ".cubemap", ".texarray", ".envprobe", ".es", ".gamedef", ".lipmap", ".fp", ".cminimap", ".csv",
  ".inkanim", ".inkfontfamily", ".inkcharcustomization", ".garmentlayerparams", ".behavior", ".effect", ".particle", ".w2mesh",
]);

/**
 * True for the file types the editor owns, and for a .json or .csv that is a CR2W file inside (the
 * localization and C2dArray resources), which the first four bytes tell apart from plain text.
 */
export function opensInCr2wEditor(file: string): boolean {
  const ext = path.extname(file).toLowerCase();
  if (Cr2wExtensions.has(ext)) {
    return true;
  }
  if (ext === ".json" || ext === ".csv") {
    try {
      const fd = fs.openSync(file, "r");
      try {
        const head = Buffer.alloc(4);
        return fs.readSync(fd, head, 0, 4, 0) === 4 && head.toString("latin1") === "CR2W";
      } finally {
        fs.closeSync(fd);
      }
    } catch {
      return false;
    }
  }
  return false;
}

interface Backup {
  ops: PatchOp[];
}

/** The project folder a file under source/archive belongs to, or undefined. */
function projectDirOf(file: string): string | undefined {
  const marker = `${path.sep}${ProjectFolders.archive.toLowerCase()}${path.sep}`;
  const at = file.toLowerCase().indexOf(marker);
  return at >= 0 ? file.slice(0, at) : undefined;
}

/** The source/archive folder of the project a file belongs to, or undefined. */
function archiveRootOf(file: string): string | undefined {
  const dir = projectDirOf(file);
  return dir === undefined ? undefined : path.join(dir, ProjectFolders.archive);
}

/** The game path of a file under a project's source/archive (base\...), or undefined. */
function archiveGamePathOf(file: string): string | undefined {
  const dir = projectDirOf(file);
  return dir === undefined ? undefined : file.slice(dir.length + ProjectFolders.archive.length + 2).split(path.sep).join("\\");
}

/** Per document, the values REDbridge answers whole (src/cr2wValues.ts), by path; cleared when the document changes. */
const valueCaches = new WeakMap<Cr2wDocument, Map<string, { value: unknown; type: string }>>();
function valueCacheOf(document: Cr2wDocument): Map<string, { value: unknown; type: string }> {
  let cache = valueCaches.get(document);
  if (!cache) {
    const made = new Map<string, { value: unknown; type: string }>();
    cache = made;
    valueCaches.set(document, made);
    document.onDidChange(() => made.clear());
    document.onDidReload(() => made.clear());
  }
  return cache;
}

export class Cr2wDocument implements vscode.CustomDocument {
  private readonly changed = new vscode.EventEmitter<vscode.CustomDocumentEditEvent<Cr2wDocument>>();
  readonly onDidChange = this.changed.event;
  private readonly reloaded = new vscode.EventEmitter<string>();
  /** Fired when the pages must refetch what they show: after undo, redo, revert, save or a reopen. */
  readonly onDidReload = this.reloaded.event;
  private readonly disposed = new vscode.EventEmitter<void>();
  /** Fired when VS Code closes the document, so the Properties view can let go of it. */
  readonly onDidDispose = this.disposed.event;

  info: DocumentInfo | undefined;
  /** The forward operations since the last save. Replayed from a backup or after the bridge restarts. */
  log: PatchOp[] = [];
  private openedOn: BridgeClient | undefined;
  /** Edits, saves and reverts run one after another, so a save never overlaps an edit on the bridge. */
  private chain: Promise<unknown> = Promise.resolve();

  private enqueue<T>(work: () => Promise<T>): Promise<T> {
    const next = this.chain.then(work, work);
    this.chain = next.catch(() => undefined);
    return next;
  }

  /** Set when the document is a game file opened through the redcode-game scheme: read-only, straight from the archives. */
  readonly gamePath: string | undefined;

  constructor(
    readonly uri: vscode.Uri,
    private readonly logChannel: vscode.OutputChannel,
  ) {
    this.gamePath = gamePathOfUri(uri);
  }

  /** The name shown in the header and the tab. */
  get name(): string {
    return path.basename(this.gamePath ?? this.uri.fsPath);
  }

  get doc(): string {
    if (!this.info) {
      throw new Error("The document is not open on the bridge.");
    }
    return this.info.doc;
  }

  /** Opens the file on this bridge if it is not open there yet, replaying the log after a restart. */
  async ensureOpen(bridge: BridgeClient): Promise<DocumentInfo> {
    if (this.info && this.openedOn === bridge) {
      return this.info;
    }
    this.info = await bridge.openDocument(this.gamePath ? { path: this.gamePath } : { file: this.uri.fsPath });
    this.openedOn = bridge;
    if (this.log.length > 0) {
      await bridge.patch(this.info.doc, this.log);
      this.logChannel.appendLine(`cr2w editor: replayed ${this.log.length} operation(s) on ${path.basename(this.uri.fsPath)}`);
    }
    return this.info;
  }

  edit(bridge: BridgeClient, ops: PatchOp[], label: string): Promise<PatchResult> {
    return this.enqueue(async () => {
      await this.ensureOpen(bridge);
      const result = await bridge.patch(this.doc, ops);
      this.log.push(...ops);
      this.changed.fire({
        document: this,
        label,
        undo: () =>
          this.enqueue(async () => {
            await this.ensureOpen(bridge);
            await bridge.patch(this.doc, result.inverse);
            this.log.push(...result.inverse);
            this.reloaded.fire("undo");
          }),
        redo: () =>
          this.enqueue(async () => {
            await this.ensureOpen(bridge);
            await bridge.patch(this.doc, ops);
            this.log.push(...ops);
            this.reloaded.fire("redo");
          }),
      });
      return result;
    });
  }

  save(bridge: BridgeClient, outFile?: string): Promise<void> {
    return this.enqueue(async () => {
      if (this.gamePath && !outFile) {
        throw new Error("This is the game's copy and is read-only. Add it to the project to edit and save it.");
      }
      await this.ensureOpen(bridge);
      const result = await bridge.saveDocument(this.doc, outFile);
      this.logChannel.appendLine(`cr2w.save ${this.doc} -> ${result.file} (${result.bytes.toLocaleString()} bytes)`);
      this.log = [];
      this.reloaded.fire("save");
    });
  }

  /**
   * The document as it is now, unsaved edits included, as CR2W JSON in outJson (sector scripts). Edits are
   * replayed on a second session, saved to scratch and converted, so this session keeps its own file.
   */
  snapshotJson(bridge: BridgeClient, outJson: string, scratch: string): Promise<void> {
    return this.enqueue(async () => {
      if (!this.log.length) {
        if (this.gamePath) await bridge.toJson(this.gamePath, outJson);
        else await bridge.fileToJson(this.uri.fsPath, outJson);
        return;
      }
      const copy = await bridge.openDocument(this.gamePath ? { path: this.gamePath } : { file: this.uri.fsPath });
      try {
        await bridge.patch(copy.doc, this.log);
        await bridge.saveDocument(copy.doc, scratch);
      } finally {
        await bridge.closeDocument(copy.doc).catch(() => undefined);
      }
      await bridge.fileToJson(scratch, outJson);
    });
  }

  /** Reads the file again from disk. reason: "revert", or "edit" when the file was rebuilt beside the editor (AE2). */
  revert(bridge: BridgeClient, reason = "revert"): Promise<void> {
    return this.enqueue(async () => {
      if (this.info && this.openedOn === bridge) {
        await bridge.closeDocument(this.doc).catch(() => undefined);
      }
      this.info = undefined;
      this.openedOn = undefined;
      this.log = [];
      await this.ensureOpen(bridge);
      this.reloaded.fire(reason);
    });
  }

  dispose(): void {
    if (this.info && this.openedOn?.running) {
      void this.openedOn.closeDocument(this.info.doc).catch(() => undefined);
    }
    this.info = undefined;
    this.disposed.fire();
    this.changed.dispose();
    this.reloaded.dispose();
    this.disposed.dispose();
  }
}

interface Request {
  type: string;
  id?: number;
  /** sectorScripts: the sector view's selected node data entries. */
  entries?: number[];
  path?: string;
  paths?: string[];
  /** An animation by its place in the file, for animClip. */
  index?: number;
  /** animClip: the keys with the root motion on (REDbridge 0.13.0). */
  rootMotion?: boolean;
  /** animsSet: the opened animation's name. */
  clip?: string;
  /** animsSetPlace: the set's members to place, by their place in animsSet's list. */
  include?: number[];
  /** sectorLoad: the coarser sectors over the opened one too. */
  coarser?: boolean;
  /** sectorLayers: the layers to draw beside the opened sector (docs/design/sector-layers.md). */
  layers?: string[];
  /** light: the 3D views' light settings to keep for the window. */
  settings?: unknown;
  /** sideWidth: the side list's width in pixels, or none for the default. */
  width?: number;
  offset?: number;
  limit?: number;
  name?: string;
  query?: string;
  ops?: PatchOp[];
  label?: string;
  /** texture: the depot path of a texture the page wants to show. */
  depot?: string;
  /** ready: true from the Properties view, which gets no pending rows or nodes. */
  sidebar?: boolean;
  /** textureData: the PNG the page could not load through its resource URI. */
  png?: string;
  /** renderMaterials: the appearance shown and the material names it uses. */
  appearance?: string;
  materials?: string[];
  /** columns: the localization table's column widths in pixels, by column name. */
  widths?: Record<string, number>;
  /** sectorMeshInfo, sectorRender, sectorAction: a mesh the sector view draws, by game path. */
  mesh?: string;
  /** sectorAction: openInEdgemat, openMesh, addMesh, addMeshes or copy. */
  action?: string;
  /** sectorAction addMeshes: the selection's meshes (docs/design/sector-selection.md). */
  meshes?: string[];
  /** sectorAction copy: the text for the clipboard. */
  text?: string;
  /** animsEdit: a made clip's whole list of edit steps (docs/design/animation-editor.md, AE2). */
  steps?: import("../../../packages/anim-core/src/index").EditStep[];
  /** animsMake: what to make (docs/design/animation-tools.md, AT2); replace is the clip the view shows, by name. */
  make?: { action: "generate" | "glb"; prompt?: string; length?: number; model?: string; inPlace?: boolean; upperBodyOnly?: boolean; asWritten?: boolean; name?: string; replace?: string };
}

/** Making clips in the animation view: the extension's side (src/animMake.ts), set by extension.ts. */
export interface AnimMaker {
  /** Why making is not offered for a file on this rig, or undefined when it is. */
  why(rig: string): string | undefined;
  /** Makes the clip, reports each stage, and opens the result. */
  run(req: import("./animMake").MakeRequest, onStage: (stage: string, detail?: string) => void): Promise<import("./animMake").MakeResult>;
  /** The clip names of the project's made clip whose own set this file is, or undefined (then a replace makes it again). */
  madeClipOf(file: string): string | undefined;
  /** How that made clip was made, from its record's source (the words, model and length for Uthana; the file for a .glb). */
  madeFromOf(file: string): Record<string, unknown> | undefined;
  /** AE2: a made clip's edits, or undefined when this file is not a made clip's own set. */
  editInfo(file: string): import("./animCommands").EditInfo | undefined;
  /** AE2: the clip rebuilt from these steps; its tab opens again on the new set. */
  edit(file: string, steps: import("../../../packages/anim-core/src/index").EditStep[]): Promise<unknown>;
  /** AE2: the steps before the last edit, put back. */
  undo(file: string): Promise<unknown>;
}

/** Where the localization table's column widths are kept, for every file. */
const TableColumnsKey = "cr2w.tableColumns";
/** The 3D views' light (REDcode issue #31), kept per window: brightness and mode. */
export const LightKey = "redcode.light";
/** The width of the 3D views' side list (animations, submeshes), kept per window. */
export const SideWidthKey = "redcode.sideWidth";
/** Whether the animation view plays root motion, for every file. Off at first: clips play in place. */
const RootMotionKey = "cr2w.animsRootMotion";

/** An entity whose meshes an .anims plays on, instead of the base body: REDcodeApi.openAnimation's entity. */
export interface AnimationBody {
  /** A game path or a file on disk. */
  entity: string;
  /** Its appearance; the first when not given. */
  appearance?: string;
}

export class Cr2wEditorProvider implements vscode.CustomEditorProvider<Cr2wDocument> {
  private readonly changed = new vscode.EventEmitter<vscode.CustomDocumentEditEvent<Cr2wDocument>>();
  readonly onDidChangeCustomDocument = this.changed.event;
  /** The open pages per document (editor panels and the Properties view), so a save can ask them to commit any input still being edited. */
  private readonly pages = new Map<Cr2wDocument, Set<vscode.Webview>>();
  /** The last selected path per document, which a page attaching later (the Properties view) starts on. */
  private readonly selection = new Map<Cr2wDocument, string>();
  private readonly documents = new Map<string, Cr2wDocument>();
  private readonly flushes = new Map<number, () => void>();
  private nextFlush = 1;
  /** Table rows and nodes to show once the editor page of the document is ready, by URI. */
  private readonly pendingRows = new Map<string, number>();
  private readonly pendingNodes = new Map<string, string>();
  private readonly pendingAnimations = new Map<string, string>();
  /** The entity each .anims plays on, by URI, once REDcodeApi.openAnimation gave one: kept while REDcode runs. */
  private readonly animationBodies = new Map<string, AnimationBody>();
  /** The entities a synced set's members play on, by URI and then role (REDcodeApi.openAnimation's entities). */
  private readonly setBodies = new Map<string, Record<string, AnimationBody>>();
  /** A set to play once the editor page of the document is ready, by URI. */
  private readonly pendingSets = new Set<string>();
  /** A sector's node data entry to select once the editor page is ready, by URI (REDcodeApi.openSector). */
  private readonly pendingSectorEntries = new Map<string, number | number[]>();
  /** A sector script's line to show under the view once the editor page is ready, by URI (a run applied to a project's copy). */
  private readonly pendingScriptLines = new Map<string, { name: string; line: string }>();
  /** Sector scripts (docs/design/sector-scripts.md), made when the Scripts button is first used. */
  private scriptsUi: SectorScriptsUi | undefined;
  private get scripts(): SectorScriptsUi {
    return (this.scriptsUi ??= new SectorScriptsUi(this.context, this.log, (file, ops, label, entries, line) => this.applyToCopy(file, ops, label, entries, line)));
  }
  private readonly saved = new vscode.EventEmitter<Cr2wDocument>();
  /** Generate, Add and Replace Clip in the animation view, when extension.ts gives them. */
  animMaker?: AnimMaker;
  /** The Lip Sync editor (docs/design/lipsync.md): a lip sync set's animation view gets Open in Lip Sync. */
  lipSync?: LipSync;
  /** Fired after a document is saved, for views that read the file (the LocKeys view). */
  readonly onDidSave = this.saved.event;

  /**
   * Shows a row of a localization table: the open pages of the document go to it, or the first page
   * to open does. For the LocKeys view's Add to Project Onscreens.
   */
  showRow(uri: vscode.Uri, index: number): void {
    const document = this.documents.get(uri.toString());
    const pages = document ? [...(this.pages.get(document) ?? [])] : [];
    if (pages.length === 0) {
      this.pendingRows.set(uri.toString(), index);
      return;
    }
    for (const w of pages) void w.postMessage({ type: "showRow", index });
  }

  /**
   * Opens the tree at a node path (as in the JSON, such as graph.Data.nodes.12): the open pages of the
   * document go to it, or the editor page does when it opens. For REDcodeApi.openFile.
   */
  revealNode(uri: vscode.Uri, nodePath: string): void {
    const document = this.documents.get(uri.toString());
    const pages = document ? [...(this.pages.get(document) ?? [])] : [];
    if (pages.length === 0) {
      this.pendingNodes.set(uri.toString(), nodePath);
      return;
    }
    for (const w of pages) void w.postMessage({ type: "reveal", path: nodePath });
  }

  /**
   * Goes to an animation of an .anims file, by name, and plays it on an entity when body is given: the
   * open pages of the document do, or the editor page does when it opens. For REDcodeApi.openAnimation.
   */
  showAnimation(uri: vscode.Uri, name?: string, body?: AnimationBody, set?: { entities?: Record<string, AnimationBody> }): void {
    const key = uri.toString();
    const old = this.animationBodies.get(key);
    const rebody = !!body && (old?.entity !== body.entity || old?.appearance !== body.appearance);
    if (body) this.animationBodies.set(key, body);
    if (set?.entities) this.setBodies.set(key, Object.fromEntries(Object.entries(set.entities).map(([role, b]) => [role.toLowerCase(), b])));
    const document = this.documents.get(key);
    const pages = document ? [...(this.pages.get(document) ?? [])] : [];
    if (pages.length === 0) {
      if (name) this.pendingAnimations.set(key, name);
      if (set) this.pendingSets.add(key);
      return;
    }
    for (const w of pages) void w.postMessage({ type: "showAnimation", name, rebody, playSet: !!set });
  }

  /**
   * Opens a .streamingsector's 3D view at a node data entry: the open pages of the document go to it, or the
   * editor page does when it opens. For REDcodeApi.openSector.
   */
  showSectorEntry(uri: vscode.Uri, entry: number | number[]): void {
    const key = uri.toString();
    const document = this.documents.get(key);
    const pages = document ? [...(this.pages.get(document) ?? [])] : [];
    if (pages.length === 0) {
      this.pendingSectorEntries.set(key, entry);
      return;
    }
    for (const w of pages) void w.postMessage({ type: "showSectorEntry", entry });
  }

  /**
   * A sector script run on the game's copy, applied to the project's copy (docs/design/sector-scripts.md, the
   * owner, 2026-11-24): the copy opens in its editor (or comes to the front), its changed entries selected, and
   * the changes go in as one edit, unsaved, that one Undo takes back; the line under its view says so.
   */
  async applyToCopy(file: string, ops: PatchOp[], label: string, entries: number[], line: { name: string; line: string }): Promise<void> {
    const uri = vscode.Uri.file(file);
    const key = uri.toString();
    const wasOpen = this.documents.get(key);
    const ready = wasOpen && (this.pages.get(wasOpen)?.size ?? 0) > 0;
    if (!ready) this.pendingScriptLines.set(key, line);
    if (entries.length) this.showSectorEntry(uri, entries);
    await vscode.commands.executeCommand("vscode.openWith", uri, cr2wViewTypeFor(file));
    // The editor opens its document first, then its page: wait for both (a large sector takes a few seconds).
    let document: Cr2wDocument | undefined;
    for (let i = 0; i < 600; i++) {
      document = this.documents.get(key);
      if (document && (this.pages.get(document)?.size ?? 0) > 0) break;
      await new Promise((r) => setTimeout(r, 100));
    }
    if (!document) throw new Error(`${path.basename(file)} did not open`);
    await document.edit(this.requireBridge(), ops, label);
    for (const w of this.pages.get(document) ?? []) {
      void w.postMessage({ type: "changed", path: "" });
      if (ready) void w.postMessage({ type: "sectorScript", state: "applied", ...line });
    }
  }

  /** The open document for an editor tab's URI, for the Properties view. */
  documentFor(uri: vscode.Uri): Cr2wDocument | undefined {
    return this.documents.get(uri.toString());
  }

  get media(): vscode.Uri {
    return vscode.Uri.joinPath(this.context.extensionUri, "media", "cr2w");
  }

  /** What a page may load: the editor's media and the converted PNGs. */
  get resourceRoots(): vscode.Uri[] {
    return [this.media, vscode.Uri.joinPath(this.context.extensionUri, "media", "mesh"), this.textures.root];
  }

  /**
   * Asks every page of the document to commit the input that has focus and to let its in-flight
   * patches land, then returns. Ctrl+S with the cursor still in an input would otherwise commit the
   * edit as the save starts, and the file would be written without it.
   */
  private async flush(document: Cr2wDocument): Promise<void> {
    const pages = [...(this.pages.get(document) ?? [])];
    await Promise.all(
      pages.map(
        (webview) =>
          new Promise<void>((resolve) => {
            const id = this.nextFlush++;
            const timer = setTimeout(() => {
              this.flushes.delete(id);
              resolve();
            }, 1500);
            this.flushes.set(id, () => {
              clearTimeout(timer);
              resolve();
            });
            void webview.postMessage({ type: "flush", id });
          }),
      ),
    );
  }

  constructor(
    private readonly context: vscode.ExtensionContext,
    private readonly getBridge: () => BridgeClient | undefined,
    private readonly log: vscode.OutputChannel,
    /** Converts textures to PNG and knows where they go, for the atlas view. */
    private readonly textures: TextureViewer,
    private readonly openAsJson: (file: string) => void,
    private readonly openGameAsJson: (gamePath: string) => void,
  ) {}

  /**
   * The PNG for a texture an atlas refers to by depot path. The project's own copy under
   * source/archive wins when it exists, since that is the texture a mod ships; otherwise the game's.
   * A game document has no project, so it always gets the game's texture.
   */
  private async texturePng(bridge: BridgeClient, documentFile: string | undefined, depot: string): Promise<string> {
    const lower = (documentFile ?? "").toLowerCase();
    const marker = `${path.sep}${ProjectFolders.archive.toLowerCase()}${path.sep}`;
    const at = documentFile ? lower.indexOf(marker) : -1;
    if (documentFile && at >= 0) {
      const own = path.join(documentFile.slice(0, at), ProjectFolders.archive, ...depot.split("\\"));
      if (fs.existsSync(own)) {
        const png = this.textures.pngForFile(own);
        await bridge.fileToPng(own, png);
        this.log.appendLine(`cr2w editor: atlas texture from the project, ${own}`);
        return png;
      }
    }
    const png = this.textures.pngForGamePath(depot);
    await bridge.toPng(depot, png);
    return png;
  }

  register(): vscode.Disposable {
    const options = { webviewOptions: { retainContextWhenHidden: true }, supportsMultipleEditorsPerDocument: false };
    return vscode.Disposable.from(
      vscode.window.registerCustomEditorProvider(Cr2wViewType, this, options),
      vscode.window.registerCustomEditorProvider(Cr2wOptionViewType, this, options),
    );
  }

  private requireBridge(): BridgeClient {
    const bridge = this.getBridge();
    if (!bridge?.running) {
      throw new Error("The REDbridge process is not running. Run REDcode: Restart REDbridge, then reopen the file.");
    }
    return bridge;
  }

  async openCustomDocument(uri: vscode.Uri, openContext: vscode.CustomDocumentOpenContext): Promise<Cr2wDocument> {
    const document = new Cr2wDocument(uri, this.log);
    document.onDidChange((e) => this.changed.fire(e));
    this.documents.set(uri.toString(), document);
    document.onDidDispose(() => {
      if (this.documents.get(uri.toString()) === document) this.documents.delete(uri.toString());
      this.pages.delete(document);
      this.selection.delete(document);
    });
    if (openContext.backupId) {
      try {
        const backup = JSON.parse(fs.readFileSync(vscode.Uri.parse(openContext.backupId).fsPath, "utf8")) as Backup;
        document.log = backup.ops ?? [];
        this.log.appendLine(`cr2w editor: restoring ${document.log.length} unsaved operation(s) for ${path.basename(uri.fsPath)}`);
      } catch (e) {
        this.log.appendLine(`cr2w editor: could not read the backup for ${uri.fsPath}: ${e instanceof Error ? e.message : String(e)}`);
      }
    }
    const bridge = this.getBridge();
    if (bridge?.running) {
      await document.ensureOpen(bridge);
    }
    return document;
  }

  private readonly opened = new vscode.EventEmitter<Cr2wDocument>();
  /** Fired when an editor panel for the document resolves or becomes active, which the Properties view follows. */
  readonly onDidShowEditor = this.opened.event;

  async resolveCustomEditor(document: Cr2wDocument, panel: vscode.WebviewPanel): Promise<void> {
    panel.webview.options = { enableScripts: true, localResourceRoots: this.resourceRoots };
    panel.webview.html = this.html(panel.webview, false);
    const page = this.attachPage(document, panel.webview);
    const state = panel.onDidChangeViewState((e) => {
      if (e.webviewPanel.active) this.opened.fire(document);
    });
    panel.onDidDispose(() => {
      page.dispose();
      state.dispose();
    });
    this.opened.fire(document);
  }

  /**
   * Wires a page (an editor panel, or the Properties view) to a document: answers its requests,
   * forwards reloads, and tells the document's other pages when it edits or selects something.
   * Returns the detach.
   */
  attachPage(document: Cr2wDocument, webview: vscode.Webview): vscode.Disposable {
    const post = (message: unknown) => void webview.postMessage(message);
    const reply = (id: number | undefined, value: unknown) => post({ type: "reply", id, ok: true, value });
    const fail = (id: number | undefined, e: unknown) => {
      const message = e instanceof Error ? e.message : String(e);
      this.log.appendLine(`cr2w editor: ${message}`);
      // A request carries an id and gets a reply; a notification such as "ready" gets a page-level error.
      post(id === undefined ? { type: "error", error: message } : { type: "reply", id, ok: false, error: message });
    };
    const others = (message: unknown) => {
      for (const w of this.pages.get(document) ?? []) {
        if (w !== webview) void w.postMessage(message);
      }
    };

    if (!this.pages.has(document)) {
      this.pages.set(document, new Set());
    }
    this.pages.get(document)!.add(webview);

    const reload = document.onDidReload((reason) => post({ type: "reload", reason }));
    // The mesh as EDGEmat knows it: its game path, or the file on disk.
    const meshRef = () => document.gamePath ?? document.uri.fsPath;
    /** This page's exported .anims, read when its animations mode asks: the JSON can be large. */
    let anims: AnimsGlb | undefined;
    /** The same with root motion on, exported when the page first asks for it. */
    let animsMoving: AnimsGlb | undefined;
    const animsSource = () => (document.gamePath ? { gamePath: document.gamePath } : { file: document.uri.fsPath });
    /** The mesh's game path, which the game's appearance files name: a game file's own, or a project file's under source/archive. */
    const meshGamePath = () => document.gamePath ?? archiveGamePathOf(document.uri.fsPath);
    /** A synced set (animations A3): its members as last listed, and each file's export and sync tracks. */
    let setList: SetMember[] = [];
    let setSession = newSetSession();
    // The opened clip plays from the document's own file (a project's copy); the others from the game's.
    const setSource = (x: SetMember) => (x.self ? animsSource() : { gamePath: x.file });
    /** The sector view's loader (docs/design/sector-view.md), made when its 3D mode first loads. */
    let sectorLoader: SectorLoader | undefined;
    // What the loader draws: the opened sector, the coarser ones over it when asked, and the layers turned on.
    let coarserOn = false;
    let coarserList: string[] | null = null;
    let layersOn: string[] = [];
    let overlapsRun: { stopped: boolean } | null = null;
    /** A sector to load: the project's own copy when the opened sector is a project's and it has one. */
    const layerRef = (gamePath: string): SectorRef => {
      const root = document.gamePath ? null : archiveRootOf(document.uri.fsPath);
      return root && fs.existsSync(path.join(root, gamePath)) ? { path: gamePath, root } : { path: gamePath };
    };
    /** The opened sector as the drawing package reads it: a project's copy from the project's loose files. */
    const sectorRef = (sector: string): SectorRef => (document.gamePath ? { path: sector } : { path: sector, root: archiveRootOf(document.uri.fsPath) ?? undefined });
    /** The sector view's cache: one per game version, in a folder named by the stamp's hash. */
    const worldCacheDir = async () => {
      const stamp = (await gameCacheReady(this.requireBridge(), path.join(this.textures.root.fsPath, "mesh"))) ?? "nogame";
      return path.join(this.textures.root.fsPath, "mesh", "world", stampFolder(stamp));
    };
    let materialWatch: vscode.Disposable | undefined;
    const messages = webview.onDidReceiveMessage(async (m: Request) => {
      try {
        switch (m.type) {
          case "flushed": {
            const done = m.id === undefined ? undefined : this.flushes.get(m.id);
            if (done && m.id !== undefined) {
              this.flushes.delete(m.id);
              done();
            }
            return;
          }
          case "ready": {
            const info = await document.ensureOpen(this.requireBridge());
            post({ type: "document", info, file: document.name, game: document.gamePath !== undefined, dirty: document.log.length > 0, selected: this.selection.get(document) ?? "", columns: this.context.globalState.get(TableColumnsKey, {}) });
            // The Properties view also says ready, often first; what waits is for the editor page.
            if (m.sidebar) return;
            const key = document.uri.toString();
            const row = this.pendingRows.get(key);
            if (row !== undefined) {
              this.pendingRows.delete(key);
              post({ type: "showRow", index: row });
            }
            const node = this.pendingNodes.get(key);
            if (node !== undefined) {
              this.pendingNodes.delete(key);
              post({ type: "reveal", path: node });
            }
            const sectorEntry = this.pendingSectorEntries.get(key);
            if (sectorEntry !== undefined) {
              this.pendingSectorEntries.delete(key);
              post({ type: "showSectorEntry", entry: sectorEntry });
            }
            const scriptLine = this.pendingScriptLines.get(key);
            if (scriptLine !== undefined) {
              this.pendingScriptLines.delete(key);
              post({ type: "sectorScript", state: "applied", ...scriptLine });
            }
            const animation = this.pendingAnimations.get(key);
            if (animation !== undefined) {
              this.pendingAnimations.delete(key);
              const playSet = this.pendingSets.delete(key);
              post({ type: "showAnimation", name: animation, playSet });
            }
            return;
          }
          case "getNode": {
            // Below a value REDbridge cannot walk into (a worldInstancedMeshNode's buffers), read from that value.
            const bridge = this.requireBridge();
            const fetch = (p: string, o: number, l: number) => bridge.getNode(document.doc, p, o, l) as Promise<Cr2wNode>;
            return reply(m.id, await readNode(fetch, valueCacheOf(document), m.path ?? "", m.offset ?? 0, m.limit ?? 200));
          }
          case "getNodes":
            return reply(m.id, await this.requireBridge().getNodes(document.doc, m.paths ?? [], m.limit ?? 200));
          case "search":
            return reply(m.id, await this.requireBridge().searchDocument(document.doc, m.query ?? "", m.path ?? "", m.limit ?? 200));
          case "describeType":
            return reply(m.id, await this.requireBridge().describeType(m.name ?? ""));
          case "createInstance":
            return reply(m.id, await this.requireBridge().createInstance(m.name ?? ""));
          case "patch": {
            const result = await document.edit(this.requireBridge(), m.ops ?? [], m.label ?? "Edit");
            reply(m.id, result);
            others({ type: "changed", path: m.ops?.[0]?.path ?? "" });
            return;
          }
          case "selected":
            this.selection.set(document, m.path ?? "");
            others({ type: "select", path: m.path ?? "" });
            return;
          case "texture": {
            const png = await this.texturePng(this.requireBridge(), document.gamePath ? undefined : document.uri.fsPath, m.depot ?? "");
            return reply(m.id, { png, src: webview.asWebviewUri(vscode.Uri.file(png)).toString() });
          }
          case "meshPayload": {
            // The open mesh, exported to a cached .glb (the saved file: unsaved edits show after a save).
            const cache = path.join(this.textures.root.fsPath, "mesh");
            const r = await meshGlbFor(this.requireBridge(), cache, document.gamePath ? { gamePath: document.gamePath } : { file: document.uri.fsPath });
            if (!r.cached) this.log.appendLine(`cr2w editor: exported ${document.name} to ${r.glb} for the 3D view`);
            const appearances = await this.meshAppearances(document).catch(() => []);
            // EDGEmat renders materials when it is installed (REDcode issue #6).
            const edgemat = await findEdgemat();
            if (edgemat && !materialWatch) {
              materialWatch = edgemat.onDidChangeMaterials((e) => {
                if (!e.mesh || e.mesh.toLowerCase() === meshRef().toLowerCase()) post({ type: "materialsChanged", materials: e.materials });
              });
            }
            return reply(m.id, { ...meshPayload(r.glb), path: r.glb, cached: r.cached, dirty: document.log.length > 0, appearances, materialProvider: !!edgemat, findItems: !!meshGamePath(), light: this.context.workspaceState.get(LightKey), sideWidth: this.context.workspaceState.get(SideWidthKey) });
          }
          case "animsPayload": {
            // The open .anims, exported to a cached .glb (the saved file: unsaved edits show after a save).
            // The page gets the skeleton and the list; each animation's keys come by animClip when picked.
            const cache = path.join(this.textures.root.fsPath, "mesh");
            const r = await animsGlbFor(this.requireBridge(), cache, animsSource());
            anims = readAnimsGlb(r.glb);
            animsMoving = undefined;
            // A saved edit changes the opened clip's own export: the set reads it again.
            setSession = newSetSession();
            const rig = await this.animsRig(document).catch(() => "");
            const animations = animsList(anims);
            // Frames and length as the file says. The export's last key is not the length: a still channel
            // has one key, at any time (a 0.4 s idle pose exported its keys at 0 and 0.017 s).
            const timing = await this.animsTiming(document).catch(() => new Map<string, { frames?: number; duration?: number }>());
            for (const a of animations) {
              const t = timing.get(a.name);
              a.frames = t?.frames ?? a.frames;
              if (t?.duration && t.duration > 0) a.duration = t.duration;
            }
            const { body, bodyNote } = await this.animsBody(document, rig);
            // Making clips (AT2): offered on the rigs anim-core knows, with a project open.
            const makeWhy = this.animMaker ? this.animMaker.why(rig) : "Making clips is not available";
            const madeClip = document.gamePath ? undefined : this.animMaker?.madeClipOf(document.uri.fsPath);
            return reply(m.id, {
              make: { why: makeWhy, game: document.gamePath !== undefined, made: madeClip, from: madeClip ? this.animMaker?.madeFromOf(document.uri.fsPath) : undefined },
              lipSync: !!this.lipSync?.isSet(this.lipSyncSetOf(document) ?? ""),
              skeleton: animsSkeleton(anims).toString("base64"),
              animations,
              rig,
              path: r.glb,
              cached: r.cached,
              dirty: document.log.length > 0,
              rootMotion: this.context.globalState.get(RootMotionKey, false),
              light: this.context.workspaceState.get(LightKey),
              sideWidth: this.context.workspaceState.get(SideWidthKey),
              ...(body ? { body: { data: fs.readFileSync(body.glb).toString("base64"), label: body.label, notes: body.notes } } : {}),
              ...(bodyNote ? { bodyNote } : {}),
            });
          }
          case "animClip": {
            if (!anims) throw new Error("The animations are not loaded");
            const moving = !!m.rootMotion;
            if (moving !== this.context.globalState.get(RootMotionKey, false)) await this.context.globalState.update(RootMotionKey, moving);
            if (moving && !animsMoving) {
              const cache = path.join(this.textures.root.fsPath, "mesh");
              const r = await animsGlbFor(this.requireBridge(), cache, animsSource(), true);
              if (!r.cached) this.log.appendLine(`cr2w editor: exported ${document.name} with root motion to ${r.glb}`);
              animsMoving = readAnimsGlb(r.glb);
            }
            return reply(m.id, animsClip(moving ? animsMoving! : anims, m.index ?? -1).toString("base64"));
          }
          case "animsLipSync": {
            // Open in Lip Sync, on a lip sync set: the tab at this set's character and scene, on the shown clip's line.
            const set = this.lipSyncSetOf(document);
            if (!set || !this.lipSync) return reply(m.id, null);
            if (!(await this.lipSync.openSet(set, typeof m.clip === "string" ? m.clip : undefined))) void vscode.window.showInformationMessage("The game's lip sync map does not list this set, so the Lip Sync editor cannot show whose it is.");
            return reply(m.id, null);
          }
          case "animsMake": {
            // Generate with Uthana, or a clip from a .glb, as a new clip or in place of the clip shown (AT2).
            if (!this.animMaker) throw new Error("Making clips is not available");
            const want = m.make;
            if (!want) throw new Error("Nothing to make");
            const rig = await this.animsRig(document);
            const madeClip = document.gamePath ? undefined : this.animMaker.madeClipOf(document.uri.fsPath);
            const set = meshGamePath();
            // Replacing a made clip in its own set is making it again under its name; a game clip is replaced in a copy of its set.
            const replace = want.replace && !madeClip ? (set ? { set, clip: want.replace } : undefined) : undefined;
            if (want.replace && !madeClip && !replace) throw new Error("This file is not under a project's Archive folder or in the game, so its clips cannot be replaced");
            const result = await this.animMaker.run(
              {
                action: want.action,
                rig,
                prompt: want.prompt,
                length: want.length,
                model: want.model as import("./animMake").MakeRequest["model"],
                inPlace: want.inPlace,
                upperBodyOnly: want.upperBodyOnly,
                asWritten: want.asWritten,
                name: want.replace && madeClip ? madeClip : want.name,
                replace,
              },
              (stage, detail) => post({ type: "animsMakeStage", stage, detail }),
            );
            return reply(m.id, result);
          }
          case "animsEditInfo":
            // The Edit panel (AE2): only a project's made clip, in its own set.
            if (!this.animMaker || document.gamePath) return reply(m.id, null);
            return reply(m.id, this.animMaker.editInfo(document.uri.fsPath) ?? null);
          case "animsEdit":
          case "animsEditUndo": {
            if (!this.animMaker) throw new Error("Editing clips is not available");
            if (document.log.length > 0) throw new Error("This file has unsaved changes: save or revert them first");
            const r = m.type === "animsEdit" ? await this.animMaker.edit(document.uri.fsPath, m.steps ?? []) : await this.animMaker.undo(document.uri.fsPath);
            reply(m.id, r);
            // The set on disk is new: the document reads it again and the view rebuilds in place, keeping its camera
            // (the owner's AE2 run: closing and opening the tab was jarring).
            await document.revert(this.requireBridge(), "edit");
            return;
          }
          case "light":
            await this.context.workspaceState.update(LightKey, m.settings);
            return;
          case "sideWidth":
            await this.context.workspaceState.update(SideWidthKey, typeof m.width === "number" ? m.width : undefined);
            return;
          case "sectorPayload": {
            // A new 3D view (the first, or after a save or revert): a new loader, so the saved file is read again.
            if (sectorLoader) this.log.appendLine(`sector view: a new view of ${document.name}; the previous loader stops`);
            sectorLoader?.dispose();
            sectorLoader = undefined;
            // A new view starts with no layers on, as the page does.
            layersOn = [];
            if (overlapsRun) overlapsRun.stopped = true;
            const sector = meshGamePath();
            if (!sector) throw new Error("A sector is read by its game path: open the game's file, or a copy under the project's Archive folder");
            return reply(m.id, { sector, dirty: document.log.length > 0, light: this.context.workspaceState.get(LightKey) });
          }
          case "sectorLoad": {
            // The opened sector, from the project's loose files when it is a project's copy; the coarser
            // sectors over it from the game. Meshes, markers and progress go to the page as they come.
            const bridge = this.requireBridge();
            const sector = meshGamePath();
            if (!sector) throw new Error("No game path for this sector");
            const worldCache = await worldCacheDir();
            // What the loader sends, counted for the log: a sector that shows markers and no meshes says where it stopped.
            let sent = 0;
            let firstProgress = true;
            if (!sectorLoader) {
              sectorLoader = createSectorLoader(bridge, {
                cacheDir: worldCache,
                onMesh: (b) => {
                  sent++;
                  post({ type: "sectorMesh", mesh: b.mesh, data: fs.readFileSync(b.glb).toString("base64"), placements: b.placements });
                },
                onMarkers: (s, markers) => {
                  this.log.appendLine(`sector view: ${markers.length} markers in ${path.basename(s)}`);
                  post({ type: "sectorMarkers", sector: s, markers });
                },
                onUnload: (s) => post({ type: "sectorUnload", sector: s }),
                onProgress: (p) => {
                  if (firstProgress || p.done === p.total) this.log.appendLine(`sector view: ${p.done} of ${p.total} meshes${p.current ? `, exporting ${p.current}` : ""}`);
                  firstProgress = false;
                  post({ type: "sectorProgress", ...p });
                },
              });
            }
            this.log.appendLine(`sector view: loading ${sector}${m.coarser ? " with the coarser sectors" : ""}${layersOn.length ? ` and ${layersOn.length} layer(s)` : ""} (cache ${worldCache})`);
            coarserOn = !!m.coarser;
            const own = sectorRef(sector);
            const sectors: (SectorRef | string)[] = [own];
            if (coarserOn) {
              coarserList ??= await sectorsOver(bridge, sector).catch(() => [sector]);
              sectors.push(...coarserList.filter((x) => x.toLowerCase() !== sector.toLowerCase()));
            }
            for (const l of layersOn) if (!sectors.some((x) => (typeof x === "string" ? x : x.path).toLowerCase() === l.toLowerCase())) sectors.push(layerRef(l));
            // Answers at once; the meshes follow as messages, and sectorDone at the end.
            const t0 = Date.now();
            void sectorLoader.set(sectors).then(
              (r) => {
                this.log.appendLine(`sector view: done in ${Date.now() - t0} ms: ${sent} mesh(es) sent, ${r.skipped.length} skipped${r.skipped.length ? `, first: ${r.skipped[0].id}: ${r.skipped[0].why}` : ""}`);
                post({ type: "sectorDone", skipped: r.skipped, sectors: sectors.map((x) => (typeof x === "string" ? x : x.path)) });
              },
              (e) => {
                this.log.appendLine(`sector view: failed: ${e instanceof Error ? e.stack ?? e.message : String(e)}`);
                post({ type: "sectorDone", skipped: [{ id: sector, why: e instanceof Error ? e.message : String(e) }], sectors: [] });
              },
            );
            return reply(m.id, null);
          }
          case "sectorOverlaps": {
            // The sectors whose things reach into this one, found nearest first and sent as they are found.
            const bridge = this.requireBridge();
            const sector = meshGamePath();
            if (!sector) throw new Error("No game path for this sector");
            if (overlapsRun) overlapsRun.stopped = true;
            const run = { stopped: false };
            overlapsRun = run;
            const cacheDir = path.join(await worldCacheDir(), "overlaps");
            let lastPost = 0;
            const t0 = Date.now();
            void findOverlaps(bridge, sectorRef(sector), {
              cacheDir,
              stopped: () => run.stopped,
              onLayer: (layer) => {
                const own = layerRef(layer.path);
                post({ type: "sectorOverlapLayer", layer: { ...layer, project: !!own.root } });
              },
              onProgress: (done, total) => {
                const now = Date.now();
                if (now - lastPost < 200 && done < total) return;
                lastPost = now;
                post({ type: "sectorOverlapProgress", done, total });
              },
            }).then(
              (found) => {
                if (run.stopped) return;
                this.log.appendLine(`sector view: ${found.length} sector(s) reach into ${path.basename(sector)}, found in ${Date.now() - t0} ms`);
                post({ type: "sectorOverlapDone", count: found.length });
              },
              (e) => {
                this.log.appendLine(`sector view: overlaps failed: ${e instanceof Error ? e.stack ?? e.message : String(e)}`);
                post({ type: "sectorOverlapDone", count: 0, error: e instanceof Error ? e.message : String(e) });
              },
            );
            return reply(m.id, null);
          }
          case "sectorLayers": {
            // The layers turned on changed: the loader loads the new ones and unloads the rest.
            layersOn = (m.layers ?? []).filter((x) => /\.streamingsector$/i.test(x));
            const sector = meshGamePath();
            if (!sector || !sectorLoader) return reply(m.id, null);
            const bridge = this.requireBridge();
            const sectors: (SectorRef | string)[] = [sectorRef(sector)];
            if (coarserOn) {
              coarserList ??= await sectorsOver(bridge, sector).catch(() => [sector]);
              sectors.push(...coarserList.filter((x) => x.toLowerCase() !== sector.toLowerCase()));
            }
            for (const l of layersOn) sectors.push(layerRef(l));
            this.log.appendLine(`sector view: ${layersOn.length} layer(s) on`);
            void sectorLoader.set(sectors).then(
              (r) => post({ type: "sectorDone", skipped: r.skipped, sectors: sectors.map((x) => (typeof x === "string" ? x : x.path)) }),
              (e) => post({ type: "sectorDone", skipped: [{ id: sector, why: e instanceof Error ? e.message : String(e) }], sectors: [] }),
            );
            return reply(m.id, null);
          }
          case "sectorOpen": {
            // A layer's sector in its own tab: the project's copy when it has one.
            if (!m.path || !/\.streamingsector$/i.test(m.path)) throw new Error("No sector to open");
            const own = layerRef(m.path);
            const uri = own.root ? vscode.Uri.file(path.join(own.root, m.path)) : gameUri(m.path);
            await vscode.commands.executeCommand("vscode.openWith", uri, cr2wViewTypeFor(m.path));
            return reply(m.id, null);
          }
          case "sectorMeshInfo": {
            // A drawn mesh's appearances and the material each names per submesh: for By material and the picked panel.
            const sector = meshGamePath();
            if (!sector || !m.mesh) throw new Error("No mesh");
            return reply(m.id, await meshMaterials(this.requireBridge(), await worldCacheDir(), m.mesh, sectorRef(sector)));
          }
          case "sectorRender": {
            // The picked thing with its materials: its plain export (the same parts and UVs) with rendered maps on
            // it, from EDGEmat when it is installed (it sees setups being edited), else from the edgemat-core
            // REDcode bundles. WolvenKit's export "with materials" puts no textures in the .glb, so it is only
            // the fallback for a mesh not in the cache.
            const sector = meshGamePath();
            if (!sector || !m.mesh) throw new Error("No mesh");
            const bridge = this.requireBridge();
            const cache = await worldCacheDir();
            const from = sectorRef(sector);
            const glb = cachedGlb(cache, m.mesh, from) ?? (await texturedGlb(bridge, m.mesh, cache, from));
            const look = appearanceOf(await meshMaterials(bridge, cache, m.mesh, from).catch(() => []), m.appearance);
            const names = [...new Set(look?.chunkMaterials ?? [])].filter((x) => x);
            // A project's own copy is rendered from its file.
            const loose = from.root ? path.join(from.root, ...m.mesh.split(/[\\/]/)) : undefined;
            const req = { mesh: loose && fs.existsSync(loose) ? loose : m.mesh, ...(look ? { appearance: look.name } : {}), ...(names.length ? { materials: names } : {}) };
            const edgemat = await findEdgemat();
            let maps: Record<string, Record<string, string | undefined>> | undefined;
            let mapsError: string | undefined;
            try {
              let r: Record<string, RenderedMaterial>;
              if (edgemat) {
                if (!materialWatch) materialWatch = edgemat.onDidChangeMaterials((e) => post({ type: "materialsChanged", mesh: e.mesh, materials: e.materials }));
                r = await edgemat.renderMaterials(req);
              } else {
                r = await renderMaterials(bridgeOver((method, params) => bridge.request(method, params)), undefined, path.join(this.textures.root.fsPath, "edgemat"), req, (line) => this.log.appendLine(`sector view: render: ${line}`));
              }
              maps = Object.fromEntries(Object.entries(r).map(([name, x]) => [name, mapsForWebview(x)]));
            } catch (e) {
              mapsError = e instanceof Error ? e.message : String(e);
              this.log.appendLine(`sector view: could not render the materials of ${m.mesh}: ${mapsError}`);
            }
            return reply(m.id, { data: fs.readFileSync(glb).toString("base64"), appearance: look?.name, chunkMaterials: look?.chunkMaterials ?? [], edgemat: !!edgemat, ...(maps ? { maps } : {}), ...(mapsError ? { mapsError } : {}) });
          }
          case "sectorScripts": {
            // The Scripts button: the menu answers at once; a run tells the page how it goes (sectorScript).
            const sector = meshGamePath();
            if (!sector) throw new Error("A sector script needs the sector's game path: open the game's file, or a copy under the project's Archive folder");
            const host: ScriptHost = {
              document,
              bridge: this.requireBridge(),
              sector,
              post,
              changed: () => {
                for (const w of this.pages.get(document) ?? []) void w.postMessage({ type: "changed", path: "" });
              },
            };
            reply(m.id, null);
            void this.scripts.menu(host, m.entries ?? []).catch((e) => {
              this.log.appendLine(`script: ${e instanceof Error ? (e.stack ?? e.message) : String(e)}`);
              void vscode.window.showErrorMessage(`Sector scripts: ${e instanceof Error ? e.message : String(e)}`);
            });
            return;
          }
          case "sectorScriptStop":
            this.scripts.stop(document);
            return reply(m.id, null);
          case "sectorAction": {
            // The selected list's own actions (docs/design/sector-selection.md), for many things at once.
            if (m.action === "copy") {
              await vscode.env.clipboard.writeText(m.text ?? "");
              void vscode.window.setStatusBarMessage("REDcode: the selection is copied.", 3000);
              return reply(m.id, null);
            }
            if (m.action === "addMeshes") {
              const meshes = [...new Map((m.meshes ?? []).map((x) => [x.toLowerCase(), x])).values()];
              if (!meshes.length) return reply(m.id, null);
              const pick = await vscode.window.showInformationMessage(
                meshes.length === 1
                  ? `Add ${meshes[0].split("\\").pop()} to the project? A change to it then shows everywhere the game uses this mesh, not only here.`
                  : `Add ${meshes.length} meshes to the project? A change to one then shows everywhere the game uses it, not only here.`,
                "Add Them",
              );
              if (pick) await vscode.commands.executeCommand("redcode.addToProject", { kind: "file", file: { name: meshes[0] } }, { files: meshes.map((name) => ({ name })) });
              return reply(m.id, null);
            }
            const sector = meshGamePath();
            if (!sector || !m.mesh) throw new Error("No mesh");
            const mesh = m.mesh;
            const root = sectorRef(sector).root;
            const loose = root ? path.join(root, ...mesh.split(/[\\/]/)) : undefined;
            const inProject = !!loose && fs.existsSync(loose);
            switch (m.action) {
              case "openInEdgemat":
                await openInEdgemat({ mesh: inProject ? loose! : mesh, ...(m.appearance ? { appearance: m.appearance } : {}) }, this.log);
                break;
              case "openMesh":
                if (inProject) await vscode.commands.executeCommand("vscode.openWith", vscode.Uri.file(loose!), cr2wViewTypeFor(mesh));
                else await this.openGameFile(mesh);
                break;
              case "addMesh": {
                // Already there: Add to Project's own question (open the project's copy, or replace it) is the one to ask.
                if (inProject) {
                  await vscode.commands.executeCommand("redcode.addToProject", { kind: "file", file: { name: mesh } });
                  break;
                }
                const pick = await vscode.window.showInformationMessage(
                  `Add ${mesh.split("\\").pop()} to the project? A change to it then shows everywhere the game uses this mesh, not only here.`,
                  "Add It",
                );
                if (pick) await vscode.commands.executeCommand("redcode.addToProject", { kind: "file", file: { name: mesh } });
                break;
              }
              default:
                throw new Error(`No sector action ${m.action}`);
            }
            return reply(m.id, null);
          }
          case "animsSet": {
            // The opened clip's synced set: its members across the .anims files of its game folder.
            const gamePath = meshGamePath();
            if (!gamePath) return reply(m.id, { members: [], why: "A set is found by the file's game folder: open the game's file, or a copy under the project's Archive folder" });
            setList = await listSet(this.requireBridge(), gamePath, m.clip ?? "");
            return reply(m.id, { members: setList.map((x) => ({ role: x.role, file: x.file, name: x.file.split("\\").pop(), clip: x.clip, rig: x.rig, duration: x.duration, alternatives: x.alternatives, active: x.active, self: x.self, buffer: x.buffer })) });
          }
          case "animsSetPlace": {
            const cache = path.join(this.textures.root.fsPath, "mesh");
            const placed = await placeSet(this.requireBridge(), cache, setSession, setList, m.include ?? [], setSource);
            const describe = (from: string) => {
              if (!from) return "";
              const [id, ...rest] = from.split(".");
              const who = setList[Number(id)]?.role ?? id;
              const what = rest.join(".");
              return what.endsWith(", reversed") ? `${who}'s ${what.replace(", reversed", "")}, the other way` : `${who}'s ${what}`;
            };
            return reply(m.id, placed.map((x) => ({ index: x.index, matrix: x.placement ? toMatrix(x.placement.placement) : null, from: describe(x.placement?.from ?? ""), spread: x.placement?.spread ?? null, ambiguous: !!x.placement?.ambiguous, problem: x.problem ?? null })));
          }
          case "animsMember": {
            const member = setList[m.index ?? -1];
            if (!member) throw new Error("No such member of the set");
            const cache = path.join(this.textures.root.fsPath, "mesh");
            const glb = await memberGlb(this.requireBridge(), cache, setSession, member, setSource);
            const index = (glb.json.animations ?? []).findIndex((a) => a.name === member.clip);
            if (index < 0) throw new Error(`${member.file} has no ${member.clip}`);
            const { body, bodyNote } = await this.bodyFor(this.setBodies.get(document.uri.toString())?.[member.role.toLowerCase()], member.rig);
            return reply(m.id, {
              skeleton: animsSkeleton(glb).toString("base64"),
              clip: animsClip(glb, index).toString("base64"),
              ...(body ? { body: { data: fs.readFileSync(body.glb).toString("base64"), label: body.label, notes: body.notes } } : {}),
              ...(bodyNote ? { bodyNote } : {}),
            });
          }
          case "findItems":
            await this.findItems(meshGamePath() ?? "", m.appearance);
            return reply(m.id, null);
          case "openInEdgemat":
            await openInEdgemat({ mesh: meshRef(), ...(m.appearance ? { appearance: m.appearance } : {}) }, this.log);
            return reply(m.id, null);
          case "renderMaterials": {
            const edgemat = await findEdgemat();
            if (!edgemat) throw new Error("EDGEmat is not installed or not running");
            const maps = await edgemat.renderMaterials({ mesh: meshRef(), appearance: m.appearance, materials: m.materials });
            return reply(m.id, Object.fromEntries(Object.entries(maps).map(([name, r]) => [name, mapsForWebview(r)])));
          }
          case "documentTexture": {
            // The open file itself, for the texture view: the game's copy, or the file on disk.
            const bridge = this.requireBridge();
            let png: string;
            if (document.gamePath) {
              png = this.textures.pngForGamePath(document.gamePath);
              await bridge.toPng(document.gamePath, png);
            } else {
              png = this.textures.pngForFile(document.uri.fsPath);
              await bridge.fileToPng(document.uri.fsPath, png);
            }
            return reply(m.id, { png, src: webview.asWebviewUri(vscode.Uri.file(png)).toString() });
          }
          case "textureData": {
            // The resource URI was refused (it has been, with a 401, on one machine): send the bytes inline.
            const png = path.resolve(m.png ?? "");
            if (!png.toLowerCase().startsWith(this.textures.root.fsPath.toLowerCase())) {
              throw new Error("Only PNGs the extension converted can be sent inline.");
            }
            this.log.appendLine(`cr2w editor: the page could not load ${png}; sending it inline`);
            return reply(m.id, `data:image/png;base64,${fs.readFileSync(png).toString("base64")}`);
          }
          case "locText": {
            // The text behind a LocKey value, in the LocKeys language; the project's own entry wins.
            const key = m.query ?? "";
            const language = vscode.workspace.getConfiguration("redcode").get<string>("loc.language", "en-us") || "en-us";
            const entry = (await this.requireBridge().locGet([key], language, document.gamePath ? undefined : projectDirOf(document.uri.fsPath)))[key];
            return reply(m.id, entry ? entry.female || entry.male : null);
          }
          case "addToProject":
            // The header's Add to Project on a game file: the same as the + in Game Assets and Search game files.
            if (!document.gamePath) return reply(m.id, null);
            await vscode.commands.executeCommand("redcode.addToProject", { kind: "file", file: { name: document.gamePath } });
            return reply(m.id, null);
          case "openAsJson":
            if (document.gamePath) this.openGameAsJson(document.gamePath);
            else this.openAsJson(document.uri.fsPath);
            return;
          case "reveal":
            if (!document.gamePath) await vscode.commands.executeCommand("revealFileInOS", document.uri);
            return;
          case "log":
            this.log.appendLine(`cr2w page: ${m.label ?? ""}`);
            return;
          case "columns": {
            // The page sends its whole map; keep the finite, positive widths.
            const widths = Object.fromEntries(Object.entries(m.widths ?? {}).filter(([, w]) => typeof w === "number" && Number.isFinite(w) && w > 0));
            await this.context.globalState.update(TableColumnsKey, widths);
            return;
          }
        }
      } catch (e) {
        fail(m.id, e);
      }
    });
    return new vscode.Disposable(() => {
      reload.dispose();
      messages.dispose();
      materialWatch?.dispose();
      sectorLoader?.dispose();
      if (overlapsRun) overlapsRun.stopped = true;
      this.pages.get(document)?.delete(webview);
      // The last page of the document is gone: a script running on it stops.
      if (!this.pages.get(document)?.size) this.scriptsUi?.stop(document);
    });
  }

  /**
   * Find Items in the mesh viewer: the item records whose look shows the mesh, in a list with the
   * appearance shown first. Picking one opens its record page; its buttons copy the record name or
   * open the .app. Without items, the .app looks that show the mesh can be opened instead.
   */
  private async findItems(gamePath: string, appearance: string | undefined): Promise<void> {
    if (!gamePath) return;
    const language = vscode.workspace.getConfiguration("redcode").get<string>("loc.language", "en-us") || "en-us";
    let found;
    try {
      found = await vscode.window.withProgress(
        { location: vscode.ProgressLocation.Notification, title: "Finding the items that use this mesh (the first time loads TweakDB)…" },
        () => this.requireBridge().meshItems(gamePath, undefined, language),
      );
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      if (/method not found|mesh\.items/i.test(message) || (e as { code?: number }).code === -32601) {
        void vscode.window.showWarningMessage("Find Items needs a newer REDbridge (0.11.0 or later). Run REDcode: Update REDbridge.");
      } else {
        void vscode.window.showErrorMessage(`Find Items: ${message}`);
      }
      return;
    }
    this.log.appendLine(`cr2w editor: mesh.items ${gamePath}: ${found.items.length} items, ${found.looks.length} looks`);
    const name = gamePath.split("\\").pop() ?? gamePath;
    if (found.items.length === 0) {
      if (found.looks.length === 0) {
        void vscode.window.showInformationMessage(`No item record shows ${name}. Find Items covers items that pick their look by appearanceName, such as clothing; weapons and NPC appearances are not found.`);
        return;
      }
      const look = await vscode.window.showQuickPick(
        found.looks.map((l) => ({ label: l.look, description: l.meshAppearance, detail: l.app, app: l.app })),
        { title: `No item record shows ${name}; ${found.looks.length} appearance file looks do`, placeHolder: "Open an appearance file", matchOnDetail: true },
      );
      if (look) await this.openGameFile(look.app);
      return;
    }

    // One entry per record and mesh appearance: a record often has a look per body and camera.
    type Entry = vscode.QuickPickItem & { item?: MeshItem };
    const groups = new Map<string, MeshItem[]>();
    for (const i of found.items) {
      const key = `${i.record}|${i.meshAppearance}`;
      groups.set(key, [...(groups.get(key) ?? []), i]);
    }
    const copy: vscode.QuickInputButton = { iconPath: new vscode.ThemeIcon("copy"), tooltip: "Copy the record name" };
    const openApp: vscode.QuickInputButton = { iconPath: new vscode.ThemeIcon("go-to-file"), tooltip: "Open the appearance file" };
    const entryOf = (list: MeshItem[]): Entry => {
      const i = list[0];
      return {
        label: i.record,
        description: i.displayName?.text ?? undefined,
        detail: `${i.meshAppearance}  ·  ${i.app.split("\\").pop()} ${[...new Set(list.map((x) => x.look))].join(", ")}  ·  ${i.appearanceName}`,
        buttons: [copy, openApp],
        item: i,
      };
    };
    const shown = [...groups.values()].filter((l) => appearance && l[0].meshAppearance.toLowerCase() === appearance.toLowerCase());
    const others = [...groups.values()].filter((l) => !shown.includes(l));
    const entries: Entry[] = [];
    if (shown.length > 0) entries.push({ label: `Shows ${appearance}`, kind: vscode.QuickPickItemKind.Separator }, ...shown.map(entryOf));
    if (others.length > 0) entries.push({ label: shown.length > 0 ? "Other appearances of this mesh" : "Items", kind: vscode.QuickPickItemKind.Separator }, ...others.map(entryOf));

    const pick = vscode.window.createQuickPick<Entry>();
    pick.title = `Items that show ${name}`;
    pick.placeholder = `${groups.size} items; pick one to open its record`;
    pick.matchOnDescription = true;
    pick.matchOnDetail = true;
    pick.items = entries;
    pick.onDidTriggerItemButton(async (e) => {
      if (!e.item.item) return;
      if (e.button === copy) {
        await vscode.env.clipboard.writeText(e.item.item.record);
        void vscode.window.setStatusBarMessage(`Copied ${e.item.item.record}`, 3000);
      } else {
        pick.hide();
        await this.openGameFile(e.item.item.app);
      }
    });
    pick.onDidAccept(() => {
      const record = pick.selectedItems[0]?.item?.record;
      pick.hide();
      if (record) void vscode.commands.executeCommand("redcode.openTweakRecord", record);
    });
    pick.onDidHide(() => pick.dispose());
    pick.show();
  }

  private async openGameFile(gamePath: string): Promise<void> {
    await vscode.commands.executeCommand("vscode.openWith", gameUri(gamePath), cr2wViewTypeFor(gamePath));
  }

  /**
   * What an .anims plays on (docs/design/animation.md, A2): the entity REDcodeApi.openAnimation gave, or
   * the base body of a man's or woman's base rig, or nothing (the bones alone). bodyNote says why not.
   */
  private animsBody(document: Cr2wDocument, rig: string): Promise<{ body?: BodyGlb; bodyNote?: string }> {
    return this.bodyFor(this.animationBodies.get(document.uri.toString()), rig);
  }

  /** The body for a rig: the entity asked for, else the base body of a man's or woman's base rig, else none. */
  private async bodyFor(wanted: AnimationBody | undefined, rig: string): Promise<{ body?: BodyGlb; bodyNote?: string }> {
    const cache = path.join(this.textures.root.fsPath, "mesh");
    const bridge = this.requireBridge();
    let note: string | undefined;
    if (wanted) {
      const e = wanted.entity;
      const source = path.isAbsolute(e) ? { file: e } : { gamePath: e.split("/").join(path.win32.sep) };
      try {
        const body = await entityBodyGlb(bridge, cache, source, wanted.appearance);
        if (!body.cached) this.log.appendLine(`cr2w editor: exported ${body.label} to ${body.glb} for the animation view`);
        return { body };
      } catch (err) {
        note = `Could not put ${path.basename(e)} on the rig: ${err instanceof Error ? err.message : String(err)}`;
        this.log.appendLine(`cr2w editor: ${note}`);
      }
    }
    const base = baseBodyFor(rig);
    if (!base) return note ? { bodyNote: note } : {};
    try {
      const body = await baseBodyGlb(bridge, cache, base);
      if (!body.cached) this.log.appendLine(`cr2w editor: exported ${body.label} to ${body.glb} for the animation view`);
      return { body, ...(note ? { bodyNote: note } : {}) };
    } catch (err) {
      const why = `Could not put the ${base.label.toLowerCase()} on the rig: ${err instanceof Error ? err.message : String(err)}`;
      this.log.appendLine(`cr2w editor: ${why}`);
      return { bodyNote: note ? `${note}; ${why}` : why };
    }
  }

  /** The game path of the rig an .anims names, read from the document. */
  private async animsRig(document: Cr2wDocument): Promise<string> {
    const bridge = this.requireBridge();
    await document.ensureOpen(bridge);
    const node = await bridge.getNode(document.doc, "rig", 0, 1);
    const rig = (node.value as { DepotPath?: { $value?: unknown } } | undefined)?.DepotPath?.$value;
    return typeof rig === "string" ? rig : "";
  }

  /** The game path of a document that may be a lip sync set: the game file's, or a project copy's place under
   *  the project's archive folder. */
  private lipSyncSetOf(document: Cr2wDocument): string | undefined {
    return document.gamePath ?? archiveGamePathOf(document.uri.fsPath);
  }

  /**
   * Each animation's frames and length by name, as the file says: the export's key counts are thinned,
   * and its last key can come well before the end.
   */
  private async animsTiming(document: Cr2wDocument): Promise<Map<string, { frames?: number; duration?: number }>> {
    const bridge = this.requireBridge();
    await document.ensureOpen(bridge);
    const list = await bridge.getNode(document.doc, "animations", 0, 1);
    const count = list.total ?? 0;
    const paths = Array.from({ length: count }, (_, i) => [
      `animations.${i}.Data.animation.Data.name`,
      `animations.${i}.Data.animation.Data.animBuffer.Data.numFrames`,
      `animations.${i}.Data.animation.Data.duration`,
    ]).flat();
    const nodes = await bridge.getNodes(document.doc, paths, 1);
    const out = new Map<string, { frames?: number; duration?: number }>();
    for (let i = 0; i < count; i++) {
      const name = nodes[i * 3]?.value as { $value?: unknown } | undefined;
      const frames = nodes[i * 3 + 1]?.value;
      const duration = nodes[i * 3 + 2]?.value;
      if (typeof name?.$value !== "string") continue;
      out.set(name.$value, { frames: typeof frames === "number" ? frames : undefined, duration: typeof duration === "number" ? duration : undefined });
    }
    return out;
  }

  /** A .mesh's appearances and the material each names per submesh (chunkMaterials), read from the document. */
  private async meshAppearances(document: Cr2wDocument): Promise<{ name: string; chunkMaterials: string[] }[]> {
    const bridge = this.requireBridge();
    await document.ensureOpen(bridge);
    const list = await bridge.getNode(document.doc, "appearances", 0, 1000);
    const count = list.total ?? list.children?.length ?? 0;
    if (count === 0) return [];
    const paths = Array.from({ length: count }, (_, i) => [`appearances.${i}.Data.name`, `appearances.${i}.Data.chunkMaterials`]).flat();
    const nodes = await bridge.getNodes(document.doc, paths, 1000);
    const text = (v: unknown) => (v && typeof v === "object" && "$value" in v ? String((v as { $value: unknown }).$value ?? "") : String(v ?? ""));
    const out: { name: string; chunkMaterials: string[] }[] = [];
    for (let i = 0; i < count; i++) {
      const name = nodes[i * 2];
      const chunks = nodes[i * 2 + 1];
      out.push({ name: text(name?.value), chunkMaterials: (chunks?.children ?? []).map((c) => text(c.value)) });
    }
    return out;
  }

  async saveCustomDocument(document: Cr2wDocument): Promise<void> {
    await this.flush(document);
    await document.save(this.requireBridge());
    this.saved.fire(document);
  }

  async saveCustomDocumentAs(document: Cr2wDocument, destination: vscode.Uri): Promise<void> {
    await this.flush(document);
    await document.save(this.requireBridge(), destination.fsPath);
    this.saved.fire(document);
  }

  async revertCustomDocument(document: Cr2wDocument): Promise<void> {
    await document.revert(this.requireBridge());
  }

  async backupCustomDocument(document: Cr2wDocument, context: vscode.CustomDocumentBackupContext): Promise<vscode.CustomDocumentBackup> {
    const backup: Backup = { ops: document.log };
    fs.mkdirSync(path.dirname(context.destination.fsPath), { recursive: true });
    fs.writeFileSync(context.destination.fsPath, JSON.stringify(backup));
    return {
      id: context.destination.toString(),
      delete: () => {
        try {
          fs.unlinkSync(context.destination.fsPath);
        } catch {
          // Already gone.
        }
      },
    };
  }

  /** The page. The same markup serves the editor and, with sidebar set, the Properties view, which hides everything but the grid. */
  html(webview: vscode.Webview, sidebar: boolean): string {
    const media = this.media;
    const nonce = Array.from({ length: 24 }, () => "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789"[Math.floor(Math.random() * 62)]).join("");
    const script = webview.asWebviewUri(vscode.Uri.joinPath(media, "editor.js"));
    const style = webview.asWebviewUri(vscode.Uri.joinPath(media, "editor.css"));
    // The 3D viewer (three.js) loads first, so the mesh mode is there when the document arrives; the sidebar skips it.
    const viewer = sidebar ? "" : `<script nonce="${nonce}" src="${webview.asWebviewUri(vscode.Uri.joinPath(this.context.extensionUri, "media", "mesh", "viewer.js"))}"></script>\n`;
    return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src ${webview.cspSource} data: blob:; style-src ${webview.cspSource}; script-src 'nonce-${nonce}'; font-src ${webview.cspSource}; connect-src data: blob:;">
<meta name="viewport" content="width=device-width, initial-scale=1">
<link rel="stylesheet" href="${style}">
<title>CR2W</title>
</head>
<body${sidebar ? ' data-mode="sidebar"' : ""}>
<header id="header">
  <span class="name" id="file">Loading</span>
  <span class="meta" id="type"></span>
  <span class="meta" id="size"></span>
  <span class="spacer"></span>
  <button id="addToProject" hidden title="Copy this game file into the open project, at its game path, to edit it there">Add to Project</button>
  <button id="view" hidden title="Switch between this file's own view and the tree">Tree</button>
  <button id="json" title="Open this file as WolvenKit JSON in a text editor">JSON</button>
</header>
<div id="body">
  <aside id="tree"><div class="label">Tree</div><ul id="treeRoot" class="tree"></ul></aside>
  <aside id="parts" hidden><div class="label">Parts</div><div id="partsBar"></div><div id="partsList"></div></aside>
  <div id="splitter" title="Drag to resize the tree"></div>
  <main id="props"><div class="label" id="propsLabel">Properties</div><div id="grid"></div><div id="view3d" hidden></div></main>
</div>
<footer id="footer">
  <input id="search" type="search" placeholder="search, or a path" title="Finds values and property names anywhere in the file, or goes to a path such as nodes.179.Data.buffer.Data or nodes[179].Data. Enter to search or go, Esc to clear.">
  <span id="status"></span>
</footer>
${viewer}<script nonce="${nonce}" src="${script}"></script>
</body>
</html>`;
  }
}

/**
 * The Properties view in the REDcode activity bar: the selected node of the active CR2W editor, in
 * the same grid, editable. It follows the active editor tab and keeps the last CR2W document while
 * another kind of editor has focus, letting go only when that document closes.
 */
export class Cr2wPropertiesView implements vscode.WebviewViewProvider {
  static readonly viewType = "redcode.properties";
  private view: vscode.WebviewView | undefined;
  private attached: { document: Cr2wDocument; page: vscode.Disposable; closed: vscode.Disposable } | undefined;

  constructor(private readonly editor: Cr2wEditorProvider) {}

  register(): vscode.Disposable {
    return vscode.Disposable.from(
      vscode.window.registerWebviewViewProvider(Cr2wPropertiesView.viewType, this, { webviewOptions: { retainContextWhenHidden: true } }),
      vscode.window.tabGroups.onDidChangeTabs(() => this.follow()),
      vscode.window.tabGroups.onDidChangeTabGroups(() => this.follow()),
      // The tab events can fire before the document is registered; the editor says when it is really showing.
      this.editor.onDidShowEditor((document) => this.follow(document)),
      new vscode.Disposable(() => this.detach()),
    );
  }

  resolveWebviewView(view: vscode.WebviewView): void {
    this.view = view;
    view.webview.options = { enableScripts: true, localResourceRoots: this.editor.resourceRoots };
    view.webview.html = this.editor.html(view.webview, true);
    view.onDidDispose(() => {
      this.detach();
      this.view = undefined;
    });
    this.follow();
  }

  private activeDocument(): Cr2wDocument | undefined {
    const input = vscode.window.tabGroups.activeTabGroup.activeTab?.input;
    return input instanceof vscode.TabInputCustom && (input.viewType === Cr2wViewType || input.viewType === Cr2wOptionViewType) ? this.editor.documentFor(input.uri) : undefined;
  }

  private follow(shown?: Cr2wDocument): void {
    if (!this.view) {
      return;
    }
    const document = shown ?? this.activeDocument();
    if (!document || document === this.attached?.document) {
      if (!this.attached) void this.view.webview.postMessage({ type: "none" });
      return;
    }
    this.detach();
    const webview = this.view.webview;
    this.attached = {
      document,
      page: this.editor.attachPage(document, webview),
      closed: document.onDidDispose(() => {
        this.detach();
        void webview.postMessage({ type: "none" });
      }),
    };
    // The page asks for the document when it is ready; after a switch it has to ask again.
    void webview.postMessage({ type: "attach" });
  }

  private detach(): void {
    this.attached?.page.dispose();
    this.attached?.closed.dispose();
    this.attached = undefined;
  }
}
