import { IDEAS } from '../config/tunables.js';

// Squad formations (an order with a style target). Three styles:
//   spread    keep apart from your own people: a rocket or bomb catches fewer of you, but nobody has backup.
//   together  stay close to the group's middle: allies nearby take 10% less damage, but one blast hits many.
//   centre    the weakest few are the core, the rest ring them: the core takes 20% less damage with the ring close.
// Pure steering plus a damage modifier; the order only sets v.fx.formation. Soft forces with dead zones,
// so groups do not oscillate, and they never fight the order movement (they only act while calm).

export const FORMATION_STYLES = {
  spread: { id: 'spread', name: 'Spread out', blurb: 'Keeps your villagers apart. Good against rockets and bombs; they cannot help each other.' },
  together: { id: 'together', name: 'Stick together', blurb: 'Pulls your villagers into a tight group. Allies nearby take 10% less damage, but blasts hit many at once.' },
  centre: { id: 'centre', name: 'Protect the centre', blurb: 'Your weakest few stay in the middle and the rest form a ring around them. The core takes 20% less damage while the ring holds.' },
};
export const STYLE_IDS = Object.keys(FORMATION_STYLES);

/** Recompute group centres and cores twice a second. Stored on the world so every client agrees. */
export function updateFormations(world) {
  if (world.time < (world.formationAt ?? 0)) return;
  world.formationAt = world.time + 0.5;
  const out = {};
  for (const v of world.villagers) {
    if (!v.alive || !v.fx.formation) continue;
    const key = `${v.faction}:${v.fx.formation.style}`;
    (out[key] ??= { seat: v.faction, style: v.fx.formation.style, members: [] }).members.push(v);
  }
  const groups = {};
  for (const [key, g] of Object.entries(out)) {
    const n = g.members.length;
    const cx = g.members.reduce((s, v) => s + v.x, 0) / n;
    const cy = g.members.reduce((s, v) => s + v.y, 0) / n;
    let core = [];
    if (g.style === 'centre') {
      core = g.members.slice().sort((a, b) => (a.hp + (a.weapon === 'none' ? 0 : 25)) - (b.hp + (b.weapon === 'none' ? 0 : 25)) || a.id - b.id).slice(0, Math.max(2, Math.ceil(n / 4)));
    }
    groups[key] = { cx, cy, core: core.map((v) => v.id), ring: g.members.filter((v) => !core.includes(v)).map((v) => v.id).sort((a, b) => a - b) };
  }
  world.formations = groups;
}

/** Extra desired velocity (px/s) from the formation, or null. Only for calm villagers. */
export function formationSteer(world, v) {
  const f = v.fx.formation;
  if (!f || ['attack', 'flee', 'mourn'].includes(v.state) || v.carry || v.panic > 0) return null;
  const speed = v.speed;
  if (f.style === 'spread') {
    let ax = 0, ay = 0;
    for (const o of world.villagers) {
      if (o === v || !o.alive || o.faction !== v.faction) continue;
      const dx = v.x - o.x, dy = v.y - o.y, d = Math.hypot(dx, dy);
      if (d > 0 && d < IDEAS.formation.spread) { const k = (1 - d / IDEAS.formation.spread) * speed * 1.3; ax += (dx / d) * k; ay += (dy / d) * k; }
    }
    return ax || ay ? [ax, ay] : null;
  }
  const g = world.formations?.[`${v.faction}:${f.style}`];
  if (!g) return null;
  if (f.style === 'together') {
    const dx = g.cx - v.x, dy = g.cy - v.y, d = Math.hypot(dx, dy);
    if (d <= IDEAS.formation.together * 1.15) return null; // inside the group: leave them be
    const k = Math.min(1, (d - IDEAS.formation.together) / IDEAS.formation.together) * speed * 0.9;
    return [(dx / d) * k, (dy / d) * k];
  }
  // centre: core stays at the middle, the ring spreads evenly around it
  let tx = g.cx, ty = g.cy;
  const ringIndex = g.ring.indexOf(v.id);
  if (ringIndex >= 0) {
    const a = (ringIndex / Math.max(1, g.ring.length)) * Math.PI * 2;
    tx += Math.cos(a) * IDEAS.formation.centre;
    ty += Math.sin(a) * IDEAS.formation.centre;
  }
  const dx = tx - v.x, dy = ty - v.y, d = Math.hypot(dx, dy);
  if (d < 14) return null; // close enough: dead zone against jitter
  const k = Math.min(1, d / 120) * speed * 0.9;
  return [(dx / d) * k, (dy / d) * k];
}

/** Damage multiplier from standing in a supportive formation (1 = none). */
export function supportMultiplier(world, v) {
  const f = v.fx.formation;
  if (!f) return 1;
  if (f.style === 'together') {
    const allies = world.villagers.filter((o) => o !== v && o.alive && o.faction === v.faction && Math.hypot(o.x - v.x, o.y - v.y) < 80).length;
    return allies >= 2 ? 0.9 : 1;
  }
  if (f.style === 'centre') {
    const g = world.formations?.[`${v.faction}:${f.style}`];
    const near = g ? g.ring.filter((id) => world.villagers[id].alive && Math.hypot(world.villagers[id].x - v.x, world.villagers[id].y - v.y) < 80).length : 0;
    if (g?.core.includes(v.id) && near >= 2) return 0.8;
  }
  return 1;
}
