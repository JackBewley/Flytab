// Capture releases synchronously, before the popup UI module loads. Chrome
// cannot replay a release that happened before this document received input.
(() => {
  const input = { pending: [], handle: null, trace: [] };
  window.flytabInput = input;
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
})();
