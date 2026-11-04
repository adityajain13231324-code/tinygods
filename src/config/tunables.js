// ALL balance / feel numbers live here. No magic numbers in the rest of the code.

export const WORLD = {
  width: 1920, // a roomy town, so fights don't happen on every corner
  height: 1080,
  margin: 70, // villagers stay this far from the edge (they are also nudged away from walls, see WALL)
};

export const SIM = {
  tickHz: 20, // fixed sim step, same as the future host-authoritative multiplayer rate
  maxFrameSeconds: 0.25, // clamp huge frame gaps (tab was in background) so the sim doesn't spiral
};

export const POPULATION = {
  factions: 4,
  perFaction: 12,
  neutrals: 12,
};

// Starting stats (courage/aggression are random inside the range).
export const STATS = {
  hp: 100,
  courage: [40, 70],
  aggression: [15, 40],
  opinionOwn: 60, // how much they like their own group at the start
  opinionOther: [0, 10], // mild liking for everyone else
  trust: 0.3, // how much neutrals believe a player at the start
  minStat: 5, // courage never drops below this
};

// Walls: villagers are gently pushed off the edge of the map so nobody gets pinned in a corner.
export const WALL = { push: 110, reach: 150 };

export const VILLAGER = {
  radius: 15, // body size in world px
  walkSpeed: [40, 60], // px/sec, random per villager
  acceleration: 6, // how fast velocity chases the desired velocity
  separation: 26, // villagers closer than this push each other apart (below talkDistance)
  separationForce: 70,
};

export const BRAIN = {
  thinkInterval: 0.5, // seconds between decisions (staggered per villager)
  // Chances when a villager has nothing to do (should sum to 1).
  chooseWander: 0.45,
  chooseSocialize: 0.38,
  chooseIdle: 0.17,
  idleSeconds: [1.5, 4],
  talkSeconds: [3, 7],
  socializeRange: 260, // how far away a villager will look for someone to chat with
  talkDistance: 30, // stand this close to talk
  arriveDistance: 8,
  loveChance: 0.7, // chatting with a friend shows heart eyes this often
  strangerLoveChance: 0.1, // ...and chatting with anyone else, this often
  loveOrderSocializeBonus: 0.25, // villagers under a "love" order chat this much more
  seekGiveUpSeconds: 12,
  argueOpinion: -20, // chatting with someone from a group you like less than this turns into an argument
  mournSeconds: 4, // friends of a victim stand in shock this long before anything else
  suspicionRadius: 110,
  suspicionOpinion: -25,
  // Plaza and Well are the most popular places to hang out.
  placeWeights: { plaza: 2.5, well: 1.5, park: 2, market: 2, houses: 1.5, armory: 0.5, pond: 2, farm: 1.5, bakery: 2 },
};

// ---- Things to do at places -----------------------------------------------
// Arriving somewhere, a villager usually does something there for a few seconds. Most
// pastimes calm tempers or heal a little, so where people spend their time matters (and
// "Follow <place>" becomes a real tactic).
export const ACTIVITY = {
  chance: 0.8, // chance of doing the place's activity on arrival
  seconds: [6, 13],
  byPlace: { plaza: 'dance', park: 'rest', market: 'shop', well: 'pray', houses: 'rest', armory: 'train', pond: 'fish', farm: 'garden', bakery: 'eat' },
  // per half-second "think", while doing it:
  calm: { dance: 1.5, rest: 1.0, pray: 1.0, fish: 2.5, garden: 1.0 }, // extra grievance fading, per second
  heal: { rest: 1, garden: 1.5, eat: 3 }, // hp
  fearRelief: { pray: 2 },
  courageGain: { train: 0.4 },
  courageCap: 10, // training never lifts courage more than this above its base
};

