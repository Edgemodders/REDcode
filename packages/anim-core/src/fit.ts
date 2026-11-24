// The fit (REDcode's Probe D, 2026-11-22): a motion already on the game's skeleton (Uthana's, retargeted onto a
// stand-in with the game's bone names and rest pose, or a GLB from Blender on the game's rig) onto the nodes of a
// game clip on the same rig, as WolvenKit's import and the game want it:
// - every channel the game clip has: the game needs each bone's translation keyed as well as its rotation (run 1
//   in the game warped the body with translation on Hips alone, where REDcode's view fell back on the rest pose);
// - the motion's rotation on every bone and its translation on Root and Hips; the rig's rest value elsewhere;
// - the hips lifted until the lowest heel or toe is as high as the game clip's (Uthana stands the heel joints on
//   its floor, the game keeps them about 3 cm up: run 2 sank a little);
// - WolvenKit's extras from the game clip, its float tracks held constant, no fallback frames and no events (a new
//   clip pointing into a set's fallback tables crashed the game in Probe A).

import { readAccessor, writeGlb, type Glb, type GlbAccessor, type GlbBufferView, type GlbNode } from "./glb";

interface Channel {
  node: string;
  path: string;
  interpolation: string;
  times: number[];
  values: number[][];
}

export interface FitReport {
  /** Seconds. */
  duration: number;
  frames: number;
  channels: { written: number; fromMotion: number; fromRest: number };
  /** Bones the game clip animates that the motion's file lacks (they hold their rest pose). */
  missingBones: string[];
  /** The largest rest pose difference between the motion's file and the rig, in degrees, and on which bone. */
  restDifference: { bone: string; degrees: number };
  /** Metres: where the lowest heel or toe was, where the game clip's is, and how much the hips were lifted. */
  grounding: { motionLowest: number; gameLowest: number; lift: number };
  /** Degrees the motion was turned about the vertical so its first frame faces as the game clip does. */
  facing: number;
  /**
   * Metres, with inPlace: how far the motion travelled from its first frame to its last (taken out), and the
   * largest sway or step kept on the hips. A large net means the motion walks somewhere: in place, its feet slide.
   */
  travel?: { net: number; kept: number };
}

export interface FitOptions {
  /** Lift the hips to the game clip's foot height (default true). */
  ground?: boolean;
  /** Turn the motion to face as the game clip does at its first frame (default true). */
  face?: boolean;
  /**
   * Keep the character where it stands (default false): the Root's travel across the floor is taken out as a
   * straight line from the first frame to the last, and the rest of it, the body's sway and steps, goes onto the
   * hips. So the clip starts and ends where the character stands, and the hips and feet move as the motion made
   * them. Uthana's own in_place holds the hips still instead, so the feet slide whenever the body shifts its
   * weight (AT3 run 2, 2026-11-24: both feet slid 18 cm together; 0.6 cm in the same motion with its travel).
   */
  inPlace?: boolean;
}

// ---- quaternions [x, y, z, w] ----
const qmul = (a: number[], b: number[]) => [
  a[3] * b[0] + a[0] * b[3] + a[1] * b[2] - a[2] * b[1],
  a[3] * b[1] - a[0] * b[2] + a[1] * b[3] + a[2] * b[0],
  a[3] * b[2] + a[0] * b[1] - a[1] * b[0] + a[2] * b[3],
  a[3] * b[3] - a[0] * b[0] - a[1] * b[1] - a[2] * b[2],
];
const qconj = (q: number[]) => [-q[0], -q[1], -q[2], q[3]];
const qrot = (q: number[], v: number[]) => qmul(qmul(q, [v[0], v[1], v[2], 0]), qconj(q)).slice(0, 3);
const qnorm = (q: number[]) => {
  const n = Math.hypot(q[0], q[1], q[2], q[3]) || 1;
  return q.map((x) => x / n);
};

