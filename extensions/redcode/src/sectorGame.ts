// The sector view and the game, both ways (docs/design/sector-layers.md L4, docs/design/sector-tools.md L1):
// - the game opens a sector in REDcode: the redcode REDnode package's openSector writes open-request.json,
//   and the window that takes it opens the sector at the entry;
// - EDGEworld: Open Sector Here: V's place from the package, the sector V stands in, the nearest thing;
// - Show in Game: EDGEbuilder's focus (and select, as things are picked) through REDnode's MCP server;
// - EDGEbuilder offered once, when a sector opens and REDnode's game has no EDGEbuilder.

import * as fs from "node:fs";
import * as path from "node:path";
import * as vscode from "vscode";
import type { BridgeClient } from "./bridgeClient";
import { callRednodeTool, readRednodeMcp, rednodeHint, type ToolResult } from "./hotSwap";
import { rednodeAppsDir, requestPlace, watchOpenRequests, type OpenRequest } from "./rednodeService";
import { sectorHere } from "./sectorHere";

/** EDGEbuilder's Nexus Mods page. */
export const EdgebuilderNexus = "https://www.nexusmods.com/cyberpunk2077/mods/36627";

/** The sector view's link to the game, for the CR2W editor. */
export interface SectorGame {
  /** Show in Game: EDGEbuilder's camera to the entry ("focus"), or only its Sector drawer on it ("select", quiet). */
  show(sector: string, entry: number, how: "focus" | "select"): Promise<void>;
  /** A sector opened in the sector view: offers EDGEbuilder once, when the game's REDnode has none. */
  opened(): void;
}

export interface SectorGameHost {
  log: vscode.OutputChannel;
  bridge: () => BridgeClient | undefined;
  /** The open project's folder, or undefined. */
  projectDir: () => string | undefined;
  /** REDcodeApi.openSector. */
  openSector: (target: string, options?: { select?: number }) => Promise<void>;
}

const name = (p: string) => p.slice(p.lastIndexOf("\\") + 1);

