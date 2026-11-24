// Spike LS2 (docs/lipsync.md, "Live lip sync"): builds the test archive for whole mouth shapes from few numbers.
// It reads the women's face graph from the game and adds, before the Sermo node, core's mouth shapes
// (src/core/lipsync/shapes.ts): each shape is one number in an anim feature, eased inside the graph by a damp
// node (or used as sent, by the feature's raw switch), and added to the shape's lip sync tracks by its weights.
// Needs the game and REDbridge (found as the MCP server finds them). Not a release build.
// Usage (after npm run build): npm run lipsync:shapes --workspace extensions/edgefab -- <outFolder> [speed]
//   speed: how fast the graph eases a number, in units a second (default 14: 0 to 1 in about 70 ms)
// Writes <outFolder>/source/archive/<the graph's game path> and <outFolder>/tests/edgefab_ls2_shapes.archive.
// Both hold game data: keep outFolder out of the repo. The archive replaces a game file while it is installed,
// the same file as LS1's archive: only one of the two in the game at a time.
import { createRequire } from "node:module";
import * as fs from "node:fs";
import * as path from "node:path";

const require = createRequire(import.meta.url);
const core = require("../dist/core.js");
const out = process.argv[2];
const speed = Number(process.argv[3] ?? 14);
if (!out || !(speed > 0)) {
  console.error("Usage: npm run lipsync:shapes --workspace extensions/edgefab -- <outFolder> [speed]");
  process.exit(1);
}

const Graph = ["base", "animations", "facial", "_facial_graphs", "woman_average_sermo.animgraph"].join("\\");
const { MouthShapes, MouthFeature } = core;

const cname = (value) => ({ $type: "CName", $storage: "string", $value: value });
const failed = [];
const check = (ok, what) => {
  console.log(`${ok ? "ok  " : "FAIL"} ${what}`);
  if (!ok) failed.push(what);
};

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

