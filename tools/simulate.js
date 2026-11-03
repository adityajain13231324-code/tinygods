// Headless balance testing: plays many bot-only matches in plain Node and prints stats.
//
//   node tools/simulate.js --matches 1000 --bots mixed --seed 1
//   --bots mixed | warmonger | pacifist | opportunist | chaos
//   --threads N   (default: all CPU cores)
//
// Seats 0..3 = Embers, Tides, Sprouts, Sparks.

import { Worker, isMainThread, parentPort, workerData } from 'node:worker_threads';
import os from 'node:os';
import { createGame, runToEnd } from '../src/sim/turn.js';
import { mulberry32, shuffle } from '../src/sim/rng.js';
import { PERSONALITY_NAMES } from '../src/bots/personalities.js';
import { FACTIONS } from '../src/config/content.js';

function parseArgs(argv) {
  const args = { matches: 200, bots: 'mixed', seed: 1, threads: os.cpus().length };
  for (let i = 0; i < argv.length; i += 2) {
    const key = argv[i].replace(/^--/, '');
    args[key] = key === 'bots' ? argv[i + 1] : Number(argv[i + 1]);
  }
  return args;
}

function personalitiesFor(mode, matchSeed) {
  if (mode !== 'mixed') return new Array(4).fill(mode);
  // Shuffle which personality sits in which seat, so no seat is favoured by its bot type.
  const rng = mulberry32(matchSeed * 7919);
  return shuffle(rng, PERSONALITY_NAMES).slice(0, 4);
}

function playMatch(matchSeed, mode) {
  const personalities = personalitiesFor(mode, matchSeed);
  const seats = personalities.map((personality, i) => ({ name: FACTIONS[i].name, kind: 'bot', personality }));
  const game = runToEnd(createGame({ seed: matchSeed, seats, cosmetics: false }));
  const s = game.stats;
  return {
    seed: matchSeed,
    personalities,
    turns: game.turn,
    winner: game.winner,
    firstKillTurn: s.firstKillTurn,
    firstKilledFaction: s.firstKilledFaction,
    maxLead: s.maxLead,
    deaths: s.deathsPerTurn.reduce((a, b) => a + b, 0),
    deathsPerTurn: s.deathsPerTurn,
    earlyWipe: s.eliminatedTurn.some((t) => t !== null && t < 3),
    over3: game.turn <= 3,
    guessRight: s.guessRight.reduce((a, b) => a + b, 0),
    guessTotal: s.guessTotal.reduce((a, b) => a + b, 0),
    highlights: game.allHighlights.length,
    nobody: game.allHighlights.filter((h) => h.truthSeat === -1).length,
    defections: game.world.events.filter((e) => e.type === 'defect' && e.from >= 0).length,
    recruits: game.world.events.filter((e) => e.type === 'defect' && e.from < 0).length,
    killerWasCause: game.allHighlights.filter((h) => h.truthSeat === h.killerFaction).length,
  };
}

if (!isMainThread) {
  const { seeds, mode } = workerData;
  parentPort.postMessage(seeds.map((s) => playMatch(s, mode)));
} else {
  main();
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const seeds = Array.from({ length: args.matches }, (_, i) => args.seed * 100000 + i);
  const threads = Math.max(1, Math.min(args.threads, args.matches));
  const started = performance.now();

  const slices = Array.from({ length: threads }, () => []);
  seeds.forEach((s, i) => slices[i % threads].push(s));
  const results = (await Promise.all(slices.map((seedsSlice) => new Promise((resolve, reject) => {
    const w = new Worker(new URL(import.meta.url), { workerData: { seeds: seedsSlice, mode: args.bots } });
    w.on('message', resolve);
    w.on('error', reject);
  })))).flat();

  report(results, args, performance.now() - started);
}

const pct = (n, total) => `${((n / total) * 100).toFixed(1)}%`;
const avg = (arr) => (arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : 0);

function report(results, args, ms) {
  const n = results.length;
  const sum = (key) => results.reduce((a, r) => a + r[key], 0);
  console.log(`\n${n} matches, bots=${args.bots}, seed=${args.seed}  (${(ms / 1000).toFixed(1)}s on ${args.threads} threads)\n`);

  console.log(`average turns per match:      ${avg(results.map((r) => r.turns)).toFixed(2)}`);
  const turnCounts = {};
  for (const r of results) turnCounts[r.turns] = (turnCounts[r.turns] ?? 0) + 1;
  console.log(`  length spread:              ${Object.entries(turnCounts).map(([t, c]) => `${t}:${c}`).join('  ')}`);
  const killed = results.filter((r) => r.firstKillTurn !== null);
  console.log(`average first-kill turn:      ${avg(killed.map((r) => r.firstKillTurn)).toFixed(2)}  (no kills at all in ${n - killed.length} matches)`);
  console.log(`average deaths per match:     ${avg(results.map((r) => r.deaths)).toFixed(1)} of 60 villagers`);
  const perTurn = [];
  for (const r of results) r.deathsPerTurn.forEach((d, t) => (perTurn[t] ??= []).push(d));
  console.log(`  deaths by turn:             ${perTurn.map((d, t) => `T${t + 1}:${avg(d).toFixed(1)}`).join('  ')}`);
  console.log(`decided by turn 3:            ${pct(results.filter((r) => r.over3).length, n)}`);
  console.log(`a faction wiped before T3:    ${pct(results.filter((r) => r.earlyWipe).length, n)}   (target: under 10%)`);

  console.log('\nwin rate per seat (target: none above 35%, ideal 25%):');
  for (let f = 0; f < 4; f++) {
    const wins = results.filter((r) => r.winner === f).length;
    console.log(`  ${FACTIONS[f].name.padEnd(8)} ${pct(wins, n)}`);
  }

  const firstHit = killed.filter((r) => r.firstKilledFaction >= 0);
  const comeback = firstHit.filter((r) => r.winner === r.firstKilledFaction).length;
  console.log(`\nfirst-killed faction went on to win: ${pct(comeback, firstHit.length)}   (25% = kills don't decide it)`);
  console.log(`snowball (biggest living-count lead at a turn end): ${avg(results.map((r) => r.maxLead)).toFixed(1)} villagers`);

  console.log('\nguessing game (bots guess from public info; blind guessing would score 20%):');
  console.log(`  highlights per match:                   ${(sum('highlights') / n).toFixed(1)}`);
  console.log(`  bot guesses that were right:            ${pct(sum('guessRight'), sum('guessTotal'))}`);
  console.log(`  highlights whose true cause was "nobody": ${pct(sum('nobody'), sum('highlights'))}`);
  console.log(`  highlights where the killer's own faction was the cause: ${pct(sum('killerWasCause'), sum('highlights'))}   (if near 100% the guess is too obvious)`);

  if (args.bots === 'mixed') {
    console.log('\nwin rate by personality (when that personality played):');
    const by = {};
    for (const r of results) {
      r.personalities.forEach((p, seat) => {
        by[p] ??= { games: 0, wins: 0 };
        by[p].games++;
        if (r.winner === seat) by[p].wins++;
      });
    }
    for (const [p, v] of Object.entries(by)) console.log(`  ${p.padEnd(12)} ${pct(v.wins, v.games)}`);
  }
}
