const quick = document.querySelector('#quick-shortcut');
const list = document.querySelector('#list-shortcut');
const error = document.querySelector('#shortcut-error');
const retry = document.querySelector('#retry-shortcuts');
const edit = document.querySelector('#edit-shortcuts');
let refreshing = false;

function showError(message) {
  error.textContent = message;
  error.hidden = false;
  retry.hidden = false;
}

async function refreshShortcuts() {
  if (refreshing) return;
  refreshing = true;
  try {
    const commands = await chrome.commands.getAll();
    quick.textContent = commands.find(command => command.name === 'switch-next')?.shortcut || 'Not assigned';
    list.textContent = commands.find(command => command.name === 'switch-previous')?.shortcut || 'Not assigned';
    error.hidden = true;
    retry.hidden = true;
  } catch {
    quick.textContent = list.textContent = 'Unavailable';
    showError('Could not read your shortcuts. Retry, or open Chrome’s shortcut settings.');
  } finally {
    refreshing = false;
  }
}

edit.addEventListener('click', async () => {
  edit.disabled = true;
  try {
    await chrome.tabs.create({ url: 'chrome://extensions/shortcuts' });
    error.hidden = true;
    retry.hidden = true;
  } catch {
    showError('Could not open the shortcut settings. Enter chrome://extensions/shortcuts in Chrome’s address bar.');
  } finally {
    edit.disabled = false;
  }
});
retry.addEventListener('click', refreshShortcuts);
window.addEventListener('focus', refreshShortcuts);
document.addEventListener('visibilitychange', () => {
  if (!document.hidden) void refreshShortcuts();
});
void refreshShortcuts();
