# Tiny Gods: full audit prompt

Paste everything below the line into a fresh Claude Code session opened in the `tiny-gods` folder.

---

You are a senior game designer, QA lead, UI/UX designer and gameplay engineer. Audit my game **Tiny Gods** end to end: test it, try to break it, and give me a ranked list of improvements and suggestions covering mechanics, balance, UI/UX, visuals, sound, performance, code and onboarding. Do not stop at "it works". I want what would make it better, more fun, clearer and more polished.

## 0. What the game is (read first, do not skip)

Tiny Gods is a browser game (Vite + Pixi.js 8, plain JS modules) about a town of 60 tiny villagers split into 4 factions (Embers/red, Tides/blue, Sprouts/green, plus a yellow faction) and neutrals. Each player is a hidden "god" leading one faction. Each turn has a dawn phase (secretly give orders and play cards: Hate, Love, Fear, Protect, Avoid, Follow, Arm up, Festival, Accuse, Praise, Assault, Hunt, and so on), then a sim phase where villagers act on those orders on their own with personalities, bonds, rumors, turncoats, weapons and tension. A recap, highlights with replays, a "guess who caused it" phase and a final "The Truth" reveal follow. The last faction standing wins. Recent additions are god powers (14 tiles, lightning, heal, time bomb, gust, earthquake, rain and others), a card hand, typed natural-language commands, a pick-an-order menu with strength dials, a two-day peace period, 3 influence per turn, and a dismissable results overlay.

Start by reading `DECISIONS.md`, `TESTING.md` and `package.json`, then skim `src/sim/` (turn.js, orders.js, cards.js, powers.js, parser.js, brain.js, combat.js, win.js), `src/bots/`, `src/config/tunables.js`, `src/render/ui/` and `tools/`. Use that to know the intended design before you judge it. Flag anywhere the code, the docs and the behaviour disagree.

## 1. Rules of engagement

- Run: `npm install`, `npm run build`, `npm run smoke`, `node tools/parse-test.js`, `node tools/effects-test.js`, `node tools/simulate.js --matches 200 --bots mixed --seed 1` (also `warmonger`, `pacifist`, `opportunist`, `chaos`), `node tools/card-value.js`, `node tools/ai-health.js`. The card-value run was slow earlier, so run it in the background.
- Start the dev server with `npm run dev` and test in the built-in browser at desktop size and at phone width (375x812) and tablet (768x1024). Take screenshots as evidence. Read the console for errors and warnings.
- **Do not change game code in this pass.** This is an audit. Write findings only, in a new file `AUDIT-REPORT.md` in the project folder. If you find a crash-level bug, report it first in the summary.
- Be concrete. Every finding needs: where (file/screen), what you saw, why it matters, and a specific fix. No vague advice such as "improve the UI".
- Separate **verified** (you saw it or measured it) from **suspected** (read in code, not reproduced). Never present a guess as a fact.
- Play like three different people: a first-time player who has not read anything, a competitive player hunting for exploits, and a casual friend on a phone in pass-and-play.

## 2. Functional testing

Go through every checklist in `TESTING.md` (M0 to M3, personalities, bigger town, presentation pass, review pass, cards/miracles/typing) and mark each item pass, fail or untestable with a note. Then test these areas specifically:

