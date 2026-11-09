import { IDEAS, POWERS, WEAPONS } from '../config/tunables.js';
import { effectiveWeapon, isFirearm } from './villager.js';
import { blast, powerDamage } from './combat.js';
import { shoveToward } from './shove.js';
import { shuffle } from './rng.js';

/** Runtime entities use simulation time and seeded randomness only. */
export function updatePowerEffects(world, dt) {
  for (let i = world.weaponDrops.length - 1; i >= 0; i--) {
    const drop = world.weaponDrops[i];
    if (drop.until !== undefined && world.time >= drop.until) {
      world.weaponDrops.splice(i, 1);
      world.events.push({ type: 'weaponDespawn', turn: world.turn, time: world.time, x: drop.x, y: drop.y, weapon: drop.weapon });
      continue;
    }
    const crate = !drop.weapon; // a launcher crate: anyone without a rocket launcher takes it
    const radius = crate ? POWERS.launcher.pickupRadius : IDEAS.drop.pickupRadius;
    // A dropped weapon goes to the nearest villager who has nothing usable in their hands (ties: lowest id).
    const pool = world.villagers.filter(v => v.alive && v.frozenUntil <= world.time && !v.carry && Math.hypot(v.x - drop.x, v.y - drop.y) <= radius && (crate ? v.weapon !== 'rocket' : effectiveWeapon(v) === 'none'));
    const first = crate ? shuffle(world.rng, pool).sort((a, b) => Math.hypot(a.x - drop.x, a.y - drop.y) - Math.hypot(b.x - drop.x, b.y - drop.y))[0]
      : pool.sort((a, b) => Math.hypot(a.x - drop.x, a.y - drop.y) - Math.hypot(b.x - drop.x, b.y - drop.y) || a.id - b.id)[0];
    if (!first) continue;
    first.weapon = crate ? 'rocket' : drop.weapon;
    first.ammo = crate ? WEAPONS.rocket.maxAmmo : drop.ammo;
    if (crate) first.escalation = 2;
    else if (first.state === 'attack') first.escalation = Math.max(first.escalation, isFirearm(first.weapon) ? 2 : 1); // already fighting: use it now
    first.lootUntil = 0;
    first.armDone = true;
    world.weaponDrops.splice(i, 1);
    world.events.push({ type: 'weaponPickup', turn: world.turn, time: world.time, villagerId: first.id, weapon: first.weapon, ammo: first.ammo, fromDeadId: drop.ownerId ?? -1, x: first.x, y: first.y });
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
