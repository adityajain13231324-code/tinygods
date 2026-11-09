import test from 'node:test';
import assert from 'node:assert/strict';
import { createGame } from '../src/sim/turn.js';
import { stepWorld } from '../src/sim/brain.js';
import { applyOrders } from '../src/sim/orders.js';

const seats = () => Array.from({ length: 4 }, (_, i) => ({ name: `P${i}`, kind: 'human' }));
const of = (g, f) => g.world.villagers.filter((v) => v.faction === f && v.alive);
const at = (v, x, y) => { v.x = v.px = x; v.y = v.py = y; return v; };

test('a long siege does not make guards ping-pong between the post and the retreat', () => {
  const g = createGame({ seed: 31, seats: seats(), cosmetics: false });
  g.phase = 'sim'; g.turn = g.world.turn = 6; g.world.peaceful = false; g.world.time = 10;
  const w = g.world;
  w.villagers.forEach((v, i) => { v.x = v.px = 40 + (i % 30) * 6; v.y = v.py = 40 + Math.floor(i / 30) * 6; v.thinkTimer = 1e6; v.timer = 1e6; v.state = 'idle'; v.calmUntil = 1e9; });
  const armory = w.places.find((p) => p.id === 'armory'), park = w.places.find((p) => p.id === 'park');
  const guards = of(g, 0).slice(0, 4);
  guards.forEach((v, i) => at(v, armory.x + i * 20, armory.y));
  const besiegers = of(g, 1).slice(0, 9);
  applyOrders(w, 0, [{ verb: 'protect', target: { kind: 'place', id: 'armory' }, strength: 3, subject: { kind: 'villagers', ids: guards.map((v) => v.id) }, when: { cond: 'outnumbered', retreat: 'park' } }]);
  let triggers = 0, clears = 0;
  const gotThere = new Set();
  const seen = new WeakSet();
  for (let i = 0; i < 60 * 20; i++) {
    // the besiegers keep standing at the armory the whole time
    besiegers.forEach((v, k) => { at(v, armory.x + 60 + (k % 3) * 25, armory.y + 50 + Math.floor(k / 3) * 25); });
    guards.forEach((v) => { v.thinkTimer = Math.min(v.thinkTimer, 0.2); });
    stepWorld(w, 0.05);
    for (const v of guards) if (Math.hypot(v.x - park.x, v.y - park.y) < park.radius * 1.2) gotThere.add(v.id);
    for (const e of w.events.slice(-8)) {
      if (seen.has(e)) continue;
      seen.add(e);
      if (e.type === 'conditionTriggered') triggers++;
      if (e.type === 'conditionCleared') clears++;
    }
  }
  assert.ok(triggers <= guards.length * 2, `${triggers} triggers for ${guards.length} guards in 60 s: at most two each`);
  assert.equal(gotThere.size, guards.length, 'every guard really walked to the park at some point: ' + guards.map((v) => v.name + ' ' + Math.round(v.x) + ',' + Math.round(v.y) + ' ' + v.state + ' active ' + v.whenActive + ' when ' + JSON.stringify(v.fx.when)).join(' | '));
  assert.ok(clears <= triggers);
});
