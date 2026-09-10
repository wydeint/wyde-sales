---
version: 2
name: wyde-design-system
description: Structural design system for WydEInt sales & QC apps — typography, spacing, shape, and table rules. Color is deliberately excluded and lives in color.md. Version 2 replaces the Apple-derived scale of version 1 after a measured survey of the live app; see "How version 2 was arrived at" at the end.
source: Measured from the running app across 15 pages, then agreed with the owner. Version 1 was distilled from .claude/design/DESIGN-apple.md.
scope: wyde-sales (CRM) and future QC app. Tokens are CSS variables in globals.css (:root). Utility classes generated there: .ds-card, .ds-card-sm, .ds-card-flush, .summary-strip, .tbl-scroll, .tbl-rows, .modal-panel, .badge, .btn-*, .page-content, .field-*, .tab-*, and the .text-* scale.
---

# The four rules

Everything below follows from these. If a decision is not covered, it is
answered by asking which of these four it belongs to.

1. **Four text sizes.** 12 · 13 · 13/700 · 20. Nothing else.
2. **Four spacing values.** 4 · 8 · 16 · 24, and they must stay in that order
   of relatedness: things that belong together are closer than things that do
   not.
3. **Two corner radii.** 18 if it floats on the page background, 8 if it sits
   inside something else.
4. **One alignment rule in tables.** Everything starts on the left, header and
   cell alike. Numbers keep their column alignment through a fixed-width block,
   not through a second rule.

---

## Typography

| Role | Size / weight | Line-height | Token | Class |
|---|---|---|---|---|
| Page title | 20 / 700 | 28px | `--fs-page-title` | `.text-page-title` |
| KPI figure | 20 / 700, in `--accent` | 28px | `--fs-kpi` | `.text-kpi-money` |
| Section & card heading | 13 / 700, rule above | 20px | `--fs-section` | `.text-section-title` |
| Body, table cell, button | 13 / 400 | 20px | `--fs-body` | `.text-body` |
| Label, column header, sub-line, badge | 12 / 600 or 400 | 16px | `--fs-caption` | `.text-caption` |

**Line-height is always px, never a ratio.** 13 × 1.5 = 19.5px, and half a
pixel per line is what produced table rows of 41 · 50 · 61 · 64 · 79 instead of
one repeating height. Every value above divides by 4, so every line in the app
lands on the same grid with nobody tuning a single spot.

**Hierarchy below the page title comes from weight and a rule, not from size.**
A section heading is body size at 700 with a hairline above it — the way a
section header works on a bill of quantities. This is what lets the scale stop
at four sizes.

**12px is the floor.** Below it Thai tone marks start touching the vowel above.
8px, 10px and 11px are not available.

**Do not add a size.** `text-sm`, `text-base`, `text-lg`, `text-xl`, `text-2xl`
and `text-3xl` are remapped in `@theme` onto the four sizes, so writing them is
harmless — but writing `text-[15px]` or `style={{ fontSize: 11 }}` breaks the
system silently. If something needs to stand out, reach for weight or
`--accent` first.

## Font

**Roboto for Latin and digits, Noto Sans Thai for Thai.** Declared once in
`layout.tsx` and ordered `Roboto, Noto Sans Thai` — Roboto carries no Thai
glyphs, so Thai characters fall through on their own and no element ever needs
a font class. The two share a design brief, so a mixed line like "ห้อง A419"
sits level.

Both are web fonts the app serves, so every machine renders the same. This
matters more than it sounds: before this the app downloaded Geist and never
used it, and Thai text fell to whatever each machine had — Leelawadee UI on
Windows, Thonburi on macOS, Noto on Android — which is why spacing tuned on one
screen never looked right on another.

`font-variant-numeric: tabular-nums` is set on `body`. Money and quantities
line up in columns everywhere in this app; it is the default, not an opt-in.

## Spacing

| Relationship | Value | Token |
|---|---|---|
| Between lines inside one group (label → figure) | 4 | `--space-xxs` |
| Between items inside a component | 8 | `--space-xs` |
| Card padding · between cards · table cell sides | 16 | `--space-md` |
| Page padding · between sections of a page | 24 | `--space-lg` |

**The ordering is the rule, not the numbers.** 4 < 8 < 16 < 24 must track how
related two things are. Anywhere the gap between things that belong together is
wider than the gap between things that do not, that is a bug and it is
measurable.

A card at 16 padding sitting 16 from its neighbour puts 48 between the text of
two cards and 16 between text and its own edge — three times the distance. That
is what makes grouping read without drawing a single divider.

`--space-sm` (12) and `--space-xl` (32) still exist for the rare case, but they
are not part of the scale. Do not reach for one because 16 "feels slightly too
much" — that instinct is what produced 103 distinct spacing values.

## Shape

