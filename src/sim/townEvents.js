import { ARMORY, EVENTS } from '../config/tunables.js';
import { livingByFaction } from './win.js';

// A random town event at some dawns (from day 3): it changes the rules of that one turn for
// everybody, so no two matches play out the same way and the leader can never just coast.
// Rolled from its own random stream, so it never changes the town's own randomness.

export const EVENT_DEFS = {
  harvest: {
    icon: '🌾', title: 'Harvest Festival',
    text: 'The whole town is in a good mood. Old grudges soften and tempers stay cool for a while.',
    apply(game) {
      for (const v of game.world.villagers) {
        if (!v.alive) continue;
        v.calmUntil = Math.max(v.calmUntil, game.world.time + 14);
        for (let i = 0; i < v.grievance.length; i++) v.grievance[i] *= 0.6;
      }
    },
  },
  heatwave: {
    icon: '🔥', title: 'Heatwave',
    text: 'Sweat and short tempers. Everyone is quicker to fight today, so be careful what you start.',
    apply(game) {
      for (const v of game.world.villagers) {
        if (!v.alive) continue;
        v.aggression = Math.min(100, v.aggression + 12);
        v.courage = Math.min(100, v.courage + 5);
      }
    },
  },
  market: {
    icon: '💰', title: 'Market Day',
    text: 'Trade is booming: every faction collects +1 influence this turn.',
    apply(game) {
      game.influence.forEach((n, seat) => { if (!game.eliminated[seat]) game.influence[seat] = n + 1; });
    },
  },
  delivery: {
    icon: '📦', title: 'Armory Delivery',
    text: 'A cart of weapons rolls in and every armory shelf is full again. Expect more steel on the streets.',
    apply(game) { game.world.armoryPool = game.world.armoryPool.map(() => ARMORY.poolSize); },
  },
  sickness: {
    icon: '🤒', title: 'A Sickness Spreads',
    text: 'The biggest faction catches a bad cold: its villagers lose 12 hp. Underdogs, this is your moment.',
    apply(game) {
      const living = livingByFaction(game.world);
      const leader = living.indexOf(Math.max(...living));
      for (const v of game.world.villagers) if (v.alive && v.faction === leader) v.hp = Math.max(25, v.hp - 12);
      game.event.faction = leader;
    },
  },
};
const IDS = Object.keys(EVENT_DEFS);

/** Maybe pick this dawn's event and apply it. Sets game.event to {id, title, text, icon} or null. */
export function rollEvent(game) {
  game.event = null;
  if (game.turn < EVENTS.startTurn || game.eventRng() > EVENTS.chance) return;
  const options = IDS.filter((id) => id !== game.lastEventId);
  const id = options[Math.floor(game.eventRng() * options.length)];
  const def = EVENT_DEFS[id];
  game.event = { id, title: def.title, text: def.text, icon: def.icon, turn: game.turn };
  game.lastEventId = id;
  def.apply(game);
}
