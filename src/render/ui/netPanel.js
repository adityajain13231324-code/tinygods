import { FACTIONS } from '../../config/content.js';
import { css, el, setText } from './dom.js';

/**
 * Online only: a small list of the people in this match and whether they have handed in their
 * orders (at dawn) or read the news (between turns). Never shows what the orders are.
 */
export function createNetPanel(root, ctx, game, getNet) {
  const panel = el('div', 'panel netpanel');
  root.append(panel);
  const rows = game.seats.map((s, i) => {
    const row = el('div', 'netrow');
    const dot = el('i');
    dot.style.background = css(FACTIONS[i].color);
    const name = el('span', 'netname');
    const state = el('span', 'netstate');
    row.append(dot, name, state);
    panel.append(row);
    return { row, name, state };
  });
  const warn = el('div', 'netwarn');
  warn.hidden = true;
  panel.append(warn);
  const humans = game.seats.filter((s) => s.kind === 'human').length;
  if (humans < 2) panel.hidden = true; // everybody else left before it began

  return {
    update() {
      const net = getNet();
      if (!net) return;
      const info = net.info;
      game.seats.forEach((s, i) => {
        const r = rows[i];
        r.row.hidden = s.kind !== 'human' && !/\(bot\)$/.test(s.name);
        const me = i === ctx.seat;
        setText(r.name, `${s.name}${me ? ' (you)' : ''}`);
        let text = '';
        if (s.kind !== 'human') text = 'bot';
        else if (game.eliminated[i]) text = '☠';
        else if (game.phase === 'command') text = (me ? game.pending[i] !== null : info.turn === game.turn && info.submitted.includes(i)) ? '✔ ready' : '… deciding';
        else if (game.phase === 'recap') text = info.turn === game.turn && info.ready.includes(i) ? '✔ read it' : '';
        setText(r.state, text);
        r.state.classList.toggle('done', text.startsWith('✔'));
      });
      warn.hidden = !net.desync;
      if (net.desync) setText(warn, '⚠ out of sync');
    },
  };
}
