import { FACTIONS } from '../../config/content.js';
import { DEFAULT_SETTINGS, LAYOUT_OPTIONS, MODE_OPTIONS, ORDER_SECS, SIM_SECS, cleanCode, hostRoom, joinRoom } from '../../net/room.js';
import { LAYOUT_CHOICES, MODE_CHOICES } from './menu.js';
import { setOnline } from '../../net/online.js';
import { DIFFICULTY } from '../../config/tunables.js';
import { css, el } from './dom.js';

// The "Play online" dialog: create a room (get a 5-letter code and a link), or join one. Everybody
// picks a colour (a faction); the host sets the bots and the clocks. When the host presses Start,
// everybody's menu closes and the same game boots in every browser. After a match the same dialog
// reopens as the rematch lobby, with the same code and everyone's colour kept.

const NAME_KEY = 'tinygods.onlineName';
const MARKS = { triangle: '▲', wave: '≈', leaf: '❀', star: '★' };
const read = (k = NAME_KEY) => { try { return localStorage.getItem(k) ?? ''; } catch { return ''; } };
const write = (v, k = NAME_KEY) => { try { localStorage.setItem(k, v); } catch { /* storage can be blocked */ } };
const savedSettings = () => {
  const diff = read('tinygods.difficulty');
  const order = Number(read('tinygods.onlineOrderSecs'));
  const sim = Number(read('tinygods.onlineSimSecs'));
  return {
    difficulty: DIFFICULTY[diff] ? diff : DEFAULT_SETTINGS.difficulty,
    orderSecs: ORDER_SECS.includes(order) ? order : DEFAULT_SETTINGS.orderSecs,
    simSecs: SIM_SECS.includes(sim) ? sim : DEFAULT_SETTINGS.simSecs,
    layout: LAYOUT_OPTIONS.includes(read('tinygods.layout')) ? read('tinygods.layout') : DEFAULT_SETTINGS.layout,
    mode: MODE_OPTIONS.includes(read('tinygods.mode')) ? read('tinygods.mode') : DEFAULT_SETTINGS.mode,
  };
};
const clockLabel = (s) => (s >= 60 ? `${s / 60 === Math.floor(s / 60) ? s / 60 : (s / 60).toFixed(1).replace('.0', '')} min` : `${s} s`);

/**
 * @param {HTMLElement} menuRoot the menu to remove when the game starts
 * @param {(opts?: object) => {card: HTMLElement, overlay: HTMLElement}} modal the menu's dialog helper
 * @param {string} [presetCode] open straight into "join" with this code (from a ?room= link)
 * @param {{role: 'host'|'guest', code: string, name: string, seat: number} | null} [rematch] reopen the last room
 */
