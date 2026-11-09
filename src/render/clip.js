import { Container, Graphics, Text } from 'pixi.js';
import { IDEAS } from '../config/tunables.js';
import { FACTIONS } from '../config/content.js';

// Funny, shareable highlight clips. The player picks a recorded moment, the game replays it in the
// real town while the browser records the canvas, with the villager's name, a caption written from
// the events that really happened in that window, and the creator tag. Everything stays on the
// device: the clip is a blob the player can save; nothing is ever uploaded.

export const WATERMARK = '@adityajain1323';
const TYPES = ['video/webm;codecs=vp9', 'video/webm;codecs=vp8', 'video/webm', 'video/mp4'];

/** What the browser can do, so the UI can say so plainly instead of failing silently. */
export function clipSupport(canvas) {
  const canRecord = typeof MediaRecorder !== 'undefined' && typeof canvas?.captureStream === 'function';
  const mime = canRecord ? TYPES.find((t) => MediaRecorder.isTypeSupported?.(t)) ?? null : null;
  return { canRecord: !!mime, mime, stillOnly: !mime && typeof canvas?.toBlob === 'function' };
}

const fmt = (list) => list[Math.floor(Math.abs(Math.sin(list.length * 12.9898 + list[0].length)) * list.length) % list.length];

/**
 * The caption for a clip: a joke built from the real events in its time window (no invented moments),
 * plus the villager it is about. Returns {name, caption, kind}.
 */
export function clipCaption(world, clip) {
  const inWindow = world.events.filter((e) => e.turn === (clip.turn ?? e.turn) && e.time >= clip.t0 && e.time <= clip.t1);
  const nm = (id) => world.villagers[id]?.name ?? 'Somebody';
  const find = (type, test = () => true) => inWindow.find((e) => e.type === type && test(e));
  let e;
  if ((e = find('leaderCrowned'))) return { kind: 'leader', name: nm(e.villagerId), caption: `${nm(e.villagerId)} put on the crown and instantly got taller. Allegedly.` };
  if ((e = find('comboZap'))) return { kind: 'zap', name: nm(e.path[0]?.id), caption: `Rain, then lightning. ${e.path.length} soggy villagers got the news at once.` };
  if ((e = find('gunshot', (g) => g.blank))) return { kind: 'blank', name: nm(e.shooterId), caption: `${nm(e.shooterId)} pulled the trigger. The gun said "pop". Confetti everywhere.` };
  if ((e = find('weaponStolen'))) return { kind: 'theft', name: nm(e.thiefId), caption: `${nm(e.thiefId)} borrowed ${nm(e.victimId)}'s ${e.weapon}. Permanently.` };
  if ((e = find('kill', (k) => k.weapon === 'rocket'))) return { kind: 'rocket', name: nm(e.killerId), caption: `${nm(e.killerId)} launched a rocket. ${nm(e.victimId)} did not have that on their bingo card.` };
  if ((e = find('kill', (k) => k.source && k.source.kind !== 'weapon'))) return { kind: 'blast', name: nm(e.victimId), caption: `${nm(e.victimId)} was standing exactly where the ${e.source.id === 'bomb' ? 'bomb' : 'blast'} landed at the ${e.place}. Nobody saw who did it.` };
  if ((e = find('kill'))) return { kind: 'kill', name: nm(e.killerId), caption: e.killerId >= 0 ? `${nm(e.victimId)} met ${nm(e.killerId)} at the ${e.place}. It did not go well.` : `${nm(e.victimId)} had a very bad day at the ${e.place}.` };
  if ((e = find('gunshot', (g) => !g.hit))) return { kind: 'miss', name: nm(e.shooterId), caption: e.coverId ? `${nm(e.targetId)} hid behind the furniture and won.` : `${nm(e.shooterId)} aimed carefully. The bullet went on holiday.` };
  if ((e = find('defect'))) return { kind: 'betrayal', name: nm(e.villagerId), caption: `${nm(e.villagerId)} switched sides. Awkward at the next family dinner.` };
  if ((e = find('cakeArrival'))) return { kind: 'cake', name: nm(e.villagerId), caption: `${nm(e.villagerId)} followed the cake. Nobody could blame them.` };
  if ((e = find('troubleDash'))) return { kind: 'dash', name: nm(e.thiefId), caption: `${nm(e.thiefId)} ran straight through a fight just to see what would happen.` };
  if ((e = find('explosion'))) return { kind: 'boom', name: nm(world.troublemakerId >= 0 ? world.troublemakerId : 0), caption: 'Something went boom. Everyone pretended to be surprised.' };
  return { kind: 'day', name: 'Tiny Gods', caption: fmt(['A perfectly normal day in a tiny town.', 'Nothing to see here. Everyone is fine.']) };
}

