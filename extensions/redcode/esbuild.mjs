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
const opens = { ...client, entryPoints: ["src/opens.ts"], outfile: "dist/opens.js" };
// For the unit checks and the smoke test too.
const animsGlb = { ...client, entryPoints: ["src/animsGlb.ts"], outfile: "dist/animsGlb.js" };
// Run game's launch, for scripts/unit.mjs.
const install = { ...client, entryPoints: ["src/install.ts"], outfile: "dist/install.js" };
// New File's types, names and roots, for scripts/unit.mjs.
const newFile = { ...client, entryPoints: ["src/newFile.ts"], outfile: "dist/newFile.js" };
// Synced sets: the members of a moment and where each stands, for scripts/unit.mjs.
const animsSet = { ...client, entryPoints: ["src/animsSet.ts"], outfile: "dist/animsSet.js" };
// The state files the redcode REDnode package reads (issues #18 and #32), for scripts/unit.mjs.
const rednodeService = { ...client, entryPoints: ["src/rednodeService.ts"], outfile: "dist/rednodeService.js" };
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

// three.js is MIT: its licence text ships beside the bundle that contains it.
fs.mkdirSync("media/mesh", { recursive: true });
// three's exports hide its package.json; its main entry sits in <package>/build/.
fs.copyFileSync(path.join(path.dirname(require.resolve("three")), "..", "LICENSE"), "media/mesh/three.LICENSE.txt");

const builds = [extension, client, hotSwap, exportCache, library, opens, animsGlb, install, newFile, animsSet, rednodeService, worldViewHost, meshViewer];
if (watch) {
  const contexts = await Promise.all(builds.map((b) => esbuild.context(b)));
  await Promise.all(contexts.map((c) => c.watch()));
} else {
  await Promise.all(builds.map((b) => esbuild.build(b)));
}
