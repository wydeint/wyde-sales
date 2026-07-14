# WydEInt Super Sales — Project Guide

> **Read this before touching code.** Domain-specific deep dives live in `.claude/rules/`.

## What this is

A Thai-language interior-design sales CRM (PWA) for **WydEInt Interior** — tracks the full sales lifecycle for condo interior packages: lead pool → prospects → pipeline (Kanban) → jobs/clients → payments → handover → commission → finance/executive reporting.

## Tech stack

- **Next.js 16.2.9** (App Router) — ⚠️ this is a newer Next.js than your training data; APIs differ. Read `node_modules/next/dist/docs/` before using framework features (per root `AGENTS.md`).
- **React 19.2** + **TypeScript 5** (strict mode)
- **Tailwind CSS v4** (`@import "tailwindcss"`, CSS-first config — no `tailwind.config.js`)
- **Supabase** (`@supabase/ssr` + `@supabase/supabase-js`) — Postgres + Auth + Row Level Security. This is the entire backend; there is no custom API server.
- **lucide-react** icons, **xlsx** (SheetJS) for spreadsheet import, **clsx** + **tailwind-merge** (`cn()` helper)
- Deployed on **Vercel**. PWA via `public/sw.js` + `manifest.ts`.

## Key directories

| Path | What it holds |
|------|---------------|
| `src/app/` | App Router routes. Root `layout.tsx` sets theme/fonts/PWA; `page.tsx` redirects. |
| `src/app/dashboard/` | The actual app — one folder per feature page (leads, customers, pipeline, jobs, payments, handover, events, commission, revenue, warranty, executive, finance, daily-report, documents, projects, users, targets, settings, quick). `layout.tsx` wraps all in `DashboardShell`. |
| `src/app/login/`, `src/app/auth/callback/` | Supabase auth entry + OAuth code exchange. |
| `src/app/api/version/` | Single API route — returns build id for the PWA update banner. |
| `src/components/` | Shared UI: `DashboardShell`, `Sidebar`, `ThemeProvider`, `PwaUpdateBanner`, and `ui/` primitives (`Input`, `Modal`, `StateUI`). |
| `src/lib/supabase/` | `client.ts` (browser) and `server.ts` (server component / route) Supabase factories. |
| `src/lib/utils.ts` | `cn()` class-merge helper. |
| `src/middleware.ts` | Auth gate — redirects unauthenticated users to `/login`. |
| `supabase/` | `schema.sql` + ordered `migration_phase1b…8.sql`. **Run manually in the Supabase SQL Editor.** |
| `google sheet for study/` | Reference `.xlsx` source files the CRM models. **Not code — do not import or edit.** |

## How to run / build / test

```bash
npm run dev      # dev server at http://localhost:3000
npm run build    # production build
npm run start    # serve production build
npm run lint     # eslint (next core-web-vitals + typescript)
npx tsc --noEmit # type-check (no test suite exists)
```

Requires `.env.local` with `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` (see `.env.example`). **There is no automated test suite** — verify changes by running the app and exercising the affected page.

## Off-limits — do NOT modify

- `node_modules/`, `.next/`, `.vercel/`, `package-lock.json`, `*.tsbuildinfo`, `next-env.d.ts` — generated/vendored.
- Root `AGENTS.md` / `CLAUDE.md` — these are the auto-managed Next.js agent rules block.
- `google sheet for study/*.xlsx` — reference data, not part of the app.
- `supabase/schema.sql` and existing `migration_phase*.sql` — **treat as an applied, append-only history.** Never rewrite a migration that has already been run against the live DB; add a new `migration_phaseN.sql` instead.

## Caution zones (fragile logic) — read `.claude/rules/` first

