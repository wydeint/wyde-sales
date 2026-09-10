/**
 * Cost and GP% — one implementation for every screen that shows them.
 *
 * The whole point of moving cost out of `jobs.cost` into line items is that a
 * room's cost is now a *sum*, not a stored number. If each screen adds that sum
 * up its own way, we are back where we started — see reference_duplicated_code.
 * My Deals, Project Summary and this page all call the functions below.
 *
 * Rules that live here and nowhere else:
 *   • GP% = (revenue − cost) / revenue, and is undefined when revenue is 0.
 *     A room with cost and no revenue is not "−100% GP", it is "not priced yet".
 *   • `act_cost` falls back to `est_cost` **only when nothing has been ordered
 *     yet**. It never silently replaces a real ฿0 on a line that is done.
 *   • Categories carry `owner_dept` — QS estimates Built-in, buyers do the rest,
 *     so a person is scored on their own lines, never on the whole room.
 */

/** จัดซื้อต้องเปิด PO ภายในกี่วันหลังรับงาน */
export const PO_KPI_DAYS = 14

/**
 * แอดมินต้องส่งงานต่อให้จัดซื้อภายในกี่วันหลัง**ตัวเองรับงาน** (เจ้าของกำหนด 3 วัน)
 *
 * นับ `job_received_at → procurement_received_at` ซึ่งเป็นช่วงเดียวกับที่
 * `handoffDays()` วัด — คือช่วงที่แอดมินคุมได้จริง ไม่ใช่ช่วงที่รอเซลล์
 */
export const ADMIN_KPI_DAYS = 3

export interface CostCategory {
  id: string
  name: string
  needs_supplier: boolean
  /**
   * ใครเป็นเจ้าของหมวดนี้ — ใช้แบ่งว่าบรรทัดไหนเข้าคะแนนของใคร
   *
   * **ระวังตอนย้ายหมวดข้ามฝ่าย:** ค่าติดตั้งของบางอย่างอยู่คนละหมวดกับตัวของ
   * เช่น "Air Conditioner Installer" แยกจาก "Electrical Appliance" (เจอ 8 ห้อง
   * ที่มีทั้งคู่) ราคาขายจะอยู่หมวดหนึ่ง ต้นทุนติดตั้งอีกหมวดหนึ่ง — ตอนนี้ยัง
   * ถูกเพราะสองหมวดนี้เป็นของจัดซื้อเหมือนกัน คนเดียวถือทั้งคู่ แต่ถ้าย้ายหมวด
   * ใดหมวดหนึ่งไปเป็น 'qs' รายรับกับต้นทุนจะแยกไปคนละคนทันที และ GP% ของทั้งคู่
   * จะผิดโดยไม่มีอะไรฟ้อง
   */
  owner_dept: 'procurement' | 'qs'
  sort_order: number
  active: boolean
}

export interface Supplier {
  id: string
  company_name: string
  contact_name: string | null
  email: string | null
  phone: string | null
  note: string | null
  active: boolean
}

