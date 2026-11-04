# Decisions

Choices made where the master prompt was ambiguous. Change any of these any time.

## Section 17 open questions (defaults used until you answer)

1. **Faction names/colours:** kept Embers (red, party hat), Tides (blue, wave), Sprouts (green, leaf), Sparks (yellow, star). To rename: edit `FACTIONS` in `src/config/content.js`.
2. **Ghosts:** dead players watch + whisper + vote only (no mini side-game). Matches the prompt's Section 9.
3. **Hotseat:** not built. Solo vs bots comes in M1; online comes in M4.
4. **Devices:** laptops assumed. Mobile touch stays in M6. The canvas already scales to any window size.

## M1 choices

- **Solo seating:** you are seat 0 (Embers). The other three seats get random bot personalities per seed.
- **Neutral group = slot 4** in the opinion / fear / grudge arrays (so "hate the neutrals" works). Orders can target any group including your own (contradictions are comedy).
- **Fear order simplification:** the prompt says courage drops "when near that faction". M1 lowers courage everywhere; it recovers 25% per turn.
- **Neutrals and behaviour orders:** a neutral follows protect/avoid/follow/arm with probability = its trust in you; numeric orders (hate/love/fear) are scaled by trust, as in the prompt.
- **Orders last one turn.** Opinions and fear persist; aggression/courage relax 25% toward their base each turn. Behaviour effects (protect, follow...) are cleared when the sim phase ends.
- **Gun with 0 ammo** fights like fists (and stops causing panic).
- **A faction is "eliminated" at 0 living members.** If everyone dies in the same match, the faction that lost its last member latest wins.
- **Timer auto-submit:** whatever is staged in your panel is sent when the command timer runs out.
- **Phases still missing:** rumor phase and guess phase (M3/M5). Ghost whispers (M5). Traits (M5).
- **Bot tie-breaks are random.** Breaking ties by seat number first made Embers everyone's favourite target and gave the seats 5% / 45% win rates.
- **Early renderer extras pulled forward from M2** because fights were unreadable without them: angry/scared faces, hp bars, weapon glyphs, death spin + tombstone.

## Review pass (a brutal-critic review, then fixes)

Findings that came from measuring, not opinion, and what was done:

- **Rumors did not exist.** The pitch said villagers spread rumors; only the sim of orders existed. Added Accuse / Praise, belief by trust, spread by chatting, expiry, a gossip bot, and rumors count as a possible hidden cause in the guessing game.
- **No menu, no onboarding, no way to play with friends.** The game started alone, with an unexplained panel. Added a main menu, How to Play, a first-turn coach box, a visible goal, a daily town, and **pass-and-play** for 2-4 humans on one device. Online play is still not built (the menu says so).
- **Matches were about 19 minutes** (measured: 10.6 turns x about 109 s). Shortened sim (32 s), recap (10 s), guess (14 s + 5 s reveal), cutscenes (about 13 s, two stories), earlier sudden death (turn 4), stronger war fever. Now about 10 turns, about 12-16 minutes.
- **Passing every turn won 22%** (fair is 25%): player choices barely mattered. Added a neglect penalty (a leader who gives no orders loses faith and people). Now: passer 18%, sniper 20%, rumorer 20%, turtle 25%, relentless hater 0%, lover 10%: choices clearly matter and no strategy dominates.
- **The villager AI was twitchy** (9 state flip-flops per villager-minute; target under 0.5). Causes found by instrumenting why fights start and stop: followers dropped out of "guard" every half second, scuffles re-rolled their 50% break-off chance every half second, fighters re-picked their nearest enemy constantly, peacemakers broke up fights every half second. Fixed with hysteresis, one break-off roll per scuffle, sticky targets and cool-downs: 9.0 down to about 2.9, stuck villagers 0. It was *not* "too many weights": it was rules that undo each other, and the fix is to give states some commitment. Remaining flips are mostly followers stopping and starting beside walking partners.
- **A crash only the regression run found:** accusing the Neutrals broke the news (group 4 was not handled). Fixed.
- **Turncoats:** faith in one's own faction (the opinion of one's own group) erodes from cross-faction bonds, war-weariness in gentle villagers, notoriety, bad days and neglect. Low faith makes villagers dislike their own neighbours (the existing grievance rules then start infighting) and may make them defect. About 2 per match; neutrals can be recruited.
- **Not fixed / not judged:** real online multiplayer (M4), ghost powers for eliminated players beyond guessing and skipping ahead, touch controls and phone layout (I cannot test a phone here), colour-blind testing with real users (faction hats and chips use shapes as well as colours), GPU performance on your laptop (CPU cost per frame measured at a median of 1.0 ms), and whether the game is fun with real friends.

