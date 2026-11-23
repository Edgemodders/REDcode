// REDbridge as an MCP server. Spawns the bridge and exposes its JSON-RPC methods as tools over stdio,
// so an assistant can browse the archives, convert files, and edit CR2W files through document sessions.
//
//   redcode-mcp [--bridge <REDbridge.exe or its folder>] [--game <Cyberpunk 2077 folder>] [--dotnet-root <dir>]
//
// Each option also reads an environment variable (REDBRIDGE_EXE, REDCODE_GAME_PATH, DOTNET_ROOT) and,
// failing both, the VS Code settings redcode.bridgePath and redcode.gamePath, so on a machine where
// REDcode is set up the server needs no configuration. stdout is the MCP channel; logs go to stderr.

import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { McpServer, type ToolCallback } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { z, type ZodRawShape } from "zod";
import { audioFormat, GameSoundIndex, opusSound, parseOpusInfo, wwiseHash, type OpusIndex } from "../../../extensions/redcode/src/audio";
import { BridgeClient, KeyAccess } from "../../../extensions/redcode/src/bridgeClient";
import * as anim from "../../anim-core/src/index";
import { gameVersionOf, isInside, libraryFolders, planAsset, readLibraryRoot, suggestedLibraryRoot, writeAsset, writeLibraryRoot, type AssetSource } from "../../../extensions/redcode/src/library";
import { gameStatus, startGame, stopGame } from "../../../extensions/redcode/src/gameRun";
import { findProject, gamePathOf } from "../../../extensions/redcode/src/project";
import type { PatchOp } from "../../../extensions/redcode/src/types";
import { projectStateFile } from "../../../extensions/redcode/src/rednodeService";
import { changeToOp, describeChange, sectorNodes, type NodeChange, type SectorNode } from "../../../extensions/redcode/src/sectorNodes";
import { listScripts, myScriptsDir, projectScriptsDir, runScript, type ScriptPlace } from "../../../extensions/redcode/src/sectorScripts";

// The package version, set by esbuild from package.json.
declare const __VERSION__: string;
const Version = __VERSION__;

// ---- configuration ---------------------------------------------------------------------------

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(name);
  return i >= 0 ? process.argv[i + 1] || undefined : undefined;
}

/** An environment variable; empty counts as unset, since a plugin passes an unset option as an empty variable. */
function env(name: string): string | undefined {
  return process.env[name]?.trim() || undefined;
}

/** A value from VS Code's user settings, read tolerantly (the file may hold comments and trailing commas). */
function vscodeSetting(key: string): string | undefined {
  const base = process.platform === "win32" ? process.env.APPDATA : process.platform === "darwin" ? path.join(process.env.HOME ?? "", "Library/Application Support") : path.join(process.env.HOME ?? "", ".config");
  if (!base) return undefined;
  const file = path.join(base, "Code", "User", "settings.json");
  try {
    const text = fs.readFileSync(file, "utf8");
    const match = text.match(new RegExp(`"${key.replace(/\./g, "\\.")}"\\s*:\\s*"((?:[^"\\\\]|\\\\.)*)"`));
    return match ? JSON.parse(`"${match[1]}"`) || undefined : undefined;
  } catch {
    return undefined;
  }
}

function resolveBridgeExe(): string {
  let exe = arg("--bridge") ?? env("REDBRIDGE_EXE") ?? vscodeSetting("redcode.bridgePath") ?? "REDbridge.exe";
  if (exe && fs.existsSync(exe) && fs.statSync(exe).isDirectory()) {
    exe = path.join(exe, "REDbridge.exe");
  }
  return exe;
}

const config = {
  exe: resolveBridgeExe(),
  gamePath: arg("--game") ?? env("REDCODE_GAME_PATH") ?? vscodeSetting("redcode.gamePath"),
  dotnetRoot: arg("--dotnet-root") ?? env("DOTNET_ROOT") ?? vscodeSetting("redcode.dotnetRoot") ?? undefined,
};

const log = (line: string) => process.stderr.write(`[redcode-mcp] ${line}\n`);

// ---- the bridge, started on first use ----------------------------------------------------------

let bridge: BridgeClient | undefined;
let starting: Promise<BridgeClient> | undefined;

async function getBridge(): Promise<BridgeClient> {
  if (bridge?.running) return bridge;
  if (starting) return starting;
  starting = (async () => {
    // --keys: the anim_* tools read the Uthana key from the shared store when the environment has none (REDcode's
    // docs/design/keys.md: MCP servers read the store through REDbridge). request() still refuses keys.*.
    const b = new BridgeClient({ exe: config.exe, gamePath: config.gamePath, dotnetRoot: config.dotnetRoot, keys: true });
    b.on("log", (line) => log(`bridge | ${line}`));
    b.on("exit", (code) => {
      log(`bridge exited with ${code}; it restarts on the next call, and open document sessions are gone`);
      bridge = undefined;
    });
    b.on("error", (e) => log(`bridge error: ${e.message}`));
    log(`starting ${config.exe}${config.gamePath ? ` with game ${config.gamePath}` : ""}`);
    b.start();
    const info = await b.info();
    if (!info.gameLoaded) {
      log("no game loaded: set --game, REDCODE_GAME_PATH or the VS Code setting redcode.gamePath");
    }
    bridge = b;
    return b;
  })().finally(() => {
    starting = undefined;
  });
  return starting;
}

// ---- tools -------------------------------------------------------------------------------------

const server = new McpServer({ name: "redcode", version: Version });

/** Registers a tool whose handler returns JSON; errors come back as isError results with the bridge's message. */
function tool<T extends ZodRawShape>(name: string, description: string, shape: T, run: (args: z.infer<z.ZodObject<T>>, b: BridgeClient) => Promise<unknown>): void {
  const callback = async (args: z.infer<z.ZodObject<T>>): Promise<CallToolResult> => {
    try {
      const b = await getBridge();
      const result = await run(args, b);
      return { content: [{ type: "text", text: typeof result === "string" ? result : JSON.stringify(result, null, 2) }] };
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      log(`${name}: ${message}`);
      return { isError: true, content: [{ type: "text", text: message }] };
    }
  };
  // The SDK types the callback through a conditional on the shape, which stays unresolved for a
  // generic T; the runtime contract is the same, so the cast only settles the types.
  server.registerTool(name, { description, inputSchema: shape }, callback as unknown as ToolCallback<T>);
}

const PathRules = `Paths are dotted from the root chunk and match WolvenKit's JSON: property names, array indices, "Data" under a handle or a buffer, "Chunks" under a package (for example components.3.name, compiledData.Data.Chunks.1.radius, root.Data.entries.41023.femaleVariant).`;
const FormatRules = `Three rules of the file format: numbers are 32-bit floats (0.22 is stored as 0.219999999); in .ent and .app files compiledData is rebuilt from components when the file is saved, so edit components, never compiledData; properties at their default value are not stored. Values are in WolvenKit JSON form, the same as cr2w_to_json shows; a CName may be given as a plain string.`;

const PatchOpSchema = z.object({
  op: z.enum(["replace", "add", "remove", "move"]),
  path: z.string().describe("Dotted path. For add on an array, end with .- to append or .N to insert at N."),
  value: z.unknown().optional().describe("For replace and add: the value in WolvenKit JSON form."),
  from: z.string().optional().describe("For move: the path of the array item to move."),
});

// archives
tool("bridge_info", "Bridge and game status: versions, game folder, archive and file counts.", {}, (_a, b) => b.info());

tool("archive_search", "Search the game archives by file name or path substring. Returns matching game paths with sizes and the archive they live in.", {
  query: z.string().describe("A substring of the game path, for example 'nokota' or 'base\\\\characters\\\\garment'."),
  limit: z.number().int().min(1).max(2000).default(200),
}, (a, b) => b.search(a.query, a.limit));

