// Probe for the Bodies design (REDcode, 2026-11-26): the game's character rigs, how many bones each has, and how far each
// covers the bones man_base.rig's clips drive (and woman_base.rig's), so a Bodies tab knows which bodies a clip fits.
//   node tools/probes/bodies/rigs.mjs
// The exe and game come from REDBRIDGE_EXE and REDCODE_GAME_PATH, else VS Code's settings. Build the extension first.
// Reads only; writes nothing (the rigs are game data).
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

const exe = process.env.REDBRIDGE_EXE || setting("redcode.bridgePath") || path.join(process.env.APPDATA ?? "", "Code/User/globalStorage/edgemodders.redcode-cyberpunk/bridge/0.19.0/REDbridge.exe");
const gamePath = process.env.REDCODE_GAME_PATH || setting("redcode.gamePath") || "E:/SteamLibrary/steamapps/common/Cyberpunk 2077";
const client = new BridgeClient({ exe, gamePath });
client.start();
try {
  const found = (await client.request("archive.search", { query: ".rig", limit: 2000 })).items.map((i) => i.name).filter((n) => /\\base_entities\\[^\\]+\\[^\\]+\.rig$|\\base_entities\\[^\\]+\\deformations_rigs?\\[^\\]+\.rig$|player_(wo)?man_skeleton\.rig$|\\player\\[^\\]*\.rig$/i.test(n) && !/garments_rigs|shirtcollar|_breasts\.rig$/i.test(n));
  const bonesOf = async (p) => {
    const doc = await client.request("cr2w.open", { path: p });
    try {
      const node = await client.request("cr2w.getNode", { doc: doc.doc, path: "boneNames", offset: 0, limit: 5000 });
      return node.children.map((c) => c.value?.$value ?? c.value ?? c.preview);
    } finally {
      await client.request("cr2w.close", { doc: doc.doc });
    }
  };
  const man = new Set(await bonesOf("base\\characters\\base_entities\\man_base\\man_base.rig"));
  const woman = new Set(await bonesOf("base\\characters\\base_entities\\woman_base\\woman_base.rig"));
  console.log(`man_base.rig ${man.size} bones; woman_base.rig ${woman.size}; the same names: ${[...man].every((n) => woman.has(n)) && man.size === woman.size}`);
  console.log("\nrig | bones | of man_base's | missing from it");
  for (const p of found.sort()) {
    let names;
    try {
      names = new Set(await bonesOf(p));
    } catch (e) {
      console.log(`${p} | could not read: ${e.message}`);
      continue;
    }
    const covered = [...man].filter((n) => names.has(n));
    const missing = [...man].filter((n) => !names.has(n));
    console.log(`${p.replace(/^base\\characters\\/, "")} | ${names.size} | ${covered.length} of ${man.size} | ${missing.slice(0, 8).join(" ")}${missing.length > 8 ? ` +${missing.length - 8}` : ""}`);
  }
} finally {
  client.stop();
}
