// Spike LS2 (docs/research/lipsync.md, "Live lip sync"): whole mouth shapes from few numbers.
// Needs the test archive made by `node tools/probes/lipsync-live/build-shapes.mjs <outFolder>` in the
// game. It adds core's mouth shapes to the women's face graph: each shape is one number in the anim feature
// `edgefab_mouth`, eased inside the graph (or used as sent, with Raw), and spread over the shape's lip sync
// tracks. One ApplyFeature carries every shape, so a change costs the same whatever the shape.
//
//   1 Person   a woman beside V, facing V, holding still
//   2 Shapes   one button per shape: that shape at 1, the others at 0. Does each look like its sound?
//   3 Steps    every shape in turn, 4 or 8 a second: do they flow into each other?
//   4 A line   "Hello there, how are you" as a hand-timed sequence of shapes, no sound: does it read as speech?
//
// The shapes and the feature's fields are lipsync-core's (packages/lipsync-core/src/shapes.ts), copied here
// in the same order: change both together.

import { api, game, kernel, ui, world } from 'rednode';

const FEATURE = 'edgefab_mouth';
const CLASS = 'AnimFeature_FPPCamera';
const FIELDS = ['fov', 'deltaYaw', 'deltaYawExternal', 'deltaYawInput', 'yawSpeed', 'yawMaxLeft', 'yawMaxRight', 'deltaPitch', 'deltaPitchExternal', 'deltaPitchInput', 'pitchSpeed', 'pitchMin', 'pitchMax'];
const RAW = 'resetYawSpeed';
const SHAPES = [
  ['aa', 'father'],
  ['eh', 'bed'],
  ['ee', 'see'],
  ['oh', 'go'],
  ['oo', 'you, w'],
  ['mbp', 'm, b, p'],
  ['fv', 'f, v'],
  ['th', 'th'],
  ['tdn', 't, d, n, l'],
  ['kg', 'k, g'],
  ['sz', 's, z'],
  ['sh', 'sh, ch'],
  ['r', 'r'],
];
// "Hello there, how are you": [seconds, shape], rest is ''.
const LINE = [
  [0.0, 'eh'], [0.12, 'tdn'], [0.22, 'oh'], [0.42, ''],
  [0.55, 'th'], [0.65, 'eh'], [0.8, 'r'], [0.95, ''],
  [1.1, 'aa'], [1.25, 'oo'], [1.4, 'aa'], [1.55, 'r'],
  [1.68, 'ee'], [1.78, 'oo'], [2.05, ''],
];

let record = 'Character.civilianguard_corporat_ranged1_wa';
let person = null;
let busy = '';
let raw = false;
let strength = 1;
let run = null;

const requires = ui.text('Checking requirements...', { tone: 'dim' });
const now = ui.text('Rest', { tone: 'accent' });
const log = ui.list({ keep: 300 });

function say(text) {
  log.push(`${new Date().toLocaleTimeString()}  ${text}`);
  console.log(text);
}

async function step(label, fn) {
  if (busy) return say(`${label}: not run, ${busy} is still running`);
  busy = label;
  const started = performance.now();
  try {
    const note = await fn();
    say(`${label}: ${note ?? 'done'} (${(performance.now() - started).toFixed(0)} ms)`);
  } catch (err) {
    say(`${label} failed: ${err.message}`);
  } finally {
    busy = '';
  }
}

async function inFront(metres) {
  const v = await api.GetPlayer(game.instance);
  if (!v) throw new Error('No player: load a save first');
  const p = await v.GetWorldPosition();
  const f = await v.GetWorldForward();
  const yaw = (Math.atan2(f.Y, f.X) * 180) / Math.PI + 90; // facing V
  return { position: { x: p.X + f.X * metres, y: p.Y + f.Y * metres, z: p.Z }, yaw };
}

async function personRef() {
  if (!person) throw new Error('Spawn the person first (1)');
  const e = await world.entity(person);
  if (!e) throw new Error('The person is not in the world');
  return e;
}

/** One shape at `strength`, the others at 0; '' is rest. One feature, one ApplyFeature. */
async function show(e, id) {
  const fields = { [RAW]: raw ? 1 : 0 };
  SHAPES.forEach(([shape], i) => (fields[FIELDS[i]] = shape === id ? strength : 0));
  const feature = await api.$new(CLASS, fields);
  await api.AnimationControllerComponent.ApplyFeature(e, FEATURE, feature);
  now.set({ text: `${id ? `${id} (${SHAPES.find((s) => s[0] === id)[1]})` : 'Rest'}, strength ${strength}, ${raw ? 'as sent' : 'eased'}` });
}

// ---- 1. Person --------------------------------------------------------------------

