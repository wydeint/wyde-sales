-- ═══════════════════════════════════════════════════════════
-- WydEInt CRM v2 — Database Schema Phase 1
-- Run this in Supabase SQL Editor
-- ═══════════════════════════════════════════════════════════

-- Enable UUID extension
create extension if not exists "uuid-ossp";

-- ─────────────────────────────────────────
-- PROJECTS
-- ─────────────────────────────────────────
create table if not exists projects (
  id            text primary key,          -- e.g. ZZZ01
  name          text not null,
  developer     text,
  location      text,
  tower_count   integer default 1,
  total_units   integer,
  active        boolean default true,
  notes         text,
  created_at    timestamptz default now()
);

-- ─────────────────────────────────────────
-- USERS
-- ─────────────────────────────────────────
create table if not exists users (
  id            text primary key,
  email         text unique not null,
  name          text not null,
  role          text not null check (role in ('admin','sales','admin_sales','executive','finance')),
  level         text default 'staff' check (level in ('staff','manager','senior_manager','avp','vp','dmd','md')),
  dept          text,
  active        boolean default true,
  manager_id    text references users(id),
  created_at    timestamptz default now()
);

-- ─────────────────────────────────────────
-- CUSTOMERS (main table — 1 row per customer/unit)
-- ─────────────────────────────────────────
create table if not exists customers (
  id            text primary key,          -- e.g. ZZZ01-A-101

  -- ── Core info (shared) ──
  project_id    text references projects(id),
  project_name  text,
  tower         text,
  room_no       text,
  model_name    text,
  area          numeric,
  contract_price numeric,
  transfer_date date,
  customer_name text not null,
  phone         text,
  email         text,

  -- ── Sales — Pipeline ──
  source        text,                      -- origin / event / referral / walk-in
  lead_from     text,
  work_type     text,                      -- RPT / N-RPT / N-RPT/Event / N-RPT/EQ
  job_type      text,                      -- Walk-in / Event / Origin
  assigned_to   text references users(id),
  status        text default 'new' check (status in ('new','interested','quoted','booked','close_pending','closed','lost')),
  first_contact_date  date,
  last_contact_date   date,
  next_contact_date   date,
  next_action         text,
  quotation_date      date,
  quotation_value     numeric,
  booking_date        date,
  booking_value       numeric,
  booking_package_value numeric,
  sale_revenue        numeric,
  close_pct           text,
  close_pending_date  date,
  close_date          date,
  approved_by_manager text,
  referral_name       text,
  referral_type       text check (referral_type in ('origin','outside','event',null)),
  details             text,
  remark              text,

  -- ── Sales — Commission ──
  commission_rate     numeric,
  commission_amount   numeric,
  referral_rate       numeric,
  referral_amount     numeric,
  commission_status   text default 'pending' check (commission_status in ('pending','paid')),

  -- ── Sales — Payment Installment ──
  deposit_cash        numeric,
  deposit_date        date,
  deposit_done        boolean default false,
  pay1_amount numeric, pay1_date date, pay1_done boolean default false,
  pay2_amount numeric, pay2_date date, pay2_done boolean default false,
  pay3_amount numeric, pay3_date date, pay3_done boolean default false,
  pay4_amount numeric, pay4_date date, pay4_done boolean default false,
  pay5_amount numeric, pay5_date date, pay5_done boolean default false,
  pay6_amount numeric, pay6_date date, pay6_done boolean default false,

  -- ── Sales — Handover ──
  handover_date       date,
  handover_to         text,
  handover_status     text check (handover_status in ('pending','sent','received',null)),
  handover_message    text,

  -- ── Sales — File attachments (Google Drive links) ──
  file_id_card        text,
  file_slip           text,
  file_signed_quote   text,
  file_receipt        text,               -- ใบเสร็จรับเงิน (เพิ่มใหม่)

  -- ── Admin Sales — เอกสาร ──
  po_no               text,
  so_no               text,
  admin_assigned_to   text references users(id),
  admin_delivery_date date,
  delivered_status    text,
  file_delivery       text,
  admin_notes         text,

  -- ── Admin Sales — Warranty ──
  warranty_start      date,
  warranty_end        date,
  warranty_months     integer default 6,
  warranty_notes      text,

  created_at          timestamptz default now(),
  updated_at          timestamptz default now()
);

-- ─────────────────────────────────────────
-- EVENTS
-- ─────────────────────────────────────────
create table if not exists events (
  id              text primary key,         -- e.g. EVT-001
  project_id      text references projects(id),
  project_name    text,
  event_name      text not null,
  event_date      date,
  location        text,
  total_attendees integer default 0,
  line_adds       integer default 0,
  notes           text,
  created_by      text references users(id),
  created_at      timestamptz default now()
);

