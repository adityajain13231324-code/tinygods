import test from 'node:test';
import assert from 'node:assert/strict';
import { createGame } from '../src/sim/turn.js';
import { resolveCombat } from '../src/sim/combat.js';
import { stepWorld } from '../src/sim/brain.js';
import { CARD_DEFS, cardTargetGroups, validateCard, applyCard } from '../src/sim/cards.js';
import { parseCommand } from '../src/sim/parser.js';
import { authoritativeState } from '../src/sim/state.js';
import { validateOrders } from '../src/sim/orders.js';
import { castPower } from '../src/sim/powers.js';
import { applyLoyalty } from '../src/sim/loyalty.js';

function fresh() {
  const g=createGame({seed:717,seats:Array.from({length:4},()=>({name:'Player',kind:'human'}))});
  g.phase='sim';g.turn=g.world.turn=5;g.world.peaceful=false;g.world.time=10;
  g.world.villagers.forEach((v,i)=>Object.assign(v,{x:50+i*20,y:100,px:50+i*20,py:100,thinkTimer:100,timer:100,state:'idle',partnerId:-1}));
  return g;
}
function retreat() {
  const g=fresh(),w=g.world,a=w.villagers.find(v=>v.faction===0),b=w.villagers.find(v=>v.faction===1);
  Object.assign(a,{x:900,y:550,px:900,py:550,weapon:'rocket',ammo:5,state:'flee',cd:0,targetId:null,fleeX:1000,fleeY:550,fleeToX:300,fleeToY:550,fleeTotal:6,timer:6,escalation:0});
  Object.assign(b,{x:1050,y:550,state:'attack',targetId:a.id,cd:100});
  return {g,w,a,b};
}

test('retreating launcher holders fire at pursuers without switching to attack or stopping their retreat',()=>{
  const {w,a,b}=retreat();w.rng=()=>0;
  const state={state:a.state,target:a.targetId,tx:a.fleeToX,ty:a.fleeToY};
  stepWorld(w,.05);
  assert.equal(w.rockets.length,1);assert.equal(a.ammo,4);assert.equal(w.rockets[0].tx,b.x);
  assert.deepEqual({state:a.state,target:a.targetId,tx:a.fleeToX,ty:a.fleeToY},state);
  assert.ok(a.x<900,'still running away while firing');
  resolveCombat(w,.05);assert.equal(a.ammo,4,'existing cooldown is respected');
});

test('retreat rolls happen once per firing opportunity, with a higher chance against pursuers',()=>{
  for(const [pursued,roll,fires] of [[false,.749,true],[false,.75,false],[true,.899,true],[true,.90,false]]) {
    const {w,a,b}=retreat();b.state=pursued?'attack':'idle';a.grudge[1]=10;
    let rolls=0;w.rng=()=>{rolls++;return roll;};
    resolveCombat(w,.05);assert.equal(w.rockets.length,fires?1:0);
    assert.equal(a.ammo,fires?4:5);
    const before=rolls;resolveCombat(w,.05);assert.equal(rolls,before,'no per-tick retry lottery');
  }
});

test('Run/Avoid orders allow return fire, but friendly villagers and sleeping carriers are not targets',()=>{
  const {w,a,b}=retreat();w.rng=()=>0;b.state='idle';a.state='wander';a.fx.avoid=[{target:{kind:'group',id:1},S:3}];a.opinion[1]=-80;
  resolveCombat(w,.05);assert.equal(w.rockets.length,1);assert.equal(a.state,'wander');
  for(const mode of ['sleep','standdown','frozen','blackout','peace','carried','friendly','truce','dry']) {
    const x=retreat();x.w.rng=()=>0;
    if(mode==='sleep')x.a.state='mourn';
    if(mode==='standdown')x.a.fx.standdown=true;
    if(mode==='frozen')x.a.frozenUntil=20;
    if(mode==='blackout')x.w.blackoutUntil=20;
    if(mode==='peace')x.w.peaceful=true;
    if(mode==='carried')x.a.carry={by:[x.b.id]};
    if(mode==='friendly')x.b.faction=x.a.faction;
    if(mode==='truce'){x.b.state='idle';x.a.opinion[1]=-80;x.a.truceUntil[x.b.id]=20;}
    if(mode==='dry')x.a.ammo=0;
    resolveCombat(x.w,.05);assert.equal(x.w.rockets.length,0,mode);
  }
});

