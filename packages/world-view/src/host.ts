// @edgemodders/world-view, the host half (docs/design/sector-view.md in REDcode, the API agreed with
// EDGEbuilder in EDGEbuilder #8): the game's streaming sectors as meshes and markers for the page half.
// It asks REDbridge for a sector's items (sector.nodes), exports each unique mesh once into a cache folder
// it is given, and hands the page each mesh with all its placements in that sector. Node only; no
// VS Code and no REDnode imports, so REDcode's extension and EDGEbuilder's Node mod both use it.

import { createHash } from "node:crypto";
import * as fs from "node:fs";
import * as path from "node:path";

/** What the host half needs of REDbridge: REDcode's BridgeClient and REDnode's kernel.bridge() both fit. */
export interface Bridge {
  request<T = unknown>(method: string, params?: Record<string, unknown>): Promise<T>;
}

export interface Box {
  min: number[];
  max: number[];
}

/** A sector to load: a game path, or a mod's sector through its archive or a folder of loose files (as REDbridge's sector.nodes takes them). */
export interface SectorRef {
  path: string;
  archive?: string;
  root?: string;
}

/**
 * One place a mesh is drawn. id is "<sector path>#<entry>", or "<sector path>#<entry>.<copy>" for one copy
 * of an instanced mesh: entry is the node data index, as ArchiveXL's deletions and REDnode's node registry
 * name it. matrix is column-major 4x4, in glTF axes (Y up), as three.js's Matrix4.fromArray takes it.
 * range is the node's primary streaming distance in metres, for culling.
 */
export interface Placement {
  id: string;
  matrix: number[];
  range?: number;
  /** The node's mesh appearance, when the sector names one: which material each submesh shows (see meshMaterials). */
  appearance?: string;
}

/** A unique mesh of one sector: its .glb (exported once, cached) and every place the sector draws it. */
export interface MeshBatch {
  sector: string;
  mesh: string;
  glb: string;
  placements: Placement[];
}

/** A thing with no mesh to draw: an entity, a decal, a light, collision, an AI spot... */
export interface Marker {
  id: string;
  /** A short group for colour and filters: entity, decal, light, collision, sound, area, other. */
  kind: string;
  /** The node's class, such as worldEntityNode. */
  class: string;
  resource?: string;
  matrix: number[];
  /** Its world box in glTF axes, when the sector gives one. */
  box?: Box;
  range?: number;
}

export interface Progress {
  /**
   * "reading": done of total sectors read (sector.nodes), before any mesh; "exporting" (or none): done of
   * total unique meshes exported or found in the cache.
   */
  phase?: "reading" | "exporting";
  /** Unique meshes exported or found in the cache, of total; or sectors read, while reading. */
  done: number;
  total: number;
  /** About how long the rest takes, from the exports so far. */
  etaMs?: number;
  /** The mesh being exported now. */
  current?: string;
}

export interface LoaderOptions {
  /** Where meshes are extracted and exported; kept between runs. A caller that knows the game's version puts it in the folder's name. */
  cacheDir: string;
  /** Only node classes in this list (worldInstancedMeshNode, ...); all when not given. */
  kinds?: string[];
  onMesh(m: MeshBatch): void;
  onMarkers(sector: string, markers: Marker[]): void;
  /** Every id under "<sector>#" leaves the page. */
  onUnload(sector: string): void;
  onProgress?(p: Progress): void;
}

export interface SectorLoader {
  /**
   * Loads the sectors new to the list and unloads those that left it. A newer set() cancels the exports an
   * older one still has queued. Resolves when this set's meshes are all handed over, with what was skipped.
   */
  set(sectors: (SectorRef | string)[]): Promise<{ skipped: { id: string; why: string }[] }>;
  dispose(): void;
}

// ---- axes ------------------------------------------------------------------------------------

/** A point in the game's axes (Z up) in glTF's (Y up), as WolvenKit's exporter turns them: (x, y, z) to (x, z, -y). */
export const toGltf = (p: number[]): number[] => [p[0], p[2], -p[1]];
/** And back. */
export const toGame = (p: number[]): number[] => [p[0], -p[2], p[1]];

/** A box in the game's axes as a box in glTF's. */
export function boxToGltf(b: Box): Box {
  return { min: [b.min[0], b.min[2], -b.max[1]], max: [b.max[0], b.max[2], -b.min[1]] };
}

/** A game transform (position, rotation as the quaternion x, y, z, w, scale), as a column-major glTF-axes matrix. */
export function transformToGltf(position: number[], rotation: number[], scale: number[] = [1, 1, 1]): number[] {
  const [x, y, z, w] = normalize4(rotation);
  const [sx, sy, sz] = scale;
  // The game's rotation and scale, as columns.
  const r = [
    [(1 - 2 * (y * y + z * z)) * sx, 2 * (x * y + w * z) * sx, 2 * (x * z - w * y) * sx],
    [2 * (x * y - w * z) * sy, (1 - 2 * (x * x + z * z)) * sy, 2 * (y * z + w * x) * sy],
    [2 * (x * z + w * y) * sz, 2 * (y * z - w * x) * sz, (1 - 2 * (x * x + y * y)) * sz],
  ];
  // C . M . C^-1 with C: (x, y, z) to (x, z, -y). A column c of M becomes column C(c), and the columns are
  // taken in the order C^-1 sends glTF's axes to the game's: gx = x, gy = -z, gz = y.
  const c = (v: number[]) => [v[0], v[2], -v[1]];
  const col0 = c(r[0]);
  const col1 = c(r[2]);
  const col2 = c(r[1]).map((v) => -v);
  const t = toGltf(position);
  return [col0[0], col0[1], col0[2], 0, col1[0], col1[1], col1[2], 0, col2[0], col2[1], col2[2], 0, t[0], t[1], t[2], 1];
}

