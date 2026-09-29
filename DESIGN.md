---
version: alpha
name: Flytab
description: A compact desktop tab switcher with the clarity of a native selection menu.
colors:
  surface: '#f7f9fc'
  ink: '#1e2c40'
  muted: '#53647a'
  rule: '#dce3ed'
  selected: '#245cc5'
  selectedInk: '#ffffff'
  hover: '#e7edf6'
  error: '#a52833'
  focus: '#245cc5'
typography:
  body:
    fontFamily: '-apple-system, BlinkMacSystemFont, Segoe UI, sans-serif'
    fontSize: 14px
    lineHeight: '1.4'
  utility:
    fontFamily: 'ui-monospace, SFMono-Regular, Consolas, monospace'
rounded:
  row: 9px
spacing:
  row: 48px
  gutter: 10px
---

## Overview

An optional native selection menu complements the primary instant previous-tab toggle. The blue selected row and small directional mark carry the identity. Operate mode; task speed and familiar keyboard behavior take priority. This is a tightly specified desktop popup, not a marketing surface. English UI; tab titles retain their original script. No market-specific assumptions.

Runtime tokens are canonical in popup.css :root; this file mirrors them. Named color tokens map to matching kebab-case variables (selectedInk → --selected-ink). The media query in popup.css owns dark variants. A second UI theme system must not be added.

## Colors

Pale blue-gray surface and ink text in light mode; a slate surface in dark mode respects the desktop preference. Selected rows use a white label and explicit chevron. Errors are red text. The popup adds no shadow; the operating system owns window elevation. Forced-colors mode adds a system highlight outline.

## Typography

System font for titles and labels matches browser menus without external font requests. Monospaced utility face is restricted to keys and position counts. Titles truncate visually but retain their full accessible text and tooltip.

## Layout

440px outer native window, fluid inner layout. Five 48px rows visible; longer history scrolls. The former current tab appears last. Initial selection is the previous MRU tab. Header and footer remain compact. At narrow desktop widths content remains reachable; this extension has no mobile target.

## Elevation & Depth

One flat list with a native OS frame. No nested cards, decorative gradients, or artificial glass.

## Shapes

9px rounded selected rows. Favicons keep native proportions. The Flytab mark is a left arrow inside a simple outlined square with subtly softened corners. `icons/icon.svg` is the editable source; Chrome uses PNGs rendered at 16, 32, 48 and 128 pixels. The toolbar uses a medium slate stroke (#738198) on transparency for visibility on light and dark browser toolbars; the switcher mark inherits its existing text color. Selection chevrons remain unchanged.

## Components

The authored listbox in popup.js presents selection; background.js owns frozen order and selected index. Hold Option+Shift and press F to open, then keep both modifiers held while tapping F to move forward. Shift never reverses F. Release both modifiers to commit and close; releasing F while modifiers remain held does not commit. Both registered commands advance within the list and wrap. Escape/cancel closes without committing, including while modifiers are held. Enter/click remain available if Chrome misses release before popup focus. Arrows without modifiers and the wheel also preview. Outside the list, Option+F immediately toggles; the toolbar remains an immediate toggle.

ARIA active descendant follows the selected option. Focus starts on the listbox; Tab can reach Cancel, where Enter activates the native button. Pointer hover does not alter selection. The footer explains forward F navigation and release to switch. No animation delays keyboard input.

Loading reserves five rows. Empty state explains that another tab must be visited. Inline errors use an ARIA alert and allow Escape; expired windows can be closed. No modal alerts or confirmation dialogs.

## Do's and Don'ts

- Keep titles dominant and selection unmistakable.
- Preserve selection order until commit; never activate on hover or arrow navigation.
- Do not add remote imagery, fonts, or analytics.
- Keep the primary toggle immediate. In the list, wait for all modifier keys to be released before committing; never guess release with a timer.
