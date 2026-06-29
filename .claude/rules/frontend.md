# Frontend rules

Scope: `src/app/**` pages, `src/components/**`, theming, PWA.

## Architecture

- **Every dashboard page is a client component** (`'use client'`). The standard shape:
  ```tsx
  'use client'
  export default function XPage() {
    const supabase = createClient()            // from '@/lib/supabase/client'
    const [rows, setRows] = useState<Row[]>([])
    const [loading, setLoading] = useState(true)
    const [fetchError, setFetchError] = useState('')
    const load = useCallback(async () => { /* setLoading; supabase.from(...).select() */ }, [])
    useEffect(() => { load() }, [load])
    // render with <TableSpinner/> / <TableError/> states
  }
  ```
- Declare typed `interface`s at the top of each page for the rows you fetch. Supabase results are cast (`data as any` / `(l as any)`) where joins make typing awkward — prefer narrowing over spreading more `any`.
- `src/app/page.tsx` just bounces to login/dashboard; auth gating is in `middleware.ts`, not in pages.
- Layout chain: root `layout.tsx` → `dashboard/layout.tsx` → `DashboardShell` (mobile sidebar/topbar) → page. Don't duplicate shell chrome inside pages.

## Next.js 16 caveat

This Next.js is **newer than your training data** (root `AGENTS.md`). Before using any framework API (routing, `cookies()`, metadata, route handlers, caching directives), read the matching guide under `node_modules/next/dist/docs/` and heed deprecation notices. Note `await cookies()` is already used (`src/lib/supabase/server.ts`) — async dynamic APIs are the norm here.

## Theming (fragile — read before changing colors)

Three cooperating pieces:
1. **`src/app/globals.css`** — defines `--text-1/2/3`, `--accent*`, `--glass-*`, `--bg-gradient`, etc. for `:root` (light) and `.dark`. Dark mode is toggled by a `.dark` class on `<html>`, driven by `@variant dark (&:is(.dark *))`.
2. **Inline anti-flash script** in root `layout.tsx` `<head>` — reads `localStorage['wyde-theme']` and sets the `.dark` class **before React hydrates**. Don't move/remove it or you reintroduce the theme flash. `suppressHydrationWarning` on `<html>` is required because of this.
3. **`ThemeProvider`** (`src/components/ThemeProvider.tsx`) — the React-side source of truth; `useTheme()` exposes `{ theme, toggle }`.

Rules:
- **Always color via CSS variables**: `style={{ color: 'var(--text-1)' }}`, `background: 'var(--glass-bg)'`. Use Tailwind classes for layout/spacing only.
- `globals.css` contains a block of `html:not(.dark) .text-[#xxxxxx]` / `.bg-[#xxxxxx]` overrides that remap legacy hardcoded GitHub-dark hex values into the light palette. If you find a hardcoded hex in a page, the fix is to switch it to a CSS variable — **not** to add another override (recent git history is a sweep doing exactly this).
- WCAG AA contrast was deliberately tuned (`--text-3` comments note ≥4.5:1). Don't lower text contrast.
- The logo inverts in dark mode via `.dark img[src="/logo.svg"]`.

## Shared UI

- Loading/empty/error: use `StateUI` (`TableSpinner`, `TableError`, `PageSpinner`, `PageError`) — they carry the accessible spinner + Thai copy + retry button. Don't hand-roll spinners or emoji.
- `cn(...)` from `@/lib/utils` for conditional class merging.
- `ui/Input.tsx`, `ui/Modal.tsx` for form controls/modals — prefer these over bespoke markup.
- Icons: `lucide-react` only.

## Localization

UI text is **Thai**. Keep new labels, buttons, toasts, and empty states in Thai, matching surrounding tone. Code identifiers stay English.

## PWA / service worker

- `public/sw.js` is intentionally minimal. The `CACHE` constant (`'wyde-sales-v4'`) is the cache-bust key — bumping it purges old caches on next activation. Supabase/`/api/`/auth/manifest requests are forced network-only; everything else is network-first with cache fallback.
- `PwaUpdateBanner` polls `/api/version` to detect new deployments. If you change deploy/version semantics, check both ends.
- `manifest.ts` + icons in `public/` (`icon-192.png`, `icon-512.png`) back the installable PWA.