/** The world rotation of a node at the first key: its parents' first keys (or rest) and its own. */
function worldRotationAtStart(nodes: GlbNode[], channels: Channel[], name: string): number[] {
  const parent = new Map<number, number>();
  nodes.forEach((n, i) => (n.children ?? []).forEach((c) => parent.set(c, i)));
  const chain: number[] = [];
  for (let i: number | undefined = nodes.findIndex((n) => n.name === name); i !== undefined && i >= 0; i = parent.get(i)) chain.unshift(i);
  let q = [0, 0, 0, 1];
  for (const i of chain) {
    const ch = channels.find((c) => c.node === nodes[i].name && c.path === "rotation");
    q = qmul(q, ch?.values[0] ?? nodes[i].rotation ?? [0, 0, 0, 1]);
  }
  return qnorm(q);
}

/** Degrees about the world's vertical (glTF Y) that turn the motion's starting hips to face as the game clip's do. */
function yawBetween(nodes: GlbNode[], game: Channel[], motion: Channel[]): number {
  const relative = qmul(worldRotationAtStart(nodes, game, "Hips"), qconj(worldRotationAtStart(nodes, motion, "Hips")));
  // The relative turn is nearly about the vertical when both stand: its yaw, from where it takes a level vector.
  const v = qrot(relative, [1, 0, 0]);
  return (Math.atan2(-v[2], v[0]) * 180) / Math.PI;
}

/** Turns the hips' rotation and travel by degrees about the world's vertical, expressed in the hips' parent space. */
function turnMotion(nodes: GlbNode[], channels: Channel[], degrees: number): void {
  const half = (degrees * Math.PI) / 360;
  const world = [0, Math.sin(half), 0, Math.cos(half)];
  // The hips' parent (Root, under Armature) at the start: the turn in its space.
  const parentIndex = nodes.findIndex((n) => (n.children ?? []).some((c) => nodes[c].name === "Hips"));
  const parent = parentIndex >= 0 ? worldRotationAtStart(nodes, channels, nodes[parentIndex].name!) : [0, 0, 0, 1];
  const local = qnorm(qmul(qmul(qconj(parent), world), parent));
  for (let k = 0; k < channels.length; k++) {
    const c = channels[k];
    if (c.node !== "Hips") continue;
    if (c.path === "rotation") channels[k] = { ...c, values: c.values.map((q) => qnorm(qmul(local, q))) };
    else if (c.path === "translation") channels[k] = { ...c, values: c.values.map((t) => qrot(local, t)) };
  }
}

/**
 * In place (FitOptions.inPlace): the Root's travel across the floor, less a straight line from its first frame to
 * its last, moved onto the hips; the Root keeps only its height. The hips' world place is Root.t + Root.r * Hips.t,
 * so the hips get Root.r⁻¹ * what is kept.
 */
