// Sector scripts (docs/design/sector-scripts.md): where the scripts are, what each is called, and a run in
// its own process (dist/scriptRunner.js). No VS Code imports: the MCP server lists and runs scripts too.

import { fork, type ChildProcess } from "node:child_process";
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
//       get(path), set(path, value), json { node, entry }
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
