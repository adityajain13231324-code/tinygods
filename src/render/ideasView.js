import { Container, Graphics, Rectangle, Sprite, Text } from 'pixi.js';
import { WORLD, IDEAS } from '../config/tunables.js';

const INK = 0x2b2622;
const R = (x, y, w, h) => new Rectangle(x, y, w, h);

// Everything the "selected ideas" update adds to the scene: canals and the hill, cover props that can be
// blown apart, dry grass that burns, scattered goods, free cake, dropped weapons, rain zones and the
// transient combo effects. Drawing only: it reads simulation state and never touches the simulation's
// random numbers. Sprites are pooled and textures are made once, so the cost per frame stays small.

const shadow = (g, w, h, y = 0) => g.ellipse(0, y, w, h).fill({ color: 0x000000, alpha: 0.22 });

function drawBench(g) {
  shadow(g, 18, 5, 8);
  g.rect(-14, -8, 28, 4).fill(0x8a5a35).stroke({ width: 1.2, color: INK });
  g.rect(-14, -2, 28, 5).fill(0xa8703f).stroke({ width: 1.2, color: INK });
  g.rect(-12, 3, 3, 6).fill(INK);
  g.rect(9, 3, 3, 6).fill(INK);
}
const AWN = [0xe5533d, 0x3d8be5, 0xf2c53d, 0x4faf5c, 0x9b6bff];
const GOODS = [[0xe5533d, 0xf2c53d, 0x7acb7f, 0xe5533d], [0x9ec9f0, 0xc8dcf0, 0x9ec9f0, 0xe8e8f0], [0xd9a35a, 0xe9bb73, 0xd9a35a, 0xf0d7a8], [0xff7aa8, 0x6bb8f0, 0xf2c53d, 0x9b6bff], [0xb4635a, 0xd98a5a, 0xb4635a, 0xe8a070]];
function drawStall(g, look = 0) {
  const x = -28, y = -18;
  shadow(g, 36, 8, 24);
  g.rect(x + 1, y + 16, 3, 26).fill(0x7a5230);
  g.rect(x + 52, y + 16, 3, 26).fill(0x7a5230);
  g.rect(x, y + 22, 56, 20).fill(0xb98a55).stroke({ width: 3, color: INK });
  g.rect(x + 2, y + 22, 52, 5).fill({ color: 0x000000, alpha: 0.18 });
  for (let k = 0; k < 7; k++) g.circle(x + 8 + k * 6.6, y + 21, 3.4).fill(GOODS[look % 5][k % 4]).stroke({ width: 1, color: INK });
  for (let st = 0; st < 4; st++) g.poly([x + st * 14 - 2, y - 2, x + st * 14 + 16, y - 2, x + st * 14 + 14, y + 16, x + st * 14, y + 16]).fill(st % 2 === 0 ? AWN[look % 5] : 0xfff8e6);
  for (let st = 0; st < 4; st++) g.circle(x + st * 14 + 7, y + 16, 7).fill(st % 2 === 0 ? AWN[look % 5] : 0xfff8e6).stroke({ width: 1.5, color: INK });
  g.poly([x - 3, y - 2, x + 59, y - 2, x + 56, y - 9, x, y - 9]).fill(AWN[look % 5]).stroke({ width: 3, color: INK, join: 'round' });
}
function drawWall(g, w) {
  shadow(g, w / 2 + 4, 5, 8);
  g.roundRect(-w / 2, -12, w, 22, 3).fill(0xaaa79c).stroke({ width: 2.4, color: INK });
  for (let x = -w / 2 + 6; x < w / 2 - 8; x += 17) g.rect(x, -8, 13, 6).fill({ color: 0xffffff, alpha: 0.22 });
  for (let x = -w / 2 + 14; x < w / 2 - 8; x += 17) g.rect(x, 1, 13, 6).fill({ color: 0x000000, alpha: 0.12 });
  g.roundRect(-w / 2, -14, w, 5, 2).fill(0xc4c1b6).stroke({ width: 1.6, color: INK });
}
function drawBarrel(g) { shadow(g, 12, 4, 10); g.ellipse(0, 0, 9, 11).fill(0x9a6a3a).stroke({ width: 1.8, color: INK }); g.moveTo(-9, -3).lineTo(9, -3).moveTo(-9, 4).lineTo(9, 4).stroke({ width: 1.2, color: INK }); }
function drawHay(g) {
  shadow(g, 20, 5, 11);
  g.ellipse(0, 0, 18, 13).fill(0xe3c15a).stroke({ width: 2.2, color: INK });
  for (let i = 0; i < 4; i++) g.ellipse(0, 0, 14 - i * 3.5, 10 - i * 2.6).stroke({ width: 1, color: 0xb18a2c, alpha: 0.8 });
}
function drawRock(g, w) {
  shadow(g, w * 0.62, 6, 12);
  g.poly([-w * 0.55, 8, -w * 0.4, -10, -w * 0.05, -17, w * 0.35, -12, w * 0.58, 6, w * 0.2, 12, -w * 0.3, 12]).fill(0x8b8a86).stroke({ width: 2.4, color: INK, join: 'round' });
  g.poly([-w * 0.3, -9, -w * 0.05, -15, w * 0.2, -10, 0, -4]).fill({ color: 0xffffff, alpha: 0.25 });
}
function drawRubble(g, kind, w) {
  const col = kind === 'wall' || kind === 'rock' ? 0x8b8a86 : kind === 'hay' ? 0xd4b44a : 0x8a5a35;
  for (let i = 0; i < 9; i++) {
    const a = i * 2.4, d = 4 + (i * 7) % (w * 0.55);
    g.poly([Math.cos(a) * d - 4, Math.sin(a) * d * 0.5, Math.cos(a) * d + 3, Math.sin(a) * d * 0.5 - 3, Math.cos(a) * d + 4, Math.sin(a) * d * 0.5 + 3]).fill(col).stroke({ width: 1, color: INK });
  }
  g.ellipse(0, 4, w * 0.6, 8).fill({ color: 0x2b2622, alpha: 0.28 });
}

