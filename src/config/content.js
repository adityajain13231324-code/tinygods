// Names, factions, places. Text and colours only; numbers belong in tunables.js.

export const NEUTRAL = -1;

// Faction identity = colour AND mark (colour-blind friendly).
export const FACTIONS = [
  { id: 0, name: 'Embers', color: 0xe5533d, dark: 0x8f2a1a, mark: 'triangle' },
  { id: 1, name: 'Tides', color: 0x3d8be5, dark: 0x1d4f8f, mark: 'wave' },
  { id: 2, name: 'Sprouts', color: 0x4fb86a, dark: 0x25703a, mark: 'leaf' },
  { id: 3, name: 'Sparks', color: 0xf2c53d, dark: 0x9a7611, mark: 'star' },
];

export const NEUTRAL_LOOK = { name: 'Neutrals', color: 0xd8cdb4, dark: 0x8a7f66 };

// Opinion / fear / grudge arrays have one slot per group: 0..3 = factions, 4 = neutrals.
export const NEUTRAL_GROUP = 4;
export const NUM_GROUPS = 5;
export const GROUP_NAMES = ['Embers', 'Tides', 'Sprouts', 'Sparks', 'Neutrals'];

export const VERBS = {
  hate: { label: 'Hate', targets: ['group'], blurb: 'They start to despise the target group.' },
  love: { label: 'Love', targets: ['group'], blurb: 'They warm to the target group, chat more, and some villagers pair up with them.' },
  fear: { label: 'Fear', targets: ['group'], blurb: 'They get scared of the target group.' },
  protect: { label: 'Guard', targets: ['group', 'place'], blurb: 'Bodyguards: stay close and step in when attacked.' },
  avoid: { label: 'Avoid', targets: ['group', 'place'], blurb: 'Keep away. They only fight back if cornered.' },
  follow: { label: 'Go to', targets: ['place'], blurb: 'Go to a place and stay there.' },
  escort: { label: 'Escort', targets: ['villager'], blurb: 'Stick close to one villager and follow them around.' },
  hunt: { label: 'Hunt', targets: ['villager'], blurb: 'Go after one named villager of another faction.' },
  assault: { label: 'Assault', targets: ['group', 'place'], blurb: 'Send fighters straight at a faction, or at everyone standing at a place.' },
  standdown: { label: 'Stand down', targets: [], blurb: 'Stop fighting and keep out of trouble for a while.' },
  arm: { label: 'Arm up', targets: [], blurb: 'Unarmed villagers fetch a weapon; gun owners reload.' },
  accuse: { label: 'Accuse', targets: ['group'], blurb: 'Start a rumor that the target group did something awful. It spreads from villager to villager; believers like them less. Nobody learns who started it.' },
  praise: { label: 'Praise', targets: ['group'], blurb: 'Start a rumor that the target group did something wonderful. Believers like them more.' },
  shove: { label: 'Shove', targets: ['group'], blurb: 'Your villagers walk up to the target faction and push them away, again and again. It hurts nobody much but makes enemies.' },
  seize: { label: 'Seize', targets: ['villager'], blurb: 'Several of your villagers grab one enemy villager and drag them off to a place (the Houses unless you say otherwise; the Pond if you want them dunked), then let go.' },
  scare: { label: 'Scare', targets: ['group'], blurb: 'Your villagers walk up to the target faction and glare, mutter and loom until they lose their nerve and run. Bullying makes enemies resent you.' },
  scatter: { label: 'Run away', targets: [], blurb: 'Everyone scatters away from everybody else and keeps their distance.' },
  ambush: { label: 'Ambush', targets: ['place'], blurb: 'Lie in wait at a place and jump anyone from another faction who wanders close.' },
  festival: { label: 'Festival', targets: ['place'], blurb: 'A party at a place: everyone nearby calms down and friendships form.' },
};

export const SHAPES =['circle', 'square', 'triangle', 'hex'];

// Positions are in world coordinates (1920 x 1080).
export const PLACES = [
  { id: 'plaza', name: 'Plaza', x: 960, y: 540, radius: 150 },
  { id: 'park', name: 'Park', x: 330, y: 270, radius: 130 },
  { id: 'market', name: 'Market', x: 1590, y: 270, radius: 120 },
  { id: 'well', name: 'Well', x: 960, y: 190, radius: 75 },
  { id: 'houses', name: 'Houses', x: 330, y: 830, radius: 130 },
  { id: 'armory', name: 'Armory', x: 1590, y: 830, radius: 100 },
  { id: 'pond', name: 'Pond', x: 620, y: 540, radius: 100 },
  { id: 'farm', name: 'Farm', x: 1310, y: 540, radius: 110 },
  { id: 'bakery', name: 'Bakery', x: 960, y: 900, radius: 90 },
];

// What villagers do at each place (see ACTIVITY in tunables.js for the effects).
export const ACTIVITY_TEXT = {
  dance: 'Dancing',
  rest: 'Resting',
  shop: 'Browsing the stalls',
  pray: 'Making a wish',
  train: 'Practising their swing',
  fish: 'Fishing',
  garden: 'Tending the crops',
  eat: 'Eating a pastry',
};

export const NAMES = [
  'Pip', 'Moss', 'Tuck', 'Bean', 'Juno', 'Dot', 'Fig', 'Nell', 'Otto', 'Pebble',
  'Rue', 'Sage', 'Tilly', 'Wren', 'Biscuit', 'Clove', 'Dara', 'Eli', 'Fern', 'Gus',
  'Hazel', 'Ivo', 'Jelly', 'Kip', 'Lark', 'Milo', 'Nib', 'Olive', 'Pico', 'Quill',
  'Rolo', 'Sunny', 'Toby', 'Uma', 'Vex', 'Waffle', 'Yuki', 'Zed', 'Alder', 'Bram',
  'Cass', 'Doro', 'Echo', 'Finn', 'Gigi', 'Hux', 'Indy', 'Jax', 'Kiki', 'Lulu',
  'Mochi', 'Nova', 'Opal', 'Pom', 'Remy', 'Skye', 'Tango', 'Ugo', 'Vera', 'Wally',
];
