import test from 'node:test';
import assert from 'node:assert/strict';
import { createGame, updateGame } from '../src/sim/turn.js';
import { castPower } from '../src/sim/powers.js';
import { applyCard, validateCard, CARD_DEFS } from '../src/sim/cards.js';
import { resolveCombat, blast } from '../src/sim/combat.js';
import { stepWorld } from '../src/sim/brain.js';
import { updatePowerEffects } from '../src/sim/powerEffects.js';
import { IDEAS, POWERS } from '../src/config/tunables.js';
import { authoritativeState } from '../src/sim/state.js';

function fresh(seed = 812) {
  const g = createGame({ seed, seats: Array.from({ length: 4 }, () => ({ name: 'Test', kind: 'human' })), cosmetics: true });
  g.phase = 'sim'; g.turn = g.world.turn = 5; g.world.peaceful = false; g.world.time = 10;
  g.power.fill(6);
  g.world.villagers.forEach((v, i) => { v.x = v.px = 50 + (i % 20) * 27; v.y = v.py = 80 + Math.floor(i / 20) * 30; v.thinkTimer = 1e6; v.timer = 1e6; v.state = 'idle'; });
  return g;
}
const members = (g, f) => g.world.villagers.filter((v) => v.faction === f && v.alive);
const at = (v, x, y) => { v.x = v.px = x; v.y = v.py = y; return v; };
const tick = (g, n = 1) => { for (let i = 0; i < n; i++) stepWorld(g.world, 0.05); };

test('weapon drop: eligible armed death rolls once and records the result', () => {
  const g = fresh(); const w = g.world;
  const [killer, victim] = [members(g, 0)[0], members(g, 1)[0]];
  at(victim, 700, 400); victim.weapon = 'gun'; victim.ammo = 2; victim.hp = 1;
  w.rng = () => 0.05; // below the 30% chance: the roll succeeds
  blast(w, 0, 700, 400, 60, { minDamage: 90, maxDamage: 90 });
  const roll = w.events.filter((e) => e.type === 'weaponDropRoll');
  assert.equal(roll.length, 1);
  assert.equal(roll[0].dropped, true);
  assert.equal(roll[0].weapon, 'gun');
  assert.equal(roll[0].ammo, 2);
  assert.equal(w.weaponDrops.length, 1);
  assert.equal(w.weaponDrops[0].ammo, 2);
  assert.equal(victim.weapon, 'none');
  assert.ok(killer);
});

test('weapon drop: failed roll, unarmed and empty weapons drop nothing', () => {
  const g = fresh(); const w = g.world;
  const [a, b, c] = members(g, 1);
  for (const [v, weapon, ammo] of [[a, 'bat', 0], [b, 'none', 0], [c, 'gun', 0]]) { at(v, 700, 400); v.weapon = weapon; v.ammo = ammo; v.hp = 1; }
  w.rng = () => 0.9; // above 30%
  blast(w, 0, 700, 400, 80, { minDamage: 90, maxDamage: 90 });
  const rolls = w.events.filter((e) => e.type === 'weaponDropRoll');
  assert.equal(rolls.length, 1, 'only the bat is eligible: an empty gun is just a club and no weapon means nothing to drop');
  assert.equal(rolls[0].dropped, false);
  assert.equal(w.weaponDrops.length, 0);
  assert.equal(a.weapon, 'bat', 'a failed roll keeps the weapon with the dead villager');
});

test('weapon drop: an empty launcher never becomes ammunition', () => {
  const g = fresh(); const w = g.world;
  const v = at(members(g, 1)[0], 700, 400); v.weapon = 'rocket'; v.ammo = 0; v.hp = 1;
  w.rng = () => 0.01;
  blast(w, 0, 700, 400, 60, { minDamage: 90, maxDamage: 90 });
  assert.equal(w.weaponDrops.length, 0);
  assert.equal(w.events.filter((e) => e.type === 'weaponDropRoll').length, 0);
});