/** One texture per art, made once. */
function makeTexture(app, draw) {
  const g = new Graphics();
  draw(g);
  const t = app.renderer.generateTexture({ target: g, frame: R(-80, -70, 160, 120), resolution: 2 });
  g.destroy();
  return t;
}

function terrain(world) {
  const g = new Graphics();
  if (world.hill) {
    const h = world.hill;
    g.ellipse(h.x + 6, h.y + 12, h.rx + 14, h.ry + 10).fill({ color: 0x000000, alpha: 0.1 });
    g.ellipse(h.x, h.y, h.rx + 8, h.ry + 6).fill(0x86be6c);
    for (let i = 0; i < 5; i++) g.ellipse(h.x - i * 4, h.y - 8 - i * 6, h.rx * (1 - i * 0.17), h.ry * (1 - i * 0.17)).fill({ color: i % 2 ? 0x95cc78 : 0xa6d985, alpha: 0.9 }).stroke({ width: 1.4, color: 0x6aa656, alpha: 0.7 });
  }
  for (const c of world.canals) {
    const x0 = c.c - c.half;
    g.rect(x0 - 12, 0, c.half * 2 + 24, WORLD.height).fill(0xd9c795); // sandy banks
    g.rect(x0, 0, c.half * 2, WORLD.height).fill(0x4fa3d9);
    g.rect(x0 + 4, 0, c.half * 2 - 8, WORLD.height).fill({ color: 0x6bbcec, alpha: 0.7 });
    for (let y = 18; y < WORLD.height; y += 46) g.moveTo(x0 + 8, y).quadraticCurveTo(c.c, y - 6, x0 + c.half * 2 - 8, y).stroke({ width: 2, color: 0xffffff, alpha: 0.35 });
    g.rect(x0, 0, 3, WORLD.height).fill(0x2f7fb0);
    g.rect(x0 + c.half * 2 - 3, 0, 3, WORLD.height).fill(0x2f7fb0);
    for (const b of c.bridges) {
      const y0 = b.c - b.half;
      g.rect(x0 - 16, y0 - 4, c.half * 2 + 32, b.half * 2 + 8).fill(0x6b4a2b).stroke({ width: 3, color: INK });
      for (let x = x0 - 12; x < x0 + c.half * 2 + 14; x += 9) g.rect(x, y0, 7, b.half * 2).fill(x % 18 < 9 ? 0xb8864f : 0xa8763f);
      g.rect(x0 - 16, y0 - 6, c.half * 2 + 32, 4).fill(INK);
      g.rect(x0 - 16, y0 + b.half * 2 + 2, c.half * 2 + 32, 4).fill(INK);
    }
  }
  return g;
}

