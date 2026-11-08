import { el } from './dom.js';

const person=(x,y,c)=>`<circle cx="${x}" cy="${y}" r="19" fill="${c}" stroke="#fff4d0" stroke-width="3"/><circle cx="${x-6}" cy="${y-3}" r="2"/><circle cx="${x+6}" cy="${y-3}" r="2"/><path d="M${x-6} ${y+6}q6 6 12 0" fill="none" stroke="#203024" stroke-width="2"/>`;
const colors=['#ed6451','#55a1eb','#62bf70','#f2ca54'];
const steps=[
 {title:'You lead one faction',text:'Start with 12 villagers. Three other factions and 12 neutrals share the town. Your villagers wear a gold ring. Villagers have their own moods, so you guide them rather than move them directly.',art:colors.map((c,i)=>person(70+i*115,75,c)).join('')+'<ellipse cx="70" cy="105" rx="28" ry="7" fill="none" stroke="#ffd36b" stroke-width="4"/><text x="250" y="147">YOUR FACTION + RIVALS + NEUTRALS</text>'},
 {title:'Prepare your secret plan',text:'Each dawn gives 4 influence. Split it between up to three orders, then choose one free card. More influence assigns more workers. Try the plan below; stock, travel and danger affect real results.',art:'<rect x="35" y="27" width="280" height="105" rx="12" fill="#34442e" stroke="#ffd36b"/><text x="175" y="60">Arm 9 + Scare 3</text><text x="175" y="91">Strength 3 + 1 · Cost 4 influence</text><rect x="350" y="35" width="105" height="90" rx="10" fill="#60552a" stroke="#ffd36b"/><text x="402" y="76">1 FREE</text><text x="402" y="101">CARD</text><text x="250" y="157">ORDERS STAY SECRET UNTIL THE REVEAL</text>'},
 {title:'Watch the town react',text:'Days 1–2 are peaceful. Power arrives from day 3; damaging area powers unlock on day 5. Select a power and aim at the town. Check its preview: Whirlpool hurts allies, while Freeze protects them. Unused power carries over.',art:person(110,82,colors[0])+person(385,82,colors[1])+'<path d="M155 82h175" stroke="#ffd36b" stroke-width="3" stroke-dasharray="8 7"/><text x="250" y="49">GROWING TENSION</text><text x="250" y="135">DAY 1–2: PEACE  →  DAY 3: FRICTION</text><text x="250" y="159">DAY 5: DAMAGING AREA ATTACKS</text>'},
 {title:'Review the news. Win the town.',text:'Recaps explain losses and events. Replays let you revisit key moments. The last faction standing wins a victory celebration. A day-20 safety limit can decide a stalemate by score. The final Truth reveals every plan; inferred causes are labeled uncertain.',art:'<path d="M190 63l15 17 22-37 23 37 23-37 22 37 15-17-13 47H203z" fill="#ffd36b"/><text x="250" y="140">LAST FACTION STANDING WINS</text><text x="250" y="163">RECAP  ·  REPLAY  ·  THE TRUTH</text>'},
];

export function createHowGuide() {
 const root=el('section','how-guide'),nav=el('div','guide-steps'),scene=el('div','guide-scene'),title=el('h3'),text=el('p'),status=el('div','sub');
 root.setAttribute('aria-label','Visual game guide');nav.setAttribute('aria-label','Guide steps');status.setAttribute('role','status');
 let index=0;const buttons=steps.map((s,i)=>{const b=el('button','opt',`${i+1}. ${['Your faction','Secret plan','Town reacts','Victory'][i]}`);b.onclick=()=>paint(i);nav.append(b);return b;});
 const actions=el('div','guide-actions'),prev=el('button','go ghost','Previous'),next=el('button','go','Next');
 prev.onclick=()=>paint(index-1);next.onclick=()=>paint(index+1);actions.append(prev,status,next);
 function paint(i){index=Math.max(0,Math.min(steps.length-1,i));const s=steps[index];scene.innerHTML=`<svg viewBox="0 0 500 185" aria-hidden="true" focusable="false">${s.art}</svg>`;title.textContent=s.title;text.textContent=s.text;status.textContent=`Step ${index+1} of ${steps.length}`;prev.disabled=index===0;next.disabled=index===steps.length-1;buttons.forEach((b,n)=>{b.classList.toggle('on',n===index);if(n===index)b.setAttribute('aria-current','step');else b.removeAttribute('aria-current');});}
 const demo=el('section','guide-demo'), label=el('label','','Try it: influence for Arm up'), slider=el('input'), workers=el('div','demo-workers'), result=el('p','sub'), run=el('button','go','Watch the plan');
 slider.type='range';slider.min='1';slider.max='3';slider.value='3';slider.setAttribute('aria-label','Arm up influence');label.append(slider);result.setAttribute('aria-live','polite');
 const preview=()=>{const arm=Number(slider.value),count=Math.round(12*arm/4);workers.classList.remove('running');workers.replaceChildren();for(let i=0;i<12;i++){const dot=el('span',i<count?'demo-arm':'demo-scare',i<count?'🗡':'👻');dot.style.setProperty('--i',String(i));workers.append(dot);}result.textContent=`Arm ${arm} + Scare ${4-arm}: ${count} villagers fetch weapons, ${12-count} scare rivals.`;};
 slider.oninput=preview;run.onclick=()=>{preview();void workers.offsetWidth;workers.classList.add('running');result.textContent+=' In this example the armory has stock and the route is clear. In a match, danger or shortages can interrupt them.';};
 demo.append(el('h3','','Try a four-influence plan'),label,workers,run,result);preview();
 root.append(nav,scene,title,text,demo,actions);paint(0);return root;
}
