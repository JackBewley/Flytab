# Flytab

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users and purpose

Desktop Chrome users switching among recently visited tabs across browser windows. The explicit brief requests a minimal Manifest V3 extension, macOS Option+F, a compact five-row switcher, immediate toolbar toggling, and on-device processing.

## Capabilities and constraints

Global MRU means across normal Chrome windows, not an operating-system-wide shortcut. Preview leaves MRU untouched. Commit brings the destination first and source second. Background-created tabs enter only after a visit. Incognito is excluded. No host permissions, content scripts, analytics, account, server, or external network requests.

The browser does not expose a global modifier-release event or a current physical keyboard-state query. Best-effort release-to-commit has an explicit Enter/click fallback for releases missed during window creation. Chrome provides a local favicon cache through a narrowly scoped favicon permission.

## Brand commitments

Flytab. A small vertical list of favicons and titles. No letter labels or unnecessary settings.

## Stack

Plain JavaScript modules, HTML and CSS. No runtime dependencies or build step; chosen for the requested minimal extension.

## Evidence

The user's requirements in this task are authoritative. Browser verification and limitations are recorded in TESTING.md.