export class IdeasView {
  /**
   * @param app Pixi application
   * @param world the simulation world (for layout and props at start-up)
   * @param crowd the depth-sorted container villagers live in
   * @param effects the particle effects (confetti, puffs, floating numbers)
   */
  constructor(app, world, crowd, effects) {
    this.app = app;
    this.effects = effects;
    this.crowd = crowd;
    const motion = window.matchMedia('(prefers-reduced-motion: reduce)');
    this.reduced = motion.matches;
    motion.addEventListener('change', (e) => { this.reduced = e.matches; });

    // Static terrain, baked once into one texture.
    this.terrain = new Container();
    this.terrain.eventMode = 'none';
    if (world.canals.length || world.hill) {
      const g = terrain(world);
      const tex = app.renderer.generateTexture({ target: g, frame: R(0, 0, WORLD.width, WORLD.height), resolution: 1 });
      g.destroy();
      this.terrain.addChild(new Sprite(tex));
    }
    this.ground = new Container(); // grass, goods, cake, dropped weapons (under the villagers)
    this.ground.eventMode = 'none';
    this.over = new Container(); // rain zones, zaps, fuse numbers, labels (over the villagers)
    this.over.eventMode = 'none';
    this.fx = this.over.addChild(new Graphics());

    // Props: one pooled sprite each, placed in the villagers' container so depth sorting just works.
    this.tex = {
      bench: makeTexture(app, drawBench), barrel: makeTexture(app, drawBarrel), hay: makeTexture(app, drawHay),
      stall: [0, 1, 2, 3, 4].map((i) => makeTexture(app, (g) => drawStall(g, i))),
      wall: new Map(), rock: new Map(), rubble: new Map(),
    };
    this.props = new Map();
    for (const p of world.props) {
      const s = new Sprite(this.propTexture(p));
      s.anchor.set(0.5, 70 / 120);
      s.position.set(p.x, p.y);
      s.zIndex = p.y + p.h * 0.5;
      s.eventMode = 'none';
      crowd.addChild(s);
      this.props.set(p.id, { sprite: s, alive: true, shake: 0, p });
    }

    // Dry grass patches: pooled, redrawn only when a patch changes state.
    this.grass = world.grass.map((p) => ({ p, g: this.ground.addChild(new Graphics()), key: '' }));
    this.flames = this.ground.addChild(new Graphics());
    this.goodsG = this.ground.addChild(new Graphics());
    this.dropsG = this.ground.addChild(new Graphics());
    this.cakesG = this.ground.addChild(new Graphics());
    this.labels = [];
    for (let i = 0; i < 8; i++) {
      const t = new Text({ text: '', style: { fontFamily: 'system-ui, sans-serif', fontSize: 14, fontWeight: '900', fill: 0xffffff, stroke: { color: INK, width: 4 }, align: 'center' } });
      t.anchor.set(0.5); t.visible = false; this.over.addChild(t); this.labels.push(t);
    }
    this.zaps = []; // {pts, age}
    this.pushes = []; // {x, y, tx, ty, age}
    this.hint = null; // 'lightning' | 'gust' while that power is being aimed
    this.clock = 0;
  }

