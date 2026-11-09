// Headless simulation speed: whole bot matches, timed. Run the same file on two checkouts to compare.
//   node tools/bench-sim.js [matches=12]
import { createGame, runToEnd } from '../src/sim/turn.js';
const N = Number(process.argv[2] ?? 12);
const seats = (s) => Array.from({ length: 4 }, (_, i) => ({ name: `B${i}`, kind: 'bot', personality: ['warmonger', 'pacifist', 'gossip', 'opportunist', 'chaos'][(s + i) % 5] }));
runToEnd(createGame({ seed: 1, seats: seats(1), cosmetics: false })); // warm up
const t0 = performance.now();
let turns = 0, ticks = 0;
for (let s = 1; s <= N; s++) { const g = createGame({ seed: 500 + s, seats: seats(s), cosmetics: false }); runToEnd(g); turns += g.turn; ticks += g.world.time / 0.05; }
const ms = performance.now() - t0;
console.log(`${N} matches, ${turns} turns, ${Math.round(ticks)} ticks in ${ms.toFixed(0)} ms: ${(ms / N).toFixed(0)} ms per match, ${(ms / turns).toFixed(1)} ms per turn, ${(ms / ticks * 1000).toFixed(2)} ms per 1000 ticks`);
