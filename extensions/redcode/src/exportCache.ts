// Exports for the viewers: a game file or a file on disk exported through REDbridge's project.export
// (0.7.0) into REDcode's cache, again only when the source is newer than the export. The 3D view
// gets a .glb this way, the audio player an .ogg. No VS Code imports. See docs/design/view.md.

import * as crypto from "node:crypto";
import * as fs from "node:fs";
import * as path from "node:path";
import type { BridgeClient } from "./bridgeClient";
import type { ExportOptions } from "./types";

/** A file on disk (a project's source/archive, or anywhere), or a game path. */
export interface ExportSource {
  file?: string;
  gamePath?: string;
}

export interface CachedExport {
  file: string;
  /** True when the cached export was still newer than the source. */
  cached: boolean;
}

export const mtime = (f: string): number => {
  try {
    return fs.statSync(f).mtimeMs;
  } catch {
    return -1;
  }
};

/**
 * What the game files in a cache were extracted from: the game folder and its exe's size and
 * modified time, so a game patch or another game folder shows.
 */
export function gameStamp(gameDir: string | null): string {
  if (!gameDir) return "no game";
  try {
    const s = fs.statSync(path.join(gameDir, "bin", "x64", "Cyberpunk2077.exe"));
    return `${path.resolve(gameDir).toLowerCase()}|${s.size}|${Math.round(s.mtimeMs)}`;
  } catch {
    return `${path.resolve(gameDir).toLowerCase()}|no exe`;
  }
}

/**
 * Empties cacheRoot/game when its files came from another game build or folder, or from before
 * the stamp existed (so every cache made on game 2.31): a patch moves sounds inside the sound
 * index and its packs, and an old index read against new packs finds no sound. Returns the
 * stamp. Exports made from the old files are made again, since the new files are newer.
 */
export function checkGameCache(cacheRoot: string, stamp: string): string {
  const dir = path.join(cacheRoot, "game");
  const file = path.join(dir, "stamp.txt");
  let old: string | undefined;
  try {
    old = fs.readFileSync(file, "utf8").trim();
  } catch {
    // none yet
  }
  if (old === stamp) return stamp;
  fs.rmSync(dir, { recursive: true, force: true });
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(file, `${stamp}\n`);
  return stamp;
}

// The stamp each cache was last checked against in this process, so a check is a compare.
const checkedStamps = new Map<string, string>();

/**
 * Checks the cache against the game the bridge has loaded (Set Game Folder can change it while
 * the bridge runs) and returns its stamp; undefined with no game loaded.
 */
export async function gameCacheReady(bridge: BridgeClient, cacheRoot: string): Promise<string | undefined> {
  const info = await bridge.info();
  if (!info.gameDir) return undefined;
  const stamp = gameStamp(info.gameDir);
  if (checkedStamps.get(cacheRoot) !== stamp) {
    checkGameCache(cacheRoot, stamp);
    checkedStamps.set(cacheRoot, stamp);
  }
  return stamp;
}

/** Where a source sits for the exporter: a game path is extracted into cacheRoot/game/archive first. */
export async function sourceFile(bridge: BridgeClient, cacheRoot: string, source: ExportSource): Promise<{ file: string; archiveDir: string }> {
  if (source.gamePath) {
    await gameCacheReady(bridge, cacheRoot);
    const archiveDir = path.join(cacheRoot, "game", "archive");
    const file = path.join(archiveDir, ...source.gamePath.split("\\"));
    if (!fs.existsSync(file)) await bridge.extract(source.gamePath, file);
    return { file, archiveDir };
  }
  if (!source.file) throw new Error("An export needs a file or a game path");
  const file = path.resolve(source.file);
  // Inside a project, the archive root keeps the game path; elsewhere the file's own folder does.
  const marker = `${path.sep}source${path.sep}archive${path.sep}`;
  const at = file.toLowerCase().indexOf(marker);
  return { file, archiveDir: at >= 0 ? file.slice(0, at + marker.length - 1) : path.dirname(file) };
}

/**
 * The export of a source with the extension ext (".glb", ".ogg"), from the cache when it is newer
 * than the source. what names the format in the error, for a file WolvenKit could not convert.
 */
export async function cachedExport(bridge: BridgeClient, cacheRoot: string, source: ExportSource, ext: string, options: ExportOptions, what: string): Promise<CachedExport> {
  const { file, archiveDir } = await sourceFile(bridge, cacheRoot, source);
  const key = crypto.createHash("sha1").update(archiveDir.toLowerCase()).digest("hex").slice(0, 12);
  const rawDir = path.join(cacheRoot, "raw", key);
  const rel = path.relative(archiveDir, file);
  const out = path.join(rawDir, rel.slice(0, rel.length - path.extname(rel).length) + ext);
  if (mtime(out) > mtime(file)) return { file: out, cached: true };
  const r = await bridge.exportFile(file, archiveDir, rawDir, options);
  if (!r.ok || !fs.existsSync(out)) {
    throw new Error(`WolvenKit could not export ${path.basename(file)} to ${what}${r.written.length ? `; it wrote ${r.written.join(", ")}` : ""}`);
  }
  return { file: out, cached: false };
}
