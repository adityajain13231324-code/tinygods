// Does difficulty really change how strong the bots are? Seat 0 is a normal bot; the other three
// play at the tested level. A normal bot among normal bots wins about 25%.   node tools/difficulty-test.js [matches]
import { createGame, runToEnd } from '../src/sim/turn.js';
import { mulberry32, shuffle } from '../src/sim/rng.js';
import { PERSONALITY_NAMES } from '../src/bots/personalities.js';
const N = Number(process.argv[2] ?? 200);
for (const level of (process.argv[3] ? [process.argv[3]] : ['easy', 'normal', 'hard'])) {
  let wins = 0;
  let turns = 0;
  for (let m = 1; m <= N; m++) {
    const types = shuffle(mulberry32(m * 7919), PERSONALITY_NAMES);
    const seats = [0, 1, 2, 3].map((i) => ({ name: 'b', kind: 'bot', personality: types[i], difficulty: i === 0 ? 'normal' : level }));
    const g = runToEnd(createGame({ seed: m, seats, cosmetics: false }));
    if (g.winner === 0) wins++;
    turns += g.turn;
  }
  console.log(`rivals on ${level.padEnd(6)}: a normal bot wins ${(100 * wins / N).toFixed(1)}%   (${(turns / N).toFixed(1)} turns per match)`);
}
