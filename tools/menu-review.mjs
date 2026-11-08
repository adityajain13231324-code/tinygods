import { createRequire } from 'node:module';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
await fs.mkdir('test-results',{recursive:true});
const {chromium}=createRequire(import.meta.url)('playwright');
const browser=await chromium.launch({headless:true,...(process.env.BROWSER_EXECUTABLE ? {executablePath:process.env.BROWSER_EXECUTABLE} : {})});
const errors=[];
for(const width of [1440,375]){
 const context=await browser.newContext({viewport:{width,height:900}});const p=await context.newPage();p.on('pageerror',e=>errors.push(e.message));
 await p.goto('http://127.0.0.1:4181/');await p.getByRole('button',{name:'Skip guide',exact:true}).waitFor();
 for (const name of ['1. The goal','2. Make a plan','3. Watch & adapt','4. Use powers','5. Win & learn']) { await p.getByRole('button',{name,exact:true}).click();await p.waitForFunction(()=>{const i=document.querySelector('.guide-scene img');return i?.complete&&i.naturalWidth>0;});assert(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)); }
 await p.getByRole('button',{name:'1. The goal',exact:true}).click();await p.screenshot({path:`test-results/guide-${width}.png`});
 await p.getByRole('button',{name:'2. Make a plan',exact:true}).click();
 const slider=p.getByRole('slider');await slider.fill('1');assert.equal(await p.locator('.demo-arm').count(),3);await p.getByRole('button',{name:'Watch the plan'}).click();
 await p.getByRole('button',{name:'Skip guide',exact:true}).click();await p.screenshot({path:`test-results/home-${width}.png`});
 await p.getByRole('button',{name:/Play vs bots/}).click();await p.getByRole('button',{name:'Sprouts',exact:true}).click();await p.getByLabel('Difficulty',{exact:true}).selectOption('hard');
 assert(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));await p.screenshot({path:`test-results/setup-${width}.png`});
 await p.getByRole('button',{name:'Start match',exact:true}).click();await p.waitForFunction(()=>window.tinyGods);assert.equal(await p.evaluate(()=>tinyGods.ctx.seat),2);assert.equal(await p.evaluate(()=>tinyGods.game.seats[2].kind),'human');
 await p.goto('http://127.0.0.1:4181/');await p.getByRole('button',{name:/Play online/}).click();await p.getByRole('textbox',{name:'Room code',exact:true}).fill('AB');await p.getByRole('button',{name:'Join',exact:true}).click();await p.getByText('Codes have 5 letters or numbers.').waitFor();await p.screenshot({path:`test-results/online-${width}.png`});
 await context.close();
}
await browser.close();assert.deepEqual(errors,[]);console.log('PASS guide, skip persistence, setup, faction launch, mobile overflow and online validation');
