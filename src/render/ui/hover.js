import { Graphics } from 'pixi.js';
import { ACTIVITY_TEXT, FACTIONS, GROUP_NAMES } from '../../config/content.js';
import { VILLAGER } from '../../config/tunables.js';
import { groupOf } from '../../sim/villager.js';
import { css, el } from './dom.js';
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

  const name = (v) => `${v.name} (${v.faction >= 0 ? FACTIONS[v.faction].name : 'neutral'})`;

  function doing(v) {
    const other = v.targetId !== null ? game.world.villagers[v.targetId] : null;
    switch (v.state) {
      case 'attack': return `Fighting ${name(other)}`;
      case 'flee': return 'Running for their life';
      case 'mourn': return `Mourning ${other ? other.name : 'a friend'}`;
      case 'guard': return 'Guarding';
      case 'seek': return `Heading over to chat with ${other.name}`;
      case 'talk':
        if (v.expression === 'love') return `Hugging ${other.name}`;
        if (v.expression === 'angry') return `Arguing with ${other.name}`;
        return `Chatting with ${other.name}`;
      case 'wander': return v.purpose === 'arm' ? 'Going to the Armory' : v.purpose === 'follow' ? 'Heading to their post' : 'Strolling about';
      default: return (v.activity && ACTIVITY_TEXT[v.activity]) || 'Relaxing';
    }
  }

  function feelings(v) {
    const own = groupOf(v);
    const rows = [];
    for (let g = 0; g < v.opinion.length; g++) {
      if (g !== own) rows.push([g, v.opinion[g]]);
    }
    rows.sort((a, b) => a[1] - b[1]);
    const out = [];
    const worst = rows[0];
    const best = rows[rows.length - 1];
    if (worst[1] < -15) out.push(`Hates ${GROUP_NAMES[worst[0]]} (${Math.round(worst[1])})`);
    if (best[1] > 15) out.push(`Likes ${GROUP_NAMES[best[0]]} (+${Math.round(best[1])})`);
    let afraid = -1;
    for (let g = 0; g < v.fear.length; g++) if (v.fear[g] > 20 && (afraid < 0 || v.fear[g] > v.fear[afraid])) afraid = g;
    if (afraid >= 0) out.push(`Afraid of ${GROUP_NAMES[afraid]} (${Math.round(v.fear[afraid])})`);
    return out.length ? out : ['No strong feelings'];
  }

  // Temperament is secret until the villager shows it (or carries a shotgun for all to see).
  const TRAITS_TEXT = {
    brawler: 'Hothead: picks fights fast, hard to scare off',
    coward: 'Coward: runs at the first shove',
    gunslinger: 'Gunslinger: a shotgun and nerves of steel',
    peacemaker: 'Peacemaker: breaks up fights',
    medic: 'Medic: heals the hurt, never starts a fight',
    bodyguard: 'Bodyguard: defends their friend, not rattled by guns',
    wildcard: 'Wildcard: unpredictable temper',
  };

  function temperament(v) {
    if (v.trait && (v.revealed || v.trait === 'gunslinger')) return TRAITS_TEXT[v.trait];
    return v.revealed ? 'Temperament: ordinary' : 'Temperament: not seen yet';
  }

  const moodText = (v) => (v.mood < -0.5 ? 'Having a bad day' : v.mood > 0.5 ? 'In a good mood' : '');

  function buildCard(v) {
    const weapon = v.weapon === 'none' ? 'bare fists'
      : v.weapon === 'gun' ? `pistol (${v.ammo} bullets)`
        : v.weapon === 'shotgun' ? `shotgun (${v.ammo} shells)` : v.weapon;
    const key = [v.name, v.partnerId, v.activity, Math.ceil(v.hp), v.state, v.targetId, v.expression, v.weapon, v.ammo, v.revealed, v.mood > 0.5, v.mood < -0.5, v.opinion.map(Math.round).join(), v.fear.map(Math.round).join()].join('|');
    if (key === cardKey) return;
    cardKey = key;
    card.replaceChildren();
    const head = el('div', 'hc-head');
    const dot = el('i');
    dot.style.background = css(lookOfGroup(groupOf(v)).color);
    head.append(dot, el('b', '', v.name), el('span', '', ` · ${v.faction >= 0 ? FACTIONS[v.faction].name : 'Neutral'}`));
    card.append(head);
    card.append(el('div', 'hc-line', `HP ${Math.ceil(v.hp)}/100 · ${weapon}`));
    card.append(el('div', 'hc-line hc-doing', doing(v)));
    card.append(el('div', 'hc-line hc-trait', temperament(v)));
    if (moodText(v)) card.append(el('div', 'hc-line', moodText(v)));
    if (v.partnerId >= 0) {
      const p = game.world.villagers[v.partnerId];
      card.append(el('div', 'hc-line hc-partner', `Bonded with ${p.name} (${p.faction >= 0 ? FACTIONS[p.faction].name : 'neutral'})`));
    }
    for (const f of feelings(v)) card.append(el('div', 'hc-line hc-feel', f));
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
