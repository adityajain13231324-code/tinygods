import { LOYALTY, POPULATION } from '../config/tunables.js';
import { groupOf, emptyFx } from './villager.js';
import { shuffle } from './rng.js';

// Villagers are not property. "Faith" is how much a villager still believes in their own
// faction (it is their opinion of their own group, which starts at 60). Each turn it can erode:
//   - they are bonded to someone from another faction
//   - gentle souls (peacemakers, medics, cowards) are tired of the faction's war orders
//   - the faction has a bloody reputation (notoriety)
//   - they are having a bad day
// Low faith has two consequences. Before they leave, they start to dislike their OWN faction's
// members (so people turn on their neighbours: the existing grievance rules do this by themselves).
// Then, at the start of a turn, they may defect: to their partner's faction, to the group they like
// best, or out into the neutral crowd. Neutrals who adore a faction can also be recruited.

const clamp = (x, lo, hi) => Math.min(hi, Math.max(lo, x));
const isGentle = (v) => v.trait === 'peacemaker' || v.trait === 'medic' || v.trait === 'coward' || v.baseAggression < LOYALTY.gentleAggression;

/** Run once per turn change. Returns the defection events it created. */
export function applyLoyalty(game) {
  const { world } = game;
  const { rng } = world;
  const out = [];

  // 1. Faith drifts.
  for (const v of world.villagers) {
    if (!v.alive || v.faction < 0) continue;
    const f = v.faction;
    let drop = 0;
    const p = v.partnerId >= 0 ? world.villagers[v.partnerId] : null;
    if (p?.alive && p.faction !== f) {
      drop += LOYALTY.partnerPull;
      v.opinion[groupOf(p)] = Math.min(100, v.opinion[groupOf(p)] + 5); // they grow fonder of their partner's side
    }
    if (game.verbsLastTurn[f].size === 0) drop += LOYALTY.neglect; // an absent leader: no orders, no direction
    const gentle = isGentle(v);
    if (gentle && game.verbsLastTurn[f].has('hate')) drop += LOYALTY.warWeary;
    const shame = Math.max(0, game.notoriety[f] - LOYALTY.shameFrom);
    if (shame > 0) drop += shame * LOYALTY.shame * (gentle ? 1.4 : 0.5);
    drop += v.mood < -0.6 ? LOYALTY.badDay : v.mood > 0.6 ? LOYALTY.goodDay : 0;
    drop += (rng() - 0.5) * 2 * LOYALTY.wobble;
    // Content people slowly regain their faith.
    if (drop < 1) drop -= LOYALTY.recovery;
    v.opinion[f] = clamp(v.opinion[f] - drop, -100, 100);
  }

  // 2. Defections: lost faith, a destination, and a per-faction cap so one bad turn can't empty a faction.
  const left = new Array(POPULATION.factions).fill(0);
  for (const v of shuffle(rng, world.villagers.filter((x) => x.alive && x.faction >= 0))) {
    const f = v.faction;
    if (v.opinion[f] >= LOYALTY.defectBelow || left[f] >= LOYALTY.maxPerFactionPerTurn || rng() >= LOYALTY.defectChance) continue;
    const p = v.partnerId >= 0 ? world.villagers[v.partnerId] : null;
    let dest = -1; // neutral by default
    if (p?.alive && p.faction !== f) {
      dest = p.faction;
    } else {
      let best = LOYALTY.joinAbove;
      for (let g = 0; g < POPULATION.factions; g++) {
        if (g !== f && v.opinion[g] > best) {
          best = v.opinion[g];
          dest = g;
        }
      }
    }
    out.push(switchSides(world, v, dest));
    left[f]++;
  }

  // 3. Neutrals who adore a faction can be won over (this is how you "win neutrals over").
  const joined = new Array(POPULATION.factions).fill(0);
  for (const v of shuffle(rng, world.villagers.filter((x) => x.alive && x.faction === -1))) {
    let best = -1;
    let bestOpinion = LOYALTY.recruitAbove;
    for (let g = 0; g < POPULATION.factions; g++) {
      if (v.opinion[g] > bestOpinion && joined[g] < LOYALTY.recruitMax) {
        bestOpinion = v.opinion[g];
        best = g;
      }
    }
    if (best >= 0 && rng() < LOYALTY.recruitChance) {
      out.push(switchSides(world, v, best));
      joined[best]++;
    }
  }
  return out;
}

/** Change a villager's faction (dest -1 = neutral) and record the event. */
export function switchSides(world, v, dest) {
  const from = v.faction;
  const oldGroup = groupOf(v);
  v.faction = dest;
  const newGroup = groupOf(v);
  v.opinion[newGroup] = LOYALTY.newcomerOpinion; // they believe in their new side
  v.opinion[oldGroup] = Math.min(v.opinion[oldGroup], LOYALTY.resentment); // and resent the old one
  v.fx = emptyFx();
  v.armDone = false;
  v.revealed = true; // everyone saw it
  v.grievance.fill(0);
  v.truceUntil.fill(0);
  v.calmUntil = 0;
  const event = { type: 'defect', turn: world.turn, time: world.time, villagerId: v.id, from, to: dest };
  world.events.push(event);
  return event;
}