// ---- Bonds: two villagers who get attached ----------------------------------
// Created by Love orders (and Festivals, and the odd hug). Partners stay together, defend
// each other, join each other's fights, never fight each other, and take each other's
// death very, very badly.
export const BOND = {
  perStrength: 1, // a Love order of strength S creates 1 + S*perStrength new pairs
  minOpinion: -30, // the other side must not hate you to accept
  opinionBoost: 30, // each partner's opinion of the other's group
  hugChance: 0.03, // a hug between two free friends can turn into a bond
  breakBelow: -40, // opinion of the partner's group this low ends it
  followDistance: 90,
  stayDistance: 45,
  defendRadius: 150,
  joinRadius: 200,
  guardDamage: 0.88, // damage taken when the partner is near
  teamDamage: 1.12, // damage dealt when the partner fights the same target
  teamRadius: 100,
  griefSeconds: 8,
  griefGrievance: 1.5, // x tolerance, against whoever killed the partner
  griefAggression: 15,
  griefOpinion: 30,
};

// Festival: a party at a place. Everyone nearby calms down and new friendships form.
export const FESTIVAL = {
  calmPerStrength: 2.0, // extra grievance fading per second per strength, for everyone there
  bondChance: 0.0035, // per half-second per unbonded villager there, per strength (a few pairs per party)
  bondRadius: 70,
};

// ---- Weapons -------------------------------------------------------------
export const WEAPONS = {
  none: { damage: 8, range: 40 }, // fists
  pan: { damage: 15, range: 40 },
  bat: { damage: 25, range: 40 },
  knife: { damage: 30, range: 60 },
  gun: { damage: 55, range: 160, maxAmmo: 3, panicRadius: 160 },
  // Shotgun: short range, almost never misses, hurts whoever is standing next to the target
  // too, only two shells, and very loud. Carried only by the rare "gunslinger".
  shotgun: { damage: 42, range: 110, maxAmmo: 2, panicRadius: 230, minHit: 0.8, splashRadius: 45, splashFraction: 0.5 },
};

export const FIREARMS = ['gun', 'shotgun'];

// Of 60 villagers (the rest have fists). Gunslingers get the shotguns separately (see TRAITS).
export const WEAPON_START = { pan: 0, bat: 0, knife: 0, gun: 0 }; // nobody starts armed: weapons come only from the armory (Arm up)
export const MAX_GUNS_PER_FACTION = 2;
export const ARMORY = { poolSize: 6, refillPerTurn: 3, weapons: ['pan', 'bat', 'bat', 'knife', 'knife', 'gun'], gunslingerWeapon: 'shotgun' }; // the shelf; gunslingers take the shotgun

// ---- Personalities ---------------------------------------------------------
// Every villager gets one temperament (or none) and a personal tolerance. Temperaments are
// hidden until the villager shows them (the hover card reveals what you have seen).
export const TRAITS = {
  gunslingers: 3, // exactly this many, always from different groups, each with a shotgun
  chances: { brawler: 0.16, coward: 0.15, peacemaker: 0.07, medic: 0.06, bodyguard: 0.08, wildcard: 0.06 },
  caps: { peacemaker: 4, medic: 4 },
  tolerance: [0.65, 1.55], // everyone's personal multiplier before their trait
  mods: {
    // tolerance: multiplier on the grievance needed to fight; others are flat additions
    brawler: { tolerance: 0.5, aggression: 20, courage: 8 },
    coward: { tolerance: 1.4, courage: -22 },
    gunslinger: { tolerance: 0.9, courage: 18 },
    peacemaker: { tolerance: 1.6, aggression: -15 },
    medic: { tolerance: 2.0, aggression: -20 },
    bodyguard: { courage: 12 },
    wildcard: {},
  },
  coward: { fleeBonus: 25, panicMul: 1.5 }, // flees much sooner, stays scared longer
  brawler: { fleePenalty: 20 }, // hard to scare off
  steady: ['gunslinger', 'bodyguard'], // not rattled by gunshots
  medic: { healRadius: 80, healPerThink: 6, seekRadius: 220, seekBelowHp: 75 },
  peacemaker: { radius: 150, breakChance: 0.4, cooldown: 7 },
  bodyguard: { radius: 130 },
  wildcard: { moodRange: [0.4, 2.2] }, // grievance builds at a random speed each moment
};

