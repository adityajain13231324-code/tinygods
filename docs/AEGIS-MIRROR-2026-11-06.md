# Aegis mirror shield, 6 November 2026

The existing Aegis power now creates a visible mirror shield for **six seconds**, or until its first bullet reflection. It still costs **one power**, targets one nearby living villager and works once per turn. The power menu retains 21 entries and its ascending-cost order.

## Rules

- While intact, Aegis reduces normal combat, blast and continuous-power damage by 60%, preserving its previous protective effect over the shorter duration.
- The first successful gun or shotgun hit is blocked completely for that shielded villager. The incoming hit's damage, including its existing Strength and critical modifiers, returns to the original shooter. No additional accuracy/headshot roll or ammunition is used.
- The mirror shatters after reflecting. A miss leaves it intact. The effect expires at exactly six seconds and clears at dusk.
- Shotgun collateral can trigger a shield independently; other unshielded bystanders still take normal splash damage. Reflection protects one villager, not everyone in the blast.
- Melee, rockets, explosions and continuing power effects do not reflect or consume it. Reflected shots cannot bounce again; the original shooter's own protective effects can still reduce the return damage.
- Rally's short protection uses a separate timer. Aegis and Rally do not multiply their reduction, and shattering Aegis does not erase Rally.
- The Aegis caster owns reflected kill attribution, including when shielding another faction or when the caster has no living credit proxy. Public news describes a reflected bullet without exposing the secret caster. The final attribution names Aegis rather than a Time Bomb.

## Presentation

A translucent glass outline follows the protected villager. A reflection produces shards, a cyan return tracer, a short metallic sound and a `REFLECT!` label. The blocked impact does not spray blood onto the protected villager. Hover and touch/keyboard villager information include the remaining shield time.

The existing Aegis name and icon remain. Typed `mirror shield` and `mirror guard` commands also resolve to Aegis. Recorded villager frames include the mirror timer and owner; playback shows intact/shattered states and restores exact live state and RNG afterward.

## Local verification

- All ten `node tools/verify.js` groups pass: 83 regressions, behavior suites, six delayed-network matches, 12 fuzz matches and production build. The network tool now includes Aegis, and fuzz invariants check its state fields.
- Ten dedicated regressions cover cost/duration, blocking and reflection, misses, exact expiry, critical/Strength damage, no reflection loops, shotgun collateral, non-bullet damage, Rally overlap, kill attribution, eliminated casters, replay restoration, dusk cleanup and typed commands.
- Desktop (1440x900) and phone (375x812) browser checks confirm radius targeting selects one villager, the correct cost, persistent shield art, shooter damage, shattering, return tracers, expiry and compact menu layout. Screenshots were visually reviewed.
- Twenty existing browser input regressions and all 21 powers across six viewport layouts pass.
- A full four-client PeerJS/WebRTC match ends on turn 11 with 102 actions, 34 transitions, one mirror reflection, identical canonical state/RNG streams, no desyncs and no page errors.

Evidence and reproducible browser scripts are beside this checkout in `../Tiny-Gods-Aegis-Mirror/`. These are local checks, following the user's preference. Separate-network TURN, physical-phone frame rates and exhaustive human balance are not established.
