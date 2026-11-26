// O1's check against the game (docs/design/sector-overlaps.md): findOverlaps as REDcode runs it, on a sector,
// with what it lists, the query, and each layer's first matches.
//   node tools/probes/sector-overlaps/o1-check.mjs <sector name> [--helpers] [--proxies] [--margin N] [--expect-not <name>]
// The exe and game come from REDBRIDGE_EXE and REDCODE_GAME_PATH, else VS Code's settings. Build the extension first
// (npm run build in extensions/redcode makes dist/worldViewHost.js). Its cache goes to a scratch folder of its own.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { BridgeClient } = require("../../../extensions/redcode/dist/bridgeClient.js");
const wv = require("../../../extensions/redcode/dist/worldViewHost.js");

function setting(key) {
  try {
    const text = fs.readFileSync(path.join(process.env.APPDATA ?? "", "Code", "User", "settings.json"), "utf8");
    const m = new RegExp(`"${key.replace(/\./g, "\\.")}"\\s*:\\s*"((?:[^"\\\\]|\\\\.)*)"`).exec(text);
    return m ? JSON.parse(`"${m[1]}"`) : undefined;
  } catch {
    return undefined;
  }
}

const args = process.argv.slice(2);
const name = args.find((a) => !a.startsWith("--")) ?? "exterior_-11_11_0_1";
const flag = (f) => args.includes(f);
const value = (f) => (args.includes(f) ? args[args.indexOf(f) + 1] : undefined);
const expectNot = value("--expect-not");
const client = new BridgeClient({ exe: process.env.REDBRIDGE_EXE || setting("redcode.bridgePath"), gamePath: process.env.REDCODE_GAME_PATH || setting("redcode.gamePath") });
client.start();
const r = (v) => v.map((x) => Math.round(x));
try {
  const all = (await client.request("sector.find", {})).sectors;
  const s = all.find((x) => x.path.toLowerCase().endsWith(`\\${name.toLowerCase()}.streamingsector`));
  if (!s) throw new Error(`No sector ${name}`);
  const t0 = Date.now();
  let query;
  const layers = await wv.findOverlaps(client, s.path, {
    cacheDir: path.join(os.tmpdir(), "redcode-o1-check"),
    helpers: flag("--helpers"),
    proxies: flag("--proxies"),
    margin: Number(value("--margin") ?? 0),
    onQuery: (q) => (query = q),
  });
  console.log(`${name}: ${layers.length} layer(s) in ${Date.now() - t0} ms`);
  console.log(`footprint ${query.footprint} things; things ${JSON.stringify(query.things)}; box ${query.box ? `${r(query.box.min)}..${r(query.box.max)}` : "none"}; ${query.candidates} candidates`);
  for (const l of query.leftOut) console.log(`  left out: #${l.entry} ${l.class}${l.resource ? " " + l.resource : ""}: ${l.why}`);
  for (const l of layers) {
    console.log(`${l.group} ${l.path.slice(l.path.lastIndexOf("\\") + 1)} level ${l.level}: ${l.reach} thing(s)${l.byPosition ? `, ${l.byPosition} by position` : ""}${l.leftOut ? `, ${l.leftOut} left out there` : ""}`);
    for (const m of l.matches.slice(0, 3)) console.log(`    #${m.thing.entry} ${m.thing.class} ${m.thing.resource ?? ""} meets ${m.meets ? `#${m.meets.entry} ${m.meets.class} ${m.meets.resource ?? ""}` : "the area"}`);
  }
  if (expectNot) {
    const bad = layers.find((l) => l.path.toLowerCase().endsWith(`\\${expectNot.toLowerCase()}.streamingsector`));
    console.log(bad ? `FAIL: ${expectNot} is listed` : `ok: ${expectNot} is not listed`);
    if (bad) process.exitCode = 1;
  }
} finally {
  client.stop();
}
