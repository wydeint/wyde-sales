/**
 * CSV download — one implementation for every screen that offers an export.
 *
 * Two things go wrong every time this is written by hand, and both had already
 * gone wrong once here:
 *
 *   • **The BOM.** Excel on Windows reads a CSV without a byte-order mark in
 *     the system codepage, so every Thai character arrives as mojibake. The
 *     file is not broken — it just looks broken to the only person who opens
 *     it. The `﻿` prefix below is the whole fix.
 *   • **Quoting.** A supplier called `บริษัท ชิค รีพับบลิค จำกัด (มหาชน)` is
 *     harmless, but a note containing a comma or a quote silently shifts every
 *     column after it. Every cell is quoted and inner quotes doubled, always.
 *
 * Numbers are written unformatted (`32775.57`, not `฿32,775.57`) so the
 * spreadsheet reads them as numbers. Formatting is the reader's job; a number
 * dressed as text cannot be summed.
 */
export type CsvCell = string | number | null | undefined

const escapeCell = (v: CsvCell): string =>
  '"' + String(v ?? '').split('"').join('""') + '"'

/** Rows to a CSV string — the header row is just the first row. */
export function toCsv(rows: CsvCell[][]): string {
  return rows.map(r => r.map(escapeCell).join(',')).join('\n')
}

/** Build the file and hand it to the browser. Filename gets `.csv` if missing. */
export function downloadCsv(filename: string, rows: CsvCell[][]): void {
  const name = filename.endsWith('.csv') ? filename : `${filename}.csv`
  const blob = new Blob(['﻿' + toCsv(rows)], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = name
  a.click()
  URL.revokeObjectURL(url)
}
