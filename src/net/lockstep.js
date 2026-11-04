import { castPower } from '../sim/powers.js';
import { botDecide, botCard } from '../bots/bot.js';
import { isGhost, skipRecap, submitOrders, updateGame, validateSubmission } from '../sim/turn.js';
import { SIM } from '../config/tunables.js';

// Online play without a game server: every player's browser runs the same deterministic sim
// (same seed, same inputs, same result), and the host decides WHEN things happen so nobody drifts.
//
//   dawn   everybody types in secret and sends {orders, card} to the host. When all are in (or the
//          clock runs out) the host broadcasts "go" with every seat's orders; each browser submits
//          them in the same order and the town starts to act.
//   sim    the host announces a "horizon": ticks 0..n-1 may run. A miracle cast by anyone goes to
//          the host, which stamps it with the current horizon and broadcasts it, so every browser
//          casts it just before the same tick. A browser that is behind simply runs faster.
//   recap  the host says "next" when its timer ends (or everyone is ready).
//
// Orders stay secret until "go" because they only ever travel to the host. This file has no
// browser or network code: it talks through the `send` / `broadcast` functions it is given, so it
// is tested in Node with a fake network (tools/net-test.js).

const TICK = 1 / SIM.tickHz;
const LEAD = 4; // the host lets everyone run this many ticks ahead of its own clock
const HZ_EVERY = 2; // announce a new horizon every 2 ticks (10 messages a second)
const GO_GRACE = 2.2; // seconds the host waits after the last call for late submissions
const MAX_BEHIND = 0.5; // seconds of stored-up time a browser may spend catching up

const clone = (x) => JSON.parse(JSON.stringify(x));

/** A fingerprint of the town, to prove every browser sees the same thing. */
export function stateHash(game) {
  let h = Math.imul(game.turn, 7919);
  for (const v of game.world.villagers) {
    h = (Math.imul(h, 31) + Math.round(v.x * 10) + Math.imul(Math.round(v.y * 10), 7) + Math.imul(Math.round(v.hp * 10), 13) + (v.alive ? 1 : 0) + v.faction * 3) | 0;
  }
  return h;
}

export class Lockstep {
  /**
   * @param {{game: any, role: 'host'|'guest', mySeat: number, send?: (msg: any) => void, broadcast?: (msg: any) => void, hooks?: any}} o
   *   guests use `send` (to the host); the host uses `broadcast` (to every guest).
   */
  constructor({ game, role, mySeat, send = () => {}, broadcast = () => {}, hooks = {} }) {
    this.game = game;
    this.role = role;
    this.mySeat = mySeat;
    this.sendToHost = send;
    this.broadcastToGuests = broadcast;
    this.hooks = hooks;
    this.inbox = [];
    this.cmds = [];
    this.horizon = 0;
    this.na = 0; // sim time this browser still owes
    this.desync = false;
    this.info = { turn: 0, submitted: [], ready: [] }; // what the top-bar panel shows
    // host-only bookkeeping
    this.subs = {};
    this.early = [];
    this.readyNext = new Set();
    this.goSent = -1;
    this.nextSent = -1;
    this.lastCall = -1;
    this.tickAcc = 0;
    this.simClock = 0;
    this.hzSent = 0;
    this.left = new Set();
    this.hashes = {};
    this.lastStatus = '';
    this.announceTurn();
  }

  get isHost() { return this.role === 'host'; }

  // ---- what the UI calls --------------------------------------------------------

  /** Hand in this turn's orders. Validates and marks them here, then sends them to the host. */
  submit(orders, card = null) {
    const r = submitOrders(this.game, this.mySeat, orders, card);
    if (!r.ok) return r;
    const m = { t: 'sub', turn: this.game.turn, orders: clone(orders), card: card ? clone(card) : null };
    if (this.isHost) this.subs[this.mySeat] = { orders: m.orders, card: m.card };
    else this.sendToHost(m);
    return r;
  }

  /** A live miracle. The result is optimistic: every browser applies it at the same tick, or none does. */
  cast(id, args = {}) {
    const m = { t: 'cast', turn: this.game.turn, id, args: clone(args) };
    if (this.game.phase !== 'sim') return { ok: false, error: 'Powers work while the town acts' };
    if (this.isHost) this.stamp(this.mySeat, m);
    else this.sendToHost(m);
    return { ok: true, message: 'The miracle is on its way...' };
  }

  /** "I have read the news": the next turn starts when everyone has (or the timer ends). */
  ready() {
    const m = { t: 'next', turn: this.game.turn };
    if (this.isHost) this.readyNext.add(this.mySeat);
    else this.sendToHost(m);
  }

  /** Host only: this player's connection dropped; a bot takes the seat from the next dawn. */
  playerLeft(seat) {
    if (!this.isHost || this.game.seats[seat]?.kind !== 'human') return;
    this.left.add(seat);
    this.emit({ t: 'left', seat });
  }

