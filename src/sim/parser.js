import { FACTIONS, GROUP_NAMES, PLACES } from '../config/content.js';
import { CARD_DEFS } from './cards.js';
import { POWER_DEFS, hotspot } from './powers.js';
import { describeOrder } from './orders.js';

// The typing box, no AI involved: plain word lists, phrase rules and a little grammar.
// A sentence is split into clauses ("send three of my villagers to the armory and arm up"),
// and each clause becomes ONE real action, an order, a card or a god power. Orders can carry a
// subject (who should do it: a number of villagers, a temperament, or villagers by name).
// The result always goes through the same validation as any other order, so typing can never
// break the rules. If nothing makes sense, the player is told why and offered phrases to try.

// ---- vocabulary ----------------------------------------------------------------------

const ACTIONS = {
  // orders
  hate: ['hate', 'despise', 'loathe', 'punish', 'war', 'revenge', 'avenge', 'resent', 'curse'],
  assault: ['attack', 'assault', 'fight', 'charge', 'invade', 'storm', 'kill', 'destroy', 'crush', 'eliminate', 'murder', 'strike', 'hurt', 'beat', 'smash', 'slaughter', 'wipe', 'rush'],
  love: ['love', 'like', 'befriend', 'friend', 'bond', 'hug', 'ally', 'adore', 'kiss', 'unite', 'forgive', 'reconcile', 'cherish', 'peace', 'respect', 'welcome'],
  fear: ['fear', 'afraid', 'dread', 'feared', 'fearful'],
  scare: ['scare', 'scared', 'terrify', 'terrified', 'frighten', 'frightened', 'threaten', 'spook', 'intimidate', 'horrify', 'haunt', 'bully', 'menace', 'harass', 'torment', 'pester', 'unnerve', 'rattle'],
  shove: ['shove', 'jostle', 'elbow', 'barge', 'manhandle', 'shoulder'],
  seize: ['seize', 'grab', 'drag', 'haul', 'lasso', 'collar'],
  scatter: ['scatter', 'disperse', 'vanish', 'disappear'],
  ambush: ['ambush', 'lurk', 'stakeout', 'waylay'],
  protect: ['protect', 'guard', 'defend', 'bodyguard', 'safeguard', 'shelter', 'secure', 'fortify', 'cover'],
  avoid: ['avoid', 'dodge', 'evade', 'shun', 'ignore', 'escape', 'flee', 'ditch'],
  go: ['go', 'head', 'march', 'gather', 'assemble', 'meet', 'hide', 'hiding', 'retreat', 'station', 'stay', 'camp', 'wait', 'visit', 'relocate', 'walk', 'run', 'regroup'],
  escort: ['escort', 'follow', 'accompany', 'shadow', 'trail', 'tail', 'stick', 'join'],
  hunt: ['hunt', 'assassinate', 'chase', 'track', 'stalk', 'pursue', 'target'],
  standdown: ['standdown', 'relax', 'surrender', 'settle', 'behave'],
  accuse: ['accuse', 'blame', 'rumor', 'rumour', 'gossip', 'slander', 'frame', 'smear', 'lie', 'lies', 'allege', 'expose', 'snitch'],
  praise: ['praise', 'compliment', 'flatter', 'honor', 'honour', 'hail', 'applaud', 'admire', 'glorify', 'thank', 'toast'],
  festival: ['festival', 'party', 'feast', 'celebrate', 'dance', 'picnic', 'parade', 'concert', 'carnival', 'banquet', 'fair', 'fiesta'],
  arm: ['arm', 'weapons', 'weapon', 'guns', 'gun', 'equip', 'rearm', 'arsenal', 'sword', 'swords', 'bats', 'knives', 'loot'],
  // cards
  forged: ['forge', 'forged', 'letter', 'fake', 'counterfeit', 'falsify', 'fabricate'],
  prophecy: ['prophecy', 'prophesy', 'foretell', 'predict', 'doom', 'omen', 'oracle'],
  alibi: ['alibi', 'innocent', 'clean', 'clear', 'cleanse', 'launder', 'repent', 'apologize', 'apologise', 'sorry'],
  spy: ['spy', 'peek', 'reveal', 'scout', 'investigate', 'snoop', 'sneak', 'eavesdrop', 'discover'],
  census: ['census', 'count', 'tally', 'inventory', 'survey', 'status', 'report'],
  bribe: ['bribe', 'pay', 'buy', 'gift', 'money', 'coins', 'gold', 'tip', 'woo'],
  recruit: ['recruit', 'convert', 'draft', 'enlist', 'hire', 'adopt', 'poach', 'headhunt'],
  matchmaker: ['matchmaker', 'matchmake', 'marry', 'wed', 'date', 'introduce', 'romance', 'matchmaking'],
  treaty: ['treaty', 'alliance', 'pact', 'deal', 'negotiate', 'armistice'],
  kidnap: ['kidnap', 'abduct', 'capture', 'snatch', 'imprison', 'jail', 'arrest', 'detain'],
  warchest: ['warchest', 'treasury', 'savings', 'save', 'stash', 'hoard', 'invest', 'fund', 'funds'],
  bomb: ['bomb', 'dynamite', 'explosive', 'explosives', 'tnt', 'boom', 'detonate', 'timebomb', 'explode', 'trap', 'grenade'],
  raid: ['raid', 'ransack', 'steal', 'sabotage', 'plunder', 'pillage'],
  spoiled: ['poison', 'spoil', 'spoiled', 'sicken', 'rotten', 'plague', 'contaminate', 'infect'],
  alarm: ['alarm', 'siren', 'bells', 'panic', 'stampede', 'scatter', 'startle'],
  rally: ['rally', 'inspire', 'motivate', 'cheer', 'encourage', 'boost', 'empower', 'strengthen', 'bless', 'energize', 'pump'],
  medic: ['medic', 'hospital', 'nurse', 'ambulance', 'infirmary', 'bandage', 'bandages', 'clinic'],
  truce: ['truce', 'ceasefire', 'bell', 'soothe', 'pacify', 'lull', 'calm'],
  // god powers
  lightning: ['lightning', 'thunder', 'zap', 'smite', 'bolt', 'storm', 'shock', 'thunderbolt', 'electrocute', 'blast'],
  earthquake: ['earthquake', 'quake', 'tremor', 'shake', 'rumble', 'tremble'],
  tornado: ['tornado', 'twister', 'cyclone', 'whirlwind', 'vortex', 'hurricane'],
  fireball: ['fireball', 'fire', 'burn', 'flame', 'meteor', 'blaze', 'incinerate', 'ignite', 'scorch', 'napalm'],
  rain: ['rain', 'downpour', 'shower', 'drizzle', 'flood', 'deluge'],
  charm: ['charm', 'seduce', 'enchant', 'hypnotize', 'mesmerize', 'bewitch', 'captivate'],
  enrage: ['enrage', 'provoke', 'incite', 'taunt', 'anger', 'madden', 'infuriate', 'goad', 'berserk'],
  aegis: ['aegis', 'ward', 'bubble', 'barrier', 'forcefield', 'invulnerable', 'immunity', 'shield'],
  disarm: ['disarm', 'unarm', 'confiscate', 'strip'],
  sleep: ['sleep', 'nap', 'stun', 'freeze', 'paralyze', 'petrify', 'knockout', 'snooze', 'doze'],
  miracle: ['heal', 'miracle', 'cure', 'mend', 'restore', 'revive', 'treat', 'rescue', 'help'],
  whisper: ['whisper', 'convince', 'tell', 'hint', 'suggest', 'murmur', 'nudge', 'sway', 'influence', 'talk', 'persuade'],
  fog: ['fog', 'mist', 'cloud', 'smoke', 'blur', 'haze', 'veil', 'darkness', 'blind'],
  gust: ['gust', 'wind', 'blow', 'push', 'send', 'lure', 'guide', 'bring', 'drag', 'carry', 'summon', 'teleport', 'steer', 'herd', 'move'],
};

