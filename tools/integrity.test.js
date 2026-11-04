import test from 'node:test';
import assert from 'node:assert/strict';
import { createGame, submitOrders, updateGame, skipRecap } from '../src/sim/turn.js';
import { parseCommand } from '../src/sim/parser.js';
import { validateOrder, validateOrders } from '../src/sim/orders.js';
import { createBond, breakBond, formLoveBonds } from '../src/sim/bonds.js';
import { EVENT_DEFS } from '../src/sim/townEvents.js';
import { castPower } from '../src/sim/powers.js';
import { validateCard } from '../src/sim/cards.js';
import { Lockstep } from '../src/net/lockstep.js';
import { Replay } from '../src/render/replay.js';

const humans = () => Array.from({ length: 4 }, (_, i) => ({ name: `P${i}`, kind: 'human' }));
const fresh = (seed = 41) => createGame({ seed, seats: humans(), cosmetics: true });
function dayThree(g = fresh()) {
  g.turn = g.world.turn = 3;
  g.world.peaceful = false;
  g.power.fill(3);
  return g;
}
function start(g) {
  for (let seat = 0; seat < 4; seat++) if (g.pending[seat] === null) assert.equal(submitOrders(g, seat, []).ok, true);
  updateGame(g, 0);
  assert.equal(g.phase, 'sim');
  return g;
}
function assertMutual(world) {
  for (const v of world.villagers) {
    if (v.partnerId < 0) continue;
    assert.notEqual(v.partnerId, v.id, `${v.name} must not pair with itself`);
    assert.equal(world.villagers[v.partnerId]?.partnerId, v.id, `${v.name}'s partner must point back`);
  }
}

test('replay restores exact villager state, including interpolation, after switching and interruption', () => {
  const g = fresh();
  g.recorder.capture(g.world);
  for (const v of g.world.villagers) { v.x += 12.345678901234; v.hp -= 0.123456789; }
  g.world.time += 0.1;
  g.recorder.capture(g.world);
  g.phase = 'recap';
  const before = structuredClone(g.world.villagers);
  const opinion = g.world.villagers[0].opinion;
  const replay = new Replay({ game: g, camera: { cut() {}, hold: 0 } });
  const clip = { t0: 0, t1: 0.1, x: 900, y: 500 };
  replay.play(clip);
  replay.update(0.03);
  replay.play({ ...clip });
  replay.stop();
  replay.stop();
  assert.deepEqual(g.world.villagers, before);
  assert.equal(g.world.villagers[0].opinion, opinion, 'untouched arrays keep their identity');
});

test('replaying genuine highlights cannot change later simulation or random streams', () => {
  function run(seed, watch) {
    const g = createGame({ seed, cosmetics: true, seats: Array.from({ length: 4 }, () => ({ name: 'Bot', kind: 'bot', personality: 'opportunist' })) });
    const replay = new Replay({ game: g, camera: { cut() {}, hold: 0 } });
    while (g.phase !== 'ended') {
      if (g.phase === 'command') updateGame(g, 30);
      else if (g.phase === 'recap') {
        if (watch && g.highlights.length) { replay.play(g.highlights[0]); replay.update(0.1); replay.stop(); }
        skipRecap(g);
      } else updateGame(g, 0.05);
    }
    return { winner: g.winner, turn: g.turn, villagers: g.world.villagers, events: g.world.events, next: [g.world.rng(), g.botRng(), g.cardRng(), g.eventRng()] };
  }
  for (const seed of [1, 2, 10]) assert.deepEqual(run(seed, true), run(seed, false), `replay changes seed ${seed}`);
});

test('typed Seize retains target, subjects and destination through submission and application', () => {
  const g = dayThree();
  const prey = g.world.villagers.find(v => v.faction === 1);
  const parsed = parseCommand(`two villagers grab ${prey.name} and drag them to the pond`, g, 0);
  assert.equal(parsed.ok, true);
  const order = parsed.actions.find(a => a.kind === 'order').order;
  assert.equal(submitOrders(g, 0, [order]).ok, true);
  assert.equal(g.pending[0][0].dest, 'pond');
  assert.deepEqual(g.pending[0][0].subject, { kind: 'count', n: 2 });
  order.subject.n = 9;
  assert.equal(g.pending[0][0].subject.n, 2, 'pending is not a mutable UI alias');
  start(g);
  const grabbers = g.world.villagers.filter(v => v.faction === 0 && v.fx.seize);
  assert.equal(grabbers.length, 2);
  assert.ok(grabbers.every(v => v.fx.seize.dest === 'pond'));
  assert.equal(g.truth.find(t => t.seat === 0).orders[0].dest, 'pond');
});

