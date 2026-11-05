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
      fs.renameSync(item, old);
      try {
        fs.renameSync(building, item);
      } catch (e) {
        fs.renameSync(old, item);
        throw e;
      }
      fs.rmSync(old, { recursive: true, force: true });
    } else {
      fs.renameSync(building, item);
    }
    const relative = path.relative(root, item).split(path.sep).join("/");
    return { item, relative, id: asset.id, kind: asset.kind, main: plan.main, version: asset.version, files, bytes, stay: plan.stay, missing, unread: plan.unread, badPaths: plan.badPaths, unnamed: plan.unnamed, longPaths };
  } finally {
    fs.rmSync(building, { recursive: true, force: true });
  }
}

async function existsInGame(b: LibraryBridge, gamePath: string): Promise<boolean> {
  return b.toJson(gamePath).then(
    () => true,
    () => false,
  );
}
