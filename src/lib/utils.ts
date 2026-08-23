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
