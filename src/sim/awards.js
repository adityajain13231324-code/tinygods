import { FACTIONS } from '../config/content.js';

// End titles use only recorded match events. They never change the simulation.
export function buildAwards(world) {
  const villagers = world.villagers ?? [];
  const events = world.events ?? [];
  const names = (id) => villagers[id]?.name ?? `Villager ${id + 1}`;
  const scores = new Map();
  const add = (id, points) => {
    if (!Number.isInteger(id) || id < 0 || !villagers[id]) return;
    scores.set(id, (scores.get(id) ?? 0) + points);
  };
  const escaped = new Map();
  const shots = new Map();
  for (const e of events) {
    if (e.type === 'kill') add(e.killerId, 3);
    if (e.type === 'rocketLaunch') add(e.shooterId, 2);
    if (e.type === 'defect') add(e.villagerId, 2);
    if (e.type === 'gunshot') {
      add(e.shooterId, 1);
      const s = shots.get(e.shooterId) ?? { total: 0, misses: 0 };
      s.total++;
      if (!e.hit) s.misses++;
      shots.set(e.shooterId, s);
      if (!e.hit && e.targetState === 'flee' && villagers[e.targetId]?.alive) escaped.set(e.targetId, (escaped.get(e.targetId) ?? 0) + 1);
    }
  }
  const best = (map, eligible = () => true) => [...map.entries()].filter(([id, value]) => eligible(id, value))
    .sort((a, b) => b[1] - a[1] || a[0] - b[0])[0];
  const awards = [];
  const chaos = best(scores, (_, score) => score >= 3);
  if (chaos) awards.push({ title: 'Most Chaotic Villager', name: names(chaos[0]), detail: 'At the centre of the most recorded trouble.' });
  const escape = best(escaped, (_, count) => count >= 2);
  if (escape) awards.push({ title: 'Best Escape', name: names(escape[0]), detail: `${escape[1]} shots missed them while fleeing. They survived.` });
  const betrayal = events.filter((e) => e.type === 'defect' && villagers[e.villagerId])
    .sort((a, b) => (scores.get(b.villagerId) ?? 0) - (scores.get(a.villagerId) ?? 0))[0];
  if (betrayal) awards.push({ title: 'Biggest Betrayal', name: names(betrayal.villagerId),
    detail: `Left the ${FACTIONS[betrayal.from]?.name ?? 'old faction'} for the ${FACTIONS[betrayal.to]?.name ?? 'new faction'}.` });
  const worst = best(new Map([...shots].map(([id, s]) => [id, s.misses])), (id, misses) => shots.get(id).total >= 3 && misses >= 3);
  if (worst) awards.push({ title: 'Worst Aim', name: names(worst[0]), detail: `${worst[1]} recorded shots missed.` });
  return awards;
}
