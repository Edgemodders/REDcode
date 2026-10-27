// Unit checks for logic with no VS Code or game needed: Pack and Play's hot swap choice (REDcode issue #11).
//
//   npm run build && npm test
//
// Uses dist/hotSwap.js, which the build writes.
import assert from "node:assert/strict";
import * as fs from "node:fs";
import * as http from "node:http";
import { createRequire } from "node:module";
import * as os from "node:os";
import * as path from "node:path";

const require = createRequire(import.meta.url);
const hs = require("../dist/hotSwap.js");

let passed = 0;
const failures = [];
async function check(name, fn) {
  try {
    await fn();
    passed++;
  } catch (e) {
    failures.push(name);
    console.error(`FAIL ${name}\n  ${e.message.split("\n").join("\n  ")}`);
  }
}

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "redcode-unit-"));
const write = (rel, content) => {
  const f = path.join(tmp, rel);
  fs.mkdirSync(path.dirname(f), { recursive: true });
  fs.writeFileSync(f, content);
  return f;
};

// ---- REDnode's settings ----

await check("settings: REDnode never ran", () => {
  assert.deepEqual(hs.readRednodeMcp(path.join(tmp, "none", "settings.json")), { installed: false, enabled: false, port: 41820 });
});
await check("settings: switch on, port and token", () => {
  const f = write("a/settings.json", JSON.stringify({ mcp: { enabled: true, port: 41999, token: "abc" } }));
  assert.deepEqual(hs.readRednodeMcp(f), { installed: true, enabled: true, port: 41999, token: "abc" });
});
await check("settings: no mcp section, default port, no token", () => {
  const f = write("b/settings.json", JSON.stringify({ theme: "hud" }));
  assert.deepEqual(hs.readRednodeMcp(f), { installed: true, enabled: false, port: 41820, token: undefined });
});
await check("settings: a bad port falls back to the default", () => {
  const f = write("c/settings.json", JSON.stringify({ mcp: { port: "x", token: "t" } }));
  assert.equal(hs.readRednodeMcp(f).port, 41820);
});
await check("settings: broken JSON counts as not installed", () => {
  const f = write("d/settings.json", "{ not json");
  assert.equal(hs.readRednodeMcp(f).installed, false);
});
await check("settings: the file lives under %APPDATA%\\@rednode\\overlay", () => {
  assert.equal(hs.rednodeSettingsFile("C:\\Users\\x\\AppData\\Roaming"), path.join("C:\\Users\\x\\AppData\\Roaming", "@rednode", "overlay", "settings.json"));
});

// ---- sound paks ----

await check("sound paks: .opuspak and .opusinfo, any case", () => {
  const files = ["a\\base\\sound\\soundbanks\\sfx_container.opusinfo", "a\\base\\sound\\soundbanks\\sfx_container_12.OPUSPAK", "a\\base\\x.mesh", "a\\b.opus"];
  assert.deepEqual(hs.soundPaksIn(files), files.slice(0, 2));
});

// ---- RED Hot Tools' lookup ----

await check("lookup: a mixed-case replace among lowercase names is missed", () => {
  assert.equal(hs.hotToolsLookupMisses(["basegame_a.archive", "EDGEmatA.archive", "zzz.archive"], "EDGEmatA.archive"), true);
});
await check("lookup: a lowercase replace is found", () => {
  assert.equal(hs.hotToolsLookupMisses(["basegame_a.archive", "edgemat.archive", "zzz_rednode_test.archive"], "zzz_rednode_test.archive"), false);
});
await check("lookup: a new archive has nothing to reopen", () => {
  assert.equal(hs.hotToolsLookupMisses(["basegame_a.archive"], "MyMod.archive"), false);
});
await check("lookup: other files in the folder do not count", () => {
  assert.equal(hs.hotToolsLookupMisses(["readme.txt", "mymod.archive", "mymod.xl"], "mymod.archive"), false);
});
await check("lookup: hotToolsMisses reads the game's archive/pc/mod", () => {
  const game = path.join(tmp, "game");
  for (const n of ["basegame_a.archive", "EDGEmatA.archive", "zzz.archive"]) write(path.join("game", "archive", "pc", "mod", n), "");
  assert.deepEqual(hs.hotToolsMisses(game, [path.join(tmp, "packed", "EDGEmatA.archive"), path.join(tmp, "packed", "new.archive")]), ["EDGEmatA.archive"]);
  assert.deepEqual(hs.hotToolsMisses(path.join(tmp, "nogame"), ["x.archive"]), []);
});
await check("lookup: the Edgemodders build is told by its tag", () => {
  const official = path.join(tmp, "official");
  const fork = path.join(tmp, "fork");
  write(path.join("official", "red4ext", "plugins", "RedHotTools", "RedHotTools.dll"), Buffer.from("MZ\0\0RedHotTools 1.3.0\0"));
  write(path.join("fork", "red4ext", "plugins", "RedHotTools", "RedHotTools.dll"), Buffer.from("MZ\0\0RedHotTools\0+edgemodders.1\0"));
  assert.equal(hs.isEdgemoddersHotTools(official), false);
  assert.equal(hs.isEdgemoddersHotTools(fork), true);
  assert.equal(hs.isEdgemoddersHotTools(path.join(tmp, "nogame")), false);
});