// ---- Conflict ladder -------------------------------------------------------
// Fights don't start the instant someone is hated. Grievance builds up between two
// villagers (faster the more one dislikes the other's group, and the closer they stand),
// fades with time, and climbs a ladder:
//   annoyed -> ARGUE (fraction of tolerance) -> scuffle with fists (FIGHT) -> melee weapons
//   (WEAPON) -> firearms (GUN). Along the way anyone can calm down.
export const GRIEVANCE = {
  base: 100, // tolerance 100 = "average"; each villager multiplies this
  rate: 20, // grievance per second at maximum dislike
  dislikeFrom: 15, // opinion must be below -15 to annoy anyone
  sight: 100, // only people this close annoy each other
  decayPerSecond: 0.5,
  moodSwing: 0.4, // a good or bad day changes how fast grievance builds by +/- this
  argueAt: 0.5, // fractions of the villager's tolerance
  fightAt: 1.0,
  weaponAt: 1.45,
  gunAt: 1.9,
  argueSeconds: [2.5, 4.5],
  argueHeat: 7, // arguing itself adds this much grievance per second
  argueRange: 90,
  calmChance: 0.13, // per half-second while arguing
  friendCalm: 0.2,
  peacemakerCalm: 0.35,
  cowardCalm: 0.2,
  scuffleHp: 70, // below this hp a fist fight gets serious or breaks off
  disengageChance: 0.5,
  relief: 0.55, // calming down wipes this fraction of the grievance
  truceSeconds: 10, // after calming down they ignore each other this long
  calmSeconds: 4, // ...and look for no new fight at all for this long
  hitGain: 0.3, // each hit taken adds this fraction of tolerance as grievance
  hitFloor: 1.05, // being hit makes you at least this fed up with the attacker
  witnessGain: 0.6, // seeing a friend killed
};

// The closing storm: once sudden death starts, the safe area shrinks every turn toward the middle
// of town, so the last survivors are forced together and a match always ends.
export const STORM = {
  shrinkPerTurn: 0.09, // fraction of the map lost per turn, from the turn after sudden death begins
  minSize: 0.45, // the safe area never gets smaller than this fraction of the map...
  lateTurn: 13, // ...until a long match drags on: from this turn the storm tightens faster
  lateShrinkPerTurn: 0.07,
  lateMinSize: 0.3,
};

// War fever: late in the match (sudden death) and whenever only two factions are left, the
// town is so on edge that enemies sense each other from farther and hunt across the map.
// Without this the last few survivors on a big map would never meet and the match would drag.
export const FEVER = {
  seekPerPoint: 340, // extra "go looking for trouble" radius per fever point
  sightPerPoint: 220, // extra radius within which grievance builds
  duelPoints: 6, // extra fever points when only two factions are left
};

// Ghosts: an eliminated human, while other humans are still playing, may whisper one mild order a
// turn to the town (it can only move neutrals and rumors, since a ghost has no faction).
export const GHOST = { influence: 1, verbs: ['love', 'fear', 'praise', 'accuse', 'festival'] };

// Rumors (see sim/rumors.js)
export const RUMOR = {
  seeds: 6, // first listeners = this + strength
  baseBelief: 0.3, // belief chance = base + the listener's trust in the player (+ temperament), capped
  passChance: 0.55, // a believer repeats it to someone they start chatting with
  expireTurns: 2, // a rumor stops spreading after this many turns
  opinionBase: 10, // a believed rumor shifts opinion of the target by base + perStrength * S
  opinionPerStrength: 8,
};

