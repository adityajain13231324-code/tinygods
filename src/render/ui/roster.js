import { el } from './dom.js';
import { activateDialog } from './dialog.js';
import { villagerInfo } from './villagerInfo.js';

export function showRoster(game, ctx) {
  const overlay = el('div', 'overlay menu2-overlay');
  overlay.style.pointerEvents = 'auto';
  const card = el('div', 'panel card');
  const close = el('button', 'go ghost', 'Back');
  close.onclick = () => overlay.remove();
  const select = el('select', 'vsel');
  select.setAttribute('aria-label', 'Inspect a villager');
  for (const v of game.world.villagers) select.append(new Option(villagerInfo(game,v).title, String(v.id)));
  const detail = el('div', 'roster-detail');
  const draw = () => {
    const info = villagerInfo(game, game.world.villagers[Number(select.value)]);
    detail.replaceChildren(el('h3', '', info.title), ...info.lines.map(line => el('p','',line)));
  };
  select.onchange = draw;
  card.append(close, el('h2', '', 'Villagers'), el('p','sub',ctx.online ? 'The shared town keeps acting while you inspect. Only public information appears here.' : 'Public town information. Your match is paused while this list is open.'), select, detail);
  draw(); overlay.append(card); document.body.append(overlay);
  const paused = ctx.paused;
  if (!ctx.online) ctx.paused = true;
  activateDialog(overlay,card);
  const remove = overlay.remove.bind(overlay);
  overlay.remove = () => { clearInterval(refresh); if (!ctx.online) ctx.paused = paused; remove(); };
  const refresh = setInterval(draw, 500);
}
