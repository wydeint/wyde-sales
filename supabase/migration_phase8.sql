-- ═══════════════════════════════════════════════════════════
-- WydEInt CRM v2 — Migration Phase 8
-- 1. event_customers: new status values + line_added
-- 2. jobs: payment plan fields + work_start_date
-- 3. payments: percentage + work trigger + file attachments
-- 4. handovers: work monitoring + delivery fields
-- Run in Supabase SQL Editor
-- ═══════════════════════════════════════════════════════════

-- ── 1. event_customers: update status constraint ───────────
-- Drop old constraint
alter table event_customers
  drop constraint if exists event_customers_status_check;

-- Migrate old values → new values
update event_customers set status = 'interested'     where status = 'contacted';
update event_customers set status = 'not_interested' where status = 'not_purchased';
update event_customers set status = 'not_met'        where status = 'not_talked';

-- Add new constraint
alter table event_customers
  add constraint event_customers_status_check
  check (status in ('booked','interested','not_interested','not_met','new','converted'));

-- Add line_added tracking
alter table event_customers add column if not exists line_added boolean default false;

-- ── 2. jobs: add payment plan + work schedule fields ───────
alter table jobs add column if not exists payment_plan_type  text;
  -- B2C: 'A' (100%), 'B' (50+50), 'C' (deposit+50+50)
  -- B2B: '2','3','4','5','6' (number of installments)
alter table jobs add column if not exists work_days          integer;
  -- 30 / 45 / 60 / 90
alter table jobs add column if not exists contract_date      date;
  -- วันเซ็นสัญญา
alter table jobs add column if not exists work_start_date    date;
  -- วันเริ่มงาน (set when trigger payment is paid)

-- ── 3. payments: add plan metadata + file support ──────────
alter table payments add column if not exists percentage      numeric;
  -- % of total (e.g. 50.00 = 50%)
alter table payments add column if not exists is_work_trigger boolean default false;
  -- true = paying this installment sets job.work_start_date
alter table payments add column if not exists is_final        boolean default false;
  -- true = this is the last installment (unlock handover)
alter table payments add column if not exists file_urls       text[];
  -- Google Drive URLs, max 5 files

-- ── 4. handovers: work monitoring + delivery fields ────────
alter table handovers add column if not exists job_id              text references jobs(id) on delete set null;
alter table handovers add column if not exists work_status         text default 'in_progress'
  check (work_status in ('in_progress','ready_to_deliver','delivered'));
alter table handovers add column if not exists delivery_date       date;
  -- วันที่ส่งมอบจริง
alter table handovers add column if not exists delivery_file_url   text;
  -- Google Drive URL — ใบส่งมอบที่ลูกค้าเซ็น
alter table handovers add column if not exists commission_triggered boolean default false;

-- Index
create index if not exists idx_handovers_job_id   on handovers(job_id);
create index if not exists idx_payments_job_id    on payments(job_id);
create index if not exists idx_jobs_start_date    on jobs(work_start_date);
