// Assertions fail the command. Violent effects are exercised after the peaceful days.
import assert from 'node:assert/strict';
import { createGame, submitOrders, updateGame } from '../src/sim/turn.js';
import { parseCommand } from '../src/sim/parser.js';
import { validateOrders } from '../src/sim/orders.js';
const fresh = () => createGame({seed:5,cosmetics:false,seats:Array.from({length:4},()=>({name:'Test',kind:'human'}))});
const g=fresh(), mine=g.world.villagers.find(v=>v.faction===0), prey=g.world.villagers.find(v=>v.faction===1);
const cases=[['scare the tides','scare'],['make the blue ones terrified of us','scare'],['hate sprouts really hard','hate'],['arm up','arm'],['throw a party at the pond','festival'],['protect my people','protect'],['send three of my villagers to the armory','follow'],[`have ${mine.name} follow ${prey.name}`,'escort'],[`hunt ${prey.name}`,'hunt'],['everyone stand down','standdown'],['my brawlers attack the tides','assault'],['hide in the houses','follow'],['arm four villagers','arm'],['stay away from the sparks','avoid']];
for(const [text,verb] of cases){const r=parseCommand(text,g,0);assert.equal(r.ok,true,text);assert.equal(r.actions[0].order.verb,verb,text);}
for(const text of ['sing a song','asdf','destroy me']) assert.equal(parseCommand(text,g,0).ok,false,text);
for(const [text,id] of [['raid the sprouts armory','raid'],['poison the tides','spoiled'],['recruit a neutral','recruit'],['make peace treaty with the sparks','treaty']]) assert.equal(parseCommand(text,g,0).actions[0].card.id,id);
const violent=parseCommand(`hunt ${prey.name}`,g,0).actions[0].order;
assert.equal(validateOrders([violent],10,g.world,null,false,0).ok,false,'peace lock');
g.turn=g.world.turn=3;g.world.peaceful=false;g.influence.fill(10);
const combined=parseCommand('forge a letter against the sparks, scare the tides and arm up',g,0);
assert.deepEqual(combined.actions.map(a=>a.kind),['card','order','order']);
assert.equal(validateOrders(combined.actions.filter(a=>a.kind==='order').map(a=>a.order),10,g.world,null,false,0).ok,true);
// Stage a named Hunt, then verify assignment and actual damage against a nearby living target.
for(const v of g.world.villagers){v.x=50;v.y=50;v.timer=999;v.calmUntil=999;}
Object.assign(mine,{x:900,y:500,trait:null,thinkTimer:0,weapon:'bat',escalation:1,courage:100,aggression:100});Object.assign(prey,{x:925,y:500,hp:100,trait:null});
const hunt=parseCommand(`${mine.name} hunt ${prey.name}`,g,0);
assert.equal(hunt.ok,true); assert.equal(submitOrders(g,0,hunt.actions.map(a=>a.order)).ok,true);
for(let s=1;s<4;s++)assert.equal(submitOrders(g,s,[]).ok,true);
updateGame(g,0);assert.equal(g.phase,'sim');assert.equal(mine.fx.hunt,prey.id);
for(let t=0;t<100;t++)updateGame(g,0.05);
assert.ok(prey.hp<100,'Hunt must deal damage outside peace');
console.log(`PASS parser: ${cases.length} order mappings, 4 cards, 3 rejections, peace lock, compound command, named Hunt assignment and damage (${prey.hp.toFixed(1)} HP)`);
