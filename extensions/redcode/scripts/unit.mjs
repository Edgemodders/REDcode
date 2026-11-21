// Unit checks for logic with no VS Code or game needed: Pack and Play's hot swap choice (REDcode issue #11),
// the export cache's game stamp (a game patch empties the cached game files), Add to Library's item
// (REDcode issue #19), the open contract (REDcode issue #22) and the animation view's clips (REDcode issue #21).
//
//   npm run build && npm test
//
// Uses dist/hotSwap.js, dist/exportCache.js, dist/library.js, dist/opens.js and dist/animsGlb.js, which the build writes.
import assert from "node:assert/strict";
import * as fs from "node:fs";
import * as http from "node:http";
import { createRequire } from "node:module";
import * as os from "node:os";
import * as path from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const hs = require("../dist/hotSwap.js");
const ec = require("../dist/exportCache.js");
const lib = require("../dist/library.js");

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

// ---- what a swap does not carry ----

await check("loose: tweaks, scripts and .xl not in the game are listed; archives and same files are not", () => {
  const packed = path.join(tmp, "loose", "packed");
  const game = path.join(tmp, "loose", "game");
  write("loose/packed/archive/pc/mod/My.archive", "a");
  write("loose/packed/archive/pc/mod/my.archive.xl", "xl");
  write("loose/packed/r6/tweaks/My/one.yaml", "one");
  write("loose/packed/r6/tweaks/My/two.yaml", "two");
  write("loose/packed/r6/scripts/My/x.reds", "reds");
  write("loose/game/r6/tweaks/My/one.yaml", "one");
  write("loose/game/r6/tweaks/My/two.yaml", "older");
  assert.deepEqual(hs.looseNotInGame(packed, game).sort(), ["archive/pc/mod/my.archive.xl", "r6/scripts/My/x.reds", "r6/tweaks/My/two.yaml"]);
});
await check("loose: nothing to say when the game has them all", () => {
  write("loose2/packed/archive/pc/mod/My.archive", "a");
  write("loose2/packed/r6/tweaks/t.yaml", "t");
  write("loose2/game/r6/tweaks/t.yaml", "t");
  assert.deepEqual(hs.looseNotInGame(path.join(tmp, "loose2", "packed"), path.join(tmp, "loose2", "game")), []);
  assert.equal(hs.looseNote([]), "");
});
await check("loose: the note names what is missing and the restart", () => {
  const files = ["r6/tweaks/a.yaml", "r6/tweaks/b.yaml", "r6/scripts/x.reds", "archive/pc/mod/x.archive.xl", "mods/M/info.json"];
  assert.equal(hs.describeLoose(files), "2 tweaks, 1 script, 1 ArchiveXL file and 1 REDmod file");
  assert.equal(hs.describeLoose(["r6/tweaks/a.yaml"]), "1 tweak");
  const note = hs.looseNote(files);
  assert.match(note, /archives only/);
  assert.match(note, /restart the game/);
});

// ---- what Pack and Play says ----

await check("hint: none without REDnode, the switch when it is off", () => {
  assert.equal(hs.rednodeHint({ installed: false, enabled: false, port: 41820 }), "");
  assert.match(hs.rednodeHint({ installed: true, enabled: false, port: 41820, token: "t" }, { kind: "unreachable", why: "" }), /switch on MCP server/);
  assert.match(hs.rednodeHint({ installed: true, enabled: true, port: 41820, token: "t" }, { kind: "unauthorized" }), /refused REDcode/);
  assert.equal(hs.rednodeHint({ installed: true, enabled: true, port: 41820, token: "t" }, { kind: "unreachable", why: "" }), "");
});
await check("installed: names REDswap without REDnode, the hint or the restart with it", () => {
  assert.match(hs.installedNote({ installed: false, enabled: false, port: 41820 }), /REDnode 0\.41\.0 or later, which brings REDswap/);
  assert.match(hs.installedNote({ installed: true, enabled: false, port: 41820, token: "t" }), /switch on MCP server/);
  assert.match(hs.installedNote({ installed: true, enabled: true, port: 41820, token: "t" }, { kind: "unreachable", why: "" }), /start the game with REDnode/);
  assert.doesNotMatch(hs.installedNote({ installed: false, enabled: false, port: 41820 }), /Red Hot Tools|hot folder/i);
});

// ---- REDnode's reply ----

