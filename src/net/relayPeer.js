// A drop-in stand-in for the small part of PeerJS that room.js uses, talking to our own WebSocket relay
// (relay/server.js) instead of WebRTC. Same events, same shapes:
//   new RelayPeer(id, url)   host: claims the room id        new RelayPeer(null, url)  guest: connect(id) joins it
//   peer.on('open' | 'connection' | 'error'), peer.connect(id) -> conn, peer.destroy()
//   conn.open, conn.send(msg), conn.on('open' | 'data' | 'close'), conn.close()
// Because the relay is a plain secure WebSocket (port 443), it works on school, office and mobile networks
// that block WebRTC. A sleeping free host takes up to a minute to wake, so we poke its /health first.

class Emitter {
  constructor() { this.h = {}; }
  on(name, fn) { (this.h[name] ??= []).push(fn); return this; }
  emit(name, ...a) { for (const fn of this.h[name] ?? []) { try { fn(...a); } catch (e) { console.error(e); } } }
}

class RelayConn extends Emitter {
  constructor(peer, cid) { super(); this.peer = peer; this.cid = cid; this.open = false; }
  send(msg) { if (this.open) this.peer._send({ op: 'data', cid: this.cid, msg }); }
  close() {
    if (!this.open) return;
    this.open = false;
    this.emit('close');
    if (this.peer.hosting) { this.peer.conns.delete(this.cid); this.peer._send({ op: 'kick', cid: this.cid }); } else this.peer.destroy();
  }
}

export class RelayPeer extends Emitter {
  constructor(id, url) {
    super();
    this.id = id;
    this.url = url;
    this.hosting = !!id;
    this.conns = new Map(); // host side: cid -> conn
    this.upstream = null; // guest side: the one connection to the host
    this.ws = null;
    this.destroyed = false;
    this._connect();
  }

  async _connect() {
    await this._wake();
    if (this.destroyed) return;
    let ws;
    try { ws = new WebSocket(this.url); } catch { return this.emit('error', { type: 'socket-error' }); }
    this.ws = ws;
    ws.onopen = () => { this.wsOpen = true; if (this.hosting) this._send({ op: 'host', id: this.id }); else this.emit('open', ''); };
    ws.onerror = () => { if (!this.wsOpen && !this.destroyed) this.emit('error', { type: 'socket-error' }); };
    ws.onclose = () => {
      if (this.destroyed) return;
      this.destroyed = true;
      if (!this.wsOpen) return;
      for (const c of this.conns.values()) { c.open = false; c.emit('close'); }
      if (this.upstream?.open) { this.upstream.open = false; this.upstream.emit('close'); }
      this.emit('close');
    };
    ws.onmessage = (ev) => { try { this._onMessage(JSON.parse(ev.data)); } catch { /* ignore junk */ } };
  }

  /** Free hosts sleep; fetching /health wakes them (up to ~60 s). Failure here is fine: the socket attempt reports it. */
  async _wake() {
    const health = this.url.replace(/^ws/, 'http').replace(/\/+$/, '') + '/health';
    const until = Date.now() + 60000;
    while (!this.destroyed && Date.now() < until) {
      try {
        const r = await fetch(health, { signal: AbortSignal.timeout(8000) });
        if (r.ok) return;
      } catch { /* still asleep or offline */ }
      this.emit('waking');
      await new Promise((r) => setTimeout(r, 1500));
    }
  }

  _send(obj) { if (this.ws?.readyState === 1) this.ws.send(JSON.stringify(obj)); }

  _onMessage(m) {
    switch (m.op) {
      case 'open':
        if (this.hosting) this.emit('open', this.id);
        else if (this.upstream) { this.upstream.cid = m.cid; this.upstream.open = true; this.upstream.emit('open'); }
        break;
      case 'connection': { const c = new RelayConn(this, m.cid); c.open = true; this.conns.set(m.cid, c); this.emit('connection', c); break; }
      case 'data': {
        const c = this.hosting ? this.conns.get(m.cid) : this.upstream;
        c?.emit('data', m.msg);
        break;
      }
      case 'close': {
        if (this.hosting) { const c = this.conns.get(m.cid); if (c?.open) { c.open = false; c.emit('close'); } this.conns.delete(m.cid); }
        else if (this.upstream?.open) { this.upstream.open = false; this.upstream.emit('close'); }
        break;
      }
      case 'error': this.emit('error', { type: m.type }); break;
      default: break;
    }
  }

  connect(id) {
    const conn = new RelayConn(this, 0);
    this.upstream = conn;
    this._send({ op: 'join', id });
    return conn;
  }

  destroy() {
    if (this.destroyed && !this.ws) return;
    this.destroyed = true;
    try { this.ws?.close(); } catch { /* already closed */ }
  }
}
