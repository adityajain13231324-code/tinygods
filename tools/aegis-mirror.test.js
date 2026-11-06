import test from 'node:test';
import assert from 'node:assert/strict';
import {createGame,updateGame} from '../src/sim/turn.js';
import {castPower,POWER_DEFS} from '../src/sim/powers.js';
import {resolveCombat,blast,powerDamage} from '../src/sim/combat.js';
import {applyCard} from '../src/sim/cards.js';
import {attributeKill} from '../src/sim/highlights.js';
import {describeDeath} from '../src/sim/events.js';
import {authoritativeState} from '../src/sim/state.js';
import {Replay} from '../src/render/replay.js';
import {parseCommand,resolvePower} from '../src/sim/parser.js';
import {POWERS} from '../src/config/tunables.js';
import {mulberry32} from '../src/sim/rng.js';

function fresh() {
  const g=createGame({seed:91,seats:Array.from({length:4},()=>({name:'P',kind:'human'}))});
  g.turn=g.world.turn=5;g.phase='sim';g.world.peaceful=false;g.world.time=10;g.power.fill(9);
  g.world.villagers.forEach((v,i)=>Object.assign(v,{x:50+i*5,y:50,px:50+i*5,py:50,state:'idle',partnerId:-1,cd:100,thinkTimer:100,timer:100,blessUntil:0,guardBonus:0}));
  const a=g.world.villagers.find(v=>v.faction===1),b=g.world.villagers.find(v=>v.faction===0);
  Object.assign(a,{x:1040,y:550,weapon:'gun',ammo:5,state:'attack',targetId:b.id,cd:0,courage:100,aggression:40,escalation:3});
  Object.assign(b,{x:900,y:550,hp:100,courage:50});g.world.rng=()=>.5;
  return {g,w:g.world,a,b};
}
function shield(x,seat=0,v=x.b) { assert.equal(castPower(x.g,seat,'aegis',{villagerId:v.id}).ok,true); }
function shoot(x) { x.a.cd=0;resolveCombat(x.w,.05); }

test('Aegis costs one, lasts six seconds, blocks one gun hit and reflects without spending extra ammunition',()=>{
  const x=fresh();shield(x);assert.equal(POWERS.aegis.seconds,6);assert.equal(POWER_DEFS.aegis.cost,1);
  assert.equal(x.g.power[0],8);assert.equal(x.b.aegisUntil,16);assert.equal(x.b.aegisSeat,0);
  shoot(x);assert.equal(x.b.hp,100);assert.ok(x.a.hp<100);assert.equal(x.a.ammo,4);
  assert.equal(x.b.aegisUntil,0);assert.equal(x.b.aegisSeat,-1);
  assert.equal(x.w.events.filter(e=>e.type==='gunshot').length,1);
  assert.equal(x.w.events.find(e=>e.type==='gunshot').blocked,true);
  assert.equal(x.w.events.filter(e=>e.type==='shieldReflect').length,1);
  shoot(x);assert.ok(x.b.hp<100);assert.equal(x.a.ammo,3);
  assert.equal(castPower(x.g,0,'aegis',{villagerId:x.b.id}).ok,false,'still once per turn');
});

test('misses leave the mirror intact and expiry at exactly six seconds removes reflection and mitigation',()=>{
  const x=fresh();shield(x);x.w.rng=()=>.999;shoot(x);
  assert.equal(x.b.aegisUntil,16);assert.equal(x.a.hp,100);assert.equal(x.b.hp,100);
  assert.equal(x.w.events.filter(e=>e.type==='shieldReflect').length,0);
  x.w.time=16;x.w.rng=()=>.5;shoot(x);assert.ok(x.b.hp<100);assert.equal(x.a.hp,100);
  const normal=fresh();shoot(normal);assert.equal(x.b.lastDamage,normal.b.lastDamage);
});

test('critical hits and Strength return their original damage without another critical or accuracy roll',()=>{
  for(const critical of [false,true]){
    const plain=fresh(),mirror=fresh();plain.a.damageBonus=mirror.a.damageBonus=.4;
    for(const x of [plain,mirror]){let calls=0;x.w.rng=()=>++calls===2?(critical?0:.5):.5;}
    shield(mirror);shoot(plain);shoot(mirror);
    assert.equal(mirror.a.lastDamage,plain.b.lastDamage);assert.equal(mirror.a.lastCritical,critical);
    assert.equal(mirror.w.events.find(e=>e.type==='shieldReflect').critical,critical);
  }
});

test('two opposing shields cannot form a reflection loop, and the shooter keeps its unused mirror',()=>{
  const x=fresh();shield(x);shield(x,1,x.a);shoot(x);
  assert.equal(x.b.hp,100);assert.ok(x.a.hp<100);assert.equal(x.a.aegisUntil,16);
  assert.equal(x.w.events.filter(e=>e.type==='shieldReflect').length,1);
  assert.equal(x.a.ammo,4);assert.equal(x.g.power[1],8);
});

