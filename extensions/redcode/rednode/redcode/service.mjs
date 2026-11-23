// REDcode's service in REDnode (REDcode issue #18): other packages call it by this package's id,
// "redcode", and assistants see project() as the tool redcode__project.
//
// REDcode (the VS Code extension) writes the project open in its window to
// %LOCALAPPDATA%\REDcode\project.json whenever it changes, with the process id of that window's
// extension host. This file reads it. With several VS Code windows, the one last focused with a
// project open wrote it. A process id that no longer runs means the window closed.

import * as fs from 'node:fs';
import * as path from 'node:path';
import { api, game, service } from 'rednode';

/**
 * @event project-changed {{ name: string, modName: string, file: string, dir: string, archive: string, raw: string, resources: string, packed: string } | null} The project open in REDcode changed, or REDcode closed (null).
 */

/**
 * @event projects-changed {{ name: string, modName: string, file: string, dir: string, archive: string, raw: string, resources: string, packed: string, focusedAt: string }[]} The projects open in REDcode's windows changed: one opened, closed, or another window got the focus.
 */

const dir = path.join(process.env.LOCALAPPDATA ?? '', 'REDcode');
const file = path.join(dir, 'project.json');
// Each VS Code window's own state (REDcode issue #32): projects\<extension host pid>.json.
const windows = path.join(dir, 'projects');

function running(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch (e) {
    // EPERM: the process runs, under another user.
    return e.code === 'EPERM';
  }
}

function read() {
  try {
    const state = JSON.parse(fs.readFileSync(file, 'utf8'));
    return state.project && Number.isInteger(state.pid) && running(state.pid) ? state.project : null;
  } catch {
    return null;
  }
}

/**
 * The WolvenKit project open in REDcode (VS Code): its name, mod name, .cpmodproj file, folder, and
 * its source/archive, source/raw, source/resources and packed folders. Null when REDcode is not
 * running or has no project open. Game files a modder adds to the project are under archive, at
 * their game paths.
 * @tool
 * @readonly
 * @returns {{ name: string, modName: string, file: string, dir: string, archive: string, raw: string, resources: string, packed: string } | null} The project, or null.
 */
export function project() {
  return read();
}

function readAll() {
  let names;
  try {
    names = fs.readdirSync(windows).filter((n) => /^\d+\.json$/i.test(n));
  } catch {
    return [];
  }
  const out = [];
  for (const n of names) {
    try {
      const state = JSON.parse(fs.readFileSync(path.join(windows, n), 'utf8'));
      if (!state.project || !Number.isInteger(state.pid)) continue;
      if (!running(state.pid)) {
        // A window that closed without clearing its file (VS Code ended, or crashed).
        fs.rmSync(path.join(windows, n), { force: true });
        continue;
      }
      out.push({ ...state.project, focusedAt: state.focusedAt ?? state.updated ?? '' });
    } catch {
      // Being written: the next check reads it.
    }
  }
  return out.sort((a, b) => b.focusedAt.localeCompare(a.focusedAt));
}

/**
 * Every WolvenKit project open in REDcode, one per VS Code window, the window last focused first. Each
 * has what project() gives, and focusedAt: when its window last had the focus. Empty when REDcode is
 * not running or no window has a project open.
 * @tool
 * @readonly
 * @returns {{ name: string, modName: string, file: string, dir: string, archive: string, raw: string, resources: string, packed: string, focusedAt: string }[]} The projects.
 */
export function projects() {
  return readAll();
}

// project-changed and projects-changed: on a change to the files, and every few seconds for a window
// that closed without clearing them (VS Code ended, or crashed).
let last = JSON.stringify(read());
let lastAll = JSON.stringify(readAll());
function check() {
  const now = read();
  const json = JSON.stringify(now);
  if (json !== last) {
    last = json;
    service.emit('project-changed', now);
  }
  const all = readAll();
  const allJson = JSON.stringify(all);
  if (allJson !== lastAll) {
    lastAll = allJson;
    service.emit('projects-changed', all);
  }
}

let timer;
function changed() {
  clearTimeout(timer);
  timer = setTimeout(check, 200);
}

