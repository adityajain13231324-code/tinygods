# Selected ideas: implementation record (9 November 2026)

Branch `new-ideas-implemented`, started from `main` (`dcbadd1`, the merged `fix/critical-evaluation` work). All 17 ideas in `docs/IDEAS.md` are implemented. This file holds the starting status map, the plan, the decision log, the player-facing summary and the verification ledger.

## 1. Starting status (before any code)

| # | Idea | Status | Evidence in the starting code |
|---|---|---|---|
| 1 | Richer ending | partial | `sim/awards.js` had four titles and no replay or evidence link |
| 2 | Combat personality | partial | an aim cue and ammo dots existed; no flee-fire, confident aim or rocket check poses |
| 3 | Personal rivalries | absent | per-villager `grievance` only; nothing remembered who did what, no reactions |
| 4 | Event-aware dialogue | partial | `speech.js` reacted to hp, freeze, last rocket; no events, no repeat guard |
| 5 | Wandering troublemaker | absent | no such character |
| 6 | Conditional orders | absent | orders had no condition; `retreat`/`hide` were plain verbs |
| 7 | Squad formations | absent | only the pair "bonds" and avoid forces |
| 8 | Real cover and destructible props | absent | `effects.breakables` crates were decoration only (the idea says that does not count) |
| 9 | 30% weapon drop on death | partial | `world.weaponDrops` existed for the Rocket Launcher crate only |
| 10 | Blank Rounds card | absent | |
| 11 | Free Cake! card | absent | |
| 12 | Leader card | absent | no max-HP concept (100 was hard-coded in about 12 places) |
| 13 | Power combos | absent | |
| 14 | Environmental chain reactions | absent | |
| 15 | Optional chaos challenges | absent | |
| 16 | Different town layouts | absent | one hard-coded layout |
| 17 | Shareable highlight clips | absent | replay existed, no capture or export |

Dependencies and conflicts found: #16 layouts feed #8 (cover positions), #14 (grass patches) and every renderer; #12 needs a per-villager `maxHp` first; #4 needs the new events from #5, #7, #8, #9, #10, #11, #13, #14; #1 and #17 both need the recorder, which only keeps the last turn.

## 2. Plan and milestones (all done)

1. **M1 simulation rules**: weapon drops, Blank Rounds, Free Cake, Leader, combos, `maxHp`.
2. **M2 world**: layouts with canals and bridges, cover props, fire and goods.
3. **M3 characters and orders**: rivalry memory, troublemaker, formations, conditional orders, challenge modes, typed parsing.
4. **M4 rendering**: terrain, props, fire, cake, drops, combos, poses, crown, event dialogue, sounds.
5. **M5 interface**: setup pickers (solo, pass-and-play, online lobby, settings), formation and fallback builders, previews, Leader and Random Powers UI, log lines, awards with replays, clips, guide steps.
6. **Gates**: tests per rule, extended fuzz and lockstep, real-browser suites, balance study, benchmarks, responsive checks.

## 3. Decision log (rules `IDEAS.md` left open)

All numbers are in `IDEAS` in `src/config/tunables.js`.

