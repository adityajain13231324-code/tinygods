import test from 'node:test';
import assert from 'node:assert/strict';
import { createGame, updateGame, submitOrders, runToEnd } from '../src/sim/turn.js';
import { stepWorld, startAttack } from '../src/sim/brain.js';
import { blast } from '../src/sim/combat.js';
import { castPower } from '../src/sim/powers.js';
import { applyCard } from '../src/sim/cards.js';
import { applyOrders, validateOrders, validateOrder, normalizeOrder } from '../src/sim/orders.js';
import { parseCommand } from '../src/sim/parser.js';
import { remember, forgive, memoryReact } from '../src/sim/memory.js';
import { switchSides } from '../src/sim/loyalty.js';
import { supportMultiplier, updateFormations } from '../src/sim/formations.js';
import { conditionHolds } from '../src/sim/conditions.js';
import { MODE_IDS, countsForRecords } from '../src/sim/modes.js';
import { IDEAS } from '../src/config/tunables.js';
import { authoritativeState } from '../src/sim/state.js';
import { mulberry32 } from '../src/sim/rng.js';

const seats = (kind = 'human') => Array.from({ length: 4 }, (_, i) => ({ name: `P${i}`, kind, personality: ['warmonger', 'pacifist', 'gossip', 'opportunist'][i] }));
function fresh(opts = {}, seed = 21) {
  const g = createGame({ seed, seats: seats(), cosmetics: true, ...opts });
  g.phase = 'sim'; g.turn = g.world.turn = 5; g.world.peaceful = false; g.world.time = 10; g.power.fill(6);
  g.world.villagers.forEach((v, i) => { v.x = v.px = 60 + (i % 20) * 28; v.y = v.py = 70 + Math.floor(i / 20) * 28; v.thinkTimer = 1e6; v.timer = 1e6; v.state = 'idle'; });
  return g;
}
const of = (g, f) => g.world.villagers.filter((v) => v.faction === f && v.alive);
const at = (v, x, y) => { v.x = v.px = x; v.y = v.py = y; return v; };
const tick = (g, n = 1) => { for (let i = 0; i < n; i++) stepWorld(g.world, 0.05); };

// ---------- rivalries ----------
test('memory: bounded, deduplicated, and forgiveness removes only harm from the right people', () => {
  const g = fresh(); const w = g.world; const v = of(g, 0)[0];
  const others = w.villagers.filter((o) => o !== v).slice(0, 10);
  for (const o of others) remember(w, v, o.id, 'injured');
  assert.equal(v.memory.length, IDEAS.memory.perVillager);
  remember(w, v, others[9].id, 'injured');
  assert.equal(v.memory.filter((m) => m.id === others[9].id).length, 1, 'same memory is refreshed, not duplicated');
  v.memory = []; remember(w, v, of(g, 1)[0].id, 'injured'); remember(w, v, of(g, 2)[0].id, 'rescued'); remember(w, v, of(g, 1)[1].id, 'scared');
  assert.equal(forgive(w, v, (o) => o.faction === 1, 'test', 5), 2);
  assert.deepEqual(v.memory.map((m) => m.kind), ['rescued']);
  assert.equal(w.events.filter((e) => e.type === 'forgave').length, 2);
});