function normalize4(q: number[]): number[] {
  const n = Math.hypot(q[0] ?? 0, q[1] ?? 0, q[2] ?? 0, q[3] ?? 1) || 1;
  return [(q[0] ?? 0) / n, (q[1] ?? 0) / n, (q[2] ?? 0) / n, (q[3] ?? 1) / n];
}

// ---- sector.nodes ----------------------------------------------------------------------------

/** One item of REDbridge's sector.nodes (0.12.0): a node data entry. */
export interface SectorItem {
  index: number;
  node: number;
  kind: string;
  ref?: string | null;
  hash?: string | null;
  resource?: string | null;
  appearance?: string | null;
  transform: { position: number[]; rotation: number[]; scale?: number[] };
  instances?: { position: number[]; rotation: number[]; scale?: number[] }[] | null;
  streaming?: { primary?: number | null; secondary?: number | null } | null;
  bounds?: Box | null;
}

/** A marker's group, from the node's class. */
export function markerKind(cls: string, resource?: string | null): string {
  const c = cls.toLowerCase();
  if (c.includes("entity") || c.includes("device") || resource?.toLowerCase().endsWith(".ent")) return "entity";
  if (c.includes("decal")) return "decal";
  if (c.includes("light")) return "light";
  if (c.includes("collision")) return "collision";
  if (c.includes("sound") || c.includes("acoustic")) return "sound";
  if (c.includes("area") || c.includes("trigger")) return "area";
  return "other";
}

/** A sector's items as meshes with their placements, and markers for the rest. */
export function itemsToBatches(sector: string, items: SectorItem[], kinds?: string[]): { meshes: Map<string, { mesh: string; placements: Placement[] }>; markers: Marker[] } {
  const want = kinds?.length ? new Set(kinds.map((k) => k.toLowerCase())) : undefined;
  /** By the mesh's path in lower case; mesh keeps its first spelling. */
  const meshes = new Map<string, { mesh: string; placements: Placement[] }>();
  const markers: Marker[] = [];
  for (const it of items) {
    if (want && !want.has(it.kind.toLowerCase())) continue;
    const range = it.streaming?.primary ?? undefined;
    const id = `${sector}#${it.index}`;
    const res = it.resource ?? undefined;
    if (res && res.toLowerCase().endsWith(".mesh")) {
      let batch = meshes.get(res.toLowerCase());
      if (!batch) meshes.set(res.toLowerCase(), (batch = { mesh: res, placements: [] }));
      const list = batch.placements;
      const copies = it.instances?.length ? it.instances : undefined;
      const extra = { ...(range !== undefined ? { range } : {}), ...(it.appearance ? { appearance: it.appearance } : {}) };
      if (copies) copies.forEach((c, k) => list.push({ id: `${id}.${k}`, matrix: transformToGltf(c.position, c.rotation, c.scale), ...extra }));
      else list.push({ id, matrix: transformToGltf(it.transform.position, it.transform.rotation, it.transform.scale), ...extra });
      continue;
    }
    markers.push({
      id,
      kind: markerKind(it.kind, res),
      class: it.kind,
      ...(res ? { resource: res } : {}),
      matrix: transformToGltf(it.transform.position, it.transform.rotation, it.transform.scale),
      ...(it.bounds ? { box: boxToGltf(it.bounds) } : {}),
      ...(range !== undefined ? { range } : {}),
    });
  }
  return { meshes, markers };
}

// ---- exporting meshes ------------------------------------------------------------------------

/** The cached .glb a mesh exports to under cacheDir. */
export function meshGlbPath(cacheDir: string, mesh: string): string {
  return path.join(cacheDir, "raw", ...mesh.split(/[\\/]/)).replace(/\.mesh$/i, ".glb");
}

/**
 * A mesh exported once to a plain .glb (its most detailed level of detail, no materials), into cacheDir:
 * from a mod's loose files (root), the game, or a mod's archive, in that order.
 */
async function exportMesh(bridge: Bridge, cacheDir: string, mesh: string, from?: SectorRef): Promise<string> {
  const rel = mesh.split(/[\\/]/);
  const loose = from?.root ? path.join(from.root, ...rel) : undefined;
  if (loose && fs.existsSync(loose)) {
    // A mod's own mesh: its export is kept apart from the game's mesh of the same path, and made again
    // whenever the file is newer.
    const looseCache = looseCacheOf(cacheDir, from!.root!);
    const out = meshGlbPath(looseCache, mesh);
    if (fs.existsSync(out) && fs.statSync(out).mtimeMs > fs.statSync(loose).mtimeMs) return out;
    await bridge.request("project.export", { file: loose, archiveDir: from!.root!, rawDir: path.join(looseCache, "raw"), options: { meshBinary: true, meshMaterials: false, meshLodFilter: true } });
    if (!fs.existsSync(out)) throw new Error(`WolvenKit wrote no .glb for ${mesh}`);
    return out;
  }
  const out = meshGlbPath(cacheDir, mesh);
  if (fs.existsSync(out)) return out;
  const archiveDir = path.join(cacheDir, "archive");
  const file = path.join(archiveDir, ...rel);
  if (!fs.existsSync(file)) {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    await extractMesh(bridge, mesh, file, from);
  }
  await bridge.request("project.export", { file, archiveDir, rawDir: path.join(cacheDir, "raw"), options: { meshBinary: true, meshMaterials: false, meshLodFilter: true } });
  if (!fs.existsSync(out)) throw new Error(`WolvenKit wrote no .glb for ${mesh}`);
  return out;
}

