'use client'

import { useEffect, useState, useCallback, useMemo } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Plus, Wallet, Pencil, AlertCircle, TrendingUp, TrendingDown, DollarSign, Trash2, ChevronLeft, ChevronRight, Package, TableProperties, Save, RotateCcw } from 'lucide-react'
import Modal from '@/components/ui/Modal'
import { Input, Select } from '@/components/ui/Input'
import { PageSpinner, PageError } from '@/components/ui/StateUI'

// ── Types ──────────────────────────────────────────────────
interface Payment {
  id: string
  job_id: string
  installment_no: number
  installment_name: string
  due_date: string
  amount: number
  paid_date: string
  paid_amount: number
  status: string
  notes: string
  jobs?: { customer_name: string; room_no: string; projects?: { name: string } }
}

interface DeliveredJob {
  id: string
  customer_name: string
  room_no: string
  actual_deliver_date: string
  revenue_inc_vat: number
  revenue_ex_vat: number
  projects?: { name: string }
}

interface SegmentJob {
  id: string
  customer_name: string
  room_no: string
  customer_type: string
  work_type: string
  revenue_ex_vat: number
  order_date: string | null
  actual_deliver_date: string | null
  projects?: { name: string }
}

interface EntryJob {
  id: string
  customer_name: string
  room_no: string
  project_id: string
  revenue_ex_vat: number | null
  revenue_inc_vat: number | null
  cost: number | null
  actual_deliver_date: string | null
  working_status: string
  projects?: { name: string }
}

interface ActiveJob {
  id: string
  customer_name: string
  room_no: string
  revenue_ex_vat: number
  working_status: string
  customer_id: string | null
  projects?: { name: string }
}

interface BookedCustomer {
  id: string
  customer_name: string
  budget: number
  booking_date: string | null
  projects?: { name: string }
}

interface Entry {
  id: number
  category: string
  amount: number
  entry_date: string
  description: string
  ref_id: string
}

type Period = 'today' | 'week' | 'month' | 'quarter' | 'year'

type EntryDraft = {
  revenue_ex_vat: string
  revenue_inc_vat: string
  cost: string
  actual_deliver_date: string
}

// ── Constants ──────────────────────────────────────────────
const EXPENSE_CATS = ['เงินเดือน', 'ค่าเช่า/สำนักงาน', 'ค่าวัสดุ/สินค้า', 'ค่าขนส่ง', 'ค่าการตลาด', 'ค่าสาธารณูปโภค', 'ค่าใช้จ่ายอื่นๆ']
const PAY_STATUS = [
  { value: 'pending', label: 'รอชำระ', color: 'badge badge-orange' },
  { value: 'overdue', label: 'เกินกำหนด', color: 'badge badge-red' },
  { value: 'paid', label: 'ชำระแล้ว', color: 'badge badge-green' },
  { value: 'partial', label: 'ชำระบางส่วน', color: 'badge badge-blue' },
]
const emptyEntry = { category: '', amount: 0, entry_date: new Date().toISOString().slice(0, 10), description: '', ref_id: '' }
const MONTHS_TH = ['ม.ค.','ก.พ.','มี.ค.','เม.ย.','พ.ค.','มิ.ย.','ก.ค.','ส.ค.','ก.ย.','ต.ค.','พ.ย.','ธ.ค.']
const PERIOD_LABELS: Record<Period, string> = { today: 'วันนี้', week: 'สัปดาห์', month: 'เดือน', quarter: 'ไตรมาส', year: 'ปี' }

// ── Helpers ────────────────────────────────────────────────
const f = (v: number) => '฿' + Math.round(v || 0).toLocaleString()
const fk = (v: number) => {
  if (v >= 1_000_000) return '฿' + (v / 1_000_000).toFixed(2) + 'M'
  if (v >= 1_000) return '฿' + (v / 1_000).toFixed(0) + 'K'
  return '฿' + Math.round(v || 0).toLocaleString()
}
const dateStr = (d: string) => d ? new Date(d).toLocaleDateString('th-TH', { day: '2-digit', month: 'short', year: '2-digit' }) : '—'

const ld = (d: Date) => `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`
function getPeriodBounds(period: Period, offset: number): { start: string; end: string; label: string } {
  const now = new Date()
  if (period === 'today') {
    const d = new Date(now); d.setDate(now.getDate() + offset)
    const s = ld(d)
    return { start: s, end: s, label: offset === 0 ? 'วันนี้' : `${d.getDate()} ${MONTHS_TH[d.getMonth()]}` }
  }
  if (period === 'week') {
    const base = new Date(now); base.setDate(now.getDate() + offset * 7)
    const dow = base.getDay() === 0 ? 6 : base.getDay() - 1
    const mon = new Date(base); mon.setDate(base.getDate() - dow); mon.setHours(0,0,0,0)
    const sun = new Date(mon); sun.setDate(mon.getDate() + 6)
    const fmt = (d: Date) => `${d.getDate()} ${MONTHS_TH[d.getMonth()]}`
    return { start: ld(mon), end: ld(sun), label: `${fmt(mon)} – ${fmt(sun)}` }
  }
  if (period === 'month') {
    const y = now.getFullYear(); const m = now.getMonth() + offset
    const s = new Date(y, m, 1); const e = new Date(y, m+1, 0)
    return { start: ld(s), end: ld(e), label: `${MONTHS_TH[s.getMonth()]} ${s.getFullYear()}` }
  }
  if (period === 'quarter') {
    const totalQ = Math.floor(now.getMonth()/3) + offset
    const y = now.getFullYear() + Math.floor(totalQ/4)
    const q = ((totalQ%4)+4)%4
    const s = new Date(y, q*3, 1); const e = new Date(y, q*3+3, 0)
    return { start: ld(s), end: ld(e), label: `Q${q+1} ${y}` }
  }
  const y = now.getFullYear() + offset
  return { start: `${y}-01-01`, end: `${y}-12-31`, label: `ปี ${y}` }
}

