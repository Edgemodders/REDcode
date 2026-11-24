// Face capture shapes into the game's lip sync tracks (docs/lipsync.md, "A2F"): ARKit's 52 blend shapes, as
// NVIDIA's Audio2Face-3D gives them from a voice, 30 frames a second, with its 16 optional tongue shapes.
// A spike's table, made by hand from the shapes' and the poses' names: the obvious and the plausible pairs
// only. Nothing here is fitted, and none of it has been judged on the head yet. Pure: no Node, no VS Code.

import type { LipsyncClip, LipsyncTrack } from "./index";

/** One frame of face shapes: seconds from the audio's start, and each shape's weight by its ARKit name. */
export interface ShapeFrame {
  time: number;
  shapes: Record<string, number>;
}

/** An ARKit (or Audio2Face tongue) shape to the game poses it drives, each with how much of it. */
export const ArkitToPose: Record<string, Record<string, number>> = {
  JawOpen: { jaw_mid_open: 1 },
  JawForward: { jaw_mid_shift_fwd: 1 },
  JawLeft: { jaw_mid_shift_l: 1 },
  JawRight: { jaw_mid_shift_r: 1 },
  // Audio2Face's MouthClose is not ARKit's: it includes the jaw's opening. `closeLips` below handles it.
  MouthFunnel: { lips_l_funnel: 1, lips_r_funnel: 1 },
  MouthPucker: { lips_l_purse: 1, lips_r_purse: 1 },
  MouthLeft: { lips_mid_shift_l: 1 },
  MouthRight: { lips_mid_shift_r: 1 },
  MouthSmileLeft: { lips_l_corner_up: 1 },
  MouthSmileRight: { lips_r_corner_up: 1 },
  MouthFrownLeft: { lips_l_corner_dn: 1 },
  MouthFrownRight: { lips_r_corner_dn: 1 },
  MouthDimpleLeft: { lips_l_pull: 1 },
  MouthDimpleRight: { lips_r_pull: 1 },
  MouthStretchLeft: { lips_l_stretch: 1 },
  MouthStretchRight: { lips_r_stretch: 1 },
  MouthRollLower: { lips_suck_dn: 1 },
  MouthRollUpper: { lips_suck_up: 1 },
  MouthShrugLower: { lips_chin_raise: 1 },
  MouthPressLeft: { lips_tighten_up: 0.5, lips_tighten_dn: 0.5 },
  MouthPressRight: { lips_tighten_up: 0.5, lips_tighten_dn: 0.5 },
  MouthLowerDownLeft: { lips_apart_dn: 0.5 },
  MouthLowerDownRight: { lips_apart_dn: 0.5 },
  MouthUpperUpLeft: { lips_l_upper_raise: 1 },
  MouthUpperUpRight: { lips_r_upper_raise: 1 },
  CheekPuff: { cheek_l_puff: 1, cheek_r_puff: 1 },
  NoseSneerLeft: { nose_l_snear: 1 },
  NoseSneerRight: { nose_r_snear: 1 },
  TongueOut: { tongue_mid_fwd: 1 },
  TongueTipUp: { tongue_mid_tip_up: 1 },
  TongueTipDown: { tongue_mid_tip_dn: 1 },
  TongueTipLeft: { tongue_mid_tip_l: 1 },
  TongueTipRight: { tongue_mid_tip_r: 1 },
  TongueUp: { tongue_mid_base_up: 1 },
  TongueDown: { tongue_mid_base_dn: 1 },
  TongueLeft: { tongue_mid_base_l: 1 },
  TongueRight: { tongue_mid_base_r: 1 },
  TongueIn: { tongue_mid_base_back: 1 },
  // The upper face, for a later look: the spike is about the mouth.
  EyeBlinkLeft: { eye_l_blink: 1 },
  EyeBlinkRight: { eye_r_blink: 1 },
  EyeWideLeft: { eye_l_widen: 1 },
  EyeWideRight: { eye_r_widen: 1 },
  BrowDownLeft: { eye_l_brows_lower: 1 },
  BrowDownRight: { eye_r_brows_lower: 1 },
  BrowInnerUp: { eye_l_brows_raise_in: 1, eye_r_brows_raise_in: 1 },
  BrowOuterUpLeft: { eye_l_brows_raise_out: 1 },
  BrowOuterUpRight: { eye_r_brows_raise_out: 1 },
};

