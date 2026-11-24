// A2F spike, step 6: each line's Audio2Face results as versions the Lip Sync tab offers beside the game's clip
// (the lip sync cache, versions\<clip name>\<version>.json), one a model the line was run through
// (a2f_<model>\animation_frames.csv, made by run-model.ps1). Usage: node 03-versions.cjs <lines folder> [out folder]
const core = require("../../../packages/lipsync-core/scripts/bridge.cjs");
const fs = require("fs");
const path = require("path");
const root = process.argv[2];
const out = process.argv[3] ?? path.join(core.lipsyncCacheDir(), "versions");
// Audio2Face's amounts are for its own faces: full strength was "too extreme" on the head (owner, 2026-11-21).
// These bring each pose near what the game's clips reach (measured on 95 lines: jaw about 0.45, purse 0.28,
// funnel 0.17, lower lip in 0.32, upper lip raise 0.06). Rounding is kept stronger than the first try, which
// lost it on "you" and "go".
const tuned = { gain: 0.65, gains: { lips_l_purse: 0.6, lips_r_purse: 0.6, lips_l_funnel: 0.6, lips_r_funnel: 0.6, lips_l_upper_raise: 0.35, lips_r_upper_raise: 0.35, lips_apart_dn: 0.5, tongue_mid_base_back: 0.5 } };
// The newest first: the tab lists versions by name.
const names = { multi: "Audio2Face 1, newest model", claire: "Audio2Face 2, Claire", james: "Audio2Face 3, James" };
function readCsv(file) {
  const [head, ...rows] = fs.readFileSync(file, "utf8").trim().split(/\r?\n/);
  const cols = head.split(",");
  const time = cols.indexOf("timeCode");
  return rows.map((r) => {
    const v = r.split(",");
    const shapes = {};
    cols.forEach((c, i) => { if (c.startsWith("blendShapes.")) shapes[c.slice(12)] = Number(v[i]); });
    return { time: Number(v[time]), shapes };
  });
}
for (const dir of fs.readdirSync(root).sort()) {
  const d = path.join(root, dir);
  if (!fs.existsSync(path.join(d, "line.json"))) continue;
  const line = JSON.parse(fs.readFileSync(path.join(d, "line.json"), "utf8"));
  const to = path.join(out, line.clip);
  fs.rmSync(to, { recursive: true, force: true });
  fs.mkdirSync(to, { recursive: true });
  const made = [];
  for (const [model, name] of Object.entries(names)) {
    const csv = path.join(d, `a2f_${model}`, "animation_frames.csv");
    if (!fs.existsSync(csv)) continue;
    const clip = core.arkitClip(readCsv(csv), { name: line.clip, seconds: line.seconds, ...tuned });
    fs.writeFileSync(path.join(to, `${name}.json`), JSON.stringify(clip));
    made.push(`${model} (jaw ${clip.tracks.find((t) => t.name.startsWith("jaw_mid_open"))?.max.toFixed(2)}, purse ${clip.tracks.find((t) => t.name.startsWith("lips_l_purse"))?.max.toFixed(2) ?? "none"})`);
  }
  console.log(`${dir}  ${line.clip}  "${line.text.slice(0, 44)}"  ${made.join(", ")}`);
}
