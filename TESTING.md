# Current checks

Run `npm ci`, then `npm run check`. For separate saved outputs run `node tools/verify.js ../Tiny-Gods-Fix-Verification/logs/final`.

The suite includes exact replay restoration and future outcomes, malformed local/network input, reciprocal Love bonds, Sickness bounds/ties, blast provenance, historical faction labels, full RNG/state diagnostics, Stand Down, legal-hand card trials, all original order/power/card effects, delayed multiplayer with mixed replays and dropouts, fuzzing and a production build. Failures exit nonzero.

Browser journeys and screenshots are saved beside the game in Tiny-Gods-Fix-Verification. The local scripts document when simulation was accelerated through rendered frame calls. Real WebRTC tests use isolated browser contexts; this is still one computer/network.

## Owner playtest

- Start solo at each difficulty, pass and play, Daily town, and a room across two physical devices. Finish a match and inspect The Truth, sharing and rematch.
- On a phone, open/close the planning sheet, type a draft, choose a card target, change strength, submit, and cast point/villager miracles. Verify the town remains visible, scrolling stays inside the sheet, and touch zoom/pan feel comfortable in portrait and landscape.
- Select 30/45/60/90 seconds. In hotseat, each player receives that time after acknowledging the pass screen. Check timeout auto-submission with a valid unfinished sentence and a partially built menu order.
- Open How to play, Settings, Pass and play, Online and Villagers with keyboard. Tab/Shift+Tab stay in the dialog. Escape/Back restore focus. Check a screen reader's reading order and labels.
- Toggle cutscenes, calm view, blood, sound and frame rate. Listen on speakers/headphones; check mute persistence and comfortable levels.
- Watch, switch and interrupt replays. Try submitting and aiming while a news board/camera cut is active. Reload with blocked storage, change resolution and rotate the device.
- Test guest dropout, host closure, rematch, long-hidden host tab, strict networks and network interruption. A host is trusted and owns the room clock. No relay server is configured for networks that block direct peer connections.
- Play several strategies over many towns. Aggressive and defensive bot policies have different strengths; small simulated samples do not certify human balance or fun.

Earlier milestone checklists are preserved under docs/history and contain obsolete rules. They are not the current acceptance contract.
