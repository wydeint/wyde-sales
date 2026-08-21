# Wyde CRM — Database Schema

> Supabase Project: `kabdjmvmuvnarmpsdoho` | อัพเดต 2026-07-25

---

## Table Map

| Table | หน้าที่ | ขนาดโดยประมาณ |
|-------|---------|---------------|
| `jobs` | งานหลักทุกรายการ | ~900 rows |
| `payments` | งวดชำระเงิน | ~3,000+ rows |
| `customers` | ลูกค้า/leads | ~1,000+ rows |
| `projects` | master data โครงการ | ~20 rows |
| `users` | ผู้ใช้ระบบ | ~30 rows |
| `handovers` | delivery records | ~500 rows |
| `warranties` | ใบรับประกัน | ~500 rows |
| `commissions` | ค่าคอมมิชชัน (legacy) | — |
| `commission_settings` | tier ค่าคอม | ~5 rows |
| `commission_referrals` | ค่าแนะนำ | — |
| `events` | งาน event การขาย | ~50 rows |
| `event_customers` | ลูกค้าในงาน event | ~500 rows |
| `condo_leads` | leads จาก Origin CRM | ~1,000+ rows |
| `daily_reports` | รายงานประจำวัน | ~1,000+ rows |
| `finance_entries` | รายรับ-รายจ่าย | — |
| `documents` | เอกสาร (legacy) | — |
| `job_files` | ไฟล์แนบ (Google Drive) | — |
| `payment_followups` | บันทึกติดตามชำระ | — |
| `sales_targets` | เป้าหมายรายบุคคล | — |
| `org_targets` | เป้าหมายองค์กร | — |

---

## jobs

ตาราง core ที่สำคัญที่สุด — แต่ละ row = 1 งาน (renovation job)

| column | type | default | คำอธิบาย |
|--------|------|---------|---------|
| `id` | text PK | — | UUID |
| `customer_id` | text FK | — | → customers.id |
| `project_id` | text FK | — | → projects.id |
| `customer_name` | text | — | ชื่อลูกค้า (denormalized) |
| `room_no` | text | — | เลขห้อง |
| `customer_type` | text | `'B2C'` | `B2C` / `B2B` |
| `company_name` | text | — | สำหรับ B2B |
| `po_no` | text | — | เลขที่ PO (B2B) |
| `so_no` | text | — | เลขที่ SO |
| `work_type` | text | — | ประเภทงาน (RPT/N-RPT ฯลฯ) |
| `package_type` | text | — | แพ็กเกจ |
| `order_date` | date | — | วันที่สั่งงาน |
| `contract_date` | date | — | วันที่ทำสัญญา |
| `revenue_ex_vat` | numeric | 0 | มูลค่างาน (ไม่รวม VAT) |
| `revenue_inc_vat` | numeric | 0 | มูลค่างาน (รวม VAT) — ใช้เป็น base |
| `transfer_amount` | numeric | 0 | ยอดโอน |
| `voucher` | numeric | 0 | มูลค่า voucher รวม |
| `cost` | numeric | 0 | ต้นทุนงาน |
| `working_status` | text | `'ดำเนินการ'` | สถานะงาน (ดูด้านล่าง) |
| `room_status` | text | — | สถานะห้อง |
| `payment_plan_type` | text | — | `plan_a` / `plan_b` / `plan_c` / `po_bill` / `custom_b2b` |
| `work_start_date` | date | — | วันเริ่มงานจริง (set โดย trigger payment) |
| `work_days` | integer | — | จำนวนวันทำงาน |
| `expected_finish_date` | date | — | วันคาดส่งมอบ |
| `actual_deliver_date` | date | — | วันส่งมอบจริง |
| `accounting_status` | text | `'Backlog'` | สถานะบัญชี |
| `year_sold` | integer | — | ปีที่ขาย |
| `delivery_lot` | text | — | Lot ส่งมอบ |
| `plan_transfer_month` | text | — | เดือนที่วางแผนโอน |
| `sales_id` | text FK | — | → users.id (Sales ที่รับผิดชอบ) |
| `qc_id` | text FK | — | → users.id (QC) |
| `commission_month` | date | — | เดือนที่นับ commission |
| `commission_rate` | numeric | — | อัตรา commission % |
| `commission_amount` | numeric | — | มูลค่า commission |
| `commission_status` | text | `'pending'` | `pending` / `approved` / `paid` |
| `cancel_type` | text | — | ประเภทการยกเลิก |
| `cancel_date` | date | — | วันที่ยกเลิก |
| `cancel_amount` | numeric | — | มูลค่าคืน |
| `cancel_notes` | text | — | หมายเหตุ |
| `lead_id` | bigint FK | — | → condo_leads.id |
| `quotation1_url` | text | — | URL ใบเสนอราคา 1 |
| `quotation2_url` | text | — | URL ใบเสนอราคา 2 |
| `id_card_url` | text | — | URL สำเนาบัตร |
| `sale_slip_url` | text | — | URL สลิปโอน |
| `sale_receipt_url` | text | — | URL ใบเสร็จ |
| `delivery_doc_url` | text | — | URL ใบส่งมอบ |
| `satisfaction_url` | text | — | URL แบบสอบถาม |
| `notes` | text | — | หมายเหตุ |
| `created_at` | timestamptz | now() | — |
| `updated_at` | timestamptz | now() | — |

