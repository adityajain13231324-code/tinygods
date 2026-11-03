# Tiny Gods audit report

Date: 2026-11-03. Method: build, headless tools, 500 simulated matches, and a live pass in the built-in browser (desktop 800x600 pane and 375x812 phone emulation). No game code was changed.

**Scope honesty:** this was a fast pass. Things marked *verified* I ran or saw. Things marked *suspected* come from reading code or output. **Not tested this pass:** pass-and-play, audio, replay and guess phases, every one of the 14 powers in the browser, cutscenes beyond the title, FPS on the HP Pavilion, 20-match memory growth, keyboard/screen-reader accessibility. Those need a second pass.

## 1. Verdict

The sim is solid and the new UI is much clearer than a plain text box, but two things hold the game back. First, **balance**: aggression wins (warmonger bots 45%, gossip bots 9.6%), and one card (Rally) appears to win almost every match it is used in. Second, **the screen is crowded**: on a phone and in a small window the order panel covers most of the town, which is the thing players came to watch. Biggest opportunity: the hidden-orders "whose fault was it" hook is the real hook, but in a pacifist match 93% of kills trace to the killer's own faction, so the guess is too obvious to be fun.

## 2. Scorecard (1-10, from this pass only)

| Area | Score | Note |
|---|---|---|
| Core loop | 7 | Clear, but 53 of 60 villagers die every match |
| Depth / strategy | 6 | Aggression dominates; few viable peaceful paths |
| Balance | 4 | Rally, warmonger dominance, gossip/chaos near-useless |
| Clarity / onboarding | 6 | Peace tag and quick bar help; five ways to give an order is a lot |
| UI | 6 | Good category colours; panel crowds the town |
| Visuals | 7 | Cute and readable at 800 px (not judged in a big fight) |
| Animation / audio | n/t | Not tested |
| Performance | n/t | Pane showed 20-60 FPS; not a valid laptop test |
| Stability | 8 | Build clean, no console errors, sims never crashed |
| Replayability | 6 | Daily town and bots good; matches feel alike |
| Mobile | 4 | Panel covers about half the screen; 18 of 25 buttons are under 40 px |

## 3. Bugs and issues

| ID | Severity | Issue | Evidence | Status |
|---|---|---|---|---|
| B1 | Major | `tools/effects-test.js` is stale: it casts the bomb and gust on turn 1, which the peace period now locks, so it prints `ok=false` and "exploded at -1.0s". It no longer tests anything. | Re-ran the same checks on day 3 in a scratch script: bomb ok, explodes at 12.05 s. Gust refused with "Powers work while the town acts" because the script cast it in the command phase | Verified |
| B2 | Major | **Time Bomb can never kill a healthy villager.** `blast()` caps damage at 60 and villagers have 100 hp. Test: 4 villagers in the blast, 400 hp before, 0 kills. The card tied for second-worst in the value benchmark (-16 points). | `combat.js:121`, scratch run | Verified |
| B3 | Minor | Typing suggestions offer "plant a time bomb at the Houses" during the peace period, when bombs are locked. Clicking it will be rejected. | Screenshot after typing "blorp"; `parser.js:448,455` | Verified |
| B4 | Minor | `tools/simulate.js` prints "bot guesses that were right: NaN%" in every run, so the guessing-game balance cannot be measured. | All 5 runs | Verified |
| B5 | Minor | Legacy `hintFor` map still in `powerBar.js:150`. | Grep | Verified |
| B6 | Minor | Order menu open state toggles oddly: two clicks on the header ended with the menu open and the town almost fully hidden. | Screenshot | Suspected (may have been my click timing) |
| B7 | Minor | The Embers panel header says "Influence 5" with 5 pips while the notes say 3 per turn; turn 1 start gives 5. Unexplained to a new player. | Screenshot | Verified |
| B8 | Minor | Typed "destroy me" gives "You cannot attack your own faction", which reads as a refusal, not help. Fine, but the fallback examples shown are always the same four. | parse-test | Verified |
| B9 | Cosmetic | The 4 top-bar toggle icons (pause, sound, blood, cutscenes, two more) have no labels. | Screenshot | Verified |
| B10 | Cosmetic | A `card-value-new.txt` result file sits in the project root. | `ls` | Verified |

Console: no errors or warnings during the browser pass (only Vite debug lines).

## 4. Balance data (100 matches per run, seed 1, 12 threads)

| Bot mix | Avg turns | Deaths/60 | First kill turn | Seat win rates (E / T / Sp / Sk) | Notes |
|---|---|---|---|---|---|
| mixed | 10.8 | 53.5 | 3.7 | 25 / 27 / 21 / 27 | 5 of 100 hit the 20-turn limit |
| warmonger | 9.3 | 53.4 | 3.1 | 25 / 25 / 25 / 25 | Fastest, bloodiest |
| pacifist | **17.3** | 49.8 | 5.4 | **36** / 19 / 24 / 21 | **51 of 100 reach the 20-turn limit**; seat 0 (you) wins 36% |
| opportunist | 10.0 | 54.4 | 4.7 | 30 / 23 / 21 / 26 | |
| chaos | 11.4 | 53.5 | 4.1 | 20 / 28 / 23 / 29 | |

