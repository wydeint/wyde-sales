import { type ClassValue, clsx } from 'clsx'
import { twMerge } from 'tailwind-merge'

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

// Compact for mobile: 1.5M / 500K / 50K
export function fmtCompact(n: number | null | undefined): string {
  if (n == null) return '—'
  const abs = Math.abs(n)
  if (abs >= 1_000_000) return (n / 1_000_000).toFixed(abs % 1_000_000 === 0 ? 0 : 1) + 'M'
  if (abs >= 1_000) return (n / 1_000).toFixed(abs % 1_000 === 0 ? 0 : 1) + 'K'
  return String(Math.round(n))
}
