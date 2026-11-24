// A2F spike, steps 4 to 5: Audio2Face's CSV for each exported line, beside the game's own clip for the same line.
// Prints how its shapes move, how well its jaw follows the game's jaw (and at what lag and scale), and writes
// a2f.json (the captured shapes as a lip sync clip) next to each line.
const core = require("../../../packages/lipsync-core/scripts/bridge.cjs");
const fs = require("fs");
const path = require("path");
const root = path.join(__dirname, "lines");
const opts = JSON.parse(process.argv[2] ?? "{}");

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
const sample = (track, t) => (track ? core.sampleTrack(track, t) : 0);
function corr(a, b) {
  const n = Math.min(a.length, b.length);
  let sa = 0, sb = 0;
  for (let i = 0; i < n; i++) { sa += a[i]; sb += b[i]; }
  const ma = sa / n, mb = sb / n;
  let num = 0, da = 0, db = 0;
  for (let i = 0; i < n; i++) { num += (a[i] - ma) * (b[i] - mb); da += (a[i] - ma) ** 2; db += (b[i] - mb) ** 2; }
  return da && db ? num / Math.sqrt(da * db) : 0;
}

for (const dir of fs.readdirSync(root).sort()) {
  const d = path.join(root, dir);
  const csv = path.join(d, "output_000001", "animation_frames.csv");
  if (!fs.existsSync(csv)) continue;
  const line = JSON.parse(fs.readFileSync(path.join(d, "line.json"), "utf8"));
  const game = JSON.parse(fs.readFileSync(path.join(d, "clip.json"), "utf8"));
  const frames = readCsv(csv);
  const fps = (frames.length - 1) / (frames.at(-1).time - frames[0].time);
  console.log(`\n== ${dir}: "${line.text}" (${line.seconds} s) : ${frames.length} frames, ${fps.toFixed(1)} a second, first at ${frames[0].time}`);
  const peak = {};
  for (const f of frames) for (const [k, v] of Object.entries(f.shapes)) peak[k] = Math.max(peak[k] ?? 0, v);
  console.log("  shapes that move:", Object.entries(peak).filter(([, v]) => v > 0.03).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k} ${v.toFixed(2)}`).join(", "));
  // The jaw: Audio2Face's JawOpen against the game's jaw track, at lags from -150 to +150 ms.
  const gj = game.tracks.find((t) => t.name === "jaw_mid_openLipsyncPoseOutput");
  const times = frames.map((f) => f.time);
  const aj = frames.map((f) => f.shapes.JawOpen ?? 0);
  let best = { lag: 0, r: -2 };
  for (let lag = -0.15; lag <= 0.1501; lag += 1 / 60) {
    const g = times.map((t) => sample(gj, t - lag));
    const r = corr(aj, g);
    if (r > best.r) best = { lag, r };
  }
  const gAt = times.map((t) => sample(gj, t - best.lag));
  const scale = Math.max(...gAt) / (Math.max(...aj) || 1);
  console.log(`  jaw: follows the game's with r ${best.r.toFixed(2)} when the game's is ${Math.round(best.lag * 1000)} ms ${best.lag > 0 ? "earlier" : "later"}; peaks: Audio2Face ${Math.max(...aj).toFixed(2)}, the game ${Math.max(...gAt).toFixed(2)} (scale ${scale.toFixed(2)})`);
  // Lips together: the game's against Audio2Face's MouthClose over the jaw.
  const gt = game.tracks.find((t) => t.name === "lips_together_upLipsyncPoseOutput");
  const closes = times.map((t) => sample(gt, t));
  const ac = frames.map((f) => Math.max(0, (f.shapes.MouthClose ?? 0) - (f.shapes.JawOpen ?? 0) * 0.5));
  console.log(`  lips together: the game peaks ${Math.max(...closes).toFixed(2)} (${closes.filter((v) => v > 0.5).length} frames over 0.5); MouthClose over the jaw peaks ${Math.max(...ac).toFixed(2)}, raw MouthClose ${peak.MouthClose?.toFixed(2)}; r ${corr(ac, closes).toFixed(2)}`);
  for (const [a, g] of [["MouthFunnel", "lips_l_funnel"], ["MouthPucker", "lips_l_purse"], ["MouthStretchLeft", "lips_l_stretch"], ["MouthSmileLeft", "lips_l_corner_up"], ["MouthRollLower", "lips_suck_dn"], ["MouthUpperUpLeft", "lips_l_upper_raise"], ["MouthLowerDownLeft", "lips_apart_dn"], ["MouthDimpleLeft", "lips_l_pull"]]) {
    const gtk = game.tracks.find((t) => t.name === `${g}LipsyncPoseOutput`);
    const gv = times.map((t) => sample(gtk, t - best.lag));
    const av = frames.map((f) => f.shapes[a] ?? 0);
    console.log(`    ${a.padEnd(20)} peak ${Math.max(...av).toFixed(2)}  |  ${g.padEnd(20)} peak ${Math.max(...gv).toFixed(2)}  r ${corr(av, gv).toFixed(2)}`);
  }
  const clip = core.arkitClip(frames, { name: `${dir}_a2f`, seconds: line.seconds, ...opts });
  fs.writeFileSync(path.join(d, "a2f.json"), JSON.stringify(clip));
  console.log(`  wrote a2f.json: ${clip.tracks.length} tracks; ${clip.tracks.sort((x, y) => y.max - x.max).slice(0, 8).map((t) => t.name.replace("LipsyncPoseOutput", "") + " " + t.max.toFixed(2)).join(", ")}`);
}
