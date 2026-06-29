# Database rules

Scope: `supabase/schema.sql`, `supabase/migration_phase*.sql`, and all Supabase queries in code.

## How the schema is managed

- Postgres lives in **Supabase**. There is **no ORM and no automated migration runner** — every `.sql` file is **run by hand in the Supabase SQL Editor**, in order:
  `schema.sql` → `migration_phase1b` → `2` → `2b` → `3` → `4` → `5` → `6` → `7` → `8`.
- **`schema.sql` is NOT the current schema.** It is Phase 1 only. Later migrations add tables and columns and *alter constraints*. Always reconcile against the full migration chain (and ideally the live DB via the Supabase MCP `list_tables`) before assuming a column exists.

### What the migrations add (high level)

- **phase1b** — `customers`: `name` (generated), `line_id`, `budget`, `interested_room`, `notes`; new **`commissions`** table.
- **phase2 / 2b** — **`jobs`** table (1 customer → many jobs, PO/SO, B2C/B2B) + delivery/accounting-status fields.
- **phase3** — **`condo_leads`** table (the "Origin Pool", `bigserial` id, imported from xlsx).
- **phase4** — **`finance_entries`** (company income/expense ledger).
- **phase5** — `events.event_type`; many sales-tracking columns on `event_customers`.
- **phase6** — rewrites `event_customers.status` check constraint; grants `admin_sales` write; `jobs.lead_id`.
- **phase7** — `customers.lead_id` / `event_customer_id` / `source_event_id` (source attribution) + indexes.
- **phase8** — migrates `event_customers.status` enum values again; adds payment-plan / work-trigger / file-attachment fields across `jobs`, `payments`, `handovers`.

> Because status enums were changed in phases 6 and 8, **don't trust the enum lists in `schema.sql`** — check the latest migration that touched that constraint.

## Adding schema changes

- **Append-only.** Never edit a migration that has already been applied to the live DB; its effects are baked in. Create the next file `supabase/migration_phaseN.sql` with the same header style.
- Use idempotent DDL: `create table if not exists`, `add column if not exists`, `drop constraint if exists` then re-add. This matches the existing files and makes re-runs safe.
- When changing a `check` constraint enum, follow the phase-6/8 pattern: drop the old constraint, migrate existing rows to new values, add the new constraint.
- Provide indexes for new foreign keys / hot filter columns (the codebase does this consistently).

## Row Level Security (critical for debugging)

RLS is **enabled on every table** and is the real authorization layer (the client only ever holds the anon key).

- Two `security definer` helpers drive policies: `get_my_role()` and `get_my_user_id()` — both look up the row in `users` by `auth.jwt() ->> 'email'`. **A logged-in auth user with no matching `users` row has no role and will see nothing.**
- Roles: `admin`, `sales`, `admin_sales`, `executive`, `finance`. Levels: `staff…md`.
- Typical pattern: broad `select` for most roles; `insert`/`update` limited to `admin`/`sales`/`admin_sales`; `delete` admin-only; per-user scoping for `daily_reports` and `sales_targets`.
- **Debugging "data is missing / insert silently fails":** suspect RLS first, not the query. A `select` returning `[]` or an `insert` returning a policy error usually means the current user's role isn't permitted. Verify with the role, not by loosening the query.

## Querying conventions

- Client pages call `supabase.from('table').select('cols, relation(col)')` with `.eq/.order/.limit`. Embedded relations (e.g. `projects(name)`) rely on FK definitions in the schema.
- Always check the returned `error` and surface it; don't assume success.
- Money columns are `numeric`; dates are `date` (formatted to `YYYY-MM-DD` strings in JS before insert — see `fmtDate`).
- Keep generated/identity columns (`bigserial`, `uuid_generate_v4()`, the `name` generated column) out of insert payloads.
