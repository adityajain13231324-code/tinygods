import { FACTIONS, PLACES } from '../../config/content.js';
import { TURN } from '../../config/tunables.js';
import { describeOrder } from '../../sim/orders.js';
import { livingByFaction } from '../../sim/win.js';
import { clock, css, el, setText } from './dom.js';

const MARKS = { triangle: '▲', wave: '≈', leaf: '❀', star: '★' };
const PHASE_LABEL = { command: 'Give your orders', sim: 'The town acts', recap: 'News', guess: 'Who caused it?', ended: 'Game over' };
const MAX_FEED = 6;

/** Top bar (turn, phase, timer, speed, faction counts) and the kill feed. */
export function createHud(root, ctx) {
  const topbar = el('div', 'panel');
  topbar.id = 'topbar';
  const turn = el('span', 'turn');
  const phase = el('span', 'phase');
  const timer = el('span', 'timer');
  const alert = el('span', 'alert');
  const chipsBox = el('span');
  chipsBox.style.display = 'contents';
  const speed = el('span', 'speed');
  const speedButtons = [1, 2, 4].map((n) => {
    const b = el('button', '', `×${n}`);
    b.title = 'Simulation speed';
    b.onclick = () => ctx.setSpeed(n);
    speed.append(b);
    return b;
  });
  const tools = el('span', 'speed');
  const pauseBtn = el('button', '', '⏸');
  pauseBtn.title = 'Pause';
  pauseBtn.onclick = () => ctx.togglePause();
  const muteBtn = el('button', '', ctx.isMuted() ? '🔇' : '🔊');
  muteBtn.title = 'Sound on/off';
  muteBtn.onclick = () => {
    ctx.toggleMute();
    muteBtn.textContent = ctx.isMuted() ? '🔇' : '🔊';
  };
  const bloodBtn = el('button', '', '🩸');
  bloodBtn.title = 'Cartoon blood on/off';
  bloodBtn.onclick = () => ctx.toggleBlood();
  const csBtn = el('button', '', '🎬');
  csBtn.title = 'Cutscenes on/off';
  csBtn.onclick = () => ctx.toggleCutscenes();
  const calmBtn = el('button', '', '🧘');
  calmBtn.title = 'Calm view: hide speech bubbles, thoughts and stains';
  calmBtn.onclick = () => ctx.toggleCalm();
  const fpsBtn = el('button', 'fpsbtn', ctx.fpsLabel());
  fpsBtn.title = 'Frame rate: Auto (your screen) / 60 / 30. Click to change.';
  fpsBtn.onclick = () => { ctx.cycleFps(); fpsBtn.textContent = ctx.fpsLabel(); };
  const homeBtn = el('button', '', '🏠');
  homeBtn.title = 'Back to the main menu';
  homeBtn.onclick = () => { if (confirm('Leave this match and go back to the menu?')) location.href = location.pathname; };
  tools.append(pauseBtn, muteBtn, bloodBtn, csBtn, calmBtn, fpsBtn, homeBtn);

  // Tension meter: drives the music layers too.
  const meter = el('span', 'meter');
  meter.title = 'Tension: how close the town is to chaos';
  const meterBar = el('span', 'bar');
  const meterFill = el('i');
  meterBar.append(meterFill);
  meter.append(el('b', '', 'Tension'), meterBar);

  const myOrders = el('div');
  myOrders.id = 'myorders';
  const goal = el('span', 'goal', '🎯 Last faction standing wins');
  goal.title = 'You win when every other faction has no living villagers left. Hover any villager to see how it feels.';
  topbar.append(turn, phase, timer, alert, goal, chipsBox, meter, speed, tools, myOrders);

  const feed = el('div');
  feed.id = 'feed';
  root.append(topbar, feed);

  const chips = FACTIONS.map((f) => {
    const chip = el('span', 'chip');
    const dot = el('i');
    dot.style.background = css(f.color);
    const label = el('b');
    chip.append(dot, label);
    chipsBox.append(chip);
    return { chip, label };
  });

  let feedIndex = 0;

  return {
    update(game) {
      setText(turn, `Turn ${game.turn}`);
      setText(phase, PHASE_LABEL[game.phase]);
      setText(timer, game.phase === 'sim' ? clock(TURN.simSeconds - game.simElapsed) : game.phase === 'ended' ? '' : clock(game.timer));
      setText(alert, ctx.replayActive() ? '⏪ REPLAY' : game.suddenDeath && game.phase !== 'ended' ? 'Tension rising!' : '');

      const living = livingByFaction(game.world);
      FACTIONS.forEach((f, i) => {
        const { chip, label } = chips[i];
        const infamy = Math.round(game.notoriety[i]);
        setText(label, `${MARKS[f.mark]} ${f.name} ${living[i]}${game.seats[i].kind === 'human' ? (ctx.hotseat || (ctx.online && i !== ctx.seat) ? ` (${game.seats[i].name})` : ' (you)') : ''}${infamy >= 1 ? ` 🔥${infamy}` : ''}`);
        chips[i].chip.title = infamy >= 1
          ? `Notoriety ${infamy}: the town distrusts the ${f.name} because of the killing.`
          : `${f.name}: a clean reputation.`;
        chip.classList.toggle('you', ctx.online ? i === ctx.seat : !ctx.hotseat && game.seats[i].kind === 'human');
        chip.classList.toggle('out', game.eliminated[i]);
      });
      speedButtons.forEach((b, i) => b.classList.toggle('on', ctx.speed === [1, 2, 4][i]));
      pauseBtn.textContent = ctx.paused ? '▶' : '⏸';
      pauseBtn.classList.toggle('on', ctx.paused);
      bloodBtn.classList.toggle('on', ctx.isBlood());
      csBtn.classList.toggle('on', ctx.cutscenesOn());
      calmBtn.classList.toggle('on', ctx.isCalm());

      const tension = Math.round(game.world.tension);
      meterFill.style.width = `${tension}%`;
      meterFill.style.background = tension < 35 ? '#7fd68a' : tension < 65 ? '#ffd36b' : '#ff7a5a';
      speed.style.visibility = game.phase === 'sim' && !ctx.online ? 'visible' : 'hidden';
      pauseBtn.hidden = !!ctx.online; // everybody shares one clock online

      const mine = game.truth.filter((t) => t.turn === game.turn && t.seat === ctx.seat).at(-1);
      setText(myOrders, !ctx.hotseat && game.phase === 'sim' && mine ? `Your orders: ${mine.orders.length ? mine.orders.map(describeOrder).join(', ') : 'none'}` : '');

      // Kill feed from the world's event log.
      const events = game.world.events;
      while (feedIndex < events.length) {
        const e = events[feedIndex++];
        if (e.type === 'kill') {
          const k = game.world.villagers[e.killerId];
          const v = game.world.villagers[e.victimId];
          const line = el('div', '', `${k.name} (${tag(k)}) downed ${v.name} (${tag(v)})`);
          addFeed(feed, line);
        } else if (e.type === 'gunshot') {
          addFeed(feed, el('div', 'shot', `Gunshot at the ${PLACES.find((p) => p.id === e.place).name}!`));
        }
      }
    },
  };
}

const tag = (v) => (v.faction >= 0 ? FACTIONS[v.faction].name : 'neutral');

function addFeed(feed, line) {
  feed.append(line);
  while (feed.children.length > MAX_FEED) feed.firstChild.remove();
  setTimeout(() => line.remove(), 12000);
}