## Presentation pass (after your third round of feedback)

- **"Realistic" figures** were interpreted as *much more detailed*, not photorealistic. Photorealism is not possible with shapes drawn in code, and it would break the faction shapes and colours that keep the game readable (and the prompt says original, code-drawn art). Villagers keep their shape identity but gained legs, arms, hands, shading, expressions with eye glints, accessories and a pose for every action.
- **Blood vs the prompt's "no gore":** the prompt said no gore; you then asked for bleeding. It is cartoon-level (droplets, ground stains, plasters, a red smear; deaths are still a spin and tombstone) and there is a 🩸 button to turn it off. The setting is remembered.
- **The camera cut was confusing because it only zoomed.** It now (1) zooms less, (2) darkens the town and fades everyone else, (3) rings and labels the attacker and victim with an arrow, and (4) explains how it got there from a small history of the pair (argument, fist fight, weapon). That history is only for display (`sim/history.js`); it never reveals the hidden cause, so the guessing game is intact.
- **Cutscenes** borrow ideas from *We Become What We Behold* (a calm opening that darkens, a TV news broadcast that turns events into headlines, you as the camera with a viewfinder and shutter), with our own art and text. They pause the game, are skippable, and can be switched off (🎬).
- **Sound** is still fully synthesised (no samples), now with reverb, stereo position, a compressor, a chord-based music layer, a heartbeat at high tension, a crowd murmur that thins as villagers die, and cartoon voice blips synced with speech bubbles.
- **Dialogue** is flavour only (`config/lines.js`), chosen from what the villager is doing; it never changes the simulation.
- **Performance note (not yet measured on your laptop):** the town is baked once into a texture, particles are capped at 320, speech bubbles at 10, blood stains at 160.

## Balance pass 3: no turn limit, roomier town, pastimes, bonds (after your second playtest)

Your feedback: "the match ended with lots of people alive; play until one faction remains. Fights are on every corner: space the map out and give them more to do. When we love a faction, villagers should get attached and team up."

- **A match now ends only when one faction is left.** The 7-turn score cap is gone (it now only exists as a 20-turn safety net against a permanent standoff, e.g. two factions loving each other forever; the highest score wins then). 600 simulated matches: **10.7 turns on average** (8 to 20), about 20 minutes. Only about 2% hit the safety limit.
- **War fever** was needed to make that work. Without it the last survivors on the big map never met (64 of 120 matches hit the limit). From sudden death (turn 5) on, and whenever only two factions are left, enemies' "sense each other" and "go looking for trouble" radii grow every turn (FEVER in tunables.js).
- **Roomier town:** 1600 x 900 (was 1280 x 720), 9 places (new: Pond, Farm, Bakery), a smaller range within which grievance builds (100 px, was 130) and a shorter fight-seeking range (170 px, was 220), faster walking. First kill now comes around turn 3, and the first four turns total about 6 deaths.
- **Pastimes:** each place has something to do (see ACTIVITY in tunables.js), with effects: calming, healing, courage, fear relief.
- **Bonds:** a Love order creates 1 + strength pairs between your villagers and the loved group (who must not hate you). Other ways to bond: a hug between free friends (3%), or a Festival. Partners follow each other, defend each other, join each other's fights, never fight each other, take 12% less damage when together and deal 12% more when attacking the same target. Hatred of the partner's whole group breaks a bond; a partner's death causes 8 s of grief and a huge grudge.
- **Festival** (new verb, a place): your villagers go and dance; everyone nearby cools down faster and a few pairs form. Costs influence like any order; the pacifist bot now uses it.
- **Result (600 matches, seed 7):** seats 22-28%, first kill turn 3.2, 54 deaths per match, no early wipes.
- **Deliberately left:** the opportunist bot is still the strongest bot (about 40%), and the first four turns are quiet (about 6 deaths). Both are tunable.

