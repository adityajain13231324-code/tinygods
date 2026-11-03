# Tiny Gods

*Secretly nudge a peaceful town into war, then argue about whose fault it was.*

A browser game for 1-4 players (bots fill empty seats). You secretly lead one faction of 12
villagers in a town of 60. Each turn you give up to two secret orders; the villagers then act
on their own (arguing, scuffling, fighting, dancing, falling in love, spreading rumors, changing
sides). The last faction with a living villager wins. Afterwards you guess whose order caused
the worst moments, and "The Truth" shows everything.

## Play

```bash
npm install
npm run dev        # open the printed address
```

Menu: **Play vs bots**, **Pass and play** (2-4 friends on one device, with a "pass the device"
screen between players), **Daily town** (same town for everyone today), **How to play**.
Online rooms are not built yet.

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
| `node tools/simulate.js --matches 500 --bots mixed --seed 1` | balance report over many bot-only matches |
| `node tools/ai-health.js 12` | villager AI health: flip-flopping and stuck villagers |
| `node tools/strategies.js 120` | does one fixed strategy dominate? |

All balance numbers live in `src/config/tunables.js`. Design notes: `DECISIONS.md`.
Manual test checklists: `TESTING.md`. Credits: `CREDITS.md`.

## Layout

`src/sim` is the whole game with no rendering (runs in Node). `src/render` draws it with PixiJS
plus DOM panels. `src/bots` are the AI players. `src/audio` is synthesised sound.
