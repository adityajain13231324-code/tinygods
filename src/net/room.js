import Peer from 'peerjs';

// Rooms over WebRTC (PeerJS): the host's browser is the hub. PeerJS's free public broker only
// introduces the browsers to each other; after that, game messages go straight between them.
// Lobby messages (hello / welcome / lobby / pick / start / full / rematch) are handled here;
// everything else is passed to the Lockstep once the game has begun.
// A player's seat IS their faction (0 Embers, 1 Tides, 2 Sprouts, 3 Sparks): picking a colour in the
// lobby picks the seat. Seats nobody takes are filled with bots.

const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // no 0/O/1/I
// STUN alone only connects browsers on friendly networks. TURN relays the game for players on
// different wifi, mobile data or strict college/office networks (UDP, TCP and TLS on 443).
// Set window.TG_ICE_SERVERS before the game loads to use your own TURN server instead.
const ICE = {
  iceServers: (typeof window !== 'undefined' && window.TG_ICE_SERVERS?.length) ? window.TG_ICE_SERVERS : [
    { urls: ['stun:stun.l.google.com:19302', 'stun:stun1.l.google.com:19302', 'stun:global.stun.twilio.com:3478'] },
    {
      urls: ['turn:openrelay.metered.ca:80', 'turn:openrelay.metered.ca:443', 'turn:openrelay.metered.ca:443?transport=tcp', 'turns:openrelay.metered.ca:443?transport=tcp'],
      username: 'openrelayproject',
      credential: 'openrelayproject',
    },
  ],
  iceCandidatePoolSize: 4,
};
const MAX_PLAYERS = 4;

export const ORDER_SECS = [30, 45, 60, 90];
export const SIM_SECS = [32, 45, 60];
export const DEFAULT_SETTINGS = { difficulty: 'normal', orderSecs: 45, simSecs: 32 };
const cleanSettings = (s = {}) => ({
  difficulty: ['easy', 'normal', 'hard'].includes(s.difficulty) ? s.difficulty : DEFAULT_SETTINGS.difficulty,
  orderSecs: ORDER_SECS.includes(Number(s.orderSecs)) ? Number(s.orderSecs) : DEFAULT_SETTINGS.orderSecs,
  simSecs: SIM_SECS.includes(Number(s.simSecs)) ? Number(s.simSecs) : DEFAULT_SETTINGS.simSecs,
});

const newCode = () => Array.from({ length: 5 }, () => ALPHABET[Math.floor(Math.random() * ALPHABET.length)]).join('');
const idFor = (code) => `tinygods-${code.toLowerCase()}`;
export const cleanCode = (s) => String(s ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 5);
const cleanName = (s, fallback) => String(s ?? '').replace(/[|,<>]/g, '').trim().slice(0, 14) || fallback;
const networkTrouble = (e) => e.type === 'network' || e.type === 'server-error' || e.type === 'socket-error' || e.type === 'socket-closed';
const validSeat = (n) => Number.isInteger(n) && n >= 0 && n < MAX_PLAYERS;

/**
 * Open a room as host. Callbacks: onChange(players[], code, settings), onError(text).
 * `code` reopens a known room (a rematch keeps the same code so everyone can find it again);
 * `seat` is the faction the host wants.
 */
