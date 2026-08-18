'use client'

import { ChevronLeft, ChevronRight } from 'lucide-react'
import { getPeriodBounds, UNIT_LABELS, type PeriodUnit } from '@/lib/period'

/**
 * Unit buttons + a stepper, sharing one definition of every period.
 *
 * The point of the layout is that **nothing moves**. A fixed-width box is not
 * enough on its own: the labels differ by up to 83px at the app's font size
 * ("ปี 2569" is 43px, "Q2 (เม.ย.–มิ.ย.) 2569" is 126px), so centring them in a
 * fixed box slides the text ~41px each way — more visible than the box resizing.
 *
 * So every text slot reserves its own width instead:
 *   - the whole label sits in one group of a fixed GROUP width, so the arrows
 *     and everything after them never move, whatever the unit
 *   - inside it, the period name gets 34px right-aligned and the year 32px with
 *     tabular figures, pinned to the group's right edge — so across
 *     month/quarter/year the digits never shift between 2568 / 2569 / 2570
 *   - the date range underneath has its own fixed slot and always renders, so
 *     it can never push the content below it around
 *
 * Week and today carry their dates in the name itself and fill the group alone.
 * The group has to be sized for *them*, not for the month labels: the first cut
 * gave the wide units their own bigger slot, which moved the arrows 34px on
 * Finance every time the unit changed — the exact bug this component exists to
 * avoid. Widths below are the measured worst cases in the app's own font.
 */

const SLOT_NAME = 34         // "เม.ย." is widest at 30px
const SLOT_YEAR = 32         // "2569" is 31px
const SLOT_GROUP = 106       // "28 เม.ย.–31 เม.ย." is widest at 104px
const SLOT_RANGE = 114       // "28 เม.ย. – 31 เม.ย. 2569" is widest at 111px

export default function PeriodPicker({
  unit, setUnit, offset, setOffset,
  units = ['month', 'quarter', 'year'],
  allowFuture = false,
  className = '',
}: {
  unit: PeriodUnit
  setUnit: (u: PeriodUnit) => void
  /** Periods away from today: 0 = current, -1 = previous. */
  offset: number
  setOffset: (o: number) => void
  /** Which units this page offers. Finance adds 'today' and 'week'. */
  units?: PeriodUnit[]
  allowFuture?: boolean
  className?: string
}) {
  const b = getPeriodBounds(unit, offset)
  const wideName = unit === 'week' || unit === 'today'
  const atPresent = offset >= 0

  return (
    <div className={`flex items-center gap-3 flex-wrap ${className}`.trim()}>
      <div className="tab-group">
        {units.map(u => (
          <button key={u} onClick={() => { setUnit(u); setOffset(0) }}
            className={`tab-btn ${unit === u ? 'active' : ''}`}>
            {UNIT_LABELS[u]}
          </button>
        ))}
      </div>

      <div className="flex flex-col items-center">
        <div className="flex items-center gap-1">
          <button onClick={() => setOffset(offset - 1)} aria-label="ช่วงก่อนหน้า"
            className="p-1.5 rounded-[8px] transition-colors" style={{ background: 'var(--hover-bg)' }}>
            <ChevronLeft size={15} style={{ color: 'var(--text-2)' }} />
          </button>

          <span className="text-sm font-semibold px-3 py-1.5 rounded-[11px] ds-card flex items-center gap-1"
            style={{ color: 'var(--text-1)' }}>
            {/* One fixed-width group for every unit — the arrows sit outside it
                and therefore never move. */}
            <span style={{ display: 'inline-flex', width: SLOT_GROUP, justifyContent: 'flex-end', gap: 4 }}>
              {wideName ? (
                <span style={{ width: '100%', textAlign: 'center', fontVariantNumeric: 'tabular-nums' }}>{b.name}</span>
              ) : (
                <>
                  <span style={{ width: SLOT_NAME, textAlign: 'right' }}>{b.name}</span>
                  <span style={{ width: SLOT_YEAR, textAlign: 'left', fontVariantNumeric: 'tabular-nums' }}>{b.year}</span>
                </>
              )}
            </span>
            {/* Marks "this is the current period" without changing the layout —
                the dot slot is always there, only its colour changes. */}
            <span aria-hidden style={{
              display: 'inline-block', width: 6, height: 6, borderRadius: '50%',
              background: atPresent ? 'var(--accent)' : 'transparent',
            }} />
          </span>

          <button onClick={() => setOffset(offset + 1)} disabled={!allowFuture && atPresent}
            aria-label="ช่วงถัดไป"
            className="p-1.5 rounded-[8px] transition-colors disabled:opacity-30"
            style={{ background: 'var(--hover-bg)' }}>
            <ChevronRight size={15} style={{ color: 'var(--text-2)' }} />
          </button>
        </div>

        <span className="text-micro mt-0.5 text-center"
          style={{ color: 'var(--text-3)', width: SLOT_RANGE, fontVariantNumeric: 'tabular-nums' }}>
          {b.range}
        </span>
      </div>
    </div>
  )
}
