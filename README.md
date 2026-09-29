# Flytab

Jump straight back to the Chrome tab you were just on, across windows. A minimal Manifest V3 extension with no build step or runtime dependencies. Chrome 121+ on desktop; macOS is the tested platform.

## Install

1. Unzip the package if needed. Keep the **Flytab** folder somewhere permanent.
2. Open `chrome://extensions`, enable **Developer mode**, choose **Load unpacked**, and select the folder containing `manifest.json`.
3. Pin Flytab from Chrome's Extensions menu if you want the toolbar shortcut.
4. Open `chrome://extensions/shortcuts`. Confirm **Switch to previous tab** is **Option+F** and **Open recent tabs** is **Option+Shift+F** on macOS. If it is blank or conflicts with another shortcut, assign one. Keep its scope **In Chrome**.

After updating, click **Reload** on Flytab's extension card and confirm version **0.2.1**. Existing shortcut assignments are preserved; check the shortcuts page if you previously remapped them. No separate app is needed.

## Use

**Tap Option+F to go straight to the previous tab. Tap it again to return.** It switches on command press with no popup, confirmation, or modifier-release wait. The toolbar icon does the same thing.

| Action | Result |
|---|---|
| Option+F with list closed / toolbar click | Immediately toggles between the two most recent tabs |
| Option+Shift+F | Opens the optional recent-tabs list, selecting the previous tab |
| F / Option+F with list open | Selects the next older entry; repeat to keep browsing |
| Shift+F / Option+Shift+F with list open | Selects the previous entry |
| Arrow keys / mouse wheel | Also browses the list without activating tabs |
| Enter / click an entry | Activates the selected tab and closes the list |
| Esc / Cancel / close window | Cancels the list |
| Release Option | No action; the optional list stays open |

The five-row list scrolls through the full MRU history. The starting tab appears last, labeled Current. A commit focuses the destination window, places the destination first, and puts the source second. Opening another window/app dismisses the list without committing. Open with Option+Shift+F, release Shift, and keep pressing F to browse forward. You may keep Option held or release it. Add Shift to go back. Selection wraps at either end; Enter/click commits it.

Other desktop platforms default to **Alt+Q / Alt+Shift+Q**, avoiding Chrome's Alt+F menu shortcut. Both commands are remappable. “Global MRU” means across Chrome windows, not a system-wide keyboard hook. When the list is closed, repeated Option+F toggles your last two tabs. Once the list is open, repeated F or the primary shortcut browses older entries; the secondary shortcut reverses direction. Plain F/Shift+F remain available if you remap the shortcuts.

## Why quick switching no longer opens a popup

The original prototype tried to commit when Option was released. Quick taps could release Option before Chrome created and focused the popup, leaving it waiting for Enter. This was reproduced in native UI automation and confirmed by physical-keyboard testing from the user.

Version 0.2.0 removes that timing dependency: the main shortcut directly activates the previous tab in the background worker. Quick native macOS shortcut taps passed with both a running worker and a stopped worker that Chrome had to wake. Chrome must still deliver the shortcut, and worker startup can add a brief delay; this is not a measured latency guarantee.

The optional list uses explicit Enter/click confirmation. There is no modifier-release guess, timeout, content-script overlay, or native helper. It is a compact Chrome popup window with an OS title bar. See [TESTING.md](TESTING.md) for evidence and manual checks.

## Privacy and permissions

- **tabs**: open-tab titles/IDs/window IDs and activation events. Chrome may describe this as reading browsing history; Flytab does not use the History API.
- **storage**: `storage.session` holds tab IDs, MRU order, and the open switcher's selection. It survives worker suspension and is cleared when Chrome exits or the extension reloads/disables. Titles, URLs and favicons are read live, not persisted by Flytab.
- **favicon**: reads Chrome's local favicon cache via its own extension URL. Loading remote `favIconUrl` images could make network requests, so Flytab never does that. Missing/internal-page icons use a bundled generic tab icon.

No host permissions, content scripts, History API, analytics, server, account, or external network requests. CSP blocks external connections and images. Commands/action/windows APIs require no separate permission entries. Incognito is disabled in the manifest and filtered defensively.

At startup/installation, Flytab seeds from open tabs sorted by `lastAccessed`, with the focused tab first. That is approximate: Chrome records activation within a window, not the full historical order of window focus, and cannot prove whether an already-open tab was ever visited before installation. New background tabs observed by Flytab stay out until visited. Tabs restored after the initial startup scan may enter only when visited.

## Source and tests

`background.js` owns serialized session state and browser actions; `core.js` holds MRU rules; `early-input.js` captures early keyboard events; `popup.*` implements the switcher. Run `npm test` with Node 20+ for unit tests. Optional isolated-browser tests and remaining manual checks are in [TESTING.md](TESTING.md).

API references: [Commands](https://developer.chrome.com/docs/extensions/reference/api/commands), [Tabs / lastAccessed](https://developer.chrome.com/docs/extensions/reference/api/tabs), [Windows](https://developer.chrome.com/docs/extensions/reference/api/windows), [cached favicons](https://developer.chrome.com/docs/extensions/how-to/ui/favicons).
