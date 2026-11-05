import { TURN, POWERS } from '../config/tunables.js';

export function powerUnlockError(game, id) {
  if (['fireball', 'lightning', 'earthquake', 'timebomb', 'whirlpool', 'launcher', 'blackout'].includes(id) && game.turn < TURN.damagingAreaTurn) return `Damaging area miracles unlock on day ${TURN.damagingAreaTurn}.`;
  if (game.world.peaceful) return `Miracles unlock on day ${TURN.peaceTurns + 1}. The town is still at peace.`;
  if (id === 'enrage' && game.world.time < game.world.blackoutUntil) return 'Blackout confusion prevents new attacks. Wait for daylight.';
  if (id === 'timebomb' && game.phase === 'sim' && game.simSeconds - game.simElapsed < POWERS.timebomb.seconds) return 'Time Bomb needs 12 seconds before dusk to explode. Save your power for another miracle.';
  return null;
}

export function cardUnlockError(game, id) {
  if (id === 'bomb' && game.turn < TURN.damagingAreaTurn) return `Time Bomb unlocks on day ${TURN.damagingAreaTurn}.`;
  if (id === 'kidnap' && game.world.peaceful) return `Kidnap unlocks on day ${TURN.peaceTurns + 1}.`;
  return null;
}