const rpc = (result) => JSON.stringify({ jsonrpc: "2.0", id: 1, result });
await check("reply: 401 is unauthorized", () => {
  assert.deepEqual(hs.readReply(401, "application/json", '{"error":"A valid token is required"}'), { kind: "unauthorized" });
});
await check("reply: an answer with a sound note", () => {
  const answer = { reloaded: ["C:\\p\\MyMod.archive"], failed: [], via: "redswap", ms: 512, sound: { index: "reloaded", note: "A sound that just played may keep its old version." } };
  const r = hs.readReply(200, "application/json", rpc({ content: [{ type: "text", text: JSON.stringify(answer, null, 2) }] }));
  assert.equal(r.kind, "answer");
  assert.deepEqual(r.answer.reloaded, answer.reloaded);
  const s = hs.summarize(r.answer);
  assert.match(s, /REDnode swapped MyMod\.archive into the running game in 512 ms/);
  assert.match(s, /Sounds: A sound that just played/);
});
await check("reply: failed files are listed", () => {
  const r = hs.readReply(200, "application/json", rpc({ content: [{ type: "text", text: JSON.stringify({ reloaded: [], failed: [{ file: "C:\\p\\A.archive", why: "REDswap did not take it" }], ms: 3 }) }] }));
  assert.match(hs.summarize(r.answer), /A\.archive was not swapped: REDswap did not take it/);
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

// ---- the export cache's game stamp ----

const fakeGame = (dir, exeBytes) => write(path.join(dir, "bin", "x64", "Cyberpunk2077.exe"), "x".repeat(exeBytes));
const fakeBridge = (gameDir) => ({ info: async () => ({ gameDir }), extract: async (gamePath, out) => { fs.mkdirSync(path.dirname(out), { recursive: true }); fs.writeFileSync(out, `from ${gameDir}`); } });

await check("cache: a cache from before the stamp is emptied", async () => {
  const root = path.join(tmp, "cacheA");
  write(path.join("cacheA", "game", "archive", "base", "sound", "soundbanks", "sfx_container.opusinfo"), "2.31 index");
  const game = path.join(tmp, "gameA");
  fakeGame("gameA", 10);
  const r = await ec.sourceFile(fakeBridge(game), root, { gamePath: "base\sound\soundbanks\sfx_container.opusinfo" });
  assert.equal(fs.readFileSync(r.file, "utf8"), `from ${game}`);
  assert.ok(fs.readFileSync(path.join(root, "game", "stamp.txt"), "utf8").includes("|10|"));
});
await check("cache: the same game keeps its files", async () => {
  const root = path.join(tmp, "cacheA");
  const file = path.join(root, "game", "archive", "kept.txt");
  fs.writeFileSync(file, "kept");
  await ec.sourceFile(fakeBridge(path.join(tmp, "gameA")), root, { gamePath: "kept.txt" });
  assert.equal(fs.readFileSync(file, "utf8"), "kept");
});
await check("cache: a patched game (another exe) empties it", async () => {
  const root = path.join(tmp, "cacheA");
  fakeGame("gameA", 12);
  const r = await ec.sourceFile(fakeBridge(path.join(tmp, "gameA")), root, { gamePath: "kept.txt" });
  assert.equal(fs.readFileSync(r.file, "utf8"), `from ${path.join(tmp, "gameA")}`);
});
await check("cache: another game folder empties it", async () => {
  const root = path.join(tmp, "cacheA");
  fakeGame("gameB", 12);
  const r = await ec.sourceFile(fakeBridge(path.join(tmp, "gameB")), root, { gamePath: "kept.txt" });
  assert.equal(fs.readFileSync(r.file, "utf8"), `from ${path.join(tmp, "gameB")}`);
});
await check("cache: no game loaded leaves it alone", async () => {
  const root = path.join(tmp, "cacheA");
  const before = fs.readFileSync(path.join(root, "game", "stamp.txt"), "utf8");
  assert.equal(await ec.gameCacheReady(fakeBridge(null), root), undefined);
  assert.equal(fs.readFileSync(path.join(root, "game", "stamp.txt"), "utf8"), before);
});
await check("cache: files on disk are never touched", async () => {
  const f = write("project/source/archive/base/x.mesh", "mine");
  const r = await ec.sourceFile(fakeBridge(path.join(tmp, "gameC")), path.join(tmp, "cacheA"), { file: f });
  assert.equal(r.file, f);
  assert.equal(fs.readFileSync(f, "utf8"), "mine");
});

// ---- Add to Library ---------------------------------------------------------------------------------
const ref = (p) => ({ DepotPath: { $type: "ResourcePath", $storage: "string", $value: p }, Flags: "Default" });
const G = {
  "base\\props\\chair.mesh": { externalMaterials: [ref("base\\props\\chair.mi"), ref("engine\\materials\\x.mi")], local: { MultilayerSetup: ref("base\\props\\chair.mlsetup"), Mask: ref("base\\props\\chair.mlmask"), none: { DepotPath: { $type: "ResourcePath", $storage: "uint64", $value: "0" } }, hashed: { DepotPath: { $type: "ResourcePath", $storage: "uint64", $value: "123" } } } },
  "base\\props\\chair.mi": { baseMaterial: ref("base\\materials\\metal_base.remt"), d: ref("base\\props\\chair_d.xbm"), gone: ref("base\\props\\gone.xbm"), loop: ref("base\\props\\chair.mesh"), bad: ref("..\\..\\evil.xbm") },
  "base\\props\\chair.mlsetup": { layer: ref("base\\surfaces\\materials\\metal.mltemplate"), micro: ref("base\\surfaces\\microblends\\m.xbm") },
  "base\\props\\chair_d.xbm": "leaf",
  "base\\props\\chair.mlmask": "leaf",
};
const libBridge = (game = G) => {
  const seen = { read: [] };
  return {
    seen,
    async toJson(p) { seen.read.push(p); if (!(p in game)) throw new Error("not in the game"); return { json: JSON.stringify(game[p]) }; },
    async fileToJson(f) { seen.read.push(f); return { json: fs.readFileSync(f, "utf8") }; },
    async extractMany(items) {
      const failed = [];
      let extracted = 0;
      for (const i of items) {
        if (i.path in game) { fs.mkdirSync(path.dirname(i.outFile), { recursive: true }); fs.writeFileSync(i.outFile, "game:" + i.path); extracted++; } else failed.push(i.path);
      }
      return { extracted, bytes: extracted * 10, failed };
    },
  };
};
const main = "base\\props\\chair.mesh";
const add = async (b, opts = {}, source = { path: main }) => lib.writeAsset(b, source, await lib.planAsset(b, source), { root: path.join(tmp, "lib"), tool: "REDcode 1.0", gameVersion: "2.5", ...opts });

await check("library: references: named ones and hash-only ones, no zero hashes", () => {
  const r = lib.referencesIn(G[main]);
  assert.deepEqual([...r.named].sort(), ["base\\props\\chair.mi", "base\\props\\chair.mlmask", "base\\props\\chair.mlsetup", "engine\\materials\\x.mi"]);
  assert.equal(r.unnamed, 1);
});
await check("library: the walk takes materials and textures, and leaves game-wide files", async () => {
  const p = await lib.planAsset(libBridge(), { path: main });
  assert.deepEqual(p.take.sort(), ["base\\props\\chair.mesh", "base\\props\\chair.mi", "base\\props\\chair.mlmask", "base\\props\\chair.mlsetup", "base\\props\\chair_d.xbm", "base\\props\\gone.xbm"]);
  assert.deepEqual(p.stay, ["base\\materials\\metal_base.remt", "base\\surfaces\\materials\\metal.mltemplate", "base\\surfaces\\microblends\\m.xbm", "engine\\materials\\x.mi"]);
  assert.deepEqual(p.badPaths, ["..\\..\\evil.xbm"]);
  assert.equal(p.unnamed, 1);
});
await check("library: the main file is taken even from a shared folder, and has to exist", async () => {
  const path2 = "base\\surfaces\\m.mi";
  const p = await lib.planAsset(libBridge({ [path2]: {} }), { path: path2 });
  assert.deepEqual(p.take, [path2]);
  await assert.rejects(lib.planAsset(libBridge(), { path: "base\\nothing.mesh" }), /not in the game/);
});
await check("library: an item: asset.json as asked, files at their game paths, a missing file reported", async () => {
  const r = await add(libBridge(), { folder: "Production/Meshes" });
  assert.equal(r.relative, "Production/Meshes/chair.mesh.asset");
  const a = JSON.parse(fs.readFileSync(path.join(r.item, "asset.json"), "utf8"));
  assert.match(a.id, /^[0-9a-f]{16}$/);
  assert.deepEqual({ ...a, id: 0, history: 0 }, { format: 1, id: 0, name: "chair", kind: "mesh", main, version: 1, from: { game: main, gameVersion: "2.5" }, license: "game", history: 0 });
  assert.equal(a.history[0].tool, "REDcode 1.0");
  assert.equal(a.history[0].did, "Added from the game");
  assert.equal(fs.readFileSync(path.join(r.item, "source", "archive", "base", "props", "chair_d.xbm"), "utf8"), "game:base\\props\\chair_d.xbm");
  assert.equal(fs.existsSync(path.join(r.item, "source", "archive", "base", "surfaces")), false);
  assert.deepEqual(r.missing, ["base\\props\\gone.xbm"]);
  assert.equal(r.files, 5);
});
await check("library: Use the game path, and the name is lowercase", async () => {
  const game = { "base\\Props\\Big_Chair.MESH": {} };
  const r = await add(libBridge(game), { folder: "Dev", gamePathFolders: true }, { path: "base\\Props\\Big_Chair.MESH" });
  assert.equal(r.relative, "Dev/base/Props/big_chair.mesh.asset");
  assert.equal(JSON.parse(fs.readFileSync(path.join(r.item, "asset.json"), "utf8")).name, "Big_Chair");
});
await check("library: an item already there stops, or goes beside it, or is replaced keeping id and name", async () => {
  const opts = { folder: "Twice" };
  const first = await add(libBridge(), opts);
  const fileOf = (r) => JSON.parse(fs.readFileSync(path.join(r.item, "asset.json"), "utf8"));
  const was = fileOf(first);
  fs.writeFileSync(path.join(first.item, "asset.json"), JSON.stringify({ ...was, name: "My chair" }));
  await assert.rejects(add(libBridge(), opts), (e) => e instanceof lib.ItemExists);
  const other = await add(libBridge(), { ...opts, ifExists: "another" });
  assert.equal(other.relative, "Twice/chair_2.mesh.asset");
  assert.notEqual(fileOf(other).id, was.id);
  fs.writeFileSync(path.join(first.item, "note.txt"), "gone after a replace");
  const again = await add(libBridge(), { ...opts, ifExists: "replace" });
  const now = fileOf(again);
  assert.deepEqual([now.id, now.name, now.version, now.history.length], [was.id, "My chair", 2, 2]);
  assert.equal(fs.existsSync(path.join(again.item, "note.txt")), false);
});
await check("library: nothing half made is left when it fails", async () => {
  const b = libBridge();
  const plan = await lib.planAsset(b, { path: main });
  b.extractMany = async () => { throw new Error("disk full"); };
  const root = path.join(tmp, "libFail");
  await assert.rejects(lib.writeAsset(b, { path: main }, plan, { root, folder: "F", tool: "t" }), /disk full/);
  assert.deepEqual(fs.readdirSync(path.join(root, "F")), []);
});
await check("library: a project's copies win, and a file only in the project is the modder's own", async () => {
  const dir = path.join(tmp, "proj");
  const own = "edgemodders\\new\\thing.mesh";
  write("proj/source/archive/edgemodders/new/thing.mesh", JSON.stringify({ a: ref("base\\props\\chair_d.xbm"), b: ref("edgemodders\\new\\thing.mi") }));
  write("proj/source/archive/edgemodders/new/thing.mi", JSON.stringify({}));
  write("proj/source/archive/base/props/chair_d.xbm", "mine");
  const r = await add(libBridge(), { folder: "P" }, { path: own, project: { name: "Proj", dir } });
  assert.equal(fs.readFileSync(path.join(r.item, "source", "archive", "base", "props", "chair_d.xbm"), "utf8"), "mine");
  const a = JSON.parse(fs.readFileSync(path.join(r.item, "asset.json"), "utf8"));
  assert.deepEqual(a.from, { project: "Proj", path: own });
  assert.equal(a.license.source, "own");
  assert.equal(a.history[0].did, "Added from project Proj");
});
await check("library: a project's edited copy of a game file still carries the game's terms", async () => {
  const dir = path.join(tmp, "proj2");
  write("proj2/source/archive/base/props/chair.mesh", JSON.stringify({}));
  const r = await add(libBridge(), { folder: "P2" }, { path: main, project: { name: "Proj2", dir } });
  assert.equal(JSON.parse(fs.readFileSync(path.join(r.item, "asset.json"), "utf8")).license, "game");
});
await check("library: folders: the modder's, without items or hidden ones; nothing leaves the root", () => {
  const root = path.join(tmp, "libList");
  write("libList/Prod/Meshes/chair.mesh.asset/source/x.txt", "");
  write("libList/Prod/b.bake/x.txt", "");
  write("libList/.redcode-add-1/x.txt", "");
  assert.deepEqual(lib.libraryFolders(root), ["Prod", "Prod/Meshes"]);
  assert.equal(lib.safeFolder("Prod\\Meshes/"), "Prod/Meshes");
  assert.equal(lib.safeFolder(undefined), "");
  for (const bad of ["..", "a/../b", "C:/x", "a/b.mesh.asset", "con:"]) assert.throws(() => lib.safeFolder(bad), bad);
  assert.equal(lib.safeGamePath("a/../b.xbm"), undefined);
  assert.equal(lib.safeGamePath("base/x/y.xbm"), "base\\x\\y.xbm");
});
await check("library: the root: read, written keeping other fields, refused inside the game", async () => {
  const file = path.join(tmp, "cfg", "library.json");
  assert.equal(lib.readLibraryRoot(file), undefined);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify({ other: 1 }));
  const root = lib.writeLibraryRoot(path.join(tmp, "rootA"), file);
  assert.equal(lib.readLibraryRoot(file), root);
  assert.equal(JSON.parse(fs.readFileSync(file, "utf8")).other, 1);
  await assert.rejects(add(libBridge(), { root: path.join(tmp, "game", "Library"), gameDir: path.join(tmp, "game") }), /inside the game/);
});

// ---- the Library view and Add to Project (REDcode issue #23) ----
const libItem = (root, rel, asset, files = {}) => {
  const dir = path.join(root, ...rel.split("/"));
  fs.mkdirSync(dir, { recursive: true });
  if (asset) fs.writeFileSync(path.join(dir, rel.endsWith(".bake") ? "bake.json" : "asset.json"), JSON.stringify(asset));
  for (const [f, text] of Object.entries(files)) {
    const out = path.join(dir, ...f.split("/"));
    fs.mkdirSync(path.dirname(out), { recursive: true });
    fs.writeFileSync(out, text);
  }
  return dir;
};
const chairAsset = (version = 1) => ({ format: 1, id: "a1b2c3d4e5f60718", name: "Chair", kind: "mesh", main: "base\\props\\chair.mesh", version, history: [{ tool: "REDcode 0.10.6", did: "Added from the game" }] });
const chairFiles = (v = "1") => ({ "source/archive/base/props/chair.mesh": `mesh ${v}`, "source/archive/base/props/chair_d.xbm": `xbm ${v}` });

await check("library view: a folder lists folders, items and model files; the kind from the folder's name, the tool from history", () => {
  const root = path.join(tmp, "lv1");
  libItem(root, "Meshes/chair.mesh.asset", chairAsset(), chairFiles());
  libItem(root, "Meshes/jacket.prop.asset", { format: 1, id: "p1", name: "Red jacket", kind: "mesh", version: 3, history: [{ tool: "EDGEfab 0.1.0" }] }, { "source/archive/x/jacket.ent": "e" });
  libItem(root, "Meshes/street.bake", { id: "b1", version: 2 });
  libItem(root, "Meshes/.hidden", null);
  libItem(root, "Meshes/Sub", null);
  write("lv1/Meshes/model.glb", "glb");
  write("lv1/Meshes/notes.txt", "x");
  const l = lib.listLibraryFolder(path.join(root, "Meshes"));
  assert.deepEqual(l.folders.map((f) => path.basename(f)), ["Sub"]);
  assert.deepEqual(l.items.map((i) => [i.name, i.kind, i.tool ?? null, i.addable]), [
    ["Chair", "mesh", "REDcode", true],
    ["Red jacket", "prop", "EDGEfab", false],
    ["street", "bake", null, false],
  ]);
  assert.deepEqual(l.models.map((f) => path.basename(f)), ["model.glb"]);
  assert.equal(lib.libraryItems(root).length, 3);
});

await check("library: Add to Project copies the item's files and writes REDcode's entry, keeping other tools' entries and fields", () => {
  const root = path.join(tmp, "lv2");
  const item = libItem(root, "Meshes/chair.mesh.asset", chairAsset(), chairFiles());
  const proj = path.join(tmp, "lv2proj");
  write("lv2proj/source/library.json", JSON.stringify({ format: 1, extra: "kept", items: [{ id: "p1", by: "edgefab", kind: "prop", path: "x", version: 3, files: ["source/raw/x.json"] }] }));
  const plan = lib.planAddToProject(item, proj);
  assert.deepEqual(plan.clashes, []);
  assert.deepEqual(plan.files, ["source/archive/base/props/chair.mesh", "source/archive/base/props/chair_d.xbm"]);
  const r = lib.addItemToProject(plan, root, proj);
  assert.deepEqual(r, { files: 2, replaced: false, removed: 0 });
  assert.equal(fs.readFileSync(path.join(proj, "source", "archive", "base", "props", "chair.mesh"), "utf8"), "mesh 1");
  const note = JSON.parse(fs.readFileSync(path.join(proj, "source", "library.json"), "utf8"));
  assert.equal(note.extra, "kept");
  assert.equal(note.items.length, 2);
  assert.equal(note.items[0].by, "edgefab");
  const ours = note.items[1];
  assert.deepEqual({ ...ours, added: 0 }, { id: "a1b2c3d4e5f60718", kind: "mesh", path: "Meshes/chair.mesh.asset", version: 1, added: 0, by: "redcode", files: plan.files });
});

await check("library: Add to Project asks about the project's own files only, and removes files the item no longer has", () => {
  const root = path.join(tmp, "lv3");
  const item = libItem(root, "chair.mesh.asset", chairAsset(), chairFiles());
  const proj = path.join(tmp, "lv3proj");
  write("lv3proj/source/archive/base/props/chair_d.xbm", "the modder's own");
  const first = lib.planAddToProject(item, proj);
  assert.deepEqual(first.clashes, ["source/archive/base/props/chair_d.xbm"]);
  lib.addItemToProject(first, root, proj);
  // Version 2 drops the texture and adds a normal map: the earlier files are not clashes, the dropped one goes.
  fs.rmSync(path.join(item, "source", "archive", "base", "props", "chair_d.xbm"));
  libItem(root, "chair.mesh.asset", chairAsset(2), { "source/archive/base/props/chair.mesh": "mesh 2", "source/archive/base/props/chair_n.xbm": "n" });
  const again = lib.planAddToProject(item, proj);
  assert.deepEqual(again.clashes, []);
  assert.equal(again.previous.version, 1);
  assert.deepEqual(lib.addItemToProject(again, root, proj), { files: 2, replaced: true, removed: 1 });
  assert.equal(fs.existsSync(path.join(proj, "source", "archive", "base", "props", "chair_d.xbm")), false);
  assert.equal(fs.readFileSync(path.join(proj, "source", "archive", "base", "props", "chair.mesh"), "utf8"), "mesh 2");
  const note = JSON.parse(fs.readFileSync(path.join(proj, "source", "library.json"), "utf8"));
  assert.equal(note.items.length, 1);
  assert.equal(note.items[0].version, 2);
});

await check("library: an earlier entry's file that would leave the project's source folder is never removed", () => {
  const root = path.join(tmp, "lv4");
  const item = libItem(root, "chair.mesh.asset", chairAsset(), chairFiles());
  const proj = path.join(tmp, "lv4proj");
  const outside = write("lv4outside.txt", "keep me");
  write("lv4proj/source/library.json", JSON.stringify({ format: 1, items: [{ id: "a1b2c3d4e5f60718", by: "redcode", kind: "mesh", path: "chair.mesh.asset", version: 1, files: ["../../lv4outside.txt", "../lv4proj.cpmodproj"] }] }));
  lib.addItemToProject(lib.planAddToProject(item, proj), root, proj);
  assert.equal(fs.readFileSync(outside, "utf8"), "keep me");
});

await check("library: Refresh Project from Library finds items by id, else by path: newer, same, missing", () => {
  const root = path.join(tmp, "lv5");
  const proj = path.join(tmp, "lv5proj");
  libItem(root, "Moved/chair.mesh.asset", chairAsset(3), chairFiles("3"));
  libItem(root, "lamp.mesh.asset", { ...chairAsset(1), id: "ffff000011112222", name: "Lamp" }, chairFiles());
  write("lv5proj/source/library.json", JSON.stringify({ format: 1, items: [
    { id: "a1b2c3d4e5f60718", by: "redcode", kind: "mesh", path: "chair.mesh.asset", version: 1, files: [] },
    { id: "old-id", by: "redcode", kind: "mesh", path: "lamp.mesh.asset", version: 1, files: [] },
    { id: "gone", by: "redcode", kind: "mesh", path: "gone.mesh.asset", version: 1, files: [] },
    { id: "p1", by: "edgefab", kind: "prop", path: "x", version: 1, files: [] },
  ] }));
  const s = lib.projectLibraryState(proj, root);
  assert.deepEqual(s.map((x) => [x.entry.id, x.state, x.item?.name ?? null]), [
    ["a1b2c3d4e5f60718", "newer", "Chair"],
    ["old-id", "same", "Lamp"],
    ["gone", "missing", null],
  ]);
});

await check("library: other tools' items and bakes are theirs to add, and an item needs an id", () => {
  const root = path.join(tmp, "lv6");
  const prop = libItem(root, "jacket.prop.asset", { id: "p1", name: "Red jacket", history: [{ tool: "EDGEfab 0.1.0" }] }, { "source/archive/x/jacket.ent": "e" });
  const bake = libItem(root, "street.bake", { id: "b1" }, { "source/archive/x.streamingsector": "s" });
  const noId = libItem(root, "chair.mesh.asset", { name: "Chair" }, chairFiles());
  const proj = path.join(tmp, "lv6proj");
  assert.throws(() => lib.planAddToProject(prop, proj), /prop that EDGEfab adds/);
  assert.throws(() => lib.planAddToProject(bake, proj), /EDGEbuilder's Include in project/);
  assert.throws(() => lib.planAddToProject(noId, proj), /has no id/);
});

await check("Add to Library: a folder rename waits for a file held open, and says so if it stays open", async () => {
  const dir = path.join(tmp, "rename");
  const from = path.join(dir, "from");
  fs.mkdirSync(path.join(from, "sub"), { recursive: true });
  const file = path.join(from, "sub", "x.bin");
  fs.writeFileSync(file, "x");
  const fd = fs.openSync(file, "r");
  await assert.rejects(lib.renameFolder(from, path.join(dir, "to"), [10, 10]), /something has a file in it open/);
  setTimeout(() => fs.closeSync(fd), 100);
  await lib.renameFolder(from, path.join(dir, "to"), [50, 100, 200, 400, 800]);
  assert.ok(fs.existsSync(path.join(dir, "to", "sub", "x.bin")));
  await assert.rejects(lib.renameFolder(path.join(dir, "none"), path.join(dir, "to2"), [10]), /ENOENT/);
});

// ---- the open contract (REDcode issue #22) ----------------------------------------------------

const opens = require("../dist/opens.js");
const edgehack = {
  id: "edgemodders.edgehack",
  packageJSON: {
    displayName: "EDGEhack",
    edgemodders: {
      opens: [
        { tweakdb: { type: "Item", flat: "itemType", is: "ItemType.Prt_Program" }, command: "edgehack.openQuickhack" },
        { tweakdb: { type: "ObjectAction", flat: "isQuickHack", is: true }, command: "edgehack.openQuickhack" },
        { files: "**/*.quickhack.json", command: "edgehack.openFile" },
      ],
    },
  },
};

await check("open contract: a tool's tweakdb claims are read, in order, with its display name", () => {
  const claims = opens.readClaims([{ id: "other.ext", packageJSON: { name: "other" } }, edgehack]);
  assert.equal(claims.length, 2);
  assert.deepEqual(claims[0], { tweakdb: { type: "Item", flat: "itemType", is: "ItemType.Prt_Program" }, command: "edgehack.openQuickhack", extension: "edgemodders.edgehack", title: "EDGEhack" });
  assert.deepEqual(claims[1].tweakdb, { type: "ObjectAction", flat: "isQuickHack", is: true });
});

await check("open contract: malformed entries are skipped and said, a files entry is not an error", () => {
  const said = [];
  const claims = opens.readClaims(
    [
      { id: "a.list", packageJSON: { edgemodders: { opens: { tweakdb: {} } } } },
      { id: "b.bad", packageJSON: { edgemodders: { opens: [{ tweakdb: { type: "Item" } }, { tweakdb: { type: "Item", flat: "x" }, command: "b.c" }, { tweakdb: { type: "Item" }, command: "b.ok" }] } } },
      edgehack,
    ],
    (m) => said.push(m),
  );
  assert.deepEqual(claims.map((c) => c.command), ["b.ok", "edgehack.openQuickhack", "edgehack.openQuickhack"]);
  assert.equal(claims[0].title, "b.bad");
  assert.equal(said.length, 3, said.join("\n"));
});

await check("open contract: flat values match as tweakdb.records gives them", () => {
  assert.equal(opens.flatIs("ItemType.Prt_Program", "itemtype.prt_program"), true);
  assert.equal(opens.flatIs("ItemType.Con_Ammo", "ItemType.Prt_Program"), false);
  assert.equal(opens.flatIs(true, true), true);
  assert.equal(opens.flatIs(false, true), false);
  assert.equal(opens.flatIs("true", true), false);
  assert.equal(opens.flatIs(["Tags.A", "Tags.Quickhack"], "tags.quickhack"), true);
  assert.equal(opens.flatIs({ key: "LocKey#1", text: "x" }, "LocKey#1"), true);
  assert.equal(opens.flatIs(undefined, true), false);
  assert.equal(opens.matchKey({ type: "Item", flat: "itemType", is: "X" }), opens.matchKey({ type: "item", flat: "itemType", is: "X" }));
});

// ---- the animation view's clips (REDcode issue #21) ------------------------------------------

const anims = require("../dist/animsGlb.js");

/** A small .glb as WolvenKit writes an .anims: two bones, two clips, all accessors in one buffer view. */
function animsFixture(file) {
  const floats = [0, 1, 2, /* clip 0 times */ 0, 0, 0, 1, 1, 1, 2, 2, 2, /* clip 0 positions */ 0, 0.5, /* clip 1 times */ 5, 5, 5, 6, 6, 6 /* clip 1 positions */];
  const bin = Buffer.from(new Float32Array(floats).buffer);
  const scalar = (byteOffset, count, max) => ({ bufferView: 0, byteOffset, componentType: 5126, count, type: "SCALAR", min: [0], max: [max] });
  const vec3 = (byteOffset, count) => ({ bufferView: 0, byteOffset, componentType: 5126, count, type: "VEC3" });
  const json = {
    asset: { version: "2.0" },
    scene: 0,
    scenes: [{ nodes: [0] }],
    nodes: [{ name: "Root", children: [1] }, { name: "Hips", translation: [0, 1, 0] }],
    skins: [{ joints: [0, 1], inverseBindMatrices: 99, name: "Armature" }],
    animations: [
      { name: "walk", channels: [{ sampler: 0, target: { node: 1, path: "translation" } }], samplers: [{ input: 0, output: 1, interpolation: "LINEAR" }] },
      { name: "idle", channels: [{ sampler: 0, target: { node: 1, path: "translation" } }], samplers: [{ input: 2, output: 3, interpolation: "LINEAR" }] },
    ],
    accessors: [scalar(0, 3, 2), vec3(12, 3), scalar(48, 2, 0.5), vec3(56, 2)],
    bufferViews: [{ buffer: 0, byteOffset: 0, byteLength: bin.length }],
    buffers: [{ byteLength: bin.length }],
  };
  const text = Buffer.from(JSON.stringify(json));
  const pad = Buffer.alloc((4 - (text.length % 4)) % 4, 0x20);
  const head = Buffer.alloc(20);
  head.write("glTF", 0, "latin1");
  head.writeUInt32LE(2, 4);
  head.writeUInt32LE(20 + text.length + pad.length + 8 + bin.length, 8);
  head.writeUInt32LE(text.length + pad.length, 12);
  head.writeUInt32LE(0x4e4f534a, 16);
  const binHead = Buffer.alloc(8);
  binHead.writeUInt32LE(bin.length, 0);
  binHead.writeUInt32LE(0x004e4942, 4);
  fs.writeFileSync(file, Buffer.concat([head, text, pad, binHead, bin]));
}

/** A .glb in a Buffer: its JSON and its binary chunk. */
function parseGlb(b) {
  const jsonLength = b.readUInt32LE(12);
  const json = JSON.parse(b.subarray(20, 20 + jsonLength).toString("utf8"));
  const at = 20 + jsonLength;
  return { json, bin: at < b.length ? b.subarray(at + 8, at + 8 + b.readUInt32LE(at)) : undefined };
}

await check("animations: the list gives each clip's name, length and frames", () => {
  const file = path.join(tmp, "list.anims.glb");
  animsFixture(file);
  assert.deepEqual(anims.animsList(anims.readAnimsGlb(file)), [
    { name: "walk", duration: 2, frames: 3 },
    { name: "idle", duration: 0.5, frames: 2 },
  ]);
});

await check("animations: the skeleton has the bones and no keys or binary", () => {
  const file = path.join(tmp, "skel.anims.glb");
  animsFixture(file);
  const { json, bin } = parseGlb(anims.animsSkeleton(anims.readAnimsGlb(file)));
  assert.equal(bin, undefined);
  assert.deepEqual(json.nodes.map((n) => n.name), ["Root", "Hips"]);
  assert.deepEqual(json.skins, [{ joints: [0, 1] }]);
  assert.equal(json.animations, undefined);
  assert.equal(json.accessors, undefined);
});

await check("animations: a clip holds only its own keys, from a shared buffer view", () => {
  const file = path.join(tmp, "clip.anims.glb");
  animsFixture(file);
  const glb = anims.readAnimsGlb(file);
  const { json, bin } = parseGlb(anims.animsClip(glb, 1));
  assert.deepEqual(json.animations.map((a) => a.name), ["idle"]);
  assert.equal(json.accessors.length, 2);
  assert.equal(bin.length, 8 + 24, "2 times and 2 positions, nothing of the other clip");
  const read = (i) => {
    const a = json.accessors[i];
    const v = json.bufferViews[a.bufferView];
    const n = a.count * (a.type === "VEC3" ? 3 : 1);
    return Array.from({ length: n }, (_, k) => bin.readFloatLE(v.byteOffset + a.byteOffset + k * 4));
  };
  const s = json.animations[0].samplers[0];
  assert.deepEqual(read(s.input), [0, 0.5]);
  assert.deepEqual(read(s.output), [5, 5, 5, 6, 6, 6]);
  assert.equal(json.accessors[s.input].max[0], 0.5);
  assert.throws(() => anims.animsClip(glb, 2), /No animation 2/);
});

await check("run game: the exe starts without ELECTRON_RUN_AS_NODE, everything else kept (#24)", () => {
  const inst = require("../dist/install.js");
  const env = inst.gameEnv({ ELECTRON_RUN_AS_NODE: "1", Electron_Run_As_Node: "1", PATH: "C:\\Windows", APPDATA: "x" });
  assert.deepEqual(env, { PATH: "C:\\Windows", APPDATA: "x" });
  const mine = { ELECTRON_RUN_AS_NODE: "1" };
  inst.gameEnv(mine);
  assert.equal(mine.ELECTRON_RUN_AS_NODE, "1", "REDcode's own environment is left as it is");
  const exe = inst.launchTarget("D:\\GOG Games\\Cyberpunk 2077", "auto", false);
  assert.equal(exe.kind, "exe", "a GOG install takes the exe route");
});

await check("pack and play: archives REDnode swapped into the game are the project's for the next install", () => {
  const inst = require("../dist/install.js");
  const dir = path.join(tmp, "swapproj");
  const game = path.join(tmp, "swapgame");
  const project = { file: path.join(dir, "Swap.cpmodproj"), dir, name: "Swap", modName: "Swap" };
  const packedArchive = path.join(dir, "packed", "archive", "pc", "mod", "Swap.archive");
  fs.mkdirSync(path.dirname(packedArchive), { recursive: true });
  fs.writeFileSync(packedArchive, "new");
  fs.mkdirSync(path.join(dir, "packed", "r6", "tweaks"), { recursive: true });
  fs.writeFileSync(path.join(dir, "packed", "r6", "tweaks", "swap.yaml"), "x");
  // REDnode copied the archive into the game; nothing recorded yet, so it looks like someone else's.
  fs.mkdirSync(path.join(game, "archive", "pc", "mod"), { recursive: true });
  fs.writeFileSync(path.join(game, "archive", "pc", "mod", "Swap.archive"), "new");
  assert.deepEqual(inst.planInstall(project, game).foreign, ["archive/pc/mod/Swap.archive"]);
  // REDnode reports the packed path, with whatever case the drive letter has.
  const reported = packedArchive.replace(/^[A-Z]:/, (d) => d.toLowerCase());
  assert.deepEqual(inst.recordSwapped(project, game, [reported, path.join(tmp, "elsewhere.archive")]), ["archive/pc/mod/Swap.archive"]);
  assert.deepEqual(inst.planInstall(project, game).foreign, []);
  assert.deepEqual(inst.recordSwapped(project, game, [packedArchive]), [], "a second swap adds nothing");
  // An install then takes it out and puts the new one in, with nothing backed up.
  const record = inst.installDirect(project, game, () => undefined);
  assert.deepEqual(record.backedUp, []);
  assert.deepEqual(inst.recordSwapped(project, path.join(tmp, "othergame"), [packedArchive]), [], "another game folder's record is left alone");
});

// ---- New File (docs/design/new-file.md) ----

const nf = require("../dist/newFile.js");
const nfProject = { file: path.join(tmp, "nf", "My Mod.cpmodproj"), dir: path.join(tmp, "nf"), name: "My Mod", modName: "MyMod", author: "", email: "", description: "", version: "1.0.0" };

await check("new file: a name is checked as a game path", () => {
  assert.equal(nf.checkGameName("mymod\\icons\\atlas"), undefined);
  assert.equal(nf.checkGameName("mymod/icons/atlas_01.v2"), undefined, "/ and dots inside a name are fine");
  assert.match(nf.checkGameName("My Atlas"), /No spaces/);
  assert.match(nf.checkGameName("MyAtlas"), /Lowercase/);
  assert.match(nf.checkGameName("mymod\\\\atlas"), /empty/);
  assert.match(nf.checkGameName("mymod\\..\\atlas"), /\.\./);
  assert.match(nf.checkGameName("atlas#1"), /a to z/);
  assert.match(nf.checkGameName(".atlas"), /dot/);
  assert.match(nf.checkGameName("  "), /Type a name/);
  assert.equal(nf.checkTextName("MyMod"), undefined, "text files may have capitals");
  assert.match(nf.checkTextName("my\\mod"), /letters/);
});

await check("new file: the name gets its extension once, and the folder comes from where it was clicked", () => {
  assert.equal(nf.withExtension("mymod/atlas", ".inkatlas"), "mymod\\atlas.inkatlas");
  assert.equal(nf.withExtension("atlas.inkatlas", ".inkatlas"), "atlas.inkatlas");
  assert.equal(nf.withExtension("MyMod", ".archive.xl"), "MyMod.archive.xl");
  const archive = path.join(nfProject.dir, "source", "archive");
  assert.equal(nf.gameFolderOf(nfProject, path.join(archive, "base", "gameplay", "gui", "mymod")), "base\\gameplay\\gui\\mymod");
  assert.equal(nf.gameFolderOf(nfProject, path.join(nfProject.dir, "source", "raw", "mymod", "icons")), "mymod\\icons", "Raw mirrors Archive");
  assert.equal(nf.gameFolderOf(nfProject, archive), "");
  assert.equal(nf.gameFolderOf(nfProject, path.join(nfProject.dir, "source", "resources", "r6")), "");
  assert.equal(nf.gameFolderOf(nfProject, undefined), "");
  assert.equal(nf.gamePathFor("mymod\\icons", "Atlas.inkatlas"), "mymod\\icons\\atlas.inkatlas");
  assert.equal(nf.gamePathFor("", "mymod\\atlas.inkatlas"), "mymod\\atlas.inkatlas");
  assert.equal(nf.nameFrom("C:\\pictures\\My Icon (2).PNG"), "my_icon_2");
  assert.equal(nf.nameFrom("base\\gameplay\\gui\\common\\icons\\atlas_tabs_1080p.xbm"), "atlas_tabs_1080p");
});

await check("new file: text files go to their usual folders with one comment line", () => {
  const res = path.join(nfProject.dir, "source", "resources");
  assert.equal(nf.textFileTarget(nfProject, nf.newFileType("tweakxl"), "MyMod.yaml"), path.join(res, "r6", "tweaks", "MyMod", "MyMod.yaml"));
  assert.equal(nf.textFileTarget(nfProject, nf.newFileType("archivexl"), "MyMod.archive.xl"), path.join(res, "MyMod.archive.xl"), "packed beside the archive");
  assert.equal(nf.textFileTarget(nfProject, nf.newFileType("redscript"), "MyMod.reds"), path.join(res, "r6", "scripts", "MyMod", "MyMod.reds"));
  for (const id of ["tweakxl", "archivexl", "redscript"]) {
    const text = nf.textFileContent(nf.newFileType(id), nfProject);
    assert.equal(text.split("\n").filter(Boolean).length, 1, id);
    assert.match(text, /MyMod/);
  }
  assert.match(nf.textFileContent(nf.newFileType("redscript"), nfProject), /^\/\//);
  assert.match(nf.textFileContent(nf.newFileType("tweakxl"), nfProject), /^#/);
  assert.equal(nf.defaultTextName({ ...nfProject, modName: "My Mod!" }), "My_Mod_");
});

await check("new file: an atlas starts with its texture and one part covering it; a material on its base", () => {
  // REDbridge 0.15.0's cr2w.createInstance("inkTextureAtlas"), shortened: three empty slots.
  const slot = { $type: "inkTextureSlot", parts: [], slices: [], texture: { DepotPath: { $type: "ResourcePath", $storage: "uint64", $value: "0" }, Flags: "Soft" } };
  const defaults = { $type: "inkTextureAtlas", activeTexture: "StaticTexture", isSingleTextureMode: 1, slots: { Elements: [slot, { ...slot }, { ...slot }] }, textureResolution: "UltraHD_3840_2160" };
  const root = nf.atlasRoot(defaults, "mymod\\icons\\atlas.xbm");
  assert.equal(root.slots.Elements.length, 3, "the other two slots stay");
  const first = root.slots.Elements[0];
  assert.equal(first.texture.DepotPath.$value, "mymod\\icons\\atlas.xbm");
  assert.equal(first.texture.DepotPath.$storage, "string");
  assert.equal(first.parts.length, 1);
  assert.deepEqual(first.parts[0].partName, { $type: "CName", $storage: "string", $value: "whole" }, "a CName in its full form, as cr2w.fromJson needs");
  assert.deepEqual(first.parts[0].clippingRectInUVCoords, { $type: "RectF", Bottom: 1, Left: 0, Right: 1, Top: 0 });
  assert.equal(defaults.slots.Elements[0].parts.length, 0, "the defaults are not changed");
  const mi = nf.materialRoot({ $type: "CMaterialInstance", values: [] }, "engine\\materials\\multilayered.mt");
  assert.equal(mi.baseMaterial.DepotPath.$value, "engine\\materials\\multilayered.mt");
  assert.equal(nf.checkBaseMaterial("base\\materials\\glass_onesided.mt"), undefined);
  assert.match(nf.checkBaseMaterial("base\\materials\\glass.mesh"), /\.mt/);
  const json = JSON.parse(nf.cr2wJson(root));
  assert.equal(json.Data.RootChunk.cookingPlatform, "PLATFORM_PC", "written for the PC, as the game's own files");
  assert.equal(json.Data.Version, 195);
  assert.equal(json.Header.DataType, "CR2W");
});

await check("new file: an image's size comes from its header, and an odd side is caught before the import", () => {
  const { PNG } = require("pngjs");
  const png = new PNG({ width: 1195, height: 64 });
  assert.deepEqual(nf.imageSize(PNG.sync.write(png), ".png"), { width: 1195, height: 64 });
  // A JPEG with an APP0 segment before its frame header, as cameras and stock sites write them.
  const jpg = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, ...Buffer.from("JFIF\0"), 1, 1, 0, 0, 1, 0, 1, 0, 0, 0xff, 0xc2, 0x00, 0x11, 8, 0x17, 0xdc, 0x04, 0xaa, 3, 1, 0x22, 0, 2, 0x11, 1, 3, 0x11, 1]);
  assert.deepEqual(nf.imageSize(jpg, "jpg"), { width: 1194, height: 6108 });
  const tga = Buffer.alloc(18);
  tga.writeUInt16LE(512, 12);
  tga.writeUInt16LE(255, 14);
  assert.deepEqual(nf.imageSize(tga, ".TGA"), { width: 512, height: 255 });
  const dds = Buffer.alloc(128);
  dds.write("DDS ", 0, "latin1");
  dds.writeUInt32LE(256, 12);
  dds.writeUInt32LE(1024, 16);
  assert.deepEqual(nf.imageSize(dds, ".dds"), { width: 1024, height: 256 });
  const bmp = Buffer.alloc(54);
  bmp.write("BM", 0, "latin1");
  bmp.writeInt32LE(300, 18);
  bmp.writeInt32LE(-200, 22);
  assert.deepEqual(nf.imageSize(bmp, ".bmp"), { width: 300, height: 200 }, "a top-down BMP has a negative height");
  assert.equal(nf.imageSize(Buffer.from("not an image"), ".png"), undefined);
  assert.equal(nf.imageSize(Buffer.alloc(64), ".tiff"), undefined, "TIFF is left to WolvenKit");
  assert.equal(nf.hasOddSide({ width: 1195, height: 64 }), true);
  assert.equal(nf.hasOddSide({ width: 1194, height: 6108 }), false);
  assert.equal(nf.hasOddSide({ width: 512, height: 255 }), true);
});

await check("new file: Resize offers each odd side one pixel shorter, and scales the pixels to it", () => {
  assert.deepEqual(nf.evenSize({ width: 1195, height: 64 }), { width: 1194, height: 64 });
  assert.deepEqual(nf.evenSize({ width: 513, height: 255 }), { width: 512, height: 254 });
  assert.deepEqual(nf.evenSize({ width: 1, height: 3 }), { width: 2, height: 2 }, "a 1-pixel side grows to 2");
  assert.deepEqual(nf.evenSize({ width: 64, height: 32 }), { width: 64, height: 32 });
  // A 3 x 1 image, red, green, blue: scaled to 2 x 2, the left keeps red's side and the right blue's.
  const src = { width: 3, height: 1, data: new Uint8Array([255, 0, 0, 255, 0, 255, 0, 128, 0, 0, 255, 0]) };
  const out = nf.resizeRgba(src, 2, 2);
  assert.equal(out.data.length, 16);
  assert.ok(out.data[0] > out.data[2] && out.data[6] > out.data[4], "left is redder than blue, right is bluer than red");
  assert.deepEqual([...out.data.slice(0, 8)], [...out.data.slice(8, 16)], "both rows alike, from one source row");
  assert.ok(out.data[3] > 128 && out.data[7] < 128, "alpha is scaled too");
  // A flat colour stays exactly that colour.
  const flat = { width: 5, height: 3, data: new Uint8Array(5 * 3 * 4).map((_, i) => [10, 20, 30, 255][i % 4]) };
  const f = nf.resizeRgba(flat, 4, 2);
  assert.ok(f.data.every((v, i) => v === [10, 20, 30, 255][i % 4]));
  // Through PNG bytes, with pngjs as REDcode ships it.
  const { PNG } = require("pngjs");
  const png = new PNG({ width: 65, height: 33 });
  png.data.fill(200);
  const resized = PNG.sync.read(nf.resizePng(PNG.sync.write(png), 64, 32));
  assert.equal(resized.width, 64);
  assert.equal(resized.height, 32);
  assert.equal(resized.data[0], 200);
});

// ---- The redcode REDnode package: every window's project (issue #32) ----

await check("redcode REDnode package: installed, updated, and never put back to an older version", () => {
  const rs = require("../dist/rednodeService.js");
  const game = path.join(tmp, "pkggame");
  const apps = path.join(game, "red4ext", "plugins", "REDnode", "apps");
  fs.mkdirSync(apps, { recursive: true });
  fs.writeFileSync(path.join(apps, "..", "REDnode.dll"), "");
  const make = (v) => {
    const src = path.join(tmp, `pkgsrc-${v}`, "redcode");
    fs.mkdirSync(src, { recursive: true });
    fs.writeFileSync(path.join(src, "rednode-app.json"), JSON.stringify({ id: "redcode", version: v }));
    fs.writeFileSync(path.join(src, "service.mjs"), `// ${v}`);
    return src;
  };
  const installedVersion = () => JSON.parse(fs.readFileSync(path.join(apps, "redcode", "rednode-app.json"), "utf8")).version;
  assert.equal(rs.syncRednodePackage(make("0.2.0"), game).state, "installed");
  assert.equal(rs.syncRednodePackage(make("0.1.0"), game).state, "newer");
  assert.equal(installedVersion(), "0.2.0");
  assert.equal(rs.syncRednodePackage(make("0.10.0"), game).state, "updated");
  assert.equal(installedVersion(), "0.10.0");
  assert.equal(rs.syncRednodePackage(make("0.10.0"), game).state, "current");
  assert.ok(rs.compareVersions("0.2.0", "0.10.0") < 0);
});

await check("redcode service: every window's project, the last focused first; a closed window drops out; project() stays", async () => {
  const local = path.join(tmp, "localappdata");
  const before = process.env.LOCALAPPDATA;
  process.env.LOCALAPPDATA = local;
  try {
    const rs = require("../dist/rednodeService.js");
    const ref = (name) => ({ name, modName: name, file: `C:\\p\\${name}\\${name}.cpmodproj`, dir: `C:\\p\\${name}`, archive: "a", raw: "r", resources: "s", packed: "k" });
    // This process is one window; a second window is another live process, and a third is gone.
    rs.publishProject(ref("MineFirst"), true);
    const other = path.join(local, "REDcode", "projects", `${process.ppid}.json`);
    fs.writeFileSync(other, JSON.stringify({ pid: process.ppid, updated: "2030-01-01T00:00:00Z", focusedAt: "2030-01-01T00:00:00Z", project: ref("FocusedLater") }));
    const dead = path.join(local, "REDcode", "projects", "999999.json");
    fs.writeFileSync(dead, JSON.stringify({ pid: 999999, updated: "2031-01-01T00:00:00Z", focusedAt: "2031-01-01T00:00:00Z", project: ref("Closed") }));
    // The package's own service.mjs, with a stand-in for REDnode's rednode module.
    const pkg = path.join(tmp, "rnpkg");
    fs.mkdirSync(path.join(pkg, "node_modules", "rednode"), { recursive: true });
    fs.writeFileSync(path.join(pkg, "node_modules", "rednode", "package.json"), JSON.stringify({ name: "rednode", type: "module", main: "index.js" }));
    fs.writeFileSync(path.join(pkg, "node_modules", "rednode", "index.js"), "export const service = { emit: (...a) => (globalThis.__emits ??= []).push(a) };");
    fs.writeFileSync(path.join(pkg, "package.json"), JSON.stringify({ type: "module" }));
    fs.copyFileSync(path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "rednode", "redcode", "service.mjs"), path.join(pkg, "service.mjs"));
    const svc = await import(new URL(`file:///${path.join(pkg, "service.mjs").split(path.sep).join("/")}`).href);
    const all = svc.projects();
    assert.deepEqual(all.map((p) => p.name), ["FocusedLater", "MineFirst"], "live windows only, the last focused first");
    assert.ok(all.every((p) => typeof p.focusedAt === "string" && p.dir && p.archive));
    assert.equal(fs.existsSync(dead), false, "a closed window's file is cleared");
    assert.equal(svc.project().name, "MineFirst", "project() still answers project.json, the window that published last");
    rs.withdrawProject();
    assert.equal(fs.existsSync(rs.windowStateFile()), false, "withdrawing removes this window's file");
    assert.deepEqual(svc.projects().map((p) => p.name), ["FocusedLater"]);
    assert.equal(svc.project(), null);
    const manifest = JSON.parse(fs.readFileSync(path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "rednode", "redcode", "rednode-app.json"), "utf8"));
    assert.notEqual(manifest.version, "0.1.0", "service.mjs changed, so the package's version is raised and installed copies update");
  } finally {
    if (before === undefined) delete process.env.LOCALAPPDATA;
    else process.env.LOCALAPPDATA = before;
  }
});

