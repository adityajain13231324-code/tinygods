// Local progress (this browser only): matches, wins, and a few achievements to chase.

const KEY = 'tinygods.stats';

export const ACHIEVEMENTS = {
  gentle_hand: { name: 'Gentle hand', text: 'Win without any of your villagers killing anyone.' },
  whisperer: { name: 'Whisperer', text: 'Start 3 or more rumors in one match.' },
  detective: { name: 'Detective', text: 'Get 5 or more guesses right in one match.' },
  matchmaker: { name: 'Matchmaker', text: 'See 6 or more bonds form in one match.' },
  last_stand: { name: 'Last stand', text: 'Win with 3 or fewer villagers left.' },
  veteran: { name: 'Veteran', text: 'Finish 5 matches.' },
};

export function loadStats() {
  try {
    return { matches: 0, wins: 0, achievements: {}, ...JSON.parse(localStorage.getItem(KEY) ?? '{}') };
  } catch {
    return { matches: 0, wins: 0, achievements: {} };
  }
}

/** Call once when a match ends. Returns the achievements earned for the first time. */
export function recordMatch(game, humanSeats) {
  const stats = loadStats();
  const seat = humanSeats[0];
  const won = game.winner === seat;
  stats.matches++;
  if (won) stats.wins++;

  const w = game.world;
  const ownKills = w.events.filter((e) => e.type === 'kill' && e.killerFaction === seat).length;
  const living = w.villagers.filter((v) => v.alive && v.faction === seat).length;
  const earned = [];
  const award = (id) => {
    if (!stats.achievements[id]) {
      stats.achievements[id] = true;
      earned.push(id);
    }
  };
  if (won && ownKills === 0) award('gentle_hand');
  if (w.rumors.filter((r) => r.seat === seat).length >= 3) award('whisperer');
  if (game.stats.guessRight[seat] >= 5) award('detective');
  if (w.events.filter((e) => e.type === 'bond').length >= 6) award('matchmaker');
  if (won && living > 0 && living <= 3) award('last_stand');
  if (stats.matches >= 5) award('veteran');
  try { localStorage.setItem(KEY, JSON.stringify(stats)); } catch { /* ignore */ }
  return { stats, earned };
}
