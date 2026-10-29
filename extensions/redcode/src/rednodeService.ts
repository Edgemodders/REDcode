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

/** Writes this window's project to the state file: on a change, and when the window gains focus with a project open. */
export function publishProject(project: ProjectRef): void {
  writeState({ pid: process.pid, updated: new Date().toISOString(), project });
}

/** Says this window has no project, unless another window wrote the file since. */
export function withdrawProject(): void {
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
  | { state: "installed" | "updated"; dir: string; version: string; from?: string };

/**
 * Copies the package from source (the extension's rednode/redcode) into the game's REDnode apps
 * folder when it is missing or another version. REDnode watches that folder and starts it.
 */
export function syncRednodePackage(source: string, gamePath: string): PackageResult {
  const apps = rednodeAppsDir(gamePath);
  if (!apps) return { state: "no-rednode" };
  const version = manifestVersion(source) ?? "0.0.0";
  const dir = path.join(apps, path.basename(source));
  const from = manifestVersion(dir);
  if (from === version) return { state: "current", dir, version };
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
