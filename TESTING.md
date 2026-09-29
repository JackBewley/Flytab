# Flytab verification

Version **0.5.1**, tested September 29, 2026 on macOS with isolated **Google Chrome for Testing 151.0.7922.34** profiles. Tests do not modify the user's ordinary Chrome profile. The approved v0.3.3 icon is unchanged.

## Interaction under test

Option+F immediately toggles the previous tab. For the list, hold Option+Shift and press F, keep both modifiers held while tapping F to advance, then release both to select and close. Shift never reverses direction. Escape cancels while the modifiers are still held.

Pinned Flytab opens a toolbar popup on supported Chrome; unpinned or unavailable action-popup APIs retain the separate window. Both surfaces use the same list and keyboard rules. The toolbar remains an immediate toggle after opening, cancelling, committing, and worker restart.

## Automated coverage

**54 unit tests, 29 native-window browser checks, and 17 pinned-toolbar browser checks passed.** No popup page errors were observed. One initial action-suite run lost its test messaging connection during popup closure; a clean repeat passed all 17 checks without a code change. Results and screenshots are kept locally in `test-evidence/0.5.1/`, excluded from Git and distribution packages. Startup measurements and their limits are in [PERFORMANCE.md](PERFORMANCE.md). Two checks for the removed Cancel button were retired; Escape and outside dismissal remain covered. No input-routing behavior changed. Prior v0.4.1 native-key evidence on Chrome 153 remains documented below.

Both browser suites load the real extension into a temporary copy with private command/input hooks. They exercise production callbacks and DOM handlers; injected events do not establish physical-key delivery reliability.

Shared behavior coverage includes:

- Once open, the popup owns its configured shortcuts and the background command listener is suspended. Modified F advances exactly one step and wraps; preview keeps MRU frozen. Closing restores the normal shortcuts.
- F keyup with Option+Shift still down does not commit. Both modifier-release orders commit only after the last modifier is up, focus the chosen window, and place the source at MRU #2.
- Escape works with modifiers held. Enter, row clicks, arrows, wheel, closed-tab removal, immediate toggling, background-created tabs, and worker restart are covered.
- Existing rows and favicons are reused during selection changes. Buffered early releases wait for data. Escape and focus setup work while the initial response is delayed; a received blur event during loading discards buffered commits (an injected-event check).
- No received release means no timer-based guess. Enter remains a fallback.

The action-popup suite covers unexpected input-Port loss, interruption during a pending commit, safe cancellation after a real worker stop, and restored shortcuts after every closing path. It additionally validates real Chrome sender/context shapes, rejects an ordinary extension tab using the live popup URL/token, recovers from external dismissal, and checks that commits/cancellation never remove the source or destination browser window. The actual popup is 384px wide with a 260px five-row list and no horizontal overflow with a long title; a screenshot was inspected.

Unit coverage includes MRU rules, input buffering/modifier flags, parallel startup sequencing, no-op storage reads, failed opening/query/write cleanup, source closure during opening, simultaneous tab closures, incremental lifecycle updates, unsupported/unpinned fallback, temporary toolbar configuration, and real action-popup identity/focus conventions.

## Native macOS observations and limits

The user reported that v0.4.0’s held/repeated shortcut required Enter despite its passing injected-release tests. Native tracing on Chrome 151 and 153 reproduced the routing problem: opening/repeating the chord invoked browser command callbacks, while the focused popup received no DOM key events. Removing the command listener in a disposable experiment immediately restored trusted modified-F keydown and keyup events. Chromium’s browser accelerator handling suppresses subsequent keyups; injecting a DOM event bypassed that failure.

With v0.4.1 on Chrome 153, the opening used one native command callback, and three subsequent Option+Shift+F presses reached the popup as trusted DOM events and advanced exactly three entries. MRU remained unchanged during preview. The popup retained ownership during a pause longer than 35 seconds. An external app-focus change correctly cancelled it and restored shortcuts.

In a fresh sequence, two modified F presses followed by an unmodified native F press advanced and committed Project notes on key release without Enter. Native Option+F then immediately returned to Source. The full traces and concise before/after proof are saved with the local evidence.

**The automation tool sends complete chords and cannot independently hold/release modifier keys.** Both final modifier-release orders passed injected-event tests after cycling, but continuous physical Option+Shift holding still needs the manual keyboard sequence below. Extremely fast opening taps can release everything before the popup receives input; those events remain unrecoverable. No timer guesses whether modifiers are held.

