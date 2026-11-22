// Builds the Animation Tools pack into dist/packs/animation-tools: each app's mod.mjs bundled with anim-core and
// REDcode's pack.ts (rednode stays the host's), and its rednode-app.json beside it.
//   node packs/animation-tools/build.mjs [--install <game folder>]
// --install copies the built apps into the game's red4ext/plugins/REDnode/apps, for a hand test.
import * as esbuild from "esbuild";
import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const repo = path.resolve(here, "../..");
const pack = JSON.parse(fs.readFileSync(path.join(here, "pack.json"), "utf8"));
const out = path.join(repo, "dist", "packs", pack.id);
fs.rmSync(out, { recursive: true, force: true });

for (const app of pack.apps) {
  const manifest = JSON.parse(fs.readFileSync(path.join(here, "apps", app, "rednode-app.json"), "utf8"));
  if (manifest.version !== pack.version) throw new Error(`${app}'s rednode-app.json is ${manifest.version}, pack.json ${pack.version}: raise both together`);
  const dir = path.join(out, "apps", app);
  await esbuild.build({
    entryPoints: [path.join(here, "src", "mod.mjs")],
    outfile: path.join(dir, manifest.main),
    bundle: true,
    platform: "node",
    format: "esm",
    target: "node20",
    external: ["rednode"],
    legalComments: "inline",
    logLevel: "warning",
    banner: { js: `// ${manifest.name} ${manifest.version}, built from REDcode's packs/${pack.id} (MIT). https://github.com/Edgemodders/REDcode` },
  });
  fs.copyFileSync(path.join(here, "apps", app, "rednode-app.json"), path.join(dir, "rednode-app.json"));
  console.log(`built ${path.relative(repo, dir)}`);
}

const at = process.argv.indexOf("--install");
if (at >= 0) {
  const game = process.argv[at + 1];
  const apps = path.join(game ?? "", "red4ext", "plugins", "REDnode", "apps");
  if (!game || !fs.existsSync(apps)) throw new Error(`No REDnode apps folder at ${apps}`);
  for (const app of pack.apps) {
    const to = path.join(apps, app);
    fs.rmSync(to, { recursive: true, force: true });
    fs.cpSync(path.join(out, "apps", app), to, { recursive: true });
    console.log(`installed ${to}`);
  }
}
