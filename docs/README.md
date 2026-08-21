# Wyde CRM — Documentation Index

> อัพเดตล่าสุด: 2026-07-25 | Next.js 14 App Router + Supabase + Vercel

## ภาพรวม

**Wyde CRM** คือระบบ CRM สำหรับบริษัทรับเหมาตกแต่งภายในคอนโด ครอบคลุมตั้งแต่ lead intake, sales pipeline, การชำระเงิน, การส่งมอบงาน ไปจนถึง warranty after-sales และ executive reporting

**URL ที่ deploy:** deploy บน Vercel  
**Supabase Project ID:** `kabdjmvmuvnarmpsdoho`

---

## สารบัญ

| ไฟล์ | เนื้อหา |
|------|---------|
| [pages.md](pages.md) | ทุกหน้าในระบบ — วัตถุประสงค์, features, ผู้ใช้งาน |
| [database.md](database.md) | Schema ทุก table, column types, ความสัมพันธ์ |
| [business-logic.md](business-logic.md) | Payment logic, working_status, Prospect/My Deals filter, B2B rules |
| [ui-standards.md](ui-standards.md) | Design system, ds-table standard, CSS tokens, badge/chip |
| [tech-stack.md](tech-stack.md) | Architecture, deploy, environment variables, security |

---

## Quick Reference

### Status Values ที่สำคัญ

| field | ค่าที่ใช้ |
|-------|----------|
| `jobs.working_status` | `ดำเนินการ`, `ส่งมอบแล้ว`, `จอง`, `ยกเลิก`, `รอส่งมอบ` |
| `payments.status` | `pending`, `paid` |
| `customers.status` | `new`, `booked`, `closed`, `lost` |
| `jobs.payment_plan_type` | `plan_a`, `plan_b`, `plan_c`, `po_bill`, `custom_b2b` |

### หน้าหลักที่ใช้บ่อย

- **Prospect:** `app/dashboard/pipeline/` — ลูกค้าที่ชำระ <50% (B2C) หรือยังไม่ปิดงาน
- **My Deals:** `app/dashboard/my-deals/` — ลูกค้าที่ชำระ ≥50% หรือเป็น B2B
- **Payments:** `app/dashboard/payments/` — ตรวจสอบ installment และเอกสาร
- **Admin Data:** `app/dashboard/admin-data/` — แก้ไขข้อมูลตรงในทุก table