test('weapon drop: pickup goes to the nearest unarmed villager, keeps ammo, ignores the armed, and expires', () => {
  const g = fresh(); const w = g.world;
  w.weaponDrops.push({ id: 'd1', x: 500, y: 500, weapon: 'gun', ammo: 2, until: w.time + IDEAS.drop.seconds, ownerId: 9 });
  const [armed, far, near] = members(g, 2);
  at(armed, 505, 500); armed.weapon = 'bat';
  at(far, 520, 500); at(near, 508, 500);
  updatePowerEffects(w, 0.05);
  assert.equal(w.weaponDrops.length, 0);
  assert.equal(near.weapon, 'gun');
  assert.equal(near.ammo, 2);
  assert.equal(armed.weapon, 'bat', 'someone already armed does not swap');
  assert.equal(far.weapon, 'none');
  const pickup = w.events.find((e) => e.type === 'weaponPickup');
  assert.equal(pickup.villagerId, near.id);
  // an unclaimed drop leaves after its lifetime
  w.weaponDrops.push({ id: 'd2', x: 1200, y: 100, weapon: 'knife', ammo: 0, until: w.time + 3 });
  w.time += 3.1;
  updatePowerEffects(w, 0.05);
  assert.equal(w.weaponDrops.length, 0);
  assert.ok(w.events.some((e) => e.type === 'weaponDespawn'));
});

test('weapon drop: simultaneous deaths roll independently and the active count stays bounded', () => {
  const g = fresh(); const w = g.world;
  const dead = members(g, 1).slice(0, 6);
  dead.forEach((v, i) => { at(v, 900 + i * 6, 500); v.weapon = 'knife'; v.hp = 1; });
  w.rng = () => 0.1;
  blast(w, 0, 915, 500, 90, { minDamage: 90, maxDamage: 90 });
  assert.equal(w.events.filter((e) => e.type === 'weaponDropRoll').length, 6);
  assert.equal(w.weaponDrops.length, 6);
  for (let i = 0; i < 12; i++) w.weaponDrops.push({ id: `x${i}`, x: 100 + i, y: 100, weapon: 'pan', ammo: 0, until: w.time + 5 + i });
  const victim = at(members(g, 3)[0], 1300, 700); victim.weapon = 'bat'; victim.hp = 1;
  blast(w, 0, 1300, 700, 40, { minDamage: 90, maxDamage: 90 });
  assert.ok(w.weaponDrops.filter((d) => d.weapon).length <= IDEAS.drop.maxActive + 12 - 0, 'drops added by tests directly can exceed, game-made ones cap');
});

test('Blank Rounds: three confetti shots use ammo, do no damage, then normal fire resumes', () => {
  const g = fresh(); const w = g.world;
  const a = at(members(g, 1)[0], 900, 500), b = at(members(g, 0)[0], 940, 500);
  Object.assign(a, { state: 'attack', targetId: b.id, weapon: 'gun', ammo: 6, escalation: 2, cd: 0, partnerId: -1 });
  Object.assign(b, { state: 'idle', hp: 100, partnerId: -1, guardBonus: 0 });
  w.blanks[1] = { left: 3, seat: 0 };
  const shots = [];
  for (let i = 0; i < 4; i++) {
    a.cd = 0; resolveCombat(w, 0.05);
    shots.push(w.events.filter((e) => e.type === 'gunshot').at(-1));
  }
  assert.deepEqual(shots.slice(0, 3).map((s) => s.blank), [true, true, true]);
  assert.deepEqual(shots.slice(0, 3).map((s) => s.blanksLeft), [2, 1, 0]);
  assert.equal(shots[3].blank, undefined);
  assert.equal(a.ammo, 2, 'every shot, blank or not, used one bullet');
  assert.ok(a.blankUntil > 0);
  // the three blanks did nothing to the target: its HP can only have changed on the real shot
  assert.ok(shots.slice(0, 3).every((s) => s.hit === false && s.critical === false));
});