- **Weapon drop** (#16): one roll with the simulation's own random stream when a villager with a *working* weapon dies (a gun or launcher with no ammunition is only a club, and an empty launcher never becomes a pickup). 30% chance. The dropped weapon keeps the owner's remaining ammunition, lasts 20 seconds (or until dusk), and goes to the **nearest unarmed villager** within 26 px (ties: lowest id); an armed villager does not swap. At most 10 dropped weapons lie around; the oldest is removed first. The roll and its result are recorded as `weaponDropRoll` either way.
- **Blank Rounds** (#14): the card needs a rival *faction*. The first **3** gunshots (gun and shotgun) of that faction this turn are blanks: ammunition is spent, nobody is hurt, no panic or tension, confetti and "BLANK! (n left)". Rockets are not affected and a blank never reaches the target, so it never uses up an Aegis mirror or rolls a critical. Unlocks on day 3 with the other guns.
- **Free Cake!** (#15): a place card. About half of the idle, curious villagers within 480 px (a fixed per-villager coin, no random numbers used; wildcards likelier, brawlers less) walk over and eat for 5 to 9 seconds, at most 9 per cake, for 18 seconds. Anyone fighting, fleeing, grieving, panicking, carrying someone, or following a movement order is never pulled in. Fights still take priority, so the cake is never an unavoidable ambush.
- **Leader** (#17): implemented as a **power** (3 power, once per faction per match) because the cost is power, not influence. Own faction only. Double maximum health (200), full health, Strength rolled with the existing Strength rules (10 to 50%, until dusk). The 200 HP stays for the match. Recording `game.leaders[seat]` blocks any later cast even if the leader dies or changes side. The tile and tooltip show "once per match"; the villager wears a crown and a longer health bar.
- **Power combos** (#6): *Rain then Lightning*: a bolt struck inside a rain zone (the 9-second wet circle) chains from the strike and anyone it hit to up to 4 more wet villagers within 95 px, 9 damage each, never lethal (like the bolt itself). *Gust and a planted bomb*: Gust moves a bomb within reach 330 px the same way; the fuse keeps ticking. Preview: aiming Lightning outlines wet zones ("WET: Lightning chains here"); aiming Gust outlines bombs. Cues: arcs, "CHAIN ZAP!", "BOMB PUSHED!".
- **Cover** (#8): benches, market stalls, walls, hay, barrels, boulders. A gunshot (gun or shotgun) whose line passes through a standing prop (not at the shooter's feet) is stopped with a chance of `0.55 x cover x 1.4` (stalls and walls most, boulders cannot be destroyed). Shot-at villagers run to a spot behind the nearest suitable prop and leave once nobody armed is near (or after the flee time). Blasts (rocket, fireball, bomb) damage props by distance; a destroyed prop stops blocking and market stalls spill goods. Every cover hit and destruction is an event.
- **Hazards** (#14): up to 3 to 6 dry patches per layout. A blast (rocket, fireball, bomb) or a dry lightning bolt makes a patch **smoulder** for 1.6 seconds (warning ring, smoke, "SMOKE!", no damage), then **burn** for 9 seconds (5 damage every 0.6 s, panic, can spread to a patch within about 1.7 radii every 1.6 s), then become ash. Rain or a Whirlpool puts it out. At most 6 patches burn at once; goods are capped at 14 and last 14 seconds. Everything resets at dusk.
- **Troublemaker** (#5): one seeded neutral per town, acting from day 3: steals the weapon of the nearest armed villager (at most 3 a turn, then runs), starts an accusation rumor every 20 seconds, and dashes through confrontations (shoves the fighters apart and calms them for 1.5 s). Everything is an event naming the troublemaker; stolen weapons are ordinary weapons; the rumor is an ordinary rumor without a seat. No immunity: they can be hurt, scared and killed. Discoverable through a jester cap, the hover card ("guard, recruit or hunt them") and the guide.
- **Rivalries** (#7, #3): each villager remembers up to 6 others (injured, scared, robbed, betrayed, rescued), weakest and oldest forgotten first. Memory lightly changes tempers (x1.3, betrayal x1.5, rescue x0.7). Reactions ("YOU again!") have a 9-second personal cooldown, a 35% chance and a town-wide gap of 0.8 s. Forgiveness: being healed by a Miracle melts one grudge, a medic's care forgives whatever that medic did to the patient, and a Peace Treaty forgives one grudge each way.
- **Conditional orders** (#11): movement orders only (guard, go to, assault, hunt, ambush, escort, festival, scare, shove, seize). Conditions: outnumbered (2+ rivals and at least 1.4 x your people within 230 px), badly hurt (under 45 HP, or a worn-down group), attacked. Fallback: retreat to a place or stand down. **Priority**: panic and being attacked first, then the fallback, then the order. It holds at least 4 seconds and releases after 3 seconds of calm (no flapping). Typed: "guard the armory, retreat to the park if outnumbered".
- **Formations** (#12): an order with a style target, costs 1 influence, applies to the whole faction (it never competes for villagers with other orders). *Spread* keeps people 70 px apart; *Together* pulls them to the group centre and gives 10% less damage with 2 allies within 80 px; *Centre* makes the weakest quarter the core (20% less damage with 2 ring members near) and rings the rest around them. Soft forces with dead zones; they only act while the villager is calm.
- **Challenge modes** (#2): one per match, from the URL or the host's lobby. They do **not** count toward your record or achievements. *Everyone Starts Armed* (max 3 guns a faction, shotgun for gunslingers); *One Villager per Faction* (neutrals stay at 12); *Explosive Deliveries* (2 lit crates per day from day 3, fuse 10 to 22 s, credited to nobody); *Random Powers Every Turn* (4 random miracles per seat per day).
- **Layouts** (#9): classic, canal town (two canals, four bridges), market street (twelve stalls), scattered farms (hay bales, six dry patches), hill village (slow climb, boulders). "Random" is a seeded draw, so everyone gets the same one. The nine place ids never change.
- **Awards and clips** (#1, #13): awards come only from recorded events. The recorder keeps the **last turn only**, so a replay control appears only for a moment inside it; for older moments the award says "From day N: no recording kept". Clips are WebM (or MP4 where the browser records it), at most 8 seconds and 6 MB, captioned from the real events in that window (you can edit the caption), with `@adityajain1323`. Browsers that cannot record get a PNG still, and browsers that can do neither say so. Nothing is ever uploaded: the player gets a blob URL and a Save button.
- **Dialogue** (#4): 22 new event categories, up to 2 nearby speakers per event, existing bubble pool (10, calm chat capped at 4), no line repeated within the last 18 lines.
- **Combat poses** (#3): follow real state only: fleeing with a loaded launcher fires back over the shoulder; a courageous gunner within 0.7 s of firing holds a steady aim; one rocket left and calm triggers a visible check; a Blank Round makes the shooter stare at the gun. No hit chance depends on any of them.

## 4. Player-facing summary

New in this update: five town layouts; four optional challenge modes; cover that stops bullets and can be blown up; dry grass that burns (and rain that saves it); weapons dropped by the fallen; a wandering troublemaker; villagers who remember grudges and favours; squad formations; conditional orders ("guard the armory, retreat to the park if outnumbered"); the Blank Rounds and Free Cake cards; the once-per-match Leader; Rain plus Lightning and Gust plus bomb combos; awards with replays; shareable captioned clips; many more things for villagers to say. Pick the town and the challenge when you start (solo, pass-and-play, the online lobby, or Settings); the How to Play guide has three new interactive steps.

## 5. Verification ledger

Run on Windows 11, Node 24, Chrome (headless, software rendering), 9 November 2026.

| Gate | Result |
|---|---|
| `node tools/verify.js` (regressions, smoke, parser, orders, verbs, powers, effects, balance, lockstep, fuzz, build) | all PASS |
| `node --test tools/*.test.js` | 118 pass, 0 fail (34 are new: `ideas-m1`, `ideas-m2`, `ideas-m3`) |
| Fuzz, `node tools/fuzz-test.js 60 1` (random layouts and modes, new phrases, new invariants: nothing in water, caps on goods, drops and fires) | 60 matches, 0 crashed, all invariants held (it found and fixed one bug: villagers ending a tick in water) |
| Lockstep, `node tools/net-test.js 12` (layouts and modes rotate with the seed, dropouts) | identical state on every client in all 12 matches |
| Real browser, `tools/browser-inputs.mjs` (the existing 20 checks) | PASS, fresh `vite preview` of the final build |
| Real browser, `tools/browser-ideas.mjs` (setup pickers, formation and fallback builders, layout in game, highlight, clip recorded as a bounded WebM, local save link) | 12 PASS, 0 page errors |
| Every layout and mode loaded in a browser; effects exercised (rain, lightning, leader, arm, blank, cake, fire, destroyed prop, drop) | no console errors |
| Responsive: phone 390x844, tablet 820x1180, narrow laptop 1100x700 | one overflow found and fixed (setup dialog on phones); no clipped primary controls afterwards |
| Balance, 40 bot matches per setup (`tools/ideas-balance.js 40`) | 11.3 to 14.8 turns, 3 to 20% hit the day-20 cap, seats within noise |
| Sim cost per tick, same conditions (`tools/bench-ticks.js`) | peaceful 35 us vs 31 to 36 us on `main`; brawling 50 us vs 42 us (about 0.1% of the 50 ms tick) |
| Rendered frame rate, software rendering, 8-second samples | within noise of `main` (peaceful 8.3 vs 8.5 fps, brawl 6.9 vs 7.0, canal 9.1 and 7.9); heap 60 to 90 MB on both |

Balance table (40 matches each):

```
classic  standard  turns 14.7  capped 15%  seats 18/30/23/30
canal    standard  turns 14.2  capped 13%  seats 23/35/20/23
market   standard  turns 14.8  capped 10%  seats 15/30/28/28
farms    standard  turns 13.7  capped  8%  seats 18/35/18/30
hill     standard  turns 14.3  capped 20%  seats 30/28/20/23
classic  armed     turns 14.3  capped 15%  seats 20/25/20/35
classic  one       turns 11.3  capped  5%  seats 35/23/20/23
classic  explosive turns 13.5  capped  3%  seats 33/35/23/10
classic  random    turns 12.2  capped  3%  seats 30/23/18/30
```

## 6. Limitations (not verified, or deliberately left)

- Not tested on a real phone or tablet (only emulated viewports), with a real GPU, or across two real networks. Online lobby and rematch were tested with two local browsers only. Please play one online match with a friend before merging.
- Frame rates above were measured with software rendering at about 10 fps, so only the comparison with `main` is meaningful.
- Clip export is WebM in Chrome; Safari and some browsers may produce MP4 or only a still. Audio is not recorded in clips.
- Cover is used by villagers who are shot at; bots do not plan around cover, so it rarely changes bot-only matches (1 to 2 covered shots per match).
- Awards can only replay the last recorded turn; the recorder was not extended to keep every turn (memory).
- The "One Villager per Faction" mode ends in about 11 turns, not instantly: neutrals can still be recruited.
- Conditional orders only apply to movement orders, by design.
