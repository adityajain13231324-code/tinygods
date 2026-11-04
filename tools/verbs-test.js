// Does every order verb really change what villagers do, compared with giving no order?  node tools/verbs-test.js
import { createGame, submitOrders, updateGame } from '../src/sim/turn.js';
import { parseCommand } from '../src/sim/parser.js';

const seats = [{ name: 'You', kind: 'human' }, ...['a', 'b', 'c'].map((n) => ({ name: n, kind: 'bot', personality: 'pacifist' }))];
let failed = 0;
const check = (ok, text) => { console.log(`${ok ? 'PASS' : 'FAIL'}  ${text}`); if (!ok) failed++; };

function start(seed) {
  const g = createGame({ seed, seats, cosmetics: true });
  for (let i = 0; g.world.peaceful && i < 5000; i++) {
    if (g.phase === 'command') submitOrders(g, 0, []);
    updateGame(g, 1);
  }
  while (g.phase !== 'command') updateGame(g, 1);
  return g;
}
function play(seed, text, seconds, measure, setup) {
  const g = start(seed);
  setup?.(g);
  const parsed = text ? parseCommand(text, g, 0) : { ok: true, actions: [] };
  const orders = parsed.ok ? parsed.actions.filter((a) => a.kind === 'order').map((a) => a.order) : [];
  const res = submitOrders(g, 0, orders);
  if (!res.ok) return { error: res.error };
  while (g.phase === 'command') updateGame(g, 1);
  for (let i = 0; i < seconds * 20; i++) updateGame(g, 0.05);
  return measure(g);
}
const side = (g, f) => g.world.villagers.filter((v) => v.alive && v.faction === f);
const avg = (xs) => xs.reduce((a, b) => a + b, 0) / Math.max(1, xs.length);
const compare = (name, text, seconds, measure, better, setup, seed = 71) => {
  const base = play(seed, '', seconds, measure, setup);
  const got = play(seed, text, seconds, measure, setup);
  if (got.error) return check(false, `${name}: order rejected (${got.error})`);
  const ok = better(got, base);
  check(ok, `${name}: ${JSON.stringify(got)} vs ${JSON.stringify(base)} when idle`);
};
const r1 = (x) => Math.round(x * 10) / 10;
const brawl = (g) => { for (const v of g.world.villagers) { v.aggression = 90; v.courage = 70; } };

compare('hate', 'hate the tides really hard', 1, (g) => r1(avg(side(g, 0).map((v) => v.opinion[1]))), (a, b) => a < b - 10);
compare('love', 'love the tides', 1, (g) => r1(avg(side(g, 0).map((v) => v.opinion[1]))), (a, b) => a > b + 5);
compare('fear', 'be afraid of the tides', 1, (g) => r1(avg(side(g, 0).map((v) => v.fear[1]))), (a, b) => a > b + 5);
compare('scare', 'scare the tides', 10, (g) => side(g, 1).filter((v) => v.state === 'flee').length, (a, b) => a >= b + 2);
compare('protect', 'protect my people', 6, (g) => side(g, 0).filter((v) => v.guardBonus > 0).length, (a, b) => a > b);
compare('avoid', 'stay away from the tides', 12, (g) => r1(avg(side(g, 0).map((v) => Math.min(...side(g, 1).map((o) => Math.hypot(o.x - v.x, o.y - v.y)))))), (a, b) => a > b * 1.15);
compare('go to a place', 'send everyone to the pond', 26, (g) => { const p = g.world.places.find((q) => q.id === 'pond'); return side(g, 0).filter((v) => Math.hypot(v.x - p.x, v.y - p.y) < 140).length; }, (a, b) => a >= b + 5);
compare('escort', (() => 'have everyone follow bean')(), 14, (g) => { const b = g.world.villagers.find((v) => v.name === 'Bean'); return b ? r1(avg(side(g, 0).map((v) => Math.hypot(v.x - b.x, v.y - b.y)))) : 0; }, (a, b) => a < b * 0.8 || a === 0, undefined, 72);
compare('assault', 'attack the tides', 16, (g) => 60 - g.world.villagers.filter((v) => v.alive && v.faction === 1).length + Math.round(avg(side(g, 1).map((v) => 100 - v.hp)) / 10), (a, b) => a > b);
compare('stand down', 'everyone stand down', 12, (g) => g.world.villagers.filter((v) => v.alive && v.state === 'attack').length, (a, b) => a <= b, brawl);
compare('arm up', 'arm up', 20, (g) => side(g, 0).filter((v) => v.weapon !== 'none').length, (a, b) => a >= b + 2);
compare('accuse', 'accuse the tides', 20, (g) => g.world.villagers.filter((v) => v.alive && v.believed.length > 0).length, (a, b) => a > b);
compare('praise', 'praise the sparks', 20, (g) => g.world.villagers.filter((v) => v.alive && v.believed.length > 0).length, (a, b) => a > b);
compare('festival', 'party at the pond', 12, (g) => g.world.villagers.filter((v) => v.alive && v.activity === 'dance').length, (a, b) => a >= b + 3);
compare('run away', 'run away from everyone', 14, (g) => r1(avg(side(g, 0).map((v) => Math.min(...g.world.villagers.filter((o) => o.alive && o.faction !== 0).map((o) => Math.hypot(o.x - v.x, o.y - v.y)))))), (a, b) => a > b * 1.5);
// hunt: the named villager takes damage
{
  const g0 = start(73);
  const prey = g0.world.villagers.find((v) => v.faction === 1).name.toLowerCase();
  compare('hunt', `hunt ${prey}`, 25, (g) => { const p = g.world.villagers.find((v) => v.name.toLowerCase() === prey); return p.alive ? Math.round(100 - p.hp) : 100; }, (a, b) => a > b + 15, undefined, 73);
}
process.exit(failed ? 1 : 0);
