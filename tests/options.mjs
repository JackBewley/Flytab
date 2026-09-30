// Focused real-extension settings check; no large history or native chord benchmark.
import assert from 'node:assert/strict';
import {mkdtemp, cp, rm, mkdir, writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {chromium} from 'playwright-core';
const root=resolve(import.meta.dirname,'..');
const scratch=await mkdtemp(join(tmpdir(),'flytab-options-'));
const extension=join(scratch,'extension');
await mkdir(extension);
for(const name of ['manifest.json','background.js','core.js','early-input.js','popup.html','popup.js','popup.css','tab.svg','options.html','options.css','options.js','theme.html','theme.js','icons'])await cp(join(root,name),join(extension,name),{recursive:true});
const context=await chromium.launchPersistentContext(join(scratch,'profile'),{headless:true,executablePath:process.env.CHROME_PATH||chromium.executablePath(),args:[`--disable-extensions-except=${extension}`,`--load-extension=${extension}`]});
const evidence=resolve(process.env.FLYTAB_EVIDENCE||join(root,'test-evidence/0.6.2'));
const results=[];const pass=name=>{results.push(name);console.log('PASS',name);};
try {
 const worker=context.serviceWorkers()[0]||await context.waitForEvent('serviceworker');
 const origin=worker.url().replace(/\/background\.js$/, '');
 const page=await context.newPage();const errors=[];page.on('pageerror',error=>errors.push(error.message));
 await page.goto(origin+'/options.html');
 await page.waitForFunction(()=>!['Loading…','Unavailable'].includes(document.querySelector('#quick-shortcut').textContent));
 const commands=await page.evaluate(()=>chrome.commands.getAll());
 for(const [name,id] of [['switch-next','quick-shortcut'],['switch-previous','list-shortcut']])assert.equal(await page.locator('#'+id).textContent(),commands.find(c=>c.name===name)?.shortcut||'Not assigned');
 pass('settings loads actual Chrome command assignments');
 const opened=context.waitForEvent('page');await page.getByRole('button',{name:'Change shortcuts in Chrome'}).click();const editor=await opened;await editor.waitForURL('chrome://extensions/shortcuts');await editor.close();
 pass('shortcut button opens Chrome’s real shortcut editor');
 // Controlled failure/remap cases in this disposable page only.
 await page.evaluate(()=>{window.originalGetAll=chrome.commands.getAll;chrome.commands.getAll=async()=>[{name:'switch-next',shortcut:'Alt+J'},{name:'switch-previous',shortcut:''}];window.dispatchEvent(new Event('focus'));});
 await page.waitForFunction(()=>document.querySelector('#quick-shortcut').textContent==='Alt+J');
 assert.equal(await page.locator('#list-shortcut').textContent(),'Not assigned');
 pass('returning to settings refreshes remapped and unassigned shortcuts');
 await page.evaluate(()=>{chrome.commands.getAll=async()=>{throw Error('unavailable');};window.dispatchEvent(new Event('focus'));});
 await page.waitForSelector('#shortcut-error:visible');
 await page.evaluate(()=>{chrome.commands.getAll=window.originalGetAll;});await page.getByRole('button',{name:'Retry',exact:true}).click();await page.waitForSelector('#shortcut-error',{state:'hidden'});
 pass('failed shortcut read has a working retry');
 await page.evaluate(()=>{chrome.tabs.create=async()=>{throw Error('blocked');};});await page.getByRole('button',{name:'Change shortcuts in Chrome'}).click();await page.waitForSelector('#shortcut-error:visible');assert.ok((await page.locator('#shortcut-error').textContent()).includes('chrome://extensions/shortcuts'));assert.equal(await page.locator('#edit-shortcuts').isEnabled(),true);
 pass('failed editor launch provides the manual destination and restores the button');
 await page.getByRole('button',{name:'Retry',exact:true}).click();await page.waitForSelector('#shortcut-error',{state:'hidden'});
 await mkdir(evidence,{recursive:true});
 for(const colorScheme of ['light','dark']){
  await page.emulateMedia({colorScheme});await page.setViewportSize({width:720,height:620});await page.screenshot({path:join(evidence,'settings-'+colorScheme+'.png')});
  await page.setViewportSize({width:320,height:640});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
 }
 pass('light/dark settings fit a narrow viewport');
 assert.deepEqual(errors,[]);await writeFile(join(evidence,'options-results.json'),JSON.stringify({browser:context.browser().version(),results,errors},null,2));
} finally {await context.close();await rm(scratch,{recursive:true,force:true});}
