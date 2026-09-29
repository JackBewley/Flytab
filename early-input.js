// Capture releases synchronously, before styles or the popup UI module load. Chrome
// cannot replay a release that happened before this document received input.
(() => {
  const input = { pending: [], handle: null, trace: [], blurred: false, disconnected: false, shortcuts: [], ownsCommands: false };
  let connection = null;
  window.flytabInput = input;
  // Record an actual window blur, rather than guessing from initial focus state.
  // The UI must not grab focus or replay a buffered commit after the user leaves.
  window.addEventListener('blur', () => {
    input.blurred = true;
    input.handle?.({ type: 'blur' });
  });
  const modifiers = ['Alt', 'Shift', 'Control', 'Meta', 'AltGraph'];
  // commands.getAll uses macOS glyphs (⌥⇧F) or named modifiers (Alt+Shift+F).
  // Match physical letter keys as well as event.key: Option can produce Ï/ƒ.
  function shortcutBinding(text) {
    const aliases = { '⌥': 'Alt+', '⇧': 'Shift+', '⌃': 'Ctrl+', '⌘': 'Meta+' };
    const parts = text.replace(/[⌥⇧⌃⌘]/g, value => aliases[value]).split('+').map(value => value.trim()).filter(Boolean);
    const key = (parts.pop() || '').toLowerCase();
    if (!key) return null;
    const names = new Set(parts.map(value => value.toLowerCase()));
    const codes = { ',': 'Comma', comma: 'Comma', '.': 'Period', period: 'Period', space: 'Space',
      up: 'ArrowUp', '↑': 'ArrowUp', down: 'ArrowDown', '↓': 'ArrowDown', left: 'ArrowLeft', '←': 'ArrowLeft',
      right: 'ArrowRight', '→': 'ArrowRight', home: 'Home', end: 'End', pageup: 'PageUp', '⇞': 'PageUp',
      pagedown: 'PageDown', '⇟': 'PageDown', insert: 'Insert', delete: 'Delete' };
    const code = /^[a-z]$/.test(key) ? 'Key' + key.toUpperCase() : /^\d$/.test(key) ? 'Digit' + key : codes[key];
    return { key, code, altKey: names.has('alt') || names.has('option'), shiftKey: names.has('shift'),
      ctrlKey: names.has('ctrl') || names.has('control') || names.has('macctrl'),
      metaKey: names.has('meta') || names.has('command') || names.has('cmd') || names.has('search') };
  }
  const bindingKeyMatches = (event, binding) => Boolean(binding.code && event.code === binding.code) || event.key?.toLowerCase() === binding.key;
  const bindingMatches = (event, binding) => bindingKeyMatches(event, binding) &&
    ['altKey', 'shiftKey', 'ctrlKey', 'metaKey'].every(flag => Boolean(event[flag]) === binding[flag]);
  for (const type of ['keydown', 'keyup']) {
    window.addEventListener(type, event => {
      if (event.isComposing) return;
      const isF = event.code === 'KeyF' || event.key?.toLowerCase() === 'f';
      const isShortcut = input.shortcuts.some(binding => bindingMatches(event, binding));
      const isShortcutKey = input.shortcuts.some(binding => bindingKeyMatches(event, binding));
      if (type === 'keyup') {
        // Releasing F alone while modifiers remain held must not commit.
        // F keyup also recovers a missed modifier release if all are now up.
        if (!isF && !isShortcutKey && !modifiers.includes(event.key)) return;
      } else {
        // Escape must work while the opening chord is still held. Preserve
        // native Enter activation on Cancel, including with modifiers held.
        if (event.key === 'Enter' && event.target?.closest?.('button')) return;
        const confirmOrCancel = ['Escape', 'Enter'].includes(event.key);
        // While this document owns input the browser command listener is
        // suspended. Handling the chord here avoids Chrome swallowing keyups
        // after an accelerator. Before handoff Chrome consumes it before DOM.
        if (!confirmOrCancel && !isShortcut && (event.altKey || event.ctrlKey || event.metaKey)) return;
        if (!isF && !isShortcut && !['Escape', 'Enter', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(event.key)) return;
        event.preventDefault();
      }
      const data = { type, key: isF || isShortcut ? 'f' : event.key, repeat: Boolean(event.repeat),
        altKey: Boolean(event.altKey), shiftKey: Boolean(event.shiftKey),
        ctrlKey: Boolean(event.ctrlKey), metaKey: Boolean(event.metaKey),
        altGraph: Boolean(event.getModifierState?.('AltGraph')),
        time: Math.round(performance.now()) };
      input.trace.push(data);
      if (input.trace.length > 80) input.trace.shift();
      if (input.handle) input.handle(data);
      else input.pending.push(data);
    }, true);
  }
  // Start the worker roundtrip only after input capture is installed. This runs
  // while the browser parses the remaining markup and loads styles/UI code.
  // Resolve failures as responses so a slow UI cannot cause an unhandled rejection.
  const parameters = new URL(location.href).searchParams;
  const token = parameters.get('session');
  if (parameters.get('surface') === 'action') document.documentElement.dataset.surface = 'action';
  // Keep this ownership port separate from state requests: loading the UI must
  // not wait for openPopup, which itself waits for document load. A disconnected
  // owner cancels safely rather than leaving a list with unreliable key routing.
  const lostConnection = () => {
    input.disconnected = true;
    input.ownsCommands = false;
    input.handle?.({ type: 'disconnect' });
  };
  input.release = () => {
    const previous = connection;
    connection = null;
    input.ownsCommands = false;
    if (!previous) return;
    previous.intentional = true;
    clearInterval(previous.interval);
    previous.port.disconnect();
  };
  const connect = () => {
    if (input.blurred || input.disconnected) return;
    const owner = { port: chrome.runtime.connect({ name: 'flytab-input:' + token }), intentional: false, interval: null };
    connection = owner;
    owner.port.onMessage.addListener(message => {
      if (connection !== owner || message?.type !== 'flytab:input-ready') return;
      input.ownsCommands = true;
      // Port traffic keeps the worker alive only while this visible picker is
      // in use. This timer never infers key state or commits a selection.
      clearInterval(owner.interval);
      owner.interval = setInterval(() => {
        if (connection === owner && document.visibilityState === 'visible' && document.hasFocus()) {
          try { owner.port.postMessage({ type: 'flytab:input-alive' }); }
          catch { lostConnection(); }
        }
      }, 20000);
    });
    owner.port.onDisconnect.addListener(() => {
      // Read lastError to avoid a console warning on a rejected/stale connection.
      void chrome.runtime.lastError;
      clearInterval(owner.interval);
      if (connection === owner) connection = null;
      if (!owner.intentional) lostConnection();
    });
  };
  input.shortcutsReady = chrome.commands.getAll().then(commands => {
    input.shortcuts = commands.filter(command => ['switch-next', 'switch-previous'].includes(command.name) && command.shortcut)
      .map(command => shortcutBinding(command.shortcut)).filter(Boolean);
  });
  input.reclaim = async () => {
    await input.shortcutsReady;
    input.release();
    connect();
  };
  void input.reclaim().catch(lostConnection);
  window.addEventListener('pagehide', input.release);
  input.ready = chrome.runtime.sendMessage({ type: 'flytab:get', token }).catch(problem => ({
    ok: false, error: problem.message
  }));
})();
