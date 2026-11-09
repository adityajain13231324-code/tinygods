import { el } from './dom.js';

const steps = [
 {tab:'The goal',title:'Keep your faction alive. Win the town.',image:'town',alt:'The real town with four faction counts across the top and the planning panel on the right.',text:'You are the hidden god of one faction. Give secret orders, shape relationships, and use miracles while your villagers act for themselves. Win when yours is the last faction with anyone alive.',tips:['Find your faction in the top bar. Its count tells you how many villagers remain.','Your villagers wear gold rings. Keep them alive as rivals lose members.','You guide intentions, not every footstep. Fear, friendships and danger affect what happens.'],pins:[[26,3],[44,53]],takeaway:'Your first goal: identify your faction and plan how to protect it.'},
 {tab:'Make a plan',title:'Choose an order. Give it influence.',image:'orders',alt:'Arm up staged at strength three, with one influence remaining and Submit one order at the bottom.',text:'Each dawn adds 4 influence. Use up to three orders and one free card. Start with Arm up: villagers must reach the armory and find stock before they get weapons.',tips:['Choose a quick action, pick an order from the list, or type a command.','Adjust the dots on the staged order. More influence gives that task more of the available workers.','Choose a card if you want, then press Submit. Adding an order alone does not send it.'],pins:[[80,50],[85,73],[93,95]],takeaway:'Try it: Arm up at strength 3 leaves 1 influence for another task.'},
 {tab:'Watch & adapt',title:'Watch what your villagers actually do.',image:'town',alt:'The town map showing the armory, park, houses and other destinations.',text:'After plans are submitted, the town acts. Travel takes time, rivals interfere, and villagers may react to danger. Use the peaceful first two days to prepare.',tips:['Follow your villagers to their destination. A weapon order is an errand, not an instant delivery.','Select Villagers or inspect someone to see their health, weapon and current situation.','At the next dawn, adapt your plan: protect the wounded, change a target, or prepare a safer route.'],pins:[[91,3],[62,72]],takeaway:'Good plans account for distance, supplies and danger.'},
 {tab:'Use powers',title:'Intervene at the right moment.',image:'powers',alt:'The live power panel with Miracle selected and a targeting preview over the town.',text:'From day 3, each dawn adds 3 power. Unused power carries over. Damaging area powers unlock on day 5. Each power can be used once per turn.',tips:['Choose a power in the right panel. Scroll to see the others.','Read the target rule, then aim at the map. Small selection circles can affect just one villager.','Miracle heals an ally. Freeze spares allies; Whirlpool hurts everyone. Hold and drag to direct Gust.'],pins:[[84,22],[45,53]],takeaway:'Check who will be affected before spending power.'},
 {tab:'Win & learn',title:'Survive the chaos. Learn from the story.',image:'town',alt:'Faction population counters in the game HUD, used to track who remains in the match.',text:'The last surviving faction wins. If the match reaches day 20, survivors and rival kills contribute to the deciding score, with health and a seeded tie-break resolving ties.',tips:['Check the faction counts after a fight. Chasing every rival can leave your own villagers exposed.','Use the recap and replays to understand losses and turning points.','The final Truth reveals everyone’s plans. Use what you learn in the next town.'],pins:[[48,3]],takeaway:'The loop: plan → watch → intervene → review → adapt.'},
  {tab:'Formations',title:'Arrange your people. Give them a fallback.',demo:'formation',text:'Goal: keep your villagers alive when fights and blasts start. You choose how they stand, and when they should back off. Villagers still decide for themselves in a fight.',pins:[],tips:['Spread out: blasts and rockets catch fewer of you, but nobody has backup.','Stick together: allies nearby take 10% less damage, but one blast hits many.','Protect the centre: the weakest stay in the middle and the rest ring them; the core takes 20% less.','A fallback such as "guard the armory, retreat to the park if outnumbered" replaces the guard duty only while the trouble lasts. Being attacked still comes first.'],takeaway:'Type it or build it: "spread out", or "guard the armory, retreat to the park if outnumbered".'},
  {tab:'New tricks',title:'Cards, powers and combos.',demo:'tricks',text:'Goal: surprise your rivals without breaking the rules. Each trick shows what it does on the map before and while it happens.',pins:[],tips:['Blank Rounds: the first 3 gunshots of a rival faction this turn are confetti (not rockets).','Free Cake!: about half the idle, curious villagers nearby wander over. Danger and orders win.','Leader: once per match, 3 power. One of your villagers gets double max HP, full health and Strength.','Rain then Lightning chains through wet villagers. Gust can push a planted bomb.'],takeaway:'Each power works once per turn. The Leader crown works once per match.'},
  {tab:'A living town',title:'The town fights back, and remembers.',demo:'town',text:'Goal: read the town. Cover, fire, dropped weapons, a troublemaker and personal grudges all appear on the map and in the log, so you can see why things happen.',pins:[],tips:['Cover (benches, stalls, walls, boulders) stops some bullets; blasts can destroy it.','Dry grass smoulders first (a warning), then burns, spreads, and rain puts it out.','An armed villager who dies has a 30% chance to drop the weapon for someone unarmed to grab within 20 seconds.','One neutral is a troublemaker: they steal weapons and spread rumors. Guard, recruit or hunt them.','Villagers remember who hurt, scared, robbed, betrayed or helped them. Healing and peace can bring forgiveness.'],takeaway:'Layouts and challenge modes change where and how fights happen. Pick them when you start.'},
];