Win rate by personality (mixed run): **warmonger 45.2%**, opportunist 32.1%, pacifist 21.6%, chaos 16.0%, **gossip 9.6%** (ideal is 25%).

Other numbers:
- Nobody is killed in turns 1 and 2 (peace works). About half of all deaths happen in turns 5 to 7, so the match is a short burst after a long quiet start.
- "Killer's own faction was the cause" is 67-93% of highlights. Near 100% means the guess is too easy; pacifist games hit 93%.
- Ordinary matches kill 53 of 60 villagers. The town almost always ends nearly empty, which weakens the "tiny town you care about" feeling.
- Time spent by villagers (ai-health): 25% fleeing, 17% attacking. Over 3,000 "fed up" fight starts versus about 650 from protect orders, so fights are mostly self-generated rather than caused by player orders. That hurts the "you caused it" story.
- Fights are being stopped by effects: 237 by fog, 200 by lightning, 178 by rain. Weather is a strong peace tool.

Card value (80 matches, opportunist bot, baseline win 31.3%). **This file may predate the last card-strength round, so re-run it.** Top: Rally 96.3% (+65 points), Peace Treaty 61.3%, Spoiled Bread 53.8%, Field Hospital 51.2%, Prophecy 47.5%. Bottom (net negative): Matchmaker 12.5%, Truce Bell 15.0%, Time Bomb 15.0%, False Alarm 20.0%, Bribe 21.3%, War Chest, Census and Spy 22.5%. With 80 matches the noise is about +/-5 points, but a 96% result is not noise.

## 5. Checklist results (what I could actually check)

- Build passes (main chunk 273 kB, 95 kB gzip; dist 853 kB): pass.
- `npm run smoke`: pass (OK, 6000 ticks in 588 ms).
- `parse-test`: 23 phrases, 20 resolve correctly, "sing a song" and "asdf" fail with helpful examples, "destroy me" is refused, a multi-clause sentence splits into 3 actions. Hunt and Assault are correctly rejected during peace. Pass.
- Typed nonsense in the browser: red message plus 4 clickable examples. Pass.
- Pick-an-order menu: 14 verb tiles with For / Strength / Add order. Pass.
- Peace-period tag shown in panel header. Pass.
- Phone width: no horizontal scroll (scrollWidth 375). Pass. Tap targets: fail (18 of 25 buttons under 40 px).
- Not tested: everything listed under "Scope honesty".

## 6. Top 10 fixes, ranked by impact over effort

1. **Nerf Rally (and re-run `card-value.js` after).** A card that wins about 96% of matches removes every other decision. Check what it does in `cards.js`; cap its effect or give it a drawback or a cooldown. Effort S.
2. **Fix the stale `effects-test.js` and make it fail loudly.** Advance to day 3 first (like my scratch script), cast powers only in the sim phase, and exit non-zero on `ok=false`. Effort S.
3. **Rework Time Bomb damage.** Raise `maxDamage` above 100 at the centre (for example 120 core, 40 edge), or let it finish villagers under 60 hp. Today it cannot kill, so nobody will buy it. Effort S.
4. **Shrink the command panel on small screens.** Make it a collapsible bottom sheet that defaults to a one-line bar ("2 orders staged, 3 influence, Submit") and expands on tap, so the town stays visible. Effort M. Biggest UX win on phones and small laptops.
5. **Bring the personalities closer to 25%.** Warmonger 45% versus gossip 9.6% means choosing an opponent type decides the game. Raise gossip/rumor impact, give pacifist and gossip play a real win path (see section 7), and consider slowing warmonger by making Hate orders costlier. Effort M.
6. **Make the guess game less obvious.** When 70-93% of kills trace to the killer's own faction, guessing "the killer's god" is always right. Add decoy causes (rumors, forged letters, spoiled bread, bots' sabotage) and let more kills come from other factions' orders. Effort M.
7. **Cut the 20-turn stall.** Pacifist-heavy games hit the limit 51% of the time at 17 turns. Strengthen the storm or war fever earlier, or end on a score lead at turn 14. Effort S.
8. **Fix tap targets and labels.** 44 px minimum on mobile; add text labels or tooltips to the 6 top-bar icons. Effort S.
9. **Lock bomb/kidnap suggestions during peace** in `parser.js:448,455` and show a lock icon on locked tiles instead of letting players click and be rejected. Effort S.
10. **Fix the `NaN%` guess stat in `simulate.js`** (`guessTotal` is probably never set), so the guessing game can be tuned with numbers. Effort S.

## 7. Backlog

