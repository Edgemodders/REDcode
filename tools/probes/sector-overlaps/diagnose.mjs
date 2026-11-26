// Probe O0 (docs/design/sector-overlaps.md): why one sector lists another as an overlap. Reads both sectors'
// things through REDbridge (sector.nodes with bounds), the box findOverlaps draws around the opened sector's
// things, what widens that box, and which of the other sector's things meet the box against which of the
// opened sector's own things meet them one to one.
//   node tools/probes/sector-overlaps/diagnose.mjs <opened sector name> <listed sector name>
// The exe and game come from REDBRIDGE_EXE and REDCODE_GAME_PATH, else VS Code's settings. Build the extension first.
import fs from "node:fs";
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

const [openedName = "exterior_-11_11_0_1", listedName = "exterior_-6_6_0_1"] = process.argv.slice(2);
const exe = process.env.REDBRIDGE_EXE || setting("redcode.bridgePath");
const gamePath = process.env.REDCODE_GAME_PATH || setting("redcode.gamePath");
const client = new BridgeClient({ exe, gamePath });
client.start();

const meets = (a, b) => [0, 1, 2].every((k) => a.min[k] <= b.max[k] && a.max[k] >= b.min[k]);
const size = (b) => b.max.map((v, k) => Math.round(v - b.min[k]));
const r = (v) => v.map((x) => Math.round(x));
const label = (i) => `#${i.index} ${i.kind}${i.resource ? " " + i.resource : ""}`;

try {
  const all = (await client.request("sector.find", {})).sectors;
  const find = (n) => all.find((s) => s.path.toLowerCase().endsWith(`\\${n.toLowerCase()}.streamingsector`)) ?? (() => { throw new Error(`No sector ${n}`); })();
  const opened = find(openedName);
  const listed = find(listedName);
  console.log("opened", opened.path, opened.kind, "level", opened.level, "streaming box", r(opened.box.min), r(opened.box.max));
  console.log("listed", listed.path, listed.kind, "level", listed.level, "streaming box", r(listed.box.min), r(listed.box.max));
  console.log("streaming boxes meet:", meets(opened.box, listed.box));

  const read = async (s) => (await client.request("sector.nodes", { path: s.path, bounds: true })).items;
  const mine = await read(opened);
  const theirs = await read(listed);

  // The box findOverlaps draws: every thing's bounds, or its position when it has none.
  const own = { min: [Infinity, Infinity, Infinity], max: [-Infinity, -Infinity, -Infinity] };
  const boxOf = (i) => i.bounds ?? { min: i.transform.position.slice(0, 3), max: i.transform.position.slice(0, 3) };
  for (const i of mine) {
    const b = boxOf(i);
    for (let k = 0; k < 3; k++) {
      own.min[k] = Math.min(own.min[k], b.min[k]);
      own.max[k] = Math.max(own.max[k], b.max[k]);
    }
  }
  const withBounds = mine.filter((i) => i.bounds).length;
  console.log(`\nopened: ${mine.length} things, ${withBounds} with bounds; its things' box`, r(own.min), r(own.max), "size", size(own));

  // What widens it: for each side, the things that set that edge.
  console.log("\nwhat sets each edge of that box:");
  for (let k = 0; k < 3; k++)
    for (const side of ["min", "max"]) {
      const edge = own[side][k];
      const who = mine.filter((i) => boxOf(i)[side][k] === edge);
      console.log(`  ${side}${"xyz"[k]} = ${Math.round(edge)}: ${who.slice(0, 3).map((i) => `${label(i)} size ${size(boxOf(i))}${i.bounds ? "" : " (position only)"}`).join("; ")}`);
    }
  // Things placed at the world's origin: the node data's own placement is zero when the real places are in a buffer.
  for (const [name, list] of [["opened", mine], ["listed", theirs]]) {
    const zero = list.filter((i) => i.transform.position.slice(0, 3).every((v) => v === 0));
    const kinds = {};
    for (const i of zero) kinds[i.kind] = (kinds[i.kind] ?? 0) + 1;
    console.log(`${name}: ${zero.length} things placed at 0,0,0`, kinds, zero.slice(0, 3).map((i) => `${label(i)}${i.instances ? ` (${i.instances.length} copies)` : ""}${i.bounds ? ` box ${r(i.bounds.min)}..${r(i.bounds.max)}` : ""}`));
  }
  const big = [...mine].filter((i) => i.bounds).sort((a, b) => Math.max(...size(b.bounds)) - Math.max(...size(a.bounds))).slice(0, 8);
  console.log("\nlargest things in the opened sector:");
  for (const i of big) console.log(`  ${label(i)} size ${size(i.bounds)} at ${r(i.bounds.min)}..${r(i.bounds.max)}${i.instances ? ` (${i.instances.length} copies)` : ""}`);

  // The listed sector's things that meet the one box, and which own things they meet one to one.
  const inBox = theirs.filter((i) => meets(boxOf(i), own));
  console.log(`\nlisted: ${theirs.length} things; ${inBox.length} meet the opened sector's box (today's count)`);
  let confirmed = 0;
  for (const t of inBox) {
    const hits = mine.filter((m) => meets(boxOf(m), boxOf(t)));
    if (hits.length) confirmed++;
    console.log(`  ${label(t)} size ${size(boxOf(t))}${t.bounds ? "" : " (position only)"} at ${r(boxOf(t).min)}..${r(boxOf(t).max)}: meets ${hits.length} of the opened sector's things${hits.length ? " e.g. " + hits.slice(0, 2).map(label).join("; ") : ""}`);
  }
  console.log(`\none to one: ${confirmed} of ${inBox.length} still meet a thing of the opened sector`);
} finally {
  client.stop();
}