// ---- The world view's host half (packages/world-view, docs/design/sector-view.md) ----

const wv = require("../dist/worldViewHost.js");
const closeTo = (a, b, eps = 1e-4) => Math.abs(a - b) < eps;

await check("world view: a game transform becomes the glTF-axes matrix three.js would make", async () => {
  const THREE = await import("three");
  // The game is Z up; glTF Y up: (x, y, z) to (x, z, -y), as WolvenKit exports meshes.
  const C = new THREE.Matrix4().set(1, 0, 0, 0, 0, 0, 1, 0, 0, -1, 0, 0, 0, 0, 0, 1);
  const cases = [
    { p: [-1364.18, 448.63, 8.97], q: [0.3767, 0.5837, -0.6044, -0.39], s: [1, 1, 1] },
    { p: [10, 20, 30], q: [0, 0, 0.7071068, 0.7071068], s: [2.13, 0.86, 0.07] },
    { p: [0, 0, 0], q: [0, 0, 0, 1], s: [0.52, 0.52, 0.52] },
  ];
  for (const c of cases) {
    const q = new THREE.Quaternion(...c.q).normalize();
    const game = new THREE.Matrix4().compose(new THREE.Vector3(...c.p), q, new THREE.Vector3(...c.s));
    const expected = C.clone().multiply(game).multiply(C.clone().invert()).toArray();
    const got = wv.transformToGltf(c.p, c.q, c.s);
    got.forEach((v, i) => assert.ok(closeTo(v, expected[i]), `element ${i}: ${v} against ${expected[i]}`));
  }
  assert.deepEqual(wv.toGltf([1, 2, 3]), [1, 3, -2]);
  assert.deepEqual(wv.toGame(wv.toGltf([1, 2, 3])), [1, 2, 3]);
  assert.deepEqual(wv.boxToGltf({ min: [0, 1, 2], max: [3, 4, 5] }), { min: [0, 2, -4], max: [3, 5, -1] });
});

