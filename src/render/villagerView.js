import { Circle, Container, Graphics } from 'pixi.js';
import { FACTIONS, NEUTRAL, NEUTRAL_LOOK, NEUTRAL_GROUP } from '../config/content.js';
import { ART, DRAMA, FIREARMS, VILLAGER } from '../config/tunables.js';

export const R = VILLAGER.radius;
const LEG = 8; // how far the body is lifted to make room for legs
const ARM = 11;
const INK = 0x2b2622;
const SKIN = 0xf3d3b0;
const SHOE = 0x3a3a46;
const DEATH_SECONDS = 0.5;
const PASTIMES = new Set(['dance', 'rest', 'shop', 'pray', 'train', 'fish', 'garden', 'eat']);

// Feet touch the ground at (0,0). Everything above is inside `torso`, which is lifted by LEG.
// The face is drawn a bit lower on triangles, where the body is narrow at the top.
const FACE_Y = { circle: -R, square: -R, hex: -R, triangle: -R * 0.8 };
export const TOP_Y = { circle: -2 * R - LEG, square: -2 * R - LEG, hex: -2 * R - LEG, triangle: -2.2 * R - LEG };
// Where the shoulders are (relative to the torso), by body shape.
const SHOULDER = { circle: [R * 0.92, -R * 1.05], square: [R * 0.98, -R * 1.3], hex: [R * 0.95, -R * 1.05], triangle: [R * 0.62, -R * 0.75] };

export const lookOfGroup = (g) => (g === NEUTRAL_GROUP || g < 0 ? NEUTRAL_LOOK : FACTIONS[g]);

export class VillagerView {
  /** Turn the cartoon blood on or off for everyone (a setting; the prompt asked for "no gore"). */
  static bloodEnabled = true;

  /** Which faction gets the gold ring (the active player's); -1 for none. Set by main.js. */
  static highlightSeat = -1;

  /** Calm view: hide thought bubbles (and, in main.js, speech and stains) so a big fight is easier to read. */
  static calm = false;

  /**
   * @param {import('../sim/villager.js').Villager} v
   * @param {{mine?: boolean, onHover?: (view: VillagerView) => void, onOut?: (view: VillagerView) => void}} opts
   */
  constructor(v, opts = {}) {
    this.v = v;
    this.opts = opts;
    this.root = new Container();

    // Hover (for the info card and relationship lines).
    this.root.eventMode = 'static';
    this.root.cursor = 'help';
    this.root.hitArea = new Circle(0, -R - LEG, R * 1.5);
    this.root.on('pointerover', () => opts.onHover?.(this));
    this.root.on('pointerout', () => opts.onOut?.(this));

    this.deadSince = null;
    this.speaking = false;
    this.recoil = 0; // set by Effects.shot when this villager fires a gun
    this.stagger = 0; // set when this villager takes a hit: knocked back, shaking, flashing
    this.staggerDir = 1;
    this.lastHp = this.v.hp;
    this.dim = false; // set by main.js during a spotlighted camera cut
    this.action = 'idle'; // for effects and sound: idle walk talk hug argue chase attack flee mourn + pastimes
    this.build();
  }

  /**
   * (Re)build everything that depends on the villager's faction colours. Called once at the
   * start and again if the villager defects to another faction.
   */
  build() {
    const v = this.v;
    for (const child of this.root.removeChildren()) child.destroy({ children: true });
    this.shownFaction = v.faction;
    const look = v.faction === NEUTRAL ? NEUTRAL_LOOK : FACTIONS[v.faction];
    this.look = look;
    const [sx, sy] = SHOULDER[v.shape];

    // A soft ring under your own villagers so you can find your people in a crowd.
    this.ring = new Graphics().ellipse(0, 0, R * 1.25, R * 0.5)
      .stroke({ width: 3, color: 0xffd36b, alpha: 0.9 })
      .fill({ color: 0xffd36b, alpha: 0.18 });
    // A soft two-layer shadow looks more grounded than one flat ellipse.
    this.shadow = new Graphics()
      .ellipse(0, 0, R * 1.1, R * 0.42).fill({ color: 0x000000, alpha: ART.shadowAlpha * 0.6 })
      .ellipse(0, 0, R * 0.75, R * 0.28).fill({ color: 0x000000, alpha: ART.shadowAlpha });

    this.rig = new Container(); // gets squashed / tilted
    // Legs and the far arm sit behind the body, the near arm in front. Both flip with facing.
    this.behind = new Container();
    this.legL = drawLeg(look, -5);
    this.legR = drawLeg(look, 5);
    this.armL = drawArm(look, -sx * 0.9, sy - LEG);
    this.behind.addChild(this.legL, this.legR, this.armL);

    this.torso = new Container();
    this.torso.y = -LEG;
    this.body = drawBody(v.shape, look);
    this.shade = drawShade(v.shape);
    this.wound = new Graphics();
    this.wound.visible = false;
    this.face = new Graphics();
    this.face.position.set(0, FACE_Y[v.shape]);
    this.mark = v.faction === NEUTRAL ? null : drawMark(FACTIONS[v.faction]);
    if (this.mark) this.mark.position.set(0, TOP_Y[v.shape] + LEG - 3);
    this.accessory = new Graphics();
    this.accessory.position.set(0, FACE_Y[v.shape]);
    this.torso.addChild(this.body, this.shade, this.wound, this.face, this.accessory);
    if (this.mark) this.torso.addChild(this.mark);

    this.front = new Container();
    this.armR = drawArm(look, sx * 0.9, sy - LEG);
    this.weaponGlyph = new Graphics();
    this.weaponGlyph.rotation = Math.PI / 2;
    this.toolGlyph = new Graphics();
    this.armR.hand.addChild(this.weaponGlyph, this.toolGlyph);
    this.front.addChild(this.armR);

    this.rig.addChild(this.behind, this.torso, this.front);

    this.thoughtBox = new Graphics();
    this.thoughtBox.position.set(0, TOP_Y[v.shape] - 22);
    this.thoughtBox.visible = false;
    this.hpBar = new Graphics();
    this.hpBar.position.set(0, 7);
    this.hpBar.visible = false;
    this.tomb = drawTombstone(look);
    this.tomb.visible = false;

    this.ring.visible = v.faction === VillagerView.highlightSeat && v.alive;
    this.root.addChild(this.ring, this.shadow, this.tomb, this.rig, this.thoughtBox, this.hpBar);
    if (!v.alive) { this.rig.visible = false; this.tomb.visible = true; this.shadow.visible = false; }

    // Forget what was drawn so the next update redraws it in the new colours.
    this.faceKey = '';
    this.weaponKey = '';
    this.hpKey = -1;
    this.thoughtKey = '';
    this.accessoryKey = '';
    this.toolKey = '';
    this.woundKey = '';
  }

