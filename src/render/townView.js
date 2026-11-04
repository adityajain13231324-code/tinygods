import { Container, Graphics, Rectangle, Sprite, Text } from 'pixi.js';
import { WORLD } from '../config/tunables.js';
import { mulberry32 } from '../sim/rng.js';

const INK = 0x2b2622;
const W = WORLD.width;
const H = WORLD.height;

const distToSegment = (px, py, ax, ay, bx, by) => {
  const dx = bx - ax;
  const dy = by - ay;
  const t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / (dx * dx + dy * dy || 1)));
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
};

/**
 * The town: a detailed static background (grass, curved paths, trees, buildings with
 * props), baked once into one texture, plus a small animated layer on top: swaying trees,
 * chimney smoke, pond ripples and ducks, flags, a windmill, drifting cloud shadows, and an
 * atmosphere that darkens and turns stormy as the tension rises.
 */
export class TownView {
  constructor(app, places) {
    this.places = places;
    this.root = new Container();
    this.rng = mulberry32(7); // fixed seed so the decoration never shuffles between runs
    this.time = 0;
    this.smoke = [];
    this.smokeTimer = 0;
    this.ripples = [];
    this.rain = Array.from({ length: 110 }, () => ({ x: Math.random() * W, y: Math.random() * H, s: 0.6 + Math.random() * 0.8 }));
    this.dim = 0;
    this.chimneys = [];
    this.heroTrees = [];

    const stat = this.buildStatic();
    const texture = app.renderer.generateTexture({ target: stat, frame: new Rectangle(0, 0, W, H), resolution: 1.5 });
    stat.destroy({ children: true });
    this.root.addChild(new Sprite(texture));

    // Swaying trees sit on top of the baked layer.
    this.sway = [];
    this.swayLayer = this.root.addChild(new Container());
    for (const t of this.heroTrees) {
      const c = new Container();
      c.position.set(t.x, t.y);
      c.addChild(drawTree(new Graphics(), 0, 0, t.s, t.kind));
      this.swayLayer.addChild(c);
      this.sway.push({ c, phase: t.x * 0.013, amp: 0.012 + t.s * 0.01 });
    }

    this.fx = this.root.addChild(new Graphics()); // smoke, ripples, ducks, flags, blades, rain, cloud shadows
    this.tint = this.root.addChild(new Graphics()); // the mood of the sky
    this.shade = this.root.addChild(new Graphics()); // dims the town during a camera cut

    this.labels = new Container();
    for (const p of places) {
      const label = new Text({
        text: p.name,
        style: { fontFamily: 'system-ui, sans-serif', fontSize: 15, fontWeight: '700', fill: 0xfff8e6, stroke: { color: 0x2f4a2b, width: 4 } },
      });
      label.anchor.set(0.5);
      label.alpha = 0.7;
      label.position.set(p.x, p.y + p.radius + 14);
      this.labels.addChild(label);
    }
    this.root.addChild(this.labels);
  }

  // ---- the baked background -------------------------------------------------------

  buildStatic() {
    const { places, rng } = this;
    const root = new Container();
    const g = new Graphics();
    root.addChild(g);

    // Grass: base colour, big soft patches, faint mowing stripes.
    g.rect(0, 0, W, H).fill(0x8fd074);
    for (let i = 0; i < 60; i++) g.circle(rng() * W, rng() * H, 40 + rng() * 90).fill({ color: rng() < 0.5 ? 0x84c76a : 0x9bd97f, alpha: 0.5 });
    for (let x = -H; x < W; x += 70) g.poly([x, 0, x + 35, 0, x + 35 + H, H, x + H, H]).fill({ color: 0xffffff, alpha: 0.025 });

    // Paths: wide, edged, with pebbles and ruts. They bend a little, like real ones.
    const plaza = places.find((p) => p.id === 'plaza');
    this.paths = [];
    for (const p of places) {
      if (p.id === 'plaza') continue;
      const mx = (plaza.x + p.x) / 2 + (rng() - 0.5) * 70;
      const my = (plaza.y + p.y) / 2 + (rng() - 0.5) * 70;
      this.paths.push({ a: plaza, b: p, mx, my });
    }
    for (const w of [[50, 0xcdb98a], [42, 0xe3d3a6]]) {
      for (const s of this.paths) g.moveTo(s.a.x, s.a.y).quadraticCurveTo(s.mx, s.my, s.b.x, s.b.y).stroke({ width: w[0], color: w[1], cap: 'round' });
    }
    for (const s of this.paths) {
      for (let t = 0.1; t < 0.95; t += 0.045) {
        const x = (1 - t) * (1 - t) * s.a.x + 2 * (1 - t) * t * s.mx + t * t * s.b.x + (rng() - 0.5) * 30;
        const y = (1 - t) * (1 - t) * s.a.y + 2 * (1 - t) * t * s.my + t * t * s.b.y + (rng() - 0.5) * 30;
        g.circle(x, y, 1.4 + rng() * 1.8).fill({ color: rng() < 0.5 ? 0xb8a577 : 0xf3e8c8, alpha: 0.8 });
      }
    }

    // Grass tufts, flowers and little stones.
    const onPath = (x, y) => this.paths.some((s) => {
      for (let t = 0; t <= 1; t += 0.1) {
        const px = (1 - t) * (1 - t) * s.a.x + 2 * (1 - t) * t * s.mx + t * t * s.b.x;
        const py = (1 - t) * (1 - t) * s.a.y + 2 * (1 - t) * t * s.my + t * t * s.b.y;
        if (Math.hypot(x - px, y - py) < 34) return true;
      }
      return false;
    });
    const nearPlace = (x, y, extra) => places.some((p) => Math.hypot(x - p.x, y - p.y) < p.radius + extra) || (this.cottages ?? []).some((c) => Math.hypot(x - c.x, y - c.y) < 62 + extra);
    for (let i = 0; i < 260; i++) {
      const x = rng() * W;
      const y = rng() * H;
      if (nearPlace(x, y, 10) || onPath(x, y)) continue;
      g.moveTo(x - 3, y).lineTo(x - 1, y - 6).moveTo(x, y).lineTo(x, y - 8).moveTo(x + 3, y).lineTo(x + 1, y - 6).stroke({ width: 1.5, color: 0x5faa4d, cap: 'round' });
    }
    const petals = [0xffffff, 0xffe27a, 0xffb3c7, 0xc9b6ff];
    for (let i = 0; i < 36; i++) {
      const x = rng() * W;
      const y = rng() * H;
      if (nearPlace(x, y, 20) || onPath(x, y)) continue;
      const c = petals[Math.floor(rng() * petals.length)];
      for (let k = 0; k < 4; k++) {
        const a = rng() * 6.28;
        g.circle(x + Math.cos(a) * 6, y + Math.sin(a) * 6, 2.5).fill(c);
      }
    }
    for (let i = 0; i < 12; i++) {
      const x = rng() * W;
      const y = rng() * H;
      if (nearPlace(x, y, 20) || onPath(x, y)) continue;
      g.ellipse(x, y, 7, 4.5).fill(0x9a9a9a).stroke({ width: 1.5, color: 0x6e6e6e });
    }

    // Places first (so trees can avoid them), then the trees and bushes.
    for (const p of places) {
      const draw = PLACE_DRAWERS[p.id];
      if (draw) draw.call(this, g, p, rng);
    }
    // Cottages and farmsteads out between the places, so the town feels lived in.
    const spots = [
      [150, 560, 0xc45a3a, 56, 0], [230, 640, 0x5a7fc4, 54, 1], [1790, 560, 0x8a5ac4, 56, 0], [1700, 650, 0xc48a3a, 52, 2],
      [760, 870, 0x3f9a6a, 54, 2], [1150, 930, 0xc45a3a, 56, 0], [1230, 150, 0x5a7fc4, 54, 1], [700, 130, 0xc48a3a, 52, 2],
      [90, 140, 0x8a5ac4, 54, 0], [1830, 140, 0x3f9a6a, 54, 0], [1830, 980, 0xc45a3a, 54, 1], [1050, 1010, 0x8a5ac4, 52, 0],
    ];
    this.cottages = spots.map(([x, y]) => ({ x, y }));
    spots.forEach(([x, y, roof, w, style], i) => {
      house(g, x, y, roof, w, style, this.chimneys ??= [], i + 9);
      if (i % 3 === 0) fence(g, x - 26, y + 44, 52);
      if (i % 4 === 1) garden(g, x + 36, y + 14, 38);
    });

    this.heroTrees = [];
    const trees = [];
    let attempts = 0;
    while (trees.length < 46 && attempts++ < 3000) {
      const edge = trees.length < 26; // the first ones frame the town
      const x = edge ? (rng() < 0.5 ? rng() * 90 : W - rng() * 90) : rng() * W;
      const y = edge ? rng() * H : rng() * H;
      const yy = edge && rng() < 0.4 ? (rng() < 0.5 ? rng() * 70 : H - rng() * 70) : y;
      const xx = edge && yy !== y ? rng() * W : x;
      if (nearPlace(xx, yy, 36) || onPath(xx, yy)) continue;
      if (trees.some((t) => Math.hypot(t.x - xx, t.y - yy) < 90)) continue; // spaced out, never a forest
      const kind = rng() < 0.12 ? 'autumn' : rng() < 0.25 ? 'pine' : 'oak';
      trees.push({ x: xx, y: yy, s: 0.8 + rng() * 0.6, kind });
    }
    trees.sort((a, b) => a.y - b.y);
    trees.forEach((t, i) => {
      if (i % 9 === 0 && this.heroTrees.length < 14) this.heroTrees.push(t);
      else drawTree(g, t.x, t.y, t.s, t.kind);
    });
    for (let i = 0; i < 16; i++) {
      const x = rng() * W;
      const y = rng() * H;
      if (nearPlace(x, y, 30) || onPath(x, y)) continue;
      g.ellipse(x + 4, y + 3, 14, 6).fill({ color: 0x000000, alpha: 0.12 });
      g.circle(x, y - 6, 11).fill(0x3f9a4c).stroke({ width: 2, color: 0x2a6e35 });
      g.circle(x - 3, y - 9, 5).fill(0x66bb6a);
    }
    return root;
  }

