// The Animation Editor's steps (REDcode's docs/design/animation-editor.md, AE1): plain functions over a clip's
// channels, no VS Code and no game. A clip is resampled to whole frames first; each step changes the frames; the
// result is written as a one-clip .glb for REDbridge's import, with the input's nodes and WolvenKit extras.
//
// Steps are kept in the clip's record as `edits`, in the shape agreed with EDGEfab (#7): { step: "trim", ... }.
// The character's axes, used by `turn` and `move`, come from the clip's first frame: up is the world's up (glTF Y),
// right runs from the left hip to the right hip, levelled, and forward is up × right.

import { channelsOf, writeClipGlb, type Channel } from "./fit";
import type { Glb, GlbNode } from "./glb";

export type Ease = "linear" | "in" | "out" | "smooth" | "overshoot";

/** Where a Layer's motion comes from: a made clip in the project, a game clip, or a .glb on the same rig. */
export type LayerSource = { made: string } | { game: { set: string; clip: string } } | { file: string };

export type EditStep =
  /** Cuts the clip to from..to seconds (either may be left out). */
  | { step: "trim"; from?: number; to?: number }
  /** The last `blend` seconds (0.4) flow back into the first frame, so the clip loops. */
  | { step: "loop"; blend?: number }
  /**
   * A key on a bone at `at` seconds: `turn` (degrees about the character's up, right and forward, as yaw, pitch
   * and roll) and, on a foot or hand, `move` (metres along the character's right, up and forward, the leg or arm
   * bending by IK). Keys on one bone join: the change runs between them with each key's easing, and fades in
   * before the first and out after the last over their `blend` (0.3 s).
   */
  | { step: "key"; bone: string; at: number; turn?: { yaw?: number; pitch?: number; roll?: number }; move?: [number, number, number]; ease?: Ease; blend?: number }
  /** A foot or hand held where it is at `from` until `to`, the leg or arm bending to keep it there; `blend` (0.15 s) eases it in and out. */
  | { step: "pin"; bone: string; from: number; to: number; blend?: number; keepTurn?: boolean }
  /**
   * Another clip's motion on chosen bones (`bones`, or a `group`), from `at` seconds, with a blend in and out
   * (0.2 s each) and a weight (1). The bones' rotations are the layer's; their positions stay.
   */
  | { step: "layer"; source: LayerSource; bones?: string[]; group?: BoneGroup; at?: number; blendIn?: number; blendOut?: number; weight?: number };

export type BoneGroup = "leftHand" | "rightHand" | "leftFingers" | "rightFingers" | "leftArm" | "rightArm" | "head" | "upperBody" | "legs" | "all";

/** The bones of a group, from the rig's names (man_base and woman_base share them). */
export function bonesOf(group: BoneGroup, names: string[]): string[] {
  const fingers = (side: "Left" | "Right") => names.filter((n) => new RegExp(`^${side}(Hand(Thumb|Index|Middle|Ring|Pinky)\\d|InHand)`).test(n));
  const hand = (side: "Left" | "Right") => names.filter((n) => n === `${side}Hand` || fingers(side).includes(n));
  const arm = (side: "Left" | "Right") => [...names.filter((n) => [`${side}Shoulder`, `${side}Arm`, `${side}ForeArm`].includes(n)), ...hand(side)];
  const head = names.filter((n) => /^(Neck\d*|Head|LeftEye|RightEye)$/.test(n));
  const legs = names.filter((n) => /^(Left|Right)(UpLeg|Leg|Foot|ToeBase|Heel)$/.test(n));
  switch (group) {
    case "leftHand": return hand("Left");
    case "rightHand": return hand("Right");
    case "leftFingers": return fingers("Left");
    case "rightFingers": return fingers("Right");
    case "leftArm": return arm("Left");
    case "rightArm": return arm("Right");
    case "head": return head;
    case "upperBody": return [...names.filter((n) => /^Spine\d*$/.test(n)), ...head, ...arm("Left"), ...arm("Right")];
    case "legs": return legs;
    case "all": return names.filter((n) => !["Root", "Trajectory", "reference_joint"].includes(n));
  }
}

export const BoneGroups: BoneGroup[] = ["leftHand", "rightHand", "leftFingers", "rightFingers", "leftArm", "rightArm", "head", "upperBody", "legs", "all"];

