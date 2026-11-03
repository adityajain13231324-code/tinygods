// Do villagers pile up against walls and corners? Samples every villager once per sim second.
import { createGame, updateGame } from '../src/sim/turn.js';
import { SIM, WORLD } from '../src/config/tunables.js';

const matches = Number(process.argv[2]) || 8;
const TICK = 1 / SIM.tickHz;
const band = 90;
let samples = 0, nearWall = 0, nearCorner = 0, fleeSamples = 0, fleeStuck = 0, fleeWall = 0;
for (let m = 0; m < matches; m++) {
  const seats = ['warmonger', 'pacifist', 'opportunist', 'gossip'].map((p, i) => ({ name: `s${i}`, kind: 'bot', personality: p }));
  const game = createGame({ seed: 900 + m, seats, cosmetics: false });
  let tick = 0, guard = 0;
  while (game.phase !== 'ended' && guard++ < 300000) {
    if (game.phase === 'command') { updateGame(game, 30); continue; }
    if (game.phase === 'recap' || game.phase === 'guess') { updateGame(game, 100); continue; }
    updateGame(game, TICK);
    if (game.phase !== 'sim' || ++tick % SIM.tickHz !== 0) continue;
    for (const v of game.world.villagers) {
      if (!v.alive) continue;
      samples++;
      const dx = Math.min(v.x, WORLD.width - v.x);
      const dy = Math.min(v.y, WORLD.height - v.y);
      if (Math.min(dx, dy) < band) nearWall++;
      if (dx < 180 && dy < 180) nearCorner++;
      if (v.state === 'flee') {
        fleeSamples++;
        if (Math.min(dx, dy) < band) fleeWall++;
        if (Math.hypot(v.vx, v.vy) < 6) fleeStuck++;
      }
    }
  }
}
const pct = (a, b) => `${((a / b) * 100).toFixed(1)}%`;
console.log(`within ${band}px of a wall: ${pct(nearWall, samples)}   in a corner square: ${pct(nearCorner, samples)}  (a spread-out town would be about ${pct((WORLD.width * WORLD.height - (WORLD.width - 2 * band) * (WORLD.height - 2 * band)), WORLD.width * WORLD.height)} / ${pct(4 * 180 * 180, WORLD.width * WORLD.height)} if people were uniform)`);
console.log(`fleeing villagers: ${pct(fleeWall, fleeSamples)} are near a wall, ${pct(fleeStuck, fleeSamples)} are "fleeing" but barely moving (pinned)`);
