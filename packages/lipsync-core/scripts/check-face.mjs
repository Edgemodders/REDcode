// Test of the head for the Lip Sync tab (docs/research/lipsync.md, "R-face") against the game, without VS Code: a head's
// parts, its facial setup read into the solver's shape, the meshes exported on the face rig, and the solver on
// numbers. Needs the game and REDbridge 0.16.0 or later.
// Usage (after npm run build --workspace packages/lipsync-core): node scripts/check-face.mjs [<outFolder>]
// With outFolder it also writes the head's GLBs posed at one frame of a real line (game data: keep it out of the repo).
import { createRequire } from "node:module";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";

const require = createRequire(import.meta.url);
process.env.LIPSYNC_CACHE ??= fs.mkdtempSync(path.join(os.tmpdir(), "lipsync-face-"));
const core = require("./bridge.cjs");
const out = process.argv[2];

const failed = [];
const check = (ok, what) => {
  console.log(`${ok ? "ok  " : "FAIL"} ${what}`);
  if (!ok) failed.push(what);
};
const timed = async (what, run) => {
  const t = Date.now();
  const r = await run();
  console.log(`     ${what}: ${Date.now() - t} ms`);
  return r;
};
/** The angle, in degrees, a bone has turned from its rest pose. */
const turned = (face, pose, bone) => {
  const o = face.bones.indexOf(bone) * 7;
  const dot = Math.abs(pose[o] * face.rest[o] + pose[o + 1] * face.rest[o + 1] + pose[o + 2] * face.rest[o + 2] + pose[o + 3] * face.rest[o + 3]);
  return (2 * Math.acos(Math.min(1, dot)) * 180) / Math.PI;
};

