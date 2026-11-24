// A spoken line into lip sync (docs/lipsync.md, "Live lip sync", LS4, and the Lip Sync tab's Add a Line): the
// words and when each letter is spoken (ElevenLabs' timings, through EDGEwave's speakLine) become a sequence of
// mouth shapes (shapes.ts), then the game's lip sync tracks as a clip the tab and the face solver play.
// Version 0. The sounds come from spelling rules and a short list of common words that break them, not from a
// pronouncing dictionary: each letter already has its own time, so a letter's shape lands where it is spoken.
// Not fitted on the game and not yet judged on the head by the owner. Pure: no Node, no VS Code.

import type { LipsyncClip, LipsyncTrack } from "./lines";
import { MouthShapes } from "./shapes";

/** When each character of a line is spoken, as ElevenLabs gives it (seconds from the audio's start). `spoken`
 *  false marks characters that are not said, such as a direction in brackets. */
export interface LineTimings {
  characters: string[];
  starts: number[];
  ends: number[];
  spoken?: boolean[];
}

/** One mouth shape held for a stretch of the line. */
export interface MouthEvent {
  /** A shape's id from shapes.ts. */
  shape: string;
  start: number;
  end: number;
  /** The letters it stands for, for the tab to show. */
  letters: string;
}

/** Spelling to shapes, longest first. A value is one shape or several in a row (the time is shared); "" is a
 *  letter with no shape of its own (a silent letter, or h, which takes the next vowel's shape). */
const Spellings: [string, string[]][] = [
  ["tch", ["sh"]],
  ["igh", ["aa", "ee"]],
  ["eau", ["oh"]],
  ["th", ["th"]],
  ["sh", ["sh"]],
  ["ch", ["sh"]],
  ["ph", ["fv"]],
  ["wh", ["oo"]],
  ["ck", ["kg"]],
  ["ng", ["kg"]],
  ["qu", ["kg", "oo"]],
  ["gh", [""]],
  ["kn", ["tdn"]],
  ["wr", ["r"]],
  ["ee", ["ee"]],
  ["ea", ["ee"]],
  ["ie", ["ee"]],
  ["ey", ["ee"]],
  ["oo", ["oo"]],
  ["ou", ["aa", "oo"]],
  ["ow", ["oh"]],
  ["oa", ["oh"]],
  ["oi", ["oh", "ee"]],
  ["oy", ["oh", "ee"]],
  ["ai", ["eh"]],
  ["ay", ["eh"]],
  ["au", ["oh"]],
  ["aw", ["oh"]],
  ["ew", ["oo"]],
  ["ue", ["oo"]],
  ["er", ["r"]],
  ["ir", ["r"]],
  ["ur", ["r"]],
  ["ar", ["aa", "r"]],
  ["or", ["oh", "r"]],
  ["a", ["aa"]],
  ["e", ["eh"]],
  ["i", ["eh"]],
  ["o", ["oh"]],
  ["u", ["aa"]],
  ["y", ["ee"]],
  ["b", ["mbp"]],
  ["p", ["mbp"]],
  ["m", ["mbp"]],
  ["f", ["fv"]],
  ["v", ["fv"]],
  ["t", ["tdn"]],
  ["d", ["tdn"]],
  ["n", ["tdn"]],
  ["l", ["tdn"]],
  ["k", ["kg"]],
  ["g", ["kg"]],
  ["c", ["kg"]],
  ["q", ["kg"]],
  ["x", ["kg", "sz"]],
  ["s", ["sz"]],
  ["z", ["sz"]],
  ["j", ["sh"]],
  ["r", ["r"]],
  ["w", ["oo"]],
  ["h", [""]],
];

