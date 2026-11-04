import { TURN } from '../config/tunables.js';

export function powerUnlockError(game, id) {
  if (['fireball', 'lightning', 'earthquake'].includes(id) && game.turn < TURN.damagingAreaTurn) return `Damaging area miracles unlock on day ${TURN.damagingAreaTurn}.`;
  if (game.world.peaceful) return `Miracles unlock on day ${TURN.peaceTurns + 1}. The town is still at peace.`;
  return null;
}

export function cardUnlockError(game, id) {
  if (id === 'bomb' && game.turn < TURN.damagingAreaTurn) return `Time Bomb unlocks on day ${TURN.damagingAreaTurn}.`;
  if (id === 'kidnap' && game.world.peaceful) return `Kidnap unlocks on day ${TURN.peaceTurns + 1}.`;
  return null;
}
