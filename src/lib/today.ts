/**
 * Today's date as `YYYY-MM-DD`, in the timezone of the machine using the app.
 *
 * `new Date().toISOString().slice(0, 10)` looks like it does this and does not:
 * `toISOString` converts to UTC first. Bangkok is UTC+7, so between midnight
 * and 07:00 local time it returns **yesterday**.
 *
 * That was not theoretical. It was written in 13 places, and it meant:
 *
 *   - The notification bell counted "รายรับวันนี้" against the wrong day for
 *     the first seven hours of every day — today's receipts were not counted
 *     and yesterday's still were. That is the bug that was reported.
 *   - Every date field that opens on "today" — recording a payment in Quick
 *     Mode, a handover date, an order date, a daily report — defaulted to
 *     yesterday for anyone working before 7am, and it would be saved that way
 *     unless someone noticed.
 *
 * The date parts are read locally, so no conversion happens and there is no
 * window where the answer is wrong.
 */
export function todayStr(): string {
  const d = new Date()
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

/** `n` days before today, same rules as todayStr(). */
export function daysAgoStr(n: number): string {
  const d = new Date()
  d.setDate(d.getDate() - n)
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}
