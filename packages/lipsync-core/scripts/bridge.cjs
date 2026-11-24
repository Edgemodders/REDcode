// For the checks and the probes: the built package, plus a REDbridge started on the game. The exe and the game
// folder come from REDBRIDGE_EXE and REDCODE_GAME_PATH, else from VS Code's settings (redcode.bridgePath and
// redcode.gamePath), as the MCP server finds them. Build first: npm run build --workspace packages/lipsync-core,
// and npm run build --workspace extensions/redcode for the bridge client.
const fs = require("node:fs");
const path = require("node:path");
const core = require("../dist/index.cjs");
const { BridgeClient } = require("../../../extensions/redcode/dist/bridgeClient.js");

function setting(key) {
  try {
    const text = fs.readFileSync(path.join(process.env.APPDATA ?? "", "Code", "User", "settings.json"), "utf8");
    const m = new RegExp(`"${key.replace(/\./g, "\\.")}"\\s*:\\s*"((?:[^"\\\\]|\\\\.)*)"`).exec(text);
    return m ? JSON.parse(`"${m[1]}"`) || undefined : undefined;
  } catch {
    return undefined;
  }
}

/** Starts REDbridge; `call` is what the package's functions take, `client.stop()` ends it. */
async function startBridge() {
  let exe = process.env.REDBRIDGE_EXE || setting("redcode.bridgePath");
  const gamePath = process.env.REDCODE_GAME_PATH || setting("redcode.gamePath");
  if (!exe || !gamePath) throw new Error("Set REDBRIDGE_EXE and REDCODE_GAME_PATH, or redcode.bridgePath and redcode.gamePath in VS Code's settings.");
  if (fs.existsSync(exe) && fs.statSync(exe).isDirectory()) exe = path.join(exe, "REDbridge.exe");
  const client = new BridgeClient({ exe, gamePath });
  client.start();
  return { client, call: core.callOf(client) };
}

module.exports = { ...core, startBridge };