export interface CostItem {
  id: string
  job_id: string
  category_id: string
  item_name: string
  supplier_id: string | null
  po_no: string | null
  is_stock: boolean
  /**
   * ต้นทุน — **สามค่า สามความหมาย** เหมือน sale_price (เปิดให้เป็น null 2026-09-10)
   *
   *   null = ยังไม่กรอก
   *   0    = **ทำเอง in-house ไม่มีต้นทุนจ้าง** เช่นค่าออกแบบที่ดีไซเนอร์เราทำเอง
   *   >0   = ต้นทุนจริง
   *
   * เดิมคอลัมน์เป็น NOT NULL DEFAULT 0 ทำให้ "ยังไม่กรอก" กับ "฿0 จริง" เป็นค่า
   * เดียวกัน แยกไม่ออก บรรทัด in-house จึงทำให้ห้องนั้นไม่มีวันนับว่าต้นทุนครบ
   * แล้ว GP% จริงของห้องก็ไม่ขึ้นตลอดไป · ของเดิม 0 ทั้ง 473 บรรทัดแปลงเป็น null
   * (เจ้าของสั่ง = ถือว่ายังไม่กรอก) สำรองที่ backup_cost_null_20260910
   */
  est_cost: number | null
  act_cost: number | null
  /**
   * ราคาขายของรายการนี้ (**exc.VAT**) — **null คือ "ยังไม่ระบุ" ไม่ใช่ศูนย์**
   *
   * ไม่ใช่รายรับก้อนใหม่ แต่เป็นการ**แตกยอด** `jobs.revenue_ex_vat` ของห้อง
   * ออกเป็นรายการ ผลรวมทุกบรรทัดจึงควรเท่ากับรายรับของห้อง — จัดซื้อเป็นคนทำ
   * ใบเสนอราคาให้เซลล์อยู่แล้ว ตัวเลขรายรายการจึงมีอยู่จริงตั้งแต่ต้น
   *
   * ต้องเป็น exc.VAT เพราะต้นทุนที่กรอกคู่กันเป็น exc.VAT ถ้าปนกันจะเพี้ยนราว
   * 4 จุดทุกห้องในทิศทางที่ทำให้งานดูกำไรดีกว่าจริง (ดู revenueBase)
   *
   * มีไว้เพื่อคิด GP% แยกตามหมวดที่แต่ละคนรับผิดชอบ — เดิมทำไม่ได้เพราะห้องมี
   * รายรับก้อนเดียว จึงต้องนับทั้งห้องให้ทุกคนที่ทำงานในห้องนั้น
   */
  sale_price: number | null
  /**
   * ราคาขาย **รวม VAT** — ตัวที่จัดซื้อกรอกเอง และเป็นตัวเลขที่ตรงกับใบเสนอราคา
   *
   * `sale_price` (exc.VAT) คำนวณจากตัวนี้ ÷ 1.07 ตอนบันทึก ไม่ได้ให้กรอกเอง —
   * เดิมกรอก exc.VAT ทำให้น้องต้องหาร 1.07 เองทุกบรรทัด ตัวเลขที่ได้จึงออกมาเป็น
   * 109,644.85 / 185,887.84 (เพิ่ม 2026-09-10)
   */
  sale_price_inc: number | null
  approved_at: string | null
  seq: number
  note: string | null
}

/** Which of the two figures counts as "what this line costs us today".
 *  null อ่านเป็น 0 ตรงนี้ได้ เพราะผู้เรียกใช้ผลรวมเป็นเงิน ไม่ได้ใช้ตัดสินว่า
 *  กรอกครบหรือยัง — เรื่องนั้นดูที่ estLines / actLines */
export function effectiveCost(it: CostItem): number {
  const act = Number(it.act_cost ?? 0)
  return act > 0 || it.po_no ? act : Number(it.est_cost ?? 0)
}

export interface Totals {
  est: number
  act: number
  /** จำนวนบรรทัด */
  lines: number
  /** บรรทัดที่ลงยอดประมาณการแล้ว — เหตุผลเดียวกับ actLines */
  estLines: number
  /**
   * บรรทัดที่ลงยอดจัดจ้างจริงแล้ว
   *
   * ต้องแยกจาก `lines` เพราะห้องที่ประมาณการไว้แล้วแต่ยังไม่ได้จ้างใครเลย
   * มี act = 0 → GP จริงจะออกมา 100% ซึ่งเป็นคำตอบที่ผิดแบบสวยที่สุด
   * แบบเดียวกับห้องที่ยังไม่ลงต้นทุนเลย
   */
  actLines: number
  /** บรรทัดที่ยังไม่เปิด PO และไม่ใช่ของเบิกสต๊อก */
  awaitingPo: number
}

/**
 * ห้องนี้ระบุราคาขายครบและยอดตรงหรือยัง
 *
 * "ครบ" คือ**ทุกบรรทัด**มีราคาขาย ไม่ใช่บางบรรทัด — ถ้ากรอก 3 จาก 5 บรรทัด
 * รายรับของอีก 2 บรรทัดจะหายไปจากการคำนวณเงียบๆ แล้ว GP% ของคนนั้นจะสูงเกินจริง
 * เป็นกับดักตัวเดียวกับ act_cost ที่ยังไม่กรอกแล้วรายงาน GP 100%
 *
 * ยอมต่างจากรายรับของห้องได้ไม่เกิน 1 บาท — เศษจากการปัดสตางค์ไม่ใช่ความผิดพลาด
 * และถ้าเตือนทุกสตางค์คนจะเลิกสนใจคำเตือน
 *
 * **เทียบที่ฝั่งรวม VAT** (เจ้าของเลือก 2026-09-10) เพราะเป็นตัวเลขที่จัดซื้อกรอก
 * เองและตรงกับใบเสนอราคา ไม่มีการปัดเศษมาเกี่ยว — ฝั่ง exc.VAT เป็นค่าที่คำนวณ
 * ต่อบรรทัด ผลรวมจึงคลาดจาก revenue_ex_vat ได้ระดับสตางค์ (วัดจริง: ห้อง 532
 * 15 บรรทัดคลาด ฿0.01 · ห้อง 1121 9 บรรทัดคลาด ฿0.01) ซึ่งไม่ใช่ความผิดพลาด
 */
