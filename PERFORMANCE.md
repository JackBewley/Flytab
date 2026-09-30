# Flytab startup performance

The goal is to make the switcher receive keyboard input sooner while keeping the immediate Option+F toggle, frozen preview order, release-to-select behavior, and existing permissions. A release that occurs before Chrome focuses the extension document is still unrecoverable.

## Options study: manual icon and a 20-entry history (not applied)

The user asked to compare options after v0.6.4. Shipping runtime remains commit `2c840b4`; no history limit or icon change was applied. Isolated copies under `work/options-study/` compare normal history with a prototype that caps promotion, commit, reconstruction and reconciliation at 20 entries, including the current tab. Both retain automatic icons. Ordinary tabs remain open. Full live-tab queries still reconcile history; this is a bounded-history prototype, not a rewrite of tab lookup or popup rendering.

**Manual icon:** the prior paired physical-footprint measurements estimate about **22–23 MiB saved while idle** by removing the offscreen appearance document. A manual Light/Dark setting could retain clean icons without a resident appearance watcher. No switching speed gain is established from removing the watcher; an absent renderer may need to be recreated for a cold popup. The existing native pre-theme comparison is documented below. This option was not remeasured in this study.

**20 entries, with 120 visited tabs open:** two opposite-order native pairs on Chrome for Testing 153.0.8010.12 total 80 measured openings, 160 quick toggles and 400 navigation steps. The normal list contains 121 eligible entries (the 120 fixtures plus the initial browser tab); the capped list contains 20. A separate controller tab belongs to the extension and is excluded from MRU. Medians in milliseconds:

| Worker | Normal → capped opening | Normal → capped quick toggle | Normal → capped navigation |
|---|---:|---:|---:|
| Warm | 41.3 → 40.4 | 6.5 → 6.6 | 1.8 → 1.7 |
| Restarted | 43.7 → 39.9 | 8.2 → 8.5 | 1.8 → 1.7 |

Opening improved about 0.9–3.8 ms in these fixtures; quick toggling is essentially unchanged, with small increases in this run. Warm-opening p95 changed from 44.8 to 47.3 ms, so the cap is not a universal speed win. These are real native document-focus/readiness timings with automated commands and DOM navigation, excluding physical shortcut delivery and page paint. The current healthy quick toggle already reads only source/destination metadata, which limits the benefit from shortening the ID list.

**Memory:** separate headless, fresh-profile popup inspections after explicit garbage collection measured Chrome DevTools `Runtime.getHeapUsage` and `Memory.getDOMCounters`. Opposite-order pairs reduced reported JavaScript used heap by 24,716/86,804 bytes and embedder used heap by 1,364,248/1,736,120 bytes: approximately **1.3–1.7 MiB combined popup-isolate heap**. Nodes fell from 1,158 to 249. These are heap measurements, not whole-browser physical footprint or a guaranteed RAM reduction; title/icon content and allocator behavior vary. They apply while the popup is open. Appearance-document costs remain unchanged.

After closing the popup, `storage.session.getBytesInUse('flytab')` reported 4,064 bytes for normal history and 832 for the cap, a **3,232-byte (3.16 KiB) reduction** in Chrome's storage accounting. With the popup open, history plus frozen session used 8,608 versus 2,144 bytes. [Chrome documents getBytesInUse as storage quota accounting](https://developer.chrome.com/docs/extensions/reference/api/storage#method-StorageArea-getBytesInUse); these values are not a whole-process RAM measurement. Limiting Flytab's list does not unload or close webpage tabs.

The tradeoff is that older entries disappear from Flytab until revisited. A manual icon is the substantial idle-memory option; a 20-entry cap is mainly a product preference for a shorter recent list, with modest measured popup savings. A possible alternative is refreshing icon appearance only when a visible Flytab popup/settings page opens; it can avoid a resident watcher but leave the toolbar icon stale between openings. That alternative is a design option, not measured or implemented here.

Raw evidence: `test-evidence/options-study/{base,cap}-{1,2}.json` for native speed and `memory-{base,cap}-{1,2}.json` for heap/storage. The prototype and adapted benchmark are in ignored `work/options-study/`. Memory runs are excluded from speed results. No 1,000-tab test or user's browser profile was used.

## v0.6.4 lower-allocation quick switching