1. **`src/middleware.ts`** — the only auth boundary. Its `matcher` regex and the redirect rules govern access to every route. A wrong edit either locks everyone out or exposes the app. See `rules/backend.md`.
2. **Database schema is split across `schema.sql` + 9 migrations** — `schema.sql` alone is **out of date**. Tables/columns used in code (`condo_leads`, `jobs`, `finance_entries`, `customers.budget`, `customers.interested_room`, `commissions`, status-enum changes) only exist after later migrations. Always reconcile against the migrations + live DB. See `rules/database.md`.
3. **RLS policies are role-gated** (`get_my_role()` reads `users.role`). Querying from the client respects RLS — a "missing data" bug is often a policy, not the query. See `rules/database.md`.
4. **Theme system** — `globals.css` CSS variables + an inline anti-flash script in root `layout.tsx` + per-class light/dark overrides. Hardcoded hex colors are intentionally remapped in CSS. See `rules/frontend.md`.
5. **PWA service worker** (`public/sw.js`) — bumping `CACHE` (`wyde-sales-v4`) controls cache invalidation for all users. Mishandling strands users on stale assets.
6. **Client-side ID generation** (e.g. `CST-0001` via `max+1` in `leads/page.tsx`) is race-prone under concurrent writes. Be cautious extending this pattern.

## Design system — follow before writing any UI

All new UI **must** follow `.claude/design/design.md`. The tokens are live in `globals.css`:

| Token group | CSS variables | Utility classes |
|-------------|--------------|-----------------|
| Spacing | `--space-xxs/xs/sm/md/lg/xl` | use inline or via classes |
| Radius | `--radius-sm/md/lg/pill` | used inside all utility classes |
| Font size | `--fs-body/caption/label/section/page-title/kpi/micro` | `.text-page-title`, `.text-section-title`, etc. |
| Font weight | `--fw-regular/medium/semibold/bold` | used inside utility classes |
| Card | — | **`.ds-card`** (standard), **`.ds-card-sm`** (compact) |
| Modal | — | **`.modal-backdrop` + `.modal-panel` + `.modal-header` + `.modal-title`** |
| Badge / status | — | **`.badge .badge-green/.blue/.purple/.orange/.red/.gray`** |
| Buttons (colored) | — | **`.btn-green` `.btn-blue` `.btn-purple`** |
| Buttons (neutral) | — | **`.btn-util`** |
| Page wrapper | — | **`.page-content`** (p-lg, p-md on mobile) |
| Form | — | **`.field-label` `.field-input`** |
| Tabs | — | **`.tab-group` `.tab-btn` `.tab-btn.active`** |

**Rules:**
- Never hardcode `border-radius`, `padding`, or `font-size` as raw px — use the CSS variables above.
- Never use Tailwind `text-blue-400`, `text-red-400`, `bg-green-500` etc. for semantic colors — use `var(--accent-*)` or `.badge-*` classes.
- Cards → always `.ds-card` or `.ds-card-sm`. No bespoke `background: var(--card-bg)` inline.
- Modals → always `.modal-backdrop` + `.modal-panel`. No bespoke `fixed inset-0 z-50` per page.
- Page root div → always `className="page-content"`.

## Layout — Drawer & Modal positioning rules

### Standard pattern (ใช้ทุกหน้า)

Bottom-sheet บน iPhone, centered บน desktop — **ห้ามเบี่ยง**

```tsx
{/* Container */}
<div
  className="fixed inset-0 z-50 flex items-end sm:items-center justify-center px-4 pb-4 pt-14 lg:pt-4"
  onClick={onClose}
>
  {/* Backdrop */}
  <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
  {/* Panel */}
  <div
    className="relative w-full max-w-lg max-h-[90vh] overflow-y-auto rounded-[20px] shadow-2xl"
    style={{ background: 'var(--panel-bg)', border: '1px solid var(--card-border)' }}
    onClick={e => e.stopPropagation()}
  >
    …
  </div>
</div>
```

### Variant: backdrop แยกไฟล์ (pointer-events-none)

ใช้เมื่อ backdrop และ panel ต้องอยู่คนละ z-index layer:

```tsx
{/* Backdrop layer */}
<div className="fixed inset-0 z-40 bg-black/60 backdrop-blur-sm" onClick={onClose} />
{/* Panel layer */}
<div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center px-4 pb-4 pt-14 lg:pt-4 pointer-events-none">
  <div className="… pointer-events-auto">…</div>
</div>
```

### Padding อธิบาย

