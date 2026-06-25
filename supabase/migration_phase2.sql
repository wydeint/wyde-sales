-- ═══════════════════════════════════════════════════════════
-- WydEInt CRM v2 — Migration Phase 2
-- Run in Supabase SQL Editor AFTER migration_phase1b.sql
-- ═══════════════════════════════════════════════════════════

-- ─────────────────────────────────────────
-- JOBS (ทะเบียนงาน — เทียบเท่า Sheet "ลค. Event")
-- 1 customer → many jobs (PO/SO per job)
-- ─────────────────────────────────────────
create table if not exists jobs (
  id                  text primary key,           -- JOB-001
  customer_id         text references customers(id) on delete cascade,
  project_id          text references projects(id),
  room_no             text,

  -- ── Order identity ──
  customer_type       text default 'B2C' check (customer_type in ('B2C','B2B')),
  company_name        text,                        -- B2B only
  po_no               text,                        -- Origin PO number
  so_no               text,                        -- Wyde SO number
  work_type           text,                        -- N-RPT/Event | N-RPT/EQ | RPT | N-RPT | B2B
  package_type        text,                        -- Combo S / Medium M / Premium L / Design&turnkey / etc.
  order_date          date,

  -- ── Revenue & Cost ──
  revenue_ex_vat      numeric default 0,           -- Revenue(Ex.Vat)
  revenue_inc_vat     numeric default 0,           -- Revenue(Inc.Vat)
  transfer_amount     numeric default 0,           -- ยอดโอน (จาก Origin)
  voucher             numeric default 0,
  cost                numeric default 0,
  -- profit & gp_pct computed client-side (avoid generated column complexity)

  -- ── Status ──
  working_status      text default 'ดำเนินการ',    -- ดำเนินการ / ส่งมอบแล้ว / ยกเลิก
  room_status         text,                        -- สถานะห้อง
  expected_finish_date date,
  actual_deliver_date  date,

  -- ── Staff ──
  sales_id            text references users(id),
  qc_id               text references users(id),

  -- ── Commission ──
  commission_month    date,                        -- เดือนเบิกค่าคอมมิชชั่น
  commission_rate     numeric,                     -- auto-filled from tiers
  commission_amount   numeric,
  commission_status   text default 'pending' check (commission_status in ('pending','approved','paid')),

  notes               text,
  created_at          timestamptz default now(),
  updated_at          timestamptz default now()
);

create trigger jobs_updated_at
  before update on jobs
  for each row execute function update_updated_at();

create index if not exists idx_jobs_customer    on jobs(customer_id);
create index if not exists idx_jobs_project     on jobs(project_id);
create index if not exists idx_jobs_sales       on jobs(sales_id);
create index if not exists idx_jobs_status      on jobs(working_status);

-- ─────────────────────────────────────────
-- COMMISSION SETTINGS (editable tiers by admin)
-- ─────────────────────────────────────────
create table if not exists commission_settings (
  id              serial primary key,
  tier_name       text not null,
  revenue_min     numeric default 0,
  revenue_max     numeric,                         -- null = no upper limit (last tier)
  rate            numeric not null,                -- decimal: 0.012 = 1.2%
  active          boolean default true,
  sort_order      integer not null,
  updated_at      timestamptz default now()
);

-- Seed default tiers (from old CRM)
insert into commission_settings (tier_name, revenue_min, revenue_max, rate, sort_order) values
  ('≤ 50,000',      0,       50000,   0.0120, 1),
  ('≤ 100,000',     50001,   100000,  0.0135, 2),
  ('≤ 300,000',     100001,  300000,  0.0150, 3),
  ('≤ 500,000',     300001,  500000,  0.0170, 4),
  ('≤ 800,000',     500001,  800000,  0.0185, 5),
  ('≤ 1,000,000',   800001,  1000000, 0.0220, 6),
  ('≤ 2,500,000',   1000001, 2500000, 0.0250, 7),
  ('≤ 3,200,000',   2500001, 3200000, 0.0275, 8),
  ('> 3,200,000',   3200001, null,    0.0300, 9)
on conflict do nothing;

-- ─────────────────────────────────────────
-- Patch PAYMENTS — add job_id + channel
-- ─────────────────────────────────────────
alter table payments
  add column if not exists job_id   text references jobs(id),
  add column if not exists channel  text;         -- โอนเงิน | บัตรเครดิต | เงินสด | เช็ค

-- ─────────────────────────────────────────
-- Patch CUSTOMERS — add B2C/B2B + customer_type
-- ─────────────────────────────────────────
alter table customers
  add column if not exists customer_type  text default 'B2C' check (customer_type in ('B2C','B2B')),
  add column if not exists company_name   text,
  add column if not exists tax_id         text,
  add column if not exists contact_person text;

-- ─────────────────────────────────────────
-- Patch DAILY REPORTS — add missing fields
-- ─────────────────────────────────────────
alter table daily_reports
  add column if not exists new_leads          integer default 0,
  add column if not exists bookings_count     integer default 0,
  add column if not exists deposit_amount     numeric default 0,
  add column if not exists payment_50_amount  numeric default 0,
  add column if not exists payment_100_amount numeric default 0;

-- ─────────────────────────────────────────
-- RLS
-- ─────────────────────────────────────────
alter table jobs                enable row level security;
alter table commission_settings enable row level security;

-- Jobs: all roles read; sales/admin_sales/admin write
create policy "jobs_read" on jobs for select using (
  get_my_role() in ('admin','sales','admin_sales','executive','finance')
);
create policy "jobs_insert" on jobs for insert with check (
  get_my_role() in ('admin','sales','admin_sales')
);
create policy "jobs_update" on jobs for update using (
  get_my_role() in ('admin','sales','admin_sales')
);
create policy "jobs_delete" on jobs for delete using (
  get_my_role() = 'admin'
);

-- Commission settings: all read; only admin writes
create policy "commission_settings_read" on commission_settings
  for select using (true);
create policy "commission_settings_write" on commission_settings
  for all using (get_my_role() = 'admin');
