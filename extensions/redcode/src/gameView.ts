// Run Game in Tab (docs/design/game-view.md, stage G2): the game's own window, kept on an editor tab.
// This is REDcode's side: the tab, the game's window mode and resolution before the start and back
// after the end, and the helper's process. The helper is interim: a PowerShell script from
// tools/probes/game-view until REDbridge has window.* (REDbridge #22), so the command shows only when
// that script is found (a checkout, or redcode.gameView.helper).

import { spawn, execFile, type ChildProcess } from "node:child_process";
import * as crypto from "node:crypto";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import * as vscode from "vscode";
import { pickResolution, restoreDisplay, setWindowed, type DisplayRestore } from "./gameDisplay";
import { gameEnv, launchTarget } from "./install";

const RestoreKey = "redcode.gameView.restore";
const GameExe = "Cyberpunk2077.exe";

export interface GameViewDeps {
  context: vscode.ExtensionContext;
  log: vscode.OutputChannel;
  /** The game folder, asking for it when it is not set; throws when the user gives none. */
  gameFolder: () => string;
}

interface Session {
  panel: vscode.WebviewPanel;
  helper?: ChildProcess;
  dir: string;
  ended: boolean;
}

let session: Session | undefined;

/** The interim helper script, or "" when this install has none. */
export function helperScript(extensionDir: string): string {
  const set = vscode.workspace.getConfiguration("redcode").get<string>("gameView.helper", "").trim();
  const candidates = set ? [set] : [path.join(extensionDir, "..", "..", "tools", "probes", "game-view", "helper.ps1")];
  return candidates.find((f) => fs.existsSync(f)) ?? "";
}

function gameRunning(): Promise<boolean> {
  return new Promise((resolve) => {
    execFile("tasklist", ["/FI", `IMAGENAME eq ${GameExe}`, "/NH", "/FO", "CSV"], { windowsHide: true }, (err, stdout) => {
      resolve(!err && stdout.toLowerCase().includes(GameExe.toLowerCase()));
    });
  });
}

/** Puts the player's window mode and resolution back once the game has ended; kept across restarts of VS Code. */
async function restoreWhenGameEnds(deps: GameViewDeps): Promise<void> {
  const restore = deps.context.globalState.get<DisplayRestore>(RestoreKey);
  if (!restore) return;
  // The game may write its settings when it ends, so wait for it.
  while (await gameRunning()) await new Promise((r) => setTimeout(r, 5000));
  if (!deps.context.globalState.get<DisplayRestore>(RestoreKey)) return;
  if (restoreDisplay(restore)) {
    deps.log.appendLine(`Game in tab: the game's settings are back to ${restore.windowMode.value} ${restore.resolution.value}`);
    await deps.context.globalState.update(RestoreKey, undefined);
  } else {
    deps.log.appendLine(`Game in tab: could not put ${restore.windowMode.value} ${restore.resolution.value} back in ${restore.file}`);
  }
}