function demoPanel(kind) {
  const box = el('div', 'guide-live');
  if (kind === 'formation') {
    const stage = el('div', 'gl-stage'), caption = el('p', 'sub'), row = el('div', 'gl-row');
    const dots = Array.from({ length: 12 }, () => { const d = el('span', 'gl-dot'); stage.append(d); return d; });
    const place = (style) => {
      dots.forEach((d, i) => {
        let x, y;
        if (style === 'spread') { x = 8 + (i % 4) * 28 + (i % 3) * 3; y = 10 + Math.floor(i / 4) * 34; }
        else if (style === 'together') { x = 38 + (i % 4) * 7; y = 26 + Math.floor(i / 4) * 7; }
        else if (i < 3) { x = 46 + i * 6; y = 38 + (i % 2) * 6; } else { const a = ((i - 3) / 9) * Math.PI * 2; x = 50 + Math.cos(a) * 30; y = 40 + Math.sin(a) * 26; }
        d.style.left = x + '%'; d.style.top = y + '%'; d.classList.toggle('core', style === 'centre' && i < 3);
      });
      caption.textContent = { spread: 'Spread out: a blast catches 1 or 2 of you. No one is close enough to help.', together: 'Stick together: allies nearby take 10% less damage. One blast hits many.', centre: 'Protect the centre: the three weakest (gold) are ringed by the rest and take 20% less.' }[style];
    };
    for (const [id, name] of [['spread', 'Spread out'], ['together', 'Stick together'], ['centre', 'Protect the centre']]) { const b = el('button', 'opt', name); b.onclick = () => { place(id); row.querySelectorAll('button').forEach((x) => x.classList.toggle('on', x === b)); }; row.append(b); }
    row.firstChild.classList.add('on'); place('spread');
    const cond = el('div', 'gl-cond'), slider = el('input'), say = el('p', 'sub');
    slider.type = 'range'; slider.min = '0'; slider.max = '6'; slider.value = '1'; slider.setAttribute('aria-label', 'Rivals nearby');
    const upd = () => { const n = Number(slider.value); say.textContent = n >= 4 ? `${n} rivals nearby against 3 of yours: outnumbered. The guards fall back to the Park.` : `${n} rival${n === 1 ? '' : 's'} nearby: still holding the Armory.`; say.classList.toggle('warn', n >= 4); };
    slider.oninput = upd; upd();
    const lab = el('label', '', 'Try it: "Guard the armory, retreat to the park if outnumbered". Rivals nearby: '); lab.append(slider);
    cond.append(lab, say);
    box.append(row, stage, caption, cond);
  } else if (kind === 'tricks') {
    const out = el('p', 'sub gl-out'), row = el('div', 'gl-row');
    const info = { rain: 'Rain: everyone in the circle is wet for 9 seconds. Then...', zap: 'Lightning on the wet area: chains up to 4 jumps, 9 damage each, never lethal. A chain zap cue shows on the map.', gust: 'Gust on a villager next to a planted bomb carries the bomb the same way. Its fuse keeps ticking.', cake: 'Free Cake!: a cake appears at a place. Idle, curious villagers walk over for a few seconds. Fighters, duty and fear win.', blank: 'Blank Rounds: three confetti shots, ammo spent, nobody hurt. The gunner stares at the weapon.', leader: 'Leader: one villager of yours, once per match. 200 max HP, full heal, Strength until dusk.' };
    for (const [id, name] of [['rain', 'Rain'], ['zap', '…then Lightning'], ['gust', 'Gust + bomb'], ['cake', 'Free Cake!'], ['blank', 'Blank Rounds'], ['leader', 'Leader']]) { const b = el('button', 'opt', name); b.onclick = () => { out.textContent = info[id]; row.querySelectorAll('button').forEach((x) => x.classList.toggle('on', x === b)); }; row.append(b); }
    row.firstChild.classList.add('on'); out.textContent = info.rain;
    box.append(row, out);
  } else {
    const row = el('div', 'gl-row'), out = el('p', 'sub gl-out'), stages = ['Dry grass: nothing happens until something lights it.', 'Smoulder: smoke and a warning ring for about 2 seconds. No damage yet. Time to react.', 'Burning: flames hurt anyone standing in it and can spread to a nearby patch.', 'Rain or a whirlpool puts it out. Burnt grass grows back at dusk.'];
    let i = 0; const btn = el('button', 'go', 'Light it');
    btn.onclick = () => { i = (i + 1) % stages.length; out.textContent = stages[i]; btn.textContent = i === 3 ? 'Start over' : 'Next stage'; if (i === 0) btn.textContent = 'Light it'; };
    out.textContent = stages[0]; row.append(btn);
    box.append(row, out);
  }
  return box;
}

