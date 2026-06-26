-- ═══════════════════════════════════════════════════════════
-- WydEInt CRM v2 — Migration Phase 3
-- Condo Leads Pool (แยกจาก customers)
-- Run in Supabase SQL Editor
-- ═══════════════════════════════════════════════════════════

create table if not exists condo_leads (
  id                bigserial primary key,
  project_id        text references projects(id) on delete set null,
  tower             text,
  room_no           text,
  model_id          text,
  model_name        text,
  customer_name     text not null,
  phone             text,
  email             text,
  contract_price    numeric,          -- ราคาหน้าสัญญา
  s00_budget        numeric,          -- SOO/C00 = เงินทอนกู้ ≈ งบตกแต่ง
  total_payment     numeric,
  booking_date      date,
  transfer_date     date,             -- วันโอนตามสัญญา
  consent           text,             -- ACTIVE / null
  origin_sales      text,             -- พนักงานขาย Origin CRM
  customer_id       text references customers(id) on delete set null,  -- เชื่อมเมื่อเข้า pipeline
  imported_at       timestamptz default now(),
  unique(project_id, tower, room_no)
);

-- RLS
alter table condo_leads enable row level security;

create policy "auth read condo_leads" on condo_leads
  for select using (auth.role() = 'authenticated');

create policy "auth insert condo_leads" on condo_leads
  for insert with check (auth.role() = 'authenticated');

create policy "auth update condo_leads" on condo_leads
  for update using (auth.role() = 'authenticated');

-- Index สำหรับ search
create index if not exists condo_leads_name_idx on condo_leads using gin(to_tsvector('simple', customer_name));
create index if not exists condo_leads_project_idx on condo_leads(project_id);
create index if not exists condo_leads_customer_idx on condo_leads(customer_id);
