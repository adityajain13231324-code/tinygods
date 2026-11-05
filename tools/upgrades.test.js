import test from 'node:test';
import assert from 'node:assert/strict';
import { createGame } from '../src/sim/turn.js';
import { authoritativeState } from '../src/sim/state.js';
import { previewOrder } from '../src/sim/orderPreview.js';
import { applyOrders, validateOrders } from '../src/sim/orders.js';
import { publicPosition, defensivePlan } from '../src/bots/tactics.js';
import { botDecide, botPowers } from '../src/bots/bot.js';
import { PERSONALITIES } from '../src/bots/personalities.js';
import { mulberry32 } from '../src/sim/rng.js';
import { goToPlace, walkingGoal, stepWorld } from '../src/sim/brain.js';

const fresh = (seed = 41) => createGame({ seed, seats: Array.from({ length: 4 }, () => ({ name: 'Player', kind: 'human' })), cosmetics: false, simSeconds: 45 });
const day = (g, n = 5) => { g.turn = g.world.turn = n; g.world.peaceful = false; g.power.fill(5); return g; };

test('previews never change simulation or any RNG, including random selection pools', () => {
  const g = day(fresh()), before = authoritativeState(g);
  for (let n = 0; n < 100; n++) {
    const arm = previewOrder(g.world, 0, { verb: 'arm', strength: 1, target: null });
    assert.equal(arm.uncertain, true);
    assert.match(arm.label, /up to 3/);
    assert.equal(arm.actors.length, 12);
    previewOrder(g.world, 0, { verb: 'love', strength: 1, target: { kind: 'group', id: 1 }, subject: { kind: 'count', n: 4 } });
    assert.equal(previewOrder(g.world, 0, { verb: 'hunt', strength: 1, target: { kind: 'villager', id: 0 } }), null);
  }
  assert.deepEqual(authoritativeState(g), before);
});

test('exact previews match real named Arm, nearest Hunt, Seize and Assault selections', () => {
  for (const verb of ['arm', 'hunt', 'seize', 'assault']) {
    const g = day(fresh());
    const own = g.world.villagers.filter(v => v.faction === 0);
    const prey = g.world.villagers.find(v => v.faction === 1);
    const order = { verb, strength: 1, target: verb === 'arm' ? null : verb === 'assault' ? { kind: 'group', id: 1 } : { kind: 'villager', id: prey.id } };
    if (verb === 'arm') order.subject = { kind: 'villagers', ids: own.slice(0, 5).reverse().map(v => v.id) };
    const predicted = previewOrder(g.world, 0, order);
    assert.equal(predicted.uncertain, false);
    applyOrders(g.world, 0, [order]);
    const actual = own.filter(v => verb === 'arm' ? v.fx.arm : verb === 'hunt' ? v.fx.hunt !== null : verb === 'seize' ? v.fx.seize : v.fx.assault).map(v => v.id).sort((a, b) => a - b);
    assert.deepEqual(predicted.actors.slice().sort((a, b) => a - b), actual, verb);
  }
});

test('previews respect unrevealed traits, ownership, deaths and escort self exclusion', () => {
  const g = day(fresh());
  const own = g.world.villagers.filter(v => v.faction === 0);
  own.forEach(v => { v.trait = 'medic'; v.revealed = false; });
  const order = { verb: 'follow', target: { kind: 'place', id: 'park' }, strength: 1, subject: { kind: 'trait', trait: 'medic' } };
  assert.deepEqual(previewOrder(g.world, 0, order).actors, []);
  own[0].revealed = true;
  assert.deepEqual(previewOrder(g.world, 0, order).actors, [own[0].id]);
  const escort = previewOrder(g.world, 0, { verb: 'escort', target: { kind: 'villager', id: own[0].id }, strength: 1 });
  assert.ok(!escort.actors.includes(own[0].id));
  own[0].alive = false;
  assert.deepEqual(previewOrder(g.world, 0, order).actors, []);
});

test('seeded pacifist and Whisper ties can choose every living rival at every seat', () => {
  for (let seat = 0; seat < 4; seat++) {
    const love = new Set(), whisper = new Set();
    for (let seed = 1; seed <= 64; seed++) {
      const info = { seat, turn: 5, living: [12, 12, 12, 12], influence: 5, anyKills: true, lostSomeone: false, lastVerbs: new Set(['arm']) };
      const o = PERSONALITIES.pacifist(info, mulberry32(seed)).find(o => o.verb === 'love');
      love.add(o.target.id);
      const g = day(fresh());
      g.phase = 'sim'; g.seats[seat] = { kind: 'bot', personality: 'gossip' }; g.botRng = mulberry32(seed);
      // No combat hotspot, no wounded villagers: only the Whisper policy can fire.
      for (const v of g.world.villagers) { v.hp = 100; v.state = 'idle'; }
      const before = g.world.villagers.map(v => [...v.opinion]);
      botPowers(g);
      if (g.usedPowers[seat].includes('whisper')) for (const v of g.world.villagers) for (let group = 0; group < 4; group++) if (before[v.id][group] !== v.opinion[group]) whisper.add(group);
    }
    const rivals = [0, 1, 2, 3].filter(s => s !== seat);
    assert.deepEqual([...love].sort(), rivals);
    assert.deepEqual([...whisper].sort(), rivals);
  }
});

