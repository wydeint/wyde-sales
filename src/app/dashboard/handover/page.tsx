'use client'

import { useEffect, useState, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { CheckCircle2, Clock, Truck, AlertTriangle, Paperclip, X, Plus, Search } from 'lucide-react'

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
  revenueExVat: number
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

const STATUS_CONFIG: Record<WorkStatus, { label: string; color: string; bg: string; icon: React.ReactNode }> = {
  in_progress:      { label: 'กำลังดำเนินการ',     color: 'text-amber-400',  bg: 'bg-amber-500/10 border-amber-500/20',  icon: <Clock size={14} className="text-amber-400" /> },
  ready_to_deliver: { label: 'งานเสร็จ รอส่งมอบ',  color: 'text-blue-400',   bg: 'bg-blue-500/10 border-blue-500/20',    icon: <CheckCircle2 size={14} className="text-blue-400" /> },
  delivered:        { label: 'ส่งมอบแล้ว',          color: 'text-green-400',  bg: 'bg-green-500/10 border-green-500/20',  icon: <Truck size={14} className="text-green-400" /> },
}

// ─── Period Helper ─────────────────────────────────────────
type HPeriod = 'week' | 'month' | 'quarter' | 'year'
function getHPeriodRange(p: HPeriod): { start: string; end: string; label: string } {
  const now = new Date()
  const y = now.getFullYear(), m = now.getMonth(), dw = now.getDay()
  if (p === 'week') {
    const mon = new Date(now); mon.setDate(now.getDate() - ((dw + 6) % 7)); mon.setHours(0,0,0,0)
    const sun = new Date(mon); sun.setDate(mon.getDate() + 6)
    return { start: mon.toISOString().slice(0,10), end: sun.toISOString().slice(0,10), label: 'สัปดาห์นี้' }
  }
  if (p === 'month') {
    const start = new Date(y, m, 1); const end = new Date(y, m+1, 0)
    return { start: start.toISOString().slice(0,10), end: end.toISOString().slice(0,10), label: 'เดือนนี้' }
  }
  if (p === 'quarter') {
    const q = Math.floor(m / 3)
    const start = new Date(y, q*3, 1); const end = new Date(y, q*3+3, 0)
    return { start: start.toISOString().slice(0,10), end: end.toISOString().slice(0,10), label: `Q${q+1}` }
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
  const [deliveryDate, setDeliveryDate] = useState(new Date().toISOString().slice(0, 10))
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

    // Update job working_status
    await supabase.from('jobs').update({ working_status: 'ส่งมอบแล้ว' }).eq('id', job.jobId)

    setSaving(false)
    onSaved()
    onClose()
  }

  if (!open || !job) return null

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4" onClick={onClose}>
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
      <div className="relative w-full max-w-md bg-[#161b22] border border-[#30363d] rounded-2xl shadow-2xl" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between p-5 border-b border-[#21262d]">
          <div>
            <h3 className="text-white font-semibold">บันทึกส่งมอบงาน</h3>
            <p className="text-[#8b949e] text-xs mt-0.5">{job.customerName} · {job.roomNo}</p>
          </div>
          <button onClick={onClose} className="text-[#8b949e] hover:text-white"><X size={18} /></button>
        </div>
        <div className="p-5 space-y-4">
          <div>
            <label className="text-xs text-[#8b949e] mb-1.5 block">วันที่ส่งมอบจริง</label>
            <input type="date" value={deliveryDate} onChange={e => setDeliveryDate(e.target.value)}
              className="w-full bg-[#21262d] border border-[#30363d] rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-[#58a6ff]" />
          </div>
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-xs text-[#8b949e]">แนบใบส่งมอบที่ลูกค้าเซ็น (Google Drive URL)</label>
              {fileUrls.length < 5 && (
                <button onClick={addUrl} className="text-xs text-[#58a6ff] flex items-center gap-1"><Plus size={12} />เพิ่ม</button>
              )}
            </div>
            <div className="space-y-2">
              {fileUrls.map((url, i) => (
                <div key={i} className="flex gap-2">
                  <input value={url} onChange={e => updateUrl(i, e.target.value)}
                    placeholder="https://drive.google.com/..."
                    className="flex-1 bg-[#21262d] border border-[#30363d] rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-[#58a6ff]" />
                  {fileUrls.length > 1 && (
                    <button onClick={() => removeUrl(i)} className="text-[#484f58] hover:text-red-400 p-2"><X size={14} /></button>
                  )}
                </div>
              ))}
            </div>
            <p className="text-[#484f58] text-[10px] mt-1">รองรับ jpg, pdf — ไม่เกิน 5 ไฟล์</p>
          </div>
          <div className="bg-indigo-500/10 border border-indigo-500/20 rounded-xl p-3">
            <p className="text-indigo-300 text-xs">⚡ เมื่อบันทึกส่งมอบแล้ว — Commission จะถูก trigger อัตโนมัติ</p>
          </div>
        </div>
        <div className="flex justify-end gap-3 p-5 border-t border-[#21262d]">
          <button onClick={onClose} className="px-4 py-2 text-[#8b949e] hover:text-white text-sm">ยกเลิก</button>
          <button onClick={save} disabled={saving}
            className="px-5 py-2 bg-[#238636] hover:bg-[#2ea043] disabled:opacity-40 text-white text-sm rounded-xl font-medium">
            {saving ? 'กำลังบันทึก...' : 'ยืนยันส่งมอบ'}
          </button>
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
  const [deliveryTarget, setDeliveryTarget] = useState<HandoverJob | null>(null)
  const [hPeriod, setHPeriod] = useState<HPeriod>('month')

  const load = useCallback(async () => {
    setLoading(true)

    // Jobs that have started work (work_start_date is set)
    const { data: jobsData } = await supabase
      .from('jobs')
      .select('*, projects:project_id(name), sales:sales_id(name)')
      .not('work_start_date', 'is', null)
      .not('working_status', 'eq', 'ยกเลิก')
      .order('work_start_date')

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

      const workStatus: WorkStatus = hov?.work_status || 'in_progress'
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
        revenueExVat: j.revenue_ex_vat || 0,
        workDays: j.work_days,
        workStartDate: j.work_start_date,
        workEndDate,
        handoverId: hov?.id || null,
        workStatus,
        deliveryDate: hov?.delivery_date || null,
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

  const filtered = jobs.filter(j => {
    if (filterStatus !== 'all' && j.workStatus !== filterStatus) return false
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
      <div className="mb-5">
        <h1 className="text-white text-xl font-bold">Handover</h1>
        <p className="text-[#8b949e] text-sm mt-0.5">ติดตามงาน · วันส่งมอบ · Commission</p>
      </div>

      {/* KPI bar */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-5">
        {[
          { label: 'กำลังดำเนินการ', value: inProgress, color: 'text-amber-400' },
          { label: 'งานเสร็จ รอส่งมอบ', value: ready, color: 'text-blue-400' },
          { label: 'ส่งมอบแล้ว', value: delivered, color: 'text-green-400' },
          { label: 'เกินกำหนด', value: overdue, color: 'text-red-400' },
        ].map(k => (
          <div key={k.label} className="bg-[#161b22] border border-[#30363d] rounded-xl p-3">
            <p className="text-[#484f58] text-xs mb-1">{k.label}</p>
            <p className={`text-2xl font-bold ${k.color}`}>{k.value}</p>
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

        const expectedRev = expected.reduce((s, j) => s + j.revenueExVat, 0)
        const deliveredRev = deliveredInPeriod.reduce((s, j) => s + j.revenueExVat, 0)
        const overdueRev = overdueRolling.reduce((s, j) => s + j.revenueExVat, 0)

        return (
          <div className="mb-5 rounded-2xl p-4 bg-[#161b22] border border-[#30363d]">
            {/* Period pills */}
            <div className="flex items-center gap-2 mb-4 flex-wrap">
              <span className="text-[#8b949e] text-xs font-semibold">รายได้ตามช่วงเวลา:</span>
              {(['week','month','quarter','year'] as HPeriod[]).map(p => (
                <button key={p} onClick={() => setHPeriod(p)}
                  className="px-3 py-1 rounded-full text-xs font-semibold transition-colors"
                  style={{ background: hPeriod === p ? '#6366f1' : 'rgba(255,255,255,0.05)', color: hPeriod === p ? '#fff' : '#8b949e', border: `1px solid ${hPeriod === p ? '#6366f1' : '#30363d'}` }}>
                  {p === 'week' ? 'สัปดาห์' : p === 'month' ? 'เดือน' : p === 'quarter' ? 'ไตรมาส' : 'ปี'}
                </button>
              ))}
              <span className="text-[#484f58] text-xs ml-1">{label}</span>
            </div>
            <div className="grid grid-cols-3 gap-3">
              <div className="bg-[#0d1117] rounded-xl p-3">
                <p className="text-[#484f58] text-[10px] mb-1">คาดว่าจะส่งมอบ</p>
                <p className="text-blue-400 font-bold text-base">{fmtBahtH(expectedRev)}</p>
                <p className="text-[#484f58] text-[10px]">{expected.length} ห้อง</p>
              </div>
              <div className="bg-[#0d1117] rounded-xl p-3">
                <p className="text-[#484f58] text-[10px] mb-1">ส่งมอบแล้ว</p>
                <p className="text-green-400 font-bold text-base">{fmtBahtH(deliveredRev)}</p>
                <p className="text-[#484f58] text-[10px]">{deliveredInPeriod.length} ห้อง</p>
              </div>
              <div className="bg-[#0d1117] rounded-xl p-3">
                <p className="text-[#484f58] text-[10px] mb-1">เกินกำหนด (ทบ)</p>
                <p className="text-red-400 font-bold text-base">{fmtBahtH(overdueRev)}</p>
                <p className="text-[#484f58] text-[10px]">{overdueRolling.length} ห้อง</p>
              </div>
            </div>
          </div>
        )
      })()}

      {/* Search + Filter */}
      <div className="flex gap-3 mb-4 flex-wrap">
        <div className="relative flex-1 min-w-48">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#484f58]" />
          <input value={search} onChange={e => setSearch(e.target.value)}
            placeholder="ค้นหาชื่อ, ห้อง, โครงการ..."
            className="w-full bg-[#161b22] border border-[#30363d] rounded-xl pl-9 pr-4 py-2.5 text-sm text-white placeholder-[#484f58] focus:outline-none focus:border-[#58a6ff]" />
        </div>
        <div className="flex gap-2">
          {STATUS_FILTERS.map(f => (
            <button key={f.key} onClick={() => setFilterStatus(f.key)}
              className={`text-xs px-3 py-2 rounded-xl border transition-colors ${filterStatus === f.key ? 'bg-indigo-500/20 border-indigo-500/40 text-indigo-300' : 'bg-[#161b22] border-[#30363d] text-[#8b949e] hover:border-[#484f58]'}`}>
              {f.label} <span className="ml-1 opacity-60">{f.count}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Job cards */}
      {loading && <div className="text-center py-16 text-[#8b949e]">กำลังโหลด...</div>}
      {!loading && filtered.length === 0 && (
        <div className="text-center py-16 bg-[#161b22] border border-[#30363d] rounded-xl">
          <p className="text-[#8b949e]">ไม่พบข้อมูล</p>
        </div>
      )}

      <div className="space-y-3">
        {filtered.map(job => {
          const cfg = STATUS_CONFIG[job.workStatus]
          const canDeliver = job.lastInstallmentPaid
          const isOverdue = job.workStatus !== 'delivered' && job.daysOverdue > 0

          return (
            <div key={job.jobId} className={`bg-[#161b22] border rounded-xl overflow-hidden ${isOverdue && job.workStatus !== 'delivered' ? 'border-red-500/30' : 'border-[#30363d]'}`}>
              <div className="p-4">
                <div className="flex items-start gap-3">
                  {/* Status icon */}
                  <div className={`mt-0.5 p-2 rounded-xl border ${cfg.bg}`}>
                    {cfg.icon}
                  </div>

                  {/* Main info */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap mb-1">
                      <span className="text-white font-semibold">{job.customerName}</span>
                      <span className="text-[#58a6ff] text-xs font-mono">{job.roomNo}</span>
                      <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded border ${job.clientType === 'B2B' ? 'bg-blue-500/10 text-blue-400 border-blue-500/20' : 'bg-purple-500/10 text-purple-400 border-purple-500/20'}`}>
                        {job.clientType}
                      </span>
                      {isOverdue && (
                        <span className="flex items-center gap-1 text-[10px] text-red-400 bg-red-500/10 border border-red-500/20 px-2 py-0.5 rounded-full">
                          <AlertTriangle size={10} />เกิน {job.daysOverdue} วัน
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-3 text-xs text-[#8b949e] flex-wrap">
                      <span>{job.projectName}</span>
                      <span>· {job.salesName}</span>
                      <span className="text-white font-medium">{fmtBaht(job.revenueExVat)}</span>
                    </div>

                    {/* Timeline bar */}
                    <div className="mt-3 grid grid-cols-3 gap-2 text-xs">
                      <div className="bg-[#0d1117] rounded-lg p-2">
                        <p className="text-[#484f58] text-[9px] mb-0.5">วันเริ่มงาน</p>
                        <p className={`font-medium ${job.workStartDate ? 'text-amber-300' : 'text-[#484f58]'}`}>
                          {fmtDate(job.workStartDate)}
                        </p>
                      </div>
                      <div className="bg-[#0d1117] rounded-lg p-2">
                        <p className="text-[#484f58] text-[9px] mb-0.5">วันครบสัญญา ({job.workDays} วัน)</p>
                        <p className={`font-medium ${isOverdue ? 'text-red-400' : job.workEndDate ? 'text-[#c9d1d9]' : 'text-[#484f58]'}`}>
                          {fmtDate(job.workEndDate)}
                        </p>
                      </div>
                      <div className="bg-[#0d1117] rounded-lg p-2">
                        <p className="text-[#484f58] text-[9px] mb-0.5">วันส่งมอบจริง</p>
                        <p className={`font-medium ${job.deliveryDate ? 'text-green-400' : 'text-[#484f58]'}`}>
                          {fmtDate(job.deliveryDate)}
                        </p>
                      </div>
                    </div>
                  </div>

                  {/* Right: status + actions */}
                  <div className="flex-shrink-0 flex flex-col items-end gap-2">
                    <span className={`text-xs px-2.5 py-1 rounded-lg border font-medium ${cfg.bg} ${cfg.color}`}>
                      {cfg.label}
                    </span>

                    {job.deliveryFileUrl && (
                      <a href={job.deliveryFileUrl} target="_blank" rel="noopener noreferrer"
                        className="flex items-center gap-1 text-xs text-[#58a6ff] hover:underline">
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
                  <div className="mt-3 pt-3 border-t border-[#21262d] flex items-center gap-2 flex-wrap">
                    <span className="text-[#484f58] text-xs">เปลี่ยนสถานะ:</span>
                    {((['in_progress', 'ready_to_deliver', 'delivered'] as WorkStatus[])).map(s => {
                      const c = STATUS_CONFIG[s]
                      const isActive = job.workStatus === s
                      const isDeliverLocked = s === 'delivered' && !canDeliver
                      return (
                        <button key={s}
                          onClick={() => !isActive && !isDeliverLocked && updateStatus(job, s)}
                          disabled={isActive || isDeliverLocked}
                          title={isDeliverLocked ? 'ยังไม่ได้เก็บเงินงวดสุดท้าย' : undefined}
                          className={`flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg border transition-all ${
                            isActive
                              ? `${c.bg} ${c.color} cursor-default`
                              : isDeliverLocked
                                ? 'bg-[#21262d] border-[#30363d] text-[#484f58] cursor-not-allowed opacity-40'
                                : `bg-[#21262d] border-[#30363d] text-[#8b949e] hover:${c.bg} hover:${c.color} hover:border-current`
                          }`}>
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
    </div>
  )
}
