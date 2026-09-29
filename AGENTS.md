# Flytab project

The canonical working directory is `/Users/jackbewley/Projects/_creativemethod/Flytab`. The user designated this directory for all future Flytab development. Work on the source files at this root; `dist/` contains a packaged snapshot.

Read README.md and TESTING.md before changing behavior. This is a plain JavaScript Manifest V3 extension with no runtime dependencies or build step. Run `npm test` for unit tests; tests/browser.mjs documents the optional isolated-browser suite. Test evidence from the initial build is in test-evidence/2026-09-29.

Preserve the minimal permission and privacy model: tabs, storage, favicon; no host permissions, content scripts, external network requests, analytics, or incognito. Keep the toolbar action separate from the keyboard switcher. Popup previews must not reorder MRU or activate tabs. Never claim very fast modifier release is reliable: Chrome can miss it before the popup is ready, so Enter/click is the intentional fallback.

DESIGN.md and PRODUCT.md describe the existing product. Test artifacts and browser profiles are development materials and should not enter distribution packages.
