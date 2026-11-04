import { DIFFICULTY, POPULATION } from '../config/tunables.js';
import { livingByFaction } from '../sim/win.js';
import { validateOrders } from '../sim/orders.js';
import { PERSONALITIES } from './personalities.js';
import { CARD_DEFS } from '../sim/cards.js';
import { castPower, hotspot } from '../sim/powers.js';
import { groupOf } from '../sim/villager.js';
import { shuffle } from '../sim/rng.js';

/**
 * A bot's guesses for the turn's highlights. It reasons only from what any player can see:
 * which faction did the killing, and who is doing best. (It never reads highlight.truthSeat.)
 * @returns {Record<string, number>} highlightId -> guessed seat (or -1 for "nobody")
 */
export function botGuesses(game, seat) {
  const rng = game.botRng;
  const living = livingByFaction(game.world);
  const rivals = [0, 1, 2, 3].filter((s) => s !== seat && living[s] > 0);
  const out = {};
  for (const h of game.highlights) {
    const roll = rng();
    if (roll < 0.15) {
      out[h.id] = Math.floor(rng() * 5) - 1; // a wild guess
    } else if (h.killerFaction >= 0 && roll < 0.75) {
      out[h.id] = h.killerFaction; // "whoever's villagers did the killing probably ordered it"
    } else if (rivals.length > 0) {
      // "who benefits": the strongest rival
      out[h.id] = rivals.sort((a, b) => living[b] - living[a])[0];
    } else {
      out[h.id] = -1;
    }
  }
  return out;
}

/** How hard this bot plays (per seat, else the game's setting). */
export const difficultyOf = (game, seat) => DIFFICULTY[game.seats[seat].difficulty ?? game.difficulty] ?? DIFFICULTY.normal;

/**
 * A bot's turn: same output a human produces (a list of orders).
 * It is only shown public information.
 */
export function botDecide(game, seat) {
  const living = livingByFaction(game.world);
  // Did my faction lose anyone during the last turn? (visible in the public recap)
  const last = game.recaps.at(-1);
  const before = game.recaps.at(-2)?.living[seat] ?? POPULATION.perFaction;
  const info = {
    seat,
    turn: game.turn,
    influence: game.influence[seat],
    living,
    lostSomeone: last ? last.living[seat] < before : false,
    anyKills: game.stats.firstKillTurn !== null,
    lastVerbs: game.verbsLastTurn[seat],
  };
  const personality = PERSONALITIES[game.seats[seat].personality] ?? PERSONALITIES.chaos;
  const wanted = personality(info, game.botRng);

  // Bots obey the same rules as humans (Hate cooldown, influence...): keep only what is legal.
  const legal = [];
  for (const o of wanted) {
    if (validateOrders([...legal, o], game.influence[seat], game.world, game.verbsLastTurn[seat]).ok) legal.push(o);
  }
  // Difficulty: easy bots hesitate (skip orders, push less hard); normal and hard play it all.
  const d = difficultyOf(game, seat);
  let out = legal.map((o) => ({ ...o, strength: Math.min(o.strength, d.maxStrength) }));
  if (d.orderSkip) out = out.filter(() => game.botRng() >= d.orderSkip);
  // Hard bots spend what is left on a third order: more weapons in more hands.
  if (d.extraArm && out.length < 3 && !out.some((o) => o.verb === 'arm')) {
    const left = game.influence[seat] - out.reduce((n, o) => n + o.strength, 0);
    const extra = { verb: 'arm', target: null, strength: Math.min(2, left) };
    if (left >= 1 && validateOrders([...out, extra], game.influence[seat], game.world, game.verbsLastTurn[seat]).ok) out.push(extra);
  }
  return out;
}

// ---- Cards and powers --------------------------------------------------------------

const CARD_PREFS = {
  warmonger: ["bomb", "kidnap", "rally", "raid", "spoiled", "alarm", "forged", "prophecy"],
  pacifist: ["treaty", "warchest", "truce", "medic", "alibi", "matchmaker", "bribe"],
  gossip: ["forged", "spy", "matchmaker", "bribe", "recruit", "census"],
  opportunist: ["bomb", "kidnap", "spy", "warchest", "raid", "recruit", "bribe", "census", "medic"],
  chaos: [],
};
const FRIENDLY = ["treaty", "matchmaker"]; // aimed at a rival you would rather not fight