await check("world view: a sector's items become one batch per mesh, a placement per copy, and markers", () => {
  const S = "base\\worlds\\x.streamingsector";
  const t = (x) => ({ position: [x, 0, 0], rotation: [0, 0, 0, 1], scale: [1, 1, 1] });
  const items = [
    { index: 3, node: 1, kind: "worldCookedStaticMeshNode", resource: "base\\a\\Vent.mesh", transform: t(1), streaming: { primary: 22 } },
    { index: 4, node: 2, kind: "worldInstancedMeshNode", resource: "base\\a\\vent.mesh", transform: t(0), instances: [t(5), t(6)], streaming: { primary: 30 } },
    { index: 5, node: 3, kind: "worldEntityNode", resource: "base\\gameplay\\junk.ent", transform: t(7), bounds: null },
    { index: 6, node: 4, kind: "worldCookedCollisionNode", resource: null, transform: t(8), bounds: { min: [0, 0, 0], max: [1, 2, 3] } },
    { index: 7, node: 5, kind: "worldCookedStaticDecalNode", resource: "base\\d\\dirt.mi", transform: t(9) },
  ];
  const { meshes, markers } = wv.itemsToBatches(S, items);
  assert.equal(meshes.size, 1, "the same mesh in two spellings is one batch");
  const batch = meshes.get("base\\a\\vent.mesh");
  assert.equal(batch.mesh, "base\\a\\Vent.mesh", "the first spelling is kept");
  assert.deepEqual(batch.placements.map((p) => p.id), [`${S}#3`, `${S}#4.0`, `${S}#4.1`]);
  assert.deepEqual(batch.placements.map((p) => p.range), [22, 30, 30]);
  assert.deepEqual(batch.placements[1].matrix.slice(12, 15), [5, 0, -0], "a copy's own place, in glTF axes");
  assert.deepEqual(markers.map((m) => [m.id.split("#")[1], m.kind]), [["5", "entity"], ["6", "collision"], ["7", "decal"]]);
  assert.deepEqual(markers[1].box, { min: [0, 0, -2], max: [1, 3, -0] });
  assert.equal(wv.itemsToBatches(S, items, ["worldEntityNode"]).meshes.size, 0, "kinds filter the classes");
});