// When a sentence holds words for several actions, the earlier in this list wins.
const PRIORITY = ['standdown', 'scatter', 'ambush', 'seize', 'shove', 'bomb', 'kidnap', 'warchest', 'forged', 'bribe', 'prophecy', 'raid', 'spoiled', 'matchmaker', 'treaty', 'alarm', 'recruit', 'medic', 'census',
  'truce', 'spy', 'alibi', 'earthquake', 'tornado', 'fireball', 'disarm', 'rain', 'charm', 'enrage', 'aegis', 'sleep', 'lightning', 'miracle', 'whisper', 'fog', 'gust', 'rally', 'hunt', 'escort', 'avoid', 'festival', 'arm', 'protect',
  'go', 'scare', 'assault', 'hate', 'love', 'fear', 'accuse', 'praise'];

const ORDER_VERBS = new Set(['assault', 'hate', 'love', 'fear', 'scare', 'shove', 'seize', 'scatter', 'ambush', 'protect', 'avoid', 'go', 'escort', 'hunt', 'standdown', 'accuse', 'praise', 'festival', 'arm']);
const VERB_ID = { go: 'follow' }; // typed "go" is the game's Go-to-a-place order

const GROUP_WORDS = {
  0: ['embers', 'ember', 'red', 'reds', 'triangles', 'triangle', 'fire'],
  1: ['tides', 'tide', 'blue', 'blues', 'waves', 'wave', 'circles'],
  2: ['sprouts', 'sprout', 'green', 'greens', 'leaf', 'leaves', 'plants', 'squares'],
  3: ['sparks', 'spark', 'yellow', 'yellows', 'stars', 'star'],
  4: ['neutral', 'neutrals', 'townsfolk', 'grey', 'gray', 'bystanders', 'civilians'],
};
const OWN_WORDS = ['me', 'my', 'our', 'us', 'mine', 'ours', 'myself', 'ourselves', 'we'];
const PLACE_WORDS = {
  plaza: ['plaza', 'square', 'centre', 'center', 'fountain', 'middle'],
  park: ['park', 'garden', 'gardens', 'grove'],
  market: ['market', 'shop', 'shops', 'bazaar', 'stalls', 'store'],
  well: ['well', 'wishing'],
  houses: ['houses', 'house', 'homes', 'home', 'streets', 'neighborhood', 'indoors'],
  armory: ['armory', 'armoury', 'barracks', 'arsenal'],
  pond: ['pond', 'lake', 'water', 'dock', 'duck', 'ducks'],
  farm: ['farm', 'field', 'fields', 'barn', 'windmill', 'crops'],
  bakery: ['bakery', 'bakers', 'baker', 'bread', 'oven'],
};
const TRAIT_WORDS = {
  brawler: ['brawler', 'brawlers', 'fighter', 'fighters', 'bruiser', 'bruisers', 'hothead', 'hotheads'],
  coward: ['coward', 'cowards', 'scaredy', 'chicken', 'chickens', 'timid'],
  medic: ['medic', 'medics', 'healer', 'healers', 'doctor', 'doctors'],
  peacemaker: ['peacemaker', 'peacemakers', 'diplomat', 'diplomats', 'mediator', 'mediators'],
  bodyguard: ['bodyguard', 'bodyguards', 'guards', 'protectors'],
  gunslinger: ['gunslinger', 'gunslingers', 'sheriff', 'sheriffs', 'shooter', 'shooters', 'marksman'],
  wildcard: ['wildcard', 'wildcards', 'oddball', 'oddballs'],
  armed: ['armed', 'weaponed'],
  unarmed: ['unarmed', 'weaponless', 'defenseless', 'defenceless'],
};
const NUMBER_WORDS = { one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, eleven: 11, twelve: 12, couple: 2, few: 3, several: 4, half: 6, both: 2 };
const PEOPLE_WORDS = ['villagers', 'villager', 'people', 'folks', 'folk', 'guys', 'members', 'citizens', 'men', 'fighters', 'ones', 'soldiers', 'others', 'of', 'person', 'lads', 'troops'];