/** The two-bone chains a foot or hand moves by. */
const Chains: Record<string, [string, string, string]> = {
  LeftFoot: ["LeftUpLeg", "LeftLeg", "LeftFoot"],
  RightFoot: ["RightUpLeg", "RightLeg", "RightFoot"],
  LeftHand: ["LeftArm", "LeftForeArm", "LeftHand"],
  RightHand: ["RightArm", "RightForeArm", "RightHand"],
};
export const IkBones = Object.keys(Chains);

// ---- vectors and quaternions [x, y, z, w] ----
type V = number[];
const add = (a: V, b: V) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const sub = (a: V, b: V) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const scale = (a: V, s: number) => [a[0] * s, a[1] * s, a[2] * s];
const dot = (a: V, b: V) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a: V, b: V) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const len = (a: V) => Math.hypot(a[0], a[1], a[2]);
const norm = (a: V) => scale(a, 1 / (len(a) || 1));
const lerp = (a: V, b: V, t: number) => a.map((v, i) => v + (b[i] - v) * t);
const qmul = (a: V, b: V) => [
  a[3] * b[0] + a[0] * b[3] + a[1] * b[2] - a[2] * b[1],
  a[3] * b[1] - a[0] * b[2] + a[1] * b[3] + a[2] * b[0],
  a[3] * b[2] + a[0] * b[1] - a[1] * b[0] + a[2] * b[3],
  a[3] * b[3] - a[0] * b[0] - a[1] * b[1] - a[2] * b[2],
];
const qconj = (q: V) => [-q[0], -q[1], -q[2], q[3]];
const qnorm = (q: V) => {
  const n = Math.hypot(q[0], q[1], q[2], q[3]) || 1;
  return q.map((x) => x / n);
};
const qrot = (q: V, v: V) => qmul(qmul(q, [v[0], v[1], v[2], 0]), qconj(q)).slice(0, 3);
const qaxis = (axis: V, degrees: number) => {
  const h = (degrees * Math.PI) / 360;
  const a = norm(axis);
  return [a[0] * Math.sin(h), a[1] * Math.sin(h), a[2] * Math.sin(h), Math.cos(h)];
};
/** The shortest rotation taking direction a onto direction b. */
const qbetween = (a: V, b: V) => {
  const x = norm(a);
  const y = norm(b);
  const d = dot(x, y);
  if (d > 0.999999) return [0, 0, 0, 1];
  if (d < -0.999999) {
    const side = len(cross([1, 0, 0], x)) > 1e-6 ? cross([1, 0, 0], x) : cross([0, 1, 0], x);
    return qaxis(side, 180);
  }
  const c = cross(x, y);
  return qnorm([c[0], c[1], c[2], 1 + d]);
};
export function slerp(a: V, b: V, t: number): V {
  let d = a[0] * b[0] + a[1] * b[1] + a[2] * b[2] + a[3] * b[3];
  const c = d < 0 ? b.map((v) => -v) : b;
  d = Math.abs(d);
  if (d > 0.9995) return qnorm(a.map((v, i) => v + (c[i] - v) * t));
  const th = Math.acos(d);
  const s = Math.sin(th);
  const wa = Math.sin((1 - t) * th) / s;
  const wb = Math.sin(t * th) / s;
  return a.map((v, i) => v * wa + c[i] * wb);
}

/** An easing curve from 0 to 1. */
export function ease(kind: Ease | undefined, t: number): number {
  const x = Math.min(1, Math.max(0, t));
  switch (kind ?? "smooth") {
    case "linear": return x;
    case "in": return x * x * x;
    case "out": return 1 - (1 - x) ** 3;
    case "smooth": return x * x * (3 - 2 * x);
    case "overshoot": {
      const c = 1.70158 * 1.2;
      return 1 + (c + 1) * (x - 1) ** 3 + c * (x - 1) ** 2;
    }
  }
}

// ---- the clip as whole frames ----

export interface Frames {
  /** The nodes of the clip's .glb (the rig's bones by name), and the .glb's json for writing it again. */
  json: Glb["json"];
  name: string;
  extras: Record<string, unknown>;
  fps: number;
  /** Frames; the clip lasts (count - 1) / fps seconds. */
  count: number;
  /** Per bone, its local rotation and translation at each frame (rest values where the clip had no keys). */
  rot: Map<string, V[]>;
  pos: Map<string, V[]>;
  /** The channels the clip had, by "bone/path", so the output writes the same ones. */
  keyed: string[];
}

