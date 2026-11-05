import test from 'node:test';
import assert from 'node:assert/strict';
import { createGame, updateGame } from '../src/sim/turn.js';
import { castPower, validatePower, normalizePowerArgs, nearestPowerTarget, POWER_DEFS } from '../src/sim/powers.js';
import { resolveCombat, updateBombs } from '../src/sim/combat.js';
import { stepWorld } from '../src/sim/brain.js';
import { updatePowerEffects } from '../src/sim/powerEffects.js';
import { authoritativeState } from '../src/sim/state.js';
import { parseCommand, resolvePower } from '../src/sim/parser.js';
import { Replay } from '../src/render/replay.js';
import { COMBAT, POWERS } from '../src/config/tunables.js';
import { attributeKill, buildHighlights } from '../src/sim/highlights.js';

function fresh(seed = 717) {
  const g = createGame({ seed, seats: Array.from({ length: 4 }, () => ({ name: 'Test', kind: 'human' })), cosmetics: true });
  g.phase = 'sim'; g.turn = g.world.turn = 5; g.world.peaceful = false; g.world.time = 10;
  g.power.fill(3);
  g.world.villagers.forEach((v, i) => { v.x = v.px = 50 + i * 27; v.y = v.py = 100; v.thinkTimer = 100; v.timer = 100; v.state = 'idle'; });
  return g;
}
const own = g => g.world.villagers.find(v => v.faction === 0);
const foe = g => g.world.villagers.find(v => v.faction === 1);
const at = (v, x = 950, y = 570) => { v.x = v.px = x; v.y = v.py = y; return v; };
function duel(g, weapon = 'gun') {
  const a = at(own(g)), b = at(foe(g), 980, 570);
  Object.assign(a, { state: 'attack', targetId: b.id, weapon, ammo: 100, escalation: 2, cd: 0, partnerId: -1 });
  Object.assign(b, { state: 'idle', hp: 100, partnerId: -1, guardBonus: 0, blessUntil: 0 });
  return [a, b];
}

test('nearby aim is pure, filters eligible allies and affects exactly one villager', () => {
  const g = fresh(); const a = at(own(g)); a.hp = 50;
  const b = at(g.world.villagers.find(v => v.faction === 0 && v !== a), 980, 570); b.hp = 40;
  at(foe(g), 952, 570).hp = 10;
  const before = authoritativeState(g);
  for (let i = 0; i < 50; i++) assert.equal(nearestPowerTarget(g, 0, 'miracle', 950, 552, 85).id, a.id);
  assert.deepEqual(authoritativeState(g), before);
  assert.ok(castPower(g, 0, 'miracle', { villagerId: a.id }).ok);
  assert.equal(a.hp, 95); assert.equal(b.hp, 40); assert.equal(foe(g).hp, 10);
  assert.equal(nearestPowerTarget(g, 0, 'weapon', 100, 900, 85), null);
});

test('Miracle rejects rivals and full health without spending power or seeded RNG', () => {
  const g = fresh(), before = authoritativeState(g);
  assert.equal(castPower(g, 0, 'miracle', { villagerId: foe(g).id }).ok, false);
  assert.equal(castPower(g, 0, 'miracle', { villagerId: own(g).id }).ok, false);
  assert.deepEqual(authoritativeState(g), before);
});

test('Whirlpool hurts allies and rivals equally, caps centre damage at 30, expires, and respects Aegis', () => {
  const g = fresh(), a = at(own(g)), b = at(foe(g));
  const c = at(g.world.villagers.find(v => v.faction === 2)); c.blessUntil = 100;
  const edge = at(g.world.villagers.find(v => v.faction === 3), 950 + POWERS.whirlpool.radius, 570);
  assert.ok(castPower(g, 0, 'whirlpool', { x: 950, y: 570 }).ok);
  for (let i = 0; i < 60; i++) { g.world.time += 0.05; updatePowerEffects(g.world, 0.05); }
  g.world.time = 13.001; updatePowerEffects(g.world, 0.001);
  assert.ok(Math.abs(a.hp - 70) < 1e-8); assert.equal(a.hp, b.hp);
  assert.ok(Math.abs(c.hp - 88) < 1e-8); assert.equal(edge.hp, 100);
  assert.equal(g.world.whirlpools.length, 0);
  const hp = a.hp; g.world.time += 10; updatePowerEffects(g.world, 10); assert.equal(a.hp, hp);
});

test('Freeze immobilizes everyone for 4 seconds and suppresses attacks even after Enrage', () => {
  const g = fresh(), [a, b] = duel(g); a.weapon = 'none';
  assert.ok(castPower(g, 0, 'freeze', { x: a.x, y: a.y }).ok);
  assert.equal(a.frozenUntil, 14); assert.equal(b.frozenUntil, 14);
  assert.ok(castPower(g, 1, 'enrage', { villagerId: a.id }).ok);
  const x = a.x, y = a.y, hp = b.hp;
  for (let i = 0; i < 79; i++) stepWorld(g.world, 0.05);
  assert.equal(a.x, x); assert.equal(a.y, y); assert.equal(b.hp, hp);
  g.world.time = 14.01; a.state = 'attack'; a.targetId = b.id; a.cd = 0;
  g.world.rng = () => 0.1; resolveCombat(g.world, 0.05); assert.ok(b.hp < hp);
});

