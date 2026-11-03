import { FACTIONS } from '../config/content.js';
import { WORLD } from '../config/tunables.js';
import { buildStory } from '../sim/story.js';
import { livingByFaction } from '../sim/win.js';
import { el } from './ui/dom.js';

// Cutscenes between turns, in the spirit of *We Become What We Behold*: a calm opening that
// gets darker as the town does, a TV news broadcast that turns the turn's worst moments into
// headlines (with a camera viewfinder and shutter flash, because in that game you ARE the
// camera), and a quiet ending. All of it is skippable, can be switched off, and pauses the
// game while it plays. Art and text are our own.

const KEY = 'tinygods.cutscenes';

/** Mood line for the title card, from how bad things have got. */
function dayMood(game) {
  const t = game.world.tension;
  const dead = 60 - game.world.villagers.filter((v) => v.alive).length;
  if (game.turn === 1) return 'A peaceful little town. Nobody knows what is coming.';
  if (t < 15 && dead === 0) return 'Another quiet morning. Birds, bread, and bad feelings brewing.';
  if (t < 30) return 'People are glaring across the plaza.';
  if (t < 55) return 'The town is on edge. Doors stay locked.';
  if (t < 80) return 'Smoke on the horizon. Everyone has picked a side.';
  return 'The sky is dark. There is hardly anyone left to save.';
}

export class Cutscenes {
  constructor({ uiRoot, game, camera, replay, audio, views }) {
    this.game = game;
    this.camera = camera;
    this.replay = replay;
    this.audio = audio;
    this.views = views;
    this.enabled = true;
    this.suppress = false; // set when no human is left playing: nobody needs the interludes
    try {
      this.enabled = localStorage.getItem(KEY) !== '0';
    } catch { /* default on */ }

    this.steps = [];
    this.step = null;
    this.t = 0;
    this.typing = null;
    this.onDone = null;

    // ---- DOM ----
    this.root = el('div', 'cs');
    this.root.hidden = true;
    this.top = el('div', 'cs-bar cs-top');
    this.bottom = el('div', 'cs-bar cs-bottom');
    this.title = el('div', 'cs-title');
    this.titleMain = el('div', 'cs-title-main');
    this.titleSub = el('div', 'cs-title-sub');
    this.titleStat = el('div', 'cs-title-stat');
    this.title.append(this.titleMain, this.titleSub, this.titleStat);

    // Thin camera viewfinder corners, shown only while a story's replay is on screen.
    this.vf = el('div', 'cs-vf');
    for (const c of ['tl', 'tr', 'bl', 'br']) this.vf.append(el('i', c));

    // Top-left "LIVE" bug, like a real channel.
    this.bug = el('div', 'cs-bug');
    this.bug.append(el('span', 'cs-live', 'LIVE'), el('span', 'cs-bug-name', 'TINY NEWS'));

    // Studio picture-in-picture (top right): an anchor at a desk in front of the town skyline.
    this.studio = el('div', 'cs-pip');
    this.studio.innerHTML = ANCHOR_SVG;
    this.mouthClosed = this.studio.querySelector('.m-closed');
    this.mouthOpen = this.studio.querySelector('.m-open');
    this.mouthOpen.style.display = 'none';

    // Bottom stack: the headline bar and, under it, what the anchor is saying as subtitles.
    this.stack = el('div', 'cs-stack');
    this.third = el('div', 'cs-third');
    this.thirdTag = el('span', 'cs-third-tag');
    this.thirdHead = el('div', 'cs-third-head');
    this.thirdSub = el('div', 'cs-third-sub');
    this.third.append(this.thirdTag, this.thirdHead, this.thirdSub);
    this.anchorLine = el('div', 'cs-caption');
    this.stack.append(this.third, this.anchorLine);

    this.ticker = el('div', 'cs-ticker');
    this.tickerText = el('div', 'cs-ticker-text');
    this.ticker.append(el('span', 'cs-ticker-tag', 'TINY NEWS'), this.tickerText);

    this.skipBtn = el('button', 'cs-skip', 'Skip ▶▶');
    this.skipBtn.onclick = () => this.skip();
    this.flash = el('div', 'cs-flash');
    this.root.append(this.flash, this.top, this.bottom, this.title, this.vf, this.bug, this.studio, this.stack, this.ticker, this.skipBtn);
    uiRoot.append(this.root);
    window.addEventListener('keydown', (e) => {
      if (this.active && (e.key === 'Escape' || e.key === ' ' || e.key === 'Enter')) {
        e.preventDefault();
        this.skip();
      }
    });
    this.uiRoot = uiRoot;
  }

