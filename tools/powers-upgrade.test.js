import test from 'node:test';
import assert from 'node:assert/strict';
import { createGame, updateGame } from '../src/sim/turn.js';
import { castPower, validatePower, normalizePowerArgs, nearestPowerTarget, POWER_DEFS } from '../src/sim/powers.js';
import { resolveCombat, updateBombs } from '../src/sim/combat.js';
import { stepWorld, startAttack } from '../src/sim/brain.js';
import { updatePowerEffects } from '../src/sim/powerEffects.js';
import { authoritativeState } from '../src/sim/state.js';
import { parseCommand, resolvePower } from '../src/sim/parser.js';
import { Replay } from '../src/render/replay.js';
import { COMBAT, POWERS } from '../src/config/tunables.js';
import { attributeKill, buildHighlights } from '../src/sim/highlights.js';

function fresh(seed = 717) {
  const g = createGame({ seed, seats: Array.from({ length: 4 }, () => ({ name: 'Test', kind: 'human' })), cosmetics: true });
  g.phase = 'sim'; g.turn = g.world.turn = 5; g.world.peaceful = false; g.world.time = 10;
  g.power.fill(3);
  g.world.villagers.forEach((v, i) => { v.x = v.px = 50 + i * 27; v.y = v.py = 100; v.thinkTimer = 100; v.timer = 100; v.state = 'idle'; });
  return g;
}
const own = g => g.world.villagers.find(v => v.faction === 0);
const foe = g => g.world.villagers.find(v => v.faction === 1);
const at = (v, x = 950, y = 570) => { v.x = v.px = x; v.y = v.py = y; return v; };
function duel(g, weapon = 'gun') {
  const a = at(own(g)), b = at(foe(g), 980, 570);
  Object.assign(a, { state: 'attack', targetId: b.id, weapon, ammo: 100, escalation: 2, cd: 0, partnerId: -1 });
  Object.assign(b, { state: 'idle', hp: 100, partnerId: -1, guardBonus: 0, blessUntil: 0 });
  return [a, b];
}

test('nearby aim is pure, filters eligible allies and affects exactly one villager', () => {
  const g = fresh(); const a = at(own(g)); a.hp = 50;
  const b = at(g.world.villagers.find(v => v.faction === 0 && v !== a), 980, 570); b.hp = 40;
  at(foe(g), 952, 570).hp = 10;
  const before = authoritativeState(g);
  for (let i = 0; i < 50; i++) assert.equal(nearestPowerTarget(g, 0, 'miracle', 950, 552, 85).id, a.id);
  assert.deepEqual(authoritativeState(g), before);
  assert.ok(castPower(g, 0, 'miracle', { villagerId: a.id }).ok);
  assert.equal(a.hp, 95); assert.equal(b.hp, 40); assert.equal(foe(g).hp, 10);
  assert.equal(nearestPowerTarget(g, 0, 'weapon', 100, 900, 85), null);
});

test('Miracle rejects rivals and full health without spending power or seeded RNG', () => {
  const g = fresh(), before = authoritativeState(g);
  assert.equal(castPower(g, 0, 'miracle', { villagerId: foe(g).id }).ok, false);
  assert.equal(castPower(g, 0, 'miracle', { villagerId: own(g).id }).ok, false);
  assert.deepEqual(authoritativeState(g), before);
});

test('Whirlpool hurts allies and rivals equally, caps centre damage at 39, expires, and respects Aegis', () => {
  const g = fresh(), a = at(own(g)), b = at(foe(g));
  const c = at(g.world.villagers.find(v => v.faction === 2)); c.blessUntil = 100;
  const edge = at(g.world.villagers.find(v => v.faction === 3), 950 + POWERS.whirlpool.radius, 570);
  assert.ok(castPower(g, 0, 'whirlpool', { x: 950, y: 570 }).ok);
  for (let i = 0; i < 60; i++) { g.world.time += 0.05; updatePowerEffects(g.world, 0.05); }
  g.world.time = 13.001; updatePowerEffects(g.world, 0.001);
  assert.ok(Math.abs(a.hp - 61) < 1e-8); assert.equal(a.hp, b.hp);
  assert.ok(Math.abs(c.hp - 84.4) < 1e-8); assert.equal(edge.hp, 100);
  assert.equal(g.world.whirlpools.length, 0);
  const hp = a.hp; g.world.time += 10; updatePowerEffects(g.world, 10); assert.equal(a.hp, hp);
});

