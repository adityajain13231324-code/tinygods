import { FACTIONS } from '../../config/content.js';
import { cleanCode, hostRoom, joinRoom } from '../../net/room.js';
import { setOnline } from '../../net/online.js';
import { css, el } from './dom.js';

// The "Play online" dialog: create a room (get a 5-letter code and a link), or join one. When the
// host presses Start, everybody's menu closes and the same game boots in every browser.

const NAME_KEY = 'tinygods.onlineName';
const hostDifficulty = () => { try { const d = localStorage.getItem('tinygods.difficulty'); return ['easy', 'normal', 'hard'].includes(d) ? d : 'normal'; } catch { return 'normal'; } };
const read = () => { try { return localStorage.getItem(NAME_KEY) ?? ''; } catch { return ''; } };
const write = (v) => { try { localStorage.setItem(NAME_KEY, v); } catch { /* storage can be blocked */ } };

/**
 * @param {HTMLElement} menuRoot the menu to remove when the game starts
 * @param {(opts?: object) => {card: HTMLElement, overlay: HTMLElement}} modal the menu's dialog helper
 * @param {string} [presetCode] open straight into "join" with this code (from a ?room= link)
 */
export function showOnlineLobby(menuRoot, modal, presetCode = '') {
  const dlg = modal();
  const { card, overlay } = dlg;
  let room = null;
  let started = false;
  const closeAll = () => { if (!started) room?.close(); room = null; };
  const origRemove = overlay.remove.bind(overlay);
  overlay.remove = () => { closeAll(); origRemove(); };

  const nameInput = el('input');
  nameInput.maxLength = 14;
  nameInput.placeholder = 'Your name';
  nameInput.value = read();
  nameInput.className = 'lobby-input';

  function begin(role, mySeat, seed, names, difficulty = 'normal') {
    started = true;
    setOnline({ role, room, mySeat, seed, names, difficulty });
    menuRoot.remove();
    overlay.remove();
    import('../../main.js');
  }

  function home() {
    card.replaceChildren(card.firstChild); // keep the Back button
    card.append(el('h2', '', 'Play online'));
    card.append(el('p', 'sub', 'Each friend plays on their own device. One of you creates a room and shares the code; the others join. Empty seats are filled by bots. Needs a normal home or school internet connection.'));
    card.append(el('div', 'lobby-label', 'Your name'), nameInput);
    const create = el('button', 'go', 'Create a room');
    create.onclick = () => { write(nameInput.value); showHost(); };
    const row = el('div', 'lobby-join');
    const code = el('input');
    code.className = 'lobby-input lobby-code';
    code.placeholder = 'CODE';
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
    card.append(create, el('div', 'lobby-or', 'or join a friend'), row, err);
  }

  function playerList(players, mine = -1) {
    const box = el('div', 'lobby-players');
    for (let i = 0; i < 4; i++) {
      const p = players.find((x) => x.seat === i);
      const row = el('div', `lobby-player${p ? '' : ' empty'}`);
      const dot = el('i');
      dot.style.background = css(FACTIONS[i].color);
      row.append(dot, el('span', 'who', p ? `${p.name}${p.seat === mine ? ' (you)' : ''}` : 'a bot will take this seat'), el('span', 'fac', FACTIONS[i].name));
      box.append(row);
    }
    return box;
  }

  function showHost() {
    card.replaceChildren(card.firstChild);
    card.append(el('h2', '', 'Your room'));
    const status = el('p', 'sub', 'Opening a room…');
    const diffNote = el('p', 'sub', `Bots will play on ${hostDifficulty()} (change it in Settings on the main menu).`);
    const codeBox = el('div', 'lobby-codebox');
    const list = el('div');
    const start = el('button', 'go', 'Start the game');
    start.disabled = true;
    const copy = el('button', 'go ghost', 'Copy invite link');
    const err = el('p', 'lobby-err');
    card.append(status, diffNote, codeBox, list, el('div', 'btns'), err);
    card.lastChild.previousSibling.append(start, copy);
    let url = '';
    let latest = [];
    room = hostRoom({
      name: nameInput.value,
      onChange(players, code) {
        latest = players;
        if (code) {
          url = `${location.origin}${location.pathname}?room=${code}`;
          codeBox.replaceChildren(el('div', 'lobby-code-big', code), el('div', 'sub', 'Tell your friends this code, or send them the link.'));
          status.textContent = players.length < 2 ? 'Waiting for friends to join…' : 'Ready when you are.';
        }
        list.replaceChildren(playerList(players, 0));
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
      const { seed, names, difficulty } = room.start(hostDifficulty());
      begin('host', 0, seed, names, difficulty);
    };
  }

  function showGuest(code) {
    card.replaceChildren(card.firstChild);
    card.append(el('h2', '', `Room ${code}`));
    const status = el('p', 'sub', 'Connecting…');
    const list = el('div');
    const err = el('p', 'lobby-err');
    card.append(status, list, err);
    room = joinRoom({
      code,
      name: nameInput.value,
      onLobby(players) {
        status.textContent = 'You are in. Waiting for the host to start the game…';
        list.replaceChildren(playerList(players, room.seat));
      },
      onStart({ seed, names, seat, difficulty }) { begin('guest', seat, seed, names, difficulty); },
      onError(text) {
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

  home();
  if (presetCode) card.querySelector('.lobby-code')?.focus();
}