  // ---- incoming network messages -------------------------------------------------

  /** @param {number|null} fromSeat who sent it (the host knows; guests pass null) */
  onMessage(fromSeat, m) {
    if (!m || typeof m.t !== 'string') return;
    if (!this.isHost) {
      this.inbox.push(m);
      return;
    }
    const g = this.game;
    switch (m.t) {
      case 'sub':
        if (m.turn > g.turn || (m.turn === g.turn && g.phase !== 'command' && this.goSent !== g.turn)) this.early.push({ seat: fromSeat, m });
        else this.acceptSub(fromSeat, m);
        break;
      case 'cast': this.stamp(fromSeat, m); break;
      case 'next': if (m.turn === g.turn) this.readyNext.add(fromSeat); break;
      case 'hash': this.checkHash(fromSeat, m.turn, m.h); break;
      default: break;
    }
  }

  // ---- host decisions ---------------------------------------------------------------

  acceptSub(seat, m) {
    const g = this.game;
    if (m.turn !== g.turn || g.phase !== 'command' || this.goSent === g.turn || seat === null) return;
    if (!validateSubmission(g, seat, m.orders, m.card).ok) return;
    this.subs[seat] = { orders: clone(m.orders), card: m.card ? clone(m.card) : null };
  }

  /** Give a miracle its place in time: before the next tick nobody has run yet. */
  stamp(seat, m) {
    const g = this.game;
    if (m.turn !== g.turn || g.phase !== 'sim' || !Number.isInteger(seat)) return;
    this.emit({ t: 'cmd', turn: g.turn, tick: this.hzSent, seat, id: String(m.id), args: m.args ?? {} });
  }

  required() {
    const g = this.game;
    return g.seats.map((s, i) => i).filter((i) => g.seats[i].kind === 'human' && !this.left.has(i) && (!g.eliminated[i] || isGhost(g, i)));
  }

  emit(m) {
    this.broadcastToGuests(m);
    this.inbox.push(m);
  }

  sendGo() {
    const g = this.game;
    const subs = {};
    for (const [seat, s] of Object.entries(this.subs)) subs[seat] = s;
    this.goSent = g.turn;
    this.simClock = 0;
    this.hzSent = LEAD;
    this.emit({ t: 'go', turn: g.turn, subs, bots: [...this.left] });
    this.emit({ t: 'hz', turn: g.turn, n: LEAD });
    this.left.clear();
  }

  hostLogic(dt) {
    const g = this.game;
    switch (g.phase) {
      case 'command': {
        // submissions that arrived before this browser reached the same dawn
        if (this.early.length) {
          const rest = [];
          for (const e of this.early) (e.m.turn === g.turn ? this.acceptSub(e.seat, e.m) : e.m.turn > g.turn ? rest.push(e) : null);
          this.early = rest;
        }
        // Time is up: tell everybody to hand in whatever they have, then wait a moment for it to arrive.
        if (g.timer <= 0 && this.lastCall !== g.turn && this.goSent !== g.turn) {
          this.lastCall = g.turn;
          this.emit({ t: 'lastcall', turn: g.turn });
        }
        if (this.goSent !== g.turn) {
          const need = this.required();
          if (need.every((s) => this.subs[s]) || g.timer <= -GO_GRACE) this.sendGo();
        }
        break;
      }
      case 'sim': {
        if (this.goSent !== g.turn) break;
        this.simClock += dt;
        const target = Math.floor(this.simClock / TICK) + LEAD;
        if (target - this.hzSent >= HZ_EVERY) {
          this.hzSent = target;
          this.emit({ t: 'hz', turn: g.turn, n: target });
        }
        break;
      }
      case 'recap': {
        if (this.nextSent !== g.turn) {
          const need = this.required();
          if (g.timer <= 0 || need.every((s) => this.readyNext.has(s))) {
            this.nextSent = g.turn;
            this.emit({ t: 'next', turn: g.turn });
          }
        }
        break;
      }
      default: break;
    }
    // Keep every browser's countdown on the host's clock.
    this.tickAcc += dt;
    if (this.tickAcc >= 1 && (g.phase === 'command' || g.phase === 'recap')) {
      this.tickAcc = 0;
      this.emit({ t: 'tick', turn: g.turn, phase: g.phase, timer: g.timer });
    }
    // Tell everybody who is done (the top-bar chips).
    const info = { t: 'status', turn: g.turn, submitted: g.phase === 'command' ? Object.keys(this.subs).map(Number) : [], ready: g.phase === 'recap' ? [...this.readyNext] : [] };
    const key = JSON.stringify(info);
    if (key !== this.lastStatus) {
      this.lastStatus = key;
      this.emit(info);
    }
  }

  checkHash(seat, turn, h) {
    const row = (this.hashes[turn] ??= {});
    row[seat] = h;
    const vals = Object.values(row);
    if (vals.some((x) => x !== vals[0]) && !this.desync) this.emit({ t: 'desync', turn });
  }

