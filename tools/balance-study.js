// Matched town seeds with all four seat rotations. Experimental policies are opt-in.
import {Worker,isMainThread,parentPort,workerData} from 'node:worker_threads';
import {createGame,runToEnd} from '../src/sim/turn.js';
import {mulberry32,shuffle} from '../src/sim/rng.js';
import {PERSONALITIES,PERSONALITY_NAMES} from '../src/bots/personalities.js';

if(!isMainThread) {
  if(workerData.candidate) {
    const pacifist=PERSONALITIES.pacifist,gossip=PERSONALITIES.gossip;
    PERSONALITIES.pacifist=(i,rng)=>i.anyKills&&!i.lostSomeone
      ? [{verb:'arm',target:null,strength:1},{verb:'protect',target:{kind:'group',id:i.seat},strength:Math.min(3,i.influence-1)}].filter(o=>o.strength>0)
      : pacifist(i,rng);
    PERSONALITIES.gossip=(i,rng)=>i.anyKills&&i.lastVerbs.has('arm')&&i.influence>=4
      ? [{verb:'protect',target:{kind:'group',id:i.seat},strength:2},gossip(i,rng).find(o=>o.verb==='accuse')].filter(Boolean)
      : gossip(i,rng);
  }
  const rows=[];
  for(const seed of workerData.seeds) {
    const types=shuffle(mulberry32(seed*7919),PERSONALITY_NAMES).slice(0,4);
    for(let rotation=0;rotation<4;rotation++) {
      const policies=types.map((_,i)=>types[(i+rotation)%4]);
      const g=runToEnd(createGame({seed,seats:policies.map(personality=>({name:'Bot',kind:'bot',personality})),cosmetics:false}));
      rows.push({seed,rotation,policies,winner:g.winner,turns:g.turn,reason:g.winReason,deaths:g.stats.deathsPerTurn.reduce((a,b)=>a+b,0)});
    }
  }
  parentPort.postMessage(rows);
} else {
  const n=Number(process.argv[2]??80),candidate=process.argv.includes('--candidate');
  const seeds=Array.from({length:n},(_,i)=>i<n/2?510000+i:620000+i-Math.floor(n/2));
  const rows=(await Promise.all([0,1].map(slot=>new Promise((resolve,reject)=>{
    const worker=new Worker(new URL(import.meta.url),{workerData:{candidate,seeds:seeds.filter((_,i)=>i%2===slot)}});
    worker.on('message',resolve);worker.on('error',reject);
  })))).flat();
  const byPolicy=PERSONALITY_NAMES.map(policy=>{let appearances=0,wins=0;for(const r of rows)r.policies.forEach((p,s)=>{if(p===policy){appearances++;if(r.winner===s)wins++;}});return {policy,wins,appearances,rate:wins/appearances};});
  console.log(JSON.stringify({candidate,matches:rows.length,byPolicy,bySeat:[0,1,2,3].map(s=>rows.filter(r=>r.winner===s).length),meanTurns:rows.reduce((n,r)=>n+r.turns,0)/rows.length,note:'Shared seeds and rotations are correlated. Descriptive bot results, not proof of human balance.',rows},null,2));
}
