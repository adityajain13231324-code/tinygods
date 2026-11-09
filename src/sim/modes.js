import { ARMORY, IDEAS, MAX_GUNS_PER_FACTION, WEAPONS } from '../config/tunables.js';
import { POWER_DEFS } from './powers.js';
import { shuffle } from './rng.js';

// Optional chaos challenges. One mode per match, chosen at setup, reproducible from the seed.
// They never change the standard rules: each only changes the start of the match or adds one thing per turn.
export const MODES = {
  standard: { id: 'standard', name: 'Standard', blurb: 'The normal game.' },
  armed: { id: 'armed', name: 'Everyone Starts Armed', blurb: 'Every villager begins the match with a weapon. Fists are for the unlucky few.' },
  one: { id: 'one', name: 'One Villager per Faction', blurb: 'Each faction is a single villager. Recruit neutrals fast, because one death ends you.' },
  explosive: { id: 'explosive', name: 'Explosive Deliveries', blurb: 'From day 3, crates arrive each day with a lit fuse. Run, or push them with Gust.' },
  random: { id: 'random', name: 'Random Powers Every Turn', blurb: `Each day you may only use ${IDEAS.modes.randomCount} randomly chosen miracles.` },
};
export const MODE_IDS = Object.keys(MODES);
export const modeOf = (id) => MODES[id] ?? MODES.standard;
/** Challenge matches are for fun: they do not count toward your record or achievements. */
export const countsForRecords = (mode) => !mode || mode === 'standard';

/** Everyone Starts Armed. Uses the world's seeded generator, in villager order. */
export function armEveryone(world) {
  const guns = {};
  for (const v of world.villagers) {
    if (v.weapon !== 'none') continue;
    let weapon = v.trait === 'gunslinger' ? ARMORY.gunslingerWeapon : ARMORY.weapons[Math.floor(world.rng() * ARMORY.weapons.length)];
    if (weapon === 'gun') {
      if ((guns[v.faction] ?? 0) >= MAX_GUNS_PER_FACTION) weapon = 'bat';
      else guns[v.faction] = (guns[v.faction] ?? 0) + 1;
    }
    v.weapon = weapon;
    v.ammo = WEAPONS[weapon].maxAmmo ?? 0;
    v.armDone = true;
  }
}

/** Random Powers Every Turn: each seat's pool for this dawn, from the game's own card stream. */
export function rollRandomPowers(game) {
  const ids = Object.keys(POWER_DEFS).filter((id) => id !== 'leader');
  return Array.from({ length: game.seats.length }, () => shuffle(game.cardRng, ids.slice()).slice(0, IDEAS.modes.randomCount));
}

/** Explosive Deliveries: crates with a lit fuse land near places (the bombs list draws and explodes them). */
export function spawnDeliveries(game) {
  const { world } = game;
  const spots = shuffle(game.eventRng, world.places.slice()).slice(0, IDEAS.modes.deliveries);
  spots.forEach((p, i) => {
    const a = game.eventRng() * Math.PI * 2;
    const d = game.eventRng() * p.radius * 0.6;
    const fuse = IDEAS.modes.fuse[0] + game.eventRng() * (IDEAS.modes.fuse[1] - IDEAS.modes.fuse[0]);
    world.bombs.push({
      x: p.x + Math.cos(a) * d, y: p.y + Math.sin(a) * d, r: IDEAS.modes.radius, at: world.time + fuse, seat: -1, delivery: true, place: p.id,
      source: { kind: 'mode', id: 'bomb', seat: -1, actionId: `${world.turn}:mode:delivery:${i}` },
    });
    world.events.push({ type: 'deliveryArrived', turn: world.turn, time: world.time, place: p.id, x: p.x, y: p.y, fuse });
  });
}
