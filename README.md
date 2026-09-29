# Flytab

A minimal Manifest V3 tab switcher. No build step or runtime dependencies. Chrome 121+ on desktop; macOS is the tested platform.

## Install

1. Unzip the package if needed. Keep the **Flytab** folder somewhere permanent.
2. Open `chrome://extensions`, enable **Developer mode**, choose **Load unpacked**, and select the folder containing `manifest.json`.
3. Pin Flytab from Chrome's Extensions menu if you want the toolbar shortcut.
4. Open `chrome://extensions/shortcuts`. Confirm **Open Flytab / next recent tab** is **Option+F** on macOS. If it is blank or conflicts with another shortcut, assign one. Keep its scope **In Chrome**.

Changes to the source require **Reload** on Flytab's extension card. No store publication or installation in your normal Chrome profile was performed during development.

## Use

| Action | Result |
|---|---|
| Click toolbar icon | Immediately activates the previous MRU tab; no switcher |
| Option+F on macOS | Opens switcher with previous tab selected |
| Repeat Option+F | Next older entry; wraps through all visited tabs |
| Option+Shift+F | Previous entry while switcher is open; no action outside it |
| Release Option, when received by popup | Commits selection |
| Enter / click an entry | Commits selection reliably |
| Esc / Cancel / close window | Cancels |
| Arrow keys / wheel | Navigates without activating tabs |

The five-row list scrolls through the full MRU history. The starting tab appears last, labeled Current. A commit focuses the destination window, places the destination first, and puts the source second. Opening another window/app dismisses the switcher without committing.

Other desktop platforms default to **Alt+Q / Alt+Shift+Q**, avoiding Chrome's Alt+F menu shortcut. Both commands are remappable. Alt/Option-based opening shortcuts support best-effort modifier release; other modifiers use Enter/click. The original Alt+F / Alt+Shift+F also navigate inside an already open switcher when they are not reserved accelerators. “Global MRU” means across Chrome windows, not a system-wide keyboard hook.

## Important: fast taps

**Very fast Option+F taps cannot reliably commit automatically.** Chrome's Commands API reports invocation, not key release or current physical modifier state. A newly created popup can miss the release before it receives focus or installs its listener. This was reproduced with a quick macOS UI-automation chord: the switcher opened and its input trace was empty.

Flytab installs its release listener as the first synchronous script and buffers events while the UI loads. If it receives Option/Alt keyup, it commits. If it misses it, the popup **stays open for Enter or a click**. There is no timer that guesses whether you are still holding Option. Hold/release on a physical keyboard still needs testing on your Chrome/macOS combination; this is a working best-effort prototype, not a guarantee of Cmd+Tab semantics. See [TESTING.md](TESTING.md) for evidence and a quick manual matrix.

The keyboard switcher is a separate, compact native popup window, so it has an OS title bar. This keeps toolbar-click behavior independent and avoids temporarily assigning an action popup.

## Privacy and permissions

- **tabs**: open-tab titles/IDs/window IDs and activation events. Chrome may describe this as reading browsing history; Flytab does not use the History API.
- **storage**: `storage.session` holds tab IDs, MRU order, and the open switcher's selection. It survives worker suspension and is cleared when Chrome exits or the extension reloads/disables. Titles, URLs and favicons are read live, not persisted by Flytab.
- **favicon**: reads Chrome's local favicon cache via its own extension URL. Loading remote `favIconUrl` images could make network requests, so Flytab never does that. Missing/internal-page icons use a bundled generic tab icon.

No host permissions, content scripts, History API, analytics, server, account, or external network requests. CSP blocks external connections and images. Commands/action/windows APIs require no separate permission entries. Incognito is disabled in the manifest and filtered defensively.

At startup/installation, Flytab seeds from open tabs sorted by `lastAccessed`, with the focused tab first. That is approximate: Chrome records activation within a window, not the full historical order of window focus, and cannot prove whether an already-open tab was ever visited before installation. New background tabs observed by Flytab stay out until visited. Tabs restored after the initial startup scan may enter only when visited.

## Source and tests

`background.js` owns serialized session state and browser actions; `core.js` holds MRU rules; `early-input.js` captures early keyboard events; `popup.*` implements the switcher. Run `npm test` with Node 20+ for unit tests. Optional isolated-browser tests and remaining manual checks are in [TESTING.md](TESTING.md).

API references: [Commands](https://developer.chrome.com/docs/extensions/reference/api/commands), [Tabs / lastAccessed](https://developer.chrome.com/docs/extensions/reference/api/tabs), [Windows](https://developer.chrome.com/docs/extensions/reference/api/windows), [cached favicons](https://developer.chrome.com/docs/extensions/how-to/ui/favicons).