1. **Turn flow:** timers, pause, speed x1/x2/x4, skipping cutscenes, passing a turn, submitting early, timer running out mid-selection, what happens when you refresh mid-match (is state lost? is that acceptable?).
2. **Orders:** every verb with every legal target; illegal combinations; max 2 orders per turn; influence cost and affordability; the Hate cooldown removal; "tired" Love/Fear; order removal; strength dial; Assault and Hunt (including place-targeted Assault, which engaged villagers but killed nobody in 25 s earlier).
3. **Cards and powers:** play every card and every one of the 14 powers. Check cost, targeting, cooldown/income (3 influence per turn, carry cap, comeback bonus), whether the effect is visible and readable, and whether the recap "What your moves did" reports it truthfully. Known concern: the Time Bomb detonated on schedule but killed nobody in the headless test.
4. **Peace period:** first two days lock fighting, Assault, Hunt, bombs and miracles. Confirm nothing leaks through (typed commands, cards, bots, rumors, festivals). Confirm the UI explains the lock clearly.
5. **Typing parser:** try 40+ sentences: valid, misspelt, slangy, multi-clause ("send three villagers to the armory and scare the Tides"), strength words ("scare the tides strength 1"), numbers as words and digits, unknown targets, empty input, very long input, emoji, mixed case, commands in the wrong phase. Check suggestions, error messages and partial-parse behaviour.
6. **Pass-and-play (2, 3, 4 humans):** privacy between players, per-player timers, ghost players after elimination, end screen naming the winner, any information leaks (hover cards, top bar, gold ring, replays).
7. **Bots:** do all four personalities behave differently and sensibly? Do bots cheat (read your hidden orders)? Do they use powers and cards well, or spam them?
8. **Win conditions and edge cases:** last faction standing, simultaneous wipe-out, turn-20 safety limit, human eliminated early, all humans eliminated, a faction reduced to one villager, turncoats flipping a faction's last member, bond partners on opposite factions.
9. **Replay and recap:** replays restore the exact state afterwards; highlights are the right highlights; guess phase scoring and the +1 influence reward; results overlay close and reopen.
10. **Determinism:** the same `?seed=` must give the same start and, with the same inputs, the same match. Test it. Any desync between sim and render?
11. **Robustness:** rapid double clicks, spamming buttons, resizing mid-animation, switching browser tabs during a match (timers, audio), muting, toggling blood and cutscenes mid-match, 20+ matches in a row for memory growth.

## 3. Balance and mechanics analysis

Use the headless tools to get numbers, not opinions. Report win rate per bot personality and per faction colour, average match length in turns and minutes, deaths per turn, time to first kill, how often a match stalls, how often the leader snowballs, and how often the human seat wins when passive. Earlier runs showed warmonger bots winning roughly 35 to 41% against 25 to 27% for pacifists, and matches running long. Dig into that:

- Is aggression simply the dominant strategy? What makes pacifism, diplomacy, love, rumors and sabotage viable ways to win?
- Which cards and powers are over- or under-powered? Rank all cards and 14 powers by measured value (use `tools/card-value.js`). Name the net-negative ones and propose numbers to fix them.
- Is the influence economy right (3 per turn, carry cap, comeback bonus)? Are there dominant openings? Is there anything a player should do every single turn?
- Comeback and anti-snowball mechanics: does a losing faction have a path back? Is there kingmaking in pass-and-play, and can a dying player ruin the game for others?
- Does the hidden-information hook actually work? Can players deduce who ordered what? Is the guessing phase worth the time it takes? Is it fun when you are wrong?
- Pacing: the target is a 12 to 16 minute match. Where does it drag? Where is nothing happening for 30+ seconds? Is the endgame (war fever, storm closing in) satisfying?
- Randomness vs agency: how much of a result is luck versus the player's decisions? Is it clear to the player why they won or lost?
- Suggest **new mechanics** worth adding (see section 6) and cut mechanics that add complexity but little fun.

## 4. UI and UX review

Review every screen: main menu, how-to-play, goal box, command panel (menu-open-by-default, quick-command bar, influence pips), pick-an-order menu, card hand, power bar, type box, top bar, tension meter, faction chips, hover card, news board, Tiny News broadcast, recap panel, guess phase, results overlay, end screen, pass screen, ghost panel, settings.

For each screen check:

- **First-time clarity:** within 30 seconds, can a new player say what the goal is, what to do now and what just happened? Time yourself. List every point of confusion.
- **Information hierarchy:** what is the most important thing on screen, and is it the most visible? Is anything buried (peace-period status, influence left, which orders are staged, whose turn it is)?
- **Discoverability:** are typing, cards, powers and orders explained or just present? Too many ways to do the same thing (menu, quick bar, typing, cards, power bar)? Recommend what to merge or hide.
- **Consistency:** category colours, icons, terminology (order vs command vs power vs card vs miracle), button styles, spacing, capitalisation.
- **Feedback:** does every click, invalid action, disabled button and cost change give immediate, understandable feedback? Are disabled buttons explained?
- **Readability:** font sizes, contrast ratios, text over busy backgrounds, overlap (the typing icon overlapping text was fixed once; check for similar), truncation, tiny tap targets.
- **Responsive and touch:** 375, 768, 1280, 1920 widths; landscape and portrait; tap target size (44 px minimum); no horizontal scroll; panels not covering the action; on-screen keyboard pushing the typing box.
- **Accessibility:** colour-blind safety (faction colours also have marks, verify they are enough), keyboard navigation, focus states, screen-reader labels, reduced-motion option, flashing or shaking effects, sound-off playability, text size options.
- **Flow and friction:** number of clicks to issue a typical order; dead time between phases; cutscenes that cannot be skipped fast enough; modals that block the town; repeated explanations.
- **Mobile pass-and-play ergonomics:** is it truly playable passing a phone around the table?

