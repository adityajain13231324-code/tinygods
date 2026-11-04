import { Container, Graphics, Sprite, Text } from 'pixi.js';
import { VillagerView, heart } from './villagerView.js';

const MAX_PARTICLES = 320;
const NUMBER_POOL = 24;

// Hearts, anger marks, sweat, smoke, stars, damage numbers. Everything is pooled: sprites
// are created once and recycled, so a big brawl never allocates in the render loop.

export class Effects {
  /**
   * @param {import('pixi.js').Application} app
   * @param {import('./../audio/mixer.js').Mixer | null} audio
   */
  constructor(app, audio) {
    this.audio = audio;
    this.views = null; // set by main.js, so shots can find the shooter
    this.layer = new Container();
    this.decals = new Graphics(); // blood stains on the ground (added under the crowd by main.js)
    this.decalList = [];
    this.beams = new Graphics(); // bullet tracers and muzzle flashes
    this.tracers = [];
    this.fogG = new Graphics(); // patches of god-made fog
    this.bolts = []; // lightning strikes: {x, y, pts, age}
    this.rings = []; // expanding shock rings from blasts: {x, y, r, age}
    this.world = null; // set by the director so fog can read sim time
    this.layer.addChild(this.fogG, this.beams);
    this.textures = makeTextures(app);
    this.free = [];
    this.live = [];
    this.numbersFree = [];
    this.numbersLive = [];
    for (let i = 0; i < NUMBER_POOL; i++) {
      const t = new Text({
        text: '',
        style: { fontFamily: 'system-ui, sans-serif', fontSize: 17, fontWeight: '900', fill: 0xffffff, stroke: { color: 0x2b2622, width: 4 } },
      });
      t.anchor.set(0.5);
      t.visible = false;
      this.layer.addChild(t);
      this.numbersFree.push(t);
    }
  }

  emit(kind, x, y, o = {}) {
    if (this.live.length >= MAX_PARTICLES) return;
    const sprite = this.free.pop() ?? this.layer.addChild(new Sprite());
    sprite.texture = this.textures[kind];
    sprite.anchor.set(0.5);
    sprite.visible = true;
    sprite.position.set(x, y);
    sprite.tint = o.tint ?? 0xffffff;
    this.live.push({
      sprite,
      vx: o.vx ?? (Math.random() - 0.5) * 20,
      vy: o.vy ?? -28,
      gravity: o.gravity ?? 0,
      stain: o.stain ?? false,
      life: o.life ?? 0.9,
      max: o.life ?? 0.9,
      s0: o.s0 ?? 0.8,
      s1: o.s1 ?? 1.1,
      spin: o.spin ?? 0,
    });
  }

  number(x, y, text, color = 0xffffff) {
    const t = this.numbersFree.pop();
    if (!t) return;
    t.text = text;
    t.style.fill = color;
    t.visible = true;
    t.position.set(x, y);
    this.numbersLive.push({ t, life: 0.9, max: 0.9 });
  }