tool("archive_list", "List game files, optionally under a path prefix or inside one archive, with paging.", {
  archive: z.string().optional().describe("Archive name, for example basegame_4_gamedata.archive."),
  prefix: z.string().optional().describe("Game path prefix, for example base\\\\localization."),
  offset: z.number().int().min(0).default(0),
  limit: z.number().int().min(1).max(5000).default(500),
}, (a, b) => b.list(a));

tool("archive_tree", "One level of the archive folder tree: the folders and files directly under a game path. Empty path is the root (base, dlc, engine, ep1).", {
  path: z.string().default("").describe("A folder game path such as base\\\\characters, or empty for the root."),
}, (a, b) => b.tree(a.path));

tool("archive_extract", "Extract one game file to disk as-is (the raw CR2W or other format).", {
  path: z.string().describe("The game path."),
  outFile: z.string().describe("Where to write it on disk, for example a project's source/archive/<game path>."),
}, (a, b) => b.extract(a.path, a.outFile));

tool("archive_extract_many", "Extract many game files to disk in one call.", {
  items: z.array(z.object({ path: z.string(), outFile: z.string() })).min(1).max(5000),
}, (a, b) => b.extractMany(a.items));

// conversion
tool("cr2w_to_json", "Convert a game file (by game path) to WolvenKit JSON. Large files (a localization file is 21 MB) should go to outFile; without outFile the JSON comes back inline, cut at maxChars.", {
  path: z.string().describe("The game path."),
  outFile: z.string().optional().describe("Write the JSON here instead of returning it."),
  maxChars: z.number().int().min(1000).max(5_000_000).default(200_000),
}, async (a, b) => {
  const r = await b.toJson(a.path, a.outFile);
  if (r.json && r.json.length > a.maxChars) {
    return { path: r.path, hash: r.hash, bytes: r.bytes, truncated: true, note: `JSON is ${r.json.length.toLocaleString()} chars; pass outFile or raise maxChars. First ${a.maxChars.toLocaleString()} chars follow.`, json: r.json.slice(0, a.maxChars) };
  }
  return r;
});

tool("cr2w_file_to_json", "Convert a CR2W file on disk (for example one in a mod project) to WolvenKit JSON.", {
  file: z.string().describe("The file on disk."),
  outFile: z.string().optional().describe("Write the JSON here instead of returning it."),
  maxChars: z.number().int().min(1000).max(5_000_000).default(200_000),
}, async (a, b) => {
  const r = await b.fileToJson(a.file, a.outFile);
  if (r.json && r.json.length > a.maxChars) {
    return { path: r.path, bytes: r.bytes, truncated: true, note: `JSON is ${r.json.length.toLocaleString()} chars; pass outFile or raise maxChars. First ${a.maxChars.toLocaleString()} chars follow.`, json: r.json.slice(0, a.maxChars) };
  }
  return r;
});

tool("cr2w_from_json", `Write a CR2W file from WolvenKit JSON, given inline or as a file. ${FormatRules}`, {
  outFile: z.string().describe("The CR2W file to write."),
  json: z.string().optional().describe("The JSON text."),
  jsonFile: z.string().optional().describe("Or a file holding the JSON."),
}, (a, b) => {
  if (!a.json && !a.jsonFile) throw new Error("json or jsonFile is required");
  return b.fromJson(a.outFile, a.json ? { json: a.json } : { jsonFile: a.jsonFile! });
});

tool("texture_to_png", "Decode a texture (.xbm) from the archives to a PNG on disk.", {
  path: z.string().describe("The game path of the .xbm."),
  outFile: z.string().describe("The PNG to write."),
}, (a, b) => b.toPng(a.path, a.outFile));

tool("texture_file_to_png", "Decode a texture file on disk to a PNG.", {
  file: z.string(),
  outFile: z.string(),
}, (a, b) => b.fileToPng(a.file, a.outFile));

tool("project_export", "Export a game file under a project's source/archive to the same relative path under source/raw through WolvenKit's exporter: glTF for meshes (with material textures), an image for textures, WAV for sounds, and so on. Returns ok and the files written, relative to rawDir. Types WolvenKit cannot export are refused; use cr2w_to_json for those. Bridge 0.7.0.", {
  file: z.string().describe("The game file, under archiveDir."),
  archiveDir: z.string().describe("The project's source/archive folder."),
  rawDir: z.string().describe("The project's source/raw folder."),
  textureFormat: z.enum(["png", "tga", "dds", "bmp", "jpg", "tiff"]).optional().describe("Image format for textures; default png."),
  meshBinary: z.boolean().optional().describe("Meshes as .glb (true, default) or .gltf."),
  meshMaterials: z.boolean().optional().describe("Export a mesh's materials and textures too; default true."),
  meshLods: z.boolean().optional().describe("Export every LOD of a mesh; default false, only the most detailed one (WolvenKit's LOD filter)."),
}, (a, b) => b.exportFile(a.file, a.archiveDir, a.rawDir, { textureFormat: a.textureFormat, meshBinary: a.meshBinary, meshMaterials: a.meshMaterials, ...(a.meshLods === undefined ? {} : { meshLodFilter: !a.meshLods }) }));

tool("project_import", "Import a raw file under a project's source/raw back into source/archive through WolvenKit's importer (images to .xbm, glTF or GLB to .mesh, CSV and so on; sound effects go through sound_import). With keep (default), the file it replaces keeps its settings: a texture its group, format, compression and flags. A GLB imports only over an existing .mesh at the same path: for a new asset, pass template (a game path or .mesh to start from, bridge 0.9.0). A mesh import also returns mesh: submesh count, the GLB's material names per submesh, the mesh's material entries, appearances, and how appearances were sized to the new submeshes. Returns ok and the files written, relative to archiveDir. Bridge 0.7.0.", {
  file: z.string().describe("The raw file, under rawDir."),
  rawDir: z.string().describe("The project's source/raw folder."),
  archiveDir: z.string().describe("The project's source/archive folder."),
  keep: z.boolean().optional().describe("Keep the replaced file's settings; default true."),
  template: z.string().optional().describe("For a GLB with no mesh to import over: a game path (base\\...mesh) or a .mesh file to start the new mesh from."),
  texture: z.union([
    z.string(),
    z.object({
      group: z.string().optional(),
      compression: z.string().optional(),
      rawFormat: z.string().optional(),
      isGamma: z.boolean().optional(),
      hasMipchain: z.boolean().optional(),
      isStreamable: z.boolean().optional(),
    }),
  ]).optional().describe("For an image import: the .xbm's setup. A preset (color, normal, grayscale), a texture group name (TEXG_Generic_UI), or { group, compression, rawFormat, isGamma, hasMipchain, isStreamable } with the game's enum names, the rest from the group's defaults. Wins over the existing texture's setup; the answer's texture is the setup read back. Bridge 0.12.0."),
}, (a, b) => b.importFile(a.file, a.rawDir, a.archiveDir, a.keep ?? true, a.template, a.texture));

