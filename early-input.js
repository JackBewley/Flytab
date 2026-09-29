// Capture navigation/confirmation while the optional list is loading.
// Modifier release has no role: quick toggling runs entirely in the worker.
(() => {
  const input = { pending: [], handle: null, trace: [] };
  window.flytabInput = input;
  window.addEventListener('keydown', event => {
    if (event.isComposing) return;
    // Preserve native Enter activation on Cancel.
    if (event.key === 'Enter' && event.target?.closest?.('button')) return;
    if (!['Escape', 'Enter', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(event.key)) return;
    // Remapped browser accelerators own modified key combinations.
    if (event.altKey || event.ctrlKey || event.metaKey) return;
    const data = { type: 'keydown', key: event.key, repeat: event.repeat,
      time: Math.round(performance.now()) };
    input.trace.push(data);
    if (input.trace.length > 80) input.trace.shift();
    event.preventDefault();
    if (input.handle) input.handle(data);
    else input.pending.push(data);
  }, true);
})();