test('Freeze spares allies and immobilizes rivals for 7 seconds, even after Enrage', () => {
  const g = fresh(), [a,b] = duel(g); a.state='idle'; a.weapon='none';
  assert.ok(castPower(g,0,'freeze',{x:a.x,y:a.y}).ok);
  assert.equal(a.frozenUntil,0); assert.equal(b.frozenUntil,17);
  assert.ok(castPower(g,1,'enrage',{villagerId:b.id}).ok);
  const x=b.x,y=b.y,hp=a.hp;
  for(let i=0;i<139;i++)stepWorld(g.world,.05);
  assert.equal(b.x,x);assert.equal(b.y,y);assert.equal(a.hp,hp);
  g.world.time=17.01;at(a,b.x+10,b.y);b.state='attack';b.targetId=a.id;b.cd=0;
  g.world.rng=()=>.1;resolveCombat(g.world,.05);assert.ok(a.hp<hp);
});

test('Blackout heals allies, damages enemies once, and blocks combat for exactly 12 seconds', () => {
  const g=fresh(),[a,b]=duel(g);a.hp=85;b.hp=50;
  const dead=g.world.villagers.find(v=>v.faction===0&&v!==a);dead.alive=false;dead.hp=0;
  assert.ok(castPower(g,0,'blackout',{}).ok);
  const hp=b.hp;assert.ok(hp>=40&&hp<=45);assert.equal(a.hp,100);assert.equal(dead.hp,0);assert.equal(g.world.blackoutUntil,22);
  for(const time of [10,12,21.999]){g.world.time=time;a.state='attack';a.targetId=b.id;a.cd=0;resolveCombat(g.world,.05);assert.equal(b.hp,hp);}
  g.world.time=22;a.cd=0;g.world.rng=()=>.1;resolveCombat(g.world,.05);assert.ok(b.hp<hp);
});

test('a launcher is picked up by the first nearby villager of any faction, freezes cannot pick up', () => {
  const g = fresh(), rival = at(foe(g)); rival.frozenUntil = 14;
  assert.ok(castPower(g, 0, 'launcher', { x: rival.x, y: rival.y }).ok);
  updatePowerEffects(g.world, 0.05); assert.equal(g.world.weaponDrops.length, 1);
  rival.frozenUntil = 0; updatePowerEffects(g.world, 0.05);
  assert.equal(rival.weapon, 'rocket'); assert.equal(rival.ammo, 5); assert.equal(g.world.weaponDrops.length, 0);
  assert.equal(validatePower(g, 1, 'weapon', { villagerId: rival.id }).ok, false);
});

test('five rockets deplete the launcher; stronger delayed blasts spare the shooter faction', () => {
  const g = fresh(), [a, b] = duel(g, 'rocket'); a.ammo = 5;
  const ally = at(g.world.villagers.find(v => v.faction === 0 && v !== a), b.x, b.y);
  g.world.rng = () => 0.4;
  for (let i = 0; i < 5; i++) {
    b.hp = 100;
    a.cd = 0; a.state = 'attack'; a.targetId = b.id;
    resolveCombat(g.world, 0.05);
    assert.equal(g.world.rockets.length, 1);
    const r = g.world.rockets[0]; assert.equal(r.seat, 0);
    g.world.time = r.at + 0.001; updatePowerEffects(g.world, 0.05);
    assert.equal(g.world.rockets.length, 0); assert.equal(ally.hp, 100);
    assert.ok(Math.abs(b.hp - (100 - POWERS.fireball.maxDamage * POWERS.launcher.damageMultiplier)) < 1e-8);
  }
  assert.equal(a.weapon, 'none'); assert.equal(a.ammo, 0);
});

test('confirmed gun hits have a 20% critical boundary, exactly double damage; Strength multiplies once', () => {
  function hit(criticalRoll, bonus = 0, weapon = 'gun') {
    const g = fresh(), [a, b] = duel(g, weapon); a.damageBonus = bonus;
    let n = 0; const rolls = [0.1, criticalRoll, 0.5]; g.world.rng = () => rolls[n++] ?? 0.5;
    resolveCombat(g.world, 0.05); return { damage: b.lastDamage, critical: b.lastCritical, event: g.world.events.find(e => e.type === 'gunshot') };
  }
  for (const weapon of ['gun', 'shotgun']) {
    const plain = hit(0.2, 0, weapon), crit = hit(0.199999, 0, weapon), boosted = hit(0.199999, 0.5, weapon);
    assert.equal(plain.critical, false); assert.equal(crit.critical, true); assert.equal(crit.event.critical, true);
    assert.ok(Math.abs(crit.damage - plain.damage * 2) < 1e-9); assert.ok(Math.abs(boosted.damage - crit.damage * 1.5) < 1e-9);
  }
  assert.equal(COMBAT.headshotChance, 0.2);
});

