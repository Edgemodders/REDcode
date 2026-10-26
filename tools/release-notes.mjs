// Prints the release notes for one version of one of this repo's packages, from its CHANGELOG.md
// section. The release workflow uses it for the GitHub release, and stops before releasing anything
// when the version has no section. The same convention as every Edgemodders repo (REDnode's
// tools/release/notes.mjs).
//
//   node tools/release-notes.mjs <folder> [version] [--nexus] [--out <file>]
//     <folder>   extensions/redcode, extensions/rednode-hud-theme or packages/redcode-mcp
//     version    defaults to the folder's package.json version
//     --nexus    plain lines for Nexus's changelog field (tools/nexus/nexus.mjs release --notes)
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
const version = given ?? JSON.parse(readFileSync(join(root, folder, "package.json"), "utf8")).version;
const file = `${folder.replace(/\\/g, "/").replace(/\/$/, "")}/CHANGELOG.md`;
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
const section = lines.slice(start + 1, end).join("\n").trim();
if (!section) {
  console.error(`${file}: the section for ${version} is empty`);
  process.exit(1);
}

// Nexus's changelog takes one plain line per change: no markdown, links as "text (url)".
const plain = (text) =>
  text
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, "$1 ($2)")
    .replace(/\*\*([^*]+)\*\*/g, "$1")
    .replace(/`([^`]+)`/g, "$1");
const notes = nexus
  ? section
      .split("\n")
      .filter((line) => line.trim())
      .map((line) => plain(line.startsWith("- ") ? line.slice(2) : line.trim()))
      .join("\n")
  : section;

if (out) writeFileSync(out, notes + "\n", "utf8");
else console.log(notes);
