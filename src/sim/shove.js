import { clampIn } from './world.js';

// Knockback: a villager gets a burst of velocity that fades away. Used by gusts, lightning and bombs.
// (Their own walking carries on underneath, so a shoved villager is pushed, not teleported.)
export const KNOCK_DECAY = 3.2; // per second

/** Push villager v away from (fromX, fromY) at `speed` px/s (it travels about speed / 3.2 px). */
export function shoveFrom(v, fromX, fromY, speed) {
  const dx = v.x - fromX;
  const dy = v.y - fromY;
  const d = Math.hypot(dx, dy) || 1;
  v.kx += (dx / d) * speed;
  v.ky += (dy / d) * speed;
}

/** Push villager v toward (toX, toY). */
export function shoveToward(v, toX, toY, speed) {
  shoveFrom(v, 2 * v.x - toX, 2 * v.y - toY, speed);
}

/** Advance one villager's knockback by dt seconds. */
export function stepKnockback(world, v, dt) {
  if (!v.kx && !v.ky) return;
  [v.x, v.y] = clampIn(world, v.x + v.kx * dt, v.y + v.ky * dt);
  const f = Math.exp(-dt * KNOCK_DECAY);
  v.kx *= f;
  v.ky *= f;
  if (Math.hypot(v.kx, v.ky) < 6) { v.kx = 0; v.ky = 0; }
}
