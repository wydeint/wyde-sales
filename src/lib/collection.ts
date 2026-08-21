/**
 * When is money late?
 *
 * It used to be `payments.due_date < today`. That never worked here, and the
 * reason is the business, not the code: **instalments are triggered by events,
 * not dates.** งวดเริ่มงาน is paid when work starts, งวดสุดท้าย when the room is
 * handed over. Nobody agrees a calendar date with the customer, so nobody fills
 * `due_date` in — the plan-creation form does not even ask for it. Of 105 unpaid
 * instalments, 6 carried a due date, all typed in by hand. The red chip fired
 * for four rooms and missed everything else.
 *
 * So lateness is measured from the event that made the money payable: handover.
 * Once a room is delivered and the balance is still short, the clock starts.
 *
 * The other candidate rule — "work started but the trigger instalment is unpaid"
 * — was checked against the data and returns zero rows, because paying that
 * instalment is what sets `work_start_date` in the first place. It cannot fire,
 * so it is not implemented.
 */

/** Days after handover before an unpaid balance is worth chasing.
 *
 *  Tuned against the live book (2026-08-21): >30 days flags 11 rooms, >45 flags
 *  7, >60 flags 4. Sixty keeps the red chip meaning "call them today" rather
 *  than "this is normal billing lag" — every B2B room bills after delivery, so
 *  a shorter window would paint most of them red. One number, change it here. */
export const CHASE_AFTER_DAYS = 60

export interface CollectionCtx {
  actual_deliver_date?: string | null
  /** Every instalment settled — cash and voucher together. */
  all_paid: boolean
  has_plan: boolean
}

/** Whole days since handover; null when the room is not delivered yet. */
export function daysSinceDelivery(deliverDate?: string | null, today = new Date()): number | null {
  if (!deliverDate) return null
  const d = new Date(deliverDate)
  if (Number.isNaN(d.getTime())) return null
  return Math.floor((today.getTime() - d.getTime()) / 86400000)
}

/** Delivered, still owed money — the work is done, the balance is not. */
export function isAwaitingCollection(job: CollectionCtx): boolean {
  return !!job.actual_deliver_date && job.has_plan && !job.all_paid
}

/** Awaiting collection for longer than CHASE_AFTER_DAYS. */
export function isOverdueCollection(job: CollectionCtx, today = new Date()): boolean {
  if (!isAwaitingCollection(job)) return false
  const days = daysSinceDelivery(job.actual_deliver_date, today)
  return days !== null && days > CHASE_AFTER_DAYS
}