  /** A burst of smoke, used for deaths and gun muzzles. */
  puff(x, y, n = 7, tint = 0xffffff) {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      const sp = 20 + Math.random() * 40;
      this.emit('smoke', x, y, { vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - 15, life: 0.7 + Math.random() * 0.4, s0: 0.5, s1: 1.7, tint });
    }
  }

  muzzle(x, y) {
    this.emit('flash', x, y - 12, { vx: 0, vy: 0, life: 0.14, s0: 1.2, s1: 2.2 });
    this.puff(x, y - 12, 5, 0xcfcfcf);
  }

  /**
   * A gunshot, properly: muzzle flash pointing at the target, a tracer streaking across (six
   * pellets for a shotgun), an ejected casing, a puff of smoke, the shooter's recoil, and an
   * impact (sparks and blood on a hit, a dust kick on a miss).
   */
  shot(e) {
    const shooter = this.views?.[e.shooterId];
    const shotgun = e.weapon === 'shotgun';
    const dir = e.tx >= e.x ? 1 : -1;
    // The muzzle is roughly at the shooter's hand, held out toward the target.
    const mx = e.x + dir * (shotgun ? 24 : 15);
    const my = e.y - 22;
    const ty = e.ty - 22;
    const angle = Math.atan2(ty - my, e.tx - mx);
    if (shooter) shooter.recoil = 1;

    const pellets = shotgun ? 6 : 1;
    for (let i = 0; i < pellets; i++) {
      const spread = shotgun ? (Math.random() - 0.5) * 0.45 : e.hit ? 0 : (Math.random() - 0.5) * 0.25;
      const a = angle + spread;
      const reach = shotgun ? 150 + Math.random() * 40 : e.hit ? Math.hypot(e.tx - mx, ty - my) : Math.hypot(e.tx - mx, ty - my) + 120;
      this.tracers.push({
        x0: mx, y0: my, x1: mx + Math.cos(a) * reach, y1: my + Math.sin(a) * reach,
        age: 0, life: shotgun ? 0.11 : 0.13, width: shotgun ? 1.6 : 2.6, kind: 'tracer',
      });
    }
    // Muzzle flash: a cone along the barrel.
    this.tracers.push({ x0: mx, y0: my, x1: mx + Math.cos(angle) * (shotgun ? 42 : 26), y1: my + Math.sin(angle) * (shotgun ? 42 : 26), age: 0, life: 0.09, width: shotgun ? 18 : 10, kind: 'flash', angle });
    this.emit('flash', mx, my, { vx: 0, vy: 0, life: 0.1, s0: shotgun ? 1.6 : 1.0, s1: shotgun ? 2.6 : 1.8 });

    // Smoke curling off the barrel, and a casing flying out of the side.
    for (let i = 0; i < (shotgun ? 6 : 3); i++) {
      this.emit('smoke', mx + Math.cos(angle) * 6, my + Math.sin(angle) * 6, { vx: Math.cos(angle) * 22 + (Math.random() - 0.5) * 14, vy: -10 - Math.random() * 16, life: 0.9 + Math.random() * 0.5, s0: 0.35, s1: 1.1, tint: 0xd8d8d8 });
    }
    this.emit(shotgun ? 'shell' : 'casing', e.x + dir * 6, e.y - 24, { vx: -dir * (30 + Math.random() * 30), vy: -50 - Math.random() * 30, gravity: 260, life: 0.8, s0: 1, s1: 1, spin: 14 });

    // Impact at the far end.
    if (e.hit) {
      this.emit('star', e.tx, ty, { vx: 0, vy: -20, life: 0.35, s0: 1.2, s1: 0.5, spin: 8 });
      if (VillagerView.bloodEnabled) this.spray(e.tx, ty, e.x, e.y, shotgun ? 9 : 5);
    } else {
      const ex = mx + Math.cos(angle) * Math.hypot(e.tx - mx, ty - my) * 1.5;
      const ey = my + Math.sin(angle) * Math.hypot(e.tx - mx, ty - my) * 1.5;
      this.puff(ex, ey + 14, 4, 0xc9b98a); // a dust kick where it landed
    }
  }

  /** Blood droplets flying away from where the hit came from. Cartoon style, and it can be turned off. */
  spray(x, y, fromX, fromY, n) {
    const base = Math.atan2(y - fromY, x - fromX);
    n = Math.round(n * 1.8);
    for (let i = 0; i < n; i++) {
      const a = base + (Math.random() - 0.5) * 1.7;
      const sp = 40 + Math.random() * 130;
      this.emit('blood', x, y, { vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - 40, gravity: 320, life: 0.45 + Math.random() * 0.4, s0: 0.9 + Math.random() * 0.7, s1: 0.7, stain: true });
    }
    // a long smear on the ground, thrown away from the hit, like a paint streak
    const len = 14 + n * 2.2 + Math.random() * 10;
    this.stain(x + Math.cos(base) * len * 0.5, y + 8 + Math.sin(base) * len * 0.2, 5 + Math.random() * 3, { angle: base, stretch: len / 6 });
  }

  /** A stain on the ground that fades slowly. Optionally a streak (angle, stretch). */
  stain(x, y, r = 4 + Math.random() * 4, streak = null) {
    if (this.decalList.length >= 420) this.decalList.shift();
    this.decalList.push({ x: x + (Math.random() - 0.5) * 6, y, r: r * 1.3, age: 0, life: 70, angle: streak?.angle ?? 0, stretch: streak?.stretch ?? 1 });
  }

  /** A god power was used: show the effect (but never who used it). */
  power(e) {
    const { x, y } = e;
    switch (e.power) {
      case 'lightning': {
        const pts = [[x + (Math.random() - 0.5) * 30, y - 520]];
        for (let i = 1; i < 7; i++) pts.push([x + (Math.random() - 0.5) * 60 * (1 - i / 7), y - 520 + (520 * i) / 7]);
        pts.push([x, y]);
        this.bolts.push({ pts, age: 0, x, y });
        this.puff(x, y, 10, 0xfff2c4);
        for (let i = 0; i < 8; i++) this.emit('sparkle', x, y, { vx: (Math.random() - 0.5) * 160, vy: -Math.random() * 120, gravity: 260, life: 0.6, tint: 0xfff3a8 });
        this.audio?.play('shotgun', x);
        break;
      }
      case 'miracle':
        for (let i = 0; i < 12; i++) this.emit('sparkle', x + (Math.random() - 0.5) * 20, y - 6, { vx: (Math.random() - 0.5) * 30, vy: -30 - Math.random() * 50, life: 1.1, s0: 0.6, s1: 1.4 });
        this.audio?.play('bond', x);
        break;
      case 'whisper':
        for (let i = 0; i < 5; i++) this.emit('note', x, y - 30, { vx: (Math.random() - 0.5) * 24, vy: -22 - Math.random() * 20, life: 1.2, tint: 0xb9a4ff });
        break;
      case 'fog':
        this.puff(x, y, 14, 0xdfe6ee);
        break;
      case 'tornado':
        for (let i = 0; i < 22; i++) {
          const a = (i / 22) * Math.PI * 2;
          const r = 30 + (i % 4) * 36;
          this.emit('smoke', x + Math.cos(a) * r, y + Math.sin(a) * r * 0.6, { vx: -Math.sin(a) * 160, vy: Math.cos(a) * 100 - 30, life: 0.9, s0: 0.5, s1: 1.4, tint: 0xd7dde6 });
        }
        for (let i = 0; i < 8; i++) this.emit('leaf', x, y, { vx: (Math.random() - 0.5) * 240, vy: -60 - Math.random() * 80, gravity: 100, life: 1.1, spin: 9 });
        this.audio?.play('warp', x);
        break;
      case 'earthquake':
        for (let i = 0; i < 40; i++) this.emit('crumb', Math.random() * 1920, Math.random() * 1080, { vx: (Math.random() - 0.5) * 60, vy: -20 - Math.random() * 40, gravity: 120, life: 0.9, s0: 1.2, s1: 0.6, tint: 0x9a8a6a });
        this.audio?.play('warp', 960);
        break;
      case 'rain':
        this.puff(x, y, 8, 0xaecbe6);
        this.audio?.play('bond', x);
        break;
      case 'charm':
        for (let i = 0; i < 7; i++) this.emit('heart', x + (Math.random() - 0.5) * 26, y - 20, { vx: (Math.random() - 0.5) * 30, vy: -36 - Math.random() * 30, life: 1.2, s0: 0.7, s1: 1.4 });
        this.audio?.play('bond', x);
        break;
      case 'enrage':
        for (let i = 0; i < 5; i++) this.emit('anger', x + (Math.random() - 0.5) * 24, y - 34, { vx: (Math.random() - 0.5) * 40, vy: -30 - Math.random() * 20, life: 0.9, s0: 0.9, s1: 1.5 });
        break;
      case 'aegis':
        for (let i = 0; i < 12; i++) {
          const a = (i / 12) * Math.PI * 2;
          this.emit('sparkle', x + Math.cos(a) * 18, y - 18 + Math.sin(a) * 18, { vx: Math.cos(a) * 30, vy: Math.sin(a) * 30, life: 0.9, s0: 0.7, s1: 1.2, tint: 0x8fd0ff });
        }
        this.audio?.play('bond', x);
        break;
      case 'sleep':
        for (let i = 0; i < 3; i++) this.emit('zzz', x + 8 + i * 6, y - 40 - i * 8, { vx: 8, vy: -20, life: 1.6, s0: 0.8, s1: 1.4 });
        break;
      case 'disarm':
        for (let i = 0; i < 10; i++) this.emit('casing', x, y - 10, { vx: (Math.random() - 0.5) * 260, vy: -80 - Math.random() * 120, gravity: 420, life: 0.8, spin: 14 });
        this.audio?.play('clang', x);
        break;
      case 'gust':
        for (let i = 0; i < 9; i++) this.emit('leaf', x, y - 8, { vx: 60 + Math.random() * 120, vy: -10 - Math.random() * 40, gravity: 20, life: 1, spin: 6 });
        break;
    }
  }

  /** A bomb or fireball going off: flash, smoke, fire, a shock ring. */
  explosion(e) {
    this.rings.push({ x: e.x, y: e.y, r: e.r, age: 0 });
    this.puff(e.x, e.y, 16, 0x6a6a6a);
    for (let i = 0; i < 14; i++) {
      const a = Math.random() * Math.PI * 2;
      const sp = 80 + Math.random() * 220;
      this.emit('flash', e.x, e.y, { vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, life: 0.5, s0: 1.6, s1: 0.3 });
    }
    for (let i = 0; i < 10; i++) this.emit('crumb', e.x, e.y, { vx: (Math.random() - 0.5) * 300, vy: -120 - Math.random() * 200, gravity: 500, life: 0.9, tint: 0x3a3a3a });
    this.audio?.play('explosion', e.x);
  }

  drawFogs() {
    const g = this.fogG;
    g.clear();
    const t = this.world?.time ?? 0;
    // Time bombs: a black ball with a lit fuse, ticking faster as it gets close.
    for (const b of this.world?.bombs ?? []) {
      const left = b.at - t;
      const rate = left < 3 ? 14 : 4;
      const blink = Math.sin(t * rate) > 0;
      g.circle(b.x, b.y - 8, 11).fill(0x23211f).stroke({ width: 2, color: 0x000000 });
      g.circle(b.x - 3, b.y - 11, 3).fill({ color: 0xffffff, alpha: 0.35 });
      g.moveTo(b.x + 3, b.y - 18).lineTo(b.x + 8, b.y - 25).stroke({ width: 2, color: 0x8a6a35 });
      g.circle(b.x + 9, b.y - 26, blink ? 4.5 : 2.5).fill(blink ? 0xffe27a : 0xff7a3a);
      g.circle(b.x, b.y, b.r).stroke({ width: 2, color: 0xff5a3a, alpha: left < 4 ? (blink ? 0.7 : 0.25) : 0.18 });
    }
    for (const f of this.world?.fogs ?? []) {
      const left = f.until - t;
      if (left <= 0) continue;
      const a = 0.32 * Math.min(1, left / 3);
      const wob = Math.sin(t * 1.3) * 6;
      if (!f.rain) {
        g.circle(f.x, f.y, f.r + wob).fill({ color: 0xe6ecf2, alpha: a });
        g.circle(f.x - f.r * 0.35, f.y + 6, f.r * 0.7).fill({ color: 0xffffff, alpha: a * 0.7 });
      }
      if (f.rain) {
        g.circle(f.x, f.y, f.r).fill({ color: 0x6c92b8, alpha: a * 0.5 });
        for (let i = 0; i < 26; i++) {
          const rx = f.x + ((i * 97) % 200 - 100) * (f.r / 100) + Math.sin(i) * 6;
          const ry = f.y - f.r + (((t * 420 + i * 53) % (f.r * 2)));
          g.moveTo(rx, ry).lineTo(rx - 3, ry + 11).stroke({ width: 1.6, color: 0xcfe6ff, alpha: 0.6 * Math.min(1, left / 2) });
        }
        continue;
      }
      g.circle(f.x + f.r * 0.4, f.y - 8, f.r * 0.6 - wob).fill({ color: 0xffffff, alpha: a * 0.7 });
    }
  }

  update(dt) {
    this.drawFogs();
    this.drawBeams(dt);
    this.drawDecals(dt);
    for (let i = this.live.length - 1; i >= 0; i--) {
      const p = this.live[i];
      p.life -= dt;
      if (p.life <= 0) {
        if (p.stain && VillagerView.bloodEnabled) this.stain(p.sprite.x, p.sprite.y + 6);
        p.sprite.visible = false;
        this.free.push(p.sprite);
        this.live.splice(i, 1);
        continue;
      }
      const k = 1 - p.life / p.max; // 0 -> 1
      p.vy += p.gravity * dt;
      p.sprite.x += p.vx * dt;
      p.sprite.y += p.vy * dt;
      p.sprite.rotation += p.spin * dt;
      p.sprite.scale.set(p.s0 + (p.s1 - p.s0) * k);
      p.sprite.alpha = Math.min(1, p.life / (p.max * 0.5));
    }
    for (let i = this.numbersLive.length - 1; i >= 0; i--) {
      const n = this.numbersLive[i];
      n.life -= dt;
      if (n.life <= 0) {
        n.t.visible = false;
        this.numbersFree.push(n.t);
        this.numbersLive.splice(i, 1);
        continue;
      }
      n.t.y -= 38 * dt;
      n.t.alpha = Math.min(1, n.life / (n.max * 0.5));
    }
  }

  drawBeams(dt) {
    const g = this.beams;
    g.clear();
    for (let i = this.tracers.length - 1; i >= 0; i--) {
      const t = this.tracers[i];
      t.age += dt;
      if (t.age >= t.life) {
        this.tracers.splice(i, 1);
        continue;
      }
      const k = t.age / t.life;
      if (t.kind === 'flash') {
        // a cone: wide at the muzzle... no: narrow at the muzzle, fading as it opens
        const nx = -Math.sin(t.angle);
        const ny = Math.cos(t.angle);
        const w = t.width * (1 - k * 0.4);
        g.poly([t.x0, t.y0, t.x1 + nx * w * 0.5, t.y1 + ny * w * 0.5, t.x1 - nx * w * 0.5, t.y1 - ny * w * 0.5]).fill({ color: 0xffd36b, alpha: 0.9 * (1 - k) });
        g.poly([t.x0, t.y0, t.x1 * 0.4 + t.x0 * 0.6 + nx * w * 0.2, t.y1 * 0.4 + t.y0 * 0.6 + ny * w * 0.2, t.x1 * 0.4 + t.x0 * 0.6 - nx * w * 0.2, t.y1 * 0.4 + t.y0 * 0.6 - ny * w * 0.2]).fill({ color: 0xffffff, alpha: 0.9 * (1 - k) });
        continue;
      }
      // tracer: a streak that races from the muzzle to the end point
      const head = Math.min(1, k * 1.6);
      const tail = Math.max(0, head - 0.35);
      const hx = t.x0 + (t.x1 - t.x0) * head;
      const hy = t.y0 + (t.y1 - t.y0) * head;
      const tx = t.x0 + (t.x1 - t.x0) * tail;
      const ty = t.y0 + (t.y1 - t.y0) * tail;
      g.moveTo(tx, ty).lineTo(hx, hy).stroke({ width: t.width + 1.8, color: 0xffb347, alpha: 0.35 * (1 - k), cap: 'round' });
      g.moveTo(tx, ty).lineTo(hx, hy).stroke({ width: t.width, color: 0xfff7d6, alpha: 1 - k * 0.6, cap: 'round' });
    }
    for (let i = this.rings.length - 1; i >= 0; i--) {
      const r = this.rings[i];
      r.age += dt;
      if (r.age > 0.55) {
        this.rings.splice(i, 1);
        continue;
      }
      const k = r.age / 0.55;
      g.circle(r.x, r.y, r.r * (0.2 + 0.9 * k)).stroke({ width: 7 * (1 - k) + 1, color: 0xffb347, alpha: 0.8 * (1 - k) });
      g.circle(r.x, r.y, r.r * 0.55 * (1 - k * 0.6)).fill({ color: 0xfff1b0, alpha: 0.5 * (1 - k) });
    }
    for (let i = this.bolts.length - 1; i >= 0; i--) {
      const b = this.bolts[i];
      b.age += dt;
      if (b.age > 0.45) {
        this.bolts.splice(i, 1);
        continue;
      }
      const a = 1 - b.age / 0.45;
      g.circle(b.x, b.y, 70 * (1 - a * 0.3)).fill({ color: 0xffffff, alpha: 0.35 * a });
      g.moveTo(b.pts[0][0], b.pts[0][1]);
      for (const [px, py] of b.pts.slice(1)) g.lineTo(px, py);
      g.stroke({ width: 9, color: 0xffd36b, alpha: 0.4 * a, join: 'round' });
      g.moveTo(b.pts[0][0], b.pts[0][1]);
      for (const [px, py] of b.pts.slice(1)) g.lineTo(px, py);
      g.stroke({ width: 3.5, color: 0xffffff, alpha: a, join: 'round' });
    }
  }

  drawDecals(dt) {
    const g = this.decals;
    g.clear();
    for (let i = this.decalList.length - 1; i >= 0; i--) {
      const d = this.decalList[i];
      d.age += dt;
      if (d.age > d.life) {
        this.decalList.splice(i, 1);
        continue;
      }
      const a = 0.7 * Math.min(1, (d.life - d.age) / 12);
      if (d.stretch > 1) {
        const dx = Math.cos(d.angle) * d.r * d.stretch;
        const dy = Math.sin(d.angle) * d.r * d.stretch * 0.4;
        g.moveTo(d.x - dx, d.y - dy).lineTo(d.x + dx, d.y + dy).stroke({ width: d.r * 1.1, color: 0x9e1b24, alpha: a, cap: 'round' });
        g.moveTo(d.x - dx * 0.5, d.y - dy * 0.5).lineTo(d.x + dx * 0.7, d.y + dy * 0.7).stroke({ width: d.r * 0.5, color: 0xc72b36, alpha: a * 0.7, cap: 'round' });
        continue;
      }
      g.ellipse(d.x, d.y, d.r, d.r * 0.55).fill({ color: 0x9e1b24, alpha: a });
      g.ellipse(d.x - d.r * 0.25, d.y - 0.5, d.r * 0.4, d.r * 0.2).fill({ color: 0xc72b36, alpha: a * 0.7 });
    }
  }

  /**
   * Look at one villager's view and spawn whatever its current state calls for.
   * Edge detection (hit / death / starting a fight) plus slow repeating marks (hearts, veins...).
   */
  watch(view, time) {
    const v = view.v;
    const f = (view.fx ??= { alive: true, hit: 0, swing: 0, state: v.state, next: 0 });
    const hx = view.headX();
    const hy = view.headY();

    if (v.alive && !f.alive) f.alive = true; // replay rewound past their death
    if (f.alive && !v.alive) {
      f.alive = false;
      this.puff(view.root.x, view.bodyY(), 8);
      if (VillagerView.bloodEnabled) {
        this.spray(view.root.x, view.bodyY(), v.hitFromX, v.hitFromY, 7);
        this.stain(view.root.x, view.root.y, 9);
        this.stain(view.root.x + 8, view.root.y + 3, 6);
      }
      this.audio?.play('thud', view.root.x);
      this.audio?.play('scream', view.root.x);
      return;
    }
    if (!v.alive) return;

    if (v.hitFlash > f.hit + 0.5) {
      for (let i = 0; i < 3; i++) this.emit('star', view.root.x + (Math.random() - 0.5) * 16, view.bodyY() - 6, { vy: -30 - Math.random() * 20, life: 0.5, s0: 0.7, s1: 1.2, spin: 6 });
      this.number(view.root.x, hy - 6, `-${Math.round(v.lastDamage)}`, v.lastDamage >= 25 ? 0xff7a5a : 0xffffff);
      if (VillagerView.bloodEnabled && v.lastHitWeapon !== 'shove') this.spray(view.root.x, view.bodyY(), v.hitFromX, v.hitFromY, v.lastDamage >= 25 ? 6 : 3);
      this.audio?.play(HIT_SOUND[v.lastHitWeapon] ?? 'slap', view.root.x);
    }
    f.hit = v.hitFlash;

    if (v.swing > 0.95 && f.swing <= 0.95) this.audio?.play('swing', view.root.x);
    f.swing = v.swing;
    if (v.state === 'attack' && f.state !== 'attack') this.emit('exclaim', hx, hy - 8, { vy: -18, life: 0.7 });
    if (v.state === 'talk' && f.state !== 'talk' && Math.random() < 0.35) this.audio?.play('squeak', view.root.x);
    if (v.brewId >= 0 && !(f.brew >= 0)) this.audio?.play('growl', view.root.x);
    f.brew = v.brewId;
    f.state = v.state;

    // Wounded villagers drip, and leave a trail of drops behind them as they stagger.
    if (VillagerView.bloodEnabled && v.hp < 50 && time >= (f.nextDrip ?? 0)) {
      f.nextDrip = time + 0.55 + Math.random() * 0.5;
      this.emit('blood', view.root.x + (Math.random() - 0.5) * 8, view.bodyY() + 6, { vx: 0, vy: 10, gravity: 220, life: 0.35, s0: 0.8, s1: 0.8, stain: true });
    }

    // During a spotlighted camera cut only the two people involved make little marks and noises.
    if (view.dim || time < f.next) return;
    switch (view.action) {
      case 'hug':
        this.emit('heart', hx + (Math.random() - 0.5) * 14, hy, { vy: -26, life: 1.1 });
        if (Math.random() < 0.4) this.audio?.play('pop', view.root.x);
        f.next = time + 0.55 + Math.random() * 0.4;
        break;
      case 'argue':
      case 'attack':
      case 'chase':
        this.emit('anger', hx + 10, hy - 4, { vy: -14, life: 0.6, s0: 0.9, s1: 1.3 });
        f.next = time + 0.7 + Math.random() * 0.5;
        break;
      case 'flee':
        this.emit('sweat', hx + (Math.random() < 0.5 ? -11 : 11), hy + 8, { vx: v.facing * -10, vy: -22, gravity: 60, life: 0.55 });
        f.next = time + 0.35 + Math.random() * 0.25;
        break;
      case 'mourn':
        this.emit('tear', view.root.x + (Math.random() < 0.5 ? -4 : 4), view.bodyY() - 3, { vx: 0, vy: 8, gravity: 70, life: 0.7 });
        f.next = time + 0.5 + Math.random() * 0.4;
        break;
      case 'dance':
        this.emit('note', hx + (Math.random() - 0.5) * 22, hy, { vx: (Math.random() - 0.5) * 24, vy: -30, life: 1.1, spin: 2 });
        f.next = time + 0.45 + Math.random() * 0.3;
        break;
      case 'rest':
        this.emit('zzz', hx + 10, hy, { vx: 6, vy: -16, life: 1.4, s0: 0.6, s1: 1.2 });
        f.next = time + 1.1 + Math.random() * 0.6;
        break;
      case 'pray':
        this.emit('sparkle', hx + (Math.random() - 0.5) * 16, hy + 4, { vy: -20, life: 0.9, spin: 3 });
        f.next = time + 0.7 + Math.random() * 0.5;
        break;
      case 'eat':
        this.emit('crumb', view.root.x + v.facing * 8, view.bodyY() + 2, { vx: v.facing * 8, vy: -8, gravity: 80, life: 0.5, s0: 0.8, s1: 0.8 });
        f.next = time + 0.3 + Math.random() * 0.3;
        break;
      case 'garden':
        this.emit('leaf', view.root.x + v.facing * 10, view.bodyY() + 6, { vx: v.facing * 14, vy: -22, gravity: 50, life: 0.8, spin: 4 });
        f.next = time + 0.8 + Math.random() * 0.5;
        break;
      case 'fish':
        this.emit('tear', view.root.x + v.facing * 16, view.root.y - 4, { vx: v.facing * 6, vy: -24, gravity: 60, life: 0.6, s0: 0.9, s1: 0.9 });
        f.next = time + 1.2 + Math.random() * 0.8;
        break;
      case 'train':
        this.emit('sweat', hx + (Math.random() < 0.5 ? -10 : 10), hy + 10, { vy: -16, gravity: 50, life: 0.5 });
        f.next = time + 0.6 + Math.random() * 0.4;
        break;
      default:
        f.next = time + 0.3;
    }
  }
}