function sample(c: Channel, t: number): V {
  const ts = c.times;
  if (t <= ts[0] || ts.length === 1) return c.values[0];
  if (t >= ts[ts.length - 1]) return c.values[c.values.length - 1];
  let i = 0;
  while (i < ts.length - 2 && ts[i + 1] <= t) i++;
  if (c.interpolation === "STEP") return c.values[i];
  const f = (t - ts[i]) / (ts[i + 1] - ts[i] || 1);
  return c.path === "rotation" ? slerp(c.values[i], c.values[i + 1], f) : lerp(c.values[i], c.values[i + 1], f);
}

/** A clip's first animation as whole frames at fps (30, the game's rate). */
export function framesOf(glb: Glb, fps = 30): Frames {
  const channels = channelsOf(glb);
  const a = glb.json.animations?.[0];
  if (!a) throw new Error("No animation in the file");
  const start = Math.min(...channels.map((c) => c.times[0]));
  const end = Math.max(...channels.map((c) => c.times[c.times.length - 1]));
  const count = Math.max(1, Math.round((end - start) * fps) + 1);
  const rot = new Map<string, V[]>();
  const pos = new Map<string, V[]>();
  for (const n of glb.json.nodes) {
    if (!n.name) continue;
    rot.set(n.name, Array.from({ length: count }, () => [...(n.rotation ?? [0, 0, 0, 1])]));
    pos.set(n.name, Array.from({ length: count }, () => [...(n.translation ?? [0, 0, 0])]));
  }
  const keyed: string[] = [];
  for (const c of channels) {
    if (c.path !== "rotation" && c.path !== "translation") continue;
    const into = (c.path === "rotation" ? rot : pos).get(c.node);
    if (!into) continue;
    keyed.push(`${c.node}/${c.path}`);
    for (let i = 0; i < count; i++) into[i] = [...sample(c, start + i / fps)];
  }
  return { json: glb.json, name: a.name ?? "clip", extras: JSON.parse(JSON.stringify(a.extras ?? {})), fps, count, rot, pos, keyed };
}

/** The frames written back as a one-clip .glb, every channel the clip had keyed at each frame. */
export function writeFrames(f: Frames, name = f.name): Buffer {
  const times = Array.from({ length: f.count }, (_, i) => i / f.fps);
  const channels: Channel[] = f.keyed.map((k) => {
    const [node, p] = k.split("/");
    return { node, path: p, interpolation: "LINEAR", times, values: (p === "rotation" ? f.rot : f.pos).get(node)! };
  });
  return writeClipGlb(f.json, name, channels, f.extras);
}

const copyFrames = (f: Frames): Frames => ({
  ...f,
  rot: new Map([...f.rot].map(([k, v]) => [k, v.map((x) => [...x])])),
  pos: new Map([...f.pos].map(([k, v]) => [k, v.map((x) => [...x])])),
});

// ---- forward kinematics ----

interface Skeleton {
  parent: Map<string, string>;
  order: string[];
}

function skeletonOf(nodes: GlbNode[]): Skeleton {
  const parent = new Map<string, string>();
  nodes.forEach((n) => (n.children ?? []).forEach((c) => nodes[c]?.name && n.name && parent.set(nodes[c].name!, n.name)));
  const order: string[] = [];
  const seen = new Set<string>();
  const visit = (name: string) => {
    if (seen.has(name)) return;
    const p = parent.get(name);
    if (p) visit(p);
    seen.add(name);
    order.push(name);
  };
  nodes.forEach((n) => n.name && visit(n.name));
  return { parent, order };
}

/** World rotation and position of every bone at a frame (scale taken as 1, as the rig's). */
function worldAt(f: Frames, sk: Skeleton, i: number): { r: Map<string, V>; p: Map<string, V> } {
  const r = new Map<string, V>();
  const p = new Map<string, V>();
  for (const name of sk.order) {
    const lr = f.rot.get(name)?.[i] ?? [0, 0, 0, 1];
    const lp = f.pos.get(name)?.[i] ?? [0, 0, 0];
    const par = sk.parent.get(name);
    if (par && r.has(par)) {
      r.set(name, qnorm(qmul(r.get(par)!, lr)));
      p.set(name, add(p.get(par)!, qrot(r.get(par)!, lp)));
    } else {
      r.set(name, qnorm(lr));
      p.set(name, [...lp]);
    }
  }
  return { r, p };
}

