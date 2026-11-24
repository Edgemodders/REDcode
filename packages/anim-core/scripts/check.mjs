// anim-core's check on the PC (AT1 in REDcode's docs/design/animation-tools.md): against the game and Uthana,
// never in CI, and nothing it reads or writes is committed.
//   node scripts/check.mjs <REDbridge.exe> <game folder> <Probe D's project folder>
// 1. Probe D again through the library: from the motion Probe D downloaded, fit, add and replace into a fresh
//    project, and the probe's own script into another; the written sets must be byte for byte the same.
// 2. Uthana, free calls only: the key works, the stand-in uploads to the same character, and the download of
//    Probe D's motion matches the file the probe kept. No job is started, so nothing is charged.
// 3. The woman's rig: its reference clip and stand-in export, and the clip names the rig's bones.
import { createRequire } from "node:module";
import { spawnSync } from "node:child_process";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import * as core from "../dist/index.mjs";

const [exe, game, probeDir] = process.argv.slice(2);
if (!exe || !game || !probeDir) {
  console.log("node scripts/check.mjs <REDbridge.exe> <game folder> <Probe D's project folder>");
  process.exit(1);
}
const here = path.dirname(fileURLToPath(import.meta.url));
const repo = path.resolve(here, "../../..");
const req = createRequire(path.join(repo, "extensions/redcode/package.json"));
const { BridgeClient, KeyAccess } = req("./dist/bridgeClient.js");

let failed = 0;
const check = (ok, what) => {
  console.log(`${ok ? "ok  " : "FAIL"} ${what}`);
  if (!ok) failed++;
};

const state = JSON.parse(fs.readFileSync(path.join(probeDir, "probe-d.json"), "utf8"));
const motionFile = state.motions.at(-1).files.inplace;
const scratch = fs.mkdtempSync(path.join(os.tmpdir(), "anim-core-check-"));
const cacheDir = path.join(os.tmpdir(), "anim-core-cache");

// The probe's script into project A, from a copy of its state and download.
const a = path.join(scratch, "AnimProbeD");
fs.mkdirSync(path.join(a, "uthana"), { recursive: true });
fs.copyFileSync(motionFile, path.join(a, "uthana", path.basename(motionFile)));
const moved = JSON.parse(JSON.stringify(state));
for (const m of moved.motions) for (const k of Object.keys(m.files)) m.files[k] = path.join(a, "uthana", path.basename(m.files[k]));
fs.writeFileSync(path.join(a, "probe-d.json"), JSON.stringify(moved));
const probe = path.join(repo, "tools/probes/anim-probe-d/probe.mjs");
for (const args of [["fit", "wave"], ["replace"]]) {
  const r = spawnSync(process.execPath, [probe, args[0], exe, game, a, ...args.slice(1)], { encoding: "utf8", timeout: 600000 });
  check(r.status === 0, `the probe's ${args[0]} ran${r.status ? `: ${(r.stdout + r.stderr).split(/\r?\n/).filter((l) => /FAILED/.test(l)).join(" ")}` : ""}`);
}

