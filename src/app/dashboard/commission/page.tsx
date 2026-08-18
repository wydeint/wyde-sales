'use client'

import { useEffect, useState, useCallback, useMemo } from 'react'
import { createClient } from '@/lib/supabase/client'
import { DollarSign, ChevronDown, ChevronRight, CheckCircle, Clock, Banknote, Plus, Trash2, Users, TrendingUp, AlertCircle } from 'lucide-react'
import { PageSpinner, PageError, EmptyState, TableEmpty } from '@/components/ui/StateUI'
import PageHeader from '@/components/ui/PageHeader'
import FilterBar from '@/components/ui/FilterBar'
import { COMMISSION_STATUSES } from '@/lib/status'
import PeriodPicker from '@/components/ui/PeriodPicker'
import { getPeriodBounds, type PeriodUnit } from '@/lib/period'

// ─── Types ────────────────────────────────────────────────
interface Job {
  id: string
  customer_name: string
  room_no: string
  revenue_ex_vat: number
  revenue_inc_vat: number
  commission_rate: number | null
  commission_amount: number | null
  commission_status: string | null
  commission_month: string | null
  actual_deliver_date: string | null
  working_status: string
  order_date: string | null
  sales_id: string
  sales?: { name: string }
  projects?: { name: string }
}

interface Referral {
  id: string
  job_id: string
  referrer_name: string
  referral_amount: number
}

interface Tier {
  revenue_min: number
  revenue_max: number | null
  rate: number
}

// ─── Helpers ──────────────────────────────────────────────
function calcTier(revenue: number, tiers: Tier[]): { rate: number; amount: number } {
  const sorted = [...tiers].sort((a, b) => a.revenue_min - b.revenue_min)
  for (const t of sorted) {
    if (revenue >= t.revenue_min && (t.revenue_max === null || revenue <= t.revenue_max)) {
      return { rate: t.rate, amount: Math.round(revenue * t.rate) }
    }
  }
  return { rate: 0, amount: 0 }
}

const f = (v: number) => '฿' + Math.round(v || 0).toLocaleString()
const fDate = (d: string | null) => d ? new Date(d).toLocaleDateString('th-TH', { day: '2-digit', month: 'short', year: '2-digit' }) : '—'

// Labels and colours come from the shared vocabulary; only the icon is local.
const STATUS_ICON: Record<string, typeof Clock> = { pending: Clock, approved: CheckCircle, paid: Banknote }
const STATUS_CFG: Record<string, { label: string; color: string; bg: string; icon: typeof Clock }> =
  Object.fromEntries(COMMISSION_STATUSES.map(s => [s.value, {
    label: s.label,
    color: s.color,
    bg: `color-mix(in srgb, ${s.color} 12%, transparent)`,
    icon: STATUS_ICON[s.value],
  }]))
const STATUSES = COMMISSION_STATUSES.map(s => s.value) as ('pending' | 'approved' | 'paid')[]

const MONTHS_TH = ['ม.ค.','ก.พ.','มี.ค.','เม.ย.','พ.ค.','มิ.ย.','ก.ค.','ส.ค.','ก.ย.','ต.ค.','พ.ย.','ธ.ค.']
function monthLabel(ym: string) {
  if (!ym || ym === 'ไม่ระบุ') return 'ไม่ระบุเดือน'
  const [y, m] = ym.split('-')
  if (!y || !m || isNaN(parseInt(m)) || isNaN(parseInt(y))) return ym
  return `${MONTHS_TH[parseInt(m) - 1]} ${parseInt(y) + 543}`
}
function normalizeYM(ym: string) {
  if (!ym) return ''
  const [y, m] = ym.split('-')
  if (!y || !m) return ym
  return `${y}-${m.padStart(2, '0')}`
}

// ─── Tab bar ──────────────────────────────────────────────
const TABS = [
  { key: 'individual', label: 'รายบุคคล' },
  { key: 'referral',   label: 'ค่าแนะนำ' },
  { key: 'status',     label: 'สถานะค่าคอม' },
] as const
type TabKey = typeof TABS[number]['key']

