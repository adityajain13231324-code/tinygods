import { FACTIONS } from '../config/content.js';
import { PERSONALITY_NAMES } from '../bots/personalities.js';
import { mulberry32, shuffle } from '../sim/rng.js';

// What the lobby hands to the game when an online match starts, plus the seat layout that
// every browser must build identically (same seed -> same bot personalities).

const BOT_NAMES = { warmonger: 'Marshal Vex', pacifist: 'Sister Pearl', opportunist: 'Old Fox', gossip: 'Madam Whisper', chaos: 'Trickster Pip' };

/** names[i] is the person leading faction i; an empty or missing name means a bot with a seeded personality. */
export function makeSeats(seed, names) {
  const botTypes = shuffle(mulberry32(seed * 31), PERSONALITY_NAMES);
  let nextBot = 0;
  return FACTIONS.map((f, i) => {
    if (names[i]) return { name: names[i], kind: 'human' };
    const personality = botTypes[nextBot++];
    return { name: BOT_NAMES[personality] ?? `${f.name} bot`, kind: 'bot', personality };
  });
}

let current = null;
/** @param {{role: 'host'|'guest', room: any, mySeat: number, seed: number, names: string[], difficulty?: string, orderSecs?: number, simSecs?: number} | null} o */
export const setOnline = (o) => { current = o; };
export const getOnline = () => current;