export function showOnlineLobby(menuRoot, modal, presetCode = '', rematch = null) {
  const dlg = modal();
  const { card, overlay } = dlg;
  card.classList.add('lobby-card');
  let room = null;
  let started = false;
  const closeAll = () => { if (!started) room?.close(); room = null; };
  const origRemove = overlay.remove.bind(overlay);
  overlay.remove = () => { closeAll(); origRemove(); };

  const nameInput = el('input');
  nameInput.maxLength = 14;
  nameInput.placeholder = 'Your name';
  nameInput.setAttribute('aria-label', 'Your online name');
  nameInput.value = rematch?.name || read();
  nameInput.className = 'lobby-input';

  function begin(role, mySeat, msg) {
    started = true;
    setOnline({ role, room, mySeat, seed: msg.seed, names: msg.names, difficulty: msg.difficulty, orderSecs: msg.orderSecs, simSecs: msg.simSecs, layout: msg.layout, mode: msg.mode });
    menuRoot.remove();
    overlay.remove();
    import('../../main.js');
  }

  function home() {
    card.replaceChildren(card.firstChild); // keep the Back button
    card.append(el('h2', '', 'Play online'));
    card.append(el('p', 'sub', 'Create a room to invite friends, or enter their code. Empty seats become bots.'));
    card.append(el('div', 'lobby-label', 'Your name'), nameInput);
    const create = el('button', 'go', 'Create a room');
    create.onclick = () => { write(nameInput.value); showHost(); };
    const row = el('div', 'lobby-join');
    const code = el('input');
    code.className = 'lobby-input lobby-code';
    code.placeholder = 'CODE';
    code.setAttribute('aria-label', 'Room code');
    code.maxLength = 5;
    code.value = presetCode;
    code.oninput = () => { code.value = cleanCode(code.value); };
    const join = el('button', 'go ghost', 'Join');
    join.onclick = () => {
      if (cleanCode(code.value).length !== 5) { err.textContent = 'Codes have 5 letters or numbers.'; return; }
      write(nameInput.value);
      showGuest(cleanCode(code.value));
    };
    row.append(code, join);
    const err = el('p', 'lobby-err');
    const hostBox=el('section','lobby-choice'),joinBox=el('section','lobby-choice');hostBox.append(el('h3','','Host a game'),create);joinBox.append(el('h3','','Join a friend'),row,err);card.append(hostBox,joinBox);
  }

  /** Four colour tiles: tap a free one to take it. Taken ones show who has them. */
  function colourPicker(players, mySeat, pick) {
    const box = el('div', 'lobby-colours');
    FACTIONS.forEach((f, i) => {
      const owner = players.find((p) => p.seat === i);
      const mine = i === mySeat;
      const b = el('button', `lobby-colour${mine ? ' mine' : ''}${owner && !mine ? ' taken' : ''}`);
      b.style.setProperty('--c', css(f.color));
      b.disabled = !!owner && !mine;
      b.append(el('span', 'lc-mark', MARKS[f.mark]), el('b', '', f.name), el('small', '', owner ? (mine ? 'you' : owner.name) : 'free · or a bot'));
      b.onclick = () => { if (!mine && !owner) pick(i); };
      box.append(b);
    });
    return box;
  }

  function settingsSummary(s) {
    return `Bots: ${DIFFICULTY[s.difficulty].label}  ·  Orders ${clockLabel(s.orderSecs)}  ·  Town acts ${clockLabel(s.simSecs)}  ·  Town: ${LAYOUT_CHOICES.find(([id]) => id === s.layout)?.[1] ?? 'Classic town'}  ·  ${MODE_CHOICES.find(([id]) => id === s.mode)?.[1] ?? 'Standard'}`;
  }

  function seg(label, hint, options, current, onPick) {
    const row = el('div', 'lobby-set');
    const text = el('span', 'set-text');
    text.append(el('b', '', label), el('span', 'sub', hint));
    const box = el('span', 'set-seg');
    for (const [value, name] of options) {
      const b = el('button', value === current ? 'on' : '', name);
      b.onclick = () => { [...box.children].forEach((x) => x.classList.toggle('on', x === b)); onPick(value); };
      box.append(b);
    }
    row.append(text, box);
    return row;
  }

  function showHost() {
    card.replaceChildren(card.firstChild);
    card.append(el('h2', '', rematch ? 'Rematch lobby' : 'Your room'));
    const status = el('p', 'sub', rematch ? 'Waiting for everyone to come back…' : 'Opening a room…');
    const codeBox = el('div', 'lobby-codebox');
    const colours = el('div');
    const list = el('div');
    const settingsBox = el('div', 'lobby-settings');
    const start = el('button', 'go', 'Start the game');
    start.disabled = true;
    const copy = el('button', 'go ghost', 'Copy invite link');
    const btns = el('div', 'btns');
    const err = el('p', 'lobby-err');
    btns.append(start, copy);

    const settings = savedSettings();
    settingsBox.append(
      el('div', 'lobby-label', 'Game settings (you pick, everyone gets the same)'),
      seg('Bots', 'How hard the computer players are.', Object.entries(DIFFICULTY).map(([id, d]) => [id, d.label]), settings.difficulty, (v) => { write(v, 'tinygods.difficulty'); room.setSettings({ difficulty: v }); }),
      seg('Time for orders', 'Each dawn. Typed orders are sent when it runs out.', ORDER_SECS.map((s) => [s, clockLabel(s)]), settings.orderSecs, (v) => { write(String(v), 'tinygods.onlineOrderSecs'); room.setSettings({ orderSecs: v }); }),
      seg('Town layout', 'Where the fights will happen. Random is one fair seeded draw.', LAYOUT_CHOICES, settings.layout, (v) => { write(v, 'tinygods.layout'); room.setSettings({ layout: v }); }),
      seg('Challenge', 'Optional rule twist. Challenge matches do not count toward records.', MODE_CHOICES, settings.mode, (v) => { write(v, 'tinygods.mode'); room.setSettings({ mode: v }); }),
      seg('Time the town acts', 'How long each day plays out.', SIM_SECS.map((s) => [s, clockLabel(s)]), settings.simSecs, (v) => { write(String(v), 'tinygods.onlineSimSecs'); room.setSettings({ simSecs: v }); }),
    );
    card.append(status, codeBox, el('div', 'lobby-label', 'Pick your colour'), colours, list, settingsBox, btns, err);

    let url = '';
    let latest = [];
    room = hostRoom({
      name: nameInput.value,
      code: rematch?.code ?? '',
      seat: rematch?.seat ?? 0,
      settings,
      onChange(players, code) {
        latest = players;
        if (code) {
          url = `${location.origin}${location.pathname}?room=${code}`;
          codeBox.replaceChildren(el('div', 'lobby-code-big', code), el('div', 'sub', 'Tell your friends this code, or send them the link.'));
          status.textContent = players.length < 2 ? 'Waiting for friends to join…' : 'Ready when you are.';
        }
        const mine = room.mySeat();
        colours.replaceChildren(colourPicker(players, mine, (n) => room.setSeat(n)));
        list.replaceChildren(playerList(players, room.players.find((p) => p.id === 0)?.id));
        start.disabled = players.length < 2;
        start.textContent = players.length < 2 ? 'Start the game (need 2+ players)' : `Start the game (${players.length} players${players.length < 4 ? `, ${4 - players.length} bot${players.length === 3 ? '' : 's'}` : ''})`;
      },
      onError(text) { err.textContent = text; },
    });
    copy.onclick = async () => {
      try { await navigator.clipboard.writeText(url); copy.textContent = 'Copied!'; } catch { window.prompt('Copy this link:', url); }
    };
    start.onclick = () => {
      if (latest.length < 2) return;
      const msg = room.start();
      begin('host', msg.seat, msg);
    };
  }

  function playerList(players, myId) {
    const box = el('div', 'lobby-players');
    for (const p of [...players].sort((a, b) => a.seat - b.seat)) {
      const row = el('div', 'lobby-player');
      const dot = el('i');
      dot.style.background = css(FACTIONS[p.seat].color);
      row.append(dot, el('span', 'who', `${p.name}${p.id === myId ? ' (you)' : ''}`), el('span', 'fac', FACTIONS[p.seat].name));
      box.append(row);
    }
    const bots = 4 - players.length;
    if (bots > 0) box.append(el('div', 'lobby-player empty', `${bots} bot${bots === 1 ? '' : 's'} will take the free colour${bots === 1 ? '' : 's'}`));
    return box;
  }

  function showGuest(code, attempt = 0) {
    card.replaceChildren(card.firstChild);
    card.append(el('h2', '', rematch ? `Rematch · room ${code}` : `Room ${code}`));
    const status = el('p', 'sub', rematch ? 'Rejoining the room…' : 'Connecting…');
    const colours = el('div');
    const list = el('div');
    const note = el('p', 'sub');
    const err = el('p', 'lobby-err');
    card.append(status, el('div', 'lobby-label', 'Pick your colour'), colours, list, note, err);
    room = joinRoom({
      code,
      name: nameInput.value,
      seat: rematch?.seat,
      onLobby(players, settings) {
        status.textContent = 'You are in. Waiting for the host to start the game…';
        colours.replaceChildren(colourPicker(players, room.seat, (n) => room.pick(n)));
        list.replaceChildren(playerList(players, room.id));
        if (settings) note.textContent = settingsSummary(settings);
      },
      onStart(msg) { begin('guest', msg.seat, msg); },
      onError(text, kind) {
        // after a match the host's browser needs a moment to reopen the room: keep knocking
        if (rematch && attempt < 25 && (kind === 'peer-unavailable' || kind === 'timeout')) {
          status.textContent = 'Waiting for the host to reopen the room…';
          room = null;
          setTimeout(() => { if (overlay.isConnected) showGuest(code, attempt + 1); }, 2000);
          return;
        }
        status.textContent = '';
        err.textContent = text;
        const back = el('button', 'go ghost', 'Try again');
        back.onclick = () => { room = null; home(); };
        card.append(back);
      },
      onClose(wasStarted) {
        if (wasStarted) { window.dispatchEvent(new Event('tinygods-host-left')); return; }
        status.textContent = '';
        err.textContent = 'The host closed the room.';
      },
    });
  }

  if (rematch?.role === 'host') showHost();
  else if (rematch?.role === 'guest') showGuest(rematch.code);
  else {
    home();
    if (presetCode) card.querySelector('.lobby-code')?.focus();
  }
}
