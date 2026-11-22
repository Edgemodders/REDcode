// Probe D (docs/research/animation-authoring.md, section 8): can Uthana alone make a clip on the game's skeleton?
//   node probe.mjs <command> <REDbridge.exe> <game folder> <project folder> [arguments]
// Commands, in order:
//   character            exports the base male body skinned on man_base.rig (the game's bone names and rest
//                        pose) and uploads it to Uthana once, without auto-rig; keeps its id in probe-d.json
//   generate "<prompt>" [seconds] [model]
//                        a text-to-motion job onto that character; downloads the GLB at 30 fps, as is and in place
//   fit [name] [variant] puts the downloaded motion on the game rig's nodes, with WolvenKit's clip extras, and
//                        imports it into probe\anims\probe_d.anims (a new set on man_base.rig) as probe_d__<name>
//                        (variant: inplace, the default, or moving)
//   replace [variant]    the same motion over the game's own clip stand__2h_on_sides__01, in a copy of its set at
//                        the game's path (every other clip of the set kept), so whatever plays that clip plays it
// The Uthana key comes from the shared key store (%APPDATA%\Edgemodders\keys) through REDbridge's keys.get.
// Nothing from the game or from Uthana is kept in this repo: everything goes in the probe project.
import { createRequire } from "node:module";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { uthana, motionIdOf } from "./uthana.mjs";
const req = createRequire(new URL("../../../extensions/redcode/package.json", import.meta.url));
const { BridgeClient, KeyAccess } = req("./dist/bridgeClient.js");
const ag = req("./dist/animsGlb.js");

const [command, exe, game, projectDir, ...rest] = process.argv.slice(2);
if (!command || !exe || !game || !projectDir) {
  console.log('node probe.mjs character|generate|fit <REDbridge.exe> <game folder> <project folder> [arguments]');
  process.exit(1);
}

const RIG = "base\\characters\\base_entities\\man_base\\man_base.rig";
// The idle Probe A played: its clip lends the skeleton's nodes and WolvenKit's extras.
const SET = "base\\animations\\npc\\generic_characters\\male_average\\interactive_scene\\generic_male_average__stand__2h_on_sides__01.anims";
const CLIP = "stand__2h_on_sides__01";
const TARGET = "probe\\anims\\probe_d.anims";
const cache = path.join(os.tmpdir(), "probeD-cache");
const statePath = path.join(projectDir, "probe-d.json");
const downloads = path.join(projectDir, "uthana");

// ---- a tiny GLB reader and writer ----
export const readGlb = (buf) => {
  const len = buf.readUInt32LE(12);
  const json = JSON.parse(buf.subarray(20, 20 + len).toString("utf8"));
  const binAt = 20 + len;
  const bin = buf.length > binAt + 8 ? buf.subarray(binAt + 8, binAt + 8 + buf.readUInt32LE(binAt)) : undefined;
  return { json, bin };
};
export const writeGlb = (json, bin) => {
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
const readAccessor = ({ json, bin }, index) => {
  const A = json.accessors[index];
  const n = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4, MAT4: 16 }[A.type];
  const V = json.bufferViews[A.bufferView];
  const off = (V.byteOffset ?? 0) + (A.byteOffset ?? 0);
  if (A.componentType !== 5126) throw new Error(`accessor ${index}: component type ${A.componentType}, not float`);
  const stride = V.byteStride ?? n * 4;
  return Array.from({ length: A.count }, (_, i) => Array.from({ length: n }, (_, k) => bin.readFloatLE(off + i * stride + k * 4)));
};

const state = () => (fs.existsSync(statePath) ? JSON.parse(fs.readFileSync(statePath, "utf8")) : {});
const save = (s) => fs.writeFileSync(statePath, JSON.stringify(s, null, 2));

