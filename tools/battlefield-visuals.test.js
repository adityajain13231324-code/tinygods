import test from 'node:test';
import assert from 'node:assert/strict';
import { Texture } from 'pixi.js';
import { Effects } from '../src/render/effects.js';
import { Speech } from '../src/render/speech.js';

const makeEffects = (enabled) => {
  const previous = globalThis.localStorage;
  globalThis.localStorage = { getItem: () => enabled ? '1' : '0' };
  try { return new Effects({ renderer: { generateTexture: () => Texture.WHITE } }, null); }
  finally { globalThis.localStorage = previous; }
};

test('explosion aftermath is capped, switchable and crate state follows replay time', () => {
  const on = makeEffects(true);
  const off = makeEffects(false);
  const event = { x: 425, y: 315, r: 48, time: 12, source: { id: 'rocket' } };
  on.explosion(event);
  off.explosion(event);
  assert.equal(on.breakables[0].brokenAt, 12);
  assert.equal(off.breakables.length, 0);
  assert.ok(on.groundMarks.length > 0);
  assert.equal(off.groundMarks.length, 0);
  assert.ok(on.live.length > off.live.length);
  on.world = { time: 11, bombs: [], fogs: [] };
  on.update(0.01);
  assert.equal(on.breakables[0].sprite.visible, true);
  on.world.time = 13;
  on.update(0.01);
  assert.equal(on.breakables[0].sprite.visible, false);
  for (let i = 0; i < 30; i++) on.groundMark(1, i * 10, 10);
  for (let i = 0; i < 100; i++) on.groundMark(1, i * 10, 10);
  assert.equal(on.groundMarks.length, 72);
  on.update(51);
  assert.equal(on.groundMarks.length, 0);
});

test('freeze dialogue uses the observed replay clock and reset prevents false reactions', () => {
  const v = { id: 0, alive: true, state: 'idle', hp: 50, frozenUntil: 0, ammo: 0,
    believed: [], faction: 0, partnerId: -1, activity: null, weapon: 'none', expression: 'calm', brewId: -1,
    hitFlash: 0, trait: null };
  const view = { v, speaking: false };
  const speech = Object.create(Speech.prototype);
  speech.game = { world: { time: 100, villagers: [v], festivals: [] } };
  speech.live = [];
  speech.free = [];
  const said = [];
  speech.say = (_, category) => said.push(category);
  const originalRandom = Math.random;
  Math.random = () => 0;
  try {
    speech.watch(view, 10);
    v.frozenUntil = 14;
    speech.watch(view, 10);
    assert.ok(said.includes('frozen'));
    speech.reset([view]);
    assert.equal(view.sp, null);
    said.length = 0;
    v.frozenUntil = 0;
    v.hp = 90;
    speech.watch(view, 100);
    assert.ok(!said.includes('healed'));
  } finally { Math.random = originalRandom; }
});

test('starting a replay on a dead or freshly hit villager does not invent an impact', () => {
  const fx = makeEffects(true);
  const v = { alive: false, hitFlash: 1, swing: 0, state: 'dead', whirlpoolDamage: 0, brewId: -1 };
  const view = { v, root: { x: 100, y: 100 }, headX: () => 60, headY: () => 60, bodyY: () => 90 };
  fx.watch(view, 20);
  assert.equal(fx.live.length, 0);
  assert.equal(fx.decalList.length, 0);
  fx.resetWatch([view]);
  assert.equal(view.fx, null);
});