## Balance pass 2: personalities, conflict ladder, order rules (after your playtest feedback)

Your feedback: "everyone just spams hate and fights and it ends; characters should differ; add more than hate; no two hates in a row." What changed:

- **Every villager has a temperament** (hidden until they show it): hothead (brawler), coward, gunslinger (the only shotguns: exactly 3, always from different groups), peacemaker, medic, bodyguard, wildcard, or none. Each also has a personal **tolerance** (0.65-1.55x, times the trait) and a **daily mood** (good or bad day, re-rolled each turn) that changes how fast their temper builds.
- **No more instant fights.** Between each pair of villagers there is a *grievance* number. It builds when one dislikes the other's group and stands close, fades over time, and climbs a ladder: annoyed, **argue** (50% of tolerance), **fist scuffle** (100%), **melee weapons** (145%), **firearms** (190%). A scuffle that hurts someone either breaks off (50%) or turns serious. At every rung there is a chance to calm down (friends, cowards and peacemakers help). Being hit or seeing a friend killed jumps the grievance. So hate takes about one turn to boil, and the town stays peaceful early.
- **Shotgun:** 110 range, 42 damage, almost never misses, also hurts whoever stands next to the target (50%), 2 shells, very loud (panic radius 230). Gunslingers and bodyguards are not rattled by gunfire; cowards panic longer.
- **Order rules:** `Hate` cannot be used two turns in a row (button disabled, rejected by the rules, bots obey too), and only one Hate order per turn. Using the same numeric verb (Love, Fear) two turns in a row works at 60% ("tired"). Behaviour verbs (Protect, Avoid, Follow, Arm) are not penalised.
- **Notoriety:** every kill adds to the killer faction's notoriety (fades 30% a turn). Every other group's opinion of that faction drops each turn, and neutrals trust it less. Shown as a flame number on the faction chips. This is the built-in cost of spamming violence.
- **Winner at the turn limit** is now a score (living villagers + 0.8 per rival kill + 0.5 per correct guess), not just "most survivors". Before this, doing nothing won 66% of matches.
- **Match length:** the cap is now **7 turns** (sudden death from turn 5), about 12-15 minutes. At 9 turns, the slower ladder made matches about 18 minutes.
- **Result on 1000 matches:** first kill around turn 2.2 (was 2.0, but now it comes after real arguments), 32.6 deaths per match (was 47), seats 23.5-27.5%, no early wipes. By bot style: warmonger 31%, pacifist 16%, opportunist 45%, chaos 8% (it plays randomly).
- **Known:** the opportunist bot is still a bit strong, and in 74% of highlights the killer's own faction is the cause (up from 66%), so guessing is slightly easier now. New verbs and rumors (M5) will add other causes.

## M3 choices

