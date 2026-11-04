import { ORDERS, WEAPONS, INFLUENCE, STATS, GHOST, TURN } from '../config/tunables.js';
import { VERBS, NUM_GROUPS, GROUP_NAMES, PLACES } from '../config/content.js';
import { isFirearm, groupOf } from './villager.js';
import { formLoveBonds } from './bonds.js';
import { startRumor } from './rumors.js';
import { shuffle } from './rng.js';

// An order is plain data, so humans, bots and (later) the network all use the same shape:
//   { verb: 'hate', target: { kind: 'group', id: 1 } | { kind: 'place', id: 'well' } | null, strength: 1..3 }
// Free text is never executed. Everything goes through validateOrder first.

export const orderCost = (order) => order.strength;

/** @returns {{ok: true} | {ok: false, error: string}} */
export function validateOrder(order, world) {
  const verb = VERBS[order?.verb];
  if (!verb) return { ok: false, error: 'Unknown verb' };
  if (![1, 2, 3].includes(order.strength)) return { ok: false, error: 'Strength must be 1, 2 or 3' };

  if (world.peaceful && ['assault', 'hunt', 'ambush', 'shove', 'seize'].includes(order.verb)) return { ok: false, error: `${verb.label} is locked: the town is at peace until day ${TURN.peaceTurns + 1}` };
  if (verb.targets.length === 0) {
    if (order.target) return { ok: false, error: `${verb.label} takes no target` };
    return { ok: true };
  }
  const t = order.target;
  if (!t || !verb.targets.includes(t.kind)) return { ok: false, error: `${verb.label} needs a ${verb.targets.join(' or ')} target` };
  if (t.kind === 'group' && !(Number.isInteger(t.id) && t.id >= 0 && t.id < NUM_GROUPS)) return { ok: false, error: 'Bad group' };
  if (t.kind === 'place' && !world.places.some((p) => p.id === t.id)) return { ok: false, error: 'Bad place' };
  if (t.kind === 'villager' && !world.villagers[t.id]?.alive) return { ok: false, error: 'That villager is not around' };
  if (order.dest !== undefined && !world.places.some((p) => p.id === order.dest)) return { ok: false, error: 'Bad place to drag them to' };
  const s = order.subject;
  if (s) {
    const ok = s.kind === 'all'
      || (s.kind === 'count' && Number.isInteger(s.n) && s.n >= 1 && s.n <= 12)
      || (s.kind === 'trait' && typeof s.trait === 'string')
      || (s.kind === 'villagers' && Array.isArray(s.ids) && s.ids.length > 0 && s.ids.every((id) => Number.isInteger(id)));
    if (!ok) return { ok: false, error: 'Bad subject' };
  }
  return { ok: true };
}

/** Why a verb cannot be used this turn (or null if it can). `lastVerbs` = verbs used last turn. */
export function verbLocked(verb, lastVerbs, alreadyThisTurn = 0) {
  if (verb === 'hate') {
    if (alreadyThisTurn >= ORDERS.maxHatePerTurn) return `Only ${ORDERS.maxHatePerTurn} Hate order per turn`;
  }
  if ((verb === 'accuse' || verb === 'praise') && alreadyThisTurn >= 1) return `Only one ${verb === 'accuse' ? 'Accuse' : 'Praise'} order per turn`;
  return null;
}

/** Check a whole turn's worth of orders against the seat's influence and the verb rules. */
export function validateOrders(orders, influence, world, lastVerbs = null, ghost = false) {
  if (!Array.isArray(orders)) return { ok: false, error: 'Orders must be a list' };
  if (ghost) {
    if (orders.length > 1) return { ok: false, error: 'A ghost can whisper one order a turn' };
    for (const o of orders) {
      if (!GHOST.verbs.includes(o.verb) || o.strength !== 1) return { ok: false, error: 'Ghosts can only whisper mild love, fear, praise, accuse or festival' };
    }
  }
  if (orders.length > ORDERS.maxOrdersPerTurn) return { ok: false, error: `At most ${ORDERS.maxOrdersPerTurn} orders per turn` };
  let cost = 0;
  const seen = {}; // how many times each verb has been used in this list
  for (const o of orders) {
    const r = validateOrder(o, world);
    if (!r.ok) return r;
    const locked = verbLocked(o.verb, lastVerbs, seen[o.verb] ?? 0);
    if (locked) return { ok: false, error: locked };
    seen[o.verb] = (seen[o.verb] ?? 0) + 1;
    cost += orderCost(o);
  }
  if (cost > influence) return { ok: false, error: `Not enough influence (${cost} > ${influence})` };
  return { ok: true, cost };
}

