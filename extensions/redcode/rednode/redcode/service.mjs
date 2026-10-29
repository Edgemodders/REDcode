// REDcode's service in REDnode (REDcode issue #18): other packages call it by this package's id,
// "redcode", and assistants see project() as the tool redcode__project.
//
// REDcode (the VS Code extension) writes the project open in its window to
// %LOCALAPPDATA%\REDcode\project.json whenever it changes, with the process id of that window's
// extension host. This file reads it. With several VS Code windows, the one last focused with a
// project open wrote it. A process id that no longer runs means the window closed.

import * as fs from 'node:fs';
import * as path from 'node:path';
import { service } from 'rednode';

/**
 * @event project-changed {{ name: string, modName: string, file: string, dir: string, archive: string, raw: string, resources: string, packed: string } | null} The project open in REDcode changed, or REDcode closed (null).
 */

const dir = path.join(process.env.LOCALAPPDATA ?? '', 'REDcode');
const file = path.join(dir, 'project.json');

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

// project-changed: on a change to the file, and every few seconds for a window that closed
// without clearing it (VS Code ended, or crashed).
let last = JSON.stringify(read());
function check() {
  const now = read();
  const json = JSON.stringify(now);
  if (json === last) return;
  last = json;
  service.emit('project-changed', now);
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
setInterval(check, 5000).unref?.();
