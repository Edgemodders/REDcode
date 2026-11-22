// Animation Tools (REDcode's docs/design/animation-tools.md, AT3): a REDnode pack that makes animations from words
// with Uthana and plays them on a character spawned in front of V. Clips go into REDcode's open project (the
// pack's own project when none is open), each in its own set with the record EDGEdir and EDGEfab read, through
// @edgemodders/anim-core; the project is packed (REDcode's pack.ts) and swapped into the running game; a workspot
// per rig, written by REDnode, holds every made clip of that rig, and the character plays the one picked.
// Works without VS Code: REDbridge comes through REDnode (the bridge permission), the key through REDnode's own
// key window (keys:uthana). Built into dist/packs/animation-tools by packs/animation-tools/build.mjs.

import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { api, archives, game, kernel, pkg, secrets, ui, world } from 'rednode';
import * as anim from '../../../packages/anim-core/src/index';
import { findProject } from '../../../extensions/redcode/src/project';
import { packProject } from '../../../extensions/redcode/src/pack';

const Version = '0.1.0';

/** The characters to start with: NPC records on the rigs anim-core makes clips for. */
const Characters = [
  { value: 'Character.trauma_team_paramedic', label: 'Trauma Team medic (man)', rig: 'man_base' },
  { value: 'Character.LightCrowd_corpoplaza_ma', label: 'Corpo plaza man (man)', rig: 'man_base' },
  { value: 'Character.LightCrowd_corpoplaza_wa', label: 'Corpo plaza woman (woman)', rig: 'woman_base' },
  { value: 'other', label: 'Another record…', rig: '' },
  { value: 'v', label: 'V (waits on REDnode #47)', rig: '', disabled: true },
];
const Models = [
  { value: 'text-to-motion-3.0', label: '3.0, $0.10/s', perSecond: 0.1, min: 4 },
  { value: 'text-to-motion-3.0-lite', label: '3.0 Lite, $0.10/s', perSecond: 0.1, min: 5 },
  { value: 'text-to-motion-3.0-mini', label: '3.0 Mini, $0.075/s', perSecond: 0.075, min: 5 },
];
const Stages = {
  'stand-in': 'Getting the stand-in character on Uthana (once per rig)…',
  queued: 'Uthana has the job…',
  running: 'Uthana is making the motion…',
  downloading: 'Downloading the motion…',
  fitting: "Fitting it onto the game's rig…",
  importing: 'Writing the clip into the project…',
  done: 'Made.',
};
/** Each stage's short name for the busy button, and how far along it is (of StageCount). */
const StageSteps = {
  key: [0, 'Asking for the key'],
  'stand-in': [1, 'Stand-in'],
  queued: [2, 'Queued at Uthana'],
  running: [3, 'Uthana is making it'],
  downloading: [4, 'Downloading'],
  fitting: [5, 'Fitting'],
  importing: [6, 'Writing the clip'],
  playing: [7, 'Packing and playing'],
  done: [8, 'Done'],
};
const StageCount = 8;
/** What each stage is doing, in words, shown under the busy button. */
const StageWhy = {
  key: 'Getting your Uthana key from the shared store. The first time, REDnode asks you.',
  'stand-in': "Uthana needs a character with the game's skeleton to put the motion on. It is uploaded once per rig, free.",
  queued: 'Uthana has the words and is starting the job. Nothing is charged until it finishes.',
  running: 'Uthana is making the motion from your words. This takes a minute or two.',
  downloading: "Fetching the finished motion, already on the game's skeleton.",
  fitting: "Turning it into the game's own clip format: every bone keyed, the feet on the floor.",
  importing: 'REDbridge is writing the clip into the project, in its own set.',
  playing: 'Packing the project, swapping it into the running game, and playing the clip.',
};
/** A spinner for the busy button: the overlay draws these from Windows' symbol fonts. */
const Spinner = ['◐', '◓', '◑', '◒'];

// ---- state --------------------------------------------------------------------------------------

