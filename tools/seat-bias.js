// Who wins when one player does nothing (like a new player would)? And is any seat favoured?
//   node tools/seat-bias.js [matches]
import { createGame, runToEnd } from '../src/sim/turn.js';
import { makeSeats } from '../src/net/online.js';

const N = Number(process.argv[2] ?? 300);
const count = (f) => { const w = [0, 0, 0, 0]; const byP = {}; for (let s = 1; s <= N; s++) { const r = f(s); w[r.winner]++; const key = r.seats[r.winner].personality ?? 'human'; byP[key] = (byP[key] ?? 0) + 1; } return { seat: w.map((x) => `${(100 * x / N).toFixed(1)}%`).join(' / '), byP }; };
const real = (s) => { const seats = makeSeats(s, ['You']); const g = runToEnd(createGame({ seed: s, seats, cosmetics: false })); return { winner: g.winner, seats }; };
const same = (p) => (s) => { const seats = [0, 1, 2, 3].map(() => ({ name: 'b', kind: 'bot', personality: p })); const g = runToEnd(createGame({ seed: s, seats, cosmetics: false })); return { winner: g.winner, seats }; };
console.log('human passive, bots as in the real game  (Embers/Tides/Sprouts/Sparks):', count(real));
for (const p of ['opportunist', 'warmonger', 'pacifist', 'gossip', 'chaos']) console.log(`all four ${p}`.padEnd(22), count(same(p)).seat);
