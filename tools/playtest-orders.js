// Does a conditional order behave sensibly in whole matches? Seat 0 is scripted (guard the armory and retreat
// to the park if outnumbered, plus a rotating formation); everyone else is a bot.
//   node tools/playtest-orders.js [matchesPerLayout=4]
import { createGame, updateGame, submitOrders } from '../src/sim/turn.js';
import { LAYOUT_IDS } from '../src/sim/layouts.js';
import { STYLE_IDS } from '../src/sim/formations.js';

const N = Number(process.argv[2] ?? 4);
const seats = [{ name: 'Me', kind: 'human' }, ...[1, 2, 3].map((i) => ({ name: `B${i}`, kind: 'bot', personality: ['warmonger', 'opportunist', 'gossip'][i - 1] }))];
let problems = 0;
for (const layout of LAYOUT_IDS) {
  let triggers = 0, clears = 0, flapping = 0, reached = 0, retreatTrips = 0, turns = 0, centred = 0, formed = 0;
  for (let m = 1; m <= N; m++) {
    const g = createGame({ seed: 7000 + m * 31, seats, layout, cosmetics: false });
    let lastTurn = 0;
    const flips = new Map(); // `${turn}:${id}` -> number of triggers
    const trips = new Map(); // id -> {turn,start distance, at time}
    let guard = 0;
    const seen = new WeakSet();
    while (g.phase !== 'ended' && guard++ < 90000) {
      if (g.phase === 'command' && g.turn !== lastTurn) {
        lastTurn = g.turn; turns++;
        const orders = [{ verb: 'protect', target: { kind: 'place', id: 'armory' }, strength: 2, when: { cond: 'outnumbered', retreat: 'park' } }, { verb: 'formation', target: { kind: 'style', id: STYLE_IDS[g.turn % 3] }, strength: 1 }];
        const r = submitOrders(g, 0, g.eliminated[0] ? [] : orders.filter((o) => g.influence[0] >= o.strength));
        void r;
      }
      updateGame(g, g.phase === 'command' ? 30 : 0.05);
      if (g.phase !== 'sim') continue;
      const w = g.world;
      const park = w.places.find((p) => p.id === 'park');
      for (const e of w.events.slice(-12)) {
        if (seen.has(e)) continue;
        seen.add(e);
        if (e.type === 'conditionTriggered') {
          triggers++;
          const k = `${e.turn}:${e.villagerId}`;
          flips.set(k, (flips.get(k) ?? 0) + 1);
          if (flips.get(k) === 3) flapping++;
          const v = w.villagers[e.villagerId];
          trips.set(e.villagerId, { t: w.time, d0: Math.hypot(v.x - park.x, v.y - park.y) });
        }
        if (e.type === 'conditionCleared') clears++;
      }
      for (const [id, trip] of trips) {
        if (w.time - trip.t < 9) continue;
        trips.delete(id);
        const v = w.villagers[id];
        if (!v.alive) continue;
        retreatTrips++;
        if (Math.hypot(v.x - park.x, v.y - park.y) < trip.d0 * 0.7 || Math.hypot(v.x - park.x, v.y - park.y) < park.radius * 1.4 || !v.whenActive) reached++;
      }
      if (Math.floor(w.time * 20) % 100 === 0) {
        const crew = w.villagers.filter((v) => v.alive && v.faction === 0 && v.fx.formation);
        if (crew.length >= 4) { formed++; const cx = crew.reduce((s, v) => s + v.x, 0) / crew.length, cy = crew.reduce((s, v) => s + v.y, 0) / crew.length; if (crew.every((v) => Number.isFinite(v.x) && Math.hypot(v.x - cx, v.y - cy) < 1500)) centred++; }
      }
    }
  }
  const bad = flapping > 0 || (retreatTrips >= 5 && reached / retreatTrips < 0.6) || centred < formed * 0.95;
  if (bad) problems++;
  console.log(`${layout.padEnd(8)} turns ${turns}  fallback triggers ${triggers} clears ${clears}  flapping villagers ${flapping}  retreats that made progress ${reached}/${retreatTrips}  formation samples sane ${centred}/${formed} ${bad ? '  <-- CHECK' : ''}`);
}
process.exit(problems ? 1 : 0);
