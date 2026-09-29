// Development-only startup benchmark; no hooks or instrumentation ship.
// CHROME_PATH=/path/to/Chrome PLAYWRIGHT_MODULE=/path/to/playwright-core/index.mjs \
//   FLYTAB_SOURCE=/path/to/source FLYTAB_EVIDENCE=/path/to/result.json node tests/startup.mjs
// For a committed baseline: git archive REV | tar -x -C /temporary/source
// Defaults: 15 warm + 10 worker-restarted samples at 8 and 120 visited tabs.
// Set FLYTAB_ACTION_PINNED=1 (or 0) to test production pinned/unpinned paths.
// A temporary public manifest key and fresh-profile preference set pinning only
// in this disposable browser. No user profile or production manifest is changed.
import assert from 'node:assert/strict';
import { mkdtemp, cp, appendFile, readFile, rm, mkdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { generateKeyPairSync, createHash } from 'node:crypto';
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright-core');
const source = resolve(process.env.FLYTAB_SOURCE || join(dirname(fileURLToPath(import.meta.url)), '..'));
const evidence = process.env.FLYTAB_EVIDENCE;
const pinned = process.env.FLYTAB_ACTION_PINNED == null ? null : process.env.FLYTAB_ACTION_PINNED === '1';
const sizes = (process.env.FLYTAB_TAB_COUNTS || '8,120').split(',').map(Number);
const warmSamples = Number(process.env.FLYTAB_WARM_SAMPLES || 15);
const restartedSamples = Number(process.env.FLYTAB_RESTARTED_SAMPLES || 10);
const scratch = await mkdtemp(join(tmpdir(), 'flytab-startup-'));
const extension = join(scratch, 'Flytab');
await mkdir(extension);
for (const name of ['manifest.json', 'background.js', 'core.js', 'early-input.js', 'popup.html', 'popup.js', 'popup.css', 'tab.svg']) {
  await cp(join(source, name), join(extension, name));
}
await cp(join(source, 'icons'), join(extension, 'icons'), { recursive: true });
const manifest = JSON.parse(await readFile(join(extension, 'manifest.json'), 'utf8'));
const version = manifest.version;
if (pinned != null) {
  const publicKey = generateKeyPairSync('rsa', {modulusLength:2048}).publicKey.export({type:'spki',format:'der'});
  manifest.key = publicKey.toString('base64');
  const extensionId = createHash('sha256').update(publicKey).digest('hex').slice(0,32)
    .replace(/[0-9a-f]/g, character => String.fromCharCode(97 + parseInt(character,16)));
  await writeFile(join(extension, 'manifest.json'), JSON.stringify(manifest,null,2));
  await mkdir(join(scratch, 'profile', 'Default'), {recursive:true});
  await writeFile(join(scratch, 'profile', 'Default', 'Preferences'), JSON.stringify({extensions:{pinned_extensions:pinned ? [extensionId] : []}}));
}
// Source hashes identify exactly what was measured even if the repository later changes.
const sourceHashes = {};
for (const file of ['background.js','core.js','early-input.js','popup.html','popup.js','popup.css']) {
  sourceHashes[file] = createHash('sha256').update(await readFile(join(extension,file))).digest('hex');
}
const workerProbe = `
// Benchmark-only probe, inserted in a temporary copy.
const flytabBench = globalThis.flytabBench = {
  workerStarted: performance.timeOrigin + performance.now(), calls: [], marks: {}, command: null, popup: null, errors: [],
  now: () => performance.timeOrigin + performance.now()
};
for (const [object, name, label] of [
  [chrome.tabs,'query','tabs.query'], [chrome.tabs,'get','tabs.get'],
  [chrome.windows,'get','windows.get'], [chrome.windows,'getAll','windows.getAll'],
  [chrome.windows,'getLastFocused','windows.getLastFocused'],
  [chrome.windows,'create','windows.create'], [chrome.windows,'update','windows.update'],
  [chrome.storage.session,'get','storage.session.get'], [chrome.storage.session,'set','storage.session.set'],
  [chrome.action,'getUserSettings','action.getUserSettings'], [chrome.action,'setPopup','action.setPopup'],
  [chrome.action,'openPopup','action.openPopup'], [chrome.runtime,'getContexts','runtime.getContexts']
]) {
  if (typeof object[name] !== 'function') continue;
  const original = object[name].bind(object);
  object[name] = function(...args) {
    const at = flytabBench.now();
    flytabBench.calls.push({name:label, at});
    const opening = label === 'windows.create' || label === 'action.openPopup';
    if (opening) { flytabBench.marks.windowCreateStart = at; flytabBench.marks.openingApi = label; }
    const result = original(...args);
    if (opening && result?.then) {
      result.then(() => { flytabBench.marks.windowCreateResolved = flytabBench.now(); }, () => {});
    }
    return result;
  };
}
const commandEvent = chrome.commands.onCommand;
const addCommand = commandEvent.addListener.bind(commandEvent);
const removeCommand = commandEvent.removeListener.bind(commandEvent);
const hasCommand = commandEvent.hasListener.bind(commandEvent);
const commandWrappers = new WeakMap();
commandEvent.addListener = listener => {
  flytabBench.command = listener;
  let wrapped = commandWrappers.get(listener);
  if (!wrapped) {
    wrapped = (...args) => {
      flytabBench.marks.commandDispatch = flytabBench.now();
      return listener(...args);
    };
    commandWrappers.set(listener, wrapped);
  }
  return addCommand(wrapped);
};
// Production temporarily removes its named listener during popup input ownership.
// Preserve callback identity instead of leaving an instrumented listener behind.
commandEvent.removeListener = listener => removeCommand(commandWrappers.get(listener) || listener);
commandEvent.hasListener = listener => hasCommand(commandWrappers.get(listener) || listener);
`;
await writeFile(join(extension, 'background.js'), workerProbe + await readFile(join(extension, 'background.js'), 'utf8'));
await appendFile(join(extension, 'background.js'), `
// Private command and queue controls exist only in this disposable copy.
globalThis.flytabStartupTest = { drain: () => enqueue(async () => {}) };
chrome.runtime.onMessage.addListener((request, sender, respond) => {
  if (sender.id !== chrome.runtime.id) return;
  if (request?.type === 'flytab-benchmark:probe') {
    flytabBench.popup = request.probe; respond({ok:true}); return;
  }
  if (request?.type === 'flytab-benchmark:error') {
    flytabBench.errors.push(request.error); respond({ok:true}); return;
  }
  if (request?.type !== 'flytab-benchmark:open') return;
  flytabBench.popup = null;
  flytabBench.marks = {controllerSent:request.sent, commandDispatch:flytabBench.now()};
  flytabBench.command('switch-previous');
  respond({ok:true});
});
`);
await appendFile(join(extension, 'early-input.js'), `
// Benchmark-only: runs after the synchronous input-capture script.
// Self-reporting covers toolbar bubbles, which are not Playwright Page targets.
(() => {
  const now = () => performance.timeOrigin + performance.now();
  const probe = window.flytabStartupProbe = {inputReady:now(), focusedAtInputReady:document.hasFocus(), focusEvents:[],
    requiresCommandHandoff:'ownsCommands' in window.flytabInput};
  let reported = false;
  const report = () => {
    if (reported || !probe.listReady || !probe.inputAndFocusReady || !probe.readyAnimationFrame || !document.hasFocus() ||
      (probe.requiresCommandHandoff && !probe.commandHandoffReady)) return;
    reported = true;
    probe.documentFocused = document.hasFocus();
    // One telemetry message, only after every measured readiness milestone.
    void chrome.runtime.sendMessage({type:'flytab-benchmark:probe',probe:{...probe}}).catch(()=>{});
  };
  // Reclaim waits for shortcut lookup, so this synchronous probe can observe
  // the ownership connection before it is created without changing its lifetime.
  if (probe.requiresCommandHandoff) {
    const connect = chrome.runtime.connect.bind(chrome.runtime);
    chrome.runtime.connect = (...args) => {
      const port = connect(...args);
      if (port.name.startsWith('flytab-input:')) port.onMessage.addListener(message => {
        if (message.type !== 'flytab:input-ready') return;
        probe.commandHandoffReady ??= now();
        report();
      });
      return port;
    };
  }
  if (document.hasFocus()) probe.inputAndFocusReady = probe.inputReady;
  window.addEventListener('focus', event => {
    const detail = {at:now(),target:event.target === window ? 'window' : 'element',documentFocused:document.hasFocus()};
    probe.focusEvents.push(detail);
    // list.focus() can dispatch an element focus while the toolbar bubble is
    // still hidden/unfocused. Only document.hasFocus() proves input readiness.
    if (!detail.documentFocused) return;
    probe.focusEvent ??= detail.at; probe.inputAndFocusReady ??= detail.at; report();
  }, {capture:true});
  const observe = () => {
    const list = document.querySelector('#tabs');
    if (list?.getAttribute('aria-busy') === 'false' && list.querySelector('[role=option]')) {
      probe.listReady ??= now();
      probe.itemCount = list.querySelectorAll('[role=option]').length;
      if (document.hasFocus()) probe.inputAndFocusReady ??= now();
      requestAnimationFrame(() => { probe.readyAnimationFrame ??= now(); report(); });
      observer.disconnect();
    }
  };
  const observer = new MutationObserver(observe);
  observer.observe(document, {subtree:true, childList:true, attributes:true, attributeFilter:['aria-busy']});
  document.addEventListener('DOMContentLoaded', () => { probe.domContentLoaded = now(); observe(); }, {once:true});
  chrome.runtime.onMessage.addListener((message, sender, respond) => {
    if (message.type !== 'flytab-benchmark:cancel') return;
    window.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true,cancelable:true}));
    respond({ok:true});
  });
  for (const type of ['error','unhandledrejection']) window.addEventListener(type, event => {
    const error = event.message || event.reason?.message || String(event.reason);
    void chrome.runtime.sendMessage({type:'flytab-benchmark:error',error}).catch(()=>{});
  });
})();
`);
await writeFile(join(extension, 'flytab-benchmark.html'), '<!doctype html><html><head><title>Flytab benchmark controller</title></head><body></body></html>');
const context = await chromium.launchPersistentContext(join(scratch, 'profile'), {
  executablePath: process.env.CHROME_PATH, headless: false, viewport: null,
  args: [`--disable-extensions-except=${extension}`, `--load-extension=${extension}`]
});
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
const errors = [];
context.on('page', page => page.on('pageerror', error => errors.push(error.message)));
let worker = context.serviceWorkers()[0] || await context.waitForEvent('serviceworker');
const origin = worker.url().replace('background.js','');
if (pinned != null) assert.equal((await worker.evaluate(() => chrome.action.getUserSettings())).isOnToolbar, pinned, 'Temporary profile pin preference applied');
const controller = await context.newPage();
await controller.goto(origin + 'flytab-benchmark.html');
const cdp = await context.newCDPSession(controller);
const versions = new Map();
cdp.on('ServiceWorker.workerVersionUpdated', event => { for (const version of event.versions) versions.set(version.versionId, version); });
await cdp.send('ServiceWorker.enable');
async function getWorker() {
  for (let attempt=0;attempt<100;attempt++) {
    worker = context.serviceWorkers().find(candidate => candidate.url() === origin + 'background.js');
    try { if (worker && await worker.evaluate(() => Boolean(globalThis.flytabStartupTest))) return worker; } catch {}
    await pause(20);
  }
  throw new Error('Worker did not become available');
}
async function drain() { await (await getWorker()).evaluate(() => flytabStartupTest.drain()); }
async function stopWorker() {
  const version = [...versions.values()].find(version => version.scriptURL === origin + 'background.js' && version.status === 'activated' && version.runningStatus === 'running');
  assert.ok(version, 'An active service-worker version must be available to stop');
  const priorStarted = await worker.evaluate(() => flytabBench.workerStarted);
  await cdp.send('ServiceWorker.stopWorker', {versionId:version.versionId});
  // Playwright can keep its Worker wrapper after Chrome stops the underlying
  // extension worker; CDP lifecycle plus a fresh script-start timestamp verify it.
  for (let attempt=0;attempt<100;attempt++) {
    if (versions.get(version.versionId)?.runningStatus === 'stopped') return priorStarted;
    await pause(20);
  }
  throw new Error('Chrome did not report the worker stopped');
}
function distribution(values) {
  const sorted = values.filter(Number.isFinite).sort((a,b)=>a-b);
  const at = quantile => sorted[Math.max(0,Math.ceil(sorted.length*quantile)-1)];
  return {n:sorted.length, p50:at(.5), p95:at(.95), min:sorted[0], max:sorted.at(-1)};
}
function aggregate(samples) {
  const timingKeys = Object.keys(samples[0].timingsMs);
  const apiNames = [...new Set(samples.flatMap(sample => Object.keys(sample.apiBeforeWindowCreate)))];
  const listApiNames = [...new Set(samples.flatMap(sample => Object.keys(sample.apiThroughListReady)))];
  return {
    mechanisms:[...new Set(samples.map(sample=>sample.mechanism))],
    timingsMs:Object.fromEntries(timingKeys.map(key=>[key,distribution(samples.map(sample=>sample.timingsMs[key]))])),
    apiBeforeWindowCreate:Object.fromEntries(apiNames.map(name=>[name,distribution(samples.map(sample=>sample.apiBeforeWindowCreate[name]||0))])),
    apiThroughListReady:Object.fromEntries(listApiNames.map(name=>[name,distribution(samples.map(sample=>sample.apiThroughListReady[name]||0))])),
    trackedCallsThroughListReady:distribution(samples.map(sample=>Object.values(sample.apiThroughListReady).reduce((sum,n)=>sum+n,0)))
  };
}
const results = [];
try {
  await drain();
  const fixture = await worker.evaluate(async () => {
    const first = (await chrome.windows.getAll({windowTypes:['normal']}))[0];
    return {windowId:first.id, ids:[]};
  });
  for (const count of sizes) {
    assert.ok(count>=2 && count>=fixture.ids.length, 'Tab counts must be increasing integers of at least two');
    for (let index=fixture.ids.length;index<count;index++) {
      const id = await worker.evaluate(async ({windowId,index}) => (await chrome.tabs.create({windowId, active:true, url:'about:blank#flytab-startup-'+index})).id, {windowId:fixture.windowId,index});
      fixture.ids.push(id);
      await drain();
    }
    // Seeding uses real activation events so caches and durable order agree.
    const fixtureOrder = await worker.evaluate(async ids => {
      const data = (await chrome.storage.session.get('flytab')).flytab;
      return {visited:data.order.filter(id=>ids.includes(id)).length, source:data.order[0]};
    }, fixture.ids);
    assert.equal(fixtureOrder.visited,count);
    assert.equal(fixtureOrder.source,fixture.ids.at(-1));
    // One unmeasured warmup primes this scenario's ordinary browser disk cache.
    for (const mode of ['warm','worker-restarted']) {
      const samples=[];
      const sampleCount = mode === 'warm' ? warmSamples : restartedSamples;
      for (let sampleIndex=-1;sampleIndex<sampleCount;sampleIndex++) {
        await drain();
        await pause(80);
        const priorWorkerStarted = mode === 'worker-restarted' ? await stopWorker() : null;
        const automationStarted = performance.now();
        await controller.evaluate(async () => {
          const sent = performance.timeOrigin + performance.now();
          await chrome.runtime.sendMessage({type:'flytab-benchmark:open', sent});
        });
        await getWorker();
        let popupProbe;
        for (let attempt=0;attempt<300;attempt++) {
          popupProbe = await worker.evaluate(() => flytabBench.popup);
          if (popupProbe?.listReady && popupProbe?.inputAndFocusReady && popupProbe?.readyAnimationFrame) break;
          await pause(20);
        }
        assert.ok(popupProbe?.listReady && popupProbe?.inputAndFocusReady, 'Focused popup must report listener and list readiness');
        await drain();
        const workerProbe = await worker.evaluate(() => ({marks:flytabBench.marks, workerStarted:flytabBench.workerStarted, calls:flytabBench.calls.filter(call=>call.at>=flytabBench.marks.controllerSent), errors:flytabBench.errors}));
        assert.deepEqual(workerProbe.errors,[]);
        if (priorWorkerStarted != null) assert.ok(workerProbe.workerStarted > priorWorkerStarted, 'Restarted samples must execute a new worker lifetime');
        const mark=workerProbe.marks;
        assert.ok(mark.windowCreateStart && mark.commandDispatch && popupProbe.inputReady);
        assert.equal(popupProbe.documentFocused,true, 'Readiness report must come from a genuinely focused document');
        assert.ok(popupProbe.itemCount>=count, 'The switcher must render the full fixture history');
        // Chrome timestamps can share a 0.1ms bucket; preserve call order at
        // the creation boundary rather than dropping same-timestamp calls.
        const createCallIndex = workerProbe.calls.findLastIndex(call=>call.name === mark.openingApi);
        assert.ok(createCallIndex >= 0);
        const beforeCreate = workerProbe.calls.slice(0, createCallIndex);
        const apiBeforeWindowCreate={};
        for (const call of beforeCreate) apiBeforeWindowCreate[call.name]=(apiBeforeWindowCreate[call.name]||0)+1;
        const apiThroughListReady={};
        for (const call of workerProbe.calls.filter(call=>call.at<=popupProbe.listReady)) {
          apiThroughListReady[call.name]=(apiThroughListReady[call.name]||0)+1;
        }
        const round=value=>Number(value.toFixed(3));
        const entry={
          sample:sampleIndex+1, mechanism:mark.openingApi === 'action.openPopup' ? 'action' : 'window',
          timingsMs:{
            controllerToDispatch:round(mark.commandDispatch-mark.controllerSent),
            dispatchToCreateCall:round(mark.windowCreateStart-mark.commandDispatch),
            createCallToResolved:round(mark.windowCreateResolved-mark.windowCreateStart),
            dispatchToInputReady:round(popupProbe.inputReady-mark.commandDispatch),
            dispatchToInputAndFocusReady:popupProbe.inputAndFocusReady ? round(popupProbe.inputAndFocusReady-mark.commandDispatch) : null,
            dispatchToListReady:round(popupProbe.listReady-mark.commandDispatch),
            dispatchToInteractiveReady:round(Math.max(popupProbe.listReady,popupProbe.inputAndFocusReady)-mark.commandDispatch),
            dispatchToCommandHandoffReady:popupProbe.commandHandoffReady ? round(popupProbe.commandHandoffReady-mark.commandDispatch) : null,
            dispatchToFullyReady:round(Math.max(popupProbe.listReady,popupProbe.inputAndFocusReady,popupProbe.commandHandoffReady || 0)-mark.commandDispatch),
            controllerToInputReady:round(popupProbe.inputReady-mark.controllerSent),
            controllerToInputAndFocusReady:round(popupProbe.inputAndFocusReady-mark.controllerSent),
            controllerToListReady:round(popupProbe.listReady-mark.controllerSent),
            controllerToInteractiveReady:round(Math.max(popupProbe.listReady,popupProbe.inputAndFocusReady)-mark.controllerSent),
            automationRoundTrip:round(performance.now()-automationStarted)
          },
          apiBeforeWindowCreate, apiThroughListReady, popup:popupProbe, worker:workerProbe
        };
        if(sampleIndex>=0) samples.push(entry);
        await worker.evaluate(() => chrome.runtime.sendMessage({type:'flytab-benchmark:cancel'}));
        await drain();
        for (let attempt=0;attempt<150;attempt++) {
          // Query all live extension documents: exact token URLs vary per open.
          const contexts = await worker.evaluate(() => chrome.runtime.getContexts({}));
          if (!contexts.some(item=>item.documentUrl?.startsWith(origin + 'popup.html'))) break;
          if (attempt === 149) throw new Error('Switcher did not close after Escape');
          await pause(20);
        }
        await drain();
      }
      const summary=aggregate(samples);
      results.push({tabCount:count,mode,samples,summary});
      console.log(JSON.stringify({tabCount:count,mode,...summary},null,2));
    }
  }
  assert.deepEqual(errors,[]);
  const report={
    source,version,sourceHashes,pinned,browser:context.browser().version(),createdAt:new Date().toISOString(),
    methodology:[
      'Temporary runtime-only extension copy; all probes and private command hooks are excluded from shipping source.',
      'Optional pinning uses a temporary public manifest key and fresh-profile Preferences; ordinary user profiles and source manifests are unchanged.',
      'Toolbar action bubbles do not appear as Playwright Pages, so the popup reports one telemetry message after its listener, focus and rendered-list milestones. The same probe is used for both UI mechanisms.',
      'The legacy windowCreate/createCall metric keys refer to the actual UI-opening API: windows.create or action.openPopup, recorded as openingApi/mechanism. Input-ready and focus-ready must be distinguished for toolbar bubbles.',
      'Controller sends an extension message that invokes the registered command callback. This is not a physical keyboard test.',
      'Command-event probes preserve add/remove/hasListener callback identity so production input ownership can unregister and restore its real listener.',
      'When production uses a popup input-ownership port, command handoff readiness is marked at its authenticated ready acknowledgement. Fully-ready timing includes that milestone as well as list and document focus. Baselines without that protocol have a null handoff marker.',
      'Dispatch-based timing begins inside the worker immediately before the registered command callback; it excludes Playwright transport and physical OS/Chrome shortcut delivery.',
      'Controller-based timing additionally includes extension message transport and worker wake on restarted samples. Restarted mode explicitly stops the worker using CDP before each sample.',
      'Input readiness is marked immediately after the synchronous early-input script installs listeners. Focus readiness is the first observed focused document with those listeners installed; it is not proof of physical key delivery.',
      'List readiness is the first mutation observation of rendered options and aria-busy=false. Interactive readiness is the later of list readiness and input+focus readiness; a pre-rendered unfocused bubble is not yet interactive. These are DOM/focus markers, not a compositor paint guarantee.',
      'One unmeasured opening precedes each scenario. Visited about:blank fixtures avoid remote network, cached favicon work and website renderer variation.',
      'p50 and p95 use nearest rank. Small-sample tail timings and headed OS focus scheduling are noisy; compare the API counts and repeated runs too.',
      'API counts before window creation include worker initialization after controller-send on restarted samples; all calls and raw timestamps are retained.',
      'The controller page and Playwright debugging connections remain present in both before/after runs; these results do not model every user/browser load.'
    ],results,errors
  };
  if(evidence){await mkdir(dirname(resolve(evidence)),{recursive:true});await writeFile(evidence,JSON.stringify(report,null,2)+'\n');}
  console.log(`Completed ${results.reduce((n,result)=>n+result.samples.length,0)} openings for Flytab ${version}.`);
} finally {
  await context.close();
  await rm(scratch,{recursive:true,force:true});
}