// Loyalty: villagers are not property. Faith in your own faction can erode, and then they
// start disliking their own neighbours and may defect (see sim/loyalty.js).
export const LOYALTY = {
  gentleAggression: 30, // villagers calmer than this count as gentle souls
  partnerPull: 7, // per turn: bonded to someone from another faction
  warWeary: 5, // gentle villagers when their faction ordered Hate last turn
  neglect: 7, // everyone, when their leader gave no orders at all last turn (leaders who do nothing lose their people)
  shameFrom: 3, // notoriety above this makes gentle villagers ashamed...
  shame: 1.4, // ...by this much per point (x1.4 for gentle, x0.5 for the rest)
  badDay: 3,
  goodDay: -2,
  wobble: 2.5,
  recovery: 3, // content villagers regain this much faith per turn
  defectBelow: -15, // faith under this and they may leave
  defectChance: 0.55,
  maxPerFactionPerTurn: 2,
  joinAbove: 20, // a defector joins the group they like best, if they like it at least this much
  newcomerOpinion: 60,
  resentment: -30,
  recruitAbove: 55, // a neutral who likes a faction this much may join it
  recruitChance: 0.3,
  recruitMax: 2, // per faction per turn
};

// Notoriety: killing makes the whole town trust your faction less (anti-spam).
export const NOTORIETY = {
  perKill: 1,
  decay: 0.7, // each turn
  opinionPer: 0.8, // every other group's opinion of you drops this much per point, each turn
  opinionCap: 10,
  trustPer: 0.015, // neutrals trust you less too
};

// ---- Fighting ------------------------------------------------------------
export const COMBAT = {
  fistShoveSpeed: 220, // a brawler's shove: a short stumble (about 70 px), not a separation
  fistShove: 0.10, // in a fist fight, this share of moves is a shove (no damage, big push)
  fistShout: 0.03, // ...and this share is a shout that rattles whoever is listening
  screamDamage: 14, // a hit this hard makes the victim scream and the onlookers flinch
  shoutRadius: 130,
  duelInterval: 0.9, // seconds between swings
  hitBase: 0.5,
  hitSpread: 200, // (courage difference) / this shifts the hit chance
  hitMin: 0.15,
  hitMax: 0.85,
  aggressionDamageDiv: 20,
  damageRoll: 5, // + random(0..5)
  courageDefenceDiv: 25,

  provocation: 40, // attack someone whose group you like less than -this
  attackRoll: 30, // aggression + random(0..30) must beat courage * attackCourageFactor
  attackCourageFactor: 0.6,
  seekRadius: 200, // how far a hostile villager will go looking for trouble
  giveUpRadius: 260,
  grudgeSeconds: 20, // after being hit, you will fight that group's members this long
  hitOpinionDrop: 4,
  hitFear: 3,
  alertRadius: 120, // an attacker this close makes you fight or flee

  fleeThreshold: 2,
  fleeHpWeight: 0.7,
  fleeCourageWeight: 0.5,
  fleeArmedBonus: 10, // armed villagers flee a bit less
  fleeSeconds: [4, 7],
  woundedHp: 35, // below this hp a villager never starts a fight, it keeps its distance and heals
  fleeSpeedMul: 1.4, // a runner starts at this speed...
  exhaustedAt: 0.55, // after this fraction of a run the runner is spent...
  corneredDistance: 75, // ...and if the chaser is this close, they turn and fight
  fleeTiredMul: 0.8, // ...and has slowed to this by the end of the run (stamina)
  panicSeconds: 4, // a gunshot makes everyone close by run

  witnessRadius: 150,
  witnessLikeThreshold: 15, // witness liked the victim's group if opinion is above this
  witnessOpinionHit: 25,
  witnessFear: 15,
  witnessAggression: 10,
  witnessTrustHit: 0.05, // neutrals who see your faction kill trust you less
};