test('invalid order shapes and inherited verbs are structured rejections', () => {
  const g = dayThree();
  for (const order of [null, [], { verb: 'toString', strength: 1 }, { verb: 'constructor', strength: 1 }, { verb: '__proto__', strength: 1 },
    { verb: 'arm', strength: 1, subject: { kind: 'count', n: -1 } },
    { verb: 'arm', strength: 1, subject: false },
    { verb: 'love', strength: 1, target: { kind: 'group', id: 1 }, subject: { kind: 'villagers', ids: [999] } }]) {
    assert.equal(validateOrder(order, g.world).ok, false, JSON.stringify(order));
    assert.equal(validateOrders([order], 5, g.world, null, true).ok, false);
  }
  for (const seat of [-1, 4, NaN, '0', null]) assert.equal(submitOrders(g, seat, []).ok, false);
});

test('connected guest malformed orders cannot throw or populate host submissions', () => {
  const g = dayThree();
  const host = new Lockstep({ game: g, role: 'host', mySeat: 0 });
  for (const verb of ['toString', 'constructor', '__proto__']) {
    assert.doesNotThrow(() => host.onMessage(1, { t: 'sub', turn: g.turn, orders: [{ verb, strength: 1, target: null }] }));
    assert.equal(host.subs[1], undefined);
  }
});

test('inherited card/power IDs and malformed power arguments reject without spending', () => {
  const g = dayThree();
  for (const id of ['toString', 'constructor', '__proto__']) {
    assert.equal(validateCard(g, 0, { id }).ok, false);
  }
  start(g);
  for (const id of ['toString', 'constructor', '__proto__']) assert.equal(castPower(g, 0, id).ok, false);
  for (const args of [null, [], { x: NaN, y: Infinity }]) assert.equal(castPower(g, 0, 'fireball', args).ok, false);
  assert.equal(g.power[0], 3);
});

test('self-faction, rival, neutral and repeated Love keep bonds mutual and unique', () => {
  for (let seed = 1; seed <= 50; seed++) {
    const g = fresh(seed);
    for (const group of [0, 0, 1, 4, 0]) { formLoveBonds(g.world, 0, group, 3); assertMutual(g.world); }
  }
});

test('creating or breaking a bond cannot overwrite an unrelated partnership', () => {
  const g = fresh(), [a, b, c] = g.world.villagers;
  createBond(g.world, a, b);
  const events = g.world.events.length;
  createBond(g.world, a, c);
  assert.equal(g.world.events.length, events);
  assertMutual(g.world);
  assert.equal(c.partnerId, -1);
  // A stale one-sided link must not clear an otherwise valid pair.
  c.partnerId = a.id;
  breakBond(g.world, c);
  assert.equal(a.partnerId, b.id);
  assert.equal(b.partnerId, a.id);
});

test('Sickness never heals or kills and handles its HP floor', () => {
  for (const hp of [1, 10, 25, 26, 37, 100]) {
    const g = fresh();
    g.event = {};
    // Make faction 0 the unique leader, so this test does not depend on tie randomness.
    for (const v of g.world.villagers) if (v.faction === 1) v.alive = false;
    for (const v of g.world.villagers) if (v.faction === 2 || v.faction === 3) v.faction = -1;
    const v = g.world.villagers.find(v => v.faction === 0);
    v.hp = hp;
    EVENT_DEFS.sickness.apply(g);
    assert.equal(v.hp, Math.min(hp, Math.max(25, hp - 12)));
    assert.equal(v.alive, true);
  }
});

test('Sickness tied leaders use deterministic event randomness rather than seat order', () => {
  const seen = new Set();
  for (let seed = 1; seed <= 32; seed++) {
    const a = fresh(seed), b = fresh(seed);
    a.event = {}; b.event = {};
    EVENT_DEFS.sickness.apply(a); EVENT_DEFS.sickness.apply(b);
    assert.equal(a.event.faction, b.event.faction);
    seen.add(a.event.faction);
  }
  assert.equal(seen.size, 4);
});
