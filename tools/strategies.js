// Is there one move that always wins? Seat 0 plays a fixed simple strategy against the same three
// bots (warmonger, opportunist, gossip) over many matches. A fair game has no strategy far above 25%.
import { createGame, runToEnd } from '../src/sim/turn.js';
import { PERSONALITIES } from '../src/bots/personalities.js';

const group = (id) => ({ kind: 'group', id });
const order = (verb, target, strength) => ({ verb, target, strength });
const rivals = (i) => [0, 1, 2, 3].filter((f) => f !== i.seat && i.living[f] > 0);
const strongest = (i) => rivals(i).sort((a, b) => i.living[b] - i.living[a])[0];
const weakest = (i) => rivals(i).sort((a, b) => i.living[a] - i.living[b])[0];

Object.assign(PERSONALITIES, {
  passer: () => [], // never gives an order
  turtle: (i) => [order('protect', group(i.seat), 3), order('festival', { kind: 'place', id: 'plaza' }, 2)],
  hater: (i) => (i.lastVerbs.has('hate') ? [order('arm', null, 2), order('fear', group(strongest(i)), 2)] : [order('hate', group(strongest(i)), 3), order('arm', null, 2)]),
  sniper: (i) => (i.anyKills && !i.lastVerbs.has('hate') ? [order('hate', group(weakest(i)), 3), order('arm', null, 2)] : [order('protect', group(i.seat), 2)]),
  rumorer: (i) => [order('accuse', group(strongest(i)), 3), order('praise', group(i.seat), 2)],
  lover: (i) => [order('love', group(strongest(i)), 3), order('festival', { kind: 'place', id: 'park' }, 2)],
});

const n = Number(process.argv[2]) || 150;
const names = ['passer', 'turtle', 'hater', 'sniper', 'rumorer', 'lover'];
console.log(`seat 0 plays one fixed strategy, against warmonger + opportunist + gossip (${n} matches each, fair is 25%)\n`);
for (const name of names) {
  let wins = 0;
  let turns = 0;
  let alive = 0;
  for (let m = 0; m < n; m++) {
    const seats = [name, 'warmonger', 'opportunist', 'gossip'].map((p, i) => ({ name: `s${i}`, kind: 'bot', personality: p }));
    const g = runToEnd(createGame({ seed: 31000 + m, seats, cosmetics: false }));
    if (g.winner === 0) wins++;
    turns += g.turn;
    alive += g.world.villagers.filter((v) => v.alive && v.faction === 0).length;
  }
  console.log(`  ${name.padEnd(8)} wins ${((wins / n) * 100).toFixed(0).padStart(3)}%   (avg ${(turns / n).toFixed(1)} turns, ${(alive / n).toFixed(1)} of its villagers alive at the end)`);
}
