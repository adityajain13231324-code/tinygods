import test from 'node:test';
import assert from 'node:assert/strict';
import { createGame, updateGame } from '../src/sim/turn.js';
import { stepWorld } from '../src/sim/brain.js';
import { castPower } from '../src/sim/powers.js';
import { applyCard } from '../src/sim/cards.js';
import { applyOrders } from '../src/sim/orders.js';
import { resolveCombat, updateBombs } from '../src/sim/combat.js';
import { igniteNear } from '../src/sim/hazards.js';
import { buildAwards, replayable } from '../src/sim/awards.js';
import { clipCaption } from '../src/render/clip.js';
import { IDEAS } from '../src/config/tunables.js';

const seats = (kind = 'human') => Array.from({ length: 4 }, (_, i) => ({ name: `P${i}`, kind, personality: 'opportunist' }));
function fresh(opts = {}, seed = 71) {
  const g = createGame({ seed, seats: seats(), cosmetics: false, ...opts });
  g.phase = 'sim'; g.turn = g.world.turn = 6; g.world.peaceful = false; g.world.time = 10; g.power.fill(9);
  g.world.villagers.forEach((v, i) => { v.x = v.px = 40 + (i % 30) * 6; v.y = v.py = 40 + Math.floor(i / 30) * 6; v.thinkTimer = 1e6; v.timer = 1e6; v.state = 'idle'; });
  return g;
}
const of = (g, f) => g.world.villagers.filter((v) => v.faction === f && v.alive);
const at = (v, x, y) => { v.x = v.px = x; v.y = v.py = y; return v; };
const tick = (g, n = 1) => { for (let i = 0; i < n; i++) stepWorld(g.world, 0.05); };
const sane = (g) => g.world.villagers.every((v) => Number.isFinite(v.x) && Number.isFinite(v.hp) && v.hp <= v.maxHp + 1e-6);

test('Blank Rounds never consume an Aegis mirror, and a leader keeps a 200 HP ceiling under every effect', () => {
  const g = fresh(); const w = g.world;
  const shooter = at(of(g, 1)[0], 900, 500), target = at(of(g, 0)[0], 940, 500);
  Object.assign(shooter, { state: 'attack', targetId: target.id, weapon: 'gun', ammo: 6, escalation: 2, cd: 0 });
  assert.ok(castPower(g, 0, 'aegis', { villagerId: target.id }).ok);
  w.blanks[1] = { left: 3, seat: 0 };
  for (let i = 0; i < 3; i++) { shooter.cd = 0; resolveCombat(w, 0.05); }
  assert.ok(target.aegisUntil > w.time, 'the mirror is intact after three blanks');
  const lead = of(g, 0)[1];
  assert.ok(castPower(g, 0, 'leader', { villagerId: lead.id }).ok);
  at(lead, 600, 300);
  assert.ok(castPower(g, 1, 'whirlpool', { x: 600, y: 300 }).ok);
  tick(g, 80);
  assert.ok(sane(g));
  assert.ok(lead.hp <= 200);
  lead.hp = 150;
  g.usedPowers.forEach((u) => u.splice(0));
  assert.ok(castPower(g, 0, 'miracle', { villagerId: lead.id }).ok);
  assert.ok(lead.hp <= 200 && lead.hp >= 190, `heal stops at the leader's own maximum (${lead.hp})`);
});

test('a delivery crate can be pushed by Gust and still explodes with nobody credited', () => {
  const g = fresh({ mode: 'explosive' }); const w = g.world;
  const v = at(of(g, 1)[0], 700, 500);
  w.bombs.push({ x: 705, y: 500, r: IDEAS.modes.radius, at: w.time + 3, seat: -1, delivery: true, place: 'plaza', source: { kind: 'mode', id: 'bomb', seat: -1, actionId: 'x' } });
  const victim = at(of(g, 2)[0], 705 + IDEAS.combo.bombGust, 500);
  victim.hp = 5;
  assert.ok(castPower(g, 0, 'gust', { villagerId: v.id, dx: 100, dy: 0 }).ok);
  assert.ok(w.events.some((e) => e.type === 'comboBomb'));
  w.time += 3.1;
  updateBombs(w);
  assert.equal(victim.alive, false, 'the pushed bomb reached the villager standing where it landed');
  const kill = w.events.find((e) => e.type === 'kill' && e.victimId === victim.id);
  assert.equal(kill.killerId, -1);
  assert.equal(kill.source.kind, 'mode');
});

test('rain puts out a fire mid-burn, a wet bolt never relights it, a dry bolt does', () => {
  const g = fresh({ layout: 'farms' }); const w = g.world; const p = w.grass[0];
  igniteNear(w, p.x, p.y, 10, 0, 't');
  w.time = p.flameAt + 0.1;
  tick(g);
  assert.equal(p.state, 'burning');
  assert.ok(castPower(g, 1, 'rain', { x: p.x, y: p.y }).ok);
  tick(g);
  assert.equal(p.state, 'wet');
  g.usedPowers.forEach((u) => u.splice(0));
  assert.ok(castPower(g, 1, 'lightning', { x: p.x, y: p.y }).ok);
  assert.equal(p.state, 'wet', 'a bolt in the rain does not relight wet grass');
  const q = w.grass[1];
  g.usedPowers.forEach((u) => u.splice(0));
  assert.ok(castPower(g, 1, 'lightning', { x: q.x, y: q.y }).ok);
  assert.equal(q.state, 'smolder', 'a dry bolt starts a warning smoulder first');
});

