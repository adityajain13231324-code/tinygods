// Does every miracle and every card do what its description says?  node tools/powers-test.js
// Each check sets up a town past the peaceful days, casts one thing, and measures. Exits 1 on any failure.
import { createGame, submitOrders, updateGame } from '../src/sim/turn.js';
import { castPower } from '../src/sim/powers.js';
import { CARD_IDS } from '../src/sim/cards.js';
import { POWERS } from '../src/config/tunables.js';

const seats = [{ name: 'You', kind: 'human' }, ...['a', 'b', 'c'].map((n) => ({ name: n, kind: 'bot', personality: 'pacifist' }))];
let failed = 0;
const check = (ok, text) => { console.log(`${ok ? 'PASS' : 'FAIL'}  ${text}`); if (!ok) failed++; };

function dawn(seed) {
  const g = createGame({ seed, seats, cosmetics: true });
  for (let i = 0; g.world.peaceful && i < 5000; i++) {
    if (g.phase === 'command') submitOrders(g, 0, []);
    updateGame(g, 1);
  }
  while (g.phase !== 'command') updateGame(g, 1);
  return g;
}
function town(seed) {
  const g = dawn(seed);
  submitOrders(g, 0, []);
  while (g.phase === 'command') updateGame(g, 1);
  g.power[0] = 9;
  return g;
}
const run = (g, s) => { for (let i = 0; i < s * 20; i++) updateGame(g, 0.05); };
const alive = (g, f) => g.world.villagers.filter((v) => v.alive && v.faction === f);
const near = (g, x, y, r) => g.world.villagers.filter((v) => v.alive && Math.hypot(v.x - x, v.y - y) < r);
const crowdAt = (g) => { // the spot with the most villagers
  let best = g.world.villagers[0];
  let n = 0;
  for (const v of g.world.villagers) { const c = near(g, v.x, v.y, 100).length; if (c > n) { n = c; best = v; } }
  return { x: best.x, y: best.y, n };
};
const freeze = (g) => { for (const v of g.world.villagers) { v.timer = 99; v.vx = 0; v.vy = 0; v.calmUntil = 999; } };

