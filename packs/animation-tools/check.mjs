// The Animation Tools pack's check on the PC (AT3, REDcode's docs/design/animation-tools.md): the built mod.mjs run
// outside the game, with a stand-in rednode module (ui, world, archives, kernel, secrets, pkg) over the real
// REDbridge, and a fake Uthana over fetch that serves a motion already on the game's skeleton (Probe D's), so
// Generate runs the whole chain (stand-in, job, download, fit, import, pack, swap, workspot, play) without a paid
// job. Nothing it writes is kept: a scratch project under the temp folder.
//   node packs/animation-tools/build.mjs
//   node packs/animation-tools/check.mjs dist/packs/animation-tools/apps/animation-tools/mod.mjs <REDbridge.exe> <game folder> <a motion .glb on man_base>
import { createRequire } from "node:module";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { pathToFileURL } from "node:url";

const [modFile, exe, game, motionFile] = process.argv.slice(2);
const root = fs.mkdtempSync(path.join(os.tmpdir(), "animtools-harness-"));
const req = createRequire(new URL("../../extensions/redcode/package.json", import.meta.url));
const { BridgeClient } = req("./dist/bridgeClient.js");

// A REDcode project the pack finds through a stand-in project.json.
const local = path.join(root, "LocalAppData");
const projectDir = path.join(root, "HarnessProject");
fs.mkdirSync(path.join(projectDir, "source", "archive"), { recursive: true });
fs.writeFileSync(path.join(projectDir, "HarnessProject.cpmodproj"), '<?xml version="1.0" encoding="utf-8"?>\r\n<CP77Mod><Name>HarnessProject</Name><ModName>HarnessProject</ModName></CP77Mod>\r\n');
fs.mkdirSync(path.join(local, "REDcode"), { recursive: true });
fs.writeFileSync(path.join(local, "REDcode", "project.json"), JSON.stringify({ pid: 1, updated: new Date().toISOString(), project: { name: "HarnessProject", dir: projectDir } }));

// The fake Uthana.
const calls = [];
const realFetch = globalThis.fetch;
globalThis.fetch = async (url, init = {}) => {
  const u = String(url);
  if (!u.startsWith("https://uthana.com")) return realFetch(url, init);
  const json = (data) => new Response(JSON.stringify({ data }), { status: 200, headers: { "content-type": "application/json" } });
  if (u.endsWith("/graphql")) {
    const body = typeof init.body === "string" ? init.body : "multipart";
    if (body === "multipart" || body.includes("create_character")) {
      calls.push("create_character");
      return json({ create_character: { character: { id: "fakechar01", name: "edge_man_base" }, auto_rig_confidence: 0 } });
    }
    if (body.includes("create_text_to_motion_job")) {
      calls.push(`text_to_motion ${JSON.parse(body).query.match(/length: (\d+)/)?.[1]}s`);
      return json({ create_text_to_motion_job: { job: { id: "fakejob01", status: "READY" } } });
    }
    if (body.includes("job(job_id")) {
      calls.push("job");
      return json({ job: { id: "fakejob01", status: "FINISHED", result: { result: { id: "fakemotion01" } } } });
    }
    return json({ __typename: "Query" });
  }
  if (u.includes("/motion/file/motion_viewer/")) {
    calls.push(`download ${new URL(u).searchParams.toString()}`);
    return new Response(fs.readFileSync(motionFile), { status: 200 });
  }
  return new Response("not found", { status: 404 });
};

