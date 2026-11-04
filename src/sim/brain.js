import { WALL, WORLD, BRAIN, VILLAGER, SIM, COMBAT, ORDERS, WEAPONS, ARMORY, GRIEVANCE, TENSION, TRAITS, ACTIVITY, BOND, FESTIVAL } from '../config/tunables.js';
import { breakBond, createBond, isFree } from './bonds.js';
import { logPair } from './history.js';
import { exchangeRumors } from './rumors.js';
import { range } from './rng.js';
import { clampIn } from './world.js';
import { groupOf, effectiveWeapon, usableWeapon, isFirearm } from './villager.js';
import { resolveCombat, shoutAt, shoveVictim, updateBombs } from './combat.js';
import { shoveFrom } from './shove.js';
import { stepKnockback } from './shove.js';
import { updateTension } from './tension.js';

// Each villager "thinks" twice a second and picks what to do, in priority order:
//   0. grievance: stew over the people standing nearby that they dislike (see GRIEVANCE)
//   1. danger (gunshot panic, being attacked: fight or flee)
//   2. temperament duties (medics heal, peacemakers break up fights, bodyguards defend a friend)
//   3. conflict ladder: argue -> fist scuffle -> weapons -> firearms, with chances to calm down
//   4. defending a protected villager
//   5. obeying this turn's orders (arm, follow, guard)
//   6. ordinary peaceful life (wander, chat, idle)
// act() then turns the chosen state into movement every tick.

/** Debug counter for tools/ai-health.js (does nothing unless world.dbg is set). */
const note = (world, key) => { if (world.dbg) world.dbg[key] = (world.dbg[key] ?? 0) + 1; };

/** Advance the whole town by one fixed tick (dt seconds). */
export function stepWorld(world, dt = 1 / SIM.tickHz) {
  world.time += dt;
  const { villagers } = world;

  // Remember where everyone was so the renderer can slide between ticks.
  for (const v of villagers) {
    v.px = v.x;
    v.py = v.y;
  }

  for (const v of villagers) {
    if (!v.alive) continue;
    for (let g = 0; g < v.grudge.length; g++) if (v.grudge[g] > 0) v.grudge[g] -= dt;
    if (v.panic > 0) v.panic -= dt;
    v.swing = Math.max(0, v.swing - dt / 0.3);
    v.hitFlash = Math.max(0, v.hitFlash - dt / 0.2);

    v.thinkTimer -= dt;
    if (v.thinkTimer <= 0) {
      v.thinkTimer += BRAIN.thinkInterval;
      think(world, v);
    }
    act(world, v, dt);
    stepKnockback(world, v, dt);
  }

  updateCarried(world);
  resolveCombat(world, dt);
  updateBombs(world);
  updateTornadoes(world);
  updateTension(world, dt);
}

// ---- Thinking ----------------------------------------------------------------

function think(world, v) {
  decide(world, v);
  if (world.cosmetics) updateThought(world, v); // visual only; skipped in headless balance runs
}

function decide(world, v) {
  updateGrievance(world, v);
  if (reactToDanger(world, v)) return;

  // Grief first: someone they liked just died, so they stand frozen for a moment.
  if (v.state === 'mourn') {
    if (v.timer <= 0) startIdle(world, v);
    return;
  }

  if (v.state === 'flee') {
    if (v.timer <= 0) startIdle(world, v);
    return;
  }

  doActivity(world, v);
  festivalBonds(world, v);
  if (traitDuties(world, v)) return;
  if (partnerDuties(world, v)) return;
  if (scuffleCheck(world, v)) return;
  if (maybeArgue(world, v)) return;
  if (pickFight(world, v)) return;

  if (v.state === 'attack') {
    const t = world.villagers[v.targetId];
    if (!t.alive || dist(v, t.x, t.y) > Math.max(COMBAT.giveUpRadius, world.seekRadius * 1.5)) startIdle(world, v, t.alive ? 'target too far' : 'target dead');
    return;
  }

  if (interceptForProtected(world, v)) return;
  if (obeyOrders(world, v)) return;
  if (stayWithPartner(world, v)) return;
  peaceful(world, v);
}

// ---- Things to do, and bonds ---------------------------------------------------

/** Effects of the pastime a villager is in the middle of (see ACTIVITY). */
function doActivity(world, v) {
  const a = v.activity;
  if (!a || v.state !== 'idle') return;
  if (ACTIVITY.heal[a]) v.hp = Math.min(100, v.hp + ACTIVITY.heal[a]);
  if (ACTIVITY.fearRelief[a]) for (let g = 0; g < v.fear.length; g++) v.fear[g] = Math.max(0, v.fear[g] - ACTIVITY.fearRelief[a]);
  if (ACTIVITY.courageGain[a]) v.courage = Math.min(v.baseCourage + ACTIVITY.courageCap, v.courage + ACTIVITY.courageGain[a]);
}

function placeAt(world, v) {
  for (const p of world.places) if (dist(v, p.x, p.y) < p.radius) return p;
  return null;
}

/** Start the place's pastime (or a specific one). Call right after startIdle. */
function startActivity(world, v, activity) {
  v.activity = activity;
  v.timer = range(world.rng, ACTIVITY.seconds);
  v.expression = activity === 'dance' || activity === 'eat' ? 'happy' : 'calm';
}

/** At a festival, strangers who get on can become partners. */
function festivalBonds(world, v) {
  if (world.festivals.length === 0 || !isFree(v)) return;
  for (const f of world.festivals) {
    const p = world.places.find((pl) => pl.id === f.place);
    if (dist(v, p.x, p.y) >= p.radius || world.rng() >= FESTIVAL.bondChance * f.strength) continue;
    let best = null;
    let bestD = FESTIVAL.bondRadius;
    for (const o of world.villagers) {
      if (o === v || !isFree(o) || v.opinion[groupOf(o)] < -10 || o.opinion[groupOf(v)] < -10) continue;
      const d = dist(v, o.x, o.y);
      if (d < bestD) {
        bestD = d;
        best = o;
      }
    }
    if (best) createBond(world, v, best);
    return;
  }
}

