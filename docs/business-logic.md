# Wyde CRM — Business Logic

> Payment flow, status rules, page visibility, และ B2B logic | อัพเดต 2026-07-25

---

## Payment Plans

### B2C — 3 แผน

#### แผน A — 100% ครั้งเดียว
```
งวด 1: 100%  [is_work_trigger ✅] [is_final ✅]
```
- บันทึกจ่ายงวด 1 ทันทีใน SetupAndPayModal
- เริ่มงานพร้อมกัน → ย้ายไป My Deals ทันที

#### แผน B — 50 + 50
```
งวด 1: 50%  [is_work_trigger ✅]
งวด 2: 50%  [is_final ✅]
```
- จ่ายงวด 1 → เริ่มงาน + ย้ายไป My Deals
- จ่ายงวด 2 → ปลด Handover Modal

#### แผน C — มัดจำ + 50 + 50
```
งวด 1: มัดจำ (จำนวนตามที่ตกลง)
งวด 2: 50%  [is_work_trigger ✅]
งวด 3: 50%  [is_final ✅]
```
- จ่ายงวด 1 → ยังอยู่ Prospect (total < 50%)
- จ่ายงวด 2 → เริ่มงาน + ย้ายไป My Deals
- จ่ายงวด 3 → ปลด Handover

---

### B2B — 2 แผน

#### แผน PO / วางบิล (`payment_plan_type = 'po_bill'`)
```
งวด 1: 100%  [is_final ✅]  — ไม่มี is_work_trigger
```
- **เริ่มงานได้ทันทีหลังรับ PO** — ไม่รอการชำระ
- `work_start_date` = วันที่รับ PO (กรอกเข้ามาตอนตั้งแผน)
- **วางบิลและรับเงิน 100% หลังส่งมอบงาน**
- ขึ้น My Deals ทันทีเมื่อตั้งแผน (B2B exception)
- แสดง chip `bill` เมื่อส่งมอบแล้วแต่ยังไม่ได้รับเงิน

#### แผน B2B กำหนดงวดเอง (`payment_plan_type = 'custom_b2b'`)
```
งวด 1: X%   [is_work_trigger ✅]
งวด 2..N: ...
งวด N: Y%   [is_final ✅]
```
- **เริ่มงานเมื่อชำระงวดแรก**
- ขึ้น My Deals ทันทีเมื่อตั้งแผน (B2B exception)
- สัดส่วนแต่ละงวดกำหนดเองได้ (รวม = 100%)

---

## Prospect vs My Deals Filter

**Source:** `my-deals/page.tsx:2094`

```javascript
// My Deals filter — ตัดออกเฉพาะ B2C ที่ชำระ < 50%
if (j.customer_type !== 'B2B' && !j.actual_deliver_date) {
  const jobValue = j.revenue_inc_vat || 0
  if (jobValue > 0 && j.total_settled / jobValue < 0.5) return false
}
```

| หน้า | เงื่อนไข B2C | เงื่อนไข B2B |
|------|-------------|-------------|
| **Prospect** | `total_settled / revenue_inc_vat < 0.5` | ไม่แสดง (ขึ้น My Deals ทันที) |
| **My Deals** | `total_settled / revenue_inc_vat >= 0.5` | ขึ้นทันทีเมื่อตั้งแผน |
| **My Deals** (exception) | `actual_deliver_date` มีค่า → ขึ้นเสมอ | — |

> `total_settled` = ผลรวม `payments.paid_amount` ของ job นั้น

---

## Trigger Payment Flow

เมื่อบันทึกชำระงวดที่มี `is_work_trigger = true` (**PayModal.save()**)

```
PayModal.save()
  ├─ payments.status        = 'paid'
  ├─ payments.paid_date     = วันที่จ่าย
  └─ if (is_work_trigger && !job.work_start_date):
       ├─ jobs.work_start_date  = paidDate
       ├─ jobs.working_status   = 'ดำเนินการ'
       └─ customers.status      = 'closed'
```

**Source:** `my-deals/page.tsx:513-515`

> ⚠️ `customers.status` ต้องตรงกับ `jobs.working_status` — ถ้า reset job กลับ ต้องรีเซ็ต customer ด้วย (ดู Reconcile Check 3)

---

## Handover / Delivery Flow

เมื่อส่งมอบงาน (**HandoverModal.save()**)

```
HandoverModal.save()
  ├─ jobs.actual_deliver_date = deliverDate
  ├─ jobs.working_status      = 'ส่งมอบแล้ว'
  └─ jobs.commission_month    = commissionMonth
```

**เงื่อนไขปลด HandoverModal:** งวด `is_final` ถูก paid แล้ว  
(หรือ B2B po_bill สามารถกด "ส่งมอบก่อนวางบิล" ได้)

---

## Voucher (B2C only)

- ผูกกับงวดที่จ่ายจริงทีละงวด — ไม่สามารถตั้งล่วงหน้า
- `payments.voucher_code` + `payments.voucher_amount`
- `paid_amount` = ยอดรับจริงหลังหัก voucher
- สูตร: `net_received = paid_amount - voucher_amount`

---

## Reconcile Checks (Admin Data page)

ตรวจสอบความสอดคล้องของข้อมูล 5 ข้อ — path: `admin-data/page.tsx`

| # | ชื่อ | Pass condition |
|---|------|----------------|
| 1 | Jobs without payment plan | jobs active ทุกตัวต้องมี payment plan |
| 2 | Negative/zero payments | ห้ามมี paid_amount ≤ 0 ในงวดที่ paid |
| 3 | Sync jobs ↔ customers | jobs ที่ working_status = ดำเนินการ/ส่งมอบแล้ว → customers.status = closed |
| 4 | Delivered without date | working_status = ส่งมอบแล้ว ต้องมี actual_deliver_date |
| 5 | Trigger payment | jobs ที่มี `is_work_trigger` ใน plan (ไม่ใช่ po_bill) ต้องมีงวด trigger ที่ paid แล้ว |

**Check 5 exclusions:**
- `payment_plan_type = 'po_bill'` (B2B PO — เริ่มงานโดยไม่รอ trigger)
- Jobs ที่ไม่มี `is_work_trigger` ใน plan เลย (legacy data ก่อนมีระบบ)

---

## Commission Tier

คำนวณจาก `commission_settings` table (ตั้งค่าได้ใน Settings page, password: `Wyde2026`)

```
tier_name | revenue_min | revenue_max | rate
```

- ระบบเลือก tier จาก `revenue_inc_vat` ของ job
- Commission = `revenue_inc_vat × rate / 100`
- Bonus และ referral commission แยกต่างหาก

---

## Customer Status Lifecycle

```
new → interested → quoted → close_pending → booked → closed
                                          ↘ lost
```

- `closed` = jobs.working_status เปลี่ยนเป็น `ดำเนินการ` (trigger paid)
- `lost` = ยกเลิก — บันทึก cancel_type, cancel_date, cancel_amount

---

## working_status Rules

| ค่า | ตั้งเมื่อ | ใคร set |
|-----|---------|---------|
| `จอง` | ตั้ง job ใหม่ (ก่อนมีแผน) | manual |
| `ดำเนินการ` | trigger payment paid | PayModal (auto) |
| `ส่งมอบแล้ว` | ส่งมอบงาน | HandoverModal (auto) |
| `รอส่งมอบ` | รอคิวส่งมอบ | manual |
| `ยกเลิก` | ยกเลิกงาน | manual |
