// Sector scripts (docs/design/sector-scripts.md): where the scripts are, what each is called, and a run in
// its own process (dist/scriptRunner.js). No VS Code imports: the MCP server lists and runs scripts too.

import { fork, spawnSync, type ChildProcess } from "node:child_process";
import { createHash } from "node:crypto";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import type { NodeChange } from "./sectorNodes";
import type { ReplyMessage, RunnerMessage, StartMessage } from "./scriptRunner";

/** Where a script lives: the project's own, the modder's own (every project), or an example shipped with REDcode. */
export type ScriptPlace = "project" | "mine" | "example";

export interface ScriptInfo {
  file: string;
  place: ScriptPlace;
  name: string;
  description: string;
}

/** The modder's own scripts, offered in every project. */
export function myScriptsDir(): string {
  const appData = process.env.APPDATA || path.join(os.homedir(), "AppData", "Roaming");
  return path.join(appData, "Edgemodders", "redcode", "scripts");
}

/** A project's own scripts: in its .redcode folder, which is never packed. */
export const projectScriptsDir = (projectDir: string) => path.join(projectDir, ".redcode", "scripts");

/** A script's name and description from its text, without running it: `name: "..."` in its default export. */
export function describeScript(source: string, file: string): { name: string; description: string } {
  const field = (key: string) => {
    const m = new RegExp(`\\b${key}\\s*:\\s*(["'\`])((?:\\\\.|(?!\\1).)*)\\1`).exec(source);
    return m ? m[2].replace(/\\(.)/g, "$1") : "";
  };
  return { name: field("name") || path.basename(file).replace(/\.m?js$/i, ""), description: field("description") };
}

/** The scripts in each place, by name; a folder that is not there has none. */
export function listScripts(places: { place: ScriptPlace; dir: string }[]): ScriptInfo[] {
  const out: ScriptInfo[] = [];
  for (const { place, dir } of places) {
    let names: string[];
    try {
      names = fs.readdirSync(dir).filter((n) => /\.mjs$/i.test(n));
    } catch {
      continue;
    }
    const here = names.map((n) => {
      const file = path.join(dir, n);
      let source = "";
      try {
        source = fs.readFileSync(file, "utf8");
      } catch {
        // Listed by its file name.
      }
      return { file, place, ...describeScript(source, file) };
    });
    out.push(...here.sort((a, b) => a.name.localeCompare(b.name)));
  }
  return out;
}

/** A script's file name from its name: lower case, words joined by dashes. */
export const scriptFileName = (name: string) =>
  `${
    name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "") || "script"
  }.mjs`;

/** The start of a new script. */
export function scriptTemplate(name: string): string {
  const quoted = JSON.stringify(name);
  return `// ${name}: a REDcode sector script (https://edgemodders.github.io/REDcode/design/sector-scripts.html).
// Run it from the Scripts button in a sector's 3D view: on all nodes, or on the selected ones.
//
// node: id, entry, type, debugName, mesh, resource, appearance, position [x, y, z], streamingDistance,
//       get(path), set(path, value), json { node, entry }, inner (a cooked node's inner node)
// ctx:  select(node), deselect(node), log(...), nodes(), selected(), sector,
//       game.read(path), tools.call(extension, method, ...args), agent.request(text, nodes)
//
// set records a change: REDcode shows them all before anything changes, and Apply makes them one edit.
// Debug runs it under VS Code's debugger: put a breakpoint here, or a line with: debugger;
export default {
  name: ${quoted},
  description: "What it finds",
  visit(node, ctx) {
    if (node.streamingDistance < 45) {
      ctx.select(node);
    }
  },
};
`;
}

/** What a script is, for an assistant that writes one (the MCP tool script_write). */
export const ScriptApi =
  "A script is an ES module (.mjs, run by Node in its own process, so it may import node: modules) whose default export is " +
  "{ name, description, visit(node, ctx) } or { name, description, run(ctx) }: name and description as plain string literals, which the Scripts menu shows. " +
  "visit is called once for every node, or for the selected ones; run is called once and walks ctx.nodes() or ctx.selected() itself. Either may be async. " +
  "node: id, entry, type, debugName, mesh, resource, appearance, position [x, y, z] (game axes), streamingDistance, get(path), set(path, value), json { node, entry }, inner (a cooked node's inner node). " +
  "ctx: select(node), deselect(node), log(...), nodes(), selected(), sector, await game.read(path); tools.call(extension, method, ...args) and agent.request(text, nodes) work only in REDcode. " +
  "node.set only records a change: nothing is written until the modder chooses Apply in REDcode, or script_run is called with apply: true.";

