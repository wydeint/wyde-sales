'use client'

import { useEffect, useState, useCallback, useMemo } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Plus, Wallet, Pencil, AlertCircle, TrendingUp, TrendingDown, DollarSign, Trash2, Package, Save, RotateCcw } from 'lucide-react'
import Modal from '@/components/ui/Modal'
import PageHeader from '@/components/ui/PageHeader'
import FilterBar from '@/components/ui/FilterBar'
import PeriodPicker from '@/components/ui/PeriodPicker'
import { isOverdueCollection, daysSinceDelivery, CHASE_AFTER_DAYS } from '@/lib/collection'
import { crmStage } from '@/lib/status'
import { fetchAllRows } from '@/lib/fetchAll'
import { getPeriodBounds, MONTHS_TH, beYear, UNIT_LABELS as PERIOD_LABELS, type PeriodUnit } from '@/lib/period'
import { Input, Select } from '@/components/ui/Input'
import { PageSpinner, PageError, EmptyState, TableEmpty } from '@/components/ui/StateUI'

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
  jobs?: { customer_name: string; room_no: string; customer_type: string; work_type: string | null; projects?: { name: string }; sales?: { name: string } }
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
  status: string
  projects?: { name: string }
}

interface Entry {
  id: number
  type: string
  category: string
  amount: number
  entry_date: string
  description: string
  ref_id: string
}


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
const emptyEntry = { type: 'expense', category: '', amount: 0, entry_date: new Date().toISOString().slice(0, 10), description: '', ref_id: '' }

// ── Helpers ────────────────────────────────────────────────
const f = (v: number) => '฿' + Math.round(v || 0).toLocaleString()
const fk = (v: number) => {
  if (v >= 1_000_000) return '฿' + (v / 1_000_000).toFixed(2) + 'M'
  if (v >= 1_000) return '฿' + (v / 1_000).toFixed(0) + 'K'
  return '฿' + Math.round(v || 0).toLocaleString()
}
const dateStr = (d: string) => d ? new Date(d).toLocaleDateString('th-TH', { day: '2-digit', month: 'short', year: '2-digit' }) : '—'

