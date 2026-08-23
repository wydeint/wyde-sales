'use client'

import { useEffect, useState, useCallback, useMemo } from 'react'
import { createClient } from '@/lib/supabase/client'
import {X, Calculator, Briefcase, Receipt, ChevronRight, Phone, FileDown } from 'lucide-react'
import { WORK_TYPES } from '@/lib/status'
import { PageSpinner, PageError, EmptyState } from '@/components/ui/StateUI'
import Money from '@/components/ui/Money'
import Link from 'next/link'
import SearchableSelect from '@/components/ui/SearchableSelect'
import PageHeader from '@/components/ui/PageHeader'
import StatusChip from '@/components/ui/StatusChip'
import FilterBar from '@/components/ui/FilterBar'
import Pagination from '@/components/ui/Pagination'
import { COMMISSION_STATUSES, WORKING_STATUSES } from '@/lib/status'
import DateInput from '@/components/ui/DateInput'

// ─────────────────────────────────────────
// Constants
// ─────────────────────────────────────────
// 50, not the shared 25: these are cards in a 4-up grid, so 50 is about the
// same amount of scrolling as 25 table rows.
const PAGE_SIZE = 50
const PRODUCT_TYPES = [
  'Curtain', 'Wallcovering', 'Loose furniture', 'Built-in', 'Electric appliance',
  'Design', 'Design & Turnkey', 'Ready to move', 'IP', 'EQ', 'Mock up room',
]
// Filter and edit-form options come from the shared vocabulary. The local list
// this replaces omitted 'จอง' (183 jobs — the largest undelivered group, so it
// could not be filtered for at all) and offered 'รอเอกสาร', which has no rows.


type CommissionTier = {
  revenue_min: number
  revenue_max: number | null
  rate: number
  tier_name: string
}

type Lead = {
  id: number
  room_no: string
  customer_name: string
  phone: string | null
}

type PaymentSummary = {
  installment_name: string
  status: string
  amount: number
  due_date: string | null
}

type ProgressSummary = { paid: number }

type Job = {
  id: string
  lead_id: number | null
  customer_id: string
  project_id: string
  room_no: string
  customer_type: string
  company_name: string
  customer_name: string
  po_no: string
  so_no: string
  work_type: string
  package_type: string
  order_date: string
  revenue_ex_vat: number
  revenue_inc_vat: number
  voucher: number
  cost: number
  working_status: string
  room_status: string
  expected_finish_date: string
  actual_deliver_date: string
  sales_id: string
  qc_id: string
  commission_month: string
  commission_rate: number
  commission_amount: number
  commission_status: string
  notes: string
  contract_date: string
  work_start_date: string
  plan_transfer_month: string
  customers?: { customer_name: string; room_no: string }
  projects?: { name: string }
  sales?: { name: string }
  condo_leads?: { customer_name: string; room_no: string; phone: string | null }
}

// Status chips come from the shared vocabulary. The map that used to live here
// had no 'จอง' key, so every booked job — 183 of them — fell through to a
// default whose label read 'ดำเนินการ' and displayed as in-progress. It also
// carried 'กำลังดำเนินการ' and 'รอเอกสาร', neither of which occurs in the data.

// ─────────────────────────────────────────
// Room number helpers
// ─────────────────────────────────────────

// Extract tower letter from project name: last segment after '-' if single letter (e.g. TOR06-Z → Z)
function towerFromProject(projectName: string): string | null {
  const parts = projectName.trim().split('-')
  const last = parts[parts.length - 1]?.trim()
  return last && /^[A-Za-z]$/.test(last) ? last.toUpperCase() : null
}

// Normalize room_no: "123" → "Z-123", "a123" → "A-123", "A-123" → "A-123"
function normalizeRoomNo(input: string, projectName: string): string {
  const s = input.trim().toUpperCase()
  if (!s) return s
  // Already in X-NNN format
  if (/^[A-Z]-\d+$/.test(s)) return s
  // Pure digits → prepend tower from project name
  if (/^\d+$/.test(s)) {
    const tower = towerFromProject(projectName)
    return tower ? `${tower}-${s}` : s
  }
  // Letter + digits (A123) → A-123
  const m = s.match(/^([A-Z])(\d+)$/)
  if (m) return `${m[1]}-${m[2]}`
  return s
}

// ─────────────────────────────────────────
// JobCard
// ─────────────────────────────────────────
function buildSequenceMap(jobs: Job[]): Record<string, number> {
  const groups: Record<string, Job[]> = {}
  for (const j of jobs) {
    const key = `${j.project_id}|${j.room_no}`
    if (!groups[key]) groups[key] = []
    groups[key].push(j)
  }
  const map: Record<string, number> = {}
  for (const group of Object.values(groups)) {
    group.sort((a, b) => (a.order_date || a.id) < (b.order_date || b.id) ? -1 : 1)
    group.forEach((j, i) => { map[j.id] = i + 1 })
  }
  return map
}

function JobCard({ job, paymentMap, progressMap, onClick, seqNo }: {
  job: Job
  paymentMap: Record<string, PaymentSummary | null>
  progressMap: Record<string, ProgressSummary>
  onClick: () => void
  seqNo?: number
}) {
  const displayName = (job.condo_leads as any)?.customer_name || job.customer_name || ''
  const projectName = (job.projects as any)?.name || '—'
  const salesName = (job.sales as any)?.name || ''
  const phone = (job.condo_leads as any)?.phone || null
  const payment = paymentMap[job.id] ?? null
  const today = new Date().toISOString().slice(0, 10)
  const paid = progressMap[job.id]?.paid ?? 0
  const rev = job.revenue_inc_vat || 0
  const payPct = rev > 0 ? Math.min(100, Math.round(paid / rev * 100)) : null
  const barColor = payPct === null ? '' : payPct >= 100 ? 'var(--accent-green)' : payPct >= 50 ? 'var(--accent-blue)' : 'var(--accent-orange)'
  const isOverdue = !!job.expected_finish_date && job.expected_finish_date < today
    && job.working_status !== 'ส่งมอบแล้ว' && job.working_status !== 'ยกเลิก'

  return (
    <button
      onClick={onClick}
      className="w-full text-left rounded-[11px] p-3 flex flex-col gap-2 transition-all group"
      style={{
        background: 'var(--card-bg)',
        border: `1px solid ${isOverdue ? 'color-mix(in srgb, var(--accent-red) 35%, transparent)' : 'var(--card-border)'}`,
      }}
      onMouseEnter={e => (e.currentTarget.style.borderColor = isOverdue ? 'color-mix(in srgb, var(--accent-red) 60%, transparent)' : 'var(--accent)')}
      onMouseLeave={e => (e.currentTarget.style.borderColor = isOverdue ? 'color-mix(in srgb, var(--accent-red) 35%, transparent)' : 'var(--card-border)')}
    >
      {/* room + status */}
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <p className="font-bold text-sm truncate" style={{ color: 'var(--text-1)' }}>
              {job.room_no || '—'}
            </p>
            {seqNo && seqNo > 0 && (
              <span className="text-micro font-bold px-1.5 py-0.5 rounded-[4px] flex-shrink-0"
                style={{ background: 'color-mix(in srgb, var(--accent) 15%, transparent)', color: 'var(--accent)' }}>
                งานที่ {seqNo}
              </span>
            )}
          </div>
          <p className="text-xs truncate mt-0.5" style={{ color: 'var(--text-3)' }}>
            {displayName || '—'} · {projectName}
          </p>
        </div>
        <StatusChip kind="working" status={job.working_status} variant="outline" className="flex-shrink-0 mt-0.5" />
      </div>
      {/* work type + phone */}
      <div className="flex items-center gap-1.5 flex-wrap">
        {job.work_type && (
          <span className="text-micro px-1.5 py-0.5 rounded-[4px] font-semibold"
            style={{ background: 'var(--hover-bg)', color: 'var(--text-2)' }}>
            {job.work_type}
          </span>
        )}
        {job.package_type && (
          <span className="text-micro px-1.5 py-0.5 rounded-[4px] font-semibold"
            style={{ background: 'var(--hover-bg)', color: 'var(--text-3)' }}>
            {job.package_type}
          </span>
        )}
        {phone && (
          <span className="text-micro flex items-center gap-1" style={{ color: 'var(--text-3)' }}>
            <Phone size={9} /> {phone}
          </span>
        )}
      </div>
      {/* payment progress bar */}
      {payPct !== null && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: '10px', color: 'var(--text-3)' }}>ชำระแล้ว</span>
            <span style={{ fontSize: '10px', fontWeight: 700, color: barColor }}>{payPct}%</span>
          </div>
          <div style={{ height: '4px', borderRadius: '9999px', overflow: 'hidden', background: 'var(--hover-bg)' }}>
            <div style={{ height: '100%', width: `${payPct}%`, borderRadius: '9999px', background: barColor }} />
          </div>
        </div>
      )}
      {/* revenue + badges + chevron */}
      <div className="flex items-center justify-between gap-2">
        <div>
          {job.revenue_inc_vat ? (
            <p className="text-xs font-bold" style={{ color: 'var(--accent-green)' }}>฿<Money value={job.revenue_inc_vat} /></p>
          ) : (
            <p className="text-micro" style={{ color: 'var(--text-3)' }}>ยังไม่มีรายได้</p>
          )}
          {salesName && <p className="text-micro" style={{ color: 'var(--text-3)' }}>{salesName}</p>}
        </div>
        <div className="flex items-center gap-1.5">
          {payment && (() => {
            // An instalment that is merely awaiting payment is not an error —
            // orange. Red is kept for one whose due date has actually passed,
            // so this chip stays distinguishable from the เกินกำหนด chip beside it.
            const tone = payment.due_date && payment.due_date < today ? 'var(--accent-red)' : 'var(--accent-orange)'
            return (
              <span className="text-micro px-1.5 py-0.5 rounded-[4px] font-semibold"
                style={{ background: `color-mix(in srgb, ${tone} 12%, transparent)`, color: tone }}>
                ค้าง {payment.installment_name}
              </span>
            )
          })()}
          {isOverdue && (
            <span className="text-micro px-1.5 py-0.5 rounded-[4px] font-semibold" style={{ background: 'color-mix(in srgb, var(--accent-red) 15%, transparent)', color: 'var(--accent-red)' }}>
              เกินกำหนด
            </span>
          )}
          <ChevronRight size={14} style={{ color: 'var(--text-3)' }} className="opacity-40 group-hover:opacity-100 transition-opacity" />
        </div>
      </div>
    </button>
  )
}