// ---- Orders (the filter) ---------------------------------------------------
// Strength S is 1 (mild), 2 (strong) or 3 (extreme); every effect scales with S.
export const ORDERS = {
  armPerStrength: 3, // villagers sent to the armory per point of Arm up strength
  hateOpinion: 20,
  hateAggression: 8,
  loveOpinion: 25,
  loveAggression: 5,
  fearAmount: 25,
  fearCourage: 6,
  protectReduction: 0.12, // damage taken falls by this fraction per strength level while guarding (never immunity)
  protectReductionCap: 0.5,
  protectRadius: 120,
  protectStay: 60,
  avoidDistance: 150,
  avoidPush: 1.2, // how hard avoiders steer away (times walk speed)
  scareReach: 80, // scarers walk up to this close to their victim, then glare
  scareFear: 5, // fear a victim gains per second-ish (x strength) from a glaring scarer
  scareCourage: 1.2, // courage lost per scare tick (x strength)
  scareFlee: 0.1, // chance per tick (x strength) that the victim bolts
  scareGrudge: 2.5, // ...and how much more they resent the scarer (bullying has a price)
  shoveReach: 46, // shovers walk up to this close
  shoveEvery: 1.6, // seconds between one shover's shoves (divided by strength)
  shoveSpeed: 520, // knockback speed of a shove (about 160 px of travel)
  shoveGrievance: 0.3, // fraction of the victim's tolerance added: being pushed around makes enemies
  seizeJoin: 44, // grabbers must be this close to lift someone
  seizeSeconds: 28, // the longest a drag lasts
  seizeDunk: 5, // hp lost when dragged to the pond and dunked
  ambushReach: 1.15, // an ambusher jumps anyone this close to the place's edge (x radius)
  armAggression: 5,
  trustMatchGain: 0.05, // neutrals trust you more when your order matches how they feel
  trustMismatchLoss: 0.03,
  maxStrength: 3,
  maxOrdersPerTurn: 3,
  maxHatePerTurn: 2,
  hateCooldownTurns: 1, // after ordering hate you must skip it for this many turns
  fatigue: 0.6, // using the same verb two turns in a row works at 60%
};

export const INFLUENCE = {
  perTurn: 5,
  carryCap: 3,
  comebackBonus: 2, // for a faction with fewer than half the average living count
  comebackFraction: 0.5,
};

// ---- Turns -----------------------------------------------------------------
export const TURN = {
  commandSeconds: 30,
  simSeconds: 32,
  recapSeconds: 10,
  guessSeconds: 14,
  guessRevealSeconds: 5,
  guessReward: 1, // a correct guess: +1 point (tiebreaker) and +1 influence next turn
  // A match ends when one faction is left. This high limit only exists so a stalemate can
  // never run forever; if it is ever reached, the highest score wins (survivors matter
  // most, but rival kills and correct guesses count, so pure hiding does not win):
  maxTurns: 20,
  peaceTurns: 2, // days 1 and 2 are peaceful: nobody starts a fight, and violent orders and miracles are locked
  suddenDeathTurn: 4, // from here on the whole town gets angrier every turn, so matches do end
  capScore: { perLiving: 1, perRivalKill: 0.8, perPoint: 0.5 },
  suddenDeathAggression: 15,
  suddenDeathCourage: -10,
  suddenDeathOpinion: 20, // opinion of every other group drops this much per sudden-death turn
  recovery: 0.25, // each turn, aggression and courage move 25% back toward their base
  healFadePerTurn: 0.22, // from sudden death on, the between-turn healing shrinks by this fraction each turn
  healPerTurn: 25, // hp every survivor recovers between turns, so wars don't snowball on old wounds
};

// Highlights: the 3 most dramatic moments of a turn, shown in the recap and guessed on.
export const HIGHLIGHT = {
  max: 3,
  clusterGap: 8, // kills in the same place within this many sim seconds count as one moment
  lead: 3, // replay starts this many sim seconds before the first kill...
  tail: 1.5, // ...and ends this long after the last
  killBase: 10,
  perWitness: 2,
  gunBonus: 8,
  wipeBonus: 40, // the last member of a faction fell
  firstBloodBonus: 50,
  shotBase: 8, // a gunfight with no kill can still be a highlight
  perShot: 3,
};

export const REPLAY = {
  everyTicks: 2, // record a frame every 2 sim ticks (10 per second)
  zoom: 2.0,
};

export const TENSION = {
  perFighter: 5, // each villager currently fighting adds this
  perFleer: 2,
  perGlarer: 2.5, // someone glaring at an enemy, about to throw the first punch, already raises the bar
  glareSeconds: [2.8, 0.5], // how long they scowl before swinging: calm town .. town at the edge (tension 0 .. 100)
  killDrama: 12, // a kill spikes the tension by this, fading out...
  gunshotDrama: 15,
  dramaFadeSeconds: 6, // ...over about this long
  easeRate: 1.5,
  settleRate: 0.8,
  basePerTurn: 2, // background tension grows each turn
  suddenDeathBase: 25,
};

