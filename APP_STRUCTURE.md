# Wyde CRM — App Structure & Documentation

## Overview

Wyde CRM is a Next.js 14 (App Router) web application for managing interior design sales and project delivery. Built with TypeScript, Tailwind CSS v4, and Supabase as the backend.

**Deploy:** Vercel (auto-deploy from GitHub `main` branch)  
**Database:** Supabase (PostgreSQL) — project ID `kabdjmvmuvnarmpsdoho`

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Framework | Next.js 14 App Router |
| Language | TypeScript |
| Styling | Tailwind CSS v4 |
| Database | Supabase (PostgreSQL + RLS) |
| Auth | Supabase Auth |
| Hosting | Vercel |

---

## App Routes

All routes are under `/dashboard/`. The app uses a sidebar navigation layout defined in `src/app/dashboard/layout.tsx`.

| Route | Page | Description |
|-------|------|-------------|
| `/dashboard` | Dashboard | Overview / home |
| `/dashboard/my-deals` | My Deals | Sales person's own jobs list + HandoverModal + PayModal |
| `/dashboard/my-deals/[jobId]` | Job Detail | Full detail view of a single job |
| `/dashboard/pipeline` | Pipeline | Prospect → Booking pipeline (Kanban-style) |
| `/dashboard/quick` | Quick Pay | Fast payment confirmation for finance team |
| `/dashboard/jobs` | Jobs | Admin view of all jobs |
| `/dashboard/customers` | Customers | Customer list + payment drawer |
| `/dashboard/payments` | Payments | Payments tracking by sales/project |
| `/dashboard/revenue` | Revenue | Revenue reporting by period |
| `/dashboard/targets` | Targets | Sales targets vs actuals |
| `/dashboard/events` | Events | Event management |
| `/dashboard/leads` | Leads | Lead tracking |
| `/dashboard/projects` | Projects | Project master data |
| `/dashboard/admin-data` | Admin Data | Raw data entry for all 18 tables (password: Wyde2026) |

---

## Database Tables (18 total)

### Core Business Tables

#### `jobs`
Main table for all interior design projects/orders.

| Column | Type | Notes |
|--------|------|-------|
| id | text PK | e.g. JOB-001 |
| room_no | text | e.g. C-208 |
| customer_name | text | |
| customer_id | text | FK → customers |
| project_id | text | FK → projects |
| sales_id | text | FK → users (role=sales) |
| customer_type | text | B2C / B2B |
| work_type | text | |
| package_type | text | |
| order_date | date | วันขาย / วันรับงวดแรก |
| revenue_ex_vat | numeric | ราคาขาย (รวม VAT แล้ว) |
| revenue_inc_vat | numeric | = revenue_ex_vat เสมอ (ไม่คูณ 1.07) |
| cost | numeric | ต้นทุน |
| working_status | text | กำลังดำเนินการ / ส่งมอบแล้ว / ยกเลิก |
| actual_deliver_date | date | วันส่งมอบจริง (= transfer_date จาก condo_leads) |
| payment_plan_type | text | |
| work_start_date | date | |
| contract_date | date | |
| po_no / so_no | text | |
| accounting_status | text | |
| delivery_lot | text | |
| notes | text | |

> **Important:** `revenue_inc_vat` stores the same value as `revenue_ex_vat`. The amounts entered already include 7% VAT. Never multiply by 1.07.

#### `payments`
Payment installments linked to jobs.

| Column | Type | Notes |
|--------|------|-------|
| id | uuid PK | |
| job_id | text | FK → jobs |
| room | text | |
| project_id | text | FK → projects |
| installment_no | integer | งวดที่ |
| installment_name | text | ชื่องวด |
| percentage | numeric | % ของราคารวม |
| amount | numeric | ยอดตามแผน (scheduled) |
| paid_amount | numeric | ยอดรับจริง (actual) |
| status | text | pending / paid / overdue |
| due_date | date | |
| paid_date | date | |
| is_work_trigger | boolean | งวดที่เริ่มงาน |
| is_final | boolean | งวดสุดท้าย |
| slip_url / receipt_url | text | |
| channel | text | |

