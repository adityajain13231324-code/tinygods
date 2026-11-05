# Retreat fire and living targets, 5 November 2026

## Gameplay

- Loaded launcher holders can fire while fleeing or following Run/Avoid orders. Their movement, retreat destination and state remain intact.
- At each ready firing opportunity, the chance is 75%, rising to 90% against someone actively pursuing the holder. A failed opportunity still waits the normal 1.8-second cooldown, rather than rerolling every tick.
- Pursuers take priority over other nearby hostiles. Range, five-shot ammunition, ally protection and normal blast damage are unchanged. Partners and friendly groups are excluded. Stand Down, Freeze, Blackout, peaceful days, carrying and sleep keep their safeguards. A truce blocks starting a new fight; direct self-defense retains its existing exception.

## Menus and targets

- The compact power grid sorts powers from 1 to 3 power. Existing order within each cost stays stable. The scroll area and overall menu size stay the same.
- Group-targeted cards show living eligible targets. Neutrals remain available for cards that support them; Spy can still target your own faction. An unavailable target clears without discarding unrelated staged orders. Cards with no eligible targets are disabled with an explanation.
- Manual order targets and Whisper use the same living-group checks. Typed commands and authoritative validation reject empty groups before spending resources. Cards recheck at application time in case an earlier dawn action removed the target.
- Spy's extra power is represented by a fourth lit power dot.

## Related corrections

- Forged Letter against neutrals no longer creates an invalid fifth notoriety entry. Its description now distinguishes faction notoriety from neutral opinion effects.
- Spoiled Bread cannot heal villagers already below its normal HP floor. It deals up to 20 damage and remains nonfatal.
- Defection and neutral recruitment cannot bring back a formally eliminated faction.

## Verification

The changes have dedicated simulation regressions in `tools/retreat-targets.test.js`. Reproduce the complete simulation, behavior, delayed-network, fuzz and build checks with `npm run check`. Optional input checks use `npm run test:browser-inputs` with Playwright and the built preview on port 4181.

Verified locally on the final runtime build:

- All ten verification groups, including 69 regressions, six delayed-network matches and 12 fuzz matches, pass. Forty additional mixed-power fuzz matches also pass.
- Twenty browser input regressions pass. Targeted checks cover all nine group cards, live target removal, preserved staged orders, retreat firing, all 21 sorted power costs and the fourth bonus-power dot on desktop and phone layouts.
- All 21 powers and six viewport layouts pass the broader power checks. Menu audio/watermark, guide, quick actions, news settings, scrolling, minimized board and controls regressions pass.
- Easy, normal and hard solo matches finish; a four-human-seat pass-and-play match finishes after eight turns. These use actual UI submissions with accelerated simulation frames.
- Four independent browser contexts complete an actual PeerJS/WebRTC match after 11 turns, with 77 actions, identical canonical state and RNG streams, no desyncs and no page errors.
- Synthetic effect stress clears pooled visuals and darkness correctly; reduced-motion rendering remains steady. This is a local headless rendering check, not a device-performance guarantee.

Local browser evidence and full-match results are recorded alongside this checkout in `../Tiny-Gods-Retreat-Targets/VERIFICATION.md`. These checks do not establish separate-network TURN connectivity, physical-phone performance or exhaustive human balance.
