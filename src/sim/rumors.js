import { RUMOR } from '../config/tunables.js';
import { groupOf } from './villager.js';
import { shuffle } from './rng.js';

// Rumors: the only way to change what OTHER factions' villagers and neutrals think.
//   Accuse  "the Tides poisoned the well"  -> believers like the Tides less
//   Praise  "the Tides saved a child"      -> believers like the Tides more
// A rumor starts with a few villagers, who may or may not believe it (the more a villager
// trusts the player behind it, the likelier). Believers repeat it when they chat, so it spreads
// through the town. Nobody is told who started it: that is for the guessing game.

const clamp = (x, lo, hi) => Math.min(hi, Math.max(lo, x));
const TRAIT_BELIEF = { coward: 0.15, wildcard: 0.15, brawler: -0.1, gunslinger: -0.1, peacemaker: -0.05 };

/** An Accuse or Praise order: plant a rumor with a few listeners. */
export function startRumor(world, seat, kind, group, strength, tired = 1) {
  const rumor = { id: world.rumors.length, seat, kind, group, S: strength, turn: world.turn, tired };
  world.rumors.push(rumor);
  world.events.push({ type: 'rumorStart', turn: world.turn, time: world.time, kind, group });

  // The first listeners: anyone who is not in the rumour's own faction and not the one who started it.
  const listeners = shuffle(world.rng, world.villagers.filter((v) => v.alive && v.faction !== seat && groupOf(v) !== group));
  for (const v of listeners.slice(0, RUMOR.seeds + strength)) hear(world, v, rumor);
  return rumor;
}

/** A villager hears a rumor and decides whether to believe it. */
export function hear(world, v, rumor) {
  if (v.heard.has(rumor.id)) return false;
  v.heard.add(rumor.id);
  if (groupOf(v) === rumor.group) return false; // people know whether the rumor about them is true
  const chance = clamp(RUMOR.baseBelief + v.trust[rumor.seat] + (TRAIT_BELIEF[v.trait] ?? 0), 0.05, 0.95) * rumor.tired;
  if (world.rng() >= chance) return false;
  v.believed.push(rumor);
  const delta = (rumor.kind === 'accuse' ? -1 : 1) * (RUMOR.opinionBase + RUMOR.opinionPerStrength * rumor.S);
  v.opinion[rumor.group] = clamp(v.opinion[rumor.group] + delta, -100, 100);
  return true;
}

/** Called when two villagers start talking: believers pass fresh rumors on. */
export function exchangeRumors(world, a, b) {
  for (const [from, to] of [[a, b], [b, a]]) {
    for (const r of from.believed) {
      if (world.turn - r.turn >= RUMOR.expireTurns) continue; // old news
      if (world.rng() < RUMOR.passChance) hear(world, to, r);
    }
  }
}