// ─────────────────────────────────────────
function SectionDivider({ label, color }: { label: string; color: string }) {
  return (
    <div className="flex items-center gap-2 pt-3 pb-1">
      <div style={{ width: 6, height: 6, borderRadius: '50%', background: color, flexShrink: 0 }} />
      <span className="text-sm font-semibold" style={{ color, whiteSpace: 'nowrap' }}>{label}</span>
      <div style={{ flex: 1, height: '1px', background: 'var(--card-border)' }} />
    </div>
  )
}

// ─────────────────────────────────────────

const emptyJob = (): Partial<Job> => ({
  customer_type: 'B2C',
  working_status: 'ดำเนินการ',
  commission_status: 'pending',
  revenue_ex_vat: 0,
  revenue_inc_vat: 0,
  contract_date: '',
  work_start_date: '',
  plan_transfer_month: '',
  voucher: 0,
  cost: 0,
  commission_rate: 0,
  commission_amount: 0,
})

const f = (v?: number) => '฿' + Math.round(v || 0).toLocaleString()
const pct = (v?: number) => ((v || 0) * 100).toFixed(1) + '%'

function calcCommission(revenue: number, tiers: CommissionTier[]): { rate: number; amount: number } {
  const sorted = [...tiers].sort((a, b) => a.revenue_min - b.revenue_min)
  for (const t of sorted) {
    if (t.revenue_max === null || revenue <= t.revenue_max) {
      return { rate: t.rate, amount: Math.round(revenue * t.rate) }
    }
  }
  return { rate: 0, amount: 0 }
}

