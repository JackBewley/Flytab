# Flytab

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users and purpose

Desktop Chrome users who want a very quick return to their previous tab across browser windows. The primary action is an immediate MRU toggle: macOS Option+F when the list is closed and the toolbar button switch directly, without opening a popup or waiting for modifier release. Option+Shift+F opens an optional compact five-row list. Flytab is a minimal Manifest V3 extension with on-device processing; the user explicitly rejects a separate helper app.

## Capabilities and constraints

Global MRU means across normal Chrome windows, not an operating-system-wide shortcut. Preview leaves MRU untouched. Commit brings the destination first and source second. Background-created tabs enter only after a visit. Incognito is excluded. No host permissions, content scripts, analytics, account, server, or external network requests.

In the optional list, F or Option+F previews the next older entry; Shift+F or Option+Shift+F moves back. Arrows and the wheel also preview; Enter or a row click commits, and Escape or Cancel closes. Releasing Option never commits. Both directions wrap without activating tabs or changing MRU. Enter/click is still required to commit after browsing. The existing command IDs are retained to preserve shortcut assignments: switch-next toggles immediately outside the list and advances within it; switch-previous opens the list and reverses within it. Chrome provides a local favicon cache through a narrowly scoped favicon permission.

## Brand commitments

Flytab. Immediate previous-tab switching, with an optional small vertical list of favicons and titles. No letter labels or unnecessary settings.

## Stack

Plain JavaScript modules, HTML and CSS. No runtime dependencies or build step; chosen for the requested minimal extension.

## Evidence

The user's requirements in this task are authoritative. Browser verification and limitations are recorded in TESTING.md.
