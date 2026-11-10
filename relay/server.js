// Tiny Gods turn relay: a small WebSocket hub so online rooms work on every network (no WebRTC, no TURN).
// It never looks at the game: the host's browser stays the authority and the lockstep messages are just
// forwarded. One room = one host plus up to MAX_GUESTS guests, found by the room id the game already uses.
//
//   node relay/server.js            (PORT, default 8787)
//
// Messages (JSON), client -> server:  {op:'host', id}  {op:'join', id}  {op:'data', cid?, msg}
// server -> client:  {op:'open', cid?}  {op:'connection', cid}  {op:'data', cid?, msg}  {op:'close', cid?}  {op:'error', type}
import http from 'node:http';
import { WebSocketServer } from 'ws';

const ID_RE = /^tinygods-[a-z0-9]{5}$/;
const MAX_GUESTS = 6;
const MAX_BYTES = 64 * 1024;
const MAX_MSGS_PER_SEC = 80;
const ROOM_TTL_MS = 3 * 60 * 60 * 1000;

export function createRelay({ port = 0, host = '0.0.0.0', log = () => {} } = {}) {
  const rooms = new Map(); // id -> { host, guests: Map<cid, ws>, nextCid, born }
  const stats = { started: Date.now(), roomsOpened: 0, messages: 0 };
  const server = http.createServer((req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    if (req.url === '/health' || req.url === '/') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: true, game: 'tiny-gods-relay', rooms: rooms.size, uptime: Math.round((Date.now() - stats.started) / 1000) }));
    } else { res.writeHead(404); res.end(); }
  });
  const wss = new WebSocketServer({ server, maxPayload: MAX_BYTES });
  const send = (ws, obj) => { if (ws.readyState === 1) ws.send(JSON.stringify(obj)); };

  wss.on('connection', (ws) => {
    ws.alive = true;
    ws.role = null; // 'host' | 'guest'
    ws.room = null;
    ws.cid = 0;
    ws.windowStart = Date.now();
    ws.windowCount = 0;
    ws.on('pong', () => { ws.alive = true; });
    ws.on('message', (raw) => {
      const now = Date.now();
      if (now - ws.windowStart > 1000) { ws.windowStart = now; ws.windowCount = 0; }
      if (++ws.windowCount > MAX_MSGS_PER_SEC) { ws.close(1008, 'too fast'); return; }
      let m;
      try { m = JSON.parse(raw.toString()); } catch { return; }
      if (!m || typeof m.op !== 'string') return;
      stats.messages++;
      if (m.op === 'host' && !ws.role) {
        if (typeof m.id !== 'string' || !ID_RE.test(m.id)) return send(ws, { op: 'error', type: 'invalid-id' });
        if (rooms.has(m.id)) return send(ws, { op: 'error', type: 'unavailable-id' });
        const room = { id: m.id, host: ws, guests: new Map(), nextCid: 1, born: now };
        rooms.set(m.id, room);
        ws.role = 'host';
        ws.room = room;
        stats.roomsOpened++;
        log(`room ${m.id} opened (${rooms.size} open)`);
        send(ws, { op: 'open' });
      } else if (m.op === 'join' && !ws.role) {
        const room = typeof m.id === 'string' ? rooms.get(m.id) : null;
        if (!room) return send(ws, { op: 'error', type: 'peer-unavailable' });
        if (room.guests.size >= MAX_GUESTS) return send(ws, { op: 'error', type: 'room-full' });
        ws.role = 'guest';
        ws.room = room;
        ws.cid = room.nextCid++;
        room.guests.set(ws.cid, ws);
        send(ws, { op: 'open', cid: ws.cid });
        send(room.host, { op: 'connection', cid: ws.cid });
      } else if (m.op === 'data' && ws.room) {
        if (ws.role === 'guest') send(ws.room.host, { op: 'data', cid: ws.cid, msg: m.msg });
        else { const g = ws.room.guests.get(m.cid); if (g) send(g, { op: 'data', msg: m.msg }); }
      } else if (m.op === 'kick' && ws.role === 'host') {
        const g = ws.room.guests.get(m.cid);
        if (g) g.close();
      } else if (m.op === 'ping') send(ws, { op: 'pong' });
    });
    ws.on('close', () => {
      const room = ws.room;
      if (!room) return;
      if (ws.role === 'guest') {
        room.guests.delete(ws.cid);
        send(room.host, { op: 'close', cid: ws.cid });
      } else if (ws.role === 'host') {
        rooms.delete(room.id);
        for (const g of room.guests.values()) { send(g, { op: 'close' }); g.close(); }
        log(`room ${room.id} closed (${rooms.size} open)`);
      }
    });
    ws.on('error', () => {});
  });

  // Drop dead sockets (a phone that left Wi-Fi) and rooms nobody could still be playing in.
  const beat = setInterval(() => {
    for (const ws of wss.clients) {
      if (!ws.alive) { ws.terminate(); continue; }
      ws.alive = false;
      try { ws.ping(); } catch { /* closing */ }
    }
    const now = Date.now();
    for (const room of rooms.values()) if (now - room.born > ROOM_TTL_MS) room.host.close(1000, 'room expired');
  }, 25000);
  beat.unref?.();

  return new Promise((resolve) => server.listen(port, host, () => resolve({
    port: server.address().port,
    rooms,
    stats,
    close: () => new Promise((done) => { clearInterval(beat); for (const ws of wss.clients) ws.terminate(); wss.close(() => server.close(() => done())); }),
  })));
}

if (import.meta.url === `file://${process.argv[1].replace(/\\/g, '/')}` || process.argv[1]?.endsWith('relay/server.js')) {
  const port = Number(process.env.PORT ?? 8787);
  createRelay({ port, log: (s) => console.log(new Date().toISOString(), s) }).then((r) => console.log(`Tiny Gods relay listening on :${r.port}`));
}
