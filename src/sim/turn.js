import { ARMORY, DIFFICULTY, POWERS, GHOST, COMBAT, FEVER, GRIEVANCE, STORM, WORLD, INFLUENCE, NOTORIETY, POPULATION, REPLAY, SIM, TENSION, TURN } from '../config/tunables.js';
import { buildHighlights } from './highlights.js';
import { applyLoyalty } from './loyalty.js';
import { Recorder } from './recorder.js';
import { createWorld } from './world.js';
import { stepWorld, startIdle } from './brain.js';
import { emptyFx } from './villager.js';
import { applyOrders, comebackBonus, validateOrders } from './orders.js';
import { applySuddenDeath, checkWinner, factionsAlive, livingByFaction } from './win.js';
import { buildRecap } from './events.js';
import { mulberry32 } from './rng.js';
import { botDecide, botGuesses, botCard, botPowers } from '../bots/bot.js';
import { applyCard, dealHand, describeCard, validateCard } from './cards.js';
import { rollEvent } from './townEvents.js';

// The phase manager. Pure data + functions, no rendering, so it runs headless in Node.
//
//   command  (players submit orders; bots submit instantly)
//   sim      (the town runs on its own)
//   recap    (news and the turn's highlights)
//   guess    (players guess whose order caused each highlight, then the truth is shown)
//   ended
//
// A rumor phase arrives in M5. With no human players (bot-only matches) the guess phase
// resolves instantly, so headless runs can still measure how guessable the game is.

const TICK = 1 / SIM.tickHz;

/**
 * @param {{seed?: number, seats: {name: string, kind: 'human'|'bot', personality?: string}[]}} opts
 *   seats[i] leads faction i.
 */
export function createGame({ seed = 1, seats, cosmetics = true, difficulty = 'normal', commandSeconds = TURN.commandSeconds }) {
  const world = createWorld(seed, { cosmetics });
  const game = {
    seed,
    world,
    seats,
    botRng: mulberry32((seed ^ 0x9e3779b9) >>> 0),
    cardRng: mulberry32((seed ^ 0x51ed270b) >>> 0), // its own stream: dealing cards never changes the town
    eventRng: mulberry32((seed ^ 0x7e57ab1e) >>> 0), // and so does the town-event roll
    event: null, // this dawn's town event, if any
    lastEventId: null,
    difficulty,
    commandSeconds,
    power: new Array(POPULATION.factions).fill(0), // god power points left this turn
    hand: Array.from({ length: POPULATION.factions }, () => []), // this turn's three cards per seat
    cardPending: new Array(POPULATION.factions).fill(null), // the card each seat chose to play
    cardRumors: Array.from({ length: POPULATION.factions }, () => []), // rumor ids planted by cards (for feedback)
    feedback: Array.from({ length: POPULATION.factions }, () => []), // private notes on what your moves did
    turn: 0,
    phase: 'command',
    timer: 0,
    simElapsed: 0,
    acc: 0,
    influence: new Array(POPULATION.factions).fill(0),
    pending: new Array(POPULATION.factions).fill(null), // this turn's submitted orders (null = not yet)
    truth: [], // every order ever given, for the end-of-match reveal (M3)
    recap: null,
    recaps: [],
    highlights: [], // this turn's top moments (with the hidden true cause)
    allHighlights: [], // every turn's highlights, for the end-of-match story
    guesses: new Array(POPULATION.factions).fill(null), // seat -> {highlightId: guessedSeat}
    guessRevealed: false,
    guessResults: [], // after the reveal: [{highlight, byseat: {seat: guess}, correct: {seat: bool}}]
    verbsLastTurn: Array.from({ length: POPULATION.factions }, () => new Set()), // for the Hate cooldown and fatigue
    notoriety: new Array(POPULATION.factions).fill(0), // kills make the town distrust a faction
    points: new Array(POPULATION.factions).fill(0), // +1 per correct guess; breaks ties
    bonusInfluence: new Array(POPULATION.factions).fill(0),
    recorder: cosmetics ? new Recorder(world.villagers.length) : null, // only worth it when someone can watch replays
    simTicks: 0,
    over: false,
    winner: null,
    winReason: '',
    suddenDeath: false,
    eliminated: new Array(POPULATION.factions).fill(false),
    lastDeathTime: new Array(POPULATION.factions).fill(0),
    stats: {
      firstKillTurn: null, firstKilledFaction: null, maxLead: 0, deathsPerTurn: [],
      eliminatedTurn: new Array(POPULATION.factions).fill(null),
      guessRight: new Array(POPULATION.factions).fill(0),
      guessTotal: new Array(POPULATION.factions).fill(0),
    },
  };
  beginTurn(game);
  return game;
}

