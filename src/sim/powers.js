import { ARMORY, POWERS, TURN, WEAPONS, WORLD } from '../config/tunables.js';
import { GROUP_NAMES } from '../config/content.js';
import { goToPlace, startAttack, startIdle } from './brain.js';
import { blast, powerDamage } from './combat.js';
import { groupOf, isFirearm, effectiveWeapon } from './villager.js';
import { shoveFrom, shoveToward } from './shove.js';
import { powerUnlockError } from './availability.js';
import { groupHasMembers } from './targets.js';

// God powers: live miracles used while the town acts. Each costs Power points (three are added
// every active turn, and unspent points carry over). Like orders they are secret: the town sees what happens, not who did it.
//   lightning  a bolt that scatters a brawl and calms everyone nearby
//   miracle    heal one villager (and make their group like you a bit)
//   whisper    plant a thought in one villager's head about a faction
//   fog        a patch of fog where nobody can start a fight for a while
//   gust       blow one villager toward a place

export const POWER_DEFS = {
  // calm and protect
  miracle: { name: 'Miracle', icon: '✨', cost: POWERS.miracle.cost, needs: 'villager', hint: 'Aim near one injured ally to heal them.', blurb: 'Heal one nearby member of your own faction by 45 HP.' },
  aegis: { name: 'Aegis', icon: '🛡️', cost: POWERS.aegis.cost, needs: 'villager', hint: 'Shield one villager for 6s; reflect the next bullet, then shatter.', blurb: 'A visible mirror shield lasts up to 6 seconds. It reduces damage by 60% while intact and blocks the next gun or shotgun hit, reflecting it at the shooter before shattering. Misses do not consume it. Rockets do not reflect; reflected shots cannot bounce again.' },
  rain: { name: 'Downpour', icon: '🌧️', cost: POWERS.rain.cost, needs: 'point', hint: 'Click a spot: everyone there cools off.', blurb: 'A heavy rain on a wide area: fights break up and tempers drop.' },
  fog: { name: 'Fog', icon: '🌫️', cost: POWERS.fog.cost, needs: 'point', hint: 'Click a spot for fog.', blurb: 'A patch of fog: fights inside stop at once and nobody in it can pick a new one for a while (they still defend themselves).' },
  sleep: { name: 'Sleep', icon: '💤', cost: POWERS.sleep.cost, needs: 'villager', hint: 'Click a villager to put them to sleep.', blurb: 'One villager freezes in place for 8 seconds.' },
  // mind games
  whisper: { name: 'Whisper', icon: '👂', cost: POWERS.whisper.cost, needs: 'villager+group', hint: 'Choose a faction, then click a villager to whisper to.', blurb: 'Plant a thought in one villager: they now distrust (or like) a faction.' },
  charm: { name: 'Charm', icon: '💘', cost: POWERS.charm.cost, needs: 'villager', hint: 'Click a villager to charm.', blurb: 'A villager of any faction warms to you and will not hurt your people for a while.' },
  enrage: { name: 'Enrage', icon: '😡', cost: POWERS.enrage.cost, needs: 'villager', hint: 'Click a villager to enrage.', blurb: 'A villager flies into a rage and attacks the nearest outsider.' },
  // moving people
  gust: { name: 'Gust', icon: '💨', cost: POWERS.gust.cost, needs: 'villager+direction', hint: 'Hold near a villager, drag a direction, then release.', blurb: 'One drag blows a villager and nearby bystanders in your chosen direction.' },
  tornado: { name: 'Tornado', icon: '🌪️', cost: POWERS.tornado.cost, needs: 'point', hint: 'Click a spot: everyone nearby is dragged in and flung.', blurb: 'Drags everyone nearby toward the centre, then they scatter, scared.' },
  earthquake: { name: 'Earthquake', icon: '🌋', cost: POWERS.earthquake.cost, needs: 'none', hint: 'Cast at once: the whole town shakes.', blurb: 'Every fight stops, everyone is shoved in a random direction, the whole town panics.' },
  // violence
  lightning: { name: 'Lightning', icon: '⚡', cost: POWERS.lightning.cost, needs: 'point', hint: 'Click a spot to strike it.', blurb: 'A bolt that throws everyone nearby back and scatters a brawl. Hurts little.' },
  fireball: { name: 'Fireball', icon: '🔥', cost: POWERS.fireball.cost, needs: 'point', hint: 'Click a spot: a small, deadly blast.', blurb: 'Damages rivals and neutrals. Flings everyone nearby, including your own villagers, who take no damage.' },
  weapon: { name: 'Arm', icon: '🗡️', cost: POWERS.weapon.cost, needs: 'villager', hint: 'Aim near an unarmed ally. Arms exactly one.', blurb: 'Give one nearby own villager a weapon. The circle helps you aim; it does not arm the whole group.' },
  disarm: { name: 'Disarm', icon: '🪓', cost: POWERS.disarm.cost, needs: 'point', hint: 'Click a spot: weapons fly out of hands.', blurb: 'Everyone near the spot drops their weapon and is shoved away.' },
  timebomb: { name: 'Time Bomb', icon: '💣', cost: POWERS.timebomb.cost, needs: 'point', hint: 'Place a bomb. It explodes after 12 seconds.', blurb: 'A visible blast with a 12-second fuse. Plant before the last 12 seconds. Your faction takes no HP damage.' },
  blackout: { name: 'Blackout', icon: '🌘', cost: POWERS.blackout.cost, needs: 'none', hint: '12 seconds of night: break targets, heal allies, hurt enemies.', blurb: 'Stops attacks for 12 seconds. Rivals and neutrals take 5-10 damage; living allies heal up to 20 HP. Fighters reassess targets afterward, favoring a different valid foe. Existing hazards remain live.' },
  whirlpool: { name: 'Whirlpool', icon: '🌀', cost: POWERS.whirlpool.cost, needs: 'point', hint: 'Pulls and damages EVERYONE, including your allies.', blurb: 'A 3-second water vortex pulls everyone inward. Up to 39 damage at the centre, including your own faction. Blue numbers show actual damage.' },
  launcher: { name: 'Rocket Launcher', icon: '🚀', cost: POWERS.launcher.cost, needs: 'point', hint: 'Drop a launcher here. Anyone can pick it up.', blurb: 'First villager reaching the crate gets 5 rockets. Blasts deal 65% of Fireball damage with 15% more radius and spare the holder’s faction. Unclaimed crates expire at dusk.' },
  freeze: { name: 'Freeze', icon: '❄️', cost: POWERS.freeze.cost, needs: 'point', hint: 'Freeze enemies in the circle for 7 seconds. Allies are safe.', blurb: 'Stops rivals and neutrals moving or attacking for 7 seconds. Your faction is unaffected. Frozen targets are 20 percentage points easier to hit.' },
  strength: { name: 'Strength', icon: '💪', cost: POWERS.strength.cost, needs: 'villager', hint: 'Aim near one ally to strengthen them.', blurb: 'One own villager gains a random 10-50% attack bonus for the rest of this turn. Does not stack.' },
};

