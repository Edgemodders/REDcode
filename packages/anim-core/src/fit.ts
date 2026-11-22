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
}

export interface FitOptions {
  /** Lift the hips to the game clip's foot height (default true). */
  ground?: boolean;
}

const quatAngle = (a: number[], b: number[]) => (2 * Math.acos(Math.min(1, Math.abs(a[0] * b[0] + a[1] * b[1] + a[2] * b[2] + a[3] * b[3]))) * 180) / Math.PI;

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

  const gameLowest = lowestFoot(gj.nodes, channelsOf(reference));
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
    },
  };
}