Healthy Option+F and toolbar toggles now query only the current active tab and the previous MRU destination. They reuse the validated destination, avoid building a populated window containing every tab, and avoid copying the MRU array merely to promote an already-current source. Missing history, a stale/ineligible destination, or an open picker retains the full reconciliation path. Browser events still remove closed tabs. Source/destination validation, activation-before-window-focus, durable MRU writes, and popup input ownership remain intact. No new persistent cache, timer, dependency, or permission was added.

The serialized worker queue now retains only completion, rather than the previous operation’s return value. A completed startup scan or popup message can no longer remain reachable solely because it was the last queued operation. This releases those tab/snapshot objects for normal garbage collection; it does not force collection or promise a specific process-memory decrease.

**Native speed:** the Mac was unlocked for these runs. Two opposite-order fresh-profile pairs compare frozen v0.6.3 commit `6e05ad0` with the exact final v0.6.4 runtime, on Chrome for Testing 153.0.8010.12. Both use the pinned action surface and 8/120 visited blank fixtures, plus the browser’s initial/controller tabs. There are 160 measured openings, 320 toggles, and 800 navigation steps across both versions. The benchmark opens real foreground Chrome surfaces and records document focus and authenticated input ownership; command dispatch and subsequent navigation are automated, not physical keyboard/keyup timing or compositor-paint measurements. No 1,000-tab run was performed.

Median milliseconds (v0.6.3 → v0.6.4):

| Visited tabs / worker | Quick toggle | Popup fully ready | Navigate one entry |
|---|---:|---:|---:|
| 8 / warm | 5.7 → 5.5 | 32.2 → 32.2 | 0.7 → 0.7 |
| 8 / worker-restarted | 6.8 → 6.2 | 34.4 → 34.7 | 0.8 → 0.8 |
| 120 / warm | 8.7 → 7.3 | 42.7 → 39.8 | 1.8 → 1.8 |
| 120 / worker-restarted | 10.1 → 8.5 | 42.9 → 42.2 | 1.9 → 1.8 |

The quick-toggle median improved about 16% at 120 tabs in both worker modes; the smaller fixture remains comparable. Including controller transport and worker wake, the 120-tab medians changed from 9.5 to 8.4 ms warm and 15.0 to 13.3 ms restarted. Popup opening remains comparable or faster in these runs; its eight-tab restarted median moved by +0.3 ms. This supports no material regression, not an absolute zero-slowdown guarantee. Website loading/painting after activation is outside these timings.

**Allocation pressure:** separate headless diagnostic runs count tab metadata returned by `tabs.query`, `tabs.get`, and `windows.getLastFocused`, with serialization enabled only for those runs. At 120 visited tabs, a healthy toggle read 245 tab records / about 103,024 JSON bytes before, versus 2 records / 847 bytes afterward (about 99.2% less serialized metadata). At eight visited tabs it read 21 records / 8,852 bytes versus 2 / about 835 bytes. These are actual API result volumes, not an estimate of total RAM or JavaScript heap bytes. They exclude session ID arrays, activation-event processing after command completion, and the common tab-update response. Speed results above exclude the profiling runs.

