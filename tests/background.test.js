import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import vm from 'node:vm';
import * as core from '../core.js';

const tick = () => new Promise(resolve => setImmediate(resolve));
function deferred() {
  let resolve, reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}
function harness() {
  const origin = 'chrome-extension://flytab/';
  const otherStorage = {};
  const calls = [];
  const listeners = {};
  const event = name => ({
    addListener(fn) { listeners[name] = fn; },
    removeListener(fn) { if (listeners[name] === fn) delete listeners[name]; },
    hasListener(fn) { return listeners[name] === fn; }
  });
  let state = { version: 1, order: [1, 2, 3], session: null };
  let tabs = [
    { id: 1, windowId: 10, active: true, title: 'Source', url: 'https://one.example' },
    { id: 2, windowId: 10, active: false, title: 'Previous', url: 'https://two.example' },
    { id: 3, windowId: 11, active: true, title: 'Other window', url: 'https://three.example' }
  ];
  const windows = new Map([
    [10, { id: 10, focused: true, left: 0, top: 0, width: 1200, height: 900 }],
    [11, { id: 11, focused: false }]
  ]);
  const gates = {};
  const record = (name, fn) => async (...args) => { calls.push({ name, args }); return await fn(...args); };
  const chrome = {
    storage: { session: {
      get: record('storage.get', async () => ({ ...otherStorage, flytab: structuredClone(state) })),
      set: record('storage.set', async value => {
        if (gates.save) await gates.save.promise;
        if ('flytab' in value) state = structuredClone(value.flytab);
        else Object.assign(otherStorage, value);
      })
    } },
    tabs: {
      query: record('tabs.query', async () => gates.query ? await gates.query.promise : structuredClone(tabs)),
      get: record('tabs.get', async id => structuredClone(tabs.find(tab => tab.id === id))),
      update: record('tabs.update', async (id, props) => Object.assign(tabs.find(tab => tab.id === id), props)),
      onActivated: event('activated'), onCreated: event('created'), onRemoved: event('removed'), onReplaced: event('replaced')
    },
    windows: {
      WINDOW_ID_NONE: -1,
      getLastFocused: record('windows.getLastFocused', async () => {
        const parent = [...windows.values()].find(window => window.focused);
        return { ...parent, tabs: structuredClone(tabs.filter(tab => tab.windowId === parent.id)) };
      }),
      get: record('windows.get', async id => {
        if (!windows.has(id)) throw new Error('Window closed');
        return structuredClone(windows.get(id));
      }),
      create: record('windows.create', async () => {
        if (gates.create) await gates.create.promise;
        const popup = { id: 12, focused: true };
        for (const window of windows.values()) window.focused = false;
        windows.set(12, popup);
        return popup;
      }),
      remove: record('windows.remove', async id => { windows.delete(id); }),
      update: record('windows.update', async (id, props) => Object.assign(windows.get(id), props)),
      onFocusChanged: event('focus'), onRemoved: event('windowRemoved')
    },
    runtime: {
      id: 'flytab', getURL: path => origin + path,
      sendMessage: record('runtime.sendMessage', async () => {}),
      onConnect: event('connect'), onMessage: event('message'), onInstalled: event('installed'), onStartup: event('startup')
    },
    action: {
      setPopup: record('action.setPopup', async () => {}),
      setBadgeText: record('action.setBadgeText', async () => {}),
      setTitle: record('action.setTitle', async () => {}), onClicked: event('click')
    },
    commands: { onCommand: event('command') }
  };
  const context = { ...core, chrome, URL, crypto: { randomUUID }, console: { error() {} } };
  const code = readFileSync(new URL('../background.js', import.meta.url), 'utf8').replace(/^import .*?;\n/, '');
  vm.runInNewContext(code + '\nglobalThis.controller = { command, enqueue, read, message };', context);
  return { calls, gates, windows, listeners, controller: context.controller,
    get state() { return state; }, set state(value) { state = value; },
    get tabs() { return tabs; }, set tabs(value) { tabs = value; },
    sender(token) { return { id: 'flytab', url: origin + 'popup.html?session=' + token, tab: { windowId: 12 } }; }
  };
}

test('opens before tab scan/storage writes, but queues popup state until durable window binding', async () => {
  const h = harness();
  h.gates.query = deferred();
  h.gates.save = deferred();
  const opening = h.controller.enqueue(() => h.controller.command('switch-previous'));
  await tick();
  const names = h.calls.map(call => call.name);
  assert.ok(names.indexOf('windows.create') < names.indexOf('tabs.query'));
  assert.equal(names.filter(name => name === 'storage.set').length, 0);
  const url = h.calls.find(call => call.name === 'windows.create').args[0].url;
  const token = new URL(url).searchParams.get('session');
  let responded = false;
  const request = h.controller.enqueue(async () => {
    const response = await h.controller.message({ type: 'flytab:get', token }, h.sender(token));
    responded = true;
    return response;
  });
  h.gates.query.resolve(h.tabs);
  await tick();
  assert.equal(responded, false);
  assert.equal(h.state.session, null);
  h.gates.save.resolve();
  await opening;
  const response = await request;
  assert.equal(response.ok, true);
  assert.equal(response.snapshot.token, token);
  assert.equal(h.state.session.windowId, 12);
  assert.deepEqual(Array.from(h.state.session.ids), [1, 2, 3]);
  assert.equal(h.state.session.index, 1);
});