let projectDir = '';
let projectFrom = '';
let character = Characters[0];
let otherRecord = '';
let otherRig = 'man_base';
let model = Models[0];
let length = 5;
let inPlace = true;
let playWhenMade = true;
let upperBodyOnly = false;
let prompt = '';
let name = '';
let pickedClip = '';
/** The spawned character: its id, record, rig, and the workspot it carries. */
let actor = null;
/** Per rig: the workspot written last, and the clips it holds. */
const workspots = new Map();
/** The project's archive as last swapped in: its modified time. */
let swapped = "";
let busy = '';

const cacheDir = path.join(pkg.dataDir, 'cache');
const ownProject = () => path.join(os.homedir(), 'Documents', 'REDnode', 'Animation Tools');

// ---- the window ---------------------------------------------------------------------------------

const projectLine = ui.text('Looking for REDcode’s project…', { tone: 'dim' });
const status = ui.text('Pick a character, Spawn, then say what to do and Generate.', { tone: 'dim' });
const log = ui.list({ keep: 400, height: 140 });
const say = (text) => {
  log.push(`${new Date().toLocaleTimeString()}  ${text}`);
  console.log(text);
};
const show = (text, tone = 'dim') => status.set({ text, tone });

const characterPick = ui.select('Character', Characters.map(({ value, label, disabled }) => ({ value, label, disabled })), {
  value: character.value,
  onChange: (v) => {
    character = Characters.find((c) => c.value === v) ?? Characters[0];
    void refreshClips();
  },
});
const otherInput = ui.input({ label: 'Another record', placeholder: 'Character.…', onChange: (v) => (otherRecord = v.trim()) });
const otherRigPick = ui.select('Rig', [{ value: 'man_base', label: 'Man (man_base)' }, { value: 'woman_base', label: 'Woman (woman_base)' }], {
  value: otherRig,
  onChange: (v) => {
    otherRig = v;
    void refreshClips();
  },
});
const otherRow = ui.row(otherInput, otherRigPick);

const promptInput = ui.input({ label: 'What it shows', placeholder: 'a man stands relaxed, raises his right hand and waves hello, then lowers it', onChange: (v) => (prompt = v), onSubmit: () => void generateClip() });
const nameInput = ui.input({ label: 'Name', placeholder: 'from the words', onChange: (v) => (name = v.trim()) });
const modelPick = ui.select('Model', Models.map(({ value, label }) => ({ value, label })), {
  value: model.value,
  onChange: (v) => {
    model = Models.find((m) => m.value === v) ?? Models[0];
    if (length < model.min) length = model.min;
    lengthPick.set({ options: lengths(), value: String(length) });
    priceButton();
  },
});
const lengths = () => Array.from({ length: 11 - model.min }, (_, i) => ({ value: String(model.min + i), label: `${model.min + i} s` }));
const lengthPick = ui.select('Length', lengths(), {
  value: String(length),
  onChange: (v) => {
    length = Number(v);
    priceButton();
  },
});
const generateButton = ui.button('Generate', () => void generateClip());
const priceLabel = () => `Generate, $${(Math.round(model.perSecond * length * 100) / 100).toFixed(2)}`;
const priceButton = () => {
  if (!generating) generateButton.set({ label: priceLabel() });
};
/** Under the button while it works: how far along, and what it is doing (the UI kit has no tooltips). */
const progress = ui.progress(0, { max: StageCount, label: '' });
const why = ui.text('Uthana charges only a finished job. The clip plays on the character when it is made.', { tone: 'dim' });

// ---- busy: one action at a time, the buttons off while one runs ---------------------------------

const spawnButton = ui.button('Spawn', () => void spawn());
const removeButton = ui.button('Remove', () => void remove(), { variant: 'ghost' });
const playButton = ui.button('Play', () => void play(pickedClip));
const stopButton = ui.button('Stop', () => void stop(), { variant: 'ghost' });
const actionButtons = [spawnButton, removeButton, playButton, stopButton, generateButton];
const setButtons = (disabled) => actionButtons.forEach((b) => b.set({ disabled }));

