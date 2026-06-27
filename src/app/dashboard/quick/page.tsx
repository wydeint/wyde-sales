'use client'

import { useEffect, useState, useCallback, useRef } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import {
  Search, X, Plus, CheckCircle2, ChevronRight, AlertTriangle,
  Settings, Zap, Paperclip
} from 'lucide-react'

// ─── Types ────────────────────────────────────────────────
interface WidgetData {
  inProgressJobs: number
  overdueJobs: number
  pendingInstallments: number
  pendingAmount: number
  readyToDeliver: number
  myRevenue: number
}

interface JobOption { id: string; customerName: string; roomNo: string; projectName: string; salesName: string }
interface InstallmentOption { id: string; name: string; amount: number; jobId: string }
interface EventOption { id: string; eventName: string; projectId: string; projectName: string; eventDate: string }

// ─── Helpers ──────────────────────────────────────────────
const fmtBaht = (n: number) => {
  if (n >= 1000000) return '฿' + (n / 1000000).toFixed(1) + 'M'
  if (n >= 1000) return '฿' + Math.round(n / 1000) + 'k'
  return '฿' + n.toLocaleString()
}
const fmtDate = (d: string | null) =>
  d ? new Date(d).toLocaleDateString('th-TH', { day: '2-digit', month: 'short' }) : '—'

// ─── Bottom Sheet wrapper ──────────────────────────────────
function Sheet({ open, onClose, title, children }: {
  open: boolean; onClose: () => void; title: string; children: React.ReactNode
}) {
  if (!open) return null
  return (
    <div className="fixed inset-0 z-50 flex flex-col justify-end" onClick={onClose}>
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
      <div
        className="relative bg-[#161b22] border-t border-[#30363d] rounded-t-3xl max-h-[85vh] flex flex-col"
        onClick={e => e.stopPropagation()}
      >
        {/* Handle bar */}
        <div className="flex justify-center pt-3 pb-1">
          <div className="w-10 h-1 bg-[#30363d] rounded-full" />
        </div>
        <div className="flex items-center justify-between px-5 py-3 border-b border-[#21262d]">
          <h3 className="text-white font-semibold text-base">{title}</h3>
          <button onClick={onClose} className="text-[#484f58] hover:text-white p-1"><X size={18} /></button>
        </div>
        <div className="overflow-y-auto flex-1 pb-8">{children}</div>
      </div>
    </div>
  )
}

