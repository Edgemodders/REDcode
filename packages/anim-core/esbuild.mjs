// Builds the package for Node, as ESM and CommonJS. It has no dependencies.
import * as esbuild from "esbuild";
import * as fs from "node:fs";

// npm wants the licence beside the package; the repository keeps one at its root.
fs.copyFileSync("../../LICENSE", "LICENSE");

const common = { entryPoints: ["src/index.ts"], bundle: true, sourcemap: true, logLevel: "info", platform: "node", target: "node18" };
await Promise.all([
  esbuild.build({ ...common, outfile: "dist/index.mjs", format: "esm" }),
  esbuild.build({ ...common, outfile: "dist/index.cjs", format: "cjs" }),
]);