  get active() {
    return this.step !== null;
  }

  toggle() {
    this.enabled = !this.enabled;
    try { localStorage.setItem(KEY, this.enabled ? '1' : '0'); } catch { /* ignore */ }
    if (!this.enabled) this.skipAll();
    return this.enabled;
  }

  // ---- starting a scene -------------------------------------------------------------

  /** "DAY N" title card at the start of a turn. */
  startDay() {
    if (!this.enabled || this.suppress || this.active || this.noDay) return;
    const g = this.game;
    const living = livingByFaction(g.world);
    const dead = 60 - g.world.villagers.filter((v) => v.alive).length;
    // Fly over the busiest place.
    let place = g.world.places[0];
    let best = -1;
    for (const p of g.world.places) {
      const n = g.world.villagers.filter((v) => v.alive && Math.hypot(v.x - p.x, v.y - p.y) < p.radius).length;
      if (n > best) { best = n; place = p; }
    }
    this.run([{
      kind: 'day', dur: g.turn === 1 ? 3.6 : 2.4,
      enter: () => {
        this.titleMain.textContent = g.turn === 1 ? 'TINY GODS' : `DAY ${g.turn}`;
        this.titleSub.textContent = dayMood(g);
        this.titleStat.textContent = g.turn === 1 ? 'Secretly nudge a peaceful town into war, then argue about whose fault it was.'
          : `${60 - dead} villagers remain · ${FACTIONS.map((f, i) => `${f.name} ${living[i]}`).join(' · ')}`;
        this.show({ bars: true, title: true });
        this.camera.cut(place.x, place.y, { zoom: 1.25, hold: 3.4 });
        this.audio?.play('bond');
      },
      leave: () => this.hide(),
    }]);
  }

  /** A TV news broadcast about this turn's highlights. */
  startNews(done) {
    const g = this.game;
    const highlights = g.highlights.slice(0, 1); // one story, so the news stays short
    if (!this.enabled || this.suppress || this.active || highlights.length === 0) {
      done?.();
      return;
    }
    const living = livingByFaction(g.world);
    const dead = 60 - g.world.villagers.filter((v) => v.alive).length;
    const ticker = `TURN ${g.turn}   ●   ${FACTIONS.map((f, i) => `${f.name.toUpperCase()} ${living[i]}`).join('   ●   ')}   ●   ${dead} VILLAGERS HAVE FALLEN   ●   `;
    const steps = [{
      kind: 'studio', dur: 1.4,
      enter: () => {
        this.tickerText.textContent = ticker.repeat(3);
        this.show({ bars: true, studio: true, ticker: true });
        this.say(dead === 0 ? `Good evening, town. Day ${g.turn}: quiet, for once.` : `Good evening, town. Day ${g.turn}. One story tonight.`);
        this.audio?.play('jingle');
      },
      leave: () => {},
    }];
    highlights.forEach((h, i) => steps.push({
      kind: 'story', dur: 3.6,
      enter: () => {
        this.show({ bars: true, studio: true, ticker: true, vf: true, third: true });
        this.thirdHead.textContent = h.title;
        this.thirdTag.textContent = storyTone(h);
        this.thirdSub.textContent = 'Tonight\'s top story';
        this.say(narrate(h, i));
        this.doFlash();
        this.audio?.play('shutter');
        this.replay.play(h);
      },
      leave: () => this.replay.stop(),
    }));
    steps.push({
      kind: 'outro', dur: 1.0,
      enter: () => {
        this.show({ bars: true, studio: true, ticker: true });
        this.say('That is the news. Sleep well, town.');
        this.camera.hold = Math.min(this.camera.hold, 0.01);
      },
      leave: () => {},
    });
    this.run(steps, done);
  }

