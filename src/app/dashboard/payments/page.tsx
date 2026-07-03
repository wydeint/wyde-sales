'use client'

import { useEffect, useState, useCallback, useMemo } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Search, CheckCircle2, Circle, Plus, X, Paperclip, ChevronDown, ChevronUp, Settings2, AlertCircle, BarChart2, List } from 'lucide-react'
import { PageError } from '@/components/ui/StateUI'

// ─── Types ────────────────────────────────────────────────
type ClientType = 'B2C' | 'B2B'
type PlanType = 'A' | 'B' | 'C' | '2' | '3' | '4' | '5' | '6'

interface Job {
  id: string
  customer_id: string | null
  lead_id: number | null
  project_id: string
  room_no: string
  customer_name: string
  customer_type: ClientType
  work_type: string
  revenue_ex_vat: number
  working_status: string
  order_date: string | null
  sales_id: string
  sales_name: string
  project_name: string
  payment_plan_type: PlanType | null
  work_days: number | null
  contract_date: string | null
  work_start_date: string | null
  installments: Installment[]
}

interface Installment {
  id: string
  installment_no: number
  installment_name: string
  amount: number
  percentage: number
  status: 'pending' | 'paid' | 'overdue'
  due_date: string | null
  paid_date: string | null
  is_work_trigger: boolean
  is_final: boolean
  file_urls: string[]
}

interface RawJob {
  id: string
  customer_id: string | null
  lead_id: number | null
  project_id: string
  room_no: string
  customer_name: string
  customer_type: string
  work_type: string
  revenue_ex_vat: number
  working_status: string
  order_date: string | null
  sales_id: string
  payment_plan_type: string | null
  work_days: number | null
  contract_date: string | null
  work_start_date: string | null
  condo_leads?: { customer_name: string } | null
  projects?: { name: string } | null
  sales?: { name: string } | null
}

interface RawPayment {
  id: string
  job_id: string | null
  installment_no: number
  installment_name: string
  amount: number
  percentage: number | null
  status: string
  due_date: string | null
  paid_date: string | null
  is_work_trigger: boolean | null
  is_final: boolean | null
  file_urls: string[] | null
}

// ─── Helpers ──────────────────────────────────────────────
const fmtBaht = (n: number) => n ? '฿' + Math.round(n).toLocaleString('th-TH') : '฿0'
const fmtBahtK = (n: number) => {
  if (!n) return '฿0'
  if (n >= 1_000_000) return '฿' + (n / 1_000_000).toFixed(2) + 'M'
  if (n >= 1_000) return '฿' + (n / 1_000).toFixed(0) + 'K'
  return '฿' + Math.round(n).toLocaleString('th-TH')
}
const fmtDate = (d: string | null) => d ? new Date(d).toLocaleDateString('th-TH', { day: '2-digit', month: 'short', year: '2-digit' }) : '—'

const WORK_DAYS_OPTIONS = [
  { value: 30, label: '30 วัน' }, { value: 45, label: '45 วัน' },
  { value: 60, label: '60 วัน' }, { value: 90, label: '90 วัน' },
]
const B2C_PLANS = [
  { value: 'A', label: 'แบบ A — จ่ายทั้งหมด 100%', desc: '1 งวด ชำระเต็มจำนวน' },
  { value: 'B', label: 'แบบ B — 50% + 50%', desc: '2 งวด แรก 50% สุดท้าย 50%' },
  { value: 'C', label: 'แบบ C — มัดจำ + 50% + 50%', desc: '3 งวด มัดจำก่อน แล้วแบ่ง 50/50' },
]

function calcB2CInstallments(plan: string, total: number, deposit: number) {
  if (plan === 'A') return [{ no: 1, name: 'ชำระเต็มจำนวน 100%', pct: 100, amount: total, trigger: true, final: true }]
  if (plan === 'B') return [
    { no: 1, name: 'ชำระ 50% แรก เริ่มงาน', pct: 50, amount: total * 0.5, trigger: true, final: false },
    { no: 2, name: 'ชำระ 50% สุดท้าย ส่งมอบ', pct: 50, amount: total * 0.5, trigger: false, final: true },
  ]
  if (plan === 'C') {
    const dep = deposit > 0 ? deposit : Math.round(total * 0.1)
    const rest = (total - dep) / 2
    return [
      { no: 1, name: 'มัดจำจองสิทธิ์', pct: Math.round((dep / total) * 100), amount: dep, trigger: false, final: false },
      { no: 2, name: 'ชำระ 50% แรก เริ่มงาน', pct: Math.round((rest / total) * 100), amount: rest, trigger: true, final: false },
      { no: 3, name: 'ชำระ 50% สุดท้าย ส่งมอบ', pct: Math.round((rest / total) * 100), amount: rest, trigger: false, final: true },
    ]
  }
  return []
}
function calcB2BInstallments(count: number, total: number, percentages: number[]) {
  return percentages.map((pct, i) => ({
    no: i + 1,
    name: i === 0 ? 'งวดที่ 1 เริ่มงาน' : i === count - 1 ? 'งวดสุดท้าย ส่งมอบ' : `งวดที่ ${i + 1}`,
    pct, amount: Math.round((pct / 100) * total),
    trigger: i === 0, final: i === count - 1,
  }))
}
function statusBadge(s: string) {
  if (s === 'paid') return 'bg-green-500/15 text-green-400 border border-green-500/20'
  if (s === 'overdue') return 'bg-red-500/15 text-red-400 border border-red-500/20'
  return 'border'
}

