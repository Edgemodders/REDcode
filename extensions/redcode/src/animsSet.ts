// Animations A3, synced sets (docs/design/animation.md): the clips of one synced moment across the
// .anims files of a folder, and where each member stands relative to the others. A synced clip is named
// synced__<moment>__<role>; each member starts at its own origin, and its buffer holds one extra joint
// per partner, syncTrajectory, syncTrajectory1, ..., the partner's Root as seen from its own Root at the
// same moment (REDbridge 0.17.0's anims.sync). A track's partner is the member that, placed from the
// track, stays in one place through the clip. No VS Code imports.

import * as fs from "node:fs";
import { animsGlbFor, readAnimsGlb, type AnimsGlb } from "./animsGlb";
import type { BridgeClient } from "./bridgeClient";
import type { ExportSource } from "./exportCache";

// ---- rigid transforms (no scale: the tracks and roots carry none) --------------------------------

export type Vec3 = [number, number, number];
export type Quat = [number, number, number, number];
export interface Rigid {
  p: Vec3;
  q: Quat;
}

export const Identity: Rigid = { p: [0, 0, 0], q: [0, 0, 0, 1] };

function qmul(a: Quat, b: Quat): Quat {
  return [
    a[3] * b[0] + a[0] * b[3] + a[1] * b[2] - a[2] * b[1],
    a[3] * b[1] - a[0] * b[2] + a[1] * b[3] + a[2] * b[0],
    a[3] * b[2] + a[0] * b[1] - a[1] * b[0] + a[2] * b[3],
    a[3] * b[3] - a[0] * b[0] - a[1] * b[1] - a[2] * b[2],
  ];
}

const conj = (q: Quat): Quat => [-q[0], -q[1], -q[2], q[3]];

function rotate(q: Quat, v: Vec3): Vec3 {
  const r = qmul(qmul(q, [v[0], v[1], v[2], 0]), conj(q));
  return [r[0], r[1], r[2]];
}

/** a then b: b in a's frame. */
export function mul(a: Rigid, b: Rigid): Rigid {
  const r = rotate(a.q, b.p);
  return { p: [a.p[0] + r[0], a.p[1] + r[1], a.p[2] + r[2]], q: normalize(qmul(a.q, b.q)) };
}

export function inv(a: Rigid): Rigid {
  const c = conj(a.q);
  const r = rotate(c, a.p);
  return { p: [-r[0], -r[1], -r[2]], q: c };
}

function normalize(q: Quat): Quat {
  const n = Math.hypot(q[0], q[1], q[2], q[3]) || 1;
  return [q[0] / n, q[1] / n, q[2] / n, q[3] / n];
}

function slerp(a: Quat, b: Quat, t: number): Quat {
  let d = a[0] * b[0] + a[1] * b[1] + a[2] * b[2] + a[3] * b[3];
  const bb: Quat = d < 0 ? [-b[0], -b[1], -b[2], -b[3]] : b;
  d = Math.abs(d);
  if (d > 0.9995) return normalize([a[0] + (bb[0] - a[0]) * t, a[1] + (bb[1] - a[1]) * t, a[2] + (bb[2] - a[2]) * t, a[3] + (bb[3] - a[3]) * t]);
  const th = Math.acos(Math.min(1, d));
  const s = Math.sin(th);
  const wa = Math.sin((1 - t) * th) / s;
  const wb = Math.sin(t * th) / s;
  return [a[0] * wa + bb[0] * wb, a[1] * wa + bb[1] * wb, a[2] * wa + bb[2] * wb, a[3] * wa + bb[3] * wb];
}

/** The angle between two rotations, in radians. */
export function angleBetween(a: Quat, b: Quat): number {
  const d = Math.abs(a[0] * b[0] + a[1] * b[1] + a[2] * b[2] + a[3] * b[3]);
  return 2 * Math.acos(Math.min(1, d));
}

/** Rotation and place as a column-major 4x4 matrix, as three.js's Matrix4.fromArray takes it. */
export function toMatrix(r: Rigid): number[] {
  const [x, y, z, w] = r.q;
  const xx = x * x, yy = y * y, zz = z * z, xy = x * y, xz = x * z, yz = y * z, wx = w * x, wy = w * y, wz = w * z;
  return [1 - 2 * (yy + zz), 2 * (xy + wz), 2 * (xz - wy), 0, 2 * (xy - wz), 1 - 2 * (xx + zz), 2 * (yz + wx), 0, 2 * (xz + wy), 2 * (yz - wx), 1 - 2 * (xx + yy), 0, r.p[0], r.p[1], r.p[2], 1];
}

