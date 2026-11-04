// Proves online play stays in sync: one host and two guests (plus a bot) play whole matches over a
// fake network with random delays, random frame times and live miracles, and every browser must
// end with exactly the same town.   node tools/net-test.js [matches]
// Exits with code 1 on any mismatch.
import { createGame, humanSeats, submitOrders } from '../src/sim/turn.js';
import { parseCommand } from '../src/sim/parser.js';
import { Lockstep, stateHash } from '../src/net/lockstep.js';
import { mulberry32 } from '../src/sim/rng.js';

const MATCHES = Number(process.argv[2] ?? 6);
const PHRASES = ['hate the tides', 'arm up', 'send three villagers to the armory', 'scare the sparks', 'hunt the tides', 'guard the plaza', 'throw a party at the pond', 'assault the sprouts', 'stand down', 'accuse the sparks'];
const POWERS = [['lightning', { x: 900, y: 600 }], ['earthquake', {}], ['fog', { x: 700, y: 500 }], ['fireball', { x: 1100, y: 400 }], ['tornado', { x: 800, y: 700 }]];
let failed = 0;

function playMatch(seed, humans, dropSeat = -1) {
  const rnd = mulberry32(seed * 977);
  const seats = [0, 1, 2, 3].map((i) => (i < humans ? { name: `P${i}`, kind: 'human' } : { name: `bot${i}`, kind: 'bot', personality: 'opportunist' }));
  const games = seats.map(() => createGame({ seed, seats: seats.map((s) => ({ ...s })) }));

  // A network with a random delay per message, delivered in order per link.
  const wires = []; // {at, to, msg}
  let clock = 0;
  const push = (to, msg, from = null) => {
    const last = wires.filter((w) => w.to === to && w.from === from).reduce((t, w) => Math.max(t, w.at), 0);
    wires.push({ at: Math.max(clock + 0.02 + rnd() * 0.18, last + 0.001), to, from, msg: JSON.parse(JSON.stringify(msg)) });
  };
  const nodes = [];
  for (let s = 0; s < humans; s++) {
    nodes.push(new Lockstep({
      game: games[s], role: s === 0 ? 'host' : 'guest', mySeat: s,
      send: (m) => push(0, m, s),
      broadcast: (m) => { for (let g = 1; g < humans; g++) push(g, m); },
    }));
  }
  let desyncs = 0;
  nodes.forEach((n, s) => {
    n.hooks.onDesync = () => desyncs++;
    n.hooks.onLastCall = () => { if (games[s].pending[s] === null) n.submit([]); }; // time is up: hand in what you have
  });

  let guard = 0;
  let dropped = false;
  while (guard++ < 400000 && !games.slice(0, humans).every((g) => g.phase === 'ended')) {
    clock += 0.016;
    // deliver what has arrived
    wires.sort((a, b) => a.at - b.at);
    while (wires.length && wires[0].at <= clock) {
      const w = wires.shift();
      if (dropSeat > 0 && dropped && (w.to === dropSeat || w.from === dropSeat)) continue; // that player is gone
      nodes[w.to].onMessage(w.from, w.msg);
    }
    if (dropSeat > 0 && !dropped && games[0].turn >= 3) { dropped = true; nodes[0].playerLeft(dropSeat); }
    for (let s = 0; s < humans; s++) {
      if (dropSeat === s && dropped) continue;
      const g = games[s];
      const n = nodes[s];
      // players act at random moments
      if (g.phase === 'command' && g.pending[s] === null && rnd() < 0.02) {
        const parsed = parseCommand(PHRASES[Math.floor(rnd() * PHRASES.length)], g, s);
        const orders = parsed.ok ? parsed.actions.filter((a) => a.kind === 'order').map((a) => a.order) : [];
        if (!n.submit(orders.slice(0, 2)).ok) n.submit([]);
      }
      if (g.phase === 'sim' && !g.world.peaceful && rnd() < 0.01) {
        const [id, args] = POWERS[Math.floor(rnd() * POWERS.length)];
        n.cast(id, args);
      }
      if (g.phase === 'recap' && rnd() < 0.03) n.ready();
      n.update(Math.min(0.1, 0.016 * (0.5 + rnd() * 2.2)) * (s === 2 ? 0.7 : 1)); // random frame times; one slow machine
    }
  }
  const alive = [...Array(humans).keys()].filter((s) => !(dropSeat === s && dropped));
  const finals = alive.map((s) => ({ seat: s, phase: games[s].phase, turn: games[s].turn, winner: games[s].winner, hash: stateHash(games[s]), kills: games[s].world.events.filter((e) => e.type === 'kill').length }));
  const same = finals.every((f) => f.hash === finals[0].hash && f.turn === finals[0].turn && f.winner === finals[0].winner && f.kills === finals[0].kills);
  return { finals, same, desyncs, ended: finals.every((f) => f.phase === 'ended') };
}

for (let m = 1; m <= MATCHES; m++) {
  const humans = 2 + (m % 3); // 2, 3 and 4 players
  const drop = m % 3 === 0 ? 1 : -1; // every third match a player vanishes mid-game
  const r = playMatch(m * 13, humans, drop);
  const ok = r.same && r.ended && r.desyncs === 0;
  if (!ok) failed++;
  console.log(`${ok ? 'PASS' : 'FAIL'}  match ${m}: ${humans} players${drop > 0 ? ' (one drops out at turn 3)' : ''}, turns ${r.finals.map((f) => f.turn).join('/')}, winners ${r.finals.map((f) => f.winner).join('/')}, kills ${r.finals.map((f) => f.kills).join('/')}, desync reports ${r.desyncs}${r.ended ? '' : ', DID NOT FINISH'}`);
}
process.exit(failed ? 1 : 0);
