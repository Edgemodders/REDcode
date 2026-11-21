// Animation Probe A (REDcode, docs/research/animation-authoring.md, section 8): does a clip imported through
// REDbridge play in the game? Three clips of one standing idle on a spawned Trauma Team paramedic:
//   game  the game's own stand__2h_on_sides__01 (the control)
//   same  that clip exported and imported back unchanged (probe_a__same, in probe\anims\probe_a.anims)
//   arm   the same through Blender with the left arm raised 70 degrees (probe_a__arm)
// probe_a.anims is made on the player's PC by tools/probes/anim-probe-a/prepare.mjs and swapped into the
// game with REDcode's Pack and Play on the AnimProbeA project. This package writes a workspot naming the
// three clips (world.writeWorkspot, REDnode 0.66.9), spawns the paramedic with it and switches between them.

import { api, game, ui, world } from 'rednode';

const SET_GAME = 'base\\animations\\npc\\generic_characters\\male_average\\interactive_scene\\generic_male_average__stand__2h_on_sides__01.anims';
const SET_PROBE = 'probe\\anims\\probe_a.anims';
const CLIPS = [
  { set: SET_GAME, anim: 'stand__2h_on_sides__01', name: 'game' },
  { set: SET_PROBE, anim: 'probe_a__same', name: 'same' },
  { set: SET_PROBE, anim: 'probe_a__arm', name: 'arm' },
];
const RECORD = 'Character.trauma_team_paramedic';

let written = null; // what world.writeWorkspot answered
let actor = null; // { id }
let busy = '';

const status = ui.text('1. Pack and Play the AnimProbeA project in REDcode. 2. Write and swap. 3. Spawn, then Play. 4. game, same, arm.', { tone: 'dim' });
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
    written = await world.writeWorkspot('probe_a', { clips: CLIPS });
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
    return r.started ? 'started: the first clip (game) plays. Say whether there was a brief T pose' : `not started: ${r.why}`;
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
  title: 'Animation Probe A',
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
      ui.button('game', () => jump('game', "the game's own idle: arms at the sides"), { variant: 'ghost' }),
      ui.button('same', () => jump('same', 'the imported copy, unchanged: should look exactly like game'), { variant: 'ghost' }),
      ui.button('arm', () => jump('arm', 'the Blender copy: the left arm held out or up, the rest as game'), { variant: 'ghost' }),
    ),
    ui.row(ui.button('Remove the paramedic', remove, { variant: 'ghost' })),
    log,
  ],
});
say('Animation Probe A 0.1.1 ready');