tool("library_add", "Add a game file or a project's file to the EDGE Library, the modder's store shared by every EDGE tool, as one asset item: <name>.<kind>.asset with asset.json and source/archive holding the file and the files it needs (a mesh's materials and textures; an entity's appearances and meshes), at their game paths. Game-wide files (base materials, templates, surfaces, effects, rigs) stay in the game and are referred to. Returns the item's folder, id, version, the files copied, those that stay, and those it names that are not in the game (the game's own files name some such). Writes outside the game, in the modder's Library only. With no Library yet, it answers where one would go: ask the modder, then call again with root. With no folder, it answers the modder's folders: ask which, or pass the folder, since the folders are theirs and tools never pick one on their own.", {
  path: z.string().describe("A game path (base\\...\\comfy_rocker.mesh), or the full path of a file under a WolvenKit project's source/archive, whose project copies then win over the game's."),
  folder: z.string().optional().describe("A folder under the Library's root, with /, for example Production/Meshes; made if missing. An empty string is the root itself."),
  gamePathFolders: z.boolean().optional().describe("Puts the item in its game path's folders under the folder, each made if missing: <folder>/base/.../comfy_rocker.mesh.asset, so the Library browses like the game's files. The modder's choice."),
  root: z.string().optional().describe("Only when there is no Library yet: where to make it, written to %APPDATA%\\EDGE\\library.json for every EDGE tool. Ask the modder first."),
  ifExists: z.enum(["stop", "replace", "another"]).optional().describe("When the item is there already: stop (default), another (a second item beside it), or replace (a new copy, version raised, id kept; anything changed in the item since is lost, so ask the modder first)."),
  allowLarge: z.boolean().optional().describe("Copy more than 500 files. An entity's walk can reach that; check with the modder first."),
}, async (a, b) => {
  const known = readLibraryRoot();
  if (a.root && known) throw new Error(`The EDGE Library is already at ${known}. Leave root out; moving it is Relocate, in EDGEbuilder.`);
  if (!a.root && !known) return { needsRoot: true, suggested: suggestedLibraryRoot(), note: "No EDGE Library yet. Ask the modder where it should go, then call again with root." };
  const info = await b.info();
  if (a.root && info.gameDir && isInside(path.resolve(a.root), info.gameDir)) throw new Error("The EDGE Library cannot be inside the game's folder.");
  const root = known ?? writeLibraryRoot(a.root as string);
  if (a.folder === undefined) return { needsFolder: true, root, folders: libraryFolders(root), note: "Ask the modder which folder, or for a new one, then call again with folder (an empty string is the root)." };

  const source: AssetSource = { path: a.path };
  if (path.isAbsolute(a.path)) {
    const m = /^(.*?)[\\/]source[\\/]archive[\\/]/i.exec(a.path);
    const project = m ? findProject(m[1]) : undefined;
    const gamePath = project && gamePathOf(project, path.normalize(a.path));
    if (!project || !gamePath) throw new Error(`${a.path} is not under a WolvenKit project's source/archive.`);
    source.path = gamePath;
    source.project = { name: project.name, dir: project.dir };
  }
  const plan = await planAsset(b, source);
  if (plan.take.length > 500 && !a.allowLarge) throw new Error(`${plan.main} needs ${plan.take.length} files. Check with the modder, then pass allowLarge.`);
  return writeAsset(b, source, plan, { root, folder: a.folder, gamePathFolders: a.gamePathFolders, ifExists: a.ifExists, tool: `redcode-mcp ${Version}`, gameVersion: await gameVersionOf(info.gameDir), gameDir: info.gameDir });
});

// ---- the game itself, for a test an assistant runs (REDcode's docs/design/game-testing.md) ----

tool("game_status", "Whether Cyberpunk 2077 is running, and whether REDnode in it answers yet (through REDcode's redcode package, 0.3.0 or later), with the game's window mode and resolution. Use it to wait after game_start: REDnode's own tools (game_state, game_image, api_read, logs) work once rednode is true, and game_state says whether a save is loaded. When the game has ended after a game_start, this also puts the player's own window mode and resolution back in the game's settings file. Changes nothing else.", {}, async () => gameStatus());

tool("game_start", "Start Cyberpunk 2077 for a test, so it does not take over the player's monitor: windowed at a small size, or inside REDcode's game tab in VS Code when a REDcode window offers one (then at a size that fits the tab). The game's exe is started directly. It changes the window mode and resolution in the game's settings file and keeps the player's own values, which go back when the game has ended (game_stop, or game_status after it closed). It answers at once: ask game_status until rednode is true, about a minute. The game opens on its main menu; loading a save is the player's step until REDnode has a call for it. Ask the player before starting the game unless they asked for exactly that.", {
  resolution: z.string().regex(/^\d{3,5}x\d{3,5}$/).optional().describe("The game's size when it is not in a tab, one of the sizes the game lists for the monitor. Default 1920x1080; 1280x720 is lighter."),
  tab: z.boolean().optional().describe("False starts the game as a window of its own even when REDcode offers its tab. Default true."),
  redmod: z.boolean().optional().describe("Start with REDmod mods (-modded). Default false."),
}, async (a, b) => {
  const info = await b.info();
  if (!info.gameDir) throw new Error("REDbridge has no game folder: set REDCODE_GAME_PATH or start it with --game.");
  return startGame(info.gameDir, { resolution: a.resolution, tab: a.tab, redmod: a.redmod });
});

tool("game_stop", "Close Cyberpunk 2077: asks its window to close and, when it has not gone after 15 seconds, ends its process. Progress since the last save is lost, so ask the player first unless this session started the game for a test. Afterwards the player's own window mode and resolution are back in the game's settings file, when game_start changed them.", {}, async () => stopGame());

// ---- made animations (REDcode's docs/design/animation-tools.md, AT2), over @edgemodders/anim-core ----

const animCache = path.join(process.env.LOCALAPPDATA ?? os.tmpdir(), "REDcode", "mcp-cache", "anim");
const RigSchema = z.enum(["man_base", "woman_base"]).optional().describe("The rig: man_base (default) or woman_base, the base man's and woman's rigs the game's NPC clips use.");
const ProjectSchema = z.string().describe("The WolvenKit project's folder (the one with the .cpmodproj).");

/** The project at a folder, which must hold a .cpmodproj. */
function animProject(dir: string): anim.Project {
  if (!fs.existsSync(dir) || !fs.readdirSync(dir).some((f) => f.toLowerCase().endsWith(".cpmodproj"))) throw new Error(`${dir} has no .cpmodproj: give the project's folder`);
  return anim.projectAt(dir);
}

/** The Uthana key: UTHANA_API_KEY, or the shared key store through REDbridge (service uthana). */
async function uthanaKey(b: BridgeClient): Promise<string> {
  const fromEnv = env("UTHANA_API_KEY");
  if (fromEnv) return fromEnv;
  const r = await b[KeyAccess]<{ key: string | null }>("keys.get", { service: "uthana", tool: `redcode-mcp ${Version}` }).catch((e: Error) => {
    throw new Error(`Could not read the Uthana key from the shared store (${e.message}); set it in REDcode's Keys view, or UTHANA_API_KEY`);
  });
  if (!r.key) throw new Error("No Uthana key: the modder sets it in REDcode's Keys view (service uthana), or UTHANA_API_KEY");
  return r.key;
}

/** A clip name not yet a made clip, or the error when it is and again was not given. */
function animName(project: anim.Project, name: string, again: boolean | "edited" | undefined): { name: string } {
  const old = anim.recordOf(project, name);
  if (!old) return { name };
  if (!again) throw new Error(`The project already has a made clip named ${name}. Ask the modder: pass again: true to make it again (it keeps its id, so EDGEdir's scenes using it get the new take), or another name.`);
  if (anim.hasEdits(old) && again !== "edited") throw new Error(`${name} has edits made in EDGEfab, which making it again would lose. Ask the modder; pass again: "edited" to make it again anyway.`);
  return { name };
}

const madeOut = (r: anim.ImportResult & { record?: anim.AnimRecord }, project: anim.Project, extra: Record<string, unknown> = {}) => ({
  set: r.set,
  file: path.join(project.archiveDir, ...r.set.split("\\")),
  clip: r.clip,
  id: r.record?.id,
  record: r.record,
  notes: r.notes,
  ...extra,
  next: "Pack the project (project_pack) and swap it into the running game (rednode's archives_reload), then play it on a spawned NPC with a written workspot (rednode's world tools).",
});

