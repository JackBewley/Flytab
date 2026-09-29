// Test-only harness: loads a temporary COPY with private controller hooks.
// The shipping extension has no test hooks, automation APIs or dependencies.
import assert from 'node:assert/strict';
import { mkdtemp, cp, appendFile, rm, mkdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright-core');
const source = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const scratch = await mkdtemp(join(tmpdir(), 'flytab-test-'));
const extension = join(scratch, 'Flytab');
await mkdir(extension);
// Load only runtime files, not .git, node_modules, packages or browser profiles.
for (const name of ['manifest.json', 'background.js', 'core.js', 'early-input.js',
  'popup.html', 'popup.js', 'popup.css', 'tab.svg']) {
  await cp(join(source, name), join(extension, name));
}
await appendFile(join(extension, 'background.js'), '\nglobalThis.flytabTest = { command, enqueue, read };\n');
const context = await chromium.launchPersistentContext(join(scratch, 'profile'), {
  executablePath: process.env.CHROME_PATH,
  headless: false, viewport: null,
  args: [`--disable-extensions-except=${extension}`, `--load-extension=${extension}`]
});
const results = [];
const errors = [];
context.on('page', page => page.on('pageerror', error => errors.push(error.message)));
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
let worker = context.serviceWorkers()[0] || await context.waitForEvent('serviceworker');
async function state() { return await worker.evaluate(async () => (await chrome.storage.session.get('flytab')).flytab); }
async function settled() { await pause(120); return await state(); }
async function invoke(name = 'switch-previous') {
  await worker.evaluate(async name => { const t=flytabTest; await t.enqueue(()=>t.command(name)); }, name);
}
async function popup() {
  for (let i=0; i<50; i++) {
    const page=context.pages().find(page=>page.url().includes('popup.html'));
    if (page) { await page.waitForFunction(()=>window.flytabInput?.handle && document.querySelector('#tabs').getAttribute('aria-busy')==='false'); return page; }
    await pause(30);
  }
  throw new Error('Popup did not appear');
}
async function input(page, key, type='keydown', options={}) {
  await page.evaluate(({key,type,options})=>window.dispatchEvent(new KeyboardEvent(type,{key,bubbles:true,...options})),{key,type,options});
  await pause(120);
}
function pass(name) { results.push(name); console.log('PASS',name); }
try {
  await settled();
  const ids = await worker.evaluate(async()=>{
    const main=(await chrome.windows.getAll())[0];
    const ids={window1:main.id};
    for (const label of ['Inbox','Project notes','Design review','Calendar','Documentation','A long tab title — 日本語 — that must not push the controls out of view']) {
      const tab=await chrome.tabs.create({windowId:main.id,url:'data:text/html;charset=utf-8,'+encodeURIComponent('<title>'+label+'</title><h1>'+label+'</h1>'),active:true});
      ids[label]=tab.id;
      await new Promise(r=>setTimeout(r,80));
    }
    const other=await chrome.windows.create({url:'data:text/html;charset=utf-8,'+encodeURIComponent('<title>Other window</title>'),focused:true});
    ids.window2=other.id; ids.destination=other.tabs[0].id;
    await new Promise(r=>setTimeout(r,100));
    await chrome.windows.update(main.id,{focused:true});
    ids.source=ids['A long tab title — 日本語 — that must not push the controls out of view'];
    return ids;
  });
  let s=await settled();
  assert.deepEqual(s.order.slice(0,2),[ids.source,ids.destination]);
  pass('global MRU tracks window focus');
  const ignored=await worker.evaluate(async windowId=>(await chrome.tabs.create({windowId,url:'about:blank#background',active:false})).id,ids.window1);
  s=await settled();
  assert.ok(!s.order.includes(ignored));
  pass('background-created tab stays out of MRU');
  const baseline=[...s.order];
  const initialPages=context.pages().length;
  await invoke('switch-next');
  s=await settled();
  assert.equal(s.session,null);
  assert.deepEqual(s.order.slice(0,2),[ids.destination,ids.source]);
  assert.equal(context.pages().length,initialPages);
  assert.equal(await worker.evaluate(async()=>(await chrome.windows.getAll()).find(w=>w.focused)?.id),ids.window2);
  pass('primary command commits across windows without popup or keyup');
  await invoke('switch-next');
  assert.deepEqual((await settled()).order,baseline);
  pass('second primary command immediately returns to the source tab');
  const burst=await worker.evaluate(async()=>{
    const t=flytabTest;
    const staleTab=(await chrome.tabs.query({active:true,lastFocusedWindow:true}))[0];
    return await Promise.all(Array.from({length:6},()=>t.enqueue(async()=>{
      await t.command('switch-next',staleTab);
      return (await chrome.storage.session.get('flytab')).flytab.order.slice(0,2);
    })));
  });
  burst.forEach((pair,index)=>assert.deepEqual(pair,index%2 ? [ids.source,ids.destination] : [ids.destination,ids.source]));
  assert.deepEqual((await settled()).order,baseline);
  assert.equal(context.pages().length,initialPages);
  pass('six queued rapid toggles alternate correctly despite a stale event tab');
  await invoke();
  let page=await popup();
  s=await state();
  assert.equal(s.session.ids[s.session.index],ids.destination);
  assert.deepEqual(s.order,baseline);
  assert.ok((await page.locator('#hint').textContent()).includes('Release'));
  await input(page,'ArrowDown');
  assert.equal((await state()).session.index,1);
  await input(page,'ArrowUp');
  assert.equal((await state()).session.index,0);
  assert.deepEqual((await state()).order,baseline);
  pass('arrows preview without changing MRU');
  const token=(await state()).session.token;
  await input(page,'f','keydown',{code:'KeyF'});
  await input(page,'f','keydown',{code:'KeyF',repeat:true});
  await input(page,'f','keydown',{code:'KeyF'});
  assert.equal((await state()).session.index,3);
  await input(page,'F','keydown',{code:'KeyF',shiftKey:true});
  assert.equal((await state()).session.index,4);
  assert.deepEqual((await state()).order,baseline);
  pass('F repeats and Shift+F both advance without activating a tab');
  // Keep the opening Option+Shift chord: every subsequent F goes forward.
  await input(page,'ƒ','keydown',{code:'KeyF',altKey:true,shiftKey:true});
  assert.equal((await state()).session.index,4);
  const length=(await state()).session.ids.length;
  for (let i=0;i<3;i++) {
    await invoke('switch-previous');
    assert.equal((await state()).session.index,(5+i)%length);
    await input(page,'F','keyup',{code:'KeyF',altKey:true,shiftKey:true});
    assert.equal((await state()).session.token,token);
    assert.deepEqual((await state()).order,baseline);
  }
  pass('repeating the opening chord advances; F release keeps the held-modifier list open');
  const priorIndex=(await state()).session.index;
  await invoke('switch-next');
  assert.equal((await state()).session.index,(priorIndex+1)%length);
  assert.deepEqual((await state()).order,baseline);
  pass('both registered commands advance through the same frozen list');
  for (let i=0;i<length;i++) await invoke('switch-previous');
  assert.equal((await state()).session.index,(priorIndex+1)%length);
  assert.deepEqual((await state()).order,baseline);
  pass('repeating the opening chord wraps forward without changing MRU');
  await input(page,'Escape');
  assert.equal((await settled()).session,null);
  assert.deepEqual((await state()).order,baseline);
  pass('Escape cancels without a commit');
  await invoke(); page=await popup();
  await pause(500);
  s=await settled();
  assert.ok(s.session);
  assert.deepEqual(s.order,baseline);
  pass('a release missed before popup creation does not trigger a guessed timer commit');
  await input(page,'Enter');
  s=await settled();
  assert.equal(s.session,null);
  assert.deepEqual(s.order.slice(0,2),[ids.destination,ids.source]);
  assert.equal(await worker.evaluate(async()=>(await chrome.windows.getAll()).find(w=>w.focused)?.id),ids.window2);
  pass('Enter explicitly commits the list selection and focuses its window');
  await invoke('switch-next');
  assert.deepEqual((await settled()).order,baseline);
  for (const first of ['Shift','Alt']) {
    await invoke(); page=await popup();
    await input(page,'F','keyup',{code:'KeyF',altKey:true,shiftKey:true});
    await input(page,first,'keyup',{altKey:first==='Shift',shiftKey:first==='Alt'});
    assert.ok((await state()).session);
    assert.deepEqual((await state()).order,baseline);
    await input(page,first==='Shift'?'Alt':'Shift','keyup');
    s=await settled();
    assert.equal(s.session,null);
    assert.deepEqual(s.order.slice(0,2),[ids.destination,ids.source]);
    assert.equal(await worker.evaluate(async()=>(await chrome.windows.getAll()).find(w=>w.focused)?.id),ids.window2);
    pass(`release commits only after both modifiers are up (${first} released first)`);
    await invoke('switch-next');
    assert.deepEqual((await settled()).order,baseline);
  }
  // Delay only the UI module: the synchronous early script must buffer release.
  let loadUI;
  const gate=new Promise(resolve=>{loadUI=resolve;});
  await context.route('**/popup.js',async route=>{await gate;await route.continue();});
  const openingPage=context.waitForEvent('page');
  await invoke();
  page=await openingPage;
  await page.waitForFunction(()=>window.flytabInput && !window.flytabInput.handle);
  await input(page,'Shift','keyup');
  assert.equal(await page.evaluate(()=>window.flytabInput.pending.length),1);
  const closedEarly=page.waitForEvent('close');
  loadUI();
  await closedEarly;
  await context.unroute('**/popup.js');
  assert.deepEqual((await settled()).order.slice(0,2),[ids.destination,ids.source]);
  pass('release during UI loading is buffered and commits after initialization');
  await invoke('switch-next');
  assert.deepEqual((await settled()).order,baseline);
  await invoke(); page=await popup();
  const closed=(await state()).session.ids[0];
  await worker.evaluate(id=>chrome.tabs.remove(id),closed);
  await pause(150);
  s=await state();
  assert.ok(!s.order.includes(closed));
  assert.ok(!s.session.ids.includes(closed));
  assert.equal(await page.locator('[role=option]').count(),s.session.ids.length);
  pass('closed selection is removed from history and live popup');
  await page.evaluate(()=>document.querySelector('#cancel').click());
  assert.equal((await settled()).session,null);
  pass('visible Cancel button is wired through external JavaScript');
  await invoke(); page=await popup();
  const beforeCancel=(await state()).order;
  await page.locator('#cancel').focus();
  await page.keyboard.press('Enter');
  assert.equal((await settled()).session,null);
  assert.deepEqual((await state()).order,beforeCancel);
  pass('Enter on focused Cancel cancels instead of activating a tab');
  await invoke(); page=await popup();
  const chosen=(await state()).session.ids[2];
  await page.evaluate(id=>document.getElementById('tab-'+id).click(),chosen);
  assert.equal((await settled()).order[0],chosen);
  pass('clicking a row activates that tab');
  await invoke(); page=await popup();
  const before=(await state()).session.index;
  await page.evaluate(()=>document.querySelector('#tabs').dispatchEvent(new WheelEvent('wheel',{deltaY:60,cancelable:true})));
  await pause(150);
  assert.equal((await state()).session.index,before+1);
  pass('wheel advances selection without activating it');
  await input(page,'Escape');
  await invoke(); page=await popup();
  const beforeRelease=(await state()).order;
  await invoke(); await invoke(); await invoke();
  const selected=(await state()).session.ids[(await state()).session.index];
  await input(page,'Alt','keyup',{shiftKey:true});
  assert.deepEqual((await state()).order,beforeRelease);
  await input(page,'Shift','keyup');
  assert.equal((await settled()).session,null);
  assert.deepEqual((await state()).order.slice(0,2),[selected,beforeRelease[0]]);
  pass('releasing the held chord commits the last cycled entry, with source second');
  await invoke(); page=await popup();
  const beforeHeldEscape=(await state()).order;
  await input(page,'Escape','keydown',{altKey:true,shiftKey:true});
  assert.equal((await settled()).session,null);
  assert.deepEqual((await state()).order,beforeHeldEscape);
  pass('Escape cancels while the opening modifiers remain held');
  // Favicon source can be checked without navigating a website or making a remote request.
  const forbidden=await worker.evaluate(()=>chrome.runtime.getManifest().content_security_policy.extension_pages);
  assert.ok(forbidden.includes("connect-src 'none'"));
  assert.ok(forbidden.includes("img-src 'self' data:"));
  assert.equal(await worker.evaluate(()=>chrome.runtime.getManifest().incognito),'not_allowed');
  pass('CSP prohibits remote images/connections and incognito is disabled');
  // Force a new worker lifetime without losing session-backed order.
  const expected=(await state()).order;
  const cdp=await context.newCDPSession(context.pages()[0]);
  const versions=[];
  cdp.on('ServiceWorker.workerVersionUpdated', event=>versions.push(...event.versions));
  await cdp.send('ServiceWorker.enable');
  await pause(100);
  const version=versions.find(v=>v.scriptURL===worker.url() && v.status==='activated');
  assert.ok(version,'service worker version available');
  await cdp.send('ServiceWorker.stopWorker',{versionId:version.versionId});
  // Opening an extension page sends a message and wakes the worker.
  const wake=await context.newPage();
  await wake.goto(worker.url().replace('background.js','popup.html?session=expired-test'));
  worker=context.serviceWorkers().find(w=>w.url().includes('background.js')) || await context.waitForEvent('serviceworker');
  for (let i=0;i<30;i++) { try { await state(); break; } catch { await pause(100); worker=context.serviceWorkers().find(w=>w.url().includes('background.js')); } }
  await pause(100);
  assert.deepEqual((await state()).order,expected);
  await wake.close();
  pass('MRU survives an actual service worker stop and restart');
  await invoke('switch-next');
  assert.deepEqual((await settled()).order.slice(0,2),[expected[1],expected[0]]);
  assert.equal((await state()).session,null);
  pass('immediate toggling still works after worker restart');
  await invoke('switch-next');
  await settled();
  await invoke(); page=await popup();
  const evidence=process.env.FLYTAB_EVIDENCE;
  if (evidence) {
    await mkdir(evidence,{recursive:true});
    await page.emulateMedia({colorScheme:'light'});
    await page.screenshot({path:join(evidence,'light.png')});
    await page.emulateMedia({colorScheme:'dark'});
    await page.screenshot({path:join(evidence,'dark.png')});
    const windowId=(await state()).session.windowId;
    await worker.evaluate(id=>chrome.windows.update(id,{width:320}),windowId);
    await pause(100);
    assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
    await page.screenshot({path:join(evidence,'narrow.png')});
  }
  assert.deepEqual(errors,[]);
  pass('popup has no page errors; narrow viewport does not overflow');
  await input(page,'Escape');
  const solo=await worker.evaluate(async()=>{
    const tabs=await chrome.tabs.query({});
    const active=tabs.find(t=>t.active && !t.url.startsWith(chrome.runtime.getURL('')));
    await chrome.windows.update(active.windowId,{focused:true});
    await chrome.tabs.remove(tabs.filter(t=>t.id!==active.id).map(t=>t.id));
    return active.id;
  });
  await settled();
  await invoke('switch-next');
  s=await settled();
  assert.deepEqual(s.order,[solo]);
  assert.equal(s.session,null);
  pass('primary shortcut with one tab is a harmless no-op');
  console.log(JSON.stringify({browser:context.browser().version(),passed:results.length,results},null,2));
  if (process.env.FLYTAB_EVIDENCE) await writeFile(join(process.env.FLYTAB_EVIDENCE,'results.json'),JSON.stringify({browser:context.browser().version(),passed:results.length,results},null,2));
} finally {
  await context.close();
  await rm(scratch,{recursive:true,force:true});
}
