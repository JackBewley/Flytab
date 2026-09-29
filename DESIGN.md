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

A native selection menu for frequent keyboard use. The blue selected row and small directional mark carry the identity. Operate mode; task speed and familiar keyboard behavior take priority. This is a tightly specified desktop popup, not a marketing surface. English UI; tab titles retain their original script. No market-specific assumptions.

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

9px rounded selected rows. Favicons keep native proportions. Small authored geometric plane and chevron icons; no raster illustration is needed.

## Components

The authored listbox in popup.js presents selection; background.js owns frozen order and selected index. Arrow keys and wheel preview, Enter/click commit, Escape/cancel close. ARIA active descendant follows the selected option. Focus starts on the listbox; Tab can reach Cancel, where Enter activates the native button. Pointer hover does not alter selection. No animation delays keyboard input.

Loading reserves five rows. Empty state explains that another tab must be visited. Inline errors use an ARIA alert and allow Escape; expired windows can be closed. No modal alerts or confirmation dialogs.

## Do's and Don'ts

- Keep titles dominant and selection unmistakable.
- Preserve selection order until commit; never activate on hover or arrow navigation.
- Do not add remote imagery, fonts, or analytics.
- Do not infer modifier state from a timer.
