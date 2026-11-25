// anim-core's check of the Animation Timeline (TL1 in REDcode's docs/design/animation-timeline.md): the rules on
// made-up rigs, a person's and an AV's, with no game and no REDbridge.
//   npm run build && node scripts/check-timeline.mjs
import * as esbuild from "esbuild";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import * as core from "../dist/index.mjs";

let failed = 0;
const check = (ok, what) => {
  console.log(`${ok ? "ok  " : "FAIL"} ${what}`);
  if (!ok) failed++;
};
const fps = 30;
const deg = (d) => (d * Math.PI) / 180;
const qy = (d) => [0, Math.sin(deg(d) / 2), 0, Math.cos(deg(d) / 2)];
const qz = (d) => [0, 0, Math.sin(deg(d) / 2), Math.cos(deg(d) / 2)];
const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);

/** A rig as glTF nodes, from [name, parent, translation] rows, and a clip on it as Frames. */
function rig(rows) {
  const nodes = rows.map(([name, , t]) => ({ name, translation: t, rotation: [0, 0, 0, 1], children: [] }));
  rows.forEach(([, parent], i) => parent && nodes[rows.findIndex((r) => r[0] === parent)].children.push(i));
  return nodes;
}
function clip(nodes, seconds, motion = () => ({})) {
  const count = Math.round(seconds * fps) + 1;
  const rot = new Map();
  const pos = new Map();
  for (const n of nodes) {
    rot.set(n.name, Array.from({ length: count }, () => [...n.rotation]));
    pos.set(n.name, Array.from({ length: count }, () => [...n.translation]));
  }
  for (let i = 0; i < count; i++) {
    for (const [bone, v] of Object.entries(motion(i / fps))) {
      if (v.r) rot.get(bone)[i] = v.r;
      if (v.p) pos.get(bone)[i] = v.p;
    }
  }
  const keyed = nodes.flatMap((n) => [`${n.name}/rotation`, `${n.name}/translation`]);
  return { json: { asset: { version: "2.0" }, nodes, scenes: [{ nodes: [0] }], scene: 0, animations: [{ name: "clip", channels: [], samplers: [] }] }, name: "clip", extras: {}, fps, count, rot, pos, keyed };
}
const world = (frames, bone, t) => core.worldPath(frames, bone)[Math.round(t * fps)];

const person = rig([
  ["Root", null, [0, 0, 0]],
  ["Hips", "Root", [0, 1, 0]],
  ["LeftUpLeg", "Hips", [0.1, 0, 0]], ["LeftLeg", "LeftUpLeg", [0, -0.45, 0.02]], ["LeftFoot", "LeftLeg", [0, -0.45, 0]],
  ["RightUpLeg", "Hips", [-0.1, 0, 0]], ["RightLeg", "RightUpLeg", [0, -0.45, 0.02]], ["RightFoot", "RightLeg", [0, -0.45, 0]],
  ["Spine", "Hips", [0, 0.1, 0]], ["Spine1", "Spine", [0, 0.15, 0]], ["Spine2", "Spine1", [0, 0.15, 0]],
  ["Neck", "Spine2", [0, 0.1, 0]], ["Head", "Neck", [0, 0.1, 0]],
  ["LeftShoulder", "Spine2", [0.05, 0.05, 0]], ["LeftArm", "LeftShoulder", [0.15, 0, 0]], ["LeftForeArm", "LeftArm", [0, -0.27, -0.06]], ["LeftHand", "LeftForeArm", [0, -0.26, 0]],
  ["RightShoulder", "Spine2", [-0.05, 0.05, 0]], ["RightArm", "RightShoulder", [-0.15, 0, 0]], ["RightForeArm", "RightArm", [0, -0.27, -0.06]], ["RightHand", "RightForeArm", [0, -0.26, 0]],
]);
// The base: standing, the spine swaying ±10° and the hips bobbing, arms hanging. Clip C: the right arm rising sideways.
const base = clip(person, 4, (t) => ({ Spine: { r: qy(10 * Math.sin(t * 2)) }, Hips: { p: [0, 1 + 0.02 * Math.sin(t * 3), 0] } }));
const still = clip(person, 4);
const clipC = clip(person, 4, (t) => ({ RightArm: { r: qz(-20 * t) } }));
const C = { file: "clipC.glb" };
const sources = (c) => (c.file === "clipC.glb" ? clipC : undefined);
const run = (steps, from = base) => core.evaluateTimeline(from, steps, { sources });
const baseBlock = { step: "anim", track: 0, start: 0, length: 4 };
const raise = { up: 0.6, forward: 0.2 };
const moveA = (start = 0.5) => ({ step: "move", track: 1, start, length: 1, on: { ik: "RightHand" }, keys: [{ at: 1, place: raise }] });
const moveB = (start, track = 1, keys = [{ at: 1, place: { up: -0.3, forward: 0.1 } }]) => ({ step: "move", track, start, length: 1, on: { ik: "RightHand" }, keys });

