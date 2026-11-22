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
  const fitted = core.fitClip(core.readGlb(fs.readFileSync(motionFile)), reference, "probe_d__wave");
  const r = fitted.report;
  console.log(`     fit: ${r.duration.toFixed(2)} s, ${r.frames} frames, ${r.channels.written} channels (${r.channels.fromMotion} from the motion), lift ${(r.grounding.lift * 100).toFixed(1)} cm, rest pose within ${r.restDifference.degrees.toFixed(3)} degrees (${r.restDifference.bone}), missing ${r.missingBones.length}`);
  check(r.channels.written === 142 && r.missingBones.length === 0 && r.restDifference.degrees < 0.1, "the fit writes every channel, on the game's own skeleton");
  const added = await core.addClip(bridge, project, rig, "probe_d__wave", fitted.glb, { seconds: r.duration }, undefined, "probe\\anims\\probe_d.anims");
  check(added.added.includes("probe_d__wave"), `added to ${added.set} (from ${added.from})`);
  const replacing = core.fitClip(core.readGlb(fs.readFileSync(motionFile)), reference, rig.referenceClip);
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
  const names = await core.clipsIn(bridge, path.join(project.archiveDir, ...rig.referenceSet.split("\\")));
  check(names.length === 292 && names.includes("stand__2h_on_sides__01__stretch_arms__01"), `the replaced set keeps its ${names.length} clips`);

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
    check(dl.equals(fs.readFileSync(motionFile)), `the download of Probe D's motion is the file the probe kept (${dl.length.toLocaleString()} bytes)`);
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
  check(core.clipNameFor("A man stands relaxed, raises his right hand and waves hello") === "man_stands_relaxed_raises" && core.cost("text-to-motion-3.0", 5) === 0.5, "clip names and costs");
} finally {
  b.stop();
}
console.log(failed ? `${failed} failed` : "all passed", `(scratch: ${scratch})`);
process.exit(failed ? 1 : 0);
