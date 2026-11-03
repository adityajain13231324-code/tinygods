// How much is each card worth? Seat 0 (an opportunist bot) plays the same card every turn, against three
// shuffled bots, and we compare its win rate with playing no card at all.
//   node tools/card-value.js [matches]
import { createGame, submitOrders, updateGame, skipRecap } from '../src/sim/turn.js';
import { botDecide } from '../src/bots/bot.js';
import { CARD_IDS, CARD_DEFS } from '../src/sim/cards.js';
import { PERSONALITY_NAMES } from '../src/bots/personalities.js';
import { shuffle, mulberry32 } from '../src/sim/rng.js';
import { livingByFaction } from '../src/sim/win.js';

const N = Number(process.argv[2] ?? 200);

function play(match, cardId) {
  const types = shuffle(mulberry32(match * 31), PERSONALITY_NAMES);
  const seats = [{ name: 'T', kind: 'bot', personality: 'opportunist' }, ...[0, 1, 2].map((i) => ({ name: 'b', kind: 'bot', personality: types[i] }))];
  const g = createGame({ seed: match, seats, cosmetics: false });
  let guard = 0;
  while (g.phase !== 'ended' && guard++ < 200000) {
    if (g.phase === 'command') {
      // A real hand holds any one card about 4 times in 17 (about 24% of turns), so play it that often, not every turn.
      const holds = mulberry32(match * 7919 + g.turn)() < 0.24;
      if (cardId && !g.eliminated[0] && g.turn > 2 && holds) {
        // replace the test seat's bot choice with a forced card
        g.pending[0] = null;
        g.hand[0] = [cardId];
        const living = livingByFaction(g.world);
        const rivals = [1, 2, 3].filter((s) => living[s] > 0).sort((a, b) => living[b] - living[a]);
        const def = CARD_DEFS[cardId];
        let card = { id: cardId };
        if (def.needs === 'group') card.group = rivals[0] ?? 1;
        if (def.needs === 'place') {
          let best = g.world.places[0];
          let bestN = -1;
          for (const p of g.world.places) {
            const n = g.world.villagers.filter((v) => v.alive && v.faction > 0 && Math.hypot(v.x - p.x, v.y - p.y) < p.radius + 60).length
              - 2 * g.world.villagers.filter((v) => v.alive && v.faction === 0 && Math.hypot(v.x - p.x, v.y - p.y) < p.radius + 60).length;
            if (n > bestN) { bestN = n; best = p; }
          }
          card.place = best.id;
        }
        const orders = botDecide(g, 0);
        const r = submitOrders(g, 0, orders, card);
        if (!r.ok) submitOrders(g, 0, orders);
      }
      updateGame(g, 30);
    } else if (g.phase === 'recap') skipRecap(g);
    else updateGame(g, 0.05);
  }
  return g.winner === 0;
}

const base = (() => { let w = 0; for (let m = 1; m <= N; m++) if (play(m, null)) w++; return w / N; })();
console.log(`no card (opportunist bot, seat 0): ${(100 * base).toFixed(1)}% over ${N} matches\n`);
const rows = [];
for (const id of CARD_IDS) {
  let w = 0;
  for (let m = 1; m <= N; m++) if (play(m, id)) w++;
  rows.push([id, w / N]);
}
rows.sort((a, b) => b[1] - a[1]);
for (const [id, p] of rows) {
  const d = (100 * (p - base)).toFixed(1);
  console.log(`${CARD_DEFS[id].name.padEnd(16)} ${(100 * p).toFixed(1).padStart(5)}%   ${d >= 0 ? '+' : ''}${d} points`);
}
