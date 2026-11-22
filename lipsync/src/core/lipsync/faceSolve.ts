// The face solver (docs/lipsync.md, "R-face"): a head's 414 track values in, its bones out. EDGEfab's own, written
// from the rules as that page describes them in plain words; no code from WolvenKit or its Blender add-on (both
// GPL) was read into it. The game does this in its face graph's Sermo node with the head's `.facialsetup`.
// Pure: no Node, no VS Code, so the Lip Sync tab's page runs the same file.
//
// Checked: a main pose applied to an exported head opens the mouth as the game does (jaw_mid_open, by eye).
// Not checked against the game: limits, the three kinds of influence, correctives' reductions. Left out: the left
// and right lip sync envelopes, faceEnvelope, antiStretch, pose scales (pupils, tongue thickness), levels of detail.

/** One of a setup's three parts (face, tongue, eyes), in the shape the solver walks. */
export interface FacePart {
  /** Main poses. `track` is the pose's weight track; `first` its first entry; `thresholds` the weight at which
   *  each of its in-betweens is full (the last is the whole pose); `muzzle` 0 none, 2 eyes, 3 brows, 4 eye
   *  directions; `half` 0 none, 1 upper face, 2 lower face. */
  poses: { track: number; first: number; thresholds: number[]; muzzle: number; half: number }[];
  /** Caps on a pose's weight while lip sync plays: `slider` 0 is jaliJaw, 1 jaliLips. */
  limits: { pose: number; min: number; mid: number; max: number; slider: number }[];
  /** A pose reduced by other poses (by pose index). */
  influences: { pose: number; by: number[]; kind: number }[];
  /** Correctives: each is on when all its parents are; a parent is a whole pose or one of its in-betweens (an entry). */
  correctives: { poses: number[]; entries: number[] }[];
  /** A corrective reduced by other correctives. */
  correctiveInfluences: { corrective: number; by: number[]; kind: number }[];
  /** Bone changes: entry e owns `count[e]` changes from `start[e]`; a change is a bone and 7 numbers
   *  (rotation x, y, z, w, then translation x, y, z), in the game's space, from the rest pose. */
  main: FaceChanges;
  corrective: FaceChanges;
}

export interface FaceChanges {
  start: number[];
  count: number[];
  bones: ArrayLike<number>;
  values: ArrayLike<number>;
}

/** A head's facial setup, compact. */
export interface FaceSetup {
  /** The head's rig and setup, as game paths. */
  rig: string;
  setup: string;
  /** The rig's bones in order, and each one's rest pose in its parent's space (7 numbers a bone, as a change's). */
  bones: string[];
  rest: ArrayLike<number>;
  /** The rig's track names; the solver reads the envelopes by name. */
  tracks: string[];
  /** Where the track groups start: main pose weights, override weights, lip sync outputs, wrinkles. */
  layout: { main: number; overrides: number; lipsync: number; wrinkles: number; mainCount: number };
  /** Override k scales the main pose on this track. */
  overrides: number[];
  parts: FacePart[];
}

const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v);
const Tiny = 1e-4;

/** A solver for one head: `solve(values)` fills and returns the bones' local poses (7 numbers a bone, the
 *  game's space). `weights(values)` gives each part's pose weights after every rule, for the tab to show. */