  // ---- the animated layer -----------------------------------------------------------

  /** @param {number} time animation seconds  @param {number} tension 0..100 */
  update(time, tension, bounds = null) {
    const dt = Math.min(0.1, time - this.time || 0.016);
    this.time = time;
    const fx = this.fx;
    fx.clear();

    for (const s of this.sway) s.c.rotation = Math.sin(time * 1.1 + s.phase) * s.amp;

    // Chimney smoke: bakery and the houses.
    this.smokeTimer -= dt;
    if (this.smokeTimer <= 0) {
      this.smokeTimer = 0.5;
      for (const c of this.chimneys) this.smoke.push({ x: c.x, y: c.y, age: 0, life: 4 + Math.random() * 2, drift: (Math.random() - 0.3) * 8 });
    }
    for (let i = this.smoke.length - 1; i >= 0; i--) {
      const p = this.smoke[i];
      p.age += dt;
      if (p.age > p.life) {
        this.smoke.splice(i, 1);
        continue;
      }
      const k = p.age / p.life;
      fx.circle(p.x + p.drift * p.age + Math.sin(p.age * 2) * 3, p.y - p.age * 14, 4 + k * 10).fill({ color: 0xf0f0f0, alpha: 0.5 * (1 - k) });
    }

    // Pond: shimmering highlights, ripples, and two ducks.
    const pond = this.places.find((p) => p.id === 'pond');
    if (Math.random() < dt * 0.9) this.ripples.push({ x: pond.x + (Math.random() - 0.5) * pond.radius, y: pond.y + (Math.random() - 0.5) * pond.radius * 0.6, age: 0 });
    for (let i = this.ripples.length - 1; i >= 0; i--) {
      const r = this.ripples[i];
      r.age += dt;
      if (r.age > 1.8) {
        this.ripples.splice(i, 1);
        continue;
      }
      fx.ellipse(r.x, r.y, 4 + r.age * 12, (4 + r.age * 12) * 0.5).stroke({ width: 1.5, color: 0xffffff, alpha: 0.6 * (1 - r.age / 1.8) });
    }
    for (let i = 0; i < 2; i++) {
      const a = time * 0.25 + i * 3.1;
      const x = pond.x + Math.cos(a) * pond.radius * 0.55;
      const y = pond.y + Math.sin(a) * pond.radius * 0.32;
      const dir = Math.cos(a + Math.PI / 2) >= 0 ? 1 : -1;
      fx.ellipse(x, y + 2, 9, 5).fill(0xfff2b0).stroke({ width: 1.5, color: 0xcfa83a });
      fx.circle(x + dir * 7, y - 3, 4).fill(0xfff2b0).stroke({ width: 1.2, color: 0xcfa83a });
      fx.poly([x + dir * 10, y - 3, x + dir * 15, y - 2, x + dir * 10, y - 1]).fill(0xf0902a);
    }

    // Flags on the armory and market, and the windmill's blades.
    const armory = this.places.find((p) => p.id === 'armory');
    flag(fx, armory.x + 35, armory.y - 80, time, 0xc43a3a);
    const market = this.places.find((p) => p.id === 'market');
    flag(fx, market.x + 98, market.y - 62, time + 1, 0x3d8be5);
    const farm = this.places.find((p) => p.id === 'farm');
    const hx = farm.x - 112;
    const hy = farm.y - 70;
    for (let b = 0; b < 4; b++) {
      const a = time * 0.9 + (b * Math.PI) / 2;
      const ex = hx + Math.cos(a) * 34;
      const ey = hy + Math.sin(a) * 34;
      fx.moveTo(hx, hy).lineTo(ex, ey).stroke({ width: 3, color: 0x6b4a2b, cap: 'round' });
      fx.poly([hx + Math.cos(a) * 8, hy + Math.sin(a) * 8, ex, ey, ex + Math.cos(a + 1.57) * 9, ey + Math.sin(a + 1.57) * 9, hx + Math.cos(a + 0.3) * 8, hy + Math.sin(a + 0.3) * 8]).fill({ color: 0xf5ecd0, alpha: 0.95 });
    }
    fx.circle(hx, hy, 4).fill(0x4a3320);

    // Slow cloud shadows drifting over the grass.
    for (let i = 0; i < 3; i++) {
      const x = ((time * (8 + i * 3) + i * 600) % (W + 400)) - 200;
      fx.ellipse(x, 180 + i * 300, 170, 60).fill({ color: 0x000000, alpha: 0.05 });
    }

    // The sky's mood follows the tension: clear, then amber, then red dusk, then a storm with rain.
    const t = Math.max(0, Math.min(100, tension));
    const tint = this.tint;
    tint.clear();
    if (t > 25) {
      const k = (t - 25) / 75;
      const colour = k < 0.5 ? 0xffa04a : k < 0.8 ? 0xc0392b : 0x1c1830;
      tint.rect(0, 0, W, H).fill({ color: colour, alpha: 0.05 + k * 0.22 });
    }
    if (t > 70) {
      const wind = 40 + (t - 70) * 2;
      for (const d of this.rain) {
        d.y += (700 + d.s * 400) * dt;
        d.x -= wind * dt;
        if (d.y > H) {
          d.y = -20;
          d.x = Math.random() * (W + 200);
        }
        fx.moveTo(d.x, d.y).lineTo(d.x - wind * 0.04, d.y + 14 * d.s).stroke({ width: 1.2, color: 0xcfe6ff, alpha: 0.45 });
      }
    }

    // The closing storm: everything outside the safe area is dark, with a stormy edge.
    if (bounds) {
      const b = (this.shown ??= { ...bounds });
      for (const k of ['x0', 'y0', 'x1', 'y1']) b[k] += (bounds[k] - b[k]) * Math.min(1, dt * 1.5);
      const squeezed = b.x0 > 80 || b.y0 > 80;
      if (squeezed) {
        const dark = { color: 0x120f26, alpha: 0.5 };
        fx.rect(0, 0, W, b.y0).fill(dark);
        fx.rect(0, b.y1, W, H - b.y1).fill(dark);
        fx.rect(0, b.y0, b.x0, b.y1 - b.y0).fill(dark);
        fx.rect(b.x1, b.y0, W - b.x1, b.y1 - b.y0).fill(dark);
        const pulse = 0.55 + 0.25 * Math.sin(time * 3);
        fx.rect(b.x0, b.y0, b.x1 - b.x0, b.y1 - b.y0).stroke({ width: 5, color: 0xb48cff, alpha: pulse });
      }
    }

    this.shade.clear();
    if (this.dim > 0.01) this.shade.rect(0, 0, W, H).fill({ color: 0x000000, alpha: this.dim });
  }
}

