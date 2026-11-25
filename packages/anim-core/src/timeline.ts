// The Animation Timeline's blocks (REDcode's docs/design/animation-timeline.md, TL1): animation blocks, moves and
// blends on tracks, worked out frame by frame. No Node imports, so the page runs it for the live preview as
// applyEdits does in Node.
//
// The rules (draft 0.4, agreed with the owner on 2026-11-25):
// - Tracks apply from the bottom up; each block works on what shows through below it.
// - A block starts from what shows through just before it on its own track and below: the block it touches, else
//   the tracks below, else the rest pose. A move's key at 0 s replaces that start.
// - A move ends on its last pose: no implied return. What would jump there is smoothed by a blend.
// - A blend goes from what shows through before it to what shows through after it, into the live motion: its target
//   is the motion below it, offset so that it lands on what shows at its end.
// - Nothing below is the rig's rest pose.
// - Not only people: a rig profile gives a person's arm and leg chains and bone groups; any other rig (an AV's
//   doors, a prop) still turns and slides its bones.

import {
  add, bonesOf, BoneGroups, Chains, copyFrames, ease as easeCurve, lerp, qaxis, qconj, qmul, qnorm, qrot, scale, setWorldRot, skeletonOf, slerp,
  solveTwoBone, sub, worldAt, axesOf, type BoneGroup, type Frames, type Skeleton, type V,
} from "./pose";

/** How a stretch or a blend runs. `hold` stays on the earlier pose until the key. */
export type Transition = "smooth" | "linear" | "in" | "out" | "overshoot" | "hold";

/**
 * A turn: a quaternion [x, y, z, w] (the pose: the bone's local rotation, or for an arm or leg moved by IK, the
 * hand's or foot's rotation in its chain's frame), or degrees about the character's up, right and forward, as a
 * change from where the move starts.
 */
export type Turn = number[] | { yaw?: number; pitch?: number; roll?: number };
/**
 * A place: [x, y, z] in metres (the pose: the bone's local position, or for an arm or leg moved by IK, the hand's
 * or foot's place in its chain's frame), or metres along the character's right, up and forward, as a change from
 * where the move starts.
 */
export type Place = number[] | { right?: number; up?: number; forward?: number };

export interface MoveKey {
  /** Seconds from the move's start. A key at 0 replaces the start taken from what shows through. */
  at: number;
  /** The move's own bone: the hand or foot for `{ ik }`, else the first of its bones. */
  place?: Place;
  turn?: Turn;
  /** Other bones of the move, by name. */
  bones?: Record<string, { place?: Place; turn?: Turn }>;
}

export type MoveOn = { ik: string } | { bones: string[] } | { group: string };

export type TimelineStep =
  /**
   * An animation block: a stretch of a clip's own frames. `clip` is "base" (the clip as made, the default) or
   * another clip on the same rig; `from` is where in that clip the block starts (a cut piece keeps its frames);
   * `bones` or `group` limit it. Its length is the clip's from `from` when left out.
   */
  | { step: "anim"; track: number; start: number; length?: number; clip?: "base" | LayerSource; from?: number; bones?: string[]; group?: string; mode?: "replace" | "add"; weight?: number }
  /** A move: keys posed by hand, each stretch between them with its transition (`ease`, one per key, or one for all). */
  | { step: "move"; track: number; start: number; length: number; on: MoveOn; keys: MoveKey[]; ease?: Transition | Transition[]; mode?: "replace" | "add"; weight?: number }
  /** A blend: from what shows through before it into what shows through after it. */
  | { step: "blend"; track: number; start: number; length: number; ease?: Transition }
  /** A lane's settings: off (left out of the clip, the lane's checkbox) and its name. */
  | { step: "track"; track: number; off?: boolean; name?: string }
  /** A spoken line, for watching and timing only (TL6): it changes nothing in the clip. */
  | { step: "line"; start: number; line: unknown }
  /** The clip's end, when the end marker was dragged; else the end of the last block. */
  | { step: "end"; at: number };

