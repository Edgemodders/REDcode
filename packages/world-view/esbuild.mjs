// Builds the package: the host half for Node (ESM and CommonJS), the page half and the stage as ES modules
// with three left to the page's own bundler (a peer dependency).
import * as esbuild from "esbuild";
import * as fs from "node:fs";

// npm wants the licence beside the package; the repository keeps one at its root.
fs.copyFileSync("../../LICENSE", "LICENSE");

const common = { bundle: true, sourcemap: true, logLevel: "info", external: ["three", "three/*"] };
await Promise.all([
  esbuild.build({ ...common, entryPoints: ["src/host.ts"], outfile: "dist/host.mjs", platform: "node", format: "esm", target: "node18" }),
  esbuild.build({ ...common, entryPoints: ["src/host.ts"], outfile: "dist/host.cjs", platform: "node", format: "cjs", target: "node18" }),
  esbuild.build({ ...common, entryPoints: ["src/page.ts"], outfile: "dist/page.mjs", platform: "browser", format: "esm", target: "es2022" }),
  esbuild.build({ ...common, entryPoints: ["src/stage.ts"], outfile: "dist/stage.mjs", platform: "browser", format: "esm", target: "es2022" }),
]);