/** The character's right, up and forward at the first frame. */
function axesOf(f: Frames, sk: Skeleton): { right: V; up: V; forward: V } {
  const w = worldAt(f, sk, 0);
  const up = [0, 1, 0];
  const l = w.p.get("LeftUpLeg");
  const r = w.p.get("RightUpLeg");
  let right = l && r ? sub(r, l) : [1, 0, 0];
  right = norm(sub(right, scale(up, dot(right, up))));
  return { right, up, forward: norm(cross(up, right)) };
}

/** Sets a bone's world rotation at a frame by changing its local rotation, its parent's world rotation given. */
function setWorldRot(f: Frames, sk: Skeleton, w: { r: Map<string, V> }, bone: string, i: number, world: V) {
  const par = sk.parent.get(bone);
  const pr = par ? w.r.get(par) ?? [0, 0, 0, 1] : [0, 0, 0, 1];
  f.rot.get(bone)![i] = qnorm(qmul(qconj(pr), world));
}

/**
 * Two-bone IK at one frame: the chain's end to `target` (world), the knee or elbow kept in the plane it bends in
 * now, and the end bone's world rotation set to `endRot` when given (else kept). Answers how far the end missed.
 */
function solveTwoBone(f: Frames, sk: Skeleton, chain: [string, string, string], i: number, target: V, endRot?: V): number {
  const [ua, mb, ec] = chain;
  let w = worldAt(f, sk, i);
  const a = w.p.get(ua)!;
  const b = w.p.get(mb)!;
  const c = w.p.get(ec)!;
  const endWorld = endRot ?? w.r.get(ec)!;
  const l1 = len(sub(b, a));
  const l2 = len(sub(c, b));
  const toT = sub(target, a);
  const d = Math.min(Math.max(len(toT), Math.abs(l1 - l2) + 1e-4), l1 + l2 - 1e-4);
  const dir = norm(toT);
  // The bend plane: where the knee points now, away from the line from hip to target.
  let pole = sub(b, add(a, scale(dir, dot(sub(b, a), dir))));
  if (len(pole) < 1e-5) pole = cross(dir, [0, 0, 1]);
  pole = norm(pole);
  const cosA = (l1 * l1 + d * d - l2 * l2) / (2 * l1 * d);
  const angA = Math.acos(Math.min(1, Math.max(-1, cosA)));
  const bNew = add(a, add(scale(dir, Math.cos(angA) * l1), scale(pole, Math.sin(angA) * l1)));
  // The upper bone turns its child direction onto the new knee.
  const r1 = qmul(qbetween(sub(b, a), sub(bNew, a)), w.r.get(ua)!);
  setWorldRot(f, sk, w, ua, i, r1);
  w = worldAt(f, sk, i);
  const b2 = w.p.get(mb)!;
  const c2 = w.p.get(ec)!;
  const r2 = qmul(qbetween(sub(c2, b2), sub(target, b2)), w.r.get(mb)!);
  setWorldRot(f, sk, w, mb, i, r2);
  w = worldAt(f, sk, i);
  setWorldRot(f, sk, w, ec, i, endWorld);
  return len(sub(worldAt(f, sk, i).p.get(ec)!, target));
}

// ---- the steps ----

export interface EditReport {
  seconds: number;
  frames: number;
  /** Per step, what it did, in words, and for IK steps the largest miss in metres. */
  steps: { step: string; did: string; miss?: number }[];
}

export interface EditOptions {
  /** The clip's name in the output (the input's by default). */
  name?: string;
  /** A Layer's clip, already on the same rig (a made clip's .glb, a game clip's export, a file). */
  layer?: (source: LayerSource) => Promise<Glb>;
}

const frameAt = (f: Frames, seconds: number) => Math.min(f.count - 1, Math.max(0, Math.round(seconds * f.fps)));
const chainOf = (bone: string) => {
  const c = Chains[bone];
  if (!c) throw new Error(`${bone} has no leg or arm to bend: pin and move work on ${IkBones.join(", ")}`);
  return c;
};

