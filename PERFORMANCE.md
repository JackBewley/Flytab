# Flytab startup performance

The goal is to make the switcher receive keyboard input sooner while keeping the immediate Option+F toggle, frozen preview order, release-to-select behavior, and existing permissions. A release that occurs before Chrome focuses the extension document is still unrecoverable.

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