// ---- Public API ----------------------------------------------------------------

/** A human (or bot) hands in this turn's orders. Returns {ok} or {ok:false, error}. */
/** A human whose faction is gone, while another human is still playing: they haunt the town. */
export function isGhost(game, seat) {
  if (!game.eliminated[seat] || game.seats[seat].kind !== 'human') return false;
  return game.seats.some((s, i) => s.kind === 'human' && !game.eliminated[i]);
}

/** Would these orders (and card) be accepted right now? Changes nothing. */
export function validateSubmission(game, seat, orders, card = null) {
  if (game.phase !== 'command') return { ok: false, error: 'Not the command phase' };
  const ghost = isGhost(game, seat);
  if (game.eliminated[seat] && !ghost) return { ok: false, error: 'You are eliminated' };
  if (game.pending[seat] !== null) return { ok: false, error: 'Already submitted' };
  const check = validateOrders(orders, game.influence[seat], game.world, game.verbsLastTurn[seat], ghost);
  if (!check.ok) return check;
  if (card && ghost) return { ok: false, error: 'Ghosts cannot play cards' };
  return validateCard(game, seat, card);
}

export function submitOrders(game, seat, orders, card = null) {
  const check = validateSubmission(game, seat, orders, card);
  if (!check.ok) return check;
  game.cardPending[seat] = card ? { id: card.id, group: card.group ?? -1, ...(card.place ? { place: card.place } : {}) } : null;
  game.pending[seat] = orders.map((o) => ({
    verb: o.verb, target: o.target ? { ...o.target } : null, strength: o.strength,
    ...(o.subject ? { subject: JSON.parse(JSON.stringify(o.subject)) } : {}),
  }));
  return { ok: true };
}

/**
 * A player's guesses for this turn's highlights: {highlightId: seat 0..3, or -1 for "nobody"}.
 * Leaving a highlight out means "no guess".
 */
export function submitGuesses(game, seat, guesses) {
  if (game.phase !== 'guess' || game.guessRevealed) return { ok: false, error: 'Not the guess phase' };
  if (game.guesses[seat] !== null) return { ok: false, error: 'Already guessed' };
  const clean = {};
  for (const h of game.highlights) {
    const g = guesses?.[h.id];
    if (g === undefined) continue;
    if (!Number.isInteger(g) || g < -1 || g >= POPULATION.factions) return { ok: false, error: 'Bad guess' };
    clean[h.id] = g;
  }
  game.guesses[seat] = clean;
  return { ok: true };
}

/** Advance the game by dt real seconds (the caller multiplies dt for fast-forward). */
export function updateGame(game, dt) {
  switch (game.phase) {
    case 'command':
      game.timer -= dt;
      if (game.timer <= 0 || allSubmitted(game)) endCommand(game);
      break;

    case 'sim':
      game.acc += dt;
      while (game.acc >= TICK && game.phase === 'sim') {
        game.acc -= TICK;
        stepSim(game);
      }
      break;

    case 'recap':
      game.timer -= dt;
      if (game.timer <= 0) endRecap(game);
      break;

    case 'guess':
      game.timer -= dt;
      if (!game.guessRevealed) {
        if (game.timer <= 0 || allGuessed(game)) resolveGuesses(game);
      } else if (game.timer <= 0) {
        nextTurn(game);
      }
      break;
  }
}

/** Skip ahead: the rest of the recap, the guess timer, or the guess reveal. */
export function skipRecap(game) {
  if (game.phase === 'recap') endRecap(game);
  else if (game.phase === 'guess') {
    if (game.guessRevealed) nextTurn(game);
    else resolveGuesses(game);
  }
}

/** Run a whole match with no waiting. Used by tools/simulate.js and tests. */
export function runToEnd(game) {
  while (game.phase !== 'ended') {
    if (game.phase === 'command') updateGame(game, game.commandSeconds); // times out any missing humans
    else if (game.phase === 'recap' || game.phase === 'guess') skipRecap(game);
    else updateGame(game, TICK);
  }
  return game;
}

