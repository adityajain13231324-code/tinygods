// Optional Playwright regressions. Run against a built preview to avoid HMR reloads.
import { createRequire } from 'node:module';
import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
const { chromium } = createRequire(import.meta.url)('playwright');
const output = path.resolve(process.env.TEST_OUTPUT_DIR ?? 'test-results/browser-inputs');
await fs.mkdir(output, { recursive: true });
const browser = await chromium.launch({ headless: true, ...(process.env.BROWSER_EXECUTABLE ? { executablePath: process.env.BROWSER_EXECUTABLE } : {}) });
const checks = [], errors = [];
const base = process.env.GAME_TEST_URL ?? 'http://127.0.0.1:4181/';
const settle = async p => { await p.evaluate(() => { for (let i = 0; i < 18; i++) tinyGods.frame(.05); tinyGods.app.render(); }); await p.waitForTimeout(150); };
async function fixture(p) {
  await p.keyboard.press('Escape');
  await p.evaluate(() => {
    const t=tinyGods,g=t.game,w=g.world;t.app.ticker.stop();t.ctx.paused=true;t.ctx.passReady=true;t.ctx.seat=0;t.cutscenes.enabled=false;
    g.phase='sim';g.turn=w.turn=5;w.time=10;w.peaceful=false;g.simElapsed=0;g.acc=0;g.power.fill(3);g.usedPowers.forEach(a=>a.splice(0));g.eliminated.fill(false);
    for(const key of ['whirlpools','weaponDrops','rockets','bombs','fogs','tornadoes'])w[key]=[];w.blackoutUntil=0;
    w.villagers.forEach((v,i)=>Object.assign(v,{alive:true,hp:50,weapon:'none',ammo:0,frozenUntil:0,damageBonus:0,state:'idle',thinkTimer:100,timer:100,kx:0,ky:0,x:100+i*20,px:100+i*20,y:150,py:150}));
    Object.assign(w.villagers.find(v=>v.faction===0),{x:900,px:900,y:550,py:550});
    Object.assign(w.villagers.find(v=>v.faction===1),{x:930,px:930,y:560,py:560});t.frame(0);
  });
  await settle(p);
}
async function open(p) {
  const b=p.locator('#powerbar .sheet-toggle');
  if(await b.isVisible() && await b.getAttribute('aria-expanded')==='false')await b.click();
}
async function pick(p,id) { await open(p);await p.locator(`[data-power="${id}"]`).click();await settle(p); }
const spot = p => p.evaluate(()=>({x:900*tinyGods.camera.scale+tinyGods.camera.stage.x,y:532*tinyGods.camera.scale+tinyGods.camera.stage.y}));
try {
  for(const viewport of [{width:1440,height:900},{width:375,height:812}]) {
    const c=await browser.newContext({viewport});const p=await c.newPage();p.on('pageerror',e=>errors.push(e.stack));
    await p.addInitScript(()=>localStorage.setItem('tinygods.cutscenes','0'));
    await p.goto(base+'?start=1&players=1&seed=41');await p.waitForFunction(()=>window.tinyGods);
    const input=p.getByRole('textbox',{name:'Live miracle command'}),message=p.locator('#powerbar .typemsg');
    await fixture(p);await pick(p,'fireball');await open(p);
    await input.fill('heal my weakest');await input.press('Enter');await settle(p);
    assert.equal(await p.evaluate(()=>tinyGods.game.power[0]),2);assert.equal(await p.evaluate(()=>tinyGods.powerBar.selected),null);
    assert.match(await message.textContent(),/healed/i);
    checks.push({viewport,case:'typed success persists and cancels previous aim'});

    await fixture(p);await open(p);await input.fill('heal my weakest, blackout');await input.press('Enter');await settle(p);
    assert.equal(await p.evaluate(()=>tinyGods.game.power[0]),2);assert.match(await message.textContent(),/healed.*not enough power/i);
    checks.push({viewport,case:'partially successful commands explain both results'});

    await fixture(p);await open(p);await input.fill('freeze the Tides');await input.evaluate(n=>n.setSelectionRange(3,7));
    const focus=await p.evaluate(()=>{const t=tinyGods;t.game.simElapsed=t.game.simSeconds-11;t.frame(0);const n=document.querySelector('#powerbar input');return {focused:document.activeElement===n,value:n.value,start:n.selectionStart,end:n.selectionEnd};});
    assert.deepEqual(focus,{focused:true,value:'freeze the Tides',start:3,end:7});
    checks.push({viewport,case:'typing focus, draft and caret survive a live menu update'});

    await fixture(p);await pick(p,'miracle');await open(p);await input.focus();await input.press('Escape');await settle(p);
    assert.equal(await p.evaluate(()=>tinyGods.powerBar.selected),null);
    checks.push({viewport,case:'Escape cancels aiming while the command input has focus'});

    await fixture(p);await pick(p,'whisper');
    await p.locator('[data-focus-key="whisper-group-2"]').click();await settle(p);
    assert.equal(await p.evaluate(()=>document.activeElement?.dataset.focusKey),'whisper-group-2');
    await p.keyboard.press('Tab');await p.keyboard.press('Space');await settle(p);
    assert.equal(await p.evaluate(()=>document.activeElement?.dataset.focusKey),'whisper-group-3');
    checks.push({viewport,case:'Whisper choices keep keyboard focus after rebuilding'});

    await fixture(p);await pick(p,'gust');let q=await spot(p);
    await p.mouse.move(q.x,q.y);await p.mouse.down();
    await p.evaluate(()=>{const v=tinyGods.game.world.villagers.find(v=>v.faction===0);v.x=v.px=1550;});
    await p.mouse.move(q.x+75,q.y+25,{steps:6});await settle(p);
    await p.screenshot({path:path.join(output,`gust-moving-${viewport.width}.png`)});
    await p.mouse.up();await settle(p);
    assert.ok(await p.evaluate(()=>{const v=tinyGods.game.world.villagers.find(v=>v.faction===0);return v.kx>0&&v.ky>0&&tinyGods.game.power[0]===2;}));
    checks.push({viewport,case:'a rightward Gust stays rightward after its target moves past the old endpoint'});

    await fixture(p);await open(p);await input.fill('strength the Tides');await input.press('Enter');await settle(p);
    assert.equal(await p.evaluate(()=>tinyGods.game.power[0]),3);
    assert.equal(await p.evaluate(()=>tinyGods.game.world.villagers.some(v=>v.damageBonus>0)),false);
    assert.match(await message.textContent(),/own faction/i);
    checks.push({viewport,case:'rival Strength target is rejected without spending power'});

    for(const button of ['right','middle']) {
      await fixture(p);await pick(p,'miracle');q=await spot(p);await p.mouse.click(q.x,q.y,{button});await settle(p);
      assert.equal(await p.evaluate(()=>tinyGods.game.power[0]),3);
      await p.keyboard.press('Escape');checks.push({viewport,case:`${button} click cannot cast a power`});
    }
    await fixture(p);await pick(p,'gust');q=await spot(p);await p.mouse.move(q.x,q.y);await p.mouse.down();
    await p.evaluate(()=>{tinyGods.game.world.villagers.find(v=>v.faction===0).alive=false;});
    await p.mouse.move(q.x+75,q.y+25,{steps:5});await p.mouse.up();await settle(p);
    assert.equal(await p.evaluate(()=>tinyGods.game.power[0]),3);assert.match(await message.textContent(),/living villager/i);
    checks.push({viewport,case:'target dying during a drag does not spend power'});
    await p.screenshot({path:path.join(output,`input-checks-${viewport.width}.png`)});await c.close();
  }
  assert.deepEqual(errors,[]);console.log(`PASS ${checks.length} browser input regressions`);
} finally {await fs.writeFile(path.join(output,'results.json'),JSON.stringify({checks,errors},null,2));await browser.close();}