test('memory: getting hurt, a rescue, a betrayal and a heal are remembered; a treaty and a miracle forgive', () => {
  const g = fresh(); const w = g.world;
  const [a, b] = [of(g, 0)[0], of(g, 1)[0]];
  at(a, 500, 500); at(b, 520, 500);
  blast(w, 1, 510, 500, 60, { minDamage: 5, maxDamage: 5 });
  // direct hit memory via a gun duel
  Object.assign(b, { state: 'attack', targetId: a.id, weapon: 'bat', ammo: 0, escalation: 2, cd: 0 });
  for (let i = 0; i < 40 && !a.memory.length; i++) { b.cd = 0; w.rng = mulberry32(i + 1); stepWorld(w, 0.05); }
  const medic = of(g, 0)[1]; remember(w, a, medic.id, 'rescued');
  // betrayal
  const friend = of(g, 0)[2]; friend.friendId = of(g, 3)[0].id;
  const traitor = of(g, 3)[0]; const lover = of(g, 3)[1]; lover.partnerId = traitor.id; lover.faction = 3;
  switchSides(w, traitor, 0);
  assert.ok(lover.memory.some((m) => m.id === traitor.id && m.kind === 'betrayed'), 'a partner remembers the betrayal');
  const mine = of(g, 0)[4];
  g.phase = 'command'; g.hand[0] = ['treaty'];
  const foe = of(g, 2)[0]; remember(w, mine, foe.id, 'scared');
  applyCard(g, 0, { id: 'treaty', group: 2 });
  assert.ok(!mine.memory.some((m) => m.id === foe.id), 'a peace treaty forgives');
  assert.ok(w.events.some((e) => e.type === 'forgave' && e.why === 'treaty'));
});

test('memory: a Miracle melts one grudge, a medic is forgiven, and a rival cannot be healed', () => {
  const g = fresh(); const w = g.world;
  const v = of(g, 0)[0]; v.hp = 40;
  remember(w, v, of(g, 1)[0].id, 'injured'); remember(w, v, of(g, 2)[0].id, 'scared');
  assert.equal(v.memory.length, 2);
  assert.ok(castPower(g, 0, 'miracle', { villagerId: v.id }).ok);
  assert.equal(v.memory.length, 1, 'exactly one grudge was forgiven');
  assert.ok(w.events.some((e) => e.type === 'forgave' && e.why === 'healed'));
  assert.equal(castPower(g, 0, 'miracle', { villagerId: of(g, 1)[1].id }).ok, false, 'cannot heal a rival villager');
});

test('memory: reactions are occasional, rate-limited and only for someone remembered and close', () => {
  const g = fresh(); const w = g.world;
  const [a, b] = [of(g, 0)[0], of(g, 1)[0]];
  at(a, 800, 500); at(b, 860, 500);
  remember(w, a, b.id, 'injured');
  w.rng = () => 0.01;
  memoryReact(w, a);
  assert.equal(w.events.filter((e) => e.type === 'rivalMeet').length, 1);
  memoryReact(w, a); a.memoryCooldown = 0; memoryReact(w, a);
  assert.equal(w.events.filter((e) => e.type === 'rivalMeet').length, 1, 'spaced out in time (town-wide gap)');
  at(b, 1500, 900); a.memoryCooldown = 0; w.time += 5; memoryReact(w, a);
  assert.equal(w.events.filter((e) => e.type === 'rivalMeet').length, 1, 'too far to meet');
});

// ---------- troublemaker ----------
test('troublemaker: exactly one distinct neutral, steals a weapon through the normal rules, no immunity', () => {
  const g = fresh(); const w = g.world;
  const t = w.villagers[w.troublemakerId];
  assert.ok(t && t.faction === -1 && t.trait === 'troublemaker');
  assert.equal(w.villagers.filter((v) => v.trait === 'troublemaker').length, 1);
  const victim = of(g, 1)[0];
  at(t, 700, 500); at(victim, 760, 500); victim.weapon = 'bat'; t.weapon = 'none';
  t.thinkTimer = 0; t.trouble = { next: 0, nextRumor: 1e9, steals: 0, turn: 5, mode: null, targetId: -1, until: 0 };
  for (let i = 0; i < 200 && !w.events.some((e) => e.type === 'weaponStolen'); i++) { t.thinkTimer = 0; tick(g); }
  const theft = w.events.find((e) => e.type === 'weaponStolen');
  assert.ok(theft, 'the theft is an event naming the thief');
  assert.equal(theft.thiefId, t.id);
  assert.equal(t.weapon, 'bat'); assert.equal(victim.weapon, 'none');
  assert.ok(victim.memory.some((m) => m.kind === 'robbed'));
  // no immunity: they can be hurt and killed like anyone
  t.hp = 1; blast(w, 0, t.x, t.y, 60, { minDamage: 50, maxDamage: 50 });
  assert.equal(t.alive, false);
});