  propTexture(p) {
    if (p.kind === 'stall') return this.tex.stall[(p.look ?? 0) % 5];
    if (p.kind === 'wall' || p.kind === 'rock') {
      const m = this.tex[p.kind];
      if (!m.has(p.w)) m.set(p.w, makeTexture(this.app, (g) => (p.kind === 'wall' ? drawWall(g, p.w) : drawRock(g, p.w))));
      return m.get(p.w);
    }
    return this.tex[p.kind];
  }

  rubbleTexture(p) {
    const key = `${p.kind}:${p.w}`;
    if (!this.tex.rubble.has(key)) this.tex.rubble.set(key, makeTexture(this.app, (g) => drawRubble(g, p.kind, p.w)));
    return this.tex.rubble.get(key);
  }

  /** Called by the director for one-off happenings. */
  event(e, world) {
    const fx = this.effects;
    switch (e.type) {
      case 'propDestroyed': {
        const rec = this.props.get(e.propId);
        if (rec) { rec.sprite.texture = this.rubbleTexture(rec.p); rec.sprite.zIndex = rec.p.y - 5000; }
        fx.puff(e.x, e.y - 8, 10, 0xc8b79a);
        for (let i = 0; i < 8; i++) fx.emit('crumb', e.x, e.y - 6, { vx: (Math.random() - 0.5) * 220, vy: -60 - Math.random() * 120, gravity: 420, life: 0.9, spin: 10, tint: 0x9a6a3a });
        fx.number(e.x, e.y - 36, `${e.kind.toUpperCase()} DESTROYED`, 0xffd9a0);
        break;
      }
      case 'goodsScatter':
        for (let i = 0; i < 12; i++) fx.emit('sparkle', e.x, e.y - 6, { vx: (Math.random() - 0.5) * 200, vy: -50 - Math.random() * 90, gravity: 360, life: 0.8, tint: [0xe5533d, 0xf2c53d, 0x7acb7f, 0xff7aa8][i % 4] });
        break;
      case 'grassSmolder': fx.puff(e.x, e.y - 10, 6, 0x777777); fx.number(e.x, e.y - 40, 'SMOKE!', 0xcccccc); break;
      case 'grassIgnite': fx.number(e.x, e.y - 40, 'FIRE!', 0xff8a3a); for (let i = 0; i < 10; i++) fx.emit('flash', e.x + (Math.random() - 0.5) * 80, e.y - 6, { vx: 0, vy: -40 - Math.random() * 40, life: 0.6, s0: 0.5, s1: 1.4, tint: 0xff8a2a }); break;
      case 'grassOut': fx.puff(e.x, e.y - 12, 12, 0xeaf6ff); fx.number(e.x, e.y - 40, 'PUT OUT', 0x9fe0ff); break;
      case 'comboZap': {
        const pts = [{ x: e.x, y: e.y - 8 }, ...e.path.map((s) => ({ x: s.x, y: s.y - 14, fx: s.fromX, fy: s.fromY - 14, delay: s.delay }))];
        this.zaps.push({ segs: e.path.map((s) => ({ a: { x: s.fromX, y: s.fromY - 14 }, b: { x: s.x, y: s.y - 14 }, delay: s.delay })), age: 0, origin: pts[0] });
        fx.number(e.x, e.y - 50, 'CHAIN ZAP!', 0x9fe0ff);
        for (const s of e.path) fx.emit('sparkle', s.x, s.y - 14, { vx: 0, vy: -20, life: 0.5, tint: 0xbff3ff });
        break;
      }
      case 'comboBomb': this.pushes.push({ x: e.x, y: e.y, tx: e.tx, ty: e.ty, age: 0 }); fx.number(e.tx, e.ty - 30, 'BOMB PUSHED!', 0xffd36b); break;
      case 'cakeInvite': fx.number(e.x, e.y - 60, 'FREE CAKE!', 0xffc2e2); break;
      case 'cakeArrival': fx.emit('heart', e.x, e.y - 36, { vx: 0, vy: -26, life: 0.9, s0: 0.5, s1: 1 }); break;
      case 'deliveryArrived': fx.number(e.x, e.y - 60, 'DELIVERY!', 0xffd36b); break;
      case 'weaponStolen': fx.number(e.x, e.y - 46, 'STOLEN!', 0xff9fd0); fx.puff(e.x, e.y - 14, 5, 0xffffff); break;
      case 'troubleDash': fx.number(e.x, e.y - 46, 'WHOOSH!', 0xd2b4ff); fx.puff(e.x, e.y - 8, 8, 0xe0d4ff); break;
      case 'troubleRumor': fx.number(e.x, e.y - 52, 'PSST...', 0xd2b4ff); break;
      case 'leaderCrowned': fx.number(e.x, e.y - 60, 'LEADER!', 0xffd36b); for (let i = 0; i < 14; i++) fx.emit('star', e.x, e.y - 40, { vx: (Math.random() - 0.5) * 180, vy: -60 - Math.random() * 90, gravity: 220, life: 1, tint: 0xffd36b }); break;
      case 'conditionTriggered': fx.number(e.x, e.y - 46, 'FALL BACK!', 0xffd0a0); break;
      case 'weaponDropRoll': if (e.dropped) fx.number(e.x, e.y - 40, 'DROPPED!', 0xffe48a); break;
      case 'weaponDespawn': fx.puff(e.x, e.y - 6, 4, 0xffffff); break;
      case 'forgave': fx.emit('heart', e.x, e.y - 36, { vx: 0, vy: -24, life: 1, tint: 0xfff0f6 }); break;
      case 'rivalMeet': fx.emit('anger', e.x, e.y - 40, { vx: 0, vy: -20, life: 0.8 }); break;
      default: break;
    }
  }

