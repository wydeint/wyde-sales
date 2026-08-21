# Wyde CRM — Pages Reference

> ทุกหน้าใน `app/dashboard/` | อัพเดต 2026-07-25

---

## 1. หน้าหลัก (Dashboard Home)
**Path:** `app/dashboard/page.tsx`  
**วัตถุประสงค์:** ภาพรวม KPI ประจำเดือนขององค์กร  
**Features:**
- กรอง B2C / B2B / Work Type
- ยอดขายวันนี้/เดือนนี้ vs เป้า
- จำนวน leads ตามสถานะ (new/interested/quoted/booked)
- งาน delivery ประจำเดือน
- Condo leads (นำเข้าจาก Origin CRM)

**ผู้ใช้:** ทุก role

---

## 2. Admin Data
**Path:** `app/dashboard/admin-data/page.tsx`  
**วัตถุประสงค์:** ตาราง raw-edit ข้อมูลทุก table — แก้ไขโดยตรง  
**Features:**
- เลือก table จากหมวด Core / Operations / Sales / Finance / Admin
- แก้ไข cell inline → save / undo
- Search และกรองข้อมูล
- **Reconcile Check** — ตรวจสอบความสอดคล้องของข้อมูล 5 ข้อ:
  1. Jobs ≠ ยกเลิก ที่ไม่มี payment plan
  2. Payment มีค่าเป็น negative หรือ zero (ผิดปกติ)
  3. Sync `jobs.working_status` ↔ `customers.status` (closed ↔ ดำเนินการ+)
  4. งานส่งมอบแล้วที่ยังไม่มี `actual_deliver_date`
  5. Trigger payment — jobs ที่มี trigger ใน plan (ไม่ใช่ po_bill) แต่ยังไม่มีงวด trigger ที่จ่ายแล้ว

**ผู้ใช้:** Admin เท่านั้น

> ⚠️ Check 5 excludes: `payment_plan_type = 'po_bill'` และ jobs ที่ไม่มี `is_work_trigger` ใน plan เลย (legacy data)

---

## 3. Commission (ค่าคอมมิชชัน)
**Path:** `app/dashboard/commission/page.tsx`  
**วัตถุประสงค์:** ดูและจัดการค่าคอมมิชชันของ Sales  
**Features:**
- 3 แท็บ: รายบุคคล / ค่าแนะนำ (referral) / สถานะค่าคอม
- กรองตาม Sales person และ working_status
- คำนวณ commission tier อัตโนมัติจาก `commission_settings`
- Manager/Admin เห็นทุกคน; Sales เห็นของตัวเอง

**Columns (table):** ห้อง + โครงการ → ลูกค้า + Sales → มูลค่า commission (td-number + accent-amber)  
**ผู้ใช้:** Sales, Manager, Admin

---

## 4. Customers (ลูกค้า)
**Path:** `app/dashboard/customers/page.tsx`  
**วัตถุประสงค์:** จัดการข้อมูล lead/ลูกค้าทั้งหมด  
**Features:**
- เพิ่ม/แก้ไข/ลบลูกค้า
- Detail drawer: job, payment, warranty ในหน้าเดียว
- ค้นหาและกรอง (status, assigned_to, source, project)
- รองรับทั้ง B2C และ B2B (company_name, tax_id, contact_person)
- Cancel flow: cancel_type, cancel_date, cancel_amount, cancel_notes

**Status ลูกค้า:** `new` → `interested` → `quoted` → `booked` → `closed` / `lost`  
**ผู้ใช้:** Sales, Admin

---

## 5. Daily Report (รายงานประจำวัน)
**Path:** `app/dashboard/daily-report/page.tsx`  
**วัตถุประสงค์:** บันทึกกิจกรรม Sales ประจำวัน (1 รายการต่อวันต่อคน)  
**Features:**
- ปุ่มบันทึกวันนี้ (ปรากฏเฉพาะก่อนบันทึก)
- ดูย้อนหลัง 30 วัน
- Track: จำนวนโทร, เยี่ยม, follow up, ใบเสนอราคา, leads ใหม่, booking, payment 50%/100%

**ผู้ใช้:** Sales

---

## 6. Events (อีเวนต์)
**Path:** `app/dashboard/events/page.tsx`  
**วัตถุประสงค์:** บันทึกและติดตามผล event การขาย  
**Features:**
- สร้าง event (ชื่องาน, ประเภท, วันที่, โครงการ, ที่ตั้ง)
- เพิ่มลูกค้าในงาน (event_customers)
- Detect duplicate ก่อน promote ลูกค้าเข้าระบบ
- Promote → สร้าง customer record ใน Prospects
- Event types: งานขาย, สัมมนา, Open House ฯลฯ

