const token = new URL(location.href).searchParams.get('session');
const list = document.querySelector('#tabs');
const error = document.querySelector('#error');
const hint = document.querySelector('#hint');
const early = window.flytabInput;
let current = null;
let finished = false;
let inputTail = Promise.resolve();
let wheelTotal = 0;
let wheelAt = 0;

async function request(type, extra = {}) {
  const response = await chrome.runtime.sendMessage({ type: `flytab:${type}`, token, ...extra });
  if (!response?.ok) throw new Error(response?.error || 'Flytab lost its connection. Close this window and try again.');
  if (response.snapshot) render(response.snapshot);
  return response;
}

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
    try { await action(); } catch (problem) { finished = false; showError(problem); }
  })();
}

function render(snapshot) {
  if (snapshot.token !== token || (current && snapshot.revision < current.revision)) return;
  current = snapshot;
  list.replaceChildren();
  snapshot.items.forEach((item, index) => {
    const row = document.createElement('div');
    row.className = 'tab';
    row.id = `tab-${item.id}`;
    row.setAttribute('role', 'option');
    row.setAttribute('aria-selected', String(index === snapshot.index));
    row.setAttribute('aria-posinset', String(index + 1));
    row.setAttribute('aria-setsize', String(snapshot.items.length));
    row.title = item.title;
    const icon = document.createElement('img');
    icon.src = item.icon;
    icon.alt = '';
    icon.width = 20;
    icon.height = 20;
    icon.addEventListener('error', () => { icon.src = 'tab.svg'; }, { once: true });
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
    row.addEventListener('click', () => sequence(() => commit(item.id)));
    list.append(row);
  });
  const selected = snapshot.items[snapshot.index];
  if (selected) {
    list.setAttribute('aria-activedescendant', `tab-${selected.id}`);
    document.getElementById(`tab-${selected.id}`).scrollIntoView({ block: 'nearest' });
  } else {
    list.removeAttribute('aria-activedescendant');
  }
  document.querySelector('#empty').hidden = snapshot.items.length > 1;
  document.querySelector('#position').textContent = `${snapshot.items.length ? snapshot.index + 1 : 0} / ${snapshot.items.length}`;
  list.setAttribute('aria-busy', 'false');
  hint.textContent = '↑ ↓ to browse · Enter to switch';
}

async function commit(id) {
  if (!current?.items.length) return;
  finished = true;
  await request('commit', id == null ? {} : { id });
}

async function cancel(restore = true) {
  finished = true;
  try { await request('cancel', { restore }); }
  finally { window.close(); }
}

async function input(event) {
  if (event.key === 'Escape' && event.type === 'keydown') return await cancel();
  if (event.key === 'Enter') return await commit();
  if (['ArrowDown', 'ArrowRight'].includes(event.key)) return await request('move', { delta: 1 });
  if (['ArrowUp', 'ArrowLeft'].includes(event.key)) return await request('move', { delta: -1 });
}

chrome.runtime.onMessage.addListener(message => {
  if (message.type === 'flytab:state') render(message.snapshot);
});
document.querySelector('#cancel').addEventListener('click', () => sequence(() => cancel()));
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

// Losing focus never commits an ambiguous selection. Do not steal focus back
// when the user intentionally switches to another app or window.
window.addEventListener('blur', () => sequence(() => cancel(false)));

try {
  await request('get');
  list.focus({ preventScroll: true });
  early.handle = event => sequence(() => input(event));
  for (const event of early.pending.splice(0)) early.handle(event);
} catch (problem) {
  showError(problem);
  early.handle = event => {
    if (event.type === 'keydown' && event.key === 'Escape') window.close();
  };
}