  /** Where a speech bubble or particle should spawn: above the head, in world coordinates. */
  headX() { return this.root.x; }
  headY() { return this.root.y + TOP_Y[this.v.shape] - 4; }
  bodyY() { return this.root.y - R - LEG; }

  /**
   * @param {number} alpha  0..1, how far we are between the last two sim ticks
   * @param {number} time   animation seconds (keeps running between turns)
   */
  update(alpha, time) {
    const v = this.v;
    this.root.position.set(v.px + (v.x - v.px) * alpha, v.py + (v.y - v.py) * alpha);

    if (v.faction !== this.shownFaction) this.build(); // they changed sides
    if (!v.alive) {
      this.updateDead(time);
      return;
    }
    if (this.deadSince !== null) this.revive(); // a replay is showing them alive again
    this.ring.visible = v.faction === VillagerView.highlightSeat;
    this.root.zIndex = this.root.y; // villagers lower on screen draw in front
    this.root.alpha = this.dim ? DRAMA.dimOthers : 1;

    const speed = Math.hypot(v.vx, v.vy);
    const moving = speed > 8;
    const action = this.pickAction(v, moving);
    this.action = action;
    this.animate(v, action, moving, time);
    this.behind.scale.x = v.facing;
    this.front.scale.x = v.facing;

    // A hit knocks them away from the attacker, and they flash white for a moment.
    if (v.hp < this.lastHp - 0.5) {
      this.stagger = Math.min(1, 0.5 + (this.lastHp - v.hp) / 30);
      this.staggerDir = v.hitFromX <= v.x ? 1 : -1;
    }
    this.lastHp = v.hp;
    this.body.tint = this.stagger > 0.6 ? 0xffffff : this.bodyTint(v, action, time);
    this.face.x = v.facing * 2; // eyes drift toward where they are looking

    // Chatting villagers take turns: the one whose turn it is has an open mouth (and speech.js
    // gives them a bubble with real words).
    let speaking = false;
    if (v.state === 'talk' && v.targetId !== null && action === 'talk') {
      const slot = Math.floor(time / ART.talkTurnSeconds) % 2 === 0;
      speaking = (v.id < v.targetId) === slot;
    }
    this.speaking = speaking;

    // Thought bubble shows the strongest driver (hidden during a spotlight cut, to cut the clutter).
    const tKey = v.thought && !this.dim && !VillagerView.calm ? `${v.thought}:${v.thoughtGroup}` : '';
    this.thoughtBox.visible = tKey !== '';
    if (tKey !== this.thoughtKey) {
      this.thoughtKey = tKey;
      if (tKey) drawThought(this.thoughtBox, v.thought, v.thoughtGroup);
    }

    // Fighters bare their teeth; anyone who just got hit screams.
    const snarl = action === 'attack' && v.expression === 'angry';
    const key = `${v.expression}:${speaking || this.stagger > 0.3}:${snarl}`;
    if (key !== this.faceKey) {
      this.faceKey = key;
      drawFace(this.face, v.expression, speaking || this.stagger > 0.3, snarl);
    }

    const wKey = `${v.weapon}:${v.ammo}`;
    if (wKey !== this.weaponKey) {
      this.weaponKey = wKey;
      drawWeapon(this.weaponGlyph, v.weapon, v.ammo);
      this.weaponGlyph.scale.set(1.45); // big enough to read who is armed from across town
    }
    // Holding a tool for a pastime? Put the weapon away.
    this.weaponGlyph.visible = !PASTIMES.has(action);
    const tool = action === 'fish' ? 'rod' : action === 'garden' ? 'hoe' : action === 'eat' ? 'pastry' : action === 'shop' ? 'bag' : '';
    if (tool !== this.toolKey) {
      this.toolKey = tool;
      drawTool(this.toolGlyph, tool);
    }

    // Accessories show once a temperament has been seen (a shotgun carrier is obvious from the start).
    const accKey = v.trait && (v.revealed || v.trait === 'gunslinger') ? v.trait : '';
    if (accKey !== this.accessoryKey) {
      this.accessoryKey = accKey;
      drawAccessory(this.accessory, accKey, v.shape);
      if (this.mark) this.mark.y = TOP_Y[v.shape] + LEG - 3 - (accKey === 'gunslinger' ? 9 : 0);
    }

    const hp = Math.ceil(v.hp);
    this.hpBar.visible = hp < 100 && !this.dim;
    if (hp !== this.hpKey) {
      this.hpKey = hp;
      drawHp(this.hpBar, hp);
    }

    // Cartoon wounds: a plaster when hurt, a red smear when badly hurt.
    const wKey2 = VillagerView.bloodEnabled ? (hp < 35 ? 2 : hp < 65 ? 1 : 0) : 0;
    if (`${wKey2}` !== this.woundKey) {
      this.woundKey = `${wKey2}`;
      drawWound(this.wound, wKey2, v.id, v.shape);
      this.wound.visible = wKey2 > 0;
    }
  }