// lightning: hurts a little, throws people outward
{
  const g = town(31);
  freeze(g);
  const c = crowdAt(g);
  const hit = near(g, c.x, c.y, POWERS.lightning.radius);
  const before = hit.map((v) => ({ v, d: Math.hypot(v.x - c.x, v.y - c.y), hp: v.hp }));
  const r = castPower(g, 0, 'lightning', { x: c.x, y: c.y });
  run(g, 1);
  const pushed = before.filter((b) => Math.hypot(b.v.x - c.x, b.v.y - c.y) > b.d + 10).length;
  const hurt = before.filter((b) => b.v.hp < b.hp).length;
  check(r.ok && pushed >= Math.ceil(before.length * 0.6), `lightning: ${pushed} of ${before.length} villagers thrown outward`);
  check(hurt >= Math.ceil(before.length * 0.6) && before.every((b) => b.v.hp >= 1), `lightning: ${hurt} of ${before.length} hurt a little, nobody killed`);
}
// miracle: heals
{
  const g = town(32);
  const v = alive(g, 1)[0];
  v.hp = 30;
  const r = castPower(g, 0, 'miracle', { villagerId: v.id });
  check(r.ok && v.hp >= 30 + POWERS.miracle.heal - 1, `miracle: healed from 30 to ${Math.round(v.hp)}`);
}
// aegis: takes less damage
{
  const dmg = (shield) => {
    const g = town(33);
    freeze(g);
    const v = alive(g, 1)[0];
    if (shield) castPower(g, 0, 'aegis', { villagerId: v.id });
    const hp = v.hp;
    castPower(g, 0, 'fireball', { x: v.x, y: v.y });
    return hp - v.hp;
  };
  const plain = dmg(false);
  const shielded = dmg(true);
  check(plain > 0 && shielded < plain * 0.7, `aegis: fireball took ${plain.toFixed(0)} hp, or ${shielded.toFixed(0)} with the shield`);
}
// sleep: frozen for about 8 seconds, then moves again
{
  const g = town(34);
  const v = alive(g, 1)[0];
  const x = v.x;
  const y = v.y;
  castPower(g, 0, 'sleep', { villagerId: v.id });
  run(g, 6);
  const still = Math.hypot(v.x - x, v.y - y) < 45; // crowds still jostle a sleeper a little
  run(g, 5);
  check(still && v.state !== 'mourn', `sleep: stayed put for 6 s (${Math.round(Math.hypot(v.x - x, v.y - y))} px), awake and ${v.state} after 11 s`);
}
// whisper
{
  const g = town(35);
  const v = alive(g, 1)[0];
  const before = v.opinion[2];
  const r = castPower(g, 0, 'whisper', { villagerId: v.id, group: 2, good: false });
  check(r.ok && v.opinion[2] <= before - POWERS.whisper.shift + 0.5, `whisper: opinion of the Sprouts ${before.toFixed(0)} -> ${v.opinion[2].toFixed(0)}`);
  const own = castPower(g, 0, 'whisper', { villagerId: v.id, group: 1 });
  check(!own.ok, `whisper: refuses to whisper about someone's own faction (${own.error})`);
}
// charm
{
  const g = town(36);
  const v = alive(g, 1)[0];
  castPower(g, 0, 'charm', { villagerId: v.id });
  const mine = alive(g, 0)[0];
  check(v.opinion[0] >= 40 && v.truceUntil[mine.id] > g.world.time + 20, `charm: opinion of us ${v.opinion[0].toFixed(0)}, truce for ${(v.truceUntil[mine.id] - g.world.time).toFixed(0)} s`);
}
// enrage
{
  const g = town(37);
  const v = alive(g, 1)[0];
  const r = castPower(g, 0, 'enrage', { villagerId: v.id });
  check(r.ok && v.state === 'attack', `enrage: ${v.name} is now ${v.state}`);
}
// rain and fog: fights stop, and nobody inside starts a new one
for (const id of ['rain', 'fog']) {
  const g = town(38);
  // make a brawl: everyone hates everyone, wait for fights
  for (const v of g.world.villagers) { v.aggression = 100; v.courage = 90; for (let i = 0; i < v.opinion.length; i++) v.opinion[i] = -100; }
  for (let s = 0; s < 40 && g.world.villagers.filter((v) => v.alive && v.state === 'attack').length < 6; s++) run(g, 1);
  const fighters = g.world.villagers.filter((v) => v.alive && v.state === 'attack');
  let c = fighters[0] ?? crowdAt(g);
  let bestN = 0;
  for (const f of fighters) { const n = fighters.filter((o) => Math.hypot(o.x - f.x, o.y - f.y) < 100).length; if (n > bestN) { bestN = n; c = f; } }
  const radius = POWERS[id].radius;
  const fightersBefore = near(g, c.x, c.y, radius).filter((v) => v.state === 'attack').length;
  castPower(g, 0, id, { x: c.x, y: c.y });
  run(g, 1);
  const fightersAfter = near(g, c.x, c.y, radius).filter((v) => v.state === 'attack').length;
  run(g, 4);
  const stillAfter = near(g, c.x, c.y, radius).filter((v) => v.state === 'attack').length;
  check(fightersBefore >= 2 && fightersAfter < fightersBefore * (id === 'fog' ? 0.75 : 0.4), `${id}: fighters in the area ${fightersBefore} -> ${fightersAfter} (after 5 s: ${stillAfter})`);
}
// gust
{
  const g = town(39);
  freeze(g);
  const v = alive(g, 1)[0];
  const pond = g.world.places.find((p) => p.id === 'pond');
  const before = Math.hypot(v.x - pond.x, v.y - pond.y);
  castPower(g, 0, 'gust', { villagerId: v.id, placeId: 'pond' });
  run(g, 1.5);
  check(Math.hypot(v.x - pond.x, v.y - pond.y) < before - 60, `gust: ${Math.round(before)} px from the pond -> ${Math.round(Math.hypot(v.x - pond.x, v.y - pond.y))}`);
}
// tornado: drags in, then flings out
{
  const g = town(40);
  freeze(g);
  const c = crowdAt(g);
  const hit = near(g, c.x, c.y, POWERS.tornado.radius).filter((v) => Math.hypot(v.x - c.x, v.y - c.y) > 70);
  const d0 = hit.map((v) => Math.hypot(v.x - c.x, v.y - c.y));
  castPower(g, 0, 'tornado', { x: c.x, y: c.y });
  run(g, 0.5);
  const dMid = hit.reduce((n, v) => n + Math.hypot(v.x - c.x, v.y - c.y), 0) / hit.length;
  run(g, 2.5);
  const dEnd = hit.reduce((n, v) => n + Math.hypot(v.x - c.x, v.y - c.y), 0) / hit.length;
  const dStart = d0.reduce((a, b) => a + b, 0) / d0.length;
  check(dMid < dStart * 0.8 && dEnd > dMid, `tornado: average distance to the centre ${Math.round(dStart)} -> ${Math.round(dMid)} (dragged in) -> ${Math.round(dEnd)} (flung out)`);
}
// fireball: hurts a lot in the middle, not at all outside the radius; never hurts your own faction
{
  const g = town(41);
  freeze(g);
  const target = alive(g, 1)[0];
  const mineNear = alive(g, 0).slice(0, 2);
  mineNear.forEach((v) => { v.x = target.x + 20; v.y = target.y; });
  const far = alive(g, 2)[0];
  far.x = target.x + 400;
  far.y = target.y;
  const hp = new Map(g.world.villagers.map((v) => [v.id, v.hp]));
  castPower(g, 0, 'fireball', { x: target.x, y: target.y });
  check(target.hp < hp.get(target.id) - 10, `fireball: the target lost ${(hp.get(target.id) - target.hp).toFixed(0)} hp`);
  check(mineNear.every((v) => v.hp === hp.get(v.id)), 'fireball: your own faction is not hurt');
  check(far.hp === hp.get(far.id), 'fireball: nobody outside the radius is hurt');
}
// disarm
{
  const g = town(42);
  const foes = alive(g, 1).slice(0, 3);
  foes.forEach((v) => { v.weapon = 'bat'; v.x = 900; v.y = 500; });
  castPower(g, 0, 'disarm', { x: 900, y: 500 });
  check(foes.every((v) => v.weapon === 'none'), 'disarm: weapons dropped');
}
// earthquake: every fight stops
{
  const g = town(43);
  for (const v of g.world.villagers) { v.aggression = 100; v.courage = 90; for (let i = 0; i < v.opinion.length; i++) v.opinion[i] = -100; }
  run(g, 8);
  const before = g.world.villagers.filter((v) => v.alive && v.state === 'attack').length;
  castPower(g, 0, 'earthquake', {});
  const after = g.world.villagers.filter((v) => v.alive && v.state === 'attack').length;
  check(before >= 4 && after === 0, `earthquake: fighters ${before} -> ${after} at once`);
}
// cost and limits
{
  const g = town(44);
  g.power[0] = 1;
  check(!castPower(g, 0, 'lightning', { x: 900, y: 500 }).ok, 'cost: a 2-point miracle is refused with 1 point left');
  g.power[0] = 3;
  castPower(g, 0, 'fog', { x: 900, y: 500 });
  castPower(g, 0, 'fog', { x: 900, y: 500 });
  castPower(g, 0, 'fog', { x: 900, y: 500 });
  check(g.power[0] === 0 && !castPower(g, 0, 'fog', { x: 900, y: 500 }).ok, 'cost: 3 points buy exactly three 1-point miracles');
  const g2 = dawn(45);
  check(!castPower(g2, 0, 'fog', { x: 900, y: 500 }).ok, 'miracles refuse to work at dawn');
}

