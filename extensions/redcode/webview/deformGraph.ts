// A body's deformation graph in the animation view (the owner, 2026-11-26: lumps at the shoulder and chest). The game
// moves a body's muscle and twist helpers every frame with its rig's deformation graph (man_base_deformations.animgraph:
// twist, point, orient and aim constraints, splines, set-transform copies, limits and distance-driven bulges). This
// runs the same nodes, in the graph's order, on the body's bones after the clip has posed them.
//
// Probe (Bodies design, step 1): the node maths follow the class names and their fields; how the engine runs each is
// unverified and judged by eye against the plain skinning. Assumptions, each marked where it is used:
// - the nodes work on the hierarchy: a transform moved carries its children (as in Maya, where the rig was made);
// - SimpleSpline is a quadratic Bézier with its middle point as the control (measured against the export, below);
// - SimpleBounce takes the change in its two points' distance from the reference pose, times its multiplier when it grows
//   or its negative multiplier when it shrinks, and sets each output's channels (PosX to PosZ, RotX to RotZ in degrees,
//   ScaleX to ScaleZ, in the bone's frame in the game's axes) to its offset (the channel's rest value) plus that, times
//   the channel's own multiplier; its delay (a spring, on 22 of 90) and smoothing are not run.
// The export turns the game's Z-up into glTF's Y-up in every bone's own frame: (x, y, z) to (x, z, -y). Everything the
// graph gives in a bone's frame is turned the same way here.

import * as THREE from "three";

/** A node of the graph as the host gives it (the cr2w JSON, cut to the fields used). */
export type DeformNode = { t: string } & Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
/** A transform in the game's axes: rotation (i, j, k, r), translation, scale. */
export type GameTransform = { r: number[]; t: number[]; s: number[] };
export interface DeformGraph {
  nodes: DeformNode[];
  /** The rig's reference pose, by bone: where every bone not moved by the clip starts each frame. */
  reference: Record<string, GameTransform>;
}
export interface Deformer {
  /** Runs the graph on the pose the clip has set. */
  update(): void;
  /** Puts the helpers back where the export had them (the plain skinning). */
  reset(): void;
  readonly nodes: number;
  /** Names the graph uses that neither the body nor the graph's own transforms have. */
  readonly missing: string[];
}

const V = (e: number[] | null | undefined, into = new THREE.Vector3()) => (e ? into.set(e[0], e[2], -e[1]) : into.set(0, 0, 0));
const Q = (e: number[]) => new THREE.Quaternion(e[0], e[2], -e[1], e[3]).normalize();
const S = (e: number[]) => new THREE.Vector3(e[0], e[2], e[1]);
const axisOf = (a: string) => (a === "Y" ? new THREE.Vector3(0, 0, -1) : a === "Z" ? new THREE.Vector3(0, 1, 0) : new THREE.Vector3(1, 0, 0));

/**
 * Builds the evaluator on a body as loaded (its bind pose), and runs the graph once in the rig's reference pose for the
 * bulges' rest distances. `driven` is the rig's own bone names, which the clip poses.
 */
