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
  /** The customers copy is gone. There is one place to read and write it. */
  droppedFromCustomers?: boolean
}

export const FIELD_OWNERSHIP: FieldOwnership[] = [
  // ── jobs owns: properties of an order ────────────────────────────────

  {
    field: 'work_type', owner: 'jobs', droppedFromCustomers: true,
    why: 'งานคนละใบเป็นคนละประเภทได้ · customers.work_type ว่าง 917 จาก 959',
  },
  {
    field: 'room_no', owner: 'jobs', customerColumn: 'interested_room',
    why: 'ห้องที่สั่งงานจริง ส่วนฝั่งลูกค้าคือห้องที่สนใจ · หน้าจอที่แสดงเป็น "งานหนึ่งใบ" ต้องอ่านจาก jobs.room_no เสมอ — ระเบียนลูกค้ามีห้องเดียว พอรวมระเบียนซ้ำหรือลูกค้าซื้อหลายห้อง ทุกการ์ดจะขึ้นห้องเดียวกันหมด (เจอ 47 การ์ด 2026-08-27)',
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
    field: 'cancel_type', owner: 'jobs', droppedFromCustomers: true,
    why: 'ยกเลิกทีละงาน ไม่ใช่ยกเลิกทั้งลูกค้า',
  },
  {
    field: 'cancel_amount', owner: 'jobs', droppedFromCustomers: true,
    why: 'คืนเงิน/ยึดเงิน ผูกกับงานที่ยกเลิก',
  },
  {
    field: 'cancel_date', owner: 'jobs', droppedFromCustomers: true,
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
    field: 'notes', owner: 'jobs', droppedFromCustomers: true,
    why: 'หมายเหตุของงาน — ฝั่งลูกค้ามี 19 แถวที่เป็นหมายเหตุระดับคน ต้องอ่านก่อนลบ',
  },

  {
    field: 'sales_id', owner: 'jobs', customerColumn: 'assigned_to',
    why: 'เซลล์ที่ขายงานใบนั้น — ลูกค้าคนเดียวเปลี่ยนเซลล์ได้ตามงาน · ค่าคอมและเป้าคิดจากรายได้ต่อใบงาน จึงต้องผูกกับงาน · customers.assigned_to เหลือไว้ให้ Prospect ที่ยังไม่มีงาน และจะถูกลบในระลอก 1e',
  },
  {
    field: 'revenue_inc_vat', owner: 'jobs', droppedFromCustomers: true,
    why: 'มูลค่างานใบนั้น · **แก้กติกา 2026-09-07 (เจ้าของ):** เดิมเขียนว่า customers.budget คือ "งบรวมทั้งราย" ซึ่งไม่จริง — ลูกค้า 64 รายมีหลายงาน มากสุด 147 ห้อง ต่อช่องงบช่องเดียว ตัวเลขจึงบอกไม่ได้ว่าเป็นของห้องไหน และไม่มีหน้าไหนใช้มันเป็นงบรวมเลย ทุกจุดเขียน `jobRev || budget` คือใช้เป็นมูลค่างานสำรองมาตลอด · ตอนนี้ทุกฟอร์มเขียนลง jobs.revenue_inc_vat แล้ว (ย้ายของเดิม 12 งาน ฿3.66M) customers.budget ถูกลบทิ้งแล้ว 2026-09-07 (สำรองไว้ที่ backup_customers_budget_20260907 631 แถว) · การ์ด Prospects เคยรวมยอดจาก customers.budget ทำให้ค้น A812 เห็นการ์ดเดียว ฿69,590 แต่สรุปบอก ฿152,513',
  },

  // ── customers owns: properties of a person ───────────────────────────
  {
    field: 'customer_type', owner: 'customers',
    why: 'บริษัทคือ B2B คนคือ B2C — เป็นคุณสมบัติของผู้ซื้อ ไม่ใช่ของงาน · jobs ถือสำเนาไว้ให้ 12 หน้าอ่านโดยไม่ต้อง join และ trigger customers→jobs รักษาให้ตรงกัน · กติกาคู่กัน: หนึ่งระเบียนลูกค้า = ผู้ซื้อหนึ่งราย บริษัทแยกระเบียนจากบุคคล (เช่น TOR10-A228-B2B)',
  },
  {
    field: 'customer_name', owner: 'customers',
    why: 'ชื่อคน/บริษัทที่เป็นลูกค้า — แต่ jobs.customer_name ตั้งใจต่างได้ 21 งาน (บริษัทจ้าง ≠ คนซื้อห้อง) จึงไม่ใช่ข้อมูลซ้ำที่ต้องบังคับให้ตรง',
  },
  {
    field: 'project_id', owner: 'customers',
    why: 'โครงการที่ลูกค้าสนใจ — jobs.project_id คือโครงการของงาน ปัจจุบันตรงกันทั้ง 959 คู่',
  },
]

/** Fields the Reconcile screen can still compare — the ones that survive on
 *  both tables. work_type, cancel_* and notes were dropped from customers on
 *  2026-08-25, so there is no second copy left to disagree with; room_no and
 *  customer_type are what remains.
 *
 *  customer_name is excluded on purpose: the 21 jobs whose name differs from
 *  their customer are deliberate (the company that hired us is not the person
 *  who bought the room). */
export const RECONCILE_FIELDS = FIELD_OWNERSHIP.filter(f =>
  f.field === 'room_no' || f.field === 'customer_type' || f.field === 'sales_id')

export function ownerOf(field: string): Owner | null {
  return FIELD_OWNERSHIP.find(f => f.field === field)?.owner ?? null
}