test('Blackout heals only living allies by 20 and blocks combat for exactly 8 seconds', () => {
  const g = fresh(), [a, b] = duel(g); a.hp = 85; b.hp = 50;
  const dead = g.world.villagers.find(v => v.faction === 0 && v !== a); dead.alive = false; dead.hp = 0;
  assert.ok(castPower(g, 0, 'blackout', {}).ok);
  assert.equal(a.hp, 100); assert.equal(b.hp, 50); assert.equal(dead.hp, 0); assert.equal(g.world.blackoutUntil, 18);
  for (const time of [10, 12, 17.99]) { g.world.time = time; a.state = 'attack'; a.targetId = b.id; a.cd = 0; resolveCombat(g.world, 0.05); assert.equal(b.hp, 50); }
  g.world.time = 18; a.cd = 0; g.world.rng = () => 0.1; resolveCombat(g.world, 0.05); assert.ok(b.hp < 50);
});

test('a launcher is picked up by the first nearby villager of any faction, freezes cannot pick up', () => {
  const g = fresh(), rival = at(foe(g)); rival.frozenUntil = 14;
  assert.ok(castPower(g, 0, 'launcher', { x: rival.x, y: rival.y }).ok);
  updatePowerEffects(g.world, 0.05); assert.equal(g.world.weaponDrops.length, 1);
  rival.frozenUntil = 0; updatePowerEffects(g.world, 0.05);
  assert.equal(rival.weapon, 'rocket'); assert.equal(rival.ammo, 5); assert.equal(g.world.weaponDrops.length, 0);
  assert.equal(validatePower(g, 1, 'weapon', { villagerId: rival.id }).ok, false);
});

test('five rockets deplete the launcher; delayed half-Fireball blasts spare the shooter faction', () => {
  const g = fresh(), [a, b] = duel(g, 'rocket'); a.ammo = 5;
  const ally = at(g.world.villagers.find(v => v.faction === 0 && v !== a), b.x, b.y);
  g.world.rng = () => 0.4;
  for (let i = 0; i < 5; i++) {
    a.cd = 0; a.state = 'attack'; a.targetId = b.id;
    resolveCombat(g.world, 0.05);
    assert.equal(g.world.rockets.length, 1);
    const r = g.world.rockets[0]; assert.equal(r.seat, 0);
    g.world.time = r.at + 0.001; updatePowerEffects(g.world, 0.05);
    assert.equal(g.world.rockets.length, 0); assert.equal(ally.hp, 100);
    assert.ok(Math.abs(b.hp - (100 - (i + 1) * POWERS.fireball.maxDamage * 0.5)) < 1e-8);
  }
  assert.equal(a.weapon, 'none'); assert.equal(a.ammo, 0);
});

test('confirmed gun hits have a 20% critical boundary, exactly double damage; Strength multiplies once', () => {
  function hit(criticalRoll, bonus = 0, weapon = 'gun') {
    const g = fresh(), [a, b] = duel(g, weapon); a.damageBonus = bonus;
    let n = 0; const rolls = [0.1, criticalRoll, 0.5]; g.world.rng = () => rolls[n++] ?? 0.5;
    resolveCombat(g.world, 0.05); return { damage: b.lastDamage, critical: b.lastCritical, event: g.world.events.find(e => e.type === 'gunshot') };
  }
  for (const weapon of ['gun', 'shotgun']) {
    const plain = hit(0.2, 0, weapon), crit = hit(0.199999, 0, weapon), boosted = hit(0.199999, 0.5, weapon);
    assert.equal(plain.critical, false); assert.equal(crit.critical, true); assert.equal(crit.event.critical, true);
    assert.ok(Math.abs(crit.damage - plain.damage * 2) < 1e-9); assert.ok(Math.abs(boosted.damage - crit.damage * 1.5) < 1e-9);
  }
  assert.equal(COMBAT.headshotChance, 0.2);
});

test('Strength rolls 10-50% once, rejects stacking, and temporary entities clear at dusk', () => {
  for (const [roll, expected] of [[0, 0.1], [0.99999, 0.5]]) {
    const g = fresh(), v = own(g); const original = g.world.rng; g.world.rng = () => roll;
    assert.ok(castPower(g, 0, 'strength', { villagerId: v.id }).ok); assert.equal(v.damageBonus, expected);
    g.power[0] = 3; g.usedPowers[0] = []; assert.equal(castPower(g, 0, 'strength', { villagerId: v.id }).ok, false);
    g.world.rng = original;
    g.world.blackoutUntil = 99; g.world.weaponDrops.push({ id: 'test', x: 1800, y: 1000 }); v.frozenUntil = 99;
    g.simElapsed = g.simSeconds; updateGame(g, 0.05);
    assert.equal(v.damageBonus, 0); assert.equal(v.frozenUntil, 0); assert.equal(g.world.blackoutUntil, 0);
    for (const key of ['weaponDrops', 'whirlpools', 'rockets']) assert.equal(g.world[key].length, 0);
  }
});