test('emergency orders use only public facts, escort helpers and reserve retreating villagers', () => {
  const g = day(fresh()); g.seats[0] = { kind: 'bot', personality: 'warmonger' };
  const mine = g.world.villagers.filter(v => v.faction === 0), enemy = g.world.villagers.find(v => v.faction === 1);
  mine[0].hp = 20; enemy.state = 'attack'; enemy.targetId = mine[0].id;
  enemy.x = mine[0].x + 40; enemy.y = mine[0].y;
  const info = { seat: 0, turn: 5, personality: 'warmonger' };
  const before = publicPosition(g.world);
  for (const v of g.world.villagers) { v.trust.fill(0); v.opinion.fill(-99); v.trait = 'brawler'; }
  assert.deepEqual(publicPosition(g.world), before);
  const plan = defensivePlan(info, before, mulberry32(17));
  assert.equal(plan[0].verb, 'follow'); assert.equal(plan[1].verb, 'escort');
  assert.ok(!plan[1].subject.ids.includes(mine[0].id));
  assert.equal(validateOrders(plan, 5, g.world, null, false, 0).ok, true);
  const orders = botDecide(g, 0);
  assert.equal(orders[0].verb, 'follow');
  for (const o of orders.slice(2)) assert.ok(!o.subject.ids.includes(mine[0].id), 'ordinary orders must not override retreat');
});

test('bots heal a survivor in immediate danger before offence, then shield if healing was used', () => {
  const g = day(fresh()); g.phase = 'sim'; g.seats[0] = { kind: 'bot', personality: 'warmonger' }; g.botRng = () => 0.99;
  const own = g.world.villagers.find(v => v.faction === 0), enemy = g.world.villagers.find(v => v.faction === 1);
  own.hp = 10; enemy.state = 'attack'; enemy.targetId = own.id; enemy.x = own.x + 20; enemy.y = own.y;
  botPowers(g);
  assert.deepEqual(g.usedPowers[0], ['miracle']); assert.ok(own.hp > 10);
  own.hp = 10; g.power[0] = 5;
  botPowers(g);
  assert.deepEqual(g.usedPowers[0], ['miracle', 'aegis']); assert.ok(own.blessUntil > g.world.time);
});

test('walking goals reach the safe interior and a closed armory does not trap villagers', () => {
  const g = fresh(), v = g.world.villagers[0];
  for (const o of g.world.villagers) if (o !== v) o.alive = false;
  g.world.bounds = { x0: 500, y0: 300, x1: 1000, y1: 800 };
  const goal = walkingGoal(g.world, 2000, 2000);
  assert.ok(goal[0] <= 900 && goal[1] <= 700);
  v.x = v.px = 700; v.y = v.py = 500;
  v.trait = 'normal'; v.partnerId = -1;
  goToPlace(g.world, v, { x: 2000, y: 2000, radius: 0 }, 'follow');
  let reached = false;
  for (let n = 0; n < 1200; n++) { stepWorld(g.world, 1 / 30); if (Math.hypot(v.x - goal[0], v.y - goal[1]) < 25) { reached = true; break; } }
  assert.equal(reached, true);
  v.weapon = 'none'; v.fx.arm = 1; v.armDone = false; v.purpose = 'arm'; v.thinkTimer = 0;
  const stock = g.world.armoryPool[0];
  stepWorld(g.world, 1 / 30);
  assert.equal(v.armDone, true); assert.equal(g.world.armoryPool[0], stock); assert.notEqual(v.purpose, 'arm');
});

test('decision tracing leaves authoritative simulation and all RNG streams identical', () => {
  const a = fresh(), b = fresh(); let calls = 0;
  b.world.traceDecision = e => { calls++; assert.ok(e.reason); };
  for (let n = 0; n < 120; n++) { stepWorld(a.world, 1 / 30); stepWorld(b.world, 1 / 30); }
  assert.ok(calls > 0); assert.deepEqual(authoritativeState(a), authoritativeState(b));
});
