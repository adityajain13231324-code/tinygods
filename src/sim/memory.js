import { IDEAS } from '../config/tunables.js';

// Personal rivalries: a villager remembers a few specific others who scared, injured, robbed or
// betrayed them, and who rescued them. Small and bounded (a handful of entries each, oldest and
// weakest forgotten first). Memories lightly colour tempers and drive occasional reactions
// ("YOU again!"). Healing and real peace can bring forgiveness.

const WEIGHT = { injured: 2, scared: 1, robbed: 2, betrayed: 3, rescued: 2 };
export const isHarm = (kind) => kind !== 'rescued';

export function remember(world, v, otherId, kind) {
  if (!v?.alive || !Number.isInteger(otherId) || otherId < 0 || otherId === v.id || !WEIGHT[kind]) return;
  const list = v.memory;
  const i = list.findIndex((m) => m.id === otherId && m.kind === kind);
  if (i >= 0) { list[i].turn = world.turn; list[i].time = world.time; return; }
  list.push({ id: otherId, kind, turn: world.turn, time: world.time });
  if (list.length > IDEAS.memory.perVillager) {
    let worst = 0;
    for (let k = 1; k < list.length; k++) if (WEIGHT[list[k].kind] + list[k].turn * 0.01 < WEIGHT[list[worst].kind] + list[worst].turn * 0.01) worst = k;
    list.splice(worst, 1);
  }
}

/** How much more (or less) this villager's temper rises around each remembered person (id -> factor). */
export function memoryBias(v) {
  const out = {};
  for (const m of v.memory) out[m.id] = (out[m.id] ?? 1) * (m.kind === 'betrayed' ? 1.5 : m.kind === 'rescued' ? 0.7 : 1.3);
  return out;
}

/** Forgive the harm done by anyone matching `test`. At most a few per call, each one recorded. */
export function forgive(world, v, test, why, limit = 2) {
  let n = 0;
  for (let i = v.memory.length - 1; i >= 0 && n < limit; i--) {
    const m = v.memory[i];
    if (!isHarm(m.kind)) continue;
    const other = world.villagers[m.id];
    if (!other || !test(other)) continue;
    v.memory.splice(i, 1);
    v.grievance[m.id] = 0;
    world.events.push({ type: 'forgave', turn: world.turn, time: world.time, villagerId: v.id, otherId: m.id, kind: m.kind, why, x: v.x, y: v.y });
    n++;
  }
  return n;
}

/**
 * Called from a villager's thinking: if they bump into someone they remember, maybe react.
 * Rate-limited per villager and across the town so it stays occasional.
 */
export function memoryReact(world, v) {
  if (!v.memory.length || world.time < v.memoryCooldown || world.time < (world.lastRivalEvent ?? 0) + 0.8) return;
  let best = null;
  let bestW = 0;
  for (const m of v.memory) {
    const o = world.villagers[m.id];
    if (!o?.alive || Math.hypot(o.x - v.x, o.y - v.y) > 120) continue;
    const w = WEIGHT[m.kind] + m.turn * 0.01;
    if (w > bestW) { bestW = w; best = { m, o }; }
  }
  if (!best) return;
  v.memoryCooldown = world.time + IDEAS.memory.reactCooldown;
  if (world.rng() >= IDEAS.memory.reactChance) return;
  world.lastRivalEvent = world.time;
  world.events.push({ type: 'rivalMeet', turn: world.turn, time: world.time, villagerId: v.id, otherId: best.o.id, kind: best.m.kind, x: v.x, y: v.y });
}
