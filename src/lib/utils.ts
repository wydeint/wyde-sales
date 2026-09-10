import { type ClassValue, clsx } from 'clsx'
import { twMerge } from 'tailwind-merge'
import { bahtShort } from '@/lib/money'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

// ── Date ──────────────────────────────────────────────────────────
// Standard short date: 15 ม.ค. 68  (วัน เดือน ปี เสมอ)
export function fmtDate(d: string | null | undefined): string {
  if (!d) return '—'
  const date = new Date(d)
  if (isNaN(date.getTime())) return '—'
  return date.toLocaleDateString('th-TH', { day: '2-digit', month: 'short', year: '2-digit' })
}

// Long date: 15 มกราคม 2568
export function fmtDateLong(d: string | null | undefined): string {
  if (!d) return '—'
  const date = new Date(d)
  if (isNaN(date.getTime())) return '—'
  return date.toLocaleDateString('th-TH', { day: 'numeric', month: 'long', year: 'numeric' })
}

// ── Money ─────────────────────────────────────────────────────────
// Full: 1,500,000
export function fmtMoney(n: number | null | undefined): string {
  if (n == null) return '—'
  return Math.round(n).toLocaleString('th-TH')
}

/** The narrow half of <Money>, shown below the `sm` breakpoint. Delegates to
 *  the app-wide rule; it used to have its own (1.5M / 500K / 50K, no ฿). */
export function fmtCompact(n: number | null | undefined): string {
  if (n == null) return '—'
  // Callers render the ฿ themselves (`฿<Money value={...} />`), so strip the
  // one bahtShort adds rather than printing ฿฿1.69 MB.
  return bahtShort(n).replace('฿', '')
}

// ── Room order ────────────────────────────────────────────────────
/**
 * The standard room order: A→Z on the letters, then low→high on the digits.
 *
 * Plain string sort puts A10 before A2 because it compares character by
 * character, so `numeric: true` is what makes the number read as a number.
 * `sensitivity: 'base'` keeps a stray lower-case room next to its neighbours,
 * and the 'th' locale matches the rest of the app's sorting.
 *
 * Lives here because Prospects, My Deals and Handover all list rooms and each
 * had its own idea of the order — Handover had none at all and showed whatever
 * order Postgres returned.
 */
export function compareRoom(a: string | null | undefined, b: string | null | undefined): number {
  return (a || '').localeCompare(b || '', 'th', { numeric: true, sensitivity: 'base' })
}

/**
 * Do two room labels mean the same room?
 *
 * `jobs.room_no` was cleaned up at some point; `warranties.room` was not, so
 * the same room is written "809" on the job and "Z-809" on the warranty, or
 * "A2401" against "A-2401". Comparing the raw strings — which the customer
 * drawer did — matched only 140 of 512 warranties and silently dropped the
 * other 372.
 *
 * So: fold case, drop separators, and drop the legacy "Z" prefix that the old
 * sheet put in front of every room. Prefer `job_id` where a row has one; this
 * is the fallback for the six warranties that don't.
 */
export function sameRoom(a: string | null | undefined, b: string | null | undefined): boolean {
  const norm = (s: string | null | undefined) => {
    const t = (s || '').toUpperCase().replace(/[^A-Z0-9]/g, '')
    return t.startsWith('Z') ? t.slice(1) : t
  }
  const na = norm(a)
  return na !== '' && na === norm(b)
}
