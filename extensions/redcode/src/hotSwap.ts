// Getting a packed archive into the running game without a restart (REDcode issue #11). With REDnode
// running, the swap goes to its kernel MCP server's archives_reload, which checks the archive, swaps it
// through REDswap (REDnode 0.41.0 and later, game 2.5) and, for an archive with the game's sound paks,
// pauses the game and loads the sound index again. Without REDnode, Pack and Play installs for the next
// start. RED Hot Tools' hot folder was the other way until 0.10.7; it has no build for game 2.5.
// No VS Code imports, so scripts/unit.mjs can run it.

import * as fs from "node:fs";
import * as http from "node:http";
import * as os from "node:os";
import * as path from "node:path";

/** REDnode's MCP port when its settings name none (REDnode's main.js). */
export const RednodeDefaultPort = 41820;

/** Where REDnode's host keeps its settings: %APPDATA%\@rednode\overlay\settings.json. */
export function rednodeSettingsFile(appData = process.env.APPDATA ?? path.join(os.homedir(), "AppData", "Roaming")): string {
  return path.join(appData, "@rednode", "overlay", "settings.json");
}

/** What REDnode's settings say about its MCP server. */
export interface RednodeMcp {
  /** False when REDnode has never run on this PC (no settings file), or the file is unreadable. */
  installed: boolean;
  /** The launcher's MCP server switch (settings.mcp.enabled). Outside callers are served only with it on. */
  enabled: boolean;
  port: number;
  /** Undefined until REDnode's host has started once. */
  token?: string;
}

/** Reads REDnode's MCP port, token and switch from its host settings. Never throws. */
export function readRednodeMcp(file = rednodeSettingsFile()): RednodeMcp {
  let settings: { mcp?: { enabled?: unknown; port?: unknown; token?: unknown } };
  try {
    settings = JSON.parse(fs.readFileSync(file, "utf8"));
  } catch {
    return { installed: false, enabled: false, port: RednodeDefaultPort };
  }
  const mcp = settings?.mcp ?? {};
  const port = Number(mcp.port);
  return {
    installed: true,
    enabled: mcp.enabled === true,
    port: Number.isInteger(port) && port > 0 && port < 65536 ? port : RednodeDefaultPort,
    token: typeof mcp.token === "string" && mcp.token ? mcp.token : undefined,
  };
}

/** REDnode's answer to archives_reload (result.content[0].text, as JSON). */
export interface ReloadAnswer {
  reloaded: string[];
  failed: { file: string; why: string }[];
  ms?: number;
  /** For an archive with sound paks: index "reloaded" when the new sounds play, with a note to show. */
  sound?: { index: string; note?: string };
  /** The worn items whose appearance REDnode applied again after the swap. */
  refreshed?: unknown[];
}

export type ReloadResult =
  /** REDnode swapped (or tried to swap) the files. */
  | { kind: "answer"; answer: ReloadAnswer }
  /** REDnode answered but refused: no save loaded, REDswap unable to swap in this game, the tool switched off, ... */
  | { kind: "refused"; why: string }
  /** Something listens on the port but refused the token: REDnode runs with the MCP server switch off for outside callers, or the token changed. */
  | { kind: "unauthorized" }
  /** Nothing answered: REDnode is not running, or its MCP server is off. */
  | { kind: "unreachable"; why: string };

/** One POST to REDnode's MCP server: tools/call archives_reload. The server is stateless, so no initialize is needed. */
export function callArchivesReload(mcp: { port: number; token: string }, files: string[], timeoutMs = 120_000): Promise<ReloadResult> {
  const body = JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/call", params: { name: "archives_reload", arguments: { files } } });
  return new Promise((resolve) => {
    const req = http.request(
      {
        host: "127.0.0.1",
        port: mcp.port,
        path: "/mcp",
        method: "POST",
        headers: {
          Authorization: `Bearer ${mcp.token}`,
          "Content-Type": "application/json",
          Accept: "application/json, text/event-stream",
          "Content-Length": Buffer.byteLength(body),
        },
        timeout: timeoutMs,
      },
      (res) => {
        const chunks: Buffer[] = [];
        res.on("data", (c: Buffer) => chunks.push(c));
        res.on("end", () => resolve(readReply(res.statusCode ?? 0, res.headers["content-type"] ?? "", Buffer.concat(chunks).toString("utf8"))));
        res.on("error", (e) => resolve({ kind: "refused", why: `REDnode's reply broke off: ${e.message}` }));
      },
    );
    req.on("timeout", () => req.destroy(new Error(`no answer in ${Math.round(timeoutMs / 1000)} s`)));
    req.on("error", (e: NodeJS.ErrnoException) => {
      if (e.code === "ECONNREFUSED") resolve({ kind: "unreachable", why: `nothing listens on 127.0.0.1:${mcp.port}` });
      else resolve({ kind: "refused", why: `REDnode's MCP server did not answer: ${e.message}` });
    });
    req.end(body);
  });
}

