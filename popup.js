const token = new URL(location.href).searchParams.get('session');
const list = document.querySelector('#tabs');
const error = document.querySelector('#error');
const hint = document.querySelector('#hint');
const empty = document.querySelector('#empty');
const position = document.querySelector('#position');
const early = window.flytabInput;
const rows = new Map();
let current = null;
let selectedRow = null;
let finished = false;
let inputTail = Promise.resolve();
let wheelTotal = 0;
let wheelAt = 0;

function receive(response) {
  if (!response?.ok) throw new Error(response?.error || 'Flytab lost its connection. Close this window and try again.');
  if (response.snapshot && !finished) render(response.snapshot);
  return response;
}

async function request(type, extra = {}) {
  return receive(await chrome.runtime.sendMessage({ type: `flytab:${type}`, token, ...extra }));
}

// The synchronous input listener already started this request before CSS/UI
// loading. Selection actions wait for it, but focus and cancellation do not.
const ready = early.ready.then(receive);
void ready.catch(problem => { if (!finished) showError(problem); });

function showError(problem) {
  error.textContent = problem.message;
  error.hidden = false;
  list.setAttribute('aria-busy', 'false');
  hint.textContent = 'Choose another tab, or press Esc to close.';
}

function sequence(action) {
  const previous = inputTail;
  inputTail = (async () => {
    try { await previous; } catch { /* recover */ }
    if (finished) return;
    try {
      await ready;
      if (!finished) await action();
    } catch (problem) {
      if (!finished) showError(problem);
    }
  })();
}

function createRow(item, index, size) {
  const row = document.createElement('div');
  row.className = 'tab';
  row.id = `tab-${item.id}`;
  row.dataset.tabId = item.id;
  row.setAttribute('role', 'option');
  row.setAttribute('aria-selected', 'false');
  row.setAttribute('aria-posinset', String(index + 1));
  row.setAttribute('aria-setsize', String(size));
  row.title = item.title;
  const icon = document.createElement('img');
  icon.alt = '';
  icon.width = 20;
  icon.height = 20;
  icon.decoding = 'async';
  // Only the visible five rows need eager favicon work. The browser loads later
  // rows as scrolling brings them into view; no external URL is ever used.
  icon.loading = index < 5 ? 'eager' : 'lazy';
  icon.src = item.icon;
  const title = document.createElement('span');
  title.className = 'title';
  title.textContent = item.title;
  row.append(icon, title);
  if (item.current || item.otherWindow) {
    const detail = document.createElement('span');
    detail.className = 'detail';
    detail.textContent = item.current ? 'Current' : 'Other window';
    row.append(detail);
  }
  const mark = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  mark.setAttribute('viewBox', '0 0 12 12');
  mark.setAttribute('class', 'choice');
  mark.setAttribute('aria-hidden', 'true');
  const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  path.setAttribute('d', 'm3 2 4 4-4 4');
  mark.append(path);
  row.append(mark);
  return row;
}

function sameItems(items, previous) {
  return previous && items.length === previous.length && items.every((item, index) => {
    const before = previous[index];
    return item.id === before.id && item.title === before.title && item.icon === before.icon &&
      item.current === before.current && item.otherWindow === before.otherWindow;
  });
}