function trim(f: Frames, s: Extract<EditStep, { step: "trim" }>): string {
  const a = frameAt(f, s.from ?? 0);
  const b = s.to === undefined ? f.count - 1 : frameAt(f, s.to);
  if (b <= a) throw new Error(`trim: ${s.to} s is not after ${s.from ?? 0} s`);
  for (const m of [f.rot, f.pos]) for (const [k, v] of m) m.set(k, v.slice(a, b + 1));
  f.count = b - a + 1;
  return `kept ${(a / f.fps).toFixed(2)} s to ${(b / f.fps).toFixed(2)} s`;
}

function loop(f: Frames, s: Extract<EditStep, { step: "loop" }>): string {
  const n = Math.min(f.count - 1, Math.max(1, Math.round((s.blend ?? 0.4) * f.fps)));
  const from = f.count - 1 - n;
  for (let i = from + 1; i < f.count; i++) {
    const t = ease("smooth", (i - from) / n);
    for (const [, v] of f.rot) v[i] = slerp(v[i], v[0], t);
    for (const [, v] of f.pos) v[i] = lerp(v[i], v[0], t);
  }
  return `the last ${(n / f.fps).toFixed(2)} s flow back into the first frame`;
}

/** The weight at frame i of a range held from a to b (frames), easing in over `inF` frames before and out over `outF` after. */
function rangeWeight(i: number, a: number, b: number, inF: number, outF: number, kind: Ease = "smooth"): number {
  if (i >= a && i <= b) return 1;
  if (i < a) return inF > 0 && i > a - inF ? ease(kind, 1 - (a - i) / inF) : 0;
  return outF > 0 && i < b + outF ? ease(kind, 1 - (i - b) / outF) : 0;
}

function pin(f: Frames, sk: Skeleton, s: Extract<EditStep, { step: "pin" }>): { did: string; miss: number } {
  const chain = chainOf(s.bone);
  const a = frameAt(f, s.from);
  const b = frameAt(f, s.to);
  const blendF = Math.round((s.blend ?? 0.15) * f.fps);
  const at = worldAt(f, sk, a);
  const target = at.p.get(s.bone)!;
  const turn = at.r.get(s.bone)!;
  let miss = 0;
  for (let i = Math.max(0, a - blendF); i <= Math.min(f.count - 1, b + blendF); i++) {
    const wgt = rangeWeight(i, a, b, blendF, blendF);
    if (wgt <= 0) continue;
    const now = worldAt(f, sk, i);
    const goal = lerp(now.p.get(s.bone)!, target, wgt);
    const rot = s.keepTurn === false ? undefined : slerp(now.r.get(s.bone)!, turn, wgt);
    const m = solveTwoBone(f, sk, chain, i, goal, rot);
    if (wgt === 1) miss = Math.max(miss, m);
  }
  return { did: `${s.bone} held from ${(a / f.fps).toFixed(2)} s to ${(b / f.fps).toFixed(2)} s`, miss };
}

