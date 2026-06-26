-- ═══════════════════════════════════════════════════════════
-- WydEInt CRM v2 — Migration Phase 6
-- 1. Fix event_customers.status check constraint
-- 2. Add admin_sales write permission to event_customers
-- 3. Add jobs.lead_id (in case phase5 was run without it)
-- Run in Supabase SQL Editor
-- ═══════════════════════════════════════════════════════════

-- ── 1. Fix status check constraint ────────────────────────
-- Drop old constraint first, then add new one
alter table event_customers
  drop constraint if exists event_customers_status_check;

alter table event_customers
  add constraint event_customers_status_check
  check (status in ('booked','contacted','not_purchased','not_talked','new','converted'));

-- ── 2. Allow admin_sales to write event_customers ──────────
drop policy if exists "event_customers_write" on event_customers;

create policy "event_customers_write" on event_customers for all using (
  get_my_role() in ('admin','admin_sales','sales')
);

-- ── 3. jobs.lead_id (safe re-run) ─────────────────────────
alter table jobs add column if not exists lead_id bigint references condo_leads(id) on delete set null;

-- ── 4. jobs.customer_name (store display name for B2C auto-fill) ──
alter table jobs add column if not exists customer_name text;