export const humanSeats = (game) => game.seats.map((s, i) => (s.kind === 'human' ? i : -1)).filter((i) => i >= 0);

// ---- Phases ---------------------------------------------------------------------

function beginTurn(game) {
  const { world } = game;
  game.turn++;
  world.turn = game.turn;
  world.peaceful = game.turn <= TURN.peaceTurns; // the first days are calm: nobody picks a fight
  world.armoryPool = world.armoryPool.map((n) => Math.min(ARMORY.poolSize, n + (game.turn > 1 ? ARMORY.refillPerTurn : 0))); // the armory restocks
  game.phase = 'command';
  game.timer = game.commandSeconds;
  game.simElapsed = 0;
  game.acc = 0;
  game.pending.fill(null);
  game.cardPending.fill(null);
  for (let seat = 0; seat < POPULATION.factions; seat++) {
    game.hand[seat] = game.eliminated[seat] ? [] : dealHand(game);
    game.power[seat] = game.eliminated[seat] || world.peaceful ? 0 : POWERS.perTurn;
    game.feedback[seat] = [];
    game.cardRumors[seat] = [];
  }
  game.suddenDeath = game.turn >= TURN.suddenDeathTurn;
  world.baseTension = (game.turn - 1) * TENSION.basePerTurn + (game.suddenDeath ? TENSION.suddenDeathBase : 0);

  const living = livingByFaction(world);

  // War fever: sudden death, and the final two factions, make enemies hunt each other farther.
  const fever = Math.max(0, game.turn - TURN.suddenDeathTurn + 1) + (factionsAlive(living).length <= 2 ? FEVER.duelPoints : 0);
  world.seekRadius = COMBAT.seekRadius + fever * FEVER.seekPerPoint;

  // The storm closes in from the turn after sudden death begins.
  const late = Math.max(0, game.turn - STORM.lateTurn);
  const shrink = Math.max(late > 0 ? STORM.lateMinSize : STORM.minSize, 1 - STORM.shrinkPerTurn * Math.max(0, game.turn - TURN.suddenDeathTurn) - STORM.lateShrinkPerTurn * late);
  const cx = WORLD.width / 2;
  const cy = WORLD.height / 2;
  const hw = (WORLD.width / 2 - WORLD.margin) * shrink;
  const hh = (WORLD.height / 2 - WORLD.margin) * shrink;
  world.bounds = { x0: cx - hw, y0: cy - hh, x1: cx + hw, y1: cy + hh };
  world.sight = GRIEVANCE.sight + fever * FEVER.sightPerPoint;

  for (let seat = 0; seat < POPULATION.factions; seat++) {
    if (isGhost(game, seat)) game.influence[seat] = GHOST.influence;
    if (game.eliminated[seat]) continue;
    game.influence[seat] = Math.min(INFLUENCE.carryCap, game.influence[seat]) + INFLUENCE.perTurn
      + comebackBonus(living, seat) + game.bonusInfluence[seat];
    game.bonusInfluence[seat] = 0;
  }

  // Bots on Easy get less influence, on Hard more (the one thing a human can't see being different).
  game.seats.forEach((s, seat) => {
    if (s.kind === 'bot' && !game.eliminated[seat]) game.influence[seat] = Math.max(1, game.influence[seat] + (DIFFICULTY[s.difficulty ?? game.difficulty]?.influence ?? 0));
  });

  rollEvent(game); // some dawns bring a town event (after influence, so Market Day counts)

  // Bots decide instantly, with the same order API as humans.
  game.seats.forEach((s, seat) => {
    if (s.kind !== 'bot' || game.eliminated[seat]) return;
    const orders = botDecide(game, seat);
    const result = submitOrders(game, seat, orders, botCard(game, seat));
    if (!result.ok) result.ok = submitOrders(game, seat, orders).ok || submitOrders(game, seat, []).ok; // a bot bug must never stall the match
  });
}

function allSubmitted(game) {
  return game.pending.every((p, seat) => p !== null || (game.eliminated[seat] && !isGhost(game, seat)));
}

