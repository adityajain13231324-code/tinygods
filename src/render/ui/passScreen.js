import { FACTIONS } from '../../config/content.js';
import { css, el } from './dom.js';

const MARKS = { triangle: '▲', wave: '≈', leaf: '❀', star: '★' };

/**
 * Pass-and-play: a full-screen card that hides the town between players, so nobody sees the
 * previous player's orders (or guesses) over their shoulder.
 */
export function createPassScreen(root) {
  const overlay = el('div', 'pass');
  overlay.hidden = true;
  const card = el('div', 'pass-card');
  overlay.append(card);
  root.append(overlay);

  return {
    /** @param {{name: string, seat: number, kind: 'command'|'guess', onReady: () => void}} o */
    show({ name, seat, kind, onReady }) {
      const f = FACTIONS[seat];
      card.replaceChildren();
      card.append(el('div', 'pass-small', 'Pass the device to'));
      const who = el('div', 'pass-name', name);
      who.style.color = css(f.color);
      card.append(who);
      card.append(el('div', 'pass-faction', `${MARKS[f.mark]} leader of the ${f.name}`));
      card.append(el('p', 'pass-hint', kind === 'command'
        ? 'Everyone else: look away! Your secret orders come next.'
        : 'Everyone else: look away! Time to guess who caused the news.'));
      const go = el('button', 'go', `I'm ${name}. Ready`);
      go.onclick = onReady;
      card.append(go);
      overlay.hidden = false;
    },
    hide() {
      overlay.hidden = true;
    },
    get visible() {
      return !overlay.hidden;
    },
  };
}
