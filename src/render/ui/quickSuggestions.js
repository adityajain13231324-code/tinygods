import { GROUP_NAMES } from '../../config/content.js';
import { validateOrders } from '../../sim/orders.js';

export function quickSuggestions(game, seat, target, staged = []) {
 const group=id=>({kind:'group',id}),order=(verb,target=null)=>({verb,target,strength:1});
 const rivals=[0,1,2,3].filter(f=>f!==seat&&game.world.villagers.some(v=>v.alive&&v.faction===f));
 const all=target==='all',label=all?'all rivals':GROUP_NAMES[target];
 const choices=[
  ['🗡️ Arm up',[order('arm')]],['🛡️ Guard us',[order('protect',group(seat))]],
  [all?'🏃 Run from everyone':`🏃 Run from ${label}`,[order(all?'scatter':'avoid',all?null:group(target))]],
  ['🕊️ Stand down',[order('standdown')]],['🎉 Party',[order('festival',{kind:'place',id:'plaza'})]],
  [`⚔️ Attack ${label}`,all?rivals.map(f=>order('assault',group(f))):[order('assault',group(target))]],
 ];
 if(!all)choices.push([`😱 Scare ${label}`,[order('scare',group(target))]],[`💞 Love ${label}`,[order('love',group(target))]]);
 return choices.map(([label,orders])=>{
  const check=orders.length?validateOrders([...staged,...orders],game.influence[seat],game.world,game.verbsLastTurn[seat],false,seat):{ok:false,error:'No rivals remain'};
  return {label,orders,cost:orders.length,ok:check.ok,error:check.error};
 });
}