export const TimelineSteps = ["anim", "move", "blend", "track", "line", "end"] as const;
export const isTimelineStep = (s: { step: string }): s is TimelineStep => (TimelineSteps as readonly string[]).includes(s.step);

/** Where an animation block's (or a Layer's) motion comes from: a made clip in the project, a game clip, or a .glb on the same rig. */
export type LayerSource = { made: string } | { game: { set: string; clip: string } } | { file: string };

// ---- rigs ----

export interface RigChain {
  /** The upper bone, the middle (knee or elbow) and the end (foot or hand). */
  bones: [string, string, string];
  /** The frame the end's place and turn are kept in: "parent", the bone above the chain, so a raised hand stays
   * raised as the body walks; or "root", the rig's root, so a planted foot stays put. */
  space: "parent" | "root";
}

export interface RigProfile {
  /** "person": the game's human skeleton (man_base, woman_base and the like). "rig": anything else. */
  kind: "person" | "rig";
  root: string;
  chains: Record<string, RigChain>;
  groups: Record<string, string[]>;
}

/** The profile for a rig, by its bones' names. */
export function rigProfile(names: string[], sk?: Skeleton): RigProfile {
  const has = (n: string) => names.includes(n);
  const root = has("Root") ? "Root" : sk?.order.find((n) => !sk.parent.has(n)) ?? names[0];
  const chains: Record<string, RigChain> = {};
  for (const [end, bones] of Object.entries(Chains)) {
    if (bones.every(has)) chains[end] = { bones, space: end.endsWith("Foot") ? "root" : "parent" };
  }
  const person = Object.keys(chains).length === 4;
  const groups: Record<string, string[]> = {};
  if (person) for (const g of BoneGroups) groups[g] = bonesOf(g as BoneGroup, names);
  else groups.all = names.filter((n) => n !== root);
  return { kind: person ? "person" : "rig", root, chains, groups };
}

// ---- poses ----

/** One frame's local pose: rotation and position per bone. */
interface Pose {
  r: Map<string, V>;
  p: Map<string, V>;
}

const clonePose = (x: Pose): Pose => ({ r: new Map(x.r), p: new Map(x.p) });

/** A pose as a one-frame Frames, for the forward kinematics and IK in pose.ts. */
function asFrames(base: Frames, x: Pose): Frames {
  return {
    ...base,
    count: 1,
    rot: new Map([...x.r].map(([k, v]) => [k, [v]])),
    pos: new Map([...x.p].map(([k, v]) => [k, [v]])),
  };
}
const fromFrames = (f: Frames): Pose => ({ r: new Map([...f.rot].map(([k, v]) => [k, v[0]])), p: new Map([...f.pos].map(([k, v]) => [k, v[0]])) });

function poseAt(f: Frames, i: number): Pose {
  const j = Math.min(f.count - 1, Math.max(0, i));
  return { r: new Map([...f.rot].map(([k, v]) => [k, v[j]])), p: new Map([...f.pos].map(([k, v]) => [k, v[j]])) };
}

/** The largest turn, in degrees, between two rotations. */
export function angleBetween(a: V, b: V): number {
  const d = Math.min(1, Math.abs(a[0] * b[0] + a[1] * b[1] + a[2] * b[2] + a[3] * b[3]));
  return (2 * Math.acos(d) * 180) / Math.PI;
}

// ---- the timeline ----

export interface TimelineOptions {
  /** The frames of an animation block's clip, other than "base", already read (the page and applyEdits read them first). */
  sources?: (clip: LayerSource) => Frames | undefined;
  profile?: RigProfile;
}

export interface TimelineResult {
  frames: Frames;
  profile: RigProfile;
  /** Seconds where the pose jumps from one frame to the next at a block's edge: the timeline's ticks, each a place for a blend. */
  jumps: number[];
}

type Block = Extract<TimelineStep, { step: "anim" | "move" | "blend" }> & { id: number; s: number; e: number };