// 0. The rig profiles.
check(core.rigProfile(person.map((n) => n.name)).kind === "person", "a person's rig is known by its bones");

// 1. A chain: B touching A starts on A's last pose.
{
  const r = run([baseBlock, moveA(), moveB(1.5)]);
  const a = world(r.frames, "RightHand", 1.5 - 1 / fps);
  const b = world(r.frames, "RightHand", 1.5);
  check(dist(a.position, b.position) < 0.01, `B starts where A ended (${(dist(a.position, b.position) * 1000).toFixed(1)} mm between the frames)`);
  check(!r.jumps.some((x) => Math.abs(x - 1.5) < 0.01), "no jump where B touches A");
  // A's key is reached: the hand's place in its shoulder's frame is what is beneath at A's start, plus the raise.
  const sh0 = world(base, "RightShoulder", 0.5);
  const h0 = world(base, "RightHand", 0.5);
  const local0 = core.qrot(core.qconj(sh0.rotation), core.sub(h0.position, sh0.position));
  const want = core.add(local0, core.qrot(core.qconj(sh0.rotation), [0, 0.6, 0.2]));
  const sh = world(r.frames, "RightShoulder", 1.5 - 1 / fps);
  const got = core.qrot(core.qconj(sh.rotation), core.sub(a.position, sh.position));
  check(dist(got, want) < 0.001, `the hand reaches A's key (${(dist(got, want) * 1000).toFixed(2)} mm off)`);
}

// 2. A gap: B later starts from what shows through, and A's end jumps.
{
  const r = run([baseBlock, moveA(), moveB(2)]);
  const d = dist(world(r.frames, "RightHand", 2).position, world(base, "RightHand", 2).position);
  check(d < 0.005, `after a gap B starts from the base (${(d * 1000).toFixed(1)} mm)`);
  check(r.jumps.some((x) => Math.abs(x - 1.5) < 0.01), `A's end with nothing after it is a jump (${r.jumps.map((x) => x.toFixed(2)).join(", ")})`);
}

// 3. What shows through can be a cut piece of another clip on a lower track.
{
  const piece = { step: "anim", track: 1, start: 1.6, length: 0.8, clip: C, from: 1.6 };
  const r = run([baseBlock, piece, { ...moveA(), track: 2 }, moveB(2, 2)]);
  const under = run([baseBlock, piece]);
  const d = dist(world(r.frames, "RightHand", 2).position, world(under.frames, "RightHand", 2 - 1 / fps).position);
  check(d < 0.005, `after a gap B starts from Clip C's piece (${(d * 1000).toFixed(1)} mm)`);
  check(dist(world(under.frames, "RightHand", 2).position, world(base, "RightHand", 2).position) > 0.05, "and Clip C's piece is not the base there");
}

// 4. A cut piece keeps its frames.
{
  const r = run([baseBlock, { step: "anim", track: 1, start: 3, length: 0.5, clip: C, from: 1 }]);
  const a = core.angleBetween(r.frames.rot.get("RightArm")[90], clipC.rot.get("RightArm")[30]);
  check(a < 0.01, `a piece at 3 s from 1 s plays Clip C's frame at 1 s (${a.toFixed(4)}°)`);
}