/** Common words whose spelling misleads the rules: the word's shapes in order, sharing its time evenly. */
const Words: Record<string, string[]> = {
  the: ["th", "eh"],
  a: ["eh"],
  i: ["aa", "ee"],
  of: ["aa", "fv"],
  to: ["tdn", "oo"],
  do: ["tdn", "oo"],
  you: ["ee", "oo"],
  your: ["ee", "oh", "r"],
  are: ["aa", "r"],
  were: ["oo", "r"],
  was: ["oo", "aa", "sz"],
  one: ["oo", "aa", "tdn"],
  once: ["oo", "aa", "tdn", "sz"],
  two: ["tdn", "oo"],
  who: ["oo"],
  what: ["oo", "aa", "tdn"],
  where: ["oo", "eh", "r"],
  there: ["th", "eh", "r"],
  their: ["th", "eh", "r"],
  they: ["th", "eh", "ee"],
  my: ["mbp", "aa", "ee"],
  by: ["mbp", "aa", "ee"],
  why: ["oo", "aa", "ee"],
  hi: ["aa", "ee"],
  eye: ["aa", "ee"],
  said: ["sz", "eh", "tdn"],
  says: ["sz", "eh", "sz"],
  have: ["aa", "fv"],
  give: ["kg", "eh", "fv"],
  live: ["tdn", "eh", "fv"],
  love: ["tdn", "aa", "fv"],
  come: ["kg", "aa", "mbp"],
  some: ["sz", "aa", "mbp"],
  done: ["tdn", "aa", "tdn"],
  gone: ["kg", "oh", "tdn"],
  does: ["tdn", "aa", "sz"],
  know: ["tdn", "oh"],
  now: ["tdn", "aa", "oo"],
  how: ["aa", "oo"],
  people: ["mbp", "ee", "mbp", "tdn"],
  could: ["kg", "oo", "tdn"],
  would: ["oo", "tdn"],
  should: ["sh", "oo", "tdn"],
  be: ["mbp", "ee"],
  me: ["mbp", "ee"],
  he: ["ee"],
  she: ["sh", "ee"],
  we: ["oo", "ee"],
  no: ["tdn", "oh"],
  so: ["sz", "oh"],
  go: ["kg", "oh"],
};