function travelInPlace(nodes: GlbNode[], channels: Channel[]): { net: number; kept: number } | undefined {
  const rootT = channels.findIndex((c) => c.node === "Root" && c.path === "translation");
  const hipsT = channels.findIndex((c) => c.node === "Hips" && c.path === "translation");
  if (rootT < 0 || hipsT < 0) return undefined;
  const rootR = channels.find((c) => c.node === "Root" && c.path === "rotation");
  const rootIndex = nodes.findIndex((n) => n.name === "Root");
  const parentIndex = nodes.findIndex((n) => (n.children ?? []).includes(rootIndex));
  // The world's up (glTF Y) in the Root's parent space.
  const parentRot = parentIndex >= 0 ? worldRotationAtStart(nodes, channels, nodes[parentIndex].name!) : [0, 0, 0, 1];
  const up = qrot(qconj(parentRot), [0, 1, 0]);
  const level = (v: number[]) => {
    const d = v[0] * up[0] + v[1] * up[1] + v[2] * up[2];
    return [v[0] - d * up[0], v[1] - d * up[1], v[2] - d * up[2]];
  };
  const r = channels[rootT];
  const h = channels[hipsT];
  const n = r.values.length;
  if (n < 2) return { net: 0, kept: 0 };
  const sample = (c: Channel | undefined, i: number, rest: number[]) => (c ? c.values[Math.min(c.values.length - 1, Math.round((i * (c.values.length - 1)) / (n - 1)))] : rest);
  const start = level(r.values[0]);
  const end = level(r.values[n - 1]);
  const t0 = r.times[0];
  const span = r.times[n - 1] - t0 || 1;
  let kept = 0;
  const rootValues: number[][] = [];
  const keptAt: number[][] = [];
  for (let i = 0; i < n; i++) {
    const f = (r.times[i] - t0) / span;
    const flat = level(r.values[i]);
    const rest = flat.map((v, k) => v - (start[k] + (end[k] - start[k]) * f));
    kept = Math.max(kept, Math.hypot(rest[0], rest[1], rest[2]));
    rootValues.push(r.values[i].map((v, k) => v - flat[k]));
    keptAt.push(rest);
  }
  const rootRest = nodes[rootIndex]?.rotation ?? [0, 0, 0, 1];
  const hipsValues = h.values.map((v, j) => {
    const i = Math.min(n - 1, Math.round((j * (n - 1)) / Math.max(1, h.values.length - 1)));
    const add = qrot(qconj(qnorm(sample(rootR, i, rootRest))), keptAt[i]);
    return [v[0] + add[0], v[1] + add[1], v[2] + add[2]];
  });
  channels[rootT] = { ...r, values: rootValues };
  channels[hipsT] = { ...h, values: hipsValues };
  return { net: Math.hypot(end[0] - start[0], end[1] - start[1], end[2] - start[2]), kept };
}

const quatAngle =(a: number[], b: number[]) => (2 * Math.acos(Math.min(1, Math.abs(a[0] * b[0] + a[1] * b[1] + a[2] * b[2] + a[3] * b[3]))) * 180) / Math.PI;

/**
 * The lowest the heels and toes go, in metres above the clip's origin (glTF Y up): forward kinematics over the
 * nodes with the channels given, sampled at each key of the first channel.
 */
export function lowestFoot(nodes: GlbNode[], channels: Channel[]): number {
  const compose = (t: number[] = [0, 0, 0], q: number[] = [0, 0, 0, 1]) => {
    const [x, y, z, w] = q;
    return [1 - 2 * (y * y + z * z), 2 * (x * y + z * w), 2 * (x * z - y * w), 0, 2 * (x * y - z * w), 1 - 2 * (x * x + z * z), 2 * (y * z + x * w), 0, 2 * (x * z + y * w), 2 * (y * z - x * w), 1 - 2 * (x * x + y * y), 0, t[0], t[1], t[2], 1];
  };
  const mul = (a: number[], b: number[]) => {
    const o = new Array<number>(16).fill(0);
    for (let c = 0; c < 4; c++) for (let r = 0; r < 4; r++) for (let k = 0; k < 4; k++) o[c * 4 + r] += a[k * 4 + r] * b[c * 4 + k];
    return o;
  };
  const parent = new Map<number, number>();
  nodes.forEach((n, i) => (n.children ?? []).forEach((c) => parent.set(c, i)));
  const index = new Map(nodes.map((n, i) => [n.name, i]));
  const track = new Map(channels.map((c) => [`${index.get(c.node)}/${c.path}`, c]));
  const at = (c: Channel, t: number) => {
    let i = 0;
    while (i < c.times.length - 1 && c.times[i + 1] <= t) i++;
    return c.values[i];
  };
  const feet = ["LeftHeel", "RightHeel", "LeftToeBase", "RightToeBase"].map((n) => index.get(n)).filter((i): i is number => i !== undefined);
  if (!feet.length || !channels.length) return 0;
  let low = Infinity;
  for (const t of channels[0].times) {
    const seen = new Map<number, number[]>();
    const world = (i: number): number[] => {
      const known = seen.get(i);
      if (known) return known;
      const n = nodes[i];
      const tr = track.get(`${i}/translation`);
      const ro = track.get(`${i}/rotation`);
      const local = compose(tr ? at(tr, t) : n.translation, ro ? at(ro, t) : n.rotation);
      const m = parent.has(i) ? mul(world(parent.get(i)!), local) : local;
      seen.set(i, m);
      return m;
    };
    for (const i of feet) low = Math.min(low, world(i)[13]);
  }
  return low;
}

