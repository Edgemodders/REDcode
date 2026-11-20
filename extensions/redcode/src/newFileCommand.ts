// New File... in the Project view (docs/design/new-file.md): a type, a name, the file written, selected
// and opened. What each type is and starts as is in newFile.ts.

import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import * as vscode from "vscode";
import type { BridgeClient } from "./bridgeClient";
import {
  BaseMaterials,
  NewFileTypes,
  TexturePresets,
  atlasRoot,
  checkBaseMaterial,
  checkGameName,
  checkTextName,
  cr2wJson,
  defaultTextName,
  gameFolderOf,
  gamePathFor,
  evenSize,
  hasOddSide,
  imageSize,
  materialRoot,
  resizePng,
  nameFrom,
  textFileContent,
  textFileTarget,
  withExtension,
  type NewFileType,
} from "./newFile";
import { ProjectFolders, gamePathOf, projectPathFor, type ProjectInfo } from "./project";
import type { GameFileInfo } from "./types";

export interface NewFileDeps {
  project: ProjectInfo;
  bridge: BridgeClient;
  /** Search game files as a picker; undefined when closed without a pick. */
  pickGameFile(): Promise<GameFileInfo | undefined>;
  /** Refreshes the Project view, selects the file and opens it. */
  done(file: string): Promise<void>;
  log(line: string): void;
}

const ImageExtensions = ["png", "tga", "dds", "jpg", "jpeg", "bmp", "tif", "tiff"];

type TypeRow = vscode.QuickPickItem & { type?: NewFileType };

/** New File in a folder of the Project view; dir is the folder clicked, or undefined for the project or the palette. */
export async function newFile(deps: NewFileDeps, dir?: string): Promise<void> {
  const { project } = deps;
  const folder = gameFolderOf(project, dir);
  const where = folder || project.name;
  const rows: TypeRow[] = [
    { label: "Game files", kind: vscode.QuickPickItemKind.Separator },
    ...NewFileTypes.filter((t) => t.kind !== "text").map((type): TypeRow => ({ label: type.label, description: type.ext, detail: type.detail, type })),
    { label: "Text files", kind: vscode.QuickPickItemKind.Separator },
    ...NewFileTypes.filter((t) => t.kind === "text").map((type): TypeRow => ({ label: type.label, description: type.ext, detail: type.detail, type })),
  ];
  const picked = await vscode.window.showQuickPick(rows, { title: `New File in ${where}`, placeHolder: "What kind of file?", matchOnDetail: true });
  const type = picked?.type;
  if (!type) return;

  let written: string | undefined;
  switch (type.kind) {
    case "text":
      written = await newTextFile(deps, type);
      break;
    case "texture":
      written = await textureFromImage(deps, folder, "color");
      break;
    case "copy":
      written = await fromGameFile(deps, folder);
      break;
    default:
      written = await newCr2wFile(deps, type, folder);
  }
  if (written) {
    deps.log(`New File: ${path.relative(project.dir, written)}`);
    await deps.done(written);
  }
}

/** The name box for a game file in folder; answers the file's place in source/archive. */
async function askGameName(deps: NewFileDeps, title: string, folder: string, ext: string, suggested: string, alsoTaken?: (gamePath: string) => string | undefined): Promise<string | undefined> {
  const { project } = deps;
  // At the project or a root, the name carries its folders: offer the mod's own folder.
  const value = folder ? suggested : `${nameFrom(project.modName)}\\${suggested}`;
  const stemStart = value.lastIndexOf("\\") + 1;
  const name = await vscode.window.showInputBox({
    title,
    prompt: `${folder ? `In ${folder}. ` : "Folders with \\, as in a game path. "}${ext ? `${ext} is added.` : ""}`,
    value,
    valueSelection: [stemStart, value.length],
    validateInput: (v) => {
      const bad = checkGameName(v);
      if (bad) return bad;
      const gamePath = gamePathFor(folder, withExtension(v, ext));
      if (fs.existsSync(projectPathFor(project, gamePath))) return `${gamePath} is in the project already`;
      return alsoTaken?.(gamePath);
    },
  });
  return name === undefined ? undefined : gamePathFor(folder, withExtension(name, ext));
}

