// How each card and power looks: an icon and a colour family. (Purely visual; the rules live in src/sim.)
export const CARD_LOOK = {
  forged: { icon: '✉️', cat: 'schemes' },
  prophecy: { icon: '🔮', cat: 'schemes' },
  alibi: { icon: '🎭', cat: 'schemes' },
  spy: { icon: '🕵️', cat: 'intel' },
  census: { icon: '📋', cat: 'intel' },
  bribe: { icon: '💰', cat: 'people' },
  recruit: { icon: '🤝', cat: 'people' },
  matchmaker: { icon: '💞', cat: 'people' },
  treaty: { icon: '📜', cat: 'people' },
  raid: { icon: '🏴‍☠️', cat: 'pressure' },
  spoiled: { icon: '🍞', cat: 'pressure' },
  alarm: { icon: '🚨', cat: 'pressure' },
  bomb: { icon: '💣', cat: 'pressure' },
  kidnap: { icon: '🧳', cat: 'pressure' },
  warchest: { icon: '🪙', cat: 'people' },
  rally: { icon: '📣', cat: 'support' },
  medic: { icon: '⛑️', cat: 'support' },
  truce: { icon: '🔔', cat: 'support' },
};

export const CARD_CATS = {
  schemes: { name: 'Scheme', color: '#a77bff' },
  intel: { name: 'Intel', color: '#4aa8ff' },
  people: { name: 'People', color: '#ff8fb0' },
  pressure: { name: 'Pressure', color: '#ff6b4a' },
  support: { name: 'Support', color: '#5fd38d' },
};

// Powers are grouped the same way, by what they do.
export const POWER_CATS = {
  miracle: '#5fd38d', aegis: '#5fd38d', rain: '#4aa8ff', fog: '#4aa8ff', sleep: '#4aa8ff',
  whisper: '#a77bff', charm: '#ff8fb0', enrage: '#ff8fb0',
  gust: '#ffd36b', tornado: '#ffd36b', earthquake: '#ffd36b',
  lightning: '#ff6b4a', fireball: '#ff6b4a', disarm: '#ff6b4a',
};

// The order menu: icon and one-line meaning for every verb.
export const VERB_LOOK = {
  hate: { icon: '😠', tip: 'Make people despise a faction' },
  love: { icon: '💗', tip: 'Warm people to a faction; some pair up' },
  fear: { icon: '😱', tip: 'Make people afraid of a faction' },
  assault: { icon: '⚔️', tip: 'Send fighters straight at a faction' },
  protect: { icon: '🛡️', tip: 'Guard a faction or a place' },
  avoid: { icon: '🚫', tip: 'Keep away from a faction or place' },
  follow: { icon: '📍', tip: 'Go to a place and stay' },
  escort: { icon: '🚶', tip: 'Follow one villager around' },
  hunt: { icon: '🎯', tip: 'Go after one named villager' },
  standdown: { icon: '🕊️', tip: 'Stop fighting, keep out of trouble' },
  arm: { icon: '🗡️', tip: 'Fetch weapons from the armory' },
  accuse: { icon: '🗣️', tip: 'Start a rumor against a faction' },
  praise: { icon: '👏', tip: 'Start a rumor praising a faction' },
  festival: { icon: '🎉', tip: 'A party that calms everyone' },
  shove: { icon: '🫸', tip: 'Walk up to a faction and push them away' },
  seize: { icon: '🪢', tip: 'Grab one villager and drag them somewhere' },
  scare: { icon: '👻', tip: 'Walk up to a faction and frighten them into running' },
  scatter: { icon: '💨', tip: 'Everyone runs away from everyone' },
  ambush: { icon: '🥷', tip: 'Wait at a place and jump anyone who comes near' },
};
export const VERB_ORDER = ['hate', 'love', 'fear', 'assault', 'protect', 'avoid', 'follow', 'escort', 'hunt', 'standdown', 'arm', 'accuse', 'praise', 'festival', 'scare', 'shove', 'seize', 'scatter', 'ambush'];
