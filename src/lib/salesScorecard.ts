import { settledAmount } from './voucher'
import { CHASE_AFTER_DAYS } from './collection'

/**
 * The three money buckets behind Sales Performance › รายคน.
 *
 * They live here rather than inside the page because the same three questions
 * will be asked again — on a dashboard tile, in a LINE summary, in a review
 * export — and this codebase's recurring failure is the same rule copied per
 * screen until the copies disagree. One definition, one place.
 *
 * ① เปิดงานแล้ว ยังเก็บไม่ครบ — งานที่เริ่มทำไปแล้ว บริษัทลงทุนไปแล้ว
 *    เงินก้อนนี้ควรได้อยู่แล้ว เป็นหน้าที่ ไม่ใช่โอกาส
 * ② โอกาสเก็บเพิ่มจากยอดจอง — ลูกค้าวางมัดจำแล้วแต่ยังไม่ถึง 50%
 *    เก็บถึง 50% เมื่อไหร่ งานเลื่อนจาก Prospects เข้า My Deals
 * ③ Pipeline ที่ยังไม่ปิด — มาจากตาราง customers ไม่ใช่ jobs (ยังไม่มีงาน)
 */

/** งานบริษัทในเครือ — ตัดออกจากทุกตัวเลขเรื่องเงินค้าง ดู project_intragroup_b2b_rpt */
export function isIntragroup(j: { customer_type?: string | null; work_type?: string | null }) {
  return j.customer_type === 'B2B' && j.work_type === 'RPT'
}

export type ScorecardJob = {
  id: string
  sales_id: string | null
  crm_stage: string | null
  working_status: string | null
  customer_type: string | null
  work_type: string | null
  revenue_inc_vat: number | null
  order_date: string | null
  actual_deliver_date: string | null
}

export type ScorecardPayment = {
  job_id: string | null
  status: string | null
  amount: number | null
  paid_amount: number | null
  voucher_amount: number | null
}

/** job_id → เงินที่รับมาแล้วจริง (รวม voucher เพราะ voucher คือส่วนลด ไม่ใช่หนี้) */
export function settledByJob(payments: ScorecardPayment[]): Record<string, number> {
  const out: Record<string, number> = {}
  for (const p of payments) {
    if (p.status !== 'paid' || !p.job_id) continue
    out[p.job_id] = (out[p.job_id] || 0) + settledAmount(p.paid_amount, p.amount, p.voucher_amount)
  }
  return out
}

export type Scorecard = {
  soldValue: number; soldN: number
  delivValue: number; delivN: number
  wipN: number
  /** งานที่ถืออยู่ทั้งหมด และในนั้นส่งมอบไปแล้วกี่งาน — ไม่ผูกช่วงเวลา.
   *  เคยโชว์เป็นอัตราส่วน "ขาย → ส่งมอบ" ของช่วงที่เลือก ซึ่งพังเมื่อตัวหารเล็ก:
   *  เดือนที่ขายได้งานเดียวแต่ส่งมอบงานเก่า 17 งาน อ่านได้ 1835%. */
  heldN: number; heldDelivN: number
  collected: number
  openValue: number; openN: number
  gapValue: number; gapN: number
  lateValue: number; lateN: number
}

/**
 * A shortfall smaller than this is arithmetic, not money.
 *
 * Instalments are stored as percentage splits, so a job can end up ฿0.45 short
 * of its own value. Without this floor, 9 of the 10 jobs flagged "ค้างเกิน 60
 * วัน" were owed under ฿100 — the card read "10 งาน ต้องตามเก็บ" for ฿8,002,
 * of which exactly one job was real.
 */
const DUST = 100

/** สถานะที่ถือว่า "ขายได้แล้ว" — ที่เหลือคือ prospect ที่ยังไม่มีงานจริง */
const HELD_STATUSES = ['จอง', 'ดำเนินการ', 'ส่งมอบแล้ว']

const EMPTY: Scorecard = {
  soldValue: 0, soldN: 0, delivValue: 0, delivN: 0, wipN: 0,
  heldN: 0, heldDelivN: 0, collected: 0,
  openValue: 0, openN: 0, gapValue: 0, gapN: 0, lateValue: 0, lateN: 0,
}