> **DB Trigger:** `trg_payments_paid_amount` — auto-sets `paid_amount = amount` when `status = 'paid'` and `paid_amount` is null/0.

#### `customers`
Customer master data.

| Column | Type | Notes |
|--------|------|-------|
| id | text PK | |
| customer_name | text | |
| phone | text | |
| email | text | |
| address | text | |
| id_card / passport | text | |
| nationality | text | |
| notes | text | |

#### `projects`
Condominium project master data.

| Column | Type | Notes |
|--------|------|-------|
| id | text PK | |
| name | text | |
| developer | text | |
| location | text | |
| tower_count / total_units | integer | |
| active | boolean | |

#### `users`
System users (staff accounts).

| Column | Type | Notes |
|--------|------|-------|
| id | text PK | |
| name | text | |
| email | text | |
| role | text | sales / sales_mgr / admin / admin_sales / qc / finance / executive |
| level / dept | text | |
| active | boolean | |

> **Note:** Sales dropdowns throughout the app filter `role = 'sales'` only (excludes admin_sales).

### Operations Tables

#### `handovers`
Job handover records created when a job is marked as delivered.

| Column | Type | Notes |
|--------|------|-------|
| id | text PK | |
| job_id | text | FK → jobs |
| customer_id | text | |
| project_id | text | |
| room | text | |
| handover_date | date | วันส่งมอบ |
| delivery_date | date | |
| status | text | |
| work_status | text | |
| job_start_date | date | |
| expected_completion | date | |
| work_days | integer | |
| total_amount | numeric | |
| final_payment_date | date | |
| warranty_days | integer | |
| warranty_end | date | |
| commission_triggered | boolean | |
| defect_noted | boolean | |
| defect_details | text | |

> **RLS Policy:** `handovers_write` allows insert/update for roles: sales, sales_mgr, admin, finance, executive.

#### `warranties`
Warranty tracking post-handover.

| Column | Type | Notes |
|--------|------|-------|
| id | text PK | |
| customer_id / project_id | text | |
| room | text | |
| handover_date | date | |
| warranty_start / warranty_end | date | |
| warranty_months | integer | |
| status | text | active / expired / voided |

#### `payment_followups`
Notes/follow-up log for overdue payments.

| Column | Type | Notes |
|--------|------|-------|
| id | uuid PK | |
| payment_id | uuid | FK → payments |
| note | text | |
| followed_by | text | |

### Sales & Marketing Tables

#### `condo_leads`
Imported data from developer (booking/transfer records).

| Column | Type | Notes |
|--------|------|-------|
| id | bigint PK | |
| customer_id | text | linked after import |
| customer_name | text | |
| project_id | text | |
| room_no | text | |
| contract_price | numeric | |
| total_payment | numeric | |
| booking_date | date | → used as order_date |
| transfer_date | date | → used as actual_deliver_date |
| origin_sales | text | |

#### `events`
Sales events/exhibitions.

| Column | Type | Notes |
|--------|------|-------|
| id | text PK | |
| event_name | text | |
| event_type | text | |
| event_date | date | |
| location | text | |
| project_id | text | |
| total_attendees | integer | |
| line_adds | integer | |

#### `event_customers`
Customers who attended events, including booking data.

| Column | Type | Notes |
|--------|------|-------|
| id | uuid PK | |
| event_id | text | FK → events |
| customer_name | text | |
| project_id | text | |
| room_no | text | |
| sales_id | text | |
| status | text | |
| booking_type | text | |
| booked_date | date | |
| booked_value | numeric | |
| deposit_amount | numeric | |
| converted_to_customer_id | text | |

### Finance & Targets Tables

#### `commissions`
Commission records per sale.