  /** A short epilogue before the end screen. */
  startEnding(done) {
    if (!this.enabled || this.suppress || this.active) {
      done?.();
      return;
    }
    const g = this.game;
    const winner = FACTIONS[g.winner];
    const story = buildStory(g);
    const lines = [story[0], story.at(-1)]; // how the peace ended, and how it ended
    this.run([{
      kind: 'ending', dur: 8,
      enter: () => {
        this.titleMain.textContent = `THE ${winner.name.toUpperCase()} REMAIN`;
        this.titleMain.style.color = `#${winner.color.toString(16).padStart(6, '0')}`;
        this.titleSub.textContent = lines.join('  ');
        this.titleStat.textContent = `${g.winReason} · ${g.turn} days`;
        this.show({ bars: true, title: true, slow: true });
        this.camera.cut(WORLD.width / 2, WORLD.height / 2, { zoom: 1.0, hold: 8 });
        this.audio?.play('warp');
      },
      leave: () => {
        this.titleMain.style.color = '';
        this.hide();
      },
    }], done);
  }

  // ---- machinery --------------------------------------------------------------------

  run(steps, done = null) {
    this.steps = steps.slice();
    this.onDone = done;
    this.root.hidden = false;
    this.uiRoot.classList.add('cs-on');
    this.next();
  }

  next() {
    if (this.step) this.step.leave?.();
    this.step = this.steps.shift() ?? null;
    this.t = 0;
    if (!this.step) {
      this.finish();
      return;
    }
    this.step.enter?.();
  }

  finish() {
    this.hide();
    this.root.hidden = true;
    this.uiRoot.classList.remove('cs-on');
    this.typing = null;
    this.replay.stop();
    const done = this.onDone;
    this.onDone = null;
    done?.();
  }

  skip() {
    if (!this.active) return;
    this.steps = [];
    this.next(); // runs leave() of the current step and finishes
  }

  skipAll() {
    this.skip();
  }

  show({ bars = false, title = false, studio = false, ticker = false, vf = false, third = false, slow = false }) {
    const r = this.root.classList;
    r.toggle('bars', bars);
    this.title.classList.toggle('on', title);
    this.title.classList.toggle('slow', slow);
    this.studio.classList.toggle('on', studio);
    this.bug.classList.toggle('on', studio);
    this.anchorLine.classList.toggle('on', studio);
    this.ticker.classList.toggle('on', ticker);
    this.vf.classList.toggle('on', vf);
    this.third.classList.toggle('on', third);
  }

  hide() {
    this.show({});
  }

  setMouth(open) {
    this.mouthOpen.style.display = open ? '' : 'none';
    this.mouthClosed.style.display = open ? 'none' : '';
  }

  doFlash() {
    this.flash.animate([{ opacity: 0.85 }, { opacity: 0 }], { duration: 380 });
  }

  say(text) {
    this.typing = { text, i: 0, acc: 0 };
    this.anchorLine.textContent = '';
  }

  update(dt) {
    if (!this.active) return;
    this.t += dt;

    // Typewriter for the anchor, with cartoon voice blips.
    const ty = this.typing;
    if (ty && ty.i < ty.text.length) {
      ty.acc += dt * 32;
      while (ty.acc >= 1 && ty.i < ty.text.length) {
        ty.acc -= 1;
        ty.i++;
        if (ty.i % 3 === 0) this.audio?.voice(77, 4, 'happy', 800);
      }
      this.anchorLine.textContent = ty.text.slice(0, ty.i);
      this.setMouth(Math.floor(this.t * 9) % 2 === 0);
    } else {
      this.setMouth(false);
    }

    if (this.t >= this.step.dur) this.next();
  }
}

// ---- the anchor's words ---------------------------------------------------------------

