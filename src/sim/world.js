import { WORLD, POPULATION, WEAPON_START, MAX_GUNS_PER_FACTION, ARMORY, WEAPONS, TRAITS, GRIEVANCE, STATS, COMBAT } from '../config/tunables.js';
import { NAMES, PLACES, SHAPES, NEUTRAL, NEUTRAL_GROUP } from '../config/content.js';
import { mulberry32, pick, range, shuffle } from './rng.js';
import { createVillager, groupOf } from './villager.js';

/** Keep a point inside the current safe area. */
export const clampIn = (world, x, y) => [Math.min(world.bounds.x1, Math.max(world.bounds.x0, x)), Math.min(world.bounds.y1, Math.max(world.bounds.y0, y))];
export const clampX = (x) => Math.min(WORLD.width - WORLD.margin, Math.max(WORLD.margin, x));
export const clampY = (y) => Math.min(WORLD.height - WORLD.margin, Math.max(WORLD.margin, y));

/**
 * Build the town. No rendering code here: this runs in Node as well as the browser.
 * @param {number} seed
 */
export function createWorld(seed = 1, { cosmetics = true } = {}) {
  const rng = mulberry32(seed);
  const places = PLACES.map((p) => ({ ...p }));
  const names = shuffle(rng, NAMES);

  // 12 x faction 0, 12 x faction 1, ..., then 12 neutrals.
  const owners = [];
  for (let f = 0; f < POPULATION.factions; f++) {
    for (let i = 0; i < POPULATION.perFaction; i++) owners.push(f);
  }
  for (let i = 0; i < POPULATION.neutrals; i++) owners.push(NEUTRAL);

  // Everyone starts mixed together: scatter around random places, not grouped by faction.
  const villagers = shuffle(rng, owners).map((faction, id) => {
    const place = pick(rng, places);
    const angle = rng() * Math.PI * 2;
    const dist = Math.sqrt(rng()) * place.radius;
    return createVillager(rng, {
      id,
      name: names[id % names.length],
      shape: pick(rng, SHAPES),
      faction,
      x: clampX(place.x + Math.cos(angle) * dist),
      y: clampY(place.y + Math.sin(angle) * dist),
      count: owners.length,
    });
  });

  for (const v of villagers) {
    do { v.friendId = Math.floor(rng() * villagers.length); } while (v.friendId === v.id);
  }

  assignTraits(rng, villagers); // before weapons: gunslingers bring their own shotgun
  assignWeapons(rng, villagers);

  return {
    seed, rng, places, villagers,
    time: 0,
    turn: 1,
    armoryPool: new Array(5).fill(ARMORY.poolSize), // weapons on the shelf, kept per group so nobody wins the race by villager id
    rumors: [], // every rumor ever started: {id, seat, kind, group, S, turn}
    pairLog: new Map(), // how pairs of villagers got to blows (explanations only), see history.js
    peaceful: true, // set each turn by the phase manager: no fights while true
    tornadoes: [], // villagers caught in a tornado, about to be flung out: {id, x, y, at}
    bombs: [], // time bombs planted by cards: {x, y, r, at, seat}
    fogs: [], // patches of fog cast by gods: {x, y, r, until}
    festivals: [], // this turn's parties: {place, strength, seat}
    bounds: { x0: WORLD.margin, y0: WORLD.margin, x1: WORLD.width - WORLD.margin, y1: WORLD.height - WORLD.margin }, // the safe area (shrinks late in the match)
    seekRadius: COMBAT.seekRadius, // grows with war fever (see FEVER)
    sight: GRIEVANCE.sight,
    cosmetics, // thought bubbles / suspicious faces: only worth computing when someone is watching
    tension: 0, // 0..100, see tension.js
    baseTension: 0,
    drama: 0,
    events: [], // everything that happens, in order: kills, gunshots, arming...
  };
}

/**
 * Give every villager a temperament and a personal tolerance. Gunslingers (rare, shotgun) are
 * placed first, one per group, so no faction starts with more than one.
 */
function assignTraits(rng, villagers) {
  const base = GRIEVANCE.base;
  const set = (v, trait) => {
    v.trait = trait;
    const mod = trait ? TRAITS.mods[trait] : {};
    v.tolerance = base * range(rng, TRAITS.tolerance) * (mod.tolerance ?? 1);
    v.baseAggression = v.aggression = Math.min(100, Math.max(0, v.aggression + (mod.aggression ?? 0)));
    v.baseCourage = v.courage = Math.min(100, Math.max(STATS.minStat, v.courage + (mod.courage ?? 0)));
    v.mood = rng() * 2 - 1;
  };

  const groups = shuffle(rng, [0, 1, 2, 3, NEUTRAL_GROUP]).slice(0, TRAITS.gunslingers);
  for (const g of groups) {
    const members = villagers.filter((v) => groupOf(v) === g);
    const v = pick(rng, members);
    set(v, 'gunslinger');
  }

  const taken = {};
  for (const v of shuffle(rng, villagers)) {
    if (v.trait) continue;
    let roll = rng();
    let chosen = null;
    for (const [trait, chance] of Object.entries(TRAITS.chances)) {
      roll -= chance;
      if (roll < 0) {
        chosen = trait;
        break;
      }
    }
    if (chosen && (taken[chosen] ?? 0) >= (TRAITS.caps[chosen] ?? Infinity)) chosen = null;
    if (chosen) taken[chosen] = (taken[chosen] ?? 0) + 1;
    set(v, chosen);
  }
}

function assignWeapons(rng, villagers) {
  const gunsPerFaction = {};
  const order = shuffle(rng, villagers.filter((v) => v.weapon === 'none'));
  let i = 0;
  for (const [weapon, count] of Object.entries(WEAPON_START)) {
    let given = 0;
    while (given < count && i < order.length) {
      const v = order[i++];
      if (weapon === 'gun' && (gunsPerFaction[v.faction] ?? 0) >= MAX_GUNS_PER_FACTION) continue;
      v.weapon = weapon;
      if (weapon === 'gun') {
        v.ammo = WEAPONS.gun.maxAmmo;
        gunsPerFaction[v.faction] = (gunsPerFaction[v.faction] ?? 0) + 1;
      }
      given++;
    }
  }
}

export function nearestPlace(world, x, y) {
  let best = world.places[0];
  let bestD = Infinity;
  for (const p of world.places) {
    const d = Math.hypot(p.x - x, p.y - y) - p.radius * 0.5;
    if (d < bestD) {
      bestD = d;
      best = p;
    }
  }
  return best;
}
