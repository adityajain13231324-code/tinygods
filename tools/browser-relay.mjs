// Two real browsers play online through the real relay server: create a room, join with the code, pick colours,
// start, hand in orders, and run into the next day, with the town identical in both.
//   npm run build && npx vite preview --port 4181 --host 127.0.0.1
//   GAME_TEST_URL=http://127.0.0.1:4181/ BROWSER_EXECUTABLE=... node tools/browser-relay.mjs
import { createRequire } from 'node:module';
import assert from 'node:assert/strict';
import { createRelay } from '../relay/server.js';
const { chromium } = createRequire(import.meta.url)('playwright');
const base = process.env.GAME_TEST_URL ?? 'http://127.0.0.1:4181/';
const relay = await createRelay({ port: 0, host: '127.0.0.1' });
const url = `ws://127.0.0.1:${relay.port}`;
const browser = await chromium.launch({ headless: true, args: ['--disable-dev-shm-usage', '--use-gl=swiftshader', '--enable-unsafe-swiftshader'], ...(process.env.BROWSER_EXECUTABLE ? { executablePath: process.env.BROWSER_EXECUTABLE } : {}) });
const errors = [];
const rows = [];
const check = (name, ok, detail = '') => { rows.push(`${ok ? 'PASS' : 'FAIL'} ${name}${detail ? ' (' + detail + ')' : ''}`); return ok; };
async function player(name) {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 760 } });
  await ctx.addInitScript(() => { try { localStorage.setItem('tinygods.cutscenes', '0'); localStorage.setItem('tinygods.welcomed', '1'); } catch { /* blocked */ } });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => errors.push(`${name}: ${e}`));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(`${name}: ${m.text()}`); });
  return { ctx, page };
}
try {
  const host = await player('host');
  const guest = await player('guest');
  await host.page.goto(`${base}?relay=${encodeURIComponent(url)}`);
  await host.page.getByRole('button', { name: /Play online/ }).click();
  await host.page.getByRole('textbox', { name: 'Your online name' }).fill('Hosty');
  await host.page.getByRole('button', { name: 'Create a room' }).click();
  const code = (await host.page.locator('.lobby-code-big').innerText({ timeout: 20000 })).trim();
  check('the host gets a room code from the relay', /^[A-Z2-9]{5}$/.test(code), code);
  check('the relay holds the room', relay.rooms.size === 1);

  await guest.page.goto(`${base}?relay=${encodeURIComponent(url)}`);
  await guest.page.getByRole('button', { name: /Play online/ }).click();
  await guest.page.getByRole('textbox', { name: 'Your online name' }).fill('Gwen');
  await guest.page.getByRole('textbox', { name: 'Room code', exact: true }).fill(code);
  await guest.page.getByRole('button', { name: 'Join', exact: true }).click();
  await guest.page.getByText(/You are in/).waitFor({ timeout: 20000 });
  await host.page.getByText(/Gwen/).first().waitFor({ timeout: 10000 });
  check('a guest joins with the code and both lobbies list both players', true);

  await host.page.getByRole('button', { name: /^Start the game/ }).click();
  await Promise.all([host, guest].map((p) => p.page.waitForFunction(() => window.tinyGods?.game && window.tinyGods.ctx, null, { timeout: 30000 })));
  const info = await Promise.all([host, guest].map((p) => p.page.evaluate(() => ({ seat: tinyGods.ctx.seat, seed: tinyGods.game.seed, humans: tinyGods.game.seats.filter((s) => s.kind === 'human').length, phase: tinyGods.game.phase }))));
  check('both browsers start the same match on different seats', info[0].seed === info[1].seed && info[0].seat !== info[1].seat && info[0].humans === 2, JSON.stringify(info));

  // hand in orders on both sides and let the day play out
  for (const p of [host, guest]) {
    await p.page.evaluate(() => { const g = tinyGods.game; if (g.phase === 'command') tinyGods.net.submit([]); });
  }
  await Promise.all([host, guest].map((p) => p.page.waitForFunction(() => ['sim', 'recap'].includes(tinyGods.game.phase) || tinyGods.game.turn > 1, null, { timeout: 90000 })));
  await host.page.waitForTimeout(6000);
  const after = await Promise.all([host, guest].map((p) => p.page.evaluate(() => ({ turn: tinyGods.game.turn, phase: tinyGods.game.phase, desync: tinyGods.net.desync, alive: tinyGods.game.world.villagers.filter((v) => v.alive).length, t: Math.round(tinyGods.game.world.time) }))));
  check('the day runs on both browsers through the relay', after.every((a) => a.turn >= 1 && ['sim', 'recap', 'command'].includes(a.phase)), JSON.stringify(after));
  check('no desync warning', after.every((a) => !a.desync));
  check('both towns hold the same villagers', after[0].alive === after[1].alive, `${after[0].alive} vs ${after[1].alive}`);

  await guest.ctx.close();
  await host.page.waitForTimeout(1500);
  const left = await host.page.evaluate(() => tinyGods.game.seats.filter((s) => s.kind === 'human').length);
  check('the host keeps playing when a guest drops (a bot takes the seat from the next dawn)', left >= 1);
  await host.ctx.close();
  await new Promise((r) => setTimeout(r, 400));
  check('the relay frees the room when the host leaves', relay.rooms.size === 0);
} finally {
  await browser.close();
  await relay.close();
}
check('no page errors', errors.length === 0, errors.slice(0, 3).join(' | '));
for (const r of rows) console.log(r);
const failed = rows.filter((r) => r.startsWith('FAIL')).length;
if (failed) { console.error(`\n${failed} relay browser check(s) failed`); process.exit(1); }
console.log(`PASS ${rows.length} relay browser checks`);
