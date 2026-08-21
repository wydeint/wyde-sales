# Wyde CRM — UI Standards

> Design system, CSS tokens, table standard | อัพเดต 2026-07-26  
> Source: `app/globals.css`

---

## CSS Design Tokens

ทุก token ถูก define ใน `:root` (light) และ `.dark` / `@media (prefers-color-scheme: dark)`

### Color Tokens

| Token | Light | Dark | ใช้งาน |
|-------|-------|------|--------|
| `--text-1` | `#1e1b4b` | `#f1f5f9` | ข้อความหลัก |
| `--text-2` | — | — | ข้อความรอง |
| `--text-3` | — | — | ข้อความ muted (td-sub) |
| `--accent` | `#6366f1` | `#818cf8` | Indigo — สี accent หลัก |
| `--accent-green` | `#059669` | `#34d399` | ยอดเงิน, สถานะดี |
| `--accent-purple` | `#7c3aed` | `#a78bfa` | — |
| `--accent-blue` | `#2563eb` | `#60a5fa` | — |
| `--accent-orange` | `#ea580c` | `#fb923c` | — |
| `--accent-red` | `#dc2626` | `#f87171` | overdue, error |
| `--accent-amber` | — | — | commission values |
| `--table-stripe` | `rgba(99,102,241,0.04)` | `rgba(255,255,255,0.04)` | zebra stripe |
| `--hover-bg` | — | — | hover state |
| `--divider` | — | — | เส้นแบ่ง |
| `--card-bg` | — | — | background การ์ด |

---

## ds-table Standard

**Reference implementation:** `app/dashboard/payments/page.tsx`  
**Class:** `.ds-table`

### Rules

```html
<div class="tbl-scroll overflow-x-auto">
  <table class="ds-table" style="min-width: 900px">
    <thead>
      <tr>
        <th>ห้อง / โครงการ</th>
        <th>ลูกค้า / Sales</th>
        <th class="th-r">ยอดเงิน</th>
      </tr>
    </thead>
    <tbody>
      <tr>
        <td>
          <p class="td-primary">{room_no}</p>
          <p class="td-accent truncate max-w-[140px]">{project_name}</p>
        </td>
        <td>
          <p class="td-body">{customer_name}</p>
          <p class="td-sub">{sales_name}</p>
        </td>
        <td class="td-r">
          <p class="td-number" style="color: var(--accent-green)">{amount}</p>
        </td>
      </tr>
    </tbody>
  </table>
</div>
```

### Column Order Rule

หากตารางมี ห้อง + โครงการ + ลูกค้า ต้องเรียงตามนี้เสมอ:

```
คอลัมน์ 1: เลขห้อง (td-primary) + ชื่อโครงการ (td-accent)
คอลัมน์ 2: ชื่อลูกค้า (td-body) + Sales/ข้อมูลรอง (td-sub)
คอลัมน์ 3+: ข้อมูลอื่น
```

### Text Role Classes

| Class | Font Size | Weight | Color | ใช้งาน |
|-------|-----------|--------|-------|--------|
| `.td-primary` | 13px | 700 | `--text-1` | เลขห้อง, รหัสหลัก |
| `.td-body` | 13px | 400 | `--text-1` | ชื่อลูกค้า, ข้อความหลักทั่วไป |
| `.td-accent` | 12px | 400 | `--accent` | ชื่อโครงการ, ข้อมูลรอง (สีม่วง) |
| `.td-sub` | 12px | 400 | `--text-3` | Sales name, ข้อมูลรอง (muted) |
| `.td-number` | 13px | 600 | (inherit) | ตัวเลขทุกชนิด (tabular-nums) |

### Layout CSS

```css
.ds-table { width: 100%; border-collapse: collapse; }
.ds-table thead tr { background: var(--hover-bg); border-bottom: 0.5px solid var(--divider); }
.ds-table thead th { padding: 10px 16px; font-size: 12px; font-weight: 600; color: var(--text-3); text-align: left; white-space: nowrap; }
.ds-table thead th.th-r { text-align: right; }
.ds-table thead th.th-c { text-align: center; }
.ds-table tbody tr { border-bottom: 0.5px solid var(--divider); }
.ds-table tbody tr:last-child { border-bottom: none; }
.ds-table tbody tr:nth-child(even) { background: var(--table-stripe); }  /* zebra */
.ds-table tbody tr:hover { background: var(--hover-bg) !important; cursor: pointer; }
.ds-table td { padding: 10px 16px; vertical-align: middle; }
.ds-table td.td-r { text-align: right; font-variant-numeric: tabular-nums; }
.ds-table td.td-c { text-align: center; }
```

