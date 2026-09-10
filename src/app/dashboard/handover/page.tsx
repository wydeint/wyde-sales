'use client'

import { useEffect, useState, useCallback, useMemo, useRef } from 'react'
import { createClient } from '@/lib/supabase/client'
import { CheckCircle2, X, Save } from 'lucide-react'
import { PageSpinner } from '@/components/ui/StateUI'
import PageHeader from '@/components/ui/PageHeader'
import FilterBar from '@/components/ui/FilterBar'
import PeriodPicker from '@/components/ui/PeriodPicker'
import { getPeriodBounds, UNIT_LABELS, type PeriodUnit } from '@/lib/period'
import { expectedDeliveryDate, fmtShortDate, DEFAULT_WORK_DAYS } from '@/lib/delivery'
import { workCategory } from '@/lib/status'
import DateInput from '@/components/ui/DateInput'
import { baht, bahtShort } from '@/lib/money'
import { compareRoom } from '@/lib/utils'

// ─── Types ─────────────────────────────────────────────────
interface Job {
  id: string
  room_no: string
  project_id: string
  revenue_inc_vat: number
  expected_finish_date: string | null
  original_expected_date: string | null
  work_start_date: string | null
  work_days: number | null
  actual_deliver_date: string | null
  working_status: string
  work_type: string | null
  customer_name: string | null
  projects: { name: string } | null
  sales: { name: string } | null
}

interface RoomEntry {
  id: string
  room_no: string
  project_id: string
  project_name: string
  revenue: number
  expected_date: string         // YYYY-MM-DD
  actual_date: string | null    // YYYY-MM-DD if delivered
  /** The date this room is counted under. Delivered rooms use the handover
   *  date; rooms that are late or have no start date use today, so they follow
   *  the period that contains today rather than sticking to one month; the rest
   *  use their expected date. Stored as a date, not a month string, so the same
   *  field answers month, quarter and year without three sets of rules. */
  display_date: string          // YYYY-MM-DD
  is_delivered: boolean
  is_overdue: boolean
  days_overdue: number          // 0 if not overdue
  no_start_date: boolean        // true = ยังไม่มีวันคาดส่งมอบจากแหล่งใดเลย
  working_status: string
  sales_name: string | null
  /** RPT / N-RPT / unknown — the bars split on this. */
  cat: ReturnType<typeof workCategory>
}

// ─── Helpers ───────────────────────────────────────────────
const TODAY = new Date(); TODAY.setHours(0, 0, 0, 0)

/**
 * วันที่แบบ YYYY-MM-DD ตามเวลาไทย
 *
 * `toISOString()` แปลงเป็น UTC ก่อน — ที่ UTC+7 เที่ยงคืนของวันนี้จึงกลายเป็น
 * 17:00 ของ *เมื่อวาน* แปลว่าทุกวันที่ 1 ของเดือน งานที่ควรมากองเดือนนี้
 * จะไปกองเดือนที่แล้วทั้งหมด (วัดจริงวันที่ 1 ก.ย.: ส.ค. มี 108 ห้อง
 * ทั้งที่ควรมี 41) วันอื่นๆ ก็เพี้ยนแต่ไม่ข้ามเดือนเลยไม่มีใครเห็น
 */
function localISO(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}
const TODAY_ISO = localISO(TODAY)


function daysDiff(dateStr: string): number {
  const d = new Date(dateStr); d.setHours(0, 0, 0, 0)
  return Math.floor((TODAY.getTime() - d.getTime()) / 86400000)
}

// ─── RoomChip ───────────────────────────────────────────────
function RoomChip({ entry, onClick }: { entry: RoomEntry; onClick: () => void }) {
  const base = "cursor-pointer transition-opacity hover:opacity-70 active:opacity-50"
  if (entry.no_start_date) {
    return (
      <button onClick={onClick} className={`${base} px-2.5 py-1 rounded-[6px] text-xs font-semibold`}
        style={{ background: 'color-mix(in srgb, var(--accent-amber) 8%, transparent)', border: '1px solid color-mix(in srgb, var(--accent-amber) 30%, transparent)', color: 'var(--accent-amber)' }}
        title="ยังไม่มีวันเริ่มงาน — คลิกเพื่อแก้ไข">
        {entry.room_no}
      </button>
    )
  }
  if (entry.is_delivered) {
    return (
      <button onClick={onClick} className={`${base} flex items-center gap-1 px-2.5 py-1 rounded-[6px] text-xs font-semibold`}
        style={{ background: 'color-mix(in srgb, var(--accent-green) 10%, transparent)', border: '1px solid color-mix(in srgb, var(--accent-green) 25%, transparent)', color: 'var(--accent-green)' }}>
        <CheckCircle2 size={10} />
        {entry.room_no}
      </button>
    )
  }
  if (entry.is_overdue) {
    return (
      <button onClick={onClick} className={`${base} flex items-center gap-1.5 px-2.5 py-1 rounded-[6px] text-xs font-semibold`}
        style={{ background: 'color-mix(in srgb, var(--accent-red) 8%, transparent)', border: '1px solid color-mix(in srgb, var(--accent-red) 25%, transparent)', color: 'var(--accent-red)' }}>
        {entry.room_no}
        <span className="text-micro font-normal opacity-60">+{entry.days_overdue}d</span>
      </button>
    )
  }
  return (
    <button onClick={onClick} className={`${base} px-2.5 py-1 rounded-[6px] text-xs font-semibold`}
      style={{ background: 'var(--hover-bg)', border: '1px solid var(--divider)', color: 'var(--text-2)' }}>
      {entry.room_no}
    </button>
  )
}

// ─── Edit Drawer ────────────────────────────────────────────
interface EditState {
  id: string; room_no: string; project_name: string
  customer_name: string | null
  sales_name: string | null
  work_type: string | null
  revenue: number
  working_status: string
  /** วันคาดส่งมอบที่กรอกมือ — ทับค่าที่คำนวณได้ */
  expected_finish_date: string
  original_expected_date: string
  work_start_date: string; work_days: string
  /** จ่ายงวดเริ่มงานแล้วหรือยัง — ใช้เตือนเมื่อเงินมาแล้วแต่ยังไม่มีวันเริ่มงาน */
  trigger_paid: boolean
  /** อ่านอย่างเดียว — บันทึกที่ My Deals ผ่าน deliverJob() เท่านั้น */
  actual_deliver_date: string
}

