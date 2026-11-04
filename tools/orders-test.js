// Typed sentences -> the right order (and the new orders really change what villagers do).
//   node tools/orders-test.js        exits 1 on any failure
import { createGame, submitOrders, updateGame } from '../src/sim/turn.js';
import { parseCommand } from '../src/sim/parser.js';

const seats = [{ name: 'You', kind: 'human' }, ...['a', 'b', 'c'].map((n) => ({ name: n, kind: 'bot', personality: 'pacifist' }))];
const fresh = (seed = 5) => createGame({ seed, seats, cosmetics: false });
let failed = 0;
const check = (ok, text) => { console.log(`${ok ? 'PASS' : 'FAIL'}  ${text}`); if (!ok) failed++; };

// [sentence, expected "verb:target" list]
const CASES = [
  ['run away from everyone, scare the tides', ['scatter:-', 'scare:group1']],
  ['run away from everybody', ['scatter:-']],
  ['everyone scatter', ['scatter:-']],
  ['flee from everyone', ['scatter:-']],
  ['run away from the tides', ['avoid:group1']],
  ['scare the tides', ['scare:group1']],
  ['terrify the sparks', ['scare:group3']],
  ['bully the sprouts', ['scare:group2']],
  ['glare at the blue ones', ['scare:group1']],
  ['sneak up on the tides', ['scare:group1']],
  ['be afraid of the tides', ['fear:group1']],
  ['ambush at the plaza', ['ambush:place plaza']],
  ['lie in wait at the armory', ['ambush:place armory']],
  ['pick a fight with the tides', ['assault:group1']],
  ['go after the sparks', ['assault:group3']],
  ['teach the sprouts a lesson', ['assault:group2']],
  ['make friends with the tides', ['love:group1']],
  ['be nice to the sparks', ['love:group3']],
  ['leave the tides alone', ['avoid:group1']],
  ['give the sparks some space', ['avoid:group3']],
  ['cheer for the sprouts', ['praise:group2']],
  ['trash talk the tides', ['accuse:group1']],
  ['take cover', ['follow:place houses']],
  ['lock the doors', ['follow:place houses']],
  ['keep an eye on the plaza', ['protect:place plaza']],
  ['dash to the bakery', ['follow:place bakery']],
  ['arm up and scare the sparks', ['arm:-', 'scare:group3']],
  ['push the tides away', ['shove:group1']],
  ['shove the sparks', ['shove:group3']],
  ['drive the tides off', ['shove:group1']],
  ['shout at the tides', ['scare:group1']],
  ['yell at the sparks', ['scare:group3']],
];
const g0 = fresh();
g0.world.peaceful = false;
for (const [text, want] of CASES) {
  const r = parseCommand(text, g0, 0);
  const got = r.ok ? r.actions.filter((a) => a.kind === 'order').map((a) => `${a.order.verb}:${a.order.target ? (a.order.target.kind === 'group' ? 'group' + a.order.target.id : `${a.order.target.kind} ${a.order.target.id}`) : '-'}`) : [`FAIL ${r.message}`];
  check(JSON.stringify(got) === JSON.stringify(want), `${JSON.stringify(text).padEnd(46)} -> ${got.join(' | ')}${JSON.stringify(got) === JSON.stringify(want) ? '' : `   (wanted ${want.join(' | ')})`}`);
}

// ---- effects ------------------------------------------------------------------
function afterPeace(seed) {
  const g = fresh(seed);
  for (let i = 0; g.world.peaceful && i < 5000; i++) {
    if (g.phase === 'command') submitOrders(g, 0, []);
    updateGame(g, 1);
  }
  while (g.phase !== 'command') updateGame(g, 1);
  return g;
}
function runTurn(g, text, seconds, measure) {
  const parsed = text ? parseCommand(text, g, 0) : { ok: true, actions: [] };
  const orders = parsed.ok ? parsed.actions.filter((a) => a.kind === 'order').map((a) => a.order) : [];
  submitOrders(g, 0, orders);
  while (g.phase === 'command') updateGame(g, 1);
  for (let i = 0; i < seconds * 20; i++) updateGame(g, 0.05);
  return measure(g);
}
const mine = (g) => g.world.villagers.filter((v) => v.alive && v.faction === 0);
const nearestOther = (g, v) => Math.min(...g.world.villagers.filter((o) => o.alive && o.faction !== 0).map((o) => Math.hypot(o.x - v.x, o.y - v.y)));

