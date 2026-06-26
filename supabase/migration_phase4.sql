-- ═══════════════════════════════════════════════════════════
-- WydEInt CRM v2 — Migration Phase 4
-- Finance Entries (รายรับ-รายจ่ายบริษัท)
-- Run in Supabase SQL Editor
-- ═══════════════════════════════════════════════════════════

create table if not exists finance_entries (
  id          bigserial primary key,
  type        text not null check (type in ('income','expense')),
  category    text not null,
  amount      numeric not null check (amount > 0),
  entry_date  date not null,
  description text,
  ref_id      text,          -- อ้างอิง PAY-XXXX หรือ JOB-XXXX
  created_by  text references users(id) on delete set null,
  created_at  timestamptz default now()
);

alter table finance_entries enable row level security;

create policy "auth read finance" on finance_entries
  for select using (auth.role() = 'authenticated');

create policy "auth write finance" on finance_entries
  for all using (
    (select role from users where email = auth.jwt() ->> 'email')
    in ('admin','finance')
  );

create index if not exists finance_entries_date_idx on finance_entries(entry_date);
create index if not exists finance_entries_type_idx on finance_entries(type);
