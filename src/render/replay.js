import { REPLAY } from '../config/tunables.js';
import { FIELDS, decode, encode } from '../sim/recorder.js';

/**
 * Plays a highlight clip back in the real town. It works by writing the recorded frames
 * into the live villager objects, then restoring their true state afterwards. That is safe
 * only because the simulation is paused during the recap and guess phases, so stop() MUST
 * run before the next turn starts (main.js does this every frame).
 */
export class Replay {
  constructor({ game, camera }) {
    this.game = game;
    this.camera = camera;
    this.highlight = null;
    this.saved = null;
    this.time = 0;
    this.alpha = 1;
  }

  get active() {
    return this.highlight !== null;
  }

  play(h) {
    const rec = this.game.recorder;
    if (!rec || rec.frames.length < 2 || !['recap', 'guess'].includes(this.game.phase)) return;
    if (!this.active) this.saved = this.snapshot();
    this.highlight = h;
    this.time = Math.max(h.t0, rec.start);
    this.camera.cut(h.x, h.y - 10, { zoom: REPLAY.zoom, hold: h.t1 - this.time + 1 });
    this.update(0);
  }

  stop() {
    if (!this.active) return;
    this.restore();
    this.highlight = null;
    this.camera.hold = Math.min(this.camera.hold, 0.01); // zoom back out
  }

  update(dt) {
    if (!this.active) return;
    const h = this.highlight;
    const rec = this.game.recorder;
    this.time += dt;
    if (this.time > Math.min(h.t1, rec.lastTime)) {
      this.stop();
      return;
    }
    const pos = rec.position(this.time);
    const i = Math.floor(pos);
    const a = rec.frames[i];
    const b = rec.frames[Math.min(i + 1, rec.frames.length - 1)];
    this.alpha = pos - i;
    this.game.world.villagers.forEach((v, k) => {
      decode(b, k * FIELDS, v);
      v.px = a[k * FIELDS];
      v.py = a[k * FIELDS + 1];
    });
  }

  snapshot() {
    const n = this.game.world.villagers.length;
    const data = new Float32Array(n * FIELDS);
    this.game.world.villagers.forEach((v, k) => encode(v, data, k * FIELDS));
    return data;
  }

  restore() {
    this.game.world.villagers.forEach((v, k) => {
      decode(this.saved, k * FIELDS, v);
      v.px = v.x;
      v.py = v.y;
    });
    this.saved = null;
  }
}