function storyTone(h) {
  if (h.title.startsWith('First blood')) return 'A DARK FIRST';
  if (h.title.includes('last of a faction')) return 'A FACTION FALLS';
  if (h.kills >= 3) return 'BLOODY SCENES';
  if (h.kills === 0) return 'GUNFIRE REPORTED';
  return 'DEVELOPING';
}

function narrate(h, i) {
  const opener = ['Our top story:', 'Also tonight:', 'And finally:'][Math.min(i, 2)];
  if (h.title.startsWith('First blood')) return `${opener} the first blood of this town. ${h.title.replace('First blood: ', '')}.`;
  if (h.title.includes('last of a faction')) return `${opener} ${h.title}.`;
  if (h.kills >= 3) return `${opener} a brawl. ${h.title}.`;
  if (h.kills === 0) return `${opener} ${h.title}. Residents are advised to duck.`;
  return `${opener} ${h.title}.`;
}

// A simple news anchor at a desk in front of a skyline, drawn as SVG (it matches the villagers: round, outlined, friendly).
const ANCHOR_SVG = `<svg viewBox="0 0 240 150" xmlns="http://www.w3.org/2000/svg" class="cs-svg">
  <defs><linearGradient id="bk" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#27408b"/><stop offset="1" stop-color="#101a45"/></linearGradient></defs>
  <rect width="240" height="150" fill="url(#bk)"/>
  <g fill="#0b1235" opacity="0.8"><rect x="8" y="70" width="24" height="60"/><rect x="36" y="52" width="20" height="78"/><rect x="60" y="82" width="26" height="48"/><rect x="150" y="60" width="22" height="70"/><rect x="176" y="78" width="26" height="52"/><rect x="206" y="48" width="22" height="82"/></g>
  <g fill="#ffd36b" opacity="0.85"><rect x="42" y="62" width="4" height="4"/><rect x="42" y="74" width="4" height="4"/><rect x="156" y="72" width="4" height="4"/><rect x="212" y="60" width="4" height="4"/><rect x="212" y="74" width="4" height="4"/></g>
  <text x="120" y="22" text-anchor="middle" fill="#fff" font-family="system-ui,sans-serif" font-weight="900" font-size="14" letter-spacing="3">TINY NEWS</text>
  <path d="M70 150 Q70 100 120 98 Q170 100 170 150Z" fill="#3d4a7a" stroke="#1c2448" stroke-width="4"/>
  <path d="M104 100 L120 128 L136 100Z" fill="#fff"/><path d="M116 108 L124 108 L127 140 L120 146 L113 140Z" fill="#d62828"/>
  <circle cx="120" cy="66" r="30" fill="#d8cdb4" stroke="#8a7f66" stroke-width="4"/>
  <path d="M92 58 Q120 30 148 58 Q132 46 120 48 Q106 46 92 58Z" fill="#6b4a2b"/>
  <g class="eyes"><circle cx="108" cy="68" r="3.4" fill="#2b2622"/><circle cx="132" cy="68" r="3.4" fill="#2b2622"/><circle cx="107" cy="67" r="1" fill="#fff"/><circle cx="131" cy="67" r="1" fill="#fff"/></g>
  <g fill="none" stroke="#2b2622" stroke-width="2"><rect x="99" y="62" width="17" height="12" rx="4"/><rect x="124" y="62" width="17" height="12" rx="4"/><path d="M116 67 H124"/></g>
  <path class="m-closed" d="M112 83 Q120 88 128 83" fill="none" stroke="#2b2622" stroke-width="2.6" stroke-linecap="round"/>
  <ellipse class="m-open" cx="120" cy="85" rx="6" ry="5" fill="#7a1a1a" stroke="#2b2622" stroke-width="2"/>
  <rect x="0" y="126" width="240" height="24" fill="#7a5230" stroke="#2b2622" stroke-width="3"/>
  <rect x="150" y="112" width="3" height="16" fill="#2b2622"/><circle cx="151.5" cy="110" r="5" fill="#2b2622"/>
</svg>`;
