import '../ui/ui.css';
import { FACTIONS } from '../../config/content.js';
import { DIFFICULTY } from '../../config/tunables.js';
import { css, el } from './dom.js';
import { ACHIEVEMENTS, loadStats } from '../../stats.js';

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

export const getDifficulty = () => (DIFFICULTY[read('tinygods.difficulty')] ? read('tinygods.difficulty') : 'normal');

function launch(options) {
  const p = new URLSearchParams({ start: '1', difficulty: getDifficulty(), ...options });
  location.search = p.toString();
}

const HOW_TO_PLAY = [
  ['The goal', 'You secretly lead one faction of 12 villagers in a town of 60. The other factions belong to other players or bots. The last faction with a living villager wins the town.'],
  ['Each turn: give secret orders', 'Pick up to 3 orders by typing plain sentences ("send three villagers to the armory", "hunt Mia", "assault the Tides", "everyone stand down"). Bigger orders cost more influence. Nobody sees your orders.'],
  ['Then the town acts by itself', 'Your villagers (and neutrals who trust you) follow orders in their own way: each has a temperament, a temper and a daily mood. People scowl, argue, scuffle, then fight. Hover anyone to see why.'],
  ['Rumors and love', 'Accuse starts a rumor about another faction that spreads by gossip. Love pairs your villagers with another faction; partners fight side by side. A Festival cools tempers. Villagers who lose faith can turn on you, or leave.'],
  ['Cards and miracles', 'Each dawn you are dealt cards: play one for a trick (forge a letter, bribe the neutrals, spy, raid an armory). While the town acts you have Power for live miracles: lightning, healing, fog. At the end, "The Truth" shows every order.'],
  ['Town events', 'From day 3, some dawns bring an event that changes that one turn for everybody: a heatwave, a harvest festival, a market day, an armory delivery, a sickness that hits the biggest faction.'],
  ['Good to know', 'Using the same order two turns running makes it weaker. Killing makes your faction notorious: the whole town trusts you less. Villagers wearing a ring are yours. Click Skip on any cutscene.'],
];

const FPS_CHOICES = [['0', 'Auto'], ['60', '60'], ['30', '30']];

