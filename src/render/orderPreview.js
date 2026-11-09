import { Graphics } from 'pixi.js';
import { previewOrder } from '../sim/orderPreview.js';

export class OrderPreview {
  constructor(layer, root, game, ctx) {
    this.game = game;
    this.ctx = ctx;
    this.graphics = layer.addChild(new Graphics());
    this.graphics.eventMode = 'none';
    this.hint = document.createElement('div');
    this.hint.className = 'target-preview-hint';
    this.hint.setAttribute('role', 'status');
    this.hint.hidden = true;
    root.append(this.hint);
  }
  show(orders, plan = orders) {
    this.clear();
    const { game, ctx } = this;
    if (game.phase !== 'command' || !ctx.passReady || game.pending[ctx.seat] !== null) return;
    const previews = orders.map(o => previewOrder(game.world, ctx.seat, o, plan)).filter(Boolean);
    if (!previews.length) return;
    this.key = `${game.turn}:${ctx.seat}`;
    const actors = new Set(previews.flatMap(p => p.actors));
    const targets = new Set(previews.flatMap(p => p.targets));
    const g = this.graphics;
    for (const ids of [actors, targets]) for (const id of ids) {
      const v = game.world.villagers[id];
      const actor = ids === actors;
      g.ellipse(v.x, v.y + (actor ? 1 : 5), actor ? 23 : 28, actor ? 10 : 13).stroke({ width: actor ? 3 : 2, color: actor ? 0xffd36b : 0x9fe7ff, alpha: 0.95 });
    }
    for (const p of previews) if (p.place) g.circle(p.place.x, p.place.y, p.place.radius).stroke({ width: 3, color: 0x9fe7ff, alpha: 0.85 });
    for (const p of previews) if (p.fallback) g.circle(p.fallback.x, p.fallback.y, p.fallback.radius).stroke({ width: 3, color: 0xffb36b, alpha: 0.9 }); // where a conditional order retreats to
    this.hint.textContent = previews.map(p => p.label).join(' · ') + ' · Gold: yours · Blue: target' + (previews.some((p) => p.fallback) ? ' · Orange: fallback' : '');
    this.hint.hidden = false;
  }
  clear() { this.graphics.clear(); this.hint.hidden = true; this.key = null; }
  update() {
    if (this.key && (this.game.phase !== 'command' || !this.ctx.passReady || this.game.pending[this.ctx.seat] !== null || this.key !== `${this.game.turn}:${this.ctx.seat}`)) this.clear();
  }
}