// ---- tracks ----------------------------------------------------------------------------------

/** Keys as anims.sync gives them, and as a GLB channel holds them: times in seconds, values in glTF axes. */
export interface Keys {
  times: number[];
  values: number[][];
}

export type Track = (t: number) => Rigid;

function sample(keys: Keys | undefined, t: number, rotation: boolean): number[] | undefined {
  if (!keys || keys.times.length === 0) return undefined;
  const { times, values } = keys;
  if (t <= times[0]) return values[0];
  for (let k = 1; k < times.length; k++) {
    if (t <= times[k]) {
      const a = (t - times[k - 1]) / (times[k] - times[k - 1] || 1);
      if (rotation) return slerp(values[k - 1] as Quat, values[k] as Quat, a);
      return values[k - 1].map((v, c) => v + (values[k][c] - v) * a);
    }
  }
  return values[values.length - 1];
}

/** A track from its translation and rotation keys; a missing part stays at the origin or unturned. */
export function track(translation?: Keys, rotation?: Keys): Track {
  return (t) => ({ p: (sample(translation, t, false) ?? [0, 0, 0]) as Vec3, q: normalize((sample(rotation, t, true) ?? [0, 0, 0, 1]) as Quat) });
}

// ---- the set ---------------------------------------------------------------------------------

/** A synced clip's moment and role, from its name; undefined for any other clip. */
export function syncedName(name: string): { moment: string; role: string } | undefined {
  const parts = name.split("__");
  if (parts[0].toLowerCase() !== "synced" || parts.length < 3) return undefined;
  const role = parts[parts.length - 1];
  const moment = parts.slice(1, -1).join("__");
  return moment && role ? { moment, role } : undefined;
}

/** One file's clips, as REDbridge's anims.info gives them. */
export interface SetFile {
  path: string;
  rig?: string | null;
  clips: { name: string; duration: number; buffer?: string }[];
}

export interface SetMember {
  /** The game path of its .anims. */
  file: string;
  clip: string;
  role: string;
  rig: string;
  duration: number;
  /** The same role in another file is an alternative (the player's male and female files): only one shows. */
  alternatives: number;
  /** The first of its role, or the opened clip: shown at first. */
  active: boolean;
  /** The opened clip. */
  self: boolean;
  /**
   * Its animation buffer, as anims.info says: "compressed" or "simd". A SIMD clip's export can be wrong
   * (found 2026-11-20: the player's synced__q001_00c_injector__fpp exports with every translation zero
   * and a 0.19 scale), so the view marks it.
   */
  buffer: string;
}

/** The members of the opened clip's moment, across the files given; empty when the clip is not synced. */
export function setMembers(files: SetFile[], opened: { file: string; clip: string }): SetMember[] {
  const own = syncedName(opened.clip);
  if (!own) return [];
  const moment = own.moment.toLowerCase();
  const out: SetMember[] = [];
  for (const f of files) {
    for (const c of f.clips) {
      const n = syncedName(c.name);
      if (!n || n.moment.toLowerCase() !== moment) continue;
      const self = f.path.toLowerCase() === opened.file.toLowerCase() && c.name === opened.clip;
      out.push({ file: f.path, clip: c.name, role: n.role, rig: f.rig ?? "", duration: c.duration, alternatives: 0, active: false, self, buffer: c.buffer ?? "" });
    }
  }
  if (!out.some((m) => m.self)) return [];
  const byRole = new Map<string, SetMember[]>();
  for (const m of out) {
    const k = m.role.toLowerCase();
    byRole.set(k, [...(byRole.get(k) ?? []), m]);
  }
  for (const group of byRole.values()) {
    for (const m of group) m.alternatives = group.length - 1;
    (group.find((m) => m.self) ?? group[0]).active = true;
  }
  // The opened clip first, then by role.
  return out.sort((a, b) => Number(b.self) - Number(a.self) || a.role.localeCompare(b.role) || a.file.localeCompare(b.file));
}

/** A member as the solve needs it: its root over time (root motion on), its sync tracks and its length. */
export interface SolveMember {
  id: number;
  duration: number;
  root: Track;
  tracks: { name: string; at: Track }[];
}

