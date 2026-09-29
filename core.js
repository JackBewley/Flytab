// Pure MRU rules; the worker is the only owner of browser-session state.
export function eligible(tab, extensionOrigin) {
  return Number.isInteger(tab.id) && tab.id >= 0 && !tab.incognito &&
    !(tab.url || tab.pendingUrl || '').startsWith(extensionOrigin);
}

export function promote(order, id) {
  return [id, ...order.filter(other => other !== id)];
}

export function commitOrder(order, destination, source) {
  const rest = order.filter(id => id !== destination && id !== source);
  return destination === source || source == null
    ? [destination, ...rest]
    : [destination, source, ...rest];
}

export function reconstruct(tabs, focusedWindowId) {
  const sorted = [...tabs].sort((a, b) =>
    (b.lastAccessed || 0) - (a.lastAccessed || 0) || a.id - b.id);
  const order = sorted.map(tab => tab.id);
  const current = tabs.find(tab => tab.active && tab.windowId === focusedWindowId);
  return current ? promote(order, current.id) : order;
}

export function step(session, delta) {
  if (!session.ids.length) return session;
  const index = (session.index + delta % session.ids.length + session.ids.length) % session.ids.length;
  return { ...session, index };
}

export function pruneSession(session, liveIds) {
  if (!session) return null;
  const selected = session.ids[session.index];
  const ids = session.ids.filter(id => liveIds.has(id));
  const previousIndex = ids.indexOf(selected);
  return { ...session, ids, index: previousIndex >= 0 ? previousIndex : Math.min(session.index, Math.max(0, ids.length - 1)) };
}

// Display only an origin label, never credentials, paths, queries or fragments.
export function siteLabel(value) {
  try {
    const url = new URL(value);
    if (['http:', 'https:'].includes(url.protocol)) return url.hostname.replace(/^www\./, '');
    if (url.protocol === 'file:') return 'Local file';
    if (['chrome:', 'chrome-search:', 'chrome-untrusted:', 'about:'].includes(url.protocol)) return 'Chrome';
    if (url.protocol === 'chrome-extension:') return 'Extension';
  } catch { /* Missing or malformed URLs still have a readable label. */ }
  return 'Browser tab';
}
