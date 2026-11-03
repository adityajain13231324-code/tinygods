import { Container } from 'pixi.js';
import { createApp } from './render/app.js';
import { Camera } from './render/camera.js';
import { Cutscenes } from './render/cutscene.js';
import { Director } from './render/director.js';
import { Effects } from './render/effects.js';
import { Spotlight } from './render/spotlight.js';
import { Speech } from './render/speech.js';
import { TownView } from './render/townView.js';
import { VillagerView } from './render/villagerView.js';
import { createBoard } from './render/ui/broadcast.js';
import { createHud } from './render/ui/hud.js';
import { createHover } from './render/ui/hover.js';
import { createCommandPanel } from './render/ui/commandPanel.js';
import { createPowerBar } from './render/ui/powerBar.js';
import { createRecap } from './render/ui/recap.js';
import './render/ui/ui.css';
import { Replay } from './render/replay.js';
import { Mixer } from './audio/mixer.js';
import { createGame, isGhost, runToEnd, skipRecap, submitOrders, updateGame } from './sim/turn.js';
import { createPassScreen } from './render/ui/passScreen.js';
import { settleTension } from './sim/tension.js';
import { mulberry32, shuffle } from './sim/rng.js';
import { PERSONALITY_NAMES } from './bots/personalities.js';
import { FACTIONS } from './config/content.js';
import { DRAMA, SIM } from './config/tunables.js';

// ?seed=42 gives the same town every time; handy for bug reports and later for bot tests.
const params = new URLSearchParams(location.search);
const seed = Number(params.get('seed')) || 1;

const BOT_NAMES = { warmonger: 'Marshal Vex', pacifist: 'Sister Pearl', opportunist: 'Old Fox', gossip: 'Madam Whisper', chaos: 'Trickster Pip' };

// Seats 0..players-1 are people (Embers first), the rest are bots with random personalities.
// One player = solo against bots. Two to four = pass-and-play on this device.
const players = Math.min(4, Math.max(1, Number(params.get('players')) || 1));
const typedNames = (params.get('names') ?? '').split(',').filter(Boolean);
const botTypes = shuffle(mulberry32(seed * 31), PERSONALITY_NAMES);
let nextBot = 0;
const seats = FACTIONS.map((f, i) => (i < players
  ? { name: players === 1 ? 'You' : (typedNames[i] ?? `Player ${i + 1}`), kind: 'human' }
  : (() => { const personality = botTypes[nextBot++]; return { name: BOT_NAMES[personality] ?? `${f.name} bot`, kind: 'bot', personality }; })()));
const humanSeats = seats.map((st, i) => (st.kind === 'human' ? i : -1)).filter((i) => i >= 0);
const hotseat = humanSeats.length > 1;

const game = createGame({ seed, seats });
const { app, world: stage } = await createApp(document.getElementById('game'));
const camera = new Camera(app, stage);
camera.attachInput(app.canvas);
const replay = new Replay({ game, camera });

// Sound can only start after a click or key press (browser rule).
const audio = new Mixer();
const unlockAudio = () => audio.start();
window.addEventListener('pointerdown', unlockAudio);
window.addEventListener('keydown', unlockAudio);

try {
  VillagerView.bloodEnabled = localStorage.getItem('tinygods.blood') !== '0';
  VillagerView.calm = localStorage.getItem('tinygods.calm') === '1';
} catch { /* defaults */ }

// ---- Scene layers, bottom to top: town, blood stains, villagers, bond threads, hover lines, spotlight, particles, speech ----
const town = new TownView(app, game.world.places);
stage.addChild(town.root);
const effects = new Effects(app, audio);
stage.addChild(effects.decals);
const crowd = stage.addChild(new Container());
crowd.sortableChildren = true;
const linesLayer = stage.addChild(new Container());
const spotLayer = stage.addChild(new Container());
stage.addChild(effects.layer);

