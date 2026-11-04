# Evaluation repair branch

Base: 5f4e6992ca89d80e24bf6054e7532c986692a80c. Branch: fix/critical-evaluation.

The original main worktree is preserved. This copy has not been pushed, merged or deployed.

## Changes

- Replay restores exact original values and references instead of reusing Float32 recording values as simulation state.
- Seize preserves its destination and subject through local and online submission.
- Order/card/power validation rejects malformed shapes and inherited IDs without exceptions. Network packets use whitelisted canonical fields, bounded future submissions and one queued use of each miracle.
- State diagnostics include full villager state, hands, orders, events and all RNG streams. Rendering no longer changes authoritative tension while players wait. Dawn resets heat deterministically. Seeded outcomes can change as a result of these fixes.
- Bombs and Fireballs carry explicit source ownership. A bomb still credits its owner after that faction has no living credit proxy. Public news keeps owners secret; the final reveal labels recorded causes and uncertain influences separately. Historical factions and beliefs come from event snapshots.
- Own-faction Love cannot overwrite existing partnerships. Sickness cannot heal a low-HP villager and uses seeded randomness between tied largest factions.
- Phone/tablet panels collapse and preserve drafts, with the submit button outside the scrolling content. Live map targeting collapses the sheet. Desktop panels scroll without covering submission.
- Menu and roster dialogs trap focus, close with Escape, restore focus and clean up listeners. The villager roster shares public information with hover and hides unrevealed temperaments. Controls have accessible names and visible keyboard focus.
- Hotseat clocks use the saved setting. Fireball text explains allied HP immunity. Difficulty text discloses influence modifiers and extra arming.
- Stand Down is read before the active-chase branch returns. It stops voluntary pursuit while immediate self-defence remains possible.
- Parser tests assert outcomes, Hunt runs outside peace, Escort requires a living target, Stand Down starts from a real chase, and unavailable guess metrics report N/A.
- Card trials preserve real hands and existing bot orders/RNG calls. The zero-card baseline plays zero cards in the test seat.

## Balance

Core fixes narrowed the aggressive/passive bot gap in 320 matched, rotated matches. Warmonger 105/264 (39.8%), opportunist 85/244 (34.8%), pacifist 63/272 (23.2%), gossip 40/240 (16.7%), chaos 27/260 (10.4%). These are appearances against mixed bot opponents, not faction win rates or human skill results. Rotations share seeds, so observations are correlated.

An optional `--candidate` experiment in balance-study.js adds defensive decisions to pacifist/gossip policies. It improved pacifist results but worsened gossip results in the matched sample. It is not enabled in the game. No faction stat buffs, card damage changes or victory-rule changes were made to force equal bot wins.

Corrected 40-match real-hand trials: baseline 9 wins, Rally 13, Bomb 13, Treaty 14, Forged Letter 8, Matchmaker 9. This sample is too small to justify a card nerf and does not support the earlier near-guaranteed Rally claim.

## Verification limits

Automated checks and screenshots are evidence, not proof of a perfect game. Physical phone controls, listening to audio, assistive-technology behavior, long sessions, cross-device/network connections and human strategy/fun still need owner playtesting. Full evidence is saved beside this repository in Tiny-Gods-Fix-Verification.
