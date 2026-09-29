// Capture releases synchronously, before styles or the popup UI module load. Chrome
// cannot replay a release that happened before this document received input.
(() => {
  const input = { pending: [], handle: null, trace: [], blurred: false };
  window.flytabInput = input;
  // Record an actual window blur, rather than guessing from initial focus state.
  // The UI must not grab focus or replay a buffered commit after the user leaves.
  window.addEventListener('blur', () => {
    input.blurred = true;
    input.handle?.({ type: 'blur' });
  });
  const modifiers = ['Alt', 'Shift', 'Control', 'Meta', 'AltGraph'];
  for (const type of ['keydown', 'keyup']) {
    window.addEventListener(type, event => {
      if (event.isComposing) return;
      const isF = event.code === 'KeyF' || event.key?.toLowerCase() === 'f';
      if (type === 'keyup') {
        // Releasing F alone while modifiers remain held must not commit.
        // F keyup also recovers a missed modifier release if all are now up.
        if (!isF && !modifiers.includes(event.key)) return;
      } else {
        // Escape must work while the opening chord is still held. Preserve
        // native Enter activation on Cancel, including with modifiers held.
        if (event.key === 'Enter' && event.target?.closest?.('button')) return;
        const confirmOrCancel = ['Escape', 'Enter'].includes(event.key);
        // Chrome owns modified shortcut presses; never advance twice.
        if (!confirmOrCancel && (event.altKey || event.ctrlKey || event.metaKey)) return;
        if (!isF && !['Escape', 'Enter', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(event.key)) return;
        event.preventDefault();
      }
      const data = { type, key: isF ? 'f' : event.key, repeat: Boolean(event.repeat),
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
  input.ready = chrome.runtime.sendMessage({ type: 'flytab:get', token }).catch(problem => ({
    ok: false, error: problem.message
  }));
})();
