import test from 'node:test';
import assert from 'node:assert/strict';
import {createGame,submitOrders,updateGame} from '../src/sim/turn.js';
import {castPower} from '../src/sim/powers.js';
import {validateCard} from '../src/sim/cards.js';
import {updateTension} from '../src/sim/tension.js';
import {Lockstep} from '../src/net/lockstep.js';
const fresh=day=>{const g=createGame({seed:41,seats:Array.from({length:4},()=>({name:'P',kind:'human'}))});g.turn=g.world.turn=day;g.world.peaceful=day<3;g.power.fill(9);g.hand[0]=['bomb'];return g;};
test('all damaging area effects reject before day 5 and unlock exactly on day 5',()=>{
 for(const day of [1,2,3,4,5,6]) {
  const g=fresh(day),allowed=day>=5;
  assert.equal(validateCard(g,0,{id:'bomb',place:'plaza'}).ok,allowed);
  for(let s=0;s<4;s++)submitOrders(g,s,[]);updateGame(g,0);
  const host=new Lockstep({game:g,role:'host',mySeat:0});
  for(const id of ['fireball','lightning','earthquake']) {
   const before=g.power[0],events=g.world.events.length;
   assert.equal(castPower(g,0,id,{x:900,y:500}).ok,allowed);
   if(!allowed){assert.equal(g.power[0],before);assert.equal(g.world.events.length,events);assert.equal(host.cast(id,{x:900,y:500}).ok,false);}
  }
  assert.equal(castPower(g,1,'fog',{x:900,y:500}).ok,day>=3);
 }
});
test('early tension response is lower and day 4 retains the normal curve',()=>{
 for(const day of [3,4]) {
  const g=fresh(day),w=g.world;
  w.tension=w.drama=w.baseTension=0;
  for(const v of w.villagers){v.state='idle';v.brewId=-1;}
  w.villagers[0].state='attack';
  updateTension(w,1);
  assert.equal(w.tension,day===3?3.75:5);
 }
});
