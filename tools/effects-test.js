// Checks that push powers and the time bomb really move and hurt villagers.
//   node tools/effects-test.js
// Exits with code 1 if any check fails.
import { createGame, submitOrders, updateGame } from '../src/sim/turn.js';
import { castPower } from '../src/sim/powers.js';

const seats = [{ name: 'You', kind: 'human' }, ...['a', 'b', 'c'].map((n) => ({ name: n, kind: 'bot', personality: 'pacifist' }))];
let failed = 0;
const check = (ok, text) => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${text}`);
  if (!ok) failed++;
};

// Violent cards and miracles are locked during the peace period, so play on until it ends.
function pastPeace(seed) {
  const g = createGame({ seed, seats, cosmetics: false });
  for (let guard = 0; g.world.peaceful && guard < 5000; guard++) {
    if (g.phase === 'command') submitOrders(g, 0, []);
    updateGame(g, 1);
  }
  while (g.phase !== 'command') updateGame(g, 1);
  return g;
}

// 1) Time bomb: plant it at the plaza, then see it go off at about 12 seconds and hurt someone.
{
  const g = pastPeace(12);
  g.hand[0] = ['bomb', 'spy', 'rally', 'truce'];
  const plaza = g.world.places.find((p) => p.id === 'plaza');
  const near = () => g.world.villagers.filter((v) => v.alive && Math.hypot(v.x - plaza.x, v.y - plaza.y) < 150);
  const res = submitOrders(g, 0, [], { id: 'bomb', place: 'plaza' });
  let hpBefore = null;
  let exploded = -1;
  for (let i = 0; i < 20 * 30; i++) {
    updateGame(g, 0.05);
    if (g.phase === 'sim' && hpBefore === null) hpBefore = near().reduce((n, v) => n + v.hp, 0);
    if (exploded < 0 && g.world.events.some((e) => e.type === 'explosion')) exploded = g.simElapsed;
  }
  const hpAfter = near().reduce((n, v) => n + v.hp, 0);
  check(res.ok, `bomb card accepted${res.ok ? '' : ': ' + res.error}`);
  check(exploded > 10 && exploded < 14, `bomb exploded at ${exploded.toFixed(1)}s of the turn (expected about 12)`);
  const bombDeaths = g.world.events.filter((e) => e.type === 'kill' && e.weapon === 'bomb').length;
  check(bombDeaths > 0, `bomb killed ${bombDeaths} villagers (hp near the plaza ${Math.round(hpBefore)} at start, ${Math.round(hpAfter)} at the end)`);
}

// 2) Gust: the target should be thrown a good distance toward the place.
{
  const g = pastPeace(12);
  submitOrders(g, 0, []);
  while (g.phase === 'command') updateGame(g, 1); // powers only work while the town acts
  const v = g.world.villagers.find((x) => x.faction === 0);
  const pond = g.world.places.find((p) => p.id === 'pond');
  const before = Math.hypot(v.x - pond.x, v.y - pond.y);
  v.timer = 99; // keep their own plans out of the measurement
  g.power[0] = 6;
  const r = castPower(g, 0, 'gust', { villagerId: v.id, placeId: 'pond' });
  const first = { x: v.x, y: v.y };
  for (let i = 0; i < 20; i++) updateGame(g, 0.05); // one second
  const moved = Math.hypot(v.x - first.x, v.y - first.y);
  check(r.ok, `gust cast${r.ok ? '' : ': ' + r.error}`);
  check(moved > 50, `gust moved the villager ${Math.round(moved)}px in one second (distance to the pond ${Math.round(before)} -> ${Math.round(Math.hypot(v.x - pond.x, v.y - pond.y))})`);
}

// 3) Earthquake: everybody is shoved.
{
  const g = pastPeace(12);
  submitOrders(g, 0, []);
  while (g.phase === 'command') updateGame(g, 1);
  g.power[0] = 6;
  const start = g.world.villagers.map((v) => ({ x: v.x, y: v.y }));
  const r = castPower(g, 0, 'earthquake', {});
  for (let i = 0; i < 10; i++) updateGame(g, 0.05);
  const avg = g.world.villagers.reduce((n, v, i) => n + Math.hypot(v.x - start[i].x, v.y - start[i].y), 0) / g.world.villagers.length;
  check(r.ok, `earthquake cast${r.ok ? '' : ': ' + r.error}`);
  check(avg > 5, `earthquake average displacement after half a second ${Math.round(avg)}px`);
}

process.exit(failed ? 1 : 0);
