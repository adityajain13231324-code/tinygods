import { BOND } from '../config/tunables.js';
import { groupOf } from './villager.js';
import { shuffle } from './rng.js';

// Bonds: two villagers who get attached. A bond is mutual (a.partnerId === b.id and the other
// way round). What partners DO for each other lives in brain.js and combat.js.

export const isFree = (v) => v.alive && v.partnerId < 0;

export function createBond(world, a, b) {
  a.partnerId = b.id;
  b.partnerId = a.id;
  // They start to like each other's whole group, and have nothing against each other.
  a.opinion[groupOf(b)] = Math.min(100, a.opinion[groupOf(b)] + BOND.opinionBoost);
  b.opinion[groupOf(a)] = Math.min(100, b.opinion[groupOf(a)] + BOND.opinionBoost);
  a.grievance[b.id] = 0;
  b.grievance[a.id] = 0;
  world.events.push({
    type: 'bond', turn: world.turn, time: world.time,
    aId: a.id, bId: b.id, aFaction: a.faction, bFaction: b.faction,
  });
}

/** Ends the bond from either side (death, a falling-out). Returns the former partner or null. */
export function breakBond(world, v) {
  const p = world.villagers[v.partnerId] ?? null;
  v.partnerId = -1;
  if (p) p.partnerId = -1;
  return p;
}

/**
 * A Love order: some villagers of `seat`'s faction get attached to villagers of the loved
 * group (who must not hate them). Stronger orders make more pairs. Returns how many.
 */
export function formLoveBonds(world, seat, groupId, strength) {
  const want = 1 + strength * BOND.perStrength;
  const mine = shuffle(world.rng, world.villagers.filter((v) => v.faction === seat && isFree(v)));
  let theirs = world.villagers.filter((v) => groupOf(v) === groupId && isFree(v) && v.opinion[seat] > BOND.minOpinion);
  let made = 0;
  for (const a of mine) {
    if (made >= want) break;
    let best = null;
    let bestD = Infinity;
    for (const b of theirs) {
      if (b === a) continue;
      const d = Math.hypot(a.x - b.x, a.y - b.y);
      if (d < bestD) {
        bestD = d;
        best = b;
      }
    }
    if (!best) break;
    createBond(world, a, best);
    theirs = theirs.filter((b) => b !== best);
    made++;
  }
  return made;
}