// 1) Run away from everyone: my villagers end up farther from everybody than when idle.
{
  const dist = (text) => runTurn(afterPeace(21), text, 14, (g) => mine(g).reduce((n, v) => n + nearestOther(g, v), 0) / 12);
  const calm = dist('');
  const scatter = dist('run away from everyone');
  check(scatter > calm * 1.15, `"run away from everyone": average distance to anybody else ${Math.round(scatter)}px vs ${Math.round(calm)}px when idle`);
}
// 2) Scare the Tides: my villagers go to them, and the Tides' fear and flight go up.
{
  const read = (text) => runTurn(afterPeace(22), text, 16, (g) => {
    const tides = g.world.villagers.filter((v) => v.alive && v.faction === 1);
    const close = mine(g).reduce((n, v) => n + nearestOf(g, v, 1), 0) / 12;
    return { fear: tides.reduce((n, v) => n + v.fear[0], 0) / tides.length, close, fled: tides.filter((v) => v.state === 'flee').length };
  });
  const nearestOf = (g, v, f) => Math.min(...g.world.villagers.filter((o) => o.alive && o.faction === f).map((o) => Math.hypot(o.x - v.x, o.y - v.y)));
  const idle = read('');
  const scared = read('scare the tides');
  check(scared.fled >= idle.fled + 3, `"scare the tides": ${scared.fled} Tides were running away (${idle.fled} when left alone)`);
  check(scared.fear > idle.fear + 5, `"scare the tides": the Tides' fear of us rose to ${scared.fear.toFixed(1)} (from ${idle.fear.toFixed(1)})`);
}
// 3) Ambush at the plaza: anyone from another faction at the plaza gets jumped.
{
  const g = afterPeace(23);
  const plaza = g.world.places.find((p) => p.id === 'plaza');
  const before = g.world.events.filter((e) => e.type === 'kill').length;
  const hits = runTurn(g, 'ambush at the plaza', 25, (gg) => gg.world.villagers.filter((v) => v.alive && v.faction !== 0 && v.hp < 100 && Math.hypot(v.x - plaza.x, v.y - plaza.y) < 260).length + (gg.world.events.filter((e) => e.type === 'kill').length - before));
  const idle = runTurn(afterPeace(23), '', 25, (gg) => gg.world.villagers.filter((v) => v.alive && v.faction !== 0 && v.hp < 100 && Math.hypot(v.x - plaza.x, v.y - plaza.y) < 260).length);
  check(hits > idle, `"ambush at the plaza": ${hits} hurt or dead near the plaza vs ${idle} when idle`);
}
// 4) Shove: the Tides get pushed around and resent it.
{
  const read = (text) => runTurn(afterPeace(24), text, 14, (g) => {
    const tides = g.world.villagers.filter((v) => v.alive && v.faction === 1);
    return { resent: tides.reduce((n, v) => n + mine(g).reduce((m, o) => m + v.grievance[o.id], 0), 0) / tides.length };
  });
  const idle = read('');
  const shoved = read('push the tides away');
  check(shoved.resent > idle.resent + 20, `"push the tides away": the Tides' grievance against us ${Math.round(shoved.resent)} (${Math.round(idle.resent)} when left alone)`);
}
// 5) Seize: two or more grab a Tide far from the pond and carry them there.
{
  const g = afterPeace(25);
  const pond = g.world.places.find((p) => p.id === 'pond');
  const prey = g.world.villagers.filter((v) => v.faction === 1).sort((p, q) => Math.hypot(q.x - pond.x, q.y - pond.y) - Math.hypot(p.x - pond.x, p.y - pond.y))[0];
  const parsed = parseCommand(`two villagers grab ${prey.name.toLowerCase()} and drag them to the pond`, g, 0);
  const order = parsed.ok ? parsed.actions.find((a) => a.kind === 'order')?.order : null;
  check(order && order.verb === 'seize' && order.dest === 'pond' && order.target.id === prey.id, `seize parses to ${JSON.stringify(order)}`);
  if (order) {
    submitOrders(g, 0, [order]);
    while (g.phase === 'command') updateGame(g, 1);
    const start = Math.hypot(prey.x - pond.x, prey.y - pond.y);
    let carried = 0;
    let released = null;
    for (let i = 0; i < 20 * 30 && !released; i++) {
      updateGame(g, 0.05);
      if (prey.carry) carried++;
      else if (carried > 0) released = { d: Math.hypot(prey.x - pond.x, prey.y - pond.y), resent: Math.max(...prey.grievance), hp: prey.hp };
    }
    check(carried > 40, `seize: ${prey.name} was carried for ${(carried / 20).toFixed(1)} s`);
    check(released && released.d < start * 0.5, `seize: ${prey.name} was dropped ${released ? Math.round(released.d) : '?'} px from the pond (started ${Math.round(start)} px away)`);
    check(released && released.resent > 30, `seize: ${prey.name} holds a grudge afterwards (${released ? Math.round(released.resent) : '?'})`);
  }
}
process.exit(failed ? 1 : 0);