## 5. Visual, animation, audio and performance review

- **Look and feel:** is the art style coherent (hand-drawn brawl reference vs current characters)? Are villagers distinguishable at a glance in a crowd of 60? Do faction colours and marks hold up in a big fight? Are weapons, blood and effects readable or noisy?
- **Camera and direction:** zoom-in cuts, slow-mo, spotlight, letterbox, News broadcast. Do they enhance or slow the game? Any camera clipping, jitter, or stuck zoom?
- **Effects for new powers:** explosions, bombs, rain/fog (earlier a draw-order bug), gust, earthquake, lightning. Are they juicy, readable and consistent?
- **Animation polish:** idle variety, transitions between states, pop-in of UI, easing, anticipation and impact frames, hit-stop, screen shake balance.
- **Audio:** mix balance, repetition fatigue, tension music transitions, positional audio, one-shot overlap, autoplay unlocking, mute persistence, anything harsh or too loud.
- **Performance:** measure FPS on an integrated-graphics laptop during a big fight (the target is a steady 60), frame-time spikes, particle cap, memory growth over a long match, load time, bundle size (`npm run build` output), mobile CPU. Profile and name the top 3 hotspots.
- **Bugs visible on screen:** z-order problems, villagers stuck in corners or walls, overlapping labels, bubbles piling up, tombstones in odd places, flicker, anything that looks wrong.

## 6. Improvement and idea backlog

Produce generous lists. Aim for at least 10 per category, each with a one-line why and a rough effort tag (S / M / L):

- **Mechanical suggestions:** new orders, cards, powers, win paths, factions asymmetry (unique faction abilities), events (plague, festival, thief, comet), alliances and betrayal, secret objectives per god, a shared-town resource or building system, difficulty levels, handicaps, scoring beyond last-faction-standing, a short 5-minute mode and a long campaign mode.
- **Balance and economy tweaks:** exact tunables to change and to what value.
- **UI suggestions:** layout changes, simplification, new screens, tooltips, tutorials, a proper interactive first-match tutorial, an undo button, an order history log, a "why did that happen" explainer.
- **Visual and animation suggestions.**
- **Sound and music suggestions.**
- **Social and replayability:** online play, shareable match summaries and replay links, daily town, achievements, stats, unlockables, seasonal themes, spectator mode, bot difficulty and bot names or personalities.
- **Quality of life:** settings, saving and resuming, keyboard shortcuts, speed controls, auto-pause when the tab loses focus, language support.
- **Technical and code health:** structure, dead code (for example the legacy `hintFor` map in `powerBar.js`), duplicated logic, magic numbers that belong in `tunables.js`, missing tests, build and deploy setup, error handling, save-state versioning.
- **Launch readiness:** a store or itch.io page, trailer moments to capture, a name and logo check, legal basics, analytics, feedback form.

## 7. Required output: `AUDIT-REPORT.md`

Structure it exactly like this:

1. **Verdict:** 5 to 8 lines. Is the game fun? What is the single biggest problem and the single biggest opportunity?
2. **Scorecard:** rate 1 to 10 with one line each: core loop, depth/strategy, balance, clarity/onboarding, UI, visuals, animation, audio, performance, stability, replayability, mobile.
3. **Bugs:** table with ID, severity (Blocker / Major / Minor / Cosmetic), steps to reproduce, expected vs actual, suspected file, verified or suspected.
4. **Balance data:** the tables from your simulation runs plus your reading of them.
5. **Test results:** the `TESTING.md` checklist with pass/fail/untestable marks.
6. **Top 10 fixes to do first:** ranked by impact over effort, each with a concrete implementation note. This list is the most important part.
7. **Full backlog:** the lists from section 6, grouped and tagged by effort.
8. **Screenshots:** a folder `audit-screens/` plus references in the report for every UI or visual finding.
9. **Open questions for me:** design decisions only I can make, each with your recommendation.

Finish by giving me a 10-line summary in chat and the path to the report. Do not make code changes until I pick which fixes to go ahead with.
