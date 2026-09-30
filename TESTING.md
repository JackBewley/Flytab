# Flytab verification

## v0.6.5 refresh-on-open

71 unit, 19 pinned-action, 8 popup DOM/recovery, 6 settings and 7 appearance/lifecycle checks passed (111 total). Real setIcon calls occur after list rendering and authenticated input ownership. Light/dark appearance refreshes when settings opens or regains focus; a theme change alone does no work. No offscreen permission/document or polling remains, and closing the UI then stopping the worker leaves no extension target. Cosmetic failures retry on a later opening without affecting settings. Existing held-F, release, cancellation, toolbar, cross-window/MRU and worker-loss checks passed. Run `npm run test:theme` for the focused appearance suite; `npm run test:all` now includes it.

Two balanced native speed pairs at 8/120 tabs show about 1–2 ms slower quick toggles and 0.5–4.2 ms slower opening, with comparable navigation. See PERFORMANCE.md for exact medians, prior memory evidence and limitations. No 1,000-tab run, full native-fallback rerun or physical-keyboard retest was performed. Reload version **0.6.5** in Chrome. Open the switcher/settings to refresh the icon; change device appearance and reopen to confirm the other clean variant. The icon can remain stale between openings or after a popup closes before idle work runs. Existing shortcut assignments and list behavior are preserved.

## v0.6.4 allocation and native speed checks

69 unit, 18 pinned-action and 31 native-fallback checks passed (118 total). The new quick-toggle path covers closed/ineligible destinations, missing history, source changes, failed activation and toolbar use; real browser checks cover cross-window focus and worker restart. Balanced native measurements at 8/120 tabs show about 16% lower quick-toggle medians at 120 tabs and comparable small-history performance. Separate diagnostics reduce healthy-toggle metadata from about 100 KiB to under 1 KiB at 120 tabs. No full/1,000-tab suite was run. Native focus timing is now verified; physical held-key events are not remeasured. Appearance code is unchanged. See PERFORMANCE.md for the complete methods and the unchanged resident-icon memory cost.

## v0.6.3 automatic appearance check

62 unit checks, 5 focused real offscreen/appearance checks, and 6 settings checks passed on Chrome for Testing 153. Offscreen setup is deduplicated; emulated dark/light changes update the real action icon; the document survives worker suspension and wakes the worker on a subsequent change. Unchanged local checks leave the worker stopped. The clean variants and settings header were visually reviewed. Two paired physical-footprint measurements show about 22–23 MiB additional memory. Headless speed comparisons found no slowdown; see PERFORMANCE.md for raw counts, medians and limits. Native foreground benchmarks could not run because the Mac was locked, so physical shortcut/focus timing is not newly verified. No 1,000-tab test was run.

## v0.6.2 settings and icon check

All 60 unit checks and 6 focused settings checks passed. The settings suite loads the real extension in headless Chrome 153, compares displayed assignments with commands.getAll, and opens the real Chrome shortcut editor. Controlled page-only mocks cover returning after a remap, unassigned commands, failed reads/retry, and failed editor launch. Light/dark screenshots and narrow layouts were checked; the static icon was visually compared on white and dark-gray backgrounds. Background, early-input, popup JavaScript and popup CSS are unchanged from v0.6.1, so settings introduce no work into their paths. No performance benchmark or full native chord suite was run.

Run `npm run test:options` for the small settings suite. Evidence is in `test-evidence/0.6.2`. The strict UI scanner reports two actionless-button findings: reviewed false positives because it only recognizes inline handlers, which extension CSP disallows. Both buttons use external options.js listeners, verified by real-browser interaction/recovery tests. No inline handlers were added to appease the scanner.

## v0.6.1 focused UI check

Current tab now stays in the first row, with the previous tab initially selected in the second row; a single-tab list selects its only row. Titles are 13px. All 60 unit checks and 8 real-Chromium DOM/layout checks passed, including initial current/selected placement, enlarged text, navigation, and error recovery. The initial popup screenshot was inspected. The strict UI audit is clean. The small native action suite could not establish its fixture MRU on Chrome 153 (two attempts) or Chrome 151 (one attempt): history contained only the initial tab before Flytab opened. Those runs do not validate native interaction for this revision. No large-history benchmarks or full browser suite were run, per the user’s requested scope. Reload and review the small UI change before the later full test pass.

## v0.6.0 release verification

