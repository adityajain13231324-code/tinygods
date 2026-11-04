import { GROUP_NAMES, PLACES } from '../config/content.js';
import { CARDS, POWERS, TURN } from '../config/tunables.js';
import { formLoveBonds } from './bonds.js';
import { switchSides } from './loyalty.js';
import { groupOf } from './villager.js';
import { shuffle } from './rng.js';

// Cards: each dawn every leader is dealt a hand and may play ONE (free, secret). They are the
// moves orders can't do, and each one is meant to change the turn in a way you can see.
// Unplayed cards are discarded.

export const CARD_DEFS = {
  // turning the town
  forged: { name: 'Forged Letter', needs: 'group', blurb: 'The whole town reads a damning fake letter: everyone outside that faction turns on it and gets angrier, and it gains 6 notoriety.' },
  prophecy: { name: 'Prophecy', needs: 'group', blurb: 'Doom is foretold: that faction\'s villagers lose their nerve, start the turn panicking, and are far less aggressive.' },
  alibi: { name: 'Alibi', needs: null, blurb: 'Your notoriety is wiped and the whole town warms to you.' },
  // information and economy
  spy: { name: 'Spy', needs: 'group', blurb: 'Learn what a rival ordered, and steal a moment of their power: +1 Power this turn.' },
  census: { name: 'Census', needs: null, blurb: 'Count who is armed and how healthy every faction is, and collect +2 influence in taxes next turn.' },
  warchest: { name: 'War Chest', needs: null, blurb: 'A big stash for later: +4 influence next turn.' },
  // friends and foes
  bribe: { name: 'Bribe', needs: null, blurb: 'Every neutral trusts you completely this turn, and the one who likes you most signs up on the spot.' },
  recruit: { name: 'Recruit', needs: null, blurb: 'The three neutrals who like you most join your faction on the spot.' },
  matchmaker: { name: 'Matchmaker', needs: 'group', blurb: 'Your villagers pair up with theirs, and up to three of their lovebirds cross over and join you.' },
  treaty: { name: 'Peace Treaty', needs: 'group', blurb: 'You and that faction cannot start fights with each other for the first 30 seconds (the whole town phase).' },
  // pressure
  raid: { name: 'Armory Raid', needs: 'group', blurb: 'Empty a faction\'s armory shelf and take up to three weapons from its villagers for your own unarmed ones.' },
  spoiled: { name: 'Spoiled Bread', needs: 'group', blurb: 'A bad batch: a faction\'s villagers start the turn sick, 20 hp down (never fatal).' },
  alarm: { name: 'False Alarm', needs: 'group', blurb: 'Bells ring: a faction\'s villagers panic, are thrown outward from their crowd, and lose their nerve.' },
  kidnap: { name: 'Kidnap', needs: 'group', blurb: 'Their four most aggressive villagers are whisked away and fall asleep for most of the turn.' },
  bomb: { name: 'Time Bomb', needs: 'place', blurb: 'Plant a bomb at a place. It goes off 12 seconds into the turn and hurts everyone close except your own faction (who are only thrown about).' },
  // your own side
  rally: { name: 'Rally', needs: null, blurb: 'Your villagers are a touch braver and fiercer, slightly healed, and shielded for the first 2 seconds.' },
  medic: { name: 'Field Hospital', needs: null, blurb: 'Heal all your villagers by 30.' },
  truce: { name: 'Truce Bell', needs: null, blurb: 'Nobody in town can start a fight for the first 15 seconds, and you bank +3 influence for next turn.' },
};

export const CARD_IDS = Object.keys(CARD_DEFS);

/** Deal a fresh hand (uses its own random stream so it never disturbs the town's). */
export function dealHand(game) {
  return shuffle(game.cardRng, CARD_IDS.slice()).slice(0, CARDS.handSize);
}

export function validateCard(game, seat, card) {
  if (card === null || card === undefined) return { ok: true };
  const def = CARD_DEFS[card.id];
  if (!def) return { ok: false, error: 'Unknown card' };
  if (!game.hand[seat].includes(card.id)) return { ok: false, error: `You do not hold ${def.name} this turn` };
  if (game.world.peaceful && ['bomb', 'kidnap'].includes(card.id)) return { ok: false, error: `${def.name} is locked: the town is at peace until day ${TURN.peaceTurns + 1}` };
  if (def.needs === 'place' && !PLACES.some((p) => p.id === card.place)) return { ok: false, error: `${def.name} needs a place` };
  if (def.needs === 'group') {
    if (!Number.isInteger(card.group) || card.group < 0 || card.group > 4) return { ok: false, error: `${def.name} needs a faction` };
    if (card.id !== 'spy' && card.group === seat) return { ok: false, error: `${def.name} cannot target your own faction` };
    if (['spy', 'raid'].includes(card.id) && card.group > 3) return { ok: false, error: `${def.name} needs a faction with a leader` };
  }
  return { ok: true };
}

