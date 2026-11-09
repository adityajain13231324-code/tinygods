// Exploratory AI probes (not pass/fail unit tests): stuck villagers, state flapping, cover use and item
// pickup, across every layout and mode.   node tools/playtest.js [seedsPerSetup=2]
import { createGame, updateGame } from '../src/sim/turn.js';
import { stepWorld } from '../src/sim/brain.js';
import { LAYOUT_IDS, isWater } from '../src/sim/layouts.js';
import { MODE_IDS } from '../src/sim/modes.js';
import { effectiveWeapon } from '../src/sim/villager.js';
import { IDEAS } from '../src/config/tunables.js';

const SEEDS = Number(process.argv[2] ?? 2);
const seats = (s) => Array.from({ length: 4 }, (_, i) => ({ name: `B${i}`, kind: 'bot', personality: ['warmonger', 'pacifist', 'gossip', 'opportunist', 'chaos'][(s + i) % 5] }));
const found = [];
const note = (kind, text) => { if (found.filter((f) => f.kind === kind).length < 4) found.push({ kind, text }); };
const totals = { stuck: 0, samples: 0, flaps: 0, coverRuns: 0, coverReached: 0, drops: 0, pickedUp: 0, dropExpired: 0, condFlips: 0, condTriggers: 0 };

for (const layout of LAYOUT_IDS) for (const mode of MODE_IDS) for (let s = 1; s <= SEEDS; s++) {
  const g = createGame({ seed: 4000 + s * 17, seats: seats(s), layout, mode, cosmetics: false });
  const hist = new Map(); // id -> [{t,x,y,state}]
  let tick = 0;
  const seenCover = new Set();
  while (g.phase !== 'ended' && tick < 90000) {
    updateGame(g, g.phase === 'command' ? 30 : 0.05);
    tick++;
    if (g.phase !== 'sim' || tick % 20 !== 0) continue;
    const w = g.world;
    for (const v of w.villagers) {
      if (!v.alive) continue;
      const h = hist.get(v.id) ?? hist.set(v.id, []).get(v.id);
      h.push({ t: w.time, x: v.x, y: v.y, state: v.state, purpose: v.purpose, tx: v.targetX, ty: v.targetY, turn: w.turn });
      if (h.length > 14) h.shift();
      if (v.coverSpot && !seenCover.has(v.id + ':' + v.coverSpot.propId + ':' + Math.floor(w.time / 20))) { seenCover.add(v.id + ':' + v.coverSpot.propId + ':' + Math.floor(w.time / 20)); totals.coverRuns++; }
      if (v.coverSpot && Math.hypot(v.coverSpot.x - v.x, v.coverSpot.y - v.y) < 25) totals.coverReached++;
      if (h.length >= 12 && h.at(-1).turn === h[0].turn) {
        totals.samples++;
        const moved = Math.hypot(h.at(-1).x - h[0].x, h.at(-1).y - h[0].y);
        const walking = h.every((p) => ['wander', 'seek', 'attack', 'guard'].includes(p.state));
        const far = v.state === 'wander' ? Math.hypot(v.targetX - v.x, v.targetY - v.y) > 70 : v.state === 'attack' ? Math.hypot(w.villagers[v.targetId]?.x - v.x, w.villagers[v.targetId]?.y - v.y) > 90 : false;
        if (walking && far && moved < 6 && v.frozenUntil < w.time && !v.carry && !v.carrying && w.time >= w.blackoutUntil) {
          totals.stuck++;
          note('stuck', `${layout}/${mode} seed ${s} T${w.turn}: ${v.name} ${v.state}/${v.purpose} at ${v.x.toFixed(0)},${v.y.toFixed(0)} wants ${v.targetX.toFixed(0)},${v.targetY.toFixed(0)} moved ${moved.toFixed(1)}px in 11s${isWater(w.canals, v.x, v.y) ? ' IN WATER' : ''}`);
        }
        const flips = h.reduce((n, p, i) => n + (i && p.state !== h[i - 1].state ? 1 : 0), 0);
        if (flips >= 10) { totals.flaps++; note('flap', `${layout}/${mode} T${w.turn}: ${v.name} changed state ${flips} times in 11s (${h.map((p) => p.state[0]).join('')})`); }
      }
    }
  }
  const ev = g.world.events;
  totals.drops += ev.filter((e) => e.type === 'weaponDropRoll' && e.dropped).length;
  totals.pickedUp += ev.filter((e) => e.type === 'weaponPickup' && e.fromDeadId >= 0).length;
  totals.dropExpired += ev.filter((e) => e.type === 'weaponDespawn').length;
  totals.condTriggers += ev.filter((e) => e.type === 'conditionTriggered').length;
}

console.log(`setups: ${LAYOUT_IDS.length * MODE_IDS.length * SEEDS} matches`);
console.log(JSON.stringify(totals));
console.log(`stuck samples ${totals.stuck}/${totals.samples} (${(100 * totals.stuck / Math.max(1, totals.samples)).toFixed(2)}%), flaps ${totals.flaps}`);
console.log(`dropped weapons: ${totals.drops} dropped, ${totals.pickedUp} picked up, ${totals.dropExpired} expired unclaimed`);
console.log(`cover: ${totals.coverRuns} runs started, ${totals.coverReached} samples at the cover spot`);
for (const f of found) console.log(`  [${f.kind}] ${f.text}`);
void stepWorld; void IDEAS; void effectiveWeapon;
