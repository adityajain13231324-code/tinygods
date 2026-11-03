// What villagers say. Pure flavour: nothing here changes the simulation.
//
// A line is chosen from several pools, mixed by weight:
//   - the speaker's FACTION voice (Embers are fiery, Tides patient, Sprouts stubborn, Sparks jokey)
//   - TEMPLATES that name the speaker's faction ({me}) and who they are talking about ({them})
//   - their TEMPERAMENT's voice, once revealed
//   - generic small talk
// Which category is used comes from what they are doing, and "stance" comes from what they
// actually feel (their opinions of the other factions), so after you order hatred, your people
// really do start talking about the Tides.

import { GROUP_NAMES } from './content.js';

export const LINES = {
  chat: [
    'Lovely day, isn\'t it?', 'Have you tried the bakery?', 'My feet are killing me.', 'The market has new stalls.',
    'Did you sleep well?', 'Can\'t complain.', 'The well water tastes odd lately.', 'Look at those clouds.',
    'Good weather for a walk.', 'I lost my hat again.', 'The pond is so still today.', 'My cousin says hello.',
    'I love this town.', 'I could eat a whole loaf.', 'Quiet today, hm?', 'Got any plans?',
    'Did you see the ducks?', 'The windmill squeaks at night.', 'Bread smells good today.',
  ],
  chatTense: [
    'People are on edge lately.', 'Something\'s off in town.', 'Keep your voice down.', 'Lock your door tonight.',
    'Did you hear shouting?', 'I don\'t trust anyone anymore.', 'This can\'t end well.', 'Who started all this?',
    'Stay close to me today.', 'Everyone is armed these days.',
  ],
  hostile: [],
  love: [
    'You make my day.', 'Stay with me?', 'I\'m so glad I met you.', 'Walk with me?', 'You\'re my favourite!',
    'I saved you a seat.', 'My heart does a flip.', 'Let\'s never part.', 'You\'re wonderful.',
  ],
  argue: [
    'You always do that!', 'Say that again!', 'I\'ve had enough of you!', 'Not another word!', 'Back off!',
    'Who do you think you are?!', 'I\'m warning you.', 'Get out of my face!', 'You\'re the problem!', 'Watch it!',
  ],
  attack: ['Take that!', 'This ends now!', 'You started it!', 'Enough!', 'Get \'em!', 'Hyaah!', 'No more talking!', 'Come here!'],
  hurt: ['Ow!', 'Ugh!', 'That hurt!', 'Hey!', 'Oof!', 'Argh!', 'Not the face!'],
  flee: ['Run!', 'Help!!', 'Not me!', 'Aaah!', 'Please, no!', 'Get away!', 'Somebody help!', 'I\'m out of here!'],
  mourn: ['No... no no no.', 'Why?!', 'They were my friend...', 'This can\'t be happening.', 'Rest well...', 'Not them...'],
  grief: ['My love...!', 'Come back...', 'I\'ll find who did this.', 'No, no, no...', 'You\'ll pay for this.'],
  bond: ['Let\'s stick together.', 'I\'m with you.', 'Partners?', 'Teamwork!', 'Side by side.', 'You and me.'],
  defend: ['Leave them alone!', 'Not while I\'m here!', 'Get away from my partner!', 'I\'ve got your back!'],
  calm: ['Alright, alright...', 'Let\'s forget it.', 'Sorry, I lost my temper.', 'Forget I said anything.', 'Peace?'],
  panic: ['Was that a gun?!', 'Gunfire!', 'Get down!', 'Everybody run!'],
  rumorAccuse: ['Did you hear? Terrible things...', 'People are saying awful things.', 'I heard something nasty today.', 'Somebody poisoned the well, they say.'],
  rumorPraise: ['I heard something lovely today.', 'People speak so well of them.', 'Did you hear the good news?'],
  defect: ['I\'ve made my choice.', 'I can\'t follow them anymore.', 'This isn\'t my fight.'],
  festival: ['What a party!', 'Dance with me!', 'Best day ever!', 'More music!'],
  dance: ['La la la~', 'Come dance!', 'Whee!', 'Feel the rhythm!'],
  rest: ['Ahh, so cozy.', 'Just five minutes...', 'Nice and warm.', 'Zzz...'],
  shop: ['How much for this?', 'Hmm, too pricey.', 'Ooh, shiny.', 'Do you have it in green?'],
  pray: ['Let it all stay peaceful...', 'I wish for rain.', 'Let everyone get along.', 'Just one wish...'],
  train: ['Hup! Hup!', 'Feel the burn!', 'Again!', 'Strong arms, strong town.'],
  fish: ['Come on, bite...', 'Got one! ...no.', 'Patience.', 'Something\'s nibbling.'],
  garden: ['Grow, little carrots.', 'Weeds again...', 'Nice soil today.', 'Water, water...'],
  eat: ['Mmm, pastry!', 'Warm and flaky.', 'One more bite.', 'Heaven.'],
  heal: ['Hold still, I\'ve got you.', 'Let me see that.', 'You\'ll be fine.', 'Breathe.'],
  armUp: ['Better safe than sorry.', 'I\'ll take that.', 'Just in case.'],
  wounded: ['I need a medic...', 'I don\'t feel so good.', 'Everything hurts.'],
};