function render(snapshot) {
  if (snapshot.token !== token || (current && snapshot.revision < current.revision)) return;
  // Command/move snapshots usually change only the selection. Keep existing
  // DOM nodes and decoded icons instead of rebuilding the full history per key.
  const itemsChanged = !sameItems(snapshot.items, current?.items);
  current = snapshot;
  if (itemsChanged) {
    rows.clear();
    const fragment = document.createDocumentFragment();
    snapshot.items.forEach((item, index) => {
      const row = createRow(item, index, snapshot.items.length);
      rows.set(item.id, row);
      fragment.append(row);
    });
    list.replaceChildren(fragment);
    selectedRow = null;
  }
  const selected = snapshot.items[snapshot.index];
  const nextRow = selected ? rows.get(selected.id) : null;
  if (nextRow !== selectedRow) {
    selectedRow?.setAttribute('aria-selected', 'false');
    selectedRow = nextRow;
    if (selectedRow) {
      selectedRow.setAttribute('aria-selected', 'true');
      list.setAttribute('aria-activedescendant', selectedRow.id);
      selectedRow.scrollIntoView({ block: 'nearest' });
    }
  }
  if (!selectedRow) list.removeAttribute('aria-activedescendant');
  empty.hidden = snapshot.items.length > 1;
  position.textContent = `${snapshot.items.length ? snapshot.index + 1 : 0} / ${snapshot.items.length}`;
  list.setAttribute('aria-busy', 'false');
  hint.textContent = 'F next · Release modifiers to switch';
}

async function commit(id) {
  if (!current?.items.length) return;
  finished = true;
  try {
    await request('commit', id == null ? {} : { id });
    early.release();
    window.close();
  }
  catch (problem) {
    finished = false;
    if (early.disconnected || early.blurred) {
      cancelNow(false);
      return;
    }
    await early.reclaim();
    throw problem;
  }
}

async function cancel(restore = true) {
  if (finished) return;
  finished = true;
  try { await request('cancel', { restore }); }
  finally { early.release(); window.close(); }
}

// Cancellation must stay available even if the initial worker request stalls.
function cancelNow(restore = true) {
  void cancel(restore).catch(() => { /* The window closes even after disconnection. */ });
}

async function input(event) {
  if (event.type === 'keyup') {
    if (!event.altKey && !event.shiftKey && !event.ctrlKey && !event.metaKey && !event.altGraph) {
      return await commit();
    }
    return;
  }
  if (event.key === 'Enter') return await commit();
  if (event.key === 'f') return await request('move', { delta: 1 });
  if (['ArrowDown', 'ArrowRight'].includes(event.key)) return await request('move', { delta: 1 });
  if (['ArrowUp', 'ArrowLeft'].includes(event.key)) return await request('move', { delta: -1 });
}

chrome.runtime.onMessage.addListener(message => {
  if (message.type === 'flytab:close' && message.token === token) {
    finished = true;
    early.release();
    window.close();
    return;
  }
  if (message.type === 'flytab:state' && !finished) render(message.snapshot);
});
document.querySelector('#cancel').addEventListener('click', () => cancelNow());
list.addEventListener('click', event => {
  const row = event.target.closest('.tab');
  if (row && list.contains(row)) sequence(() => commit(Number(row.dataset.tabId)));
});
list.addEventListener('error', event => {
  const icon = event.target;
  if (icon.tagName === 'IMG' && icon.getAttribute('src') !== 'tab.svg') icon.src = 'tab.svg';
}, true);
list.addEventListener('wheel', event => {
  event.preventDefault();
  const now = performance.now();
  if (now - wheelAt > 180 || Math.sign(wheelTotal) !== Math.sign(event.deltaY)) wheelTotal = 0;
  wheelAt = now;
  wheelTotal += event.deltaY * (event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? 240 : 1);
  if (Math.abs(wheelTotal) >= 45) {
    const delta = Math.sign(wheelTotal);
    wheelTotal = 0;
    sequence(() => request('move', { delta }));
  }
}, { passive: false });

// The early listener also catches window blur during module loading. Never
// steal focus back or replay a buffered release after the user leaves.
early.handle = event => {
  if (event.type === 'blur' || event.type === 'disconnect') cancelNow(false);
  else if (event.type === 'keydown' && event.key === 'Escape') cancelNow();
  else sequence(() => input(event));
};
if (early.blurred || early.disconnected) {
  early.pending.length = 0;
  cancelNow(false);
} else {
  list.focus({ preventScroll: true });
  for (const event of early.pending.splice(0)) early.handle(event);
}
