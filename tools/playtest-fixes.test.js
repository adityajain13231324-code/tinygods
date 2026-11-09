import test from 'node:test';
import assert from 'node:assert/strict';
import { createGame } from '../src/sim/turn.js';
import { stepWorld } from '../src/sim/brain.js';
import { routeVia, isWater, LAYOUTS } from '../src/sim/layouts.js';
import { applyOrders } from '../src/sim/orders.js';

const seats = () => Array.from({ length: 4 }, (_, i) => ({ name: `P${i}`, kind: 'human' }));
function fresh(layout = 'classic', seed = 61) {
  const g = createGame({ seed, seats: seats(), layout, cosmetics: false });
  g.phase = 'sim'; g.turn = g.world.turn = 5; g.world.peaceful = false; g.world.time = 10;
  g.world.villagers.forEach((v, i) => { v.x = v.px = 40 + (i % 30) * 6; v.y = v.py = 40 + Math.floor(i / 30) * 6; v.thinkTimer = 1e6; v.timer = 1e6; v.state = 'idle'; });
  return g;
}
const of = (g, f) => g.world.villagers.filter((v) => v.faction === f && v.alive);
const at = (v, x, y) => { v.x = v.px = x; v.y = v.py = y; return v; };
const tick = (g, n = 1) => { for (let i = 0; i < n; i++) stepWorld(g.world, 0.05); };

test('routing: with two canals the walker heads for the NEAREST one first (it used to stand at the bank)', () => {
  const canals = LAYOUTS.canal.canals;
  const [rx, ry] = routeVia(canals, 1317, 727, 405, 573); // just east of the east canal, going far west
  assert.ok(Math.abs(rx - 1280) < 80, `first waypoint is at the east canal (${rx.toFixed(0)}), not the far one`);
  let x = 1317, y = 727;
  for (let s = 0; s < 6000; s++) {
    const [tx, ty] = routeVia(canals, x, y, 405, 573);
    const d = Math.hypot(tx - x, ty - y) || 1;
    let nx = x + ((tx - x) / d) * 6, ny = y + ((ty - y) / d) * 6;
    if (isWater(canals, nx, ny)) { if (!isWater(canals, nx, y)) ny = y; else if (!isWater(canals, x, ny)) nx = x; else { nx = x; ny = y; } }
    x = nx; y = ny;
    if (Math.hypot(405 - x, 573 - y) < 12) return;
  }
  assert.fail(`never reached the west side, ended at ${x.toFixed(0)},${y.toFixed(0)}`);
});

const stage = (g, weapon = 'gun') => {
  const w = g.world;
  const drop = { id: 'd', x: 700, y: 500, weapon, ammo: 2, until: w.time + 20, ownerId: 9 };
  w.weaponDrops.push(drop);
  return drop;
};
const run = (g, seconds, fn) => { for (let i = 0; i < seconds * 20; i++) { for (const v of g.world.villagers) v.thinkTimer = Math.min(v.thinkTimer, 0.2); fn?.(); tick(g); } };

test('loot: an unarmed villager walks over and picks up a dropped weapon, and keeps its ammunition', () => {
  const g = fresh(); const v = at(of(g, 0)[0], 900, 560);
  const d = stage(g);
  run(g, 14);
  assert.equal(v.weapon, 'gun'); assert.equal(v.ammo, 2);
  assert.equal(g.world.weaponDrops.length, 0);
  assert.ok(g.world.events.some((e) => e.type === 'weaponPickup' && e.villagerId === v.id));
  void d;
});

test('loot: three competing villagers, exactly one gets it, and the others do not stampede', () => {
  const g = fresh(); const crowd = of(g, 0).slice(0, 3);
  at(crowd[0], 900, 500); at(crowd[1], 960, 520); at(crowd[2], 880, 580);
  stage(g);
  run(g, 14);
  assert.equal(crowd.filter((v) => v.weapon === 'gun').length, 1);
  assert.equal(crowd.filter((v) => v.weapon === 'none').length, 2);
  assert.equal(g.world.events.filter((e) => e.type === 'weaponPickup').length, 1);
});

test('loot: if the claimant dies on the way, the next villager takes it; armed and busy villagers never go', () => {
  const g = fresh(); const [a, b, armed, scared] = of(g, 0);
  at(a, 800, 500); at(b, 900, 540); at(armed, 720, 500); armed.weapon = 'bat'; at(scared, 1000, 560); scared.panic = 30; scared.state = 'idle';
  stage(g);
  run(g, 1);
  assert.equal(armed.weapon, 'bat'); assert.notEqual(scared.purpose, 'loot');
  assert.equal(g.world.weaponDrops[0]?.claimId, a.id, 'the nearest villager holds the claim');
  a.alive = false; a.hp = 0; a.state = 'dead'; // dies on the way, before the pickup
  run(g, 14);
  assert.equal(b.weapon, 'gun', 'the other villager picked it up after the claim lapsed');
});

test('loot: across a canal the villager still arrives by the bridge, and gives up if it truly cannot', () => {
  const g = fresh('canal'); const v = at(of(g, 0)[0], 400, 420);
  g.world.weaponDrops.push({ id: 'far', x: 1500, y: 560, weapon: 'knife', ammo: 0, until: 60, ownerId: 9 });
  v.lootCool = 0;
  run(g, 25);
  // 1100 px away is outside the 260 px seek radius: no trip is started
  assert.equal(v.weapon, 'none');
  g.world.weaponDrops.length = 0;
  const near = at(of(g, 1)[0], 560, 700);
  g.world.weaponDrops.push({ id: 'across', x: 740, y: 700, weapon: 'knife', ammo: 0, until: 90, ownerId: 9 }); // across the west canal: bridge at y=760
  run(g, 30);
  assert.equal(near.weapon, 'knife', 'reached an item on the far bank by crossing the bridge');
  assert.ok(!isWater(g.world.canals, near.x, near.y));
});

test('loot: a villager already fighting uses the weapon at once', () => {
  const g = fresh(); const a = at(of(g, 0)[0], 700, 500), b = at(of(g, 1)[0], 735, 500);
  Object.assign(a, { state: 'attack', targetId: b.id, escalation: 0 });
  g.world.weaponDrops.push({ id: 'now', x: 700, y: 500, weapon: 'gun', ammo: 3, until: 40, ownerId: 9 });
  tick(g);
  assert.equal(a.weapon, 'gun');
  assert.equal(a.escalation, 2);
});

test('competing movement orders do not make a villager flip every half second', () => {
  const g = fresh(); const w = g.world;
  const v = of(g, 0)[0];
  at(v, 1000, 700);
  applyOrders(w, 0, [{ verb: 'festival', target: { kind: 'place', id: 'bakery' }, strength: 3 }, { verb: 'protect', target: { kind: 'group', id: 0 }, strength: 3 }]);
  const mates = of(g, 0).slice(1, 4); mates.forEach((m, i) => at(m, 1200 + i * 30, 300));
  let flips = 0, last = v.state;
  for (let s = 0; s < 60; s++) { run(g, 0.5); if (v.state !== last) { flips++; last = v.state; } }
  assert.ok(flips <= 8, `${flips} state changes in 30 seconds`);
});
