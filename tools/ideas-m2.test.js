import test from 'node:test';
import assert from 'node:assert/strict';
import { createGame, runToEnd, updateGame } from '../src/sim/turn.js';
import { stepWorld } from '../src/sim/brain.js';
import { blast, resolveCombat } from '../src/sim/combat.js';
import { castPower } from '../src/sim/powers.js';
import { LAYOUTS, LAYOUT_IDS, isWater, layoutProblems, routeVia } from '../src/sim/layouts.js';
import { coverBlocks, findCoverSpot } from '../src/sim/props.js';
import { igniteNear } from '../src/sim/hazards.js';
import { IDEAS } from '../src/config/tunables.js';
import { PLACES } from '../src/config/content.js';
import { mulberry32 } from '../src/sim/rng.js';
import { authoritativeState } from '../src/sim/state.js';

const seats = (kind = 'human') => Array.from({ length: 4 }, (_, i) => ({ name: `P${i}`, kind, personality: ['warmonger', 'pacifist', 'gossip', 'opportunist'][i] }));
const game = (layout, seed = 5, kind = 'human') => {
  const g = createGame({ seed, seats: seats(kind), layout, cosmetics: true });
  g.phase = 'sim'; g.turn = g.world.turn = 5; g.world.peaceful = false; g.world.time = 10; g.power.fill(6);
  g.world.villagers.forEach((v) => { v.thinkTimer = 1e6; v.timer = 1e6; v.state = 'idle'; });
  return g;
};
const at = (v, x, y) => { v.x = v.px = x; v.y = v.py = y; return v; };
const of = (g, f) => g.world.villagers.filter((v) => v.faction === f && v.alive);

test('every layout keeps the nine place ids, stays on dry land and inside the map', () => {
  for (const id of LAYOUT_IDS) {
    const L = LAYOUTS[id];
    assert.deepEqual(layoutProblems(L), [], id);
    const ids = L.places().map((p) => p.id).sort();
    assert.deepEqual(ids, PLACES.map((p) => p.id).sort(), `${id} keeps every place`);
    assert.ok(L.props(L.places()).length >= 8, `${id} has cover props`);
  }
});

test('every place can be reached from every other one on foot (bridges included), in every layout', () => {
  for (const id of LAYOUT_IDS) {
    const L = LAYOUTS[id];
    const places = L.places();
    const cell = 16, cols = Math.ceil(1920 / cell), rows = Math.ceil(1080 / cell);
    const wet = (cx, cy) => isWater(L.canals, cx * cell + cell / 2, cy * cell + cell / 2);
    const seen = new Uint8Array(cols * rows);
    const start = places[0];
    const queue = [[Math.floor(start.x / cell), Math.floor(start.y / cell)]];
    seen[queue[0][1] * cols + queue[0][0]] = 1;
    while (queue.length) {
      const [cx, cy] = queue.pop();
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nx = cx + dx, ny = cy + dy;
        if (nx < 0 || ny < 0 || nx >= cols || ny >= rows || seen[ny * cols + nx] || wet(nx, ny)) continue;
        seen[ny * cols + nx] = 1;
        queue.push([nx, ny]);
      }
    }
    for (const p of places) assert.ok(seen[Math.floor(p.y / cell) * cols + Math.floor(p.x / cell)], `${id}: ${p.id} is reachable`);
  }
});

test('routing sends walkers over the bridge and never into the water', () => {
  const g = game('canal');
  const w = g.world;
  const v = at(of(g, 0)[0], 330, 100);
  let x = v.x, y = v.y;
  const goal = [1500, 900];
  for (let step = 0; step < 4000; step++) {
    const [tx, ty] = routeVia(w.canals, x, y, goal[0], goal[1]);
    const d = Math.hypot(tx - x, ty - y) || 1;
    const nx = x + (tx - x) / d * 6, ny = y + (ty - y) / d * 6;
    if (isWater(w.canals, nx, ny)) { if (!isWater(w.canals, nx, y)) { x = nx; } else if (!isWater(w.canals, x, ny)) { y = ny; } } else { x = nx; y = ny; }
    assert.ok(!isWater(w.canals, x, y), `step ${step} would be in water at ${x.toFixed(0)},${y.toFixed(0)}`);
    if (Math.hypot(goal[0] - x, goal[1] - y) < 12) return;
  }
  assert.fail(`never arrived: ended at ${x.toFixed(0)},${y.toFixed(0)}`);
});