/** Records one replayed moment. `getFaction` colours the name chip. */
export function createClipTool({ app, replay, game, getHost }) {
  const support = clipSupport(app.canvas);
  const overlay = new Container();
  overlay.visible = false;
  overlay.eventMode = 'none';
  const bar = new Graphics();
  const cap = new Text({ text: '', style: { fontFamily: 'system-ui, sans-serif', fontSize: 26, fontWeight: '800', fill: 0xffffff, stroke: { color: 0x15130f, width: 5 }, wordWrap: true, wordWrapWidth: 900, align: 'center' } });
  cap.anchor.set(0.5, 1);
  const chip = new Text({ text: '', style: { fontFamily: 'system-ui, sans-serif', fontSize: 22, fontWeight: '900', fill: 0xffe27a, stroke: { color: 0x15130f, width: 5 } } });
  const mark = new Text({ text: WATERMARK, style: { fontFamily: 'system-ui, sans-serif', fontSize: 20, fontWeight: '800', fill: 0xffffff, stroke: { color: 0x15130f, width: 4 } } });
  mark.anchor.set(1, 1);
  overlay.addChild(bar, cap, chip, mark);
  app.stage.addChild(overlay);
  let busy = false;

  const layout = () => {
    const w = app.screen.width, h = app.screen.height;
    cap.style.wordWrapWidth = Math.max(240, w * 0.8);
    cap.position.set(w / 2, h - 46);
    chip.position.set(18, 14);
    mark.position.set(w - 16, h - 12);
    bar.clear().rect(0, h - 40 - cap.height - 16, w, cap.height + 56).fill({ color: 0x000000, alpha: 0.55 });
  };

  return {
    support,
    get busy() { return busy; },
    /** The clip in plain words, shown before recording so nothing is a surprise. */
    describe: (clip) => clipCaption(game.world, clip),
    /**
     * Replay the moment and record it. Resolves to {blob, url, mime, bytes, seconds, caption} or
     * {fallback: 'png'|'none', ...} when this browser cannot record video.
     */
    async record(clip, text = clipCaption(game.world, clip)) {
      if (busy) return { error: 'A clip is already being recorded.' };
      busy = true;
      overlay.visible = true;
      cap.text = text.caption;
      chip.text = text.name;
      layout();
      try {
        replay.play(clip);
        if (!replay.active) return { error: 'That moment has no recording, so it cannot be saved as a clip.' };
        await new Promise((r) => setTimeout(r, 120));
        if (!support.canRecord) {
          layout();
          await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
          const blob = await new Promise((res) => app.canvas.toBlob(res, 'image/png'));
          return blob ? { fallback: 'png', blob, url: URL.createObjectURL(blob), bytes: blob.size, caption: text } : { fallback: 'none', caption: text };
        }
        const stream = app.canvas.captureStream(30);
        const rec = new MediaRecorder(stream, { mimeType: support.mime, videoBitsPerSecond: IDEAS.clip.bitrate });
        const chunks = [];
        let bytes = 0;
        rec.ondataavailable = (e) => { if (e.data?.size) { chunks.push(e.data); bytes += e.data.size; } };
        const stopped = new Promise((r) => { rec.onstop = r; });
        const t0 = performance.now();
        rec.start(250);
        // stop when the replay ends, at the time limit, or if the clip gets too big
        await new Promise((resolve) => {
          const tick = () => {
            const s = (performance.now() - t0) / 1000;
            if (!replay.active || s >= IDEAS.clip.maxSeconds || bytes >= IDEAS.clip.maxBytes) { resolve(); return; }
            setTimeout(tick, 100);
          };
          tick();
        });
        await new Promise((r) => setTimeout(r, 350));
        rec.stop();
        stream.getTracks().forEach((t) => t.stop());
        await stopped;
        replay.stop();
        const blob = new Blob(chunks, { type: support.mime.split(';')[0] });
        return { blob, url: URL.createObjectURL(blob), mime: blob.type, bytes: blob.size, seconds: (performance.now() - t0) / 1000, caption: text };
      } catch (err) {
        return { error: `Recording failed: ${err?.message ?? err}` };
      } finally {
        overlay.visible = false;
        busy = false;
      }
    },
  };
}

export const factionColour = (f) => (f >= 0 ? FACTIONS[f].color : 0xd8cdb4);
