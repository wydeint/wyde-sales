// Expected delivery date (วันคาดส่งมอบ) — single source of truth.
//
// Two fields carry it in `jobs`, and they are populated by different flows:
//   - expected_finish_date : set by hand in Jobs / Job Registry
//   - work_start_date + work_days : the Handover derivation, filled automatically
//     when a work-trigger installment is paid
// The explicit field wins when present; otherwise fall back to the derivation.

/**
 * จำนวนวันทำงานมาตรฐานเมื่องานไม่ได้ระบุไว้ (เจ้าของกำหนด 60 วัน 2026-09-01)
 *
 * เดิมเป็น 45 ซึ่งกระจายอยู่ในโค้ดสองที่ — ตัวเลขเดียวกันแต่แก้คนละที่คือ
 * ที่มาของ "หน้าหนึ่งบอกเลยกำหนด อีกหน้าบอกยังไม่ถึง"
 */
export const DEFAULT_WORK_DAYS = 60

export function addDays(dateStr: string, days: number): string {
  const d = new Date(dateStr)
  d.setDate(d.getDate() + days)
  return d.toISOString().slice(0, 10)
}

export interface DeliveryJobCtx {
  expected_finish_date?: string | null
  work_start_date?: string | null
  work_days?: number | null
}

/** ISO yyyy-mm-dd, or null when neither source is available. */
export function expectedDeliveryDate(
  job: DeliveryJobCtx,
  workStartOverride?: string | null
): string | null {
  if (job.expected_finish_date) return job.expected_finish_date
  const start = workStartOverride || job.work_start_date
  if (!start) return null
  return addDays(start, job.work_days ?? DEFAULT_WORK_DAYS)
}

/** dd/mm/yy — matches the date format already used in the LINE message. */
export function fmtShortDate(iso: string): string {
  const d = new Date(iso)
  return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${String(d.getFullYear()).slice(2)}`
}
