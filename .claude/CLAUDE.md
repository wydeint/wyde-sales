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

## Coding conventions (observed)

- **Pages are client components** (`'use client'`) that fetch directly from Supabase in `useEffect` via `createClient()` from `@/lib/supabase/client`. Data fetching is **not** done in server components.
- **Path alias `@/*` → `src/*`**.
- **Styling = inline `style={{ color: 'var(--text-1)' }}` with CSS variables**, mixed with Tailwind utility classes for layout. Always theme via the CSS variables in `globals.css`; never hardcode new raw hex colors for text/surfaces.
- **UI copy is in Thai.** Match the existing tone; keep field labels/buttons Thai.
- Loading/error states use the shared `StateUI` components (`TableSpinner`, `TableError`, `PageSpinner`, `PageError`) — reuse them, don't reinvent.
- Per-row Supabase types are often loose (`data as any`) — typed `interface`s are declared at the top of each page. Prefer tightening types over adding more `any`.
- Money formatted with `toLocaleString('th-TH')`; helper funcs (`fmtBaht`, `fmtDate`, `numVal`) are defined locally per page.