export function faceSolver(setup: FaceSetup) {
  const t = (name: string) => setup.tracks.indexOf(name);
  const track = {
    upperFace: t("upperFace"),
    lowerFace: t("lowerFace"),
    lipSync: t("lipSyncEnvelope"),
    jaliJaw: t("jaliJaw"),
    jaliLips: t("jaliLips"),
    muzzleLips: t("muzzleLips"),
    muzzle: [-1, -1, t("muzzleEyes"), t("muzzleBrows"), t("muzzleEyeDirections")],
  };
  const overrideOf = new Map<number, number>();
  setup.overrides.forEach((mainTrack, k) => overrideOf.set(mainTrack, setup.layout.overrides + k));
  const out = new Float32Array(setup.bones.length * 7);
  const scratch = setup.parts.map((p) => ({
    pose: new Float32Array(p.poses.length),
    before: new Float32Array(p.poses.length),
    entry: new Float32Array(p.main.start.length),
    corrective: new Float32Array(p.correctives.length),
    correctiveBefore: new Float32Array(p.correctives.length),
  }));
  const at = (values: ArrayLike<number>, index: number, otherwise: number) => (index >= 0 && index < values.length ? values[index] : otherwise);

  function reduce(weights: Float32Array, before: Float32Array, rules: { by: number[] }[], target: (rule: any) => number) {
    before.set(weights);
    for (const rule of rules) {
      let sum = 0;
      for (const other of rule.by) sum += before[other] ?? 0;
      if (sum > 0) weights[target(rule)] *= clamp01(1 - sum);
    }
  }

  function weigh(values: ArrayLike<number>, options?: { halves?: boolean }) {
    const lipSync = clamp01(at(values, track.lipSync, 0));
    setup.parts.forEach((part, n) => {
      const s = scratch[n];
      // 1. The pose's own weight, less its muzzle.
      part.poses.forEach((pose, i) => {
        let w = clamp01(at(values, pose.track, 0));
        const muzzle = track.muzzle[pose.muzzle] ?? -1;
        if (muzzle >= 0) w *= 1 - clamp01(at(values, muzzle, 0));
        s.pose[i] = w < Tiny ? 0 : w;
      });
      // 2. Limits, only while lip sync plays.
      if (lipSync > 0) {
        const pull = clamp01(at(values, track.muzzleLips, 0));
        for (const limit of part.limits) {
          const slider = Math.max(0, Math.min(2, at(values, limit.slider === 1 ? track.jaliLips : track.jaliJaw, 1)));
          const cap = slider <= 1 ? limit.min + (limit.mid - limit.min) * slider : limit.mid + (limit.max - limit.mid) * (slider - 1);
          if (s.pose[limit.pose] > cap) s.pose[limit.pose] += (cap - s.pose[limit.pose]) * pull;
        }
      }
      // 3. Poses that reduce other poses.
      reduce(s.pose, s.before, part.influences, (r) => r.pose);
      part.poses.forEach((pose, i) => {
        let w = s.pose[i];
        // 4. Upper and lower face. A clip of lip sync alone leaves them at 0, which would mute the acting it
        //    has none of anyway; `halves: false` keeps the acting, for a clip that is not on a mood.
        if (options?.halves !== false && pose.half) w *= Math.max(0, Math.min(2, at(values, pose.half === 1 ? track.upperFace : track.lowerFace, 1)));
        // 5. The override weight scales the acting while lip sync plays.
        const override = overrideOf.get(pose.track);
        if (override !== undefined) w *= 1 + lipSync * (at(values, override, 1) - 1);
        // 6. The lip sync output is added.
        const mainIndex = pose.track - setup.layout.main;
        if (mainIndex >= 0 && mainIndex < setup.layout.mainCount) w += at(values, setup.layout.lipsync + mainIndex, 0);
        s.pose[i] = clamp01(w);
      });
      // 7. Influences again, on the sums.
      reduce(s.pose, s.before, part.influences, (r) => r.pose);
      // 8. In-betweens: the two nearest thresholds share the weight.
      part.poses.forEach((pose, i) => {
        const w = s.pose[i];
        let low = 0;
        pose.thresholds.forEach((high, k) => {
          const e = pose.first + k;
          const last = k === pose.thresholds.length - 1;
          if (w <= low || high <= low) s.entry[e] = 0;
          else if (w <= high) s.entry[e] = (w - low) / (high - low);
          else s.entry[e] = last ? 1 : Math.max(0, 1 - (w - high) / (pose.thresholds[k + 1] - high));
          low = high;
        });
      });
      // 9. Correctives: all parents on, then reduced by other correctives.
      part.correctives.forEach((c, i) => {
        let w = 1;
        for (const p of c.poses) w *= s.pose[p] ?? 0;
        for (const e of c.entries) w *= s.entry[e] ?? 0;
        s.corrective[i] = w < Tiny ? 0 : w;
      });
      reduce(s.corrective, s.correctiveBefore, part.correctiveInfluences, (r) => r.corrective);
    });
    return scratch;
  }

  function add(changes: FaceChanges, weights: ArrayLike<number>) {
    for (let e = 0; e < weights.length; e++) {
      const w = weights[e];
      if (w < Tiny) continue;
      const end = changes.start[e] + changes.count[e];
      for (let c = changes.start[e]; c < end; c++) {
        const o = changes.bones[c] * 7;
        const v = c * 7;
        out[o + 4] += changes.values[v + 4] * w;
        out[o + 5] += changes.values[v + 5] * w;
        out[o + 6] += changes.values[v + 6] * w;
        // The change's rotation, scaled by the weight (from none, the short way), goes after the bone's own.
        let x = changes.values[v];
        let y = changes.values[v + 1];
        let z = changes.values[v + 2];
        let r = changes.values[v + 3];
        if (r < 0) {
          x = -x;
          y = -y;
          z = -z;
          r = -r;
        }
        const sin = Math.sqrt(Math.max(0, 1 - r * r));
        if (sin < 1e-6) continue;
        const half = Math.acos(Math.min(1, r)) * w;
        const k = Math.sin(half) / sin;
        x *= k;
        y *= k;
        z *= k;
        r = Math.cos(half);
        const ax = out[o];
        const ay = out[o + 1];
        const az = out[o + 2];
        const ar = out[o + 3];
        out[o] = ar * x + ax * r + ay * z - az * y;
        out[o + 1] = ar * y - ax * z + ay * r + az * x;
        out[o + 2] = ar * z + ax * y - ay * x + az * r;
        out[o + 3] = ar * r - ax * x - ay * y - az * z;
      }
    }
  }

  return {
    /** Each part's weights after every rule: `pose` per main pose, `entry` per in-between, `corrective`. */
    weights: weigh,
    /** The bones' local poses for these track values. The array is reused by the next call. */
    solve(values: ArrayLike<number>, options?: { halves?: boolean }): Float32Array {
      weigh(values, options);
      out.set(setup.rest as ArrayLike<number>);
      setup.parts.forEach((part, n) => {
        add(part.main, scratch[n].entry);
        add(part.corrective, scratch[n].corrective);
      });
      return out;
    },
  };
}