  // ---- running the game ---------------------------------------------------------------

  /** Call once per frame with the real seconds that passed. */
  update(dt) {
    if (this.isHost) this.hostLogic(dt);
    this.processInbox();
    const g = this.game;
    if (g.phase === 'command' || g.phase === 'recap') g.timer -= dt; // display only: the host decides when it ends
    else if (g.phase === 'sim') this.stepSim(dt);
  }

  classify(m) {
    const g = this.game;
    if (m.t === 'go' || m.t === 'next' || m.t === 'hz' || m.t === 'cmd' || m.t === 'lastcall') {
      if (g.turn > m.turn) return 'drop';
      if (g.turn < m.turn) return 'wait';
    }
    switch (m.t) {
      case 'go':
      case 'lastcall': return g.phase === 'command' ? 'now' : 'drop';
      case 'next': return g.phase === 'recap' ? 'now' : g.phase === 'sim' ? 'wait' : 'drop';
      case 'hz':
      case 'cmd': return g.phase === 'sim' ? 'now' : g.phase === 'command' ? 'wait' : 'drop';
      default: return 'now';
    }
  }

  processInbox() {
    while (this.inbox.length) {
      const m = this.inbox[0];
      const c = this.classify(m);
      if (c === 'wait') break;
      this.inbox.shift();
      if (c === 'now') this.handle(m);
    }
  }

  handle(m) {
    const g = this.game;
    switch (m.t) {
      case 'go': {
        for (const seat of m.bots ?? []) {
          g.seats[seat].kind = 'bot';
          g.seats[seat].personality = 'opportunist';
          g.seats[seat].name = `${g.seats[seat].name} (bot)`;
        }
        const converted = new Set(m.bots ?? []);
        for (let seat = 0; seat < g.seats.length; seat++) {
          if (g.seats[seat].kind !== 'human') continue;
          g.pending[seat] = null; // forget any local, cosmetic "submitted" mark: the host's list is the truth
          g.cardPending[seat] = null;
          const s = m.subs[seat];
          const ok = s ? submitOrders(g, seat, s.orders, s.card).ok : false;
          if (!ok) submitOrders(g, seat, []); // nothing (or something invalid) came in: pass the turn. A fallen seat just refuses.
        }
        for (const seat of [...converted].sort((a, b) => a - b)) {
          if (g.eliminated[seat]) continue;
          g.pending[seat] = null;
          g.cardPending[seat] = null;
          const orders = botDecide(g, seat);
          if (!submitOrders(g, seat, orders, botCard(g, seat)).ok && !submitOrders(g, seat, orders).ok) submitOrders(g, seat, []);
        }
        updateGame(g, 0); // everyone is in: the town wakes up
        this.cmds = [];
        this.horizon = 0;
        this.na = 0;
        this.subs = {};
        this.hooks.onGo?.();
        break;
      }
      case 'hz': this.horizon = Math.max(this.horizon, m.n); break;
      case 'lastcall': this.hooks.onLastCall?.(); break;
      case 'tick': if (m.turn === g.turn && m.phase === g.phase && !this.isHost) g.timer = m.timer; break;
      case 'cmd': this.cmds.push(m); break;
      case 'next':
        this.hooks.beforeNext?.();
        skipRecap(g);
        this.readyNext.clear();
        this.announceTurn();
        break;
      case 'status': this.info = { turn: m.turn, submitted: m.submitted, ready: m.ready }; break;
      case 'desync': this.desync = true; this.hooks.onDesync?.(m.turn); break;
      case 'left': this.hooks.onLeft?.(m.seat); break;
      default: break;
    }
  }

  /** After a new dawn begins: prove we agree on the town. */
  announceTurn() {
    const g = this.game;
    if (g.phase !== 'command') return;
    const h = stateHash(g);
    if (this.isHost) this.checkHash(this.mySeat, g.turn, h);
    else this.sendToHost({ t: 'hash', turn: g.turn, h });
  }

  applyCmds() {
    const g = this.game;
    while (this.cmds.length && this.cmds[0].tick <= g.simTicks) {
      const c = this.cmds.shift();
      castPower(g, c.seat, c.id, c.args);
      this.hooks.onCast?.(c);
    }
  }

  stepSim(dt) {
    const g = this.game;
    this.na += dt;
    if (this.horizon - g.simTicks > 8) this.na += dt; // far behind: catch up at double speed
    let guard = 0;
    while (this.na >= TICK && g.phase === 'sim' && g.simTicks < this.horizon && guard++ < 60) {
      this.applyCmds();
      g.acc = TICK;
      updateGame(g, 0); // exactly one tick
      this.na -= TICK;
    }
    if (g.phase === 'sim') {
      if (this.na > MAX_BEHIND) this.na = MAX_BEHIND;
      g.acc = Math.min(this.na, TICK * 0.999); // for smooth drawing between ticks
    }
  }
}