await check("world view: the loader exports each mesh once, cached first, and unloads what leaves the list", async () => {
  const cache = path.join(tmp, "wvcache");
  const calls = [];
  const sectors = {
    "s\\one.streamingsector": [
      { index: 0, node: 0, kind: "worldCookedStaticMeshNode", resource: "m\\shared.mesh", transform: { position: [0, 0, 0], rotation: [0, 0, 0, 1] } },
      { index: 1, node: 1, kind: "worldCookedStaticMeshNode", resource: "m\\cached.mesh", transform: { position: [1, 0, 0], rotation: [0, 0, 0, 1] } },
    ],
    "s\\two.streamingsector": [{ index: 0, node: 0, kind: "worldCookedStaticMeshNode", resource: "m\\shared.mesh", transform: { position: [2, 0, 0], rotation: [0, 0, 0, 1] } }],
  };
  // One mesh is in the cache already.
  const cached = wv.meshGlbPath(cache, "m\\cached.mesh");
  fs.mkdirSync(path.dirname(cached), { recursive: true });
  fs.writeFileSync(cached, "glb");
  const bridge = {
    async request(method, params) {
      calls.push(method);
      if (method === "sector.nodes") return { items: sectors[params.path] };
      if (method === "archive.extract") {
        fs.mkdirSync(path.dirname(params.outFile), { recursive: true });
        fs.writeFileSync(params.outFile, "mesh");
        return {};
      }
      if (method === "project.export") {
        const out = path.join(params.rawDir, path.relative(params.archiveDir, params.file)).replace(/\.mesh$/i, ".glb");
        fs.mkdirSync(path.dirname(out), { recursive: true });
        fs.writeFileSync(out, "glb");
        return { ok: true };
      }
      throw new Error(`unexpected ${method}`);
    },
  };
  const got = [];
  const unloaded = [];
  const loader = wv.createSectorLoader(bridge, { cacheDir: cache, onMesh: (m) => got.push(`${m.sector}|${m.mesh}`), onMarkers: () => undefined, onUnload: (s) => unloaded.push(s) });
  const r = await loader.set(["s\\one.streamingsector", "s\\two.streamingsector"]);
  assert.deepEqual(r.skipped, []);
  assert.equal(got[0], "s\\one.streamingsector|m\\cached.mesh", "the cached mesh is handed over first");
  assert.equal(got.length, 3, "each sector gets its own placements of the shared mesh");
  assert.equal(calls.filter((c) => c === "project.export").length, 1, "the shared mesh is exported once");
  await loader.set(["s\\two.streamingsector"]);
  assert.deepEqual(unloaded, ["s\\one.streamingsector"]);
  assert.equal(calls.filter((c) => c === "sector.nodes").length, 2, "a sector still in the list is not read again");
});