let generating = null; // { stage, started, timer, frame }
const elapsed = (ms) => {
  const s = Math.floor(ms / 1000);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
};
const drawBusy = () => {
  if (!generating) return;
  const [at, short] = StageSteps[generating.stage] ?? [0, generating.stage];
  generateButton.set({ label: `${Spinner[generating.frame++ % Spinner.length]} ${short}… ${elapsed(Date.now() - generating.started)}` });
  progress.set({ value: at, label: `${short}, step ${Math.max(at, 1)} of ${StageCount}` });
};
/** The Generate button busy: disabled, a spinner, the stage and the time so far; the line under it says why. */
function startGenerating() {
  generating = { stage: 'key', started: Date.now(), frame: 0, timer: setInterval(drawBusy, 250) };
  setStage('key');
}
function setStage(stage) {
  if (!generating) return;
  generating.stage = stage;
  why.set({ text: StageWhy[stage] ?? '', tone: 'dim' });
  drawBusy();
}
function stopGenerating(ok) {
  if (!generating) return;
  clearInterval(generating.timer);
  const took = elapsed(Date.now() - generating.started);
  generating = null;
  progress.set({ value: ok ? StageCount : 0, label: ok ? `Done in ${took}` : '' });
  why.set({ text: ok ? 'Uthana charges only a finished job. The clip plays on the character when it is made.' : 'Not made. Uthana charges only a finished job.', tone: 'dim' });
  generateButton.set({ label: priceLabel() });
}
priceButton();

const clipPick = ui.select('Clip', [], { placeholder: 'No made clips on this rig yet', onChange: (v) => (pickedClip = v) });

ui.window({
  title: 'Animation Tools',
  anchor: 'left',
  x: 40,
  y: 60,
  width: 640,
  height: 720,
  closable: true,
  titleButtons: [{ id: 'refresh', label: 'Look for the project and its clips again', icon: 'refresh', onClick: () => void refreshProject() }],
  children: [
    projectLine,
    ui.heading('Character'),
    characterPick,
    otherRow,
    ui.row(spawnButton, removeButton),
    ui.heading('Make a clip'),
    promptInput,
    ui.text('Say what the feet do when they move ("keeps his left foot planted and taps the right"). REDcode asks Uthana for feet that respect the ground: lifting a leg, stepping, running and jumping are fine; floating, sliding and shuffling are not.', { tone: 'dim' }),
    ui.row(modelPick, lengthPick),
    ui.row(nameInput),
    ui.row(ui.toggle('In place', (on) => (inPlace = on), { checked: true }), ui.toggle('Play when made', (on) => (playWhenMade = on), { checked: true }), ui.toggle('Upper body only', (on) => (upperBodyOnly = on), { checked: false })),
    ui.row(generateButton),
    progress,
    why,
    ui.heading('Custom animations'),
    clipPick,
    ui.row(playButton, stopButton),
    status,
    log,
  ],
});

// ---- the project and its clips ----------------------------------------------------------------

/** REDcode's open project (the last-focused window's, from the redcode package's state file), or the pack's own. */
function findTheProject() {
  try {
    const file = path.join(process.env.LOCALAPPDATA ?? path.join(os.homedir(), 'AppData', 'Local'), 'REDcode', 'project.json');
    const state = JSON.parse(fs.readFileSync(file, 'utf8'));
    const dir = state?.project?.dir;
    if (dir && findProject(dir)) return { dir, from: `REDcode's project ${path.basename(dir)}` };
  } catch {
    // no REDcode window has a project open
  }
  const dir = ownProject();
  anim.ensureProject(dir, 'AnimationTools');
  return { dir, from: `the pack's own project (${dir}): open a project in REDcode to make clips there` };
}

async function refreshProject() {
  const p = findTheProject();
  if (p.dir !== projectDir) {
    projectDir = p.dir;
    swapped = "";
    workspots.clear();
  }
  projectFrom = p.from;
  projectLine.set({ text: `Clips go into ${projectFrom}.`, tone: 'dim' });
  await refreshClips();
}

const rigOf = () => anim.Rigs[character.value === 'other' ? otherRig : character.rig];
const recordOf = () => (character.value === 'other' ? otherRecord : character.value);

/** The made clips on the picked character's rig, newest first. */
function clipsForRig() {
  const rig = rigOf();
  if (!rig || !projectDir) return [];
  return anim.madeClips(anim.projectAt(projectDir)).filter((c) => c.anim.rig.toLowerCase() === rig.rig);
}

