import { FACTIONS, GROUP_NAMES, PLACES } from '../config/content.js';
import { HIGHLIGHT, POPULATION } from '../config/tunables.js';
import { groupOf } from './villager.js';
import { livingByFaction } from './win.js';

// After each sim phase: pick the most dramatic moments, and work out (secretly) whose order
// caused each one. Players then guess; the truth is revealed after the guess.
//
// "Cause" = a seat number 0..3, or -1 when the town snapped with no order behind it.

const placeName = (id) => PLACES.find((p) => p.id === id)?.name ?? id;
const seatName = (seat) => FACTIONS[seat].name;
const label = (v) => (v.faction >= 0 ? FACTIONS[v.faction].name : 'neutral');

/**
 * Work out which seat's orders most plausibly set off a kill.
 * @returns {{seat: number, reason: string, weight: number}}
 */
export function attributeKill(game, turn, e) {
  const killer = game.world.villagers[e.killerId];
  const victimGroup = e.victimFaction >= 0 ? e.victimFaction : 4;
  const killerGroup = groupOf(killer);
  const scores = new Array(POPULATION.factions).fill(0);
  const why = new Array(POPULATION.factions).fill('');

  for (const entry of game.truth) {
    if (entry.turn !== turn) continue;
    const s = entry.seat;
    if (entry.card?.id === 'prophecy' && entry.card.group === victimGroup) {
      scores[s] += 2;
      if (!why[s]) why[s] = `${seatName(s)} prophesied doom for the ${GROUP_NAMES[victimGroup]}`;
    }
    if (entry.card?.id === 'bomb' && e.weapon === 'bomb') {
      scores[s] += 6;
      why[s] = `${seatName(s)} planted a bomb`;
    }
    for (const x of entry.extras ?? []) {
      if (x.kind === 'power' && x.villagerId === e.killerId && (x.id === 'whisper' || x.id === 'gust')) {
        scores[s] += x.id === 'whisper' ? 3 : 1.5;
        if (!why[s]) why[s] = `${seatName(s)} ${x.id === 'whisper' ? 'whispered to' : 'pushed'} the killer`;
      }
    }
    for (const o of entry.orders) {
      if (o.verb === 'hate' && o.target.id === victimGroup) {
        // Their villagers were told to hate the victim's group: direct cause if the killer is theirs.
        const w = killer.faction === s ? 3 : killer.faction === -1 ? 2 : 0;
        if (w > scores[s]) why[s] = `${seatName(s)} ordered hatred of the ${GROUP_NAMES[victimGroup]}`;
        scores[s] += w;
      } else if (o.verb === 'hate' && o.target.id === killerGroup && killerGroup !== s) {
        // The killer's group was hated by someone else, so the killer was probably defending itself.
        scores[s] += 2;
        if (!why[s]) why[s] = `${seatName(s)}'s hatred of the ${GROUP_NAMES[killerGroup]} provoked the fight`;
      } else if (o.verb === 'arm' && killer.faction === s && e.weapon !== 'none') {
        scores[s] += 1;
        if (!why[s]) why[s] = `${seatName(s)}'s arming order put a weapon in the killer's hand`;
      } else if (o.verb === 'fear' && o.target.id === killerGroup && killerGroup !== s) {
        scores[s] += 1;
        if (!why[s]) why[s] = `${seatName(s)} spread fear of the ${GROUP_NAMES[killerGroup]}`;
      }
    }
  }

  // A believed rumor about the victim's group can be what set the killer off.
  for (const r of killer.believed) {
    if (r.kind === 'accuse' && r.group === victimGroup && r.turn <= turn) {
      scores[r.seat] += 2.5;
      if (!why[r.seat]) why[r.seat] = `${seatName(r.seat)}'s rumor about the ${GROUP_NAMES[victimGroup]} had spread`;
    }
  }

  let best = -1;
  let bestScore = 0;
  scores.forEach((sc, s) => {
    if (sc > bestScore) {
      bestScore = sc;
      best = s;
    }
  });
  if (best >= 0) return { seat: best, reason: why[best], weight: bestScore };
  if (killer.faction >= 0) {
    return { seat: killer.faction, reason: `${seatName(killer.faction)} villagers were acting on grudges that had built up`, weight: 0.5 };
  }
  return { seat: -1, reason: 'The town snapped on its own: no order set it off', weight: 0.5 };
}

