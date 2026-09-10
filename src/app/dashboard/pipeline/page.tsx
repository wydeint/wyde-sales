'use client'

import React, { useEffect, useState, useCallback, useRef } from 'react'
import { createClient } from '@/lib/supabase/client'
import MoneyInput from '@/components/ui/MoneyInput'
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
import FilterBar from '@/components/ui/FilterBar'
import { CRM_STAGES, crmStage, PROSPECT_STAGES, cancelOutcome, WORK_TYPES } from '@/lib/status'
import PageHeader from '@/components/ui/PageHeader'
import DateInput from '@/components/ui/DateInput'
import { bahtShort } from '@/lib/money'
import { createProspectJob as createProspectJobShared } from '@/lib/prospectJob'
import { cleanName, nameKey } from '@/lib/customerName'
import { cancelJob } from '@/lib/jobLifecycle'
import { showAlert } from '@/components/ui/dialog'
import { deleteJobCascade, deleteJobsCascade } from '@/lib/deleteJob'
import { compareRoom } from '@/lib/utils'
import { resolveCustomerId, nextCustomerId } from '@/lib/customerId'
import { exVatOf } from '@/lib/procurement'
import { SummaryStrip } from '@/components/ui/SummaryCard'

const PRODUCT_TYPES = [
  'Curtain', 'Wallcovering', 'Loose furniture', 'Built-in', 'Electric appliance',
  'Design', 'Design & Turnkey', 'Ready to move', 'IP', 'EQ', 'Mock up room',
]
const todayStr = () => {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

// ─── Types ─────────────────────────────────────────────────
interface Customer {
  id: string; customer_name: string; phone: string; email: string; line_id: string
  source: string; project_id: string; interested_room: string
  status: string; notes: string; created_at: string
  cancel_type?: string | null; cancel_amount?: number | null; cancel_date?: string | null
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
// Derived from the shared vocabulary so a stage cannot end up a different
// colour here than on Customers or Sales Performance. Column order is this
// board's own concern and stays as listed.
const STAGES = CRM_STAGES.map(({ value: v }) => {
  const { label, color } = crmStage(v)
  const mix = (pct: number) => `color-mix(in srgb, ${color} ${pct}%, transparent)`
  return { value: v, label, text: color, dot: color, bg: mix(8), border: mix(50), badge: mix(15), chip: mix(45) }
})
const stageMap = Object.fromEntries(STAGES.map(s => [s.value, s]))

/**
 * Look a stage up without ever silently landing on STAGES[0].
 *
 * `jobs.crm_stage` is not constrained and holds at least one 'Booked' with a
 * capital B. A plain `stageMap[x] || STAGES[0]` turned that miss into "ใหม่" —
 * a cancelled, forfeited room displayed as a brand new lead, which is the most
 * misleading answer available. Match case-insensitively, then fall back to the
 * customer's own status, and only then to an explicit unknown chip.
 */
/** Shown when a customer record has no job at all, so there is no stage to
 *  read. It used to say "—", which reads as a rendering glitch rather than a
 *  fact about the record — nobody could tell what to do about it. It is a real
 *  state with a real cause (a customer created before, or instead of, a job) and
 *  the fix is to open a job or delete the record, so the chip says so. */
const UNKNOWN_STAGE = { value: '', label: 'ยังไม่เปิดงาน', text: 'var(--accent-orange)', dot: 'var(--accent-orange)', bg: 'transparent', border: 'color-mix(in srgb, var(--accent-orange) 40%, transparent)', badge: 'color-mix(in srgb, var(--accent-orange) 12%, transparent)', chip: 'color-mix(in srgb, var(--accent-orange) 20%, transparent)' }
/** Cancellation and the order note live on the job now. A card shows one job,
 *  the drawer focuses one — but both are handed a customer, so read through to
 *  the job they are about, falling back to the first when none is in focus. */
/** The sales on this customer's jobs. customers.assigned_to was dropped on
 *  2026-08-27, so the job is the only place a seller is recorded. */
function salesIdOf(c: any, focusJobId?: string | null): string {
  const focused = jobOf(c, focusJobId)?.sales_id
  if (focused) return focused
  for (const j of ((c?.jobs as any[]) || [])) if (j?.sales_id) return j.sales_id
  return ''
}

function jobOf(c: any, focusJobId?: string | null): any {
  const js = ((c?.jobs as any[]) || [])
  return (focusJobId && js.find(j => j.id === focusJobId)) || js[0] || {}
}

function resolveStage(...candidates: (string | null | undefined)[]) {
  for (const c of candidates) {
    if (!c) continue
    const hit = stageMap[c] || stageMap[c.toLowerCase()]
    if (hit) return hit
  }
  return UNKNOWN_STAGE
}

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

const f = (n: number) => n ? bahtShort(n) : '—'
const fdate = (d: string | null) => d ? new Date(d).toLocaleDateString('th-TH', { day: '2-digit', month: 'short', year: '2-digit' }) : '—'

// ─── Skeleton card ──────────────────────────────────────────
function CardSkeleton() {
  return (
    <div className="ds-card animate-pulse">
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
/** The money a card shows: this job's revenue, falling back to the customer's
 *  budget only while the job is still a prospect with no value of its own.
 *
 *  The summary strip above the cards used to sum `c.budget` instead, so a
 *  customer with two jobs contributed their whole budget to each card —
 *  searching A812 reported ฿152,513 over a single ฿69,590 card. One formula
 *  now feeds both. */
function cardValue(c: Customer, jobSeqNo: number | undefined, jobRev: number | undefined, _jobCrmStage?: string | null): number {
  return jobSeqNo != null
    ? (jobRev || 0)
    : (jobRev || (((c as any).jobs as { revenue_inc_vat: number }[] | null)?.reduce((s, j) => s + (j.revenue_inc_vat || 0), 0) || 0))
}

function CustomerCard({ c, stage, onClick, onDelete, jobSeqNo, jobRev, jobId, jobWorkingStatus, jobCrmStage }: { c: Customer; stage: ReturnType<typeof resolveStage>; onClick: () => void; onDelete: (jobId?: string) => void; jobSeqNo?: number; jobRev?: number; jobId?: string; jobWorkingStatus?: string; jobCrmStage?: string | null }) {
  const custType = (c as any).customer_type || 'B2C'
  // The card shows one job, so its own work type — not a customer-level copy,
  // which no longer exists.
  const workType = jobOf(c, jobId).work_type || ''
  const displayValue = cardValue(c, jobSeqNo, jobRev, jobCrmStage)
  const ws = jobWorkingStatus ?? ''
  const isClosed = ws === 'ดำเนินการ' || ws === 'ส่งมอบแล้ว' || ws === 'รอส่งมอบ'
  return (
    <div className="relative group w-full rounded-[8px] p-3 flex flex-col gap-2 transition-all cursor-pointer"
      style={{ background: 'var(--card-bg)', border: `1px solid ${isClosed ? 'color-mix(in srgb, var(--accent-green) 25%, transparent)' : 'var(--card-border)'}`, opacity: isClosed ? 0.85 : 1 }}
      onMouseEnter={e => (e.currentTarget.style.borderColor = isClosed ? 'color-mix(in srgb, var(--accent-green) 50%, transparent)' : 'var(--accent)')}
      onMouseLeave={e => (e.currentTarget.style.borderColor = isClosed ? 'color-mix(in srgb, var(--accent-green) 25%, transparent)' : 'var(--card-border)')}
      onClick={onClick}
    >
      {isClosed && (
        <a href="/dashboard/my-deals" onClick={e => e.stopPropagation()}
          className="flex items-center gap-1.5 px-2 py-1 rounded-[8px] text-micro font-semibold"
          style={{ background: 'color-mix(in srgb, var(--accent-green) 12%, transparent)', color: 'var(--accent-green)', border: '1px solid color-mix(in srgb, var(--accent-green) 25%, transparent)' }}>
          <span>✓</span> อยู่ใน My Deals แล้ว →
        </a>
      )}
      {/* Row 1: room number + badges */}
      <div className="flex items-start justify-between gap-1 min-w-0">
        <div className="flex items-center gap-1 min-w-0 flex-1">
          {/* The job's room, not the customer's. Merging two records for one
              buyer leaves a single interested_room, so every card of theirs
              printed that one room — Mr.Andrea Donalisio's A812 job showed as
              A603 after his two records were merged. 47 cards read like that. */}
          <p className="font-bold text-sm truncate min-w-0" style={{ color: 'var(--text-1)' }}>
            {jobOf(c, jobId).room_no || c.interested_room || '—'}
          </p>
          {jobSeqNo != null && (
            <span className="text-micro font-semibold px-1.5 py-0.5 rounded-[8px] flex-shrink-0 whitespace-nowrap"
              style={{ background: 'color-mix(in srgb, var(--accent) 15%, transparent)', color: 'var(--accent)', border: '1px solid color-mix(in srgb, var(--accent) 30%, transparent)' }}>
              งานที่ {jobSeqNo}
            </span>
          )}
        </div>
        {(() => { const s = ws === 'จอง' ? stageMap['booked'] : resolveStage(jobCrmStage); return (
          <span className="text-micro font-semibold px-1.5 py-0.5 rounded-[8px] flex-shrink-0 whitespace-nowrap"
            style={{ background: s.badge, color: s.text, border: `1px solid ${s.border}` }}>
            {s.label}
          </span>
        ) })()}
        {/* How the cancellation settled — a forfeited booking is money we kept,
            which "หลุด" on its own does not say. */}
        {(() => { const cj = jobOf(c, jobId); const co = cancelOutcome(cj.cancel_type); return co && (
          <span className="text-micro font-semibold px-1.5 py-0.5 rounded-[8px] flex-shrink-0 whitespace-nowrap"
            style={{ background: `color-mix(in srgb, ${co.color} 15%, transparent)`, color: co.color, border: `1px solid color-mix(in srgb, ${co.color} 30%, transparent)` }}>
            {co.label}{cj.cancel_amount ? ` ฿${Math.round(cj.cancel_amount).toLocaleString('th-TH')}` : ''}
          </span>
        ) })()}
      </div>
      {/* Row 2: customer name */}
      <p className="text-xs truncate w-full" style={{ color: 'var(--text-1)' }}>{c.customer_name}</p>
      {/* Row 3: type chips */}
      <div className="flex gap-1 flex-wrap">
        <span className="text-micro px-1.5 py-0.5 rounded-[8px] font-semibold"
          style={{ background: custType === 'B2B' ? 'color-mix(in srgb, var(--accent-amber) 15%, transparent)' : 'color-mix(in srgb, var(--accent-blue) 12%, transparent)', color: custType === 'B2B' ? 'var(--accent-amber)' : 'var(--accent-blue)' }}>
          {custType}
        </span>
        {workType && (
          <span className="text-micro px-1.5 py-0.5 rounded-[8px] font-semibold"
            style={{ background: 'var(--hover-bg)', color: 'var(--text-2)' }}>
            {workType}
          </span>
        )}
        {c.source && (
          <span className="text-micro px-1.5 py-0.5 rounded-[8px] font-semibold"
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
            : <p className="text-micro" style={{ color: 'var(--text-3)' }}>ไม่ระบุมูลค่า</p>}
          {/* The seller of THIS job, not the customer's assigned_to. A repeat
              buyer served by someone new used to show the first sales on every
              one of their cards. */}
          {jobOf(c, jobId).sales?.name && <p className="text-micro truncate" style={{ color: 'var(--text-3)' }}>{jobOf(c, jobId).sales.name}</p>}
        </div>
        <ChevronRight size={14} style={{ color: 'var(--text-3)' }} className="opacity-40 group-hover:opacity-100 transition-opacity flex-shrink-0" />
      </div>
      {/* Delete button */}
      <button
        onClick={e => { e.stopPropagation(); onDelete() }}
        className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity p-1 rounded-[8px]"
        style={{ color: 'var(--accent-red)', background: 'var(--hover-bg)' }}
        title="ลบ"
      >
        <Trash2 size={11} />
      </button>
    </div>
  )
}

// ─── Card expand helper ─────────────────────────────────────
type JobMeta = { id: string; order_date: string | null; revenue_inc_vat: number; working_status: string; crm_stage: string | null; work_type?: string | null; room_no?: string | null; notes?: string | null; sales_id?: string | null; sales?: { name: string } | null }
type CardItem = { c: Customer; jobSeqNo: number | undefined; jobRev: number | undefined; jobId: string | undefined; jobWorkingStatus: string | undefined; jobCrmStage: string | null | undefined; cardKey: string }
interface BookedJob {
  id: string; customer_name: string; room_no: string; revenue_inc_vat: number
  sales_name: string | null; project_name: string | null; project_id: string | null
  sales_id: string | null; settled: number; pct: number
}
function expandCards(customers: Customer[]): CardItem[] {
  const result: CardItem[] = []
  for (const c of customers) {
    const cJobs = ((c as any).jobs as JobMeta[] | null) || []
    if (cJobs.length <= 1) {
      result.push({ c, jobSeqNo: undefined, jobRev: cJobs[0]?.revenue_inc_vat, jobId: cJobs[0]?.id, jobWorkingStatus: cJobs[0]?.working_status, jobCrmStage: cJobs[0]?.crm_stage ?? null, cardKey: c.id })
    } else {
      const sorted = [...cJobs].sort((a, b) => {
        if (a.order_date && b.order_date) return a.order_date < b.order_date ? -1 : 1
        if (a.order_date) return -1
        if (b.order_date) return 1
        const na = parseInt(a.id.match(/\d+/)?.[0] || '0', 10)
        const nb = parseInt(b.id.match(/\d+/)?.[0] || '0', 10)
        return na - nb
      })
      // "งานที่ N" counts this person's orders **for this room**, and restarts
      // per room. Numbering across all their rooms made the badge answer a
      // question nobody asks — you are looking at one room's card and want to
      // know how many times this buyer has ordered for it.
      const seqInRoom = new Map<string, number>()
      sorted.forEach(j => {
        const key = (j.room_no || '').trim().toUpperCase()
        const n = (seqInRoom.get(key) || 0) + 1
        seqInRoom.set(key, n)
        result.push({ c, jobSeqNo: n, jobRev: j.revenue_inc_vat || 0, jobId: j.id, jobWorkingStatus: j.working_status, jobCrmStage: j.crm_stage ?? null, cardKey: `${c.id}-${j.id}` })
      })
      // A room they ordered for only once needs no badge — the number would be
      // a permanent "1" that says nothing.
      for (const item of result) {
        if (item.c === c && item.jobSeqNo === 1) {
          const key = (sorted.find(j => j.id === item.jobId)?.room_no || '').trim().toUpperCase()
          if ((seqInRoom.get(key) || 0) === 1) item.jobSeqNo = undefined
        }
      }
    }
  }
  return result
}

// ─── BookedJobCard ───────────────────────────────────────────
function BookedJobCard({ job, onClick, onDelete }: { job: BookedJob; onClick: () => void; onDelete?: () => void }) {
  const pctStr = job.revenue_inc_vat > 0 ? Math.round(job.pct * 100) + '%' : '—'
  const barPct = job.revenue_inc_vat > 0 ? Math.min(100, Math.round(job.pct * 100)) : null
  const barColor = barPct === null ? '' : barPct >= 50 ? 'var(--accent-blue)' : 'var(--accent-orange)'
  return (
    <div className="relative group w-full rounded-[8px] p-3 flex flex-col gap-2 transition-all cursor-pointer"
      style={{ background: 'var(--card-bg)', border: '1px solid var(--card-border)' }}
      onMouseEnter={e => (e.currentTarget.style.borderColor = 'var(--accent)')}
      onMouseLeave={e => (e.currentTarget.style.borderColor = 'var(--card-border)')}
      onClick={onClick}>
      <div className="flex items-start justify-between gap-1 min-w-0">
        <p className="font-bold text-sm truncate min-w-0" style={{ color: 'var(--text-1)' }}>{job.room_no || '—'}</p>
        <span className="text-micro font-semibold px-1.5 py-0.5 rounded-[8px] flex-shrink-0 whitespace-nowrap"
          style={{ background: 'color-mix(in srgb, var(--accent-orange) 15%, transparent)', color: 'var(--accent-orange)', border: '1px solid color-mix(in srgb, var(--accent-orange) 30%, transparent)' }}>
          จอง
        </span>
      </div>
      <p className="text-xs truncate w-full" style={{ color: 'var(--text-1)' }}>{job.customer_name}</p>
      {barPct !== null && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: '12px', color: 'var(--text-3)' }}>ชำระแล้ว</span>
            <span style={{ fontSize: '12px', fontWeight: 700, color: barColor }}>{barPct}%</span>
          </div>
          <div style={{ height: '4px', borderRadius: '9999px', overflow: 'hidden', background: 'var(--hover-bg)' }}>
            <div style={{ height: '100%', width: `${barPct}%`, borderRadius: '9999px', background: barColor }} />
          </div>
        </div>
      )}
      <div className="flex items-center justify-between gap-1 mt-auto min-w-0">
        <div className="min-w-0 flex-1 overflow-hidden">
          {job.revenue_inc_vat > 0
            ? <p className="text-xs font-bold truncate" style={{ color: 'var(--accent-green)' }}>{f(job.revenue_inc_vat)}</p>
            : <p className="text-micro" style={{ color: 'var(--text-3)' }}>ไม่ระบุมูลค่า</p>}
          {job.sales_name && <p className="text-micro truncate" style={{ color: 'var(--text-3)' }}>{job.sales_name}</p>}
        </div>
        <ChevronRight size={14} style={{ color: 'var(--text-3)' }} className="opacity-40 group-hover:opacity-100 transition-opacity flex-shrink-0" />
      </div>
      {onDelete && (
        <button
          onClick={e => { e.stopPropagation(); onDelete() }}
          className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity p-1 rounded-[8px]"
          style={{ color: 'var(--accent-red)', background: 'var(--hover-bg)' }}
          title="ลบ"
        >
          <Trash2 size={11} />
        </button>
      )}
    </div>
  )
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

  // A refund with no amount used to save happily and book no expense at all, so
  // money left the company with nothing recording it. JOB-063 is how we found out.
  const needsAmount = cancelType === 'refund' && !(Number(amount) > 0)

  async function confirm() {
    setSaving(true)
    await onConfirm(cancelType, Number(amount) || 0, date, notes)
    setSaving(false)
  }

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center px-4 pb-4 pt-14 lg:pt-4" onClick={onClose}>
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
      <div className="relative rounded-[18px] p-5 w-full max-w-sm space-y-4" data-panel style={{ background: 'var(--panel-bg)', border: '1px solid var(--card-border)' }}
        onClick={e => e.stopPropagation()}>
        <p className="font-bold text-sm" style={{ color: 'var(--text-1)' }}>ยกเลิกสัญญา</p>

        <div className="flex gap-2">
          {([['forfeit', 'ยึดเงินจอง'], ['refund', 'คืนเงิน']] as const).map(([val, label]) => (
            <button key={val} onClick={() => setCancelType(val)}
              className="flex-1 py-2 rounded-[8px] text-sm font-semibold transition-all"
              style={cancelType === val
                ? { background: val === 'forfeit' ? 'var(--accent-red)' : 'var(--accent-blue)', color: '#fff' }
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
            <MoneyInput value={amount} onChange={setAmount} placeholder="0" ariaLabel="จำนวนเงิน"
              className="w-full px-3 py-2 rounded-[8px] text-sm focus:outline-none"
              style={{ background: 'var(--input-bg)', border: `1px solid ${needsAmount ? 'var(--accent-red)' : 'var(--divider)'}`, color: 'var(--text-1)' }} />
            {needsAmount && (
              <p className="text-micro mt-1" style={{ color: 'var(--accent-red)' }}>
                ต้องระบุยอดคืน เพื่อบันทึกเป็นรายจ่ายในหน้า Finance
              </p>
            )}
          </div>
          <div>
            <label className="text-xs mb-1 block" style={{ color: 'var(--text-2)' }}>
              {cancelType === 'forfeit' ? 'วันที่ยึดเงิน' : 'วันที่คืนเงิน'}
            </label>
            <DateInput value={date} onChange={e => setDate(e.target.value)}
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
          <button onClick={confirm} disabled={saving || needsAmount}
            className="flex-1 py-2 rounded-[8px] text-sm font-semibold text-white disabled:opacity-50"
            style={{ background: cancelType === 'forfeit' ? 'var(--accent-red)' : 'var(--accent-blue)' }}>
            {saving ? 'กำลังบันทึก...' : 'ยืนยันยกเลิก'}
          </button>
        </div>
      </div>
    </div>
  )
}

async function createBookedJob(customer: Customer, supabase: ReturnType<typeof createClient>): Promise<string> {
  // customers.booking_value was dropped: 3 rows out of 890, and two of those
  // three disagreed with the job they belonged to (฿300,000 against a ฿5,000
  // job). Opened for a customer that has no job at all, so there is no value to
  // carry across — customers.budget was retired 2026-09-07. Filled in on the
  // card afterwards.
  const revInc = 0
  const payload = {
    customer_id: customer.id,
    project_id: customer.project_id || null,
    room_no: customer.interested_room || '',
    customer_name: customer.customer_name,
    customer_type: (customer as any).customer_type || 'B2C',
    revenue_inc_vat: revInc,
    revenue_ex_vat: revInc ? exVatOf(revInc) : 0,
    working_status: 'จอง',
    // crm_stage has to be set with it. Ten jobs opened through here carried a
    // null stage while their working_status said จอง, and every other booked
    // job in the database says 'booked' — the Prospect board only placed them
    // correctly because it falls back to working_status.
    crm_stage: 'booked',
    // Not the customer's created_at. That is the day somebody typed the record
    // in, which for back-filled bookings is months after the sale: the ten jobs
    // opened this way all read 2 July 2026 because that is when the customer
    // list was imported, while three of them were booked the previous November.
    // A wrong sale date is worse than none — it silently moves revenue into the
    // wrong month on Sales Performance, Revenue and Targets. Left null, the
    // drawer shows วันรับจอง blank for someone to fill, and recording the first
    // instalment sets it to the payment date, which is the booking date.
    order_date: null,
    work_start_date: null,
    sales_id: salesIdOf(customer) || null,
  }
  // Fetch all JOB-* IDs and find true numeric max to avoid string-sort issues
  const { data: allJobIds } = await supabase.from('jobs').select('id').like('id', 'JOB-%')
  let baseNum = 1
  if (allJobIds && allJobIds.length > 0) {
    const nums = allJobIds.map(j => { const m = j.id.match(/JOB-(\d+)/); return m ? parseInt(m[1], 10) : 0 })
    baseNum = Math.max(...nums) + 1
  }
  for (let attempt = 0; attempt < 5; attempt++) {
    const jobId = `JOB-${baseNum + attempt}`
    const { error } = await supabase.from('jobs').insert({ id: jobId, ...payload })
    if (!error) return jobId
    if (!error.message.includes('duplicate key')) {
      console.error('createBookedJob insert failed:', error.message)
      return ''
    }
  }
  console.error('createBookedJob: failed after 5 attempts')
  return ''
}

function CustomerDrawer({ customer, focusJobId, focusJobWorkingStatus, focusJobCrmStage, projects, users, onClose, onUpdate, onStartJob }: {
  customer: Customer; focusJobId?: string | null; focusJobWorkingStatus?: string | null; focusJobCrmStage?: string | null; projects: Project[]; users: User[]
  onClose: () => void; onUpdate: (c: Customer) => void
  onStartJob: (c: Customer) => void
}) {
  const supabase = createClient()
  const jobsArr = ((customer as any).jobs as JobMeta[]) || []
  const focusJobMeta = focusJobId ? jobsArr.find((j: JobMeta) => j.id === focusJobId) : null
  // The job's stage, full stop. customers.status is on its way out and every
  // job carries a crm_stage of its own.
  const effectiveStage = focusJobMeta?.crm_stage || focusJobCrmStage || 'new'
  const stage = focusJobWorkingStatus === 'จอง' ? stageMap['booked'] : resolveStage(effectiveStage)
  const [editing, setEditing] = useState(false)
  // notes lives on the job now, so it has to be seeded from the job — spreading
  // the customer alone leaves the field undefined, and saving an untouched form
  // would then blank the note the job already had.
  // assigned_to is not a customer column any more — seed it from the job so the
  // picker still shows who is on this order.
  const [form, setForm] = useState({
    ...customer,
    notes: jobOf(customer, focusJobId).notes || '',
    // Same reason as notes: work_type is a job column, so spreading the customer
    // leaves it undefined and an untouched save would blank it.
    work_type: jobOf(customer, focusJobId).work_type || '',
    assigned_to: salesIdOf(customer, focusJobId),
    // The money is the job's now, so seed it from the job. Seeding from
    // customers.budget showed one customer's number on every one of their rooms.
    budget: jobOf(customer, focusJobId).revenue_inc_vat || 0,
  })
  const [saving, setSaving] = useState(false)
  const [jobs, setJobs] = useState<DetailJob[]>([])
  const [warranties, setWarranties] = useState<DetailWarranty[]>([])
  const [loadingDetail, setLoadingDetail] = useState(true)
  const [showCancel, setShowCancel] = useState(false)
  const [showCancelSection, setShowCancelSection] = useState(false)
  const [cancelConfirmed, setCancelConfirmed] = useState(false)
  const [docsExpanded, setDocsExpanded] = useState<Record<string, boolean>>({})
  const [bookedJob, setBookedJob] = useState<FullJob | null>(null)
  const [loadingBookedJob, setLoadingBookedJob] = useState(effectiveStage === 'booked' || focusJobWorkingStatus === 'จอง')
  const creatingBookedJob = useRef(false)

  useEffect(() => {
    let cancelled = false
    async function load() {
      setLoadingDetail(true)
      // Jobs used to link either by the customer's own id or by a `PROJECT-ROOM`
      // string, so this searched both. Every record is CST-nnnn now and the
      // second form matches nothing, so the customer's id is the whole answer.
      const jobQuery = supabase.from('jobs')
        .select('id, po_no, so_no, work_type, package_type, order_date, contract_date, expected_finish_date, revenue_inc_vat, customer_type, working_status, quotation1_url, quotation2_url, id_card_url, delivery_doc_url, satisfaction_url')
        .order('order_date', { ascending: false })
      const [{ data: jobsRaw }, { data: wRaw }] = await Promise.all([
        jobQuery.eq('customer_id', customer.id),
        // job_id matters here: a repeat order reuses the customer record, so
        // fetching by customer alone showed the first job's warranty on the
        // second job's drawer — a room booked minutes ago appeared to already
        // carry a warranty from work delivered months earlier.
        supabase.from('warranties').select('id, warranty_start, warranty_end, warranty_months, status, room, job_id')
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
      // When the drawer is showing one job, show that job's warranty only.
      // Rows still carrying no job_id are kept: 12 of them belong to customers
      // with two delivered jobs and cannot be attributed from the data alone,
      // and hiding a real warranty is worse than showing an unattributed one.
      const wAll = (wRaw || []) as DetailWarranty[]
      setWarranties(focusJobId
        ? wAll.filter(w => !(w as any).job_id || (w as any).job_id === focusJobId)
        : wAll)
      setLoadingDetail(false)
    }
    load()
    return () => { cancelled = true }
  }, [customer.id])

  async function loadOrCreateBookedJob() {
    // One run at a time, guarded by a ref rather than the loading state.
    // setLoadingBookedJob does not take effect until the next render, so two
    // invocations in the same tick — which is exactly what React does to effects
    // in development — both saw `false`, both found no job, and both inserted
    // one. Opening a single booked customer produced two identical empty jobs.
    // A ref updates synchronously, so the second call turns back here.
    if (creatingBookedJob.current) return
    creatingBookedJob.current = true
    try {
      await runLoadOrCreateBookedJob()
    } finally {
      creatingBookedJob.current = false
    }
  }

  async function runLoadOrCreateBookedJob() {
    setLoadingBookedJob(true)
    // Mark the load before doing any of it. The initial value of this flag is
    // computed when the drawer mounts, so a prospect opened at ใหม่ starts false
    // and stayed false when the stage moved to จอง — leaving the booked branch
    // with no job and no loading state, which rendered nothing at all and read
    // as the whole drawer vanishing the moment the button was pressed.
    setLoadingBookedJob(true)
    let jobId: string | null = focusJobId || null
    if (!jobId) {
      const { data: existing } = await supabase.from('jobs').select('id')
        .not('working_status', 'eq', 'ยกเลิก').order('id', { ascending: false }).limit(1)
        .eq('customer_id', customer.id)
      jobId = (existing as any)?.[0]?.id || null
    }
    if (!jobId) { jobId = await createBookedJob(customer, supabase) }
    if (jobId) { const j = await loadFullJob(jobId); setBookedJob(j) }
    setLoadingBookedJob(false)
  }

  // effectiveStage, not customer.status. The customer record carries one status
  // for the person, but a repeat order is a second job under the same record —
  // and that record was already 'booked' from the first job, so moving the new
  // job to จอง changed nothing this effect was watching and it never fired. The
  // stage that matters is the job's.
  useEffect(() => {
    if (effectiveStage === 'booked' || focusJobWorkingStatus === 'จอง') { loadOrCreateBookedJob() }
  }, [customer.id, effectiveStage, focusJobWorkingStatus]) // eslint-disable-line react-hooks/exhaustive-deps

  async function save() {
    setSaving(true)
    const payload: Record<string, unknown> = {
      customer_name: cleanName(form.customer_name), phone: form.phone, email: form.email,
      line_id: form.line_id, source: form.source, project_id: form.project_id || null,
      interested_room: form.interested_room,
      // budget is no longer written here — the money belongs to the job (see
      // the jobs update below). The column stays until the reads are cleaned up
      // in the next pass, but nothing adds to it any more.
      // status is not written here any more — the stage buttons above move the
      // job, and a customer has no stage of their own.
    }
    const { error } = await supabase.from('customers').update(payload).eq('id', customer.id)
    // The seller lives on the job — customers.assigned_to was dropped on
    // 2026-08-27. Option 1 as agreed: assigning here re-assigns every job this
    // customer holds.
    if (form.assigned_to !== salesIdOf(customer, focusJobId)) {
      const { error: sErr } = await supabase.from('jobs')
        .update({ sales_id: form.assigned_to || null }).eq('customer_id', customer.id)
      if (sErr) await showAlert(`บันทึกเซลล์ผู้รับผิดชอบไม่สำเร็จ: ${sErr.message}`)
    }
    // notes moved to jobs in the step-3 column drop — the customers copy is gone,
    // and writing it here made every save fail with "Could not find the 'notes'
    // column". See lib/ownership.ts.
    if (!error && focusJobId) {
      const revInc = Number(form.budget) || 0
      await supabase.from('jobs')
        .update({
          notes: form.notes || null, work_type: form.work_type || null,
          revenue_inc_vat: revInc,
          revenue_ex_vat: revInc ? Math.round((revInc / 1.07) * 100) / 100 : 0,
        })
        .eq('id', focusJobId)
    }
    // ต้องอัปเดต customer.jobs ด้วย ไม่ใช่แค่ระดับบนของฟอร์ม — ปุ่ม "จอง"
    // อ่าน work_type จาก `focusJobMeta` ซึ่งมาจากอาร์เรย์นี้ ถ้าไม่อัปเดต
    // ผู้ใช้เลือกประเภทงาน กดบันทึก แล้วกดจอง จะโดนเด้งว่า "ยังไม่ได้ระบุ
    // ประเภทงาน" ทั้งที่เพิ่งเลือกไป — ต้อง refresh หน้าถึงจะผ่าน
    if (!error) {
      const nextJobs = (((customer as any).jobs as JobMeta[]) || []).map(j =>
        j.id === focusJobId
          ? { ...j, work_type: form.work_type || null, notes: form.notes || null, revenue_inc_vat: Number(form.budget) || 0 }
          : j)
      onUpdate({ ...customer, ...form, jobs: nextJobs } as Customer)
    }
    setSaving(false)
    setEditing(false)
  }

  // ── Booked: render DealDrawer with stage-move topSlot ──────
  if (effectiveStage === 'booked' || focusJobWorkingStatus === 'จอง') {
    const closedStage = stageMap['closed']
    const totalSettled = (bookedJob?.installments || [])
      .filter(i => i.status === 'paid')
      .reduce((s, i) => s + Number(i.paid_amount ?? i.amount) + Number(i.voucher_amount ?? 0), 0)
    const jobValue = bookedJob?.revenue_inc_vat || 0
    const canClose = jobValue > 0 && totalSettled / jobValue >= 0.5

    const stagePills = (
      <div className="space-y-2">
        <p className="text-micro font-semibold uppercase tracking-widest" style={{ color: 'var(--text-3)' }}>ย้ายสถานะ</p>
        <div className="flex flex-wrap gap-1.5">
          {STAGES.filter(s => s.value !== 'booked' && s.value !== 'closed').map(s => (
            <button key={s.value} onClick={async () => {
              // The second place a stage can be moved. It cannot reach จอง, so
              // only the quote rule applies here — but it has to apply, or the
              // requirement is one button away from being skipped.
              // Reads the job, not the customer. The value moved to
              // jobs.revenue_inc_vat because one customer holds many rooms and
              // one budget field cannot say which room it belongs to.
              if (s.value === 'quoted' && !((jobOf(customer, focusJobId).revenue_inc_vat || 0) > 0)) {
                await showAlert('ยังไม่ได้ระบุมูลค่างาน — เสนอราคาแล้วต้องมีตัวเลข กรุณากรอกมูลค่างานก่อนย้ายสถานะ')
                return
              }
              // Stage belongs to the job. Writing customers.status as well moved
              // every other job this person holds — one card's stage change
              // rewrote the lot. The customer copy is only touched when there is
              // no job to carry it (a prospect that predates createProspectJob).
              if (focusJobId) await supabase.from('jobs').update({ crm_stage: s.value }).eq('id', focusJobId)
              const updatedJobs = focusJobId ? ((customer as any).jobs as JobMeta[] || []).map((j: JobMeta) => j.id === focusJobId ? { ...j, crm_stage: s.value } : j) : (customer as any).jobs
              onUpdate({ ...customer, jobs: updatedJobs } as any)
            }}
              className="px-2.5 py-1 rounded-[8px] text-label font-semibold"
              style={{ background: s.chip, color: '#fff', border: `1px solid ${s.border}` }}>
              → {s.label}
            </button>
          ))}
          {/* ปิดแล้ว เริ่มงาน — requires ≥50% settled */}
          <button
            disabled={!canClose}
            title={canClose ? undefined : `ต้องชำระอย่างน้อย 50% ก่อนเริ่มงาน (ชำระแล้ว ${jobValue > 0 ? Math.round(totalSettled / jobValue * 100) : 0}%)`}
            onClick={async () => {
              if (focusJobId) await supabase.from('jobs').update({ crm_stage: 'closed' }).eq('id', focusJobId)
              const updatedJobs = focusJobId ? ((customer as any).jobs as JobMeta[] || []).map((j: JobMeta) => j.id === focusJobId ? { ...j, crm_stage: 'closed' } : j) : (customer as any).jobs
              onUpdate({ ...customer, jobs: updatedJobs } as any)
            }}
            className="px-2.5 py-1 rounded-[8px] text-label font-semibold transition-opacity"
            style={{
              background: canClose ? closedStage.chip : 'rgba(100,100,100,0.3)',
              color: '#fff',
              border: `1px solid ${canClose ? closedStage.border : 'rgba(100,100,100,0.4)'}`,
              opacity: canClose ? 1 : 0.45,
              cursor: canClose ? 'pointer' : 'not-allowed',
            }}>
            → {closedStage.label}
          </button>
        </div>
        {!canClose && bookedJob && (
          <p className="text-micro" style={{ color: 'var(--text-3)' }}>
            ต้องชำระ ≥50% ก่อนเริ่มงาน · ชำระแล้ว {jobValue > 0 ? Math.round(totalSettled / jobValue * 100) : 0}% ({jobValue > 0 ? `฿${Math.round(totalSettled).toLocaleString('th-TH')} / ฿${Math.round(jobValue).toLocaleString('th-TH')}` : '—'})
          </p>
        )}
      </div>
    )
    if (loadingBookedJob || !bookedJob) return (
      <>
        <div className="fixed inset-0 z-40 bg-black/60 backdrop-blur-sm" onClick={onClose} />
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center px-4 pb-4 pt-14 lg:pt-4">
          <div className="rounded-[18px] px-5 py-4 text-center space-y-2"
            style={{ background: 'var(--panel-bg)', border: '1px solid var(--card-border)' }}>
            {loadingBookedJob ? (
              <p className="text-xs" style={{ color: 'var(--text-3)' }}>กำลังโหลด...</p>
            ) : (
              // Never a blank screen: if the job could not be loaded, say so and
              // leave a way out. Returning null here is what made the drawer
              // look like it had crashed.
              <>
                <p className="text-xs font-semibold" style={{ color: 'var(--accent-orange)' }}>ยังเปิดข้อมูลงานไม่ได้</p>
                <p className="text-micro" style={{ color: 'var(--text-3)' }}>สถานะย้ายเป็นจองแล้ว · ลองปิดแล้วเปิดใหม่อีกครั้ง</p>
                <button onClick={onClose} className="btn-secondary text-xs px-3 py-1.5">ปิด</button>
              </>
            )}
          </div>
        </div>
      </>
    )
    return (
      <DealDrawer job={bookedJob} onClose={onClose} onRefresh={loadOrCreateBookedJob} topSlot={effectiveStage === 'booked' ? stagePills : undefined} />
    )
  }

  return (
    <>
      {/* Backdrop */}
      <div className="fixed inset-0 z-40 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      {/* Panel */}
      <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center pointer-events-none px-4 pb-4 pt-14 lg:pt-4">
      <div className="w-full max-w-[460px] max-h-[90vh] flex flex-col rounded-[18px] shadow-2xl pointer-events-auto"
        data-panel style={{ background: 'var(--panel-bg)', border: '1px solid var(--card-border)' }}>

        {/* Header — like DealDrawer */}
        <div className="flex items-center justify-between px-5 py-4" style={{ borderBottom: '1px solid var(--divider)' }}>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="px-2.5 py-1 rounded-[8px] font-bold text-xs"
                style={{ background: stage.badge, color: stage.text }}>
                {stage.label}
              </span>
              {(jobOf(customer, focusJobId).room_no || customer.interested_room) && (
                <span className="font-semibold text-sm" style={{ color: 'var(--text-1)' }}>
                  {jobOf(customer, focusJobId).room_no || customer.interested_room}
                </span>
              )}
            </div>
            <p className="font-bold text-sm mt-1 truncate" style={{ color: 'var(--text-1)' }}>{customer.customer_name}</p>
            <p className="text-xs mt-1 truncate" style={{ color: 'var(--text-3)' }}>
              {(customer as any).projects?.name || ''}
              {jobOf(customer, focusJobId).sales?.name ? ` · ${jobOf(customer, focusJobId).sales.name}` : ''}
            </p>
          </div>
          <div className="flex items-center gap-1 flex-shrink-0 ml-2">
            {effectiveStage !== 'closed' && (
              <button onClick={() => setEditing(e => !e)}
                className="p-2 rounded-[8px]" style={{ background: editing ? 'var(--accent)' : 'var(--hover-bg)', color: editing ? '#fff' : 'var(--text-2)' }}>
                <Pencil size={14} />
              </button>
            )}
            <button onClick={onClose} className="p-2 rounded-[8px]" style={{ background: 'var(--hover-bg)', color: 'var(--text-2)' }}>
              <X size={14} />
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-5 space-y-4">

          {/* Budget card */}
          {(() => {
            const jobRev = jobs.reduce((s, j) => s + (j.revenue_inc_vat || 0), 0)
            const displayVal = jobRev
            const label = jobRev > 0 ? 'มูลค่างาน (inc.VAT)' : 'งบประมาณ'
            return (
          <div className="rounded-[8px] p-4 flex items-center justify-between" style={{ background: 'var(--hover-bg)' }}>
            <div>
              <p className="text-xs" style={{ color: 'var(--text-3)' }}>{label}</p>
              <p className="text-xl font-bold mt-1" style={{ color: displayVal > 0 ? 'var(--text-1)' : 'var(--text-3)' }}>
                {displayVal > 0 ? f(displayVal) : 'ไม่ระบุ'}
              </p>
            </div>
            {customer.source && (
              <span className="text-label px-2 py-1 rounded-[8px] font-semibold"
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
                <p className="text-micro font-semibold uppercase tracking-widest" style={{ color: 'var(--text-3)' }}>
                  งานงานที่ {seqIdx[j.id]} · {j.customer_type}
                </p>
              )}
              <div className="grid grid-cols-2 gap-3">
                <div className="rounded-[8px] px-3 py-2.5" style={{ background: 'var(--hover-bg)' }}>
                  <p className="text-micro mb-1" style={{ color: 'var(--text-3)' }}>{j.customer_type === 'B2B' ? 'วันรับ PO / ยอด' : 'วันรับจอง'}</p>
                  <DateInput defaultValue={j.order_date || ''}
                    onBlur={async e => {
                      const v = e.target.value || null
                      await supabase.from('jobs').update({ order_date: v }).eq('id', j.id)
                      setJobs(prev => prev.map(x => x.id === j.id ? { ...x, order_date: v } : x))
                    }}
                    className="w-full text-xs font-semibold focus:outline-none"
                    style={{ background: 'transparent', color: j.order_date ? 'var(--text-1)' : 'var(--text-3)', border: 'none' }} />
                </div>
                <div className="rounded-[8px] px-3 py-2.5" style={{ background: 'var(--hover-bg)' }}>
                  <p className="text-micro mb-1" style={{ color: 'var(--text-3)' }}>วันเซ็นสัญญา</p>
                  <DateInput defaultValue={j.contract_date || ''}
                    onBlur={async e => {
                      const v = e.target.value || null
                      await supabase.from('jobs').update({ contract_date: v }).eq('id', j.id)
                      setJobs(prev => prev.map(x => x.id === j.id ? { ...x, contract_date: v } : x))
                    }}
                    className="w-full text-xs font-semibold focus:outline-none"
                    style={{ background: 'transparent', color: j.contract_date ? 'var(--text-1)' : 'var(--text-3)', border: 'none' }} />
                </div>
              </div>
            </div>
          ))})()}

          {/* Product and ประเภทงาน per job. They sit side by side because they are
              the two halves of "what is this job" and their names invite mixing
              up: someone picked Product = Curtain, pressed จอง, and was told to
              choose a ประเภทงาน they could not see — that field was buried in
              the collapsed edit form, and Product does not satisfy the rule.
              Different columns, different vocabularies (RPT vs Curtain), both
              needed. Editing either writes straight through, same as before. */}
          {!loadingDetail && jobs.map(j => (
            <div key={`prod-${j.id}`} className="grid grid-cols-2 gap-2">
              <div className="flex flex-col gap-1">
                <p className="field-label">Product{jobs.length > 1 ? ` (งาน ${j.id})` : ''}</p>
                <div className="relative">
                  <select
                    value={j.package_type || ''}
                    onChange={async e => {
                      const v = e.target.value || null
                      await supabase.from('jobs').update({ package_type: v }).eq('id', j.id)
                      setJobs(prev => prev.map(x => x.id === j.id ? { ...x, package_type: v || '' } : x))
                    }}
                    className="field-input appearance-none pr-7">
                    <option value="">— เลือก Product —</option>
                    {PRODUCT_TYPES.map(p => <option key={p} value={p}>{p}</option>)}
                  </select>
                  <ChevronDown size={13} className="absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none" style={{ color: 'var(--text-3)' }} />
                </div>
              </div>
              <div className="flex flex-col gap-1">
                <p className="field-label">ประเภทงาน{jobs.length > 1 ? ` (งาน ${j.id})` : ''}</p>
                <div className="relative">
                  <select
                    value={j.work_type || ''}
                    onChange={async e => {
                      const v = e.target.value || null
                      await supabase.from('jobs').update({ work_type: v }).eq('id', j.id)
                      setJobs(prev => prev.map(x => x.id === j.id ? { ...x, work_type: v || '' } : x))
                      // Keep the card's copy in step too, so the edit form and
                      // anything else reading customer.jobs agrees with this.
                      onUpdate({ ...customer, jobs: (((customer as any).jobs as JobMeta[]) || [])
                        .map(x => x.id === j.id ? { ...x, work_type: v } : x) } as any)
                    }}
                    className="field-input appearance-none pr-7"
                    style={!j.work_type ? { borderColor: 'color-mix(in srgb, var(--accent-orange) 55%, transparent)' } : undefined}>
                    <option value="">— เลือกประเภทงาน —</option>
                    {WORK_TYPES.map(w => <option key={w} value={w}>{w}</option>)}
                  </select>
                  <ChevronDown size={13} className="absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none" style={{ color: 'var(--text-3)' }} />
                </div>
              </div>
            </div>
          ))}

          {/* ย้ายสถานะ — hidden for closed prospects (already in My Deals) */}
          {effectiveStage !== 'closed' && <div className="space-y-2">
            <p className="text-micro font-semibold uppercase tracking-widest" style={{ color: 'var(--text-3)' }}>ย้ายสถานะ</p>
            <div className="flex flex-wrap gap-1.5">
              {STAGES.filter(s => s.value !== effectiveStage && s.value !== 'closed' && s.value !== 'lost').map(s => (
                <button key={s.value} onClick={async () => {
                  // Ask for each fact at the stage where it exists, not at
                  // creation. A quote implies a number; a booking implies a
                  // scope. Demanding either up front only produces guesses —
                  // 37 of 52 live prospects have no budget precisely because
                  // nobody knew it on day one.
                  if (s.value === 'quoted' && !((focusJobMeta?.revenue_inc_vat || 0) > 0)) {
                    await showAlert('ยังไม่ได้ระบุมูลค่างาน — เสนอราคาแล้วต้องมีตัวเลข กรุณากรอกมูลค่างานก่อนย้ายสถานะ')
                    return
                  }
                  // Ask the job, not the customer. A repeat order creates a new
                  // job row carrying its own work type and reuses the existing
                  // customer record, whose work_type stays as it was — usually
                  // blank, since it is only written when a customer is created.
                  // So the second job for a room could never leave ใหม่: the
                  // guard read a field the repeat flow never touches, and the
                  // page offers no way to fill it. The job is the right thing to
                  // ask anyway — one customer can order two different kinds of
                  // work, and only the job knows which is which.
                  //
                  // Ask the database, not the card. The card's copy of the job
                  // is assembled in several places — creating a prospect, saving
                  // the edit form, the repeat order — and any one of them that
                  // forgets to carry work_type makes this guard reject a job that
                  // has one. That is exactly what happened: a prospect created
                  // with ประเภทงาน filled in could not be booked until the page
                  // was reloaded, because the card built at creation left the
                  // field out. One read is cheaper than trusting every writer.
                  if (s.value === 'booked' && focusJobId) {
                    const { data: fresh } = await supabase.from('jobs')
                      .select('work_type').eq('id', focusJobId).maybeSingle()
                    if (!((fresh?.work_type || '').trim())) {
                      await showAlert('ยังไม่ได้ระบุประเภทงาน — จองแล้วต้องรู้ว่าเป็นงานแบบไหน กรุณาเลือกประเภทงาน (ช่องข้าง Product) ก่อนย้ายสถานะ')
                      return
                    }
                  }
                  // Reaching จอง has to set working_status too. A prospect's job row
                  // is created with working_status null, and every page that lists
                  // live work filters `working_status not in (...)`, which drops
                  // NULL along with the cancelled — so a booked ฿3.8M job sat
                  // invisible on Finance, My Deals and Payments alike. Moving the
                  // stage was the only step anyone took, so the stage has to carry it.
                  const jobPatch: Record<string, unknown> = { crm_stage: s.value }
                  if (s.value === 'booked') jobPatch.working_status = 'จอง'
                  if (focusJobId) await supabase.from('jobs').update(jobPatch).eq('id', focusJobId)
                  const updatedJobs = focusJobId ? ((customer as any).jobs as JobMeta[] || []).map((j: JobMeta) => j.id === focusJobId ? { ...j, ...jobPatch } : j) : (customer as any).jobs
                  onUpdate({ ...customer, jobs: updatedJobs } as any)
                }}
                  className="px-2.5 py-1 rounded-[8px] text-label font-semibold transition-colors"
                  style={{ background: s.chip, color: '#fff', border: `1px solid ${s.border}` }}>
                  → {s.label}
                </button>
              ))}
              {effectiveStage !== 'lost' && (
                <button onClick={async () => {
                  if (focusJobId) await supabase.from('jobs').update({ crm_stage: 'lost' }).eq('id', focusJobId)
                  const updatedJobs = focusJobId ? ((customer as any).jobs as JobMeta[] || []).map((j: JobMeta) => j.id === focusJobId ? { ...j, crm_stage: 'lost' } : j) : (customer as any).jobs
                  onUpdate({ ...customer, jobs: updatedJobs } as any)
                }}
                  className="px-2.5 py-1 rounded-[8px] text-label font-semibold transition-colors"
                  style={{ background: 'color-mix(in srgb, var(--accent-red) 20%, transparent)', color: '#fff', border: '1px solid color-mix(in srgb, var(--accent-red) 50%, transparent)' }}>
                  → หลุด
                </button>
              )}
            </div>
          </div>}

          {/* Edit form */}
          {editing && (
            <div className="space-y-3 p-4 rounded-[8px]" style={{ background: 'var(--hover-bg)', border: '1px solid var(--divider)' }}>
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
                <Input label="มูลค่างาน (ประมาณ)" type="number" value={String(form.budget || '')} onChange={e => setForm(p => ({ ...p, budget: Number(e.target.value) }))} />
                <Select label="ช่องทาง" value={form.source} onChange={e => setForm(p => ({ ...p, source: e.target.value }))} options={SOURCE_OPTS} />
              </div>
              {/* ประเภทงาน is offered when the prospect is created but was not
                  editable afterwards, and moving to จอง refuses to proceed
                  without it — so a prospect saved without one could not be
                  booked from this page at all, only by going round through Job
                  Registry. It writes to the job, which is where work_type lives. */}
              <Select label="ประเภทงาน" value={form.work_type}
                onChange={e => setForm(p => ({ ...p, work_type: e.target.value }))}
                options={[{ value: '', label: '— เลือก —' }, ...WORK_TYPES.map(w => ({ value: w, label: w }))]} />
              {/* No status picker: use the ย้ายสถานะ buttons, which move the
                  job this card is for rather than the whole customer. */}
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
              {jobOf(customer, focusJobId).notes && (
                <div className="p-3 rounded-[8px] text-xs" style={{ background: 'var(--hover-bg)', color: 'var(--text-2)' }}>{jobOf(customer, focusJobId).notes}</div>
              )}
            </div>
          )}

          {/* Warranties */}
          {!loadingDetail && warranties.length > 0 && (
            <div className="rounded-[8px] overflow-hidden" style={{ border: '1px solid var(--divider)' }}>
              <div className="px-4 py-2.5" style={{ background: 'var(--hover-bg)' }}>
                <span className="text-micro font-semibold uppercase tracking-widest" style={{ color: 'var(--text-3)' }}>ประกัน</span>
              </div>
              <div className="divide-y" style={{ borderColor: 'var(--divider)' }}>
                {warranties.map(w => (
                  <div key={w.id} className="px-4 py-2.5 flex items-center justify-between text-xs">
                    <span style={{ color: 'var(--text-2)' }}>ห้อง {w.room} · {w.warranty_months} เดือน</span>
                    <span style={{ color: w.status === 'active' ? 'var(--accent-green)' : 'var(--text-3)' }}>{fdate(w.warranty_end)}</span>
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
              <div key={j.id} className="rounded-[8px] overflow-hidden" style={{ border: '1px solid var(--divider)' }}>
                <button className="w-full flex items-center justify-between px-4 py-2.5"
                  style={{ background: 'var(--hover-bg)', color: 'var(--text-3)' }}
                  onClick={() => setDocsExpanded(e => ({ ...e, [j.id]: !e[j.id] }))}>
                  <span className="text-xs">เอกสาร{jobs.length > 1 ? ` งานงานที่ ${seqIdx2[j.id]}` : ''}</span>
                  <div className="flex items-center gap-2">
                    <span className="text-micro" style={{ color: 'var(--text-3)' }}>{docCount}/5</span>
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
          <div className="rounded-[8px] p-3" style={{ border: '1px solid var(--divider)' }}>
            <FileAttach
              customerId={customer.id}
              projectName={(customer as any).projects?.name || customer.project_id || ''}
              roomNo={customer.interested_room || ''}
            />
          </div>

          {/* Already cancelled — the cancel toggle below is gone once the stage is
              lost, so without this the drawer said nothing about what was settled. */}
          {(() => { const cj = jobOf(customer, focusJobId); const co = cancelOutcome(cj.cancel_type); return co && (
            <div className="rounded-[8px] p-3" style={{ background: `color-mix(in srgb, ${co.color} 8%, transparent)`, border: `1px solid color-mix(in srgb, ${co.color} 25%, transparent)` }}>
              <p className="text-label font-semibold" style={{ color: co.color }}>ยกเลิกสัญญา · {co.label}</p>
              <p className="text-xs mt-1" style={{ color: 'var(--text-2)' }}>
                {cj.cancel_amount ? `฿${Math.round(cj.cancel_amount).toLocaleString('th-TH')}` : 'ไม่ได้ระบุยอด'}
                {cj.cancel_date ? ` · ${new Date(cj.cancel_date).toLocaleDateString('th-TH', { day: 'numeric', month: 'short', year: '2-digit' })}` : ''}
              </p>
            </div>
          ) })()}

          {/* Cancel — hidden behind toggle (booked only) */}
          {effectiveStage === 'booked' && (
            <div>
              <button
                onClick={() => { setShowCancelSection(s => !s); setCancelConfirmed(false) }}
                className="flex items-center gap-1 text-label transition-colors"
                style={{ color: 'var(--text-3)' }}>
                <ChevronRight size={12} style={{ transform: showCancelSection ? 'rotate(90deg)' : 'none', transition: 'transform 0.2s' }} />
                สถานะพิเศษ / ลูกค้ายกเลิก
              </button>
              {showCancelSection && (
                <div className="mt-2 rounded-[8px] p-3 space-y-3"
                  style={{ background: 'color-mix(in srgb, var(--accent-red) 6%, transparent)', border: '1px solid color-mix(in srgb, var(--accent-red) 20%, transparent)' }}>
                  <label className="flex items-center gap-2 cursor-pointer select-none">
                    <input type="checkbox" checked={cancelConfirmed} onChange={e => setCancelConfirmed(e.target.checked)}
                      className="w-4 h-4 rounded" style={{ accentColor: 'var(--accent-red)' }} />
                    <span className="text-xs" style={{ color: 'var(--text-2)' }}>ยืนยันว่าต้องการยกเลิกสัญญา</span>
                  </label>
                  <button onClick={() => setShowCancel(true)} disabled={!cancelConfirmed}
                    className="w-full py-2 rounded-[8px] text-xs font-semibold transition-all disabled:opacity-30"
                    style={{ background: 'color-mix(in srgb, var(--accent-red) 15%, transparent)', border: '1px solid color-mix(in srgb, var(--accent-red) 40%, transparent)', color: 'var(--accent-red)' }}>
                    ยกเลิกสัญญา
                  </button>
                </div>
              )}
            </div>
          )}

          {/* Action — เริ่มงาน for booked */}
          {effectiveStage === 'booked' && (
            <div className="pt-1" style={{ borderTop: '1px solid var(--divider)' }}>
              <button
                onClick={() => onStartJob(customer)}
                className="w-full py-3 rounded-[8px] font-bold text-sm text-white"
                style={{ background: 'var(--accent-green)' }}>
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
            // 'lost', not 'cancelled': customers.status has a CHECK constraint listing
            // the seven CRM stages, so every cancel written here was silently rejected
            // by the database while the UI optimistically showed it as done. The money
            // outcome is carried by cancel_type/cancel_amount and shown as its own chip.
            // Only the stage. Cancellation belongs to the job — one order can be
            // cancelled while another for the same customer goes ahead — and the
            // job update just below records type, date, amount and notes. The
            // customer's cancel_* columns were dropped on 2026-08-25, and writing
            // cancel_notes to a column that no longer exists failed the whole
            // update, so the cancel button stopped working until this change.
            // Shared with My Deals and JobDrawer — see lib/jobLifecycle.
            if (focusJobId) {
              const fj = jobOf(customer, focusJobId)
              const res = await cancelJob(supabase, {
                id: focusJobId,
                customer_id: customer.id,
                customer_name: customer.customer_name,
                room_no: fj?.room_no ?? null,
              }, { type, amount, date, notes })
              if (!res.ok) { await showAlert(res.error!); return }
              if (res.warning) await showAlert(res.warning)
            }
            // A prospect with no job row used to be closed by writing
            // customers.status = 'lost' here. That column is gone — stage lives
            // on the job now — so the write could only fail and stop the
            // cancellation with an error. Nothing takes its place: with no job
            // there is nothing to mark, and the card is driven by the jobs the
            // customer holds.
            onUpdate({ ...customer, status: 'lost', cancel_type: type, cancel_amount: amount || null } as any)
            setShowCancel(false)
          }}
        />
      )}
    </>
  )
}

// ─── Start Job Modal ────────────────────────────────────────
type BookingData = {
  customer_type: string | null
}

function StartJobModal({ customer, users, onClose, onSaved }: {
  customer: Customer; users: User[]
  onClose: () => void; onSaved: () => void
}) {
  const supabase = createClient()
  const [roomNo, setRoomNo] = useState(customer.interested_room || '')
  const [revenue, setRevenue] = useState(0)
  const [workType, setWorkType] = useState('N-RPT/Event')
  const [custType, setCustType] = useState<'B2C' | 'B2B'>('B2C')
  const [pkgType, setPkgType] = useState('')
  const [orderDate, setOrderDate] = useState(todayStr())
  const [salesId, setSalesId] = useState(salesIdOf(customer) || '')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [booking, setBooking] = useState<BookingData | null>(null)

  const inputStyle = { background: 'var(--input-bg)', border: '1px solid var(--divider)', color: 'var(--text-1)' }
  const revenueEx = revenue ? exVatOf(revenue) : 0

  // Fetch booking data to pre-fill
  useEffect(() => {
    // Only customer_type survives on customers. booking_value and job_type were
    // dropped (3 and 1 rows), and work_type was never in this select at all —
    // `b.work_type` had been reading undefined since customers.work_type went.
    supabase.from('customers')
      .select('customer_type')
      .eq('id', customer.id).single()
      .then(({ data }) => {
        if (!data) return
        const b = data as BookingData
        setBooking(b)
        if (b.customer_type === 'B2B') setCustType('B2B')
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
    const customerId = await resolveCustomerId(supabase, {
      projectId: customer.project_id, roomNo: roomNo.trim(),
      customerName: customer.customer_name, customerType: custType,
    })

    // Upsert job-customer record (FK)
    await supabase.from('customers').upsert({
      id: customerId, project_id: customer.project_id,
      customer_name: customer.customer_name, customer_type: custType,
    }, { onConflict: 'id', ignoreDuplicates: true })

    // Insert job
    const { error: jobErr } = await supabase.from('jobs').insert({
      id: jobId, customer_id: customerId,
      project_id: customer.project_id, room_no: roomNo.trim(),
      customer_name: customer.customer_name, customer_type: custType,
      work_type: workType, package_type: pkgType || null, order_date: orderDate,
      revenue_inc_vat: revenue, revenue_ex_vat: revenueEx,
      // The customer below is set to closed; the job has to say so too, or the
      // two disagree about the same deal and Prospects, which groups by
      // crm_stage, loses the card.
      transfer_amount: revenue, working_status: 'ดำเนินการ', crm_stage: 'closed',
      accounting_status: 'Reserved', sales_id: salesId || null,
    })

    if (jobErr) { setError('เกิดข้อผิดพลาด: ' + jobErr.message); setSaving(false); return }

    // Update pipeline prospect to closed
    setSaving(false); onSaved(); onClose()
  }

  return (
    <div className="fixed inset-0 z-[70] flex items-end sm:items-center justify-center px-4 pb-4 pt-14 lg:pt-4" onClick={onClose}>
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
      <div className="relative w-full max-w-sm rounded-[18px] shadow-2xl"
        data-panel style={{ background: 'var(--panel-bg)', border: '1px solid var(--card-border)' }}
        onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between p-5" style={{ borderBottom: '1px solid var(--divider)' }}>
          <div>
            <h3 className="font-semibold text-sm" style={{ color: 'var(--text-1)' }}>เริ่มงาน</h3>
            <p className="text-xs mt-1" style={{ color: 'var(--text-3)' }}>{customer.customer_name} · {(customer as any).projects?.name || customer.project_id}</p>
          </div>
          <button onClick={onClose} style={{ color: 'var(--text-2)' }}><X size={18} /></button>
        </div>
        <div className="p-5 space-y-3">
          {/* Booking data banner */}
          {booking && (
            <div className="rounded-[8px] px-3 py-2.5 flex flex-col gap-1"
              style={{ background: 'color-mix(in srgb, var(--accent-green) 10%, transparent)', border: '1px solid color-mix(in srgb, var(--accent-green) 25%, transparent)' }}>
              <p className="text-label font-semibold" style={{ color: 'var(--accent-green)' }}>พบข้อมูลจอง</p>
              <p className="text-label" style={{ color: 'var(--text-2)' }}>{booking.customer_type || '—'}</p>
            </div>
          )}
          <div>
            <label className="text-xs mb-1 block" style={{ color: 'var(--text-2)' }}>เลขห้อง *</label>
            <input value={roomNo} onChange={e => setRoomNo(e.target.value)} autoFocus
              className="w-full px-3 py-2 rounded-[8px] text-sm focus:outline-none"
              style={inputStyle} placeholder="เช่น A-101" />
          </div>
          <div>
            <label className="text-xs mb-1 block" style={{ color: 'var(--text-2)' }}>มูลค่างาน (inc.VAT)</label>
            <input type="number" value={revenue || ''} onChange={e => setRevenue(Number(e.target.value))}
              className="w-full px-3 py-2 rounded-[8px] text-sm focus:outline-none" style={inputStyle} />
            {revenue > 0 && <p className="text-label mt-1" style={{ color: 'var(--text-3)' }}>exc.VAT ≈ ฿{revenueEx.toLocaleString()}</p>}
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
            <DateInput value={orderDate} onChange={e => setOrderDate(e.target.value)}
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
          {error && <p className="text-xs text-danger">{error}</p>}
          <button onClick={save} disabled={saving}
            className="w-full py-3 rounded-[8px] font-semibold text-sm text-white"
            style={{ background: saving ? '#666' : 'var(--accent-green)' }}>
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
      className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-[8px] text-xs font-semibold transition-all active:scale-95"
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
      className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-[8px] text-xs font-semibold transition-all active:scale-95"
      style={{
        background: copied ? 'color-mix(in srgb, var(--accent-green) 15%, transparent)' : 'rgba(0,185,107,0.08)',
        border: `1px solid ${copied ? 'color-mix(in srgb, var(--accent-green) 40%, transparent)' : 'rgba(0,185,107,0.25)'}`,
        color: copied ? 'var(--accent-green)' : 'var(--accent-green)',
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
      <div className="w-4 h-4 rounded-[8px] flex items-center justify-center flex-shrink-0"
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
      <span className="mt-1 flex-shrink-0" style={{ color: 'var(--text-3)' }}>{icon}</span>
      <div>
        <p className="text-micro" style={{ color: 'var(--text-3)' }}>{label}</p>
        <p style={{ color: 'var(--text-1)' }}>{value}</p>
      </div>
    </div>
  )
}

// ─── Add/Edit modal form ────────────────────────────────────
function CustomerForm({ initial, projects, users, onSave, onClose }: {
  initial?: typeof emptyForm; projects: Project[]; users: User[]
  onSave: (data: typeof emptyForm, ackNameWarn?: boolean) => Promise<string | null>; onClose: () => void
}) {
  const isAdd = !initial
  const [form, setForm] = useState(isAdd ? { ...emptyForm, status: 'new' } : initial)
  const [saving, setSaving] = useState(false)
  const [errMsg, setErrMsg] = useState<string | null>(null)
  // A near-duplicate company name is a warning, not a rule. Two records for the
  // same developer in the same project are usually the same buyer typed twice —
  // but not always, so the second submit goes through. Reset whenever the name
  // is edited, so acknowledging one name never waves through the next.
  const [nameWarn, setNameWarn] = useState<string | null>(null)
  const s = (k: keyof typeof emptyForm) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) =>
    setForm(p => ({ ...p, [k]: e.target.value }))

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    // Required at creation: the four things that identify a prospect and let
    // anyone follow it up. All four were already being filled by hand on every
    // one of the 52 live prospects (room and project at 100%, a contact on 50
    // of 52), so this codifies what people do rather than asking for more.
    //
    // Budget and work_type are deliberately NOT required here. At the moment a
    // prospect is created nobody has discussed price or scope, so demanding
    // them would only produce guesses — data that looks complete and is not.
    // They are required later, at the stage where the answer actually exists.
    if (!form.customer_name.trim()) { setErrMsg('กรุณากรอกชื่อลูกค้า'); return }
    if (!form.project_id) { setErrMsg('กรุณาเลือกโครงการ'); return }
    if (!form.interested_room.trim()) { setErrMsg('กรุณากรอกห้องที่สนใจ'); return }
    if (!form.phone.trim() && !form.line_id.trim()) {
      setErrMsg('กรุณากรอกเบอร์โทรหรือ Line ID อย่างน้อยหนึ่งช่อง — ไม่มีช่องทางติดต่อจะตามงานต่อไม่ได้')
      return
    }
    setSaving(true)
    setErrMsg(null)
    const err = await onSave(form, !!nameWarn)
    setSaving(false)
    if (err && err.startsWith('WARN:')) { setNameWarn(err.slice(5)); return }
    if (err) setErrMsg(err)
  }

  return (
    <form onSubmit={submit} className="space-y-3">
      <Input label="ชื่อลูกค้า *" value={form.customer_name}
        onChange={e => { setNameWarn(null); setForm(p => ({ ...p, customer_name: e.target.value })) }} autoFocus />
      {nameWarn && (
        <p className="text-xs py-1.5 px-2 rounded-[8px]"
          style={{ color: 'var(--accent-orange)', background: 'color-mix(in srgb, var(--accent-orange) 12%, transparent)' }}>
          {nameWarn} — กดบันทึกอีกครั้งหากเป็นคนละราย
        </p>
      )}
      {/* One of the two, not both — a single asterisk on each would have read as
          "fill in both", so the requirement is spelled out under the pair. */}
      <div>
        <div className="grid grid-cols-2 gap-3">
          <Input label="โทรศัพท์" value={form.phone} onChange={s('phone')} />
          <Input label="Line ID" value={form.line_id} onChange={s('line_id')} />
        </div>
        <p className="text-micro mt-1" style={{ color: 'var(--text-3)' }}>* กรอกอย่างน้อยหนึ่งช่องทาง</p>
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
                background: form.customer_type === t ? (t === 'B2B' ? 'color-mix(in srgb, var(--accent-amber) 15%, transparent)' : 'color-mix(in srgb, var(--accent-blue) 12%, transparent)') : 'var(--hover-bg)',
                color: form.customer_type === t ? (t === 'B2B' ? 'var(--accent-amber)' : 'var(--accent-blue)') : 'var(--text-3)',
                borderColor: form.customer_type === t ? (t === 'B2B' ? 'color-mix(in srgb, var(--accent-amber) 50%, transparent)' : 'color-mix(in srgb, var(--accent-blue) 50%, transparent)') : 'var(--divider)',
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
        <Input label="ห้องที่สนใจ *" value={form.interested_room} onChange={s('interested_room')} />
      </div>
      <Select label="ประเภทงาน" value={form.work_type} onChange={s('work_type')}
        options={[{ value: '', label: '— เลือก —' }, ...WORK_TYPES.map(t => ({ value: t, label: t }))]} />
      <div className="grid grid-cols-2 gap-3">
        <Input label="มูลค่างาน (ประมาณ)" type="number" value={String(form.budget || '')} onChange={e => setForm(p => ({ ...p, budget: Number(e.target.value) }))} />
        <Select label="ช่องทาง" value={form.source} onChange={s('source')} options={SOURCE_OPTS} />
      </div>
      {/* Stage moved out of this form: it belongs to the job, and a customer
          with several jobs has no single stage to edit here. */}
      <div><p className="text-xs mb-1" style={{ color: 'var(--text-2)' }}>มอบหมายให้ (Sales)</p>
        <SearchableSelect value={form.assigned_to}
          onChange={v => setForm(p => ({ ...p, assigned_to: String(v) }))}
          options={[{ value: '', label: '— เลือก —' }, ...users.map(u => ({ value: u.id, label: u.name }))]} /></div>
      <TextArea label="หมายเหตุ" value={form.notes} onChange={s('notes')} rows={2} />
      {errMsg && <p className="text-xs py-1 px-2 rounded-[8px]" style={{ color: 'var(--accent-red)', background: 'color-mix(in srgb, var(--accent-red) 12%, transparent)' }}>{errMsg}</p>}
      <div className="flex gap-2 pt-1">
        <button type="button" onClick={onClose} className="flex-1 py-2.5 rounded-[8px] text-sm border" style={{ border: '1px solid var(--divider)', color: 'var(--text-2)' }}>ยกเลิก</button>
        <button type="submit" disabled={saving}
          className="flex-1 py-2.5 rounded-[8px] text-sm font-semibold text-white"
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
  const [bookedJobs, setBookedJobs] = useState<BookedJob[]>([])
  const [selectedBookedJobFull, setSelectedBookedJobFull] = useState<FullJob | null>(null)
  const [loadingBookedJobFull, setLoadingBookedJobFull] = useState(false)
  const [projects, setProjects] = useState<Project[]>([])
  const [users, setUsers] = useState<User[]>([])
  const [loading, setLoading] = useState(true)
  const [activeStage, setActiveStage] = useState('booked')
  const [search, setSearch] = useState('')
  const [filterProject, setFilterProject] = useState('')
  const [filterSales, setFilterSales] = useState('')
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null)
  const [selectedJobId, setSelectedJobId] = useState<string | null>(null)
  const [selectedJobWorkingStatus, setSelectedJobWorkingStatus] = useState<string | null>(null)
  const [selectedJobCrmStage, setSelectedJobCrmStage] = useState<string | null>(null)
  const [addModal, setAddModal] = useState(false)
  const [addStep, setAddStep] = useState<'search' | 'new'>('search')
  const [addSearchQ, setAddSearchQ] = useState('')
  const [repeatConfirm, setRepeatConfirm] = useState<Customer | null>(null)
  const [repeatAdding, setRepeatAdding] = useState(false)
  const [repeatJobForm, setRepeatJobForm] = useState({ project_id: '', room: '', work_type: '', budget: '', assigned_to: '' })
  const [dupRoomCustomer, setDupRoomCustomer] = useState<{ id: string; customer_name: string; interested_room: string; jobCount: number; isSamePerson: boolean } | null>(null)
  const [dupRoomAdding, setDupRoomAdding] = useState(false)
  const [pendingAddForm, setPendingAddForm] = useState<typeof emptyForm | null>(null)
  const [startJobCustomer, setStartJobCustomer] = useState<Customer | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<{ c: Customer; jobId?: string; hasMultipleJobs: boolean } | null>(null)
  const [deleting, setDeleting] = useState(false)

  // Thin wrapper over the shared helper — the page's callers pass positional
  // args and today's date, which is what a prospect opened here means.
  async function createProspectJob(customerId: string, custName: string, projectId: string | null, roomNo: string | null, custType: string, workType: string | null, salesId: string | null, crmStage: string, notes?: string | null, revenueIncVat?: number | null): Promise<string> {
    return createProspectJobShared(supabase, {
      customerId, customerName: custName, projectId, roomNo,
      customerType: custType, workType, salesId, crmStage, orderDate: todayStr(),
      notes: notes || null, revenueIncVat: revenueIncVat ?? null,
    })
  }

  /** The exact shape the board renders. Kept in one place because every write
   *  that adds a customer or a job has to hand the board a row of this shape —
   *  and each time one of them was assembled by hand instead, a field went
   *  missing and the card was wrong until the page was reloaded: first the work
   *  type, then the salesperson's name, then the revenue. Re-reading the row the
   *  database just wrote is one round trip and cannot drift. */
  const CUSTOMER_SELECT = 'id, customer_name, phone, email, line_id, source, project_id, interested_room, created_at, customer_type, projects(name), jobs(id, order_date, revenue_inc_vat, working_status, crm_stage, work_type, room_no, notes, cancel_type, cancel_amount, cancel_date, sales_id, sales:users!jobs_sales_id_fkey(name))'

  /** Re-read one customer and drop it into the list, replacing any existing
   *  copy. Use after any write that changes what a card shows. */
  const refreshCustomer = useCallback(async (customerId: string) => {
    const { data } = await supabase.from('customers').select(CUSTOMER_SELECT).eq('id', customerId).maybeSingle()
    if (!data) return
    setCustomers(prev => {
      const without = prev.filter(c => c.id !== customerId)
      return [data as any, ...without]
    })
  }, [])

  const load = useCallback(async () => {
    setLoading(true)
    const [{ data: cData }, { data: pData }, { data: uData }, { data: jData }] = await Promise.all([
      supabase.from('customers')
        .select('id, customer_name, phone, email, line_id, source, project_id, interested_room, created_at, customer_type, projects(name), jobs(id, order_date, revenue_inc_vat, working_status, crm_stage, work_type, room_no, notes, cancel_type, cancel_amount, cancel_date, sales_id, sales:users!jobs_sales_id_fkey(name))')
        .order('created_at', { ascending: false }),
      supabase.from('projects').select('id, name').eq('active', true).order('name'),
      supabase.from('users').select('id, name').eq('active', true).in('dept', ['Sales Executive', 'Administration']).order('name'),
      supabase.from('jobs')
        .select('id, customer_name, room_no, revenue_inc_vat, sales_id, project_id, customer_type, projects(name), sales:users!jobs_sales_id_fkey(name), payments(status, paid_amount, amount, voucher_amount)')
        .eq('working_status', 'จอง')
        // B2B used to be filtered out here. One B2B room is booked — Ecrora Spa
        // at ฿3.8M — and it was the single largest booking on the book, showing
        // nowhere on this page. A booking is a booking whoever the customer is.
        .order('room_no'),
    ])
    setCustomers((cData as any) || [])
    setProjects(pData || [])
    setUsers(uData || [])
    const mapped: BookedJob[] = ((jData as any) || []).map((j: any) => {
      const payments: any[] = j.payments || []
      const settled = payments.filter((p: any) => p.status === 'paid').reduce((s: number, p: any) => s + Number(p.paid_amount ?? p.amount ?? 0) + Number(p.voucher_amount ?? 0), 0)
      const rev = j.revenue_inc_vat || 0
      return {
        id: j.id, customer_name: j.customer_name, room_no: j.room_no,
        revenue_inc_vat: rev, sales_id: j.sales_id, project_id: j.project_id,
        sales_name: (j.sales as any)?.name || null,
        project_name: (j.projects as any)?.name || null,
        settled, pct: rev > 0 ? settled / rev : 0,
      }
    })
    setBookedJobs(mapped)
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])


  async function addCustomer(form: typeof emptyForm, ackNameWarn = false, skipRoomCheck = false): Promise<string | null> {
    // Check: must have project
    if (!form.project_id) {
      if (projects.length === 0)
        return 'ยังไม่มีโครงการในระบบ — กรุณาสร้างโครงการก่อนที่หน้า Projects'
      return 'กรุณาเลือกโครงการก่อน'
    }

    // Near-duplicate company name in the same project. B2B names are long and
    // get pasted, and the wrapper moves around — "บริษัท ก จำกัด" one time, "ก"
    // the next — so an exact match catches none of it. nameKey strips the
    // wrapper and the case, which is how ออริจิ้น เพลย์ ศรีอุดม would have been
    // caught before it became two records. A warning only: the salesperson can
    // confirm and continue. See lib/customerName.ts.
    if (!ackNameWarn && (form.customer_type || 'B2C') === 'B2B' && form.project_id) {
      const key = nameKey(form.customer_name)
      if (key) {
        const { data: sameProject } = await supabase
          .from('customers')
          .select('id, customer_name')
          .eq('project_id', form.project_id)
          .eq('customer_type', 'B2B')
        const near = (sameProject || []).find(c => nameKey(c.customer_name) === key)
        if (near) return `WARN:มีลูกค้า B2B ชื่อใกล้เคียงในโครงการนี้แล้ว — "${near.customer_name}" (${near.id})`
      }
    }

    // Duplicate check: same phone OR same project+room
    const orConditions: string[] = []
    const phone = form.phone.trim()
    if (phone) orConditions.push(`phone.eq.${phone}`)
    if (!skipRoomCheck && form.project_id && form.interested_room) {
      orConditions.push(`and(project_id.eq.${form.project_id},interested_room.eq.${form.interested_room.trim()})`)
    }
    if (orConditions.length) {
      // Check phone dup
      if (phone) {
        const { data: phoneDup } = await supabase
          .from('customers')
          .select('id, customer_name, phone')
          .eq('phone', phone)
          .maybeSingle()
        if (phoneDup) return `มีลูกค้าเบอร์ ${phone} อยู่แล้วในระบบ (${phoneDup.customer_name})`
      }

      // Check room dup with job count
      if (!skipRoomCheck && form.project_id && form.interested_room) {
        const { data: roomDups } = await supabase
          .from('customers')
          .select('id, customer_name, interested_room, jobs(id, room_no)')
          .eq('project_id', form.project_id)
          .eq('interested_room', form.interested_room.trim())
        if (roomDups && roomDups.length > 0) {
          // Two people really can buy work in the same room, and one person
          // really can order three times for it. There is no cap: the old
          // `totalJobs >= 2` refused the *next* buyer outright once the first
          // one had two orders, which is a rule about the room being applied to
          // a person it has nothing to do with.
          //
          // Which record the new job belongs to is the question worth asking, so
          // the name decides. Same name as someone already in this room and it
          // is a repeat order — it goes under their existing record, keeping one
          // person's phone, Line and orders together. A different name is a
          // different buyer and gets their own record. Twenty rooms in the data
          // are one person split across two records because this always made a
          // new one.
          // Compared through nameKey, not trim/lowercase: a name pasted out of
          // a PDF carries a non-breaking or doubled space, matched nothing, and
          // opened a second record for a buyer who already had one. See
          // lib/customerName.ts.
          const typed = nameKey(form.customer_name)
          const sameName = roomDups.find(c => nameKey(c.customer_name) === typed)
          const owner = sameName || roomDups[0]
          setAddModal(false)
          setDupRoomCustomer({
            id: owner.id,
            customer_name: owner.customer_name,
            interested_room: owner.interested_room,
            // Their orders for this room, not their orders everywhere — the
            // number the modal offers has to match the badge on the card.
            jobCount: (((owner as any).jobs as { room_no?: string }[]) || [])
              .filter(j => (j.room_no || '').trim().toUpperCase() === form.interested_room.trim().toUpperCase()).length,
            isSamePerson: !!sameName,
          })
          setPendingAddForm(form)
          return null
        }
      }
    }

    // One code scheme for everyone. This used to build `PROJECT-ROOM` whenever a
    // room was known and fall back to CST- only otherwise, which left the
    // register holding two formats — and the room-shaped half went stale the
    // moment a buyer took a second room. See lib/customerId.ts.
    const newId = await nextCustomerId(supabase)

    // `notes` and `work_type` were dropped from customers in the step-3 column
    // clean-up: they describe an order, not a person, so they live on the job.
    // Spreading the whole form put them back into the insert and PostgREST
    // rejected it — no prospect could be created at all. Note they have to be
    // *deleted*, not set to undefined: supabase-js builds the `columns` query
    // param from Object.keys, which still lists a key whose value is undefined.
    // See lib/ownership.ts.
    // `budget` belongs on this list for the same reason and was missed: it is a
    // form field, not a column — customers.budget was dropped when the money
    // moved to jobs.revenue_inc_vat, because one customer can hold several
    // rooms and a single budget column cannot say which room the number is for.
    // The comment below said it was no longer written, but the spread was still
    // carrying `budget: 0` into the insert, so PostgREST rejected every new
    // prospect. Nothing about the message pointed at the money field, which is
    // why it read as "เพิ่มลูกค้าใหม่ไม่ได้" rather than as a missing column.
    const {
      notes: _formNotes, work_type: _formWorkType, status: _formStatus,
      assigned_to: _formSales, budget: _formBudget, ...customerFields
    } = form
    const { data, error } = await supabase.from('customers').insert([{
      id: newId, ...customerFields,
      customer_name: cleanName(form.customer_name),
      project_id: form.project_id || null,
      // budget is not written any more — the number goes on the job that
      // createProspectJob opens below.
      customer_type: form.customer_type || 'B2C',
    }]).select('id, customer_name, phone, email, line_id, source, project_id, interested_room, created_at, customer_type, projects(name), jobs(id, order_date, revenue_inc_vat, working_status, crm_stage, work_type, room_no, notes, cancel_type, cancel_amount, cancel_date, sales_id, sales:users!jobs_sales_id_fkey(name))').single()
    if (error) return error.message
    if (data) {
      const crmStage = form.status || 'new'
      const jobId = await createProspectJob(newId, cleanName(form.customer_name), form.project_id || null, form.interested_room || null, form.customer_type || 'B2C', form.work_type || null, form.assigned_to || null, crmStage, form.notes, form.budget || 0)
      // Read the row back instead of assembling it. Hand-built copies kept
      // losing a field — work type, then the salesperson, then the revenue —
      // and each one looked like its own bug to whoever hit it. See
      // refreshCustomer.
      await refreshCustomer(newId)
      setActiveStage(crmStage)
      setAddModal(false)
    }
    return null
  }

  async function confirmAddNewJob() {
    if (!pendingAddForm) return
    setDupRoomCustomer(null)
    await addCustomer(pendingAddForm, true, true)
    setPendingAddForm(null)
  }

  /** The repeat order: a new job on the record this person already has, rather
   *  than a second record for the same person. Mirrors confirmRepeatPurchase,
   *  which is what the "ซื้อซ้ำ" search does — this is the same act reached from
   *  the other direction, by typing a room that turns out to be theirs. */
  async function confirmAddJobToExisting() {
    const form = pendingAddForm
    const owner = dupRoomCustomer
    if (!form || !owner) return
    setDupRoomAdding(true)
    const jobId = await createProspectJob(
      owner.id, owner.customer_name, form.project_id || null, form.interested_room || null,
      form.customer_type || 'B2C', form.work_type || null, form.assigned_to || null,
      form.status || 'new', form.notes, Number(form.budget) || 0,
    )
    // The value went in with the job above (createProspectJob). It used to be
    // written to customers.budget here, which overwrote the number belonging to
    // whatever room this buyer ordered first.
    setDupRoomAdding(false)
    if (jobId) {
      await refreshCustomer(owner.id)
      setActiveStage(form.status || 'new')
    }
    setDupRoomCustomer(null)
    setPendingAddForm(null)
  }

  async function confirmRepeatPurchase() {
    if (!repeatConfirm) return
    if (!repeatJobForm.project_id || !repeatJobForm.room.trim() || !repeatJobForm.work_type) return
    setRepeatAdding(true)
    const c = repeatConfirm
    const salesId = repeatJobForm.assigned_to || salesIdOf(c)
    const jobId = await createProspectJob(c.id, c.customer_name, repeatJobForm.project_id, repeatJobForm.room.trim(), (c as any).customer_type || 'B2C', repeatJobForm.work_type, salesId, 'new', null, Number(repeatJobForm.budget) || 0)
    // Changing the sales on a repeat purchase re-assigns the customer's whole
    // book (option 1). The customers copy is kept in step until the column goes.
    if (repeatJobForm.assigned_to && repeatJobForm.assigned_to !== salesIdOf(c)) {
      await supabase.from('jobs').update({ sales_id: repeatJobForm.assigned_to }).eq('customer_id', c.id)
    }
    // Same as above: the repeat order's value goes on the repeat order's job,
    // not onto the customer where it would overwrite the previous room's number.
    setRepeatAdding(false)
    if (jobId) {
      // Was assembled by hand and the new entry carried no room_no and no
      // work_type — so the repeat card grouped under the blank-room key and
      // read as a copy of the first order rather than a new one.
      await refreshCustomer(c.id)
      setActiveStage('new')
      setRepeatConfirm(null)
      setRepeatJobForm({ project_id: '', room: '', work_type: '', budget: '', assigned_to: '' })
      setAddModal(false)
    }
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
      // ลบงานพร้อมทุกอย่างที่ผูกอยู่ และ**ต้องรู้ผลก่อน**จึงแตะหน้าจอ — เดิมลบ
      // payments แล้วลบ jobs โดยไม่เช็ค error การ์ดจึงหายไปจากจอทั้งที่งานยังอยู่
      // ดู lib/deleteJob.ts
      const res = await deleteJobCascade(supabase, jobId)
      if (!res.ok) { setDeleting(false); await showAlert(res.error!); return }
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
      const { data: linked } = await supabase.from('jobs').select('id').eq('customer_id', c.id)
      if (linked && linked.length > 0) {
        const res = await deleteJobsCascade(supabase, linked.map(j => j.id))
        if (!res.ok) { setDeleting(false); await showAlert(res.error!); return }
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
    <div className="page-content">
      <div>
        <div className="h-6 w-28 rounded-lg mb-1 animate-pulse" style={{ background: 'var(--hover-bg)' }} />
        <div className="h-3 w-16 rounded-lg animate-pulse" style={{ background: 'var(--hover-bg)' }} />
      </div>
      <div className="px-6 space-y-2 pt-4">
        {[1, 2, 3, 4, 5].map(i => <CardSkeleton key={i} />)}
      </div>
    </div>
  )

  const stage = STAGES.find(s => s.value === activeStage) || STAGES[0]
  const allCards = expandCards(customers)
  /** Prospects at จอง that never got a job row — records predating
   *  createProspectJob. The จอง tab lists jobs, so these ten (฿1.58M of budget)
   *  appeared in no tab at all: not here, because they have no job, and not in
   *  the other tabs, whose filter is the stage they are not at. They render as
   *  customer cards beside the booked jobs until someone opens a job for them. */
  const bookedNoJob = customers.filter(c =>
    (((c as any).jobs as JobMeta[] | null) || []).length === 0
    && (!filterProject || c.project_id === filterProject)
    && (!filterSales || salesIdOf(c) === filterSales))
  const addSearchResults = addSearchQ.length >= 1
    ? customers.filter(c => {
        const q = addSearchQ.toLowerCase()
        return c.customer_name.toLowerCase().includes(q) || (c.interested_room || '').toLowerCase().includes(q) || (c.phone || '').includes(q)
      }).slice(0, 6)
    : []
  const list = allCards.filter(card => {
    // Every job carries its own crm_stage (verified: 0 null), so there is no
    // customer-level status to fall back to any more.
    const cardStage = card.jobCrmStage
    if (!search && cardStage !== activeStage) return false
    if (filterProject && card.c.project_id !== filterProject) return false
    if (filterSales && jobOf(card.c, card.jobId).sales_id !== filterSales) return false
    if (search) {
      const q = search.toLowerCase().replace(/[-\s]/g, '')
      // Match the room the card actually shows — the job's, falling back to the
      // customer's only for a prospect with no job room yet. Matching both at
      // once made a search for A603 return Mr.Andrea's A812 card, because his
      // two records were merged and the surviving one still says A603.
      const room = (jobOf(card.c, card.jobId).room_no || card.c.interested_room || '')
        .toLowerCase().replace(/[-\s]/g, '')
      return room.includes(q) || card.c.customer_name.toLowerCase().includes(search.toLowerCase())
    }
    return true
  }).sort((a, b) => compareRoom(
    jobOf(a.c, a.jobId).room_no || a.c.interested_room,
    jobOf(b.c, b.jobId).room_no || b.c.interested_room))

  return (
    <div className="page-content">

      {/* Header */}
      <div>
        <PageHeader
          title="Prospects"
          // Was the record count, which the summary cards below already give.
          // A subtitle should say what the page is for.
          subtitle="ลูกค้าที่กำลังติดตาม · แยกตามขั้นการขาย"
          className="mb-4"
          actions={
            <button onClick={() => { setAddModal(true); setAddStep('search'); setAddSearchQ(''); setRepeatConfirm(null); setRepeatJobForm({ project_id: '', room: '', work_type: '', budget: '', assigned_to: '' }) }}
              className="flex items-center gap-1.5 px-4 py-2 rounded-[8px] text-sm font-semibold text-white"
              style={{ background: 'var(--accent)' }}>
              <Plus size={15} /> เพิ่ม Prospect
            </button>
          }
        />

      </div>

      {/* Filter bar — stage chips ride on top, so everything that narrows the
          list sits in one card instead of floating above it. An inactive chip
          used to carry four signals at once (own border, tinted background,
          coloured dot, 0.6 opacity); now only the selected one is filled. */}
      <FilterBar
        search={search}
        onSearchChange={v => { setSearch(v); setSelectedCustomer(null) }}
        searchPlaceholder="ค้นหาห้อง, ลูกค้า..."
        className="mb-4"
      >
        <select value={filterProject} onChange={e => setFilterProject(e.target.value)}
          className="field-input" style={{ width: 'auto', maxWidth: '10rem' }}>
          <option value="">ทุกโครงการ</option>
          {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
        <select value={filterSales} onChange={e => setFilterSales(e.target.value)}
          className="field-input" style={{ width: 'auto' }}>
          <option value="">ทุก Sales</option>
          {users.map(u => <option key={u.id} value={u.id}>{u.name}</option>)}
        </select>
        {(search || filterProject || filterSales) && (
          <button onClick={() => { setSearch(''); setFilterProject(''); setFilterSales('') }}
            className="text-xs px-2 py-1.5 rounded-[8px] transition-colors"
            style={{ color: 'var(--text-3)', background: 'var(--hover-bg)', border: '1px solid var(--divider)' }}>
            ล้าง
          </button>
        )}
        <span className="text-xs ml-auto" style={{ color: 'var(--text-3)' }}>
          {activeStage === 'booked' && !search
            ? bookedJobs.filter(j => (!filterProject || j.project_id === filterProject) && (!filterSales || j.sales_id === filterSales)).length + ' งาน'
            : list.length + ' ราย'}
        </span>
      </FilterBar>

      {/* Stage chips in their own row between the filter card and the board,
          matching Customers — search, then narrow by stage, then results. */}
      <div className="tab-group mb-4 flex-wrap">
          {STAGES.map(s => {
            // Both branches honour the project / sales filters. Only the booked
            // one used to: every other chip kept counting the whole book while
            // the cards below it were filtered, so choosing a project moved one
            // number and left six standing still.
            // Each half matches its own list — booked cards come from bookedJobs
            // and carry the job's sales_id, the rest come from allCards and carry
            // the customer's assigned_to.
            const count = s.value === 'booked'
              ? bookedJobs.filter(j => (!filterProject || j.project_id === filterProject) && (!filterSales || j.sales_id === filterSales)).length
                + bookedNoJob.length
              : allCards.filter(card => card.jobCrmStage === s.value
                  && (!filterProject || card.c.project_id === filterProject)
                  && (!filterSales || jobOf(card.c, card.jobId).sales_id === filterSales)).length
            const active = activeStage === s.value && !search
            const done = s.value === 'closed' || s.value === 'lost'
            return (
              <button key={s.value} onClick={() => { setActiveStage(s.value); setSearch(''); setSelectedCustomer(null) }}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-[8px] text-xs font-semibold whitespace-nowrap flex-shrink-0 transition-colors"
                style={active
                  ? { background: s.badge, color: s.text }
                  : { color: done ? 'var(--text-3)' : 'var(--text-2)' }}>
                {s.label}
                <span className="font-bold" style={{ color: active ? s.text : done ? 'var(--text-3)' : 'var(--text-1)' }}>{count}</span>
              </button>
            )
          })}
          {search && (
            <span className="flex items-center gap-1.5 px-3 py-1.5 rounded-[8px] text-xs font-semibold whitespace-nowrap flex-shrink-0"
              style={{ background: 'color-mix(in srgb, var(--accent) 15%, transparent)', color: 'var(--accent)' }}>
              ทั้งหมด
              <span className="font-bold">{list.length}</span>
            </span>
          )}
      </div>

      {/* Summary strip */}
      {(activeStage === 'booked' && !search
        ? bookedJobs.filter(j => (!filterProject || j.project_id === filterProject) && (!filterSales || j.sales_id === filterSales)).length + bookedNoJob.length > 0
        : list.length > 0) && (() => {
        if (activeStage === 'booked' && !search) {
          const filtered = bookedJobs.filter(j => (!filterProject || j.project_id === filterProject) && (!filterSales || j.sales_id === filterSales))
          // The job-less booked prospects count here too, or the strip reports a
          // smaller book than the cards below it show.
          const bookedCount = filtered.length + bookedNoJob.length
          const totalRev = filtered.reduce((s, j) => s + (j.revenue_inc_vat || 0), 0)
          const noSales = filtered.filter(j => !j.sales_id).length
            + bookedNoJob.filter(c => !salesIdOf(c)).length
          return (
            <div className="mb-4">
              <SummaryStrip items={[
                { label: 'จองอยู่', value: bookedCount, sub: 'งาน' },
                { label: 'มูลค่ารวม', value: totalRev > 0 ? bahtShort(totalRev) : '—' },
                {
                  label: 'ยังไม่มี Sales',
                  value: noSales,
                  sub: 'งาน',
                  tone: noSales > 0 ? 'var(--accent-orange)' : 'var(--accent-green)',
                },
              ]} />
            </div>
          )
        }
        const totalBudget = list.reduce((s, card) => s + cardValue(card.c, card.jobSeqNo, card.jobRev, card.jobCrmStage), 0)
        const noSales = list.filter(card => !jobOf(card.c, card.jobId).sales_id).length
        return (
          <div className="mb-4">
            <SummaryStrip items={[
              { label: 'ในกลุ่มนี้', value: list.length, sub: 'ราย' },
              { label: 'มูลค่ารวม', value: totalBudget > 0 ? bahtShort(totalBudget) : '—' },
              {
                label: 'ยังไม่มี Sales',
                value: noSales,
                sub: 'ราย',
                tone: noSales > 0 ? 'var(--accent-orange)' : 'var(--accent-green)',
              },
            ]} />
          </div>
        )
      })()}

      {/* Cards list */}
      <div>
        {activeStage === 'booked' && !search ? (() => {
          const filtered = bookedJobs.filter(j =>
            (!filterProject || j.project_id === filterProject) &&
            (!filterSales || j.sales_id === filterSales)
          )
          // Empty only when neither list has anything: the ten job-less booked
          // prospects belong on this tab too, and bailing on `filtered` alone
          // would hide them behind an "ไม่มีงานในสถานะ จอง" message.
          if (filtered.length === 0 && bookedNoJob.length === 0) return (
            <div className="flex flex-col items-center justify-center gap-3 py-20">
              <div className="w-12 h-12 rounded-full flex items-center justify-center" style={{ background: 'var(--hover-bg)' }}>
                <Search size={20} style={{ color: 'var(--text-3)' }} />
              </div>
              <p className="text-sm font-semibold" style={{ color: 'var(--text-2)' }}>ไม่มีงานในสถานะ จอง</p>
              <p className="text-xs" style={{ color: 'var(--text-3)' }}>งานที่จองแล้วและยังชำระ &lt;50% จะปรากฏที่นี่</p>
            </div>
          )
          const grouped = filtered.reduce<Record<string, { name: string; items: BookedJob[] }>>((acc, j) => {
            const key = j.project_id || '__none__'
            const name = j.project_name || j.project_id || 'ไม่ระบุโครงการ'
            if (!acc[key]) acc[key] = { name, items: [] }
            acc[key].items.push(j)
            return acc
          }, {})
          const groups = Object.entries(grouped).sort(([, a], [, b]) => a.name.localeCompare(b.name, 'th'))
          return (
            <div className="space-y-5 pt-2">
              {groups.map(([key, { name, items }]) => (
                <div key={key}>
                  <p className="text-label font-semibold uppercase tracking-wider mb-2 px-0.5" style={{ color: 'var(--text-3)' }}>
                    {name} <span className="font-normal">({items.length})</span>
                  </p>
                  <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4 gap-3">
                    {items.map(j => (
                      <BookedJobCard key={j.id} job={j} onClick={async () => {
                        setLoadingBookedJobFull(true)
                        const full = await loadFullJob(j.id)
                        setSelectedBookedJobFull(full)
                        setLoadingBookedJobFull(false)
                      }} onDelete={() => {
                        const mockCustomer = { id: j.id, customer_name: j.customer_name, jobs: [{ id: j.id }] } as any
                        setDeleteTarget({ c: mockCustomer, jobId: j.id, hasMultipleJobs: false })
                      }} />
                    ))}
                  </div>
                </div>
              ))}
              {bookedNoJob.length > 0 && (
                <div>
                  <p className="text-label font-semibold uppercase tracking-wider mb-2 px-0.5" style={{ color: 'var(--accent-amber)' }}>
                    จองแล้ว · ยังไม่ได้เปิดงาน <span className="font-normal">({bookedNoJob.length})</span>
                  </p>
                  <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4 gap-3">
                    {bookedNoJob.map(c => (
                      <CustomerCard key={c.id} c={c} stage={resolveStage(c.status)}
                        onClick={() => { setSelectedCustomer(c); setSelectedJobId(null); setSelectedJobWorkingStatus(null); setSelectedJobCrmStage(null) }}
                        onDelete={() => triggerDelete(c)} />
                    ))}
                  </div>
                </div>
              )}
            </div>
          )
        })() : (
          list.length === 0 ? (
            <div className="flex flex-col items-center justify-center gap-3 py-20">
              <div className="w-12 h-12 rounded-full flex items-center justify-center" style={{ background: 'var(--hover-bg)' }}>
                <Search size={20} style={{ color: 'var(--text-3)' }} />
              </div>
              <p className="text-sm font-semibold" style={{ color: 'var(--text-2)' }}>ไม่พบ Prospect ใน {stage.label}</p>
              <p className="text-xs" style={{ color: 'var(--text-3)' }}>ลองเลือกกลุ่มอื่น หรือเพิ่ม Prospect ใหม่</p>
            </div>
          ) : (() => {
            const grouped = list.reduce<Record<string, { name: string; items: CardItem[] }>>((acc, card) => {
              const key = card.c.project_id || '__none__'
              const name = (card.c as any).projects?.name || card.c.project_id || 'ไม่ระบุโครงการ'
              if (!acc[key]) acc[key] = { name, items: [] }
              acc[key].items.push(card)
              return acc
            }, {})
            const groups = Object.entries(grouped).sort(([, a], [, b]) => a.name.localeCompare(b.name, 'th'))
            return (
              <div className="space-y-5 pt-2">
                {groups.map(([key, { name, items }]) => (
                  <div key={key}>
                    <p className="text-label font-semibold uppercase tracking-wider mb-2 px-0.5" style={{ color: 'var(--text-3)' }}>
                      {name} <span className="font-normal">({items.length})</span>
                    </p>
                    <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4 gap-3">
                      {items.map(({ c, jobSeqNo, jobRev, jobId, jobWorkingStatus, jobCrmStage, cardKey }) => (
                        <CustomerCard key={cardKey} c={c} stage={resolveStage(jobCrmStage)} onClick={() => { setSelectedCustomer(c); setSelectedJobId(jobId || null); setSelectedJobWorkingStatus(jobWorkingStatus || null); setSelectedJobCrmStage(jobCrmStage || null) }} onDelete={() => triggerDelete(c, jobId)} jobSeqNo={jobSeqNo} jobRev={jobRev} jobId={jobId} jobWorkingStatus={jobWorkingStatus} jobCrmStage={jobCrmStage} />
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )
          })()
        )}
      </div>

      {/* Booked job drawer */}
      {loadingBookedJobFull && (
        <>
          <div className="fixed inset-0 z-40 bg-black/60 backdrop-blur-sm" onClick={() => setLoadingBookedJobFull(false)} />
          <div className="fixed inset-0 z-50 flex items-center justify-center pointer-events-none">
            <p className="text-sm" style={{ color: 'var(--text-3)' }}>กำลังโหลด...</p>
          </div>
        </>
      )}
      {selectedBookedJobFull && !loadingBookedJobFull && (
        <DealDrawer
          job={selectedBookedJobFull}
          onClose={() => setSelectedBookedJobFull(null)}
          onRefresh={async () => {
            const j = await loadFullJob(selectedBookedJobFull.id)
            setSelectedBookedJobFull(j)
            await load()
          }}
        />
      )}

      {/* Detail Drawer */}
      {selectedCustomer && (
        <CustomerDrawer
          customer={selectedCustomer}
          focusJobId={selectedJobId}
          focusJobWorkingStatus={selectedJobWorkingStatus}
          focusJobCrmStage={selectedJobCrmStage}
          projects={projects}
          users={users}
          onClose={() => { setSelectedCustomer(null); setSelectedJobId(null); setSelectedJobWorkingStatus(null); setSelectedJobCrmStage(null) }}
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

      {/* Add modal — step 1: search, step 2: new customer form */}
      <Modal open={addModal} title={addStep === 'search' ? 'เพิ่ม Prospect / ซื้อซ้ำ' : 'ลูกค้าใหม่'} onClose={() => { setAddModal(false); setRepeatConfirm(null); setRepeatJobForm({ project_id: '', room: '', work_type: '', budget: '', assigned_to: '' }) }}>
        {addStep === 'search' ? (
          <div className="space-y-3">
            <input value={addSearchQ} onChange={e => { setAddSearchQ(e.target.value); setRepeatConfirm(null) }}
              placeholder="ค้นหาชื่อ, ห้อง, เบอร์..." autoFocus
              className="w-full px-3 py-2 rounded-[8px] text-sm focus:outline-none"
              style={{ background: 'var(--input-bg)', border: '1px solid var(--divider)', color: 'var(--text-1)' }} />
            {addSearchResults.length > 0 && !repeatConfirm && (
              <div className="space-y-1.5 max-h-56 overflow-y-auto">
                {addSearchResults.map(c => {
                  const cJobs = ((c as any).jobs as JobMeta[] | null) || []
                  // The newest order, not jobs[0]. This row is the answer to
                  // "where is this customer now" while someone is about to add
                  // a repeat order; the first job they ever placed — usually
                  // long since delivered — is the least useful of the set.
                  const newestJob = cJobs.length > 0
                    ? [...cJobs].sort((a, b) =>
                        (a.order_date || '').localeCompare(b.order_date || '') ||
                        a.id.localeCompare(b.id, undefined, { numeric: true }))[cJobs.length - 1]
                    : undefined
                  const cStage = resolveStage(newestJob?.crm_stage)
                  return (
                    <button key={c.id} onClick={() => setRepeatConfirm(c)}
                      className="w-full flex items-center gap-3 p-3 rounded-[8px] text-left transition-all"
                      style={{ background: 'var(--hover-bg)', border: '1px solid var(--divider)' }}
                      onMouseEnter={e => (e.currentTarget.style.borderColor = 'var(--accent)')}
                      onMouseLeave={e => (e.currentTarget.style.borderColor = 'var(--divider)')}>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold truncate" style={{ color: 'var(--text-1)' }}>{c.customer_name}</p>
                        <p className="text-xs truncate" style={{ color: 'var(--text-3)' }}>
                          {(c as any).projects?.name || c.project_id || '—'} · ห้อง {c.interested_room || '—'}
                          {cJobs.length > 1 ? ` · ${cJobs.length} งาน` : ''}
                        </p>
                      </div>
                      <span className="text-micro font-semibold px-1.5 py-0.5 rounded-[8px] flex-shrink-0" style={{ background: cStage.badge, color: cStage.text }}>{cStage.label}</span>
                    </button>
                  )
                })}
              </div>
            )}
            {repeatConfirm && (() => {
              const jobCount = (((repeatConfirm as any).jobs as JobMeta[] | null) || []).length
              const canSubmit = repeatJobForm.project_id && repeatJobForm.room.trim() && repeatJobForm.work_type
              const projectNotFound = repeatJobForm.project_id === '__not_found__'
              return (
                <div className="p-4 rounded-[8px] space-y-3" style={{ background: 'color-mix(in srgb, var(--accent) 8%, transparent)', border: '1px solid color-mix(in srgb, var(--accent) 25%, transparent)' }}>
                  {/* Header */}
                  <div>
                    <p className="text-sm font-semibold" style={{ color: 'var(--text-1)' }}>
                      {repeatConfirm.customer_name}
                      <span className="ml-2 text-xs font-normal px-1.5 py-0.5 rounded-[8px]"
                        style={{ background: 'color-mix(in srgb, var(--accent) 15%, transparent)', color: 'var(--accent)' }}>
                        งานที่ {jobCount + 1}
                      </span>
                    </p>
                    <p className="text-xs mt-1" style={{ color: 'var(--text-3)' }}>มีงานอยู่แล้ว {jobCount} งาน</p>
                  </div>

                  {/* Project */}
                  <div>
                    <p className="text-xs mb-1" style={{ color: 'var(--text-2)' }}>โครงการ <span style={{ color: 'var(--accent-red)' }}>*</span></p>
                    <SearchableSelect
                      value={repeatJobForm.project_id === '__not_found__' ? '' : repeatJobForm.project_id}
                      onChange={v => setRepeatJobForm(f => ({ ...f, project_id: String(v) }))}
                      options={[{ value: '', label: '— เลือกโครงการ —' }, ...projects.map(p => ({ value: p.id, label: p.name }))]}
                    />
                    {!repeatJobForm.project_id && (
                      <button onClick={() => setRepeatJobForm(f => ({ ...f, project_id: '__not_found__' }))}
                        className="mt-1 text-label" style={{ color: 'var(--accent-orange)', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>
                        ไม่มีโครงการนี้ในระบบ? →
                      </button>
                    )}
                    {projectNotFound && (
                      <p className="mt-1 text-label px-2 py-1 rounded-[8px]"
                        style={{ background: 'color-mix(in srgb, var(--accent-orange) 10%, transparent)', color: 'var(--accent-orange)', border: '1px solid color-mix(in srgb, var(--accent-orange) 30%, transparent)' }}>
                        ⚠️ กรุณาสร้างโครงการใหม่ใน Settings ก่อน แล้วกลับมาเพิ่มงานซ้ำอีกครั้ง
                      </p>
                    )}
                  </div>

                  {/* Room */}
                  <Input label="ห้อง / สถานที่ *" value={repeatJobForm.room}
                    onChange={e => setRepeatJobForm(f => ({ ...f, room: e.target.value }))} />

                  {/* Work type */}
                  <div>
                    <p className="text-xs mb-1" style={{ color: 'var(--text-2)' }}>ประเภทงาน <span style={{ color: 'var(--accent-red)' }}>*</span></p>
                    <select value={repeatJobForm.work_type}
                      onChange={e => setRepeatJobForm(f => ({ ...f, work_type: e.target.value }))}
                      className="field-input w-full">
                      <option value="">— เลือกประเภทงาน —</option>
                      {WORK_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                    </select>
                  </div>

                  {/* Budget (optional) */}
                  <Input label="มูลค่างาน (ประมาณ)" type="number" value={repeatJobForm.budget}
                    onChange={e => setRepeatJobForm(f => ({ ...f, budget: e.target.value }))} />

                  {/* Sales */}
                  <div>
                    <p className="text-xs mb-1" style={{ color: 'var(--text-2)' }}>Sales ที่ดูแล</p>
                    <SearchableSelect
                      value={repeatJobForm.assigned_to || salesIdOf(repeatConfirm) || ''}
                      onChange={v => setRepeatJobForm(f => ({ ...f, assigned_to: String(v) }))}
                      options={[{ value: '', label: '— ไม่ระบุ —' }, ...users.map(u => ({ value: u.id, label: u.name }))]}
                    />
                  </div>

                  {/* Actions */}
                  <div className="flex gap-2 pt-1">
                    <button onClick={() => { setRepeatConfirm(null); setRepeatJobForm({ project_id: '', room: '', work_type: '', budget: '', assigned_to: '' }) }}
                      className="flex-1 py-2 rounded-[8px] text-sm" style={{ border: '1px solid var(--divider)', color: 'var(--text-2)' }}>
                      ยกเลิก
                    </button>
                    <button onClick={confirmRepeatPurchase}
                      disabled={repeatAdding || !canSubmit || projectNotFound}
                      className="flex-1 py-2 rounded-[8px] text-sm font-semibold text-white"
                      style={{ background: (repeatAdding || !canSubmit || projectNotFound) ? 'var(--text-3)' : 'var(--accent)' }}>
                      {repeatAdding ? 'กำลังสร้าง...' : '+ สร้างงานซื้อซ้ำ'}
                    </button>
                  </div>
                </div>
              )
            })()}
            <div style={{ borderTop: '1px solid var(--divider)', paddingTop: '12px' }}>
              <button onClick={() => setAddStep('new')}
                className="w-full py-2.5 rounded-[8px] text-sm font-semibold"
                style={{ background: 'var(--hover-bg)', color: 'var(--text-2)', border: '1px solid var(--divider)' }}>
                + เพิ่มลูกค้าใหม่
              </button>
            </div>
          </div>
        ) : (
          <CustomerForm projects={projects} users={users} onSave={addCustomer} onClose={() => setAddModal(false)} />
        )}
      </Modal>

      {/* Dup room confirm modal */}
      <Modal open={!!dupRoomCustomer} title="พบห้องซ้ำในระบบ" size="sm" onClose={() => { setDupRoomCustomer(null); setPendingAddForm(null) }}>
        {dupRoomCustomer && (
          <div className="space-y-4">
            <p className="text-sm" style={{ color: 'var(--text-2)' }}>
              ห้อง <strong style={{ color: 'var(--text-1)' }}>{dupRoomCustomer.interested_room}</strong> มีลูกค้า <strong style={{ color: 'var(--text-1)' }}>{dupRoomCustomer.customer_name}</strong> อยู่แล้ว {dupRoomCustomer.jobCount} งาน
            </p>
            {/* Same name means the same buyer ordering again, so the job goes
                under the record they already have. The escape hatch below is for
                the rare two-people-one-name case, and it is the quiet option. */}
            {dupRoomCustomer.isSamePerson ? (
              <p className="text-sm" style={{ color: 'var(--text-2)' }}>
                เป็นลูกค้ารายเดิม — เพิ่มเป็น <strong style={{ color: 'var(--text-1)' }}>งานที่ {dupRoomCustomer.jobCount + 1}</strong> ใต้ระเบียนเดิม ข้อมูลติดต่อและงานทั้งหมดจะอยู่ที่เดียวกัน
              </p>
            ) : (
              <p className="text-sm" style={{ color: 'var(--text-2)' }}>
                ชื่อไม่ตรงกับเจ้าของงานเดิม — จะบันทึกเป็นลูกค้ารายใหม่ในห้องนี้
              </p>
            )}
            <div className="flex gap-2 pt-1">
              <button onClick={() => { setDupRoomCustomer(null); setPendingAddForm(null) }}
                className="flex-1 py-2.5 rounded-[8px] text-sm" style={{ border: '1px solid var(--divider)', color: 'var(--text-2)' }}>
                ยกเลิก
              </button>
              <button onClick={dupRoomCustomer.isSamePerson ? confirmAddJobToExisting : confirmAddNewJob}
                disabled={dupRoomAdding}
                className="flex-1 py-2.5 rounded-[8px] text-sm font-semibold text-white disabled:opacity-50"
                style={{ background: 'var(--accent)' }}>
                {dupRoomAdding ? 'กำลังบันทึก...'
                  : dupRoomCustomer.isSamePerson ? `เพิ่มงานที่ ${dupRoomCustomer.jobCount + 1} ให้ลูกค้ารายนี้` : 'สร้างเป็นลูกค้ารายใหม่'}
              </button>
            </div>
            {dupRoomCustomer.isSamePerson && (
              <button onClick={confirmAddNewJob} disabled={dupRoomAdding}
                className="w-full text-micro underline disabled:opacity-50" style={{ color: 'var(--text-3)' }}>
                คนละคนแต่ชื่อเหมือนกัน — สร้างเป็นลูกค้ารายใหม่
              </button>
            )}
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
                    ?.findIndex(j => j.id === deleteTarget.jobId) + 1}</strong> ของห้อง <strong style={{ color: 'var(--text-1)' }}>{jobOf(deleteTarget.c, deleteTarget.jobId).room_no || deleteTarget.c.interested_room}</strong> ใช่ไหม?</>
                : <>ต้องการลบ <strong style={{ color: 'var(--text-1)' }}>{deleteTarget.c.customer_name}</strong> ออกจาก Pipeline ใช่ไหม?</>
              }
            </p>
            <p className="text-xs" style={{ color: 'var(--text-3)' }}>ข้อมูลจะหายถาวร ไม่สามารถกู้คืนได้</p>
            <div className="flex gap-2 pt-1">
              <button onClick={() => setDeleteTarget(null)} disabled={deleting}
                className="flex-1 py-2.5 rounded-[8px] text-sm" style={{ border: '1px solid var(--divider)', color: 'var(--text-2)' }}>
                ยกเลิก
              </button>
              <button onClick={confirmDelete} disabled={deleting}
                className="flex-1 py-2.5 rounded-[8px] text-sm font-semibold text-white"
                style={{ background: deleting ? 'var(--text-3)' : 'var(--accent-red)' }}>
                {deleting ? 'กำลังลบ...' : 'ลบ'}
              </button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  )
}