async function writeCr2w(deps: NewFileDeps, gamePath: string, root: Record<string, unknown>): Promise<string> {
  const target = projectPathFor(deps.project, gamePath);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  await deps.bridge.fromJson(target, { json: cr2wJson(root) });
  if (!fs.existsSync(target)) throw new Error(`REDbridge did not write ${gamePath}`);
  return target;
}

async function newCr2wFile(deps: NewFileDeps, type: NewFileType, folder: string): Promise<string | undefined> {
  const defaults = (await deps.bridge.createInstance(type.root!)) as Record<string, unknown>;
  if (type.kind === "atlas") {
    const texture = await pickAtlasTexture(deps, folder);
    if (!texture) return undefined;
    const gamePath = await askGameName(deps, "New Ink Atlas", folder, type.ext, nameFrom(texture));
    return gamePath && writeCr2w(deps, gamePath, atlasRoot(defaults, texture));
  }
  if (type.kind === "material") {
    const base = await pickBaseMaterial();
    if (!base) return undefined;
    const gamePath = await askGameName(deps, "New Material Instance", folder, type.ext, "material");
    return gamePath && writeCr2w(deps, gamePath, materialRoot(defaults, base));
  }
  const gamePath = await askGameName(deps, `New ${type.label}`, folder, type.ext, nameFrom(type.label));
  return gamePath && writeCr2w(deps, gamePath, defaults);
}

/** The atlas's texture: a game path, from a .xbm in the project or a new one from an image. */
async function pickAtlasTexture(deps: NewFileDeps, folder: string): Promise<string | undefined> {
  const archive = path.join(deps.project.dir, ProjectFolders.archive);
  const textures = walk(archive).filter((f) => f.toLowerCase().endsWith(".xbm"));
  type Row = vscode.QuickPickItem & { gamePath?: string; fromImage?: boolean };
  const rows: Row[] = [
    { label: "$(file-media) Texture from an Image...", detail: "Imports the icon sheet the parts are cut from: usually a PNG with a transparent background", fromImage: true },
    ...(textures.length ? [{ label: "Textures in the project", kind: vscode.QuickPickItemKind.Separator } as Row] : []),
    ...textures.map((f): Row => {
      const gamePath = gamePathOf(deps.project, f)!;
      return { label: path.basename(f), description: path.dirname(gamePath), gamePath };
    }),
  ];
  const picked = await vscode.window.showQuickPick(rows, { title: "New Ink Atlas: its texture", placeHolder: "The texture the atlas's parts are cut from", matchOnDescription: true });
  if (!picked) return undefined;
  if (picked.gamePath) return picked.gamePath;
  const xbm = await textureFromImage(deps, folder, "ui");
  return xbm && gamePathOf(deps.project, xbm);
}

async function pickBaseMaterial(): Promise<string | undefined> {
  type Row = vscode.QuickPickItem & { base?: string };
  const rows: Row[] = [...BaseMaterials.map((m): Row => ({ label: path.basename(m.path), description: path.dirname(m.path), detail: m.detail, base: m.path })), { label: "$(edit) Another material...", detail: "Any .mt, .remt or .mi by its game path" }];
  const picked = await vscode.window.showQuickPick(rows, { title: "New Material Instance: its base material", placeHolder: "The material it starts from", matchOnDescription: true, matchOnDetail: true });
  if (!picked) return undefined;
  if (picked.base) return picked.base;
  const typed = await vscode.window.showInputBox({ title: "New Material Instance: its base material", prompt: "A game path, such as base\\materials\\metal_base.mt or another .mi", validateInput: checkBaseMaterial });
  return typed?.trim().split("/").join("\\").toLowerCase();
}