export function describeCard(card) {
  const def = CARD_DEFS[card.id];
  if (def.needs === 'place') return `${def.name} (${PLACES.find((p) => p.id === card.place)?.name ?? card.place})`;
  return def.needs === 'group' ? `${def.name} (${GROUP_NAMES[card.group]})` : def.name;
}

const members = (world, g) => world.villagers.filter((v) => v.alive && groupOf(v) === g);
const clamp = (x, lo, hi) => Math.min(hi, Math.max(lo, x));

/** Play a seat's chosen card. Runs at the end of the command phase, after everyone's orders are known. */
export function applyCard(game, seat, card) {
  const { world } = game;
  const g = card.group;
  const note = (text) => game.feedback[seat].push(`${CARD_DEFS[card.id].name}: ${text}`);
  switch (card.id) {
    case 'forged': {
      let n = 0;
      for (const v of world.villagers) {
        if (!v.alive || groupOf(v) === g) continue;
        v.opinion[g] = clamp(v.opinion[g] - 35, -100, 100);
        v.aggression = Math.min(100, v.aggression + 18);
        n++;
      }
      game.notoriety[g] += 6;
      note(`${n} villagers now distrust the ${GROUP_NAMES[g]}, who also gain notoriety.`);
      break;
    }
    case 'prophecy':
      for (const v of members(world, g)) {
        v.courage = Math.max(10, v.courage - 28);
        v.aggression = Math.max(0, v.aggression - 12);
        v.opinion[g] = Math.max(-100, v.opinion[g] - 15);
        v.panic = 3;
        v.panicX = v.x + (world.rng() - 0.5) * 300;
        v.panicY = v.y + (world.rng() - 0.5) * 300;
      }
      note(`the ${GROUP_NAMES[g]} are shaken to the core.`);
      break;
    case 'alibi':
      game.notoriety[seat] = 0;
      for (const v of world.villagers) if (v.alive && groupOf(v) !== seat) v.opinion[seat] = clamp(v.opinion[seat] + 20, -100, 100);
      note('the town forgets and forgives.');
      break;
    case 'spy': {
      const orders = game.pending[g];
      const theirCard = game.cardPending[g];
      const parts = (orders ?? []).map((o) => `${o.verb}${o.target ? ` ${o.target.kind === 'group' ? GROUP_NAMES[o.target.id] : o.target.name ?? o.target.id}` : ''} (${o.strength})`);
      if (theirCard) parts.push(`card: ${CARD_DEFS[theirCard.id].name}`);
      if (!world.peaceful) game.power[seat] += 1;
      note((game.seats[g]?.kind && !game.eliminated[g] ? `the ${GROUP_NAMES[g]} ordered ${parts.length ? parts.join(', ') : 'nothing'}.` : `the ${GROUP_NAMES[g]} have no leader.`) + (world.peaceful ? '' : ' You gain 1 Power.'));
      break;
    }
    case 'census': {
      const lines = [0, 1, 2, 3].filter((f) => !game.eliminated[f]).map((f) => {
        const vs = members(world, f);
        const armed = vs.filter((v) => v.weapon !== 'none').length;
        return `${GROUP_NAMES[f]} ${vs.length} alive, ${armed} armed, ${Math.round(vs.reduce((n, v) => n + v.hp, 0) / Math.max(1, vs.length))} avg hp`;
      });
      game.bonusInfluence[seat] += 2;
      note(lines.join('; ') + '. +2 influence next turn.');
      break;
    }
    case 'warchest':
      game.bonusInfluence[seat] += 4;
      note('+4 influence waiting for next turn.');
      break;
    case 'bribe':
      for (const v of world.villagers) {
        if (!v.alive || v.faction !== -1) continue;
        v.trust[seat] = 1;
        v.opinion[seat] = clamp(v.opinion[seat] + 30, -100, 100);
      }
      const bought = members(world, 4).sort((a, b) => b.opinion[seat] - a.opinion[seat])[0];
      if (bought) switchSides(world, bought, seat);
      note(bought ? `the neutrals are yours for the turn, and ${bought.name} signed up.` : 'the neutrals are yours for the turn.');
      break;
    case 'recruit': {
      const picks = members(world, 4).sort((a, b) => b.opinion[seat] - a.opinion[seat]).slice(0, 3);
      for (const v of picks) switchSides(world, v, seat);
      note(picks.length ? `${picks.map((v) => v.name).join(', ')} joined you.` : 'there were no neutrals left to recruit.');
      break;
    }
    case 'matchmaker': {
      formLoveBonds(world, seat, g, 3);
      // Love wins: up to three of their villagers who fell for one of yours cross over.
      const lovers = members(world, g).filter((v) => v.partnerId >= 0 && world.villagers[v.partnerId]?.faction === seat).slice(0, 3);
      for (const v of lovers) switchSides(world, v, seat);
      note(lovers.length ? `${lovers.map((v) => v.name).join(' and ')} fell in love and joined you.` : `your villagers are walking out with the ${GROUP_NAMES[g]}.`);
      break;
    }
    case 'treaty': {
      const mine = members(world, seat);
      const theirs = members(world, g);
      for (const a of mine) for (const b of theirs) {
        a.truceUntil[b.id] = world.time + 30;
        b.truceUntil[a.id] = world.time + 30;
      }
      note(`you and the ${GROUP_NAMES[g]} cannot fight this turn.`);
      break;
    }
    case 'raid': {
      world.armoryPool[g] = 0;
      const armed = shuffle(world.rng, members(world, g).filter((v) => v.weapon !== 'none')).slice(0, 3);
      const mine = shuffle(world.rng, members(world, seat).filter((v) => v.weapon === 'none'));
      armed.forEach((v, i) => {
        if (mine[i]) { mine[i].weapon = v.weapon; mine[i].ammo = v.ammo; }
        v.weapon = 'none';
        v.ammo = 0;
      });
      note(`the ${GROUP_NAMES[g]} armory is bare${armed.length ? `; you took ${Math.min(armed.length, mine.length)} weapon${armed.length === 1 ? '' : 's'} and ${armed.length} of theirs went missing` : ''}.`);
      break;
    }
    case 'spoiled':
      for (const v of members(world, g)) v.hp = Math.max(10, v.hp - 20);
      note(`the ${GROUP_NAMES[g]} are badly sick.`);
      break;
    case 'alarm': {
      const vs = members(world, g);
      const cx = vs.reduce((n, v) => n + v.x, 0) / Math.max(1, vs.length);
      const cy = vs.reduce((n, v) => n + v.y, 0) / Math.max(1, vs.length);
      for (const v of vs) {
        v.panic = 4;
        v.panicX = cx;
        v.panicY = cy;
        v.courage = Math.max(10, v.courage - 20); // they stay jumpy
        const d = Math.hypot(v.x - cx, v.y - cy) || 1;
        v.kx += ((v.x - cx) / d) * 420;
        v.ky += ((v.y - cy) / d) * 420;
      }
      note(`the ${GROUP_NAMES[g]} scatter in panic.`);
      break;
    }
    case 'kidnap': {
      const taken = members(world, g).sort((a, b) => b.aggression - a.aggression).slice(0, 4);
      for (const v of taken) {
        v.state = 'mourn';
        v.expression = 'calm';
        v.targetId = null;
        v.timer = 26;
        v.vx = 0;
        v.vy = 0;
      }
      note(taken.length ? `${taken.map((v) => v.name).join(', ')} were taken and sleep for most of the turn.` : 'there was nobody to take.');
      break;
    }
    case 'bomb': { // blast damage is set in combat.js updateBombs
      const p = world.places.find((q) => q.id === card.place);
      world.bombs.push({ x: p.x + (world.rng() - 0.5) * p.radius * 0.6, y: p.y + (world.rng() - 0.5) * p.radius * 0.6, r: 120, at: world.time + 12, seat });
      world.events.push({ type: 'bombPlanted', turn: world.turn, time: world.time, x: p.x, y: p.y });
      note(`a bomb ticks at the ${p.name}. It goes off 12 seconds into the turn.`);
      break;
    }
    case 'rally':
      for (const v of members(world, seat)) {
        v.courage = Math.min(100, v.courage + 5);
        v.aggression = Math.min(100, v.aggression + 3);
        v.hp = Math.min(100, v.hp + 4);
        v.blessUntil = world.time + 2;
      }
      note('your villagers stand a little taller and are briefly shielded.');
      break;
    case 'medic':
      for (const v of members(world, seat)) v.hp = Math.min(100, v.hp + 30);
      note('your villagers are patched up.');
      break;
    case 'truce':
      for (const v of world.villagers) {
        if (!v.alive) continue;
        v.aggression = Math.max(0, v.aggression - 25);
        v.calmUntil = Math.max(v.calmUntil, world.time + 15);
      }
      game.bonusInfluence[seat] += 3;
      note('nobody can start a fight for the first 15 seconds. +3 influence next turn.');
      break;
  }
  void POWERS;
}