export const DRAMA = {
  // Camera cuts and the news board (render side only, never changes the sim).
  firstKillZoom: 1.9, // gentler than before: you should still see the surroundings
  zoom: 1.6,
  firstKillHold: 3.8, // seconds of real time
  hold: 3.0,
  slowMo: 0.35, // sim speed while the camera is zoomed in
  dimOthers: 0.4, // everyone except the two people involved fades to this opacity during a cut
  dimTown: 0.35, // the town itself darkens by this much, so the action stands out
  focusScreenY: 0.62, // where the zoomed-in action sits vertically (0 = top, 1 = bottom), below the news board
  cutCooldown: 9, // sim seconds between ordinary camera cuts
  brawlKills: 3, // this many kills close together in time and place is a "brawl"
  brawlWindow: 8, // sim seconds
  boardSeconds: 4.2,
  shakeGun: 7, // screen shake in px
  shakeKill: 3,
};

export const ART = {
  outlineWidth: 3,
  shadowAlpha: 0.18,
  idleBobAmount: 0.04, // scale y 1.00 -> 1.04
  idleBobSpeed: 2.2,
  walkStepSpeed: 11, // squash/stretch cycles per second
  walkSquash: 0.05, // x 1.05 / y 0.95
  walkTilt: 0.07, // radians
  talkTurnSeconds: 1.6, // chatting villagers take turns showing a speech bubble this long
  swingSeconds: 0.3,
  lungePixels: 7,
  hitFlashSeconds: 0.2,
};

// ---- Cards and god powers ---------------------------------------------------------
// Each dawn you are dealt a hand of cards and may play one (free). While the town acts you
// have a few Power points to spend on live miracles.
export const CARDS = { handSize: 4 };
export const POWERS = {
  perTurn: 3, // points refill every turn; unspent points are lost. Locked while the town is at peace.
  lightning: { cost: 2, radius: 125, damage: 4, calmSeconds: 10 },
  miracle: { cost: 1, heal: 45, opinion: 15 },
  whisper: { cost: 1, shift: 30 },
  fog: { cost: 1, radius: 125, seconds: 14 },
  gust: { cost: 1, push: 640 },
  earthquake: { cost: 2, shove: 380, damage: 3 },
  tornado: { cost: 2, radius: 170, pull: 520 },
  fireball: { cost: 2, radius: 85, minDamage: 12, maxDamage: 38 },
  rain: { cost: 1, radius: 210, calmSeconds: 9 },
  charm: { cost: 1, opinion: 45, truceSeconds: 25 },
  enrage: { cost: 1 },
  aegis: { cost: 1, seconds: 16 },
  disarm: { cost: 2, radius: 115 },
  sleep: { cost: 1, seconds: 8 },
};

// How hard the bots play. Each bot seat can have its own (seat.difficulty), else the game's.
export const DIFFICULTY = {
  easy: { label: 'Easy', influence: -1, orderSkip: 0.4, maxStrength: 2, cardRate: 0.3, powerSkip: 0.8, offence: false, blurb: 'Bots hesitate, skip orders and rarely use cards or miracles.' },
  normal: { label: 'Normal', influence: 0, orderSkip: 0, maxStrength: 3, cardRate: 0.7, powerSkip: 0.35, offence: true, blurb: 'A fair fight. Bots follow their personalities.' },
  hard: { label: 'Hard', extraArm: true, influence: 2, orderSkip: 0, maxStrength: 3, cardRate: 0.95, powerSkip: 0.1, offence: true, blurb: 'Bots never waste a turn, play cards nearly every dawn and cast miracles all the time.' },
};

export const EVENTS = {
  startTurn: 3, // no events during the peaceful days
  chance: 0.6, // chance of an event at each later dawn
};