const { client, call } = await core.startBridge();
try {
  const head = await timed("the woman's head", () => core.headModel(call, { app: core.DefaultHeads.woman }));
  const face = head.face;
  check(head.meshes.some((m) => m.kind === "skin") && head.meshes.some((m) => m.kind === "teeth") && head.meshes.some((m) => m.kind === "eyes"), `the head has skin, teeth and eyes (${head.meshes.map((m) => m.kind).join(", ")})`);
  check(head.models.length >= 3 && head.models.every((m) => fs.existsSync(m.file)), `${head.models.length} meshes exported as glTF`);
  const glbJson = (file) => {
    const b = fs.readFileSync(file);
    return JSON.parse(b.subarray(20, 20 + b.readUInt32LE(12)).toString("utf8"));
  };
  const skin = glbJson(head.models.find((m) => m.kind === "skin").file);
  const joints = skin.skins[0].joints.map((n) => skin.nodes[n].name);
  check(joints.length === face.bones.length && joints.every((n, i) => n === face.bones[i]), `the exported skin's joints are the rig's ${face.bones.length} bones, in order`);
  check(face.bones.length === 344 && face.tracks.length === 414, `344 bones and 414 tracks (${face.bones.length}, ${face.tracks.length})`);
  check(face.layout.main === 13 && face.layout.overrides === 154 && face.layout.lipsync === 240 && face.layout.wrinkles === 381, `the track groups start at 13, 154, 240, 381 (${Object.values(face.layout).join(", ")})`);
  check(face.tracks[face.layout.lipsync + (face.tracks.indexOf("jaw_mid_open") - face.layout.main)] === "jaw_mid_openLipsyncPoseOutput", "a pose's lip sync output is found from its weight track");
  const [f, tongue, eyes] = face.parts;
  check(f.poses.length === 121 && f.correctives.length === 255 && tongue.poses.length === 18 && eyes.poses.length === 12, `face 121 poses and 255 correctives, tongue 18, eyes 12 (${f.poses.length}, ${f.correctives.length}, ${tongue.poses.length}, ${eyes.poses.length})`);
  check(f.main.start.length === 133 && f.main.bones.length * 7 === f.main.values.length, `the face's 133 pose entries, 7 numbers a bone change (${f.main.start.length})`);
  const lone = f.correctives.filter((c) => c.poses.length + c.entries.length < 2).length;
  check(f.correctives.every((c) => c.poses.length + c.entries.length >= 1) && lone <= 8, `every face corrective has parents, nearly all two or more (${lone} with one)`);

  const again = await timed("the same head again", () => core.headModel(call, { app: core.DefaultHeads.woman }));
  check(again.models.length === head.models.length && again.face.bones.length === 344, "a second read comes from the cache");

  const solver = core.faceSolver(face);
  const values = new Float32Array(face.tracks.length);
  const t = (name) => face.tracks.indexOf(name);
  let pose = solver.solve(values);
  check(face.rest.every((v, i) => Math.abs(pose[i] - v) < 1e-6), "no track moving gives the rest pose");

  const jaw = "mid_J_jaw_JNT";
  /** How far a pose is from the rest pose: the largest change of any number. */
  const moved = (p) => face.rest.reduce((most, v, i) => Math.max(most, Math.abs(p[i] - v)), 0);
  values[t("jaw_mid_openLipsyncPoseOutput")] = 1;
  pose = solver.solve(values);
  const open = turned(face, pose, jaw);
  check(open > 15 && open < 25, `the jaw's lip sync output at 1 turns the jaw about 20 degrees (${open.toFixed(1)})`);
  values[t("jaw_mid_openLipsyncPoseOutput")] = 0.5;
  const half = turned(face, solver.solve(values), jaw);
  check(half > 7 && half < 12, `at 0.5 the half-open in-between turns it about 9.4 degrees (${half.toFixed(1)})`);
  values[t("jaw_mid_openLipsyncPoseOutput")] = 0.25;
  const quarter = turned(face, solver.solve(values), jaw);
  check(Math.abs(quarter - half / 2) < 0.6, `at 0.25, half of that (${quarter.toFixed(1)})`);

  // The acting, on a lower-face pose (the jaw belongs to neither half).
  values.fill(0);
  values[t("lips_l_funnelLipsyncPoseOutput")] = 1;
  const funnel = moved(solver.solve(values));
  check(funnel > 0.001, `a lip pose's lip sync output moves the lips (${funnel.toFixed(4)})`);
  values.fill(0);
  values[t("lips_l_funnel")] = 1;
  values[t("lowerFace")] = 1;
  check(Math.abs(moved(solver.solve(values)) - funnel) < 1e-5, "the pose's own weight track moves them the same");
  values[t("lowerFace")] = 0;
  check(moved(solver.solve(values)) < 1e-6, "with the lower face at 0 the acting is off");
  check(Math.abs(moved(solver.solve(values, { halves: false })) - funnel) < 1e-5, "and stays when the halves are not applied");
  values[t("lowerFace")] = 1;
  values[t("lipSyncEnvelope")] = 1;
  values[t("lips_l_funnelAnimOverrideWeight")] = 0;
  check(moved(solver.solve(values)) < 1e-6, "an override weight of 0 mutes the acting while lip sync plays");
  values[t("lips_l_funnelLipsyncPoseOutput")] = 1;
  check(moved(solver.solve(values)) > funnel * 0.3, "and the lip sync output still comes through");

  values.fill(0);
  values[t("jaw_mid_openLipsyncPoseOutput")] = 1;
  values[t("lips_together_upLipsyncPoseOutput")] = 1;
  const w = solver.weights(values)[0];
  const on = [...w.corrective].filter((v) => v > 0).length;
  check(on >= 1, `the jaw open with the lips together turns correctives on (${on})`);

  const speed = await timed("1000 solves", async () => {
    values.fill(0);
    for (let i = 0; i < 1000; i++) {
      values[t("jaw_mid_openLipsyncPoseOutput")] = (i % 100) / 100;
      values[t("lips_l_funnelLipsyncPoseOutput")] = ((i * 7) % 100) / 100;
      solver.solve(values);
    }
  });
  void speed;

  // One frame of a real line: Angie's "There you are."
  const set = "base\\animations\\lipsync\\en\\main_quests\\mq306\\mq306_04b_angie_meeting\\angelica_whelan.anims";
  const lines = await core.lipsyncLines(call, { character: "angelica_whelan", scene: "mq306_04b_angie_meeting" });
  const line = lines.scenes[0].lines.find((l) => l.clip === "f_2CE9C077837E0000");
  const clip = await timed("the line's clip", () => core.lipsyncClip(call, { set: lines.scenes[0].set ?? set, clip: line.clip }));
  let widest = { at: 0, angle: 0 };
  for (let frame = 0; frame <= clip.frames; frame++) {
    const at = frame / clip.fps;
    const v = core.clipValues(face, clip, at);
    const angle = turned(face, solver.solve(v, { halves: false }), jaw);
    if (angle > widest.angle) widest = { at, angle };
  }
  check(widest.angle > 2 && widest.angle < 25, `the jaw opens during "There you are." (widest ${widest.angle.toFixed(1)} degrees at ${widest.at.toFixed(2)} s)`);

  // A main character's own head, from the rig her lip sync sets name (it lives under main_npc, not head).
  const panamRig = "base\\characters\\main_npc\\panam\\h0_001_wa_c__panam\\h0_001_wa_c__panam_skeleton.rig";
  const panam = await timed("Panam's head, by its rig", () => core.headModel(call, { rig: panamRig }));
  check(panam.rig === panamRig && panam.models.find((m) => m.kind === "skin")?.file.endsWith("h0_001_wa_c__panam.glb"), `a main character's rig gives her own head (${panam.models.map((m) => m.kind).join(", ")})`);
  check(core.rigGender(panamRig) === "woman" && core.rigGender("base\\characters\\main_npc\\jackie\\h0_001_mb_c__jackie_welles\\h0_001_mb_c__jackie_welles_skeleton.rig") === "man", "a rig's name says a woman's head from a man's");

  const man = await timed("the man's head", () => core.headModel(call, { app: core.DefaultHeads.man }));
  check(man.face.tracks.length === 414 && man.face.tracks.every((n, i) => n === face.tracks[i]), "the man's head has the same 414 tracks in the same order");
  check(man.models.some((m) => m.kind === "skin"), `his head exports too (${man.models.map((m) => m.kind).join(", ")})`);

  if (out) {
    fs.mkdirSync(out, { recursive: true });
    const v = core.clipValues(face, clip, widest.at);
    const posed = solver.solve(v, { halves: false });
    for (const m of head.models) {
      const b = fs.readFileSync(m.file);
      const n = b.readUInt32LE(12);
      const g = JSON.parse(b.subarray(20, 20 + n).toString("utf8"));
      g.skins[0].joints.forEach((node, bone) => {
        const [translation, rotation] = core.boneToGltf(posed, bone);
        g.nodes[node].translation = translation;
        g.nodes[node].rotation = rotation;
      });
      let j = Buffer.from(JSON.stringify(g), "utf8");
      if (j.length % 4) j = Buffer.concat([j, Buffer.alloc(4 - (j.length % 4), 0x20)]);
      const h = Buffer.alloc(20);
      h.writeUInt32LE(0x46546c67, 0);
      h.writeUInt32LE(2, 4);
      h.writeUInt32LE(20 + j.length + (b.length - 20 - n), 8);
      h.writeUInt32LE(j.length, 12);
      h.writeUInt32LE(0x4e4f534a, 16);
      fs.writeFileSync(path.join(out, `${m.kind}.glb`), Buffer.concat([h, j, b.subarray(20 + n)]));
    }
    console.log(`wrote the head at ${widest.at.toFixed(2)} s of the line to ${out}`);
  }
} finally {
  client.stop();
}
if (failed.length) {
  console.error(`FAILED: ${failed.length} of the checks`);
  process.exit(1);
}
console.log("ok");
process.exit(0);
