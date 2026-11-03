import { POPULATION, TURN, STATS } from '../config/tunables.js';
import { groupOf } from './villager.js';

export function livingByFaction(world) {
  const n = new Array(POPULATION.factions).fill(0);
  for (const v of world.villagers) if (v.alive && v.faction >= 0) n[v.faction]++;
  return n;
}

export function hpByFaction(world) {
  const hp = new Array(POPULATION.factions).fill(0);
  for (const v of world.villagers) if (v.alive && v.faction >= 0) hp[v.faction] += v.hp;
  return hp;
}

export const factionsAlive = (living) => living.map((n, f) => (n > 0 ? f : -1)).filter((f) => f >= 0);

/**
 * Decide whether the match is over at the end of a turn.
 * @returns {{over: boolean, winner: number|null, reason: string}}
 */
export function checkWinner(game) {
  const { world, turn } = game;
  const living = livingByFaction(world);
  const alive = factionsAlive(living);

  if (alive.length === 1) return { over: true, winner: alive[0], reason: 'Last faction standing' };

  if (alive.length === 0) {
    // Everyone died: the faction that lost its last member latest wins.
    let winner = 0;
    for (let f = 1; f < game.lastDeathTime.length; f++) if (game.lastDeathTime[f] > game.lastDeathTime[winner]) winner = f;
    return { over: true, winner, reason: 'Last to fall' };
  }

  if (turn >= TURN.maxTurns) {
    // Highest score wins (survivors, rival kills, correct guesses); then most total hp; then a
    // coin flip (never "lowest seat number").
    const hp = hpByFaction(world);
    const score = capScores(game, living);
    const top = Math.max(...alive.map((f) => score[f]));
    const best = alive.filter((f) => score[f] === top);
    const bestHp = Math.max(...best.map((f) => hp[f]));
    const tied = best.filter((f) => hp[f] === bestHp);
    const winner = tied[Math.floor(world.rng() * tied.length)];
    return { over: true, winner, reason: 'Highest score at the turn limit' };
  }

  return { over: false, winner: null, reason: '' };
}

/** Score per faction used to decide the winner when nobody is wiped out by the turn limit. */
export function capScores(game, living = livingByFaction(game.world)) {
  const kills = new Array(POPULATION.factions).fill(0);
  for (const e of game.world.events) {
    if (e.type === 'kill' && e.killerFaction >= 0 && e.victimFaction >= 0 && e.killerFaction !== e.victimFaction) kills[e.killerFaction]++;
  }
  const c = TURN.capScore;
  return living.map((n, f) => n * c.perLiving + kills[f] * c.perRivalKill + game.points[f] * c.perPoint);
}

/** From the sudden-death turn on, everybody gets angrier and braver-less so matches end. */
export function applySuddenDeath(world, turn = 0) {
  // Paranoia grows every turn of the endgame, so even two peaceful factions eventually turn on each other.
  const paranoia = TURN.suddenDeathOpinion * (1 + 0.6 * Math.max(0, turn - TURN.suddenDeathTurn));
  for (const v of world.villagers) {
    if (!v.alive) continue;
    v.baseAggression = Math.min(100, v.baseAggression + TURN.suddenDeathAggression);
    v.baseCourage = Math.max(STATS.minStat, v.baseCourage + TURN.suddenDeathCourage);
    v.aggression = Math.min(100, v.aggression + TURN.suddenDeathAggression);
    v.courage = Math.max(STATS.minStat, v.courage + TURN.suddenDeathCourage);
    // Paranoia: everyone trusts every other group a little less each turn. Without this a
    // town of peaceful players would never fight and the match could not end.
    const own = groupOf(v);
    for (let g = 0; g < v.opinion.length; g++) {
      if (g !== own) v.opinion[g] = Math.max(-100, v.opinion[g] - paranoia);
    }
  }
}
