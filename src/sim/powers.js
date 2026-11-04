import { POWERS, TURN, WORLD } from '../config/tunables.js';
import { GROUP_NAMES } from '../config/content.js';
import { goToPlace, startAttack, startIdle } from './brain.js';
import { blast } from './combat.js';
import { groupOf } from './villager.js';
import { shoveFrom, shoveToward } from './shove.js';

// God powers: live miracles used while the town acts. Each costs Power points (they refill every
// turn, unspent points are lost). Like orders they are secret: the town sees what happens, not who did it.
//   lightning  a bolt that scatters a brawl and calms everyone nearby
//   miracle    heal one villager (and make their group like you a bit)
//   whisper    plant a thought in one villager's head about a faction
//   fog        a patch of fog where nobody can start a fight for a while
//   gust       blow one villager toward a place

export const POWER_DEFS = {
  // calm and protect
  miracle: { name: 'Miracle', icon: '✨', cost: POWERS.miracle.cost, needs: 'villager', hint: 'Click a villager to heal them.', blurb: 'Heal one villager. Their faction warms to you.' },
  aegis: { name: 'Aegis', icon: '🛡️', cost: POWERS.aegis.cost, needs: 'villager', hint: 'Click a villager to shield them.', blurb: 'One villager takes 60% less damage for 16 seconds.' },
  rain: { name: 'Downpour', icon: '🌧️', cost: POWERS.rain.cost, needs: 'point', hint: 'Click a spot: everyone there cools off.', blurb: 'A heavy rain on a wide area: fights break up and tempers drop.' },
  fog: { name: 'Fog', icon: '🌫️', cost: POWERS.fog.cost, needs: 'point', hint: 'Click a spot for fog.', blurb: 'A patch of fog: fights inside stop at once and nobody in it can pick a new one for a while (they still defend themselves).' },
  sleep: { name: 'Sleep', icon: '💤', cost: POWERS.sleep.cost, needs: 'villager', hint: 'Click a villager to put them to sleep.', blurb: 'One villager freezes in place for 8 seconds.' },
  // mind games
  whisper: { name: 'Whisper', icon: '👂', cost: POWERS.whisper.cost, needs: 'villager+group', hint: 'Choose a faction, then click a villager to whisper to.', blurb: 'Plant a thought in one villager: they now distrust (or like) a faction.' },
  charm: { name: 'Charm', icon: '💘', cost: POWERS.charm.cost, needs: 'villager', hint: 'Click a villager to charm.', blurb: 'A villager of any faction warms to you and will not hurt your people for a while.' },
  enrage: { name: 'Enrage', icon: '😡', cost: POWERS.enrage.cost, needs: 'villager', hint: 'Click a villager to enrage.', blurb: 'A villager flies into a rage and attacks the nearest outsider.' },
  // moving people
  gust: { name: 'Gust', icon: '💨', cost: POWERS.gust.cost, needs: 'villager+place', hint: 'Choose a place, then click the villager to blow there.', blurb: 'A real shove: blows one villager (and anyone beside them) toward a place.' },
  tornado: { name: 'Tornado', icon: '🌪️', cost: POWERS.tornado.cost, needs: 'point', hint: 'Click a spot: everyone nearby is dragged in and flung.', blurb: 'Drags everyone nearby toward the centre, then they scatter, scared.' },
  earthquake: { name: 'Earthquake', icon: '🌋', cost: POWERS.earthquake.cost, needs: 'none', hint: 'Cast at once: the whole town shakes.', blurb: 'Every fight stops, everyone is shoved in a random direction, the whole town panics.' },
  // violence
  lightning: { name: 'Lightning', icon: '⚡', cost: POWERS.lightning.cost, needs: 'point', hint: 'Click a spot to strike it.', blurb: 'A bolt that throws everyone nearby back and scatters a brawl. Hurts little.' },
  fireball: { name: 'Fireball', icon: '🔥', cost: POWERS.fireball.cost, needs: 'point', hint: 'Click a spot: a small, deadly blast.', blurb: 'A small explosion that hurts and flings whoever stands there, friend or foe.' },
  disarm: { name: 'Disarm', icon: '🪓', cost: POWERS.disarm.cost, needs: 'point', hint: 'Click a spot: weapons fly out of hands.', blurb: 'Everyone near the spot drops their weapon and is shoved away.' },
};

const dist = (a, x, y) => Math.hypot(a.x - x, a.y - y);

/**
 * Cast a power. `args` depends on the power: {x, y} | {villagerId} | {villagerId, group, good?} | {villagerId, placeId}.
 * @returns {{ok: true, message: string} | {ok: false, error: string}}
 */
