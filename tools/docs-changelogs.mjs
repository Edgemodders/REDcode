// Writes the docs site's changelog pages from the packages' CHANGELOG.md files, so the site shows the
// same text as the stores and the releases. Run by the Pages workflow before Jekyll; the pages it
// writes are not committed (.gitignore).
//
//   node tools/docs-changelogs.mjs
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../", import.meta.url));
const pages = [
  { from: "extensions/redcode/CHANGELOG.md", to: "docs/changelog.md", title: "REDcode changelog", also: "The MCP server has its own: [redcode-mcp changelog](mcp-changelog.html)." },
  { from: "packages/redcode-mcp/CHANGELOG.md", to: "docs/mcp-changelog.md", title: "redcode-mcp changelog", also: "REDcode's own: [REDcode changelog](changelog.html)." },
];

for (const p of pages) {
  const body = readFileSync(join(root, p.from), "utf8").replace(/\r\n/g, "\n").replace(/^# Changelog\n/, "");
  writeFileSync(join(root, p.to), `---\ntitle: ${p.title}\n---\n\n# ${p.title}\n\n${p.also} Source: [${p.from}](https://github.com/Edgemodders/REDcode/blob/main/${p.from}).\n${body}`, "utf8");
  console.log(`${p.to} from ${p.from}`);
}
