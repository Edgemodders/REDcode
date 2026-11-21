// @edgemodders/world-view, the host half (docs/design/sector-view.md in REDcode, the API agreed with
// EDGEbuilder in EDGEbuilder #8): the game's streaming sectors as meshes and markers for the page half.
// It asks REDbridge for a sector's items (sector.nodes), exports each unique mesh once into a cache folder
// it is given, and hands the page each mesh with all its placements in that sector. Node only; no
// VS Code and no REDnode imports, so REDcode's extension and EDGEbuilder's Node mod both use it.

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
