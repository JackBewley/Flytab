# Flytab verification

Tested September 29, 2026 on macOS, using an isolated **Google Chrome for Testing 151.0.7922.34** profile. The user's ordinary Chrome profile was not modified.

## Observed native UI behavior

- Manifest accepted `Alt+F` and `Alt+Shift+F`; Chrome returned the bindings as `⌥F` and `⌥⇧F`.
- Native UI-automation Option+F opened the real extension window, selecting the previous MRU tab.
- Repeated Option+F advanced exactly one entry. Option+Shift+F reversed it.
- Down then Enter activated the chosen tab. Clicking Flytab in Chrome's Extensions menu immediately returned to the previous tab without a popup.
- A quick native UI-automation chord left the popup open with **zero received DOM keyboard events**, demonstrating the missed-release path. The tool cannot independently hold/release a modifier, so this is not a physical-keyboard latency benchmark or a success-rate measurement.

## Automated coverage

Final result: **11 unit tests and 15 isolated-browser checks passed**, with no popup page errors.

`npm test` exercises reconstruction, commit/source ordering, immutable preview, wrapping, pruning, incognito exclusion, macOS symbol-form bindings, early release buffering, missing-release behavior, Cancel's native Enter behavior, and IME safety.

`tests/browser.mjs` uses the actual extension in a temporary, isolated Chrome profile. It tests global window MRU, background-created tabs, forward/reverse navigation, unchanged MRU during preview, Esc and Cancel, received synthetic Alt release, Enter fallback, cross-window focus/source ordering, closed selected tabs, row clicks, wheel navigation, restrictive CSP/incognito declaration, a real worker stop/restart, and narrow popup layout. It records browser version/results and optional screenshots. Synthetic release injection proves the handler and real tab commit, **not OS delivery of a physical keyup**.

Run the optional browser suite:

```sh
npm install --no-save playwright-core
CHROME_PATH="/absolute/path/to/Chrome for Testing/executable" node tests/browser.mjs
```

Use Chrome for Testing or Chromium, which accept automated unpacked-extension loading. Set `FLYTAB_EVIDENCE` to a folder to save screenshots/results. `PLAYWRIGHT_MODULE` may point to an existing Playwright Core module. The harness creates and removes a temporary copy with private controller test hooks; production files are not changed. The extension itself never needs Node, npm, or Playwright.

Light/dark screenshots were visually reviewed. The single static UI-audit finding is a false positive: its button scanner recognizes inline handlers only; extension CSP forbids those. Cancel uses an external `addEventListener`, verified by browser tests. Design-token lint returned zero errors. Screen-reader behavior, minimum Chrome 121, Windows/Linux, and every keyboard layout have not been tested.

## Five-minute manual check

1. Open two normal windows. Visit A, B, C, then A. Toolbar click should toggle A ↔ C across windows if necessary.
2. Open switcher from A. C should be first/selected. Browse several entries, reverse, then Esc. A stays active; reopen and C is still first.
3. Hold Option, tap F, wait until the list appears, release F while keeping Option held, then press F several times. Release Option. Confirm the selected tab activates. Test right Option as well.
4. Try very fast taps repeatedly, both with a warm worker and after about 35 seconds idle. Record whether automatic commit happened or Enter was needed. **Do not assume fast taps are reliable.**
5. Open a tab in the background: it must be absent until activated. Close a listed tab while the popup is open: it should disappear. Click a different entry and verify destination/source order afterward.
6. Use arrows, wheel, click, Esc, Tab → Cancel → Enter. Click outside or switch apps; this cancels rather than committing.
7. Reload/restart Chrome: approximate reconstruction uses `lastAccessed`. Verify incognito cannot be enabled. Remap both shortcuts and test them again.

Optional diagnostics: inspect the popup and evaluate `window.flytabInput.trace`. This contains only recent keyboard events and relative timings, lives in memory, and is never transmitted. Opening DevTools can itself change focus and key routing; it is not suitable for timing measurements.

## Known limits

- A key release delivered before the popup exists or receives focus cannot be recovered with these permissions/APIs.
- OS/browser-reserved shortcuts and other extensions can prevent command delivery. Remap in `chrome://extensions/shortcuts`.
- The popup has native window chrome. No content-script overlay or native helper is installed.
- Pre-install history and late session-restored background tabs cannot be reconstructed exactly; see README.
