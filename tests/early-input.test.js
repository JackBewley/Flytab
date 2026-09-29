import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

function capture(send = async () => ({ ok: true }), commands = [{ name: 'switch-next', shortcut: '⌥F' }, { name: 'switch-previous', shortcut: '⌥⇧F' }]) {
  const handlers = {};
  const ports = [];
  const timers = new Map();
  const document = { visibilityState: 'visible', hasFocus: () => true, documentElement: { dataset: {} } };
  const connect = options => {
    const listeners = {};
    const port = { name: options.name, messages: [], disconnected: false,
      onMessage: { addListener: fn => { listeners.message = fn; } },
      onDisconnect: { addListener: fn => { listeners.disconnect = fn; } },
      postMessage: message => port.messages.push(message),
      disconnect: () => { port.disconnected = true; listeners.disconnect?.(); },
      receive: message => listeners.message?.(message), lose: () => listeners.disconnect?.() };
    ports.push(port);
    return port;
  };
  const window = { addEventListener: (type, fn) => { handlers[type] = fn; } };
  vm.runInNewContext(readFileSync(new URL('../early-input.js', import.meta.url), 'utf8'), {
    window, document, performance: { now: () => 1 }, URL,
    setInterval: (fn, ms) => { const id = Symbol(); timers.set(id, { fn, ms }); return id; },
    clearInterval: id => { timers.delete(id); },
    location: { href: 'chrome-extension://flytab/popup.html?session=test-token' },
    chrome: { commands: { getAll: async () => commands }, runtime: { connect, sendMessage: request => {
      assert.equal(typeof handlers.keyup, 'function', 'capture must be installed before requesting data');
      return send(request);
    } } }
  });
  return { window, handlers, ports, timers, document };
}

test('Enter received before the list is ready is buffered', () => {
  const { window, handlers } = capture();
  handlers.keydown({ key: 'Enter', preventDefault() {} });
  assert.equal(window.flytabInput.pending.length, 1);
  assert.equal(window.flytabInput.pending[0].key, 'Enter');
});

test('release events retain each modifier state before the UI is ready', () => {
  const { window, handlers } = capture();
  handlers.keyup({ key: 'F', code: 'KeyF', altKey: true, shiftKey: true });
  handlers.keyup({ key: 'Alt', shiftKey: true });
  handlers.keyup({ key: 'Shift' });
  const events = window.flytabInput.pending;
  assert.equal(events.length, 3);
  assert.equal(events[0].type, 'keyup');
  assert.equal(events[0].key, 'f');
  assert.equal(events[0].altKey, true);
  assert.equal(events[0].shiftKey, true);
  assert.equal(events[1].altKey, false);
  assert.equal(events[1].shiftKey, true);
  assert.equal(events[2].altKey, false);
  assert.equal(events[2].shiftKey, false);
});

test('native buttons keep their Enter behavior', () => {
  const { window, handlers } = capture();
  let prevented = false;
  handlers.keydown({ key: 'Enter', target: { closest: () => ({}) }, preventDefault: () => { prevented = true; } });
  assert.equal(prevented, false);
  assert.equal(window.flytabInput.pending.length, 0);
});

test('composing text does not trigger list actions', () => {
  const { window, handlers } = capture();
  handlers.keydown({ key: 'Enter', isComposing: true });
  assert.equal(window.flytabInput.pending.length, 0);
});

test('modified navigation is left to remapped browser commands', () => {
  const { window, handlers } = capture();
  handlers.keydown({ key: 'ArrowDown', altKey: true, preventDefault() { throw new Error('Accelerator intercepted'); } });
  assert.equal(window.flytabInput.pending.length, 0);
});


test('plain F and Shift+F are buffered as the same navigation key, including repeats', () => {
  const { window, handlers } = capture();
  const presses = [{ key: 'f', code: 'KeyF' }, { key: 'f', repeat: true }, { key: 'F', code: 'KeyF', shiftKey: true }];
  for (const press of presses) handlers.keydown({ ...press, preventDefault() {} });
  const pending = window.flytabInput.pending;
  assert.equal(pending.length, 3);
  assert.ok(pending.every(event => event.key === 'f'));
  assert.equal(pending[0].shiftKey, false);
  assert.equal(pending[1].repeat, true);
  assert.equal(pending[2].shiftKey, true);
});