export function createSectorLoader(bridge: Bridge, options: LoaderOptions): SectorLoader {
  /** The sectors handed to the page, by path in lower case. */
  const loaded = new Map<string, SectorRef>();
  /** Of those, the ones whose every mesh was sent: a set cut short by a newer one leaves its sectors out. */
  const complete = new Set<string>();
  /** Each mesh's export, shared by every sector that draws it. */
  const exports = new Map<string, Promise<string>>();
  let generation = 0;
  let disposed = false;

  const exportOnce = (mesh: string, from?: SectorRef) => {
    const key = mesh.toLowerCase();
    let p = exports.get(key);
    if (!p) {
      p = exportMesh(bridge, options.cacheDir, mesh, from);
      exports.set(key, p);
      // A failed export may succeed another time (a mod archive put in place): not kept.
      p.catch(() => exports.delete(key));
    }
    return p;
  };

  return {
    async set(sectors) {
      const mine = ++generation;
      const wanted = new Map<string, SectorRef>();
      for (const s of sectors) {
        const ref = typeof s === "string" ? { path: s } : s;
        wanted.set(ref.path.toLowerCase(), ref);
      }
      for (const key of [...loaded.keys()]) {
        if (!wanted.has(key)) {
          options.onUnload(loaded.get(key)!.path);
          loaded.delete(key);
          complete.delete(key);
        }
      }
      const skipped: { id: string; why: string }[] = [];
      // Every new sector's items first, so the page shows its cached meshes and markers at once.
      const queue: { sector: SectorRef; mesh: string; placements: Placement[] }[] = [];
      const toRead = [...wanted.keys()].filter((key) => !(loaded.has(key) && complete.has(key))).length;
      let read = 0;
      for (const [key, ref] of wanted) {
        if (loaded.has(key) && complete.has(key)) continue;
        // Reading many sectors (the coarser levels) takes seconds each: said, so the page shows it is working.
        if (toRead > 1) options.onProgress?.({ phase: "reading", done: read, total: toRead, current: ref.path });
        read++;
        // Read but not finished: taken out and read again, so the page gets all of it.
        if (loaded.has(key)) {
          options.onUnload(ref.path);
          loaded.delete(key);
        }
        let items: SectorItem[];
        try {
          const r = await bridge.request<{ items: SectorItem[] }>("sector.nodes", { path: ref.path, bounds: true, ...(ref.archive ? { archive: ref.archive } : {}), ...(ref.root ? { root: ref.root } : {}) });
          items = r.items ?? [];
        } catch (e) {
          skipped.push({ id: ref.path, why: e instanceof Error ? e.message : String(e) });
          continue;
        }
        if (mine !== generation || disposed) return { skipped };
        loaded.set(key, ref);
        const { meshes, markers } = itemsToBatches(ref.path, items, options.kinds);
        if (markers.length) options.onMarkers(ref.path, markers);
        for (const batch of meshes.values()) queue.push({ sector: ref, mesh: batch.mesh, placements: batch.placements });
      }
      // Cached meshes first; the rest export one at a time, as REDbridge answers one call at a time.
      queue.sort((a, b) => Number(fs.existsSync(meshGlbPath(options.cacheDir, b.mesh))) - Number(fs.existsSync(meshGlbPath(options.cacheDir, a.mesh))));
      const total = queue.length;
      let done = 0;
      let exportMs = 0;
      let exported = 0;
      for (const q of queue) {
        if (mine !== generation || disposed) return { skipped };
        if (!loaded.has(q.sector.path.toLowerCase())) continue;
        const cached = fs.existsSync(meshGlbPath(options.cacheDir, q.mesh));
        if (!cached) {
          const left = total - done;
          options.onProgress?.({ phase: "exporting", done, total, current: q.mesh, ...(exported ? { etaMs: Math.round((exportMs / exported) * left) } : {}) });
        }
        const t0 = Date.now();
        try {
          const glb = await exportOnce(q.mesh, q.sector);
          if (!cached) {
            exportMs += Date.now() - t0;
            exported++;
          }
          if (mine !== generation || disposed || !loaded.has(q.sector.path.toLowerCase())) continue;
          options.onMesh({ sector: q.sector.path, mesh: q.mesh, glb, placements: q.placements });
        } catch (e) {
          const why = e instanceof Error ? e.message : String(e);
          for (const p of q.placements) skipped.push({ id: p.id, why });
        }
        done++;
      }
      if (mine === generation) {
        for (const key of wanted.keys()) if (loaded.has(key)) complete.add(key);
        options.onProgress?.({ phase: "exporting", done, total });
      }
      return { skipped };
    },
    dispose() {
      disposed = true;
      generation++;
    },
  };
}

// ---- which sectors ---------------------------------------------------------------------------

export interface SectorInfo {
  path: string;
  kind: string;
  grid?: number[];
  level: number;
  box: Box;
  block?: string;
  archive?: string;
  /** A Phantom Liberty sector whose path the base block lists too: the game streams Phantom Liberty's. */
  replaces?: boolean;
  /** How many named variants (node ranges a quest switches) it has. */
  variants?: number;
}

