import { IDEAS } from '../config/tunables.js';
import { effectiveWeapon } from './villager.js';
import { shoveFrom } from './shove.js';
import { remember } from './memory.js';
import { startRumor } from './rumors.js';

// The wandering troublemaker: one seeded neutral per town with three plain goals, all visible.
//   steal   sneak up on an armed villager and take the weapon, then run
//   rumor   start an accusation against a random faction
//   dash    run through a tense confrontation and break it up (for a moment)
// Everything goes through the normal rules: stolen weapons are ordinary weapons, rumors are ordinary
// rumors, and every action is an event naming the troublemaker. They are not immune: they can be hit,
// scared and killed like anyone. Players can hunt them, guard them, or recruit them (see the guide).

const dist = (a, x, y) => Math.hypot(a.x - x, a.y - y);

export function troubleDuties(world, v, h) {
  if (world.peaceful || ['attack', 'flee', 'mourn', 'talk'].includes(v.state) || v.panic > 0 || v.carry || v.carrying) return false;
  const T = (v.trouble ??= { next: world.time + 5, nextRumor: world.time + 8, steals: 0, turn: world.turn, mode: null, targetId: -1, until: 0, ax: 0, ay: 0, aId: -1, bId: -1 });
  if (T.turn !== world.turn) { T.turn = world.turn; T.steals = 0; T.mode = null; T.next = Math.max(T.next, world.time + 4); }

  if (T.mode === 'steal') {
    const t = world.villagers[T.targetId];
    if (!t?.alive || effectiveWeapon(t) === 'none' || effectiveWeapon(v) !== 'none' || world.time > T.until) { T.mode = null; T.next = world.time + 4; return false; }
    if (dist(v, t.x, t.y) < IDEAS.trouble.stealRadius) {
      v.weapon = t.weapon; v.ammo = t.ammo; v.armDone = true;
      t.weapon = 'none'; t.ammo = 0;
      remember(world, t, v.id, 'robbed');
      t.grievance[v.id] = (t.grievance[v.id] ?? 0) + t.tolerance * 0.9;
      world.events.push({ type: 'weaponStolen', turn: world.turn, time: world.time, thiefId: v.id, victimId: t.id, weapon: v.weapon, ammo: v.ammo, x: t.x, y: t.y });
      T.steals++; T.mode = null; T.next = world.time + IDEAS.trouble.stealEvery;
      v.expression = 'happy';
      h.startFlee(world, v, t.x, t.y);
      return true;
    }
    v.state = 'wander'; v.purpose = 'mischief'; v.expression = 'suspicious';
    [v.targetX, v.targetY] = h.walkingGoal(world, t.x, t.y);
    return true;
  }
  if (T.mode === 'dash') {
    const a = world.villagers[T.aId], b = world.villagers[T.bId];
    if (!a?.alive || !b?.alive || world.time > T.until) { T.mode = null; return false; }
    if (dist(v, T.ax, T.ay) < 45) {
      for (const o of [a, b]) {
        shoveFrom(o, v.x, v.y, 260);
        o.calmUntil = Math.max(o.calmUntil, world.time + 1.5);
        if (o.state === 'attack') h.startIdle(world, o, 'troublemaker');
      }
      world.events.push({ type: 'troubleDash', turn: world.turn, time: world.time, thiefId: v.id, aId: a.id, bId: b.id, x: v.x, y: v.y });
      T.mode = null; T.next = world.time + 18;
      v.expression = 'happy';
      h.startFlee(world, v, a.x, a.y);
      return true;
    }
    v.state = 'wander'; v.purpose = 'mischief'; v.expression = 'happy';
    [v.targetX, v.targetY] = h.walkingGoal(world, T.ax, T.ay);
    return true;
  }

  if (world.time >= T.nextRumor) {
    T.nextRumor = world.time + IDEAS.trouble.rumorEvery;
    const group = Math.floor(world.rng() * 4);
    startRumor(world, -1, 'accuse', group, 1, 1, v.id);
    world.events.push({ type: 'troubleRumor', turn: world.turn, time: world.time, villagerId: v.id, group, x: v.x, y: v.y });
  }
  if (world.time < T.next) return false;
  if (T.steals < IDEAS.trouble.stealMax && effectiveWeapon(v) === 'none') {
    let best = null, bestD = 450;
    for (const o of world.villagers) {
      if (!o.alive || o === v || effectiveWeapon(o) === 'none' || o.trait === 'troublemaker') continue;
      const d = dist(o, v.x, v.y);
      if (d < bestD) { bestD = d; best = o; }
    }
    if (best) { T.mode = 'steal'; T.targetId = best.id; T.until = world.time + 9; return true; }
  }
  for (const a of world.villagers) {
    if (!a.alive || a.state !== 'attack' || a.targetId == null) continue;
    const b = world.villagers[a.targetId];
    if (!b?.alive) continue;
    const mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2;
    if (dist(v, mx, my) > 500) continue;
    T.mode = 'dash'; T.aId = a.id; T.bId = b.id; T.ax = mx; T.ay = my; T.until = world.time + 8;
    return true;
  }
  T.next = world.time + 3;
  return false;
}
