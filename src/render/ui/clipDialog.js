import { el } from './dom.js';
import { activateDialog } from './dialog.js';

const mb = (b) => (b / 1e6).toFixed(1) + ' MB';

/**
 * Ask, record, preview and save a highlight clip. Nothing leaves the device: the player gets a blob
 * to download, and has to press the button to do even that.
 */
export function openClipDialog(root, ctx, clip, title = 'Save a clip') {
  const tool = ctx.clip;
  const overlay = el('div', 'overlay clip-overlay');
  overlay.style.pointerEvents = 'auto';
  overlay.style.position = 'fixed';
  const card = el('div', 'panel card clip-card');
  overlay.append(card);
  document.body.append(overlay); // a body-level dialog, like the others (the dialog helper makes everything else inert)
  activateDialog(overlay, card);
  const close = () => { if (url) URL.revokeObjectURL(url); overlay.remove(); };
  let url = null;
  card.append(el('h2', '', title));
  if (!tool) { card.append(el('p', 'sub', 'Clips are not available right now.')); const b = el('button', 'go', 'Close'); b.onclick = close; card.append(b); return; }
  const text = tool.describe(clip);
  card.append(el('p', 'sub', 'This replays the real moment and records it with a caption and the creator tag. The clip stays on your device unless you share it yourself.'));
  const name = el('input', 'lobby-input');
  name.value = text.caption;
  name.maxLength = 110;
  name.setAttribute('aria-label', 'Clip caption');
  card.append(el('div', 'lobby-label', 'Caption (written from what happened, you can edit it)'), name);
  const status = el('p', 'sub');
  status.setAttribute('role', 'status');
  const support = tool.support;
  card.append(el('p', 'sub', support.canRecord ? `Format: ${support.mime.split(';')[0]}, up to 8 seconds and about 6 MB.` : support.stillOnly ? 'This browser cannot record video, so you will get a still picture (PNG) of the moment instead.' : 'This browser cannot save clips. You can still watch the replay from the list.'));
  const go = el('button', 'go', support.canRecord ? 'Record the clip' : 'Save a still picture');
  go.disabled = !support.canRecord && !support.stillOnly;
  const cancel = el('button', 'go ghost', 'Cancel');
  cancel.onclick = close;
  const btns = el('div', 'btns');
  btns.append(go, cancel);
  card.append(status, btns);
  go.onclick = async () => {
    go.disabled = true;
    cancel.disabled = true;
    status.textContent = 'Recording… (the replay plays once)';
    overlay.classList.add('recording');
    const res = await tool.record(clip, { ...text, caption: name.value.trim() || text.caption });
    overlay.classList.remove('recording');
    cancel.disabled = false;
    if (res.error) { status.textContent = res.error; go.disabled = false; return; }
    url = res.url;
    card.replaceChildren(el('h2', '', res.fallback === 'none' ? 'Could not capture' : 'Your clip'));
    if (res.fallback === 'none') { card.append(el('p', 'sub', 'The browser did not allow a picture or a video of the game. Try a different browser.')); }
    else {
      const preview = res.fallback ? el('img') : el('video');
      preview.src = res.url;
      preview.className = 'clip-preview';
      if (!res.fallback) { preview.controls = true; preview.muted = true; preview.loop = true; preview.playsInline = true; preview.autoplay = true; }
      else preview.alt = 'Still picture of the moment';
      card.append(preview, el('p', 'sub', `${res.fallback ? 'Still picture' : 'Video'} · ${mb(res.bytes)}${res.seconds ? ' · ' + res.seconds.toFixed(1) + ' s' : ''}. Nothing was uploaded.`));
      const save = el('a', 'go', res.fallback ? 'Save the picture' : 'Save the clip');
      save.href = res.url;
      save.download = `tiny-gods-${text.kind}.${res.fallback ? 'png' : res.mime.includes('mp4') ? 'mp4' : 'webm'}`;
      card.append(save);
    }
    const done = el('button', 'go ghost', 'Close');
    done.onclick = close;
    card.append(done);
  };
}
