// Capture navigation/confirmation while the optional list is loading.
// Modifier release has no role: quick toggling runs entirely in the worker.
(() => {
  const input = { pending: [], handle: null, trace: [] };
  window.flytabInput = input;
  window.addEventListener('keydown', event => {
    if (event.isComposing) return;
    // Preserve native Enter activation on Cancel.
    if (event.key === 'Enter' && event.target?.closest?.('button')) return;
    // Chrome owns Option+F / Option+Shift+F and remapped accelerators.
    // Handling modified F here too could navigate twice for a single press.
    if (event.altKey || event.ctrlKey || event.metaKey) return;
    const isF = event.code === 'KeyF' || event.key?.toLowerCase() === 'f';
    if (!isF && !['Escape', 'Enter', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(event.key)) return;
    const data = { type: 'keydown', key: isF ? 'f' : event.key, shiftKey: Boolean(event.shiftKey), repeat: event.repeat,
      time: Math.round(performance.now()) };
    input.trace.push(data);
    if (input.trace.length > 80) input.trace.shift();
    event.preventDefault();
    if (input.handle) input.handle(data);
    else input.pending.push(data);
  }, true);
})();
