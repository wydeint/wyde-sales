---
version: alpha
name: wyde-design-system
description: Structural design system for WydEInt sales & QC apps — typography, component grammar, and responsive rules adapted from Apple's design language, with color deliberately excluded. Existing app color tokens (--accent, --accent-green/purple/blue/orange, --text-1/2/3, --card-bg, etc. in globals.css) stay as-is; this file only governs scale, shape, weight, and layout rhythm.
source: Distilled from .claude/design/DESIGN-apple.md — see that file for the full Apple.com analysis this was adapted from.
scope: Applies to wyde-sales (CRM) and future QC app. Not yet applied to any code — this is a reference for when a rollout is approved.

typography:
  page-title:
    fontSize: 20px
    fontWeight: 700
    lineHeight: 1.25
    letterSpacing: -0.01em
  section-title:
    fontSize: 15px
    fontWeight: 600
    lineHeight: 1.3
    letterSpacing: -0.005em
  card-title:
    fontSize: 13px
    fontWeight: 600
    lineHeight: 1.3
    letterSpacing: 0
  body:
    fontSize: 13px
    fontWeight: 400
    lineHeight: 1.5
    letterSpacing: 0
  body-strong:
    fontSize: 13px
    fontWeight: 600
    lineHeight: 1.4
    letterSpacing: 0
  caption:
    fontSize: 12px
    fontWeight: 400
    lineHeight: 1.4
    letterSpacing: 0
  label-uppercase:
    fontSize: 11px
    fontWeight: 600
    lineHeight: 1.3
    letterSpacing: 0.04em
  kpi-number:
    fontSize: 28px
    fontWeight: 700
    lineHeight: 1.1
    letterSpacing: -0.01em
  micro:
    fontSize: 10px
    fontWeight: 400
    lineHeight: 1.3
    letterSpacing: 0

radius:
  none: 0px
  sm: 8px
  md: 11px
  lg: 18px
  pill: 9999px

spacing:
  xxs: 4px
  xs: 8px
  sm: 12px
  md: 16px
  lg: 24px
  xl: 32px

components:
  card:
    rounded: "{radius.lg}"
    padding: "{spacing.lg}"
    border: "1px solid var(--divider)"
    shadow: none
  modal:
    rounded: "{radius.lg}"
    padding: "{spacing.lg}"
    shadow: "one subtle overlay shadow allowed — the only shadow exception"
  button-primary:
    rounded: "{radius.pill}"
    padding: "8px 18px"
    fontWeight: 600
    activeState: "transform: scale(0.95)"
  button-utility:
    rounded: "{radius.sm}"
    padding: "8px 15px"
    fontWeight: 400
  input:
    rounded: "{radius.sm}"
    padding: "8px 12px"
    border: "1px solid var(--divider)"
  chip-badge:
    rounded: "{radius.pill}"
    padding: "4px 10px"
    fontSize: "{typography.caption.fontSize}"
    fontWeight: 600
  nav-item:
    rounded: "{radius.md}"
    padding: "8px 12px"
  table-row:
    padding: "10px 12px"
    divider: "1px solid var(--divider) between rows, no per-cell borders"
---

## Overview

This is the **non-color** subset of `DESIGN-apple.md`, agreed with the user after a pilot attempt: keep Apple's structural discipline (type scale, radius grammar, shadow restraint, spacing rhythm, responsive rules) but leave the existing wyde-sales color system (indigo accent, glass surfaces, semantic status colors) untouched. Nothing in this file has been applied to code yet — it's a reference for a future, deliberately-scoped rollout.

**What this buys the app**, distilled from the earlier discussion:
- **Typography** — replaces ad hoc `text-xs/sm/base` per page with a real scale. Weight ladder is 400 / 600 / 700 only (no 500), matching Apple's discipline. Sizes below are already scaled down from Apple's marketing-site numbers (which run 17–56px) to fit a dense CRM table/card UI.
- **Components** — the codebase currently mixes three radius scales (`rounded-full` / `rounded-xl` / `rounded-2xl`) with no rule for which to use where, and has no shared card/button abstraction (every page hand-rolls markup). This section fixes that with one scale and one button grammar.
- **Responsive** — codifies touch-target minimums and grid-collapsing behavior as one rule set instead of per-page judgment calls.

## Typography

| Token | Size | Weight | Line height | Tracking | Use |
|---|---|---|---|---|---|
| `page-title` | 20px | 700 | 1.25 | -0.01em | Page `<h1>` (e.g. "สวัสดีตอนบ่ายคุณ...") |
| `section-title` | 15px | 600 | 1.3 | -0.005em | Card/section headers ("Pipeline", "Sales เดือนนี้") |
| `card-title` | 13px | 600 | 1.3 | 0 | KPI card labels, table column headers |
| `body` | 13px | 400 | 1.5 | 0 | Default paragraph/cell text |
| `body-strong` | 13px | 600 | 1.4 | 0 | Emphasized inline text (names, totals) |
| `caption` | 12px | 400 | 1.4 | 0 | Secondary/muted text, sub-labels |
| `label-uppercase` | 11px | 600 | 1.3 | 0.04em | Field labels, section eyebrows (matches existing `.field-label`) |
| `kpi-number` | 28px | 700 | 1.1 | -0.01em | Big dashboard numbers (revenue, counts) |
| `micro` | 10px | 400 | 1.3 | 0 | Timestamps, fine print |

