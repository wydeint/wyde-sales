import type { SupabaseClient } from '@supabase/supabase-js'
import { appUserId } from './currentUser'

// The two acts that end a job's life: cancelling it and handing it over.
// Both used to be copy-pasted per screen — cancel in three places, handover in
// five — and every copy drifted: My Deals booked a forfeited deposit as fresh
// income (double-counting money already banked), Quick Mode wrote neither the
// delivery date nor a warranty and used its own `HOV-` id, and the warranty
// term was 6 months or 12 depending on which button you happened to press.
// tsc cannot catch that kind of divergence; one function can.

export const DEFAULT_WARRANTY_MONTHS = 6

/** Job fields these two operations need, whatever shape the screen holds. */
export type LifecycleJob = {
  id: string
  customer_id?: string | null
  project_id?: string | null
  room_no?: string | null
  customer_name?: string | null
}

export type LifecycleResult = {
  ok: boolean
  /** Fatal — the job itself did not move. Show it and stop. */
  error?: string
  /** The job moved, but a side record failed. Show it; do not roll back. */
  warning?: string
}

function addMonths(dateStr: string, months: number): string {
  const d = new Date(dateStr)
  d.setMonth(d.getMonth() + months)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

// ─── ยกเลิกงาน ──────────────────────────────────────────────

export type CancelType = 'forfeit' | 'refund'

export async function cancelJob(
  supabase: SupabaseClient,
  job: LifecycleJob,
  opts: { type: CancelType; amount: number; date: string; notes?: string },
): Promise<LifecycleResult> {
  const { type, amount, date, notes } = opts

  const { error: jobErr } = await supabase.from('jobs').update({
    working_status: 'ยกเลิก',
    // Cancelling is a stage move as much as a money one. Without this a
    // cancelled deal kept sitting in the จอง column of Prospects.
    crm_stage: 'lost',
    cancel_type: type,
    cancel_date: date || null,
    cancel_amount: amount || null,
    cancel_notes: notes || null,
  }).eq('id', job.id)
  if (jobErr) return { ok: false, error: `บันทึกการยกเลิกไม่สำเร็จ: ${jobErr.message}` }

  let warning: string | undefined

  // Closing the customer record used to happen here, by writing
  // customers.status = 'lost' once none of their other jobs were still running.
  // That column no longer exists — it was dropped when stage became a property
  // of the job (see FIELD_OWNERSHIP) — so the write failed every single time
  // and told the user "ยกเลิกแล้ว แต่ปิดสถานะลูกค้าไม่สำเร็จ" on a cancellation
  // that had in fact succeeded. Nothing replaces it: every screen already
  // derives whether a customer is lost from the jobs they hold, which is also
  // the only version that can be right for a buyer holding several rooms.

  // Refund only. A forfeited deposit is money already received and already
  // counted in รายรับ — booking it again as income double-counts it.
  if (type === 'refund' && amount > 0) {
    const { error: finErr } = await supabase.from('finance_entries').insert({
      type: 'expense',
      category: 'คืนเงินยกเลิก',
      amount,
      entry_date: date,
      description: `คืนเงินยกเลิก: ${job.customer_name || ''} ห้อง ${job.room_no || ''}${notes ? ' — ' + notes : ''}`,
      ref_id: job.id,
      // users.id (staff handle), not the auth UUID — the FK that silently
      // swallowed every refund before lib/currentUser existed.
      created_by: await appUserId(supabase),
    })
    // Say so. A refund that never reached Finance is money the books do not
    // know left the company.
    if (finErr) warning = `ยกเลิกแล้ว แต่บันทึกรายการคืนเงินไม่สำเร็จ: ${finErr.message}`
  }

  return { ok: true, warning }
}

// ─── ส่งมอบงาน ──────────────────────────────────────────────

export async function deliverJob(
  supabase: SupabaseClient,
  job: LifecycleJob,
  opts: {
    deliverDate: string
    warrantyMonths?: number
    /** งวดสุดท้ายที่ยังไม่จ่าย — ส่งมาเมื่อผู้ใช้ติ๊กว่าเก็บเงินแล้ว */
    finalInstalment?: { id: string; paidAmount: number } | null
    deliveryFileUrl?: string | null
  },
): Promise<LifecycleResult> {
  const { deliverDate, finalInstalment, deliveryFileUrl } = opts
  const warrantyMonths = opts.warrantyMonths ?? DEFAULT_WARRANTY_MONTHS
  if (!deliverDate) return { ok: false, error: 'กรุณาระบุวันที่ส่งมอบ' }

  const { error: jobErr } = await supabase.from('jobs').update({
    actual_deliver_date: deliverDate,
    working_status: 'ส่งมอบแล้ว',
    // Handing a room over closes the deal.
    crm_stage: 'closed',
    // Commission is read off this month. Two of the five paths never set it,
    // so a job delivered from those screens earned no commission.
    commission_month: deliverDate.slice(0, 7) + '-01',
  }).eq('id', job.id)
  if (jobErr) return { ok: false, error: 'บันทึกไม่สำเร็จ: ' + jobErr.message }

  if (finalInstalment) {
    await supabase.from('payments').update({
      status: 'paid',
      paid_date: deliverDate,
      paid_amount: finalInstalment.paidAmount,
    }).eq('id', finalInstalment.id)
  }

  // One id scheme for every screen. Quick Mode used `HOV-`, so a room it
  // delivered would gain a second handovers row the moment any other screen
  // upserted the same job on `HO-`.
  const { error: hoErr } = await supabase.from('handovers').upsert({
    id: `HO-${job.id}`,
    job_id: job.id,
    customer_id: job.customer_id || null,
    project_id: job.project_id || null,
    room: job.room_no,
    delivery_date: deliverDate,
    work_status: 'delivered',
    status: 'completed',
    ...(deliveryFileUrl ? { delivery_file_url: deliveryFileUrl } : {}),
  }, { onConflict: 'id' })
  if (hoErr) return { ok: false, error: 'บันทึกข้อมูลส่งมอบไม่สำเร็จ: ' + hoErr.message }

  // job_id, not just the customer: a room ordered twice shares one customer
  // record, and a warranty without a job showed up on both jobs.
  const { error: wErr } = await supabase.from('warranties').upsert({
    id: `WAR-${job.id}`,
    job_id: job.id,
    customer_id: job.customer_id || null,
    project_id: job.project_id || null,
    room: job.room_no,
    handover_date: deliverDate,
    warranty_start: deliverDate,
    warranty_end: addMonths(deliverDate, warrantyMonths),
    warranty_months: warrantyMonths,
    status: 'active',
  }, { onConflict: 'id' })
  if (wErr) return { ok: true, warning: 'ส่งมอบแล้ว แต่สร้างใบประกันไม่สำเร็จ: ' + wErr.message }

  return { ok: true }
}
