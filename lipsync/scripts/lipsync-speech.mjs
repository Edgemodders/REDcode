// Test of a spoken line into lip sync (docs/lipsync.md, LS4 and Add a Line), without the game, VS Code or any
// service: words with made-up letter timings become mouth shapes and a clip. The timings here are evenly spaced,
// as a stand-in for ElevenLabs' (EDGEwave's speakLine gives the real ones).
// Usage (after npm run build): npm run lipsync:speech --workspace extensions/edgefab [-- "<words>"]
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const core = require("../dist/core.js");

const failed = [];
const check = (ok, what) => {
  console.log(`${ok ? "ok  " : "FAIL"} ${what}`);
  if (!ok) failed.push(what);
};
/** Letter timings at a steady pace: `per` seconds a character, spaces and punctuation included. */
const even = (text, per = 0.07, spoken) => {
  const characters = [...text];
  return { characters, starts: characters.map((_, i) => i * per), ends: characters.map((_, i) => (i + 1) * per), spoken };
};
const shapes = (text) => core.mouthEvents(even(text)).map((e) => e.shape).join(" ");
const sample = (track, t) => {
  const k = track.keys;
  for (let i = 2; i < k.length; i += 2) if (t <= k[i]) return k[i - 1] + ((k[i + 1] - k[i - 1]) * (t - k[i - 2])) / (k[i] - k[i - 2] || 1);
  return k[k.length - 1];
};

const said = process.argv[2];
if (said) {
  const t = even(said);
  for (const e of core.mouthEvents(t)) console.log(`${e.start.toFixed(2)} to ${e.end.toFixed(2)}  ${e.shape.padEnd(4)} ${e.letters}`);
  process.exit(0);
}

check(shapes("mama") === "mbp aa mbp aa", `"mama" is lips closed, open, closed, open (${shapes("mama")})`);
check(shapes("the") === "th eh", `"the" comes from the list of common words (${shapes("the")})`);
check(shapes("you") === "ee oo", `"you" too (${shapes("you")})`);
check(shapes("fish") === "fv eh sh", `"fish": lip to teeth, half open, lips out (${shapes("fish")})`);
check(shapes("time") === "tdn eh mbp", `"time" leaves its last e silent (${shapes("time")})`);
check(shapes("city") === "sz eh tdn ee", `"city" starts with an s (${shapes("city")})`);
check(shapes("hello") === "eh tdn oh", `"hello": the h has no shape, the two l are one (${shapes("hello")})`);
check(shapes("queen") === "kg oo ee tdn", `"queen" (${shapes("queen")})`);
check(shapes("don't") === "tdn oh tdn", `an apostrophe is passed over (${shapes("don't")})`);
check(shapes("") === "" && shapes("... !") === "", "no letters, no shapes");
const ids = new Set(core.MouthShapes.map((s) => s.id));
const long = "Hello there, how are you? The quick brown fox jumps over the lazy dog, which vexed five wizards.";
const events = core.mouthEvents(even(long));
check(events.every((e) => ids.has(e.shape)), "every shape used is one of core's shapes");
check(events.every((e, i) => e.end > e.start && (i === 0 || e.start >= events[i - 1].start)), "the shapes are in time order, each with a length");
check(new Set(events.map((e) => e.shape)).size >= 11, `a sentence with every letter uses most shapes (${new Set(events.map((e) => e.shape)).size} of ${ids.size})`);

// A direction in brackets is not spoken.
const tagged = "[tired] No.";
const spoken = [...tagged].map((_, i) => i > 7);
const quiet = core.mouthEvents(even(tagged, 0.07, spoken));
check(quiet.length === 2 && quiet[0].start >= 8 * 0.07 - 1e-9, `letters marked not spoken move nothing (${quiet.map((e) => e.shape).join(" ")}, from ${quiet[0]?.start.toFixed(2)} s)`);

// The clip: the game's track names, keys in time, the lips closed on an m.
// An unhurried pace (8 letters a second), so the vowel has time to open.
const timings = even("mama", 0.12);
const clip = core.speechClip(timings, { name: "test" });
const track = (pose) => clip.tracks.find((t) => t.name === `${pose}LipsyncPoseOutput`);
check(clip.tracks.length >= 3 && clip.tracks.every((t) => t.name.endsWith("LipsyncPoseOutput") && t.group === "lipsync"), `the clip's tracks are lip sync outputs (${clip.tracks.length})`);
check(clip.tracks.every((t) => t.keys.length >= 4 && t.keys.length % 2 === 0 && t.max <= 1 && t.min >= 0), "each has keys, between 0 and 1");
check(clip.tracks.every((t) => t.keys.every((v, i) => i % 2 || i === 0 || v > t.keys[i - 2])), "keys go forward in time");
const lead = core.DefaultSpeechTiming.lead;
const mid = (i) => (timings.starts[i] + timings.ends[i]) / 2 - lead;
check(sample(track("lips_together_up"), mid(0)) > 0.9 && sample(track("jaw_mid_open"), mid(0)) < 0.05, `on the first m the lips are together and the jaw shut (${sample(track("lips_together_up"), mid(0)).toFixed(2)}, ${sample(track("jaw_mid_open"), mid(0)).toFixed(2)})`);
check(sample(track("jaw_mid_open"), mid(1)) > 0.25 && sample(track("jaw_mid_open"), mid(1)) <= 0.6 && sample(track("lips_together_up"), mid(1)) < 0.2, `on the a the jaw is open, within the game's range, and the lips apart (${sample(track("jaw_mid_open"), mid(1)).toFixed(2)}, ${sample(track("lips_together_up"), mid(1)).toFixed(2)})`);
// The game's own range (95 lines measured): the jaw to about 0.45, 0.63 at most; lip poses under 0.6 but for lips together.
const busy = core.speechClip(even("Hello there, how are you my friend? The quick brown fox jumps over the lazy dog.", 0.075));
check(busy.tracks.every((t) => /lips_together/.test(t.name) || t.max <= 0.65), `no pose goes past the game's range (highest ${Math.max(...busy.tracks.filter((t) => !/lips_together/.test(t.name)).map((t) => t.max)).toFixed(2)})`);
const jawOf = busy.tracks.find((t) => t.name === "jaw_mid_openLipsyncPoseOutput");
let turns = 0;
let going = 0;
for (let f = 1; f < busy.seconds * 30; f++) {
  const d = sample(jawOf, f / 30) - sample(jawOf, (f - 1) / 30);
  if (Math.abs(d) > 0.004) {
    if (going && Math.sign(d) !== going) turns++;
    going = Math.sign(d);
  }
}
check(turns / busy.seconds < 7, `the jaw turns at the pace of syllables, not letters (${(turns / busy.seconds).toFixed(1)} a second; the game's is about 4.4)`);
check(sample(track("lips_together_up"), timings.starts[0] - lead - 0.02) > 0.2, "the mouth starts forming before the sound");
check(Math.abs(clip.seconds - (timings.ends[3] + 0.2)) < 1e-6 && core.speechClip(timings, { seconds: 3 }).seconds === 3, "the clip is as long as the audio, or a little past the last letter");
check(clip.events.length === 4 && clip.trackCount === 414, "the clip carries its shapes, for the tab to show");

// It plays on a head's tracks like a game clip: every track name is one the head rig has (checked by name shape here).
check(core.MouthShapes.every((s) => Object.keys(s.poses).every((p) => /^(jaw|lips|tongue)_/.test(p))), "the shapes only use jaw, lip and tongue poses");

if (failed.length) {
  console.error(`FAILED: ${failed.length} of the checks`);
  process.exit(1);
}
console.log("ok");