### working_status values (ณ 2026-07-25)

| value | จำนวน | ความหมาย |
|-------|-------|---------|
| `ส่งมอบแล้ว` | 501 | งานเสร็จ ส่งมอบแล้ว |
| `ดำเนินการ` | 390 | กำลังทำงาน |
| `จอง` | 5 | จองแต่ยังไม่เริ่มงาน |
| `ยกเลิก` | 4 | ยกเลิก |
| `รอส่งมอบ` | 1 | รอส่งมอบ |

> ⚠️ `กำลังดำเนินการ` ถูก migrate เป็น `ดำเนินการ` ทั้งหมดแล้ว (2026-07-25) — ห้ามใช้ค่าเก่าในโค้ดใหม่

---

## payments

งวดชำระเงินทุกงวดของทุก job

| column | type | คำอธิบาย |
|--------|------|---------|
| `id` | text PK | UUID |
| `job_id` | text FK | → jobs.id |
| `customer_id` | text FK | → customers.id |
| `project_id` | text FK | → projects.id |
| `room` | text | เลขห้อง (denormalized) |
| `installment_no` | integer | ลำดับงวด |
| `installment_name` | text | ชื่องวด (เช่น "งวด 1 — 50%") |
| `due_date` | date | วันครบกำหนด |
| `amount` | numeric | ยอดงวด |
| `paid_date` | date | วันที่จ่ายจริง |
| `paid_amount` | numeric | ยอดที่รับจริง (หลังหัก voucher) |
| `status` | text | `pending` / `paid` |
| `is_work_trigger` | boolean | true = งวดนี้เมื่อจ่ายแล้วเริ่มงาน |
| `is_final` | boolean | true = งวดสุดท้าย ปลด HandoverModal |
| `percentage` | numeric | % ของมูลค่างานทั้งหมด |
| `voucher_code` | text | รหัส voucher |
| `voucher_amount` | numeric | มูลค่า voucher |
| `channel` | text | ช่องทางชำระ |
| `receipt_url` | text | URL ใบเสร็จ |
| `slip_url` | text | URL สลิป |
| `file_urls` | text[] | ไฟล์แนบเพิ่มเติม |
| `line_notified_at` | timestamptz | เวลาแจ้ง LINE |
| `notes` | text | หมายเหตุ |

---

## customers

ลูกค้าและ leads ในระบบ CRM

