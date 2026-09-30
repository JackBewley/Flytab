import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
const source = readFileSync(new URL('../theme.js', import.meta.url), 'utf8').replace('export async function', 'async function');
function harness() {
  const calls = [], media = { matches: false };
  const context = { document: { hidden: false }, matchMedia: () => media,
    chrome: { action: { async setIcon(args) { calls.push(args); if (context.fail) throw Error('unavailable'); if (context.pending) await context.pending; } } } };
  vm.runInNewContext(source, context);
  return { context, calls, media };
}
test('icon work is explicit, skips hidden pages, and selects the current appearance', async () => {
  const h = harness();
  assert.equal(h.calls.length, 0);
  h.context.document.hidden = true;
  await h.context.refreshIcon(); assert.equal(h.calls.length, 0);
  h.context.document.hidden = false;
  await h.context.refreshIcon(); assert.equal(h.calls.at(-1).path[16], 'icons/icon-16.png');
  h.media.matches = true;
  await h.context.refreshIcon(); assert.equal(h.calls.at(-1).path[32], 'icons/icon-dark-32.png');
});
test('concurrent refreshes coalesce; later opens reapply instead of trusting another document’s icon', async () => {
  const h = harness(); let release;
  h.context.pending = new Promise(resolve => { release = resolve; });
  const first = h.context.refreshIcon(); await h.context.refreshIcon();
  assert.equal(h.calls.length, 1);
  release(); await first; h.context.pending = null;
  await h.context.refreshIcon(); assert.equal(h.calls.length, 2);
});
test('failed icon application is cosmetic and a later refresh retries', async () => {
  const h = harness(); h.context.fail = true;
  await h.context.refreshIcon(); h.context.fail = false;
  await h.context.refreshIcon(); assert.equal(h.calls.length, 2);
});
