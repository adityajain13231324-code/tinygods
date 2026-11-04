import { FACTIONS, PLACES } from '../config/content.js';
import { DRAMA, WORLD } from '../config/tunables.js';
import { livingByFaction } from '../sim/win.js';

const placeName = (id) => PLACES.find((p) => p.id === id)?.name ?? id;
const label = (v) => (v.faction >= 0 ? FACTIONS[v.faction].name : 'neutral');
const weaponPhrase = { pan: 'a frying pan', bat: 'a bat', knife: 'a knife', gun: 'a pistol', shotgun: 'a shotgun' };

/** "It built up: an argument, then a fist fight, then a bat." in plain words. */
function howItGotHere(killer, chain) {
  if (!chain) return '';
  const steps = [];
  if (chain.argued) steps.push('an argument');
  if (chain.scuffled) steps.push('a fist fight');
  if (chain.weapon) steps.push(`${killer.name} reached for ${weaponPhrase[chain.weapon] ?? chain.weapon}`);
  if (steps.length === 0) return `No warning at all: ${killer.name} struck first${chain.weapon ? ` with ${weaponPhrase[chain.weapon]}` : ''}.`;
  return `How it got here: ${steps.join(', then ')}.`;
}

/**
 * Reads the sim's event log and decides what the viewer should be shown: a camera cut with a
 * spotlight on the two people involved, a news board that says what happened and how it got
 * there, a shake, a sound. It never changes the simulation, so bots and headless runs are
 * unaffected, and it never reveals whose order started it (that is the guessing game).
 *
 * What counts as a moment:
 *   - the first kill of the match ("first blood"): big board, long zoom, slow motion
 *   - the last member of a faction falling
 *   - a brawl: several kills close together in time and place
 *   - gun kills; gunshots (shake + sound, and the first one gets a banner)
 */
export class Director {
  constructor({ camera, board, effects, audio, spotlight, clock }) {
    this.camera = camera;
    this.board = board;
    this.effects = effects;
    this.audio = audio;
    this.spotlight = spotlight;
    this.clock = clock; // () => animation seconds
    this.index = 0;
    this.kills = 0;
    this.recent = []; // recent kills for brawl detection
    this.lastCut = -Infinity;
    this.sawGunshot = false;
    this.announcedSudden = false;
  }

  update(game) {
    const { world } = game;
    this.announceSuddenDeath(game);

    while (this.index < world.events.length) {
      const e = world.events[this.index++];
      if (e.type === 'kill') this.onKill(game, e);
      else if (e.type === 'gunshot') this.onGunshot(game, e);
      else if (e.type === 'bond') this.audio?.play('bond', world.villagers[e.aId].x);
      else if (e.type === 'shout') this.audio?.play('shout', e.x);
      else if (e.type === 'scream') this.audio?.play('scream', e.x);
      else if (e.type === 'splash') { this.audio?.play('splash', e.x); this.effects.puff?.(e.x, e.y, 10, 0xbfe3ff); }
      else if (e.type === 'defect') this.onDefect(game, e);
      else if (e.type === 'explosion') {
        this.effects.explosion(e);
        this.camera.kick(11);
        document.getElementById('flash')?.animate?.([{ opacity: 0.45 }, { opacity: 0 }], { duration: 300 });
      } else if (e.type === 'power') {
        this.effects.power(e);
        if (e.power === 'earthquake') this.camera.kick(16);
        if (e.power === 'lightning') { this.camera.kick(5); document.getElementById('flash')?.animate?.([{ opacity: 0.5 }, { opacity: 0 }], { duration: 260 }); }
      }
    }
    this.effects.world = world;
  }

  announceSuddenDeath(game) {
    if (game.suddenDeath && !this.announcedSudden && game.phase !== 'ended') {
      this.announcedSudden = true;
      this.board.show({
        kicker: 'WARNING', title: 'TENSION RISING',
        text: 'From now on the whole town gets angrier every turn.',
        detail: 'Enemies can sense each other from farther away now.', big: true, seconds: 4.5,
      });
      this.audio?.play('warp');
    }
  }

