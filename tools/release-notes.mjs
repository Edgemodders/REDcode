// Prints the release notes for one version of one of this repo's packages, from its CHANGELOG.md
// section. The release workflow uses it for the GitHub release, and stops before releasing anything
// when the version has no section. The same convention as every Edgemodders repo (REDnode's
// tools/release/notes.mjs).
//
//   node tools/release-notes.mjs <folder> [version] [--nexus] [--out <file>]
//     <folder>   extensions/redcode, extensions/rednode-hud-theme, packages/redcode-mcp, or a REDnode app
//                pack such as packs/animation-tools (its pack.json and changelog.md)
//     version    defaults to the folder's package.json (a pack's pack.json) version
//     --nexus    the section's short Nexus summary (below), for Nexus's changelog field (the Nexus
//                tool's release --notes, EDGErepo's tools/nexus/nexus.mjs); stops when there is none
//     --out      writes the notes to a file (UTF-8)
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../", import.meta.url));
const args = process.argv.slice(2);
const nexus = args.includes("--nexus");
if (nexus) args.splice(args.indexOf("--nexus"), 1);
const outAt = args.indexOf("--out");
const out = outAt >= 0 ? args.splice(outAt, 2)[1] : null;
const [folder, given] = args;
if (!folder) {
  console.error("usage: node tools/release-notes.mjs <folder> [version] [--nexus] [--out <file>]");
  process.exit(2);
}
const dir = folder.replace(/\\/g, "/").replace(/\/$/, "");
// A REDnode app pack keeps its version in pack.json and its changelog in changelog.md, as REDnode's packs do.
const isPack = dir.startsWith("packs/");
const version = given ?? JSON.parse(readFileSync(join(root, folder, isPack ? "pack.json" : "package.json"), "utf8")).version;
const file = `${dir}/${isPack ? "changelog.md" : "CHANGELOG.md"}`;
const lines = readFileSync(join(root, file), "utf8").split(/\r?\n/);

// "## 0.10.3" or "## 0.10.3 (2026-10-21)"
const heading = new RegExp(`^## ${version.replace(/\./g, "\\.")}(\\s|$)`);
const start = lines.findIndex((line) => heading.test(line));
if (start < 0) {
  console.error(`${file} has no section for ${version}: rename Unreleased to "## ${version} (date)" first`);
  process.exit(1);
}
let end = lines.findIndex((line, i) => i > start && line.startsWith("## "));
if (end < 0) end = lines.length;
const section = lines.slice(start + 1, end);

// The section for GitHub and the stores: without its Nexus summary.
const github = [];
for (let i = 0, inBlock = false; i < section.length; i++) {
  if (!inBlock && section[i].trim() === "<!-- nexus") inBlock = true;
  else if (inBlock && section[i].trim() === "-->") inBlock = false;
  else if (!inBlock) github.push(section[i]);
}
// The block's place leaves two blank lines; one is enough.
const text = github.join("\n").replace(/\n{3,}/g, "\n\n").trim();
if (!text) {
  console.error(`${file}: the section for ${version} is empty`);
  process.exit(1);
}

let notes = text;
if (nexus) {
  // Nexus shows each line of a version's changelog as one entry, as plain text in a small field, and
  // its API cannot change a changelog once posted (REDcode issue #30). So its lines are a short
  // summary written by hand under the section's heading, not the section itself:
  //
  //   <!-- nexus
  //   New: New File in the Project view: textures, ink atlases, material instances and more
  //   Fixed: Run Game's exe route no longer stops REDnode's overlay
  //   -->
  //
  // An HTML comment, so GitHub, the stores and the docs site show none of it. The rules are
  // EDGErepo's ("Nexus changelogs" in its README): each line starts with New:, Changed:, Fixed:,
  // Removed:, Other: or Needs:, has no markdown and at most NEXUS_LINE characters; at most NEXUS_LINES
  // lines, and a "Full changelog" line with the link is added at the end.
  const NEXUS_LINE = 120;
  const NEXUS_LINES = 12;
  const open = section.findIndex((line) => line.trim() === "<!-- nexus");
  const close = open < 0 ? -1 : section.findIndex((line, i) => i > open && line.trim() === "-->");
  if (open < 0 || close < 0) {
    console.error(`${file}: the section for ${version} has no Nexus summary. Add one under its heading:

<!-- nexus
New: one short line per change, at most ${NEXUS_LINE} characters
-->`);
    process.exit(1);
  }
  const summary = section.slice(open + 1, close).map((line) => line.trim()).filter(Boolean);
  const wrong = [];
  if (!summary.length) wrong.push("it is empty");
  if (summary.length > NEXUS_LINES) wrong.push(`${summary.length} lines, at most ${NEXUS_LINES}`);
  for (const line of summary) {
    if (!/^(New|Changed|Fixed|Removed|Other|Needs): \S/.test(line)) wrong.push(`"${line}" does not start with New:, Changed:, Fixed:, Removed:, Other: or Needs:`);
    if (line.length > NEXUS_LINE) wrong.push(`"${line.slice(0, 50)}..." is ${line.length} characters, at most ${NEXUS_LINE}`);
    if (/`|\*\*|\]\(|^#|^- /.test(line)) wrong.push(`"${line.slice(0, 50)}..." has markdown`);
  }
  if (wrong.length) {
    console.error(`${file}: the Nexus summary for ${version}:\n- ${wrong.join("\n- ")}`);
    process.exit(1);
  }
  const page = { "extensions/redcode": "changelog.html", "packages/redcode-mcp": "mcp-changelog.html" }[dir];
  const full = page ? `https://edgemodders.github.io/REDcode/${page}` : `https://github.com/Edgemodders/REDcode/blob/main/${file}`;
  notes = [...summary, `Full changelog: ${full}`].join("\n");
}

if (out) writeFileSync(out, notes + "\n", "utf8");
else console.log(notes);
