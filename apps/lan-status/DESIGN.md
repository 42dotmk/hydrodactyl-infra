---
name: 42.mk LAN
description: Live status of the 42.mk LAN game servers, drawn as a Half-Life VGUI server browser on an early-2000s clan site.
colors:
  steam-yellow: "#dccd5a"
  olive-ground: "#3e4637"
  vgui-panel: "#4c5844"
  row-stripe: "#3f4837"
  selected-row: "#292c21"
  bevel-light: "#8c9284"
  bevel-dark: "#292c21"
  console-text: "#dee5d7"
  muted-text: "#c6cdbe"
  lamp-on: "#9fd65b"
  lamp-wait: "#c4b550"
  lamp-off: "#6b7262"
typography:
  display:
    fontFamily: "Tahoma, \"LAN UI\", Verdana, sans-serif"
    fontSize: "22px"
    fontWeight: 700
    letterSpacing: "0.02em"
  title:
    fontFamily: "Tahoma, \"LAN UI\", Verdana, sans-serif"
    fontSize: "15px"
    fontWeight: 700
    lineHeight: 1.45
  body:
    fontFamily: "Tahoma, \"LAN UI\", Verdana, sans-serif"
    fontSize: "15px"
    fontWeight: 400
    lineHeight: 1.45
  label:
    fontFamily: "Tahoma, \"LAN UI\", Verdana, sans-serif"
    fontSize: "13px"
    fontWeight: 400
  data:
    fontFamily: "\"Lucida Console\", \"DejaVu Sans Mono\", Consolas, monospace"
    fontSize: "14px"
    fontWeight: 400
rounded:
  none: "0"
spacing:
  xs: "4px"
  sm: "8px"
  md: "12px"
  lg: "16px"
  xl: "24px"
components:
  button:
    backgroundColor: "{colors.vgui-panel}"
    textColor: "{colors.console-text}"
    typography: "{typography.label}"
    rounded: "{rounded.none}"
    padding: "4px 18px"
  button-hover:
    textColor: "{colors.steam-yellow}"
  button-disabled:
    textColor: "{colors.muted-text}"
  tab:
    backgroundColor: "{colors.vgui-panel}"
    textColor: "{colors.steam-yellow}"
    typography: "{typography.label}"
    rounded: "{rounded.none}"
    padding: "3px 14px 4px"
  tab-inactive:
    backgroundColor: "{colors.row-stripe}"
    textColor: "{colors.console-text}"
    typography: "{typography.label}"
    rounded: "{rounded.none}"
    padding: "3px 14px 3px"
  list-header:
    backgroundColor: "{colors.vgui-panel}"
    textColor: "{colors.console-text}"
    typography: "{typography.label}"
    padding: "4px 8px"
  list-row:
    backgroundColor: "{colors.row-stripe}"
    textColor: "{colors.console-text}"
    padding: "6px 8px"
  list-row-alt:
    backgroundColor: "{colors.vgui-panel}"
  list-row-hover:
    backgroundColor: "{colors.selected-row}"
  status-bar:
    backgroundColor: "{colors.olive-ground}"
    textColor: "{colors.console-text}"
    padding: "5px 8px"
  join-address:
    textColor: "{colors.steam-yellow}"
    typography: "{typography.data}"
---

# Design System: 42.mk LAN

## Overview

**Creative North Star: "The Server Browser on LAN Night, 2003"**

The page is one bevelled VGUI window, the Half-Life / CS 1.6 server browser, sitting on an olive ground, with a clan-site wall of 88x31 buttons below it. The world is drawn from its own materials: olive panels, 1px two-tone bevels, Tahoma, square status lamps, and one Steam yellow. It is dense, flat and square, and plainly legible. The live state of the servers is the only content.

It is not a status dashboard, so there are no metric tiles, cards or rounded panels. It is not the fake Matrix/neon look either: no glow, no green-on-black, no scanlines. Readability on a phone is a hard requirement, and every colour pair clears 4.6:1.