export interface Placement {
  /** Where the member's frame sits in the opened clip's frame. */
  placement: Rigid;
  /** Whose track placed it, as "<member id>.<track>" (from the placed member) or "<id>.<track>, reversed" (its own track to a placed one). */
  from: string;
  /** How far the placement wanders over the clip, in metres, at the median sample: about 0 for a good fit. */
  spread: number;
  /** Another member fitted the same track about as well: the placement may be wrong. */
  ambiguous: boolean;
}

const Samples = 9;
/** A fit's median spread must stay under this, in metres (a rotation counts 1 m per radian). */
const MaxSpread = 0.25;

function times(a: SolveMember, b: SolveMember): number[] {
  const end = Math.max(0, Math.min(a.duration, b.duration));
  return Array.from({ length: Samples }, (_, k) => (end * k) / (Samples - 1));
}

/** The placement that most samples agree on, and how far the samples stray from it at the median. */
function settle(ws: Rigid[]): { placement: Rigid; spread: number } {
  const dist = (a: Rigid, b: Rigid) => Math.hypot(a.p[0] - b.p[0], a.p[1] - b.p[1], a.p[2] - b.p[2]) + angleBetween(a.q, b.q);
  let best = ws[0];
  let bestSum = Infinity;
  for (const w of ws) {
    const sum = ws.reduce((s, o) => s + dist(w, o), 0);
    if (sum < bestSum) {
      bestSum = sum;
      best = w;
    }
  }
  const spreads = ws.map((w) => dist(w, best)).sort((x, y) => x - y);
  return { placement: best, spread: spreads[Math.floor(spreads.length / 2)] };
}

/**
 * Places the members relative to the anchor (the opened clip's member, at the origin). Each round takes
 * the best fit between a placed member and one not placed yet, through a track of either: the placed
 * member's track to it, or its own track to the placed one, reversed. A track is used for one partner
 * only. Members nothing fits stay out of the answer.
 */
export function solvePlacements(members: SolveMember[], anchor: number): Map<number, Placement> {
  const placed = new Map<number, Placement>([[anchor, { placement: Identity, from: "", spread: 0, ambiguous: false }]]);
  const used = new Set<string>();
  const byId = new Map(members.map((m) => [m.id, m]));
  if (!byId.has(anchor)) return new Map();
  for (;;) {
    type Fit = { a: number; b: number; key: string; from: string; reversed: boolean; placement: Rigid; spread: number; confirmed: boolean };
    const fits: Fit[] = [];
    for (const [aId, aPlace] of placed) {
      const a = byId.get(aId)!;
      for (const b of members) {
        if (placed.has(b.id)) continue;
        const ts = times(a, b);
        // The placed member's track to b: W_b = W_a . root_a . T . root_b^-1
        for (const t of a.tracks) {
          const key = `${a.id}.${t.name}`;
          if (used.has(key)) continue;
          const s = settle(ts.map((x) => mul(mul(mul(aPlace.placement, a.root(x)), t.at(x)), inv(b.root(x)))));
          fits.push({ a: a.id, b: b.id, key, from: key, reversed: false, ...s, confirmed: false });
        }
        // b's own track to a, reversed: W_b = W_a . root_a . T^-1 . root_b^-1
        for (const t of b.tracks) {
          const key = `${b.id}.${t.name}`;
          if (used.has(key)) continue;
          const s = settle(ts.map((x) => mul(mul(mul(aPlace.placement, a.root(x)), inv(t.at(x))), inv(b.root(x)))));
          fits.push({ a: a.id, b: b.id, key, from: `${key}, reversed`, reversed: true, ...s, confirmed: false });
        }
      }
    }
    const good = fits.filter((f) => f.spread <= MaxSpread);
    // Two members that move in step (soldiers boarding side by side) both stay put when placed from a
    // track meant for one of them. A fit that the pair's track from the other side agrees with is the
    // right one: prefer those.
    const same = (x: Rigid, y: Rigid) => Math.hypot(x.p[0] - y.p[0], x.p[1] - y.p[1], x.p[2] - y.p[2]) < 0.05 && angleBetween(x.q, y.q) < 0.035;
    for (const f of good) f.confirmed = good.some((g) => g !== f && g.a === f.a && g.b === f.b && g.reversed !== f.reversed && same(g.placement, f.placement));
    good.sort((x, y) => Number(y.confirmed) - Number(x.confirmed) || x.spread - y.spread);
    const best = good[0];
    if (!best) return placed;
    // Another member fitting the same track as well, with no track from the other side to tell them apart.
    const ambiguous = !best.confirmed && good.some((f) => f !== best && f.key === best.key && f.b !== best.b && f.spread - best.spread < 0.01);
    placed.set(best.b, { placement: best.placement, from: best.from, spread: best.spread, ambiguous });
    used.add(best.key);
    // The track from the other side that confirmed it belongs to the same pair.
    const pair = good.find((g) => g !== best && g.a === best.a && g.b === best.b && g.reversed !== best.reversed && same(g.placement, best.placement));
    if (best.confirmed && pair) used.add(pair.key);
  }
}

