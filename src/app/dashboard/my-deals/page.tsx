'use client'

import { useEffect, useState, useCallback, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Search, X, ChevronRight, ChevronDown } from 'lucide-react'

// ─── Types ────────────────────────────────────────────────
interface RoomJob {
  id: string
  room_no: string
  project_id: string
  project_name: string
  customer_name: string
  actual_deliver_date: string | null
  has_plan: boolean
  has_overdue: boolean
  all_paid: boolean
}

// Stage chip style
type ChipStage = 'wait' | 'collect' | 'ready' | 'overdue' | 'done'

function getChipStage(job: RoomJob): ChipStage {
  if (job.actual_deliver_date) return 'done'
  if (job.has_overdue) return 'overdue'
  if (!job.has_plan) return 'wait'
  if (job.all_paid) return 'ready'
  return 'collect'
}

const CHIP_STYLES: Record<ChipStage, { bg: string; color: string; border: string }> = {
  wait:    { bg: '#eeedfe', color: '#3c3489', border: '#afa9ec' },
  collect: { bg: '#faeeda', color: '#633806', border: '#ef9f27' },
  ready:   { bg: '#e6f1fb', color: '#0c447c', border: '#85b7eb' },
  overdue: { bg: '#fcebeb', color: '#501313', border: '#f09595' },
  done:    { bg: '#eaf3de', color: '#173404', border: '#97c459' },
}

const STAGE_LABELS: Record<ChipStage, string> = {
  wait: 'รอเปิดงาน',
  collect: 'กำลังเก็บเงิน',
  ready: 'รอส่งมอบ',
  overdue: 'งวดเกินกำหนด',
  done: 'ส่งมอบแล้ว',
}

function RoomChip({ job, dim }: { job: RoomJob; dim?: boolean }) {
  const router = useRouter()
  const stage = getChipStage(job)
  const s = CHIP_STYLES[stage]
  return (
    <button
      title={`${job.customer_name} — ${STAGE_LABELS[stage]}`}
      onClick={() => router.push(`/dashboard/my-deals/${job.id}`)}
      className="transition-all"
      style={{
        padding: '5px 11px',
        borderRadius: 7,
        fontSize: 12,
        fontWeight: 600,
        background: s.bg,
        color: s.color,
        border: `1.5px solid ${s.border}`,
        opacity: dim ? 0.55 : 1,
        cursor: 'pointer',
        whiteSpace: 'nowrap',
      }}>
      {job.room_no}
    </button>
  )
}