| column | type | คำอธิบาย |
|--------|------|---------|
| `id` | text PK | UUID |
| `customer_name` | text NOT NULL | ชื่อลูกค้า |
| `phone` | text | โทรศัพท์ |
| `email` | text | อีเมล |
| `line_id` | text | LINE ID |
| `customer_type` | text | `B2C` / `B2B` |
| `company_name` | text | ชื่อบริษัท (B2B) |
| `tax_id` | text | เลขผู้เสียภาษี (B2B) |
| `contact_person` | text | ผู้ติดต่อ (B2B) |
| `status` | text | `new`/`booked`/`closed`/`lost` |
| `assigned_to` | text FK | → users.id |
| `project_id` | text | → projects.id |
| `room_no` | text | เลขห้อง |
| `source` | text | ที่มา (Referral, Event, Website ฯลฯ) |
| `lead_from` | text | lead มาจาก |
| `work_type` | text | ประเภทงานที่สนใจ |
| `job_type` | text | ประเภท job |
| `budget` | numeric | งบประมาณ |
| `interested_room` | text | ห้องที่สนใจ |
| `booking_date` | date | วันที่ booking |
| `booking_value` | numeric | มูลค่า booking |
| `sale_revenue` | numeric | มูลค่าที่ขายได้ |
| `close_date` | date | วันที่ปิดการขาย |
| `cancel_type/date/amount/notes` | — | ข้อมูลการยกเลิก |
| `warranty_start/end` | date | วันรับประกัน |
| `warranty_months` | integer | 6 | ระยะเวลารับประกัน |
| `lead_id` | bigint FK | → condo_leads.id |
| `event_customer_id` | uuid FK | → event_customers.id |
| `created_at` / `updated_at` | timestamptz | — |

---

## projects

Master data โครงการ (คอนโดที่รับงาน)

| column | type | คำอธิบาย |
|--------|------|---------|
| `id` | text PK | — |
| `name` | text NOT NULL | ชื่อโครงการ |
| `developer` | text | ชื่อ developer |
| `location` | text | ที่ตั้ง |
| `tower_count` | integer | จำนวนอาคาร |
| `total_units` | integer | จำนวนห้องทั้งหมด |
| `active` | boolean | แสดงใน dropdown หรือไม่ |
| `notes` | text | หมายเหตุ |

---

## users

ผู้ใช้งานระบบ

| column | type | คำอธิบาย |
|--------|------|---------|
| `id` | text PK | UUID (ตรงกับ Supabase Auth) |
| `email` | text NOT NULL | อีเมล (login) |
| `name` | text NOT NULL | ชื่อแสดงในระบบ |
| `role` | text NOT NULL | `admin` / `sales` / `admin_sales` / `executive` / `finance` |
| `level` | text | `staff` / `senior` / `manager` / `director` / `MD` |
| `dept` | text | แผนก |
| `active` | boolean | true = ยังทำงานอยู่ |
| `manager_id` | text FK | → users.id (หัวหน้า) |

---

## handovers

บันทึก delivery ต่อ job

| column | type | คำอธิบาย |
|--------|------|---------|
| `id` | text PK | — |
| `job_id` | text FK | → jobs.id |
| `customer_id` | text FK | — |
| `project_id` | text FK | — |
| `room` | text | — |
| `job_start_date` | date | วันเริ่มงาน |
| `work_days` | integer | จำนวนวันทำงาน |
| `expected_completion` | date | วันคาดแล้วเสร็จ |
| `handover_date` | date | วันนัดส่งมอบ |
| `actual_deliver_date` → จะ map กับ jobs | — | — |
| `delivery_date` | date | วันส่งมอบจริง |
| `sales_sign_date` | date | วันที่ Sales เซ็น |
| `customer_sign_date` | date | วันที่ลูกค้าเซ็น |
| `defect_noted` | boolean | มีข้อบกพร่อง |
| `defect_details` | text | รายละเอียด |
| `work_status` | text | `in_progress` / `completed` |
| `status` | text | `scheduled` / `completed` / `cancelled` |
| `total_amount` | numeric | มูลค่างาน |
| `final_payment_date` | date | วันรับเงินงวดสุดท้าย |
| `warranty_days` | integer | วันรับประกัน |
| `warranty_end` | date | วันหมดประกัน |
| `commission_triggered` | boolean | commission ถูก trigger แล้ว |
| `delivery_file_url` | text | URL ไฟล์ส่งมอบ |
| `client_type` | text | `B2C` / `B2B` |

---

## warranties

ใบรับประกันงาน