// ─── Summary Section ───────────────────────────────────────
function SummaryView({ jobs }: { jobs: Job[] }) {
  const [breakdownBy, setBreakdownBy] = useState<'work_type' | 'sales' | 'customer_type'>('sales')

  const { totalRevenue, paidAmount, pendingAmount, overdueAmount, collectionRate } = useMemo(() => {
    let totalRevenue = 0, paidAmount = 0, pendingAmount = 0, overdueAmount = 0
    for (const j of jobs) {
      totalRevenue += j.revenue_ex_vat
      for (const i of j.installments) {
        if (i.status === 'paid') paidAmount += i.amount
        else if (i.status === 'overdue') { overdueAmount += i.amount; pendingAmount += i.amount }
        else pendingAmount += i.amount
      }
    }
    return { totalRevenue, paidAmount, pendingAmount, overdueAmount, collectionRate: totalRevenue > 0 ? (paidAmount / totalRevenue * 100).toFixed(1) : '0' }
  }, [jobs])

  const breakdown = useMemo(() => {
    const map = new Map<string, { paid: number; pending: number; overdue: number; jobs: number }>()
    for (const j of jobs) {
      const key = breakdownBy === 'sales' ? j.sales_name : breakdownBy === 'work_type' ? (j.work_type || 'ไม่ระบุ') : j.customer_type
      if (!map.has(key)) map.set(key, { paid: 0, pending: 0, overdue: 0, jobs: 0 })
      const row = map.get(key)!
      row.jobs++
      for (const i of j.installments) {
        if (i.status === 'paid') row.paid += i.amount
        else if (i.status === 'overdue') { row.overdue += i.amount; row.pending += i.amount }
        else row.pending += i.amount
      }
    }
    return Array.from(map.entries())
      .map(([key, v]) => ({ key, ...v, total: v.paid + v.pending }))
      .sort((a, b) => b.total - a.total)
  }, [jobs, breakdownBy])

  const maxTotal = Math.max(...breakdown.map(r => r.total), 1)

  return (
    <div className="space-y-5">
      {/* KPI Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <div className="glass-card p-4">
          <p className="text-card-title mb-1" style={{ color: 'var(--text-3)' }}>ยอดรวมทั้งหมด</p>
          <p className="text-kpi-number" style={{ color: 'var(--text-1)' }}>{fmtBahtK(totalRevenue)}</p>
          <p className="text-xs mt-1" style={{ color: 'var(--text-3)' }}>{jobs.length} งาน</p>
        </div>
        <div className="glass-card p-4">
          <p className="text-card-title mb-1" style={{ color: 'var(--text-3)' }}>เก็บแล้ว</p>
          <p className="text-kpi-number text-green-400">{fmtBahtK(paidAmount)}</p>
          <p className="text-xs mt-1 text-green-400">{collectionRate}% ของยอดรวม</p>
        </div>
        <div className="glass-card p-4">
          <p className="text-card-title mb-1" style={{ color: 'var(--text-3)' }}>ค้างเก็บ</p>
          <p className="text-kpi-number text-amber-400">{fmtBahtK(pendingAmount)}</p>
          {overdueAmount > 0 && <p className="text-xs mt-1 text-red-400">เกินกำหนด {fmtBahtK(overdueAmount)}</p>}
        </div>
        <div className="glass-card p-4">
          <p className="text-card-title mb-1" style={{ color: 'var(--text-3)' }}>ยังไม่ตั้งแผน</p>
          <p className="text-kpi-number text-red-400">{jobs.filter(j => j.installments.length === 0).length} งาน</p>
          <p className="text-xs mt-1" style={{ color: 'var(--text-3)' }}>
            {fmtBahtK(jobs.filter(j => j.installments.length === 0).reduce((s, j) => s + j.revenue_ex_vat, 0))}
          </p>
        </div>
      </div>

      {/* Collection progress bar */}
      <div className="glass-card p-4">
        <div className="flex items-center justify-between mb-3">
          <span className="text-sm font-semibold" style={{ color: 'var(--text-1)' }}>ความคืบหน้าการเก็บเงิน</span>
          <span className="text-sm font-bold text-green-400">{collectionRate}%</span>
        </div>
        <div className="h-3 rounded-full overflow-hidden" style={{ background: 'var(--hover-bg)' }}>
          <div className="h-full rounded-full transition-all" style={{ width: `${collectionRate}%`, background: 'linear-gradient(90deg,#22c55e,#4ade80)' }} />
        </div>
        <div className="flex justify-between mt-2 text-xs" style={{ color: 'var(--text-3)' }}>
          <span>เก็บแล้ว {fmtBahtK(paidAmount)}</span>
          <span>ค้าง {fmtBahtK(pendingAmount)}</span>
        </div>
      </div>

      {/* Breakdown */}
      <div className="glass-card p-5">
        <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
          <h2 className="text-section-title" style={{ color: 'var(--text-1)' }}>แบ่งตาม</h2>
          <div className="flex rounded-[11px] overflow-hidden" style={{ border: '1px solid var(--divider)' }}>
            {[
              { key: 'sales', label: 'เซลล์' },
              { key: 'work_type', label: 'หมวดงาน' },
              { key: 'customer_type', label: 'ประเภทลูกค้า' },
            ].map(t => (
              <button key={t.key} onClick={() => setBreakdownBy(t.key as any)}
                className="px-3 py-1.5 text-xs font-semibold"
                style={{ background: breakdownBy === t.key ? 'var(--accent)' : 'var(--hover-bg)', color: breakdownBy === t.key ? '#fff' : 'var(--text-2)' }}>
                {t.label}
              </button>
            ))}
          </div>
        </div>

        <div className="space-y-3">
          {/* Header */}
          <div className="grid gap-2 text-xs font-semibold" style={{ gridTemplateColumns: '1fr 100px 100px 100px 120px', color: 'var(--text-3)' }}>
            <span>{breakdownBy === 'sales' ? 'เซลล์' : breakdownBy === 'work_type' ? 'หมวดงาน' : 'ประเภท'}</span>
            <span className="text-right">งาน</span>
            <span className="text-right text-green-400">เก็บแล้ว</span>
            <span className="text-right text-amber-400">ค้างเก็บ</span>
            <span className="text-right">%เก็บแล้ว</span>
          </div>

          {breakdown.map(row => {
            const pct = row.total > 0 ? (row.paid / row.total * 100) : 0
            return (
              <div key={row.key}>
                <div className="grid gap-2 items-center text-sm mb-1" style={{ gridTemplateColumns: '1fr 100px 100px 100px 120px' }}>
                  <span className="font-semibold truncate" style={{ color: 'var(--text-1)' }}>{row.key}</span>
                  <span className="text-right text-xs" style={{ color: 'var(--text-3)' }}>{row.jobs}</span>
                  <span className="text-right text-xs font-semibold text-green-400">{fmtBahtK(row.paid)}</span>
                  <span className="text-right text-xs font-semibold text-amber-400">{fmtBahtK(row.pending)}</span>
                  <span className="text-right text-xs font-bold" style={{ color: pct >= 80 ? '#4ade80' : pct >= 50 ? '#fbbf24' : '#f87171' }}>
                    {pct.toFixed(0)}%
                  </span>
                </div>
                {/* Stacked bar */}
                <div className="h-2 rounded-full overflow-hidden" style={{ background: 'var(--hover-bg)' }}>
                  <div className="h-full flex">
                    <div className="h-full transition-all" style={{ width: `${(row.paid / maxTotal) * 100}%`, background: '#22c55e' }} />
                    <div className="h-full transition-all" style={{ width: `${((row.pending - row.overdue) / maxTotal) * 100}%`, background: '#fbbf24', opacity: 0.6 }} />
                    {row.overdue > 0 && (
                      <div className="h-full transition-all" style={{ width: `${(row.overdue / maxTotal) * 100}%`, background: '#ef4444', opacity: 0.8 }} />
                    )}
                  </div>
                </div>
              </div>
            )
          })}

          {breakdown.length === 0 && (
            <p className="text-center py-6 text-sm" style={{ color: 'var(--text-3)' }}>ไม่มีข้อมูล</p>
          )}
        </div>

        {/* Legend */}
        <div className="flex gap-4 mt-4 text-xs" style={{ color: 'var(--text-3)' }}>
          <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-sm inline-block bg-green-500" />เก็บแล้ว</span>
          <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-sm inline-block bg-amber-400 opacity-60" />ค้างเก็บ</span>
          <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-sm inline-block bg-red-400" />เกินกำหนด</span>
        </div>
      </div>
    </div>
  )
}

