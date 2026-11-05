import { ORDERS } from '../config/tunables.js';
import { VERBS } from '../config/content.js';
import { groupOf } from './villager.js';
import { validateOrder } from './orders.js';
import { armoryReachable } from './world.js';
import { planWorkOrders } from './workPlan.js';

/** Read-only estimate. Random selections are shown as an eligible pool, never rolled. */
export function previewOrder(world, seat, order, orders = [order]) {
  if (!validateOrder(order, world, seat).ok) return null;
  const mine = world.villagers.filter(v => v.alive && v.faction === seat);
  const target = order.target;
  const place = target?.kind === 'place' ? world.places.find(p => p.id === target.id) : null;
  const person = target?.kind === 'villager' ? world.villagers[target.id] : null;
  const targets = person ? [person] : target?.kind === 'group' ? world.villagers.filter(v => v.alive && groupOf(v) === target.id) : [];
  let pool = mine;
  let uncertain = false;
  let limit = mine.length;
  const s = order.subject;
  const nearest = (list, p) => list.slice().sort((a, b) => Math.hypot(a.x - p.x, a.y - p.y) - Math.hypot(b.x - p.x, b.y - p.y));
  if (s?.kind === 'villagers') pool = s.ids.map(id => mine.find(v => v.id === id)).filter(Boolean);
  if (s?.kind === 'trait') pool = mine.filter(v => s.trait === 'armed' ? v.weapon !== 'none' : s.trait === 'unarmed' ? v.weapon === 'none' : v.trait === s.trait && (v.revealed || v.trait === 'gunslinger'));
  if (s?.kind === 'count') {
    limit = Math.min(s.n, pool.length);
    if (place || person) pool = nearest(pool, place || person).slice(0, limit);
    else uncertain = limit < pool.length;
  }
  if (order.verb === 'arm') {
    limit = Math.min(limit, pool.length, order.strength * ORDERS.armPerStrength);
    if (!s || s.kind === 'all' || uncertain) uncertain = limit < pool.length;
    else pool = pool.slice(0, limit);
  } else if (['hunt', 'seize', 'assault'].includes(order.verb)) {
    if (order.verb === 'seize') pool = pool.filter(v => !v.fx.seize);
    const centre = place || person || { x: targets.reduce((n, v) => n + v.x, 0) / Math.max(1, targets.length), y: targets.reduce((n, v) => n + v.y, 0) / Math.max(1, targets.length) };
    const cap = order.verb === 'hunt' ? order.strength * 2 : s && s.kind !== 'all' ? 12 : order.verb === 'seize' ? order.strength + 1 : order.strength * 3;
    limit = Math.min(limit, pool.length, cap);
    if (!uncertain) pool = nearest(pool, centre).slice(0, limit);
  }
  if (order.verb === 'escort') pool = pool.filter(v => v.id !== person.id);
  const plan = orders.includes(order) ? orders : [...orders, order];
  const work = planWorkOrders(world, seat, plan);
  const assigned = work.get(plan.indexOf(order));
  if (assigned) { pool = assigned.map(id => world.villagers[id]); limit = pool.length; uncertain = false; }
  limit = Math.min(limit, pool.length);
  const actors = pool.map(v => v.id);
  const destination = place || (order.verb === 'arm' ? world.places.find(p => p.id === 'armory') : null);
  return { actors, targets: targets.map(v => v.id), place: destination ? { x: destination.x, y: destination.y, radius: destination.radius } : null, uncertain,
    label: `${VERBS[order.verb].label}: ${uncertain ? `up to ${limit} from ${actors.length} outlined villagers` : `${actors.length} own villager${actors.length === 1 ? '' : 's'}`}${uncertain ? ' · chosen at dawn' : assigned && work.size > 1 ? ' · shared by strength' : ''}${order.verb === 'arm' && !armoryReachable(world) ? ' · armory cut off by storm' : ''}` };
}
