// A2F spike: the models compared on the points the owner watches. For each line and each model's CSV
// (a2f_<model>\animation_frames.csv): how round the lips get where the game rounds them, how closed where the
// game closes them, and how the jaw follows. Usage: node 04-models.cjs <lines folder>
const core = require("e:/Modding/Cyberpunk 2077/EDGEfab/extensions/edgefab/dist/core.js");
const fs = require("fs");
const path = require("path");
const root = process.argv[2];
const corr = (a, b) => { const n = a.length; let ma = 0, mb = 0; for (let i = 0; i < n; i++) { ma += a[i]; mb += b[i]; } ma /= n; mb /= n; let x = 0, da = 0, db = 0; for (let i = 0; i < n; i++) { x += (a[i] - ma) * (b[i] - mb); da += (a[i] - ma) ** 2; db += (b[i] - mb) ** 2; } return x / Math.sqrt(da * db || 1); };
const total = {};
for (const dir of fs.readdirSync(root).sort()) {
  const d = path.join(root, dir);
  if (!fs.existsSync(path.join(d, "clip.json"))) continue;
  const game = JSON.parse(fs.readFileSync(path.join(d, "clip.json"), "utf8"));
  const g = (pose, t) => { const k = game.tracks.find((x) => x.name === `${pose}LipsyncPoseOutput`); return k ? core.sampleTrack(k, t) : 0; };
  console.log(`\n${dir}: "${JSON.parse(fs.readFileSync(path.join(d, "line.json"), "utf8")).text.slice(0, 60)}"`);
  for (const model of fs.readdirSync(d).filter((f) => f.startsWith("a2f_") && fs.existsSync(path.join(d, f, "animation_frames.csv"))).sort()) {
    const [h, ...rows] = fs.readFileSync(path.join(d, model, "animation_frames.csv"), "utf8").trim().split(/\r?\n/);
    const c = h.split(",");
    const ix = (k) => c.indexOf("blendShapes." + k);
    const F = rows.map((r) => r.split(",").map(Number));
    const t = F.map((v) => v[1]);
    const round = F.map((v) => v[ix("MouthPucker")] + v[ix("MouthFunnel")]);
    const gRound = t.map((x) => g("lips_l_purse", x) + g("lips_l_funnel", x));
    const closed = F.map((v) => Math.min(1, v[ix("MouthClose")] / Math.max(v[ix("JawOpen")], 0.08)) * Math.min(1, Math.max(0, (v[ix("MouthClose")] - 0.02) / 0.06)));
    const gClosed = t.map((x) => g("lips_together_up", x));
    const jaw = F.map((v) => v[ix("JawOpen")]);
    const gJaw = t.map((x) => g("jaw_mid_open", x));
    // Where the game is at its roundest, and where it closes: what the model has there.
    const at = (mask, values) => { let s = 0, n = 0; mask.forEach((m, i) => { if (m) { s += values[i]; n++; } }); return n ? s / n : 0; };
    const roundMask = gRound.map((v) => v > 0.15);
    const closeMask = gClosed.map((v) => v > 0.7);
    const row = { roundR: corr(round, gRound), roundAt: at(roundMask, round), closeR: corr(closed, gClosed), closeAt: at(closeMask, closed), jawAtClose: at(closeMask, jaw), jawR: corr(jaw, gJaw), jawPeak: Math.max(...jaw), puckerPeak: Math.max(...F.map((v) => v[ix("MouthPucker")])) };
    (total[model] ??= []).push(row);
    console.log(`  ${model.padEnd(11)} round: r ${row.roundR.toFixed(2)}, has ${row.roundAt.toFixed(2)} where the game rounds (the game ${at(roundMask, gRound).toFixed(2)}) | closed lips: r ${row.closeR.toFixed(2)}, ${row.closeAt.toFixed(2)} where the game closes, jaw ${row.jawAtClose.toFixed(2)} there | jaw r ${row.jawR.toFixed(2)}, peak ${row.jawPeak.toFixed(2)} | pucker peak ${row.puckerPeak.toFixed(2)}`);
  }
}
console.log("\nAverages over the lines:");
for (const [model, rows] of Object.entries(total)) {
  const avg = (k) => (rows.reduce((s, r) => s + r[k], 0) / rows.length).toFixed(2);
  console.log(`  ${model.padEnd(11)} round r ${avg("roundR")}, amount where the game rounds ${avg("roundAt")} | closed r ${avg("closeR")}, amount where the game closes ${avg("closeAt")}, jaw there ${avg("jawAtClose")} | jaw r ${avg("jawR")}`);
}