  pickAction(v, moving) {
    switch (v.state) {
      case 'talk':
        return v.expression === 'love' ? 'hug' : v.expression === 'angry' ? 'argue' : 'talk';
      case 'attack':
        return moving ? 'chase' : 'attack';
      case 'flee': return 'flee';
      case 'mourn': return 'mourn';
      default:
        if (v.brewId >= 0 && v.state === 'idle') return 'argue';
        if (moving) return 'walk';
        return v.state === 'idle' && v.activity ? v.activity : 'idle';
    }
  }

  /** Set the pose of the whole body (rig) and the limbs for this action. */
  animate(v, action, moving, time) {
    const rig = this.rig;
    rig.x = 0;
    rig.y = 0;
    rig.rotation = 0;
    rig.scale.set(1, 1);
    this.torso.y = -LEG;
    const t = time + v.id * 0.7;
    const sway = Math.sin(t * 1.6) * 0.05;
    const armed = v.weapon !== 'none';
    const firearm = FIREARMS.includes(v.weapon) && v.ammo > 0;
    let legL = 0;
    let legR = 0;
    let armL = 0.12 + sway;
    let armR = armed ? -0.35 : -0.12 - sway;

    if (action === 'walk' || action === 'chase' || action === 'flee') {
      // Walk: legs and arms swing in opposite phase, squash and stretch, tiny hop, small tilt.
      const fast = action === 'walk' ? 1 : action === 'chase' ? 1.5 : 1.8;
      const s = Math.sin(time * ART.walkStepSpeed * fast + v.id);
      const squash = ART.walkSquash * (action === 'walk' ? 1 : 1.6);
      rig.scale.set(1 + s * squash, 1 - s * squash);
      rig.y = -Math.abs(s) * (action === 'walk' ? 2.5 : 4);
      rig.rotation = s * ART.walkTilt * v.facing + (action === 'chase' ? 0.14 * v.facing : 0);
      const swing = action === 'walk' ? 0.75 : 1.0;
      legL = s * swing;
      legR = -s * swing;
      armL = -s * (swing + 0.1);
      armR = s * (swing + 0.1);
      if (action === 'flee') {
        rig.x = Math.sin(time * 55 + v.id) * 1.2; // trembling
        armL = -2.7 + Math.sin(time * 14) * 0.5; // arms up in a panic
        armR = -2.5 - Math.sin(time * 14) * 0.5;
      } else if (action === 'chase' && armed) {
        armR = -1.9;
      }
    } else if (action === 'hug') {
      rig.rotation = v.facing * (0.12 + Math.sin(t * 5) * 0.03);
      rig.x = v.facing * 4;
      const p = 1 + 0.04 * Math.sin(t * 7);
      rig.scale.set(p, p);
      armL = -1.5;
      armR = -1.4; // wrapped around the other one
    } else if (action === 'argue') {
      rig.x = Math.sin(time * 45 + v.id) * 1.1; // angry jitter
      rig.rotation = Math.sin(t * 12) * 0.05;
      armR = -1.5 + Math.sin(t * 9) * 0.35; // pointing a finger
      armL = 0.4;
    } else if (action === 'attack') {
      rig.x = Math.sin(time * 45 + v.id) * 1.6; // shoving and scrapping
      rig.y = Math.abs(Math.sin(time * 14 + v.id)) * -1.5;
      const aiming = firearm && v.escalation >= 2;
      if (aiming) {
        armR = -1.5;
        armL = -1.25;
      } else if (v.swing > 0) {
        // Overhead swing: raised, then down hard.
        armR = -2.5 + (1 - v.swing) * 2.1;
        rig.rotation = (1 - v.swing) * 0.18 * v.facing;
      } else {
        armR = -1.9 + Math.sin(t * 8) * 0.15; // guard up
        armL = -0.6;
      }
    } else if (action === 'mourn') {
      rig.rotation = v.facing * 0.2; // head bowed
      rig.scale.set(1, 0.95);
      armL = -2.4;
      armR = -2.3; // hands to the face
    } else if (action === 'talk') {
      rig.rotation = Math.sin(t * 6) * 0.03;
      const b = (Math.sin(t * ART.idleBobSpeed * 1.6) + 1) / 2;
      rig.scale.set(1, 1 + b * ART.idleBobAmount);
      if (this.speaking) armR = -0.9 + Math.sin(t * 5) * 0.5; // gesturing while speaking
    } else if (PASTIMES.has(action)) {
      ({ armL, armR, legL, legR } = this.pastimePose(rig, action, v, t, armL, armR));
    } else {
      const b = (Math.sin(t * ART.idleBobSpeed) + 1) / 2;
      rig.scale.set(1, 1 + b * ART.idleBobAmount);
    }

    // Badly hurt villagers limp and lean.
    if (v.hp < 35 && VillagerView.bloodEnabled && (action === 'walk' || action === 'chase')) {
      rig.rotation += 0.12 * v.facing;
      rig.y += Math.sin(time * 8 + v.id) * 1.5;
    }
    // Recoil: a shot kicks the shooter backwards and throws the arms up.
    if (this.recoil > 0.02) {
      rig.x -= v.facing * this.recoil * 6;
      rig.rotation -= v.facing * this.recoil * 0.14;
      armR -= this.recoil * 0.5;
      this.recoil *= 0.86;
    }
    if (this.stagger > 0.02) {
      rig.x += this.staggerDir * this.stagger * 9 + Math.sin(time * 70 + v.id) * this.stagger * 2;
      rig.rotation += this.staggerDir * this.stagger * 0.35;
      armL -= this.stagger * 1.2;
      armR -= this.stagger * 1.2;
      this.stagger *= 0.9;
    }
    if (v.swing > 0 && action !== 'attack') rig.x += Math.sin((1 - v.swing) * Math.PI) * ART.lungePixels * v.facing;
    if (action === 'attack' && v.swing > 0) rig.x += Math.sin((1 - v.swing) * Math.PI) * ART.lungePixels * v.facing;

    this.legL.rotation = legL;
    this.legR.rotation = legR;
    this.armL.rotation = armL;
    this.armR.rotation = armR;
  }

