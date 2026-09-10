import { baht } from './money'

/**
 * รูปตารางรายการต้นทุนสำหรับแนบอีเมลขออนุมัติ
 *
 * ทีมจัดซื้อแคปหน้าจอส่งอนุมัติอยู่แล้ว แต่หน้าจอตัดตารางที่ยาวเกินขอบ —
 * ภาพที่ส่งไปจึงขาดบรรทัดโดยที่คนส่งไม่รู้ตัว
 *
 * ทางที่นิยมกันคือใช้ไลบรารีแปลง DOM เป็นรูป แต่มันอ่านสไตล์จริงจากหน้าเว็บ
 * และแอปนี้ใช้ `color-mix()` กับตัวแปร CSS ทั่วทุกที่ ซึ่งเป็นจุดที่ไลบรารี
 * พวกนั้นแปลผลพลาดบ่อย — และมันก็ยังวาดเฉพาะสิ่งที่อยู่บนจอ คือปัญหาเดิม
 *
 * วาดเองจากข้อมูลจึงตรงกว่า: ได้ครบทุกบรรทัดเสมอไม่ว่าจอกว้างแค่ไหน
 * สีคงที่ไม่ขึ้นกับธีมของคนกด และใส่หัวเรื่องที่อีเมลขออนุมัติต้องมีได้
 * (โครงการ · ห้อง · SO/PR/PO · Revenue · วันที่ออกภาพ) ซึ่งการแคปจอไม่มีให้
 *
 * จงใจใช้โทนสว่างเสมอ ไม่ตามธีม เพราะภาพนี้จะไปอยู่ในอีเมลที่พื้นหลังขาว
 */

export interface CostImageRow {
  item: string
  po: string
  supplier: string
  /** ราคาขาย · null = ยังไม่ระบุ · 0 = รวมอยู่ในบรรทัดอื่นแล้ว
   *  สามค่าสามความหมาย เหมือนบนหน้าจอ ดู reference_sale_price */
  saleInc: number | null
  sale: number | null
  /** ต้นทุน · null = ยังไม่กรอก · 0 = ไม่มีต้นทุน (in-house / เบิกสต๊อก / แถมฟรี) */
  est: number | null
  act: number | null
  approved: string
  /** หมวดนี้ไม่ต้องมี Supplier (เช่นส่วนลด) — ป้ายเดียวกับบนจอ */
  noSupplier?: boolean
}
export interface CostImageGroup {
  name: string
  /** หมวดของ QS — ป้ายเดียวกับบนจอ */
  qs?: boolean
  needsSupplier?: boolean
  rows: CostImageRow[]
}
export interface CostImageInput {
  project: string
  room: string
  customer: string
  so: string
  pr: string
  po: string
  revenueEx: number
  groups: CostImageGroup[]
  totalSaleInc: number
  totalSale: number
  totalEst: number
  totalAct: number
  gpEst: string
  gpAct: string
}

const INK = '#1e1b4b'
const MUTED = '#6b7280'
const LINE = '#e5e7eb'
const BAND = '#eef2ff'
const STRIPE = '#f9fafb'
const RED = '#dc2626'
const ORANGE = '#ea580c'
const ACCENT = '#6366f1'
/** --active-bg (indigo 13%) แบนลงบนพื้นขาว — ภาพนี้ใช้โทนสว่างเสมอ */
const TOTAL_BAND = '#e5e6fb'
const PAPER = '#ffffff'

/**
 * คอลัมน์กว้างตามเนื้อหาที่ยาวที่สุดจริงๆ ไม่ใช่กว้างคงที่
 *
 * ครั้งแรกตั้งไว้ตายตัวแล้วเลข PO โดนตัดเป็น `WAG-PONO26-0017…` — ซึ่งเป็น
 * ข้อมูลชิ้นเดียวที่คนอนุมัติต้องใช้อ้างอิง ภาพสำหรับขออนุมัติจะกว้างขึ้นอีก
 * สองสามร้อยพิกเซลก็ได้ ดีกว่าส่งเลขที่อ่านไม่จบไปให้
 *
 * `max` กันไว้เผื่อชื่อรายการยาวผิดปกติจะลากภาพยืดจนอ่านยาก — เกินนั้นค่อยตัด
 */
