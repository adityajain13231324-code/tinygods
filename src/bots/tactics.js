import { shuffle } from '../sim/rng.js';

const distance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);

/** Deliberately copy only inspectable facts. No opinions, trust, traits or enemy orders. */
export function publicPosition(world) {
  return {
    people: world.villagers.filter(v => v.alive).map(v => ({ id: v.id, faction: v.faction, x: v.x, y: v.y, hp: v.hp, weapon: v.weapon, ammo: v.ammo, state: v.state, targetId: v.targetId })),
    places: world.places.map(p => ({ id: p.id, x: p.x, y: p.y, radius: p.radius })),
    bounds: { ...world.bounds },
  };
}

/** A small emergency plan, ahead of the personality's ordinary orders. */
export function defensivePlan(info, position, rng) {
  if (info.turn <= 2) return [];
  const mine = position.people.filter(v => v.faction === info.seat);
  const foes = position.people.filter(v => v.faction >= 0 && v.faction !== info.seat);
  const threatened = v => foes.some(o => o.state === 'attack' && (o.targetId === v.id || distance(o, v) < 180));
  const hurt = shuffle(rng, mine.filter(v => v.hp <= 40 && threatened(v))).sort((a, b) => a.hp - b.hp)[0];
  const b = position.bounds;
  const safePlaces = position.places.filter(p => p.x > b.x0 + 30 && p.x < b.x1 - 30 && p.y > b.y0 + 30 && p.y < b.y1 - 30);
  const exposed = mine.filter(v => v.x < b.x0 || v.x > b.x1 || v.y < b.y0 || v.y > b.y1);
  const retreaters = hurt ? [hurt] : exposed;
  if (retreaters.length && safePlaces.length) {
    const centre = { x: retreaters.reduce((n, v) => n + v.x, 0) / retreaters.length, y: retreaters.reduce((n, v) => n + v.y, 0) / retreaters.length };
    // Avoid walking a wounded survivor into an enemy crowd just because it is close.
    const score = p => Math.min(600, ...foes.map(o => distance(p, o))) - distance(p, centre) * 0.3;
    const refuge = shuffle(rng, safePlaces).sort((a, b) => score(b) - score(a))[0];
    const orders = [{ verb: 'follow', target: { kind: 'place', id: refuge.id }, subject: { kind: 'villagers', ids: retreaters.map(v => v.id) }, strength: 1 }];
    const helpers = hurt ? mine.filter(v => v.id !== hurt.id && v.hp > 55).sort((a, b) => distance(a, hurt) - distance(b, hurt)).slice(0, 2) : [];
    if (helpers.length) orders.push({ verb: 'escort', target: { kind: 'villager', id: hurt.id }, subject: { kind: 'villagers', ids: helpers.map(v => v.id) }, strength: 1 });
    return orders;
  }
  if (['pacifist', 'gossip'].includes(info.personality) && (info.lostSomeone || mine.length <= 4)) {
    return [{ verb: 'protect', target: { kind: 'group', id: info.seat }, strength: 2 }];
  }
  return [];
}