export function hostRoom({ name, code = '', seat = 0, settings, onChange, onError }) {
  const room = {
    code: '',
    players: [{ id: 0, seat: validSeat(seat) ? seat : 0, name: cleanName(name, 'Player 1'), conn: null }],
    settings: cleanSettings(settings),
    started: false,
    lockstep: null,
    onGuestLeft: null,
    onRematchRequest: null,
  };
  let peer = null;
  let tries = 0;
  let nextId = 1;
  const fixedCode = cleanCode(code).length === 5 ? cleanCode(code) : '';

  const list = () => room.players.map((p) => ({ id: p.id, seat: p.seat, name: p.name }));
  const broadcast = (msg) => { for (const p of room.players) if (p.conn?.open) p.conn.send(msg); };
  const announce = () => {
    broadcast({ t: 'lobby', players: list(), settings: room.settings });
    onChange?.(list(), room.code, room.settings);
  };
  const freeSeat = (preferred) => (validSeat(preferred) && !room.players.some((p) => p.seat === preferred)
    ? preferred
    : [0, 1, 2, 3].find((s) => !room.players.some((p) => p.seat === s)));

  function open() {
    room.code = fixedCode || newCode();
    peer = new Peer(idFor(room.code), { config: ICE, debug: 1 });
    peer.on('error', (e) => {
      if (e.type === 'unavailable-id') {
        if (fixedCode && tries++ < 20) { try { peer.destroy(); } catch { /* already gone */ } setTimeout(open, 1500); return; } // the old room is still being released
        if (!fixedCode && tries++ < 6) { peer.destroy(); open(); return; }
      }
      onError?.(networkTrouble(e)
        ? 'Could not reach the matchmaking server. Check your internet connection and try again.'
        : `Connection problem (${e.type}).`);
    });
    peer.on('open', () => onChange?.(list(), room.code, room.settings));
    peer.on('connection', (conn) => {
      let me = null;
      conn.on('data', (msg) => {
        if (!msg || typeof msg.t !== 'string') return;
        if (msg.t === 'hello' && !me) {
          if (room.started || room.players.length >= MAX_PLAYERS) {
            conn.send({ t: 'full', started: room.started });
            setTimeout(() => conn.close(), 300);
            return;
          }
          me = { id: nextId++, seat: freeSeat(msg.seat), name: cleanName(msg.name, 'Guest'), conn };
          me.name = cleanName(msg.name, `Player ${me.seat + 1}`);
          room.players.push(me);
          conn.send({ t: 'welcome', id: me.id, seat: me.seat, code: room.code });
          announce();
        } else if (me && !room.started && msg.t === 'pick') {
          // changing colour: only to a seat nobody else has
          if (validSeat(msg.seat) && !room.players.some((p) => p !== me && p.seat === msg.seat)) { me.seat = msg.seat; announce(); }
          else announce(); // tell them the real state so their buttons reset
        } else if (me && msg.t === 'wantrematch') {
          room.onRematchRequest?.(me.seat, me.name);
        } else if (me && room.lockstep) {
          room.lockstep.onMessage(me.seat, msg);
        }
      });
      conn.on('close', () => {
        if (!me) return;
        if (room.started) {
          room.lockstep?.playerLeft(me.seat);
          room.onGuestLeft?.(me.seat);
        } else {
          room.players = room.players.filter((p) => p.conn !== conn);
          announce();
        }
      });
    });
  }
  open();

  /** The host changes their own colour. */
  room.setSeat = (n) => {
    if (!validSeat(n) || room.players.some((p) => p.id !== 0 && p.seat === n)) return false;
    room.players[0].seat = n;
    announce();
    return true;
  };
  room.setSettings = (patch) => { room.settings = cleanSettings({ ...room.settings, ...patch }); announce(); };
  room.mySeat = () => room.players[0].seat;

  /** Close the lobby and tell everyone the seed. Each person plays the faction they picked; the other seats get bots. */
  room.start = () => {
    const seed = Math.floor(Math.random() * 1e6) + 1;
    const names = ['', '', '', ''];
    for (const p of room.players) names[p.seat] = p.name;
    room.started = true;
    const settings = room.settings;
    for (const p of room.players) if (p.conn?.open) p.conn.send({ t: 'start', seed, names, seat: p.seat, ...settings });
    return { seed, names, seat: room.players[0].seat, ...settings };
  };
  /** Wire the running Lockstep to this room (host side). */
  room.attach = (lockstep) => { room.lockstep = lockstep; };
  room.broadcast = broadcast;
  room.close = () => { try { peer?.destroy(); } catch { /* already gone */ } };
  return room;
}

/** Join a room. Callbacks: onLobby(players[], settings), onStart({seed,names,seat,...}), onError(text, code), onClose(started). */
export function joinRoom({ code, name, seat, onLobby, onStart, onError, onClose }) {
  const room = { code, seat: -1, id: -1, lockstep: null, started: false, closed: false, onRematch: null };
  const peer = new Peer({ config: ICE, debug: 1 });
  let conn = null;
  const fail = (text, kind) => { clearTimeout(timer); room.close(); onError?.(text, kind); };
  const timer = setTimeout(() => fail('Could not find that room. Check the code, and that the host still has the lobby open (different networks can take ~30s).', 'timeout'), 35000);

  peer.on('error', (e) => fail(e.type === 'peer-unavailable'
    ? 'No room with that code. Check it and try again.'
    : networkTrouble(e) ? 'Could not reach the matchmaking server. Check your internet connection.' : `Connection problem (${e.type}).`, e.type));
  peer.on('open', () => {
    conn = peer.connect(idFor(code), { reliable: true, serialization: 'json' });
    conn.on('open', () => {
      clearTimeout(timer);
      conn.send({ t: 'hello', name: cleanName(name, 'Guest'), seat });
    });
    conn.on('data', (msg) => {
      if (!msg || typeof msg.t !== 'string') return;
      switch (msg.t) {
        case 'welcome': room.seat = msg.seat; room.id = msg.id; break;
        case 'lobby': {
          const mine = msg.players.find((p) => p.id === room.id);
          if (mine) room.seat = mine.seat;
          onLobby?.(msg.players, msg.settings);
          break;
        }
        case 'full': fail(msg.started ? 'That game has already started.' : 'That room is full (4 players).', 'full'); break;
        case 'start': room.started = true; onStart?.(msg); break;
        case 'rematch': room.onRematch?.(); break;
        default: room.lockstep?.onMessage(null, msg);
      }
    });
    conn.on('close', () => { if (!room.closed) onClose?.(room.started); });
  });

  room.attach = (lockstep) => { room.lockstep = lockstep; };
  room.send = (msg) => { if (conn?.open) conn.send(msg); };
  room.pick = (n) => room.send({ t: 'pick', seat: n });
  room.close = () => { room.closed = true; clearTimeout(timer); try { peer.destroy(); } catch { /* already gone */ } };
  return room;
}