test('Strength rolls 10-50% once, rejects stacking, and temporary entities clear at dusk', () => {
  for (const [roll, expected] of [[0, 0.1], [0.99999, 0.5]]) {
    const g = fresh(), v = own(g); const original = g.world.rng; g.world.rng = () => roll;
    assert.ok(castPower(g, 0, 'strength', { villagerId: v.id }).ok); assert.equal(v.damageBonus, expected);
    g.power[0] = 3; g.usedPowers[0] = []; assert.equal(castPower(g, 0, 'strength', { villagerId: v.id }).ok, false);
    g.world.rng = original;
    g.world.blackoutUntil = 99; g.world.weaponDrops.push({ id: 'test', x: 1800, y: 1000 }); v.frozenUntil = 99;
    g.simElapsed = g.simSeconds; updateGame(g, 0.05);
    assert.equal(v.damageBonus, 0); assert.equal(v.frozenUntil, 0); assert.equal(g.world.blackoutUntil, 0);
    for (const key of ['weaponDrops', 'whirlpools', 'rockets']) assert.equal(g.world[key].length, 0);
  }
});

test('Time Bomb has the existing 12-second fuse and ally damage immunity', () => {
  const g = fresh(), a = at(own(g)), b = at(foe(g));
  assert.ok(castPower(g, 0, 'timebomb', { x: a.x, y: a.y }).ok);
  g.world.time = 21.999; updateBombs(g.world); assert.equal(b.hp, 100);
  g.world.time = 22; updateBombs(g.world); assert.equal(a.hp, 100); assert.equal(b.alive, false);
  assert.equal(g.world.events.find(e => e.type === 'kill').source.id, 'timebomb');
  const late = fresh(); late.simElapsed = late.simSeconds - 11.95;
  const before = authoritativeState(late);
  assert.equal(castPower(late, 0, 'timebomb', { x: 950, y: 570 }).ok, false);
  assert.deepEqual(authoritativeState(late), before);
});

test('new powers validate gates, resources and normalized drag direction without side effects', () => {
  const g = fresh(); assert.equal(Object.keys(POWER_DEFS).length, 22); assert.equal(POWER_DEFS.lightning.cost, 1);
  for (const id of ['timebomb', 'whirlpool', 'launcher', 'blackout']) { g.turn = 4; assert.equal(validatePower(g, 0, id, { x: 950, y: 570 }).ok, false); }
  g.turn = 5; const v = own(g);
  const args = { villagerId: v.id, tx: 950, ty: 570, malicious: 12 };
  assert.ok(validatePower(g, 0, 'gust', args).ok);
  assert.deepEqual(normalizePowerArgs('gust', args), { villagerId: v.id, tx: 950, ty: 570 });
  assert.ok(castPower(g, 0, 'gust', args).ok); assert.ok(v.kx || v.ky);
  const before = authoritativeState(g);
  assert.equal(castPower(g, 0, 'launcher', { x: NaN, y: 5 }).ok, false);
  assert.deepEqual(authoritativeState(g), before);
});

test('new typed powers resolve, dawn bombs remain cards, rival healing is rejected', () => {
  const g = fresh(); own(g).hp = 20;
  for (const [text, id] of [['time bomb at the plaza','timebomb'], ['blackout','blackout'], ['whirlpool the tides','whirlpool'], ['rocket launcher at the park','launcher'], ['freeze the tides','freeze'], ['strength my people','strength']]) {
    const p = parseCommand(text, g, 0); assert.ok(p.ok, text); assert.equal(p.actions[0].kind, 'power', text);
    const r = resolvePower(g, 0, p.actions[0].power); assert.ok(r.ok, text); assert.equal(r.id, id);
  }
  assert.equal(resolvePower(g, 0, { id: 'miracle', villagerId: foe(g).id }).ok, false);
  for (const group of [1, 2, 3, 4]) {
    const before = authoritativeState(g);
    const r = resolvePower(g, 0, { id: 'strength', group });
    assert.equal(r.ok, false);
    assert.deepEqual(authoritativeState(g), before);
  }
  g.phase = 'command'; assert.equal(parseCommand('plant a time bomb at the plaza', g, 0).actions[0].kind, 'card');
});