Version **0.6.0**, tested September 29, 2026 on macOS 26.6.2 with isolated **Google Chrome for Testing 153.0.8010.12** profiles. Comparative speed measurements use Chrome 151.0.7922.34 on both versions. Tests do not modify the user's ordinary Chrome profile. The approved v0.3.3 icon is unchanged.

## Interaction under test

Option+F immediately toggles the previous tab. For the list, hold Option+Shift and press F, keep both modifiers held while tapping F to advance, then release both to select and close. Shift never reverses direction. Escape cancels while the modifiers are still held.

Pinned Flytab opens a toolbar popup on supported Chrome; unpinned or unavailable action-popup APIs retain the separate window. Both surfaces use the same list and keyboard rules. The toolbar remains an immediate toggle after opening, cancelling, committing, and worker restart.

## Automated coverage

**59 unit tests, 31 native-window browser checks, 18 pinned-toolbar browser checks, and 8 popup DOM/recovery checks passed (116 total).** The eight DOM checks also passed with Chrome’s actual minimum-font size set to 24px. No page errors were observed. Evidence is local under `test-evidence/0.6.0/`, excluded from Git and distribution. This includes real 200% browser zoom in the native fallback, both-surface Home/End navigation, transient error recovery, unchanged normal row geometry, forced colors, narrow layouts, text enlargement, and accessible names.

The DOM/recovery suite runs real Chromium against production HTML/CSS/JS with mocked extension messaging for controlled failures. It does not prove native accelerator routing. The extension suites exercise real APIs using private hooks only in disposable source copies. Native input and VoiceOver observations below supplement them.

The previous v0.5.1 baseline had 54 unit, 29 native-window, and 17 action-popup checks. One historical action-suite run lost its response during closure; a clean repeat passed without a source change. The v0.6.0 full run passed without a retry.

Both browser suites load the real extension into a temporary copy with private command/input hooks. They exercise production callbacks and DOM handlers; injected events do not establish physical-key delivery reliability.

Shared behavior coverage includes:

- Once open, the popup owns its configured shortcuts and the background command listener is suspended. Modified F advances exactly one step and wraps; preview keeps MRU frozen. Closing restores the normal shortcuts.
- F keyup with Option+Shift still down does not commit. Both modifier-release orders commit only after the last modifier is up, focus the chosen window, and place the source at MRU #2.
- Escape works with modifiers held. Enter, row clicks, arrows, wheel, closed-tab removal, immediate toggling, background-created tabs, and worker restart are covered.
- Existing rows and favicons are reused during selection changes. Buffered early releases wait for data. Escape and focus setup work while the initial response is delayed; a received blur event during loading discards buffered commits (an injected-event check).
- No received release means no timer-based guess. Enter remains a fallback.

The action-popup suite covers unexpected input-Port loss, interruption during a pending commit, safe cancellation after a real worker stop, and restored shortcuts after every closing path. It additionally validates real Chrome sender/context shapes, rejects an ordinary extension tab using the live popup URL/token, recovers from external dismissal, and checks that commits/cancellation never remove the source or destination browser window. The actual popup is 384px wide with a 260px five-row list and no horizontal overflow with a long title; a screenshot was inspected.

Unit coverage includes MRU rules, input buffering/modifier flags, parallel startup sequencing, no-op storage reads, failed opening/query/write cleanup, source closure during opening, simultaneous tab closures, incremental lifecycle updates, unsupported/unpinned fallback, temporary toolbar configuration, and real action-popup identity/focus conventions.

## v0.6.0 native input and VoiceOver smoke check

VoiceOver was initially off, temporarily enabled through System Settings, and restored off after checking each surface. In both the pinned popup and unpinned fallback, native Control+Option+Right and Control+Option+Shift+Down were consumed by VoiceOver: no corresponding DOM input reached Flytab, the popup stayed open, and MRU stayed frozen. Plain ArrowDown changed selection once; Escape cancelled and returned to the source. The audit’s suspected VoiceOver interference did not reproduce in this bounded check, so modifier-release handling remains unchanged. This does not establish every VoiceOver mode or spoken-announcement quality.

Native Option+F switched Source → Other window → Source without a popup. Option+Shift+F opened the list and a subsequent modified F advanced once. An unmodified native F then advanced and committed Project notes; the source became MRU #2. Native automation delivers complete chords but does not independently release modifiers: trace showed F keydown/keyup with modifiers still true. Continuous human hold/release reliability is therefore not newly proven by this test.