/** What a move works out once, at its first frame. */
interface MoveStart {
  chain?: RigChain;
  /** The way the knee or elbow points at the move's start, in the chain's frame, so it never flips as the limb straightens. */
  pole?: V;
  main: string;
  /** Per bone and kind, the values at the move's start and each key, in the property's frame. */
  tracks: { bone: string; kind: "turn" | "place"; ik: boolean; times: number[]; values: V[]; eases: Transition[] }[];
  bones: string[];
}

interface Store {
  /** Per track (by its place in the sorted list), the pose after it at each frame. */
  cum: Pose[][];
  starts: Map<number, Pose>;
  moves: Map<number, MoveStart>;
  blends: Map<number, { from: Pose; to: Pose }>;
}

/**
 * Works out the timeline's steps into frames: every block on its track from the bottom up, at the base clip's frame
 * rate. Steps other than the timeline's are ignored here (applyEdits runs them after).
 */
export function evaluateTimeline(base: Frames, steps: { step: string }[], options: TimelineOptions = {}): TimelineResult {
  const fps = base.fps;
  const sk = skeletonOf(base.json.nodes);
  const names = [...base.rot.keys()];
  const profile = options.profile ?? rigProfile(names, sk);
  const axes = axesOf(base, sk);
  const frameOf = (sec: number) => Math.round(sec * fps);
  const tl = steps.filter(isTimelineStep);
  const off = new Set(tl.filter((s): s is Extract<TimelineStep, { step: "track" }> => s.step === "track" && !!s.off).map((s) => s.track));

  const sourceOf = (clip: "base" | LayerSource | undefined): Frames => {
    if (clip === undefined || clip === "base") return base;
    const f = options.sources?.(clip);
    if (!f) throw new Error(`anim: the clip ${JSON.stringify(clip)} was not read`);
    return f;
  };
  const blocks: Block[] = [];
  tl.forEach((s, id) => {
    if (s.step !== "anim" && s.step !== "move" && s.step !== "blend") return;
    if (off.has(s.track)) return;
    let length = s.length;
    if (s.step === "anim" && length === undefined) {
      const src = sourceOf(s.clip);
      length = (src.count - 1) / src.fps - (s.from ?? 0);
    }
    if (!(length! > 0)) throw new Error(`${s.step} on track ${s.track} at ${s.start} s: its length must be above 0`);
    blocks.push({ ...s, length: length!, id, s: frameOf(s.start), e: frameOf(s.start + length!) } as Block);
  });
  const end = tl.find((s): s is Extract<TimelineStep, { step: "end" }> => s.step === "end");
  const seconds = end ? end.at : blocks.length ? Math.max(...blocks.map((b) => b.start + b.length!)) : (base.count - 1) / fps;
  const count = Math.max(1, frameOf(seconds) + 1);
  const last = count - 1;
  const tracks = [...new Set(blocks.map((b) => b.track))].sort((a, b) => a - b);
  const byTrack = tracks.map((t) => blocks.filter((b) => b.track === t).sort((a, b) => a.s - b.s));
  byTrack.forEach((list, k) => {
    for (let j = 1; j < list.length; j++)
      if (list[j].s < list[j - 1].e) throw new Error(`Track ${tracks[k]}: the ${list[j - 1].step} at ${list[j - 1].start} s and the ${list[j].step} at ${list[j].start} s overlap`);
  });
  const covers = (b: Block, i: number) => i >= b.s && (i < b.e || (i === b.e && i === last));
  const blockAt = (k: number, i: number) => byTrack[k].find((b) => covers(b, i));

  const rest: Pose = { r: new Map(), p: new Map() };
  for (const n of base.json.nodes) {
    if (!n.name) continue;
    rest.r.set(n.name, [...(n.rotation ?? [0, 0, 0, 1])]);
    rest.p.set(n.name, [...(n.translation ?? [0, 0, 0])]);
  }

  // ---- one block on a pose ----

  const bonesFor = (b: { bones?: string[]; group?: string }, all: string[]): string[] => {
    if (b.bones?.length) return b.bones;
    if (b.group) {
      const g = profile.groups[b.group];
      if (!g) throw new Error(`No group ${b.group} on this rig${profile.kind === "rig" ? " (it is not a person's: name its bones)" : ""}`);
      return g;
    }
    return all;
  };

  const keyedOf = new Map<Frames, { rot: Set<string>; pos: Set<string> }>();
  const keyedSets = (src: Frames) => {
    let k = keyedOf.get(src);
    if (!k) {
      const of = (path: string) => new Set(src.keyed.filter((x) => x.endsWith(`/${path}`)).map((x) => x.split("/")[0]));
      k = { rot: of("rotation"), pos: of("translation") };
      keyedOf.set(src, k);
    }
    return k;
  };

  const animOn = (b: Extract<Block, { step: "anim" }>, i: number, below: Pose): Pose => {
    const src = sourceOf(b.clip);
    const from = Math.round((b.from ?? 0) * src.fps);
    const j = from + Math.round(((i - b.s) / fps) * src.fps);
    const { rot: keyedRot, pos: keyedPos } = keyedSets(src);
    const bones = bonesFor(b, [...keyedRot, ...keyedPos].filter((n, x, a) => a.indexOf(n) === x));
    const at = poseAt(src, j);
    const ref = b.mode === "add" ? poseAt(src, from) : undefined;
    const w = b.weight ?? 1;
    const out = clonePose(below);
    for (const bone of bones) {
      if (!below.r.has(bone)) continue;
      if (keyedRot.has(bone)) {
        const r = ref ? qnorm(qmul(below.r.get(bone)!, qmul(qconj(ref.r.get(bone)!), at.r.get(bone)!))) : at.r.get(bone)!;
        out.r.set(bone, slerp(below.r.get(bone)!, r, w));
      }
      if (keyedPos.has(bone)) {
        const p = ref ? add(below.p.get(bone)!, sub(at.p.get(bone)!, ref.p.get(bone)!)) : at.p.get(bone)!;
        out.p.set(bone, lerp(below.p.get(bone)!, p, w));
      }
    }
    return out;
  };

  /** The frame a chain's end is kept in, at a pose: its world rotation and position. */
  const frameFor = (chain: RigChain, world: { r: Map<string, V>; p: Map<string, V> }) => {
    const anchor = chain.space === "root" ? profile.root : sk.parent.get(chain.bones[0]) ?? profile.root;
    return { r: world.r.get(anchor) ?? [0, 0, 0, 1], p: world.p.get(anchor) ?? [0, 0, 0] };
  };
  const toLocal = (fr: { r: V; p: V }, p: V) => qrot(qconj(fr.r), sub(p, fr.p));
  const toWorld = (fr: { r: V; p: V }, p: V) => add(fr.p, qrot(fr.r, p));
  /** A change about the character's axes as a quaternion in a frame whose world rotation is `fr`. */
  const turnIn = (fr: V, t: { yaw?: number; pitch?: number; roll?: number }) => {
    const d = qnorm(qmul(qaxis(axes.up, t.yaw ?? 0), qmul(qaxis(axes.right, t.pitch ?? 0), qaxis(axes.forward, t.roll ?? 0))));
    return qnorm(qmul(qconj(fr), qmul(d, fr)));
  };
  const moveIn = (fr: V, m: { right?: number; up?: number; forward?: number }) =>
    qrot(qconj(fr), add(add(scale(axes.right, m.right ?? 0), scale(axes.up, m.up ?? 0)), scale(axes.forward, m.forward ?? 0)));

  /**
   * A move's tracks, worked out at its first frame. `start` is what showed just before it (its implied start);
   * `beneath` is what the tracks below it show at its first frame, which its relative keys are measured from, so a
   * blend before the move does not move where they land.
   */
  const startMove = (b: Extract<Block, { step: "move" }>, start: Pose, beneath: Pose): MoveStart => {
    const on = b.on as Partial<{ ik: string; bones: string[]; group: string }>;
    let chain: RigChain | undefined;
    let main: string;
    let bones: string[];
    if (on.ik) {
      chain = profile.chains[on.ik];
      if (!chain) {
        throw new Error(
          profile.kind === "person"
            ? `${on.ik} has no arm or leg to bend: moves by IK work on ${Object.keys(profile.chains).join(", ")}`
            : `${on.ik}: this rig is not a person's, so nothing bends by IK; a move turns or slides its bones ({ "bones": [...] })`,
        );
      }
      main = on.ik;
      bones = [...chain.bones];
    } else {
      bones = bonesFor({ bones: on.bones, group: on.group }, []);
      if (!bones.length) throw new Error("move: name its bones, a group, or { ik }");
      main = bones[0];
    }
    for (const n of bones) if (!start.r.has(n)) throw new Error(`move: no bone ${n} on this rig`);
    const add_ = b.mode === "add";
    const world = worldAt(asFrames(base, start), sk, 0);
    const worldB = worldAt(asFrames(base, beneath), sk, 0);
    const keys = [...b.keys].sort((x, y) => x.at - y.at);
    // A key at the move's end lands on its last frame (the frame at its end is the next block's).
    const lastF = (b.e === last ? b.e : b.e - 1) - b.s;
    const easeOf = (k: number): Transition => (Array.isArray(b.ease) ? b.ease[k] ?? b.ease[b.ease.length - 1] ?? "smooth" : b.ease ?? "smooth");
    const tracks: MoveStart["tracks"] = [];
    const want = new Map<string, { bone: string; kind: "turn" | "place" }>();
    keys.forEach((k) => {
      if (k.place !== undefined) want.set(`${main}/place`, { bone: main, kind: "place" });
      if (k.turn !== undefined) want.set(`${main}/turn`, { bone: main, kind: "turn" });
      for (const [bone, v] of Object.entries(k.bones ?? {})) {
        if (!start.r.has(bone)) throw new Error(`move: no bone ${bone} on this rig`);
        if (v.place !== undefined) want.set(`${bone}/place`, { bone, kind: "place" });
        if (v.turn !== undefined) want.set(`${bone}/turn`, { bone, kind: "turn" });
        if (!bones.includes(bone)) bones.push(bone);
      }
    });
    for (const { bone, kind } of want.values()) {
      const ik = !!chain && bone === main;
      // The property's frame and its value in a pose: at the start, and beneath the move.
      const frameIn = (w: typeof world): { r: V; p: V } => {
        if (ik) return frameFor(chain!, w);
        const par = sk.parent.get(bone);
        return { r: par ? w.r.get(par)! : [0, 0, 0, 1], p: par ? w.p.get(par)! : [0, 0, 0] };
      };
      const valueIn = (pose: Pose, w: typeof world, fr: { r: V; p: V }): V =>
        add_
          ? kind === "turn" ? [0, 0, 0, 1] : [0, 0, 0]
          : kind === "turn"
            ? ik ? qnorm(qmul(qconj(fr.r), w.r.get(bone)!)) : pose.r.get(bone)!
            : ik ? toLocal(fr, w.p.get(bone)!) : pose.p.get(bone)!;
      const startVal = valueIn(start, world, frameIn(world));
      const frB = frameIn(worldB);
      const refVal = valueIn(beneath, worldB, frB);
      const times: number[] = [];
      const values: V[] = [];
      const eases: Transition[] = [];
      keys.forEach((k, ki) => {
        const v = bone === main && (kind === "place" ? k.place : k.turn) !== undefined ? (kind === "place" ? k.place : k.turn) : k.bones?.[bone]?.[kind];
        if (v === undefined) return;
        let val: V;
        if (Array.isArray(v)) val = kind === "turn" ? qnorm(v) : [...v];
        // Degrees or metres about the character's axes: a change from what is beneath the move, in the property's frame.
        else if (kind === "turn") val = qnorm(qmul(turnIn(frB.r, v as { yaw?: number }), refVal));
        else val = add(refVal, moveIn(frB.r, v as { up?: number }));
        times.push(Math.min(frameOf(k.at), lastF));
        values.push(val);
        eases.push(easeOf(ki));
      });
      // The implied start is the frame before the move, so its first frame is already on the way.
      if (times[0] !== 0) {
        times.unshift(-1);
        values.unshift(startVal);
        eases.unshift("smooth");
      }
      tracks.push({ bone, kind, ik, times, values, eases });
    }
    let pole: V | undefined;
    if (chain) {
      const [a, m, e] = chain.bones.map((n) => world.p.get(n)!);
      const dir = sub(e, a);
      const l = Math.hypot(...dir) || 1;
      const off = sub(sub(m, a), scale(dir, (sub(m, a)[0] * dir[0] + sub(m, a)[1] * dir[1] + sub(m, a)[2] * dir[2]) / (l * l)));
      // A limb that starts straight: elbows point back, knees forward.
      const w = Math.hypot(...off) > 0.002 * l ? off : scale(axes.forward, main.endsWith("Foot") ? 1 : -1);
      pole = qrot(qconj(frameFor(chain, world).r), w);
    }
    return { chain, pole, main, tracks, bones };
  };

  const sampleTrack = (t: MoveStart["tracks"][number], f: number): V => {
    const { times, values, eases } = t;
    if (f <= times[0]) return values[0];
    if (f >= times[times.length - 1]) return values[values.length - 1];
    let j = 0;
    while (j < times.length - 2 && times[j + 1] <= f) j++;
    const e = eases[j + 1];
    const u = e === "hold" ? 0 : easeCurve(e, (f - times[j]) / (times[j + 1] - times[j] || 1));
    return t.kind === "turn" ? slerp(values[j], values[j + 1], u) : lerp(values[j], values[j + 1], u);
  };

  const moveOn = (b: Extract<Block, { step: "move" }>, m: MoveStart, i: number, below: Pose): Pose => {
    const f = i - b.s;
    const add_ = b.mode === "add";
    const frames = asFrames(base, below);
    // Bones first, then the arm or leg by IK on top of them.
    for (const t of m.tracks) {
      if (t.ik) continue;
      const v = sampleTrack(t, f);
      const into = t.kind === "turn" ? frames.rot.get(t.bone)! : frames.pos.get(t.bone)!;
      // Add: a change in the parent's frame, put before the bone's own rotation.
      into[0] = t.kind === "turn" ? (add_ ? qnorm(qmul(v, into[0])) : v) : add_ ? add(into[0], v) : v;
    }
    if (m.chain) {
      const place = m.tracks.find((t) => t.ik && t.kind === "place");
      const turn = m.tracks.find((t) => t.ik && t.kind === "turn");
      if (place || turn) {
        const w = worldAt(frames, sk, 0);
        const fr = frameFor(m.chain, w);
        const end = m.main;
        let endRot: V | undefined;
        if (turn) {
          const v = sampleTrack(turn, f);
          endRot = add_ ? qnorm(qmul(qmul(fr.r, v), qmul(qconj(fr.r), w.r.get(end)!))) : qnorm(qmul(fr.r, v));
        }
        if (place) {
          const v = sampleTrack(place, f);
          const target = add_ ? add(w.p.get(end)!, qrot(fr.r, v)) : toWorld(fr, v);
          solveTwoBone(frames, sk, m.chain.bones, 0, target, endRot, m.pole ? qrot(fr.r, m.pole) : undefined);
        } else if (endRot) setWorldRot(frames, sk, w, end, 0, endRot);
      }
    }
    const moved = fromFrames(frames);
    const wgt = b.weight ?? 1;
    if (wgt >= 1) return moved;
    const out = clonePose(below);
    for (const n of m.bones) {
      out.r.set(n, slerp(below.r.get(n)!, moved.r.get(n)!, wgt));
      out.p.set(n, lerp(below.p.get(n)!, moved.p.get(n)!, wgt));
    }
    return out;
  };

  // ---- the frames, in order, with a fork for each blend ----

  const newStore = (): Store => ({ cum: tracks.map(() => new Array<Pose>(count)), starts: new Map(), moves: new Map(), blends: new Map() });
  const below = (st: Store, k: number, i: number): Pose => (k > 0 ? st.cum[k - 1][i] : rest);
  const top = (st: Store, i: number): Pose => (tracks.length ? st.cum[tracks.length - 1][i] : rest);

  const run = (st: Store, from: number, to: number, transparent: Set<number>) => {
    for (let i = from; i <= to; i++) {
      for (let k = 0; k < tracks.length; k++) {
        const input = below(st, k, i);
        const b = blockAt(k, i);
        if (!b || transparent.has(b.id)) {
          st.cum[k][i] = input;
          continue;
        }
        if (i === b.s || !st.starts.has(b.id)) st.starts.set(b.id, b.s > 0 ? st.cum[k][b.s - 1] ?? input : input);
        const start = st.starts.get(b.id)!;
        if (b.step === "anim") st.cum[k][i] = animOn(b, i, input);
        else if (b.step === "move") {
          if (i === b.s || !st.moves.has(b.id)) st.moves.set(b.id, startMove(b, start, i === b.s ? input : start));
          st.cum[k][i] = moveOn(b, st.moves.get(b.id)!, i, input);
        } else {
          if (i === b.s || !st.blends.has(b.id)) st.blends.set(b.id, startBlend(st, b, k, start, transparent));
          // Both ends ride on the live motion below: the earlier pose's offset from it fades into the later one's.
          const { from: d0, to: d1 } = st.blends.get(b.id)!;
          const n = Math.max(1, Math.min(b.e, last) - b.s);
          const u = b.ease === "hold" ? 0 : easeCurve(b.ease ?? "smooth", (i - b.s + 1) / n);
          const out: Pose = { r: new Map(), p: new Map() };
          const id: V = [0, 0, 0, 1];
          for (const [bone, r] of input.r) {
            out.r.set(bone, slerp(qnorm(qmul(d0.r.get(bone) ?? id, r)), qnorm(qmul(d1.r.get(bone) ?? id, r)), u));
            const p = input.p.get(bone)!;
            out.p.set(bone, add(p, lerp(d0.p.get(bone) ?? [0, 0, 0], d1.p.get(bone) ?? [0, 0, 0], u)));
          }
          st.cum[k][i] = out;
        }
      }
    }
  };

  /** The offset of a pose from the motion below it, per bone. */
  const offset = (pose: Pose, under: Pose): Pose => {
    const d: Pose = { r: new Map(), p: new Map() };
    for (const [bone, r] of under.r) {
      d.r.set(bone, qnorm(qmul(pose.r.get(bone) ?? r, qconj(r))));
      d.p.set(bone, sub(pose.p.get(bone) ?? under.p.get(bone)!, under.p.get(bone)!));
    }
    return d;
  };

  /**
   * A blend's two offsets from the motion below it: at its start, what showed just before it (the block it touches,
   * else nothing); at its end, what shows through there with the blend left out (the block after it, on any track).
   */
  function startBlend(st: Store, b: Block, k: number, start: Pose, transparent: Set<number>): { from: Pose; to: Pose } {
    const e = Math.min(b.e, last);
    const fork: Store = {
      cum: st.cum.map((c) => {
        const copy = new Array<Pose>(count);
        for (let i = 0; i < b.s; i++) copy[i] = c[i];
        return copy;
      }),
      starts: new Map([...st.starts].filter(([id]) => blocks.find((x) => x.id === id)!.s < b.s)),
      moves: new Map([...st.moves].filter(([id]) => blocks.find((x) => x.id === id)!.s < b.s)),
      blends: new Map([...st.blends].filter(([id]) => blocks.find((x) => x.id === id)!.s < b.s)),
    };
    run(fork, b.s, e, new Set([...transparent, b.id]));
    return { from: offset(start, b.s > 0 ? below(st, k, b.s - 1) : start), to: offset(top(fork, e), below(fork, k, e)) };
  }

  const st = newStore();
  run(st, 0, last, new Set());

  // ---- the result ----

  const out = copyFrames(base);
  out.count = count;
  for (const n of names) {
    out.rot.set(n, Array.from({ length: count }, (_, i) => [...top(st, i).r.get(n)!]));
    out.pos.set(n, Array.from({ length: count }, (_, i) => [...top(st, i).p.get(n)!]));
  }
  const keyed = new Set(base.keyed);
  for (const b of blocks) {
    if (b.step === "anim") for (const k of sourceOf(b.clip).keyed) if (names.includes(k.split("/")[0])) keyed.add(k);
    if (b.step === "move") {
      const m = st.moves.get(b.id);
      for (const n of m?.bones ?? []) keyed.add(`${n}/rotation`);
      for (const t of m?.tracks ?? []) if (t.kind === "place" && !t.ik) keyed.add(`${t.bone}/translation`);
    }
  }
  out.keyed = [...keyed];

  // Jumps: at a block's edge, a bone that turns or slides from one frame to the next far more than in the frames on
  // either side (a fast start that carries on is not a jump), counting only what the edge adds to the motion below
  // the block: a step already in that motion (a game clip's finger that starts at once) is the motion's, not a jump.
  const jumps: number[] = [];
  const edges = [...new Set(blocks.flatMap((b) => [b.s, b.e]))].filter((x) => x >= 1 && x <= last).sort((a, b) => a - b);
  const turnAt = (n: string, i: number) => (i < 1 || i > last ? 0 : angleBetween(out.rot.get(n)![i - 1], out.rot.get(n)![i]));
  const slideAt = (n: string, i: number) => (i < 1 || i > last ? 0 : Math.hypot(...sub(out.pos.get(n)![i], out.pos.get(n)![i - 1])));
  for (const x of edges) {
    const unders = [...new Set(blocks.filter((b) => b.s === x || b.e === x).map((b) => tracks.indexOf(b.track)))].map((k) => (i: number) => below(st, k, i));
    const added = (n: string) =>
      unders.reduce(
        (worst, under) => {
          const o0 = out.rot.get(n)![x - 1];
          const o1 = out.rot.get(n)![x];
          const u0 = under(x - 1).r.get(n)!;
          const u1 = under(x).r.get(n)!;
          const turn = angleBetween(qmul(qconj(o0), o1), qmul(qconj(u0), u1));
          const slide = Math.hypot(...sub(sub(out.pos.get(n)![x], out.pos.get(n)![x - 1]), sub(under(x).p.get(n)!, under(x - 1).p.get(n)!)));
          return { turn: Math.max(worst.turn, turn), slide: Math.max(worst.slide, slide) };
        },
        { turn: 0, slide: 0 },
      );
    const jumped = names.some((n) => {
      const a = added(n);
      return (
        (turnAt(n, x) > Math.max(3, 2.5 * Math.max(turnAt(n, x - 1), turnAt(n, x + 1))) && a.turn > 3) ||
        (slideAt(n, x) > Math.max(0.02, 2.5 * Math.max(slideAt(n, x - 1), slideAt(n, x + 1))) && a.slide > 0.02)
      );
    });
    if (jumped) jumps.push(x / fps);
  }
  return { frames: out, profile, jumps };
}

/** The steps with the clip as made as an animation block on the bottom track, when they have timeline steps but no animation block. */
export function withBase(steps: { step: string }[], seconds: number): { step: string }[] {
  const tl = steps.filter(isTimelineStep);
  if (!tl.length || tl.some((s) => s.step === "anim")) return steps;
  const lowest = Math.min(0, ...tl.filter((s): s is Extract<TimelineStep, { track: number }> => "track" in s && typeof s.track === "number").map((s) => s.track));
  const base: TimelineStep = { step: "anim", track: lowest - 1, start: 0, length: seconds, clip: "base" };
  return [base, ...steps];
}