- **"Cause" is a rule, not a vibe.** `sim/highlights.js` scores every kill against that turn's secret orders: a `hate` order on the victim's group by the killer's own faction (3 points) or reaching a neutral killer (2), a `hate` on the killer's group by someone else (2, "provoked the fight"), a matching `arm` or `fear` order (1 each). The seat with the most points is the cause. If nobody has any, the killer's own faction gets it ("old grudges"), or "nobody" if the killer is neutral. Brawls vote across all their kills. Gunfights with no kill can also be a highlight.
- **Guessing is checked headlessly.** `simulate.js` now reports guessability: simple bots using only the public kill feed are right 44% of the time (blind guessing: 20%), and in 34% of highlights the cause is *not* the faction that did the killing. That is the sweet spot between obvious and random. The numbers will shift once rumors exist (M5), so re-check then.
- **Replays record, not re-simulate.** Each sim phase stores 10 frames/second of what the renderer needs (4 KB per frame). A replay writes those frames into the real villagers and restores the true state afterwards. This is only safe because the sim is paused in the recap and guess phases; main.js force-stops a replay before any phase change and `replay.js` documents why. Tested: state before and after a replay is identical (within float32 rounding).
- **Guess phase is its own phase** (20 s, then 7 s of reveal), docked on the side so you can replay clips while deciding. It ends early once every human has locked in. Bots guess instantly. With no humans (headless runs) it resolves immediately.
- **Points** are +1 per correct guess and are only a tiebreaker/statistic; **+1 influence** next turn per correct guess is the real reward. (The prompt's tiebreak by points at the turn cap is not implemented because the cap tiebreak currently ends in a coin flip; easy to add if wanted.)
- **Not done from the M3 list:** the "mini replay in the recap" is the Replay buttons, not an auto-playing montage. Rumor-caused events don't exist yet (M5).

## M2 choices

- **Sound is synthesised, not sampled.** The prompt said Howler.js with CC0 samples. Instead `src/audio/mixer.js` builds every layer and effect with the browser's WebAudio API: no files, no licences, no downloads, no extra dependency. Trade-off: it sounds simple and cartoonish rather than recorded. If you later want real recordings, drop CC0 files in `public/sounds/` and swap the one-shot functions (list them in `CREDITS.md`).
- **A news board + camera cut was added for "first blood"** (your idea), and generalised: a faction falling, a brawl (3 kills close together), a gun kill and the first gunshot also get moments. It lives in `render/director.js`, reads the sim's event log and never changes the simulation, so bots and headless runs are unaffected. During a cut the sim runs at 30% speed and the action is placed in the lower half of the screen with the board on the other side. This is an early form of the M3 "drama camera".
- **Mourning is a real sim rule, not just art.** Villagers who liked a victim freeze for 4 s (sad face) before doing anything else, including taking revenge. Re-ran the 1000-match balance: unchanged (seats 23-26%).
- **An 8th face, "sad", was added** to the prompt's list of 7 for the mourn action.
- **Thought bubbles and suspicious faces are computed only when someone is watching** (`world.cosmetics`); the headless balance tool turns them off. They never change behaviour.
- **Tension (0-100)** = fighters x5 + runners x2 + a fading spike per kill/gunshot + a slow background level that rises each turn. It drives the sound layers and the HUD meter.
- **Hover card shows opinions, not traits.** Traits come in M5.

### Balance pass 1 (after M1)

Result on 1000 mixed-bot matches: 7.7 turns on average, seats win 23-27% each, a faction is wiped before turn 3 in 7.3% of matches (all three M5 targets).

What changed and why (each found by reading the simulate.js report):
- **Protect is a damage reduction, not flat defence.** The prompt's "+10 defence per strength" made protected villagers take about 1 damage from fists, so pacifists were nearly immortal. Now 12% less damage per strength level (cap 50%).
- **Survivors heal 25 hp between turns** so one war doesn't snowball on old wounds.
- **Swings every 0.9 s (was 0.6 s)**, wounded villagers (under 35 hp) stop starting fights, flee earlier (threshold 2) and for longer (4 to 7 s).
- **Sudden death also sours opinions** (every other group -20 per turn). Before, a town of peaceful bots never fought and the match could not end.
- **Ties at the turn limit are a coin flip**, not "lowest seat number". The old rule gave Embers 100% of stalemates and 52% of all-chaos games.
- **Tried and reverted:** a "call to arms" (hit villagers pull nearby group-mates into the fight) made early wipes worse (15.8%).
- **Warmonger bot digs in (protect) when down to 4 villagers**, like a real player would.

### Still open (M5)

- Personalities are lopsided: opportunist 47%, pacifist 28%, chaos 19%, warmonger 7%. A war costs both sides about the same (diag: attacker 5.9 left vs target 6.3 left after an Extreme hate turn), so whoever stays out of it profits. That is a real strategic effect of four-player free-for-all, but it may make "wait and see" too safe for human players.
- The first-killed faction wins only about 3% of matches.
- A turn-1 Extreme hate order is still a very big opening move.
- About 44% of matches run to the turn-9 cap.

## M0 choices

- **Project location:** `Desktop/tiny-gods`. The folder is inside OneDrive, so `node_modules` will sync (slow, ~thousands of files). Consider pausing OneDrive sync for that folder, or moving the project to a non-synced folder before heavy work.
- **Sim runs at a fixed 20 Hz**, the renderer interpolates between ticks (so motion is smooth at 60 FPS). Same model the host-authoritative multiplayer will use in M4.
- **Wall-clock timing:** the game loop uses `performance.now()` rather than Pixi's ticker delta, because Pixi caps a frame at 100 ms, which would make slow machines run in slow motion.
- **Three M0 expressions:** calm (walking/idle), happy (chatting), love (heart eyes; likelier between "friends", each villager has one random friend).
- **Speech bubbles:** chatting pairs take turns (bubble + open mouth), one bubble at a time, so a conversation is readable.
- **`?seed=N` in the URL** gives the same town every time. Default seed 1.
- **Debug hook:** `window.tinyGods` (sim, app, views, `advance(seconds)`) is exposed for console poking. Remove in M6.
- **JSDoc, no TypeScript**, as specified.

## Round: bigger map, no corner-hugging, endgame, polish
- Map is 1920x1080 with fewer trees and clearer paths. Villagers are pushed off walls (`WALL`), and fleeing picks a safe place instead of the nearest edge. Measured: 0% near walls, 0% pinned fleers.
- Flee stamina and a "cornered" rule make runners tire and fight back; healing between turns fades after sudden death; a closing storm and growing paranoia end stalemates. Latest 400 matches: ~8.5 turns average, 3 stalls.
- Ghost whispers: eliminated humans can still give one mild order (love, fear, praise, accuse, festival) while other humans live. They cannot order Hate.
- Guided first-turn tutorial, calm view toggle, named bots, local stats and 6 achievements.
- Phone layout: CSS under 760px (full-width top bar, bottom command panel, bigger touch targets). Checked by measuring layout in a 375x812 emulation; not tested on a real phone.

## Round: cards, live miracles, typed orders, no guessing
- Weapons: nobody starts armed. The only source is the armory (the Arm up order, or typing "arm up"). Each faction has its own shelf (6, refilled by 3 a turn) so nobody wins the race by villager id. Gunslingers take the shotgun.
- Guessing phase removed: the news is now the end of the turn. "The Truth" at the end still shows everyone's orders and cards.
- Turn is now: dawn (type orders, play one of 4 dealt cards) -> the town acts (3 Power points for live miracles) -> news.
- 15 cards (src/sim/cards.js). The first prophecy made its target feared and so stronger; it now saps the target's nerve instead. Bots shuffle rivals before picking a target, which removed a 36% vs 15% seat bias.
- Orders can now carry a subject: a number of villagers, a revealed temperament, or named villagers. New verbs: Escort (follow a villager), Hunt (go after a named villager), Stand down. Up to 3 orders a turn.
- Typing is rule-based, no AI (src/sim/parser.js): phrase rules, word lists with typo tolerance, clause splitting. Nothing typed bypasses validateOrders. Misses give a message and clickable examples.
- Verified: 300-match runs on two seeds give 23-27% per seat, ~10 turns a match. tools/parse-test.js checks sentences and that typed orders move villagers (3 villagers sent -> exactly 3 arrive).

## Round: powers, bombs, assault, overhaul
- 14 god powers now (src/sim/powers.js), 4 Power points a turn. Gust, lightning, tornado, earthquake, fireball and time bombs physically shove villagers (src/sim/shove.js knockback); measured: a gust throws a villager ~260px in a second.
- Time Bomb card: planted at a place, visibly ticking, goes off 12s into the turn, hurts friend and foe, kills are credited to the planter's faction.
- Hate no longer has a cooldown (up to 2 Hate orders a turn). Using any verb two turns running still weakens it.
- New Assault order sends a squad at a faction; Hunt targets one named villager; typing "hunt" alone now offers real names from different factions, and a bare name, faction or place offers things to do with it.
- UI: cards are real tiles (category colours, icons, deal animation), powers are tiles with cost pips, typing box has a prompt icon and pill suggestions, panels are glass.
- Matches got a little longer with more powers (about 11.8 turns). Seats stay at 21-28%.

## Round: peace, fewer powers, order menu
- Days 1 and 2 are peaceful (TURN.peaceTurns): startAttack is a no-op, Assault/Hunt/Time Bomb are locked, and there are no miracles. Power is 2 a turn from day 3. First kill now lands around day 3.7.
- The verb menu is back as a collapsed "pick an order" list under the typing box: verb, target, who (everyone / 2 / 4 / 6), strength, Add. It builds the same orders as typing.
- Assault can target a place ("kill everyone at the houses"). If one clause of a typed sentence is unreadable, the other clauses are kept and the problem is reported.

## Round: discoverability
- New players would not know they can type. The dawn panel now shows "① Pick an order" (the verb menu, open by default) and "② …or just type it" with a one-click Quick bar under the box (Arm up, Stand down, Party, Scare X, Attack X, Guard us). Staged orders carry a −/+ strength dial; typing accepts "x3", "strength 2", "level 3" or "!!!".
- Influence is 3 a turn (was 5), shown as dots. Spare influence still carries up to 3.
- tools/card-value.js measures each card's worth. Before the card rewrite: Forged Letter -5, Prophecy +2, Recruit -1, Matchmaker -1, Bribe -9 points of win rate (so, nothing). Note the harness plays the same card every turn, which a real hand can't, so it overstates repeatable buffs like Rally.

## Anger before blood, and realistic sound (round 11)
- Spontaneous fights now start with a scowl: the villager stops, makes the angry face, growls and shouts at the target (`brewId`/`brewUntil`) for 2.8s in a calm town down to 0.5s at tension 100 (brawlers shorter, cowards longer). About a quarter of scowls fizzle out. Each scowler adds to the tension bar, so the bar rises before the first punch. In the peace days the scowl ends in shouting, never fists. Retaliation (being hit) skips the scowl.
- Sounds are still synthesised (no downloads, no licences), but rebuilt in layers: body thump + flesh noise for fists, woody crack for bats, metal ring for pans, slice for knives, crack + boom + reverb tail for guns, a real explosion for bombs, growl and distant shouts that grow with tension, and a lower, louder crowd murmur when the town is angry.

## Real recordings (round 12)
- Kenney Impact Sounds (CC0), Thwack Sounds (CC0) and three gun recordings (CC-BY 3.0, credited in CREDITS.md) live in `public/sfx` (~650 KB). `tools/prep-sfx.cjs` rebuilds them from the downloaded zips (guns cut to ~1 s, mono).
- The mixer loads them after the first click; each hit sound plays a random recording with slight pitch variation plus a small synth thump for weight. If a file is missing or not loaded yet, the synthesised sound plays instead.
- Screams, growls, shouts, ambience and music stay synthesised (no suitable CC0 files found).

## Online multiplayer, M4 (round 13)
- **Design: deterministic lockstep, host as clock.** The sim has no Math.random and a fixed 20 Hz tick, so every browser runs the same game from the same seed and inputs. Orders travel only to the host and are broadcast at "go" (so they stay secret while players decide). Miracles are sent to the host, stamped with the tick they will run before, and broadcast. The host announces a "horizon" (how many ticks may run); a slow browser just runs faster to catch up. The host also ends the dawn and the news. Each browser hashes the town at every dawn and the host raises a warning if they ever differ.
- **Transport: WebRTC through PeerJS' free public broker, no server of ours.** Pros: works from GitHub Pages, nothing to pay for or run. Cons: the host's browser is the hub, so if they close the tab the match ends (no host migration); the free broker is a third party; no TURN relay, so a few strict networks cannot connect. A tiny websocket relay can replace `src/net/room.js` later without touching `lockstep.js`.
- **Online rules:** no pause, no fast-forward, no slow-motion camera, no day-card cutscene (everybody shares one clock); a player who leaves is replaced by a bot at the next dawn; ghosts (fallen players) still act.
- **Tested** headless with 2-4 players over a fake network with random 20-200 ms delays, random frame rates and live miracles (tools/net-test.js): identical towns every time. Also tested live with two browser tabs over real WebRTC. Not tested on two separate machines.
- **Real bug found on the way:** the Sleep power and the Kidnap card froze villagers with no target, which crashed the thought-bubble code in the real game (not in headless runs). Fixed.

## Round 14: side panels, difficulty, events, 60 fps, new menu, lost-orders fix
- **Side dock:** on screens 920 px wide or more, the order panel and the miracle bar sit in a column on the right and the camera fits the town into the space that is left (new `insetRight`), so no panel ever covers the village. Phones keep the bottom sheet. The online player list moved to the bottom-left.
- **Orders were lost on timeout** whenever the player had typed a sentence but not pressed Enter, or had picked an order in the menu but not pressed Add; and one invalid order threw away all the valid ones. Now the timeout sends everything typed, picked or staged, keeping every order that is legal. A note under the header says so.
- **Online fixes:** the host sends a "last call" when the dawn timer ends and every browser answers with what it has (before, a slow or lagging player's orders could arrive after the host had already started the turn); the host's clock is sent every second so everybody's countdown matches; the online dawn is 45 s instead of 30; the host's clock keeps running when its tab is in the background (before, a hidden host tab froze the room).
- **Bot difficulty (Easy / Normal / Hard):** per seat or per game. Easy: -1 influence, skips 40% of orders, push capped at 2, plays cards 30% of dawns, rarely casts miracles, never attacks with miracles. Hard: +2 influence spent on an extra Arm up order, plays cards 95% of dawns, casts miracles constantly. Measured with a normal bot against three rivals (tools/difficulty-test.js): it wins 54% against Easy rivals, 20% against Normal, about 17% against Hard (25% would be even; Hard is a smaller step than Easy because hard bots also split the wins among themselves).
- **"Sparks always win":** not reproducible. With a passive human the three bots win 33 / 34 / 33%; four identical bots win 23-29% by seat. Sparks is the last seat, and the bot there is picked from the seed, so a stretch of games can look lopsided. The new difficulty setting is the real answer.
- **Town events (new mechanic):** from day 3, 60% of dawns bring one event for everybody: Harvest Festival (grudges cool), Heatwave (tempers up), Market Day (+1 influence), Armory Delivery (all shelves full), Sickness (the biggest faction loses 12 hp: a built-in comeback). Never the same one twice in a row. Rolled from its own random stream, so online games stay in sync.
- **60 fps option:** Settings and a button in the top bar cycle Auto (your screen's rate) / 60 / 30.
- **New main menu:** title and quick links on the left, one big "Play vs bots" card with the difficulty picker and a Play button, then Online, Pass and play and Daily town cards; a Settings dialog (sound, blood, cutscenes, frame rate, difficulty); staggered entrance, hover lift, keyboard focus, phone layout, reduced-motion support.

## Round 15: many more typed orders, nicer and more buildings, a gentler storm
- **"Scare the Tides" used to mean the wrong thing.** The old Fear order made YOUR villagers afraid of the Tides. Now there are two: **Scare** (new: your villagers walk up to the target faction, glare and loom, their fear and doubt grow, some bolt, but they resent you more, so bullying has a price) and **Fear** (be afraid of them; reached by "be afraid of", "watch out for"). "Terrified of us" and "make the blue ones scared" now mean Scare.
- **Run away from everyone** was impossible ("avoid whom?"). New order **Run away** (scatter): everyone avoids everybody. "Run away from the Tides" is still Avoid.
- **Ambush** (new, locked in the peaceful days like Assault): lie in wait at a place and jump anyone from another faction who comes near.
- **A lot more ways to say things** (tools/orders-test.js checks 27 sentences, plus what the new orders really do): pick a fight with / go after / teach X a lesson / stand up to / declare war on (attack); make friends with / be nice to / team up with / bury the hatchet with (love); leave X alone / give X space / keep your distance (avoid); cheer for / speak well of (praise); trash talk / badmouth (accuse); take cover / lock the doors / barricade (hide); keep watch / have my back / patrol (guard); dash / sprint / hurry to (go); stare down / glare at / sneak up on (scare); lie in wait / stake out (ambush); run for the hills / every man for himself (run away).
- **Buildings:** one new house design (stone base, timber frame, shingled or thatched roof, chimney with smoke, arched door, shuttered windows with flower boxes, lantern) in three styles and four wall colours. The Houses district has 8 cottages (was 3) with a lane, fences, gardens, lamps and washing; 12 more cottages stand out between the places.
- **The map shrinks less:** the storm takes 9% of the map per turn (was 12%) and stops at 45% (was 34%). If a match drags past day 13 it tightens faster, down to 30%. Measured over 200 matches: average 13.2 turns (was about 12.6), 10% of matches reach the day-20 cap (was about 15%).

## Round 16: places redrawn, a full mechanics audit, and fights with more than punches
- **Plaza** radius 120 -> 150, with a real fountain, four flowerbeds, cobbles and six lamps. **Market** has five stalls with scalloped awnings and different goods, bunting, a cart. **Pond** has layered water, lily pads, rocks, reeds, a dock and a rowboat. **Armory** is now a small fortress: two towers, battlements, a banded door, a banner, torches, a weapon rack, a training dummy and an anvil.
- **Audit tooling** (all exit 1 on failure): `tools/fuzz-test.js` (whole matches with the render-side logic on, random typed sentences, cards and miracles including nonsense arguments, invariants checked every second: 46 matches, no crash), `tools/powers-test.js` (40 checks: every miracle and every card does what its description says), `tools/verbs-test.js` (every order verb against doing nothing), `tools/orders-test.js` (typing and the new orders).
- **Bugs the audit found:** (1) an **Aegis did not protect against explosions** (fireballs and bombs ignored it); now it takes 60% off them too. (2) **Rumors were nearly useless:** an Accuse reached about 3 believers and never spread; listeners at the start 5 -> 9, belief 0.2 -> 0.3 base, repeat chance 0.45 -> 0.55. (3) Fog's text promised more than it did (people still defend themselves, so fights continued); the text now says what it does. (4) Earlier this round: the Sleep power and Kidnap card crashed the real game (not headless runs).
- **Fights have more moves.** In a fist fight about 10% of moves are a **shove** (a stumble, 4 damage, much angrier victim, no blood, its own sound), 3% a **shout** (everyone listening loses a little nerve and gets scared of that faction), and a hard hit makes the victim **scream**: onlookers flinch and some run. New orders: **Shove** ("push the Tides away", "drive them off": your villagers walk up and keep pushing them), **Seize** ("two villagers grab Mia and drag her to the pond": the nearest villagers (strength + 1, or the number you say) go to her, lift her together, and walk her to the place, slower while carrying; if one of them is hit, flees or is hurt they drop her; at the pond she is dunked for 5 hp; she and her friends hold a grudge afterwards) and shouting is part of **Scare** ("shout at the Sparks"). Shove and Seize are locked in the peaceful days.
- **Pacing:** with all of this, 200 bot matches average 13.8 turns and 15% reach the day-20 cap (before this round: 13.2 and 10%).