**ผู้ใช้:** Sales, Admin

---

## 7. Executive Dashboard
**Path:** `app/dashboard/executive/page.tsx`  
**วัตถุประสงค์:** ภาพรวมผลงานองค์กรระดับผู้บริหาร  
**Features:**
- 2 แท็บ: Performance / Team
- Period selector: week/month/quarter/year + offset ย้อนหลัง
- กรอง B2C/B2B
- Funnel ลูกค้าตามสถานะ
- Breakdown ตาม Sales / Project

**ผู้ใช้:** Executive, Admin

---

## 8. Finance (การเงิน)
**Path:** `app/dashboard/finance/page.tsx`  
**วัตถุประสงค์:** บริหารการเงิน ติดตามการรับชำระ รายรับ-รายจ่าย  
**Features:**
- เพิ่ม expense entry (finance_entries)
- Delivered jobs ที่ยังค้างรับ
- บันทึก revenue/cost ต่อ job
- Period selector + กรอง B2C/B2B/work type
- Gross profit = revenue - cost

**ผู้ใช้:** Finance, Admin

---

## 9. Handover (แผนส่งมอบ)
**Path:** `app/dashboard/handover/page.tsx`  
**วัตถุประสงค์:** ตาราง delivery schedule รายเดือน  
**Features:**
- เลื่อนเดือน prev/next
- Room chip สี: ส่งมอบแล้ว (green) / overdue (red) / ไม่มีวันเริ่ม (gray) / ปกติ (blue)
- คลิก chip → แก้ไข work_start_date, work_days, actual_deliver_date
- คำนวณ expected_date = work_start_date + work_days

**ผู้ใช้:** Admin, Operations

---

## 10. Jobs (งาน)
**Path:** `app/dashboard/jobs/page.tsx`  
**วัตถุประสงค์:** ตารางรายการงานทั้งหมด  
**Features:**
- ค้นหา/กรอง (project, work_type, package_type, working_status, commission_status, sales)
- เพิ่ม/แก้ไข job — เชื่อม customer, lead
- Export ข้อมูล
- Detail drawer: payment summary, document links, commission info
- Copy job

**Key fields:** room_no, project, customer_name, PO/SO, work_type, package_type, revenue_inc_vat, cost, voucher, working_status, payment_plan_type  
**ผู้ใช้:** Sales, Admin

---