// 5. A blend after A goes into the live motion.
{
  const r = run([baseBlock, moveA(), { step: "blend", track: 1, start: 1.5, length: 1 }]);
  check(!r.jumps.length, `no jump at either end of the blend (${r.jumps.join(", ") || "none"})`);
  let after = 0;
  for (let i = 75; i < r.frames.count; i++) for (const n of r.frames.rot.keys()) after = Math.max(after, core.angleBetween(r.frames.rot.get(n)[i], base.rot.get(n)[i]));
  check(after < 1e-4, `after the blend the base plays as it is (${after.toExponential(1)}°)`);
  let spine = 0;
  for (let i = 45; i < 75; i++) spine = Math.max(spine, core.angleBetween(r.frames.rot.get("Spine")[i], base.rot.get("Spine")[i]));
  check(spine < 1e-4, `the spine keeps swaying through the blend (${spine.toExponential(1)}°)`);
  const end = dist(world(r.frames, "RightHand", 2.5 - 1 / fps).position, world(base, "RightHand", 2.5 - 1 / fps).position);
  check(end < 0.002, `the blend's last frame is on the base (${(end * 1000).toFixed(2)} mm)`);
}

// 6. A blend before a move that starts with its own key, on its lane or on a lower track.
{
  const b = moveB(2.5, 1, [{ at: 0, place: { up: 0.5 } }, { at: 1, place: { up: 0.4 } }]);
  const without = run([baseBlock, b]);
  check(without.jumps.some((x) => Math.abs(x - 2.5) < 0.01), "a move with a key at 0 s jumps in");
  const same = run([baseBlock, b, { step: "blend", track: 1, start: 2, length: 0.5 }]);
  check(!same.jumps.some((x) => Math.abs(x - 2.5) < 0.01), `a blend before it on its lane takes the jump away (${same.jumps.join(", ") || "none"})`);
  const lower = run([baseBlock, { ...b, track: 2 }, { step: "blend", track: 1, start: 2, length: 0.5 }]);
  check(!lower.jumps.some((x) => Math.abs(x - 2.5) < 0.01), `so does a blend on a lower track (${lower.jumps.join(", ") || "none"})`);
}

// 7. Nothing below is the rest pose.
{
  const r = run([moveA(1)]);
  let a = 0;
  for (const n of r.frames.rot.keys()) a = Math.max(a, core.angleBetween(r.frames.rot.get(n)[10], [0, 0, 0, 1]));
  check(a < 1e-6 && dist(r.frames.pos.get("Hips")[10], [0, 1, 0]) < 1e-9, "with no animation block, the rest pose shows");
}

// 8. A raise and a turn on the same hand both show.
{
  const turn = { step: "move", track: 2, start: 0.5, length: 1, on: { ik: "RightHand" }, keys: [{ at: 0, turn: { pitch: 45 } }] };
  const both = run([baseBlock, moveA(), turn], still);
  const raiseOnly = run([baseBlock, moveA()], still);
  const t = 1.3;
  const d = dist(world(both.frames, "RightHand", t).position, world(raiseOnly.frames, "RightHand", t).position);
  check(d < 0.001, `the hand is raised as by the raise alone (${(d * 1000).toFixed(2)} mm)`);
  const a = core.angleBetween(world(both.frames, "RightHand", t).rotation, world(still, "RightHand", t).rotation);
  check(Math.abs(a - 45) < 0.5, `and turned 45° by the turn (${a.toFixed(2)}°)`);
}

// 9. The same thing on two tracks: the upper wins. 10. Weight 0.5 goes halfway. 11. Add puts a change on top.
{
  // Relative turns (degrees) for weight and Add; poses (quaternions, the bone's local rotation) for the upper track winning.
  const head = (track, yaw, extra = {}) => ({ step: "move", track, start: 0, length: 4, on: { bones: ["Head"] }, keys: [{ at: 0, turn: extra.pose ? qy(yaw) : { yaw } }], ...extra });
  const head0 = world(still, "Head", 1).rotation;
  const angle = (r) => core.angleBetween(world(r.frames, "Head", 1).rotation, head0);
  check(Math.abs(angle(run([baseBlock, head(1, 30, { pose: true }), head(2, -20, { pose: true })], still)) - 20) < 0.01, "the upper track's turn wins on the same bone");
  check(Math.abs(angle(run([baseBlock, head(1, 40, { weight: 0.5 })], still)) - 20) < 0.01, "weight 0.5 turns halfway");
  check(Math.abs(angle(run([baseBlock, head(1, 30), head(2, 10, { mode: "add" })], still)) - 40) < 0.01, "Add turns 10° on top of 30°");
}

