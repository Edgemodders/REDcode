// Spike LS1 (docs/research/lipsync.md, "Live lip sync"): builds the test archive that asks whether a script can move a
// live NPC's jaw. It reads the women's face graph from the game, adds float inputs wired to three lip sync
// tracks just before the Sermo node, and packs the changed graph. Nothing here is a release build.
// Needs the game and REDbridge (found as the MCP server finds them).
// Usage (after npm run build --workspace packages/lipsync-core): node tools/probes/lipsync-live/build-jaw.mjs <outFolder>
// Writes <outFolder>/source/archive/<the graph's game path> and <outFolder>/tests/edgefab_ls1_jaw.archive.
// Both hold game data: keep outFolder out of the repo. The archive replaces a game file while it is installed.
import { createRequire } from "node:module";
import * as fs from "node:fs";
import * as path from "node:path";

const require = createRequire(import.meta.url);
const core = require("../../../packages/lipsync-core/scripts/bridge.cjs");
const out = process.argv[2];
if (!out) {
  console.error("Usage: node tools/probes/lipsync-live/build-jaw.mjs <outFolder>");
  process.exit(1);
}

const Graph = ["base", "animations", "facial", "_facial_graphs", "woman_average_sermo.animgraph"].join("\\");
/** A feature the graph does not have yet, on a game class with three floats, for the second way in. */
const Feature = { name: "edgefab_lipsync", className: "animAnimFeature_Bump" };
/** Each track gets two inputs, added to it: one set with SetInputFloat, one read from the feature. */
const Wires = [
  { track: "jaw_mid_openLipsyncPoseOutput", input: "edgefab_jaw", field: "direction" },
  { track: "lipSyncEnvelope", input: "edgefab_envelope", field: "source" },
  { track: "jaw_mid_openAnimOverrideWeight", input: "edgefab_override", field: "intensity" },
];

const cname = (value) => ({ $type: "CName", $storage: "string", $value: value });
const failed = [];
const check = (ok, what) => {
  console.log(`${ok ? "ok  " : "FAIL"} ${what}`);
  if (!ok) failed.push(what);
};

/** Every handle in the file by id, and the highest id. */
function handles(root) {
  const byId = new Map();
  const walk = (o) => {
    if (Array.isArray(o)) return o.forEach(walk);
    if (!o || typeof o !== "object") return;
    if (o.HandleId !== undefined && o.Data) byId.set(String(o.HandleId), o);
    Object.values(o).forEach(walk);
  };
  walk(root);
  return byId;
}

const { client, call } = await core.startBridge();
try {
  const read = await call("cr2w.toJson", { path: Graph });
  const original = typeof read.json === "string" ? read.json : JSON.stringify(read.json);
  const file = JSON.parse(original);
  const chunk = file.Data.RootChunk;
  const byId = handles(file);
  const ofType = (t) => [...byId.values()].filter((h) => h.Data.$type === t);

  const sermo = ofType("animAnimNode_Sermo");
  check(sermo.length === 1, `the graph has one Sermo node (${sermo.length})`);
  const modifier = ofType("animAnimNode_FloatTrackModifier")[0];
  const floatInput = ofType("animAnimNode_FloatInput")[0];
  check(!!modifier && !!floatInput, "the graph already has a float track modifier and a float input to copy");
  const inInit = (id) => chunk.nodesToInit.some((n) => String(n.HandleId ?? n.HandleRefId) === String(id));
  const listed = inInit(modifier.HandleId) || inInit(floatInput.HandleId);

  let next = Math.max(...[...byId.keys()].map(Number)) + 1;
  const made = [];
  const inputNode = (group, name) => {
    const node = { HandleId: String(next++), Data: { ...floatInput.Data, group: cname(group), name: cname(name) } };
    made.push(node.HandleId);
    return node;
  };
  // The chain, from the Sermo node down: each new modifier adds its input to its track, then passes the pose on.
  let below = sermo[0].Data.inputLink.node;
  for (const w of [...Wires].reverse()) {
    for (const input of [inputNode(Feature.name, w.field), inputNode("None", w.input)]) {
      const node = {
        HandleId: String(next++),
        Data: {
          ...modifier.Data,
          floatTrack: { $type: "animNamedTrackIndex", name: cname(w.track) },
          inputFloatTrack: { $type: "animNamedTrackIndex", name: cname("None") },
          operationType: "Add",
          floatInputNode: { $type: "animFloatLink", node: input },
          poseInputNode: { $type: "animPoseLink", node: below },
        },
      };
      made.push(node.HandleId);
      below = node;
    }
  }
  sermo[0].Data.inputLink.node = below;
  chunk.animFeatures.push({ ...chunk.animFeatures[0], className: cname(Feature.className), name: cname(Feature.name) });
  if (listed) for (const id of made) chunk.nodesToInit.push({ HandleRefId: id });

  const archiveDir = path.join(out, "source", "archive");
  const graphFile = path.join(archiveDir, ...Graph.split("\\"));
  const written = await call("cr2w.fromJson", { outFile: graphFile, json: JSON.stringify(file) });
  console.log(`     wrote ${written.path ?? graphFile} (${fs.statSync(graphFile).size} bytes)`);

  // Read it back: the new nodes are there, wired as written, and nothing else was lost.
  const back = JSON.parse((await call("cr2w.fileToJson", { file: graphFile })).json ?? "{}");
  const again = handles(back);
  const count = (m, t) => [...m.values()].filter((h) => h.Data.$type === t).length;
  check(again.size === byId.size + made.length, `the written graph has ${made.length} more nodes (${byId.size} to ${again.size})`);
  check(count(again, "animAnimNode_FloatTrackModifier") === ofType("animAnimNode_FloatTrackModifier").length + Wires.length * 2, "its new float track modifiers are there");
  const top = [...again.values()].find((h) => h.Data.$type === "animAnimNode_Sermo")?.Data.inputLink.node;
  check(top?.Data?.$type === "animAnimNode_FloatTrackModifier" && top.Data.floatTrack.name.$value === Wires[0].track && top.Data.operationType === "Add" && top.Data.floatInputNode.node?.Data?.name.$value === Wires[0].input, `the Sermo node now reads from a modifier that adds ${Wires[0].input} to ${Wires[0].track}`);
  check(back.Data.RootChunk.animFeatures.some((f) => f.name.$value === Feature.name), `the feature ${Feature.name} is declared`);
  check(back.Data.RootChunk.nodesToInit.length === chunk.nodesToInit.length, `the nodes to start are ${chunk.nodesToInit.length}${listed ? "" : " (the new nodes are not listed: the game's own are not)"}`);

  const tests = path.join(out, "tests");
  const packed = await call("project.pack", { dir: archiveDir, outDir: tests, modName: "edgefab_ls1_jaw" });
  const archive = path.join(tests, "edgefab_ls1_jaw.archive");
  check(fs.existsSync(archive), `packed ${archive} (${fs.existsSync(archive) ? fs.statSync(archive).size : 0} bytes)`);
  if (packed.warnings?.length) console.log(`     warnings: ${packed.warnings.join(", ")}`);
  console.log(`\nInputs to set on the NPC (SetInputFloat): ${Wires.map((w) => w.input).join(", ")}`);
  console.log(`Or the feature ${Feature.name} (${Feature.className}): ${Wires.map((w) => `${w.field} for ${w.track}`).join(", ")}`);
} finally {
  client.stop();
}
if (failed.length) {
  console.error(`FAILED: ${failed.length} of the checks`);
  process.exit(1);
}
console.log("ok");
process.exit(0);
