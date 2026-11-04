import { el } from './dom.js';

// Narrow screens keep the town visible. Desktop retains the existing side dock.
export function finishSheet(panel, label, footer) {
  const body = el('div', 'sheet-body');
  body.id = `${panel.id}-body`;
  body.append(...panel.childNodes);
  const toggle = el('button', 'sheet-toggle', `${panel.classList.contains('expanded') ? 'View town ▾' : 'Open ▴'} · ${label}`);
  toggle.setAttribute('aria-controls', body.id);
  const paint = () => {
    const open = panel.classList.contains('expanded');
    toggle.setAttribute('aria-expanded', String(open));
    toggle.textContent = `${open ? 'View town ▾' : 'Open ▴'} · ${label}`;
  };
  toggle.onclick = () => { panel.classList.toggle('expanded'); paint(); };
  paint();
  panel.replaceChildren(toggle, body, footer);
}