/** Pick this turn's top highlights. Returns plain data (safe to keep for the whole match). */
export function buildHighlights(game, turn) {
  const { world } = game;

  // Which kills finished off a whole faction? (The last kill of each faction that is now empty;
  // factions can also shrink by defection, so we do not count to 12.)
  const wiped = new Set();
  let firstBloodEvent = null;
  for (const e of world.events) {
    if (e.type === 'kill') firstBloodEvent ??= e;
  }
  const living = livingByFaction(world);
  living.forEach((n, f) => {
    if (n !== 0) return;
    const last = [...world.events].reverse().find((e) => e.type === 'kill' && e.victimFaction === f);
    if (last) wiped.add(last);
  });

  const kills = world.events.filter((e) => e.type === 'kill' && e.turn === turn);
  const shots = world.events.filter((e) => e.type === 'gunshot' && e.turn === turn);
  const score = (e) => HIGHLIGHT.killBase + e.witnesses * HIGHLIGHT.perWitness
    + ((e.weapon === 'gun' || e.weapon === 'shotgun') ? HIGHLIGHT.gunBonus : 0)
    + (wiped.has(e) ? HIGHLIGHT.wipeBonus : 0)
    + (e === firstBloodEvent ? HIGHLIGHT.firstBloodBonus : 0);

  // Cluster kills that happen at the same place close together in time: one brawl, one highlight.
  const clusters = [];
  for (const e of kills) {
    const c = clusters.find((cl) => cl.place === e.place && e.time - cl.last <= HIGHLIGHT.clusterGap);
    if (c) {
      c.events.push(e);
      c.last = e.time;
    } else {
      clusters.push({ place: e.place, last: e.time, events: [e] });
    }
  }

  const out = clusters.map((c) => {
    const events = c.events;
    const first = events[0];
    const total = events.reduce((n, e) => n + score(e), 0);

    // Vote on the cause across the cluster, weighted by how dramatic each kill was.
    const votes = new Map();
    let reason = '';
    let topWeight = -1;
    for (const e of events) {
      const a = attributeKill(game, turn, e);
      votes.set(a.seat, (votes.get(a.seat) ?? 0) + score(e));
      if (a.weight > topWeight) {
        topWeight = a.weight;
        reason = a.reason;
      }
    }
    const seat = [...votes.entries()].sort((a, b) => b[1] - a[1])[0][0];
    const reasonForSeat = seat === -1 ? 'The town snapped on its own: no order set it off'
      : attributeKillsFor(game, turn, events, seat) ?? reason;

    const killers = events.map((e) => e.killerFaction);
    const killerFaction = mode(killers);
    const place = placeName(first.place);
    let title;
    if (events.length >= 3) title = `${events.length} villagers fell at the ${place}`;
    else if (events.length === 2) title = `Two villagers fell at the ${place}`;
    else {
      const k = world.villagers[first.killerId];
      const v = world.villagers[first.victimId];
      title = `${k.name} (${label(k)}) took down ${v.name} (${label(v)}) at the ${place}`;
    }
    if (events.includes(firstBloodEvent)) title = `First blood: ${title}`;
    if (events.some((e) => wiped.has(e))) title = `The last of a faction fell. ${title}`;

    return {
      turn, title, score: total, kills: events.length, killerFaction,
      x: avg(events.map((e) => e.x)), y: avg(events.map((e) => e.y)),
      t0: first.time - HIGHLIGHT.lead, t1: events.at(-1).time + HIGHLIGHT.tail,
      truthSeat: seat, reason: reasonForSeat,
    };
  });

  // A burst of gunfire with no kill nearby can still make the cut.
  if (shots.length > 0 && !kills.some((k) => shots.some((s) => s.place === k.place))) {
    const first = shots[0];
    const shooter = world.villagers[first.shooterId];
    const seat = shooter.faction;
    out.push({
      turn, title: `Gunfire near the ${placeName(first.place)}`,
      score: HIGHLIGHT.shotBase + HIGHLIGHT.perShot * shots.length, kills: 0, killerFaction: seat,
      x: first.x, y: first.y, t0: first.time - HIGHLIGHT.lead, t1: shots.at(-1).time + HIGHLIGHT.tail,
      truthSeat: seat >= 0 ? seat : -1,
      reason: seat >= 0 ? `${seatName(seat)} armed its villagers and a gun went off` : 'A neutral with a gun panicked',
    });
  }

  out.sort((a, b) => b.score - a.score);
  return out.slice(0, HIGHLIGHT.max).map((h, i) => ({ ...h, id: `${turn}-${i}` }));
}

function attributeKillsFor(game, turn, events, seat) {
  for (const e of events) {
    const a = attributeKill(game, turn, e);
    if (a.seat === seat) return a.reason;
  }
  return null;
}

const avg = (xs) => xs.reduce((a, b) => a + b, 0) / xs.length;
function mode(xs) {
  const counts = new Map();
  for (const x of xs) counts.set(x, (counts.get(x) ?? 0) + 1);
  return [...counts.entries()].sort((a, b) => b[1] - a[1])[0][0];
}