**Key Characteristics:**
- One bevelled window, with nothing nested inside it except sunken strips (status bar, list).
- 1px bevels, raised or sunken, are the only way to show depth.
- Steam yellow marks only what the visitor acts on or must find: the title, the tab, the join addresses, hover and selection.
- Server-reported data (maps, addresses) is set in a console monospace. Everything else uses the UI sans.
- The status copy is honest. "checking…" is not "offline", and stale or unreachable data says so.

## Colors

A low-chroma olive family with one warm yellow accent and three lamp colours.

### Primary
- **Steam Yellow** (steam-yellow): the single highlight. Used for the title, the active tab, join addresses, hovered server names, the hovered button label, the text-selection background and the focus outline. It is lifted from the original Steam yellow to reach 4.6:1 contrast.

### Neutral
- **Olive Ground** (olive-ground): the page background and the floor of every sunken strip (status bar, server list).
- **VGUI Panel** (vgui-panel): the window face, column headers, tab and button face. It is also the even row stripe.
- **Row Stripe** (row-stripe): the odd row stripe, a step darker than the panel.
- **Selected Row** (selected-row): the VGUI selected-row fill on hover. It is the same value as Bevel Dark.
- **Bevel Light / Bevel Dark** (bevel-light, bevel-dark): the two edges of every bevel. Bevel Dark also draws row dividers and the lamp outline.
- **Console Text** (console-text): primary text.
- **Muted Text** (muted-text): secondary text, offline and unknown rows, bot counts, the "updated" timestamp and hints.

### Status lamps
- **Lamp On** (lamp-on): the server answered.
- **Lamp Wait** (lamp-wait): the server is checking (before the first poll) or unknown (the snapshot is stale or unreachable).
- **Lamp Off** (lamp-off): the server is offline.

**The One Yellow Rule.** Steam yellow is the only accent. A new highlight reuses it and is never a new hue.

**The Honest Lamp Rule.** A row never claims to be online when the snapshot can't be trusted. When the data is stale or unreachable, every row goes to the wait lamp, muted text and "?" players, and the status bar says why.

## Typography

**UI Font:** Tahoma, with self-hosted DejaVu Sans ("LAN UI", 400/700, Latin subset) and Verdana as fallbacks.
**Data Font:** Lucida Console, with DejaVu Sans Mono and Consolas as fallbacks.

**Character:** This is the system UI of a 2003 Windows game client. It is small, bold where it matters, and never decorative. Tahoma is the world's native face, not a fallback choice.

### Hierarchy
- **Display** (700, 22px): only the title bar's "42.mk LAN", in Steam yellow.
- **Title** (700, 15px): server names, and the summary line in the status bar.
- **Body** (400, 15px/1.45, 16px at <=640px): the base size.
- **Label** (400, 13px): column headers, the tab, the button and the footer hint.
- **Data** (400, 14px, monospace): map names and join addresses. Numbers use tabular figures throughout the list and the timestamp.

**The Chrome Is Small Rule.** The window's controls and furniture sit at 13px. Only data and server names reach body size.

## Layout

A single centred column with a 920px maximum width. The body is a flex column with min-height 100dvh, so the window is vertically centred when it fits and simply scrolls from the top when it doesn't (on phones). Inside the window, every strip is inset 12px from the frame (8px at <=640px). Spacing follows a 4/8/12/16/24 rhythm. The page reads from top to bottom: title bar (the name alone), sunken status bar, the "LAN" and "Map" tabs, then the selected panel: the server list box with a footer bar holding the hint and Refresh, or the Minecraft map with a footer bar holding its hint and a "Full screen" link-button. Both are sunken panes of one shared height, max(320px, min(68vh, 620px)), so switching tabs never resizes or re-centres the window; rows start at the top of the list box and the olive ground shows below them, as in the VGUI server browser, and the header row stays put if the list ever scrolls. On phones the list takes its natural height and the map is 64vh, since the page scrolls from the top there anyway. The row of 88x31 buttons closes the page outside the window, 18px below it, with no rule between them.

