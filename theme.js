// Loaded only after a visible Flytab page is ready. No observer, polling,
// worker message or stored preference is needed; the page owns this short task.
let applying = false;
export async function refreshIcon() {
  if (document.hidden || applying) return;
  const dark = matchMedia('(prefers-color-scheme: dark)').matches;
  applying = true;
  try {
    const suffix = dark ? '-dark' : '';
    await chrome.action.setIcon({ path: {
      16: `icons/icon${suffix}-16.png`, 32: `icons/icon${suffix}-32.png`
    } });
  } catch {
    // Cosmetic failure must never interrupt switching. Retry on a later open.
  } finally {
    applying = false;
  }
}