/** เอกสารที่ต้องเกิดขึ้นพร้อมการส่งมอบ — ใช้เป็นเช็กลิสต์ในหัวข้อสถานะ */
interface DeliveryDocs { handover: boolean; warranty: boolean; commission: boolean }

/* ป้าย 11px / ค่า 12.5px — ชุดเดียวกับการ์ดหัวห้องในหน้า Procurement
   เดิมค่าเป็น 14px semibold ซึ่งเบียดหัว drawer (16px) จนอ่านเหมือนพาดหัว
   ทั้งที่เป็นข้อมูลอ้างอิงที่แค่กวาดตาดู */
function Row2({ label, value, tone }: { label: string; value: React.ReactNode; tone?: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <span style={{ fontSize: 12, lineHeight: 1.4, color: 'var(--text-3)' }}>{label}</span>
      <span className="font-semibold text-right"
        style={{ fontSize: 12.5, lineHeight: 1.45, color: tone ?? 'var(--text-1)' }}>{value}</span>
    </div>
  )
}

function EditDrawer({ entry, onClose, onSaved }: { entry: EditState; onClose: () => void; onSaved: () => void }) {
  const supabase = createClient()
  const [form, setForm] = useState(entry)
  const [docs, setDocs] = useState<DeliveryDocs | null>(null)
  const [savedAt, setSavedAt] = useState<string | null>(null)
  const dirty = useRef(false)

  const isDelivered = !!entry.actual_deliver_date

  useEffect(() => {
    if (!isDelivered) return
    let alive = true
    Promise.all([
      supabase.from('handovers').select('id').eq('job_id', entry.id).maybeSingle(),
      supabase.from('warranties').select('id').eq('job_id', entry.id).maybeSingle(),
      supabase.from('jobs').select('commission_month').eq('id', entry.id).maybeSingle(),
    ]).then(([h, w, j]) => {
      if (!alive) return
      setDocs({
        handover: !!h.data,
        warranty: !!w.data,
        commission: !!(j.data as { commission_month?: string } | null)?.commission_month,
      })
    })
    return () => { alive = false }
  }, [entry.id, isDelivered]) // eslint-disable-line react-hooks/exhaustive-deps

  const derived = expectedDeliveryDate({
    expected_finish_date: null,
    work_start_date: form.work_start_date || null,
    work_days: form.work_days ? parseInt(form.work_days) : null,
  })
  const effective = form.expected_finish_date || derived
  const daysLeft = effective && !isDelivered
    ? Math.round((new Date(effective).getTime() - TODAY.getTime()) / 86400000)
    : null
  const slip = form.original_expected_date && effective
    ? Math.round((new Date(effective).getTime() - new Date(form.original_expected_date).getTime()) / 86400000)
    : null

  /**
   * ข. บันทึกทีละช่องตอนออกจากช่อง — วิธีเดียวกับหน้า Procurement ที่ทีมใช้อยู่
   *    ไม่ต้องเรียนรู้สองแบบ และไม่มีทางลืมกดบันทึกแล้วปิด drawer ทิ้ง
   *
   * ก. ครั้งแรกที่กรอกวันคาดส่งมอบทับ ให้เก็บ "แผนแรก" ไว้ด้วย — เก็บครั้งเดียว
   *    ตลอดไป การเลื่อนครั้งที่ 2, 3 จึงยังเทียบกับแผนแรกได้เสมอ
   */
  async function patch(field: 'expected_finish_date', value: string) {
    const payload: Record<string, string | number | null> = { [field]: value || null }
    if (value && !form.original_expected_date) {
      const baseline = derived ?? value
      payload.original_expected_date = baseline
      setForm(f => ({ ...f, original_expected_date: baseline }))
    }
    const { error } = await supabase.from('jobs').update(payload).eq('id', form.id)
    if (error) { alert('บันทึกไม่สำเร็จ: ' + error.message); return }
    setSavedAt(new Date().toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' }))
    dirty.current = true
  }

  /** รีเฟรชปฏิทินครั้งเดียวตอนปิด — ระหว่างแก้ drawer ต้องอยู่นิ่ง */
  function close() {
    if (dirty.current) onSaved()
    onClose()
  }

  function field(name: 'expected_finish_date') {
    return {
      value: form[name],
      onChange: (e: React.ChangeEvent<HTMLInputElement>) =>
        setForm(f => ({ ...f, [name]: e.target.value })),
      onBlur: (e: React.FocusEvent<HTMLInputElement>) => {
        if (e.target.value !== entry[name]) patch(name, e.target.value)
      },
    }
  }

  return (
    <div className="modal-backdrop" onClick={close}>
      <div onClick={e => e.stopPropagation()} className="modal-panel flex flex-col">

        <div className="flex items-center gap-3 px-5 py-4" style={{ borderBottom: '1px solid var(--divider)' }}>
          <div className="flex-1 min-w-0">
            <p className="font-bold text-base truncate" style={{ color: 'var(--text-1)' }}>
              ห้อง {form.room_no}
            </p>
            <p className="text-sm truncate" style={{ color: 'var(--text-3)' }}>{form.project_name}</p>
          </div>
          <button onClick={close} className="flex-shrink-0 flex items-center justify-center rounded-full"
            style={{ width: 36, height: 36, background: 'var(--hover-bg)', color: 'var(--text-2)' }}>
            <X size={16} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-5 space-y-5">

          <div className="ds-card-sm space-y-1.5">
            <Row2 label="ลูกค้า" value={form.customer_name || '—'} />
            <Row2 label="Sales" value={form.sales_name || '—'} />
            <Row2 label="ประเภทงาน" value={form.work_type || '—'} />
            <Row2 label="มูลค่า (inc.VAT)" value={baht(form.revenue)} />
            <Row2 label="สถานะ" value={form.working_status} />
          </div>

          {/* ค. เงินงวดเริ่มงานเข้าแล้ว แต่ยังไม่มีวันเริ่มงาน — 23 ห้องในระบบ */}
          {form.trigger_paid && !form.work_start_date && !isDelivered && (
            <div className="rounded-[8px] px-3 py-2 text-xs" style={{
              background: 'color-mix(in srgb, var(--accent-orange) 10%, transparent)',
              border: '1px solid color-mix(in srgb, var(--accent-orange) 30%, transparent)',
              color: 'var(--accent-orange)',
            }}>
              เก็บงวดเริ่มงานแล้ว แต่ระบบยังไม่ได้ลงวันเริ่มงาน — กรอกวันคาดส่งมอบด้านล่าง
              เพื่อให้ห้องเข้าปฏิทิน แล้วแจ้งให้แก้วันเริ่มงานที่ Data Entry
            </div>
          )}

          {/* วันเริ่มงานกับจำนวนวันทำงานล็อกไว้ — ทั้งคู่ไม่ใช่ข้อมูลของหน้านี้:
              วันเริ่มงานมาจากการชำระงวดเริ่มงาน (แก้มือแล้วจะขัดกับเงินที่เก็บ)
              ส่วนจำนวนวันทำงานคือขอบเขตงานที่ตกลงกับลูกค้า ไม่ใช่ความล่าช้า
              งานเลื่อนให้กรอกที่ "วันคาดส่งมอบ" ซึ่งเก็บแผนแรกไว้เทียบให้ด้วย */}
          <div className="ds-card-sm space-y-1.5">
            <Row2 label="วันเริ่มงาน"
              value={form.work_start_date ? fmtShortDate(form.work_start_date) : '—'} />
            <Row2 label="จำนวนวันทำงาน" value={form.work_days ? `${form.work_days} วัน` : '—'} />
            <p className="text-xs pt-1" style={{ color: 'var(--text-3)' }}>
              🔒 วันเริ่มงานมาจากการชำระงวดเริ่มงาน · จำนวนวันทำงานคือขอบเขตงานตามสัญญา
              — งานเลื่อนให้แก้ที่วันคาดส่งมอบด้านล่าง
            </p>
          </div>

          <div>
            <label className="field-label mb-2 block">วันคาดส่งมอบ</label>
            <div className="flex items-baseline justify-between gap-3 mb-2">
              <span className="text-xs" style={{ color: 'var(--text-3)' }}>คำนวณจากวันเริ่มงาน</span>
              <span className="text-sm tabular-nums"
                style={{ color: form.expected_finish_date ? 'var(--text-3)' : 'var(--text-1)' }}>
                {derived ? fmtShortDate(derived) : '—'}
                {!form.expected_finish_date && derived && ' ← ใช้ค่านี้'}
              </span>
            </div>
            <DateInput {...field('expected_finish_date')}
              className="field-input text-base" style={{ minHeight: 44 }} />
            <p className="text-xs mt-1.5" style={{ color: 'var(--text-3)' }}>
              {form.expected_finish_date
                ? 'กรอกเอง — ใช้ค่านี้แทนค่าที่คำนวณได้'
                : 'เว้นว่างไว้ = ใช้ค่าที่คำนวณได้ · กรอกเมื่อรู้วันจริงจากหน้างาน'}
            </p>
            {/* ก. เทียบกับแผนแรกเสมอ ไม่ใช่เทียบกับการเลื่อนครั้งก่อน */}
            {form.original_expected_date && (
              <div className="mt-2 pt-2" style={{ borderTop: '1px solid var(--divider)' }}>
                <Row2 label="แผนแรก" value={fmtShortDate(form.original_expected_date)} />
                {slip !== null && slip !== 0 && (
                  <Row2 label={slip > 0 ? 'เลื่อนออกไป' : 'เลื่อนเข้ามา'}
                    value={`${Math.abs(slip)} วัน`}
                    tone={slip > 0 ? 'var(--accent-orange)' : 'var(--accent-green)'} />
                )}
              </div>
            )}
          </div>

          <div className="ds-card-sm space-y-2">
            <p className="text-xs font-semibold" style={{ color: 'var(--text-2)' }}>การส่งมอบ</p>
            {isDelivered ? (
              <>
                {/* ห้องที่ส่งมอบแล้วเคยไม่บอกเลยว่าช้าหรือเร็วกว่าแผนกี่วัน —
                    เทียบกับแผนแรกถ้ามี ไม่งั้นเทียบกับวันที่คำนวณได้ */}
                <Row2 label="วันคาดส่งมอบ"
                  value={effective ? fmtShortDate(effective) : '—'} />
                <Row2 label="วันส่งมอบจริง" value={fmtShortDate(entry.actual_deliver_date)}
                  tone="var(--accent-green)" />
                {(() => {
                  const base = form.original_expected_date || effective
                  if (!base) return null
                  const d = Math.round(
                    (new Date(entry.actual_deliver_date).getTime() - new Date(base).getTime()) / 86400000)
                  if (d === 0) return <Row2 label="เทียบกับแผน" value="ตรงตามแผน" tone="var(--accent-green)" />
                  return (
                    <Row2 label={d > 0 ? 'ส่งช้ากว่าแผน' : 'ส่งเร็วกว่าแผน'}
                      value={`${Math.abs(d)} วัน`}
                      tone={d > 0 ? 'var(--accent-red)' : 'var(--accent-green)'} />
                  )
                })()}
                <p className="text-xs pt-1" style={{ color: 'var(--text-3)' }}>
                  🔒 แก้ที่นี่ไม่ได้ — การส่งมอบสร้างใบส่งมอบ ใบประกัน และเดือนค่าคอมไปพร้อมกัน
                  ต้องแก้ที่ My Deals เพื่อให้ทั้งชุดตรงกัน
                </p>
                <div className="pt-2 space-y-1" style={{ borderTop: '1px solid var(--divider)' }}>
                  {docs === null
                    ? <p className="text-xs" style={{ color: 'var(--text-3)' }}>กำลังตรวจเอกสาร...</p>
                    : ([
                        ['ใบส่งมอบ', docs.handover],
                        ['ใบประกัน', docs.warranty],
                        ['เดือนค่าคอมมิชชั่น', docs.commission],
                      ] as [string, boolean][]).map(([label, ok]) => (
                        <Row2 key={label} label={label}
                          value={ok ? '✓ มีแล้ว' : '✕ ยังไม่มี'}
                          tone={ok ? 'var(--accent-green)' : 'var(--accent-red)'} />
                      ))}
                </div>
              </>
            ) : (
              <>
                <Row2 label="สถานะ" value="ยังไม่ส่งมอบ" tone="var(--text-2)" />
                {daysLeft !== null && (
                  <Row2 label={daysLeft >= 0 ? 'เหลืออีก' : 'เลยกำหนดมา'}
                    value={`${Math.abs(daysLeft)} วัน`}
                    tone={daysLeft < 0 ? 'var(--accent-red)' : 'var(--text-1)'} />
                )}
                <a href="/dashboard/my-deals"
                  className="block text-center text-xs font-semibold rounded-[8px] py-2 mt-1"
                  style={{ background: 'var(--hover-bg)', color: 'var(--accent)', border: '1px solid var(--divider)' }}>
                  ไปบันทึกส่งมอบที่ My Deals →
                </a>
              </>
            )}
          </div>
        </div>

        <div className="px-5 py-4 pb-safe flex items-center justify-between gap-3"
          style={{ borderTop: '1px solid var(--divider)' }}>
          <span className="text-xs" style={{ color: 'var(--text-3)' }}>
            {savedAt ? `บันทึกแล้ว ${savedAt}` : 'แก้ช่องไหนบันทึกทันทีที่กดออกจากช่อง'}
          </span>
          <button onClick={close}
            className="rounded-[8px] px-4 font-semibold text-sm"
            style={{ background: 'var(--hover-bg)', color: 'var(--text-2)', border: '1px solid var(--divider)', minHeight: 40 }}>
            ปิด
          </button>
        </div>
      </div>
    </div>
  )
}


// ─── Main ───────────────────────────────────────────────────
export default function HandoverPage() {
  const supabase = createClient()
  const [jobs, setJobs] = useState<Job[]>([])
  const [loading, setLoading] = useState(true)
  const [periodUnit, setPeriodUnit] = useState<PeriodUnit>('month')
  const [periodOffset, setPeriodOffset] = useState(0)
  const [filterProject, setFilterProject] = useState('')
  const [filterSales, setFilterSales] = useState('')
  const [editEntry, setEditEntry] = useState<EditState | null>(null)
  const [triggerPaid, setTriggerPaid] = useState<Set<string>>(new Set())
  /**
   * สองคำถามที่หน้านี้ตอบ ไม่ใช่คำถามเดียวกัน
   *  chase = "เดือนนี้ต้องตามงานอะไร"  → ห้องเลยกำหนดมากองเดือนปัจจุบัน
   *  plan  = "เดือนหน้าจะส่งกี่ห้อง"   → ห้องเลยกำหนดอยู่เดือนที่ควรส่ง
   */
  const [view, setView] = useState<'chase' | 'plan'>('chase')

  function openEdit(entry: RoomEntry) {
    const job = jobs.find(j => j.id === entry.id)
    if (!job) return
    setEditEntry({
      id: job.id,
      room_no: job.room_no,
      project_name: entry.project_name,
      customer_name: job.customer_name,
      sales_name: entry.sales_name,
      work_type: job.work_type,
      revenue: entry.revenue,
      working_status: job.working_status,
      expected_finish_date: job.expected_finish_date || '',
      original_expected_date: job.original_expected_date || '',
      work_start_date: job.work_start_date || '',
      work_days: job.work_days != null ? String(job.work_days) : String(DEFAULT_WORK_DAYS),
      trigger_paid: triggerPaid.has(job.id),
      actual_deliver_date: job.actual_deliver_date || '',
    })
  }

  const load = useCallback(async () => {
    setLoading(true)
    const { data } = await supabase
      .from('jobs')
      .select('id, room_no, project_id, revenue_inc_vat, work_type, customer_name, expected_finish_date, original_expected_date, work_start_date, work_days, actual_deliver_date, working_status, projects(name), sales:users!sales_id(name)')
      // เดิมกรองเฉพาะห้องที่มีวันเริ่มงานหรือส่งมอบแล้ว ทำให้ห้องที่ยังไม่มี
      // วันเริ่มงาน **ไม่ปรากฏบนหน้านี้เลย** — ในนั้นมี 50 ห้องที่สถานะ
      // "ดำเนินการ" คือทำงานอยู่จริงแต่ข้อมูลขาด ซึ่งควรฟ้องดังที่สุด
      .not('working_status', 'is', null)
      .neq('working_status', 'ยกเลิก')
      .order('project_id')
    setJobs((data as any) || [])

    // ห้องที่เก็บงวดเริ่มงานแล้ว — ใช้เตือนเมื่อเงินเข้าแล้วแต่ยังไม่มีวันเริ่มงาน
    const { data: pay } = await supabase.from('payments')
      .select('job_id').eq('status', 'paid').ilike('installment_name', '%เริ่มงาน%')
    setTriggerPaid(new Set(((pay ?? []) as { job_id: string }[]).map(r => r.job_id)))
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

  // Build room entries with display_month logic
  const entries: RoomEntry[] = useMemo(() => {
    return jobs.map(j => {
      const is_delivered = !!j.actual_deliver_date
      // สูตรกลางเดียวกับทุกหน้า: วันที่กรอกมือชนะก่อน ไม่มีจึงคำนวณจาก
      // วันเริ่มงาน + จำนวนวัน — เดิมหน้านี้คำนวณเองและมองข้ามค่าที่กรอกมือ
      const derived = expectedDeliveryDate(j)
      const no_start_date = !derived && !is_delivered
      const expected = derived ?? (j.actual_deliver_date ?? TODAY_ISO)

      const days_over = (!is_delivered && !no_start_date) ? Math.max(0, daysDiff(expected)) : 0
      const is_overdue = !is_delivered && !no_start_date && expected < TODAY_ISO

      // Which month does this room appear under?
      let display_date: string
      if (is_delivered) {
        display_date = j.actual_deliver_date!
      } else if (view === 'plan') {
        // มุมมอง "ตามวันคาดส่งมอบ": ห้องที่เลยกำหนดต้องอยู่เดือนที่ควรส่ง
        display_date = expected
      } else if (no_start_date || is_overdue) {
        // Neither has a date it belongs to, and both need chasing now, so they
        // ride with today. Under a month this reproduces the old behaviour
        // exactly; under a quarter or a year they land in the period containing
        // today instead of being stranded.
        display_date = TODAY_ISO
      } else {
        display_date = expected
      }

      return {
        id: j.id,
        room_no: j.room_no,
        project_id: j.project_id,
        project_name: (j.projects as any)?.name || j.project_id,
        revenue: j.revenue_inc_vat || 0,
        expected_date: expected,
        actual_date: j.actual_deliver_date,
        display_date,
        is_delivered,
        is_overdue,
        days_overdue: days_over,
        no_start_date,
        working_status: j.working_status,
        sales_name: (j.sales as any)?.name || null,
        cat: workCategory(j.work_type),
      }
    })
  }, [jobs, view])

  const bounds = useMemo(() => getPeriodBounds(periodUnit, periodOffset), [periodUnit, periodOffset])

  const projectOptions = useMemo(() => {
    const m = new Map<string, string>()
    for (const e of entries) m.set(e.project_id, e.project_name)
    return [...m.entries()].sort((a, b) => a[1].localeCompare(b[1], 'th'))
  }, [entries])
  const salesOptions = useMemo(
    () => [...new Set(entries.map(e => e.sales_name).filter(Boolean))].sort() as string[],
    [entries])

  /** Project and sales filters apply before the period, so the chart below can
   *  reuse this set and show the same rooms across time that the cards show for
   *  one period. */
  const scoped = useMemo(() => entries.filter(e =>
    (!filterProject || e.project_id === filterProject) &&
    (!filterSales || e.sales_name === filterSales)), [entries, filterProject, filterSales])

  /* ห้องที่ยังไม่มีวันส่งมอบเลย ไม่นับเข้าเดือนไหนทั้งนั้น — มันมีเลนของตัวเอง
     ด้านล่างแล้ว ถ้ายังยัดเข้าเดือนปัจจุบันด้วยจะถูกนับสองรอบ */
  const monthEntries = useMemo(
    () => scoped.filter(e => !e.no_start_date
      && e.display_date >= bounds.start && e.display_date <= bounds.end),
    [scoped, bounds])

  /** Trend across the periods leading up to the one selected, in the same unit
   *  the picker is set to — twelve months, eight quarters, or every year that
   *  has data. Each column is one period of `scoped`, so the chart and the cards
   *  are always describing the same set of rooms. */
  const trend = useMemo(() => {
    const spans = periodUnit === 'year' ? 4 : periodUnit === 'quarter' ? 8 : 12
    const out: { key: string; label: string; delivered: number; late: number; value: number; valueRpt: number; valueNrpt: number; current: boolean }[] = []
    for (let i = spans - 1; i >= 0; i--) {
      const b = getPeriodBounds(periodUnit, periodOffset - i)
      const rooms = scoped.filter(e => e.display_date >= b.start && e.display_date <= b.end)
      out.push({
        key: b.start,
        label: periodUnit === 'year' ? b.year : b.name,
        delivered: rooms.filter(e => e.is_delivered).length,
        // Not yet handed over and past its date — the bar splits so a rising
        // column can be read as more work or as more slipping.
        late: rooms.filter(e => !e.is_delivered && e.is_overdue).length,
        value: rooms.filter(e => e.is_delivered).reduce((s, e) => s + e.revenue, 0),
        // Split by work type. It explains the shape of the chart without a
        // caption: Dec 2025 is one ฿39.18M RPT contract, every other period is
        // ฿0.3–1.4M of RPT under a much larger N-RPT base.
        valueRpt: rooms.filter(e => e.is_delivered && e.cat === 'RPT').reduce((s, e) => s + e.revenue, 0),
        valueNrpt: rooms.filter(e => e.is_delivered && e.cat !== 'RPT').reduce((s, e) => s + e.revenue, 0),
        current: i === 0,
      })
    }
    return out
  }, [scoped, periodUnit, periodOffset])

  /** The bars carry value alone, so this is the only scale the chart has. Room
   *  counts are printed under each column instead of drawn — one quarter holds
   *  two rooms worth ฿39.58M, and any shared scale flattens everything else. */
  const trendMaxValue = Math.max(...trend.map(t => t.value), 1)

  // Group by project
  const byProject = useMemo(() => {
    const map = new Map<string, { name: string; rooms: RoomEntry[] }>()
    for (const e of monthEntries) {
      if (!map.has(e.project_id)) map.set(e.project_id, { name: e.project_name, rooms: [] })
      map.get(e.project_id)!.rooms.push(e)
    }
    /* เรียงห้องในแต่ละโครงการด้วย — เดิมเรียงแต่ชื่อโครงการ ส่วนห้องข้างในเรียง
       ตามลำดับที่ดึงมาจากฐานข้อมูล ซึ่งบนจอดูเหมือนไม่มีลำดับเลย (Origin Play
       Bangsaen ขึ้น 1510, 1618, 1920, 2205 … 918, 802) การ์ดไม่ได้แสดงวันที่
       รายห้อง คนอ่านจึงไม่มีทางเดาได้ว่ามันเรียงตามอะไร · compareRoom ใช้
       localeCompare ไทย + numeric ห้อง 802 จึงมาก่อน 1218 ไม่ใช่หลัง */
    for (const p of map.values()) p.rooms.sort((a, b) => compareRoom(a.room_no, b.room_no))
    return Array.from(map.values()).sort((a, b) => a.name.localeCompare(b.name, 'th'))
  }, [monthEntries])

  // Summary
  const totalRooms = monthEntries.length
  const deliveredRooms = monthEntries.filter(e => e.is_delivered).length
  const overdueRooms = monthEntries.filter(e => e.is_overdue).length
  const noStartRooms = monthEntries.filter(e => e.no_start_date).length
  const totalValue = monthEntries.reduce((s, e) => s + e.revenue, 0)

  /* ห้องที่ยังไม่มีวันคาดส่งมอบเลย — แยกสองกลุ่มเพราะคนละเรื่องกัน:
     "ดำเนินการ" คือข้อมูลขาดต้องตามเก็บ ส่วน "จอง" คือสถานะปกติ */
  const undated = useMemo(() => {
    const rooms = scoped.filter(e => e.no_start_date)
    return {
      working: rooms.filter(e => e.working_status === 'ดำเนินการ')
        .sort((a, b) => compareRoom(a.room_no, b.room_no)),
      booked: rooms.filter(e => e.working_status !== 'ดำเนินการ')
        .sort((a, b) => compareRoom(a.room_no, b.room_no)),
    }
  }, [scoped])
  /* ห้องที่เลยกำหนดแล้ว — ทุกห้อง ไม่ใช่แค่เดือนที่เปิดดูอยู่
     มุมมอง "ตามวันคาดส่งมอบ" วางห้องไว้ที่เดือนที่ควรส่ง ซึ่งถูกต้องสำหรับการ
     อ่านแผน แต่แปลว่าของค้าง 65 ห้องกระจายอยู่ 17 เดือน ย้อนไปถึงเม.ย. 2566 —
     คำถาม "ตอนนี้ค้างอะไรบ้าง" จึงต้องเดินย้อนทีละเดือนถึงจะตอบได้ แถบนี้ตอบให้
     ในหน้าจอเดียว โดยห้องยังอยู่ในเดือนของมันตามเดิม
     เรียงจากค้างนานสุดก่อน ห้องที่เลยมา 3 ปีต้องเป็นห้องแรกที่เห็น ไม่ใช่ห้องที่
     ต้องขุด และไม่นับรวมในการ์ดสรุปด้านบน เพราะการ์ดพูดถึงเดือนที่เปิดอยู่ */
  const overdueAll = useMemo(
    () => scoped.filter(e => e.is_overdue && !e.is_delivered)
      .sort((a, b) => a.expected_date.localeCompare(b.expected_date)),
    [scoped])

  const deliveredValue = monthEntries.filter(e => e.is_delivered).reduce((s, e) => s + e.revenue, 0)

  const f = baht

  if (loading) return <PageSpinner />

  return (
    <div className="page-content">
      {editEntry && <EditDrawer entry={editEntry} onClose={() => setEditEntry(null)} onSaved={load} />}

      {/* Header */}
      <div className="pb-4 mb-4" style={{ borderBottom: '1px solid var(--divider)' }}>
        <PageHeader
          title="Handover"
          subtitle="ตารางส่งมอบงานรายเดือน"
          className="mb-4"
          actions={
            <button onClick={load} className="text-xs px-3 py-1.5 rounded-[8px]"
              style={{ background: 'var(--hover-bg)', color: 'var(--text-2)', border: '1px solid var(--divider)' }}>
              รีเฟรช
            </button>
          }
        />

        {/* Period + project + sales, in the one FilterBar every other page uses.
            PeriodPicker is the shared control — same three units, same offset
            walking, same fixed-width slots — so this page stops having a month
            stepper of its own design. */}
        <FilterBar className="mb-4">
          {/* The only page that opts into future periods, and the only one that
              needs to: every other screen reports what has already happened, so
              next month is empty there by definition. Here the months ahead are
              the whole point — a room bought today with a 60-day build belongs
              two months out, and until this was allowed the delivery schedule
              could not show a single room it was planning for. */}
          <PeriodPicker unit={periodUnit} setUnit={setPeriodUnit} allowFuture
            offset={periodOffset} setOffset={setPeriodOffset} />
          <select value={filterProject} onChange={e => setFilterProject(e.target.value)}
            className="field-input" style={{ width: 'auto', maxWidth: '12rem' }}>
            <option value="">ทุกโครงการ</option>
            {projectOptions.map(([pid, name]) => <option key={pid} value={pid}>{name}</option>)}
          </select>
          <select value={filterSales} onChange={e => setFilterSales(e.target.value)}
            className="field-input" style={{ width: 'auto' }}>
            <option value="">ทุก Sales</option>
            {salesOptions.map(n => <option key={n} value={n}>{n}</option>)}
          </select>
          {(filterProject || filterSales) && (
            <button onClick={() => { setFilterProject(''); setFilterSales('') }}
              className="text-xs px-2 py-1.5 rounded-[8px] transition-colors"
              style={{ color: 'var(--text-3)', background: 'var(--hover-bg)', border: '1px solid var(--divider)' }}>
              ล้าง
            </button>
          )}
          <div className="tab-group ml-auto">
            <button onClick={() => setView('chase')}
              className={`tab-btn ${view === 'chase' ? 'active' : ''}`}
              title="ห้องที่เลยกำหนดมากองที่เดือนปัจจุบัน">ตามงานค้าง</button>
            <button onClick={() => setView('plan')}
              className={`tab-btn ${view === 'plan' ? 'active' : ''}`}
              title="ห้องที่เลยกำหนดอยู่ในเดือนที่ควรส่งมอบ">ตามวันคาดส่งมอบ</button>
          </div>
          <span className="text-xs" style={{ color: 'var(--text-3)' }}>{monthEntries.length} ห้อง</span>
        </FilterBar>

        {/* Summary cards */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="ds-card">
            <p className="text-xs mb-1" style={{ color: 'var(--text-3)' }}>จำนวนห้อง</p>
            <p className="text-kpi-number" style={{ color: 'var(--text-1)' }}>
              {deliveredRooms} <span className="text-sm font-normal" style={{ color: 'var(--text-3)' }}>/ {totalRooms} ห้อง</span>
            </p>
            {deliveredRooms > 0 && <p className="text-micro mt-0.5" style={{ color: 'var(--accent-green)' }}>ส่งมอบแล้ว {Math.round(deliveredRooms / totalRooms * 100)}%</p>}
          </div>
          <div className="ds-card">
            <p className="text-xs mb-1" style={{ color: 'var(--text-3)' }}>มูลค่างาน</p>
            <p className="text-kpi-money" style={{ color: 'var(--accent)' }}>{f(deliveredValue)}</p>
            <p className="text-micro mt-0.5" style={{ color: 'var(--text-3)' }}>/ {f(totalValue)}</p>
          </div>
          {overdueRooms > 0 && (
            <div className="ds-card">
              <p className="text-xs mb-1" style={{ color: 'var(--text-3)' }}>หลุดส่งมอบ</p>
              <p className="text-kpi-number" style={{ color: 'var(--accent-red)' }}>{overdueRooms} ห้อง</p>
            </div>
          )}
          {noStartRooms > 0 && (
            <div className="ds-card">
              <p className="text-xs mb-1" style={{ color: 'var(--text-3)' }}>ยังไม่มีวันเริ่มงาน</p>
              <p className="text-kpi-number" style={{ color: 'var(--accent-amber)' }}>{noStartRooms} ห้อง</p>
            </div>
          )}
        </div>

        {/* Trend — same bar-and-tooltip build as the Finance chart, so nothing
            new has to be learned. Column count follows the picker's unit. */}
        <div className="ds-card mt-4">
          <div className="flex items-center gap-4 mb-4 flex-wrap">
            <h2 className="text-section-title" style={{ color: 'var(--text-1)' }}>
              แนวโน้มการส่งมอบ · {trend.length} {UNIT_LABELS[periodUnit]}ล่าสุด
            </h2>
            <div className="flex gap-4 text-xs">
              {/* One measure — baht — split by work type. Two colours here
                  encode a real division in the data, not decoration: without it
                  the December column is an unexplained spike and the chart needs
                  a caption to apologise for itself. */}
              <span className="flex items-center gap-1.5" style={{ color: 'var(--text-3)' }}>
                <span className="w-3 h-2 rounded-sm inline-block" style={{ background: 'var(--chart-1)' }} />N-RPT
              </span>
              <span className="flex items-center gap-1.5" style={{ color: 'var(--text-3)' }}>
                <span className="w-3 h-2 rounded-sm inline-block" style={{ background: 'var(--chart-2)' }} />RPT
              </span>
            </div>
          </div>
          {/* Headroom above the bars for the tooltip, which cannot escape the
              scroller — the same fix the Finance chart needed. */}
          <div className="flex items-end gap-1.5 overflow-x-auto pb-1" style={{ height: '208px', paddingTop: '38px' }}>
            {trend.map(t => {
              const rooms = t.delivered + t.late
              return (
                <div key={t.key} className="flex-shrink-0 flex flex-col items-center gap-0.5 group" style={{ minWidth: '52px' }}>
                  <div style={{ height: '14px', fontSize: '12px', fontWeight: 600, lineHeight: '14px', textAlign: 'center', width: '100%' }}>
                    {t.value > 0 && <span style={{ color: 'var(--chart-1)' }}>{bahtShort(t.value)}</span>}
                  </div>
                  <div className="w-full relative flex items-end justify-center" style={{ height: '104px' }}>
                    <div className="w-full flex flex-col justify-end" style={{ height: '100%' }}>
                      {/* RPT on top, so the block that makes a column tall is
                          the one the eye lands on first. A 2% floor keeps a
                          small period visible rather than reading as nothing. */}
                      {t.valueRpt > 0 && (
                        <div className="rounded-t-sm" style={{
                          height: `${Math.max((t.valueRpt / trendMaxValue) * 100, 2)}%`,
                          background: 'var(--chart-2)',
                        }} />
                      )}
                      {t.valueNrpt > 0 && (
                        <div style={{
                          height: `${Math.max((t.valueNrpt / trendMaxValue) * 100, 2)}%`,
                          background: 'var(--chart-1)',
                          borderRadius: t.valueRpt > 0 ? 0 : '2px 2px 0 0',
                        }} />
                      )}
                    </div>
                    {rooms > 0 && (
                      <div className="absolute bottom-full mb-1 left-1/2 -translate-x-1/2 opacity-0 group-hover:opacity-100 transition-opacity z-10 text-micro whitespace-nowrap px-2 py-1 rounded-[8px] shadow-lg pointer-events-none"
                        style={{ background: 'var(--panel-bg)', border: '1px solid var(--card-border)', color: 'var(--text-1)' }}>
                        <div style={{ color: 'var(--accent-green)' }}>ส่งมอบ {t.delivered} ห้อง</div>
                        {t.late > 0 && <div style={{ color: 'var(--accent-red)' }}>หลุดกำหนด {t.late} ห้อง</div>}
                        {t.valueNrpt > 0 && <div style={{ color: 'var(--chart-1)' }}>N-RPT {bahtShort(t.valueNrpt)}</div>}
                        {t.valueRpt > 0 && <div style={{ color: 'var(--chart-2)' }}>RPT {bahtShort(t.valueRpt)}</div>}
                      </div>
                    )}
                  </div>
                  <p className="text-micro whitespace-nowrap"
                    style={{ color: t.current ? 'var(--accent)' : 'var(--text-3)', fontWeight: t.current ? 700 : 400 }}>
                    {t.label}
                  </p>
                  {/* Room count under the axis label: the second measure, told
                      rather than drawn, so nothing competes with the bars. */}
                  <p className="text-micro whitespace-nowrap" style={{ color: 'var(--text-3)' }}>
                    {rooms > 0 ? `${rooms} ห้อง` : '—'}
                    {t.late > 0 && <span style={{ color: 'var(--accent-red)' }}> · {t.late} หลุด</span>}
                  </p>
                </div>
              )
            })}
          </div>
          <p className="text-micro mt-2" style={{ color: 'var(--text-3)' }}>
            แท่ง = มูลค่าที่ส่งมอบ · ตัวเลขใต้แท่ง = จำนวนห้อง
          </p>
        </div>
      </div>

      {/* Content */}
      <div>
        {totalRooms === 0 ? (
          <div className="flex items-center justify-center h-32">
            <p className="text-sm" style={{ color: 'var(--text-3)' }}>ไม่มีข้อมูลสำหรับเดือนนี้</p>
          </div>
        ) : (
          <div className="space-y-4">
            {byProject.map(({ name, rooms }) => {
              const projValue = rooms.reduce((s, r) => s + r.revenue, 0)
              const projDelivered = rooms.filter(r => r.is_delivered).length
              const projOverdue = rooms.filter(r => r.is_overdue).length
              return (
                <div key={name} className="rounded-[11px] overflow-hidden"
                  style={{ background: 'var(--card-bg)', border: '1px solid var(--card-border)' }}>
                  {/* Project header */}
                  <div className="flex items-center gap-3 px-4 py-3" style={{ borderBottom: '1px solid var(--divider)', background: 'var(--hover-bg)' }}>
                    <p className="font-semibold text-sm flex-1" style={{ color: 'var(--text-1)' }}>{name}</p>
                    <div className="flex items-center gap-3">
                      {projOverdue > 0 && (
                        <span className="text-label font-semibold px-1.5 py-0.5 rounded-[4px]"
                          style={{ background: 'color-mix(in srgb, var(--accent-red) 8%, transparent)', border: '1px solid color-mix(in srgb, var(--accent-red) 25%, transparent)', color: 'var(--accent-red)' }}>
                          {projOverdue} หลุด
                        </span>
                      )}
                      <span className="text-xs" style={{ color: 'var(--text-2)' }}>
                        {projDelivered}/{rooms.length} ห้อง
                      </span>
                      <span className="text-xs font-semibold" style={{ color: 'var(--accent)' }}>{f(projValue)}</span>
                    </div>
                  </div>
                  {/* Room chips */}
                  <div className="p-4 flex flex-wrap gap-2">
                    {rooms.map(r => <RoomChip key={r.id} entry={r} onClick={() => openEdit(r)} />)}
                  </div>
                </div>
              )
            })}
          </div>
        )}

        {/* ── ห้องที่เลยกำหนด (เฉพาะมุมมองตามวันคาดส่งมอบ) ──────────
            มุมมอง "ตามงานค้าง" ดึงห้องพวกนี้มากองที่เดือนปัจจุบันอยู่แล้ว
            แถบนี้จึงซ้ำซ้อนที่นั่น */}
        {view === 'plan' && overdueAll.length > 0 && (
          <div className="mt-6 space-y-3">
            <div className="flex items-baseline justify-between gap-3 flex-wrap">
              <h2 className="text-base font-bold" style={{ color: 'var(--text-1)' }}>
                เลยกำหนดส่งมอบ
              </h2>
              <span className="text-xs" style={{ color: 'var(--text-3)' }}>
                รวมทุกเดือน — ห้องยังอยู่ในเดือนที่ควรส่งตามปฏิทินด้านบนด้วย
              </span>
            </div>
            <UndatedLane
              title="ค้างส่งมอบ"
              hint="เรียงจากค้างนานสุด — กดที่ห้องเพื่อแก้วันคาดส่งมอบ"
              tone="var(--accent-red)"
              rooms={overdueAll}
              onOpen={openEdit}
              showDaysOverdue
            />
          </div>
        )}

        {/* ── ห้องที่ยังไม่มีวันคาดส่งมอบ ─────────────────────────
            อยู่นอกปฏิทินเพราะไม่มีเดือนให้สังกัด ไม่ใช่เพราะไม่สำคัญ */}
        {(undated.working.length > 0 || undated.booked.length > 0) && (
          <div className="mt-6 space-y-3">
            <div className="flex items-baseline justify-between gap-3 flex-wrap">
              <h2 className="text-base font-bold" style={{ color: 'var(--text-1)' }}>
                ยังไม่กำหนดวันส่งมอบ
              </h2>
              <span className="text-xs" style={{ color: 'var(--text-3)' }}>
                ไม่มีทั้งวันคาดส่งมอบและวันเริ่มงาน จึงไม่ขึ้นในเดือนไหนเลย
              </span>
            </div>
            {undated.working.length > 0 && (
              <UndatedLane
                title="ดำเนินการอยู่ แต่ไม่มีวันเริ่มงาน"
                hint="ข้อมูลขาด — กดที่ห้องเพื่อกรอกวันคาดส่งมอบ แล้วห้องจะเข้าปฏิทินทันที"
                tone="var(--accent-red)"
                rooms={undated.working}
                onOpen={openEdit}
              />
            )}
            {undated.booked.length > 0 && (
              <UndatedLane
                title="จองแล้ว ยังไม่เริ่มงาน"
                hint="สถานะปกติ — รอเก็บงวดเริ่มงานก่อน ยังไม่ต้องมีวันส่งมอบ"
                tone="var(--text-3)"
                rooms={undated.booked}
                onOpen={openEdit}
              />
            )}
          </div>
        )}
      </div>
    </div>
  )
}

/** หนึ่งเลนของห้องที่ยังไม่มีวันส่งมอบ — พับไว้เพราะกองจองมีเป็นร้อยห้อง */
function UndatedLane({ title, hint, tone, rooms, onOpen, showDaysOverdue }: {
  title: string
  hint: string
  tone: string
  rooms: RoomEntry[]
  onOpen: (r: RoomEntry) => void
  /** Overdue lane: a room number alone cannot say whether it slipped a week or
   *  three years, and the list is sorted by exactly that. */
  showDaysOverdue?: boolean
}) {
  // Long lanes start collapsed so they do not bury the calendar — except the
  // overdue one, which exists precisely to be seen without another click.
  const [open, setOpen] = useState(showDaysOverdue || rooms.length <= 60)
  const value = rooms.reduce((s, r) => s + r.revenue, 0)
  return (
    <div className="rounded-[11px] overflow-hidden"
      style={{ background: 'var(--card-bg)', border: '1px solid var(--card-border)' }}>
      <button onClick={() => setOpen(o => !o)}
        className="w-full px-4 py-3 flex items-center justify-between gap-3 flex-wrap text-left"
        style={{ background: 'var(--hover-bg)' }}>
        <span className="min-w-0">
          <span className="text-sm font-semibold" style={{ color: tone }}>
            <span aria-hidden className="inline-block w-4">{open ? '▾' : '▸'}</span>
            {title}
          </span>
          <span className="block text-xs" style={{ color: 'var(--text-3)', paddingLeft: 16 }}>{hint}</span>
        </span>
        <span className="flex items-center gap-3 flex-shrink-0">
          <span className="text-xs" style={{ color: 'var(--text-2)' }}>{rooms.length} ห้อง</span>
          <span className="text-xs font-semibold" style={{ color: 'var(--accent)' }}>{baht(value)}</span>
        </span>
      </button>
      {open && (
        <div className="p-4 flex flex-wrap gap-2">
          {rooms.map(r => (
            <button key={r.id} onClick={() => onOpen(r)}
              className="px-2.5 py-1 rounded-[6px] text-xs font-semibold transition-opacity hover:opacity-70"
              style={{
                background: `color-mix(in srgb, ${tone} 8%, transparent)`,
                border: `1px solid color-mix(in srgb, ${tone} 28%, transparent)`,
                color: tone,
              }}>
              {r.room_no}
              {showDaysOverdue && (
                <span className="font-normal ml-1 opacity-60">+{r.days_overdue}d</span>
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

