// Starting, stopping and asking after the game from outside VS Code's own commands: for the MCP server's
// game_start, game_stop and game_status (docs/design/game-testing.md), so an assistant can run a test of
// its own. A start is windowed at a small size, and in REDcode's game tab when a REDcode window takes
// the request. No VS Code imports: the MCP server bundles this file.

import { execFile, spawn } from "node:child_process";
import * as fs from "node:fs";
import * as path from "node:path";
import { restoreDisplay, setWindowed, type DisplayRestore } from "./gameDisplay";
import { gameEnv, launchTarget } from "./install";
import { projectStateFile, requestDisplay, type LiveDisplay } from "./rednodeService";

export const GameExe = "Cyberpunk2077.exe";

/** %LOCALAPPDATA%\REDcode, where REDcode's windows, the MCP server and the REDnode package meet. */
export function stateDir(): string {
  return path.dirname(projectStateFile());
}

function writeWhole(file: string, value: unknown): void {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = `${file}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(value, null, 2));
  fs.renameSync(tmp, file);
}

function readJson<T>(file: string): T | undefined {
  try {
    return JSON.parse(fs.readFileSync(file, "utf8")) as T;
  } catch {
    return undefined;
  }
}

/** The running game's process id, or undefined. */
export function gamePid(): Promise<number | undefined> {
  return new Promise((resolve) => {
    execFile("tasklist", ["/FI", `IMAGENAME eq ${GameExe}`, "/NH", "/FO", "CSV"], { windowsHide: true }, (err, stdout) => {
      const m = err ? null : /^"cyberpunk2077\.exe","(\d+)"/im.exec(stdout);
      resolve(m ? Number(m[1]) : undefined);
    });
  });
}

// ---- the player's own window mode and size, to put back after a start made outside VS Code ----

function restoreFile(): string {
  return path.join(stateDir(), "display-restore.json");
}

/** Keeps what to put back. An earlier one stays: those are the player's own values. */
export function keepRestore(restore: DisplayRestore): void {
  if (!readJson<DisplayRestore>(restoreFile())) writeWhole(restoreFile(), restore);
}

/** Puts the kept values back into the game's settings file. Call only when the game is not running. */
export function finishRestore(): DisplayRestore | undefined {
  const restore = readJson<DisplayRestore>(restoreFile());
  if (!restore?.file || !restore.windowMode || !restore.resolution) return undefined;
  if (!restoreDisplay(restore)) return undefined;
  fs.rmSync(restoreFile(), { force: true });
  return restore;
}

// ---- REDcode's game tab, asked for from outside ----

function tabRequestFile(): string {
  return path.join(stateDir(), "game-tab-request.json");
}

interface TabRequest {
  id: string;
  at: string;
}

/**
 * Asks a REDcode window to run the game in its tab (Run Game in Tab). True when one took the request,
 * which then starts or docks the game itself; false when none did in time.
 */
export async function askTab(timeoutMs = 3000): Promise<boolean> {
  const id = `${process.pid}-${Date.now()}`;
  // Claims of earlier requests go; a claim stays while its request may still be answered twice.
  try {
    for (const n of fs.readdirSync(stateDir())) {
      const f = path.join(stateDir(), n);
      if (/^game-tab-.*\.claim$/.test(n) && Date.now() - fs.statSync(f).mtimeMs > 60000) fs.rmSync(f, { force: true });
    }
  } catch {
    // No folder yet.
  }
  writeWhole(tabRequestFile(), { id, at: new Date().toISOString() } satisfies TabRequest);
  const claim = path.join(stateDir(), `game-tab-${id}.claim`);
  const end = Date.now() + timeoutMs;
  while (Date.now() < end) {
    await new Promise((r) => setTimeout(r, 150));
    if (fs.existsSync(claim)) return true;
  }
  fs.rmSync(tabRequestFile(), { force: true });
  return false;
}

/**
 * A REDcode window's side of askTab: calls `run` for each fresh request this window wins. A window with
 * the focus answers at once and the others a moment later, so the one the modder looks at takes it.
 */
export function watchTabRequests(run: () => void, focused: () => boolean): { dispose(): void } {
  let seen = "";
  const check = (): void => {
    const request = readJson<TabRequest>(tabRequestFile());
    if (!request?.id || request.id === seen) return;
    seen = request.id;
    if (Math.abs(Date.now() - Date.parse(request.at)) > 10000) return;
    setTimeout(
      () => {
        try {
          // Made new or not at all: the first window wins.
          fs.writeFileSync(path.join(stateDir(), `game-tab-${request.id}.claim`), String(process.pid), { flag: "wx" });
        } catch {
          return;
        }
        fs.rmSync(tabRequestFile(), { force: true });
        run();
      },
      focused() ? 0 : 600,
    );
  };
  let watcher: fs.FSWatcher | undefined;
  try {
    fs.mkdirSync(stateDir(), { recursive: true });
    watcher = fs.watch(stateDir(), (_event, name) => {
      if (!name || name.toLowerCase() === "game-tab-request.json") setTimeout(check, 50);
    });
  } catch {
    // No watch: a request then goes unanswered and the caller starts the game without a tab.
  }
  return { dispose: () => watcher?.close() };
}

// ---- start, stop, status ----

export interface StartResult {
  started: boolean;
  /** Why not, when not started. */
  note?: string;
  pid?: number;
  /** True when a REDcode window took it into its game tab. */
  tab?: boolean;
  windowMode?: string;
  resolution?: string;
}

/**
 * Starts the game's exe windowed at a size (the game's settings file is changed for it and the
 * player's values kept for later), or hands the start to a REDcode window's game tab.
 */
export async function startGame(gamePath: string, opts: { resolution?: string; tab?: boolean; redmod?: boolean } = {}): Promise<StartResult> {
  const running = await gamePid();
  if (running) return { started: false, pid: running, note: "The game is already running." };
  if (opts.tab !== false && (await askTab())) {
    return { started: true, tab: true, note: "A REDcode window is starting the game in its game tab, windowed at a size that fits the tab. Ask game_status until it runs." };
  }
  const target = launchTarget(gamePath, "exe", opts.redmod ?? false);
  if (target.kind !== "exe" || !fs.existsSync(target.exe)) return { started: false, note: `The game's exe was not found under ${gamePath}.` };
  const resolution = opts.resolution ?? "1920x1080";
  const restore = setWindowed(resolution);
  if (restore) keepRestore(restore);
  const child = spawn(target.exe, target.args, { cwd: path.dirname(target.exe), detached: true, stdio: "ignore", env: gameEnv() });
  const failed = await new Promise<string | undefined>((resolve) => {
    child.once("error", (e) => resolve(e.message));
    child.once("spawn", () => resolve(undefined));
  });
  if (failed) return { started: false, note: `Could not start the game: ${failed}` };
  child.unref();
  return {
    started: true,
    pid: child.pid,
    tab: false,
    ...(restore ? { windowMode: "Windowed", resolution } : {}),
    note: restore
      ? "Started windowed. The player's own window mode and size go back when the game has ended: call game_stop, or game_status after it has closed."
      : "Started as it was last set: the game's settings file was not found or has another shape.",
  };
}