// ─── Main Page ─────────────────────────────────────────────
export default function MyDealsPage() {
  const supabase = createClient()
  const [jobs, setJobs] = useState<RoomJob[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [doneExpanded, setDoneExpanded] = useState<Record<string, boolean>>({})

  const load = useCallback(async () => {
    setLoading(true)
    const { data } = await supabase
      .from('jobs')
      .select('id, room_no, project_id, customer_name, actual_deliver_date, projects(name), installments:payments(status, is_final)')
      .neq('working_status', 'ยกเลิก')
      .order('order_date', { ascending: false })

    if (!data) { setLoading(false); return }

    const mapped: RoomJob[] = (data as any[]).map(r => {
      const insts: { status: string; is_final: boolean }[] = r.installments || []
      return {
        id: r.id,
        room_no: r.room_no || '',
        project_id: r.project_id || '',
        project_name: r.projects?.name || r.project_id || '',
        customer_name: r.customer_name || '',
        actual_deliver_date: r.actual_deliver_date || null,
        has_plan: insts.length > 0,
        has_overdue: insts.some(i => i.status === 'overdue'),
        all_paid: insts.length > 0 && insts.every(i => i.status === 'paid'),
      }
    })
    setJobs(mapped)
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

  // Group by project
  const grouped = useMemo(() => {
    const q = search.toLowerCase().replace(/[-\s]/g, '')
    const visible = q
      ? jobs.filter(j => {
          const room = j.room_no.toLowerCase().replace(/[-\s]/g, '')
          const cust = j.customer_name.toLowerCase()
          const proj = j.project_name.toLowerCase()
          return room.includes(q) || cust.includes(q) || proj.includes(q)
        })
      : jobs

    const map = new Map<string, { name: string; active: RoomJob[]; done: RoomJob[] }>()
    for (const j of visible) {
      if (!map.has(j.project_id)) {
        map.set(j.project_id, { name: j.project_name, active: [], done: [] })
      }
      const grp = map.get(j.project_id)!
      if (j.actual_deliver_date) grp.done.push(j)
      else grp.active.push(j)
    }
    // Sort projects by most active rooms
    return Array.from(map.entries())
      .map(([pid, g]) => ({ pid, ...g }))
      .sort((a, b) => b.active.length - a.active.length)
  }, [jobs, search])

  const totalActive = useMemo(() => jobs.filter(j => !j.actual_deliver_date).length, [jobs])

  return (
    <div className="min-h-screen p-4 md:p-6" style={{ background: 'var(--page-bg)' }}>
      {/* Header */}
      <div className="flex items-center justify-between mb-5 flex-wrap gap-3">
        <div>
          <h1 className="text-xl font-bold" style={{ color: 'var(--text-1)' }}>My Deals</h1>
          {!loading && (
            <p className="text-xs mt-0.5" style={{ color: 'var(--text-3)' }}>
              {totalActive} งานที่กำลังดำเนินการ
            </p>
          )}
        </div>
        <div className="relative">
          <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: 'var(--text-3)' }} />
          <input
            value={search} onChange={e => setSearch(e.target.value)}
            placeholder='ค้นหา "303", "A333"...'
            className="pl-8 pr-8 py-2 rounded-[10px] text-sm focus:outline-none w-48"
            style={{ background: 'var(--input-bg)', border: '1px solid var(--divider)', color: 'var(--text-1)' }} />
          {search && (
            <button className="absolute right-2 top-1/2 -translate-y-1/2" onClick={() => setSearch('')}>
              <X size={12} style={{ color: 'var(--text-3)' }} />
            </button>
          )}
        </div>
      </div>

      {/* Legend */}
      <div className="flex flex-wrap gap-x-4 gap-y-1.5 mb-5">
        {(Object.entries(CHIP_STYLES) as [ChipStage, typeof CHIP_STYLES[ChipStage]][]).map(([stage, s]) => (
          <span key={stage} className="flex items-center gap-1.5 text-xs" style={{ color: 'var(--text-3)' }}>
            <span style={{ width: 8, height: 8, borderRadius: '50%', background: s.border, display: 'inline-block', flexShrink: 0 }} />
            {STAGE_LABELS[stage]}
          </span>
        ))}
      </div>

      {/* Groups */}
      {loading ? (
        <div className="flex items-center justify-center py-20">
          <p className="text-sm" style={{ color: 'var(--text-3)' }}>กำลังโหลด...</p>
        </div>
      ) : grouped.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 gap-2">
          <p className="text-sm" style={{ color: 'var(--text-2)' }}>ไม่พบงาน</p>
        </div>
      ) : (
        <div className="space-y-6 max-w-2xl">
          {grouped.map(({ pid, name, active, done }) => (
            <div key={pid}>
              {/* Project label */}
              <div className="flex items-center gap-2 mb-2.5">
                <span className="text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--text-3)' }}>
                  {name}
                </span>
                <span className="text-xs" style={{ color: 'var(--text-3)' }}>
                  · {active.length} งาน{done.length > 0 ? ` + ${done.length} ส่งมอบแล้ว` : ''}
                </span>
              </div>

              {/* Active rooms */}
              {active.length > 0 && (
                <div className="flex flex-wrap gap-2">
                  {active.map(j => <RoomChip key={j.id} job={j} />)}
                </div>
              )}

              {/* Done rooms collapsible */}
              {done.length > 0 && (
                <div className="mt-2">
                  <button
                    className="flex items-center gap-1.5 text-xs py-1"
                    style={{ color: 'var(--text-3)', background: 'none', border: 'none', cursor: 'pointer' }}
                    onClick={() => setDoneExpanded(prev => ({ ...prev, [pid]: !prev[pid] }))}>
                    {doneExpanded[pid]
                      ? <ChevronDown size={13} />
                      : <ChevronRight size={13} />}
                    ส่งมอบแล้ว {done.length} ห้อง
                  </button>
                  {doneExpanded[pid] && (
                    <div className="flex flex-wrap gap-2 mt-1.5">
                      {done.map(j => <RoomChip key={j.id} job={j} dim />)}
                    </div>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
