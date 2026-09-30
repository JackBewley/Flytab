// Focused offscreen lifecycle/appearance test and bounded process-RSS measurement.
import assert from 'node:assert/strict';
import {mkdtemp,cp,rm,mkdir,appendFile,writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {resolve,join} from 'node:path';
import {execFileSync} from 'node:child_process';
import {chromium} from 'playwright-core';
const source=resolve(process.env.FLYTAB_SOURCE||join(import.meta.dirname,'..'));
const evidence=resolve(process.env.FLYTAB_EVIDENCE||'test-evidence/0.6.3/theme.json');
const scratch=await mkdtemp(join(tmpdir(),'flytab-theme-'));const extension=join(scratch,'extension');await mkdir(extension);
for(const n of ['manifest.json','background.js','core.js','early-input.js','popup.html','popup.js','popup.css','tab.svg','options.html','options.css','options.js','theme.html','theme.js','icons']){
 try{await cp(join(source,n),join(extension,n),{recursive:true});}catch(e){if(e.code!=='ENOENT')throw e;}
}
await appendFile(join(extension,'background.js'),`\nglobalThis.themeProbe = {icons:[], ensure: typeof ensureThemeDocument === 'function' ? ensureThemeDocument : null};\nconst originalIcon = chrome.action.setIcon.bind(chrome.action);\nchrome.action.setIcon = async args => { await originalIcon(args); themeProbe.icons.push(args.path); };\n`);
const context=await chromium.launchPersistentContext(join(scratch,'profile'),{headless:true,executablePath:process.env.CHROME_PATH||chromium.executablePath(),args:[`--disable-extensions-except=${extension}`,`--load-extension=${extension}`]});
const pause=ms=>new Promise(r=>setTimeout(r,ms));const results=[];const pass=s=>{results.push(s);console.log('PASS',s);};
const browser=await context.browser().newBrowserCDPSession();
let sequence=0;const pending=new Map();
browser.on('Target.receivedMessageFromTarget',({message})=>{const reply=JSON.parse(message);const job=pending.get(reply.id);if(job){pending.delete(reply.id);reply.error?job.reject(Error(reply.error.message)):job.resolve(reply.result);}});
async function attached(targetId){const {sessionId}=await browser.send('Target.attachToTarget',{targetId,flatten:false});return {send(method,params={}){const id=++sequence;return new Promise((resolve,reject)=>{pending.set(id,{resolve,reject});void browser.send('Target.sendMessageToTarget',{sessionId,message:JSON.stringify({id,method,params})}).catch(reject);});}};}
async function rss(){const {processInfo}=await browser.send('SystemInfo.getProcessInfo');const rows=[];for(const p of processInfo){try{const kb=Number(execFileSync('/bin/ps',['-o','rss=','-p',String(p.id)],{encoding:'utf8'}).trim());rows.push({pid:p.id,type:p.type,rssMiB:kb/1024});}catch{}}return {processes:rows,totalMiB:rows.reduce((n,p)=>n+p.rssMiB,0),rendererMiB:rows.filter(p=>p.type==='renderer').reduce((n,p)=>n+p.rssMiB,0)};}
try{
 let worker=context.serviceWorkers()[0]||await context.waitForEvent('serviceworker');const origin=worker.url().replace('background.js','');
 const isTheme=await worker.evaluate(()=>chrome.runtime.getManifest().permissions.includes('offscreen'));
 await pause(1000);
 let memory=[];
 if(isTheme){
  const docs=await worker.evaluate(()=>chrome.runtime.getContexts({contextTypes:['OFFSCREEN_DOCUMENT']}));assert.equal(docs.length,1);assert.equal(docs[0].documentUrl,origin+'theme.html');pass('installation creates exactly one offscreen appearance document');
  await worker.evaluate(()=>Promise.all([themeProbe.ensure(),themeProbe.ensure()]));
  assert.equal((await worker.evaluate(()=>chrome.runtime.getContexts({contextTypes:['OFFSCREEN_DOCUMENT']}))).length,1);
  pass('concurrent setup requests reuse the existing appearance document');
  const target=(await browser.send('Target.getTargets')).targetInfos.find(t=>t.url===origin+'theme.html');assert.ok(target);const theme=await attached(target.targetId);
  for(const dark of [true,false,true]){
   await theme.send('Emulation.setEmulatedMedia',{features:[{name:'prefers-color-scheme',value:dark?'dark':'light'}]});
   
   const expected=dark?'icons/icon-dark-16.png':'icons/icon-16.png';
   for(let i=0;i<400;i++){if(await worker.evaluate(expected=>themeProbe.icons.at(-1)?.[16]===expected,expected))break;await pause(20);if(i===399)throw Error('Icon did not follow '+expected+' '+JSON.stringify(await worker.evaluate(()=>themeProbe))); }
  }
  pass('actual media-query changes swap the icon through Chrome action.setIcon');
  const cdp=await context.newCDPSession(context.pages()[0]);const versions=new Map();cdp.on('ServiceWorker.workerVersionUpdated',e=>{for(const v of e.versions)versions.set(v.versionId,v);});await cdp.send('ServiceWorker.enable');await pause(100);
  const version=[...versions.values()].find(v=>v.scriptURL===origin+'background.js'&&v.runningStatus==='running');assert.ok(version);await cdp.send('ServiceWorker.stopWorker',{versionId:version.versionId});await pause(1000);
  assert.ok((await browser.send('Target.getTargets')).targetInfos.some(t=>t.url===origin+'theme.html'));
  assert.equal((await browser.send('Target.getTargets')).targetInfos.some(t=>t.url===origin+'background.js'),false);
  pass('appearance document survives worker stop without holding the worker awake');
  await theme.send('Emulation.setEmulatedMedia',{features:[{name:'prefers-color-scheme',value:'light'}]});
  for(let i=0;i<400;i++){worker=context.serviceWorkers().find(w=>w.url()===origin+'background.js');try{if(worker&&await worker.evaluate(()=>themeProbe.icons.at(-1)?.[16]==='icons/icon-16.png'))break;}catch{}await pause(20);if(i===399)throw Error('Appearance change did not wake worker');}
  pass('a later appearance change wakes the worker and updates the icon');
  await theme.send('Performance.enable');var metrics=await theme.send('Performance.getMetrics');var counters=await theme.send('Memory.getDOMCounters');
  // Close the inspector before idle-memory sampling. Stop worker in both variants.
  await browser.send('Target.detachFromTarget',{targetId:target.targetId}).catch(()=>{});
  await cdp.send('ServiceWorker.disable');
  // Detaching restores the host theme; let that genuine change settle first.
  await pause(6000);
 }
 // A CDP lifecycle stop avoids conflating live worker heap with the resident document.
 const page=context.pages()[0];const cdp=await context.newCDPSession(page);const versions=new Map();cdp.on('ServiceWorker.workerVersionUpdated',e=>{for(const v of e.versions)versions.set(v.versionId,v);});await cdp.send('ServiceWorker.enable');await pause(100);
 const v=[...versions.values()].find(v=>v.scriptURL===origin+'background.js'&&v.runningStatus==='running');if(v)await cdp.send('ServiceWorker.stopWorker',{versionId:v.versionId});
 await pause(12000);
 for(let i=0;i<5;i++){memory.push(await rss());await pause(250);}
 assert.equal((await browser.send('Target.getTargets')).targetInfos.some(t=>t.url===origin+'background.js'),false);
 const footprint=[];
 for(const process of memory.at(-1).processes){
  try{const output=execFileSync('/usr/bin/vmmap',['-summary',String(process.pid)],{encoding:'utf8',timeout:10000,stdio:['ignore','pipe','pipe']});const match=output.match(/Physical footprint:\s+([\d.]+)([KMG])/);footprint.push({...process,physicalFootprint:match?match[1]+match[2]:null});}catch{footprint.push({...process,physicalFootprint:null});}
 }
 const report={footprint,source,browser:context.browser().version(),isTheme,results,memory,metrics:typeof metrics==='undefined'?null:metrics,counters:typeof counters==='undefined'?null:counters,notes:'Isolated headless Chrome; five process RSS snapshots with worker stopped. RSS includes shared pages and is not private physical memory; compare multiple fresh-profile runs. Idle JS heap is separate from whole-renderer cost.'};
 await mkdir(resolve(evidence,'..'),{recursive:true});await writeFile(evidence,JSON.stringify(report,null,2));console.log('RSS MiB',memory.map(m=>m.totalMiB));
}finally{await context.close();await rm(scratch,{recursive:true,force:true});}
