// Balance and pacing across the new layouts and challenge modes (bot-only matches, deterministic seeds).
//   node tools/ideas-balance.js [matchesPerConfig=40]
import { createGame, runToEnd } from '../src/sim/turn.js';
import { LAYOUT_IDS } from '../src/sim/layouts.js';
import { MODE_IDS } from '../src/sim/modes.js';

const N = Number(process.argv[2] ?? 40);
const personalities = ['warmonger', 'pacifist', 'gossip', 'opportunist', 'chaos'];
const configs = [
  ...LAYOUT_IDS.map((layout) => ({ layout, mode: 'standard' })),
  ...MODE_IDS.filter((m) => m !== 'standard').map((mode) => ({ layout: 'classic', mode })),
];
let bad = 0;
for (const cfg of configs) {
  const wins = [0, 0, 0, 0, 0]; // seats 0..3, and "no winner"
  let turns = 0, capped = 0, firstKill = 0, kills = 0, drops = 0, fires = 0, cover = 0, steals = 0;
  const t0 = Date.now();
  for (let s = 1; s <= N; s++) {
    const seats = Array.from({ length: 4 }, (_, i) => ({ name: `B${i}`, kind: 'bot', personality: personalities[(s + i) % 5] }));
    const g = createGame({ seed: 1000 + s, seats, cosmetics: false, ...cfg });
    runToEnd(g);
    const ev = g.world.events;
    turns += g.turn;
    if (g.turn >= 20) capped++;
    wins[g.winner >= 0 && g.winner != null ? g.winner : 4]++;
    firstKill += ev.find((e) => e.type === 'kill')?.turn ?? 20;
    kills += ev.filter((e) => e.type === 'kill').length;
    drops += ev.filter((e) => e.type === 'weaponDropRoll' && e.dropped).length;
    fires += ev.filter((e) => e.type === 'grassIgnite').length;
    cover += ev.filter((e) => e.type === 'gunshot' && e.coverId).length;
    steals += ev.filter((e) => e.type === 'weaponStolen').length;
    if (g.phase !== 'ended') bad++;
  }
  const pct = (x) => `${((100 * x) / N).toFixed(0)}%`;
  console.log(`${cfg.layout.padEnd(8)} ${cfg.mode.padEnd(10)} turns ${(turns / N).toFixed(1).padStart(5)}  capped ${pct(capped).padStart(4)}  first kill T${(firstKill / N).toFixed(1)}  kills ${(kills / N).toFixed(0).padStart(3)}  seats ${wins.slice(0, 4).map(pct).join('/')}  draw ${pct(wins[4])}  per match: drops ${(drops / N).toFixed(1)} fires ${(fires / N).toFixed(1)} covered shots ${(cover / N).toFixed(1)} thefts ${(steals / N).toFixed(1)}  (${((Date.now() - t0) / 1000).toFixed(0)}s)`);
}
if (bad) { console.log(`PROBLEM: ${bad} matches did not finish`); process.exit(1); }