export function showMenu() {
  const root = el('div', 'menu menu2');
  document.body.append(root);

  // Floating faction shapes for atmosphere.
  const bg = el('div', 'menu-bg');
  for (let i = 0; i < 26; i++) {
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

  const wrap = el('div', 'menu2-wrap');

  // ---- left: the title and a way in for newcomers ----
  const hero = el('div', 'menu2-hero');
  const logo = el('div', 'menu2-logo');
  FACTIONS.forEach((f, i) => {
    const dot = el('i', `s${i % 3}`);
    dot.style.background = css(f.color);
    dot.style.borderColor = css(f.dark);
    dot.style.animationDelay = `${i * 0.12}s`;
    logo.append(dot);
  });
  hero.append(logo, el('h1', '', 'TINY GODS'), el('p', 'menu2-tag', 'Secretly nudge a peaceful town into war, then argue about whose fault it was.'));
  const pills = el('div', 'menu2-pills');
  for (const t of ['60 villagers', '4 factions', 'secret orders', 'type anything']) pills.append(el('span', '', t));
  hero.append(pills);
  const links = el('div', 'menu2-links');
  const howBtn = el('button', 'menu2-link', '📖 How to play');
  howBtn.onclick = () => showHow();
  const setBtn = el('button', 'menu2-link', '⚙️ Settings');
  setBtn.onclick = () => showSettings();
  links.append(howBtn, setBtn);
  hero.append(links);
  const prog = loadStats();
  if (prog.matches > 0) {
    const badges = Object.keys(prog.achievements).map((id) => ACHIEVEMENTS[id]?.name).filter(Boolean);
    hero.append(el('p', 'menu2-record', `Your record: ${prog.wins} wins in ${prog.matches} matches${badges.length ? `  ·  ${badges.join(', ')}` : ''}`));
  }
  hero.append(el('p', 'menu2-foot', 'Made by a first-year student, one browser tab at a time.'));

  // ---- right: the ways to play ----
  const modes = el('div', 'menu2-modes');
  const card = (icon, title, sub, { primary = false, onClick } = {}) => {
    const b = el('div', `menu2-card${primary ? ' primary' : ''}`);
    b.tabIndex = 0;
    b.setAttribute('role', 'button');
    const head = el('div', 'menu2-card-head');
    head.append(el('span', 'menu2-icon', icon), el('b', '', title));
    b.append(head, el('span', 'menu2-sub', sub));
    const go = () => onClick?.();
    b.addEventListener('click', (e) => { if (!e.target.closest('.menu2-diff')) go(); });
    b.addEventListener('keydown', (e) => { if (e.key === 'Enter' && e.target === b) go(); });
    modes.append(b);
    return b;
  };

  const startSolo = () => launch({ players: '1', seed: String(Math.floor(Math.random() * 1e6) + 1) });
  const solo = card('🎮', 'Play vs bots', 'You lead the Embers. Three bots lead the rest. About 15 minutes.', { primary: true, onClick: startSolo });
  const diff = el('div', 'menu2-diff');
  diff.append(el('span', '', 'Bots:'));
  const diffBlurb = el('span', 'menu2-diffblurb');
  const diffBtns = Object.entries(DIFFICULTY).map(([id, d]) => {
    const b = el('button', '', d.label);
    b.onclick = (e) => { e.stopPropagation(); write('tinygods.difficulty', id); paintDiff(); };
    diff.append(b);
    return [id, b];
  });
  const paintDiff = () => {
    const cur = getDifficulty();
    for (const [id, b] of diffBtns) b.classList.toggle('on', id === cur);
    diffBlurb.textContent = DIFFICULTY[cur].blurb;
  };
  paintDiff();
  solo.append(diff, diffBlurb);
  const play = el('button', 'menu2-play', 'Play ▶');
  play.onclick = (e) => { e.stopPropagation(); startSolo(); };
  solo.append(play);

  const openOnline = (code = '') => import('./onlineLobby.js').then((m) => m.showOnlineLobby(root, modal, code));
  card('🌐', 'Play online', 'Make a room with a 5-letter code. Friends join from their own devices; bots fill empty seats.', { onClick: () => openOnline() });
  card('🛋️', 'Pass and play', '2 to 4 friends on one device. Orders are hidden by a "pass the device" screen.', { onClick: () => showPassSetup() });
  card('📅', 'Daily town', 'Everyone gets the same town today. Compare how you did.', { onClick: () => launch({ players: '1', seed: String(dailySeed()) }) });
  const invited = new URLSearchParams(location.search).get('room');
  if (invited) setTimeout(() => openOnline(invited), 0);

  wrap.append(hero, modes);
  root.append(bg, wrap);
  // stagger the cards in
  [...modes.children].forEach((c, i) => { c.style.animationDelay = `${0.08 * i + 0.1}s`; });

  // ---- settings ----
  function showSettings() {
    const dlg = modal();
    dlg.card.append(el('h2', '', 'Settings'));
    const list = el('div', 'set-list');
    const toggle = (key, label, hint, isOn, store) => {
      const row = el('label', 'set-row');
      const box = el('input');
      box.type = 'checkbox';
      box.checked = isOn(read(key));
      box.onchange = () => write(key, store(box.checked));
      const text = el('span', 'set-text');
      text.append(el('b', '', label), el('span', 'sub', hint));
      row.append(text, box);
      list.append(row);
    };
    toggle('tinygods.muted', 'Sound', 'Hits, voices, ambience and music.', (v) => v !== '1', (on) => (on ? '0' : '1'));
    toggle('tinygods.blood', 'Cartoon blood', 'Splatters and stains in fights.', (v) => v !== '0', (on) => (on ? '1' : '0'));
    toggle('tinygods.cutscenes', 'Cutscenes', 'The news and day cards between turns.', (v) => v !== '0', (on) => (on ? '1' : '0'));

    const choice = (key, label, hint, options, fallback) => {
      const row = el('div', 'set-row');
      const text = el('span', 'set-text');
      text.append(el('b', '', label), el('span', 'sub', hint));
      const seg = el('span', 'set-seg');
      const paint = () => {
        const cur = read(key) ?? fallback;
        [...seg.children].forEach((b) => b.classList.toggle('on', b.dataset.v === cur));
      };
      for (const [value, name] of options) {
        const b = el('button', '', name);
        b.dataset.v = value;
        b.onclick = () => { write(key, value); paint(); };
        seg.append(b);
      }
      row.append(text, seg);
      list.append(row);
      paint();
    };
    choice('tinygods.fps', 'Frame rate', 'Auto matches your screen (60, 120, 144...). Pick 60 or 30 to save battery.', FPS_CHOICES, '0');
    choice('tinygods.difficulty', 'Bot difficulty', 'How hard the computer players are.', Object.entries(DIFFICULTY).map(([id, d]) => [id, d.label]), 'normal');
    dlg.card.append(list);
  }

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
    dlg.card.append(el('p', 'sub', 'Empty seats are filled by bots.'));
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
    const overlay = el('div', 'overlay menu2-overlay');
    overlay.style.pointerEvents = 'auto';
    const card = el('div', 'panel card');
    const close = el('button', 'go ghost', 'Back');
    close.onclick = () => overlay.remove();
    overlay.append(card);
    card.append(close);
    close.style.float = 'right';
    document.body.append(overlay);
    overlay.onclick = (e) => { if (e.target === overlay) overlay.remove(); };
    const onKey = (e) => { if (e.key === 'Escape') { overlay.remove(); window.removeEventListener('keydown', onKey); } };
    window.addEventListener('keydown', onKey);
    return { card, overlay };
  }
}

export { HOW_TO_PLAY };