const dist = (a, x, y) => Math.hypot(a.x - x, a.y - y);

export function targetPowerError(seat, id, v, args = {}) {
  if (!v?.alive) return 'Pick a living villager';
  if (['weapon', 'miracle', 'strength'].includes(id) && v.faction !== seat) return 'Choose one of your own villagers.';
  if (id === 'weapon' && effectiveWeapon(v) !== 'none') return `${v.name} is already armed.`;
  if (id === 'miracle' && v.hp >= 100) return `${v.name} is already at full health.`;
  if (id === 'strength' && v.damageBonus > 0) return `${v.name} is already strengthened this turn.`;
  if (id === 'whisper' && args.group === groupOf(v)) return `${v.name} knows their own group too well to be fooled`;
  return null;
}

/** Nearby selection is an aiming aid, never an area cast. Ties use distance, then ID. */
export function nearestPowerTarget(game, seat, id, x, y, radius, args = {}) {
  return game.world.villagers.filter(v => !targetPowerError(seat, id, v, args) && Math.hypot(v.x - x, v.y - 18 - y) <= radius)
    .sort((a, b) => Math.hypot(a.x - x, a.y - 18 - y) - Math.hypot(b.x - x, b.y - 18 - y) || a.id - b.id)[0] ?? null;
}

/**
 * Cast a power. `args` depends on the power: {x, y} | {villagerId} | {villagerId, group, good?} | {villagerId, placeId}.
 * @returns {{ok: true, message: string} | {ok: false, error: string}}
 */