tool("anim_generate", "Make an animation from words with Uthana's text to motion, onto the game's own skeleton (the base man's or woman's rig), as a new clip in a WolvenKit project: its own set at <mod>\\anims\\<name>\\<name>.anims with the record EDGEdir and EDGEfab read (<name>.edgefab.json). It costs the modder money on their Uthana account: $0.10 a second with text-to-motion-3.0 or its Lite, $0.075 with Mini, charged only when the job finishes. Tell the modder the cost and get their yes before calling. Takes a minute or two. The key comes from UTHANA_API_KEY or the shared key store.", {
  project: ProjectSchema,
  prompt: z.string().describe("What the animation shows, such as 'a man stands relaxed, raises his right hand and waves hello, then lowers it'. One person, whole body."),
  rig: RigSchema,
  length: z.number().optional().describe("Seconds: 4 to 10 for text-to-motion-3.0, 5 to 10 for Lite and Mini. Default 5."),
  model: z.enum(["text-to-motion-3.0", "text-to-motion-3.0-lite", "text-to-motion-3.0-mini"]).optional(),
  inPlace: z.boolean().optional().describe("No travel across the floor (default true): the game's workspots apply no root motion."),
  asWritten: z.boolean().optional().describe("Send the prompt as written; otherwise Uthana rewrites it first."),
  upperBodyOnly: z.boolean().optional().describe("Hold the legs still (Uthana's torso_only), for arm and upper body motions. Off (default), the whole body moves; REDcode adds a rule to the prompt for feet that respect the ground: lifting a leg, stepping, running and jumping are fine; floating, sliding and shuffling are not."),
  name: z.string().optional().describe("The clip's name (lowercase letters, digits, _); from the prompt when left out."),
  again: z.union([z.boolean(), z.literal("edited")]).optional().describe("When a made clip has the name: true makes it again (keeping its id); 'edited' also when EDGEfab has edited it. Ask the modder first."),
}, async (a, b) => {
  const project = animProject(a.project);
  const rig = anim.Rigs[a.rig ?? "man_base"];
  const asked = anim.slug(a.name ?? anim.clipNameFor(a.prompt));
  const { name } = animName(project, asked, a.again);
  const key = await uthanaKey(b);
  const stages: string[] = [];
  const r = await anim.generate({
    bridge: anim.asBridge(b), uthana: anim.uthana(key), key, rig, project, cacheDir: animCache,
    prompt: a.prompt, length: a.length, model: a.model, inPlace: a.inPlace, upperBodyOnly: a.upperBodyOnly, rewritePrompt: a.asWritten ? false : undefined,
    name, overwriteEdited: a.again === "edited", onStage: (s) => stages.push(s),
  });
  return madeOut(r, project, { cost: r.cost, motionId: r.motionId, fit: r.report });
});

tool("anim_add_clip", "Add a clip from a .glb already on the game's rig (bone names as the game's: Hips, Spine, LeftArm…; from Blender, say) to a WolvenKit project as a made animation, through the same fit as anim_generate (every channel the game needs, the feet grounded, WolvenKit's clip data): its own set at <mod>\\anims\\<name>\\<name>.anims with the record EDGEdir and EDGEfab read. Free. A .glb on another skeleton needs retargeting first (EDGEfab's).", {
  project: ProjectSchema,
  file: z.string().describe("The .glb on disk; its first animation is taken."),
  rig: RigSchema,
  name: z.string().optional().describe("The clip's name; from the file's name when left out."),
  again: z.union([z.boolean(), z.literal("edited")]).optional().describe("As anim_generate's again."),
}, async (a, b) => {
  const project = animProject(a.project);
  const rig = anim.Rigs[a.rig ?? "man_base"];
  const { name } = animName(project, anim.slug(a.name ?? path.basename(a.file).replace(/\.(anims\.)?glb$/i, "")), a.again);
  const bridge = anim.asBridge(b);
  const motion = fs.readFileSync(a.file);
  const { glb, report } = anim.fitClip(anim.readGlb(motion), await anim.referenceClip(bridge, animCache, rig), name);
  const r = await anim.addClip(bridge, project, rig, name, glb, { seconds: report.duration, overwriteEdited: a.again === "edited", license: { source: "own", note: `From ${path.basename(a.file)}, imported through redcode-mcp` } }, { motion, record: { source: "glb", file: path.basename(a.file) } });
  return madeOut(r, project, { fit: report });
});

tool("anim_replace_clip", "Replace one of the game's own clips with a made one, in a copy of its .anims set at the game's path in a WolvenKit project (every other clip of the set kept), so whatever plays that clip in the game plays the new one. From words with Uthana (prompt: costs money as anim_generate; ask the modder first) or from a .glb on the game's rig (file: free). The whole set is replaced in the game, so another mod replacing a clip of the same set conflicts with it.", {
  project: ProjectSchema,
  set: z.string().describe("The game's .anims set, by game path, such as base\\animations\\npc\\generic_characters\\male_average\\interactive_scene\\generic_male_average__stand__2h_on_sides__01.anims."),
  clip: z.string().describe("The clip in it to replace, by name."),
  prompt: z.string().optional().describe("Make the new clip from these words with Uthana."),
  file: z.string().optional().describe("Or from this .glb on the game's rig."),
  length: z.number().optional(),
  model: z.enum(["text-to-motion-3.0", "text-to-motion-3.0-lite", "text-to-motion-3.0-mini"]).optional(),
  inPlace: z.boolean().optional(),
}, async (a, b) => {
  if (!a.prompt === !a.file) throw new Error("Give prompt or file, not both");
  const project = animProject(a.project);
  const bridge = anim.asBridge(b);
  const info = await bridge.request<{ items: { rig?: string | null; error?: string }[] }>("anims.info", { files: [a.set] });
  const rigPath = info.items?.[0]?.rig;
  if (!rigPath) throw new Error(`${a.set}: ${info.items?.[0]?.error ?? "not an animation set in the game"}`);
  const rig = anim.rigFor(rigPath);
  if (!rig) throw new Error(`${a.set} is on ${rigPath}; made clips go on man_base or woman_base for now`);
  if (a.prompt) {
    const key = await uthanaKey(b);
    const r = await anim.generate({ bridge, uthana: anim.uthana(key), key, rig, project, cacheDir: animCache, prompt: a.prompt, length: a.length, model: a.model, inPlace: a.inPlace, replace: { set: a.set, clip: a.clip } });
    return madeOut(r, project, { cost: r.cost, motionId: r.motionId, fit: r.report });
  }
  const motion = fs.readFileSync(a.file!);
  const { glb, report } = anim.fitClip(anim.readGlb(motion), await anim.referenceClip(bridge, animCache, rig), a.clip);
  const r = await anim.replaceClip(bridge, project, a.set, a.clip, glb, { motion, record: { source: "glb", file: path.basename(a.file!) } });
  return madeOut(r, project, { fit: report });
});

tool("anim_made_clips", "The made animations in a WolvenKit project, newest first, found by their records (<name>.edgefab.json, kind anim): each one's name, id, rig, length, set and how it was made (a prompt, a file).", {
  project: ProjectSchema,
}, async (a) => anim.madeClips(animProject(a.project)).map((m) => ({ name: m.name, id: m.id, rig: m.anim.rig, seconds: m.anim.seconds, set: m.set, madeBy: m.madeBy, made: m.made, source: m.source, edited: anim.hasEdits(m) })));

tool("project_pack", "Pack a folder (a project's source/archive) into <modName>.archive in outDir through WolvenKit's packer. Returns the archive path, size, file count and warnings for paths with capital letters or spaces. Bridge 0.6.1.", {
  dir: z.string().describe("The folder to pack, laid out as game paths (base/..., ep1/...)."),
  outDir: z.string().describe("Where the archive goes, usually packed/archive/pc/mod."),
  modName: z.string().describe("The archive name without extension."),
}, (a, b) => b.pack(a.dir, a.outDir, a.modName));