| column | type | คำอธิบาย |
|--------|------|---------|
| `id` | text PK | — |
| `customer_id` | text FK | — |
| `project_id` | text FK | — |
| `room` | text | — |
| `handover_date` | date | วันส่งมอบ |
| `warranty_start` | date | วันเริ่มรับประกัน |
| `warranty_end` | date | วันหมดรับประกัน |
| `warranty_months` | integer | 12 | ระยะเวลา (เดือน) |
| `status` | text | `active` / `expired` |
| `notes` | text | — |

---

## commission_settings

Tier ค่าคอมมิชชัน

| column | type | คำอธิบาย |
|--------|------|---------|
| `id` | integer PK | auto-increment |
| `tier_name` | text | ชื่อ tier |
| `revenue_min` | numeric | มูลค่าขั้นต่ำ |
| `revenue_max` | numeric | มูลค่าสูงสุด (null = ไม่จำกัด) |
| `rate` | numeric | อัตรา % |
| `active` | boolean | ใช้งานอยู่ |
| `sort_order` | integer | ลำดับ |

---

## events + event_customers

| Table | Key fields |
|-------|-----------|
| `events` | id, project_id, event_name, event_type, event_date, location, total_attendees, line_adds |
| `event_customers` | id, event_id, customer_name, phone, status, booked_date, booked_value, deposit_amount, sales_id, converted_to_customer_id |

---

## condo_leads

Leads จาก Origin CRM (developer's system)

| column | type | คำอธิบาย |
|--------|------|---------|
| `id` | bigint PK | — |
| `project_id` | text | — |
| `tower` / `room_no` | text | — |
| `model_id` / `model_name` | text | รุ่นห้อง |
| `customer_name` | text NOT NULL | — |
| `phone` / `email` | text | — |
| `contract_price` | numeric | ราคาสัญญา |
| `s00_budget` | numeric | งบ S00 |
| `total_payment` | numeric | ยอดชำระทั้งหมด |
| `booking_date` / `transfer_date` | date | — |
| `consent` | text | ความยินยอม |
| `origin_sales` | text | Sales ของ developer |
| `customer_id` | text FK | → customers.id (ถ้า promote แล้ว) |
| `job_id` | text FK | → jobs.id |
| `status` | text | `prospect` / `contacted` / `interested` ฯลฯ |

---

## daily_reports

| column | type | คำอธิบาย |
|--------|------|---------|
| `id` | text PK | — |
| `date` | date NOT NULL | วันที่รายงาน |
| `sales_person_id` | text FK | → users.id |
| `calls` | integer | จำนวนโทร |
| `visits` | integer | เยี่ยม |
| `follow_ups` | integer | ติดตาม |
| `quotations_sent` | integer | ใบเสนอราคาส่ง |
| `new_leads` | integer | leads ใหม่ |
| `bookings_count` | integer | จำนวน booking |
| `quotation_value` | numeric | มูลค่าใบเสนอราคา |
| `booking_value` | numeric | มูลค่า booking |
| `deposit_amount` | numeric | เงินมัดจำ |
| `payment_50_amount` | numeric | รับชำระ 50% |
| `payment_100_amount` | numeric | รับชำระ 100% |
| `revenue` | numeric | รายได้รวม |
| `notes` | text | — |

---

## job_files

ไฟล์แนบที่อัพโหลดไปยัง Google Drive

| column | type | คำอธิบาย |
|--------|------|---------|
| `id` | uuid PK | — |
| `job_id` | text FK | → jobs.id |
| `customer_id` | text FK | → customers.id |
| `file_name` | text NOT NULL | ชื่อไฟล์ |
| `file_url` | text NOT NULL | URL ดาวน์โหลด |
| `drive_file_id` | text NOT NULL | Google Drive file ID |
| `drive_folder_id` | text | Google Drive folder ID |
| `uploaded_by` | uuid FK | → auth.users |

---

## sales_targets / org_targets

| Table | Key fields |
|-------|-----------|
| `sales_targets` | user_id, year, month, project_id, target_calls/visits/leads/quotations/bookings/closed/sales_value/delivery_value |
| `org_targets` | year, month, target_sales_value, target_delivery_value |