| | Radius | Applies to |
|---|---|---|
| Floating on the page background | **18** | cards, drawers, modals, the summary strip |
| Sitting inside something else | **8** | buttons, inputs, badges, chips, inner boxes |

`--radius-md` and Tailwind's `rounded-md/xl/2xl/3xl` are aliases onto these two.
`rounded-full` is untouched and correct: a circle on an avatar or a status dot
is a shape, not a corner.

There is one card. `.ds-card-sm` is an alias of `.ds-card` and exists only so
old markup keeps working — do not use it for new work. Use `.ds-card-flush`
for a card whose content reaches its own edge, such as one wrapping a table.

> Writing `p-4` on a `.ds-card` does nothing. `.ds-card` and the utility have
> equal specificity and `.ds-card` is declared later, so the class always wins.
> If a card needs different padding, the answer is `.ds-card-flush` or a new
> class here — not a utility that will be silently ignored.

## Tables

Wrap every table in `.tbl-scroll` and give the `<table>` `.tbl-rows`. Between
them they supply header band, row dividers, hover, cell padding, size and
alignment. A table that opts out inherits none of it.

- Header: 12 / 600 in `--text-3`, padding 8 / 16
- Cell: 13 / 400, padding 4 / 16 → **a 28px row, every row**
- **Every column starts on the left, header and cell alike.** No exceptions to
  remember, which is the point: the previous rule was correct but had six cases,
  and six cases is how columns drifted apart.
- **Numeric cells use `.num` plus a width class** and wrap their value in a
  `<span>`. The block right-aligns inside itself, so its left edge sits under
  the header while the digits still line up unit-under-unit down the column.

  `.num-money` 9ch · `.num-pct` 5ch · `.num-count` 4ch — with tabular figures
  1ch is exactly one digit. A cell whose value already arrives wrapped in a
  coloured span or a badge uses that element as the block.

Two things a script can check, and should: no column where `th` and `td`
disagree on `text-align`, and no right-aligned figure without tabular numerals.

## Summary figures

Use `components/ui/SummaryCard.tsx`. Pages pass content — `label`, `value`,
optional `sub`, optional `tone` — and never markup.

- `SummaryStrip` — one container divided by hairlines. The default, and the
  only version where every figure's left edge is guaranteed to line up, because
  there is one container instead of four.
- `SummaryCards` — separate cards, for a report page where each figure carries
  its own chart or action.

## Page layout

`Header → Filter → Summary → content`, all inside `.page-content` (24 padding,
max-width 1440, never `h-screen`). The summary must reflect the filter: if a
filter empties the list, the figures above it say so rather than reporting the
unfiltered total.

## Components

| | Shape | Padding | Type |
|---|---|---|---|
| Card | 18 | 16 | — |
| Modal / drawer | 18 | 16 | title 13 / 700 |
| Button (primary) | 8 | 4 / 18 → 28px tall | 13 / 600 |
| Input | 8 | 4 / 12 → 28px tall | 13 / 400 |
| Badge | 8 | 0 / 8 | 12 / 600 |
| Nav item | 8 | 4 / 8 | 13 / 400 |

A drawer's title is 13 / 700 — the same as a section heading, deliberately
smaller than the page title behind it. A panel that floats above the page
should not compete with the page's own name.

Inputs stay at 16px font on screens under 1024px. iOS zooms the viewport when a
focused input is below 16px; that override is a browser behaviour, not a type
decision, and it must not be removed.

---

## How version 2 was arrived at

Version 1 of this file described 9 type sizes, 5 radii and 6 spacing values.
Measuring the running app across 15 pages found what was actually rendering:

| | Version 1 said | The app was doing | Now |
|---|---|---|---|
| Text sizes | 9 | **10** (8·10·11·12·13·14·15·16·20·28) | **4** |
| Spacing values | 6 | **103** | **4** |
| Radii | 5 | **6** (4·8·11·16·18·20) | **2** |
| Font | not mentioned | Geist downloaded, never rendered | Roboto + Noto Sans Thai |
| Table cell padding | one rule | **18 combinations** across 505 cells | one rule |

Two findings are worth keeping in mind because they will recur:

**Documented ≠ rendered.** Version 1 was not wrong when written; the app drifted
away from it and nobody could see that without measuring. Any future claim about
what this app looks like should be measured, not read.

**A scale cannot have exceptions per breakpoint.** Two media blocks were
redefining all eight size tokens — and the `min-width: 1440px` one restored the
entire old scale, so on any wide monitor the tokens at `:root` were being thrown
away. One scale, every width.

### Still open

Nine components are duplicated between `my-deals/page.tsx` and
`components/ui/JobDrawer.tsx` and have drifted by **1,215 lines** — `DealDrawer`
alone by 785. They are no longer copies but two divergent implementations of the
payment-recording UI, and merging them is a correctness exercise on the money
path, not a styling one. It needs its own pass with real payment testing across
B2C A/B/C, B2B PO and instalment, and voucher.