async function refreshClips(select) {
  const clips = clipsForRig();
  const options = clips.map((c) => ({ value: c.name, label: c.source?.prompt ? `${c.name}: ${String(c.source.prompt).slice(0, 60)}` : c.name }));
  pickedClip = select ?? (clips.some((c) => c.name === pickedClip) ? pickedClip : clips[0]?.name ?? '');
  clipPick.set({ options, value: pickedClip || undefined });
}

// ---- in the game --------------------------------------------------------------------------------

async function step(label, fn) {
  if (busy) {
    say(`${label}: not now, ${busy} is still going`);
    return;
  }
  busy = label;
  // One action at a time: every action button is off until it ends.
  setButtons(true);
  const started = performance.now();
  try {
    const note = await fn();
    if (note) say(`${label}: ${note} (${((performance.now() - started) / 1000).toFixed(1)} s)`);
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    say(`${label} failed: ${message}`);
    show(`${label} failed: ${message}`, 'danger');
  } finally {
    busy = '';
    setButtons(false);
  }
}

async function inFront(metres) {
  const v = await api.GetPlayer(game.instance);
  if (!v) throw new Error('No player: load a save first');
  const p = await v.GetWorldPosition();
  const f = await v.GetWorldForward();
  // Facing V (Probe A's formula).
  const yaw = (Math.atan2(f.Y, f.X) * 180) / Math.PI + 90;
  return { position: { x: p.X + f.X * metres, y: p.Y + f.Y * metres, z: p.Z }, yaw };
}

const bridge = async () => anim.asBridge(await kernel.bridge());

/** The newest change under the project's archive folder: what a pack would carry. */
function archiveStamp(project) {
  let newest = 0;
  let count = 0;
  const walk = (dir) => {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, e.name);
      if (e.isDirectory()) walk(full);
      else {
        count++;
        newest = Math.max(newest, fs.statSync(full).mtimeMs);
      }
    }
  };
  walk(path.join(project.dir, 'source', 'archive'));
  return `${count}|${newest}`;
}

/** Packs the project and swaps its archive into the running game, when its files changed since the last swap. */
async function swapProject() {
  const project = findProject(projectDir);
  if (!project) throw new Error(`${projectDir} is not a WolvenKit project`);
  const stamp = archiveStamp(project);
  if (stamp === swapped) return 'no change since the last swap';
  const b = await kernel.bridge();
  const summary = await packProject({ pack: (dir, outDir, modName) => b.call('project.pack', { dir, outDir, modName }) }, project, { clean: true, redmod: false }, (line) => console.log(line));
  if (!summary.archive) throw new Error('The project has nothing to pack');
  const r = await archives.reload([summary.archive]);
  if (r.failed?.length) throw new Error(`The swap failed: ${JSON.stringify(r.failed).slice(0, 200)}`);
  swapped = stamp;
  return `packed and swapped ${path.basename(summary.archive)} in ${r.ms} ms`;
}

/** The rig's workspot with every made clip on it, written again when the clips changed. */
async function workspotFor(rig) {
  const clips = clipsForRig();
  if (!clips.length) throw new Error('No made clips on this rig yet: Generate one first');
  const key = clips.map((c) => `${c.set}|${c.name}`).sort().join(';');
  const known = workspots.get(rig.id);
  if (known?.key === key) return known.path;
  const written = await world.writeWorkspot(`animtools_${rig.id}`, { clips: clips.map((c) => ({ set: c.set, anim: c.name, name: c.name })), rig: rig.rig });
  workspots.set(rig.id, { key, path: written.path });
  say(`workspot ${written.path}: ${written.entries.length} clip(s)`);
  return written.path;
}

function spawn() {
  return step('Spawn', async () => {
    const record = recordOf();
    const rig = rigOf();
    if (!record || !rig) throw new Error('Pick a character (and for another record, its rig)');
    if (actor) await world.remove(actor.id).catch(() => false);
    actor = null;
    // With clips already made, the character carries the rig's workspot from the start.
    const workspot = clipsForRig().length ? await workspotFor(rig).catch(() => undefined) : undefined;
    const { id } = await world.spawn({ record, ...(await inFront(3)), ...(workspot ? { workspot } : {}) });
    actor = { id, record, rig: rig.id, workspot, playing: false };
    show(`${character.value === 'other' ? record : character.label} stands 3 m in front of V.`);
    return `spawned ${record}`;
  });
}

