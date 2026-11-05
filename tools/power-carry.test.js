import test from 'node:test';
import assert from 'node:assert/strict';
import { createGame, submitOrders, updateGame, skipRecap } from '../src/sim/turn.js';
import { castPower } from '../src/sim/powers.js';

const fresh = () => createGame({seed:717,simSeconds:0.05,cosmetics:false,seats:Array.from({length:4},()=>({name:'Player',kind:'human'}))});
function start(g, card = null) {
  for(let seat=0;seat<4;seat++) assert.equal(submitOrders(g,seat,[],seat===0?card:null).ok,true);
  updateGame(g,0);
  assert.equal(g.phase,'sim');
}
function finish(g) {
  updateGame(g,.1);
  assert.equal(g.phase,'recap');
  skipRecap(g);
  assert.equal(g.phase,'command');
}
function next(g) { start(g); finish(g); }
function dayThree() { const g=fresh();next(g);next(g);return g; }

test('power starts on day three and all unused points add to the next dawn income',()=>{
  const g=fresh();assert.deepEqual(g.power,[0,0,0,0]);
  next(g);assert.deepEqual(g.power,[0,0,0,0]);
  next(g);assert.deepEqual(g.power,[3,3,3,3]);
  next(g);assert.deepEqual(g.power,[6,6,6,6]);
  next(g);assert.deepEqual(g.power,[9,9,9,9]);
});

test('spending deducts from the bank, and each power remains once per turn but refreshes next turn',()=>{
  const g=dayThree();start(g);
  assert.equal(castPower(g,0,'rain',{x:900,y:550}).ok,true);
  assert.equal(g.power[0],2);
  assert.equal(castPower(g,0,'rain',{x:900,y:550}).ok,false);
  assert.equal(g.power[0],2);
  finish(g);assert.equal(g.power[0],5);assert.deepEqual(g.usedPowers[0],[]);
  start(g);assert.equal(castPower(g,0,'rain',{x:900,y:550}).ok,true);
  assert.equal(g.power[0],4);finish(g);assert.equal(g.power[0],7);
});

test('Spy bonus carries with the balance and saving does not bypass damage unlock days',()=>{
  const g=dayThree();g.hand[0]=['spy'];start(g,{id:'spy',group:1});
  assert.equal(g.power[0],4);finish(g);assert.equal(g.power[0],7);
  start(g);assert.equal(castPower(g,0,'lightning',{x:900,y:550}).ok,false);
  assert.equal(g.power[0],7);finish(g);assert.equal(g.power[0],10);
  start(g);assert.equal(castPower(g,0,'lightning',{x:900,y:550}).ok,true);
  assert.equal(g.power[0],9);finish(g);assert.equal(g.power[0],12);
});

test('eliminated factions lose their bank and receive no income; new matches start fresh',()=>{
  const g=dayThree();g.power[2]=20;g.eliminated[2]=true;
  g.world.villagers.filter(v=>v.faction===2).forEach(v=>v.alive=false);
  next(g);assert.equal(g.power[2],0);assert.equal(g.power[0],6);
  next(g);assert.equal(g.power[2],0);assert.equal(g.power[0],9);
  assert.deepEqual(fresh().power,[0,0,0,0]);
});
