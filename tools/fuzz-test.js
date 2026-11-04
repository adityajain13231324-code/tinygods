// Throws everything at the game: four "humans" who type random sentences, play random cards and cast
// random miracles (with deliberately silly arguments too), over whole matches with the full render-side
// logic switched on (cosmetics), checking after every tick that nothing breaks.
//   node tools/fuzz-test.js [matches] [firstSeed]       exits 1 on any problem
import { createGame, submitOrders, updateGame, skipRecap } from '../src/sim/turn.js';
import { parseCommand } from '../src/sim/parser.js';
import { castPower, POWER_DEFS } from '../src/sim/powers.js';
import { CARD_IDS } from '../src/sim/cards.js';
import { mulberry32 } from '../src/sim/rng.js';
import { WORLD } from '../src/config/tunables.js';

const N = Number(process.argv[2] ?? 12);
const FIRST = Number(process.argv[3] ?? 1);
const PHRASES = [
  'hate the tides', 'push the tides away', 'grab pip and drag him to the pond', 'shout at the sparks', 'two villagers take mia away', 'love the sparks', 'scare the sprouts', 'be afraid of the tides', 'guard my people', 'stay away from the sparks', 'send three villagers to the armory',
  'hunt olive', 'assault the tides', 'attack the sparks', 'everyone stand down', 'arm up', 'accuse the sprouts', 'praise the tides', 'party at the pond',
  'run away from everyone', 'ambush at the plaza', 'ambush at the market', 'scare the tides, arm up', 'hide in the houses', 'my brawlers attack the sprouts',
  'kill everyone at the houses', 'follow mia', 'send two villagers to the well and guard the bakery', 'lie in wait at the farm', 'bully the sparks', 'run for the hills',
  'forge a letter against the tides', 'plant a time bomb at the plaza', 'spy on the sparks', 'raid the sprouts armory', 'poison the tides', 'recruit a neutral',
  'make a treaty with the sparks', 'kidnap the tides', 'rally my people', 'ring a false alarm on the sparks', 'matchmake with the tides', 'prophesy doom for the sprouts',
  'bribe the neutrals', 'census', 'war chest', 'alibi', 'field hospital', 'truce bell', 'asdf', '', 'a'.repeat(200),
];
const POWER_IDS = Object.keys(POWER_DEFS);
const GROUPS = ['embers', 'tides', 'sprouts', 'sparks'];
let failed = 0;
const casts = {};
const cardsPlayed = {};
const problems = new Map();
const report = (key, detail) => { if (!problems.has(key)) problems.set(key, detail); };

function checkWorld(g, where) {
  const { world } = g;
  for (const v of world.villagers) {
    const bad = (what) => report(`${what} (${where})`, `villager ${v.name} state=${v.state} x=${v.x} y=${v.y} hp=${v.hp} turn=${g.turn} t=${g.simElapsed?.toFixed(1)}`);
    if (!v.alive) continue;
    if (!Number.isFinite(v.x) || !Number.isFinite(v.y) || !Number.isFinite(v.vx) || !Number.isFinite(v.vy)) bad('non-finite position or velocity');
    if (!Number.isFinite(v.hp) || v.hp <= 0 || v.hp > 100.0001) bad('hp out of range');
    if (v.x < -80 || v.x > WORLD.width + 80 || v.y < -80 || v.y > WORLD.height + 80) bad('villager far outside the map');
    if (!Number.isFinite(v.aggression) || !Number.isFinite(v.courage) || v.aggression < -0.01 || v.aggression > 100.01 || v.courage < -0.01 || v.courage > 100.01) bad('aggression or courage out of range');
    if (v.state === 'attack' && !world.villagers[v.targetId]) bad('attacking nobody');
    if (v.fear.some((f) => !Number.isFinite(f) || f < -0.01 || f > 100.01)) bad('fear out of range');
    if (v.opinion.some((o) => !Number.isFinite(o) || o < -100.01 || o > 100.01)) bad('opinion out of range');
    if (v.grievance.some((o) => !Number.isFinite(o))) bad('non-finite grievance');
  }
  if (g.influence.some((n) => !Number.isFinite(n) || n < 0)) report(`influence invalid (${where})`, JSON.stringify(g.influence));
  if (g.power.some((n) => !Number.isFinite(n) || n < 0)) report(`power invalid (${where})`, JSON.stringify(g.power));
}

