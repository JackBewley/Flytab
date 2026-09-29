# Flytab verification

Icon refinement **0.3.3**: enlarged the frame to 22×19 on a 24-unit canvas, increased the stroke to 1.8 units, and darkened it to #444746. The shallower tab strip and 6-unit arrowhead leave more clear space around the arrow. All four PNG dimensions/transparency were checked; a before/after size comparison is saved in `test-evidence/0.3.3/`. Loaded v0.3.3 in isolated Chrome 151, pinned its icon, inspected it alongside the navigation controls, and opened the switcher to check the matching header. These were asset/UI smoke checks; the full behavior suite was not repeated for this artwork-only edit. The latest full browser run passed all 28 checks in v0.3.1; the behavior and native-keyboard evidence below remains the unchanged v0.3.0 baseline.

Version **0.3.0**, tested September 29, 2026 on macOS with isolated **Google Chrome for Testing 151.0.7922.34** profiles. Tests do not modify the user's ordinary Chrome profile.

## Interaction under test

Option+F immediately toggles the previous tab. For the list, hold Option+Shift and press F, keep both modifiers held while tapping F to advance, then release both to select and close. Shift never reverses direction. Escape cancels while the modifiers are still held.

## Automated coverage

**15 unit tests and 28 isolated-browser checks passed**, with no popup page errors. Results and light/dark/narrow captures are in `test-evidence/0.3.0/` locally and excluded from Git/distribution packages.

The browser suite loads the real extension into a temporary copy with private command hooks. Command invocations and injected DOM events test the exact sequence without claiming physical-key delivery:

- Repeated opening-command invocations advance one step and wrap. Modified F is not counted twice by the popup.
- F keyup with Option+Shift still down leaves the list open and MRU unchanged.
- Releasing Shift first leaves it open until Option is released. Releasing Option first leaves it open until Shift is released. Both final releases commit and focus the destination window.
- Release after several forward steps commits the last highlighted tab and makes the source MRU #2.
- A release received before the UI module loads is buffered and commits after initialization. The test delays the module while the synchronous listener runs.
- No received release means no timer-based guess; Enter remains a working fallback.
- Escape cancels with modifiers held. Cancel's native Enter behavior, row clicks, arrows, wheel, closed-tab removal, and layout remain covered.
- Immediate toggling across windows, six queued toggles, background-created tabs, one-tab no-op, restrictive CSP/incognito settings, and a real worker stop/restart remain covered.

Unit tests cover MRU rules, release-event buffering and modifier flags, F/Shift+F normalization, duplicate-input prevention, held-modifier Escape, native Cancel activation, composition, and ignored unrelated key releases.

## Native macOS observations and limits

The native UI-automation shortcut opened the list with C selected from source B. Repeating Option+Shift+F advanced to A, confirming Shift no longer reverses. The popup's captured DOM event trace remained empty for these automated modified chords, so **that native test did not verify release-to-commit**. The automation API sends complete chords and does not provide independent physical modifier hold/release controls.

An unmodified native F press advanced one more entry and its release committed without Enter. A subsequent native Option+F immediately returned to B. This verifies an actual unmodified key-release commit and the primary toggle, but does not establish continuous physical Option+Shift holding.

The full held-modifier interaction and both release orders passed injected-event browser tests. The manual sequence below is still needed on the user's keyboard. Extremely fast opening taps can release everything before Chrome creates/focuses the popup; those events cannot be recovered. This was observed in the original prototype and confirmed by the user's physical-keyboard test. No timer guesses whether keys are held.

## Run tests

With Node 20+:

```sh
npm test
```

Optional isolated browser suite:

```sh
npm install --no-save playwright-core
CHROME_PATH="/absolute/path/to/Chrome for Testing/executable" node tests/browser.mjs
```

Use Chrome for Testing or Chromium, which accept automated unpacked-extension loading. Set `FLYTAB_EVIDENCE` for screenshots/results; `PLAYWRIGHT_MODULE` can point to an existing Playwright Core module. The harness copies only runtime files, adds private hooks to that copy, and removes its temporary copy/profile afterward. Flytab has no Node, npm, or Playwright runtime dependency.

## Manual check

1. Reload Flytab and verify version 0.3.3. Confirm Option+F is **Switch to previous tab** and Option+Shift+F is **Open recent tabs** in `chrome://extensions/shortcuts`.
2. Visit tabs in two windows, then quickly tap Option+F several times. Your two most recent tabs should alternate immediately without a popup. Repeat after the extension has been idle.
3. Hold Option+Shift and tap F. Once the list is visible, keep BOTH modifiers held and tap F several more times. Every tap must move forward; releasing F between taps must leave the list open. Keep cycling to check wrapping.
4. Release Shift while keeping Option held: it should stay open. Release Option: the highlighted tab should activate and the list close. Repeat with Option released first, then Shift. Test left/right Option and Shift keys.
5. Repeat the held sequence, then press Esc before releasing modifiers: it must cancel without activation. Check click/Enter selection and toolbar toggling as alternatives.
6. Try an extremely fast opening tap. If the list missed the release before focus, Enter/click commits; Esc cancels. Do not infer reliable opening-tap commit from the held-cycle test. Option+F remains the reliable direct-toggle path when Chrome delivers its command.
7. Confirm background-created tabs stay absent until visited, closed tabs disappear, and startup approximately reconstructs order using `lastAccessed`. Verify incognito remains unavailable and remapped shortcuts still work.

The screenshots were reviewed at normal and narrow widths. Screen-reader behavior, minimum Chrome 121, Windows/Linux, every keyboard layout, and physical hold/release success rates have not been measured. Shortcut conflicts or OS-reserved combinations can prevent command delivery; remap through Chrome if needed.

For local diagnostics, inspect `window.flytabInput.trace` in the popup. It contains recent key events and modifier flags in memory only, never titles/URLs or transmitted data. Opening DevTools may change focus/key routing and is unsuitable for timing measurements.
