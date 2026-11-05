# Powers upgrade, 5 November 2026

The power dock now holds 21 powers in a compact scrolling grid. Nearby targeting selects exactly one eligible villager, highlights that recipient and shows a radius and held-power icon. Invalid single-target circles turn red. Selecting a power hides the ordinary villager hover card so it cannot cover the target. Escape cancels aiming. Gust uses one hold, drag and release; short drags and a second touch do not spend power. Typed place-directed Gust remains available.

Miracle heals only an injured member of the casting faction. Arm still equips exactly one own unarmed villager. Lightning costs 1 power. Gun and shotgun primary hits roll a seeded 20% critical chance after a confirmed hit, dealing double damage. Shotgun splash and rockets do not headshot.

| New power | Cost | Behavior |
|---|---:|---|
| Time Bomb | 2 | Aimed placement, existing 12-second fuse and bomb blast. Own faction takes no HP damage. Refused without spending power if fewer than 12 seconds remain before dusk. |
| Blackout | 3 | Eight seconds of night and confusion. No new attacks; living allies immediately heal up to 20 HP, capped at 100. Existing bombs and flying rockets remain live. |
| Whirlpool | 3 | Three-second medium vortex with inward pull and up to 30 HP damage at the centre. Hurts every faction, including the caster's allies. Aegis still reduces its damage. |
| Rocket Launcher | 3 | Aimed crate. First nearby living, unfrozen villager of any faction picks it up. Five rockets, half-Fireball damage, blasts spare the holder's faction. No reload through Arm. Disappears when empty. Unclaimed crates expire at dusk. |
| Freeze | 2 | Everyone in its area stops moving and attacking for four seconds. Frozen villagers can still be damaged. |
| Strength | 1 | One ally gets a seeded 10-50% weapon damage bonus, rolled once, until dusk. Does not stack. |

All powers retain the three-point daily budget and once-per-type-per-turn limit. Days 1 and 2 remain peaceful. Time Bomb, Whirlpool and Rocket Launcher join the day-5 damaging-area gate. Temporary new statuses, ground entities and projectiles clear at dusk; held launcher ammo remains until used. Water, ice, night, crate, rocket and Strength visuals use cached shapes and bounded sprite reuse. Reduced-motion mode keeps vortices steady. Recaps record persistent power visuals separately and restore the exact live simulation state after playback.

Bots can use Blackout for a wounded group, Strength for an active fighter, and Whirlpool on rival crowds. Public news and recorded causes distinguish rockets, Whirlpool and Time Bomb, including neutral launcher holders and powers whose caster has already been eliminated.

## Verification

- `node tools/verify.js`: all ten groups pass, including 53 regressions, behavior suites, six delayed-network matches with dropout scenarios, 12 mixed-power fuzz matches and production build.
- Four independent Chrome clients completed an actual PeerJS/WebRTC match at day 11. All new powers plus Lightning and drag-directed Gust were applied. No desync reports or page errors; final canonical state and all RNG streams matched across clients. Some clients watched replays.
- All 21 powers exercised through browser controls. Six viewport layouts, nearby Arm, hover previews, full names, scrolling, drag, Escape, empty circles, short drags and multi-touch cancellation passed.
- Complete solo journeys on easy, normal and hard; complete four-seat pass-and-play; existing menu sound/watermark, order allocation, guide, news preference, settings and victory-audio browser checks passed.
- Final stable-preview scroll run passed all 42 checks across three sizes, including the initially reported jump-to-top case and minimized town board. Earlier automation runs overlapped development reloads; final checks used the built preview.
- Synthetic local rendering stress: four vortices, 32 flying rockets, four crates, all villagers frozen and Blackout. About 60 observed FPS, 4.5 ms p95 frame work. All 40 pooled sprites hid after clearing; darkness faded to zero. These measurements describe this desktop/headless browser, not target-phone performance.
- 160 bot matches with 45-second town turns completed. Mean length 10.325 turns; seat wins 38/41/47/34. Personality results remain uneven, especially Chaos. This is descriptive, not proof of human balance.

Physical touch devices, separate-network TURN connectivity and human balance remain unverified. No test suite can guarantee zero bugs.

Potential next work: improve Chaos bot risk assessment, add a short visible incoming-rocket warning, and let the final battle report explain the damage source for each loss. These are suggestions, not changes in this update.