  /** Confetti and the "BLANK!" cue for a Blank Rounds shot. */
  blank(e) {
    const fx = this.effects;
    const cols = [0xff5a5a, 0xffd93d, 0x6bd16b, 0x4aa8ff, 0xc77dff, 0xff8fb0];
    for (let i = 0; i < 22; i++) fx.emit(i % 3 ? 'crumb' : 'star', e.x + e.facing * 14, e.y - 22, { vx: (Math.random() - 0.5) * 260 + e.facing * 70, vy: -80 - Math.random() * 150, gravity: 340, life: 1.1, spin: 12, tint: cols[i % cols.length], s0: 0.9, s1: 1.2 });
    fx.number(e.x, e.y - 52, e.blanksLeft > 0 ? `BLANK! (${e.blanksLeft} left)` : 'BLANK! (last)', 0xffe27a);
  }

  /** Spark on the cover that took a bullet. */
  coverHit(e) {
    const rec = this.props.get(e.coverId);
    if (!rec) return;
    rec.shake = 1;
    this.effects.emit('sparkle', rec.p.x, rec.p.y - 10, { vx: 0, vy: -20, life: 0.4, tint: 0xfff0b0 });
    this.effects.number(rec.p.x, rec.p.y - 30, 'COVER!', 0xbfe3ff);
  }