// 12. Not only people: an AV's door turns and its ramp slides, with no IK.
{
  const av = rig([["Root", null, [0, 0, 0]], ["body", "Root", [0, 0.8, 0]], ["door_fl", "body", [0.9, 0, 1.2]], ["ramp", "body", [0, -0.3, -2]]]);
  const parked = clip(av, 2);
  const p = core.rigProfile(av.map((n) => n.name));
  check(p.kind === "rig" && !Object.keys(p.chains).length, "an AV's rig is no person's: no arms or legs");
  const r = core.evaluateTimeline(parked, [
    { step: "move", track: 0, start: 0, length: 2, on: { bones: ["door_fl"] }, keys: [{ at: 1, turn: { yaw: 70 } }], ease: "smooth" },
    { step: "move", track: 1, start: 0, length: 2, on: { bones: ["ramp"] }, keys: [{ at: 1, place: { forward: 1 } }] },
  ]);
  const a = core.angleBetween(r.frames.rot.get("door_fl")[30], [0, 0, 0, 1]);
  check(Math.abs(a - 70) < 0.01, `the door is open 70° at 1 s (${a.toFixed(2)}°)`);
  const half = core.angleBetween(r.frames.rot.get("door_fl")[15], [0, 0, 0, 1]);
  // The move starts from the frame before it (-1), so 0.5 s is 16 of its 31 frames to the key.
  const smooth = (x) => x * x * (3 - 2 * x);
  check(Math.abs(half - 70 * smooth(16 / 31)) < 0.01, `and on the smooth curve at 0.5 s (${half.toFixed(2)}°)`);
  const slid = dist(r.frames.pos.get("ramp")[30], [0, -0.3, -2]);
  check(Math.abs(slid - 1) < 0.001, `the ramp slid 1 m (${slid.toFixed(4)} m)`);
  check(r.frames.keyed.includes("ramp/translation"), "the ramp's slide is written");
  let said = "";
  try {
    core.evaluateTimeline(parked, [{ step: "move", track: 0, start: 0, length: 1, on: { ik: "RightHand" }, keys: [{ at: 1, place: { up: 1 } }] }]);
  } catch (e) {
    said = e.message;
  }
  check(/not a person's/.test(said), `a move by IK on it says why it cannot (${said})`);
}

// 13. A lane turned off is left out; overlapping blocks on a lane are refused.
{
  const r = run([baseBlock, moveA(), { step: "track", track: 1, off: true }]);
  check(dist(world(r.frames, "RightHand", 1.4).position, world(base, "RightHand", 1.4).position) < 1e-9, "a lane turned off leaves the clip as below it");
  let said = "";
  try {
    run([baseBlock, moveA(0.5), moveB(1)]);
  } catch (e) {
    said = e.message;
  }
  check(/overlap/.test(said), "two blocks overlapping on a lane are refused");
  const end = run([baseBlock, moveA(), { step: "end", at: 3 }]);
  check(end.frames.count === 91, `the end marker sets the length (${end.frames.count} frames)`);
}

// 14. applyEdits runs the timeline, then the other steps, on a .glb.
{
  const glb = core.readGlb(core.writeFrames(base));
  const steps = core.withBase([moveA(), { step: "blend", track: 1, start: 1.5, length: 1 }, { step: "trim", to: 3 }], 4);
  check(steps[0].step === "anim" && steps[0].clip === "base", "withBase puts the clip as made under the blocks");
  const out = await core.applyEdits(glb, steps);
  check(out.report.steps[0].step === "timeline" && out.frames.count === 91, `applyEdits: ${out.report.steps.map((s) => `${s.step}: ${s.did}`).join("; ")}`);
}

// 15. The timeline runs in a page: its bundle for the browser needs nothing from Node.
{
  const here = path.dirname(fileURLToPath(import.meta.url));
  const r = await esbuild.build({ entryPoints: [path.join(here, "../src/timeline.ts")], bundle: true, platform: "browser", format: "esm", write: false, logLevel: "silent" });
  const js = r.outputFiles[0].text;
  check(!/node:|require\(/.test(js), `the page bundle has no Node imports (${(js.length / 1024).toFixed(0)} KB)`);
}

console.log(failed ? `${failed} failed` : "all passed");
process.exit(failed ? 1 : 0);