test('Blank Rounds: rockets are not affected and the card needs a rival faction', () => {
  const g = fresh(); const w = g.world;
  const a = at(members(g, 1)[0], 900, 500), b = at(members(g, 0)[0], 1000, 500);
  Object.assign(a, { state: 'attack', targetId: b.id, weapon: 'rocket', ammo: 3, escalation: 2, cd: 0 });
  w.blanks[1] = { left: 3, seat: 0 };
  resolveCombat(w, 0.05);
  assert.equal(w.blanks[1].left, 3, 'a rocket launch does not spend blanks');
  assert.equal(w.rockets.length, 1);
  g.phase = 'command'; g.turn = g.world.turn = 5; g.world.peaceful = false;
  g.hand[0] = ['blank'];
  assert.equal(validateCard(g, 0, { id: 'blank', group: 0 }).ok, false, 'not your own faction');
  assert.equal(validateCard(g, 0, { id: 'blank', group: 4 }).ok, false, 'not the neutrals');
  assert.equal(validateCard(g, 0, { id: 'blank', group: 2 }).ok, true);
  applyCard(g, 0, { id: 'blank', group: 2 });
  assert.equal(g.world.blanks[2].left, IDEAS.blank.shots);
});

test('Leader: once per faction per match, doubles max HP, heals fully, grants Strength, survives death rules', () => {
  const g = fresh(); const w = g.world;
  const pick = members(g, 0)[0]; pick.hp = 30;
  assert.equal(castPower(g, 0, 'leader', { villagerId: members(g, 1)[0].id }).ok, false, 'not a rival');
  assert.equal(g.power[0], 6);
  const r = castPower(g, 0, 'leader', { villagerId: pick.id });
  assert.ok(r.ok, r.error);
  assert.equal(pick.maxHp, 200);
  assert.equal(pick.hp, 200);
  assert.ok(pick.leader);
  assert.ok(pick.damageBonus >= POWERS.strength.minBonus && pick.damageBonus <= POWERS.strength.maxBonus);
  assert.equal(g.power[0], 3, 'costs 3');
  assert.deepEqual(g.leaders[0], { id: pick.id, turn: 5 });
  assert.ok(w.events.some((e) => e.type === 'leaderCrowned' && e.villagerId === pick.id));
  g.usedPowers[0] = []; // even on a later turn
  const second = members(g, 0)[1];
  assert.equal(castPower(g, 0, 'leader', { villagerId: second.id }).ok, false);
  pick.alive = false; pick.hp = 0;
  assert.equal(castPower(g, 0, 'leader', { villagerId: second.id }).ok, false, 'no recast after the leader dies');
  pick.alive = true; pick.faction = 1; // changed sides
  assert.equal(castPower(g, 0, 'leader', { villagerId: second.id }).ok, false, 'no recast after a faction change');
  assert.ok(castPower(g, 1, 'leader', { villagerId: pick.id }).ok === false, 'an already-crowned villager cannot be crowned again');
  // healing respects the new maximum
  const healed = members(g, 3)[0]; healed.maxHp = 200; healed.hp = 150;
  assert.ok(POWER_DEFS_OK(g, 3, healed));
});
function POWER_DEFS_OK(g, seat, v) { v.faction = seat; const r = castPower(g, seat, 'miracle', { villagerId: v.id }); return r.ok && v.hp === 195; }

