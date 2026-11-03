import { FACTIONS } from '../../config/content.js';
import { clock, css, el } from './dom.js';

/**
 * The guess phase: for each highlight, which player's secret order caused it?
 * Docked to the side so the player can replay a clip and look at the town while deciding.
 * After everyone has guessed, the truth is revealed for each highlight.
 */
export function createGuessPanel(root, ctx) {
  const dock = el('div', 'panel dock');
  dock.hidden = true;
  root.append(dock);

  let shownKey = '';
  let choice = {}; // highlightId -> seat (-1 = nobody)
  let timerEl = null;

  const seatLabel = (s) => (s === -1 ? 'Nobody (the town snapped)' : `${FACTIONS[s].name}${s === ctx.seat ? ' (you)' : ''}`);

  function buildAsking(game) {
    dock.replaceChildren();
    const head = el('div', 'dock-head');
    head.append(el('h2', '', 'Who caused it?'));
    timerEl = el('span', 'sub');
    head.append(timerEl);
    dock.append(head, el('div', 'sub', 'Whose secret order set each moment off? Right answers earn +1 influence next turn.'));

    for (const h of game.highlights) {
      const card = el('div', 'hcard');
      const top = el('div', 'hl');
      const play = el('button', 'opt', '▶ Replay');
      play.onclick = () => ctx.replay(h);
      top.append(play, el('b', '', h.title));
      card.append(top);

      const row = el('div', 'row');
      for (const s of [0, 1, 2, 3, -1]) {
        const b = el('button', `opt${choice[h.id] === s ? ' on' : ''}`);
        if (s >= 0) {
          const dot = el('i');
          dot.style.background = css(FACTIONS[s].color);
          b.append(dot);
        }
        b.append(s === -1 ? 'Nobody' : seatLabel(s));
        b.onclick = () => {
          choice[h.id] = s;
          buildAsking(game);
        };
        row.append(b);
      }
      card.append(row);
      dock.append(card);
    }

    const btns = el('div', 'btns');
    const answered = Object.keys(choice).length;
    const lock = el('button', 'go', answered ? `Lock in ${answered} guess${answered > 1 ? 'es' : ''}` : 'Skip guessing');
    lock.onclick = () => ctx.guess(choice);
    btns.append(lock);
    dock.append(btns);
  }

  function buildReveal(game) {
    dock.replaceChildren();
    const head = el('div', 'dock-head');
    head.append(el('h2', '', 'The truth'));
    timerEl = el('span', 'sub');
    head.append(timerEl);
    dock.append(head);

    let right = 0;
    for (const r of game.guessResults) {
      const h = r.highlight;
      const mine = r.byseat[ctx.seat];
      const card = el('div', 'hcard');
      const top = el('div', 'hl');
      const play = el('button', 'opt', '▶ Replay');
      play.onclick = () => ctx.replay(h);
      top.append(play, el('b', '', h.title));
      card.append(top);

      let v;
      if (ctx.hotseat) {
        // Pass-and-play: show how every human did.
        const lines = ctx.humanSeats.map((s) => `${game.seats[s].name}: ${r.byseat[s] === undefined ? 'no guess' : r.correct[s] ? 'right' : `said ${seatLabel(r.byseat[s])}`}`);
        v = el('div', 'sub', lines.join('  ·  '));
        right += ctx.humanSeats.filter((s) => r.correct[s]).length;
      } else {
        const verdict = mine === undefined ? 'No guess' : r.correct[ctx.seat] ? 'You got it!' : `You said ${seatLabel(mine)}`;
        if (r.correct[ctx.seat]) right++;
        v = el('div', mine !== undefined && r.correct[ctx.seat] ? 'good' : 'sub', verdict);
      }
      card.append(v);
      const truth = el('div', 'truth');
      truth.append(el('b', '', `It was: ${seatLabel(h.truthSeat)}.`), document.createTextNode(` ${h.reason}.`));
      card.append(truth);

      // How the bots did (they guess from the public kill feed only).
      const others = Object.entries(r.byseat).filter(([s]) => Number(s) !== ctx.seat);
      const rightOnes = others.filter(([s]) => r.correct[s]).map(([s]) => FACTIONS[s].name);
      if (others.length) card.append(el('div', 'sub', rightOnes.length ? `Also right: ${rightOnes.join(', ')}.` : 'Nobody else got it.'));
      dock.append(card);
    }
    dock.append(el('p', '', right ? `+${right} influence next turn${ctx.hotseat ? ' (in total)' : ''}.` : 'No bonus influence this time.'));

    const btns = el('div', 'btns');
    const next = el('button', 'go', 'Next turn');
    next.onclick = () => ctx.nextTurn();
    timerEl = el('span', 'sub');
    btns.append(next, timerEl);
    dock.append(btns);
  }

  return {
    /** The guesses picked so far (auto-submitted if the timer runs out). */
    currentChoice: () => ({ ...choice }),
    update(game) {
      const open = game.phase === 'guess' && (game.guessRevealed || ctx.passReady);
      dock.hidden = !open;
      if (!open) {
        shownKey = '';
        return;
      }
      const humanDone = game.guesses[ctx.seat] !== null;
      const key = `${game.turn}:${game.guessRevealed}:${humanDone}:${ctx.seat}`;
      if (key !== shownKey) {
        if (!shownKey.startsWith(`${game.turn}:`) || shownKey.split(':')[3] !== String(ctx.seat)) choice = {};
        shownKey = key;
        if (game.guessRevealed) buildReveal(game);
        else if (humanDone) {
          dock.replaceChildren(el('h2', '', 'Waiting for the others...'));
        } else buildAsking(game);
      }
      if (timerEl) timerEl.textContent = clock(game.timer);
    },
  };
}
