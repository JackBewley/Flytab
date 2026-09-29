// Development-only integration harness for the pinned toolbar popup path.
// Uses a disposable source copy/profile. No hooks, generated key or pin changes ship.
import assert from 'node:assert/strict';
import { mkdtemp, cp, readFile, writeFile, appendFile, mkdir, rm } from 'node:fs/promises';
import { generateKeyPairSync, createHash } from 'node:crypto';
import { tmpdir } from 'node:os';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright-core');
const source = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const scratch = await mkdtemp(join(tmpdir(), 'flytab-action-test-'));
const extension = join(scratch, 'Flytab');
await mkdir(extension);
for (const name of ['manifest.json', 'background.js', 'core.js', 'early-input.js',
  'popup.html', 'popup.js', 'popup.css', 'tab.svg']) {
  await cp(join(source, name), join(extension, name));
}
await cp(join(source, 'icons'), join(extension, 'icons'), { recursive: true });
const manifest = JSON.parse(await readFile(join(extension, 'manifest.json'), 'utf8'));
const publicKey = generateKeyPairSync('rsa', { modulusLength: 2048 }).publicKey.export({ type: 'spki', format: 'der' });
manifest.key = publicKey.toString('base64');
const extensionId = createHash('sha256').update(publicKey).digest('hex').slice(0, 32)
  .replace(/[0-9a-f]/g, digit => String.fromCharCode(97 + parseInt(digit, 16)));
