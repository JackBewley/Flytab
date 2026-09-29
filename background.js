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

// Read-only paths do not rewrite session storage. Queries can overlap, and
// callers opening a window may supply the state/focused window already read.
async function read({ stored, parent, persist = true } = {}) {
  const [allTabs, values] = await Promise.all([
    chrome.tabs.query({}),
    stored === undefined ? chrome.storage.session.get(STATE_KEY) : stored
  ]);
  const tabs = allTabs.filter(tab => eligible(tab, ORIGIN));
  const live = new Set(tabs.map(tab => tab.id));
  let state = values[STATE_KEY];
  let changed = false;
  if (!state || state.version !== 1) {
    const focused = parent || await chrome.windows.getLastFocused();
    state = { version: 1, order: reconstruct(tabs, focused?.focused && !focused.incognito ? focused.id : undefined), session: null };
    changed = true;
  } else {
    const order = state.order.filter(id => live.has(id));
    const session = pruneSession(state.session, live);
    changed = order.length !== state.order.length ||
      Boolean(session && (session.ids.length !== state.session.ids.length || session.index !== state.session.index));
    // A pruned list must supersede any earlier in-flight UI snapshot.
    if (changed && session) session.revision++;
    state = { ...state, order, session };
  }
  if (changed && persist) await save(state);
  return { state, tabs };
}

