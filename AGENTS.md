# Contributing to Flytab

Work from this repository root. Read README.md and TESTING.md before changing behavior; DESIGN.md and PRODUCT.md describe the interface and product constraints. Flytab is a plain JavaScript Manifest V3 extension with no runtime dependencies or build step.

## Privacy and performance

- Keep permissions limited to tabs, storage and favicon. No host permissions, content scripts, external network requests, analytics, incognito or separate helper app.
- Keep Option+F and toolbar clicks as immediate previous-tab toggles, without opening UI or waiting for modifier release.
- The healthy toggle path validates the active source and prior MRU destination, rather than scanning every tab. Preserve reconciliation for stale or missing history and completion-only queue retention.
- Chrome owns shortcut bindings. Do not add settings reads to command, opening or preview paths.
- Refresh light/dark icons only from visible switcher/settings pages after readiness. Keep idle dynamic imports and cosmetic work out of the MRU queue and synchronous startup. No hidden appearance watcher or polling.

## MRU and input invariants

- Track visits across normal Chrome windows. Background-created tabs enter only after activation; remove closed tabs.
- Freeze the preview list. Current tab is first; previous tab is initially selected. Preview never activates or reorders tabs. Commit focuses the destination window, places destination first and source second.
- Hold Option+Shift, press F to open, keep both modifiers held and repeat F to advance. Shift never reverses direction. Both configured shortcuts advance inside the list and wrap.
- Capture input synchronously before UI loading. Commit only when all modifier flags are false; releasing F while modifiers remain held must not commit. Esc cancels; Enter/click are fallback commits. Unmodified Home/End only preview.
- Preserve command IDs for saved bindings: switch-next toggles outside the list; switch-previous opens it.
- The authenticated popup Port temporarily owns input. Remove the named background command listener only after validating ownership; restore it before commit/cancel awaits and on disconnection. Preserve callback identity. Never disable commands before popup creation.
- Keep the focused, visible popup's 20-second Port liveness message. It does not infer key state. Unexpected worker/Port loss cancels safely.
- Chrome cannot recover releases preceding popup focus. Do not guess key state with timers or claim synthetic events prove native accelerator reliability.

## Popup lifecycle and design

- The pinned fast path temporarily configures the action popup, then clears it to preserve toolbar clicks. Unpinned/unsupported cases use a compact native window. Close only the extension document, never its owning browser window.
- Validate the live exact-URL extension context and owner identity. Action senders may omit tab/documentId, POPUP contexts may report windowId=-1, and owner-window focused:false can coexist with focused popup input.
- Avoid top-level await of initial state in popup.js: popup opening and the serialized initial request can deadlock. Capture input first, start the request, and focus independently.
- Preserve the 384px action width, 44px header, five normally 52px rows, 16px favicons, 13px titles and 11px metadata. Allow enlarged text/zoom to grow or shrink layout safely. Chrome owns the outer popup frame.
- Keep Current tab / Current window / Other window metadata, selected right arrow, screen-reader instructions and visible focus. No visible help footer, fake window frame or input-delaying animation.
- Errors survive unrelated broadcasts, clear on successful retry or appropriate explicit navigation, and remain accessible. Restore normal toolbar cosmetics only after an actual error, outside the healthy switching path.

## Verification and packaging

Use focused checks appropriate to the change. Run npm test for unit coverage. Optional browser suites and manual checks are documented in TESTING.md; run native browser harnesses sequentially because focus affects results. Reserve large-history benchmarks for changes that need them. Record benchmark conditions and distinguish automated readiness, physical-key behavior, RSS and private memory; do not claim unmeasured speed or memory savings.

scripts/package.py validates versions, permissions, icons and an explicit package allowlist. Use its --store flag for an upload ZIP with manifest.json at the root. Test profiles, evidence, credentials, local tool state and internal publishing notes must stay out of Git and distribution packages. Never commit real browsing data; store captures use disposable demonstration tabs.