const STRONG = ['very', 'really', 'extremely', 'totally', 'completely', 'all', 'maximum', 'max', 'utterly', 'absolutely', 'fiercely', 'massive', 'huge', 'hard'];
const HARSH = ['destroy', 'crush', 'kill', 'eliminate', 'murder', 'terrify', 'terrified', 'terrifying', 'assassinate'];
const MILD = ['little', 'slightly', 'bit', 'somewhat', 'gently', 'mildly', 'softly', 'small', 'tiny', 'barely'];
const GOOD_WORDS = ['good', 'nice', 'trust', 'trustworthy', 'like', 'love', 'kind', 'friendly', 'safe', 'honest', 'loyal'];

const STOP = new Set(['the', 'a', 'an', 'to', 'of', 'on', 'at', 'in', 'with', 'for', 'and', 'then', 'please', 'god', 'let', 'make', 'that', 'is', 'are', 'them', 'they', 'it', 'should', 'would', 'i', 'want', 'wanna', 'can', 'you', 'now', 'just', 'some', 'about', 'toward', 'towards', 'into', 'around', 'near', 'by', 'from', 'so', 'be', 'get', 'have', 'ask', 'order', 'orders', 'told', 'over', 'out', 'up']);

// Multi-word phrases become one keyword before the sentence is read.
const PHRASES = [
  // "grab X and drag them to the pond" is one order, not two
  [/\b(grab|seize|snatch|collar|catch|lasso)\b([^,;.]*?)\band\b(?= (?:drag|haul|carry|take|bring|lead|march|walk))/g, ' $1$2 '],
  // push people away / take someone away
  [/push (?=.{0,24}\b(?:away|back|around|off)\b)|push around|shove away|drive (?=(?:\w+ ){0,2}(?:off|away|back)\b)|chase (?=(?:\w+ ){0,2}(?:off|away)\b)|force (?:them )?back|muscle (?=(?:\w+ ){0,2}out\b)|elbow (?:them )?aside/g, ' shove '],
  [/(?:take|lead|walk|haul|carry|drag|march|bring) (?:\w+ ){0,2}?(?:away|off)\b|carry off|take (?:\w+ )?(?:with|along)|pick (?:\w+ )?up and (?:carry|take)|drag (?:\w+ )?(?:to|off|away)|round (?:\w+ )?up/g, ' seize '],
  // shouting: part of scaring
  [/(?:shout|yell|scream|holler|bark|bellow|roar|heckle|boo) (?:at|down)|boo\b|shout down|scream at/g, ' scare '],
  // everybody runs from everybody (before the plain "away from X" rule below)
  [/(?:run(?:ning)?|flee(?:ing)?|get|stay|keep|hide|stay out of|keep out of|steer clear of|escape)(?: right)?(?: away| off| out)? from (?:every(?:one|body)|all|anyone|anybody|each other|the others|other villagers|other people|the rest|all of them|all the others)/g, ' scatter '],
  [/run(?:ning)? (?:away|off)\b(?! from)|run for (?:it|your lives|the hills|cover)|head for the hills|make a run for it|get out of (?:here|town)|scatter everyone|every(?:one|body) (?:run|flee|hide)|save yourselves|every man for himself/g, ' scatter '],
  // ambush
  [/lie in wait|wait in ambush|set (?:an? )?ambush|lay (?:an? )?ambush|lurk (?:at|in|near|around)|stake ?out|jump (?:anyone|everyone|whoever|anybody)|hide and wait|wait and (?:jump|pounce)/g, ' ambush '],
  // "scare" is something you do TO them: walk up and frighten them
  [/(?:stare|glare|growl|snarl|jeer|sneer|hiss) at|stare down|sneak up on|creep up on|loom over|get in (?:the )?faces? of|make (?:them|the (\w+)(?: ones)?) (?:scared|afraid|terrified|nervous|run)|put the fear of god into|rattle (?:the )?cages? of|shake up|rough up/g, ' scare $1 '],
  // being scared OF someone (the real "fear" order)
  [/(?:be |are |get |feel |become |stay )?(?:afraid|fearful|frightened|wary|nervous) (?:of|around)|(?:be )?scared of|fear them|watch out for|be (?:careful|cautious) (?:of|around|with)/g, ' fear '],
  // picking fights, many ways
  [/pick (?:a )?fights? with|go after|take on|teach (?=.{0,20}a lesson)|stand up to|give (?=.{0,12}a beating)|put (?=.{0,12}in (?:their|its) place)|settle (?:the )?score with|have it out with|show (?=.{0,12}who(?:'s| is) boss)|declare war on|go to war with|march on|throw hands with|duke it out with/g, ' attack '],
  // friendly, many ways
  [/make friends? with|get along with|be (?:nice|kind|friendly|polite) to|play nice with|buddy up with|team up with|hang out with|cozy up to|warm up to|extend (?:a |an )?(?:olive branch|hand) to|bury the hatchet with|shake hands with|invite (?:them|the \w+) (?:over|in)|make nice with|reach out to/g, ' love '],
  [/cheer for|root for|speak well of|sing (?:the )?praises of|say nice things about|big up|tell everyone how (?:great|good|nice|wonderful)/g, ' praise '],
  [/(?:talk|speak) (?:badly|ill|trash|smack) (?:about|of)|trash[- ]?talk|bad[- ]?mouth|smear campaign|spread (?:nasty )?(?:lies|gossip) about|tell everyone (?:that )?the \w+ (?:are|is) (?:evil|bad|dangerous|awful)/g, ' accuse '],
  // staying out of trouble
  [/leave (?:the )?(\w+)(?: ones| folks| lot)? alone|let (?:the )?(\w+) be|give (?:the )?(\w+) (?:some )?space|keep (?:your|a) distance from|have nothing to do with|don'?t (?:go near|get near|bother|talk to)|steer clear of/g, ' avoid $1$2$3 '],
  [/take cover|batten down|barricade|lock (?:the |your )?doors?|lock down|board up|shelter in place|go underground|go into hiding|duck and cover|keep (?:your )?heads? down/g, ' hide '],
  [/guard duty|be on (?:the )?watch|keep watch|stand watch|keep an eye (?:on|out for)|watch out for my|have (?:their|each other'?s?|our) backs?|cover (?:my|our|their) backs?|on patrol|patrol (?:the|around)/g, ' protect '],
  [/(?:hurry|dash|sprint|race|speed|scurry|dart|rush|bolt) (?:over |back |off )?(?:to|toward|towards|into|for)\b/g, ' go '],
  [/(?:get|go) (?:back )?(?:to|in)(?:side)? (?:the )?(?:houses|homes?)/g, ' hide '],
  [/stand(?:ing)? down|stop (?:the )?fight(?:ing)?|put (?:their |your |the )?(?:weapons?|guns?|fists?) (?:down|away)|hold (?:your )?fire|lay low|cease (?:the )?fire|no more fighting|don'?t fight|do not fight|keep the peace/g, ' standdown '],
  [/keep away from|stay away from|steer clear of|stay clear of|keep (?:out of|clear of)|away from/g, ' avoid '],
  [/look(?:ing)? after|watch(?:ing)? over|take care of|stand guard|keep safe/g, ' protect '],
  [/(?:head|walk|run|march|go|move|gather|assemble|meet|rush|sneak|retreat|relocate) (?:over |back )?(?:to|at|toward|towards|into|in)\b|hang out (?:at|in)/g, ' go '],
  [/blow(?:ing)? (?:it |them |this |that )?up|set (?:a |an )?(?:trap|bomb)/g, ' bomb '],
  [/arm up|get (?:their |some )?weapons|pick up (?:weapons|guns)/g, ' arm '],
  [/throw a party|have a party|hold a party|party at|celebrate at/g, ' festival '],
  [/spread (?:a )?(?:rumou?r|lie)s?|start (?:a )?(?:rumou?r)/g, ' accuse '],
];

// ---- helpers -------------------------------------------------------------------------

function editDistance(a, b) {
  if (Math.abs(a.length - b.length) > 2) return 3;
  const dp = Array.from({ length: a.length + 1 }, (_, i) => [i, ...new Array(b.length).fill(0)]);
  for (let j = 1; j <= b.length; j++) dp[0][j] = j;
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      dp[i][j] = Math.min(dp[i - 1][j] + 1, dp[i][j - 1] + 1, dp[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    }
  }
  return dp[a.length][b.length];
}

/** Does this word match a word on the list: exactly, by shared stem, or one or two typos away? */
function matches(word, list) {
  for (const w of list) {
    if (word === w) return true;
    if (word.length >= 4 && w.length >= 4 && (w.startsWith(word) || word.startsWith(w)) && Math.abs(w.length - word.length) <= 3) return true;
    if (word.length >= 5 && w.length >= 5) {
      if (editDistance(word, w) <= 1) return true;
      if (word.slice(0, 2) === w.slice(0, 2) && editDistance(word, w) <= 2) return true;
      let k = 0;
      while (k < word.length && k < w.length && word[k] === w[k]) k++;
      if (k >= 5) return true; // same stem: terrified / terrify
    }
  }
  return false;
}

const isMod = (t) => matches(t, STRONG) || matches(t, MILD);

function findAction(tokens, phase) {
  const found = new Set();
  for (const t of tokens) {
    if (isMod(t) && t !== 'hard') continue; // 'really', 'little'...: strength words, not actions
    for (const [id, words] of Object.entries(ACTIONS)) if (matches(t, words)) found.add(id);
  }
  // 'send' and 'move' are Gust in the town phase, but plain "go there" orders at dawn.
  if (phase === 'command' && found.has('gust') && !tokens.some((t) => ['gust', 'wind', 'blow'].includes(t))) {
    found.delete('gust');
    found.add('go');
  }
  for (const id of PRIORITY) if (found.has(id)) return id;
  return null;
}

function findGroup(tokens, seat) {
  // A named faction beats "my/us": "my brawlers attack the Tides" is about the Tides.
  for (const t of tokens) {
    for (const [g, words] of Object.entries(GROUP_WORDS)) if (matches(t, words)) return Number(g);
  }
  return tokens.some((t) => OWN_WORDS.includes(t)) ? seat : null;
}
function findPlace(tokens) {
  for (const t of tokens) for (const [id, words] of Object.entries(PLACE_WORDS)) if (matches(t, words)) return id;
  return null;
}
/** Villagers named in the sentence, in the order they appear. */
function findNamed(tokens, game) {
  const out = [];
  for (const t of tokens) {
    if (t.length < 3 || STOP.has(t)) continue;
    const v = game.world.villagers.find((x) => x.alive && x.name.toLowerCase() === t);
    if (v && !out.includes(v)) out.push(v);
  }
  return out;
}
function findCount(tokens) {
  for (let i = 0; i < tokens.length; i++) {
    const t = tokens[i];
    const n = /^\d+$/.test(t) ? Number(t) : NUMBER_WORDS[t];
    if (!n) continue;
    const next = tokens.slice(i + 1, i + 4);
    if (/^\d+$/.test(t) || next.some((w) => PEOPLE_WORDS.includes(w)) || ['few', 'couple', 'several', 'half', 'both'].includes(t)) return Math.min(12, n);
  }
  return null;
}
function findTrait(tokens) {
  for (const t of tokens) for (const [trait, words] of Object.entries(TRAIT_WORDS)) if (words.includes(t)) return trait;
  return null;
}
const strengthOf = (tokens, fallback) => (tokens.some((t) => matches(t, STRONG) || HARSH.includes(t)) ? 3 : tokens.some((t) => matches(t, MILD)) ? 1 : fallback);

// ---- the parser ----------------------------------------------------------------------

/**
 * @returns {{ok: true, actions: object[]} | {ok: false, message: string, suggestions: string[]}}
 */
export function parseCommand(text, game, seat) {
  let s = ` ${String(text ?? '').toLowerCase()} `;
  for (const [re, to] of PHRASES) s = s.replace(re, to);
  // "Olive and Mia" are two names in one clause, not two clauses.
  const names = game.world.villagers.filter((v) => v.alive).map((v) => v.name.toLowerCase());
  const joined = new RegExp(`\\b(${names.join('|')})(?:\\s*,\\s*|\\s+and\\s+)(?=${names.map((n) => `${n}\\b`).join('|')})`, 'g');
  s = s.replace(joined, '$1 + ');
  const clauses = s.split(/\s*(?:,|;|\band\b|\bthen\b|\balso\b|\bafter that\b|\.)\s*/).map((c) => c.trim()).filter(Boolean);
  if (clauses.length === 0) return fail('Type what you want to happen.', game, seat);
  const actions = [];
  let problem = null;
  for (const clause of clauses.slice(0, 4)) {
    const r = parseClause(clause, game, seat);
    if (!r.ok) {
      problem ??= { ...r, clause };
      continue;
    }
    actions.push(r.action);
  }
  if (!actions.length) return problem;
  return problem ? { ok: true, actions, problem } : { ok: true, actions };
}

/** "x3", "strength 2", "level 3", "3 strength", or trailing "!!!" set the strength outright. */
const STRENGTH_RE = /\bx\s?[1-3]\b|(?:strength|level|force|power|intensity)\s*(?:of\s*)?[1-3]\b|\b[1-3]\s*(?:strength|level|force|intensity)\b|!{1,3}\s*$/g;
function explicitStrength(clause) {
  const m = clause.match(/\bx\s?([1-3])\b|(?:strength|level|force|power|intensity)\s*(?:of\s*)?([1-3])\b|\b([1-3])\s*(?:strength|level|force|intensity)\b|(!{1,3})\s*$/);
  if (!m) return null;
  return Number(m[1] ?? m[2] ?? m[3] ?? m[4].length);
}

function parseClause(rawClause, game, seat) {
  const explicit = explicitStrength(rawClause);
  const clause = rawClause.replace(STRENGTH_RE, ' ').trim();
  const raw = clause.replace(/[^a-z0-9' -]/g, ' ').split(/\s+/).filter(Boolean);
  const tokens = raw.filter((t) => !STOP.has(t) || OWN_WORDS.includes(t));
  const id = findAction(tokens.length ? tokens : raw, game.phase);
  if (!id) {
    // No verb: if they named something, offer things to DO with it; otherwise explain and offer a mix.
    const g = findGroup(raw, seat);
    const pl = findPlace(raw);
    const nm = findNamed(raw, game)[0] ?? null;
    if (nm) return fail(`${nm.name} is one of ${nm.faction === seat ? 'yours' : nm.faction >= 0 ? `the ${FACTIONS[nm.faction].name}` : 'the neutrals'}. What should happen?`, game, seat, { about: { name: nm } });
    if (g !== null && g !== seat) return fail(`What should happen with the ${GROUP_NAMES[g]}?`, game, seat, { about: { group: g } });
    if (pl) return fail(`What should happen at the ${PLACES.find((p) => p.id === pl).name}?`, game, seat, { about: { place: pl } });
    return fail(`The gods did not understand "${clause}". Try one of these:`, game, seat);
  }
  const kind = ORDER_VERBS.has(id) ? 'order' : CARD_DEFS[id] ? 'card' : 'power';

  const named = findNamed(raw, game);
  const ownNamed = named.filter((v) => v.faction === seat);
  const otherNamed = named.filter((v) => v.faction !== seat);
  const group = findGroup(raw, seat);
  const place = findPlace(raw);

  if (kind === 'order') return parseOrder(id, clause, raw, { group, place, named, ownNamed, otherNamed, explicit }, game, seat);

  if (kind === 'card') {
    const def = CARD_DEFS[id];
    if (def.needs === 'place') {
      if (!place) return fail(`Where should the ${def.name} go?`, game, seat, { card: id });
      return { ok: true, action: { kind: 'card', card: { id, place }, label: def.name } };
    }
    if (def.needs === 'group') {
      const g = group ?? (named.length ? (named[0].faction >= 0 ? named[0].faction : 4) : null);
      if (g === null) return fail(`Which faction should the ${def.name} be aimed at?`, game, seat, { card: id });
      return { ok: true, action: { kind: 'card', card: { id, group: g }, label: def.name } };
    }
    return { ok: true, action: { kind: 'card', card: { id }, label: def.name } };
  }

  // god powers
  const def = POWER_DEFS[id];
  const spec = { id, label: def.name };
  const villager = named[0] ?? null;
  if (def.needs === 'point') {
    if (place) {
      const p = game.world.places.find((q) => q.id === place);
      spec.x = p.x;
      spec.y = p.y;
    } else if (villager) spec.villagerId = villager.id;
    else if (group !== null) spec.group = group;
    else spec.hotspot = true;
  } else if (def.needs === 'villager') {
    spec.villagerId = villager?.id;
    spec.group = group;
  } else if (id === 'whisper') {
    spec.villagerId = villager?.id;
    spec.group = group;
    spec.good = raw.some((t) => matches(t, GOOD_WORDS)) && !raw.some((t) => ['distrust', 'untrustworthy', 'bad', 'evil', 'dangerous'].includes(t));
    if (group === null) return fail('Whisper about which faction?', game, seat, { verb: 'whisper' });
  } else if (id === 'gust') {
    spec.villagerId = villager?.id;
    spec.placeId = place ?? 'plaza';
    spec.group = group;
  }
  return { ok: true, action: { kind: 'power', power: spec, label: def.name } };
}

/** An order: who (subject), does what (verb), to whom or where (target), how hard (strength). */
function parseOrder(id, clause, raw, f, game, seat) {
  const { group, place, named, ownNamed, otherNamed, explicit } = f;
  
  // Who should do it?
  let subject = null;
  const count = findCount(raw);
  const trait = findTrait(raw);
  if (trait) subject = { kind: 'trait', trait };
  else if (count) subject = { kind: 'count', n: count };

  // Verb-specific targets.
  let verb = id;
  let target = null;
  let dest = null; // where a seized villager is dragged
  if (id === 'hunt' || ((id === 'hate' || id === 'assault') && (group === null || group === seat) && otherNamed.length)) {
    verb = 'hunt';
    const prey = otherNamed[0];
    if (!prey) {
      if (group !== null && group !== seat) verb = 'assault'; // "hunt the tides" means send fighters after them
      else return fail('Hunt whom? Pick someone from another faction:', game, seat, { verb: 'hunt' });
    } else target = { kind: 'villager', id: prey.id, name: prey.name };
    if (verb === 'hunt' && ownNamed.length) subject = { kind: 'villagers', ids: ownNamed.map((v) => v.id), names: ownNamed.map((v) => v.name) };
  } else if (id === 'escort') {
    const buddy = named.length >= 2 ? named[named.length - 1] : named[0];
    if (!buddy) {
      if (place) verb = 'go'; // "follow the pond" really means go there
      else return fail('Follow whom? Pick a villager, or say where to go:', game, seat, { verb: 'escort' });
    } else {
      target = { kind: 'villager', id: buddy.id, name: buddy.name };
      const who = ownNamed.filter((v) => v !== buddy);
      if (who.length) subject = { kind: 'villagers', ids: who.map((v) => v.id), names: who.map((v) => v.name) };
    }
  }

  if (verb === 'go') {
    const hiding = raw.some((t) => ['hide', 'hiding', 'shelter', 'retreat', 'indoors'].includes(t));
    target = { kind: 'place', id: place ?? (hiding ? 'houses' : 'plaza') };
  } else if (verb === 'seize') {
    const prey = otherNamed[0];
    if (!prey) return fail('Seize whom? Pick someone from another faction:', game, seat, { verb: 'seize' });
    target = { kind: 'villager', id: prey.id, name: prey.name };
    if (ownNamed.length && !subject) subject = { kind: 'villagers', ids: ownNamed.map((v) => v.id), names: ownNamed.map((v) => v.name) };
    if (place) dest = place;
  } else if (verb === 'scatter') {
    target = null;
  } else if (verb === 'ambush') {
    if (!place) return fail('Ambush where? Pick a place:', game, seat, { verb: 'ambush' });
    target = { kind: 'place', id: place };
  } else if (verb === 'festival') {
    target = { kind: 'place', id: place ?? 'plaza' };
  } else if (verb === 'protect') {
    target = place && group === null ? { kind: 'place', id: place } : { kind: 'group', id: group ?? seat };
  } else if (verb === 'avoid') {
    if (place && group === null) target = { kind: 'place', id: place };
    else if (group !== null) target = { kind: 'group', id: group };
    else if (otherNamed.length) target = { kind: 'group', id: otherNamed[0].faction >= 0 ? otherNamed[0].faction : 4 };
    else return fail('Avoid whom or what? Pick one:', game, seat, { verb: 'avoid' });
  } else if (verb === 'assault' && place && (group === null || group === seat)) {
    target = { kind: 'place', id: place }; // "kill everyone at the houses"
  } else if (['hate', 'love', 'fear', 'scare', 'shove', 'accuse', 'praise', 'assault'].includes(verb)) {
    let g = group;
    if (g === null && named.length) g = named[0].faction >= 0 ? named[0].faction : 4;
    if (g === null) return fail(`${VERB_WORD[verb]} whom? Pick a faction:`, game, seat, { verb });
    if (g === seat && ['hate', 'accuse', 'fear', 'scare', 'shove', 'assault'].includes(verb)) return fail(`You cannot ${VERB_WORD[verb].toLowerCase()} your own faction. Pick a rival:`, game, seat, { verb });
    target = { kind: 'group', id: g };
  }
  if (ownNamed.length && !subject && verb !== 'hunt' && verb !== 'escort') subject = { kind: 'villagers', ids: ownNamed.map((v) => v.id), names: ownNamed.map((v) => v.name) };

  // Cheap by default when it is a nudge to a few people or plain behaviour; strong words raise it.
  const base = 3; // typed orders start at full strength; the dial or words like "slightly" lower it
  const strength = explicit ?? strengthOf(raw, base);

  const order = { verb: VERB_ID[verb] ?? verb, target, strength };
  if (subject) order.subject = subject;
  if (dest) order.dest = dest;
  return { ok: true, action: { kind: 'order', order, label: describeOrder(order) } };
}

// ---- failure with something to try ----------------------------------------------------

const VERB_WORD = { hate: 'Hate', love: 'Love', fear: 'Fear', shove: 'Shove', scare: 'Scare', accuse: 'Accuse', praise: 'Praise', assault: 'Attack' };
const VERB_SENTENCE = {
  hate: (t) => `hate the ${t}`, love: (t) => `love the ${t}`, fear: (t) => `be afraid of the ${t}`, scare: (t) => `scare the ${t}`, shove: (t) => `push the ${t} away`, accuse: (t) => `accuse the ${t}`,
  praise: (t) => `praise the ${t}`, assault: (t) => `attack the ${t}`, avoid: (t) => `stay away from the ${t}`, protect: (t) => `guard the ${t}`,
};

const pickMany = (list, n, offset) => {
  const out = [];
  for (let i = 0; i < list.length && out.length < n; i++) {
    const x = list[(i + offset) % list.length];
    if (!out.includes(x)) out.push(x);
  }
  return out;
};

/**
 * Say what went wrong and offer sentences that would work, built from the real game: actual
 * villager names, factions that are still alive, places. The offered sentences rotate so
 * the same few never repeat, and when the player typed half a sentence they finish it.
 */
function fail(message, game, seat, ctx = {}) {
  game.suggestRound = (game.suggestRound ?? 0) + 1;
  const round = game.suggestRound;
  const world = game.world;
  const living = [0, 1, 2, 3].map((f) => world.villagers.filter((v) => v.alive && v.faction === f).length);
  const rivals = [0, 1, 2, 3].filter((f) => f !== seat && living[f] > 0);
  const rName = (f) => FACTIONS[f].name;
  const places = PLACES.map((p) => p.name);
  const mine = world.villagers.filter((v) => v.alive && v.faction === seat);
  // Enemy villagers from different factions, so "hunt" offers real choices, not three names from one side.
  const foes = rivals.map((f) => {
    const vs = world.villagers.filter((v) => v.alive && v.faction === f);
    return vs.length ? vs[(round + f) % vs.length] : null;
  }).filter(Boolean);
  const myName = mine.length ? mine[(round * 3) % mine.length].name : 'Olive';
  const foe = (i) => foes[i % Math.max(1, foes.length)]?.name ?? 'Mia';
  const place = (i) => places[(round + i * 3) % places.length];
  const rv = (i) => rName(rivals[i % Math.max(1, rivals.length)] ?? (seat + 1) % 4);

  let list = [];
  if (ctx.verb === 'hunt') {
    list = foes.map((v) => `hunt ${v.name}`);
    list.push(`send three villagers to hunt ${foe(0)}`);
  } else if (ctx.verb === 'escort') {
    list = [`have ${myName} follow ${foe(0)}`, `follow ${myName}`, `send everyone to the ${place(0)}`, `have ${myName} follow ${foe(1)}`];
  } else if (ctx.verb === 'seize') {
    list = foes.map((v) => `grab ${v.name} and drag them to the ${place(0)}`);
    list.push(`two villagers take ${foe(0)} away`);
  } else if (ctx.verb === 'ambush') {
    list = [0, 1, 2, 3].map((i) => `ambush at the ${place(i)}`);
  } else if (ctx.verb === 'whisper') {
    list = rivals.map((f) => `whisper that the ${rName(f)} are dangerous`);
  } else if (ctx.verb) {
    const make = VERB_SENTENCE[ctx.verb];
    list = make ? rivals.map((f) => make(rName(f))) : [];
    if (ctx.verb === 'avoid') list.push(`stay away from the ${place(0)}`);
  } else if (ctx.card) {
    const def = CARD_DEFS[ctx.card];
    const word = { bomb: 'plant a time bomb at', forged: 'forge a letter against', prophecy: 'prophesy doom for', spy: 'spy on', raid: 'raid', spoiled: 'poison', matchmaker: 'matchmake with', treaty: 'make a treaty with', alarm: 'ring a false alarm on' }[ctx.card];
    list = def.needs === 'place' ? [0, 1, 2, 3].map((i) => `${word} the ${place(i)}`) : rivals.map((f) => `${word} the ${rName(f)}`);
  } else if (ctx.about?.name) {
    const n = ctx.about.name;
    list = n.faction === seat ? [`send ${n.name} to the ${place(0)}`, `have ${n.name} follow ${foe(0)}`, `have ${n.name} hunt ${foe(1)}`, `${n.name} stand down`]
      : [`hunt ${n.name}`, `have ${myName} follow ${n.name}`, `whisper to ${n.name} that the ${rv(0)} are dangerous`, `heal ${n.name}`];
  } else if (ctx.about?.group !== undefined) {
    const t = rName(ctx.about.group);
    list = [`attack the ${t}`, `scare the ${t}`, `love the ${t}`, `accuse the ${t}`, `spy on the ${t}`, `make a treaty with the ${t}`].map((s, i) => (ctx.about.group > 3 ? s.replace(/spy on|make a treaty with/, 'praise') : s));
  } else if (ctx.about?.place) {
    const pn = PLACES.find((p) => p.id === ctx.about.place).name;
    list = [`send three villagers to the ${pn}`, `plant a time bomb at the ${pn}`, `party at the ${pn}`, `guard the ${pn}`, `stay away from the ${pn}`];
  }

  // A rotating mix so the box always has fresh ideas, never the same four.
  const bank = game.phase === 'sim'
    ? [`lightning on the ${place(0)}`, 'heal my weakest', `fog on the ${place(1)}`, `whisper that the ${rv(0)} are dangerous`, `blow ${myName} to the ${place(2)}`, `lightning on the ${rv(1)}`, 'fog', `heal ${myName}`]
    : [`scare the ${rv(0)}`, `attack the ${rv(1)}`, `hunt ${foe(0)}`, `send three villagers to the ${place(0)}`, `have ${myName} follow ${foe(1)}`, 'arm up', 'everyone stand down',
      `forge a letter against the ${rv(0)}`, `plant a time bomb at the ${place(1)}`, `love the ${rv(1)} and praise us`, `party at the ${place(2)}`, 'hide in the houses', `guard the ${place(3)}`,
      `my brawlers attack the ${rv(0)}`, `run away from everyone`, `ambush at the ${place(2)}`, `bully the ${rv(1)}`, `push the ${rv(0)} away`, `grab ${foe(0)} and drag them to the pond`, `spy on the ${rv(1)}`, `hate the ${rv(0)} really hard`, `accuse the ${rv(1)}`, 'recruit a neutral', `raid the ${rv(0)} armory`];
  const suggestions = [...list];
  for (const s of pickMany(bank, 8, round * 5)) if (suggestions.length < Math.max(4, list.length ? 5 : 4) && !suggestions.includes(s)) suggestions.push(s);
  return { ok: false, message, suggestions: suggestions.slice(0, 6) };
}

// ---- turning a parsed power into a real cast -----------------------------------------

/**
 * Fill in anything the player left out ("heal my weakest", "lightning" with no spot) with the
 * obvious choice, then hand back exact arguments for castPower.
 * @returns {{ok: true, id: string, args: object} | {ok: false, error: string}}
 */
export function resolvePower(game, seat, spec) {
  const { world } = game;
  const alive = world.villagers.filter((v) => v.alive);
  const groupOfV = (v) => (v.faction >= 0 ? v.faction : 4);
  const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
  switch (spec.id) {
    case 'lightning':
    case 'fog': {
      if (Number.isFinite(spec.x)) return { ok: true, id: spec.id, args: { x: spec.x, y: spec.y } };
      const v = spec.villagerId !== undefined ? world.villagers[spec.villagerId] : null;
      if (v) return { ok: true, id: spec.id, args: { x: v.x, y: v.y } };
      if (spec.group !== undefined && spec.group !== null) {
        const members = alive.filter((q) => groupOfV(q) === spec.group);
        if (!members.length) return { ok: false, error: 'Nobody from that group is left.' };
        const best = members.map((m) => ({ m, n: members.filter((o) => dist(o, m) < 100).length })).sort((a, b) => b.n - a.n)[0].m;
        return { ok: true, id: spec.id, args: { x: best.x, y: best.y } };
      }
      const spot = hotspot(world);
      if (!spot) return { ok: false, error: 'There is no fight to stop right now. Name a place or a faction.' };
      return { ok: true, id: spec.id, args: { x: spot.x, y: spot.y } };
    }
    case 'rain':
    case 'tornado':
    case 'fireball':
    case 'disarm': {
      if (Number.isFinite(spec.x)) return { ok: true, id: spec.id, args: { x: spec.x, y: spec.y } };
      const v = spec.villagerId !== undefined ? world.villagers[spec.villagerId] : null;
      if (v) return { ok: true, id: spec.id, args: { x: v.x, y: v.y } };
      const wanted = spec.group !== undefined && spec.group !== null ? spec.group : null;
      // Fireballs and tornadoes want crowds of the other side; rain and disarm want the fight.
      const pool = alive.filter((q) => (wanted !== null ? groupOfV(q) === wanted : spec.id === 'fireball' || spec.id === 'tornado' ? q.faction !== seat : true));
      if (pool.length && wanted !== null || spec.id === 'fireball' || spec.id === 'tornado') {
        if (!pool.length) return { ok: false, error: 'Nobody there to hit.' };
        const best = pool.map((m) => ({ m, n: pool.filter((o) => dist(o, m) < 100).length })).sort((a, b) => b.n - a.n)[0].m;
        return { ok: true, id: spec.id, args: { x: best.x, y: best.y } };
      }
      const spot = hotspot(world);
      if (!spot) return { ok: false, error: 'There is no fight right now. Name a place or a faction.' };
      return { ok: true, id: spec.id, args: { x: spot.x, y: spot.y } };
    }
    case 'earthquake':
      return { ok: true, id: 'earthquake', args: {} };
    case 'aegis':
    case 'charm':
    case 'enrage':
    case 'sleep': {
      let v = spec.villagerId !== undefined ? world.villagers[spec.villagerId] : null;
      if (!v) {
        const inGroup = (q) => (spec.group !== null && spec.group !== undefined ? groupOfV(q) === spec.group : null);
        if (spec.id === 'aegis') v = alive.filter((q) => inGroup(q) ?? q.faction === seat).sort((a, b) => a.hp - b.hp)[0];
        else if (spec.id === 'sleep') v = alive.filter((q) => inGroup(q) ?? q.faction !== seat).sort((a, b) => (b.state === 'attack') - (a.state === 'attack') || b.aggression - a.aggression)[0];
        else v = alive.filter((q) => inGroup(q) ?? q.faction !== seat).sort((a, b) => b.aggression - a.aggression)[0];
      }
      if (!v) return { ok: false, error: 'Nobody fits.' };
      return { ok: true, id: spec.id, args: { villagerId: v.id } };
    }
    case 'miracle': {
      let v = spec.villagerId !== undefined ? world.villagers[spec.villagerId] : null;
      if (!v) {
        const pool = alive.filter((q) => (spec.group !== null && spec.group !== undefined ? groupOfV(q) === spec.group : q.faction === seat));
        v = pool.sort((a, b) => a.hp - b.hp)[0];
      }
      if (!v) return { ok: false, error: 'Nobody to heal.' };
      return { ok: true, id: 'miracle', args: { villagerId: v.id } };
    }
    case 'whisper': {
      let v = spec.villagerId !== undefined ? world.villagers[spec.villagerId] : null;
      if (!v) {
        const pool = alive.filter((q) => groupOfV(q) !== spec.group);
        v = pool.sort((a, b) => b.aggression - a.aggression)[0];
      }
      if (!v) return { ok: false, error: 'Nobody to whisper to.' };
      return { ok: true, id: 'whisper', args: { villagerId: v.id, group: spec.group, good: spec.good } };
    }
    case 'gust': {
      let v = spec.villagerId !== undefined ? world.villagers[spec.villagerId] : null;
      if (!v) {
        const pool = alive.filter((q) => (spec.group !== null && spec.group !== undefined ? groupOfV(q) === spec.group : q.faction === seat));
        v = pool.find((q) => q.state === 'attack') ?? pool[0];
      }
      if (!v) return { ok: false, error: 'Nobody to blow around.' };
      return { ok: true, id: 'gust', args: { villagerId: v.id, placeId: spec.placeId ?? 'plaza' } };
    }
  }
  return { ok: false, error: 'Unknown power' };
}