export function createHowGuide() {
 const root=el('section','how-guide'),nav=el('div','guide-steps'),scene=el('div','guide-scene'),title=el('h3'),text=el('p'),status=el('div','sub');
 root.setAttribute('aria-label','Visual game guide');nav.setAttribute('aria-label','Guide steps');status.setAttribute('role','status');
 let index=0;const buttons=steps.map((s,i)=>{const b=el('button','opt',`${i+1}. ${s.tab}`);b.onclick=()=>paint(i);nav.append(b);return b;});
 const actions=el('div','guide-actions'),prev=el('button','go ghost','Previous'),next=el('button','go','Next');
 prev.onclick=()=>paint(index-1);next.onclick=()=>paint(index+1);actions.append(prev,status,next);
 const tips=el('ol','guide-tips'), takeaway=el('p','guide-takeaway'), full=el('a','guide-full','Open full-size screenshot ↗');full.target='_blank';full.rel='noopener';
 function paint(i){
   index=Math.max(0,Math.min(steps.length-1,i));const s=steps[index];
   full.hidden=!s.image;
   if(!s.image){scene.replaceChildren(demoPanel(s.demo));}else{
   const img=el('img');img.src=`${import.meta.env.BASE_URL}guide/${s.image}.jpg`;img.alt=s.alt;img.width=1280;img.height=800;img.decoding='async';full.href=img.src;
   scene.replaceChildren(img);s.pins.forEach(([x,y],n)=>{const pin=el('span','guide-pin',String(n+1));pin.style.left=x+'%';pin.style.top=y+'%';pin.setAttribute('aria-hidden','true');scene.append(pin);});}
   title.textContent=s.title;text.textContent=s.text;tips.replaceChildren(...s.tips.map(t=>el('li','',t)));takeaway.textContent=s.takeaway;
   demo.hidden=index!==1;status.textContent=`Step ${index+1} of ${steps.length}`;prev.disabled=index===0;next.disabled=index===steps.length-1;
   buttons.forEach((b,n)=>{b.classList.toggle('on',n===index);if(n===index)b.setAttribute('aria-current','step');else b.removeAttribute('aria-current');});
 }
 const demo=el('section','guide-demo'), label=el('label','','Try it: influence for Arm up'), slider=el('input'), workers=el('div','demo-workers'), result=el('p','sub'), run=el('button','go','Watch the plan');
 slider.type='range';slider.min='1';slider.max='3';slider.value='3';slider.setAttribute('aria-label','Arm up influence');label.append(slider);result.setAttribute('aria-live','polite');
 const preview=()=>{const arm=Number(slider.value),count=Math.round(12*arm/4);workers.classList.remove('running');workers.replaceChildren();for(let i=0;i<12;i++){const dot=el('span',i<count?'demo-arm':'demo-scare',i<count?'🗡':'👻');dot.style.setProperty('--i',String(i));workers.append(dot);}result.textContent=`Arm ${arm} + Scare ${4-arm}: ${count} villagers fetch weapons, ${12-count} scare rivals.`;};
 slider.oninput=preview;run.onclick=()=>{preview();void workers.offsetWidth;workers.classList.add('running');result.textContent+=' In this example the armory has stock and the route is clear. In a match, danger or shortages can interrupt them.';};
 demo.append(el('h3','','Try a four-influence plan'),label,workers,run,result);preview();
 root.append(nav,title,text,scene,full,tips,takeaway,demo,actions);paint(0);return root;
}