test('drag Gust keeps its direction after a moving target and network stamping; legacy destinations remain valid', () => {
  const g = fresh(), v = at(own(g));
  const args = { villagerId: v.id, dx: 130, dy: 40, extra: 'discard' };
  assert.ok(validatePower(g, 0, 'gust', args).ok);
  const wire = normalizePowerArgs('gust', args);
  assert.deepEqual(wire, { villagerId: v.id, dx: 130, dy: 40 });
  v.x = 1550; // Moved past the old absolute release point before the cast is applied.
  assert.ok(castPower(g, 0, 'gust', wire).ok);
  assert.ok(v.kx > 0 && v.ky > 0);
  assert.ok(Math.abs(v.ky / v.kx - 40 / 130) < 1e-10);
  const h = fresh(), b = own(h);
  assert.ok(validatePower(h, 0, 'gust', { villagerId: b.id, placeId: 'plaza' }).ok);
  assert.ok(validatePower(h, 0, 'gust', { villagerId: b.id, tx: 950, ty: 570 }).ok);
  for (const delta of [{dx:0,dy:0}, {dx:NaN,dy:10}, {dx:20}, {dx:1e100,dy:20}]) {
    const before = authoritativeState(h);
    assert.equal(castPower(h, 0, 'gust', { villagerId: b.id, placeId: 'plaza', ...delta }).ok, false);
    assert.deepEqual(authoritativeState(h), before);
  }
});

test('recap records rocket/freeze/Strength visuals and restores exact authoritative state', () => {
  const g = fresh(), v = own(g); v.weapon = 'rocket'; v.ammo = 3; v.damageBonus = 0.37; v.frozenUntil = 14; v.whirlpoolDamage = 17.123456789;
  g.world.blackoutUntil = 18; g.world.weaponDrops.push({ id: 'drop', x: 500, y: 500 });
  g.recorder.capture(g.world); g.world.time += 0.1; g.recorder.capture(g.world); g.phase = 'recap';
  const before = authoritativeState(g), replay = new Replay({ game: g, camera: { cut() {}, hold: 0 } });
  replay.play({ t0: 10, t1: 10.1, x: v.x, y: v.y });
  assert.ok(replay.active); assert.equal(v.weapon, 'rocket'); assert.equal(replay.visuals.blackoutUntil, 18);
  replay.stop(); assert.deepEqual(authoritativeState(g), before);
});

test('neutral rocket kills and eliminated Whirlpool casters have valid recorded recap attribution', () => {
  for (const neutral of [true, false]) {
    const g = fresh(), victim = at(foe(g)); victim.hp = 1;
    if (neutral) {
      const shooter = at(g.world.villagers.find(v => v.faction < 0), 900, 570);
      Object.assign(shooter, { weapon: 'rocket', ammo: 1, escalation: 2, state: 'attack', targetId: victim.id, cd: 0 });
      resolveCombat(g.world, 0.05); g.world.time += 1; updatePowerEffects(g.world, 1);
    } else {
      castPower(g, 0, 'whirlpool', { x: victim.x, y: victim.y });
      g.world.villagers.filter(v => v.faction === 0).forEach(v => { v.alive = false; v.hp = 0; });
      g.world.time += 1; updatePowerEffects(g.world, 1);
    }
    const kill = g.world.events.find(e => e.type === 'kill' && e.victimId === victim.id);
    assert.ok(kill); const cause = attributeKill(g, 5, kill);
    assert.equal(cause.seat, neutral ? -1 : 0);
    assert.match(cause.reason, neutral ? /neutrals fired the rocket/ : /Embers cast Whirlpool/);
    assert.doesNotThrow(() => buildHighlights(g, 5));
  }
});