---

## Badge Classes

| Class | Color | ใช้งาน |
|-------|-------|--------|
| `.badge-green` | accent-green (15% bg) | สถานะดี, paid |
| `.badge-blue` | accent-blue | ข้อมูลทั่วไป |
| `.badge-purple` | accent-purple | — |
| `.badge-orange` | accent-orange | warning |
| `.badge-red` | accent-red | error, overdue |

---

## Button Classes

| Class | Style | ใช้งาน |
|-------|-------|--------|
| `.btn` | base style | ปุ่มทั่วไป |
| `.btn-green` | accent-green bg | บันทึก, confirm |
| `.btn-purple` | accent-purple bg | — |
| `.btn-blue` | accent-blue bg | primary action |
| `.btn-red` | (implied) | ลบ, ยกเลิก |

---

## Form Fields

```css
.field-input { /* input, select, textarea */ }
.field-input:focus { border-color: var(--accent); }
```

---

## InstallmentRow Standard (My Deals / Prospect)

**Source:** `app/dashboard/my-deals/page.tsx` — `InstallmentRow` component  
**หลักการ:** ออกแบบสำหรับ mobile-first, flat minimal, ตามหลักบัญชี Gross → Net

### Layout งวดที่จ่ายแล้ว (status = paid)

```
✓  งวด N · {installment_name}  [เริ่มงาน?] [สุดท้าย?]   ฿{net} ✏
   ┌──────────────────────────────┐   ← แสดงเฉพาะเมื่อมี voucher
   │ ยอดงวด (Gross)    ฿{amount} │
   │ หัก Voucher      -฿{voucher}│
   │ No. {voucher_code}           │   ← รหัสแยกบรรทัด (mobile-safe)
   ├──────────────────────────────┤
   │ รับจริง (Net)     ฿{net}    │
   └──────────────────────────────┘
   วันที่รับเงิน   [{paid_date}] ✏
   ช่องทางชำระ    {channel} ▾
   เอกสาร         ○/✓ Slip   ○/✓ ใบเสร็จรับเงิน
   ─────────────────────────────────
   แจ้งทีม        [💬 LINE] [copy]
   ─────────────────────────────────
   [🗑]                              ← ล่างสุดคนเดียว ลด accidental tap
```

### กฎการออกแบบ

| หัวข้อ | กฎ |
|--------|-----|
| **Voucher box** | แสดงเป็น row แรกใน paid body, เฉพาะเมื่อ `voucher_amount > 0` |
| **Voucher code** | แยกบรรทัดย่อย `No. {code}` ใต้บรรทัด หัก — ไม่ยัดในบรรทัดเดียวกับยอด |
| **ยอดหัวงวด** | แสดง **Net** (`paid_amount`) เสมอ — ตรงกับ Net ใน voucher box |
| **เอกสาร** | plain text + icon (ไม่มี border chip) — icon เปลี่ยนสีเมื่อแนบแล้ว: Slip = `#60a5fa`, ใบเสร็จ = `#4ade80` |
| **แจ้งทีม** | มีเส้น divider คั่น, label "แจ้งทีม" นำหน้า, ปุ่มเหลือแค่ icon (LINE / copy) |
| **ถังขยะ** | อยู่ล่างสุดคนเดียว มีเส้น divider คั่น — ห่างจาก action อื่นทุกปุ่ม |

### PayModal (บันทึกรับเงิน)

```
เลือกงวด (installment selector)
──────────────────────────────────
ยอดที่รับ (฿)    |  วันที่รับเงิน
──────────────────
☐ หัก Voucher / ส่วนลด
  รหัส Voucher  |  ยอดส่วนลด (฿)
  ┌─────────────────────┐
  │ ยอดงวด (Gross) ฿... │
  │ หัก Voucher    ฿... │
  │ รับจริง (Net)  ฿... │
  └─────────────────────┘
──────────────────────────────────
ช่องทางชำระเงิน
──────────────────────────────────
☐ สลิปโอนเงิน / บัตรเครดิต
☐ ใบเสร็จรับเงิน
──────────────────────────────────
[บันทึก ฿{net}]
```

---

## อื่นๆ

- **ห้ามเพิ่ม `viewportFit: 'cover'`** ใน `src/app/layout.tsx` — ทำให้แถบสีขาวที่ด้านล่างทุกหน้าบน iOS
- Font sizes ในตาราง **ล็อคไว้ที่ 12-13px** ตาม payments standard — ห้ามเปลี่ยน
- ทุก table ต้องครอบด้วย `overflow-x: auto` container เพื่อป้องกัน horizontal scroll ระดับ page
