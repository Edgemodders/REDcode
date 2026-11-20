// New File (docs/design/new-file.md): the types REDcode makes from nothing, where each goes, the name
// check and what each starts as. No VS Code imports, so the unit checks and a later MCP tool use it.

import * as path from "node:path";
import { ProjectFolders, type ProjectInfo } from "./project";
import type { TextureSetup } from "./types";

export type NewFileKind = "texture" | "atlas" | "material" | "empty" | "copy" | "text";

export interface NewFileType {
  id: string;
  label: string;
  /** The extension written, with its dot; "" for Start from a Game File, which keeps the picked file's. */
  ext: string;
  kind: NewFileKind;
  /** The root class, for the CR2W types. */
  root?: string;
  /** One line on what it starts as, for the picker. */
  detail: string;
  /** Text files only: their folder under source/resources, {mod} for the mod's name. */
  folder?: string;
}

export const NewFileTypes: readonly NewFileType[] = [
  { id: "texture", label: "Texture from an Image...", ext: ".xbm", kind: "texture", detail: "Picks a PNG, TGA or DDS and imports it as a new texture" },
  { id: "atlas", label: "Ink Atlas", ext: ".inkatlas", kind: "atlas", root: "inkTextureAtlas", detail: "Asks for its texture; starts with one part, whole, covering it" },
  { id: "material", label: "Material Instance", ext: ".mi", kind: "material", root: "CMaterialInstance", detail: "Asks for its base material" },
  { id: "entity", label: "Entity", ext: ".ent", kind: "empty", root: "entEntityTemplate", detail: "Empty, as in WolvenKit" },
  { id: "appearance", label: "Appearance", ext: ".app", kind: "empty", root: "appearanceAppearanceResource", detail: "Empty, as in WolvenKit" },
  { id: "mlsetup", label: "Multilayer Setup", ext: ".mlsetup", kind: "empty", root: "Multilayer_Setup", detail: "Empty, as in WolvenKit" },
  { id: "copy", label: "Start from a Game File...", ext: "", kind: "copy", detail: "Searches the game, then copies the file here under the new name" },
  { id: "tweakxl", label: "TweakXL", ext: ".yaml", kind: "text", folder: "r6\\tweaks\\{mod}", detail: "A blank tweak file in r6\\tweaks" },
  { id: "archivexl", label: "ArchiveXL", ext: ".archive.xl", kind: "text", folder: "", detail: "A blank .xl file, packed beside the archive" },
  { id: "redscript", label: "Redscript", ext: ".reds", kind: "text", folder: "r6\\scripts\\{mod}", detail: "A blank script in r6\\scripts" },
];

export const newFileType = (id: string): NewFileType | undefined => NewFileTypes.find((t) => t.id === id);

/** Texture setups, read from game textures on game 2.5 (2026-11-20): a garment's _d01 and _n01, a mask's _m01 and a UI atlas texture. */
export const TexturePresets: readonly { id: string; label: string; detail: string; setup: TextureSetup }[] = [
  { id: "color", label: "Color", detail: "Diffuse and other colour textures (TEXG_Generic_Color)", setup: { group: "TEXG_Generic_Color", compression: "TCM_QualityColor", rawFormat: "TRF_TrueColor", isGamma: true, hasMipchain: true, isStreamable: true } },
  { id: "normal", label: "Normal map", detail: "TEXG_Generic_Normal, not gamma", setup: { group: "TEXG_Generic_Normal", compression: "TCM_Normalmap", rawFormat: "TRF_TrueColor", isGamma: false, hasMipchain: true, isStreamable: true } },
  { id: "mask", label: "Mask", detail: "One channel, such as an .mlmask layer or roughness (TEXG_Generic_Grayscale)", setup: { group: "TEXG_Generic_Grayscale", compression: "TCM_QualityR", rawFormat: "TRF_TrueColor", isGamma: false, hasMipchain: true, isStreamable: true } },
  { id: "ui", label: "UI", detail: "Icons and ink atlas textures: no mips, not streamed (TEXG_Generic_UI)", setup: { group: "TEXG_Generic_UI", compression: "TCM_QualityColor", rawFormat: "TRF_TrueColor", isGamma: true, hasMipchain: false, isStreamable: false } },
];

