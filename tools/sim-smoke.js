// Proves the sim runs headless in plain Node (no browser, no Pixi).
// Usage: npm run smoke   (optionally: node tools/sim-smoke.js 42 600  = seed, seconds)

import { createWorld } from '../src/sim/world.js';
import { stepWorld } from '../src/sim/brain.js';
import { SIM, WORLD } from '../src/config/tunables.js';

const seed = Number(process.argv[2]) || 1;
const seconds = Number(process.argv[3]) || 300;

const world = createWorld(seed);
const dt = 1 / SIM.tickHz;
const ticks = Math.round(seconds * SIM.tickHz);
const stateCounts = {};
let chatTicks = 0;
let loveTicks = 0;

const started = performance.now();
for (let i = 0; i < ticks; i++) {
  stepWorld(world, dt);
  for (const v of world.villagers) {
    stateCounts[v.state] = (stateCounts[v.state] ?? 0) + 1;
    if (v.state === 'talk') chatTicks++;
    if (v.expression === 'love') loveTicks++;
  }
}
const ms = performance.now() - started;

const problems = [];
if (world.villagers.length !== 60) problems.push(`expected 60 villagers, got ${world.villagers.length}`);
for (const v of world.villagers) {
  if (![v.x, v.y, v.vx, v.vy].every(Number.isFinite)) problems.push(`${v.name} has a non-finite number`);
  if (v.x < 0 || v.x > WORLD.width || v.y < 0 || v.y > WORLD.height) problems.push(`${v.name} left the world`);
}

const total = ticks * world.villagers.length;
console.log(`seed ${seed}: ${seconds}s of town life (${ticks} ticks) simulated in ${ms.toFixed(0)} ms`);
for (const [state, n] of Object.entries(stateCounts)) {
  console.log(`  ${state.padEnd(7)} ${((n / total) * 100).toFixed(1)}%`);
}
console.log(`  heart-eyes share of chat time: ${chatTicks ? ((loveTicks / chatTicks) * 100).toFixed(1) : 0}%`);

if (problems.length) {
  console.error('PROBLEMS:\n  ' + problems.join('\n  '));
  process.exit(1);
}
console.log('OK');
