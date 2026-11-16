// Add to Library (REDcode issue #19): a game file or a project's file, with the files it needs, as one
// asset item in the EDGE Library. The rules are EDGEbuilder's, shared by every EDGE tool:
// https://edgemodders.github.io/EDGEbuilder/library.html#shared-rules
// No VS Code imports: the MCP server's library_add uses this too.

import { execFile, execFileSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import type { ExtractManyResult, JsonResult } from "./types";

/** What Add to Library needs from the bridge. */
export interface LibraryBridge {
  toJson(path: string): Promise<JsonResult>;
  fileToJson(file: string): Promise<JsonResult>;
  extractMany(items: { path: string; outFile: string }[]): Promise<ExtractManyResult>;
}

// ---- the Library's root --------------------------------------------------------------------------

/** Where the EDGE tools keep the Library's root: `%APPDATA%\EDGE\library.json`, `{ "root": ... }`. */
export function libraryConfigFile(): string {
  return path.join(process.env.APPDATA ?? path.join(os.homedir(), "AppData", "Roaming"), "EDGE", "library.json");
}

export function readLibraryRoot(file = libraryConfigFile()): string | undefined {
  try {
    const root = (JSON.parse(fs.readFileSync(file, "utf8")) as { root?: unknown }).root;
    return typeof root === "string" && root.trim() ? root.trim() : undefined;
  } catch {
    return undefined;
  }
}

/** Makes the root folder and records it for every EDGE tool, keeping any other fields the file has. */
export function writeLibraryRoot(root: string, file = libraryConfigFile()): string {
  root = path.resolve(root);
  fs.mkdirSync(root, { recursive: true });
  let data: Record<string, unknown> = {};
  try {
    data = JSON.parse(fs.readFileSync(file, "utf8")) as Record<string, unknown>;
  } catch {
    // The first tool to set it.
  }
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify({ ...data, root }, null, 2));
  return root;
}

/** The player's Documents folder, wherever Windows keeps it (OneDrive or another drive), else the usual place. */
function documentsFolder(): string {
  const fallback = path.join(os.homedir(), "Documents");
  if (process.platform !== "win32") return fallback;
  try {
    const out = execFileSync("reg", ["query", "HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Explorer\\User Shell Folders", "/v", "Personal"], { encoding: "utf8", windowsHide: true, timeout: 5000 });
    const m = /Personal\s+REG_(?:EXPAND_)?SZ\s+(.+)/.exec(out);
    if (!m) return fallback;
    return m[1].trim().replace(/%([^%]+)%/g, (all, name: string) => process.env[name] ?? all);
  } catch {
    return fallback;
  }
}

/** The Library folder offered the first time: `Documents\EDGE Library`. */
export function suggestedLibraryRoot(): string {
  return path.join(documentsFolder(), "EDGE Library");
}

const ItemEnding = /\.(asset|bake)$/i;

/** The modder's folders under the root, with `/`, leaving out items and hidden folders. */
export function libraryFolders(root: string, cap = 2000): string[] {
  const found: string[] = [];
  const walk = (dir: string, rel: string, depth: number): void => {
    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const e of entries) {
      if (found.length >= cap) return;
      if (!e.isDirectory() || e.name.startsWith(".") || ItemEnding.test(e.name)) continue;
      const child = rel ? `${rel}/${e.name}` : e.name;
      found.push(child);
      if (depth < 16) walk(path.join(dir, e.name), child, depth + 1);
    }
  };
  walk(root, "", 0);
  return found.sort((a, b) => a.localeCompare(b, undefined, { sensitivity: "base" }));
}