// ─── Quick Pay Sheet ───────────────────────────────────────
function QuickPaySheet({ open, onClose, jobs }: {
  open: boolean; onClose: () => void; jobs: JobOption[]
}) {
  const supabase = createClient()
  const [step, setStep] = useState<'job' | 'installment' | 'confirm'>('job')
  const [search, setSearch] = useState('')
  const [selectedJob, setSelectedJob] = useState<JobOption | null>(null)
  const [installments, setInstallments] = useState<InstallmentOption[]>([])
  const [selectedInst, setSelectedInst] = useState<InstallmentOption | null>(null)
  const [paidDate, setPaidDate] = useState(new Date().toISOString().slice(0, 10))
  const [fileUrls, setFileUrls] = useState<string[]>([''])
  const [saving, setSaving] = useState(false)

  async function selectJob(job: JobOption) {
    setSelectedJob(job)
    const { data } = await supabase.from('payments')
      .select('id, installment_name, amount, is_work_trigger')
      .eq('job_id', job.id)
      .eq('status', 'pending')
      .order('installment_no')
    setInstallments((data || []).map((p: any) => ({
      id: p.id, name: p.installment_name, amount: p.amount, jobId: job.id
    })))
    setStep('installment')
  }

  async function confirmPay() {
    if (!selectedInst) return
    setSaving(true)
    const urls = fileUrls.filter(u => u.trim())
    await supabase.from('payments').update({
      status: 'paid', paid_date: paidDate,
      file_urls: urls.length > 0 ? urls : null,
    }).eq('id', selectedInst.id)
    setSaving(false)
    resetAndClose()
  }

  function resetAndClose() {
    setStep('job'); setSearch(''); setSelectedJob(null)
    setInstallments([]); setSelectedInst(null)
    setFileUrls(['']); onClose()
  }

  const filteredJobs = jobs.filter(j =>
    !search || j.customerName.toLowerCase().includes(search.toLowerCase()) ||
    j.roomNo.toLowerCase().includes(search.toLowerCase()) ||
    j.projectName.toLowerCase().includes(search.toLowerCase())
  )

  return (
    <Sheet open={open} onClose={resetAndClose} title="💰 บันทึกรับเงิน">
      {step === 'job' && (
        <div className="p-4">
          <div className="relative mb-3">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#484f58]" />
            <input autoFocus value={search} onChange={e => setSearch(e.target.value)}
              placeholder="พิมพ์ชื่อลูกค้า / ห้อง / โครงการ..."
              className="w-full bg-[#21262d] border border-[#30363d] rounded-xl pl-9 pr-4 py-3 text-sm text-white placeholder-[#484f58] focus:outline-none focus:border-[#58a6ff]" />
          </div>
          <div className="space-y-2">
            {filteredJobs.slice(0, 12).map(j => (
              <button key={j.id} onClick={() => selectJob(j)}
                className="w-full flex items-center justify-between px-4 py-3.5 bg-[#21262d] hover:bg-[#292e36] rounded-xl transition-colors text-left">
                <div>
                  <p className="text-white font-medium text-sm">{j.customerName}</p>
                  <p className="text-[#8b949e] text-xs mt-0.5">{j.roomNo} · {j.projectName}</p>
                </div>
                <ChevronRight size={16} className="text-[#484f58]" />
              </button>
            ))}
          </div>
        </div>
      )}

      {step === 'installment' && selectedJob && (
        <div className="p-4">
          <button onClick={() => setStep('job')} className="text-[#58a6ff] text-sm mb-4 flex items-center gap-1">
            ← {selectedJob.customerName} · {selectedJob.roomNo}
          </button>
          {installments.length === 0 ? (
            <div className="text-center py-8 text-[#8b949e]">ไม่มีงวดค้างชำระ</div>
          ) : (
            <div className="space-y-2">
              <p className="text-[#8b949e] text-xs mb-3">เลือกงวดที่ต้องการบันทึก</p>
              {installments.map(inst => (
                <button key={inst.id} onClick={() => { setSelectedInst(inst); setStep('confirm') }}
                  className="w-full flex items-center justify-between px-4 py-4 bg-[#21262d] hover:bg-[#292e36] rounded-xl transition-colors">
                  <div className="text-left">
                    <p className="text-white font-medium text-sm">{inst.name}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-emerald-400 font-bold">{fmtBaht(inst.amount)}</p>
                    <ChevronRight size={14} className="text-[#484f58] ml-auto mt-0.5" />
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {step === 'confirm' && selectedInst && selectedJob && (
        <div className="p-4 space-y-4">
          <button onClick={() => setStep('installment')} className="text-[#58a6ff] text-sm flex items-center gap-1">
            ← {selectedInst.name}
          </button>
          <div className="bg-[#0d1117] rounded-2xl p-5 text-center">
            <p className="text-[#8b949e] text-xs mb-1">{selectedJob.customerName} · {selectedJob.roomNo}</p>
            <p className="text-3xl font-bold text-white mb-1">{fmtBaht(selectedInst.amount)}</p>
            <p className="text-[#8b949e] text-xs">{selectedInst.name}</p>
          </div>
          <div>
            <label className="text-xs text-[#8b949e] mb-2 block">วันที่ชำระ</label>
            <input type="date" value={paidDate} onChange={e => setPaidDate(e.target.value)}
              className="w-full bg-[#21262d] border border-[#30363d] rounded-xl px-4 py-3 text-sm text-white focus:outline-none focus:border-[#58a6ff]" />
          </div>
          <div>
            <div className="flex justify-between mb-2">
              <label className="text-xs text-[#8b949e]">Google Drive URL (สลิป/เอกสาร)</label>
              {fileUrls.length < 5 && (
                <button onClick={() => setFileUrls([...fileUrls, ''])} className="text-xs text-[#58a6ff] flex items-center gap-1">
                  <Plus size={11} />เพิ่ม
                </button>
              )}
            </div>
            {fileUrls.map((url, i) => (
              <div key={i} className="flex gap-2 mb-2">
                <input value={url} onChange={e => { const n=[...fileUrls]; n[i]=e.target.value; setFileUrls(n) }}
                  placeholder="https://drive.google.com/..."
                  className="flex-1 bg-[#21262d] border border-[#30363d] rounded-xl px-3 py-2.5 text-xs text-white focus:outline-none focus:border-[#58a6ff]" />
                {fileUrls.length > 1 && (
                  <button onClick={() => setFileUrls(fileUrls.filter((_,idx)=>idx!==i))} className="text-[#484f58] p-2"><X size={13}/></button>
                )}
              </div>
            ))}
            <p className="text-[#484f58] text-[10px]">jpg, pdf — ไม่เกิน 5 ไฟล์</p>
          </div>
          <button onClick={confirmPay} disabled={saving}
            className="w-full py-4 bg-[#238636] hover:bg-[#2ea043] disabled:opacity-40 text-white font-semibold rounded-2xl transition-colors text-base">
            {saving ? 'กำลังบันทึก...' : 'ยืนยันรับเงิน'}
          </button>
        </div>
      )}
    </Sheet>
  )
}

// ─── Quick Lookup Sheet ────────────────────────────────────
function QuickLookupSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const supabase = createClient()
  const [search, setSearch] = useState('')
  const [results, setResults] = useState<any[]>([])
  const [loading, setLoading] = useState(false)
  const timerRef = useRef<ReturnType<typeof setTimeout>>()

  async function doSearch(q: string) {
    if (!q.trim()) { setResults([]); return }
    setLoading(true)
    const { data } = await supabase
      .from('jobs')
      .select('id, customer_name, room_no, working_status, work_start_date, work_days, revenue_ex_vat, projects:project_id(name), sales:sales_id(name)')
      .or(`customer_name.ilike.%${q}%,room_no.ilike.%${q}%`)
      .limit(8)
    setResults(data || [])
    setLoading(false)
  }

  function handleChange(v: string) {
    setSearch(v)
    clearTimeout(timerRef.current)
    timerRef.current = setTimeout(() => doSearch(v), 300)
  }

  function calcEndDate(start: string | null, days: number | null) {
    if (!start || !days) return null
    const d = new Date(start)
    d.setDate(d.getDate() + days)
    return d.toISOString().slice(0, 10)
  }

  function daysOverdue(end: string | null) {
    if (!end) return 0
    const diff = Math.floor((Date.now() - new Date(end).getTime()) / 86400000)
    return Math.max(0, diff)
  }

  return (
    <Sheet open={open} onClose={() => { setSearch(''); setResults([]); onClose() }} title="🔍 ค้นหาลูกค้า">
      <div className="p-4">
        <div className="relative mb-4">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#484f58]" />
          <input autoFocus value={search} onChange={e => handleChange(e.target.value)}
            placeholder="ชื่อลูกค้า / เลขห้อง / โครงการ..."
            className="w-full bg-[#21262d] border border-[#30363d] rounded-xl pl-9 pr-4 py-3 text-base text-white placeholder-[#484f58] focus:outline-none focus:border-[#58a6ff]" />
        </div>
        {loading && <p className="text-center text-[#8b949e] py-4 text-sm">กำลังค้นหา...</p>}
        <div className="space-y-3">
          {results.map((j: any) => {
            const endDate = calcEndDate(j.work_start_date, j.work_days)
            const overdue = daysOverdue(endDate)
            return (
              <div key={j.id} className="bg-[#21262d] rounded-2xl p-4">
                <div className="flex justify-between items-start mb-3">
                  <div>
                    <p className="text-white font-semibold">{j.customer_name}</p>
                    <p className="text-[#8b949e] text-xs mt-0.5">{j.room_no} · {(j.projects as any)?.name}</p>
                  </div>
                  <span className="text-emerald-400 font-bold text-sm">{fmtBaht(j.revenue_ex_vat)}</span>
                </div>
                <div className="grid grid-cols-3 gap-2">
                  <div className="bg-[#161b22] rounded-xl p-2 text-center">
                    <p className="text-[#484f58] text-[9px] mb-0.5">สถานะ</p>
                    <p className="text-xs text-amber-300 font-medium">{j.working_status || '—'}</p>
                  </div>
                  <div className="bg-[#161b22] rounded-xl p-2 text-center">
                    <p className="text-[#484f58] text-[9px] mb-0.5">เริ่มงาน</p>
                    <p className="text-xs text-white">{fmtDate(j.work_start_date)}</p>
                  </div>
                  <div className={`rounded-xl p-2 text-center ${overdue > 0 ? 'bg-red-500/10' : 'bg-[#161b22]'}`}>
                    <p className="text-[#484f58] text-[9px] mb-0.5">ครบสัญญา</p>
                    <p className={`text-xs font-medium ${overdue > 0 ? 'text-red-400' : 'text-white'}`}>
                      {overdue > 0 ? `เกิน ${overdue} วัน` : fmtDate(endDate)}
                    </p>
                  </div>
                </div>
                <p className="text-[#484f58] text-[10px] mt-2">Sales: {(j.sales as any)?.name || '—'}</p>
              </div>
            )
          })}
          {!loading && search && results.length === 0 && (
            <p className="text-center text-[#8b949e] py-6 text-sm">ไม่พบข้อมูล</p>
          )}
        </div>
      </div>
    </Sheet>
  )
}

// ─── Quick Handover Status Sheet ───────────────────────────
function QuickHandoverSheet({ open, onClose, jobs }: {
  open: boolean; onClose: () => void; jobs: JobOption[]
}) {
  const supabase = createClient()
  const [search, setSearch] = useState('')
  const [hovStatus, setHovStatus] = useState<Record<string, string>>({})
  const [saving, setSaving] = useState<string | null>(null)

  const STATUS_OPTIONS = [
    { value: 'in_progress', label: 'กำลังดำเนินการ', color: 'text-amber-400 bg-amber-500/15' },
    { value: 'ready_to_deliver', label: 'งานเสร็จ รอส่งมอบ', color: 'text-blue-400 bg-blue-500/15' },
  ]

  async function updateStatus(jobId: string, status: string) {
    setSaving(jobId)
    const { data: existing } = await supabase.from('handovers').select('id').eq('job_id', jobId).maybeSingle()
    if (existing) {
      await supabase.from('handovers').update({ work_status: status }).eq('job_id', jobId)
    } else {
      await supabase.from('handovers').insert({ id: `HOV-${jobId}`, job_id: jobId, work_status: status, status: 'scheduled' })
    }
    setHovStatus(prev => ({ ...prev, [jobId]: status }))
    setSaving(null)
  }

  const filtered = jobs.filter(j =>
    !search || j.customerName.toLowerCase().includes(search.toLowerCase()) || j.roomNo.toLowerCase().includes(search.toLowerCase())
  )

  return (
    <Sheet open={open} onClose={() => { setSearch(''); onClose() }} title="🏗️ อัปเดตสถานะงาน">
      <div className="p-4">
        <div className="relative mb-3">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#484f58]" />
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="ค้นหา..."
            className="w-full bg-[#21262d] border border-[#30363d] rounded-xl pl-9 pr-4 py-2.5 text-sm text-white placeholder-[#484f58] focus:outline-none focus:border-[#58a6ff]" />
        </div>
        <div className="space-y-2">
          {filtered.slice(0, 10).map(j => (
            <div key={j.id} className="bg-[#21262d] rounded-xl p-3">
              <div className="flex justify-between mb-2">
                <div>
                  <p className="text-white text-sm font-medium">{j.customerName}</p>
                  <p className="text-[#8b949e] text-xs">{j.roomNo} · {j.projectName}</p>
                </div>
                {saving === j.id && <span className="text-[#8b949e] text-xs">บันทึก...</span>}
              </div>
              <div className="flex gap-2">
                {STATUS_OPTIONS.map(s => {
                  const current = hovStatus[j.id]
                  const isActive = current === s.value
                  return (
                    <button key={s.value} onClick={() => updateStatus(j.id, s.value)}
                      className={`flex-1 py-2 rounded-lg text-xs font-medium transition-colors ${isActive ? s.color : 'bg-[#161b22] text-[#8b949e]'}`}>
                      {s.label}
                    </button>
                  )
                })}
              </div>
            </div>
          ))}
        </div>
      </div>
    </Sheet>
  )
}

// ─── Overdue Sheet ─────────────────────────────────────────
function OverdueSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const supabase = createClient()
  const [items, setItems] = useState<any[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!open) return
    async function load() {
      const { data } = await supabase
        .from('jobs')
        .select('id, customer_name, room_no, work_start_date, work_days, projects:project_id(name), sales:sales_id(name)')
        .not('work_start_date', 'is', null)
        .not('working_status', 'eq', 'ส่งมอบแล้ว')
        .not('working_status', 'eq', 'ยกเลิก')
      const today = Date.now()
      const overdue = (data || []).filter((j: any) => {
        if (!j.work_start_date || !j.work_days) return false
        const end = new Date(j.work_start_date)
        end.setDate(end.getDate() + j.work_days)
        return end.getTime() < today
      }).map((j: any) => {
        const end = new Date(j.work_start_date)
        end.setDate(end.getDate() + j.work_days)
        const days = Math.floor((today - end.getTime()) / 86400000)
        return { ...j, daysOverdue: days, endDate: end.toISOString().slice(0, 10) }
      }).sort((a: any, b: any) => b.daysOverdue - a.daysOverdue)
      setItems(overdue)
      setLoading(false)
    }
    load()
  }, [open])

  return (
    <Sheet open={open} onClose={onClose} title="⚠️ งานเกินกำหนด">
      <div className="p-4">
        {loading ? <p className="text-center text-[#8b949e] py-8">กำลังโหลด...</p> : items.length === 0 ? (
          <div className="text-center py-8">
            <CheckCircle2 size={32} className="mx-auto text-green-500/50 mb-3" />
            <p className="text-[#8b949e]">ไม่มีงานเกินกำหนด 🎉</p>
          </div>
        ) : (
          <div className="space-y-2">
            {items.map((j: any) => (
              <div key={j.id} className="bg-red-500/8 border border-red-500/20 rounded-xl p-3">
                <div className="flex justify-between items-start">
                  <div>
                    <p className="text-white font-medium text-sm">{j.customer_name}</p>
                    <p className="text-[#8b949e] text-xs">{j.room_no} · {(j.projects as any)?.name}</p>
                  </div>
                  <span className="text-red-400 font-bold text-sm">เกิน {j.daysOverdue} วัน</span>
                </div>
                <p className="text-[#484f58] text-xs mt-1.5">
                  ครบสัญญา {fmtDate(j.endDate)} · Sales: {(j.sales as any)?.name || '—'}
                </p>
              </div>
            ))}
          </div>
        )}
      </div>
    </Sheet>
  )
}

// ─── Main Quick Page ───────────────────────────────────────
export default function QuickPage() {
  const router = useRouter()
  const supabase = createClient()
  const [widgets, setWidgets] = useState<WidgetData>({ inProgressJobs: 0, overdueJobs: 0, pendingInstallments: 0, pendingAmount: 0, readyToDeliver: 0, myRevenue: 0 })
  const [allJobs, setAllJobs] = useState<JobOption[]>([])
  const [activeEvents, setActiveEvents] = useState<EventOption[]>([])
  const [loading, setLoading] = useState(true)
  const [greeting, setGreeting] = useState('')
  const [openSheet, setOpenSheet] = useState<string | null>(null)

  useEffect(() => {
    const h = new Date().getHours()
    setGreeting(h < 12 ? 'อรุณสวัสดิ์' : h < 17 ? 'สวัสดีตอนบ่าย' : 'สวัสดีตอนเย็น')
  }, [])

  const load = useCallback(async () => {
    setLoading(true)
    const todayStart = new Date(); todayStart.setDate(1); todayStart.setHours(0, 0, 0, 0)

    const [{ data: jobsData }, { data: paymentsData }, { data: handoverData }, { data: eventsData }] = await Promise.all([
      supabase.from('jobs').select('id, customer_name, room_no, work_start_date, work_days, working_status, revenue_ex_vat, projects:project_id(name), sales:sales_id(name)').not('working_status', 'eq', 'ยกเลิก'),
      supabase.from('payments').select('job_id, amount, status').eq('status', 'pending').not('job_id', 'is', null),
      supabase.from('handovers').select('job_id, work_status'),
      supabase.from('events').select('id, event_name, project_id, project_name, event_date').order('event_date', { ascending: false }).limit(5),
    ])

    const todayMs = Date.now()
    const hovMap = new Map<string, string>((handoverData || []).map((h: any) => [h.job_id, h.work_status]))

    let inProgress = 0, overdueJobs = 0, readyToDeliver = 0
    const jobs: JobOption[] = []

    for (const j of (jobsData || []) as any[]) {
      if (j.working_status === 'ส่งมอบแล้ว') continue
      inProgress++
      jobs.push({ id: j.id, customerName: j.customer_name || '—', roomNo: j.room_no || '—', projectName: (j.projects as any)?.name || '—', salesName: (j.sales as any)?.name || '—' })

      if (j.work_start_date && j.work_days) {
        const end = new Date(j.work_start_date)
        end.setDate(end.getDate() + j.work_days)
        if (end.getTime() < todayMs) overdueJobs++
      }
      const hovStatus = hovMap.get(j.id)
      if (hovStatus === 'ready_to_deliver') readyToDeliver++
    }

    const pendingInstallments = (paymentsData || []).length
    const pendingAmount = (paymentsData || []).reduce((s: number, p: any) => s + (p.amount || 0), 0)

    setWidgets({ inProgressJobs: inProgress, overdueJobs, pendingInstallments, pendingAmount, readyToDeliver, myRevenue: 0 })
    setAllJobs(jobs)
    setActiveEvents((eventsData || []).map((e: any) => ({ id: e.id, eventName: e.event_name, projectId: e.project_id, projectName: e.project_name, eventDate: e.event_date })))
    setLoading(false)
  }, [supabase])

  useEffect(() => { load() }, [load])

  const WIDGETS = [
    { label: 'งานกำลังทำ', value: widgets.inProgressJobs, sub: widgets.overdueJobs > 0 ? `${widgets.overdueJobs} เกินกำหนด` : 'ปกติทุกงาน', color: 'text-amber-400', bg: 'bg-amber-500/8 border-amber-500/20' },
    { label: 'งวดรอชำระ', value: widgets.pendingInstallments, sub: fmtBaht(widgets.pendingAmount), color: 'text-blue-400', bg: 'bg-blue-500/8 border-blue-500/20' },
    { label: 'รอส่งมอบ', value: widgets.readyToDeliver, sub: 'งานเสร็จแล้ว', color: 'text-green-400', bg: 'bg-green-500/8 border-green-500/20' },
    { label: 'เกินกำหนด', value: widgets.overdueJobs, sub: 'กด ⚠️ ดูรายละเอียด', color: widgets.overdueJobs > 0 ? 'text-red-400' : 'text-[#484f58]', bg: widgets.overdueJobs > 0 ? 'bg-red-500/8 border-red-500/20' : 'bg-[#161b22] border-[#30363d]' },
  ]

  type ActionKey = 'pay' | 'deliver' | 'lookup' | 'event' | 'handover' | 'overdue'

  const ACTIONS: { key: string; label: string; sub: string; color: string; bg: string; badge?: number; sheet?: ActionKey; href?: string }[] = [
    { key: 'pay',      label: 'บันทึกรับเงิน',    sub: 'bottom sheet',      color: 'text-amber-300',  bg: 'bg-amber-500/10 border-amber-500/25',    badge: widgets.pendingInstallments, sheet: 'pay' },
    { key: 'deliver',  label: 'บันทึกส่งมอบ',     sub: 'bottom sheet',      color: 'text-purple-300', bg: 'bg-purple-500/10 border-purple-500/25',   badge: widgets.readyToDeliver,      href: '/dashboard/handover' },
    { key: 'lookup',   label: 'ค้นหาลูกค้า',      sub: 'ค้นหาได้เลย',       color: 'text-indigo-300', bg: 'bg-indigo-500/10 border-indigo-500/25',   sheet: 'lookup' },
    { key: 'event',    label: 'เพิ่มลูกค้า Event', sub: 'bottom sheet',      color: 'text-emerald-300',bg: 'bg-emerald-500/10 border-emerald-500/25', href: '/dashboard/events' },
    { key: 'handover', label: 'อัปเดตสถานะงาน',   sub: 'bottom sheet',      color: 'text-blue-300',   bg: 'bg-blue-500/10 border-blue-500/25',       sheet: 'handover' },
    { key: 'overdue',  label: 'งานเกินกำหนด',      sub: 'ดูรายการ',          color: 'text-red-300',    bg: 'bg-red-500/10 border-red-500/25',         badge: widgets.overdueJobs, sheet: 'overdue' },
    { key: 'clients',  label: 'Wyde Clients',       sub: '→ หน้าเต็ม',        color: 'text-[#8b949e]',  bg: 'bg-[#21262d] border-[#30363d]',           href: '/dashboard/jobs' },
    { key: 'prospects',label: 'Prospects',           sub: '→ หน้าเต็ม',        color: 'text-[#8b949e]',  bg: 'bg-[#21262d] border-[#30363d]',           href: '/dashboard/customers' },
    { key: 'payments', label: 'ตั้งแผนชำระ',        sub: '→ หน้าเต็ม',        color: 'text-[#8b949e]',  bg: 'bg-[#21262d] border-[#30363d]',           href: '/dashboard/payments' },
    { key: 'report',   label: 'Daily Report',        sub: '→ หน้าเต็ม',        color: 'text-[#8b949e]',  bg: 'bg-[#21262d] border-[#30363d]',           href: '/dashboard/daily-report' },
    { key: 'commission',label: 'Commission',          sub: '→ หน้าเต็ม',        color: 'text-[#8b949e]',  bg: 'bg-[#21262d] border-[#30363d]',           href: '/dashboard/commission' },
    { key: 'settings', label: 'หน้าหลัก',            sub: 'ออกจาก Quick',      color: 'text-[#484f58]',  bg: 'bg-[#161b22] border-[#30363d]',           href: '/dashboard' },
  ]

  const ACTION_ICONS: Record<string, string> = {
    pay: '💰', deliver: '🚚', lookup: '🔍', event: '📅',
    handover: '🏗️', overdue: '⚠️', clients: '👔', prospects: '👥',
    payments: '📊', report: '📝', commission: '💎', settings: '🏠'
  }

  function handleAction(a: typeof ACTIONS[0]) {
    if (a.sheet) setOpenSheet(a.sheet)
    else if (a.href) router.push(a.href)
  }

  const todayTH = new Date().toLocaleDateString('th-TH', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })

  return (
    <div className="min-h-screen bg-[#0d1117] pb-6">
      {/* Header */}
      <div className="px-5 pt-5 pb-3">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-full bg-indigo-500/20 border border-indigo-500/30 flex items-center justify-center">
              <Zap size={15} className="text-indigo-400" />
            </div>
            <span className="text-indigo-400 text-sm font-bold tracking-wide">QUICK MODE</span>
          </div>
          <button onClick={() => router.push('/dashboard')} className="text-[#484f58] hover:text-white p-2">
            <X size={18} />
          </button>
        </div>
        <h1 className="text-white text-2xl font-bold">{greeting} 👋</h1>
        <p className="text-[#484f58] text-sm mt-0.5">{todayTH}</p>
      </div>

      {/* Widgets */}
      <div className="px-5 mb-5">
        <p className="text-[#484f58] text-xs font-semibold uppercase tracking-widest mb-3">ภาพรวม</p>
        {loading ? (
          <div className="grid grid-cols-2 gap-3">
            {[1,2,3,4].map(i => <div key={i} className="h-20 bg-[#161b22] rounded-2xl animate-pulse border border-[#21262d]" />)}
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-3">
            {WIDGETS.map(w => (
              <div key={w.label} className={`rounded-2xl p-4 border ${w.bg}`}>
                <p className="text-[#484f58] text-xs mb-1">{w.label}</p>
                <p className={`text-3xl font-bold ${w.color}`}>{w.value}</p>
                <p className={`text-xs mt-1 ${w.color} opacity-60`}>{w.sub}</p>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Action Grid 4×3 */}
      <div className="px-5">
        <p className="text-[#484f58] text-xs font-semibold uppercase tracking-widest mb-3">Quick Actions</p>
        <div className="grid grid-cols-3 gap-3 sm:grid-cols-4">
          {ACTIONS.map(a => (
            <button
              key={a.key}
              onClick={() => handleAction(a)}
              className={`relative flex flex-col items-center gap-2 p-4 rounded-2xl border transition-all active:scale-95 ${a.bg}`}
            >
              {a.badge !== undefined && a.badge > 0 && (
                <div className="absolute -top-1 -right-1 w-5 h-5 bg-red-500 rounded-full flex items-center justify-center text-white text-[9px] font-bold">
                  {a.badge > 9 ? '9+' : a.badge}
                </div>
              )}
              <span className="text-2xl leading-none">{ACTION_ICONS[a.key]}</span>
              <span className={`text-xs font-semibold text-center leading-tight ${a.color}`}>{a.label}</span>
              <span className="text-[9px] text-[#484f58] text-center">{a.sub}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Latest events hint */}
      {activeEvents.length > 0 && (
        <div className="px-5 mt-5">
          <p className="text-[#484f58] text-xs font-semibold uppercase tracking-widest mb-3">Event ล่าสุด</p>
          <div className="space-y-2">
            {activeEvents.slice(0, 2).map(ev => (
              <button key={ev.id} onClick={() => router.push('/dashboard/events')}
                className="w-full flex items-center justify-between bg-[#161b22] border border-[#30363d] rounded-2xl px-4 py-3 text-left hover:bg-[#1c2128] transition-colors">
                <div>
                  <p className="text-white text-sm font-medium">{ev.eventName}</p>
                  <p className="text-[#8b949e] text-xs mt-0.5">{ev.projectName} · {fmtDate(ev.eventDate)}</p>
                </div>
                <ChevronRight size={16} className="text-[#484f58]" />
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Sheets */}
      <QuickPaySheet open={openSheet === 'pay'} onClose={() => { setOpenSheet(null); load() }} jobs={allJobs} />
      <QuickLookupSheet open={openSheet === 'lookup'} onClose={() => setOpenSheet(null)} />
      <QuickHandoverSheet open={openSheet === 'handover'} onClose={() => { setOpenSheet(null); load() }} jobs={allJobs} />
      <OverdueSheet open={openSheet === 'overdue'} onClose={() => setOpenSheet(null)} />
    </div>
  )
}
