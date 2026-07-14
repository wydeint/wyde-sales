'use client'

import { useEffect, useState, useCallback, useMemo } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Plus, Search, X, Calculator, Briefcase, Receipt, ChevronRight, Phone, FileDown } from 'lucide-react'
import { PageSpinner, PageError } from '@/components/ui/StateUI'
import Money from '@/components/ui/Money'
import Link from 'next/link'
import SearchableSelect from '@/components/ui/SearchableSelect'

// ─────────────────────────────────────────
// Constants
// ─────────────────────────────────────────
const PAGE_SIZE = 50
const WORK_TYPES = ['N-RPT/Event', 'N-RPT/EQ', 'N-RPT', 'RPT', 'อื่นๆ']
const PACKAGE_TYPES = [
  'Starter set (S)', 'Combo (S)', 'Investor Pro (M)', 'Medium (M)',
  'Premium (L)', 'Fully design (L)', 'Design & Turnkey',
  'Built-in', 'Curtain', 'Wallcovering', 'Loose furniture', 'อื่นๆ',
]
const WORKING_STATUSES = ['รับงาน', 'กำลังดำเนินการ', 'รอเอกสาร', 'รอส่งมอบ', 'ส่งมอบแล้ว', 'ยกเลิก']
const COMMISSION_STATUSES = ['pending', 'approved', 'paid']
const COMMISSION_STATUS_LABEL: Record<string, string> = { pending: 'รอ', approved: 'อนุมัติ', paid: 'จ่ายแล้ว' }

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

const STATUS_CFG: Record<string, { label: string; color: string; bg: string; dot: string; border: string }> = {
  'ดำเนินการ':       { label: 'ดำเนินการ',     color: 'var(--accent-orange)',  bg: 'color-mix(in srgb, var(--accent-orange) 12%, transparent)',  dot: 'var(--accent-orange)',  border: 'color-mix(in srgb, var(--accent-orange) 35%, transparent)' },
  'กำลังดำเนินการ': { label: 'กำลังดำเนินการ', color: 'var(--accent-orange)',  bg: 'color-mix(in srgb, var(--accent-orange) 12%, transparent)',  dot: 'var(--accent-orange)',  border: 'color-mix(in srgb, var(--accent-orange) 35%, transparent)' },
  'รับงาน':          { label: 'รับงาน',          color: 'var(--accent-orange)',  bg: 'color-mix(in srgb, var(--accent-orange) 12%, transparent)',  dot: 'var(--accent-orange)',  border: 'color-mix(in srgb, var(--accent-orange) 35%, transparent)' },
  'รอเอกสาร':       { label: 'รอเอกสาร',        color: 'var(--accent-blue)',    bg: 'color-mix(in srgb, var(--accent-blue)   12%, transparent)',  dot: 'var(--accent-blue)',    border: 'color-mix(in srgb, var(--accent-blue)   35%, transparent)' },
  'รอส่งมอบ':       { label: 'รอส่งมอบ',         color: 'var(--accent-purple)',  bg: 'color-mix(in srgb, var(--accent-purple) 12%, transparent)',  dot: 'var(--accent-purple)',  border: 'color-mix(in srgb, var(--accent-purple) 35%, transparent)' },
  'ส่งมอบแล้ว':     { label: 'ส่งมอบแล้ว',       color: 'var(--accent-green)',   bg: 'color-mix(in srgb, var(--accent-green)  12%, transparent)',  dot: 'var(--accent-green)',   border: 'color-mix(in srgb, var(--accent-green)  35%, transparent)' },
  'ยกเลิก':         { label: 'ยกเลิก',           color: 'var(--accent-red)',     bg: 'color-mix(in srgb, var(--accent-red)    12%, transparent)',  dot: 'var(--accent-red)',     border: 'color-mix(in srgb, var(--accent-red)    35%, transparent)' },
}
const DEFAULT_STATUS_CFG = STATUS_CFG['ดำเนินการ']

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