function remove() {
  return step('Remove', async () => {
    if (actor) await world.remove(actor.id).catch(() => false);
    actor = null;
    show('Removed.');
    return 'removed';
  });
}

/** Plays a made clip on the character: the project swapped in, the rig's workspot written, the clip jumped to. */
/** Plays a made clip on the character: the project swapped in when it changed, the rig's workspot written, the clip jumped to. */
async function playClip(clip) {
  if (!clip) throw new Error('Pick a clip');
  if (!actor) throw new Error('Spawn a character first');
  const rig = anim.Rigs[actor.rig];
  show(`Packing and swapping ${clip} in…`);
  say(`project: ${await swapProject()}`);
  const workspot = await workspotFor(rig);
  if (workspot !== actor.workspot || !actor.playing) {
    // A new workspot spawns the character again carrying it, in the same place.
    const r = await world.useWorkspot(actor.id, { workspot, entry: clip });
    actor.id = r.id;
    actor.workspot = workspot;
    if (!r.started) throw new Error(`the workspot did not start: ${r.why ?? 'unknown'}`);
    actor.playing = true;
  } else if (!(await world.jumpWorkspot(actor.id, clip))) throw new Error(`${clip} is not in the workspot`);
  show(`Playing ${clip}. A brief T pose the first time a workspot plays is the game's own.`, 'accent');
  return `playing ${clip}`;
}

function play(clip) {
  return step('Play', () => playClip(clip));
}

function stop() {
  return step('Stop', async () => {
    if (!actor?.playing) return 'not playing';
    await world.stopWorkspot(actor.id);
    actor.playing = false;
    show('Stopped.');
    return 'stopped';
  });
}

/** A clip name not yet taken in the project: name, name_2… (the pack never makes a clip again in place). */
function freeName(project, wanted) {
  if (!anim.recordOf(project, wanted)) return wanted;
  for (let i = 2; ; i++) if (!anim.recordOf(project, `${wanted}_${i}`)) return `${wanted}_${i}`;
}

function generateClip() {
  return step('Generate', async () => {
    const words = prompt.trim();
    if (!words) throw new Error('Say what the animation shows');
    const rig = rigOf();
    if (!rig) throw new Error('Pick a character on a man’s or woman’s rig');
    startGenerating();
    let ok = false;
    try {
      const key = await secrets.askShared('uthana', { reason: 'Animation Tools makes animations from your words with Uthana, on your Uthana account ($0.10 a second with its 3.0 model).' });
      if (!key) throw new Error('No Uthana key: set it in REDnode’s Keys window or REDcode’s Keys view (service uthana)');
      const project = anim.projectAt(projectDir);
      const clipName = freeName(project, anim.slug(name || anim.clipNameFor(words)));
      show(`Making ${clipName}…`);
      const made = await anim.generate({
        bridge: await bridge(),
        uthana: anim.uthana(key),
        key,
        rig,
        project,
        cacheDir,
        prompt: words,
        length,
        model: model.value,
        inPlace,
        upperBodyOnly,
        name: clipName,
        onStage: (s) => {
          setStage(s);
          show(Stages[s] ?? s);
        },
      });
      say(`made ${made.clip} in ${made.set} ($${made.cost.toFixed(2)}), the hips lifted ${(made.report.grounding.lift * 100).toFixed(1)} cm`);
      await refreshClips(made.clip);
      nameInput.set({ value: '' });
      name = '';
      show(`Made ${made.clip}.${playWhenMade && actor ? ' Playing it…' : ' Pick it and Play.'}`, 'accent');
      if (playWhenMade && actor && actor.rig === rig.id) {
        setStage('playing');
        say(`Play: ${await playClip(made.clip)}`);
      }
      ok = true;
      return `made ${made.clip}`;
    } finally {
      stopGenerating(ok);
    }
  });
}

void refreshProject();
say(`Animation Tools ${Version} ready`);
