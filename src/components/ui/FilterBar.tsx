'use client'

import type React from 'react'
import { Search, X } from 'lucide-react'

/**
 * Canonical search + filter block.
 *
 * Every list page had its own: the filters floated loose on nine of ten pages,
 * the search field was built four different ways (icon inside the flex row,
 * icon absolutely positioned, no icon at all, or tucked into the title row),
 * and its width flipped between "fill the row" and a fixed 176px so the
 * dropdowns beside it jumped position from page to page.
 *
 * The card is the point: it gives the filter zone a boundary, so search-here /
 * filter-here reads at a glance instead of blending into the KPIs above and
 * the list below.
 *
 * Pass selects as children — `className="field-input"` with `width: auto`, or a
 * SearchableSelect. Omit `search` on pages that only filter (e.g. Revenue).
 */
export default function FilterBar({
  search,
  onSearchChange,
  searchPlaceholder = 'ค้นหา...',
  searchLabel,
  children,
  className = '',
}: {
  search?: string
  onSearchChange?: (v: string) => void
  searchPlaceholder?: string
  /** Accessible name for the field; falls back to the placeholder. */
  searchLabel?: string
  children?: React.ReactNode
  className?: string
}) {
  const hasSearch = typeof search === 'string' && !!onSearchChange

  return (
    <div className={`ds-card p-4 flex flex-wrap items-center gap-3 ${className}`.trim()}>
      {hasSearch && (
        <div
          className="flex items-center gap-2 flex-1 min-w-48 rounded-[var(--radius-sm)] px-3 py-2"
          style={{ background: 'var(--hover-bg)' }}
        >
          <Search size={14} style={{ color: 'var(--text-3)' }} aria-hidden="true" />
          <input
            value={search}
            onChange={e => onSearchChange!(e.target.value)}
            placeholder={searchPlaceholder}
            aria-label={searchLabel ?? searchPlaceholder}
            className="bg-transparent text-sm flex-1 outline-none min-w-0"
            style={{ color: 'var(--text-1)' }}
          />
          {search && (
            <button
              onClick={() => onSearchChange!('')}
              aria-label="ล้างคำค้นหา"
              className="flex-shrink-0"
              style={{ color: 'var(--text-3)' }}
            >
              <X size={13} />
            </button>
          )}
        </div>
      )}
      {children}
    </div>
  )
}
