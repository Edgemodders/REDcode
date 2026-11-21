// Probe A (docs/research/animation-authoring.md, section 8): the round trip of one game clip, offline.
//   node prepare.mjs <REDbridge.exe> <game folder> <blender.exe> <project folder>
// 1. Exports the generic idle set, takes the clip stand__2h_on_sides__01 alone (with its skin).
// 2. "same": that clip, renamed probe_a__same, imported unchanged into probe\anims\probe_a.anims (a new set on man_base.rig).
// 3. "arm": the clip through Blender (left arm raised 70 degrees), renamed probe_a__arm, imported into the same set.
// 4. Reads the set back, exports it again and measures the left arm against the game's clip.
// Nothing from the game is kept outside the probe project and the cache; nothing is committed.
import { createRequire } from "node:module";
import { spawnSync } from "node:child_process";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
const req = createRequire(new URL("../../../extensions/redcode/package.json", import.meta.url));
const { BridgeClient } = req("./dist/bridgeClient.js");
const ag = req("./dist/animsGlb.js");
const [exe, game, blender, projectDir] = process.argv.slice(2);
const here = path.dirname(new URL(import.meta.url).pathname.replace(/^\/(\w:)/, "$1"));

const SET = "base\\animations\\npc\\generic_characters\\male_average\\interactive_scene\\generic_male_average__stand__2h_on_sides__01.anims";
const CLIP = "stand__2h_on_sides__01";
const RIG = "base\\characters\\base_entities\\man_base\\man_base.rig";
const TARGET = "probe\\anims\\probe_a.anims";

// ---- a tiny GLB reader and writer ----
const readGlb = (buf) => {
  const len = buf.readUInt32LE(12);
  const json = JSON.parse(buf.subarray(20, 20 + len).toString("utf8"));
  const binAt = 20 + len;
  const bin = buf.length > binAt + 8 ? buf.subarray(binAt + 8, binAt + 8 + buf.readUInt32LE(binAt)) : undefined;
  return { json, bin };
};
const writeGlb = (json, bin) => {
  const text = Buffer.from(JSON.stringify(json), "utf8");
  const jl = Math.ceil(text.length / 4) * 4;
  const bl = bin ? Math.ceil(bin.length / 4) * 4 : 0;
  const out = Buffer.alloc(12 + 8 + jl + (bin ? 8 + bl : 0));
  out.writeUInt32LE(0x46546c67, 0);
  out.writeUInt32LE(2, 4);
  out.writeUInt32LE(out.length, 8);
  out.writeUInt32LE(jl, 12);
  out.writeUInt32LE(0x4e4f534a, 16);
  text.copy(out, 20);
  out.fill(0x20, 20 + text.length, 20 + jl);
  if (bin) {
    out.writeUInt32LE(bl, 20 + jl);
    out.writeUInt32LE(0x004e4942, 24 + jl);
    bin.copy(out, 28 + jl);
  }
  return out;
};
/** The left arm's rotation keys of a clip: [time, x, y, z, w] at a few times. */
const armKeys = (glb, name) => {
  const { json, bin } = glb;
  const a = json.animations.find((x) => x.name === name) ?? json.animations[0];
  const node = json.nodes.findIndex((n) => n.name === "LeftArm");
  const ch = a.channels.find((c) => c.target.node === node && c.target.path === "rotation");
  if (!ch) return null;
  const s = a.samplers[ch.sampler];
  const read = (acc, n) => {
    const A = json.accessors[acc];
    const V = json.bufferViews[A.bufferView];
    const off = (V.byteOffset ?? 0) + (A.byteOffset ?? 0);
    const stride = V.byteStride ?? n * 4;
    return Array.from({ length: A.count }, (_, i) => Array.from({ length: n }, (_, k) => bin.readFloatLE(off + i * stride + k * 4)));
  };
  const t = read(s.input, 1).map((v) => v[0]);
  const q = read(s.output, 4);
  // The key nearest a time, for comparing two clips at the same moment.
  const at = (time) => { let best = 0; for (let i = 1; i < t.length; i++) if (Math.abs(t[i] - time) < Math.abs(t[best] - time)) best = i; return [t[best], ...q[best]]; };
  return { count: t.length, first: [t[0], ...q[0]], mid: [t[t.length >> 1], ...q[t.length >> 1]], at };
};
const angle = (a, b) => {
  // degrees between two quaternions [x,y,z,w]
  const d = Math.abs(a[0] * b[0] + a[1] * b[1] + a[2] * b[2] + a[3] * b[3]);
  return (2 * Math.acos(Math.min(1, d)) * 180) / Math.PI;
};

// ---- the probe project ----
const archiveDir = path.join(projectDir, "source", "archive");
const rawDir = path.join(projectDir, "source", "raw");
fs.mkdirSync(archiveDir, { recursive: true });
fs.mkdirSync(rawDir, { recursive: true });
fs.mkdirSync(path.join(projectDir, "source", "resources"), { recursive: true });
fs.mkdirSync(path.join(projectDir, "packed"), { recursive: true });
const proj = path.join(projectDir, `${path.basename(projectDir)}.cpmodproj`);
if (!fs.existsSync(proj)) {
  const name = path.basename(projectDir);
  fs.writeFileSync(proj, `<?xml version="1.0" encoding="utf-8"?>\r\n<CP77Mod xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xmlns:xsd="http://www.w3.org/2001/XMLSchema">\r\n  <Name>${name}</Name>\r\n  <ModName>${name}</ModName>\r\n  <Author></Author>\r\n  <Email />\r\n  <Description />\r\n  <Version>1.0.0</Version>\r\n</CP77Mod>\r\n`);
}

