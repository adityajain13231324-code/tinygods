import test from 'node:test';
import assert from 'node:assert/strict';
import {createGame,submitOrders,updateGame,skipRecap} from '../src/sim/turn.js';
import {applyOrders,comebackBonus} from '../src/sim/orders.js';
import {planWorkOrders} from '../src/sim/workPlan.js';
import {previewOrder} from '../src/sim/orderPreview.js';
import {authoritativeState} from '../src/sim/state.js';
import {stepWorld} from '../src/sim/brain.js';
import {quickSuggestions} from '../src/render/ui/quickSuggestions.js';
import {INFLUENCE} from '../src/config/tunables.js';
import {mulberry32} from '../src/sim/rng.js';
const fresh=(seed=41)=>createGame({seed,seats:Array.from({length:4},()=>({name:'P',kind:'human'})),cosmetics:false});
const arm=strength=>({verb:'arm',target:null,strength});
const scare=strength=>({verb:'scare',target:{kind:'group',id:2},strength});

test('quick actions default to three, fit the remaining points and offer day-one Accuse',()=>{
 const g=fresh();assert.equal(g.influence[0],4);
 for(const points of [4,3,2,1]){
  g.influence[0]=points;
  for(const s of quickSuggestions(g,0,2).filter(s=>!s.label.includes('Attack'))) {
   assert.equal(s.ok,true,s.label);assert.equal(s.orders[0].strength,Math.min(3,points));assert.equal(s.cost,Math.min(3,points));
  }
 }
 g.influence[0]=4;
 assert.equal(quickSuggestions(g,0,2).find(s=>s.label.includes('Accuse')).ok,true);
 assert.equal(quickSuggestions(g,0,2).find(s=>s.label.includes('Attack')).ok,false);
 assert.equal(quickSuggestions(g,0,2,[arm(3)]).find(s=>s.label.includes('Scare')).orders[0].strength,1);
 assert.equal(quickSuggestions(g,0,2,[arm(3),scare(1)]).find(s=>s.label.includes('Love')).ok,false);
});

test('four-point dawn income preserves carryover and the existing comeback bonus',()=>{
 const g=fresh();assert.equal(INFLUENCE.carryCap,3);assert.equal(comebackBonus([1,12,12,12],0),2);
 for(let seat=0;seat<4;seat++)assert.equal(submitOrders(g,seat,seat===0?[arm(3)]:[]).ok,true);
 updateGame(g,0);assert.equal(g.influence[0],1);
 for(let n=0;n<2000&&g.phase==='sim';n++)updateGame(g,.05);
 assert.equal(g.phase,'recap');skipRecap(g);
 assert.equal(g.influence[0],5);assert.equal(g.influence[1],7);
});

test('Arm 3 plus Scare 1 creates a disjoint 9:3 split and selects unarmed workers first',()=>{
 for(let seed=1;seed<=32;seed++){
  const g=fresh(seed),mine=g.world.villagers.filter(v=>v.faction===0);
  for(const v of mine.slice(0,3))v.weapon='bat';
  const orders=[scare(1),arm(3)],before=authoritativeState(g),plan=planWorkOrders(g.world,0,orders);
  assert.equal(plan.get(0).length,3);assert.equal(plan.get(1).length,9);
  assert.ok(plan.get(1).every(id=>g.world.villagers[id].weapon==='none'));
  assert.ok(plan.get(0).every(id=>g.world.villagers[id].weapon==='bat'));
  assert.deepEqual(authoritativeState(g),before,'planning must not change state or RNG');
  const reversed=planWorkOrders(g.world,0,orders.slice().reverse());
  assert.deepEqual(reversed.get(0),plan.get(1));assert.deepEqual(reversed.get(1),plan.get(0));
  applyOrders(g.world,0,orders);
  assert.equal(mine.filter(v=>v.fx.arm).length,9);assert.equal(mine.filter(v=>v.fx.scare.length).length,3);
  assert.ok(mine.every(v=>!(v.fx.arm&&v.fx.scare.length)));
 }
});

test('strength edits rebalance squads, and previews agree with the full staged plan',()=>{
 const g=fresh(),orders=[arm(1),scare(3)],plan=planWorkOrders(g.world,0,orders);
 assert.equal(plan.get(0).length,3);assert.equal(plan.get(1).length,9);
 for(let i=0;i<2;i++)assert.deepEqual(previewOrder(g.world,0,orders[i],orders).actors,plan.get(i));
 orders[0].strength=3;orders[1].strength=1;
 const changed=planWorkOrders(g.world,0,orders);assert.equal(changed.get(0).length,9);assert.equal(changed.get(1).length,3);
});

test('named/count restrictions, empty eligibility, deaths and minimum seizure teams remain valid',()=>{
 const g=fresh(),mine=g.world.villagers.filter(v=>v.faction===0),prey=g.world.villagers.find(v=>v.faction===1);
 const a={...arm(3),subject:{kind:'villagers',ids:mine.slice(0,2).map(v=>v.id)}};
 const plan=planWorkOrders(g.world,0,[a,scare(1)]);assert.equal(plan.get(0).length,2);assert.equal(plan.get(1).length,10);
 const count={...arm(3),subject:{kind:'count',n:2}};assert.equal(planWorkOrders(g.world,0,[count,scare(1)]).get(0).length,2);
 for(const v of mine)v.weapon='bat';assert.deepEqual(planWorkOrders(g.world,0,[arm(3)]).get(0),[]);
 mine[0].weapon='gun';mine[0].ammo=0;assert.deepEqual(planWorkOrders(g.world,0,[arm(3)]).get(0),[mine[0].id]);
 for(const v of mine.slice(4))v.alive=false;
 const seize={verb:'seize',target:{kind:'villager',id:prey.id},strength:1};
 const small=planWorkOrders(g.world,0,[{verb:'follow',target:{kind:'place',id:'park'},strength:3},seize]);
 assert.equal(small.get(1).length,2);assert.ok([...small.values()].flat().every(id=>g.world.villagers[id].alive));
});

