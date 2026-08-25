'use client'

import { useEffect, useState, useCallback, useMemo } from 'react'
import { createClient } from '@/lib/supabase/client'
import { CheckCircle2, X, Save } from 'lucide-react'
import { PageSpinner } from '@/components/ui/StateUI'
import PageHeader from '@/components/ui/PageHeader'
import FilterBar from '@/components/ui/FilterBar'
import PeriodPicker from '@/components/ui/PeriodPicker'
import { getPeriodBounds, UNIT_LABELS, type PeriodUnit } from '@/lib/period'
import { addDays } from '@/lib/delivery'
import DateInput from '@/components/ui/DateInput'
import { baht, bahtShort } from '@/lib/money'

// ─── Types ─────────────────────────────────────────────────
interface Job {
  id: string
  room_no: string
  project_id: string
  revenue_inc_vat: number
  work_start_date: string | null
  work_days: number | null
  actual_deliver_date: string | null
  working_status: string
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
  no_start_date: boolean        // true = ไม่มี work_start_date
  sales_name: string | null
}

// ─── Helpers ───────────────────────────────────────────────
const TODAY = new Date(); TODAY.setHours(0, 0, 0, 0)


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
  work_start_date: string; work_days: string; actual_deliver_date: string
}

function EditDrawer({ entry, onClose, onSaved }: { entry: EditState; onClose: () => void; onSaved: () => void }) {
  const supabase = createClient()
  const [form, setForm] = useState(entry)
  const [saving, setSaving] = useState(false)

  async function save() {
    setSaving(true)
    await supabase.from('jobs').update({
      work_start_date: form.work_start_date || null,
      work_days: form.work_days ? parseInt(form.work_days) : null,
      actual_deliver_date: form.actual_deliver_date || null,
    }).eq('id', form.id)
    setSaving(false)
    onSaved()
    onClose()
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>

      {/* Panel */}
      <div onClick={e => e.stopPropagation()}
        className="modal-panel flex flex-col">

        {/* Drag handle (mobile only) */}
        {/* Header */}
        <div className="flex items-center gap-3 px-5 py-4" style={{ borderBottom: '1px solid var(--divider)' }}>
          <div className="flex-1 min-w-0">
            <p className="font-bold text-base truncate" style={{ color: 'var(--text-1)' }}>{form.room_no}</p>
            <p className="text-sm truncate" style={{ color: 'var(--text-3)' }}>{form.project_name}</p>
          </div>
          <button onClick={onClose}
            className="flex-shrink-0 flex items-center justify-center rounded-full"
            style={{ width: 36, height: 36, background: 'var(--hover-bg)', color: 'var(--text-2)' }}>
            <X size={16} />
          </button>
        </div>

        {/* Fields */}
        <div className="flex-1 overflow-y-auto px-5 py-5 space-y-5">
          <div>
            <label className="field-label mb-2 block">วันเริ่มงาน</label>
            <DateInput value={form.work_start_date}
              onChange={e => setForm(f => ({ ...f, work_start_date: e.target.value }))}
              className="field-input text-base" style={{ minHeight: 44 }} />
            <p className="text-xs mt-1.5" style={{ color: 'var(--text-3)' }}>
              ⚡ อัพเดทอัตโนมัติเมื่อเซลล์บันทึกการชำระงวดเริ่มงาน
            </p>
          </div>
          <div>
            <label className="field-label mb-2 block">จำนวนวันทำงาน</label>
            <input type="number" value={form.work_days} min={1} inputMode="numeric"
              onChange={e => setForm(f => ({ ...f, work_days: e.target.value }))}
              className="field-input text-base" style={{ minHeight: 44 }} />
          </div>
          <div>
            <label className="field-label mb-2 block">วันส่งมอบจริง</label>
            <DateInput value={form.actual_deliver_date}
              onChange={e => setForm(f => ({ ...f, actual_deliver_date: e.target.value }))}
              className="field-input text-base" style={{ minHeight: 44 }} />
          </div>
        </div>

        {/* Save */}
        <div className="px-5 py-4 pb-safe" style={{ borderTop: '1px solid var(--divider)' }}>
          <button onClick={save} disabled={saving}
            className="w-full flex items-center justify-center gap-2 rounded-[11px] font-semibold disabled:opacity-50"
            style={{ background: 'var(--accent)', color: '#fff', minHeight: 48, fontSize: 15 }}>
            <Save size={15} />
            {saving ? 'กำลังบันทึก...' : 'บันทึก'}
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

  function openEdit(entry: RoomEntry) {
    const job = jobs.find(j => j.id === entry.id)
    if (!job) return
    setEditEntry({
      id: job.id,
      room_no: job.room_no,
      project_name: entry.project_name,
      work_start_date: job.work_start_date || '',
      work_days: job.work_days != null ? String(job.work_days) : '45',
      actual_deliver_date: job.actual_deliver_date || '',
    })
  }

  const load = useCallback(async () => {
    setLoading(true)
    const { data } = await supabase
      .from('jobs')
      .select('id, room_no, project_id, revenue_inc_vat, work_start_date, work_days, actual_deliver_date, working_status, projects(name), sales:users!sales_id(name)')
      .neq('working_status', 'ยกเลิก')
      .or('work_start_date.not.is.null,actual_deliver_date.not.is.null')
      .order('project_id')
    setJobs((data as any) || [])
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

  // Build room entries with display_month logic
  const entries: RoomEntry[] = useMemo(() => {
    return jobs.map(j => {
      const no_start_date = !j.work_start_date
      const is_delivered = !!j.actual_deliver_date

      // If no work_start_date: can't calculate expected date
      const expected = no_start_date
        ? (j.actual_deliver_date ?? TODAY.toISOString().slice(0, 10))
        : addDays(j.work_start_date!, j.work_days ?? 45)

      const days_over = (!is_delivered && !no_start_date) ? Math.max(0, daysDiff(expected)) : 0
      const is_overdue = !is_delivered && !no_start_date && expected < TODAY.toISOString().slice(0, 10)

      // Which month does this room appear under?
      const TODAY_ISO = TODAY.toISOString().slice(0, 10)
      let display_date: string
      if (is_delivered) {
        display_date = j.actual_deliver_date!
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
        sales_name: (j.sales as any)?.name || null,
      }
    })
  }, [jobs])

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

  const monthEntries = useMemo(
    () => scoped.filter(e => e.display_date >= bounds.start && e.display_date <= bounds.end),
    [scoped, bounds])

  /** Trend across the periods leading up to the one selected, in the same unit
   *  the picker is set to — twelve months, eight quarters, or every year that
   *  has data. Each column is one period of `scoped`, so the chart and the cards
   *  are always describing the same set of rooms. */
  const trend = useMemo(() => {
    const spans = periodUnit === 'year' ? 4 : periodUnit === 'quarter' ? 8 : 12
    const out: { key: string; label: string; delivered: number; late: number; value: number; current: boolean }[] = []
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
    return Array.from(map.values()).sort((a, b) => a.name.localeCompare(b.name))
  }, [monthEntries])

  // Summary
  const totalRooms = monthEntries.length
  const deliveredRooms = monthEntries.filter(e => e.is_delivered).length
  const overdueRooms = monthEntries.filter(e => e.is_overdue).length
  const noStartRooms = monthEntries.filter(e => e.no_start_date).length
  const totalValue = monthEntries.reduce((s, e) => s + e.revenue, 0)
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
          <PeriodPicker unit={periodUnit} setUnit={setPeriodUnit}
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
          <span className="text-xs ml-auto" style={{ color: 'var(--text-3)' }}>{monthEntries.length} ห้อง</span>
        </FilterBar>

        {/* Summary cards */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="ds-card p-4">
            <p className="text-xs mb-1" style={{ color: 'var(--text-3)' }}>จำนวนห้อง</p>
            <p className="text-kpi-number" style={{ color: 'var(--text-1)' }}>
              {deliveredRooms} <span className="text-sm font-normal" style={{ color: 'var(--text-3)' }}>/ {totalRooms} ห้อง</span>
            </p>
            {deliveredRooms > 0 && <p className="text-micro mt-0.5" style={{ color: 'var(--accent-green)' }}>ส่งมอบแล้ว {Math.round(deliveredRooms / totalRooms * 100)}%</p>}
          </div>
          <div className="ds-card p-4">
            <p className="text-xs mb-1" style={{ color: 'var(--text-3)' }}>มูลค่างาน</p>
            <p className="text-kpi-money" style={{ color: 'var(--accent)' }}>{f(deliveredValue)}</p>
            <p className="text-micro mt-0.5" style={{ color: 'var(--text-3)' }}>/ {f(totalValue)}</p>
          </div>
          {overdueRooms > 0 && (
            <div className="ds-card p-4">
              <p className="text-xs mb-1" style={{ color: 'var(--text-3)' }}>หลุดส่งมอบ</p>
              <p className="text-kpi-number" style={{ color: 'var(--accent-red)' }}>{overdueRooms} ห้อง</p>
            </div>
          )}
          {noStartRooms > 0 && (
            <div className="ds-card p-4">
              <p className="text-xs mb-1" style={{ color: 'var(--text-3)' }}>ยังไม่มีวันเริ่มงาน</p>
              <p className="text-kpi-number" style={{ color: 'var(--accent-amber)' }}>{noStartRooms} ห้อง</p>
            </div>
          )}
        </div>

        {/* Trend — same bar-and-tooltip build as the Finance chart, so nothing
            new has to be learned. Column count follows the picker's unit. */}
        <div className="ds-card p-5 mt-4">
          <div className="flex items-center gap-4 mb-4 flex-wrap">
            <h2 className="text-section-title" style={{ color: 'var(--text-1)' }}>
              แนวโน้มการส่งมอบ · {trend.length} {UNIT_LABELS[periodUnit]}ล่าสุด
            </h2>
            <div className="flex gap-4 text-xs">
              {/* One measure, one colour. The bars carry value only now; the
                  room count is a number under each column and the split between
                  delivered and late lives in the tooltip, where it does not have
                  to share a scale with baht. */}
              <span className="flex items-center gap-1.5" style={{ color: 'var(--text-3)' }}>
                <span className="w-3 h-2 rounded-sm inline-block" style={{ background: 'var(--chart-1)' }} />มูลค่าที่ส่งมอบ
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
                  <div style={{ height: '14px', fontSize: '8px', fontWeight: 600, lineHeight: '14px', textAlign: 'center', width: '100%' }}>
                    {t.value > 0 && <span style={{ color: 'var(--chart-1)' }}>{bahtShort(t.value)}</span>}
                  </div>
                  <div className="w-full relative flex items-end justify-center" style={{ height: '104px' }}>
                    <div className="w-full flex flex-col justify-end" style={{ height: '100%' }}>
                      {t.value > 0 && (
                        // A 2% floor so a period that delivered something small
                        // still shows a mark rather than reading as nothing.
                        <div className="rounded-t-sm" style={{
                          height: `${Math.max((t.value / trendMaxValue) * 100, 2)}%`,
                          background: 'var(--chart-1)',
                        }} />
                      )}
                    </div>
                    {rooms > 0 && (
                      <div className="absolute bottom-full mb-1 left-1/2 -translate-x-1/2 opacity-0 group-hover:opacity-100 transition-opacity z-10 text-micro whitespace-nowrap px-2 py-1 rounded-[8px] shadow-lg pointer-events-none"
                        style={{ background: 'var(--panel-bg)', border: '1px solid var(--card-border)', color: 'var(--text-1)' }}>
                        <div style={{ color: 'var(--accent-green)' }}>ส่งมอบ {t.delivered} ห้อง</div>
                        {t.late > 0 && <div style={{ color: 'var(--accent-red)' }}>หลุดกำหนด {t.late} ห้อง</div>}
                        {t.value > 0 && <div style={{ color: 'var(--chart-1)' }}>{bahtShort(t.value)}</div>}
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
            แท่ง = มูลค่าที่ส่งมอบ · ตัวเลขใต้แท่ง = จำนวนห้อง — บางช่วงห้องน้อยแต่มูลค่าสูงมาก (งาน RPT ก้อนใหญ่) ความสูงของแท่งจึงไม่ได้แปรตามจำนวนห้อง
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
      </div>
    </div>
  )
}

