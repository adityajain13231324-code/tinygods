# Manual test checklists

Run the game: `npm install` once, then `npm run dev` and open the printed address (http://localhost:5173).

## M0: Town and wanderers

- [ ] Page loads with no errors in the browser console.
- [ ] You see a town with six labelled places: Plaza, Park, Market, Well, Houses, Armory.
- [ ] 60 villagers are visible; the top-left box says "60 villagers".
- [ ] Villagers come in 4 faction colours **and** marks: red + party hat, blue + wave, green + leaf, yellow + star. About 12 of each, plus 12 plain beige ones (neutral).
- [ ] Shapes vary: circle, square, triangle, hexagon.
- [ ] Villagers walk (squash and stretch, little hop), stand (slow bob) and walk to places.
- [ ] Pairs walk up to each other and chat: speech bubble appears on one, then the other, with a happy face.
- [ ] Sometimes you see heart eyes during a chat.
- [ ] After a minute the crowd has mixed across all places (not stuck in one spot).
- [ ] Resize the window: the town scales and stays centred, nothing stretches.
- [ ] The FPS counter stays near 60 (on the HP Pavilion with integrated graphics, this is the acceptance test).
- [ ] `?seed=5` in the URL gives a different start; reloading with the same seed gives the same start.

## M1: Core sim and solo loop

You lead the Embers (red). Three bots lead the other factions. Orders are secret.

- [ ] Game opens on "Turn 1/9, Give your orders" with a 0:30 timer and an order panel at the bottom.
- [ ] Pick a verb: target buttons appear (factions + Neutrals for hate/love/fear; factions and places for protect/avoid; places for follow; none for Arm up).
- [ ] Strength buttons cost influence; "Add order" is disabled when you can't afford it. Max 2 orders per turn.
- [ ] A staged order can be removed with its ✕. "Pass this turn" submits nothing.
- [ ] Submitting starts the sim phase at once (bots already decided). Top bar shows your own orders only.
- [ ] ×1 / ×2 / ×4 buttons change the simulation speed.
- [ ] Hate order (Extreme) on one faction: your villagers go looking for that faction and fight. Angry faces, hp bars, swing lunges, kill feed entries, tombstones.
- [ ] Villagers with weapons show a small weapon glyph; gun owners show bullets above it. A gunshot makes nearby villagers run (scared faces).
- [ ] "Arm up": unarmed villagers of your faction walk to the Armory and come back armed (pool of 6 weapons).
- [ ] Protect / Avoid / Follow visibly change where your faction stands or walks.
- [ ] After 40 s of sim time the news recap appears: headlines, standings, "Next turn" button (or wait 20 s).
- [ ] Don't touch anything for a turn: the timer runs out and the turn proceeds.
- [ ] Turn 7+ shows a pulsing "Tension rising!" and fights get more frequent (sudden death).
- [ ] The match ends when one faction is left (or after turn 9). End screen names the winner, and "The truth" lists every order of every faction by turn.
- [ ] If your faction is wiped, a "you are a ghost" banner appears and the match plays on.
- [ ] "Play again" starts a new town.

## M2: Animation, legibility and sound

Click anywhere once so the browser allows sound.

**The news board and camera (the "first blood" moment)**
- [ ] The first kill of a match shows a big "BREAKING NEWS: FIRST BLOOD" board naming killer, victim and place; the camera zooms in on the kill and the action slows down for about 3 seconds, then eases back out.
- [ ] The board is on the opposite side of the screen from the action, never covering it.
- [ ] Wiping out a faction shows "THE X HAVE FALLEN" with a zoom. Several kills in one place shows "BRAWL AT THE ...". The first gunshot shows "SHOTS FIRED" and shakes the screen.
- [ ] Turn 7 shows "TENSION RISING" and a warping sound.

**Reading the town**
- [ ] Your own villagers have a gold ring underneath.
- [ ] Thought bubbles over heads: heart, angry mark, sweat drop, question mark (eyeing a group they distrust), skull (a kill is on their mind or they are mourning), shield (guarding), flag (following a place). A small coloured dot in the bubble shows which group it is about.
- [ ] Hover a villager: card with name, faction, hp, weapon, what they are doing and why, who they hate/like/fear. Coloured lines run to the villagers they hate (red), love (green) or their friend (pink).
- [ ] Top bar has a Tension meter that fills as fights break out and sinks between turns.

**Expressions and actions** (watch a few turns at ×1)
- [ ] 7 faces: calm, happy, love (heart eyes), angry, scared, suspicious (side-eye, one brow up), dead (X eyes while spinning away). Plus a sad face for mourners.
- [ ] Hug: two friends lean toward each other with hearts floating up. Argue: two people who dislike each other's groups jitter with angry faces and anger marks.
- [ ] Chase: attackers run faster with a forward lean. Flee: trembling runners with sweat drops. Mourn: after a friend dies, bystanders stand head-bowed for a few seconds with tears.
- [ ] Hits: stars burst, a red damage number floats up, the body flashes red. Kills: smoke puff, spin, tombstone.

**Sound** (use the speaker button to mute)
- [ ] Calm start: gentle notes, soft wind, occasional birdsong.
- [ ] As tension rises the music fades, a low drone comes in, and at high tension a pulsing rumble with clashing tones.
- [ ] One-shot sounds for: squeak, hug pop, slap, pan clang, bat, knife, gunshot, scream, tombstone thud, news jingle, camera shutter.

**Other**
- [ ] Pause button (⏸) freezes the whole game; ▶ resumes.
- [ ] 60 FPS on your laptop during a big fight (the particle count is capped at 320).

## M3: Hidden orders, recap, guess phase, The Truth

- [ ] After each sim phase the recap panel docks on the left (the town stays visible) with the headlines, standings and up to 3 **Highlights**, each with a ▶ Replay button.
- [ ] ▶ Replay zooms into that moment and replays the last few seconds in the real town (top bar says "⏪ REPLAY"). Dead villagers are alive again until they die in the clip. When it ends, the camera zooms out and the town is exactly as it was.
- [ ] "Guess who caused it" opens the guess phase (20 s). For each highlight, choose whose secret order set it off (any faction, or "Nobody"). Replay buttons still work.
- [ ] "Lock in" shows the truth for every highlight with the reason ("Tides ordered hatred of the Sprouts", "arming order put a weapon in the killer's hand", "the town snapped on its own..."), tells you if you were right, and who else was right.
- [ ] Each correct guess gives +1 influence on the next turn (check the "Influence left" number in the order panel).
- [ ] Do nothing in the guess phase: it times out and the next turn starts. "Skip guessing" works too.
- [ ] A quiet turn with no kills has no highlights and goes straight to the next turn.
- [ ] End screen: winner, **the town story** (5 lines in plain language), a "by the numbers" table (kills, villagers left, correct guesses, hate ordered), the best guesser, and **the truth** table of every secret order of every faction.
- [ ] "Copy share text" copies a short result message; "Rematch" starts a new town.
- [ ] After a match you can look at the truth table and say "so it was YOU!" and be able to prove it.

## Personalities, conflict ladder, order rules

- [ ] Turn 1 is calm even after a strong Hate order: villagers glare (question marks), then argue (angry faces, jitter), and only later fight. The first kill usually comes in turn 2 or 3.
- [ ] Fights start with **fists only**. Weapons appear only once a fight gets serious, firearms last. A fist scuffle that hurts someone may break off with both walking away.
- [ ] Hover villagers: the card says "Temperament: not seen yet" until they show it. Cowards reveal themselves by running, hotheads by starting fights, medics by healing, peacemakers by breaking up a fight. A shotgun carrier is always shown as a gunslinger.
- [ ] Look for the 3 **shotguns** (long double barrel with red shell pips). One blast can hit two villagers. Nearby villagers panic, except gunslingers and bodyguards.
- [ ] The hover card sometimes says "Having a bad day" / "In a good mood".
- [ ] After you give a Hate order, the **Hate button is greyed out the next turn** (hover it for the reason). You cannot stage two Hate orders in one turn.
- [ ] Love or Fear used two turns in a row is shown in italics "(tired)" and works at 60%.
- [ ] After kills, faction chips in the top bar show a flame number (notoriety) and other factions distrust that faction more each turn.
- [ ] There is no turn limit: the match ends only when one faction is left (a 20-turn safety limit exists only to stop a permanent standoff; then the highest score wins).

## Bigger town, pastimes, bonds, festivals

- [ ] The town is bigger (1600 x 900) with 9 places: Plaza, Park, Market, Well, Houses, Armory, plus the new **Pond, Farm and Bakery**. Villagers are spread out; fights are not on every corner.
- [ ] Arriving at a place, villagers usually do something there: dance (plaza), rest (park, houses), browse (market), make a wish (well), train (armory), fish (pond), garden (farm), eat (bakery). Each has its own pose and little particles (notes, Zzz, sparkles, drops, leaves, crumbs). Hover to see what they are doing.
- [ ] Pastimes have effects: dancing, resting, fishing and wishes calm tempers; resting, gardening and eating heal a little; training builds courage. So "Follow Pond" is a peaceful tactic and "Follow Armory" is not.
- [ ] **Love** a faction: a few of your villagers get attached to villagers of that faction (stronger order, more pairs). A pink thread with a heart connects each pair. Hover: "Bonded with X".
- [ ] Partners walk together, defend each other, join each other's fights, never fight each other, take less damage when together and hit harder as a team.
- [ ] When a partner is killed: long grief (sad face), then a burning grudge against the killer. The recap says "X lost Y to Z and swears revenge."
- [ ] **Festival** (new verb, pick a place): your villagers go there and dance; everyone nearby cools down faster and a few new pairs form (even between rivals).
- [ ] Late in the match (turn 5 on, or when only two factions remain) the town gets "war fever": enemies sense each other from farther away and hunt across the map, so the endgame doesn't stall.

## Presentation pass: clearer cuts, dialogue, sound, detailed town and figures, cutscenes, guns and blood

**Cutscenes** (🎬 button toggles them; Skip button, Space, Esc or Enter skips)
- [ ] Game start: a letterboxed "TINY GODS" title card while the camera drifts over the busiest place. Each later turn opens with "DAY N", a mood line ("The town is on edge...") and the survivors. The turn timer does not run during cutscenes.
- [ ] After a turn with highlights: a **Tiny News broadcast**. An anchor reads the top stories, a camera viewfinder (corner brackets, REC, shutter flash and click) frames each replay, a red "LIVE" lower-third shows the headline, and a ticker scrolls the standings. Then the recap panel appears.
- [ ] When the match ends: an epilogue ("THE EMBERS REMAIN", how the peace ended, how it ended), then the end screen.

**The camera cut ("zoom") explained**
- [ ] On a big kill the camera now zooms less, the town darkens, everyone except the **attacker and victim fades**, each gets a ring and a name label (ATTACKER / VICTIM) and an arrow joins them. The news board says what happened, and a second line says **how it got there** ("an argument, then a fist fight, then Pip reached for a bat" or "No warning at all"). It never says whose order started it.

**Dialogue**
- [ ] Villagers speak in real lines: chat, tense chat, love, arguments, battle cries, "Ow!", panic, grief, bonds, pastime remarks ("Mmm, pastry!"). Temperaments add their own voice once revealed. They come with little cartoon voice blips (a different pitch per villager) and at most 10 bubbles at a time.

**Sound** (click once first)
- [ ] Sounds are placed left/right by where they happen and have room reverb. Gunshot, shotgun (with pump click), bat, pan clang, punch, knife, scream, bells for news and bonds. Calm start has chord pads, plucks, birdsong and a faint crowd murmur; high tension adds a heartbeat.

**Town and figures**
- [ ] The town is detailed: curved paths, ~120 trees, flowers, fences, benches, lamps, market goods, a windmill, ducks on the pond, chimney smoke, flags, cloud shadows. Trees sway. As tension rises the sky turns amber, then red, then stormy with rain.
- [ ] Villagers have legs with shoes, arms with hands, shading, and poses for every action (walking, dancing, fishing, praying, hugging, pointing while arguing, swinging, aiming, hands to face in grief). Revealed temperaments show accessories (cowboy hat, headband, sunglasses, red cross, sash, feather, sweat).

**Guns and blood** (🩸 toggles blood)
- [ ] A shot shows a muzzle flash along the barrel, a tracer streaking to the target (six pellets for a shotgun), an ejected casing, smoke, recoil on the shooter, a brief screen flash and shake, then sparks and red drops on a hit or a dust kick on a miss.
- [ ] Hits spray cartoon blood away from the attacker and leave stains on the ground that fade. Hurt villagers wear a plaster, then a red smear, drip as they walk, and limp when badly hurt. No gore: deaths are still the spin, puff and tombstone.

## Review pass: menu, pass-and-play, rumors, turncoats, pacing

- [ ] Opening the site shows the **main menu** (Play vs bots, Pass and play, Daily town, How to play, "Play online", and sound / blood / cutscene settings). "How to play" has six short sections.
- [ ] **Pass and play:** pick 2-4 players and type names. Each player gets a full-screen "Pass the device to NAME" card; the town is hidden until they press Ready. Orders are never shown to the next player, the top bar does not say "Your orders", and the gold ring only shows on the active player's faction.
- [ ] In pass-and-play each player has their own timer (40 s for orders, 20 s for guesses); when it runs out, what they had picked is submitted.
- [ ] The guess reveal lists how every human did. The end screen names the winning player.
- [ ] First turn only: a "Goal / How" box explains the four steps. "Got it" hides it for good. The top bar always says "Last faction standing wins".
- [ ] **Rumors:** Accuse and Praise appear as verbs. A rumor is planted with a few listeners and spreads when believers chat; believers' opinion of the target group changes. Villagers say lines like "They say the Tides poisoned the well!". The recap says a rumor is going around but never who started it.
- [ ] **Turncoats:** now and then a villager changes sides (partner's faction, favourite faction, or neutral). Their colours and hat change, the news and a board announce it, and they say so. Neutrals who adore a faction can be won over.
- [ ] A faction whose leader gives no orders for a turn slowly loses faith, so passing every turn is a losing strategy.
- [ ] Bond lines only show while hovering a bonded villager.
- [ ] If every human is eliminated, cutscenes stop and a "Skip to the end" button appears.
- [ ] Tiny News: studio window top right, LIVE bug top left, headline bar with a tag, subtitles, ticker. At most two stories.
- [ ] A whole match takes about 12-16 minutes at normal speed.

### Headless balance run

- [ ] `node tools/simulate.js --matches 200 --bots mixed --seed 1` prints the report in about 30 s.
- [ ] Try `--bots warmonger`, `pacifist`, `opportunist`, `chaos`.

### Headless sim (no browser)

- [ ] `npm run smoke` prints state percentages and ends with `OK`.
- [ ] `node tools/sim-smoke.js 42 600` works for another seed and a 10 minute run.

## Added this round (manual checks)
- Open on a phone or a narrow window: top bar spans the width, command panel sits at the bottom, no sideways scroll.
- Watch a whole match: nobody should sit pinned in a corner; the storm should close in during the endgame.
- Pass-and-play with 2 humans: eliminate one, confirm they get a ghost panel with only mild verbs.
- Finish a match: stats and any achievement show on the end screen and in the menu record line.

## Cards, miracles and typing (manual)
- Dawn: type "send three villagers to the armory and scare the Tides". Two chips appear. Submit, and exactly three villagers should walk to the armory.
- Type nonsense ("blorp"): a red message and four clickable example sentences appear.
- Tap a card, aim it if it asks, submit: the recap shows "What your moves did".
- Town phase: type "lightning on the bakery" or "heal my weakest"; Power drops. Type orders now and it says they belong at dawn.
- `node tools/parse-test.js` prints parser results and end-to-end checks.

- `node tools/effects-test.js`: bomb timing, gust and earthquake displacement.
- Type "hunt" with nothing else: you should see real names from different factions, not the same one twice.
- Play the Time Bomb card at a busy place: a ticking bomb appears, then a blast with a ring and flung villagers.

## Online play (M4)
- [ ] `npm run net-test` prints PASS for every match (host + 1-3 guests over a fake laggy network, live miracles, one player dropping out).
- [ ] Two browser tabs: tab A "Play online" > "Create a room"; tab B opens the invite link (or types the code) > "Join". The lobby lists both names. A presses Start; both load the same town, B is the Tides.
- [ ] Both submit orders; the top-right list shows "✔ ready" for whoever has handed theirs in; the town acts and looks identical in both tabs (same fights, same deaths).
- [ ] From day 3, a miracle cast in one tab appears in both tabs a fraction of a second later.
- [ ] Closing the guest tab: the host sees "PLAYER LEFT", a bot takes the faction next dawn. Closing the host tab: guests see "The host left".
- [ ] No pause or speed buttons online. "Back to the menu" replaces Rematch.
- [ ] Not tested (no second machine): play across two real devices/networks, strict firewalls (no TURN relay is set up, so a few networks will not connect), and tab throttling when a player switches tabs for a long time.