const sectorLists = new WeakMap<Bridge, Promise<SectorInfo[]>>();

/** Every game sector with its box, from sector.find, asked once per bridge (REDbridge keeps it too). */
function allSectors(bridge: Bridge): Promise<SectorInfo[]> {
  let p = sectorLists.get(bridge);
  if (!p) {
    p = bridge.request<{ sectors: SectorInfo[] }>("sector.find", {}).then((r) => r.sectors ?? []);
    sectorLists.set(bridge, p);
    p.catch(() => sectorLists.delete(bridge));
  }
  return p;
}

/**
 * A sector and the coarser sectors over it: the same kind, a higher level, a box that holds its centre.
 * Level 0 is the near layer; from above, the coarser levels draw what is far.
 */
export async function sectorsOver(bridge: Bridge, sector: string): Promise<string[]> {
  const all = await allSectors(bridge);
  const own = all.find((s) => s.path.toLowerCase() === sector.toLowerCase());
  if (!own) return [sector];
  const c = own.box.min.map((v, i) => (v + own.box.max[i]) / 2);
  const over = all
    .filter((s) => s !== own && s.kind === own.kind && s.level > own.level && s.box.min.every((v, i) => v <= c[i]) && s.box.max.every((v, i) => v >= c[i]))
    .sort((a, b) => a.level - b.level);
  return [own.path, ...over.map((s) => s.path)];
}

/** The sectors whose box comes within distance of a point in the game's axes (Z up), of the given levels (all when not given). */
export async function sectorsNear(bridge: Bridge, point: number[], distance: number, options: { levels?: number[]; kinds?: string[] } = {}): Promise<string[]> {
  const r = await bridge.request<{ sectors: SectorInfo[] }>("sector.find", {
    box: { min: point.map((v) => v - distance), max: point.map((v) => v + distance) },
    ...(options.levels ? { levels: options.levels } : {}),
    ...(options.kinds ? { kinds: options.kinds } : {}),
  });
  return (r.sectors ?? []).map((s) => s.path);
}

// ---- overlaps: the sectors whose things reach into one (REDcode's docs/design/sector-layers.md and
// docs/design/sector-overlaps.md, O1: thing to thing, by role, with the reasons) ----

/** How a sector that reaches in stands to the one in focus. */
export type OverlapGroup = "neighbours" | "levels" | "interiors" | "exteriors" | "global" | "other";

/**
 * What a placed thing is for, by its node class: REDcode's labels, not the game's. detail: what the game draws
 * up close; proxy: a stand-in mesh for distance; helper: occluders, collision, sound, navigation, crowds, areas,
 * light and fog volumes, never drawn as geometry; unknown: none of these, treated as detail.
 */
export type ThingRole = "detail" | "proxy" | "helper" | "unknown";

const HelperClass = /occluder|collision|acoustic|aispot|community|area|^worldgi|traffic|crowd|sound|fog|reflectionprobe|interiormap|lightchannel|population|smartobject|navigation|marker|trigger|spawn|cover|nav|splinenode/;
const DetailClass = /mesh|decal|light|entity|particle|device|advertisement|destruction|cloth|water|foliage|terrain/;
/** Detail with no box of its own still counts by where it stands. */
const ByPositionClass = /entity|decal|light|particle|device|decoration/;

/** A node class's role (sector-overlaps.md, O1). Checked on game 2.5's sectors: proxies are the *Proxy* classes. */
export function roleOf(cls: string): ThingRole {
  const c = cls.toLowerCase();
  if (c.includes("proxy")) return "proxy";
  if (HelperClass.test(c)) return "helper";
  if (DetailClass.test(c)) return "detail";
  return "unknown";
}

/** One thing in a match: its node data entry, class and file, and the box the test used (game axes, Z up). */
export interface OverlapThing {
  entry: number;
  class: string;
  role: ThingRole;
  resource?: string;
  box: Box;
  /** It has no box: its position stood in for one. */
  byPosition?: boolean;
  /** An instanced mesh's box covers all its copies (REDbridge gives one box a group). */
  group?: boolean;
}

/** Why a layer is listed: one of its things, and the opened sector's thing it meets (null: the area searched). */
export interface OverlapMatch {
  thing: OverlapThing;
  meets: OverlapThing | null;
}

/** A thing whose box takes no part in matching, and why. */
export interface LeftOutThing {
  entry: number;
  class: string;
  resource?: string;
  why: string;
}

export interface OverlapLayer {
  path: string;
  kind: string;
  level: number;
  group: OverlapGroup;
  /** Its things that meet one of the opened sector's things (or the area). */
  reach: number;
  /** Of those, the things with no box, counted by their position. */
  byPosition: number;
  variants: number;
  replaces: boolean;
  /** Metres from the middle of the focused sector's things to the middle of its streaming box. */
  distance: number;
  /** The first matches, for Why (matchLimit of them). */
  matches: OverlapMatch[];
  /** Its things whose boxes were left out. */
  leftOut: number;
}

/** What a search was, for Copy Diagnostics and the tab's note. */
export interface OverlapQuery {
  sector: string;
  scope: "sector" | "area";
  area?: Box;
  margin: number;
  helpers: boolean;
  proxies: boolean;
  /** The opened sector's things that make the footprint (0 for an area). */
  footprint: number;
  /** Of the opened sector's things: with a box, by position only, left out. */
  things: { total: number; boxes: number; byPosition: number; leftOut: number };
  /** The opened sector's things left out, with why. */
  leftOut: LeftOutThing[];
  /** The box candidates were found by (the footprint's extent, or the area). */
  box: Box | null;
  /** Sectors whose streaming box meets that box, read to test. */
  candidates: number;
  /** How the candidates were found: by streaming boxes until the world index is built. */
  via: "streaming";
}

