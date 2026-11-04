import { WORLD, DRAMA } from '../config/tunables.js';

const clamp = (x, lo, hi) => Math.min(hi, Math.max(lo, x));

/**
 * Owns the stage transform: letterboxed full view normally, and a zoom onto a point of
 * interest when the director cuts to something dramatic. Also does screen shake and tells
 * the main loop how much to slow the simulation while we are zoomed in.
 */
export class Camera {
  constructor(app, stage) {
    this.app = app;
    this.stage = stage;
    this.k = 0; // 0 = full view, 1 = fully zoomed
    this.target = 0;
    this.zoomMax = 1;
    this.focus = { x: WORLD.width / 2, y: WORLD.height / 2 };
    this.hold = 0;
    this.shake = 0;
    this.userZoom = 1; // player-controlled zoom (1 = whole town) and view centre
    this.userX = WORLD.width / 2;
    this.userY = WORLD.height / 2;
    this.base = 1;
    this.insetTop = 46; // px reserved for the top strip
    this.insetBottom = 0; // px reserved for the order panel (eased toward insetTarget)
    this.insetTarget = 0;
    this.insetRight = 0; // px reserved for a side panel (desktop), eased toward insetRightTarget
    this.insetRightTarget = 0;
    this.onTap = null; // (screenX, screenY) => void, set by main.js (power targeting)
    app.renderer.on('resize', () => this.apply());
    this.apply();
  }

  /** Zoom in on a world point, hold for `hold` real seconds, then ease back out. */
  cut(x, y, { zoom = DRAMA.zoom, hold = DRAMA.hold } = {}) {
    this.focus = { x, y };
    this.zoomMax = zoom;
    this.hold = hold;
    this.target = 1;
  }

  kick(pixels) {
    this.shake = Math.max(this.shake, pixels);
  }

  get active() {
    return this.target > 0 || this.k > 0.04;
  }

  /** Sim speed multiplier: slow-motion while zoomed in. */
  get timeScale() {
    return 1 - (1 - DRAMA.slowMo) * this.k;
  }

  update(dt) {
    if (this.hold > 0) {
      this.hold -= dt;
      if (this.hold <= 0) this.target = 0;
    }
    this.k += (this.target - this.k) * Math.min(1, dt * (this.target ? 6 : 3.5));
    if (this.target === 0 && this.k < 0.01) this.k = 0;
    this.insetBottom += (this.insetTarget - this.insetBottom) * Math.min(1, dt * 6);
    if (Math.abs(this.insetTarget - this.insetBottom) < 0.5) this.insetBottom = this.insetTarget;
    this.insetRight += (this.insetRightTarget - this.insetRight) * Math.min(1, dt * 6);
    if (Math.abs(this.insetRightTarget - this.insetRight) < 0.5) this.insetRight = this.insetRightTarget;
    this.shake *= Math.exp(-dt * 9);
    this.apply();
  }

  apply() {
    const { width: W, height: H } = WORLD;
    const sw = this.app.screen.width;
    const sh = this.app.screen.height;
    // The town is fitted into the space between the top strip and the order panel, so the UI
    // never sits on top of it. Cinematic cuts still use the whole screen.
    const top = this.insetTop;
    const ah = Math.max(120, sh - top - this.insetBottom);
    const aw = Math.max(200, sw - this.insetRight);
    const cy = top + ah / 2;
    const base = Math.min(aw / W, ah / H);
    const scale = base * (1 + (this.zoomMax - 1) * this.k);

    // Put the point of interest a bit below screen centre, so the news board that pops up
    // above it never covers the action. Then keep the view inside the town while zoomed,
    // so we never show the dark margin.
    const halfW = sw / (2 * scale);
    const halfH = sh / (2 * scale);
    const wantedCentreY = this.focus.y - ((DRAMA.focusScreenY - 0.5) * sh) / scale;
    const fx = clamp(this.focus.x, Math.min(halfW, W / 2), Math.max(W - halfW, W / 2));
    const fy = clamp(wantedCentreY, Math.min(halfH, H / 2), Math.max(H - halfH, H / 2));

    // The player's own view (wheel zoom and drag pan), which the cinematic cuts blend away from.
    this.base = base;
    const userScale = base * this.userZoom;
    const uHalfW = aw / (2 * userScale);
    const uHalfH = ah / (2 * userScale);
    this.userX = clamp(this.userX, Math.min(uHalfW, W / 2), Math.max(W - uHalfW, W / 2));
    this.userY = clamp(this.userY, Math.min(uHalfH, H / 2), Math.max(H - uHalfH, H / 2));
    const baseX = aw / 2 - this.userX * userScale;
    const baseY = cy - this.userY * userScale;
    const zoomX = sw / 2 - fx * scale;
    const zoomY = sh / 2 - fy * scale;
    const shakeX = (Math.random() - 0.5) * 2 * this.shake;
    const shakeY = (Math.random() - 0.5) * 2 * this.shake;

    const finalScale = userScale + (scale - userScale) * this.k;
    this.scale = finalScale;
    this.stage.scale.set(finalScale);
    this.stage.position.set(baseX + (zoomX - baseX) * this.k + shakeX, baseY + (zoomY - baseY) * this.k + shakeY);
  }

