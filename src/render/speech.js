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

    const line = pickLine(category, override ?? this.context(view, other));
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
      b.root.alpha = Math.min(1, b.life / 0.35);
    }
  }

  /** Watch a villager for things worth saying. Called every frame; cheap edge detection. */
  watch(view) {
    const v = view.v;
    const m = (view.sp ??= { state: v.state, speaking: false, hit: 0, believed: v.believed.length, faction: v.faction, partner: v.partnerId, activity: v.activity, hurt: false, weapon: v.weapon, expr: v.expression, brew: -1 });
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
    m.expr = v.expression;
  }
}