Repeatable disposable fixtures: `FLYTAB_NATIVE_CHECK=1 node tests/action-popup.mjs` or `FLYTAB_NATIVE_CHECK=1 node tests/browser.mjs`. The terminal accepts `open`, `inspect`, `trace`, and `quit`. These hooks are development-only.

## Minimum Chrome version

The manifest still targets Chrome 121. The official mac-arm64 Chrome for Testing 121.0.6167.184 download was attempted on macOS 26.6.2; the application exited with SIGSEGV during launch, before extension checks. This is a test-environment limitation, not a demonstrated Flytab failure or a verified 121 pass. The native fallback is covered on Chrome 153; policy-restricted/unavailable action APIs are covered in unit tests. Verifying 121 on a compatible test host remains outstanding. No compatibility floor was raised just to bypass the test.

## Earlier native macOS observations and limits

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

The lockfile pins Playwright Core 1.63.0; `browser:install` installs its Chrome for Testing 153.0.8010.12 (revision 1243). `test:all` runs unit, native-window, pinned-action, popup DOM/recovery, and settings checks sequentially. Use `CHROME_PATH` to test another explicit Chrome for Testing or Chromium executable; record that version with the results. Set `FLYTAB_EVIDENCE` for screenshots/results; `PLAYWRIGHT_MODULE` can point to an existing Playwright Core module. The harnesses copy runtime files, add private hooks to that copy, and remove their temporary copy/profile afterward. The action suite pins only its disposable extension. Flytab has no Node, npm, or Playwright runtime dependency. Packaging uses Python 3’s standard library: `npm run package` validates permissions, icon sizes, matching versions, a fixed 25-file allowlist, and archive contents. Repeating it on unchanged sources produces the same ZIP.

## Manual check

1. Reload Flytab and verify version **0.6.4**. Pin its icon. Confirm Option+F is **Switch to previous tab** and Option+Shift+F is **Open recent tabs** in `chrome://extensions/shortcuts`.
2. Visit tabs in two windows, then quickly tap Option+F several times. Your two most recent tabs should alternate immediately without a popup. Repeat after the extension has been idle.
3. Hold Option+Shift and tap F. The list should open beneath the pinned icon. Keep BOTH modifiers held and tap F several more times. Every tap must move forward; releasing F between taps must leave the list open. Keep cycling to check wrapping.
4. Release Shift while keeping Option held: it should stay open. Release Option: the highlighted tab should activate and the list close. Repeat with Option released first, then Shift. Test left/right Option and Shift keys.
5. Repeat the held sequence, then press Esc before releasing modifiers: it must cancel without activation. Check click/Enter selection, outside-click dismissal, and immediate toolbar toggling afterward. Source browser windows must stay open.
6. Try an extremely fast opening tap. If the list missed the release before focus, Enter/click commits; Esc cancels. Do not infer reliable opening-tap commit from the held-cycle test. Option+F remains the direct-toggle path when Chrome delivers its command.
7. Unpin Flytab and repeat the held sequence in the separate-window fallback. Pin it again for faster opening.
8. Check Home/End selection without activation and enlarged text/200% zoom.
9. Confirm background-created tabs stay absent until visited, closed tabs disappear, and startup approximately reconstructs order using `lastAccessed`. Verify incognito remains unavailable and remapped shortcuts still work.

The action popup and native light/dark/narrow captures were visually reviewed. The panel has a Recent tabs header and position count, two-line title/window rows with 14px titles, and a right-arrow selection indicator. The visible help footer stays removed. The unused hostname formatter and its test were removed with site labels. The native fallback fits five rows without a second page scrollbar. Keyboard instructions remain screen-reader accessible. The v0.5.0 panel received a separate read-only finish review returning ship after checking screenshots, source, and contrast (weakest reviewed text pair 5.39:1). Document screenshots do not establish the appearance of Chrome’s outer native frame. The Impeccable detector could not run because its engine is not installed, so direct review was used. The strict UI source audit reports no findings; DESIGN.md lint reports zero errors (one advisory about using the existing selected token instead of a primary token). VoiceOver navigation received the bounded smoke check above. Minimum Chrome 121, Windows/Linux, every keyboard layout, comprehensive screen-reader behavior, and physical hold/release success rates remain unverified. Shortcut conflicts or OS-reserved combinations can prevent command delivery; remap through Chrome if needed.

For local diagnostics, inspect `window.flytabInput.trace` in the popup. It contains recent key events and modifier flags in memory only, never titles/URLs or transmitted data. Opening DevTools may change focus/key routing and is unsuitable for timing measurements.
