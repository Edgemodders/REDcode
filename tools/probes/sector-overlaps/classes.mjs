// Probe for O1's roles (docs/design/sector-overlaps.md): the node classes a few sectors hold, how many of each
// have a box, and the extensions of the files they name.
//   node tools/probes/sector-overlaps/classes.mjs [sector names...]
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

const names = process.argv.slice(2);
const wanted = names.length ? names : ["exterior_-22_7_0_0", "exterior_-11_11_0_1", "exterior_-6_6_0_1", "exterior_-3_1_0_2", "interior_-44_10_0_0"];
const client = new BridgeClient({ exe: process.env.REDBRIDGE_EXE || setting("redcode.bridgePath"), gamePath: process.env.REDCODE_GAME_PATH || setting("redcode.gamePath") });
client.start();
try {
  const all = (await client.request("sector.find", {})).sectors;
  const classes = new Map();
  for (const n of wanted) {
    const s = all.find((x) => x.path.toLowerCase().endsWith(`\\${n.toLowerCase()}.streamingsector`));
    if (!s) {
      console.log("no sector", n);
      continue;
    }
    const items = (await client.request("sector.nodes", { path: s.path, bounds: true })).items;
    console.log(n, s.kind, "level", s.level, items.length, "things");
    for (const i of items) {
      const c = classes.get(i.kind) ?? { n: 0, bounds: 0, zero: 0, ext: {} };
      c.n++;
      if (i.bounds) c.bounds++;
      if (i.transform.position.slice(0, 3).every((v) => v === 0)) c.zero++;
      const ext = i.resource ? i.resource.slice(i.resource.lastIndexOf(".")) : "(none)";
      c.ext[ext] = (c.ext[ext] ?? 0) + 1;
      classes.set(i.kind, c);
    }
  }
  console.log("\nclass | things | with a box | at 0,0,0 | files");
  for (const [k, c] of [...classes].sort((a, b) => b[1].n - a[1].n)) console.log(`${k} | ${c.n} | ${c.bounds} | ${c.zero} | ${Object.entries(c.ext).map(([e, x]) => `${e} ${x}`).join(", ")}`);
} finally {
  client.stop();
}