/** Partners defend each other and join each other's fights. */
function partnerDuties(world, v) {
  if (v.partnerId < 0) return false;
  const p = world.villagers[v.partnerId];
  if (!p.alive) return false;

  // Someone is hitting my partner: step in.
  for (const a of world.villagers) {
    if (!a.alive || a.state !== 'attack' || a.targetId !== p.id || a === v || a.id === v.partnerId) continue;
    if (dist(v, p.x, p.y) > BOND.defendRadius) continue;
    v.grievance[a.id] = Math.max(v.grievance[a.id], v.tolerance * GRIEVANCE.hitFloor);
    if (v.state !== 'attack' || v.targetId !== a.id) startAttack(world, v, a, 'defend partner');
    return true;
  }
  // My partner is fighting: help (healers and the badly hurt stay out).
  if (p.state === 'attack' && v.state !== 'attack' && !cantStart(v) && dist(v, p.x, p.y) < BOND.joinRadius) {
    const t = world.villagers[p.targetId];
    if (t.alive && t.id !== v.id && t.id !== v.partnerId) {
      v.grievance[t.id] = Math.max(v.grievance[t.id], v.tolerance * GRIEVANCE.fightAt);
      startAttack(world, v, t, 'join partner');
      return true;
    }
  }
  return false;
}

/** Idle partners drift together and keep each other company. */
function stayWithPartner(world, v) {
  if (v.partnerId < 0) return false;
  if (v.state !== 'idle' && v.state !== 'wander') return false;
  if (v.fx.follow || v.fx.festival) return false;
  const p = world.villagers[v.partnerId];
  if (!p.alive || p.state === 'attack') return false;
  if (dist(v, p.x, p.y) > BOND.followDistance) {
    v.state = 'guard';
    v.expression = 'calm';
    v.activity = null;
    v.followId = p.id;
    v.targetX = p.x;
    v.targetY = p.y;
    return true;
  }
  return false;
}

/** Gunshot panic, or somebody is hitting me: fight back or run. */
function reactToDanger(world, v) {
  if (v.panic > 0) {
    if (v.state !== 'flee') startFlee(world, v, v.panicX, v.panicY);
    return true;
  }

  let attacker = null;
  let best = COMBAT.alertRadius;
  for (const o of world.villagers) {
    if (!o.alive || o.state !== 'attack' || o.targetId !== v.id) continue;
    const d = dist(v, o.x, o.y);
    if (d < best) {
      best = d;
      attacker = o;
    }
  }
  if (!attacker) return false;

  const g = groupOf(attacker);
  const armedBonus = effectiveWeapon(v) !== 'none' ? COMBAT.fleeArmedBonus : 0;
  // Temperament: cowards bolt early, brawlers almost never give ground.
  const temper = v.trait === 'coward' ? TRAITS.coward.fleeBonus : v.trait === 'brawler' ? -TRAITS.brawler.fleePenalty : 0;
  const fleeScore = v.fear[g] + (100 - v.hp) * COMBAT.fleeHpWeight - v.courage * COMBAT.fleeCourageWeight - armedBonus + temper;
  // An exhausted runner who has been caught turns and fights: otherwise a chase can go on forever.
  const exhausted = v.state === 'flee' && 1 - Math.max(0, v.timer) / (v.fleeTotal || 1) > COMBAT.exhaustedAt;
  const cornered = exhausted && best < COMBAT.corneredDistance;
  if (fleeScore > COMBAT.fleeThreshold && !cornered) {
    startFlee(world, v, attacker.x, attacker.y);
    return true;
  }

  v.grudge[g] = COMBAT.grudgeSeconds;
  v.grievance[attacker.id] = Math.max(v.grievance[attacker.id], v.tolerance * GRIEVANCE.hitFloor);
  if (v.state !== 'attack' || v.targetId !== attacker.id) startAttack(world, v, attacker, 'being attacked');
  return true;
}

// ---- Grievance and the conflict ladder -----------------------------------------

/**
 * Stew a little over everyone nearby that this villager dislikes. Dislike comes from opinions
 * (orders, rumors, witnessing deaths); standing close makes it worse; time heals it.
 */
function updateGrievance(world, v) {
  const dt = BRAIN.thinkInterval;
  const gr = v.grievance;
  // Peaceful pastimes and festivals help tempers cool faster.
  let calm = GRIEVANCE.decayPerSecond + (v.state === 'idle' ? ACTIVITY.calm[v.activity] ?? 0 : 0);
  for (const f of world.festivals) {
    const p = world.places.find((pl) => pl.id === f.place);
    if (dist(v, p.x, p.y) < p.radius) calm += FESTIVAL.calmPerStrength * f.strength;
  }
  const decay = calm * dt;
  for (let i = 0; i < gr.length; i++) if (gr[i] > 0) gr[i] = Math.max(0, gr[i] - decay);

  // A bond does not survive hatred for the partner's whole group.
  if (v.partnerId >= 0 && v.opinion[groupOf(world.villagers[v.partnerId])] < BOND.breakBelow) breakBond(world, v);

  const mood = 1 + GRIEVANCE.moodSwing * v.mood; // a bad day shortens tempers
  const wild = v.trait === 'wildcard' ? range(world.rng, TRAITS.wildcard.moodRange) : 1;
  const sight = world.sight;
  for (const o of world.villagers) {
    if (o === v || !o.alive || o.id === v.partnerId) continue;
    const dislike = -v.opinion[groupOf(o)] - GRIEVANCE.dislikeFrom;
    if (dislike <= 0) continue;
    const d = dist(v, o.x, o.y);
    if (d > sight) continue;
    const strength = Math.min(1, dislike / (100 - GRIEVANCE.dislikeFrom));
    gr[o.id] += GRIEVANCE.rate * strength * mood * wild * (1 - (0.5 * d) / sight) * dt;
  }
}

const ratio = (v, o) => v.grievance[o.id] / v.tolerance;
const cantStart = (v) => v.trait === 'medic' || v.hp < COMBAT.woundedHp; // healers and the badly hurt never start fights

/** Which weapons am I willing to use against this opponent? 0 fists, 1 melee, 2 firearms. */
function escalationFor(v, target) {
  const r = ratio(v, target);
  let level = r >= GRIEVANCE.gunAt ? 2 : r >= GRIEVANCE.weaponAt ? 1 : 0;
  if (target.state === 'attack' && target.targetId === v.id) level = Math.max(level, target.escalation); // answer in kind
  if (v.hp < GRIEVANCE.scuffleHp) level = Math.max(level, 1); // hurt people fight dirty
  return level;
}

/** Both sides back off: grievance drops, and they ignore each other for a while. */
function disengage(world, a, b) {
  for (const [me, you] of [[a, b], [b, a]]) {
    me.grievance[you.id] *= 1 - GRIEVANCE.relief;
    me.truceUntil[you.id] = world.time + GRIEVANCE.truceSeconds;
    me.calmUntil = world.time + GRIEVANCE.calmSeconds; // and they don't go looking for a new fight straight away
    me.grudge[groupOf(you)] = 0;
    if (me.state === 'attack' || me.state === 'talk') {
      if (me.targetId === you.id) startIdle(world, me, 'disengage');
    }
  }
}