| Column | Type | Notes |
|--------|------|-------|
| id | text PK | |
| sales_person_id | text | FK → users |
| project_id / customer_id | text | |
| room | text | |
| sale_price | numeric | |
| commission_rate | numeric | % |
| commission_amount | numeric | |
| bonus | numeric | |
| total_commission | numeric | |
| status | text | pending / approved / paid / cancelled |
| paid_date | date | |

> **Note:** `commission_month` in jobs table is `date` type — must send `"YYYY-MM-01"` format (not `"YYYY-MM"`).

#### `commission_settings`
Commission rate tiers.

| Column | Type | Notes |
|--------|------|-------|
| id | integer PK | |
| tier_name | text | |
| revenue_min / revenue_max | numeric | range |
| rate | numeric | % |
| sort_order | integer | |
| active | boolean | |

#### `finance_entries`
Manual income/expense entries.

| Column | Type | Notes |
|--------|------|-------|
| id | bigint PK | |
| type | text | income / expense |
| category | text | |
| amount | numeric | |
| entry_date | date | |
| description | text | |
| ref_id | text | |

#### `daily_reports`
Daily sales activity logs.

| Column | Type | Notes |
|--------|------|-------|
| id | text PK | |
| date | date | |
| sales_person_id | text | |
| calls / visits / follow_ups | integer | |
| new_leads / leads_created | integer | |
| quotations_sent | integer | |
| bookings_count | integer | |
| booking_value | numeric | |
| deposit_amount | numeric | |
| payment_50_amount / payment_100_amount | numeric | |
| revenue | numeric | |

#### `org_targets`
Organisation-level monthly targets.

| Column | Type | Notes |
|--------|------|-------|
| id | uuid PK | |
| year / month | integer | |
| target_sales_value | numeric | |
| target_delivery_value | numeric | |

#### `sales_targets`
Individual sales person monthly targets.

| Column | Type | Notes |
|--------|------|-------|
| id | uuid PK | |
| user_id | text | FK → users |
| project_id | text | |
| year / month | integer | |
| working_days | integer | |
| target_calls / target_visits | integer | |
| target_leads / target_prospects | integer | |
| target_quotations / target_bookings | integer | |
| target_closed | integer | |
| target_quotation_value / target_booking_value | numeric | |
| target_sales_value / target_delivery_value / target_revenue | numeric | |

---

## Key Business Rules

1. **VAT:** `revenue_inc_vat = revenue_ex_vat` always. Amounts entered already include 7% VAT. Never multiply by 1.07.

2. **Payment flow:**
   - `amount` = scheduled installment amount
   - `paid_amount` = actual amount received (may differ)
   - DB trigger auto-fills `paid_amount = amount` when `status = 'paid'` and `paid_amount` is null/0

3. **Sales dropdowns:** Filter `role = 'sales'` only — never include `admin_sales`.

4. **Room search:** DB stores `C-208` format; search normalizes by removing `-`.

5. **Commission month:** `date` column — always send `"YYYY-MM-01"` not `"YYYY-MM"`.

6. **Sort order:** All main lists sort A-Z / ascending (room_no, customer_name, name).

7. **Edit after delivery:** Jobs with `working_status = 'ส่งมอบแล้ว'` can still edit payment installments and delivery date via dedicated buttons.

---

## Important Files

```
src/
  app/
    dashboard/
      layout.tsx                  — Sidebar navigation
      my-deals/
        page.tsx                  — Main sales job list + modals
        [jobId]/page.tsx          — Job detail view
      pipeline/page.tsx           — Booking pipeline
      quick/page.tsx              — Quick payment confirmation
      jobs/page.tsx               — Admin jobs view
      customers/page.tsx          — Customer list
      payments/page.tsx           — Payments tracking
      revenue/page.tsx            — Revenue reporting
      targets/page.tsx            — Targets dashboard
      events/page.tsx             — Events management
      leads/page.tsx              — Leads tracking
      projects/page.tsx           — Projects master
      admin-data/page.tsx         — Raw data entry (password: Wyde2026)
  lib/
    supabase/
      client.ts                   — Supabase browser client
      server.ts                   — Supabase server client
```
