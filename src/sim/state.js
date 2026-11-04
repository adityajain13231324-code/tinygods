// Canonical simulation state for diagnostics and turn-boundary agreement. Wall clocks,
// interpolation accumulator, recording buffers and presentation-only pair history are
// deliberately excluded. Every villager value and all four RNG streams are included.
function canonical(value) {
  if (value instanceof Set) return [...value].map(canonical).sort((a, b) => String(a) < String(b) ? -1 : String(a) > String(b) ? 1 : 0);
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === 'object') return Object.fromEntries(Object.keys(value).sort().filter((k) => typeof value[k] !== 'function').map((k) => [k, canonical(value[k])]));
  if (typeof value === 'number' && !Number.isFinite(value)) return String(value);
  return value;
}

export function authoritativeState(game) {
  const { timer, acc, recorder, suggestRound, world, botRng, cardRng, eventRng, ...state } = game;
  const { rng, pairLog, dbg, cosmetics, ...town } = world;
  return canonical({ ...state, world: town, random: [rng.getState(), botRng.getState(), cardRng.getState(), eventRng.getState()] });
}

export function stateHash(game) {
  const text = JSON.stringify(authoritativeState(game));
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 16777619);
  return h | 0;
}