test('retreat shots prioritize the pursuer over a nearer hostile and never exceed five rounds',()=>{
  const {w,a,b}=retreat(),c=w.villagers.find(v=>v.faction===2);Object.assign(c,{x:910,y:550});a.opinion[2]=-90;w.rng=()=>0;
  for(let i=0;i<5;i++){a.cd=0;resolveCombat(w,.05);assert.equal(w.rockets.at(-1).tx,b.x);}
  assert.equal(a.weapon,'none');assert.equal(a.ammo,0);assert.equal(w.rockets.length,5);
  a.cd=0;resolveCombat(w,.05);assert.equal(w.rockets.length,5);
});

function lateGame() {
  const g=fresh();g.phase='command';
  g.world.villagers.forEach(v=>{if([2,3].includes(v.faction))v.alive=false;});g.eliminated[2]=g.eliminated[3]=true;
  g.hand[0]=Object.keys(CARD_DEFS);return g;
}
test('every faction card exposes and validates only living eligible groups, including neutrals when supported',()=>{
  const g=lateGame(),before=authoritativeState(g);
  for(const [id,def] of Object.entries(CARD_DEFS))if(def.needs==='group') {
    assert.deepEqual(cardTargetGroups(g,0,id),id==='spy'?[0,1]:['raid','blank'].includes(id)?[1]:[1,4],id);
    for(const group of [2,3])assert.equal(validateCard(g,0,{id,group}).ok,false,id);
    for(const group of cardTargetGroups(g,0,id))assert.equal(validateCard(g,0,{id,group}).ok,true,id);
  }
  assert.deepEqual(authoritativeState(g),before,'availability is pure');
  g.world.villagers.filter(v=>v.faction===-1).forEach(v=>v.alive=false);
  assert.deepEqual(cardTargetGroups(g,0,'forged'),[1]);assert.deepEqual(cardTargetGroups(g,0,'rally'),[]);
});

test('typed cards, ordinary orders and whispers reject empty groups without spending resources',()=>{
  const g=lateGame();
  assert.equal(parseCommand('forge a letter against the sprouts',g,0).ok,false);
  assert.equal(validateOrders([{verb:'assault',strength:1,target:{kind:'group',id:2}}],4,g.world,null,false,0).ok,false);
  g.phase='sim';g.power[0]=3;const before=authoritativeState(g);
  assert.equal(castPower(g,0,'whisper',{villagerId:g.world.villagers.find(v=>v.faction===1).id,group:2}).ok,false);
  assert.deepEqual(authoritativeState(g),before);
});

test('Forged Letter against neutrals keeps four finite notoriety entries; Spoiled Bread never heals',()=>{
  const g=fresh();applyCard(g,0,{id:'forged',group:4});
  assert.equal(g.notoriety.length,4);assert.ok(g.notoriety.every(Number.isFinite));
  const enemy=g.world.villagers.filter(v=>v.faction===1);[3,10,15,100].forEach((hp,i)=>enemy[i].hp=hp);
  applyCard(g,0,{id:'spoiled',group:1});assert.deepEqual(enemy.slice(0,4).map(v=>v.hp),[3,10,10,80]);
});

test('a card whose target disappears during dawn safely skips without poisoning the state',()=>{
  const g=lateGame();g.world.villagers.filter(v=>v.faction===1).forEach(v=>v.alive=false);
  const before=g.notoriety.slice();applyCard(g,0,{id:'forged',group:1});
  assert.deepEqual(g.notoriety,before);assert.match(g.feedback[0].at(-1),/No living|eliminated/);
});

test('loyalty and recruitment cannot resurrect eliminated factions',()=>{
  const g=lateGame(),w=g.world;w.rng=()=>0;
  const a=w.villagers.find(v=>v.faction===0);
  a.opinion[0]=-100;a.opinion[1]=60;a.opinion[2]=100;
  for(const v of w.villagers.filter(v=>v.faction===-1)){v.opinion.fill(0);v.opinion[2]=100;}
  applyLoyalty(g);
  assert.equal(a.faction,1,'defectors choose a living alternative');
  assert.equal(w.villagers.filter(v=>v.alive&&[2,3].includes(v.faction)).length,0);
  for(const v of w.villagers.filter(v=>v.faction===-1))v.opinion[1]=80;
  applyLoyalty(g);assert.ok(w.villagers.some(v=>v.alive&&v.faction===1));
  assert.equal(w.villagers.filter(v=>v.alive&&[2,3].includes(v.faction)).length,0);
});