  /** Little animations for the things villagers do at places. Returns the limb angles. */
  pastimePose(rig, action, v, t, armL, armR) {
    let legL = 0;
    let legR = 0;
    switch (action) {
      case 'dance': {
        const s = Math.sin(t * 8);
        rig.y = -Math.abs(s) * 6;
        rig.rotation = s * 0.14;
        rig.scale.set(1 + Math.abs(s) * 0.04, 1 - Math.abs(s) * 0.04);
        armL = -2.5 + Math.sin(t * 8) * 0.45;
        armR = -2.5 - Math.sin(t * 8) * 0.45;
        legL = s * 0.5;
        legR = -s * 0.5;
        break;
      }
      case 'rest': // slumped, legs stuck out, slowly breathing
        rig.rotation = v.facing * 0.08;
        rig.y = 3;
        rig.scale.set(1.03, 0.9 + Math.sin(t * 1.5) * 0.015);
        legL = -1.25;
        legR = -1.15;
        armL = 0.5;
        armR = 0.45;
        break;
      case 'shop': // looking left and right at the stalls
        rig.x = Math.sin(t * 1.4) * 3;
        rig.rotation = Math.sin(t * 1.4) * 0.05;
        armR = -0.7;
        break;
      case 'pray': // head bowed, hands together
        rig.rotation = v.facing * 0.14;
        rig.scale.set(1, 0.95 + Math.sin(t * 2) * 0.015);
        armL = -1.15;
        armR = -1.0;
        break;
      case 'train': { // practice swings
        const s = Math.max(0, Math.sin(t * 6));
        rig.x = s * 5 * v.facing;
        armR = -2.4 + s * 2.0;
        armL = -0.5;
        break;
      }
      case 'fish': // leaning toward the water, both hands on the rod, occasionally tugging
        rig.rotation = v.facing * (0.16 + Math.max(0, Math.sin(t * 0.9)) * 0.08);
        armL = -1.2;
        armR = -1.1 + Math.max(0, Math.sin(t * 0.9)) * 0.3;
        break;
      case 'garden': // bending over the crops with a hoe
        rig.rotation = v.facing * (0.28 + Math.sin(t * 2.5) * 0.1);
        rig.scale.set(1, 0.93);
        armL = -1.0;
        armR = -1.0 + Math.sin(t * 2.5) * 0.5;
        break;
      case 'eat': // munching, hand to mouth
        rig.scale.set(1 + Math.sin(t * 14) * 0.03, 1 - Math.sin(t * 14) * 0.03);
        armR = -2.1 + Math.sin(t * 7) * 0.2;
        break;
    }
    return { armL, armR, legL, legR };
  }

  bodyTint(v, action, time) {
    if (v.hitFlash > 0) return 0xff8f8f;
    if (action === 'attack' || action === 'chase' || action === 'argue') {
      const pulse = 0.5 + 0.5 * Math.sin(time * 14 + v.id); // red tint pulse
      const gb = Math.round(255 - 80 * pulse);
      return (0xff << 16) | (gb << 8) | gb;
    }
    return 0xffffff;
  }

  /** Undo the death visuals (only happens when a recap replay rewinds to before the death). */
  revive() {
    this.deadSince = null;
    this.rig.visible = true;
    this.shadow.visible = true;
    this.tomb.visible = false;
    this.root.eventMode = 'static';
    this.ring.visible = this.v.faction === VillagerView.highlightSeat;
    this.faceKey = '';
  }