  /** Per frame. `data` is the live world or the replay's recorded visuals. */
  update(data, time, dt) {
    this.clock += dt;
    const reduced = this.reduced;
    // props
    const list = data?.props;
    let pi = 0;
    for (const rec of this.props.values()) {
      const state = list ? list[pi] : null;
      pi++;
      const alive = state ? state.alive : true;
      if (rec.alive && !alive) { rec.alive = false; rec.sprite.texture = this.rubbleTexture(rec.p); rec.sprite.zIndex = rec.p.y - 5000; rec.sprite.rotation = 0; }
      else if (!rec.alive && alive) { rec.alive = true; rec.sprite.texture = this.propTexture(rec.p); rec.sprite.zIndex = rec.p.y + rec.p.h * 0.5; }
      if (rec.shake > 0.02) { rec.shake *= 0.85; rec.sprite.rotation = reduced ? 0 : Math.sin(this.clock * 60) * rec.shake * 0.06; } else if (rec.sprite.rotation !== 0 && rec.alive) rec.sprite.rotation = 0;
    }
    // grass
    const hadFlames = this.flamesLit;
    let anyFlame = false;
    if (hadFlames) this.flames.clear();
    let gi = 0;
    for (const slot of this.grass) {
      const p = data?.grass?.[gi] ?? slot.p;
      gi++;
      if (slot.key !== p.state) {
        slot.key = p.state;
        const g = slot.g;
        g.clear();
        const col = p.state === 'dry' ? 0xd9c15a : p.state === 'wet' ? 0x5e9e52 : p.state === 'burnt' ? 0x3a3532 : 0x9a8a3c;
        g.ellipse(p.x, p.y, p.r, p.r * 0.72).fill({ color: col, alpha: p.state === 'burnt' ? 0.9 : 0.78 });
        for (let i = 0; i < 16; i++) {
          const a = i * 2.4, d = (i * 13) % p.r * 0.85;
          g.poly([p.x + Math.cos(a) * d - 3, p.y + Math.sin(a) * d * 0.7 + 2, p.x + Math.cos(a) * d, p.y + Math.sin(a) * d * 0.7 - 8, p.x + Math.cos(a) * d + 3, p.y + Math.sin(a) * d * 0.7 + 2]).fill({ color: p.state === 'wet' ? 0x3f7a39 : p.state === 'burnt' ? 0x1f1c1a : 0xb99d3a, alpha: 0.9 });
        }
        if (p.state === 'dry') g.ellipse(p.x, p.y, p.r, p.r * 0.72).stroke({ width: 2, color: 0xe8d77a, alpha: 0.7 });
      }
      if (p.state === 'burning') {
        anyFlame = true;
        for (let i = 0; i < 9; i++) {
          const a = i * 2.2 + p.x, d = (i * 17) % p.r * 0.8;
          const h = 16 + (reduced ? 6 : Math.abs(Math.sin(this.clock * 9 + i * 1.7)) * 16);
          const fx0 = p.x + Math.cos(a) * d, fy0 = p.y + Math.sin(a) * d * 0.7;
          this.flames.poly([fx0 - 7, fy0, fx0, fy0 - h, fx0 + 7, fy0]).fill({ color: 0xff7a1a, alpha: 0.9 });
          this.flames.poly([fx0 - 3.5, fy0, fx0, fy0 - h * 0.6, fx0 + 3.5, fy0]).fill({ color: 0xffd34a, alpha: 0.95 });
        }
      } else if (p.state === 'smolder') {
        anyFlame = true;
        // the warning: a pulsing ring and thin smoke, long before any damage
        const pulse = reduced ? 0.7 : 0.5 + 0.5 * Math.sin(this.clock * 8);
        this.flames.ellipse(p.x, p.y, p.r * (1 + 0.04 * pulse), p.r * 0.72 * (1 + 0.04 * pulse)).stroke({ width: 3, color: 0xff7a3a, alpha: 0.5 + 0.4 * pulse });
        for (let i = 0; i < 4; i++) this.flames.circle(p.x + Math.cos(i * 1.7 + this.clock) * p.r * 0.4, p.y - 10 - ((this.clock * 24 + i * 11) % 30), 5 + i).fill({ color: 0x777777, alpha: 0.3 });
      }
    }
    this.flamesLit = anyFlame;
    // goods (redrawn only while there is something to draw)
    const goodsList = data?.goods ?? [];
    if (goodsList.length || this.goodsLit) this.goodsG.clear();
    this.goodsLit = goodsList.length > 0;
    for (const goods of goodsList) {
      const fade = Math.min(1, Math.max(0, (goods.until - time) / 2));
      this.goodsG.circle(goods.x, goods.y, 5).fill({ color: [0xe5533d, 0xf2c53d, 0x7acb7f, 0xff7aa8][goods.look % 4], alpha: fade }).stroke({ width: 1.2, color: INK, alpha: fade });
    }
    // dropped weapons (beacon pulses; fades out in its last seconds)
    const dropList = data?.weaponDrops ?? [];
    const anyDrop = dropList.some((d) => d.weapon);
    if (anyDrop || this.dropsLit) this.dropsG.clear();
    this.dropsLit = anyDrop;
    for (const d of dropList) {
      if (!d.weapon) continue;
      const fade = Math.min(1, Math.max(0, (d.until - time) / 4));
      const pulse = reduced ? 0.5 : 0.5 + 0.5 * Math.sin(this.clock * 6);
      this.dropsG.circle(d.x, d.y, 15 + pulse * 4).stroke({ width: 2.4, color: 0xffe48a, alpha: (0.45 + 0.4 * pulse) * fade });
      this.dropsG.circle(d.x, d.y, 11).fill({ color: 0x2b2622, alpha: 0.55 * fade });
      const c = { bat: 0xc58a4a, pan: 0x8a8f99, knife: 0xd7dbe2, gun: 0x8d96a6, shotgun: 0x9a7a52, rocket: 0x839a62 }[d.weapon] ?? 0xffffff;
      if (d.weapon === 'bat') this.dropsG.roundRect(-8 + d.x, d.y - 3, 16, 5, 2).fill({ color: c, alpha: fade });
      else if (d.weapon === 'pan') { this.dropsG.circle(d.x - 2, d.y, 6).fill({ color: c, alpha: fade }); this.dropsG.rect(d.x + 3, d.y - 1.5, 8, 3).fill({ color: c, alpha: fade }); }
      else if (d.weapon === 'knife') this.dropsG.poly([d.x - 9, d.y, d.x + 2, d.y - 3, d.x + 9, d.y, d.x + 2, d.y + 3]).fill({ color: c, alpha: fade });
      else { this.dropsG.rect(d.x - 9, d.y - 3, 16, 5).fill({ color: c, alpha: fade }); this.dropsG.rect(d.x - 3, d.y, 4, 7).fill({ color: c, alpha: fade }); }
    }
    // free cake
    const cakeList = data?.cakes ?? [];
    if (cakeList.length || this.cakesLit) this.cakesG.clear();
    this.cakesLit = cakeList.length > 0;
    for (const c of cakeList) {
      const fade = Math.min(1, Math.max(0, (c.until - time) / 2));
      const bob = reduced ? 0 : Math.sin(this.clock * 4) * 2;
      this.cakesG.ellipse(c.x, c.y + 12, 20, 6).fill({ color: 0x000000, alpha: 0.2 * fade });
      this.cakesG.roundRect(c.x - 15, c.y - 8 + bob, 30, 18, 4).fill({ color: 0xf6c9de, alpha: fade }).stroke({ width: 2, color: INK, alpha: fade });
      this.cakesG.roundRect(c.x - 15, c.y - 8 + bob, 30, 7, 4).fill({ color: 0xffffff, alpha: fade });
      this.cakesG.circle(c.x, c.y - 12 + bob, 4).fill({ color: 0xe5334d, alpha: fade });
      this.cakesG.circle(c.x, c.y, IDEAS.cake.arriveRadius * (0.9 + (reduced ? 0 : 0.06 * Math.sin(this.clock * 3)))).stroke({ width: 2, color: 0xff9fd0, alpha: 0.5 * fade });
    }

    // overlay: rain zones (the wet area where Lightning chains), bomb crates, combo traces
    const g = this.fx;
    const rainOn = (data?.fogs ?? []).some((f) => f.rain && time < f.until);
    const bombsOn = (data?.bombs ?? []).length > 0;
    const overlayOn = rainOn || bombsOn || this.zaps.length > 0 || this.pushes.length > 0;
    if (!overlayOn && !this.overlayLit) return;
    this.overlayLit = overlayOn;
    g.clear();
    let label = 0;
    const put = (text, x, y, color = 0xffffff, size = 1) => {
      const t = this.labels[label++];
      if (!t) return;
      t.text = text; t.style.fill = color; t.position.set(x, y); t.scale.set(size); t.visible = true;
    };
    for (const f of data?.fogs ?? []) {
      if (!f.rain || time >= f.until) continue;
      const hot = this.hint === 'lightning';
      const pulse = reduced ? 0.6 : 0.5 + 0.5 * Math.sin(this.clock * 5);
      g.circle(f.x, f.y, f.r).stroke({ width: hot ? 5 : 3, color: 0x9fe0ff, alpha: hot ? 0.55 + 0.4 * pulse : 0.28 });
      g.circle(f.x, f.y, f.r).fill({ color: 0x4aa8ff, alpha: hot ? 0.1 : 0.05 });
      if (hot) put('WET: Lightning chains here', f.x, f.y - f.r - 14, 0xbff3ff);
    }
    for (const b of data?.bombs ?? []) {
      const left = Math.max(0, b.at - time);
      if (b.delivery) {
        g.roundRect(b.x - 14, b.y - 18, 28, 24, 4).fill(0xb98a55).stroke({ width: 2.4, color: INK });
        g.rect(b.x - 14, b.y - 9, 28, 4).fill({ color: 0x000000, alpha: 0.25 });
        g.circle(b.x, b.y, b.r).stroke({ width: 2, color: 0xff6b4a, alpha: 0.35 + 0.25 * (reduced ? 1 : Math.sin(this.clock * 7 + left)) });
        put(`${Math.ceil(left)}`, b.x, b.y - 30, left < 4 ? 0xff7a5a : 0xffe48a, 1.2);
      }
      if (this.hint === 'gust') {
        g.circle(b.x, b.y, 26).stroke({ width: 3, color: 0xffd36b, alpha: 0.7 });
        put('Gust can push this', b.x, b.y - 38, 0xffe48a);
      }
    }
    for (let i = this.zaps.length - 1; i >= 0; i--) {
      const z = this.zaps[i];
      z.age += dt;
      if (z.age > 0.9) { this.zaps.splice(i, 1); continue; }
      for (const s of z.segs) {
        if (z.age < s.delay) continue;
        const k = Math.max(0, 1 - (z.age - s.delay) / 0.45);
        if (k <= 0) continue;
        const mx = (s.a.x + s.b.x) / 2 + Math.sin(this.clock * 90) * 6, my = (s.a.y + s.b.y) / 2 + Math.cos(this.clock * 80) * 6;
        g.moveTo(s.a.x, s.a.y).lineTo(mx, my).lineTo(s.b.x, s.b.y).stroke({ width: 6, color: 0x9fe0ff, alpha: 0.35 * k });
        g.moveTo(s.a.x, s.a.y).lineTo(mx, my).lineTo(s.b.x, s.b.y).stroke({ width: 2.4, color: 0xffffff, alpha: k });
      }
    }
    for (let i = this.pushes.length - 1; i >= 0; i--) {
      const p = this.pushes[i];
      p.age += dt;
      if (p.age > 1.1) { this.pushes.splice(i, 1); continue; }
      const k = Math.min(1, p.age / 0.6);
      g.moveTo(p.x, p.y).lineTo(p.x + (p.tx - p.x) * k, p.y + (p.ty - p.y) * k).stroke({ width: 4, color: 0xffd36b, alpha: 0.7 * (1 - p.age / 1.1) });
    }
    for (let i = label; i < this.labels.length; i++) this.labels[i].visible = false;
  }
}
