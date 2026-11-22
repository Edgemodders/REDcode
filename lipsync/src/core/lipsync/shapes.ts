// Mouth shapes for live lip sync (docs/lipsync.md, "Live lip sync", spikes LS2 and LS4): a spoken line as a
// sequence of a few shapes, each one number, which the changed face graph turns into the game's lip sync tracks.
// Version 1 (2026-11-21): made by hand from how each sound is formed, with amounts and poses taken from what
// the game's own clips do. Version 0 was judged on the head by the owner as exaggerated and unnatural: it moved
// poses to 0.7 or 1 and the jaw with every letter. Measured over 95 lines of five main characters, the game
// moves the jaw to about 0.45 at a line's widest (0.56 at most lines' top), the lip poses to 0.15 to 0.3, and
// only "lips together" to 1; the jaw turns about 4 times a second, the pace of syllables, not of letters.
// So: vowels open the jaw, consonants never do; a consonant only says how far it closes the jaw around it.
// A track here is the pose's name; the graph adds to its `<name>LipsyncPoseOutput` track.

/** One mouth shape: the speech sounds it stands for and how far it moves each pose (0 to 1). */
export interface MouthShape {
  /** A short id, also the button's name in the test app. */
  id: string;
  /** What it is, in plain words. */
  says: string;
  /** Pose name to weight. Only a vowel has `jaw_mid_open`. */
  poses: Record<string, number>;
  /** A consonant: how far it shuts the jaw the vowels around it have opened (1: fully, as lips that close). */
  closes?: number;
}

const sides = (name: string, weight: number): Record<string, number> => ({ [`lips_l_${name}`]: weight, [`lips_r_${name}`]: weight });

/** The shapes, in the order the graph's feature carries them. Rest is no shape: every number at 0. */
export const MouthShapes: MouthShape[] = [
  { id: "aa", says: "open, as in father", poses: { jaw_mid_open: 0.5 } },
  { id: "eh", says: "half open, as in bed or bit", poses: { jaw_mid_open: 0.33, ...sides("corner_stretch", 0.12), ...sides("pull", 0.1) } },
  { id: "ee", says: "wide, as in see", poses: { jaw_mid_open: 0.2, ...sides("corner_stretch", 0.25), ...sides("pull", 0.2), ...sides("corner_up", 0.12) } },
  { id: "oh", says: "round and open, as in go", poses: { jaw_mid_open: 0.38, ...sides("funnel", 0.22), ...sides("purse", 0.15) } },
  { id: "oo", says: "round and small, as in you or w", poses: { jaw_mid_open: 0.15, ...sides("purse", 0.38), ...sides("funnel", 0.18) } },
  { id: "mbp", says: "lips closed, as in m, b, p", poses: { lips_together_up: 1, lips_together_dn: 1 }, closes: 1 },
  { id: "fv", says: "lower lip to the teeth, as in f, v", poses: { lips_suck_dn: 0.45, ...sides("upper_raise", 0.08) }, closes: 0.8 },
  { id: "th", says: "tongue between the teeth, as in th", poses: { tongue_mid_base_fwd: 0.4, tongue_mid_fwd: 0.05 }, closes: 0.55 },
  { id: "tdn", says: "tongue tip up, as in t, d, n, l", poses: { tongue_mid_tip_up: 0.32 }, closes: 0.45 },
  { id: "kg", says: "back of the tongue up, as in k, g", poses: { tongue_mid_lift: 0.5 }, closes: 0.3 },
  { id: "sz", says: "teeth together, as in s, z", poses: { ...sides("corner_stretch", 0.14), ...sides("pull", 0.1) }, closes: 0.75 },
  { id: "sh", says: "lips pushed out, as in sh, ch, j", poses: { ...sides("funnel", 0.25), ...sides("purse", 0.22) }, closes: 0.7 },
  { id: "r", says: "slightly round, as in r", poses: { ...sides("purse", 0.2), ...sides("funnel", 0.1) }, closes: 0.35 },
];

/** How the numbers reach the face graph: an anim feature the changed graph declares (LS1: `SetInputFloat` does
 *  nothing, `ApplyFeature` works). The class is one of the game's own with enough floats; its field names mean
 *  nothing here, they are only slots. */
export const MouthFeature = {
  /** The feature's name in the graph, given to ApplyFeature. */
  name: "edgefab_mouth",
  /** The game class, as the graph names it and as scripts make it. */
  className: "animAnimFeature_FPPCamera",
  scriptName: "AnimFeature_FPPCamera",
  /** One slot per shape, in MouthShapes' order. */
  fields: ["fov", "deltaYaw", "deltaYawExternal", "deltaYawInput", "yawSpeed", "yawMaxLeft", "yawMaxRight", "deltaPitch", "deltaPitchExternal", "deltaPitchInput", "pitchSpeed", "pitchMin", "pitchMax"],
  /** 0: the graph eases each number toward what was sent; 1: it uses the number as sent. */
  raw: "resetYawSpeed",
} as const;

/** The feature's fields for these shape weights (by shape id; the others 0), ready for the game's `$new`. */
export function mouthFeatureFields(weights: Record<string, number>, raw = false): Record<string, number> {
  const out: Record<string, number> = { [MouthFeature.raw]: raw ? 1 : 0 };
  MouthShapes.forEach((shape, i) => (out[MouthFeature.fields[i]] = Math.max(0, Math.min(1, weights[shape.id] ?? 0))));
  return out;
}