/** A bone's 7 numbers from the game's space to glTF's, as WolvenKit's export turns a rig (checked against one):
 *  translation (x, z, -y), rotation (x, z, -y, w). Returns [translation, rotation]. */
export function boneToGltf(pose: ArrayLike<number>, bone: number): [[number, number, number], [number, number, number, number]] {
  const o = bone * 7;
  return [
    [pose[o + 4], pose[o + 6], -pose[o + 5]],
    [pose[o], pose[o + 2], -pose[o + 1], pose[o + 3]],
  ];
}

/** A clip as the solver needs it: moving tracks with flat (time, value) keys, and tracks held at one value. */
export interface ClipTracks {
  tracks: { name: string; keys: ArrayLike<number> }[];
  held: { name: string; value: number }[];
}

/** A clip's track values at `seconds`, in the head's track order (a track the clip lacks stays 0). Give `into`
 *  to reuse an array. */
export function clipValues(setup: { tracks: string[] }, clip: ClipTracks, seconds: number, into?: Float32Array): Float32Array {
  const values = into ?? new Float32Array(setup.tracks.length);
  values.fill(0);
  const index = clipIndex(setup, clip);
  clip.held.forEach((h, i) => {
    if (index.held[i] >= 0) values[index.held[i]] = h.value;
  });
  clip.tracks.forEach((track, i) => {
    const at = index.moving[i];
    if (at < 0) return;
    const k = track.keys;
    if (!k.length) return;
    let v = k[k.length - 1];
    if (seconds <= k[0]) v = k[1];
    else
      for (let n = 2; n < k.length; n += 2) {
        if (seconds <= k[n]) {
          const span = k[n] - k[n - 2];
          v = span > 0 ? k[n - 1] + ((k[n + 1] - k[n - 1]) * (seconds - k[n - 2])) / span : k[n + 1];
          break;
        }
      }
    values[at] = v;
  });
  return values;
}

const indexes = new WeakMap<object, { moving: number[]; held: number[] }>();
function clipIndex(setup: { tracks: string[] }, clip: ClipTracks) {
  let index = indexes.get(clip);
  if (!index) {
    const at = new Map(setup.tracks.map((name, i) => [name, i]));
    index = { moving: clip.tracks.map((t) => at.get(t.name) ?? -1), held: clip.held.map((h) => at.get(h.name) ?? -1) };
    indexes.set(clip, index);
  }
  return index;
}