export interface ArkitOptions {
  name?: string;
  /** The audio's length, so the clip is as long. */
  seconds?: number;
  /** Seconds the mouth leads the sound by (the game's does by 60 to 70 ms; Audio2Face is on the sound). */
  lead?: number;
  /** Every mouth pose times this (Audio2Face's amounts are for its own faces). */
  gain?: number;
  /** One pose's own multiplier, by pose name, on top of `gain`. */
  gains?: Record<string, number>;
  /** Leave the upper face (eyes, brows) out: the mouth alone. Default true. */
  mouthOnly?: boolean;
  /** MouthClose into "lips together", as its share of the jaw's opening, times this. 0 leaves it out. */
  closeLips?: number;
}

const partOf = (pose: string) => /^jaw/.test(pose) ? "jaw" : /^tongue/.test(pose) ? "tongue" : /^lips/.test(pose) ? "lips" : /^cheek/.test(pose) ? "cheek" : /^nose/.test(pose) ? "nose" : /brows/.test(pose) ? "brow" : /^eye/.test(pose) ? "eye" : "other";

/** Captured face shapes as a lip sync clip: the game's lip sync tracks, one key a frame, in the shape the
 *  tab and the face solver read a game clip in. */
export function arkitClip(frames: ShapeFrame[], options: ArkitOptions = {}): LipsyncClip {
  const lead = options.lead ?? 0;
  const gain = options.gain ?? 1;
  const mouthOnly = options.mouthOnly !== false;
  const closeLips = options.closeLips ?? 1;
  const poses = new Map<string, number[]>();
  const set = (pose: string, frame: number, value: number) => {
    let keys = poses.get(pose);
    if (!keys) poses.set(pose, (keys = new Array(frames.length).fill(0)));
    keys[frame] += value;
  };
  frames.forEach((f, n) => {
    for (const [shape, value] of Object.entries(f.shapes)) {
      const to = ArkitToPose[shape];
      if (!to || !value) continue;
      for (const [pose, amount] of Object.entries(to)) {
        if (mouthOnly && /^eye|brows/.test(pose)) continue;
        set(pose, n, value * amount);
      }
    }
    if (closeLips) {
      // Audio2Face's MouthClose is sized by the jaw's opening: as large as JawOpen when the lips meet over an
      // open jaw. So the share of the opening it covers is how closed the lips are. (Seen on four game lines:
      // it often leaves MouthClose at 0 on an m, b or p and just lowers the jaw, so closures stay weaker
      // than the game's own.)
      const close = f.shapes.MouthClose ?? 0;
      const together = Math.min(1, close / Math.max(f.shapes.JawOpen ?? 0, 0.08)) * Math.min(1, Math.max(0, (close - 0.02) / 0.06)) * closeLips;
      if (together) {
        set("lips_together_up", n, together);
        set("lips_together_dn", n, together);
      }
    }
  });
  const last = frames.length ? frames[frames.length - 1].time : 0;
  const seconds = Math.max(options.seconds ?? 0, last);
  const tracks: LipsyncTrack[] = [];
  for (const [pose, values] of poses) {
    const scale = /^(jaw|lips|tongue|cheek|nose)/.test(pose) ? gain * (options.gains?.[pose] ?? 1) : (options.gains?.[pose] ?? 1);
    const keys: number[] = [];
    let min = 0;
    let max = 0;
    values.forEach((v, n) => {
      const value = Math.max(0, Math.min(1.2, v * scale));
      keys.push(Math.max(0, frames[n].time - lead), Math.round(value * 10000) / 10000);
      if (value < min) min = value;
      if (value > max) max = value;
    });
    if (max - min < 0.005) continue;
    tracks.push({ name: `${pose}LipsyncPoseOutput`, group: "lipsync", part: partOf(pose), keys, min, max } as LipsyncTrack);
  }
  return { set: "", clip: options.name ?? "captured", seconds, fps: 30, frames: Math.round(seconds * 30), trackCount: 414, tracks, held: [] };
}