export interface OverlapOptions {
  /** A folder of its own: each sector's things' boxes are kept there, so a place is slow only the first time. */
  cacheDir: string;
  /** Each sector found to reach in, as it is found (nearest first within a group). */
  onLayer?(layer: OverlapLayer): void;
  onProgress?(done: number, total: number): void;
  /** True stops the search between sectors. */
  stopped?(): boolean;
  /** Metres every footprint box (or the area) grows by: Nearby. 0, the strict test, by default. */
  margin?: number;
  /** Helpers (occluders, collision, areas...) take part, on both sides. Off by default. */
  helpers?: boolean;
  /** Proxies take part, on both sides. Off by default. */
  proxies?: boolean;
  /** Search this box (game axes, Z up) instead of the sector's footprint: Area. */
  area?: Box | null;
  /** How many matches each layer keeps for Why; 50 by default. */
  matchLimit?: number;
  /** The search as set up, once its footprint is known and before the candidates are read. */
  onQuery?(query: OverlapQuery): void;
}

const GroupOrder: OverlapGroup[] = ["neighbours", "levels", "interiors", "exteriors", "other", "global"];

/**
 * A sector's things, kept per sector in the cache (version 2: 1 kept boxes and positions only). Per thing i:
 * e[i] its node data entry, c[i] its class (an index into classes), r[i] its file (an index into resources, -1
 * for none), f[i] flags (ThingFlag), and six numbers at b[6i]: its box, or its position twice when it has none.
 * A number that is not one (NaN or infinite in REDbridge's answer) is stored as null.
 */
interface ThingTable {
  v: 2;
  classes: string[];
  resources: string[];
  e: number[];
  c: number[];
  r: number[];
  f: number[];
  b: (number | null)[];
}

const ThingFlag = {
  /** b holds its box; else its position. */
  box: 1,
  /** Its node data places it at exactly 0, 0, 0. */
  origin: 2,
  /** REDbridge read its copies (an instanced mesh's group): its box covers them all. */
  copies: 4,
} as const;

/** Larger than this on any side, a box is taken as wrong. */
const MaxBoxSide = 2000;

const meetsBox = (a: Box, b: Box) => [0, 1, 2].every((i) => a.min[i] <= b.max[i] && a.max[i] >= b.min[i]);
const grown = (b: Box, m: number): Box => (m ? { min: b.min.map((v) => v - m), max: b.max.map((v) => v + m) } : b);

/** A sector's things, kept in cacheDir for a game sector (a project's or mod's copy is read each time). */
async function thingTable(bridge: Bridge, ref: SectorRef, cacheDir: string | null): Promise<ThingTable> {
  const file = cacheDir && !ref.root && !ref.archive ? path.join(cacheDir, `${createHash("sha1").update(ref.path.toLowerCase()).digest("hex").slice(0, 24)}-v2.json`) : null;
  if (file) {
    try {
      const t = JSON.parse(fs.readFileSync(file, "utf8")) as ThingTable;
      if (t.v === 2) return t;
    } catch {
      // Not read yet.
    }
  }
  const r = await bridge.request<{ items: SectorItem[] }>("sector.nodes", { path: ref.path, bounds: true, ...(ref.archive ? { archive: ref.archive } : {}), ...(ref.root ? { root: ref.root } : {}) });
  const out: ThingTable = { v: 2, classes: [], resources: [], e: [], c: [], r: [], f: [], b: [] };
  const classIndex = new Map<string, number>();
  const resourceIndex = new Map<string, number>();
  const indexIn = (map: Map<string, number>, list: string[], s: string) => {
    let n = map.get(s);
    if (n === undefined) {
      n = list.length;
      list.push(s);
      map.set(s, n);
    }
    return n;
  };
  const num = (v: number) => (Number.isFinite(v) ? Math.round(v * 100) / 100 : null);
  for (const i of r.items ?? []) {
    const p = i.transform.position.slice(0, 3);
    out.e.push(i.index);
    out.c.push(indexIn(classIndex, out.classes, i.kind));
    out.r.push(i.resource ? indexIn(resourceIndex, out.resources, i.resource) : -1);
    out.f.push((i.bounds ? ThingFlag.box : 0) | (p.every((v) => v === 0) ? ThingFlag.origin : 0) | (i.instances?.length ? ThingFlag.copies : 0));
    if (i.bounds) out.b.push(...i.bounds.min.slice(0, 3).map(num), ...i.bounds.max.slice(0, 3).map(num));
    else out.b.push(...p.map(num), ...p.map(num));
  }
  if (file) {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    // Written beside and renamed, so a cut-off write never leaves half a file.
    const part = `${file}.${process.pid}.part`;
    fs.writeFileSync(part, JSON.stringify(out));
    fs.renameSync(part, file);
  }
  return out;
}

/** One thing of a table, ready to test: its box (null when left out) and why it is left out. */
interface Thing extends OverlapThing {
  leftOut?: string;
}

