'use client'

import { useEffect, useState, useCallback, useMemo } from 'react'
import { createClient } from '@/lib/supabase/client'
import { ChevronLeft, ChevronRight, CheckCircle2, X, Save } from 'lucide-react'
import { PageSpinner } from '@/components/ui/StateUI'

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
  display_month: string         // YYYY-MM — month this room appears under
  is_delivered: boolean
  is_overdue: boolean
  days_overdue: number          // 0 if not overdue
  no_start_date: boolean        // true = ไม่มี work_start_date
}

// ─── Helpers ───────────────────────────────────────────────
const TODAY = new Date(); TODAY.setHours(0, 0, 0, 0)
const THIS_MONTH = TODAY.toISOString().slice(0, 7)

function addDays(d: string, n: number): string {
  const dt = new Date(d); dt.setDate(dt.getDate() + n)
  return dt.toISOString().slice(0, 10)
}

function monthLabel(ym: string): string {
  const [y, m] = ym.split('-').map(Number)
  const thaiMonths = ['ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.', 'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.']
  return `${thaiMonths[m - 1]} ${y + 543}`
}

function prevMonth(ym: string): string {
  const [y, m] = ym.split('-').map(Number)
  return m === 1 ? `${y - 1}-12` : `${y}-${String(m - 1).padStart(2, '0')}`
}