// ---- drawing helpers -------------------------------------------------------------

function flag(g, x, y, time, colour) {
  const wave = (i) => Math.sin(time * 4 + i * 0.9) * 2.5;
  g.poly([x + 2, y, x + 12, y + wave(1), x + 22, y + 2 + wave(2), x + 22, y + 14 + wave(3), x + 12, y + 12 + wave(1), x + 2, y + 14]).fill(colour).stroke({ width: 1.2, color: INK, join: 'round' });
}

function shadow(g, x, y, w, h) {
  g.ellipse(x + 8, y + 4, w, h).fill({ color: 0x000000, alpha: 0.16 });
}

function drawTree(g, x, y, s, kind) {
  g.ellipse(x + 7 * s, y + 3 * s, 20 * s, 7 * s).fill({ color: 0x000000, alpha: 0.17 });
  if (kind === 'pine') {
    g.rect(x - 3 * s, y - 10 * s, 6 * s, 12 * s).fill(0x6b4a2b);
    for (let i = 0; i < 3; i++) {
      const w = (20 - i * 5) * s;
      const top = y - (22 + i * 14) * s;
      g.poly([x, top - 14 * s, x + w, top + 8 * s, x - w, top + 8 * s]).fill(i % 2 ? 0x2f8a45 : 0x3a9a50).stroke({ width: 2, color: 0x1f6a34, join: 'round' });
    }
    return g;
  }
  const leaf = kind === 'autumn' ? [0xd9822b, 0xe9a23b, 0xf2c46a] : [0x3f9a4c, 0x4faf5c, 0x7acb7f];
  g.rect(x - 4 * s, y - 18 * s, 8 * s, 20 * s).fill(0x7a5230).stroke({ width: 1.5, color: 0x4a3320 });
  g.circle(x, y - 34 * s, 22 * s).fill(leaf[0]).stroke({ width: 2.5, color: kind === 'autumn' ? 0x9a5a18 : 0x2a6e35 });
  g.circle(x - 13 * s, y - 27 * s, 14 * s).fill(leaf[1]).stroke({ width: 2, color: kind === 'autumn' ? 0x9a5a18 : 0x2a6e35 });
  g.circle(x + 13 * s, y - 28 * s, 13 * s).fill(leaf[1]).stroke({ width: 2, color: kind === 'autumn' ? 0x9a5a18 : 0x2a6e35 });
  g.circle(x - 6 * s, y - 41 * s, 9 * s).fill(leaf[2]);
  return g;
}

const WALLS = [0xf3e5c3, 0xf6d9b6, 0xe9e2d2, 0xf0d0c0];
const SHUTTER = [0x3f7a4a, 0x3d6fb0, 0x9a3a3a, 0x7a5a2a];

/**
 * A cottage. style 0 = cottage, 1 = tall townhouse, 2 = thatched hut. `chimneys` is the list the
 * smoke puffs come out of. (x, y) is the middle of the walls.
 */
