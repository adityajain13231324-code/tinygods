// Bots only look at what a human player could see: living counts per faction, whether
// anyone has died yet, and their own influence. They never read hidden villager stats.

import { shuffle } from '../sim/rng.js';

const group = (id) => ({ kind: 'group', id });
const place = (id) => ({ kind: 'place', id });
const order = (verb, target, strength) => ({ verb, target, strength });

const others = (info) => [0, 1, 2, 3].filter((f) => f !== info.seat && info.living[f] > 0);

// Strongest first. Ties are broken randomly: breaking them by seat number would make
// the low-numbered factions everyone's favourite target.
const byLiving = (info, list, rng) => {
  const shuffled = shuffle(rng, list);
  return shuffled.sort((a, b) => info.living[b] - info.living[a]);
};

/** Drop or weaken orders until the list fits the influence budget (and skip duplicates). */
function fit(orders, influence) {
  const out = [];
  let left = influence;
  for (const o of orders) {
    if (out.length === 2) break;
    if (out.some((p) => p.verb === o.verb && JSON.stringify(p.target) === JSON.stringify(o.target))) continue;
    const strength = Math.min(o.strength, left);
    if (strength < 1) continue;
    out.push({ ...o, strength });
    left -= strength;
  }
  return out;
}

// Hate needs a cooling-off turn, so aggressive bots alternate: strike, then dig in and rearm.
function aggress(info, target, strength) {
  if (!info.lastVerbs.has('hate')) return order('hate', group(target), strength);
  return order('protect', group(info.seat), 2);
}

export const PERSONALITIES = {
  // Hates the strongest rival, arms early, and keeps pushing.
  warmonger(info, rng) {
    const [target] = byLiving(info, others(info), rng);
    if (target === undefined) return [];
    // Even a warmonger digs in when it is down to a handful of villagers.
    if (info.living[info.seat] <= 4) return fit([order('protect', group(info.seat), 3), order('arm', null, 1)], info.influence);
    return fit([aggress(info, target, info.turn === 1 ? 2 : 3), order('arm', null, 1)], info.influence);
  },

  // Loves, protects, and turtles up harder after taking losses.
  pacifist(info, rng) {
    const rivals = others(info);
    if (info.lostSomeone) return fit([order('arm', null, 1), order('protect', group(info.seat), 3)], info.influence);
    if (info.anyKills) return fit([order('arm', null, 1), order('love', group(rivals[0] ?? info.seat), 1)], info.influence);
    const friend = rivals[Math.floor(rng() * rivals.length)];
    if (info.turn >= 2 && !info.lastVerbs.has('arm')) return fit([order('arm', null, 2), order('love', group(friend ?? info.seat), 1)], info.influence);
    const parties = ['plaza', 'park', 'pond', 'bakery', 'market'];
    return fit([order('love', group(friend ?? info.seat), 2), order('festival', place(parties[Math.floor(rng() * parties.length)]), 1)], info.influence);
  },

  // Waits and defends until blood is spilled, then goes after the weakest rival.
  opportunist(info, rng) {
    if (!info.anyKills) return fit([order('protect', group(info.seat), 1), order('arm', null, info.turn >= 2 ? 2 : 1)], info.influence);
    const [weakest] = byLiving(info, others(info), rng).reverse();
    if (weakest === undefined) return [];
    return fit([aggress(info, weakest, 3), order('arm', null, 1)], info.influence);
  },

  // Spreads rumors about the strongest rival and talks up its own side; avoids fights.
  gossip(info, rng) {
    const [target] = byLiving(info, others(info), rng);
    if (target === undefined) return [];
    if (info.lostSomeone || info.anyKills) return fit([order('arm', null, 1), order('accuse', group(target), 2)], info.influence);
    if (info.turn >= 2 && !info.lastVerbs.has('arm')) return fit([order('arm', null, 2), order('accuse', group(target), 2)], info.influence);
    return fit([order('accuse', group(target), 2), order('praise', group(info.seat), 1)], info.influence);
  },

  // Random valid orders. Mostly here to stress-test the rules.
  chaos(info, rng) {
    const verbs = ['hate', 'love', 'fear', 'protect', 'arm', 'festival', 'accuse', 'praise'];
    const placeIds = ['plaza', 'park', 'market', 'well', 'houses', 'armory', 'pond', 'farm', 'bakery'];
    const count = 1 + Math.floor(rng() * 2);
    const orders = [];
    for (let i = 0; i < count; i++) {
      const verb = verbs[Math.floor(rng() * verbs.length)];
      const strength = 1 + Math.floor(rng() * 3);
      const anyGroup = group(Math.floor(rng() * 5));
      const anyPlace = place(placeIds[Math.floor(rng() * placeIds.length)]);
      const target = {
        hate: anyGroup, love: anyGroup, fear: anyGroup, accuse: anyGroup, praise: anyGroup,
        protect: rng() < 0.5 ? anyGroup : anyPlace,
        avoid: rng() < 0.5 ? anyGroup : anyPlace,
        follow: anyPlace, arm: null, festival: anyPlace,
      }[verb];
      orders.push(order(verb, target, strength));
    }
    return fit(orders, info.influence);
  },
};

export const PERSONALITY_NAMES = Object.keys(PERSONALITIES);
