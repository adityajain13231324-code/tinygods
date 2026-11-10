import { Container, Graphics, Text } from 'pixi.js';
import { pickLine } from '../config/lines.js';
import { groupOf } from '../sim/villager.js';

const INK = 0x2b2622;
const POOL = 10;
const MAX_CHAT = 4; // at most this many calm-chat bubbles at once; fights and cries always get through
const MIN_SCREEN_SCALE = 0.75;

/**
 * Speech bubbles with real lines ("You always do that!", "Mmm, pastry!"), picked by what
 * the villager is doing. Pooled (10 bubbles at once at most, important ones win), kept the
 * same size on screen whatever the zoom, and skipped when the speaker is off screen.
 */
export class Speech {
  constructor(layer, camera, audio, game) {
    this.camera = camera;
    this.audio = audio;
    this.game = game;
    this.layer = new Container();
    layer.addChild(this.layer);
    this.free = [];
    this.live = [];
    this.recent = []; // the last lines said, so the town does not repeat itself
    this.eventSay = 0; // sim seconds of the last event-driven line, to keep reactions occasional
    for (let i = 0; i < POOL; i++) {
      const root = new Container();
      const bg = new Graphics();
      const text = new Text({
        text: '',
        style: { fontFamily: 'system-ui, sans-serif', fontSize: 11, fontWeight: '700', fill: INK, wordWrap: true, wordWrapWidth: 112, align: 'center', lineHeight: 12.5 },
      });
      text.anchor.set(0.5, 0);
      root.addChild(bg, text);
      root.visible = false;
      this.layer.addChild(root);
      this.free.push({ root, bg, text });
    }
  }

  /**
   * @param {import('./villagerView.js').VillagerView} view
   * @param {string} category  a key of LINES
   * @param {number} priority  1 chatter, 2 reactions, 3 cries and grief
   */
  say(view, category, priority = 1, other = null, override = null) {
    const v = view.v;
    if (!v.alive || !this.camera.isVisible(view.root.x, view.headY(), 20)) return;

    if (priority === 1 && this.game.world.villagers.some(o => o.alive && o.state === 'attack' && Math.hypot(o.x-v.x,o.y-v.y)<220)) return;
    const existing = this.live.find((b) => b.view === view);
    if (existing && existing.priority > priority && existing.life > 0.6) return;
    if (!existing && priority === 1 && this.live.filter((b) => b.priority === 1).length >= MAX_CHAT) return;

    let slot = existing ?? this.free.pop();
    if (!slot) {
      // Pool is full: bump the weakest, oldest bubble if this one matters more.
      const weakest = [...this.live].sort((a, b) => a.priority - b.priority || a.life - b.life)[0];
      if (!weakest || weakest.priority >= priority) return;
      this.release(weakest);
      slot = this.free.pop();
    }

    let line = pickLine(category, override ?? this.context(view, other));
    for (let tries = 0; tries < 5 && this.recent.includes(line); tries++) line = pickLine(category, override ?? this.context(view, other));
    this.recent.push(line);
    if (this.recent.length > 18) this.recent.shift();
    slot.text.text = line;
    const w = Math.max(28, slot.text.width + 11);
    const h = slot.text.height + 7;
    slot.text.position.set(0, -h - 7 + 3);
    slot.bg.clear();
    slot.bg.roundRect(-w / 2, -h - 7, w, h, 6).fill(0xffffff).stroke({ width: 1.2, color: INK });
    slot.bg.poly([-3.5, -7.4, 3.5, -7.4, 0, 0]).fill(0xffffff).stroke({ width: 1.2, color: INK, join: 'round' });
    slot.bg.poly([-2.8, -8, 2.8, -8, 0, -1.6]).fill(0xffffff); // hide the border where the tail joins
    slot.root.visible = true;
    slot.root.alpha = 1;

    const seconds = 1.9 + line.length * 0.04;
    if (existing) {
      existing.priority = priority;
      existing.life = seconds;
      existing.max = seconds;
    } else {
      this.live.push({ ...slot, view, priority, life: seconds, max: seconds });
    }
    this.audio?.voice(v.id, line.length, v.expression, view.root.x);
  }

  /**
   * What this villager would talk about right now: who they are (faction, temperament), who
   * they are talking to or fighting, and how they actually feel about the other factions.
   */
  context(view, other) {
    const v = view.v;
    const own = groupOf(v);
    let worst = -1;
    let worstOpinion = 0;
    for (let g = 0; g < v.opinion.length; g++) {
      if (g !== own && v.opinion[g] < worstOpinion) {
        worstOpinion = v.opinion[g];
        worst = g;
      }
    }
    const stance = worstOpinion < -40 ? 'hostile' : worstOpinion < -15 || this.game.world.tension > 40 ? 'tense' : 'calm';
    const otherGroup = other ? groupOf(other) : -1;
    // Talk about the person in front of you if they are from another group, else about who you resent.
    const them = otherGroup >= 0 && otherGroup !== own ? otherGroup : worstOpinion < -15 ? worst : -1;
    return { trait: v.revealed || v.trait === 'gunslinger' ? v.trait : null, me: own, them, stance };
  }

