import { BOND, BRAIN, COMBAT, GRIEVANCE, IDEAS, ORDERS, POWERS, TENSION, TRAITS, WEAPONS } from '../config/tunables.js';
import { maybeDropWeapon } from './drops.js';
import { coverBlocks, damageProps } from './props.js';
import { igniteNear, scatterGoods } from './hazards.js';
import { remember } from './memory.js';
import { supportMultiplier } from './formations.js';
import { breakBond } from './bonds.js';
import { chainFor, logPair } from './history.js';
import { groupOf, isFirearm, usableWeapon } from './villager.js';
import { nearestPlace } from './world.js';
import { shoveFrom } from './shove.js';

const clamp = (x, lo, hi) => Math.min(hi, Math.max(lo, x));
const protectedByShield = (world, v) => world.time < v.blessUntil || world.time < v.aegisUntil;

function retreatRocketTarget(world, a) {
  if (a.weapon !== 'rocket' || a.ammo <= 0 || a.fx.standdown || a.carry || a.carrying) return null;
  if (a.state !== 'flee' && !(a.fx.avoid.length && ['idle', 'wander', 'guard', 'seek'].includes(a.state))) return null;
  let best = null, bestScore = Infinity;
  for (const b of world.villagers) {
    if (!b.alive || groupOf(b) === groupOf(a) || b.id === a.partnerId) continue;
    const distance = Math.hypot(b.x - a.x, b.y - a.y);
    if (distance > WEAPONS.rocket.range) continue;
    const pursuing = b.state === 'attack' && b.targetId === a.id;
    const hostile = a.grudge[groupOf(b)] > 0 || a.grievance[b.id] >= a.tolerance * GRIEVANCE.fightAt || a.opinion[groupOf(b)] < -COMBAT.provocation;
    if (!pursuing && (!hostile || world.time < a.calmUntil || world.time < a.truceUntil[b.id] || world.time < b.truceUntil[a.id])) continue;
    const score = distance - (pursuing ? WEAPONS.rocket.range : 0);
    if (score < bestScore) { best = b; bestScore = score; }
  }
  return best;
}

/** Swings for everyone who is in 'attack' state and in reach. Runs once per tick. */
export function resolveCombat(world, dt) {
  for (const a of world.villagers) {
    if (!a.alive) continue;
    a.cd = Math.max(0, a.cd - dt);
    if (world.peaceful || world.time < world.blackoutUntil || world.time < a.frozenUntil) continue;
    if (a.state !== 'attack' && a.cd <= 0) {
      const target = retreatRocketTarget(world, a);
      if (target) {
        a.cd = WEAPONS.rocket.interval;
        const pursuing = target.state === 'attack' && target.targetId === a.id;
        if (world.rng() < (pursuing ? COMBAT.pursuedRocketChance : COMBAT.retreatRocketChance)) {
          a.swing = 1;
          a.facing = target.x >= a.x ? 1 : -1;
          strike(world, a, target, 'rocket');
        }
      }
    }
    if (a.state !== 'attack') continue;
    const target = world.villagers[a.targetId];
    if (!target || !target.alive) continue;

    const weapon = usableWeapon(a); // fists until the fight escalates
    const stats = WEAPONS[weapon];
    if (Math.hypot(target.x - a.x, target.y - a.y) > stats.range) continue;
    if (a.cd > 0) continue;

    a.cd = stats.interval ?? COMBAT.duelInterval;
    a.swing = 1;
    strike(world, a, target, weapon);
  }
}

/** A shove: nobody is cut, but the victim is thrown back and a lot angrier. */
export function shoveVictim(world, attacker, victim, speed = ORDERS.shoveSpeed) {
  shoveFrom(victim, attacker.x, attacker.y, speed);
  victim.hp = Math.max(1, victim.hp - 4);
  victim.hitFlash = 0.6;
  victim.lastDamage = 4;
  victim.lastHitWeapon = 'shove';
  victim.lastCritical = false;
  victim.hitFromX = attacker.x;
  victim.hitFromY = attacker.y;
  const g = groupOf(attacker);
  victim.opinion[g] = Math.max(-100, victim.opinion[g] - 4);
  victim.fear[g] = Math.min(100, victim.fear[g] + 2);
  victim.grievance[attacker.id] += victim.tolerance * ORDERS.shoveGrievance;
}