/** A fist fight that hurts someone either breaks off or turns serious. */
function scuffleCheck(world, v) {
  if (v.state !== 'attack') return false;
  const t = world.villagers[v.targetId];
  if (!t.alive) return false;
  v.escalation = Math.max(v.escalation, escalationFor(v, t));
  // Someone got hurt in a fist fight: ONE chance to break it off, not a fresh roll every half-second
  // (that used to end every scuffle within a second or two).
  if (v.escalation === 0 && !v.scuffleChecked && (v.hp < GRIEVANCE.scuffleHp || t.hp < GRIEVANCE.scuffleHp)) {
    v.scuffleChecked = true;
    if (world.rng() < GRIEVANCE.disengageChance) {
      disengage(world, v, t);
      return true;
    }
  }
  return false;
}

/** Tempers fray: once grievance passes the "argue" line, two free villagers start shouting. */
function maybeArgue(world, v) {
  if (v.state !== 'idle' && v.state !== 'wander' && v.state !== 'seek') return false;
  if (v.trait === 'peacemaker' || v.trait === 'medic') return false;
  let target = null;
  let best = GRIEVANCE.argueAt;
  for (const o of world.villagers) {
    if (o === v || !o.alive || (o.state !== 'idle' && o.state !== 'wander' && o.state !== 'seek')) continue;
    if (world.time < v.truceUntil[o.id]) continue;
    const r = ratio(v, o);
    if (r < best || r >= GRIEVANCE.fightAt) continue;
    if (dist(v, o.x, o.y) > GRIEVANCE.argueRange) continue;
    best = r;
    target = o;
  }
  if (!target) return false;
  v.revealed ||= v.trait === 'brawler' || v.trait === 'wildcard';
  startTalk(world, v, target, true);
  return true;
}

/** A tornado drags villagers in, then flings them out sideways. */
function updateTornadoes(world) {
  for (let i = world.tornadoes.length - 1; i >= 0; i--) {
    const t = world.tornadoes[i];
    if (world.time < t.at) continue;
    world.tornadoes.splice(i, 1);
    const v = world.villagers[t.id];
    if (!v?.alive) continue;
    v.kx = 0;
    v.ky = 0;
    const ang = world.rng() * Math.PI * 2;
    shoveFrom(v, v.x - Math.cos(ang), v.y - Math.sin(ang), 640);
  }
}

/** Is this villager standing in a patch of fog (a god power)? Nobody in fog can start a fight. */
function inFog(world, v) {
  return world.fogs.some((f) => f.until > world.time && dist(v, f.x, f.y) < f.r);
}

/** Start a fight with someone I am fed up with (or hold a grudge against). */
function pickFight(world, v) {
  if (cantStart(v) || world.time < v.calmUntil || inFog(world, v)) return stopGlare(world, v);
  let target = null;
  let bestD = world.seekRadius;
  for (const o of world.villagers) {
    if (o === v || !o.alive) continue;
    const g = groupOf(o);
    const fedUp = ratio(v, o) >= GRIEVANCE.fightAt && world.time >= v.truceUntil[o.id];
    if (!fedUp && v.grudge[g] <= 0) continue;
    if (v.grudge[g] <= 0 && avoidsGroup(v, g)) continue; // avoiders never start it
    let d = dist(v, o.x, o.y);
    if (v.state === 'attack' && o.id === v.targetId) d *= 0.55; // stick with the current opponent unless another is much closer
    if (d < bestD) {
      bestD = d;
      target = o;
    }
  }
  if (!target) return stopGlare(world, v);

  if (v.state === 'attack' && v.targetId === target.id) return true;
  const nerve = v.aggression + world.rng() * COMBAT.attackRoll;
  if (v.state !== 'attack' && nerve <= v.courage * COMBAT.attackCourageFactor) return stopGlare(world, v);

  // Nobody goes from calm to killing: they scowl first (the angrier the town, the shorter the scowl).
  if (v.brewId !== target.id) {
    v.brewId = target.id;
    v.brewUntil = world.time + glareSeconds(world, v);
    if (v.state !== 'attack') {
      v.state = 'idle';
      v.activity = null;
      v.purpose = null;
      v.targetId = target.id;
      v.expression = 'angry';
      v.timer = v.brewUntil - world.time + 0.5;
    }
  }
  if (world.time < v.brewUntil && v.state !== 'attack') return true;
  v.brewId = -1;
  if (world.peaceful) { // shouting is allowed in the first days, fists are not
    v.calmUntil = world.time + 6;
    startIdle(world, v, 'peace');
    return true;
  }
  startAttack(world, v, target, 'fed up');
  if (v.trait === 'brawler' || v.trait === 'wildcard') v.revealed = true;
  return true;
}

/** Seconds of scowling before a spontaneous fight: shorter for hotheads and when the tension bar is high. */
function glareSeconds(world, v) {
  const [calm, edge] = TENSION.glareSeconds;
  const heat = Math.min(1, Math.max(0, world.tension / 100));
  const hothead = v.trait === 'brawler' ? 0.6 : v.trait === 'coward' ? 1.3 : 1;
  return (calm + (edge - calm) * heat) * hothead * (0.8 + world.rng() * 0.4);
}

/** They were scowling but the moment passed: drop the glare and the angry face. */
function stopGlare(world, v) {
  if (v.brewId < 0) return false;
  v.brewId = -1;
  if (v.state === 'idle' && v.expression === 'angry') v.expression = 'calm';
  return false;
}

/**
 * Seizures: once two grabbers stand next to their victim, they lift them and carry them toward the
 * place. The victim is moved along with the grabbers until they get there, one of them is hurt or
 * the time runs out, then dropped (dunked, if it is the pond).
 */
