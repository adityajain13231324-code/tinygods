import { ORDERS, WEAPONS } from '../config/tunables.js';
import { groupOf, isFirearm } from './villager.js';

export const WORK_VERBS = new Set(['arm', 'scare', 'follow', 'escort', 'hunt', 'assault', 'ambush', 'shove', 'seize', 'festival', 'protect', 'avoid', 'scatter', 'standdown']);
const distance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
function hash(text) { let h = 2166136261; for (const c of text) h = Math.imul(h ^ c.charCodeAt(0), 16777619); return h >>> 0; }

/** Pure, public-info squad allocation shared by actual orders and their previews. */
export function planWorkOrders(world, seat, orders) {
  const mine = world.villagers.filter(v => v.alive && v.faction === seat);
  const tasks = orders.flatMap((o, index) => {
    if (!WORK_VERBS.has(o.verb)) return [];
    const key = `${world.seed}:${world.turn}:${seat}:${o.verb}:${o.target?.kind}:${o.target?.id}`;
    const tie = v => hash(`${key}:${v.id}`);
    const target = o.target?.kind === 'villager' ? world.villagers[o.target.id]
      : o.target?.kind === 'place' ? world.places.find(p => p.id === o.target.id)
      : o.verb === 'arm' ? world.places.find(p => p.id === 'armory') : null;
    const group = o.target?.kind === 'group' ? world.villagers.filter(v => v.alive && groupOf(v) === o.target.id) : [];
    const anchor = target || (group.length ? { x: group.reduce((n, v) => n + v.x, 0) / group.length, y: group.reduce((n, v) => n + v.y, 0) / group.length } : null);
    const s = o.subject;
    let candidates = mine.filter(v => !s || s.kind === 'all' || s.kind === 'count' || s.kind === 'villagers' && s.ids.includes(v.id)
      || s.kind === 'trait' && (s.trait === 'armed' ? v.weapon !== 'none' : s.trait === 'unarmed' ? v.weapon === 'none' : v.trait === s.trait && (v.revealed || v.trait === 'gunslinger')));
    if (o.verb === 'arm') candidates = candidates.filter(v => v.weapon === 'none' || isFirearm(v.weapon) && v.ammo < WEAPONS[v.weapon].maxAmmo);
    if (o.verb === 'escort') candidates = candidates.filter(v => v.id !== o.target.id);
    if (o.verb === 'seize') candidates = candidates.filter(v => !v.fx.seize);
    const rank = (a, b) => (o.verb === 'arm' ? Number(a.weapon !== 'none') - Number(b.weapon !== 'none') : 0)
      || (o.verb === 'arm' && s?.kind === 'villagers' ? s.ids.indexOf(a.id) - s.ids.indexOf(b.id) : 0)
      || (anchor ? distance(a, anchor) - distance(b, anchor) : 0) || tie(a) - tie(b);
    candidates.sort(rank);
    if (s?.kind === 'count') candidates = candidates.slice(0, s.n);
    const explicit = s && s.kind !== 'all';
    const cap = Math.min(candidates.length, o.verb === 'arm' ? o.strength * ORDERS.armPerStrength
      : o.verb === 'hunt' ? o.strength * 2 : o.verb === 'seize' ? explicit ? 12 : o.strength + 1 : o.verb === 'assault' ? explicit ? 12 : o.strength * 3 : Infinity);
    return [{ index, o, key, candidates, rank, cap, quota: 0, assigned: new Set() }];
  });
  const total = new Set(tasks.flatMap(t => t.candidates.map(v => v.id))).size;
  // Weighted slots with caps: e.g. 12 eligible villagers and strengths 3:1 -> 9:3.
  for (let n = 0; n < total; n++) {
    const next = tasks.filter(t => t.quota < t.cap).sort((a, b) => (a.quota + 1) / a.o.strength - (b.quota + 1) / b.o.strength || hash(a.key) - hash(b.key))[0];
    if (!next) break;
    next.quota++;
  }
  // A seizure needs two people. Preserve that team minimum when enough are eligible.
  for (const task of tasks) if (task.o.verb === 'seize' && task.quota === 1 && task.cap >= 2) {
    const donor = tasks.filter(t => t !== task && t.quota > (t.o.verb === 'seize' ? 2 : 0)).sort((a, b) => b.quota - a.quota)[0];
    if (donor) { donor.quota--; task.quota++; }
  }
  const armEligible = new Set(tasks.filter(t => t.o.verb === 'arm').flatMap(t => t.candidates.filter(v => v.weapon === 'none').map(v => v.id)));
  for (const task of tasks) if (task.o.verb !== 'arm') task.candidates.sort((a, b) => Number(armEligible.has(a.id)) - Number(armEligible.has(b.id)) || task.rank(a, b));
  const owner = new Map();
  function assign(task, id) { owner.get(id)?.assigned.delete(id); owner.set(id, task); task.assigned.add(id); }
  // Reassign through an augmenting path when a broad order would steal a named squad.
  function fill(task, seen = new Set()) {
    for (const v of task.candidates) if (!owner.has(v.id) && !seen.has(v.id)) { assign(task, v.id); return true; }
    for (const v of task.candidates) {
      if (seen.has(v.id) || owner.get(v.id) === task) continue;
      seen.add(v.id);
      const previous = owner.get(v.id);
      if (previous && fill(previous, seen)) { assign(task, v.id); return true; }
    }
    return false;
  }
  const scarceFirst = tasks.slice().sort((a, b) => a.candidates.length - b.candidates.length || Number(b.o.verb === 'arm') - Number(a.o.verb === 'arm') || hash(a.key) - hash(b.key));
  for (const task of scarceFirst) while (task.assigned.size < task.quota && fill(task)) { /* fill this quota */ }
  // Subject restrictions can make a quota impossible. Share remaining feasible work fairly.
  for (let n = owner.size; n < total; n++) {
    const possible = tasks.filter(t => t.assigned.size < t.cap).sort((a, b) => (a.assigned.size + 1) / a.o.strength - (b.assigned.size + 1) / b.o.strength || hash(a.key) - hash(b.key));
    if (!possible.some(t => fill(t))) break;
  }
  return new Map(tasks.map(t => [t.index, [...t.assigned].sort((a, b) => a - b)]));
}