**The Still One List Rule.** At <=640px the table stays one list. The header row is visually hidden. Each row becomes a grid with the lamp, server and players on the first line, and "map …" and the join address on the lines below (the map line is dropped when empty). Refresh grows to a 44px touch height.

## Elevation & Depth

There are no shadows. Depth is made only with 1px bevels. A raised element (the window, column headers, the tab, the button) has a light top-left edge and a dark bottom-right edge. A sunken element (the status bar, the server list, a pressed button) reverses the two. The only other depth cue is the lamp's 1px inset white highlight (25% alpha).

**The Bevel Grammar Rule.** Raised means it's a control or a frame. Sunken means it holds data. Pressing a button flips it from raised to sunken and shifts its label by 1px.

## Shapes

Every corner is square (radius 0). The only shapes are rectangles: frames, strips, rows, 9px square lamps and the 88x31 buttons, which are rendered with pixelated scaling.

**The No Glyph Rule.** Status lamps are drawn boxes, never emoji, icon-font glyphs or circles.

## Components

### Buttons
- **Character:** a VGUI push button.
- **Shape:** square, with a raised bevel.
- **Default:** panel face, console-text label at 13px, 4px 18px padding.
- **Hover / Active / Disabled:** the label turns Steam yellow on hover. When pressed, the bevel inverts to sunken. While a fetch is in flight, the label is muted and the cursor shows progress.
- **Focus:** a 1px dotted Steam-yellow outline with a 2px offset (this applies to every focusable element).

### Tabs
Two VGUI property-sheet tabs, LAN and Map, 2px apart. The selected tab is raised and joins the panel beneath it: its bottom edge takes the panel colour and it is nudged down 1px, so it reads as attached, and its label is in Steam yellow. The other tab sits 2px lower on the row-stripe colour with a Bevel Dark bottom edge, so it is not attached; its label is body text and turns yellow on hover. Arrow keys, Home and End move between them, and `#map` in the address selects the Map tab. The map loads only the first time its tab opens.

### Status bar
A sunken strip. On the left is the bold summary ("N of M servers online · P players", "checking servers…" or "status unknown"). On the right is the muted timestamp ("updated 12s ago", or "last update 3 min ago · data is stale / status service unreachable, retrying"). It wraps to two lines on phones.

### Server list (signature)
A sunken table with raised column headers (lamp, Server, Map, Players, Join). Rows alternate between row-stripe and panel, with Bevel Dark dividers. Hovering a row fills it with the selected-row colour and turns the server name yellow. Row states:
- **online:** lamp on, bold name, map, and players as "N/max" with "+B bots" muted.
- **checking:** wait lamp, and the players cell reads "checking…".
- **offline:** lamp off, every cell muted at 400 weight, and the players cell reads "offline".
- **unknown:** wait lamp, muted cells, "?" players and no map.

The join address is always yellow monospace and selects as a whole on click (`user-select: all`).

### 88x31 button wall
A centred, wrapping row of 88x31 badges with 6px gaps. They are period artefacts from the GeoCities archive (hellnet.work/8831), self-hosted.

## Do's and Don'ts

### Do:
- **Do** build every new surface from the bevel grammar: raised for frames and controls, sunken for data.
- **Do** keep Steam yellow for the title, the tab, the join addresses and interaction feedback.
- **Do** set server-reported values in the data monospace with tabular figures.
- **Do** self-host every font and image (the CSP is `default-src 'self'`).
- **Do** keep every text and background pair at or above 4.6:1, on both row stripes.

### Don't:
- **Don't** add cards, metric tiles, rounded corners or soft drop shadows. This is a server browser, not a dashboard.
- **Don't** use glow, neon green-on-black, scanlines or other fake-Matrix "hacker" styling.
- **Don't** show a green lamp or "online" when the snapshot is stale or unreachable.
- **Don't** split the list into per-server cards on phones. Reflow rows instead.
- **Don't** introduce a second accent hue or a display face beyond Tahoma bold.
