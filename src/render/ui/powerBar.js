import { FACTIONS, GROUP_NAMES, PLACES } from '../../config/content.js';
import { POWERS } from '../../config/tunables.js';
import { parseCommand, resolvePower } from '../../sim/parser.js';
import { POWER_DEFS } from '../../sim/powers.js';
import { css, el } from './dom.js';
import { createTypeBox } from './typeBox.js';
import { POWER_CATS } from './cardStyle.js';

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
  let placeId = 'plaza'; // for Gust
  let shownKey = '';
  let note = '';
  let noteBad = false;

  const type = createTypeBox({
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

  function mapTap(sx, sy) {
    if (panel.hidden || !selected) return false;
    const wx = (sx - stage.x) / camera.scale;
    const wy = (sy - stage.y) / camera.scale;
    const def = POWER_DEFS[selected];
    let args;
    if (def.needs === 'point') {
      args = { x: wx, y: wy };
    } else {
      let best = null;
      let bestD = 55;
      for (const v of game.world.villagers) {
        if (!v.alive) continue;
        const d = Math.hypot(v.x - wx, v.y - 18 - wy);
        if (d < bestD) { bestD = d; best = v; }
      }
      if (!best) {
        say('No villager there. Click right on one.', true);
        return true;
      }
      args = { villagerId: best.id, group, good, placeId };
    }
    const r = ctx.cast(selected, args);
    say(r.ok ? r.message : r.error, !r.ok);
    if (r.ok) selected = null;
    shownKey = '';
    return true;
  }

  function say(text, bad = false) {
    note = text;
    noteBad = bad;
    type.say(text, bad);
  }

  function build() {
    panel.replaceChildren();
    const left = game.power[ctx.seat] ?? 0;
    const head = el('div', 'powerhead');
    const pips = el('span', 'pips');
    for (let i = 0; i < POWERS.perTurn; i++) pips.append(el('i', i < left ? 'on' : ''));
    head.append(el('b', '', 'Powers'), pips, el('span', 'sub', selected ? POWER_DEFS[selected].hint : 'Pick a power, then click the map. Unused power is lost.'));
    panel.append(head);

    const row = el('div', 'powergrid');
    for (const [id, def] of Object.entries(POWER_DEFS)) {
      const b = el('button', `ptile${selected === id ? ' on' : ''}`);
      b.style.setProperty('--cat', POWER_CATS[id]);
      b.title = def.blurb;
      b.disabled = left < def.cost;
      const cost = el('span', 'pt-cost');
      for (let i = 0; i < def.cost; i++) cost.append(el('i'));
      b.append(el('span', 'pt-icon', def.icon), el('span', 'pt-name', def.name), cost);
      b.onclick = () => {
        if (def.needs === 'none') {
          const r = ctx.cast(id, {});
          say(r.ok ? r.message : r.error, !r.ok);
          shownKey = '';
          return;
        }
        selected = selected === id ? null : id;
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
    if (selected === 'gust') {
      const r = el('div', 'row');
      r.append(el('span', 'label', 'Toward'));
      for (const p of PLACES) {
        const b = el('button', `opt${placeId === p.id ? ' on' : ''}`, p.name);
        b.onclick = () => { placeId = p.id; shownKey = ''; };
        r.append(b);
      }
      panel.append(r);
    }

    panel.append(type.root);
    type.say(note, noteBad);
  }

  const hintFor = (id) => ({
    lightning: 'Click a spot on the map to strike it.',
    miracle: 'Click a villager to heal them.',
    whisper: 'Choose a faction below, then click a villager to whisper to.',
    fog: 'Click a spot on the map for fog.',
    gust: 'Choose a place below, then click the villager to blow there.',
  })[id];

  let castQueued = false;
  return {
    mapTap,
    update() {
      const open = game.phase === 'sim' && !game.world.peaceful && !game.eliminated[ctx.seat] && ctx.passReady && !ctx.cutsceneActive?.();
      panel.hidden = !open;
      if (!open) {
        shownKey = '';
        selected = null;
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
      const key = `${game.turn}:${ctx.seat}:${game.power[ctx.seat]}:${selected}:${group}:${good}:${placeId}`;
      if (key !== shownKey) {
        shownKey = key;
        build();
      }
    },
  };
}