test('an armory runner does not abandon the errand to a voluntary grudge, but reacts to danger',()=>{
 const g=fresh(),v=g.world.villagers[0],enemy=g.world.villagers.find(o=>o.faction===1);
 g.world.peaceful=false;
 for(const o of g.world.villagers){o.trait=null;o.partnerId=-1;o.calmUntil=9999;o.timer=999;}
 applyOrders(g.world,0,[{...arm(3),subject:{kind:'villagers',ids:[v.id]}}]);
 v.grievance[enemy.id]=v.tolerance*20;v.calmUntil=0;v.aggression=100;v.courage=100;
 enemy.x=v.x+50;enemy.y=v.y;v.thinkTimer=0;
 stepWorld(g.world,1/30);assert.equal(v.purpose,'arm');assert.equal(v.state,'wander');
 let reason;g.world.traceDecision=e=>{if(e.id===v.id)reason=e.reason;};
 enemy.state='attack';enemy.targetId=v.id;enemy.x=v.x+10;enemy.y=v.y;v.thinkTimer=0;
 stepWorld(g.world,1/30);assert.equal(reason,'danger');
});

test('direct intimidation adds faction resentment gradually, proportionally and only to its victim',()=>{
 const delta=strength=>{
  const g=fresh(),v=g.world.villagers[0],prey=g.world.villagers.find(o=>o.faction===2),friend=g.world.villagers.find(o=>o.faction===2&&o!==prey);
  for(const o of g.world.villagers){o.alive=[v,prey,friend].includes(o);o.trait=null;o.partnerId=-1;o.timer=999;o.calmUntil=9999;o.opinion.fill(0);o.grievance.fill(0);}
  v.x=800;v.y=500;prey.x=850;prey.y=500;friend.x=1600;friend.y=900;
  g.world.rng=()=>.99;applyOrders(g.world,0,[scare(strength)]);v.thinkTimer=0;
  stepWorld(g.world,1/30);
  assert.equal(friend.opinion[0],0);assert.equal(prey.opinion[1],0);assert.ok(prey.fear[0]>0);assert.ok(prey.grievance[v.id]>0);
  const lost=-prey.opinion[0];prey.opinion[0]=-99.9;v.thinkTimer=0;stepWorld(g.world,1/30);assert.equal(prey.opinion[0],-100);
  return lost;
 };
 const weak=delta(1),strong=delta(3);assert.ok(weak>0&&weak<2);assert.equal(strong,weak*3);
});

test('300 mixed squad plans preserve ownership, caps, subjects and exact application without overlap',()=>{
 const rng=mulberry32(5505);
 for(let n=0;n<300;n++){
  const g=fresh(8000+n),mine=g.world.villagers.filter(v=>v.faction===0);
  for(const v of mine){v.alive=rng()>.15;if(rng()<.3)v.weapon='bat';}
  const orders=[arm(1+Math.floor(rng()*3)),scare(1+Math.floor(rng()*3)),{verb:'follow',target:{kind:'place',id:'park'},strength:1+Math.floor(rng()*3)}];
  for(const o of orders){const roll=rng();if(roll<.3)o.subject={kind:'count',n:1+Math.floor(rng()*12)};else if(roll<.6)o.subject={kind:'villagers',ids:mine.filter(()=>rng()<.5).map(v=>v.id)};if(o.subject?.ids?.length===0)delete o.subject;}
  const before=authoritativeState(g),plan=planWorkOrders(g.world,0,orders),flat=[...plan.values()].flat();
  assert.equal(new Set(flat).size,flat.length);assert.ok(flat.every(id=>g.world.villagers[id].alive&&g.world.villagers[id].faction===0));
  for(let i=0;i<3;i++){
   const ids=plan.get(i),o=orders[i];assert.ok(i!==0||ids.length<=o.strength*3);
   if(o.subject?.kind==='count')assert.ok(ids.length<=o.subject.n);
   if(o.subject?.kind==='villagers')assert.ok(ids.every(id=>o.subject.ids.includes(id)));
   assert.deepEqual(previewOrder(g.world,0,o,orders).actors,ids);
  }
  assert.deepEqual(authoritativeState(g),before);
  applyOrders(g.world,0,orders);
  assert.deepEqual(mine.filter(v=>v.alive&&v.fx.arm).map(v=>v.id),plan.get(0));
  assert.deepEqual(mine.filter(v=>v.alive&&v.fx.scare.length).map(v=>v.id),plan.get(1));
  assert.deepEqual(mine.filter(v=>v.alive&&v.fx.follow==='park').map(v=>v.id),plan.get(2));
 }
});

test('a persuaded neutral scarer creates resentment toward neutrals without exposing the issuing faction',()=>{
 const g=fresh(),scarer=g.world.villagers.find(v=>v.faction===-1),victim=g.world.villagers.find(v=>v.faction===2);
 for(const v of g.world.villagers){v.alive=v===scarer||v===victim;v.trait=null;v.partnerId=-1;v.timer=999;v.calmUntil=9999;v.opinion.fill(0);v.grievance.fill(0);}
 scarer.x=800;scarer.y=500;victim.x=850;victim.y=500;scarer.trust[0]=1;
 g.world.rng=()=>.99;applyOrders(g.world,0,[scare(1)]);scarer.thinkTimer=0;stepWorld(g.world,1/30);
 assert.ok(victim.opinion[4]<0);assert.equal(victim.opinion[0],0);assert.ok(victim.fear[4]>0);
});