/**
 * An image's size from its header, for PNG, JPEG, TGA, DDS and BMP; undefined for other kinds or a header it
 * cannot read. WolvenKit refuses to compress an image with an odd side, so New File asks before the import.
 */
export function imageSize(bytes: Uint8Array, ext: string): { width: number; height: number } | undefined {
  const b = Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const e = ext.toLowerCase().replace(/^\./, "");
  try {
    if (e === "png" && b.length >= 24 && b.readUInt32BE(0) === 0x89504e47 && b.toString("latin1", 12, 16) === "IHDR") return { width: b.readUInt32BE(16), height: b.readUInt32BE(20) };
    if (e === "dds" && b.length >= 20 && b.toString("latin1", 0, 4) === "DDS ") return { width: b.readUInt32LE(16), height: b.readUInt32LE(12) };
    if (e === "bmp" && b.length >= 26 && b.toString("latin1", 0, 2) === "BM") return { width: Math.abs(b.readInt32LE(18)), height: Math.abs(b.readInt32LE(22)) };
    if (e === "tga" && b.length >= 18) return { width: b.readUInt16LE(12), height: b.readUInt16LE(14) };
    if ((e === "jpg" || e === "jpeg") && b.length >= 4 && b[0] === 0xff && b[1] === 0xd8) {
      // Walk the segments to the frame header (SOF0 to SOF15, but DHT C4, JPG C8 and DAC CC): height, then width.
      let i = 2;
      while (i + 9 < b.length) {
        if (b[i] !== 0xff) return undefined;
        const marker = b[i + 1];
        if (marker === 0xff) {
          i++;
          continue;
        }
        if (marker === 0xd8 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) {
          i += 2;
          continue;
        }
        if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) return { width: b.readUInt16BE(i + 7), height: b.readUInt16BE(i + 5) };
        if (marker === 0xd9 || marker === 0xda) return undefined;
        i += 2 + b.readUInt16BE(i + 2);
      }
      return undefined;
    }
  } catch {
    return undefined;
  }
  return undefined;
}

/** Whether WolvenKit would refuse to compress an image of this size. */
export const hasOddSide = (size: { width: number; height: number }) => size.width % 2 === 1 || size.height % 2 === 1;

/** The size Resize offers: each odd side one pixel shorter, so the picture is scaled as little as it can be (a 1-pixel side becomes 2). */
export function evenSize(size: { width: number; height: number }): { width: number; height: number } {
  const even = (n: number) => (n % 2 === 0 ? n : n === 1 ? 2 : n - 1);
  return { width: even(size.width), height: even(size.height) };
}

export interface Rgba {
  width: number;
  height: number;
  /** Four bytes a pixel, rows top to bottom. */
  data: Uint8Array;
}

/** Scales RGBA pixels to a new size, bilinear, sampling at pixel centres, every channel alpha included. */
export function resizeRgba(src: Rgba, width: number, height: number): Rgba {
  const out = new Uint8Array(width * height * 4);
  const sx = src.width / width;
  const sy = src.height / height;
  for (let y = 0; y < height; y++) {
    const fy = Math.min(Math.max((y + 0.5) * sy - 0.5, 0), src.height - 1);
    const y0 = Math.floor(fy);
    const y1 = Math.min(y0 + 1, src.height - 1);
    const ty = fy - y0;
    for (let x = 0; x < width; x++) {
      const fx = Math.min(Math.max((x + 0.5) * sx - 0.5, 0), src.width - 1);
      const x0 = Math.floor(fx);
      const x1 = Math.min(x0 + 1, src.width - 1);
      const tx = fx - x0;
      const a = (y0 * src.width + x0) * 4;
      const b = (y0 * src.width + x1) * 4;
      const c = (y1 * src.width + x0) * 4;
      const d = (y1 * src.width + x1) * 4;
      const o = (y * width + x) * 4;
      for (let k = 0; k < 4; k++) {
        const top = src.data[a + k] + (src.data[b + k] - src.data[a + k]) * tx;
        const bottom = src.data[c + k] + (src.data[d + k] - src.data[c + k]) * tx;
        out[o + k] = Math.round(top + (bottom - top) * ty);
      }
    }
  }
  return { width, height, data: out };
}