// ---- loading a set through REDbridge -----------------------------------------------------------

/** anims.sync's answer for one clip (REDbridge 0.17.0). */
export interface SyncClip {
  name: string;
  duration: number;
  frames: number;
  tracks: { name: string; translation: Keys; rotation: Keys }[];
  error?: string;
}

const NeedsBridge = 'Synced sets need REDbridge 0.17.0 or newer, for its anims.sync. Run "REDcode: Update REDbridge".';

function noMethod(e: unknown): boolean {
  const message = e instanceof Error ? e.message : String(e);
  return (e as { code?: unknown })?.code === -32601 || /method not found/i.test(message);
}

/** The .anims files directly in a game folder, by REDbridge's archive search. */
export async function siblingAnims(bridge: BridgeClient, gamePath: string): Promise<string[]> {
  const cut = gamePath.lastIndexOf("\\");
  const folder = cut >= 0 ? gamePath.slice(0, cut + 1) : "";
  if (!folder) return [gamePath];
  const found = await bridge.search(folder, 2000);
  const lower = folder.toLowerCase();
  const out = found.items
    .map((i) => i.name)
    .filter((n) => n.toLowerCase().startsWith(lower) && !n.slice(folder.length).includes("\\") && n.toLowerCase().endsWith(".anims"));
  if (!out.some((n) => n.toLowerCase() === gamePath.toLowerCase())) out.push(gamePath);
  return out;
}

/**
 * The members of an opened synced clip's moment, across the .anims files of its game folder (REDbridge
 * 0.14.0's anims.info reads their clips without decoding them). Empty when the clip is not synced.
 */
export async function listSet(bridge: BridgeClient, gamePath: string, clip: string): Promise<SetMember[]> {
  if (!syncedName(clip)) return [];
  const files = await siblingAnims(bridge, gamePath);
  let info: { items: SetFile[] };
  try {
    info = await bridge.request<{ items: SetFile[] }>("anims.info", { files });
  } catch (e) {
    if (noMethod(e)) throw new Error(NeedsBridge);
    throw e;
  }
  return setMembers(info.items.filter((f) => Array.isArray(f.clips)), { file: gamePath, clip });
}

/** What one page keeps while a set plays: each file's export with root motion, and its sync tracks. */
export interface SetSession {
  glbs: Map<string, AnimsGlb>;
  syncs: Map<string, SyncClip[]>;
}

export const newSetSession = (): SetSession => ({ glbs: new Map(), syncs: new Map() });

/** A member's source: the opened document's own (a project's copy, or unsaved-to-disk game file) for the opened clip, else the game's file. */
export type MemberSource = (m: SetMember) => ExportSource;

/** The export with root motion of a member's file, kept in the session. */
export async function memberGlb(bridge: BridgeClient, cacheRoot: string, session: SetSession, m: SetMember, source: MemberSource): Promise<AnimsGlb> {
  const key = m.file.toLowerCase() + (m.self ? "|self" : "");
  const known = session.glbs.get(key);
  if (known) return known;
  const glb = readAnimsGlb((await animsGlbFor(bridge, cacheRoot, source(m), true)).glb);
  session.glbs.set(key, glb);
  return glb;
}

async function memberSync(bridge: BridgeClient, session: SetSession, m: SetMember, source: MemberSource): Promise<SyncClip | undefined> {
  const key = m.file.toLowerCase() + (m.self ? "|self" : "");
  let clips = session.syncs.get(key);
  if (!clips) {
    const s = source(m);
    try {
      clips = (await bridge.request<{ clips: SyncClip[] }>("anims.sync", { path: s.gamePath ?? s.file })).clips;
    } catch (e) {
      if (noMethod(e)) throw new Error(NeedsBridge);
      throw e;
    }
    session.syncs.set(key, clips);
  }
  return clips.find((c) => c.name === m.clip);
}

