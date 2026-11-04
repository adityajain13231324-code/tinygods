import { BOND, BRAIN, COMBAT, GRIEVANCE, ORDERS, TENSION, TRAITS, WEAPONS } from '../config/tunables.js';
import { breakBond } from './bonds.js';
import { chainFor, logPair } from './history.js';
import { groupOf, isFirearm, usableWeapon } from './villager.js';
import { nearestPlace } from './world.js';
import { shoveFrom } from './shove.js';

const clamp = (x, lo, hi) => Math.min(hi, Math.max(lo, x));

/** Swings for everyone who is in 'attack' state and in reach. Runs once per tick. */
export function resolveCombat(world, dt) {
  for (const a of world.villagers) {
    if (!a.alive) continue;
    a.cd = Math.max(0, a.cd - dt);
    if (a.state !== 'attack') continue;
    const target = world.villagers[a.targetId];
    if (!target || !target.alive) continue;

    const weapon = usableWeapon(a); // fists until the fight escalates
    const stats = WEAPONS[weapon];
    if (Math.hypot(target.x - a.x, target.y - a.y) > stats.range) continue;
    if (a.cd > 0) continue;

    a.cd = COMBAT.duelInterval;
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

  // Fists are not all punching: people push, and yell, and then punch.
  if (weapon === 'none') {
    const roll = rng();
    if (roll < COMBAT.fistShout) { shoutAt(world, attacker); return; }
    if (roll < COMBAT.fistShout + COMBAT.fistShove) { shoveVictim(world, attacker, victim, COMBAT.fistShoveSpeed); return; }
  }

  if (weapon !== 'none') logPair(world, attacker, victim, 'weapon', weapon);

  const hitChance = Math.max(
    stats.minHit ?? 0,
    clamp(COMBAT.hitBase + (attacker.courage - victim.courage) / COMBAT.hitSpread, COMBAT.hitMin, COMBAT.hitMax),
  );
  const hit = rng() < hitChance;

  if (isFirearm(weapon)) {
    attacker.ammo--;
    gunshot(world, attacker, weapon, victim, hit);
    attacker.revealed = true;
  }
  if (!hit) return;

  dealDamage(world, attacker, victim, weapon, 1);

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

function dealDamage(world, attacker, victim, weapon, share) {
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
  if (world.time < victim.blessUntil) damage *= 0.4; // under an Aegis
  victim.hp -= damage;
  victim.hitFlash = 1;
  victim.lastDamage = damage;
  victim.lastHitWeapon = weapon;
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

function gunshot(world, shooter, weapon, target, hit) {
  const radius = WEAPONS[weapon].panicRadius;
  for (const o of world.villagers) {
    if (!o.alive || o === shooter) continue;
    if (Math.hypot(o.x - shooter.x, o.y - shooter.y) > radius) continue;
    if (TRAITS.steady.includes(o.trait)) continue; // gunslingers and bodyguards keep their cool
    const scare = o.trait === 'coward' ? TRAITS.coward.panicMul : 1;
    o.panic = COMBAT.panicSeconds * scare;
    o.panicX = shooter.x;
    o.panicY = shooter.y;
  }
  world.drama += TENSION.gunshotDrama;
  world.events.push({
    type: 'gunshot', turn: world.turn, time: world.time, weapon,
    shooterId: shooter.id, x: shooter.x, y: shooter.y, place: nearestPlace(world, shooter.x, shooter.y).id,
    targetId: target.id, tx: target.x, ty: target.y, hit, // so the renderer can draw the shot
    facing: shooter.facing,
  });
}

/**
 * An explosion at (x, y): hurts and flings everyone inside radius r, friend or foe, with damage and
 * knockback fading toward the edge. The blast is credited to the planter's faction: the nearest
 * living villager of that seat "did it". Used by time bombs and fireballs.
 */
export function blast(world, seat, x, y, r, { minDamage = 14, maxDamage = 60, minKnock = 380, maxKnock = 800 } = {}) {
  const owners = world.villagers.filter((v) => v.alive && v.faction === seat);
  const planter = owners.sort((p, q) => Math.hypot(p.x - x, p.y - y) - Math.hypot(q.x - x, q.y - y))[0];
  world.events.push({ type: 'explosion', turn: world.turn, time: world.time, x, y, r });
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
    let damage = v.faction === seat ? 0 : minDamage + (maxDamage - minDamage) * k; // your own people are flung about but not hurt
    if (world.time < v.blessUntil) damage *= 0.4; // under an Aegis (or a Rally's short shield)
    v.hp -= damage;
    v.hitFlash = 1;
    v.lastDamage = damage;
    v.lastHitWeapon = 'none';
    v.hitFromX = x;
    v.hitFromY = y;
    if (v.hp <= 0) {
      const credit = planter && planter !== v ? planter : world.villagers.find((o) => o.alive && o !== v);
      if (credit) kill(world, credit, v, 'bomb');
      else v.hp = 1;
    }
  }
  world.drama += TENSION.gunshotDrama * 2;
  return hit;
}

/** Time bombs (a card): tick down, then go off. */
export function updateBombs(world) {
  for (let i = world.bombs.length - 1; i >= 0; i--) {
    const b = world.bombs[i];
    if (world.time < b.at) continue;
    world.bombs.splice(i, 1);
    blast(world, b.seat, b.x, b.y, b.r, { minDamage: 30, maxDamage: 130 }); // a bomb can finish a healthy villager at the centre; a fireball cannot
  }
}

function kill(world, killer, victim, weapon) {
  victim.alive = false;
  victim.hp = 0;
  victim.state = 'dead';
  victim.expression = 'dead';
  victim.vx = 0;
  victim.vy = 0;
  victim.diedAt = world.time;
  killer.kills++;

  const gk = groupOf(killer);
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
      w.grievance[killer.id] += w.tolerance * GRIEVANCE.witnessGain;
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
    if (w.faction === -1 && killer.faction >= 0) {
      w.trust[killer.faction] = Math.max(0, w.trust[killer.faction] - COMBAT.witnessTrustHit);
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
      mourner.grievance[killer.id] += mourner.tolerance * BOND.griefGrievance;
      mourner.aggression = Math.min(100, mourner.aggression + BOND.griefAggression);
      mourner.opinion[gk] = Math.max(-100, mourner.opinion[gk] - BOND.griefOpinion);
      world.events.push({ type: 'bondBroken', turn: world.turn, time: world.time, mournerId: mourner.id, lostId: victim.id, killerId: killer.id });
    }
  }

  world.drama += TENSION.killDrama;
  world.events.push({
    type: 'kill', turn: world.turn, time: world.time, weapon, witnesses,
    killerId: killer.id, victimId: victim.id,
    killerFaction: killer.faction, victimFaction: victim.faction,
    x: victim.x, y: victim.y,
    place: nearestPlace(world, victim.x, victim.y).id,
    chain: chainFor(world, killer, victim), // how it got to this (for the on-screen explanation)
  });
}
