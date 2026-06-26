-- ═══════════════════════════════════════════════════════════
-- WydEInt CRM v2 — Migration Phase 7
-- Link customers (Prospects) back to origin sources
-- Run in Supabase SQL Editor
-- ═══════════════════════════════════════════════════════════

-- ── customers: add source tracking ────────────────────────
alter table customers add column if not exists lead_id             bigint references condo_leads(id) on delete set null;
alter table customers add column if not exists event_customer_id   uuid   references event_customers(id) on delete set null;
alter table customers add column if not exists source_event_id     text   references events(id) on delete set null;

-- ── Index for quick lookup ─────────────────────────────────
create index if not exists idx_customers_lead_id   on customers(lead_id);
create index if not exists idx_customers_event_cust on customers(event_customer_id);
