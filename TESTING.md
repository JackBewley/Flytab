# Flytab verification

Version **0.4.0**, tested September 29, 2026 on macOS with isolated **Google Chrome for Testing 151.0.7922.34** profiles. Tests do not modify the user's ordinary Chrome profile. The approved v0.3.3 icon is unchanged.

## Interaction under test

Option+F immediately toggles the previous tab. For the list, hold Option+Shift and press F, keep both modifiers held while tapping F to advance, then release both to select and close. Shift never reverses direction. Escape cancels while the modifiers are still held.

Pinned Flytab opens a toolbar popup on supported Chrome; unpinned or unavailable action-popup APIs retain the separate window. Both surfaces use the same list and keyboard rules. The toolbar remains an immediate toggle after opening, cancelling, committing, and worker restart.

## Automated coverage

**38 unit tests, 31 native-window browser checks, and 15 pinned-toolbar browser checks passed.** No popup page errors were observed. Results and screenshots are kept locally in `test-evidence/0.4.0/`, excluded from Git and distribution packages. Startup measurements and their limits are in [PERFORMANCE.md](PERFORMANCE.md).

Both browser suites load the real extension into a temporary copy with private command/input hooks. They exercise production callbacks and DOM handlers; injected events do not establish physical-key delivery reliability.

Shared behavior coverage includes:

- Repeated opening commands advance one step and wrap; modified F is not counted twice. Preview keeps MRU frozen.
- F keyup with Option+Shift still down does not commit. Both modifier-release orders commit only after the last modifier is up, focus the chosen window, and place the source at MRU #2.
- Escape works with modifiers held. Cancel, Enter, row clicks, arrows, wheel, closed-tab removal, immediate toggling, background-created tabs, and worker restart are covered.
- Existing rows and favicons are reused during selection changes. Buffered early releases wait for data. Escape and focus setup work while the initial response is delayed; a received blur event during loading discards buffered commits (an injected-event check).
- No received release means no timer-based guess. Enter remains a fallback.

The action-popup suite additionally validates real Chrome sender/context shapes, rejects an ordinary extension tab using the live popup URL/token, recovers from external dismissal, and checks that commits/cancellation never remove the source or destination browser window. The actual popup is 440px wide with a 240px five-row list and no horizontal overflow with a long title; a screenshot was inspected.

Unit coverage includes MRU rules, input buffering/modifier flags, parallel startup sequencing, no-op storage reads, failed opening/query/write cleanup, source closure during opening, simultaneous tab closures, incremental lifecycle updates, unsupported/unpinned fallback, temporary toolbar configuration, and real action-popup identity/focus conventions.

## Native macOS observations and limits

The following physical-routing observations are retained from v0.3.0. The v0.4.0 suites above use synthetic input; they are not new physical held-key measurements.

The native UI-automation shortcut opened the list with C selected from source B. Repeating Option+Shift+F advanced to A, confirming Shift no longer reverses. The popup's captured DOM event trace remained empty for these automated modified chords, so **that native test did not verify release-to-commit**. The automation API sends complete chords and does not provide independent physical modifier hold/release controls.

An unmodified native F press advanced one more entry and its release committed without Enter. A subsequent native Option+F immediately returned to B. This verifies an actual unmodified key-release commit and the primary toggle, but does not establish continuous physical Option+Shift holding.

The full held-modifier interaction and both release orders passed injected-event browser tests. The manual sequence below is still needed on the user's keyboard. Extremely fast opening taps can release everything before Chrome creates/focuses the popup; those events cannot be recovered. This was observed in the original prototype and confirmed by the user's physical-keyboard test. No timer guesses whether keys are held.

## Run tests

With Node 20+:

```sh
npm test
```

Optional isolated-browser suites, run sequentially:

```sh
npm install --no-save --no-package-lock playwright-core
CHROME_PATH="/absolute/path/to/Chrome for Testing/executable" node tests/browser.mjs
CHROME_PATH="/absolute/path/to/Chrome for Testing/executable" node tests/action-popup.mjs
```

Use Chrome for Testing or Chromium, which accept automated unpacked-extension loading. Set `FLYTAB_EVIDENCE` for screenshots/results; `PLAYWRIGHT_MODULE` can point to an existing Playwright Core module. The harnesses copy runtime files, add private hooks to that copy, and remove their temporary copy/profile afterward. The action suite pins only its disposable extension. Flytab has no Node, npm, or Playwright runtime dependency.

## Manual check

1. Reload Flytab and verify version **0.4.0**. Pin its icon. Confirm Option+F is **Switch to previous tab** and Option+Shift+F is **Open recent tabs** in `chrome://extensions/shortcuts`.
2. Visit tabs in two windows, then quickly tap Option+F several times. Your two most recent tabs should alternate immediately without a popup. Repeat after the extension has been idle.
3. Hold Option+Shift and tap F. The list should open beneath the pinned icon. Keep BOTH modifiers held and tap F several more times. Every tap must move forward; releasing F between taps must leave the list open. Keep cycling to check wrapping.
4. Release Shift while keeping Option held: it should stay open. Release Option: the highlighted tab should activate and the list close. Repeat with Option released first, then Shift. Test left/right Option and Shift keys.
5. Repeat the held sequence, then press Esc before releasing modifiers: it must cancel without activation. Check click/Enter selection, outside-click dismissal, and immediate toolbar toggling afterward. Source browser windows must stay open.
6. Try an extremely fast opening tap. If the list missed the release before focus, Enter/click commits; Esc cancels. Do not infer reliable opening-tap commit from the held-cycle test. Option+F remains the direct-toggle path when Chrome delivers its command.
7. Unpin Flytab and repeat the held sequence in the separate-window fallback. Pin it again for faster opening.
8. Confirm background-created tabs stay absent until visited, closed tabs disappear, and startup approximately reconstructs order using `lastAccessed`. Verify incognito remains unavailable and remapped shortcuts still work.

The action popup and native light/dark/narrow captures were visually reviewed. Screen-reader behavior, minimum Chrome 121, Windows/Linux, every keyboard layout, and physical hold/release success rates have not been measured. Shortcut conflicts or OS-reserved combinations can prevent command delivery; remap through Chrome if needed.

For local diagnostics, inspect `window.flytabInput.trace` in the popup. It contains recent key events and modifier flags in memory only, never titles/URLs or transmitted data. Opening DevTools may change focus/key routing and is unsuitable for timing measurements.