// ── Page ───────────────────────────────────────────────────
export default function FinancePage() {
  const supabase = createClient()
  const [tab, setTab] = useState<'overview' | 'expense' | 'payments' | 'segment' | 'entry'>('overview')
  const [entryJobs, setEntryJobs] = useState<EntryJob[]>([])
  const [entryDrafts, setEntryDrafts] = useState<Record<string, EntryDraft>>({})
  const [entryProjectFilter, setEntryProjectFilter] = useState('')
  const [entrySaving, setEntrySaving] = useState(false)
  const [entrySaveMsg, setEntrySaveMsg] = useState('')
  const [segmentJobs, setSegmentJobs] = useState<SegmentJob[]>([])
  const [segDateMode, setSegDateMode] = useState<'order' | 'deliver'>('order')

  const [payments, setPayments] = useState<Payment[]>([])
  const [deliveredJobs, setDeliveredJobs] = useState<DeliveredJob[]>([])
  const [activeJobs, setActiveJobs] = useState<ActiveJob[]>([])
  const [bookedCustomers, setBookedCustomers] = useState<BookedCustomer[]>([])
  const [entries, setEntries] = useState<Entry[]>([])
  const [loading, setLoading] = useState(true)
  const [fetchError, setFetchError] = useState('')
  const [drilldown, setDrilldown] = useState<'backlog' | 'pending_final' | 'overdue' | null>(null)

  const [period, setPeriod] = useState<Period>('month')
  const [offset, setOffset] = useState(0)

  const [entryOpen, setEntryOpen] = useState(false)
  const [editingEntry, setEditingEntry] = useState<Entry | null>(null)
  const [entryForm, setEntryForm] = useState(emptyEntry)
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState('')
  const [payTab, setPayTab] = useState<'outstanding' | 'paid' | 'all'>('outstanding')
  const [expenseMonth, setExpenseMonth] = useState('')

  const load = useCallback(async () => {
    setLoading(true); setFetchError('')
    const [{ data: p, error: e1 }, { data: j, error: e2 }, { data: e }, { data: aj }, { data: bc }, { data: sg }, { data: ej }] = await Promise.all([
      supabase.from('payments')
        .select('id,job_id,installment_no,installment_name,due_date,amount,paid_date,paid_amount,status,notes,jobs(customer_name,room_no,projects(name))')
        .order('due_date'),
      supabase.from('jobs')
        .select('id,customer_name,room_no,actual_deliver_date,revenue_inc_vat,revenue_ex_vat,projects(name)')
        .eq('working_status', 'ส่งมอบแล้ว')
        .not('actual_deliver_date', 'is', null)
        .order('actual_deliver_date', { ascending: false }),
      supabase.from('finance_entries').select('*').order('entry_date', { ascending: false }),
      supabase.from('jobs')
        .select('id,customer_name,room_no,revenue_ex_vat,working_status,customer_id,projects(name)')
        .not('working_status', 'in', '("ส่งมอบแล้ว","ยกเลิก")'),
      supabase.from('customers')
        .select('id,customer_name,budget,booking_date,projects(name)')
        .eq('status', 'booked'),
      // segment breakdown — ทุก job ที่ไม่ยกเลิก
      supabase.from('jobs')
        .select('id,customer_name,room_no,customer_type,work_type,revenue_ex_vat,order_date,actual_deliver_date,projects(name)')
        .not('working_status', 'eq', 'ยกเลิก'),
      // data entry jobs
      supabase.from('jobs')
        .select('id,customer_name,room_no,project_id,revenue_ex_vat,revenue_inc_vat,cost,actual_deliver_date,working_status,projects(name)')
        .not('working_status', 'eq', 'ยกเลิก')
        .order('customer_name'),
    ])
    if (e1 || e2) { setFetchError((e1 ?? e2)!.message); setLoading(false); return }
    setPayments((p || []) as unknown as Payment[])
    setDeliveredJobs((j || []) as unknown as DeliveredJob[])
    setActiveJobs((aj || []) as unknown as ActiveJob[])
    setBookedCustomers((bc || []) as unknown as BookedCustomer[])
    setEntries(((e as any) || []) as Entry[])
    setSegmentJobs((sg || []) as unknown as SegmentJob[])
    const ejList = (ej || []) as unknown as EntryJob[]
    setEntryJobs(ejList)
    // init drafts from DB values
    const drafts: Record<string, EntryDraft> = {}
    ejList.forEach(j => {
      drafts[j.id] = {
        revenue_ex_vat: j.revenue_ex_vat != null ? String(j.revenue_ex_vat) : '',
        revenue_inc_vat: j.revenue_inc_vat != null ? String(j.revenue_inc_vat) : '',
        cost: j.cost != null ? String(j.cost) : '',
        actual_deliver_date: j.actual_deliver_date || '',
      }
    })
    setEntryDrafts(drafts)
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

  async function bulkSaveEntry() {
    const changed = entryJobs.filter(j => {
      const d = entryDrafts[j.id]
      if (!d) return false
      return (
        (d.revenue_ex_vat !== (j.revenue_ex_vat != null ? String(j.revenue_ex_vat) : '')) ||
        (d.revenue_inc_vat !== (j.revenue_inc_vat != null ? String(j.revenue_inc_vat) : '')) ||
        (d.cost !== (j.cost != null ? String(j.cost) : '')) ||
        (d.actual_deliver_date !== (j.actual_deliver_date || ''))
      )
    })
    if (changed.length === 0) { setEntrySaveMsg('ไม่มีการเปลี่ยนแปลง'); return }
    setEntrySaving(true); setEntrySaveMsg('')
    await Promise.all(changed.map(j => {
      const d = entryDrafts[j.id]
      return supabase.from('jobs').update({
        revenue_ex_vat: d.revenue_ex_vat !== '' ? Number(d.revenue_ex_vat) : null,
        revenue_inc_vat: d.revenue_inc_vat !== '' ? Number(d.revenue_inc_vat) : null,
        cost: d.cost !== '' ? Number(d.cost) : null,
        actual_deliver_date: d.actual_deliver_date || null,
      }).eq('id', j.id)
    }))
    setEntrySaving(false)
    setEntrySaveMsg(`บันทึก ${changed.length} รายการแล้ว`)
    load()
  }

  async function saveEntry() {
    if (!entryForm.category || !entryForm.amount || !entryForm.entry_date) return
    setSaving(true); setSaveError('')
    if (editingEntry) {
      const { error } = await supabase.from('finance_entries').update(entryForm).eq('id', editingEntry.id)
      if (error) { setSaveError(error.message); setSaving(false); return }
    } else {
      const { error } = await supabase.from('finance_entries').insert(entryForm)
      if (error) { setSaveError(error.message); setSaving(false); return }
    }
    setSaving(false); setEntryOpen(false); load()
  }

  async function deleteEntry(id: number) {
    if (!confirm('ลบรายการนี้?')) return
    await supabase.from('finance_entries').delete().eq('id', id)
    load()
  }

  const today = new Date().toISOString().slice(0, 10)
  const { start, end, label } = getPeriodBounds(period, offset)

  const paidPayments = payments.filter(p => p.status === 'paid')
  const outstanding = payments.filter(p => p.status !== 'paid')
  const overdue = payments.filter(p => p.status !== 'paid' && p.due_date && p.due_date < today)

  // ── Pipeline calculations ───────────────────────────────
  // job_ids ที่มี job record แล้ว (แปลงเป็น backlog แล้ว)
  const jobCustomerIds = new Set(activeJobs.map(j => j.customer_id).filter(Boolean))
  const deliveredCustomerIds = new Set(deliveredJobs.map(j => j.id)) // ไม่ใช้ customer_id แต่ job id

  // booked ที่ยังไม่มี job = customer ที่ booked แต่ customer_id ไม่อยู่ใน active jobs
  const bookedWithJob = bookedCustomers.filter(c => jobCustomerIds.has(c.id))
  const bookedNoJob = bookedCustomers.filter(c => !jobCustomerIds.has(c.id))
  const bookedWithJobValue = bookedWithJob.reduce((s, c) => s + (c.budget || 0), 0)
  const bookedNoJobValue = bookedNoJob.reduce((s, c) => s + (c.budget || 0), 0)

  // งานกำลังทำ: active jobs (ไม่ส่งมอบ ไม่ยกเลิก)
  const activeJobValue = activeJobs.reduce((s, j) => s + (j.revenue_ex_vat || 0), 0)

  // payment pipeline จาก active jobs
  const activeJobIds = new Set(activeJobs.map(j => j.id))
  const activePayments = payments.filter(p => activeJobIds.has(p.job_id))
  const collectedFromActive = activePayments.filter(p => p.status === 'paid').reduce((s, p) => s + (p.paid_amount || 0), 0)
  const pendingFinal = activePayments.filter(p => p.status !== 'paid' && (p as any).is_final).reduce((s, p) => s + (p.amount || 0), 0)
  const pendingAll = activePayments.filter(p => p.status !== 'paid').reduce((s, p) => s + (p.amount || 0), 0)

  // Period income
  const periodDelivered = deliveredJobs.filter(j => j.actual_deliver_date >= start && j.actual_deliver_date <= end)
  const periodPaid = paidPayments.filter(p => p.paid_date >= start && p.paid_date <= end)
  const periodExpenses = entries.filter(e => e.entry_date >= start && e.entry_date <= end)

  const periodDeliveredRevenue = periodDelivered.reduce((s, j) => s + (j.revenue_inc_vat || j.revenue_ex_vat || 0), 0)
  const periodPaidAmount = periodPaid.reduce((s, p) => s + (p.paid_amount || 0), 0)
  const periodTotalIncome = periodDeliveredRevenue + periodPaidAmount
  const periodExpenseTotal = periodExpenses.reduce((s, e) => s + (e.amount || 0), 0)

  // Previous period for comparison
  const { start: prevStart, end: prevEnd } = getPeriodBounds(period, offset - 1)
  const prevIncome = [
    ...deliveredJobs.filter(j => j.actual_deliver_date >= prevStart && j.actual_deliver_date <= prevEnd)
      .map(j => j.revenue_inc_vat || j.revenue_ex_vat || 0),
    ...paidPayments.filter(p => p.paid_date >= prevStart && p.paid_date <= prevEnd)
      .map(p => p.paid_amount || 0),
  ].reduce((s, v) => s + v, 0)
  const growthPct = prevIncome > 0 ? ((periodTotalIncome - prevIncome) / prevIncome * 100).toFixed(1) : null

  // Monthly chart (12 months ending this month)
  const monthlyChart = useMemo(() => {
    const now = new Date()
    return Array.from({ length: 12 }, (_, i) => {
      const d = new Date(now.getFullYear(), now.getMonth() - 11 + i, 1)
      const key = d.toISOString().slice(0, 7)
      const delivered = deliveredJobs
        .filter(j => j.actual_deliver_date?.startsWith(key))
        .reduce((s, j) => s + (j.revenue_inc_vat || j.revenue_ex_vat || 0), 0)
      const received = paidPayments
        .filter(p => p.paid_date?.startsWith(key))
        .reduce((s, p) => s + (p.paid_amount || 0), 0)
      const expense = entries
        .filter(e => e.entry_date?.startsWith(key))
        .reduce((s, e) => s + (e.amount || 0), 0)
      return { label: `${MONTHS_TH[d.getMonth()]} ${d.getFullYear().toString().slice(2)}`, key, delivered, received, expense, total: delivered + received }
    })
  }, [deliveredJobs, paidPayments, entries])

  const chartMax = Math.max(...monthlyChart.map(m => Math.max(m.total, m.expense)), 1)

  const filteredEntries = entries.filter(e => !expenseMonth || e.entry_date?.startsWith(expenseMonth))
  const payBase = payTab === 'outstanding' ? outstanding : payTab === 'paid' ? paidPayments : payments

  if (loading) return <div className="flex items-center justify-center h-full"><PageSpinner /></div>
  if (fetchError) return <PageError message={fetchError} onRetry={load} />

  return (
    <div className="page-content">
      {/* Header */}
      <div className="flex items-center justify-between mb-5">
        <div>
          <h1 className="text-page-title" style={{ color: 'var(--text-1)' }}>Finance</h1>
          <p className="text-sm mt-0.5" style={{ color: 'var(--text-3)' }}>รายรับ = ยอดส่งมอบ (inc.VAT) + งวดรับชำระ · รายจ่าย = บันทึกเอง</p>
        </div>
        {tab === 'expense' && (
          <button onClick={() => { setEditingEntry(null); setEntryForm(emptyEntry); setSaveError(''); setEntryOpen(true) }}
            className="flex items-center gap-2 px-4 py-2 rounded-[var(--radius-pill)] text-sm font-semibold text-white"
            style={{ background: 'var(--accent)' }}>
            <Plus size={15} />เพิ่มรายจ่าย
          </button>
        )}
      </div>

      {/* Tabs */}
      <div className="flex gap-1 rounded-[11px] p-1 mb-5 w-fit" style={{ background: 'var(--hover-bg)', border: '1px solid var(--divider)' }}>
        {[
          { key: 'overview', label: 'รายรับ', icon: DollarSign },
          { key: 'segment', label: 'แยกประเภท', icon: Package },
          { key: 'expense', label: 'รายจ่าย', icon: TrendingDown },
          { key: 'payments', label: 'งวดผ่อนชำระ', icon: Wallet },
          { key: 'entry', label: 'แก้ไขข้อมูล', icon: TableProperties },
        ].map(t => {
          const Icon = t.icon
          return (
            <button key={t.key} onClick={() => setTab(t.key as any)}
              className="flex items-center gap-2 px-4 py-2 rounded-[8px] text-sm font-semibold transition-colors"
              style={{ background: tab === t.key ? 'var(--accent)' : 'transparent', color: tab === t.key ? '#fff' : 'var(--text-2)' }}>
              <Icon size={14} />{t.label}
            </button>
          )
        })}
      </div>

      {/* Period selector — always visible regardless of tab */}
      <div className="flex items-center gap-3 flex-wrap mb-5">
        <div className="flex rounded-[11px] overflow-hidden" style={{ border: '1px solid var(--divider)' }}>
          {(['today','week','month','quarter','year'] as Period[]).map(p => (
            <button key={p} onClick={() => { setPeriod(p); setOffset(0) }}
              className="px-3 py-1.5 text-xs font-semibold"
              style={{ background: period === p ? 'var(--accent)' : 'var(--hover-bg)', color: period === p ? '#fff' : 'var(--text-2)' }}>
              {PERIOD_LABELS[p]}
            </button>
          ))}
        </div>
        <button onClick={() => setOffset(o => o - 1)} className="p-1.5 rounded-[8px]" style={{ background: 'var(--hover-bg)' }}>
          <ChevronLeft size={15} style={{ color: 'var(--text-2)' }} />
        </button>
        <span className="text-sm font-semibold px-3 py-1.5 rounded-[11px] ds-card" style={{ color: 'var(--text-1)' }}>
          {label}
          {offset === 0 && <span className="ml-2 text-xs" style={{ color: 'var(--accent)' }}>▲</span>}
        </span>
        <button onClick={() => setOffset(o => o + 1)} disabled={offset >= 0}
          className="p-1.5 rounded-[8px]" style={{ background: 'var(--hover-bg)' }}>
          <ChevronRight size={15} style={{ color: offset >= 0 ? 'var(--text-3)' : 'var(--text-2)' }} />
        </button>
      </div>

      {/* ── Tab: Overview ─────────────────────────────────── */}
      {tab === 'overview' && (
        <div className="space-y-5">

          {/* KPI Cards */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="ds-card p-4">
              <div className="flex items-center gap-2 mb-2">
                <Package size={13} style={{ color: '#4ade80' }} />
                <span className="text-card-title" style={{ color: 'var(--text-3)' }}>ยอดส่งมอบ (inc.VAT)</span>
              </div>
              <p className="text-kpi-number" style={{ color: '#4ade80' }}>{fk(periodDeliveredRevenue)}</p>
              <p className="text-xs mt-1" style={{ color: 'var(--text-3)' }}>{periodDelivered.length} งาน</p>
            </div>
            <div className="ds-card p-4">
              <div className="flex items-center gap-2 mb-2">
                <Wallet size={13} style={{ color: '#60a5fa' }} />
                <span className="text-card-title" style={{ color: 'var(--text-3)' }}>รับงวด (paid)</span>
              </div>
              <p className="text-kpi-number" style={{ color: '#60a5fa' }}>{fk(periodPaidAmount)}</p>
              <p className="text-xs mt-1" style={{ color: 'var(--text-3)' }}>{periodPaid.length} งวด</p>
            </div>
            <div className="ds-card p-4">
              <div className="flex items-center gap-2 mb-2">
                <TrendingDown size={13} style={{ color: '#f87171' }} />
                <span className="text-card-title" style={{ color: 'var(--text-3)' }}>รายจ่าย</span>
              </div>
              <p className="text-kpi-number" style={{ color: '#f87171' }}>{fk(periodExpenseTotal)}</p>
              <p className="text-xs mt-1" style={{ color: 'var(--text-3)' }}>{periodExpenses.length} รายการ</p>
            </div>
            <div className="ds-card p-4">
              <div className="flex items-center gap-2 mb-2">
                <TrendingUp size={13} style={{ color: periodTotalIncome - periodExpenseTotal >= 0 ? '#4ade80' : '#f87171' }} />
                <span className="text-card-title" style={{ color: 'var(--text-3)' }}>Net Cash</span>
              </div>
              <p className="text-kpi-number" style={{ color: periodTotalIncome - periodExpenseTotal >= 0 ? '#4ade80' : '#f87171' }}>
                {fk(periodTotalIncome - periodExpenseTotal)}
              </p>
              <p className="text-xs mt-1" style={{ color: 'var(--text-3)' }}>
                {growthPct ? `${Number(growthPct) > 0 ? '+' : ''}${growthPct}% vs ${PERIOD_LABELS[period]}ก่อน` : `รายรับรวม ${fk(periodTotalIncome)}`}
              </p>
            </div>
          </div>

          {/* 12-month chart */}
          <div className="ds-card p-5">
            <div className="flex items-center gap-4 mb-4 flex-wrap">
              <h2 className="text-section-title" style={{ color: 'var(--text-1)' }}>รายรับ vs รายจ่าย 12 เดือนล่าสุด</h2>
              <div className="flex gap-4 text-xs">
                <span className="flex items-center gap-1.5" style={{ color: 'var(--text-3)' }}>
                  <span className="w-3 h-2 rounded-sm inline-block" style={{ background: '#4ade80' }} />ส่งมอบ
                </span>
                <span className="flex items-center gap-1.5" style={{ color: 'var(--text-3)' }}>
                  <span className="w-3 h-2 rounded-sm inline-block" style={{ background: '#60a5fa' }} />รับงวด
                </span>
                <span className="flex items-center gap-1.5" style={{ color: 'var(--text-3)' }}>
                  <span className="w-3 h-2 rounded-sm inline-block" style={{ background: '#f87171' }} />รายจ่าย
                </span>
              </div>
            </div>
            <div className="flex items-end gap-1.5 overflow-x-auto pb-1" style={{ height: '130px' }}>
              {monthlyChart.map(m => {
                const isCurrentMonth = m.key === today.slice(0, 7)
                return (
                  <div key={m.key} className="flex-shrink-0 flex flex-col items-center gap-1 group" style={{ minWidth: '44px' }}>
                    <div className="w-full flex gap-0.5 items-end relative" style={{ height: '100px' }}>
                      {/* Income stacked bar */}
                      {m.total > 0 && (
                        <div className="flex-1 flex flex-col justify-end rounded-t-sm overflow-hidden"
                          style={{ height: `${(m.total / chartMax) * 100}%` }}>
                          {m.received > 0 && (
                            <div style={{ height: `${(m.received / m.total) * 100}%`, background: '#60a5fa' }} />
                          )}
                          {m.delivered > 0 && (
                            <div style={{ height: `${(m.delivered / m.total) * 100}%`, background: '#4ade80' }} />
                          )}
                        </div>
                      )}
                      {/* Expense bar */}
                      <div className="flex-1 flex flex-col justify-end">
                        {m.expense > 0 && (
                          <div className="rounded-t-sm" style={{ height: `${(m.expense / chartMax) * 100}%`, background: '#f87171', opacity: 0.75 }} />
                        )}
                      </div>
                      {/* Tooltip */}
                      {(m.total > 0 || m.expense > 0) && (
                        <div className="absolute bottom-full mb-1 left-1/2 -translate-x-1/2 opacity-0 group-hover:opacity-100 transition-opacity z-10 text-[10px] whitespace-nowrap px-2 py-1 rounded-lg pointer-events-none"
                          style={{ background: 'var(--card-bg)', border: '1px solid var(--divider)', color: 'var(--text-1)' }}>
                          {m.total > 0 && <div style={{ color: '#4ade80' }}>รับ {fk(m.total)}</div>}
                          {m.expense > 0 && <div style={{ color: '#f87171' }}>จ่าย {fk(m.expense)}</div>}
                        </div>
                      )}
                    </div>
                    <p className="text-[10px] whitespace-nowrap"
                      style={{ color: isCurrentMonth ? 'var(--accent)' : 'var(--text-3)', fontWeight: isCurrentMonth ? 700 : 400 }}>
                      {m.label}
                    </p>
                  </div>
                )
              })}
            </div>
          </div>

          {/* ── Pipeline การเงิน ─────────────────────────────── */}
          <div className="ds-card p-5">
            <h2 className="text-section-title mb-4" style={{ color: 'var(--text-1)' }}>Pipeline การเงิน</h2>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">

              {/* 1. Booking Funnel */}
              <div className="rounded-[11px] p-4 space-y-3" style={{ background: 'var(--hover-bg)' }}>
                <p className="text-xs font-semibold" style={{ color: 'var(--text-3)' }}>ลูกค้า Booked</p>
                <div className="space-y-2">
                  <div className="flex justify-between items-center">
                    <span className="text-xs" style={{ color: 'var(--text-2)' }}>ทั้งหมด</span>
                    <span className="text-sm font-bold" style={{ color: 'var(--text-1)' }}>{bookedCustomers.length} ราย</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-xs" style={{ color: '#4ade80' }}>แปลงเป็น Backlog แล้ว</span>
                    <span className="text-sm font-bold" style={{ color: '#4ade80' }}>{bookedWithJob.length} ราย</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-xs" style={{ color: '#f59e0b' }}>ยังไม่มี Job</span>
                    <span className="text-sm font-bold" style={{ color: '#f59e0b' }}>{bookedNoJob.length} ราย</span>
                  </div>
                  {bookedNoJobValue > 0 && (
                    <div className="flex justify-between items-center pt-1" style={{ borderTop: '1px solid var(--divider)' }}>
                      <span className="text-xs" style={{ color: 'var(--text-3)' }}>มูลค่ารอแปลง</span>
                      <span className="text-xs font-semibold" style={{ color: '#f59e0b' }}>{fk(bookedNoJobValue)}</span>
                    </div>
                  )}
                  {bookedCustomers.length > 0 && (
                    <div className="h-1.5 rounded-full mt-1" style={{ background: 'var(--divider)' }}>
                      <div className="h-full rounded-full" style={{ width: `${(bookedWithJob.length / bookedCustomers.length) * 100}%`, background: '#4ade80' }} />
                    </div>
                  )}
                </div>
              </div>

              {/* 2. Active Job Backlog */}
              <div className="rounded-[11px] p-4 space-y-3" style={{ background: 'var(--hover-bg)' }}>
                <p className="text-xs font-semibold" style={{ color: 'var(--text-3)' }}>งานที่กำลังทำ (Backlog)</p>
                <div className="space-y-2">
                  <div className="flex justify-between items-center">
                    <span className="text-xs" style={{ color: 'var(--text-2)' }}>จำนวนงาน</span>
                    <span className="text-sm font-bold" style={{ color: 'var(--text-1)' }}>{activeJobs.length} งาน</span>
                  </div>
                  <button className="flex justify-between items-center w-full text-left hover:underline" onClick={() => setDrilldown('backlog')}>
                    <span className="text-xs" style={{ color: 'var(--text-2)' }}>มูลค่ารวม ↗</span>
                    <span className="text-sm font-bold" style={{ color: '#60a5fa' }}>{fk(activeJobValue)}</span>
                  </button>
                  <div className="flex justify-between items-center pt-1" style={{ borderTop: '1px solid var(--divider)' }}>
                    <span className="text-xs" style={{ color: '#4ade80' }}>รับชำระแล้ว</span>
                    <span className="text-xs font-semibold" style={{ color: '#4ade80' }}>{fk(collectedFromActive)}</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-xs" style={{ color: '#f59e0b' }}>ค้างรับทั้งหมด</span>
                    <span className="text-xs font-semibold" style={{ color: '#f59e0b' }}>{fk(pendingAll)}</span>
                  </div>
                  {activeJobValue > 0 && (
                    <div className="h-1.5 rounded-full mt-1" style={{ background: 'var(--divider)' }}>
                      <div className="h-full rounded-full" style={{ width: `${Math.min((collectedFromActive / activeJobValue) * 100, 100)}%`, background: '#4ade80' }} />
                    </div>
                  )}
                </div>
              </div>

              {/* 3. Outstanding Final Installments */}
              <div className="rounded-[11px] p-4 space-y-3" style={{ background: 'var(--hover-bg)' }}>
                <p className="text-xs font-semibold" style={{ color: 'var(--text-3)' }}>งวดรอเก็บ</p>
                <div className="space-y-2">
                  <button className="flex justify-between items-center w-full text-left hover:underline" onClick={() => setDrilldown('pending_final')}>
                    <span className="text-xs" style={{ color: '#f87171' }}>งวดส่งมอบ (ค้าง) ↗</span>
                    <span className="text-sm font-bold" style={{ color: '#f87171' }}>{fk(pendingFinal)}</span>
                  </button>
                  <div className="flex justify-between items-center">
                    <span className="text-xs" style={{ color: 'var(--text-2)' }}>งวดอื่นๆ ค้าง</span>
                    <span className="text-sm font-bold" style={{ color: 'var(--text-2)' }}>{fk(pendingAll - pendingFinal)}</span>
                  </div>
                  <div className="flex justify-between items-center pt-1" style={{ borderTop: '1px solid var(--divider)' }}>
                    <span className="text-xs" style={{ color: 'var(--text-3)' }}>เกินกำหนด</span>
                    <span className="text-xs font-semibold" style={{ color: '#ef4444' }}>
                      {fk(activePayments.filter(p => p.status !== 'paid' && p.due_date && p.due_date < today).reduce((s, p) => s + (p.amount || 0), 0))}
                    </span>
                  </div>
                </div>
              </div>

            </div>
          </div>

          {/* Period detail: delivered jobs grouped by project */}
          {periodDelivered.length > 0 && (() => {
            const byProject: Record<string, { name: string; jobs: DeliveredJob[] }> = {}
            periodDelivered.forEach(j => {
              const pname = (j.projects as any)?.name || 'ไม่ระบุโครงการ'
              if (!byProject[pname]) byProject[pname] = { name: pname, jobs: [] }
              byProject[pname].jobs.push(j)
            })
            const projectGroups = Object.values(byProject).sort((a, b) => a.name.localeCompare(b.name, 'th'))
            return (
              <div className="ds-card p-5">
                <h2 className="text-section-title mb-4" style={{ color: 'var(--text-1)' }}>
                  งานส่งมอบใน{label} ({periodDelivered.length} งาน · {projectGroups.length} โครงการ)
                </h2>
                <div className="space-y-4">
                  {projectGroups.map(pg => {
                    const pgTotal = pg.jobs.reduce((s, j) => s + (j.revenue_inc_vat || j.revenue_ex_vat || 0), 0)
                    return (
                      <div key={pg.name} className="rounded-[11px] overflow-hidden" style={{ border: '1px solid var(--divider)' }}>
                        {/* Project header */}
                        <div className="flex items-center justify-between px-4 py-2.5"
                          style={{ background: 'var(--hover-bg)', borderBottom: '1px solid var(--divider)' }}>
                          <span className="text-xs font-bold uppercase tracking-wide" style={{ color: 'var(--accent)' }}>{pg.name}</span>
                          <div className="text-right">
                            <span className="text-sm font-bold" style={{ color: '#4ade80' }}>{f(pgTotal)}</span>
                            <span className="text-xs ml-2" style={{ color: 'var(--text-3)' }}>{pg.jobs.length} งาน</span>
                          </div>
                        </div>
                        {/* Room list */}
                        {pg.jobs.map((j, i) => (
                          <div key={j.id} className="flex items-center justify-between px-4 py-2.5"
                            style={{ borderBottom: i < pg.jobs.length - 1 ? '1px solid var(--divider)' : 'none' }}>
                            <div>
                              <p className="text-sm font-semibold" style={{ color: 'var(--text-1)' }}>{j.customer_name}</p>
                              <p className="text-xs" style={{ color: 'var(--text-3)' }}>ห้อง {j.room_no} · {dateStr(j.actual_deliver_date)}</p>
                            </div>
                            <div className="text-right">
                              <p className="text-sm font-semibold" style={{ color: '#4ade80' }}>{f(j.revenue_inc_vat || j.revenue_ex_vat || 0)}</p>
                              {j.revenue_inc_vat && j.revenue_ex_vat && j.revenue_inc_vat !== j.revenue_ex_vat && (
                                <p className="text-[11px]" style={{ color: 'var(--text-3)' }}>ex.VAT {f(j.revenue_ex_vat)}</p>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    )
                  })}
                  <div className="flex justify-between pt-1 font-bold">
                    <span className="text-sm" style={{ color: 'var(--text-2)' }}>รวมทั้งหมด</span>
                    <span style={{ color: '#4ade80' }}>{f(periodDeliveredRevenue)}</span>
                  </div>
                </div>
              </div>
            )
          })()}

          {/* Period detail: paid installments */}
          {periodPaid.length > 0 && (
            <div className="ds-card p-5">
              <h2 className="text-section-title mb-4" style={{ color: 'var(--text-1)' }}>งวดรับชำระใน{label} ({periodPaid.length} งวด)</h2>
              <div className="space-y-2">
                {periodPaid.map(p => (
                  <div key={p.id} className="flex items-center justify-between py-2" style={{ borderBottom: '1px solid var(--divider)' }}>
                    <div>
                      <p className="text-sm font-semibold" style={{ color: 'var(--text-1)' }}>{(p as any).jobs?.customer_name || '—'}</p>
                      <p className="text-xs" style={{ color: 'var(--text-3)' }}>{(p as any).jobs?.room_no} · {p.installment_name || `งวด ${p.installment_no}`} · {dateStr(p.paid_date)}</p>
                    </div>
                    <p className="text-sm font-bold" style={{ color: '#60a5fa' }}>{f(p.paid_amount)}</p>
                  </div>
                ))}
                <div className="flex justify-between pt-2 font-bold">
                  <span className="text-sm" style={{ color: 'var(--text-2)' }}>รวม</span>
                  <span style={{ color: '#60a5fa' }}>{f(periodPaidAmount)}</span>
                </div>
              </div>
            </div>
          )}

          {periodDelivered.length === 0 && periodPaid.length === 0 && (
            <div className="ds-card p-10 text-center text-sm" style={{ color: 'var(--text-3)' }}>
              ไม่มีรายรับใน{label}
            </div>
          )}
        </div>
      )}

      {/* ── Tab: Segment ─────────────────────────────────── */}
      {tab === 'segment' && (() => {
        const isRpt = (wt: string) => wt === 'RPT'
        const dateOf = (j: SegmentJob) => segDateMode === 'order' ? j.order_date : j.actual_deliver_date
        const inPeriod = (j: SegmentJob) => {
          const d = dateOf(j); return !!d && d >= start && d <= end
        }
        const seg = segmentJobs.filter(inPeriod)
        const all = segmentJobs // ทั้งหมด ไม่กรองช่วงเวลา (สำหรับ YTD/total)

        // คำนวณ segment แบ่งตามช่วงเวลาที่เลือก
        const calc = (jobs: SegmentJob[], custType: string, rpt: boolean) =>
          jobs.filter(j => j.customer_type === custType && isRpt(j.work_type) === rpt)
              .reduce((s, j) => s + (j.revenue_ex_vat || 0), 0)

        const totalPeriod = seg.reduce((s, j) => s + (j.revenue_ex_vat || 0), 0)
        const b2cRpt = calc(seg, 'B2C', true)
        const b2cNrpt = calc(seg, 'B2C', false)
        const b2bRpt = calc(seg, 'B2B', true)
        const b2bNrpt = calc(seg, 'B2B', false)
        const b2cTotal = b2cRpt + b2cNrpt
        const b2bTotal = b2bRpt + b2bNrpt

        // คำนวณ work_type ย่อย (N-RPT ต่างชนิด)
        const workTypeBreakdown = (jobs: SegmentJob[], custType: string) => {
          const map: Record<string, number> = {}
          jobs.filter(j => j.customer_type === custType && !isRpt(j.work_type)).forEach(j => {
            map[j.work_type || 'อื่นๆ'] = (map[j.work_type || 'อื่นๆ'] || 0) + (j.revenue_ex_vat || 0)
          })
          return Object.entries(map).sort((a, b) => b[1] - a[1])
        }

        // รายการงานดิบ (สำหรับ drill-down ภายหลัง)
        const pct2 = (v: number) => totalPeriod > 0 ? (v / totalPeriod * 100).toFixed(1) : '0'

        const CUST_COLORS = { B2C: '#6366f1', B2B: '#ec4899' }
        const RPT_COLOR = '#34d399'
        const NRPT_COLOR = '#fbbf24'

        return (
          <div className="space-y-6">
            {/* Period filter + date mode toggle */}
            <div className="flex items-center gap-3 flex-wrap">
              <div className="flex gap-1 p-1 rounded-[11px]" style={{ background: 'var(--hover-bg)', border: '1px solid var(--divider)' }}>
                {(['month','quarter','year'] as Period[]).map(p => (
                  <button key={p} onClick={() => setPeriod(p)}
                    className="px-3 py-1.5 rounded-[8px] text-xs font-semibold transition-colors"
                    style={{ background: period === p ? 'var(--accent)' : 'transparent', color: period === p ? '#fff' : 'var(--text-2)' }}>
                    {p === 'month' ? 'เดือน' : p === 'quarter' ? 'ไตรมาส' : 'ปี'}
                  </button>
                ))}
              </div>
              <button onClick={() => setOffset(o => o - 1)} className="p-2 rounded-lg transition-colors" style={{ background: 'var(--hover-bg)', color: 'var(--text-2)' }}><ChevronLeft size={14} /></button>
              <span className="text-sm font-semibold" style={{ color: 'var(--text-1)' }}>{label}</span>
              <button onClick={() => setOffset(o => o + 1)} className="p-2 rounded-lg transition-colors" style={{ background: 'var(--hover-bg)', color: 'var(--text-2)' }}><ChevronRight size={14} /></button>
              {offset !== 0 && <button onClick={() => setOffset(0)} className="text-xs px-3 py-1.5 rounded-[8px]" style={{ background: 'var(--hover-bg)', color: 'var(--text-3)' }}>ปัจจุบัน</button>}
              <div className="flex gap-1 p-1 rounded-[11px] ml-auto" style={{ background: 'var(--hover-bg)', border: '1px solid var(--divider)' }}>
                <button onClick={() => setSegDateMode('order')}
                  className="px-3 py-1.5 rounded-[8px] text-xs font-semibold transition-colors"
                  style={{ background: segDateMode === 'order' ? 'var(--accent)' : 'transparent', color: segDateMode === 'order' ? '#fff' : 'var(--text-2)' }}>
                  วันที่สั่งงาน
                </button>
                <button onClick={() => setSegDateMode('deliver')}
                  className="px-3 py-1.5 rounded-[8px] text-xs font-semibold transition-colors"
                  style={{ background: segDateMode === 'deliver' ? 'var(--accent)' : 'transparent', color: segDateMode === 'deliver' ? '#fff' : 'var(--text-2)' }}>
                  วันส่งมอบ
                </button>
              </div>
            </div>

            {/* Total KPI */}
            <div className="rounded-[18px] p-5" style={{ background: 'rgba(99,102,241,0.07)', border: '1px solid rgba(99,102,241,0.25)' }}>
              <p className="text-label-upper mb-1" style={{ color: 'var(--accent)' }}>รายได้รวมทั้งบริษัท ({label})</p>
              <p className="text-kpi-number" style={{ color: 'var(--text-1)' }}>{fk(totalPeriod)}</p>
              <p className="text-xs mt-1" style={{ color: 'var(--text-3)' }}>ใช้ {segDateMode === 'order' ? 'วันที่สั่งงาน (order date)' : 'วันส่งมอบจริง (actual deliver)'} เป็นเกณฑ์</p>
            </div>

            {/* B2C + B2B side-by-side */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {(['B2C', 'B2B'] as const).map(ct => {
                const total = ct === 'B2C' ? b2cTotal : b2bTotal
                const rpt = ct === 'B2C' ? b2cRpt : b2bRpt
                const nrpt = ct === 'B2C' ? b2cNrpt : b2bNrpt
                const color = CUST_COLORS[ct]
                const nrptDetails = workTypeBreakdown(seg, ct)
                return (
                  <div key={ct} className="rounded-[18px] p-5 space-y-4"
                    style={{ background: 'var(--card-bg)', border: `1px solid ${color}30` }}>
                    {/* Header */}
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <div className="w-8 h-8 rounded-[11px] flex items-center justify-center text-sm font-bold text-white"
                          style={{ background: color }}>{ct}</div>
                        <div>
                          <p className="text-section-title" style={{ color: 'var(--text-1)' }}>{ct === 'B2C' ? 'ลูกค้าบุคคล' : 'ลูกค้าองค์กร/นิติบุคคล'}</p>
                          <p className="text-xs" style={{ color: 'var(--text-3)' }}>{pct2(total)}% ของรายได้รวม</p>
                        </div>
                      </div>
                      <p className="text-kpi-number" style={{ color }}>{fk(total)}</p>
                    </div>

                    {/* Stacked bar */}
                    {total > 0 && (
                      <div>
                        <div className="flex h-2.5 rounded-full overflow-hidden" style={{ background: 'var(--divider)' }}>
                          <div style={{ width: `${(rpt / total) * 100}%`, background: RPT_COLOR, transition: 'width 0.4s' }} />
                          <div style={{ width: `${(nrpt / total) * 100}%`, background: NRPT_COLOR, transition: 'width 0.4s' }} />
                        </div>
                      </div>
                    )}

                    {/* RPT */}
                    <div className="rounded-[11px] p-4 space-y-1" style={{ background: 'var(--hover-bg)' }}>
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <span className="w-2.5 h-2.5 rounded-full" style={{ background: RPT_COLOR }} />
                          <span className="text-sm font-semibold" style={{ color: 'var(--text-1)' }}>RPT</span>
                          <span className="text-[10px] px-1.5 py-0.5 rounded" style={{ background: 'rgba(52,211,153,0.15)', color: RPT_COLOR }}>Repeat</span>
                        </div>
                        <span className="font-bold text-sm" style={{ color: RPT_COLOR }}>{fk(rpt)}</span>
                      </div>
                      {total > 0 && <div className="w-full h-1 rounded-full" style={{ background: 'var(--divider)' }}>
                        <div style={{ width: `${(rpt / total) * 100}%`, background: RPT_COLOR, height: '100%', borderRadius: 9999 }} />
                      </div>}
                      <p className="text-[10px] text-right" style={{ color: RPT_COLOR }}>{total > 0 ? ((rpt / total) * 100).toFixed(1) : 0}%</p>
                    </div>

                    {/* N-RPT */}
                    <div className="rounded-[11px] p-4 space-y-2" style={{ background: 'var(--hover-bg)' }}>
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <span className="w-2.5 h-2.5 rounded-full" style={{ background: NRPT_COLOR }} />
                          <span className="text-sm font-semibold" style={{ color: 'var(--text-1)' }}>N-RPT</span>
                          <span className="text-[10px] px-1.5 py-0.5 rounded" style={{ background: 'rgba(251,191,36,0.15)', color: NRPT_COLOR }}>New</span>
                        </div>
                        <span className="font-bold text-sm" style={{ color: NRPT_COLOR }}>{fk(nrpt)}</span>
                      </div>
                      {total > 0 && <div className="w-full h-1 rounded-full" style={{ background: 'var(--divider)' }}>
                        <div style={{ width: `${(nrpt / total) * 100}%`, background: NRPT_COLOR, height: '100%', borderRadius: 9999 }} />
                      </div>}
                      <p className="text-[10px] text-right" style={{ color: NRPT_COLOR }}>{total > 0 ? ((nrpt / total) * 100).toFixed(1) : 0}%</p>
                      {/* N-RPT sub-types */}
                      {nrptDetails.length > 0 && (
                        <div className="pt-2 space-y-1.5" style={{ borderTop: '1px solid var(--divider)' }}>
                          {nrptDetails.map(([wt, val]) => (
                            <div key={wt} className="flex items-center justify-between">
                              <span className="text-[10px]" style={{ color: 'var(--text-3)' }}>{wt}</span>
                              <div className="flex items-center gap-2">
                                <div className="w-16 h-1 rounded-full" style={{ background: 'var(--divider)' }}>
                                  <div style={{ width: nrpt > 0 ? `${(val / nrpt) * 100}%` : '0%', background: NRPT_COLOR, height: '100%', borderRadius: 9999, opacity: 0.7 }} />
                                </div>
                                <span className="text-[10px] font-semibold" style={{ color: 'var(--text-2)' }}>{fk(val)}</span>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>

            {/* Summary table */}
            <div className="rounded-[18px] overflow-hidden" style={{ background: 'var(--card-bg)', border: '1px solid var(--divider)' }}>
              <div className="px-5 py-3" style={{ borderBottom: '1px solid var(--divider)' }}>
                <p className="text-section-title" style={{ color: 'var(--text-1)' }}>ตารางสรุปรายได้ ({label})</p>
              </div>
              <table className="w-full text-sm">
                <thead>
                  <tr style={{ background: 'var(--hover-bg)', borderBottom: '1px solid var(--divider)' }}>
                    <th className="text-left px-5 py-2.5 text-xs font-semibold" style={{ color: 'var(--text-3)' }}>ประเภท</th>
                    <th className="text-right px-5 py-2.5 text-xs font-semibold" style={{ color: 'var(--text-3)' }}>RPT</th>
                    <th className="text-right px-5 py-2.5 text-xs font-semibold" style={{ color: 'var(--text-3)' }}>N-RPT</th>
                    <th className="text-right px-5 py-2.5 text-xs font-semibold" style={{ color: 'var(--text-3)' }}>รวม</th>
                    <th className="text-right px-5 py-2.5 text-xs font-semibold" style={{ color: 'var(--text-3)' }}>%</th>
                  </tr>
                </thead>
                <tbody>
                  {(['B2C', 'B2B'] as const).map(ct => {
                    const rpt = ct === 'B2C' ? b2cRpt : b2bRpt
                    const nrpt = ct === 'B2C' ? b2cNrpt : b2bNrpt
                    const total = rpt + nrpt
                    const color = CUST_COLORS[ct]
                    return (
                      <tr key={ct} style={{ borderBottom: '1px solid var(--divider)' }}>
                        <td className="px-5 py-3">
                          <div className="flex items-center gap-2">
                            <span className="text-xs font-bold px-2 py-0.5 rounded" style={{ background: color + '20', color }}>{ct}</span>
                            <span className="text-xs" style={{ color: 'var(--text-2)' }}>{ct === 'B2C' ? 'บุคคล' : 'องค์กร'}</span>
                          </div>
                        </td>
                        <td className="px-5 py-3 text-right text-sm font-semibold" style={{ color: RPT_COLOR }}>{fk(rpt)}</td>
                        <td className="px-5 py-3 text-right text-sm font-semibold" style={{ color: NRPT_COLOR }}>{fk(nrpt)}</td>
                        <td className="px-5 py-3 text-right text-sm font-bold" style={{ color: 'var(--text-1)' }}>{fk(total)}</td>
                        <td className="px-5 py-3 text-right text-xs font-semibold" style={{ color }}>
                          {totalPeriod > 0 ? ((total / totalPeriod) * 100).toFixed(1) : 0}%
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
                <tfoot>
                  <tr style={{ borderTop: '2px solid var(--divider)', background: 'var(--hover-bg)' }}>
                    <td className="px-5 py-3 text-sm font-bold" style={{ color: 'var(--text-1)' }}>รวมทั้งหมด</td>
                    <td className="px-5 py-3 text-right text-sm font-bold" style={{ color: RPT_COLOR }}>{fk(b2cRpt + b2bRpt)}</td>
                    <td className="px-5 py-3 text-right text-sm font-bold" style={{ color: NRPT_COLOR }}>{fk(b2cNrpt + b2bNrpt)}</td>
                    <td className="px-5 py-3 text-right text-sm font-bold" style={{ color: 'var(--text-1)' }}>{fk(totalPeriod)}</td>
                    <td className="px-5 py-3 text-right text-xs" style={{ color: 'var(--text-3)' }}>100%</td>
                  </tr>
                </tfoot>
              </table>
            </div>

            {seg.length === 0 && (
              <p className="text-center py-8 text-sm" style={{ color: 'var(--text-3)' }}>ไม่พบข้อมูลในช่วง{label}</p>
            )}
          </div>
        )
      })()}

      {/* ── Tab: Expense ──────────────────────────────────── */}
      {tab === 'expense' && (
        <div className="space-y-4">
          <div className="flex items-center gap-3">
            <input type="month" value={expenseMonth} onChange={e => setExpenseMonth(e.target.value)}
              className="rounded-[8px] px-3 py-2 text-sm outline-none"
              style={{ background: 'var(--hover-bg)', border: '1px solid var(--divider)', color: 'var(--text-1)' }} />
            {expenseMonth && (
              <button onClick={() => setExpenseMonth('')} className="text-xs px-3 py-2 rounded-[8px]" style={{ color: 'var(--text-3)', background: 'var(--hover-bg)' }}>ล้าง</button>
            )}
            <div className="ml-auto ds-card px-4 py-2 text-sm">
              รวม <span className="font-bold ml-1" style={{ color: '#f87171' }}>{f(filteredEntries.reduce((s, e) => s + e.amount, 0))}</span>
            </div>
          </div>
          <div className="ds-card overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr style={{ borderBottom: '1px solid var(--divider)' }}>
                  {['วันที่','หมวด','รายละเอียด','Ref','จำนวน',''].map(h => (
                    <th key={h} className="text-left px-4 py-3 text-xs font-semibold" style={{ color: 'var(--text-3)' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filteredEntries.length === 0 ? (
                  <tr><td colSpan={6} className="text-center py-12">
                    <TrendingDown size={28} className="mx-auto mb-2" style={{ color: 'var(--text-3)' }} />
                    <p className="text-sm" style={{ color: 'var(--text-3)' }}>ยังไม่มีรายจ่าย — กด "เพิ่มรายจ่าย" เพื่อเริ่มต้น</p>
                  </td></tr>
                ) : filteredEntries.map((e, i) => (
                  <tr key={e.id} style={{ borderBottom: '1px solid var(--divider)', background: i % 2 ? 'var(--hover-bg)' : 'transparent' }}>
                    <td className="px-4 py-3 text-xs whitespace-nowrap" style={{ color: 'var(--text-2)' }}>{dateStr(e.entry_date)}</td>
                    <td className="px-4 py-3 text-xs" style={{ color: 'var(--text-2)' }}>{e.category}</td>
                    <td className="px-4 py-3" style={{ color: 'var(--text-1)' }}>{e.description || '—'}</td>
                    <td className="px-4 py-3 text-xs font-mono" style={{ color: 'var(--text-3)' }}>{e.ref_id || '—'}</td>
                    <td className="px-4 py-3 font-semibold text-right" style={{ color: '#f87171' }}>{f(e.amount)}</td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <button onClick={() => { setEditingEntry(e); setEntryForm({ category: e.category, amount: e.amount, entry_date: e.entry_date, description: e.description || '', ref_id: e.ref_id || '' }); setSaveError(''); setEntryOpen(true) }}
                          style={{ color: 'var(--text-3)' }}><Pencil size={13} /></button>
                        <button onClick={() => deleteEntry(e.id)} className="text-red-400/50 hover:text-red-400 transition-colors">
                          <Trash2 size={13} /></button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ── Tab: Payments ─────────────────────────────────── */}
      {tab === 'payments' && (
        <div className="space-y-4">
          {overdue.length > 0 && (
            <div className="flex items-center gap-3 p-3 rounded-[11px] text-sm" style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)', color: '#f87171' }}>
              <AlertCircle size={15} />มี {overdue.length} งวดเกินกำหนด รวม {f(overdue.reduce((s, p) => s + p.amount, 0))}
            </div>
          )}
          <div className="grid grid-cols-3 gap-3">
            <div className="ds-card p-3">
              <p className="text-card-title mb-1" style={{ color: 'var(--text-3)' }}>ค้างรับทั้งหมด</p>
              <p className="text-lg font-bold text-yellow-400">{f(outstanding.reduce((s, p) => s + p.amount, 0))}</p>
              <p className="text-xs mt-0.5" style={{ color: 'var(--text-3)' }}>{outstanding.length} งวด</p>
            </div>
            <div className="ds-card p-3">
              <p className="text-card-title mb-1" style={{ color: 'var(--text-3)' }}>เกินกำหนด</p>
              <p className="text-lg font-bold text-red-400">{f(overdue.reduce((s, p) => s + p.amount, 0))}</p>
              <p className="text-xs mt-0.5" style={{ color: 'var(--text-3)' }}>{overdue.length} งวด</p>
            </div>
            <div className="ds-card p-3">
              <p className="text-card-title mb-1" style={{ color: 'var(--text-3)' }}>รับแล้ว</p>
              <p className="text-lg font-bold text-green-400">{f(paidPayments.reduce((s, p) => s + (p.paid_amount || 0), 0))}</p>
              <p className="text-xs mt-0.5" style={{ color: 'var(--text-3)' }}>{paidPayments.length} งวด</p>
            </div>
          </div>
          <div className="flex gap-1 rounded-[11px] p-1 w-fit" style={{ background: 'var(--hover-bg)', border: '1px solid var(--divider)' }}>
            {[
              { key: 'outstanding', label: `ค้างชำระ (${outstanding.length})` },
              { key: 'paid', label: `ชำระแล้ว (${paidPayments.length})` },
              { key: 'all', label: 'ทั้งหมด' },
            ].map(t => (
              <button key={t.key} onClick={() => setPayTab(t.key as any)}
                className="px-3 py-1.5 rounded-[8px] text-xs font-semibold transition-colors"
                style={{ background: payTab === t.key ? 'var(--accent)' : 'transparent', color: payTab === t.key ? '#fff' : 'var(--text-2)' }}>
                {t.label}
              </button>
            ))}
          </div>
          <div className="ds-card overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr style={{ borderBottom: '1px solid var(--divider)' }}>
                  {['ลูกค้า / ห้อง','งวด','กำหนดชำระ','ยอด','ชำระแล้ว','สถานะ'].map(h => (
                    <th key={h} className="text-left px-4 py-3 text-xs font-semibold" style={{ color: 'var(--text-3)' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {payBase.length === 0 ? (
                  <tr><td colSpan={6} className="text-center py-10 text-sm" style={{ color: 'var(--text-3)' }}>ไม่มีรายการ</td></tr>
                ) : payBase.map((p, i) => {
                  const st = PAY_STATUS.find(s => s.value === p.status) || PAY_STATUS[0]
                  const isOD = p.status !== 'paid' && p.due_date && p.due_date < today
                  return (
                    <tr key={p.id} style={{ borderBottom: '1px solid var(--divider)', background: isOD ? 'rgba(239,68,68,0.04)' : i % 2 ? 'var(--hover-bg)' : 'transparent' }}>
                      <td className="px-4 py-3">
                        <p className="text-sm font-semibold" style={{ color: 'var(--text-1)' }}>{(p as any).jobs?.customer_name || '—'}</p>
                        <p className="text-xs" style={{ color: 'var(--accent)' }}>{(p as any).jobs?.room_no}</p>
                      </td>
                      <td className="px-4 py-3 text-sm" style={{ color: 'var(--text-2)' }}>{p.installment_name || `งวด ${p.installment_no}`}</td>
                      <td className="px-4 py-3 text-sm" style={{ color: isOD ? '#f87171' : 'var(--text-2)' }}>{dateStr(p.due_date)}</td>
                      <td className="px-4 py-3 font-semibold text-right" style={{ color: 'var(--text-1)' }}>{f(p.amount)}</td>
                      <td className="px-4 py-3 text-right">
                        {p.paid_amount > 0 ? <span className="text-sm font-semibold text-green-400">{f(p.paid_amount)}</span> : <span style={{ color: 'var(--text-3)' }}>—</span>}
                      </td>
                      <td className="px-4 py-3"><span className={`inline-block px-2 py-0.5 rounded text-xs ${st.color}`}>{st.label}</span></td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ── Modal: Expense ────────────────────────────────── */}
      <Modal open={entryOpen} onClose={() => setEntryOpen(false)} title={editingEntry ? 'แก้ไขรายจ่าย' : 'เพิ่มรายจ่าย'}>
        <div className="grid grid-cols-2 gap-4">
          <Select label="หมวด *" value={entryForm.category}
            onChange={e => setEntryForm({ ...entryForm, category: e.target.value })}
            options={[{ value: '', label: '— เลือกหมวด —' }, ...EXPENSE_CATS.map(c => ({ value: c, label: c }))]} />
          <Input label="จำนวนเงิน (บาท) *" type="number" value={entryForm.amount} onChange={e => setEntryForm({ ...entryForm, amount: Number(e.target.value) })} />
          <div className="col-span-2">
            <Input label="วันที่ *" type="date" value={entryForm.entry_date} onChange={e => setEntryForm({ ...entryForm, entry_date: e.target.value })} />
          </div>
          <div className="col-span-2">
            <Input label="รายละเอียด" value={entryForm.description} onChange={e => setEntryForm({ ...entryForm, description: e.target.value })} placeholder="เช่น เงินเดือนพนักงาน ก.ค. 68" />
          </div>
          <div className="col-span-2">
            <Input label="อ้างอิง" value={entryForm.ref_id} onChange={e => setEntryForm({ ...entryForm, ref_id: e.target.value })} placeholder="ไม่บังคับ" />
          </div>
        </div>
        {saveError && (
          <div className="flex items-center gap-2 mt-3 p-3 rounded-[11px] text-xs text-red-400" style={{ background: 'rgba(239,68,68,0.1)' }}>
            <AlertCircle size={14} />{saveError}
          </div>
        )}
        <div className="flex justify-end gap-3 mt-5">
          <button onClick={() => setEntryOpen(false)} className="px-4 py-2 text-sm" style={{ color: 'var(--text-3)' }}>ยกเลิก</button>
          <button onClick={saveEntry} disabled={saving || !entryForm.category || !entryForm.amount}
            className="px-4 py-2 text-sm rounded-full text-white disabled:opacity-50" style={{ background: 'var(--accent)' }}>
            {saving ? 'กำลังบันทึก...' : 'บันทึก'}
          </button>
        </div>
      </Modal>

      {/* ── Tab: Entry ───────────────────────────────────── */}
      {tab === 'entry' && (() => {
        const entryProjects = Array.from(new Map(entryJobs.map(j => [j.project_id, (j.projects as any)?.name || 'ไม่ระบุ'])))
          .sort((a, b) => a[1].localeCompare(b[1], 'th'))
        const visibleJobs = entryProjectFilter
          ? entryJobs.filter(j => j.project_id === entryProjectFilter)
          : entryJobs
        const changedIds = new Set(entryJobs.filter(j => {
          const d = entryDrafts[j.id]
          if (!d) return false
          return (
            d.revenue_ex_vat !== (j.revenue_ex_vat != null ? String(j.revenue_ex_vat) : '') ||
            d.revenue_inc_vat !== (j.revenue_inc_vat != null ? String(j.revenue_inc_vat) : '') ||
            d.cost !== (j.cost != null ? String(j.cost) : '') ||
            d.actual_deliver_date !== (j.actual_deliver_date || '')
          )
        }).map(j => j.id))

        const setCellVal = (jobId: string, field: keyof EntryDraft, val: string) => {
          setEntryDrafts(prev => ({ ...prev, [jobId]: { ...prev[jobId], [field]: val } }))
        }

        return (
          <div className="space-y-4">
            {/* toolbar */}
            <div className="flex items-center gap-3 flex-wrap">
              <select value={entryProjectFilter} onChange={e => setEntryProjectFilter(e.target.value)}
                className="field-input" style={{ width: 'auto' }}>
                <option value="">ทุกโครงการ ({entryJobs.length} งาน)</option>
                {entryProjects.map(([id, name]) => (
                  <option key={id} value={id}>{name} ({entryJobs.filter(j => j.project_id === id).length})</option>
                ))}
              </select>

              <div className="ml-auto flex items-center gap-3">
                {changedIds.size > 0 && (
                  <span className="text-xs px-3 py-1.5 rounded-lg font-semibold"
                    style={{ background: 'rgba(251,191,36,0.12)', color: '#fbbf24', border: '1px solid rgba(251,191,36,0.3)' }}>
                    มีการเปลี่ยนแปลง {changedIds.size} แถว
                  </span>
                )}
                {entrySaveMsg && (
                  <span className="text-xs" style={{ color: changedIds.size === 0 ? '#4ade80' : 'var(--text-3)' }}>{entrySaveMsg}</span>
                )}
                <button onClick={() => { load(); setEntrySaveMsg('') }}
                  className="flex items-center gap-1.5 px-3 py-2 rounded-[8px] text-xs"
                  style={{ background: 'var(--hover-bg)', color: 'var(--text-2)', border: '1px solid var(--divider)' }}>
                  <RotateCcw size={13} />รีเซ็ต
                </button>
                <button onClick={bulkSaveEntry} disabled={entrySaving || changedIds.size === 0}
                  className="flex items-center gap-2 px-4 py-2 rounded-full text-sm font-semibold text-white disabled:opacity-40"
                  style={{ background: 'var(--accent-green)' }}>
                  <Save size={14} />{entrySaving ? 'กำลังบันทึก...' : `บันทึกทั้งหมด${changedIds.size > 0 ? ` (${changedIds.size})` : ''}`}
                </button>
              </div>
            </div>

            {/* table */}
            <div className="rounded-[18px] overflow-x-auto" style={{ background: 'var(--card-bg)', border: '1px solid var(--divider)' }}>
              <table className="w-full text-sm" style={{ minWidth: 780 }}>
                <thead>
                  <tr style={{ borderBottom: '1px solid var(--divider)', background: 'var(--hover-bg)' }}>
                    {['ลูกค้า / ห้อง', 'โครงการ', 'สถานะ', 'มูลค่า (ex.VAT)', 'มูลค่า (inc.VAT)', 'ต้นทุน', 'วันส่งมอบจริง'].map(h => (
                      <th key={h} className="text-left px-4 py-3 text-xs font-semibold whitespace-nowrap" style={{ color: 'var(--text-3)' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {visibleJobs.map((j, i) => {
                    const d = entryDrafts[j.id] || { revenue_ex_vat: '', revenue_inc_vat: '', cost: '', actual_deliver_date: '' }
                    const isDirty = changedIds.has(j.id)
                    return (
                      <tr key={j.id}
                        style={{
                          borderBottom: '1px solid var(--divider)',
                          background: isDirty ? 'rgba(251,191,36,0.05)' : i % 2 ? 'var(--hover-bg)' : 'transparent',
                          borderLeft: isDirty ? '3px solid #fbbf24' : '3px solid transparent',
                        }}>
                        <td className="px-4 py-2.5">
                          <p className="font-semibold text-xs" style={{ color: 'var(--text-1)' }}>{j.customer_name}</p>
                          <p className="text-[11px]" style={{ color: 'var(--accent)' }}>ห้อง {j.room_no}</p>
                        </td>
                        <td className="px-4 py-2.5 text-xs" style={{ color: 'var(--text-3)' }}>
                          {(j.projects as any)?.name || '—'}
                        </td>
                        <td className="px-4 py-2.5">
                          <span className="text-[11px] px-2 py-0.5 rounded-full"
                            style={{
                              background: j.working_status === 'ส่งมอบแล้ว' ? 'rgba(74,222,128,0.12)' : 'rgba(251,191,36,0.12)',
                              color: j.working_status === 'ส่งมอบแล้ว' ? '#4ade80' : '#fbbf24',
                            }}>
                            {j.working_status}
                          </span>
                        </td>
                        {(['revenue_ex_vat', 'revenue_inc_vat', 'cost'] as const).map(field => (
                          <td key={field} className="px-4 py-2">
                            <input
                              type="number"
                              value={d[field]}
                              onChange={e => setCellVal(j.id, field, e.target.value)}
                              placeholder="—"
                              className="w-full rounded-lg px-2.5 py-1.5 text-xs text-right focus:outline-none focus:ring-1"
                              style={{
                                background: 'var(--input-bg)',
                                border: `1px solid ${isDirty && d[field] !== (j[field] != null ? String(j[field]) : '') ? 'rgba(251,191,36,0.5)' : 'var(--divider)'}`,
                                color: 'var(--text-1)',
                                minWidth: 110,
                              }}
                            />
                          </td>
                        ))}
                        <td className="px-4 py-2">
                          <input
                            type="date"
                            value={d.actual_deliver_date}
                            onChange={e => setCellVal(j.id, 'actual_deliver_date', e.target.value)}
                            className="rounded-lg px-2.5 py-1.5 text-xs focus:outline-none focus:ring-1"
                            style={{
                              background: 'var(--input-bg)',
                              border: `1px solid ${isDirty && d.actual_deliver_date !== (j.actual_deliver_date || '') ? 'rgba(251,191,36,0.5)' : 'var(--divider)'}`,
                              color: 'var(--text-1)',
                            }}
                          />
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
              {visibleJobs.length === 0 && (
                <div className="py-12 text-center text-sm" style={{ color: 'var(--text-3)' }}>ไม่พบข้อมูล</div>
              )}
            </div>

            <p className="text-xs" style={{ color: 'var(--text-3)' }}>
              * แถวที่แก้ไขจะไฮไลต์สีเหลือง กด "บันทึกทั้งหมด" เพื่อ save พร้อมกัน · กด "รีเซ็ต" เพื่อยกเลิกการเปลี่ยนแปลงทั้งหมด
            </p>
          </div>
        )
      })()}

      {/* Drill-down Modal */}
      {drilldown && (
        <div className="modal-backdrop" onClick={() => setDrilldown(null)}>
          <div className="modal-panel max-h-[80vh] flex flex-col"
            onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h3 className="modal-title">
                {drilldown === 'backlog' ? '📋 งานที่กำลังทำ (Backlog)' : drilldown === 'pending_final' ? '⚑ งวดส่งมอบที่ยังค้าง' : '⚠️ งวดเกินกำหนด'}
              </h3>
              <button onClick={() => setDrilldown(null)} style={{ color: 'var(--text-3)' }}>✕</button>
            </div>
            <div className="overflow-y-auto p-5 space-y-2">
              {drilldown === 'backlog' && activeJobs.map(j => (
                <div key={j.id} className="flex items-center justify-between p-3 rounded-[11px]" style={{ background: 'var(--hover-bg)' }}>
                  <div>
                    <p className="text-sm font-semibold" style={{ color: 'var(--text-1)' }}>{j.customer_name}</p>
                    <p className="text-xs" style={{ color: 'var(--text-3)' }}>{j.room_no} · {(j.projects as any)?.name} · {j.working_status}</p>
                  </div>
                  <span className="text-sm font-bold" style={{ color: '#60a5fa' }}>{fk(j.revenue_ex_vat || 0)}</span>
                </div>
              ))}
              {drilldown === 'pending_final' && activePayments.filter(p => p.status !== 'paid' && (p as any).is_final).map(p => (
                <div key={p.id} className="flex items-center justify-between p-3 rounded-[11px]" style={{ background: 'var(--hover-bg)' }}>
                  <div>
                    <p className="text-sm font-semibold" style={{ color: 'var(--text-1)' }}>{(p as any).jobs?.customer_name || '—'}</p>
                    <p className="text-xs" style={{ color: 'var(--text-3)' }}>{(p as any).jobs?.room_no} · {p.due_date || 'ยังไม่กำหนดวัน'}</p>
                  </div>
                  <span className="text-sm font-bold" style={{ color: '#f87171' }}>{fk(p.amount || 0)}</span>
                </div>
              ))}
              {drilldown === 'overdue' && activePayments.filter(p => p.status !== 'paid' && p.due_date && p.due_date < new Date().toISOString().slice(0, 10)).map(p => (
                <div key={p.id} className="flex items-center justify-between p-3 rounded-[11px]" style={{ background: 'rgba(248,113,113,0.07)' }}>
                  <div>
                    <p className="text-sm font-semibold" style={{ color: 'var(--text-1)' }}>{(p as any).jobs?.customer_name || '—'}</p>
                    <p className="text-xs" style={{ color: '#f87171' }}>{(p as any).jobs?.room_no} · เกินกำหนด {p.due_date}</p>
                  </div>
                  <span className="text-sm font-bold" style={{ color: '#f87171' }}>{fk(p.amount || 0)}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