test('Time Bomb has the existing 12-second fuse and ally damage immunity', () => {
  const g = fresh(), a = at(own(g)), b = at(foe(g));
  assert.ok(castPower(g, 0, 'timebomb', { x: a.x, y: a.y }).ok);
  g.world.time = 21.999; updateBombs(g.world); assert.equal(b.hp, 100);
  g.world.time = 22; updateBombs(g.world); assert.equal(a.hp, 100); assert.equal(b.alive, false);
  assert.equal(g.world.events.find(e => e.type === 'kill').source.id, 'timebomb');
  const late = fresh(); late.simElapsed = late.simSeconds - 11.95;
  const before = authoritativeState(late);
  assert.equal(castPower(late, 0, 'timebomb', { x: 950, y: 570 }).ok, false);
  assert.deepEqual(authoritativeState(late), before);
});

test('new powers validate gates, resources and normalized drag direction without side effects', () => {
  const g = fresh(); assert.equal(Object.keys(POWER_DEFS).length, 21); assert.equal(POWER_DEFS.lightning.cost, 1);
  for (const id of ['timebomb', 'whirlpool', 'launcher']) { g.turn = 4; assert.equal(validatePower(g, 0, id, { x: 950, y: 570 }).ok, false); }
  g.turn = 5; const v = own(g);
  const args = { villagerId: v.id, tx: 950, ty: 570, malicious: 12 };
  assert.ok(validatePower(g, 0, 'gust', args).ok);
  assert.deepEqual(normalizePowerArgs('gust', args), { villagerId: v.id, tx: 950, ty: 570 });
  assert.ok(castPower(g, 0, 'gust', args).ok); assert.ok(v.kx || v.ky);
  const before = authoritativeState(g);
  assert.equal(castPower(g, 0, 'launcher', { x: NaN, y: 5 }).ok, false);
  assert.deepEqual(authoritativeState(g), before);
});

test('new typed powers resolve, dawn bombs remain cards, rival healing is rejected', () => {
  const g = fresh(); own(g).hp = 20;
  for (const [text, id] of [['time bomb at the plaza','timebomb'], ['blackout','blackout'], ['whirlpool the tides','whirlpool'], ['rocket launcher at the park','launcher'], ['freeze the tides','freeze'], ['strength my people','strength']]) {
    const p = parseCommand(text, g, 0); assert.ok(p.ok, text); assert.equal(p.actions[0].kind, 'power', text);
    const r = resolvePower(g, 0, p.actions[0].power); assert.ok(r.ok, text); assert.equal(r.id, id);
  }
  assert.equal(resolvePower(g, 0, { id: 'miracle', villagerId: foe(g).id }).ok, false);
  g.phase = 'command'; assert.equal(parseCommand('plant a time bomb at the plaza', g, 0).actions[0].kind, 'card');
});

test('recap records rocket/freeze/Strength visuals and restores exact authoritative state', () => {
  const g = fresh(), v = own(g); v.weapon = 'rocket'; v.ammo = 3; v.damageBonus = 0.37; v.frozenUntil = 14;
  g.world.blackoutUntil = 18; g.world.weaponDrops.push({ id: 'drop', x: 500, y: 500 });
  g.recorder.capture(g.world); g.world.time += 0.1; g.recorder.capture(g.world); g.phase = 'recap';
  const before = authoritativeState(g), replay = new Replay({ game: g, camera: { cut() {}, hold: 0 } });
  replay.play({ t0: 10, t1: 10.1, x: v.x, y: v.y });
  assert.ok(replay.active); assert.equal(v.weapon, 'rocket'); assert.equal(replay.visuals.blackoutUntil, 18);
  replay.stop(); assert.deepEqual(authoritativeState(g), before);
});

test('neutral rocket kills and eliminated Whirlpool casters have valid recorded recap attribution', () => {
  for (const neutral of [true, false]) {
    const g = fresh(), victim = at(foe(g)); victim.hp = 1;
    if (neutral) {
      const shooter = at(g.world.villagers.find(v => v.faction < 0), 900, 570);
      Object.assign(shooter, { weapon: 'rocket', ammo: 1, escalation: 2, state: 'attack', targetId: victim.id, cd: 0 });
      resolveCombat(g.world, 0.05); g.world.time += 1; updatePowerEffects(g.world, 1);
    } else {
      castPower(g, 0, 'whirlpool', { x: victim.x, y: victim.y });
      g.world.villagers.filter(v => v.faction === 0).forEach(v => { v.alive = false; v.hp = 0; });
      g.world.time += 1; updatePowerEffects(g.world, 1);
    }
    const kill = g.world.events.find(e => e.type === 'kill' && e.victimId === victim.id);
    assert.ok(kill); const cause = attributeKill(g, 5, kill);
    assert.equal(cause.seat, neutral ? -1 : 0);
    assert.match(cause.reason, neutral ? /neutrals fired the rocket/ : /Embers cast Whirlpool/);
    assert.doesNotThrow(() => buildHighlights(g, 5));
  }
});