  updateDead(time) {
    this.root.zIndex = this.root.y - 10000; // tombstones sit under the living
    this.root.eventMode = 'none';
    this.root.alpha = this.dim ? DRAMA.dimOthers : 1;
    this.thoughtBox.visible = false;
    this.hpBar.visible = false;
    this.speaking = false;
    this.ring.visible = false;
    // Animation time, not sim time: the sim is paused between turns but the death should still play out.
    this.deadSince ??= time;
    const t = Math.min(1, (time - this.deadSince) / DEATH_SECONDS);
    if (t < 1) {
      // Cartoon death: spin and shrink while the tombstone fades in.
      if (this.faceKey !== 'dead') {
        this.faceKey = 'dead';
        drawFace(this.face, 'dead', false);
      }
      this.rig.rotation = t * Math.PI * 2;
      this.rig.scale.set(1 - t);
      this.rig.y = 0;
      this.rig.x = 0;
      this.body.tint = 0xffffff;
      this.tomb.visible = true;
      this.tomb.alpha = t;
    } else {
      this.rig.visible = false;
      this.shadow.visible = false;
      this.tomb.visible = true;
      this.tomb.alpha = 1;
    }
  }
}

// ---- drawing ----------------------------------------------------------------------

function drawBody(shape, look) {
  const g = new Graphics();
  switch (shape) {
    case 'circle':
      g.circle(0, -R, R);
      break;
    case 'square':
      g.roundRect(-R, -2 * R, 2 * R, 2 * R, R * 0.35);
      break;
    case 'triangle':
      g.poly([0, -2.2 * R, R * 1.15, -1, -R * 1.15, -1]);
      break;
    case 'hex':
      g.poly(hexPoints(R * 1.05));
      break;
  }
  g.fill(look.color).stroke({ width: ART.outlineWidth, color: look.dark, join: 'round' });
  return g;
}

/** Soft light from the top-left and a darker belly: gives the flat shapes some volume. */
function drawShade(shape) {
  const g = new Graphics();
  const cy = shape === 'triangle' ? -R * 0.55 : -R;
  g.ellipse(R * 0.15, cy + R * 0.55, R * 0.8, R * 0.35).fill({ color: 0x000000, alpha: 0.09 });
  const hx = shape === 'triangle' ? -R * 0.25 : -R * 0.42;
  const hy = shape === 'triangle' ? -R * 1.2 : -R * 1.45;
  g.ellipse(hx, hy, R * 0.42, R * 0.22).fill({ color: 0xffffff, alpha: 0.24 });
  g.rotation = 0;
  return g;
}

function hexPoints(r) {
  const pts = [];
  for (let i = 0; i < 6; i++) {
    const a = (Math.PI / 3) * i + Math.PI / 6;
    pts.push(Math.cos(a) * r, -R + Math.sin(a) * r);
  }
  return pts;
}

function drawLeg(look, x) {
  const c = new Container();
  c.position.set(x, -LEG + 2);
  const g = new Graphics();
  g.roundRect(-2.2, 0, 4.4, LEG - 1, 2).fill(look.dark);
  g.ellipse(1, LEG - 0.5, 4.4, 2.6).fill(SHOE).stroke({ width: 1, color: INK });
  c.addChild(g);
  return c;
}

/** An arm pivoting at the shoulder; `hand` is where a weapon or tool attaches. */
function drawArm(look, x, y) {
  const c = new Container();
  c.position.set(x, y);
  const g = new Graphics();
  g.moveTo(0, 0).lineTo(0, ARM).stroke({ width: 4.6, color: look.dark, cap: 'round' });
  g.moveTo(0, 0).lineTo(0, ARM).stroke({ width: 2.2, color: look.color, cap: 'round' });
  c.addChild(g);
  const hand = new Container();
  hand.position.set(0, ARM);
  hand.addChild(new Graphics().circle(0, 0, 3.3).fill(SKIN).stroke({ width: 1.3, color: INK }));
  c.addChild(hand);
  c.hand = hand;
  return c;
}

// Faction symbol floating above the head. Dark fill + pale outline reads on any body colour.
function drawMark(faction) {
  const g = new Graphics();
  const pale = { width: 2.5, color: 0xfff8e6, join: 'round' };
  switch (faction.mark) {
    case 'triangle': // party hat
      g.poly([-7, 0, 7, 0, 0, -14]).fill(faction.dark).stroke(pale);
      break;
    case 'wave':
      g.moveTo(-10, -4).quadraticCurveTo(-5, -14, 0, -6).quadraticCurveTo(5, 2, 10, -8)
        .stroke({ width: 6, color: 0xfff8e6, cap: 'round', join: 'round' });
      g.moveTo(-10, -4).quadraticCurveTo(-5, -14, 0, -6).quadraticCurveTo(5, 2, 10, -8)
        .stroke({ width: 3, color: faction.dark, cap: 'round', join: 'round' });
      break;
    case 'leaf':
      g.moveTo(0, 0).quadraticCurveTo(-10, -8, 0, -17).quadraticCurveTo(10, -8, 0, 0)
        .fill(faction.dark).stroke(pale);
      break;
    case 'star': {
      const pts = [];
      for (let i = 0; i < 10; i++) {
        const r = i % 2 === 0 ? 9 : 4;
        const a = -Math.PI / 2 + (Math.PI / 5) * i;
        pts.push(Math.cos(a) * r, -9 + Math.sin(a) * r);
      }
      g.poly(pts).fill(faction.dark).stroke(pale);
      break;
    }
  }
  return g;
}