function thingsOf(t: ThingTable): Thing[] {
  const out: Thing[] = [];
  for (let i = 0; i < t.e.length; i++) {
    const cls = t.classes[t.c[i]];
    const f = t.f[i];
    const raw = t.b.slice(i * 6, i * 6 + 6);
    const box: Box = { min: raw.slice(0, 3) as number[], max: raw.slice(3, 6) as number[] };
    const thing: Thing = { entry: t.e[i], class: cls, role: roleOf(cls), box, ...(t.r[i] >= 0 ? { resource: t.resources[t.r[i]] } : {}), ...(f & ThingFlag.box ? {} : { byPosition: true }), ...(f & ThingFlag.copies ? { group: true } : {}) };
    if (raw.some((v) => typeof v !== "number")) thing.leftOut = "its box is not a number";
    else if (box.min.some((v, k) => v > box.max[k])) thing.leftOut = "its box is inside out";
    else if (box.max.some((v, k) => v - box.min[k] > MaxBoxSide)) thing.leftOut = `its box is over ${MaxBoxSide / 1000} km`;
    // A node that keeps its places in a buffer REDbridge does not read (an occluder's copies): placed at the origin, its box is worked out there.
    else if (f & ThingFlag.origin && !(f & ThingFlag.copies) && /instanced/i.test(cls)) thing.leftOut = "placed at 0, 0, 0: its copies are in a buffer REDbridge does not read";
    out.push(thing);
  }
  return out;
}

/** Which things take part, by role. Unknown goes with detail. */
const takesPart = (t: Thing, helpers: boolean, proxies: boolean) => !t.leftOut && (t.role === "helper" ? helpers : t.role === "proxy" ? proxies : t.byPosition ? ByPositionClass.test(t.class.toLowerCase()) : true);

/** Boxes in a grid of square cells over the game's X and Y, so a test looks only at the boxes near it. Big boxes are kept apart and always looked at. */
class BoxGrid {
  private readonly cells = new Map<string, number[]>();
  private readonly big: number[] = [];
  constructor(
    readonly boxes: Box[],
    private readonly cell = 16,
    private readonly bigSide = 256,
  ) {
    boxes.forEach((b, i) => {
      if (b.max[0] - b.min[0] > bigSide || b.max[1] - b.min[1] > bigSide) {
        this.big.push(i);
        return;
      }
      for (const key of this.keys(b)) {
        const list = this.cells.get(key);
        if (list) list.push(i);
        else this.cells.set(key, [i]);
      }
    });
  }
  private *keys(b: Box) {
    const c = this.cell;
    for (let x = Math.floor(b.min[0] / c); x <= Math.floor(b.max[0] / c); x++) for (let y = Math.floor(b.min[1] / c); y <= Math.floor(b.max[1] / c); y++) yield `${x},${y}`;
  }
  /** The first box that meets b, or -1. */
  firstMeeting(b: Box): number {
    for (const i of this.big) if (meetsBox(this.boxes[i], b)) return i;
    // A box bigger than the grid is meant for: every box, once.
    if (b.max[0] - b.min[0] > this.bigSide || b.max[1] - b.min[1] > this.bigSide) return this.boxes.findIndex((x) => meetsBox(x, b));
    let best = -1;
    for (const key of this.keys(b)) for (const i of this.cells.get(key) ?? []) if ((best < 0 || i < best) && meetsBox(this.boxes[i], b)) best = i;
    return best;
  }
  /** The box around them all; null when there are none. */
  extent(): Box | null {
    if (!this.boxes.length) return null;
    const min = [Infinity, Infinity, Infinity];
    const max = [-Infinity, -Infinity, -Infinity];
    for (const b of this.boxes)
      for (let k = 0; k < 3; k++) {
        min[k] = Math.min(min[k], b.min[k]);
        max[k] = Math.max(max[k], b.max[k]);
      }
    return { min, max };
  }
}

/**
 * The sectors whose things reach into a sector (sector-overlaps.md, O1). The footprint is the sector's own
 * detail things, each by its own box (helpers and proxies only when asked, wrong boxes never), grown by the
 * margin; with an area, the area alone. A candidate is a sector whose streaming box meets the footprint's
 * extent; it is kept when one of its things (by the same roles) meets a footprint box, or, with no box of its
 * own, stands in one. Each kept sector carries its first matches, for Why. Groups in order: neighbours (same
 * kind and level), other levels, interiors or exteriors, other, and global (quest and always loaded) last;
 * nearest first within each.
 */
