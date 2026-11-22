// Animation Probe D (REDcode, docs/research/animation-authoring.md, section 8): does a clip Uthana made from words,
// on the game's own skeleton, play in the game, both added and in place of a game clip? On a spawned paramedic:
//   kept      stand__2h_on_sides__01__stretch_arms__01, a game clip the replacement set keeps (the control)
//   added     probe_d__wave, in a new set probe\anims\probe_d.anims
//   replaced  stand__2h_on_sides__01, the game's idle, which the project's copy of its set replaces with the wave
// Both sets are made on the player's PC by tools/probes/anim-probe-d/probe.mjs (character, generate, fit, replace)
// and swapped into the game with REDcode's Pack and Play on the AnimProbeD project.

import { api, game, ui, world } from 'rednode';

const SET_GAME = 'base\\animations\\npc\\generic_characters\\male_average\\interactive_scene\\generic_male_average__stand__2h_on_sides__01.anims';
const SET_PROBE = 'probe\\anims\\probe_d.anims';
const CLIPS = [
  { set: SET_GAME, anim: 'stand__2h_on_sides__01__stretch_arms__01', name: 'kept' },
  { set: SET_PROBE, anim: 'probe_d__wave', name: 'added' },
  { set: SET_GAME, anim: 'stand__2h_on_sides__01', name: 'replaced' },
];
const RECORD = 'Character.trauma_team_paramedic';

let written = null; // what world.writeWorkspot answered
let actor = null; // { id }
let busy = '';

const status = ui.text('1. Pack and Play the AnimProbeD project in REDcode. 2. Write and swap. 3. Spawn, then Play. 4. kept, added, replaced.', { tone: 'dim' });
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
  const yaw = (Math.atan2(f.Y, f.X) * 180) / Math.PI + 90;
  return { position: { x: p.X + f.X * metres, y: p.Y + f.Y * metres, z: p.Z }, yaw };
}

const write = () =>
  step('Write and swap', async () => {
    written = await world.writeWorkspot('probe_d', { clips: CLIPS });
    say(`  ${written.path}: ${written.entries.map((e) => `${e.name} ${e.entry}`).join(', ')}`);
    return written.swap ? `swapped via ${written.swap.via}` : 'not swapped';
  });

const spawn = () =>
  step('Spawn the paramedic', async () => {
    if (!written) throw new Error('Press Write and swap first');
    if (actor) await world.remove(actor.id).catch(() => false);
    const { id } = await world.spawn({ record: RECORD, ...(await inFront(3)), workspot: written.path });
    actor = { id };
    return 'spawned 3 m in front of V; press Play';
  });

const play = () =>
  step('Play', async () => {
    if (!actor) throw new Error('Spawn first');
    const r = await world.useWorkspot(actor.id);
    actor.id = r.id;
    return r.started ? 'started: the first clip (kept, the game stretching its arms) plays' : `not started: ${r.why}`;
  });

const jump = (name, what) =>
  step(`${name}`, async () => {
    if (!actor) throw new Error('Spawn first');
    const done = await world.jumpWorkspot(actor.id, name);
    return done ? what : 'not in the workspot: press Play first';
  });

const remove = () =>
  step('Remove the paramedic', async () => {
    if (actor) await world.remove(actor.id).catch(() => false);
    actor = null;
    return 'removed';
  });

ui.window({
  title: 'Animation Probe D',
  anchor: 'left',
  x: 40,
  y: 60,
  width: 620,
  height: 560,
  closable: true,
  children: [
    status,
    ui.row(ui.button('Write and swap', write), ui.button('Spawn', spawn, { variant: 'ghost' }), ui.button('Play', play, { variant: 'ghost' })),
    ui.heading('Switch the clip'),
    ui.row(
      ui.button('kept', () => jump('kept', 'a game clip the rewritten set kept: the paramedic stretches his arms'), { variant: 'ghost' }),
      ui.button('added', () => jump('added', "Uthana's wave as a new clip: the right hand raised and waving"), { variant: 'ghost' }),
      ui.button('replaced', () => jump('replaced', "the game's idle clip, replaced by the same wave"), { variant: 'ghost' }),
    ),
    ui.row(ui.button('Remove the paramedic', remove, { variant: 'ghost' })),
    log,
  ],
});
say('Animation Probe D 0.1.0 ready');
