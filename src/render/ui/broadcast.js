import { el } from './dom.js';

/**
 * The "news broadcast" board that pops up for big moments (first blood, a faction falling, a
 * brawl). It says WHAT happened (text) and HOW IT GOT THERE (detail). Big boards win over
 * small ones.
 */
export function createBoard(root) {
  const board = el('div', 'board');
  board.hidden = true;
  const tag = el('div', 'tag');
  const live = el('span', 'live', '● LIVE');
  const kicker = el('span', 'kicker');
  tag.append(live, kicker);
  const title = el('div', 'title');
  const text = el('div', 'text');
  const detail = el('div', 'detail');
  board.append(tag, title, text, detail);
  root.append(board);

  let timer = null;
  let currentBig = false;

  return {
    /** @param {{kicker?: string, title: string, text?: string, detail?: string, big?: boolean, seconds?: number, at?: 'top'|'bottom'}} o */
    show({ kicker: k = 'BREAKING NEWS', title: t, text: body = '', detail: more = '', big = false, seconds = 4, at = 'top' }) {
      if (!board.hidden && currentBig && !big) return; // don't bury a big board under a small one
      currentBig = big;
      kicker.textContent = k;
      title.textContent = t;
      text.textContent = body;
      detail.textContent = more;
      detail.hidden = !more;
      board.classList.toggle('big', big);
      board.classList.toggle('bottom', at === 'bottom'); // opposite side from the action
      board.hidden = false;
      // Restart the pop-in animation.
      board.style.animation = 'none';
      void board.offsetWidth;
      board.style.animation = '';
      clearTimeout(timer);
      timer = setTimeout(() => {
        board.hidden = true;
        currentBig = false;
      }, seconds * 1000);
    },
  };
}