function endCommand(game) {
  for (let seat = 0; seat < POPULATION.factions; seat++) {
    if (game.eliminated[seat] && !isGhost(game, seat)) continue;
    const orders = game.pending[seat] ?? []; // timer ran out: nothing submitted
    const cost = orders.reduce((n, o) => n + o.strength, 0);
    game.influence[seat] -= cost;
    const card = game.cardPending[seat];
    game.truth.push({ turn: game.turn, seat, orders, card });
    game.feedback[seat].push(...applyOrders(game.world, seat, orders, game.verbsLastTurn[seat]));
    game.verbsLastTurn[seat] = new Set(orders.map((o) => o.verb)); // remembered for next turn's rules
  }
  // Cards go last, so a Spy sees everyone's orders.
  for (let seat = 0; seat < POPULATION.factions; seat++) {
    const card = game.cardPending[seat];
    if (card && !(game.eliminated[seat] && !isGhost(game, seat))) applyCard(game, seat, card);
  }
  game.phase = 'sim';
  game.simTicks = 0;
  game.recorder?.reset();
  game.recorder?.capture(game.world);
}

function stepSim(game) {
  const { world } = game;
  stepWorld(world, TICK);
  game.simElapsed += TICK;
  if (game.simTicks % 120 === 100) botPowers(game); // bots work their miracles every few seconds
  game.simTicks++;
  if (game.recorder && game.simTicks % REPLAY.everyTicks === 0) game.recorder.capture(world);

  // Track when each faction last lost someone (for the "everyone died" tiebreak).
  const livingNow = livingByFaction(world);
  for (let f = 0; f < POPULATION.factions; f++) {
    if (livingNow[f] < game.livingBefore?.[f]) game.lastDeathTime[f] = world.time;
  }
  game.livingBefore = livingNow;

  const decided = factionsAlive(livingNow).length <= 1;
  if (decided || game.simElapsed >= TURN.simSeconds) endSim(game);
}

function endSim(game) {
  const { world } = game;
  const living = livingByFaction(world);

  world.festivals = [];
  world.bombs = [];

  // Stand everyone down so the town is calm while players plan the next turn.
  for (const v of world.villagers) {
    if (!v.alive) continue;
    v.fx = emptyFx();
    v.carry = null;
    v.carrying = false;
    v.activity = null;
    v.guardBonus = 0;
    v.panic = 0;
    v.vx = 0;
    v.vy = 0;
    v.px = v.x;
    v.py = v.y;
    startIdle(world, v);
  }

  addOutcomeFeedback(game, living);
  const recap = buildRecap(world, game.turn, living);
  game.recap = recap;
  game.recaps.push(recap);

  const { stats } = game;
  stats.deathsPerTurn.push(recap.kills.length);
  if (stats.firstKillTurn === null && recap.kills.length > 0) {
    stats.firstKillTurn = game.turn;
    stats.firstKilledFaction = recap.kills[0].victimFaction;
  }
  const sorted = living.slice().sort((a, b) => b - a);
  stats.maxLead = Math.max(stats.maxLead, sorted[0] - sorted[1]);
  living.forEach((n, f) => {
    if (n === 0 && !game.eliminated[f]) {
      game.eliminated[f] = true;
      stats.eliminatedTurn[f] = game.turn;
    }
  });

  game.guesses.fill(null);
  game.guessRevealed = false;
  game.highlights = buildHighlights(game, game.turn);
  game.allHighlights.push(...game.highlights);

  const result = checkWinner(game);
  if (result.over) {
    game.over = true;
    game.winner = result.winner;
    game.winReason = result.reason;
  }
  game.phase = 'recap';
  game.timer = TURN.recapSeconds;
}

function endRecap(game) {
  if (game.over) {
    game.phase = 'ended';
    return;
  }
  nextTurn(game); // no guessing phase: the news is the end of the turn
}

// Bots guess while the phase is still 'recap', so this bypasses the phase check in submitGuesses.
function submitGuesses0(game, seat, guesses) {
  game.guesses[seat] = guesses;
}

function allGuessed(game) {
  return humanSeats(game).every((seat) => game.guesses[seat] !== null);
}

