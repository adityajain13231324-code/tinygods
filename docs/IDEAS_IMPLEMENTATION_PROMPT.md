# Tiny Gods: implement the selected idea bank

You are a senior game designer, gameplay engineer, UI designer, and QA lead working on Tiny Gods. Implement **all 17 selected ideas** in `docs/IDEAS.md` as a cohesive, polished game update. The file is the source of truth for the ideas, but inspect the current code and playable build before changing anything. Some ideas may already be partly implemented. Keep working parts, improve weak parts, and avoid duplicate systems or controls.

## Product goal

Make the town feel alive, funny, readable, and strategically expressive. A player should understand what happened, why it happened, and what they can do next. Preserve the game's identity: four factions, independent villagers, secret influence orders, powers, cards, and a town whose stories emerge from the simulation. New depth should be discoverable without turning the command panel into a dense manual.

## Workspace and delivery rules

1. Work on a new branch or worktree from the latest `fix/critical-evaluation` branch. Do not overwrite or merge the existing game or publish to production.
2. Before coding, map each idea to existing files, mechanics, UI surfaces, event records, and tests. Mark it `absent`, `partial`, or `complete` with evidence. Note dependencies and conflicts between ideas.
3. Make a concise implementation plan with milestones and concrete acceptance checks. Then implement every milestone. Do not stop after a prototype or a cosmetic approximation of a gameplay idea.
4. Maintain a short decision log for rules left open in `IDEAS.md`. Choose conservative, clearly explained defaults where possible. Ask the owner only when two plausible choices would materially change the game's intent. Do not silently replace an idea with a different feature.
5. Keep simulation state deterministic across identical seeds and online clients. Rendering and sound must not consume the simulation random generator. Put balance values in the existing tuning configuration.
6. Commit coherent milestones. Push the completed branch after all gates pass. Report the branch, commit, test results, and any remaining limitations. Do not claim a browser, device, remote network, or export format was tested unless it actually was.

## Implement the 17 ideas

### Match stories and character

1. **Richer ending:** Keep the winner prominent. Award titles using recorded evidence, with no invented achievements. Add a short replay control for each qualifying award moment. If a moment has no valid recording, omit its replay control and explain the award from its event evidence. Preserve the existing recap, truth reveal, rematch, and mobile scroll behavior.
2. **Combat personality:** Give frightened launcher holders an over-the-shoulder firing pose, confident gunners a brief readable aim, and last-rocket holders a visible check. Make the pose follow actual state and action. Do not change hit chances merely to support animation.
3. **Personal rivalries:** Remember specific villagers who scared, injured, rescued, or betrayed each other. Show occasional context-aware reactions, including forgiveness after healing or a real peace event. Bound memory and dialogue frequency.
4. **Event-aware dialogue:** Expand lines for healing, freezing, empty armories, last rockets, betrayals, cover breaks, fire, and other tracked events. Use faction voice, relationship, nearby actors, and current danger. Prioritize important reactions, prevent repetition, and cap simultaneous bubbles.
5. **Wandering troublemaker:** Add a distinct neutral with understandable goals and visible mischief. Weapon theft and rumor spreading must use existing rules and event attribution. Make protect, recruit, and chase choices discoverable without granting this character unfair immunity.

### Strategy and combat

6. **Conditional orders:** Support clear, bounded rules such as “Guard the armory, retreat to the park if outnumbered.” Provide a compact builder and natural-language parsing where practical, preview the condition and fallback, and explain when it activates. Define conflict resolution against other orders, panic, and immediate danger.
7. **Squad formations:** Add spread out, stick together, and protect the centre. Show the chosen formation, affected villagers, and the expected tradeoff. Keep formations compatible with proportional influence assignment and independent villager decisions. Avoid oscillation and stuck groups.
8. **Real cover and destructible props:** Give benches, stalls, walls, and selected props a cover value and clear collision or line-of-fire behavior. Villagers should seek and leave cover for sensible reasons. Rockets and other qualifying blasts can destroy it, changing subsequent combat. Existing decorative breakage alone does not satisfy this idea.
9. **30% weapon drop on death:** Roll once for an eligible armed death, record the result, and make the dropped weapon visible and collectible. Define retained ammo, lifetime, and pickup priority. Empty launchers must not create useful ammunition. Test simultaneous deaths, owner death, despawn, and online sync.
10. **Blank Rounds card:** Sabotage a clearly targeted rival's first few gunshots. Shots expend ammunition but deal no damage and emit confetti plus a brief confused reaction. Define and display the remaining blank shots, how it interacts with rockets, shields, critical hits, and death. Avoid hidden rules that look like a hit-detection bug.
11. **Free Cake! card:** Invite villagers to a selected location. Idle and curious villagers can investigate, while danger, duties, and existing orders can override the lure. Show the invitation and arrivals. Prevent it from becoming guaranteed mind control or an unavoidable ambush.
12. **Leader card:** A once-per-faction-per-match card costing 3 power. Choose one living allied villager, double their maximum health, fully restore health, and grant Strength using the existing Strength rules unless the decision log justifies a different duration. Show the one-use limit in a concise hover and disabled state. Record the leader in events, replay, recap, and multiplayer state. Prevent recasting after death or faction changes.

