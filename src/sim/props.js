import { IDEAS } from '../config/tunables.js';
import { PROP_KINDS, isWater } from './layouts.js';
import { scatterGoods } from './hazards.js';

// Real cover. A prop has a footprint, a cover value and hit points. It blocks some gunfire that
// passes through it, villagers duck behind it when shot at, and blasts can destroy it.
// Everything here is simulation state: no rendering, and randomness only from the world's own stream.

export const makeProps = (defs) => defs.map((d) => ({ ...d, hp: PROP_KINDS[d.kind].hp, maxHp: PROP_KINDS[d.kind].hp, alive: true }));
const half = (p) => Math.max(p.w, p.h) * 0.5 * 0.85;

function segment(px, py, ax, ay, bx, by) {
  const dx = bx - ax, dy = by - ay;
  const len2 = dx * dx + dy * dy || 1;
  const t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / len2));
  return { t, d: Math.hypot(px - (ax + dx * t), py - (ay + dy * t)) };
}

/**
 * Does a shot from `a` to `b` cross a standing prop? Returns the prop that stops it (or null).
 * The prop must be between the two (not right at the shooter's feet), and even then only a
 * share of shots are stopped: cover reduces risk, it is not a wall of invulnerability.
 */
export function coverBlocks(world, a, b) {
  let best = null;
  let bestScore = 0;
  for (const p of world.props) {
    if (!p.alive) continue;
    if (Math.hypot(p.x - a.x, p.y - a.y) < 30) continue; // the shooter is standing at it, not behind it
    const { t, d } = segment(p.x, p.y, a.x, a.y, b.x, b.y);
    if (t < 0.12 || t > 0.95 || d > half(p) + 8) continue;
    const score = PROP_KINDS[p.kind].cover * (1 - d / (half(p) + 8) * 0.4);
    if (score > bestScore) { bestScore = score; best = p; }
  }
  if (!best) return null;
  return world.rng() < IDEAS.cover.blockChance * PROP_KINDS[best.kind].cover * 1.4 ? best : null;
}

/** A blast hurts props near it. Destroyed props are removed from play (and market stalls spill their goods). */
export function damageProps(world, x, y, r, source) {
  for (const p of world.props) {
    if (!p.alive || p.hp >= 9000) continue;
    const reach = r + half(p);
    const d = Math.hypot(p.x - x, p.y - y);
    if (d > reach) continue;
    p.hp -= IDEAS.cover.blastDamage * (0.45 + 0.55 * (1 - d / reach));
    if (p.hp > 0) continue;
    p.alive = false;
    p.hp = 0;
    world.events.push({ type: 'propDestroyed', turn: world.turn, time: world.time, propId: p.id, kind: p.kind, x: p.x, y: p.y, seat: source?.seat ?? -1 });
    if (PROP_KINDS[p.kind].goods) scatterGoods(world, p.x, p.y, IDEAS.hazard.goodsPerBlast);
  }
}

/** A spot just behind the nearest suitable prop, as seen from the threat. Null if nothing useful is close. */
export function findCoverSpot(world, v, tx, ty) {
  let best = null;
  let bestD = IDEAS.cover.seekRadius;
  for (const p of world.props) {
    if (!p.alive || PROP_KINDS[p.kind].cover < 0.5) continue;
    const dv = Math.hypot(p.x - v.x, p.y - v.y);
    if (dv > bestD) continue;
    const dt = Math.hypot(p.x - tx, p.y - ty) || 1;
    if (dt < dv * 0.6) continue; // it is nearer the gunman than to me: running there is running at him
    const k = half(p) + 22;
    const spot = [p.x + ((p.x - tx) / dt) * k, p.y + ((p.y - ty) / dt) * k];
    if (isWater(world.canals, spot[0], spot[1])) continue;
    best = { x: Math.max(80, Math.min(1840, spot[0])), y: Math.max(80, Math.min(1000, spot[1])), propId: p.id };
    bestD = dv;
  }
  return best;
}