interface PngModule {
  PNG: { sync: { read(bytes: Buffer): Rgba; write(png: Rgba): Buffer }; new (options: { width: number; height: number }): Rgba };
}
// pngjs has no types of its own; this is the part New File uses.
const pngjs = (): PngModule => require("pngjs") as PngModule;

/** A PNG file's bytes scaled to a new size, as PNG bytes. */
export function resizePng(bytes: Buffer, width: number, height: number): Buffer {
  const { PNG } = pngjs();
  const src = PNG.sync.read(bytes);
  const scaled = resizeRgba(src, width, height);
  const png = new PNG({ width, height });
  png.data.set(scaled.data);
  return PNG.sync.write(png);
}

/** Base materials, the ones game .mi files name most (a sample of 250 on game 2.5, 2026-11-20). */
export const BaseMaterials: readonly { path: string; detail: string }[] = [
  { path: "engine\\materials\\multilayered.mt", detail: "Layers from an .mlsetup and an .mlmask: most clothing, weapons and vehicles" },
  { path: "engine\\materials\\metal_base.remt", detail: "One surface from its own textures" },
  { path: "base\\materials\\mesh_decal.mt", detail: "A decal on a mesh" },
  { path: "base\\materials\\decal_normal_roughness_metalness_2.mt", detail: "A world decal with normal, roughness and metalness" },
  { path: "base\\materials\\decal_gradientmap_recolor.mt", detail: "A world decal recoloured by a gradient" },
  { path: "base\\materials\\glass_onesided.mt", detail: "Glass" },
  { path: "base\\fx\\shaders\\signages.mt", detail: "Signs and screens" },
];

/** Why a name cannot be a game file's, or undefined when it can. Folders may be given with \ or /. */
export function checkGameName(name: string): string | undefined {
  const n = name.trim();
  if (!n) return "Type a name";
  if (/\s/.test(n)) return "No spaces: the game finds a file by a hash of its exact path. Use _ instead";
  if (/[A-Z]/.test(n)) return "Lowercase only: the game finds a file by a hash of its exact path";
  const parts = n.split(/[\\/]/);
  for (const p of parts) {
    if (!p) return "A folder name is empty";
    if (p === "." || p === "..") return "No . or .. folders";
    if (!/^[a-z0-9_.\-]+$/.test(p)) return "Use only a to z, 0 to 9, _, - and .";
    if (p.startsWith(".") || p.endsWith(".")) return "A name cannot start or end with a dot";
  }
  return undefined;
}

/** Why a name cannot be a text file's, or undefined when it can. One file name, no folders. */
export function checkTextName(name: string): string | undefined {
  const n = name.trim();
  if (!n) return "Type a name";
  if (!/^[A-Za-z0-9_.\-]+$/.test(n)) return "Use only letters, digits, _, - and .";
  if (n.startsWith(".") || n.endsWith(".")) return "A name cannot start or end with a dot";
  return undefined;
}

/** The name as typed, with the type's extension added unless it is there already. Slashes become backslashes. */
export function withExtension(name: string, ext: string): string {
  const n = name.trim().split("/").join("\\");
  return ext && !n.toLowerCase().endsWith(ext) ? n + ext : n;
}

/** The folder a game file goes in: the clicked folder's game path under source/archive, or under source/raw, which mirrors it; "" for the project, a root or anything else. */
export function gameFolderOf(project: ProjectInfo, dir: string | undefined): string {
  if (!dir) return "";
  const full = path.resolve(dir);
  for (const key of ["archive", "raw"] as const) {
    const root = path.resolve(project.dir, ProjectFolders[key]);
    if (full.toLowerCase() === root.toLowerCase()) return "";
    if (full.toLowerCase().startsWith(root.toLowerCase() + path.sep)) return full.slice(root.length + 1).split(path.sep).join("\\");
  }
  return "";
}

