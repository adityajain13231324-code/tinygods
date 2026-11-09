// Optional built-browser check: use a local installed Chromium browser via BROWSER_EXECUTABLE.
import { createRequire } from 'node:module';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
const { chromium } = createRequire(import.meta.url)('playwright');
const base = process.env.GAME_TEST_URL ?? 'http://127.0.0.1:4181/';
const output = process.env.TEST_OUTPUT_DIR ?? 'test-results/battlefield-browser';
await fs.mkdir(output, { recursive: true });
const browser = await chromium.launch({ headless: true, ...(process.env.BROWSER_EXECUTABLE ? { executablePath: process.env.BROWSER_EXECUTABLE } : {}) });
const errors = [];
try {
  for (const width of [1440, 375]) {
    const context = await browser.newContext({ viewport: { width, height: 900 } });
    await context.addInitScript(() => { localStorage.setItem('tinygods.cutscenes', '0'); localStorage.setItem('tinygods.battlefieldFx', '1'); });
    const page = await context.newPage();
    page.on('pageerror', e => errors.push(e.message));
    await page.goto(base + '?start=1&players=1&seed=41');
    await page.waitForFunction(() => window.tinyGods?.effects?.breakables?.length === 8);
    const visuals = await page.evaluate(() => {
      const t = tinyGods;
      t.app.ticker.stop();
      t.cutscenes.enabled = false;
      t.cutscenes.skipAll();
      t.ctx.paused = true;
      t.frame(0);
      const v = t.game.world.villagers[0];
      Object.assign(v, { weapon: 'gun', ammo: 5, state: 'attack', escalation: 2 });
      t.views[0].update(1, 1);
      const aiming = t.views[0].aimCue.visible;
      Object.assign(v, { weapon: 'rocket', ammo: 1 });
      t.views[0].update(1, 1.2);
      const lastRocket = t.views[0].ammoDots.visible && t.views[0].ammoDots.alpha < 1;
      const crate = t.effects.breakables[0];
      t.effects.explosion({ x: crate.x, y: crate.y, r: 60, time: t.game.world.time, source: { id: 'rocket' } });
      t.effects.world = t.game.world;
      t.effects.update(0.01);
      t.app.render();
      return { aiming, lastRocket, broken: !crate.sprite.visible, marks: t.effects.groundMarks.length, particles: t.effects.live.length };
    });
    assert.equal(visuals.aiming, true);
    assert.equal(visuals.lastRocket, true);
    assert.equal(visuals.broken, true);
    assert.ok(visuals.marks >= 5 && visuals.marks <= 72);
    assert.ok(visuals.particles <= 320);
    await page.screenshot({ path: `${output}/explosion-${width}.png` });
    await page.evaluate(() => {
      const t = tinyGods, g = t.game;
      const a = g.world.villagers[0], b = g.world.villagers[1];
      g.world.events.push(...Array.from({ length: 3 }, (_, i) => ({ type: 'gunshot', turn: 5, time: 20 + i, shooterId: a.id, targetId: b.id, targetState: 'flee', x: a.x, y: a.y, tx: b.x, ty: b.y, weapon: 'gun', place: 'plaza', hit: false })));
      g.world.events.push({ type: 'defect', turn: 5, time: 24, villagerId: b.id, from: 0, to: 1 });
      g.phase = 'ended'; g.over = true; g.winner = 0; g.turn = 5;
      g.winReason = 'Last faction standing'; g.recap = { living: [1, 0, 0, 0] };
      t.frame(0);
    });
    await page.getByText('Town awards').waitFor();
    assert.equal(await page.locator('.town-award').count(), 4);
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
    await page.screenshot({ path: `${output}/awards-${width}.png` });
    const menuButton = page.getByRole('button', { name: 'Main menu' });
    await menuButton.scrollIntoViewIfNeeded();
    assert.ok(await menuButton.evaluate(button => {
      const r = button.getBoundingClientRect();
      return r.top >= 0 && r.bottom <= innerHeight;
    }));
    await context.close();

    const offContext = await browser.newContext({ viewport: { width, height: 900 } });
    await offContext.addInitScript(() => { localStorage.setItem('tinygods.cutscenes', '0'); localStorage.setItem('tinygods.battlefieldFx', '0'); });
    const offPage = await offContext.newPage();
    offPage.on('pageerror', e => errors.push(e.message));
    await offPage.goto(base + '?start=1&players=1&seed=41');
    await offPage.waitForFunction(() => window.tinyGods?.effects);
    assert.deepEqual(await offPage.evaluate(() => {
      const e = tinyGods.effects;
      e.explosion({ x: 425, y: 315, r: 60, time: 10, source: { id: 'rocket' } });
      return [e.battlefieldFx, e.breakables.length, e.groundMarks.length];
    }), [false, 0, 0]);
    await offContext.close();
  }
  assert.deepEqual(errors, []);
  console.log('PASS battlefield visuals, awards, mobile layout and effects-off mode');
} finally { await browser.close(); }
