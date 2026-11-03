// "Does the villager AI behave sensibly?" Measures, over many headless matches:
//   - how often villagers change state (a calm villager should change state every ~5-10 s)
//   - ping-pong: A -> B -> A within 2 seconds (the classic symptom of rules fighting each other)
//   - which state pairs ping-pong most (tells you WHICH rules are fighting)
//   - stuck villagers: "walking" somewhere but not actually moving for 15+ seconds
//
//   node tools/ai-health.js [matches=10] [seed=1]

import { createGame } from '../src/sim/turn.js';
import { updateGame } from '../src/sim/turn.js';
import { SIM } from '../src/config/tunables.js';

const matches = Number(process.argv[2]) || 10;
const seed0 = Number(process.argv[3]) || 1;
const TICK = 1 / SIM.tickHz;

const dbg = {};
const totals = { villagerSeconds: 0, changes: 0, pingPong: 0, stuckEvents: 0 };
const pairCount = new Map();
const stateTime = {};

for (let m = 0; m < matches; m++) {
  const seats = ['warmonger', 'pacifist', 'opportunist', 'chaos'].map((p, i) => ({ name: `s${i}`, kind: 'bot', personality: p }));
  const game = createGame({ seed: seed0 * 1000 + m, seats, cosmetics: false });
  game.world.dbg = dbg;
  const track = game.world.villagers.map((v) => ({ last: v.state, prev: null, t: 0, lastChangeT: -99, px: v.x, py: v.y, still: 0, stuckFlag: false }));
  let safety = 0;
  while (game.phase !== 'ended' && safety++ < 400000) {
    if (game.phase === 'command') { updateGame(game, 30); continue; }
    if (game.phase === 'recap' || game.phase === 'guess') { updateGame(game, 100); continue; }
    updateGame(game, TICK);
    if (game.phase !== 'sim') continue;
    const now = game.world.time;
    game.world.villagers.forEach((v, i) => {
      if (!v.alive) return;
      const tr = track[i];
      totals.villagerSeconds += TICK;
      stateTime[v.state] = (stateTime[v.state] ?? 0) + TICK;
      if (v.state !== tr.last) {
        totals.changes++;
        if (tr.prev === v.state && now - tr.lastChangeT < 2) {
          totals.pingPong++;
          const key = `${tr.prev} <-> ${tr.last}`;
          pairCount.set(key, (pairCount.get(key) ?? 0) + 1);
        }
        tr.prev = tr.last;
        tr.last = v.state;
        tr.lastChangeT = now;
      }
      // Stuck: wants to go somewhere but has not moved for a long time.
      const moved = Math.hypot(v.x - tr.px, v.y - tr.py);
      if ((v.state === 'wander' || v.state === 'seek' || v.state === 'guard') && moved < 0.3) tr.still += TICK;
      else tr.still = 0;
      tr.px = v.x;
      tr.py = v.y;
      if (tr.still > 15 && !tr.stuckFlag) {
        tr.stuckFlag = true;
        totals.stuckEvents++;
        const key = `stuck in ${v.state}${v.purpose ? `(${v.purpose})` : ''}`;
        pairCount.set(key, (pairCount.get(key) ?? 0) + 1);
      }
      if (tr.still === 0) tr.stuckFlag = false;
    });
  }
}

const minutes = totals.villagerSeconds / 60;
console.log(`\n${matches} matches, ${minutes.toFixed(0)} villager-minutes simulated\n`);
console.log(`state changes per villager-minute: ${(totals.changes / minutes).toFixed(1)}   (calm life should be roughly 6-12)`);
console.log(`ping-pong flips per villager-minute: ${(totals.pingPong / minutes).toFixed(2)}   (target: under 0.5)`);
console.log(`stuck villagers per match: ${(totals.stuckEvents / matches).toFixed(1)}   (target: about 0)\n`);
console.log('worst offenders:');
for (const [k, n] of [...pairCount.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8)) console.log(`  ${String(n).padStart(6)}  ${k}`);
console.log('\ntime spent per state:');
const total = Object.values(stateTime).reduce((a, b) => a + b, 0);
for (const [k, t] of Object.entries(stateTime).sort((a, b) => b[1] - a[1])) console.log(`  ${k.padEnd(8)} ${((t / total) * 100).toFixed(1)}%`);

console.log('\nwhy fights start and stop (counts):');
for (const [k, n] of Object.entries(dbg).sort((a, b) => b[1] - a[1]).slice(0, 12)) console.log(`  ${String(n).padStart(6)}  ${k}`);
