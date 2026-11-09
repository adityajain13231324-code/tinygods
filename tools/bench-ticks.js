// Raw engine cost of a tick with all 60 villagers alive: peaceful town, then a brawl-heavy town.
//   node tools/bench-ticks.js
import { createGame } from '../src/sim/turn.js';
import { stepWorld } from '../src/sim/brain.js';
const seats = Array.from({ length: 4 }, (_, i) => ({ name: `B${i}`, kind: 'bot', personality: 'warmonger' }));
const run = (label, setup, ticks = 6000) => {
  const g = createGame({ seed: 7, seats, cosmetics: false });
  setup(g.world);
  for (let i = 0; i < 400; i++) stepWorld(g.world, 0.05); // warm up
  const t0 = performance.now();
  for (let i = 0; i < ticks; i++) stepWorld(g.world, 0.05);
  const ms = performance.now() - t0;
  console.log(`${label.padEnd(10)} ${(ms / ticks * 1000).toFixed(1)} us per tick, ${g.world.villagers.filter((v) => v.alive).length} alive`);
};
run('peaceful', (w) => { w.peaceful = true; });
run('hostile', (w) => { w.peaceful = false; for (const v of w.villagers) { v.aggression = 90; for (let i = 0; i < 5; i++) v.opinion[i] = -60; } });
