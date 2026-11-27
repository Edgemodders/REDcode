// Bundles the extension (CommonJS, VS Code's module loader) and the bridge client on its own
// (for the smoke test and other Node tools). `node esbuild.mjs --watch` rebuilds on change.
import * as esbuild from "esbuild";
import * as fs from "node:fs";
import { createRequire } from "node:module";
import * as path from "node:path";

const require = createRequire(import.meta.url);

const watch = process.argv.includes("--watch");

const extension = {
  entryPoints: ["src/extension.ts"],
  outfile: "dist/extension.js",
  bundle: true,
  platform: "node",
  format: "cjs",
  target: "node18",
  external: ["vscode"],
  sourcemap: true,
  logLevel: "info",
};

const client = {
  entryPoints: ["src/bridgeClient.ts"],
  outfile: "dist/bridgeClient.js",
  bundle: true,
  platform: "node",
  format: "cjs",
  target: "node18",
  sourcemap: true,
  logLevel: "info",
};

// The hot swap logic on its own, for scripts/unit.mjs.
const hotSwap = { ...client, entryPoints: ["src/hotSwap.ts"], outfile: "dist/hotSwap.js" };
// The export cache's game stamp on its own, for scripts/unit.mjs.
const exportCache = { ...client, entryPoints: ["src/exportCache.ts"], outfile: "dist/exportCache.js" };
// Add to Library's item on its own, for scripts/unit.mjs and scripts/smoke.mjs.
const library = { ...client, entryPoints: ["src/library.ts"], outfile: "dist/library.js" };
// The key store's calls (REDcode issue #33), for scripts/unit.mjs.
const keysStore = { ...client, entryPoints: ["src/keys.ts"], outfile: "dist/keys.js" };
const opens = { ...client, entryPoints: ["src/opens.ts"], outfile: "dist/opens.js" };
// Values REDbridge cannot walk into, as nodes (the CR2W editor), for scripts/unit.mjs.
const cr2wValues = { ...client, entryPoints: ["src/cr2wValues.ts"], outfile: "dist/cr2wValues.js" };
// The sector view's Properties tab, for scripts/unit.mjs.
const sectorProps = { ...client, entryPoints: ["src/sectorProps.ts"], outfile: "dist/sectorProps.js" };
// The clip index's search, for scripts/unit.mjs.
const clipIndex = { ...client, entryPoints: ["src/clipIndex.ts"], outfile: "dist/clipIndex.js" };
// For the unit checks and the smoke test too.
const animsGlb ={ ...client, entryPoints: ["src/animsGlb.ts"], outfile: "dist/animsGlb.js" };
// Run game's launch, for scripts/unit.mjs.
const install = { ...client, entryPoints: ["src/install.ts"], outfile: "dist/install.js" };
// New File's types, names and roots, for scripts/unit.mjs.
const newFile = { ...client, entryPoints: ["src/newFile.ts"], outfile: "dist/newFile.js" };
// Synced sets: the members of a moment and where each stands, for scripts/unit.mjs.
const animsSet = { ...client, entryPoints: ["src/animsSet.ts"], outfile: "dist/animsSet.js" };
// The state files the redcode REDnode package reads (issues #18 and #32), for scripts/unit.mjs.
const gameDisplay = { ...client, entryPoints: ["src/gameDisplay.ts"], outfile: "dist/gameDisplay.js" };
// Start, stop and status of the game for the MCP server, for scripts/unit.mjs.
const gameRun = { ...client, entryPoints: ["src/gameRun.ts"], outfile: "dist/gameRun.js" };
const rednodeService = { ...client, entryPoints: ["src/rednodeService.ts"], outfile: "dist/rednodeService.js" };
// Open Sector Here's choice of sector, for scripts/unit.mjs.
const sectorHere = { ...client, entryPoints: ["src/sectorHere.ts"], outfile: "dist/sectorHere.js" };
// Sector scripts (docs/design/sector-scripts.md): the process a script runs in, and the list and run for unit checks.
const scriptRunner = { ...client, entryPoints: ["src/scriptRunner.ts"], outfile: "dist/scriptRunner.js" };
const sectorScripts = { ...client, entryPoints: ["src/sectorScripts.ts"], outfile: "dist/sectorScripts.js" };
const sectorNodesBuild = { ...client, entryPoints: ["src/sectorNodes.ts"], outfile: "dist/sectorNodes.js" };
// The world view's host half (packages/world-view), for scripts/unit.mjs and harnesses.
const worldViewHost = { ...client, entryPoints: ["../../packages/world-view/src/host.ts"], outfile: "dist/worldViewHost.js" };

// The 3D mesh viewer for the webviews, three.js included, as one browser script.
const meshViewer = {
  entryPoints: ["webview/meshViewer.ts"],
  outfile: "media/mesh/viewer.js",
  bundle: true,
  platform: "browser",
  format: "iife",
  target: "es2022",
  minify: true,
  legalComments: "linked",
  logLevel: "info",
};

// The Lip Sync tab's head (docs/design/lipsync.md): three.js and lipsync-core's face solver for the tab's page.
const lipsyncHead = { ...meshViewer, entryPoints: ["webview/lipsyncHead.ts"], outfile: "media/lipsync/head.js" };

// three.js is MIT: its licence text ships beside the bundle that contains it.
fs.mkdirSync("media/mesh", { recursive: true });
// three's exports hide its package.json; its main entry sits in <package>/build/.
fs.copyFileSync(path.join(path.dirname(require.resolve("three")), "..", "LICENSE"), "media/mesh/three.LICENSE.txt");

const builds = [extension, client, hotSwap, exportCache, library, keysStore, opens, cr2wValues, sectorProps, clipIndex, animsGlb, install, newFile, animsSet, rednodeService, sectorHere, gameDisplay, gameRun, worldViewHost, scriptRunner, sectorScripts, sectorNodesBuild, meshViewer, lipsyncHead];
if (watch) {
  const contexts = await Promise.all(builds.map((b) => esbuild.context(b)));
  await Promise.all(contexts.map((c) => c.watch()));
} else {
  await Promise.all(builds.map((b) => esbuild.build(b)));
}
