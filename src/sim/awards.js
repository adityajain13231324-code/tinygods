import { HIGHLIGHT } from '../config/tunables.js';

// End titles use only recorded match events. They never change the simulation.
// Each award points at one real moment (turn, sim time, place) so the end screen can offer a short
// replay of it. A replay only exists for the last turn that was recorded; for earlier moments the
// award is explained from its event evidence instead (see `replayable`).

export function buildAwards(world, recorder = null, currentTurn = world?.turn) {
  const villagers = world.villagers ?? [];
  const events = world.events ?? [];
  const names = (id) => villagers[id]?.name ?? `Villager ${id + 1}`;
  const scores = new Map();
  const add = (id, points) => {
    if (!Number.isInteger(id) || id < 0 || !villagers[id]) return;
    scores.set(id, (scores.get(id) ?? 0) + points);
  };
  const moment = (e, x = e.x, y = e.y) => ({ turn: e.turn, time: e.time, x, y });
  const escaped = new Map();
  const shots = new Map();
  const blanks = new Map();
  const covered = new Map();
  const lastMoment = new Map(); // a villager's most recent notable moment, per award kind
  for (const e of events) {
    if (e.type === 'kill') { add(e.killerId, 3); lastMoment.set(`chaos:${e.killerId}`, moment(e)); }
    if (e.type === 'rocketLaunch') add(e.shooterId, 2);
    if (e.type === 'defect') add(e.villagerId, 2);
    if (e.type === 'gunshot' && e.blank) {
      blanks.set(e.shooterId, (blanks.get(e.shooterId) ?? 0) + 1);
      lastMoment.set(`blank:${e.shooterId}`, moment(e));
    } else if (e.type === 'gunshot') {
      add(e.shooterId, 1);
      const s = shots.get(e.shooterId) ?? { total: 0, misses: 0 };
      s.total++;
      if (!e.hit) { s.misses++; lastMoment.set(`aim:${e.shooterId}`, moment(e)); }
      shots.set(e.shooterId, s);
      if (!e.hit && villagers[e.targetId]?.alive) { escaped.set(e.targetId, (escaped.get(e.targetId) ?? 0) + 1); lastMoment.set(`escape:${e.targetId}`, moment(e, e.tx, e.ty)); }
      if (e.coverId) { covered.set(e.targetId, (covered.get(e.targetId) ?? 0) + 1); lastMoment.set(`cover:${e.targetId}`, moment(e, e.tx, e.ty)); }
    }
  }
  const best = (map, eligible = () => true) => [...map.entries()].filter(([id, value]) => eligible(id, value))
    .sort((a, b) => b[1] - a[1] || a[0] - b[0])[0];
  const awards = [];
  const push = (title, id, detail, m) => awards.push({ title, id, name: names(id), detail, moment: m ?? null, replayable: replayable(recorder, m, currentTurn) });

  const chaos = best(scores, (_, score) => score >= 3);
  if (chaos) push('Most Chaotic Villager', chaos[0], 'At the centre of the most recorded trouble.', lastMoment.get(`chaos:${chaos[0]}`));
  const escape = best(escaped, (_, count) => count >= 2);
  if (escape) push('Best Escape', escape[0], `${escape[1]} shots missed them, and they survived.`, lastMoment.get(`escape:${escape[0]}`));
  const betrayal = events.filter((e) => e.type === 'defect' && villagers[e.villagerId])
    .sort((a, b) => (scores.get(b.villagerId) ?? 0) - (scores.get(a.villagerId) ?? 0))[0];
  if (betrayal) push('Biggest Betrayal', betrayal.villagerId, 'Changed factions during the match.', moment(betrayal, villagers[betrayal.villagerId].x, villagers[betrayal.villagerId].y));
  const worst = best(new Map([...shots].map(([id, s]) => [id, s.misses])), (id, misses) => shots.get(id).total >= 3 && misses >= 3);
  if (worst) push('Worst Aim', worst[0], `${worst[1]} recorded shots missed.`, lastMoment.get(`aim:${worst[0]}`));
  const confused = best(blanks);
  if (confused) push('Most Confused Gunner', confused[0], `${confused[1]} Blank Round${confused[1] === 1 ? '' : 's'}: all confetti.`, lastMoment.get(`blank:${confused[0]}`));
  const sheltered = best(covered, (_, n) => n >= 2);
  if (sheltered) push('Cover Champion', sheltered[0], `${sheltered[1]} bullets stopped by a bench, stall or wall.`, lastMoment.get(`cover:${sheltered[0]}`));
  const theft = events.find((e) => e.type === 'weaponStolen');
  if (theft) {
    const n = events.filter((e) => e.type === 'weaponStolen' && e.thiefId === theft.thiefId).length;
    push('Sneakiest Thief', theft.thiefId, `Stole ${n} weapon${n === 1 ? '' : 's'}.`, moment(theft));
  }
  const cake = events.find((e) => e.type === 'cakeArrival');
  if (cake) push('First to the Cake', cake.villagerId, 'Arrived first when the free cake went up.', moment(cake));
  const crowned = events.find((e) => e.type === 'leaderCrowned');
  if (crowned) {
    const v = villagers[crowned.villagerId];
    const fell = events.find((e) => e.type === 'kill' && e.victimId === crowned.villagerId);
    push(v?.alive ? 'Long Live the Leader' : 'Crowned and Fallen', crowned.villagerId, v?.alive ? 'Wore the crown and survived to the end.' : 'Wore the crown, but did not survive.', fell ? moment(fell) : moment(crowned));
  }
  return awards;
}

/** True only if the recorder really holds footage of that moment (the last recorded turn, inside its time range). */
export function replayable(recorder, m, currentTurn) {
  if (!recorder || !m || m.turn !== currentTurn) return false;
  if (!recorder.frames || recorder.frames.length < 2) return false;
  return m.time >= recorder.start - 0.01 && m.time <= recorder.lastTime + 0.01;
}

/** The clip a replay control plays: a few seconds around the moment, using the same shape as a highlight. */
export const awardClip = (m) => ({ x: m.x, y: m.y, t0: m.time - HIGHLIGHT.lead, t1: m.time + HIGHLIGHT.tail, turn: m.turn });