const b = new BridgeClient({ exe, gamePath: game });
b.start();
console.log("bridge", (await b.info()).version);

// 1. The clip alone, with its skin so Blender makes an armature.
const cache = path.join(os.tmpdir(), "probeA-cache");
const exported = await ag.animsGlbFor(b, cache, { gamePath: SET });
const full = ag.readAnimsGlb(exported.glb);
const index = full.json.animations.findIndex((a) => a.name === CLIP);
if (index < 0) throw new Error(`no ${CLIP}`);
const one = readGlb(ag.animsClip(full, index));
// The bone list only, as animsSkeleton keeps it: the inverse bind matrices' accessor is not in this file.
one.json.skins = (full.json.skins ?? []).map((s) => ({ joints: s.joints, ...(s.skeleton !== undefined ? { skeleton: s.skeleton } : {}) }));
const gameKeys = armKeys(one, CLIP);
console.log("game clip:", CLIP, "LeftArm keys", gameKeys?.count, "extras", one.json.animations[0].extras?.schema?.type);

const rawGlb = path.join(rawDir, TARGET + ".glb");
fs.mkdirSync(path.dirname(rawGlb), { recursive: true });
const importIt = async (keep) => {
  const r = await b.request("project.import", { file: rawGlb, rawDir, archiveDir, keep, template: null, rig: keep ? null : RIG });
  return r;
};

// 2. same: renamed, imported as a new set on the rig.
const same = JSON.parse(JSON.stringify(one.json));
same.animations[0].name = "probe_a__same";
fs.writeFileSync(rawGlb, writeGlb(same, one.bin));
const r1 = await importIt(false);
console.log("import same:", r1.ok, JSON.stringify(r1.anims ?? r1).slice(0, 500));

// 3. arm: through Blender.
const blendIn = path.join(os.tmpdir(), "probeA-in.glb");
const blendOut = path.join(os.tmpdir(), "probeA-out.glb");
fs.writeFileSync(blendIn, writeGlb(same, one.bin));
const run = spawnSync(blender, ["-b", "--python", path.join(here, "arm.py"), "--", blendIn, blendOut], { encoding: "utf8", timeout: 300000 });
for (const line of (run.stdout + run.stderr).split(/\r?\n/)) if (/^PROBE|Error|Traceback/.test(line)) console.log("  blender |", line);
const fromBlender = readGlb(fs.readFileSync(blendOut));
const ba = fromBlender.json.animations?.[0];
console.log("blender's export:", fromBlender.json.animations?.length, "animation(s);", "extras kept:", ba?.extras?.schema?.type ?? "NO", "; name", ba?.name);
const keptExtras = !!ba?.extras?.schema;
// The fit step REDcode would do: WolvenKit's extras back from the clip that went in, the name set.
const fitted = JSON.parse(JSON.stringify(fromBlender.json));
fitted.animations = [{ ...fitted.animations[0], name: "probe_a__arm", extras: keptExtras ? fitted.animations[0].extras : same.animations[0].extras }];
fs.writeFileSync(rawGlb, writeGlb(fitted, fromBlender.bin));
const r2 = await importIt(true);
console.log("import arm:", r2.ok, JSON.stringify(r2.anims ?? r2).slice(0, 500));

// 4. Read back.
const target = path.join(archiveDir, TARGET);
const info = (await b.request("anims.info", { files: [target] })).items[0];
console.log("written set:", info.rig, info.clips.map((c) => `${c.name} ${c.duration.toFixed(2)}s ${c.frames}f ${c.buffer}`).join(" | "));
const back = path.join(os.tmpdir(), "probeA-back");
fs.rmSync(back, { recursive: true, force: true });
const e = await b.request("project.export", { file: target, archiveDir, rawDir: back, options: null }).catch((x) => ({ error: x.message }));
const backGlb = fs.readdirSync(back, { recursive: true }).map((f) => path.join(back, String(f))).find((f) => f.endsWith(".glb"));
if (backGlb) {
  const g = ag.readAnimsGlb(backGlb);
  const g2 = { json: g.json, bin: fs.readFileSync(backGlb).subarray(g.binOffset) };
  for (const name of ["probe_a__same", "probe_a__arm"]) {
    const k = armKeys(g2, name);
    if (!k || !gameKeys) { console.log(name, "no LeftArm keys"); continue; }
    const m = k.at(gameKeys.mid[0]);
    console.log(`${name}: LeftArm ${k.count} keys; at the start ${angle(k.first.slice(1), gameKeys.first.slice(1)).toFixed(1)} degrees from the game's clip; at ${gameKeys.mid[0].toFixed(2)} s (nearest key ${m[0].toFixed(2)} s) ${angle(m.slice(1), gameKeys.mid.slice(1)).toFixed(1)} degrees`);
  }
} else console.log("export back failed", JSON.stringify(e).slice(0, 300));
b.stop();
console.log("project:", projectDir);
process.exit(0);
