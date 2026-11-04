import { Graphics } from 'pixi.js';
import { FACTIONS } from '../../config/content.js';
import { VILLAGER } from '../../config/tunables.js';
import { groupOf } from '../../sim/villager.js';
import { css, el } from './dom.js';
import { villagerInfo } from './villagerInfo.js';
import { heart, lookOfGroup } from '../villagerView.js';

const LOVE_LINE = 45; // opinion at or above this (for another group) draws a green line
const HATE_LINE = -40;

/**
 * Hovering a villager shows an info card (who, health, what they are doing and why, how they
 * feel) and draws soft lines to the individuals they love or hate. This is what lets a player
 * who never read the rules understand who is angry at whom.
 */
export function createHover(uiRoot, linesLayer, stage, game) {
  const card = el('div', 'panel hovercard');
  card.hidden = true;
  uiRoot.append(card);
  const lines = new Graphics();
  linesLayer.addChild(lines);

  let hovered = null;
  let cardKey = '';

  function buildCard(v) {
    const info = villagerInfo(game, v);
    const key = JSON.stringify(info);
    if (key === cardKey) return;
    cardKey = key;
    card.replaceChildren(el('b', 'hc-head', info.title), ...info.lines.map(line => el('div', 'hc-line', line)));
  }

  function drawLines(view) {
    lines.clear();
    const h = view.v;
    const hx = view.root.x;
    const hy = view.root.y - VILLAGER.radius;
    const own = groupOf(h);
    for (const o of game.world.villagers) {
      if (o === h || !o.alive) continue;
      const g = groupOf(o);
      const opinion = h.opinion[g];
      let color = null;
      let alpha = 0.55;
      if (o.id === h.partnerId) {
        // The bond is only drawn while you are looking at one of the pair.
        const tx = o.x;
        const ty = o.y - VILLAGER.radius;
        lines.moveTo(hx, hy).lineTo(tx, ty).stroke({ width: 3.5, color: 0xff5c8a, alpha: 0.9, cap: 'round' });
        heart(lines, (hx + tx) / 2, (hy + ty) / 2 - 3, 6, 0xff5c8a);
        continue;
      }
      if (o.id === h.friendId) color = 0xff7aa8; // a personal friend
      else if (g !== own && opinion <= HATE_LINE) color = 0xe5533d;
      else if (g !== own && opinion >= LOVE_LINE) { color = 0x4fb86a; alpha = 0.5; }
      if (color === null) continue;
      const tx = o.x;
      const ty = o.y - VILLAGER.radius;
      lines.moveTo(hx, hy).lineTo(tx, ty).stroke({ width: 2.5, color, alpha, cap: 'round' });
      lines.circle(tx, ty, 4).fill({ color, alpha });
    }
    lines.circle(hx, hy, 18).stroke({ width: 2.5, color: 0xffffff, alpha: 0.8 });
  }

  return {
    onHover(view) { hovered = view; cardKey = ''; },
    onOut(view) { if (hovered === view) hovered = null; },

    update() {
      if (!hovered || !hovered.v.alive) {
        hovered = null;
        card.hidden = true;
        lines.clear();
        return;
      }
      buildCard(hovered.v);
      drawLines(hovered);
      const p = stage.toGlobal({ x: hovered.root.x, y: hovered.headY() });
      card.hidden = false;
      const w = card.offsetWidth;
      const h = card.offsetHeight;
      const x = Math.min(window.innerWidth - w / 2 - 8, Math.max(w / 2 + 8, p.x));
      const y = Math.max(h + 8, p.y - 34);
      card.style.left = `${x}px`;
      card.style.top = `${y}px`;
    },
  };
}