/** Texture from an Image: the image copied into Raw at the new game path and imported as a new .xbm. Answers the .xbm. */
async function textureFromImage(deps: NewFileDeps, folder: string, preset: string): Promise<string | undefined> {
  const { project, bridge } = deps;
  const picked = await vscode.window.showOpenDialog({ canSelectMany: false, openLabel: "Import", title: "Texture from an Image", filters: { Images: ImageExtensions } });
  const image = picked?.[0]?.fsPath;
  if (!image) return undefined;
  const imageExt = path.extname(image).toLowerCase();
  // WolvenKit will not compress an image with an odd side: say so before the import, and offer a resized
  // copy or WolvenKit's own way round.
  let uncompressed = false;
  let resizeTo: { width: number; height: number } | undefined;
  const size = imageSize(fs.readFileSync(image), imageExt);
  if (size && hasOddSide(size)) {
    const to = evenSize(size);
    const change = [to.width !== size.width ? "narrower" : "", to.height !== size.height ? "shorter" : ""].filter(Boolean).join(" and ");
    const grows = to.width > size.width || to.height > size.height;
    const resize = `Resize to ${to.width} × ${to.height}`;
    const choice = await vscode.window.showWarningMessage(
      `${path.basename(image)} is ${size.width} × ${size.height} pixels. WolvenKit compresses a texture only when both sides are even numbers.`,
      {
        modal: true,
        detail: [
          `${resize}: REDcode scales a copy to ${to.width} × ${to.height} pixels (${grows ? "a 1-pixel side becomes 2" : `one pixel ${change}`}) and imports that copy, saved in Raw as a PNG. Your image is not changed.`,
          "Import Uncompressed: the texture keeps its size, with compression TCM_None. It is several times larger, and WolvenKit calls this at your own risk.",
          "Or cancel and resize the image yourself: powers of two such as 1024 or 2048 suit the game best.",
        ].join("\n\n"),
      },
      resize,
      "Import Uncompressed",
    );
    if (choice === resize) resizeTo = to;
    else if (choice === "Import Uncompressed") uncompressed = true;
    else return undefined;
  }
  type Row = vscode.QuickPickItem & { setup: (typeof TexturePresets)[number]["setup"] };
  const rows = TexturePresets.map((p): Row => ({ label: p.label, detail: p.detail, setup: p.setup, picked: p.id === preset }));
  const ordered = [...rows.filter((r) => r.picked), ...rows.filter((r) => !r.picked)].map((r) => ({ ...r, picked: undefined }));
  const how = resizeTo ? `, resized to ${resizeTo.width} × ${resizeTo.height}` : uncompressed ? ", uncompressed" : "";
  const setupRow = await vscode.window.showQuickPick(ordered, { title: `Texture from ${path.basename(image)}${how}`, placeHolder: "What the texture is for" });
  if (!setupRow) return undefined;
  const setup = uncompressed ? { ...setupRow.setup, compression: "TCM_None" } : setupRow.setup;
  // A resized copy is always a PNG, whatever the image was.
  const rawExt = resizeTo ? ".png" : imageExt;
  const rawOf = (gamePath: string) => path.join(project.dir, ProjectFolders.raw, ...gamePath.replace(/\.xbm$/, rawExt).split("\\"));
  const gamePath = await askGameName(deps, `Texture from ${path.basename(image)}`, folder, ".xbm", nameFrom(image), (g) => {
    const raw = rawOf(g);
    // A resized copy never overwrites the image itself, even when the image is in Raw at that path.
    const isImage = path.resolve(raw).toLowerCase() === path.resolve(image).toLowerCase();
    return fs.existsSync(raw) && (resizeTo || !isImage) ? `Raw has ${path.basename(raw)} there already` : undefined;
  });
  if (!gamePath) return undefined;
  const raw = rawOf(gamePath);
  const copied = path.resolve(raw).toLowerCase() !== path.resolve(image).toLowerCase();
  if (resizeTo) {
    // Another kind of image comes to PNG through REDbridge (WolvenKit reads it), then is scaled here.
    let pngBytes: Buffer;
    if (imageExt === ".png") {
      pngBytes = fs.readFileSync(image);
    } else {
      const tmp = path.join(os.tmpdir(), `redcode-newfile-${process.pid}-${Date.now()}.png`);
      try {
        await bridge.imageToPng(image, tmp);
        pngBytes = fs.readFileSync(tmp);
      } finally {
        fs.rmSync(tmp, { force: true });
      }
    }
    fs.mkdirSync(path.dirname(raw), { recursive: true });
    fs.writeFileSync(raw, resizePng(pngBytes, resizeTo.width, resizeTo.height));
  } else if (copied) {
    fs.mkdirSync(path.dirname(raw), { recursive: true });
    fs.copyFileSync(image, raw);
  }
  const archiveDir = path.join(project.dir, ProjectFolders.archive);
  const xbm = projectPathFor(project, gamePath);
  let r: Awaited<ReturnType<BridgeClient["importFile"]>> | undefined;
  try {
    r = await vscode.window.withProgress({ location: vscode.ProgressLocation.Notification, title: `Importing ${path.basename(image)}` }, () =>
      bridge.importFile(raw, path.join(project.dir, ProjectFolders.raw), archiveDir, false, undefined, setup),
    );
  } finally {
    // A failed import leaves nothing behind, so the same name can be tried again.
    if (!fs.existsSync(xbm) && copied) fs.rmSync(raw, { force: true });
  }
  if (!fs.existsSync(xbm)) throw new Error(`WolvenKit's import wrote no texture at ${gamePath}${r?.written.length ? ` (it wrote ${r.written.join(", ")})` : ""}. Its reason is in the REDcode log.`);
  deps.log(`New File: imported ${path.relative(project.dir, raw)} as ${gamePath} (${setupRow.label}${how})`);
  return xbm;
}