// ---- the choice without REDnode ----

await check("route: no RED Hot Tools installs for the next start", () => {
  assert.deepEqual(hs.chooseHotRoute({ hotTools: false, soundPaks: ["x.opuspak"], lookupMisses: [] }), { route: "install" });
});
await check("route: sound paks are refused", () => {
  assert.deepEqual(hs.chooseHotRoute({ hotTools: true, soundPaks: ["x.opuspak"], lookupMisses: ["A.archive"] }), { route: "refuse-sound", paks: ["x.opuspak"] });
});
await check("route: a replace RED Hot Tools would miss is refused", () => {
  assert.deepEqual(hs.chooseHotRoute({ hotTools: true, soundPaks: [], lookupMisses: ["A.archive"] }), { route: "refuse-lookup", archives: ["A.archive"] });
});
await check("route: a plain archive goes to the hot folder", () => {
  assert.deepEqual(hs.chooseHotRoute({ hotTools: true, soundPaks: [], lookupMisses: [] }), { route: "hot" });
});
await check("refusal: names REDnode 0.26.8 and the restart", () => {
  const t = hs.soundRefusal(["a\\sfx_container.opusinfo"]);
  assert.match(t, /REDnode 0\.26\.8 or later/);
  assert.match(t, /sfx_container\.opusinfo/);
  assert.match(t, /restart the game/);
});
await check("hint: none without REDnode, the switch when it is off", () => {
  assert.equal(hs.rednodeHint({ installed: false, enabled: false, port: 41820 }), "");
  assert.match(hs.rednodeHint({ installed: true, enabled: false, port: 41820, token: "t" }, { kind: "unreachable", why: "" }), /switch on MCP server/);
  assert.match(hs.rednodeHint({ installed: true, enabled: true, port: 41820, token: "t" }, { kind: "unauthorized" }), /refused REDcode/);
  assert.equal(hs.rednodeHint({ installed: true, enabled: true, port: 41820, token: "t" }, { kind: "unreachable", why: "" }), "");
});

// ---- REDnode's reply ----

const rpc = (result) => JSON.stringify({ jsonrpc: "2.0", id: 1, result });
await check("reply: 401 is unauthorized", () => {
  assert.deepEqual(hs.readReply(401, "application/json", '{"error":"A valid token is required"}'), { kind: "unauthorized" });
});
await check("reply: an answer with a sound note", () => {
  const answer = { reloaded: ["C:\\p\\MyMod.archive"], failed: [], via: "red-hot-tools", ms: 512, sound: { index: "reloaded", note: "A sound that just played may keep its old version." } };
  const r = hs.readReply(200, "application/json", rpc({ content: [{ type: "text", text: JSON.stringify(answer, null, 2) }] }));
  assert.equal(r.kind, "answer");
  assert.deepEqual(r.answer.reloaded, answer.reloaded);
  const s = hs.summarize(r.answer);
  assert.match(s, /REDnode swapped MyMod\.archive into the running game in 512 ms/);
  assert.match(s, /Sounds: A sound that just played/);
});
await check("reply: failed files are listed", () => {
  const r = hs.readReply(200, "application/json", rpc({ content: [{ type: "text", text: JSON.stringify({ reloaded: [], failed: [{ file: "C:\\p\\A.archive", why: "RED Hot Tools did not take it" }], ms: 3 }) }] }));
  assert.match(hs.summarize(r.answer), /A\.archive was not swapped: RED Hot Tools did not take it/);
});
await check("reply: isError is a refusal with REDnode's words", () => {
  assert.deepEqual(hs.readReply(200, "application/json", rpc({ content: [{ type: "text", text: "Load a save first" }], isError: true })), { kind: "refused", why: "Load a save first" });
});
await check("reply: a JSON-RPC error is a refusal", () => {
  const r = hs.readReply(200, "application/json", JSON.stringify({ jsonrpc: "2.0", id: 1, error: { code: -32602, message: "Tool archives_reload not found" } }));
  assert.equal(r.kind, "refused");
  assert.match(r.why, /Tools Manager/);
});
await check("reply: an event stream carries the same message", () => {
  const body = `event: message\ndata: ${rpc({ content: [{ type: "text", text: '{"reloaded":["x.archive"],"failed":[]}' }] })}\n\n`;
  assert.equal(hs.readReply(200, "text/event-stream", body).kind, "answer");
});
await check("call: nothing listening is unreachable", async () => {
  const server = http.createServer();
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  const port = server.address().port;
  await new Promise((r) => server.close(r));
  const r = await hs.callArchivesReload({ port, token: "t" }, ["x.archive"], 5000);
  assert.equal(r.kind, "unreachable");
});

fs.rmSync(tmp, { recursive: true, force: true });
console.log(`${passed} passed${failures.length ? `, ${failures.length} failed` : ""}`);
process.exit(failures.length ? 1 : 0);
