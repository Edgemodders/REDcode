// Probe for the clip search (docs/design/animation-timeline.md, Finding and using game clips): how many .anims the game
// has, how long REDbridge's anims.info takes to read their clips' names, rigs and lengths, and how big the index is.
//   node tools/probes/anims/clip-index.mjs [limit of files, default all]
// Writes the index to a temp folder (game data), not the repository.
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

const exe = process.env.REDBRIDGE_EXE || setting("redcode.bridgePath") || path.join(process.env.APPDATA ?? "", "Code/User/globalStorage/edgemodders.redcode-cyberpunk/bridge/0.19.0/REDbridge.exe");
const gamePath = process.env.REDCODE_GAME_PATH || setting("redcode.gamePath") || "E:/SteamLibrary/steamapps/common/Cyberpunk 2077";
const limit = Number(process.argv[2] ?? Infinity);
const client = new BridgeClient({ exe, gamePath });
client.start();
try {
  const t0 = Date.now();
  // archive.list pages through every game archive by ending (REDbridge 0.14.0); a path in two archives counts once.
  const found = new Set();
  for (let offset = 0; ; offset += 5000) {
    const r = await client.request("archive.list", { extension: ".anims", offset, limit: 5000 });
    for (const i of r.items) found.add(i.name);
    if (offset + 5000 >= r.total) break;
  }
  const files = [...found].slice(0, limit);
  console.log(`${found.size} .anims in the game (found in ${Date.now() - t0} ms); reading ${files.length}`);
  const t1 = Date.now();
  const index = [];
  let failed = 0;
  for (let i = 0; i < files.length; i += 50) {
    const batch = files.slice(i, i + 50);
    try {
      const r = await client.request("anims.info", { files: batch });
      for (const f of r.items ?? []) index.push({ p: f.path, r: f.rig ?? null, c: (f.clips ?? []).map((c) => [c.name, Math.round(c.duration * 100) / 100]) });
    } catch {
      failed += batch.length;
    }
    if (i % 1000 === 0) process.stdout.write(`  ${i} files, ${((Date.now() - t1) / 1000).toFixed(0)} s\n`);
  }
  const clips = index.reduce((s, f) => s + f.c.length, 0);
  const out = path.join(os.tmpdir(), "redcode-clip-index.json");
  fs.writeFileSync(out, JSON.stringify(index));
  console.log(`${index.length} files read, ${failed} failed, ${clips} clips, in ${((Date.now() - t1) / 1000).toFixed(1)} s; index ${(fs.statSync(out).size / 1024 / 1024).toFixed(1)} MB at ${out}`);
  const fists = index.flatMap((f) => f.c.filter(([n]) => /fist/i.test(n)).map(([n, d]) => `${f.p} : ${n} (${d} s)`));
  console.log(`clips named like "fist": ${fists.length}`, fists.slice(0, 12));
} finally {
  client.stop();
}
