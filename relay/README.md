# Tiny Gods turn relay

A tiny WebSocket hub that carries online rooms for every network, so players never need WebRTC or a TURN server.
The host's browser is still the authority; the relay only forwards messages and never reads them.

Why: the free `openrelay.metered.ca` TURN service the game used before no longer resolves (checked 10 Nov 2026 with
`node tools/turn-probe.mjs`), so strict school/office/mobile networks could not connect.

## Run it locally
    cd relay && npm install && npm start        # ws://localhost:8787, health at http://localhost:8787/health
    # in the game folder:  http://localhost:5173/?relay=ws://localhost:8787

## Deploy (Render, free plan, same as sound-doodles)
1. Render dashboard -> New -> Blueprint -> pick the tinygods repo (it reads `render.yaml`, root dir `relay`).
2. When it is live, copy its address, e.g. `https://tiny-gods-relay.onrender.com`.
3. Vercel -> tinygods project -> Settings -> Environment Variables:
   `VITE_RELAY_URL = wss://tiny-gods-relay.onrender.com` (Production + Preview), then redeploy.
4. Check: open https://tiny-gods-relay.onrender.com/health -> `{"ok":true,...}`.

The free plan sleeps after ~15 minutes idle; the game pings `/health` first and waits up to a minute for it to wake,
so the first room of the day is slow, the rest are instant. The live address is the default in `src/net/transport.js`; `VITE_RELAY_URL` overrides it and `?relay=off` forces direct WebRTC.

## Limits
Rooms live until the host leaves (3 h max). 64 KB per message, 80 messages per second per socket, 6 guests per room.
