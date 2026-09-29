import test from 'node:test';
import assert from 'node:assert/strict';
import { eligible, promote, commitOrder, reconstruct, step, pruneSession } from '../core.js';

test('startup orders lastAccessed, then puts the focused active tab first', () => {
  assert.deepEqual(reconstruct([
    { id: 1, lastAccessed: 10, active: true, windowId: 1 },
    { id: 2, lastAccessed: 30, active: true, windowId: 2 },
    { id: 3, lastAccessed: 20, windowId: 1 }
  ], 1), [1, 2, 3]);
});

test('navigation never mutates MRU and wraps in both directions', () => {
  const order = [1, 2, 3, 4];
  const session = { ids: [2, 3, 4, 1], index: 0 };
  assert.equal(step(session, 1).index, 1);
  assert.equal(step(session, -1).index, 3);
  assert.deepEqual(order, [1, 2, 3, 4]);
  assert.equal(session.index, 0);
});

test('commit makes destination first, source second; toggle reverses them', () => {
  const committed = commitOrder([1, 2, 3, 4], 4, 1);
  assert.deepEqual(committed, [4, 1, 2, 3]);
  assert.deepEqual(commitOrder(committed, 1, 4), [1, 4, 2, 3]);
  assert.deepEqual(commitOrder([1, 2], 1, 1), [1, 2]);
});

test('closing tabs preserves selection when possible and clamps otherwise', () => {
  assert.deepEqual(pruneSession({ ids: [2, 3, 4, 1], index: 2 }, new Set([1, 3, 4])), { ids: [3, 4, 1], index: 1 });
  assert.deepEqual(pruneSession({ ids: [2, 3], index: 1 }, new Set()), { ids: [], index: 0 });
});

test('incognito and Flytab UI are ineligible', () => {
  assert.equal(eligible({ id: 1, incognito: true }, 'chrome-extension://fly/'), false);
  assert.equal(eligible({ id: 2, url: 'chrome-extension://fly/popup.html' }, 'chrome-extension://fly/'), false);
  assert.equal(eligible({ id: 3, url: 'chrome://settings/' }, 'chrome-extension://fly/'), true);
});

test('promoting an existing tab deduplicates visits', () => {
  assert.deepEqual(promote([2, 1, 3], 1), [1, 2, 3]);
});