async function snapshot(state, knownTabs) {
  if (!state.session) return null;
  const tabs = knownTabs || (await chrome.tabs.query({})).filter(tab => eligible(tab, ORIGIN));
  const byId = new Map(tabs.map(tab => [tab.id, tab]));
  // Several close events may be queued. Keep the visible selection tied to
  // the same live tab IDs even before all removal handlers have persisted.
  const session = pruneSession(state.session, new Set(byId.keys()));
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

async function broadcast(state, tabs) {
  if (!state.session) return;
  try {
    await chrome.runtime.sendMessage({ type: 'flytab:state', snapshot: await snapshot(state, tabs) });
  } catch { /* The popup may still be parsing or may have just closed. */ }
}

async function closeWindow(id) {
  if (!Number.isInteger(id)) return;
  try { await chrome.windows.remove(id); } catch { /* Already closed. */ }
}

function popupURL(token, kind = 'window') {
  return chrome.runtime.getURL(`popup.html?session=${token}${kind === 'action' ? '&surface=action' : ''}`);
}

async function actionContexts(session, documentId = session.documentId) {
  if (typeof chrome.runtime.getContexts !== 'function') return [];
  const filter = { contextTypes: ['POPUP'] };
  if (documentId) filter.documentIds = [documentId];
  else filter.documentUrls = [popupURL(session.token, 'action')];
  const contexts = await chrome.runtime.getContexts(filter);
  return contexts.filter(context => context.contextType === 'POPUP' &&
    context.documentUrl === popupURL(session.token, 'action') &&
    (context.windowId === session.sourceWindowId || context.windowId === chrome.windows.WINDOW_ID_NONE));
}

async function canOpenAction() {
  if (typeof chrome.action.openPopup !== 'function' ||
      typeof chrome.action.getUserSettings !== 'function' ||
      typeof chrome.runtime.getContexts !== 'function') return false;
  try { return (await chrome.action.getUserSettings()).isOnToolbar === true; }
  catch { return false; } // Older Chrome keeps the native window route.
}

async function closeSwitcher(session) {
  if (!session) return;
  if (session.kind === 'action') {
    // An action popup belongs to its source browser window. Never remove that
    // window: ask only the extension document with this session token to close.
    try { await chrome.runtime.sendMessage({ type: 'flytab:close', token: session.token }); }
    catch { /* Chrome may already have dismissed the bubble. */ }
  } else {
    await closeWindow(session.windowId);
  }
}

async function openSwitcher(token, parent, useAction) {
  if (useAction) {
    try {
      await chrome.action.setPopup({ popup: popupURL(token, 'action').slice(ORIGIN.length) });
      try {
        await chrome.action.openPopup({ windowId: parent.id });
      } finally {
        // Configuring a popup suppresses toolbar onClicked. Restore the normal
        // immediate-toggle behavior as soon as the bubble has opened.
        await chrome.action.setPopup({ popup: '' });
      }
      return { kind: 'action', windowId: parent.id };
    } catch {
      // Unsupported/policy-restricted APIs and popup-opening failures fall back
      // to the normal window. Also clean up a bubble if opening succeeded but
      // clearing its temporary toolbar configuration failed.
      await chrome.action.setPopup({ popup: '' }).catch(() => {});
      await closeSwitcher({ kind: 'action', token });
      // A rejected opening can mean the user switched away while Chrome was
      // loading it. Do not steal focus by opening the fallback in that case.
      const currentParent = await chrome.windows.get(parent.id);
      if (!currentParent.focused) throw new Error('Flytab opening was cancelled when its source window lost focus.');
    }
  }
  const popup = await chrome.windows.create({
    url: popupURL(token), type: 'popup', focused: true, width: 440, height: 388,
    left: Math.round((parent.left || 0) + Math.max(0, ((parent.width || 440) - 440) / 2)),
    top: Math.round((parent.top || 0) + Math.max(0, ((parent.height || 388) - 388) / 3))
  });
  if (!popup?.id) throw new Error('Chrome could not open the switcher.');
  return { kind: 'window', windowId: popup.id };
}

async function cancel(state, restore = true) {
  const session = state.session;
  if (!session) return;
  state.session = null;
  await save(state);
  await closeSwitcher(session);
  if (restore && session.kind !== 'action') {
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
  const session = state.session;
  state.session = null;
  await save(state);
  await closeSwitcher(session);
}

function sourceIn(window) {
  return window?.focused && !window.incognito
    ? window.tabs?.find(tab => tab.active && eligible(tab, ORIGIN))
    : null;
}

async function quickSwitch(current, parent) {
  // Resolve live focus inside the queue, never trust a stale command-event tab.
  const [data, focused] = await Promise.all([
    current || read(), parent || chrome.windows.getLastFocused({ populate: true })
  ]);
  const { state, tabs } = data;
  const source = sourceIn(focused) || tabs.find(tab => tab.id === state.session?.sourceId);
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
  // Keep existing command IDs/bindings. Resolve live source/state and toolbar
  // capability concurrently before asking Chrome to create/focus the switcher.
  if (!['switch-next', 'switch-previous'].includes(name)) return;
  const [stored, parent, useAction] = await Promise.all([
    chrome.storage.session.get(STATE_KEY),
    chrome.windows.getLastFocused({ populate: true }),
    name === 'switch-previous' ? canOpenAction() : false
  ]);
  let state = stored[STATE_KEY];
  if (state?.session) {
    if (state.session.kind === 'action') {
      // Chrome can destroy its bubble before a blur/cancel message is delivered.
      // The parent browser window staying open does not prove the list is alive.
      let contexts = [];
      try { contexts = await actionContexts(state.session); } catch { /* Reopen below. */ }
      if (!contexts.length || parent.id !== state.session.sourceWindowId) {
        const previous = state.session;
        state.session = null;
        await save(state);
        await closeSwitcher(previous);
      }
    } else if (parent.id !== state.session.windowId) {
      // A native popup's focused window proves it is alive; otherwise validate.
      try { await chrome.windows.get(state.session.windowId); }
      catch { state.session = null; await save(state); }
    }
  }
  if (state?.session) {
    const current = await read({ stored, parent, persist: false });
    state = current.state;
    state.session = step(state.session, 1);
    state.session.revision++;
    await save(state);
    if (state.session.kind !== 'action' && (parent.id !== state.session.windowId || !parent.focused)) {
      await chrome.windows.update(state.session.windowId, { focused: true });
    }
    await broadcast(state, current.tabs);
    return;
  }
  if (name === 'switch-next') {
    return await quickSwitch(await read({ stored, parent, persist: false }), parent);
  }
  const source = sourceIn(parent);
  if (!source) return;
  const token = crypto.randomUUID();
  // Start opening BEFORE the full tab scan or any session write. A pinned
  // toolbar bubble avoids creating an OS window; other cases use the native
  // popup. Early UI requests remain queued until the source, frozen order,
  // token, surface kind and owning window have been saved together.
  const opening = openSwitcher(token, parent, useAction);
  try {
    const [popup, current] = await Promise.all([opening, read({ stored, parent, persist: false })]);
    state = current.state;
    if (!current.tabs.some(tab => tab.id === source.id)) throw new Error('The source tab closed while Flytab was opening.');
    state.order = promote(state.order, source.id);
    state.session = {
      token, sourceId: source.id, sourceWindowId: source.windowId,
      ids: [...state.order.slice(1), source.id], index: 0,
      revision: 0, kind: popup.kind, windowId: popup.windowId
    };
    await save(state);
    // Toolbar cosmetics must not delay the popup's queued initial state request.
    void chrome.action.setBadgeText({ text: '' }).catch(() => {});
  } catch (error) {
    // Even if history preparation fails first, wait for and close any window
    // created concurrently. Do not leave an orphan with an unbound token.
    const popup = await opening.catch(() => null);
    if (popup) await closeSwitcher({ ...popup, token });
    if (state?.session?.token === token) {
      state.session = null;
      try { await save(state); } catch { /* The next read validates live windows. */ }
    }
    void chrome.action.setBadgeText({ text: '!' }).catch(() => {});
    void chrome.action.setTitle({ title: 'Flytab could not open — click to switch to the previous tab' }).catch(() => {});
    throw error;
  }
}

async function message(request, sender) {
  if (sender.id !== chrome.runtime.id || !sender.url?.startsWith(ORIGIN + 'popup.html')) {
    throw new Error('Unknown Flytab page.');
  }
  const { state, tabs } = await read();
  const session = state.session;
  let authorized = session && session.token === request.token &&
    sender.url === popupURL(session.token, session.kind);
  if (authorized && session.kind === 'action') {
    // Chrome's action sender may omit both tab and documentId, and its POPUP
    // context may report windowId=-1. Require a unique live browser-owned POPUP
    // at the exact unguessable session URL, never merely an extension page URL.
    // A normal tab at that URL still has sender.tab and must be rejected.
    authorized = !sender.tab && sender.origin === ORIGIN.slice(0, -1);
    if (authorized) {
      const contexts = await actionContexts(session, sender.documentId || session.documentId);
      const context = contexts.length === 1 ? contexts[0] : null;
      authorized = Boolean(context?.documentId) &&
        (!session.documentId || context.documentId === session.documentId) &&
        (!sender.documentId || context.documentId === sender.documentId);
      if (authorized && !session.documentId) {
        // openPopup explicitly targeted sourceWindowId. Chrome can report
        // that normal window as unfocused while its action bubble owns focus,
        // so validate its last-focused identity rather than the focused flag.
        if (context.windowId === chrome.windows.WINDOW_ID_NONE) {
          const owner = await chrome.windows.getLastFocused();
          authorized = owner.id === session.sourceWindowId && !owner.incognito;
        }
        if (authorized) {
          session.documentId = context.documentId;
          await save(state);
        }
      }
    }
  } else if (authorized) {
    authorized = sender.tab?.windowId === session.windowId;
  }
  if (!authorized) {
    return { ok: false, expired: true, error: 'This switcher has closed. Open Flytab again.' };
  }
  if (request.type === 'flytab:get') return { ok: true, snapshot: await snapshot(state, tabs) };
  if (request.type === 'flytab:cancel') {
    await cancel(state, request.restore !== false);
    return { ok: true };
  }
  if (request.type === 'flytab:move') {
    state.session = step(session, request.delta < 0 ? -1 : 1);
    state.session.revision++;
    await save(state);
    // The requesting popup is the only consumer; one response avoids duplicate
    // queries, messages and renders for the same selection.
    return { ok: true, snapshot: await snapshot(state, tabs) };
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

// Events carry the changed IDs; avoid rescanning every browser tab for each
// activation/creation/removal. Commands still reconcile against live tabs.
async function eventState() {
  const stored = await chrome.storage.session.get(STATE_KEY);
  return stored[STATE_KEY]?.version === 1 ? stored[STATE_KEY] : (await read({ stored })).state;
}

chrome.tabs.onActivated.addListener(({ tabId, windowId }) => {
  void enqueue(async () => {
    let tab, window;
    try {
      [tab, window] = await Promise.all([chrome.tabs.get(tabId), chrome.windows.get(windowId)]);
    } catch { return; }
    if (!eligible(tab, ORIGIN) || !tab.active || tab.windowId !== windowId || !window.focused) return;
    const state = await eventState();
    if (state.order[0] === tab.id) return;
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
    const state = await eventState();
    // Clicking another browser window dismisses preview, preserving that choice.
    if (state.session && windowId !== state.session.windowId) await cancel(state, false);
    if (state.order[0] === tab.id) return;
    state.order = promote(state.order, tab.id);
    await save(state);
  });
});

chrome.tabs.onCreated.addListener(tab => {
  // Active tabs are recorded by onActivated only when their window is focused.
  if (!eligible(tab, ORIGIN) || tab.active) return;
  void enqueue(async () => {
    const state = await eventState();
    // Only startup reconstruction could have included this new background tab.
    if (!state.order.includes(tab.id)) return;
    state.order = state.order.filter(id => id !== tab.id);
    await save(state);
  });
});

chrome.tabs.onRemoved.addListener(tabId => {
  void enqueue(async () => {
    const state = await eventState();
    if (!state.order.includes(tabId) && !state.session?.ids.includes(tabId)) return;
    state.order = state.order.filter(id => id !== tabId);
    if (state.session) {
      state.session = pruneSession(state.session, new Set(state.session.ids.filter(id => id !== tabId)));
      state.session.revision++;
    }
    await save(state);
    await broadcast(state);
  });
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
    await broadcast(refreshed.state, refreshed.tabs);
  });
});

chrome.windows.onRemoved.addListener(windowId => {
  void enqueue(async () => {
    const state = await eventState();
    if (state.session?.windowId === windowId) { state.session = null; await save(state); }
  });
});

chrome.runtime.onInstalled.addListener(() => { void enqueue(read); });
chrome.runtime.onStartup.addListener(() => { void enqueue(read); });

// Recover the temporary toolbar setting if a prior worker was interrupted
// between configuring an action popup and clearing it. This runs before queued
// commands in each worker lifetime and never changes the user's pin setting.
void enqueue(() => chrome.action.setPopup({ popup: '' }));
