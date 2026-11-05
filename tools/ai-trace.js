// Bounded decision/position traces, using the actual menu's 45-second day preset.
// node tools/ai-trace.js [matches=12] [firstSeed=17000]
import { createGame, updateGame } from '../src/sim/turn.js';
const matches = Number(process.argv[2] ?? 12), firstSeed = Number(process.argv[3] ?? 17000);
const result = { matches, simSeconds: 45, reasons: {}, reversals: {}, flagged: [], stationaryGuardsAtDestination: 0, stuckAwayFromDestination: 0 };
for (let m = 0; m < matches; m++) {
  const seed = firstSeed + m;
  const game = createGame({ seed, seats: ['warmonger', 'pacifist', 'opportunist', 'gossip'].map(personality => ({ name: personality, kind: 'bot', personality })), cosmetics: false, simSeconds: 45 });
  const histories = new Map(), lastChange = new Map(), still = new Map();
  game.world.traceDecision = e => {
    const history = histories.get(e.id) ?? [];
    const previous = history.at(-1);
    result.reasons[e.reason] = (result.reasons[e.reason] ?? 0) + 1;
    history.push(e);
    if (history.length > 48) history.shift();
    histories.set(e.id, history);
    if (e.before !== e.after) {
      const last = lastChange.get(e.id);
      if (last?.before === e.after && e.time - last.time < 2) {
        const pair = `${last.before}/${last.after}`;
        result.reversals[pair] = (result.reversals[pair] ?? 0) + 1;
        if (result.flagged.filter(f => f.kind === 'reversal').length < 16 && history.length >= 15) result.flagged.push({ kind: 'reversal', seed, id: e.id, pair, trace: history.slice() });
      }
      lastChange.set(e.id, e);
    }
    const movingState = ['wander', 'seek', 'guard'].includes(e.after);
    const t = game.world.villagers[e.targetId];
    const follower = game.world.villagers[game.world.villagers[e.id].followId];
    const target = e.after === 'guard' && follower?.alive ? follower : e.after === 'seek' && t?.alive ? t : { x: e.targetX, y: e.targetY };
    const atDestination = Math.hypot(e.x - target.x, e.y - target.y) < (e.after === 'guard' ? 65 : 30);
    const stationary = previous && Math.hypot(e.x - previous.x, e.y - previous.y) < 0.3;
    const duration = stationary && movingState ? (still.get(e.id) ?? 0) + e.time - previous.time : 0;
    still.set(e.id, duration);
    if (duration >= 15 && duration - (e.time - previous.time) < 15) {
      if (atDestination && e.after === 'guard') result.stationaryGuardsAtDestination++;
      else {
        result.stuckAwayFromDestination++;
        if (result.flagged.filter(f => f.kind === 'stuck').length < 16) result.flagged.push({ kind: 'stuck', seed, id: e.id, trace: history.slice() });
      }
    }
  };
  let safety = 0;
  while (game.phase !== 'ended' && safety++ < 500000) updateGame(game, game.phase === 'command' ? 100 : game.phase === 'recap' ? 100 : 1 / 30);
  if (game.phase !== 'ended') throw new Error(`Seed ${seed} did not finish`);
}
console.log(JSON.stringify(result, null, 2));