tool("archive_open_mod", "List the resources inside a mod .archive on disk. No game needed.", {
  path: z.string().describe("The .archive file."),
}, (a, b) => b.openMod(a.path));

tool("archive_extract_from_mod", "Extract resources from a mod .archive on disk, by game path or hash, to files of your choosing; for a project, outFile is source/archive/<game path>. Missing or failing resources are listed, the rest are written. No game needed. Bridge 0.7.1.", {
  archivePath: z.string().describe("The .archive file."),
  items: z.array(z.object({ path: z.string().describe("Game path (base\\...) or decimal hash."), outFile: z.string() })),
}, (a, b) => b.extractFromMod(a.archivePath, a.items));

tool("hash_fnv1a64", "The FNV1a64 hash of a string, as the game uses for paths and names.", { value: z.string() }, (a, b) => b.fnv1a64(a.value));
tool("hash_resolve", "The game path for a known hash, if the hash list knows it.", { hash: z.string().describe("Decimal hash string.") }, (a, b) => b.resolve(a.hash));

// TweakDB, offline: the game's tweakdb_ep1.bin as shipped, without mods. The running game, with every
// mod's changes, is REDnode's tweakdb module.
const TweakRules = "TweakDB as the game ships it, read offline from r6/cache/tweakdb_ep1.bin (no mods; REDnode reads the live one). The first TweakDB call loads it, about 12 s; later calls take milliseconds. Paths look like Items.money; ids are 0x hex hashes (path null when WolvenKit's names list does not know one). Flat values are plain JSON: record links as paths (0x id when unknown), LocKeys as { key, text } (text with resolveLocKeys), resource references as paths. Bridge 0.8.0.";

tool("tweakdb_types", `The TweakDB record types with their record counts, most first. ${TweakRules}`, {}, (_a, b) => b.tweakTypes());

tool("tweakdb_records", `TweakDB records by type (gamedataClothing_Record or the short form Clothing; subtypes included, so Item covers clothing and weapons) and/or path prefix, paged, each with only the flats asked for. ${TweakRules}`, {
  type: z.string().optional().describe("Record type, such as Clothing, WeaponItem, Vehicle or gamedataCharacter_Record."),
  prefix: z.string().optional().describe("Path prefix, such as Items. or Vehicle.v_sport2."),
  flats: z.array(z.string()).optional().describe('Flat names to include, such as ["entityName", "appearanceName", "displayName"]; ["*"] for all.'),
  offset: z.number().optional(),
  limit: z.number().optional().describe("Default 200, at most 20000."),
  resolveLocKeys: z.boolean().optional().describe("Fill LocKey text, such as an item's displayName."),
  language: z.string().optional().describe("Localization folder for the text, default en-us."),
}, (a, b) => b.tweakRecords(a));

tool("tweakdb_record", `One TweakDB record, by path or id, with every flat: name, RED type and value. ${TweakRules}`, {
  path: z.string().describe("Record path (Items.money) or id (0x0000000BF5E188EC)."),
  resolveLocKeys: z.boolean().optional(),
  language: z.string().optional(),
}, (a, b) => b.tweakRecord(a.path, a.resolveLocKeys ?? false, a.language ?? "en-us"));

tool("tweakdb_flat", `One TweakDB flat by its full path (Record.flat, such as Items.money.quality) or id. ${TweakRules}`, {
  path: z.string(),
  resolveLocKeys: z.boolean().optional(),
}, (a, b) => b.tweakFlat(a.path, a.resolveLocKeys ?? false));

tool("tweakdb_search", `TweakDB records whose path contains every word, any case, optionally of one type. ${TweakRules}`, {
  text: z.string().describe("Words, such as 'jacket' or 'quadra type66'."),
  type: z.string().optional(),
  limit: z.number().optional(),
}, (a, b) => b.tweakSearch(a.text, a.type, a.limit ?? 200));

tool("tweakdb_names", "Paths for TweakDB ids (0x hex or decimal) from WolvenKit's names list, null when unknown. Only the low 40 bits count, so ids with a flat-buffer offset match. Needs no TweakDB load. Bridge 0.8.0.", {
  ids: z.array(z.string()),
}, (a, b) => b.tweakNames(a.ids));

tool("mesh_items", "The TweakDB item records whose look shows a mesh: the reverse of record > factory .csv > root .ent > .app look > mesh. Each item has record, type, displayName ({ key, text }), appearanceName, meshAppearance (the mesh appearance its look shows), app and look, and entity with entityAppearances (one per body and camera, such as s1_casual_01_basic_01_&Male). looks lists every .app look that shows the mesh, also those no item reaches (NPC appearances). Covers items that pick their look by appearanceName, such as clothing; not weapons, nor a mesh only a part entity holds. Loads TweakDB on the first call (about 10 s); the index after it takes under a second. Bridge 0.11.0.", {
  path: z.string().describe("The mesh's game path, such as base\\characters\\garment\\player_equipment\\feet\\s1_055_shoe__converse\\s1_055_pma_shoe__converse.mesh."),
  appearance: z.string().optional().describe("Only the looks that show this mesh appearance, such as red_yellow_graphic."),
  language: z.string().optional().describe("Localization folder for display names, default en-us."),
}, (a, b) => b.meshItems(a.path, a.appearance, a.language ?? "en-us"));

// on-screen texts (LocKeys): the base game's and Phantom Liberty's onscreens.json per language,
// with a project's own onscreens files (named in its .xl files) over them.
const LocRules = "Languages are folder names such as en-us or de-de (default en-us). With projectDir, the project's onscreens entries replace the game's ones with the same key. The first call per language loads it, about 1 s. Bridge 0.10.0.";

tool("loc_languages", "The languages the game has on-screen texts for, and whether Phantom Liberty has them too. Bridge 0.10.0.", {}, (_a, b) => b.locLanguages());

tool("loc_search", `Find on-screen texts: 'LocKey#123' or a number finds that LocKey, otherwise every word must appear, any case, in the secondary key or the female or male text. Each result has key (the LocKey number as text), secondaryKey, female, male, source (base, ep1 or project), and file and index: its onscreens file (a game path, or relative to projectDir for a project entry) and its row there, for cr2w_open and cr2w_get_node. ${LocRules}`, {
  query: z.string().describe("LocKey#123, a secondary key, or words such as 'militech pistol'."),
  language: z.string().optional(),
  limit: z.number().optional().describe("Most results to return (default 200)."),
  projectDir: z.string().optional().describe("A REDcode or WolvenKit project folder whose own texts should count."),
}, (a, b) => b.locSearch(a.query, a.language ?? "en-us", a.limit ?? 200, a.projectDir));

tool("loc_get", `The texts for LocKeys, by number or secondary key, with or without 'LocKey#'; null where there is none. ${LocRules}`, {
  keys: z.array(z.string()).describe("Such as ['LocKey#12345', 'Gameplay-Devices-Computers-Common-NewsFeed']."),
  language: z.string().optional(),
  projectDir: z.string().optional(),
}, (a, b) => b.locGet(a.keys, a.language ?? "en-us", a.projectDir));

// sounds: voice lines are .wem files (project_export makes them Ogg); sound effects sit in .opuspak
// files indexed by sfx_container.opusinfo, grouped under Wwise events.
const soundCache = path.join(os.tmpdir(), "redcode-mcp", "sounds");
let soundIndex: OpusIndex | undefined;
async function gameSounds(b: BridgeClient): Promise<OpusIndex> {
  if (!soundIndex) {
    const file = path.join(soundCache, "sfx_container.opusinfo");
    if (!fs.existsSync(file)) await b.extract(GameSoundIndex, file);
    soundIndex = parseOpusInfo(fs.readFileSync(file));
  }
  return soundIndex;
}

