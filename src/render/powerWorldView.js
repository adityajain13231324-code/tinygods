import { Container, Graphics, Rectangle, Sprite } from 'pixi.js';
import { WORLD } from '../config/tunables.js';

// Persistent effects are pooled sprites. Drawing never consumes simulation randomness.
export class PowerWorldView {
  constructor(app) {
    this.root = new Container();
    this.root.eventMode = 'none';
    this.pool = [];
    this.night = app.stage.addChild(new Graphics().rect(0, 0, WORLD.width, WORLD.height).fill(0x101834));
    this.night.eventMode = 'none';
    this.night.alpha = 0;
    this.app = app;
    const motion = window.matchMedia('(prefers-reduced-motion: reduce)');
    this.reducedMotion = motion.matches;
    motion.addEventListener('change', e => { this.reducedMotion = e.matches; });
    const water = new Graphics().circle(0, 0, 155).fill({ color: 0x257faf, alpha: 0.22 });
    for (let arm = 0; arm < 3; arm++) {
      for (let i = 0; i < 65; i++) {
        const a = arm * Math.PI * 2 / 3 + i * 0.13;
        const r = 9 + i * 2;
        if (i === 0) water.moveTo(Math.cos(a) * r, Math.sin(a) * r);
        else water.lineTo(Math.cos(a) * r, Math.sin(a) * r);
      }
      water.stroke({ width: 6, color: 0xadeeff, alpha: 0.75 });
    }
    water.circle(0, 0, 16).fill(0x225774);
    const crate = new Graphics().ellipse(0, 7, 24, 10).fill({ color: 0x000000, alpha: 0.25 })
      .roundRect(-18, -25, 36, 30, 5).fill(0x596c42).stroke({ color: 0xffdf7c, width: 2 })
      .rect(-16, -15, 32, 5).fill(0xffdf7c).circle(0, -9, 7).fill(0x283c33)
      .poly([-4, -10, 6, -15, 3, -4]).fill(0xffdf7c);
    const rocket = new Graphics().poly([-34, -5, -11, 0, -34, 5, -24, 0]).fill({ color: 0xffbe65, alpha: 0.8 })
      .roundRect(-14, -5, 23, 10, 3).fill(0x839a62).stroke({ color: 0x26372c, width: 2 })
      .poly([8, -5, 17, 0, 8, 5]).fill(0xffbc65);
    this.textures = [water, crate, rocket].map(target => app.renderer.generateTexture({ target, frame: new Rectangle(-160, -160, 320, 320), resolution: 1 }));
    [water, crate, rocket].forEach(g => g.destroy());
  }
  update(data, time, dt) {
    let used = 0;
    const sprite = (texture, x, y, rotation = 0, alpha = 1) => {
      const s = this.pool[used] ?? (this.pool[used] = this.root.addChild(new Sprite()));
      used++;
      s.texture = this.textures[texture]; s.anchor.set(0.5); s.position.set(x, y);
      s.rotation = rotation; s.alpha = alpha; s.visible = true;
    };
    for (const w of data?.whirlpools ?? []) sprite(0, w.x, w.y, this.reducedMotion ? 0 : time * 2.3, Math.max(0, Math.min(1, (w.until - time) * 2)));
    for (const d of data?.weaponDrops ?? []) sprite(1, d.x, d.y);
    for (const r of data?.rockets ?? []) {
      const k = Math.max(0, Math.min(1, (time - r.start) / (r.at - r.start)));
      sprite(2, r.x + (r.tx - r.x) * k, r.y + (r.ty - r.y) * k - (this.reducedMotion ? 0 : Math.sin(k * Math.PI) * 18), Math.atan2(r.ty - r.y, r.tx - r.x));
    }
    for (let i = used; i < this.pool.length; i++) this.pool[i].visible = false;
    const target = time < (data?.blackoutUntil ?? 0) ? 0.65 : 0;
    this.night.alpha = this.reducedMotion ? target : this.night.alpha + (target - this.night.alpha) * Math.min(1, dt * 5);
    this.night.width = this.app.screen.width; this.night.height = this.app.screen.height;
  }
}