export const SALE_PRICE_TOLERANCE = 1

export interface SaleSplit {
  /** บรรทัดที่ระบุราคาขายแล้ว */
  filled: number
  lines: number
  /** ผลรวมราคาขาย **รวม VAT** ที่ระบุไว้ */
  total: number
  /** ต่างจากรายรับของห้อง — บวกคือระบุเกิน */
  diff: number
  complete: boolean
  /** ครบทุกบรรทัด **และ** ยอดตรง — เกณฑ์เดียวที่เอาไปคิด GP% รายคนได้ */
  usable: boolean
}

export function saleSplitOf(items: CostItem[], roomRevenueInc: number): SaleSplit {
  // `!== null` ไม่ใช่ `> 0` — **ห้ามเปลี่ยน** ราคาขาย 0 คือค่าที่ตั้งใจใส่ แปลว่า
  // "รวมอยู่ในบรรทัดอื่นแล้ว" (ค่าติดตั้งที่ไม่ได้แยกในใบเสนอราคา) ถ้าเปลี่ยนเป็น
  // `> 0` บรรทัดพวกนั้นจะกลายเป็น "ยังไม่ระบุ" ทันที ทั้งที่ระบุแล้ว แล้วห้องจะ
  // ไม่มีวันนับว่าครบ → GP% รายคนหายไปเงียบๆ
  const filled = items.filter(i => i.sale_price_inc !== null).length
  const total = items.reduce((s, i) => s + Number(i.sale_price_inc ?? 0), 0)
  const diff = round2(total - roomRevenueInc)
  const complete = items.length > 0 && filled === items.length
  return { filled, lines: items.length, total, diff, complete,
    usable: complete && Math.abs(diff) <= SALE_PRICE_TOLERANCE }
}

export function totalsOf(items: CostItem[]): Totals {
  // estLines / actLines นับ **บรรทัดที่กรอกแล้ว** ซึ่งรวมบรรทัดที่กรอก 0 ด้วย
  // (in-house) — เกณฑ์คือ `!== null` ไม่ใช่ `> 0` **ห้ามเปลี่ยน** ไม่งั้นห้องที่มี
  // งาน in-house จะไม่มีวันครบ แล้ว GP% ของห้องจะหายไปเงียบๆ
  return items.reduce<Totals>((t, it) => ({
    est: t.est + Number(it.est_cost ?? 0),
    act: t.act + Number(it.act_cost ?? 0),
    lines: t.lines + 1,
    estLines: t.estLines + (it.est_cost !== null ? 1 : 0),
    actLines: t.actLines + (it.act_cost !== null ? 1 : 0),
    awaitingPo: t.awaitingPo + (!it.po_no && !it.is_stock ? 1 : 0),
  }), { est: 0, act: 0, lines: 0, estLines: 0, actLines: 0, awaitingPo: 0 })
}

/**
 * GP% as a fraction, or null when it cannot be computed.
 *
 * Null and 0 are different answers and the caller must be able to tell them
 * apart — a room priced at ฿0 shows "—", a room sold at cost shows "0.0%".
 */
export function gp(revenue: number, cost: number): number | null {
  if (!revenue) return null
  return (revenue - cost) / revenue
}

/**
 * GP% for a room or a group of rooms, given how many cost lines it actually has.
 *
 * `gp(rev, 0)` is 1.0, and a room nobody has costed yet has a cost of exactly 0
 * — so the plain function reports **100% GP on every un-costed room**, which is
 * the most flattering possible wrong answer and the one most likely to be
 * believed. No lines means no answer, not a perfect margin.
 */
