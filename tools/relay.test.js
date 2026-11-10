import test from 'node:test';
import assert from 'node:assert/strict';
import { createRelay } from '../relay/server.js';
import { hostRoom, joinRoom } from '../src/net/room.js';

// Real rooms (lobby, colours, start, lockstep messages, leaving) over the real relay server on a local port.
const until = (fn, ms = 5000) => new Promise((resolve, reject) => {
  const t0 = Date.now();
  const tick = () => { let v; try { v = fn(); } catch { /* not yet */ } if (v) resolve(v); else if (Date.now() - t0 > ms) reject(new Error('timed out waiting: ' + fn)); else setTimeout(tick, 15); };
  tick();
});
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

test('rooms over the relay: lobby, colours, start, messages both ways, leaving', async () => {
  const relay = await createRelay({ port: 0, host: '127.0.0.1' });
  globalThis.TG_RELAY_URL = `ws://127.0.0.1:${relay.port}`;
  const closers = [];
  try {
    let hostView = null;
    const host = hostRoom({ name: 'Hosty', seat: 1, onChange: (players, code, settings) => { hostView = { players, code, settings }; }, onError: (e) => assert.fail(e) });
    closers.push(() => host.close());
    await until(() => hostView?.code);
    const code = hostView.code;
    assert.match(code, /^[A-Z2-9]{5}$/);

    let g1Lobby = null, g1Start = null, g1Closed = null;
    const g1 = joinRoom({ code, name: 'Ann', seat: 1, onLobby: (p, s) => { g1Lobby = { p, s }; }, onStart: (m) => { g1Start = m; }, onError: (e) => assert.fail(e), onClose: (started) => { g1Closed = started; } });
    closers.push(() => g1.close());
    await until(() => g1Lobby && hostView.players.length === 2);
    assert.notEqual(hostView.players[1].seat, 1, 'a guest asking for the host\'s colour gets a different one');

    let g2Lobby = null, g2Closed = null;
    const g2 = joinRoom({ code, name: 'Bo', seat: 3, onLobby: (p) => { g2Lobby = p; }, onStart: () => {}, onError: (e) => assert.fail(e), onClose: (s) => { g2Closed = s; } });
    closers.push(() => g2.close());
    await until(() => g2Lobby && hostView.players.length === 3);
    assert.equal(g2Lobby.find((p) => p.name === 'Bo').seat, 3);

    g1.pick(3); // taken by Bo: refused, the real state comes back
    await wait(150);
    assert.notEqual(hostView.players.find((p) => p.name === 'Ann').seat, 3);
    host.setSettings({ layout: 'canal', mode: 'armed', orderSecs: 60 });
    await until(() => g1Lobby.s.layout === 'canal' && g1Lobby.s.mode === 'armed');

    const info = host.start();
    await until(() => g1Start);
    assert.equal(g1Start.seed, info.seed);
    assert.deepEqual(g1Start.names, info.names);
    assert.equal(g1Start.layout, 'canal');

    // lockstep traffic both ways
    const seenByHost = [], seenByG1 = [], seenByG2 = [];
    host.attach({ onMessage: (seat, msg) => seenByHost.push([seat, msg.t]), playerLeft: (seat) => seenByHost.push(['left', seat]) });
    g1.attach({ onMessage: (_, msg) => seenByG1.push(msg.t) });
    g2.attach({ onMessage: (_, msg) => seenByG2.push(msg.t) });
    host.onGuestLeft = () => {};
    g1.send({ t: 'orders', n: 1 });
    g2.send({ t: 'orders', n: 2 });
    host.broadcast({ t: 'go', turn: 1 });
    await until(() => seenByHost.length >= 2 && seenByG1.length && seenByG2.length);
    assert.deepEqual(seenByG1, ['go']);
    assert.deepEqual(seenByG2, ['go']);
    const annSeat = hostView.players.find((p) => p.name === 'Ann').seat;
    assert.ok(seenByHost.some(([s, t]) => s === annSeat && t === 'orders'), 'orders arrive tagged with the sender\'s seat');

    g2.close();
    await until(() => seenByHost.some(([k]) => k === 'left'));
    assert.deepEqual(seenByHost.find(([k]) => k === 'left')[1], 3, 'the host learns which seat left');

    host.close();
    await until(() => g1Closed === true);
  } finally {
    closers.forEach((c) => { try { c(); } catch { /* closed */ } });
    delete globalThis.TG_RELAY_URL;
    await relay.close();
  }
});

