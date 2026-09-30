// Real Chromium DOM with mocked extension transport. Native routing is covered
// separately by the extension suites and physical-keyboard acceptance checks.
import assert from 'node:assert/strict';
import {readFile, mkdir, writeFile} from 'node:fs/promises';
import {resolve, dirname, join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {chromium} from 'playwright-core';
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const minimumFont = Number(process.env.FLYTAB_MIN_FONT || 0);
const browser = await chromium.launch({args:minimumFont ? ['--blink-settings=minimumFontSize='+minimumFont] : [],headless:true, executablePath:process.env.CHROME_PATH || chromium.executablePath()});
const results = [], errors = [];
const pass = name => {results.push(name);console.log('PASS',name);};
try {
  const page = await browser.newPage({viewport:{width:384,height:420}});
  page.on('pageerror',error=>errors.push(error.message));
  await page.route('https://flytab.test/**',async route=>{
    const name = new URL(route.request().url()).pathname.slice(1);
    if (!['popup.html','popup.js','popup.css','early-input.js','theme.js','tab.svg','icons/icon-32.png'].includes(name)) return route.abort();
    await route.fulfill({body:await readFile(join(root,name)),contentType:name.endsWith('.js')?'text/javascript':name.endsWith('.css')?'text/css':name.endsWith('.svg')?'image/svg+xml':name.endsWith('.png')?'image/png':'text/html'});
  });
  await page.addInitScript(()=>{
    const messages=[];
    const snapshot={token:'fixture',revision:0,index:1,items:Array.from({length:8},(_,i)=>({id:i+1,title:i===0?'A long title <img src=x onerror=alert(1)> 日本語 — project documentation':`Example tab ${i+1}`,icon:'tab.svg',current:i===0,otherWindow:i===3}))};
    const state=window.fixture={snapshot,fail:null,cancelled:false,closed:false,broadcast:()=>messages.forEach(fn=>fn({type:'flytab:state',snapshot:structuredClone(snapshot)}))};
    window.close=()=>{state.closed=true;};
    window.chrome={runtime:{lastError:null,onMessage:{addListener(fn){messages.push(fn);}},connect(){return {onMessage:{addListener(fn){queueMicrotask(()=>fn({type:'flytab:input-ready'}));}},onDisconnect:{addListener(){}},disconnect(){},postMessage(){}};},async sendMessage(message){
      const op=message.type.slice(7);
      if(op==='get' && new URL(location.href).searchParams.has('failStartup')) return {ok:false,error:'Startup failed'};
      if(state.fail===op){state.fail=null;return {ok:false,error:`Could not ${op}`};}
      if(op==='move'){
        snapshot.index=message.edge==='first'?0:message.edge==='last'?7:(snapshot.index+(message.delta<0?-1:1)+8)%8;
        snapshot.revision++;
      }
      if(op==='cancel') state.cancelled=true;
      return {ok:true,snapshot:structuredClone(snapshot)};
    }},commands:{async getAll(){return new URL(location.href).searchParams.has('remappedEndpoints') ? [{name:'switch-previous',shortcut:'Alt+Home'},{name:'switch-next',shortcut:'Alt+End'}] : [{name:'switch-previous',shortcut:'Alt+Shift+F'},{name:'switch-next',shortcut:'Alt+F'}];}}};
  });
  await page.goto('https://flytab.test/popup.html?session=fixture&surface=action');
  await page.waitForSelector('[aria-selected="true"]');
  assert.equal(await page.locator('.tab').first().locator('.meta').textContent(),'Current tab');
  assert.equal(await page.locator('#tabs').getAttribute('aria-activedescendant'),'tab-2');
  if(process.env.FLYTAB_EVIDENCE) {
    await mkdir(process.env.FLYTAB_EVIDENCE,{recursive:true});
    await page.screenshot({path:join(process.env.FLYTAB_EVIDENCE,'initial-popup.png')});
  }
  await page.evaluate(()=>{window.fixture.fail='move';});
  await page.keyboard.press('ArrowDown');
  await page.waitForFunction(()=>!document.querySelector('#error').hidden);
  await page.evaluate(()=>window.fixture.broadcast());
  assert.equal(await page.locator('#error').isVisible(),true);
  await page.keyboard.press('ArrowDown');
  await page.waitForFunction(()=>document.querySelector('#error').hidden);
  assert.equal(await page.locator('#tabs').getAttribute('aria-activedescendant'),'tab-3');
  pass('failed move persists through broadcast and clears only after successful user navigation');
  await page.evaluate(()=>{window.fixture.fail='commit';});
  await page.keyboard.press('Enter');
  await page.waitForFunction(()=>document.querySelector('#error').textContent==='Could not commit');
  await page.evaluate(()=>window.fixture.broadcast());
  assert.equal(await page.locator('#error').isVisible(),true);
  await page.keyboard.press('End');
  await page.waitForFunction(()=>document.querySelector('#tabs').getAttribute('aria-activedescendant')==='tab-8');
  assert.equal(await page.locator('#error').isVisible(),false);
  assert.equal(await page.evaluate(()=>window.fixture.closed),false);
  await page.keyboard.press('Home');
  await page.waitForFunction(()=>document.querySelector('#tabs').getAttribute('aria-activedescendant')==='tab-1');
  pass('failed commit can recover by choosing another entry; Home/End preview without committing');
  const cdp=await page.context().newCDPSession(page);
  const ax=await cdp.send('Accessibility.getFullAXTree');
  assert.ok(ax.nodes.some(n=>n.role?.value==='listbox'&&n.name?.value==='Recent tabs'));
  assert.equal(ax.nodes.filter(n=>n.role?.value==='option').length,8);
  assert.equal(await page.locator('.title img').count(),0);
  pass('listbox and full option names exposed in accessibility tree; title markup is inert');
  for (const colorScheme of ['light','dark']) {
    await page.emulateMedia({colorScheme});
    const rowHeight=await page.locator('.tab').first().evaluate(el=>el.getBoundingClientRect().height);
    if(minimumFont)assert.ok(rowHeight>52,'Chrome minimum-font setting must enlarge the actual rendered row');
    else assert.equal(rowHeight,52);
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
  }
  pass(minimumFont ? 'Chrome minimum-font setting expands rows in light/dark without horizontal overflow' : 'normal light/dark layout retains 52px rows without horizontal overflow');
  await page.evaluate(()=>{delete document.documentElement.dataset.surface;});
  await page.setViewportSize({width:320,height:330});
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
  await page.emulateMedia({forcedColors:'active'});
  assert.equal(await page.locator('[aria-selected="true"]').evaluate(el=>getComputedStyle(el).outlineStyle),'solid');
  pass('narrow fallback fits and forced colors retains a selection outline');
  await page.emulateMedia({forcedColors:'none',colorScheme:'light'});
  // Text-only enlargement stress, not a claim that CSS injection is browser zoom.
  await page.evaluate(()=>document.querySelectorAll('.title,.meta').forEach(el=>{el.style.fontSize=parseFloat(getComputedStyle(el).fontSize)*2+'px';}));
  assert.equal(await page.locator('.tab').first().evaluate(row=>{
    const box=row.getBoundingClientRect(),copy=row.querySelector('.copy').getBoundingClientRect();
    return copy.top>=box.top && copy.bottom<=box.bottom;
  }),true,'enlarged text must fit its row without overlapping neighbors');
  await page.keyboard.press('End');
  await page.waitForFunction(()=>document.querySelector('#tabs').getAttribute('aria-activedescendant')==='tab-8');
  assert.equal(await page.locator('[aria-selected="true"]').evaluate(row=>{
    const box=row.getBoundingClientRect(),list=document.querySelector('#tabs').getBoundingClientRect();
    return box.top>=list.top-1 && box.bottom<=list.bottom+1;
  }),true,'enlarged selected row remains fully visible');
  pass('200% text-only stress fits rows and scrolls active options into view');
  await page.goto('https://flytab.test/popup.html?session=fixture&remappedEndpoints=1');
  await page.waitForSelector('[aria-selected="true"]');
  await page.keyboard.press('End');
  await page.waitForFunction(()=>document.querySelector('#tabs').getAttribute('aria-activedescendant')==='tab-8');
  await page.keyboard.press('Home');
  await page.waitForFunction(()=>document.querySelector('#tabs').getAttribute('aria-activedescendant')==='tab-1');
  assert.equal(await page.evaluate(()=>window.fixture.closed),false);
  pass('plain Home/End preview without committing when commands are remapped to those keys');
  await page.goto('https://flytab.test/popup.html?session=fixture&failStartup=1');
  await page.waitForFunction(()=>!document.querySelector('#error').hidden);
  assert.match(await page.locator('#hint').textContent(),/open Flytab again/);
  await page.keyboard.press('Escape');
  await page.waitForFunction(()=>window.fixture.closed && window.fixture.cancelled);
  pass('startup failure gives a truthful close/reopen instruction and Escape remains available');
  assert.deepEqual(errors,[]);
  if(process.env.FLYTAB_EVIDENCE){await mkdir(process.env.FLYTAB_EVIDENCE,{recursive:true});await writeFile(join(process.env.FLYTAB_EVIDENCE,'popup-ui.json'),JSON.stringify({browser:browser.version(),minimumFont,results,errors},null,2));}
} finally {await browser.close();}