tool("sound_events", "Find the game's sound effect events by name or tag (words must all match), with the hashes of each event's sounds (its variations). Names come from WolvenKit's event list (game 1.6), so a newer event may be missing. Bridge 0.7.2.", {
  query: z.string().optional().describe("Words to match in the event name or tags, such as 'revol reload'. Empty lists all."),
  limit: z.number().optional().describe("Most events to return (default 100)."),
}, async (a, b) => {
  const [events, index] = [await b.soundEvents(), await gameSounds(b)];
  const groups = new Map(index.groups.filter((g) => g.sounds.length > 0).map((g) => [g.hash, g.sounds]));
  const words = (a.query ?? "").toLowerCase().split(/\s+/).filter(Boolean);
  const hits = events.events.filter((e) => groups.has(e.hash) && words.every((w) => `${e.name} ${e.tags.join(" ")}`.toLowerCase().includes(w)));
  return { total: hits.length, events: hits.slice(0, a.limit ?? 100).map((e) => ({ ...e, sounds: groups.get(e.hash)!.map((i) => index.hashes[i]) })) };
});

tool("sound_import", "Override game sound effects in a WolvenKit project from WAV files, each named after the sound's hash (832549876.wav; sound_events gives the hashes). Writes the changed .opuspak files and a new sfx_container.opusinfo under the project's source/archive; earlier overrides there stay. Any rate and 16-bit, 24-bit or float WAV; encoded at 48 kHz Opus. Bridge 0.9.0.", {
  wavFiles: z.array(z.string()).describe("Absolute paths of <hash>.wav files."),
  archiveDir: z.string().describe("The project's source/archive folder."),
}, (a, b) => b.importWavs(a.wavFiles, a.archiveDir));

tool("sound_extract", "Write game sound effects as .opus files (Ogg Opus, 48 kHz) named by sound hash: every variation of an event, by name or hash, or single sounds by hash. Voice lines are .wem files instead: use project_export.", {
  event: z.string().optional().describe("An event name, such as w_gun_npc_nova_reload, or its decimal hash."),
  sounds: z.array(z.number()).optional().describe("Or sound hashes."),
  outDir: z.string().describe("The folder to write into."),
}, async (a, b) => {
  const index = await gameSounds(b);
  let picks: number[];
  if (a.event) {
    const hash = /^\d+$/.test(a.event) ? Number(a.event) : wwiseHash(a.event);
    const group = index.groups.find((g) => g.hash === hash && g.sounds.length > 0);
    if (!group) throw new Error(`No event ${a.event} (hash ${hash}) in the sound index`);
    picks = group.sounds;
  } else if (a.sounds?.length) {
    const at = new Map(Array.from(index.hashes, (h, i) => [h, i]));
    picks = a.sounds.map((h) => {
      const i = at.get(h);
      if (i === undefined) throw new Error(`No sound ${h} in the sound index`);
      return i;
    });
  } else {
    throw new Error("event or sounds is required");
  }
  fs.mkdirSync(a.outDir, { recursive: true });
  const written = [];
  for (const i of picks) {
    const bytes = await opusSound(b, soundCache, { gamePath: GameSoundIndex }, index, i);
    const file = path.join(a.outDir, `${index.hashes[i]}.opus`);
    fs.writeFileSync(file, bytes);
    const f = audioFormat(bytes);
    written.push({ file, bytes: bytes.length, channels: f.channels });
  }
  return { written };
});

// document sessions
tool("cr2w_open", `Open a CR2W file as a document session for node-by-node reading and patching. A file on disk is editable; a game path opens read-only (save it with cr2w_save and outFile to get an editable copy). Returns the session id to pass to the other cr2w_* tools. ${PathRules}`, {
  file: z.string().optional().describe("A CR2W file on disk."),
  path: z.string().optional().describe("Or a game path in the archives."),
}, (a, b) => {
  if (!a.file && !a.path) throw new Error("file or path is required");
  return b.openDocument(a.file ? { file: a.file } : { path: a.path! });
});

tool("cr2w_get_node", `Read one node of an open document: its kind (class, array, handle, buffer, package, value), type, value for leaves and small structs, and one line per child. Arrays page from offset, limit items at a time. ${PathRules}`, {
  doc: z.string().describe("The session id from cr2w_open."),
  path: z.string().default("").describe("Dotted path; empty for the root chunk."),
  offset: z.number().int().min(0).default(0),
  limit: z.number().int().min(1).max(5000).default(200),
}, (a, b) => b.getNode(a.doc, a.path, a.offset, a.limit));

tool("cr2w_patch", `Apply JSON Patch operations (replace, add, remove, move) to an open document, all or none. Returns the inverse operations for undo. Nothing is written until cr2w_save. ${PathRules} ${FormatRules}`, {
  doc: z.string(),
  ops: z.array(PatchOpSchema).min(1),
}, (a, b) => b.patch(a.doc, a.ops as PatchOp[]));

tool("cr2w_get_nodes", "Several nodes of an open document in one call. A path that fails gives a node of kind 'error' with the message as its type, instead of failing the call.", {
  doc: z.string(),
  paths: z.array(z.string()).min(1).max(500),
  limit: z.number().int().min(1).max(5000).default(200).describe("Array window size for array nodes."),
}, (a, b) => b.getNodes(a.doc, a.paths, a.limit));

tool("cr2w_search", `Find leaves in an open document whose text or property name contains the query (case-insensitive), below a path. Returns paths with previews; total counts every match. Use it to locate a value before patching, or to filter rows of a localization file (path root.Data.entries). ${PathRules}`, {
  doc: z.string(),
  query: z.string().min(1),
  path: z.string().default("").describe("Start path; empty for the whole file."),
  limit: z.number().int().min(1).max(5000).default(200),
}, (a, b) => b.searchDocument(a.doc, a.query, a.path, a.limit));

tool("cr2w_save", "Write an open document through WolvenKit's writer, to its own file or to outFile. compiledData is rebuilt from components during the write.", {
  doc: z.string(),
  outFile: z.string().optional(),
}, (a, b) => b.saveDocument(a.doc, a.outFile));

tool("cr2w_close", "Close a document session.", { doc: z.string() }, (a, b) => b.closeDocument(a.doc).then(() => ({ closed: a.doc })));
tool("cr2w_documents", "List the open document sessions.", {}, (_a, b) => b.documents());

tool("cr2w_describe_type", "What a RED type is made of: a class's properties with types, kinds and defaults; an enum's values; an array's or handle's element type. Use it to know which properties exist and what values they take before patching.", {
  type: z.string().describe("A RED type name such as entMeshComponent, ELightType or array:CName."),
}, (a, b) => b.describeType(a.type));

tool("cr2w_create_instance", "A default instance of a RED type in WolvenKit JSON form, to use as the value of an add operation or to fill a handle.", {
  type: z.string(),
}, (a, b) => b.createInstance(a.type));

// one-call editing
tool("cr2w_edit_file", `Edit a CR2W file in one call: open it, apply the operations, save, close. Give file for a file on disk (saved in place unless outFile is set) or path for a game file (outFile is then required, and the result is a modified copy; the archives are never changed). Returns what was written and the inverse operations. ${PathRules} ${FormatRules}`, {
  file: z.string().optional().describe("A CR2W file on disk to modify."),
  path: z.string().optional().describe("Or a game path to copy and modify."),
  outFile: z.string().optional().describe("Where to write the result. Required with path."),
  ops: z.array(PatchOpSchema).min(1),
}, async (a, b) => {
  if (!a.file && !a.path) throw new Error("file or path is required");
  if (a.path && !a.outFile) throw new Error("outFile is required when editing a game file, so the archives stay untouched");
  const d = await b.openDocument(a.file ? { file: a.file } : { path: a.path! });
  try {
    if (a.path) {
      await b.saveDocument(d.doc, a.outFile);
    }
    const r = await b.patch(d.doc, a.ops as PatchOp[]);
    const w = await b.saveDocument(d.doc, a.outFile);
    return { file: w.file, bytes: w.bytes, applied: r.applied, inverse: r.inverse, type: d.type };
  } finally {
    await b.closeDocument(d.doc).catch(() => undefined);
  }
});

