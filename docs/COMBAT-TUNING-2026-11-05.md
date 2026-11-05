# Combat power tuning, 5 November 2026

| Mechanic | Current rule |
|---|---|
| Blackout | Costs 3, lasts 12 seconds. Deals a seeded 5-10 damage to each living rival/neutral and heals allies by up to 20. Aegis reduces damage normally. Attacks stop during night; existing hazards remain live. |
| Blackout targets | Breaks active attack locks. After daylight, former fighters prefer a different valid nearby foe for four seconds when one is available. Self-defence, explicit Hunt targets and Stand Down retain their meaning. |
| Whirlpool | Up to 39 damage at the centre over three seconds, 30% more than before. Still damages every faction, including allies. Blue HP-loss numbers show continuing damage above the water effect. |
| Freeze | Lasts seven seconds, affects rivals and neutrals only. Allies are spared. Frozen targets are 20 percentage points easier to hit, capped at 100% hit probability. Pursuers can keep attacking frozen enemies. |
| Firearm willingness | A loaded gun/shotgun/launcher adds 15 percentage points to the spontaneous engagement roll. Guns escalate 15% earlier. Explicit Assault/Hunt orders use loaded firearms. Empty guns, healers, badly wounded villagers and Stand Down keep their safeguards. |
| Launcher readiness | Starting a fight no longer resets a loaded launcher to fists. Launchers fire rockets when attacking, with the existing cooldown and five-round limit. |
| Rockets | 30% more damage than the previous version: 65% of Fireball damage. Blast radius grows 15%, from 85 to 97.75 world units. Blasts still spare the holder's faction. |

Blackout now deals area damage, so it joins the existing day-5 damage-power unlock. Days 1 and 2 remain peaceful. Costs and once-per-type-per-turn limits stay the same. Blackout and temporary combat effects clear at dusk.

The 12-second Blackout rules were confirmed with the user. The 15% firearm willingness and radius adjustments sit within the requested tuning range. Whirlpool retains the user's earlier friendly-fire rule.

## Verification

- All ten groups of `node tools/verify.js` pass, including 60 regressions, behavior suites, six delayed-network matches, 12 fuzz matches and production build.
- Forty additional mixed-power fuzz matches finish without crashes or invariant failures.
- Targeted desktop/phone browser checks confirm ally-safe Freeze, night duration/damage/healing, continuing Whirlpool HP numbers, and a rival picking up and firing the launcher.
- All 21 power controls, six viewport layouts, 20 input regressions, complete solo journeys, four-seat pass-and-play, settings, guide, quick actions, scrolling, menu/victory audio and watermark checks pass.
- A complete four-client PeerJS/WebRTC match finishes with identical full canonical state and RNG streams, no desyncs and no page errors. It records 25 rocket launches from six launcher pickups.
- Regression cases verify exact damage/radius changes, frozen accuracy boundaries, Blackout retargeting for natural fights and Assault orders, lethal Blackout provenance, launcher escalation, dry-gun safeguards and exact replay restoration.

Testing is local, as requested. Separate-network TURN, physical-phone performance and human balance have not been established by these checks.