export function describeOrder(order) {
  const v = VERBS[order.verb];
  const where = order.target ? ` ${targetName(order.target)}` : '';
  const to = order.dest ? ` -> ${PLACES.find((p) => p.id === order.dest)?.name ?? order.dest}` : '';
  return `${describeSubject(order.subject)}${v.label}${where}${to} (${'!'.repeat(order.strength)})`;
}

/** An order as a plain sentence: "3 villagers will go to the Armory." */
export function plainOrder(order) {
  const s = order.subject;
  const who = !s || s.kind === 'all' ? 'Everyone' : s.kind === 'count' ? `${s.n} villager${s.n > 1 ? 's' : ''}`
    : s.kind === 'trait' ? `Your ${s.trait}s` : (s.names?.join(' & ') ?? 'Named villagers');
  const t = order.target ? targetName(order.target) : '';
  const the = order.target?.kind === 'villager' ? '' : 'the ';
  const text = {
    hate: `will grow to hate the ${t}`, love: `will warm to the ${t}`, fear: `will fear the ${t}`,
    protect: order.target?.kind === 'place' ? `will guard the ${t}` : `will stand guard over the ${t}`,
    avoid: `will keep away from the ${t}`, follow: `will go to the ${t}`, escort: `will follow ${t}`, hunt: `will hunt ${t}`,
    assault: order.target?.kind === 'place' ? `will attack whoever is at the ${t}` : `will charge the ${t}`, standdown: 'will stand down', arm: 'will fetch weapons from the armory',
    accuse: `will spread a rumor about the ${t}`, praise: `will praise the ${t}`, festival: `will throw a party at the ${t}`,
    scare: `will walk up to the ${t} and frighten them`, shove: `will walk up to the ${t} and push them away`, seize: `will grab ${t} and drag them ${order.dest ? 'to the ' + (PLACES.find((p) => p.id === order.dest)?.name ?? order.dest) : 'away'}`, scatter: 'will run away from everybody', ambush: `will lie in wait at the ${t}`,
  }[order.verb] ?? `will ${order.verb}`;
  void the;
  return `${who} ${text}.`;
}

export function describeSubject(s) {
  if (!s || s.kind === 'all') return '';
  if (s.kind === 'count') return `${s.n} villager${s.n > 1 ? 's' : ''}: `;
  if (s.kind === 'trait') return `${s.trait}s: `;
  return `${s.names?.join(' & ') ?? 'named villagers'}: `;
}

export function targetName(t) {
  if (t.kind === 'group') return GROUP_NAMES[t.id];
  if (t.kind === 'villager') return t.name ?? `villager ${t.id}`;
  return PLACES.find((p) => p.id === t.id)?.name ?? t.id;
}

/** Which of this seat's villagers does the order's subject pick out? null = everybody. */
function pickSubjects(world, seat, order) {
  const s = order.subject;
  if (!s || s.kind === 'all') return null;
  const mine = world.villagers.filter((v) => v.alive && v.faction === seat);
  if (s.kind === 'villagers') return new Set(s.ids.filter((id) => mine.some((v) => v.id === id)));
  if (s.kind === 'trait') {
    // A temperament is only known once the town has seen it (gunslingers carry their look from the start).
    const seen = (v) => v.revealed || v.trait === 'gunslinger';
    const hit = s.trait === 'armed' ? (v) => v.weapon !== 'none'
      : s.trait === 'unarmed' ? (v) => v.weapon === 'none'
      : (v) => v.trait === s.trait && seen(v);
    return new Set(mine.filter(hit).map((v) => v.id));
  }
  // A number of villagers: the ones closest to where they are being sent, otherwise random.
  const anchor = order.target?.kind === 'place' ? world.places.find((p) => p.id === order.target.id)
    : order.target?.kind === 'villager' ? world.villagers[order.target.id] : null;
  const sorted = anchor ? mine.slice().sort((a, b) => Math.hypot(a.x - anchor.x, a.y - anchor.y) - Math.hypot(b.x - anchor.x, b.y - anchor.y)) : shuffle(world.rng, mine);
  return new Set(sorted.slice(0, s.n).map((v) => v.id));
}

/**
 * Apply one seat's orders to the villagers they reach:
 *  - their own faction: full effect
 *  - neutrals: effect scaled by how much that neutral trusts this seat
 * Other factions are never touched directly (only rumors will do that, in M5).
 */
