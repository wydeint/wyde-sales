/**
 * Canonical status vocabulary — labels and colours for every status the app shows.
 *
 * These maps used to be redefined per page, and had drifted apart: `interested`
 * was blue on Customers but green on Sales Performance, `quoted` was orange on
 * one and amber on the other, `booked` was orange on two pages and purple on
 * Quick Mode. Quick Mode also mapped two statuses that do not exist in the data
 * (`following`, `not_interested`) while omitting four that do — so `closed`,
 * which is most of the table, rendered as raw English in grey.
 *
 * Colour assignment follows .claude/design/color.md:
 *   blue   informational, early funnel, no action outstanding
 *   orange action needed / awaiting the customer
 *   purple last step before won
 *   green  done, won, paid
 *   red    lost, cancelled, overdue  (error states ONLY — never a normal state)
 *
 * `badge` is a full className for a status chip. `color` is the bare token, for
 * progress bars and chart fills where a chip would be wrong.
 */

export type CrmStage =
  | 'new' | 'interested' | 'quoted' | 'close_pending' | 'booked' | 'closed' | 'lost'

export interface StatusEntry<T extends string = string> {
  value: T
  label: string
  icon: string
  badge: string
  color: string
}

/**
 * Ordered by funnel position — safe to render as a stage list, filter row, or
 * funnel chart.
 *
 * `booked` sits AFTER `close_pending`. Two places in the app defined the
 * prospect set as new/interested/quoted/close_pending, excluding `booked` —
 * that set decides whether a customer appears under Prospects or My Deals, so
 * it is the behavioural source of truth. The Dashboard and Sales Performance
 * funnels had `booked` before `close_pending`, which drew a customer counted
 * as a prospect further along the funnel than one who is not. Fixed here.
 */
export const CRM_STAGES: StatusEntry<CrmStage>[] = [
  { value: 'new',           label: 'ใหม่',         icon: '●', badge: 'badge badge-blue',   color: 'var(--accent-blue)' },
  { value: 'interested',    label: 'สนใจ',         icon: '◉', badge: 'badge badge-blue',   color: 'var(--accent-blue)' },
  { value: 'quoted',        label: 'เสนอราคาแล้ว', icon: '◈', badge: 'badge badge-orange', color: 'var(--accent-orange)' },
  { value: 'close_pending', label: 'รอปิด',        icon: '◷', badge: 'badge badge-purple', color: 'var(--accent-purple)' },
  { value: 'booked',        label: 'จอง',          icon: '★', badge: 'badge badge-orange', color: 'var(--accent-orange)' },
  { value: 'closed',        label: 'ปิดแล้ว',      icon: '✓', badge: 'badge badge-green',  color: 'var(--accent-green)' },
  { value: 'lost',          label: 'หลุด',         icon: '✕', badge: 'badge badge-red',    color: 'var(--accent-red)' },
]

/**
 * Stages that still count as a prospect — a customer here has not committed.
 * Drives the Prospects / My Deals split and the "budget vs revenue" display.
 */
export const PROSPECT_STAGES: CrmStage[] = ['new', 'interested', 'quoted', 'close_pending']

export const isProspectStage = (s: string | null | undefined): boolean =>
  PROSPECT_STAGES.includes(s as CrmStage)

/** Funnel order excluding `lost`, which is an exit, not a step. */
export const FUNNEL_ORDER: CrmStage[] = CRM_STAGES.filter(s => s.value !== 'lost').map(s => s.value)

const UNKNOWN: StatusEntry = {
  value: '', label: '—', icon: '·', badge: 'badge badge-gray', color: 'var(--text-3)',
}

/** Never throws — an unrecognised status degrades to a neutral grey chip. */
export function crmStage(s: string | null | undefined): StatusEntry {
  return CRM_STAGES.find(x => x.value === s) ?? (s ? { ...UNKNOWN, value: s, label: s } : UNKNOWN)
}

/** jobs.working_status — Thai values stored verbatim in the database. */
export const WORKING_STATUSES: StatusEntry[] = [
  { value: 'จอง',        label: 'จอง',        icon: '★', badge: 'badge badge-orange', color: 'var(--accent-orange)' },
  { value: 'ดำเนินการ',  label: 'ดำเนินการ',  icon: '◐', badge: 'badge badge-blue',   color: 'var(--accent-blue)' },
  { value: 'รอส่งมอบ',   label: 'รอส่งมอบ',   icon: '◷', badge: 'badge badge-orange', color: 'var(--accent-orange)' },
  { value: 'ส่งมอบแล้ว', label: 'ส่งมอบแล้ว', icon: '✓', badge: 'badge badge-green',  color: 'var(--accent-green)' },
  { value: 'ยกเลิก',     label: 'ยกเลิก',     icon: '✕', badge: 'badge badge-red',    color: 'var(--accent-red)' },
]

export function workingStatus(s: string | null | undefined): StatusEntry {
  return WORKING_STATUSES.find(x => x.value === s) ?? (s ? { ...UNKNOWN, value: s, label: s } : UNKNOWN)
}

/**
 * payments.status stores only 'paid' and 'pending'. 'overdue' is derived at
 * render time from a pending row whose due_date has passed — keep it that way,
 * so an unpaid-but-not-yet-due instalment never shows as an error.
 */
export const PAYMENT_STATUSES: StatusEntry[] = [
  { value: 'paid',    label: 'ชำระแล้ว',   icon: '✓', badge: 'badge badge-green',  color: 'var(--accent-green)' },
  { value: 'pending', label: 'รอชำระ',     icon: '◷', badge: 'badge badge-orange', color: 'var(--accent-orange)' },
  { value: 'overdue', label: 'เกินกำหนด',  icon: '!', badge: 'badge badge-red',    color: 'var(--accent-red)' },
]

export function paymentStatus(s: string | null | undefined): StatusEntry {
  return PAYMENT_STATUSES.find(x => x.value === s) ?? UNKNOWN
}
