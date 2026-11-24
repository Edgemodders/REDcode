// The process a sector script runs in (docs/design/sector-scripts.md, "Where scripts run"): REDcode starts it
// with Node's IPC channel, sends one start message, and gets progress, log lines, calls and one result back.
// A script that loops forever or throws cannot hang or crash VS Code; Stop kills this process. Debug starts it
// with the inspector open and waits for VS Code's debugger before the script is loaded, so its breakpoints bind.
// Bundled to dist/scriptRunner.js; no VS Code imports.

import * as fs from "node:fs";
import * as inspector from "node:inspector";
import { pathToFileURL } from "node:url";
import { inspect } from "node:util";
import { rootChunkOf, sectorNodes, type NodeChange, type SectorNode } from "./sectorNodes";

/** What REDcode sends to start a run. */
export interface StartMessage {
  type: "start";
  /** The script's .mjs file. */
  script: string;
  /** The sector's game path, which names its nodes. */
  sector: string;
  /** The sector's CR2W JSON, written by REDbridge. */
  json: string;
  /** Run on Selection: visit only these node data entries. */
  only?: number[];
  /** The entries selected in the view when the run started: ctx.selected(), however it runs. Defaults to only. */
  selection?: number[];
  debug?: boolean;
}

/** What this process sends back. */
export type RunnerMessage =
  | { type: "debug"; url: string }
  | { type: "loaded"; total: number; name: string }
  | { type: "progress"; done: number; total: number }
  | { type: "log"; line: string }
  | { type: "call"; id: number; method: string; params: unknown }
  | { type: "done"; visited: number; total: number; selected: number[] | null; changes: NodeChange[]; ms: number }
  | { type: "failed"; error: string };

/** REDcode's answer to a call. */
export interface ReplyMessage {
  type: "reply";
  id: number;
  ok: boolean;
  value?: unknown;
  error?: string;
}

const send = (m: RunnerMessage, then?: () => void) => {
  if (process.send) process.send(m, undefined, undefined, then);
  else then?.();
};

let nextCall = 1;
const calls = new Map<number, { resolve(v: unknown): void; reject(e: Error): void }>();
/** A call into REDcode: game.read, tools.call, agent.request. */
const call = (method: string, params: unknown) =>
  new Promise<unknown>((resolve, reject) => {
    const id = nextCall++;
    calls.set(id, { resolve, reject });
    send({ type: "call", id, method, params });
  });

const text = (args: unknown[]) => args.map((a) => (typeof a === "string" ? a : inspect(a, { depth: 4, breakLength: 160 }))).join(" ");

/** What a script file exports. */
interface Script {
  name?: string;
  description?: string;
  visit?: (node: SectorNode, ctx: unknown) => unknown;
  run?: (ctx: unknown) => unknown;
}

async function run(m: StartMessage): Promise<RunnerMessage> {
  const started = Date.now();
  if (m.debug) {
    inspector.open(0, "127.0.0.1");
    send({ type: "debug", url: inspector.url() ?? "" });
    inspector.waitForDebugger();
  }
  const changes = new Map<string, NodeChange>();
  const all = sectorNodes(m.sector, JSON.parse(fs.readFileSync(m.json, "utf8")), changes);
  const only = m.only ? new Set(m.only) : undefined;
  const chosen = new Set(m.selection ?? m.only ?? []);
  const selectedAtStart = all.filter((n) => chosen.has(n.entry));
  const visitList = only ? all.filter((n) => only.has(n.entry)) : all;
  // A script's own file, by URL: a Windows path is not an import specifier.
  const mod = (await import(pathToFileURL(m.script).href)) as { default?: Script } & Script;
  const script: Script = mod.default ?? mod;
  if (typeof script.visit !== "function" && typeof script.run !== "function") throw new Error("The script's default export has neither visit(node, ctx) nor run(ctx)");
  send({ type: "loaded", total: all.length, name: script.name ?? "" });

  const picked = new Set<number>();
  let touched = false;
  const entryOf = (n: SectorNode | number) => (typeof n === "number" ? n : n?.entry);
  const ctx = {
    sector: m.sector,
    nodes: () => all,
    selected: () => selectedAtStart,
    select(n: SectorNode | number) {
      touched = true;
      picked.add(entryOf(n));
    },
    deselect(n: SectorNode | number) {
      touched = true;
      picked.delete(entryOf(n));
    },
    log: (...args: unknown[]) => send({ type: "log", line: text(args) }),
    game: {
      /** Another game or project file's root chunk as JSON; the project's copy wins. */
      read: async (path: string) => rootChunkOf(JSON.parse(String(await call("read", { path })))),
    },
    tools: {
      /** Another EDGE extension's exported API, by extension id. */
      call: (extension: string, method: string, ...args: unknown[]) => call("tool", { extension, method, args }),
    },
    agent: {
      /** Hands nodes to an assistant with a request: saved for it to read through MCP. */
      request: (request: string, nodes: (SectorNode | number)[], options?: { properties?: string[] }) => {
        const props = options?.properties ?? [];
        const list = nodes.map((n) => (typeof n === "number" ? all[n] : n)).filter((n): n is SectorNode => !!n);
        return call("agent", {
          text: request,
          nodes: list.map((n) => ({ ...(n.toJSON() as object), entry: n.entry, debugName: n.debugName, ...(props.length ? { properties: Object.fromEntries(props.map((p) => [p, n.get(p)])) } : {}) })),
        });
      },
    },
  };

  const list = visitList;
  let last = 0;
  if (typeof script.run === "function") await script.run(ctx);
  else {
    for (let i = 0; i < list.length; i++) {
      const r = script.visit!(list[i], ctx);
      if (r && typeof (r as Promise<unknown>).then === "function") await r;
      const now = Date.now();
      if (now - last > 100) {
        last = now;
        send({ type: "progress", done: i + 1, total: list.length });
      }
    }
  }
  return { type: "done", visited: list.length, total: all.length, selected: touched ? [...picked].sort((a, b) => a - b) : null, changes: [...changes.values()], ms: Date.now() - started };
}

// console.log in a script goes to REDcode's output, as ctx.log does.
for (const level of ["log", "info", "warn", "error", "debug"] as const) {
  const own = console[level].bind(console);
  console[level] = (...args: unknown[]) => {
    send({ type: "log", line: `${level === "log" || level === "info" ? "" : `${level}: `}${text(args)}` });
    if (inspector.url()) own(...args);
  };
}

process.on("message", (m: StartMessage | ReplyMessage) => {
  if (m.type === "reply") {
    const c = calls.get(m.id);
    if (!c) return;
    calls.delete(m.id);
    if (m.ok) c.resolve(m.value);
    else c.reject(new Error(m.error ?? "failed"));
    return;
  }
  if (m.type === "start") {
    // The last message is sent before the channel closes; REDcode ends the process once it has it.
    run(m).then(
      (done) => send(done, () => process.disconnect?.()),
      (e: unknown) => send({ type: "failed", error: e instanceof Error ? (e.stack ?? e.message) : String(e) }, () => process.disconnect?.()),
    );
  }
});
