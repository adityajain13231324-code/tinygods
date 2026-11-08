import {createRequire} from 'node:module';import fs from 'node:fs/promises';
const {chromium}=createRequire(import.meta.url)('playwright');await fs.mkdir('public/guide',{recursive:true});
const b=await chromium.launch({headless:true,executablePath:process.env.BROWSER_EXECUTABLE});const p=await b.newPage({viewport:{width:1280,height:800}});
await p.addInitScript(()=>{localStorage.setItem('tinygods.cutscenes','0');localStorage.setItem('tinygods.news','0');});
await p.goto('http://127.0.0.1:4181/?start=1&players=1&seed=41');await p.waitForFunction(()=>window.tinyGods);await p.waitForTimeout(1200);
await p.evaluate(()=>{tinyGods.ctx.paused=true;});await p.screenshot({path:'public/guide/town.jpg',type:'jpeg',quality:88});
const input=p.locator('#command input').first();await input.fill('arm up');await input.press('Enter');await p.waitForTimeout(500);await p.screenshot({path:'public/guide/orders.jpg',type:'jpeg',quality:88});
await p.evaluate(()=>{const t=tinyGods;t.game.turn=t.game.world.turn=5;t.game.phase='sim';t.game.world.peaceful=false;t.game.power[0]=3;t.frame(0);});await p.waitForTimeout(500);await p.locator('[data-power="miracle"]').click();await p.mouse.move(580,420);await p.waitForTimeout(500);await p.screenshot({path:'public/guide/powers.jpg',type:'jpeg',quality:88});await b.close();