export async function findOverlaps(bridge: Bridge, sector: SectorRef | string, o: OverlapOptions): Promise<OverlapLayer[]> {
  const ref = typeof sector === "string" ? { path: sector } : sector;
  const margin = Math.max(0, o.margin ?? 0);
  const helpers = !!o.helpers;
  const proxies = !!o.proxies;
  const matchLimit = o.matchLimit ?? 50;
  const mine = thingsOf(await thingTable(bridge, ref, null));
  const footprintThings = o.area ? [] : mine.filter((t) => !t.byPosition && takesPart(t, helpers, proxies));
  const area: Box | null = o.area ? { min: o.area.min.slice(0, 3), max: o.area.max.slice(0, 3) } : null;
  const grid = new BoxGrid(area ? [grown(area, margin)] : footprintThings.map((t) => grown(t.box, margin)));
  const own = grid.extent();
  const leftOut = mine.filter((t) => t.leftOut).map((t) => ({ entry: t.entry, class: t.class, ...(t.resource ? { resource: t.resource } : {}), why: t.leftOut! }));
  const query: OverlapQuery = {
    sector: ref.path,
    scope: area ? "area" : "sector",
    ...(area ? { area } : {}),
    margin,
    helpers,
    proxies,
    footprint: footprintThings.length,
    things: { total: mine.length, boxes: mine.filter((t) => !t.byPosition && !t.leftOut).length, byPosition: mine.filter((t) => t.byPosition && !t.leftOut).length, leftOut: leftOut.length },
    leftOut,
    box: own,
    candidates: 0,
    via: "streaming",
  };
  if (!own) {
    o.onQuery?.(query);
    return [];
  }
  const all = await allSectors(bridge);
  const me = all.find((s) => s.path.toLowerCase() === ref.path.toLowerCase());
  const kind = me?.kind ?? "exterior";
  const level = me?.level ?? 0;
  const groupOf = (s: SectorInfo): OverlapGroup => {
    if (s.kind === "quest" || s.kind === "alwaysLoaded") return "global";
    if (s.kind === kind) return s.level === level ? "neighbours" : "levels";
    if (s.kind === "interior") return "interiors";
    if (s.kind === "exterior") return "exteriors";
    return "other";
  };
  const mid = (b: Box) => [0, 1, 2].map((i) => (b.min[i] + b.max[i]) / 2);
  const ownMid = mid(own);
  const byPath = new Map<string, SectorInfo>();
  for (const s of all) {
    const key = s.path.toLowerCase();
    if (key === ref.path.toLowerCase() || !meetsBox(s.box, own)) continue;
    const had = byPath.get(key);
    byPath.set(key, had ? { ...had, replaces: had.replaces || s.replaces } : s);
  }
  const candidates = [...byPath.values()]
    .map((s) => ({ s, group: groupOf(s), distance: Math.hypot(...mid(s.box).map((v, i) => v - ownMid[i])) }))
    .sort((a, b) => GroupOrder.indexOf(a.group) - GroupOrder.indexOf(b.group) || a.distance - b.distance);
  query.candidates = candidates.length;
  o.onQuery?.(query);
  /** A footprint box's thing, for Why: null for the area. */
  const footprintThing = (i: number): OverlapThing | null => {
    if (area) return null;
    const { leftOut: _l, ...t } = footprintThings[i];
    return t;
  };
  const found: OverlapLayer[] = [];
  let done = 0;
  o.onProgress?.(0, candidates.length);
  for (const c of candidates) {
    if (o.stopped?.()) break;
    let reach = 0;
    let byPosition = 0;
    let leftOutThere = 0;
    const matches: OverlapMatch[] = [];
    try {
      for (const t of thingsOf(await thingTable(bridge, { path: c.s.path }, o.cacheDir))) {
        if (t.leftOut) leftOutThere++;
        if (!takesPart(t, helpers, proxies)) continue;
        const hit = grid.firstMeeting(t.box);
        if (hit < 0) continue;
        reach++;
        if (t.byPosition) byPosition++;
        if (matches.length < matchLimit) {
          const { leftOut: _l, ...thing } = t;
          matches.push({ thing, meets: footprintThing(hit) });
        }
      }
    } catch {
      // A sector REDbridge cannot read is left out; the next look tries again.
    }
    done++;
    if (reach) {
      const layer: OverlapLayer = { path: c.s.path, kind: c.s.kind, level: c.s.level, group: c.group, reach, byPosition, variants: c.s.variants ?? 0, replaces: !!c.s.replaces, distance: Math.round(c.distance), matches, leftOut: leftOutThere };
      found.push(layer);
      o.onLayer?.(layer);
    }
    o.onProgress?.(done, candidates.length);
  }
  return found;
}

// ---- one object, on demand ---------------------------------------------------------------------

/** The cache folder for a mod's loose files under root, kept apart from the game's files of the same paths. */
const looseCacheOf = (cacheDir: string, root: string) => path.join(cacheDir, "loose", Buffer.from(path.resolve(root).toLowerCase()).toString("base64url").slice(0, 40));

/**
 * The plain .glb the loader exported for a mesh, when it is in the cache: the same parts and UVs a renderer's
 * maps go on, so a picked thing needs no second export. A mod's own mesh's, while it is newer than its file.
 */
export function cachedGlb(cacheDir: string, mesh: string, from?: SectorRef): string | undefined {
  const loose = looseFile(from, mesh);
  const out = meshGlbPath(loose ? looseCacheOf(cacheDir, from!.root!) : cacheDir, mesh);
  if (!fs.existsSync(out)) return undefined;
  return !loose || fs.statSync(out).mtimeMs > fs.statSync(loose).mtimeMs ? out : undefined;
}

/** A mod's own copy of a game path under root, when it has one. */
const looseFile = (from: SectorRef | undefined, gamePath: string) => {
  if (!from?.root) return undefined;
  const file = path.join(from.root, ...gamePath.split(/[\\/]/));
  return fs.existsSync(file) ? file : undefined;
};

/**
 * A mesh with its materials and textures, for the one object picked; cached under cacheDir/textured. A
 * mod's own mesh (from.root) is exported from its file, and again whenever the file is newer.
 */
