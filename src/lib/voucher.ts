/**
 * A voucher is a discount, not a payment.
 *
 * `payments.amount` is what the instalment is worth. `voucher_amount` is the
 * part of it settled by a voucher. `paid_amount` is the cash that actually
 * reached the bank — so it is the instalment **minus** the voucher, and the two
 * added back together are what the customer has settled:
 *
 *     settled = paid_amount + voucher_amount
 *
 * Four screens record a payment and three of them wrote the gross figure into
 * `paid_amount` while also storing the voucher, so the voucher was counted
 * twice. Room C726 took ฿42,900 with a ฿15,000 voucher and the job read as
 * ฿57,900 settled against a ฿42,900 job — "รับเงินเกินมูลค่างาน +15,000". Each
 * of those screens showed the right net figure in its own preview and then
 * saved a different number, which is why it survived so long.
 *
 * One function, so the four cannot drift apart again.
 */
export function netReceived(instalmentAmount: number, voucherAmount: number): number {
  return Math.max(0, (instalmentAmount || 0) - (voucherAmount || 0))
}

/** What the customer has settled on an instalment: cash plus voucher. */
export function settledAmount(paidAmount: number | null, amount: number | null, voucherAmount: number | null): number {
  return Number(paidAmount ?? amount ?? 0) + Number(voucherAmount ?? 0)
}