export function gpCosted(revenue: number, cost: number, lines: number): number | null {
  if (!lines) return null
  return gp(revenue, cost)
}

export const VAT_RATE = 0.07

/** ปัดที่สตางค์ — ทศนิยม 2 ตำแหน่งคือความละเอียดที่เงินบาทมีจริง */
export const round2 = (n: number): number => Math.round(n * 100) / 100

/**
 * แปลงยอดรวม VAT ↔ ยอดไม่รวม VAT — **ปัดที่สตางค์ ไม่ใช่ที่บาท**
 *
 * ทั้งสิบจุดที่แปลงค่านี้เคยใช้ `Math.round(inc / 1.07)` ซึ่งปัดถึงบาทเต็มแล้ว
 * **เขียนค่าที่ปัดแล้วลงฐานข้อมูล** ห้อง ฿8,000 จึงเก็บ ex-VAT เป็น ฿7,477
 * ทั้งที่ค่าจริงคือ ฿7,476.64 — คลาด 36 สตางค์ตั้งแต่ต้นทาง
 *
 * ตราบใดที่หน้าจอปัดเลขเหมือนกันก็ไม่มีใครเห็น แต่พอจัดซื้อกรอกต้นทุนละเอียด
 * ถึงสตางค์ GP% ก็คิดจากฐานที่เพี้ยนไปแล้ว และเทียบกับบัญชีไม่ตรง
 *
 * ของเก่าที่เก็บผิดไปแล้วไม่ได้แก้ย้อนหลังที่นี่ — ดูสรุปในบันทึกของวันที่แก้
 */
export const exVatOf = (inc: number): number => round2(inc / (1 + VAT_RATE))
export const incVatOf = (ex: number): number => round2(ex * (1 + VAT_RATE))

/**
 * `revenue_ex_vat` เชื่อได้แค่ไหน — ตรวจทุกครั้งก่อนเอาไปคิด GP%
 *
 * วัดจริง 2026-09-01 จากงานที่ยังไม่ยกเลิก 915 ใบ:
 *   • 634 ใบ  อัตราส่วน inc/ex = 1.07 พอดี  → ใช้ได้
 *   • 267 ใบ  ex เท่ากับ inc เป๊ะ            → ยังไม่ได้ถอด VAT ออก
 *   •  14 ใบ  อัตราส่วนเพี้ยน (เช่น inc 10,000 กับ ex 300,000) → ข้อมูลผิด
 *
 * ถ้าเอา ex ที่ยังไม่ถอด VAT ไปหาร GP% จะได้ตัวเลขที่ดูดีกว่าความจริง
 * จึงต้องฟ้องบนจอ ไม่ใช่คำนวณให้เองเงียบๆ
 */
export type VatState = 'ok' | 'not_removed' | 'odd'

export function vatState(inc: number | null, ex: number | null): VatState {
  const i = Number(inc || 0), e = Number(ex || 0)
  if (!i || !e) return 'odd'
  const r = i / e
  if (Math.abs(r - (1 + VAT_RATE)) < 0.001) return 'ok'
  if (Math.abs(r - 1) < 0.001) return 'not_removed'
  return 'odd'
}

/**
 * ฐานรายได้ที่ใช้คิด GP% — **ยอดไม่รวม VAT เสมอ**
 *
 * ต้นทุนที่จัดซื้อกรอกเป็นยอดถอด VAT แล้ว ถ้าเอาไปหารด้วยยอดรวม VAT
 * GP% จะสูงเกินจริงราว 4 จุดทุกห้อง (ขาย 100k ทุน 60k → ได้ 43.9% แทน 40.0%)
 * ซึ่งเป็นทิศทางที่อันตราย เพราะทำให้งานดูกำไรดีกว่าที่เป็น
 *
 * เมื่อ `revenue_ex_vat` ยังไม่ถูกถอด VAT (267 ใบ) หรือเพี้ยน (14 ใบ)
 * จะถอดให้จากยอดรวม VAT ตอนแสดงผล — **ไม่เขียนทับข้อมูลในฐานข้อมูล**
 * ของเดิมยังอยู่ครบให้แอดมินไล่ตรวจ และ `derived` บอกว่าตัวไหนเป็นค่าที่คำนวณให้
 */