/** Start from a Game File: Search game files, then the pick copied here under the new name. */
async function fromGameFile(deps: NewFileDeps, folder: string): Promise<string | undefined> {
  const file = await deps.pickGameFile();
  if (!file) return undefined;
  const ext = path.extname(file.name).toLowerCase();
  const gamePath = await askGameName(deps, `Start from ${path.basename(file.name)}`, folder, ext, nameFrom(file.name));
  if (!gamePath) return undefined;
  const target = projectPathFor(deps.project, gamePath);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  await deps.bridge.extract(file.name, target);
  if (!fs.existsSync(target)) throw new Error(`${file.name} could not be copied`);
  deps.log(`New File: ${gamePath} from the game's ${file.name}`);
  return target;
}

async function newTextFile(deps: NewFileDeps, type: NewFileType): Promise<string | undefined> {
  const { project } = deps;
  const where = path.dirname(path.relative(project.dir, textFileTarget(project, type, "x")));
  const name = await vscode.window.showInputBox({
    title: `New ${type.label} file`,
    prompt: `In ${where}. ${type.ext} is added.`,
    value: defaultTextName(project),
    validateInput: (v) => checkTextName(v) ?? (fs.existsSync(textFileTarget(project, type, withExtension(v, type.ext))) ? "A file of that name is there already" : undefined),
  });
  if (name === undefined) return undefined;
  const target = textFileTarget(project, type, withExtension(name, type.ext));
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, textFileContent(type, project), { flag: "wx" });
  return target;
}

function walk(dir: string): string[] {
  const out: string[] = [];
  const pending = [dir];
  while (pending.length) {
    const d = pending.pop()!;
    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(d, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const e of entries) (e.isDirectory() ? pending : out).push(path.join(d, e.name));
  }
  return out.sort();
}
