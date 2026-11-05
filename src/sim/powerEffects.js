import { POWERS, WEAPONS } from '../config/tunables.js';
import { blast, powerDamage } from './combat.js';
import { shoveToward } from './shove.js';
import { shuffle } from './rng.js';

/** Runtime entities use simulation time and seeded randomness only. */
export function updatePowerEffects(world, dt) {
  for (let i = world.weaponDrops.length - 1; i >= 0; i--) {
    const drop = world.weaponDrops[i];
    const candidates = shuffle(world.rng, world.villagers.filter(v => v.alive && v.weapon !== 'rocket' && v.frozenUntil <= world.time && Math.hypot(v.x - drop.x, v.y - drop.y) <= POWERS.launcher.pickupRadius))
      .sort((a, b) => Math.hypot(a.x - drop.x, a.y - drop.y) - Math.hypot(b.x - drop.x, b.y - drop.y));
    const first = candidates[0];
    if (!first) continue;
    first.weapon = 'rocket'; first.ammo = WEAPONS.rocket.maxAmmo; first.escalation = 2;
    first.armDone = true;
    world.weaponDrops.splice(i, 1);
    world.events.push({ type: 'weaponPickup', turn: world.turn, time: world.time, villagerId: first.id, x: first.x, y: first.y });
  }
  for (let i = world.whirlpools.length - 1; i >= 0; i--) {
    const w = world.whirlpools[i];
    const elapsed = Math.max(0, Math.min(world.time, w.until) - w.lastTick);
    w.lastTick = Math.min(world.time, w.until);
    for (const v of world.villagers) {
      if (!v.alive) continue;
      const d = Math.hypot(v.x - w.x, v.y - w.y);
      if (d > w.r) continue;
      const k = Math.max(0, 1 - d / w.r);
      if (v.frozenUntil <= world.time) shoveToward(v, w.x, w.y, POWERS.whirlpool.pull * (0.3 + 0.7 * k) * elapsed);
      powerDamage(world, v, POWERS.whirlpool.maxDamage / POWERS.whirlpool.seconds * elapsed * k, w.source, 'whirlpool');
    }
    if (world.time >= w.until) world.whirlpools.splice(i, 1);
  }
  for (let i = world.rockets.length - 1; i >= 0; i--) {
    const r = world.rockets[i];
    if (world.time < r.at) continue;
    world.rockets.splice(i, 1);
    blast(world, r.seat, r.tx, r.ty, POWERS.fireball.radius * POWERS.launcher.radiusMultiplier, { minDamage: POWERS.fireball.minDamage * POWERS.launcher.damageMultiplier * r.bonus, maxDamage: POWERS.fireball.maxDamage * POWERS.launcher.damageMultiplier * r.bonus, minKnock: 300, maxKnock: 600, source: r.source });
  }
}
