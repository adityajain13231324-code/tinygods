import { FACTIONS, PLACES } from '../config/content.js';
import { POPULATION } from '../config/tunables.js';

// End-of-match summaries built from what actually happened: a five-line Town Story,
// some stats, and a share text. Plain templates, no AI.

const placeName = (id) => PLACES.find((p) => p.id === id)?.name ?? id;
const name = (seat) => FACTIONS[seat].name;
const label = (v) => (v.faction >= 0 ? name(v.faction) : 'neutral');

export function buildStats(game) {
  const kills = new Array(POPULATION.factions).fill(0);
  let neutralKills = 0;
  for (const e of game.world.events) {
    if (e.type !== 'kill') continue;
    if (e.killerFaction >= 0) kills[e.killerFaction]++;
    else neutralKills++;
  }
  // "Trouble" = total strength of all the hate orders a seat ever gave.
  const trouble = new Array(POPULATION.factions).fill(0);
  for (const t of game.truth) {
    for (const o of t.orders) if (o.verb === 'hate') trouble[t.seat] += o.strength;
  }
  const mostTrouble = trouble.indexOf(Math.max(...trouble));
  const bestPoints = Math.max(...game.points);
  const bestGuessers = bestPoints > 0 ? game.points.map((p, s) => (p === bestPoints ? s : -1)).filter((s) => s >= 0) : [];
  const deaths = game.stats.deathsPerTurn.reduce((a, b) => a + b, 0);
  return { kills, neutralKills, trouble, mostTrouble: Math.max(...trouble) > 0 ? mostTrouble : -1, bestGuessers, bestPoints, deaths };
}

/** Five lines that tell the story of the match. */
export function buildStory(game) {
  const { world, stats } = game;
  const s = buildStats(game);
  const lines = [];

  // 1. How the peace ended.
  const first = world.events.find((e) => e.type === 'kill');
  if (first) {
    const k = world.villagers[first.killerId];
    const v = world.villagers[first.victimId];
    const cause = game.allHighlights.find((h) => h.title.startsWith('First blood'));
    lines.push(`The town was at peace until turn ${first.turn}, when ${k.name} of the ${label(k)} took down ${v.name} of the ${label(v)} at the ${placeName(first.place)}.`
      + (cause ? ` Behind it: ${cause.reason}.` : ''));
  } else {
    lines.push('Not one villager fell. The town stayed peaceful to the very end.');
  }

  // 2. The biggest moment.
  const biggest = [...game.allHighlights].sort((a, b) => b.score - a.score).find((h) => !h.title.startsWith('First blood'));
  if (biggest) {
    lines.push(`The biggest moment came on turn ${biggest.turn}: ${biggest.title.toLowerCase()}. ${biggest.reason}.`);
  }

  // 3. Who fell, in order.
  const falls = stats.eliminatedTurn
    .map((t, f) => (t === null ? null : { f, t }))
    .filter(Boolean)
    .sort((a, b) => a.t - b.t);
  if (falls.length) lines.push(`${falls.map(({ f, t }) => `The ${name(f)} fell on turn ${t}`).join(', ')}.`);
  else lines.push('No faction was wiped out, so the turn limit decided it.');

  // 4. Who made the most trouble.
  if (s.mostTrouble >= 0) {
    lines.push(`Most of the trouble came from the ${name(s.mostTrouble)}, who spent ${s.trouble[s.mostTrouble]} points of influence on hatred.`);
  } else {
    lines.push('Nobody ordered anyone to hate anyone. The violence grew out of the town itself.');
  }

  // 5. The ending.
  const survivors = 60 - s.deaths;
  lines.push(`The ${name(game.winner)} won (${game.winReason.toLowerCase()}). ${s.deaths} villagers fell and ${survivors} remain.`);
  return lines;
}

export function shareText(game, mySeat, url) {
  const s = buildStats(game);
  const won = game.winner === mySeat;
  const right = game.stats.guessRight[mySeat];
  const total = game.stats.guessTotal[mySeat];
  return [
    `Tiny Gods: ${won ? `I led the ${name(mySeat)} to victory` : `the ${name(game.winner)} won and I lost`} after ${game.turn} turns.`,
    `${s.deaths} villagers fell.${s.mostTrouble >= 0 ? ` Most trouble: the ${name(s.mostTrouble)}.` : ''}`,
    total ? `I guessed ${right}/${total} causes right.` : '',
    `Secretly nudge a peaceful town into war, then argue about whose fault it was. ${url}`,
  ].filter(Boolean).join(' ');
}