// The stand-in rednode module.
const b = new BridgeClient({ exe, gamePath: game, keys: true });
b.start();
await b.info();
process.env.LOCALAPPDATA = local;
const events = [];
let windowSpec;
// The world as REDnode keeps it: each spawn's options and whether it is in its workspot.
const live = new Map();
let nextId = 1;
const respawnHandlers = [];
const respawnAs = (id, changes = {}) => {
  const e = live.get(id);
  live.delete(id);
  const after = `npc${nextId++}`;
  live.set(after, { options: { ...e.options, ...changes }, inWorkspot: false });
  events.push(`spawned again: ${id} is now ${after}`);
  for (const h of respawnHandlers) h(id, after);
  return after;
};
const writeWorkspotAnswer = (name, o) => (events.push(`writeWorkspot ${name} rig ${o.rig.split("\\").pop()}: ${o.clips.map((c) => `${c.name}@${c.set}`).join(" ")}`), { path: `rednode\\workspots\\animation-tools\\${name}.workspot`, entries: o.clips.map((c, i) => ({ name: c.name, entry: i })) });
const node = (kind, props) => ({ kind, ...props, set(p) { Object.assign(this, p); } });
globalThis.__rednode = {
  api: { GetPlayer: async () => ({ GetWorldPosition: async () => ({ X: 10, Y: 20, Z: 5 }), GetWorldForward: async () => ({ X: 0, Y: 1, Z: 0 }) }) },
  game: { instance: {} },
  pkg: { dataDir: path.join(root, "data"), dir: root },
  kernel: { bridge: async () => ({ call: (m, p) => b.request(m, p) }) },
  secrets: { askShared: async (service) => (events.push(`askShared ${service}`), "fake-uthana-key") },
  archives: { reload: async (files) => (events.push(`reload ${files.map((f) => path.basename(f)).join(",")}`), { reloaded: files, failed: [], ms: 5 }) },
  world: {
    spawn: async (o) => {
      const id = `npc${nextId++}`;
      live.set(id, { options: { ...o }, inWorkspot: false });
      events.push(`spawn ${id} ${o.record} at ${o.position.x.toFixed(1)},${o.position.y.toFixed(1)} yaw ${o.yaw.toFixed(0)}${o.workspot ? ` with ${o.workspot}` : ""}`);
      return { id };
    },
    remove: async (id) => (events.push(`remove ${id}`), live.delete(id)),
    // The ground in front of V is 30 cm lower than V (a slope): a spawn at V's height comes to stand on it.
    entity: async (id) => (live.has(id) ? { GetWorldPosition: async () => ({ X: live.get(id).options.position.x, Y: live.get(id).options.position.y, Z: Math.min(live.get(id).options.position.z, 4.7) }) } : null),
    // A swap of a workspot a spawn carries spawns it again with a new id a little later, as REDnode's refresh does.
    writeWorkspot: async (name, o) => {
      const written = writeWorkspotAnswer(name, o);
      const users = [...live].filter(([, e]) => e.options.workspot === written.path).map(([id]) => id);
      setTimeout(() => users.forEach((id) => live.has(id) && respawnAs(id)), 300);
      return { ...written, swap: { reloaded: [], failed: [], ms: 5, world: users.map((entity) => ({ entity, how: "respawn" })) } };
    },
    useWorkspot: async (id, o) => {
      if (!live.has(id)) throw new Error("world.useWorkspot plays on a person this package spawned with world.spawn");
      const now = o.workspot && o.workspot !== live.get(id).options.workspot ? respawnAs(id, { workspot: o.workspot }) : id;
      live.get(now).inWorkspot = true;
      events.push(`useWorkspot ${now} ${o.workspot?.split("\\").pop()} entry ${o.entry}`);
      return { id: now, started: true };
    },
    jumpWorkspot: async (id, to) => {
      const ok = !!live.get(id)?.inWorkspot;
      events.push(`jumpWorkspot ${id} ${to}${ok ? "" : " (not in a workspot: false)"}`);
      return ok;
    },
    stopWorkspot: async (id) => (events.push(`stopWorkspot ${id}`), live.get(id) && (live.get(id).inWorkspot = false), true),
    onRespawn: (h) => (respawnHandlers.push(h), () => {}),
  },
  ui: {
    text: (text, o) => node("text", { text, ...o }),
    heading: (text) => node("heading", { text }),
    button: (label, onClick, o) => node("button", { label, onClick, ...o }),
    toggle: (label, onChange, o) => node("toggle", { label, onChange, ...o }),
    input: (o) => node("input", o),
    select: (label, options, o) => node("select", { label, options, ...o }),
    progress: (value, o) => node("progress", { value, ...o }),
    list: (o) => node("list", { lines: [], ...o, push(...l) { this.lines.push(...l); }, clear() { this.lines = []; } }),
    row: (...children) => node("row", { children }),
    column: (...children) => node("column", { children }),
    window: (spec) => (windowSpec = spec, node("window", spec)),
  },
};
const modules = path.join(root, "node_modules", "rednode");
fs.mkdirSync(modules, { recursive: true });
fs.writeFileSync(path.join(modules, "package.json"), JSON.stringify({ name: "rednode", type: "module", main: "index.mjs" }));
fs.writeFileSync(path.join(modules, "index.mjs"), "const r = globalThis.__rednode; export const { api, archives, game, kernel, pkg, secrets, ui, world } = r;\n");
fs.copyFileSync(modFile, path.join(root, "mod.mjs"));
await import(pathToFileURL(path.join(root, "mod.mjs")).href);