const channelsOf = (g: Glb, index = 0): Channel[] => {
  const a = g.json.animations?.[index];
  if (!a) throw new Error("No animation in the file");
  return a.channels.map((c) => {
    const s = a.samplers[c.sampler];
    return {
      node: g.json.nodes[c.target.node!]?.name ?? "",
      path: c.target.path,
      interpolation: s.interpolation ?? "LINEAR",
      times: readAccessor(g, s.input).map((v) => v[0]),
      values: readAccessor(g, s.output),
    };
  });
};

/**
 * The motion (its first animation) fitted onto the reference game clip's rig as a one-clip .glb for REDbridge's
 * project.import of an .anims, named name. reference is a game clip on the same rig (clipOf an .anims export).
 */
export function fitClip(motion: Glb, reference: Glb, name: string, options: FitOptions = {}): { glb: Buffer; report: FitReport } {
  const gj = reference.json;
  const gameClip = gj.animations?.[0];
  if (!gameClip) throw new Error("The reference has no clip");
  const animated = new Set(gameClip.channels.map((c) => gj.nodes[c.target.node!].name!));
  const mj = motion.json;
  const names = new Set(mj.nodes.map((n) => n.name));
  const missingBones = [...animated].filter((n) => !names.has(n));

  let restDifference = { bone: "", degrees: 0 };
  for (const n of animated) {
    const m = mj.nodes.find((x) => x.name === n);
    const g = gj.nodes.find((x) => x.name === n);
    if (!m || !g) continue;
    const d = quatAngle(m.rotation ?? [0, 0, 0, 1], g.rotation ?? [0, 0, 0, 1]);
    if (d > restDifference.degrees) restDifference = { bone: n, degrees: d };
  }

  const theirs = new Map<string, Channel>();
  for (const c of channelsOf(motion)) if (animated.has(c.node)) theirs.set(`${c.node}/${c.path}`, c);
  if (!theirs.size) throw new Error("The motion keys none of the rig's bones: is it on the game's skeleton?");
  if ([...theirs.values()].some((c) => c.interpolation === "CUBICSPLINE")) throw new Error("The motion's keys are cubic spline; WolvenKit's import takes linear or step");

  const base = theirs.get("Hips/rotation")?.times ?? [...theirs.values()][0].times;
  const channels: Channel[] = [];
  let fromRest = 0;
  for (const gc of gameClip.channels) {
    const node = gj.nodes[gc.target.node!];
    const p = gc.target.path;
    const keep = theirs.get(`${node.name}/${p}`);
    if (keep && (p === "rotation" || (p === "translation" && (node.name === "Hips" || node.name === "Root")))) {
      channels.push(keep);
      continue;
    }
    const rest = p === "rotation" ? node.rotation ?? [0, 0, 0, 1] : p === "translation" ? node.translation ?? [0, 0, 0] : node.scale ?? [1, 1, 1];
    // -0 as 0: WolvenKit stores the sign, and the game's export has -0 in a few rest translations.
    const held = rest.map((v) => (v === 0 ? 0 : v));
    channels.push({ node: node.name!, path: p, interpolation: "LINEAR", times: base, values: base.map(() => held) });
    fromRest++;
  }

  // Facing (Animation Tools' first in-game run, 2026-11-22: the character turned away from V as the clip started).
  // Uthana starts a motion facing its own way, 146 degrees from the game's in the first test; the game plays a
  // clip from the character's own facing. So the whole motion turns about the vertical until its first frame's
  // hips face as the game clip's do; any turning within the clip stays.
  const travel = options.inPlace ? travelInPlace(gj.nodes, channels) : undefined;
  const refChannels = channelsOf(reference);
  const facing = options.face === false ? 0 : yawBetween(gj.nodes, refChannels, channels);
  if (Math.abs(facing) > 0.5) turnMotion(gj.nodes, channels, facing);

  const gameLowest = lowestFoot(gj.nodes, refChannels);
  const motionLowest = lowestFoot(gj.nodes, channels);
  const lift = options.ground === false ? 0 : gameLowest - motionLowest;
  const hips = channels.findIndex((c) => c.node === "Hips" && c.path === "translation");
  if (lift && hips >= 0) channels[hips] = { ...channels[hips], values: channels[hips].values.map(([x, y, z]) => [x, y + lift, z]) };

  // A new binary with the keys only; the nodes and the skin's joint list are the reference's.
  const parts: Buffer[] = [];
  let length = 0;
  const accessors: GlbAccessor[] = [];
  const views: GlbBufferView[] = [];
  const put = (rows: number[][], type: string) => {
    const n = rows[0].length;
    const buf = Buffer.alloc(rows.length * n * 4);
    rows.forEach((r, i) => r.forEach((v, k) => buf.writeFloatLE(v, (i * n + k) * 4)));
    views.push({ buffer: 0, byteOffset: length, byteLength: buf.length });
    parts.push(buf);
    length += buf.length;
    const a: GlbAccessor = { bufferView: views.length - 1, componentType: 5126, count: rows.length, type };
    if (type === "SCALAR") {
      a.min = [Math.min(...rows.map((r) => r[0]))];
      a.max = [Math.max(...rows.map((r) => r[0]))];
    }
    accessors.push(a);
    return accessors.length - 1;
  };
  const nodeIndex = new Map(gj.nodes.map((n, i) => [n.name, i]));
  const samplers = [];
  const outChannels = [];
  for (const c of channels) {
    const input = put(c.times.map((t) => [t - base[0]]), "SCALAR");
    const output = put(c.values, c.path === "rotation" ? "VEC4" : "VEC3");
    samplers.push({ input, output, interpolation: c.interpolation });
    outChannels.push({ sampler: samplers.length - 1, target: { node: nodeIndex.get(c.node)!, path: c.path } });
  }
  const duration = Math.max(...channels.map((c) => c.times[c.times.length - 1] - base[0]));

  const extras = JSON.parse(JSON.stringify(gameClip.extras ?? {})) as Record<string, any>;
  if (extras.schema?.type !== "wkit.cp2077.gltf.anims") throw new Error("The reference clip has no WolvenKit extras: export it with REDbridge");
  // The rig's float tracks: the game clip's values, held constant from the start, since a set's numTracks stays
  // whether or not a clip keys them.
  const constant = new Map<number, number>();
  for (const k of [...(extras.trackKeys ?? []), ...(extras.constTrackKeys ?? [])]) constant.set(k.trackIndex, k.value);
  extras.constTrackKeys = [...constant].sort((a, b) => a[0] - b[0]).map(([trackIndex, value]) => ({ trackIndex, time: 0, value }));
  extras.trackKeys = [];
  extras.fallbackFrameIndices = [];
  extras.animEvents = null;

  const json = { ...gj, accessors, bufferViews: views, buffers: [{ byteLength: length }], animations: [{ name, channels: outChannels, samplers, extras }] };
  return {
    glb: writeGlb(json, Buffer.concat(parts)),
    report: {
      duration,
      frames: base.length,
      channels: { written: channels.length, fromMotion: channels.length - fromRest, fromRest },
      missingBones,
      restDifference,
      grounding: { motionLowest, gameLowest, lift },
      facing,
      ...(travel ? { travel } : {}),
    },
  };
}
