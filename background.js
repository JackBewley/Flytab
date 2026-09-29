import { eligible, promote, commitOrder, reconstruct, step, pruneSession } from './core.js';

const ORIGIN = chrome.runtime.getURL('');
const STATE_KEY = 'flytab';
// This is only a mutex. All durable state is in storage.session, including the
// frozen switcher order, so worker suspension cannot lose history or selection.
let tail = Promise.resolve();
function enqueue(operation) {
  const previous = tail;
  const result = (async () => {
    try { await previous; } catch { /* A failed operation must not poison the queue. */ }
    return await operation();
  })();
  tail = result;
  void result.catch(error => console.error('Flytab:', error.message));
  return result;
}

async function save(state) {
  await chrome.storage.session.set({ [STATE_KEY]: state });
}

async function read() {
  const tabs = (await chrome.tabs.query({})).filter(tab => eligible(tab, ORIGIN));
  const stored = (await chrome.storage.session.get(STATE_KEY))[STATE_KEY];
  const live = new Set(tabs.map(tab => tab.id));
  let state = stored;
  if (!state || state.version !== 1) {
    const windows = await chrome.windows.getAll();
    const focused = windows.find(window => window.focused && !window.incognito);
    state = { version: 1, order: reconstruct(tabs, focused?.id), session: null };
  } else {
    state.order = state.order.filter(id => live.has(id));
    state.session = pruneSession(state.session, live);
  }
  await save(state);
  return { state, tabs };
}

async function snapshot(state) {
  const session = state.session;
  if (!session) return null;
  const tabs = (await chrome.tabs.query({})).filter(tab => eligible(tab, ORIGIN));
  const byId = new Map(tabs.map(tab => [tab.id, tab]));
  const items = session.ids.map(id => byId.get(id)).filter(Boolean).map(tab => ({
    id: tab.id,
    title: tab.title || 'Untitled tab',
    // Never load tab.favIconUrl: it can be a remote resource. The extension's
    // _favicon endpoint is Chrome's local cache, with a generic fallback.
    icon: cachedIcon(tab),
    otherWindow: tab.windowId !== session.sourceWindowId,
    current: tab.id === session.sourceId
  }));
  return { token: session.token, index: session.index, items, revision: session.revision };
}

function cachedIcon(tab) {
  if (!/^https?:/i.test(tab.url || '')) return 'tab.svg';
  const url = new URL(chrome.runtime.getURL('_favicon/'));
  url.searchParams.set('pageUrl', tab.url);
  url.searchParams.set('size', '32');
  return url.href;
}

async function broadcast(state) {
  if (!state.session) return;
  try {
    await chrome.runtime.sendMessage({ type: 'flytab:state', snapshot: await snapshot(state) });
  } catch { /* The popup may still be parsing or may have just closed. */ }
}

async function closeWindow(id) {
  if (!Number.isInteger(id)) return;
  try { await chrome.windows.remove(id); } catch { /* Already closed. */ }
}

async function cancel(state, restore = true) {
  const session = state.session;
  if (!session) return;
  state.session = null;
  await save(state);
  await closeWindow(session.windowId);
  if (restore) {
    try { await chrome.windows.update(session.sourceWindowId, { focused: true }); } catch { /* Source closed. */ }
  }
}

async function activate(state, destinationId, sourceId) {
  const destination = await chrome.tabs.get(destinationId);
  if (!eligible(destination, ORIGIN)) throw new Error('That tab is no longer available.');
  // Activate before focusing: avoids putting the destination window's old
  // active tab between the chosen destination and source in the MRU list.
  await chrome.tabs.update(destinationId, { active: true });
  await chrome.windows.update(destination.windowId, { focused: true });
  state.order = commitOrder(state.order, destinationId,
    state.order.includes(sourceId) ? sourceId : null);
  const popupId = state.session?.windowId;
  state.session = null;
  await save(state);
  await closeWindow(popupId);
}

async function sourceTab() {
  const windows = await chrome.windows.getAll({ populate: true });
  return windows.find(window => window.focused && !window.incognito)?.tabs
    ?.find(item => item.active && eligible(item, ORIGIN));
}

async function quickSwitch(current) {
  const { state, tabs } = current || await read();
  // Resolve the source when this queued operation runs. The tab supplied with
  // an earlier command event can already be stale after another quick toggle.
  const source = await sourceTab() || tabs.find(tab => tab.id === state.session?.sourceId);
  if (!source) return;
  state.order = promote(state.order, source.id);
  if (state.order.length > 1) {
    await activate(state, state.order[1], source.id);
  } else {
    await cancel(state, false);
    await save(state);
  }
}

