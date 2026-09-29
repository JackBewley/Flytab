// Loaded synchronously before the stylesheet and UI module. Capture release even
// while the UI is loading; nothing can capture it before this document exists.
(() => {
  const input = { pending: [], handle: null, trace: [], armed: false };
  window.flytabInput = input;
  for (const type of ['keydown', 'keyup']) {
    window.addEventListener(type, event => {
      if (event.isComposing) return;
      // Let native buttons own Enter; otherwise Tab → Cancel → Enter would
      // accidentally commit the selected tab instead of cancelling.
      if (event.key === 'Enter' && event.target?.closest?.('button')) return;
      const data = { type, key: event.key, code: event.code, altKey: event.altKey,
        shiftKey: event.shiftKey, metaKey: event.metaKey, ctrlKey: event.ctrlKey,
        repeat: event.repeat, time: Math.round(performance.now()) };
      // In-memory, key-only diagnostics. No titles, URLs, storage, or telemetry.
      input.trace.push(data);
      if (input.trace.length > 80) input.trace.shift();
      if (['Escape', 'Enter', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(event.key)) {
        event.preventDefault();
      }
      if (input.handle) input.handle(data);
      else input.pending.push(data);
    }, true);
  }
})();