/** A shout: whoever is listening loses a little nerve. */
export function shoutAt(world, shouter) {
  const g = groupOf(shouter);
  world.events.push({ type: 'shout', turn: world.turn, time: world.time, x: shouter.x, y: shouter.y });
  for (const o of world.villagers) {
    if (!o.alive || o === shouter || groupOf(o) === g) continue;
    if (Math.hypot(o.x - shouter.x, o.y - shouter.y) > COMBAT.shoutRadius) continue;
    o.fear[g] = Math.min(100, o.fear[g] + 3);
    o.courage = Math.max(10, o.courage - 1.5);
  }
}

/** A scream of pain: people nearby flinch (some run), and everybody hears it. */
function scream(world, victim) {
  world.events.push({ type: 'scream', turn: world.turn, time: world.time, x: victim.x, y: victim.y });
  for (const o of world.villagers) {
    if (!o.alive || o === victim || o.state === 'attack') continue;
    if (Math.hypot(o.x - victim.x, o.y - victim.y) > COMBAT.shoutRadius * 0.8) continue;
    if (TRAITS.steady.includes(o.trait)) continue;
    o.panic = Math.max(o.panic, (o.trait === 'coward' ? 1.2 : 0.6));
    o.panicX = victim.x;
    o.panicY = victim.y;
  }
}

function strike(world, attacker, victim, weapon) {
  const { rng } = world;
  const stats = WEAPONS[weapon];
  if (weapon === 'rocket') {
    attacker.ammo--;
    const duration = Math.max(0.18, Math.hypot(victim.x - attacker.x, victim.y - attacker.y) / POWERS.launcher.rocketSpeed);
    const id = `${world.turn}:${attacker.id}:${world.time}:rocket`;
    world.rockets.push({ id, x: attacker.x, y: attacker.y - 18, tx: victim.x, ty: victim.y, start: world.time, at: world.time + duration,
      seat: attacker.faction, bonus: 1 + (attacker.damageBonus ?? 0), source: { kind: 'weapon', id: 'rocket', seat: attacker.faction, shooterId: attacker.id, actionId: id } });
    world.events.push({ type: 'rocketLaunch', turn: world.turn, time: world.time, x: attacker.x, y: attacker.y, shooterId: attacker.id });
    if (attacker.ammo <= 0) { attacker.weapon = 'none'; attacker.ammo = 0; }
    return;
  }

  // Fists are not all punching: people push, and yell, and then punch.
  if (weapon === 'none') {
    const roll = rng();
    if (roll < COMBAT.fistShout) { shoutAt(world, attacker); return; }
    if (roll < COMBAT.fistShout + COMBAT.fistShove) { shoveVictim(world, attacker, victim, COMBAT.fistShoveSpeed); return; }
  }

  if (weapon !== 'none') logPair(world, attacker, victim, 'weapon', weapon);

  const baseHitChance = Math.max(
    stats.minHit ?? 0,
    clamp(COMBAT.hitBase + (attacker.courage - victim.courage) / COMBAT.hitSpread, COMBAT.hitMin, COMBAT.hitMax),
  );
  const hitChance = Math.min(1, baseHitChance + (victim.frozenUntil > world.time ? COMBAT.frozenHitBonus : 0));
  let hit = rng() < hitChance;
  // Cover: a bench, stall, wall or boulder between a gunman and his target can stop the bullet.
  const cover = hit && (weapon === 'gun' || weapon === 'shotgun') ? coverBlocks(world, attacker, victim) : null;
  if (cover) hit = false;
  const critical = hit && isFirearm(weapon) && rng() < COMBAT.headshotChance;

  if (isFirearm(weapon)) {
    attacker.ammo--;
    // Blank Rounds: the shot costs a bullet, makes confetti, and hurts nobody (rockets are not affected).
    const blank = weapon !== 'rocket' && world.blanks?.[groupOf(attacker)]?.left > 0;
    if (blank) {
      const b = world.blanks[groupOf(attacker)];
      b.left--;
      attacker.blankUntil = world.time + IDEAS.blank.confusedSeconds;
      gunshot(world, attacker, weapon, victim, false, false, b.left);
      attacker.revealed = true;
      return;
    }
    gunshot(world, attacker, weapon, victim, hit, critical, -1, cover?.id ?? null);
    attacker.revealed = true;
  }
  if (!hit) return;

  dealDamage(world, attacker, victim, weapon, 1, critical);

  // A shotgun blast also catches whoever is standing next to the target.
  if (weapon === 'shotgun') {
    for (const o of world.villagers) {
      if (!o.alive || o === attacker || o === victim) continue;
      if (Math.hypot(o.x - victim.x, o.y - victim.y) <= stats.splashRadius) {
        dealDamage(world, attacker, o, weapon, stats.splashFraction);
      }
    }
  }
}