test('shotgun direct and collateral hits can reflect, with one ammo use and normal damage to bystanders',()=>{
  for(const primary of [true,false]){
    const x=fresh(),c=x.w.villagers.find(v=>v.faction===2);
    Object.assign(c,{x:910,y:550,hp:100});x.a.x=970;x.a.weapon='shotgun';
    shield(x,0,primary?x.b:c);shoot(x);
    assert.equal((primary?x.b:c).hp,100);assert.ok((primary?c:x.b).hp<100);
    assert.equal(x.a.ammo,4);assert.equal(x.w.events.filter(e=>e.type==='shieldReflect').length,1);
  }
});

test('melee, explosions, continuous damage and rockets keep mitigation but do not consume the mirror; Rally remains independent',()=>{
  const x=fresh();shield(x);x.a.x=915;x.a.weapon='knife';shoot(x);
  assert.ok(x.b.hp<100);assert.equal(x.b.aegisUntil,16);
  x.b.hp=100;blast(x.w,1,900,550,85,{minDamage:20,maxDamage:20,minKnock:0,maxKnock:0});assert.equal(x.b.hp,92);
  powerDamage(x.w,x.b,10,{kind:'power',id:'whirlpool',seat:1});assert.equal(x.b.hp,88);
  x.a.weapon='rocket';x.a.ammo=5;shoot(x);assert.equal(x.b.aegisUntil,16);assert.equal(x.w.rockets.length,1);
  assert.equal(x.w.events.filter(e=>e.type==='shieldReflect').length,0);
  applyCard(x.g,0,{id:'rally'});const rallyUntil=x.b.blessUntil;
  x.a.weapon='gun';x.a.ammo=5;shoot(x);assert.equal(x.b.aegisUntil,0);assert.equal(x.b.blessUntil,rallyUntil);
});

test('reflected kills record the shield caster even on another faction, and public news does not expose that caster',()=>{
  const x=fresh();x.a.hp=1;shield(x,2);shoot(x);
  const e=x.w.events.find(e=>e.type==='kill');assert.ok(e);assert.equal(e.victimId,x.a.id);
  assert.equal(e.source.id,'aegis');assert.equal(e.source.seat,2);assert.equal(e.source.originalShooterId,x.a.id);
  assert.equal(e.killerFaction,2);assert.equal(attributeKill(x.g,5,e).seat,2);
  assert.match(attributeKill(x.g,5,e).reason,/Aegis/);
  assert.match(describeDeath(x.w,e),/Aegis-reflected bullet/);assert.doesNotMatch(describeDeath(x.w,e),/Time Bomb|Sprouts/);
});

test('recorder captures intact and shattered shields and replay restores exact live state and RNG',()=>{
  const x=fresh();shield(x);x.w.rng=mulberry32(1);
  const rec=x.g.recorder;rec.reset();rec.capture(x.w);
  x.w.time=10.1;rec.capture(x.w);shoot(x);assert.equal(x.b.aegisUntil,0);
  x.w.time=10.2;rec.capture(x.w);
  x.g.phase='recap';const before=authoritativeState(x.g);
  const replay=new Replay({game:x.g,camera:{cut(){},hold:0}});
  replay.play({x:900,y:550,t0:10,t1:10.2});assert.equal(x.b.aegisUntil,16);
  replay.update(.11);assert.equal(x.b.aegisUntil,0);replay.stop();
  assert.deepEqual(authoritativeState(x.g),before);
});

test('a mirror on a neutral still records its eliminated caster without a living kill-credit proxy',()=>{
  const x=fresh(),n=x.w.villagers.find(v=>v.faction<0);
  Object.assign(n,{x:900,y:550,hp:100});x.a.targetId=n.id;x.a.hp=1;shield(x,0,n);
  x.w.villagers.filter(v=>v.faction===0).forEach(v=>v.alive=false);x.g.eliminated[0]=true;
  shoot(x);const e=x.w.events.find(e=>e.type==='kill');assert.ok(e);
  assert.equal(n.hp,100);assert.equal(e.source.seat,0);assert.equal(e.killerId,-1);
});

test('dusk clears the mirror and typed mirror shield commands resolve to the existing Aegis power',()=>{
  const x=fresh();shield(x);x.g.simElapsed=x.g.simSeconds;updateGame(x.g,.05);
  assert.equal(x.b.aegisUntil,0);assert.equal(x.b.aegisSeat,-1);
  const y=fresh(),p=parseCommand('mirror shield my weakest',y.g,0);assert.ok(p.ok);
  const r=resolvePower(y.g,0,p.actions[0].power);assert.ok(r.ok);assert.equal(r.id,'aegis');
});
