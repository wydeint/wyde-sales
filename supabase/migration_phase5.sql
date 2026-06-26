-- ═══════════════════════════════════════════════════════════
-- WydEInt CRM v2 — Migration Phase 5
-- 1. events.event_type column
-- 2. handovers: add business-flow fields
-- Run in Supabase SQL Editor
-- ═══════════════════════════════════════════════════════════

-- ── 1. Events ─────────────────────────────────────────────
alter table events add column if not exists event_type text;

-- ── 2. Handovers — add interior-work delivery fields ──────
alter table handovers add column if not exists client_type       text check (client_type in ('B2C','B2B')) default 'B2C';
alter table handovers add column if not exists job_start_date    date;
alter table handovers add column if not exists work_days         integer;     -- 15,30,45,60 วัน
alter table handovers add column if not exists expected_completion date;       -- auto = start + work_days
alter table handovers add column if not exists total_amount      numeric;     -- มูลค่างาน
alter table handovers add column if not exists final_payment_date date;       -- วันเก็บเงินงวดสุดท้าย (= วันรับรู้รายได้)
alter table handovers add column if not exists warranty_days     integer;     -- ระยะประกัน
alter table handovers add column if not exists warranty_end      date;        -- auto = handover_date + warranty_days
alter table handovers add column if not exists lead_id           bigint references condo_leads(id) on delete set null;
