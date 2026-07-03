'use client'

import { useEffect, useState, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { CheckCircle2, Clock, Truck, AlertTriangle, Paperclip, X, Plus, Search, LayoutGrid } from 'lucide-react'
import { PageError } from '@/components/ui/StateUI'

// ─── Types ────────────────────────────────────────────────
type WorkStatus = 'in_progress' | 'ready_to_deliver' | 'delivered'

interface HandoverJob {
  // from jobs
  jobId: string
  customerId: string | null
  projectId: string
  projectName: string
  roomNo: string
  customerName: string
  salesName: string
  clientType: 'B2C' | 'B2B'
  revenueIncVat: number
  workDays: number | null
  workStartDate: string | null
  workEndDate: string | null
  // from handover record (may not exist yet)
  handoverId: string | null
  workStatus: WorkStatus
  deliveryDate: string | null
  deliveryFileUrl: string | null
  commissionTriggered: boolean
  // computed
  daysOverdue: number
  lastInstallmentPaid: boolean
  hasDeliveryFile: boolean
}

// ─── Helpers ──────────────────────────────────────────────
const today = new Date()
today.setHours(0, 0, 0, 0)

function addDays(dateStr: string, days: number): string {
  const d = new Date(dateStr)
  d.setDate(d.getDate() + days)
  return d.toISOString().slice(0, 10)
}

function daysDiff(from: string): number {
  const d = new Date(from)
  d.setHours(0, 0, 0, 0)
  return Math.floor((today.getTime() - d.getTime()) / 86400000)
}

const fmtDate = (d: string | null) => d ? new Date(d).toLocaleDateString('th-TH', { day: '2-digit', month: 'short', year: '2-digit' }) : '—'
const fmtBaht = (n: number) => n ? '฿' + n.toLocaleString('th-TH') : '—'

const STATUS_CONFIG: Record<WorkStatus, { label: string; colorVar: string; bgStyle: React.CSSProperties; icon: React.ReactNode }> = {
  in_progress:      { label: 'กำลังดำเนินการ',    colorVar: 'var(--accent-orange)', bgStyle: { background: 'rgba(234,88,12,0.10)',  border: '1px solid rgba(234,88,12,0.20)' },  icon: <Clock size={14} style={{ color: 'var(--accent-orange)' }} /> },
  ready_to_deliver: { label: 'งานเสร็จ รอส่งมอบ', colorVar: 'var(--accent-blue)',   bgStyle: { background: 'rgba(37,99,235,0.10)',  border: '1px solid rgba(37,99,235,0.20)' },  icon: <CheckCircle2 size={14} style={{ color: 'var(--accent-blue)' }} /> },
  delivered:        { label: 'ส่งมอบแล้ว',         colorVar: 'var(--accent-green)',  bgStyle: { background: 'rgba(5,150,105,0.10)', border: '1px solid rgba(5,150,105,0.20)' },  icon: <Truck size={14} style={{ color: 'var(--accent-green)' }} /> },
}

// ─── Period Helper ─────────────────────────────────────────
type HPeriod = 'week' | 'month' | 'quarter' | 'year'
const ld = (d: Date) => `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`
function getHPeriodRange(p: HPeriod): { start: string; end: string; label: string } {
  const now = new Date()
  const y = now.getFullYear(), m = now.getMonth(), dw = now.getDay()
  if (p === 'week') {
    const mon = new Date(now); mon.setDate(now.getDate() - ((dw + 6) % 7)); mon.setHours(0,0,0,0)
    const sun = new Date(mon); sun.setDate(mon.getDate() + 6)
    return { start: ld(mon), end: ld(sun), label: 'สัปดาห์นี้' }
  }
  if (p === 'month') {
    const start = new Date(y, m, 1); const end = new Date(y, m+1, 0)
    return { start: ld(start), end: ld(end), label: 'เดือนนี้' }
  }
  if (p === 'quarter') {
    const q = Math.floor(m / 3)
    const start = new Date(y, q*3, 1); const end = new Date(y, q*3+3, 0)
    return { start: ld(start), end: ld(end), label: `Q${q+1}` }
  }
  return { start: `${y}-01-01`, end: `${y}-12-31`, label: `ปี ${y+543}` }
}
const fmtBahtH = (n: number) => n ? '฿' + n.toLocaleString('th-TH') : '฿0'

// ─── Delivery Modal ────────────────────────────────────────
function DeliveryModal({
  job, open, onClose, onSaved
}: {
  job: HandoverJob | null; open: boolean; onClose: () => void; onSaved: () => void
}) {
  const supabase = createClient()
  const [deliveryDate, setDeliveryDate] = useState(ld(new Date()))
  const [fileUrls, setFileUrls] = useState<string[]>([''])
  const [saving, setSaving] = useState(false)

  function addUrl() { if (fileUrls.length < 5) setFileUrls([...fileUrls, '']) }
  function removeUrl(i: number) { setFileUrls(fileUrls.filter((_, idx) => idx !== i)) }
  function updateUrl(i: number, v: string) { const n = [...fileUrls]; n[i] = v; setFileUrls(n) }

  async function save() {
    if (!job) return
    setSaving(true)
    const mainUrl = fileUrls.find(u => u.trim()) || null

    if (job.handoverId) {
      await supabase.from('handovers').update({
        work_status: 'delivered',
        delivery_date: deliveryDate,
        delivery_file_url: mainUrl,
        commission_triggered: true,
        handover_date: deliveryDate,
      }).eq('id', job.handoverId)
    } else {
      const newId = `HOV-${job.jobId}`
      await supabase.from('handovers').insert({
        id: newId,
        customer_id: job.customerId,
        project_id: job.projectId,
        room: job.roomNo,
        job_id: job.jobId,
        work_status: 'delivered',
        delivery_date: deliveryDate,
        delivery_file_url: mainUrl,
        commission_triggered: true,
        handover_date: deliveryDate,
        status: 'completed',
      })
    }

    // Update job working_status + actual_deliver_date (keeps Revenue/Dashboard in sync)
    await supabase.from('jobs').update({ working_status: 'ส่งมอบแล้ว', actual_deliver_date: deliveryDate }).eq('id', job.jobId)

    setSaving(false)
    onSaved()
    onClose()
  }

  if (!open || !job) return null

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4" onClick={onClose}>
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
      <div className="relative w-full max-w-md rounded-[18px] shadow-2xl" style={{ background: 'var(--card-bg)', border: '1px solid var(--card-border)' }} onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between p-5" style={{ borderBottom: '1px solid var(--divider)' }}>
          <div>
            <h3 className="font-semibold" style={{ color: 'var(--text-1)' }}>บันทึกส่งมอบงาน</h3>
            <p className="text-xs mt-0.5" style={{ color: 'var(--text-2)' }}>{job.customerName} · {job.roomNo}</p>
          </div>
          <button onClick={onClose} style={{ color: 'var(--text-2)' }}><X size={18} /></button>
        </div>
        <div className="p-5 space-y-4">
          <div>
            <label className="text-xs mb-1.5 block" style={{ color: 'var(--text-2)' }}>วันที่ส่งมอบจริง</label>
            <input type="date" value={deliveryDate} onChange={e => setDeliveryDate(e.target.value)}
              className="w-full rounded-[8px] px-3 py-2 text-sm focus:outline-none"
              style={{ background: 'var(--input-bg)', border: '1px solid var(--divider)', color: 'var(--text-1)' }} />
          </div>
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-xs" style={{ color: 'var(--text-2)' }}>แนบใบส่งมอบที่ลูกค้าเซ็น (Google Drive URL)</label>
              {fileUrls.length < 5 && (
                <button onClick={addUrl} className="text-xs text-accent-blue flex items-center gap-1"><Plus size={12} />เพิ่ม</button>
              )}
            </div>
            <div className="space-y-2">
              {fileUrls.map((url, i) => (
                <div key={i} className="flex gap-2">
                  <input value={url} onChange={e => updateUrl(i, e.target.value)}
                    placeholder="https://drive.google.com/..."
                    className="flex-1 rounded-[8px] px-3 py-2 text-xs focus:outline-none"
                    style={{ background: 'var(--input-bg)', border: '1px solid var(--divider)', color: 'var(--text-1)' }} />
                  {fileUrls.length > 1 && (
                    <button onClick={() => removeUrl(i)} className="hover:text-red-400 p-2" style={{ color: 'var(--text-3)' }}><X size={14} /></button>
                  )}
                </div>
              ))}
            </div>
            <p className="text-[10px] mt-1" style={{ color: 'var(--text-3)' }}>รองรับ jpg, pdf — ไม่เกิน 5 ไฟล์</p>
          </div>
          <div className="bg-indigo-500/10 border border-indigo-500/20 rounded-[11px] p-3">
            <p className="text-indigo-600 dark:text-indigo-300 text-xs">⚡ เมื่อบันทึกส่งมอบแล้ว — Commission จะถูก trigger อัตโนมัติ</p>
          </div>
        </div>
        <div className="flex justify-end gap-3 p-5" style={{ borderTop: '1px solid var(--divider)' }}>
          <button onClick={onClose} className="px-4 py-2 text-sm" style={{ color: 'var(--text-2)' }}>ยกเลิก</button>
          <button onClick={save} disabled={saving}
            className="px-5 py-2 btn-green disabled:opacity-40 text-white text-sm rounded-xl font-medium">
            {saving ? 'กำลังบันทึก...' : 'ยืนยันส่งมอบ'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Project Summary Modal ─────────────────────────────────
function ProjectSummaryModal({ jobs, open, onClose }: { jobs: HandoverJob[]; open: boolean; onClose: () => void }) {
  const [selectedProject, setSelectedProject] = useState<string | null>(null)

  if (!open) return null

  // group by project
  const byProject: Record<string, HandoverJob[]> = {}
  jobs.forEach(j => {
    const k = j.projectName || 'ไม่ระบุโครงการ'
    if (!byProject[k]) byProject[k] = []
    byProject[k].push(j)
  })
  const projects = Object.entries(byProject).sort((a, b) => a[0].localeCompare(b[0], 'th'))
  const active = selectedProject ?? projects[0]?.[0] ?? null
  const activeJobs = active ? (byProject[active] || []) : []

  const countByStatus = (s: WorkStatus) => activeJobs.filter(j => j.workStatus === s).length
  const total = activeJobs.length
  const inProg = countByStatus('in_progress')
  const ready = countByStatus('ready_to_deliver')
  const done = countByStatus('delivered')

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
      <div className="relative w-full max-w-2xl rounded-[18px] shadow-2xl flex flex-col max-h-[85vh]"
        style={{ background: 'var(--card-bg)', border: '1px solid var(--card-border)' }}
        onClick={e => e.stopPropagation()}>

        {/* Modal header */}
        <div className="flex items-center justify-between p-5" style={{ borderBottom: '1px solid var(--divider)' }}>
          <h3 className="font-semibold" style={{ color: 'var(--text-1)' }}>สรุปโครงการ</h3>
          <button onClick={onClose} style={{ color: 'var(--text-2)' }}><X size={18} /></button>
        </div>

        <div className="flex flex-1 min-h-0">
          {/* Left: project list */}
          <div className="w-44 flex-shrink-0 overflow-y-auto" style={{ borderRight: '1px solid var(--divider)' }}>
            {projects.map(([name, pjobs]) => {
              const pdone = pjobs.filter(j => j.workStatus === 'delivered').length
              const isActive = active === name
              return (
                <button key={name} onClick={() => setSelectedProject(name)}
                  className="w-full text-left px-4 py-3 transition-colors"
                  style={{ background: isActive ? 'var(--active-bg)' : 'transparent', borderBottom: '1px solid var(--divider)' }}>
                  <p className="text-xs font-semibold truncate" style={{ color: isActive ? 'var(--accent)' : 'var(--text-1)' }}>{name}</p>
                  <p className="text-[10px] mt-0.5" style={{ color: 'var(--text-3)' }}>{pdone}/{pjobs.length} ส่งมอบ</p>
                  {/* mini progress */}
                  <div className="h-1 rounded-full mt-1.5" style={{ background: 'var(--divider)' }}>
                    <div className="h-full rounded-full" style={{ width: `${pjobs.length > 0 ? (pdone / pjobs.length) * 100 : 0}%`, background: '#4ade80', transition: 'width 0.3s' }} />
                  </div>
                </button>
              )
            })}
          </div>

          {/* Right: project detail */}
          <div className="flex-1 overflow-y-auto p-5 space-y-4">
            {active && (
              <>
                {/* Progress summary */}
                <div className="grid grid-cols-3 gap-3">
                  {[
                    { label: 'กำลังดำเนินการ', count: inProg, color: '#fbbf24' },
                    { label: 'รอส่งมอบ', count: ready, color: '#60a5fa' },
                    { label: 'ส่งมอบแล้ว', count: done, color: '#4ade80' },
                  ].map(k => (
                    <div key={k.label} className="rounded-[11px] p-3 text-center" style={{ background: 'var(--hover-bg)' }}>
                      <p className="text-kpi-number" style={{ color: k.color }}>{k.count}</p>
                      <p className="text-[10px] mt-0.5" style={{ color: 'var(--text-3)' }}>{k.label}</p>
                    </div>
                  ))}
                </div>

                {/* Progress bar */}
                {total > 0 && (
                  <div>
                    <div className="flex h-2.5 rounded-full overflow-hidden gap-px" style={{ background: 'var(--divider)' }}>
                      <div style={{ width: `${(done / total) * 100}%`, background: '#4ade80' }} />
                      <div style={{ width: `${(ready / total) * 100}%`, background: '#60a5fa' }} />
                      <div style={{ width: `${(inProg / total) * 100}%`, background: '#fbbf24' }} />
                    </div>
                    <p className="text-[10px] mt-1 text-right" style={{ color: 'var(--text-3)' }}>
                      ส่งมอบแล้ว {done}/{total} ห้อง ({total > 0 ? Math.round(done / total * 100) : 0}%)
                    </p>
                  </div>
                )}

                {/* Room list */}
                <div className="space-y-1.5">
                  {activeJobs.sort((a, b) => a.roomNo.localeCompare(b.roomNo, 'th')).map(j => {
                    const cfg = STATUS_CONFIG[j.workStatus]
                    return (
                      <div key={j.jobId} className="flex items-center justify-between rounded-[11px] px-3 py-2.5"
                        style={{ background: 'var(--hover-bg)', border: j.workStatus === 'delivered' ? '1px solid rgba(74,222,128,0.2)' : '1px solid transparent' }}>
                        <div className="flex items-center gap-2.5">
                          <span className="p-1 rounded-lg" style={cfg.bgStyle}>{cfg.icon}</span>
                          <div>
                            <p className="text-sm font-semibold" style={{ color: 'var(--text-1)' }}>{j.customerName}</p>
                            <p className="text-[11px]" style={{ color: 'var(--text-3)' }}>ห้อง {j.roomNo}</p>
                          </div>
                        </div>
                        <div className="text-right">
                          <span className="text-[10px] font-semibold" style={{ color: cfg.colorVar }}>{cfg.label}</span>
                          {j.deliveryDate && (
                            <p className="text-[10px] mt-0.5" style={{ color: 'var(--text-3)' }}>ส่ง {fmtDate(j.deliveryDate)}</p>
                          )}
                          {j.daysOverdue > 0 && j.workStatus !== 'delivered' && (
                            <p className="text-[10px] text-red-400">เกิน {j.daysOverdue} วัน</p>
                          )}
                        </div>
                      </div>
                    )
                  })}
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

// ─── Main Page ─────────────────────────────────────────────
export default function HandoverPage() {
  const supabase = createClient()
  const [jobs, setJobs] = useState<HandoverJob[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [filterStatus, setFilterStatus] = useState<WorkStatus | 'all'>('all')
  const [filterProject, setFilterProject] = useState('')
  const [filterSales, setFilterSales] = useState('')
  const [deliveryTarget, setDeliveryTarget] = useState<HandoverJob | null>(null)
  const [hPeriod, setHPeriod] = useState<HPeriod>('month')
  const [fetchError, setFetchError] = useState('')
  const [projectSummaryOpen, setProjectSummaryOpen] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    setFetchError('')

    const { data: jobsData, error: e1 } = await supabase
      .from('jobs')
      .select('*, projects:project_id(name), sales:sales_id(name)')
      .not('working_status', 'eq', 'ยกเลิก')
      .order('order_date', { ascending: false })

    if (e1) { setFetchError(e1.message); setLoading(false); return }
    const jobIds = (jobsData || []).map((j: any) => j.id)

    // Handover records for these jobs
    const { data: handoverData } = await supabase
      .from('handovers')
      .select('*')
      .in('job_id', jobIds.length > 0 ? jobIds : ['__none__'])

    // Final payments status per job
    const { data: paymentsData } = await supabase
      .from('payments')
      .select('job_id, status, is_final')
      .in('job_id', jobIds.length > 0 ? jobIds : ['__none__'])
      .eq('is_final', true)

    const handoverMap = new Map<string, any>()
    for (const h of (handoverData || [])) {
      if (h.job_id) handoverMap.set(h.job_id, h)
    }

    const finalPayMap = new Map<string, boolean>()
    for (const p of (paymentsData || [])) {
      if (p.job_id) finalPayMap.set(p.job_id, p.status === 'paid')
    }

    const mapped: HandoverJob[] = (jobsData || []).map((j: any) => {
      const hov = handoverMap.get(j.id)
      const workEndDate = j.work_start_date && j.work_days
        ? addDays(j.work_start_date, j.work_days)
        : null
      const overdue = workEndDate ? Math.max(0, daysDiff(workEndDate)) : 0

      const workStatus: WorkStatus = hov?.work_status ||
        (j.working_status === 'ส่งมอบแล้ว' ? 'delivered' : 'in_progress')
      const lastInstallmentPaid = finalPayMap.get(j.id) || false

      return {
        jobId: j.id,
        customerId: j.customer_id,
        projectId: j.project_id,
        projectName: j.projects?.name || '—',
        roomNo: j.room_no,
        customerName: j.customer_name || '—',
        salesName: j.sales?.name || '—',
        clientType: j.customer_type || 'B2C',
        revenueIncVat: j.revenue_inc_vat || j.revenue_ex_vat || 0,
        workDays: j.work_days,
        workStartDate: j.work_start_date,
        workEndDate,
        handoverId: hov?.id || null,
        workStatus,
        deliveryDate: hov?.delivery_date || j.actual_deliver_date || null,
        deliveryFileUrl: hov?.delivery_file_url || null,
        commissionTriggered: hov?.commission_triggered || false,
        daysOverdue: overdue,
        lastInstallmentPaid,
        hasDeliveryFile: !!(hov?.delivery_file_url),
      }
    })

    setJobs(mapped)
    setLoading(false)
  }, [supabase])

  useEffect(() => { load() }, [load])

  async function updateStatus(job: HandoverJob, status: WorkStatus) {
    if (status === 'delivered') {
      // Check conditions
      if (!job.lastInstallmentPaid) {
        alert('ยังไม่ได้เก็บเงินงวดสุดท้าย — กรุณาบันทึกในหน้าสถานะการชำระเงินก่อน')
        return
      }
      setDeliveryTarget(job)
      return
    }

    if (job.handoverId) {
      await supabase.from('handovers').update({ work_status: status }).eq('id', job.handoverId)
    } else {
      await supabase.from('handovers').insert({
        id: `HOV-${job.jobId}`,
        customer_id: job.customerId,
        project_id: job.projectId,
        room: job.roomNo,
        job_id: job.jobId,
        work_status: status,
        status: 'scheduled',
      })
    }
    await load()
  }

  const projectOptions = Array.from(new Set(jobs.map(j => j.projectName).filter(Boolean))).sort()
  const salesOptions = Array.from(new Set(jobs.map(j => j.salesName).filter(Boolean))).sort()

  const filtered = jobs.filter(j => {
    if (filterStatus !== 'all' && j.workStatus !== filterStatus) return false
    if (filterProject && j.projectName !== filterProject) return false
    if (filterSales && j.salesName !== filterSales) return false
    if (!search) return true
    const q = search.toLowerCase()
    return j.customerName.toLowerCase().includes(q) ||
      j.roomNo.toLowerCase().includes(q) ||
      j.projectName.toLowerCase().includes(q)
  })

  // Summary
  const inProgress = jobs.filter(j => j.workStatus === 'in_progress').length
  const ready = jobs.filter(j => j.workStatus === 'ready_to_deliver').length
  const delivered = jobs.filter(j => j.workStatus === 'delivered').length
  const overdue = jobs.filter(j => j.workStatus !== 'delivered' && j.daysOverdue > 0).length

  const STATUS_FILTERS: { key: WorkStatus | 'all'; label: string; count: number }[] = [
    { key: 'all',             label: 'ทั้งหมด',           count: jobs.length },
    { key: 'in_progress',     label: 'กำลังดำเนินการ',     count: inProgress },
    { key: 'ready_to_deliver',label: 'งานเสร็จ รอส่งมอบ',  count: ready },
    { key: 'delivered',       label: 'ส่งมอบแล้ว',          count: delivered },
  ]

  return (
    <div className="p-4 md:p-6">
      {/* Header */}
      <div className="flex items-start justify-between mb-5">
        <div>
          <h1 className="text-page-title" style={{ color: 'var(--text-1)' }}>Handover</h1>
          <p className="text-sm mt-0.5" style={{ color: 'var(--text-2)' }}>ติดตามงาน · วันส่งมอบ · Commission</p>
        </div>
        <button onClick={() => setProjectSummaryOpen(true)}
          className="flex items-center gap-2 px-4 py-2 rounded-full text-sm font-semibold text-white"
          style={{ background: 'var(--accent)' }}>
          <LayoutGrid size={15} />สรุปโครงการ
        </button>
      </div>

      {/* KPI bar */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-5">
        {[
          { label: 'กำลังดำเนินการ', value: inProgress, colorVar: 'var(--accent-orange)' },
          { label: 'งานเสร็จ รอส่งมอบ', value: ready, colorVar: 'var(--accent-blue)' },
          { label: 'ส่งมอบแล้ว', value: delivered, colorVar: 'var(--accent-green)' },
          { label: 'เกินกำหนด', value: overdue, colorVar: 'var(--accent-red)' },
        ].map(k => (
          <div key={k.label} className="rounded-[18px] p-3" style={{ background: 'var(--card-bg)', border: '1px solid var(--card-border)' }}>
            <p className="text-card-title mb-1" style={{ color: 'var(--text-3)' }}>{k.label}</p>
            <p className="text-kpi-number" style={{ color: k.colorVar }}>{k.value}</p>
          </div>
        ))}
      </div>

      {/* Period Revenue Panel */}
      {(() => {
        const { start, end, label } = getHPeriodRange(hPeriod)
        const todayStr = new Date().toISOString().slice(0,10)
        // Expected: jobs whose workEndDate is in period (not yet delivered)
        const expected = jobs.filter(j => j.workStatus !== 'delivered' && j.workEndDate && j.workEndDate >= start && j.workEndDate <= end)
        // Delivered: jobs actually delivered in period
        const deliveredInPeriod = jobs.filter(j => j.workStatus === 'delivered' && j.deliveryDate && j.deliveryDate >= start && j.deliveryDate <= end)
        // Overdue rolling: workEndDate already past, not delivered yet — show in current period
        const overdueRolling = jobs.filter(j => j.workStatus !== 'delivered' && j.workEndDate && j.workEndDate < todayStr)

        const expectedRev = expected.reduce((s, j) => s + j.revenueIncVat, 0)
        const deliveredRev = deliveredInPeriod.reduce((s, j) => s + j.revenueIncVat, 0)
        const overdueRev = overdueRolling.reduce((s, j) => s + j.revenueIncVat, 0)

        return (
          <div className="mb-5 rounded-[18px] p-4" style={{ background: 'var(--card-bg)', border: '1px solid var(--card-border)' }}>
            {/* Period pills */}
            <div className="flex items-center gap-2 mb-4 flex-wrap">
              <span className="text-xs font-semibold" style={{ color: 'var(--text-2)' }}>รายได้ตามช่วงเวลา:</span>
              {(['week','month','quarter','year'] as HPeriod[]).map(p => (
                <button key={p} onClick={() => setHPeriod(p)}
                  className="px-3 py-1 rounded-full text-xs font-semibold transition-colors"
                  style={{ background: hPeriod === p ? '#6366f1' : 'rgba(255,255,255,0.05)', color: hPeriod === p ? '#fff' : 'var(--text-2)', border: `1px solid ${hPeriod === p ? '#6366f1' : 'var(--divider)'}` }}>
                  {p === 'week' ? 'สัปดาห์' : p === 'month' ? 'เดือน' : p === 'quarter' ? 'ไตรมาส' : 'ปี'}
                </button>
              ))}
              <span className="text-xs ml-1" style={{ color: 'var(--text-3)' }}>{label}</span>
            </div>
            <div className="grid grid-cols-3 gap-3">
              <div className="rounded-[11px] p-3" style={{ background: 'var(--hover-bg)' }}>
                <p className="text-[10px] mb-1" style={{ color: 'var(--text-3)' }}>คาดว่าจะส่งมอบ</p>
                <p className="font-bold text-base" style={{ color: 'var(--accent-blue)' }}>{fmtBahtH(expectedRev)}</p>
                <p className="text-[10px]" style={{ color: 'var(--text-3)' }}>{expected.length} ห้อง</p>
              </div>
              <div className="rounded-[11px] p-3" style={{ background: 'var(--hover-bg)' }}>
                <p className="text-[10px] mb-1" style={{ color: 'var(--text-3)' }}>ส่งมอบแล้ว</p>
                <p className="font-bold text-base" style={{ color: 'var(--accent-green)' }}>{fmtBahtH(deliveredRev)}</p>
                <p className="text-[10px]" style={{ color: 'var(--text-3)' }}>{deliveredInPeriod.length} ห้อง</p>
              </div>
              <div className="rounded-[11px] p-3" style={{ background: 'var(--hover-bg)' }}>
                <p className="text-[10px] mb-1" style={{ color: 'var(--text-3)' }}>เกินกำหนด (ทบ)</p>
                <p className="font-bold text-base" style={{ color: 'var(--accent-red)' }}>{fmtBahtH(overdueRev)}</p>
                <p className="text-[10px]" style={{ color: 'var(--text-3)' }}>{overdueRolling.length} ห้อง</p>
              </div>
            </div>
          </div>
        )
      })()}

      {/* Search + Filter */}
      <div className="flex gap-3 mb-4 flex-wrap">
        <div className="relative flex-1 min-w-48">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: 'var(--text-3)' }} />
          <input value={search} onChange={e => setSearch(e.target.value)}
            placeholder="ค้นหาชื่อ, ห้อง, โครงการ..."
            className="w-full rounded-[8px] pl-9 pr-4 py-2.5 text-sm focus:outline-none"
            style={{ background: 'var(--card-bg)', border: '1px solid var(--card-border)', color: 'var(--text-1)' }} />
        </div>
        <select value={filterProject} onChange={e => setFilterProject(e.target.value)}
          className="rounded-[8px] px-3 py-2.5 text-sm focus:outline-none"
          style={{ background: 'var(--card-bg)', border: '1px solid var(--card-border)', color: filterProject ? 'var(--text-1)' : 'var(--text-3)' }}>
          <option value="">ทุกโครงการ</option>
          {projectOptions.map(p => <option key={p} value={p}>{p}</option>)}
        </select>
        <select value={filterSales} onChange={e => setFilterSales(e.target.value)}
          className="rounded-[8px] px-3 py-2.5 text-sm focus:outline-none"
          style={{ background: 'var(--card-bg)', border: '1px solid var(--card-border)', color: filterSales ? 'var(--text-1)' : 'var(--text-3)' }}>
          <option value="">ทุก Sales</option>
          {salesOptions.map(s => <option key={s} value={s}>{s}</option>)}
        </select>
        <div className="flex gap-2 flex-wrap">
          {STATUS_FILTERS.map(f => (
            <button key={f.key} onClick={() => setFilterStatus(f.key)}
              className={`text-xs px-3 py-2 rounded-full border transition-colors ${filterStatus === f.key ? 'bg-indigo-500/20 border-indigo-500/40 text-indigo-700 dark:text-indigo-300' : ''}`}
              style={filterStatus !== f.key ? { background: 'var(--card-bg)', border: '1px solid var(--card-border)', color: 'var(--text-2)' } : undefined}>
              {f.label} <span className="ml-1 opacity-60">{f.count}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Job cards */}
      {loading && <div className="flex justify-center py-16"><div className="w-7 h-7 rounded-full border-2 border-t-transparent animate-spin" style={{ borderColor: 'var(--accent)', borderTopColor: 'transparent' }} role="status" aria-label="กำลังโหลด" /></div>}
      {!loading && fetchError && <PageError message={fetchError} onRetry={load} />}
      {!loading && filtered.length === 0 && (
        <div className="text-center py-16 rounded-[18px]" style={{ background: 'var(--card-bg)', border: '1px solid var(--card-border)' }}>
          <p style={{ color: 'var(--text-2)' }}>ไม่พบข้อมูล</p>
        </div>
      )}

      <div className="space-y-3">
        {filtered.map(job => {
          const cfg = STATUS_CONFIG[job.workStatus]
          const canDeliver = job.lastInstallmentPaid
          const isOverdue = job.workStatus !== 'delivered' && job.daysOverdue > 0

          return (
            <div key={job.jobId} className={`rounded-[18px] overflow-hidden ${isOverdue && job.workStatus !== 'delivered' ? 'border border-red-500/30' : ''}`}
              style={!(isOverdue && job.workStatus !== 'delivered') ? { background: 'var(--card-bg)', border: '1px solid var(--card-border)' } : { background: 'var(--card-bg)' }}>
              <div className="p-4">
                <div className="flex items-start gap-3">
                  {/* Status icon */}
                  <div className="mt-0.5 p-2 rounded-[8px]" style={cfg.bgStyle}>
                    {cfg.icon}
                  </div>

                  {/* Main info */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap mb-1">
                      <span className="font-semibold" style={{ color: 'var(--text-1)' }}>{job.customerName}</span>
                      <span className="text-accent-blue text-xs font-mono">{job.roomNo}</span>
                      <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded border ${job.clientType === 'B2B' ? 'bg-blue-500/10 text-blue-400 border-blue-500/20' : 'bg-purple-500/10 text-purple-400 border-purple-500/20'}`}>
                        {job.clientType}
                      </span>
                      {isOverdue && (
                        <span className="flex items-center gap-1 text-[10px] text-red-400 bg-red-500/10 border border-red-500/20 px-2 py-0.5 rounded-full">
                          <AlertTriangle size={10} />เกิน {job.daysOverdue} วัน
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-3 text-xs flex-wrap" style={{ color: 'var(--text-2)' }}>
                      <span>{job.projectName}</span>
                      <span>· {job.salesName}</span>
                      <span className="font-semibold" style={{ color: 'var(--text-1)' }}>{fmtBaht(job.revenueIncVat)}</span>
                    </div>

                    {/* Timeline bar */}
                    <div className="mt-3 grid grid-cols-3 gap-2 text-xs">
                      <div className="rounded-lg p-2" style={{ background: 'var(--hover-bg)' }}>
                        <p className="text-[9px] mb-0.5" style={{ color: 'var(--text-3)' }}>วันเริ่มงาน</p>
                        <p className={`font-semibold ${job.workStartDate ? 'text-amber-600 dark:text-amber-300' : ''}`} style={!job.workStartDate ? { color: 'var(--text-3)' } : undefined}>
                          {fmtDate(job.workStartDate)}
                        </p>
                      </div>
                      <div className="rounded-lg p-2" style={{ background: 'var(--hover-bg)' }}>
                        <p className="text-[9px] mb-0.5" style={{ color: 'var(--text-3)' }}>วันครบสัญญา ({job.workDays} วัน)</p>
                        <p className={`font-semibold ${isOverdue ? 'text-red-400' : ''}`} style={!isOverdue && job.workEndDate ? { color: 'var(--text-2)' } : !isOverdue ? { color: 'var(--text-3)' } : undefined}>
                          {fmtDate(job.workEndDate)}
                        </p>
                      </div>
                      <div className="rounded-lg p-2" style={{ background: 'var(--hover-bg)' }}>
                        <p className="text-[9px] mb-0.5" style={{ color: 'var(--text-3)' }}>วันส่งมอบจริง</p>
                        <p className={`font-semibold ${job.deliveryDate ? 'text-green-400' : ''}`} style={!job.deliveryDate ? { color: 'var(--text-3)' } : undefined}>
                          {fmtDate(job.deliveryDate)}
                        </p>
                      </div>
                    </div>
                  </div>

                  {/* Right: status + actions */}
                  <div className="flex-shrink-0 flex flex-col items-end gap-2">
                    <span className="text-xs px-2.5 py-1 rounded-lg font-semibold" style={{ ...cfg.bgStyle, color: cfg.colorVar }}>
                      {cfg.label}
                    </span>

                    {job.deliveryFileUrl && (
                      <a href={job.deliveryFileUrl} target="_blank" rel="noopener noreferrer"
                        className="flex items-center gap-1 text-xs text-accent-blue hover:underline">
                        <Paperclip size={11} />ใบส่งมอบ
                      </a>
                    )}

                    {job.commissionTriggered && (
                      <span className="text-[9px] text-indigo-400 bg-indigo-500/10 px-2 py-0.5 rounded-full border border-indigo-500/20">
                        ⚡ Commission triggered
                      </span>
                    )}
                  </div>
                </div>

                {/* Status toggle buttons */}
                {job.workStatus !== 'delivered' && (
                  <div className="mt-3 pt-3 flex items-center gap-2 flex-wrap" style={{ borderTop: '1px solid var(--divider)' }}>
                    <span className="text-xs" style={{ color: 'var(--text-3)' }}>เปลี่ยนสถานะ:</span>
                    {((['in_progress', 'ready_to_deliver', 'delivered'] as WorkStatus[])).map(s => {
                      const c = STATUS_CONFIG[s]
                      const isActive = job.workStatus === s
                      const isDeliverLocked = s === 'delivered' && !canDeliver
                      return (
                        <button key={s}
                          onClick={() => !isActive && !isDeliverLocked && updateStatus(job, s)}
                          disabled={isActive || isDeliverLocked}
                          title={isDeliverLocked ? 'ยังไม่ได้เก็บเงินงวดสุดท้าย' : undefined}
                          className={`flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg transition-all ${isActive ? 'cursor-default' : isDeliverLocked ? 'cursor-not-allowed opacity-40' : ''}`}
                          style={isActive ? { ...c.bgStyle, color: c.colorVar } : isDeliverLocked ? { background: 'var(--hover-bg)', border: '1px solid var(--divider)', color: 'var(--text-3)' } : { background: 'var(--hover-bg)', border: '1px solid var(--divider)', color: 'var(--text-2)' }}>
                          {c.icon}{c.label}
                          {isDeliverLocked && s === 'delivered' && <span className="text-[9px] opacity-60">(ล็อก)</span>}
                        </button>
                      )
                    })}
                  </div>
                )}
              </div>
            </div>
          )
        })}
      </div>

      <DeliveryModal
        job={deliveryTarget}
        open={!!deliveryTarget}
        onClose={() => setDeliveryTarget(null)}
        onSaved={() => { load(); setDeliveryTarget(null) }}
      />

      <ProjectSummaryModal
        jobs={jobs}
        open={projectSummaryOpen}
        onClose={() => setProjectSummaryOpen(false)}
      />
    </div>
  )
}
