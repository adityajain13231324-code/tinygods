import { FACTIONS, PLACES } from '../config/content.js';

// Turn the raw event log into a short news recap. Plain templates, no AI.

const placeName = (id) => PLACES.find((p) => p.id === id)?.name ?? id;
const factionName = (f) => (f >= 0 && f < FACTIONS.length ? FACTIONS[f].name : 'neutral'); // group 4 is the neutrals
const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`;

// Public news describes the visible death without exposing a secret miracle/card owner.
export function describeDeath(world, e) {
  const victim = world.villagers[e.victimId];
  const where = `at the ${placeName(e.place)}`;
  const who = `${victim.name} (${factionName(e.victimFaction)})`;
  if (e.source || ['bomb', 'fireball', 'rocket', 'whirlpool'].includes(e.weapon)) {
    const cause = { fireball: 'A fireball', rocket: 'A rocket', whirlpool: 'A whirlpool', blackout: 'A blackout', aegis: 'An Aegis-reflected bullet' }[e.source?.id ?? e.weapon] ?? 'A Time Bomb';
    return `${cause} killed ${who} ${where}`;
  }
  const killer = world.villagers[e.killerId];
  return `${killer?.name ?? 'Someone'} (${factionName(e.killerFaction)}) took down ${who} ${where}`;
}

/**
 * @param {object} world
 * @param {number} turn
 * @param {number[]} living  living count per faction after the turn
 */
export function buildRecap(world, turn, living) {
  const events = world.events.filter((e) => e.turn === turn);
  const kills = events.filter((e) => e.type === 'kill');
  const shots = events.filter((e) => e.type === 'gunshot');
  const armed = events.filter((e) => e.type === 'arm');
  const headlines = [];

  // Group deaths by place + victim group so a big brawl becomes one headline.
  const clusters = new Map();
  for (const k of kills) {
    const key = `${k.place}:${k.victimFaction}`;
    if (!clusters.has(key)) clusters.set(key, []);
    clusters.get(key).push(k);
  }
  const sorted = [...clusters.values()].sort((a, b) => b.length - a.length);
  for (const group of sorted) {
    const first = group[0];
    const place = placeName(first.place);
    const victims = `${factionName(first.victimFaction)} villager`;
    if (group.length >= 3) headlines.push(`Wide fight at the ${place}. ${plural(group.length, victims)} down.`);
    else if (group.length === 2) headlines.push(`Brawl at the ${place}: ${plural(2, victims)} fell.`);
    else {
      headlines.push(`${describeDeath(world, first)}.`);
    }
  }

  if (shots.length > 0) {
    const places = [...new Set(shots.map((s) => placeName(s.place)))];
    headlines.push(`Gunshots rang out near the ${places.join(' and the ')}.`);
  }
  if (armed.length >= 2) headlines.push(`${armed.length} villagers armed up at the Armory.`);
  // Romance and heartbreak.
  const bonds = events.filter((e) => e.type === 'bond');
  if (bonds.length > 0) {
    const e = bonds[0];
    const a = world.villagers[e.aId];
    const b = world.villagers[e.bId];
    const pair = `${a.name} (${factionName(e.aFaction)}) and ${b.name} (${factionName(e.bFaction)})`;
    headlines.push(bonds.length === 1 ? `${pair} have become inseparable.` : `${bonds.length} new pairs formed, among them ${pair}.`);
  }
  for (const e of events.filter((ev) => ev.type === 'bondBroken').slice(0, 2)) {
    const m = world.villagers[e.mournerId];
    const l = world.villagers[e.lostId];
    const k = world.villagers[e.killerId];
    headlines.push(e.source ? `${m.name} lost ${l.name} in an explosion and grieves.` : `${m.name} lost ${l.name} to ${k?.name ?? 'an attacker'} (${factionName(e.killerFaction)}) and swears revenge.`);
  }
  // Rumors: public that one is going around, but never who started it.
  for (const e of events.filter((ev) => ev.type === 'rumorStart').slice(0, 2)) {
    headlines.push(e.kind === 'accuse'
      ? `Rumor spreads: someone says the ${factionName(e.group)} are up to no good.`
      : `Word is going around that the ${factionName(e.group)} did something wonderful.`);
  }

  // Turncoats.
  const defects = events.filter((e) => e.type === 'defect');
  for (const e of defects.slice(0, 2)) {
    const v = world.villagers[e.villagerId];
    headlines.push(e.from < 0
      ? `${v.name} was won over and joined the ${factionName(e.to)}.`
      : `${v.name} abandoned the ${factionName(e.from)} ${e.to < 0 ? 'and walked away from it all' : `and joined the ${factionName(e.to)}`}.`);
  }
  if (defects.length > 2) headlines.push(`${defects.length - 2} more villagers switched sides.`);
  if (kills.length === 0 && shots.length === 0 && defects.length === 0) headlines.push('A quiet turn. The town holds its breath.');

  const standings = living.map((n, f) => `${FACTIONS[f].name} ${n}`).join(' | ');
  return {
    turn,
    headlines,
    kills: kills.map((k) => ({ ...k })),
    living: living.slice(),
    standings,
  };
}
