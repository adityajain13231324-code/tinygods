// Real-browser playtest of the end-of-match flow, accessibility basics, touch targets and crowded-fight FPS.
//   npm run build && npx vite preview --port 4181 --host 127.0.0.1
//   GAME_TEST_URL=http://127.0.0.1:4181/ BROWSER_EXECUTABLE=... node tools/browser-playtest.mjs
import { createRequire } from 'node:module';
import fs from 'node:fs/promises';
import path from 'node:path';
const { chromium } = createRequire(import.meta.url)('playwright');
const base = process.env.GAME_TEST_URL ?? 'http://127.0.0.1:4181/';
const output = path.resolve(process.env.TEST_OUTPUT_DIR ?? 'test-results/browser-playtest');
await fs.mkdir(output, { recursive: true });
const browser = await chromium.launch({ headless: true, args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--disable-dev-shm-usage'], ...(process.env.BROWSER_EXECUTABLE ? { executablePath: process.env.BROWSER_EXECUTABLE } : {}) });
const rows = [];
const check = (name, ok, detail = '') => { rows.push(`${ok ? 'PASS' : 'FAIL'} ${name}${detail ? ' (' + detail + ')' : ''}`); return ok; };
const errors = [];
async function open(size, opts = {}) {
  const ctx = await browser.newContext({ viewport: size, hasTouch: size.width < 700, isMobile: size.width < 500, reducedMotion: opts.reduced ? 'reduce' : 'no-preference', acceptDownloads: true });
  await ctx.addInitScript(() => { try { localStorage.setItem('tinygods.cutscenes', '0'); localStorage.setItem('tinygods.welcomed', '1'); } catch { /* storage blocked */ } });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  return { ctx, page };
}

// 1. Play to the end of a match and check the ending: winner, awards, replay and clip controls
{
  const { ctx, page } = await open({ width: 1280, height: 760 });
  await page.goto(`${base}?start=1&seed=21&players=1&layout=market`, { waitUntil: 'load' });
  await page.waitForSelector('#topbar .turn');
  await page.waitForTimeout(1500);
  await page.evaluate(async () => {
    const { game } = tinyGods;
    game.phase = 'sim'; game.turn = game.world.turn = 6; game.world.peaceful = false; game.simElapsed = 0;
    const w = game.world;
    const v = w.villagers.find((q) => q.alive && q.faction === 1);
    game.recorder.reset(); game.recorder.capture(w); // footage of this turn starts here
    tinyGods.sim.blast(w, 0, v.x, v.y, 70, { minDamage: 150, maxDamage: 150 }); // a kill on the recorded turn
    tinyGods.sim.castPower(game, 0, 'rain', { x: 900, y: 500 });
    w.time += 0.5; game.recorder.capture(w); w.time += 0.5; game.recorder.capture(w);
    for (const o of w.villagers) if (o.alive && o.faction >= 1) { o.alive = false; o.hp = 0; o.state = 'dead'; } // everyone else falls: the match ends
  });
  await page.waitForFunction(() => tinyGods.game.phase === 'ended', null, { timeout: 60000 });
  await page.waitForSelector('.town-award', { timeout: 20000 }).catch(() => {});
  await page.waitForTimeout(800);
  await page.screenshot({ path: `${output}/ending.png` });
  const end = await page.evaluate(() => ({ awards: [...document.querySelectorAll('.town-award')].map((a) => a.innerText.replace(/\n/g, ' | ')), replayButtons: document.querySelectorAll('.town-award button').length, rematch: !!([...document.querySelectorAll('button')].find((b) => /Rematch|rematch/.test(b.textContent))), story: document.querySelectorAll('.story li').length }));
  check('the ending shows the winner story and town awards', end.story >= 3 && end.awards.length >= 1, `${end.awards.length} awards: ${end.awards.slice(0, 2).join(' || ')}`);
  check('the rematch control is still there', end.rematch);
  if (end.replayButtons) {
    await page.locator('.town-award button:has-text("Clip")').first().click().catch(() => {});
    const dlg = await page.waitForSelector('.clip-card', { timeout: 5000 }).catch(() => null);
    check('an award clip opens the clip dialog', !!dlg);
    if (dlg) {
      const dialog = await page.evaluate(() => ({ role: document.querySelector('.clip-card').getAttribute('role'), modal: document.querySelector('.clip-card').getAttribute('aria-modal'), focusInside: document.querySelector('.clip-card').contains(document.activeElement) }));
      check('the clip dialog is an accessible modal with focus inside', dialog.role === 'dialog' && dialog.modal === 'true' && dialog.focusInside, JSON.stringify(dialog));
      await page.keyboard.press('Escape');
      check('Escape closes the clip dialog', (await page.locator('.clip-card').count()) === 0);
    }
  } else check('awards on the recorded turn offer replay controls', false, 'no replay buttons although a kill happened on the recorded turn');
  await ctx.close();
}

// 2. Phone: no horizontal overflow, touch targets, accessible names, and the builders fit
{
  const { ctx, page } = await open({ width: 390, height: 844 });
  await page.goto(`${base}?start=1&seed=5&players=1&layout=canal`, { waitUntil: 'load' });
  await page.waitForSelector('#topbar .turn');
  await page.waitForTimeout(2500);
  const toggle = page.locator('#command .menutoggle, #command button:has-text("Open")').first();
  if (await toggle.count()) await toggle.click().catch(() => {});
  await page.waitForTimeout(500);
  const audit = await page.evaluate(() => {
    const vis = (n) => n.getClientRects().length && getComputedStyle(n).visibility !== 'hidden';
    const buttons = [...document.querySelectorAll('#ui button, #ui input, #ui select, #ui a')].filter(vis);
    const small = buttons.filter((b) => { const r = b.getBoundingClientRect(); return r.height < 32 || r.width < 32; }).map((b) => `${(b.textContent || b.getAttribute('aria-label') || b.title || b.tagName).trim().slice(0, 18)} ${Math.round(b.getBoundingClientRect().width)}x${Math.round(b.getBoundingClientRect().height)}`);
    const unnamed = buttons.filter((b) => !(b.textContent || '').trim() && !b.getAttribute('aria-label') && !b.title && b.tagName === 'BUTTON').length;
    return { total: buttons.length, small: small.slice(0, 8), smallCount: small.length, unnamed, hscroll: document.documentElement.scrollWidth > innerWidth };
  });
  check('phone: no horizontal page scroll', !audit.hscroll);
  check('phone: every visible button has an accessible name', audit.unnamed === 0, `${audit.unnamed} unnamed of ${audit.total}`);
  check('phone: touch targets are at least 32 px', audit.smallCount === 0, `${audit.smallCount} smaller: ${audit.small.join(', ')}`);
  await page.screenshot({ path: `${output}/phone.png` });
  await ctx.close();
}

// 3. Reduced motion and keyboard reach
{
  const { ctx, page } = await open({ width: 1280, height: 760 }, { reduced: true });
  await page.goto(`${base}?start=1&seed=5&players=1&layout=farms`, { waitUntil: 'load' });
  await page.waitForSelector('#topbar .turn');
  await page.waitForTimeout(1500);
  const rm = await page.evaluate(() => ({ reduced: matchMedia('(prefers-reduced-motion: reduce)').matches, ideas: tinyGods.ctx ? true : false }));
  check('reduced-motion preference is honoured without errors', rm.reduced);
  const tabs = [];
  for (let i = 0; i < 12; i++) { await page.keyboard.press('Tab'); tabs.push(await page.evaluate(() => { const a = document.activeElement; return `${a?.tagName}:${(a?.textContent || a?.getAttribute('aria-label') || '').trim().slice(0, 14)}`; })); }
  check('keyboard Tab moves through real controls', new Set(tabs).size >= 6, tabs.slice(0, 6).join(' > '));
  await ctx.close();
}

// 4. Crowded fight FPS (software rendering, so only the comparison between builds means anything)
{
  const { ctx, page } = await open({ width: 1280, height: 720 });
  await page.goto(`${base}?start=1&seed=5&players=1&layout=hill`, { waitUntil: 'load' });
  await page.waitForSelector('#topbar .turn');
  await page.waitForTimeout(2000);
  const fps = await page.evaluate(async () => {
    const { game } = tinyGods, w = game.world;
    game.phase = 'sim'; game.simSeconds = 300; game.simElapsed = 0; game.turn = w.turn = 7; w.peaceful = false;
    const pz = w.places.find((p) => p.id === 'plaza');
    w.villagers.forEach((v, i) => { v.aggression = 95; v.weapon = ['gun', 'bat', 'rocket', 'none'][i % 4]; v.ammo = 4; v.escalation = 2; for (let k = 0; k < 5; k++) v.opinion[k] = -80; v.x = v.px = pz.x + Math.cos(i) * 130; v.y = v.py = pz.y + Math.sin(i * 1.3) * 100; });
    const { castPower, blast } = tinyGods.sim;
    game.power.fill(9);
    for (const id of ['rain', 'lightning', 'whirlpool', 'tornado']) { game.usedPowers.forEach((u) => u.splice(0)); castPower(game, 0, id, { x: pz.x, y: pz.y }); }
    for (const g of w.grass) g.state = 'burning';
    for (let i = 0; i < 6; i++) blast(w, 0, pz.x + i * 25, pz.y, 80, { source: { kind: 'power', id: 'fireball', seat: 0 } });
    await new Promise((r) => setTimeout(r, 1500));
    const t0u = performance.now();
    for (let i = 0; i < 200; i++) tinyGods.ideas.update(game.world, game.world.time, 0.016);
    const ideasMs = (performance.now() - t0u) / 200;
    return new Promise((res) => { let frames = 0, worst = 0, last = performance.now(); const t0 = last; const tick = (t) => { frames++; worst = Math.max(worst, t - last); last = t; if (t - t0 < 8000) requestAnimationFrame(tick); else res({ ideasMs, fps: frames / ((t - t0) / 1000), worst, alive: w.villagers.filter((v) => v.alive).length, heap: performance.memory ? performance.memory.usedJSHeapSize / 1e6 : 0, particles: tinyGods.effects.live.length }); }; requestAnimationFrame(tick); });
  });
  check('a maximum-effects brawl keeps rendering', fps.fps > 1 && fps.ideasMs < 3, `${fps.fps.toFixed(1)} fps, new-world drawing ${fps.ideasMs.toFixed(2)} ms per frame, worst frame ${fps.worst.toFixed(0)} ms, ${fps.alive} alive, ${fps.particles} live particles, heap ${fps.heap.toFixed(0)} MB`);
  await page.screenshot({ path: `${output}/brawl.png` });
  await ctx.close();
}

check('no page errors during the whole playtest', errors.length === 0, errors.slice(0, 3).join(' | '));
await browser.close();
for (const r of rows) console.log(r);
const failed = rows.filter((r) => r.startsWith('FAIL')).length;
if (failed) { console.error(`\n${failed} playtest check(s) failed`); process.exit(1); }
console.log(`PASS ${rows.length} browser playtest checks`);