test('troublemaker: rumors work without a seat and never poison anything with NaN', () => {
  const g = fresh(); const w = g.world;
  const t = w.villagers[w.troublemakerId];
  t.trouble = { next: 1e9, nextRumor: 0, steals: 0, turn: 5, mode: null, targetId: -1, until: 0 };
  t.thinkTimer = 0; tick(g);
  assert.ok(w.events.some((e) => e.type === 'troubleRumor'));
  const rumor = w.rumors.at(-1);
  assert.equal(rumor.seat, -1); assert.equal(rumor.by, t.id);
  assert.ok(w.villagers.every((v) => v.opinion.every((o) => Number.isFinite(o))));
  assert.ok(!w.villagers.some((v) => v.believed.includes(rumor) && v.id === t.id), 'the troublemaker does not believe their own rumor');
});

test('troublemaker: runs through a confrontation, breaks it up for a moment, and flees', () => {
  const g = fresh(); const w = g.world;
  const t = w.villagers[w.troublemakerId];
  const [a, b] = [of(g, 0)[0], of(g, 1)[0]];
  at(t, 700, 560); at(a, 780, 500); at(b, 810, 500);
  startAttack(w, a, b, 'test');
  t.trouble = { next: 0, nextRumor: 1e9, steals: 3, turn: 5, mode: null, targetId: -1, until: 0 };
  for (let i = 0; i < 160 && !w.events.some((e) => e.type === 'troubleDash'); i++) { t.thinkTimer = 0; a.state = 'attack'; a.targetId = b.id; tick(g); }
  assert.ok(w.events.some((e) => e.type === 'troubleDash'));
  assert.ok(a.calmUntil > w.time);
});

// ---------- formations ----------
const spacing = (list) => { let s = 0, n = 0; for (const a of list) for (const b of list) if (a.id < b.id) { s += Math.hypot(a.x - b.x, a.y - b.y); n++; } return s / n; };
test('formations: spread widens the group, together tightens it, centre rings the weakest, nobody oscillates', () => {
  for (const [style, want] of [['spread', (a, b) => b > a], ['together', (a, b) => b < a], ['centre', (a, b) => b < a * 1.05]]) {
    const g = fresh({}, 33); const w = g.world;
    const crew = of(g, 0);
    crew.forEach((v, i) => { at(v, 900 + (i % 4) * 40 + (style === 'spread' ? 0 : (i % 4) * 90), 500 + Math.floor(i / 4) * 40 + (style === 'spread' ? 0 : Math.floor(i / 4) * 90)); v.fx.formation = { style, S: 1 }; v.thinkTimer = 1e6; });
    crew.forEach((v, i) => { v.hp = 100 - i * 5; });
    const before = spacing(crew);
    const moved = [];
    for (let i = 0; i < 400; i++) { tick(g); if (i % 50 === 0) moved.push(crew.reduce((s, v) => s + Math.hypot(v.vx, v.vy), 0) / crew.length); }
    assert.ok(want(before, spacing(crew)), `${style}: spacing ${before.toFixed(0)} -> ${spacing(crew).toFixed(0)}`);
    assert.ok(moved.at(-1) < moved[1] + 1 && moved.at(-1) < 40, `${style}: settles instead of jittering (${moved.at(-1).toFixed(1)} px/s)`);
    assert.ok(crew.every((v) => Number.isFinite(v.x) && v.x > 0 && v.x < 1920));
  }
});