await check("world view: a load cut short by a second one still sends every mesh (sector view, 2026-11-20)", async () => {
  // Two views mounted at once both asked the one loader: the second set found the sector loaded and sent nothing.
  const cache = path.join(tmp, "wvcache2");
  const sector = "s\\three.streamingsector";
  const items = [0, 1, 2].map((i) => ({ index: i, node: i, kind: "worldCookedStaticMeshNode", resource: `m\\part${i}.mesh`, transform: { position: [i, 0, 0], rotation: [0, 0, 0, 1] } }));
  const bridge = {
    async request(method, params) {
      if (method === "sector.nodes") return { items };
      if (method === "archive.extract") {
        fs.mkdirSync(path.dirname(params.outFile), { recursive: true });
        fs.writeFileSync(params.outFile, "mesh");
        return {};
      }
      if (method === "project.export") {
        await new Promise((r) => setTimeout(r, 5));
        const out = path.join(params.rawDir, path.relative(params.archiveDir, params.file)).replace(/\.mesh$/i, ".glb");
        fs.mkdirSync(path.dirname(out), { recursive: true });
        fs.writeFileSync(out, "glb");
        return { ok: true };
      }
      throw new Error(`unexpected ${method}`);
    },
  };
  const got = [];
  const markers = [];
  const loader = wv.createSectorLoader(bridge, { cacheDir: cache, onMesh: (m) => got.push(m.mesh), onMarkers: (s) => markers.push(s), onUnload: () => undefined });
  const first = loader.set([sector]);
  await new Promise((r) => setTimeout(r, 1));
  const second = loader.set([sector]);
  await first;
  await second;
  assert.deepEqual([...new Set(got)].sort(), ["m\\part0.mesh", "m\\part1.mesh", "m\\part2.mesh"], "every mesh reaches the page");
  got.length = 0;
  await loader.set([sector]);
  assert.deepEqual(got, [], "once complete, the same list sends nothing again");
});

