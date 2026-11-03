import { FACTIONS } from '../../config/content.js';
import { describeOrder } from '../../sim/orders.js';
import { describeCard } from '../../sim/cards.js';
import { buildStats, buildStory, shareText } from '../../sim/story.js';
import { ACHIEVEMENTS, recordMatch } from '../../stats.js';
import { clock, css, el } from './dom.js';

/**
 * Between turns: the news recap (docked to the side so the town stays visible for replays),
 * the "you were eliminated" banner, and the end-of-match screen with The Truth, the Town
 * Story, stats and a share button.
 */
let recorded = null;
const recordOnce = (game, ctxHumans) => (recorded ??= recordMatch(game, ctxHumans ?? [0]));

export function createRecap(root, ctx) {
  const dock = el('div', 'panel dock');
  dock.hidden = true;
  const overlay = el('div', 'overlay');
  overlay.hidden = true;
  const banner = el('div', 'panel banner');
  banner.hidden = true;
  const bannerText = el('span');
  const skipBtn = el('button', 'go ghost', 'Skip to the end');
  skipBtn.style.marginLeft = '12px';
  skipBtn.onclick = () => ctx.skipToEnd();
  banner.append(bannerText, skipBtn);
  root.append(dock, overlay, banner);

  let shownKey = '';
  let dismissed = false; // the player closed the results screen to look at the town
  const reopen = el('button', 'go reopen', '📜 Show results');
  reopen.hidden = true;
  reopen.onclick = () => { dismissed = false; };
  root.append(reopen);
  window.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !overlay.hidden) dismissed = true; });
  let countdown = null;

  function standings(living) {
    const box = el('div', 'standings');
    living.forEach((n, f) => {
      const chip = el('span', `chip${n === 0 ? ' out' : ''}`);
      const dot = el('i');
      dot.style.background = css(FACTIONS[f].color);
      chip.append(dot, `${FACTIONS[f].name} ${n}`);
      box.append(chip);
    });
    return box;
  }

  function buildRecap(game) {
    const r = game.recap;
    dock.replaceChildren();
    dock.append(el('h2', '', `Turn ${r.turn}: the news`));
    const ul = el('ul');
    for (const h of r.headlines) ul.append(el('li', '', h));
    dock.append(ul, standings(r.living));

    // Private feedback: what your own orders, cards and miracles actually did.
    const notes = (game.feedback?.[ctx.seat] ?? []).filter(Boolean);
    if (notes.length && !game.eliminated[ctx.seat]) {
      const box = el('div', 'feedback');
      box.append(el('b', '', 'What your moves did'));
      for (const n of notes) box.append(el('div', '', n));
      dock.append(box);
    }

    if (game.highlights.length) {
      dock.append(el('h3', '', 'Highlights'));
      for (const h of game.highlights) {
        const row = el('div', 'hl');
        const play = el('button', 'opt', '▶ Replay');
        play.onclick = () => ctx.replay(h);
        row.append(play, el('span', '', h.title));
        dock.append(row);
      }
    }

    const btns = el('div', 'btns');
    const label = game.over ? 'See the result' : 'Next turn';
    const next = el('button', 'go', label);
    next.onclick = () => {
      ctx.nextTurn();
      if (ctx.online && !game.over) { next.textContent = 'Waiting for the others…'; next.disabled = true; }
    };
    countdown = el('span', 'sub');
    btns.append(next, countdown);
    dock.append(btns);
  }

  function buildEnd(game) {
    const card = el('div', 'panel card wide');
    const close = el('button', 'closex', '✕');
    close.title = 'Close this and look at the town (Esc)';
    close.onclick = () => { dismissed = true; };
    card.append(close);
    const winner = FACTIONS[game.winner];
    const winnerSeat = game.seats[game.winner];
    const youWon = ctx.online ? game.winner === ctx.seat : !ctx.hotseat;
    const title = el('h2', '', winnerSeat.kind === 'human'
      ? (youWon ? `You win! The ${winner.name} rule the town.` : `${winnerSeat.name} wins the town! (the ${winner.name})`)
      : `The ${winner.name} win.`);
    title.style.color = css(winner.color);
    card.append(title, el('div', 'sub', `${game.winReason}, after ${game.turn} turns.`));
    card.append(standings(game.recap.living));

    // Town Story: five lines, auto-written from what happened.
    card.append(el('h3', '', 'The town story'));
    const story = el('ol', 'story');
    for (const line of buildStory(game)) story.append(el('li', '', line));
    card.append(story);

    // Stats
    const stats = buildStats(game);
    card.append(el('h3', '', 'By the numbers'));
    const table = el('table');
    const head = el('tr');
    ['', ...FACTIONS.map((f) => f.name)].forEach((h) => head.append(el('th', '', h)));
    table.append(head);
    const row = (label, values) => {
      const tr = el('tr');
      tr.append(el('td', '', label), ...values.map((v) => el('td', '', String(v))));
      table.append(tr);
    };
    row('Villagers they killed', stats.kills);
    row('Villagers left', game.recap.living);
    row('Hate ordered (strength)', stats.trouble);
    card.append(table);
    if (stats.neutralKills) card.append(el('div', 'sub', `Neutral villagers killed ${stats.neutralKills}.`));

    // The Truth: every secret order, turn by turn.
    const details = el('details');
    details.open = true;
    details.append(el('summary', '', 'The truth: who ordered what'));
    const truth = el('table');
    const th = el('tr');
    ['Turn', 'Faction', 'Orders'].forEach((h) => th.append(el('th', '', h)));
    truth.append(th);
    for (const t of game.truth) {
      if (t.orders.length === 0 && !t.card && !(t.extras ?? []).length) continue;
      const tr = el('tr');
      tr.append(el('td', '', String(t.turn)), el('td', '', game.seats[t.seat].kind === 'bot' ? `${FACTIONS[t.seat].name} (${game.seats[t.seat].name}, ${game.seats[t.seat].personality})` : `${FACTIONS[t.seat].name} (${game.seats[t.seat].name})`), el('td', '', [...t.orders.map(describeOrder), ...(t.card ? ['card: ' + describeCard(t.card)] : []), ...(t.extras ?? []).map((x) => x.id)].join(', ')));
      truth.append(tr);
    }
    details.append(truth);
    card.append(details);

    // Progress and achievements (kept in this browser).
    const { stats: prog, earned } = recordOnce(game, ctx.humanSeats);
    card.append(el('p', 'sub', `Matches played: ${prog.matches}  ·  Wins: ${prog.wins}`));
    for (const id of earned) card.append(el('div', 'coach', `Achievement unlocked: ${ACHIEVEMENTS[id].name}. ${ACHIEVEMENTS[id].text}`));

    const btns = el('div', 'btns');
    const again = el('button', 'go', ctx.online ? 'Back to the menu' : 'Rematch');
    again.onclick = () => ctx.restart();
    const share = el('button', 'go ghost', 'Copy share text');
    share.onclick = async () => {
      const text = shareText(game, ctx.seat, location.origin + location.pathname);
      try {
        await navigator.clipboard.writeText(text);
        share.textContent = 'Copied!';
      } catch {
        window.prompt('Copy this:', text); // clipboard can be blocked; fall back to a prompt
      }
    };
    const menu = el('button', 'go ghost', 'Main menu');
    menu.hidden = !!ctx.online;
    menu.onclick = () => { location.href = location.pathname; };
    const view = el('button', 'go ghost', '👁 View the town');
    view.onclick = () => { dismissed = true; };
    btns.append(again, view, share, menu);
    card.append(btns);
    overlay.replaceChildren(card);
  }

  return {
    update(game) {
      const fallen = ctx.humanSeats.filter((s) => game.eliminated[s]);
      const everyone = fallen.length === ctx.humanSeats.length;
      banner.hidden = fallen.length === 0 || game.phase === 'ended';
      if (!banner.hidden) {
        bannerText.textContent = everyone
          ? (ctx.hotseat ? 'Every player faction has fallen. Watch the rest unfold.' : 'Your faction has fallen. Watch the rest unfold.')
          : `${fallen.map((s) => game.seats[s].name).join(', ')} fell, but can still haunt the town.`;
        skipBtn.hidden = !everyone || !!ctx.online; // online, the match goes on without you being able to skip it
      }

      const key = `${game.phase}:${game.turn}`;
      if (key !== shownKey) {
        shownKey = key;
        if (game.phase === 'recap') buildRecap(game);
        else if (game.phase === 'ended') buildEnd(game);
      }
      dock.hidden = game.phase !== 'recap';
      if (game.phase !== 'ended') dismissed = false;
      overlay.hidden = game.phase !== 'ended' || dismissed;
      reopen.hidden = !(game.phase === 'ended' && dismissed);
      if (game.phase === 'recap' && countdown) countdown.textContent = `continues in ${clock(game.timer)}`;
    },
  };
}