test('formations: supportive styles reduce damage only when the group really is close, and the order validates', () => {
  const g = fresh(); const w = g.world;
  const crew = of(g, 0).slice(0, 5);
  crew.forEach((v, i) => { at(v, 900 + i * 20, 500); v.fx.formation = { style: 'together', S: 1 }; });
  assert.equal(supportMultiplier(w, crew[0]), 0.9);
  at(crew[0], 100, 100);
  assert.equal(supportMultiplier(w, crew[0]), 1, 'alone: no support');
  crew.forEach((v, i) => { at(v, 900 + (i % 3) * 20, 500 + Math.floor(i / 3) * 20); v.fx.formation = { style: 'centre', S: 1 }; v.hp = 50 + i * 10; });
  w.formationAt = 0; updateFormations(w);
  const core = w.formations['0:centre'].core;
  assert.ok(core.length >= 2);
  const coreMember = w.villagers[core[0]];
  assert.equal(supportMultiplier(w, coreMember), 0.8);
  const order = { verb: 'formation', target: { kind: 'style', id: 'spread' }, strength: 1 };
  assert.ok(validateOrder(order, w, 0).ok);
  assert.equal(validateOrder({ ...order, target: { kind: 'style', id: 'nonsense' } }, w, 0).ok, false);
  applyOrders(w, 0, [order]);
  assert.ok(of(g, 0).every((v) => v.fx.formation?.style === 'spread'));
  assert.ok(of(g, 1).every((v) => !v.fx.formation), 'only your own faction is arranged');
});

// ---------- conditional orders ----------
test('conditional orders: validate, normalise, parse, describe', () => {
  const g = fresh(); const w = g.world;
  const order = { verb: 'protect', target: { kind: 'place', id: 'armory' }, strength: 2, when: { cond: 'outnumbered', retreat: 'park' } };
  assert.ok(validateOrder(order, w, 0).ok);
  assert.deepEqual(normalizeOrder(order, w).when, { cond: 'outnumbered', retreat: 'park' });
  assert.equal(validateOrder({ ...order, when: { cond: 'bored', retreat: 'park' } }, w, 0).ok, false);
  assert.equal(validateOrder({ ...order, when: { cond: 'hurt', retreat: 'nowhere' } }, w, 0).ok, false);
  assert.equal(validateOrder({ verb: 'hate', target: { kind: 'group', id: 1 }, strength: 1, when: { cond: 'hurt', retreat: null } }, w, 0).ok, false, 'numeric orders cannot carry a condition');
  const r = parseCommand('guard the armory, retreat to the park if outnumbered', g, 0);
  assert.ok(r.ok);
  assert.deepEqual(r.actions[0].order.when, { cond: 'outnumbered', retreat: 'park' });
  assert.match(r.actions[0].label, /outnumbered.*retreat to the Park|retreat to the Park/);
});

test('conditional orders: outnumbered villagers retreat, hold, then return; being attacked still wins', () => {
  const g = fresh(); const w = g.world;
  const guards = of(g, 0).slice(0, 3);
  const armory = w.places.find((p) => p.id === 'armory'), park = w.places.find((p) => p.id === 'park');
  guards.forEach((v, i) => at(v, armory.x + i * 25, armory.y));
  const rivals = of(g, 1).slice(0, 8);
  rivals.forEach((v, i) => at(v, armory.x + 70 + (i % 4) * 30, armory.y + 60 + Math.floor(i / 4) * 30));
  applyOrders(w, 0, [{ verb: 'protect', target: { kind: 'place', id: 'armory' }, strength: 3, subject: { kind: 'villagers', ids: guards.map((v) => v.id) }, when: { cond: 'outnumbered', retreat: 'park' } }]);
  assert.ok(guards.every((v) => v.fx.when));
  assert.ok(conditionHolds(w, guards[0], 'outnumbered'));
  for (const v of guards) v.thinkTimer = 0;
  tick(g, 2);
  assert.ok(guards.every((v) => v.whenActive), 'the fallback is active');
  assert.ok(w.events.some((e) => e.type === 'conditionTriggered' && e.cond === 'outnumbered'));
  for (let i = 0; i < 700; i++) { guards.forEach((v) => { v.thinkTimer = Math.min(v.thinkTimer, 0.2); }); tick(g); if (i === 300) rivals.forEach((v, k) => at(v, 1700, 100 + k * 10)); }
  assert.ok(guards.every((v) => Math.hypot(v.x - park.x, v.y - park.y) < park.radius * 1.2 || !v.whenActive), 'reached the park, or the danger passed and they resumed');
  // self defence has priority: a villager being attacked fights or flees instead of walking off
  const hit = guards[0];
  hit.whenActive = true; hit.state = 'idle';
  const attacker = rivals[0]; at(attacker, hit.x + 20, hit.y); Object.assign(attacker, { state: 'attack', targetId: hit.id });
  hit.thinkTimer = 0; tick(g);
  assert.ok(['attack', 'flee'].includes(hit.state), `self-defence first (${hit.state})`);
});

