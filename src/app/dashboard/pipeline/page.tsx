'use client'

import React, { useEffect, useState, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import {
  Plus, X, Phone, Mail, MessageCircle, Building2, Home,
  Banknote, FileText, Pencil, Save, ChevronRight, ChevronDown, Search, Copy, Check,
  CheckCircle2, Circle, Trash2,
} from 'lucide-react'
import FileAttach from '@/components/ui/FileAttach'
import { DealDrawer, FullJob, loadFullJob } from '@/components/ui/JobDrawer'
import { PageSpinner } from '@/components/ui/StateUI'
import Modal from '@/components/ui/Modal'
import { Input, Select, TextArea } from '@/components/ui/Input'
import SearchableSelect from '@/components/ui/SearchableSelect'

const WORK_TYPES = ['N-RPT/Event', 'N-RPT/EQ', 'N-RPT', 'RPT', 'อื่นๆ']
const todayStr = () => {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

// ─── Types ─────────────────────────────────────────────────
interface Customer {
  id: string; customer_name: string; phone: string; email: string; line_id: string
  source: string; project_id: string; interested_room: string; budget: number
  status: string; assigned_to: string; notes: string; created_at: string
  projects?: { name: string }; users?: { name: string }
}
interface Project { id: string; name: string }
interface User { id: string; name: string }
interface DetailJob {
  id: string; po_no: string; so_no: string; work_type: string; package_type: string
  order_date: string | null; contract_date: string | null; revenue_inc_vat: number; customer_type: string; working_status: string
  installments: { id: string; installment_no: number; installment_name: string; amount: number; status: string; due_date: string | null; paid_date: string | null; is_final: boolean }[]
  handover: { delivery_date: string | null; work_status: string } | null
  quotation1_url: string | null; quotation2_url: string | null; id_card_url: string | null
  delivery_doc_url: string | null; satisfaction_url: string | null
}
interface DetailWarranty {
  id: string; warranty_start: string; warranty_end: string; warranty_months: number
  status: string; room: string
}

// ─── Stage config ───────────────────────────────────────────
const STAGES = [
  { value: 'new',           label: 'ใหม่',              bg: 'rgba(59,130,246,0.08)',  border: '#3b82f680', text: '#60a5fa',  dot: '#60a5fa',  badge: 'rgba(59,130,246,0.15)',  chip: 'rgba(59,130,246,0.45)' },
  { value: 'interested',    label: 'สนใจ',               bg: 'rgba(6,182,212,0.08)',   border: '#06b6d480', text: '#22d3ee',  dot: '#22d3ee',  badge: 'rgba(6,182,212,0.15)',   chip: 'rgba(6,182,212,0.45)'  },
  { value: 'quoted',        label: 'เสนอราคาแล้ว',       bg: 'rgba(234,179,8,0.08)',   border: '#eab30880', text: '#fbbf24',  dot: '#fbbf24',  badge: 'rgba(234,179,8,0.15)',   chip: 'rgba(234,179,8,0.45)'  },
  { value: 'booked',        label: 'จอง',                bg: 'rgba(249,115,22,0.08)',  border: '#f9731680', text: '#fb923c',  dot: '#fb923c',  badge: 'rgba(249,115,22,0.15)',  chip: 'rgba(249,115,22,0.45)' },
  { value: 'close_pending', label: 'รอปิด',              bg: 'rgba(168,85,247,0.08)',  border: '#a855f780', text: '#c084fc',  dot: '#c084fc',  badge: 'rgba(168,85,247,0.15)',  chip: 'rgba(168,85,247,0.45)' },
  { value: 'lost',          label: 'หลุด',               bg: 'rgba(239,68,68,0.08)',   border: '#ef444480', text: '#f87171',  dot: '#f87171',  badge: 'rgba(239,68,68,0.15)',   chip: 'rgba(239,68,68,0.45)'  },
  { value: 'closed',        label: 'ปิดแล้ว เริ่มงาน',  bg: 'rgba(34,197,94,0.08)',   border: '#22c55e80', text: '#4ade80',  dot: '#4ade80',  badge: 'rgba(34,197,94,0.15)',   chip: 'rgba(34,197,94,0.45)'  },
]
const stageMap = Object.fromEntries(STAGES.map(s => [s.value, s]))

const SOURCE_OPTS = [
  { value: '', label: '— ช่องทาง —' }, { value: 'event', label: 'Event' },
  { value: 'referral', label: 'Referral' }, { value: 'walk_in', label: 'Walk-in' },
  { value: 'online', label: 'Online' }, { value: 'cold_call', label: 'Cold Call' },
  { value: 'other', label: 'อื่นๆ' },
]

const emptyForm = {
  customer_name: '', phone: '', email: '', line_id: '', source: '',
  project_id: '', interested_room: '', budget: 0, status: 'new', assigned_to: '', notes: '',
  customer_type: 'B2C', work_type: '',
}

const f = (n: number) => {
  if (!n) return '—'
  if (n >= 1_000_000) return `฿${(n / 1_000_000).toFixed(n % 1_000_000 === 0 ? 0 : 1)}M`
  if (n >= 1_000) return `฿${(n / 1_000).toFixed(n % 1_000 === 0 ? 0 : 1)}K`
  return '฿' + n.toLocaleString('th-TH')
}
const fdate = (d: string | null) => d ? new Date(d).toLocaleDateString('th-TH', { day: '2-digit', month: 'short', year: '2-digit' }) : '—'

// ─── Skeleton card ──────────────────────────────────────────
function CardSkeleton() {
  return (
    <div className="ds-card p-3 animate-pulse">
      <div className="flex items-center gap-3">
        <div className="w-9 h-9 rounded-full flex-shrink-0" style={{ background: 'var(--hover-bg)' }} />
        <div className="flex-1 min-w-0">
          <div className="h-3 rounded-md mb-2" style={{ background: 'var(--hover-bg)', width: '55%' }} />
          <div className="h-2.5 rounded-md" style={{ background: 'var(--hover-bg)', width: '38%' }} />
        </div>
        <div className="w-4 h-4 rounded flex-shrink-0" style={{ background: 'var(--hover-bg)' }} />
      </div>
    </div>
  )
}

// ─── CustomerCard ───────────────────────────────────────────
function CustomerCard({ c, stage, onClick, onDelete, jobSeqNo, jobRev }: { c: Customer; stage: typeof STAGES[0]; onClick: () => void; onDelete: (jobId?: string) => void; jobSeqNo?: number; jobRev?: number; jobId?: string }) {
  const custType = (c as any).customer_type || 'B2C'
  const workType = (c as any).work_type || ''
  const displayValue = jobRev ?? (((c as any).jobs as { revenue_inc_vat: number }[] | null)?.reduce((s, j) => s + (j.revenue_inc_vat || 0), 0) || c.budget || 0)
  const isClosed = c.status === 'closed'
  return (
    <div className="relative group w-full rounded-[14px] p-3 flex flex-col gap-2 transition-all cursor-pointer"
      style={{ background: 'var(--card-bg)', border: `1px solid ${isClosed ? '#22c55e40' : 'var(--card-border)'}`, opacity: isClosed ? 0.85 : 1 }}
      onMouseEnter={e => (e.currentTarget.style.borderColor = isClosed ? '#22c55e80' : 'var(--accent)')}
      onMouseLeave={e => (e.currentTarget.style.borderColor = isClosed ? '#22c55e40' : 'var(--card-border)')}
      onClick={onClick}
    >
      {isClosed && (
        <a href="/dashboard/my-deals" onClick={e => e.stopPropagation()}
          className="flex items-center gap-1.5 px-2 py-1 rounded-[6px] text-[10px] font-semibold"
          style={{ background: 'rgba(34,197,94,0.12)', color: '#4ade80', border: '1px solid rgba(34,197,94,0.25)' }}>
          <span>✓</span> อยู่ใน My Deals แล้ว →
        </a>
      )}
      {/* Row 1: room number + badges */}
      <div className="flex items-start justify-between gap-1 min-w-0">
        <div className="flex items-center gap-1 min-w-0 flex-1">
          <p className="font-bold text-sm truncate min-w-0" style={{ color: 'var(--text-1)' }}>
            {c.interested_room || '—'}
          </p>
          {jobSeqNo != null && (
            <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-[4px] flex-shrink-0 whitespace-nowrap"
              style={{ background: 'rgba(99,102,241,0.15)', color: '#818cf8', border: '1px solid rgba(99,102,241,0.3)' }}>
              งานที่ {jobSeqNo}
            </span>
          )}
        </div>
        {(() => { const s = stageMap[c.status] || stage; return (
          <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-[4px] flex-shrink-0 whitespace-nowrap"
            style={{ background: s.badge, color: s.text, border: `1px solid ${s.border}` }}>
            {s.label}
          </span>
        ) })()}
      </div>
      {/* Row 2: customer name */}
      <p className="text-xs truncate w-full" style={{ color: 'var(--text-1)' }}>{c.customer_name}</p>
      {/* Row 3: type chips */}
      <div className="flex gap-1 flex-wrap">
        <span className="text-[10px] px-1.5 py-0.5 rounded-[4px] font-semibold"
          style={{ background: custType === 'B2B' ? 'rgba(234,179,8,0.15)' : 'rgba(59,130,246,0.12)', color: custType === 'B2B' ? '#fbbf24' : '#60a5fa' }}>
          {custType}
        </span>
        {workType && (
          <span className="text-[10px] px-1.5 py-0.5 rounded-[4px] font-semibold"
            style={{ background: 'var(--hover-bg)', color: 'var(--text-2)' }}>
            {workType}
          </span>
        )}
        {c.source && (
          <span className="text-[10px] px-1.5 py-0.5 rounded-[4px] font-semibold"
            style={{ background: 'var(--hover-bg)', color: 'var(--text-2)' }}>
            {c.source}
          </span>
        )}
      </div>
      {/* Row 4: value + sales */}
      <div className="flex items-center justify-between gap-1 mt-auto min-w-0">
        <div className="min-w-0 flex-1 overflow-hidden">
          {displayValue > 0
            ? <p className="text-xs font-bold truncate" style={{ color: 'var(--accent-green)' }}>{f(displayValue)}</p>
            : <p className="text-[10px]" style={{ color: 'var(--text-3)' }}>ไม่ระบุมูลค่า</p>}
          {(c as any).users?.name && <p className="text-[10px] truncate" style={{ color: 'var(--text-3)' }}>{(c as any).users.name}</p>}
        </div>
        <ChevronRight size={14} style={{ color: 'var(--text-3)' }} className="opacity-40 group-hover:opacity-100 transition-opacity flex-shrink-0" />
      </div>
      {/* Delete button */}
      <button
        onClick={e => { e.stopPropagation(); onDelete() }}
        className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity p-1 rounded-[6px]"
        style={{ color: 'var(--accent-red)', background: 'var(--hover-bg)' }}
        title="ลบ"
      >
        <Trash2 size={11} />
      </button>
    </div>
  )
}

// ─── Card expand helper ─────────────────────────────────────
type JobMeta = { id: string; order_date: string | null; revenue_inc_vat: number }
type CardItem = { c: Customer; jobSeqNo: number | undefined; jobRev: number | undefined; jobId: string | undefined; cardKey: string }
function expandCards(customers: Customer[]): CardItem[] {
  const result: CardItem[] = []
  for (const c of customers) {
    const cJobs = ((c as any).jobs as JobMeta[] | null) || []
    if (cJobs.length <= 1) {
      result.push({ c, jobSeqNo: undefined, jobRev: cJobs[0]?.revenue_inc_vat, jobId: cJobs[0]?.id, cardKey: c.id })
    } else {
      const sorted = [...cJobs].sort((a, b) => ((a.order_date || a.id) < (b.order_date || b.id) ? -1 : 1))
      sorted.forEach((j, i) => result.push({ c, jobSeqNo: i + 1, jobRev: j.revenue_inc_vat || 0, jobId: j.id, cardKey: `${c.id}-${j.id}` }))
    }
  }
  return result
}

// ─── ProspectDrawer ─────────────────────────────────────────
function CancelModal({ onClose, onConfirm }: {
  onClose: () => void
  onConfirm: (type: 'forfeit' | 'refund', amount: number, date: string, notes: string) => Promise<void>
}) {
  const [cancelType, setCancelType] = useState<'forfeit' | 'refund'>('forfeit')
  const [amount, setAmount] = useState('')
  const [date, setDate] = useState(todayStr())
  const [notes, setNotes] = useState('')
  const [saving, setSaving] = useState(false)

  async function confirm() {
    setSaving(true)
    await onConfirm(cancelType, Number(amount) || 0, date, notes)
    setSaving(false)
  }

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center px-4 pb-4 pt-14 lg:pt-4" onClick={onClose}>
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
      <div className="relative rounded-[16px] p-5 w-full max-w-sm space-y-4" style={{ background: 'var(--panel-bg)', border: '1px solid var(--card-border)' }}
        onClick={e => e.stopPropagation()}>
        <p className="font-bold text-sm" style={{ color: 'var(--text-1)' }}>ยกเลิกสัญญา</p>

        <div className="flex gap-2">
          {([['forfeit', 'ยึดเงินจอง'], ['refund', 'คืนเงิน']] as const).map(([val, label]) => (
            <button key={val} onClick={() => setCancelType(val)}
              className="flex-1 py-2 rounded-[8px] text-sm font-semibold transition-all"
              style={cancelType === val
                ? { background: val === 'forfeit' ? '#f87171' : '#60a5fa', color: '#fff' }
                : { background: 'var(--hover-bg)', color: 'var(--text-2)', border: '1px solid var(--divider)' }}>
              {label}
            </button>
          ))}
        </div>

        <div className="space-y-2">
          <div>
            <label className="text-xs mb-1 block" style={{ color: 'var(--text-2)' }}>
              {cancelType === 'forfeit' ? 'ยอดที่ยึด (บาท)' : 'ยอดคืน (บาท)'}
            </label>
            <input type="number" value={amount} onChange={e => setAmount(e.target.value)} placeholder="0"
              className="w-full px-3 py-2 rounded-[8px] text-sm focus:outline-none"
              style={{ background: 'var(--input-bg)', border: '1px solid var(--divider)', color: 'var(--text-1)' }} />
          </div>
          <div>
            <label className="text-xs mb-1 block" style={{ color: 'var(--text-2)' }}>
              {cancelType === 'forfeit' ? 'วันที่ยึดเงิน' : 'วันที่คืนเงิน'}
            </label>
            <input type="date" value={date} onChange={e => setDate(e.target.value)}
              className="w-full px-3 py-2 rounded-[8px] text-sm focus:outline-none"
              style={{ background: 'var(--input-bg)', border: '1px solid var(--divider)', color: 'var(--text-1)' }} />
          </div>
        </div>

        <div>
          <p className="text-xs mb-1" style={{ color: 'var(--text-2)' }}>หมายเหตุ</p>
          <textarea value={notes} onChange={e => setNotes(e.target.value)} rows={2} placeholder="เหตุผลยกเลิก..."
            className="w-full px-3 py-2 rounded-[8px] text-sm focus:outline-none resize-none"
            style={{ background: 'var(--input-bg)', border: '1px solid var(--divider)', color: 'var(--text-1)' }} />
        </div>

        <div className="flex gap-2">
          <button onClick={onClose} className="flex-1 py-2 rounded-[8px] text-sm" style={{ border: '1px solid var(--divider)', color: 'var(--text-2)' }}>
            ยกเลิก
          </button>
          <button onClick={confirm} disabled={saving}
            className="flex-1 py-2 rounded-[8px] text-sm font-semibold text-white disabled:opacity-50"
            style={{ background: cancelType === 'forfeit' ? '#f87171' : '#60a5fa' }}>
            {saving ? 'กำลังบันทึก...' : 'ยืนยันยกเลิก'}
          </button>
        </div>
      </div>
    </div>
  )
}

async function createBookedJob(customer: Customer, supabase: ReturnType<typeof createClient>): Promise<string> {
  // Use max job number to avoid ID collision (count-based approach creates duplicates when jobs exist)
  const { data: lastJob } = await supabase.from('jobs').select('id').like('id', 'JOB-%').order('id', { ascending: false }).limit(1).maybeSingle()
  let nextNum = 1
  if (lastJob?.id) {
    const m = lastJob.id.match(/JOB-(\d+)/)
    if (m) nextNum = parseInt(m[1], 10) + 1
  }
  const jobId = `JOB-${String(nextNum).padStart(4, '0')}`
  const { data: extra } = await supabase.from('customers').select('booking_value').eq('id', customer.id).maybeSingle()
  const revInc = (extra as any)?.booking_value || customer.budget || 0
  const { error } = await supabase.from('jobs').insert({
    id: jobId,
    customer_id: customer.id,
    project_id: customer.project_id || null,
    room_no: customer.interested_room || '',
    customer_name: customer.customer_name,
    customer_type: (customer as any).customer_type || 'B2C',
    revenue_inc_vat: revInc,
    revenue_ex_vat: revInc ? Math.round(revInc / 1.07) : 0,
    working_status: 'จอง',
    order_date: customer.created_at ? customer.created_at.slice(0, 10) : null,
    work_start_date: null,
    sales_id: customer.assigned_to || null,
  })
  if (error) { console.error('createBookedJob insert failed:', error.message); return '' }
  return jobId
}

function CustomerDrawer({ customer, focusJobId, projects, users, onClose, onUpdate, onStartJob }: {
  customer: Customer; focusJobId?: string | null; projects: Project[]; users: User[]
  onClose: () => void; onUpdate: (c: Customer) => void
  onStartJob: (c: Customer) => void
}) {
  const supabase = createClient()
  const stage = stageMap[customer.status] || STAGES[0]
  const [editing, setEditing] = useState(false)
  const [form, setForm] = useState({ ...customer })
  const [saving, setSaving] = useState(false)
  const [jobs, setJobs] = useState<DetailJob[]>([])
  const [warranties, setWarranties] = useState<DetailWarranty[]>([])
  const [loadingDetail, setLoadingDetail] = useState(true)
  const [showCancel, setShowCancel] = useState(false)
  const [showCancelSection, setShowCancelSection] = useState(false)
  const [cancelConfirmed, setCancelConfirmed] = useState(false)
  const [docsExpanded, setDocsExpanded] = useState<Record<string, boolean>>({})
  const [bookedJob, setBookedJob] = useState<FullJob | null>(null)
  const [loadingBookedJob, setLoadingBookedJob] = useState(customer.status === 'booked')

  useEffect(() => {
    let cancelled = false
    async function load() {
      setLoadingDetail(true)
      // Query jobs by customer_id (UUID — legacy) OR by project+room (new flow from เริ่มงาน)
      const expectedCustomerId = customer.project_id && customer.interested_room
        ? `${customer.project_id}-${customer.interested_room}` : null
      const jobQuery = supabase.from('jobs')
        .select('id, po_no, so_no, work_type, package_type, order_date, contract_date, revenue_inc_vat, customer_type, working_status, quotation1_url, quotation2_url, id_card_url, delivery_doc_url, satisfaction_url')
        .order('order_date', { ascending: false })
      const [{ data: jobsRaw }, { data: wRaw }] = await Promise.all([
        expectedCustomerId
          ? jobQuery.or(`customer_id.eq.${customer.id},customer_id.eq.${expectedCustomerId}`)
          : jobQuery.eq('customer_id', customer.id),
        supabase.from('warranties').select('id, warranty_start, warranty_end, warranty_months, status, room')
          .eq('customer_id', customer.id),
      ])
      if (cancelled) return
      const jobIds = (jobsRaw || []).map((j: any) => j.id)
      const [{ data: insts }, { data: handovers }] = jobIds.length > 0
        ? await Promise.all([
            supabase.from('payments').select('id, job_id, installment_no, installment_name, amount, status, due_date, paid_date, is_final, voucher_code, voucher_amount').in('job_id', jobIds).order('installment_no'),
            supabase.from('handovers').select('job_id, delivery_date, work_status').in('job_id', jobIds),
          ])
        : [{ data: [] }, { data: [] }]
      if (cancelled) return
      const iMap = new Map<string, any[]>()
      for (const p of (insts || []) as any[]) { if (!iMap.has(p.job_id)) iMap.set(p.job_id, []); iMap.get(p.job_id)!.push(p) }
      const hMap = new Map<string, any>()
      for (const h of (handovers || []) as any[]) { if (h.job_id) hMap.set(h.job_id, h) }
      let uniqueJobs = Array.from(new Map((jobsRaw || []).map((j: any) => [j.id, j])).values())
      // If a specific job was clicked, show only that job (no cross-job data mixing)
      if (focusJobId) uniqueJobs = uniqueJobs.filter((j: any) => j.id === focusJobId)
      setJobs(uniqueJobs.map((j: any) => ({ ...j, installments: iMap.get(j.id) || [], handover: hMap.get(j.id) || null })))
      setWarranties((wRaw || []) as DetailWarranty[])
      setLoadingDetail(false)
    }
    load()
    return () => { cancelled = true }
  }, [customer.id])

  async function loadOrCreateBookedJob() {
    setLoadingBookedJob(true)
    let jobId: string | null = focusJobId || null
    if (!jobId) {
      // Search by customer.id AND by project-room format (jobs may link via either)
      const altId = customer.project_id && customer.interested_room
        ? `${customer.project_id}-${customer.interested_room}` : null
      const baseQuery = supabase.from('jobs').select('id').not('working_status', 'eq', 'ยกเลิก').order('id').limit(1)
      const { data: existing } = altId && altId !== customer.id
        ? await baseQuery.or(`customer_id.eq.${customer.id},customer_id.eq.${altId}`)
        : await baseQuery.eq('customer_id', customer.id)
      jobId = (existing as any)?.[0]?.id || null
    }
    if (!jobId) { jobId = await createBookedJob(customer, supabase) }
    if (jobId) { const j = await loadFullJob(jobId); setBookedJob(j) }
    setLoadingBookedJob(false)
  }

  useEffect(() => {
    if (customer.status === 'booked') { loadOrCreateBookedJob() }
  }, [customer.id, customer.status]) // eslint-disable-line react-hooks/exhaustive-deps

  async function save() {
    setSaving(true)
    const payload: Record<string, unknown> = {
      customer_name: form.customer_name, phone: form.phone, email: form.email,
      line_id: form.line_id, source: form.source, project_id: form.project_id || null,
      interested_room: form.interested_room, budget: form.budget || 0,
      status: form.status, assigned_to: form.assigned_to || null, notes: form.notes,
    }
    const { error } = await supabase.from('customers').update(payload).eq('id', customer.id)
    if (!error) onUpdate({ ...customer, ...form } as Customer)
    setSaving(false)
    setEditing(false)
  }

  // ── Booked: render DealDrawer with stage-move topSlot ──────
  if (customer.status === 'booked') {
    const stagePills = (
      <div className="space-y-2">
        <p className="text-[10px] font-semibold uppercase tracking-widest" style={{ color: 'var(--text-3)' }}>ย้ายสถานะ</p>
        <div className="flex flex-wrap gap-1.5">
          {STAGES.filter(s => s.value !== 'booked' && s.value !== 'closed').map(s => (
            <button key={s.value} onClick={async () => {
              await supabase.from('customers').update({ status: s.value }).eq('id', customer.id)
              onUpdate({ ...customer, status: s.value })
            }}
              className="px-2.5 py-1 rounded-[var(--radius-pill)] text-[11px] font-semibold"
              style={{ background: s.chip, color: '#fff', border: `1px solid ${s.border}` }}>
              → {s.label}
            </button>
          ))}
        </div>
      </div>
    )
    if (loadingBookedJob) return (
      <>
        <div className="fixed inset-0 z-40" style={{ background: 'rgba(0,0,0,0.30)', backdropFilter: 'blur(6px)' }} onClick={onClose} />
        <div className="fixed inset-0 z-50 flex items-center justify-center pointer-events-none px-4 pb-4 pt-14 lg:pt-4">
          <div className="text-xs" style={{ color: 'var(--text-3)' }}>กำลังโหลด...</div>
        </div>
      </>
    )
    if (bookedJob) return (
      <DealDrawer job={bookedJob} onClose={onClose} onRefresh={loadOrCreateBookedJob} topSlot={stagePills} />
    )
    return null
  }

  return (
    <>
      {/* Backdrop */}
      <div className="fixed inset-0 z-40" style={{ background: 'rgba(0,0,0,0.30)', backdropFilter: 'blur(6px)', WebkitBackdropFilter: 'blur(6px)' }} onClick={onClose} />
      {/* Panel */}
      <div className="fixed inset-0 z-50 flex items-center justify-center pointer-events-none px-4 pb-4 pt-14 lg:pt-4">
      <div className="w-full max-w-[460px] max-h-[90vh] flex flex-col rounded-[20px] shadow-2xl pointer-events-auto"
        style={{ background: 'var(--panel-bg)', border: '1px solid var(--card-border)' }}>

        {/* Header — like DealDrawer */}
        <div className="flex items-center justify-between px-5 py-4" style={{ borderBottom: '1px solid var(--divider)' }}>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="px-2.5 py-1 rounded-[8px] font-bold text-xs"
                style={{ background: stage.badge, color: stage.text }}>
                {stage.label}
              </span>
              {customer.interested_room && (
                <span className="font-semibold text-sm" style={{ color: 'var(--text-1)' }}>{customer.interested_room}</span>
              )}
            </div>
            <p className="font-bold text-sm mt-1 truncate" style={{ color: 'var(--text-1)' }}>{customer.customer_name}</p>
            <p className="text-xs mt-0.5 truncate" style={{ color: 'var(--text-3)' }}>
              {(customer as any).projects?.name || ''}
              {(customer as any).users?.name ? ` · ${(customer as any).users.name}` : ''}
            </p>
          </div>
          <div className="flex items-center gap-1 flex-shrink-0 ml-2">
            <button onClick={() => setEditing(e => !e)}
              className="p-2 rounded-[8px]" style={{ background: editing ? 'var(--accent)' : 'var(--hover-bg)', color: editing ? '#fff' : 'var(--text-2)' }}>
              <Pencil size={14} />
            </button>
            <button onClick={onClose} className="p-2 rounded-[8px]" style={{ background: 'var(--hover-bg)', color: 'var(--text-2)' }}>
              <X size={14} />
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-5 space-y-4">

          {/* Budget card */}
          {(() => {
            const jobRev = jobs.reduce((s, j) => s + (j.revenue_inc_vat || 0), 0)
            const displayVal = jobRev || customer.budget
            const label = jobRev > 0 ? 'มูลค่างาน (inc. VAT)' : 'งบประมาณ'
            return (
          <div className="rounded-[12px] p-4 flex items-center justify-between" style={{ background: 'var(--hover-bg)' }}>
            <div>
              <p className="text-xs" style={{ color: 'var(--text-3)' }}>{label}</p>
              <p className="text-xl font-bold mt-0.5" style={{ color: displayVal > 0 ? 'var(--text-1)' : 'var(--text-3)' }}>
                {displayVal > 0 ? f(displayVal) : 'ไม่ระบุ'}
              </p>
            </div>
            {customer.source && (
              <span className="text-[11px] px-2 py-1 rounded-[6px] font-semibold"
                style={{ background: 'var(--card-bg)', color: 'var(--text-2)', border: '1px solid var(--divider)' }}>
                {customer.source}
              </span>
            )}
          </div>
            )
          })()}

          {/* Job dates — one block per job (supports multiple jobs per room) */}
          {!loadingDetail && (() => {
            const sorted = [...jobs].sort((a, b) => ((a.order_date || a.id) < (b.order_date || b.id) ? -1 : 1))
            const seqIdx = Object.fromEntries(sorted.map((j, i) => [j.id, i + 1]))
            return jobs.filter(j => j.order_date || j.contract_date).map(j => (
            <div key={j.id} className="space-y-1.5">
              {jobs.length > 1 && (
                <p className="text-[10px] font-semibold uppercase tracking-widest" style={{ color: 'var(--text-3)' }}>
                  งานงานที่ {seqIdx[j.id]} · {j.customer_type}
                </p>
              )}
              <div className="grid grid-cols-2 gap-3">
                <div className="rounded-[10px] px-3 py-2.5" style={{ background: 'var(--hover-bg)' }}>
                  <p className="text-[10px]" style={{ color: 'var(--text-3)' }}>วันที่รับ PO / ยอด</p>
                  <p className="text-xs font-semibold mt-0.5" style={{ color: j.order_date ? 'var(--text-1)' : 'var(--text-3)' }}>
                    {fdate(j.order_date)}
                  </p>
                </div>
                <div className="rounded-[10px] px-3 py-2.5" style={{ background: 'var(--hover-bg)' }}>
                  <p className="text-[10px]" style={{ color: 'var(--text-3)' }}>วันเซ็นสัญญา</p>
                  <p className="text-xs font-semibold mt-0.5" style={{ color: j.contract_date ? 'var(--text-1)' : 'var(--text-3)' }}>
                    {fdate(j.contract_date)}
                  </p>
                </div>
              </div>
            </div>
          ))})()}

          {/* ย้ายสถานะ — always at top like stage bar in DealDrawer */}
          <div className="space-y-2">
            <p className="text-[10px] font-semibold uppercase tracking-widest" style={{ color: 'var(--text-3)' }}>ย้ายสถานะ</p>
            <div className="flex flex-wrap gap-1.5">
              {STAGES.filter(s => s.value !== customer.status && s.value !== 'closed' && s.value !== 'lost').map(s => (
                <button key={s.value} onClick={async () => {
                  // Always update customer status in DB first
                  await supabase.from('customers').update({ status: s.value }).eq('id', customer.id)
                  // For 'booked': let loadOrCreateBookedJob (triggered by useEffect) handle job creation
                  onUpdate({ ...customer, status: s.value })
                }}
                  className="px-2.5 py-1 rounded-[var(--radius-pill)] text-[11px] font-semibold transition-colors"
                  style={{ background: s.chip, color: '#fff', border: `1px solid ${s.border}` }}>
                  → {s.label}
                </button>
              ))}
              {customer.status !== 'lost' && (
                <button onClick={async () => {
                  await supabase.from('customers').update({ status: 'lost' }).eq('id', customer.id)
                  onUpdate({ ...customer, status: 'lost' })
                }}
                  className="px-2.5 py-1 rounded-[var(--radius-pill)] text-[11px] font-semibold transition-colors"
                  style={{ background: 'color-mix(in srgb, var(--accent-red) 20%, transparent)', color: '#fff', border: '1px solid color-mix(in srgb, var(--accent-red) 50%, transparent)' }}>
                  → หลุด
                </button>
              )}
            </div>
          </div>

          {/* Edit form */}
          {editing && (
            <div className="space-y-3 p-4 rounded-[12px]" style={{ background: 'var(--hover-bg)', border: '1px solid var(--divider)' }}>
              <p className="text-xs font-semibold" style={{ color: 'var(--text-2)' }}>แก้ไขข้อมูล</p>
              <Input label="ชื่อลูกค้า" value={form.customer_name} onChange={e => setForm(p => ({ ...p, customer_name: e.target.value }))} />
              <div className="grid grid-cols-2 gap-2">
                <Input label="โทรศัพท์" value={form.phone} onChange={e => setForm(p => ({ ...p, phone: e.target.value }))} />
                <Input label="Line ID" value={form.line_id} onChange={e => setForm(p => ({ ...p, line_id: e.target.value }))} />
              </div>
              <Input label="Email" value={form.email} onChange={e => setForm(p => ({ ...p, email: e.target.value }))} />
              <div className="grid grid-cols-2 gap-2">
                <div><p className="text-xs mb-1" style={{ color: 'var(--text-2)' }}>โครงการ</p>
                  <SearchableSelect
                    value={form.project_id}
                    onChange={v => setForm(p => ({ ...p, project_id: String(v) }))}
                    options={[{ value: '', label: '— เลือก —' }, ...projects.map(p => ({ value: p.id, label: p.name }))]}
                  /></div>
                <Input label="ห้องที่สนใจ" value={form.interested_room} onChange={e => setForm(p => ({ ...p, interested_room: e.target.value }))} />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <Input label="งบประมาณ" type="number" value={String(form.budget || '')} onChange={e => setForm(p => ({ ...p, budget: Number(e.target.value) }))} />
                <Select label="ช่องทาง" value={form.source} onChange={e => setForm(p => ({ ...p, source: e.target.value }))} options={SOURCE_OPTS} />
              </div>
              <Select label="สถานะ" value={form.status}
                onChange={e => setForm(p => ({ ...p, status: e.target.value }))}
                options={STAGES.map(s => ({ value: s.value, label: s.label }))} />
              <div><p className="text-xs mb-1" style={{ color: 'var(--text-2)' }}>มอบหมายให้</p>
                <SearchableSelect
                  value={form.assigned_to}
                  onChange={v => setForm(p => ({ ...p, assigned_to: String(v) }))}
                  options={[{ value: '', label: '— เลือก —' }, ...users.map(u => ({ value: u.id, label: u.name }))]}
                /></div>
              <TextArea label="หมายเหตุ" value={form.notes} onChange={e => setForm(p => ({ ...p, notes: e.target.value }))} rows={2} />
              <div className="flex gap-2 pt-1">
                <button onClick={() => setEditing(false)} className="flex-1 py-2 rounded-[8px] text-sm" style={{ border: '1px solid var(--divider)', color: 'var(--text-2)' }}>ยกเลิก</button>
                <button onClick={save} disabled={saving}
                  className="flex-1 py-2 rounded-[8px] text-sm font-semibold text-white flex items-center justify-center gap-1.5"
                  style={{ background: saving ? '#666' : 'var(--accent)' }}>
                  <Save size={13} /> {saving ? '...' : 'บันทึก'}
                </button>
              </div>
            </div>
          )}

          {/* Contact + info (read-only, always visible) */}
          {!editing && (
            <div className="space-y-3">
              <div className="flex gap-2 flex-wrap">
                {customer.phone && (
                  <a href={`tel:${customer.phone}`} className="flex items-center gap-1.5 px-3 py-1.5 rounded-[8px] text-xs"
                    style={{ background: 'var(--hover-bg)', color: 'var(--text-2)', border: '1px solid var(--divider)' }}>
                    <Phone size={12} /> {customer.phone}
                  </a>
                )}
                {customer.email && (
                  <a href={`mailto:${customer.email}`} className="flex items-center gap-1.5 px-3 py-1.5 rounded-[8px] text-xs"
                    style={{ background: 'var(--hover-bg)', color: 'var(--text-2)', border: '1px solid var(--divider)' }}>
                    <Mail size={12} /> {customer.email}
                  </a>
                )}
                {customer.line_id && (
                  <span className="flex items-center gap-1.5 px-3 py-1.5 rounded-[8px] text-xs"
                    style={{ background: 'var(--hover-bg)', color: 'var(--text-2)', border: '1px solid var(--divider)' }}>
                    <MessageCircle size={12} /> {customer.line_id}
                  </span>
                )}
              </div>
              {customer.notes && (
                <div className="p-3 rounded-[10px] text-xs" style={{ background: 'var(--hover-bg)', color: 'var(--text-2)' }}>{customer.notes}</div>
              )}
            </div>
          )}

          {/* Warranties */}
          {!loadingDetail && warranties.length > 0 && (
            <div className="rounded-[12px] overflow-hidden" style={{ border: '1px solid var(--divider)' }}>
              <div className="px-4 py-2.5" style={{ background: 'var(--hover-bg)' }}>
                <span className="text-[10px] font-semibold uppercase tracking-widest" style={{ color: 'var(--text-3)' }}>ประกัน</span>
              </div>
              <div className="divide-y" style={{ borderColor: 'var(--divider)' }}>
                {warranties.map(w => (
                  <div key={w.id} className="px-4 py-2.5 flex items-center justify-between text-xs">
                    <span style={{ color: 'var(--text-2)' }}>ห้อง {w.room} · {w.warranty_months} เดือน</span>
                    <span style={{ color: w.status === 'active' ? '#4ade80' : 'var(--text-3)' }}>{fdate(w.warranty_end)}</span>
                  </div>
                ))}
              </div>
            </div>
          )}


          {/* Documents — one collapsible section per job */}
          {!loadingDetail && (() => {
            const sorted2 = [...jobs].sort((a, b) => ((a.order_date || a.id) < (b.order_date || b.id) ? -1 : 1))
            const seqIdx2 = Object.fromEntries(sorted2.map((j, i) => [j.id, i + 1]))
            return jobs.map(j => {
            const docCount = [j.quotation1_url, j.quotation2_url, j.id_card_url, j.delivery_doc_url, j.satisfaction_url].filter(Boolean).length
            const expanded = docsExpanded[j.id] ?? false
            return (
              <div key={j.id} className="rounded-[12px] overflow-hidden" style={{ border: '1px solid var(--divider)' }}>
                <button className="w-full flex items-center justify-between px-4 py-2.5"
                  style={{ background: 'var(--hover-bg)', color: 'var(--text-3)' }}
                  onClick={() => setDocsExpanded(e => ({ ...e, [j.id]: !e[j.id] }))}>
                  <span className="text-xs">เอกสาร{jobs.length > 1 ? ` งานงานที่ ${seqIdx2[j.id]}` : ''}</span>
                  <div className="flex items-center gap-2">
                    <span className="text-[10px]" style={{ color: 'var(--text-3)' }}>{docCount}/5</span>
                    {expanded ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
                  </div>
                </button>
                {expanded && (
                  <div className="px-3 pb-2">
                    <DocProspectField jobId={j.id} field="quotation1_url" label="ใบเสนอราคา 1" value={j.quotation1_url}
                      onUpdate={v => setJobs(prev => prev.map(jj => jj.id === j.id ? { ...jj, quotation1_url: v } : jj))} />
                    <DocProspectField jobId={j.id} field="quotation2_url" label="ใบเสนอราคา 2" value={j.quotation2_url}
                      onUpdate={v => setJobs(prev => prev.map(jj => jj.id === j.id ? { ...jj, quotation2_url: v } : jj))} />
                    <DocProspectField jobId={j.id} field="id_card_url" label="บัตรประชาชนลูกค้า" value={j.id_card_url}
                      onUpdate={v => setJobs(prev => prev.map(jj => jj.id === j.id ? { ...jj, id_card_url: v } : jj))} />
                    <DocProspectField jobId={j.id} field="delivery_doc_url" label="ใบส่งมอบ" value={j.delivery_doc_url}
                      onUpdate={v => setJobs(prev => prev.map(jj => jj.id === j.id ? { ...jj, delivery_doc_url: v } : jj))} />
                    <DocProspectField jobId={j.id} field="satisfaction_url" label="แบบประเมินความพึงพอใจ" value={j.satisfaction_url}
                      onUpdate={v => setJobs(prev => prev.map(jj => jj.id === j.id ? { ...jj, satisfaction_url: v } : jj))} />
                  </div>
                )}
              </div>
            )
          })})()}

          {/* File Attachments */}
          <div className="rounded-[12px] p-3" style={{ border: '1px solid var(--divider)' }}>
            <FileAttach
              customerId={customer.id}
              projectName={(customer as any).projects?.name || customer.project_id || ''}
              roomNo={customer.interested_room || ''}
            />
          </div>

          {/* Cancel — hidden behind toggle (booked only) */}
          {customer.status === 'booked' && (
            <div>
              <button
                onClick={() => { setShowCancelSection(s => !s); setCancelConfirmed(false) }}
                className="flex items-center gap-1 text-[11px] transition-colors"
                style={{ color: 'var(--text-3)' }}>
                <ChevronRight size={12} style={{ transform: showCancelSection ? 'rotate(90deg)' : 'none', transition: 'transform 0.2s' }} />
                สถานะพิเศษ / ลูกค้ายกเลิก
              </button>
              {showCancelSection && (
                <div className="mt-2 rounded-[10px] p-3 space-y-3"
                  style={{ background: 'color-mix(in srgb, #f87171 6%, transparent)', border: '1px solid color-mix(in srgb, #f87171 20%, transparent)' }}>
                  <label className="flex items-center gap-2 cursor-pointer select-none">
                    <input type="checkbox" checked={cancelConfirmed} onChange={e => setCancelConfirmed(e.target.checked)}
                      className="w-4 h-4 rounded" style={{ accentColor: '#f87171' }} />
                    <span className="text-xs" style={{ color: 'var(--text-2)' }}>ยืนยันว่าต้องการยกเลิกสัญญา</span>
                  </label>
                  <button onClick={() => setShowCancel(true)} disabled={!cancelConfirmed}
                    className="w-full py-2 rounded-[8px] text-xs font-semibold transition-all disabled:opacity-30"
                    style={{ background: 'color-mix(in srgb, #f87171 15%, transparent)', border: '1px solid color-mix(in srgb, #f87171 40%, transparent)', color: '#f87171' }}>
                    ยกเลิกสัญญา
                  </button>
                </div>
              )}
            </div>
          )}

          {/* Action — เริ่มงาน for booked */}
          {customer.status === 'booked' && (
            <div className="pt-1" style={{ borderTop: '1px solid var(--divider)' }}>
              <button
                onClick={() => onStartJob(customer)}
                className="w-full py-3 rounded-[var(--radius-pill)] font-bold text-sm text-white"
                style={{ background: '#059669' }}>
                ⚡ เริ่มงาน
              </button>
            </div>
          )}
        </div>
      </div>
      </div>

      {showCancel && (
        <CancelModal
          onClose={() => setShowCancel(false)}
          onConfirm={async (type, amount, date, notes) => {
            const { data: { session } } = await supabase.auth.getSession()
            await supabase.from('customers').update({
              status: 'cancelled',
              cancel_type: type,
              cancel_date: date || null,
              cancel_amount: amount || null,
              cancel_notes: notes || null,
            }).eq('id', customer.id)
            if (amount > 0) {
              await supabase.from('finance_entries').insert({
                type: type === 'forfeit' ? 'income' : 'expense',
                category: type === 'forfeit' ? 'ยึดเงินจอง' : 'คืนเงินยกเลิก',
                amount,
                entry_date: date,
                description: `${type === 'forfeit' ? 'ยึดเงินจอง' : 'คืนเงิน'}: ${customer.customer_name}${notes ? ' — ' + notes : ''}`,
                ref_id: customer.id,
                created_by: session?.user?.id || null,
              })
            }
            onUpdate({ ...customer, status: 'cancelled' })
            setShowCancel(false)
          }}
        />
      )}
    </>
  )
}

// ─── Start Job Modal ────────────────────────────────────────
type BookingData = {
  booking_value: number | null; customer_type: string | null; work_type: string | null; job_type: string | null
}

function StartJobModal({ customer, users, onClose, onSaved }: {
  customer: Customer; users: User[]
  onClose: () => void; onSaved: () => void
}) {
  const supabase = createClient()
  const [roomNo, setRoomNo] = useState(customer.interested_room || '')
  const [revenue, setRevenue] = useState(customer.budget || 0)
  const [workType, setWorkType] = useState('N-RPT/Event')
  const [custType, setCustType] = useState<'B2C' | 'B2B'>('B2C')
  const [pkgType, setPkgType] = useState('')
  const [orderDate, setOrderDate] = useState(todayStr())
  const [salesId, setSalesId] = useState(customer.assigned_to || '')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [booking, setBooking] = useState<BookingData | null>(null)

  const inputStyle = { background: 'var(--input-bg)', border: '1px solid var(--divider)', color: 'var(--text-1)' }
  const revenueEx = revenue ? Math.round(revenue / 1.07) : 0

  // Fetch booking data to pre-fill
  useEffect(() => {
    supabase.from('customers')
      .select('booking_value,customer_type,work_type,job_type')
      .eq('id', customer.id).single()
      .then(({ data }) => {
        if (!data) return
        const b = data as BookingData
        setBooking(b)
        if (b.booking_value) setRevenue(b.booking_value)
        if (b.work_type) setWorkType(b.work_type)
        if (b.customer_type === 'B2B') setCustType('B2B')
        if (b.job_type) setPkgType(b.job_type)
      })
  }, [customer.id])


  async function save() {
    if (!roomNo.trim()) { setError('กรุณาระบุเลขห้อง'); return }
    if (!customer.project_id) { setError('ไม่มีข้อมูลโครงการ กรุณาแก้ไขข้อมูล Prospect ก่อน'); return }
    setSaving(true); setError('')

    // Find max job number
    const { data: allJobs } = await supabase.from('jobs').select('id')
    const maxNum = (allJobs || []).reduce((max: number, j: { id: string }) => {
      const n = parseInt(j.id.replace(/\D/g, '')) || 0
      return Math.max(max, n)
    }, 0)
    const jobId = `JOB-${String(maxNum + 1).padStart(3, '0')}`
    const baseId = `${customer.project_id}-${roomNo.trim()}`
    const isB2B = custType === 'B2B'
    // If B2B and a B2C customer record already exists for this room, use separate ID
    const { data: existingCustomer } = await supabase.from('customers').select('id, customer_type').eq('id', baseId).maybeSingle()
    const customerId = isB2B && existingCustomer && existingCustomer.customer_type !== 'B2B' ? `${baseId}-B2B` : baseId

    // Upsert job-customer record (FK)
    await supabase.from('customers').upsert({
      id: customerId, project_id: customer.project_id,
      customer_name: customer.customer_name, customer_type: custType, status: 'closed',
    }, { onConflict: 'id', ignoreDuplicates: true })

    // Insert job
    const { error: jobErr } = await supabase.from('jobs').insert({
      id: jobId, customer_id: customerId,
      project_id: customer.project_id, room_no: roomNo.trim(),
      customer_name: customer.customer_name, customer_type: custType,
      work_type: workType, package_type: pkgType || null, order_date: orderDate,
      revenue_inc_vat: revenue, revenue_ex_vat: revenueEx,
      transfer_amount: revenue, working_status: 'รับงาน',
      accounting_status: 'Reserved', sales_id: salesId || null,
    })

    if (jobErr) { setError('เกิดข้อผิดพลาด: ' + jobErr.message); setSaving(false); return }

    // Update pipeline prospect to closed
    await supabase.from('customers').update({ status: 'closed' }).eq('id', customer.id)
    setSaving(false); onSaved(); onClose()
  }

  return (
    <div className="fixed inset-0 z-[70] flex items-end sm:items-center justify-center px-4 pb-4 pt-14 lg:pt-4" onClick={onClose}>
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
      <div className="relative w-full max-w-sm rounded-[18px] shadow-2xl"
        style={{ background: 'var(--panel-bg)', border: '1px solid var(--card-border)' }}
        onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between p-5" style={{ borderBottom: '1px solid var(--divider)' }}>
          <div>
            <h3 className="font-semibold text-sm" style={{ color: 'var(--text-1)' }}>เริ่มงาน</h3>
            <p className="text-xs mt-0.5" style={{ color: 'var(--text-3)' }}>{customer.customer_name} · {(customer as any).projects?.name || customer.project_id}</p>
          </div>
          <button onClick={onClose} style={{ color: 'var(--text-2)' }}><X size={18} /></button>
        </div>
        <div className="p-5 space-y-3">
          {/* Booking data banner */}
          {booking && booking.booking_value && (
            <div className="rounded-[10px] px-3 py-2.5 flex flex-col gap-1"
              style={{ background: 'color-mix(in srgb, var(--accent-green) 10%, transparent)', border: '1px solid color-mix(in srgb, var(--accent-green) 25%, transparent)' }}>
              <p className="text-[11px] font-semibold" style={{ color: 'var(--accent-green)' }}>พบข้อมูล Booking</p>
              <p className="text-[11px]" style={{ color: 'var(--text-2)' }}>
                ฿{booking.booking_value.toLocaleString()} · {booking.customer_type || '—'} · {booking.job_type || '—'}
              </p>
            </div>
          )}
          <div>
            <label className="text-xs mb-1 block" style={{ color: 'var(--text-2)' }}>เลขห้อง *</label>
            <input value={roomNo} onChange={e => setRoomNo(e.target.value)} autoFocus
              className="w-full px-3 py-2 rounded-[8px] text-sm focus:outline-none"
              style={inputStyle} placeholder="เช่น A-101" />
          </div>
          <div>
            <label className="text-xs mb-1 block" style={{ color: 'var(--text-2)' }}>มูลค่างาน (inc. VAT)</label>
            <input type="number" value={revenue || ''} onChange={e => setRevenue(Number(e.target.value))}
              className="w-full px-3 py-2 rounded-[8px] text-sm focus:outline-none" style={inputStyle} />
            {revenue > 0 && <p className="text-[11px] mt-1" style={{ color: 'var(--text-3)' }}>ex. VAT ≈ ฿{revenueEx.toLocaleString()}</p>}
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-xs mb-1 block" style={{ color: 'var(--text-2)' }}>ประเภทลูกค้า</label>
              <select value={custType} onChange={e => setCustType(e.target.value as 'B2C' | 'B2B')}
                className="field-input">
                <option value="B2C">B2C</option>
                <option value="B2B">B2B</option>
              </select>
            </div>
            <div>
              <label className="text-xs mb-1 block" style={{ color: 'var(--text-2)' }}>แพ็กเกจ</label>
              <input value={pkgType} onChange={e => setPkgType(e.target.value)}
                className="w-full px-3 py-2 rounded-[8px] text-sm focus:outline-none"
                style={inputStyle} placeholder="เช่น Standard" />
            </div>
          </div>
          <div>
            <label className="text-xs mb-1 block" style={{ color: 'var(--text-2)' }}>ประเภทงาน</label>
            <select value={workType} onChange={e => setWorkType(e.target.value)}
              className="field-input">
              {WORK_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
            </select>
          </div>
          <div>
            <label className="text-xs mb-1 block" style={{ color: 'var(--text-2)' }}>วันที่รับงาน</label>
            <input type="date" value={orderDate} onChange={e => setOrderDate(e.target.value)}
              className="w-full px-3 py-2 rounded-[8px] text-sm focus:outline-none" style={inputStyle} />
          </div>
          <div>
            <label className="text-xs mb-1 block" style={{ color: 'var(--text-2)' }}>Sales</label>
            <select value={salesId} onChange={e => setSalesId(e.target.value)}
              className="field-input">
              <option value="">— เลือก —</option>
              {users.map(u => <option key={u.id} value={u.id}>{u.name}</option>)}
            </select>
          </div>
          {error && <p className="text-xs text-red-400">{error}</p>}
          <button onClick={save} disabled={saving}
            className="w-full py-3 rounded-[12px] font-semibold text-sm text-white"
            style={{ background: saving ? '#666' : '#059669' }}>
            {saving ? 'กำลังสร้างงาน...' : '⚡ เริ่มงาน'}
          </button>
        </div>
      </div>
    </div>
  )
}



const CHANNEL_OPTS = ['โอนเข้าบัญชีบริษัท', 'บัตรเครดิต', 'เงินสด', 'QR Code']

function fLineDate(d: string | null) {
  const dt = d ? new Date(d) : new Date()
  const dd = String(dt.getDate()).padStart(2, '0')
  const mm = String(dt.getMonth() + 1).padStart(2, '0')
  const yy = String(dt.getFullYear()).slice(2)
  return `${dd}/${mm}/${yy}`
}

function BookingAttachBtn({ label, active, saving, onClick, activeColor }: { label: string; active: boolean; saving: boolean; onClick: () => void; activeColor: string }) {
  return (
    <button onClick={onClick} disabled={saving}
      className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-[6px] text-xs font-semibold transition-all active:scale-95"
      style={{
        background: active ? `color-mix(in srgb, ${activeColor} 12%, transparent)` : 'var(--hover-bg)',
        border: `1px solid ${active ? `color-mix(in srgb, ${activeColor} 30%, transparent)` : 'var(--divider)'}`,
        color: active ? activeColor : 'var(--text-3)',
        opacity: saving ? 0.5 : 1,
      }}>
      {active ? <Check size={10} /> : <Copy size={10} style={{ opacity: 0.5 }} />} {label}
    </button>
  )
}

function BookingCopyBtn({ lineMsg }: { lineMsg: string }) {
  const [copied, setCopied] = useState(false)
  function copy() {
    navigator.clipboard.writeText(lineMsg).then(() => { setCopied(true); setTimeout(() => setCopied(false), 2000) })
  }
  return (
    <button onClick={copy}
      className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-[6px] text-xs font-semibold transition-all active:scale-95"
      style={{
        background: copied ? 'rgba(74,222,128,0.15)' : 'rgba(0,185,107,0.08)',
        border: `1px solid ${copied ? 'rgba(74,222,128,0.4)' : 'rgba(0,185,107,0.25)'}`,
        color: copied ? '#4ade80' : '#00b96b',
      }}>
      {copied ? <Check size={10} /> : '💬'} {copied ? 'คัดลอก!' : 'LINE'}
    </button>
  )
}

function DocProspectField({ jobId, field, label, value, onUpdate }: {
  jobId: string; field: string; label: string; value: string | null
  onUpdate: (val: string | null) => void
}) {
  const supabase = createClient()
  const [checked, setChecked] = useState(!!value)
  const [saving, setSaving] = useState(false)
  async function toggle() {
    setSaving(true)
    const newVal = checked ? null : 'posted'
    await supabase.from('jobs').update({ [field]: newVal }).eq('id', jobId)
    setChecked(!checked)
    onUpdate(newVal)
    setSaving(false)
  }
  return (
    <button onClick={toggle} disabled={saving}
      className="flex items-center gap-2 w-full text-left py-1.5"
      style={{ opacity: saving ? 0.5 : 1 }}>
      <div className="w-4 h-4 rounded-[4px] flex items-center justify-center flex-shrink-0"
        style={{
          background: checked ? 'color-mix(in srgb, var(--accent) 15%, transparent)' : 'var(--hover-bg)',
          border: `1px solid ${checked ? 'var(--accent)' : 'var(--divider)'}`,
        }}>
        {checked && <Check size={10} style={{ color: 'var(--accent)' }} />}
      </div>
      <span className="text-xs" style={{ color: 'var(--text-2)' }}>{label}</span>
    </button>
  )
}


function InfoItem({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="flex items-start gap-1.5 text-xs">
      <span className="mt-0.5 flex-shrink-0" style={{ color: 'var(--text-3)' }}>{icon}</span>
      <div>
        <p className="text-[10px]" style={{ color: 'var(--text-3)' }}>{label}</p>
        <p style={{ color: 'var(--text-1)' }}>{value}</p>
      </div>
    </div>
  )
}

// ─── Add/Edit modal form ────────────────────────────────────
function CustomerForm({ initial, projects, users, onSave, onClose }: {
  initial?: typeof emptyForm; projects: Project[]; users: User[]
  onSave: (data: typeof emptyForm) => Promise<string | null>; onClose: () => void
}) {
  const [form, setForm] = useState(initial || emptyForm)
  const [saving, setSaving] = useState(false)
  const [errMsg, setErrMsg] = useState<string | null>(null)
  const s = (k: keyof typeof emptyForm) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) =>
    setForm(p => ({ ...p, [k]: e.target.value }))

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (!form.customer_name.trim()) { setErrMsg('กรุณากรอกชื่อลูกค้า'); return }
    if (!form.project_id) { setErrMsg('กรุณาเลือกโครงการ'); return }
    setSaving(true)
    setErrMsg(null)
    const err = await onSave(form)
    setSaving(false)
    if (err) setErrMsg(err)
  }

  return (
    <form onSubmit={submit} className="space-y-3">
      <Input label="ชื่อลูกค้า *" value={form.customer_name} onChange={s('customer_name')} autoFocus />
      <div className="grid grid-cols-2 gap-3">
        <Input label="โทรศัพท์" value={form.phone} onChange={s('phone')} />
        <Input label="Line ID" value={form.line_id} onChange={s('line_id')} />
      </div>
      <Input label="Email" value={form.email} onChange={s('email')} />
      <div>
        <p className="text-xs mb-1" style={{ color: 'var(--text-2)' }}>ประเภทลูกค้า</p>
        <div className="flex gap-2">
          {(['B2C', 'B2B'] as const).map(t => (
            <button key={t} type="button"
              onClick={() => setForm(p => ({ ...p, customer_type: t }))}
              className="flex-1 py-2 rounded-[8px] text-xs font-semibold border transition-all"
              style={{
                background: form.customer_type === t ? (t === 'B2B' ? 'rgba(234,179,8,0.15)' : 'rgba(59,130,246,0.12)') : 'var(--hover-bg)',
                color: form.customer_type === t ? (t === 'B2B' ? '#fbbf24' : '#60a5fa') : 'var(--text-3)',
                borderColor: form.customer_type === t ? (t === 'B2B' ? '#eab30880' : '#3b82f680') : 'var(--divider)',
              }}>
              {t}
            </button>
          ))}
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div><p className="text-xs mb-1" style={{ color: 'var(--text-2)' }}>โครงการ *</p>
          <SearchableSelect value={form.project_id}
            onChange={v => setForm(p => ({ ...p, project_id: String(v) }))}
            options={[{ value: '', label: '— เลือก —' }, ...projects.map(p => ({ value: p.id, label: p.name }))]} /></div>
        <Input label="ห้องที่สนใจ" value={form.interested_room} onChange={s('interested_room')} />
      </div>
      <Select label="ประเภทงาน" value={form.work_type} onChange={s('work_type')}
        options={[{ value: '', label: '— เลือก —' }, ...WORK_TYPES.map(t => ({ value: t, label: t }))]} />
      <div className="grid grid-cols-2 gap-3">
        <Input label="งบประมาณ" type="number" value={String(form.budget || '')} onChange={e => setForm(p => ({ ...p, budget: Number(e.target.value) }))} />
        <Select label="ช่องทาง" value={form.source} onChange={s('source')} options={SOURCE_OPTS} />
      </div>
      <Select label="สถานะ" value={form.status} onChange={s('status')}
        options={STAGES.map(st => ({ value: st.value, label: st.label }))} />
      <div><p className="text-xs mb-1" style={{ color: 'var(--text-2)' }}>มอบหมายให้ (Sales)</p>
        <SearchableSelect value={form.assigned_to}
          onChange={v => setForm(p => ({ ...p, assigned_to: String(v) }))}
          options={[{ value: '', label: '— เลือก —' }, ...users.map(u => ({ value: u.id, label: u.name }))]} /></div>
      <TextArea label="หมายเหตุ" value={form.notes} onChange={s('notes')} rows={2} />
      {errMsg && <p className="text-xs py-1 px-2 rounded-[8px]" style={{ color: '#ef4444', background: '#fee2e2' }}>{errMsg}</p>}
      <div className="flex gap-2 pt-1">
        <button type="button" onClick={onClose} className="flex-1 py-2.5 rounded-[10px] text-sm border" style={{ border: '1px solid var(--divider)', color: 'var(--text-2)' }}>ยกเลิก</button>
        <button type="submit" disabled={saving}
          className="flex-1 py-2.5 rounded-[10px] text-sm font-semibold text-white"
          style={{ background: saving ? '#666' : 'var(--accent)' }}>
          {saving ? 'กำลังบันทึก...' : 'บันทึก'}
        </button>
      </div>
    </form>
  )
}

// ─── Main ───────────────────────────────────────────────────
export default function ProspectsKanbanPage() {
  const supabase = createClient()
  const [customers, setCustomers] = useState<Customer[]>([])
  const [projects, setProjects] = useState<Project[]>([])
  const [users, setUsers] = useState<User[]>([])
  const [loading, setLoading] = useState(true)
  const [activeStage, setActiveStage] = useState('booked')
  const [search, setSearch] = useState('')
  const [filterProject, setFilterProject] = useState('')
  const [filterSales, setFilterSales] = useState('')
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null)
  const [selectedJobId, setSelectedJobId] = useState<string | null>(null)
  const [addModal, setAddModal] = useState(false)
  const [dupRoomCustomer, setDupRoomCustomer] = useState<{ id: string; customer_name: string; interested_room: string } | null>(null)
  const [pendingAddForm, setPendingAddForm] = useState<typeof emptyForm | null>(null)
  const [startJobCustomer, setStartJobCustomer] = useState<Customer | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<{ c: Customer; jobId?: string; hasMultipleJobs: boolean } | null>(null)
  const [deleting, setDeleting] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    const [{ data: cData }, { data: pData }, { data: uData }] = await Promise.all([
      supabase.from('customers')
        .select('id, customer_name, phone, email, line_id, source, project_id, interested_room, budget, status, assigned_to, notes, created_at, customer_type, work_type, projects(name), users!customers_assigned_to_fkey(name), jobs(id, order_date, revenue_inc_vat)')
        .order('created_at', { ascending: false }),
      supabase.from('projects').select('id, name').eq('active', true).order('name'),
      supabase.from('users').select('id, name').eq('active', true).eq('dept', 'Sales Executive').order('name'),
    ])
    setCustomers((cData as any) || [])
    setProjects(pData || [])
    setUsers(uData || [])
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])


  async function addCustomer(form: typeof emptyForm, skipRoomCheck = false): Promise<string | null> {
    // Check: must have project
    if (!form.project_id) {
      if (projects.length === 0)
        return 'ยังไม่มีโครงการในระบบ — กรุณาสร้างโครงการก่อนที่หน้า Projects'
      return 'กรุณาเลือกโครงการก่อน'
    }

    // Duplicate check: same phone OR same project+room
    const orConditions: string[] = []
    const phone = form.phone.trim()
    if (phone) orConditions.push(`phone.eq.${phone}`)
    if (!skipRoomCheck && form.project_id && form.interested_room) {
      orConditions.push(`and(project_id.eq.${form.project_id},interested_room.eq.${form.interested_room.trim()})`)
    }
    if (orConditions.length) {
      const { data: dup } = await supabase
        .from('customers')
        .select('id, customer_name, phone, interested_room')
        .or(orConditions.join(','))
        .limit(1)
        .maybeSingle()
      if (dup) {
        if (phone && dup.phone === phone)
          return `มีลูกค้าเบอร์ ${phone} อยู่แล้วในระบบ (${dup.customer_name})`
        // Room dup: ask instead of block
        setAddModal(false)
        setDupRoomCustomer({ id: dup.id, customer_name: dup.customer_name, interested_room: dup.interested_room })
        setPendingAddForm(form)
        return null
      }
    }

    const { data, error } = await supabase.from('customers').insert([{
      ...form, project_id: form.project_id || null, assigned_to: form.assigned_to || null, budget: form.budget || 0,
      customer_type: form.customer_type || 'B2C', work_type: form.work_type || null,
    }]).select('id, customer_name, phone, email, line_id, source, project_id, interested_room, budget, status, assigned_to, notes, created_at, customer_type, work_type, projects(name), users!customers_assigned_to_fkey(name), jobs(revenue_inc_vat)').single()
    if (error) return error.message
    if (data) {
      setCustomers(prev => [data as any, ...prev])
      setActiveStage((data as any).status || 'new')
      setAddModal(false)
    }
    return null
  }

  async function confirmAddNewJob() {
    if (!pendingAddForm) return
    setDupRoomCustomer(null)
    await addCustomer(pendingAddForm, true)
    setPendingAddForm(null)
  }

  function updateCustomer(updated: Customer) {
    setCustomers(prev => prev.map(c => c.id === updated.id ? updated : c))
    setSelectedCustomer(updated)
  }

  function triggerDelete(c: Customer, jobId?: string) {
    const cJobs = ((c as any).jobs as JobMeta[] | null) || []
    const hasMultipleJobs = cJobs.length > 1
    setDeleteTarget({ c, jobId, hasMultipleJobs })
  }

  async function confirmDelete() {
    if (!deleteTarget) return
    setDeleting(true)
    const { c, jobId, hasMultipleJobs } = deleteTarget
    if (jobId) {
      // Delete single job (and its payments)
      await supabase.from('payments').delete().eq('job_id', jobId)
      await supabase.from('jobs').delete().eq('id', jobId)
      if (!hasMultipleJobs) {
        // Only job removed — also delete customer
        await supabase.from('customers').delete().eq('id', c.id)
        setCustomers(prev => prev.filter(x => x.id !== c.id))
        if (selectedCustomer?.id === c.id) setSelectedCustomer(null)
      } else {
        // Update local jobs list on customer
        setCustomers(prev => prev.map(x => {
          if (x.id !== c.id) return x
          const prevJobs = ((x as any).jobs as JobMeta[] | null) || []
          return { ...x, jobs: prevJobs.filter(j => j.id !== jobId) }
        }))
      }
    } else {
      // Delete all jobs then customer
      const altId = c.project_id && c.interested_room ? `${c.project_id}-${c.interested_room}` : null
      const ids = altId && altId !== c.id ? [c.id, altId] : [c.id]
      const { data: linked } = await supabase.from('jobs').select('id').in('customer_id', ids)
      if (linked && linked.length > 0) {
        const jobIds = linked.map(j => j.id)
        await supabase.from('payments').delete().in('job_id', jobIds)
        await supabase.from('jobs').delete().in('id', jobIds)
      }
      const { error } = await supabase.from('customers').delete().eq('id', c.id)
      if (!error) {
        setCustomers(prev => prev.filter(x => x.id !== c.id))
        if (selectedCustomer?.id === c.id) setSelectedCustomer(null)
      }
    }
    setDeleting(false)
    setDeleteTarget(null)
  }

  if (loading) return (
    <div className="h-screen flex flex-col" style={{ background: 'var(--bg-gradient)' }}>
      <div className="flex-shrink-0 px-6 pt-5 pb-3">
        <div className="h-6 w-28 rounded-lg mb-1 animate-pulse" style={{ background: 'var(--hover-bg)' }} />
        <div className="h-3 w-16 rounded-lg animate-pulse" style={{ background: 'var(--hover-bg)' }} />
      </div>
      <div className="px-6 space-y-2 pt-4">
        {[1, 2, 3, 4, 5].map(i => <CardSkeleton key={i} />)}
      </div>
    </div>
  )

  const stage = STAGES.find(s => s.value === activeStage) || STAGES[0]
  const list = customers.filter(c => {
    if (!search && c.status !== activeStage) return false
    if (filterProject && c.project_id !== filterProject) return false
    if (filterSales && c.assigned_to !== filterSales) return false
    if (search) {
      const q = search.toLowerCase().replace(/[-\s]/g, '')
      const room = (c.interested_room || '').toLowerCase().replace(/[-\s]/g, '')
      return room.includes(q) || c.customer_name.toLowerCase().includes(search.toLowerCase())
    }
    return true
  }).sort((a, b) => (a.interested_room || '').localeCompare(b.interested_room || '', 'th', { numeric: true, sensitivity: 'base' }))

  return (
    <div className="h-screen flex flex-col" style={{ background: 'var(--bg-gradient)' }}>

      {/* Header */}
      <div className="flex-shrink-0 px-6 pt-5 pb-3">
        <div className="flex items-center gap-3 mb-4">
          <div className="flex-1">
            <h1 className="text-lg font-bold" style={{ color: 'var(--text-1)' }}>Prospects</h1>
            <p className="text-xs mt-0.5" style={{ color: 'var(--text-3)' }}>{customers.length} ราย</p>
          </div>
          <button onClick={() => setAddModal(true)}
            className="flex items-center gap-1.5 px-4 py-2 rounded-[10px] text-sm font-semibold text-white"
            style={{ background: 'var(--accent)' }}>
            <Plus size={15} /> เพิ่ม Prospect
          </button>
        </div>

        {/* Stage chips — single select */}
        <div className="flex gap-1.5 flex-wrap">
          {STAGES.map(s => {
            const count = customers.filter(c => c.status === s.value).length
            const active = activeStage === s.value && !search
            return (
              <button key={s.value} onClick={() => { setActiveStage(s.value); setSearch(''); setSelectedCustomer(null) }}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-[6px] text-xs font-semibold transition-all"
                style={{
                  background: active ? s.badge : 'var(--hover-bg)',
                  color: active ? s.text : 'var(--text-3)',
                  border: `1px solid ${active ? s.border : 'var(--divider)'}`,
                  opacity: active ? 1 : 0.6,
                }}>
                <span className="w-1.5 h-1.5 rounded-full" style={{ background: active ? s.dot : 'var(--text-3)' }} />
                {s.label}
                <span className="font-bold ml-0.5">{count}</span>
              </button>
            )
          })}
          {search && (
            <span className="flex items-center gap-1.5 px-3 py-1.5 rounded-[6px] text-xs font-semibold"
              style={{ background: 'rgba(99,102,241,0.15)', color: '#818cf8', border: '1px solid rgba(99,102,241,0.4)' }}>
              <span className="w-1.5 h-1.5 rounded-full" style={{ background: '#818cf8' }} />
              ทั้งหมด
              <span className="font-bold ml-0.5">{list.length}</span>
            </span>
          )}
        </div>
      </div>

      {/* Filter bar */}
      <div className="flex-shrink-0 px-6 pb-3 flex items-center gap-2 flex-wrap">
        <div className="relative">
          <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: 'var(--text-3)' }} />
          <input value={search} onChange={e => { setSearch(e.target.value); setSelectedCustomer(null) }}
            placeholder="ค้นหาห้อง, ลูกค้า..."
            className="pl-8 pr-7 py-2 rounded-[10px] text-sm focus:outline-none w-44"
            style={{ background: 'var(--input-bg)', border: '1px solid var(--divider)', color: 'var(--text-1)' }} />
          {search && (
            <button className="absolute right-2 top-1/2 -translate-y-1/2" onClick={() => setSearch('')}>
              <X size={12} style={{ color: 'var(--text-3)' }} />
            </button>
          )}
        </div>
        <select value={filterProject} onChange={e => setFilterProject(e.target.value)}
          className="py-2 pl-3 pr-7 rounded-[10px] text-sm focus:outline-none appearance-none"
          style={{ background: 'var(--input-bg)', border: `1px solid ${filterProject ? 'var(--accent)' : 'var(--divider)'}`, color: filterProject ? 'var(--text-1)' : 'var(--text-3)' }}>
          <option value="">โครงการ</option>
          {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
        <select value={filterSales} onChange={e => setFilterSales(e.target.value)}
          className="py-2 pl-3 pr-7 rounded-[10px] text-sm focus:outline-none appearance-none"
          style={{ background: 'var(--input-bg)', border: `1px solid ${filterSales ? 'var(--accent)' : 'var(--divider)'}`, color: filterSales ? 'var(--text-1)' : 'var(--text-3)' }}>
          <option value="">Sales</option>
          {users.map(u => <option key={u.id} value={u.id}>{u.name}</option>)}
        </select>
        {(search || filterProject || filterSales) && (
          <button onClick={() => { setSearch(''); setFilterProject(''); setFilterSales('') }}
            className="text-xs px-2 py-1.5 rounded-[8px] transition-colors"
            style={{ color: 'var(--text-3)', background: 'var(--hover-bg)', border: '1px solid var(--divider)' }}>
            ล้าง
          </button>
        )}
        <span className="text-xs ml-auto" style={{ color: 'var(--text-3)' }}>{list.length} ราย</span>
      </div>

      {/* Summary strip */}
      {list.length > 0 && (() => {
        const totalBudget = list.reduce((s, c) => s + (c.budget || 0), 0)
        const noSales = list.filter(c => !c.assigned_to).length
        return (
          <div className="flex-shrink-0 px-6 pb-3 grid grid-cols-3 gap-2">
            <div className="ds-card-sm text-center">
              <p className="text-[10px] font-semibold uppercase tracking-wider mb-1" style={{ color: 'var(--text-3)' }}>ในกลุ่มนี้</p>
              <p className="text-lg font-bold" style={{ color: 'var(--text-1)' }}>{list.length}</p>
              <p className="text-[10px]" style={{ color: 'var(--text-3)' }}>ราย</p>
            </div>
            <div className="ds-card-sm text-center">
              <p className="text-[10px] font-semibold uppercase tracking-wider mb-1" style={{ color: 'var(--text-3)' }}>มูลค่ารวม</p>
              <p className="text-lg font-bold" style={{ color: 'var(--text-1)' }}>{totalBudget > 0 ? '฿' + (totalBudget / 1000000).toFixed(1) + 'M' : '—'}</p>
              <p className="text-[10px]" style={{ color: 'var(--text-3)' }}>บาท</p>
            </div>
            <div className="ds-card-sm text-center">
              <p className="text-[10px] font-semibold uppercase tracking-wider mb-1" style={{ color: 'var(--text-3)' }}>ยังไม่มี Sales</p>
              <p className="text-lg font-bold" style={{ color: noSales > 0 ? 'var(--accent-orange)' : 'var(--accent-green)' }}>{noSales}</p>
              <p className="text-[10px]" style={{ color: 'var(--text-3)' }}>ราย</p>
            </div>
          </div>
        )
      })()}

      {/* Cards list */}
      <div className="flex-1 overflow-y-auto px-6 pb-6">
        {list.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-3 py-20">
            <div className="w-12 h-12 rounded-full flex items-center justify-center" style={{ background: 'var(--hover-bg)' }}>
              <Search size={20} style={{ color: 'var(--text-3)' }} />
            </div>
            <p className="text-sm font-semibold" style={{ color: 'var(--text-2)' }}>ไม่พบ Prospect ใน {stage.label}</p>
            <p className="text-xs" style={{ color: 'var(--text-3)' }}>ลองเลือกกลุ่มอื่น หรือเพิ่ม Prospect ใหม่</p>
          </div>
        ) : (() => {
          const grouped = list.reduce<Record<string, { name: string; items: Customer[] }>>((acc, c) => {
            const key = c.project_id || '__none__'
            const name = (c as any).projects?.name || c.project_id || 'ไม่ระบุโครงการ'
            if (!acc[key]) acc[key] = { name, items: [] }
            acc[key].items.push(c)
            return acc
          }, {})
          const groups = Object.entries(grouped).sort(([, a], [, b]) => a.name.localeCompare(b.name, 'th'))
          return (
            <div className="space-y-5 pt-2">
              {groups.map(([key, { name, items }]) => {
                const cards = expandCards(items)
                return (
                <div key={key}>
                  <p className="text-[11px] font-semibold uppercase tracking-wider mb-2 px-0.5" style={{ color: 'var(--text-3)' }}>
                    {name} <span className="font-normal">({cards.length})</span>
                  </p>
                  <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-3">
                    {cards.map(({ c, jobSeqNo, jobRev, jobId, cardKey }) => (
                      <CustomerCard key={cardKey} c={c} stage={stage} onClick={() => { setSelectedCustomer(c); setSelectedJobId(jobId || null) }} onDelete={() => triggerDelete(c, jobId)} jobSeqNo={jobSeqNo} jobRev={jobRev} jobId={jobId} />
                    ))}
                  </div>
                </div>
                )
              })}
            </div>
          )
        })()}
      </div>

      {/* Detail Drawer */}
      {selectedCustomer && (
        <CustomerDrawer
          customer={selectedCustomer}
          focusJobId={selectedJobId}
          projects={projects}
          users={users}
          onClose={() => { setSelectedCustomer(null); setSelectedJobId(null) }}
          onUpdate={updateCustomer}
          onStartJob={c => setStartJobCustomer(c)}
        />
      )}

      {startJobCustomer && (
        <StartJobModal
          customer={startJobCustomer}
          users={users}
          onClose={() => setStartJobCustomer(null)}
          onSaved={() => {
            setCustomers(prev => prev.map(c => c.id === startJobCustomer.id ? { ...c, status: 'closed' } : c))
            setStartJobCustomer(null)
            setSelectedCustomer(null)
          }}
        />
      )}

      {/* Add modal */}
      <Modal open={addModal} title="เพิ่ม Prospect" onClose={() => setAddModal(false)}>
        <CustomerForm projects={projects} users={users} onSave={addCustomer} onClose={() => setAddModal(false)} />
      </Modal>

      {/* Dup room confirm modal */}
      <Modal open={!!dupRoomCustomer} title="พบห้องซ้ำในระบบ" size="sm" onClose={() => { setDupRoomCustomer(null); setPendingAddForm(null) }}>
        {dupRoomCustomer && (
          <div className="space-y-4">
            <p className="text-sm" style={{ color: 'var(--text-2)' }}>
              ห้อง <strong style={{ color: 'var(--text-1)' }}>{dupRoomCustomer.interested_room}</strong> มีลูกค้า <strong style={{ color: 'var(--text-1)' }}>{dupRoomCustomer.customer_name}</strong> อยู่แล้วในระบบ
            </p>
            <p className="text-sm" style={{ color: 'var(--text-2)' }}>ต้องการเพิ่มงานใหม่ให้ห้องนี้ไหม?</p>
            <div className="flex gap-2 pt-1">
              <button onClick={() => { setDupRoomCustomer(null); setPendingAddForm(null) }}
                className="flex-1 py-2.5 rounded-[10px] text-sm" style={{ border: '1px solid var(--divider)', color: 'var(--text-2)' }}>
                ยกเลิก
              </button>
              <button onClick={confirmAddNewJob}
                className="flex-1 py-2.5 rounded-[10px] text-sm font-semibold text-white"
                style={{ background: 'var(--accent)' }}>
                เพิ่มงานใหม่
              </button>
            </div>
          </div>
        )}
      </Modal>

      {/* Delete confirm modal */}
      <Modal open={!!deleteTarget} title="ยืนยันการลบ" size="sm" onClose={() => !deleting && setDeleteTarget(null)}>
        {deleteTarget && (
          <div className="space-y-4">
            <p className="text-sm" style={{ color: 'var(--text-2)' }}>
              {deleteTarget.jobId && deleteTarget.hasMultipleJobs
                ? <>ต้องการลบ <strong style={{ color: 'var(--text-1)' }}>งานงานที่ {((deleteTarget.c as any).jobs as JobMeta[])
                    ?.sort((a, b) => ((a.order_date || a.id) < (b.order_date || b.id) ? -1 : 1))
                    ?.findIndex(j => j.id === deleteTarget.jobId) + 1}</strong> ของห้อง <strong style={{ color: 'var(--text-1)' }}>{deleteTarget.c.interested_room}</strong> ใช่ไหม?</>
                : <>ต้องการลบ <strong style={{ color: 'var(--text-1)' }}>{deleteTarget.c.customer_name}</strong> ออกจาก Pipeline ใช่ไหม?</>
              }
            </p>
            <p className="text-xs" style={{ color: 'var(--text-3)' }}>ข้อมูลจะหายถาวร ไม่สามารถกู้คืนได้</p>
            <div className="flex gap-2 pt-1">
              <button onClick={() => setDeleteTarget(null)} disabled={deleting}
                className="flex-1 py-2.5 rounded-[10px] text-sm" style={{ border: '1px solid var(--divider)', color: 'var(--text-2)' }}>
                ยกเลิก
              </button>
              <button onClick={confirmDelete} disabled={deleting}
                className="flex-1 py-2.5 rounded-[10px] text-sm font-semibold text-white"
                style={{ background: deleting ? '#666' : '#ef4444' }}>
                {deleting ? 'กำลังลบ...' : 'ลบ'}
              </button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  )
}