test('unchanged reads are write-free; pruning persists and advances the snapshot revision', async () => {
  const h = harness();
  await h.controller.read();
  assert.equal(h.calls.filter(call => call.name === 'storage.set').length, 0);
  h.state.session = { token: 'active', windowId: 12, ids: [2, 3, 1], index: 0, revision: 4 };
  h.tabs = h.tabs.filter(tab => tab.id !== 2);
  await h.controller.read();
  assert.deepEqual(Array.from(h.state.order), [1, 3]);
  assert.deepEqual(Array.from(h.state.session.ids), [3, 1]);
  assert.equal(h.state.session.revision, 5);
  assert.equal(h.calls.filter(call => call.name === 'storage.set').length, 1);
});

test('failed history scan closes a window even when native creation finishes later', async () => {
  const h = harness();
  h.gates.query = deferred();
  h.gates.create = deferred();
  const opening = h.controller.command('switch-previous');
  const rejected = assert.rejects(opening, /History unavailable/);
  await tick();
  h.gates.query.reject(new Error('History unavailable'));
  await tick();
  assert.equal(h.calls.filter(call => call.name === 'windows.remove').length, 0);
  h.gates.create.resolve();
  await rejected;
  assert.equal(h.windows.has(12), false);
  assert.equal(h.state.session, null);
});

test('a source closed during opening is not reinserted and the new window is cleaned up', async () => {
  const h = harness();
  h.gates.query = deferred();
  const opening = h.controller.command('switch-previous');
  const rejected = assert.rejects(opening, /source tab closed/);
  await tick();
  h.gates.query.resolve(h.tabs.filter(tab => tab.id !== 1));
  await rejected;
  assert.equal(h.windows.has(12), false);
  assert.equal(h.state.session, null);
});

test('preview move uses one live tab scan and returns one snapshot without a duplicate broadcast', async () => {
  const h = harness();
  await h.controller.command('switch-previous');
  h.calls.length = 0;
  const token = h.state.session.token;
  const response = await h.controller.message({ type: 'flytab:move', token, delta: 1 }, h.sender(token));
  assert.equal(response.snapshot.index, 2);
  assert.equal(h.calls.filter(call => call.name === 'tabs.query').length, 1);
  assert.equal(h.calls.filter(call => call.name === 'runtime.sendMessage').length, 0);
  assert.deepEqual(Array.from(h.state.order), [1, 2, 3]);
});

test('Flytab popup creation never queues a visit or background-tab reconciliation', () => {
  const h = harness();
  h.listeners.created({ id: 100, windowId: 12, active: true, url: 'chrome-extension://flytab/popup.html' });
  assert.equal(h.calls.length, 0);
});


test('tab lifecycle events update IDs without full-browser scans or redundant writes', async () => {
  const h = harness();
  h.listeners.created({ id: 4, windowId: 10, active: false, url: 'https://four.example' });
  await h.controller.enqueue(async () => {});
  assert.equal(h.calls.filter(call => call.name === 'tabs.query').length, 0);
  assert.equal(h.calls.filter(call => call.name === 'storage.set').length, 0);
  h.listeners.removed(2);
  await h.controller.enqueue(async () => {});
  assert.deepEqual(Array.from(h.state.order), [1, 3]);
  assert.equal(h.calls.filter(call => call.name === 'tabs.query').length, 0);
  assert.equal(h.calls.filter(call => call.name === 'storage.set').length, 1);
  h.calls.length = 0;
  h.listeners.removed(100); // The extension window is never in MRU.
  await h.controller.enqueue(async () => {});
  assert.equal(h.calls.filter(call => call.name === 'tabs.query').length, 0);
  assert.equal(h.calls.filter(call => call.name === 'storage.set').length, 0);
});


test('simultaneous closed tabs cannot shift the visible selection away from the committed tab', async () => {
  const h = harness();
  h.state = { version: 1, order: [1, 2, 3, 4], session: {
    token: 'closing', windowId: 12, sourceId: 4, sourceWindowId: 10,
    ids: [1, 2, 3, 4], index: 2, revision: 0
  } };
  h.tabs = [h.tabs[2], { id: 4, windowId: 10, active: true, title: 'Fourth', url: 'https://four.example' }];
  h.listeners.removed(1); // Both 1 and 2 are already closed; only 1's event has been processed.
  await h.controller.enqueue(async () => {});
  const view = h.calls.find(call => call.name === 'runtime.sendMessage').args[0].snapshot;
  assert.deepEqual(Array.from(view.items, item => item.id), [3, 4]);
  assert.equal(view.items[view.index].id, 3);
  const reconciled = await h.controller.read();
  assert.equal(reconciled.state.session.ids[reconciled.state.session.index], 3);
});

test('native popup input ownership uses the same exact sender binding and restores on window closure', async () => {
  const h = harness(); const commandHandler = h.listeners.command;
  await h.controller.command('switch-previous');
  const token = h.state.session.token;
  let onDisconnect;
  const messages = [];
  const port = {
    name:'flytab-input:' + token, sender:h.sender(token),
    onDisconnect:{addListener(fn) {onDisconnect = fn;}},
    onMessage:{addListener() {}}, postMessage(message) {messages.push(message);}, disconnect() {}
  };
  h.listeners.connect(port); await h.controller.enqueue(async () => {});
  assert.equal(h.listeners.command,undefined);
  assert.equal(messages[0]?.type,'flytab:input-ready');
  h.listeners.windowRemoved(12); await h.controller.enqueue(async () => {});
  assert.equal(h.listeners.command,commandHandler);
  assert.equal(h.state.session,null);
  onDisconnect(); await h.controller.enqueue(async () => {});
  assert.equal(h.listeners.command,commandHandler);
});

test('a single-tab switcher keeps the current tab selected in its only row', async () => {
  const h = harness();
  h.tabs = h.tabs.filter(tab => tab.id === 1);
  await h.controller.command('switch-previous');
  assert.deepEqual(Array.from(h.state.session.ids), [1]);
  assert.equal(h.state.session.index, 0);
});