test('relay: wrong code, full or started rooms, same code reopening and a host that leaves', async () => {
  const relay = await createRelay({ port: 0, host: '127.0.0.1' });
  globalThis.TG_RELAY_URL = `ws://127.0.0.1:${relay.port}`;
  const closers = [];
  try {
    let err = null;
    const lost = joinRoom({ code: 'ZZZZZ', name: 'Lost', seat: 0, onError: (e, kind) => { err = { e, kind }; } });
    closers.push(() => lost.close());
    await until(() => err);
    assert.equal(err.kind, 'peer-unavailable');
    assert.match(err.e, /No room with that code/);

    let view = null;
    const host = hostRoom({ name: 'H', seat: 0, onChange: (p, c) => { view = { p, c }; }, onError: (e) => assert.fail(e) });
    closers.push(() => host.close());
    await until(() => view?.c);
    const code = view.c;
    const guests = [];
    for (let i = 0; i < 3; i++) {
      guests.push(joinRoom({ code, name: 'G' + i, seat: i + 1, onLobby: () => {}, onStart: () => {}, onError: (e) => assert.fail(e) }));
      closers.push(() => guests[i].close());
    }
    await until(() => view.p.length === 4);
    let full = null;
    const late = joinRoom({ code, name: 'Late', seat: 0, onError: (e, k) => { full = k; } });
    closers.push(() => late.close());
    await until(() => full);
    assert.equal(full, 'full');

    // a second host cannot take a live room's code
    let dupErr = null;
    const dup = hostRoom({ name: 'Dup', code, seat: 0, onChange: () => {}, onError: (e) => { dupErr = e; } });
    closers.push(() => dup.close());
    await wait(400);
    assert.equal(relay.rooms.size, 1, 'the live room keeps its code');
    assert.equal(dupErr, null, 'the duplicate keeps retrying quietly instead of stealing it');
    dup.close();

    // started: further joiners are told so
    host.start();
    let started = null;
    // free a slot first so the "started" message (not "full") is what a late guest gets
    guests[2].close();
    await wait(200);
    const again = joinRoom({ code, name: 'Again', seat: 3, onError: (e, k) => { started = { e, k }; } });
    closers.push(() => again.close());
    await until(() => started);
    assert.match(started.e, /already started/);

    // the host leaving ends the room for everybody and frees the code
    let closedFor = 0;
    guests[0].close(); guests[1].close();
    const stay = joinRoom({ code: 'QQQQQ', name: 'x', seat: 0, onError: () => {} });
    stay.close();
    host.close();
    await until(() => relay.rooms.size === 0);
    void closedFor;
  } finally {
    closers.forEach((c) => { try { c(); } catch { /* closed */ } });
    delete globalThis.TG_RELAY_URL;
    await relay.close();
  }
});

test('relay server: rejects junk, oversize and flooding without falling over', async () => {
  const relay = await createRelay({ port: 0, host: '127.0.0.1' });
  try {
    const open = () => new Promise((res, rej) => { const ws = new WebSocket(`ws://127.0.0.1:${relay.port}`); ws.onopen = () => res(ws); ws.onerror = rej; });
    const ws = await open();
    ws.send('not json'); ws.send('{"op":42}'); ws.send(JSON.stringify({ op: 'host', id: 'bad id' }));
    const replies = [];
    ws.onmessage = (e) => replies.push(JSON.parse(e.data));
    await wait(150);
    assert.deepEqual(replies, [{ op: 'error', type: 'invalid-id' }]);
    ws.send(JSON.stringify({ op: 'data', msg: 'x'.repeat(70000) })); // over the size cap: the socket is dropped
    await until(() => ws.readyState === 3);
    const flood = await open();
    let closedCode = null;
    flood.onclose = (e) => { closedCode = e.code; };
    for (let i = 0; i < 200; i++) flood.send('{"op":"ping"}');
    await until(() => closedCode !== null);
    assert.equal(closedCode, 1008);
    const res = await fetch(`http://127.0.0.1:${relay.port}/health`);
    assert.equal((await res.json()).ok, true, 'still healthy afterwards');
  } finally { await relay.close(); }
});
