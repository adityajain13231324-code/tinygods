# Power carryover, 5 November 2026

Unused power now carries between turns for every active faction, including bots. Each dawn from day 3 adds the normal 3 power to the remaining balance. There is no carry cap. Save 2, start the next turn with 5. Spy's unused bonus point carries too.

Days 1 and 2 still grant no power. Damage powers still unlock on day 5. Each distinct power can still be used once per turn; its usage flag resets at dawn independently of the saved balance. Temporary effects retain their existing durations. Eliminated factions cannot cast and their balances clear at the next dawn. New matches start with zero saved power.

The power dock keeps its compact size and ascending-cost order. Up to six points are shown as dots; larger banks use three symbolic dots and an exact numeric total, avoiding rows of dots stretching the menu. The guide, Spy description, dock hint and private recap notes explain saving. Draft miracle text, Whisper choices and stale feedback clear when the turn or player changes.

## Local verification

- All ten `node tools/verify.js` groups pass, including 73 regression cases, six delayed-network matches, 12 mixed-power fuzz matches and production build.
- Four new regressions cover peaceful days, accumulating income, spending, per-turn usage reset, Spy carryover, damage unlocks, elimination and fresh matches.
- Real UI submissions across four days confirm that spending 1 of 3 leaves 2 and the next dawn grants a total of 5. Desktop and phone checks cover balances of 5, 7, 60 and 100, compact layout, ascending costs and cleared stale errors.
- Twenty existing browser input regressions, 26 living-target/retreat/power-menu checks, and illustrated guide/quick-action/news regressions pass after the final UI correction.
- A complete four-client PeerJS/WebRTC match ends after eight turns with 53 actions, identical canonical state and RNG streams, no desyncs and no page errors. Saved balances are observed on day 4.

Full logs, reproducible browser scripts and reviewed screenshots are stored alongside this checkout in `../Tiny-Gods-Power-Carry/`. These local checks do not establish separate-network TURN connectivity, physical-phone frame rates or exhaustive human balance.