const ld = (d: Date) => `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`
/* Buddhist Era for display; ld() stays Gregorian because it builds ISO keys. */
// ── Page ───────────────────────────────────────────────────
export default function FinancePage() {
  const supabase = createClient()
  const [tab, setTab] = useState<'overview' | 'expense' | 'payments' | 'segment' | 'entry'>('overview')
  const [entryJobs, setEntryJobs] = useState<EntryJob[]>([])
  const [entryDrafts, setEntryDrafts] = useState<Record<string, EntryDraft>>({})
  const [entryProjectFilter, setEntryProjectFilter] = useState('')
  const [entrySaving, setEntrySaving] = useState(false)
  const [entrySaveMsg, setEntrySaveMsg] = useState('')
  const [payments, setPayments] = useState<Payment[]>([])
  const [deliveredJobs, setDeliveredJobs] = useState<DeliveredJob[]>([])
  const [activeJobs, setActiveJobs] = useState<ActiveJob[]>([])
  const [bookedCustomers, setBookedCustomers] = useState<BookedCustomer[]>([])
  const [entries, setEntries] = useState<Entry[]>([])
  const [loading, setLoading] = useState(true)
  const [fetchError, setFetchError] = useState('')
  const [drilldown, setDrilldown] = useState<'backlog' | 'pending_final' | 'overdue' | 'prospects' | null>(null)

  const [period, setPeriod] = useState<PeriodUnit>('month')
  const [offset, setOffset] = useState(0)

  const [entryOpen, setEntryOpen] = useState(false)
  const [editingEntry, setEditingEntry] = useState<Entry | null>(null)
  const [entryForm, setEntryForm] = useState(emptyEntry)
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState('')
  const [payTab, setPayTab] = useState<'outstanding' | 'paid' | 'all'>('outstanding')

  const load = useCallback(async () => {
    setLoading(true); setFetchError('')
    const [{ data: p, error: e1 }, { data: j, error: e2 }, { data: e }, { data: aj }, { data: bc }, { data: ej }] = await Promise.all([
      // 1,173 instalment rows against PostgREST's 1,000 cap: the page was
      // silently dropping 173 of them, and because the sort put NULL due_dates
      // last, the ones dropped were exactly the rows this app creates. Two of
      // the four rooms owing money past the chase window were invisible here
      // while My Deals showed all four.
      fetchAllRows(() => supabase.from('payments')
        .select('id,job_id,installment_no,installment_name,due_date,amount,paid_date,paid_amount,status,notes,jobs(customer_name,room_no,customer_type,work_type,actual_deliver_date,projects(name),sales:users!jobs_sales_id_fkey(name))')
        .order('due_date')),
      supabase.from('jobs')
        .select('id,customer_name,room_no,actual_deliver_date,revenue_inc_vat,revenue_ex_vat,projects(name)')
        .eq('working_status', 'ส่งมอบแล้ว')
        .not('actual_deliver_date', 'is', null)
        .order('actual_deliver_date', { ascending: false }),
      supabase.from('finance_entries').select('*').order('entry_date', { ascending: false }),
      supabase.from('jobs')
        .select('id,customer_name,room_no,revenue_ex_vat,working_status,customer_id,projects(name)')
        .not('working_status', 'in', '("ส่งมอบแล้ว","ยกเลิก")'),
      // Prospects — everything before a booking is committed. These are the left
      // end of the money funnel; จอง and ดำเนินการ come from `jobs` next door.
      supabase.from('customers')
        .select('id,customer_name,budget,booking_date,status,projects(name)')
        .in('status', ['new', 'interested', 'quoted', 'close_pending']),
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
  // Late money is measured from handover, not from due_date — instalments here
  // are triggered by events and almost none carry a due date. See lib/collection.ts.
  const overdue = payments.filter(p => {
    if (p.status === 'paid') return false
    const d = (p as any).jobs?.actual_deliver_date as string | undefined
    return isOverdueCollection({ actual_deliver_date: d, all_paid: false, has_plan: true })
  })

  // ── Pipeline calculations ───────────────────────────────
  // job_ids ที่มี job record แล้ว (แปลงเป็น backlog แล้ว)
  const jobCustomerIds = new Set(activeJobs.map(j => j.customer_id).filter(Boolean))
  const deliveredCustomerIds = new Set(deliveredJobs.map(j => j.id)) // ไม่ใช้ customer_id แต่ job id

  // โอกาสก่อนจอง — เงินที่ยังไม่ผูกมัด แยกตามขั้นเดียวกับหน้า Prospects
  const PRE_BOOK_STAGES: { value: string; label: string }[] = [
    { value: 'new', label: 'ใหม่' },
    { value: 'interested', label: 'สนใจ' },
    { value: 'quoted', label: 'เสนอราคาแล้ว' },
    { value: 'close_pending', label: 'รอปิด' },
  ]
  const prospectRows = PRE_BOOK_STAGES.map(s => {
    const list = bookedCustomers.filter(c => c.status === s.value)
    return {
      ...s,
      count: list.length,
      value: list.reduce((sum, c) => sum + (c.budget || 0), 0),
      noBudget: list.filter(c => !c.budget).length,
    }
  }).filter(r => r.count > 0)
  const prospectCount = prospectRows.reduce((s, r) => s + r.count, 0)
  const prospectValue = prospectRows.reduce((s, r) => s + r.value, 0)
  // Stated openly on the card: a total built from rows where most budgets are
  // blank understates the pipeline, and hiding that would make it look precise.
  const prospectNoBudget = prospectRows.reduce((s, r) => s + r.noBudget, 0)

  // งานกำลังทำ: แยก Reserve (จอง) กับ Backlog (ดำเนินการ)
  const reserveJobs = activeJobs.filter(j => j.working_status === 'จอง')
  const backlogJobs = activeJobs.filter(j => j.working_status !== 'จอง')
  const reserveValue = reserveJobs.reduce((s, j) => s + (j.revenue_ex_vat || 0), 0)
  const backlogValue = backlogJobs.reduce((s, j) => s + (j.revenue_ex_vat || 0), 0)
  const activeJobValue = reserveValue + backlogValue

  // payment pipeline จาก active jobs
  const activeJobIds = new Set(activeJobs.map(j => j.id))
  const activePayments = payments.filter(p => activeJobIds.has(p.job_id))
  const collectedFromActive = activePayments.filter(p => p.status === 'paid').reduce((s, p) => s + (p.paid_amount || 0), 0)
  const pendingFinal = activePayments.filter(p => p.status !== 'paid' && (p as any).is_final).reduce((s, p) => s + (p.amount || 0), 0)
  const pendingAll = activePayments.filter(p => p.status !== 'paid').reduce((s, p) => s + (p.amount || 0), 0)

  // Period income
  const periodDelivered = deliveredJobs.filter(j => j.actual_deliver_date >= start && j.actual_deliver_date <= end)
  const periodPaid = paidPayments.filter(p => p.paid_date >= start && p.paid_date <= end)
  // finance_entries holds both types. Filtering only by date counted every
  // income row as an expense — the forfeited deposits showed up under รายจ่าย
  // and inflated the total.
  const periodExpenses = entries.filter(e => e.type === 'expense' && e.entry_date >= start && e.entry_date <= end)

  const periodDeliveredRevenue = periodDelivered.reduce((s, j) => s + (j.revenue_inc_vat || j.revenue_ex_vat || 0), 0)
  const periodPaidAmount = periodPaid.reduce((s, p) => s + (p.paid_amount || 0), 0)
  const periodExpenseTotal = periodExpenses.reduce((s, e) => s + (e.amount || 0), 0)
  const periodBalance = periodPaidAmount - periodExpenseTotal

  // Previous period for comparison
  const { start: prevStart, end: prevEnd } = getPeriodBounds(period, offset - 1)
  const prevIncome = paidPayments
    .filter(p => p.paid_date >= prevStart && p.paid_date <= prevEnd)
    .reduce((s, p) => s + (p.paid_amount || 0), 0)
  const growthPct = prevIncome > 0 ? ((periodPaidAmount - prevIncome) / prevIncome * 100).toFixed(1) : null

  // Monthly chart (12 months ending this month)
  const monthlyChart = useMemo(() => {
    const now = new Date()
    return Array.from({ length: 12 }, (_, i) => {
      const d = new Date(now.getFullYear(), now.getMonth() - 11 + i, 1)
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
      const received = paidPayments
        .filter(p => p.paid_date?.startsWith(key))
        .reduce((s, p) => s + (p.paid_amount || 0), 0)
      const expense = entries
        .filter(e => e.type === 'expense' && e.entry_date?.startsWith(key))
        .reduce((s, e) => s + (e.amount || 0), 0)
      return { label: `${MONTHS_TH[d.getMonth()]} ${beYear(d.getFullYear()).toString().slice(2)}`, key, received, expense }
    })
  }, [paidPayments, entries])

  const chartMax = Math.max(...monthlyChart.map(m => Math.max(m.received, m.expense)), 1) * 1.2

  const filteredEntries = entries.filter(e => e.type === 'expense' && e.entry_date >= start && e.entry_date <= end)
  const payPeriodBase = payTab === 'outstanding'
    ? outstanding.filter(p => p.due_date >= start && p.due_date <= end)
    : payTab === 'paid'
      ? paidPayments.filter(p => p.paid_date >= start && p.paid_date <= end)
      : payments.filter(p => (p.due_date >= start && p.due_date <= end) || (p.paid_date && p.paid_date >= start && p.paid_date <= end))
  const payBase = payPeriodBase

  if (loading) return <div className="flex items-center justify-center h-full"><PageSpinner /></div>
  if (fetchError) return <PageError message={fetchError} onRetry={load} />

  return (
    <div className="page-content">
      {/* Header */}
      <PageHeader
        title="Finance"
        subtitle="รายรับ = งวดชำระที่รับจริง · รายจ่าย = บันทึกเอง"
        actions={tab === 'expense' && (
          <button onClick={() => { setEditingEntry(null); setEntryForm(emptyEntry); setSaveError(''); setEntryOpen(true) }}
            className="flex items-center gap-2 px-4 py-2 rounded-[8px] text-sm font-semibold text-white"
            style={{ background: 'var(--accent)' }}>
            <Plus size={15} />เพิ่มรายจ่าย
          </button>
        )}
      />

      {/* Tabs */}
      <div className="overflow-x-auto mb-5">
      <div className="tab-group w-fit">
        {[
          { key: 'overview', label: 'รายรับ', icon: DollarSign },
          { key: 'segment', label: 'แยกประเภท', icon: Package },
          { key: 'expense', label: 'รายจ่าย', icon: TrendingDown },
          { key: 'payments', label: 'งวดผ่อนชำระ', icon: Wallet },
        ].map(t => {
          const Icon = t.icon
          return (
            <button key={t.key} onClick={() => setTab(t.key as any)}
              className={`tab-btn ${tab === t.key ? 'active' : ''}`}>
              <Icon size={14} />{t.label}
            </button>
          )
        })}
      </div>
      </div>

      {/* Period selector — always visible regardless of tab */}
      <FilterBar className="mb-5">
        <PeriodPicker unit={period} setUnit={setPeriod} offset={offset} setOffset={setOffset}
          units={['today','week','month','quarter','year']} />
      </FilterBar>

      {/* ── Tab: Overview ─────────────────────────────────── */}
      {tab === 'overview' && (
        <div className="space-y-5">

          {/* KPI Cards */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="ds-card p-4">
              <div className="flex items-center gap-2 mb-2">
                <Wallet size={13} style={{ color: 'var(--accent-blue)' }} />
                <span className="text-card-title" style={{ color: 'var(--text-3)' }}>รายรับ (เงินสด)</span>
              </div>
              <p className="text-kpi-number" style={{ color: 'var(--accent-blue)' }}>{fk(periodPaidAmount)}</p>
              <p className="text-xs mt-1" style={{ color: 'var(--text-3)' }}>{periodPaid.length} งวด</p>
            </div>
            <div className="ds-card p-4">
              <div className="flex items-center gap-2 mb-2">
                <TrendingDown size={13} style={{ color: 'var(--accent-red)' }} />
                <span className="text-card-title" style={{ color: 'var(--text-3)' }}>รายจ่าย</span>
              </div>
              <p className="text-kpi-number" style={{ color: 'var(--accent-red)' }}>{fk(periodExpenseTotal)}</p>
              <p className="text-xs mt-1" style={{ color: 'var(--text-3)' }}>{periodExpenses.length} รายการ</p>
            </div>
            <div className="ds-card p-4">
              <div className="flex items-center gap-2 mb-2">
                <TrendingUp size={13} style={{ color: periodBalance >= 0 ? 'var(--accent-green)' : 'var(--accent-red)' }} />
                <span className="text-card-title" style={{ color: 'var(--text-3)' }}>Balance</span>
              </div>
              <p className="text-kpi-number" style={{ color: periodBalance >= 0 ? 'var(--accent-green)' : 'var(--accent-red)' }}>{fk(periodBalance)}</p>
              <p className="text-xs mt-1" style={{ color: 'var(--text-3)' }}>รายรับ − รายจ่าย</p>
            </div>
            <div className="ds-card p-4">
              <div className="flex items-center gap-2 mb-2">
                <DollarSign size={13} style={{ color: 'var(--text-3)' }} />
                <span className="text-card-title" style={{ color: 'var(--text-3)' }}>รับงวด vs ช่วงก่อน</span>
              </div>
              <p className="text-kpi-number" style={{ color: growthPct ? (Number(growthPct) >= 0 ? 'var(--accent-green)' : 'var(--accent-red)') : 'var(--text-3)' }}>
                {growthPct ? `${Number(growthPct) > 0 ? '+' : ''}${growthPct}%` : '—'}
              </p>
              <p className="text-xs mt-1" style={{ color: 'var(--text-3)' }}>
                {growthPct ? `vs ${PERIOD_LABELS[period]}ก่อน (${fk(prevIncome)})` : `ไม่มีข้อมูล${PERIOD_LABELS[period]}ก่อน`}
              </p>
            </div>
          </div>

          {/* 12-month chart */}
          <div className="ds-card p-5">
            <div className="flex items-center gap-4 mb-4 flex-wrap">
              <h2 className="text-section-title" style={{ color: 'var(--text-1)' }}>รายรับ vs รายจ่าย 12 เดือนล่าสุด</h2>
              <div className="flex gap-4 text-xs">
                <span className="flex items-center gap-1.5" style={{ color: 'var(--text-3)' }}>
                  <span className="w-3 h-2 rounded-sm inline-block" style={{ background: 'var(--accent-blue)' }} />รับงวด
                </span>
                <span className="flex items-center gap-1.5" style={{ color: 'var(--text-3)' }}>
                  <span className="w-3 h-2 rounded-sm inline-block" style={{ background: 'var(--accent-red)' }} />รายจ่าย
                </span>
              </div>
            </div>
            {/* overflow-x:auto forces overflow-y to compute to auto as well, so a
                tooltip drawn above the bars was being clipped by this very box —
                top and bottom both cut off. It cannot escape the scroller, so the
                room is made inside it: the extra height is headroom for the
                tooltip, and items stay bottom-aligned so the bars do not move. */}
            <div className="flex items-end gap-1.5 overflow-x-auto pb-1" style={{ height: '183px', paddingTop: '38px' }}>
              {monthlyChart.map(m => {
                const isCurrentMonth = m.key === today.slice(0, 7)
                return (
                  <div key={m.key} className="flex-shrink-0 flex flex-col items-center gap-0.5 group" style={{ minWidth: '44px' }}>
                    {/* Value labels — income (blue) / expense (red) */}
                    <div style={{ height: '14px', fontSize: '8px', fontWeight: 600, lineHeight: '14px', textAlign: 'center', width: '100%' }}>
                      {m.received > 0 && <span style={{ color: 'var(--accent-blue)' }}>{fk(m.received)}</span>}
                      {m.received > 0 && m.expense > 0 && <span style={{ color: 'var(--text-3)' }}>/</span>}
                      {m.expense > 0 && <span style={{ color: 'var(--accent-red)' }}>{fk(m.expense)}</span>}
                    </div>
                    <div className="w-full flex gap-0.5 items-end relative" style={{ height: '98px' }}>
                      {/* Received bar */}
                      <div className="flex-1 flex flex-col justify-end" style={{ height: '100%' }}>
                        {m.received > 0 && (
                          <div className="rounded-t-sm" style={{ height: `${(m.received / chartMax) * 100}%`, background: 'var(--accent-blue)' }} />
                        )}
                      </div>
                      {/* Expense bar */}
                      <div className="flex-1 flex flex-col justify-end" style={{ height: '100%' }}>
                        {m.expense > 0 && (
                          <div className="rounded-t-sm" style={{ height: `${(m.expense / chartMax) * 100}%`, background: 'var(--accent-red)', opacity: 0.75 }} />
                        )}
                      </div>
                      {/* Tooltip on hover (desktop).
                          --card-bg is 55% transparent, so the value labels behind
                          the tooltip showed straight through it and the two sets of
                          digits overlapped. --panel-bg is opaque; the accent colours
                          stay readable on it in both themes, which pure black would
                          not allow. */}
                      {(m.received > 0 || m.expense > 0) && (
                        <div className="absolute bottom-full mb-1 left-1/2 -translate-x-1/2 opacity-0 group-hover:opacity-100 transition-opacity z-10 text-micro whitespace-nowrap px-2 py-1 rounded-[8px] shadow-lg pointer-events-none"
                          style={{ background: 'var(--panel-bg)', border: '1px solid var(--card-border)', color: 'var(--text-1)' }}>
                          {m.received > 0 && <div style={{ color: 'var(--accent-blue)' }}>รับ {fk(m.received)}</div>}
                          {m.expense > 0 && <div style={{ color: 'var(--accent-red)' }}>จ่าย {fk(m.expense)}</div>}
                        </div>
                      )}
                    </div>
                    <p className="text-micro whitespace-nowrap"
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

              {/* 1. โอกาสก่อนจอง — the left end of the funnel.
                  This slot used to hold "booked customers that have no job record
                  yet", which is a data-completeness check, not money, and it
                  double-counted the จอง card beside it from a different table.
                  What was missing from a finance page was the stage before a
                  booking exists: money that might still arrive. Same stage names
                  as Prospects, so nothing new has to be learned. */}
              <div className="rounded-[11px] p-4 flex flex-col" style={{ background: 'var(--hover-bg)' }}>
                <div className="flex items-center justify-between">
                  <p className="text-xs font-semibold" style={{ color: 'var(--text-3)' }}>โอกาสก่อนจอง</p>
                  {prospectCount > 0 && (
                    <button onClick={() => setDrilldown('prospects')} className="text-micro hover:underline" style={{ color: 'var(--accent)' }}>ดูรายการ ↗</button>
                  )}
                </div>

                <div className="flex items-baseline gap-2 mt-1">
                  <span className="text-kpi-money" style={{ color: 'var(--accent-blue)' }}>{fk(prospectValue)}</span>
                  <span className="text-xs ml-auto" style={{ color: 'var(--text-2)' }}>{prospectCount} ราย</span>
                </div>

                <div className="space-y-1 mt-2.5 pt-2.5" style={{ borderTop: '1px solid var(--divider)' }}>
                  {prospectRows.map(r => (
                    <div key={r.value} className="flex items-center justify-between">
                      <span className="text-micro" style={{ color: 'var(--text-2)' }}>{r.label}</span>
                      <span className="text-micro" style={{ color: 'var(--text-3)' }}>
                        {r.count} ราย
                        <span className="ml-2 font-semibold" style={{ color: 'var(--text-1)' }}>{r.value > 0 ? fk(r.value) : '—'}</span>
                      </span>
                    </div>
                  ))}
                </div>

                {prospectNoBudget > 0 && (
                  <p className="text-micro mt-2 pt-2" style={{ color: 'var(--accent-amber)', borderTop: '1px solid var(--divider)' }}>
                    ⚠ {prospectNoBudget} รายยังไม่ระบุงบ — ยอดจริงสูงกว่านี้
                  </p>
                )}
              </div>

              {/* 2. Active Job Backlog — แยก Reserve / Backlog */}
              <div className="rounded-[11px] p-4 space-y-3" style={{ background: 'var(--hover-bg)' }}>
                <div className="flex items-center justify-between">
                  <p className="text-xs font-semibold" style={{ color: 'var(--text-3)' }}>งานที่กำลังทำ</p>
                  <button onClick={() => setDrilldown('backlog')} className="text-micro hover:underline" style={{ color: 'var(--accent)' }}>ดูรายการ ↗</button>
                </div>
                <div className="space-y-2.5">
                  {/* Reserve */}
                  <div className="rounded-[8px] px-3 py-2 space-y-1" style={{ background: 'var(--card-bg)', border: '1px solid var(--divider)' }}>
                    <div className="flex items-center justify-between">
                      <span className="text-micro font-bold uppercase tracking-wide" style={{ color: 'var(--accent-amber)' }}>Reserve (จอง)</span>
                      <span className="text-xs font-bold" style={{ color: 'var(--accent-amber)' }}>{reserveJobs.length} งาน</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-micro" style={{ color: 'var(--text-3)' }}>มูลค่ารวม</span>
                      <span className="text-xs font-semibold" style={{ color: 'var(--text-1)' }}>{fk(reserveValue)}</span>
                    </div>
                  </div>
                  {/* Backlog */}
                  <div className="rounded-[8px] px-3 py-2 space-y-1" style={{ background: 'var(--card-bg)', border: '1px solid var(--divider)' }}>
                    <div className="flex items-center justify-between">
                      <span className="text-micro font-bold uppercase tracking-wide" style={{ color: 'var(--accent-blue)' }}>Backlog (ดำเนินการ)</span>
                      <span className="text-xs font-bold" style={{ color: 'var(--accent-blue)' }}>{backlogJobs.length} งาน</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-micro" style={{ color: 'var(--text-3)' }}>มูลค่ารวม</span>
                      <span className="text-xs font-semibold" style={{ color: 'var(--text-1)' }}>{fk(backlogValue)}</span>
                    </div>
                  </div>
                  {/* Collection status */}
                  <div className="pt-1 space-y-1.5" style={{ borderTop: '1px solid var(--divider)' }}>
                    <div className="flex justify-between items-center">
                      <span className="text-micro" style={{ color: 'var(--accent-green)' }}>รับชำระแล้ว</span>
                      <span className="text-xs font-semibold" style={{ color: 'var(--accent-green)' }}>{fk(collectedFromActive)}</span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-micro" style={{ color: 'var(--accent-amber)' }}>ค้างรับทั้งหมด</span>
                      <span className="text-xs font-semibold" style={{ color: 'var(--accent-amber)' }}>{fk(pendingAll)}</span>
                    </div>
                    {activeJobValue > 0 && (
                      <div className="h-1.5 rounded-full mt-1" style={{ background: 'var(--divider)' }}>
                        <div className="h-full rounded-full" style={{ width: `${Math.min((collectedFromActive / activeJobValue) * 100, 100)}%`, background: 'var(--accent-green)' }} />
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {/* 3. Outstanding Final Installments */}
              <div className="rounded-[11px] p-4 space-y-3" style={{ background: 'var(--hover-bg)' }}>
                <p className="text-xs font-semibold" style={{ color: 'var(--text-3)' }}>งวดรอเก็บ</p>
                <div className="space-y-2">
                  <button className="flex justify-between items-center w-full text-left hover:underline" onClick={() => setDrilldown('pending_final')}>
                    <span className="text-xs" style={{ color: 'var(--accent-orange)' }}>งวดส่งมอบ (ค้าง) ↗</span>
                    <span className="text-sm font-bold" style={{ color: 'var(--accent-orange)' }}>{fk(pendingFinal)}</span>
                  </button>
                  <div className="flex justify-between items-center">
                    <span className="text-xs" style={{ color: 'var(--text-2)' }}>งวดอื่นๆ ค้าง</span>
                    <span className="text-sm font-bold" style={{ color: 'var(--text-2)' }}>{fk(pendingAll - pendingFinal)}</span>
                  </div>
                  <div className="flex justify-between items-center pt-1" style={{ borderTop: '1px solid var(--divider)' }}>
                    <span className="text-xs" style={{ color: 'var(--text-3)' }}>เกินกำหนด</span>
                    <span className="text-xs font-semibold" style={{ color: 'var(--accent-red)' }}>
                      {fk(activePayments.filter(p => p.status !== 'paid' && p.due_date && p.due_date < today).reduce((s, p) => s + (p.amount || 0), 0))}
                    </span>
                  </div>
                </div>
              </div>

            </div>
          </div>

          {/* Period detail: paid installments */}
          {periodPaid.length > 0 ? (() => {
            // group by sales name
            const bySales = new Map<string, typeof periodPaid>()
            for (const p of periodPaid) {
              const salesName = (p as any).jobs?.sales?.name || 'ไม่ระบุ Sales'
              if (!bySales.has(salesName)) bySales.set(salesName, [])
              bySales.get(salesName)!.push(p)
            }
            const salesGroups = [...bySales.entries()].sort((a, b) => {
              const sumA = a[1].reduce((s, p) => s + (p.paid_amount || 0), 0)
              const sumB = b[1].reduce((s, p) => s + (p.paid_amount || 0), 0)
              return sumB - sumA
            })
            return (
              <div className="ds-card p-5">
                {/* Header + total sum */}
                <div className="flex items-start justify-between mb-4">
                  <div>
                    <h2 className="text-section-title" style={{ color: 'var(--text-1)' }}>รายการงวดชำระใน{label}</h2>
                    <p className="text-xs mt-0.5" style={{ color: 'var(--text-3)' }}>{periodPaid.length} งวด · {salesGroups.length} Sales</p>
                  </div>
                  <div className="text-right">
                    <p className="text-xs mb-0.5" style={{ color: 'var(--text-3)' }}>รายรับรวม</p>
                    <p className="text-kpi-number" style={{ color: 'var(--accent-blue)' }}>{f(periodPaidAmount)}</p>
                  </div>
                </div>

                {/* Groups by Sales */}
                <div className="space-y-4">
                  {salesGroups.map(([salesName, payments]) => {
                    const groupTotal = payments.reduce((s, p) => s + (p.paid_amount || 0), 0)
                    const pct = periodPaidAmount > 0 ? (groupTotal / periodPaidAmount * 100).toFixed(0) : '0'
                    return (
                      <div key={salesName}>
                        {/* Sales header */}
                        <div className="flex items-center justify-between mb-2 pb-1.5" style={{ borderBottom: '1px solid var(--divider)' }}>
                          <div className="flex items-center gap-2">
                            <div className="w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold"
                              style={{ background: 'var(--active-bg)', color: 'var(--accent)' }}>
                              {salesName[0]}
                            </div>
                            <span className="text-sm font-semibold" style={{ color: 'var(--text-1)' }}>{salesName}</span>
                            <span className="text-xs px-1.5 py-0.5 rounded-[4px]" style={{ background: 'var(--hover-bg)', color: 'var(--text-3)' }}>
                              {payments.length} งวด
                            </span>
                          </div>
                          <div className="text-right">
                            <span className="text-sm font-bold" style={{ color: 'var(--accent-blue)' }}>{f(groupTotal)}</span>
                            <span className="text-xs ml-1.5" style={{ color: 'var(--text-3)' }}>{pct}%</span>
                          </div>
                        </div>
                        {/* Payment rows */}
                        <div className="space-y-1.5 pl-2">
                          {payments.map(p => (
                            <div key={p.id} className="flex items-center justify-between py-1.5 px-2 rounded-[8px]" style={{ background: 'var(--hover-bg)' }}>
                              <div>
                                <p className="text-xs font-semibold" style={{ color: 'var(--text-1)' }}>{(p as any).jobs?.customer_name || '—'}</p>
                                <p className="text-label" style={{ color: 'var(--text-3)' }}>
                                  {(p as any).jobs?.room_no} · {p.installment_name || `งวด ${p.installment_no}`} · {dateStr(p.paid_date)}
                                </p>
                              </div>
                              <p className="text-sm font-bold ml-3 flex-shrink-0" style={{ color: 'var(--accent-blue)' }}>{f(p.paid_amount)}</p>
                            </div>
                          ))}
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
            )
          })() : (
            <div className="ds-card"><EmptyState icon={Wallet} message={`ไม่มีงวดรับชำระใน${label}`} /></div>
          )}
        </div>
      )}

      {/* ── Tab: Segment ─────────────────────────────────── */}
      {tab === 'segment' && (() => {
        const isRpt = (wt: string | null | undefined) => wt === 'RPT'
        const seg = periodPaid
        const totalCash = seg.reduce((s, p) => s + (p.paid_amount || 0), 0)

        const calcCash = (payments: typeof periodPaid, custType: string, rpt: boolean) =>
          payments.filter(p => p.jobs?.customer_type === custType && isRpt(p.jobs?.work_type) === rpt)
                  .reduce((s, p) => s + (p.paid_amount || 0), 0)
        const calcCount = (payments: typeof periodPaid, custType: string, rpt: boolean) =>
          payments.filter(p => p.jobs?.customer_type === custType && isRpt(p.jobs?.work_type) === rpt).length

        const b2cRpt  = calcCash(seg, 'B2C', true)
        const b2cNrpt = calcCash(seg, 'B2C', false)
        const b2bRpt  = calcCash(seg, 'B2B', true)
        const b2bNrpt = calcCash(seg, 'B2B', false)
        const b2cTotal = b2cRpt + b2cNrpt
        const b2bTotal = b2bRpt + b2bNrpt

        const workTypeBreakdown = (payments: typeof periodPaid, custType: string) => {
          const map: Record<string, number> = {}
          payments.filter(p => p.jobs?.customer_type === custType && !isRpt(p.jobs?.work_type)).forEach(p => {
            const wt = p.jobs?.work_type || 'อื่นๆ'
            map[wt] = (map[wt] || 0) + (p.paid_amount || 0)
          })
          return Object.entries(map).sort((a, b) => b[1] - a[1])
        }

        const CUST_COLORS = { B2C: 'var(--chart-1)', B2B: 'var(--chart-2)' }
        const RPT_COLOR = 'var(--accent-green)'
        const NRPT_COLOR = 'var(--accent-amber)'

        return (
          <div className="space-y-6">
            {/* Total KPI */}
            <div className="rounded-[18px] p-5" style={{ background: 'color-mix(in srgb, var(--accent) 7.0%, transparent)', border: '1px solid color-mix(in srgb, var(--accent) 25%, transparent)' }}>
              <p className="text-label-upper mb-1" style={{ color: 'var(--accent)' }}>เงินสดรับรวมทั้งบริษัท ({label})</p>
              <p className="text-kpi-number" style={{ color: 'var(--text-1)' }}>{fk(totalCash)}</p>
              <p className="text-xs mt-1" style={{ color: 'var(--text-3)' }}>ยอดรับจริง (paid_date) ในช่วงเวลานี้</p>
            </div>

            {/* B2C + B2B side-by-side */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {(['B2C', 'B2B'] as const).map(ct => {
                const total = ct === 'B2C' ? b2cTotal : b2bTotal
                const rpt = ct === 'B2C' ? b2cRpt : b2bRpt
                const nrpt = ct === 'B2C' ? b2cNrpt : b2bNrpt
                const color = CUST_COLORS[ct]
                const nrptDetails = workTypeBreakdown(seg, ct)
                const pct = totalCash > 0 ? (total / totalCash * 100).toFixed(1) : '0'
                const count = calcCount(seg, ct, true) + calcCount(seg, ct, false)
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
                          <p className="text-xs" style={{ color: 'var(--text-3)' }}>{pct}% · {count} รายการ</p>
                        </div>
                      </div>
                      <p className="text-kpi-number" style={{ color }}>{fk(total)}</p>
                    </div>

                    {/* Stacked bar */}
                    {total > 0 && (
                      <div className="flex h-2.5 rounded-full overflow-hidden" style={{ background: 'var(--divider)' }}>
                        <div style={{ width: `${(rpt / total) * 100}%`, background: RPT_COLOR, transition: 'width 0.4s' }} />
                        <div style={{ width: `${(nrpt / total) * 100}%`, background: NRPT_COLOR, transition: 'width 0.4s' }} />
                      </div>
                    )}

                    {/* RPT */}
                    <div className="rounded-[11px] p-4 space-y-1" style={{ background: 'var(--hover-bg)' }}>
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <span className="w-2.5 h-2.5 rounded-full" style={{ background: RPT_COLOR }} />
                          <span className="text-sm font-semibold" style={{ color: 'var(--text-1)' }}>RPT — Related Party</span>
                        </div>
                        <span className="font-bold text-sm" style={{ color: RPT_COLOR }}>{fk(rpt)}</span>
                      </div>
                      {total > 0 && <div className="w-full h-1 rounded-full" style={{ background: 'var(--divider)' }}>
                        <div style={{ width: `${(rpt / total) * 100}%`, background: RPT_COLOR, height: '100%', borderRadius: 9999 }} />
                      </div>}
                      <p className="text-micro text-right" style={{ color: RPT_COLOR }}>{total > 0 ? ((rpt / total) * 100).toFixed(1) : 0}%</p>
                    </div>

                    {/* N-RPT */}
                    <div className="rounded-[11px] p-4 space-y-2" style={{ background: 'var(--hover-bg)' }}>
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <span className="w-2.5 h-2.5 rounded-full" style={{ background: NRPT_COLOR }} />
                          <span className="text-sm font-semibold" style={{ color: 'var(--text-1)' }}>N-RPT — Non-Related Party</span>
                        </div>
                        <span className="font-bold text-sm" style={{ color: NRPT_COLOR }}>{fk(nrpt)}</span>
                      </div>
                      {total > 0 && <div className="w-full h-1 rounded-full" style={{ background: 'var(--divider)' }}>
                        <div style={{ width: `${(nrpt / total) * 100}%`, background: NRPT_COLOR, height: '100%', borderRadius: 9999 }} />
                      </div>}
                      <p className="text-micro text-right" style={{ color: NRPT_COLOR }}>{total > 0 ? ((nrpt / total) * 100).toFixed(1) : 0}%</p>
                      {nrptDetails.length > 0 && (
                        <div className="pt-2 space-y-1.5" style={{ borderTop: '1px solid var(--divider)' }}>
                          {nrptDetails.map(([wt, val]) => (
                            <div key={wt} className="flex items-center justify-between">
                              <span className="text-micro" style={{ color: 'var(--text-3)' }}>{wt}</span>
                              <div className="flex items-center gap-2">
                                <div className="w-16 h-1 rounded-full" style={{ background: 'var(--divider)' }}>
                                  <div style={{ width: nrpt > 0 ? `${(val / nrpt) * 100}%` : '0%', background: NRPT_COLOR, height: '100%', borderRadius: 9999, opacity: 0.7 }} />
                                </div>
                                <span className="text-micro font-semibold" style={{ color: 'var(--text-2)' }}>{fk(val)}</span>
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
                <p className="text-section-title" style={{ color: 'var(--text-1)' }}>ตารางสรุปเงินสดรับ ({label})</p>
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
                          {totalCash > 0 ? ((total / totalCash) * 100).toFixed(1) : 0}%
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
                    <td className="px-5 py-3 text-right text-sm font-bold" style={{ color: 'var(--text-1)' }}>{fk(totalCash)}</td>
                    <td className="px-5 py-3 text-right text-xs" style={{ color: 'var(--text-3)' }}>100%</td>
                  </tr>
                </tfoot>
              </table>
            </div>

            {seg.length === 0 && (
              <EmptyState icon={TrendingUp} message={`ไม่พบข้อมูลในช่วง${label}`} />
            )}
          </div>
        )
      })()}

      {/* ── Tab: Expense ──────────────────────────────────── */}
      {tab === 'expense' && (
        <div className="space-y-4">
          <div className="flex items-center gap-3">
            <p className="text-xs" style={{ color: 'var(--text-3)' }}>ช่วง: {label}</p>
            <div className="ml-auto ds-card px-4 py-2 text-sm">
              รวม <span className="font-bold ml-1" style={{ color: 'var(--accent-red)' }}>{f(filteredEntries.reduce((s, e) => s + e.amount, 0))}</span>
            </div>
          </div>
          <div className="ds-card tbl-scroll">
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
                  <TableEmpty colSpan={6} icon={TrendingDown} message="ยังไม่มีรายจ่าย" sub='กด "เพิ่มรายจ่าย" เพื่อเริ่มต้น' />
                ) : filteredEntries.map((e, i) => (
                  <tr key={e.id} style={{ borderBottom: '1px solid var(--divider)', background: i % 2 ? 'var(--hover-bg)' : 'transparent' }}>
                    <td className="px-4 py-3 text-xs whitespace-nowrap" style={{ color: 'var(--text-2)' }}>{dateStr(e.entry_date)}</td>
                    <td className="px-4 py-3 text-xs" style={{ color: 'var(--text-2)' }}>{e.category}</td>
                    <td className="px-4 py-3" style={{ color: 'var(--text-1)' }}>{e.description || '—'}</td>
                    <td className="px-4 py-3 text-xs font-mono" style={{ color: 'var(--text-3)' }}>{e.ref_id || '—'}</td>
                    <td className="px-4 py-3 font-semibold text-right" style={{ color: 'var(--accent-red)' }}>{f(e.amount)}</td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <button onClick={() => { setEditingEntry(e); setEntryForm({ type: e.type || 'expense', category: e.category, amount: e.amount, entry_date: e.entry_date, description: e.description || '', ref_id: e.ref_id || '' }); setSaveError(''); setEntryOpen(true) }}
                          style={{ color: 'var(--text-3)' }}><Pencil size={13} /></button>
                        <button onClick={() => deleteEntry(e.id)} className="text-danger opacity-50 hover:opacity-100 transition-opacity">
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
            <div className="flex items-center gap-3 p-3 rounded-[11px] text-sm" style={{ background: 'color-mix(in srgb, var(--accent-red) 10%, transparent)', border: '1px solid color-mix(in srgb, var(--accent-red) 30%, transparent)', color: 'var(--accent-red)' }}>
              <AlertCircle size={15} />มี {overdue.length} งวดค้างเก็บเกิน {CHASE_AFTER_DAYS} วันหลังส่งมอบ รวม {f(overdue.reduce((s, p) => s + p.amount, 0))}
            </div>
          )}
          <div className="grid grid-cols-3 gap-3">
            <div className="ds-card p-3">
              <p className="text-card-title mb-1" style={{ color: 'var(--text-3)' }}>ค้างรับ ({label})</p>
              <p className="text-kpi-number text-value">{f(outstanding.filter(p => p.due_date >= start && p.due_date <= end).reduce((s, p) => s + p.amount, 0))}</p>
              <p className="text-xs mt-0.5" style={{ color: 'var(--text-3)' }}>{outstanding.filter(p => p.due_date >= start && p.due_date <= end).length} งวด</p>
            </div>
            <div className="ds-card p-3">
              <p className="text-card-title mb-1" style={{ color: 'var(--text-3)' }}>ค้างเก็บ {CHASE_AFTER_DAYS}+ วัน</p>
              <p className="text-kpi-number text-danger">{f(overdue.reduce((s, p) => s + p.amount, 0))}</p>
              <p className="text-xs mt-0.5" style={{ color: 'var(--text-3)' }}>{overdue.length} งวด</p>
            </div>
            <div className="ds-card p-3">
              <p className="text-card-title mb-1" style={{ color: 'var(--text-3)' }}>รับแล้ว ({label})</p>
              <p className="text-kpi-number text-success">{f(paidPayments.filter(p => p.paid_date >= start && p.paid_date <= end).reduce((s, p) => s + (p.paid_amount || 0), 0))}</p>
              <p className="text-xs mt-0.5" style={{ color: 'var(--text-3)' }}>{paidPayments.filter(p => p.paid_date >= start && p.paid_date <= end).length} งวด</p>
            </div>
          </div>
          <div className="tab-group w-fit">
            {[
              { key: 'outstanding', label: `ค้างชำระ (${outstanding.filter(p => p.due_date >= start && p.due_date <= end).length})` },
              { key: 'paid', label: `ชำระแล้ว (${paidPayments.filter(p => p.paid_date >= start && p.paid_date <= end).length})` },
              { key: 'all', label: `ทั้งหมด (${payPeriodBase.length})` },
            ].map(t => (
              <button key={t.key} onClick={() => setPayTab(t.key as any)}
                className={`tab-btn ${payTab === t.key ? 'active' : ''}`}>
                {t.label}
              </button>
            ))}
          </div>
          <div className="ds-card tbl-scroll">
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
                  <TableEmpty colSpan={6} icon={Wallet} message="ไม่มีรายการ" />
                ) : payBase.map((p, i) => {
                  const st = PAY_STATUS.find(s => s.value === p.status) || PAY_STATUS[0]
                  const isOD = p.status !== 'paid' && p.due_date && p.due_date < today
                  return (
                    <tr key={p.id} style={{ borderBottom: '1px solid var(--divider)', background: isOD ? 'color-mix(in srgb, var(--accent-red) 4%, transparent)' : i % 2 ? 'var(--hover-bg)' : 'transparent' }}>
                      <td className="px-4 py-3">
                        <p className="text-sm font-semibold" style={{ color: 'var(--text-1)' }}>{(p as any).jobs?.customer_name || '—'}</p>
                        <p className="text-xs" style={{ color: 'var(--accent)' }}>{(p as any).jobs?.room_no}</p>
                      </td>
                      <td className="px-4 py-3 text-sm" style={{ color: 'var(--text-2)' }}>{p.installment_name || `งวด ${p.installment_no}`}</td>
                      <td className="px-4 py-3 text-sm" style={{ color: isOD ? 'var(--accent-red)' : 'var(--text-2)' }}>{dateStr(p.due_date)}</td>
                      <td className="px-4 py-3 font-semibold text-right" style={{ color: 'var(--text-1)' }}>{f(p.amount)}</td>
                      <td className="px-4 py-3 text-right">
                        {p.paid_amount > 0 ? <span className="text-sm font-semibold text-success">{f(p.paid_amount)}</span> : <span style={{ color: 'var(--text-3)' }}>—</span>}
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
          <div className="flex items-center gap-2 mt-3 p-3 rounded-[11px] text-xs " style={{ background: 'color-mix(in srgb, var(--accent-red) 10%, transparent)', color: 'var(--accent-red)' }}>
            <AlertCircle size={14} />{saveError}
          </div>
        )}
        <div className="flex justify-end gap-3 mt-5">
          <button onClick={() => setEntryOpen(false)} className="px-4 py-2 text-sm" style={{ color: 'var(--text-3)' }}>ยกเลิก</button>
          <button onClick={saveEntry} disabled={saving || !entryForm.category || !entryForm.amount}
            className="px-4 py-2 text-sm rounded-[8px] text-white disabled:opacity-50" style={{ background: 'var(--accent)' }}>
            {saving ? 'กำลังบันทึก...' : 'บันทึก'}
          </button>
        </div>
      </Modal>

      {/* ── Tab: Entry ───────────────────────────────────── */}

      {/* Drill-down Modal */}
      {drilldown && (
        <div className="modal-backdrop" onClick={() => setDrilldown(null)}>
          <div className="modal-panel max-h-[80vh] flex flex-col"
            onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h3 className="modal-title">
                {drilldown === 'backlog' ? '📋 งานที่กำลังทำ (Reserved / Backlog)'
                  : drilldown === 'pending_final' ? '⚑ งวดส่งมอบที่ยังค้าง'
                  : drilldown === 'prospects' ? '◉ โอกาสก่อนจอง'
                  : `⚠️ ค้างเก็บเงินเกิน ${CHASE_AFTER_DAYS} วันหลังส่งมอบ`}
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
                  <span className="text-sm font-bold" style={{ color: 'var(--accent-blue)' }}>{fk(j.revenue_ex_vat || 0)}</span>
                </div>
              ))}
              {drilldown === 'pending_final' && activePayments.filter(p => p.status !== 'paid' && (p as any).is_final).map(p => (
                <div key={p.id} className="flex items-center justify-between p-3 rounded-[11px]" style={{ background: 'var(--hover-bg)' }}>
                  <div>
                    <p className="text-sm font-semibold" style={{ color: 'var(--text-1)' }}>{(p as any).jobs?.customer_name || '—'}</p>
                    <p className="text-xs" style={{ color: 'var(--text-3)' }}>{(p as any).jobs?.room_no} · {p.due_date || 'ยังไม่กำหนดวัน'}</p>
                  </div>
                  <span className="text-sm font-bold" style={{ color: 'var(--accent-red)' }}>{fk(p.amount || 0)}</span>
                </div>
              ))}
              {/* Same rule as the banner and the KPI above — measured from handover,
                  not due_date, which this list still used. */}
              {drilldown === 'overdue' && overdue.map(p => {
                const d = (p as any).jobs?.actual_deliver_date as string | undefined
                return (
                  <div key={p.id} className="flex items-center justify-between p-3 rounded-[11px]" style={{ background: 'color-mix(in srgb, var(--accent-red) 7.0%, transparent)' }}>
                    <div>
                      <p className="text-sm font-semibold" style={{ color: 'var(--text-1)' }}>{(p as any).jobs?.customer_name || '—'}</p>
                      <p className="text-xs" style={{ color: 'var(--accent-red)' }}>{(p as any).jobs?.room_no} · ส่งมอบมาแล้ว {daysSinceDelivery(d)} วัน</p>
                    </div>
                    <span className="text-sm font-bold" style={{ color: 'var(--accent-red)' }}>{fk(p.amount || 0)}</span>
                  </div>
                )
              })}
              {/* Biggest budget first — the ones worth a call today sit at the top.
                  Rows with no budget fall to the bottom and say so, rather than
                  showing ฿0 as though the deal were worthless. */}
              {drilldown === 'prospects' && [...bookedCustomers]
                .sort((a, b) => (b.budget || 0) - (a.budget || 0))
                .map(c => (
                  <div key={c.id} className="flex items-center justify-between p-3 rounded-[11px]" style={{ background: 'var(--hover-bg)' }}>
                    <div className="min-w-0">
                      <p className="text-sm font-semibold truncate" style={{ color: 'var(--text-1)' }}>{c.customer_name}</p>
                      <p className="text-xs truncate" style={{ color: 'var(--text-3)' }}>
                        {crmStage(c.status).label} · {c.projects?.name || '—'}
                      </p>
                    </div>
                    {c.budget ? (
                      <span className="text-sm font-bold flex-shrink-0" style={{ color: 'var(--accent-blue)' }}>{fk(c.budget)}</span>
                    ) : (
                      <span className="text-xs flex-shrink-0" style={{ color: 'var(--accent-amber)' }}>ยังไม่ระบุงบ</span>
                    )}
                  </div>
                ))}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