/** Keys on one bone: the change at each key, run between keys with the later key's easing, faded in and out at the ends. */
function keys(f: Frames, sk: Skeleton, list: Extract<EditStep, { step: "key" }>[]): { did: string; miss?: number } {
  const bone = list[0].bone;
  const sorted = [...list].sort((x, y) => x.at - y.at);
  const ax = axesOf(f, sk);
  const frames = sorted.map((k) => frameAt(f, k.at));
  const turnOf = (k: (typeof sorted)[number]) => {
    const t = k.turn ?? {};
    return qnorm(qmul(qaxis(ax.up, t.yaw ?? 0), qmul(qaxis(ax.right, t.pitch ?? 0), qaxis(ax.forward, t.roll ?? 0))));
  };
  const moveOf = (k: (typeof sorted)[number]) => {
    const m = k.move ?? [0, 0, 0];
    return add(add(scale(ax.right, m[0]), scale(ax.up, m[1])), scale(ax.forward, m[2]));
  };
  /** The key's change at frame i: its turn and move times a weight, between the keys around it. */
  const at = (i: number): { turn: V; move: V } | null => {
    const first = frames[0];
    const last = frames[frames.length - 1];
    const blendIn = Math.round((sorted[0].blend ?? 0.3) * f.fps);
    const blendOut = Math.round((sorted[sorted.length - 1].blend ?? 0.3) * f.fps);
    if (i < first) {
      if (i <= first - blendIn) return null;
      const w = ease(sorted[0].ease, 1 - (first - i) / blendIn);
      return { turn: slerp([0, 0, 0, 1], turnOf(sorted[0]), w), move: scale(moveOf(sorted[0]), w) };
    }
    if (i > last) {
      if (i >= last + blendOut) return null;
      const w = ease(sorted[sorted.length - 1].ease, 1 - (i - last) / blendOut);
      const k = sorted[sorted.length - 1];
      return { turn: slerp([0, 0, 0, 1], turnOf(k), w), move: scale(moveOf(k), w) };
    }
    let j = 0;
    while (j < frames.length - 1 && frames[j + 1] < i) j++;
    if (frames[j] === i || j === frames.length - 1) return { turn: turnOf(sorted[j]), move: moveOf(sorted[j]) };
    const t = ease(sorted[j + 1].ease, (i - frames[j]) / (frames[j + 1] - frames[j] || 1));
    return { turn: slerp(turnOf(sorted[j]), turnOf(sorted[j + 1]), t), move: lerp(moveOf(sorted[j]), moveOf(sorted[j + 1]), t) };
  };
  const moving = sorted.some((k) => k.move && len(k.move) > 0);
  const chain = moving ? chainOf(bone) : undefined;
  if (!f.rot.has(bone)) throw new Error(`key: no bone ${bone} in the clip`);
  let miss = 0;
  for (let i = 0; i < f.count; i++) {
    const c = at(i);
    if (!c) continue;
    const w = worldAt(f, sk, i);
    const world = qnorm(qmul(c.turn, w.r.get(bone)!));
    if (chain) miss = Math.max(miss, solveTwoBone(f, sk, chain, i, add(w.p.get(bone)!, c.move), world));
    else setWorldRot(f, sk, w, bone, i, world);
  }
  const span = `${(frames[0] / f.fps).toFixed(2)} s${frames.length > 1 ? ` to ${(frames[frames.length - 1] / f.fps).toFixed(2)} s` : ""}`;
  return { did: `${sorted.length} key(s) on ${bone} at ${span}`, ...(chain ? { miss } : {}) };
}

async function layer(f: Frames, s: Extract<EditStep, { step: "layer" }>, options: EditOptions): Promise<string> {
  if (!options.layer) throw new Error("layer: no way to read the layer's clip here");
  const src = framesOf(await options.layer(s.source), f.fps);
  const names = [...f.rot.keys()];
  const bones = s.bones?.length ? s.bones : s.group ? bonesOf(s.group, names) : [];
  if (!bones.length) throw new Error("layer: name the bones or a group");
  const missing = bones.filter((b) => !f.rot.has(b) || !src.rot.has(b));
  if (missing.length) throw new Error(`layer: ${missing.slice(0, 5).join(", ")} not on both clips' rig`);
  const start = frameAt(f, s.at ?? 0);
  const inF = Math.round((s.blendIn ?? 0.2) * f.fps);
  const outF = Math.round((s.blendOut ?? 0.2) * f.fps);
  const end = Math.min(f.count - 1, start + src.count - 1);
  const weight = s.weight ?? 1;
  for (let i = start; i <= end; i++) {
    const j = i - start;
    const w = weight * Math.min(inF ? ease("smooth", (j + 1) / (inF + 1)) : 1, outF ? ease("smooth", (end - i + 1) / (outF + 1)) : 1);
    for (const b of bones) f.rot.get(b)![i] = slerp(f.rot.get(b)![i], src.rot.get(b)![j], w);
  }
  return `${bones.length} bone(s) from ${(start / f.fps).toFixed(2)} s to ${(end / f.fps).toFixed(2)} s`;
}

/**
 * Runs the steps on a clip, in order, keys on one bone run together where the first of them stands, and answers
 * the new clip (named as the input) with what each step did.
 */