export function revenueBase(inc: number | null, ex: number | null): {
  value: number
  derived: boolean
  state: VatState
} {
  const state = vatState(inc, ex)
  if (state === 'ok') return { value: Number(ex || 0), derived: false, state }
  return { value: Number(inc || 0) / (1 + VAT_RATE), derived: true, state }
}

/** `0.529` → `52.9%` · null → `—` */
export function gpText(v: number | null): string {
  return v === null ? '—' : (v * 100).toFixed(2) + '%'
}

/**
 * วันที่ใช้เป็นเกณฑ์นับว่างานอยู่ในช่วงเวลาที่กรอง
 *
 * `delivery` เป็นค่าเริ่มต้น และเป็นเกณฑ์เดียวที่มี fallback ในตัว: ใช้วันส่งมอบ
 * จริงก่อน ถ้ายังไม่ส่งจึงใช้วันที่คาดไว้ ครอบคลุมได้กว้างกว่าใช้ช่องใดช่องหนึ่ง
 * เดี่ยวๆ มาก — วัดเมื่อ 2026-09-01: actual_deliver_date 604 จาก 915 งาน แต่
 * expected_finish_date มีแค่ 88 · order_date 849 · job_received_at 0 (ฟิลด์ใหม่)
 */
export type CostAnchor = 'delivery' | 'sold' | 'received'

export const ANCHOR_LABELS: Record<CostAnchor, string> = {
  delivery: 'วันส่งมอบ (จริง→คาด)',
  sold: 'วันที่ขายได้',
  received: 'วันรับงาน',
}

export interface AnchorableJob {
  order_date: string | null
  job_received_at: string | null
  expected_finish_date: string | null
  actual_deliver_date: string | null
}

export function anchorDate(job: AnchorableJob, anchor: CostAnchor): string | null {
  if (anchor === 'sold') return job.order_date
  if (anchor === 'received') return job.job_received_at
  // ส่งมอบจริงก่อน ถ้ายังไม่ส่งค่อยใช้วันที่คาดไว้ — ห้องที่ส่งแล้วต้องอยู่ใน
  // เดือนที่ส่งจริง ไม่ใช่เดือนที่เคยวางแผนไว้แล้วเลื่อน
  return job.actual_deliver_date ?? job.expected_finish_date
}

/**
 * วันที่จัดซื้อเปิด PO ใบแรก — ต้นทางของ KPI
 *
 * ใช้ `approved_at` ของบรรทัดที่มี PO แล้ว ไม่ใช่ `created_at` ของแถว
 * เพราะกรอกย้อนหลังได้ วันที่สร้างแถวจึงไม่ใช่วันที่ทำงานจริง
 */
export function firstPoDate(items: CostItem[]): string | null {
  const dates = items.filter(i => i.po_no && i.approved_at).map(i => i.approved_at!)
  return dates.length ? dates.sort()[0] : null
}

/**
 * จำนวนวันจาก **จัดซื้อ**รับงาน ถึงเปิด PO ใบแรก — null เมื่อยังขาดวันใดวันหนึ่ง
 *
 * ตัวตั้งต้นคือ `procurement_received_at` ไม่ใช่ `job_received_at`
 * (วันที่แอดมินรับงาน) — ช่วงที่จัดซื้อรอแอดมินส่งต่อไม่ใช่ความช้าของจัดซื้อ
 * ช่วงนั้นวัดแยกด้วย `handoffDays()`
 */
export function poLeadDays(receivedAt: string | null, items: CostItem[]): number | null {
  const po = firstPoDate(items)
  if (!receivedAt || !po) return null
  return Math.round((new Date(po).getTime() - new Date(receivedAt).getTime()) / 86400000)
}

/** แอดมินส่งงานต่อให้จัดซื้อช้าแค่ไหน — คนละตัวชี้วัดกับ KPI เปิด PO */
export function handoffDays(adminAt: string | null, procAt: string | null): number | null {
  if (!adminAt || !procAt) return null
  return Math.round((new Date(procAt).getTime() - new Date(adminAt).getTime()) / 86400000)
}