const spawn = () =>
  step(`Spawn ${record}`, async () => {
    stopRun();
    if (person) await world.remove(person).catch(() => false);
    person = null;
    const { id, entity } = await world.spawn({ record, ...(await inFront(1.6)), npc: { hold: true, friendly: true } });
    person = id;
    if (!entity) return `${id.hash}, not in the world after 10 s`;
    return `${id.hash}, appearance ${await entity.GetCurrentAppearanceName().catch(() => '?')}`;
  });

const remove = () =>
  step('Remove the person', async () => {
    stopRun();
    if (person) await world.remove(person).catch(() => false);
    person = null;
  });

// ---- 2. One shape -----------------------------------------------------------------

const one = (id) =>
  step(id ? `Shape ${id}` : 'Rest', async () => {
    stopRun();
    await show(await personRef(), id);
  });

// ---- 3 and 4. Sequences -----------------------------------------------------------

function stopRun() {
  if (!run) return;
  clearInterval(run.timer);
  const r = run;
  run = null;
  if (r.sent) say(`${r.label} stopped: ${r.sent} changes sent, ${(r.spent / r.sent).toFixed(0)} ms each on average, ${r.missed} missed (the last change was still out)`);
}

/** Plays [seconds, shape] in real time; `loop` starts again at the end. */
const play = (label, sequence, seconds, loop) =>
  step(label, async () => {
    stopRun();
    const e = await personRef();
    const r = { label, timer: null, sent: 0, spent: 0, missed: 0, out: false, started: performance.now(), last: null };
    run = r;
    r.timer = setInterval(async () => {
      let t = (performance.now() - r.started) / 1000;
      if (t >= seconds) {
        if (!loop) {
          if (r.out) return;
          await show(e, '').catch(() => undefined);
          return stopRun();
        }
        t %= seconds;
      }
      let id = '';
      for (const [at, shape] of sequence) if (at <= t) id = shape;
      if (id === r.last) return;
      if (r.out) return void r.missed++;
      r.out = true;
      const sent = performance.now();
      try {
        await show(e, id);
        r.last = id;
        r.sent++;
        r.spent += performance.now() - sent;
      } catch (err) {
        say(`${label} failed: ${err.message}`);
        stopRun();
      } finally {
        r.out = false;
      }
    }, 10);
    return 'running';
  });

const steps = (perSecond) =>
  play(`Every shape in turn, ${perSecond} a second`, SHAPES.map(([id], i) => [i / perSecond, id]), SHAPES.length / perSecond, true);
const line = (slow) =>
  play(`"Hello there, how are you"${slow === 1 ? '' : ', at half speed'}`, LINE.map(([t, id]) => [t * slow, id]), 2.2 * slow, false);

// ---- Window -----------------------------------------------------------------------

const recordInput = ui.input({ value: record, placeholder: 'A Character record (a woman of average build)', onChange: (v) => (record = v.trim()), onSubmit: (v) => (record = v.trim()) });
const shapeButton = ([id, sound]) => ui.button(`${id}: ${sound}`, () => one(id), { variant: 'ghost' });

ui.window({
  title: 'EDGEfab spike LS2: mouth shapes',
  anchor: 'left',
  x: 40,
  y: 60,
  width: 640,
  height: 900,
  closable: true,
  children: [
    requires,
    ui.heading('1. Person'),
    recordInput,
    ui.row(ui.button('Spawn the person', spawn), ui.button('Remove', remove, { variant: 'ghost' })),
    ui.heading('2. One shape at a time'),
    now,
    ui.row(...SHAPES.slice(0, 5).map(shapeButton)),
    ui.row(...SHAPES.slice(5, 9).map(shapeButton)),
    ui.row(...SHAPES.slice(9).map(shapeButton), ui.button('Rest', () => one(''))),
    ui.toggle('As sent (no easing in the graph)', (on) => (raw = on)),
    ui.toggle('Half strength', (on) => (strength = on ? 0.5 : 1)),
    ui.heading('3. Every shape in turn'),
    ui.row(ui.button('4 a second', () => steps(4)), ui.button('8 a second', () => steps(8)), ui.button('Stop', () => step('Stop', async () => stopRun()), { variant: 'ghost' })),
    ui.heading('4. A line, no sound: "Hello there, how are you"'),
    ui.row(ui.button('Say it', () => line(1)), ui.button('At half speed', () => line(2), { variant: 'ghost' })),
    log,
  ],
});

const checked = await kernel.requirements();
let ready = null;
async function checkWorld() {
  const ok = await world.available().catch(() => false);
  if (ok === ready) return;
  ready = ok;
  requires.set({
    text: [...checked.map((r) => `${r.ok ? 'OK' : 'MISSING'}  ${r.name} ${r.wants}  ${r.found ?? r.note}`), `${ready ? 'OK' : 'NOT READY'}  world API (Codeware, a loaded save)`].join('\n'),
    tone: checked.every((r) => r.ok) ? 'normal' : 'danger',
  });
}
await checkWorld();
setInterval(checkWorld, 5000);
say('LS2 0.1.0 ready. Without edgefab_ls2_shapes.archive in the game, nothing here moves the face.');
