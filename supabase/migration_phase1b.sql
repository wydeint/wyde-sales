-- ═══════════════════════════════════════════════════════════
-- WydEInt CRM v2 — Migration Phase 1b
-- Run in Supabase SQL Editor AFTER schema.sql
-- ═══════════════════════════════════════════════════════════

-- ─────────────────────────────────────────
-- Patch customers table: add missing columns
-- ─────────────────────────────────────────
alter table customers
  add column if not exists name text generated always as (customer_name) stored,
  add column if not exists line_id text,
  add column if not exists budget numeric default 0,
  add column if not exists interested_room text,
  add column if not exists notes text;

-- ─────────────────────────────────────────
-- COMMISSIONS
-- ─────────────────────────────────────────
create table if not exists commissions (
  id                text primary key,             -- COM-001
  customer_id       text references customers(id),
  sales_person_id   text references users(id),
  project_id        text references projects(id),
  room              text,
  sale_price        numeric default 0,
  commission_rate   numeric default 3,
  commission_amount numeric default 0,
  bonus             numeric default 0,
  total_commission  numeric default 0,
  status            text default 'pending' check (status in ('pending','approved','paid')),
  paid_date         date,
  notes             text,
  created_at        timestamptz default now()
);

-- ─────────────────────────────────────────
-- HANDOVERS
-- ─────────────────────────────────────────
create table if not exists handovers (
  id                  text primary key,           -- HOV-001
  customer_id         text references customers(id),
  project_id          text references projects(id),
  room                text,
  handover_date       date,
  sales_sign_date     date,
  customer_sign_date  date,
  defect_noted        boolean default false,
  defect_details      text,
  status              text default 'scheduled' check (status in ('scheduled','sales_signed','completed')),
  notes               text,
  created_at          timestamptz default now()
);

-- ─────────────────────────────────────────
-- DOCUMENTS
-- ─────────────────────────────────────────
create table if not exists documents (
  id            text primary key,                 -- DOC-0001
  customer_id   text references customers(id),
  doc_type      text,
  doc_name      text not null,
  file_url      text,
  issued_date   date,
  expiry_date   date,
  status        text default 'draft' check (status in ('draft','sent','signed','expired')),
  notes         text,
  created_at    timestamptz default now()
);

-- ─────────────────────────────────────────
-- WARRANTIES
-- ─────────────────────────────────────────
create table if not exists warranties (
  id                text primary key,             -- WAR-001
  customer_id       text references customers(id),
  project_id        text references projects(id),
  room              text,
  handover_date     date,
  warranty_start    date,
  warranty_end      date,
  warranty_months   integer default 12,
  status            text default 'active' check (status in ('active','expiring_soon','expired')),
  notes             text,
  created_at        timestamptz default now()
);

-- ─────────────────────────────────────────
-- PAYMENTS
-- ─────────────────────────────────────────
create table if not exists payments (
  id                text primary key,             -- PAY-0001
  customer_id       text references customers(id),
  project_id        text references projects(id),
  room              text,
  installment_no    integer default 1,
  installment_name  text,
  due_date          date,
  amount            numeric not null,
  paid_date         date,
  paid_amount       numeric default 0,
  status            text default 'pending' check (status in ('pending','overdue','paid','partial')),
  receipt_url       text,
  notes             text,
  created_at        timestamptz default now()
);

-- ─────────────────────────────────────────
-- Patch sales_targets: add missing columns
-- ─────────────────────────────────────────
alter table sales_targets
  add column if not exists project_id text references projects(id),
  add column if not exists target_calls integer default 0,
  add column if not exists target_visits integer default 0,
  add column if not exists target_closed integer default 0;

-- Drop old unique constraint and recreate without month constraint issue
-- (already exists from schema.sql, just ensure it's there)

-- ─────────────────────────────────────────
-- RLS for new tables
-- ─────────────────────────────────────────
alter table commissions enable row level security;
alter table handovers   enable row level security;
alter table documents   enable row level security;
alter table warranties  enable row level security;
alter table payments    enable row level security;

-- Commissions: sales sees own, admin/exec/finance sees all
create policy "commissions_read" on commissions for select using (
  get_my_role() in ('admin','executive','finance') or
  sales_person_id = get_my_user_id()
);
create policy "commissions_write" on commissions for all using (
  get_my_role() in ('admin','sales')
);

-- Handovers: sales + admin_sales can access
create policy "handovers_read" on handovers for select using (
  get_my_role() in ('admin','sales','admin_sales','executive')
);
create policy "handovers_write" on handovers for all using (
  get_my_role() in ('admin','sales','admin_sales')
);

-- Documents: admin_sales manages
create policy "documents_read" on documents for select using (
  get_my_role() in ('admin','admin_sales','executive','finance')
);
create policy "documents_write" on documents for all using (
  get_my_role() in ('admin','admin_sales')
);

-- Warranties: admin_sales manages
create policy "warranties_read" on warranties for select using (
  get_my_role() in ('admin','admin_sales','executive','finance','sales')
);
create policy "warranties_write" on warranties for all using (
  get_my_role() in ('admin','admin_sales')
);

-- Payments: finance manages
create policy "payments_read" on payments for select using (
  get_my_role() in ('admin','finance','executive','sales')
);
create policy "payments_write" on payments for all using (
  get_my_role() in ('admin','finance')
);