// ---- Animations A3: synced sets (docs/design/animation.md) ----

const as = require("../dist/animsSet.js");
const yawQ = (deg) => [0, Math.sin((deg * Math.PI) / 360), 0, Math.cos((deg * Math.PI) / 360)];
const near = (a, b, eps = 1e-4) => Math.abs(a - b) < eps;

await check("synced sets: names, members, alternatives and the opened clip first", () => {
  assert.deepEqual(as.syncedName("synced__q001_00c_trauma_arrives_soldiers__land_v1__av"), { moment: "q001_00c_trauma_arrives_soldiers__land_v1", role: "av" });
  assert.equal(as.syncedName("q001_00c_trauma_av_idle__02"), undefined, "not synced");
  assert.equal(as.syncedName("synced__only"), undefined, "no role");
  const files = [
    { path: "d\\syringe.anims", rig: "syringe.rig", clips: [{ name: "synced__inj__syringe", duration: 16, buffer: "compressed" }, { name: "synced__other__syringe", duration: 2 }] },
    { path: "d\\player_male.anims", rig: "man.rig", clips: [{ name: "synced__inj__fpp", duration: 17, buffer: "simd" }] },
    { path: "d\\player_female.anims", rig: "woman.rig", clips: [{ name: "synced__inj__fpp", duration: 17, buffer: "simd" }] },
    { path: "d\\big.anims", rig: "big.rig", clips: [{ name: "synced__inj__jackie", duration: 6.7 }, { name: "idle", duration: 1 }] },
  ];
  const ms = as.setMembers(files, { file: "D\\SYRINGE.anims", clip: "synced__inj__syringe" });
  assert.deepEqual(ms.map((m) => m.role), ["syringe", "fpp", "fpp", "jackie"], "the opened clip first, then by role");
  assert.equal(ms[0].self, true);
  assert.deepEqual(ms.filter((m) => m.role === "fpp").map((m) => [m.file, m.alternatives, m.active]), [["d\\player_female.anims", 1, false], ["d\\player_male.anims", 1, true]], "the first file of a role shows, the other is its alternative");
  assert.equal(ms.find((m) => m.role === "jackie").buffer, "");
  assert.equal(ms[1].buffer, "simd");
  assert.deepEqual(as.setMembers(files, { file: "d\\syringe.anims", clip: "idle" }), [], "not a synced clip");
  assert.deepEqual(as.setMembers(files, { file: "d\\elsewhere.anims", clip: "synced__inj__syringe" }), [], "the opened clip must be among the files");
});

