// Bodies B2a: REDcode's run of a deformation graph against the game's. Takes a REDnode world_bones reading (REDnode #62:
// an NPC's bones, model space included), sets the body's own bones to the game's pose, runs webview/deformGraph.ts on
// it, and lists each helper's error against the game's helper, with the last node kind that wrote it.
//   node tools/probes/bodies/compare-bones.mjs <world_bones .json> [deform dir]
// The deform dir is deform-graph.mjs's output (deform.json and body.glb). Writes only into that folder.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const ext = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../extensions/redcode");
const require = createRequire(path.join(ext, "package.json"));
const THREE = require("three");
const esbuild = require("esbuild");

const [readingFile, dirArg] = process.argv.slice(2);
if (!readingFile) throw new Error("Give a world_bones reading (.json)");
const dir = dirArg ?? path.join(os.tmpdir(), "redcode-bodies", "man_base");
const bundle = path.join(dir, "deformGraph.cjs");
esbuild.buildSync({ entryPoints: [path.join(ext, "webview/deformGraph.ts")], bundle: true, platform: "node", format: "cjs", outfile: bundle, logLevel: "warning", absWorkingDir: ext });
const { createDeformer } = require(bundle);

// ---- the reading: every bone of every component, by name, with its model-space transform (game axes) ----
const reading = JSON.parse(fs.readFileSync(readingFile, "utf8"));
const comps = [];
const findComps = (v) => {
  if (!v || typeof v !== "object") return;
  if (Array.isArray(v)) return v.forEach(findComps);
  if (Array.isArray(v.bones) && v.bones.length && v.bones[0].name !== undefined) comps.push(v);
  else for (const x of Object.values(v)) findComps(x);
};
findComps(reading);
if (!comps.length) throw new Error("No components with bones in the reading");
const game = new Map();
for (const c of comps) for (const b of c.bones) if (b.model && !game.has(b.name)) game.set(b.name, { model: b.model, comp: c.name ?? c.component ?? "?", rig: b.rig ?? b.part });
// The body's own bones: since REDnode 0.76.1 one object answers for root, face and deformations (512 bones), each bone
// naming its rig by an index into the component's rigs; the body's rig is the one with 71 bones. Before, one component each.
let driven;
const withRigs = comps.find((c) => Array.isArray(c.rigs) && c.bones.some((b) => b.rig !== undefined));
if (withRigs) {
  const count = (r) => (typeof r === "number" ? r : r?.count ?? r?.bones ?? r?.boneCount);
  // REDnode 0.76.1 names each rig by its depot path's FNV-1a 64 hash, as 16 hex digits: the body rigs' hashes first.
  const BodyRigs = new Set([14264052059588999261n /* man_base.rig */, 10037276762472186253n /* woman_base.rig */]);
  const hashOf = (r) => {
    try {
      return typeof r?.path === "string" ? BigInt(r.path.startsWith("0x") ? r.path : `0x${r.path}`) : null;
    } catch {
      return null;
    }
  };
  let bodyRig = withRigs.rigs.findIndex((r) => BodyRigs.has(hashOf(r)));
  if (bodyRig < 0) bodyRig = withRigs.rigs.findIndex((r) => count(r) === 71);
  if (bodyRig < 0) throw new Error(`No 71-bone rig among ${JSON.stringify(withRigs.rigs).slice(0, 300)}`);
  driven = new Set(withRigs.bones.filter((b) => b.rig === bodyRig).map((b) => b.name));
} else {
  const rootComp = comps.find((c) => /root/i.test(c.name ?? c.component ?? "")) ?? comps[0];
  driven = new Set(rootComp.bones.map((b) => b.name));
}
console.log(`the body's own bones: ${driven.size}`);
console.log(`reading: ${comps.map((c) => `${c.name ?? c.component ?? "?"} ${c.bones.length} bones${c.lod !== undefined ? `, LOD ${c.lod}` : ""}`).join("; ")}`);

// ---- the body, built from its .glb's nodes (glTF axes) ----
const buf = fs.readFileSync(path.join(dir, "body.glb"));
const gltf = JSON.parse(buf.subarray(20, 20 + buf.readUInt32LE(12)).toString("utf8"));
const objs = gltf.nodes.map((n) => {
  const o = n.mesh === undefined ? new THREE.Bone() : new THREE.Object3D();
  o.name = n.name ?? "";
  if (n.translation) o.position.fromArray(n.translation);
  if (n.rotation) o.quaternion.fromArray(n.rotation);
  if (n.scale) o.scale.fromArray(n.scale);
  return o;
});
gltf.nodes.forEach((n, i) => (n.children ?? []).forEach((c) => objs[i].add(objs[c])));
const root = new THREE.Object3D();
objs.forEach((o) => !o.parent && root.add(o));
root.updateMatrixWorld(true);
const graph = JSON.parse(fs.readFileSync(path.join(dir, "deform.json"), "utf8"));
if (process.env.SPLINE) graph.spline = process.env.SPLINE;
const deformer = createDeformer(root, graph, driven);