/** The largest script script_write takes. */
const MaxScriptBytes = 200_000;

/** What is wrong with a script's text, or undefined. It is parsed by Node but never run. */
export function checkScript(source: string): string | undefined {
  if (!source.trim()) return "The script is empty";
  if (Buffer.byteLength(source, "utf8") > MaxScriptBytes) return `The script is over ${MaxScriptBytes / 1000} KB`;
  if (!/\bexport\s+default\b/.test(source)) return "The script has no default export: export default { name, description, visit(node, ctx) { ... } }";
  if (!/\b(visit|run)\b/.test(source)) return "The script's default export has neither visit(node, ctx) nor run(ctx)";
  if (!/\bname\s*:\s*["'`]/.test(source)) return 'The script\'s default export has no name: add name: "..." as a plain string, which the Scripts menu shows';
  let dir: string | undefined;
  try {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), "redcode-script-"));
    const file = path.join(dir, "script.mjs");
    fs.writeFileSync(file, source);
    // --check parses and stops; ELECTRON_RUN_AS_NODE for when this runs inside VS Code.
    const r = spawnSync(process.execPath, ["--check", file], { env: { ...process.env, ELECTRON_RUN_AS_NODE: "1" }, encoding: "utf8", windowsHide: true, timeout: 20_000 });
    if (r.status !== 0 && r.stderr) {
      const lines = r.stderr.split(/\r?\n/).filter((l) => l.trim() && !/^\s+at |^Node\.js v/.test(l));
      return `The script does not parse:\n${lines.join("\n").split(file).join("script.mjs").replace(/file:\/\/\/\S*script\.mjs/g, "script.mjs")}`;
    }
  } catch {
    // Not checked: the run says what is wrong.
  } finally {
    if (dir) fs.rmSync(dir, { recursive: true, force: true });
  }
  return undefined;
}

/**
 * Writes a script into a scripts folder under the file name its name gives, where the Scripts menu finds it.
 * A file already there is replaced only with overwrite.
 */
export function writeScript(dir: string, place: ScriptPlace, source: string, overwrite = false): ScriptInfo & { replaced: boolean } {
  const problem = checkScript(source);
  if (problem) throw new Error(problem);
  const { name, description } = describeScript(source, "script.mjs");
  const file = path.join(dir, scriptFileName(name));
  const replaced = fs.existsSync(file);
  if (replaced && !overwrite) throw new Error(`There is a script ${file} already. Pass overwrite to replace it, or give this one another name.`);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(file, source.endsWith("\n") ? source : `${source}\n`);
  return { file, place, name, description, replaced };
}

// The scripts the modder has let run, each as "<file, lower case>|<SHA-256 of its text>": a script is known by
// what it says, so one changed outside REDcode (by an assistant, a download, a sync) is shown and asked about
// again. An entry without a hash (REDcode 0.10.17 and older) knows nothing: its script is asked about once more.

const knownPath = (file: string) => path.resolve(file).toLowerCase();

/** A script as the known list holds it, or undefined when its file cannot be read. */
export function scriptKey(file: string): string | undefined {
  try {
    return `${knownPath(file)}|${createHash("sha256").update(fs.readFileSync(file)).digest("hex")}`;
  } catch {
    return undefined;
  }
}

/** Whether the list has an entry for this file, whatever its text was then. */
export const knowsScriptFile = (list: readonly string[], file: string) => list.some((e) => e === knownPath(file) || e.startsWith(`${knownPath(file)}|`));

/** Whether the script is known as it is now. */
export function isKnownScript(list: readonly string[], file: string): boolean {
  const key = scriptKey(file);
  return !!key && list.includes(key);
}

/** The list with the script known as it is now, in place of what it held for that file. */
export function withKnownScript(list: readonly string[], file: string): string[] {
  const key = scriptKey(file);
  const rest = list.filter((e) => e !== knownPath(file) && !e.startsWith(`${knownPath(file)}|`));
  return key ? [...rest, key] : rest;
}