-- ─────────────────────────────────────────
-- EVENT CUSTOMERS
-- ─────────────────────────────────────────
create table if not exists event_customers (
  id                      uuid primary key default uuid_generate_v4(),
  event_id                text references events(id) on delete cascade,
  customer_name           text not null,
  phone                   text,
  email                   text,
  interested_project_id   text references projects(id),
  interested_room         text,
  status                  text default 'new' check (status in ('new','contacted','converted')),
  converted_to_customer_id text references customers(id),
  notes                   text,
  created_at              timestamptz default now()
);

-- ─────────────────────────────────────────
-- DAILY REPORTS
-- ─────────────────────────────────────────
create table if not exists daily_reports (
  id                  text primary key,     -- e.g. DLR-001
  date                date not null,
  sales_person_id     text references users(id),
  calls               integer default 0,
  visits              integer default 0,
  follow_ups          integer default 0,
  quotations_sent     integer default 0,
  leads_created       integer default 0,
  quotation_value     numeric default 0,
  booking_value       numeric default 0,
  revenue             numeric default 0,
  notes               text,
  created_at          timestamptz default now(),
  unique (date, sales_person_id)
);

-- ─────────────────────────────────────────
-- SALES TARGETS
-- ─────────────────────────────────────────
create table if not exists sales_targets (
  id                        uuid primary key default uuid_generate_v4(),
  user_id                   text references users(id),
  year                      integer not null,
  month                     integer not null check (month between 1 and 12),
  working_days              integer default 22,
  target_prospects          integer default 0,
  target_leads              integer default 0,
  target_quotations         integer default 0,
  target_quotation_value    numeric default 0,
  target_bookings           integer default 0,
  target_booking_value      numeric default 0,
  target_revenue            numeric default 0,
  created_at                timestamptz default now(),
  unique (user_id, year, month)
);

-- ─────────────────────────────────────────
-- INDEXES
-- ─────────────────────────────────────────
create index if not exists idx_customers_project    on customers(project_id);
create index if not exists idx_customers_status     on customers(status);
create index if not exists idx_customers_assigned   on customers(assigned_to);
create index if not exists idx_customers_booking    on customers(booking_date);
create index if not exists idx_event_customers_evt  on event_customers(event_id);
create index if not exists idx_daily_reports_date   on daily_reports(date);
create index if not exists idx_daily_reports_sales  on daily_reports(sales_person_id);

-- ─────────────────────────────────────────
-- AUTO-UPDATE updated_at
-- ─────────────────────────────────────────
create or replace function update_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

create trigger customers_updated_at
  before update on customers
  for each row execute function update_updated_at();

-- ─────────────────────────────────────────
-- ROW LEVEL SECURITY (RLS)
-- ─────────────────────────────────────────
alter table projects       enable row level security;
alter table users          enable row level security;
alter table customers      enable row level security;
alter table events         enable row level security;
alter table event_customers enable row level security;
alter table daily_reports  enable row level security;
alter table sales_targets  enable row level security;

-- Helper: get current user's role
create or replace function get_my_role()
returns text as $$
  select role from users where email = auth.jwt() ->> 'email'
$$ language sql security definer stable;

-- Helper: get current user's id
create or replace function get_my_user_id()
returns text as $$
  select id from users where email = auth.jwt() ->> 'email'
$$ language sql security definer stable;

-- PROJECTS: everyone can read
create policy "projects_read_all" on projects for select using (true);
create policy "projects_write_admin" on projects for all using (get_my_role() = 'admin');

-- USERS: everyone reads, only admin writes
create policy "users_read_all" on users for select using (true);
create policy "users_write_admin" on users for all using (get_my_role() = 'admin');

-- CUSTOMERS: all roles can read; sales/admin_sales/admin can write
create policy "customers_read_all" on customers for select using (
  get_my_role() in ('admin','sales','admin_sales','executive','finance')
);
create policy "customers_write_sales" on customers for insert with check (
  get_my_role() in ('admin','sales','admin_sales')
);
create policy "customers_update_sales" on customers for update using (
  get_my_role() in ('admin','sales','admin_sales')
);
create policy "customers_delete_admin" on customers for delete using (
  get_my_role() = 'admin'
);

-- EVENTS
create policy "events_read_all" on events for select using (true);
create policy "events_write_sales" on events for all using (
  get_my_role() in ('admin','sales')
);

-- EVENT CUSTOMERS
create policy "event_customers_read" on event_customers for select using (true);
create policy "event_customers_write" on event_customers for all using (
  get_my_role() in ('admin','sales')
);

-- DAILY REPORTS: sales sees own, admin/exec/finance sees all
create policy "daily_reports_read" on daily_reports for select using (
  get_my_role() in ('admin','executive','finance') or
  sales_person_id = get_my_user_id()
);
create policy "daily_reports_write" on daily_reports for all using (
  get_my_role() in ('admin','sales')
);

-- SALES TARGETS
create policy "sales_targets_read" on sales_targets for select using (
  get_my_role() in ('admin','executive','finance') or
  user_id = get_my_user_id()
);
create policy "sales_targets_write" on sales_targets for all using (
  get_my_role() = 'admin'
);