/** Temperament accessories, drawn relative to the face. Shown only once revealed. */
function drawAccessory(g, trait, shape) {
  g.clear();
  const top = TOP_Y[shape] + LEG - FACE_Y[shape] + 1; // y of the top of the head relative to the face
  switch (trait) {
    case 'gunslinger': // a cowboy hat
      g.ellipse(0, top + 3, 19, 5).fill(0x7a5230).stroke({ width: 1.8, color: INK });
      g.roundRect(-9, top - 8, 18, 12, 4).fill(0x8a5a35).stroke({ width: 1.8, color: INK });
      g.rect(-9, top - 1, 18, 3).fill(0xc43a3a);
      break;
    case 'brawler': // a red headband
      g.roundRect(-R * 0.75, -R * 0.62, R * 1.5, 4.2, 2).fill(0xd62828).stroke({ width: 1, color: INK });
      g.poly([R * 0.7, -R * 0.62, R * 0.95, -R * 0.4, R * 0.55, -R * 0.45]).fill(0xd62828);
      break;
    case 'bodyguard': // dark shades
      g.roundRect(-R * 0.62, -R * 0.36, R * 1.24, 5.5, 2).fill(INK);
      g.moveTo(-R * 0.62, -R * 0.3).lineTo(-R * 0.85, -R * 0.4).stroke({ width: 1.4, color: INK });
      break;
    case 'medic': // a red cross on the chest
      g.circle(0, R * 0.82, 6.2).fill(0xffffff).stroke({ width: 1.2, color: INK });
      g.rect(-1.6, R * 0.82 - 4, 3.2, 8).fill(0xd62828);
      g.rect(-4, R * 0.82 - 1.6, 8, 3.2).fill(0xd62828);
      break;
    case 'peacemaker': // a white sash and olive branch
      g.moveTo(-R * 0.6, R * 0.1).lineTo(R * 0.6, R * 1.1).stroke({ width: 4.4, color: 0xffffff, cap: 'round' });
      g.moveTo(-R * 0.6, R * 0.1).lineTo(R * 0.6, R * 1.1).stroke({ width: 1, color: INK, alpha: 0.4, cap: 'round' });
      break;
    case 'coward': // a bead of sweat on the brow
      g.poly([R * 0.7, -R * 0.75, R * 0.95, -R * 0.4, R * 0.7, -R * 0.2, R * 0.45, -R * 0.4]).fill(0x6bb8f0).stroke({ width: 1, color: INK });
      break;
    case 'wildcard': // a jaunty feather
      g.moveTo(R * 0.2, top).quadraticCurveTo(R * 1.1, top - 14, R * 0.7, top - 22).stroke({ width: 2.4, color: 0xff7aa8, cap: 'round' });
      g.moveTo(R * 0.55, top - 10).lineTo(R * 1.0, top - 12).stroke({ width: 1.6, color: 0x7ad0ff, cap: 'round' });
      break;
  }
}

// Thought bubble: icon for the driver + a dot in the colour of the group it is about.
function drawThought(g, icon, group) {
  g.clear();
  g.roundRect(-14, -22, 28, 22, 8).fill(0xffffff).stroke({ width: 1.5, color: INK });
  g.poly([-3, 0, 0, 5, 3, 0]).fill(0xffffff);
  const cx = group >= 0 ? -3 : 0;
  const cy = -11;
  switch (icon) {
    case 'heart': heart(g, cx, cy, 4.6); break;
    case 'angry':
      for (const [dx, dy] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
        g.moveTo(cx + dx * 2, cy + dy * 5).lineTo(cx + dx * 5, cy + dy * 2).stroke({ width: 2, color: 0xd62828, cap: 'round' });
      }
      break;
    case 'sweat':
      g.poly([cx, cy - 6, cx + 4.5, cy + 1, cx, cy + 5, cx - 4.5, cy + 1]).fill(0x4aa3e8).stroke({ width: 1.2, color: INK });
      break;
    case 'question':
      g.moveTo(cx - 3, cy - 3).quadraticCurveTo(cx - 3, cy - 7, cx, cy - 7).quadraticCurveTo(cx + 4, cy - 7, cx + 3, cy - 3)
        .quadraticCurveTo(cx + 2, cy - 1, cx, cy).stroke({ width: 2.2, color: INK, cap: 'round' });
      g.circle(cx, cy + 4, 1.4).fill(INK);
      break;
    case 'skull':
      g.circle(cx, cy - 1, 5.4).fill(0xe9e9e9).stroke({ width: 1.3, color: INK });
      g.rect(cx - 3, cy + 3, 6, 3.5).fill(0xe9e9e9).stroke({ width: 1.1, color: INK });
      g.circle(cx - 2, cy - 1, 1.5).fill(INK);
      g.circle(cx + 2, cy - 1, 1.5).fill(INK);
      break;
    case 'shield':
      g.poly([cx - 5, cy - 6, cx + 5, cy - 6, cx + 5, cy, cx, cy + 6, cx - 5, cy]).fill(0x5a8fe0).stroke({ width: 1.4, color: INK, join: 'round' });
      break;
    case 'flag':
      g.rect(cx - 4, cy - 6, 1.8, 12).fill(INK);
      g.poly([cx - 2, cy - 6, cx + 5, cy - 3, cx - 2, cy]).fill(0xd62828);
      break;
  }
  if (group >= 0) {
    g.circle(8, -6, 4).fill(lookOfGroup(group).color).stroke({ width: 1.5, color: INK });
  }
}

