// EDGEworld: Open Sector Here (docs/design/sector-layers.md, L4): the sector V stands in, and the thing
// nearest V in it. The interior sector when V is inside one, else the level 0 exterior. No VS Code
// imports, so scripts/unit.mjs runs it against a stand-in bridge.

type Vec = [number, number, number];
type Box = { min: number[]; max: number[] };

/** A bridge call: REDbridge's method and parameters, its answer. */
export type BridgeCall = (method: string, params: Record<string, unknown>) => Promise<unknown>;

interface FoundSector {
  path: string;
  kind: string;
  level: number;
  box: Box;
}

interface Placement {
  position: number[];
}

interface NodeItem {
  index: number;
  kind: string;
  resource?: string | null;
  transform: Placement;
  instances?: Placement[] | null;
  bounds?: Box | null;
}

export interface SectorHere {
  /** The sector's game path. */
  sector: string;
  kind: "interior" | "exterior";
  /** The node data entry nearest V, when the sector has any. */
  entry?: number;
  /** How far that thing is from V, in metres. */
  distance?: number;
}

/** How many interiors around V are read to see whether V is inside one: the smallest first. */
const InteriorsRead = 6;

const volume = (b: Box) => (b.max[0] - b.min[0]) * (b.max[1] - b.min[1]) * (b.max[2] - b.min[2]);
const centre = (b: Box) => [0, 1, 2].map((i) => (b.min[i] + b.max[i]) / 2);

/** Metres from a point to a box, 0 inside it. */
function toBox(p: Vec, b: Box): number {
  let d = 0;
  for (let i = 0; i < 3; i++) {
    const e = Math.max(b.min[i] - p[i], 0, p[i] - b.max[i]);
    d += e * e;
  }
  return Math.sqrt(d);
}

const toPoint = (p: Vec, q: number[]) => Math.hypot(p[0] - q[0], p[1] - q[1], p[2] - q[2]);

/** How far a thing is from V: its box when it has one, else the nearest of its copies, else its place. */
function distanceOf(p: Vec, item: NodeItem): number {
  if (item.bounds) return toBox(p, item.bounds);
  if (item.instances?.length) return Math.min(...item.instances.map((x) => toPoint(p, x.position)));
  return toPoint(p, item.transform.position);
}

/** The box around a sector's things: their boxes, else their places. Undefined for an empty sector. */
export function thingsBox(items: NodeItem[]): Box | undefined {
  const min = [Infinity, Infinity, Infinity];
  const max = [-Infinity, -Infinity, -Infinity];
  const add = (q: number[]) => {
    for (let i = 0; i < 3; i++) {
      min[i] = Math.min(min[i], q[i]);
      max[i] = Math.max(max[i], q[i]);
    }
  };
  for (const item of items) {
    if (item.bounds) {
      add(item.bounds.min);
      add(item.bounds.max);
    } else if (item.instances?.length) for (const x of item.instances) add(x.position);
    else add(item.transform.position);
  }
  return Number.isFinite(min[0]) ? { min, max } : undefined;
}

/** The thing nearest V: one that shows a resource (a mesh, an entity) when there is any, else any. */
export function nearestThing(p: Vec, items: NodeItem[]): { entry: number; distance: number } | undefined {
  const pool = items.some((x) => x.resource) ? items.filter((x) => x.resource) : items;
  let best: { entry: number; distance: number } | undefined;
  for (const item of pool) {
    const distance = distanceOf(p, item);
    if (!best || distance < best.distance) best = { entry: item.index, distance };
  }
  return best;
}

/**
 * The sector V stands in. An interior counts when V is inside the box around its things (half a metre
 * more each way, two up for the head); the smallest such interior wins. Otherwise the level 0 exterior
 * whose streaming box's middle is nearest V across the ground.
 */
export async function sectorHere(call: BridgeCall, at: Vec): Promise<SectorHere> {
  const r = (await call("sector.find", { kinds: ["interior", "exterior"], box: { min: at.map((x) => x - 1), max: at.map((x) => x + 1) } })) as { sectors: FoundSector[] };
  const sectors = r.sectors ?? [];
  const nodesOf = async (sector: string) => ((await call("sector.nodes", { path: sector })) as { items: NodeItem[] }).items ?? [];
  const interiors = sectors.filter((s) => s.kind === "interior").sort((a, b) => volume(a.box) - volume(b.box)).slice(0, InteriorsRead);
  for (const s of interiors) {
    const items = await nodesOf(s.path);
    const box = thingsBox(items);
    if (!box) continue;
    const grown = { min: [box.min[0] - 0.5, box.min[1] - 0.5, box.min[2] - 0.5], max: [box.max[0] + 0.5, box.max[1] + 0.5, box.max[2] + 2] };
    if (toBox(at, grown) > 0) continue;
    return { sector: s.path, kind: "interior", ...nearestThing(at, items) };
  }
  const exteriors = sectors.filter((s) => s.kind === "exterior" && s.level === 0);
  if (!exteriors.length) throw new Error(`No sector of the game's holds V's place (${at.map((x) => x.toFixed(1)).join(", ")}).`);
  const across = (s: FoundSector) => {
    const c = centre(s.box);
    return Math.hypot(c[0] - at[0], c[1] - at[1]);
  };
  const s = exteriors.reduce((a, b) => (across(b) < across(a) ? b : a));
  return { sector: s.path, kind: "exterior", ...nearestThing(at, await nodesOf(s.path)) };
}