/** สถานะการจัดซื้อของห้องหนึ่ง — ใช้ทั้งชิปในตารางและตัวกรอง */
export type RoomCostStatus = 'ยังไม่ประมาณการ' | 'รอเปิด PO' | 'เปิด PO ครบ' | 'เกินกำหนด'

export function roomStatus(
  receivedAt: string | null,
  items: CostItem[],
  today = new Date(),
): RoomCostStatus {
  if (!items.length) return 'ยังไม่ประมาณการ'
  const t = totalsOf(items)
  if (t.awaitingPo === 0) return 'เปิด PO ครบ'
  // เกินกำหนดคือ "ยังเปิดไม่ครบ และเลย 14 วันมาแล้ว" — ห้องที่เปิดครบแล้ว
  // ต่อให้ช้าก็จบไปแล้ว ไม่ต้องค้างเป็นสีแดงบนจอตลอดไป
  if (receivedAt) {
    const days = Math.round((today.getTime() - new Date(receivedAt).getTime()) / 86400000)
    if (days > PO_KPI_DAYS) return 'เกินกำหนด'
  }
  return 'รอเปิด PO'
}

export const ROOM_STATUS_CLASS: Record<RoomCostStatus, string> = {
  'ยังไม่ประมาณการ': 'badge badge-gray',
  'รอเปิด PO': 'badge badge-orange',
  'เปิด PO ครบ': 'badge badge-green',
  'เกินกำหนด': 'badge badge-red',
}

/**
 * ใครอยู่ในรายชื่อของแต่ละตำแหน่ง
 *
 * ดูจาก role เป็นหลัก แต่ `dept` ทับได้ — wanwipa.o เป็นผู้จัดการคุมสองแผนก
 * (`dept = 'Procurement / QS'`) จึงต้องเลือกได้ทั้งช่อง QS และช่องจัดซื้อ
 * ถ้าดูแต่ role เธอจะโผล่แค่ฝั่งเดียว
 *
 * แอดมินเซลล์ดูจาก `dept = 'Administration'` ไม่ใช่ role เพราะทั้งสองคน
 * ถือ role `admin` เต็มอยู่แล้ว การเปลี่ยน role เป็น `admin_sales` จะทำให้
 * เสียสิทธิ์แก้ Commission Tiers ไปด้วยโดยไม่มีใครสั่ง
 */
export type Seat = 'qs' | 'procurement' | 'admin'

export interface SeatUser { id: string; name: string; role: string; dept: string | null }

export function peopleFor(users: SeatUser[], seat: Seat): SeatUser[] {
  const d = (u: SeatUser) => u.dept ?? ''
  // จัดซื้อกับ QS ช่วยงานกันได้ทุกคน (ทีมขอเอง 2026-09-01) — สิทธิ์ในฐานข้อมูล
  // เท่ากันอยู่แล้วทั้งสอง role ต่างกันแค่รายชื่อในดรอปดาว จึงรวมเป็นกองเดียว
  // ช่องที่แยกกันสองช่องยังจำเป็น เพราะคะแนนรายคนคิดแยกตามหมวดที่รับผิดชอบ
  if (seat === 'admin') return users.filter(u => d(u) === 'Administration')
  return users.filter(u =>
    u.role === 'qs' || u.role === 'procurement' || d(u).includes('QS') || d(u).includes('Procurement'))
}

/** เอกสารของห้องนี้ครบหรือยัง — PO ผู้ว่าจ้างนับเฉพาะงาน B2B */
export interface DocJob {
  so_no: string | null
  /** PR เป็นรายการ ไม่ใช่ค่าเดียว — ใบเดียวคุมได้หลายห้อง ห้องเดียวมีได้หลายใบ */
  pr_nos: string[] | null
  po_no: string | null
  customer_type: string | null
  order_date: string | null
  job_received_at: string | null
  procurement_received_at: string | null
}

export function docsDone(j: DocJob): { done: number; total: number } {
  const needPo = j.customer_type === 'B2B'
  // PR นับว่าครบเมื่อมี**อย่างน้อยหนึ่งใบ** — ห้องหนึ่งมีได้หลายใบ และไม่มีทาง
  // รู้จากตรงนี้ว่าล็อตนั้นต้องมีกี่ใบ
  const fields = [j.so_no, j.pr_nos?.length ? 'y' : null, j.job_received_at, ...(needPo ? [j.po_no] : [])]
  return { done: fields.filter(Boolean).length, total: fields.length }
}