export function applyOrders(world, seat, orders, lastVerbs = null) {
  const notes = []; // plain-language results, for the leader's private feedback
  for (const order of orders) {
    if (order.verb === 'hunt' && world.villagers[order.target.id].faction === seat) {
      notes.push('Hunt: you cannot hunt your own villager.');
      continue;
    }
    if (order.verb === 'seize' && world.villagers[order.target.id].faction === seat) {
      notes.push('Seize: you cannot seize your own villager.');
      continue;
    }
    if ((order.verb === 'scare' || order.verb === 'shove' || order.verb === 'assault') && order.target.kind === 'group' && order.target.id === seat) {
      notes.push(`${order.verb === 'scare' ? 'Scare' : 'Assault'}: you cannot do that to your own faction.`);
      continue;
    }
    const subjects = pickSubjects(world, seat, order);
    if (subjects && subjects.size === 0) {
      notes.push(`${describeOrder(order)}: nobody fits (temperaments only count once the town has seen them).`);
      continue;
    }
    if (subjects) notes.push(`${describeOrder(order)}: ${subjects.size} villager${subjects.size > 1 ? 's' : ''} got the word.`);
    const S = order.strength;
    // Using the same verb two turns running makes people numb to it.
    const tired = lastVerbs?.has(order.verb) ? ORDERS.fatigue : 1;
    let matched = 0;
    let mismatched = 0;
    // Arm up sends only a few villagers to the armory (3 per point of strength), picked at random.
    const armPicks = order.verb === 'arm'
      ? new Set(subjects ? [...subjects].slice(0, S * ORDERS.armPerStrength) : shuffle(world.rng, world.villagers.filter((v) => v.alive && v.faction === seat)).slice(0, S * ORDERS.armPerStrength).map((v) => v.id))
      : null;
    // Hunters: the nearest villagers of yours, a couple per point of strength.
    let hunters = null;
    if (order.verb === 'hunt') {
      const prey = world.villagers[order.target.id];
      const pool = world.villagers.filter((v) => v.alive && v.faction === seat && (!subjects || subjects.has(v.id)));
      hunters = new Set(pool.sort((a, b) => Math.hypot(a.x - prey.x, a.y - prey.y) - Math.hypot(b.x - prey.x, b.y - prey.y)).slice(0, S * 2).map((v) => v.id));
    }
    // Seize: the nearest villagers (one more than the strength, at least two) go and grab one enemy together.
    let grabbers = null;
    if (order.verb === 'seize') {
      const prey = world.villagers[order.target.id];
      const pool = world.villagers.filter((v) => v.alive && v.faction === seat && !v.fx.seize && (!subjects || subjects.has(v.id)));
      grabbers = new Set(pool.sort((a, b) => Math.hypot(a.x - prey.x, a.y - prey.y) - Math.hypot(b.x - prey.x, b.y - prey.y)).slice(0, subjects ? 12 : S + 1).map((v) => v.id));
      notes.push(grabbers.size >= 2 ? `Seize: ${grabbers.size} of yours are going for ${prey.name}.` : `Seize: not enough villagers to lift ${prey.name} (it takes two).`);
    }
    // Assault: a squad (3 per point of strength, the nearest to the enemy unless named) charges a faction.
    if (order.verb === 'assault') {
      const where = order.target.kind === 'place' ? world.places.find((p) => p.id === order.target.id) : null;
      const foes = where
        ? world.villagers.filter((v) => v.alive && v.faction !== seat && Math.hypot(v.x - where.x, v.y - where.y) < where.radius * 1.3)
        : world.villagers.filter((v) => v.alive && groupOf(v) === order.target.id);
      const cx = where ? where.x : foes.reduce((n, v) => n + v.x, 0) / Math.max(1, foes.length);
      const cy = where ? where.y : foes.reduce((n, v) => n + v.y, 0) / Math.max(1, foes.length);
      const pool = world.villagers.filter((v) => v.alive && v.faction === seat && (!subjects || subjects.has(v.id)));
      hunters = new Set(pool.sort((a, b) => Math.hypot(a.x - cx, a.y - cy) - Math.hypot(b.x - cx, b.y - cy)).slice(0, subjects ? 12 : S * 3).map((v) => v.id));
    }

    for (const v of world.villagers) {
      if (!v.alive) continue;
      let w;
      if (v.faction === seat) w = 1;
      else if (v.faction === -1) w = v.trust[seat];
      else continue;
      if (subjects && !subjects.has(v.id)) continue; // this order is only for the people named
      const wf = w * tired; // numeric effects (not the behaviour orders below) fade with fatigue

      switch (order.verb) {
        case 'hate': {
          const g = order.target.id;
          if (v.faction === -1) (v.opinion[g] < 0 ? matched++ : mismatched++);
          v.opinion[g] = clamp(v.opinion[g] - ORDERS.hateOpinion * S * wf, -100, 100);
          v.aggression = clamp(v.aggression + ORDERS.hateAggression * S * wf, 0, 100);
          break;
        }
        case 'love': {
          const g = order.target.id;
          if (v.faction === -1) (v.opinion[g] > 10 ? matched++ : mismatched++);
          v.opinion[g] = clamp(v.opinion[g] + ORDERS.loveOpinion * S * wf, -100, 100);
          v.aggression = clamp(v.aggression - ORDERS.loveAggression * S * wf, 0, 100);
          if (!v.fx.love.includes(g)) v.fx.love.push(g);
          break;
        }
        case 'fear': {
          const g = order.target.id;
          if (v.faction === -1) (v.opinion[g] < 0 ? matched++ : mismatched++);
          v.fear[g] = clamp(v.fear[g] + ORDERS.fearAmount * S * wf, 0, 100);
          // Simplification: courage drops everywhere, not only "when near that faction".
          v.courage = Math.max(STATS.minStat, v.courage - ORDERS.fearCourage * S * wf);
          break;
        }
        // The behaviour orders below only reach neutrals by chance (their trust).
        case 'protect':
          if (w === 1 || world.rng() < w) v.fx.protect.push({ target: order.target, S });
          break;
        case 'avoid':
          if (w === 1 || world.rng() < w) v.fx.avoid.push({ target: order.target, S });
          break;
        case 'scatter':
          if (w === 1 || world.rng() < w) for (let g = 0; g < NUM_GROUPS; g++) if (g !== groupOf(v)) v.fx.avoid.push({ target: { kind: 'group', id: g }, S });
          break;
        case 'shove':
          if ((w === 1 || world.rng() < w) && order.target.id !== groupOf(v)) v.fx.shove.push({ group: order.target.id, S });
          break;
        case 'seize':
          if (grabbers.has(v.id)) v.fx.seize = { victim: order.target.id, dest: order.dest ?? 'houses' };
          break;
        case 'scare':
          if ((w === 1 || world.rng() < w) && order.target.id !== groupOf(v)) v.fx.scare.push({ group: order.target.id, S });
          break;
        case 'ambush':
          if (w === 1 || world.rng() < w) v.fx.ambush = order.target.id;
          break;
        case 'follow':
          if (w === 1 || world.rng() < w) v.fx.follow = order.target.id;
          break;
        case 'festival':
          if (w === 1 || world.rng() < w) v.fx.festival = order.target.id;
          break;
        case 'escort':
          if (v.id !== order.target.id && (w === 1 || world.rng() < w)) v.fx.escort = order.target.id;
          break;
        case 'hunt':
          if (hunters.has(v.id)) v.fx.hunt = order.target.id;
          break;
        case 'assault':
          if (hunters.has(v.id)) v.fx.assault = { kind: order.target.kind, id: order.target.id };
          break;
        case 'standdown':
          if (w === 1 || world.rng() < w) v.fx.standdown = true;
          break;
        case 'arm':
          if (v.faction === seat ? armPicks.has(v.id) : (w > 0 && world.rng() < w * 0.15)) {
            v.fx.arm = Math.max(v.fx.arm, S);
            v.armDone = false;
            v.aggression = clamp(v.aggression + ORDERS.armAggression * S, 0, 100);
            if (isFirearm(v.weapon) && v.ammo < WEAPONS[v.weapon].maxAmmo) v.ammo++; // reload
          }
          break;
      }
    }

    // Love makes pairs: some of your villagers get attached to villagers of the loved group.
    if (order.verb === 'love') formLoveBonds(world, seat, order.target.id, Math.max(1, Math.round(S * tired)));
    // A festival is a party for the whole turn, open to everyone who is there.
    if (order.verb === 'festival') world.festivals.push({ place: order.target.id, strength: S, seat });
    // A rumor is planted once, with a few listeners; it then spreads by itself.
    if (order.verb === 'accuse' || order.verb === 'praise') startRumor(world, seat, order.verb, order.target.id, S, tired);

    // Neutrals trust you more when your order matches how they already feel.
    if (matched + mismatched > 0) {
      for (const v of world.villagers) {
        if (v.faction !== -1 || !v.alive) continue;
        v.trust[seat] = clamp(v.trust[seat] + (matched >= mismatched ? ORDERS.trustMatchGain : -ORDERS.trustMismatchLoss), 0, 1);
      }
    }
  }
  return notes;
}

/** Extra influence for factions that are falling behind (anti-snowball). */
export function comebackBonus(livingByFaction, seat) {
  const alive = livingByFaction.filter((n) => n > 0);
  if (alive.length === 0 || livingByFaction[seat] === 0) return 0;
  const avg = alive.reduce((a, b) => a + b, 0) / alive.length;
  return livingByFaction[seat] < avg * INFLUENCE.comebackFraction ? INFLUENCE.comebackBonus : 0;
}

const clamp = (x, lo, hi) => Math.min(hi, Math.max(lo, x));