tool("cr2w_read", `Read values from a CR2W file in one call, without keeping a session: opens the file, reads each path, closes. Use it to look before editing. ${PathRules}`, {
  file: z.string().optional().describe("A CR2W file on disk."),
  path: z.string().optional().describe("Or a game path."),
  paths: z.array(z.string()).min(1).max(100).describe("Node paths to read; empty string is the root."),
}, async (a, b) => {
  if (!a.file && !a.path) throw new Error("file or path is required");
  const d = await b.openDocument(a.file ? { file: a.file } : { path: a.path! });
  try {
    const out: Record<string, unknown> = {};
    for (const p of a.paths) {
      out[p] = await b.getNode(d.doc, p).catch((e: Error) => ({ error: e.message }));
    }
    return { type: d.type, nodes: out };
  } finally {
    await b.closeDocument(d.doc).catch(() => undefined);
  }
});

// ---- sectors, sector scripts and their requests (REDcode's docs/design/sector-scripts.md) ----------

/** The project REDcode has open (the window focused last), or undefined. */
function currentProjectDir(): string | undefined {
  try {
    const state = JSON.parse(fs.readFileSync(projectStateFile(), "utf8")) as { project?: { dir?: string } | null };
    return state.project?.dir || undefined;
  } catch {
    return undefined;
  }
}

const SectorSourceShape = {
  file: z.string().optional().describe("A .streamingsector on disk, such as a project's copy under source\\archive."),
  path: z.string().optional().describe("Or the sector's game path; the project's copy under source\\archive wins when there is one."),
  project: z.string().optional().describe("The WolvenKit project's folder; by default the one REDcode has open."),
};

interface SectorRead {
  sector: string;
  /** The file read, or null for the game's copy. */
  file: string | null;
  nodes: SectorNode[];
  changes: Map<string, NodeChange>;
  json: string;
}

/** Where a sector is: a file on disk (a project's copy), or the game's. */
function locateSector(a: { file?: string; path?: string; project?: string }): { sector: string; file: string | null } {
  if (a.file) {
    const file = path.resolve(a.file);
    const m = /^(.*?)[\\/]source[\\/]archive[\\/]/i.exec(file);
    const project = m ? findProject(m[1]) : undefined;
    return { sector: (project && gamePathOf(project, path.normalize(file))) || path.basename(file), file };
  }
  if (!a.path) throw new Error("file or path is required");
  const dir = a.project ?? currentProjectDir();
  const own = dir ? path.join(dir, "source", "archive", ...a.path.split(/[\\/]/)) : undefined;
  return { sector: a.path, file: own && fs.existsSync(own) ? own : null };
}

let lastSector: { key: string; json: string; text: string } | undefined;
/** A sector's nodes as a script sees them, from its CR2W JSON (the last one read is kept while its file is unchanged). */
async function readSector(b: BridgeClient, a: { file?: string; path?: string; project?: string }): Promise<SectorRead> {
  const { sector, file } = locateSector(a);
  const key = file ? `${file}|${fs.statSync(file).mtimeMs}` : `game|${sector.toLowerCase()}`;
  if (lastSector?.key !== key) {
    const dir = path.join(os.tmpdir(), "redcode-mcp");
    fs.mkdirSync(dir, { recursive: true });
    const json = path.join(dir, "sector.json");
    if (file) await b.fileToJson(file, json);
    else await b.toJson(sector, json);
    lastSector = { key, json, text: fs.readFileSync(json, "utf8") };
  }
  const changes = new Map<string, NodeChange>();
  return { sector, file, nodes: sectorNodes(sector, JSON.parse(lastSector.text), changes), changes, json: lastSector.json };
}

/** Writes changes into a project's copy of a sector through a document session, saved. */
async function applyToSector(b: BridgeClient, read: SectorRead, changes: NodeChange[]): Promise<number> {
  if (!read.file) throw new Error(`${read.sector} is the game's copy, which is read-only. Add it to the project first (archive_extract with outFile under the project's source\\archive, at the same game path), then change the copy.`);
  if (!changes.length) return 0;
  const d = await b.openDocument({ file: read.file });
  try {
    await b.patch(d.doc, changes.map(changeToOp));
    await b.saveDocument(d.doc);
  } finally {
    await b.closeDocument(d.doc).catch(() => undefined);
  }
  lastSector = undefined;
  return changes.length;
}

const NodeFacts = "Each node is one node data entry: id (<sector>#<entry>, as REDcode's sector view, ArchiveXL and REDnode name it), entry, type (the node's class), debugName, mesh, resource, appearance, position [x, y, z] in game axes (Z up), streamingDistance.";
const PropertyPaths = `A property's path is dotted, as in WolvenKit's JSON, with "Data" under handles stepped into by itself; "entry.<path>" or "node.<path>" says which side, otherwise the node's own property is taken, then the entry's (streamingDistance, transform and the placing values are the entry's). Names and resource paths read and set as plain text.`;

const compare = (v: unknown, op: string, want: unknown): boolean => {
  if (op === "contains") return String(v ?? "").toLowerCase().includes(String(want).toLowerCase());
  const [x, y] = typeof want === "number" ? [Number(v), want] : [String(v ?? ""), String(want)];
  switch (op) {
    case "<": return x < y;
    case "<=": return x <= y;
    case ">": return x > y;
    case ">=": return x >= y;
    case "!=": return x !== y;
    default: return x === y;
  }
};

tool("sector_nodes", `A .streamingsector's nodes, filtered, a page at a time. ${NodeFacts} Filters add up: type and mesh match a part of the text, where compares properties, box keeps what stands inside it. ${PropertyPaths}`, {
  ...SectorSourceShape,
  type: z.string().optional().describe("A part of the node's class, such as MeshNode."),
  mesh: z.string().optional().describe("A part of the mesh's or resource's path."),
  where: z.array(z.object({ path: z.string(), op: z.enum(["<", "<=", ">", ">=", "==", "!=", "contains"]), value: z.union([z.number(), z.string()]) })).optional().describe('Property tests, such as { path: "streamingDistance", op: "<", value: 45 }.'),
  box: z.object({ min: z.array(z.number()).length(3), max: z.array(z.number()).length(3) }).optional().describe("A box in game axes: nodes whose position is inside."),
  entries: z.array(z.number().int()).optional().describe("Only these node data entries."),
  properties: z.array(z.string()).optional().describe("Property paths to read for each node, returned under properties."),
  offset: z.number().int().min(0).default(0),
  limit: z.number().int().min(1).max(2000).default(200),
}, async (a, b) => {
  const read = await readSector(b, a);
  const only = a.entries ? new Set(a.entries) : undefined;
  const matched = read.nodes.filter((n) => {
    if (only && !only.has(n.entry)) return false;
    if (a.type && !n.type.toLowerCase().includes(a.type.toLowerCase())) return false;
    if (a.mesh && !(n.resource ?? "").toLowerCase().includes(a.mesh.toLowerCase())) return false;
    if (a.box) {
      const p = n.position;
      for (let i = 0; i < 3; i++) if (p[i] < a.box.min[i] || p[i] > a.box.max[i]) return false;
    }
    return (a.where ?? []).every((w) => compare(n.get(w.path), w.op, w.value));
  });
  const page = matched.slice(a.offset, a.offset + a.limit);
  return {
    sector: read.sector,
    file: read.file,
    total: read.nodes.length,
    matched: matched.length,
    offset: a.offset,
    nodes: page.map((n) => ({ ...(n.toJSON() as object), entry: n.entry, debugName: n.debugName, ...(a.properties?.length ? { properties: Object.fromEntries(a.properties.map((p) => [p, n.get(p)])) } : {}) })),
  };
});