function house(g, x, y, roof, w = 62, style = 0, chimneys = null, seed = 0) {
  const base = y + 24;
  const wallTop = style === 1 ? y - 42 : y - 24;
  const wall = WALLS[(seed + style) % WALLS.length];
  const shut = SHUTTER[(seed * 3 + style) % SHUTTER.length];
  shadow(g, x, base - 2, w * 0.66, 10);

  // stone foundation and plastered walls with a timber frame
  g.rect(x - w / 2 - 1, base - 8, w + 2, 8).fill(0x9a9a9a).stroke({ width: 2.5, color: INK });
  for (let i = 0; i < 5; i++) g.moveTo(x - w / 2 + 6 + i * (w / 5), base - 8).lineTo(x - w / 2 + 6 + i * (w / 5), base).stroke({ width: 1, color: INK, alpha: 0.3 });
  g.rect(x - w / 2, wallTop, w, base - 8 - wallTop).fill(wall).stroke({ width: 3, color: INK });
  for (const bx of [x - w / 2 + 2, x + w / 2 - 2]) g.rect(bx - 2, wallTop, 4, base - 8 - wallTop).fill(0x7a5230);
  g.rect(x - w / 2, wallTop + 3, w, 4).fill(0x7a5230);
  if (style === 1) g.rect(x - w / 2, y - 12, w, 4).fill(0x7a5230); // the floor between the storeys

  // roof
  const roofTop = wallTop - (style === 2 ? 34 : 36);
  if (style === 2) {
    g.poly([x - w / 2 - 8, wallTop + 2, x + w / 2 + 8, wallTop + 2, x + w / 4, roofTop + 8, x, roofTop, x - w / 4, roofTop + 8]).fill(0xd9b45a).stroke({ width: 3, color: INK, join: 'round' });
    for (let i = 0; i < 5; i++) g.moveTo(x - w / 2 + i * (w / 4.5), wallTop).lineTo(x - w / 3 + i * (w / 7), roofTop + 10).stroke({ width: 1.2, color: 0x9a7a2a, alpha: 0.7 });
  } else {
    g.poly([x - w / 2 - 8, wallTop + 1, x + w / 2 + 8, wallTop + 1, x, roofTop]).fill(roof).stroke({ width: 3, color: INK, join: 'round' });
    // shingle rows, each a little offset
    for (let r = 0; r < 4; r++) {
      const t = (r + 1) / 5;
      const ry = wallTop + 1 - (wallTop + 1 - roofTop) * t;
      const half = (w / 2 + 8) * (1 - t);
      g.moveTo(x - half + 2, ry).lineTo(x + half - 2, ry).stroke({ width: 1.2, color: INK, alpha: 0.28 });
      for (let k = -half + 8 + (r % 2) * 5; k < half - 4; k += 10) g.moveTo(x + k, ry).lineTo(x + k, ry + 7).stroke({ width: 1, color: INK, alpha: 0.18 });
    }
    g.poly([x - w / 2 - 8, wallTop + 1, x - w / 2 + 6, wallTop + 1, x - 4, roofTop + 4, x, roofTop]).fill({ color: 0xffffff, alpha: 0.12 }); // sunny side
    g.circle(x, roofTop + 2, 2.5).fill(INK); // ridge cap
  }
  if (style === 1) { // round attic window in the gable
    g.circle(x, wallTop - 12, 6).fill(0xffe9a8).stroke({ width: 2, color: INK });
    g.moveTo(x - 6, wallTop - 12).lineTo(x + 6, wallTop - 12).stroke({ width: 1, color: INK });
  }

  // chimney (it pokes out of the roof; smoke comes from it)
  if (chimneys && style !== 2) {
    const cx = x + w / 4;
    const cy = wallTop - 22;
    g.rect(cx - 5, cy - 14, 10, 20).fill(0xb4635a).stroke({ width: 2, color: INK });
    g.rect(cx - 7, cy - 17, 14, 5).fill(0x8a8a8a).stroke({ width: 1.5, color: INK });
    chimneys.push({ x: cx, y: cy - 20 });
  }

  // arched door with a step and a lantern
  g.rect(x - 11, base - 6, 22, 5).fill(0xb4b4b4).stroke({ width: 1.5, color: INK });
  g.roundRect(x - 8, base - 30, 16, 24, 7).fill(0x7a5230).stroke({ width: 2, color: INK });
  g.moveTo(x, base - 28).lineTo(x, base - 7).stroke({ width: 1, color: INK, alpha: 0.5 });
  g.circle(x + 4, base - 17, 1.5).fill(0xf2c53d);
  g.circle(x + 15, base - 24, 2.4).fill(0xffe27a).stroke({ width: 1, color: INK });

  // shuttered windows with a warm glow and flower boxes
  const rows = style === 1 ? [y - 30, y + 2 - 8] : [y - 14];
  for (const wy of rows) {
    for (const dx of [-w / 2 + 8, w / 2 - 20]) {
      if (wy > base - 30 && Math.abs(x + dx + 6 - x) < 11) continue; // never over the door
      g.rect(x + dx - 3, wy, 3, 13).fill(shut).stroke({ width: 1, color: INK });
      g.rect(x + dx + 12, wy, 3, 13).fill(shut).stroke({ width: 1, color: INK });
      g.rect(x + dx, wy, 12, 13).fill(0xffe9a8).stroke({ width: 2, color: INK });
      g.moveTo(x + dx + 6, wy).lineTo(x + dx + 6, wy + 13).moveTo(x + dx, wy + 6.5).lineTo(x + dx + 12, wy + 6.5).stroke({ width: 1, color: INK });
      g.rect(x + dx - 2, wy + 12, 16, 4).fill(0x8a5a35).stroke({ width: 1, color: INK });
      for (const [fx, c] of [[1, 0xe5533d], [6, 0xffffff], [11, 0xff9ac1]]) g.circle(x + dx + fx, wy + 11, 2.4).fill(c);
    }
  }
}

/** A low garden fence with posts. */
function fence(g, x, y, len) {
  for (let i = 0; i <= len; i += 9) g.rect(x + i - 1.5, y - 10, 3, 12).fill(0xf0e6cc).stroke({ width: 1, color: INK, alpha: 0.6 });
  g.moveTo(x, y - 6).lineTo(x + len, y - 6).moveTo(x, y - 1).lineTo(x + len, y - 1).stroke({ width: 1.6, color: 0xe3d6b6 });
}

/** A little vegetable patch. */
function garden(g, x, y, w) {
  g.roundRect(x, y, w, 14, 4).fill(0x8a5d36).stroke({ width: 1.5, color: INK, alpha: 0.7 });
  for (let i = 8; i < w - 4; i += 12) {
    g.circle(x + i, y + 7, 4).fill(i % 24 === 8 ? 0x4faf5c : 0xe8923a);
    g.circle(x + i - 1, y + 5, 2).fill({ color: 0xffffff, alpha: 0.25 });
  }
}

function bench(g, x, y) {
  shadow(g, x, y + 4, 16, 4);
  g.rect(x - 14, y - 8, 28, 4).fill(0x8a5a35).stroke({ width: 1.2, color: INK });
  g.rect(x - 14, y - 2, 28, 5).fill(0xa8703f).stroke({ width: 1.2, color: INK });
  g.rect(x - 12, y + 3, 3, 6).fill(INK);
  g.rect(x + 9, y + 3, 3, 6).fill(INK);
}

function lamp(g, x, y) {
  shadow(g, x, y, 8, 3);
  g.rect(x - 2, y - 34, 4, 36).fill(0x3a3a46);
  g.circle(x, y - 38, 7).fill({ color: 0xfff1a8, alpha: 0.35 });
  g.circle(x, y - 38, 4).fill(0xfff1a8).stroke({ width: 1.5, color: INK });
}

function crate(g, x, y, s = 1) {
  g.rect(x - 8 * s, y - 8 * s, 16 * s, 16 * s).fill(0xb98a55).stroke({ width: 1.8, color: INK });
  g.moveTo(x - 8 * s, y - 8 * s).lineTo(x + 8 * s, y + 8 * s).stroke({ width: 1, color: INK, alpha: 0.5 });
}

function barrel(g, x, y) {
  g.ellipse(x, y, 8, 10).fill(0x9a6a3a).stroke({ width: 1.8, color: INK });
  g.moveTo(x - 8, y - 3).lineTo(x + 8, y - 3).moveTo(x - 8, y + 4).lineTo(x + 8, y + 4).stroke({ width: 1.2, color: INK });
}

