import { REPLAY, SIM } from '../config/tunables.js';

// Records the visible state of every villager ten times a second during the sim phase, so
// the recap can replay a highlight. Only the fields the renderer needs are stored, as plain
// numbers in one Float32Array per frame (60 villagers x 18 numbers x 4 bytes = 4 KB).
// Replaying writes these back into the villagers, then restores the live state (see
// render/replay.js), so the real simulation is never touched while a clip plays.

const STATES = ['idle', 'wander', 'seek', 'talk', 'guard', 'attack', 'flee', 'mourn', 'dead'];
const EXPRESSIONS = ['calm', 'happy', 'love', 'angry', 'scared', 'suspicious', 'sad', 'dead'];
const WEAPON_NAMES = ['none', 'pan', 'bat', 'knife', 'gun', 'shotgun'];
const THOUGHTS = [null, 'heart', 'angry', 'sweat', 'question', 'skull', 'shield', 'flag'];

const ACTIVITIES = [null, 'dance', 'rest', 'shop', 'pray', 'train', 'fish', 'garden', 'eat'];

export const FIELDS = 20;
export const FRAME_SECONDS = REPLAY.everyTicks / SIM.tickHz;

export function encode(v, a, o) {
  a[o] = v.x;
  a[o + 1] = v.y;
  a[o + 2] = v.vx;
  a[o + 3] = v.vy;
  a[o + 4] = v.facing;
  a[o + 5] = STATES.indexOf(v.state);
  a[o + 6] = EXPRESSIONS.indexOf(v.expression);
  a[o + 7] = v.hp;
  a[o + 8] = v.alive ? 1 : 0;
  a[o + 9] = WEAPON_NAMES.indexOf(v.weapon);
  a[o + 10] = v.ammo;
  a[o + 11] = v.swing;
  a[o + 12] = v.hitFlash;
  a[o + 13] = THOUGHTS.indexOf(v.thought);
  a[o + 14] = v.thoughtGroup;
  a[o + 15] = v.targetId === null ? -1 : v.targetId;
  a[o + 16] = v.lastDamage;
  a[o + 17] = WEAPON_NAMES.indexOf(v.lastHitWeapon);
  a[o + 18] = ACTIVITIES.indexOf(v.activity);
  a[o + 19] = v.partnerId;
}

export function decode(a, o, v) {
  v.x = a[o];
  v.y = a[o + 1];
  v.vx = a[o + 2];
  v.vy = a[o + 3];
  v.facing = a[o + 4];
  v.state = STATES[a[o + 5]];
  v.expression = EXPRESSIONS[a[o + 6]];
  v.hp = a[o + 7];
  v.alive = a[o + 8] === 1;
  v.weapon = WEAPON_NAMES[a[o + 9]];
  v.ammo = a[o + 10];
  v.swing = a[o + 11];
  v.hitFlash = a[o + 12];
  v.thought = THOUGHTS[a[o + 13]];
  v.thoughtGroup = a[o + 14];
  v.targetId = a[o + 15] < 0 ? null : a[o + 15];
  v.lastDamage = a[o + 16];
  v.lastHitWeapon = WEAPON_NAMES[a[o + 17]];
  v.activity = ACTIVITIES[a[o + 18]];
  v.partnerId = a[o + 19];
}

export class Recorder {
  constructor(count) {
    this.count = count;
    this.reset();
  }

  reset() {
    this.frames = [];
    this.start = 0; // sim time of the first frame
  }

  capture(world) {
    if (this.frames.length === 0) this.start = world.time;
    const a = new Float32Array(this.count * FIELDS);
    world.villagers.forEach((v, i) => encode(v, a, i * FIELDS));
    this.frames.push(a);
  }

  get lastTime() {
    return this.start + (this.frames.length - 1) * FRAME_SECONDS;
  }

  /** Fractional frame position for a sim time, clamped to what was recorded. */
  position(time) {
    const f = (time - this.start) / FRAME_SECONDS;
    return Math.min(this.frames.length - 1, Math.max(0, f));
  }
}