// Each faction has its own way of talking.
export const FACTION_LINES = {
  0: { // Embers: fiery, impatient, want to run things
    chat: ['The Embers lit this town\'s first fire.', 'Embers don\'t wait in line.', 'Nothing warms like an Ember.', 'Bright days ahead for the Embers.'],
    chatTense: ['Embers, keep your eyes open.', 'Somebody is going to get burned.'],
    hostile: ['We Embers are done asking nicely.', 'The Embers will take what is ours.', 'Time the Embers ran this town.', 'Embers rise. The rest can follow.'],
    attack: ['For the Embers!', 'Burn them out!', 'Embers, with me!'],
    hurt: ['You\'ll burn for that!', 'Embers don\'t fall easy!'],
    flee: ['Embers... fall back!', 'Not today. Regroup!'],
    mourn: ['An Ember has fallen...', 'They\'ll pay in flames.'],
    dance: ['Light the bonfire!'],
  },
  1: { // Tides: patient, slippery, long memories
    chat: ['The Tides always return.', 'Water finds a way.', 'A Tide never forgets a favour.', 'Patience is a Tide\'s blade.'],
    chatTense: ['The tide is turning.', 'Watch the water. It is rising.'],
    hostile: ['We Tides have waited long enough.', 'The Tides will wash this town clean.', 'Everything bows to the tide in time.', 'The Tides are coming in.'],
    attack: ['For the Tides!', 'Drown them!', 'Tides, surge!'],
    hurt: ['Ebb now, flow later.', 'You\'ll pay with interest.'],
    flee: ['Tides, retreat... for now.', 'We ebb. We return.'],
    mourn: ['A Tide has gone out...', 'The sea remembers.'],
    dance: ['Sway like the waves.'],
  },
  2: { // Sprouts: peaceful, stubborn, rooted
    chat: ['Sprouts grow where they\'re planted.', 'Roots run deep, friend.', 'We Sprouts just want a quiet harvest.', 'Good soil, good neighbours.'],
    chatTense: ['Someone is trampling the fields.', 'A storm is brewing, I can smell it.'],
    hostile: ['Even a Sprout has thorns.', 'We Sprouts are done being trampled.', 'The Sprouts won\'t be pushed again.', 'Plant a seed of trouble, reap a forest.'],
    attack: ['For the Sprouts!', 'Thorns out!', 'Sprouts, hold the line!'],
    hurt: ['Roots hold!', 'You trampled the wrong Sprout!'],
    flee: ['Sprouts, scatter!', 'Take cover in the fields!'],
    mourn: ['A Sprout has withered...', 'Another seed lost.'],
    dance: ['Sprouts sway in the breeze~'],
  },
  3: { // Sparks: quick, jokey, flashy
    chat: ['Sparks fly wherever we go!', 'Catch us if you can!', 'We Sparks light up any room.', 'Got a joke? Sparks love jokes.'],
    chatTense: ['The mood is... static.', 'Anyone else feel a charge in the air?'],
    hostile: ['One Spark can burn a barn.', 'The Sparks are done joking.', 'We Sparks are about to get loud.', 'Light the fuse, Sparks!'],
    attack: ['For the Sparks!', 'Zap!', 'Sparks, ignite!'],
    hurt: ['Ow, that\'s not funny!', 'Now I\'m mad. Sparks!'],
    flee: ['Sparks, scatter!', 'Too hot! Run!'],
    mourn: ['A Spark went out...', 'The light dimmed.'],
    dance: ['Spark party!'],
  },
  4: { // Neutrals: just want to be left alone
    chat: ['We neutrals just want peace.', 'Nobody ever asks the neutrals.', 'I\'m with whoever is baking.'],
    chatTense: ['I stay out of it. I hope it stays out of me.', 'Neutral is getting harder.'],
    hostile: ['Keep us out of your wars.', 'Neutral doesn\'t mean helpless.'],
    attack: ['I never picked a side... until now!'],
    hurt: ['I\'m neutral! NEUTRAL!'],
    flee: ['Neutrals out!', 'Not my war!'],
    mourn: ['They were just a neighbour...'],
    dance: ['Everyone welcome!'],
  },
};