  release(b) {
    b.root.visible = false;
    this.live.splice(this.live.indexOf(b), 1);
    this.free.push({ root: b.root, bg: b.bg, text: b.text });
  }

  /** Replay borrows live villagers; discard old observations at both boundaries. */
  reset(views) {
    for (const bubble of [...this.live]) this.release(bubble);
    for (const view of views) view.sp = null;
  }

  update(dt) {
    const inv = 1 / Math.max(this.camera.scale || 1, 0.0001);
    const s = Math.min(inv, 1 / MIN_SCREEN_SCALE * 1.4);
    for (let i = this.live.length - 1; i >= 0; i--) {
      const b = this.live[i];
      b.life -= dt;
      if (b.life <= 0 || !b.view.v.alive) {
        this.release(b);
        continue;
      }
      b.root.position.set(b.view.root.x, b.view.headY() - 6 * inv);
      b.root.scale.set(s * 0.82);
      const busy = b.priority === 1 && this.game.world.villagers.some(o=>o.alive && o.state==='attack' && Math.hypot(o.x-b.view.v.x,o.y-b.view.v.y)<220);
      b.root.alpha = Math.min(1, b.life / 0.35) * (busy ? 0.18 : 1);
    }
  }

  /**
   * Reactions to what the simulation says happened (see world.events). Only a few villagers react to
   * each thing, the most relevant ones (the people involved, then whoever is nearest), and never all at once.
   */
  event(e, world) {
    const views = this.views ?? [];
    const view = (id) => views[id];
    const near = (x, y, r, n, skip = () => false) => views.filter((w) => w.v.alive && !skip(w) && Math.hypot(w.v.x - x, w.v.y - y) < r).sort((a, b) => Math.hypot(a.v.x - x, a.v.y - y) - Math.hypot(b.v.x - x, b.v.y - y)).slice(0, n);
    const vv = (id) => world.villagers[id];
    const sayNear = (cat, x, y, n = 2, pr = 2, r = 260) => { for (const w of near(x, y, r, n)) this.say(w, cat, pr); };
    switch (e.type) {
      case 'armoryEmpty': sayNear('armoryEmpty', e.x, e.y, 2, 2, 400); break;
      case 'power':
        if (e.power === 'freeze') for (const w of near(e.x, e.y, 200, 2, (q) => q.v.frozenUntil > world.time)) this.say(w, 'frozenFriend', 2);
        if (e.power === 'miracle' && view(e.villagerId)?.v.memory?.length) this.say(view(e.villagerId), 'healedThanks', 3);
        break;
      case 'defect': {
        const v = vv(e.villagerId);
        const mourner = v && world.villagers.find((o) => o.alive && (o.partnerId === v.id || o.friendId === v.id) && o.faction === e.from);
        if (mourner && view(mourner.id)) this.say(view(mourner.id), 'betrayed', 3);
        break;
      }
      case 'propDestroyed': sayNear('coverBroke', e.x, e.y, 2, 2, 220); break;
      case 'grassSmolder': sayNear('fireWarn', e.x, e.y, 1, 2, 300); break;
      case 'grassIgnite': sayNear('fireOn', e.x, e.y, 2, 3, 260); break;
      case 'grassOut': sayNear('fireOut', e.x, e.y, 1, 2, 300); break;
      case 'gunshot':
        if (e.blank && view(e.shooterId)) this.say(view(e.shooterId), 'blankShot', 3);
        break;
      case 'rivalMeet': {
        const w = view(e.villagerId);
        if (w) this.say(w, e.kind === 'rescued' ? 'rivalThanks' : 'rivalAgain', 2);
        break;
      }
      case 'forgave': if (view(e.villagerId)) this.say(view(e.villagerId), 'forgave', 2); break;
      case 'cakeInvite': sayNear('cakeCall', e.x, e.y, 2, 2, 520); break;
      case 'cakeArrival': if (view(e.villagerId)) this.say(view(e.villagerId), 'cakeEat', 1); break;
      case 'weaponStolen':
        if (view(e.victimId)) this.say(view(e.victimId), 'stolen', 3);
        if (view(e.thiefId)) this.say(view(e.thiefId), 'mischief', 2);
        break;
      case 'troubleDash': sayNear('troubleDash', e.x, e.y, 2, 2, 240); break;
      case 'troubleRumor': if (view(e.villagerId)) this.say(view(e.villagerId), 'mischief', 2); break;
      case 'conditionTriggered': if (view(e.villagerId)) this.say(view(e.villagerId), 'fallBack', 2); break;
      case 'comboZap': for (const s of e.path.slice(0, 2)) if (view(s.id)) this.say(view(s.id), 'zapped', 3); break;
      case 'goodsScatter': sayNear('goodsLost', e.x, e.y, 1, 2, 240); break;
      case 'leaderCrowned': sayNear('leaderHail', e.x, e.y, 2, 2, 320); break;
      case 'weaponDropRoll': if (e.dropped) sayNear('dropped', e.x, e.y, 1, 1, 260); break;
      default: break;
    }
  }