function ensureProject() {
  const archiveDir = path.join(projectDir, "source", "archive");
  const rawDir = path.join(projectDir, "source", "raw");
  for (const d of [archiveDir, rawDir, path.join(projectDir, "source", "resources"), path.join(projectDir, "packed"), downloads]) fs.mkdirSync(d, { recursive: true });
  const proj = path.join(projectDir, `${path.basename(projectDir)}.cpmodproj`);
  if (!fs.existsSync(proj)) {
    const name = path.basename(projectDir);
    fs.writeFileSync(proj, `<?xml version="1.0" encoding="utf-8"?>\r\n<CP77Mod xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xmlns:xsd="http://www.w3.org/2001/XMLSchema">\r\n  <Name>${name}</Name>\r\n  <ModName>${name}</ModName>\r\n  <Author></Author>\r\n  <Email />\r\n  <Description />\r\n  <Version>1.0.0</Version>\r\n</CP77Mod>\r\n`);
  }
  return { archiveDir, rawDir };
}

ensureProject();
const b = new BridgeClient({ exe, gamePath: game, keys: true });
b.start();
console.log("bridge", (await b.info()).version);
const client = async () => {
  const k = await b[KeyAccess]("keys.get", { service: "uthana", tool: "anim-probe-d" });
  if (!k?.key) throw new Error("No Uthana key in the shared key store (REDcode's Keys view, service uthana)");
  return uthana(k.key);
};

try {
  if (command === "character") await character();
  else if (command === "generate") await generate(rest[0], Number(rest[1] ?? 5), rest[2]);
  else if (command === "fit") await fit(rest[0] ?? "text", rest[1]);
  else if (command === "replace") await fit(CLIP, rest[0], true);
  else throw new Error(`No command ${command}`);
} catch (e) {
  console.error("FAILED:", e.message);
  process.exitCode = 1;
} finally {
  b.stop();
}
process.exit();

async function character() {
  const s = state();
  const body = await ag.baseBodyGlb(b, cache, ag.baseBodyFor(RIG));
  const bytes = fs.readFileSync(body.glb);
  const g = readGlb(bytes);
  console.log(`stand-in: ${path.basename(body.glb)}, ${(bytes.length / 1e6).toFixed(1)} MB, ${g.json.skins[0].joints.length} joints, ${g.json.meshes.length} meshes`);
  const u = await client();
  await u.check();
  const r = await u.createCharacter("edge_man_base", "edge_man_base.glb", bytes);
  console.log("character:", JSON.stringify(r));
  save({ ...s, character: r.character, uploaded: new Date().toISOString() });
}

async function generate(prompt, length, model) {
  if (!prompt) throw new Error('generate "<prompt>" [seconds] [model]');
  const s = state();
  if (!s.character?.id) throw new Error("Run character first");
  const u = await client();
  const job = await u.textToMotion(prompt, { length, model, characterId: s.character.id });
  console.log("job", job.id, job.status);
  let last = "";
  const done = await u.wait(job.id, { log: (st) => st !== last && console.log("  ", (last = st)) });
  if (done.status !== "FINISHED") throw new Error(`job ${done.status}: ${JSON.stringify(done.result).slice(0, 500)}`);
  const motionId = motionIdOf(done);
  if (!motionId) throw new Error(`no motion id in ${JSON.stringify(done.result).slice(0, 500)}`);
  console.log("motion", motionId);
  const files = {};
  for (const [variant, q] of [["moving", { fps: 30, no_mesh: true }], ["inplace", { fps: 30, no_mesh: true, in_place: true }]]) {
    const bytes = await u.download(s.character.id, motionId, q);
    const f = path.join(downloads, `${motionId}-${variant}.glb`);
    fs.writeFileSync(f, bytes);
    files[variant] = f;
    console.log(`  ${variant}: ${f} (${(bytes.length / 1e3).toFixed(0)} kB)`);
  }
  save({ ...s, motions: [...(s.motions ?? []), { id: motionId, prompt, length, model: model ?? "text-to-motion-3.0", job: job.id, files, at: new Date().toISOString() }] });
}

/**
 * The fitting step: Uthana's keys by bone name onto the nodes of the game's own clip export (so the import sees
 * the rig it knows), its translation on Hips only, WolvenKit's extras from the game clip with the float tracks
 * and fallback frames emptied, then REDbridge's import into a new set on man_base.rig.
 */