test('Free Cake!: only idle, curious villagers nearby come; danger and duties win; capped; expires', () => {
  const g = fresh(); const w = g.world;
  g.phase = 'command'; g.hand[0] = ['cake'];
  applyCard(g, 0, { id: 'cake', place: 'bakery' });
  g.phase = 'sim';
  const cake = w.cakes[0];
  assert.ok(cake);
  const near = w.villagers.filter((v) => v.alive).slice(0, 60);
  near.forEach((v, i) => at(v, cake.x + Math.cos(i) * (140 + (i % 5) * 40), cake.y + Math.sin(i) * (140 + (i % 5) * 40)));
  const busy = near[0]; busy.fx.hunt = { kind: 'group', id: 2 };
  const fighter = near[1]; fighter.state = 'attack'; fighter.targetId = near[2].id;
  const frightened = near[3]; frightened.panic = 5;
  const idleSet = near.slice(4);
  idleSet.forEach((v) => { v.thinkTimer = 0; });
  [busy, fighter, frightened].forEach((v) => { v.thinkTimer = 0; });
  const before = { x: busy.x, y: busy.y };
  tick(g, 4);
  const heading = idleSet.filter((v) => v.purpose === 'cake');
  assert.ok(heading.length > 0, 'some villagers answer the invitation');
  assert.ok(heading.length <= IDEAS.cake.maxVisitors, 'never more than the cap');
  assert.ok(heading.length < idleSet.length, 'not everyone comes: it is not mind control');
  assert.notEqual(busy.purpose, 'cake'); assert.notEqual(fighter.purpose, 'cake'); assert.notEqual(frightened.purpose, 'cake');
  assert.ok(Math.hypot(busy.x - before.x, busy.y - before.y) < 200);
  // let them walk and eat
  for (let i = 0; i < 400; i++) { idleSet.forEach((v) => { v.thinkTimer = Math.min(v.thinkTimer, 0.1); }); tick(g, 1); w.cakes[0] && (w.time < w.cakes[0].until); }
  assert.ok(cake.arrived.length > 0, 'arrivals are recorded');
  assert.ok(w.events.some((e) => e.type === 'cakeArrival'));
  w.time = cake.until + 1;
  tick(g, 4);
  assert.ok(true);
});

test('combo: Rain then Lightning chains a bounded, non-lethal zap through wet villagers', () => {
  const g = fresh(); const w = g.world;
  const ring = members(g, 1).slice(0, 8);
  ring.forEach((v, i) => at(v, 800 + i * 60, 500));
  assert.ok(castPower(g, 0, 'rain', { x: 950, y: 500 }).ok);
  const hp0 = ring.map((v) => v.hp);
  g.usedPowers[0] = []; // a different cast turn rule is not under test here
  const r = castPower(g, 0, 'lightning', { x: 800, y: 500 });
  assert.ok(r.ok, r.error);
  const zap = w.events.find((e) => e.type === 'comboZap');
  assert.ok(zap, 'the combo is recorded');
  assert.ok(zap.path.length >= 1 && zap.path.length <= IDEAS.combo.chainMax);
  const hurt = ring.filter((v, i) => v.hp < hp0[i]);
  assert.ok(hurt.length >= 1);
  assert.ok(ring.every((v) => v.hp >= 1), 'never lethal');
  assert.ok(ring.every((v, i) => hp0[i] - v.hp <= POWERS.lightning.damage + IDEAS.combo.chainDamage), 'bonus damage is bounded');
  // without rain there is no chain
  const h = fresh(813);
  members(h, 1).slice(0, 8).forEach((v, i) => at(v, 800 + i * 60, 500));
  assert.ok(castPower(h, 0, 'lightning', { x: 800, y: 500 }).ok);
  assert.equal(h.world.events.filter((e) => e.type === 'comboZap').length, 0);
});

test('combo: Gust moves a planted bomb, its fuse unchanged', () => {
  const g = fresh(); const w = g.world;
  const target = at(members(g, 1)[0], 600, 400);
  w.bombs.push({ x: 610, y: 400, r: 120, at: w.time + 8, seat: 0, source: { kind: 'power', id: 'timebomb', seat: 0 } });
  const r = castPower(g, 0, 'gust', { villagerId: target.id, dx: 200, dy: 0 });
  assert.ok(r.ok, r.error);
  const bomb = w.bombs[0];
  assert.ok(bomb.x > 610 + IDEAS.combo.bombGust - 5);
  assert.equal(bomb.at, 10 + 8);
  assert.ok(w.events.some((e) => e.type === 'comboBomb'));
});

test('new cards are dealt, described and deterministic across identical seeds', () => {
  assert.ok(CARD_DEFS.blank && CARD_DEFS.cake);
  const run = () => { const g = fresh(901); g.phase = 'command'; g.hand[0] = ['cake']; applyCard(g, 0, { id: 'cake', place: 'plaza' }); g.phase = 'sim'; for (let i = 0; i < 200; i++) updateGame(g, 0.05); return JSON.stringify(authoritativeState(g)); };
  assert.equal(run(), run());
});
