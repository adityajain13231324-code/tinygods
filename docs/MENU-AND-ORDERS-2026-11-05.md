# Menu and order polish, November 5

Built on `cc3a121` on `fix/critical-evaluation`.

## Requested behavior

- Quiet 50 ms menu click feedback for mouse, touch and keyboard. It follows the existing Sound setting, starts only after interaction, stays silent for disabled controls/typing, and releases its audio context when the online lobby removes the menu. Blocked or unavailable audio cannot stop navigation. No tone nodes are scheduled while audio resume is denied.
- Exact watermark `@adityajain1323` below the menu play options, in document flow with phone safe-area spacing.
- Quick actions prefer strength 3 and use the remaining 1-2 points when needed. Strength stays editable. Each rival row offers Scare, Love, Run and Accuse from turn 1, plus Attack after the peaceful opening.
- Regular influence income is 4 per dawn instead of 5. Carryover cap 3, comeback bonus 2, card/event rewards and difficulty modifiers remain.
- Competing physical orders share eligible own villagers in proportion to strength. With 12 eligible villagers, Arm 3 plus Scare 1 assigns nine to Arm and three to Scare. Named/count subjects, work caps and minimum seizure teams constrain the split. Unarmed villagers are prioritized for Arm; already armed villagers can handle Scare. Squads do not receive both conflicting tasks. Existing neutral trust-based responses remain.
- Armory runners finish their errand before voluntary arguments, partner duties or new fights. Immediate self-defence, panic and grief can still interrupt. Strength is an allocation/effect weight, not a guarantee of completion: finite stock, travel time, casualties and other constraints still apply.
- Physical-task previews use the same pure planner as submission. Hovering or editing a staged order shows the allocation for the full plan without consuming simulation RNG. The menu guide explains the split.
- Scare still adds fear and personal grievance. Directly intimidated victims now also lose opinion of the actual scarer's faction, gradually at one point per second per strength while exposed, floored at -100. Distant faction members do not gain unexplained resentment, and the issuing player is not revealed through a neutral scarer.
- Victory begins the battle-to-calm crossfade immediately in the final recap, then keeps calm music on the results screen. The warm chord resumes immediately instead of waiting for its seven-second scheduler. World tension is preserved, and mute remains active.

## Verification

All ten groups of `npm run check` passed: 39 regressions, simulation smoke, parser, orders, verbs, powers, effects, six delayed-network matches, 12 fuzz matches and production build.

New checks cover 32 seeded 9:3 plans and 300 mixed squad plans: unique ownership, subject/cap limits, exact preview/application agreement, proportional strength edits, minimum seizure teams, eligible weapon fetchers, danger priority and unchanged RNG during planning. Income/carryover and day-one Accuse are tested explicitly. The Earthquake effect test now creates a controlled six-fighter fixture instead of depending on bots starting enough fights within eight seconds; its original stopping threshold is retained.

Browser checks passed at 320x568, 375x812, 812x375, 919x720, 1280x800, 1440x900 and 1920x1080 across the menu/gameplay drivers. They check exact watermark placement, no autoplay, one sound per activation, mouse/keyboard/touch, mute persistence, denied/unavailable audio and blocked storage, cleanup after menu removal, launch/back navigation, compact faction buttons, card containment, editable strength, four-point budget and the actual submitted 9:3 squad split.

The actual victory-audio check measured battle drone/chaos gains of about 0.106/0.096 before victory, falling to about 0.0013/0.0012 after 3.5 seconds, while calm music reached about 0.084. Mute stayed active and battle heartbeat/shouts did not restart. This validates the audio graph, not human listening quality.

The illustrated guide, news preference, draft/timeout submission, roster, settings and 42 scroll/minimize checks also passed. Built-preview solo journeys finished on easy day 8, normal day 10 and hard day 7; four-human hotseat finished on day 9. Journeys use UI submissions with accelerated rendered frame calls, and solo can skip the remaining bot match after human elimination. A developer-server hard-mode journey initially timed out finding the order textbox; the isolated production-preview journeys completed without errors, and a second built hard-mode journey completed on day 7 again.

A real four-context PeerJS/WebRTC match finished on day 9 with 55 actions and 28 transitions. All final simulation states and RNG streams matched, with no page errors, desyncs or lobby retries. The six delayed-network simulations additionally exercise bots and dropouts.

## Balance sample

Same 160 seeded/rotated lineups and 45-second day preset as the preceding build:

| Personality | Before | After |
|---|---:|---:|
| Warmonger | 33.6% | 30.5% |
| Pacifist | 17.6% | 23.5% |
| Opportunist | 35.9% | 23.4% |
| Gossip | 25.9% | 37.9% |
| Chaos | 12.9% | 11.4% |

Mean length changed from 11.78 to 11.18 turns. These are wins per personality appearance against mixed bot opponents. Seeds/rotations are correlated and the changes combine income, allocation and resentment, so this does not isolate a single mechanic or prove human balance. Gossip was strongest in this sample. Twelve decision-traced matches found zero villagers stuck away from their destination.

Detailed local evidence and reproduction drivers are in the sibling `Tiny-Gods-Menu-Polish` directory. Physical devices, listening to the audio mix, assistive technology, long sessions, restrictive networks and human strategy/fun remain owner playtests. Main is preserved; this work remains on the existing fix branch.