export function buildScorecard(
  jobs: ScorecardJob[],
  settled: Record<string, number>,
  opts: { from: string; to: string; today?: Date },
): Scorecard {
  const s = { ...EMPTY }
  const today = opts.today ?? new Date()
  const chase = new Date(today)
  chase.setDate(chase.getDate() - CHASE_AFTER_DAYS)
  const chaseStr = chase.toISOString().slice(0, 10)

  for (const j of jobs) {
    if (j.working_status === 'ยกเลิก') continue
    const rev = Number(j.revenue_inc_vat) || 0
    const paid = settled[j.id] || 0

    // ── ขาย / ส่งมอบ: ผูกกับช่วงเวลาที่เลือก ──
    if (j.order_date && j.order_date >= opts.from && j.order_date <= opts.to) {
      s.soldValue += rev; s.soldN++
    }
    if (j.actual_deliver_date && j.actual_deliver_date >= opts.from && j.actual_deliver_date <= opts.to) {
      s.delivValue += rev; s.delivN++
    }
    if (j.working_status === 'ดำเนินการ') s.wipN++
    // "งานที่ถืออยู่" means work actually sold — จอง, ดำเนินการ, ส่งมอบแล้ว.
    // Adding a prospect creates a job row too: crm_stage new/quoted/
    // close_pending, ฿0, no dates, working_status NULL. Eight of those were
    // being counted as work in hand (Supakron.p read 31/53 instead of 31/51).
    // They belong to ③ Pipeline, which counts them from customers already.
    if (HELD_STATUSES.includes(j.working_status || '')) {
      s.heldN++
      if (j.working_status === 'ส่งมอบแล้ว') s.heldDelivN++
    }

    // ── การเงิน: เป็นภาพ ณ ปัจจุบัน ไม่ผูกช่วงเวลา — เงินที่ค้างอยู่ก็คือค้างอยู่
    //    ไม่ว่าจะขายเมื่อไหร่ ──
    //
    // Intragroup work is no longer skipped here. It used to be, which made
    // Sales Performance disagree with Payments and My Deals by ฿1.28 MB. on one
    // person with no way to reconcile the two. Excluding it is now a choice the
    // reader makes with the ประเภทงาน filter, which reaches every tab at once,
    // rather than a rule buried in this function. See project_intragroup_b2b_rpt.
    s.collected += paid

    if (j.working_status === 'ดำเนินการ' && rev - paid >= DUST) {
      s.openValue += rev - paid; s.openN++
    }
    if (j.crm_stage === 'booked' && rev * 0.5 - paid >= DUST) {
      s.gapValue += rev * 0.5 - paid; s.gapN++
    }
    if (j.working_status === 'ส่งมอบแล้ว' && rev - paid >= DUST
        && j.actual_deliver_date && j.actual_deliver_date < chaseStr) {
      s.lateValue += rev - paid; s.lateN++
    }
  }
  return s
}

/** ③ Pipeline — งานที่ยังไม่ถึงขั้นจอง (crm_stage ยังเป็นขั้นต้นน้ำ) */
export const OPEN_PIPELINE_STAGES = ['new', 'interested', 'quoted', 'close_pending']

/**
 * Reads the job, not the customer.
 *
 * Every customer has at least one job (lib/prospectJob opens one from all four
 * entry points), so the seller can live on the job alone. Reading
 * customers.assigned_to also dropped 40 prospects that had no assigned_to but
 * whose job did carry a sales.
 *
 * Value comes from the job alone. It used to fall back to customers.budget for
 * prospects with no revenue — that column was retired on 2026-09-07 because one
 * customer can hold up to 147 rooms and had a single budget field, so the number
 * could not say which room it belonged to. Every prospect now carries its own
 * value (see lib/prospectJob).
 */
export function pipelineFor(
  jobs: (ScorecardJob & { customer_id?: string | null })[],
  salesId: string | null,
): { value: number; count: number } {
  let value = 0, count = 0
  for (const j of jobs) {
    if (j.working_status === 'ยกเลิก') continue
    if (!OPEN_PIPELINE_STAGES.includes(j.crm_stage || '')) continue
    if (salesId !== null && j.sales_id !== salesId) continue
    value += Number(j.revenue_inc_vat) || 0
    count++
  }
  return { value, count }
}