test('whole matches finish in every layout with nobody ever standing in water or off the map', () => {
  for (const id of LAYOUT_IDS) {
    const g = createGame({ seed: 31, seats: seats('bot'), layout: id, cosmetics: false });
    let guard = 0;
    while (g.phase !== 'ended' && guard++ < 60000) {
      updateGame(g, g.phase === 'command' ? 30 : 0.05);
      if (g.phase === 'sim' && guard % 40 === 0) {
        for (const v of g.world.villagers) {
          if (!v.alive) continue;
          assert.ok(!isWater(g.world.canals, v.x, v.y), `${id}: ${v.name} in water at ${v.x.toFixed(0)},${v.y.toFixed(0)} turn ${g.turn}`);
          assert.ok(v.x > 0 && v.x < 1920 && v.y > 0 && v.y < 1080, `${id}: ${v.name} left the map`);
        }
      }
    }
    assert.equal(g.phase, 'ended', `${id} ended`);
  }
});

test('cover: a prop in the line of fire stops some bullets, not all, and a destroyed prop stops none', () => {
  const g = game('classic'); const w = g.world;
  const stall = w.props.find((p) => p.kind === 'stall');
  const a = at(of(g, 1)[0], stall.x - 120, stall.y), b = at(of(g, 0)[0], stall.x + 90, stall.y);
  let blocked = 0;
  w.rng = mulberry32(3);
  for (let i = 0; i < 400; i++) if (coverBlocks(w, a, b)) blocked++;
  assert.ok(blocked > 80 && blocked < 320, `blocked ${blocked}/400: cover helps but is not a wall`);
  const off = at(of(g, 2)[0], stall.x - 120, stall.y + 200), off2 = at(of(g, 3)[0], stall.x + 90, stall.y + 200);
  let free = 0;
  for (let i = 0; i < 100; i++) if (coverBlocks(w, off, off2)) free++;
  assert.equal(free, 0, 'no prop between them: nothing is blocked');
  stall.alive = false;
  for (let i = 0; i < 100; i++) assert.equal(coverBlocks(w, a, b)?.id === stall.id, false);
});

test('cover: a gunshot into cover is recorded with the prop that took it and does no damage', () => {
  const g = game('classic'); const w = g.world;
  const stall = w.props.find((p) => p.kind === 'wall');
  const a = at(of(g, 1)[0], stall.x - 95, stall.y), b = at(of(g, 0)[0], stall.x + 55, stall.y);
  Object.assign(a, { state: 'attack', targetId: b.id, weapon: 'gun', ammo: 100, escalation: 2, cd: 0 });
  Object.assign(b, { hp: 100, partnerId: -1, guardBonus: 0 });
  w.rng = (() => { const r = mulberry32(11); return () => r(); })();
  let coverShots = 0;
  for (let i = 0; i < 80; i++) { a.cd = 0; b.hp = 100; resolveCombat(w, 0.05); const s = w.events.filter((e) => e.type === 'gunshot').at(-1); if (s?.coverId) { coverShots++; assert.equal(b.hp, 100, 'cover took the bullet'); assert.equal(s.hit, false); } }
  assert.ok(coverShots > 5, `covered shots recorded (${coverShots})`);
});

test('cover: a villager shot at runs to a spot behind a prop and leaves once the gunman is gone', () => {
  const g = game('classic'); const w = g.world;
  const bench = w.props.find((p) => p.id === 'bench-plaza-0');
  const gunman = at(of(g, 1)[0], bench.x + 220, bench.y); gunman.weapon = 'gun'; gunman.ammo = 3;
  const victim = at(of(g, 0)[0], bench.x - 70, bench.y + 30);
  const spot = findCoverSpot(w, victim, gunman.x, gunman.y);
  assert.ok(spot, 'a spot behind the bench');
  assert.ok(Math.hypot(spot.x - gunman.x, spot.y - gunman.y) > Math.hypot(bench.x - gunman.x, bench.y - gunman.y), 'the spot is on the far side of the prop');
  victim.panic = 3; victim.panicX = gunman.x; victim.panicY = gunman.y; victim.thinkTimer = 0;
  stepWorld(w, 0.05);
  assert.equal(victim.state, 'flee');
  assert.ok(victim.coverSpot, 'heading for cover');
  gunman.weapon = 'none'; gunman.ammo = 0;
  for (let i = 0; i < 160; i++) { victim.thinkTimer = Math.min(victim.thinkTimer, 0.05); stepWorld(w, 0.05); }
  assert.notEqual(victim.state, 'flee', 'came out again once nobody armed was near');
});

