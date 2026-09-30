// Focused refresh-on-open checks with real Chrome APIs in a disposable profile.
import assert from 'node:assert/strict';
import {mkdtemp, cp, rm, mkdir, appendFile, writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {resolve, join} from 'node:path';
import {chromium} from 'playwright-core';
const root = resolve(import.meta.dirname, '..');
const evidence = resolve(process.env.FLYTAB_EVIDENCE || 'test-evidence/0.6.5/theme.json');
const scratch = await mkdtemp(join(tmpdir(), 'flytab-theme-'));
const extension = join(scratch, 'extension');
await mkdir(extension);
for (const name of ['manifest.json','background.js','core.js','early-input.js','popup.html','popup.js','popup.css','tab.svg','options.html','options.css','options.js','theme.js','icons']) {
  await cp(join(root, name), join(extension, name), {recursive: true});
}
// Observe the production command and successful real icon applications only.
await appendFile(join(extension, 'background.js'), '\nglobalThis.themeTest = {toggle: () => onCommand("switch-next"), drain: () => enqueue(async () => {})};\n');
const context = await chromium.launchPersistentContext(join(scratch, 'profile'), {
  headless: true, colorScheme: 'dark', executablePath: process.env.CHROME_PATH || chromium.executablePath(),
  args: [`--disable-extensions-except=${extension}`, `--load-extension=${extension}`]
});
const results = [], errors = [];
const pass = name => { results.push(name); console.log('PASS', name); };
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
try {
  const worker = context.serviceWorkers()[0] || await context.waitForEvent('serviceworker');
  const origin = worker.url().replace('background.js', '');
  await worker.evaluate(() => themeTest.drain());
  assert.deepEqual(await worker.evaluate(() => chrome.runtime.getManifest().permissions), ['tabs','storage','favicon']);
  assert.equal((await worker.evaluate(() => chrome.runtime.getContexts({contextTypes:['OFFSCREEN_DOCUMENT']}))).length, 0);
  pass('installation needs no offscreen permission or document');
  const page = await context.newPage();
  page.on('pageerror', error => errors.push(error.message));
  await page.addInitScript(() => {
    window.iconCalls = [];
    const setIcon = chrome.action.setIcon.bind(chrome.action);
    chrome.action.setIcon = async args => {
      if (window.rejectIcon) throw Error('Test: icon unavailable');
      await setIcon(args);
      window.iconCalls.push(args.path);
    };
  });
  await page.goto(origin + 'options.html');
  await page.waitForFunction(() => iconCalls.at(-1)?.[16] === 'icons/icon-dark-16.png');
  assert.ok(await page.locator('#quick-shortcut').textContent());
  pass('opening settings applies the real dark icon');
  await page.emulateMedia({colorScheme: 'light'});
  const count = await page.evaluate(() => iconCalls.length);
  await pause(5500);
  assert.equal(await page.evaluate(() => iconCalls.length), count);
  pass('an appearance change alone starts no polling or icon update');
  await page.evaluate(() => window.dispatchEvent(new Event('focus')));
  await page.waitForFunction(() => iconCalls.at(-1)?.[16] === 'icons/icon-16.png');
  pass('returning to settings refreshes the real light icon');
  await page.emulateMedia({colorScheme: 'dark'});
  await page.evaluate(() => { window.rejectIcon = true; window.dispatchEvent(new Event('focus')); });
  await pause(100);
  assert.equal(await page.locator('#shortcut-error').isVisible(), false);
  await page.evaluate(() => { window.rejectIcon = false; window.dispatchEvent(new Event('focus')); });
  await page.waitForFunction(() => iconCalls.at(-1)?.[16] === 'icons/icon-dark-16.png');
  pass('icon failure does not break settings and a later opening retries');
  const other = await context.newPage();
  await other.goto('about:blank#other');
  await worker.evaluate(() => themeTest.drain());
  const before = await page.evaluate(() => iconCalls.length);
  await worker.evaluate(async () => { themeTest.toggle(); await themeTest.drain(); });
  assert.equal(await page.evaluate(() => iconCalls.length), before);
  pass('quick toggle performs no page appearance refresh');
  await page.close();
  const cdp = await context.newCDPSession(other), versions = new Map();
  cdp.on('ServiceWorker.workerVersionUpdated', event => { for (const v of event.versions) versions.set(v.versionId, v); });
  await cdp.send('ServiceWorker.enable');
  await pause(100);
  const version = [...versions.values()].find(v => v.scriptURL === origin + 'background.js' && v.runningStatus === 'running');
  assert.ok(version);
  await cdp.send('ServiceWorker.stopWorker', {versionId: version.versionId});
  await cdp.detach();
  await pause(6000);
  const browser = await context.browser().newBrowserCDPSession();
  const targets = (await browser.send('Target.getTargets')).targetInfos;
  assert.equal(targets.some(target => target.url.startsWith(origin)), false);
  pass('after UI closure and worker stop, no extension document or watcher remains');
  assert.deepEqual(errors, []);
  await mkdir(resolve(evidence, '..'), {recursive:true});
  await writeFile(evidence, JSON.stringify({browser:context.browser().version(), results, errors}, null, 2));
} finally { await context.close(); await rm(scratch, {recursive:true, force:true}); }
