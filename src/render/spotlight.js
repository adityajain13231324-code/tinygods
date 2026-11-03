import { Container, Graphics, Text } from 'pixi.js';
import { VILLAGER } from '../config/tunables.js';
import { TOP_Y, lookOfGroup } from './villagerView.js';
import { groupOf } from '../sim/villager.js';

const R = VILLAGER.radius;

/**
 * During a camera cut this marks WHO is involved: a red ring and label on the attacker, a
 * white ring and label on the victim, and an arrow between them. Everyone else is dimmed by
 * main.js, so the eye goes straight to the two people the news board is talking about.
 */
export class Spotlight {
  constructor(layer, views, camera) {
    this.views = views;
    this.camera = camera;
    this.root = new Container();
    this.g = new Graphics();
    this.labels = [0, 1].map(() => {
      const t = new Text({
        text: '',
        style: { fontFamily: 'system-ui, sans-serif', fontSize: 15, fontWeight: '800', fill: 0xffffff, align: 'center', stroke: { color: 0x20201c, width: 4 } },
      });
      t.anchor.set(0.5, 1);
      this.root.addChild(t);
      return t;
    });
    this.root.addChildAt(this.g, 0);
    layer.addChild(this.root);
    this.root.visible = false;
    this.killerId = -1;
    this.victimId = -1;
    this.until = 0;
    this.now = 0;
  }

  show(killer, victim, now, seconds) {
    this.now = now;
    this.killerId = killer.id;
    this.victimId = victim.id;
    this.until = now + seconds;
    const set = (label, v, role) => {
      label.text = `${role}\n${v.name}`;
      label.style.fill = lookOfGroup(groupOf(v)).color;
    };
    set(this.labels[0], killer, 'ATTACKER');
    set(this.labels[1], victim, 'VICTIM');
  }

  has(id) {
    return this.active && (id === this.killerId || id === this.victimId);
  }

  get active() {
    // Only while its own cut is running: a later zoom (a replay, a cutscene) must not reuse it.
    return this.killerId >= 0 && this.camera.k > 0.05 && this.now <= this.until + 0.4;
  }

  update(now) {
    this.now = now;
    const g = this.g;
    g.clear();
    if (!this.active || now > this.until + 0.5) {
      this.root.visible = false;
      return;
    }
    this.root.visible = true;
    this.root.alpha = Math.min(1, this.camera.k * 1.5);
    const kv = this.views[this.killerId];
    const vv = this.views[this.victimId];
    const pulse = 1 + Math.sin(now * 7) * 0.08;
    const inv = 1 / (this.camera.scale || 1); // keep text the same size on screen whatever the zoom

    const draw = (view, color, label) => {
      const x = view.root.x;
      const y = view.root.y;
      g.ellipse(x, y, R * 1.7 * pulse, R * 0.7 * pulse).stroke({ width: 3, color, alpha: 0.95 });
      g.ellipse(x, y, R * 1.3, R * 0.5).fill({ color, alpha: 0.18 });
      label.position.set(x, view.root.y + TOP_Y[view.v.shape] - 26 * inv);
      label.scale.set(inv * 0.85);
    };
    draw(kv, 0xff5a4a, this.labels[0]);
    draw(vv, 0xffffff, this.labels[1]);

    // An arrow from attacker to victim.
    const ax = kv.root.x;
    const ay = kv.root.y - R;
    const bx = vv.root.x;
    const by = vv.root.y - R;
    const d = Math.hypot(bx - ax, by - ay);
    if (d > R * 3) {
      const ux = (bx - ax) / d;
      const uy = (by - ay) / d;
      const sx = ax + ux * R * 1.6;
      const sy = ay + uy * R * 1.6;
      const ex = bx - ux * R * 1.6;
      const ey = by - uy * R * 1.6;
      g.moveTo(sx, sy).lineTo(ex, ey).stroke({ width: 3, color: 0xff5a4a, alpha: 0.9, cap: 'round' });
      g.poly([ex, ey, ex - ux * 11 - uy * 6, ey - uy * 11 + ux * 6, ex - ux * 11 + uy * 6, ey - uy * 11 - ux * 6]).fill(0xff5a4a);
    }
  }
}
