// Chrome may suppress media-query change events in an offscreen document.
// Check locally as a fallback; wake the worker only when appearance changes.
const appearance = matchMedia('(prefers-color-scheme: dark)');
let reportedDark;
let reporting = false;
async function reportAppearance() {
  const dark = appearance.matches;
  if (reporting || dark === reportedDark) return;
  reporting = true;
  try {
    const response = await chrome.runtime.sendMessage({ type: 'flytab:theme', dark });
    if (response?.ok) reportedDark = dark;
  } catch {
    // Keep Chrome's last icon; the next local check retries.
  } finally {
    reporting = false;
  }
}
appearance.addEventListener('change', reportAppearance);
setInterval(reportAppearance, 5000);
void reportAppearance();