| Class | เหตุผล |
|---|---|
| `pt-14` | เคลียร์ mobile top nav bar (`h-14` = 56px) บน iPhone |
| `lg:pt-4` | Desktop ไม่มี top bar — ใช้ spacing ปกติ |
| `px-4 pb-4` | ระยะห่างซ้าย/ขวา/ล่าง |

### กฎ

| กฎ | รายละเอียด |
|---|---|
| **`items-end sm:items-center`** | ทุก main drawer ใช้ pattern นี้เสมอ — bottom-sheet บน iPhone, centered บน desktop |
| **ห้าม `items-center` บน mobile drawer** | ทำให้ panel ลอยกลางหน้าจอ ไม่ consistent กับ UX มาตรฐาน |
| **ห้าม `env(safe-area-inset-*)` โดยไม่มี `viewport-fit=cover`** | ค่าจะเป็น 0px เสมอ ไม่มีผล และ `viewport-fit=cover` ทำให้ app ขยับทับขอบ notch |
| **ห้าม `viewport-fit=cover`** | ทำให้ content ทั้งหมดขยายไปทับ notch เพราะ app shell ไม่มี safe-area padding รองรับ |
| **Backdrop แยกจาก panel** | `absolute inset-0` backdrop ใน container เดียวกัน หรือใช้ `z-40/z-50` layer pattern |
| **`max-h-[90vh] overflow-y-auto`** | Panel ต้องเลื่อนภายใน container ไม่ให้ล้น viewport |

### อย่าทำ ❌

```tsx
{/* ❌ items-center เฉยๆ บน mobile — panel ลอยกลาง ไม่ consistent */}
<div className="fixed inset-0 flex items-center justify-center p-4">

{/* ❌ backdrop opacity ต่ำกว่า 60% — page content โชว์ผ่าน overlay */}
<div style={{ background: 'rgba(0,0,0,0.30)' }} />   // ❌
<div style={{ background: 'rgba(0,0,0,0.45)' }} />   // ❌

{/* ❌ panel ใช้ card-bg แทน panel-bg — ใสในบาง theme */}
<div style={{ background: 'var(--card-bg)' }}>  {/* drawer panel ❌ */}

{/* ❌ env(safe-area-inset-top) โดยไม่มี viewport-fit=cover — ค่าเป็น 0 */}
<div style={{ paddingTop: 'env(safe-area-inset-top)' }}>

{/* ❌ viewport-fit=cover — ทำให้ทั้งแอปขยับทับ notch */}
export const viewport: Viewport = { viewportFit: 'cover' }
```

### Backdrop & Panel — กฎเด็ดขาด

| สิ่งที่ใช้ | ถูก | ผิด |
|---|---|---|
| Backdrop Tailwind class | `bg-black/60 backdrop-blur-sm` | `style={{ background: 'rgba(0,0,0,0.X)' }}` |
| Backdrop opacity | **60%** (`/60`) เสมอ | ≤45% ทำให้หน้าโชว์ผ่าน |
| Drawer/modal panel background | `var(--panel-bg)` | `var(--card-bg)` (ใสในบาง theme) |

---

## Coding conventions (observed)

- **Pages are client components** (`'use client'`) that fetch directly from Supabase in `useEffect` via `createClient()` from `@/lib/supabase/client`. Data fetching is **not** done in server components.
- **Path alias `@/*` → `src/*`**.
- **Styling = inline `style={{ color: 'var(--text-1)' }}` with CSS variables**, mixed with Tailwind utility classes for layout. Always theme via the CSS variables in `globals.css`; never hardcode new raw hex colors for text/surfaces.
- **UI copy is in Thai.** Match the existing tone; keep field labels/buttons Thai.
- Loading/error states use the shared `StateUI` components (`TableSpinner`, `TableError`, `PageSpinner`, `PageError`) — reuse them, don't reinvent.
- Per-row Supabase types are often loose (`data as any`) — typed `interface`s are declared at the top of each page. Prefer tightening types over adding more `any`.
- Money formatted with `toLocaleString('th-TH')`; helper funcs (`fmtBaht`, `fmtDate`, `numVal`) are defined locally per page.
