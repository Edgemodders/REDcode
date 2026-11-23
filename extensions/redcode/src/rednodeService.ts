// REDcode's service in REDnode (REDcode issue #18). The extension ships a small REDnode package,
// rednode/redcode, and copies it into the game's REDnode apps folder; its service.mjs answers
// project() to other packages (EDGEbuilder) and assistants. The two sides meet in a state file the
// extension writes, %LOCALAPPDATA%\REDcode\project.json. No VS Code imports here.

import * as fs from "node:fs";
import * as path from "node:path";
import type { ProjectRef } from "./api";

/** The state file the package's service.mjs reads. */
export function projectStateFile(): string {
  return path.join(process.env.LOCALAPPDATA ?? path.join(process.env.USERPROFILE ?? "", "AppData", "Local"), "REDcode", "project.json");
}

interface ProjectState {
  /** The extension host's process id: one per VS Code window, so the package can spot a closed window. */
  pid: number;
  updated: string;
  project: ProjectRef | null;
}

function writeState(state: ProjectState): void {
  const file = projectStateFile();
  fs.mkdirSync(path.dirname(file), { recursive: true });
  // Written whole and renamed, so the package never reads half a file.
  const tmp = `${file}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(state, null, 2));
  fs.renameSync(tmp, file);
}

/**
 * Every window's own state file (REDcode issue #32): %LOCALAPPDATA%\REDcode\projects\<extension host
 * pid>.json, read by the package's projects(). project.json above stays the last-focused window's, for
 * project().
 */
export function windowStateFile(pid = process.pid): string {
  return path.join(path.dirname(projectStateFile()), "projects", `${pid}.json`);
}

interface WindowState {
  pid: number;
  updated: string;
  /** When this window last had the focus with its project open; the window last focused comes first in projects(). */
  focusedAt: string;
  project: ProjectRef;
}

/** When this window last had the focus with a project open. */
let focusedAt = new Date(0).toISOString();

function writeWindowState(project: ProjectRef): void {
  const file = windowStateFile();
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const state: WindowState = { pid: process.pid, updated: new Date().toISOString(), focusedAt, project };
  const tmp = `${file}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(state, null, 2));
  fs.renameSync(tmp, file);
}

/**
 * Writes this window's project: to its own state file, always, and to project.json, which says the
 * last window that published. focused: the window has the focus now, which puts it first in projects().
 */
export function publishProject(project: ProjectRef, focused = true): void {
  if (focused) focusedAt = new Date().toISOString();
  writeWindowState(project);
  writeState({ pid: process.pid, updated: new Date().toISOString(), project });
}

/** Says this window has no project: its own state file goes, and project.json says null unless another window wrote it since. */
export function withdrawProject(): void {
  try {
    fs.rmSync(windowStateFile(), { force: true });
  } catch {
    // A closed window is also spotted by its process id.
  }
  try {
    const state = JSON.parse(fs.readFileSync(projectStateFile(), "utf8")) as Partial<ProjectState>;
    if (state.pid !== process.pid || state.project === null) return;
  } catch {
    return;
  }
  writeState({ pid: process.pid, updated: new Date().toISOString(), project: null });
}

/** The game's REDnode apps folder, or undefined when REDnode is not installed in the game. */
export function rednodeAppsDir(gamePath: string): string | undefined {
  const dir = path.join(gamePath, "red4ext", "plugins", "REDnode", "apps");
  return fs.existsSync(dir) ? dir : undefined;
}

function manifestVersion(dir: string): string | undefined {
  try {
    return (JSON.parse(fs.readFileSync(path.join(dir, "rednode-app.json"), "utf8")) as { version?: string }).version;
  } catch {
    return undefined;
  }
}

export type PackageResult =
  | { state: "no-rednode" }
  | { state: "current"; dir: string; version: string }
  /** The game has a newer one, from a newer REDcode in another window: left as it is. */
  | { state: "newer"; dir: string; version: string; installed: string }
  | { state: "installed" | "updated"; dir: string; version: string; from?: string };

/** Compares two versions such as 0.2.0 by their numbers: below zero when a is older. */
export function compareVersions(a: string, b: string): number {
  const pa = a.split(/[.+-]/).map((x) => Number.parseInt(x, 10) || 0);
  const pb = b.split(/[.+-]/).map((x) => Number.parseInt(x, 10) || 0);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const d = (pa[i] ?? 0) - (pb[i] ?? 0);
    if (d !== 0) return d;
  }
  return 0;
}

/**
 * Copies the package from source (the extension's rednode/redcode) into the game's REDnode apps
 * folder when it is missing or older. REDnode watches that folder and starts it. A newer one stays:
 * two windows can run different REDcodes (a store one and a development one), and the older must not
 * take the newer package's functions away (found 2026-11-20: 0.10.14 put 0.1.0 back over 0.2.0).
 */
export function syncRednodePackage(source: string, gamePath: string): PackageResult {
  const apps = rednodeAppsDir(gamePath);
  if (!apps) return { state: "no-rednode" };
  const version = manifestVersion(source) ?? "0.0.0";
  const dir = path.join(apps, path.basename(source));
  const from = manifestVersion(dir);
  if (from === version) return { state: "current", dir, version };
  if (from && compareVersions(from, version) > 0) return { state: "newer", dir, version, installed: from };
  fs.mkdirSync(dir, { recursive: true });
  // The manifest last, so REDnode restarts the package once, with every file in place.
  const files = fs
    .readdirSync(source, { withFileTypes: true })
    .filter((e) => e.isFile())
    .map((e) => e.name)
    .sort((a, b) => Number(a === "rednode-app.json") - Number(b === "rednode-app.json"));
  for (const f of files) fs.copyFileSync(path.join(source, f), path.join(dir, f));
  return from ? { state: "updated", dir, version, from } : { state: "installed", dir, version };
}

/** The game's display settings as the package's service answers them (rednode/redcode/service.mjs). */
export interface LiveDisplay {
  windowMode: string;
  resolution: string;
  windowModes: string[];
  resolutions: string[];
  /** True when this request changed something. */
  changed?: boolean;
}

/**
 * Asks the package in the running game for its window mode and resolution, and to change them when
 * `want` names any (docs/design/game-view.md). It writes display-request.json beside project.json and
 * waits for display.json with the same id. Undefined when nothing answers in time: REDnode is not
 * running, or the game has a package older than 0.3.0. Throws what the game refused.
 */
export async function requestDisplay(want: { windowMode?: string; resolution?: string } = {}, timeoutMs = 8000): Promise<LiveDisplay | undefined> {
  const dir = path.dirname(projectStateFile());
  const id = `${process.pid}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const request = path.join(dir, "display-request.json");
  const answer = path.join(dir, "display.json");
  fs.mkdirSync(dir, { recursive: true });
  const tmp = `${request}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify({ id, pid: process.pid, at: new Date().toISOString(), ...want }, null, 2));
  fs.renameSync(tmp, request);
  const end = Date.now() + timeoutMs;
  while (Date.now() < end) {
    await new Promise((r) => setTimeout(r, 150));
    let got: (Partial<LiveDisplay> & { id?: string; ok?: boolean; error?: string }) | undefined;
    try {
      got = JSON.parse(fs.readFileSync(answer, "utf8"));
    } catch {
      continue;
    }
    if (got?.id !== id) continue;
    if (!got.ok) throw new Error(got.error ?? "The game refused the display change.");
    return got as LiveDisplay;
  }
  return undefined;
}