function JobCard({ job, paymentMap, onClick, seqNo }: {
  job: Job
  paymentMap: Record<string, PaymentSummary | null>
  onClick: () => void
  seqNo?: number
}) {
  const displayName = (job.condo_leads as any)?.customer_name || job.customer_name || ''
  const projectName = (job.projects as any)?.name || '—'
  const salesName = (job.sales as any)?.name || ''
  const phone = (job.condo_leads as any)?.phone || null
  const cfg = STATUS_CFG[job.working_status] || DEFAULT_STATUS_CFG
  const payment = job.customer_id ? paymentMap[job.customer_id] : null
  const today = new Date().toISOString().slice(0, 10)
  const isOverdue = !!job.expected_finish_date && job.expected_finish_date < today
    && job.working_status !== 'ส่งมอบแล้ว' && job.working_status !== 'ยกเลิก'

  return (
    <button
      onClick={onClick}
      className="w-full text-left rounded-[14px] p-3 flex flex-col gap-2 transition-all group"
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
              <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-[4px] flex-shrink-0"
                style={{ background: 'rgba(99,102,241,0.15)', color: '#818cf8' }}>
                งานที่ {seqNo}
              </span>
            )}
          </div>
          <p className="text-xs truncate mt-0.5" style={{ color: 'var(--text-3)' }}>
            {displayName || '—'} · {projectName}
          </p>
        </div>
        <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-[4px] flex-shrink-0 mt-0.5"
          style={{ background: cfg.bg, color: cfg.color, border: `1px solid ${cfg.border}` }}>
          {cfg.label}
        </span>
      </div>
      {/* work type + phone */}
      <div className="flex items-center gap-1.5 flex-wrap">
        {job.work_type && (
          <span className="text-[10px] px-1.5 py-0.5 rounded-[4px] font-semibold"
            style={{ background: 'var(--hover-bg)', color: 'var(--text-2)' }}>
            {job.work_type}
          </span>
        )}
        {job.package_type && (
          <span className="text-[10px] px-1.5 py-0.5 rounded-[4px] font-semibold"
            style={{ background: 'var(--hover-bg)', color: 'var(--text-3)' }}>
            {job.package_type}
          </span>
        )}
        {phone && (
          <span className="text-[10px] flex items-center gap-1" style={{ color: 'var(--text-3)' }}>
            <Phone size={9} /> {phone}
          </span>
        )}
      </div>
      {/* revenue + badges + chevron */}
      <div className="flex items-center justify-between gap-2">
        <div>
          {job.revenue_inc_vat ? (
            <p className="text-xs font-bold" style={{ color: 'var(--accent-green)' }}>฿<Money value={job.revenue_inc_vat} /></p>
          ) : (
            <p className="text-[10px]" style={{ color: 'var(--text-3)' }}>ยังไม่มีรายได้</p>
          )}
          {salesName && <p className="text-[10px]" style={{ color: 'var(--text-3)' }}>{salesName}</p>}
        </div>
        <div className="flex items-center gap-1.5">
          {payment && (
            <span className="text-[10px] px-1.5 py-0.5 rounded-[4px] font-semibold" style={{ background: 'color-mix(in srgb, var(--accent-red) 12%, transparent)', color: 'var(--accent-red)' }}>
              ค้าง {payment.installment_name}
            </span>
          )}
          {isOverdue && (
            <span className="text-[10px] px-1.5 py-0.5 rounded-[4px] font-semibold" style={{ background: 'color-mix(in srgb, var(--accent-red) 15%, transparent)', color: 'var(--accent-red)' }}>
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

const emptyJob = (): Partial<Job> => ({
  customer_type: 'B2C',
  working_status: 'รับงาน',
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
// Main Page
// ─────────────────────────────────────────
export default function JobsPage() {
  const supabase = createClient()
  const [jobs, setJobs] = useState<Job[]>([])
  const [projects, setProjects] = useState<{ id: string; name: string }[]>([])
  const [users, setUsers] = useState<{ id: string; name: string }[]>([])
  const [tiers, setTiers] = useState<CommissionTier[]>([])
  const [leads, setLeads] = useState<Lead[]>([])
  const [paymentMap, setPaymentMap] = useState<Record<string, PaymentSummary | null>>({})
  const [myRole, setMyRole] = useState('')
  const [myId, setMyId] = useState('')
  const [loading, setLoading] = useState(true)

  // Quick filter
  const [filterNoSO, setFilterNoSO] = useState(false)

  // Filters
  const [search, setSearch] = useState('')
  const [filterProject, setFilterProject] = useState('')
  const [filterStatus, setFilterStatus] = useState('')
  const [filterSales, setFilterSales] = useState('')
  const [filterWorkType, setFilterWorkType] = useState('')
  const [filterCustomerType, setFilterCustomerType] = useState('')

  // Modal
  const [open, setOpen] = useState(false)
  const [editing, setEditing] = useState<Partial<Job>>(emptyJob())
  const [saving, setSaving] = useState(false)
  const [nextId, setNextId] = useState('JOB-001')
  const [fetchError, setFetchError] = useState('')
  const [page, setPage] = useState(1)
  const [roomNormalized, setRoomNormalized] = useState('')
  const [roomDupWarning, setRoomDupWarning] = useState<string | null>(null)

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
    ] = await Promise.all([
      supabase.from('jobs').select('*, condo_leads(customer_name,room_no,phone), projects(name), sales:users!jobs_sales_id_fkey(name)').order('room_no').range(0, 999),
      supabase.from('projects').select('id, name').eq('active', true).order('name'),
      supabase.from('users').select('id, name').eq('active', true).eq('dept', 'Sales Executive').order('name'),
      supabase.from('commission_settings').select('*').eq('active', true).order('sort_order'),
      supabase.from('payments').select('customer_id, installment_name, status, amount, due_date').neq('status', 'paid').order('due_date'),
    ])
    if (e1) { setFetchError(e1.message); setLoading(false); return }
    setJobs((jobsData as Job[]) || [])
    setProjects(projData || [])
    setUsers(usrData || [])
    setTiers(tierData || [])

    // Build payment map by customer_id (first pending/overdue installment per customer)
    const map: Record<string, PaymentSummary | null> = {}
    for (const p of (paymentsData || []) as any[]) {
      if (!map[p.customer_id]) {
        map[p.customer_id] = {
          installment_name: p.installment_name,
          status: p.status,
          amount: p.amount,
          due_date: p.due_date,
        }
      }
    }
    setPaymentMap(map)

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
    setSaving(false)
    setOpen(false)
    load()
  }

  // ─── Filter ───
  const filtered = jobs.filter(j => {
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
    const matchNoSO = !filterNoSO || !j.so_no?.trim()
    return matchSearch && matchProj && matchStatus && matchSales && matchWorkType && matchCustomerType && matchNoSO
  })

  const noSOCount = jobs.filter(j => !j.so_no?.trim() && j.working_status !== 'ยกเลิก').length
  const pagedJobs = filtered.slice(0, page * PAGE_SIZE)
  const hasMore = pagedJobs.length < filtered.length

  useEffect(() => { setPage(1) }, [search, filterProject, filterStatus, filterSales, filterWorkType, filterCustomerType, filterNoSO])

  function exportCSV() {
    const headers = [
      'ลูกค้า', 'เบอร์โทร', 'ประเภทลูกค้า', 'โครงการ', 'ห้อง', 'Job ID',
      'ประเภทงาน', 'แพ็กเกจ', 'PO', 'SO',
      'วันสั่งงาน', 'วันเริ่มงาน', 'วันกำหนดส่ง', 'วันส่งมอบ (จริง)',
      'Revenue (Ex.VAT)', 'Revenue (Inc.VAT)', 'Voucher', 'Cost', 'GP%',
      'Commission Rate%', 'Commission', 'สถานะ Commission',
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
      return [
        name, phone, j.customer_type || '', project, j.room_no || '', j.id,
        j.work_type || '', j.package_type || '', j.po_no || '', j.so_no || '',
        fmt(j.order_date), fmt((j as any).work_start_date), fmt(j.expected_finish_date), fmt(j.actual_deliver_date),
        j.revenue_ex_vat || 0, j.revenue_inc_vat || 0, j.voucher || 0, j.cost || 0, gp,
        j.commission_rate ? (j.commission_rate * 100).toFixed(2) : '', j.commission_amount || 0,
        commStatusLabel[j.commission_status] || j.commission_status || '',
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
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-page-title" style={{ color: 'var(--text-1)' }}>Wyde Clients</h1>
          <p className="text-xs mt-0.5" style={{ color: 'var(--text-3)' }}>บันทึก PO/SO ต่องาน · ติดตามงวดการเก็บเงิน</p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={exportCSV}
            className="flex items-center gap-1.5 px-3 py-2 rounded-[11px] text-xs font-semibold"
            style={{ background: 'var(--glass-bg)', border: '1px solid var(--glass-border)', color: 'var(--text-2)' }}>
            <FileDown size={13} /> Export CSV
          </button>
          {canWrite && (
            <button onClick={openAdd}
              className="flex items-center gap-2 px-4 py-2 rounded-[var(--radius-pill)] text-sm font-semibold text-white"
              style={{ background: 'var(--accent)' }}>
              <Plus size={15} /> เพิ่มงาน
            </button>
          )}
        </div>
      </div>

      {/* Summary KPI */}
      {(() => {
        const profit = totalRevenue - totalCost
        const gpPctAvg = totalRevenue > 0 ? (profit / totalRevenue * 100) : null
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
              <p className="text-[11px] mt-0.5" style={{ color: 'var(--text-3)' }}>Cost {f(totalCost)}</p>
            </div>
            <div className="ds-card p-4">
              <p className="text-xs mb-1" style={{ color: 'var(--text-3)' }}>GP% เฉลี่ย</p>
              <p className="text-lg font-bold" style={{ color: gpColor }}>
                {gpPctAvg !== null ? gpPctAvg.toFixed(1) + '%' : '—'}
              </p>
              <p className="text-[11px] mt-0.5" style={{ color: 'var(--text-3)' }}>กำไร {f(profit)}</p>
            </div>
            <div className="ds-card p-4">
              <p className="text-xs mb-1" style={{ color: 'var(--text-3)' }}>เกินกำหนด</p>
              <p className="text-lg font-bold" style={{ color: overdueCount > 0 ? 'var(--accent-red)' : 'var(--accent-green)' }}>
                {overdueCount} งาน
              </p>
              <p className="text-[11px] mt-0.5" style={{ color: 'var(--text-3)' }}>ยังไม่ส่งมอบ</p>
            </div>
          </div>
        )
      })()}

      {/* Quick filter chips */}
      <div className="flex gap-2 flex-wrap">
        <button
          onClick={() => setFilterNoSO(v => !v)}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium transition-all"
          style={{
            background: filterNoSO ? 'var(--accent)' : 'var(--card-bg)',
            color: filterNoSO ? '#fff' : 'var(--text-2)',
            border: `1px solid ${filterNoSO ? 'var(--accent)' : 'var(--card-border)'}`,
          }}
        >
          ไม่มี SO
          {noSOCount > 0 && (
            <span className="px-1.5 py-0.5 rounded-full text-xs font-bold"
              style={{ background: filterNoSO ? 'rgba(255,255,255,0.25)' : 'color-mix(in srgb, var(--accent-red) 15%, transparent)', color: filterNoSO ? '#fff' : 'var(--accent-red)' }}>
              {noSOCount}
            </span>
          )}
        </button>
      </div>

      {/* Filters */}
      <div className="ds-card p-4 flex flex-wrap gap-3">
        <div className="flex items-center gap-2 flex-1 min-w-48 rounded-[8px] px-3 py-2" style={{ background: 'var(--hover-bg)' }}>
          <Search size={14} style={{ color: 'var(--text-3)' }} />
          <input value={search} onChange={e => setSearch(e.target.value)}
            placeholder="ค้นหา PO / SO / ลูกค้า..." className="bg-transparent text-sm flex-1 outline-none"
            style={{ color: 'var(--text-1)' }} />
        </div>
        <SearchableSelect
          value={filterProject}
          onChange={v => setFilterProject(v)}
          options={[{ value: '', label: 'ทุกโครงการ' }, ...projects.map(p => ({ value: p.id, label: p.name }))]}
          placeholder="ทุกโครงการ"
        />
        <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)}
          className="field-input" style={{ width: 'auto' }}>
          <option value="">ทุกสถานะ</option>
          {WORKING_STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
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
      </div>

      {/* ─── Card Grid ─── */}
      {filtered.length === 0 ? (
        <div className="ds-card p-12 text-center text-sm" style={{ color: 'var(--text-3)' }}>ยังไม่มีข้อมูล</div>
      ) : (
        <>
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4 gap-3">
            {(() => { const seqMap = buildSequenceMap(filtered); return pagedJobs.map(j => (
              <JobCard key={j.id} job={j} paymentMap={paymentMap} onClick={() => openEdit(j)} seqNo={seqMap[j.id]} />
            ))})()}
          </div>
          {hasMore && (
            <div className="flex justify-center pt-2">
              <button onClick={() => setPage(p => p + 1)}
                className="px-6 py-2 rounded-[10px] text-sm font-medium"
                style={{ background: 'var(--hover-bg)', color: 'var(--text-2)', border: '1px solid var(--divider)' }}>
                โหลดเพิ่ม ({filtered.length - pagedJobs.length} งานที่เหลือ)
              </button>
            </div>
          )}
        </>
      )}
      <p className="text-xs" style={{ color: 'var(--text-3)' }}>แสดง {pagedJobs.length} / {filtered.length} งาน</p>

      {/* ─── Detail Drawer ─── */}
      {open && (
        <>
          <div className="fixed inset-0 z-40 bg-black/60 backdrop-blur-sm" onClick={() => setOpen(false)} />
          <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center pointer-events-none px-4 pb-4 pt-14 lg:pt-4">
          <div className="w-full max-w-3xl max-h-[90vh] overflow-y-auto rounded-[20px] p-6 space-y-5 pointer-events-auto"
            style={{ background: 'var(--panel-bg)', border: '1px solid var(--card-border)' }}>

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

            {/* ── Section: ลูกค้า & ห้อง ── */}
            <section>
              <p className="text-label-upper mb-3" style={{ color: 'var(--accent)' }}>ลูกค้า & ห้อง</p>
              <div className="grid grid-cols-2 gap-3">
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
                    {/* Step 1: โครงการ */}
                    <div>
                      <label className="field-label">โครงการ</label>
                      {editing.id ? (
                        <div className="field-input mt-1" style={{ background: 'var(--hover-bg)', color: 'var(--text-1)' }}>
                          {projects.find(p => p.id === editing.project_id)?.name || editing.project_id || '—'}
                        </div>
                      ) : (
                        <select value={editing.project_id || ''}
                          onChange={e => handleProjectSelect(e.target.value)}
                          className="field-input w-full mt-1">
                          <option value="">— เลือกโครงการ —</option>
                          {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                        </select>
                      )}
                    </div>

                    {/* Step 2: เลขห้อง (from condo_leads or direct) */}
                    <div>
                      <label className="field-label">เลขห้อง</label>
                      {editing.id ? (
                        <div className="field-input mt-1" style={{ background: 'var(--hover-bg)', color: 'var(--text-1)' }}>
                          {editing.room_no || '—'}
                        </div>
                      ) : leads.length > 0 && (editing.lead_id || !editing.room_no) ? (
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
                        <p className="text-xs mt-1 font-semibold" style={{ color: '#f87171' }}>⚠ {roomDupWarning}</p>
                      )}
                    </div>

                    {/* Auto-filled customer info */}
                    {editing.customer_name && (
                      <div className="col-span-2 rounded-[11px] px-4 py-3 flex items-center gap-3"
                        style={{ background: 'rgba(99,102,241,0.08)', border: '1px solid rgba(99,102,241,0.2)' }}>
                        <div className="w-8 h-8 rounded-[8px] flex items-center justify-center text-white text-xs font-bold flex-shrink-0"
                          style={{ background: 'var(--accent)' }}>
                          {editing.customer_name[0]}
                        </div>
                        <div>
                          <p className="text-sm font-semibold" style={{ color: 'var(--text-1)' }}>{editing.customer_name}</p>
                          <p className="text-xs" style={{ color: 'var(--text-3)' }}>
                            {leads.find(l => l.id === editing.lead_id)?.phone || 'ไม่มีเบอร์'}
                          </p>
                        </div>
                      </div>
                    )}
                  </>
                ) : (
                  <>
                    {/* B2B: manual entry */}
                    <div className="col-span-2">
                      <label className="field-label">ชื่อบริษัท / ลูกค้า B2B</label>
                      <input value={editing.company_name || ''} onChange={e => setEditing(e2 => ({ ...e2, company_name: e.target.value }))}
                        className="field-input w-full mt-1" placeholder="บริษัท..." />
                    </div>
                    <div>
                      <label className="field-label">โครงการ</label>
                      {editing.id ? (
                        <div className="field-input mt-1" style={{ background: 'var(--hover-bg)', color: 'var(--text-1)' }}>
                          {projects.find(p => p.id === editing.project_id)?.name || editing.project_id || '—'}
                        </div>
                      ) : (
                        <select value={editing.project_id || ''}
                          onChange={e => setEditing(e2 => ({ ...e2, project_id: e.target.value }))}
                          className="field-input w-full mt-1">
                          <option value="">— เลือกโครงการ —</option>
                          {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                        </select>
                      )}
                    </div>
                    <div>
                      <label className="field-label">เลขห้อง / สถานที่</label>
                      {editing.id ? (
                        <div className="field-input mt-1" style={{ background: 'var(--hover-bg)', color: 'var(--text-1)' }}>
                          {editing.room_no || '—'}
                        </div>
                      ) : (
                        <input value={editing.room_no || ''}
                          onChange={e => handleRoomNoChange(e.target.value, editing.project_id || '', editing.id)}
                          className="field-input w-full mt-1" placeholder="เช่น 123 หรือ A123" />
                      )}
                      {roomNormalized && !roomDupWarning && (
                        <p className="text-xs mt-1" style={{ color: 'var(--accent)' }}>→ จะบันทึกเป็น <strong>{roomNormalized}</strong></p>
                      )}
                      {roomDupWarning && (
                        <p className="text-xs mt-1 font-semibold" style={{ color: '#f87171' }}>⚠ {roomDupWarning}</p>
                      )}
                    </div>
                  </>
                )}
              </div>
            </section>

            {/* ── Section: Order ── */}
            <section>
              <p className="text-label-upper mb-3" style={{ color: 'var(--accent)' }}>ข้อมูลงาน / PO-SO</p>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="field-label">PO No. (Origin)</label>
                  <input value={editing.po_no || ''} onChange={e => setEditing(e2 => ({ ...e2, po_no: e.target.value }))}
                    className="field-input w-full mt-1" placeholder="WAG-SONO25-000001" />
                </div>
                <div>
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
                  <label className="field-label">Package</label>
                  <select value={editing.package_type || ''} onChange={e => setEditing(e2 => ({ ...e2, package_type: e.target.value }))}
                    className="field-input w-full mt-1">
                    <option value="">— เลือก —</option>
                    {PACKAGE_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
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

            {/* ── Section: Revenue & Cost ── */}
            <section>
              <p className="text-label-upper mb-3" style={{ color: 'var(--accent-green)' }}>Revenue & Cost</p>
              <div className="grid grid-cols-2 gap-3">
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
                {/* Profit display */}
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

            {/* ── Section: Commission ── */}
            <section>
              <p className="text-label-upper mb-3" style={{ color: 'var(--accent-orange)' }}>Commission</p>
              <div className="grid grid-cols-3 gap-3">
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
                    {COMMISSION_STATUSES.map(s => (
                      <button key={s} onClick={() => setEditing(e => ({ ...e, commission_status: s }))}
                        className="px-3 py-1.5 rounded-[var(--radius-sm)] text-xs font-semibold"
                        style={{
                          background: editing.commission_status === s ? 'var(--accent)' : 'var(--hover-bg)',
                          color: editing.commission_status === s ? '#fff' : 'var(--text-2)',
                        }}>
                        {COMMISSION_STATUS_LABEL[s]}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            </section>

            {/* ── Section: Status & Delivery ── */}
            <section>
              <p className="text-label-upper mb-3" style={{ color: 'var(--text-3)' }}>สถานะ & ส่งมอบ</p>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="field-label">สถานะการทำงาน</label>
                  <select value={editing.working_status || ''} onChange={e => setEditing(e2 => ({ ...e2, working_status: e.target.value }))}
                    className="field-input w-full mt-1">
                    {WORKING_STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
                  </select>
                </div>
                <div>
                  <label className="field-label">สถานะห้อง</label>
                  <input value={editing.room_status || ''} onChange={e => setEditing(e2 => ({ ...e2, room_status: e.target.value }))}
                    className="field-input w-full mt-1" placeholder="เช่น ดำเนินการ / รอตรวจรับ" />
                </div>
                <div>
                  <label className="field-label">วันเริ่มงานจริง</label>
                  <input type="date" value={(editing as any).work_start_date || ''} onChange={e => setEditing(e2 => ({ ...e2, work_start_date: e.target.value }))}
                    className="field-input w-full mt-1" />
                </div>
                <div>
                  <label className="field-label">เดือน Transfer ห้อง (Origin)</label>
                  <input type="month" value={(editing as any).plan_transfer_month || ''} onChange={e => setEditing(e2 => ({ ...e2, plan_transfer_month: e.target.value }))}
                    className="field-input w-full mt-1" />
                </div>
                <div>
                  <label className="field-label">วันที่คาดส่งมอบ</label>
                  <input type="date" value={editing.expected_finish_date || ''} onChange={e => setEditing(e2 => ({ ...e2, expected_finish_date: e.target.value }))}
                    className="field-input w-full mt-1" />
                </div>
                <div>
                  <label className="field-label">วันที่ส่งมอบจริง</label>
                  <input type="date" value={editing.actual_deliver_date || ''} onChange={e => setEditing(e2 => ({ ...e2, actual_deliver_date: e.target.value }))}
                    className="field-input w-full mt-1" />
                </div>
                <div>
                  <label className="field-label">QC</label>
                  <select value={editing.qc_id || ''} onChange={e => setEditing(e2 => ({ ...e2, qc_id: e.target.value }))}
                    className="field-input w-full mt-1">
                    <option value="">— เลือก QC —</option>
                    {users.map(u => <option key={u.id} value={u.id}>{u.name}</option>)}
                  </select>
                </div>
                <div>
                  <label className="field-label">หมายเหตุ</label>
                  <input value={editing.notes || ''} onChange={e => setEditing(e2 => ({ ...e2, notes: e.target.value }))}
                    className="field-input w-full mt-1" placeholder="..." />
                </div>
              </div>
            </section>

            {/* Payment alert */}
            {editing.customer_id && paymentMap[editing.customer_id] && (
              <div className="rounded-[11px] p-3 flex items-center justify-between"
                style={{ background: 'color-mix(in srgb, var(--accent-red) 8%, transparent)', border: '1px solid color-mix(in srgb, var(--accent-red) 25%, transparent)' }}>
                <div>
                  <p className="text-xs font-semibold" style={{ color: 'var(--accent-red)' }}>มีงวดค้างชำระ</p>
                  <p className="text-[11px]" style={{ color: 'var(--text-3)' }}>
                    {paymentMap[editing.customer_id]!.installment_name} · {f(paymentMap[editing.customer_id]!.amount)}
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
              <button onClick={() => setOpen(false)} className="px-4 py-2 rounded-[var(--radius-pill)] text-sm"
                style={{ background: 'var(--hover-bg)', color: 'var(--text-2)' }}>ยกเลิก</button>
              <button onClick={save} disabled={saving || !!roomDupWarning}
                className="px-6 py-2 rounded-[var(--radius-pill)] text-sm font-semibold text-white"
                style={{ background: 'var(--accent)', opacity: (saving || roomDupWarning) ? 0.5 : 1 }}>
                {saving ? 'กำลังบันทึก...' : 'บันทึก'}
              </button>
            </div>
          </div>
          </div>
        </>
      )}
    </div>
  )
}
