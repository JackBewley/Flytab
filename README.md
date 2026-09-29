# Flytab

Jump straight back to the Chrome tab you were just on, across windows. A minimal Manifest V3 extension with no build step or runtime dependencies. Chrome 121+ on desktop; macOS is the tested platform.

## Install

1. Unzip the package if needed. Keep the **Flytab** folder somewhere permanent.
2. Open `chrome://extensions`, enable **Developer mode**, choose **Load unpacked**, and select the folder containing `manifest.json`.
3. **Pin Flytab** from Chrome's Extensions menu for the fastest switcher opening and the toolbar shortcut.
4. Open `chrome://extensions/shortcuts`. Confirm **Switch to previous tab** is **Option+F** and **Open recent tabs** is **Option+Shift+F** on macOS. If it is blank or conflicts with another shortcut, assign one. Keep its scope **In Chrome**.

After updating, click **Reload** on Flytab's extension card and confirm version **0.4.0**. Existing shortcut assignments are preserved; check the shortcuts page if you previously remapped them. No separate app is needed.

## Use

**Tap Option+F to go straight to the previous tab. Tap it again to return.** This action and the toolbar button switch immediately, with no popup or release wait.

To choose an older tab:

1. Hold **Option+Shift**, then press **F** to open the list with your previous tab selected.
2. Keep **both Option and Shift held**. Tap **F** again for each older entry.
3. Release **Option and Shift** to activate the highlighted tab and close the list.

Shift is part of the opening shortcut; it never reverses direction. Releasing F between taps does not commit while a modifier remains held. Releasing just one modifier also leaves the list open; the last modifier release commits.

| Action | Result |
|---|---|
| Option+F with list closed / toolbar click | Immediately toggles the two most recent tabs |
| Option+Shift+F with list closed | Opens the list, selecting the previous tab |
| Repeat Option+Shift+F while list is open | Moves forward through older entries, wrapping at the end |
| Release both Option and Shift | Activates the highlighted tab and closes the list |
| Esc / Cancel / close window | Cancels, including Esc while holding the shortcut |
| Enter / click an entry | Also activates it; available if Chrome misses the release |
| Mouse wheel / unmodified arrow keys | Browses the list; Up or scrolling up moves back |

The five-row list scrolls through the full MRU history, with the starting tab last, labeled Current. Preview never activates a tab or changes MRU. A commit focuses the destination window, puts the destination first, and puts the source second. Switching to another window/app cancels the list.

Both registered shortcuts move forward while the list is open. Plain F and Shift+F also move forward; releasing F when no modifiers are held commits. Other desktop platforms default to **Alt+Q / Alt+Shift+Q** to avoid Chrome's menu shortcut. Commands remain remappable: hold your configured modifiers while repeating the list shortcut, then release them to select. “Global MRU” means across Chrome windows, not a system-wide keyboard hook.

## Chrome's release-event limit

The popup captures releases as its first synchronous script and buffers them while the rest of its UI loads. It checks the actual modifier flags on release events instead of guessing with a timeout. Once the list is open and receiving keys, the intended interaction is hold, cycle, release to select.

**If you release the entire opening shortcut before Chrome creates/focuses the popup, Chrome can still miss that release.** The list then remains open for Enter/click or another received release. A shortcut invocation does not include the current physical key state, and the extension cannot replay events that happened before its window received input. This was reproduced in the original prototype and confirmed by the user's physical-keyboard testing. Use Option+F for an immediate previous-tab tap; the visual shortcut is for holding while choosing.

When Flytab is pinned in a supported Chrome version (127+), the list opens beneath its toolbar icon. An unpinned icon or unavailable toolbar-popup API uses the separate compact window. Both surfaces have the same keyboard behavior. Faster opening narrows the opportunity to miss a release; it cannot recover a release that already happened. No separate helper app, persistent hidden window, content scripts, or release-guessing timer is used. [TESTING.md](TESTING.md) distinguishes synthetic release checks from native shortcut observations.

## Privacy and permissions

- **tabs**: open-tab titles/IDs/window IDs and activation events. Chrome may describe this as reading browsing history; Flytab does not use the History API.
- **storage**: `storage.session` holds tab IDs, MRU order, and the open switcher's selection. It survives worker suspension and is cleared when Chrome exits or the extension reloads/disables. The popup’s document ID may also be held for sender validation. Titles, URLs and favicons are read live, not persisted by Flytab.
- **favicon**: reads Chrome's local favicon cache via its own extension URL. Loading remote `favIconUrl` images could make network requests, so Flytab never does that. Missing/internal-page icons use a bundled generic tab icon.

No host permissions, content scripts, History API, analytics, server, account, or external network requests. CSP blocks external connections and images. Commands/action/windows APIs require no separate permission entries. Incognito is disabled in the manifest and filtered defensively.

At startup/installation, Flytab seeds from open tabs sorted by `lastAccessed`, with the focused tab first. That is approximate: Chrome records activation within a window, not the full historical order of window focus, and cannot prove whether an already-open tab was ever visited before installation. New background tabs observed by Flytab stay out until visited. Tabs restored after the initial startup scan may enter only when visited.

## Source and tests

`background.js` owns serialized session state and browser actions; `core.js` holds MRU rules; `early-input.js` captures early keyboard events; `popup.*` implements the switcher. Run `npm test` with Node 20+ for unit tests. Optional isolated-browser tests and remaining manual checks are in [TESTING.md](TESTING.md). Startup measurements and implementation tradeoffs are in [PERFORMANCE.md](PERFORMANCE.md).

API references: [Commands](https://developer.chrome.com/docs/extensions/reference/api/commands), [Tabs / lastAccessed](https://developer.chrome.com/docs/extensions/reference/api/tabs), [Windows](https://developer.chrome.com/docs/extensions/reference/api/windows), [cached favicons](https://developer.chrome.com/docs/extensions/how-to/ui/favicons).

The icon source is `icons/icon.svg`. Chrome uses the bundled 16/32/48/128px PNGs. To regenerate them for development, run `python3 scripts/render-icons.py` with Pillow installed; the extension needs no image-rendering dependency.
