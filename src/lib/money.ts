/**
 * One set of rules for every baht figure in the app.
 *
 * Before this file there were five, spread across twelve copies: full values,
 * a K unit that never rolled over (฿40 million printed as `฿40,288K`), an M
 * unit that always applied, and two tiered formatters that disagreed on
 * whether the thousands unit was `K` or `k`. Reading a number meant knowing
 * which page you were on.
 *
 * The rule now: **show the full value; abbreviate only where the space cannot
 * take it.** Which of the two applies is a decision about the slot — a KPI
 * card, a dense comparison table, a phone screen — not about the number, so
 * the caller picks the function and the whole column stays in one unit.
 */

/** Full value, always. The default for tables, drawers, forms, and anywhere a
 *  figure is read rather than compared. `฿1,000,000` */
export const baht = (n: number | null | undefined): string =>
  n ? '฿' + Math.round(n).toLocaleString('th-TH') : '฿0'

/** Same, but an em dash for nothing — for cells where `฿0` would read as a
 *  real amount of zero rather than an absence. */
export const bahtOrDash = (n: number | null | undefined): string =>
  n ? '฿' + Math.round(n).toLocaleString('th-TH') : '–'

/** One million. Below this the full value is at most nine characters wide
 *  (`฿999,999`), which every slot in the app can take — so there is nothing to
 *  gain by abbreviating, and `฿0.02 MB.` is harder to read than `฿17,000`. */
const MILLION = 1_000_000

/**
 * Abbreviated for tight slots: KPI cards, dense comparison tables, phones.
 * `฿1.69 MB.` above a million, the full value below it.
 *
 * Two decimals always, including trailing zeros (`฿2.00 MB.`), so a column of
 * these lines up on the point under `tabular-nums`.
 *
 * Note it rolls over by construction — the old `fK` divided by a thousand and
 * appended K whatever the size, which is where `฿40,288K` came from.
 */
export const bahtShort = (n: number | null | undefined): string => {
  if (!n) return '฿0'
  const v = Math.abs(n)
  if (v < MILLION) return baht(n)
  return '฿' + (n / MILLION).toLocaleString('th-TH', {
    minimumFractionDigits: 2, maximumFractionDigits: 2,
  }) + ' MB.'
}

/** `bahtShort` with a dash for nothing, for table cells and summary rows. */
export const bahtShortOrDash = (n: number | null | undefined): string =>
  n ? bahtShort(n) : '–'
