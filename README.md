# Tiny Gods

*Secretly nudge a peaceful town into war, then argue about whose fault it was.*

A browser game for 1-4 players (bots fill empty seats). You secretly lead one faction of 12
villagers in a town of 60. Each turn you give up to three secret orders and one free card; the villagers then act
on their own (arguing, scuffling, fighting, dancing, falling in love, spreading rumors, changing
sides). The last faction with a living villager wins. A 20-turn safety limit uses survivors and rival kills, then health and a seeded tie break. News and replays separate each day. At the end, "The Truth" shows everyone's actions. There is no guessing phase in the current game.

## Play

```bash
npm ci
npm run dev        # open the printed address
```

Menu: **Play vs bots**, **Pass and play** (2-4 friends on one device, with a "pass the device"
screen between players), **Daily town** (same town for everyone today), **How to play**.
On a phone, open **Plan orders** to prepare your turn, then **View town** to close the sheet. Submission stays visible. **Villagers** offers the public hover information by keyboard or touch. **Controls** contains audio, pause, cutscenes and graphics controls.

Days 1 and 2 are peaceful. Violent orders, Kidnap and non-damaging-area miracles unlock on day 3. Fireball, Lightning, Earthquake and Time Bomb unlock on day 5. Before day 4, tension reacts 25% less strongly and background tension rises more slowly. The normal tension curve resumes on day 4. The final faction receives a faction-colored victory banner and a short confetti celebration, with reduced-motion support. Menu defaults are 45 seconds for orders, 45 seconds for the town, and 20 seconds for news. Pass and play gives each player their selected order time. Online clocks are chosen by the host.

Easy bots receive 1 less influence per dawn and hesitate more. Normal adds no influence bonus. Hard bots receive 2 extra influence per dawn, add an affordable arming order, and use cards and powers more often. Bot personalities are distinct strategies with different measured win rates, not equivalent skill levels.
**Play online**: one player creates a room and shares the 5-letter code (or the invite link); up to 4 people join from their own devices, bots fill empty seats. No game server is needed: browsers connect to each other (WebRTC via the free PeerJS broker), and the host's browser runs the room. If the host closes the tab the match ends. `npm run net-test` checks that every browser stays in sync.

## Deploy (free)

```bash
npm run build      # outputs ./dist, a plain static site
```

Upload `dist/` to GitHub Pages, Netlify or Cloudflare Pages. It uses relative paths, so it also
works from a sub-folder.

## Tools

| Command | What it does |
|---|---|
| `npm run smoke` | headless sim sanity check (no browser) |
| `npm test` | integrity, protocol, provenance, public-information and benchmark regressions |
| `npm run check` | all regression/behavior checks, delayed network matches, fuzz and production build |
| `node tools/simulate.js --matches 500 --bots mixed --seed 1` | balance report over many bot-only matches |
| `node tools/ai-health.js 12` | villager AI health: flip-flopping and stuck villagers |
| `node tools/strategies.js 120` | does one fixed strategy dominate? |
| `node tools/card-value.js 80 rally,bomb` | paired real-hand trials against a zero-card test-seat baseline |
| `node tools/balance-study.js 80` | 320 matches with four seat rotations and raw results |

All balance numbers live in `src/config/tunables.js`. Design notes: `DECISIONS.md`.
Manual test checklists: `TESTING.md`. Credits: `CREDITS.md`.
Earlier audit and design notes contain historical rules and benchmark claims. See `FIX-NOTES.md` for the current repair scope and measurement limits.

## Layout

`src/sim` is the whole game with no rendering (runs in Node). `src/render` draws it with PixiJS
plus DOM panels. `src/bots` are the AI players. `src/audio` is synthesised sound.