test('unconfigured modified chords are left to Chrome before shortcut bindings arrive', () => {
  const { window, handlers } = capture();
  for (const modifiers of [{ altKey: true }, { altKey: true, shiftKey: true }, { ctrlKey: true }, { metaKey: true }]) {
    handlers.keydown({ key: 'ƒ', code: 'KeyF', ...modifiers, preventDefault() { throw new Error('Accelerator intercepted'); } });
  }
  assert.equal(window.flytabInput.pending.length, 0);
});


test('Escape works while Option and Shift are still held', () => {
  const { window, handlers } = capture();
  handlers.keydown({ key: 'Escape', altKey: true, shiftKey: true, preventDefault() {} });
  assert.equal(window.flytabInput.pending[0].key, 'Escape');
});

test('unrelated key releases cannot commit a fallback list', () => {
  const { window, handlers } = capture();
  for (const key of ['ArrowUp', 'Enter', 'Escape', 'a']) handlers.keyup({ key });
  assert.equal(window.flytabInput.pending.length, 0);
});


test('initial state request begins in the early script after input capture is installed', async () => {
  const requests = [];
  const { window } = capture(async request => {
    requests.push(request);
    return { ok: true, snapshot: { token: request.token } };
  });
  assert.equal(requests.length, 1);
  assert.equal(requests[0].type, 'flytab:get');
  assert.equal(requests[0].token, 'test-token');
  assert.equal((await window.flytabInput.ready).snapshot.token, 'test-token');
});

test('early state request failures are retained for the UI without an unhandled rejection', async () => {
  const { window } = capture(async () => { throw new Error('Worker unavailable'); });
  const response = await window.flytabInput.ready;
  assert.equal(response.ok, false);
  assert.equal(response.error, 'Worker unavailable');
});


test('actual window blur is retained before UI readiness and forwarded afterward', () => {
  const { window, handlers } = capture();
  assert.equal(window.flytabInput.blurred, false);
  handlers.blur();
  assert.equal(window.flytabInput.blurred, true);
  const events = [];
  window.flytabInput.handle = event => events.push(event);
  handlers.blur();
  assert.equal(events.length, 1);
  assert.equal(events[0].type, 'blur');
});


test('configured macOS chords deliver translated physical F exactly once through the popup', async () => {
  const h = capture();
  await h.window.flytabInput.shortcutsReady;
  await new Promise(resolve => setImmediate(resolve));
  const port = h.ports[0];
  assert.equal(port.name, 'flytab-input:test-token');
  port.receive({ type: 'flytab:input-ready' });
  assert.equal(h.window.flytabInput.ownsCommands, true);
  let prevented = 0;
  h.handlers.keydown({ key: 'Ï', code: 'KeyF', altKey: true, shiftKey: true, preventDefault() { prevented++; } });
  h.handlers.keyup({ key: 'Ï', code: 'KeyF', altKey: true, shiftKey: true });
  h.handlers.keyup({ key: 'Shift', altKey: true });
  h.handlers.keyup({ key: 'Alt' });
  const pending = h.window.flytabInput.pending;
  assert.equal(prevented, 1);
  assert.deepEqual(Array.from(pending, event => event.type), ['keydown', 'keyup', 'keyup', 'keyup']);
  assert.equal(pending[0].key, 'f');
  assert.equal(pending[1].altKey && pending[1].shiftKey, true);
  assert.equal(pending[2].altKey, true);
  assert.equal(pending[3].altKey || pending[3].shiftKey, false);
});

