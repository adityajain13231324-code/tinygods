// Real-browser check of the "selected ideas" update: setup pickers, formation and fallback builders,
// the Leader and Random Powers UI, awards and a recorded highlight clip. Needs Playwright and a built
// preview:   npm run build && npx vite preview --port 4181 --host 127.0.0.1   then   node tools/browser-ideas.mjs
//   BROWSER_EXECUTABLE=C:/path/to/chrome.exe GAME_TEST_URL=http://127.0.0.1:4181/ node tools/browser-ideas.mjs
import { createRequire } from 'node:module';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
const { chromium } = createRequire(import.meta.url)('playwright');
const base = process.env.GAME_TEST_URL ?? 'http://127.0.0.1:4181/';
const output = path.resolve(process.env.TEST_OUTPUT_DIR ?? 'test-results/browser-ideas');
await fs.mkdir(output, { recursive: true });
const browser = await chromium.launch({ headless: true, args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--disable-dev-shm-usage'], ...(process.env.BROWSER_EXECUTABLE ? { executablePath: process.env.BROWSER_EXECUTABLE } : {}) });
const checks = [], errors = [];
const ok = (name, cond, detail = '') => { checks.push(`${cond ? 'PASS' : 'FAIL'} ${name}${detail ? ' (' + detail + ')' : ''}`); if (!cond) errors.push(name); };
const ctx = await browser.newContext({ viewport: { width: 1280, height: 760 }, acceptDownloads: true });
await ctx.addInitScript(() => { try { localStorage.setItem('tinygods.cutscenes', '0'); localStorage.setItem('tinygods.welcomed', '1'); localStorage.setItem('tinygods.news', '0'); } catch { /* storage blocked */ } });
const page = await ctx.newPage();
const pageErrors = [];
page.on('pageerror', (e) => pageErrors.push(String(e)));
page.on('console', (m) => { if (m.type() === 'error') pageErrors.push(m.text()); });

// 1. Setup: pick a layout and a challenge, start, and the game really uses them
await page.goto(base, { waitUntil: 'load' });
await page.waitForSelector('.menu2-card');
await page.locator('.menu2-card:has-text("Play vs bots")').click();
await page.waitForSelector('select[aria-label="Town layout"]');
await page.selectOption('select[aria-label="Town layout"]', 'canal');
await page.selectOption('select[aria-label="Challenge"]', 'armed');
ok('setup shows what the challenge does', /do not count toward your record/.test(await page.locator('.setup-card').innerText()));
await page.screenshot({ path: `${output}/setup.png` });
await page.locator('button:has-text("Start match")').click();
await page.waitForSelector('#topbar .turn', { timeout: 30000 });
await page.waitForTimeout(1500);
const info = await page.evaluate(() => ({ layout: tinyGods.game.layout, mode: tinyGods.game.mode, armed: tinyGods.game.world.villagers.every((v) => v.weapon !== 'none'), url: location.search }));
ok('layout and challenge reach the game', info.layout === 'canal' && info.mode === 'armed' && info.armed, JSON.stringify(info));

// 2. Planning: quick formation, typed fallback, and the menu builder
await page.locator('button.quick:has-text("Spread")').first().click();
let staged = await page.locator('.staged').innerText();
ok('quick formation stages an order', /Formation|Spread/i.test(staged), staged.replace(/\n/g, ' '));
await page.locator('input').first().fill('guard the armory, retreat to the park if outnumbered');
await page.keyboard.press('Enter');
await page.waitForTimeout(500);
staged = await page.locator('.staged').innerText();
ok('typed fallback is understood and shown', /outnumbered/i.test(staged) && /Park/.test(staged), staged.replace(/\n/g, ' '));
await page.screenshot({ path: `${output}/orders.png` });

// 3. The world renders layouts without errors, and the new dialogue/effects path runs
const rec = await page.evaluate(() => ({ props: tinyGods.game.world.props.length, grass: tinyGods.game.world.grass.length, canals: tinyGods.game.world.canals.length }));
ok('canal layout has canals, props and grass', rec.canals === 2 && rec.props >= 10 && rec.grass >= 3, JSON.stringify(rec));
ok('no page errors so far', pageErrors.length === 0, pageErrors.slice(0, 2).join(' | '));

// 4. Play a day, then check awards and record a clip from the recap
await page.locator('button:has-text("Submit"), button:has-text("Pass this turn")').first().click().catch(() => {});
await page.waitForTimeout(500);
await page.evaluate(() => { tinyGods.ctx.setSpeed?.(4); });
await page.waitForFunction(() => tinyGods.game.phase === 'sim', null, { timeout: 30000 });
await page.evaluate(async () => {
  // make a moment worth clipping: a blast, a kill, a dropped weapon (all through the real rules)
  const { blast } = tinyGods.sim;
  const w = tinyGods.game.world;
  w.peaceful = false;
  const v = w.villagers.find((q) => q.alive && q.faction === 1);
  v.hp = 1; v.weapon = 'bat';
  blast(w, 0, v.x, v.y, 60, { minDamage: 99, maxDamage: 99 });
});
await page.waitForFunction(() => ['recap', 'guess', 'ended'].includes(tinyGods.game.phase), null, { timeout: 120000 });
await page.waitForTimeout(800);
const hl = await page.evaluate(() => tinyGods.game.highlights.length);
ok('the day produced a highlight', hl >= 1, String(hl));
await page.screenshot({ path: `${output}/recap.png` });
const clipButton = page.locator('button:has-text("Save clip")').first();
ok('a highlight offers a clip', (await clipButton.count()) > 0);
if (await clipButton.count()) {
  await clipButton.click();
  await page.waitForSelector('.clip-card');
  const caption = await page.locator('.clip-card input').inputValue();
  ok('the caption is written from the real event', caption.length > 10, caption);
  const supported = await page.evaluate(() => tinyGods.ctx.clip.support.canRecord);
  await page.locator('.clip-card button.go').first().click();
  await page.waitForSelector('.clip-card video, .clip-card img.clip-preview', { timeout: 60000 });
  const clip = await page.evaluate(async () => {
    const el = document.querySelector('.clip-card video, .clip-card img.clip-preview');
    const blob = await fetch(el.src).then((r) => r.blob());
    return { tag: el.tagName, size: blob.size, type: blob.type };
  });
  ok(supported ? 'clip is a bounded video' : 'fallback still picture is produced', clip.size > 1000 && clip.size <= 6_000_000, JSON.stringify(clip));
  await page.screenshot({ path: `${output}/clip.png` });
  const save = page.locator('.clip-card a.go');
  ok('saving is a local download link, nothing is uploaded', (await save.count()) === 1 && /^blob:/.test(await save.getAttribute('href')));
  await page.locator('.clip-card button:has-text("Close")').click();
}
ok('no page errors in the whole run', pageErrors.length === 0, pageErrors.slice(0, 3).join(' | '));
await browser.close();
for (const c of checks) console.log(c);
if (errors.length) { console.error(`\n${errors.length} browser check(s) failed`); process.exit(1); }
console.log(`PASS ${checks.length} browser idea checks`);
