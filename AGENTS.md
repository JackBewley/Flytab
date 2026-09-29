# Flytab project

The canonical working directory is `/Users/jackbewley/Projects/_creativemethod/Flytab`. The user designated this directory for all future Flytab development. Work on the source files at this root; `dist/` contains a packaged snapshot.

Read README.md and TESTING.md before changing behavior. This is a plain JavaScript Manifest V3 extension with no runtime dependencies or build step. Run `npm test` for unit tests; tests/browser.mjs documents the optional isolated-browser suite. Current v0.2.0 test evidence is in test-evidence/0.2.0; evidence from the initial build remains in test-evidence/2026-09-29.

Preserve the minimal permission and privacy model: tabs, storage, favicon; no host permissions, content scripts, external network requests, analytics, or incognito. The primary macOS Option+F shortcut and toolbar action must immediately toggle to the previous MRU tab through the service worker, without opening a popup or waiting for modifier release. Option+Shift+F opens the optional list: arrows/wheel preview, Enter/click commit, and Escape/Cancel close; releasing Option never commits. Popup previews must not reorder MRU or activate tabs. A primary toggle while the list is open dismisses it and ignores its preview. Retain the legacy command IDs to preserve existing shortcut assignments: switch-next toggles immediately, and switch-previous opens the list. The user explicitly rejects a separate helper app; keep this a Chrome extension.

DESIGN.md and PRODUCT.md describe the existing product. Test artifacts and browser profiles are development materials and should not enter distribution packages.
