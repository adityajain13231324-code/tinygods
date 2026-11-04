import test from 'node:test';
import assert from 'node:assert/strict';
import { createGame, submitOrders, updateGame } from '../src/sim/turn.js';
import { Lockstep, stateHash, authoritativeState } from '../src/net/lockstep.js';
import { blast, updateBombs } from '../src/sim/combat.js';
import { applyCard } from '../src/sim/cards.js';
import { castPower } from '../src/sim/powers.js';
import { attributeKill, buildHighlights } from '../src/sim/highlights.js';
import { describeDeath, buildRecap } from '../src/sim/events.js';
import { buildStory } from '../src/sim/story.js';

const fresh = () => createGame({ seed: 41, seats: Array.from({ length: 4 }, (_, i) => ({ name: `P${i}`, kind: 'human' })) });
function live(g = fresh()) { g.turn = g.world.turn = 5; g.world.peaceful = false; g.power.fill(3); for (let s = 0; s < 4; s++) submitOrders(g,s,[]); updateGame(g,0); return g; }

test('state comparison catches opinions, hands, powers and each RNG, excludes presentation', () => {
  const a = fresh(), b = fresh();
  b.timer -= 12; b.acc = 0.02; b.suggestRound = 8; b.recorder.capture(b.world);
  assert.deepEqual(authoritativeState(a), authoritativeState(b));
  for (const mutate of [g=>g.world.villagers[0].opinion[1]++, g=>g.hand[0].pop(), g=>g.power[0]++, g=>g.world.rng(), g=>g.botRng(), g=>g.cardRng(), g=>g.eventRng()]) {
    const c = fresh(); mutate(c); assert.notEqual(stateHash(a),stateHash(c));
  }
});

test('host bounds future queues and rejects invalid, duplicate and nonhuman packets', () => {
  const g = fresh(), host = new Lockstep({game:g,role:'host',mySeat:0});
  for(let i=0;i<100;i++) host.onMessage(1,{t:'sub',turn:g.turn+1,orders:[]});
  assert.equal(host.early.length,1);
  for(const from of [null,-1,4,'1']) host.onMessage(from,{t:'sub',turn:g.turn,orders:[]});
  assert.deepEqual(host.subs,{});
  host.onMessage(1,{t:'sub',turn:g.turn,orders:[]});
  host.onMessage(1,{t:'sub',turn:g.turn,orders:[{verb:'arm',strength:1}]});
  assert.deepEqual(host.subs[1].orders,[]);
  live(g);
  const before=g.power[1];
  for(const args of [null,[],{x:-1,y:0},{x:Infinity,y:2}]) host.onMessage(1,{t:'cast',turn:g.turn,id:'fireball',args});
  assert.equal(host.inbox.length,0); assert.equal(g.power[1],before);
  host.onMessage(1,{t:'cast',turn:g.turn,id:'fireball',args:{x:900,y:500,evil:'ignored'}});
  host.onMessage(1,{t:'cast',turn:g.turn,id:'fireball',args:{x:900,y:500}});
  assert.equal(host.inbox.length,1);
  assert.deepEqual(host.inbox[0].args,{x:900,y:500});
});

test('multiple bombs retain exact owners and bombs still kill after their faction falls', () => {
  const g=live(), w=g.world;
  for(const v of w.villagers){v.x=50;v.y=50;}
  applyCard(g,0,{id:'bomb',place:'plaza'});
  applyCard(g,2,{id:'bomb',place:'pond'});
  assert.equal(w.bombs[1].source.seat,2);
  for(const v of w.villagers) if(v.faction===2)v.alive=false;
  const victim=w.villagers.find(v=>v.faction===1);
  Object.assign(victim,{x:w.bombs[1].x,y:w.bombs[1].y,hp:1});
  w.time=13; updateBombs(w);
  const e=w.events.find(e=>e.type==='kill'&&e.victimId===victim.id);
  assert.equal(e.killerFaction,2); assert.equal(e.killerId,-1);
  assert.equal(attributeKill(g,5,e).seat,2);
  assert.equal(attributeKill(g,5,e).kind,'recorded');
  assert.match(describeDeath(w,e),/Time Bomb/);
  assert.doesNotMatch(describeDeath(w,e),/Sprouts/);
});

test('Fireball provenance differs from a same-turn bomb, with allied immunity unchanged', () => {
  const g=live(), w=g.world;
  for(const v of w.villagers){v.x=50;v.y=50;}
  const own=w.villagers.find(v=>v.faction===3), prey=w.villagers.find(v=>v.faction===1);
  Object.assign(own,{x:902,y:500,hp:60}); Object.assign(prey,{x:901,y:500,hp:1});
  g.truth[0].card={id:'bomb',place:'plaza'};
  assert.equal(castPower(g,3,'fireball',{x:900,y:500}).ok,true);
  const e=w.events.find(e=>e.type==='kill');
  assert.equal(e.weapon,'fireball'); assert.equal(e.source.seat,3);
  assert.equal(own.hp,60); assert.ok(Math.hypot(own.kx,own.ky)>0);
  assert.equal(attributeKill(g,5,e).seat,3);
  assert.match(describeDeath(w,e),/fireball/);
});

test('historical death identities survive defection and explanations qualify inference', () => {
  const g=live(), w=g.world, killer=w.villagers[0], victim=w.villagers.find(v=>v.faction===1);
  const e={type:'kill',turn:5,time:1,killerId:killer.id,victimId:victim.id,killerFaction:0,victimFaction:1,weapon:'bat',witnesses:1,x:900,y:500,place:'plaza',beliefs:[]};
  w.events.push(e); killer.faction=2; victim.faction=3;
  g.truth[0].orders=[{verb:'hate',target:{kind:'group',id:1},strength:2}];
  assert.match(describeDeath(w,e),/Embers.*Tides/);
  assert.doesNotMatch(describeDeath(w,e),/Sprouts|Sparks/);
  assert.match(attributeKill(g,5,e).reason,/Possible influence/);
  g.allHighlights=buildHighlights(g,5);g.winner=0;g.winReason='Last faction standing';
  assert.match(buildRecap(w,5,[1,1,1,1]).headlines[0],/Embers.*Tides/);
  assert.match(buildStory(g).join(' '),/spending, not responsibility/);
  g.truth[0].orders=[];
  assert.match(attributeKill(g,5,e).reason,/does not establish/);
});