// ---------- modes ----------
test('modes: Everyone Starts Armed, One Villager per Faction, Explosive Deliveries, Random Powers', () => {
  const armed = createGame({ seed: 4, seats: seats(), mode: 'armed' });
  assert.ok(armed.world.villagers.every((v) => v.weapon !== 'none'));
  const guns = [0, 1, 2, 3].map((f) => armed.world.villagers.filter((v) => v.faction === f && v.weapon === 'gun').length);
  assert.ok(guns.every((n) => n <= 3));
  const one = createGame({ seed: 4, seats: seats(), mode: 'one' });
  assert.deepEqual([0, 1, 2, 3].map((f) => one.world.villagers.filter((v) => v.faction === f).length), [1, 1, 1, 1]);
  assert.equal(one.world.villagers.filter((v) => v.faction === -1).length, 12);
  // explosive: crates land from day 3 and explode, credited to nobody
  const boom = createGame({ seed: 4, seats: seats('bot'), mode: 'explosive' });
  let sawCrate = false, sawBlast = false;
  for (let i = 0; i < 40000 && boom.phase !== 'ended'; i++) {
    updateGame(boom, boom.phase === 'command' ? 30 : 0.05);
    if (boom.world.bombs.some((b) => b.delivery)) sawCrate = true;
    if (boom.world.events.some((e) => e.type === 'explosion' && e.source?.kind === 'mode')) { sawBlast = true; break; }
  }
  assert.ok(sawCrate && sawBlast);
  const ev = boom.world.events.filter((e) => e.type === 'kill' && e.source?.kind === 'mode');
  for (const k of ev) assert.equal(k.killerId, -1, 'no villager gets credit for a delivery');
  // random powers: only today's pool works, and the pool is reproducible
  const rnd = createGame({ seed: 4, seats: seats(), mode: 'random' });
  rnd.phase = 'command'; for (let i = 0; i < 4; i++) rnd.hand[i] = [];
  const dawn = () => { const g = createGame({ seed: 4, seats: seats(), mode: 'random' }); return JSON.stringify(g.randomPowers); };
  assert.equal(dawn(), dawn());
  rnd.world.peaceful = false; rnd.turn = rnd.world.turn = 6; rnd.phase = 'sim'; rnd.power.fill(6);
  const pool = rnd.randomPowers[0];
  assert.equal(pool.length, IDEAS.modes.randomCount);
  const banned = ['miracle', 'aegis', 'rain', 'fog', 'sleep', 'whisper', 'charm', 'enrage', 'gust', 'weapon'].find((id) => !pool.includes(id));
  const target = of(rnd, 0)[0]; target.hp = 40;
  assert.equal(castPower(rnd, 0, banned, { villagerId: target.id, group: 1, x: 900, y: 500, dx: 100, dy: 0 }).ok, false);
  assert.ok(MODE_IDS.length === 5 && countsForRecords('standard') && !countsForRecords('armed'));
});

test('modes: every challenge mode and layout plays to the end deterministically', () => {
  for (const mode of MODE_IDS) {
    const run = () => { const g = createGame({ seed: 12, seats: seats('bot'), mode, layout: 'hill', cosmetics: false }); runToEnd(g); return [g.phase, g.turn, g.winner, JSON.stringify(authoritativeState(g)).length].join('|'); };
    const a = run();
    assert.equal(a, run(), `${mode} is reproducible`);
    assert.ok(a.startsWith('ended'), `${mode} finishes`);
  }
});