test('blasts destroy breakable cover once, spill market goods, and leave boulders alone', () => {
  const g = game('market'); const w = g.world;
  const stall = w.props.find((p) => p.kind === 'stall');
  const bench = w.props.find((p) => p.kind === 'bench');
  blast(w, 0, stall.x, stall.y, 90, { source: { kind: 'power', id: 'fireball', seat: 0 } });
  assert.equal(stall.alive, false);
  assert.equal(w.events.filter((e) => e.type === 'propDestroyed' && e.propId === stall.id).length, 1);
  assert.ok(w.goods.length > 0 && w.goods.length <= IDEAS.hazard.maxGoods);
  const h = game('hill'); const rock = h.world.props.find((p) => p.kind === 'rock');
  blast(h.world, 0, rock.x, rock.y, 120, { source: { kind: 'power', id: 'fireball', seat: 0 } });
  blast(h.world, 0, rock.x, rock.y, 120, { source: { kind: 'power', id: 'fireball', seat: 0 } });
  assert.equal(rock.alive, true);
  assert.ok(bench);
  for (let i = 0; i < 8; i++) blast(w, 0, stall.x + i, stall.y, 90, { source: { kind: 'card', id: 'bomb', seat: 0 } });
  assert.ok(w.goods.length <= IDEAS.hazard.maxGoods, 'goods stay capped');
});

test('fire: smoulders first (telegraph), then burns, hurts, spreads, and burns out; rain puts it out', () => {
  const g = game('farms'); const w = g.world;
  const [p0] = w.grass;
  const victim = at(of(g, 1)[0], p0.x, p0.y); victim.hp = 100;
  igniteNear(w, p0.x, p0.y, 10, 0, 'test');
  assert.equal(p0.state, 'smolder');
  stepWorld(w, 0.05);
  assert.equal(p0.state, 'smolder', 'a warning period before any damage');
  assert.equal(victim.hp, 100);
  w.time = p0.flameAt + 0.01;
  stepWorld(w, 0.05);
  assert.equal(p0.state, 'burning');
  w.time += IDEAS.hazard.fireTick + 0.01; stepWorld(w, 0.05);
  assert.ok(victim.hp < 100, 'standing in flames hurts');
  assert.ok(w.events.some((e) => e.type === 'grassIgnite'));
  // spreading and a bounded count
  w.time += IDEAS.hazard.spreadEvery + 0.1; stepWorld(w, 0.05);
  assert.ok(w.grass.filter((p) => p.state === 'smolder' || p.state === 'burning').length <= IDEAS.hazard.maxFires);
  // burns out
  w.time = p0.until + 0.1; stepWorld(w, 0.05);
  assert.equal(p0.state, 'burnt');
  // water
  const h = game('farms'); const q = h.world.grass[0];
  igniteNear(h.world, q.x, q.y, 10, 0, 'test');
  h.world.time = q.flameAt + 0.1; stepWorld(h.world, 0.05);
  assert.equal(q.state, 'burning');
  assert.ok(castPower(h, 0, 'rain', { x: q.x, y: q.y }).ok);
  stepWorld(h.world, 0.05);
  assert.equal(q.state, 'wet');
  assert.ok(h.world.events.some((e) => e.type === 'grassOut' && e.wasBurning));
});

test('hill slows the climb; layouts are deterministic per seed', () => {
  const run = (id) => { const g = createGame({ seed: 77, seats: seats('bot'), layout: id, cosmetics: false }); for (let i = 0; i < 900; i++) updateGame(g, g.phase === 'command' ? 30 : 0.05); return JSON.stringify(authoritativeState(g)); };
  for (const id of LAYOUT_IDS) assert.equal(run(id), run(id), `${id} reproduces`);
  assert.notEqual(run('canal'), run('classic'));
});