/** A folder under the root as the modder typed it, with `/`; throws on what could leave the root. "" is the root. */
export function safeFolder(folder: string | undefined): string {
  const parts = (folder ?? "").split(/[\\/]+/).filter((p) => p !== "");
  for (const p of parts) {
    if (p === "." || p === "..") throw new Error(`A Library folder cannot go through "${p}": ${folder}`);
    if (/[<>:"|?*\u0000-\u001f]/.test(p) || /[. ]$/.test(p)) throw new Error(`Not a folder name: "${p}"`);
    if (ItemEnding.test(p)) throw new Error(`"${p}" is a Library item, not a folder.`);
  }
  return parts.join("/");
}

export function isInside(child: string, parent: string): boolean {
  const rel = path.relative(parent, child);
  return rel === "" || (!rel.startsWith("..") && !path.isAbsolute(rel));
}

/** The product version of Cyberpunk2077.exe, for example "2.5", or undefined when unreadable. Asked once per game folder. */
const versions = new Map<string, Promise<string | undefined>>();
export function gameVersionOf(gameDir: string | null | undefined): Promise<string | undefined> {
  if (!gameDir) return Promise.resolve(undefined);
  let v = versions.get(gameDir);
  if (!v) {
    const exe = path.join(gameDir, "bin", "x64", "Cyberpunk2077.exe");
    v = new Promise((resolve) => {
      execFile("powershell.exe", ["-NoProfile", "-NonInteractive", "-Command", `(Get-Item -LiteralPath '${exe.replace(/'/g, "''")}').VersionInfo.ProductVersion`], { windowsHide: true, timeout: 15000 }, (e, out) =>
        resolve(e ? undefined : out.trim() || undefined),
      );
    });
    versions.set(gameDir, v);
  }
  return v;
}

// ---- which files an asset takes ------------------------------------------------------------------

/** The file types an asset takes along when its main file names them. Any other type stays in the game. */
const TakenTypes = new Set(["mesh", "ent", "app", "mi", "mlsetup", "mlmask", "xbm"]);
/** Of those, the ones that name other files. */
const ReadTypes = new Set(["mesh", "ent", "app", "mi", "mlsetup"]);
/** Game-wide files stay in the game and are referred to: the game's own defaults, surfaces, base materials and effects. */
const SharedFolders = /^(engine|(base|ep1)\\(surfaces|materials|fx))\\/i;

const typeOf = (p: string): string => path.win32.extname(p).slice(1).toLowerCase();

/** True for a file named by an asset's files that the asset copies, rather than leaving it in the game. */
export function assetTakes(gamePath: string): boolean {
  return TakenTypes.has(typeOf(gamePath)) && !SharedFolders.test(gamePath);
}

/** A resource path as a game path: `\` between folders. Undefined for anything that could leave the item's folder. */
export function safeGamePath(p: string): string | undefined {
  const parts = p.split(/[\\/]+/);
  if (!parts.length || parts.some((s) => s === "" || s === "." || s === ".." || /[<>:"|?*\u0000-\u001f]/.test(s))) return undefined;
  return parts.join("\\");
}

/**
 * Every resource a CR2W file's JSON names. A resource path is `{ "$type": "ResourcePath", "$storage":
 * "string", "$value": "base\\..." }`; one the bridge could not name is stored as a hash (`uint64`) and
 * only counted, as nothing says which file it is.
 */
export function referencesIn(json: unknown): { named: Set<string>; unnamed: number } {
  const named = new Set<string>();
  let unnamed = 0;
  const walk = (v: unknown): void => {
    if (Array.isArray(v)) {
      for (const x of v) walk(x);
    } else if (v && typeof v === "object") {
      const o = v as Record<string, unknown>;
      if (o.$type === "ResourcePath") {
        if (o.$storage === "string" && typeof o.$value === "string" && o.$value) named.add(o.$value);
        else if (o.$value && o.$value !== "0") unnamed++;
        return;
      }
      for (const k of Object.keys(o)) walk(o[k]);
    }
  };
  walk(json);
  return { named, unnamed };
}

// ---- the item ------------------------------------------------------------------------------------

/** Where an item's main file comes from: the game, or a project's source/archive (the project's copies win). */
export interface AssetSource {
  /** The main file's game path. */
  path: string;
  project?: { name: string; dir: string };
}

export interface AssetPlan {
  main: string;
  /** Game paths the item copies, the main file first. */
  take: string[];
  /** Files it names that stay in the game. */
  stay: string[];
  /** Files it takes that could not be read, so what they name is not followed. */
  unread: string[];
  /** Names in files that are not game paths. */
  badPaths: string[];
  /** Resources stored as a hash with no name. */
  unnamed: number;
}

/** The kind of an item, from its main file: its type, lowercase and one word. */
export function kindOf(gamePath: string): string {
  const kind = typeOf(gamePath);
  if (!/^[a-z0-9_]+$/.test(kind)) throw new Error(`${gamePath} has no file type, so it cannot be a Library asset.`);
  return kind;
}

export const projectFile = (dir: string, gamePath: string): string => path.join(dir, "source", "archive", ...gamePath.split("\\"));

/** Walks what the main file names, through the files it takes. Reads only. */
export async function planAsset(b: LibraryBridge, source: AssetSource): Promise<AssetPlan> {
  const main = safeGamePath(source.path);
  if (!main) throw new Error(`Not a game path: ${source.path}`);
  kindOf(main);
  const plan: AssetPlan = { main, take: [], stay: [], unread: [], badPaths: [], unnamed: 0 };
  const seen = new Set<string>();
  const queue = [main];
  while (queue.length) {
    const p = queue.shift() as string;
    const key = p.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    if (p !== main && !assetTakes(p)) {
      plan.stay.push(p);
      continue;
    }
    plan.take.push(p);
    if (!ReadTypes.has(typeOf(p))) continue;
    let text: string | null;
    try {
      const own = source.project && projectFile(source.project.dir, p);
      text = (own && fs.existsSync(own) ? await b.fileToJson(own) : await b.toJson(p)).json;
    } catch (e) {
      if (p === main) throw e;
      plan.unread.push(p);
      continue;
    }
    if (text === null) {
      plan.unread.push(p);
      continue;
    }
    const refs = referencesIn(JSON.parse(text));
    plan.unnamed += refs.unnamed;
    for (const r of refs.named) {
      const safe = safeGamePath(r);
      if (safe) queue.push(safe);
      else plan.badPaths.push(r);
    }
  }
  plan.stay.sort();
  return plan;
}

export interface AddOptions {
  root: string;
  /** A folder under the root, with `/`; "" or undefined is the root. */
  folder?: string;
  /** Puts the item in its main file's game-path folders under the folder (Use the game path). */
  gamePathFolders?: boolean;
  /** When the item is there already: stop (throw ItemExists, the default), replace it, or add another beside it. */
  ifExists?: "stop" | "replace" | "another";
  /** "REDcode 0.10.6": goes in the item's history. */
  tool: string;
  gameVersion?: string;
  /** The game's folder, so a Library inside it is refused. */
  gameDir?: string | null;
}

export interface AddResult {
  /** The item's folder. */
  item: string;
  /** The same, relative to the root with `/`. */
  relative: string;
  id: string;
  kind: string;
  main: string;
  version: number;
  /** Files copied, with their total size. */
  files: number;
  bytes: number;
  /** Files it names that stay in the game. */
  stay: string[];
  /** Files it needs that neither the project nor the game has. The game's own files name some such. */
  missing: string[];
  /** Files it takes that could not be read, so what they name is not in the item. */
  unread: string[];
  /** Names in files that are not game paths, left out. */
  badPaths: string[];
  /** Resources stored as a hash with no name. */
  unnamed: number;
  /** Paths in the item past Windows' old limit of 259 characters, which Explorer and some tools refuse. */
  longPaths: number;
}

/** Thrown when the item is there already and ifExists is "stop". */
export class ItemExists extends Error {
  constructor(readonly item: string) {
    super(`${path.basename(item)} is already in the Library: ${item}`);
  }
}

/** The folder an item would go in. */
export function itemFolder(root: string, folder: string | undefined, main: string, gamePathFolders?: boolean): string {
  const gameFolders = gamePathFolders ? main.split("\\").slice(0, -1) : [];
  return path.join(root, ...safeFolder(folder).split("/").filter(Boolean), ...gameFolders, itemName(main));
}

const stemOf = (main: string): string => path.win32.basename(main, path.win32.extname(main));

/** `<name>.<kind>.asset`, lowercase. */
export function itemName(main: string): string {
  return `${stemOf(main).toLowerCase()}.${kindOf(main)}.asset`;
}

function freeFolder(wanted: string): string {
  const parent = path.dirname(wanted);
  const m = /^(.*)(\.[^.]+\.asset)$/.exec(path.basename(wanted)) as RegExpExecArray;
  for (let n = 2; ; n++) {
    const next = path.join(parent, `${m[1]}_${n}${m[2]}`);
    if (!fs.existsSync(next)) return next;
  }
}

function readAssetJson(item: string): { id?: string; name?: string; version?: number; history?: unknown[] } {
  try {
    return JSON.parse(fs.readFileSync(path.join(item, "asset.json"), "utf8")) as ReturnType<typeof readAssetJson>;
  } catch {
    return {};
  }
}

function filesUnder(dir: string): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? filesUnder(path.join(dir, e.name)) : [path.join(dir, e.name)]));
}

/**
 * Renames a folder, waiting for Windows: it refuses while anything has a file inside open, and an
 * antivirus or the search indexer opens files just written. Tries for about 13 seconds by default.
 */
export async function renameFolder(from: string, to: string, waits = [50, 100, 200, 400, 800, 1600, 3200, 6400]): Promise<void> {
  for (let i = 0; ; i++) {
    try {
      fs.renameSync(from, to);
      return;
    } catch (e) {
      const code = (e as NodeJS.ErrnoException).code;
      if (code !== "EPERM" && code !== "EACCES" && code !== "EBUSY") throw e;
      if (i >= waits.length) throw new Error(`Could not move ${from} to ${to}: something has a file in it open, such as an antivirus or the search indexer. Try again in a moment. (${code})`);
      await new Promise((resolve) => setTimeout(resolve, waits[i]));
    }
  }
}

/** Writes the item. It is built beside its place and moved there whole, so a failure leaves nothing half made. */
export async function writeAsset(b: LibraryBridge, source: AssetSource, plan: AssetPlan, opts: AddOptions): Promise<AddResult> {
  const root = path.resolve(opts.root);
  if (opts.gameDir && isInside(root, opts.gameDir)) throw new Error(`The Library must not be inside the game's folder: ${root}`);
  let item = itemFolder(root, opts.folder, plan.main, opts.gamePathFolders);
  const had = fs.existsSync(item);
  if (had && (opts.ifExists ?? "stop") === "stop") throw new ItemExists(item);
  if (had && opts.ifExists === "another") item = freeFolder(item);
  const replacing = had && opts.ifExists === "replace" ? readAssetJson(item) : undefined;

  const parent = path.dirname(item);
  fs.mkdirSync(parent, { recursive: true });
  const tag = randomBytes(6).toString("hex");
  const building = path.join(parent, `.redcode-add-${tag}`);
  const archive = path.join(building, "source", "archive");
  try {
    fs.mkdirSync(archive, { recursive: true });
    const out = (p: string): string => path.join(archive, ...p.split("\\"));

    // A project's own copies first, then the game.
    const fromGame: string[] = [];
    let files = 0;
    let bytes = 0;
    for (const p of plan.take) {
      const own = source.project && projectFile(source.project.dir, p);
      if (own && fs.existsSync(own)) {
        fs.mkdirSync(path.dirname(out(p)), { recursive: true });
        fs.copyFileSync(own, out(p));
        files++;
        bytes += fs.statSync(own).size;
      } else {
        fromGame.push(p);
      }
    }
    let missing: string[] = [];
    if (fromGame.length) {
      const got = await b.extractMany(fromGame.map((p) => ({ path: p, outFile: out(p) })));
      files += got.extracted;
      bytes += got.bytes;
      missing = got.failed;
    }
    if (missing.some((m) => m.toLowerCase() === plan.main.toLowerCase())) throw new Error(`Could not get ${plan.main} from the game.`);

    const stem = stemOf(plan.main);
    const inGame = !source.project || !fs.existsSync(projectFile(source.project.dir, plan.main)) || (await existsInGame(b, plan.main));
    const entry = { tool: opts.tool, did: replacing ? (source.project ? `Replaced from project ${source.project.name}` : "Replaced from the game") : source.project ? `Added from project ${source.project.name}` : "Added from the game", date: new Date().toISOString() };
    const asset = {
      format: 1,
      id: replacing?.id ?? randomBytes(8).toString("hex"),
      name: replacing?.name ?? stem,
      kind: kindOf(plan.main),
      main: plan.main,
      version: (replacing?.version ?? 0) + 1,
      from: source.project ? { project: source.project.name, path: plan.main } : { game: plan.main, gameVersion: opts.gameVersion ?? null },
      // The asset's own terms, in the shape EDGEfab's assets have when they are not the game's.
      license: inGame ? "game" : { source: "own", note: "From a REDcode project: record its source and terms before releasing it." },
      history: [...(replacing?.history ?? []), entry],
    };
    fs.writeFileSync(path.join(building, "asset.json"), JSON.stringify(asset, null, 2) + "\n");
    const longPaths = filesUnder(building).filter((f) => item.length + f.length - building.length > 259).length;

    if (replacing) {
      const old = path.join(parent, `.redcode-old-${tag}`);
      await renameFolder(item, old);
      try {
        await renameFolder(building, item);
      } catch (e) {
        await renameFolder(old, item);
        throw e;
      }
      fs.rmSync(old, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
    } else {
      await renameFolder(building, item);
    }
    const relative = path.relative(root, item).split(path.sep).join("/");
    return { item, relative, id: asset.id, kind: asset.kind, main: plan.main, version: asset.version, files, bytes, stay: plan.stay, missing, unread: plan.unread, badPaths: plan.badPaths, unnamed: plan.unnamed, longPaths };
  } finally {
    fs.rmSync(building, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
  }
}

async function existsInGame(b: LibraryBridge, gamePath: string): Promise<boolean> {
  return b.toJson(gamePath).then(
    () => true,
    () => false,
  );
}

// ---- the Library view and Add to Project (REDcode issue #23, docs/design/library-view.md) --------

/** Kinds their own tools add to a project, keeping their own records: REDcode shows them and reveals them. */
const OtherToolKinds = new Set(["prop", "sound", "quickhack", "bake"]);
const ModelEnding = /\.(glb|gltf|fbx|blend)$/i;
/** Who REDcode's entries in a project's came-from note are by. */
export const NoteBy = "redcode";

/** An item in the Library, as the view shows it. */
export interface LibraryItem {
  dir: string;
  /** From asset.json, else from the folder's name. */
  name: string;
  /** From the folder's name, which wins over asset.json. */
  kind: string;
  id?: string;
  version?: number;
  main?: string;
  /** The tool that last wrote it, from asset.json's history, without its version: "REDcode", "EDGEfab". */
  tool?: string;
  /** REDcode adds it to a project: a kind of game file, with a source/archive. */
  addable: boolean;
}

export interface LibraryListing {
  folders: string[];
  items: LibraryItem[];
  models: string[];
}

const byName = (a: string, b: string) => a.localeCompare(b, undefined, { sensitivity: "base" });

/** Reads one item folder: `<name>.<kind>.asset` or `<name>.bake`. */
export function readLibraryItem(dir: string): LibraryItem {
  const base = path.basename(dir);
  const asset = /^(.*)\.([^.]+)\.asset$/i.exec(base);
  const kind = asset ? asset[2].toLowerCase() : /\.bake$/i.test(base) ? "bake" : "";
  const folderName = asset ? asset[1] : base.replace(/\.bake$/i, "");
  let json: { id?: unknown; name?: unknown; version?: unknown; main?: unknown; history?: unknown } = {};
  try {
    json = JSON.parse(fs.readFileSync(path.join(dir, kind === "bake" ? "bake.json" : "asset.json"), "utf8")) as typeof json;
  } catch {
    // An item with no readable asset.json still shows, by its folder's name.
  }
  const history = Array.isArray(json.history) ? (json.history as { tool?: unknown }[]) : [];
  const last = [...history].reverse().find((h) => typeof h?.tool === "string")?.tool as string | undefined;
  const item: LibraryItem = {
    dir,
    name: typeof json.name === "string" && json.name ? json.name : folderName,
    kind,
    ...(typeof json.id === "string" ? { id: json.id } : {}),
    ...(typeof json.version === "number" ? { version: json.version } : {}),
    ...(typeof json.main === "string" ? { main: json.main } : {}),
    ...(last ? { tool: last.split(" ")[0] } : {}),
    addable: false,
  };
  item.addable = !!kind && !OtherToolKinds.has(kind) && fs.existsSync(path.join(dir, "source", "archive"));
  return item;
}

/** One folder of the Library: its folders, its items and its loose model files, each sorted by name. */
export function listLibraryFolder(dir: string): LibraryListing {
  const out: LibraryListing = { folders: [], items: [], models: [] };
  let entries: fs.Dirent[];
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return out;
  }
  for (const e of entries.sort((a, b) => byName(a.name, b.name))) {
    if (e.name.startsWith(".")) continue;
    const full = path.join(dir, e.name);
    if (e.isDirectory()) {
      if (ItemEnding.test(e.name)) out.items.push(readLibraryItem(full));
      else out.folders.push(full);
    } else if (ModelEnding.test(e.name)) {
      out.models.push(full);
    }
  }
  return out;
}

/** Every item under the root, for finding a project's entries again. */
export function libraryItems(root: string, cap = 20000): LibraryItem[] {
  const found: LibraryItem[] = [];
  const walk = (dir: string, depth: number): void => {
    const l = listLibraryFolder(dir);
    for (const i of l.items) if (found.length < cap) found.push(i);
    if (depth < 16) for (const f of l.folders) if (found.length < cap) walk(f, depth + 1);
  };
  walk(root, 0);
  return found;
}

/** An entry of a project's came-from note, `source/library.json`, as the shared rules give it. */
export interface NoteEntry {
  id: string;
  kind: string;
  /** The item, relative to the Library's root, with `/`. */
  path: string;
  version: number;
  hash?: string;
  added: string;
  by: string;
  /** Relative to the project, with `/`. */
  files: string[];
}

interface Note {
  format: number;
  items: NoteEntry[];
  [other: string]: unknown;
}

export const noteFile = (projectDir: string): string => path.join(projectDir, "source", "library.json");

/** The project's came-from note, or an empty one. Other tools' entries come back as they are. */
export function readNote(projectDir: string): Note {
  try {
    const n = JSON.parse(fs.readFileSync(noteFile(projectDir), "utf8")) as Partial<Note>;
    return { ...n, format: typeof n.format === "number" ? n.format : 1, items: Array.isArray(n.items) ? n.items : [] };
  } catch {
    return { format: 1, items: [] };
  }
}

const isOurs = (e: unknown, id?: string): e is NoteEntry => !!e && typeof e === "object" && (e as NoteEntry).by === NoteBy && (id === undefined || (e as NoteEntry).id === id);

/** Writes REDcode's entry for one item, keeping every other tool's entries and the note's other fields. */
function writeNoteEntry(projectDir: string, entry: NoteEntry): void {
  const note = readNote(projectDir);
  note.items = [...note.items.filter((e) => !isOurs(e, entry.id)), entry];
  fs.mkdirSync(path.dirname(noteFile(projectDir)), { recursive: true });
  fs.writeFileSync(noteFile(projectDir), JSON.stringify(note, null, 2) + "\n");
}

/** A project-relative path with `/` on disk, or undefined when it would leave the project's source folder. */
function projectPath(projectDir: string, rel: string): string | undefined {
  const full = path.resolve(projectDir, ...rel.split("/"));
  return isInside(full, path.join(projectDir, "source")) ? full : undefined;
}

export interface AddToProjectPlan {
  item: LibraryItem;
  /** The item's files as the project will have them: `source/archive/...`, with `/`. */
  files: string[];
  /** REDcode's earlier entry for this item in the project, when it was added before. */
  previous?: NoteEntry;
  /** Files the project has already that did not come from this item: Add to Project asks before replacing them. */
  clashes: string[];
}

/** What adding an item to a project would do. Reads only. */
export function planAddToProject(itemDir: string, projectDir: string): AddToProjectPlan {
  const item = readLibraryItem(itemDir);
  if (!item.addable) {
    const who = item.kind === "bake" ? "EDGEbuilder's Include in project" : item.tool && item.tool !== "REDcode" ? item.tool : "the tool that made it";
    throw new Error(`${item.name} is a ${item.kind || "Library item"} that ${who} adds to a project, not REDcode.`);
  }
  if (!item.id) throw new Error(`${item.name} has no id in its asset.json, so the project could not find it in the Library again.`);
  const archive = path.join(itemDir, "source", "archive");
  const files = filesUnder(archive).map((f) => ["source", "archive", ...path.relative(archive, f).split(path.sep)].join("/"));
  if (!files.length) throw new Error(`${item.name} has no files in its source/archive.`);
  const previous = readNote(projectDir).items.find((e) => isOurs(e, item.id));
  const before = new Set((previous?.files ?? []).map((f) => f.toLowerCase()));
  const clashes = files.filter((f) => !before.has(f.toLowerCase()) && fs.existsSync(path.join(projectDir, ...f.split("/"))));
  return { item, files, ...(previous ? { previous } : {}), clashes };
}

/**
 * Copies the item's files into the project at the same game paths and writes REDcode's entry in the
 * came-from note. The files its earlier entry put there and it no longer has are removed first, as
 * EDGEfab does. root is the Library's root, for the entry's path.
 */
export function addItemToProject(plan: AddToProjectPlan, root: string, projectDir: string): { files: number; replaced: boolean; removed: number } {
  const keep = new Set(plan.files.map((f) => f.toLowerCase()));
  let removed = 0;
  for (const f of plan.previous?.files ?? []) {
    if (keep.has(f.toLowerCase())) continue;
    const full = projectPath(projectDir, f);
    if (full && fs.existsSync(full)) {
      fs.rmSync(full, { force: true });
      removed++;
    }
  }
  for (const f of plan.files) {
    const to = projectPath(projectDir, f);
    if (!to) throw new Error(`${f} would leave the project`);
    fs.mkdirSync(path.dirname(to), { recursive: true });
    fs.copyFileSync(path.join(plan.item.dir, ...f.split("/")), to);
  }
  writeNoteEntry(projectDir, {
    id: plan.item.id as string,
    kind: plan.item.kind,
    path: path.relative(root, plan.item.dir).split(path.sep).join("/"),
    version: plan.item.version ?? 1,
    added: new Date().toISOString(),
    by: NoteBy,
    files: plan.files,
  });
  return { files: plan.files.length, replaced: !!plan.previous, removed };
}

export interface ProjectLibraryEntry {
  entry: NoteEntry;
  item?: LibraryItem;
  /** newer: the Library has a later version; missing: the item is not in the Library any more. */
  state: "newer" | "same" | "missing";
}

/** REDcode's entries in the project's note, each found in the Library by id, else by path. */
export function projectLibraryState(projectDir: string, root: string): ProjectLibraryEntry[] {
  const ours = readNote(projectDir).items.filter((e): e is NoteEntry => isOurs(e));
  if (!ours.length) return [];
  const items = libraryItems(root);
  const relOf = (i: LibraryItem) => path.relative(root, i.dir).split(path.sep).join("/").toLowerCase();
  return ours.map((entry) => {
    const item = items.find((i) => i.id === entry.id) ?? items.find((i) => relOf(i) === String(entry.path).toLowerCase());
    if (!item) return { entry, state: "missing" as const };
    return { entry, item, state: (item.version ?? 1) > entry.version ? ("newer" as const) : ("same" as const) };
  });
}