/** Reads the HTTP reply of a tools/call. Exported for the unit test. */
export function readReply(status: number, contentType: string, text: string): ReloadResult {
  if (status === 401) return { kind: "unauthorized" };
  if (status < 200 || status >= 300) return { kind: "refused", why: `REDnode's MCP server answered HTTP ${status}${text ? `: ${text.slice(0, 200)}` : ""}` };
  // JSON responses are on in REDnode; a server-sent event stream carries the same message on a data: line.
  let json = text;
  if (/text\/event-stream/i.test(contentType)) {
    json = text.split(/\r?\n/).filter((l) => l.startsWith("data:")).map((l) => l.slice(5).trim()).pop() ?? "";
  }
  let message: { result?: { content?: { type?: string; text?: string }[]; isError?: boolean }; error?: { message?: string } };
  try {
    message = JSON.parse(json);
  } catch {
    return { kind: "refused", why: `REDnode's MCP server sent something other than JSON: ${text.slice(0, 200)}` };
  }
  // REDnode leaves out a tool the player switched off in its Tools Manager.
  const refused = (why: string): ReloadResult => ({ kind: "refused", why: /archives_reload not found/i.test(why) ? `${why}. Switch archives_reload on in REDnode's Tools Manager.` : why });
  if (message.error) return refused(message.error.message ?? "REDnode refused the call");
  const content = message.result?.content?.find((c) => c.type === "text")?.text ?? "";
  if (message.result?.isError) return refused(content || "REDnode refused the call");
  try {
    const answer = JSON.parse(content) as ReloadAnswer;
    return { kind: "answer", answer: { ...answer, reloaded: answer.reloaded ?? [], failed: answer.failed ?? [] } };
  } catch {
    return { kind: "refused", why: `REDnode's answer was not the archives_reload shape: ${content.slice(0, 200)}` };
  }
}

/** A one-line summary of REDnode's answer, for the notification. */
export function summarize(answer: ReloadAnswer): string {
  const names = (list: string[]) => list.map((f) => path.basename(f)).join(", ");
  const parts: string[] = [];
  if (answer.reloaded.length) parts.push(`REDnode swapped ${names(answer.reloaded)} into the running game${answer.ms !== undefined ? ` in ${answer.ms} ms` : ""}.`);
  for (const f of answer.failed) parts.push(`${path.basename(f.file)} was not swapped: ${f.why}`);
  if (answer.sound) parts.push(answer.sound.index === "reloaded" ? `Sounds: ${answer.sound.note ?? "the sound index was loaded again."}` : `Sounds: ${answer.sound.note ?? `the sound index was ${answer.sound.index}.`}`);
  return parts.join(" ") || "REDnode swapped nothing.";
}

/** What to tell the user about REDnode when its MCP server could not take the swap, or "" when REDnode is not on this PC. */
export function rednodeHint(mcp: RednodeMcp, result?: ReloadResult): string {
  if (!mcp.installed) return "";
  if (!mcp.token) return "REDnode has not made its MCP token yet: start the game with REDnode once.";
  if (result?.kind === "unauthorized") return "REDnode is running but refused REDcode: switch on MCP server in its launcher's Settings drawer (F10 shows the launcher), then press Pack and Play again.";
  if (!mcp.enabled) return "If the game is running with REDnode, switch on MCP server in its launcher's Settings drawer (F10 shows the launcher) so Pack and Play can swap through it.";
  return "";
}

/** REDswap's page, for a PC without REDnode. */
export const RedswapUrl = "https://edgemodders.ai/wiki/rednode/redswap.html";

/** What Pack and Play says when it installed the mod instead of swapping it into the running game. */
export function installedNote(mcp: RednodeMcp, result?: ReloadResult): string {
  const next = !mcp.installed
    ? `Swapping into the running game needs REDnode 0.41.0 or later, which brings REDswap: ${RedswapUrl}`
    : rednodeHint(mcp, result) || "To see changes without a restart, start the game with REDnode and press Pack and Play again.";
  return `REDcode: packed and installed. Restart the game to see the change. ${next}`;
}
