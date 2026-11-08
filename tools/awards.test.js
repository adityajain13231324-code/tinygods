import test from 'node:test';
import assert from 'node:assert/strict';
import { buildAwards } from '../src/sim/awards.js';

test('awards require recorded evidence and never invent villagers', () => {
  const villagers = [{ name: 'Fern', alive: true }, { name: 'Pip', alive: true }];
  assert.deepEqual(buildAwards({ villagers, events: [] }), []);
  const events = [
    { type: 'gunshot', shooterId: 0, targetId: 1, hit: false },
    { type: 'gunshot', shooterId: 0, targetId: 1, hit: false },
    { type: 'gunshot', shooterId: 0, targetId: 1, hit: false },
    { type: 'defect', villagerId: 1, from: 0, to: 2 },
  ];
  const awards = buildAwards({ villagers, events });
  assert.deepEqual(awards.map(a => a.title), ['Most Chaotic Villager', 'Best Escape', 'Biggest Betrayal', 'Worst Aim']);
  assert.equal(awards.find(a => a.title === 'Best Escape').name, 'Pip');
  assert.equal(awards.find(a => a.title === 'Worst Aim').name, 'Fern');
  villagers[1].alive = false;
  assert.ok(!buildAwards({ villagers, events }).some(a => a.title === 'Best Escape'));
});