/** จำนวนวันจากแอดมินรับงาน ถึงส่งต่อให้จัดซื้อ — ช่วงที่แอดมินคุมได้ */
export function intakeDays(j: DocJob): number | null {
  return handoffDays(j.job_received_at, j.procurement_received_at)
}

export interface AdminScore {
  userId: string
  rooms: number
  /** ห้องที่เอกสารครบทุกช่อง */
  complete: number
  /** ช่องที่กรอกแล้ว / ช่องที่ต้องกรอกทั้งหมด */
  fields: number
  fieldsTotal: number
  onTime: number
  measured: number
}

export function scoreAdmins(jobs: (DocJob & { admin_id: string | null })[]): AdminScore[] {
  const acc = new Map<string, AdminScore>()
  for (const j of jobs) {
    if (!j.admin_id) continue
    let a = acc.get(j.admin_id)
    if (!a) {
      a = { userId: j.admin_id, rooms: 0, complete: 0, fields: 0, fieldsTotal: 0, onTime: 0, measured: 0 }
      acc.set(j.admin_id, a)
    }
    const d = docsDone(j)
    a.rooms++
    a.fields += d.done
    a.fieldsTotal += d.total
    if (d.done === d.total) a.complete++
    const days = intakeDays(j)
    if (days !== null) { a.measured++; if (days <= ADMIN_KPI_DAYS) a.onTime++ }
  }
  return [...acc.values()]
}

/**
 * คะแนนรายคน — คิดจาก**เฉพาะหมวดที่คนนั้นรับผิดชอบ** ไม่ใช่ทั้งห้อง
 *
 * QS ดูแลเฉพาะ Built-in หนึ่งห้องจึงมีผู้รับผิดชอบสองคน ถ้าเอายอดทั้งห้อง
 * ไปให้ทั้งคู่ ตัวเลขจะถูกนับซ้ำและคนที่ทำหมวดเล็กจะดูเหมือนคุมเงินก้อนโต
 */
export interface PersonScore {
  userId: string
  rooms: number
  est: number
  act: number
  /** ค่าเฉลี่ยความคลาดเคลื่อนของการประมาณการ (%) — null เมื่อยังไม่มีฐานให้เทียบ */
  accuracy: number | null
  /** ห้องที่เอามาคิด accuracy ได้ — ต้องมีทั้งยอดประมาณและยอดจริง */
  measuredAcc: number
  /** ห้องที่เปิด PO ทันกำหนด / ห้องที่วัดได้ */
  onTime: number
  measured: number
  /**
   * GP% เฉลี่ยของ**งานที่คนนี้รับผิดชอบ** — ถ่วงน้ำหนักด้วยราคาขาย
   * (รวมรายรับทุกห้อง ลบต้นทุนจริงทุกห้อง แล้วหารด้วยรายรับ) ไม่ใช่เฉลี่ยห้องละ
   * เท่ากัน เพราะห้องละไม่กี่พันจะถ่วงเท่ากับห้องเจ็ดแสน — ของ ornnicha.t
   * เฉลี่ยธรรมดาได้ −8.5% แต่ถ่วงน้ำหนักได้ 25.5% ต่างกัน 34 จุด
   *
   * นับ**เฉพาะห้องที่ระบุราคาขายครบและยอดตรง** (saleSplitOf().usable) แล้วคิดจาก
   * เฉพาะบรรทัดที่คนนั้นถือจริง — เดิมใช้รายรับทั้งห้องให้ทุกคนที่ทำงานในห้องนั้น
   * เพราะไม่มีราคาขายรายบรรทัดให้แยก เปลี่ยนเมื่อ 2026-09-08
   *
   * ห้องที่ยังไม่ระบุจะไม่เข้าสูตรเลย ไม่ใช่ตกไปใช้ฐานทั้งห้อง — ถ้าปนสองฐาน
   * ตัวเลขเดียวจะมีสองความหมาย ("ส่วนของฉัน" กับ "ทั้งห้อง") ผสมกัน
   *
   * เป็น GP ฝั่ง**จัดจ้างจริง**อย่างเดียว ฝั่งประมาณการยังไม่ใส่ เพราะ 116 จาก
   * 139 ห้องยังไม่มีประมาณการเลยสักบรรทัด ห้องพวกนั้นจะคิดออกมาเป็น GP 100%
   * แล้วดันค่าเฉลี่ยให้ดูดีเกินจริง — ไว้กรอกครบเป็นปกติแล้วค่อยเติมคู่กัน
   *
   * null เมื่อไม่มีห้องไหนเข้าเกณฑ์เลย
   */
  gpAvg: number | null
  /** ห้องที่เอามาคิด gpAvg ได้ — ระบุราคาขายครบ ยอดตรง และมีต้นทุนจริงครบ */
  gpRooms: number
  /** ในห้องที่คิดได้ มีกี่ห้องที่ต้นทุนเกินรายรับ */
  gpNegative: number
}