// Lines that name factions: {me} is the speaker's faction, {them} the one being talked about.
export const TEMPLATES = {
  chatTense: ['Word is the {them} want the market.', 'I hear the {them} are arming up.', 'Don\'t turn your back on the {them}.', 'The {them} keep glaring at us.', 'I don\'t trust the {them} anymore.', 'Is it true what they say about the {them}?'],
  hostile: [
    'We, the {me}, are done being patient with the {them}.', 'The {them} have it coming.', 'The {me} will end the {them}.',
    '{me} first, {them} never.', 'The {me} will take over, one way or another.', 'No more {them} in our town.',
    'The {them} think they own this place.', 'We\'re taking back what the {them} took.',
  ],
  attack: ['For the {me}! Down with the {them}!', 'This is for the {me}!', '{them} scum!', 'The {them} started this!', 'Get the {them}!'],
  argue: ['Typical {them}!', 'That\'s the {them} for you!', 'Your {them} pride, I swear.', 'The {them} never listen!'],
  hurt: ['The {them} fight dirty!', 'Cheap shot, {them}!'],
  flee: ['The {them} are too many!', 'Fall back from the {them}!'],
  mourn: ['The {them} did this...', 'One of ours, gone. The {them} will answer.'],
  grief: ['The {them} took you from me...'],
  bond: ['A {me} and a {them}... why not?', 'Who cares what the {me} say?', 'The {them} aren\'t so bad.'],
  love: ['A {me} and a {them}. Imagine that.', 'Maybe the {them} aren\'t so bad.'],
  defend: ['Nobody touches the {me}!', 'Leave a {me} alone, {them}!'],
  calm: ['Forget it, {them}. This time.', 'Peace between the {me} and the {them}?'],
  panic: ['That was the {them}!'],
  rumorAccuse: ['They say the {them} poisoned the well!', 'I heard the {them} are hoarding grain.', 'Is it true the {them} burned the barn?', 'The {them} did WHAT?', 'I always knew about the {them}.'],
  rumorPraise: ['They say the {them} saved a child!', 'I heard the {them} gave bread to everyone.', 'The {them} are not so bad after all.', 'The {them} fixed the well, I hear.'],
  defect: ['The {me} lost me. I\'m with the {them} now.', 'I\'m done with the {me}.'],
};

// Each temperament adds its own voice to some situations.
export const TRAIT_LINES = {
  brawler: { attack: ['Come at me!', 'Who\'s first?!', 'Finally, a fight!'], argue: ['Make me!', 'I\'ll flatten you!'], chat: ['Anyone up for a scrap?'] },
  coward: { flee: ['I\'m not paid for this!', 'Don\'t hurt me!', 'Mommy!'], chatTense: ['I\'m hiding at home.', 'I hate all this.'], argue: ['I-I don\'t want trouble!'] },
  gunslinger: { attack: ['Reckon you should leave.', 'Shells are cheap, friend.', 'Feel lucky?'], chat: ['Nice quiet town.', 'I keep it loaded.'], panic: ['Calm down, folks.'] },
  peacemaker: { calm: ['Easy, easy. Let\'s talk.', 'Put it down, friends.', 'Violence solves nothing.'], chat: ['Why can\'t we all get along?'], chatTense: ['Please, talk to each other.'] },
  medic: { heal: ['Hold still, I\'m a medic.', 'Let me patch you up.'], chat: ['Wash your hands, everyone.'] },
  bodyguard: { defend: ['Not on my watch!', 'Through me first!'], chat: ['Stay behind me.'] },
  wildcard: { chat: ['Chaos is a ladder!', 'Heh heh heh.', 'What if everything were pink?'], attack: ['Wheee!', 'Surprise!'], argue: ['Or maybe not! Hah!'] },
};

/**
 * @param {string} category  what they are doing (a key of LINES)
 * @param {{trait?: string|null, me?: number, them?: number, stance?: 'calm'|'tense'|'hostile'}} ctx
 */
export function pickLine(category, ctx = {}, rng = Math.random) {
  const { trait = null, me = -1, them = -1, stance = 'calm' } = ctx;
  const meIdx = me >= 0 && me < 4 ? me : 4;
  const meName = GROUP_NAMES[meIdx];
  const themName = them >= 0 && them !== meIdx ? GROUP_NAMES[them] : null;

  // Small talk follows the mood: hostile people talk about taking over.
  let cat = category;
  if (cat === 'chat' || cat === 'chatTense') {
    if (stance === 'hostile' && rng() < 0.8) cat = 'hostile';
    else if (stance !== 'calm') cat = 'chatTense';
  }

  const pools = [];
  const add = (arr, weight) => { if (arr?.length) pools.push([arr, weight]); };
  add(FACTION_LINES[meIdx]?.[cat], 0.4);
  if (themName) add(TEMPLATES[cat], 0.45);
  if (trait) add(TRAIT_LINES[trait]?.[cat], 0.25);
  add(LINES[cat], cat === 'hostile' ? 0 : 0.3);
  if (pools.length === 0) add(LINES.chat, 1);

  let roll = rng() * pools.reduce((n, p) => n + p[1], 0);
  let pool = pools[0][0];
  for (const [arr, w] of pools) {
    roll -= w;
    if (roll <= 0) {
      pool = arr;
      break;
    }
  }
  const line = pool[Math.floor(rng() * pool.length)];
  return line.replaceAll('{me}', meName).replaceAll('{them}', themName ?? 'others');
}
