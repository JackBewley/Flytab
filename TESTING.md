# Flytab verification

Version **0.2.0**, tested September 29, 2026 on macOS with an isolated **Google Chrome for Testing 151.0.7922.34** profile. The user's ordinary Chrome profile was not modified by these tests.

## Observed native UI behavior

- Chrome accepted the default shortcuts and returned `⌥F` for **Switch to previous tab**, `⌥⇧F` for **Open recent tabs**.
- A quick native UI-automation Option+F chord switched directly from tab B to tab C in another window, with no popup or Enter. A second chord returned to B.
- After explicitly stopping the service worker, a native Option+F chord woke it and switched B to C with no popup.
- A quick Option+Shift+F chord opened the list with B selected. It stayed open after the chord finished. Escape dismissed it, leaving C active.

These are actual macOS shortcut events, separate from the automated controller checks below. They verify the removal of the popup-release dependency; they are not a physical-keyboard success-rate or latency benchmark. Test your preferred key speed and layout using the manual matrix.

## Automated coverage

**11 unit tests and 20 isolated-browser checks passed**, with no popup page errors. Evidence and light/dark/narrow screenshots are in `test-evidence/0.2.0/` locally and excluded from Git/distribution packages.

`npm test` exercises MRU reconstruction, destination/source ordering, immutable preview, wrapping, pruning, incognito exclusion, early Enter buffering, absence of modifier-release handling, Cancel's native Enter behavior, IME safety, and leaving modified shortcuts to Chrome.

`tests/browser.mjs` loads the actual extension in a temporary Chrome profile. Its private test-copy controller invokes commands directly. It checks:

- Immediate cross-window toggles without a popup; six queued commands alternate correctly even with a stale event-tab argument.
- Global MRU, background-created tabs, and closed selected tabs.
- Optional-list selection, arrow/wheel preview without activation, repeated opening preserving selection, Escape/Cancel, native Enter on Cancel, row clicks, and explicit Enter commits.
- Synthetic Option release leaves the list open; the quick command ignores preview selection and dismisses the list.
- Restrictive CSP/incognito configuration, a real worker stop/restart, immediate toggling after restart, narrow layout, and a harmless one-tab no-op.

Run unit tests with Node 20+:

```sh
npm test
```

Run the optional browser suite:

```sh
npm install --no-save playwright-core
CHROME_PATH="/absolute/path/to/Chrome for Testing/executable" node tests/browser.mjs
```

Use Chrome for Testing or Chromium, which accept automated unpacked-extension loading. Set `FLYTAB_EVIDENCE` to a folder for screenshots/results. `PLAYWRIGHT_MODULE` may point to an existing Playwright Core module. The harness adds private controller hooks to a temporary copy containing only runtime files; production files are not changed. It removes its copy and profile afterward. Flytab itself never needs Node, npm, or Playwright.

Light/dark/narrow screenshots were visually reviewed. Screen-reader behavior, minimum Chrome 121, Windows/Linux, and every keyboard layout have not been tested.

## Five-minute manual check

1. Reload Flytab in `chrome://extensions`; verify version 0.2.0. In `chrome://extensions/shortcuts`, confirm **Switch to previous tab** is Option+F and **Open recent tabs** is Option+Shift+F.
2. Open two normal windows. Visit A, B, C, then A. Quickly tap Option+F several times: A and C should alternate, focusing their windows, with no popup or Enter. Repeat after about 35 seconds idle. Toolbar click should behave the same way.
3. From A, tap Option+Shift+F. C should be selected; releasing Option should leave the list open. Browse with arrows or wheel, then Esc: A stays active and C is still first when reopened. Repeat the opening shortcut while browsing: selection stays put.
4. Choose another entry and press Enter, or click it. The destination activates and A becomes the previous tab. Option+F returns to A. While the list is open, preview a different entry and press Option+F: it should toggle to the actual previous tab, ignoring that preview.
5. Create a background tab: it must be absent until activated. Close a listed tab while the list is open: it should disappear. With only one tab, Option+F is a harmless no-op.
6. Check Tab → Cancel → Enter. Click outside or switch apps; this cancels rather than committing. Remap both shortcuts and test them again.
7. Restart/reload Chrome: approximate reconstruction uses `lastAccessed`. Verify incognito cannot be enabled.

## Design decision and limits

The 0.1.0 prototype missed very fast Option releases before the popup received input. Native UI automation reproduced an empty keyboard trace; the user confirmed quick physical taps needed Enter while held releases worked. Version 0.2.0 therefore switches on the primary command press and gives the optional list explicit confirmation. Holding Option and repeatedly pressing F no longer browses older tabs.

- Chrome must receive the command. OS/browser-reserved shortcuts or conflicting extensions can prevent delivery; remap in `chrome://extensions/shortcuts`.
- Service worker startup can add a brief delay but cannot leave the primary command waiting for a key release.
- The optional list has native window chrome. No content-script overlay or separate app is installed.
- Pre-install history and late session-restored background tabs cannot be reconstructed exactly; see README.

Optional list diagnostics: inspect `window.flytabInput.trace` in its DevTools. This contains only recent navigation/confirmation key events in memory and is never transmitted. Opening DevTools can change focus and key routing, so it is unsuitable for timing measurements.
