import '../ui/ui.css';
import { FACTIONS } from '../../config/content.js';
import { css, el } from './dom.js';
import { ACHIEVEMENTS, loadStats } from '../../stats.js';

const SETTINGS = [
  ['tinygods.muted', 'Sound', (v) => v !== '1'],
  ['tinygods.blood', 'Cartoon blood', (v) => v !== '0'],
  ['tinygods.cutscenes', 'Cutscenes (news, day cards)', (v) => v !== '0'],
];

const read = (key) => {
  try { return localStorage.getItem(key); } catch { return null; }
};
const write = (key, value) => {
  try { localStorage.setItem(key, value); } catch { /* storage can be blocked */ }
};

/** Today's date as a number, so everyone who clicks "Daily town" today gets the same town. */
const dailySeed = () => {
  const d = new Date();
  return d.getFullYear() * 10000 + (d.getMonth() + 1) * 100 + d.getDate();
};

function launch(options) {
  const p = new URLSearchParams({ start: '1', ...options });
  location.search = p.toString();
}

const HOW_TO_PLAY = [
  ['The goal', 'You secretly lead one faction of 12 villagers in a town of 60. The other factions belong to other players or bots. The last faction with a living villager wins the town.'],
  ['Each turn: give secret orders', 'Pick up to 3 orders by typing plain sentences ("send three villagers to the armory", "hunt Mia", "assault the Tides", "everyone stand down"). Bigger orders cost more influence. Nobody sees your orders.'],
  ['Then the town acts by itself', 'Your villagers (and neutrals who trust you) follow orders in their own way: each has a temperament, a temper and a daily mood. People argue, scuffle, then fight. Hover anyone to see why.'],
  ['Rumors and love', 'Accuse starts a rumor about another faction that spreads by gossip. Love pairs your villagers with another faction; partners fight side by side. A Festival cools tempers. Villagers who lose faith can turn on you, or leave.'],
  ['Cards and miracles', 'Each dawn you are dealt cards: play one for a trick (forge a letter, bribe the neutrals, spy, raid an armory). While the town acts you have Power for live miracles: lightning, healing, fog. At the end, "The Truth" shows every order.'],
  ['Good to know', 'Using the same order two turns running makes it weaker. Killing makes your faction notorious: the whole town trusts you less. Villagers wearing a ring are yours. Click Skip on any cutscene.'],
];