/** What a run gives back. */
export interface ScriptResult {
  /** The nodes it visited: the selection's, or all. */
  visited: number;
  total: number;
  /** The entries it selected, or null when it did not select (the view's selection stays). */
  selected: number[] | null;
  changes: NodeChange[];
  ms: number;
}

export interface RunOptions {
  /** dist/scriptRunner.js. */
  runner: string;
  script: string;
  sector: string;
  /** The sector's CR2W JSON file. */
  json: string;
  only?: number[];
  /** The view's selection at the start, for ctx.selected(); defaults to only. */
  selection?: number[];
  debug?: boolean;
  onLog?(line: string): void;
  onProgress?(done: number, total: number): void;
  /** Debug: the inspector is open on this port and waits for a debugger. */
  onDebug?(port: number): void;
  /** The script's calls into REDcode: read, tool, agent. */
  onCall?(method: string, params: unknown): Promise<unknown>;
}

export interface ScriptRun {
  result: Promise<ScriptResult>;
  /** Ends the script's process; result then rejects with a ScriptStopped. */
  stop(): void;
}

export class ScriptStopped extends Error {
  constructor() {
    super("Stopped");
  }
}

/** Runs a script in its own Node process (VS Code's own runtime, as Node). */
export function runScript(o: RunOptions): ScriptRun {
  let child: ChildProcess;
  let stopped = false;
  const result = new Promise<ScriptResult>((resolve, reject) => {
    child = fork(o.runner, [], {
      // VS Code's runtime is Electron: this makes it plain Node.
      env: { ...process.env, ELECTRON_RUN_AS_NODE: "1" },
      execArgv: [],
      stdio: ["ignore", "pipe", "pipe", "ipc"],
      windowsHide: true,
    });
    let finished = false;
    const finish = (f: () => void) => {
      if (finished) return;
      finished = true;
      f();
      // Its last message is in: timers a script left behind do not keep it.
      setTimeout(() => child.kill(), 200);
    };
    const lines = (stream: NodeJS.ReadableStream | null) => {
      let rest = "";
      stream?.setEncoding?.("utf8");
      stream?.on("data", (chunk: string) => {
        const parts = (rest + chunk).split(/\r?\n/);
        rest = parts.pop() ?? "";
        for (const p of parts) if (p.trim() && !/^Debugger (listening|attached)|^For help, see|^Waiting for the debugger/.test(p)) o.onLog?.(p);
      });
    };
    lines(child.stdout);
    lines(child.stderr);
    child.on("message", (m: RunnerMessage) => {
      switch (m.type) {
        case "debug": {
          const port = Number(/:(\d+)\//.exec(m.url)?.[1]);
          if (port) o.onDebug?.(port);
          return;
        }
        case "loaded":
          o.onProgress?.(0, m.total);
          return;
        case "progress":
          o.onProgress?.(m.done, m.total);
          return;
        case "log":
          o.onLog?.(m.line);
          return;
        case "call": {
          const answer = (r: ReplyMessage) => {
            if (child.connected) child.send(r);
          };
          (o.onCall ? o.onCall(m.method, m.params) : Promise.reject(new Error(`No ${m.method} here`))).then(
            (value) => answer({ type: "reply", id: m.id, ok: true, value }),
            (e: unknown) => answer({ type: "reply", id: m.id, ok: false, error: e instanceof Error ? e.message : String(e) }),
          );
          return;
        }
        case "done":
          finish(() => resolve({ visited: m.visited, total: m.total, selected: m.selected, changes: m.changes, ms: m.ms }));
          return;
        case "failed":
          finish(() => reject(new Error(m.error)));
          return;
      }
    });
    child.on("error", (e) => finish(() => reject(e)));
    child.on("exit", (code, signal) => finish(() => reject(stopped ? new ScriptStopped() : new Error(`The script's process ended (${signal ?? `exit code ${code}`}) before it finished`))));
    const start: StartMessage = { type: "start", script: o.script, sector: o.sector, json: o.json, ...(o.only ? { only: o.only } : {}), ...(o.selection ? { selection: o.selection } : {}), ...(o.debug ? { debug: true } : {}) };
    child.send(start);
  });
  return {
    result,
    stop() {
      stopped = true;
      child?.kill();
    },
  };
}