function nextMonth(ym: string): string {
  const [y, m] = ym.split('-').map(Number)
  return m === 12 ? `${y + 1}-01` : `${y}-${String(m + 1).padStart(2, '0')}`
}

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
        style={{ background: 'color-mix(in srgb, #f59e0b 8%, transparent)', border: '1px solid color-mix(in srgb, #f59e0b 30%, transparent)', color: '#f59e0b' }}
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
        <span className="text-[10px] font-normal opacity-60">+{entry.days_overdue}d</span>
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
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center px-4 pb-4 pt-14 lg:pt-4" onClick={onClose}>
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />

      {/* Panel */}
      <div onClick={e => e.stopPropagation()}
        className="relative flex flex-col shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto rounded-[20px]"
        data-panel style={{ background: 'var(--panel-bg)', border: '1px solid var(--card-border)' }}>

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
            <input type="date" value={form.work_start_date}
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
            <input type="date" value={form.actual_deliver_date}
              onChange={e => setForm(f => ({ ...f, actual_deliver_date: e.target.value }))}
              className="field-input text-base" style={{ minHeight: 44 }} />
          </div>
        </div>

        {/* Save */}
        <div className="px-5 py-4 pb-safe" style={{ borderTop: '1px solid var(--divider)' }}>
          <button onClick={save} disabled={saving}
            className="w-full flex items-center justify-center gap-2 rounded-[12px] font-semibold disabled:opacity-50"
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
  const [selectedMonth, setSelectedMonth] = useState(THIS_MONTH)
  const [editEntry, setEditEntry] = useState<EditState | null>(null)

  useEffect(() => {
    const m = new URLSearchParams(window.location.search).get('month')
    if (m) setSelectedMonth(m)
  }, [])

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
      const actual_month = j.actual_deliver_date?.slice(0, 7) ?? null

      // If no work_start_date: can't calculate expected date
      const expected = no_start_date
        ? (j.actual_deliver_date ?? TODAY.toISOString().slice(0, 10))
        : addDays(j.work_start_date!, j.work_days ?? 45)
      const expected_month = expected.slice(0, 7)

      const days_over = (!is_delivered && !no_start_date) ? Math.max(0, daysDiff(expected)) : 0
      const is_overdue = !is_delivered && !no_start_date && expected < TODAY.toISOString().slice(0, 10)

      // Which month does this room appear under?
      let display_month: string
      if (is_delivered) {
        display_month = actual_month!
      } else if (no_start_date) {
        display_month = THIS_MONTH // no start date → always show in current month
      } else if (is_overdue) {
        display_month = THIS_MONTH
      } else {
        display_month = expected_month
      }

      return {
        id: j.id,
        room_no: j.room_no,
        project_id: j.project_id,
        project_name: (j.projects as any)?.name || j.project_id,
        revenue: j.revenue_inc_vat || 0,
        expected_date: expected,
        actual_date: j.actual_deliver_date,
        display_month,
        is_delivered,
        is_overdue,
        days_overdue: days_over,
        no_start_date,
      }
    })
  }, [jobs])

  // Get all available months (sorted desc) for navigation
  // All months with data, sorted descending
  const allMonths = useMemo(() => {
    const set = new Set(entries.map(e => e.display_month))
    set.add(THIS_MONTH)
    return Array.from(set).sort((a, b) => b.localeCompare(a))
  }, [entries])

  // Jump to nearest available month (skips empty months)
  const nearestPrev = useMemo(() => allMonths.find(m => m < selectedMonth) ?? null, [allMonths, selectedMonth])
  const nearestNext = useMemo(() => [...allMonths].reverse().find(m => m > selectedMonth) ?? null, [allMonths, selectedMonth])

  // Filter to selected month
  const monthEntries = useMemo(() => entries.filter(e => e.display_month === selectedMonth), [entries, selectedMonth])

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

  const f = (n: number) => '฿' + n.toLocaleString('th-TH')
  const isThisMonth = selectedMonth === THIS_MONTH

  if (loading) return <PageSpinner />

  return (
    <div className="h-screen flex flex-col" style={{ background: 'var(--page-bg)' }}>
      {editEntry && <EditDrawer entry={editEntry} onClose={() => setEditEntry(null)} onSaved={load} />}

      {/* Header */}
      <div className="flex-shrink-0 px-6 pt-5 pb-4" style={{ borderBottom: '1px solid var(--divider)' }}>
        <div className="flex items-center gap-4 mb-4">
          <h1 className="text-lg font-bold flex-1" style={{ color: 'var(--text-1)' }}>Handover</h1>
          <button onClick={load} className="text-xs px-3 py-1.5 rounded-[8px]"
            style={{ background: 'var(--hover-bg)', color: 'var(--text-2)', border: '1px solid var(--divider)' }}>
            รีเฟรช
          </button>
        </div>

        {/* Month navigator */}
        <div className="flex items-center gap-3 mb-4">
          <button onClick={() => nearestPrev && setSelectedMonth(nearestPrev)} disabled={!nearestPrev}
            className="p-1.5 rounded-[8px] disabled:opacity-30"
            style={{ background: 'var(--hover-bg)', color: 'var(--text-2)' }}>
            <ChevronLeft size={16} />
          </button>
          <div className="flex items-center gap-2">
            <h2 className="text-base font-bold" style={{ color: 'var(--text-1)' }}>{monthLabel(selectedMonth)}</h2>
            {isThisMonth && (
              <span className="text-[10px] px-1.5 py-0.5 rounded-[4px] font-semibold"
                style={{ background: 'rgba(99,102,241,0.12)', border: '1px solid rgba(99,102,241,0.3)', color: 'var(--accent)' }}>เดือนนี้</span>
            )}
          </div>
          <button onClick={() => nearestNext && setSelectedMonth(nearestNext)} disabled={!nearestNext}
            className="p-1.5 rounded-[8px] disabled:opacity-30"
            style={{ background: 'var(--hover-bg)', color: 'var(--text-2)' }}>
            <ChevronRight size={16} />
          </button>
          <button onClick={() => setSelectedMonth(THIS_MONTH)} className="ml-1 text-xs px-3 py-1"
            style={{ color: 'var(--accent)', textDecoration: isThisMonth ? 'none' : 'underline', opacity: isThisMonth ? 0.4 : 1 }}>
            ปัจจุบัน
          </button>
        </div>

        {/* Summary cards */}
        <div className="flex gap-3 flex-wrap">
          {/* Total */}
          <div className="flex items-center gap-3 px-4 py-2.5 rounded-[10px]"
            style={{ background: 'var(--card-bg)', border: '1px solid var(--card-border)' }}>
            <div>
              <p className="text-[10px] uppercase tracking-wider" style={{ color: 'var(--text-3)' }}>จำนวนห้อง</p>
              <p className="text-lg font-bold leading-tight" style={{ color: 'var(--text-1)' }}>
                {deliveredRooms} <span className="text-sm font-normal" style={{ color: 'var(--text-3)' }}>/ {totalRooms} ห้อง</span>
              </p>
              {deliveredRooms > 0 && <p className="text-[10px]" style={{ color: 'var(--accent-green)' }}>ส่งมอบแล้ว {Math.round(deliveredRooms / totalRooms * 100)}%</p>}
            </div>
          </div>
          {/* Value */}
          <div className="flex items-center gap-3 px-4 py-2.5 rounded-[10px]"
            style={{ background: 'var(--card-bg)', border: '1px solid var(--card-border)' }}>
            <div>
              <p className="text-[10px] uppercase tracking-wider" style={{ color: 'var(--text-3)' }}>มูลค่างาน</p>
              <p className="text-base font-bold leading-tight" style={{ color: 'var(--accent)' }}>{f(deliveredValue)}</p>
              <p className="text-[10px]" style={{ color: 'var(--text-3)' }}>/ {f(totalValue)}</p>
            </div>
          </div>
          {/* Overdue */}
          {overdueRooms > 0 && (
            <div className="flex items-center gap-3 px-4 py-2.5 rounded-[10px]"
              style={{ background: 'var(--card-bg)', border: '1px solid var(--card-border)' }}>
              <div>
                <p className="text-[10px] uppercase tracking-wider" style={{ color: 'var(--text-3)' }}>หลุดส่งมอบ</p>
                <p className="text-lg font-bold leading-tight" style={{ color: 'var(--accent-red)' }}>{overdueRooms} ห้อง</p>
              </div>
            </div>
          )}
          {/* No start date */}
          {noStartRooms > 0 && (
            <div className="flex items-center gap-3 px-4 py-2.5 rounded-[10px]"
              style={{ background: 'var(--card-bg)', border: '1px solid var(--card-border)' }}>
              <div>
                <p className="text-[10px] uppercase tracking-wider" style={{ color: 'var(--text-3)' }}>ยังไม่มีวันเริ่มงาน</p>
                <p className="text-lg font-bold leading-tight" style={{ color: '#f59e0b' }}>{noStartRooms} ห้อง</p>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-6">
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
                <div key={name} className="rounded-[14px] overflow-hidden"
                  style={{ background: 'var(--card-bg)', border: '1px solid var(--card-border)' }}>
                  {/* Project header */}
                  <div className="flex items-center gap-3 px-4 py-3" style={{ borderBottom: '1px solid var(--divider)', background: 'var(--hover-bg)' }}>
                    <p className="font-semibold text-sm flex-1" style={{ color: 'var(--text-1)' }}>{name}</p>
                    <div className="flex items-center gap-3">
                      {projOverdue > 0 && (
                        <span className="text-[11px] font-semibold px-1.5 py-0.5 rounded-[4px]"
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