tool("sector_node", `One node of a .streamingsector in full: its node and its node data entry as WolvenKit JSON. ${NodeFacts} A collision or proxy node can be very large: read single values with sector_nodes' properties instead.`, {
  ...SectorSourceShape,
  entry: z.number().int().min(0).describe("The node data entry."),
}, async (a, b) => {
  const read = await readSector(b, a);
  const n = read.nodes[a.entry];
  if (!n) throw new Error(`${read.sector} has ${read.nodes.length} node data entries; there is no ${a.entry}`);
  const out = { ...(n.toJSON() as object), entry: n.entry, debugName: n.debugName, nodeIndex: n.nodeIndex, json: n.json };
  const text = JSON.stringify(out, null, 2);
  if (text.length > 400_000) throw new Error(`Node ${a.entry} is ${(text.length / 1e6).toFixed(1)} MB as JSON (a ${n.type}). Read the values needed with sector_nodes' properties.`);
  return text;
});

tool("sector_patch", `Changes values of nodes in a project's copy of a .streamingsector and saves it. Refuses the game's copy: add the sector to the project first. ${PropertyPaths} The project's sector then replaces the game's whole sector, which undoes what other mods change in it, such as EDGEbuilder's ArchiveXL deletions: tell the modder. If the sector is open in REDcode, ask the modder to save or close it there first: REDcode does not reload a file changed outside it.`, {
  ...SectorSourceShape,
  changes: z.array(z.object({ entry: z.number().int().min(0), property: z.string(), value: z.unknown() })).min(1).max(20000),
}, async (a, b) => {
  const read = await readSector(b, a);
  for (const c of a.changes) {
    const n = read.nodes[c.entry];
    if (!n) throw new Error(`No node data entry ${c.entry}`);
    n.set(c.property, c.value);
  }
  const changes = [...read.changes.values()];
  const applied = await applyToSector(b, read, changes);
  return { file: read.file, applied, changes: changes.slice(0, 500).map((c) => describeChange(c)) };
});

/** The examples shipped beside the server (dist/scripts), and the modder's and the project's own. */
function scriptPlaces(project?: string): { place: ScriptPlace; dir: string }[] {
  const dir = project ?? currentProjectDir();
  return [...(dir ? [{ place: "project" as const, dir: projectScriptsDir(dir) }] : []), { place: "mine", dir: myScriptsDir() }, { place: "example", dir: path.join(__dirname, "scripts") }];
}

tool("script_list", "The modder's sector scripts, as REDcode's Scripts menu lists them: the project's own (.redcode\\scripts), the modder's own (%APPDATA%\\Edgemodders\\redcode\\scripts) and REDcode's examples. Each is an .mjs file whose default export has a name and visit(node, ctx) or run(ctx).", {
  project: z.string().optional().describe("The WolvenKit project's folder; by default the one REDcode has open."),
}, async (a) => listScripts(scriptPlaces(a.project)).map((s) => ({ name: s.name, description: s.description, place: s.place, file: s.file })));

tool("script_run", `Runs one of the modder's sector scripts (script_list) on a .streamingsector, in its own process, and returns what it selected and the changes it would make. Changes are written only with apply: true, and only to a project's copy, as sector_patch does. game.read works; tools.call and agent.request work only in REDcode. A script runs as the modder: run only scripts the modder knows.`, {
  ...SectorSourceShape,
  script: z.string().describe("The script's name, as script_list gives it, or its .mjs file."),
  entries: z.array(z.number().int()).optional().describe("Run on these node data entries only, as Run on Selection does."),
  apply: z.boolean().default(false).describe("Write its changes to the project's copy and save it."),
}, async (a, b) => {
  const list = listScripts(scriptPlaces(a.project));
  const s = list.find((x) => x.file.toLowerCase() === path.resolve(a.script).toLowerCase()) ?? list.find((x) => x.name.toLowerCase() === a.script.toLowerCase());
  if (!s && !(path.isAbsolute(a.script) && fs.existsSync(a.script))) throw new Error(`No script ${a.script}. script_list names them: ${list.map((x) => x.name).join(", ")}`);
  const file = s?.file ?? a.script;
  const read = await readSector(b, a);
  const logs: string[] = [];
  const result = await runScript({
    runner: path.join(__dirname, "scriptRunner.cjs"),
    script: file,
    sector: read.sector,
    json: read.json,
    only: a.entries,
    onLog: (line) => logs.push(line),
    onCall: async (method, params) => {
      if (method !== "read") throw new Error(`${method} works only when the script runs in REDcode`);
      const p = String((params as { path?: string }).path ?? "");
      const own = locateSector({ path: p, project: a.project });
      const r = own.file ? await b.fileToJson(own.file) : await b.toJson(p);
      return r.json;
    },
  }).result;
  const applied = a.apply ? await applyToSector(b, read, result.changes) : 0;
  return {
    script: s?.name ?? path.basename(file),
    sector: read.sector,
    file: read.file,
    visited: result.visited,
    total: result.total,
    selected: result.selected,
    changes: result.changes.length,
    changeList: result.changes.slice(0, 500).map((c) => describeChange(c)),
    applied,
    log: logs.slice(0, 200),
    ms: result.ms,
  };
});

const requestsDir = (project?: string) => {
  const dir = project ?? currentProjectDir();
  if (!dir) throw new Error("No project: pass project, or open one in REDcode");
  return path.join(dir, ".redcode", "requests");
};

tool("request_get", "The requests a sector script made for an assistant (agent.request in REDcode): without id, the list; with id, the request in full, with its text, the sector and the nodes it names. Do the work it asks with the sector_* tools, then call request_done.", {
  id: z.number().int().min(1).optional(),
  project: z.string().optional().describe("The WolvenKit project's folder; by default the one REDcode has open."),
}, async (a) => {
  const dir = requestsDir(a.project);
  if (a.id !== undefined) {
    const file = path.join(dir, `${a.id}.json`);
    if (!fs.existsSync(file)) throw new Error(`No request ${a.id} in ${dir}`);
    return fs.readFileSync(file, "utf8");
  }
  const files = fs.existsSync(dir) ? fs.readdirSync(dir).filter((n) => /^\d+\.json$/.test(n)) : [];
  return files
    .map((n) => JSON.parse(fs.readFileSync(path.join(dir, n), "utf8")) as { id: number; state: string; text: string; sector: string; created: string; nodes?: unknown[] })
    .sort((x, y) => y.id - x.id)
    .map((r) => ({ id: r.id, state: r.state, text: r.text, sector: r.sector, created: r.created, nodes: r.nodes?.length ?? 0 }));
});

tool("request_done", "Marks a sector script's request as done, with a short note of what was done, which REDcode's modder reads.", {
  id: z.number().int().min(1),
  note: z.string().optional(),
  project: z.string().optional(),
}, async (a) => {
  const file = path.join(requestsDir(a.project), `${a.id}.json`);
  if (!fs.existsSync(file)) throw new Error(`No request ${a.id}`);
  const r = JSON.parse(fs.readFileSync(file, "utf8")) as Record<string, unknown>;
  Object.assign(r, { state: "done", done: new Date().toISOString(), ...(a.note ? { note: a.note } : {}) });
  fs.writeFileSync(file, JSON.stringify(r, null, 2) + "\n");
  return { id: a.id, state: "done" };
});

// ---- start ------------------------------------------------------------------------------------

async function main(): Promise<void> {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  log(`redcode-mcp ${Version} ready (bridge ${config.exe})`);
  const stop = () => {
    bridge?.stop();
    process.exit(0);
  };
  process.on("SIGINT", stop);
  process.on("SIGTERM", stop);
  process.stdin.on("close", stop);
}

main().catch((e) => {
  log(`fatal: ${e instanceof Error ? e.message : String(e)}`);
  process.exit(1);
});
