# Wyde CRM — Technical Architecture

> อัพเดต 2026-07-25

---

## Stack

| Layer | Technology |
|-------|-----------|
| Frontend | Next.js 16.2.9 (App Router, Turbopack) + React 19 + TypeScript |
| Styling | Tailwind CSS v4 + design tokens (`src/app/globals.css`) |
| Database | Supabase (PostgreSQL) |
| Auth | Supabase Auth |
| File Storage | Google Drive API (ผ่าน service account) |
| Hosting | Vercel |
| Notifications | LINE Messaging API (กดส่งเองเท่านั้น ไม่มีอัตโนมัติ) |

---

## Project Structure

```
wyde-sales/
├── app/
│   ├── dashboard/           # หน้าทุกหน้า (ดู pages.md)
│   │   ├── admin-data/
│   │   ├── commission/
│   │   ├── customers/
│   │   ├── ... (22 หน้า)
│   │   └── layout.tsx       # Dashboard layout + sidebar
│   ├── globals.css          # CSS tokens + ds-table standard
│   └── layout.tsx           # Root layout (ห้ามเพิ่ม viewportFit: cover)
├── src/
│   └── app/
│       ├── layout.tsx       # src version
│       └── dashboard/
│           └── layout.tsx   # Sidebar navigation
├── docs/                    # Documentation (ไฟล์นี้)
├── public/                  # Static assets
└── package.json
```

---

## Supabase Configuration

| Setting | Value |
|---------|-------|
| Project ID | `kabdjmvmuvnarmpsdoho` |
| Region | — |
| URL | `https://kabdjmvmuvnarmpsdoho.supabase.co` |

### Row Level Security (RLS)

ระบบใช้ Supabase Auth ร่วมกับ `users` table ในการ control access  
Role-based access ทำในโค้ด (client-side check จาก `users.role`)

---

## Vercel Deployment

```bash
npx vercel --prod --token [token] --yes
```

**Token:** เก็บใน memory — never-expire token  
**Auto-deploy:** ไม่มี CI/CD อัตโนมัติ — deploy manually

---

## Google Drive Integration

ใช้สำหรับเก็บไฟล์แนบ job (`job_files` table)

**Files ที่ต้องระวัง (ห้าม commit):**
- `File for Learning/Google drive/wyde-sales-54f0298f8e65.json` — service account key
- `client_secret_2_*.json` — OAuth client secret
- `get-refresh-token.mjs` — script รับ refresh token
- `new refresh token.txt` — refresh token

---

## LINE Integration

**ไม่มีการส่งอัตโนมัติ** — ระบบไม่เคยส่ง LINE เองเมื่อรับชำระเงิน ผู้ใช้ต้องกดปุ่มเสมอ
(เคยมี auto-post แต่ถอดออกแล้ว ถ้าเจอโค้ดที่ส่งเองโดยไม่ผ่านการกด ถือว่าเป็นของตกค้าง)

**ขาออก — ผู้ใช้กดเอง** ที่การ์ดงวดชำระ มี 2 ปุ่ม:

| ปุ่ม | ทำอะไร |
|------|--------|
| 💬 LINE | โพสต์เข้ากลุ่มผ่าน `POST /api/line-notify` แล้วบันทึกเวลาลง `payments.line_notified_at` |
| copy | คัดลอกข้อความไปวางเอง ไม่แตะฐานข้อมูล |

`line_notified_at` จึงเป็น "เคยกดส่งไปแล้วเมื่อไหร่" — ปุ่มจะไม่ส่งซ้ำถ้ามีค่าอยู่
เว้นแต่ผู้ใช้ยืนยันผ่าน `confirm()`

ข้อความสร้างโดย `generateLineMsg` ซึ่งยัง**มีสองชุด** (`my-deals/page.tsx` และ
`components/ui/JobDrawer.tsx`) — แก้ที่เดียวไม่พอ

**ขาเข้า — `POST /api/line-webhook`** ไม่ได้ทำงานกับข้อมูลใด ๆ หน้าที่เดียวคือ log
`groupId` ลง Vercel logs เพื่อเอาไปตั้งเป็น env `LINE_GROUP_ID` ตอบ 200 เสมอกัน LINE retry
เป็น route สาธารณะ (middleware ยกเว้นไว้)

> ⚠️ `sendLineNotify` ใน `dashboard/quick/page.tsx:556` ประกาศไว้แต่**ไม่มีใครเรียก**
> เป็นโค้ดตายจากตอนถอด auto-post ลบได้

---

## Environment Variables

```env
NEXT_PUBLIC_SUPABASE_URL=https://kabdjmvmuvnarmpsdoho.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=[anon key]
SUPABASE_SERVICE_ROLE_KEY=[service role key]
GOOGLE_CLIENT_ID=[...]
GOOGLE_CLIENT_SECRET=[...]
GOOGLE_REFRESH_TOKEN=[...]
LINE_CHANNEL_ACCESS_TOKEN=[...]
```

---

## Auth Flow

1. User เข้า `/` → redirect ไป `/login`
2. Login ด้วย email/password ผ่าน Supabase Auth
3. Session เก็บใน cookie (Supabase default)
4. `users` table ใช้ check role/permission ในแต่ละหน้า
5. Middleware หรือ server check บน sensitive routes

---

## Key Patterns

### Supabase Client

```typescript
import { createClient } from '@/lib/supabase/client' // client-side
import { createClient } from '@/lib/supabase/server' // server-side (RSC)
```

### Data Fetching

ส่วนใหญ่เป็น client-side fetch ใน useEffect/event handlers  
ไม่ใช้ React Query — fetch โดยตรงจาก Supabase JS client

### Real-time

ไม่ใช้ Supabase Realtime subscriptions — manual refresh หลัง mutation

---

## Known Constraints

- **Mobile:** ใช้ Quick page (`/quick`) สำหรับงาน field — หน้าอื่นออกแบบสำหรับ desktop
- **Thai language:** ตัวแปร, labels, และ status values ส่วนใหญ่เป็นภาษาไทย
- **Legacy data:** งานก่อนมีระบบ payment plan อาจไม่มี `payment_plan_type` หรือ `is_work_trigger` — Reconcile Check 5 exclude กลุ่มนี้ไปแล้ว

---

## Data Integrity Rules

1. เมื่อ reset `jobs.working_status` กลับ → ต้อง reset `customers.status` ด้วย
2. `กำลังดำเนินการ` ถูก migrate เป็น `ดำเนินการ` ทั้งหมดแล้ว — ห้ามใช้ค่าเก่าในโค้ดใหม่
3. B2B PO jobs — `work_start_date` set ตอนรับ PO, ไม่ใช่ตอนจ่ายเงิน
4. `total_settled` ไม่ได้เก็บในฐาน — คำนวณ realtime จาก `SUM(payments.paid_amount)`
