# Flytab

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users and purpose

Desktop Chrome users who want a very quick return to their previous tab across browser windows. The primary action is an immediate MRU toggle: macOS Option+F when the list is closed and the toolbar button switch directly, without opening a popup or waiting for modifier release. Option+Shift+F opens an optional compact five-row list. Pinned Flytab uses a toolbar popup on supported Chrome; unpinned/unsupported cases use the separate native window. Flytab is a minimal Manifest V3 extension with on-device processing; the user explicitly rejects a separate helper app.

## Capabilities and constraints

The switcher shows the current tab first and initially highlights the previous tab on row two.

Global MRU means across normal Chrome windows, not an operating-system-wide shortcut. Preview leaves MRU untouched. Commit brings the destination first and source second. Background-created tabs enter only after a visit. Incognito is excluded. No host permissions, content scripts, analytics, account, server, or external network requests.

The visual interaction is hold Option+Shift, press F to open, keep both modifiers held while tapping F to move forward, then release both to commit and close. Shift is part of the opening chord, never a reverse action. Both configured shortcuts advance inside the list and wrap. While open, the popup owns shortcut input directly so Chrome preserves modifier releases; normal shortcut routing returns on close. Preview leaves MRU untouched. Escape cancels even with modifiers held; Enter/click remain available. Unmodified Home/End preview the first/last entry. Release capture starts before the UI module, and checks all modifier flags. Chrome cannot recover a release that happened before the popup received input; extremely fast opening taps may need Enter/click. The primary Option+F toggle is independent of this limitation.

The legacy command IDs are retained to preserve saved bindings: switch-next toggles outside the list, switch-previous opens it, and both advance inside it. Chrome provides a local favicon cache through a narrowly scoped favicon permission.

## Brand commitments

Flytab uses a left arrow inside a horizontal tab-window outline, with a substantial charcoal-gray stroke and generous space around the arrow, sized to accompany Chrome navigation controls. Immediate previous-tab switching, with an optional small vertical list of favicons and titles. No letter labels or unnecessary settings. The switcher should feel like a polished desktop utility within Chrome’s squared extension-popup frame: quiet Recent tabs header and position count, title/window hierarchy, neutral light/dark colors, restrained selection and a right arrow. No visible help footer or branded heading. Chrome’s own rounded popup frame cannot be reproduced through extension CSS.

## Stack

Plain JavaScript modules, HTML and CSS. No runtime dependencies or build step; chosen for the requested minimal extension.

## Evidence

The user's requirements in this task are authoritative. Browser verification and limitations are recorded in TESTING.md.

Settings is available through the toolbar context menu’s Options entry. It displays Chrome’s assigned shortcuts and opens Chrome’s editor; it adds no alternate key-binding system. The toolbar icon uses a static light keyline around the dark geometry for both toolbar themes, as requested, with no background theme detection.