// ─── Plan Setup Modal ──────────────────────────────────────
function PlanSetupModal({ job, open, onClose, onSaved }: { job: Job; open: boolean; onClose: () => void; onSaved: () => void }) {
  const supabase = createClient()
  const [clientType, setClientType] = useState<ClientType>(job.customer_type)
  const [plan, setPlan] = useState<string>(job.payment_plan_type || 'C')
  const [workDays, setWorkDays] = useState(job.work_days || 45)
  const [contractDate, setContractDate] = useState(job.contract_date || '')
  const [depositAmount, setDepositAmount] = useState(0)
  const [b2bCount, setB2bCount] = useState(3)
  const [b2bPcts, setB2bPcts] = useState([30, 40, 30])
  const [saving, setSaving] = useState(false)

  const total = job.revenue_ex_vat || 0
  const pctSum = b2bPcts.slice(0, b2bCount).reduce((a, b) => a + b, 0)
  const pctValid = Math.abs(pctSum - 100) < 0.01

  function updateB2bCount(n: number) {
    setB2bCount(n)
    const even = Math.floor(100 / n)
    const last = 100 - even * (n - 1)
    setB2bPcts(Array(n).fill(even).map((v, i) => i === n - 1 ? last : v))
  }

  const preview = clientType === 'B2C'
    ? calcB2CInstallments(plan, total, depositAmount)
    : calcB2BInstallments(b2bCount, total, b2bPcts.slice(0, b2bCount))

  async function save() {
    if (clientType === 'B2B' && !pctValid) return
    setSaving(true)
    await supabase.from('jobs').update({
      customer_type: clientType,
      payment_plan_type: clientType === 'B2C' ? plan : String(b2bCount),
      work_days: workDays,
      contract_date: contractDate || null,
    }).eq('id', job.id)
    await supabase.from('payments').delete().eq('job_id', job.id)
    const rows = preview.map((p, i) => ({
      id: `PAY-${job.id}-${i + 1}`,
      job_id: job.id,
      customer_id: job.customer_id || null,
      project_id: job.project_id,
      room: job.room_no,
      installment_no: p.no,
      installment_name: p.name,
      percentage: p.pct,
      amount: p.amount,
      status: 'pending',
      is_work_trigger: p.trigger,
      is_final: p.final,
    }))
    await supabase.from('payments').insert(rows)
    setSaving(false); onSaved(); onClose()
  }

  if (!open) return null
  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4" onClick={onClose}>
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
      <div className="relative w-full max-w-lg rounded-[18px] shadow-2xl max-h-[90vh] overflow-y-auto"
        style={{ background: 'var(--card-bg)', border: '1px solid var(--card-border)' }}
        onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between p-5" style={{ borderBottom: '1px solid var(--divider)' }}>
          <div>
            <h3 className="font-semibold" style={{ color: 'var(--text-1)' }}>ตั้งแผนชำระเงิน</h3>
            <p className="text-xs mt-0.5" style={{ color: 'var(--text-2)' }}>{job.id} · {job.customer_name} · {job.room_no}</p>
          </div>
          <button onClick={onClose} className="p-1" style={{ color: 'var(--text-2)' }}><X size={18} /></button>
        </div>
        <div className="p-5 space-y-5">
          <div className="rounded-[11px] p-4 text-center" style={{ background: 'var(--hover-bg)' }}>
            <p className="text-xs mb-1" style={{ color: 'var(--text-2)' }}>มูลค่างานรวม</p>
            <p className="text-kpi-number" style={{ color: 'var(--text-1)' }}>{fmtBaht(total)}</p>
          </div>
          <div>
            <p className="text-xs mb-2" style={{ color: 'var(--text-2)' }}>ประเภทลูกค้า</p>
            <div className="grid grid-cols-2 gap-2">
              {(['B2C', 'B2B'] as ClientType[]).map(t => (
                <button key={t} onClick={() => setClientType(t)}
                  className={`py-2.5 rounded-[11px] text-sm font-semibold border transition-all ${clientType === t ? 'bg-indigo-500/20 border-indigo-500/50 text-indigo-700 dark:text-indigo-300' : ''}`}
                  style={clientType !== t ? { background: 'var(--hover-bg)', border: '1px solid var(--divider)', color: 'var(--text-2)' } : undefined}>
                  {t}
                </button>
              ))}
            </div>
          </div>
          {clientType === 'B2C' && (
            <div>
              <p className="text-xs mb-2" style={{ color: 'var(--text-2)' }}>รูปแบบการชำระ</p>
              <div className="space-y-2">
                {B2C_PLANS.map(p => (
                  <button key={p.value} onClick={() => setPlan(p.value)}
                    className={`w-full text-left px-4 py-3 rounded-[11px] border transition-all ${plan === p.value ? 'bg-amber-500/10 border-amber-500/30 text-amber-700 dark:text-amber-200' : ''}`}
                    style={plan !== p.value ? { background: 'var(--hover-bg)', border: '1px solid var(--divider)', color: 'var(--text-2)' } : undefined}>
                    <p className="text-sm font-semibold">{p.label}</p>
                    <p className="text-xs opacity-60 mt-0.5">{p.desc}</p>
                  </button>
                ))}
              </div>
              {plan === 'C' && (
                <div className="mt-3">
                  <label className="text-xs" style={{ color: 'var(--text-2)' }}>ยอดมัดจำจองสิทธิ์ (บาท)</label>
                  <input type="number" value={depositAmount || ''} onChange={e => setDepositAmount(Number(e.target.value))}
                    placeholder={`เช่น ${Math.round(total * 0.1).toLocaleString()} (10%)`}
                    className="mt-1 w-full rounded-[8px] px-3 py-2 text-sm focus:outline-none"
                    style={{ background: 'var(--input-bg)', border: '1px solid var(--divider)', color: 'var(--text-1)' }} />
                </div>
              )}
            </div>
          )}
          {clientType === 'B2B' && (
            <div className="space-y-3">
              <div>
                <p className="text-xs mb-2" style={{ color: 'var(--text-2)' }}>จำนวนงวด</p>
                <div className="flex gap-2">
                  {[2, 3, 4, 5, 6].map(n => (
                    <button key={n} onClick={() => updateB2bCount(n)}
                      className={`flex-1 py-2 rounded-[11px] text-sm font-semibold border transition-all ${b2bCount === n ? 'bg-blue-500/20 border-blue-500/40 text-blue-700 dark:text-blue-300' : ''}`}
                      style={b2bCount !== n ? { background: 'var(--hover-bg)', border: '1px solid var(--divider)', color: 'var(--text-2)' } : undefined}>
                      {n}
                    </button>
                  ))}
                </div>
              </div>
              <div className="space-y-2">
                <p className="text-xs" style={{ color: 'var(--text-2)' }}>% แต่ละงวด <span className={pctValid ? 'text-green-400' : 'text-red-400'}>(รวม {pctSum}%)</span></p>
                {b2bPcts.slice(0, b2bCount).map((pct, i) => (
                  <div key={i} className="flex items-center gap-3">
                    <span className="text-xs w-16" style={{ color: 'var(--text-2)' }}>งวดที่ {i + 1}</span>
                    <input type="number" value={pct}
                      onChange={e => { const np = [...b2bPcts]; np[i] = Number(e.target.value); setB2bPcts(np) }}
                      className="w-20 rounded-[8px] px-2 py-1.5 text-sm text-center focus:outline-none"
                      style={{ background: 'var(--input-bg)', border: '1px solid var(--divider)', color: 'var(--text-1)' }} />
                    <span className="text-xs" style={{ color: 'var(--text-2)' }}>% = {fmtBaht(Math.round((pct / 100) * total))}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <p className="text-xs mb-1.5" style={{ color: 'var(--text-2)' }}>ระยะเวลางาน</p>
              <select value={workDays} onChange={e => setWorkDays(Number(e.target.value))}
                className="w-full rounded-[8px] px-3 py-2 text-sm focus:outline-none"
                style={{ background: 'var(--input-bg)', border: '1px solid var(--divider)', color: 'var(--text-1)' }}>
                {WORK_DAYS_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            </div>
            <div>
              <p className="text-xs mb-1.5" style={{ color: 'var(--text-2)' }}>วันเซ็นสัญญา</p>
              <input type="date" value={contractDate} onChange={e => setContractDate(e.target.value)}
                className="w-full rounded-[8px] px-3 py-2 text-sm focus:outline-none"
                style={{ background: 'var(--input-bg)', border: '1px solid var(--divider)', color: 'var(--text-1)' }} />
            </div>
          </div>
          {preview.length > 0 && (
            <div className="rounded-[11px] p-4" style={{ background: 'var(--hover-bg)' }}>
              <p className="text-xs mb-3 font-semibold" style={{ color: 'var(--text-2)' }}>ตัวอย่างแผนงวด</p>
              <div className="space-y-2">
                {preview.map((p, i) => (
                  <div key={i} className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <div className={`w-5 h-5 rounded-full flex items-center justify-center text-[9px] font-bold ${p.trigger ? 'bg-amber-500/20 text-amber-600 dark:text-amber-300' : p.final ? 'bg-green-500/20 text-green-400' : ''}`}
                        style={!p.trigger && !p.final ? { background: 'var(--divider)', color: 'var(--text-2)' } : undefined}>
                        {p.no}
                      </div>
                      <span className="text-xs" style={{ color: 'var(--text-2)' }}>{p.name}</span>
                      {p.trigger && <span className="text-[9px] bg-amber-500/15 text-amber-600 dark:text-amber-300 px-1.5 py-0.5 rounded">▶ เริ่มงาน</span>}
                      {p.final && <span className="text-[9px] bg-green-500/15 text-green-400 px-1.5 py-0.5 rounded">⚑ สุดท้าย</span>}
                    </div>
                    <div className="text-right">
                      <span className="text-sm font-semibold" style={{ color: 'var(--text-1)' }}>{fmtBaht(p.amount)}</span>
                      <span className="text-xs ml-1" style={{ color: 'var(--text-3)' }}>({p.pct}%)</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
        <div className="flex justify-end gap-3 p-5" style={{ borderTop: '1px solid var(--divider)' }}>
          <button onClick={onClose} className="px-4 py-2 text-sm" style={{ color: 'var(--text-2)' }}>ยกเลิก</button>
          <button onClick={save} disabled={saving || (clientType === 'B2B' && !pctValid) || preview.length === 0}
            className="px-5 py-2 btn-green disabled:opacity-40 text-white text-sm rounded-xl font-medium transition-colors">
            {saving ? 'กำลังบันทึก...' : 'บันทึกแผน'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Record Payment Modal ──────────────────────────────────
function RecordPaymentModal({ installment, open, onClose, onSaved }: {
  installment: Installment | null; open: boolean; onClose: () => void; onSaved: (jobId: string | null, isWorkTrigger: boolean) => void
}) {
  const supabase = createClient()
  const [paidDate, setPaidDate] = useState(new Date().toISOString().slice(0, 10))
  const [fileUrls, setFileUrls] = useState<string[]>([''])
  const [saving, setSaving] = useState(false)

  function addFileUrl() { if (fileUrls.length < 5) setFileUrls([...fileUrls, '']) }
  function removeFileUrl(i: number) { setFileUrls(fileUrls.filter((_, idx) => idx !== i)) }
  function updateFileUrl(i: number, v: string) { const n = [...fileUrls]; n[i] = v; setFileUrls(n) }

  async function save() {
    if (!installment) return
    setSaving(true)
    const urls = fileUrls.filter(u => u.trim())
    await supabase.from('payments').update({ status: 'paid', paid_date: paidDate, file_urls: urls.length > 0 ? urls : null }).eq('id', installment.id)
    setSaving(false); onSaved(null, installment.is_work_trigger); onClose()
  }

  if (!open || !installment) return null
  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4" onClick={onClose}>
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
      <div className="relative w-full max-w-md rounded-[18px] shadow-2xl" style={{ background: 'var(--card-bg)', border: '1px solid var(--card-border)' }} onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between p-5" style={{ borderBottom: '1px solid var(--divider)' }}>
          <div>
            <h3 className="font-semibold" style={{ color: 'var(--text-1)' }}>บันทึกการชำระเงิน</h3>
            <p className="text-xs mt-0.5" style={{ color: 'var(--text-2)' }}>{installment.installment_name}</p>
          </div>
          <button onClick={onClose} style={{ color: 'var(--text-2)' }}><X size={18} /></button>
        </div>
        <div className="p-5 space-y-4">
          <div className="rounded-[11px] p-4 text-center" style={{ background: 'var(--hover-bg)' }}>
            <p className="text-xs mb-1" style={{ color: 'var(--text-2)' }}>ยอดชำระ</p>
            <p className="text-kpi-number" style={{ color: 'var(--text-1)' }}>{fmtBaht(installment.amount)}</p>
            {installment.is_work_trigger && <p className="text-amber-400 text-xs mt-2">⚡ งวดนี้จะ trigger วันเริ่มงาน</p>}
            {installment.is_final && <p className="text-green-400 text-xs mt-1">⚑ งวดสุดท้าย — unlock การส่งมอบ</p>}
          </div>
          <div>
            <label className="text-xs mb-1.5 block" style={{ color: 'var(--text-2)' }}>วันที่ชำระ</label>
            <input type="date" value={paidDate} onChange={e => setPaidDate(e.target.value)}
              className="w-full rounded-[8px] px-3 py-2 text-sm focus:outline-none"
              style={{ background: 'var(--input-bg)', border: '1px solid var(--divider)', color: 'var(--text-1)' }} />
          </div>
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-xs" style={{ color: 'var(--text-2)' }}>แนบสลิป/เอกสาร (Google Drive URL)</label>
              {fileUrls.length < 5 && (
                <button onClick={addFileUrl} className="text-xs text-accent-blue flex items-center gap-1"><Plus size={12} />เพิ่มไฟล์</button>
              )}
            </div>
            <div className="space-y-2">
              {fileUrls.map((url, i) => (
                <div key={i} className="flex gap-2">
                  <input value={url} onChange={e => updateFileUrl(i, e.target.value)} placeholder="https://drive.google.com/..."
                    className="flex-1 rounded-[8px] px-3 py-2 text-xs focus:outline-none"
                    style={{ background: 'var(--input-bg)', border: '1px solid var(--divider)', color: 'var(--text-1)' }} />
                  {fileUrls.length > 1 && <button onClick={() => removeFileUrl(i)} className="hover:text-red-400 p-2" style={{ color: 'var(--text-3)' }}><X size={14} /></button>}
                </div>
              ))}
            </div>
            <p className="text-[10px] mt-1" style={{ color: 'var(--text-3)' }}>รองรับ jpg, pdf — ไม่เกิน 5 ไฟล์</p>
          </div>
        </div>
        <div className="flex justify-end gap-3 p-5" style={{ borderTop: '1px solid var(--divider)' }}>
          <button onClick={onClose} className="px-4 py-2 text-sm" style={{ color: 'var(--text-2)' }}>ยกเลิก</button>
          <button onClick={save} disabled={saving} className="px-5 py-2 btn-green disabled:opacity-40 text-white text-sm rounded-xl font-medium">
            {saving ? 'กำลังบันทึก...' : 'บันทึก'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Main Page ─────────────────────────────────────────────
export default function PaymentsPage() {
  const supabase = createClient()
  const [jobs, setJobs] = useState<Job[]>([])
  const [loading, setLoading] = useState(true)
  const [view, setView] = useState<'summary' | 'list'>('summary')
  const [search, setSearch] = useState('')
  const [filterNoPlan, setFilterNoPlan] = useState(false)
  const [filterProject, setFilterProject] = useState('')
  const [filterSales, setFilterSales] = useState('')
  const [filterWorkType, setFilterWorkType] = useState('')
  const [filterPayStatus, setFilterPayStatus] = useState<'all' | 'pending' | 'overdue' | 'done' | 'no_plan'>('all')
  const [hideCompleted, setHideCompleted] = useState(false)
  const [projects, setProjects] = useState<{id: string; name: string}[]>([])
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [planJob, setPlanJob] = useState<Job | null>(null)
  const [recordInstallment, setRecordInstallment] = useState<Installment | null>(null)
  const [fetchError, setFetchError] = useState('')
  const [followupPaymentId, setFollowupPaymentId] = useState<string | null>(null)
  const [followupNote, setFollowupNote] = useState('')
  const [followupSaving, setFollowupSaving] = useState(false)
  const [followupCounts, setFollowupCounts] = useState<Record<string, number>>({})
  const [currentUserName, setCurrentUserName] = useState('')

  const load = useCallback(async () => {
    setLoading(true); setFetchError('')
    const [{ data: jobsData, error: e1 }, { data: projectsData }] = await Promise.all([
      supabase.from('jobs').select('*, condo_leads:lead_id(customer_name), projects:project_id(name), sales:sales_id(name)').not('working_status', 'eq', 'ยกเลิก').order('created_at', { ascending: false }),
      supabase.from('projects').select('id,name').eq('active', true).order('name'),
    ])
    setProjects(projectsData || [])
    const { data: paymentsData } = await supabase.from('payments').select('*').not('job_id', 'is', null).order('installment_no')

    const rawJobs = (jobsData as unknown as RawJob[]) || []
    const rawPays = (paymentsData as unknown as RawPayment[]) || []
    const payMap = new Map<string, RawPayment[]>()
    for (const p of rawPays) {
      if (!p.job_id) continue
      if (!payMap.has(p.job_id)) payMap.set(p.job_id, [])
      payMap.get(p.job_id)!.push(p)
    }

    const mapped: Job[] = rawJobs.map(j => ({
      id: j.id,
      customer_id: j.customer_id,
      lead_id: j.lead_id,
      project_id: j.project_id,
      room_no: j.room_no,
      customer_name: j.customer_name || j.condo_leads?.customer_name || '—',
      customer_type: (j.customer_type as ClientType) || 'B2C',
      work_type: j.work_type || '',
      revenue_ex_vat: j.revenue_ex_vat,
      working_status: j.working_status,
      order_date: j.order_date,
      sales_id: j.sales_id,
      sales_name: (j.sales as any)?.name || '—',
      project_name: (j.projects as any)?.name || '—',
      payment_plan_type: j.payment_plan_type as PlanType | null,
      work_days: j.work_days,
      contract_date: j.contract_date,
      work_start_date: j.work_start_date,
      installments: (payMap.get(j.id) || []).map(p => ({
        id: p.id,
        installment_no: p.installment_no,
        installment_name: p.installment_name,
        amount: p.amount,
        percentage: p.percentage || 0,
        status: p.status as Installment['status'],
        due_date: p.due_date,
        paid_date: p.paid_date,
        is_work_trigger: p.is_work_trigger || false,
        is_final: p.is_final || false,
        file_urls: p.file_urls || [],
      })),
    }))

    if (e1) { setFetchError(e1.message); setLoading(false); return }
    setJobs(mapped)

    // load follow-up counts
    const allPayIds = rawPays.map(p => p.id)
    if (allPayIds.length > 0) {
      const { data: fups } = await supabase.from('payment_followups').select('payment_id').in('payment_id', allPayIds)
      const counts: Record<string, number> = {}
      for (const f of (fups || [])) { counts[f.payment_id] = (counts[f.payment_id] || 0) + 1 }
      setFollowupCounts(counts)
    }

    // load current user
    const { data: { user } } = await supabase.auth.getUser()
    if (user) {
      const { data: u } = await supabase.from('users').select('name').eq('email', user.email!).maybeSingle()
      if (u) setCurrentUserName(u.name)
    }

    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

  async function saveFollowup() {
    if (!followupPaymentId || !followupNote.trim()) return
    setFollowupSaving(true)
    await supabase.from('payment_followups').insert({ payment_id: followupPaymentId, note: followupNote.trim(), followed_by: currentUserName })
    setFollowupCounts(prev => ({ ...prev, [followupPaymentId]: (prev[followupPaymentId] || 0) + 1 }))
    setFollowupNote(''); setFollowupPaymentId(null); setFollowupSaving(false)
  }

  async function handlePaymentSaved(jobId: string | null, isWorkTrigger: boolean) {
    if (isWorkTrigger && recordInstallment) {
      const job = jobs.find(j => j.installments.some(i => i.id === recordInstallment.id))
      if (job) await supabase.from('jobs').update({ work_start_date: new Date().toISOString().slice(0, 10) }).eq('id', job.id)
    }
    await load()
  }

  const salesList = useMemo(() => [...new Set(jobs.map(j => j.sales_name).filter(Boolean))].sort(), [jobs])
  const workTypeList = useMemo(() => [...new Set(jobs.map(j => j.work_type).filter(Boolean))].sort(), [jobs])
  const jobsNoPlan = jobs.filter(j => j.installments.length === 0).length
  const today = new Date().toISOString().slice(0, 10)

  const payStatusCounts = useMemo(() => ({
    overdue: jobs.filter(j => j.installments.some(i => i.status !== 'paid' && i.due_date && i.due_date < today)).length,
    pending: jobs.filter(j => j.installments.some(i => i.status !== 'paid') && !j.installments.some(i => i.status !== 'paid' && i.due_date && i.due_date < today)).length,
    done: jobs.filter(j => j.installments.length > 0 && j.installments.every(i => i.status === 'paid')).length,
    no_plan: jobsNoPlan,
  }), [jobs, today, jobsNoPlan])

  const filtered = jobs.filter(j => {
    const hasOverdue = j.installments.some(i => i.status !== 'paid' && i.due_date && i.due_date < today)
    const hasPending = j.installments.some(i => i.status !== 'paid')
    const allPaid = j.installments.length > 0 && j.installments.every(i => i.status === 'paid')
    const isDelivered = j.working_status === 'ส่งมอบแล้ว'

    if (hideCompleted && allPaid && isDelivered) return false
    if (filterNoPlan && j.installments.length > 0) return false
    if (filterProject && j.project_id !== filterProject) return false
    if (filterSales && j.sales_name !== filterSales) return false
    if (filterWorkType && j.work_type !== filterWorkType) return false
    if (filterPayStatus === 'overdue' && !hasOverdue) return false
    if (filterPayStatus === 'pending' && (hasOverdue || !hasPending)) return false
    if (filterPayStatus === 'done' && !allPaid) return false
    if (filterPayStatus === 'no_plan' && j.installments.length > 0) return false
    if (!search) return true
    const q = search.toLowerCase()
    return j.customer_name.toLowerCase().includes(q) || j.room_no.toLowerCase().includes(q) || j.project_name.toLowerCase().includes(q) || j.id.toLowerCase().includes(q)
  })

  return (
    <div className="p-4 md:p-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-5">
        <div>
          <h1 className="text-page-title" style={{ color: 'var(--text-1)' }}>สถานะการชำระเงิน</h1>
          <p className="text-sm mt-0.5" style={{ color: 'var(--text-2)' }}>ภาพรวมการเก็บเงิน · แยกตามเซลล์ / หมวดงาน / ประเภทลูกค้า</p>
        </div>
        {/* View toggle */}
        <div className="flex rounded-[11px] overflow-hidden" style={{ border: '1px solid var(--divider)' }}>
          <button onClick={() => setView('summary')}
            className="flex items-center gap-1.5 px-3 py-2 text-sm"
            style={{ background: view === 'summary' ? 'var(--accent)' : 'var(--hover-bg)', color: view === 'summary' ? '#fff' : 'var(--text-2)' }}>
            <BarChart2 size={14} />สรุป
          </button>
          <button onClick={() => setView('list')}
            className="flex items-center gap-1.5 px-3 py-2 text-sm"
            style={{ background: view === 'list' ? 'var(--accent)' : 'var(--hover-bg)', color: view === 'list' ? '#fff' : 'var(--text-2)' }}>
            <List size={14} />รายละเอียด
          </button>
        </div>
      </div>

      {loading && <div className="flex justify-center py-16"><div className="w-7 h-7 rounded-full border-2 border-t-transparent animate-spin" style={{ borderColor: 'var(--accent)', borderTopColor: 'transparent' }} /></div>}
      {!loading && fetchError && <PageError message={fetchError} onRetry={load} />}

      {!loading && !fetchError && view === 'summary' && <SummaryView jobs={jobs} />}

      {!loading && !fetchError && view === 'list' && (
        <>
          {/* Status filter chips */}
          <div className="flex gap-2 mb-3 flex-wrap">
            {([
              { key: 'all',     label: 'ทั้งหมด',          color: '', count: jobs.length },
              { key: 'overdue', label: '🔴 เกินกำหนด',      color: 'text-red-400 bg-red-500/15 border-red-500/30', count: payStatusCounts.overdue },
              { key: 'pending', label: '🟡 มีงวดค้าง',      color: 'text-amber-400 bg-amber-500/15 border-amber-500/30', count: payStatusCounts.pending },
              { key: 'done',    label: '✅ เก็บครบแล้ว',    color: 'text-green-400 bg-green-500/15 border-green-500/30', count: payStatusCounts.done },
              { key: 'no_plan', label: '⚙️ ยังไม่ตั้งแผน', color: 'text-orange-400 bg-orange-500/15 border-orange-500/30', count: payStatusCounts.no_plan },
            ] as { key: typeof filterPayStatus; label: string; color: string; count: number }[]).map(f => (
              <button key={f.key} onClick={() => setFilterPayStatus(f.key)}
                className={`px-3 py-1.5 rounded-full text-xs font-semibold border whitespace-nowrap transition-colors ${
                  filterPayStatus === f.key
                    ? f.color || 'bg-indigo-500/20 text-indigo-300 border-indigo-500/40'
                    : ''
                }`}
                style={filterPayStatus !== f.key ? { background: 'var(--card-bg)', border: '1px solid var(--card-border)', color: 'var(--text-2)' } : undefined}>
                {f.label} <span className="ml-1 opacity-70">{f.count}</span>
              </button>
            ))}
            <button onClick={() => setHideCompleted(h => !h)}
              className={`ml-auto px-3 py-1.5 rounded-full text-xs font-semibold border whitespace-nowrap ${hideCompleted ? 'bg-indigo-500/20 text-indigo-300 border-indigo-500/40' : ''}`}
              style={!hideCompleted ? { background: 'var(--card-bg)', border: '1px solid var(--card-border)', color: 'var(--text-3)' } : undefined}>
              ซ่อนงานเสร็จสิ้น
            </button>
          </div>

          {/* Dropdown filters */}
          <div className="flex gap-2 mb-4 flex-wrap">
            <div className="relative flex-1 min-w-40">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: 'var(--text-3)' }} />
              <input value={search} onChange={e => setSearch(e.target.value)} placeholder="ค้นหาชื่อ, ห้อง, โครงการ..."
                className="w-full rounded-[8px] pl-8 pr-3 py-2 text-sm focus:outline-none"
                style={{ background: 'var(--card-bg)', border: '1px solid var(--card-border)', color: 'var(--text-1)' }} />
            </div>
            <select value={filterProject} onChange={e => setFilterProject(e.target.value)}
              className="rounded-[8px] px-3 py-2 text-sm outline-none"
              style={{ background: 'var(--card-bg)', border: '1px solid var(--card-border)', color: 'var(--text-2)' }}>
              <option value="">ทุกโครงการ</option>
              {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
            <select value={filterSales} onChange={e => setFilterSales(e.target.value)}
              className="rounded-[8px] px-3 py-2 text-sm outline-none"
              style={{ background: 'var(--card-bg)', border: '1px solid var(--card-border)', color: 'var(--text-2)' }}>
              <option value="">ทุกเซลล์</option>
              {salesList.map(s => <option key={s} value={s}>{s}</option>)}
            </select>
            <select value={filterWorkType} onChange={e => setFilterWorkType(e.target.value)}
              className="rounded-[8px] px-3 py-2 text-sm outline-none"
              style={{ background: 'var(--card-bg)', border: '1px solid var(--card-border)', color: 'var(--text-2)' }}>
              <option value="">ทุกหมวดงาน</option>
              {workTypeList.map(w => <option key={w} value={w}>{w}</option>)}
            </select>
          </div>

          {/* Job list */}
          <div className="space-y-3">
            {filtered.map(job => {
              const expanded = expandedId === job.id
              const paidCount = job.installments.filter(i => i.status === 'paid').length
              const totalCount = job.installments.length
              const hasPlan = totalCount > 0
              const nextPending = job.installments.find(i => i.status !== 'paid')
              const jobPaid = job.installments.filter(i => i.status === 'paid').reduce((s, i) => s + i.amount, 0)
              const jobPending = job.installments.filter(i => i.status !== 'paid').reduce((s, i) => s + i.amount, 0)

              return (
                <div key={job.id} className="rounded-[18px] overflow-hidden" style={{ background: 'var(--card-bg)', border: '1px solid var(--card-border)' }}>
                  <div className="flex items-center gap-3 px-4 py-3.5 cursor-pointer" onClick={() => setExpandedId(expanded ? null : job.id)}>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap mb-1">
                        <span className="text-accent-blue text-xs font-mono">{job.id}</span>
                        <span className="text-sm font-semibold truncate" style={{ color: 'var(--text-1)' }}>{job.customer_name}</span>
                        <span className="text-xs" style={{ color: 'var(--text-3)' }}>{job.room_no}</span>
                        <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded border ${job.customer_type === 'B2B' ? 'bg-blue-500/10 text-blue-400 border-blue-500/20' : 'bg-purple-500/10 text-purple-400 border-purple-500/20'}`}>
                          {job.customer_type}
                        </span>
                        {job.work_type && (
                          <span className="text-[9px] px-1.5 py-0.5 rounded border" style={{ background: 'var(--hover-bg)', border: '1px solid var(--divider)', color: 'var(--text-3)' }}>
                            {job.work_type}
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-3 text-xs flex-wrap" style={{ color: 'var(--text-2)' }}>
                        <span>{job.project_name}</span>
                        <span>· {job.sales_name}</span>
                        {hasPlan && (
                          <>
                            <span className="text-green-400">เก็บแล้ว {fmtBahtK(jobPaid)}</span>
                            {jobPending > 0 && <span className="text-amber-400">ค้าง {fmtBahtK(jobPending)}</span>}
                          </>
                        )}
                        {job.work_start_date && <span className="text-amber-400">▶ เริ่มงาน {fmtDate(job.work_start_date)}</span>}
                      </div>
                    </div>
                    <div className="flex items-center gap-3 flex-shrink-0">
                      {!hasPlan ? (
                        <button onClick={e => { e.stopPropagation(); setPlanJob(job) }}
                          className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg bg-amber-500/15 text-amber-600 dark:text-amber-300 hover:bg-amber-500/25 border border-amber-500/20 transition-colors">
                          <Settings2 size={12} />ตั้งแผนงวด
                        </button>
                      ) : (
                        <div className="text-right">
                          <p className="text-xs" style={{ color: 'var(--text-2)' }}>งวด {paidCount}/{totalCount}</p>
                          <div className="flex gap-1 mt-1">
                            {job.installments.map(i => (
                              <div key={i.id} className={`h-1.5 flex-1 rounded-full ${i.status === 'paid' ? 'bg-green-500' : i.status === 'overdue' ? 'bg-red-500' : ''}`}
                                style={i.status === 'pending' ? { background: 'var(--divider)' } : undefined} />
                            ))}
                          </div>
                        </div>
                      )}
                      <div className="text-right">
                        <p className="text-sm font-semibold" style={{ color: 'var(--text-1)' }}>{fmtBahtK(job.revenue_ex_vat)}</p>
                        {nextPending && <p className="text-amber-400 text-xs">งวดถัดไป {fmtBahtK(nextPending.amount)}</p>}
                      </div>
                      {expanded ? <ChevronUp size={16} style={{ color: 'var(--text-3)' }} /> : <ChevronDown size={16} style={{ color: 'var(--text-3)' }} />}
                    </div>
                  </div>

                  {expanded && (
                    <div className="p-4" style={{ borderTop: '1px solid var(--divider)' }}>
                      {!hasPlan ? (
                        <div className="text-center py-8">
                          <AlertCircle size={28} className="mx-auto text-amber-500/50 mb-3" />
                          <p className="text-sm mb-3" style={{ color: 'var(--text-2)' }}>ยังไม่ได้ตั้งแผนการชำระเงิน</p>
                          <button onClick={() => setPlanJob(job)}
                            className="flex items-center gap-2 mx-auto px-4 py-2 bg-amber-500/15 text-amber-600 dark:text-amber-300 hover:bg-amber-500/25 border border-amber-500/20 rounded-[11px] text-sm transition-colors">
                            <Settings2 size={14} />ตั้งแผนงวดการชำระเงิน
                          </button>
                        </div>
                      ) : (
                        <div className="space-y-2">
                          <div className="flex items-center gap-3 mb-4 flex-wrap">
                            <span className="text-xs px-2 py-1 rounded-lg" style={{ background: 'var(--hover-bg)', color: 'var(--text-2)' }}>
                              แผน {job.payment_plan_type} · {job.work_days} วัน
                            </span>
                            {job.contract_date && <span className="text-xs" style={{ color: 'var(--text-2)' }}>สัญญา {fmtDate(job.contract_date)}</span>}
                            {job.work_start_date && <span className="text-xs text-amber-400">เริ่มงาน {fmtDate(job.work_start_date)}</span>}
                            {job.work_start_date && job.work_days && (
                              <span className="text-xs" style={{ color: 'var(--text-2)' }}>
                                → คาดเสร็จ {fmtDate(new Date(new Date(job.work_start_date).getTime() + job.work_days * 86400000).toISOString().slice(0, 10))}
                              </span>
                            )}
                            <button onClick={e => { e.stopPropagation(); setPlanJob(job) }} className="text-xs text-accent-blue flex items-center gap-1 hover:underline">
                              <Settings2 size={11} />แก้ไขแผน
                            </button>
                          </div>
                          {job.installments.map(inst => (
                            <div key={inst.id} className={`flex items-center gap-3 p-3 rounded-[11px] border ${inst.status === 'paid' ? 'bg-green-500/5 border-green-500/15' : ''}`}
                              style={inst.status !== 'paid' ? { background: 'var(--hover-bg)', border: '1px solid var(--divider)' } : undefined}>
                              <div className="flex-shrink-0">
                                {inst.status === 'paid' ? <CheckCircle2 size={18} className="text-green-400" /> : <Circle size={18} style={{ color: 'var(--divider)' }} />}
                              </div>
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2 flex-wrap">
                                  <span className="text-sm font-semibold" style={{ color: 'var(--text-1)' }}>{inst.installment_name}</span>
                                  {inst.is_work_trigger && <span className="text-[9px] bg-amber-500/15 text-amber-600 dark:text-amber-300 px-1.5 py-0.5 rounded">▶ เริ่มงาน</span>}
                                  {inst.is_final && <span className="text-[9px] bg-green-500/15 text-green-400 px-1.5 py-0.5 rounded">⚑ สุดท้าย</span>}
                                </div>
                                <div className="flex items-center gap-3 mt-0.5 text-xs" style={{ color: 'var(--text-2)' }}>
                                  {inst.paid_date ? <span className="text-green-400">ชำระ {fmtDate(inst.paid_date)}</span>
                                    : inst.due_date ? <span>กำหนด {fmtDate(inst.due_date)}</span> : null}
                                  {inst.file_urls.length > 0 && (
                                    <span className="flex items-center gap-1 text-accent-blue"><Paperclip size={10} />{inst.file_urls.length} ไฟล์</span>
                                  )}
                                </div>
                              </div>
                              <div className="text-right flex-shrink-0">
                                <p className="font-semibold" style={{ color: 'var(--text-1)' }}>{fmtBaht(inst.amount)}</p>
                                <p className="text-xs" style={{ color: 'var(--text-3)' }}>{inst.percentage}%</p>
                              </div>
                              {inst.status !== 'paid' && (
                                <div className="flex flex-col gap-1 flex-shrink-0">
                                  <button onClick={() => setRecordInstallment(inst)}
                                    className="text-xs px-3 py-1.5 rounded-lg bg-[#238636]/20 text-green-400 hover:bg-[#238636]/40 border border-green-600/20 transition-colors">
                                    บันทึก
                                  </button>
                                  <button onClick={() => { setFollowupPaymentId(inst.id); setFollowupNote('') }}
                                    className="text-xs px-2 py-1 rounded-lg transition-colors text-center"
                                    style={{ background: 'rgba(99,102,241,0.15)', color: '#a78bfa', border: '1px solid rgba(99,102,241,0.2)' }}>
                                    📝{followupCounts[inst.id] ? ` ${followupCounts[inst.id]}×` : ' ติดตาม'}
                                  </button>
                                </div>
                              )}
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )
            })}
            {filtered.length === 0 && (
              <div className="text-center py-12 text-sm" style={{ color: 'var(--text-3)' }}>ไม่พบรายการ</div>
            )}
          </div>
        </>
      )}

      {planJob && <PlanSetupModal job={planJob} open={!!planJob} onClose={() => setPlanJob(null)} onSaved={load} />}
      <RecordPaymentModal installment={recordInstallment} open={!!recordInstallment}
        onClose={() => setRecordInstallment(null)} onSaved={handlePaymentSaved} />

      {/* Follow-up Modal */}
      {followupPaymentId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={() => setFollowupPaymentId(null)}>
          <div className="absolute inset-0" style={{ background: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(4px)' }} />
          <div className="relative w-full max-w-sm rounded-[18px] p-5 shadow-2xl" style={{ background: 'var(--card-bg)', border: '1px solid var(--divider)' }}
            onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-section-title" style={{ color: 'var(--text-1)' }}>📝 บันทึกการติดตาม</h3>
              <button onClick={() => setFollowupPaymentId(null)} style={{ color: 'var(--text-3)' }}><X size={16} /></button>
            </div>
            <textarea
              value={followupNote}
              onChange={e => setFollowupNote(e.target.value)}
              placeholder="บันทึกว่าติดต่อแล้ว / นัดหมาย / ลูกค้าแจ้งว่า..."
              rows={3}
              className="w-full rounded-[8px] px-3 py-2 text-sm resize-none outline-none"
              style={{ background: 'var(--hover-bg)', border: '1px solid var(--divider)', color: 'var(--text-1)' }}
              autoFocus
            />
            <div className="flex justify-end gap-2 mt-3">
              <button onClick={() => setFollowupPaymentId(null)} className="px-4 py-2 text-sm" style={{ color: 'var(--text-3)' }}>ยกเลิก</button>
              <button onClick={saveFollowup} disabled={followupSaving || !followupNote.trim()}
                className="px-4 py-2 text-sm rounded-full text-white disabled:opacity-40 transition-colors"
                style={{ background: '#6366f1' }}>
                {followupSaving ? 'กำลังบันทึก...' : 'บันทึก'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
