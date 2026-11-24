// A2F spike, step 3: a few of a character's game lines, their voice exported for Audio2Face and their own
// lip sync clip kept beside it. Output: scratchpad/a2f/lines/<n>/{line.json, clip.json, voice.*}. Game data: stays here.
const core = require("e:/Modding/Cyberpunk 2077/EDGEfab/extensions/edgefab/dist/core.js");
const fs = require("fs");
const path = require("path");
process.env.EDGEFAB_DATA = path.join(__dirname, "data");
const who = process.argv[2] ?? "panam";
const want = Number(process.argv[3] ?? 4);
(async () => {
  const { client, call } = await core.startBridge(() => undefined);
  try {
    const lines = await core.lipsyncLines(call, { character: who, limit: 8 });
    const picked = [];
    for (const sc of lines.scenes) for (const l of sc.lines) if (l.audio && l.text && l.seconds >= 2.5 && l.seconds <= 7 && picked.length < want && !picked.some((p) => p.l.text === l.text)) picked.push({ sc, l });
    for (const [n, { sc, l }] of picked.entries()) {
      const dir = path.join(__dirname, "lines", `${who}_${n + 1}`);
      fs.mkdirSync(dir, { recursive: true });
      const archiveDir = path.join(dir, "archive");
      const rawDir = path.join(dir, "raw");
      const file = path.join(archiveDir, l.audio);
      await call("archive.extract", { path: l.audio, outFile: file });
      const r = await call("project.export", { file, archiveDir, rawDir, options: {} });
      const clip = await core.lipsyncClip(call, { set: sc.set, clip: l.clip });
      fs.writeFileSync(path.join(dir, "line.json"), JSON.stringify({ character: who, text: l.text, seconds: l.seconds, clip: l.clip, set: sc.set, audio: l.audio, exported: r.written }, null, 1));
      fs.writeFileSync(path.join(dir, "clip.json"), JSON.stringify(clip));
      console.log(`${who}_${n + 1}  ${l.seconds.toFixed(2)} s  "${l.text}"  ->  ${(r.written ?? []).join(", ")}  (rig ${clip.rig?.split("\\").slice(-2, -1)[0]})`);
    }
  } finally {
    client.stop();
  }
})().catch((e) => { console.error(e); process.exit(1); });