/** Which card (if any) a bot plays this turn. Uses only its own hand and public numbers. */
export function botCard(game, seat) {
  const hand = game.hand[seat];
  if (!hand.length) return null;
  const rng = game.botRng;
  const personality = game.seats[seat].personality ?? "chaos";
  if (rng() > difficultyOf(game, seat).cardRate) return null;
  const prefs = CARD_PREFS[personality] ?? [];
  const id = prefs.find((c) => hand.includes(c)) ?? hand[Math.floor(rng() * hand.length)];
  const living = livingByFaction(game.world);
  const rivals = shuffle(rng, [0, 1, 2, 3].filter((s) => s !== seat && living[s] > 0)); // shuffled: ties must not favour low seats
  const needsGroup = CARD_DEFS[id].needs === "group";
  if (CARD_DEFS[id].needs === "place") {
    // bomb the place where the most rival villagers are standing right now (public information)
    const rivalSet = new Set(rivals);
    let best = null;
    let bestN = 0;
    for (const p of game.world.places) {
      const n = game.world.villagers.filter((v) => v.alive && rivalSet.has(v.faction) && Math.hypot(v.x - p.x, v.y - p.y) < p.radius + 60).length;
      const mineHere = game.world.villagers.filter((v) => v.alive && v.faction === seat && Math.hypot(v.x - p.x, v.y - p.y) < p.radius + 60).length;
      if (n - mineHere * 2 > bestN) { bestN = n - mineHere * 2; best = p; }
    }
    return best ? { id, place: best.id } : null;
  }
  if (needsGroup && rivals.length === 0) return null;
  const strongest = rivals.slice().sort((a, b) => living[b] - living[a])[0];
  const group = FRIENDLY.includes(id) || id === "spy" ? rivals[0] : strongest;
  return needsGroup ? { id, group } : { id };
}

/** One live miracle per call, if a bot sees a good use for its power points. */
export function botPowers(game) {
  const { world } = game;
  const rng = game.botRng;
  game.seats.forEach((s, seat) => {
    if (s.kind !== 'bot' || game.eliminated[seat] || game.power[seat] <= 0) return;
    const d = difficultyOf(game, seat);
    if (rng() < d.powerSkip) return; // sometimes just watch
    const mine = world.villagers.filter((v) => v.alive && v.faction === seat);
    const hurt = mine.filter((v) => v.hp < 45).sort((a, b) => a.hp - b.hp)[0];
    const spot = hotspot(world);
    const myFight = spot && world.villagers.some((v) => v.alive && v.faction === seat && v.state === 'attack' && Math.hypot(v.x - spot.x, v.y - spot.y) < 130);
    const personality = s.personality ?? 'chaos';
    if (hurt && rng() < 0.7 && castPower(game, seat, 'miracle', { villagerId: hurt.id }).ok) return;
    // Offence: a fireball or tornado on the biggest crowd of rivals that has none of mine in it.
    if (d.offence && (personality === 'warmonger' || personality === 'opportunist' || personality === 'chaos')) {
      const foes = world.villagers.filter((v) => v.alive && v.faction !== seat);
      const crowd = foes.map((m) => ({ m, n: foes.filter((o) => Math.hypot(o.x - m.x, o.y - m.y) < 90).length, own: mine.filter((o) => Math.hypot(o.x - m.x, o.y - m.y) < 130).length }))
        .filter((c) => c.own === 0).sort((p, q) => q.n - p.n)[0];
      if (crowd && crowd.n >= 3 && game.power[seat] >= 2) {
        if (castPower(game, seat, rng() < 0.6 ? 'fireball' : 'tornado', { x: crowd.m.x, y: crowd.m.y }).ok) return;
      }
      const armed = foes.filter((v) => v.weapon !== 'none' && v.state === 'attack')[0];
      if (armed && game.power[seat] >= 2 && castPower(game, seat, 'disarm', { x: armed.x, y: armed.y }).ok) return;
    }
    // Defence: shield a hurt villager, or call rain over a fight that is not mine to win.
    if (hurt && rng() < 0.2 && castPower(game, seat, 'aegis', { villagerId: hurt.id }).ok) return;
    if ((personality === 'pacifist' || personality === 'gossip') && hotspot(world) && rng() < 0.25 && castPower(game, seat, 'rain', { x: hotspot(world).x, y: hotspot(world).y }).ok) return;
    if (spot && myFight && spot.n >= 3 && personality !== 'warmonger' && castPower(game, seat, 'lightning', { x: spot.x, y: spot.y }).ok) return;
    if (spot && personality === 'pacifist' && castPower(game, seat, 'fog', { x: spot.x, y: spot.y }).ok) return;
    if (d.offence && (personality === 'warmonger' || personality === 'chaos' || personality === 'gossip')) {
      const living = livingByFaction(world);
      const rivals = [0, 1, 2, 3].filter((g) => g !== seat && living[g] > 0);
      if (rivals.length === 0) return;
      const g = rivals.sort((a, b) => living[b] - living[a])[0];
      const target = world.villagers.filter((v) => v.alive && groupOf(v) !== g && groupOf(v) !== seat);
      if (target.length) castPower(game, seat, 'whisper', { villagerId: target[Math.floor(rng() * target.length)].id, group: g });
    }
  });
}