// Game axes (Z up) and glTF's (Y up): (x, y, z) to (x, z, -y), for points and for rotations.
const V = (e) => new THREE.Vector3(e[0], e[2], -e[1]);
const Q = (e) => new THREE.Quaternion(e[0], e[2], -e[1], e[3]).normalize();
const toGame = (v) => [v.x, -v.z, v.y];

// The body's own bones to the game's pose, parents first, by their model-space transforms.
const byName = new Map(objs.filter((o) => o.name).map((o) => [o.name, o]));
const depth = (o) => {
  let d = 0;
  for (let p = o.parent; p; p = p.parent) d++;
  return d;
};
const posed = [...byName.values()].filter((o) => driven.has(o.name) && game.has(o.name)).sort((a, b) => depth(a) - depth(b));
for (const o of posed) {
  const m = game.get(o.name).model;
  const world = new THREE.Matrix4().compose(V(m.t), Q(m.r), new THREE.Vector3(1, 1, 1));
  const local = new THREE.Matrix4().copy(o.parent.matrixWorld).invert().multiply(world);
  local.decompose(o.position, o.quaternion, new THREE.Vector3());
  o.updateMatrixWorld(true);
}
deformer.update();
root.updateMatrixWorld(true);

// The last node kind that writes each helper, to point at the rule to look at.
const writer = new Map();
for (const n of graph.nodes) {
  const names = [n.bone, ...(n.entries ?? []).map((e) => e.bone), ...(n.outputs ?? []).map((o) => o.bone), ...(n.outs ?? []).map((o) => o.bone)].filter(Boolean);
  for (const b of names) writer.set(b, n.t);
}
const rows = [];
for (const [name, g] of game) {
  if (driven.has(name)) continue;
  const o = byName.get(name);
  if (!o) continue;
  const p = o.getWorldPosition(new THREE.Vector3());
  const q = o.getWorldQuaternion(new THREE.Quaternion());
  const gp = V(g.model.t);
  const gq = Q(g.model.r);
  rows.push({ name, by: p.distanceTo(gp), deg: (q.angleTo(gq) * 180) / Math.PI, writer: writer.get(name) ?? "(none)", ours: toGame(p).map((v) => +v.toFixed(3)), theirs: g.model.t.map((v) => +v.toFixed(3)) });
}
if (!rows.length) throw new Error("No helpers to compare: the reading has none the body has");
rows.sort((a, b) => b.by - a.by);
const med = (xs) => xs.slice().sort((a, b) => a - b)[Math.floor(xs.length / 2)];
console.log(`${rows.length} helpers: distance median ${(med(rows.map((r) => r.by)) * 1000).toFixed(1)} mm, worst ${(rows[0].by * 100).toFixed(1)} cm; turn median ${med(rows.map((r) => r.deg)).toFixed(2)}°`);
const byWriter = {};
for (const r of rows) (byWriter[r.writer] ??= []).push(r.by);
console.log("by the node kind that writes them (median, worst, in mm):");
for (const [w, xs] of Object.entries(byWriter).sort((a, b) => med(b[1]) - med(a[1]))) console.log(`  ${w}: ${xs.length} helpers, ${(med(xs) * 1000).toFixed(1)}, ${(Math.max(...xs) * 1000).toFixed(1)}`);
console.log("worst 15:");
for (const r of rows.slice(0, 15)) console.log(`  ${r.name} ${(r.by * 1000).toFixed(1)} mm ${r.deg.toFixed(1)}° (${r.writer}) ours ${r.ours} game ${r.theirs}`);
fs.writeFileSync(path.join(dir, "compare.json"), JSON.stringify(rows, null, 1));

// BOUNCE=1: for each bulge output, the channel values REDcode set and the ones the game's helper implies, both in the
// output parent's frame as REDcode places it (game axes), beside the change in the bulge's distance.
if (process.env.BOUNCE) {
  const all = new Map();
  root.traverse((o) => o.name && all.set(o.name, o));
  const inFrame = (frame, worldPos) => worldPos.clone().applyMatrix4(frame.matrixWorld.clone().invert());
  console.log("\nbulges (game axes, mm): bone channel: ours / game's; d = the points' distance now");
  for (const n of graph.nodes.filter((x) => x.t === "SimpleBounce")) {
    const a = all.get(n.a);
    const b = all.get(n.b);
    for (const out of n.outs) {
      const o = all.get(out.bone);
      const frame = all.get(out.parent) ?? o?.parent;
      const g = game.get(out.bone);
      if (!o || !frame || !g || !a || !b) continue;
      const ours = inFrame(frame, o.getWorldPosition(new THREE.Vector3()));
      const theirs = inFrame(frame, V(g.model.t));
      const e = (v) => [v.x, -v.z, v.y].map((x) => (x * 1000).toFixed(1));
      const d = a.getWorldPosition(new THREE.Vector3()).distanceTo(b.getWorldPosition(new THREE.Vector3()));
      const off = Math.abs(ours.distanceTo(theirs));
      if (off > 0.005) console.log(`  ${out.bone} ${out.entries.map((x) => `${x.transformChannel}×${x.multiplier}`).join(",")} mul ${n.mul}/${n.neg} off ${n.off} smooth ${n.smooth}: ours [${e(ours)}] game [${e(theirs)}] d ${(d * 1000).toFixed(1)}`);
    }
  }
}