  /** Watch a villager for things worth saying. Called every frame; cheap edge detection. */
  watch(view, observedTime = this.game.world.time) {
    const v = view.v;
    const m = (view.sp ??= { state: v.state, speaking: false, hit: 0, hp: v.hp, frozen: v.frozenUntil > observedTime, ammo: v.ammo, believed: v.believed.length, faction: v.faction, partner: v.partnerId, activity: v.activity, hurt: false, weapon: v.weapon, expr: v.expression, brew: -1 });
    if (!v.alive) return;
    const chance = (p) => Math.random() < p;

    if (view.speaking && !m.speaking) {
      const tense = this.game.world.tension > 35;
      const partner = v.targetId !== null ? this.game.world.villagers[v.targetId] : null;
      if (v.expression === 'love') this.say(view, 'love', 1, partner);
      else if (v.expression === 'angry') this.say(view, 'argue', 2, partner);
      else if (chance(0.6)) this.say(view, tense ? 'chatTense' : 'chat', 1, partner);
    }
    if (v.state === 'attack' && m.state !== 'attack' && chance(0.55)) this.say(view, 'attack', 3, this.game.world.villagers[v.targetId]);
    if (v.hitFlash > m.hit + 0.5 && chance(0.35)) this.say(view, 'hurt', 2);
    if (v.state === 'flee' && m.state !== 'flee' && chance(0.7)) this.say(view, v.panic > 0 ? 'panic' : 'flee', 3);
    if (v.state === 'mourn' && m.state !== 'mourn' && chance(0.8)) this.say(view, v.timer > 6 ? 'grief' : 'mourn', 3);
    if (v.believed.length > m.believed && chance(0.8)) {
      const r = v.believed.at(-1);
      this.say(view, r.kind === 'accuse' ? 'rumorAccuse' : 'rumorPraise', 2, null, { me: groupOf(v), them: r.group, stance: 'calm', trait: v.revealed ? v.trait : null });
    }
    if (v.faction !== m.faction) {
      // They changed sides: say so, as a member of the faction they just left.
      this.say(view, 'defect', 3, null, { me: m.faction, them: v.faction, stance: 'calm', trait: null });
    }
    if (v.partnerId >= 0 && m.partner < 0) this.say(view, 'bond', 2, this.game.world.villagers[v.partnerId]);
    if (m.state === 'talk' && m.expr === 'angry' && v.state === 'idle' && chance(0.5)) this.say(view, 'calm', 2, this.game.world.villagers[v.targetId ?? 0]);
    if (v.activity && !m.activity && chance(0.4)) {
      this.say(view, this.game.world.festivals.length && v.activity === 'dance' ? 'festival' : v.activity, 1);
    }
    if (v.weapon !== 'none' && m.weapon === 'none' && chance(0.6)) this.say(view, 'armUp', 1);
    if (v.hp < 35 && !m.hurt && chance(0.5)) this.say(view, 'wounded', 2);
    if (v.trait === 'medic' && v.state === 'guard' && m.state !== 'guard' && chance(0.6)) this.say(view, 'heal', 2);

    // These reactions follow observed changes, so they also work in recorded replays.
    // A large HP jump distinguishes a miracle or medic from slow natural recovery.
    if (v.hp - m.hp >= 15 && chance(0.7)) this.say(view, 'healed', 2);
    const frozen = v.frozenUntil > observedTime;
    if (frozen && !m.frozen && chance(0.7)) this.say(view, 'frozen', 2);
    if (m.weapon === 'rocket' && m.ammo > 1 && v.weapon === 'rocket' && v.ammo === 1) this.say(view, 'lastRocket', 2);
    if (m.weapon === 'rocket' && m.ammo === 1 && v.weapon !== 'rocket') this.say(view, 'rocketEmpty', 2);

    if (v.brewId >= 0 && m.brew < 0 && chance(0.7)) this.say(view, 'argue', 2, this.game.world.villagers[v.brewId]);
    m.brew = v.brewId;
    m.state = v.state;
    m.speaking = !!view.speaking;
    m.hit = v.hitFlash;
    m.partner = v.partnerId;
    m.faction = v.faction;
    m.believed = v.believed.length;
    m.activity = v.activity;
    m.hurt = v.hp < 35;
    m.weapon = v.weapon;
    m.hp = v.hp;
    m.frozen = frozen;
    m.ammo = v.ammo;
    m.expr = v.expression;
  }
}
