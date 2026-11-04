import { el } from './dom.js';

/**
 * A one-line "say what you want" box. `handle(text)` returns {ok, message?, suggestions?}.
 * When the game cannot make sense of the text it shows what it understood and clickable
 * phrases to try, so typing again is one click away.
 */
export function createTypeBox({ placeholder, handle }) {
  const root = el('div', 'typebox');
  const form = el('div', 'typeform');
  const mark = el('span', 'typemark', '✎');
  const input = el('input');
  input.type = 'text';
  input.placeholder = placeholder;
  input.maxLength = 120;
  input.autocomplete = 'off';
  input.spellcheck = false;
  const send = el('button', 'go', 'Do it ⏎');
  const msg = el('div', 'typemsg');
  const chips = el('div', 'typechips');
  form.append(mark, input, send);
  root.append(form, msg, chips);

  const say = (text, bad = false) => {
    msg.textContent = text ?? '';
    msg.classList.toggle('bad', bad);
  };
  const run = () => {
    const text = input.value.trim();
    if (!text) return;
    const r = handle(text);
    chips.replaceChildren();
    if (r.clear) input.value = '';
    if (r.ok) {
      input.value = '';
      say(r.message ?? 'Done.');
    } else {
      say(r.message, true);
      for (const s of r.suggestions ?? []) {
        const b = el('button', 'opt', s);
        b.onclick = () => {
          input.value = s;
          input.focus();
        };
        chips.append(b);
      }
      input.focus();
      input.select();
    }
  };
  send.onclick = run;
  input.addEventListener('keydown', (e) => {
    e.stopPropagation(); // typing must not trigger the camera's + - 0 keys
    if (e.key === 'Enter') run();
  });
  return { root, say, focus: () => input.focus(), pending: () => input.value.trim() };
}