## Input ownership and recovery

The popup loads Chrome’s configured shortcut strings, accepting macOS glyphs and named modifiers, then claims an authenticated runtime Port. Background command handling pauses only for that live popup. This lets F presses and following modifier releases reach the DOM without duplicate navigation. A local liveness message runs every 20 seconds only while the picker is focused and visible; it never commits or reads physical key state and stops on close.

Commit, cancellation, closing, and connection loss restore global shortcuts. An unexpected worker interruption cancels the open picker; MRU history survives. Tests cover a connection loss during an in-flight commit, failed-commit reclaim, opening failures, stale/disconnected/forged claims, and late callbacks from an older session.

## Run tests

With Node 20+:

```sh
npm test
```

Reproducible development setup and isolated-browser suites (run sequentially):

```sh
npm ci
npm run browser:install
npm run test:all
```

The lockfile pins Playwright Core 1.63.0; `browser:install` installs its Chrome for Testing 153.0.8010.12 (revision 1243). `test:all` runs unit, native-window, pinned-action, and popup DOM/recovery checks sequentially. Use `CHROME_PATH` to test another explicit Chrome for Testing or Chromium executable; record that version with the results. Set `FLYTAB_EVIDENCE` for screenshots/results; `PLAYWRIGHT_MODULE` can point to an existing Playwright Core module. The harnesses copy runtime files, add private hooks to that copy, and remove their temporary copy/profile afterward. The action suite pins only its disposable extension. Flytab has no Node, npm, or Playwright runtime dependency. Packaging uses Python 3’s standard library: `npm run package` validates permissions, icon sizes, matching versions, a fixed 16-file allowlist, and archive contents. Repeating it on unchanged sources produces the same ZIP.

## Manual check

1. Reload Flytab and verify version **0.5.1**. Pin its icon. Confirm Option+F is **Switch to previous tab** and Option+Shift+F is **Open recent tabs** in `chrome://extensions/shortcuts`.
2. Visit tabs in two windows, then quickly tap Option+F several times. Your two most recent tabs should alternate immediately without a popup. Repeat after the extension has been idle.
3. Hold Option+Shift and tap F. The list should open beneath the pinned icon. Keep BOTH modifiers held and tap F several more times. Every tap must move forward; releasing F between taps must leave the list open. Keep cycling to check wrapping.
4. Release Shift while keeping Option held: it should stay open. Release Option: the highlighted tab should activate and the list close. Repeat with Option released first, then Shift. Test left/right Option and Shift keys.
5. Repeat the held sequence, then press Esc before releasing modifiers: it must cancel without activation. Check click/Enter selection, outside-click dismissal, and immediate toolbar toggling afterward. Source browser windows must stay open.
6. Try an extremely fast opening tap. If the list missed the release before focus, Enter/click commits; Esc cancels. Do not infer reliable opening-tap commit from the held-cycle test. Option+F remains the direct-toggle path when Chrome delivers its command.
7. Unpin Flytab and repeat the held sequence in the separate-window fallback. Pin it again for faster opening.
8. Confirm background-created tabs stay absent until visited, closed tabs disappear, and startup approximately reconstructs order using `lastAccessed`. Verify incognito remains unavailable and remapped shortcuts still work.

The action popup and native light/dark/narrow captures were visually reviewed. The panel has a Recent tabs header and position count, two-line title/window rows with 14px titles, and a right-arrow selection indicator. The visible help footer stays removed. The unused hostname formatter and its test were removed with site labels. The native fallback fits five rows without a second page scrollbar. Keyboard instructions remain screen-reader accessible. The v0.5.0 panel received a separate read-only finish review returning ship after checking screenshots, source, and contrast (weakest reviewed text pair 5.39:1). Document screenshots do not establish the appearance of Chrome’s outer native frame. The Impeccable detector could not run because its engine is not installed, so direct review was used. The strict UI source audit reports no findings; DESIGN.md lint reports zero errors (one advisory about using the existing selected token instead of a primary token). Screen-reader behavior, minimum Chrome 121, Windows/Linux, every keyboard layout, and physical hold/release success rates have not been measured. Shortcut conflicts or OS-reserved combinations can prevent command delivery; remap through Chrome if needed.

For local diagnostics, inspect `window.flytabInput.trace` in the popup. It contains recent key events and modifier flags in memory only, never titles/URLs or transmitted data. Opening DevTools may change focus/key routing and is unsuitable for timing measurements.