  /** Zoom by `factor`, keeping the world point under screen position (sx, sy) where it is. */
  zoomAt(factor, sx, sy) {
    const before = this.userZoom;
    const next = clamp(before * factor, 1, 3.5);
    if (next === before) return;
    const s0 = this.base * before;
    const s1 = this.base * next;
    const cy = this.insetTop + Math.max(120, this.app.screen.height - this.insetTop - this.insetBottom) / 2;
    const cx = Math.max(200, this.app.screen.width - this.insetRight) / 2;
    const wx = (sx - cx) / s0 + this.userX;
    const wy = (sy - cy) / s0 + this.userY;
    this.userZoom = next;
    this.userX = wx - (sx - cx) / s1;
    this.userY = wy - (sy - cy) / s1;
    this.apply();
  }

  resetView() {
    this.userZoom = 1;
    this.userX = WORLD.width / 2;
    this.userY = WORLD.height / 2;
    this.apply();
  }

  /** Mouse wheel / drag to pan, pinch on touch, + - 0 keys. Drags under 5px still count as clicks. */
  attachInput(canvas) {
    const pts = new Map();
    let moved = 0;
    let pinch = 0;
    canvas.style.touchAction = 'none';
    canvas.addEventListener('wheel', (e) => {
      e.preventDefault();
      this.zoomAt(Math.exp(-e.deltaY * 0.0015), e.offsetX, e.offsetY);
    }, { passive: false });
    canvas.addEventListener('pointerdown', (e) => {
      pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
      moved = 0;
      pinch = 0;
    });
    const end = (e) => { pts.delete(e.pointerId); pinch = 0; };
    canvas.addEventListener('pointerup', (e) => {
      if (moved < 5 && pts.size === 1) this.onTap?.(e.offsetX, e.offsetY); // a click, not a drag
      end(e);
    });
    canvas.addEventListener('pointercancel', end);
    canvas.addEventListener('pointermove', (e) => {
      const p = pts.get(e.pointerId);
      if (!p) return;
      const dx = e.clientX - p.x;
      const dy = e.clientY - p.y;
      p.x = e.clientX;
      p.y = e.clientY;
      if (pts.size === 2) {
        const [a, b] = [...pts.values()];
        const d = Math.hypot(a.x - b.x, a.y - b.y);
        const r = canvas.getBoundingClientRect();
        if (pinch) this.zoomAt(d / pinch, (a.x + b.x) / 2 - r.left, (a.y + b.y) / 2 - r.top);
        pinch = d;
        return;
      }
      moved += Math.abs(dx) + Math.abs(dy);
      if (moved < 5 || this.userZoom <= 1) return;
      const s = this.scale || 1;
      this.userX -= dx / s;
      this.userY -= dy / s;
      this.apply();
    });
    window.addEventListener('keydown', (e) => {
      if (e.target instanceof HTMLInputElement || e.ctrlKey || e.metaKey) return;
      const w = this.app.screen.width / 2;
      const h = this.app.screen.height / 2;
      if (e.key === '+' || e.key === '=') this.zoomAt(1.25, w, h);
      else if (e.key === '-' || e.key === '_') this.zoomAt(0.8, w, h);
      else if (e.key === '0') this.resetView();
    });
  }

  /** Is this world point currently on screen (with a margin in screen pixels)? */
  isVisible(x, y, margin = 10) {
    const sx = x * this.scale + this.stage.x;
    const sy = y * this.scale + this.stage.y;
    return sx > margin && sy > margin && sx < this.app.screen.width - margin && sy < this.app.screen.height - margin;
  }
}