export async function texturedGlb(bridge: Bridge, mesh: string, cacheDir: string, from?: SectorRef): Promise<string> {
  const options = { meshBinary: true, meshMaterials: true, meshLodFilter: true };
  const loose = looseFile(from, mesh);
  if (loose) {
    const dir = path.join(looseCacheOf(cacheDir, from!.root!), "textured");
    const out = meshGlbPath(dir, mesh);
    if (fs.existsSync(out) && fs.statSync(out).mtimeMs > fs.statSync(loose).mtimeMs) return out;
    await bridge.request("project.export", { file: loose, archiveDir: from!.root!, rawDir: path.join(dir, "raw"), options });
    if (!fs.existsSync(out)) throw new Error(`WolvenKit wrote no .glb for ${mesh}`);
    return out;
  }
  const dir = path.join(cacheDir, "textured");
  const out = meshGlbPath(dir, mesh);
  if (fs.existsSync(out)) return out;
  const archiveDir = path.join(dir, "archive");
  const file = path.join(archiveDir, ...mesh.split(/[\\/]/));
  if (!fs.existsSync(file)) {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    await extractMesh(bridge, mesh, file, from);
  }
  await bridge.request("project.export", { file, archiveDir, rawDir: path.join(dir, "raw"), options });
  if (!fs.existsSync(out)) throw new Error(`WolvenKit wrote no .glb for ${mesh}`);
  return out;
}

/** A game file into outFile: from the game, or from a mod's archive when the game has none. */
async function extractMesh(bridge: Bridge, mesh: string, outFile: string, from?: SectorRef): Promise<void> {
  try {
    await bridge.request("archive.extract", { path: mesh, outFile });
  } catch (e) {
    if (!from?.archive) throw e;
    await bridge.request("archive.extractFromMod", { archive: from.archive, items: [{ path: mesh, outFile }] });
  }
  if (!fs.existsSync(outFile)) throw new Error(`${mesh} is in neither the game nor the mod`);
}

/** A mesh appearance: its name and the material it names for each submesh, by submesh index. */
export interface MeshAppearance {
  name: string;
  chunkMaterials: string[];
}

interface NodeDto {
  value?: unknown;
  total?: number | null;
  children?: { value?: unknown }[] | null;
}

const text = (v: unknown) => (v && typeof v === "object" && "$value" in v ? String((v as { $value: unknown }).$value ?? "") : String(v ?? ""));

/**
 * A mesh's appearances with the material each names per submesh, read once through cr2w.open and kept beside
 * the mesh's file in the cache as .materials.json. For colouring by material and for a picked thing's panel;
 * a plain export names every material "Default", so the names come from the mesh file itself.
 */
export async function meshMaterials(bridge: Bridge, cacheDir: string, mesh: string, from?: SectorRef): Promise<MeshAppearance[]> {
  const loose = looseFile(from, mesh);
  const base = loose ? looseCacheOf(cacheDir, from!.root!) : cacheDir;
  const sidecar = path.join(base, "materials", ...mesh.split(/[\\/]/)) + ".json";
  if (fs.existsSync(sidecar) && (!loose || fs.statSync(sidecar).mtimeMs > fs.statSync(loose).mtimeMs)) {
    try {
      return JSON.parse(fs.readFileSync(sidecar, "utf8")) as MeshAppearance[];
    } catch {
      // Read again below.
    }
  }
  let file = loose;
  if (!file) {
    file = path.join(cacheDir, "archive", ...mesh.split(/[\\/]/));
    if (!fs.existsSync(file)) {
      fs.mkdirSync(path.dirname(file), { recursive: true });
      await extractMesh(bridge, mesh, file, from);
    }
  }
  const { doc } = await bridge.request<{ doc: string }>("cr2w.open", { file });
  const out: MeshAppearance[] = [];
  try {
    const list = await bridge.request<NodeDto>("cr2w.getNode", { doc, path: "appearances", offset: 0, limit: 1000 });
    const count = list.total ?? list.children?.length ?? 0;
    if (count > 0) {
      const paths = Array.from({ length: count }, (_, i) => [`appearances.${i}.Data.name`, `appearances.${i}.Data.chunkMaterials`]).flat();
      const nodes = await bridge.request<NodeDto[]>("cr2w.getNodes", { doc, paths, limit: 1000 });
      for (let i = 0; i < count; i++) out.push({ name: text(nodes[i * 2]?.value), chunkMaterials: (nodes[i * 2 + 1]?.children ?? []).map((c) => text(c.value)) });
    }
  } finally {
    await bridge.request("cr2w.close", { doc }).catch(() => undefined);
  }
  fs.mkdirSync(path.dirname(sidecar), { recursive: true });
  fs.writeFileSync(sidecar, JSON.stringify(out));
  return out;
}

/** The appearance a placement shows: by name, else the first, as for "default" or none (unverified for a "default" the mesh lacks). */
export function appearanceOf(appearances: MeshAppearance[], name?: string | null): MeshAppearance | undefined {
  const lower = (name ?? "").toLowerCase();
  return appearances.find((a) => a.name.toLowerCase() === lower) ?? appearances[0];
}

/** An entity in one appearance ("default" for its first), every mesh on one skeleton, no materials; cached under cacheDir/entities. */
export async function entityGlb(bridge: Bridge, ent: string, appearance: string, cacheDir: string): Promise<string> {
  const safe = (appearance || "default").replace(/[^A-Za-z0-9_.-]+/g, "_");
  const dir = path.join(cacheDir, "entities", safe);
  const out = path.join(dir, "raw", ...ent.split(/[\\/]/)) + ".glb";
  if (fs.existsSync(out)) return out;
  const archiveDir = path.join(dir, "archive");
  const file = path.join(archiveDir, ...ent.split(/[\\/]/));
  if (!fs.existsSync(file)) {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    await bridge.request("archive.extract", { path: ent, outFile: file });
  }
  await bridge.request("project.export", { file, archiveDir, rawDir: path.join(dir, "raw"), options: { appearance: appearance || "default", meshMaterials: false } });
  if (!fs.existsSync(out)) throw new Error(`WolvenKit wrote no .glb for ${ent}`);
  return out;
}
