/**
 * One definition of "which dates does this period cover".
 *
 * getPeriodBounds() existed twice — in finance/page.tsx and executive/page.tsx —
 * and had already drifted: the Finance copy normalises the week start with
 * setHours(0,0,0,0) and the Sales Performance copy does not, and only Finance
 * knows about 'today'. Two screens answering "what is this week" differently is
 * exactly the class of bug that is invisible until someone reconciles numbers.
 *
 * `offset` counts periods away from the one containing today: 0 = current,
 * -1 = previous, and so on. Positive offsets are allowed by the maths but the
 * picker blocks them, since no page has data from the future.
 */

export type PeriodUnit = 'today' | 'week' | 'month' | 'quarter' | 'year'

export const MONTHS_TH = [
  'ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.',
  'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.',
]

export const UNIT_LABELS: Record<PeriodUnit, string> = {
  today: 'วันนี้', week: 'สัปดาห์', month: 'เดือน', quarter: 'ไตรมาส', year: 'ปี',
}

/** ISO yyyy-mm-dd from local date parts — never toISOString(), which shifts by timezone. */
const ld = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`

/** Buddhist Era, for display only. ISO keys stay Gregorian. */
export const beYear = (y: number) => y + 543

export interface PeriodBounds {
  start: string
  end: string
  /** Full human label, e.g. "ส.ค. 2569" — used in headings and exports. */
  label: string
  /** Just the period name for the picker's fixed-width slot: "ส.ค." / "Q3" / "ปี". */
  name: string
  /** The year for the picker's fixed-width slot. Empty for week/today, whose
   *  label carries its own dates. */
  year: string
  /** Secondary line under the picker: the actual dates covered. */
  range: string
}

export function getPeriodBounds(unit: PeriodUnit, offset = 0): PeriodBounds {
  const now = new Date()

  if (unit === 'today') {
    const d = new Date(now)
    d.setDate(now.getDate() + offset)
    const s = ld(d)
    return {
      start: s, end: s,
      label: offset === 0 ? 'วันนี้' : `${d.getDate()} ${MONTHS_TH[d.getMonth()]}`,
      name: offset === 0 ? 'วันนี้' : `${d.getDate()} ${MONTHS_TH[d.getMonth()]}`,
      year: String(beYear(d.getFullYear())),
      range: `${d.getDate()} ${MONTHS_TH[d.getMonth()]} ${beYear(d.getFullYear())}`,
    }
  }

  if (unit === 'week') {
    const base = new Date(now)
    base.setDate(now.getDate() + offset * 7)
    const dow = base.getDay() === 0 ? 6 : base.getDay() - 1   // week starts Monday
    const mon = new Date(base)
    mon.setDate(base.getDate() - dow)
    mon.setHours(0, 0, 0, 0)
    const sun = new Date(mon)
    sun.setDate(mon.getDate() + 6)
    const d = (x: Date) => `${x.getDate()} ${MONTHS_TH[x.getMonth()]}`
    return {
      start: ld(mon), end: ld(sun),
      label: `${d(mon)} – ${d(sun)}`,
      name: `${d(mon)}–${d(sun)}`,
      year: String(beYear(mon.getFullYear())),
      range: `${d(mon)} – ${d(sun)} ${beYear(sun.getFullYear())}`,
    }
  }

  if (unit === 'month') {
    const m = now.getMonth() + offset
    const s = new Date(now.getFullYear(), m, 1)
    const e = new Date(now.getFullYear(), m + 1, 0)
    return {
      start: ld(s), end: ld(e),
      label: `${MONTHS_TH[s.getMonth()]} ${beYear(s.getFullYear())}`,
      name: MONTHS_TH[s.getMonth()],
      year: String(beYear(s.getFullYear())),
      range: `1–${e.getDate()} ${MONTHS_TH[s.getMonth()]} ${beYear(s.getFullYear())}`,
    }
  }

  if (unit === 'quarter') {
    const totalQ = Math.floor(now.getMonth() / 3) + offset
    const y = now.getFullYear() + Math.floor(totalQ / 4)
    const q = ((totalQ % 4) + 4) % 4
    const s = new Date(y, q * 3, 1)
    const e = new Date(y, q * 3 + 3, 0)
    return {
      start: ld(s), end: ld(e),
      label: `Q${q + 1} ${beYear(y)}`,
      name: `Q${q + 1}`,
      year: String(beYear(y)),
      range: `${MONTHS_TH[q * 3]}–${MONTHS_TH[q * 3 + 2]} ${beYear(y)}`,
    }
  }

  const y = now.getFullYear() + offset
  return {
    start: `${y}-01-01`, end: `${y}-12-31`,
    label: `ปี ${beYear(y)}`,
    name: 'ปี',
    year: String(beYear(y)),
    range: `ม.ค.–ธ.ค. ${beYear(y)}`,
  }
}

/** Months (1-12) a period covers in a given year — for pages keyed by month rows. */
export function monthsInPeriod(unit: PeriodUnit, offset = 0): number[] {
  const { start, end } = getPeriodBounds(unit, offset)
  const s = new Date(start), e = new Date(end)
  if (s.getFullYear() !== e.getFullYear()) return []
  const out: number[] = []
  for (let m = s.getMonth(); m <= e.getMonth(); m++) out.push(m + 1)
  return out
}