export function validatePower(game, seat, id, args = {}) {
  if (typeof id !== 'string' || !Object.hasOwn(POWER_DEFS, id)) return { ok: false, error: 'Unknown power' };
  if (!Number.isInteger(seat) || seat < 0 || seat >= game.seats.length) return { ok: false, error: 'Invalid seat' };
  if (args === null || typeof args !== 'object' || Array.isArray(args)) return { ok: false, error: 'Invalid power target' };
  const def = POWER_DEFS[id];
  if (game.phase !== 'sim') return { ok: false, error: 'Powers work while the town acts' };
  const locked = powerUnlockError(game, id);
  if (locked) return { ok: false, error: locked };
  if (game.eliminated[seat]) return { ok: false, error: 'Your faction has fallen' };
  if (game.usedPowers?.[seat]?.includes(id)) return { ok: false, error: `${def.name} has already been used this turn. Each miracle works once per turn.` };
  if ((game.power[seat] ?? 0) < def.cost) return { ok: false, error: `Not enough power (${def.name} costs ${def.cost})` };

  const { world } = game;
  const v = Number.isInteger(args.villagerId) ? world.villagers[args.villagerId] : null;
  if (def.needs.startsWith('villager')) {
    const error = targetPowerError(seat, id, v, args);
    if (error) return { ok: false, error };
  }
  if (def.needs === 'point' && !(Number.isFinite(args.x) && Number.isFinite(args.y))) return { ok: false, error: 'Pick a spot on the map' };
  if (def.needs === 'point' && (args.x < 0 || args.x > WORLD.width || args.y < 0 || args.y > WORLD.height)) return { ok: false, error: 'Pick a spot inside the town' };
  if (id === 'whisper' && (!Number.isInteger(args.group) || args.group < 0 || args.group > 4)) return { ok: false, error: 'Whisper about which faction?' };
  if (id === 'whisper' && !groupHasMembers(world, args.group)) return { ok: false, error: 'That group has no living villagers left. Choose another group.' };
  if (id === 'whisper' && args.group === groupOf(v)) return { ok: false, error: `${v.name} knows their own group too well to be fooled` };
  if (id === 'gust') {
    const direction = Object.hasOwn(args, 'dx') || Object.hasOwn(args, 'dy');
    if (direction && !(Number.isFinite(args.dx) && Number.isFinite(args.dy) && Math.abs(args.dx) <= WORLD.width && Math.abs(args.dy) <= WORLD.height && Math.hypot(args.dx, args.dy) >= 8)) return { ok: false, error: 'Drag a little farther to choose a valid direction.' };
    const point = Number.isFinite(args.tx) && Number.isFinite(args.ty) && args.tx >= 0 && args.tx <= WORLD.width && args.ty >= 0 && args.ty <= WORLD.height;
    const place = world.places.some(p => p.id === args.placeId);
    if (!direction && !point && !place) return { ok: false, error: 'Drag a direction, or name a destination place.' };
    if (!direction && point && Math.hypot(args.tx - v.x, args.ty - v.y) < 8) return { ok: false, error: 'Drag a little farther to choose a direction.' };
  }
  if (id === 'weapon' && v.faction !== seat) return { ok: false, error: 'You can only arm your own villagers.' };
  if (id === 'weapon' && effectiveWeapon(v) !== 'none') return { ok: false, error: `${v.name} is already armed.` };
  if (args.good !== undefined && typeof args.good !== 'boolean') return { ok: false, error: 'Choose a good or bad whisper' };
  return { ok: true };
}

