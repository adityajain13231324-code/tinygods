import test from 'node:test';
import assert from 'node:assert/strict';
import { playCardTrial } from './card-value.js';
import { createGame, submitOrders, updateGame } from '../src/sim/turn.js';
import { villagerInfo } from '../src/render/ui/villagerInfo.js';

test('card baseline plays no cards; treatment uses only held cards and rotates seats',()=>{
  for(let seed=1;seed<=4;seed++) {
    const a=playCardTrial(seed,null),b=playCardTrial(seed,'rally');
    assert.equal(a.played,0);assert.equal(a.seat,seed-1);
    assert.ok(b.hands.every(h=>h.played===null||h.hand.includes('rally')));
    assert.deepEqual(a.hands[0].hand,b.hands[0].hand);
  }
});

test('public villager information never reveals an unseen temperament',()=>{
  const g=createGame({seed:41,seats:Array.from({length:4},()=>({name:'P',kind:'human'}))});
  const v=g.world.villagers[0];v.trait='brawler';v.revealed=false;
  assert.match(villagerInfo(g,v).lines.join(' '),/not seen yet/);
  assert.doesNotMatch(villagerInfo(g,v).lines.join(' '),/Hothead/);
  v.revealed=true;assert.match(villagerInfo(g,v).lines.join(' '),/Hothead/);
});

test('Stand Down stops an active voluntary chase and still permits immediate self-defence',()=>{
  function scenario(near) {
    const g=createGame({seed:41,seats:Array.from({length:4},()=>({name:'P',kind:'human'}))});
    g.world.peaceful=false;g.turn=g.world.turn=3;
    for(let s=0;s<4;s++)submitOrders(g,s,s===0?[{verb:'standdown',strength:1}]:[]);
    updateGame(g,0);
    for(const v of g.world.villagers){v.x=50;v.y=50;v.thinkTimer=999;}
    const a=g.world.villagers.find(v=>v.faction===0),b=g.world.villagers.find(v=>v.faction===1);
    Object.assign(a,{x:900,y:500,state:'attack',targetId:b.id,panic:0,thinkTimer:0,trait:null,partnerId:-1,hp:100,courage:100});
    Object.assign(b,{x:near?925:1150,y:500,state:near?'attack':'idle',targetId:near?a.id:null,hp:100});
    updateGame(g,0.05);return a.state;
  }
  assert.notEqual(scenario(false),'attack');assert.equal(scenario(true),'attack');
});