const all = [];
const flat = (n) => { if (!n) return; all.push(n); for (const c of n.children ?? []) flat(c); };
windowSpec.children.forEach(flat);
const find = (kind, test) => all.find((n) => n.kind === kind && test(n));
const button = (label) => find("button", (n) => n.label === label || n.label.startsWith(label));
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const settle = async () => { for (let i = 0; i < 600; i++) { await wait(100); if (!busyNow()) return; } };
const statusNode = find("text", (n) => /Pick a character|Looking|Clips go/.test(n.text) && n.text.startsWith("Pick"));
const busyNow = () => /…$/.test(statusNode.text) && !/Pick it and Play/.test(statusNode.text);
const logNode = all.find((n) => n.kind === "list");
/** Presses a button and waits for its step's line in the log. */
const seen = { labels: new Set(), disabled: false, tips: new Set() };
const press = async (label, stepName = label) => {
  const before = logNode.lines.length;
  const b = button(label);
  b.onClick();
  for (let i = 0; i < 1200; i++) {
    await wait(100);
    seen.labels.add(b.label);
    if (b.disabled) seen.disabled = true;
    if (b.tip) seen.tips.add(b.tip);
    if (logNode.lines.slice(before).some((l) => l.includes(`${stepName}:`) || l.includes(`${stepName} failed`))) return;
  }
  throw new Error(`${label} never finished`);
};
await wait(300);
const projectNode = all.find((n) => n.kind === "text" && /Clips go into/.test(n.text));
console.log("project line:", projectNode?.text);
console.log("generate button:", button("Generate").label);

// 1. Spawn the medic, with no clips yet.
await press("Spawn");
// 2. Generate: the words, then the button; the fake Uthana answers.
find("input", (n) => n.label === "What it shows").onChange("a man stands relaxed, raises his right hand and waves hello");
await press("Generate");
console.log("status after generate:", statusNode.text);
const clipPick = find("select", (n) => n.label === "Clip");
console.log("clips:", JSON.stringify(clipPick.options), "picked", clipPick.value);
// 3. Generate a second with the same words: a new name.
await press("Generate");
console.log("while generating: disabled", seen.disabled, "tip", JSON.stringify([...seen.tips]), "then", JSON.stringify(button("Generate").tip ?? ""), "labels", [...seen.labels].slice(0, 8).join(" | "), "then", button("Generate").label, button("Generate").disabled ? "(still disabled)" : "(enabled)");
const progressNode = all.find((n) => n.kind === "progress");
console.log("progress at the end:", progressNode.value, "of", progressNode.max, progressNode.label);
console.log("clips now:", clipPick.options.map((o) => o.value).join(", "));
// 4. Play the first, then Stop; then the woman's rig has none.
clipPick.onChange(clipPick.options[clipPick.options.length - 1].value);
await press("Play");
// Then the newest (a jump in the same workspot), Stop, and the first again (the workspot started anew).
clipPick.onChange(clipPick.options[0].value);
await press("Play");
await press("Stop");
clipPick.onChange(clipPick.options[clipPick.options.length - 1].value);
await press("Play");
await press("Stop");
const failed = logNode.lines.filter((l) => / failed/.test(l));
console.log(failed.length ? `FAILED steps:\n  ${failed.join("\n  ")}` : "no step failed");
find("select", (n) => n.label === "Character").onChange("Character.LightCrowd_corpoplaza_wa");
await wait(50);
console.log("woman's clips:", JSON.stringify(clipPick.options), clipPick.placeholder);

console.log("\nevents:\n  " + events.join("\n  "));
console.log("\nuthana calls:", calls.join(" | "));
console.log("\nlog:\n  " + logNode.lines.join("\n  "));
const made = fs.readdirSync(path.join(projectDir, "source", "raw"), { recursive: true }).map(String).filter((f) => /edgefab\.json$|\.anims\.glb$/.test(f));
console.log("\nrecords and sets:", made.join(" | "));
console.log("packed:", fs.readdirSync(path.join(projectDir, "packed"), { recursive: true }).map(String).filter((f) => f.endsWith(".archive")).join(", "));
b.stop();
process.exit(0);