## 11. Leads (Lead Pool)
**Path:** `app/dashboard/leads/page.tsx`  
**วัตถุประสงค์:** จัดการ condo lead pool จาก Origin CRM (developer's system)  
**Features:**
- Import .xlsx จาก Origin CRM
- Validate + detect duplicate
- Update lead status
- Promote เป็น customer ในระบบ
- ค้นหา/กรอง

**Source table:** `condo_leads`  
**ผู้ใช้:** Sales, Admin

---

## 12. My Deals (งานที่กำลังดำเนินการ)
**Path:** `app/dashboard/my-deals/page.tsx`  
**วัตถุประสงค์:** รายการ job ที่เข้าเกณฑ์ My Deals (ชำระ ≥50% หรือ B2B)  
**Features:**
- ค้นหา/กรอง
- Room chip สี stage: wait / collect / ready / overdue / done / bill
- Full job drawer: installment detail, mark paid, file upload
- HandoverModal (ปลดได้หลัง is_final = paid)
- Copy job / Cancel

**Filter logic (B2C):** `total_settled / revenue_inc_vat >= 0.5`  
**B2B:** ขึ้นทันที ไม่ตรวจ %  
**ผู้ใช้:** Sales, Admin, Finance

---

## 13. Payments (ชำระเงิน & เอกสาร)
**Path:** `app/dashboard/payments/page.tsx`  
**วัตถุประสงค์:** ตรวจสอบ installment และความครบถ้วนของเอกสาร  
**Features:**
- ค้นหา/กรอง project / sales
- Installment badges: paid (green) / overdue (red) / pending (gray)
- Document icons: quotation1, quotation2, ID card, slip, receipt, delivery doc, satisfaction
- RowDrawer สรุปยอด: paid_total, unpaid_total, working_status

**หมายเหตุ:** หน้านี้เป็น **reference implementation** ของ ds-table standard  
**ผู้ใช้:** Finance, Admin, Sales

---

## 14. Pipeline
**Path:** `app/dashboard/pipeline/page.tsx`  
**วัตถุประสงค์:** Kanban board ลูกค้าตาม sales funnel stage  
**Features:**
- Stage columns: new / interested / quoted / close_pending / booked / lost / closed
- เพิ่ม/แก้ไข/ลบ customer
- Detail drawer: job, payment, warranty
- กรอง work_type / customer_type (B2C/B2B)
- Closed cards → link ไป My Deals

**ผู้ใช้:** Sales, Admin

---

## 15. Project Summary (สรุปรายโครงการ)
**Path:** `app/dashboard/project-summary/page.tsx`  
**วัตถุประสงค์:** ตารางสรุป KPI รายโครงการ  
**Features:**
- Sort ตาม column ใดก็ได้
- กรอง B2C/B2B, RPT/N-RPT (repeat/non-repeat)
- ซ่อน project ที่ไม่มีข้อมูล
- Funnel bar แสดง % ส่งมอบ

**Columns:** ชื่อโครงการ, total_units, booked, jobs active/delivered/total, revenue total/delivered, B2C/B2B × RPT/N-RPT breakdown  
**ผู้ใช้:** Executive, Admin, Sales Manager

---

## 16. Projects (โครงการ)
**Path:** `app/dashboard/projects/page.tsx`  
**วัตถุประสงค์:** จัดการ master data โครงการ  
**Features:**
- เพิ่ม/แก้ไข project
- Toggle active/inactive
- Fuzzy duplicate warning เมื่อกรอกชื่อใหม่

**ผู้ใช้:** Admin

---

## 17. Quick Mode
**Path:** `app/dashboard/quick/page.tsx`  
**วัตถุประสงค์:** หน้า mobile-first สำหรับ field sales ด่วน  
**Features:**
- Shortcut ไปหน้าต่างๆ ด้วยปุ่มใหญ่
- ค้นหา job/event แบบ live
- บันทึก daily report
- แนบไฟล์
- Widget KPI: งานค้าง, overdue, pending payment amount

**ผู้ใช้:** Sales (ใช้บนมือถือ)

---

## 18. Revenue (รายได้)
**Path:** `app/dashboard/revenue/page.tsx`  
**วัตถุประสงค์:** รายงานรายได้เชิงวิเคราะห์  
**Features:**
- Mode: ขาย (order_date) / ส่งมอบ (actual_deliver_date)
- Period selector + offset ย้อนหลัง
- 4 views: summary / sales / project / list
- Export
- กรอง B2C/B2B
- Commission tier คำนวณอัตโนมัติ

**Columns (list view):** ห้อง + โครงการ → ลูกค้า + Sales → revenue/cost/profit (td-number)  
**ผู้ใช้:** Admin, Finance, Executive, Sales Manager

---

## 19. Settings (ตั้งค่า)
**Path:** `app/dashboard/settings/page.tsx`  
**วัตถุประสงค์:** ตั้งค่า commission tier  
**Features:**
- Password gate: `Wyde2026`
- แก้ไข tier_name, revenue_min/max, rate, active, sort_order
- บันทึกทุก tier พร้อมกัน

**ผู้ใช้:** Admin (password protected)

---

## 20. Targets (เป้าหมาย)
**Path:** `app/dashboard/targets/page.tsx`  
**วัตถุประสงค์:** ตั้งและติดตามเป้าหมายองค์กร + รายบุคคล  
**Features:**
- 2 แท็บ: Org / Sales
- Period view: month/quarter/year
- Progress bar actual vs target
- Sparkline ราย Sales
- เพิ่ม/แก้ไข target

**Tables:** `org_targets` (org), `sales_targets` (รายบุคคล)  
**ผู้ใช้:** Admin, Manager

---

## 21. Users (ผู้ใช้งาน)
**Path:** `app/dashboard/users/page.tsx`  
**วัตถุประสงค์:** จัดการ user account ในระบบ  
**Features:**
- เพิ่ม/แก้ไข user
- Toggle active/inactive
- Assign manager (manager_id)
- กำหนด role + level

**Roles:** `admin`, `sales`, `admin_sales`, `executive`, `finance`  
**Levels:** `staff`, `senior`, `manager`, `director`, `MD`  
**ผู้ใช้:** Admin

---

## 22. Warranty (ใบรับประกัน)
**Path:** `app/dashboard/warranty/page.tsx`  
**วัตถุประสงค์:** จัดการใบรับประกันงานหลังส่งมอบ  
**Features:**
- เพิ่ม/แก้ไข warranty
- คำนวณ warranty_end อัตโนมัติ (start + months)
- กรอง project / status
- Status real-time: `active` / `expiring_soon` (≤30 วัน) / `expired`

**ผู้ใช้:** Admin, Operations
