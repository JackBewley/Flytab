---
version: alpha
name: Flytab
description: A compact desktop tab switcher with the clarity of a native selection menu.
colors:
  surface: '#ffffff'
  ink: '#202124'
  muted: '#5f6368'
  selected: '#0063e1'
  selectedInk: '#ffffff'
  hover: '#f1f3f4'
  error: '#b3261e'
  focus: '#0063e1'
typography:
  body:
    fontFamily: '-apple-system, BlinkMacSystemFont, Segoe UI, sans-serif'
    fontSize: 13px
    lineHeight: '1.4'
rounded:
  row: 4px
spacing:
  row: 32px
  gutter: 6px
---

## Overview

An optional native selection menu complements the primary instant previous-tab toggle. The visual reference is Chrome on macOS: an unbranded menu of tab titles and favicons, with one blue selected row. The user explicitly requested removal of the help footer and a built-in appearance. Operate mode; task speed and familiar keyboard behavior take priority. This is a tightly specified desktop popup, not a marketing surface. English UI; tab titles retain their original script. No market-specific assumptions.

Runtime tokens are canonical in popup.css :root; this file mirrors them. Named color tokens map to matching kebab-case variables (selectedInk → --selected-ink). The media query in popup.css owns dark variants. A second UI theme system must not be added.

## Colors

White surface (#ffffff) and Chrome charcoal text (#202124) in light mode; dark gray (#292a2d), near-white text (#f1f3f4), and muted gray (#bdc1c6) in dark mode. Selected rows use white text on blue (#0063e1 light, #0a64d9 dark); there is no submenu chevron. Theme follows the system preference; arbitrary custom Chrome theme colors are not exposed to the extension. Errors are red text. The popup adds no shadow; the operating system owns window elevation. Forced-colors mode adds a system highlight outline.

## Typography

System font for titles and labels matches browser menus without external font requests. Use 13px system text for titles and 11px for secondary window/current labels; no display heading, count, or monospaced decoration. Titles truncate visually but retain their full accessible text and tooltip.

## Layout

The pinned fast path uses a 400px toolbar popup anchored beneath Flytab’s icon, without an OS title bar. The unpinned/unsupported fallback uses a 400×216px outer native window with fluid inner layout. Five 32px rows visible; longer history scrolls. The former current tab appears last. Initial selection is the previous MRU tab. Six-pixel outer padding; no visible header, footer, instructions, or Cancel button. Escape and outside-click dismissal cancel. Keyboard instructions remain available to screen readers. At narrow desktop widths content remains reachable; this extension has no mobile target.

## Elevation & Depth

One flat list within Chrome’s toolbar bubble or the fallback native OS frame. No nested cards, decorative gradients, or artificial glass.

## Shapes

4px rounded selected rows; 16px favicons keep native proportions. Default arrow cursor follows native desktop menu conventions. The Flytab mark is a left arrow inside a horizontal 22×19 tab-window outline on a 24-unit canvas, with a minimal two-tab strip. A 1.8-unit stroke and nearly full-width frame give the whole icon more presence at toolbar size. The arrowhead is 6 units tall; the shallower tab strip leaves clear space above and below it. `icons/icon.svg` is the editable source; Chrome uses PNGs rendered at 16, 32, 48 and 128 pixels. Toolbar PNGs use charcoal gray (#444746) on transparency, selected for the user's light Chrome toolbar. Branding stays in the toolbar; the popup has no logo or decorative selection chevrons.

## Components

The authored listbox in popup.js presents selection; background.js owns frozen order and selected index. Hold Option+Shift and press F to open, then keep both modifiers held while tapping F to move forward. Shift never reverses F. Release both modifiers to commit and close; releasing F while modifiers remain held does not commit. Both configured shortcuts advance within the list and wrap. The popup handles these chords directly while it owns input, preventing Chrome’s accelerator handling from swallowing modifier releases; normal shortcut routing resumes on close. Escape/cancel closes without committing, including while modifiers are held. Enter/click remain available if Chrome misses release before popup focus. Arrows without modifiers and the wheel also preview. Outside the list, Option+F immediately toggles; the toolbar remains an immediate toggle.

ARIA active descendant follows the selected option. Focus starts on the listbox before the initial data response; actual blur during loading cancels rather than refocusing. Selection-only updates reuse the same rows and favicons. Input capture and the initial state request precede styles/UI loading. The list is the only tab stop. Pointer hover does not alter selection. The active row provides the keyboard-focus indicator, avoiding a second frame around the list; a focus outline remains during loading and forced colors use system Highlight/HighlightText. No animation delays keyboard input.

Loading reserves five rows. Empty state explains that another tab must be visited. Inline errors use an ARIA alert and allow Escape; expired windows can be closed. If the background input connection unexpectedly disappears, the picker cancels safely. No modal alerts or confirmation dialogs.

## Do's and Don'ts

- Keep titles dominant and selection unmistakable.
- Preserve selection order until commit; never activate on hover or arrow navigation.
- Do not add remote imagery, fonts, or analytics.
- Keep the primary toggle immediate. In the list, wait for all modifier keys to be released before committing; never guess release with a timer.
