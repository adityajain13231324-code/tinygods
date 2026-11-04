import { FACTIONS, GROUP_NAMES, NEUTRAL_LOOK, PLACES, VERBS } from '../../config/content.js';
import { CARD_CATS, CARD_LOOK, VERB_LOOK, VERB_ORDER } from './cardStyle.js';
import { GHOST, INFLUENCE, TURN } from '../../config/tunables.js';
import { CARD_DEFS, describeCard } from '../../sim/cards.js';
import { describeOrder, plainOrder, validateOrders } from '../../sim/orders.js';
import { parseCommand } from '../../sim/parser.js';
import { isGhost } from '../../sim/turn.js';
import { el } from './dom.js';
import { createTypeBox } from './typeBox.js';

/**
 * The player's dawn panel: a card to play (optional) and one box to say what the villagers
 * should do, in plain words ("send three of my villagers to the armory, scare the Tides").
 * Everything typed becomes the same rule-checked orders as ever.
 */
export function createCommandPanel(root, ctx) {
  const panel = el('div', 'panel');
  panel.id = 'command';
  panel.hidden = true;
  root.append(panel);

  let staged = [];
  let card = null; // the card chosen to play this turn: {id, group?}
  let typedNote = ''; // what the typing box last understood, shown again after the panel redraws
  let typedBad = false;
  let menuOpen = false; // the pick-an-order menu starts closed, but sits in an obvious box
  let draft = { verb: null, target: null, who: null, strength: 1 }; // the order being built in the menu
  let menuError = '';
  let shownKey = '';
  let lastGame = null;
  let currentTb = null; // the typing box on screen right now

  const influenceLeft = (game) => game.influence[ctx.seat] - staged.reduce((n, o) => n + o.strength, 0);

  function stagedCard() {
    if (!card) return null;
    const needs = CARD_DEFS[card.id].needs;
    if (needs === 'group' && (card.group === null || card.group === undefined)) return null;
    if (needs === 'place' && !card.place) return null;
    return card;
  }

  /** What the player typed: stage orders, pick a card, or queue a miracle for when the town wakes. */
  function handleTyped(text, game, ghost) {
    const r = parseCommand(text, game, ctx.seat);
    if (!r.ok) return r;
    let skipped = null;
    const notes = [];
    const rules = [game.influence[ctx.seat], game.world, game.verbsLastTurn[ctx.seat], ghost];
    const nextStaged = staged.slice();
    let nextCard = card;
    const queue = [];
    for (const a of r.actions) {
      if (a.kind === 'order') {
        let order = a.order;
        let check = validateOrders([...nextStaged, order], ...rules);
        while (!check.ok && order.strength > 1 && /influence/i.test(check.error)) {
          order = { ...order, strength: order.strength - 1 }; // not enough influence: step the strength down
          check = validateOrders([...nextStaged, order], ...rules);
        }
        if (!check.ok) return { ok: false, message: `${check.error}. Remove an order, or try something else.`, suggestions: [] };
        nextStaged.push(order);
        notes.push(plainOrder(order));
      } else if (a.kind === 'card') {
        if (ghost) return { ok: false, message: 'Ghosts cannot play cards.', suggestions: [] };
        if (!game.hand[ctx.seat].includes(a.card.id)) {
          return { ok: false, message: `You do not hold ${a.label} this turn. Your hand: ${game.hand[ctx.seat].map((id) => CARD_DEFS[id].name).join(', ')}.`, suggestions: [] };
        }
        nextCard = a.card;
        notes.push(`Card ready: ${describeCard(a.card)}.`);
      } else {
        if (game.world.peaceful) return { ok: false, message: `Miracles unlock on day ${TURN.peaceTurns + 1}. The town is still at peace.`, suggestions: [] };
        if (ctx.queuedPowers.length + queue.length >= 3) return { ok: false, message: 'Three miracles are already queued.', suggestions: [] };
        queue.push({ ...a.power, label: a.label });
        notes.push(`${a.label} will fire when the town wakes up.`);
      }
    }
    staged = nextStaged;
    card = nextCard;
    ctx.queuedPowers.push(...queue);
    typedNote = notes.join(' ');
    typedBad = false;
    setTimeout(() => build(game), 0);
    // One clause could not be read: keep the rest, and say what is missing.
    if (r.problem) {
      skipped = r.problem;
      typedNote = `${notes.join(' ')} But I could not read "${skipped.clause}": ${skipped.message}`;
      setTimeout(() => build(game), 0);
      return { ok: false, clear: true, message: typedNote, suggestions: skipped.suggestions };
    }
    return { ok: true, message: typedNote };
  }

  const WHO = [['Everyone', null], ['2 villagers', 2], ['4 villagers', 4], ['6 villagers', 6]];
  const noWho = new Set(['accuse', 'praise', 'festival']);
  const behaviour = new Set(['follow', 'escort', 'hunt', 'standdown', 'protect', 'avoid']);

  function draftOrder(game) {
    const d = draft;
    if (!d.verb) return null;
    const kinds = VERBS[d.verb].targets;
    if (kinds.length && !d.target) return null;
    const order = { verb: d.verb, target: kinds.length ? d.target : null, strength: d.strength };
    if (d.who && !noWho.has(d.verb)) order.subject = { kind: 'count', n: d.who };
    void game;
    return order;
  }

  /** The compact "pick an order" menu: verb, then who it is for, then how hard. */
  function buildMenu(game, ghost) {
    const wrap = el('div', 'ordermenu');
    const toggle = el('button', 'menutoggle', `📋 Pick an order from a list  ${menuOpen ? '▾' : '▸'}`);
    toggle.title = 'Hate, Love, Fear, Assault, Guard, Go to, Hunt... choose with clicks instead of typing';
    toggle.onclick = () => { menuOpen = !menuOpen; build(game); };
    wrap.append(toggle);
    if (!menuOpen) return wrap;

    const left = influenceLeft(game);
    const verbs = el('div', 'verbgrid');
    for (const id of VERB_ORDER) {
      if (ghost && !GHOST.verbs.includes(id)) continue;
      const look = VERB_LOOK[id];
      const b = el('button', `vtile${draft.verb === id ? ' on' : ''}`);
      b.title = look.tip;
      b.append(el('span', 'vt-icon', look.icon), el('span', 'vt-name', VERBS[id].label));
      b.onclick = () => {
        draft = { verb: id, target: null, who: null, strength: behaviour.has(id) || id === 'arm' ? 1 : ghost ? 1 : 2 };
        menuError = '';
        build(game);
      };
      verbs.append(b);
    }
    wrap.append(verbs);
    if (!draft.verb) return wrap;

    const kinds = VERBS[draft.verb].targets;
    const panelBox = el('div', 'menustep');
    panelBox.append(el('div', 'sub', VERB_LOOK[draft.verb].tip));

    if (kinds.length) {
      const row = el('div', 'steprow');
      row.append(el('span', 'steplabel', draft.verb === 'hunt' || draft.verb === 'escort' ? 'Who?' : kinds.includes('place') && !kinds.includes('group') ? 'Where?' : 'Target'));
      if (kinds.includes('group')) {
        const own = ['hate', 'fear', 'assault', 'accuse'].includes(draft.verb);
        for (let g = 0; g < 5; g++) {
          if (own && g === ctx.seat) continue;
          const look = g < 4 ? FACTIONS[g] : NEUTRAL_LOOK;
          const on = draft.target?.kind === 'group' && draft.target.id === g;
          const b = el('button', `opt${on ? ' on' : ''}`);
          const dot = el('i');
          dot.style.background = '#' + look.color.toString(16).padStart(6, '0');
          b.append(dot, GROUP_NAMES[g] + (g === ctx.seat ? ' (yours)' : ''));
          b.onclick = () => { draft.target = { kind: 'group', id: g }; build(game); };
          row.append(b);
        }
      }
      if (kinds.includes('place')) {
        for (const p of PLACES) {
          const on = draft.target?.kind === 'place' && draft.target.id === p.id;
          const b = el('button', `opt${on ? ' on' : ''}`, p.name);
          b.onclick = () => { draft.target = { kind: 'place', id: p.id }; build(game); };
          row.append(b);
        }
      }
      if (kinds.includes('villager')) {
        const sel = el('select', 'vsel');
        sel.append(new Option('Choose a villager…', ''));
        for (const v of game.world.villagers) {
          if (!v.alive) continue;
          if (draft.verb === 'hunt' && v.faction === ctx.seat) continue;
          if (draft.verb === 'escort' && v.faction === ctx.seat && false) continue;
          const tag = v.faction >= 0 ? FACTIONS[v.faction].name : 'Neutral';
          sel.append(new Option(`${v.name} (${tag})`, String(v.id)));
        }
        if (draft.target?.kind === 'villager') sel.value = String(draft.target.id);
        sel.onchange = () => {
          const v = game.world.villagers[Number(sel.value)];
          draft.target = sel.value ? { kind: 'villager', id: v.id, name: v.name } : null;
          build(game);
        };
        row.append(sel);
      }
      panelBox.append(row);
    }

    if (!noWho.has(draft.verb) && !ghost) {
      const row = el('div', 'steprow');
      row.append(el('span', 'steplabel', 'For'));
      for (const [label, n] of WHO) {
        const b = el('button', `opt${draft.who === n ? ' on' : ''}`, label);
        b.onclick = () => { draft.who = n; build(game); };
        row.append(b);
      }
      panelBox.append(row);
    }

    const strength = el('div', 'steprow');
    strength.append(el('span', 'steplabel', 'Strength'));
    for (let sI = 1; sI <= (ghost ? 1 : 3); sI++) {
      const b = el('button', `opt${draft.strength === sI ? ' on' : ''}`, ['Mild', 'Strong', 'Extreme'][sI - 1] + ` · ${sI}`);
      b.disabled = sI > left;
      b.onclick = () => { draft.strength = sI; build(game); };
      strength.append(b);
    }
    const add = el('button', 'go', 'Add order');
    const order = draftOrder(game);
    add.disabled = !order;
    add.onclick = () => {
      const check = validateOrders([...staged, order], game.influence[ctx.seat], game.world, game.verbsLastTurn[ctx.seat], ghost);
      if (!check.ok) { menuError = check.error; build(game); return; }
      staged.push(order);
      typedNote = plainOrder(order);
      typedBad = false;
      draft = { verb: null, target: null, who: null, strength: 1 };
      menuError = '';
      build(game);
    };
    strength.append(add);
    panelBox.append(strength);
    if (menuError) panelBox.append(el('div', 'menuerr', menuError));
    wrap.append(panelBox);
    return wrap;
  }

  function build(game) {
    panel.replaceChildren();
    const left = influenceLeft(game);
    const ghost = isGhost(game, ctx.seat);

    const head = el('div', 'cmdhead');
    const who = ghost ? `${game.seats[ctx.seat].name}: haunt the town (one mild whisper)`
      : ctx.hotseat ? `${game.seats[ctx.seat].name}: secret orders for the ${FACTIONS[ctx.seat].name}`
      : `Your orders for the ${FACTIONS[ctx.seat].name}`;
    const pips = el('span', 'infpips');
    pips.title = 'Influence: each order costs its strength. Spare influence carries over (up to ' + INFLUENCE.carryCap + ').';
    const total = Math.max(game.influence[ctx.seat], 3);
    for (let i = 0; i < Math.min(total, 10); i++) pips.append(el('i', i < left ? 'on' : ''));
    const peace = game.world.peaceful ? el('span', 'peacetag', '🕊 Peace holds: no fighting or miracles yet') : null;
    head.append(el('b', '', who), peace ?? '', el('span', 'infwrap', 'Influence '), pips);
    pips.parentNode;
    head.lastChild.before(el('span', 'sub infnum', String(left)));
    panel.append(head);
    if (game.event) panel.append(el('div', 'eventnote', `${game.event.icon} ${game.event.title}: ${game.event.text}`));
    panel.append(el('div', 'autonote', 'Out of time? Whatever you have picked or typed is sent for you.'));

    // Two ways to give an order, side by side in plain sight: pick from the menu, or type it.
    panel.append(buildMenu(game, ghost));
    panel.append(el('div', 'steplabel2', ghost ? 'Whisper' : 'Or type it in your own words'));
    const tb = createTypeBox({
      placeholder: ghost ? 'Whisper, e.g. "love the Tides" or "party at the pond"' : 'e.g. "send three villagers to the armory, scare the Tides"',
      handle: (text) => handleTyped(text, game, ghost),
    });
    panel.append(tb.root);
    currentTb = tb;
    if (typedNote) tb.say(typedNote, typedBad);

    // A bar of one-click commands right under the box: they type themselves for you.
    if (!ghost) {
      const living = [0, 1, 2, 3].map((f) => game.world.villagers.filter((v) => v.alive && v.faction === f).length);
      const rivals = [0, 1, 2, 3].filter((f) => f !== ctx.seat && living[f] > 0);
      const strongest = rivals.slice().sort((x, y) => living[y] - living[x])[0];
      const weakest = rivals.slice().sort((x, y) => living[x] - living[y])[0];
      const quick = [['🗡️ Arm up', 'arm up'], ['🕊️ Stand down', 'everyone stand down'], ['🎉 Party', 'party at the plaza']];
      if (strongest !== undefined) quick.push([`😱 Scare ${FACTIONS[strongest].name}`, `scare the ${FACTIONS[strongest].name}`]);
      if (weakest !== undefined && !game.world.peaceful) quick.push([`⚔️ Attack ${FACTIONS[weakest].name}`, `attack the ${FACTIONS[weakest].name}`]);
      quick.push(['🛡️ Guard us', 'guard my people']);
      const bar = el('div', 'quickbar');
      bar.append(el('span', 'sub', 'Quick:'));
      for (const [label, text] of quick) {
        const q = el('button', 'quick', label);
        q.title = `Same as typing: "${text}"`;
        q.onclick = () => { handleTyped(text, game, ghost); };
        bar.append(q);
      }
      panel.append(bar);
    }

    // Staged orders, the chosen card and queued miracles, all as removable chips.
    if (staged.length || stagedCard() || ctx.queuedPowers.length) {
      const list = el('div', 'staged');
      const chip = (text, onRemove) => {
        const c = el('span', '', text);
        const x = el('button', '', '✕');
        x.title = 'Remove';
        x.onclick = onRemove;
        c.append(x);
        list.append(c);
      };
      staged.forEach((o, i) => {
        // each staged order has a little strength dial: − 1 2 3 +
        const c = el('span', 'orderchip');
        c.append(el('span', 'oc-text', describeOrder({ ...o, strength: 0 }).replace(' ()', '')));
        const dial = el('span', 'dial');
        const set = (n) => {
          const next = staged.map((x, j) => (j === i ? { ...x, strength: n } : x));
          const check = validateOrders(next, game.influence[ctx.seat], game.world, game.verbsLastTurn[ctx.seat], ghost);
          if (!check.ok) { typedNote = check.error; typedBad = true; build(game); return; }
          staged = next;
          typedNote = plainOrder(staged[i]) + ` (strength ${n})`;
          typedBad = false;
          build(game);
        };
        const minus = el('button', 'dialbtn', '−');
        minus.disabled = ghost || o.strength <= 1;
        minus.onclick = () => set(o.strength - 1);
        const plus = el('button', 'dialbtn', '+');
        plus.disabled = ghost || o.strength >= 3;
        plus.onclick = () => set(o.strength + 1);
        dial.append(minus);
        for (let n = 1; n <= 3; n++) dial.append(el('i', n <= o.strength ? 'on' : ''));
        dial.append(plus);
        dial.title = `Strength ${o.strength}: costs ${o.strength} influence. Stronger orders hit harder.`;
        const x = el('button', '', '✕');
        x.title = 'Remove';
        x.onclick = () => { staged.splice(i, 1); build(game); };
        c.append(dial, x);
        list.append(c);
      });
      if (stagedCard()) chip(`Card: ${describeCard(card)}`, () => { card = null; build(game); });
      ctx.queuedPowers.forEach((q, i) => chip(`${q.label} at dawn`, () => { ctx.queuedPowers.splice(i, 1); build(game); }));
      panel.append(list);
    }

    // The hand: real cards. Tap one to play it (free); it lifts and shows what it does.
    if (!ghost) {
      const hand = el('div', 'hand');
      game.hand[ctx.seat].forEach((id, i) => {
        const def = CARD_DEFS[id];
        const look = CARD_LOOK[id];
        const cat = CARD_CATS[look.cat];
        const tile = el('button', `gcard${card?.id === id ? ' on' : ''}`);
        tile.style.setProperty('--cat', cat.color);
        tile.style.setProperty('--i', String(i));
        tile.title = def.blurb;
        tile.append(el('span', 'gc-cat', cat.name), el('span', 'gc-icon', look.icon), el('span', 'gc-name', def.name), el('span', 'gc-free', 'free'));
        tile.onclick = () => {
          ctx.sound?.('card');
          card = card?.id === id ? null : { id, group: def.needs === 'group' ? null : undefined, place: def.needs === 'place' ? null : undefined };
          build(game);
        };
        hand.append(tile);
      });
      panel.append(hand);
      if (card) {
        const def = CARD_DEFS[card.id];
        const info = el('div', 'cardinfo');
        info.style.setProperty('--cat', CARD_CATS[CARD_LOOK[card.id].cat].color);
        info.append(el('b', '', def.name), el('span', 'sub', def.blurb));
        if (def.needs === 'group') {
          for (let g = 0; g < 5; g++) {
            if (g === ctx.seat && card.id !== 'spy') continue;
            if (g === 4 && (card.id === 'spy' || card.id === 'raid')) continue;
            const b = el('button', `opt${card.group === g ? ' on' : ''}`, GROUP_NAMES[g]);
            b.onclick = () => { card.group = g; build(game); };
            info.append(b);
          }
        } else if (def.needs === 'place') {
          for (const p of PLACES) {
            const b = el('button', `opt${card.place === p.id ? ' on' : ''}`, p.name);
            b.onclick = () => { card.place = p.id; build(game); };
            info.append(b);
          }
        }
        panel.append(info);
      }
    }

    const foot = el('div', 'foot');
    foot.append(el('span', 'sub', `Spare influence carries over, up to ${INFLUENCE.carryCap}`));
    const submit = el('button', 'go', staged.length || stagedCard() ? `Submit${staged.length ? ` ${staged.length} order${staged.length > 1 ? 's' : ''}` : ''}` : 'Pass this turn');
    submit.onclick = () => ctx.submit(staged, stagedCard());
    foot.append(submit);
    panel.append(foot);
  }

  /**
   * The timer ran out with something half done: a sentence typed but never sent, or an order
   * picked in the menu but never added. Count them, so nothing the player did is thrown away.
   */
  function commitPending(game) {
    const ghost = isGhost(game, ctx.seat);
    const text = currentTb?.pending();
    if (text) {
      const r = handleTyped(text, game, ghost);
      if (r.ok || r.clear) currentTb.say('');
    }
    const order = draftOrder(game);
    if (order && validateOrders([...staged, order], game.influence[ctx.seat], game.world, game.verbsLastTurn[ctx.seat], ghost).ok) {
      staged.push(order);
      draft = { verb: null, target: null, who: null, strength: 1 };
    }
  }

  return {
    /** Called every frame; only rebuilds when the situation changes. */
    update(game) {
      lastGame = game;
      const open = game.phase === 'command' && (!game.eliminated[ctx.seat] || isGhost(game, ctx.seat)) && game.pending[ctx.seat] === null && ctx.passReady;
      panel.hidden = !open;
      if (!open) {
        shownKey = '';
        return;
      }
      const key = `${game.turn}:${ctx.seat}`;
      if (key !== shownKey) {
        shownKey = key;
        staged = [];
        card = null;
        typedNote = '';
        draft = { verb: null, target: null, who: null, strength: 1 };
        menuError = '';
        ctx.queuedPowers.length = 0;
        build(game);
      }
    },

    stagedCard() { return stagedCard(); },

    /** The orders currently staged (used to auto-submit when the timer runs out). */
    stagedOrders() {
      if (!lastGame) return [];
      commitPending(lastGame);
      const ghost = isGhost(lastGame, ctx.seat);
      const rules = [lastGame.influence[ctx.seat], lastGame.world, lastGame.verbsLastTurn[ctx.seat], ghost];
      const out = []; // keep every order that is legal, even if one next to it is not
      for (const o of staged) if (validateOrders([...out, o], ...rules).ok) out.push(o);
      return out;
    },
  };
}

export { GHOST };
