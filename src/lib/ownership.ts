/**
 * Which table owns which field.
 *
 * `jobs` and `customers` share twenty column names. That is not automatically a
 * problem — but nothing said which copy was the real one, so pages picked
 * whichever was nearest and the two answers drifted. On 2026-08-25 the audit
 * found 226 jobs where `jobs.customer_type` said B2B and `customers.customer_type`
 * said B2C, and five pages reading the customer copy against five reading the
 * job copy, two of them doing both in the same screen.
 *
 * The rule that resolves it: **a field belongs to the thing it describes.**
 *
 *   - A customer can order twice. The two orders can be different work types,
 *     one B2C and one B2B, in different rooms, cancelled separately. None of
 *     that fits in one field on the customer row, so it lives on the job.
 *   - A phone number belongs to the person, not to the order.
 *
 * This file is the written answer. Read from the owner; treat the other copy as
 * legacy. Nothing here is enforced by the type system — it is enforced by the
 * Reconcile screen, which counts the rows where the two disagree.
 */

export type Owner = 'jobs' | 'customers'

export interface FieldOwnership {
  /** Column name, identical in both tables unless `customerColumn` says otherwise. */
  field: string
  owner: Owner
  /** Where the same idea lives on the customers row, when the name differs. */
  customerColumn?: string
  why: string
  /** True when the non-owning copy is empty or meaningless and can be dropped
   *  once no code reads it — the first candidates for removal. */
  legacyIsEmpty?: boolean
}

export const FIELD_OWNERSHIP: FieldOwnership[] = [
  // ── jobs owns: properties of an order ────────────────────────────────
  {
    field: 'customer_type', owner: 'jobs',
    why: 'ลูกค้าคนเดียวสั่งได้ทั้งงาน B2C และ B2B — ห้อง A228 มีทั้งสองแบบ',
  },
  {
    field: 'work_type', owner: 'jobs',
    why: 'งานคนละใบเป็นคนละประเภทได้ · customers.work_type ว่าง 917 จาก 959',
  },
  {
    field: 'room_no', owner: 'jobs', customerColumn: 'interested_room',
    why: 'ห้องที่สั่งงานจริง ส่วนฝั่งลูกค้าคือห้องที่สนใจ',
  },
  {
    field: 'po_no', owner: 'jobs',
    why: 'PO ออกต่อใบสั่งงาน', legacyIsEmpty: true,
  },
  {
    field: 'so_no', owner: 'jobs',
    why: 'SO ออกต่อใบสั่งงาน', legacyIsEmpty: true,
  },
  {
    field: 'cancel_type', owner: 'jobs',
    why: 'ยกเลิกทีละงาน ไม่ใช่ยกเลิกทั้งลูกค้า',
  },
  {
    field: 'cancel_amount', owner: 'jobs',
    why: 'คืนเงิน/ยึดเงิน ผูกกับงานที่ยกเลิก',
  },
  {
    field: 'cancel_date', owner: 'jobs',
    why: 'วันที่ยกเลิกของงานใบนั้น',
  },
  {
    field: 'commission_status', owner: 'jobs',
    why: 'คอมจ่ายตามงาน — งาน 3 ใบส่งมอบ 3 เดือน ก็มี 3 สถานะ · ฝั่งลูกค้าเป็น pending ทั้ง 936 แถวและไม่มีหน้าไหนอ่าน',
    legacyIsEmpty: true,
  },
  {
    field: 'commission_amount', owner: 'jobs',
    why: 'คำนวณจาก revenue_ex_vat ของงาน', legacyIsEmpty: true,
  },
  {
    field: 'commission_rate', owner: 'jobs',
    why: 'อัตราตาม tier ของงาน', legacyIsEmpty: true,
  },
  {
    field: 'company_name', owner: 'jobs',
    why: 'ชื่อบริษัทที่ออกเอกสารของงานใบนั้น', legacyIsEmpty: true,
  },
  {
    field: 'lead_id', owner: 'jobs',
    why: 'lead ที่กลายมาเป็นงานใบนี้', legacyIsEmpty: true,
  },
  {
    field: 'notes', owner: 'jobs',
    why: 'หมายเหตุของงาน — ฝั่งลูกค้ามี 19 แถวที่เป็นหมายเหตุระดับคน ต้องอ่านก่อนลบ',
  },

  // ── customers owns: properties of a person ───────────────────────────
  {
    field: 'customer_name', owner: 'customers',
    why: 'ชื่อคน/บริษัทที่เป็นลูกค้า — แต่ jobs.customer_name ตั้งใจต่างได้ 21 งาน (บริษัทจ้าง ≠ คนซื้อห้อง) จึงไม่ใช่ข้อมูลซ้ำที่ต้องบังคับให้ตรง',
  },
  {
    field: 'project_id', owner: 'customers',
    why: 'โครงการที่ลูกค้าสนใจ — jobs.project_id คือโครงการของงาน ปัจจุบันตรงกันทั้ง 959 คู่',
  },
]

/** Fields the Reconcile screen compares. Only the ones where a mismatch is a
 *  real defect — customer_name is left out on purpose, since the 21 rows that
 *  differ are deliberate. */
export const RECONCILE_FIELDS = FIELD_OWNERSHIP
  .filter(f => f.owner === 'jobs' && !f.legacyIsEmpty && f.field !== 'notes')

export function ownerOf(field: string): Owner | null {
  return FIELD_OWNERSHIP.find(f => f.field === field)?.owner ?? null
}
