// The pose math under the Animation Editor and the Animation Timeline (REDcode's docs/design/animation-editor.md
// and animation-timeline.md): vectors and quaternions, a clip as whole frames, forward kinematics and two-bone IK.
// No Node imports, so it runs in a page as well as in Node.

import type { Glb, GlbNode } from "./glb";

export type Ease = "linear" | "in" | "out" | "smooth" | "overshoot";

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
export const Chains: Record<string, [string, string, string]> = {
  LeftFoot: ["LeftUpLeg", "LeftLeg", "LeftFoot"],
  RightFoot: ["RightUpLeg", "RightLeg", "RightFoot"],
  LeftHand: ["LeftArm", "LeftForeArm", "LeftHand"],
  RightHand: ["RightArm", "RightForeArm", "RightHand"],
};
export const IkBones = Object.keys(Chains);

// ---- vectors and quaternions [x, y, z, w] ----
export type V = number[];
export const add = (a: V, b: V) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
export const sub = (a: V, b: V) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
export const scale = (a: V, s: number) => [a[0] * s, a[1] * s, a[2] * s];
export const dot = (a: V, b: V) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
export const cross = (a: V, b: V) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
export const len = (a: V) => Math.hypot(a[0], a[1], a[2]);
export const norm = (a: V) => scale(a, 1 / (len(a) || 1));
export const lerp = (a: V, b: V, t: number) => a.map((v, i) => v + (b[i] - v) * t);
export const qmul = (a: V, b: V) => [
  a[3] * b[0] + a[0] * b[3] + a[1] * b[2] - a[2] * b[1],
  a[3] * b[1] - a[0] * b[2] + a[1] * b[3] + a[2] * b[0],
  a[3] * b[2] + a[0] * b[1] - a[1] * b[0] + a[2] * b[3],
  a[3] * b[3] - a[0] * b[0] - a[1] * b[1] - a[2] * b[2],
];
export const qconj = (q: V) => [-q[0], -q[1], -q[2], q[3]];
export const qnorm = (q: V) => {
  const n = Math.hypot(q[0], q[1], q[2], q[3]) || 1;
  return q.map((x) => x / n);
};
export const qrot = (q: V, v: V) => qmul(qmul(q, [v[0], v[1], v[2], 0]), qconj(q)).slice(0, 3);
export const qaxis = (axis: V, degrees: number) => {
  const h = (degrees * Math.PI) / 360;
  const a = norm(axis);
  return [a[0] * Math.sin(h), a[1] * Math.sin(h), a[2] * Math.sin(h), Math.cos(h)];
};
/** The shortest rotation taking direction a onto direction b. */
export const qbetween = (a: V, b: V) => {
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

export const copyFrames = (f: Frames): Frames => ({
  ...f,
  rot: new Map([...f.rot].map(([k, v]) => [k, v.map((x) => [...x])])),
  pos: new Map([...f.pos].map(([k, v]) => [k, v.map((x) => [...x])])),
});

// ---- forward kinematics ----

export interface Skeleton {
  parent: Map<string, string>;
  order: string[];
}

export function skeletonOf(nodes: GlbNode[]): Skeleton {
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
export function worldAt(f: Frames, sk: Skeleton, i: number): { r: Map<string, V>; p: Map<string, V> } {
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
export function axesOf(f: Frames, sk: Skeleton): { right: V; up: V; forward: V } {
  const w = worldAt(f, sk, 0);
  const up = [0, 1, 0];
  const l = w.p.get("LeftUpLeg");
  const r = w.p.get("RightUpLeg");
  let right = l && r ? sub(r, l) : [1, 0, 0];
  right = norm(sub(right, scale(up, dot(right, up))));
  return { right, up, forward: norm(cross(up, right)) };
}

/** Sets a bone's world rotation at a frame by changing its local rotation, its parent's world rotation given. */
export function setWorldRot(f: Frames, sk: Skeleton, w: { r: Map<string, V> }, bone: string, i: number, world: V) {
  const par = sk.parent.get(bone);
  const pr = par ? w.r.get(par) ?? [0, 0, 0, 1] : [0, 0, 0, 1];
  f.rot.get(bone)![i] = qnorm(qmul(qconj(pr), world));
}

/**
 * Two-bone IK at one frame: the chain's end to `target` (world), the knee or elbow kept in the plane it bends in
 * now, and the end bone's world rotation set to `endRot` when given (else kept). Answers how far the end missed.
 */
export function solveTwoBone(f: Frames, sk: Skeleton, chain: [string, string, string], i: number, target: V, endRot?: V, poleHint?: V): number {
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
  // The bend plane: the hint when given (a world direction the knee or elbow points), else where it points now.
  let pole = poleHint ? sub(poleHint, scale(dir, dot(poleHint, dir))) : sub(b, add(a, scale(dir, dot(sub(b, a), dir))));
  if (len(pole) < 1e-5) pole = sub(b, add(a, scale(dir, dot(sub(b, a), dir))));
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
