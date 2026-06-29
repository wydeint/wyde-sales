# Backend / auth rules

Scope: `src/middleware.ts`, `src/lib/supabase/**`, `src/app/auth/**`, `src/app/api/**`.

There is **no custom backend server**. "Backend" = Supabase (Postgres + Auth + RLS) accessed directly from the client/server via `@supabase/ssr`, plus Next.js middleware and a couple of route handlers.

## Supabase clients — pick the right one

- **`src/lib/supabase/client.ts`** → `createBrowserClient`. Use in client components (`'use client'`). This is what nearly every page imports.
- **`src/lib/supabase/server.ts`** → `createServerClient` with `await cookies()`. Use in server components, route handlers, and server actions. Its `setAll` is wrapped in `try/catch` because cookie writes throw in some server contexts — keep that.
- Never hardcode keys; both read `NEXT_PUBLIC_SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_ANON_KEY`. Only the **anon** key is used client-side — all authorization is enforced by RLS (see `rules/database.md`), never trust the client.

## Middleware — the only auth gate (handle with care)

`src/middleware.ts` runs on every matched request:
- Builds a server Supabase client from request cookies, calls `supabase.auth.getUser()`.
- **Unauthenticated** + not on `/login` or `/auth` → redirect to `/login`.
- **Authenticated** + on `/login` → redirect to `/dashboard`.
- Returns `supabaseResponse` so refreshed auth cookies propagate — **always return that response object**, not a bare `NextResponse.next()`, or sessions silently fail to refresh.

The `config.matcher` regex excludes static assets, `sw.js`, manifest, and image files. If you add a new public path (e.g. a marketing page or webhook), update **both** the matcher exclusions and the redirect conditions. A careless edit here can lock out all users or expose authenticated routes — test login + logout + deep-link-while-logged-out after any change.

## Auth flow

- `src/app/login/page.tsx` — Supabase auth UI/sign-in.
- `src/app/auth/callback/route.ts` — exchanges the OAuth `code` for a session (`exchangeCodeForSession`) then redirects to `/dashboard`. Uses the **server** client.
- Sign-out lives in `Sidebar.tsx` (`supabase.auth.signOut()` + `router.push('/login')`).

## API routes

- `src/app/api/version/route.ts` — returns `{ version }` from `VERCEL_DEPLOYMENT_ID`; `dynamic = 'force-dynamic'`, `revalidate = 0`. Drives the PWA update banner. It's the only route handler besides auth callback — most "API" work is direct Supabase queries from pages.
- If you add route handlers, use the **server** Supabase client and respect the Next.js 16 route-handler conventions (read `node_modules/next/dist/docs/`).

## Conventions

- Identify-and-insert patterns generate string IDs client-side (`CST-0001`, `JOB-001`, etc.) by reading the current max and incrementing. This is **race-prone** — acceptable for this low-concurrency internal tool, but don't build new critical-uniqueness logic on it; prefer DB defaults (`bigserial`/`uuid`) where the schema already provides them.
- Mutations are fire-and-forget `await supabase.from(...).insert/update(...)` with `if (error)` checks surfaced into local error state. Follow that pattern; surface errors in the UI, don't swallow them.
