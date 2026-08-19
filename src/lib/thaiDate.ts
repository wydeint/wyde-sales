/**
 * One reading of a date for the whole app: วัน/เดือน/ปี, Buddhist Era.
 *
 * `<input type="date">` renders in the **browser's** locale, not the page's —
 * Chrome ignores both `lang="th-TH"` on the field and `<html lang="th">`. On a
 * machine set to en-US, 1 กุมภาพันธ์ 2569 shows as `2/1/2569`, which reads as
 * 2 January to anyone here. The 38 `lang="th-TH"` attributes scattered through
 * the date fields never did anything.
 *
 * The native field has to stay — it is what gives iPhone its date wheel — so
 * the fix is to print the date next to it in a form that cannot be misread.
 */

const MONTHS_SHORT = [
  'ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.',
  'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.',
]

/** '2026-02-01' → '1 ก.พ. 2569'. Empty in, empty out. */
export function thaiDate(iso: string | null | undefined): string {
  if (!iso) return ''
  const [y, m, d] = iso.slice(0, 10).split('-').map(Number)
  if (!y || !m || !d) return ''
  return `${d} ${MONTHS_SHORT[m - 1]} ${y + 543}`
}

/** '2026-02-01' → '01/02/2569' — for tables where the columns should line up. */
export function thaiDateNumeric(iso: string | null | undefined): string {
  if (!iso) return ''
  const [y, m, d] = iso.slice(0, 10).split('-').map(Number)
  if (!y || !m || !d) return ''
  return `${String(d).padStart(2, '0')}/${String(m).padStart(2, '0')}/${y + 543}`
}
