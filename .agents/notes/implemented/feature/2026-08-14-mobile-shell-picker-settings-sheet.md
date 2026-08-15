# Agent Note: Mobile shell: picker dropdown, portalled settings sheet, icon-only export

Status: implemented

English | [中文](2026-08-14-mobile-shell-picker-settings-sheet.zh.md)

## Problem

Below the layout's 1024px auto-collapse breakpoint the web shell had no deliberate mobile design: the desktop three-column frame squeezed into an unusable rail, the settings panel could not paint at all, and the Session Header export capsule spent scarce width on a text caption. The first adaptation pass mounted the whole sidebar as a left slide-in drawer behind the header switcher, but pulling out the entire navigation column — brand row, rail, settings foot — to answer "which session am I in, which one do I want" over-serves the gesture: the switcher is a picking action and should present a picking surface.

## Decision

**The mobile frame is a two-row grid with a dropdown picker, not a drawer.** Below the breakpoint, AppFrame renders a full-width top header (current-session title switcher plus a settings gear) and the conversation at full width; the `sidebar` slot leaves the grid flow and mounts as a fixed dropdown panel under the header, opened through the same `narrowExpanded` override the rail toggle used and closed by a mask tap, a session pick, or the settings gear. The sidebar owner share carries a new `picker` flag; SidebarRoot in picker mode renders only the New Session button and the always-wide `sidebar.workspaces` region — no brand row, rail, or foot — plus the `sidebar.settings` seat mounted invisibly so its portalled panel stays reachable (unmounting it would leave the header gear writing a store nobody renders); the frame owns the dropdown's visibility and keeps the subtree mounted.

**The settings panel portals to `document.body`.** Rendered inline, the panel's fixed positioning is contained by the sidebar column's dropdown transform and clips into the dropdown box — the concrete reason settings could not display on mobile. Portalling also frees the desktop panel from any future ancestor transform. Below the breakpoint the dialog becomes a full-screen sheet: the 188px nav rail turns into a horizontal, side-scrolling section strip above the content, and the panel title drops out (display:none keeps the node in the aria-labelledby computation). Panel open state is one shared store written by both the sidebar trigger and the header gear (signaled through `ctx.layout.openSettings` / `onOpenSettings`), so one panel serves both entries.

**The Session Header export action is icon-only and absent on mobile.** The 111×32 `Session log` capsule is now a 32px icon button whose localized name rides the tooltip and aria-label; below the breakpoint the button drops out of the header entirely and the `/export` command remains the low-frequency entry, still backed by the same controller and result dialog.

## Alternatives considered

**Keep the slide-in drawer.** Rejected because the switcher gesture asks for a session pick, not the whole navigation column; the drawer also carried the brand row and settings foot into a surface that duplicates the header gear.

**A two-page mobile settings flow (nav page, then section page with back).** Rejected for now as more state machinery than the content justifies: the horizontal strip keeps section switching one tap away with no navigation stack, and every section remains reachable without a back transition.

**Register a separate mobile-only export entry inside the picker.** Rejected because export is a low-frequency mobile gesture; the `/export` command path already reaches the same controller and dialog, so a second mobile seat would add surface without new capability.

**Drop the picker from the slot tree and render a layout-owned session list.** Rejected because project/session browsing is ui-workspace's business rendered through `sidebar.workspaces`; reimplementing it in ui-layout would duplicate the grouping, search, and dialog logic the slot system already composes.

## Consequences

Mobile gains a working settings surface, a one-tap session switcher, and a leaner header; desktop changes only in the export button's caption (icon plus tooltip). The picker reuses the existing fold-override store flag, so crossing the breakpoint in either direction still resets it. The `sidebar.footer.action` seat does not render on mobile, so its occupants (a development-time panel today) are desktop-only until a mobile seat is designed. Aria goldens across the web e2e suite changed from the captioned capsule to the labelled icon button and were refreshed in the same change.
