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

// A request file answered in an answer file: only a fresh request from a REDcode that still runs, so an
// old file never acts on a later game.
function answerRequests(requestName, answerName, handle) {
  const request = path.join(dir, requestName);
  const answerFile = path.join(dir, answerName);
  let done = '';
  let busy = false;
  async function check() {
    if (busy) return;
    let want;
    try {
      want = JSON.parse(fs.readFileSync(request, 'utf8'));
    } catch {
      return; // none, or being written: the next change reads it
    }
    if (typeof want?.id !== 'string' || want.id === done) return;
    done = want.id;
    if (!Number.isInteger(want.pid) || !running(want.pid) || Math.abs(Date.now() - Date.parse(want.at)) > 30000) return;
    busy = true;
    let answer;
    try {
      answer = { id: want.id, ok: true, ...(await handle(want)) };
    } catch (e) {
      answer = { id: want.id, ok: false, error: e.message };
    }
    busy = false;
    try {
      const tmp = `${answerFile}.tmp`;
      fs.writeFileSync(tmp, JSON.stringify({ ...answer, at: new Date().toISOString() }, null, 2));
      fs.renameSync(tmp, answerFile);
    } catch (e) {
      console.log(`Cannot write ${answerFile}: ${e.message}`);
    }
    check();
  }
  try {
    fs.watch(dir, (_event, name) => {
      if (!name || name.toLowerCase() === requestName) setTimeout(check, 50);
    });
  } catch {
    // The 2-second check below still sees a request.
  }
  setInterval(check, 2000).unref?.();
}

answerRequests('display-request.json', 'display.json', async (want) => {
  const answer = await setDisplay(want);
  if (answer.changed) console.log(`REDcode set the game to ${answer.windowMode} ${answer.resolution}`);
  return answer;
});

// ---- V's place, for REDcode's EDGEworld: Open Sector Here (docs/design/sector-layers.md, L4) ----

/**
 * Where V stands in the world: the position in metres and the way V faces, in the game's axes (Z up).
 * Needs a loaded save.
 * @tool
 * @readonly
 * @returns {{ position: number[], forward: number[] }} V's place.
 */
export async function place() {
  const player = await api.GetPlayer(game.instance);
  if (!player) throw new Error('No player: load a save first.');
  const p = await player.GetWorldPosition();
  const f = await player.GetWorldForward();
  return { position: [p.X, p.Y, p.Z], forward: [f.X, f.Y, f.Z] };
}

answerRequests('place-request.json', 'place.json', () => place());

// ---- Open in REDcode, from the game (docs/design/sector-layers.md, L4; docs/design/sector-tools.md) ----
// openSector writes open-request.json beside project.json. Every REDcode window watches it; the one last
// focused with a project open takes it first (the others a moment later, in case it does not answer),
// and the window that takes it leaves open-<id>.claim with its process id.

const openRequest = path.join(dir, 'open-request.json');

/**
 * Opens a streaming sector in REDcode (VS Code), in its 3D sector view with one node data entry picked: the
 * project's copy when the project has one, else the game's. The REDcode window last used with a project
 * takes it. VS Code does not come to the front by itself.
 * @tool
 * @param {string | { sector: string, entry?: number }} sector The sector's depot path (base\worlds\...\name.streamingsector), or { sector, entry }.
 * @param {number} [entry] The node data entry's index to pick, when sector is the path.
 * @returns {{ opened: boolean, window?: number, why?: string }} Whether a REDcode window took it, its process id, and why not.
 */
export async function openSector(sector, entry) {
  const want = typeof sector === 'object' && sector ? sector : { sector, entry };
  if (typeof want.sector !== 'string' || !/\.streamingsector$/i.test(want.sector)) throw new Error(`openSector takes a .streamingsector's depot path, not ${want.sector}`);
  if (want.entry !== undefined && want.entry !== null && (!Number.isInteger(want.entry) || want.entry < 0)) throw new Error(`openSector's entry is a node data index (0 or more), not ${want.entry}`);
  const id = `${process.pid}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  fs.mkdirSync(dir, { recursive: true });
  // Claims of earlier requests go.
  for (const n of fs.readdirSync(dir)) {
    const f = path.join(dir, n);
    try {
      if (/^open-.*\.claim$/.test(n) && Date.now() - fs.statSync(f).mtimeMs > 60000) fs.rmSync(f, { force: true });
    } catch {
      // Gone already.
    }
  }
  const tmp = `${openRequest}.${process.pid}.tmp`;
  const request = { id, at: new Date().toISOString(), sector: want.sector.replace(/\//g, '\\'), ...(Number.isInteger(want.entry) ? { entry: want.entry } : {}) };
  fs.writeFileSync(tmp, JSON.stringify(request, null, 2));
  fs.renameSync(tmp, openRequest);
  const claim = path.join(dir, `open-${id}.claim`);
  const end = Date.now() + 4000;
  while (Date.now() < end) {
    await new Promise((r) => setTimeout(r, 150));
    try {
      const pid = Number(fs.readFileSync(claim, 'utf8'));
      return { opened: true, window: pid };
    } catch {
      // Not yet.
    }
  }
  fs.rmSync(openRequest, { force: true });
  return { opened: false, why: 'No REDcode window answered: open VS Code with REDcode 0.10.18 or later.' };
}
