-- ═══════════════════════════════════════════════════════════
-- WydEInt CRM v2 — Migration Phase 2b (patch jobs table)
-- Run AFTER migration_phase2.sql
-- ═══════════════════════════════════════════════════════════

-- Add delivery tracking fields to jobs
alter table jobs
  add column if not exists delivery_lot      text,           -- Lot 1, Lot 2, Lot 3...
  add column if not exists accounting_status text default 'Backlog'
    check (accounting_status in ('Backlog','FC','Backlog พต','New Sale 2025','New Sale 2026')),
  add column if not exists year_sold         integer,        -- ปีที่ขาย (2024, 2025, 2026)
  add column if not exists plan_transfer_month text;         -- แผนโอน/ส่งมอบ เช่น "Sep", "Q3 2026"
