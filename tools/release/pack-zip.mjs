// Builds a REDnode app pack's zip from packs/<pack> (Animation Tools), the way EDGEbuilder's and REDnode's
// tools/release/pack-zip.mjs build theirs: a small REDnode app shipped beside REDcode, with a version, a
// changelog and a Nexus page of its own.
//
//   node tools/release/pack-zip.mjs [pack]            animation-tools by default
//   node tools/release/pack-zip.mjs [pack] --draft    without the changelog checks, for a test build
//
// It runs the pack's own build.mjs first (the app's mod.mjs bundled with anim-core), then zips the built apps.
// Output: dist/<Pack-Name>-<version>.zip, laid out like the game folder, so Vortex, EDGEdeck or a player
// extracting it by hand puts it in the same place:
//   red4ext/plugins/REDnode/apps/<app>/              each app of the pack, off until the player switches it on
//   red4ext/plugins/REDnode/apps/<app>/LICENSE.txt
//
// packs/<pack>/pack.json names the pack, its version, its apps and the REDnode it needs; each app's manifest
// asks for that REDnode in "requires", so the Mod Manager says so when REDnode is too old. A release needs a
// changelog section for the version and nothing left under Unreleased.
import { spawnSync } from "node:child_process";
import { cpSync, existsSync, mkdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const repo = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const args = process.argv.slice(2);
const draft = args.includes("--draft");
const id = args.find((a) => !a.startsWith("--")) ?? "animation-tools";
const packDir = join(repo, "packs", id);
if (!existsSync(join(packDir, "pack.json"))) throw new Error(`No pack at packs/${id} (pack.json missing)`);
const pack = JSON.parse(readFileSync(join(packDir, "pack.json"), "utf8"));

for (const app of pack.apps) {
  const file = join(packDir, "apps", app, "rednode-app.json");
  if (!existsSync(file)) throw new Error(`${pack.name}: app ${app} has no rednode-app.json`);
  const m = JSON.parse(readFileSync(file, "utf8"));
  if (m.id !== app) throw new Error(`${file}: its id is ${m.id}, the pack lists ${app}`);
  if (m.version !== pack.version) throw new Error(`${file}: version ${m.version}, pack.json says ${pack.version}. Raise both`);
  if (m.requires?.rednode !== pack.rednode) throw new Error(`${file}: "requires" must ask for "rednode": "${pack.rednode}", as pack.json does`);
}

if (!draft) {
  const changelog = readFileSync(join(packDir, "changelog.md"), "utf8");
  if (!new RegExp(`^## ${pack.version.replace(/\./g, "\\.")} \\(`, "m").test(changelog)) {
    throw new Error(`packs/${id}/changelog.md has no "## ${pack.version} (<date>)" section. Rename Unreleased first, or pass --draft for a test build`);
  }
  const unreleased = changelog.match(/^## Unreleased\s*$([\s\S]*?)(?=^## |(?![\s\S]))/m);
  if (unreleased && unreleased[1].trim()) throw new Error(`packs/${id}/changelog.md has changes under Unreleased. Raise "version" and rename Unreleased first`);
}

// The pack's own build: dist/packs/<id>/apps/<app>/ with the bundled mod.mjs and its manifest.
const built = spawnSync(process.execPath, [join(packDir, "build.mjs")], { cwd: repo, stdio: "inherit" });
if (built.status !== 0) throw new Error(`packs/${id}/build.mjs failed`);

const out = join(repo, "dist");
const stage = join(out, `stage-${id}`);
const target = join(stage, "red4ext", "plugins", "REDnode", "apps");
const zip = join(out, `${pack.name.replace(/\s+/g, "")}-${pack.version}${draft ? "-draft" : ""}.zip`);
rmSync(stage, { recursive: true, force: true });
rmSync(zip, { force: true });
mkdirSync(target, { recursive: true });
for (const app of pack.apps) {
  const to = join(target, app);
  cpSync(join(out, "packs", id, "apps", app), to, { recursive: true });
  const m = JSON.parse(readFileSync(join(to, "rednode-app.json"), "utf8"));
  m.open = false;
  writeFileSync(join(to, "rednode-app.json"), JSON.stringify(m, null, 2) + "\n");
  cpSync(join(repo, "LICENSE"), join(to, "LICENSE.txt"));
}

// Windows' own tar writes zip files (-a picks the format from the name), as EDGEbuilder's does.
const tar = join(process.env.SystemRoot ?? "C:\\Windows", "System32", "tar.exe");
const packed = spawnSync(tar, ["-a", "-c", "-f", zip, "red4ext"], { cwd: stage, stdio: "inherit" });
if (packed.status !== 0) throw new Error("Zipping failed");
rmSync(stage, { recursive: true, force: true });
console.log(`${zip}: ${(statSync(zip).size / 1024).toFixed(0)} KB, ${pack.name} ${pack.version}, needs REDnode ${pack.rednode}`);
