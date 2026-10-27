// EDGEdeck, the mod manager, when it is installed. REDcode installs a packed project through it, so
// one tool owns the game folder. Found at runtime and never imported: the interface below copies the
// shape of EDGEdeck's exported API (apiVersion 1, EDGEdeck 0.28.0, src/extension.ts there).

import * as vscode from "vscode";

export const EDGEdeckId = "edgemodders.edgedeck";

export interface InstalledMod { id: string; name: string; files: number; added: boolean }

/** A deploy's result. lost (EDGEdeck 0.28.0): mods that lost files to another; waiting (deployMod): other mods' files left for the next deploy. */
export interface DeployResult {
  linked: number;
  removed: number;
  kept: number;
  skipped: string[];
  conflicts: number;
  lost?: { mod: string; files: number; winner: string; winnerName: string }[];
  waiting?: number;
}

export interface EDGEdeckApi {
  apiVersion: number;
  gamePath(): string;
  projectMod(projectFile: string): string | undefined;
  /** Sync in EDGEdeck so far; it may become async to ask about a mod of the same name (EDGEdeck #3), undefined when cancelled. */
  installProject(projectFile: string): InstalledMod | undefined | Promise<InstalledMod | undefined>;
  pendingMods(except?: string): string[];
  deploy(): Promise<DeployResult | undefined>;
  /** EDGEdeck 0.28.0 (EDGEdeck #2): deploys one mod's changes only; other mods' changes keep waiting. */
  deployMod?(id: string): Promise<DeployResult | undefined>;
  turnOff(id: string): void;
}

/**
 * EDGEdeck's API only when EDGEdeck is already running, never activating it: for things REDcode does
 * by itself at startup, where activating another extension can race a window reload (VS Code then
 * warns that EDGEdeck's output channel was added to a disposed store).
 */
export function runningEDGEdeck(): EDGEdeckApi | undefined {
  const ext = vscode.extensions.getExtension<Partial<EDGEdeckApi> | undefined>(EDGEdeckId);
  const api = ext?.isActive ? ext.exports : undefined;
  return api && api.apiVersion === 1 && typeof api.gamePath === "function" ? (api as EDGEdeckApi) : undefined;
}

/** EDGEdeck's API, activating EDGEdeck if needed; undefined when it is not installed. */
export async function findEDGEdeck(): Promise<EDGEdeckApi | undefined> {
  const ext = vscode.extensions.getExtension<Partial<EDGEdeckApi> | undefined>(EDGEdeckId);
  if (!ext) return undefined;
  const exports = ext.isActive ? ext.exports : await ext.activate();
  return exports && exports.apiVersion === 1 && typeof exports.installProject === "function" ? (exports as EDGEdeckApi) : undefined;
}