const COLS = [
  { key: 'item', label: 'รายการ', min: 160, max: 420, align: 'left' as const },
  { key: 'po', label: 'PO', min: 110, max: 260, align: 'left' as const },
  { key: 'supplier', label: 'Supplier', min: 120, max: 380, align: 'left' as const },
  // อยู่ก่อนต้นทุนเหมือนบนหน้าจอ — คนอนุมัติอ่านซ้ายไปขวาว่า ขายเท่าไร จ่ายเท่าไร
  // เหลือเท่าไร · max กว้างพอสำหรับข้อความ "รวมในบรรทัดอื่น"
  { key: 'saleInc', label: 'ราคาขาย inc.VAT', min: 120, max: 200, align: 'right' as const },
  { key: 'sale', label: 'ราคาขาย exc.VAT', min: 120, max: 200, align: 'right' as const },
  { key: 'est', label: 'ประมาณการ', min: 120, max: 180, align: 'right' as const },
  { key: 'act', label: 'จัดจ้างจริง', min: 120, max: 180, align: 'right' as const },
  { key: 'diff', label: 'ส่วนต่าง', min: 110, max: 180, align: 'right' as const },
  { key: 'approved', label: 'วันที่ขออนุมัติ', min: 110, max: 140, align: 'left' as const },
]
/** ราคาขายมีสามความหมาย ต้องอ่านออกในภาพเหมือนบนจอ — ฿0.00 จะถูกอ่านว่าแถมฟรี */
function saleText(v: number | null): string {
  return v === null ? '—' : v === 0 ? 'รวมในบรรทัดอื่น' : baht(v)
}

/** ต้นทุนก็สามความหมายเหมือนกัน — ว่าง / ไม่มีต้นทุน / ตัวเลขจริง */
function costText(v: number | null): string {
  return v === null ? '—' : v === 0 ? 'ไม่มีต้นทุน' : baht(v)
}

const PAD = 24
const ROW_H = 30
const CELL_PAD = 10
const FONT = "'Noto Sans Thai', 'Sarabun', system-ui, -apple-system, sans-serif"

/** ตัดข้อความให้พอดีช่อง แล้วต่อท้ายด้วย … — ยาวเกินแล้วล้นทับคอลัมน์ถัดไป */
function clip(ctx: CanvasRenderingContext2D, text: string, max: number): string {
  if (ctx.measureText(text).width <= max) return text
  let t = text
  while (t.length > 1 && ctx.measureText(t + '…').width > max) t = t.slice(0, -1)
  return t + '…'
}