function updateCarried(world) {
  for (const victim of world.villagers) {
    if (!victim.alive) continue;
    if (!victim.carry) {
      // is a lift starting? two grabbers close to me, both on this seizure
      const helpers = world.villagers.filter((g) => g.alive && g.fx.seize?.victim === victim.id && g.faction !== victim.faction && dist(g, victim.x, victim.y) <= ORDERS.seizeJoin + 12 && g.state !== 'attack' && g.state !== 'flee');
      if (helpers.length >= 2) {
        victim.carry = { by: helpers.map((g) => g.id), dest: helpers[0].fx.seize.dest, until: world.time + ORDERS.seizeSeconds };
        victim.state = 'mourn';
        victim.expression = 'scared';
        victim.timer = ORDERS.seizeSeconds;
        victim.targetId = null;
        victim.purpose = null;
        world.events.push({ type: 'scream', turn: world.turn, time: world.time, x: victim.x, y: victim.y });
      }
      continue;
    }
    const c = victim.carry;
    const dest = world.places.find((p) => p.id === c.dest);
    const team = c.by.map((id) => world.villagers[id]).filter((g) => g.alive && g.state !== 'attack' && g.state !== 'flee' && g.hp > 30 && g.fx.seize?.victim === victim.id);
    const arrived = team.some((g) => dist(g, dest.x, dest.y) < dest.radius * 0.45);
    if (team.length < 2 || arrived || world.time > c.until) {
      // let go
      for (const id of c.by) {
        const g = world.villagers[id];
        g.carrying = false;
        if (g.fx.seize?.victim === victim.id) g.fx.seize = null;
        victim.opinion[groupOf(g)] = Math.max(-100, victim.opinion[groupOf(g)] - 20);
        victim.fear[groupOf(g)] = Math.min(100, victim.fear[groupOf(g)] + 15);
        victim.grievance[g.id] += victim.tolerance * 0.5; // they will remember this
      }
      if (arrived && dest.id === 'pond') {
        victim.hp = Math.max(1, victim.hp - ORDERS.seizeDunk);
        victim.lastDamage = ORDERS.seizeDunk;
        victim.lastHitWeapon = 'shove';
        victim.hitFlash = 0.6;
        world.events.push({ type: 'splash', turn: world.turn, time: world.time, x: victim.x, y: victim.y });
      }
      victim.carry = null;
      victim.vx = 0;
      victim.vy = 0;
      startIdle(world, victim, 'let go');
      victim.state = 'mourn'; // stunned for a moment
      victim.expression = 'scared';
      victim.timer = 2.5;
      continue;
    }
    // carried: hang between the grabbers
    const mx = team.reduce((n, g) => n + g.x, 0) / team.length;
    const my = team.reduce((n, g) => n + g.y, 0) / team.length;
    [victim.x, victim.y] = clampIn(world, mx, my + 8);
    victim.vx = 0;
    victim.vy = 0;
    victim.kx = 0;
    victim.ky = 0;
    victim.state = 'mourn';
    victim.timer = Math.max(victim.timer, 1);
    victim.facing = team[0].facing;
  }
}

/** The nearest living villager (not me) that passes `test`, within `max` px. */
function nearestOf(world, v, test, max) {
  let best = null;
  let bestD = max;
  for (const o of world.villagers) {
    if (o === v || !o.alive || !test(o)) continue;
    const d = dist(v, o.x, o.y);
    if (d < bestD) { bestD = d; best = o; }
  }
  return best;
}

/** Medics heal, peacemakers separate fighters, bodyguards defend their friend. */
function traitDuties(world, v) {
  switch (v.trait) {
    case 'medic': {
      const cfg = TRAITS.medic;
      let patient = null;
      let worst = 100;
      for (const o of world.villagers) {
        if (o === v || !o.alive || o.hp >= 100) continue;
        const d = dist(v, o.x, o.y);
        if (d <= cfg.healRadius) {
          o.hp = Math.min(100, o.hp + cfg.healPerThink);
          v.revealed = true;
        }
        if (o.hp < cfg.seekBelowHp && o.hp < worst && d <= cfg.seekRadius && o.state !== 'attack') {
          worst = o.hp;
          patient = o;
        }
      }
      if (patient && v.state !== 'attack' && dist(v, patient.x, patient.y) > cfg.healRadius * 0.9) {
        v.state = 'guard';
        v.expression = 'calm';
        v.followId = -1;
        v.targetX = patient.x;
        v.targetY = patient.y;
        return true;
      }
      return false;
    }

    case 'peacemaker': {
      const cfg = TRAITS.peacemaker;
      if (world.time < v.peaceCooldown) return false;
      for (const a of world.villagers) {
        if (!a.alive || a.state !== 'attack' || a === v || a.escalation >= 2) continue;
        const t = world.villagers[a.targetId];
        if (!t.alive || dist(v, a.x, a.y) > cfg.radius) continue;
        if (world.rng() < cfg.breakChance) {
          disengage(world, a, t);
          v.peaceCooldown = world.time + cfg.cooldown;
          v.revealed = true;
          v.state = 'guard';
          v.expression = 'calm';
          v.followId = -1;
          v.targetX = a.x;
          v.targetY = a.y;
          return true;
        }
      }
      return false;
    }

    case 'bodyguard': {
      const friend = world.villagers[v.friendId];
      if (!friend.alive || v.state === 'attack') return false;
      for (const a of world.villagers) {
        if (!a.alive || a.state !== 'attack' || a.targetId !== friend.id || a === v) continue;
        if (dist(v, friend.x, friend.y) > TRAITS.bodyguard.radius) continue;
        v.grievance[a.id] = Math.max(v.grievance[a.id], v.tolerance * GRIEVANCE.hitFloor);
        startAttack(world, v, a, 'bodyguard');
        v.revealed = true;
        return true;
      }
      return false;
    }
  }
  return false;
}

function interceptForProtected(world, v) {
  if (v.fx.protect.length === 0) return false;
  for (const a of world.villagers) {
    if (!a.alive || a.state !== 'attack' || a === v) continue;
    const victim = world.villagers[a.targetId];
    if (!victim || !victim.alive || !isProtectedBy(world, v, victim)) continue;
    if (dist(v, victim.x, victim.y) > ORDERS.protectRadius) continue;
    if (isProtectedBy(world, v, a)) continue; // don't pile on someone I'm also guarding
    startAttack(world, v, a, 'protect order');
    return true;
  }
  return false;
}

