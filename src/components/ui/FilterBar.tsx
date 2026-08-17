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
  sticky = false,
  chips,
  children,
  className = '',
}: {
  search?: string
  onSearchChange?: (v: string) => void
  searchPlaceholder?: string
  /** Accessible name for the field; falls back to the placeholder. */
  searchLabel?: string
  /**
   * Keep the bar pinned while the page scrolls. Turn this on only where the
   * table is long enough that the controls would otherwise scroll away — it is
   * what replaced the old `h-screen flex flex-col` pages, which nested a second
   * scroll region inside the shell's own scrolling <main> and left only part of
   * the page moving.
   */
  sticky?: boolean
  /**
   * Status / stage chips that narrow the same list. They belong in this card
   * rather than floating above it — everything that narrows the list lives in
   * one box. Rendered on their own row, which scrolls sideways instead of
   * wrapping so the card keeps a fixed height however many chips there are.
   */
  chips?: React.ReactNode
  children?: React.ReactNode
  className?: string
}) {
  const hasSearch = typeof search === 'string' && !!onSearchChange

  return (
    <div
      className={`ds-card p-4 ${sticky ? 'sticky top-0 z-20' : ''} ${className}`.trim()}
      /*
       * A pinned bar needs its own surface or the rows scrolling underneath show
       * through. --panel-bg alone is not enough: at 96% opacity the remaining 4%
       * still leaves dark table text legible through the bar. The blur turns
       * whatever passes behind into an even wash, and the border marks the bar
       * as a layer sitting above the content rather than part of it.
       */
      style={sticky ? {
        background: 'var(--panel-bg)',
        backdropFilter: 'blur(12px) saturate(160%)',
        WebkitBackdropFilter: 'blur(12px) saturate(160%)',
        borderColor: 'var(--divider)',
      } as React.CSSProperties : undefined}
    >
      {chips && (
        <div
          className="filter-row items-center pb-3 mb-3"
          style={{ borderBottom: '1px solid var(--divider)' }}
        >
          {chips}
        </div>
      )}

      <div className="flex flex-wrap items-center gap-3">
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
    </div>
  )
}