function dealDamage(world, attacker, victim, weapon, share, critical = false) {
  const { rng } = world;
  const stats = WEAPONS[weapon];
  const defence = victim.courage / COMBAT.courageDefenceDiv;
  const raw = stats.damage + attacker.aggression / COMBAT.aggressionDamageDiv + rng() * COMBAT.damageRoll - defence;
  let damage = Math.max(1, raw * (1 - victim.guardBonus) * share); // guardBonus is a 0..1 damage reduction

  // Teamwork: a bonded villager takes less damage with their partner close, and an attacker
  // hits harder when their partner is fighting the same target.
  const vp = victim.partnerId >= 0 ? world.villagers[victim.partnerId] : null;
  if (vp?.alive && Math.hypot(vp.x - victim.x, vp.y - victim.y) <= BOND.teamRadius) damage *= BOND.guardDamage;
  const ap = attacker.partnerId >= 0 ? world.villagers[attacker.partnerId] : null;
  if (ap?.alive && ap.state === 'attack' && ap.targetId === victim.id && Math.hypot(ap.x - attacker.x, ap.y - attacker.y) <= BOND.teamRadius) {
    damage *= BOND.teamDamage;
  }
  damage *= (1 + (attacker.damageBonus ?? 0)) * (critical ? COMBAT.headshotMultiplier : 1);
  if (isFirearm(weapon) && world.time < victim.aegisUntil) {
    const source = { kind: 'power', id: 'aegis', seat: victim.aegisSeat, actionId: `${world.turn}:${victim.aegisSeat}:power:aegis`, defenderId: victim.id, originalShooterId: attacker.id, x: victim.x, y: victim.y };
    victim.aegisUntil = 0;
    victim.aegisSeat = -1;
    world.events.push({ type: 'shieldReflect', turn: world.turn, time: world.time, weapon, critical, defenderId: victim.id, shooterId: attacker.id, x: victim.x, y: victim.y, tx: attacker.x, ty: attacker.y, source });
    // Return the incoming hit (including its critical/Strength bonus), without another
    // accuracy roll, ammo cost or recursive reflection. A shooter's own shields still reduce it.
    powerDamage(world, attacker, damage, source, weapon, critical);
    return;
  }
  if (protectedByShield(world, victim)) damage *= 0.4;
  damage *= supportMultiplier(world, victim); // a supportive formation takes less
  victim.hp -= damage;
  victim.hitFlash = 1;
  victim.lastDamage = damage;
  victim.lastCritical = critical;
  victim.lastHitWeapon = weapon;
  remember(world, victim, attacker.id, 'injured');
  victim.hitFromX = attacker.x; // which way the blood sprays (render only)
  victim.hitFromY = attacker.y;

  const g = groupOf(attacker);
  victim.opinion[g] = Math.max(-100, victim.opinion[g] - COMBAT.hitOpinionDrop);
  victim.fear[g] = Math.min(100, victim.fear[g] + COMBAT.hitFear);
  victim.grudge[g] = COMBAT.grudgeSeconds;
  // Getting hit makes you properly fed up with whoever did it.
  const gv = victim.grievance[attacker.id];
  victim.grievance[attacker.id] = Math.max(gv + victim.tolerance * GRIEVANCE.hitGain, victim.tolerance * GRIEVANCE.hitFloor);

  if (victim.hp <= 0) kill(world, attacker, victim, weapon);
  else if (damage >= COMBAT.screamDamage && rng() < 0.6) scream(world, victim);
}