async function fit(name, variant = "inplace", replace = false) {
  const s = state();
  const m = s.motions?.at(-1);
  if (!m) throw new Error("Run generate first");
  const src = readGlb(fs.readFileSync(m.files[variant]));
  const sj = src.json;
  console.log(`uthana glb: ${sj.nodes.length} nodes, ${sj.skins?.length ?? 0} skins, ${sj.meshes?.length ?? 0} meshes, ${sj.animations?.length ?? 0} animations`);
  const anim = sj.animations?.[0];
  if (!anim) throw new Error("no animation in Uthana's GLB");

  // The game clip: its nodes and skin are the rig as WolvenKit wrote it.
  const exported = await ag.animsGlbFor(b, cache, { gamePath: SET });
  const full = ag.readAnimsGlb(exported.glb);
  const index = full.json.animations.findIndex((a) => a.name === CLIP);
  const one = readGlb(ag.animsClip(full, index));
  const gj = one.json;
  gj.skins = (full.json.skins ?? []).map((sk) => ({ joints: sk.joints, ...(sk.skeleton !== undefined ? { skeleton: sk.skeleton } : {}) }));
  const gameClip = gj.animations[0];
  const animated = new Set(gameClip.channels.map((c) => gj.nodes[c.target.node].name));
  const gameNode = new Map(gj.nodes.map((n, i) => [n.name, i]));

  // What Uthana kept of the skeleton: names, and rest pose against the game's.
  const quatAngle = (a, b) => (2 * Math.acos(Math.min(1, Math.abs(a[0] * b[0] + a[1] * b[1] + a[2] * b[2] + a[3] * b[3]))) * 180) / Math.PI;
  const unames = sj.nodes.map((n) => n.name);
  const shared = [...animated].filter((n) => unames.includes(n));
  console.log(`bones: the game clip animates ${animated.size}; Uthana's file has ${shared.length} of them by name`);
  console.log(`  not in Uthana's file: ${[...animated].filter((n) => !unames.includes(n)).join(" ") || "none"}`);
  const restDiff = shared
    .map((n) => {
      const u = sj.nodes.find((x) => x.name === n);
      const g = gj.nodes[gameNode.get(n)];
      return [n, quatAngle(u.rotation ?? [0, 0, 0, 1], g.rotation ?? [0, 0, 0, 1])];
    })
    .sort((a, b) => b[1] - a[1]);
  console.log(`  rest pose: largest differences ${restDiff.slice(0, 6).map(([n, d]) => `${n} ${d.toFixed(1)}`).join(", ")} degrees`);
  for (const n of ["Root", "Hips", "Armature"]) {
    const u = sj.nodes.find((x) => x.name === n);
    if (u) console.log(`  uthana ${n}: ${JSON.stringify({ t: u.translation, r: u.rotation, s: u.scale })}`);
  }

  // Uthana's channels, by node name and path.
  const theirs = new Map();
  const byPath = {};
  for (const c of anim.channels) {
    const node = sj.nodes[c.target.node]?.name;
    byPath[c.target.path] = (byPath[c.target.path] ?? 0) + 1;
    if (!node || !animated.has(node)) continue;
    const sampler = anim.samplers[c.sampler];
    theirs.set(`${node}/${c.target.path}`, { node, path: c.target.path, interpolation: sampler.interpolation ?? "LINEAR", times: readAccessor(src, sampler.input).map((v) => v[0]), values: readAccessor(src, sampler.output) });
  }
  if ([...theirs.values()].some((c) => c.interpolation === "CUBICSPLINE")) throw new Error("Uthana's keys are cubic spline; the import takes linear or step");
  // Every channel the game's clip has, as the game wants (run 1 in the game, 2026-11-22: with translation on Hips
  // alone, every other bone collapsed and the body warped, where REDcode's view fell back on the rest pose).
  // Uthana's keys where it has them: rotation on every bone, translation on Root and Hips only; otherwise the
  // game rig's rest value, held on every frame of Uthana's time base.
  const base = theirs.get("Hips/rotation")?.times ?? [...theirs.values()][0].times;
  const channels = [];
  let fromRest = 0;
  for (const gc of gameClip.channels) {
    const node = gj.nodes[gc.target.node];
    const p = gc.target.path;
    const keep = theirs.get(`${node.name}/${p}`);
    if (keep && (p === "rotation" || (p === "translation" && (node.name === "Hips" || node.name === "Root")))) {
      channels.push(keep);
      continue;
    }
    const rest = p === "rotation" ? node.rotation ?? [0, 0, 0, 1] : p === "translation" ? node.translation ?? [0, 0, 0] : node.scale ?? [1, 1, 1];
    channels.push({ node: node.name, path: p, interpolation: "LINEAR", times: base, values: base.map(() => rest) });
    fromRest++;
  }
  console.log(`  uthana channels: ${JSON.stringify(byPath)}; written ${channels.length} as the game clip has them, ${channels.length - fromRest} from Uthana, ${fromRest} held at the rest pose`);

  // A new binary: the game clip's nodes need none of their own (the skin's joints list is kept without its
  // inverse bind matrices, as Probe A did), so only the new keys go in.
  const parts = [];
  let length = 0;
  const accessors = [];
  const views = [];
  const put = (rows, type) => {
    const n = rows[0].length;
    const buf = Buffer.alloc(rows.length * n * 4);
    rows.forEach((r, i) => r.forEach((v, k) => buf.writeFloatLE(v, (i * n + k) * 4)));
    views.push({ buffer: 0, byteOffset: length, byteLength: buf.length });
    parts.push(buf);
    length += buf.length;
    const acc = { bufferView: views.length - 1, componentType: 5126, count: rows.length, type };
    if (type === "SCALAR") {
      acc.min = [Math.min(...rows.map((r) => r[0]))];
      acc.max = [Math.max(...rows.map((r) => r[0]))];
    }
    accessors.push(acc);
    return accessors.length - 1;
  };
  const samplers = [];
  const outChannels = [];
  for (const c of channels) {
    const input = put(c.times.map((t) => [t - base[0]]), "SCALAR");
    const output = put(c.values, c.path === "rotation" ? "VEC4" : "VEC3");
    samplers.push({ input, output, interpolation: c.interpolation });
    outChannels.push({ sampler: samplers.length - 1, target: { node: gameNode.get(c.node), path: c.path } });
  }
  const duration = Math.max(...channels.map((c) => c.times.at(-1) - base[0]));
  const extras = JSON.parse(JSON.stringify(gameClip.extras));
  // The rig's 13 float tracks: the game idle's values, each held constant from the start (its one keyed track is
  // constant too), since a set's numTracks stays 13 whether or not a clip keys them. Fallback frames are the game
  // clip's own; a new clip has none (REDbridge clears them too since Probe A).
  const constant = new Map();
  for (const k of [...(extras.trackKeys ?? []), ...(extras.constTrackKeys ?? [])]) constant.set(k.trackIndex, k.value);
  extras.constTrackKeys = [...constant].sort((a, b) => a[0] - b[0]).map(([trackIndex, value]) => ({ trackIndex, time: 0, value }));
  extras.trackKeys = [];
  extras.fallbackFrameIndices = [];
  extras.animEvents = null;
  const clipName = replace ? CLIP : `probe_d__${name}`;
  const setPath = replace ? SET : TARGET;
  const out = {
    ...gj,
    accessors,
    bufferViews: views,
    buffers: [{ byteLength: length }],
    animations: [{ name: clipName, channels: outChannels, samplers, extras }],
  };
  const { archiveDir, rawDir } = ensureProject();
  const rawGlb = path.join(rawDir, setPath + ".glb");
  fs.mkdirSync(path.dirname(rawGlb), { recursive: true });
  // Clips already in the set stay (keep), so each fit adds or updates one clip.
  const exists = fs.existsSync(path.join(archiveDir, setPath));
  fs.writeFileSync(rawGlb, writeGlb(out, Buffer.concat(parts)));
  console.log(`fitted: ${clipName}, ${duration.toFixed(2)} s, ${outChannels.length} channels -> ${rawGlb}`);
  // A replacement starts from the game's set (template); a new clip from an empty set on the rig.
  const r = await b.request("project.import", { file: rawGlb, rawDir, archiveDir, keep: exists, template: exists || !replace ? null : SET, rig: exists || replace ? null : RIG });
  console.log("import:", r.ok, JSON.stringify(r.anims ? { from: r.anims.from, added: r.anims.added, updated: r.anims.updated, skipped: r.anims.skipped, notes: r.anims.notes } : r).slice(0, 1200));
  // Read back: the set's clips (anims.info reads game paths only), then the clip exported again, measured.
  const target = path.join(archiveDir, setPath);
  const doc = (await b.request("cr2w.open", { file: target })).doc;
  try {
    const root = await b.request("cr2w.getNode", { doc, path: "" });
    const count = root.children.find((c) => c.name === "animations").count;
    console.log(`  the set has ${count} clip(s)`);
    for (let i = 0; i < count; i++) {
      const p = `animations.${i}.Data.animation.Data`;
      const nv = (await b.request("cr2w.getNode", { doc, path: `${p}.name` })).value;
      const nm = nv?.$value ?? nv;
      if (nm !== clipName) continue;
      const buf = await b.request("cr2w.getNode", { doc, path: `${p}.animBuffer.Data` });
      const v = (k) => buf.children.find((c) => c.name === k)?.value;
      console.log(`  set clip ${nm}: ${Number(v("duration")).toFixed(2)} s, ${v("numFrames")} frames, ${v("numJoints")} joints, ${v("numTracks")} tracks (${v("numConstTrackKeys")} const keys), fallback frames ${buf.children.find((c) => c.name === "fallbackFrameIndices")?.count}`);
    }
  } finally {
    await b.request("cr2w.close", { doc });
  }
  const back = path.join(os.tmpdir(), "probeD-back");
  fs.rmSync(back, { recursive: true, force: true });
  await b.request("project.export", { file: target, archiveDir, rawDir: back, options: null });
  const backGlb = fs.readdirSync(back, { recursive: true }).map((f) => path.join(back, String(f))).find((f) => f.endsWith(".glb"));
  const bk = readGlb(fs.readFileSync(backGlb));
  const ba = bk.json.animations.find((a) => a.name === clipName);
  // The channels as the game will read them: every bone needs its translation (a bone's length), not just a turn.
  const kinds = {};
  for (const c of ba.channels) kinds[c.target.path] = (kinds[c.target.path] ?? 0) + 1;
  const missingT = [...animated].filter((n) => !ba.channels.some((c) => c.target.path === "translation" && bk.json.nodes[c.target.node].name === n));
  console.log(`  read back: ${JSON.stringify(kinds)}; bones without translation keys: ${missingT.join(" ") || "none"}`);
  let worst = ["", 0];
  for (const c of ba.channels.filter((x) => x.target.path === "translation")) {
    const n = bk.json.nodes[c.target.node];
    const v = readAccessor(bk, ba.samplers[c.sampler].output);
    const r = gj.nodes[gameNode.get(n.name)]?.translation ?? [0, 0, 0];
    const len = (x) => Math.hypot(...x);
    const d = n.name === "Hips" || n.name === "Root" ? 0 : Math.max(...v.map((x) => Math.abs(len(x) - len(r))));
    if (d > worst[1]) worst = [n.name, d];
  }
  console.log(`  bone lengths: the largest change from the rig is ${(worst[1] * 100).toFixed(2)} cm${worst[0] ? ` (${worst[0]})` : ""}`);
  for (const bone of ["RightArm", "RightForeArm", "RightHand", "LeftArm", "Spine2", "Head"]) {
    const ni = bk.json.nodes.findIndex((n) => n.name === bone);
    const ch = ba.channels.find((c) => c.target.node === ni && c.target.path === "rotation");
    if (!ch) {
      console.log(`  ${bone}: no rotation keys`);
      continue;
    }
    const q = readAccessor(bk, ba.samplers[ch.sampler].output);
    const t = readAccessor(bk, ba.samplers[ch.sampler].input).map((x) => x[0]);
    let most = 0;
    let when = 0;
    q.forEach((x, i) => {
      const d = quatAngle(x, q[0]);
      if (d > most) [most, when] = [d, t[i]];
    });
    console.log(`  ${bone}: ${q.length} keys, turns up to ${most.toFixed(0)} degrees from its first pose (at ${when.toFixed(2)} s)`);
  }
  save({ ...s, clips: { ...(s.clips ?? {}), [clipName]: { motion: m.id, variant, prompt: m.prompt } } });
}