const HIT_SOUND = { shove: 'shove', none: 'slap', pan: 'clang', bat: 'thwack', knife: 'stab', gun: 'slap', shotgun: 'slap' };

function makeTextures(app) {
  const make = (draw) => {
    const g = new Graphics();
    draw(g);
    return app.renderer.generateTexture({ target: g, resolution: 2 });
  };
  const ink = 0x2b2622;
  return {
    heart: make((g) => { heart(g, 0, 0, 6); g.stroke({ width: 1.2, color: 0x8f1239 }); }),
    anger: make((g) => {
      for (const [dx, dy] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
        g.moveTo(dx * 2, dy * 7).lineTo(dx * 7, dy * 2).stroke({ width: 2.6, color: 0xd62828, cap: 'round' });
      }
    }),
    sweat: make((g) => { g.poly([0, -6, 4.5, 1, 0, 5, -4.5, 1]).fill(0x6bb8f0).stroke({ width: 1.2, color: ink }); }),
    tear: make((g) => { g.poly([0, -4, 3, 1, 0, 4, -3, 1]).fill(0x8fcdf5).stroke({ width: 1, color: ink }); }),
    exclaim: make((g) => {
      g.roundRect(-2.2, -11, 4.4, 12, 2).fill(0xd62828).stroke({ width: 1.2, color: ink });
      g.circle(0, 5, 2.3).fill(0xd62828).stroke({ width: 1.2, color: ink });
    }),
    note: make((g) => {
      g.ellipse(-2, 4, 4, 3).fill(0x6a4bd8).stroke({ width: 1, color: ink });
      g.moveTo(1.6, 3).lineTo(1.6, -8).lineTo(7, -5).stroke({ width: 2, color: 0x6a4bd8, cap: 'round', join: 'round' });
    }),
    zzz: make((g) => {
      g.moveTo(-5, -5).lineTo(5, -5).lineTo(-5, 5).lineTo(5, 5).stroke({ width: 2.4, color: 0x5a7fc4, cap: 'round', join: 'round' });
    }),
    sparkle: make((g) => {
      g.poly([0, -7, 1.8, -1.8, 7, 0, 1.8, 1.8, 0, 7, -1.8, 1.8, -7, 0, -1.8, -1.8]).fill(0xfff3a8).stroke({ width: 1, color: 0xe0b83a });
    }),
    leaf: make((g) => {
      g.moveTo(0, 5).quadraticCurveTo(-6, 0, 0, -6).quadraticCurveTo(6, 0, 0, 5).fill(0x4fb85f).stroke({ width: 1, color: 0x2f7a3a });
    }),
    crumb: make((g) => { g.circle(0, 0, 2.2).fill(0xd9a35a); }),
    blood: make((g) => { g.poly([0, -4.5, 2.6, 0.5, 0, 3.4, -2.6, 0.5]).fill(0xb3202a); g.circle(0, 1, 2.6).fill(0xb3202a); }),
    casing: make((g) => { g.roundRect(-3, -1.4, 6, 2.8, 1).fill(0xe0b43c).stroke({ width: 0.8, color: 0x8a6a14 }); }),
    shell: make((g) => { g.roundRect(-4.5, -2.4, 9, 4.8, 1.4).fill(0xd62828).stroke({ width: 0.9, color: 0x7a1414 }); g.rect(-4.5, 0.4, 3, 2.2).fill(0xe0b43c); }),
    smoke: make((g) => { g.circle(0, 0, 9).fill({ color: 0xe8e8e8, alpha: 0.95 }); }),
    flash: make((g) => { g.circle(0, 0, 8).fill(0xffd36b); g.circle(0, 0, 4.5).fill(0xffffff); }),
    star: make((g) => {
      const pts = [];
      for (let i = 0; i < 8; i++) {
        const r = i % 2 === 0 ? 6 : 2.2;
        const a = -Math.PI / 2 + (Math.PI / 4) * i;
        pts.push(Math.cos(a) * r, Math.sin(a) * r);
      }
      g.poly(pts).fill(0xffe27a).stroke({ width: 1, color: ink });
    }),
  };
}
