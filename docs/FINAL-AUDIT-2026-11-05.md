# Reliability audit, 5 November 2026

Six reproducible input issues were fixed on `fix/critical-evaluation` after the powers upgrade:

1. **Moving Gust targets could reverse the cast.** A rightward drag could push left when its villager moved past the old release point. The UI now sends a bounded direction vector, applied relative to the villager at the authoritative cast tick. The preview follows that villager and shows the actual bystander radius. Typed place destinations and earlier absolute targets still work.
2. **Secondary mouse clicks could spend power.** Right and middle clicks now leave targeting and resources alone. Only primary-pointer gestures can cast.
3. **Typed results disappeared on a power-budget refresh.** Success and error feedback now persist through rebuilding. Partially successful command chains explain both what happened and what failed. A typed cast also cancels any earlier map aim.
4. **Menu updates dropped typing or keyboard focus.** Draft text, caret position, typing focus, Whisper choices and scroll positions now survive rebuilding, including the Time Bomb cutoff.
5. **Strength could silently choose a different faction.** Naming a rival in a Strength command now produces a clear rejection with no power spent, rather than buffing an ally.
6. **Escape failed while typing.** The aim-cancellation handler now observes Escape before the command box suppresses camera shortcuts. It cancels from both the map and the text input.

Gust also refuses a target that dies during the drag without charging power. Successful point/button casts collapse the mobile sheet so the effect remains visible; typed-command feedback stays accessible in the open sheet.

## Checks

- All ten groups of `node tools/verify.js` pass, including 54 regressions, six delayed-network matches with disconnects, 12 fuzz matches and a production build.
- Forty additional mixed-power fuzz matches pass with no crashes or invariant failures. New Gust direction packets are included in network and fuzz coverage.
- Twenty browser input scenarios pass across desktop and phone layouts. Each primary issue has a reproduced baseline and a regression check.
- All 21 powers, six viewport layouts, full easy/normal/hard solo journeys and a four-seat pass-and-play match pass.
- A four-client PeerJS/WebRTC match finished at day 10 with all new powers used, no page errors or desyncs, and identical complete canonical simulation state and RNG streams. Some clients watched replays.
- Existing menu audio/watermark, order allocation, guide/news preference, settings, 42 scroll/minimize checks and victory-audio checks pass.

Browser checks use a built preview. They combine real browser input with accelerated rendered frame calls and controlled fixtures for specific edge cases. Four clients run on the same desktop, so this does not verify separate-network TURN behavior or physical-phone performance. Hosted gameplay testing was excluded at the user's request after the preview required Vercel team authorization.

## Reproduce the input checks

The optional browser checks need Playwright and Chromium installed, plus a running built preview at port 4181:

```sh
npm install --no-save --package-lock=false playwright
npx playwright install chromium
npm run build
npm run preview -- --host 127.0.0.1 --port 4181 --strictPort
# In another terminal:
npm run test:browser-inputs
```

`GAME_TEST_URL`, `BROWSER_EXECUTABLE` and `TEST_OUTPUT_DIR` can override the URL, browser executable and artifact directory. Generated `test-results` are ignored by Git.
