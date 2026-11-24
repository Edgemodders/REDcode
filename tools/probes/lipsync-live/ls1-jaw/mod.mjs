// Spike LS1 (docs/lipsync.md, "Live lip sync"): can a script move a live NPC's jaw?
// Through REDnode's `api` and `world` only. Needs the test archive made by
// `npm run lipsync:jaw --workspace extensions/edgefab -- <outFolder>` in the game: it adds float inputs to
// the women's face graph (woman_average_sermo.animgraph), each added to one lip sync track before the pose
// solver. Without the archive every button here does nothing to the face, which is the control.
//
//   1 Person    a woman beside V, facing V, holding still
//   2 Bark      PlayVoiceOver: do the lips move with a gameplay line, outside a scene?
//   3 Inputs    SetInputFloat on the person: edgefab_jaw, edgefab_envelope, edgefab_override
//   4 Feature   the same three numbers through an anim feature (edgefab_lipsync), the second way in
//   5 Wave      the jaw opened and closed about twice a second, 10 or 30 changes a second, with the
//               time each change took, for LS1's last step (is it smooth, what does it cost)
//
// Every call and its answer go to the log; what the face does is for the player to say.
// Written from REDnode's Animation test and the game's type dump; not yet run in the game.

import { api, game, kernel, ui, world } from 'rednode';

const INPUTS = ['edgefab_jaw', 'edgefab_envelope', 'edgefab_override'];
// The feature's class has three floats; the test graph reads them in this order.
const FIELDS = ['direction', 'source', 'intensity'];
const FEATURE = 'edgefab_lipsync';

let record = 'Character.civilianguard_corporat_ranged1_wa';
let voice = 'greeting';
let person = null;
let busy = '';
let wave = null;
const values = [0, 0, 0];

const requires = ui.text('Checking requirements...', { tone: 'dim' });
const now = ui.text('Jaw 0, envelope 0, override 0', { tone: 'accent' });
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

// ---- 1. Person --------------------------------------------------------------------

const spawn = () =>
  step(`Spawn ${record}`, async () => {
    stopWave();
    if (person) await world.remove(person).catch(() => false);
    person = null;
    const { id, entity } = await world.spawn({ record, ...(await inFront(1.6)), npc: { hold: true, friendly: true } });
    person = id;
    if (!entity) return `${id.hash}, not in the world after 10 s`;
    const look = await entity.GetCurrentAppearanceName().catch(() => '?');
    const face = await entity.FindComponentByName('face_rig').catch((e) => `error ${e.message}`);
    return `${id.hash}, appearance ${look}; its "face_rig" component ${face ? 'found' : 'NOT found'}`;
  });

const remove = () =>
  step('Remove the person', async () => {
    stopWave();
    if (person) await world.remove(person).catch(() => false);
    person = null;
  });

// ---- 2. Bark ----------------------------------------------------------------------

const bark = () =>
  step(`PlayVoiceOver "${voice}"`, async () => {
    await api.GameObject.PlayVoiceOver(await personRef(), voice, 'edgefab_ls1');
    return 'asked; watch the lips';
  });

// ---- 3 and 4. The numbers ---------------------------------------------------------

async function sendInputs(e) {
  for (let i = 0; i < INPUTS.length; i++) await api.AnimationControllerComponent.SetInputFloat(e, INPUTS[i], values[i]);
}

async function sendFeature(e) {
  const feature = await api.$new('AnimFeature_Bump', Object.fromEntries(FIELDS.map((f, i) => [f, values[i]])));
  await api.AnimationControllerComponent.ApplyFeature(e, FEATURE, feature);
}

function show() {
  now.set({ text: `Jaw ${values[0].toFixed(2)}, envelope ${values[1].toFixed(2)}, override ${values[2].toFixed(2)}` });
}

const set = (index, value, way) =>
  step(`${way === 'feature' ? 'Feature' : 'Input'}: ${INPUTS[index]} = ${value}`, async () => {
    values[index] = value;
    show();
    await (way === 'feature' ? sendFeature : sendInputs)(await personRef());
  });