const PLACE_DRAWERS = {
  plaza(g, p, rng) {
    const R = p.radius;
    g.circle(p.x + 7, p.y + 7, R + 16).fill({ color: 0x000000, alpha: 0.1 });
    g.circle(p.x, p.y, R + 14).fill(0xcfc4a8).stroke({ width: 4, color: 0xa99d80 }); // kerb
    g.circle(p.x, p.y, R + 6).fill(0xdcd3bd);
    // cobbles: rings of little stones, and spokes
    for (let ring = 1; ring <= 6; ring++) {
      const r = (R / 6.4) * ring;
      const n = Math.round(r / 6);
      for (let i = 0; i < n; i++) {
        const a = (Math.PI * 2 * i) / n + ring * 0.3;
        g.ellipse(p.x + Math.cos(a) * r, p.y + Math.sin(a) * r, 4.4, 3).fill({ color: ring % 2 ? 0xc9bfa5 : 0xd3c9b0, alpha: 0.9 }).stroke({ width: 0.8, color: 0xa99d80, alpha: 0.5 });
      }
    }
    for (const r of [R * 0.78, R * 0.42]) g.circle(p.x, p.y, r).stroke({ width: 3, color: 0xb9ae93 });
    for (let i = 0; i < 8; i++) {
      const a = (Math.PI * 2 * i) / 8 + Math.PI / 8;
      g.moveTo(p.x + Math.cos(a) * 46, p.y + Math.sin(a) * 46).lineTo(p.x + Math.cos(a) * (R * 0.78), p.y + Math.sin(a) * (R * 0.78)).stroke({ width: 2, color: 0xb9ae93 });
    }
    // four flowerbeds between the spokes
    const bloom = [0xff7aa8, 0xffe27a, 0xc9b6ff, 0xffffff];
    for (let q = 0; q < 4; q++) {
      const a = (Math.PI / 2) * q + Math.PI / 4;
      const bx = p.x + Math.cos(a) * R * 0.6;
      const by = p.y + Math.sin(a) * R * 0.6 * 0.92;
      g.ellipse(bx, by, 24, 17).fill(0x7a5230).stroke({ width: 2, color: INK, alpha: 0.8 });
      g.ellipse(bx, by - 1, 21, 14).fill(0x5faa4d);
      for (let i = 0; i < 9; i++) {
        const fa = rng() * 6.28;
        const fd = Math.sqrt(rng()) * 15;
        g.circle(bx + Math.cos(fa) * fd, by + Math.sin(fa) * fd * 0.65, 2.6).fill(bloom[(q + i) % 4]);
      }
    }
    // the fountain: stone basin, water, a pillar and a spout
    g.ellipse(p.x + 5, p.y + 8, 50, 22).fill({ color: 0x000000, alpha: 0.14 });
    g.ellipse(p.x, p.y, 46, 36).fill(0xa8a8b0).stroke({ width: 4, color: INK });
    g.ellipse(p.x, p.y, 38, 28).fill(0x62b4ea).stroke({ width: 2, color: 0x3f87b8 });
    g.ellipse(p.x - 8, p.y - 6, 20, 8).fill({ color: 0xffffff, alpha: 0.32 });
    g.ellipse(p.x, p.y + 2, 16, 11).fill(0x9a9aa4).stroke({ width: 2.5, color: INK });
    g.rect(p.x - 5, p.y - 30, 10, 32).fill(0xb4b4be).stroke({ width: 2.5, color: INK });
    g.ellipse(p.x, p.y - 30, 12, 6).fill(0xc4c4ce).stroke({ width: 2, color: INK });
    g.circle(p.x, p.y - 38, 5).fill(0xf2c53d).stroke({ width: 2, color: INK }); // a golden ball on top
    for (let i = 0; i < 4; i++) {
      const a = (Math.PI / 2) * i;
      bench(g, p.x + Math.cos(a) * (R - 18), p.y + Math.sin(a) * (R - 18) * 0.9);
    }
    for (let i = 0; i < 6; i++) {
      const a = (Math.PI * 2 * i) / 6 + Math.PI / 6;
      lamp(g, p.x + Math.cos(a) * (R + 4), p.y + Math.sin(a) * (R + 4));
    }
  },

  park(g, p, rng) {
    g.circle(p.x, p.y, p.radius + 8).fill(0x77c565);
    g.circle(p.x, p.y, p.radius + 8).stroke({ width: 3, color: 0x5faa4d });
    g.ellipse(p.x + 30, p.y + 38, 44, 24).fill(0x6db7e8).stroke({ width: 3, color: 0x3f87b8 });
    g.ellipse(p.x + 24, p.y + 34, 20, 8).fill({ color: 0xffffff, alpha: 0.35 });
    // winding gravel loop
    g.ellipse(p.x - 8, p.y - 6, p.radius - 40, p.radius - 56).stroke({ width: 10, color: 0xe3d3a6, alpha: 0.9 });
    for (let i = 0; i < 6; i++) {
      const a = (Math.PI * 2 * i) / 6 + 0.4;
      drawTree(g, p.x + Math.cos(a) * (p.radius - 16), p.y + Math.sin(a) * (p.radius - 22) * 0.85, 0.9 + rng() * 0.3, i % 3 === 0 ? 'autumn' : 'oak');
    }
    bench(g, p.x - 52, p.y + 8);
    bench(g, p.x + 14, p.y - 52);
    // flower beds
    for (const [fx, fy, c] of [[-18, -8, 0xff7aa8], [26, 8, 0xffe27a], [-30, 30, 0xc9b6ff]]) {
      g.ellipse(p.x + fx, p.y + fy, 16, 9).fill(0x6b4a2b);
      for (let i = 0; i < 6; i++) g.circle(p.x + fx - 10 + i * 4, p.y + fy + Math.sin(i) * 3, 2.6).fill(c);
    }
  },

  market(g, p) {
    // a cobbled yard
    g.ellipse(p.x, p.y + 6, p.radius + 8, p.radius * 0.78).fill({ color: 0xd9c795, alpha: 0.75 }).stroke({ width: 2, color: 0xb5a373, alpha: 0.7 });
    const awnings = [0xe5533d, 0x3d8be5, 0xf2c53d, 0x4faf5c, 0x9b6bff];
    const goods = [
      [0xe5533d, 0xf2c53d, 0x7acb7f, 0xe5533d], // fruit
      [0x9ec9f0, 0xc8dcf0, 0x9ec9f0, 0xe8e8f0], // fish
      [0xd9a35a, 0xe9bb73, 0xd9a35a, 0xf0d7a8], // bread
      [0xff7aa8, 0x6bb8f0, 0xf2c53d, 0x9b6bff], // cloth
      [0xb4635a, 0xd98a5a, 0xb4635a, 0xe8a070], // pots
    ];
    const stalls = [[-96, -66], [-14, -72], [70, -62], [-62, 6], [6, 16]];
    stalls.forEach(([dx, dy], i) => {
      const x = p.x + dx;
      const y = p.y + dy;
      shadow(g, x + 28, y + 42, 36, 8);
      g.rect(x + 1, y + 16, 3, 26).fill(0x7a5230);
      g.rect(x + 52, y + 16, 3, 26).fill(0x7a5230);
      g.rect(x, y + 22, 56, 20).fill(0xb98a55).stroke({ width: 3, color: INK });
      g.rect(x + 2, y + 22, 52, 5).fill({ color: 0x000000, alpha: 0.18 });
      for (let k = 0; k < 7; k++) g.circle(x + 8 + k * 6.6, y + 21, 3.4).fill(goods[i][k % 4]).stroke({ width: 1, color: INK });
      // striped awning with a scalloped edge
      for (let st = 0; st < 4; st++) g.poly([x + st * 14 - 2, y - 2, x + st * 14 + 16, y - 2, x + st * 14 + 14, y + 16, x + st * 14, y + 16]).fill(st % 2 === 0 ? awnings[i] : 0xfff8e6);
      for (let st = 0; st < 4; st++) g.circle(x + st * 14 + 7, y + 16, 7).fill(st % 2 === 0 ? awnings[i] : 0xfff8e6).stroke({ width: 1.5, color: INK });
      g.poly([x - 3, y - 2, x + 59, y - 2, x + 56, y - 9, x, y - 9]).fill(awnings[i]).stroke({ width: 3, color: INK, join: 'round' });
    });
    // bunting strung between the poles
    const flags = [0xe5533d, 0xf2c53d, 0x3d8be5, 0x4faf5c, 0xff7aa8];
    g.moveTo(p.x - 100, p.y - 86).quadraticCurveTo(p.x - 14, p.y - 70, p.x + 78, p.y - 82).stroke({ width: 1.5, color: INK, alpha: 0.7 });
    for (let i = 0; i < 12; i++) {
      const t = (i + 0.5) / 12;
      const fx = (1 - t) * (1 - t) * (p.x - 100) + 2 * (1 - t) * t * (p.x - 14) + t * t * (p.x + 78);
      const fy = (1 - t) * (1 - t) * (p.y - 86) + 2 * (1 - t) * t * (p.y - 70) + t * t * (p.y - 82);
      g.poly([fx - 4, fy, fx + 4, fy, fx, fy + 9]).fill(flags[i % 5]).stroke({ width: 0.8, color: INK, alpha: 0.6 });
    }
    // a hand cart of melons, crates and barrels
    g.ellipse(p.x + 84, p.y + 54, 30, 6).fill({ color: 0x000000, alpha: 0.14 });
    g.rect(p.x + 62, p.y + 28, 44, 18).fill(0xa8703f).stroke({ width: 2.5, color: INK });
    for (const dx of [8, 22, 36]) g.circle(p.x + 62 + dx, p.y + 27, 6).fill(0x7acb7f).stroke({ width: 1.5, color: INK });
    g.circle(p.x + 72, p.y + 50, 8).fill(0x7a5230).stroke({ width: 2.5, color: INK });
    g.circle(p.x + 72, p.y + 50, 2.5).fill(0xc4a070);
    g.moveTo(p.x + 106, p.y + 36).lineTo(p.x + 128, p.y + 46).stroke({ width: 3, color: 0x7a5230, cap: 'round' });
    crate(g, p.x - 108, p.y + 30);
    crate(g, p.x - 90, p.y + 38, 0.8);
    barrel(g, p.x - 74, p.y + 52);
    barrel(g, p.x + 122, p.y + 12);
    lamp(g, p.x + 4, p.y + 38);
    g.rect(p.x + 104, p.y - 70, 3, 44).fill(INK); // flag pole
  },

  well(g, p) {
    shadow(g, p.x, p.y + 28, 40, 10);
    g.circle(p.x, p.y, 31).fill(0xa3a3a3).stroke({ width: 4, color: INK });
    for (let i = 0; i < 10; i++) {
      const a = (Math.PI * 2 * i) / 10;
      g.moveTo(p.x + Math.cos(a) * 20, p.y + Math.sin(a) * 20).lineTo(p.x + Math.cos(a) * 31, p.y + Math.sin(a) * 31).stroke({ width: 1.2, color: 0x6e6e6e });
    }
    g.circle(p.x, p.y, 20).fill(0x4f97d6);
    g.ellipse(p.x - 5, p.y - 4, 9, 4).fill({ color: 0xffffff, alpha: 0.3 });
    g.rect(p.x - 30, p.y - 48, 5, 38).fill(0x7a5230);
    g.rect(p.x + 25, p.y - 48, 5, 38).fill(0x7a5230);
    g.poly([p.x - 38, p.y - 46, p.x + 38, p.y - 46, p.x, p.y - 70]).fill(0xc45a3a).stroke({ width: 3, color: INK, join: 'round' });
    g.moveTo(p.x, p.y - 46).lineTo(p.x, p.y - 26).stroke({ width: 1.5, color: 0xe9dfc4 });
    g.rect(p.x - 5, p.y - 26, 10, 9).fill(0x9a6a3a).stroke({ width: 1.5, color: INK }); // the bucket
  },

  houses(g, p) {
    const ch = (this.chimneys ??= []);
    // two rows of cottages along a lane, with fences, gardens, a lamp and washing
    g.rect(p.x - 150, p.y + 6, 300, 22).fill({ color: 0xd9c795, alpha: 0.55 }); // the lane
    house(g, p.x - 118, p.y - 36, 0xc45a3a, 58, 0, ch, 1);
    house(g, p.x - 44, p.y - 52, 0x5a7fc4, 56, 1, ch, 2);
    house(g, p.x + 34, p.y - 40, 0x8a5ac4, 58, 0, ch, 3);
    house(g, p.x + 112, p.y - 48, 0xc48a3a, 54, 2, ch, 4);
    house(g, p.x - 96, p.y + 66, 0x3f9a6a, 56, 2, ch, 5);
    house(g, p.x - 22, p.y + 74, 0xc45a3a, 60, 0, ch, 6);
    house(g, p.x + 58, p.y + 70, 0x5a7fc4, 56, 1, ch, 7);
    house(g, p.x + 132, p.y + 64, 0x8a5ac4, 56, 0, ch, 8);
    fence(g, p.x - 150, p.y + 40, 60);
    fence(g, p.x + 14, p.y + 40, 70);
    garden(g, p.x - 62, p.y + 36, 52);
    garden(g, p.x + 88, p.y + 36, 46);
    lamp(g, p.x - 2, p.y + 22);
    lamp(g, p.x + 176, p.y + 22);
    g.moveTo(p.x - 160, p.y - 6).lineTo(p.x - 100, p.y + 8).stroke({ width: 1.2, color: INK, alpha: 0.5 }); // washing line
    for (const [dx, c] of [[-152, 0xffffff], [-140, 0xff7aa8], [-128, 0x6bb8f0], [-116, 0xf2c53d]]) g.rect(p.x + dx, p.y - 3 + (dx + 152) * 0.11, 8, 12).fill(c).stroke({ width: 1, color: INK, alpha: 0.4 });
  },

  armory(g, p) {
    const x = p.x;
    const y = p.y;
    shadow(g, x, y + 40, 84, 11);
    // keep: stone blocks, crenellations
    g.rect(x - 64, y - 30, 128, 74).fill(0x9a9aa8).stroke({ width: 4, color: INK });
    for (let r = 0; r < 5; r++) for (let c = 0; c < 8; c++) {
      const off = r % 2 ? 8 : 0;
      g.rect(x - 64 + c * 16 + off - (r % 2 ? 16 : 0), y - 30 + r * 15, 16, 15).stroke({ width: 1, color: 0x6a6a78, alpha: 0.55 });
    }
    g.rect(x - 64, y - 30, 128, 9).fill({ color: 0xffffff, alpha: 0.12 });
    for (let i = 0; i < 7; i++) g.rect(x - 64 + i * 19, y - 46, 12, 16).fill(0x9a9aa8).stroke({ width: 3, color: INK });
    // two round towers with cone roofs and flags
    for (const tx of [-72, 72]) {
      g.rect(x + tx - 17, y - 52, 34, 98).fill(0xa6a6b4).stroke({ width: 4, color: INK });
      for (let r = 0; r < 6; r++) g.moveTo(x + tx - 17, y - 40 + r * 16).lineTo(x + tx + 17, y - 40 + r * 16).stroke({ width: 1, color: 0x6a6a78, alpha: 0.5 });
      g.poly([x + tx - 22, y - 52, x + tx + 22, y - 52, x + tx, y - 92]).fill(0xb4423a).stroke({ width: 3, color: INK, join: 'round' });
      g.rect(x + tx - 1.5, y - 112, 3, 22).fill(INK);
      g.poly([x + tx + 1.5, y - 112, x + tx + 20, y - 106, x + tx + 1.5, y - 99]).fill(0xe5533d).stroke({ width: 1.2, color: INK });
      g.rect(x + tx - 3, y - 30, 6, 18).fill(INK); // arrow slit
    }
    // double door with iron bands and studs, a banner above
    g.roundRect(x - 22, y - 8, 44, 52, 8).fill(0x5b4a3a).stroke({ width: 3.5, color: INK });
    g.moveTo(x, y - 6).lineTo(x, y + 44).stroke({ width: 2, color: INK });
    for (const by of [4, 22, 36]) g.rect(x - 22, y + by, 44, 4).fill(0x3a3a46);
    for (const sx of [-14, -6, 6, 14]) for (const sy of [8, 26]) g.circle(x + sx, y + sy, 1.6).fill(0xc4c4cc);
    g.circle(x + 6, y + 22, 2.4).fill(0xf2c53d);
    g.poly([x - 14, y - 26, x + 14, y - 26, x + 14, y - 8, x, y - 14, x - 14, y - 8]).fill(0xb4423a).stroke({ width: 2, color: INK, join: 'round' });
    g.moveTo(x - 8, y - 22).lineTo(x + 8, y - 12).moveTo(x + 8, y - 22).lineTo(x - 8, y - 12).stroke({ width: 2, color: 0xf2e9c8, cap: 'round' }); // crossed swords
    // torches by the door
    for (const tx of [-32, 32]) {
      g.rect(x + tx - 1.5, y + 2, 3, 14).fill(0x5a3a22);
      g.circle(x + tx, y - 1, 6).fill({ color: 0xffb347, alpha: 0.35 });
      g.poly([x + tx - 3, y + 2, x + tx, y - 8, x + tx + 3, y + 2]).fill(0xff9f1c).stroke({ width: 1, color: INK });
    }
    // yard: weapon rack, shields, a dummy, an anvil and hay
    g.rect(x - 112, y + 6, 4, 34).fill(0x5a3a22);
    g.rect(x - 94, y + 6, 4, 34).fill(0x5a3a22);
    g.rect(x - 114, y + 12, 26, 3).fill(0x5a3a22);
    for (let i = 0; i < 4; i++) g.moveTo(x - 108 + i * 6, y + 12).lineTo(x - 104 + i * 6, y - 16).stroke({ width: 2.2, color: i % 2 ? 0x9a9aa8 : 0x6b4a2b, cap: 'round' });
    g.circle(x - 100, y + 30, 8).fill(0x3d8be5).stroke({ width: 2, color: INK });
    g.circle(x - 100, y + 30, 2.5).fill(0xf2c53d);
    g.rect(x + 100, y + 2, 4, 44).fill(0x5a3a22); // training dummy
    g.rect(x + 90, y + 12, 24, 4).fill(0x5a3a22);
    g.circle(x + 102, y - 2, 8).fill(0xd9b45a).stroke({ width: 2, color: INK });
    g.rect(x + 95, y + 8, 14, 20).fill(0xd9b45a).stroke({ width: 2, color: INK });
    g.poly([x + 96, y + 52, x + 114, y + 52, x + 110, y + 44, x + 100, y + 44]).fill(0x4a4a56).stroke({ width: 2, color: INK }); // anvil
    for (const [hx, hy] of [[-84, 56], [-66, 58]]) {
      g.ellipse(x + hx, y + hy, 12, 8).fill(0xe3c360).stroke({ width: 1.5, color: INK });
      g.moveTo(x + hx - 8, y + hy - 2).lineTo(x + hx + 8, y + hy + 1).stroke({ width: 1, color: 0xa88a2a });
    }
    crate(g, x + 62, y + 58);
    barrel(g, x + 80, y + 58);
  },

  pond(g, p, rng) {
    const R = p.radius;
    g.ellipse(p.x + 5, p.y + 7, R + 14, R * 0.7 + 10).fill({ color: 0x000000, alpha: 0.09 });
    g.ellipse(p.x, p.y, R + 12, R * 0.7 + 9).fill(0xd8c690).stroke({ width: 2, color: 0xb9a56a, alpha: 0.8 }); // sandy bank
    for (let i = 0; i < 26; i++) { // pebbles on the bank
      const a = rng() * Math.PI * 2;
      g.circle(p.x + Math.cos(a) * (R + 6 + rng() * 5), p.y + Math.sin(a) * (R * 0.7 + 5 + rng() * 4), 1.6 + rng() * 1.6).fill({ color: rng() < 0.5 ? 0xb9a56a : 0xf3e8c8, alpha: 0.9 });
    }
    // water in layers: shallow edge, then deeper, then the deep middle
    g.ellipse(p.x, p.y, R, R * 0.7).fill(0x79c3ee).stroke({ width: 4, color: 0x3f87b8 });
    g.ellipse(p.x, p.y, R * 0.8, R * 0.56).fill(0x5eaee4);
    g.ellipse(p.x + 4, p.y + 2, R * 0.5, R * 0.34).fill(0x4a9bd6);
    g.ellipse(p.x - 18, p.y - 12, R * 0.55, R * 0.22).fill({ color: 0xffffff, alpha: 0.28 }); // sky reflection
    for (let i = 0; i < 9; i++) { // ripples and glints
      const a = rng() * Math.PI * 2;
      const d = 0.25 + rng() * 0.6;
      const rx = p.x + Math.cos(a) * R * d;
      const ry = p.y + Math.sin(a) * R * 0.7 * d;
      g.moveTo(rx - 7, ry).quadraticCurveTo(rx, ry - 3, rx + 7, ry).stroke({ width: 1.4, color: 0xffffff, alpha: 0.45 });
    }
    // lily pads and flowers
    for (let i = 0; i < 9; i++) {
      const a = rng() * Math.PI * 2;
      const d = rng() * R * 0.6;
      const x = p.x + Math.cos(a) * d;
      const y = p.y + Math.sin(a) * d * 0.62;
      g.ellipse(x, y, 8.5, 5.5).fill(0x4fae5c).stroke({ width: 1.5, color: 0x2f7a3a });
      g.poly([x, y, x + 8, y - 2, x + 8, y + 2]).fill(0x79c3ee);
      if (i % 3 === 0) { g.circle(x - 1, y - 1, 3).fill(0xffb3c7); g.circle(x - 1, y - 1, 1.2).fill(0xffe27a); }
    }
    // rocks round the edge, tall reeds and cattails on both sides
    for (let i = 0; i < 14; i++) {
      const a = (Math.PI * 2 * i) / 14 + rng() * 0.3;
      const rx = p.x + Math.cos(a) * (R + 2);
      const ry = p.y + Math.sin(a) * (R * 0.7 + 1);
      g.ellipse(rx, ry, 8 + rng() * 5, 5 + rng() * 3).fill(0xa3a3ab).stroke({ width: 1.6, color: 0x6e6e78 });
      g.ellipse(rx - 2, ry - 1.5, 4, 2).fill({ color: 0xffffff, alpha: 0.25 });
    }
    for (const side of [1, -1]) {
      for (let i = 0; i < 9; i++) {
        const rx = p.x + side * (R * 0.55 + i * 4.5) + (side > 0 ? 12 : -12);
        const ry = p.y + R * 0.52 - Math.abs(i - 4) * 2;
        g.moveTo(rx, ry + 8).quadraticCurveTo(rx + side * 3, ry - 6, rx + side * 1, ry - 18 - (i % 3) * 5).stroke({ width: 2, color: 0x4a8a3a, cap: 'round' });
        if (i % 2 === 0) g.ellipse(rx + side, ry - 20 - (i % 3) * 5, 2.4, 6).fill(0x7a5230).stroke({ width: 1, color: INK });
      }
    }
    // a wooden dock with planks, posts and a little rowboat
    const dx = p.x - R - 24;
    const dy = p.y + 2;
    for (let i = 0; i < 9; i++) g.rect(dx + i * 7, dy, 6, 14).fill(i % 2 ? 0xb98a55 : 0xa8793f).stroke({ width: 1, color: INK, alpha: 0.7 });
    for (const px of [0, 56]) { g.rect(dx + px - 2, dy + 10, 5, 14).fill(0x5a3a22).stroke({ width: 1, color: INK }); }
    g.ellipse(dx + 46, dy + 26, 20, 7).fill({ color: 0x000000, alpha: 0.12 });
    g.poly([dx + 26, dy + 20, dx + 66, dy + 20, dx + 58, dy + 30, dx + 34, dy + 30]).fill(0xb4635a).stroke({ width: 2, color: INK, join: 'round' });
    g.rect(dx + 28, dy + 21, 36, 3).fill(0xe0c9a0);
    g.moveTo(dx + 46, dy + 20).lineTo(dx + 62, dy + 8).stroke({ width: 2, color: 0x7a5230, cap: 'round' }); // oar
    // stepping stones and a little bench by the water
    for (const [sx, sy, sc] of [[64, 40, 1], [-34, 52, 0.8], [84, 8, 0.7], [-60, 46, 0.9]]) g.ellipse(p.x + sx, p.y + sy, 9 * sc, 6 * sc).fill(0x9a9aa4).stroke({ width: 1.5, color: 0x6e6e78 });
    bench(g, p.x + 20, p.y + R * 0.7 + 22);
  },

  farm(g, p) {
    const crops = [0xe8c547, 0x5fbf6a, 0xf08a4b, 0x5fbf6a];
    for (let r = 0; r < 4; r++) {
      const y = p.y - 34 + r * 22;
      g.rect(p.x - 80, y, 124, 13).fill(0x8a5a35);
      for (let c = 0; c < 9; c++) {
        const x = p.x - 72 + c * 14;
        if (crops[r] === 0xe8c547) g.moveTo(x, y + 12).lineTo(x - 2, y - 2).moveTo(x, y + 12).lineTo(x + 2, y - 2).stroke({ width: 2, color: 0xe8c547, cap: 'round' });
        else g.circle(x, y + 5, 5).fill(crops[r]).stroke({ width: 1, color: INK, alpha: 0.5 });
      }
    }
    shadow(g, p.x + 68, p.y + 6, 36, 8);
    g.rect(p.x + 44, p.y - 40, 54, 46).fill(0xc45a3a).stroke({ width: 3, color: INK });
    g.poly([p.x + 38, p.y - 40, p.x + 104, p.y - 40, p.x + 71, p.y - 68]).fill(0x8f2a1a).stroke({ width: 3, color: INK, join: 'round' });
    g.rect(p.x + 60, p.y - 16, 22, 22).fill(0xf0e2c0).stroke({ width: 2, color: INK });
    g.moveTo(p.x + 60, p.y - 16).lineTo(p.x + 82, p.y + 6).moveTo(p.x + 82, p.y - 16).lineTo(p.x + 60, p.y + 6).stroke({ width: 1.5, color: INK });
    // windmill tower (blades are animated)
    g.poly([p.x - 124, p.y - 8, p.x - 100, p.y - 8, p.x - 105, p.y - 70, p.x - 119, p.y - 70]).fill(0xe9dfc4).stroke({ width: 2.5, color: INK, join: 'round' });
    g.poly([p.x - 124, p.y - 70, p.x - 100, p.y - 70, p.x - 112, p.y - 88]).fill(0xc45a3a).stroke({ width: 2.5, color: INK, join: 'round' });
    // haystacks, a scarecrow and a fence
    for (const dx of [-90, -70]) g.ellipse(p.x + dx, p.y + 52, 14, 10).fill(0xe8c547).stroke({ width: 1.8, color: 0xa88a1a });
    g.moveTo(p.x + 14, p.y + 54).lineTo(p.x + 14, p.y + 24).moveTo(p.x - 2, p.y + 36).lineTo(p.x + 30, p.y + 36).stroke({ width: 3, color: 0x6b4a2b, cap: 'round' });
    g.circle(p.x + 14, p.y + 20, 6).fill(0xf0c27a).stroke({ width: 1.5, color: INK });
    g.poly([p.x + 5, p.y + 16, p.x + 23, p.y + 16, p.x + 14, p.y + 4]).fill(0x8a5a35);
    for (let i = 0; i < 10; i++) g.rect(p.x - 84 + i * 14, p.y + 62, 2.5, 14).fill(0xe9dfc4);
    g.moveTo(p.x - 84, p.y + 68).lineTo(p.x + 52, p.y + 68).stroke({ width: 2, color: 0xe9dfc4 });
  },

  bakery(g, p) {
    shadow(g, p.x, p.y + 26, 62, 9);
    g.rect(p.x - 54, p.y - 38, 108, 60).fill(0xf0d7a8).stroke({ width: 3, color: INK });
    for (let s = 0; s < 6; s++) g.rect(p.x - 54 + s * 18, p.y - 49, 18, 20).fill(s % 2 === 0 ? 0xe5533d : 0xfff8e6);
    g.rect(p.x - 54, p.y - 49, 108, 20).stroke({ width: 3, color: INK });
    g.rect(p.x - 12, p.y - 8, 24, 30).fill(0x7a5230).stroke({ width: 2, color: INK });
    g.rect(p.x + 28, p.y - 78, 15, 32).fill(0x9a9aa6).stroke({ width: 2, color: INK });
    (this.chimneys ??= []).push({ x: p.x + 35, y: p.y - 80 });
    g.rect(p.x - 46, p.y - 22, 26, 20).fill(0xbfe3ff).stroke({ width: 2, color: INK });
    g.ellipse(p.x - 33, p.y - 8, 11, 6).fill(0xd9a35a).stroke({ width: 1.5, color: INK }); // a loaf in the window
    g.circle(p.x + 38, p.y - 30, 7).fill(0xf2c53d).stroke({ width: 1.5, color: INK }); // sign
    // outdoor table with a parasol
    g.ellipse(p.x + 76, p.y + 22, 14, 7).fill(0xb98a55).stroke({ width: 1.5, color: INK });
    g.poly([p.x + 58, p.y - 2, p.x + 94, p.y - 2, p.x + 76, p.y - 22]).fill(0x3d8be5).stroke({ width: 1.5, color: INK });
    g.rect(p.x + 75, p.y - 2, 2, 24).fill(INK);
    for (const dx of [-72, -62]) g.roundRect(p.x + dx, p.y + 8, 12, 16, 3).fill(0xe9dfc4).stroke({ width: 1.5, color: INK }); // flour sacks
  },
};
