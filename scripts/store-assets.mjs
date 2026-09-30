// Development-only store artwork. Capture real extension documents in a disposable
// Chrome profile, then compose annotated screenshots without changing their UI.
import assert from 'node:assert/strict';
import {mkdtemp, mkdir, cp, readFile, writeFile, rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join, resolve} from 'node:path';
import {generateKeyPairSync, createHash} from 'node:crypto';
import {createServer} from 'node:http';
import {chromium} from 'playwright-core';
const root=resolve(import.meta.dirname,'..');
const output=join(root,'store');
await mkdir(join(output,'captures'),{recursive:true});
await mkdir(join(output,'assets'),{recursive:true});
const scratch=await mkdtemp(join(tmpdir(),'flytab-store-'));
const extension=join(scratch,'extension');
await mkdir(extension);
const runtime=['manifest.json','background.js','core.js','early-input.js','popup.html','popup.js','popup.css','tab.svg','options.html','options.css','options.js','theme.js','icons'];
for(const file of runtime) await cp(join(root,file),join(extension,file),{recursive:true});
const manifest=JSON.parse(await readFile(join(extension,'manifest.json'),'utf8'));
const key=generateKeyPairSync('rsa',{modulusLength:2048}).publicKey.export({type:'spki',format:'der'});
manifest.key=key.toString('base64');
const extensionId=createHash('sha256').update(key).digest('hex').slice(0,32).replace(/[0-9a-f]/g,c=>String.fromCharCode(97+parseInt(c,16)));
await writeFile(join(extension,'manifest.json'),JSON.stringify(manifest));
// Only expose the production opening routine in the temporary source copy.
await writeFile(join(extension,'background.js'),await readFile(join(extension,'background.js'),'utf8')+'\nglobalThis.flytabStoreOpen=()=>enqueue(()=>command("switch-previous"));\n');
await mkdir(join(scratch,'profile','Default'),{recursive:true});
await writeFile(join(scratch,'profile','Default','Preferences'),JSON.stringify({extensions:{pinned_extensions:[extensionId]}}));
const fixtures=[
 {slug:'brief',title:'Website brief',letter:'B',color:'#697e9a'},
 {slug:'design',title:'Design references',letter:'D',color:'#9f768c'},
 {slug:'calendar',title:'Calendar — This week',letter:'C',color:'#568a77'},
 {slug:'inbox',title:'Inbox — Mail',letter:'M',color:'#597db0'},
 {slug:'notes',title:'Project notes',letter:'N',color:'#777f8b'},
];
const server=createServer((req,res)=>{
 const slug=req.url.split('/')[1]; const fixture=fixtures.find(f=>f.slug===slug);
 if(!fixture){res.writeHead(404);return res.end();}
 if(req.url.endsWith('.svg')){res.setHeader('Content-Type','image/svg+xml');return res.end(`<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32"><rect width="32" height="32" rx="7" fill="${fixture.color}"/><text x="16" y="22" font-family="Arial" font-size="21" text-anchor="middle" fill="white">${fixture.letter}</text></svg>`);}
 res.setHeader('Content-Type','text/html; charset=utf-8');res.end(`<!doctype html><html lang="en"><head><title>${fixture.title}</title><link rel="icon" href="/${slug}/icon.svg"></head><body><h1>${fixture.title}</h1><p>Demonstration tab for Flytab store screenshots.</p></body></html>`);
});
await new Promise(r=>server.listen(0,'127.0.0.1',r));
const base=`http://127.0.0.1:${server.address().port}`;
const pause=ms=>new Promise(r=>setTimeout(r,ms));
let context, renderer;
try {
 context=await chromium.launchPersistentContext(join(scratch,'profile'),{headless:false,viewport:null,executablePath:process.env.CHROME_PATH||chromium.executablePath(),args:[`--disable-extensions-except=${extension}`,`--load-extension=${extension}`,'--window-size=1100,800']});
 const worker=context.serviceWorkers()[0]||await context.waitForEvent('serviceworker');
 const origin=`chrome-extension://${extensionId}/`;
 const windowIds=await worker.evaluate(async()=>{const main=(await chrome.windows.getAll({windowTypes:['normal']}))[0];const other=await chrome.windows.create({url:'about:blank',focused:true});return [main.id,other.id];});
 const visited=[];
 for(const i of [0,1,2,4,3]){
  const windowId=i===3?windowIds[1]:windowIds[0];
  const id=await worker.evaluate(async({windowId,url})=>{await chrome.windows.update(windowId,{focused:true});return (await chrome.tabs.create({windowId,url,active:true})).id;},{windowId,url:base+'/'+fixtures[i].slug});
  visited.push(id); await pause(350);
 }
 // Drop empty tabs, leaving exactly the five visited demonstration tabs.
 await worker.evaluate(async()=>{const tabs=await chrome.tabs.query({});const empty=tabs.filter(t=>t.url==='about:blank');if(empty.length)await chrome.tabs.remove(empty.map(t=>t.id));});
 await worker.evaluate(id=>chrome.windows.update(id,{focused:true}),windowIds[0]);
 await pause(250);
 await worker.evaluate(()=>globalThis.flytabStoreOpen());
 const cdp=await context.browser().newBrowserCDPSession();
 let target;
 for(let i=0;i<100;i++){
  target=(await cdp.send('Target.getTargets')).targetInfos.find(t=>t.url.startsWith(origin+'popup.html?'));
  if(target)break;await pause(30);
 }
 assert.ok(target,'Actual toolbar popup target must exist');
 const {sessionId}=await cdp.send('Target.attachToTarget',{targetId:target.targetId,flatten:false});
 let counter=0;const pending=new Map();
 cdp.on('Target.receivedMessageFromTarget',event=>{if(event.sessionId!==sessionId)return;const message=JSON.parse(event.message);const callback=pending.get(message.id);if(callback){pending.delete(message.id);message.error?callback.reject(Error(message.error.message)):callback.resolve(message.result);}});
 async function send(method,params={}){const id=++counter;const response=new Promise((resolve,reject)=>pending.set(id,{resolve,reject}));const timeout=setTimeout(()=>{const callback=pending.get(id);pending.delete(id);callback?.reject(Error('Capture command timed out: '+method));},10000);await cdp.send('Target.sendMessageToTarget',{sessionId,message:JSON.stringify({id,method,params})});try{return await response;}finally{clearTimeout(timeout);}}
 async function evaluate(expression){return (await send('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true})).result.value;}
 for(let i=0;i<100;i++){if(await evaluate('window.flytabInput?.ownsCommands && document.querySelector("#tabs").getAttribute("aria-busy")==="false"'))break;await pause(30);}
 assert.equal(await evaluate('document.querySelector("#tabs").getAttribute("aria-busy")'),'false');
 const rows=await evaluate('[...document.querySelectorAll(".tab")].map(r=>({title:r.querySelector(".title").textContent,meta:r.querySelector(".meta").textContent,selected:r.getAttribute("aria-selected")}))');
 assert.equal(rows.length,5);assert.equal(rows[0].title,'Project notes');assert.equal(rows[1].title,'Inbox — Mail');assert.equal(rows[1].meta,'Other window');assert.equal(rows[1].selected,'true');
 async function capture(name,dark){await send('Input.dispatchMouseEvent',{type:'mouseMoved',x:0,y:0});await send('Emulation.setEmulatedMedia',{features:[{name:'prefers-color-scheme',value:dark?'dark':'light'}]});await pause(100);const image=await send('Page.captureScreenshot',{format:'png',captureBeyondViewport:false});await writeFile(join(output,'captures',name),Buffer.from(image.data,'base64'));}
 await capture('switcher-light.png',false);
 await capture('switcher-dark.png',true);
 // Close the real popup before opening the genuine settings page.
 await evaluate('void chrome.runtime.sendMessage({type:"flytab:cancel",token:new URL(location.href).searchParams.get("session")})');
 await pause(100);
 await cdp.detach();
 const settings=await context.newPage();
 await settings.setViewportSize({width:620,height:640});await settings.emulateMedia({colorScheme:'light'});
 await settings.goto(origin+'options.html');
 await settings.waitForFunction(()=>!['Loading…','Unavailable'].includes(document.querySelector('#quick-shortcut').textContent));
 const shortcuts=await settings.locator('kbd').allTextContents();
 assert.ok(shortcuts.every(s=>s!=='Not assigned'),'Mac shortcuts must be assigned');
 await settings.screenshot({path:join(output,'captures','settings-light.png')});
 await writeFile(join(output,'captures','provenance.json'),JSON.stringify({version:manifest.version,browser:context.browser().version(),source:'Real extension documents captured in disposable Chrome profile. Production opening routine exposed only in temporary copy; no UI rewriting.',rows,shortcuts},null,2));
 await context.close();context=null;
 console.log('Captured real switcher light/dark and settings.');
 // Store compositions are static artwork; they never ship inside the extension.
 renderer=await chromium.launch({headless:true,executablePath:process.env.CHROME_PATH||chromium.executablePath()});
 const page=await renderer.newPage({viewport:{width:1280,height:800},deviceScaleFactor:1});
 const uri=async name=>'data:image/png;base64,'+(await readFile(join(output,'captures',name))).toString('base64');
 const svg=await readFile(join(root,'icons/icon.svg'),'utf8');
 const mark=svg.replace('width="24" height="24"','width="42" height="42"');
 const style=`*{box-sizing:border-box}body{margin:0;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif}main{width:1280px;height:800px;position:relative;overflow:hidden;background:#edf3fc;color:#242428}.brand{position:absolute;top:64px;left:72px;display:flex;gap:14px;align-items:center;font-size:27px;font-weight:600;letter-spacing:-.7px}.copy{position:absolute;left:72px;top:206px;width:490px}h1{font-size:54px;font-weight:600;line-height:1.09;letter-spacing:-2.1px;margin:0 0 26px}p{font-size:23px;line-height:1.5;color:#586579;margin:0}.keys{display:flex;gap:10px;align-items:center;margin-top:40px}.key{font-size:23px;padding:13px 20px;border:1px solid #c6d3e8;border-radius:10px;background:#f8fbff;box-shadow:0 2px 0 #c6d3e8;color:#233654}.caption{position:absolute;left:72px;bottom:63px;font-size:16px;color:#647187}.capture{position:absolute;left:640px;top:194px;width:568px;box-shadow:0 16px 46px #23365424;outline:1px solid #23365418}.capture img{display:block;width:100%;height:auto}.dark{background:#1d293d;color:#f2f2f5}.dark p{color:#b4c2d8}.dark .caption{color:#b4c2d8}.dark .key{background:#26364f;color:#e4edfb;border-color:#465874;box-shadow:0 2px 0 #465874}.settings .copy{width:420px}.settings h1{font-size:52px}.settings .capture{left:602px;top:74px;width:606px;box-shadow:0 16px 46px #23365418}`;
 const shots=[
 {name:'02-recent-tabs.png',image:'switcher-light.png',title:'Your recent tabs.<br>One simple shortcut.',body:'See where you’ve been.<br>Switch across Chrome windows.',keys:['⌥ Option','⇧ Shift','F'],caption:'Hold Option + Shift. Tap F to browse. Release both to switch.',className:''},
 {name:'01-previous-tab.png',image:'settings-light.png',title:'Back to the tab<br>you just left.',body:'Tap Option + F to go back.<br>Tap it again to return.',keys:['⌥ Option','F'],caption:'Choose your shortcuts in Chrome.',className:'settings'},
 {name:'03-dark-switcher.png',image:'switcher-dark.png',title:'Keep your flow.<br>Find an older tab.',body:'Names, icons, and window context.<br>A compact list in light or dark.',keys:['⌥ Option','⇧ Shift','F'],caption:'The current tab stays first. Your previous tab starts selected.',className:'dark'},
 ];
 for(const shot of shots){await page.setContent(`<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Flytab store image</title><style>${style}</style></head><body><main class="${shot.className}"><div class="brand">${shot.className==='dark'?mark.replace('#444746','#e8eaed'):mark}<span>Flytab</span></div><div class="copy"><h1>${shot.title}</h1><p>${shot.body}</p><div class="keys">${shot.keys.map(k=>`<span class="key">${k}</span>`).join('')}</div></div><div class="capture"><img src="${await uri(shot.image)}" alt="Actual Flytab interface"></div><div class="caption">${shot.caption}</div></main></body></html>`);await page.locator('img').evaluate(img=>img.decode());assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth),1280);await page.screenshot({path:join(output,'assets',shot.name)});}
 await page.setViewportSize({width:440,height:280});
 const promoMark=svg.replace('width="24" height="24"','width="108" height="108"').replace('#444746','#e8eaed');
 await page.setContent(`<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Flytab promotional tile</title><style>*{box-sizing:border-box}body{margin:0;background:#233654;width:440px;height:280px;display:flex;align-items:center;justify-content:center;gap:27px;font-family:-apple-system,BlinkMacSystemFont,sans-serif;color:#f2f5fb}span{font-size:47px;font-weight:600;letter-spacing:-1.7px}</style></head><body>${promoMark}<span>Flytab</span></body></html>`);
 await page.screenshot({path:join(output,'assets','promo-440x280.png')});
 console.log('Rendered three 1280×800 screenshots and 440×280 promotional tile.');
} finally {if(context)await context.close();if(renderer)await renderer.close();await new Promise(r=>server.close(r));await rm(scratch,{recursive:true,force:true});}