test('cake lures ignore frozen villagers and anyone whose fallback order is active', () => {
  const g = fresh(); const w = g.world;
  g.phase = 'command';
  applyCard(g, 0, { id: 'cake', place: 'plaza' });
  g.phase = 'sim';
  const pz = w.places.find((p) => p.id === 'plaza');
  const [frozen, retreating, free] = of(g, 2).map((v, i) => at(v, pz.x + 100 + i * 20, pz.y + 80));
  frozen.frozenUntil = w.time + 30;
  retreating.whenActive = true;
  retreating.fx.when = { cond: 'hurt', retreat: 'park', verb: 'protect' };
  [frozen, retreating, free].forEach((v) => { v.thinkTimer = 0; });
  w.cakes[0].interested = { [frozen.id]: true, [retreating.id]: true, [free.id]: true };
  tick(g, 4);
  assert.notEqual(retreating.purpose, 'cake', 'a retreating villager is not lured by cake');
  assert.equal(frozen.x, pz.x + 100, 'frozen villagers do not move');
});

test('Random Powers pools never include the Leader; One Villager mode survives every card and order', () => {
  const g = createGame({ seed: 5, seats: seats(), mode: 'random' });
  for (const pool of g.randomPowers) {
    assert.equal(pool.length, IDEAS.modes.randomCount);
    assert.ok(!pool.includes('leader'));
  }
  const one = fresh({ mode: 'one' });
  one.phase = 'command';
  for (const card of [{ id: 'blank', group: 1 }, { id: 'cake', place: 'pond' }, { id: 'recruit' }, { id: 'rally' }, { id: 'treaty', group: 2 }]) applyCard(one, 0, card);
  applyOrders(one.world, 0, [{ verb: 'formation', target: { kind: 'style', id: 'centre' }, strength: 1 }, { verb: 'protect', target: { kind: 'group', id: 0 }, strength: 2, when: { cond: 'outnumbered', retreat: 'park' } }]);
  one.phase = 'sim';
  tick(one, 600);
  assert.ok(sane(one));
});

test('awards: a replay is offered only for the recorded turn, with a caption built from real events', () => {
  const g = createGame({ seed: 8, seats: seats('bot'), cosmetics: false });
  let guard = 0;
  while (g.phase !== 'ended' && guard++ < 80000) {
    updateGame(g, g.phase === 'command' ? 30 : 0.05);
    if (g.turn >= 5 && g.phase === 'recap') break;
  }
  const awards = buildAwards(g.world, g.recorder, g.turn);
  assert.ok(awards.length > 0);
  for (const a of awards) {
    assert.equal(a.replayable, replayable(g.recorder, a.moment, g.turn));
    if (a.moment && a.moment.turn !== g.turn) assert.equal(a.replayable, false, 'an older day has no recording');
  }
  const ev = g.world.events.filter((e) => e.type === 'kill' || e.type === 'gunshot').at(-1);
  if (ev) {
    const c = clipCaption(g.world, { turn: ev.turn, t0: ev.time - 2, t1: ev.time + 2 });
    assert.ok(c.caption.length > 10 && c.name);
  }
});

test('every card and power in every challenge mode leaves the world finite and capped', () => {
  for (const mode of ['standard', 'armed', 'explosive', 'random', 'one']) for (const layout of ['classic', 'canal', 'hill']) {
    const g = fresh({ mode, layout }, 90 + mode.length); const w = g.world;
    g.phase = 'command';
    for (const id of ['blank', 'cake', 'forged', 'bomb', 'rally', 'medic', 'kidnap', 'alarm']) {
      const def = { id, group: ['blank', 'forged', 'kidnap', 'alarm'].includes(id) ? 1 : -1, place: 'plaza' };
      try { applyCard(g, 0, def); } catch (e) { assert.fail(`${mode}/${layout} card ${id}: ${e.message}`); }
    }
    g.phase = 'sim';
    g.power.fill(9);
    for (const id of ['miracle', 'rain', 'lightning', 'fireball', 'gust', 'freeze', 'strength', 'blackout', 'whirlpool', 'launcher', 'leader', 'timebomb', 'disarm', 'earthquake', 'tornado']) {
      g.usedPowers.forEach((u) => u.splice(0));
      try { castPower(g, 0, id, { villagerId: of(g, 0)[0]?.id ?? w.villagers.find((v) => v.alive).id, x: 900, y: 500, group: 1, dx: 90, dy: 10 }); } catch (e) { assert.fail(`${mode}/${layout} power ${id}: ${e.message}`); }
    }
    tick(g, 400);
    assert.ok(sane(g), `${mode}/${layout} stays finite`);
    assert.ok(w.goods.length <= IDEAS.hazard.maxGoods && w.weaponDrops.filter((d) => d.weapon).length <= IDEAS.drop.maxActive);
  }
});