await check("synced sets: rigid transforms compose, invert and become a column-major matrix", () => {
  const a = { p: [1, 2, 3], q: yawQ(90) };
  const b = { p: [0, 0, 1], q: yawQ(30) };
  const ab = as.mul(a, b);
  // A 90 degree turn about +Y takes +Z to +X.
  assert.ok(near(ab.p[0], 2) && near(ab.p[1], 2) && near(ab.p[2], 3), JSON.stringify(ab.p));
  assert.ok(near(as.angleBetween(ab.q, yawQ(120)), 0, 1e-6));
  const back = as.mul(ab, as.inv(b));
  assert.ok(back.p.every((v, i) => near(v, a.p[i])) && near(as.angleBetween(back.q, a.q), 0, 1e-6));
  const m = as.toMatrix({ p: [5, 6, 7], q: yawQ(90) });
  assert.deepEqual(m.slice(12), [5, 6, 7, 1]);
  assert.ok(near(m[8], 1) && near(m[2], -1), "the third column is where +Z goes: +X");
});

await check("synced sets: a track places its partner, from either side, at the same spot all through", () => {
  // Member 0 walks along +Z, member 1 stands still. Their true placements: 0 at the origin, 1 at (4, 0, -2) turned 45 degrees.
  const W1 = { p: [4, 0, -2], q: yawQ(45) };
  const root0 = (t) => ({ p: [0, 0, t], q: yawQ(10 * t) });
  const root1 = () => ({ p: [0, 0, 0], q: [0, 0, 0, 1] });
  // A track is the partner's Root seen from this member's Root: T_01 = root0^-1 . W1 . root1, and T_10 its inverse.
  const t01 = (t) => as.mul(as.mul(as.inv(root0(t)), W1), root1(t));
  const t10 = (t) => as.inv(t01(t));
  for (const [label, members] of [
    ["the placed member's track", [{ id: 0, duration: 4, root: root0, tracks: [{ name: "syncTrajectory", at: t01 }] }, { id: 1, duration: 4, root: root1, tracks: [] }]],
    ["the other's track, reversed", [{ id: 0, duration: 4, root: root0, tracks: [] }, { id: 1, duration: 4, root: root1, tracks: [{ name: "syncTrajectory", at: t10 }] }]],
  ]) {
    const placed = as.solvePlacements(members, 0);
    const p = placed.get(1);
    assert.ok(p, `${label}: placed`);
    assert.ok(p.placement.p.every((v, i) => near(v, W1.p[i], 1e-3)) && near(as.angleBetween(p.placement.q, W1.q), 0, 1e-3), `${label}: ${JSON.stringify(p.placement)}`);
    assert.ok(p.spread < 1e-3, label);
  }
});

await check("synced sets: members moving in step are told apart by the track from the other side", () => {
  // Members 1 and 2 walk side by side, 1 m apart, 5 m in front of member 0, who stands still. Each has a track to
  // the anchor; the anchor has one track to each, in the order 2, 1.
  const walk = (t) => ({ p: [0, 0, t], q: [0, 0, 0, 1] });
  const still = () => ({ p: [0, 0, 0], q: [0, 0, 0, 1] });
  const W = [{ p: [0, 0, 0], q: [0, 0, 0, 1] }, { p: [0, 0, 5], q: [0, 0, 0, 1] }, { p: [1, 0, 5], q: [0, 0, 0, 1] }];
  const roots = [still, walk, walk];
  const rel = (from, to) => (t) => as.mul(as.mul(as.inv(as.mul(W[from], roots[from](t))), W[to]), roots[to](t));
  const members = [
    { id: 0, duration: 3, root: still, tracks: [{ name: "syncTrajectory", at: rel(0, 2) }, { name: "syncTrajectory1", at: rel(0, 1) }] },
    { id: 1, duration: 3, root: walk, tracks: [{ name: "syncTrajectory", at: rel(1, 0) }, { name: "syncTrajectory1", at: rel(1, 2) }] },
    { id: 2, duration: 3, root: walk, tracks: [{ name: "syncTrajectory", at: rel(2, 0) }, { name: "syncTrajectory1", at: rel(2, 1) }] },
  ];
  const placed = as.solvePlacements(members, 0);
  for (const id of [1, 2]) {
    const p = placed.get(id);
    assert.ok(p && p.placement.p.every((v, i) => near(v, W[id].p[i], 1e-3)), `member ${id} at ${JSON.stringify(p?.placement.p)}, not swapped`);
    assert.equal(p.ambiguous, false, `member ${id} is not ambiguous: a track from its side confirms it`);
  }
});

await check("synced sets: a member no track places stays out, and spline root keys in fractions are stretched to seconds", () => {
  const still = () => ({ p: [0, 0, 0], q: [0, 0, 0, 1] });
  const placed = as.solvePlacements([{ id: 0, duration: 2, root: still, tracks: [] }, { id: 1, duration: 2, root: still, tracks: [] }], 0);
  assert.deepEqual([...placed.keys()], [0]);
  assert.equal(as.solvePlacements([{ id: 1, duration: 2, root: still, tracks: [] }], 0).size, 0, "no anchor, no placements");
  const keys = { times: [0, 0.5, 1], values: [[0], [1], [2]] };
  assert.deepEqual(as.inSeconds(keys, 7.3).times, [0, 3.65, 7.3], "an older export's fractions of a 7.3 s clip");
  assert.equal(as.inSeconds({ times: [0, 3.6, 7.3], values: [[0], [1], [2]] }, 7.3).times[2], 7.3, "seconds stay seconds");
  assert.equal(as.inSeconds({ times: [0, 0.5, 1], values: [[0], [1], [2]] }, 1).times[2], 1, "a one-second clip is left alone");
  const tr = as.track({ times: [0, 2], values: [[0, 0, 0], [2, 0, 0]] }, { times: [0, 2], values: [[0, 0, 0, 1], yawQ(90)] });
  assert.ok(near(tr(1).p[0], 1) && near(as.angleBetween(tr(1).q, yawQ(45)), 0, 1e-6), "keys are interpolated, rotations along the shorter arc");
  assert.ok(near(tr(5).p[0], 2), "past the last key it holds");
});

await check("synced sets: the Root's keys are read from an exported .anims", () => {
  // A tiny GLB: nodes Armature > Root, one animation with Root's translation and rotation, 2 keys each.
  const floats = [0, 1, 0, 0, 0, 3, 0, 0, 0, 0, 0, 1, 0, 0, 0, 1];
  const bin = Buffer.alloc(floats.length * 4);
  floats.forEach((f, i) => bin.writeFloatLE(f, i * 4));
  const json = {
    asset: { version: "2.0" },
    nodes: [{ name: "Armature", children: [1] }, { name: "Root" }],
    accessors: [
      { bufferView: 0, componentType: 5126, count: 2, type: "SCALAR", max: [1] },
      { bufferView: 1, componentType: 5126, count: 2, type: "VEC3" },
      { bufferView: 2, componentType: 5126, count: 2, type: "VEC4" },
    ],
    bufferViews: [{ buffer: 0, byteOffset: 0, byteLength: 8 }, { buffer: 0, byteOffset: 8, byteLength: 24 }, { buffer: 0, byteOffset: 32, byteLength: 32 }],
    buffers: [{ byteLength: bin.length }],
    animations: [{ name: "synced__m__a", samplers: [{ input: 0, output: 1 }, { input: 0, output: 2 }], channels: [{ sampler: 0, target: { node: 1, path: "translation" } }, { sampler: 1, target: { node: 1, path: "rotation" } }] }],
  };
  let text = Buffer.from(JSON.stringify(json));
  text = Buffer.concat([text, Buffer.alloc((4 - (text.length % 4)) % 4, 0x20)]);
  const head = Buffer.alloc(12);
  head.write("glTF", 0, "latin1");
  head.writeUInt32LE(2, 4);
  head.writeUInt32LE(12 + 8 + text.length + 8 + bin.length, 8);
  const jh = Buffer.alloc(8);
  jh.writeUInt32LE(text.length, 0);
  jh.writeUInt32LE(0x4e4f534a, 4);
  const bh = Buffer.alloc(8);
  bh.writeUInt32LE(bin.length, 0);
  bh.writeUInt32LE(0x004e4942, 4);
  const file = write("a3/root.glb", Buffer.concat([head, jh, text, bh, bin]));
  const glb = require("../dist/animsGlb.js").readAnimsGlb(file);
  const k = as.rootKeys(glb, "synced__m__a");
  assert.deepEqual(k.translation.times, [0, 1]);
  assert.deepEqual(k.translation.values, [[0, 0, 0], [3, 0, 0]]);
  assert.deepEqual(k.rotation.values, [[0, 0, 0, 1], [0, 0, 0, 1]]);
  assert.deepEqual(as.rootKeys(glb, "no such clip"), {});
});

await check("new file: every type has what its kind needs, and the presets are complete", () => {
  for (const t of nf.NewFileTypes) {
    if (["atlas", "material", "empty"].includes(t.kind)) assert.ok(t.root, `${t.id} has a root class`);
    if (t.kind === "text") assert.ok(t.folder !== undefined, `${t.id} has a folder`);
    if (t.kind !== "copy") assert.match(t.ext, /^\./, `${t.id} has an extension`);
  }
  assert.deepEqual(nf.TexturePresets.map((p) => p.id), ["color", "normal", "mask", "ui"]);
  for (const p of nf.TexturePresets) for (const k of ["group", "compression", "rawFormat", "isGamma", "hasMipchain", "isStreamable"]) assert.ok(k in p.setup, `${p.id} sets ${k}`);
});

fs.rmSync(tmp, { recursive: true, force: true });
console.log(`${passed} passed${failures.length ? `, ${failures.length} failed` : ""}`);
process.exit(failures.length ? 1 : 0);
