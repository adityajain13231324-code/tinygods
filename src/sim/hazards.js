import { IDEAS } from '../config/tunables.js';
import { powerDamage } from './combat.js';

// Environmental chain reactions: dry grass that smoulders, burns, spreads and is put out by water,
// and market goods scattered by blasts. Every object is bounded (patch count is fixed by the layout,
// fires and goods are capped) and simulation-only: the renderer just draws what is here.

export const makeGrass = (defs) => defs.map((g) => ({ ...g, state: 'dry', flameAt: 0, until: 0, nextSpread: 0, nextTick: 0, seat: -1 }));

const activeFires = (world) => world.grass.filter((p) => p.state === 'smolder' || p.state === 'burning').length;

/** Explosions and lightning can start a fire in dry grass within reach. Telegraphed: smouldering comes first. */
export function igniteNear(world, x, y, r, seat, cause) {
  for (const p of world.grass) {
    if (p.state !== 'dry' || Math.hypot(p.x - x, p.y - y) > p.r + r) continue;
    smolder(world, p, seat, cause);
  }
}

function smolder(world, p, seat, cause) {
  if (activeFires(world) >= IDEAS.hazard.maxFires) return;
  p.state = 'smolder';
  p.flameAt = world.time + IDEAS.hazard.telegraphSeconds;
  p.seat = seat;
  world.events.push({ type: 'grassSmolder', turn: world.turn, time: world.time, patchId: p.id, x: p.x, y: p.y, seat, cause, flameAt: p.flameAt });
}

export function scatterGoods(world, x, y, n) {
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2 + (world.turn % 5);
    const d = 20 + ((i * 37) % 55);
    world.goods.push({ id: `${world.turn}:${world.goods.length}:${Math.round(world.time * 10)}`, x: x + Math.cos(a) * d, y: y + Math.sin(a) * d * 0.7, look: i % 4, until: world.time + 14 });
  }
  while (world.goods.length > IDEAS.hazard.maxGoods) world.goods.shift();
  world.events.push({ type: 'goodsScatter', turn: world.turn, time: world.time, x, y, count: n });
}

const watered = (world, p) => world.fogs.some((f) => f.rain && world.time < f.until && Math.hypot(f.x - p.x, f.y - p.y) < f.r + p.r * 0.5)
  || world.whirlpools.some((w) => world.time < w.until && Math.hypot(w.x - p.x, w.y - p.y) < w.r + p.r * 0.5);

export function updateHazards(world) {
  for (let i = world.goods.length - 1; i >= 0; i--) if (world.time >= world.goods[i].until) world.goods.splice(i, 1);
  for (const p of world.grass) {
    if (p.state === 'dry' || p.state === 'wet' || p.state === 'burnt') continue;
    if (watered(world, p)) {
      const was = p.state;
      p.state = 'wet';
      world.events.push({ type: 'grassOut', turn: world.turn, time: world.time, patchId: p.id, x: p.x, y: p.y, wasBurning: was === 'burning' });
      continue;
    }
    if (p.state === 'smolder') {
      if (world.time < p.flameAt) continue;
      p.state = 'burning';
      p.until = world.time + IDEAS.hazard.fireSeconds;
      p.nextSpread = world.time + IDEAS.hazard.spreadEvery;
      p.nextTick = world.time;
      world.events.push({ type: 'grassIgnite', turn: world.turn, time: world.time, patchId: p.id, x: p.x, y: p.y, seat: p.seat });
      for (const v of world.villagers) {
        if (!v.alive || Math.hypot(v.x - p.x, v.y - p.y) >= p.r) continue;
        v.panic = Math.max(v.panic, 2);
        v.panicX = p.x;
        v.panicY = p.y;
      }
    }
    if (p.state !== 'burning') continue;
    if (world.time >= p.nextTick) {
      p.nextTick = world.time + IDEAS.hazard.fireTick;
      for (const v of world.villagers) {
        if (!v.alive || Math.hypot(v.x - p.x, v.y - p.y) > p.r) continue;
        powerDamage(world, v, IDEAS.hazard.fireDamage, { kind: 'hazard', id: 'fire', seat: p.seat, actionId: `${world.turn}:${p.seat}:hazard:fire`, x: p.x, y: p.y }, 'fire');
      }
    }
    if (world.time >= p.nextSpread) {
      p.nextSpread = world.time + IDEAS.hazard.spreadEvery;
      const next = world.grass.find((q) => q.state === 'dry' && Math.hypot(q.x - p.x, q.y - p.y) < (p.r + q.r) * 1.7);
      if (next) {
        smolder(world, next, p.seat, 'spread');
        world.events.push({ type: 'grassSpread', turn: world.turn, time: world.time, fromId: p.id, toId: next.id, x: next.x, y: next.y });
      }
    }
    if (world.time >= p.until) {
      p.state = 'burnt';
      world.events.push({ type: 'grassBurnt', turn: world.turn, time: world.time, patchId: p.id, x: p.x, y: p.y });
    }
  }
}

/** Dusk: the grass grows back and the stalls' goods are swept away. */
export function resetHazards(world) {
  for (const p of world.grass) { p.state = 'dry'; p.flameAt = p.until = p.nextSpread = p.nextTick = 0; p.seat = -1; }
  world.goods = [];
}
