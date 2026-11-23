// The game's window mode and resolution, for Run Game in Tab (docs/design/game-view.md). The game keeps
// them in %LOCALAPPDATA%\CD Projekt Red\Cyberpunk 2077\UserSettings.json, group /video/display, as
// string_list options with a value and an index. The game does not follow an outside resize, so the
// docked window must be the game's own size: REDcode writes a windowed size before it starts the game
// and puts the player's values back after the game ends.
// No VS Code imports, so scripts/unit.mjs can run it.

import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";

/** Where the game keeps its settings. */
export function userSettingsFile(localAppData = process.env.LOCALAPPDATA ?? path.join(os.homedir(), "AppData", "Local")): string {
  return path.join(localAppData, "CD Projekt Red", "Cyberpunk 2077", "UserSettings.json");
}

/** One string_list option as the file has it. */
export interface DisplayOption {
  value: string;
  index: number;
}

export interface Display {
  windowMode: DisplayOption;
  resolution: DisplayOption;
}

/** The game's window modes, in the order of its list (read from the game through REDnode, 2026-11-22). */
export const WindowModes = ["Windowed", "BorderlessWindowed", "Fullscreen"];

// One option object: "name": "<name>", ... "value": "<text>", "index": <n> }, in that order, as the game writes it.
function optionPattern(name: string): RegExp {
  return new RegExp(`("name"\\s*:\\s*"${name}"[^{}]*?"value"\\s*:\\s*")([^"]*)("\\s*,\\s*"index"\\s*:\\s*)(-?\\d+)`);
}

function readOption(text: string, name: string): DisplayOption | undefined {
  const m = optionPattern(name).exec(text);
  return m ? { value: m[2], index: Number(m[4]) } : undefined;
}

/** The window mode and resolution in a settings file's text, or undefined when it has neither shape. */
export function readDisplay(text: string): Display | undefined {
  const windowMode = readOption(text, "WindowMode");
  const resolution = readOption(text, "Resolution");
  return windowMode && resolution ? { windowMode, resolution } : undefined;
}

/**
 * The settings text with another window mode and resolution, every other byte kept. An index left out
 * keeps the file's own: the resolution list depends on the monitor, so its index is known only for a
 * value read from the same file earlier.
 */
export function patchDisplay(text: string, to: { windowMode?: Partial<DisplayOption>; resolution?: Partial<DisplayOption> }): string {
  let out = text;
  for (const [name, option] of [["WindowMode", to.windowMode], ["Resolution", to.resolution]] as const) {
    if (!option) continue;
    out = out.replace(optionPattern(name), (_all, a: string, value: string, b: string, index: string) => `${a}${option.value ?? value}${b}${option.index ?? index}`);
  }
  return out;
}

/** "1920x1080" as numbers, or undefined. */
export function parseSize(text: string): { width: number; height: number } | undefined {
  const m = /^\s*(\d{3,5})\s*x\s*(\d{3,5})\s*$/i.exec(text);
  return m ? { width: Number(m[1]), height: Number(m[2]) } : undefined;
}

/** The sizes every monitor's list has. A bigger one is only safe when the setting names it. */
export const CommonSizes = ["1280x720", "1920x1080"];

/**
 * The resolution for a tab of this many real pixels: the setting when it names a size, else the largest
 * common size that fits, else the smallest (the tab then shows a part of the game).
 */
export function pickResolution(tab: { width: number; height: number } | undefined, setting = "auto", sizes: string[] = CommonSizes): string {
  if (parseSize(setting)) return setting.replace(/\s+/g, "").toLowerCase();
  // Smallest first, whatever order the game lists them in.
  const list = sizes.filter((s) => parseSize(s)).sort((a, b) => parseSize(a)!.width - parseSize(b)!.width || parseSize(a)!.height - parseSize(b)!.height);
  if (!list.length) return CommonSizes[0];
  if (!tab) return list.includes("1920x1080") ? "1920x1080" : list[0];
  const fits = list.filter((s) => {
    const size = parseSize(s)!;
    return size.width <= tab.width && size.height <= tab.height;
  });
  return fits.length ? fits[fits.length - 1] : list[0];
}

/** True when the game at this size shows whole in a tab of this many real pixels. */
export function fitsTab(resolution: string, tab: { width: number; height: number } | undefined): boolean {
  const size = parseSize(resolution);
  return !!size && !!tab && size.width <= tab.width && size.height <= tab.height;
}

/** What Run Game in Tab changed, kept until the game has ended and the values are back. */
export interface DisplayRestore {
  file: string;
  windowMode: DisplayOption;
  resolution: DisplayOption;
}

/**
 * Writes Windowed and the resolution into the game's settings before a start. Returns what to put back,
 * or undefined when the file is missing or not the known shape (the game then starts as it was).
 */
export function setWindowed(resolution: string, file = userSettingsFile()): DisplayRestore | undefined {
  let text: string;
  try {
    text = fs.readFileSync(file, "utf8");
  } catch {
    return undefined;
  }
  const was = readDisplay(text);
  if (!was) return undefined;
  const same = was.resolution.value === resolution;
  const next = patchDisplay(text, {
    windowMode: { value: WindowModes[0], index: 0 },
    // The index of another size is not known from the file: the hand test checks the game goes by the value.
    resolution: same ? was.resolution : { value: resolution },
  });
  if (next !== text) fs.writeFileSync(file, next, "utf8");
  return { file, windowMode: was.windowMode, resolution: was.resolution };
}

/**
 * Puts the player's window mode and resolution back. Only the two values change, so a setting the
 * player changed in the game meanwhile is kept. Returns false when the file could not be written.
 */
export function restoreDisplay(restore: DisplayRestore): boolean {
  try {
    const text = fs.readFileSync(restore.file, "utf8");
    const next = patchDisplay(text, { windowMode: restore.windowMode, resolution: restore.resolution });
    if (next !== text) fs.writeFileSync(restore.file, next, "utf8");
    return true;
  } catch {
    return false;
  }
}
