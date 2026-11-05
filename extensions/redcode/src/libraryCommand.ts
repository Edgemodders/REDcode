// Add to Library's VS Code side: where the Library goes, the folder picker with Use the game path, and
// the answer. The item itself is library.ts (REDcode issue #19).

import * as path from "node:path";
import * as vscode from "vscode";
import type { BridgeClient } from "./bridgeClient";
import { gameVersionOf, isInside, itemFolder, itemName, libraryConfigFile, libraryFolders, planAsset, readLibraryRoot, safeFolder, suggestedLibraryRoot, writeAsset, writeLibraryRoot, type AssetSource } from "./library";

const LastFolder = "redcode.library.lastFolder";
const UseGamePath = "redcode.library.useGamePath";
/** Past this many files, Add to Library asks first. */
const AskPast = 200;

/** Where the Library is, asking the first time, as the Library's rules say the first tool to need it does. */
async function libraryRoot(gameDir: string | null): Promise<string | undefined> {
  const known = readLibraryRoot();
  if (known) return known;
  const suggested = suggestedLibraryRoot();
  const choice = await vscode.window.showQuickPick(
    [
      { label: suggested, description: "Suggested" },
      { label: "$(folder-opened) Choose a Folder...", choose: true },
    ],
    { title: "Where should the EDGE Library go?", placeHolder: "One folder that every EDGE tool shares. Relocate can move it later." },
  );
  if (!choice) return undefined;
  let root = choice.label;
  if ("choose" in choice) {
    const picked = await vscode.window.showOpenDialog({ canSelectFiles: false, canSelectFolders: true, canSelectMany: false, openLabel: "Use for the EDGE Library", title: "Where should the EDGE Library go?" });
    if (!picked?.[0]) return undefined;
    root = picked[0].fsPath;
  }
  if (gameDir && isInside(path.resolve(root), gameDir)) {
    void vscode.window.showErrorMessage("REDcode: the EDGE Library cannot be inside the game's folder: deploys must never touch it.");
    return undefined;
  }
  return writeLibraryRoot(root);
}

interface FolderItem extends vscode.QuickPickItem {
  folder?: string;
  action?: "toggle" | "new";
}

/** Picks a Library folder, offering the last one, with New Folder... and the Use the game path switch. */
function pickFolder(context: vscode.ExtensionContext, root: string, main: string): Promise<{ folder: string; gamePath: boolean } | undefined> {
  const last = context.globalState.get<string>(LastFolder);
  let gamePath = context.globalState.get<boolean>(UseGamePath) ?? false;
  const folders = libraryFolders(root);
  const gameFolders = main.split("\\").slice(0, -1).join("\\");
  const qp = vscode.window.createQuickPick<FolderItem>();
  qp.title = `Add to Library: ${itemName(main)}`;
  qp.matchOnDescription = true;

  const rows = (): FolderItem[] => {
    const row = (folder: string): FolderItem => ({
      label: folder ? `$(folder) ${folder}` : `$(root-folder) The Library's root`,
      description: folder === last ? "Last used" : folder ? undefined : root,
      folder,
    });
    const order = ["", ...folders].sort((a, b) => Number(b === last) - Number(a === last));
    return [
      {
        label: `${gamePath ? "$(pass-filled)" : "$(circle-large-outline)"} Use the game path`,
        description: gamePath ? "On" : "Off",
        detail: gamePath ? `The item goes in ${gameFolders}, under the folder you pick. Select to turn off.` : "Select to put the item in its game folders under the folder you pick, so the Library browses like the game's files.",
        action: "toggle",
      },
      { label: "", kind: vscode.QuickPickItemKind.Separator },
      ...order.map(row),
      { label: "$(new-folder) New Folder...", action: "new", alwaysShow: true },
    ];
  };
  const show = (): void => {
    qp.items = rows();
    qp.placeholder = gamePath ? `Pick the folder above ${gameFolders}` : "Pick a Library folder";
    const first = qp.items.find((i) => i.folder === (last ?? ""));
    if (first) qp.activeItems = [first];
  };
  show();

  return new Promise((resolve) => {
    let done = false;
    const finish = (r: { folder: string; gamePath: boolean } | undefined): void => {
      done = true;
      resolve(r);
      qp.dispose();
    };
    qp.onDidAccept(async () => {
      const item = qp.activeItems[0];
      if (!item) return;
      if (item.action === "toggle") {
        gamePath = !gamePath;
        show();
      } else if (item.action === "new") {
        // Hiding the picker for the input box is not a cancel.
        done = true;
        qp.hide();
        const name = await vscode.window.showInputBox({
          title: "New Library folder",
          prompt: `Under ${root}. Use / for folders inside folders, as in Production/Meshes.`,
          validateInput: (v) => {
            try {
              return safeFolder(v) ? undefined : "Type a folder name.";
            } catch (e) {
              return e instanceof Error ? e.message : String(e);
            }
          },
        });
        finish(name === undefined ? undefined : { folder: safeFolder(name), gamePath });
      } else {
        finish({ folder: item.folder ?? "", gamePath });
      }
    });
    qp.onDidHide(() => {
      if (!done) finish(undefined);
    });
    qp.show();
  });
}

