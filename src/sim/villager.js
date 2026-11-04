import { VILLAGER, STATS, WEAPONS, FIREARMS, GRIEVANCE } from '../config/tunables.js';
import { NEUTRAL_GROUP, NUM_GROUPS } from '../config/content.js';
import { range } from './rng.js';

/**
 * @typedef {Object} Villager
 * @property {number} id
 * @property {string} name
 * @property {'circle'|'square'|'triangle'|'hex'} shape
 * @property {number} faction  0..3, or -1 for neutral
 * @property {boolean} alive
 * @property {number} hp
 * @property {number} courage / baseCourage    current value and the value it relaxes back to
 * @property {number} aggression / baseAggression
 * @property {number[]} opinion  -100..100 per group (0..3 factions, 4 neutrals)
 * @property {number[]} fear     0..100 per group
 * @property {number[]} grudge   seconds left of "fight this group" after being hit
 * @property {number[]} trust    0..1 per player seat: how much a NEUTRAL believes that player's orders
 * @property {'none'|'pan'|'bat'|'knife'|'gun'|'shotgun'} weapon
 * @property {number} ammo
 * @property {Object} fx  temporary effects of this turn's orders (cleared every turn)
 * @property {number} x @property {number} y @property {number} px @property {number} py  (px/py: previous tick, for rendering)
 * @property {'idle'|'wander'|'seek'|'talk'|'guard'|'attack'|'flee'|'mourn'|'dead'} state
 * @property {'calm'|'happy'|'love'|'angry'|'scared'|'suspicious'|'sad'|'dead'} expression
 */

export const groupOf = (v) => (v.faction === -1 ? NEUTRAL_GROUP : v.faction);

export const isFirearm = (weapon) => FIREARMS.includes(weapon);

/** A firearm with no bullets left is just a club. Returns the weapon name actually held. */
export const effectiveWeapon = (v) => (isFirearm(v.weapon) && v.ammo <= 0 ? 'none' : v.weapon);
export const weaponStats = (v) => WEAPONS[effectiveWeapon(v)];

/**
 * The weapon a villager is willing to use right now. Fights climb a ladder: fists first,
 * melee weapons once things get serious (escalation 1), firearms only at the extreme end (2).
 */
export function usableWeapon(v) {
  const w = effectiveWeapon(v);
  if (w === 'none') return w;
  return v.escalation >= (isFirearm(w) ? 2 : 1) ? w : 'none';
}

export const emptyFx = () => ({ protect: [], avoid: [], follow: null, arm: 0, love: [], festival: null, escort: null, hunt: null, assault: null, standdown: false, scare: [], ambush: null, shove: [], seize: null });

/** @returns {Villager} */
export function createVillager(rng, { id, name, shape, faction, x, y, count = 60 }) {
  const group = faction === -1 ? NEUTRAL_GROUP : faction;
  const courage = range(rng, STATS.courage);
  const aggression = range(rng, STATS.aggression);
  const opinion = [];
  for (let g = 0; g < NUM_GROUPS; g++) {
    opinion.push(g === group ? STATS.opinionOwn : range(rng, STATS.opinionOther));
  }
  return {
    id, name, shape, faction,
    alive: true,
    hp: STATS.hp,
    courage, baseCourage: courage,
    aggression, baseAggression: aggression,
    opinion,
    fear: new Array(NUM_GROUPS).fill(0),
    grudge: new Array(NUM_GROUPS).fill(0),
    trust: new Array(4).fill(STATS.trust),
    weapon: 'none',
    ammo: 0,
    kills: 0,

    // Personality (set up in world.js). trait is one of the TRAITS names, or null for "ordinary".
    trait: null,
    revealed: false, // has the town seen their temperament yet? (the hover card only shows it then)
    tolerance: GRIEVANCE.base, // grievance needed before they will fight
    mood: 0, // -1 (bad day) .. 1 (good day): changes how fast grievance builds
    grievance: new Array(count).fill(0), // per other villager: how fed up am I with them
    truceUntil: new Array(count).fill(0), // sim time until which I won't pick a fight with them
    escalation: 0, // 0 fists, 1 melee weapons allowed, 2 firearms allowed
    scuffle: false,
    followId: -1, // who a 'guard' (follow / bodyguard) state is tracking
    calmUntil: 0, // after breaking off a fight, no new fights until this sim time
    peaceCooldown: 0, // a peacemaker who just separated people waits before trying again
    heard: new Set(), // rumor ids already heard
    believed: [], // rumors this villager believes (and repeats)
    shoveAt: 0, // sim time of this villager's next shove
    carry: null, // someone is dragging me: {by: [ids], dest: placeId, until}
    carrying: false, // I am helping drag someone (I walk slower)
    brewId: -1, // who I am glaring at before I start a fight with them (-1: nobody)
    brewUntil: 0, // sim time at which the glare turns into a punch
    scuffleChecked: false, // has this fist fight already had its one chance to break off?
    activity: null, // what they are doing at a place: 'dance' | 'rest' | 'shop' | 'pray' | 'train' | 'fish' | 'garden' | 'eat'
    partnerId: -1, // the villager they are bonded with, or -1

    fx: emptyFx(),
    armDone: false,
    guardBonus: 0,

    x, y, px: x, py: y, vx: 0, vy: 0,
    blessUntil: 0, // sim time until which an Aegis halves incoming damage
    kx: 0, ky: 0, // knockback velocity from gusts, lightning and bombs (see shove.js)
    facing: rng() < 0.5 ? -1 : 1,
    speed: range(rng, VILLAGER.walkSpeed),
    state: 'idle',
    expression: 'calm',
    purpose: null, // why a 'wander' trip is happening: 'arm' | 'follow' | null
    targetId: null,
    targetX: x,
    targetY: y,
    fleeX: x,
    fleeY: y,
    fleeTotal: 1,
    fleeToX: x,
    fleeToY: y,
    panic: 0,
    panicX: x,
    panicY: y,
    cd: 0, // seconds until the next swing
    swing: 0, // render hint: just swung
    hitFlash: 0, // render hint: just got hit
    lastDamage: 0, // render hint: size of the last hit taken
    lastHitWeapon: 'none',
    hitFromX: x,
    hitFromY: y,
    thought: null, // 'heart' | 'angry' | 'sweat' | 'question' | 'skull' | 'shield' | 'flag' | null: strongest driver right now
    thoughtGroup: -1, // which group the thought is about (-1 = none)
    timer: rng() * 2,
    thinkTimer: rng() * 0.5, // stagger so 60 brains don't all think on the same tick
    friendId: -1,
  };
}