### Powers and environment

13. **Power combos:** Implement Rain plus Lightning chain zap and Gust moving a planted bomb. Show a preview and an unmistakable activation cue. Bound bonus damage, chain range, and timing. Preserve ally-damage rules of the base powers unless a combo explicitly states otherwise.
14. **Environmental chain reactions:** Scatter market goods, allow a small patch of dry grass to burn, and let water extinguish it. Telegraph hazards in time for a response. Keep spread, lifetime, damage, and active-object counts bounded. Do not obscure combat or tank FPS.

### Modes, places, and sharing

15. **Optional chaos challenges:** Implement Everyone Starts Armed, One Villager per Faction, Explosive Deliveries, and Random Powers Every Turn as separate, clearly labeled modes. Make each reproducible by seed and compatible with victory, AI, cards, replays, and multiplayer rules. State if a mode changes achievements or records.
16. **Different town layouts:** Add canal bridges, crowded market streets, scattered farms, and hill village layouts. Pathfinding, spawns, props, cover, targeting, camera, location labels, and power placement must respect each layout. Provide a setup choice and a fair random option. Verify no unreachable armories, trapped villagers, or invalid spawn points.
17. **Funny, shareable highlight clips:** Let players choose a recorded moment and save a short clip with the villager's name, a funny event-specific caption, and `@adityajain1323`. Keep clips faithful to the actual event. Offer a local export format supported by the browser, with a clear fallback when recording APIs are unavailable. Bound capture duration, memory, and file size. Never upload a clip without an explicit player action.

## UI and art direction

- Extend the established Tiny Gods visual language. New setup choices should fit the home and multiplayer flows; live controls should remain compact and scannable. Use progressive disclosure for complex conditional orders, formations, challenge rules, and leader targeting.
- Keep the map as the primary feedback surface. Show target previews, cover state, conditional triggers, combo readiness, hazards, dropped weapons, and leader identity where the player is looking. Keep the right panel concise and preserve its scroll and position while clicking.
- Add short, interactive explanations to How to Play for the new systems. State the goal first, then show what the player chooses and what villagers actually do. Update settings and tooltips with plain language.
- Test desktop, narrow laptop, tablet, and portrait mobile. Avoid clipped cards, overlapping menus, off-screen controls, tiny touch targets, unreadable text, and unnecessary motion. Support keyboard navigation, visible focus, reduced motion, color and shape cues, and effects-off settings.
- Use animation and audio to clarify cause and consequence. Pool particles, cache reusable textures, cap decals and active hazards, and avoid per-frame allocations or full-scene redraws where possible. Keep cosmetic settings from changing simulation outcomes.

## Engineering and QA gates

1. Add focused tests for each new rule, edge case, and deterministic event. Extend full-match fuzz tests and online lockstep tests. Check save, replay, reconnect, and rematch behavior where relevant.
2. Exercise the built game in a real browser: setup, guide, orders, cards, powers, challenge modes, all layouts, recap, awards, clip export, settings, and online lobby. Test at desktop and mobile sizes and inspect screenshots. Use a fresh preview URL so tests cannot pass against a stale server.
3. Benchmark representative peaceful, crowded-combat, and maximum-effects scenes with each layout. Compare with the starting branch on the same machine and settings. Investigate meaningful FPS or memory regressions; keep object counts bounded.
4. Run the repository's complete check, build, browser regression suites, and Git diff checks after final changes. Fix failures, then rerun the affected complete gate. Confirm no known crash, desync, blocked progression, misleading feedback, or clipped primary control remains.
5. Deliver a short player-facing change summary and a technical verification ledger. Distinguish implemented features from future ideas and identify anything that still needs a real remote or device test.