// ─── Tab 1: รายบุคคล ──────────────────────────────────────
function IndividualTab({
  jobs, tiers, referrals, myUserId, myRole, salesUsers
}: {
  jobs: Job[]; tiers: Tier[]; referrals: Referral[]
  myUserId: string; myRole: string; salesUsers: { id: string; name: string }[]
}) {
  const isManager = ['admin', 'admin_sales', 'manager'].includes(myRole)
  const [filterSales, setFilterSales] = useState<string>(isManager ? 'all' : myUserId)
  const [expanded, setExpanded] = useState<Set<string>>(new Set())

  function getCommission(j: Job) { return calcTier(j.revenue_ex_vat || 0, tiers) }
  function getStatus(j: Job) {
    if (j.commission_status) return j.commission_status
    const cur = new Date().toISOString().slice(0, 7)
    const jm = normalizeYM(j.commission_month || j.actual_deliver_date?.slice(0, 7) || '')
    return jm < cur ? 'paid' : 'pending'
  }
  function getMonth(j: Job) { return normalizeYM(j.commission_month || j.actual_deliver_date?.slice(0, 7) || '') }

  const filtered = useMemo(() => {
    if (filterSales === 'all') return jobs
    return jobs.filter(j => j.sales_id === filterSales)
  }, [jobs, filterSales])

  const byMonth = useMemo(() => {
    const map = new Map<string, Job[]>()
    for (const j of filtered) {
      const key = getMonth(j) || 'ไม่ระบุ'
      if (!map.has(key)) map.set(key, [])
      map.get(key)!.push(j)
    }
    return Array.from(map.entries()).sort((a, b) => b[0].localeCompare(a[0]))
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filtered])

  const totalComm = filtered.reduce((s, j) => s + getCommission(j).amount, 0)
  const totalRef  = referrals.filter(r => filtered.some(j => j.id === r.job_id)).reduce((s, r) => s + r.referral_amount, 0)

  function toggleMonth(k: string) {
    setExpanded(s => { const n = new Set(s); n.has(k) ? n.delete(k) : n.add(k); return n })
  }

  const selectedName = filterSales === 'all' ? 'ทุกคน' : salesUsers.find(u => u.id === filterSales)?.name || '—'

  return (
    <div className="space-y-4">
      {/* Sales selector (manager only) — in the filter card as a scrolling chip
          row. Eleven buttons floating loose wrapped onto three lines, so the
          page height moved with the number of salespeople. */}
      {isManager && (
        <div className="tab-group mb-4 flex-wrap">
          <button onClick={() => setFilterSales('all')}
            className={`tab-btn ${filterSales === 'all' ? 'active' : ''}`}>
            ทั้งหมด
          </button>
          {salesUsers.map(u => (
            <button key={u.id} onClick={() => setFilterSales(u.id)}
              className={`tab-btn ${filterSales === u.id ? 'active' : ''}`}>
              {u.name}
            </button>
          ))}
        </div>
      )}

      {/* Summary */}
      <div className="grid grid-cols-2 gap-3">
        <div className="ds-card-sm p-4">
          <p className="text-xs mb-1" style={{ color: 'var(--text-3)' }}>ค่าคอม {selectedName} · {filtered.length} งาน</p>
          <p className="text-kpi-number" style={{ color: 'var(--accent-amber)' }}>{f(totalComm)}</p>
        </div>
        <div className="ds-card-sm p-4">
          <p className="text-xs mb-1" style={{ color: 'var(--text-3)' }}>ค่าแนะนำรวม</p>
          <p className="text-kpi-number" style={{ color: 'var(--accent-blue)' }}>{f(totalRef)}</p>
        </div>
      </div>

      {/* Monthly groups */}
      {byMonth.length === 0 && (
        <div className="ds-card"><EmptyState icon={DollarSign} message="ไม่พบข้อมูล Commission" /></div>
      )}

      <div className="space-y-3">
        {byMonth.map(([month, monthJobs]) => {
          const isOpen = expanded.has(month)
          const monthComm = monthJobs.reduce((s, j) => s + getCommission(j).amount, 0)
          const monthRef  = referrals.filter(r => monthJobs.some(j => j.id === r.job_id)).reduce((s, r) => s + r.referral_amount, 0)
          const statusCounts = { pending: 0, approved: 0, paid: 0 }
          monthJobs.forEach(j => { const s = getStatus(j) as keyof typeof statusCounts; if (s in statusCounts) statusCounts[s]++ })

          return (
            <div key={month} className="ds-card overflow-hidden" style={{ padding: 0 }}>
              <button className="w-full flex items-center justify-between px-5 py-4 text-left"
                style={{ background: isOpen ? 'var(--hover-bg)' : 'transparent' }}
                onClick={() => toggleMonth(month)}>
                <div className="flex items-center gap-3">
                  {isOpen ? <ChevronDown size={15} style={{ color: 'var(--accent)' }} /> : <ChevronRight size={15} style={{ color: 'var(--text-3)' }} />}
                  <div>
                    <p className="font-bold text-sm" style={{ color: 'var(--text-1)' }}>{monthLabel(month)}</p>
                    <p className="text-label mt-0.5" style={{ color: 'var(--text-3)' }}>{monthJobs.length} งาน</p>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <div className="flex gap-1.5">
                    {STATUSES.map(s => statusCounts[s] > 0 && (
                      <span key={s} className="text-micro font-semibold px-2 py-0.5 rounded-full"
                        style={{ background: STATUS_CFG[s].bg, color: STATUS_CFG[s].color }}>
                        {statusCounts[s]}
                      </span>
                    ))}
                  </div>
                  <div className="text-right">
                    <p className="font-bold text-sm" style={{ color: 'var(--accent-amber)' }}>{f(monthComm)}</p>
                    {monthRef > 0 && <p className="text-micro" style={{ color: 'var(--accent-blue)' }}>+{f(monthRef)} แนะนำ</p>}
                  </div>
                </div>
              </button>

              {isOpen && (
                <div className="overflow-x-auto" style={{ borderTop: '1px solid var(--divider)', WebkitOverflowScrolling: 'touch' as any }}>
                  <table className="w-full text-sm" style={{ minWidth: 560 }}>
                    <thead>
                      <tr style={{ background: 'var(--hover-bg)', borderBottom: '1px solid var(--divider)' }}>
                        {['ลูกค้า / ห้อง', 'โครงการ', ...(isManager ? ['Sales'] : []), 'Revenue', 'Rate', 'Commission', 'สถานะ'].map(h => (
                          <th key={h} className={`px-4 py-2 text-xs font-semibold ${['ลูกค้า / ห้อง', 'โครงการ', 'Sales', 'สถานะ'].includes(h) ? 'text-left' : 'text-right'}`}
                            style={{ color: 'var(--text-3)' }}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {monthJobs.map(j => {
                        const { rate, amount } = getCommission(j)
                        const status = getStatus(j)
                        const cfg = STATUS_CFG[status] || STATUS_CFG.pending
                        const Icon = cfg.icon
                        const jobRefs = referrals.filter(r => r.job_id === j.id)
                        const refTotal = jobRefs.reduce((s, r) => s + r.referral_amount, 0)
                        return (
                          <tr key={j.id} style={{ borderBottom: '1px solid var(--divider)' }}>
                            <td className="px-4 py-3">
                              <p className="font-semibold text-sm" style={{ color: 'var(--text-1)' }}>{j.customer_name || '—'}</p>
                              <p className="text-label" style={{ color: 'var(--text-3)' }}>ห้อง {j.room_no}</p>
                              {refTotal > 0 && (
                                <p className="text-micro mt-0.5" style={{ color: 'var(--accent-blue)' }}>
                                  แนะนำ {f(refTotal)}
                                </p>
                              )}
                            </td>
                            <td className="px-4 py-3 text-xs" style={{ color: 'var(--text-3)' }}>{(j.projects as any)?.name || '—'}</td>
                            {isManager && <td className="px-4 py-3 text-xs" style={{ color: 'var(--text-2)' }}>{(j.sales as any)?.name || '—'}</td>}
                            <td className="px-4 py-3 text-right text-xs" style={{ color: 'var(--text-2)' }}>{f(j.revenue_ex_vat)}</td>
                            <td className="px-4 py-3 text-right text-xs" style={{ color: 'var(--text-3)' }}>
                              {rate ? (rate * 100).toFixed(2) + '%' : '—'}
                            </td>
                            <td className="px-4 py-3 text-right font-bold text-sm" style={{ color: 'var(--accent-amber)' }}>{f(amount)}</td>
                            <td className="px-4 py-3">
                              <span className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-semibold w-fit"
                                style={{ background: cfg.bg, color: cfg.color }}>
                                <Icon size={11} />{cfg.label}
                              </span>
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                    <tfoot>
                      <tr style={{ borderTop: '2px solid var(--divider)', background: 'var(--hover-bg)' }}>
                        <td colSpan={isManager ? 5 : 4} className="px-4 py-2.5 text-xs font-semibold" style={{ color: 'var(--text-2)' }}>รวม {monthLabel(month)}</td>
                        <td className="px-4 py-2.5 text-right font-bold text-sm" style={{ color: 'var(--accent-amber)' }}>{f(monthComm)}</td>
                        <td />
                      </tr>
                    </tfoot>
                  </table>
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ─── Tab 2: ค่าแนะนำ ──────────────────────────────────────
function ReferralTab({
  jobs, referrals, myUserId, myRole, salesUsers, onReferralChanged
}: {
  jobs: Job[]; referrals: Referral[]
  myUserId: string; myRole: string
  salesUsers: { id: string; name: string }[]
  onReferralChanged: (jobId: string, refs: Referral[]) => void
}) {
  const isManager = ['admin', 'admin_sales', 'manager'].includes(myRole)
  const supabase = createClient()
  const [addingFor, setAddingFor] = useState<string | null>(null)
  const [inputMode, setInputMode] = useState<'amount' | 'pct'>('amount')
  const [newName, setNewName] = useState('')
  const [newAmount, setNewAmount] = useState('')
  const [newPct, setNewPct] = useState<1 | 2 | 3>(1)
  const [saving, setSaving] = useState(false)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [filterStatus, setFilterStatus] = useState('all')
  const [filterSales, setFilterSales] = useState('all')

  const STATUS_OPTS = [
    { value: 'all', label: 'ทุกสถานะ' },
    { value: 'จอง', label: 'จอง' },
    { value: 'กำลังดำเนินการ', label: 'กำลังดำเนินการ' },
    { value: 'ดำเนินการ', label: 'ดำเนินการ' },
    { value: 'รอส่งมอบ', label: 'รอส่งมอบ' },
    { value: 'ส่งมอบแล้ว', label: 'ส่งมอบแล้ว' },
  ]

  const filteredJobs = useMemo(() => {
    const q = search.trim().toLowerCase()
    return jobs.filter(j => {
      const matchSearch = !q || j.customer_name.toLowerCase().includes(q) || j.room_no.toLowerCase().includes(q) || ((j.projects as any)?.name || '').toLowerCase().includes(q)
      const matchStatus = filterStatus === 'all' || j.working_status === filterStatus
      const matchSales  = filterSales === 'all' || j.sales_id === filterSales
      return matchSearch && matchStatus && matchSales
    })
  }, [jobs, search, filterStatus, filterSales])

  function canEdit(j: Job) { return isManager || j.sales_id === myUserId }

  function calcPctAmount(j: Job) { return Math.round((j.revenue_ex_vat || j.revenue_inc_vat / 1.07) * (newPct / 100)) }

  function openAdd(jobId: string) {
    setAddingFor(jobId); setNewName(''); setNewAmount(''); setNewPct(1); setInputMode('amount')
  }

  async function addReferral(j: Job) {
    const amount = inputMode === 'amount' ? Number(newAmount) : calcPctAmount(j)
    if (!newName.trim() || !amount) return
    setSaving(true)
    const id = `REF-${j.id}-${Date.now().toString(36).toUpperCase()}`
    const row = { id, job_id: j.id, referrer_name: newName.trim(), referral_amount: amount }
    await supabase.from('commission_referrals').insert(row)
    onReferralChanged(j.id, [...referrals.filter(r => r.job_id === j.id), row])
    setAddingFor(null); setSaving(false)
  }

  async function deleteReferral(jobId: string, refId: string) {
    setDeletingId(refId)
    await supabase.from('commission_referrals').delete().eq('id', refId)
    onReferralChanged(jobId, referrals.filter(r => r.job_id === jobId && r.id !== refId))
    setDeletingId(null)
  }

  const totalRef = referrals.reduce((s, r) => s + r.referral_amount, 0)

  return (
    <div className="space-y-4">
      {/* Summary */}
      <div className="ds-card-sm p-4 flex items-center justify-between">
        <div>
          <p className="text-xs" style={{ color: 'var(--text-3)' }}>ค่าแนะนำรวมทั้งหมด</p>
          <p className="text-2xl font-bold mt-0.5" style={{ color: 'var(--accent-blue)' }}>{f(totalRef)}</p>
        </div>
        <Users size={28} style={{ color: 'var(--accent-blue)', opacity: 0.3 }} />
      </div>

      {/* Filters */}
      <FilterBar search={search} onSearchChange={setSearch} searchPlaceholder="ค้นหาลูกค้า ห้อง หรือโครงการ...">
        <div className="tab-group">
          {STATUS_OPTS.map(opt => (
            <button key={opt.value} onClick={() => setFilterStatus(opt.value)}
              className={`tab-btn whitespace-nowrap ${filterStatus === opt.value ? 'active' : ''}`}>
              {opt.label}
            </button>
          ))}
        </div>
        {isManager && (
          <select value={filterSales} onChange={e => setFilterSales(e.target.value)}
            className="field-input" style={{ width: 'auto' }}>
            <option value="all">— Sales ทั้งหมด —</option>
            {salesUsers.map(u => <option key={u.id} value={u.id}>{u.name}</option>)}
          </select>
        )}
      </FilterBar>

      {/* Job list */}
      <div className="space-y-2">
        {filteredJobs.map(j => {
          const jobRefs = referrals.filter(r => r.job_id === j.id)
          const refTotal = jobRefs.reduce((s, r) => s + r.referral_amount, 0)
          const isAdding = addingFor === j.id
          const editable = canEdit(j)

          return (
            <div key={j.id} className="ds-card-sm overflow-hidden" style={{ padding: 0 }}>
              {/* Job header */}
              <div className="flex items-center justify-between px-4 py-3">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-semibold" style={{ color: 'var(--text-1)' }}>{j.customer_name}</span>
                    <span className="text-micro px-1.5 py-0.5 rounded-[5px]" style={{ background: 'var(--hover-bg)', color: 'var(--text-3)' }}>
                      {j.room_no}
                    </span>
                  </div>
                  <p className="text-label mt-0.5" style={{ color: 'var(--text-3)' }}>
                    {(j.projects as any)?.name || '—'} · {(j.sales as any)?.name || '—'} · {j.working_status}
                    {j.actual_deliver_date ? ` · ส่งมอบ ${fDate(j.actual_deliver_date)}` : j.order_date ? ` · จอง ${fDate(j.order_date)}` : ''}
                  </p>
                </div>
                <div className="flex items-center gap-3">
                  {refTotal > 0 && (
                    <span className="text-sm font-bold" style={{ color: 'var(--accent-blue)' }}>{f(refTotal)}</span>
                  )}
                  {editable && (
                    <button onClick={() => isAdding ? setAddingFor(null) : openAdd(j.id)}
                      className="flex items-center gap-1 text-xs px-2.5 py-1.5 rounded-[8px] font-semibold"
                      style={{ background: isAdding ? 'var(--hover-bg)' : 'color-mix(in srgb, var(--accent-blue) 12%, transparent)', color: isAdding ? 'var(--text-3)' : 'var(--accent-blue)', border: '1px solid var(--divider)' }}>
                      <Plus size={11} />{isAdding ? 'ยกเลิก' : 'เพิ่ม'}
                    </button>
                  )}
                </div>
              </div>

              {/* Existing referrals */}
              {jobRefs.length > 0 && (
                <div className="px-4 pb-2 space-y-1" style={{ borderTop: '1px dashed var(--divider)' }}>
                  {jobRefs.map(r => (
                    <div key={r.id} className="flex items-center justify-between py-1">
                      <div className="flex items-center gap-2">
                        <Users size={11} style={{ color: 'var(--accent-blue)' }} />
                        <span className="text-xs" style={{ color: 'var(--text-1)' }}>{r.referrer_name}</span>
                      </div>
                      <div className="flex items-center gap-3">
                        <span className="text-sm font-semibold" style={{ color: 'var(--accent-blue)' }}>{f(r.referral_amount)}</span>
                        {editable && (
                          <button onClick={() => deleteReferral(j.id, r.id)} disabled={deletingId === r.id}
                            className="opacity-40 hover:opacity-100 transition-opacity" style={{ color: 'var(--accent-red)' }}>
                            <Trash2 size={12} />
                          </button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {/* Add form */}
              {isAdding && (
                <div className="px-4 py-3 space-y-3" style={{ borderTop: '1px solid var(--divider)', background: 'var(--hover-bg)' }}>
                  {/* Input mode toggle */}
                  <div className="flex gap-1 p-0.5 rounded-[8px] w-fit" style={{ background: 'var(--input-bg)', border: '1px solid var(--divider)' }}>
                    {(['amount', 'pct'] as const).map(mode => (
                      <button key={mode} onClick={() => setInputMode(mode)}
                        className="px-3 py-1 rounded-[6px] text-xs font-semibold transition-colors"
                        style={{ background: inputMode === mode ? 'var(--accent-blue)' : 'transparent', color: inputMode === mode ? '#fff' : 'var(--text-3)' }}>
                        {mode === 'amount' ? 'กรอกยอด' : 'เลือก %'}
                      </button>
                    ))}
                  </div>

                  <div className="flex gap-2 items-end">
                    <div className="flex-1">
                      <p className="text-micro mb-1" style={{ color: 'var(--text-3)' }}>ชื่อผู้แนะนำ</p>
                      <input value={newName} onChange={e => setNewName(e.target.value)}
                        placeholder="ชื่อผู้แนะนำ"
                        className="w-full rounded-[8px] px-3 py-2 text-xs focus:outline-none"
                        style={{ background: 'var(--input-bg)', border: '1px solid var(--divider)', color: 'var(--text-1)' }} />
                    </div>

                    {inputMode === 'amount' ? (
                      <div className="w-32">
                        <p className="text-micro mb-1" style={{ color: 'var(--text-3)' }}>ยอดเงิน (฿)</p>
                        <input type="number" value={newAmount} onChange={e => setNewAmount(e.target.value)}
                          placeholder="0"
                          className="w-full rounded-[8px] px-3 py-2 text-xs focus:outline-none"
                          style={{ background: 'var(--input-bg)', border: '1px solid var(--divider)', color: 'var(--text-1)' }} />
                      </div>
                    ) : (
                      <div>
                        <p className="text-micro mb-1" style={{ color: 'var(--text-3)' }}>% ของ Package</p>
                        <div className="flex gap-1">
                          {([1, 2, 3] as const).map(p => (
                            <button key={p} onClick={() => setNewPct(p)}
                              className="px-2.5 py-2 rounded-[6px] text-xs font-bold"
                              style={{ background: newPct === p ? 'var(--accent-blue)' : 'var(--input-bg)', color: newPct === p ? '#fff' : 'var(--text-2)', border: '1px solid var(--divider)' }}>
                              {p}%
                            </button>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>

                  {inputMode === 'pct' && (
                    <p className="text-xs" style={{ color: 'var(--accent-blue)' }}>
                      ยอดที่คำนวณ: {f(calcPctAmount(j))} ({newPct}% ของ {f(j.revenue_inc_vat || j.revenue_ex_vat * 1.07)})
                    </p>
                  )}

                  <div className="flex gap-2">
                    <button onClick={() => addReferral(j)} disabled={saving || !newName.trim() || (inputMode === 'amount' && !newAmount)}
                      className="flex-1 py-2 rounded-[8px] text-xs font-semibold text-white disabled:opacity-50"
                      style={{ background: 'var(--accent-blue)' }}>
                      {saving ? 'กำลังบันทึก...' : 'บันทึกค่าแนะนำ'}
                    </button>
                  </div>
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ─── Tab 3: สถานะค่าคอม ───────────────────────────────────
function StatusTab({
  jobs, tiers, referrals, myRole, salesUsers, onStatusChange
}: {
  jobs: Job[]; tiers: Tier[]; referrals: Referral[]
  myRole: string; salesUsers: { id: string; name: string }[]
  onStatusChange: (jobId: string, status: string) => void
}) {
  const isManager  = ['admin', 'admin_sales', 'manager'].includes(myRole)
  const canApprove = ['admin', 'admin_sales'].includes(myRole)
  const [filterStatus, setFilterStatus] = useState<string>('all')
  const [filterSales, setFilterSales] = useState<string>('all')
  const [periodMode, setPeriodMode] = useState<PeriodUnit>('month')
  const [periodOffset, setPeriodOffset] = useState(0)
  const [saving, setSaving] = useState<string | null>(null)
  const supabase = createClient()

  const now = new Date()
  const curMonth = now.toISOString().slice(0, 7)
  const curYear = now.getFullYear()

  // The three option lists (12 months, 8 quarters, 4 years) and the three
  // selection states they fed are gone — PeriodPicker walks periods by offset.

  function getCommission(j: Job) { return calcTier(j.revenue_ex_vat || 0, tiers) }
  function getStatus(j: Job) {
    if (j.commission_status) return j.commission_status
    const jm = normalizeYM(j.commission_month || j.actual_deliver_date?.slice(0, 7) || '')
    return jm < curMonth ? 'paid' : 'pending'
  }
  function getMonth(j: Job) { return normalizeYM(j.commission_month || j.actual_deliver_date?.slice(0, 7) || '') }

  // Compares against the shared period bounds instead of three hand-rolled
  // comparisons against three separate pieces of state.
  const periodBounds = getPeriodBounds(periodMode, periodOffset)
  function matchPeriod(j: Job): boolean {
    const ym = getMonth(j)
    if (!ym) return false
    return ym >= periodBounds.start.slice(0, 7) && ym <= periodBounds.end.slice(0, 7)
  }

  const periodJobs = useMemo(() => jobs.filter(matchPeriod), [jobs, periodMode, periodOffset])  // eslint-disable-line react-hooks/exhaustive-deps

  const filtered = useMemo(() => {
    return periodJobs.filter(j => {
      const matchStatus = filterStatus === 'all' || getStatus(j) === filterStatus
      const matchSales  = filterSales === 'all' || j.sales_id === filterSales
      return matchStatus && matchSales
    })
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [periodJobs, filterStatus, filterSales])

  const periodComm = periodJobs.reduce((s, j) => s + getCommission(j).amount, 0)
  const periodRef  = referrals.filter(r => periodJobs.some(j => j.id === r.job_id)).reduce((s, r) => s + r.referral_amount, 0)

  const pendingComm   = periodJobs.filter(j => getStatus(j) === 'pending').reduce((s, j) => s + getCommission(j).amount, 0)
  const approvedComm  = periodJobs.filter(j => getStatus(j) === 'approved').reduce((s, j) => s + getCommission(j).amount, 0)
  const paidComm      = periodJobs.filter(j => getStatus(j) === 'paid').reduce((s, j) => s + getCommission(j).amount, 0)
  const totalRef      = referrals.filter(r => periodJobs.some(j => j.id === r.job_id)).reduce((s, r) => s + r.referral_amount, 0)

  async function updateStatus(jobId: string, newStatus: string) {
    setSaving(jobId)
    await supabase.from('jobs').update({ commission_status: newStatus }).eq('id', jobId)
    onStatusChange(jobId, newStatus)
    setSaving(null)
  }


  return (
    <div className="space-y-4">
      {/* Period selector — was hand-rolled pills plus a dropdown that swapped per
          mode, the same shape (and the same width jitter) that PeriodPicker was
          built to replace on Sales Targets. */}
      <FilterBar className="mb-4">
        <PeriodPicker unit={periodMode} setUnit={setPeriodMode} offset={periodOffset} setOffset={setPeriodOffset} />
        {isManager && (
          <select value={filterSales} onChange={e => setFilterSales(e.target.value)}
            className="field-input" style={{ width: 'auto' }}>
            <option value="all">— Sales ทั้งหมด —</option>
            {salesUsers.map(u => <option key={u.id} value={u.id}>{u.name}</option>)}
          </select>
        )}
      </FilterBar>

      {/* One row of four, not a strip of three plus a grid of four.
          The old pair repeated ค่าแนะนำ in both, and รวม was just the sum of the
          two figures beside it — seven numbers where four carry the meaning, and
          on a phone that filled half the screen before the table appeared.
          The total leads and names its own split; the three statuses follow. */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-4">
        <div className="ds-card-sm p-4">
          <p className="text-xs mb-1" style={{ color: 'var(--text-3)' }}>รวมทั้งหมด</p>
          <p className="text-kpi-money" style={{ color: 'var(--accent-green)' }}>{f(periodComm + periodRef)}</p>
          <p className="text-micro mt-0.5" style={{ color: 'var(--text-3)' }}>
            ค่าคอม {f(periodComm)} · ค่าแนะนำ {f(periodRef)}
          </p>
        </div>

        {STATUSES.map(st => {
          const cfg = STATUS_CFG[st]
          const Icon = cfg.icon
          const commAmt = st === 'pending' ? pendingComm : st === 'approved' ? approvedComm : paidComm
          const cnt = periodJobs.filter(j => getStatus(j) === st).length
          return (
            <div key={st} className="ds-card-sm p-4">
              <div className="flex items-center gap-1.5 mb-1">
                <Icon size={13} style={{ color: cfg.color }} />
                <p className="text-xs font-semibold" style={{ color: cfg.color }}>{cfg.label}</p>
              </div>
              <p className="text-kpi-money" style={{ color: 'var(--text-1)' }}>{f(commAmt)}</p>
              <p className="text-micro mt-0.5" style={{ color: 'var(--text-3)' }}>{cnt} งาน</p>
            </div>
          )
        })}
      </div>

      {/* Status chips get the shared .tab-group chrome and sit directly above the
          list they filter — the Customers pattern. The Sales select moved up into
          the filter card, since it narrows the whole view rather than the status. */}
      <div className="tab-group mb-4 flex-wrap">
        <button onClick={() => setFilterStatus('all')}
          className={`tab-btn ${filterStatus === 'all' ? 'active' : ''}`}>
          ทั้งหมด {filtered.length}
        </button>
        {STATUSES.map(s2 => (
          <button key={s2} onClick={() => setFilterStatus(filterStatus === s2 ? 'all' : s2)}
            className={`tab-btn ${filterStatus === s2 ? 'active' : ''}`}>
            {STATUS_CFG[s2].label}
          </button>
        ))}
      </div>

      {/* Job list */}
      <div className="ds-card tbl-scroll" style={{ padding: 0 }}>
        {filtered.length === 0 ? (
          <EmptyState icon={AlertCircle} message="ไม่พบรายการ" />
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr style={{ background: 'var(--hover-bg)', borderBottom: '1px solid var(--divider)' }}>
                {['ลูกค้า / ห้อง', ...(isManager ? ['Sales'] : []), 'เดือน', 'ค่าคอม', 'ค่าแนะนำ', 'รวม', 'สถานะ'].map(h => (
                  <th key={h} className={`px-4 py-2.5 text-xs font-semibold ${['ลูกค้า / ห้อง', 'Sales', 'สถานะ'].includes(h) ? 'text-left' : 'text-right'}`}
                    style={{ color: 'var(--text-3)' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.map(j => {
                const { amount } = getCommission(j)
                const status = getStatus(j)
                const cfg = STATUS_CFG[status] || STATUS_CFG.pending
                const Icon = cfg.icon
                const isSaving = saving === j.id
                const jobRefTotal = referrals.filter(r => r.job_id === j.id).reduce((s, r) => s + r.referral_amount, 0)
                return (
                  <tr key={j.id} style={{ borderBottom: '1px solid var(--divider)' }}>
                    <td className="px-4 py-3">
                      <p className="font-semibold text-sm" style={{ color: 'var(--text-1)' }}>{j.customer_name}</p>
                      <p className="text-label" style={{ color: 'var(--text-3)' }}>ห้อง {j.room_no} · {(j.projects as any)?.name || '—'}</p>
                    </td>
                    {isManager && <td className="px-4 py-3 text-xs" style={{ color: 'var(--text-2)' }}>{(j.sales as any)?.name || '—'}</td>}
                    <td className="px-4 py-3 text-right text-xs" style={{ color: 'var(--text-3)' }}>{monthLabel(getMonth(j))}</td>
                    <td className="px-4 py-3 text-right font-semibold text-sm" style={{ color: 'var(--accent-amber)' }}>{f(amount)}</td>
                    <td className="px-4 py-3 text-right text-xs" style={{ color: jobRefTotal > 0 ? 'var(--accent-blue)' : 'var(--text-3)' }}>
                      {jobRefTotal > 0 ? f(jobRefTotal) : '—'}
                    </td>
                    <td className="px-4 py-3 text-right font-bold text-sm" style={{ color: 'var(--accent-green)' }}>{f(amount + jobRefTotal)}</td>
                    <td className="px-4 py-3">
                      {canApprove ? (
                        <select
                          disabled={isSaving}
                          value={status}
                          onChange={e => updateStatus(j.id, e.target.value)}
                          className="text-xs font-semibold px-2.5 py-1 rounded-lg border-0 outline-none disabled:opacity-50 cursor-pointer"
                          style={{ background: cfg.bg, color: cfg.color }}>
                          {STATUSES.map(s => (
                            <option key={s} value={s}>{STATUS_CFG[s].label}</option>
                          ))}
                        </select>
                      ) : (
                        <span className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-semibold w-fit"
                          style={{ background: cfg.bg, color: cfg.color }}>
                          <Icon size={11} />{cfg.label}
                        </span>
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}

// ─── Main page ────────────────────────────────────────────
export default function CommissionPage() {
  const supabase = createClient()
  const [tab, setTab] = useState<TabKey>('individual')
  const [jobs, setJobs] = useState<Job[]>([])
  const [referrals, setReferrals] = useState<Referral[]>([])
  const [tiers, setTiers] = useState<Tier[]>([])
  const [loading, setLoading] = useState(true)
  const [fetchError, setFetchError] = useState('')
  const [myRole, setMyRole] = useState('')
  const [myUserId, setMyUserId] = useState('')
  const [salesUsers, setSalesUsers] = useState<{ id: string; name: string }[]>([])

  const isManager = ['admin', 'admin_sales', 'manager'].includes(myRole)

  const load = useCallback(async () => {
    setLoading(true); setFetchError('')
    const { data: { user } } = await supabase.auth.getUser()
    const { data: me } = await supabase.from('users').select('id, role').eq('email', user?.email ?? '').single()
    const role = me?.role || ''
    const userId = me?.id || ''
    setMyRole(role); setMyUserId(userId)

    const isManagerRole = ['admin', 'admin_sales', 'manager'].includes(role)

    let jobQuery = supabase
      .from('jobs')
      .select('id,customer_name,room_no,revenue_ex_vat,revenue_inc_vat,commission_rate,commission_amount,commission_status,commission_month,actual_deliver_date,working_status,order_date,sales_id,sales:users!jobs_sales_id_fkey(name),projects(name)')
      .neq('working_status', 'ยกเลิก')
      .order('order_date', { ascending: false })

    if (!isManagerRole && userId) jobQuery = jobQuery.eq('sales_id', userId)

    const [{ data, error }, { data: tierData }, { data: usersData }, { data: refData }] = await Promise.all([
      jobQuery,
      supabase.from('commission_settings').select('revenue_min,revenue_max,rate').eq('active', true),
      isManagerRole
        ? supabase.from('users').select('id, name').eq('active', true).in('dept', ['Sales Executive', 'Administration']).order('name')
        : Promise.resolve({ data: [] }),
      supabase.from('commission_referrals').select('*').order('created_at'),
    ])
    if (error) { setFetchError(error.message); setLoading(false); return }
    setJobs((data || []) as unknown as Job[])
    setTiers((tierData || []) as unknown as Tier[])
    setSalesUsers((usersData || []) as { id: string; name: string }[])
    setReferrals((refData || []) as Referral[])
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

  function handleStatusChange(jobId: string, status: string) {
    setJobs(prev => prev.map(j => j.id === jobId ? { ...j, commission_status: status } : j))
  }

  function handleReferralChanged(jobId: string, updated: Referral[]) {
    setReferrals(prev => [...prev.filter(r => r.job_id !== jobId), ...updated])
  }

  if (loading) return <PageSpinner />
  if (fetchError) return <PageError message={fetchError} onRetry={load} />

  return (
    <div className="page-content space-y-5">
      <PageHeader title="Commission" subtitle="ค่าคอมมิชชั่น · ค่าแนะนำ · สถานะการเบิก" className="" />

      {/* Tab bar */}
      <div className="tab-group w-fit">
        {TABS.map(t => (
          <button key={t.key} onClick={() => setTab(t.key)}
            className={`tab-btn ${tab === t.key ? 'active' : ''}`}>
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'individual' && (
        <IndividualTab
          jobs={jobs.filter(j => j.working_status === 'ส่งมอบแล้ว')} tiers={tiers} referrals={referrals}
          myUserId={myUserId} myRole={myRole} salesUsers={salesUsers}
        />
      )}
      {tab === 'referral' && (
        <ReferralTab
          jobs={jobs} referrals={referrals}
          myUserId={myUserId} myRole={myRole} salesUsers={salesUsers}
          onReferralChanged={handleReferralChanged}
        />
      )}
      {tab === 'status' && (
        <StatusTab
          jobs={jobs.filter(j => j.working_status === 'ส่งมอบแล้ว')} tiers={tiers} referrals={referrals}
          myRole={myRole} salesUsers={salesUsers}
          onStatusChange={handleStatusChange}
        />
      )}
    </div>
  )
}
