'use client'

/**
 * Table pager — extracted from the Customers page, which was the only screen
 * that had one. The pages without it rendered every row at once: Payments was
 * 908 rows and 82 viewport-heights tall, Origin Pool 1,000, Wyde Clients 968.
 *
 * Render it directly under a table, inside the same bordered wrapper, so the
 * count line reads as part of the table rather than as loose page furniture.
 */

export const PAGE_SIZE = 25

/** Page numbers to show: always first and last, plus a window around current. */
function pageItems(page: number, totalPages: number): (number | '…')[] {
  return Array.from({ length: totalPages }, (_, i) => i + 1)
    .filter(n => n === 1 || n === totalPages || Math.abs(n - page) <= 1)
    .reduce<(number | '…')[]>((acc, n, idx, arr) => {
      if (idx > 0 && n - (arr[idx - 1] as number) > 1) acc.push('…')
      acc.push(n)
      return acc
    }, [])
}

export default function Pagination({
  page, setPage, total, grandTotal, pageSize = PAGE_SIZE, unit = 'รายการ',
}: {
  page: number
  setPage: (p: number) => void
  /** Rows after filtering — what the pager walks through. */
  total: number
  /** Rows before filtering. The "(ทั้งหมด N)" suffix appears only when a filter
   *  is actually hiding something; with no filter on it repeated the same
   *  number twice in one sentence. */
  grandTotal?: number
  pageSize?: number
  /** Counting word for this page's rows: ราย, งาน, งวด, ห้อง … */
  unit?: string
}) {
  const totalPages = Math.max(1, Math.ceil(total / pageSize))
  const from = total > 0 ? (page - 1) * pageSize + 1 : 0
  const to = Math.min(page * pageSize, total)

  return (
    <div className="flex items-center justify-between px-4 py-2 text-xs flex-wrap gap-2"
      style={{ borderTop: '1px solid var(--divider)', color: 'var(--text-3)' }}>
      <span>
        แสดง {from.toLocaleString('th-TH')}–{to.toLocaleString('th-TH')} จาก {total.toLocaleString('th-TH')} {unit}
        {grandTotal !== undefined && grandTotal !== total
          ? ` · กรองจากทั้งหมด ${grandTotal.toLocaleString('th-TH')} ${unit}`
          : ''}
      </span>
      {totalPages > 1 && (
        <div className="flex items-center gap-1">
          <button onClick={() => setPage(Math.max(1, page - 1))} disabled={page === 1}
            aria-label="หน้าก่อนหน้า"
            className="px-2 py-1 rounded disabled:opacity-30 transition-colors"
            style={{ background: 'var(--hover-bg)', color: 'var(--text-2)' }}>‹</button>
          {pageItems(page, totalPages).map((n, idx) =>
            n === '…'
              ? <span key={`e${idx}`} className="px-1" style={{ color: 'var(--text-3)' }}>…</span>
              : <button key={n} onClick={() => setPage(n as number)}
                  aria-label={`หน้า ${n}`} aria-current={page === n ? 'page' : undefined}
                  className="w-7 h-7 rounded text-xs font-semibold transition-colors"
                  style={{ background: page === n ? 'var(--accent)' : 'var(--hover-bg)', color: page === n ? '#fff' : 'var(--text-2)' }}>
                  {n}
                </button>
          )}
          <button onClick={() => setPage(Math.min(totalPages, page + 1))} disabled={page === totalPages}
            aria-label="หน้าถัดไป"
            className="px-2 py-1 rounded disabled:opacity-30 transition-colors"
            style={{ background: 'var(--hover-bg)', color: 'var(--text-2)' }}>›</button>
        </div>
      )}
    </div>
  )
}