export interface StopResult {
  stopped: boolean;
  note?: string;
  /** The window mode and size put back, when a start had changed them. */
  restored?: string;
}

/** Ends the game: a close first, and its process ended when it has not gone after `waitMs`. */
export async function stopGame(waitMs = 15000): Promise<StopResult> {
  if (!(await gamePid())) {
    const back = finishRestore();
    return { stopped: false, note: "The game is not running.", ...(back ? { restored: `${back.windowMode.value} ${back.resolution.value}` } : {}) };
  }
  const kill = (force: boolean) => new Promise<void>((resolve) => execFile("taskkill", force ? ["/F", "/IM", GameExe] : ["/IM", GameExe], { windowsHide: true }, () => resolve()));
  await kill(false);
  const gone = async (ms: number): Promise<boolean> => {
    const end = Date.now() + ms;
    while (Date.now() < end) {
      if (!(await gamePid())) return true;
      await new Promise((r) => setTimeout(r, 500));
    }
    return false;
  };
  let forced = false;
  if (!(await gone(waitMs))) {
    forced = true;
    await kill(true);
    if (!(await gone(10000))) return { stopped: false, note: "The game did not end." };
  }
  // The game writes its settings as it closes; ours go in after.
  await new Promise((r) => setTimeout(r, 1000));
  const back = finishRestore();
  return { stopped: true, note: forced ? "The game did not close when asked, so its process was ended." : "The game closed.", ...(back ? { restored: `${back.windowMode.value} ${back.resolution.value}` } : {}) };
}

export interface GameStatus {
  running: boolean;
  pid?: number;
  /** True when the redcode package in REDnode answers: REDnode is up and its tools can be called. */
  rednode?: boolean;
  display?: Pick<LiveDisplay, "windowMode" | "resolution">;
  /** The window mode and size put back, when the game had ended with a start's values still in its file. */
  restored?: string;
  note?: string;
}

/** Whether the game runs, and whether REDnode in it answers yet. */
export async function gameStatus(): Promise<GameStatus> {
  const pid = await gamePid();
  if (!pid) {
    const back = finishRestore();
    return { running: false, ...(back ? { restored: `${back.windowMode.value} ${back.resolution.value}` } : {}) };
  }
  const live = await requestDisplay({}, 2500).catch(() => undefined);
  return {
    running: true,
    pid,
    rednode: !!live,
    ...(live ? { display: { windowMode: live.windowMode, resolution: live.resolution } } : {}),
    note: live
      ? "REDnode answers. Its game_state tool says whether a save is loaded."
      : "REDnode does not answer yet: the game is still starting, or REDnode or its redcode package (0.3.0) is not in this game.",
  };
}
