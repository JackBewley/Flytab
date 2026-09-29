# Flytab verification

Version **0.2.1**, tested September 29, 2026 on macOS with an isolated **Google Chrome for Testing 151.0.7922.34** profile. The user's ordinary Chrome profile was not modified by these tests.

## Observed native UI behavior

In v0.2.1, using actual macOS shortcut events:

- Option+Shift+F opened the list at its first entry.
- F, then F again, moved forward one row per press. Shift+F moved back one row.
- Option+F advanced one row while keeping the list open. Option+Shift+F reversed one row, with no duplicate navigation.
- Enter committed the selected tab and closed the list. A quick Option+F then immediately returned to the source tab without a popup.

These native UI-automation checks are separate from the controller checks below. They exercise real shortcuts and plain-key input, not synthetic DOM events. Continuous physical modifier holding, keyboard-layout coverage, and latency/success-rate measurements still require manual checks. In v0.2.0, native testing also verified immediate cross-window toggling and a shortcut waking a stopped service worker; v0.2.1 retains automated coverage for those behaviors.

## Automated coverage

**13 unit tests and 22 isolated-browser checks passed**, with no popup page errors. Evidence and light/dark/narrow screenshots are in `test-evidence/0.2.1/` locally and excluded from Git/distribution packages.

`npm test` exercises MRU reconstruction, destination/source ordering, immutable preview, wrapping, pruning, incognito exclusion, early Enter buffering, absence of modifier-release handling, Cancel's native Enter behavior, IME safety, plain/repeated F and Shift+F buffering, and leaving modified F shortcuts to Chrome without duplicate navigation.

`tests/browser.mjs` loads the actual extension in a temporary Chrome profile. Its private test-copy controller invokes commands directly. It checks:

- Immediate cross-window toggles without a popup; six queued commands alternate correctly even with a stale event-tab argument.
- Global MRU, background-created tabs, and closed selected tabs.
- Optional-list selection, repeated F/Shift+F and arrow/wheel preview without activation, forward/reverse command navigation and wrapping, Escape/Cancel, native Enter on Cancel, row clicks, and explicit Enter commits.
- Synthetic Option release leaves the list open; modified F is ignored by the popup input path so Chrome commands advance exactly once.
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

Light/dark/narrow screenshots were visually reviewed. An initial browser run failed at the timing-sensitive initial window-focus setup assertion, before command checks; the unchanged suite passed on rerun. Screen-reader behavior, minimum Chrome 121, Windows/Linux, and every keyboard layout have not been tested.

## Five-minute manual check

1. Reload Flytab in `chrome://extensions`; verify version 0.2.1. In `chrome://extensions/shortcuts`, confirm **Switch to previous tab** is Option+F and **Open recent tabs** is Option+Shift+F.
2. Open two normal windows. Visit A, B, C, then A. Quickly tap Option+F several times: A and C should alternate, focusing their windows, with no popup or Enter. Repeat after about 35 seconds idle. Toolbar click should behave the same way.
3. From A, tap Option+Shift+F. C should be selected; releasing Option should leave the list open. Release Shift and keep tapping F: selection should advance one row per press. Test with Option held and released, then add Shift to move back. Both directions wrap. Arrows/wheel still work. Press Esc: A stays active and C is still first when reopened.
4. Choose another entry and press Enter, or click it. The destination activates and A becomes the previous tab. Option+F returns to A. Reopen the list and press Option+F: it should now advance the preview, leaving the list open. Option+Shift+F moves back. Confirm each chord moves exactly one entry.
5. Create a background tab: it must be absent until activated. Close a listed tab while the list is open: it should disappear. With only one tab, Option+F is a harmless no-op.
6. Check Tab → Cancel → Enter. Click outside or switch apps; this cancels rather than committing. Remap both shortcuts and test them again.
7. Restart/reload Chrome: approximate reconstruction uses `lastAccessed`. Verify incognito cannot be enabled.

## Design decision and limits

The 0.1.0 prototype missed very fast Option releases before the popup received input. Native UI automation reproduced an empty keyboard trace; the user confirmed quick physical taps needed Enter while held releases worked. Version 0.2.0 therefore switches on the primary command press and gives the optional list explicit confirmation. Version 0.2.1 restores repeated F and Shift+F browsing within the separately opened list, with or without Option. Outside the list, Option+F remains the immediate toggle.

- Chrome must receive the command. OS/browser-reserved shortcuts or conflicting extensions can prevent delivery; remap in `chrome://extensions/shortcuts`.
- Service worker startup can add a brief delay but cannot leave the primary command waiting for a key release.
- The optional list has native window chrome. No content-script overlay or separate app is installed.
- Pre-install history and late session-restored background tabs cannot be reconstructed exactly; see README.

Optional list diagnostics: inspect `window.flytabInput.trace` in its DevTools. This contains only recent navigation/confirmation key events in memory and is never transmitted. Opening DevTools can change focus and key routing, so it is unsuitable for timing measurements.
