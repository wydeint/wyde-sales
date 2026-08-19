/**
 * The instalment maths, in one place.
 *
 * These three functions had been copied into every screen that can set up a
 * payment plan — my-deals/page.tsx, my-deals/[jobId] and JobDrawer — and the
 * copies drifted. `calcB2CInstallments` plan C split the remainder after the
 * deposit in one file and took 50% of the full job value in the other two, so
 * the same plan produced different instalments depending on which screen the
 * user happened to open. 13 of 52 plan-C jobs carry the wrong shape.
 *
 * Nothing here touches the database or the UI: it turns a plan and a total into
 * rows. Keep it that way — the screens differ in what they *offer* (Prospects
 * also closes the customer, [jobId] has no B2B PO option), and those
 * differences are theirs to hold, not this file's.
 *
 * Shapes are specified in docs/business-logic.md.
 */

export interface PlanInstallment {
  no: number
  name: string
  pct: number
  amount: number
  /** Paying this one starts the work and moves the deal to My Deals. */
  trigger: boolean
  /** Paying this one unlocks handover. */
  final: boolean
}

/**
 * B2C — three plans.
 *
 *   A  100% ครั้งเดียว
 *   B  50 + 50
 *   C  มัดจำ + 50 + 50, where **50% is of the full job value** and the deposit
 *      comes out of the last instalment:
 *      ฿100,000 with a ฿10,000 deposit → 10,000 / 50,000 / 40,000.
 *
 * `deposit` of 0 falls back to 10% of the total.
 */
export function calcB2CInstallments(plan: string, total: number, deposit: number): PlanInstallment[] {
  if (plan === 'A') {
    return [{ no: 1, name: 'ชำระเต็มจำนวน 100%', pct: 100, amount: total, trigger: true, final: true }]
  }
  if (plan === 'B') {
    return [
      { no: 1, name: 'ชำระ 50% แรก เริ่มงาน', pct: 50, amount: total * 0.5, trigger: true, final: false },
      { no: 2, name: 'ชำระ 50% สุดท้าย ส่งมอบ', pct: 50, amount: total * 0.5, trigger: false, final: true },
    ]
  }
  if (plan === 'C') {
    const dep = deposit > 0 ? deposit : Math.round(total * 0.1)
    const first50 = Math.round(total * 0.5)
    const last50 = total - dep - first50
    return [
      { no: 1, name: 'มัดจำจองสิทธิ์', pct: Math.round((dep / total) * 100), amount: dep, trigger: false, final: false },
      { no: 2, name: 'ชำระ 50% แรก เริ่มงาน', pct: 50, amount: first50, trigger: true, final: false },
      { no: 3, name: 'ชำระ 50% สุดท้าย ส่งมอบ', pct: Math.round((last50 / total) * 100), amount: last50, trigger: false, final: true },
    ]
  }
  return []
}

/** B2B PO / วางบิล — one instalment, billed after handover. No work trigger:
 *  the work starts on receiving the PO, not on payment. */
export function calcB2BSingleInstallment(total: number): PlanInstallment[] {
  return [{ no: 1, name: 'วางบิลเมื่อส่งมอบงาน', pct: 100, amount: total, trigger: false, final: true }]
}

/** B2B กำหนดงวดเอง — percentages must add to 100; the first starts the work. */
export function calcB2BInstallments(count: number, total: number, percentages: number[]): PlanInstallment[] {
  return percentages.map((pct, i) => ({
    no: i + 1,
    name: i === 0 ? 'งวดที่ 1 เริ่มงาน' : i === count - 1 ? 'งวดสุดท้าย ส่งมอบ' : `งวดที่ ${i + 1}`,
    pct,
    amount: Math.round((pct / 100) * total),
    trigger: i === 0,
    final: i === count - 1,
  }))
}