function gunshot(world, shooter, weapon, target, hit, critical = false, blanksLeft = -1, coverId = null) {
  const radius = WEAPONS[weapon].panicRadius;
  const blank = blanksLeft >= 0;
  for (const o of blank ? [] : world.villagers) {
    if (!o.alive || o === shooter) continue;
    if (Math.hypot(o.x - shooter.x, o.y - shooter.y) > radius) continue;
    if (TRAITS.steady.includes(o.trait)) continue; // gunslingers and bodyguards keep their cool
    const scare = o.trait === 'coward' ? TRAITS.coward.panicMul : 1;
    o.panic = COMBAT.panicSeconds * scare;
    o.panicX = shooter.x;
    o.panicY = shooter.y;
  }
  if (!blank) world.drama += TENSION.gunshotDrama;
  world.events.push({
    type: 'gunshot', turn: world.turn, time: world.time, weapon,
    shooterId: shooter.id, shooterFaction: shooter.faction, x: shooter.x, y: shooter.y, place: nearestPlace(world, shooter.x, shooter.y).id,
    targetId: target.id, tx: target.x, ty: target.y, hit, critical,
    ...(blank ? { blank: true, blanksLeft } : {}),
    ...(coverId ? { coverId } : {}),
    blocked: hit && world.time < target.aegisUntil, // no blood on the reflected impact
    facing: shooter.facing,
  });
}

/**
 * An explosion flings everyone inside its radius and damages other factions and neutrals.
 * Its recorded source owns the damage. A nearby allied villager is only a credit proxy.
 */
export function blast(world, seat, x, y, r, { minDamage = 14, maxDamage = 60, minKnock = 380, maxKnock = 800, source = { kind: 'card', id: 'bomb', seat, actionId: `${world.turn}:${seat}:card:bomb` } } = {}) {
  const owners = seat >= 0 ? world.villagers.filter((v) => v.alive && v.faction === seat) : [];
  const planter = world.villagers[source.shooterId] ?? owners.sort((p, q) => Math.hypot(p.x - x, p.y - y) - Math.hypot(q.x - x, q.y - y))[0];
  world.events.push({ type: 'explosion', turn: world.turn, time: world.time, x, y, r, source: { ...source } });
  damageProps(world, x, y, r, source); // cover can be blown apart
  if (['rocket', 'fireball', 'bomb', 'timebomb'].includes(source.id)) igniteNear(world, x, y, r, seat, source.id); // and dry grass can catch
  const market = world.places.find((p) => p.id === 'market');
  if (market && Math.hypot(market.x - x, market.y - y) < r + market.radius * 0.6) scatterGoods(world, x, y, IDEAS.hazard.goodsPerBlast);
  let hit = 0;
  for (const v of world.villagers) {
    if (!v.alive) continue;
    const d = Math.hypot(v.x - x, v.y - y);
    if (d > r) continue;
    hit++;
    const k = 1 - d / r;
    shoveFrom(v, x, y, minKnock + (maxKnock - minKnock) * k);
    v.panic = COMBAT.panicSeconds;
    v.panicX = x;
    v.panicY = y;
    let damage = seat >= 0 && v.faction === seat ? 0 : minDamage + (maxDamage - minDamage) * k; // your own people are flung about but not hurt
    if (protectedByShield(world, v)) damage *= 0.4;
    v.hp -= damage;
    v.hitFlash = 1;
    v.lastDamage = damage;
    v.lastCritical = false;
    v.lastHitWeapon = 'none';
    v.hitFromX = x;
    v.hitFromY = y;
    if (v.hp <= 0) {
      kill(world, planter ?? null, v, source.id === 'rocket' ? 'rocket' : source.id === 'fireball' ? 'fireball' : 'bomb', source);
    }
  }
  world.drama += TENSION.gunshotDrama * 2;
  return hit;
}

/** Continuous power damage keeps exact attribution even if its caster has been eliminated. */
export function powerDamage(world, victim, amount, source, weapon = source.id, critical = false) {
  if (!victim.alive || amount <= 0) return;
  const damage = amount * (protectedByShield(world, victim) ? 0.4 : 1);
  victim.hp -= damage;
  if (weapon === 'whirlpool') victim.whirlpoolDamage += damage;
  victim.lastDamage = damage;
  victim.lastCritical = critical;
  victim.lastHitWeapon = weapon;
  victim.hitFlash = 1;
  victim.hitFromX = source.x ?? victim.x;
  victim.hitFromY = source.y ?? victim.y;
  if (victim.hp <= 0) {
    const proxy = world.villagers.find(v => v.alive && v.faction === source.seat) ?? null;
    kill(world, proxy, victim, weapon, source);
  }
}

