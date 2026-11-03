// A tiny memory of how each pair of villagers got to blows: argued, scuffled, drew a weapon.
// It is only used to EXPLAIN a kill on screen ("it began with an argument...") and never
// affects behaviour. It does not reveal whose order caused anything.

const key = (a, b) => (a < b ? a * 1000 + b : b * 1000 + a);

export function logPair(world, a, b, kind, detail = null) {
  if (!world.cosmetics) return; // headless runs don't need the story
  const k = key(a.id, b.id);
  const entry = world.pairLog.get(k) ?? {};
  if (!entry[kind]) {
    entry[kind] = { time: world.time, detail };
    world.pairLog.set(k, entry);
  }
}

/** What led up to this kill? { argued, scuffled, weapon (name or null), warned (any build-up at all) } */
export function chainFor(world, killer, victim) {
  const e = world.pairLog.get(key(killer.id, victim.id));
  return {
    argued: !!e?.argue,
    scuffled: !!e?.scuffle,
    weapon: e?.weapon?.detail ?? null,
    warned: !!(e?.argue || e?.scuffle),
  };
}