export function showMenu() {
  const root = el('div', 'menu');
  document.body.append(root);

  // Floating faction shapes for atmosphere.
  const bg = el('div', 'menu-bg');
  for (let i = 0; i < 22; i++) {
    const f = FACTIONS[i % 4];
    const s = el('span', `menu-shape s${i % 3}`);
    s.style.background = css(f.color);
    s.style.borderColor = css(f.dark);
    s.style.left = `${(i * 47) % 100}%`;
    s.style.animationDelay = `${-(i * 1.7) % 14}s`;
    s.style.animationDuration = `${14 + (i % 5) * 3}s`;
    s.style.setProperty('--size', `${22 + (i % 4) * 10}px`);
    bg.append(s);
  }

  const card = el('div', 'panel menu-card');
  card.append(el('h1', '', 'TINY GODS'), el('p', 'menu-tag', 'Secretly nudge a peaceful town into war, then argue about whose fault it was.'));

  const buttons = el('div', 'menu-buttons');
  const mk = (label, sub, onClick, cls = '') => {
    const b = el('button', `menu-btn ${cls}`);
    b.append(el('b', '', label), el('span', '', sub));
    b.onclick = onClick;
    buttons.append(b);
    return b;
  };

  mk('Play vs bots', 'You lead the Embers. Three bots lead the rest. About 15 minutes.', () => launch({ players: '1', seed: String(Math.floor(Math.random() * 1e6) + 1) }));
  mk('Pass and play', '2 to 4 friends on one device. Orders are hidden by a "pass the device" screen.', () => showPassSetup());
  mk('Daily town', 'Everyone gets the same town today. Compare how you did.', () => launch({ players: '1', seed: String(dailySeed()) }));
  mk('How to play', 'Goal, orders, rumors, the guessing game.', () => showHow());
  const online = mk('Play online', 'Coming soon: rooms with a code, each friend on their own device.', () => {}, 'disabled');
  online.disabled = true;

  card.append(buttons);

  const settings = el('div', 'menu-settings');
  for (const [key, label, isOn] of SETTINGS) {
    const row = el('label', 'menu-check');
    const box = el('input');
    box.type = 'checkbox';
    box.checked = isOn(read(key));
    box.onchange = () => {
      // 'muted' is stored inverted ('1' = muted); the others store '0' = off.
      if (key === 'tinygods.muted') write(key, box.checked ? '0' : '1');
      else write(key, box.checked ? '1' : '0');
    };
    row.append(box, document.createTextNode(` ${label}`));
    settings.append(row);
  }
  const prog = loadStats();
  if (prog.matches > 0) {
    const badges = Object.keys(prog.achievements).map((id) => ACHIEVEMENTS[id]?.name).filter(Boolean);
    card.append(el('p', 'menu-foot', `Your record: ${prog.wins} wins in ${prog.matches} matches${badges.length ? `  ·  ${badges.join(', ')}` : ''}`));
  }
  card.append(settings, el('p', 'menu-foot', 'Made by a first-year student, one browser tab at a time. Best on a laptop.'));
  root.append(bg, card);

  // ---- pass and play setup ----
  function showPassSetup() {
    const dlg = modal();
    dlg.card.append(el('h2', '', 'Pass and play'));
    dlg.card.append(el('p', 'sub', 'Each player takes turns at the same screen. Everyone else looks away while orders are given.'));
    let count = 2;
    const names = ['Player 1', 'Player 2', 'Player 3', 'Player 4'];
    const stored = (read('tinygods.names') ?? '').split('|');
    stored.forEach((n, i) => { if (n) names[i] = n; });

    const countRow = el('div', 'row');
    countRow.append(el('span', 'label', 'Players'));
    const fields = el('div', 'menu-names');
    const redraw = () => {
      countRow.querySelectorAll('.opt').forEach((b) => b.classList.toggle('on', Number(b.dataset.n) === count));
      fields.replaceChildren();
      for (let i = 0; i < count; i++) {
        const f = FACTIONS[i];
        const row = el('div', 'menu-name');
        const dot = el('i');
        dot.style.background = css(f.color);
        const input = el('input');
        input.value = names[i];
        input.maxLength = 14;
        input.oninput = () => { names[i] = input.value; };
        row.append(dot, el('span', '', f.name), input);
        fields.append(row);
      }
    };
    for (const n of [2, 3, 4]) {
      const b = el('button', 'opt', `${n}`);
      b.dataset.n = String(n);
      b.onclick = () => { count = n; redraw(); };
      countRow.append(b);
    }
    dlg.card.append(countRow, fields);
    dlg.card.append(el('p', 'sub', count < 4 ? 'Empty seats are filled by bots.' : ''));
    const go = el('button', 'go', 'Start');
    go.onclick = () => {
      const clean = names.slice(0, count).map((n, i) => (n.trim() || `Player ${i + 1}`).replace(/[|,]/g, ''));
      write('tinygods.names', names.join('|'));
      launch({ players: String(count), names: clean.join(','), seed: String(Math.floor(Math.random() * 1e6) + 1) });
    };
    dlg.card.append(go);
    redraw();
  }

  function showHow() {
    const dlg = modal();
    dlg.card.classList.add('wide');
    dlg.card.append(el('h2', '', 'How to play'));
    HOW_TO_PLAY.forEach(([title, body], i) => {
      const sec = el('div', 'how');
      sec.append(el('span', 'how-n', String(i + 1)), el('div', '', ''));
      sec.lastChild.append(el('b', '', title), el('p', '', body));
      dlg.card.append(sec);
    });
  }

  function modal() {
    const overlay = el('div', 'overlay');
    overlay.style.pointerEvents = 'auto';
    const card = el('div', 'panel card');
    const close = el('button', 'go ghost', 'Back');
    close.onclick = () => overlay.remove();
    overlay.append(card);
    card.append(close);
    close.style.float = 'right';
    document.body.append(overlay);
    overlay.onclick = (e) => { if (e.target === overlay) overlay.remove(); };
    return { card, overlay };
  }
}

export { HOW_TO_PLAY };