// ---- UI ----
const ctx = {
  seat: humanSeats[0], // whose turn it is at the screen (changes in pass-and-play)
  humanSeats,
  hotseat,
  passReady: true, // false while the "pass the device" screen is up
  speed: 1,
  paused: false,
  setSpeed(n) { ctx.speed = n; },
  togglePause() { ctx.paused = !ctx.paused; },
  toggleMute() { audio.start(); return audio.toggleMute(); },
  isMuted: () => audio.muted,
  toggleBlood() {
    VillagerView.bloodEnabled = !VillagerView.bloodEnabled;
    try { localStorage.setItem('tinygods.blood', VillagerView.bloodEnabled ? '1' : '0'); } catch { /* ignore */ }
  },
  isBlood: () => VillagerView.bloodEnabled,
  toggleCalm() {
    VillagerView.calm = !VillagerView.calm;
    try { localStorage.setItem('tinygods.calm', VillagerView.calm ? '1' : '0'); } catch { /* ignore */ }
  },
  isCalm: () => VillagerView.calm,
  toggleCutscenes: () => cutscenes.toggle(),
  cutscenesOn: () => cutscenes.enabled,
  submit(orders, card = null) { submitOrders(game, ctx.seat, orders, card); },
  queuedPowers: [], // miracles typed at dawn, cast when the town wakes up
  takeQueuedPowers() { return ctx.queuedPowers.splice(0); },
  cutsceneActive: () => cutscenes.active,
  skipToEnd() {
    // Everyone playing is out: play the rest of the match instantly instead of watching bots.
    replay.stop();
    runToEnd(game);
    director.index = game.world.events.length; // don't replay every headline
  },
  nextTurn() {
    replay.stop(); // put the town back to its real state BEFORE the next phase begins
    skipRecap(game);
  },
  replay(highlight) { replay.play(highlight); },
  replayActive: () => replay.active,
  restart() {
    const next = new URLSearchParams(location.search);
    next.set('seed', String(Math.floor(Math.random() * 1e6) + 1));
    location.search = next.toString();
  },
};
const uiRoot = document.getElementById('ui');
const cutscenes = new Cutscenes({ uiRoot, game, camera, replay, audio });
const hud = createHud(uiRoot, ctx);
const board = createBoard(uiRoot);
const command = createCommandPanel(uiRoot, ctx);
const powerBar = createPowerBar(uiRoot, ctx, game, camera, stage);
camera.onTap = (x, y) => powerBar.mapTap(x, y);
const recap = createRecap(uiRoot, ctx);
const pass = createPassScreen(uiRoot);
const hover = createHover(uiRoot, linesLayer, stage, game);

const views = game.world.villagers.map((v) => {
  const view = new VillagerView(v, {
    onHover: (vw) => hover.onHover(vw),
    onOut: (vw) => hover.onOut(vw),
  });
  crowd.addChild(view.root);
  return view;
});
effects.views = views;
const spotlight = new Spotlight(spotLayer, views, camera);
const speech = new Speech(stage, camera, audio, game);
let animTime = 0;
const director = new Director({ camera, board, effects, audio, spotlight, clock: () => animTime });

// ---- Main loop ----
// The sim steps at a fixed 20 Hz inside updateGame; the renderer slides villagers between ticks.
// Our own wall clock instead of Pixi's ticker delta, which caps a frame at 100 ms and would
// turn a slow machine into slow motion.
const TICK = 1 / SIM.tickHz;
let lastNow = performance.now();
let lastPhase = null;
let crowdTimer = 0;

// Pass-and-play: decide whose turn it is at the screen, show the "pass the device" card, and
// give each player their own timer (the game's own 30 s timer would cut everybody off together).
let seatKey = '';
let seatTimer = 0;
function manageSeats(dt) {
  VillagerView.highlightSeat = -1;
  if (!hotseat) {
    ctx.seat = humanSeats[0];
    ctx.passReady = true;
    VillagerView.highlightSeat = ctx.seat;
    return;
  }
  const asking = game.phase === 'command';
  if (!asking || cutscenes.active) {
    if (!asking) pass.hide();
    return;
  }
  const waiting = humanSeats.filter((st) => (!game.eliminated[st] || isGhost(game, st)) && game.pending[st] === null);
  if (waiting.length === 0) {
    pass.hide();
    return;
  }
  const next = waiting[0];
  const key = `${game.phase}:${game.turn}:${next}`;
  if (key !== seatKey) {
    seatKey = key;
    ctx.seat = next;
    ctx.passReady = false;
    seatTimer = game.phase === 'command' ? 40 : 20;
    pass.show({ name: game.seats[next].name, seat: next, kind: game.phase, onReady() { ctx.passReady = true; pass.hide(); } });
  }
  if (ctx.passReady) {
    seatTimer -= dt;
    VillagerView.highlightSeat = game.phase === 'command' ? ctx.seat : -1;
    game.timer = Math.max(seatTimer, 1); // shown in the top bar; also keeps the shared timer from ending the phase
    if (seatTimer <= 0) {
      // Out of time: hand in whatever this player has picked so far.
      if (game.phase === 'command') submitOrders(game, ctx.seat, command.stagedOrders(), command.stagedCard());
    }
  } else {
    game.timer = Math.max(seatTimer, 1);
  }
}