function drawTombstone(look) {
  const g = new Graphics();
  g.roundRect(-9, -26, 18, 26, 8).fill(0xb8b8b8).stroke({ width: 2.5, color: INK, join: 'round' });
  g.rect(-5, -16, 10, 3).fill(INK);
  g.rect(-1.5, -20, 3, 11).fill(INK);
  g.rect(-9, -4, 18, 4).fill(look.color); // faction colour band so you can still tell who fell
  return g;
}

function drawHp(g, hp) {
  g.clear();
  const w = 26;
  g.roundRect(-w / 2, 0, w, 4, 2).fill({ color: 0x000000, alpha: 0.45 });
  const color = hp > 60 ? 0x5fd36b : hp > 30 ? 0xf2c53d : 0xe5533d;
  g.roundRect(-w / 2, 0, (w * hp) / 100, 4, 2).fill(color);
}

/** Cartoon wounds, never gore: a plaster, then a red smear. */
function drawWound(g, level, id, shape) {
  g.clear();
  if (level === 0) return;
  const side = id % 2 === 0 ? -1 : 1;
  const x = side * R * 0.45;
  const y = (shape === 'triangle' ? -R * 0.3 : -R * 0.5) + (id % 3) * 2;
  if (level === 1) {
    g.roundRect(x - 5, y - 2.2, 10, 4.4, 2).fill(0xf6dcb4).stroke({ width: 1, color: INK });
    g.circle(x, y, 1.1).fill(0xd62828);
  } else {
    g.ellipse(x, y, 7.5, 5.5).fill({ color: 0xb3202a, alpha: 0.85 });
    g.circle(x + side * 6, y + 5, 2.2).fill({ color: 0xb3202a, alpha: 0.85 });
    g.circle(x - side * 3, y + 7.5, 1.6).fill({ color: 0xb3202a, alpha: 0.85 });
    g.roundRect(x - 5, y - 2, 10, 4, 2).fill(0xf6dcb4).stroke({ width: 1, color: INK });
  }
}

// Small held-weapon glyphs, just enough to read "who is armed". Drawn relative to the hand:
// melee weapons point up, firearms point along +x (the glyph is rotated by the arm).
function drawWeapon(g, weapon, ammo) {
  g.clear();
  const line = (x1, y1, x2, y2, w, c) => g.moveTo(x1, y1).lineTo(x2, y2).stroke({ width: w, color: c, cap: 'round' });
  switch (weapon) {
    case 'pan':
      line(0, 3, 0, -4, 3, INK);
      g.circle(0, -11, 7).fill(0x555555).stroke({ width: 1.5, color: INK });
      break;
    case 'bat':
      line(0, 3, 0, -22, 5, 0xb98a55);
      line(0, 3, 0, -22, 1.5, INK);
      break;
    case 'knife':
      line(0, 3, 0, -3, 3, INK);
      g.poly([-2.5, -3, 0, -17, 2.5, -3]).fill(0xe8e8ee).stroke({ width: 1.2, color: INK });
      break;
    case 'shotgun':
      g.roundRect(-3, -2.4, 26, 3.4, 1.5).fill(INK);
      g.roundRect(-3, 0.6, 26, 3, 1.5).fill(0x555555);
      g.roundRect(-10, -2, 9, 6.5, 2).fill(0xb98a55).stroke({ width: 1, color: INK });
      break;
    case 'gun':
      g.roundRect(-2, -3, 14, 5, 1.5).fill(INK);
      g.roundRect(-2, 0, 5, 8, 1.5).fill(INK);
      break;
  }
  void ammo;
}

function drawTool(g, tool) {
  g.clear();
  const line = (x1, y1, x2, y2, w, c) => g.moveTo(x1, y1).lineTo(x2, y2).stroke({ width: w, color: c, cap: 'round' });
  switch (tool) {
    case 'rod': // a fishing rod with a line
      line(0, 0, 14, -30, 2, 0x8a5a35);
      line(14, -30, 30, -4, 0.8, 0xffffff);
      g.circle(30, -2, 1.6).fill(0xe5533d);
      break;
    case 'hoe':
      line(0, 4, 4, -22, 2.6, 0x8a5a35);
      g.poly([4, -22, 12, -22, 10, -17, 4, -18]).fill(0x888888).stroke({ width: 1, color: INK });
      break;
    case 'pastry':
      g.ellipse(2, -3, 5, 3.2).fill(0xd9a35a).stroke({ width: 1.2, color: INK });
      break;
    case 'bag':
      g.roundRect(-2, 0, 11, 9, 2).fill(0xc43a3a).stroke({ width: 1.2, color: INK });
      g.moveTo(1, 0).quadraticCurveTo(3.5, -6, 6, 0).stroke({ width: 1.2, color: INK });
      break;
  }
}