/** Time bombs (a card): tick down, then go off. */
export function updateBombs(world) {
  for (let i = world.bombs.length - 1; i >= 0; i--) {
    const b = world.bombs[i];
    if (world.time < b.at) continue;
    world.bombs.splice(i, 1);
    blast(world, b.seat, b.x, b.y, b.r, { minDamage: 30, maxDamage: 130, source: b.source }); // a bomb can finish a healthy villager at the centre; a fireball cannot
  }
}

function kill(world, killer, victim, weapon, source = null) {
  victim.alive = false;
  victim.hp = 0;
  victim.state = 'dead';
  victim.expression = 'dead';
  victim.vx = 0;
  victim.vy = 0;
  victim.diedAt = world.time;
  if (killer) killer.kills++;

  const killerFaction = source?.seat ?? killer.faction;
  const gk = source ? source.seat < 0 ? 4 : source.seat : groupOf(killer);
  const gv = groupOf(victim);

  // Witnesses: this is the escalation loop. Anyone who liked the victim turns on the killer's group.
  let witnesses = 0;
  for (const w of world.villagers) {
    if (!w.alive || w === killer) continue;
    if (Math.hypot(w.x - victim.x, w.y - victim.y) > COMBAT.witnessRadius) continue;
    witnesses++;

    if (w.opinion[gv] > COMBAT.witnessLikeThreshold) {
      w.opinion[gk] = Math.max(-100, w.opinion[gk] - COMBAT.witnessOpinionHit);
      w.fear[gk] = Math.min(100, w.fear[gk] + COMBAT.witnessFear);
      if (killer) w.grievance[killer.id] += w.tolerance * GRIEVANCE.witnessGain;
      // Shock: frozen in grief for a few seconds (unless already in the thick of it).
      if (w.state !== 'attack' && w.state !== 'flee') {
        w.state = 'mourn';
        w.expression = 'sad';
        w.targetId = victim.id;
        w.timer = BRAIN.mournSeconds;
        w.purpose = null;
      }
    } else if (w.opinion[gk] > 20) {
      w.aggression = Math.min(100, w.aggression + COMBAT.witnessAggression);
    }
    if (w.faction === -1 && killerFaction >= 0) {
      w.trust[killerFaction] = Math.max(0, w.trust[killerFaction] - COMBAT.witnessTrustHit);
    }
  }

  // A partner takes it worst of all: long grief, then a burning grudge against the killer.
  if (victim.partnerId >= 0) {
    const mourner = breakBond(world, victim);
    if (mourner?.alive) {
      mourner.state = 'mourn';
      mourner.expression = 'sad';
      mourner.targetId = victim.id;
      mourner.timer = BOND.griefSeconds;
      mourner.purpose = null;
      if (killer) mourner.grievance[killer.id] += mourner.tolerance * BOND.griefGrievance;
      mourner.aggression = Math.min(100, mourner.aggression + BOND.griefAggression);
      mourner.opinion[gk] = Math.max(-100, mourner.opinion[gk] - BOND.griefOpinion);
      world.events.push({ type: 'bondBroken', turn: world.turn, time: world.time, mournerId: mourner.id, lostId: victim.id, killerId: killer?.id ?? -1, killerFaction, source });
    }
  }

  world.drama += TENSION.killDrama;
  world.events.push({
    type: 'kill', turn: world.turn, time: world.time, weapon, witnesses,
    critical: victim.lastCritical,
    killerId: killer?.id ?? -1, victimId: victim.id,
    killerFaction, victimFaction: victim.faction,
    x: victim.x, y: victim.y,
    place: nearestPlace(world, victim.x, victim.y).id,
    chain: source ? null : chainFor(world, killer, victim),
    beliefs: killer?.believed.map(r => ({ ...r })) ?? [],
    ...(source ? { source: { ...source } } : {}),
  });
  maybeDropWeapon(world, victim);
}