/** Orders that give a villager somewhere to be: arm up, follow a place, guard something. */
function obeyOrders(world, v) {
  const { fx } = v;

  if (fx.arm && !v.armDone) {
    if (v.weapon !== 'none' || world.armoryPool[groupOf(v)] <= 0) {
      v.armDone = true;
    } else {
      const armory = world.places.find((p) => p.id === 'armory');
      if (dist(v, armory.x, armory.y) < 60) {
        world.armoryPool[groupOf(v)]--;
        v.weapon = v.trait === 'gunslinger' ? ARMORY.gunslingerWeapon : ARMORY.weapons[Math.floor(world.rng() * ARMORY.weapons.length)];
        if (isFirearm(v.weapon)) v.ammo = WEAPONS[v.weapon].maxAmmo;
        v.armDone = true;
        world.events.push({ type: 'arm', turn: world.turn, time: world.time, villagerId: v.id });
      } else {
        goToPlace(world, v, armory, 'arm');
        return true;
      }
    }
  }

  // "Stand down": put the fists away and keep out of trouble.
  if (fx.standdown) {
    v.calmUntil = Math.max(v.calmUntil, world.time + 6);
    if (v.state === 'attack' && !v.panic) startIdle(world, v, 'stand down');
  }

  // "Hunt Olive": go after one named villager.
  if (fx.hunt !== null && !fx.standdown) {
    const prey = world.villagers[fx.hunt];
    if (prey?.alive) {
      if (v.state !== 'attack' || v.targetId !== prey.id) startAttack(world, v, prey, 'hunt order');
      return false; // the fight logic takes it from here
    }
  }

  // "Assault the Tides" / "kill everyone at the houses": charge the nearest target, then the next.
  if (fx.assault && !fx.standdown) {
    const as = fx.assault;
    const place = as.kind === 'place' ? world.places.find((p) => p.id === as.id) : null;
    const isFoe = (o) => o.alive && o !== v && o.faction !== v.faction && (place ? dist(o, place.x, place.y) < place.radius * 1.3 : groupOf(o) === as.id);
    const cur = v.state === 'attack' ? world.villagers[v.targetId] : null;
    if (!cur || !isFoe(cur)) {
      let best = null;
      let bestD = Infinity;
      for (const o of world.villagers) {
        if (!isFoe(o)) continue;
        const d = dist(v, o.x, o.y);
        if (d < bestD) { bestD = d; best = o; }
      }
      if (best && bestD < 700) startAttack(world, v, best, 'assault order');
      else if (best || (place && dist(v, place.x, place.y) > place.radius * 0.7)) {
        v.state = 'wander';
        v.purpose = 'follow';
        v.targetX = best ? best.x : place.x;
        v.targetY = best ? best.y : place.y;
        return true;
      }
    }
    return false;
  }

  // "Shove the Tides": walk up and push them away, again and again.
  if (fx.shove.length > 0 && !fx.standdown) {
    const prey = nearestOf(world, v, (o) => fx.shove.some((s) => s.group === groupOf(o)), 650);
    if (prey) {
      if (dist(v, prey.x, prey.y) > ORDERS.shoveReach) {
        v.state = 'wander';
        v.purpose = 'follow';
        v.targetX = prey.x;
        v.targetY = prey.y;
        return true;
      }
      v.state = 'idle';
      v.activity = null;
      v.timer = 0.6;
      v.targetId = prey.id;
      v.expression = 'angry';
      v.brewId = prey.id;
      if (world.time >= v.shoveAt) {
        const S = fx.shove.find((s) => s.group === groupOf(prey)).S;
        v.shoveAt = world.time + ORDERS.shoveEvery / S;
        v.swing = 1;
        shoveVictim(world, v, prey);
      }
      return true;
    }
  }

  // "Grab Mia and drag her to the pond": go to her together; once two are on her, carry her away.
  if (fx.seize && !fx.standdown) {
    const s = fx.seize;
    const victim = world.villagers[s.victim];
    const dest = world.places.find((p) => p.id === s.dest);
    if (!victim?.alive || victim.faction === v.faction) {
      fx.seize = null;
      v.carrying = false;
    } else if (victim.carry?.by.includes(v.id)) {
      v.carrying = true;
      v.state = 'wander';
      v.purpose = 'follow';
      v.expression = 'angry';
      v.targetX = dest.x;
      v.targetY = dest.y;
      return true;
    } else if (!victim.carry) {
      if (dist(v, victim.x, victim.y) > ORDERS.seizeJoin) {
        v.state = 'wander';
        v.purpose = 'follow';
        v.targetX = victim.x;
        v.targetY = victim.y;
      } else {
        v.state = 'idle'; // at the victim, waiting for a friend to help lift
        v.timer = 0.5;
        v.targetId = victim.id;
        v.expression = 'angry';
      }
      return true;
    }
  }

  // "Scare the Tides": walk up to them, glare, and keep at it until they lose their nerve and run.
  if (fx.scare.length > 0 && !fx.standdown) {
    const prey = nearestOf(world, v, (o) => fx.scare.some((s) => s.group === groupOf(o)) && o.state !== 'flee', 650);
    if (prey) {
      const S = fx.scare.find((s) => s.group === groupOf(prey)).S;
      if (dist(v, prey.x, prey.y) > ORDERS.scareReach) {
        v.state = 'wander';
        v.purpose = 'follow';
        v.targetX = prey.x;
        v.targetY = prey.y;
        return true;
      }
      // Close enough: loom. Their fear and doubt grow, and now and then they bolt.
      v.state = 'idle';
      v.activity = null;
      v.timer = 0.6;
      v.targetId = prey.id;
      v.expression = 'angry';
      v.brewId = prey.id; // the glare animation and the thought bubble
      if (world.rng() < 0.35) shoutAt(world, v); // they yell as they loom
      prey.fear[groupOf(v)] = Math.min(100, prey.fear[groupOf(v)] + ORDERS.scareFear * S * 0.5);
      prey.courage = Math.max(10, prey.courage - ORDERS.scareCourage * S);
      prey.grievance[v.id] += ORDERS.scareGrudge * S; // bullying breeds resentment
      if (world.rng() < ORDERS.scareFlee * S) {
        startFlee(world, prey, v.x, v.y);
        prey.panic = Math.max(prey.panic, 0.8);
        prey.panicX = v.x;
        prey.panicY = v.y;
      }
      return true;
    }
  }

  // "Ambush at the plaza": lie in wait, then jump whoever from another faction comes close.
  if (fx.ambush && !fx.standdown) {
    const place = world.places.find((p) => p.id === fx.ambush);
    if (v.state !== 'attack') {
      const victim = nearestOf(world, v, (o) => o.faction !== v.faction && dist(o, place.x, place.y) < place.radius * ORDERS.ambushReach, 400);
      if (victim) {
        startAttack(world, v, victim, 'ambush order');
        return false;
      }
      if (dist(v, place.x, place.y) > place.radius * 0.8) {
        goToPlace(world, v, place, 'follow');
        return true;
      }
      if (v.state === 'idle') v.timer = Math.max(v.timer, 0.8); // stay put, hidden
      return true;
    }
  }

  // "Follow Mia": stay near one villager, wherever they go.
  if (fx.escort !== null) {
    const buddy = world.villagers[fx.escort];
    if (buddy?.alive && dist(v, buddy.x, buddy.y) > ORDERS.protectStay * 1.25) {
      v.state = 'guard';
      v.expression = 'calm';
      v.followId = buddy.id;
      v.targetX = buddy.x;
      v.targetY = buddy.y;
      return true;
    }
  }

  if (fx.follow) {
    const place = world.places.find((p) => p.id === fx.follow);
    if (dist(v, place.x, place.y) > place.radius * 0.9) {
      goToPlace(world, v, place, 'follow');
      return true;
    }
  }

  // A festival: go there and dance until it is over.
  if (fx.festival) {
    const place = world.places.find((p) => p.id === fx.festival);
    if (dist(v, place.x, place.y) > place.radius * 0.8) {
      goToPlace(world, v, place, 'follow');
      return true;
    }
    if (v.state === 'idle' && (v.activity !== 'dance' || v.timer <= 0)) startActivity(world, v, 'dance');
  }

  v.guardBonus = 0;
  if (fx.protect.length > 0) {
    const spot = nearestProtected(world, v);
    if (spot) {
      const d = dist(v, spot.x, spot.y);
      const strongest = Math.max(...fx.protect.map((p) => p.S));
      v.guardBonus = d < ORDERS.protectRadius ? Math.min(ORDERS.protectReductionCap, ORDERS.protectReduction * strongest) : 0;
      if (d > ORDERS.protectStay * 1.25) { // set off beyond 75, arrive inside 54: no jitter at the boundary
        v.state = 'guard';
        v.expression = 'calm';
        v.followId = spot.id ?? -1; // a villager (keep following) or a place (-1)
        v.targetX = spot.x;
        v.targetY = spot.y;
        return true;
      }
    }
  }
  return false;
}

