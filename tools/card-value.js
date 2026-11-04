// Matched seeds and rotating test seats. Never manufactures a hand or re-runs bot orders.
// node tools/card-value.js [matches per policy] [comma-separated card IDs, optional]
import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';
import { createGame, updateGame, skipRecap } from '../src/sim/turn.js';
import { CARD_IDS, CARD_DEFS, validateCard } from '../src/sim/cards.js';
import { PERSONALITY_NAMES } from '../src/bots/personalities.js';
import { shuffle, mulberry32 } from '../src/sim/rng.js';
import { livingByFaction } from '../src/sim/win.js';

export function playCardTrial(match, cardId) {
  const seat=(match-1)%4;
  const types=shuffle(mulberry32(match*31),PERSONALITY_NAMES);
  const seats=Array.from({length:4},(_,i)=>({name:'Bot',kind:'bot',personality:i===seat?'opportunist':types[(i+1)%types.length]}));
  const g=createGame({seed:match,seats,cosmetics:false});
  const hands=[];
  let guard=0;
  while(g.phase!=='ended'&&guard++<200000) {
    if(g.phase==='command') {
      // createGame/beginTurn already ran identical bot decision calls in both arms.
      // Change only the chosen card. Every other automatically chosen card is removed.
      g.cardPending[seat]=null;
      const hand=g.hand[seat].slice();
      let card=null;
      if(cardId&&hand.includes(cardId)&&!g.eliminated[seat]) {
        card={id:cardId};
        const def=CARD_DEFS[cardId], living=livingByFaction(g.world);
        if(def.needs==='group') card.group=[0,1,2,3].filter(s=>s!==seat&&living[s]>0).sort((a,b)=>living[b]-living[a])[0]??(seat+1)%4;
        if(def.needs==='place') card.place=g.world.places.map(p=>({p,n:g.world.villagers.filter(v=>v.alive&&v.faction!==seat&&Math.hypot(v.x-p.x,v.y-p.y)<p.radius+60).length})).sort((a,b)=>b.n-a.n)[0].p.id;
        if(!validateCard(g,seat,card).ok)card=null;
      }
      g.cardPending[seat]=card;
      hands.push({turn:g.turn,hand,played:card?.id??null});
      updateGame(g,g.commandSeconds);
    } else if(g.phase==='recap')skipRecap(g);
    else updateGame(g,0.05);
  }
  assert.equal(g.phase,'ended','trial must finish');
  const played=g.truth.filter(t=>t.seat===seat&&t.card).map(t=>t.card.id);
  assert.ok(played.every(id=>id===cardId),'only requested card may be played');
  assert.ok(hands.every(h=>!h.played||h.hand.includes(h.played)),'every card must come from a real hand');
  return {seed:match,seat,winner:g.winner,won:g.winner===seat,turns:g.turn,played:played.length,hands};
}

if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href) {
  const n=Number(process.argv[2]??80), ids=process.argv[3]?.split(',')??CARD_IDS;
  assert.ok(Number.isInteger(n)&&n>0);assert.ok(ids.every(id=>CARD_IDS.includes(id)));
  const base=Array.from({length:n},(_,i)=>playCardTrial(i+1,null));
  const wins=rows=>rows.filter(r=>r.won).length;
  console.log(JSON.stringify({method:'paired real hands, rotating seat, no rerun of botDecide; baseline plays zero cards in test seat',matches:n,baselineWins:wins(base),baselinePlays:base.reduce((s,r)=>s+r.played,0)}));
  for(const id of ids) {
    const rows=Array.from({length:n},(_,i)=>playCardTrial(i+1,id));
    console.log(JSON.stringify({id,wins:wins(rows),deltaWins:wins(rows)-wins(base),plays:rows.reduce((s,r)=>s+r.played,0),pairedBetter:rows.filter((r,i)=>r.won&&!base[i].won).length,pairedWorse:rows.filter((r,i)=>!r.won&&base[i].won).length,rows}));
  }
}