export function createDeformer(bodyRoot: THREE.Object3D, graph: DeformGraph, driven: Set<string>): Deformer {
  const byName = new Map<string, THREE.Object3D>();
  bodyRoot.traverse((o) => {
    if (o.name && !byName.has(o.name)) byName.set(o.name, o);
  });
  const missing = new Set<string>();
  const get = (n: string | null | undefined) => {
    if (!n || n === "None") return undefined;
    const o = byName.get(n);
    if (!o) missing.add(n);
    return o;
  };
  // The graph's own transforms (the extenders' in-between points), placed at their reference under their parents.
  const created: THREE.Object3D[] = [];
  const restOf = new Map<THREE.Object3D, { p: THREE.Vector3; q: THREE.Quaternion; s: THREE.Vector3 }>();
  for (const n of graph.nodes) {
    if (n.t !== "StackTransformsExtender") continue;
    for (const a of n.add as { name: string; parent: string; ref: GameTransform }[]) {
      if (byName.has(a.name)) continue;
      const parent = get(a.parent);
      if (!parent) continue;
      const o = new THREE.Object3D();
      o.name = a.name;
      o.position.copy(V(a.ref.t));
      o.quaternion.copy(Q(a.ref.r));
      o.scale.copy(S(a.ref.s));
      parent.add(o);
      byName.set(a.name, o);
      created.push(o);
    }
  }
  // Each frame starts with every helper and in-between point at the rig's reference (the clip poses the rest).
  const exported = new Map<THREE.Object3D, { p: THREE.Vector3; q: THREE.Quaternion; s: THREE.Vector3 }>();
  for (const [name, o] of byName) {
    if (driven.has(name) || o === bodyRoot || (o as THREE.Mesh).isMesh) continue;
    if (!(o as THREE.Bone).isBone && !created.includes(o)) continue;
    exported.set(o, { p: o.position.clone(), q: o.quaternion.clone(), s: o.scale.clone() });
    const ref = graph.reference[name];
    restOf.set(o, ref ? { p: V(ref.t), q: Q(ref.r), s: S(ref.s) } : { p: o.position.clone(), q: o.quaternion.clone(), s: o.scale.clone() });
  }
  const restore = () => {
    for (const [o, r] of restOf) {
      o.position.copy(r.p);
      o.quaternion.copy(r.q);
      o.scale.copy(r.s);
    }
  };

  // ---- world-space reads and writes; a write carries the transform's children ----
  const tv = new THREE.Vector3();
  const tq = new THREE.Quaternion();
  const wpos = (o: THREE.Object3D) => o.getWorldPosition(new THREE.Vector3());
  const wquat = (o: THREE.Object3D) => o.getWorldQuaternion(new THREE.Quaternion());
  const setWorldPos = (o: THREE.Object3D, p: THREE.Vector3) => {
    o.position.copy(p);
    if (o.parent) o.position.applyMatrix4(tmpM.copy(o.parent.matrixWorld).invert());
    o.updateMatrixWorld(true);
  };
  const setWorldQuat = (o: THREE.Object3D, q: THREE.Quaternion) => {
    const pq = o.parent ? wquat(o.parent) : new THREE.Quaternion();
    o.quaternion.copy(pq.invert().multiply(q)).normalize();
    o.updateMatrixWorld(true);
  };
  const setWorldMatrix = (o: THREE.Object3D, m: THREE.Matrix4) => {
    const local = o.parent ? tmpM.copy(o.parent.matrixWorld).invert().multiply(m) : m.clone();
    local.decompose(o.position, o.quaternion, o.scale);
    o.updateMatrixWorld(true);
  };
  const tmpM = new THREE.Matrix4();

  /** The rotation taking local axes (fwd, up) to world directions (aim, up), the up kept square to the aim. */
  const aimRotation = (fwdL: THREE.Vector3, upL: THREE.Vector3, aim: THREE.Vector3, upW: THREE.Vector3, current: THREE.Quaternion) => {
    const f = fwdL.clone().normalize();
    const u = upL.clone().sub(f.clone().multiplyScalar(upL.dot(f))).normalize();
    const s = f.clone().cross(u);
    const F = aim.clone().normalize();
    let U = upW.clone().normalize();
    // An up nearly along the aim (a knuckle aiming along its finger, its up further along it) says little and flips:
    // the helper's own up as it stands is kept then.
    if (Math.abs(U.dot(F)) > 0.95) U = u.clone().applyQuaternion(current);
    U.sub(F.clone().multiplyScalar(U.dot(F)));
    if (U.lengthSq() < 1e-12) return null;
    U.normalize();
    const Sw = F.clone().cross(U);
    const local = new THREE.Matrix4().makeBasis(f, u, s);
    const world = new THREE.Matrix4().makeBasis(F, U, Sw);
    return new THREE.Quaternion().setFromRotationMatrix(world.multiply(local.transpose()));
  };

  /**
   * One channel of a transform, as the game names it (in its axes): game (x, y, z) is glTF (x, -z, y) in a bone's
   * frame. A turn is in degrees about that axis, from no turn (unverified: the value is taken as the whole rotation).
   */
  const setChannel = (o: { p: THREE.Vector3; q: THREE.Quaternion; s: THREE.Vector3 }, channel: string, value: number) => {
    const kind = channel.slice(0, -1);
    const axis = channel.slice(-1);
    if (kind === "Pos") {
      if (axis === "X") o.p.x = value;
      else if (axis === "Y") o.p.z = -value;
      else o.p.y = value;
    } else if (kind === "Scale") {
      if (axis === "X") o.s.x = value;
      else if (axis === "Y") o.s.z = value;
      else o.s.y = value;
    } else if (kind === "Rot") {
      o.q.setFromAxisAngle(axisOf(axis), (value * Math.PI) / 180);
    }
  };

  // The bulges' rest distances, measured in the reference pose (record), then used (run).
  const restDistance = new Map<DeformNode, number>();
  let recording = false;

  const run = () => {
    bodyRoot.updateMatrixWorld(true);
    for (const n of graph.nodes) {
      switch (n.t) {
        case "TwistConstraint": {
          const a = get(n.a);
          const b = get(n.b);
          if (!a || !b) break;
          const rel = wquat(a).invert().multiply(wquat(b));
          const axis = axisOf(n.front);
          const along = rel.x * axis.x + rel.y * axis.y + rel.z * axis.z;
          let angle = 2 * Math.atan2(along, rel.w);
          if (angle > Math.PI) angle -= 2 * Math.PI;
          if (angle < -Math.PI) angle += 2 * Math.PI;
          for (const out of n.outputs as { bone: string; axis: string; pos: number; neg: number }[]) {
            const o = get(out.bone);
            if (!o) continue;
            const r = restOf.get(o)?.q ?? o.quaternion.clone();
            o.quaternion.copy(r).multiply(tq.setFromAxisAngle(axisOf(out.axis), angle * (angle >= 0 ? out.pos : out.neg)));
            o.updateMatrixWorld(true);
          }
          break;
        }
        case "PointConstraint": {
          const o = get(n.bone);
          if (!o) break;
          const p = new THREE.Vector3();
          let sum = 0;
          (n.inputs as [string, number][]).forEach(([name], i) => {
            const src = get(name);
            const w = (n.pre as number[])[i] ?? 1;
            if (!src) return;
            p.addScaledVector(wpos(src), w);
            sum += w;
          });
          if (!sum) break;
          p.divideScalar(sum);
          setWorldPos(o, n.w < 1 ? wpos(o).lerp(p, n.w) : p);
          break;
        }
        case "OrientConstraint": {
          const o = get(n.bone);
          if (!o) break;
          let q: THREE.Quaternion | null = null;
          let sum = 0;
          (n.inputs as [string, number][]).forEach(([name], i) => {
            const src = get(name);
            const w = (n.pre as number[])[i] ?? 1 / (n.inputs as unknown[]).length;
            if (!src || w <= 0) return;
            sum += w;
            q = q ? q.slerp(wquat(src), w / sum) : wquat(src);
          });
          if (!q) break;
          setWorldQuat(o, n.w < 1 ? wquat(o).slerp(q, n.w) : q);
          break;
        }
        case "AimConstraint_ObjectUp":
        case "AimConstraint_ObjectRotationUp": {
          const o = get(n.bone);
          const target = get(n.target);
          const up = get(n.up);
          if (!o || !target || !up) break;
          const p = wpos(o);
          const aim = wpos(target).sub(p);
          const upW = n.t === "AimConstraint_ObjectUp" ? wpos(up).sub(p) : V(n.upVec).applyQuaternion(wquat(up));
          const q = aimRotation(V(n.fwd), V(n.upAxis), aim, upW, wquat(o));
          if (!q) break;
          setWorldQuat(o, n.w < 1 ? wquat(o).slerp(q, n.w) : q);
          break;
        }
        case "SimpleSpline": {
          // Unverified: a quadratic through the three points, at its progress (FloatTrack splines at their default).
          const o = get(n.bone);
          const a = get(n.a);
          const m = get(n.m);
          const b = get(n.b);
          if (!o || !a || !m || !b) break;
          const t = n.p as number;
          const A = wpos(a);
          const M = wpos(m);
          const B = wpos(b);
          // A quadratic Bézier with the middle point as its control: in the export's pose it puts the helpers within 1.7 cm
          // of where the export has them (median 1.7 mm), against 3.8 cm through the middle point (probe, 2026-11-26).
          // `spline` in the graph picks another shape, to compare.
          const shape = (graph as { spline?: string }).spline ?? "bezier";
          const p =
            shape === "bezier"
              ? A.multiplyScalar((1 - t) * (1 - t)).addScaledVector(M, 2 * t * (1 - t)).addScaledVector(B, t * t)
              : shape === "linear"
                ? t < 0.5
                  ? A.lerp(M, t * 2)
                  : M.lerp(B, t * 2 - 1)
                : A.multiplyScalar(2 * t * t - 3 * t + 1).addScaledVector(M, 4 * t - 4 * t * t).addScaledVector(B, 2 * t * t - t);
          setWorldPos(o, p);
          break;
        }
        case "SetBoneTransform": {
          for (const e of n.entries as { bone: string; src: string; space: string; offset: GameTransform | null }[]) {
            const o = get(e.bone);
            const src = get(e.src);
            if (!o || !src) continue;
            const off = e.offset ? new THREE.Matrix4().compose(V(e.offset.t), Q(e.offset.r), S(e.offset.s)) : new THREE.Matrix4();
            const space = get(e.space) ?? src;
            // The offset in the space bone's frame, applied to the source's world transform.
            const sw = space.matrixWorld.clone();
            const m = sw.clone().multiply(off).multiply(sw.clone().invert()).multiply(src.matrixWorld);
            setWorldMatrix(o, m);
          }
          break;
        }
        case "TranslationLimit": {
          const o = get(n.bone);
          const par = get(n.parent);
          if (!o || !par) break;
          const l = wpos(o).applyMatrix4(tmpM.copy(par.matrixWorld).invert());
          // The limits are on the game's axes: game (x, y, z) is glTF (x, -z, y) in a bone's frame.
          const e = [l.x, -l.z, l.y];
          [n.x, n.y, n.z].forEach((c: { min: number; max: number; useMin: number; useMax: number }, i) => {
            if (c.useMin && e[i] < c.min) e[i] = c.min;
            if (c.useMax && e[i] > c.max) e[i] = c.max;
          });
          setWorldPos(o, tv.set(e[0], e[2], -e[1]).applyMatrix4(par.matrixWorld));
          break;
        }
        case "SimpleBounce": {
          const a = get(n.a);
          const b = get(n.b);
          if (!a || !b) break;
          const d = wpos(a).distanceTo(wpos(b));
          if (recording) {
            restDistance.set(n, d);
            break;
          }
          const delta = d - (restDistance.get(n) ?? d);
          const change = delta * (delta >= 0 ? n.mul : n.neg);
          for (const out of n.outs as { bone: string; parent: string; mul: number; entries: { multiplier: number; transformChannel: string }[] }[]) {
            const o = get(out.bone);
            if (!o) continue;
            // The channels are the bone's transform in its output parent's frame (an Offset_GRP the graph adds, which the
            // body's bone is not a child of): read there, set, and put back in the bone's own place.
            const frame = get(out.parent) ?? o.parent;
            const rel = new THREE.Matrix4();
            if (frame) rel.copy(frame.matrixWorld).invert().multiply(o.matrixWorld);
            else rel.copy(o.matrix);
            const local = { p: new THREE.Vector3(), q: new THREE.Quaternion(), s: new THREE.Vector3() };
            rel.decompose(local.p, local.q, local.s);
            for (const e of out.entries ?? []) setChannel(local, e.transformChannel, (n.off + change) * e.multiplier * (out.mul ?? 1));
            const world = new THREE.Matrix4().compose(local.p, local.q, local.s);
            if (frame) world.premultiply(frame.matrixWorld);
            setWorldMatrix(o, world);
          }
          break;
        }
        default:
          break;
      }
    }
  };

  // The reference pose: every bone the rig has at its reference, the graph run once to measure the bulges' rest.
  const saved = new Map<THREE.Object3D, { p: THREE.Vector3; q: THREE.Quaternion; s: THREE.Vector3 }>();
  for (const [name, o] of byName) {
    const ref = graph.reference[name];
    if (!ref || !driven.has(name)) continue;
    saved.set(o, { p: o.position.clone(), q: o.quaternion.clone(), s: o.scale.clone() });
    o.position.copy(V(ref.t));
    o.quaternion.copy(Q(ref.r));
    o.scale.copy(S(ref.s));
  }
  restore();
  recording = true;
  run();
  recording = false;
  for (const [o, s] of saved) {
    o.position.copy(s.p);
    o.quaternion.copy(s.q);
    o.scale.copy(s.s);
  }
  restore();
  bodyRoot.updateMatrixWorld(true);

  return {
    update() {
      restore();
      run();
    },
    reset() {
      for (const [o, r] of exported) {
        o.position.copy(r.p);
        o.quaternion.copy(r.q);
        o.scale.copy(r.s);
      }
      bodyRoot.updateMatrixWorld(true);
    },
    nodes: graph.nodes.length,
    get missing() {
      return [...missing];
    },
  };
}