test('remapped chords cycle while unrelated browser chords stay untouched', async () => {
  const h = capture(undefined, [{ name: 'switch-previous', shortcut: 'Ctrl+Shift+K' }]);
  await h.window.flytabInput.shortcutsReady;
  let prevented = 0;
  h.handlers.keydown({ key: 'K', code: 'KeyK', ctrlKey: true, shiftKey: true, preventDefault() { prevented++; } });
  h.handlers.keydown({ key: 'f', code: 'KeyF', metaKey: true, preventDefault() { throw new Error('Unrelated browser shortcut intercepted'); } });
  assert.equal(prevented, 1);
  assert.equal(h.window.flytabInput.pending.length, 1);
  assert.equal(h.window.flytabInput.pending[0].key, 'f');
});

test('ownership heartbeat runs only for the visible focused picker and stops on pagehide', async () => {
  const h = capture();
  await h.window.flytabInput.shortcutsReady;
  await new Promise(resolve => setImmediate(resolve));
  const port = h.ports[0];
  assert.equal(h.timers.size, 0);
  port.receive({ type: 'flytab:input-ready' });
  const timer = [...h.timers.values()][0];
  assert.equal(timer.ms, 20000);
  timer.fn();
  assert.equal(port.messages.length, 1);
  h.document.visibilityState = 'hidden';
  timer.fn();
  assert.equal(port.messages.length, 1);
  h.handlers.pagehide();
  assert.equal(h.timers.size, 0);
  assert.equal(port.disconnected, true);
  assert.equal(h.window.flytabInput.disconnected, false, 'intentional closing is not a worker failure');
});

test('unexpected worker disconnection cancels ownership and is retained before UI loading', async () => {
  const h = capture();
  await h.window.flytabInput.shortcutsReady;
  await new Promise(resolve => setImmediate(resolve));
  const port = h.ports[0];
  port.receive({ type: 'flytab:input-ready' });
  port.lose();
  assert.equal(h.window.flytabInput.disconnected, true);
  assert.equal(h.window.flytabInput.ownsCommands, false);
  assert.equal(h.timers.size, 0);
});

test('reclaim after a failed commit replaces ownership without treating the old port as a failure', async () => {
  const h = capture();
  await h.window.flytabInput.shortcutsReady;
  await new Promise(resolve => setImmediate(resolve));
  const oldPort = h.ports[0];
  oldPort.receive({ type: 'flytab:input-ready' });
  await h.window.flytabInput.reclaim();
  assert.equal(oldPort.disconnected, true);
  assert.equal(h.ports.length, 2);
  assert.equal(h.window.flytabInput.disconnected, false);
  h.ports[1].receive({ type: 'flytab:input-ready' });
  assert.equal(h.window.flytabInput.ownsCommands, true);
  assert.equal(h.timers.size, 1);
});

test('Home/End are buffered without intercepting unrelated modified chords or their releases', async () => {
  const {window,handlers} = capture();
  await window.flytabInput.shortcutsReady;
  for (const key of ['Home','End']) {
    handlers.keydown({key,preventDefault(){}});
    handlers.keyup({key});
    for (const modifiers of [{altKey:true},{ctrlKey:true},{metaKey:true},{shiftKey:true}]) {
      handlers.keydown({key,...modifiers,preventDefault(){throw Error('Modified navigation intercepted');}});
    }
  }
  assert.deepEqual(Array.from(window.flytabInput.pending,event=>event.key),['Home','End']);
});


test('plain Home/End releases never commit when their keys are also remapped shortcuts', async () => {
  for (const key of ['Home','End']) {
    const {window,handlers}=capture(undefined,[{name:'switch-previous',shortcut:'Alt+'+key}]);
    await window.flytabInput.shortcutsReady;
    handlers.keydown({key,code:key,preventDefault(){}});
    handlers.keyup({key,code:key});
    assert.equal(window.flytabInput.pending.length,1);
    assert.equal(window.flytabInput.pending[0].key,key);
    handlers.keydown({key,code:key,altKey:true,preventDefault(){}});
    handlers.keyup({key,code:key});
    assert.equal(window.flytabInput.pending[1].key,'f');
    assert.equal(window.flytabInput.pending[2].type,'keyup','configured chord retains release recovery');
  }
});