**Rules:**
- Weight is always 400, 600, or 700 — never 500. If something needs "a bit more than regular," use 600, not a mid-weight.
- Negative letter-spacing only on `page-title`/`section-title`/`kpi-number` (headline-scale text). Body/caption/micro stay at 0 tracking — Apple's tight tracking is a *display-size* effect, not a body-copy one.
- Thai text: keep line-height ≥1.4 even where the table above shows tighter English defaults — Thai vowel/tone marks need more vertical room than Latin text.

## Shape & Elevation (non-color structural rules)

| Token | Value | Use |
|---|---|---|
| `radius.none` | 0px | Full-bleed banners only (rare in a CRM) |
| `radius.sm` | 8px | Inputs, selects, utility buttons, table row hover chips |
| `radius.md` | 11px | Sidebar/nav items, small popovers |
| `radius.lg` | 18px | Cards, modals, table containers |
| `radius.pill` | 9999px | Primary action buttons, search bars, status chips/badges |

**Elevation rule:** no shadow on cards, buttons, or persistent chrome. The one exception is a floating overlay (modal, dropdown menu) that needs to visually separate from the page behind it — that's the only place a shadow is allowed, and it should be subtle (not the current heavy glass-blur shadow).

**Don't mix radius grammars** — a component either takes `sm` (utility), `md` (nav), `lg` (container), or `pill` (action). Nothing should land at an arbitrary in-between value like the current `rounded-xl` (12px, used for everything today).

## Components

- **Card** — `radius.lg`, `spacing.lg` internal padding, 1px hairline border (`var(--divider)`), no shadow. Replaces today's blurred `.glass-card`.
- **Modal** — same as card, `radius.lg`, but keeps one subtle shadow for overlay separation (the sole shadow exception system-wide).
- **Button (primary)** — pill radius, `8px 18px` padding, weight 600, `scale(0.95)` on press. One shape for every "primary action" button app-wide, replacing the current per-page `.btn-green/.btn-purple/.btn-blue` split (color choice for these stays as-is — this only standardizes the *shape*).
- **Button (utility)** — `radius.sm`, `8px 15px` padding, weight 400. For secondary/icon-adjacent actions (e.g. sidebar theme toggle, sign-out).
- **Input / Select / Textarea** — `radius.sm`, `8px 12px` padding, 1px hairline border. Not pill — a multi-field CRM form in all-pill inputs reads wrong; pill is reserved for the button/badge/search grammar.
- **Chip / status badge** — pill radius, `4px 10px` padding, `caption` size at weight 600. Structural shape only; the fill color stays whatever status color it already uses.
- **Nav item (Sidebar)** — `radius.md`, `8px 12px` padding.
- **Table row** — `10px 12px` cell padding, a single 1px divider between rows instead of per-cell borders, no zebra-striping via background unless a hover state.

## Responsive

| Breakpoint | Width | Behavior |
|---|---|---|
| Mobile | ≤ 640px | Single-column stack; KPI grid → 1 col; Sidebar becomes the existing slide-over drawer |
| Tablet | 641–1023px | KPI grid → 2 col; multi-column forms collapse to 1 col |
| Desktop | 1024–1439px | Full layout; KPI grid → 4 col |
| Wide | ≥ 1440px | Content max-width caps, extra space becomes margin — don't stretch tables/cards edge to edge |

**Touch targets:** minimum 44×44px for any tappable element on mobile (buttons, nav items, icon buttons) — matches Apple's rule and is already partially followed via the app's `.touch-target` utility; this just makes it universal.

**Collapsing rule of thumb:** grids collapse by halving column count at each breakpoint down (4→2→1), not by shrinking card content — a card should never get so narrow its text wraps awkwardly. If a table can't fit at a breakpoint, it scrolls horizontally (`.tbl-scroll`, already in use) rather than compressing columns.

## Explicit exclusions

- **No color tokens.** Existing `--accent`, `--accent-green/purple/blue/orange`, `--text-1/2/3`, `--card-bg`, glass/gradient variables in `globals.css` are unchanged by this doc. Any component spec above that would normally reference a brand color (e.g. Apple's Action Blue button fill) instead just says "use the existing accent/status color" — pick the hue, this file only dictates the shape.
- **No photography/marketing components** (hero tiles, footer, product configurator) — not applicable to a CRM.
- Not yet applied to any file — this is the agreed reference for a future scoped rollout (start with Card/Button/Modal/Input since those are reused most, per the earlier pilot discussion).