export async function applyEdits(clip: Glb, steps: EditStep[], options: EditOptions = {}): Promise<{ glb: Buffer; frames: Frames; report: EditReport }> {
  const f = copyFrames(framesOf(clip));
  const sk = skeletonOf(f.json.nodes);
  const report: EditReport = { seconds: 0, frames: 0, steps: [] };
  const keyed = new Set<string>();
  for (const s of steps) {
    switch (s.step) {
      case "trim":
        report.steps.push({ step: "trim", did: trim(f, s) });
        break;
      case "loop":
        report.steps.push({ step: "loop", did: loop(f, s) });
        break;
      case "pin": {
        const r = pin(f, sk, s);
        report.steps.push({ step: "pin", ...r });
        break;
      }
      case "key": {
        if (keyed.has(s.bone)) break;
        keyed.add(s.bone);
        const r = keys(f, sk, steps.filter((k): k is Extract<EditStep, { step: "key" }> => k.step === "key" && k.bone === s.bone));
        report.steps.push({ step: "key", ...r });
        break;
      }
      case "layer":
        report.steps.push({ step: "layer", did: await layer(f, s, options) });
        break;
      default:
        throw new Error(`Unknown step ${(s as { step?: string }).step}`);
    }
  }
  report.frames = f.count;
  report.seconds = (f.count - 1) / f.fps;
  return { glb: writeFrames(f, options.name ?? f.name), frames: f, report };
}

/** A bone's world place and turn at every frame (glTF axes, metres). */
export function worldPath(clip: Glb | Frames, bone: string): { position: number[]; rotation: number[] }[] {
  const f = "rot" in clip ? clip : framesOf(clip);
  if (!f.rot.has(bone)) throw new Error(`No bone ${bone} in the clip`);
  const sk = skeletonOf(f.json.nodes);
  return Array.from({ length: f.count }, (_, i) => {
    const w = worldAt(f, sk, i);
    return { position: w.p.get(bone)!, rotation: w.r.get(bone)! };
  });
}

// ---- the feet, for an assistant or the editor to see what to fix ----

export interface FootContact {
  bone: "LeftFoot" | "RightFoot";
  from: number;
  to: number;
  /** How far the foot slides over the contact, in metres along the ground. */
  slide: number;
}

/**
 * Where each foot rests on the ground: its lowest point (heel or toe) within 3 cm of its lowest in the clip and
 * moving under 0.3 m/s, for 0.25 s or more; with how far the foot slides there. A contact sliding more than 1 cm
 * is worth a Pin.
 */
export function footContacts(clip: Glb | Frames): FootContact[] {
  const f = "rot" in clip ? clip : framesOf(clip);
  const sk = skeletonOf(f.json.nodes);
  const world = Array.from({ length: f.count }, (_, i) => worldAt(f, sk, i).p);
  const out: FootContact[] = [];
  for (const side of ["Left", "Right"] as const) {
    const bone = `${side}Foot` as const;
    const points = [`${side}Heel`, `${side}ToeBase`].filter((n) => world[0].has(n));
    if (!world[0].has(bone) || !points.length) continue;
    const low = world.map((p) => Math.min(...points.map((n) => p.get(n)![1])));
    const ground = Math.min(...low);
    const ankle = world.map((p) => p.get(bone)!);
    const resting = ankle.map((p, i) => {
      const next = ankle[Math.min(f.count - 1, i + 1)];
      const speed = Math.hypot(next[0] - p[0], next[2] - p[2]) * f.fps;
      return low[i] < ground + 0.03 && speed < 0.3;
    });
    let i = 0;
    while (i < f.count) {
      if (!resting[i]) {
        i++;
        continue;
      }
      let j = i;
      while (j + 1 < f.count && resting[j + 1]) j++;
      if ((j - i) / f.fps >= 0.25) {
        let slide = 0;
        for (let k = i; k <= j; k++) slide = Math.max(slide, Math.hypot(ankle[k][0] - ankle[i][0], ankle[k][2] - ankle[i][2]));
        out.push({ bone, from: i / f.fps, to: j / f.fps, slide });
      }
      i = j + 1;
    }
  }
  return out;
}

/** Pin steps for the contacts that slide more than `over` metres (1 cm). */
export const suggestPins = (contacts: FootContact[], over = 0.01): EditStep[] =>
  contacts.filter((c) => c.slide > over).map((c) => ({ step: "pin", bone: c.bone, from: Math.round(c.from * 100) / 100, to: Math.round(c.to * 100) / 100 }));