export function registerSectorGame(context: vscode.ExtensionContext, host: SectorGameHost): SectorGame {
  /** The project's copy of a game file when it has one, else the game path. */
  const ownOrGame = (gamePath: string): string => {
    const dir = host.projectDir();
    const own = dir ? path.join(dir, "source", "archive", ...gamePath.split(/[\\/]/)) : undefined;
    return own && fs.existsSync(own) ? own : gamePath;
  };

  // ---- the game opens a sector here ----
  const fromGame = (r: OpenRequest): void => {
    const target = ownOrGame(r.sector);
    host.log.appendLine(`The game asked to open ${r.sector}${r.entry !== undefined ? ` at entry ${r.entry}` : ""}${target !== r.sector ? ": the project's copy" : ""}.`);
    host.openSector(target, r.entry !== undefined ? { select: r.entry } : undefined).then(
      () => void vscode.window.setStatusBarMessage(`REDcode: the game opened ${name(r.sector)}${r.entry !== undefined ? ` at #${r.entry}` : ""}.`, 6000),
      (e: unknown) => void vscode.window.showErrorMessage(`REDcode: the game asked to open ${name(r.sector)}, which failed: ${e instanceof Error ? e.message : String(e)}`),
    );
  };
  context.subscriptions.push(watchOpenRequests(fromGame, { focused: () => vscode.window.state.focused, hasProject: () => !!host.projectDir() }));

  // ---- EDGEworld: Open Sector Here ----
  context.subscriptions.push(
    vscode.commands.registerCommand("redcode.openSectorHere", async () => {
      const bridge = host.bridge();
      if (!bridge?.running) {
        void vscode.window.showErrorMessage('REDcode: the REDbridge process is not running, and it finds the sector. Run "REDcode: Restart REDbridge".');
        return;
      }
      try {
        const found = await vscode.window.withProgress({ location: vscode.ProgressLocation.Notification, title: "EDGEworld" }, async (progress) => {
          progress.report({ message: "asking the game where V is" });
          const place = await requestPlace();
          if (!place) return undefined;
          progress.report({ message: "finding the sector V stands in" });
          return sectorHere((method, params) => bridge.request(method, params), place.position);
        });
        if (!found) {
          const pick = await vscode.window.showWarningMessage(
            "REDcode: the game did not say where V is. Open Sector Here needs the game running with REDnode, a save loaded, and REDcode's REDnode package 0.4.0, which REDcode puts in the game when its game folder is set.",
            "Run Game",
          );
          if (pick) await vscode.commands.executeCommand("redcode.runGame");
          return;
        }
        host.log.appendLine(`Open Sector Here: ${found.sector} (${found.kind})${found.entry !== undefined ? `, entry ${found.entry} ${found.distance?.toFixed(1)} m from V` : ""}.`);
        await host.openSector(ownOrGame(found.sector), found.entry !== undefined ? { select: found.entry } : undefined);
      } catch (e) {
        void vscode.window.showErrorMessage(`REDcode: Open Sector Here: ${e instanceof Error ? e.message : String(e)}`);
      }
    }),
  );

  // ---- Show in Game, through EDGEbuilder ----
  /** select is quiet: after it finds nothing to talk to, it waits a while before trying again. */
  let quietUntil = 0;
  const notInGame = async (why: string): Promise<void> => {
    const pick = await vscode.window.showWarningMessage(`REDcode: ${why}`, "Get EDGEbuilder");
    if (pick) await vscode.env.openExternal(vscode.Uri.parse(EdgebuilderNexus));
  };
  const show = async (sector: string, entry: number, how: "focus" | "select"): Promise<void> => {
    if (how === "select" && Date.now() < quietUntil) return;
    const mcp = readRednodeMcp();
    if (!mcp.installed || !mcp.token || !mcp.enabled) {
      quietUntil = Date.now() + 60_000;
      if (how === "select") return;
      if (!mcp.installed) return notInGame("Show in Game needs REDnode and EDGEbuilder in the game.");
      void vscode.window.showWarningMessage(`REDcode: ${rednodeHint(mcp) || "REDnode's MCP server is not ready."}`.replace("so Pack and Play can swap through it", "so Show in Game can reach EDGEbuilder"));
      return;
    }
    const r: ToolResult = await callRednodeTool({ port: mcp.port, token: mcp.token }, `edgebuilder__${how}`, { sector, entry });
    if (r.kind !== "answer") quietUntil = Date.now() + 30_000;
    if (how === "select") {
      if (r.kind === "answer") void vscode.window.setStatusBarMessage(`REDcode: EDGEbuilder picked ${name(sector)} #${entry} in the game.`, 3000);
      return;
    }
    switch (r.kind) {
      case "unreachable": {
        const pick = await vscode.window.showWarningMessage("REDcode: the game is not running with REDnode, and Show in Game goes to EDGEbuilder there.", "Run Game");
        if (pick) await vscode.commands.executeCommand("redcode.runGame");
        return;
      }
      case "unauthorized":
        void vscode.window.showWarningMessage(`REDcode: ${rednodeHint(mcp, { kind: "unauthorized" }).replace("then press Pack and Play again", "then Show in Game again")}`);
        return;
      case "refused":
        if (/not found|not in the game/i.test(r.why)) return notInGame("EDGEbuilder is not in the game, and Show in Game flies its camera there.");
        void vscode.window.showWarningMessage(`REDcode: EDGEbuilder did not show it: ${r.why}`);
        return;
      case "answer": {
        const a = (r.value ?? {}) as { focused?: boolean; streamed?: boolean; why?: string };
        if (a.focused === false) void vscode.window.showWarningMessage(`REDcode: EDGEbuilder did not show it: ${a.why ?? "no reason given"}`);
        else void vscode.window.setStatusBarMessage(`REDcode: EDGEbuilder's camera is at ${name(sector)} #${entry}${a.streamed === false ? ", not streamed in yet: it shows once the game loads it" : ""}.`, 6000);
      }
    }
  };

  // ---- EDGEbuilder offered once (Sector Tools, decision 3) ----
  const OfferedKey = "redcode.edgebuilderOffered";
  const opened = (): void => {
    if (context.globalState.get<boolean>(OfferedKey)) return;
    const gamePath = vscode.workspace.getConfiguration("redcode").get<string>("gamePath", "");
    const apps = gamePath ? rednodeAppsDir(gamePath) : undefined;
    if (!apps || fs.existsSync(path.join(apps, "edgebuilder", "rednode-app.json"))) return;
    void context.globalState.update(OfferedKey, true);
    void vscode.window
      .showInformationMessage("REDcode: EDGEbuilder, in the game, shows a sector's things in the world, and the sector view's Show in Game flies its camera to one. It is not in the game yet.", "Get EDGEbuilder")
      .then((pick) => {
        if (pick) void vscode.env.openExternal(vscode.Uri.parse(EdgebuilderNexus));
      });
  };

  return { show, opened };
}