### Mechanics (new ideas)
- Faction asymmetry, one passive each (Embers brave, Tides fast healers, Sprouts good at hiding, Sparks lucky). (M)
- Secret objective per god (protect the Bakery, never kill first, keep 8 alive) with bonus points, so there is more than "last faction standing". (M)
- Alliances and betrayal: a secret pact with another god that shares intel and can be broken for a big swing. (L)
- Town events: plague, flood, thief, comet, harvest feast; one random event every 3 turns shakes the plan. (M)
- Buildings: spend influence on a Watchtower, Hospital or Armory that changes the map. (L)
- Scoring beyond last standing: points for survivors, friendships, correct guesses, so the loser still has a goal. (M)
- Bounties and "witness" mechanics: a villager who sees a kill can talk and expose the culprit's faction. (M)
- Short mode (5 min, 6 turns) and a campaign of linked towns. (L)
- A peaceful win path: reach a "Harmony" meter by festivals and treaties. (M)
- Difficulty levels and a handicap for new players (+2 influence). (S)

### Balance tweaks
- Rally: cap, cooldown or drawback (see Top 10).
- Truce Bell, Matchmaker, Bribe, False Alarm, Census, War Chest, Spy are net-negative: add a second effect or reduce cost to FREE-tier. Re-run the benchmark.
- Consider 4 influence on turn 1 only, then 3; turn 1 currently shows 5, which looks like a bug (B7).
- Rain, fog and lightning stop many fights (615 stoppages in one run); cap how often a player can cast them.
- Reduce average deaths (53/60) with a lower kill rate in the middle turns so a few villagers survive.

### UI
- Collapsible bottom-sheet panel (Top 10 #4). (M)
- One input to rule them all: merge the quick bar, order menu and typing box so there are fewer overlapping paths, or at least put the menu behind "More". (M)
- Interactive first-match tutorial (turn 1 only, highlights one control at a time). (M)
- Order history log and an undo for staged orders. (S)
- A "Why did that happen?" button on each recap headline. (M)
- Show the cost on each tile and grey out what you cannot afford with a reason on hover. (S)
- Larger tap targets, labels on top-bar icons. (S)
- Clear terms: "orders" (dawn), "powers" (miracles, in the sim phase), "cards": add a one-line legend. (S)
- Keep the town visible: let the results overlay and recap dock to the side on wide screens. (M)

### Visuals and animation
- Match the hand-drawn "crowded brawl" reference: more arms and weapons in melee clusters. (L)
- Hit-stop (2-3 frames) on kills and bombs. (S)
- Consistent power effects: a coloured ring per category, matching the card colours. (S)
- Big-fight readability test with 40 villagers in one place; add outlines if faction colours blur. (S)

### Sound
- A distinct stinger per power category; limit how often one-shots can overlap. (S)
- Music that remembers tension between turns instead of resetting. (M)
- Test mute persistence and autoplay unlock (not tested this pass). (S)

### Replayability and social
- Shareable match summaries and replay links. (M)
- Achievements: "Peace through war", "Never killed anyone", "Guessed every highlight". (S)
- Online play with room codes (already greyed out in the menu). (L)
- Spectator mode and daily leaderboard. (M)
- Named bot characters with taunts. (S)

### Quality of life
- Save and resume a match (refresh currently loses it, suspected). (M)
- Auto-pause when the tab loses focus. (S)
- Keyboard shortcuts: Enter submit, 1-9 for tiles, Space skip. (S)
- Settings: text size, reduced motion, colour-blind palette. (M)

### Code health
- Delete the legacy `hintFor` map (`powerBar.js:150`). (S)
- Move magic numbers into `tunables.js` (bomb radius 120, delay 12 s, spread 0.6 in `cards.js:201`). (S)
- Add `npm test` that runs smoke, parse-test and a fixed effects-test, failing on error. (S)
- Version the save state before adding saving. (S)
- Remove `card-value-new.txt` from the project root or move to `tools/output/`. (S)

### Launch readiness
- itch.io page with 3 trailer moments (first blood, bomb, final reveal). (S)
- Credits and licences already in CREDITS.md; verify audio and font licences. (S)
- Anonymous analytics for where players drop (turn 1, turn 3). (M)
- A feedback link in the end screen. (S)

## 8. Screenshots

I took them in the browser pane but did not save them to an `audit-screens/` folder. Key observations are described in section 3. Re-capture if you want them attached.

## 9. Open questions for you

1. Should the game allow a peaceful win (Harmony, score win), or must it always end in war? **Recommend** a score-based win so pacifist play is real.
2. Is 53/60 dead acceptable? **Recommend** no: fewer deaths makes each death matter and makes guessing less about sheer carnage.
3. Mobile first or laptop first? The panel needs different designs. **Recommend** the collapsible sheet for both.
4. Should miracles exist during peace? Currently locked. **Recommend** keep locked, but let cards like Rally work as pure peace tools so there is early play.