/** A game file's game path: the folder and the name joined with \, lowercase. */
export function gamePathFor(folder: string, name: string): string {
  return (folder ? `${folder}\\${name}` : name).toLowerCase();
}

/** Where a text file goes: source/resources/<its folder>/<name>. */
export function textFileTarget(project: ProjectInfo, type: NewFileType, file: string): string {
  const folder = (type.folder ?? "").split("{mod}").join(project.modName);
  return path.join(project.dir, ProjectFolders.resources, ...folder.split("\\").filter(Boolean), file);
}

/** What a text file starts as: one comment line saying what it is. */
export function textFileContent(type: NewFileType, project: ProjectInfo): string {
  switch (type.id) {
    case "tweakxl":
      return `# TweakXL tweaks for ${project.modName}: https://github.com/psiberx/cp2077-tweak-xl/wiki\n`;
    case "archivexl":
      return `# ArchiveXL for ${project.modName}: https://github.com/psiberx/cp2077-archive-xl/wiki\n`;
    case "redscript":
      return `// Redscript for ${project.modName}: https://wiki.redmodding.org/redscript\n`;
    default:
      return "";
  }
}

/** The name a text file is offered first: the mod's name, as WolvenKit names its .archive.xl. */
export const defaultTextName = (project: ProjectInfo) => project.modName.replace(/[^A-Za-z0-9_.\-]/g, "_") || "mod";

/** A game path as a name for a new file: its stem, lowercase, with what a game path cannot hold turned into _. */
export function nameFrom(file: string): string {
  const base = path.basename(file.split("\\").join("/")).replace(/\.[^.]*$/, "");
  return base.toLowerCase().replace(/[^a-z0-9_.\-]+/g, "_").replace(/^[._]+|[._]+$/g, "") || "new_file";
}

type Json = Record<string, unknown>;

/** The WolvenKit JSON of a CR2W file with this root, as REDbridge's cr2w.fromJson takes it; written for the PC like the game's own files. */
export function cr2wJson(root: Json): string {
  const rootChunk = { ...root, cookingPlatform: "PLATFORM_PC" };
  return JSON.stringify({ Header: { WKitJsonVersion: "0.0.9", GameVersion: 2500, DataType: "CR2W" }, Data: { Version: 195, BuildVersion: 0, RootChunk: rootChunk, EmbeddedFiles: [] } });
}

const cname = (value: string) => ({ $type: "CName", $storage: "string", $value: value });
const resourcePath = (value: string) => ({ $type: "ResourcePath", $storage: "string", $value: value });

/** An inkTextureAtlas from REDbridge's defaults with its texture in slot 0 and one part, whole, covering it (game atlases keep the pixel rectangle at zero). */
export function atlasRoot(defaults: Json, texture: string): Json {
  const slots = (defaults.slots as { Elements?: Json[] } | undefined)?.Elements ?? [];
  const first: Json = {
    ...(slots[0] ?? { $type: "inkTextureSlot", slices: [] }),
    texture: { DepotPath: resourcePath(texture), Flags: "Soft" },
    parts: [
      {
        $type: "inkTextureAtlasMapper",
        clippingRectInPixels: { $type: "Rect", bottom: 0, left: 0, right: 0, top: 0 },
        clippingRectInUVCoords: { $type: "RectF", Bottom: 1, Left: 0, Right: 1, Top: 0 },
        partName: cname("whole"),
      },
    ],
  };
  return { ...defaults, slots: { ...(defaults.slots as Json), Elements: [first, ...slots.slice(1)] } };
}

/** A CMaterialInstance from REDbridge's defaults on a base material. */
export function materialRoot(defaults: Json, baseMaterial: string): Json {
  return { ...defaults, baseMaterial: { DepotPath: resourcePath(baseMaterial), Flags: "Default" } };
}

/** Why a path cannot be a base material, or undefined when it can. */
export function checkBaseMaterial(p: string): string | undefined {
  const n = p.trim();
  if (!n) return "Type a game path";
  if (!/\.(mt|remt|mi)$/i.test(n)) return "A base material is an .mt, .remt or .mi file";
  return checkGameName(n);
}
