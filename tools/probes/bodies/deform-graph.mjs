// Bodies B2a: a build's deformation graph and rig, cut down to what webview/deformGraph.ts runs (the nodes in the order
// they run, the transforms the extenders add, the rig's reference pose), written as deform.json to an output folder
// outside the repository (game data). Also copies the cached body .glb there for compare-bones.mjs.
//   node tools/probes/bodies/deform-graph.mjs [build] [outDir]      build: man_base (default) or woman_base
// The exe and game come from REDBRIDGE_EXE and REDCODE_GAME_PATH, else VS Code's settings. Build the extension first.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { BridgeClient } = require("../../../extensions/redcode/dist/bridgeClient.js");

function setting(key) {
  try {
    const text = fs.readFileSync(path.join(process.env.APPDATA ?? "", "Code", "User", "settings.json"), "utf8");
    const m = new RegExp(`"${key.replace(/\./g, "\\.")}"\\s*:\\s*"((?:[^"\\\\]|\\\\.)*)"`).exec(text);
    return m ? JSON.parse(`"${m[1]}"`) : undefined;
  } catch {
    return undefined;
  }
}

const build = process.argv[2] ?? "man_base";
const out = process.argv[3] ?? path.join(os.tmpdir(), "redcode-bodies", build);
fs.mkdirSync(out, { recursive: true });
const base = `base\\characters\\base_entities\\${build}\\deformations_rigs\\${build}_deformations`;
const exe = process.env.REDBRIDGE_EXE || setting("redcode.bridgePath") || path.join(process.env.APPDATA ?? "", "Code/User/globalStorage/edgemodders.redcode-cyberpunk/bridge/0.19.0/REDbridge.exe");
const gamePath = process.env.REDCODE_GAME_PATH || setting("redcode.gamePath") || "E:/SteamLibrary/steamapps/common/Cyberpunk 2077";
const client = new BridgeClient({ exe, gamePath });
client.start();
let graphJson;
let rigJson;
try {
  await client.toJson(`${base}.animgraph`, path.join(out, "graph.full.json"));
  await client.toJson(`${base}.rig`, path.join(out, "rig.full.json"));
  graphJson = JSON.parse(fs.readFileSync(path.join(out, "graph.full.json"), "utf8"));
  rigJson = JSON.parse(fs.readFileSync(path.join(out, "rig.full.json"), "utf8"));
} finally {
  client.stop();
}

// Every handle's data by its id, so references resolve.
const root = graphJson.Data?.RootChunk ?? graphJson;
const byId = new Map();
const walk = (v) => {
  if (!v || typeof v !== "object") return;
  if (Array.isArray(v)) return v.forEach(walk);
  if (v.HandleId !== undefined && v.Data && typeof v.Data === "object" && !byId.has(v.HandleId)) byId.set(v.HandleId, v.Data);
  for (const k of Object.keys(v)) walk(v[k]);
};
walk(root);
const deref = (h) => (h ? (h.Data ?? byId.get(h.HandleRefId) ?? null) : null);
// The chain: from the output back through each node's input, then reversed into running order.
const output = [...byId.values()].find((d) => d.$type === "animAnimNode_Output");
const chain = [];
for (let n = deref(output.node?.node); n; n = deref(n.inputLink?.node)) chain.push(n);
chain.reverse();
const name = (x) => x?.name?.$value ?? x?.$value ?? null;
const v3 = (v) => (v ? [v.X, v.Y, v.Z] : null);
const qs = (t) => (t ? { r: [t.Rotation.i, t.Rotation.j, t.Rotation.k, t.Rotation.r], t: [t.Translation.X, t.Translation.Y, t.Translation.Z], s: [t.Scale.X, t.Scale.Y, t.Scale.Z] } : null);
const cut = (n) => {
  const t = n.$type.replace("animAnimNode_", "");
  switch (t) {
    case "AimConstraint_ObjectUp":
    case "AimConstraint_ObjectRotationUp":
      return { t, bone: name(n.transformIndex), target: name(n.targetTransform), up: name(n.upTransform), fwd: v3(n.forwardAxisLS), upAxis: v3(n.upAxisLS), upVec: v3(n.upTransformVector), w: n.weight };
    case "PointConstraint":
    case "OrientConstraint":
      return { t, bone: name(n.transformIndex), inputs: n.inputWeightedTransforms.map((x) => [name(x.transform), x.weight]), pre: n.preprocessedWeights, w: n.weight };
    case "SetBoneTransform":
      return { t, entries: n.entries.map((e) => ({ bone: name(e.transformToChange), src: name(e.sourceBone), space: name(e.offsetSpaceBone), method: e.setMethod, offset: qs(e.offset), toRef: e.offsetToReference, snap: e.snapToReference })) };
    case "SimpleSpline":
      return { t, bone: name(n.constrainedTransform), a: name(n.startTransform), m: name(n.middleTransform), b: name(n.endTransform), p: n.defaultProgress, mode: n.progressMode };
    case "TwistConstraint":
      return { t, a: name(n.transformA), b: name(n.transformB), front: n.frontAxis, outputs: n.outputs.map((o) => ({ bone: name(o.twistedTransform), axis: o.twistAxis, pos: o.positiveScale, neg: o.negativeScale })) };
    case "TranslationLimit":
      return { t, bone: name(n.constrainedTransform), parent: name(n.parentTransform), x: n.limitOnXAxis, y: n.limitOnYAxis, z: n.limitOnZAxis };
    case "SimpleBounce":
      return { t, a: name(n.startTransform), b: name(n.endTransform), delay: n.delay, mul: n.multiplier, neg: n.negativeMultiplier, off: n.offset, smooth: n.smoothStep, outs: n.transformOutputs.map((o) => ({ bone: name(o.targetTransform), parent: name(o.parentTransform), ch: o.targetTransformChannel, mul: o.multiplier, entries: o.channelEntries })) };
    case "StackTransformsExtender":
      return { t, tag: n.tag.$value, add: n.transformInfos.map((x) => ({ name: x.name.$value, parent: x.parentName.$value, ref: qs(x.referenceTransformLs) })) };
    default:
      return { t };
  }
};
const nodes = chain.map(cut);
const rig = rigJson.Data?.RootChunk ?? rigJson;
const reference = {};
rig.boneNames.forEach((n, i) => {
  const t = rig.boneTransforms[i];
  reference[n.$value] = qs(t);
});
const parents = {};
rig.boneNames.forEach((n, i) => (parents[n.$value] = rig.boneParentIndexes[i] >= 0 ? rig.boneNames[rig.boneParentIndexes[i]].$value : null));
fs.writeFileSync(path.join(out, "deform.json"), JSON.stringify({ nodes, reference, parents }));
fs.rmSync(path.join(out, "graph.full.json"), { force: true });
fs.rmSync(path.join(out, "rig.full.json"), { force: true });

// The body as REDcode's animation view exports it, from REDcode's cache.
const bodies = { man_base: "man_average/t0_000_ma_base__full.glb", woman_base: "woman_average/t0_000_wa_base__full.glb" };
const glb = path.join(process.env.APPDATA ?? "", "Code/User/globalStorage/edgemodders.redcode-cyberpunk/cache/anim/raw/rigged/base/characters/common/base_bodies", bodies[build] ?? "");
if (fs.existsSync(glb)) fs.copyFileSync(glb, path.join(out, "body.glb"));
console.log(`${build}: ${nodes.length} nodes, ${Object.keys(reference).length} reference bones -> ${out}${fs.existsSync(path.join(out, "body.glb")) ? " (with body.glb)" : " (no cached body.glb: open a man_base clip in REDcode once)"}`);
