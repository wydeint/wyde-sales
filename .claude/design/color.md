---
version: alpha
name: wyde-color-system
description: Semantic color tokens for WydEInt CRM. Documents purpose and usage rules — not hex values. All hex values live in globals.css (:root for light, .dark for dark). Never hardcode hex in components; always use var(--token).
scope: wyde-sales CRM. Extends design.md (which deliberately excludes color).
---

## Guiding principle

One token per semantic role. Components never reference hex — they reference purpose.
Dark mode is handled entirely by the token layer; components require zero dark-mode code.

---

## Accent tokens

| Token | Light | Dark | Semantic role |
|---|---|---|---|
| `--accent` | #6366f1 (indigo) | #818cf8 | Primary action: selected state, active tab, focus ring, primary button fill |
| `--accent-green` | #059669 | #34d399 | Success / positive: paid, active, ผ่าน QC, deal won |
| `--accent-red` | #dc2626 | #f87171 | Error / negative: overdue, reject, ยกเลิก, validation fail |
| `--accent-blue` | #2563eb | #60a5fa | Info / neutral numeric: progress %, reference number, info badge |
| `--accent-orange` | #ea580c | #fb923c | Warning / pending: booked-not-closed, งานค้างส่ง, ใกล้ครบกำหนด |
| `--accent-amber` | #d97706 | #fbbf24 | Commission / gold KPI: ค่าคอม, KPI number highlights, tier badge, award |
| `--accent-purple` | #7c3aed | #a78bfa | Premium / tier: high-value customer tag, executive highlight |

---

## Text tokens

| Token | Role |
|---|---|
| `--text-1` | Primary text — headings, labels, values |
| `--text-2` | Secondary text — descriptions, sub-labels |
| `--text-3` | Muted text — placeholders, timestamps, disabled |

---

## Surface tokens

| Token | Role |
|---|---|
| `--card-bg` | Card and panel background |
| `--card-border` | Card border |
| `--panel-bg` | Modal and drawer background (slightly more opaque than card) |
| `--input-bg` | Form field background |
| `--hover-bg` | Row hover, subtle highlight |
| `--active-bg` | Selected row, active nav item |
| `--divider` | Horizontal rules, table borders, section separators |
| `--glass-bg` | Glass card background (backdrop-blur context) |
| `--glass-border` | Glass card border |
| `--sidebar-bg` | Sidebar navigation background |

---

## Badge usage guide

Use `.badge` + color modifier. Never write custom background/color for a status chip.

```tsx
<span className="badge badge-green">ชำระแล้ว</span>
<span className="badge badge-red">เกินกำหนด</span>
<span className="badge badge-orange">รอดำเนินการ</span>
<span className="badge badge-amber">ค่าคอม</span>
<span className="badge badge-blue">ข้อมูล</span>
<span className="badge badge-purple">Premium</span>
<span className="badge badge-gray">ยกเลิก / n/a</span>
```

---

## Color usage rules

### Do
- Use `var(--accent-amber)` for all commission values, gold KPI numbers, and tier highlights
- Use `var(--accent-orange)` for warnings and pending states (not amber — orange = action needed)
- Use `var(--accent-green)` / `var(--accent-red)` as a pair for pass/fail and paid/overdue
- Use `color-mix(in srgb, var(--accent-*) 15%, transparent)` for tinted backgrounds (matches `.badge-*` pattern)

### Don't
- Don't hardcode `#fbbf24`, `#4ade80`, `#f87171`, etc. — use the token
- Don't use `--accent-amber` for warnings — amber = value/achievement, orange = attention needed
- Don't use `--accent-blue` for primary actions — blue = informational only, indigo (`--accent`) is the action color
- Don't invent new one-off colors for a new status — map it to the nearest existing semantic token

---

## Special-purpose colors (intentional one-offs)

These are NOT tokens — they are brand-specific values that must not be standardized.

| Value | Where used | Why |
|---|---|---|
| `#06C755` | LINE messaging button | LINE brand color — must match exactly |
