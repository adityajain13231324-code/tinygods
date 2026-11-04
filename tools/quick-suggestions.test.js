import test from 'node:test';
import assert from 'node:assert/strict';
import {createGame} from '../src/sim/turn.js';
import {quickSuggestions} from '../src/render/ui/quickSuggestions.js';
import {validateOrders} from '../src/sim/orders.js';
const fresh=()=>createGame({seed:41,seats:Array.from({length:4},()=>({name:'P',kind:'human'}))});
test('quick suggestions respect peace, budget and three-order cap',()=>{
 const g=fresh();
 assert.equal(quickSuggestions(g,0,'all').find(s=>s.label.includes('Attack')).ok,false);
 assert.equal(quickSuggestions(g,0,'all').find(s=>s.label.includes('Run')).orders[0].verb,'scatter');
 g.turn=g.world.turn=3;g.world.peaceful=false;g.influence[0]=3;
 const all=quickSuggestions(g,0,'all').find(s=>s.label.includes('Attack'));
 assert.equal(all.orders.length,3);assert.equal(all.cost,3);assert.equal(all.ok,true);
 assert.ok(all.orders.every(o=>o.target.id!==0&&o.strength===1));
 assert.equal(quickSuggestions(g,0,'all',[{verb:'arm',strength:1}]).find(s=>s.label.includes('Attack')).ok,false);
 g.influence[0]=2;assert.equal(quickSuggestions(g,0,'all').find(s=>s.label.includes('Attack')).ok,false);
 for(const target of [1,2,3,4])for(const suggestion of quickSuggestions(g,0,target))if(suggestion.ok)assert.equal(validateOrders(suggestion.orders,2,g.world,null,false,0).ok,true);
});
test('all-rivals suggestions omit eliminated factions and do not mutate staged orders',()=>{
 const g=fresh();g.turn=g.world.turn=3;g.world.peaceful=false;
 for(const v of g.world.villagers)if(v.faction===2)v.alive=false;
 const staged=[];const result=quickSuggestions(g,0,'all',staged).find(s=>s.label.includes('Attack'));
 assert.deepEqual(result.orders.map(o=>o.target.id),[1,3]);assert.deepEqual(staged,[]);
});