  onKill(game, e) {
    const { world } = game;
    const killer = world.villagers[e.killerId];
    const victim = world.villagers[e.victimId];
    const place = placeName(e.place);
    this.kills++;
    this.camera.kick(DRAMA.shakeKill);

    this.recent.push(e);
    this.recent = this.recent.filter((k) => world.time - k.time <= DRAMA.brawlWindow);
    const brawl = this.recent.filter((k) => k.place === e.place);

    const living = livingByFaction(world);
    const wiped = e.victimFaction >= 0 && living[e.victimFaction] === 0;
    const coolEnough = world.time - this.lastCut >= DRAMA.cutCooldown;
    // Keep the board out of the way: if the kill is in the top of town, the board goes to the bottom.
    const at = e.y < WORLD.height * 0.42 ? 'bottom' : 'top';
    const what = `${killer.name} (${label(killer)}) took down ${victim.name} (${label(victim)}) at the ${place}.`;
    const detail = howItGotHere(killer, e.chain);

    const cut = (zoom, hold) => {
      this.camera.cut(e.x, e.y - 14, { zoom, hold });
      this.spotlight.show(killer, victim, this.clock(), hold);
      this.lastCut = world.time;
    };

    if (this.kills === 1) {
      this.board.show({ kicker: 'BREAKING NEWS', title: 'FIRST BLOOD', text: what, detail, big: true, seconds: DRAMA.firstKillHold + 0.6, at });
      cut(DRAMA.firstKillZoom, DRAMA.firstKillHold);
      this.audio?.play('jingle');
      this.audio?.play('shutter');
    } else if (wiped) {
      const name = FACTIONS[e.victimFaction].name.toUpperCase();
      this.board.show({
        kicker: 'BREAKING NEWS', title: `THE ${name} HAVE FALLEN`,
        text: `${victim.name} was the last of them, struck down by ${killer.name} (${label(killer)}) at the ${place}.`,
        detail, big: true, seconds: DRAMA.hold + 1.2, at,
      });
      cut(DRAMA.zoom, DRAMA.hold + 0.4);
      this.audio?.play('jingle');
      this.audio?.play('shutter');
    } else if (brawl.length >= DRAMA.brawlKills && coolEnough) {
      this.board.show({ kicker: 'NEWS FLASH', title: `BRAWL AT THE ${place.toUpperCase()}`, text: `${brawl.length} villagers down in seconds. The latest: ${what}`, detail, at, seconds: DRAMA.hold + 1 });
      cut(DRAMA.zoom - 0.2, DRAMA.hold);
      this.audio?.play('shutter');
    } else if ((e.weapon === 'gun' || e.weapon === 'shotgun') && coolEnough) {
      this.board.show({ kicker: 'NEWS FLASH', title: e.weapon === 'shotgun' ? 'SHOTGUN BLAST' : 'SHOT DOWN', text: what, detail, at, seconds: DRAMA.hold + 1 });
      cut(DRAMA.zoom - 0.2, DRAMA.hold - 0.4);
      this.audio?.play('shutter');
    }
  }

  onDefect(game, e) {
    const v = game.world.villagers[e.villagerId];
    const name = (f) => (f >= 0 ? FACTIONS[f].name : 'neutrals');
    this.defects = (this.defects ?? 0) + 1;
    this.audio?.play('shutter', v.x);
    if (this.defects <= 3) {
      this.board.show({
        kicker: 'NEWS FLASH', title: e.from < 0 ? 'NEUTRAL WON OVER' : 'TURNCOAT',
        text: `${v.name} has ${e.from < 0 ? 'joined' : 'left the ' + name(e.from) + ' for'} the ${name(e.to)}.`,
        seconds: 3.4,
      });
    }
  }

  onGunshot(game, e) {
    this.effects.shot(e);
    this.camera.kick(e.weapon === 'shotgun' ? DRAMA.shakeGun * 1.6 : DRAMA.shakeGun);
    document.getElementById('flash')?.animate([{ opacity: e.weapon === 'shotgun' ? 0.28 : 0.16 }, { opacity: 0 }], { duration: 160 });
    this.audio?.play(e.weapon === 'shotgun' ? 'shotgun' : 'gunshot', e.x);
    if (!this.sawGunshot) {
      this.sawGunshot = true;
      this.board.show({ kicker: 'NEWS FLASH', title: 'SHOTS FIRED', text: `Gunfire near the ${placeName(e.place)}. Villagers are running.` });
    }
  }
}