export function normalizePowerArgs(id, args = {}) {
  const needs = POWER_DEFS[id].needs;
  if (needs === 'none') return {};
  if (needs === 'point') return { x: args.x, y: args.y };
  const clean = { villagerId: args.villagerId };
  if (needs === 'villager+group') return { ...clean, group: args.group, good: args.good ?? false };
  if (needs === 'villager+direction') {
    if (Number.isFinite(args.dx) && Number.isFinite(args.dy)) return { ...clean, dx: args.dx, dy: args.dy };
    if (Number.isFinite(args.tx) && Number.isFinite(args.ty)) return { ...clean, tx: args.tx, ty: args.ty };
    return { ...clean, placeId: args.placeId };
  }
  return clean;
}

export function castPower(game, seat, id, args = {}) {
  const check = validatePower(game, seat, id, args);
  if (!check.ok) return check;
  const def = POWER_DEFS[id];
  const { world } = game;
  const v = Number.isInteger(args.villagerId) ? world.villagers[args.villagerId] : null;

  let message = '';
  switch (id) {
    case 'lightning': {
      let n = 0;
      for (const o of world.villagers) {
        if (!o.alive || dist(o, args.x, args.y) > POWERS.lightning.radius) continue;
        n++;
        o.hp = Math.max(1, o.hp - POWERS.lightning.damage);
        o.lastDamage = POWERS.lightning.damage;
        o.lastCritical = false;
        o.hitFromX = args.x;
        o.hitFromY = args.y;
        o.calmUntil = world.time + POWERS.lightning.calmSeconds;
        shoveFrom(o, args.x, args.y, 520 * (1 - 0.6 * (dist(o, args.x, args.y) / POWERS.lightning.radius))); // the blast throws them back
        o.panic = Math.max(o.panic, 1.5);
        o.panicX = args.x;
        o.panicY = args.y;
        startIdle(world, o, 'lightning');
      }
      message = n ? `Lightning scattered ${n} villager${n > 1 ? 's' : ''}.` : 'Lightning struck an empty spot.';
      break;
    }
    case 'miracle': {
      v.hp = Math.min(100, v.hp + POWERS.miracle.heal);
      const g = groupOf(v);
      for (const o of world.villagers) if (o.alive && groupOf(o) === g) o.opinion[seat] = Math.min(100, o.opinion[seat] + POWERS.miracle.opinion);
      message = `${v.name} was healed.`;
      break;
    }
    case 'whisper': {
      const g = args.group;
      if (!Number.isInteger(g) || g < 0 || g > 4) return { ok: false, error: 'Whisper about which faction?' };
      if (g === groupOf(v)) return { ok: false, error: `${v.name} knows their own group too well to be fooled` };
      v.opinion[g] = Math.max(-100, Math.min(100, v.opinion[g] + (args.good ? 1 : -1) * POWERS.whisper.shift));
      message = `${v.name} now ${args.good ? 'likes' : 'distrusts'} the ${GROUP_NAMES[g]} a little more.`;
      break;
    }
    case 'aegis':
      v.aegisUntil = world.time + POWERS.aegis.seconds;
      v.aegisSeat = seat;
      message = `${v.name} has a 6-second mirror shield: the next bullet hit reflects, then it shatters.`;
      break;
    case 'sleep':
      v.state = 'mourn'; // frozen in place
      v.expression = 'calm';
      v.targetId = null;
      v.purpose = null;
      v.timer = POWERS.sleep.seconds;
      v.vx = 0;
      v.vy = 0;
      message = `${v.name} fell asleep.`;
      break;
    case 'weapon': {
      if (v.faction !== seat) return { ok: false, error: 'You can only arm your own villagers.' };
      if (effectiveWeapon(v) !== 'none') return { ok: false, error: `${v.name} is already armed.` };
      v.weapon = v.trait === 'gunslinger' ? ARMORY.gunslingerWeapon : ARMORY.weapons[Math.floor(world.rng() * ARMORY.weapons.length)];
      v.ammo = isFirearm(v.weapon) ? WEAPONS[v.weapon].maxAmmo : 0;
      v.armDone = true;
      v.escalation = Math.max(v.escalation, 1); // ready to use it when a fight gets serious
      world.events.push({ type: 'arm', turn: world.turn, time: world.time, villagerId: v.id });
      message = `${v.name} is now armed with a ${v.weapon}.`;
      break;
    }
    case 'timebomb': {
      const source = { kind: 'power', id, seat, actionId: `${world.turn}:${seat}:power:${id}` };
      world.bombs.push({ x: args.x, y: args.y, r: POWERS.timebomb.radius, at: world.time + POWERS.timebomb.seconds, seat, source });
      world.events.push({ type: 'bombPlanted', turn: world.turn, time: world.time, x: args.x, y: args.y, source });
      message = 'Time Bomb planted. It detonates in 12 seconds.';
      break;
    }
    case 'blackout': {
      const oldTargets = new Map(world.villagers.filter(o => o.alive && o.state === 'attack').map(o => [o.id, o.targetId]));
      world.blackoutUntil = Math.max(world.blackoutUntil, world.time + POWERS.blackout.seconds);
      for (const o of world.villagers) if (o.alive) {
        if (oldTargets.has(o.id)) {
          o.blackoutTargetId = oldTargets.get(o.id);
        }
        if (o.blackoutTargetId >= 0) o.blackoutRetargetUntil = world.blackoutUntil + POWERS.blackout.retargetSeconds;
        if (['attack', 'seek', 'talk'].includes(o.state)) startIdle(world, o, 'blackout');
        o.brewId = -1;
        o.thinkTimer = 0;
        if (o.faction === seat) o.hp = Math.min(100, o.hp + POWERS.blackout.heal);
        else powerDamage(world, o, POWERS.blackout.minDamage + Math.floor(world.rng() * (POWERS.blackout.maxDamage - POWERS.blackout.minDamage + 1)), { kind: 'power', id, seat, actionId: `${world.turn}:${seat}:power:${id}` });
      }
      message = 'Night falls for 12 seconds. Enemies lose 5-10 HP, allies heal up to 20 HP, and attack targets are broken.';
      break;
    }
    case 'whirlpool': {
      const start = world.time;
      const source = { kind: 'power', id, seat, x: args.x, y: args.y, actionId: `${world.turn}:${seat}:power:${id}` };
      world.whirlpools.push({ id: source.actionId, x: args.x, y: args.y, r: POWERS.whirlpool.radius, start, lastTick: start, until: start + POWERS.whirlpool.seconds, source });
      message = 'A whirlpool pulls everyone inward. Allies are not safe from its damage.';
      break;
    }
    case 'launcher':
      world.weaponDrops.push({ id: `${world.turn}:${seat}:launcher`, x: args.x, y: args.y });
      message = 'Launcher dropped. The first villager reaching it gets its five rockets.';
      break;
    case 'freeze': {
      let n = 0;
      for (const o of world.villagers) if (o.alive && o.faction !== seat && dist(o, args.x, args.y) <= POWERS.freeze.radius) {
        o.frozenSince = world.time;
        o.frozenUntil = Math.max(o.frozenUntil, world.time + POWERS.freeze.seconds);
        o.vx = o.vy = o.kx = o.ky = 0;
        if (o.state === 'attack') startIdle(world, o, 'freeze');
        n++;
      }
      message = `Froze ${n} rival or neutral villager${n === 1 ? '' : 's'} for 7 seconds. Your faction is unaffected.`;
      break;
    }
    case 'strength': {
      const percent = Math.round(POWERS.strength.minBonus * 100) + Math.floor(world.rng() * (Math.round((POWERS.strength.maxBonus - POWERS.strength.minBonus) * 100) + 1));
      v.damageBonus = percent / 100;
      message = `${v.name} gains ${percent}% attack damage until dusk.`;
      break;
    }
    case 'charm': {
      v.opinion[seat] = Math.min(100, v.opinion[seat] + POWERS.charm.opinion);
      if (v.faction === -1) v.trust[seat] = Math.min(1, v.trust[seat] + 0.4);
      for (const o of world.villagers) {
        if (o.alive && o.faction === seat) {
          v.truceUntil[o.id] = world.time + POWERS.charm.truceSeconds;
          o.truceUntil[v.id] = world.time + POWERS.charm.truceSeconds;
          if (v.state === 'attack' && v.targetId === o.id) startIdle(world, v, 'charmed');
        }
      }
      message = `${v.name} is charmed.`;
      break;
    }
    case 'enrage': {
      let best = null;
      let bestD = Infinity;
      for (const o of world.villagers) {
        if (!o.alive || o === v || groupOf(o) === groupOf(v)) continue;
        const d = dist(o, v.x, v.y);
        if (d < bestD) { bestD = d; best = o; }
      }
      v.aggression = 100;
      v.courage = Math.min(100, v.courage + 25);
      v.calmUntil = 0;
      if (best) startAttack(world, v, best, 'enraged by a god');
      message = best ? `${v.name} charged at ${best.name}.` : `${v.name} fumes.`;
      break;
    }
    case 'rain': {
      let n = 0;
      for (const o of world.villagers) {
        if (!o.alive || dist(o, args.x, args.y) > POWERS.rain.radius) continue;
        n++;
        o.aggression = Math.max(0, o.aggression - 20);
        o.calmUntil = Math.max(o.calmUntil, world.time + POWERS.rain.calmSeconds);
        if (o.state === 'attack') startIdle(world, o, 'rain');
      }
      world.fogs.push({ x: args.x, y: args.y, r: POWERS.rain.radius, until: world.time + POWERS.rain.calmSeconds, rain: true });
      message = `The rain cooled ${n} villager${n === 1 ? '' : 's'}.`;
      break;
    }
    case 'tornado': {
      let n = 0;
      for (const o of world.villagers) {
        if (!o.alive || dist(o, args.x, args.y) > POWERS.tornado.radius) continue;
        n++;
        shoveToward(o, args.x, args.y, POWERS.tornado.pull); // dragged in...
        o.panic = Math.max(o.panic, 2.5);
        o.panicX = args.x;
        o.panicY = args.y;
        if (o.state === 'attack') startIdle(world, o, 'tornado');
        world.tornadoes.push({ id: o.id, x: args.x, y: args.y, at: world.time + 0.55 }); // ...then flung back out
      }
      message = `A tornado caught ${n} villager${n === 1 ? '' : 's'}.`;
      break;
    }
    case 'earthquake': {
      for (const o of world.villagers) {
        if (!o.alive) continue;
        const a = world.rng() * Math.PI * 2;
        o.kx += Math.cos(a) * POWERS.earthquake.shove;
        o.ky += Math.sin(a) * POWERS.earthquake.shove;
        o.hp = Math.max(1, o.hp - POWERS.earthquake.damage);
        o.lastCritical = false;
        o.panic = Math.max(o.panic, 2);
        o.panicX = WORLD.width / 2;
        o.panicY = WORLD.height / 2;
        o.calmUntil = Math.max(o.calmUntil, world.time + 4);
        if (o.state === 'attack') startIdle(world, o, 'earthquake');
      }
      message = 'The whole town shook.';
      break;
    }
    case 'fireball': {
      const n = blast(world, seat, args.x, args.y, POWERS.fireball.radius, { minDamage: POWERS.fireball.minDamage, maxDamage: POWERS.fireball.maxDamage, minKnock: 300, maxKnock: 600, source: { kind: 'power', id, seat, actionId: `${world.turn}:${seat}:power:${id}` } });
      message = n ? `The fireball hit ${n} villager${n === 1 ? '' : 's'}.` : 'The fireball burned an empty patch.';
      break;
    }
    case 'disarm': {
      let n = 0;
      for (const o of world.villagers) {
        if (!o.alive || dist(o, args.x, args.y) > POWERS.disarm.radius) continue;
        if (o.weapon !== 'none') { o.weapon = 'none'; o.ammo = 0; n++; }
        shoveFrom(o, args.x, args.y, 300);
      }
      message = n ? `${n} weapon${n === 1 ? '' : 's'} flew out of hands.` : 'Nobody there was armed.';
      break;
    }
    case 'fog': {
      world.fogs.push({ x: args.x, y: args.y, r: POWERS.fog.radius, until: world.time + POWERS.fog.seconds });
      for (const o of world.villagers) {
        if (!o.alive || dist(o, args.x, args.y) > POWERS.fog.radius) continue;
        o.calmUntil = Math.max(o.calmUntil, world.time + 4);
        if (o.state === 'attack') startIdle(world, o, 'fog');
      }
      message = 'Fog rolled in.';
      break;
    }
    case 'gust': {
      const place = world.places.find((p) => p.id === args.placeId);
      const direction = Number.isFinite(args.dx) && Number.isFinite(args.dy);
      const destination = direction ? { x: Math.max(0, Math.min(WORLD.width, v.x + args.dx)), y: Math.max(0, Math.min(WORLD.height, v.y + args.dy)) } : Number.isFinite(args.tx) ? { x: args.tx, y: args.ty } : place;
      if (v.state === 'attack') startIdle(world, v, 'gust');
      goToPlace(world, v, { ...destination, radius: 0 }, 'follow');
      if (direction) shoveFrom(v, v.x - args.dx, v.y - args.dy, POWERS.gust.push);
      else shoveToward(v, destination.x, destination.y, POWERS.gust.push);
      for (const o of world.villagers) if (o.alive && o !== v && dist(o, v.x, v.y) < POWERS.gust.radius) shoveToward(o, destination.x, destination.y, 420);
      message = place ? `${v.name} was blown toward the ${place.name}.` : `${v.name} was swept in your chosen direction.`;
      break;
    }
  }

  game.power[seat] -= def.cost;
  game.usedPowers?.[seat]?.push(id);
  const at = v ? { x: v.x, y: v.y } : { x: args.x ?? WORLD.width / 2, y: args.y ?? WORLD.height / 2 };
  world.events.push({ type: 'power', turn: world.turn, time: world.time, power: id, x: at.x, y: at.y, seat, villagerId: v?.id ?? -1, group: args.group ?? -1 });
  const entry = game.truth.findLast?.((t) => t.turn === game.turn && t.seat === seat);
  if (entry) (entry.extras ??= []).push({ kind: 'power', id, group: args.group ?? -1, villagerId: v?.id ?? -1 });
  game.feedback[seat].push(`${def.name}: ${message}`);
  return { ok: true, message };
}

/** Where is the fight? The centre of the biggest cluster of attackers (a default spot for Lightning and Fog). */
export function hotspot(world) {
  let best = null;
  let bestN = 0;
  const fighters = world.villagers.filter((v) => v.alive && v.state === 'attack');
  for (const f of fighters) {
    const n = fighters.filter((o) => dist(o, f.x, f.y) < 110).length;
    if (n > bestN) { bestN = n; best = f; }
  }
  return best ? { x: best.x, y: best.y, n: bestN } : null;
}
