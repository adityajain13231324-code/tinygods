import { IDEAS } from '../config/tunables.js';

// Conditional orders: "Guard the armory, but retreat to the park if outnumbered."
// An order may carry `when: { cond, retreat }`. While the condition holds for a villager, the retreat
// replaces their other movement orders: they walk to the retreat place (or, with no place, stand down).
// Priority, highest first: panic and being attacked (self defence) > the condition > the order itself.
// Hysteresis stops flapping: once triggered the fallback holds for a few seconds, and it only releases
// after the condition has been false for a while.

export const CONDITIONS = {
  outnumbered: { id: 'outnumbered', name: 'outnumbered', text: 'rivals nearby outnumber your people by about 3 to 2 or more' },
  hurt: { id: 'hurt', name: 'badly hurt', text: 'a villager is under 45 HP, or their nearby group is worn down' },
  attacked: { id: 'attacked', name: 'attacked', text: 'anyone nearby is being attacked' },
};
export const CONDITION_IDS = Object.keys(CONDITIONS);
export const CONDITION_VERBS = ['protect', 'follow', 'assault', 'hunt', 'ambush', 'escort', 'festival', 'scare', 'shove', 'seize'];

const NEAR = 230;

export function conditionHolds(world, v, cond) {
  if (cond === 'hurt') {
    if (v.hp < IDEAS.condition.hurtHp) return true;
    const mates = world.villagers.filter((o) => o.alive && o.faction === v.faction && Math.hypot(o.x - v.x, o.y - v.y) < NEAR);
    return mates.length >= 3 && mates.reduce((s, o) => s + o.hp, 0) / mates.length < IDEAS.condition.hurtHp + 15;
  }
  let allies = 0, enemies = 0, attacked = false;
  for (const o of world.villagers) {
    if (!o.alive || Math.hypot(o.x - v.x, o.y - v.y) > NEAR) continue;
    if (o.faction === v.faction) {
      allies++;
      if (cond === 'attacked' && world.villagers.some((a) => a.alive && a.state === 'attack' && a.targetId === o.id)) attacked = true;
    } else if (o.faction >= 0) enemies++;
  }
  if (cond === 'attacked') return attacked;
  return enemies >= 2 && enemies >= allies * IDEAS.condition.outnumberRatio;
}

/**
 * Returns true if the fallback is acting on this villager (the caller then skips their other orders).
 * `h` are brain helpers, passed in so this module needs no import of the brain.
 */
export function conditionFallback(world, v, h) {
  const w = v.fx.when;
  if (!w) return false;
  const holds = conditionHolds(world, v, w.cond);
  if (holds) v.whenFalseSince = -1;
  else if (v.whenActive && v.whenFalseSince < 0) v.whenFalseSince = world.time;
  if (holds && !v.whenActive && world.time >= (v.whenCool ?? 0)) {
    v.whenActive = true;
    v.whenUntil = world.time + 4;
    world.events.push({ type: 'conditionTriggered', turn: world.turn, time: world.time, seat: v.faction, villagerId: v.id, cond: w.cond, retreat: w.retreat, verb: w.verb, x: v.x, y: v.y });
  }
  if (!v.whenActive) return false;
  // Released only once the danger is gone for 3 seconds AND the retreat is complete (or a minute has passed: orders reset at dusk anyway), and
  // then not triggered again for 10 seconds: otherwise a long siege makes people ping-pong between post and retreat.
  const place = w.retreat ? world.places.find((p) => p.id === w.retreat) : null;
  const arrived = !place || Math.hypot(v.x - place.x, v.y - place.y) <= place.radius * 0.8;
  if (!holds && world.time >= v.whenUntil && v.whenFalseSince >= 0 && world.time - v.whenFalseSince >= 3 && (arrived || world.time >= v.whenUntil + 56)) {
    v.whenActive = false;
    v.whenCool = world.time + 10;
    world.events.push({ type: 'conditionCleared', turn: world.turn, time: world.time, seat: v.faction, villagerId: v.id, cond: w.cond, x: v.x, y: v.y });
    return false;
  }
  if (w.retreat) {
    const place = world.places.find((p) => p.id === w.retreat);
    if (Math.hypot(v.x - place.x, v.y - place.y) > place.radius * 0.7) {
      if (v.state !== 'wander' || v.purpose !== 'retreat') h.goToPlace(world, v, place, 'retreat');
      return true;
    }
    if (v.state === 'wander' && v.purpose === 'retreat') h.startIdle(world, v, 'retreated');
    return true; // at the retreat place: hold there
  }
  v.calmUntil = Math.max(v.calmUntil, world.time + 6);
  if (v.state === 'attack') h.startIdle(world, v, 'condition stand down');
  return true;
}
