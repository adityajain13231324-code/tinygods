import { IDEAS } from '../config/tunables.js';
import { effectiveWeapon } from './villager.js';

/**
 * One roll per eligible armed death. Eligible: a weapon that still works (a gun or launcher with no
 * ammunition left is only a club, and an empty launcher never becomes a pickup at all). The roll and
 * its result are recorded either way, so the log can say "kept it" as well as "dropped it".
 */
export function maybeDropWeapon(world, victim) {
  const weapon = effectiveWeapon(victim);
  if (weapon === 'none') return null;
  const dropped = world.rng() < IDEAS.drop.chance;
  const ammo = victim.ammo > 0 ? victim.ammo : 0;
  world.events.push({ type: 'weaponDropRoll', turn: world.turn, time: world.time, villagerId: victim.id, weapon, ammo, dropped, x: victim.x, y: victim.y });
  if (!dropped) return null;
  // Bounded: if too many lie around, the oldest dropped weapon quietly goes away.
  const lying = world.weaponDrops.filter((d) => d.weapon);
  if (lying.length >= IDEAS.drop.maxActive) {
    const oldest = lying.sort((a, b) => a.until - b.until)[0];
    world.weaponDrops.splice(world.weaponDrops.indexOf(oldest), 1);
    world.events.push({ type: 'weaponDespawn', turn: world.turn, time: world.time, x: oldest.x, y: oldest.y, weapon: oldest.weapon });
  }
  const drop = { id: `${world.turn}:${victim.id}:drop`, x: victim.x, y: victim.y, weapon, ammo, until: world.time + IDEAS.drop.seconds, ownerId: victim.id };
  world.weaponDrops.push(drop);
  victim.weapon = 'none';
  victim.ammo = 0;
  return drop;
}