function frame(frameSeconds) {
  const dt = Math.min(frameSeconds, SIM.maxFrameSeconds);
  animTime += dt;
  const cmdPanel = [document.getElementById('command'), document.getElementById('powerbar')].find((p) => p && !p.hidden);
  camera.insetTarget = cmdPanel && ['command', 'sim'].includes(game.phase) ? cmdPanel.offsetHeight + 14 : 0;
  camera.insetTop = document.getElementById('topbar')?.offsetHeight + 6 || 46;
  camera.update(dt);

  // Cutscenes start when the game enters a new phase, and pause the game while they play.
  if (game.phase !== lastPhase) {
    if (game.phase === 'command') cutscenes.startDay();
    else if (game.phase === 'recap') cutscenes.startNews();
    else if (game.phase === 'ended') cutscenes.startEnding();
    lastPhase = game.phase;
  }
  cutscenes.update(dt);

  cutscenes.suppress = humanSeats.every((st) => game.eliminated[st]);
  manageSeats(dt);

  // Solo: timer about to run out? Hand in whatever is staged rather than losing it.
  if (!hotseat) {
    if (game.phase === 'command' && game.pending[ctx.seat] === null && !game.eliminated[ctx.seat] && game.timer < dt + 0.05) {
      submitOrders(game, ctx.seat, command.stagedOrders(), command.stagedCard());
    }
  }

  // A replay borrows the villagers' state, so it must end before the recap timer can
  // roll the game into the next turn.
  if (!cutscenes.active && replay.active && (game.phase !== 'recap' || game.timer < dt * 2 + 0.15)) replay.stop();
  replay.update(dt);

  // Slow motion while the camera is zoomed on a dramatic moment; frozen when paused or in a cutscene.
  let gameDt = dt;
  if (ctx.paused || cutscenes.active || (hotseat && !ctx.passReady)) gameDt = 0;
  else if (game.phase === 'sim') gameDt = dt * ctx.speed * camera.timeScale;
  updateGame(game, gameDt);
  if (game.phase !== 'sim' && !ctx.paused) settleTension(game.world, dt);

  director.update(game);

  // During a spotlighted cut everybody but the two people involved fades, and the town darkens.
  const spotOn = spotlight.active;
  town.dim = spotOn ? DRAMA.dimTown * camera.k : 0;
  uiRoot.classList.toggle('cut', spotOn);

  const alpha = replay.active ? replay.alpha : game.phase === 'sim' ? Math.min(1, game.acc / TICK) : 1;
  for (const view of views) {
    view.dim = spotOn && !spotlight.has(view.v.id);
    view.update(alpha, animTime);
    effects.watch(view, animTime);
    speech.watch(view);
  }
  effects.decals.visible = !VillagerView.calm;
  speech.layer.visible = !VillagerView.calm;
  effects.update(dt);
  speech.update(dt);
  spotlight.update(animTime);
  town.update(animTime, game.world.tension, game.world.bounds);
  audio.setTension(game.world.tension);
  crowdTimer -= dt;
  if (crowdTimer <= 0) {
    crowdTimer = 1;
    audio.setCrowd(game.world.villagers.filter((v) => v.alive).length / game.world.villagers.length);
  }

  hover.update();
  hud.update(game);
  command.update(game);
  powerBar.update();
  recap.update(game);
}

const fpsEl = document.getElementById('fps');
let fpsTimer = 0;
app.ticker.add(() => {
  const now = performance.now();
  const ms = now - lastNow;
  lastNow = now;
  frame(ms / 1000);

  fpsTimer += ms;
  if (fpsTimer > 500) {
    fpsTimer = 0;
    fpsEl.textContent = `${Math.round(app.ticker.FPS)} FPS`;
  }
});

// Handy for poking around in the browser console.
window.tinyGods = { game, app, views, ctx, frame, camera, effects, director, audio, replay, cutscenes, town, speech, spotlight };