test('Blackout breaks target locks and chooses a different valid foe after daylight', () => {
  for (const ordered of [false,true]) {
    const g=fresh(),a=at(own(g)),b=at(foe(g),980,570),c=at(g.world.villagers.find(v=>v.faction===1&&v!==b),1010,570);
    Object.assign(a,{trait:null,partnerId:-1,aggression:100,courage:100,panic:0,calmUntil:0});
    a.grievance.fill(0);a.grudge.fill(0);a.grievance[b.id]=a.grievance[c.id]=ordered?0:a.tolerance*2;
    if(ordered)a.fx.assault={kind:'group',id:1};
    startAttack(g.world,a,b);assert.ok(castPower(g,0,'blackout',{}).ok);
    assert.equal(a.targetId,null);assert.equal(a.blackoutTargetId,b.id);
    assert.equal(castPower(g,1,'enrage',{villagerId:b.id}).ok,false);
    startAttack(g.world,a,b);assert.notEqual(a.state,'attack');
    g.world.time=22.01;a.thinkTimer=0;a.brewId=c.id;a.brewUntil=0;
    stepWorld(g.world,.05);assert.equal(a.targetId,c.id);assert.equal(a.state,'attack');
  }
});

test('Blackout damage is seeded, enemy-only, shielded normally, and records lethal provenance', () => {
  for(const [roll,damage] of [[0,5],[.99999,10]]) {
    const g=fresh(),a=own(g),b=foe(g),c=g.world.villagers.find(v=>v.faction===2);
    a.hp=50;b.hp=100;c.hp=100;c.blessUntil=100;g.world.rng=()=>roll;
    assert.ok(castPower(g,0,'blackout',{}).ok);
    assert.equal(a.hp,70);assert.equal(b.hp,100-damage);assert.equal(c.hp,100-damage*.4);
  }
  const g=fresh(),b=foe(g);b.hp=1;castPower(g,0,'blackout',{});
  const e=g.world.events.find(e=>e.type==='kill'&&e.victimId===b.id);
  assert.equal(e.source.id,'blackout');assert.match(attributeKill(g,5,e).reason,/cast Blackout/);
});

test('frozen targets gain exactly 20 percentage points of hit vulnerability', () => {
  for(const [roll,normal,frozen] of [[.49999,true,true],[.5,false,true],[.69999,false,true],[.7,false,false]]) {
    for(const icy of [false,true]) {
      const g=fresh(),[a,b]=duel(g);a.courage=b.courage=50;b.frozenUntil=icy?17:0;
      let n=0;g.world.rng=()=>n++===0?roll:.5;
      resolveCombat(g.world,.05);
      assert.equal(b.hp<100,icy?frozen:normal);
    }
  }
});

test('launcher holders actually fire after acquiring a target instead of reverting to fists', () => {
  const g=fresh(),[a,b]=duel(g,'rocket');a.ammo=5;a.escalation=0;a.grievance[b.id]=0;
  startAttack(g.world,a,b);assert.equal(a.escalation,2);
  resolveCombat(g.world,.05);assert.equal(a.ammo,4);assert.equal(g.world.rockets.length,1);
  assert.equal(b.hp,100); // delayed impact, not an immediate melee strike
});

test('loaded firearms gain the engagement bonus; dry weapons and Stand Down do not', () => {
  for(const [weapon,ammo,standdown,expected] of [['none',0,false,false],['gun',0,false,false],['gun',3,false,true],['rocket',5,false,true],['gun',3,true,false]]) {
    const g=fresh(),a=at(own(g)),b=at(foe(g),980,570);
    Object.assign(a,{weapon,ammo,trait:null,partnerId:-1,aggression:10,courage:50,thinkTimer:0,brewId:b.id,brewUntil:0,calmUntil:0});
    a.grievance.fill(0);a.grudge.fill(0);a.grievance[b.id]=a.tolerance*2;a.fx.standdown=standdown;
    g.world.rng=()=>.6;stepWorld(g.world,.05);
    assert.equal(a.state==='attack',expected,`${weapon}, ammo ${ammo}, standdown ${standdown}`);
  }
});

test('rocket damage is 30% stronger and its 15% wider blast still spares allies', () => {
  const g=fresh(),[a,b]=duel(g,'rocket');a.ammo=1;
  const edge=at(g.world.villagers.find(v=>v.faction===2),b.x+POWERS.fireball.radius*1.1,b.y);
  const ally=at(g.world.villagers.find(v=>v.faction===0&&v!==a),edge.x,edge.y);
  resolveCombat(g.world,.05);g.world.time+=1;updatePowerEffects(g.world,1);
  assert.ok(Math.abs((100-b.hp)/(POWERS.fireball.maxDamage*.5)-1.3)<1e-10);
  assert.ok(edge.hp<100);assert.equal(ally.hp,100);
  assert.equal(POWERS.launcher.radiusMultiplier,1.15);assert.equal(POWERS.whirlpool.maxDamage,30*1.3);
});
