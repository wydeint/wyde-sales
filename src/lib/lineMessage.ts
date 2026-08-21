/**
 * The LINE message posted to the team group, in one place.
 *
 * This had been copied into `my-deals/page.tsx` and `components/ui/JobDrawer.tsx`
 * (which Prospects uses), and the copies had already drifted: the same payment
 * produced a different message depending on which screen the button was pressed
 * from. Nothing about this text is screen-specific — it turns a job and an
 * instalment into a string — so there is no reason for a second copy to exist.
 *
 * The drift was in the Voucher line, and one side was wrong. See below.
 */

import { expectedDeliveryDate, fmtShortDate, type DeliveryJobCtx } from './delivery'

export interface LineJob extends DeliveryJobCtx {
  project_name: string
  room_no: string
  customer_name: string
  sales_name: string
  revenue_inc_vat: number
  working_status: string
}

export interface LineInstallment {
  installment_no: number
  installment_name: string
  amount: number
  paid_amount?: number | null
  paid_date?: string | null
  channel?: string | null
  voucher_amount?: number | null
  voucher_code?: string | null
}

/**
 * `job.voucher` is deliberately NOT read here.
 *
 * Two columns hold a voucher and they mean different things:
 *   - `payments.voucher_amount` — deducted from that instalment, so the customer
 *     pays less. This is what "หัก Voucher" claims.
 *   - `jobs.voucher` — a promotional value recorded against the job. For 25 of
 *     the 38 jobs carrying one, the instalments still add up to the full
 *     revenue: nothing was deducted at all.
 *
 * JobDrawer used to print `jobs.voucher` under the "หัก" label, announcing a
 * discount to the group that the customer never received. Only the instalment
 * column belongs in this line (confirmed 2026-08-21). `jobs.voucher` keeps its
 * own uses in Customers, Jobs and the Revenue export — it just is not this.
 */
export function generateLineMsg(
  job: LineJob,
  inst: LineInstallment,
  workStartOverride?: string | null
): string {
  const isDelivered = job.working_status === 'ส่งมอบแล้ว'
  const isFirst = inst.installment_no === 1
  const type = isDelivered ? 'ลูกค้าเก่า ส่งมอบ' : isFirst ? 'ลูกค้าใหม่' : 'ลูกค้าเก่า'

  const d = inst.paid_date ? new Date(inst.paid_date) : new Date()
  const dateStr = `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${String(d.getFullYear()).slice(2)}`

  const fmt = (n: number) => n.toLocaleString('th-TH')
  const paid = inst.paid_amount ?? inst.amount
  const voucher = inst.voucher_amount ?? 0
  const expected = isDelivered ? null : expectedDeliveryDate(job, workStartOverride)

  return [
    `Wyde Int. (${type})`,
    `วันที่ : ${dateStr}`,
    `โครงการ : ${job.project_name}`,
    `ห้อง : ${job.room_no}`,
    `ลูกค้าชื่อ : ${job.customer_name}`,
    `Sales Wyde : ${job.sales_name}`,
    `Package : ${fmt(job.revenue_inc_vat)} บาท`,
    ...(voucher > 0 ? [`หัก Voucher${inst.voucher_code ? ` (${inst.voucher_code})` : ''} : ${fmt(voucher)} บาท`] : []),
    `${inst.installment_name} : ${fmt(paid)} บาท`,
    ...(inst.channel ? [`ชำระผ่านทาง : ${inst.channel}`] : []),
    ...(expected ? [`วันคาดส่งมอบ : ${fmtShortDate(expected)}`] : []),
  ].join('\n')
}