export function goToPlace(world, v, place, purpose) {
  const angle = world.rng() * Math.PI * 2;
  const d = Math.sqrt(world.rng()) * place.radius * 0.6;
  v.state = 'wander';
  v.expression = 'calm';
  v.purpose = purpose;
  [v.targetX, v.targetY] = clampIn(world, place.x + Math.cos(angle) * d, place.y + Math.sin(angle) * d);
}

/** Peaceful life. Under a follow/protect order villagers stay put and just chat. */
function peaceful(world, v) {
  switch (v.state) {
    case 'idle':
      if (v.timer <= 0) choose(world, v);
      break;

    case 'wander':
      if (dist(v, v.targetX, v.targetY) < BRAIN.arriveDistance) {
        const place = placeAt(world, v);
        const errand = v.purpose !== null; // arming up / following orders: no time for fun
        startIdle(world, v);
        // Arrived somewhere: usually do whatever people do there.
        if (place && !errand && world.rng() < ACTIVITY.chance) startActivity(world, v, ACTIVITY.byPlace[place.id]);
      }
      break;

    case 'guard': {
      // Keep walking until we actually get there (this used to drop to idle every half-second,
      // and the partner/protect rules then sent them straight back: a twitchy loop).
      const f = v.followId >= 0 ? world.villagers[v.followId] : null; // same live target that act() walks toward
      const tx = f?.alive ? f.x : v.targetX;
      const ty = f?.alive ? f.y : v.targetY;
      if (dist(v, tx, ty) < ORDERS.protectStay * 0.9) startIdle(world, v); // arrive inside 54, only set off again beyond 60
      break;
    }

    case 'seek': {
      const other = world.villagers[v.targetId];
      const otherBusy = !other.alive || (other.state === 'talk' && other.targetId !== v.id)
        || other.state === 'attack' || other.state === 'flee' || other.state === 'mourn';
      if (otherBusy || v.timer <= 0) {
        startIdle(world, v);
      } else if (dist(v, other.x, other.y) < BRAIN.talkDistance) {
        startTalk(world, v, other);
      }
      break;
    }

    case 'talk': {
      const other = world.villagers[v.targetId];
      const together = other.alive && other.state === 'talk';
      if (together && v.expression === 'angry') {
        // An argument: shouting adds fuel, but each half-second there is a chance someone calms down.
        v.grievance[other.id] += GRIEVANCE.argueHeat * BRAIN.thinkInterval;
        if (tryCalm(world, v, other)) break;
      }
      if (v.timer <= 0 || !together) startIdle(world, v);
      break;
    }
  }
}

/** Chance that an argument fizzles out. Friends, peacemakers and cowards all help. */
function tryCalm(world, v, other) {
  let chance = GRIEVANCE.calmChance;
  if (v.friendId === other.id || other.friendId === v.id) chance += GRIEVANCE.friendCalm;
  if (v.trait === 'coward' || other.trait === 'coward') chance += GRIEVANCE.cowardCalm;
  for (const p of world.villagers) {
    if (p.trait === 'peacemaker' && p.alive && dist(v, p.x, p.y) < TRAITS.peacemaker.radius) {
      chance += GRIEVANCE.peacemakerCalm;
      if (world.rng() < chance) p.revealed = true;
      break;
    }
  }
  if (world.rng() >= chance) return false;
  disengage(world, v, other);
  return true;
}

function choose(world, v) {
  const { rng } = world;
  v.activity = null;

  // Partners often spend their free time together.
  if (v.partnerId >= 0 && rng() < 0.5) {
    const p = world.villagers[v.partnerId];
    if (p.alive && (p.state === 'idle' || p.state === 'wander') && dist(v, p.x, p.y) < BRAIN.socializeRange) {
      v.state = 'seek';
      v.targetId = p.id;
      v.timer = BRAIN.seekGiveUpSeconds;
      return;
    }
  }
  const stay = v.fx.follow || v.fx.protect.length > 0;
  const socialize = BRAIN.chooseSocialize + (v.fx.love.length > 0 ? BRAIN.loveOrderSocializeBonus : 0);
  const wander = stay ? 0 : BRAIN.chooseWander;
  const roll = rng() * (wander + socialize + BRAIN.chooseIdle);

  if (roll < wander) {
    const place = pickPlace(world);
    const angle = rng() * Math.PI * 2;
    const d = Math.sqrt(rng()) * place.radius * 0.8;
    v.state = 'wander';
    v.purpose = null;
    [v.targetX, v.targetY] = clampIn(world, place.x + Math.cos(angle) * d, place.y + Math.sin(angle) * d);
  } else if (roll < wander + socialize) {
    const other = randomFreeVillager(world, v);
    if (other) {
      v.state = 'seek';
      v.targetId = other.id;
      v.timer = BRAIN.seekGiveUpSeconds;
    } else {
      startIdle(world, v);
    }
  } else {
    startIdle(world, v);
  }
}

// ---- State changes -----------------------------------------------------------

export function startIdle(world, v, why = '') {
  if (v.state === 'attack') note(world, `attack->idle: ${why || 'other'}`);
  v.state = 'idle';
  v.activity = null;
  v.expression = 'calm';
  v.targetId = null;
  v.purpose = null;
  v.brewId = -1;
  v.timer = range(world.rng, BRAIN.idleSeconds);
}

export function startAttack(world, v, target, cause = 'fed up') {
  if (world.peaceful) return; // the first days are calm: shouting, yes; fighting, no
  if (v.state !== 'attack') note(world, `idle->attack: ${cause}`);
  else if (v.targetId !== target.id) note(world, `retarget: ${cause}`);
  v.state = 'attack';
  v.expression = 'angry';
  v.brewId = -1;
  v.targetId = target.id;
  v.purpose = null;
  v.escalation = escalationFor(v, target);
  v.scuffleChecked = false;
  if (v.escalation === 0) logPair(world, v, target, 'scuffle');
}