**Idle memory:** the automatic icon still needs the same minimal hidden document. Its previously measured extra physical footprint remains the relevant estimate: about 22–23 MiB, mostly Chrome’s renderer overhead rather than Flytab JavaScript. This revision reduces transient work and retention; it does not claim that 22–23 MiB disappeared or remeasure a lower idle footprint. Repeatedly closing/recreating the appearance document would trade memory for extra process starts and delayed appearance updates. Removing it would require a static/manual icon or another supported browser feature. Chromium’s native `icon_variants` feature is still [disabled by default in the checked source](https://chromium.googlesource.com/chromium/src/+/HEAD/extensions/common/extension_features.cc); that is the most promising future way to remove the resident document without a feature tradeoff. No experimental browser flags are required or enabled by Flytab.

The previously blocked native v0.6.2/v0.6.3 comparison also completed (`native-pretheme.json` against `native-before-1.json`): popup medians were 34.1/34.5/43.6/44.3 ms before automatic icons and 32.2/34.2/41.2/40.5 ms afterward, in 8-warm/8-restarted/120-warm/120-restarted order. It found no native opening regression in that bounded pair; the balanced final comparison above is the evidence for the new quick-toggle optimization.

Verification: 69 unit tests, 18 pinned-action browser checks, and 31 native-fallback browser checks pass. These cover immediate toolbar/command use, source/destination ordering, missing/closed/ineligible tabs, failed activation, worker restart, cross-window focus, unchanged preview/release/cancel behavior, and popup errors. Browser chord checks use injected DOM events; prior physical-keyboard acceptance still applies.

Evidence is under `test-evidence/0.6.4`: `native-{before,after}-{2,3}.json`, `native-comparison.json`, `metadata-{before,after}.json`, `action/action-results.json`, and `native-fallback/results.json`. Preliminary pair 1 is retained but excluded from the final table because a final redundant-array-copy guard was added afterward. For metadata diagnostics use `FLYTAB_PROFILE_METADATA=1`; never use those instrumented timings as performance evidence. All probes stay in temporary test copies and are excluded from the ZIP.

## v0.6.3 automatic icon: speed and memory

The user authorized an offscreen appearance document and rejected the outlined icon. The clean dark/light PNGs preserve the prior geometry. The document starts at install/update and browser startup; command handlers never create it or wait for it. Icon messages use a separate cosmetic queue. Chrome 153 did not deliver emulated media-query change events in the hidden document, although `.matches` updated correctly. A local five-second fallback reads that boolean and sends a message only after a change or failed application. There is no persistent Port, network traffic, DOM rendering loop, or worker keepalive. Chrome may delay background timers, so this is not an exact five-second update guarantee. Custom toolbar themes may differ from the device preference.

**Memory:** two opposite-order fresh-profile comparisons on macOS/Chrome for Testing 153.0.8010.12 measured combined process physical footprint with `vmmap -summary`, after explicitly stopping the worker and waiting through multiple polling intervals. Baseline/new totals were 280.9/303.6 MiB and 280.2/302.5 MiB: **22.7 and 22.3 MiB additional footprint**. The extra renderer itself was about 27 MiB; changes in other browser processes affect the net difference. The document’s measured JS heap was about 0.5 MiB. Combined process RSS increased by roughly 115–134 MiB in those pairs, but includes shared mapped memory; do not label that number as private memory. These are bounded local idle measurements, not a guarantee on every machine or profile.

**Speed:** two alternating before/after pairs compare frozen v0.6.2 commit `23865f3` with v0.6.3. The Mac was locked, preventing native foreground Chrome from recording fixture visits; unsuccessful headed attempts are excluded. The completed tests use full **headless Chrome 153**, real extension APIs, a pinned action surface, 8/120 visited blank fixtures, and warm/restarted workers. Across both versions: **160 measured openings, 320 toggles, 800 navigation steps**. These measurements exclude physical shortcut/OS focus delay and compositor paint, and must not be compared directly to the historical headed timings.

Median milliseconds (v0.6.2 → v0.6.3):

| Fixtures / worker | Popup fully ready | Immediate toggle | Navigate one entry |
|---|---:|---:|---:|
| 8 / warm | 28.2 → 26.9 | 3.7 → 3.0 | 0.7 → 0.7 |
| 8 / worker-restarted | 29.9 → 28.0 | 6.3 → 4.8 | 0.7 → 0.7 |
| 120 / warm | 35.3 → 33.0 | 7.4 → 6.9 | 1.6 → 1.5 |
| 120 / worker-restarted | 35.9 → 33.9 | 11.4 → 9.0 | 1.7 → 1.7 |

No slowdown was observed in this controlled comparison. A resident extension renderer may help opening/wake time, but the test does not establish that as the cause or promise a speed improvement. Native foreground timing remains unverified for this revision because the Mac was locked. Earlier permission and no-helper constraints remain except for the explicitly approved offscreen permission.

Evidence: `test-evidence/0.6.3/theme-{before,after}-{2,3}.json`, `headless-speed-{1,2}-{before,after}.json`, and `speed-comparison.json`. The theme suite verifies one-document reuse, actual emulated media changes and real icon updates, worker stop survival, update after a later worker wake, and no worker wake over unchanged polling intervals. Poll deduplication and failed-application retry have separate unit checks. Run `npm run test:theme` for lifecycle/memory evidence (macOS process metrics require ps/vmmap). Use `FLYTAB_HEADLESS=1` only for explicitly headless startup benchmarks.

## v0.6.0 audit remediation and speed checks

The runtime stays dependency-free. Error recovery adds no normal-path API roundtrip or awaited cosmetic update. Home/End uses the existing move message; early input capture, serialized preview/commit, and immediate toggling remain intact. Normal rows are still 52px, with growth for enlarged text. Development tests and packaging are excluded from the runtime.

The final-source comparison uses Chrome for Testing 151.0.7922.34 and the frozen v0.5.1 commit `ba28542`. Verified loopback pages provide long titles and a local PNG favicon. Old fixture tabs are discarded to bound renderer memory, retaining two loaded tabs for toggling. Counts below exclude Chrome’s initial tab. Each version has 8 warm and 10 restarted-worker openings per size, 10 navigation samples per opening, and 20 toggles per worker mode: **108 openings, 1,080 navigation samples, and 240 toggles** across both versions. No popup errors were reported.

Median milliseconds (v0.5.1 → v0.6.0):

| Visited fixtures / worker | Fully ready | Navigate one entry | Immediate toggle |
|---|---:|---:|---:|
| 8 / warm | 66.9 → 67.6 | 0.7 → 0.7 | 5.7 → 6.7 |
| 8 / worker-restarted | 67.8 → 81.8 | 0.7 → 0.7 | 9.5 → 9.3 |
| 120 / warm | 80.4 → 82.5 | 2.8 → 2.7 | 14.0 → 15.0 |
| 120 / worker-restarted | 83.8 → 82.7 | 2.8 → 2.8 | 11.8 → 13.1 |
| 1000 / warm | 205.7 → 203.8 | 30.1 → 29.8 | 67.8 → 65.5 |
| 1000 / worker-restarted | 201.2 → 202.7 | 30.4 → 30.1 | 69.1 → 69.7 |

“Fully ready” includes document focus, rendered rows and authenticated input ownership. Navigation measures injected ArrowDown to DOM selection change. Toggle measures worker command completion; separate raw controller timings include wake/transport. These are not physical-key or compositor-paint timings. Both versions issue the same median tracked API calls through list readiness: 15 warm / 16 restarted, including two session writes.

At 1,000 fixtures, opening p95 was 213.1 → 212.4 ms warm and 211.9 → 211.8 ms restarted. Navigation medians and immediate-toggle medians remain comparable; full-history processing is an existing scaling cost, not removed by this release. Small-history restarted opening showed a slower median in this particular run and requires the repeated-profile results below.

Three earlier alternating pairs using blank 8/120-tab fixtures contained 180 openings, 1,800 navigation samples and 480 toggles. Pooled opening medians differed by at most 1.5 ms; navigation differed by at most 0.1 ms. The 120-tab restarted p95 nevertheless increased from 87.0 to 122.8 ms in that small sample. This is evidence against a broad slowdown, not a guarantee about every opening or tail.

The slower small-history restarted case also appeared in a reversed-order pair (67.3 → 87.4 ms), so it was investigated rather than discarded. Isolated badge/layout experiments did not establish a stable cause; one old-layout run was faster, but another intrinsic-sizing variant was not. All experimental runtime changes were reverted. Four further fresh-profile pairs, alternating version order, yielded medians of 69.4 → 71.6, 68.1 → 68.7, 67.9 → 69.8, and 68.7 → 72.4 ms. Across their 60 restarted samples per version, pooled p50 was **68.7 → 70.9 ms** and p95 **94.2 → 95.1 ms**. Individual slow samples in both versions show about 25 ms waiting on Chrome’s existing context lookup. These repeated results support comparable speed with a small measured median difference; they do not establish zero overhead or identical tails. Evidence: `profile-{1,2,3,4}-{before,after}.json`, `profile-comparison.json`, and `restarted-repeat-{before,after}.json`.

Raw evidence: `test-evidence/0.6.0/reliable-speed-{before,after}.json`, `paired-{1,2,3}-{before,after}.json`, and `paired-comparison.json`, with source hashes, raw samples and API counts. Earlier `scale-*` measurements used insufficiently verified intercepted-page fixtures and are exploratory only; one large run lost its test messaging channel and another was stopped during unreliable fixture setup. The loopback-fixture results above supersede those attempts. Browser memory and physical fast-tap success rates were not measured.

## Modifier-release correction in v0.4.1

Native testing after the user’s report revealed a separate issue: Chromium suppresses keyups after processing a browser-handled shortcut in the popup. The v0.4.0 injected-event tests exercised the release handler but bypassed that native routing failure. v0.4.1 temporarily removes the background command listener only while an authenticated popup Port owns input, allowing the popup to handle configured chords directly. Closing, committing, cancelling, or losing the connection restores the global shortcuts. This retains the pinned opening route; it does not infer release from elapsed time.

A 20-second local Port message runs only while the picker is focused and visible, preventing ordinary worker-idle termination during a long selection. Unexpected worker termination cancels the picker safely. There is no activity from this mechanism once it closes.

Primary-source diagnosis: [Chromium 153 keyup suppression](https://raw.githubusercontent.com/chromium/chromium/153.0.8010.53/content/browser/renderer_host/render_widget_host_impl.cc), [command dispatch requires an event listener](https://chromium.googlesource.com/chromium/src/+/refs/heads/main/chrome/browser/extensions/extension_keybinding_registry.cc).

## v0.4.1 startup regression check

A bounded comparison used Chrome for Testing **153.0.8010.52** with the pinned icon and nine total MRU entries: five warm and three restarted-worker openings per version, **16 measured openings** total. The baseline was frozen commit `8c0616e` (v0.4.0). Readiness includes document focus and rendered rows, plus the input-ownership acknowledgement in v0.4.1.

| Worker | v0.4.0 median | v0.4.1 median |
|---|---:|---:|
| Warm | 36.2 ms | 37.2 ms |
| Restarted | 40.2 ms | 36.3 ms |

Ownership was acknowledged in every new-version sample, usually 0.1–0.5 ms after list readiness. This small check found no substantial startup slowdown; it is not a new broad performance claim. Do not compare these Chrome 153 numbers directly with the larger Chrome 151 study below. Evidence and runtime hashes are under `test-evidence/0.4.1/`.

## Implementation

- Resolve durable state and the live source window concurrently. The source is resolved when a queued command runs; the optional event tab can be stale after rapid toggles.
- Begin opening before the full tab scan and session write. The serialized queue keeps early popup requests behind the persisted session/window binding. A failed scan or save still closes a concurrently created popup.
- Prefer a pinned toolbar popup when Chrome supports it. Its temporary popup configuration is cleared after opening so toolbar clicks retain their immediate toggle. An unavailable API, opening error, or unpinned icon uses the separate native window.
- Validate toolbar-popup messages using Chrome's POPUP context, exact URL and document ID. A toolbar popup belongs to a browser window: cleanup must close its document, never remove that owner window.
- Install key and blur capture as the first page resource. Start the initial state request immediately, overlapping markup/styles. List focus and cancellation do not wait for tab data; moves and releases preserve order until it arrives.
- Reuse the tab query for the response snapshot; avoid duplicate move broadcasts and no-op storage writes. Handle tab events by their changed IDs instead of repeatedly scanning every tab.
- Reuse list rows and favicons while cycling. Batch changed items in a document fragment, delegate row handlers, and defer offscreen favicon work. The full list remains accessible and scrollable.

All durable IDs, MRU order and selection remain in storage.session. There is no background renderer/window kept alive, additional permission, dependency, remote request, or modifier-state timer.

## Measurement method

`tests/startup.mjs` copies runtime files into a disposable Chrome profile and injects development-only probes. The production extension contains no benchmark controller or timing telemetry. It creates 8 or 120 visited blank fixture tabs; Chrome’s initial tab also remains, yielding 9 or 121 MRU entries. Each history size has 15 warm openings and 10 worker-restarted openings per version/surface. Worker restart is verified using Chrome lifecycle state and a new worker-start timestamp.

Times distinguish command dispatch, Chrome's opening call, installed input listeners, document focus, rendered rows, and readiness of both focus and rows. Dispatch timing excludes physical-keyboard/OS routing and Playwright transport. Controller timing additionally includes the extension message and worker wake. An action popup may render before Chrome shows/focuses it, so DOM-ready alone is not a user-visible opening measurement.

These are controlled comparative measurements on one Mac with Chrome for Testing 151.0.7922.34, not a physical fast-tap reliability study. Both runs use a test controller page and debugger connection; blank fixtures exclude website and favicon loading. Tail timings and native focus scheduling vary. Raw evidence is kept locally under test-evidence/0.4.0 and excluded from Git/packages. Browser-process memory and physical key-release success rates were not measured.

## v0.4.0 production results

The comparison contains **150 measured openings**: 50 from the frozen v0.3.3 baseline, 50 from the final pinned v0.4.0 path, and 50 from the final unpinned v0.4.0 path. Both new paths used identical runtime source hashes, actual browser pin settings, and the production worker/UI with development probes. No popup errors were reported.

Median milliseconds from extension command dispatch until input listeners are installed **and the document has keyboard focus**:

| History / worker | v0.3.3 window | v0.4.0 pinned | v0.4.0 unpinned |
|---|---:|---:|---:|
| 9 entries / warm | 67.9 | **55.5** | 70.6 |
| 9 entries / restarted | 67.5 | **59.2** | 70.1 |
| 121 entries / warm | 69.2 | **62.0** | 78.4 |
| 121 entries / restarted | 74.0 | **63.0** | 77.3 |

Pinning reduced median keyboard-readiness delay by **7–12 ms (10–18%)** versus v0.3.3, and by 11–16 ms versus the final unpinned path. Median readiness of both the complete list and keyboard focus improved from 73.5–83.7 ms to 63.1–72.3 ms. The unpinned fallback did not show a reliable latency improvement despite doing less work.

Tail results are mixed, with only 10–15 samples per case. One large-history, restarted-worker pinned opening reached 104.2 ms for full readiness, exceeding that case’s old 94.7 ms p95. This change improves measured medians; it does not make every opening faster or guarantee that an extremely short physical chord will reach the popup.

Tracked API calls issued through list readiness fell from 18 to 13 (14 after worker restart) on the pinned route, or 11/12 unpinned. Session-storage writes fell from 6 to 2 pinned, or 1 unpinned. Pinned authentication accounts for the extra work. These counts exclude messaging and cosmetic APIs and are not all serial prerequisites.

Evidence: `startup-before.json`, `startup-action-after.json`, `startup-window-after.json`, and `startup-production-comparison.json`. The comparison records runtime hashes, p50/p95 values, source versions, and instrumentation limits. The baseline used direct page inspection after readiness; final paths self-report after readiness to support toolbar bubbles. Both retain a temporary controller and debugger connection.

## Routes investigated

The original native opening path performed six API calls before requesting a window. Parallelization reduced that to two before the pinned-route check was added. The first optimized native benchmark reduced tracked work through list readiness from 18 calls / 6 storage writes to 10 calls / 1 write, but produced little opening-latency change: Chrome's window/document startup dominated. Those intermediate results are retained as startup-before.json, startup-after.json and startup-comparison.json.

An earlier isolated toolbar-popup experiment suggested that pinning could avoid part of the native window delay; its unpinned route was much slower (roughly 169–200 ms). That motivated the conditional pinned path. The production results above supersede the prototype measurements and explicitly distinguish element focus from actual document focus.

Other approaches were rejected:

- A retained minimized window keeps an OS window and renderer alive and still needs a focus transition. Chrome exposes no genuinely hidden reusable window state.
- An offscreen document cannot receive physical releases because it cannot be focused; it would also add a permission and memory use.
- Keeping the worker alive while the picker is closed wastes background activity and does not remove Chrome's document-focus delay. v0.4.1 uses a small Port liveness message only during a visible, focused picker session to preserve input ownership; it stops entirely on close.
- A timer cannot distinguish an already-released chord from a user still holding the keys while reading.
- Changing to an always-visible side panel or injecting into websites changes the interaction/permission model.
- Minification or a framework/build pipeline would target small local files rather than the measured dominant delay.

## Run

Use the same Chrome for Testing and Playwright Core environment as TESTING.md. Set FLYTAB_SOURCE to a frozen source checkout for a baseline, FLYTAB_EVIDENCE to a JSON output path, and FLYTAB_ACTION_PINNED to 1 or 0 for the chosen surface, then run `node tests/startup.mjs`. Compare listener-plus-focus readiness and interactive readiness, not only row rendering. For the v0.6.0 checks, also set `FLYTAB_REALISTIC=1`, `FLYTAB_TAB_COUNTS=8,120,1000`, `FLYTAB_WARM_SAMPLES=8`, `FLYTAB_RESTARTED_SAMPLES=10`, `FLYTAB_MOVE_SAMPLES=10`, and `FLYTAB_TOGGLE_SAMPLES=20`. Run headed comparisons sequentially and keep the same explicit `CHROME_PATH` for both versions.

API references: [Action popup and pin state](https://developer.chrome.com/docs/extensions/reference/api/action), [runtime contexts](https://developer.chrome.com/docs/extensions/reference/api/runtime#method-getContexts), [window states](https://developer.chrome.com/docs/extensions/reference/api/windows), [offscreen limitations](https://developer.chrome.com/docs/extensions/reference/api/offscreen), [worker lifecycle](https://developer.chrome.com/docs/extensions/develop/concepts/service-workers/lifecycle). Chromium's [action-popup implementation contract](https://chromium.googlesource.com/chromium/src/+/main/chrome/browser/ui/views/extensions/extension_popup.h) explains why page load and bubble visibility are distinct.