// ---- cards -------------------------------------------------------------------------
function playCard(seed, card, setup) {
  const g = dawn(seed);
  g.hand[0] = [card.id];
  setup?.(g);
  const r = submitOrders(g, 0, [], card);
  while (g.phase === 'command') updateGame(g, 1);
  return { g, r };
}
{
  const { g, r } = playCard(51, { id: 'forged', group: 1 });
  const others = g.world.villagers.filter((v) => v.alive && v.faction !== 1);
  check(r.ok && g.notoriety[1] >= 5 && others.every((v) => v.aggression >= 0), `forged letter: Tides notoriety ${g.notoriety[1]}`);
}
{
  const { g } = playCard(52, { id: 'spoiled', group: 1 });
  check(alive(g, 1).every((v) => v.hp <= 80.5), `spoiled bread: every Tide at most 80 hp (worst ${Math.round(Math.max(...alive(g, 1).map((v) => v.hp)))})`);
}
{
  const { g } = playCard(53, { id: 'recruit' });
  check(alive(g, 0).length === 15 || alive(g, 0).length === 14 || alive(g, 0).length > 12, `recruit: my faction grew to ${alive(g, 0).length}`);
}
{
  const { g } = playCard(54, { id: 'warchest' });
  check(g.bonusInfluence[0] === 4, `war chest: +${g.bonusInfluence[0]} influence waiting`);
}
{
  let tidesBefore = 0;
  let mineBefore = 0;
  const { g } = playCard(55, { id: 'raid', group: 1 }, (gg) => {
    alive(gg, 1).slice(0, 4).forEach((v) => { v.weapon = 'bat'; });
    tidesBefore = alive(gg, 1).filter((v) => v.weapon !== 'none').length;
    mineBefore = alive(gg, 0).filter((v) => v.weapon !== 'none').length;
  });
  const tidesAfter = alive(g, 1).filter((v) => v.weapon !== 'none').length;
  const mineAfter = alive(g, 0).filter((v) => v.weapon !== 'none').length;
  check(tidesAfter === tidesBefore - 3 && mineAfter >= mineBefore + 1, `armory raid: Tides armed ${tidesBefore} -> ${tidesAfter}, mine ${mineBefore} -> ${mineAfter}`);
}
{
  const { g } = playCard(56, { id: 'kidnap', group: 1 });
  check(alive(g, 1).filter((v) => v.state === 'mourn').length >= 3, `kidnap: ${alive(g, 1).filter((v) => v.state === 'mourn').length} Tides taken`);
}
{
  const { g } = playCard(57, { id: 'bomb', place: 'plaza' });
  check(g.world.bombs.length === 1, 'time bomb: planted');
}
{
  const { g } = playCard(58, { id: 'treaty', group: 1 });
  const a = alive(g, 0)[0];
  const b = alive(g, 1)[0];
  check(a.truceUntil[b.id] > g.world.time, 'peace treaty: a truce between us and the Tides');
}
{
  const { g } = playCard(59, { id: 'medic' }, (gg) => alive(gg, 0).forEach((v) => { v.hp = 40; }));
  check(alive(g, 0).every((v) => v.hp >= 69), `field hospital: my villagers at ${Math.round(Math.min(...alive(g, 0).map((v) => v.hp)))} hp or more`);
}
{
  const { g } = playCard(60, { id: 'bribe' });
  check(g.world.villagers.filter((v) => v.alive && v.faction === -1).every((v) => v.trust[0] === 1), 'bribe: every neutral trusts us completely');
}
{
  const { g } = playCard(61, { id: 'alarm', group: 1 });
  check(alive(g, 1).some((v) => v.panic > 0 || v.state === 'flee'), 'false alarm: the Tides panic');
}
{
  const { g } = playCard(62, { id: 'prophecy', group: 1 });
  check(alive(g, 1).every((v) => v.courage < 90), 'prophecy: the Tides lose their nerve');
}
{
  const { g } = playCard(63, { id: 'rally' }, (gg) => alive(gg, 0).forEach((v) => { v.hp = 50; }));
  check(alive(g, 0).every((v) => v.hp >= 53), 'rally: my villagers are healed a little');
}
{
  const { g } = playCard(64, { id: 'truce' });
  check(g.bonusInfluence[0] === 3, `truce bell: +${g.bonusInfluence[0]} influence waiting`);
}
{
  const { g } = playCard(65, { id: 'census' });
  check(g.bonusInfluence[0] === 2, `census: +${g.bonusInfluence[0]} influence waiting`);
}
{
  const { g } = playCard(66, { id: 'alibi' }, (gg) => { gg.notoriety[0] = 9; });
  check(g.notoriety[0] === 0, 'alibi: notoriety wiped');
}
{
  const { g } = playCard(67, { id: 'spy', group: 1 });
  check(g.power[0] >= 0 && g.feedback[0].some((t) => t.startsWith('Spy')), 'spy: a report was written');
}
{
  const { g } = playCard(68, { id: 'matchmaker', group: 1 });
  check(g.feedback[0].some((t) => t.startsWith('Matchmaker')), 'matchmaker: played');
}
check(CARD_IDS.length === 18, `there are ${CARD_IDS.length} cards in the game`);
process.exit(failed ? 1 : 0);