async function command(name) {
  // Retain the original command IDs so existing shortcut assignments survive
  // reloads. Outside the list, Option+F toggles and Option+Shift+F opens it.
  if (!['switch-next', 'switch-previous'].includes(name)) return;
  const current = await read();
  const { state } = current;
  if (state.session) {
    // A crashed/closed window must never leave the command stuck in navigation.
    try { await chrome.windows.get(state.session.windowId); }
    catch { state.session = null; await save(state); }
  }
  if (state.session) {
    // Chrome owns modified shortcuts; the popup handles only plain F/Shift+F
    // so one physical press cannot advance through both event paths.
    state.session = step(state.session, name === 'switch-next' ? 1 : -1);
    state.session.revision++;
    await save(state);
    await chrome.windows.update(state.session.windowId, { focused: true });
    await broadcast(state);
    return;
  }
  if (name === 'switch-next') return await quickSwitch(current);
  const source = await sourceTab();
  if (!source) return;
  state.order = promote(state.order, source.id);
  state.session = {
    token: crypto.randomUUID(), sourceId: source.id, sourceWindowId: source.windowId,
    ids: [...state.order.slice(1), source.id], index: 0,
    revision: 0, windowId: null
  };
  await save(state);
  try {
    const parent = await chrome.windows.get(source.windowId);
    const popup = await chrome.windows.create({
      url: chrome.runtime.getURL(`popup.html?session=${state.session.token}`),
      type: 'popup', focused: true, width: 440, height: 388,
      left: Math.round((parent.left || 0) + Math.max(0, ((parent.width || 440) - 440) / 2)),
      top: Math.round((parent.top || 0) + Math.max(0, ((parent.height || 388) - 388) / 3))
    });
    if (!popup?.id) throw new Error('Chrome could not open the switcher.');
    state.session.windowId = popup.id;
    await save(state);
    await chrome.action.setBadgeText({ text: '' });
  } catch (error) {
    state.session = null;
    await save(state);
    await chrome.action.setBadgeText({ text: '!' });
    await chrome.action.setTitle({ title: 'Flytab could not open — click to switch to the previous tab' });
    throw error;
  }
}

async function message(request, sender) {
  if (sender.id !== chrome.runtime.id || !sender.url?.startsWith(ORIGIN + 'popup.html')) {
    throw new Error('Unknown Flytab page.');
  }
  const { state } = await read();
  const session = state.session;
  if (!session || session.token !== request.token || sender.tab?.windowId !== session.windowId) {
    return { ok: false, expired: true, error: 'This switcher has closed. Open Flytab again.' };
  }
  if (request.type === 'flytab:get') return { ok: true, snapshot: await snapshot(state) };
  if (request.type === 'flytab:cancel') {
    await cancel(state, request.restore !== false);
    return { ok: true };
  }
  if (request.type === 'flytab:move') {
    state.session = step(session, request.delta < 0 ? -1 : 1);
    state.session.revision++;
    await save(state);
    await broadcast(state);
    return { ok: true, snapshot: await snapshot(state) };
  }
  if (request.type === 'flytab:commit') {
    const id = request.id ?? session.ids[session.index];
    if (!session.ids.includes(id)) throw new Error('That tab has closed. Choose another tab.');
    await activate(state, id, session.sourceId);
    return { ok: true };
  }
  throw new Error('Unknown Flytab action.');
}

chrome.runtime.onMessage.addListener((request, sender, respond) => {
  if (!['flytab:get', 'flytab:move', 'flytab:commit', 'flytab:cancel'].includes(request?.type)) return;
  void (async () => {
    try { respond(await enqueue(() => message(request, sender))); }
    catch (error) { respond({ ok: false, error: error.message }); }
  })();
  return true;
});

chrome.commands.onCommand.addListener(name => {
  if (['switch-next', 'switch-previous'].includes(name)) void enqueue(() => command(name));
});

chrome.action.onClicked.addListener(() => { void enqueue(quickSwitch); });

chrome.tabs.onActivated.addListener(({ tabId }) => {
  void enqueue(async () => {
    let tab;
    try { tab = await chrome.tabs.get(tabId); } catch { return; }
    if (!eligible(tab, ORIGIN) || !tab.active) return;
    const window = await chrome.windows.get(tab.windowId);
    // An API-selected tab in an unfocused window is not a global visit.
    if (!window.focused) return;
    const { state } = await read();
    state.order = promote(state.order, tab.id);
    await save(state);
  });
});

chrome.windows.onFocusChanged.addListener(windowId => {
  if (windowId === chrome.windows.WINDOW_ID_NONE) return;
  void enqueue(async () => {
    let window;
    try { window = await chrome.windows.get(windowId, { populate: true }); } catch { return; }
    const tab = window.tabs?.find(item => item.active && eligible(item, ORIGIN));
    if (!tab || window.incognito || !window.focused) return;
    const { state } = await read();
    // Clicking another browser window dismisses preview, preserving that choice.
    if (state.session && windowId !== state.session.windowId) await cancel(state, false);
    state.order = promote(state.order, tab.id);
    await save(state);
  });
});

chrome.tabs.onCreated.addListener(tab => {
  void enqueue(async () => {
    const { state } = await read();
    // Never append new background tabs. If first-run reconstruction saw this
    // newly created tab, remove it again until it is actually visited.
    if (!tab.active) state.order = state.order.filter(id => id !== tab.id);
    await save(state);
  });
});

chrome.tabs.onRemoved.addListener(() => {
  void enqueue(async () => { const { state } = await read(); await broadcast(state); });
});

chrome.tabs.onReplaced.addListener((addedId, removedId) => {
  void enqueue(async () => {
    const state = (await chrome.storage.session.get(STATE_KEY))[STATE_KEY];
    if (!state) return;
    state.order = [...new Set(state.order.map(id => id === removedId ? addedId : id))];
    if (state.session) {
      state.session.ids = state.session.ids.map(id => id === removedId ? addedId : id);
      if (state.session.sourceId === removedId) state.session.sourceId = addedId;
      state.session.revision++;
    }
    await save(state);
    const refreshed = await read();
    await broadcast(refreshed.state);
  });
});

chrome.windows.onRemoved.addListener(windowId => {
  void enqueue(async () => {
    const { state } = await read();
    if (state.session?.windowId === windowId) { state.session = null; await save(state); }
  });
});

chrome.runtime.onInstalled.addListener(() => { void enqueue(read); });
chrome.runtime.onStartup.addListener(() => { void enqueue(read); });