try {
  fs.mkdirSync(dir, { recursive: true });
  fs.watch(dir, (_event, name) => {
    if (!name || name.toLowerCase() === 'project.json') changed();
  });
} catch (e) {
  console.log(`Cannot watch ${dir}: ${e.message}. project-changed comes from the 5-second check only.`);
}
try {
  fs.mkdirSync(windows, { recursive: true });
  fs.watch(windows, () => changed());
} catch (e) {
  console.log(`Cannot watch ${windows}: ${e.message}. projects-changed comes from the 5-second check only.`);
}
setInterval(check, 5000).unref?.();

// The game's window mode and resolution, for REDcode's Run Game in Tab (docs/design/game-view.md).
// REDcode asks by writing display-request.json beside project.json; the answer goes to display.json.
// It is a file, not a tool, so the click in VS Code is the player's say and the game asks nothing more.
const displayRequest = path.join(dir, 'display-request.json');
const displayAnswer = path.join(dir, 'display.json');

async function displayVars() {
  const settings = await api.GameInstance.GetSettingsSystem(game.instance);
  const mode = await settings.GetVar('/video/display', 'WindowMode');
  const size = await settings.GetVar('/video/display', 'Resolution');
  if (!mode || !size) throw new Error('The game has no /video/display WindowMode and Resolution settings.');
  return { settings, mode, size };
}

async function readDisplay(vars) {
  const { mode, size } = vars ?? (await displayVars());
  return {
    windowMode: await mode.GetValue(),
    resolution: await size.GetValue(),
    windowModes: await mode.GetValues(),
    resolutions: await size.GetValues(),
  };
}

/**
 * The game's window mode and resolution, with the lists the game offers for each on this monitor.
 * Works in the main menu too.
 * @tool
 * @readonly
 * @returns {{ windowMode: string, resolution: string, windowModes: string[], resolutions: string[] }} The display settings.
 */
export async function display() {
  return readDisplay();
}

// Sets the window mode and the resolution, each only when asked and listed, and saves them as the
// game's own Settings menu does. The game draws at the new size after about three seconds.
async function setDisplay(want) {
  const vars = await displayVars();
  const now = await readDisplay(vars);
  let changed = false;
  for (const [v, value, list, name] of [
    [vars.mode, want.windowMode, now.windowModes, 'window mode'],
    [vars.size, want.resolution, now.resolutions, 'resolution'],
  ]) {
    if (typeof value !== 'string' || !value) continue;
    const index = list.indexOf(value);
    if (index < 0) throw new Error(`The game does not list the ${name} ${value}: ${list.join(', ')}`);
    if ((await v.GetIndex()) !== index) {
      await v.SetIndex(index);
      changed = true;
    }
  }
  if (changed) await vars.settings.ConfirmChanges();
  return { ...(await readDisplay(vars)), changed };
}

let displayDone = '';
let displayBusy = false;
async function checkDisplay() {
  if (displayBusy) return;
  let want;
  try {
    want = JSON.parse(fs.readFileSync(displayRequest, 'utf8'));
  } catch {
    return; // none, or being written: the next change reads it
  }
  if (typeof want?.id !== 'string' || want.id === displayDone) return;
  displayDone = want.id;
  // Only a fresh request from a REDcode that still runs: an old file must not change a later game.
  if (!Number.isInteger(want.pid) || !running(want.pid) || Math.abs(Date.now() - Date.parse(want.at)) > 30000) return;
  displayBusy = true;
  let answer;
  try {
    answer = { id: want.id, ok: true, ...(await setDisplay(want)) };
    if (answer.changed) console.log(`REDcode set the game to ${answer.windowMode} ${answer.resolution}`);
  } catch (e) {
    answer = { id: want.id, ok: false, error: e.message };
  }
  displayBusy = false;
  try {
    const tmp = `${displayAnswer}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify({ ...answer, at: new Date().toISOString() }, null, 2));
    fs.renameSync(tmp, displayAnswer);
  } catch (e) {
    console.log(`Cannot write ${displayAnswer}: ${e.message}`);
  }
  checkDisplay();
}

try {
  fs.watch(dir, (_event, name) => {
    if (!name || name.toLowerCase() === 'display-request.json') setTimeout(checkDisplay, 50);
  });
} catch {
  // The 2-second check below still sees a request.
}
setInterval(checkDisplay, 2000).unref?.();