function playMatch(seed) {
  const rnd = mulberry32(seed * 7919 + 13);
  const pick = (list) => list[Math.floor(rnd() * list.length)];
  const seats = [0, 1, 2, 3].map((i) => (i < 3 ? { name: `P${i}`, kind: 'human' } : { name: 'bot', kind: 'bot', personality: pick(['warmonger', 'pacifist', 'gossip', 'chaos', 'opportunist']) }));
  const g = createGame({ seed, seats, cosmetics: true, difficulty: pick(['easy', 'normal', 'hard']) });
  let guard = 0;
  let lastTurn = 0;
  while (g.phase !== 'ended' && guard++ < 400000) {
    try {
      if (g.phase === 'command') {
        if (g.turn !== lastTurn) {
          lastTurn = g.turn;
          for (const seat of [0, 1, 2]) {
            if (g.eliminated[seat]) continue;
            const orders = [];
            for (let k = 0; k < 1 + Math.floor(rnd() * 3); k++) {
              const r = parseCommand(pick(PHRASES), g, seat);
              if (r.ok) for (const a of r.actions) if (a.kind === 'order') orders.push(a.order);
            }
            let card = null;
            if (rnd() < 0.7 && g.hand[seat].length) {
              const id = pick(g.hand[seat]);
              card = { id, group: (seat + 1 + Math.floor(rnd() * 3)) % 4, place: pick(g.world.places).id };
            }
            const res = submitOrders(g, seat, orders.slice(0, 3), card);
            if (!res.ok) submitOrders(g, seat, orders.slice(0, 1)) || submitOrders(g, seat, []);
          }
          checkWorld(g, 'dawn');
        }
        updateGame(g, 30);
      } else if (g.phase === 'recap') {
        skipRecap(g);
      } else {
        // the town acts: random miracles at random moments, some with nonsense arguments
        if (rnd() < 0.03) {
          const seat = Math.floor(rnd() * 3);
          const id = pick(POWER_IDS);
          const alive = g.world.villagers.filter((v) => v.alive);
          const target = pick(alive);
          const args = { x: rnd() * WORLD.width, y: rnd() * WORLD.height, villagerId: target?.id, group: Math.floor(rnd() * 6) - 1, placeId: pick(['plaza', 'pond', 'nowhere', 'armory', 'market']), good: rnd() < 0.5 };
          if (rnd() < 0.05) { args.villagerId = 999; args.x = NaN; }
          g.power[seat] = Math.max(g.power[seat], 3);
          const cr = castPower(g, seat, id, args);
          casts[id] = casts[id] ?? [0, 0];
          casts[id][cr.ok ? 0 : 1]++;
        }
        updateGame(g, 0.05);
        if (guard % 20 === 0) checkWorld(g, 'sim');
      }
    } catch (e) {
      report(`exception: ${e.message}`, `seed ${seed} turn ${g.turn} phase ${g.phase}\n${e.stack.split('\n').slice(0, 4).join('\n')}`);
      return { crashed: true };
    }
  }
  if (g.phase !== 'ended') report('match did not finish', `seed ${seed} turn ${g.turn} phase ${g.phase}`);
  checkWorld(g, 'end');
  return { turns: g.turn, winner: g.winner };
}

let crashed = 0;
let total = 0;
for (let s = FIRST; s < FIRST + N; s++) {
  const r = playMatch(s);
  if (r.crashed) crashed++;
  total += r.turns ?? 0;
}
console.log('powers cast ok/refused:', Object.entries(casts).map(([k, v]) => k + ' ' + v[0] + '/' + v[1]).join(', '));
console.log(`${N} fuzz matches, ${crashed} crashed, average ${(total / Math.max(1, N - crashed)).toFixed(1)} turns`);
for (const [k, v] of problems) { failed++; console.log(`\nPROBLEM: ${k}\n  ${v}`); }
if (!failed) console.log('PASS  no exceptions and every invariant held');
process.exit(failed ? 1 : 0);
