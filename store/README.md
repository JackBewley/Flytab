# Flytab Chrome Web Store images

Prepared September 30, 2026 from Flytab 0.6.5 on macOS, Chrome for Testing 153.0.8010.12. Not uploaded by this task.

## Upload order

1. `assets/01-previous-tab.png` — 1280×800; immediate previous-tab switching and the genuine shortcut settings page.
2. `assets/02-recent-tabs.png` — 1280×800; actual recent-tab switcher, current tab first and previous tab selected across windows.
3. `assets/03-dark-switcher.png` — 1280×800; actual switcher with its shipped dark palette.
4. `assets/promo-440x280.png` — 440×280; required small promotional tile using the approved Flytab mark.

Upload the first three in Store Listing → Screenshots and the fourth in the small promotional image field. Use the individual PNGs, not the ZIP as an extension package.

## Source and verification

The generator `scripts/store-assets.mjs` loads a temporary extension copy in an isolated Chrome profile, pins its action, visits five safe local demonstration pages across two normal windows, invokes the production opening routine and captures its real popup through Chrome's debugging protocol. Only the temporary background copy exposes that opening routine; production files are unchanged. Favicons are real locally cached icons for the demonstration pages. The light/dark captures use browser media emulation. Settings displays Chrome's actual assigned Mac shortcuts.

`captures/` preserves uncomposed original captures and provenance. Screenshot typography and framing are separate store artwork, not additional extension UI. The UI itself is not rewritten or restyled for the captures. Compositions have square canvas edges and fill the required dimensions. The mark is derived from `icons/icon.svg`. No external fonts or stock images are used.

Recreate with `node scripts/store-assets.mjs`; the existing project Playwright Core development dependency and installed Chrome for Testing are required. Set CHROME_PATH if needed. The script starts only temporary browsers and closes them after capture. Review images after any user-facing UI change, then rerun packaging/delivery validation. Browser focus and demonstration favicon caching can affect generation; do not run alongside other native-browser tests.

These are static listing assets. No store files, capture hooks or artwork generator are included in the extension's runtime-only package.