export function drawCostTable(input: CostImageInput): HTMLCanvasElement {
  const rowCount = input.groups.reduce((s, g) => s + g.rows.length + 1, 0)
  const headerH = 108
  const height = headerH + ROW_H + rowCount * ROW_H + ROW_H + PAD

  // วาดที่ 2 เท่าแล้วย่อด้วย CSS — ตัวหนังสือคมบนจอ retina และในอีเมล
  const scale = 2
  const canvas = document.createElement('canvas')
  const ctx0 = canvas.getContext('2d')!

  // ── วัดความกว้างที่แต่ละคอลัมน์ต้องใช้จริง ก่อนกำหนดขนาดผืนผ้าใบ ──
  const cellText: Record<string, string[]> = {
    item: [], po: [], supplier: [], saleInc: [], sale: [], est: [], act: [], diff: [], approved: [],
  }
  for (const g of input.groups) {
    for (const r of g.rows) {
      cellText.item.push(r.item || '—')
      cellText.po.push(r.po || '—')
      cellText.supplier.push(r.supplier || '—')
      cellText.saleInc.push(saleText(r.saleInc))
      cellText.sale.push(saleText(r.sale))
      cellText.est.push(costText(r.est))
      cellText.act.push(costText(r.act))
      cellText.diff.push(r.act !== null && r.est !== null ? baht(r.act - r.est) : '—')
      cellText.approved.push(r.approved || '—')
    }
  }
  cellText.item.push('รวมทั้งห้อง')
  cellText.saleInc.push(baht(input.totalSaleInc))
  cellText.sale.push(baht(input.totalSale))
  cellText.est.push(baht(input.totalEst))
  cellText.act.push(baht(input.totalAct))
  cellText.diff.push(input.totalAct && input.totalEst ? baht(input.totalAct - input.totalEst) : '—')
  cellText.approved.push(`GP ${input.gpEst} → ${input.gpAct}`)

  const widths = COLS.map(c => {
    ctx0.font = `600 12px ${FONT}`
    let w = ctx0.measureText(c.label).width
    ctx0.font = `400 13px ${FONT}`
    for (const t of cellText[c.key]) w = Math.max(w, ctx0.measureText(t).width)
    // ceil ไม่ใช่ round — ปัดลงแม้เศษพิกเซลเดียวก็ทำให้ช่องแคบกว่าข้อความของ
    // ตัวเอง แล้ว clip() ตัดท้ายทิ้งพร้อมใส่ … ทั้งที่ความกว้างพอดีอยู่แล้ว
    // ("นาย วัฒน์ธรกรณ์ รุ่งพรทวีวัฒน์" ต้องการ 159.x ได้ช่อง 159 → โดนตัด)
    return Math.ceil(Math.min(c.max, Math.max(c.min, w + CELL_PAD * 2)))
  })
  const WIDTH = PAD * 2 + widths.reduce((s, w) => s + w, 0)

  canvas.width = WIDTH * scale
  canvas.height = height * scale
  const ctx = canvas.getContext('2d')!
  ctx.scale(scale, scale)
  ctx.textBaseline = 'middle'

  ctx.fillStyle = PAPER
  ctx.fillRect(0, 0, WIDTH, height)

  // ── หัวเรื่อง ──
  let y = PAD + 4
  ctx.fillStyle = INK
  ctx.font = `700 19px ${FONT}`
  ctx.fillText(`รายการต้นทุน · ห้อง ${input.room || '—'}`, PAD, y + 8)
  y += 26
  ctx.fillStyle = MUTED
  ctx.font = `400 13px ${FONT}`
  ctx.fillText(clip(ctx, `${input.project}${input.customer ? ' · ' + input.customer : ''}`, WIDTH - PAD * 2), PAD, y + 8)
  y += 22
  const meta = [
    input.so ? `SO ${input.so}` : '', input.pr ? `PR ${input.pr}` : '', input.po ? `PO ${input.po}` : '',
    `Revenue exc.VAT ${baht(input.revenueEx)}`,
  ].filter(Boolean).join('  ·  ')
  ctx.fillText(clip(ctx, meta, WIDTH - PAD * 2), PAD, y + 8)
  y += 22
  ctx.font = `400 11px ${FONT}`
  ctx.fillStyle = '#9ca3af'
  ctx.fillText(`ออกจากระบบ Super Sales เมื่อ ${new Date().toLocaleString('th-TH', {
    day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit',
  })}`, PAD, y + 6)
  y = headerH

  const xs: number[] = []
  let acc = PAD
  for (const w of widths) { xs.push(acc); acc += w }

  const cellX = (i: number) => COLS[i].align === 'right'
    ? xs[i] + widths[i] - CELL_PAD : xs[i] + CELL_PAD
  const put = (i: number, text: string, yy: number) => {
    ctx.textAlign = COLS[i].align
    ctx.fillText(clip(ctx, text, widths[i] - CELL_PAD * 2), cellX(i), yy + ROW_H / 2)
    ctx.textAlign = 'left'
  }

  // ── หัวตาราง ──
  ctx.fillStyle = MUTED
  ctx.font = `600 12px ${FONT}`
  COLS.forEach((c, i) => put(i, c.label, y))
  y += ROW_H
  ctx.strokeStyle = LINE
  ctx.lineWidth = 1
  ctx.beginPath(); ctx.moveTo(PAD, y + 0.5); ctx.lineTo(WIDTH - PAD, y + 0.5); ctx.stroke()

  // ── เนื้อตาราง ──
  input.groups.forEach((g, gi) => {
    ctx.fillStyle = BAND
    ctx.fillRect(PAD, y, WIDTH - PAD * 2, ROW_H)
    ctx.fillStyle = INK
    ctx.font = `600 13px ${FONT}`
    const head = `${gi + 1}. ${g.name}`
    ctx.fillText(head, xs[0] + CELL_PAD, y + ROW_H / 2)
    // ป้ายหลังชื่อหมวด — บนจอมี ภาพก็ต้องมี ไม่งั้นคนอนุมัติไม่รู้ว่าใครประมาณการ
    let bx = xs[0] + CELL_PAD + ctx.measureText(head).width + 8
    ctx.font = `600 11px ${FONT}`
    for (const [text, colour] of [
      ...(g.qs ? [['QS', ORANGE] as const] : []),
      ...(g.needsSupplier === false ? [['ไม่ต้องมี Supplier', MUTED] as const] : []),
    ]) {
      const w = ctx.measureText(text).width
      ctx.fillStyle = colour
      ctx.fillText(text, bx, y + ROW_H / 2)
      bx += w + 10
    }
    y += ROW_H

    g.rows.forEach((r, ri) => {
      if (ri % 2 === 1) { ctx.fillStyle = STRIPE; ctx.fillRect(PAD, y, WIDTH - PAD * 2, ROW_H) }
      ctx.font = `400 13px ${FONT}`
      ctx.fillStyle = INK
      put(0, r.item || '—', y)
      ctx.fillStyle = r.po ? INK : MUTED
      put(1, r.po || '—', y)
      ctx.fillStyle = r.supplier ? INK : MUTED
      put(2, r.supplier || '—', y)
      ctx.fillStyle = r.saleInc === null ? MUTED : INK
      put(3, saleText(r.saleInc), y)
      ctx.fillStyle = r.sale === null ? MUTED : INK
      put(4, saleText(r.sale), y)
      ctx.fillStyle = r.est === null ? MUTED : INK
      put(5, costText(r.est), y)
      ctx.fillStyle = r.act === null ? MUTED : INK
      put(6, costText(r.act), y)
      const diff = r.act !== null && r.est !== null ? r.act - r.est : null
      ctx.fillStyle = diff === null ? MUTED : diff > 0 ? RED : MUTED
      put(7, diff === null ? '—' : baht(diff), y)
      ctx.fillStyle = r.approved ? INK : MUTED
      put(8, r.approved || '—', y)
      y += ROW_H
    })
  })

  // ── แถวรวม ──
  // เน้นแบบเดียวกับตารางบนเว็บ (borderTop 2px --accent + พื้น --active-bg)
  // เดิมเป็นเส้นเทาจางบนพื้นขาว กลืนไปกับแถวข้อมูลจนหาไม่เจอในภาพ
  ctx.fillStyle = TOTAL_BAND
  ctx.fillRect(PAD, y, WIDTH - PAD * 2, ROW_H)
  ctx.strokeStyle = ACCENT
  ctx.lineWidth = 2
  ctx.beginPath(); ctx.moveTo(PAD, y + 1); ctx.lineTo(WIDTH - PAD, y + 1); ctx.stroke()
  ctx.font = `700 13px ${FONT}`
  ctx.fillStyle = INK
  put(0, 'รวมทั้งห้อง', y)
  put(3, baht(input.totalSaleInc), y)
  put(4, baht(input.totalSale), y)
  put(5, baht(input.totalEst), y)
  put(6, baht(input.totalAct), y)
  const tDiff = input.totalAct && input.totalEst ? input.totalAct - input.totalEst : null
  ctx.fillStyle = tDiff === null ? MUTED : tDiff > 0 ? RED : INK
  put(7, tDiff === null ? '—' : baht(tDiff), y)
  // GP วางใต้คอลัมน์วันที่ ตรงกับที่มันอยู่บนหน้าจอ
  ctx.fillStyle = INK
  ctx.textAlign = 'left'
  ctx.font = `400 12px ${FONT}`
  const gpLabel = `GP ${input.gpEst} → `
  ctx.fillStyle = MUTED
  ctx.fillText(gpLabel, xs[8] + CELL_PAD, y + ROW_H / 2)
  const w = ctx.measureText(gpLabel).width
  ctx.font = `700 13px ${FONT}`
  ctx.fillStyle = INK
  ctx.fillText(input.gpAct, xs[8] + CELL_PAD + w, y + ROW_H / 2)

  return canvas
}

export type CopyResult = 'copied' | 'downloaded'

/**
 * ลงคลิปบอร์ดก่อน ถ้าไม่ได้ค่อยบันทึกไฟล์
 *
 * `ClipboardItem` ใช้ได้บน Chrome/Edge แต่ Safari โดยเฉพาะบน iPhone มักปฏิเสธ
 * และบางเบราว์เซอร์ไม่มี API นี้เลย เงียบไปเฉยๆ แย่กว่าเซฟไฟล์ให้ — ผู้เรียก
 * ต้องบอกผู้ใช้ตามค่าที่คืนกลับไปว่าเกิดอะไรขึ้นจริง
 */
export async function copyCanvas(canvas: HTMLCanvasElement, filename: string): Promise<CopyResult> {
  const blob: Blob = await new Promise(res => canvas.toBlob(b => res(b!), 'image/png'))
  try {
    if (typeof ClipboardItem === 'undefined' || !navigator.clipboard?.write) throw new Error('no clipboard')
    await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })])
    return 'copied'
  } catch {
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = filename
    a.click()
    setTimeout(() => URL.revokeObjectURL(url), 5000)
    return 'downloaded'
  }
}
