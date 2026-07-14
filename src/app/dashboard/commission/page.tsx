'use client'

import { useEffect, useState, useCallback, useMemo } from 'react'
import { createClient } from '@/lib/supabase/client'
import { DollarSign, ChevronDown, ChevronRight, CheckCircle, Clock, Banknote, Plus, Trash2, Users } from 'lucide-react'
import { PageSpinner, PageError } from '@/components/ui/StateUI'

interface Job {
  id: string
  customer_name: string
  room_no: string
  revenue_ex_vat: number
  commission_rate: number | null
  commission_amount: number | null
  commission_status: string | null
  commission_month: string | null
  actual_deliver_date: string
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

const STATUS_CFG: Record<string, { label: string; color: string; bg: string; icon: typeof Clock }> = {
  pending:  { label: 'รอดำเนินการ', color: 'var(--accent-orange)', bg: 'color-mix(in srgb, var(--accent-orange) 12%, transparent)', icon: Clock },
  approved: { label: 'อนุมัติแล้ว',  color: 'var(--accent-blue)',   bg: 'color-mix(in srgb, var(--accent-blue)   12%, transparent)', icon: CheckCircle },
  paid:     { label: 'จ่ายแล้ว',     color: 'var(--accent-green)',  bg: 'color-mix(in srgb, var(--accent-green)  12%, transparent)', icon: Banknote },
}
const STATUSES = ['pending', 'approved', 'paid'] as const

const MONTHS_TH = ['ม.ค.','ก.พ.','มี.ค.','เม.ย.','พ.ค.','มิ.ย.','ก.ค.','ส.ค.','ก.ย.','ต.ค.','พ.ย.','ธ.ค.']
function monthLabel(ym: string) {
  if (!ym) return '—'
  const [y, m] = ym.split('-')
  return `${MONTHS_TH[parseInt(m) - 1]} ${parseInt(y) + 543}`
}

// ─── Referral row editor ───────────────────────────────────
function ReferralSection({ jobId, referrals, canEdit, onChanged }: {
  jobId: string
  referrals: Referral[]
  canEdit: boolean
  onChanged: (jobId: string, refs: Referral[]) => void
}) {
  const supabase = createClient()
  const [adding, setAdding] = useState(false)
  const [newName, setNewName] = useState('')
  const [newAmount, setNewAmount] = useState('')
  const [saving, setSaving] = useState(false)
  const [deletingId, setDeletingId] = useState<string | null>(null)

  async function addReferral() {
    if (!newName.trim() || !newAmount) return
    setSaving(true)
    const id = `REF-${jobId}-${Date.now().toString(36).toUpperCase()}`
    const row = { id, job_id: jobId, referrer_name: newName.trim(), referral_amount: Number(newAmount) }
    await supabase.from('commission_referrals').insert(row)
    onChanged(jobId, [...referrals, row])
    setNewName(''); setNewAmount(''); setAdding(false); setSaving(false)
  }

  async function deleteReferral(id: string) {
    setDeletingId(id)
    await supabase.from('commission_referrals').delete().eq('id', id)
    onChanged(jobId, referrals.filter(r => r.id !== id))
    setDeletingId(null)
  }

  const totalRef = referrals.reduce((s, r) => s + r.referral_amount, 0)

  return (
    <div className="mt-2 pt-2" style={{ borderTop: '1px dashed var(--divider)' }}>
      <div className="flex items-center gap-1.5 mb-1.5">
        <Users size={11} style={{ color: 'var(--accent-blue)' }} />
        <span className="text-[10px] font-semibold" style={{ color: 'var(--accent-blue)' }}>
          ผู้แนะนำ (Referral){totalRef > 0 && ` · ${f(totalRef)}`}
        </span>
        {canEdit && (
          <button onClick={() => setAdding(v => !v)}
            className="ml-auto flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-[5px]"
            style={{ background: 'color-mix(in srgb, var(--accent-blue) 12%, transparent)', color: 'var(--accent-blue)' }}>
            <Plus size={9} /> เพิ่ม
          </button>
        )}
      </div>

      {referrals.length === 0 && !adding && (
        <p className="text-[10px]" style={{ color: 'var(--text-3)' }}>ยังไม่มีผู้แนะนำ</p>
      )}

      {referrals.map(r => (
        <div key={r.id} className="flex items-center justify-between py-0.5">
          <span className="text-xs" style={{ color: 'var(--text-1)' }}>{r.referrer_name}</span>
          <div className="flex items-center gap-2">
            <span className="text-xs font-semibold" style={{ color: 'var(--accent-orange)' }}>{f(r.referral_amount)}</span>
            {canEdit && (
              <button onClick={() => deleteReferral(r.id)} disabled={deletingId === r.id}
                className="opacity-40 hover:opacity-100 transition-opacity" style={{ color: 'var(--accent-red)' }}>
                <Trash2 size={11} />
              </button>
            )}
          </div>
        </div>
      ))}

      {adding && (
        <div className="flex gap-2 mt-1.5 items-center">
          <input value={newName} onChange={e => setNewName(e.target.value)}
            placeholder="ชื่อผู้แนะนำ"
            className="flex-1 rounded-[6px] px-2 py-1 text-xs focus:outline-none"
            style={{ background: 'var(--input-bg)', border: '1px solid var(--divider)', color: 'var(--text-1)' }} />
          <input type="number" value={newAmount} onChange={e => setNewAmount(e.target.value)}
            placeholder="ยอด ฿"
            className="w-24 rounded-[6px] px-2 py-1 text-xs focus:outline-none"
            style={{ background: 'var(--input-bg)', border: '1px solid var(--divider)', color: 'var(--text-1)' }} />
          <button onClick={addReferral} disabled={saving || !newName.trim() || !newAmount}
            className="px-2.5 py-1 rounded-[6px] text-xs font-semibold text-white disabled:opacity-50"
            style={{ background: 'var(--accent-blue)' }}>
            {saving ? '...' : 'บันทึก'}
          </button>
          <button onClick={() => { setAdding(false); setNewName(''); setNewAmount('') }}
            className="text-xs" style={{ color: 'var(--text-3)' }}>ยกเลิก</button>
        </div>
      )}
    </div>
  )
}

export default function CommissionPage() {
  const supabase = createClient()
  const [jobs, setJobs] = useState<Job[]>([])
  const [referrals, setReferrals] = useState<Referral[]>([])
  const [tiers, setTiers] = useState<Tier[]>([])
  const [loading, setLoading] = useState(true)
  const [fetchError, setFetchError] = useState('')
  const [myRole, setMyRole] = useState('')
  const [myUserId, setMyUserId] = useState('')
  const [filterStatus, setFilterStatus] = useState<string>('all')
  const [filterSales, setFilterSales] = useState<string>('all')
  const [expanded, setExpanded] = useState<Set<string>>(new Set())
  const [saving, setSaving] = useState<string | null>(null)
  const [salesUsers, setSalesUsers] = useState<{ id: string; name: string }[]>([])

  const isManager = ['admin', 'admin_sales', 'manager'].includes(myRole)

  const load = useCallback(async () => {
    setLoading(true); setFetchError('')
    const { data: { user } } = await supabase.auth.getUser()
    const { data: me } = await supabase.from('users').select('id, role').eq('email', user?.email ?? '').single()
    const role = me?.role || ''
    const userId = me?.id || ''
    setMyRole(role)
    setMyUserId(userId)

    const isManagerRole = ['admin', 'admin_sales', 'manager'].includes(role)

    let jobQuery = supabase
      .from('jobs')
      .select('id,customer_name,room_no,revenue_ex_vat,commission_rate,commission_amount,commission_status,commission_month,actual_deliver_date,sales_id,sales:users!jobs_sales_id_fkey(name),projects(name)')
      .eq('working_status', 'ส่งมอบแล้ว')
      .not('actual_deliver_date', 'is', null)
      .order('actual_deliver_date', { ascending: false })

    if (!isManagerRole && userId) {
      jobQuery = jobQuery.eq('sales_id', userId)
    }

    const [{ data, error }, { data: tierData }, { data: usersData }, { data: refData }] = await Promise.all([
      jobQuery,
      supabase.from('commission_settings').select('revenue_min,revenue_max,rate').eq('active', true),
      isManagerRole
        ? supabase.from('users').select('id, name').eq('active', true).eq('dept', 'Sales Executive').order('name')
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

  function getCommission(j: Job) {
    return calcTier(j.revenue_ex_vat || 0, tiers)
  }
  function normalizeYM(ym: string) {
    if (!ym) return ''
    const [y, m] = ym.split('-')
    if (!y || !m) return ym
    return `${y}-${m.padStart(2, '0')}`
  }
  function getStatus(j: Job) {
    if (j.commission_status) return j.commission_status
    const currentMonth = new Date().toISOString().slice(0, 7)
    const jobMonth = normalizeYM(j.commission_month || j.actual_deliver_date?.slice(0, 7) || '')
    return jobMonth < currentMonth ? 'paid' : 'pending'
  }
  function getMonth(j: Job) { return normalizeYM(j.commission_month || j.actual_deliver_date?.slice(0, 7) || '') }

  async function updateStatus(jobId: string, newStatus: string) {
    setSaving(jobId)
    await supabase.from('jobs').update({ commission_status: newStatus }).eq('id', jobId)
    setJobs(prev => prev.map(j => j.id === jobId ? { ...j, commission_status: newStatus } : j))
    setSaving(null)
  }

  function handleReferralChanged(jobId: string, updated: Referral[]) {
    setReferrals(prev => [...prev.filter(r => r.job_id !== jobId), ...updated])
  }

  const canApprove = ['admin', 'admin_sales'].includes(myRole)

  const filtered = useMemo(() => jobs.filter(j => {
    const matchStatus = filterStatus === 'all' || getStatus(j) === filterStatus
    const matchSales = filterSales === 'all' || j.sales_id === filterSales
    return matchStatus && matchSales
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }), [jobs, filterStatus, filterSales, tiers])

  const byMonth = useMemo(() => {
    const map = new Map<string, Job[]>()
    for (const j of filtered) {
      const key = getMonth(j) || 'ไม่ระบุ'
      if (!map.has(key)) map.set(key, [])
      map.get(key)!.push(j)
    }
    return Array.from(map.entries()).sort((a, b) => b[0].localeCompare(a[0]))
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filtered, tiers])

  const totalPending  = filtered.filter(j => getStatus(j) === 'pending' ).reduce((s, j) => s + getCommission(j).amount, 0)
  const totalApproved = filtered.filter(j => getStatus(j) === 'approved').reduce((s, j) => s + getCommission(j).amount, 0)
  const totalPaid     = filtered.filter(j => getStatus(j) === 'paid'    ).reduce((s, j) => s + getCommission(j).amount, 0)

  function toggleMonth(key: string) {
    setExpanded(s => { const n = new Set(s); n.has(key) ? n.delete(key) : n.add(key); return n })
  }

  if (loading) return <PageSpinner />
  if (fetchError) return <PageError message={fetchError} onRetry={load} />

  return (
    <div className="page-content space-y-5">
      <div>
        <h1 className="text-page-title" style={{ color: 'var(--text-1)' }}>Commission</h1>
        <p className="text-sm mt-0.5" style={{ color: 'var(--text-3)' }}>ค่าคอมมิชชั่นจากงานที่ส่งมอบแล้ว · อัปเดตสถานะได้จากหน้านี้</p>
      </div>

      {/* Summary KPI */}
      <div className="grid grid-cols-3 gap-4">
        {([['pending', totalPending], ['approved', totalApproved], ['paid', totalPaid]] as const).map(([s, v]) => {
          const cfg = STATUS_CFG[s]
          const Icon = cfg.icon
          const count = filtered.filter(j => getStatus(j) === s).length
          return (
            <div key={s} className="rounded-[18px] p-4"
              style={{ background: 'var(--card-bg)', border: '1px solid var(--card-border)' }}>
              <div className="flex items-center gap-2 mb-2">
                <Icon size={14} style={{ color: cfg.color }} />
                <p className="text-card-title" style={{ color: cfg.color }}>{cfg.label}</p>
              </div>
              <p className="text-kpi-number" style={{ color: 'var(--text-1)' }}>{f(v)}</p>
              <p className="text-[11px] mt-1" style={{ color: 'var(--text-3)' }}>{count} งาน</p>
            </div>
          )
        })}
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-2 items-center">
        <div className="flex gap-1 p-1 rounded-[11px]" style={{ background: 'var(--hover-bg)', border: '1px solid var(--divider)' }}>
          <button onClick={() => setFilterStatus('all')}
            className="px-3 py-1.5 rounded-[8px] text-xs font-semibold transition-colors"
            style={{ background: filterStatus === 'all' ? 'var(--accent)' : 'transparent', color: filterStatus === 'all' ? '#fff' : 'var(--text-2)' }}>
            ทั้งหมด
          </button>
          {STATUSES.map(s => {
            const cfg = STATUS_CFG[s]
            return (
              <button key={s} onClick={() => setFilterStatus(filterStatus === s ? 'all' : s)}
                className="px-3 py-1.5 rounded-[8px] text-xs font-semibold transition-colors"
                style={{ background: filterStatus === s ? cfg.color : 'transparent', color: filterStatus === s ? '#fff' : 'var(--text-2)' }}>
                {cfg.label}
              </button>
            )
          })}
        </div>

        {/* Sales filter — manager only */}
        {isManager && (
          <select value={filterSales} onChange={e => setFilterSales(e.target.value)}
            className="field-input" style={{ width: 'auto' }}>
            <option value="all">— Sales ทั้งหมด —</option>
            {salesUsers.map(u => <option key={u.id} value={u.id}>{u.name}</option>)}
          </select>
        )}

        <span className="text-xs ml-auto" style={{ color: 'var(--text-3)' }}>
          {filtered.length} งาน · {f(filtered.reduce((s, j) => s + getCommission(j).amount, 0))}
        </span>
      </div>

      {/* Monthly groups */}
      {byMonth.length === 0 && (
        <div className="rounded-[18px] p-12 text-center" style={{ background: 'var(--card-bg)', border: '1px solid var(--card-border)' }}>
          <DollarSign size={32} className="mx-auto mb-2" style={{ color: 'var(--text-3)' }} />
          <p className="text-sm" style={{ color: 'var(--text-2)' }}>ไม่พบข้อมูล Commission</p>
        </div>
      )}

      <div className="space-y-3">
        {byMonth.map(([month, monthJobs]) => {
          const isOpen = expanded.has(month)
          const monthTotal = monthJobs.reduce((s, j) => s + getCommission(j).amount, 0)
          const statusCounts = { pending: 0, approved: 0, paid: 0 }
          monthJobs.forEach(j => { const s = getStatus(j) as keyof typeof statusCounts; if (s in statusCounts) statusCounts[s]++ })

          return (
            <div key={month} className="rounded-[18px] overflow-hidden" style={{ background: 'var(--card-bg)', border: '1px solid var(--card-border)' }}>
              <button className="w-full flex items-center justify-between px-5 py-4 text-left transition-colors"
                style={{ background: isOpen ? 'var(--hover-bg)' : 'transparent' }}
                onClick={() => toggleMonth(month)}>
                <div className="flex items-center gap-3">
                  {isOpen ? <ChevronDown size={15} style={{ color: 'var(--accent)' }} /> : <ChevronRight size={15} style={{ color: 'var(--text-3)' }} />}
                  <div>
                    <p className="font-bold text-sm" style={{ color: 'var(--text-1)' }}>{monthLabel(month)}</p>
                    <p className="text-xs mt-0.5" style={{ color: 'var(--text-3)' }}>{monthJobs.length} งาน</p>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <div className="flex gap-1.5">
                    {STATUSES.map(s => statusCounts[s] > 0 && (
                      <span key={s} className="text-[10px] font-semibold px-2 py-0.5 rounded-full"
                        style={{ background: STATUS_CFG[s].bg, color: STATUS_CFG[s].color }}>
                        {statusCounts[s]}
                      </span>
                    ))}
                  </div>
                  <p className="font-bold text-sm" style={{ color: '#fbbf24' }}>{f(monthTotal)}</p>
                </div>
              </button>

              {isOpen && (
                <div style={{ borderTop: '1px solid var(--divider)' }}>
                  <table className="w-full text-sm">
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
                        const isSaving = saving === j.id
                        const nextStatus: Record<string, string> = { pending: 'approved', approved: 'paid', paid: 'pending' }
                        const jobRefs = referrals.filter(r => r.job_id === j.id)
                        const colSpan = isManager ? 7 : 6
                        return (
                          <>
                          <tr key={j.id} style={{ borderBottom: jobRefs.length > 0 ? 'none' : '1px solid var(--divider)' }}>
                            <td className="px-4 py-3">
                              <p className="font-semibold" style={{ color: 'var(--text-1)' }}>{j.customer_name || '—'}</p>
                              <p className="text-[11px]" style={{ color: 'var(--text-3)' }}>ห้อง {j.room_no || '—'}</p>
                            </td>
                            <td className="px-4 py-3 text-xs" style={{ color: 'var(--text-3)' }}>{(j.projects as any)?.name || '—'}</td>
                            {isManager && <td className="px-4 py-3 text-xs" style={{ color: 'var(--text-2)' }}>{(j.sales as any)?.name || '—'}</td>}
                            <td className="px-4 py-3 text-right text-xs" style={{ color: 'var(--text-2)' }}>{f(j.revenue_ex_vat)}</td>
                            <td className="px-4 py-3 text-right text-xs" style={{ color: 'var(--text-3)' }}>
                              {rate ? (rate * 100).toFixed(2) + '%' : '—'}
                            </td>
                            <td className="px-4 py-3 text-right font-bold text-sm" style={{ color: '#fbbf24' }}>{f(amount)}</td>
                            <td className="px-4 py-3">
                              {canApprove ? (
                                <button
                                  disabled={isSaving}
                                  onClick={() => updateStatus(j.id, nextStatus[status] || 'pending')}
                                  className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-semibold transition-all disabled:opacity-50"
                                  style={{ background: cfg.bg, color: cfg.color }}>
                                  <Icon size={11} />
                                  {isSaving ? '...' : cfg.label}
                                </button>
                              ) : (
                                <span className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-semibold w-fit"
                                  style={{ background: cfg.bg, color: cfg.color }}>
                                  <Icon size={11} />{cfg.label}
                                </span>
                              )}
                            </td>
                          </tr>
                          {/* Referral row */}
                          <tr key={`${j.id}-ref`} style={{ borderBottom: '1px solid var(--divider)' }}>
                            <td colSpan={colSpan} className="px-4 pb-3 pt-0">
                              <ReferralSection
                                jobId={j.id}
                                referrals={jobRefs}
                                canEdit={canApprove}
                                onChanged={handleReferralChanged}
                              />
                            </td>
                          </tr>
                          </>
                        )
                      })}
                    </tbody>
                    <tfoot>
                      <tr style={{ borderTop: '2px solid var(--divider)', background: 'var(--hover-bg)' }}>
                        <td colSpan={isManager ? 5 : 4} className="px-4 py-2.5 text-xs font-semibold" style={{ color: 'var(--text-2)' }}>รวม {monthLabel(month)}</td>
                        <td className="px-4 py-2.5 text-right font-bold text-sm" style={{ color: '#fbbf24' }}>{f(monthTotal)}</td>
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