const { client, call } = await core.startBridge(() => undefined);
try {
  const read = await call("cr2w.toJson", { path: Graph });
  const file = JSON.parse(typeof read.json === "string" ? read.json : JSON.stringify(read.json));
  const chunk = file.Data.RootChunk;
  const byId = handles(file);
  const ofType = (t) => [...byId.values()].filter((h) => h.Data.$type === t);
  const sermo = ofType("animAnimNode_Sermo")[0];
  const modifier = ofType("animAnimNode_FloatTrackModifier")[0];
  const floatInput = ofType("animAnimNode_FloatInput")[0];
  const constant = ofType("animAnimNode_FloatConstant")[0];
  check(!!sermo && !!modifier && !!floatInput && !!constant, "the graph has the nodes to copy (Sermo, a track modifier, a float input, a constant)");

  // What every float node shares (its debug and drawing fields), taken from the game's own constant.
  const { value: _value, $type: _type, ...floatBase } = constant.Data;
  let next = Math.max(...[...byId.keys()].map(Number)) + 1;
  const made = [];
  const node = (data) => {
    const n = { HandleId: String(next++), Data: data };
    made.push(n.HandleId);
    return n;
  };
  const link = (n) => ({ $type: "animFloatLink", node: n });
  const none = () => ({ $type: "animFloatLink", node: null });
  const input = (field) => node({ ...floatInput.Data, group: cname(MouthFeature.name), name: cname(field) });
  // A node's $type must be its first key, or WolvenKit's reader refuses the file.
  const number = (value) => node({ $type: "animAnimNode_FloatConstant", ...floatBase, value });
  const math = (op, a, b) => node({ $type: "animAnimNode_FloatMathOp", ...floatBase, operationType: op, firstInputNode: link(a), secondInputNode: link(b) });
  const damp = (a) =>
    node({
      $type: "animAnimNode_DampFloat",
      ...floatBase,
      defaultIncreaseSpeed: speed,
      defaultDecreaseSpeed: speed,
      startFromDefaultValue: 1,
      defaultInitialValue: 0,
      wrapAroundRange: 0,
      rangeMin: 0,
      rangeMax: 1,
      inputNode: link(a),
      increaseSpeedNode: none(),
      decreaseSpeedNode: none(),
    });
  /** A shape's number as the graph uses it: eased, or as sent when the feature's raw switch is 1. */
  const shapeValue = (field) =>
    math("AGMO_Add", math("AGMO_Multiply", damp(input(field)), math("AGMO_Subtract", number(1), input(MouthFeature.raw))), math("AGMO_Multiply", input(field), input(MouthFeature.raw)));

  // One modifier per shape and pose: the pose's lip sync track gets the shape's number times its weight added.
  const pairs = MouthShapes.flatMap((shape, i) => Object.entries(shape.poses).map(([pose, weight]) => ({ i, pose, weight })));
  // The file is read from the Sermo node down, so a shape's value is written out at its topmost use and the uses
  // below point at it. The chain is built from the bottom: a shape's last pair here is its topmost.
  const lastUse = new Map(pairs.map((p, n) => [p.i, n]));
  const valueId = new Map();
  let below = sermo.Data.inputLink.node;
  pairs.forEach((p, n) => {
    let value;
    if (lastUse.get(p.i) === n) {
      // The id is promised to the uses below before the value is made, so make it under that id.
      value = shapeValue(MouthFeature.fields[p.i]);
      if (valueId.has(p.i)) {
        made.splice(made.indexOf(value.HandleId), 1);
        value.HandleId = valueId.get(p.i);
        made.push(value.HandleId);
      }
    } else {
      if (!valueId.has(p.i)) valueId.set(p.i, String(next++));
      value = { HandleRefId: valueId.get(p.i) };
    }
    below = node({
      ...modifier.Data,
      floatTrack: { $type: "animNamedTrackIndex", name: cname(`${p.pose}LipsyncPoseOutput`) },
      inputFloatTrack: { $type: "animNamedTrackIndex", name: cname("None") },
      operationType: "Add",
      floatInputNode: link(math("AGMO_Multiply", value, number(p.weight))),
      poseInputNode: { $type: "animPoseLink", node: below },
    });
  });
  sermo.Data.inputLink.node = below;
  chunk.animFeatures.push({ ...chunk.animFeatures[0], className: cname(MouthFeature.className), name: cname(MouthFeature.name) });
  for (const id of made) chunk.nodesToInit.push({ HandleRefId: id });

  const archiveDir = path.join(out, "source", "archive");
  const graphFile = path.join(archiveDir, ...Graph.split("\\"));
  await call("cr2w.fromJson", { outFile: graphFile, json: JSON.stringify(file) });
  console.log(`     ${MouthShapes.length} shapes, ${pairs.length} pose weights, ${made.length} new nodes; wrote ${fs.statSync(graphFile).size} bytes`);

  const back = JSON.parse((await call("cr2w.fileToJson", { file: graphFile })).json ?? "{}");
  const again = handles(back);
  const count = (t) => [...again.values()].filter((h) => h.Data.$type === t).length;
  check(again.size === byId.size + made.length, `the written graph has ${made.length} more nodes (${byId.size} to ${again.size})`);
  check(count("animAnimNode_FloatTrackModifier") === ofType("animAnimNode_FloatTrackModifier").length + pairs.length, `one new track modifier per pose weight (${pairs.length})`);
  check(count("animAnimNode_DampFloat") === MouthShapes.length, `one damp node per shape (${count("animAnimNode_DampFloat")})`);
  const damps = [...again.values()].filter((h) => h.Data.$type === "animAnimNode_DampFloat");
  check(damps.every((d) => d.Data.defaultIncreaseSpeed === speed && d.Data.inputNode?.node), `the damp nodes kept their speed (${speed}) and their input`);
  const tracks = new Set([...again.values()].filter((h) => h.Data.$type === "animAnimNode_FloatTrackModifier").map((h) => h.Data.floatTrack.name.$value));
  check(pairs.every((p) => tracks.has(`${p.pose}LipsyncPoseOutput`)), "every pose's lip sync track is written to");
  check(back.Data.RootChunk.animFeatures.some((f) => f.name.$value === MouthFeature.name && f.className.$value === MouthFeature.className), `the feature ${MouthFeature.name} is declared`);
  check(back.Data.RootChunk.nodesToInit.length === chunk.nodesToInit.length, `the nodes to start are ${chunk.nodesToInit.length}`);

  const tests = path.join(out, "tests");
  await call("project.pack", { dir: archiveDir, outDir: tests, modName: "edgefab_ls2_shapes" });
  const archive = path.join(tests, "edgefab_ls2_shapes.archive");
  check(fs.existsSync(archive), `packed ${archive} (${fs.existsSync(archive) ? fs.statSync(archive).size : 0} bytes)`);
} finally {
  client.stop();
}
if (failed.length) {
  console.error(`FAILED: ${failed.length} of the checks`);
  process.exit(1);
}
console.log("ok");
process.exit(0);