function startFlee(world, v, fromX, fromY) {
  v.state = 'flee';
  v.expression = 'scared';
  v.targetId = null;
  v.fleeX = fromX;
  v.fleeY = fromY;
  // Run TO somewhere safe (the place that is far from the danger and not too far from me), not just
  // straight away from it: a straight line ends against a wall and the villager just stands there.
  let bestScore = -Infinity;
  for (const p of world.places) {
    const score = Math.hypot(p.x - fromX, p.y - fromY) - 0.7 * Math.hypot(p.x - v.x, p.y - v.y);
    if (score > bestScore) {
      bestScore = score;
      v.fleeToX = p.x;
      v.fleeToY = p.y;
    }
  }
  const scare = v.trait === 'coward' ? TRAITS.coward.panicMul : 1;
  v.timer = range(world.rng, COMBAT.fleeSeconds) * scare;
  v.fleeTotal = v.timer;
  if (v.trait === 'coward') v.revealed = true;
}

/** @param {boolean} [argue] force this to be an argument (grievance boiled over) */
function startTalk(world, a, b, argue = false) {
  const { rng } = world;
  const duration = range(rng, argue ? GRIEVANCE.argueSeconds : BRAIN.talkSeconds);
  // Heart eyes are likelier between friends (or under a love order), but any chat can spark one.
  // If either side dislikes the other's group, the chat is an argument instead.
  const friends = a.friendId === b.id || b.friendId === a.id
    || a.fx.love.includes(groupOf(b)) || b.fx.love.includes(groupOf(a));
  const arguing = a.opinion[groupOf(b)] < BRAIN.argueOpinion || b.opinion[groupOf(a)] < BRAIN.argueOpinion;
  let expression = rng() < (friends ? BRAIN.loveChance : BRAIN.strangerLoveChance) ? 'love' : 'happy';
  if (arguing || argue) {
    expression = 'angry';
    logPair(world, a, b, 'argue');
  }
  // A hug between two free friends can turn into something more.
  if (expression === 'love' && isFree(a) && isFree(b) && rng() < BOND.hugChance) createBond(world, a, b);

  exchangeRumors(world, a, b); // gossip travels by conversation

  for (const [me, you] of [[a, b], [b, a]]) {
    me.state = 'talk';
    me.targetId = you.id;
    me.timer = duration;
    me.expression = expression;
  }
}

// ---- Movement -----------------------------------------------------------------

/** Movement + timers. Runs every tick for every living villager. */
function act(world, v, dt) {
  if (v.state === 'idle' || v.state === 'talk' || v.state === 'seek' || v.state === 'flee' || v.state === 'mourn') v.timer -= dt;

  let dvx = 0;
  let dvy = 0;
  let tx = null;
  let ty = null;
  let stopAt = 0;
  let speed = v.speed;
  if (v.carrying) speed *= 0.85; // dragging someone is slow work

  switch (v.state) {
    case 'wander':
      tx = v.targetX;
      ty = v.targetY;
      stopAt = BRAIN.arriveDistance * 0.5;
      break;
    case 'guard': {
      const f = v.followId >= 0 ? world.villagers[v.followId] : null;
      tx = f?.alive ? f.x : v.targetX;
      ty = f?.alive ? f.y : v.targetY;
      stopAt = ORDERS.protectStay * 0.8;
      break;
    }
    case 'seek': {
      const o = world.villagers[v.targetId];
      tx = o.x;
      ty = o.y;
      stopAt = BRAIN.talkDistance * 0.8;
      break;
    }
    case 'attack': {
      const o = world.villagers[v.targetId];
      if (o.alive) {
        tx = o.x;
        ty = o.y;
        stopAt = WEAPONS[usableWeapon(v)].range * 0.75;
        speed = v.speed * 1.15;
      }
      break;
    }
    case 'flee': {
      // away from the danger, bent toward the chosen safe place
      const ax = v.x - v.fleeX;
      const ay = v.y - v.fleeY;
      const ad = Math.hypot(ax, ay) || 1;
      const sx = v.fleeToX - v.x;
      const sy = v.fleeToY - v.y;
      const sd = Math.hypot(sx, sy) || 1;
      const dx = ax / ad + (sx / sd) * 1.1;
      const dy = ay / ad + (sy / sd) * 1.1;
      const d = Math.hypot(dx, dy) || 1;
      // Stamina: a sprint at first, then the runner tires and a determined chaser catches up.
      const spent = 1 - Math.max(0, v.timer) / (v.fleeTotal || 1);
      const run = COMBAT.fleeSpeedMul - (COMBAT.fleeSpeedMul - COMBAT.fleeTiredMul) * spent;
      dvx = (dx / d) * v.speed * run;
      dvy = (dy / d) * v.speed * run;
      break;
    }
  }

  if (tx !== null) {
    const dx = tx - v.x;
    const dy = ty - v.y;
    const d = Math.hypot(dx, dy);
    if (d > stopAt) {
      dvx = (dx / d) * speed;
      dvy = (dy / d) * speed;
    }
  }

  // Gently push away from anyone standing too close, so the crowd doesn't stack up.
  for (const o of world.villagers) {
    if (o === v || !o.alive) continue;
    const dx = v.x - o.x;
    const dy = v.y - o.y;
    const d2 = dx * dx + dy * dy;
    if (d2 > 0 && d2 < VILLAGER.separation * VILLAGER.separation) {
      const d = Math.sqrt(d2);
      const push = (1 - d / VILLAGER.separation) * VILLAGER.separationForce;
      dvx += (dx / d) * push;
      dvy += (dy / d) * push;
    }
  }

  // Walls push back, so nobody gets pinned against an edge or in a corner.
  const reach = WALL.reach;
  const bd = world.bounds;
  const pushX = Math.max(0, 1 - (v.x - bd.x0 + WALL.reach * 0.3) / reach) - Math.max(0, 1 - (bd.x1 - v.x + WALL.reach * 0.3) / reach);
  const pushY = Math.max(0, 1 - (v.y - bd.y0 + WALL.reach * 0.3) / reach) - Math.max(0, 1 - (bd.y1 - v.y + WALL.reach * 0.3) / reach);
  dvx += pushX * WALL.push;
  dvy += pushY * WALL.push;

  if (v.fx.avoid.length > 0 && v.state !== 'attack' && v.state !== 'flee') {
    const [ax, ay] = avoidVector(world, v);
    dvx += ax * v.speed * ORDERS.avoidPush;
    dvy += ay * v.speed * ORDERS.avoidPush;
  }

  // Ease velocity toward the wanted velocity so starts and stops look soft.
  const ease = Math.min(1, VILLAGER.acceleration * dt);
  v.vx += (dvx - v.vx) * ease;
  v.vy += (dvy - v.vy) * ease;

  [v.x, v.y] = clampIn(world, v.x + v.vx * dt, v.y + v.vy * dt);

  if (v.state === 'talk' || v.state === 'attack' || v.state === 'mourn' || v.brewId >= 0) {
    const other = world.villagers[v.targetId];
    if (other) v.facing = other.x >= v.x ? 1 : -1;
  } else if (Math.abs(v.vx) > 4) {
    v.facing = v.vx > 0 ? 1 : -1;
  }
}

