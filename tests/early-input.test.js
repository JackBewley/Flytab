import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

function capture(send = async () => ({ ok: true })) {
  const handlers = {};
  const window = { addEventListener: (type, fn) => { handlers[type] = fn; } };
  vm.runInNewContext(readFileSync(new URL('../early-input.js', import.meta.url), 'utf8'), {
    window, performance: { now: () => 1 }, URL,
    location: { href: 'chrome-extension://flytab/popup.html?session=test-token' },
    chrome: { runtime: { sendMessage: request => {
      assert.equal(typeof handlers.keyup, 'function', 'capture must be installed before requesting data');
      return send(request);
    } } }
  });
  return { window, handlers };
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

test('Cancel button keeps native Enter behavior', () => {
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

test('modified F cannot also navigate through the popup input path', () => {
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