/** Add to Library on a file in Game Assets or the Project view. */
export async function addToLibrary(b: BridgeClient, source: AssetSource, context: vscode.ExtensionContext, log: vscode.OutputChannel): Promise<void> {
  const info = await b.info();
  const root = await libraryRoot(info.gameDir);
  if (!root) return;
  const picked = await pickFolder(context, root, source.path);
  if (!picked) return;

  const name = itemName(source.path);
  const place = itemFolder(root, picked.folder, source.path, picked.gamePath);
  let ifExists: "stop" | "replace" | "another" = "stop";
  if (await vscode.workspace.fs.stat(vscode.Uri.file(place)).then(() => true, () => false)) {
    const replace = "Replace It";
    const another = "Add Another";
    const answer = await vscode.window.showWarningMessage(
      `${name} is already in this Library folder.`,
      { modal: true, detail: "Replace It takes a new copy from the source and raises the item's version, keeping its id. Anything changed in the item since, such as EDGEfab's work, is lost.\n\nAdd Another makes a second item beside it." },
      replace,
      another,
    );
    if (!answer) return;
    ifExists = answer === replace ? "replace" : "another";
  }

  const result = await vscode.window.withProgress({ location: vscode.ProgressLocation.Notification, title: `Adding ${name} to the Library` }, async (progress) => {
    progress.report({ message: "finding the files it needs" });
    const plan = await planAsset(b, source);
    if (plan.take.length > AskPast) {
      const ok = await vscode.window.showWarningMessage(`${name} needs ${plan.take.length.toLocaleString()} files. Add them all to the Library?`, { modal: true }, "Add");
      if (ok !== "Add") return undefined;
    }
    progress.report({ message: `copying ${plan.take.length.toLocaleString()} files` });
    return writeAsset(b, source, plan, {
      root,
      folder: picked.folder,
      gamePathFolders: picked.gamePath,
      ifExists,
      tool: `REDcode ${context.extension.packageJSON.version as string}`,
      gameVersion: await gameVersionOf(info.gameDir),
      gameDir: info.gameDir,
    });
  });
  if (!result) return;
  await context.globalState.update(LastFolder, picked.folder);
  await context.globalState.update(UseGamePath, picked.gamePath);

  log.appendLine(`Add to Library: ${result.item}: version ${result.version}, ${result.files} file(s), ${result.bytes.toLocaleString()} bytes, Library in ${libraryConfigFile()}`);
  for (const [what, list] of [["Stays in the game", result.stay], ["Not in the game", result.missing], ["Could not read", result.unread], ["Not a game path", result.badPaths]] as const) {
    for (const p of list) log.appendLine(`  ${what}: ${p}`);
  }
  if (result.unnamed) log.appendLine(`  ${result.unnamed} resource(s) have no name, only a hash, and were not followed.`);

  const notes = [
    `${result.files.toLocaleString()} file(s) copied`,
    result.stay.length ? `${result.stay.length.toLocaleString()} stay in the game` : "",
    result.missing.length ? `${result.missing.length} it names are not in the game` : "",
  ].filter(Boolean);
  const warn = result.unread.length + result.badPaths.length + result.unnamed > 0 ? " Some files could not be followed: see the log." : "";
  const long = result.longPaths ? ` ${result.longPaths} path(s) are past Windows' old limit of 259 characters, which Explorer and some tools refuse: a shorter Library folder or leaving Use the game path off avoids that.` : "";
  const shown = "Show in Explorer";
  const say = warn || long ? vscode.window.showWarningMessage : vscode.window.showInformationMessage;
  const pick = await say(`Added ${result.relative} to the Library: ${notes.join(", ")}.${warn}${long}`, shown);
  if (pick === shown) await vscode.commands.executeCommand("revealFileInOS", vscode.Uri.file(path.join(result.item, "asset.json")));
}