/**
 * Root keys in seconds. REDbridge 0.17.0 writes a spline clip's root motion in seconds; an export from an
 * older one kept fractions of the clip (WolvenKit issue 3304), which are stretched here.
 */
export function inSeconds(keys: Keys | undefined, duration: number): Keys | undefined {
  if (!keys || keys.times.length < 2) return keys;
  const last = keys.times[keys.times.length - 1];
  return last <= 1.0001 && duration > 1.5 && Math.abs(duration - last) > Math.abs(1 - last) ? { times: keys.times.map((t) => t * duration), values: keys.values } : keys;
}

/** Where each member of members (those in include, by index) stands relative to the opened one. */
export async function placeSet(
  bridge: BridgeClient,
  cacheRoot: string,
  session: SetSession,
  members: SetMember[],
  include: number[],
  source: MemberSource,
): Promise<{ index: number; placement?: Placement; problem?: string }[]> {
  const anchor = members.findIndex((m) => m.self);
  if (anchor < 0) throw new Error("The opened animation is not in its set");
  const ids = [...new Set([anchor, ...include])].filter((i) => members[i]);
  const solve: SolveMember[] = [];
  const problems = new Map<number, string>();
  for (const i of ids) {
    const m = members[i];
    try {
      const glb = await memberGlb(bridge, cacheRoot, session, m, source);
      const sync = await memberSync(bridge, session, m, source);
      if (sync?.error) problems.set(i, sync.error);
      const root = rootKeys(glb, m.clip);
      solve.push({
        id: i,
        duration: m.duration,
        root: track(inSeconds(root.translation, m.duration), inSeconds(root.rotation, m.duration)),
        tracks: (sync?.tracks ?? []).map((t) => ({ name: t.name, at: track(t.translation, t.rotation) })),
      });
    } catch (e) {
      if (e instanceof Error && e.message === NeedsBridge) throw e;
      problems.set(i, e instanceof Error ? e.message : String(e));
    }
  }
  const placed = solvePlacements(solve, anchor);
  return ids.map((index) => {
    const placement = placed.get(index);
    const problem = problems.get(index) ?? (placement ? undefined : "No sync track places it: none of the other members' tracks keeps it in one place");
    return { index, ...(placement ? { placement } : {}), ...(problem && !placement ? { problem } : {}) };
  });
}

// ---- the Root's keys from an exported .anims ---------------------------------------------------

/** The Root node's keys in one animation of an exported .anims (with root motion), read from the file. */
export function rootKeys(glb: AnimsGlb, clip: string): { translation?: Keys; rotation?: Keys } {
  const json = glb.json;
  const root = ((json.nodes ?? []) as { name?: string }[]).findIndex((n) => n?.name === "Root");
  const animation = (json.animations ?? []).find((a) => a.name === clip);
  if (root < 0 || !animation || glb.binOffset < 0) return {};
  const accessors = json.accessors ?? [];
  const views = json.bufferViews ?? [];
  const fd = fs.openSync(glb.file, "r");
  try {
    const read = (index: number, width: number): number[][] => {
      const a = accessors[index];
      const v = a?.bufferView !== undefined ? views[a.bufferView] : undefined;
      if (!a || !v || a.componentType !== 5126) return [];
      const stride = v.byteStride ?? width * 4;
      const bytes = Buffer.alloc(stride * (a.count - 1) + width * 4);
      fs.readSync(fd, bytes, 0, bytes.length, glb.binOffset + (v.byteOffset ?? 0) + (a.byteOffset ?? 0));
      return Array.from({ length: a.count }, (_, k) => Array.from({ length: width }, (_, c) => bytes.readFloatLE(k * stride + c * 4)));
    };
    const out: { translation?: Keys; rotation?: Keys } = {};
    for (const ch of animation.channels) {
      if (ch.target.node !== root || (ch.target.path !== "translation" && ch.target.path !== "rotation")) continue;
      const s = animation.samplers[ch.sampler];
      const keys = { times: read(s.input, 1).map((x) => x[0]), values: read(s.output, ch.target.path === "rotation" ? 4 : 3) };
      out[ch.target.path] = keys;
    }
    return out;
  } finally {
    fs.closeSync(fd);
  }
}
