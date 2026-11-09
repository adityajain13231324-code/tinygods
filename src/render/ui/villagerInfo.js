import { ACTIVITY_TEXT, FACTIONS, GROUP_NAMES } from '../../config/content.js';
import { groupOf } from '../../sim/villager.js';

const TRAITS = {
  brawler: 'Hothead: picks fights fast, hard to scare off', coward: 'Coward: runs at the first shove',
  gunslinger: 'Gunslinger: a shotgun and nerves of steel', peacemaker: 'Peacemaker: breaks up fights',
  medic: 'Medic: heals the hurt, never starts a fight', bodyguard: 'Bodyguard: defends their friend, not rattled by guns',
  wildcard: 'Wildcard: unpredictable temper',
  troublemaker: 'Troublemaker: steals weapons, spreads rumors, dashes through fights. Not immune: guard, recruit or hunt them',
};
const name = v => v ? `${v.name} (${v.faction >= 0 ? FACTIONS[v.faction].name : 'neutral'})` : 'someone';

// Shared by hover and the keyboard/touch roster. Never reads secret orders or unrevealed traits.
export function villagerInfo(game, v) {
  const other = game.world.villagers[v.targetId];
  const action = {
    attack: `Fighting ${name(other)}`, flee: 'Running for their life', mourn: `Mourning ${other?.name ?? 'a friend'}`,
    guard: 'Guarding', seek: `Heading over to chat with ${name(other)}`,
    talk: `${v.expression === 'love' ? 'Hugging' : v.expression === 'angry' ? 'Arguing with' : 'Chatting with'} ${name(other)}`,
    wander: v.purpose === 'arm' ? 'Going to the Armory' : v.purpose === 'follow' ? 'Heading to their post' : 'Strolling about',
  };
  const weapon = v.weapon === 'none' ? 'bare fists' : v.weapon === 'gun' ? `pistol (${v.ammo} bullets)` : v.weapon === 'shotgun' ? `shotgun (${v.ammo} shells)` : v.weapon === 'rocket' ? `rocket launcher (${v.ammo} rockets)` : v.weapon;
  const lines = [`HP ${Math.ceil(v.hp)}/${v.maxHp} · ${weapon}${v.leader ? ' · LEADER' : ''}`, v.alive ? action[v.state] ?? ACTIVITY_TEXT[v.activity] ?? 'Relaxing' : 'Dead',
    v.trait && (v.revealed || v.trait === 'gunslinger') ? TRAITS[v.trait] ?? 'Temperament: ordinary' : v.revealed ? 'Temperament: ordinary' : 'Temperament: not seen yet'];
  if (v.alive && v.frozenUntil > game.world.time) lines.push(`Frozen (${Math.ceil(v.frozenUntil - game.world.time)}s)`);
  if (v.alive && v.aegisUntil > game.world.time) lines.push(`Aegis mirror (${Math.ceil(v.aegisUntil - game.world.time)}s): reflects the next bullet hit`);
  if (v.alive && v.damageBonus > 0) lines.push(`Strength +${Math.round(v.damageBonus * 100)}% until dusk`);
  if (v.alive && game.world.blackoutUntil > game.world.time) lines.push('Confused by Blackout: attacks paused');
  if (v.mood < -0.5) lines.push('Having a bad day');
  if (v.mood > 0.5) lines.push('In a good mood');
  if (v.alive && v.fx.when) lines.push(`Fallback order: ${v.whenActive ? 'ACTIVE, ' : ''}if ${v.fx.when.cond} -> ${v.fx.when.retreat ? 'retreat to the ' + (game.world.places.find((p) => p.id === v.fx.when.retreat)?.name ?? v.fx.when.retreat) : 'stand down'}`);
  if (v.alive && v.fx.formation) lines.push(`Formation: ${v.fx.formation.style}`);
  for (const m of (v.memory ?? []).slice(0, 3)) { const o = game.world.villagers[m.id]; if (o) lines.push(`Remembers ${o.name}: ${{ injured: 'hurt me', scared: 'scared me', robbed: 'robbed me', betrayed: 'betrayed me', rescued: 'helped me' }[m.kind] ?? m.kind}`); }
  if (v.partnerId >= 0) lines.push(`Bonded with ${name(game.world.villagers[v.partnerId])}`);
  const feelings = v.opinion.map((score, group) => ({score, group})).filter(r => r.group !== groupOf(v)).sort((a,b) => a.score-b.score);
  if (feelings[0]?.score < -15) lines.push(`Hates ${GROUP_NAMES[feelings[0].group]} (${Math.round(feelings[0].score)})`);
  if (feelings.at(-1)?.score > 15) lines.push(`Likes ${GROUP_NAMES[feelings.at(-1).group]} (+${Math.round(feelings.at(-1).score)})`);
  const afraid = v.fear.map((score, group) => ({score, group})).sort((a,b)=>b.score-a.score)[0];
  if (afraid?.score > 20) lines.push(`Afraid of ${GROUP_NAMES[afraid.group]} (${Math.round(afraid.score)})`);
  if (lines.length === 3) lines.push('No strong feelings');
  return { title: name(v), lines };
}