export function heart(g, x, y, s, color = 0xe0245e) {
  g.moveTo(x, y + s * 0.9)
    .bezierCurveTo(x - s * 1.7, y - s * 0.1, x - s * 0.8, y - s * 1.5, x, y - s * 0.5)
    .bezierCurveTo(x + s * 0.8, y - s * 1.5, x + s * 1.7, y - s * 0.1, x, y + s * 0.9)
    .fill(color);
}

/** Eyes + mouth only. The full set: calm, happy, love, angry, scared, suspicious, sad, dead. */
function drawFace(g, expression, speaking, snarl = false) {
  g.clear();
  const eyeX = R * 0.36;
  const eyeY = -R * 0.18;
  const mouthY = R * 0.3;
  const stroke = { width: 1.8, color: INK, cap: 'round' };
  const brow = (x1, y1, x2, y2, color = INK) => g.moveTo(x1, y1).lineTo(x2, y2).stroke({ ...stroke, width: 2.2, color });
  const eye = (x, y, r = 2.3) => {
    g.circle(x, y, r).fill(INK);
    g.circle(x - r * 0.3, y - r * 0.35, r * 0.34).fill(0xffffff); // a glint makes eyes look alive
  };

  switch (expression) {
    case 'love':
      heart(g, -eyeX, eyeY, 3.6);
      heart(g, eyeX, eyeY, 3.6);
      break;
    case 'scared':
      for (const x of [-eyeX, eyeX]) {
        g.circle(x, eyeY, 3.8).fill(0xffffff).stroke({ width: 1.2, color: INK });
        g.circle(x, eyeY, 1.3).fill(INK);
      }
      break;
    case 'angry':
      eye(-eyeX, eyeY + 1);
      eye(eyeX, eyeY + 1);
      brow(-eyeX - 4, eyeY - 6, -eyeX + 3, eyeY - 2, 0x8f1a1a);
      brow(eyeX + 4, eyeY - 6, eyeX - 3, eyeY - 2, 0x8f1a1a);
      break;
    case 'suspicious':
      // Side-eye and one raised eyebrow.
      for (const x of [-eyeX, eyeX]) {
        g.circle(x, eyeY, 3.2).fill(0xffffff).stroke({ width: 1, color: INK });
        g.circle(x + 1.6, eyeY, 1.5).fill(INK);
      }
      brow(-eyeX - 4, eyeY - 3.5, -eyeX + 3, eyeY - 3.5);
      g.moveTo(eyeX - 4, eyeY - 4).quadraticCurveTo(eyeX, eyeY - 9, eyeX + 4, eyeY - 6).stroke({ ...stroke, width: 2.2 });
      break;
    case 'sad':
      eye(-eyeX, eyeY + 1);
      eye(eyeX, eyeY + 1);
      brow(-eyeX - 3, eyeY - 2.5, -eyeX + 3, eyeY - 6);
      brow(eyeX + 3, eyeY - 2.5, eyeX - 3, eyeY - 6);
      break;
    case 'dead':
      for (const x of [-eyeX, eyeX]) {
        g.moveTo(x - 3, eyeY - 3).lineTo(x + 3, eyeY + 3).stroke(stroke);
        g.moveTo(x + 3, eyeY - 3).lineTo(x - 3, eyeY + 3).stroke(stroke);
      }
      break;
    default:
      eye(-eyeX, eyeY);
      eye(eyeX, eyeY);
  }

  if (expression === 'happy' || expression === 'love') {
    g.circle(-eyeX - 2, mouthY - 3, 2.8).fill({ color: 0xff8fa3, alpha: 0.6 });
    g.circle(eyeX + 2, mouthY - 3, 2.8).fill({ color: 0xff8fa3, alpha: 0.6 });
  }

  if (expression === 'dead') {
    g.moveTo(-4, mouthY + 1).lineTo(4, mouthY + 1).stroke(stroke);
  } else if (speaking || expression === 'scared') {
    g.ellipse(0, mouthY + 1, 3, 3.6).fill(INK);
    g.ellipse(0, mouthY + 2.4, 1.8, 1.3).fill(0xe5737f);
  } else if (expression === 'angry' && snarl) {
    // Bared teeth, like the grinning brawlers in the reference.
    g.roundRect(-6, mouthY - 2, 12, 7, 2).fill(0xffffff).stroke({ ...stroke, width: 1.6 });
    g.moveTo(-2, mouthY - 2).lineTo(-2, mouthY + 5).stroke({ ...stroke, width: 1 });
    g.moveTo(2, mouthY - 2).lineTo(2, mouthY + 5).stroke({ ...stroke, width: 1 });
  } else if (expression === 'angry') {
    g.moveTo(-5, mouthY + 3).quadraticCurveTo(0, mouthY - 3, 5, mouthY + 3).stroke(stroke);
  } else if (expression === 'sad') {
    g.moveTo(-4, mouthY + 3).quadraticCurveTo(0, mouthY - 1, 4, mouthY + 3).stroke(stroke);
  } else if (expression === 'suspicious') {
    g.moveTo(-3, mouthY + 1).lineTo(4, mouthY - 1).stroke(stroke);
  } else if (expression === 'calm') {
    g.moveTo(-3, mouthY).lineTo(3, mouthY).stroke(stroke);
  } else {
    g.moveTo(-5, mouthY - 1).quadraticCurveTo(0, mouthY + 6, 5, mouthY - 1).stroke(stroke);
  }
}
