import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

function capture() {
  const handlers = {};
  const window = { addEventListener: (type, fn) => { handlers[type] = fn; } };
  vm.runInNewContext(readFileSync(new URL('../early-input.js', import.meta.url), 'utf8'), {
    window, performance: { now: () => 1 }
  });
  return { window, handlers };
}

test('release received before the UI module is ready is buffered', () => {
  const { window, handlers } = capture();
  handlers.keyup({ key: 'Alt', code: 'AltLeft', altKey: false });
  assert.equal(window.flytabInput.pending.length, 1);
  assert.equal(window.flytabInput.pending[0].key, 'Alt');
  assert.equal(window.flytabInput.pending[0].type, 'keyup');
});

test('no event means no inferred release or automatic commit', () => {
  const { window } = capture();
  assert.equal(window.flytabInput.pending.length, 0);
});

test('Cancel button keeps native Enter behavior', () => {
  const { window, handlers } = capture();
  let prevented = false;
  handlers.keydown({ key: 'Enter', target: { closest: () => ({}) }, preventDefault: () => { prevented = true; } });
  assert.equal(prevented, false);
  assert.equal(window.flytabInput.pending.length, 0);
});

test('composing text does not trigger switcher commands', () => {
  const { window, handlers } = capture();
  handlers.keydown({ key: 'Enter', isComposing: true });
  assert.equal(window.flytabInput.pending.length, 0);
});