export function castPower(game, seat, id, args = {}) {
  const def = POWER_DEFS[id];
  if (!def) return { ok: false, error: 'Unknown power' };
  if (game.phase !== 'sim') return { ok: false, error: 'Powers work while the town acts' };
  if (game.world.peaceful) return { ok: false, error: `Miracles unlock on day ${TURN.peaceTurns + 1}. The town is still at peace.` };
  if (game.eliminated[seat]) return { ok: false, error: 'Your faction has fallen' };
  if ((game.power[seat] ?? 0) < def.cost) return { ok: false, error: `Not enough power (${def.name} costs ${def.cost})` };

  const { world } = game;
  const v = args.villagerId !== undefined ? world.villagers[args.villagerId] : null;
  if (def.needs.startsWith('villager') && (!v || !v.alive)) return { ok: false, error: 'Pick a living villager' };
  if (def.needs === 'point' && !(Number.isFinite(args.x) && Number.isFinite(args.y))) return { ok: false, error: 'Pick a spot on the map' };

  let message = '';
  switch (id) {
    case 'lightning': {
      let n = 0;
      for (const o of world.villagers) {
        if (!o.alive || dist(o, args.x, args.y) > POWERS.lightning.radius) continue;
        n++;
        o.hp = Math.max(1, o.hp - POWERS.lightning.damage);
        o.lastDamage = POWERS.lightning.damage;
        o.hitFromX = args.x;
        o.hitFromY = args.y;
        o.calmUntil = world.time + POWERS.lightning.calmSeconds;
        shoveFrom(o, args.x, args.y, 520 * (1 - 0.6 * (dist(o, args.x, args.y) / POWERS.lightning.radius))); // the blast throws them back
        o.panic = Math.max(o.panic, 1.5);
        o.panicX = args.x;
        o.panicY = args.y;
        startIdle(world, o, 'lightning');
      }
      message = n ? `Lightning scattered ${n} villager${n > 1 ? 's' : ''}.` : 'Lightning struck an empty spot.';
      break;
    }
    case 'miracle': {
      v.hp = Math.min(100, v.hp + POWERS.miracle.heal);
      const g = groupOf(v);
      for (const o of world.villagers) if (o.alive && groupOf(o) === g) o.opinion[seat] = Math.min(100, o.opinion[seat] + POWERS.miracle.opinion);
      message = `${v.name} was healed.`;
      break;
    }
    case 'whisper': {
      const g = args.group;
      if (!Number.isInteger(g) || g < 0 || g > 4) return { ok: false, error: 'Whisper about which faction?' };
      if (g === groupOf(v)) return { ok: false, error: `${v.name} knows their own group too well to be fooled` };
      v.opinion[g] = Math.max(-100, Math.min(100, v.opinion[g] + (args.good ? 1 : -1) * POWERS.whisper.shift));
      message = `${v.name} now ${args.good ? 'likes' : 'distrusts'} the ${GROUP_NAMES[g]} a little more.`;
      break;
    }
    case 'aegis':
      v.blessUntil = world.time + POWERS.aegis.seconds;
      message = `${v.name} is shielded.`;
      break;
    case 'sleep':
      v.state = 'mourn'; // frozen in place
      v.expression = 'calm';
      v.targetId = null;
      v.purpose = null;
      v.timer = POWERS.sleep.seconds;
      v.vx = 0;
      v.vy = 0;
      message = `${v.name} fell asleep.`;
      break;
    case 'charm': {
      v.opinion[seat] = Math.min(100, v.opinion[seat] + POWERS.charm.opinion);
      if (v.faction === -1) v.trust[seat] = Math.min(1, v.trust[seat] + 0.4);
      for (const o of world.villagers) {
        if (o.alive && o.faction === seat) {
          v.truceUntil[o.id] = world.time + POWERS.charm.truceSeconds;
          o.truceUntil[v.id] = world.time + POWERS.charm.truceSeconds;
          if (v.state === 'attack' && v.targetId === o.id) startIdle(world, v, 'charmed');
        }
      }
      message = `${v.name} is charmed.`;
      break;
    }
    case 'enrage': {
      let best = null;
      let bestD = Infinity;
      for (const o of world.villagers) {
        if (!o.alive || o === v || groupOf(o) === groupOf(v)) continue;
        const d = dist(o, v.x, v.y);
        if (d < bestD) { bestD = d; best = o; }
      }
      v.aggression = 100;
      v.courage = Math.min(100, v.courage + 25);
      v.calmUntil = 0;
      if (best) startAttack(world, v, best, 'enraged by a god');
      message = best ? `${v.name} charged at ${best.name}.` : `${v.name} fumes.`;
      break;
    }
    case 'rain': {
      let n = 0;
      for (const o of world.villagers) {
        if (!o.alive || dist(o, args.x, args.y) > POWERS.rain.radius) continue;
        n++;
        o.aggression = Math.max(0, o.aggression - 20);
        o.calmUntil = Math.max(o.calmUntil, world.time + POWERS.rain.calmSeconds);
        if (o.state === 'attack') startIdle(world, o, 'rain');
      }
      world.fogs.push({ x: args.x, y: args.y, r: POWERS.rain.radius, until: world.time + POWERS.rain.calmSeconds, rain: true });
      message = `The rain cooled ${n} villager${n === 1 ? '' : 's'}.`;
      break;
    }
    case 'tornado': {
      let n = 0;
      for (const o of world.villagers) {
        if (!o.alive || dist(o, args.x, args.y) > POWERS.tornado.radius) continue;
        n++;
        shoveToward(o, args.x, args.y, POWERS.tornado.pull); // dragged in...
        o.panic = Math.max(o.panic, 2.5);
        o.panicX = args.x;
        o.panicY = args.y;
        if (o.state === 'attack') startIdle(world, o, 'tornado');
        world.tornadoes.push({ id: o.id, x: args.x, y: args.y, at: world.time + 0.55 }); // ...then flung back out
      }
      message = `A tornado caught ${n} villager${n === 1 ? '' : 's'}.`;
      break;
    }
    case 'earthquake': {
      for (const o of world.villagers) {
        if (!o.alive) continue;
        const a = world.rng() * Math.PI * 2;
        o.kx += Math.cos(a) * POWERS.earthquake.shove;
        o.ky += Math.sin(a) * POWERS.earthquake.shove;
        o.hp = Math.max(1, o.hp - POWERS.earthquake.damage);
        o.panic = Math.max(o.panic, 2);
        o.panicX = WORLD.width / 2;
        o.panicY = WORLD.height / 2;
        o.calmUntil = Math.max(o.calmUntil, world.time + 4);
        if (o.state === 'attack') startIdle(world, o, 'earthquake');
      }
      message = 'The whole town shook.';
      break;
    }
    case 'fireball': {
      const n = blast(world, seat, args.x, args.y, POWERS.fireball.radius, { minDamage: POWERS.fireball.minDamage, maxDamage: POWERS.fireball.maxDamage, minKnock: 300, maxKnock: 600 });
      message = n ? `The fireball hit ${n} villager${n === 1 ? '' : 's'}.` : 'The fireball burned an empty patch.';
      break;
    }
    case 'disarm': {
      let n = 0;
      for (const o of world.villagers) {
        if (!o.alive || dist(o, args.x, args.y) > POWERS.disarm.radius) continue;
        if (o.weapon !== 'none') { o.weapon = 'none'; o.ammo = 0; n++; }
        shoveFrom(o, args.x, args.y, 300);
      }
      message = n ? `${n} weapon${n === 1 ? '' : 's'} flew out of hands.` : 'Nobody there was armed.';
      break;
    }
    case 'fog': {
      world.fogs.push({ x: args.x, y: args.y, r: POWERS.fog.radius, until: world.time + POWERS.fog.seconds });
      for (const o of world.villagers) {
        if (!o.alive || dist(o, args.x, args.y) > POWERS.fog.radius) continue;
        o.calmUntil = Math.max(o.calmUntil, world.time + 4);
        if (o.state === 'attack') startIdle(world, o, 'fog');
      }
      message = 'Fog rolled in.';
      break;
    }
    case 'gust': {
      const place = world.places.find((p) => p.id === args.placeId);
      if (!place) return { ok: false, error: 'Blow them toward which place?' };
      if (v.state === 'attack') startIdle(world, v, 'gust');
      goToPlace(world, v, place, 'follow');
      shoveToward(v, place.x, place.y, 640); // a real shove, not just a nudge
      for (const o of world.villagers) if (o.alive && o !== v && dist(o, v.x, v.y) < 90) shoveToward(o, place.x, place.y, 420); // anyone beside them gets swept along
      message = `${v.name} was blown toward the ${place.name}.`;
      break;
    }
  }

  game.power[seat] -= def.cost;
  const at = v ? { x: v.x, y: v.y } : { x: args.x, y: args.y };
  world.events.push({ type: 'power', turn: world.turn, time: world.time, power: id, x: at.x, y: at.y, seat, villagerId: v?.id ?? -1, group: args.group ?? -1 });
  const entry = game.truth.findLast?.((t) => t.turn === game.turn && t.seat === seat);
  if (entry) (entry.extras ??= []).push({ kind: 'power', id, group: args.group ?? -1, villagerId: v?.id ?? -1 });
  game.feedback[seat].push(`${def.name}: ${message}`);
  return { ok: true, message };
}

/** Where is the fight? The centre of the biggest cluster of attackers (a default spot for Lightning and Fog). */
export function hotspot(world) {
  let best = null;
  let bestN = 0;
  const fighters = world.villagers.filter((v) => v.alive && v.state === 'attack');
  for (const f of fighters) {
    const n = fighters.filter((o) => dist(o, f.x, f.y) < 110).length;
    if (n > bestN) { bestN = n; best = f; }
  }
  return best ? { x: best.x, y: best.y, n: bestN } : null;
}