// ─────────────────────────────────────────
// Add Job Modal (same fields as StartJobModal, creates customer at 'booked' stage)
function AddJobModal({
  projects, users, myId, onClose, onSaved,
}: {
  projects: { id: string; name: string }[]
  users: { id: string; name: string }[]
  myId: string
  onClose: () => void
  onSaved: () => void
}) {
  const supabase = createClient()
  const [customerName, setCustomerName] = useState('')
  const [projectId, setProjectId] = useState(projects[0]?.id || '')
  const [roomNo, setRoomNo] = useState('')
  const [revenue, setRevenue] = useState(0)
  const [custType, setCustType] = useState<'B2C' | 'B2B'>('B2C')
  const [pkgType, setPkgType] = useState('')
  const [workType, setWorkType] = useState('N-RPT/Event')
  const [orderDate, setOrderDate] = useState(new Date().toISOString().slice(0, 10))
  const [salesId, setSalesId] = useState(myId)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const inputStyle = { background: 'var(--input-bg)', border: '1px solid var(--divider)', color: 'var(--text-1)' }
  const revenueEx = revenue ? Math.round(revenue / 1.07) : 0

  async function save() {
    if (!customerName.trim()) { setError('กรุณาระบุชื่อลูกค้า'); return }
    if (!projectId) { setError('กรุณาเลือกโครงการ'); return }
    if (!roomNo.trim()) { setError('กรุณาระบุเลขห้อง'); return }
    setSaving(true); setError('')

    const { data: allJobs } = await supabase.from('jobs').select('id')
    const maxNum = (allJobs || []).reduce((max: number, j: { id: string }) => {
      const n = parseInt(j.id.replace(/\D/g, '')) || 0
      return Math.max(max, n)
    }, 0)
    const jobId = `JOB-${String(maxNum + 1).padStart(3, '0')}`
    const baseId = `${projectId}-${roomNo.trim()}`
    const isB2B = custType === 'B2B'
    const { data: existing } = await supabase.from('customers').select('id, customer_type').eq('id', baseId).maybeSingle()
    const customerId = isB2B && existing && existing.customer_type !== 'B2B' ? `${baseId}-B2B` : baseId

    // Create customer at 'booked' stage (not 'closed') — requires payment before entering My Deals
    await supabase.from('customers').upsert({
      id: customerId, project_id: projectId,
      customer_name: customerName.trim(), customer_type: custType, status: 'booked',
    }, { onConflict: 'id', ignoreDuplicates: true })

    const { error: jobErr } = await supabase.from('jobs').insert({
      id: jobId, customer_id: customerId,
      project_id: projectId, room_no: roomNo.trim(),
      customer_name: customerName.trim(), customer_type: custType,
      work_type: workType, package_type: pkgType || null, order_date: orderDate,
      revenue_inc_vat: revenue || null, revenue_ex_vat: revenueEx || null,
      working_status: 'ดำเนินการ', accounting_status: 'Reserved', sales_id: salesId || null,
    })

    if (jobErr) { setError('เกิดข้อผิดพลาด: ' + jobErr.message); setSaving(false); return }
    setSaving(false); onSaved(); onClose()
  }

  return (
    <div className="fixed inset-0 z-[70] flex items-end sm:items-center justify-center px-4 pb-4 pt-14 lg:pt-4" onClick={onClose}>
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
      <div className="relative w-full max-w-sm rounded-[18px] shadow-2xl overflow-y-auto max-h-[90vh]"
        data-panel style={{ background: 'var(--panel-bg)', border: '1px solid var(--card-border)' }}
        onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between p-5" style={{ borderBottom: '1px solid var(--divider)' }}>
          <h3 className="font-semibold text-sm" style={{ color: 'var(--text-1)' }}>เพิ่มงานใหม่</h3>
          <button onClick={onClose} style={{ color: 'var(--text-2)' }}><X size={18} /></button>
        </div>
        <div className="p-5 space-y-3">
          <div>
            <label className="text-xs mb-1 block" style={{ color: 'var(--text-2)' }}>ชื่อลูกค้า *</label>
            <input value={customerName} onChange={e => setCustomerName(e.target.value)} autoFocus
              className="w-full px-3 py-2 rounded-[8px] text-sm focus:outline-none"
              style={inputStyle} placeholder="ชื่อ-นามสกุล หรือบริษัท" />
          </div>
          <div>
            <label className="text-xs mb-1 block" style={{ color: 'var(--text-2)' }}>โครงการ *</label>
            <select value={projectId} onChange={e => setProjectId(e.target.value)} className="field-input w-full">
              <option value="">— เลือกโครงการ —</option>
              {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </div>
          <div>
            <label className="text-xs mb-1 block" style={{ color: 'var(--text-2)' }}>เลขห้อง *</label>
            <input value={roomNo} onChange={e => setRoomNo(e.target.value)}
              className="w-full px-3 py-2 rounded-[8px] text-sm focus:outline-none"
              style={inputStyle} placeholder="เช่น A-101" />
          </div>
          <div>
            <label className="text-xs mb-1 block" style={{ color: 'var(--text-2)' }}>มูลค่างาน (inc. VAT)</label>
            <input type="number" value={revenue || ''} onChange={e => setRevenue(Number(e.target.value))}
              className="w-full px-3 py-2 rounded-[8px] text-sm focus:outline-none" style={inputStyle} />
            {revenue > 0 && <p className="text-label mt-1" style={{ color: 'var(--text-3)' }}>ex. VAT ≈ ฿{revenueEx.toLocaleString()}</p>}
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-xs mb-1 block" style={{ color: 'var(--text-2)' }}>ประเภทลูกค้า</label>
              <select value={custType} onChange={e => setCustType(e.target.value as 'B2C' | 'B2B')} className="field-input">
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
            <select value={workType} onChange={e => setWorkType(e.target.value)} className="field-input">
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
            <select value={salesId} onChange={e => setSalesId(e.target.value)} className="field-input">
              <option value="">— เลือก —</option>
              {users.map(u => <option key={u.id} value={u.id}>{u.name}</option>)}
            </select>
          </div>
          {error && <p className="text-xs text-danger">{error}</p>}
          <button onClick={save} disabled={saving}
            className="w-full py-3 rounded-[11px] font-semibold text-sm text-white"
            style={{ background: saving ? '#666' : 'var(--accent)' }}>
            {saving ? 'กำลังสร้างงาน...' : '+ เพิ่มงาน'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ─────────────────────────────────────────
// Main Page
// ─────────────────────────────────────────
export default function JobsPage() {
  const supabase = createClient()
  const [jobs, setJobs] = useState<Job[]>([])
  const [projects, setProjects] = useState<{ id: string; name: string }[]>([])
  const [users, setUsers] = useState<{ id: string; name: string }[]>([])
  const [tiers, setTiers] = useState<CommissionTier[]>([])
  const [referrals, setReferrals] = useState<{ job_id: string; referrer_name: string; referral_amount: number }[]>([])
  const [leads, setLeads] = useState<Lead[]>([])
  const [paymentMap, setPaymentMap] = useState<Record<string, PaymentSummary | null>>({})
  const [progressMap, setProgressMap] = useState<Record<string, ProgressSummary>>({})
  const [myRole, setMyRole] = useState('')
  const [myId, setMyId] = useState('')
  const [loading, setLoading] = useState(true)

  // Quick filter
  const [filterNoSO, setFilterNoSO] = useState(false)
  const [filterNoPO, setFilterNoPO] = useState(false)

  // Filters
  const [search, setSearch] = useState('')
  const [filterProject, setFilterProject] = useState('')
  const [filterStatus, setFilterStatus] = useState('')
  const [filterSales, setFilterSales] = useState('')
  const [filterWorkType, setFilterWorkType] = useState('')
  const [filterCustomerType, setFilterCustomerType] = useState('')

  // Add Job Modal
  const [showAddModal, setShowAddModal] = useState(false)

  // Modal
  const [open, setOpen] = useState(false)
  const [editing, setEditing] = useState<Partial<Job>>(emptyJob())
  const [saving, setSaving] = useState(false)
  const [nextId, setNextId] = useState('JOB-001')
  const [fetchError, setFetchError] = useState('')
  const [page, setPage] = useState(1)
  const [roomNormalized, setRoomNormalized] = useState('')
  const [roomDupWarning, setRoomDupWarning] = useState<string | null>(null)
  const [editPhone, setEditPhone] = useState('')

  // ─── Load leads by project ───
  const loadLeads = useCallback(async (projectId: string) => {
    if (!projectId) { setLeads([]); return }
    const { data } = await supabase
      .from('condo_leads')
      .select('id, room_no, customer_name, phone')
      .eq('project_id', projectId)
      .order('room_no')
    setLeads((data as Lead[]) || [])
  }, [])

  // ─── Load ───
  const load = useCallback(async () => {
    setLoading(true)
    setFetchError('')
    const { data: { user } } = await supabase.auth.getUser()
    if (user) {
      const { data: u } = await supabase.from('users').select('id, role').eq('email', user.email!).single()
      if (u) { setMyRole(u.role); setMyId(u.id) }
    }
    const [
      { data: jobsData, error: e1 },
      { data: projData },
      { data: usrData },
      { data: tierData },
      { data: paymentsData },
      { data: refData },
    ] = await Promise.all([
      supabase.from('jobs').select('*, condo_leads(customer_name,room_no,phone), projects(name), sales:users!jobs_sales_id_fkey(name), job_payments:payments(status,paid_amount,amount,voucher_amount)').order('room_no').range(0, 999),
      supabase.from('projects').select('id, name').eq('active', true).order('name'),
      supabase.from('users').select('id, name').eq('active', true).in('dept', ['Sales Executive', 'Administration']).order('name'),
      supabase.from('commission_settings').select('*').eq('active', true).order('sort_order'),
      supabase.from('payments').select('job_id, installment_name, status, amount, due_date').neq('status', 'paid').order('due_date'),
      supabase.from('commission_referrals').select('job_id,referrer_name,referral_amount').order('created_at'),
    ])
    if (e1) { setFetchError(e1.message); setLoading(false); return }
    setJobs((jobsData as Job[]) || [])
    setProjects(projData || [])
    setUsers(usrData || [])
    setTiers(tierData || [])
    setReferrals((refData || []) as { job_id: string; referrer_name: string; referral_amount: number }[])

    // Build payment map by customer_id (first pending/overdue installment per customer)
    const map: Record<string, PaymentSummary | null> = {}
    for (const p of (paymentsData || []) as any[]) {
      if (p.job_id && !map[p.job_id]) {
        map[p.job_id] = {
          installment_name: p.installment_name,
          status: p.status,
          amount: p.amount,
          due_date: p.due_date,
        }
      }
    }
    setPaymentMap(map)

    // Build progress map from nested job_payments (avoid separate query issues)
    const pmap: Record<string, ProgressSummary> = {}
    for (const j of (jobsData || []) as any[]) {
      const paid = ((j.job_payments || []) as any[])
        .filter((p: any) => p.status === 'paid')
        .reduce((s: number, p: any) => s + Number(p.paid_amount ?? p.amount ?? 0) + Number(p.voucher_amount ?? 0), 0)
      if (paid > 0) pmap[j.id] = { paid }
    }
    setProgressMap(pmap)

    const ids = (jobsData || []).map((j: Job) => parseInt(j.id.replace('JOB-', '')) || 0)
    const maxId = ids.length ? Math.max(...ids) : 0
    setNextId(`JOB-${String(maxId + 1).padStart(3, '0')}`)
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

  // ─── Commission auto-calc when revenue changes ───
  function handleRevenueChange(incVat: number) {
    const exVat = incVat ? Math.round(incVat / 1.07) : 0
    const { rate, amount } = calcCommission(exVat, tiers)
    setEditing(e => ({ ...e, revenue_inc_vat: incVat, revenue_ex_vat: exVat, commission_rate: rate, commission_amount: amount }))
  }

  // ─── Project select → load leads ───
  function handleProjectSelect(projectId: string) {
    setEditing(e => ({ ...e, project_id: projectId, lead_id: null, room_no: '', customer_name: '' }))
    loadLeads(projectId)
  }

  // ─── Lead (room) select → auto-fill ───
  function handleLeadSelect(leadId: string) {
    const lead = leads.find(l => String(l.id) === leadId)
    setEditing(e => {
      const projectId = e.project_id || ''
      const roomNo = lead?.room_no || ''
      const customerId = projectId && roomNo ? `${projectId}-${roomNo.trim().toUpperCase()}` : e.customer_id || ''
      return {
        ...e,
        lead_id: lead ? lead.id : null,
        room_no: roomNo,
        customer_name: lead?.customer_name || '',
        customer_id: customerId,
      }
    })
  }

  // ─── Room no change: normalize + duplicate check ───
  function handleRoomNoChange(raw: string, projectId?: string, currentJobId?: string) {
    setEditing(e => ({ ...e, room_no: raw }))
    const pid = projectId || editing.project_id || ''
    const projectName = projects.find(p => p.id === pid)?.name || ''
    const normalized = normalizeRoomNo(raw, projectName)
    setRoomNormalized(normalized !== raw.trim().toUpperCase() ? normalized : '')
    const dup = normalized ? jobs.find(j =>
      j.id !== currentJobId &&
      j.project_id === pid &&
      normalizeRoomNo(j.room_no || '', projectName) === normalized
    ) : undefined
    setRoomDupWarning(dup ? `ห้อง ${normalized} มีอยู่แล้วในโครงการนี้ (${dup.id})` : null)
  }

  // ─── Open Add ───
  function openAdd() {
    setEditing({ ...emptyJob(), id: nextId, sales_id: myId })
    setLeads([])
    setRoomNormalized('')
    setRoomDupWarning(null)
    setEditPhone('')
    setOpen(true)
  }

  // ─── Open Edit ───
  async function openEdit(j: Job) {
    const editData = { ...j }
    // B2B: fill company_name from customer_name if missing
    if (editData.customer_type === 'B2B' && !editData.company_name && editData.customer_name) {
      editData.company_name = editData.customer_name
    }
    setEditing(editData)
    if (j.project_id) {
      // load leads then auto-match lead_id from room_no if not already set
      const { data } = await supabase.from('condo_leads').select('id, room_no, customer_name, phone').eq('project_id', j.project_id).order('room_no')
      const loadedLeads = (data as Lead[]) || []
      setLeads(loadedLeads)
      if (!editData.lead_id && editData.room_no) {
        const matched = loadedLeads.find(l => l.room_no === editData.room_no)
        if (matched) setEditing(e => ({ ...e, lead_id: matched.id }))
      }
    }
    setRoomNormalized('')
    setRoomDupWarning(null)
    setEditPhone((j.condo_leads as any)?.phone || '')
    setOpen(true)
  }

  // ─── Save ───
  async function save() {
    if (!editing.id) return
    if (roomDupWarning) return
    setSaving(true)
    const projectName = projects.find(p => p.id === editing.project_id)?.name || ''
    const payload: any = {
      ...editing,
      room_no: editing.room_no ? normalizeRoomNo(editing.room_no, projectName) : editing.room_no,
    }
    delete payload.customers
    delete payload.projects
    delete payload.sales
    delete payload.condo_leads
    // null-ify empty optionals
    payload.lead_id = payload.lead_id || null
    payload.customer_id = payload.customer_id || null
    payload.project_id = payload.project_id || null
    payload.order_date = payload.order_date || null
    payload.expected_finish_date = payload.expected_finish_date || null
    payload.actual_deliver_date = payload.actual_deliver_date || null
    payload.commission_month = payload.commission_month || null
    payload.contract_date = payload.contract_date || null
    payload.work_start_date = payload.work_start_date || null
    payload.plan_transfer_month = payload.plan_transfer_month || null
    // Selects too, not just dates. An empty string is not "no value" to Postgres:
    // it produced one job stored with working_status = '' (JOB-1095), which matches
    // no status anywhere, and it would be rejected outright by the CHECK constraints
    // on commission_status and crm_stage.
    payload.working_status = payload.working_status || null
    payload.commission_status = payload.commission_status || null
    payload.crm_stage = payload.crm_stage || null
    payload.work_type = payload.work_type || null
    payload.package_type = payload.package_type || null
    payload.sales_id = payload.sales_id || null
    // Auto-correct: if actual_deliver_date is set, status must not be lower than ส่งมอบแล้ว
    if (payload.actual_deliver_date && payload.working_status === 'ดำเนินการ') {
      payload.working_status = 'ส่งมอบแล้ว'
    }
    const isNew = !jobs.find(j => j.id === editing.id)
    if (isNew) {
      // Auto-create customer record so job appears in Prospect/customers page
      if (payload.project_id && payload.room_no) {
        const baseId = payload.customer_id || `${payload.project_id}-${payload.room_no}`
        const isB2B = (payload.customer_type || 'B2C') === 'B2B'
        // Check if a B2C customer already exists for this room
        const { data: existing } = await supabase.from('customers').select('id, customer_type').eq('id', baseId).maybeSingle()
        let customerId = baseId
        if (isB2B && existing && existing.customer_type !== 'B2B') {
          // Room already has a B2C record — create separate B2B customer
          customerId = `${baseId}-B2B`
        }
        await supabase.from('customers').upsert({
          id: customerId,
          project_id: payload.project_id,
          customer_name: payload.customer_name || '',
          customer_type: payload.customer_type || 'B2C',
          status: 'closed',
        }, { onConflict: 'id', ignoreDuplicates: true })
        payload.customer_id = customerId
      }
      await supabase.from('jobs').insert([payload])
    } else {
      await supabase.from('jobs').update(payload).eq('id', editing.id!)
    }
    // Update phone on condo_leads if lead is linked
    if (editing.lead_id && editPhone !== undefined) {
      await supabase.from('condo_leads').update({ phone: editPhone || null }).eq('id', editing.lead_id)
    }
    setSaving(false)
    setOpen(false)
    load()
  }

  // ─── Filter ───
  // A cancelled job has no SO or PO and never will, so it is not missing one.
  // The counts already excluded them; the toggles did not, so turning one on
  // listed rows the badge had never counted.
  const missingSO = (j: Job) => !j.so_no?.trim() && j.working_status !== 'ยกเลิก'
  const missingPO = (j: Job) => j.customer_type === 'B2B' && !j.po_no?.trim() && j.working_status !== 'ยกเลิก'

  // Everything except the two document toggles. Their badges count from here,
  // so the numbers follow the project / sales / status filters instead of
  // standing still at the whole-book total while the table shows one project.
  const baseFiltered = jobs.filter(j => {
    const s = search.toLowerCase()
    const sNorm = s.replace(/-/g, '')
    const name = (j.condo_leads as any)?.customer_name || j.customer_name || (j.customers as any)?.customer_name || ''
    const matchSearch = !s || [j.po_no, j.so_no, j.id, name, (j.projects as any)?.name]
      .some(v => v?.toLowerCase().includes(s)) || (j.room_no?.toLowerCase().replace(/-/g, '') || '').includes(sNorm)
    const matchProj = !filterProject || j.project_id === filterProject
    const matchStatus = !filterStatus || j.working_status === filterStatus
    const matchSales = !filterSales || j.sales_id === filterSales
    const matchWorkType = !filterWorkType || j.work_type === filterWorkType
    const matchCustomerType = !filterCustomerType || j.customer_type === filterCustomerType
    return matchSearch && matchProj && matchStatus && matchSales && matchWorkType && matchCustomerType
  })

  const filtered = baseFiltered.filter(j =>
    (!filterNoSO || missingSO(j)) && (!filterNoPO || missingPO(j))
  )

  // Each badge counts what its own toggle would select, with the other one
  // still applied — the same rule the status chips elsewhere follow.
  const noSOCount = baseFiltered.filter(j => missingSO(j) && (!filterNoPO || missingPO(j))).length
  const noPOCount = baseFiltered.filter(j => missingPO(j) && (!filterNoSO || missingSO(j))).length

  useEffect(() => { setPage(1) }, [search, filterProject, filterStatus, filterSales, filterWorkType, filterCustomerType, filterNoSO, filterNoPO])

  function sortRoomNo(a: string, b: string): number {
    const parse = (r: string) => {
      const m = (r || '').toUpperCase().match(/^([A-Z])-?(\d+)$/)
      return m ? { letter: m[1], num: parseInt(m[2]) } : { letter: r || '', num: 0 }
    }
    const pa = parse(a), pb = parse(b)
    if (pa.letter !== pb.letter) return pa.letter.localeCompare(pb.letter)
    return pa.num - pb.num
  }

  useEffect(() => { setPage(1) }, [search, filterProject, filterStatus, filterSales, filterWorkType, filterCustomerType, filterNoSO, filterNoPO])

  // Paginate the flat list first, then group what is on this page. Grouping the
  // whole set and paginating groups would give wildly uneven pages — one project
  // has hundreds of rooms, most have a handful.
  const paginated = useMemo(() => filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE), [filtered, page])

  const groupedJobs = useMemo(() => {
    const groups = new Map<string, { projectName: string; jobs: Job[] }>()
    for (const j of paginated) {
      const pid = j.project_id || '__no_project__'
      const name = (j.projects as any)?.name || j.project_id || 'ไม่ระบุโครงการ'
      if (!groups.has(pid)) groups.set(pid, { projectName: name, jobs: [] })
      groups.get(pid)!.jobs.push(j)
    }
    return [...groups.entries()]
      .map(([pid, g]) => ({ projectId: pid, projectName: g.projectName, jobs: g.jobs.sort((a, b) => sortRoomNo(a.room_no, b.room_no)) }))
      .sort((a, b) => a.projectName.localeCompare(b.projectName, 'th'))
  }, [paginated])

  function exportCSV() {
    const headers = [
      'ลูกค้า', 'เบอร์โทร', 'ประเภทลูกค้า', 'โครงการ', 'ห้อง', 'Job ID',
      'ประเภทงาน', 'แพ็กเกจ', 'PO', 'SO',
      'วันสั่งงาน', 'วันเริ่มงาน', 'วันกำหนดส่ง', 'วันส่งมอบ (จริง)',
      'Revenue (Ex.VAT)', 'Revenue (Inc.VAT)', 'Voucher', 'Cost', 'GP%',
      'เกณฑ์ Commission (Tier)', 'Commission Rate%', 'Commission', 'สถานะ Commission',
      'ผู้แนะนำ (Referral)', 'ค่าแนะนำรวม',
      'สถานะงาน', 'Sales',
    ]
    const rows = filtered.map(j => {
      const name = (j.condo_leads as any)?.customer_name || j.customer_name || ''
      const phone = (j.condo_leads as any)?.phone || ''
      const project = (j.projects as any)?.name || ''
      const sales = (j.sales as any)?.name || ''
      const profitAmt = (j.revenue_ex_vat || 0) - (j.cost || 0)
      const gp = (j.revenue_ex_vat || 0) > 0 ? (profitAmt / j.revenue_ex_vat * 100).toFixed(1) : ''
      const fmt = (d: string | null) => d ? new Date(d).toLocaleDateString('th-TH', { day: '2-digit', month: 'short', year: '2-digit' }) : ''
      const commStatusLabel: Record<string, string> = { pending: 'รอ', approved: 'อนุมัติ', paid: 'จ่ายแล้ว' }
      // Commission: prefer DB value, fallback to tier calc
      const { rate: tierRate, amount: tierAmt } = calcCommission(j.revenue_ex_vat || 0, tiers)
      const commRate = j.commission_rate || tierRate
      const commAmt  = j.commission_amount || tierAmt
      // Tier name
      const sorted = [...tiers].sort((a, b) => a.revenue_min - b.revenue_min)
      const matchedTier = sorted.find(t => (j.revenue_ex_vat || 0) >= t.revenue_min && (t.revenue_max === null || (j.revenue_ex_vat || 0) <= t.revenue_max))
      const tierName = (matchedTier as any)?.tier_name || (commRate ? `${(commRate * 100).toFixed(2)}%` : '—')
      // Referrals
      const jobRefs = referrals.filter(r => r.job_id === j.id)
      const refNames = jobRefs.map(r => `${r.referrer_name} (${Math.round(r.referral_amount).toLocaleString()})`).join(', ')
      const refTotal = jobRefs.reduce((s, r) => s + r.referral_amount, 0)
      return [
        name, phone, j.customer_type || '', project, j.room_no || '', j.id,
        j.work_type || '', j.package_type || '', j.po_no || '', j.so_no || '',
        fmt(j.order_date), fmt((j as any).work_start_date), fmt(j.expected_finish_date), fmt(j.actual_deliver_date),
        j.revenue_ex_vat || 0, j.revenue_inc_vat || 0, j.voucher || 0, j.cost || 0, gp,
        tierName, commRate ? (commRate * 100).toFixed(2) : '', commAmt || 0,
        commStatusLabel[j.commission_status] || j.commission_status || '',
        refNames, refTotal || '',
        j.working_status || '', sales,
      ]
    })
    const csv = [headers, ...rows].map(r => r.map(v => `"${String(v).replace(/"/g, '""')}"`).join(',')).join('\n')
    const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a'); a.href = url; a.download = `wyde-clients-${new Date().toISOString().slice(0,10)}.csv`; a.click()
    URL.revokeObjectURL(url)
  }

  // ─── Summary ───
  const totalRevenue = filtered.reduce((s, j) => s + (j.revenue_ex_vat || 0), 0)
  const totalCommission = filtered.reduce((s, j) => s + (j.commission_amount || 0), 0)
  const totalCost = filtered.reduce((s, j) => s + (j.cost || 0), 0)

  const profit = (editing.revenue_ex_vat || 0) - (editing.cost || 0)
  const gpPct = (editing.revenue_ex_vat || 0) > 0
    ? (profit / (editing.revenue_ex_vat || 1) * 100).toFixed(1) : '—'

  const canWrite = ['admin', 'admin_sales', 'sales'].includes(myRole)

  if (loading) return <PageSpinner />
  if (fetchError) return <PageError message={fetchError} onRetry={load} />

  return (
    <div className="page-content space-y-5">
      {/* Header */}
      <PageHeader
        title="Wyde Clients"
        subtitle="บันทึก PO/SO ต่องาน · ติดตามงวดการเก็บเงิน"
        className=""
        actions={
          <button onClick={exportCSV}
            className="flex items-center gap-1.5 px-3 py-2 rounded-[11px] text-xs font-semibold"
            style={{ background: 'var(--glass-bg)', border: '1px solid var(--glass-border)', color: 'var(--text-2)' }}>
            <FileDown size={13} /> Export CSV
          </button>
        }
      />

      {/* Filters — the no-SO / no-PO chips live in the card too; they narrow
          the same list, so they belong with the other controls. */}
      <FilterBar
        search={search}
        onSearchChange={setSearch}
        searchPlaceholder="ค้นหา PO / SO / ลูกค้า..."
      >
        <SearchableSelect
          value={filterProject}
          onChange={v => setFilterProject(v)}
          options={[{ value: '', label: 'ทุกโครงการ' }, ...projects.map(p => ({ value: p.id, label: p.name }))]}
          placeholder="ทุกโครงการ"
        />
        <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)}
          className="field-input" style={{ width: 'auto' }}>
          <option value="">ทุกสถานะ</option>
          {WORKING_STATUSES.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
        </select>
        <select value={filterSales} onChange={e => setFilterSales(e.target.value)}
          className="field-input" style={{ width: 'auto' }}>
          <option value="">ทุก Sales</option>
          {users.map(u => <option key={u.id} value={u.id}>{u.name}</option>)}
        </select>
        <select value={filterCustomerType} onChange={e => setFilterCustomerType(e.target.value)}
          className="field-input" style={{ width: 'auto' }}>
          <option value="">B2C + B2B</option>
          <option value="B2C">B2C</option>
          <option value="B2B">B2B</option>
        </select>
        <select value={filterWorkType} onChange={e => setFilterWorkType(e.target.value)}
          className="field-input" style={{ width: 'auto' }}>
          <option value="">ทุกประเภทงาน</option>
          {WORK_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
        </select>
      </FilterBar>

      {/* Status chips in their own row between the filter card and the data,
          matching Customers. They used to sit inside the filter card; separated
          they read as a sequence — search, then narrow by status, then results. */}
      <div className="tab-group mb-4 flex-wrap">
        {([
          { on: filterNoSO, toggle: () => setFilterNoSO(v => !v), label: 'ไม่มี SO', count: noSOCount },
          { on: filterNoPO, toggle: () => setFilterNoPO(v => !v), label: 'ไม่มี PO', count: noPOCount },
        ]).map(c => (
          <button key={c.label} onClick={c.toggle}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-[8px] text-xs font-semibold whitespace-nowrap flex-shrink-0 transition-colors"
            style={c.on
              ? { background: 'var(--accent)', color: '#fff' }
              : { color: 'var(--text-2)' }}>
            {c.label}
            {c.count > 0 && (
              <span className="font-bold" style={{ color: c.on ? '#fff' : 'var(--accent-orange)' }}>{c.count}</span>
            )}
          </button>
        ))}
      </div>

      {/* Summary KPI */}
      {(() => {
        // GP% is computed over jobs that actually have a cost recorded. Dividing
        // by total revenue counted every job with no cost as pure profit, which
        // put the headline at 99.3% when only 6.7% of jobs carry cost data —
        // the real margin across those is about 31%.
        const costedJobs = filtered.filter(j => (j.cost || 0) > 0)
        const costedRevenue = costedJobs.reduce((s, j) => s + (j.revenue_ex_vat || 0), 0)
        const costedCost = costedJobs.reduce((s, j) => s + (j.cost || 0), 0)
        const profit = costedRevenue - costedCost
        const gpPctAvg = costedRevenue > 0 ? (profit / costedRevenue * 100) : null
        const costCoverage = filtered.length > 0 ? costedJobs.length / filtered.length * 100 : 0
        const gpColor = gpPctAvg === null ? 'var(--text-3)' : gpPctAvg >= 20 ? 'var(--accent-green)' : gpPctAvg >= 10 ? 'var(--accent-orange)' : 'var(--accent-red)'
        const overdueCount = filtered.filter(j => {
          if (j.working_status === 'ส่งมอบแล้ว' || j.working_status === 'ยกเลิก') return false
          if (!j.expected_finish_date) return false
          return j.expected_finish_date < new Date().toISOString().slice(0, 10)
        }).length
        return (
          <div className="grid grid-cols-3 gap-4">
            <div className="ds-card p-4">
              <p className="text-xs mb-1" style={{ color: 'var(--text-3)' }}>Revenue (Ex.VAT)</p>
              <p className="text-lg font-bold" style={{ color: 'var(--accent-green)' }}>{f(totalRevenue)}</p>
              <p className="text-label mt-0.5" style={{ color: 'var(--text-3)' }}>Cost {f(totalCost)}</p>
            </div>
            <div className="ds-card p-4">
              <p className="text-xs mb-1" style={{ color: 'var(--text-3)' }}>GP% (เฉพาะงานที่มีต้นทุน)</p>
              <p className="text-lg font-bold" style={{ color: gpColor }}>
                {gpPctAvg !== null ? gpPctAvg.toFixed(1) + '%' : '—'}
              </p>
              <p className="text-label mt-0.5" style={{ color: costCoverage < 50 ? 'var(--accent-orange)' : 'var(--text-3)' }}>
                กำไร {f(profit)} · มีต้นทุน {costedJobs.length}/{filtered.length} งาน ({costCoverage.toFixed(0)}%)
              </p>
            </div>
            <div className="ds-card p-4">
              <p className="text-xs mb-1" style={{ color: 'var(--text-3)' }}>เกินกำหนด</p>
              <p className="text-lg font-bold" style={{ color: overdueCount > 0 ? 'var(--accent-red)' : 'var(--accent-green)' }}>
                {overdueCount} งาน
              </p>
              <p className="text-label mt-0.5" style={{ color: 'var(--text-3)' }}>ยังไม่ส่งมอบ</p>
            </div>
          </div>
        )
      })()}

      {/* ─── Card Grid (grouped by project) ─── */}
      {filtered.length === 0 ? (
        <div className="ds-card"><EmptyState icon={Briefcase} message="ยังไม่มีข้อมูล" sub="ยังไม่มีงานที่ตรงกับตัวกรอง" /></div>
      ) : (() => {
        const seqMap = buildSequenceMap(filtered)
        return (
          <div className="space-y-6">
            {groupedJobs.map(({ projectId, projectName, jobs: groupJobs }) => (
              <div key={projectId}>
                {/* Project header */}
                <div className="flex items-center gap-2 mb-3">
                  <p className="text-xs font-bold uppercase tracking-wider flex-shrink-0" style={{ color: 'var(--accent)' }}>
                    {projectName}
                  </p>
                  <span className="text-xs px-1.5 py-0.5 rounded-[4px] font-semibold flex-shrink-0"
                    style={{ background: 'var(--hover-bg)', color: 'var(--text-3)' }}>
                    {groupJobs.length} งาน
                  </span>
                  <div className="flex-1 h-px" style={{ background: 'var(--divider)' }} />
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4 gap-3">
                  {groupJobs.map(j => (
                    <JobCard key={j.id} job={j} paymentMap={paymentMap} progressMap={progressMap} onClick={() => openEdit(j)} seqNo={seqMap[j.id]} />
                  ))}
                </div>
              </div>
            ))}
          </div>
        )
      })()}
      <div className="ds-card" style={{ padding: 0 }}>
        <Pagination page={page} setPage={setPage} total={filtered.length} pageSize={PAGE_SIZE} unit="งาน"
          grandTotal={jobs.length} />
      </div>

      {/* ─── Detail Drawer ─── */}
      {open && (
        <>
          <div className="fixed inset-0 z-40 bg-black/60 backdrop-blur-sm" onClick={() => setOpen(false)} />
          <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center pointer-events-none px-4 pb-4 pt-14 lg:pt-4">
          <div className="w-full max-w-3xl max-h-[90vh] overflow-y-auto overflow-x-hidden rounded-[20px] p-6 space-y-5 pointer-events-auto"
            data-panel style={{ background: 'var(--panel-bg)', border: '1px solid var(--card-border)' }}>

            {/* Modal header */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Briefcase size={16} style={{ color: 'var(--accent)' }} />
                <h2 className="text-base font-bold" style={{ color: 'var(--text-1)' }}>
                  {jobs.find(j => j.id === editing.id) ? 'แก้ไขงาน' : 'เพิ่มงานใหม่'} — {editing.id}
                </h2>
              </div>
              <button onClick={() => setOpen(false)} style={{ color: 'var(--text-3)' }}><X size={18} /></button>
            </div>

            {/* ── 1 · ลูกค้า & ห้อง ── */}
            <section>
              <SectionDivider label="1 · ลูกค้า & ห้อง" color="var(--accent)" />
              <div className="grid grid-cols-2 gap-3 mt-3">
                {/* B2C / B2B toggle */}
                <div className="col-span-2">
                  <label className="field-label">ประเภทลูกค้า</label>
                  <div className="flex gap-2 mt-1">
                    {['B2C', 'B2B'].map(t => (
                      <button key={t} onClick={() => setEditing(e => ({ ...e, customer_type: t }))}
                        className="px-4 py-2 rounded-[var(--radius-sm)] text-sm font-semibold"
                        style={{
                          background: editing.customer_type === t ? 'var(--accent)' : 'var(--hover-bg)',
                          color: editing.customer_type === t ? '#fff' : 'var(--text-2)',
                        }}>{t}</button>
                    ))}
                  </div>
                </div>

                {editing.customer_type === 'B2C' ? (
                  <>
                    {/* B2C: เลขห้อง — แสดงเฉพาะตอน new job (edit mode อยู่ใน card แล้ว) */}
                    {!editing.id && (
                      <div className="col-span-2">
                        <label className="field-label">เลขห้อง</label>
                        {leads.length > 0 && (editing.lead_id || !editing.room_no) ? (
                          <select value={editing.lead_id ? String(editing.lead_id) : ''}
                            onChange={e => handleLeadSelect(e.target.value)}
                            className="field-input w-full mt-1"
                            disabled={!editing.project_id}>
                            <option value="">— เลือกห้อง —</option>
                            {leads.map(l => (
                              <option key={l.id} value={String(l.id)}>{l.room_no}</option>
                            ))}
                          </select>
                        ) : (
                          <input value={editing.room_no || ''}
                            onChange={e => handleRoomNoChange(e.target.value, editing.project_id || '', editing.id)}
                            className="field-input w-full mt-1" placeholder="เช่น 123 หรือ A123" />
                        )}
                        {roomNormalized && !roomDupWarning && (
                          <p className="text-xs mt-1" style={{ color: 'var(--accent)' }}>→ จะบันทึกเป็น <strong>{roomNormalized}</strong></p>
                        )}
                        {roomDupWarning && (
                          <p className="text-xs mt-1 font-semibold" style={{ color: 'var(--accent-red)' }}>⚠ {roomDupWarning}</p>
                        )}
                      </div>
                    )}

                    {/* B2C: combined info card (ชื่อ + โครงการ + เบอร์) */}
                    <div className="col-span-2 rounded-[11px] overflow-hidden"
                      style={{ border: '1px solid color-mix(in srgb, var(--accent) 20%, transparent)' }}>
                      {/* ชื่อลูกค้า */}
                      <div className="flex items-center gap-3 px-4 py-3"
                        style={{ background: 'color-mix(in srgb, var(--accent) 8%, transparent)' }}>
                        <div className="w-8 h-8 rounded-[8px] flex items-center justify-center text-white text-xs font-bold flex-shrink-0"
                          style={{ background: 'var(--accent)' }}>
                          {(editing.customer_name || '?')[0]}
                        </div>
                        <p className="text-sm font-semibold truncate" style={{ color: 'var(--text-1)' }}>
                          {editing.customer_name || '— เลือกห้องก่อน'}
                        </p>
                      </div>
                      {/* เลขห้อง + โครงการ */}
                      <div className="px-4 py-2 flex items-center gap-2"
                        style={{ borderTop: '1px solid color-mix(in srgb, var(--accent) 15%, transparent)', background: 'color-mix(in srgb, var(--accent) 4%, transparent)' }}>
                        <span className="text-xs font-semibold flex-shrink-0 rounded-[5px] px-2 py-0.5"
                          style={{ background: 'color-mix(in srgb, var(--accent) 15%, transparent)', color: 'var(--accent)' }}>
                          {editing.room_no || '—'}
                        </span>
                        {editing.id ? (
                          <p className="text-xs truncate" style={{ color: 'var(--text-2)' }}>
                            {projects.find(p => p.id === editing.project_id)?.name || '—'}
                          </p>
                        ) : (
                          <select value={editing.project_id || ''}
                            onChange={e => handleProjectSelect(e.target.value)}
                            className="text-xs flex-1 bg-transparent outline-none"
                            style={{ color: 'var(--text-2)', border: 'none' }}>
                            <option value="">— เลือกโครงการ —</option>
                            {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                          </select>
                        )}
                      </div>
                      {/* เบอร์โทร */}
                      <div className="px-4 py-2 flex items-center gap-2"
                        style={{ borderTop: '1px solid color-mix(in srgb, var(--accent) 15%, transparent)', background: 'color-mix(in srgb, var(--accent) 4%, transparent)' }}>
                        <Phone size={12} style={{ color: 'var(--text-3)', flexShrink: 0 }} />
                        <input value={editPhone} onChange={e => setEditPhone(e.target.value)}
                          className="flex-1 bg-transparent text-xs outline-none"
                          style={{ color: 'var(--text-1)' }} placeholder="0XX-XXX-XXXX" />
                      </div>
                    </div>
                  </>
                ) : (
                  <>
                    {/* B2B: เลขห้อง — แสดงเฉพาะตอน new job (edit mode อยู่ใน card แล้ว) */}
                    {!editing.id && (
                      <div className="col-span-2">
                        <label className="field-label">เลขห้อง / สถานที่</label>
                        <input value={editing.room_no || ''}
                          onChange={e => handleRoomNoChange(e.target.value, editing.project_id || '', editing.id)}
                          className="field-input w-full mt-1" placeholder="เช่น 123 หรือ A123" />
                        {roomNormalized && !roomDupWarning && (
                          <p className="text-xs mt-1" style={{ color: 'var(--accent)' }}>→ จะบันทึกเป็น <strong>{roomNormalized}</strong></p>
                        )}
                        {roomDupWarning && (
                          <p className="text-xs mt-1 font-semibold" style={{ color: 'var(--accent-red)' }}>⚠ {roomDupWarning}</p>
                        )}
                      </div>
                    )}

                    {/* B2B: combined card (ชื่อบริษัท + โครงการ + เบอร์) */}
                    <div className="col-span-2 rounded-[11px] overflow-hidden"
                      style={{ border: '1px solid color-mix(in srgb, var(--accent) 20%, transparent)' }}>
                      {/* ชื่อบริษัท */}
                      <div className="flex items-center gap-3 px-4 py-3"
                        style={{ background: 'color-mix(in srgb, var(--accent) 8%, transparent)' }}>
                        <div className="w-8 h-8 rounded-[8px] flex items-center justify-center text-white text-xs font-bold flex-shrink-0"
                          style={{ background: 'var(--accent)' }}>
                          {(editing.company_name || 'B')[0].toUpperCase()}
                        </div>
                        <input value={editing.company_name || ''} onChange={e => setEditing(e2 => ({ ...e2, company_name: e.target.value }))}
                          className="flex-1 bg-transparent text-sm font-semibold outline-none truncate"
                          style={{ color: 'var(--text-1)' }} placeholder="ชื่อบริษัท / ลูกค้า B2B..." />
                      </div>
                      {/* เลขห้อง + โครงการ */}
                      <div className="px-4 py-2 flex items-center gap-2"
                        style={{ borderTop: '1px solid color-mix(in srgb, var(--accent) 15%, transparent)', background: 'color-mix(in srgb, var(--accent) 4%, transparent)' }}>
                        <span className="text-xs font-semibold flex-shrink-0 rounded-[5px] px-2 py-0.5"
                          style={{ background: 'color-mix(in srgb, var(--accent) 15%, transparent)', color: 'var(--accent)' }}>
                          {editing.room_no || '—'}
                        </span>
                        {editing.id ? (
                          <p className="text-xs truncate" style={{ color: 'var(--text-2)' }}>
                            {projects.find(p => p.id === editing.project_id)?.name || '—'}
                          </p>
                        ) : (
                          <select value={editing.project_id || ''}
                            onChange={e => setEditing(e2 => ({ ...e2, project_id: e.target.value }))}
                            className="text-xs flex-1 bg-transparent outline-none"
                            style={{ color: 'var(--text-2)', border: 'none' }}>
                            <option value="">— เลือกโครงการ —</option>
                            {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                          </select>
                        )}
                      </div>
                      {/* เบอร์โทร */}
                      <div className="px-4 py-2 flex items-center gap-2"
                        style={{ borderTop: '1px solid color-mix(in srgb, var(--accent) 15%, transparent)', background: 'color-mix(in srgb, var(--accent) 4%, transparent)' }}>
                        <Phone size={12} style={{ color: 'var(--text-3)', flexShrink: 0 }} />
                        <input value={editPhone} onChange={e => setEditPhone(e.target.value)}
                          className="flex-1 bg-transparent text-xs outline-none"
                          style={{ color: 'var(--text-1)' }} placeholder="0XX-XXX-XXXX" />
                      </div>
                    </div>
                  </>
                )}
              </div>
            </section>

            {/* ── 2 · ข้อมูลงาน / PO-SO ── */}
            <section>
              <SectionDivider label="2 · ข้อมูลงาน / PO-SO" color="var(--accent)" />
              <div className="grid grid-cols-2 gap-3 mt-3">
                <div className="col-span-2">
                  <label className="field-label">PO No. (Origin)</label>
                  <input value={editing.po_no || ''} onChange={e => setEditing(e2 => ({ ...e2, po_no: e.target.value }))}
                    className="field-input w-full mt-1" placeholder="WAG-SONO25-000001" />
                </div>
                <div className="col-span-2">
                  <label className="field-label">SO No. (Wyde)</label>
                  <input value={editing.so_no || ''} onChange={e => setEditing(e2 => ({ ...e2, so_no: e.target.value }))}
                    className="field-input w-full mt-1" placeholder="SO-..." />
                </div>
                <div>
                  <label className="field-label">ประเภทงาน</label>
                  <select value={editing.work_type || ''} onChange={e => setEditing(e2 => ({ ...e2, work_type: e.target.value }))}
                    className="field-input w-full mt-1">
                    <option value="">— เลือก —</option>
                    {WORK_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                  </select>
                </div>
                <div>
                  <label className="field-label">Product</label>
                  <select value={editing.package_type || ''} onChange={e => setEditing(e2 => ({ ...e2, package_type: e.target.value }))}
                    className="field-input w-full mt-1">
                    <option value="">— เลือก —</option>
                    {PRODUCT_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                  </select>
                </div>
                <div>
                  <label className="field-label">วันที่รับ PO / วันที่รับยอด</label>
                  <div className="field-input mt-1" style={{ background: 'var(--hover-bg)', color: editing.order_date ? 'var(--text-1)' : 'var(--text-3)' }}>
                    {editing.order_date ? new Date(editing.order_date).toLocaleDateString('th-TH', { day: '2-digit', month: 'short', year: '2-digit' }) : '— auto จากงวดแรกที่รับ'}
                  </div>
                </div>
                <div>
                  <label className="field-label">วันเซ็นสัญญา</label>
                  <div className="field-input mt-1" style={{ background: 'var(--hover-bg)', color: editing.contract_date ? 'var(--text-1)' : 'var(--text-3)' }}>
                    {editing.contract_date ? new Date(editing.contract_date).toLocaleDateString('th-TH', { day: '2-digit', month: 'short', year: '2-digit' }) : '— auto จากยอดถึง 50%'}
                  </div>
                </div>
                <div>
                  <label className="field-label">Sales</label>
                  <select value={editing.sales_id || ''} onChange={e => setEditing(e2 => ({ ...e2, sales_id: e.target.value }))}
                    className="field-input w-full mt-1">
                    <option value="">— เลือก —</option>
                    {users.map(u => <option key={u.id} value={u.id}>{u.name}</option>)}
                  </select>
                </div>
              </div>
            </section>

            {/* ── 3 · สถานะ & ส่งมอบ ── */}
            <section>
              <SectionDivider label="3 · สถานะ & ส่งมอบ" color="var(--accent)" />
              <div className="mt-3 space-y-4">
                {/* กลุ่ม: งานของเรา */}
                <div>
                  <p className="text-xs font-semibold mb-2" style={{ color: 'var(--text-3)', letterSpacing: '.05em', textTransform: 'uppercase' }}>งานของเรา</p>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="field-label">สถานะการทำงาน</label>
                      {/* The list has no entry for "", so a job with no status yet used to
                          display the first option (จอง) while the state stayed empty —
                          saving without touching the dropdown then wrote an empty string.
                          An explicit option keeps what is shown and what is stored in step. */}
                      <select value={editing.working_status || ''} onChange={e => setEditing(e2 => ({ ...e2, working_status: e.target.value }))}
                        className="field-input w-full mt-1">
                        <option value="">— ยังไม่ระบุ —</option>
                        {WORKING_STATUSES.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
                      </select>
                    </div>
                    <div>
                      <label className="field-label">วันเริ่มงาน</label>
                      <DateInput value={(editing as any).work_start_date || ''} onChange={e => setEditing(e2 => ({ ...e2, work_start_date: e.target.value }))}
                        className="field-input w-full mt-1" />
                    </div>
                    <div>
                      <label className="field-label">วันคาดส่งมอบ</label>
                      <DateInput value={editing.expected_finish_date || ''} onChange={e => setEditing(e2 => ({ ...e2, expected_finish_date: e.target.value }))}
                        className="field-input w-full mt-1" />
                    </div>
                    <div>
                      <label className="field-label">วันส่งมอบจริง</label>
                      <DateInput value={editing.actual_deliver_date || ''} onChange={e => setEditing(e2 => ({ ...e2, actual_deliver_date: e.target.value }))}
                        className="field-input w-full mt-1" />
                    </div>
                    <div className="col-span-2">
                      <label className="field-label">หมายเหตุ</label>
                      <input value={editing.notes || ''} onChange={e => setEditing(e2 => ({ ...e2, notes: e.target.value }))}
                        className="field-input w-full mt-1" placeholder="..." />
                    </div>
                  </div>
                </div>
                {/* กลุ่ม: Origin / โครงการ */}
                <div>
                  <p className="text-xs font-semibold mb-2" style={{ color: 'var(--text-3)', letterSpacing: '.05em', textTransform: 'uppercase' }}>Origin / โครงการ</p>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="field-label">สถานะห้อง</label>
                      <input value={editing.room_status || ''} onChange={e => setEditing(e2 => ({ ...e2, room_status: e.target.value }))}
                        className="field-input w-full mt-1" placeholder="เช่น รอตรวจรับ / โอนแล้ว" />
                    </div>
                    <div>
                      <label className="field-label">เดือน Transfer ห้อง</label>
                      <input type="month" value={(editing as any).plan_transfer_month || ''} onChange={e => setEditing(e2 => ({ ...e2, plan_transfer_month: e.target.value }))}
                        className="field-input w-full mt-1" />
                    </div>
                  </div>
                </div>
              </div>
            </section>

            {/* ── 4 · Revenue & Cost ── */}
            <section>
              <SectionDivider label="4 · Revenue & Cost" color="var(--accent)" />
              <div className="grid grid-cols-2 gap-3 mt-3">
                <div>
                  <label className="field-label">Revenue (Inc.VAT) ฿</label>
                  <input type="number" value={editing.revenue_inc_vat || ''} onChange={e => handleRevenueChange(+e.target.value)}
                    className="field-input w-full mt-1" placeholder="0" />
                </div>
                <div>
                  <label className="field-label">Revenue (Ex.VAT) ฿ <span style={{ color: 'var(--text-3)', fontWeight: 400 }}>auto ÷ 1.07</span></label>
                  <div className="field-input mt-1 flex items-center gap-2" style={{ background: 'var(--hover-bg)' }}>
                    <span style={{ color: 'var(--text-1)', fontWeight: 600 }}>
                      {editing.revenue_ex_vat ? f(editing.revenue_ex_vat) : '—'}
                    </span>
                  </div>
                </div>
                <div>
                  <label className="field-label">Voucher / ส่วนลด ฿</label>
                  <input type="number" value={editing.voucher || ''} onChange={e => setEditing(e2 => ({ ...e2, voucher: +e.target.value }))}
                    className="field-input w-full mt-1" placeholder="0" />
                </div>
                <div>
                  <label className="field-label">Cost ฿</label>
                  <input type="number" value={editing.cost || ''} onChange={e => setEditing(e2 => ({ ...e2, cost: +e.target.value }))}
                    className="field-input w-full mt-1" placeholder="0" />
                </div>
                <div className="rounded-[11px] p-3 flex flex-col justify-center" style={{ background: 'var(--hover-bg)' }}>
                  <div className="flex items-center gap-1 mb-1">
                    <Calculator size={12} style={{ color: 'var(--text-3)' }} />
                    <span className="text-xs" style={{ color: 'var(--text-3)' }}>Profit / GP%</span>
                  </div>
                  <p className="font-bold text-sm" style={{ color: profit >= 0 ? 'var(--accent-green)' : 'var(--accent-red)' }}>
                    {f(profit)} <span style={{ color: 'var(--text-3)', fontWeight: 400 }}>({gpPct}%)</span>
                  </p>
                </div>
              </div>
            </section>

            {/* ── 5 · Commission ── */}
            <section>
              <SectionDivider label="5 · Commission" color="var(--accent)" />
              <div className="grid grid-cols-3 gap-3 mt-3">
                <div>
                  <label className="field-label">Rate (อัตโนมัติจาก Revenue)</label>
                  <div className="field-input mt-1 flex items-center gap-2" style={{ background: 'var(--hover-bg)' }}>
                    <span style={{ color: 'var(--text-1)', fontWeight: 600 }}>{pct(editing.commission_rate)}</span>
                    <span className="text-xs" style={{ color: 'var(--text-3)' }}>
                      {tiers.find(t => t.rate === editing.commission_rate)?.tier_name || ''}
                    </span>
                  </div>
                </div>
                <div>
                  <label className="field-label">Commission ฿</label>
                  <input type="number" value={editing.commission_amount || ''} onChange={e => setEditing(e2 => ({ ...e2, commission_amount: +e.target.value }))}
                    className="field-input w-full mt-1" placeholder="0" />
                </div>
                <div>
                  <label className="field-label">เดือนเบิก Commission</label>
                  <input type="month" value={editing.commission_month?.slice(0, 7) || ''} onChange={e => setEditing(e2 => ({ ...e2, commission_month: e.target.value + '-01' }))}
                    className="field-input w-full mt-1" />
                </div>
                <div className="col-span-3">
                  <label className="field-label">สถานะ Commission</label>
                  <div className="flex gap-2 mt-1">
                    {COMMISSION_STATUSES.map(({ value: s, label }) => (
                      <button key={s} onClick={() => setEditing(e => ({ ...e, commission_status: s }))}
                        className="px-3 py-1.5 rounded-[var(--radius-sm)] text-xs font-semibold"
                        style={{
                          background: editing.commission_status === s ? 'var(--accent)' : 'var(--hover-bg)',
                          color: editing.commission_status === s ? '#fff' : 'var(--text-2)',
                        }}>
                        {label}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            </section>

            {/* Payment alert */}
            {editing.id && paymentMap[editing.id] && (
              <div className="rounded-[11px] p-3 flex items-center justify-between"
                style={{ background: 'color-mix(in srgb, var(--accent-orange) 8%, transparent)', border: '1px solid color-mix(in srgb, var(--accent-orange) 25%, transparent)' }}>
                <div>
                  <p className="text-xs font-semibold" style={{ color: 'var(--accent-orange)' }}>มีงวดค้างชำระ</p>
                  <p className="text-label" style={{ color: 'var(--text-3)' }}>
                    {paymentMap[editing.id]!.installment_name} · {f(paymentMap[editing.id]!.amount)}
                  </p>
                </div>
                <Link href="/dashboard/payments"
                  className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-[8px] font-semibold"
                  style={{ background: 'color-mix(in srgb, var(--accent-red) 15%, transparent)', color: 'var(--accent-red)' }}>
                  <Receipt size={12} /> ดูงวด
                </Link>
              </div>
            )}

            {/* Actions */}
            <div className="flex items-center justify-end gap-3 pt-2">
              <button onClick={() => setOpen(false)} className="px-4 py-2 rounded-[8px] text-sm"
                style={{ background: 'var(--hover-bg)', color: 'var(--text-2)' }}>ยกเลิก</button>
              <button onClick={save} disabled={saving || !!roomDupWarning}
                className="px-6 py-2 rounded-[8px] text-sm font-semibold text-white"
                style={{ background: 'var(--accent)', opacity: (saving || roomDupWarning) ? 0.5 : 1 }}>
                {saving ? 'กำลังบันทึก...' : 'บันทึก'}
              </button>
            </div>
          </div>
          </div>
        </>
      )}

      {showAddModal && (
        <AddJobModal
          projects={projects}
          users={users}
          myId={myId}
          onClose={() => setShowAddModal(false)}
          onSaved={() => { setShowAddModal(false); load() }}
        />
      )}
    </div>
  )
}