export function scorePeople(
  jobs: { id: string; qs_id: string | null; buyer_id: string | null
          revenue_inc_vat: number | null; revenue_ex_vat: number | null
          procurement_received_at: string | null }[],
  items: CostItem[],
  categories: CostCategory[],
): PersonScore[] {
  const ownerOf = new Map(categories.map(c => [c.id, c.owner_dept]))
  const acc = new Map<string, PersonScore & { offs: number[]; gpRev: number; gpAct: number }>()
  const get = (id: string) => {
    let p = acc.get(id)
    if (!p) {
      p = { userId: id, rooms: 0, est: 0, act: 0, accuracy: null, measuredAcc: 0, onTime: 0, measured: 0,
            gpAvg: null, gpRooms: 0, gpNegative: 0, offs: [], gpRev: 0, gpAct: 0 }
      acc.set(id, p)
    }
    return p
  }

  for (const job of jobs) {
    const mine = items.filter(i => i.job_id === job.id)
    if (!mine.length) continue
    // GP is a property of the whole room, not of one person's categories: the
    // room has one revenue and nothing splits it per line. So the room counts
    // once for everyone who worked on it — and only when every line has an
    // actual cost, otherwise a blank field reads as a saving and the room
    // reports GP 100%.
    const roomRev = revenueBase(job.revenue_inc_vat, job.revenue_ex_vat).value
    const costComplete = mine.every(i => (Number(i.act_cost) || 0) > 0)
    // ต้องระบุราคาขายครบทั้งห้องก่อน ถึงจะแยกส่วนของแต่ละคนออกมาได้อย่างมีความหมาย
    const gpCountable = costComplete && roomRev > 0 && saleSplitOf(mine, roomRev).usable
    const split: Record<string, CostItem[]> = {}
    for (const it of mine) {
      const who = ownerOf.get(it.category_id) === 'qs' ? job.qs_id : job.buyer_id
      if (!who) continue
      ;(split[who] ||= []).push(it)
    }
    for (const [who, list] of Object.entries(split)) {
      const p = get(who)
      const t = totalsOf(list)
      p.rooms++
      if (gpCountable) {
        // ส่วนของคนนี้เท่านั้น — ราคาขายกับต้นทุนของบรรทัดที่ตัวเองถือ
        const myRev = list.reduce((s2, i) => s2 + Number(i.sale_price ?? 0), 0)
        const myAct = list.reduce((s2, i) => s2 + (Number(i.act_cost) || 0), 0)
        p.gpRooms++
        p.gpRev += myRev
        p.gpAct += myAct
        if (myAct > myRev) p.gpNegative++
      }
      p.est += t.est
      p.act += t.act
      if (t.est > 0 && t.act > 0) p.offs.push(Math.abs(t.act - t.est) / t.est * 100)
      // KPI เปิด PO เป็นงานของจัดซื้อ ไม่ใช่ของ QS
      if (who === job.buyer_id) {
        const days = poLeadDays(job.procurement_received_at, list)
        if (days !== null) { p.measured++; if (days <= PO_KPI_DAYS) p.onTime++ }
      }
    }
  }

  return [...acc.values()].map(({ offs, gpRev, gpAct, ...p }) => ({
    ...p,
    accuracy: offs.length ? offs.reduce((a, b) => a + b, 0) / offs.length : null,
    measuredAcc: offs.length,
    gpAvg: gpRev > 0 ? (gpRev - gpAct) / gpRev : null,
  }))
}
