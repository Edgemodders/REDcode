// Test of the lip sync reading (docs/lipsync.md, FL1 See) against the game, without VS Code: the characters, one
// character's lines in one scene, and one line's clip as curves. Needs the game and REDbridge 0.14.0 or later
// (found as the MCP server finds them: redcode.* in VS Code's settings, or PATH).
// Usage (after npm run build): npm run lipsync --workspace extensions/edgefab [-- <outFolder>]
// With outFolder it also writes lines.json and clip.json there (game data: keep them out of the repo).
import { createRequire } from "node:module";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";

const require = createRequire(import.meta.url);
process.env.EDGEFAB_DATA ??= fs.mkdtempSync(path.join(os.tmpdir(), "edgefab-lipsync-"));
const core = require("../dist/core.js");
const out = process.argv[2];

const failed = [];
const check = (ok, what) => {
  console.log(`${ok ? "ok  " : "FAIL"} ${what}`);
  if (!ok) failed.push(what);
};
const timed = async (what, run) => {
  const t = Date.now();
  const r = await run();
  console.log(`     ${what}: ${Date.now() - t} ms`);
  return r;
};

const { client, call } = await core.startBridge(() => undefined);
try {
  const info = await call("bridge.info", {});
  console.log(`REDbridge ${info.version}, WolvenKit ${info.wolvenKit}, ${info.files} files`);

  const all = await timed("characters", () => core.lipsyncCharacters(call));
  check(all.length > 500, `${all.length} characters have lip sync in en-us (expected over 500)`);
  console.log(`     most scenes: ${all.slice(0, 5).map((c) => `${c.voiceTag} ${c.scenes}`).join(", ")}`);
  const unnamed = all.filter((c) => c.voiceTag === c.id).length;
  check(unnamed === 0, `every voice tag has a name (${unnamed} without)`);
  check((await core.lipsyncCharacters(call, { find: "judy" })).some((c) => c.voiceTag === "judy"), "find 'judy' finds judy");

  const lines = await timed("lines", () => core.lipsyncLines(call, { character: "angelica_whelan", scene: "mq306_04b_angie_meeting" }));
  const scene = lines.scenes[0];
  check(lines.total === 1 && scene?.scene.endsWith("mq306_04b_angie_meeting.scene"), `Angie's scene resolves by name (${scene?.scene})`);
  check(scene?.lines.length === 9, `her set has 9 lines (${scene?.lines.length})`);
  const first = scene?.lines.find((l) => l.clip === "f_2CE9C077837E0000");
  check(first?.text === "There you are.", `line 2CE9C077837E0000 says "There you are." (${first?.text})`);
  check(first?.lineId === "3236329426782126080", `its string id is 3236329426782126080 (${first?.lineId})`);
  check(/angelica_whelan_mq306_f_2ce9c077837e0000\.wem$/.test(first?.audio ?? ""), `its voice file is found (${first?.audio})`);
  check(scene?.lines.every((l) => l.text && l.audio), "every line has words and a voice file");

  const clip = await timed("clip", () => core.lipsyncClip(call, { set: scene.set, clip: first.clip }));
  const count = (g) => clip.tracks.filter((t) => t.group === g).length;
  console.log(`     ${clip.seconds} s, ${clip.tracks.length} of ${clip.trackCount} tracks move: lipsync ${count("lipsync")}, override ${count("override")}, control ${count("control")}, pose ${count("pose")}; ${clip.held.length} held`);
  check(clip.trackCount === 414, `the head rig has 414 tracks (${clip.trackCount})`);
  check(Math.abs(clip.seconds - first.seconds) < 0.05, `the clip is as long as the line (${clip.seconds} s, ${first.seconds} s)`);
  const jaw = clip.tracks.find((t) => t.name === "jaw_mid_openLipsyncPoseOutput");
  check(!!jaw && jaw.group === "lipsync" && jaw.part === "jaw" && jaw.max > 0.2 && jaw.max <= 1.5, `the jaw opens (highest ${jaw?.max})`);
  check(clip.tracks.some((t) => t.name === "jaliJaw" && t.group === "control") && clip.tracks.some((t) => t.name === "lipSyncEnvelope"), "JALI's jaw control and the lip sync envelope move");
  check(clip.tracks.every((t) => t.keys.length >= 2 && t.keys.length % 2 === 0), "every moving track has keys");
  check(Math.abs(core.sampleTrack(jaw, jaw.keys[2]) - jaw.keys[3]) < 1e-6, "a track samples to its key's value at the key's time");

  const again = await timed("the same clip again", () => core.lipsyncClip(call, { set: scene.set, clip: first.clip }));
  check(again.tracks.length === clip.tracks.length, "a second read gives the same tracks");

  const v = await timed("V's first 3 scenes", () => core.lipsyncLines(call, { character: all[0].id, limit: 3 }));
  check(v.total === all[0].scenes && v.scenes.length === 3, `${all[0].voiceTag}: 3 of ${v.total} scenes a page`);

  let refused = "";
  try {
    await core.lipsyncLines(call, { character: "nobody_by_this_name" });
  } catch (e) {
    refused = e.message;
  }
  check(/No character/.test(refused), `an unknown character is refused in plain words (${refused})`);

  if (out) {
    fs.mkdirSync(out, { recursive: true });
    fs.writeFileSync(path.join(out, "lines.json"), JSON.stringify(lines));
    fs.writeFileSync(path.join(out, "clip.json"), JSON.stringify(clip));
    console.log(`wrote lines.json and clip.json to ${out}`);
  }
} finally {
  client.stop();
}
if (failed.length) {
  console.error(`FAILED: ${failed.length} of the checks`);
  process.exit(1);
}
console.log("ok");
process.exit(0);
