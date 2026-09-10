/**
 * The summary figures that sit under the filter bar on every list and report
 * page.
 *
 * Before this, each page wrote its own markup, and a survey of eleven of them
 * found four different label styles (10/600, 12/400, 12/600, 13/600), two
 * value sizes (18/700 and 28/700), two sub-line sizes, two card paddings and
 * two corner radii — for one component doing one job. Nothing had gone wrong
 * on any single page; they had each been written correctly at a different
 * time.
 *
 * So the markup lives here now and the pages pass content, not styling.
 *
 * Layout: `SummaryStrip` puts the figures in one bordered container divided by
 * hairlines rather than in separate cards. On a list page that is the denser
 * reading — it is also the only version where the left edge of every figure is
 * guaranteed to line up, because there is one container instead of four.
 */
import type { ReactNode } from 'react'

export interface SummaryItem {
  /** What the number is. Sentence case, no colon. */
  label: string
  /** The figure itself — already formatted (baht, percent, count). */
  value: ReactNode
  /** Optional second line: the comparison, the remainder, the count behind it. */
  sub?: ReactNode
  /** Overrides the figure colour. Use a semantic token, never a literal. */
  tone?: string
}

/** One figure, laid out on the 4px grid: 16 label / 4 / 28 value / 4 / 16 sub. */
function Figure({ label, value, sub, tone }: SummaryItem) {
  return (
    <div>
      <p className="m-0 text-caption font-semibold" style={{ color: 'var(--text-3)' }}>
        {label}
      </p>
      <p
        className="mt-1 mb-0 text-kpi-money tabular-nums"
        style={{ color: tone || 'var(--accent)' }}
      >
        {value}
      </p>
      {sub != null && sub !== '' && (
        <p className="mt-1 mb-0 text-caption" style={{ color: 'var(--text-3)' }}>
          {sub}
        </p>
      )}
    </div>
  )
}

/**
 * The default: one container, figures divided by hairlines.
 * Falls to two columns on a phone so a four-figure strip stays readable.
 */
export function SummaryStrip({ items }: { items: SummaryItem[] }) {
  if (!items.length) return null
  return (
    <div className={`ds-card ds-card-flush summary-strip cols-${Math.min(items.length, 6)}`}>
      {items.map(it => (
        <div key={it.label}><Figure {...it} /></div>
      ))}
    </div>
  )
}

/**
 * Separate cards, for a report page where each figure carries its own chart or
 * action and needs the space around it. Same type, same grid, same corner.
 */
export function SummaryCards({ items }: { items: SummaryItem[] }) {
  if (!items.length) return null
  return (
    <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
      {items.map(it => (
        <div key={it.label} className="ds-card">
          <Figure {...it} />
        </div>
      ))}
    </div>
  )
}

export default SummaryStrip