/** Unit-ish vector pointing away from everything this villager was told to avoid. */
function avoidVector(world, v) {
  let sx = 0;
  let sy = 0;
  for (const { target } of v.fx.avoid) {
    if (target.kind === 'group') {
      for (const o of world.villagers) {
        if (o === v || !o.alive || groupOf(o) !== target.id) continue;
        const dx = v.x - o.x;
        const dy = v.y - o.y;
        const d = Math.hypot(dx, dy);
        if (d > 0 && d < ORDERS.avoidDistance) {
          const w = 1 - d / ORDERS.avoidDistance;
          sx += (dx / d) * w;
          sy += (dy / d) * w;
        }
      }
    } else {
      const p = world.places.find((pl) => pl.id === target.id);
      const dx = v.x - p.x;
      const dy = v.y - p.y;
      const d = Math.hypot(dx, dy) || 1;
      const reach = p.radius + ORDERS.avoidDistance * 0.4;
      if (d < reach) {
        const w = 1 - d / reach;
        sx += (dx / d) * w * 2;
        sy += (dy / d) * w * 2;
      }
    }
  }
  return [sx, sy];
}

// ---- Thought bubbles ------------------------------------------------------------
// Pick the single strongest driver for the bubble above a villager's head, so players can
// read WHY someone is doing something. Purely cosmetic: nothing here changes behaviour,
// except that "suspicious" is also the face worn while a hated group is nearby.

function updateThought(world, v) {
  let icon = null;
  let group = -1;

  switch (v.state) {
    case 'attack': {
      const t = world.villagers[v.targetId];
      icon = t.hp < COMBAT.woundedHp ? 'skull' : 'angry';
      group = groupOf(t);
      break;
    }
    case 'flee': {
      icon = 'sweat';
      let worst = 10;
      for (let g = 0; g < v.fear.length; g++) if (v.fear[g] > worst) { worst = v.fear[g]; group = g; }
      break;
    }
    case 'mourn': {
      const lost = world.villagers[v.targetId]; // sleep and kidnap freeze people with nobody to mourn
      if (lost) {
        icon = 'skull';
        group = groupOf(lost);
      }
      break;
    }
    case 'guard': {
      icon = 'shield';
      const t = v.fx.protect[0]?.target;
      if (t?.kind === 'group') group = t.id;
      break;
    }
    case 'talk': {
      const other = world.villagers[v.targetId];
      if (v.expression === 'love') icon = 'heart';
      else if (v.expression === 'angry') {
        icon = 'angry';
        group = groupOf(other);
      }
      break;
    }
    default:
      if (v.brewId >= 0) { icon = 'angry'; group = groupOf(world.villagers[v.brewId]); } else if (v.fx.follow || v.purpose === 'follow') icon = 'flag';
  }

  // Bonded partners standing together glow.
  if (icon === null && v.partnerId >= 0 && v.state === 'idle') {
    const p = world.villagers[v.partnerId];
    if (p.alive && dist(v, p.x, p.y) < 70) icon = 'heart';
  }

  // Idle people eye up anyone from a group they distrust.
  if (icon === null && (v.state === 'idle' || v.state === 'wander')) {
    const near = suspectedGroup(world, v);
    if (near >= 0) {
      icon = 'question';
      group = near;
      v.expression = 'suspicious';
    } else if (v.expression === 'suspicious') {
      v.expression = 'calm';
    }
  } else if (v.expression === 'suspicious') {
    v.expression = 'calm';
  }

  v.thought = icon;
  v.thoughtGroup = group;
}

function suspectedGroup(world, v) {
  let best = -1;
  let bestOpinion = BRAIN.suspicionOpinion;
  for (const o of world.villagers) {
    if (o === v || !o.alive) continue;
    const g = groupOf(o);
    if (v.opinion[g] >= bestOpinion) continue;
    if (dist(v, o.x, o.y) < BRAIN.suspicionRadius) {
      best = g;
      bestOpinion = v.opinion[g];
    }
  }
  return best;
}

// ---- Helpers --------------------------------------------------------------------

function avoidsGroup(v, g) {
  return v.fx.avoid.some((a) => a.target.kind === 'group' && a.target.id === g);
}

function isProtectedBy(world, guard, t) {
  for (const { target } of guard.fx.protect) {
    if (target.kind === 'group') {
      if (groupOf(t) === target.id) return true;
    } else {
      const p = world.places.find((pl) => pl.id === target.id);
      if (dist(t, p.x, p.y) < p.radius) return true;
    }
  }
  return false;
}

/** The closest thing this villager is guarding: a protected villager (not itself) or a place. */
function nearestProtected(world, v) {
  let best = null;
  let bestD = Infinity;
  for (const { target } of v.fx.protect) {
    if (target.kind === 'place') {
      const p = world.places.find((pl) => pl.id === target.id);
      const d = dist(v, p.x, p.y);
      if (d < bestD) {
        bestD = d;
        best = p;
      }
    } else {
      for (const o of world.villagers) {
        if (o === v || !o.alive || groupOf(o) !== target.id) continue;
        const d = dist(v, o.x, o.y);
        if (d < bestD) {
          bestD = d;
          best = o;
        }
      }
    }
  }
  return best;
}

function pickPlace(world) {
  const { rng, places } = world;
  let total = 0;
  for (const p of places) total += BRAIN.placeWeights[p.id] ?? 1;
  let roll = rng() * total;
  for (const p of places) {
    roll -= BRAIN.placeWeights[p.id] ?? 1;
    if (roll <= 0) return p;
  }
  return places[0];
}

// Random pick among nearby free villagers (not always the closest, or the same pairs
// would chat forever).
function randomFreeVillager(world, v) {
  const candidates = world.villagers.filter(
    (o) => o !== v && o.alive && o.state !== 'talk' && o.state !== 'attack' && o.state !== 'flee' && o.state !== 'mourn'
      && dist(v, o.x, o.y) < BRAIN.socializeRange,
  );
  if (candidates.length === 0) return null;
  return candidates[Math.floor(world.rng() * candidates.length)];
}

const dist = (v, x, y) => Math.hypot(x - v.x, y - v.y);
