import Peer from 'peerjs';

// Rooms over WebRTC (PeerJS): the host's browser is the hub. PeerJS's free public broker only
// introduces the browsers to each other; after that, game messages go straight between them.
// Lobby messages (hello / welcome / lobby / start / full) are handled here; everything else is
// passed to the Lockstep once the game has begun.

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

const newCode = () => Array.from({ length: 5 }, () => ALPHABET[Math.floor(Math.random() * ALPHABET.length)]).join('');
const idFor = (code) => `tinygods-${code.toLowerCase()}`;
export const cleanCode = (s) => String(s ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 5);
const cleanName = (s, fallback) => String(s ?? '').replace(/[|,<>]/g, '').trim().slice(0, 14) || fallback;
const networkTrouble = (e) => e.type === 'network' || e.type === 'server-error' || e.type === 'socket-error' || e.type === 'socket-closed';

/** Open a room as host. Callbacks: onChange(players[], code), onError(text). */
export function hostRoom({ name, onChange, onError }) {
  const room = {
    code: '',
    players: [{ seat: 0, name: cleanName(name, 'Player 1'), conn: null }],
    started: false,
    lockstep: null,
    onGuestLeft: null,
  };
  let peer = null;
  let tries = 0;

  const list = () => room.players.map((p) => ({ seat: p.seat, name: p.name }));
  const broadcast = (msg) => { for (const p of room.players) if (p.conn?.open) p.conn.send(msg); };
  const announce = () => {
    broadcast({ t: 'lobby', players: list() });
    onChange?.(list(), room.code);
  };

  function open() {
    room.code = newCode();
    peer = new Peer(idFor(room.code), { config: ICE, debug: 1 });
    peer.on('error', (e) => {
      if (e.type === 'unavailable-id' && tries++ < 6) { peer.destroy(); open(); return; }
      onError?.(networkTrouble(e)
        ? 'Could not reach the matchmaking server. Check your internet connection and try again.'
        : `Connection problem (${e.type}).`);
    });
    peer.on('open', () => onChange?.(list(), room.code));
    peer.on('connection', (conn) => {
      let seat = -1;
      conn.on('data', (msg) => {
        if (!msg || typeof msg.t !== 'string') return;
        if (msg.t === 'hello' && seat < 0) {
          if (room.started || room.players.length >= MAX_PLAYERS) {
            conn.send({ t: 'full', started: room.started });
            setTimeout(() => conn.close(), 300);
            return;
          }
          seat = [1, 2, 3].find((s) => !room.players.some((p) => p.seat === s));
          room.players.push({ seat, name: cleanName(msg.name, `Player ${seat + 1}`), conn });
          conn.send({ t: 'welcome', seat, code: room.code });
          announce();
        } else if (seat >= 0 && room.lockstep) {
          room.lockstep.onMessage(seat, msg);
        }
      });
      conn.on('close', () => {
        if (seat < 0) return;
        if (room.started) {
          room.lockstep?.playerLeft(seat);
          room.onGuestLeft?.(seat);
        } else {
          room.players = room.players.filter((p) => p.conn !== conn);
          announce();
        }
      });
    });
  }
  open();

  /** Close the lobby and tell everyone the seed. Seats follow join order (Embers, Tides, Sprouts, Sparks). */
  room.start = (difficulty = 'normal') => {
    const seed = Math.floor(Math.random() * 1e6) + 1;
    room.players.sort((a, b) => a.seat - b.seat);
    room.players.forEach((p, i) => { p.seat = i; });
    const names = room.players.map((p) => p.name);
    room.started = true;
    for (const p of room.players) if (p.conn?.open) p.conn.send({ t: 'start', seed, names, seat: p.seat, difficulty });
    return { seed, names, difficulty };
  };
  /** Wire the running Lockstep to this room (host side). */
  room.attach = (lockstep) => { room.lockstep = lockstep; };
  room.broadcast = broadcast;
  room.close = () => { try { peer?.destroy(); } catch { /* already gone */ } };
  return room;
}

/** Join a room. Callbacks: onLobby(players[]), onStart({seed,names,seat}), onError(text), onClose(started). */
export function joinRoom({ code, name, onLobby, onStart, onError, onClose }) {
  const room = { code, seat: -1, lockstep: null, started: false, closed: false };
  const peer = new Peer({ config: ICE, debug: 1 });
  let conn = null;
  const fail = (text) => { clearTimeout(timer); room.close(); onError?.(text); };
  const timer = setTimeout(() => fail('Could not find that room. Check the code, and that the host still has the lobby open (different networks can take ~30s).'), 35000);

  peer.on('error', (e) => fail(e.type === 'peer-unavailable'
    ? 'No room with that code. Check it and try again.'
    : networkTrouble(e) ? 'Could not reach the matchmaking server. Check your internet connection.' : `Connection problem (${e.type}).`));
  peer.on('open', () => {
    conn = peer.connect(idFor(code), { reliable: true, serialization: 'json' });
    conn.on('open', () => {
      clearTimeout(timer);
      conn.send({ t: 'hello', name: cleanName(name, 'Guest') });
    });
    conn.on('data', (msg) => {
      if (!msg || typeof msg.t !== 'string') return;
      switch (msg.t) {
        case 'welcome': room.seat = msg.seat; break;
        case 'lobby': onLobby?.(msg.players); break;
        case 'full': fail(msg.started ? 'That game has already started.' : 'That room is full (4 players).'); break;
        case 'start': room.started = true; onStart?.({ seed: msg.seed, names: msg.names, seat: msg.seat, difficulty: msg.difficulty }); break;
        default: room.lockstep?.onMessage(null, msg);
      }
    });
    conn.on('close', () => { if (!room.closed) onClose?.(room.started); });
  });

  room.attach = (lockstep) => { room.lockstep = lockstep; };
  room.send = (msg) => { if (conn?.open) conn.send(msg); };
  room.close = () => { room.closed = true; clearTimeout(timer); try { peer.destroy(); } catch { /* already gone */ } };
  return room;
}
