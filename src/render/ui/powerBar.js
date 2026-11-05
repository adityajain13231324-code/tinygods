import { Graphics } from 'pixi.js';
import { FACTIONS, GROUP_NAMES } from '../../config/content.js';
import { POWERS, WORLD } from '../../config/tunables.js';
import { parseCommand, resolvePower } from '../../sim/parser.js';
import { POWER_DEFS, nearestPowerTarget } from '../../sim/powers.js';
import { css, el } from './dom.js';
import { createTypeBox } from './typeBox.js';
import { POWER_CATS } from './cardStyle.js';
import { finishSheet } from './sheet.js';
import { powerUnlockError } from '../../sim/availability.js';

/**
 * The live-miracle bar, shown while the town acts. Pick a power and click the map, or just type
 * what you want ("lightning on the bakery", "heal my weakest"). Powers queued while giving
 * orders (typed at dawn) are cast a moment after the town wakes up.
 */
export function createPowerBar(root, ctx, game, camera, stage) {
  const panel = el('div', 'panel');
  panel.id = 'powerbar';
  panel.hidden = true;
  root.append(panel);

  let selected = null; // power id waiting for a click on the map
  let group = null; // for Whisper
  let good = false;
  let pointer = null;
  let drag = null;
  const aim = stage.addChild(new Graphics());
  aim.eventMode = 'none';
  const cursor = el('div', 'power-cursor');
  cursor.setAttribute('aria-hidden', 'true');
  cursor.hidden = true;
  root.append(cursor);
  let shownKey = '';
  let note = '';
  let noteBad = false;

  const type = createTypeBox({
    label: 'Live miracle command', action: 'Cast miracle',
    placeholder: 'Or type a miracle: "fireball the Tides", "earthquake", "heal my weakest"',
    handle(text) {
      const r = parseCommand(text, game, ctx.seat);
      if (!r.ok) return r;
      const done = [];
      for (const a of r.actions) {
        if (a.kind !== 'power') {
          return { ok: false, message: `${a.label} is something you decide at dawn, before the town acts. Try a miracle now.`, suggestions: ['lightning on the plaza', 'heal my weakest', 'fog', 'whisper that the tides are dangerous'] };
        }
        const res = resolvePower(game, ctx.seat, a.power);
        if (!res.ok) return { ok: false, message: res.error, suggestions: ['lightning on the plaza', 'fog on the market', 'heal my weakest'] };
        const cast = ctx.cast(res.id, res.args);
        if (!cast.ok) return { ok: false, message: cast.error, suggestions: [] };
        done.push(cast.message);
      }
      return { ok: true, message: done.join(' ') };
    },
  });

  const point = (sx, sy) => ({ x: (sx - stage.x) / camera.scale, y: (sy - stage.y) / camera.scale });
  const radius = () => Math.max(POWERS.targetRadius, 22 / camera.scale);
  const target = (p) => nearestPowerTarget(game, ctx.seat, selected, p.x, p.y, radius(), { group, good });
  const cancelAim = () => { drag = null; pointer = null; aim.clear(); cursor.hidden = true; };
  function cast(args) {
    const r = ctx.cast(selected, args);
    say(r.ok ? r.message : r.error, !r.ok);
    if (r.ok) { selected = null; cancelAim(); }
    shownKey = '';
  }
  function mapTap(sx, sy) {
    if (panel.hidden || !selected) return false;
    if (selected === 'gust') return true;
    if (selected === 'whisper' && group === null) { say('Choose a faction for Whisper first.', true); return true; }
    const p = point(sx, sy);
    const def = POWER_DEFS[selected];
    let args;
    if (def.needs === 'point') {
      args = p;
    } else {
      const best = target(p);
      if (!best) {
        say('No eligible villager in the circle. Aim a little closer.', true);
        return true;
      }
      args = { villagerId: best.id, group, good };
    }
    cast(args);
    return true;
  }
  function drawAim() {
    aim.clear();
    cursor.hidden = true;
    if (!pointer || !selected || panel.hidden) return;
    const p = point(pointer.x, pointer.y);
    if (p.x < 0 || p.y < 0 || p.x > WORLD.width || p.y > WORLD.height) return;
    const def = POWER_DEFS[selected];
    const single = def.needs.startsWith('villager');
    const r = single ? radius() : (POWERS[selected]?.radius ?? POWERS[selected]?.pickupRadius ?? 40);
    const v = drag ? game.world.villagers[drag.id] : single ? target(p) : null;
    const valid = !single || (v && (selected !== 'whisper' || group !== null));
    const color = !valid ? 0xff8b8b : selected === 'whirlpool' ? 0xffb166 : 0x9ee5ff;
    aim.circle(p.x, p.y, r).fill({ color, alpha: 0.12 }).stroke({ color, width: 2 / camera.scale, alpha: 0.9 });
    if (valid && v) aim.ellipse(v.x, v.y, 25, 12).stroke({ color: 0xffdf7c, width: 3 / camera.scale });
    if (drag && v) {
      const a = Math.atan2(p.y - v.y, p.x - v.x);
      aim.moveTo(v.x, v.y - 18).lineTo(p.x, p.y).stroke({ color: 0xffdf7c, width: 3 / camera.scale });
      aim.poly([p.x, p.y, p.x - 18 * Math.cos(a - 0.5), p.y - 18 * Math.sin(a - 0.5), p.x - 18 * Math.cos(a + 0.5), p.y - 18 * Math.sin(a + 0.5)]).fill(0xffdf7c);
    }
    cursor.textContent = def.icon;
    cursor.style.left = `${pointer.x + 16}px`;
    cursor.style.top = `${pointer.y + 16}px`;
    cursor.hidden = false;
  }
  function aimStart(x, y) {
    if (panel.hidden || selected !== 'gust') return false;
    pointer = { x, y };
    const v = target(point(x, y));
    drag = v ? { id: v.id, x, y } : null;
    if (!v) say('Hold near a villager, then drag a direction.', true);
    return true;
  }
  function aimEnd(x, y) {
    if (!drag || selected !== 'gust' || panel.hidden) { drag = null; return; }
    const start = drag;
    drag = null;
    if (Math.hypot(x - start.x, y - start.y) < 12) { say('Drag a little farther, then release.', true); return; }
    const p = point(x, y);
    cast({ villagerId: start.id, tx: Math.max(0, Math.min(WORLD.width, p.x)), ty: Math.max(0, Math.min(WORLD.height, p.y)) });
  }
  window.addEventListener('keydown', e => {
    if (e.key === 'Escape') { selected = null; cancelAim(); shownKey = ''; }
  });

  function say(text, bad = false) {
    note = text;
    noteBad = bad;
    type.say(text, bad);
  }

  function build() {
    const scrollTop = panel.querySelector('.sheet-body')?.scrollTop ?? 0;
    const gridScroll = panel.querySelector('.powergrid')?.scrollTop ?? 0;
    const focused = panel.contains(document.activeElement) ? document.activeElement?.dataset.power : null;
    panel.replaceChildren();
    const left = game.power[ctx.seat] ?? 0;
    const head = el('div', 'powerhead');
    const pips = el('span', 'pips');
    for (let i = 0; i < POWERS.perTurn; i++) pips.append(el('i', i < left ? 'on' : ''));
    head.append(el('b', '', 'Powers'), pips, el('span', 'sub', selected ? POWER_DEFS[selected].hint : 'Pick a power, then click the map. Unused power is lost.'));
    panel.append(head);
    const earlyLock = powerUnlockError(game, 'fireball');
    if (earlyLock) panel.append(el('div', 'sub', earlyLock));
    type.root.querySelector('input').placeholder = earlyLock ? 'Or type a miracle: "heal my weakest", "fog on the plaza"' : 'Or type a miracle: "fireball the Tides", "earthquake", "heal my weakest"';

    const row = el('div', 'powergrid');
    for (const [id, def] of Object.entries(POWER_DEFS)) {
      const b = el('button', `ptile${selected === id ? ' on' : ''}`);
      b.dataset.power = id;
      b.setAttribute('aria-pressed', String(selected === id));
      b.setAttribute('aria-label', `${def.name}, ${def.cost} power. ${def.blurb}`);
      b.style.setProperty('--cat', POWER_CATS[id]);
      b.title = def.blurb;
      const used = game.usedPowers[ctx.seat].includes(id);
      const locked = powerUnlockError(game, id);
      b.disabled = left < def.cost || used || !!locked;
      if (locked) { b.title = `${def.name}: ${locked}`; b.setAttribute('aria-label', `${def.name}: ${locked}`); }
      if (used) { b.classList.add('used'); b.title = `${def.name}: already used this turn`; }
      const cost = el('span', 'pt-cost');
      for (let i = 0; i < def.cost; i++) cost.append(el('i'));
      b.append(el('span', 'pt-icon', def.icon), el('span', 'pt-name', def.name), cost);
      b.onclick = () => {
        cancelAim();
        if (def.needs === 'none') {
          const r = ctx.cast(id, {});
          say(r.ok ? r.message : r.error, !r.ok);
          shownKey = '';
          return;
        }
        selected = selected === id ? null : id;
        panel.classList.toggle('expanded', selected === 'whisper');
        say(selected ? def.blurb : '');
        shownKey = '';
      };
      row.append(b);
    }
    panel.append(row);

    if (selected === 'whisper') {
      const r = el('div', 'row');
      r.append(el('span', 'label', 'About'));
      for (let g = 0; g < 5; g++) {
        const b = el('button', `opt${group === g ? ' on' : ''}`);
        if (g < 4) {
          const dot = el('i');
          dot.style.background = css(FACTIONS[g].color);
          b.append(dot);
        }
        b.append(GROUP_NAMES[g]);
        b.onclick = () => { group = g; shownKey = ''; };
        r.append(b);
      }
      const tone = el('button', `opt${good ? ' on' : ''}`, good ? 'Say something good' : 'Say something bad');
      tone.onclick = () => { good = !good; shownKey = ''; };
      r.append(tone);
      panel.append(r);
    }

    panel.append(type.root);
    type.say(note, noteBad);
    const foot = el('div', 'powerfoot');
    foot.append(el('span', '', selected ? `${POWER_DEFS[selected].name}: ${POWER_DEFS[selected].hint}` : `${left} power left · Choose a miracle or type one`));
    if (selected) {
      const aim = el('button', 'go', 'Aim on map');
      aim.disabled = selected === 'whisper' && group === null;
      aim.onclick = () => { panel.classList.remove('expanded'); shownKey = ''; };
      const cancel = el('button', 'go ghost', 'Cancel');
      cancel.onclick = () => { selected = null; cancelAim(); shownKey = ''; };
      foot.append(aim, cancel);
    }
    finishSheet(panel, `Miracles · ${left} power`, foot);
    panel.querySelector('.sheet-body').scrollTop = scrollTop;
    row.scrollTop = gridScroll;
    if (focused) row.querySelector(`[data-power="${focused}"]`)?.focus({ preventScroll: true });
  }

  let castQueued = false;
  return {
    mapTap, aimStart, aimEnd, aimCancel: cancelAim,
    aimMove(x, y) { pointer = { x, y }; },
    aimOut() { if (!drag) { pointer = null; aim.clear(); cursor.hidden = true; } },
    get selected() { return selected; },
    update() {
      const open = game.phase === 'sim' && !game.world.peaceful && !game.eliminated[ctx.seat] && ctx.passReady && !ctx.cutsceneActive?.();
      panel.hidden = !open;
      if (!open) {
        const body = panel.querySelector('.sheet-body');
        if (body) body.scrollTop = 0;
        shownKey = '';
        selected = null;
        cancelAim();
        if (game.phase !== 'sim') castQueued = false;
        return;
      }
      // Powers typed at dawn fire a moment after the town wakes up.
      if (!castQueued && game.simElapsed > 1.5) {
        castQueued = true;
        const messages = [];
        for (const spec of ctx.takeQueuedPowers()) {
          const res = resolvePower(game, ctx.seat, spec);
          const cast = res.ok ? ctx.cast(res.id, res.args) : res;
          messages.push(cast.ok ? cast.message : `${spec.label}: ${cast.error ?? res.error}`);
        }
        if (messages.length) say(messages.join(' '));
      }
      if (selected && (game.power[ctx.seat] < POWER_DEFS[selected].cost || game.usedPowers[ctx.seat].includes(selected))) { selected = null; cancelAim(); }
      if (selected && powerUnlockError(game, selected)) { selected = null; cancelAim(); }
      const key = `${game.turn}:${ctx.seat}:${game.power[ctx.seat]}:${game.usedPowers[ctx.seat].join(',')}:${selected}:${group}:${good}:${!!powerUnlockError(game, 'timebomb')}`;
      if (key !== shownKey) {
        shownKey = key;
        build();
      }
      drawAim();
    },
  };
}