const b = new BridgeClient({ exe, gamePath: game, keys: true });
b.start();
try {
  const bridge = core.asBridge(b);
  const rig = core.Rigs.man_base;

  // 1. The library into project B.
  const project = core.ensureProject(path.join(scratch, "LibraryD"), "AnimProbeD");
  const reference = await core.referenceClip(bridge, cacheDir, rig);
  // As the probe made it (no facing turn, which came after Probe D), for the byte for byte comparison.
  const fitted = core.fitClip(core.readGlb(fs.readFileSync(motionFile)), reference, "probe_d__wave", { face: false });
  // The default fit turns the motion to face as the game's idle does (the pack's first in-game run).
  const faced = core.fitClip(core.readGlb(fs.readFileSync(motionFile)), reference, "faced").report;
  check(Math.abs(Math.abs(faced.facing) - 146) < 3, `the fit turns Uthana's motion ${faced.facing.toFixed(0)} degrees to face as the game's clips do`);
  // In place (AT3 run 2): the same motion given a travel on its Root, a 50 cm drift plus a 15 cm sway. The fit
  // takes the drift out and keeps the sway: the left heel is where the plain fit has it, moved by the sway alone.
  {
    const g = core.readGlb(fs.readFileSync(motionFile));
    const anim0 = g.json.animations[0];
    const rootNode = g.json.nodes.findIndex((n) => n.name === "Root");
    const ch = anim0.channels.find((c) => c.target.node === rootNode && c.target.path === "translation");
    const sampler = anim0.samplers[ch.sampler];
    const times = core.readAccessor(g, sampler.input).map((v) => v[0]);
    const acc = g.json.accessors[sampler.output];
    const view = g.json.bufferViews[acc.bufferView];
    const bin = Buffer.from(g.bin);
    const T = times.at(-1) - times[0];
    const sway = (t) => 0.15 * Math.sin((2 * Math.PI * (t - times[0])) / T);
    times.forEach((t, i) => {
      const at = (view.byteOffset ?? 0) + (acc.byteOffset ?? 0) + i * 12;
      bin.writeFloatLE(bin.readFloatLE(at) + 0.5 * ((t - times[0]) / T) + sway(t), at);
    });
    const travelling = { ...g, bin };
    const plain = core.fitClip(g, reference, "plain", { face: false });
    const kept = core.fitClip(travelling, reference, "kept", { face: false, inPlace: true });
    const heel = (glb) => {
      const f = core.readGlb(glb);
      const nodes = f.json.nodes;
      const a0 = f.json.animations[0];
      const tracks = new Map(a0.channels.map((c) => [`${c.target.node}/${c.target.path}`, core.readAccessor(f, a0.samplers[c.sampler].output)]));
      const parent = new Map();
      nodes.forEach((n, i) => (n.children ?? []).forEach((c) => parent.set(c, i)));
      const compose = (t = [0, 0, 0], q = [0, 0, 0, 1]) => {
        const [x, y, z, w] = q;
        return [1 - 2 * (y * y + z * z), 2 * (x * y + z * w), 2 * (x * z - y * w), 0, 2 * (x * y - z * w), 1 - 2 * (x * x + z * z), 2 * (y * z + x * w), 0, 2 * (x * z + y * w), 2 * (y * z - x * w), 1 - 2 * (x * x + y * y), 0, t[0], t[1], t[2], 1];
      };
      const mul = (p, q) => {
        const o = new Array(16).fill(0);
        for (let c = 0; c < 4; c++) for (let r = 0; r < 4; r++) for (let k = 0; k < 4; k++) o[c * 4 + r] += p[k * 4 + r] * q[c * 4 + k];
        return o;
      };
      const target = nodes.findIndex((n) => n.name === "LeftHeel");
      return times.map((_, i) => {
        const world = (j) => {
          const local = compose(tracks.get(`${j}/translation`)?.[i] ?? nodes[j].translation, tracks.get(`${j}/rotation`)?.[i] ?? nodes[j].rotation);
          return parent.has(j) ? mul(world(parent.get(j)), local) : local;
        };
        const m = world(target);
        return [m[12], m[13], m[14]];
      });
    };
    const p = heel(plain.glb);
    const k = heel(kept.glb);
    const off = (i) => Math.hypot(k[i][0] - p[i][0], k[i][1] - p[i][1], k[i][2] - p[i][2]);
    const worst = Math.max(...times.map((t, i) => Math.abs(off(i) - Math.abs(sway(t)))));
    const tr = kept.report.travel;
    // The Root holds still, as in the game's own clips (AT3 run 2: a keyed Root turned the feet with the hips, and
    // the character rose in the game).
    const keptGlb = core.readGlb(kept.glb);
    const ka = keptGlb.json.animations[0];
    const rootKeys = ka.channels.filter((c) => keptGlb.json.nodes[c.target.node].name === "Root").flatMap((c) => core.readAccessor(keptGlb, ka.samplers[c.sampler].output));
    check(rootKeys.length > 0 && rootKeys.every((v) => (v.length === 4 ? Math.abs(v[3]) > 0.99999 : Math.hypot(...v) < 1e-6)), `in place: the Root holds still, its ${tr.turn.toFixed(0)} degree turn moved onto the hips`);
    check(worst < 0.002 && off(0) < 0.002 && off(times.length - 1) < 0.002 && Math.abs(tr.net - 0.5) < 0.01 && Math.abs(tr.kept - 0.15) < 0.01,
      `in place: a 50 cm drift taken out (${(tr.net * 100).toFixed(1)} cm), the 15 cm sway kept on the hips (${(tr.kept * 100).toFixed(1)} cm; the heel within ${(worst * 1000).toFixed(1)} mm of it)`);
  }
  const r = fitted.report;
  console.log(`     fit: ${r.duration.toFixed(2)} s, ${r.frames} frames, ${r.channels.written} channels (${r.channels.fromMotion} from the motion), lift ${(r.grounding.lift * 100).toFixed(1)} cm, rest pose within ${r.restDifference.degrees.toFixed(3)} degrees (${r.restDifference.bone}), missing ${r.missingBones.length}`);
  check(r.channels.written === 142 && r.missingBones.length === 0 && r.restDifference.degrees < 0.1, "the fit writes every channel, on the game's own skeleton");
  const added = await core.addClip(bridge, project, rig, "probe_d__wave", fitted.glb, { seconds: r.duration }, undefined, "probe\\anims\\probe_d.anims");
  check(added.added.includes("probe_d__wave"), `added to ${added.set} (from ${added.from})`);
  const replacing = core.fitClip(core.readGlb(fs.readFileSync(motionFile)), reference, rig.referenceClip, { face: false });
  const replaced = await core.replaceClip(bridge, project, rig.referenceSet, rig.referenceClip, replacing.glb);
  check(replaced.updated.includes(rig.referenceClip) && replaced.from === "template", `replaced ${rig.referenceClip} in a copy of the game's set (from ${replaced.from})`);
  for (const set of ["probe\\anims\\probe_d.anims", rig.referenceSet]) {
    const x = fs.readFileSync(path.join(a, "source", "archive", ...set.split("\\")));
    const y = fs.readFileSync(path.join(project.archiveDir, ...set.split("\\")));
    check(x.equals(y), `${path.basename(set)}: the library's set is byte for byte the probe's (${x.length.toLocaleString()} bytes)`);
  }
  // A made animation in its own set, with its record as EDGEdir reads it (EDGEfab #7); made again, its id stays.
  const own = await core.addClip(bridge, project, rig, "wave_hello", fitted.glb, { seconds: r.duration }, { motion: fs.readFileSync(motionFile), record: { service: "uthana" } });
  const again = await core.addClip(bridge, project, rig, "wave_hello", fitted.glb, { seconds: r.duration });
  const madeOne = core.madeClips(project).find((m) => m.name === "wave_hello");
  check(own.set === "animprobed\\anims\\wave_hello\\wave_hello.anims" && madeOne?.set === own.set && fs.existsSync(madeOne.glb) && fs.existsSync(path.join(project.archiveDir, ...own.set.split("\\"))), `a made clip gets its own set (${own.set}), its .glb and its record`);
  check(again.record.id === own.record.id && madeOne?.kind === "anim" && madeOne.anim.rig === rig.rig && madeOne.anim.seconds > 4.9 && madeOne.anim.fps === 30 && madeOne.anim.name === "wave_hello" && !madeOne.anim.rootMotion, `the record has EDGEdir's facts, and the id stays (${own.record.id})`);
  // EDGEfab #7's asks: a license like its prop records', and a clip with EDGEfab's edits not made again silently.
  const licensed = await core.addClip(bridge, project, rig, "wave_hello", fitted.glb, { seconds: r.duration, license: core.uthanaLicense() });
  const editedFile = licensed.files.find((f) => f.endsWith(".edgefab.json"));
  fs.writeFileSync(editedFile, JSON.stringify({ ...licensed.record, edited: new Date().toISOString(), edits: [{ kind: "trim" }] }));
  let refused = false;
  try {
    await core.addClip(bridge, project, rig, "wave_hello", fitted.glb, { seconds: r.duration });
  } catch (e) {
    refused = e instanceof core.EditedClipError;
  }
  const allowed = await core.addClip(bridge, project, rig, "wave_hello", fitted.glb, { seconds: r.duration, overwriteEdited: true });
  check(licensed.record.license?.source === "uthana" && licensed.record.license.plan === "paid" && !!licensed.record.license.note, "the record carries a license, shaped like EDGEfab's");
  check(refused && allowed.record.id === own.record.id && !core.hasEdits(core.recordOf(project, "wave_hello")), "a clip with EDGEfab's edits is refused unless allowed, and keeps its id when made again");
  const names = await core.clipsIn(bridge, path.join(project.archiveDir, ...rig.referenceSet.split("\\")));
  check(names.length === 292 && names.includes("stand__2h_on_sides__01__stretch_arms__01"), `the replaced set keeps its ${names.length} clips`);

  // 1b. The Animation Editor's steps (AE1, docs/design/animation-editor.md), on the made clip "wave_hello".
  {
    const clip = core.readGlb(fs.readFileSync(madeOne.glb));
    const before = core.framesOf(clip);
    const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
    // Normalised first: the clips' quaternions are stored a little off unit length, which reads as a degree or two apart.
    const unit = (q) => { const n = Math.hypot(...q) || 1; return q.map((x) => x / n); };
    const angle = (a, b) => { const x = unit(a); const y = unit(b); return (2 * Math.acos(Math.min(1, Math.abs(x[0] * y[0] + x[1] * y[1] + x[2] * y[2] + x[3] * y[3]))) * 180) / Math.PI; };
    const contacts = core.footContacts(clip);
    console.log(`     feet: ${contacts.map((c) => `${c.bone} ${c.from.toFixed(2)}-${c.to.toFixed(2)} s slides ${(c.slide * 100).toFixed(1)} cm`).join("; ") || "no contact"}`);
    check(contacts.length > 0, `the feet report finds where the feet rest (${contacts.length} contacts)`);
    // Pin: the left foot held from 1 s to 3 s, within 1 mm, its turn kept.
    const pinned = await core.applyEdits(clip, [{ step: "pin", bone: "LeftFoot", from: 1, to: 3 }]);
    const path0 = core.worldPath(pinned.frames, "LeftFoot");
    const held = path0.slice(30, 91);
    const drift = Math.max(...held.map((p) => dist(p.position, held[0].position)));
    const turnDrift = Math.max(...held.map((p) => angle(p.rotation, held[0].rotation)));
    check(drift < 0.001 && turnDrift < 0.5, `pin: the left foot holds within ${(drift * 1000).toFixed(2)} mm and ${turnDrift.toFixed(2)} degrees from 1 s to 3 s`);
    // Key: the head turned 30 degrees about the character's up at 2 s, exactly there, nothing far from it changed.
    const keyed = await core.applyEdits(clip, [{ step: "key", bone: "Head", at: 2, turn: { yaw: 30 }, blend: 0.5 }]);
    const headBefore = core.worldPath(before, "Head");
    const headAfter = core.worldPath(keyed.frames, "Head");
    const at2 = angle(headBefore[60].rotation, headAfter[60].rotation);
    const far = angle(headBefore[0].rotation, headAfter[0].rotation);
    check(Math.abs(at2 - 30) < 0.5 && far < 0.01, `key: the head turned ${at2.toFixed(1)} degrees at 2 s, ${far.toFixed(3)} at 0 s`);
    // Layer: the game's idle on the right hand from 1 s; the other bones untouched.
    const layered = await core.applyEdits(clip, [{ step: "layer", source: { file: "reference" }, group: "rightHand", at: 1 }], { layer: async () => reference });
    const hand = core.bonesOf("rightHand", [...before.rot.keys()]);
    let others = 0;
    let moved = 0;
    for (const [bone, frames] of before.rot) {
      for (const i of [45, 75]) {
        const d = angle(frames[i], layered.frames.rot.get(bone)[i]);
        if (hand.includes(bone)) moved = Math.max(moved, d);
        else others = Math.max(others, d);
      }
    }
    check(hand.length >= 15 && moved > 1 && others < 0.02, `layer: ${hand.length} right hand bones change (up to ${moved.toFixed(1)} degrees), the other bones not at all`);
    // Trim and loop: 0.5 s to 3.5 s, and the last frame back at the first.
    const looped = await core.applyEdits(clip, [{ step: "trim", from: 0.5, to: 3.5 }, { step: "loop", blend: 0.5 }]);
    const lf = looped.frames;
    const ends = Math.max(...[...lf.rot.values()].map((v) => angle(v[0], v[lf.count - 1])));
    check(Math.abs(looped.report.seconds - 3) < 1e-9 && ends < 0.01, `trim and loop: ${looped.report.seconds} s, the last frame within ${ends.toFixed(3)} degrees of the first`);
    // Suggested pins for every sliding contact.
    const suggested = core.suggestPins(contacts, 0);
    check(suggested.length === contacts.length && suggested.every((s) => s.step === "pin"), `the feet report suggests ${suggested.length} pin(s)`);

    // The edit list on the made clip: imported, recorded, the same clip again from the same list, and back to as made.
    const steps = [{ step: "pin", bone: "LeftFoot", from: 1, to: 3 }, { step: "key", bone: "Head", at: 2, turn: { yaw: 20 } }];
    const e1 = await core.editClip(bridge, project, "wave_hello", steps, { cacheDir });
    const glb1 = fs.readFileSync(madeOne.glb);
    const e2 = await core.editClip(bridge, project, "wave_hello", steps, { cacheDir });
    const glb2 = fs.readFileSync(madeOne.glb);
    const rec = core.recordOf(project, "wave_hello");
    const base = madeOne.glb.replace(/\.glb$/, ".base.glb");
    console.log(`     editClip: id ${e1.record.id === own.record.id}, edits ${rec.edits?.length}, edited ${!!rec.edited}, base ${fs.existsSync(base)}, same ${glb1.equals(glb2)}, imported ${JSON.stringify({ added: e2.added, updated: e2.updated })}`);
    check(e1.record.id === own.record.id && rec.edits?.length === 2 && !!rec.edited && core.hasEdits(rec) && fs.existsSync(base) && glb1.equals(glb2) && e2.updated.concat(e2.added).includes("wave_hello"),
      `editClip: imported, the record keeps its id with 2 edits, the base kept, and the same list makes the same clip (${glb1.length.toLocaleString()} bytes)`);
    let refusedEdited = false;
    try {
      await core.addClip(bridge, project, rig, "wave_hello", fitted.glb, { seconds: r.duration });
    } catch (e) {
      refusedEdited = e instanceof core.EditedClipError && /pin, key/.test(e.message);
    }
    await core.editClip(bridge, project, "wave_hello", [], { cacheDir });
    const rec0 = core.recordOf(project, "wave_hello");
    const restored = core.framesOf(core.readGlb(fs.readFileSync(madeOne.glb)));
    const apart = Math.max(...[...before.rot].map(([bone, v]) => Math.max(...v.map((q, i) => angle(q, restored.rot.get(bone)[i])))));
    check(refusedEdited && !core.hasEdits(rec0) && !fs.existsSync(base) && restored.count === before.count && apart < 0.01 && rec0.anim.seconds === madeOne.anim.seconds,
      `editClip: an edited clip is not made again silently (the message names its steps), and no steps puts the clip as made back (within ${apart.toFixed(4)} degrees)`);
  }

  // 2. Uthana, free calls only.
  const k = await b[KeyAccess]("keys.get", { service: "uthana", tool: "anim-core-check" });
  if (!k?.key) check(false, "an Uthana key in the shared key store");
  else {
    const u = core.uthana(k.key);
    await u.check();
    check(true, "the Uthana key works");
    const store = path.join(scratch, "characters.json");
    const c = await core.standIn(bridge, u, k.key, rig, cacheDir, store);
    check(c.uploaded && c.id === state.character.id, `the stand-in uploads to the same character (${c.id})`);
    const again = await core.standIn(bridge, u, k.key, rig, cacheDir, store);
    check(!again.uploaded && again.id === c.id, "a second ask is answered from the record, with no upload");
    check(!fs.readFileSync(store, "utf8").includes(k.key), "the record holds no key");
    const dl = await u.download(c.id, state.motions.at(-1).id, { fps: 30, inPlace: true });
    // The same motion as the probe kept, though not byte for byte: by 2026-11-24 Uthana served it re-exported (the
    // same channels and frames, fingers within about 1 degree, some quaternions with the other sign).
    const channelsIn = (g) => new Map(g.json.animations[0].channels.map((c) => [`${g.json.nodes[c.target.node].name}/${c.target.path}`, core.readAccessor(g, g.json.animations[0].samplers[c.sampler].output)]));
    const got = channelsIn(core.readGlb(dl));
    const kept = channelsIn(core.readGlb(fs.readFileSync(motionFile)));
    let apart = 0;
    for (const [n, v] of kept) {
      const w = got.get(n);
      if (!w || w.length !== v.length) apart = Infinity;
      else for (let i = 0; i < v.length; i++) apart = Math.max(apart, v[i].length === 4 ? (2 * Math.acos(Math.min(1, Math.abs(v[i].reduce((s, x, j) => s + x * w[i][j], 0)))) * 180) / Math.PI : Math.max(...v[i].map((x, j) => Math.abs(x - w[i][j]) * 100)));
    }
    check(got.size === kept.size && apart < 3, `the download of Probe D's motion is the motion the probe kept (${got.size} channels, within ${apart.toFixed(1)} degrees or cm)`);
  }

  // 3. The woman's rig.
  const w = core.Rigs.woman_base;
  const wRef = await core.referenceClip(bridge, cacheDir, w);
  const wBones = new Set(wRef.json.animations[0].channels.map((ch) => wRef.json.nodes[ch.target.node].name));
  check(wBones.size === 71 && ["Hips", "LeftHeel", "RightToeBase"].every((n) => wBones.has(n)), `the woman's reference clip animates ${wBones.size} bones by the game's names`);
  const wBody = core.readGlb(fs.readFileSync(await core.standInGlb(bridge, cacheDir, w)));
  const joints = new Set(wBody.json.skins[0].joints.map((j) => wBody.json.nodes[j].name));
  check([...wBones].every((n) => joints.has(n)), `the woman's stand-in (${wBody.json.skins[0].joints.length} joints) has every bone her clips animate`);
  check(core.rigFor(w.rig) === w && core.rigFor(rig.rig.toUpperCase()) === rig, "rigFor finds both rigs");
  check(core.promptFor("a man waves").startsWith("a man waves. Natural human movement") && core.promptFor("a man waves", "free") === "a man waves", "the grounding rule goes with the words, unless the feet are free");
  check(core.clipNameFor("A man stands relaxed, raises his right hand and waves hello") === "man_stands_relaxed_raises" && core.cost("text-to-motion-3.0", 5) === 0.5, "clip names and costs");
} finally {
  b.stop();
}
console.log(failed ? `${failed} failed` : "all passed", `(scratch: ${scratch})`);
process.exit(failed ? 1 : 0);