const isLetter = (c: string) => /[a-z']/i.test(c);

/** One word's letters into shapes, each with the letters (by their place in the word) it covers. */
function wordShapes(word: string): { shape: string; from: number; to: number }[] {
  const out: { shape: string; from: number; to: number }[] = [];
  const letters = word.toLowerCase();
  const plain = letters.replace(/'/g, "");
  const listed = Words[plain];
  // A listed word's shapes share the whole word's time evenly.
  if (listed) return listed.map((shape, part) => ({ shape, from: 0, to: letters.length - 1, part, parts: listed.length }) as { shape: string; from: number; to: number });
  const vowels = (plain.match(/[aeiouy]/g) ?? []).length;
  for (let i = 0; i < letters.length; ) {
    if (letters[i] === "'") {
      i++;
      continue;
    }
    // A final e after a consonant is silent when the word has another vowel (made, time, here).
    if (i === letters.length - 1 && letters[i] === "e" && vowels > 1 && /[^aeiou']/.test(letters[i - 1] ?? "")) {
      i++;
      continue;
    }
    // c before e, i or y is an s (city), g stays hard.
    if (letters[i] === "c" && /[eiy]/.test(letters[i + 1] ?? "")) {
      out.push({ shape: "sz", from: i, to: i });
      i++;
      continue;
    }
    const rule = Spellings.find(([spelling]) => letters.startsWith(spelling, i));
    if (!rule) {
      i++;
      continue;
    }
    const [spelling, shapes] = rule;
    const last = i + spelling.length - 1;
    shapes.forEach((shape, n) => {
      if (!shape) return;
      // Several shapes on one spelling share its letters; on one letter they split its time (below).
      out.push({ shape, from: i, to: last, part: n, parts: shapes.length } as { shape: string; from: number; to: number });
    });
    i += spelling.length;
  }
  return out;
}

/** The line as mouth shapes in time, from its characters' timings. Letters that are not spoken, spaces and
 *  punctuation leave the mouth at rest. */
export function mouthEvents(timings: LineTimings): MouthEvent[] {
  const events: MouthEvent[] = [];
  const said = (i: number) => timings.spoken?.[i] !== false && isLetter(timings.characters[i] ?? "");
  for (let i = 0; i < timings.characters.length; ) {
    if (!said(i)) {
      i++;
      continue;
    }
    let end = i;
    while (end + 1 < timings.characters.length && said(end + 1)) end++;
    const word = timings.characters.slice(i, end + 1).join("");
    for (const s of wordShapes(word) as ({ shape: string; from: number; to: number; part?: number; parts?: number })[]) {
      const start = timings.starts[i + s.from];
      const stop = timings.ends[i + s.to];
      if (!(stop > start)) continue;
      const parts = s.parts ?? 1;
      const part = s.part ?? 0;
      const span = (stop - start) / parts;
      events.push({ shape: s.shape, start: start + span * part, end: start + span * (part + 1), letters: word.slice(s.from, s.to + 1) });
    }
    i = end + 1;
  }
  // Two of the same shape in a row are one shape held.
  const merged: MouthEvent[] = [];
  for (const e of events) {
    const before = merged[merged.length - 1];
    // (An apostrophe or a silent letter between them does not part them: don't, hello.)
    if (before && before.shape === e.shape && e.start - before.end < 0.1) {
      before.end = e.end;
      before.letters += e.letters;
    } else merged.push({ ...e });
  }
  return merged;
}

/** How the shapes move in time. The mouth leads the sound (the game's does by 60 to 70 ms). */
export interface SpeechTiming {
  /** Seconds a shape starts forming before its sound. */
  lead: number;
  /** Seconds a shape takes to form, and to let go. */
  attack: number;
  release: number;
  /** How strongly a shape shows, by id (the tongue's shapes show less than the lips'). */
  strength: Record<string, number>;
  /** Shapes that snap: lips that close or touch the teeth do it fast, or a short vowel beside them never opens. */
  quick: { shapes: string[]; attack: number; release: number };
}

export const DefaultSpeechTiming: SpeechTiming = { lead: 0.06, attack: 0.09, release: 0.12, strength: {}, quick: { shapes: ["mbp", "fv"], attack: 0.045, release: 0.045 } };

const Rate = 60;

/** Each shape's weight over the line, sampled 60 times a second: `weights[shape][frame]`. */
export function shapeWeights(events: MouthEvent[], seconds: number, timing: SpeechTiming = DefaultSpeechTiming): Record<string, Float32Array> {
  const frames = Math.max(2, Math.ceil(seconds * Rate) + 1);
  const weights: Record<string, Float32Array> = {};
  for (const e of events) {
    const w = (weights[e.shape] ??= new Float32Array(frames));
    const peak = timing.strength[e.shape] ?? 1;
    const quick = timing.quick.shapes.includes(e.shape);
    const attack = quick ? timing.quick.attack : timing.attack;
    const release = quick ? timing.quick.release : timing.release;
    const from = e.start - timing.lead - attack;
    const full = e.start - timing.lead;
    const hold = Math.max(full, e.end - timing.lead);
    const to = hold + release;
    for (let f = Math.max(0, Math.floor(from * Rate)); f < frames && f / Rate <= to; f++) {
      const t = f / Rate;
      const v = t < full ? (t - from) / attack : t <= hold ? 1 : 1 - (t - hold) / release;
      const smooth = v <= 0 ? 0 : v >= 1 ? 1 : v * v * (3 - 2 * v);
      if (smooth * peak > w[f]) w[f] = smooth * peak;
    }
  }
  return weights;
}

/** Fewer keys for the same curve: a sample is kept where a straight line between its kept neighbours would miss it. */
function keysOf(samples: Float32Array, tolerance = 0.004): number[] {
  const keep = [0];
  const fit = (a: number, b: number) => {
    let worst = 0;
    let at = -1;
    for (let i = a + 1; i < b; i++) {
      const d = Math.abs(samples[i] - (samples[a] + ((samples[b] - samples[a]) * (i - a)) / (b - a)));
      if (d > worst) {
        worst = d;
        at = i;
      }
    }
    if (at >= 0 && worst > tolerance) {
      fit(a, at);
      keep.push(at);
      fit(at, b);
    }
  };
  fit(0, samples.length - 1);
  keep.push(samples.length - 1);
  return keep.sort((a, b) => a - b).flatMap((i) => [i / Rate, Math.round(samples[i] * 10000) / 10000]);
}

const partOf = (pose: string) => (pose.startsWith("jaw") ? "jaw" : pose.startsWith("tongue") ? "tongue" : pose.startsWith("lips") ? "lips" : "other");

/** A made line as a lip sync clip: the game's lip sync tracks, keyed, in the shape the tab and the face solver
 *  read a game clip in. `seconds` is the audio's length (the clip runs a little past the last letter). */
export function speechClip(timings: LineTimings, options?: { name?: string; seconds?: number; timing?: SpeechTiming }): LipsyncClip & { events: MouthEvent[] } {
  const events = mouthEvents(timings);
  const last = timings.ends.reduce((most, v) => Math.max(most, v || 0), 0);
  const seconds = Math.max(options?.seconds ?? 0, last + 0.2);
  const weights = shapeWeights(events, seconds, options?.timing);
  const frames = Math.max(2, Math.ceil(seconds * Rate) + 1);
  const poses = new Map<string, Float32Array>();
  // How open each consonant leaves the jaw, and how far closed lips push every other shape aside.
  const jawLeft = new Float32Array(frames).fill(1);
  for (const shape of MouthShapes) {
    const w = weights[shape.id];
    if (w && shape.closes) for (let f = 0; f < frames; f++) jawLeft[f] *= 1 - shape.closes * w[f];
  }
  const lipsShut = weights.mbp;
  for (const shape of MouthShapes) {
    const w = weights[shape.id];
    if (!w) continue;
    for (const [pose, amount] of Object.entries(shape.poses)) {
      let samples = poses.get(pose);
      if (!samples) poses.set(pose, (samples = new Float32Array(frames)));
      for (let f = 0; f < frames; f++) {
        // The jaw opens for vowels only, and a consonant shuts it by its own amount. While the lips are
        // together the other lip shapes give way.
        const scale = pose === "jaw_mid_open" ? jawLeft[f] : lipsShut && shape.id !== "mbp" ? 1 - lipsShut[f] : 1;
        samples[f] = Math.min(1, samples[f] + w[f] * amount * scale);
      }
    }
  }
  // The jaw is heavy: it follows syllables, not letters (the game's turns about 4 times a second). A short
  // running average takes the letter-rate flutter out; the lips keep their snap.
  const jaw = poses.get("jaw_mid_open");
  if (jaw) {
    const copy = jaw.slice();
    const reach = 3; // 7 samples at 60 a second, about 0.12 s
    for (let f = 0; f < frames; f++) {
      let sum = 0;
      let n = 0;
      for (let k = Math.max(0, f - reach); k <= Math.min(frames - 1, f + reach); k++) {
        sum += copy[k];
        n++;
      }
      // Never more open than the consonants allow at this moment (lips that close must still meet).
      jaw[f] = Math.min(sum / n, copy[f] + 0.12) * (lipsShut ? 1 - lipsShut[f] * 0.9 : 1);
    }
  }
  const tracks: LipsyncTrack[] = [...poses].map(([pose, samples]) => {
    let min = 0;
    let max = 0;
    for (const v of samples) {
      if (v < min) min = v;
      if (v > max) max = v;
    }
    return { name: `${pose}LipsyncPoseOutput`, group: "lipsync", part: partOf(pose), keys: keysOf(samples), min, max } as LipsyncTrack;
  });
  return { set: "", clip: options?.name ?? "made", seconds, fps: 30, frames: Math.round(seconds * 30), trackCount: 414, tracks, held: [], events };
}