const zero = () =>
  step('All to 0, both ways', async () => {
    stopWave();
    values.fill(0);
    show();
    const e = await personRef();
    await sendInputs(e);
    await sendFeature(e);
  });

// ---- 5. Wave ----------------------------------------------------------------------

function stopWave() {
  if (!wave) return;
  clearInterval(wave.timer);
  const w = wave;
  wave = null;
  if (w.sent) say(`Wave stopped: ${w.sent} changes, ${(w.spent / w.sent).toFixed(1)} ms each on average, ${w.late} skipped because the last one was still out`);
}

const startWave = (perSecond, way) =>
  step(`Wave the jaw, ${perSecond} changes a second, by ${way}`, async () => {
    stopWave();
    const e = await personRef();
    const w = { timer: null, sent: 0, spent: 0, late: 0, out: false, started: performance.now() };
    wave = w;
    w.timer = setInterval(async () => {
      if (w.out) return void w.late++;
      w.out = true;
      const t = performance.now();
      try {
        // Open and close twice a second; the envelope stays where its buttons left it.
        values[0] = 0.5 - 0.5 * Math.cos(((t - w.started) / 1000) * 2 * Math.PI * 2);
        if (way === 'feature') await sendFeature(e);
        else await api.AnimationControllerComponent.SetInputFloat(e, INPUTS[0], values[0]);
        w.sent++;
        w.spent += performance.now() - t;
      } catch (err) {
        say(`Wave failed: ${err.message}`);
        stopWave();
      } finally {
        w.out = false;
      }
    }, 1000 / perSecond);
    return 'running; Stop the wave to read its cost';
  });

// ---- Window -----------------------------------------------------------------------

const recordInput = ui.input({ value: record, placeholder: 'A Character record (a woman of average build)', onChange: (v) => (record = v.trim()), onSubmit: (v) => (record = v.trim()) });
const voiceInput = ui.input({ value: voice, placeholder: 'A voice over name, such as greeting', onChange: (v) => (voice = v.trim()), onSubmit: (v) => (voice = v.trim()) });
const numbers = (index, way) => [0, 0.5, 1].map((v) => ui.button(`${INPUTS[index].replace('edgefab_', '')} ${v}`, () => set(index, v, way), { variant: v === 1 ? undefined : 'ghost' }));

ui.window({
  title: 'EDGEfab spike LS1: the jaw on command',
  anchor: 'left',
  x: 40,
  y: 60,
  width: 640,
  height: 860,
  closable: true,
  children: [
    requires,
    ui.heading('1. Person'),
    recordInput,
    ui.row(ui.button('Spawn the person', spawn), ui.button('Remove', remove, { variant: 'ghost' })),
    ui.heading('2. Bark: do the lips move outside a scene?'),
    voiceInput,
    ui.row(ui.button('Say it', bark)),
    ui.heading('3. Inputs (SetInputFloat)'),
    now,
    ui.row(...numbers(0, 'input')),
    ui.row(...numbers(1, 'input')),
    ui.row(...numbers(2, 'input')),
    ui.heading('4. The same through an anim feature'),
    ui.row(...numbers(0, 'feature')),
    ui.row(...numbers(1, 'feature')),
    ui.row(...numbers(2, 'feature')),
    ui.heading('5. Wave the jaw (through the anim feature)'),
    ui.row(
      ui.button('10 a second', () => startWave(10, 'feature')),
      ui.button('20 a second', () => startWave(20, 'feature')),
      ui.button('30 a second', () => startWave(30, 'feature')),
    ),
    ui.row(ui.button('Stop the wave', () => step('Stop the wave', async () => stopWave()), { variant: 'ghost' }), ui.button('All to 0', zero, { variant: 'ghost' })),
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
say('LS1 0.2.0 ready. Without edgefab_ls1_jaw.archive in the game, nothing here moves the face.');
