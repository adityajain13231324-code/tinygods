// Checks the typing parser, and that typed sentences really change what villagers do.
//   node tools/parse-test.js
import { createGame, submitOrders, updateGame } from '../src/sim/turn.js';
import { parseCommand } from '../src/sim/parser.js';
import { validateOrders } from '../src/sim/orders.js';

const seats = [{ name: 'You', kind: 'human' }, ...['a', 'b', 'c'].map((n) => ({ name: n, kind: 'bot', personality: 'pacifist' }))];
const fresh = () => createGame({ seed: 5, seats, cosmetics: false });
const game = fresh();
const mine = game.world.villagers.filter((v) => v.faction === 0);
const theirs = game.world.villagers.filter((v) => v.faction === 1);
const me = mine[0].name.toLowerCase();
const them = theirs[0].name.toLowerCase();

const phrases = [
  'scare the tides', 'make the blue ones terrified of us', 'hate sprouts really hard', 'arm up', 'throw a party at the pond',
  'protect my people', 'send three of my villagers to the armory', `have ${me} follow ${them}`, `hunt ${them}`, 'everyone stand down',
  'my brawlers attack the tides', 'hide in the houses', 'arm four villagers', 'stay away from the sparks', `send ${me} and ${mine[1].name.toLowerCase()} to the market`,
  'raid the sprouts armory', 'poison the tides', 'recruit a neutral', 'make peace treaty with the sparks', 'sing a song', 'asdf', 'destroy me',
  'forge a letter against the sparks, scare the tides and arm up',
];
for (const p of phrases) {
  const r = parseCommand(p, game, 0);
  const text = r.ok ? r.actions.map((a) => `${a.kind}:${a.label}`).join(' | ') : `FAIL -> ${r.message}`;
  const orders = r.ok ? r.actions.filter((a) => a.kind === 'order').map((a) => a.order) : [];
  const check = orders.length ? validateOrders(orders, 10, game.world, new Set()) : { ok: true };
  console.log(JSON.stringify(p).padEnd(62), text, check.ok ? '' : `  [INVALID: ${check.error}]`);
}

// End to end: type it, run the turn, see what the villagers did.
function run(sentence, measure) {
  const g = fresh();
  const parsed = parseCommand(sentence(g), g, 0);
  if (!parsed.ok) return `parse failed: ${parsed.message}`;
  const orders = parsed.actions.filter((a) => a.kind === 'order').map((a) => a.order);
  const sub = submitOrders(g, 0, orders);
  if (!sub.ok) return `rejected: ${sub.error}`;
  while (g.phase === 'command') updateGame(g, 1);
  for (let i = 0; i < 20 * 14; i++) updateGame(g, 0.05); // fourteen seconds of town time
  return measure(g);
}
const near = (g, v, place) => { const p = g.world.places.find((q) => q.id === place); return Math.hypot(v.x - p.x, v.y - p.y) < p.radius * 1.1; };
console.log('\nend to end:');
console.log('three villagers to the armory ->', run(() => 'send three of my villagers to the armory', (g) => `${g.world.villagers.filter((v) => v.faction === 0 && near(g, v, 'armory')).length} of yours are at the armory (others elsewhere: ${g.world.villagers.filter((v) => v.faction === 0 && !near(g, v, 'armory')).length})`));
console.log('whole faction to the armory   ->', run(() => 'send my people to the armory', (g) => `${g.world.villagers.filter((v) => v.faction === 0 && near(g, v, 'armory')).length} of 12 at the armory`));
console.log('hunt a named villager         ->', run((g) => `hunt ${g.world.villagers.find((v) => v.faction === 1).name}`, (g) => {
  const prey = g.world.villagers.find((v) => v.faction === 1);
  const hunters = g.world.villagers.filter((v) => v.faction === 0 && v.fx.hunt === prey.id);
  return `prey hp ${Math.round(prey.hp)}, ${hunters.length} hunters assigned, ${g.world.villagers.filter((v) => v.faction === 0 && v.state === 'attack').length} of yours fighting`;
}));
console.log('follow a named villager       ->', run((g) => `have ${g.world.villagers.find((v) => v.faction === 0).name} follow ${g.world.villagers.find((v) => v.faction === 1).name}`, (g) => {
  const a = g.world.villagers.find((v) => v.faction === 0);
  const b = g.world.villagers.find((v) => v.faction === 1);
  return `distance between them after 14s: ${Math.round(Math.hypot(a.x - b.x, a.y - b.y))}px`;
}));
