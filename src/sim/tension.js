import { TENSION } from '../config/tunables.js';

// A single 0..100 number for "how bad is it right now". It drives the sound layers, the
// tension meter in the HUD, and the "Tension rising" warning.
// world.drama is a short-lived spike (kills, gunshots) that fades out; world.baseTension is
// the slow background level that grows with the turn number and sudden death.

/** During the sim phase: react to fights happening right now. */
export function updateTension(world, dt) {
  let attackers = 0;
  let fleeing = 0;
  let glaring = 0;
  for (const v of world.villagers) {
    if (!v.alive) continue;
    if (v.state === 'attack') attackers++;
    else if (v.state === 'flee') fleeing++;
    else if (v.brewId >= 0) glaring++;
  }
  world.drama *= Math.exp(-dt / TENSION.dramaFadeSeconds);
  const target = Math.min(100, attackers * TENSION.perFighter + fleeing * TENSION.perFleer + glaring * TENSION.perGlarer + world.drama + world.baseTension);
  world.tension += (target - world.tension) * Math.min(1, dt * TENSION.easeRate);
}

/** Between turns: the town calms down toward its background level. */
export function settleTension(world, dt) {
  world.drama *= Math.exp(-dt / TENSION.dramaFadeSeconds);
  world.tension += (world.baseTension - world.tension) * Math.min(1, dt * TENSION.settleRate);
}