await writeFile(join(extension, 'manifest.json'), JSON.stringify(manifest, null, 2));
await mkdir(join(scratch, 'profile', 'Default'), { recursive: true });
await writeFile(join(scratch, 'profile', 'Default', 'Preferences'), JSON.stringify({
  extensions: { pinned_extensions: [extensionId] }
}));
// Capture the actual registered callbacks rather than reproducing their logic.
const workerProbe = String.raw`
const flytabActionTest = globalThis.flytabActionTest = { started: Date.now(), errors: [], requests: [] };
for (const [event, name] of [[chrome.commands.onCommand, 'command'], [chrome.action.onClicked, 'toolbar']]) {
  const add = event.addListener.bind(event);
  event.addListener = callback => { flytabActionTest[name] = callback; return add(callback); };
}
chrome.runtime.onMessage.addListener((request, sender) => {
  if (request?.type === 'flytab:get') flytabActionTest.requests.push({ request, sender });
  if (request?.type === 'flytab-action-test:error') flytabActionTest.errors.push(request.error);
});
`;
await writeFile(join(extension, 'background.js'), workerProbe + await readFile(join(extension, 'background.js'), 'utf8'));
await appendFile(join(extension, 'background.js'), '\nflytabActionTest.drain = () => enqueue(async () => {});\nflytabActionTest.contexts = actionContexts;\n');
// Toolbar bubbles are not always Playwright Page targets. Inspect and dispatch
// through private runtime hooks in this copy, while exercising production input.
await appendFile(join(extension, 'early-input.js'), String.raw`
;(() => {
  const token = new URL(location.href).searchParams.get('session');
  let rememberedRows = null;
  window.addEventListener('error', event => {
    void chrome.runtime.sendMessage({ type: 'flytab-action-test:error', error: event.message }).catch(() => {});
  });
  chrome.runtime.onMessage.addListener((request, sender, respond) => {
    if (request?.type !== 'flytab-action-test:ui' || request.token !== token) return;
    void (async () => {
      // A normal extension tab with the same URL is an authentication adversary
      // below; it must not answer these controls intended for the action bubble.
      if (await chrome.tabs.getCurrent()) return;
      const list = document.querySelector('#tabs');
      const rows = [...document.querySelectorAll('[role=option]')];
      if (request.op === 'inspect' || request.op === 'remember') {
        if (request.op === 'remember') rememberedRows = rows;
        respond({ ok: true, token, ready: Boolean(window.flytabInput.handle) && list?.getAttribute('aria-busy') === 'false',
          width: innerWidth, documentWidth: document.documentElement.scrollWidth, listHeight: list?.getBoundingClientRect().height,
          listMaxHeight: list && getComputedStyle(list).maxHeight,
          busy: list?.getAttribute('aria-busy'), focused: document.hasFocus(), activeElement: document.activeElement?.id,
          error: document.querySelector('#error')?.textContent, selected: list?.getAttribute('aria-activedescendant'),
          rowIds: rows.map(row => Number(row.dataset.tabId)),
          sameRows: rememberedRows && rows.length === rememberedRows.length && rows.every((row, index) => row === rememberedRows[index]),
          selectedCount: rows.filter(row => row.getAttribute('aria-selected') === 'true').length });
        return;
      }
      // A release/cancel can destroy this context; acknowledge before dispatch.
      respond({ ok: true });
      if (request.op === 'key') window.dispatchEvent(new KeyboardEvent(request.event.type, { bubbles: true, ...request.event }));
      if (request.op === 'cancel') document.querySelector('#cancel').click();
      if (request.op === 'click') document.getElementById('tab-' + request.id).click();
      if (request.op === 'blur') window.dispatchEvent(new Event('blur'));
      if (request.op === 'close') window.close();
    })().catch(problem => respond({ ok: false, error: problem.message }));
    return true;
  });
})();
`);
await writeFile(join(extension, 'test-controller.html'), '<!doctype html><title>Flytab test controller</title>');
const context = await chromium.launchPersistentContext(join(scratch, 'profile'), {
  executablePath: process.env.CHROME_PATH, headless: false, viewport: null,
  args: [`--disable-extensions-except=${extension}`, `--load-extension=${extension}`]
});
const results = [];
const errors = [];
context.on('page', page => page.on('pageerror', problem => errors.push(problem.message)));
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
let worker = context.serviceWorkers()[0] || await context.waitForEvent('serviceworker');
const origin = worker.url().replace('background.js', '');
const controller = await context.newPage();
await controller.goto(origin + 'test-controller.html');
async function liveWorker() {
  for (let i = 0; i < 100; i++) {
    worker = context.serviceWorkers().find(item => item.url() === origin + 'background.js');
    try { if (worker && await worker.evaluate(() => Boolean(globalThis.flytabActionTest))) return worker; } catch {}
    await pause(20);
  }
  throw new Error('Worker did not restart');
}
async function state() { return await worker.evaluate(async () => (await chrome.storage.session.get('flytab')).flytab); }
async function drain() { await worker.evaluate(() => flytabActionTest.drain()); }
async function settle() { await pause(100); await drain(); return await state(); }
async function invoke(name = 'switch-previous') {
  await worker.evaluate(async name => { flytabActionTest.command(name); await flytabActionTest.drain(); }, name);
}
async function ui(op, extra = {}, token) {
  token ||= (await state()).session?.token;
  return await controller.evaluate(message => chrome.runtime.sendMessage(message), {
    type: 'flytab-action-test:ui', token, op, ...extra
  });
}
async function inspect() {
  for (let i = 0; i < 100; i++) {
    let result;
    try { result = await ui('inspect'); } catch {}
    if (result?.ready && result.rowIds.length) return result;
    if (result?.error) {
      throw new Error('Action popup error: ' + JSON.stringify({ result, state: await state(), contexts: await popupContexts(),
        requests: await worker.evaluate(() => flytabActionTest.requests),
        owner: await worker.evaluate(async () => { const s = (await chrome.storage.session.get('flytab')).flytab.session; return { window: await chrome.windows.get(s.sourceWindowId), last: await chrome.windows.getLastFocused(), contexts: await flytabActionTest.contexts(s), none: chrome.windows.WINDOW_ID_NONE }; }) }));
    }
    await pause(20);
  }
  throw new Error('Action popup did not become ready');
}
async function popupContexts() { return await worker.evaluate(() => chrome.runtime.getContexts({ contextTypes: ['POPUP'] })); }
async function closed() {
  for (let i = 0; i < 100; i++) {
    await drain();
    if (!(await state()).session && !(await popupContexts()).length) return;
    await pause(20);
  }
  throw new Error('Popup/session did not close');
}
async function key(key, type = 'keydown', modifiers = {}) {
  const result = await ui('key', { event: { key, type, ...modifiers } });
  assert.equal(result.ok, true, result.error);
  await settle();
}
async function windowsSurvive(ids) {
  const alive = await worker.evaluate(() => chrome.windows.getAll());
  for (const id of [ids.window1, ids.window2]) assert.ok(alive.some(window => window.id === id), 'source/destination browser windows must remain open');
}
async function captureAction(path, url) {
  const cdp = await context.browser().newBrowserCDPSession();
  let attached;
  try {
    const targets = await cdp.send('Target.getTargets');
    const target = targets.targetInfos.find(item => item.url === url);
    if (!target) return { captured: false, reason: 'Action bubble is not exposed as a CDP target' };
    attached = await cdp.send('Target.attachToTarget', { targetId: target.targetId, flatten: false });
    let receive;
    const response = new Promise(resolve => { receive = resolve; });
    cdp.on('Target.receivedMessageFromTarget', event => {
      if (event.sessionId !== attached.sessionId) return;
      const message = JSON.parse(event.message);
      if (message.id === 1) receive(message);
    });
    await cdp.send('Target.sendMessageToTarget', { sessionId: attached.sessionId,
      message: JSON.stringify({ id: 1, method: 'Page.captureScreenshot', params: { format: 'png', captureBeyondViewport: false } }) });
    const message = await Promise.race([response, pause(3000).then(() => null)]);
    if (!message?.result?.data) return { captured: false, reason: message?.error?.message || 'Screenshot target did not respond' };
    await writeFile(path, Buffer.from(message.result.data, 'base64'));
    return { captured: true, path };
  } catch (problem) {
    return { captured: false, reason: problem.message };
  } finally {
    if (attached) await cdp.send('Target.detachFromTarget', { sessionId: attached.sessionId }).catch(() => {});
    await cdp.detach();
  }
}
let layout;
let screenshot;
function pass(name) { results.push(name); console.log('PASS', name); }
try {
  assert.equal(origin, `chrome-extension://${extensionId}/`);
  assert.equal((await worker.evaluate(() => chrome.action.getUserSettings())).isOnToolbar, true);
  assert.deepEqual(manifest.permissions, ['tabs', 'storage', 'favicon']);
  assert.ok(!manifest.action.default_popup);
  pass('temporary profile pins Flytab without adding production permissions or default popup');
  await settle();
  const ids = await worker.evaluate(async () => {
    const main = (await chrome.windows.getAll({ windowTypes: ['normal'] }))[0];
    const ids = { window1: main.id };
    for (const title of ['Inbox', 'Project notes', 'An intentionally long tab title — 日本語 — must never widen the toolbar popup or push its controls away', 'Source']) {
      ids[title] = (await chrome.tabs.create({ windowId: main.id, url: 'data:text/html;charset=utf-8,' + encodeURIComponent('<title>' + title + '</title>'), active: true })).id;
      await new Promise(resolve => setTimeout(resolve, 80));
    }
    const other = await chrome.windows.create({ url: 'data:text/html;charset=utf-8,<title>Other window</title>', focused: true });
    ids.window2 = other.id;
    ids.destination = other.tabs[0].id;
    ids.source = ids.Source;
    await new Promise(resolve => setTimeout(resolve, 100));
    await chrome.windows.update(main.id, { focused: true });
    return ids;
  });
  let s = await settle();
  const baseline = [...s.order];
  assert.deepEqual(baseline.slice(0, 2), [ids.source, ids.destination]);
  const windowCount = (await worker.evaluate(() => chrome.windows.getAll())).length;
  await invoke();
  let view = await inspect();
  s = await state();
  assert.equal(s.session.kind, 'action');
  assert.equal(s.session.windowId, ids.window1);
  assert.ok(s.session.documentId, 'real POPUP context bound to session');
  assert.equal(view.focused, true);
  assert.equal(view.activeElement, 'tabs');
  assert.equal(view.width, 440);
  assert.equal(view.listHeight, 240);
  assert.equal(view.listMaxHeight, '240px');
  assert.ok(view.documentWidth <= view.width, 'long titles must not cause horizontal overflow');
  layout = { width: view.width, listHeight: view.listHeight, listMaxHeight: view.listMaxHeight, documentWidth: view.documentWidth };
  assert.equal(view.selected, `tab-${ids.destination}`);
  assert.equal((await worker.evaluate(() => chrome.windows.getAll())).length, windowCount);
  assert.equal(await worker.evaluate(() => chrome.action.getPopup({})), '');
  pass('pinned command opens a focused action bubble at previous MRU without creating a browser window');
  await ui('remember');
  await invoke();
  view = await inspect();
  s = await state();
  assert.equal(s.session.index, 1);
  assert.equal(view.selected, `tab-${s.session.ids[1]}`);
  assert.equal(view.sameRows, true);
  assert.equal(view.selectedCount, 1);
  await key('ƒ', 'keydown', { code: 'KeyF', altKey: true, shiftKey: true });
  assert.equal((await state()).session.index, 1);
  await key('F', 'keyup', { code: 'KeyF', altKey: true, shiftKey: true });
  assert.deepEqual((await state()).order, baseline);
  for (let i = 0; i < s.session.ids.length; i++) await invoke();
  assert.equal((await state()).session.index, 1);
  pass('commands cycle and wrap without rebuilding rows; held F release never commits or mutates MRU');
  await key('Escape', 'keydown', { altKey: true, shiftKey: true });
  await closed();
  assert.deepEqual((await state()).order, baseline);
  await windowsSurvive(ids);
  pass('Escape with modifiers held closes only the action bubble');
  for (const first of ['Shift', 'Alt']) {
    await invoke(); await inspect();
    await key(first, 'keyup', { altKey: first === 'Shift', shiftKey: first === 'Alt' });
    assert.ok((await state()).session);
    assert.deepEqual((await state()).order, baseline);
    await key(first === 'Shift' ? 'Alt' : 'Shift', 'keyup');
    await closed();
    s = await state();
    assert.deepEqual(s.order.slice(0, 2), [ids.destination, ids.source]);
    assert.equal(await worker.evaluate(async () => (await chrome.windows.getLastFocused()).id), ids.window2);
    await windowsSurvive(ids);
    pass(`action release commits across windows only after both modifiers are up (${first} first)`);
    await invoke('switch-next');
    assert.deepEqual((await settle()).order, baseline);
  }
  await invoke(); await inspect();
  await ui('cancel'); await closed();
  assert.deepEqual((await state()).order, baseline);
  await windowsSurvive(ids);
  pass('Cancel closes the bubble without closing its source browser window');
  await invoke(); await inspect();
  await ui('blur'); await closed();
  assert.deepEqual((await state()).order, baseline);
  await windowsSurvive(ids);
  pass('focus loss cancels an action bubble without committing');
  await invoke(); await inspect();
  const dismissedToken = (await state()).session.token;
  await ui('close');
  for (let i = 0; i < 100 && (await popupContexts()).length; i++) await pause(20);
  assert.equal((await popupContexts()).length, 0);
  await invoke(); await inspect();
  assert.notEqual((await state()).session.token, dismissedToken);
  assert.equal((await state()).session.index, 0);
  pass('dismissed action context is detected and the next command opens a fresh session');
  // Same popup URL and real token in a background tab must not authenticate as
  // the toolbar POPUP context, even though it belongs to this extension.
  const knownToken = (await state()).session.token;
  const actionUrl = (await popupContexts()).find(item => item.documentUrl.includes(knownToken)).documentUrl;
  const impostorId = await worker.evaluate(async ({ windowId, url }) => (await chrome.tabs.create({ windowId, url, active: false })).id,
    { windowId: ids.window1, url: actionUrl });
  let impostor;
  for (let i = 0; i < 100; i++) {
    impostor = context.pages().find(page => page.url() === actionUrl);
    if (impostor) break;
    await pause(20);
  }
  assert.ok(impostor, 'background extension tab available');
  const denied = await impostor.evaluate(token => chrome.runtime.sendMessage({ type: 'flytab:commit', token }), knownToken);
  assert.equal(denied.ok, false);
  assert.equal((await state()).session.token, knownToken);
  assert.deepEqual((await state()).order, baseline);
  await worker.evaluate(id => chrome.tabs.remove(id), impostorId);
  await windowsSurvive(ids);
  pass('a normal extension tab with the correct popup URL/token cannot authenticate or commit');
  await key('Escape'); await closed();
  // Force an actual worker restart while the action document remains alive.
  const cdp = await context.newCDPSession(controller);
  const versions = new Map();
  cdp.on('ServiceWorker.workerVersionUpdated', event => { for (const version of event.versions) versions.set(version.versionId, version); });
  await cdp.send('ServiceWorker.enable');
  await invoke(); await inspect();
  const coldToken = (await state()).session.token;
  const priorStarted = await worker.evaluate(() => flytabActionTest.started);
  errors.push(...await worker.evaluate(() => flytabActionTest.errors));
  let version;
  for (let i = 0; i < 100; i++) {
    version = [...versions.values()].find(item => item.scriptURL === worker.url() && item.status === 'activated' && item.runningStatus === 'running');
    if (version) break;
    await pause(20);
  }
  assert.ok(version, 'running worker version available');
  await cdp.send('ServiceWorker.stopWorker', { versionId: version.versionId });
  for (let i = 0; i < 100 && versions.get(version.versionId)?.runningStatus !== 'stopped'; i++) await pause(20);
  assert.equal(versions.get(version.versionId)?.runningStatus, 'stopped');
  // Controller-to-popup dispatch does not depend on a live worker object.
  assert.equal((await ui('key', { event: { key: 'Shift', type: 'keyup' } }, coldToken)).ok, true);
  await liveWorker();
  assert.ok(await worker.evaluate(prior => flytabActionTest.started > prior, priorStarted));
  await closed();
  assert.deepEqual((await state()).order.slice(0, 2), [ids.destination, ids.source]);
  await windowsSurvive(ids);
  pass('release from an existing authenticated action popup commits after a real worker restart');
  await invoke('switch-next');
  assert.deepEqual((await settle()).order, baseline);
  // The actual onClicked callback is exercised, while physical pointer delivery
  // remains a separate native check. Empty popup configuration is asserted too.
  assert.equal(await worker.evaluate(() => chrome.action.getPopup({})), '');
  await worker.evaluate(async () => { flytabActionTest.toolbar(); await flytabActionTest.drain(); });
  assert.equal((await state()).session, null);
  assert.deepEqual((await state()).order.slice(0, 2), [ids.destination, ids.source]);
  assert.equal((await popupContexts()).length, 0);
  await windowsSurvive(ids);
  pass('toolbar callback still toggles immediately with no popup after action use');
  await invoke('switch-next'); await settle();
  await invoke(); await inspect();
  await worker.evaluate(async () => { flytabActionTest.toolbar(); await flytabActionTest.drain(); });
  await closed();
  assert.deepEqual((await state()).order.slice(0, 2), [ids.destination, ids.source]);
  await windowsSurvive(ids);
  pass('toolbar callback toggles and closes an existing action bubble without closing its source window');
  await invoke('switch-next'); await settle();
  await invoke(); await inspect();
  const chosen = (await state()).session.ids[1];
  await ui('click', { id: chosen }); await closed();
  assert.deepEqual((await state()).order.slice(0, 2), [chosen, ids.source]);
  await windowsSurvive(ids);
  pass('click commits the chosen action row and preserves its source as MRU number two');
  if (process.env.FLYTAB_EVIDENCE) {
    await mkdir(process.env.FLYTAB_EVIDENCE, { recursive: true });
    await invoke(); await inspect();
    const captureUrl = (await popupContexts())[0].documentUrl;
    screenshot = await captureAction(join(process.env.FLYTAB_EVIDENCE, 'action-popup.png'), captureUrl);
    await key('Escape'); await closed();
  }
  errors.push(...await worker.evaluate(() => flytabActionTest.errors));
  assert.deepEqual(errors, []);
  pass('action popup reports no uncaught page errors');
  const report = { browser: context.browser().version(), version: manifest.version, passed: results.length, results, layout, screenshot,
    methodology: 'Real production extension in a disposable pinned profile. Commands invoke registered callbacks; key releases are injected DOM events, not physical held-key evidence. Source/destination windows checked after commits and cancellation.', errors };
  console.log(JSON.stringify(report, null, 2));
  if (process.env.FLYTAB_EVIDENCE) {
    await mkdir(process.env.FLYTAB_EVIDENCE, { recursive: true });
    await writeFile(join(process.env.FLYTAB_EVIDENCE, 'action-results.json'), JSON.stringify(report, null, 2) + '\n');
  }
} finally {
  await context.close();
  await rm(scratch, { recursive: true, force: true });
}