/** Score everyone's guesses against the hidden truth and show the reveal. */
function resolveGuesses(game) {
  const results = [];
  for (const h of game.highlights) {
    const byseat = {};
    const correct = {};
    game.guesses.forEach((g, seat) => {
      if (g === null || g[h.id] === undefined) return;
      byseat[seat] = g[h.id];
      correct[seat] = g[h.id] === h.truthSeat;
      game.stats.guessTotal[seat]++;
      if (correct[seat]) {
        game.stats.guessRight[seat]++;
        game.points[seat] += TURN.guessReward;
        game.bonusInfluence[seat] += TURN.guessReward;
      }
    });
    results.push({ highlight: h, byseat, correct });
  }
  game.guessResults = results;
  game.guessRevealed = true;
  game.timer = TURN.guessRevealSeconds;
}

function nextTurn(game) {
  nextTurnDrift(game);
  beginTurn(game);
}

/**
 * Killing makes the whole town trust you less: each turn, every kill adds to the killer
 * faction's notoriety (which fades), and everyone else's opinion of that faction drops.
 * This is the built-in cost of spamming violence.
 */
function applyNotoriety(game) {
  const { world } = game;
  const kills = new Array(POPULATION.factions).fill(0);
  for (const e of world.events) if (e.type === 'kill' && e.turn === game.turn && e.killerFaction >= 0) kills[e.killerFaction]++;

  for (let f = 0; f < POPULATION.factions; f++) {
    game.notoriety[f] = game.notoriety[f] * NOTORIETY.decay + kills[f] * NOTORIETY.perKill;
    const drop = Math.min(NOTORIETY.opinionCap, game.notoriety[f] * NOTORIETY.opinionPer);
    if (drop <= 0) continue;
    for (const v of world.villagers) {
      if (!v.alive || v.faction === f) continue;
      v.opinion[f] = Math.max(-100, v.opinion[f] - drop);
      if (v.faction === -1) v.trust[f] = Math.max(0, v.trust[f] - game.notoriety[f] * NOTORIETY.trustPer);
    }
  }
}

/** Between turns: tempers calm down a bit; from the sudden-death turn on they don't. */
function nextTurnDrift(game) {
  const { world } = game;
  // Rest between turns fades once the war is on: no supplies, no time to recover. (Without this, two
  // wounded survivors can heal faster than they can hurt each other and the match never ends.)
  const heal = TURN.healPerTurn * Math.max(0, 1 - TURN.healFadePerTurn * Math.max(0, game.turn - TURN.suddenDeathTurn + 1));
  applyNotoriety(game);
  applyLoyalty(game);
  for (const v of world.villagers) {
    if (!v.alive) continue;
    v.mood = world.rng() * 2 - 1; // a fresh good or bad day for everyone
    v.aggression += (v.baseAggression - v.aggression) * TURN.recovery;
    v.courage += (v.baseCourage - v.courage) * TURN.recovery;
    v.hp = Math.min(100, v.hp + heal);
  }
  if (game.turn + 1 >= TURN.suddenDeathTurn) applySuddenDeath(world, game.turn + 1);
}

/** Private notes after each turn: what your orders and cards actually did. */
function addOutcomeFeedback(game, living) {
  const { world } = game;
  const events = world.events.filter((e) => e.turn === game.turn);
  for (let seat = 0; seat < POPULATION.factions; seat++) {
    if (game.eliminated[seat]) continue;
    const note = game.feedback[seat];
    const armed = events.filter((e) => e.type === 'arm' && world.villagers[e.villagerId].faction === seat).length;
    const mine = (game.truth.find((t) => t.turn === game.turn && t.seat === seat)?.orders ?? []);
    if (mine.some((o) => o.verb === 'arm')) note.push(armed ? `Arm up: ${armed} of your villagers got a weapon from the armory.` : 'Arm up: nobody got a weapon (the armory was empty or they were too far).');
    for (const id of game.cardRumors[seat]) {
      const believers = world.villagers.filter((v) => v.alive && v.believed.some((r) => r.id === id)).length;
      note.push(`Your rumor is believed by ${believers} villagers.`);
    }
    const kills = events.filter((e) => e.type === 'kill');
    const won = kills.filter((e) => e.killerFaction === seat).length;
    const lost = kills.filter((e) => e.victimFaction === seat).length;
    if (won || lost) note.push(`Your faction killed ${won} and lost ${lost} this turn.`);
    else note.push('No blood was shed by or against your faction.');
    if (game.power[seat] > 0) note.push(`You left ${game.power[seat]} power unused.`);
  }
}