function page(title: string, releaseKey: string, nonce: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'nonce-${nonce}'; script-src 'nonce-${nonce}';">
<title>${title}</title>
<style nonce="${nonce}">
  html, body { height: 100%; margin: 0; }
  body { display: flex; flex-direction: column; align-items: center; justify-content: flex-end; background: #000; color: var(--vscode-descriptionForeground); font: var(--vscode-font-size) var(--vscode-font-family); user-select: none; }
  #bar { display: flex; gap: 12px; align-items: center; padding: 6px 10px; }
  #status { color: var(--vscode-foreground); }
  button { background: var(--vscode-button-secondaryBackground); color: var(--vscode-button-secondaryForeground); border: 0; padding: 3px 10px; cursor: pointer; font: inherit; }
  button:hover { background: var(--vscode-button-secondaryHoverBackground); }
  kbd { border: 1px solid var(--vscode-widget-border, #555); border-radius: 3px; padding: 0 4px; }
</style>
</head>
<body>
<div id="bar">
  <span id="status">Starting…</span>
  <button id="play" title="Give the game the mouse and keyboard">Play</button>
  <button id="stop" title="Let the game go: it becomes an ordinary window again">Undock</button>
  <span><kbd>${releaseKey}</kbd> returns to VS Code</span>
</div>
<script nonce="${nonce}">
  const vscode = acquireVsCodeApi();
  const size = () => vscode.postMessage({ type: 'size', width: Math.round(innerWidth * devicePixelRatio), height: Math.round(innerHeight * devicePixelRatio), bar: Math.ceil(document.getElementById('bar').offsetHeight * devicePixelRatio) });
  addEventListener('resize', size); size();
  document.getElementById('play').addEventListener('click', () => vscode.postMessage({ type: 'play' }));
  document.getElementById('stop').addEventListener('click', () => vscode.postMessage({ type: 'stop' }));
  addEventListener('message', (e) => { if (e.data.type === 'status') document.getElementById('status').textContent = e.data.text; });
</script>
</body>
</html>`;
}

/** REDcode: Run Game in Tab. */
async function runInTab(deps: GameViewDeps, extensionDir: string): Promise<void> {
  if (session && !session.ended) {
    session.panel.reveal();
    return;
  }
  const script = helperScript(extensionDir);
  if (!script) {
    void vscode.window.showWarningMessage("REDcode: Run Game in Tab needs a REDbridge with window control, which is not released yet.");
    return;
  }
  const config = vscode.workspace.getConfiguration("redcode");
  const gamePath = deps.gameFolder();
  const releaseKey = config.get<string>("gameView.releaseKey", "ctrl+alt+backspace").trim() || "ctrl+alt+backspace";
  // The helper finds this tab from outside by the page's title, so each one is its own.
  const title = `Cyberpunk 2077 ${crypto.randomBytes(3).toString("hex")}`;
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "redcode-gameview-"));

  const panel = vscode.window.createWebviewPanel("redcode.gameView", "Cyberpunk 2077", vscode.ViewColumn.Active, { enableScripts: true, retainContextWhenHidden: true });
  const mine: Session = { panel, dir, ended: false };
  session = mine;
  const status = (text: string) => {
    deps.log.appendLine(`Game in tab: ${text}`);
    void panel.webview.postMessage({ type: "status", text });
  };
  const signal = (name: string) => {
    try {
      fs.writeFileSync(path.join(dir, name), "");
    } catch (e) {
      deps.log.appendLine(`Game in tab: could not signal ${name}: ${(e as Error).message}`);
    }
  };

  // The tab's size in real pixels picks the game's size; the page posts it as soon as it runs.
  // The status line at the tab's bottom is kept free of the game, so its height comes off.
  let tab: { width: number; height: number } | undefined;
  let bar = 0;
  let sized: () => void = () => {};
  const firstSize = new Promise<void>((r) => (sized = r));
  panel.webview.onDidReceiveMessage((m: { type: string; width?: number; height?: number; bar?: number }) => {
    if (m.type === "size" && m.width && m.height) {
      bar = m.bar ?? 0;
      tab = { width: m.width, height: Math.max(1, m.height - bar) };
      sized();
    } else if (m.type === "play") signal("focus");
    else if (m.type === "stop") panel.dispose();
  });
  panel.onDidChangeViewState(() => signal(panel.visible ? "show" : "hide"));
  panel.onDidDispose(() => {
    mine.ended = true;
    signal("stop");
    // The helper undocks and ends by itself; make sure of it, then clear its folder.
    setTimeout(() => {
      mine.helper?.kill();
      fs.rmSync(dir, { recursive: true, force: true });
    }, 3000);
    if (session === mine) session = undefined;
    void restoreWhenGameEnds(deps);
  });
  const nonce = crypto.randomBytes(16).toString("base64");
  panel.webview.html = page(title, releaseKey, nonce);
  await Promise.race([firstSize, new Promise((r) => setTimeout(r, 2000))]);
  if (mine.ended) return;

  // The game: start it windowed at a size that fits, or take it as it runs.
  if (await gameRunning()) {
    status("The game is already running: docking it as it is. For a right fit, set Windowed and a size that fits the tab in its Video settings.");
  } else {
    const resolution = pickResolution(tab, config.get<string>("gameView.resolution", "auto"));
    const pending = deps.context.globalState.get<DisplayRestore>(RestoreKey);
    const restore = setWindowed(resolution);
    if (restore) {
      // An earlier run's values are the player's own: keep those.
      if (!pending) await deps.context.globalState.update(RestoreKey, restore);
      status(`Starting the game windowed at ${resolution}…`);
    } else {
      status("The game's settings file was not found or has another shape: starting the game as it is…");
    }
    const target = launchTarget(gamePath, "exe", config.get<boolean>("pack.redmod", false));
    if (target.kind !== "exe" || !fs.existsSync(target.exe)) {
      status(`The game's exe was not found under ${gamePath}.`);
      return;
    }
    deps.log.appendLine(`Game in tab: ${target.exe} ${target.args.join(" ")}`);
    const child = spawn(target.exe, target.args, { cwd: path.dirname(target.exe), detached: true, stdio: "ignore", env: gameEnv() });
    child.on("error", (e) => status(`Could not start the game: ${e.message}`));
    child.unref();
  }

  // The helper: follows the tab, clips the game to it, holds the release key.
  const args = ["-NoProfile", "-ExecutionPolicy", "Bypass", "-File", script, "-title", title, "-dir", dir, "-releaseKey", releaseKey, "-codePid", String(process.ppid), "-reserve", String(bar)];
  const helper = spawn("powershell", args, { windowsHide: true, stdio: ["ignore", "pipe", "pipe"] });
  mine.helper = helper;
  let buffer = "";
  helper.stdout?.on("data", (chunk: Buffer) => {
    buffer += chunk.toString("utf8");
    let at: number;
    while ((at = buffer.indexOf("\n")) >= 0) {
      const line = buffer.slice(0, at).trim();
      buffer = buffer.slice(at + 1);
      if (!line) continue;
      let event: { event?: string; why?: string; game?: boolean | number[]; shown?: number[]; tab?: number[]; seconds?: number };
      try {
        event = JSON.parse(line);
      } catch {
        deps.log.appendLine(`Game in tab helper: ${line}`);
        continue;
      }
      switch (event.event) {
        case "waiting":
          status(`Waiting for the game's window… ${event.seconds ?? 0} s`);
          break;
        case "docked": {
          const game = Array.isArray(event.game) ? event.game : [];
          const cut = event.shown && game.length === 2 && (event.shown[0] < game[0] || event.shown[1] < game[1]);
          status(cut ? `The game is ${game[0]}x${game[1]}, bigger than this tab: a part of it shows.` : "Click the game to play.");
          break;
        }
        case "moved":
        case "put-back":
          deps.log.appendLine(`Game in tab helper: ${line}`);
          break;
        case "hidden":
          break;
        case "focus":
          status(event.game === true ? "Playing." : "Click the game to play.");
          break;
        case "released":
          deps.log.appendLine(`Game in tab: released ${line}`);
          break;
        case "hung":
          status("The game is not answering; it is let go until it does.");
          break;
        case "answering":
          status("Click the game to play.");
          break;
        case "lost":
          status("The game has closed.");
          break;
        case "error":
          status(event.why ?? "The helper failed.");
          break;
        default:
          deps.log.appendLine(`Game in tab helper: ${line}`);
      }
    }
  });
  helper.stderr?.on("data", (chunk: Buffer) => deps.log.appendLine(`Game in tab helper: ${chunk.toString("utf8").trim()}`));
  helper.on("error", (e) => status(`The helper did not start: ${e.message}`));
  helper.on("exit", () => {
    if (!mine.ended) void restoreWhenGameEnds(deps);
  });
}

/** Registers Run Game in Tab, and finishes a restore an earlier session left. */
export function registerGameView(deps: GameViewDeps, extensionDir: string, run: (work: () => Promise<void>) => Promise<void>): void {
  const available = process.platform === "win32" && !!helperScript(extensionDir);
  void vscode.commands.executeCommand("setContext", "redcode.gameViewAvailable", available);
  deps.context.subscriptions.push(
    vscode.commands.registerCommand("redcode.runInTab", () => run(() => runInTab(deps, extensionDir))),
    { dispose: () => session?.panel.dispose() },
  );
  void restoreWhenGameEnds(deps);
}
