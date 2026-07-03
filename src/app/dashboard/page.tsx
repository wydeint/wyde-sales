'use client'

import { useEffect, useState, useMemo } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Users, TrendingUp, PhoneCall, Target, Award, Package, X, ChevronRight } from 'lucide-react'
import { PageSpinner, PageError } from '@/components/ui/StateUI'

const STATUS_LABEL: Record<string, string> = {
  new: 'ใหม่', interested: 'สนใจ', quoted: 'เสนอราคา',
  booked: 'จอง', close_pending: 'รอปิด', closed: 'ปิดแล้ว', lost: 'หลุด'
}
const STATUS_COLOR: Record<string, string> = {
  new: '#60a5fa', interested: '#34d399', quoted: '#fbbf24',
  booked: '#f97316', close_pending: '#a78bfa', closed: '#4ade80', lost: '#f87171'
}

const f = (v: number) => '฿' + Math.round(v || 0).toLocaleString()
const fn = (v: number) => (v || 0).toLocaleString()

type Customer = { status: string; budget: number; customer_type: string }
type Job = { id: string; order_date: string; work_type: string; customer_type: string; customer_name: string; room_no: string; revenue_ex_vat: number; revenue_inc_vat: number; actual_deliver_date: string; working_status: string; sales_id: string; projects?: { name: string }; sales?: { name: string } }
type OrgTarget = { target_sales_value: number; target_delivery_value: number }

export default function DashboardPage() {
  const supabase = createClient()
  const [loading, setLoading] = useState(true)
  const [userName, setUserName] = useState('')
  const [fetchError, setFetchError] = useState('')

  const [allCustomers, setAllCustomers] = useState<Customer[]>([])
  const [allJobs, setAllJobs] = useState<Job[]>([])
  const [reports, setReports] = useState<any[]>([])
  const [orgTarget, setOrgTarget] = useState<OrgTarget | null>(null)

  const [filterCustType, setFilterCustType] = useState('')
  const [filterWorkType, setFilterWorkType] = useState('')
  const [deliverDrillOpen, setDeliverDrillOpen] = useState(false)

  const monthStart = useMemo(() => {
    const now = new Date()
    return `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}-01`
  }, [])

  useEffect(() => {
    async function load() {
      setFetchError('')
      const now = new Date()
      const ms = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}-01`

      const [
        { data: { user } },
        { data: customers, error: custErr },
        { data: jobs, error: jobErr },
        { data: reps, error: repErr },
        { data: ot },
      ] = await Promise.all([
        supabase.auth.getUser(),
        supabase.from('customers').select('status, budget, customer_type'),
        supabase.from('jobs').select('id,order_date,work_type,customer_type,customer_name,room_no,revenue_ex_vat,revenue_inc_vat,actual_deliver_date,working_status,sales_id,projects(name),sales:users!jobs_sales_id_fkey(name)'),
        supabase.from('daily_reports').select('*, users(name)').gte('date', ms).order('date', { ascending: false }),
        supabase.from('org_targets').select('target_sales_value,target_delivery_value').eq('year', now.getFullYear()).eq('month', now.getMonth() + 1).maybeSingle(),
      ])

      if (custErr || jobErr || repErr) {
        setFetchError((custErr ?? jobErr ?? repErr)!.message)
        setLoading(false)
        return
      }

      if (user) {
        const { data: u } = await supabase.from('users').select('name, role').eq('email', user.email!).single()
        if (u) setUserName(u.name)
      }

      setAllCustomers((customers || []) as Customer[])
      setAllJobs((jobs || []) as unknown as Job[])
      setReports(reps || [])
      setOrgTarget(ot as OrgTarget | null)
      setLoading(false)
    }
    load()
  }, [])

  const workTypes = useMemo(() => {
    const s = new Set(allJobs.map(j => j.work_type).filter(Boolean))
    return Array.from(s).sort()
  }, [allJobs])

  const customers = useMemo(() =>
    allCustomers.filter(c => !filterCustType || c.customer_type === filterCustType),
    [allCustomers, filterCustType]
  )

  const jobs = useMemo(() =>
    allJobs.filter(j =>
      (!filterCustType || j.customer_type === filterCustType) &&
      (!filterWorkType || j.work_type === filterWorkType)
    ),
    [allJobs, filterCustType, filterWorkType]
  )

  const monthEnd = useMemo(() => {
    const now = new Date()
    const last = new Date(now.getFullYear(), now.getMonth() + 1, 0)
    return `${last.getFullYear()}-${String(last.getMonth()+1).padStart(2,'0')}-${String(last.getDate()).padStart(2,'0')}`
  }, [])

  const salesThisMonth = useMemo(() =>
    jobs.filter(j => j.order_date >= monthStart && j.order_date <= monthEnd),
    [jobs, monthStart, monthEnd]
  )

  const deliveredThisMonth = useMemo(() =>
    jobs.filter(j => j.actual_deliver_date >= monthStart && j.actual_deliver_date <= monthEnd && j.working_status === 'ส่งมอบแล้ว'),
    [jobs, monthStart, monthEnd]
  )

  const callsThisMonth = reports.reduce((s, x) => s + (x.calls || 0), 0)
  const visitsThisMonth = reports.reduce((s, x) => s + (x.visits || 0), 0)

  const pipelineOrder = ['new', 'interested', 'quoted', 'booked', 'close_pending', 'closed']
  const pipeline = useMemo(() =>
    pipelineOrder.map(s => ({
      status: s,
      count: customers.filter(x => x.status === s).length,
      value: customers.filter(x => x.status === s).reduce((sum, x) => sum + (x.budget || 0), 0)
    })),
    [customers]
  )

  const leaderboard = useMemo(() => {
    const byPerson: Record<string, { calls: number; visits: number; value: number }> = {}
    for (const rep of reports) {
      const name = (rep.users as any)?.name || '—'
      if (!byPerson[name]) byPerson[name] = { calls: 0, visits: 0, value: 0 }
      byPerson[name].calls += rep.calls || 0
      byPerson[name].visits += rep.visits || 0
      byPerson[name].value += rep.booking_value || 0
    }
    return Object.entries(byPerson).map(([name, d]) => ({ name, ...d })).sort((a, b) => b.value - a.value || b.calls - a.calls)
  }, [reports])

  const recentReports = reports.slice(0, 6)
  const pipelineMax = Math.max(...pipeline.map(p => p.count), 1)
  const hour = new Date().getHours()
  const greeting = hour < 12 ? 'อรุณสวัสดิ์' : hour < 17 ? 'สวัสดีตอนบ่าย' : 'สวัสดีตอนเย็น'
  const rankIcon = (i: number) => i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `${i + 1}.`

  const actualSales = salesThisMonth.reduce((s, j) => s + (j.revenue_inc_vat || 0), 0)
  const actualDeliv = deliveredThisMonth.reduce((s, j) => s + (j.revenue_inc_vat || 0), 0)
  const salesPct = orgTarget?.target_sales_value ? Math.min(Math.round(actualSales / orgTarget.target_sales_value * 100), 100) : 0
  const delivPct = orgTarget?.target_delivery_value ? Math.min(Math.round(actualDeliv / orgTarget.target_delivery_value * 100), 100) : 0
  const currentMonthThai = new Date().toLocaleDateString('th-TH', { month: 'long', year: 'numeric' })

  const f2 = (v: number) => '฿' + Math.round(v || 0).toLocaleString()

  if (loading) return <div className="flex items-center justify-center h-full"><PageSpinner /></div>
  if (fetchError) return <PageError message={fetchError} onRetry={() => { setLoading(true); setFetchError('') }} />

  return (
    <div className="p-6 space-y-6">

      {/* Header + Filters */}
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-xl font-bold" style={{ color: 'var(--text-1)' }}>
            {greeting}คุณ{userName || '...'} 👋
          </h1>
          <p className="text-sm mt-0.5" style={{ color: 'var(--text-3)' }}>
            {new Date().toLocaleDateString('th-TH', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <select value={filterCustType} onChange={e => setFilterCustType(e.target.value)}
            className="rounded-xl px-3 py-1.5 text-sm outline-none"
            style={{ background: 'var(--hover-bg)', color: 'var(--text-2)' }}>
            <option value="">B2C + B2B</option>
            <option value="B2C">B2C</option>
            <option value="B2B">B2B</option>
          </select>
          <select value={filterWorkType} onChange={e => setFilterWorkType(e.target.value)}
            className="rounded-xl px-3 py-1.5 text-sm outline-none"
            style={{ background: 'var(--hover-bg)', color: 'var(--text-2)' }}>
            <option value="">ทุกประเภทงาน</option>
            {workTypes.map(w => <option key={w} value={w}>{w}</option>)}
          </select>
        </div>
      </div>

      {/* Hero KPI Banner */}
      <div className="rounded-2xl p-5 relative overflow-hidden" style={{ background: 'var(--card-bg)', border: '1px solid var(--divider)', borderLeft: '4px solid #f97316' }}>
        <p className="text-xs font-semibold mb-4" style={{ color: 'var(--text-3)' }}>ผลงาน{currentMonthThai}</p>
        <div className="grid grid-cols-2 gap-6">
          {/* ยอดขาย */}
          <div>
            <p className="text-xs mb-1" style={{ color: 'var(--text-3)' }}>ยอดขายเดือนนี้</p>
            <p className="text-3xl font-extrabold leading-none" style={{ color: '#f97316' }}>{f(actualSales)}</p>
            {orgTarget?.target_sales_value ? (
              <>
                <p className="text-xs mt-2 mb-1" style={{ color: 'var(--text-3)' }}>เป้า {f(orgTarget.target_sales_value)} · <span style={{ color: salesPct >= 100 ? '#4ade80' : '#f97316' }}>{salesPct}%</span></p>
                <div className="h-2 rounded-full" style={{ background: 'var(--divider)' }}>
                  <div className="h-2 rounded-full transition-all duration-700" style={{ width: `${salesPct}%`, background: salesPct >= 100 ? '#4ade80' : '#f97316' }} />
                </div>
              </>
            ) : <p className="text-xs mt-2" style={{ color: 'var(--text-3)' }}>ยังไม่ได้ตั้งเป้า</p>}
          </div>
          {/* ส่งมอบ */}
          <div>
            <p className="text-xs mb-1" style={{ color: 'var(--text-3)' }}>ส่งมอบเดือนนี้</p>
            <p className="text-3xl font-extrabold leading-none" style={{ color: '#4ade80' }}>{f(actualDeliv)}</p>
            {orgTarget?.target_delivery_value ? (
              <>
                <p className="text-xs mt-2 mb-1" style={{ color: 'var(--text-3)' }}>เป้า {f(orgTarget.target_delivery_value)} · <span style={{ color: delivPct >= 100 ? '#4ade80' : '#60a5fa' }}>{delivPct}%</span></p>
                <div className="h-2 rounded-full" style={{ background: 'var(--divider)' }}>
                  <div className="h-2 rounded-full transition-all duration-700" style={{ width: `${delivPct}%`, background: delivPct >= 100 ? '#4ade80' : '#60a5fa' }} />
                </div>
              </>
            ) : <p className="text-xs mt-2" style={{ color: 'var(--text-3)' }}>ยังไม่ได้ตั้งเป้า</p>}
          </div>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          { icon: Users, label: 'ลูกค้าทั้งหมด', value: fn(customers.length), sub: `จอง ${customers.filter(c => c.status === 'booked').length} · ปิด ${customers.filter(c => c.status === 'closed').length}`, color: '#60a5fa', onClick: undefined },
          { icon: TrendingUp, label: 'ยอดขายเดือนนี้', value: fn(salesThisMonth.length) + ' รายการ', sub: f(salesThisMonth.reduce((s, j) => s + (j.revenue_inc_vat || 0), 0)), color: '#f97316', onClick: undefined },
          { icon: Package, label: 'ยอดส่งมอบเดือนนี้', value: fn(deliveredThisMonth.length) + ' รายการ', sub: f(deliveredThisMonth.reduce((s, j) => s + (j.revenue_inc_vat || 0), 0)), color: '#4ade80', onClick: () => setDeliverDrillOpen(true) },
          { icon: PhoneCall, label: 'โทร เดือนนี้', value: fn(callsThisMonth), sub: `เยี่ยม ${visitsThisMonth} ครั้ง`, color: '#fbbf24', onClick: undefined },
        ].map(({ icon: Icon, label, value, sub, color, onClick }) => (
          <div key={label} onClick={onClick}
            className="glass-card p-4"
            style={{ cursor: onClick ? 'pointer' : 'default' }}
            onMouseEnter={e => onClick && (e.currentTarget.style.background = 'var(--active-bg)')}
            onMouseLeave={e => onClick && (e.currentTarget.style.background = '')}>
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                <Icon size={14} style={{ color }} />
                <span className="text-xs" style={{ color: 'var(--text-3)' }}>{label}</span>
              </div>
              {onClick && <ChevronRight size={13} style={{ color: 'var(--text-3)' }} />}
            </div>
            <p className="text-xl font-bold" style={{ color: 'var(--text-1)' }}>{value}</p>
            <p className="text-xs mt-1" style={{ color: 'var(--text-3)' }}>{sub}</p>
          </div>
        ))}
      </div>

      {/* Drill-down modal: delivered this month */}
      {deliverDrillOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(4px)' }} onClick={() => setDeliverDrillOpen(false)}>
          <div className="w-full max-w-2xl max-h-[80vh] flex flex-col rounded-2xl overflow-hidden"
            style={{ background: 'var(--card-bg)', border: '1px solid var(--card-border)' }}
            onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between px-5 py-4" style={{ borderBottom: '1px solid var(--divider)' }}>
              <div>
                <h3 className="font-bold text-sm" style={{ color: 'var(--text-1)' }}>งานส่งมอบเดือนนี้</h3>
                <p className="text-xs mt-0.5" style={{ color: 'var(--text-3)' }}>
                  นับจาก <code className="px-1 rounded" style={{ background: 'var(--hover-bg)' }}>jobs.actual_deliver_date</code> · {deliveredThisMonth.length} รายการ
                </p>
              </div>
              <button onClick={() => setDeliverDrillOpen(false)} style={{ color: 'var(--text-3)' }}><X size={18} /></button>
            </div>
            <div className="overflow-y-auto">
              {deliveredThisMonth.length === 0 ? (
                <p className="text-center py-12 text-sm" style={{ color: 'var(--text-3)' }}>ไม่มีรายการส่งมอบในเดือนนี้</p>
              ) : (
                <table className="w-full text-sm">
                  <thead>
                    <tr style={{ background: 'var(--hover-bg)', borderBottom: '1px solid var(--divider)' }}>
                      {['Job ID', 'ลูกค้า', 'โครงการ / ห้อง', 'Sales', 'วันส่งมอบ (actual)', 'Revenue (Inc.VAT)'].map(h => (
                        <th key={h} className="text-left px-4 py-2.5 text-xs font-semibold whitespace-nowrap" style={{ color: 'var(--text-3)' }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {deliveredThisMonth.map(j => (
                      <tr key={j.id} style={{ borderBottom: '1px solid var(--divider)' }}>
                        <td className="px-4 py-2.5 font-mono text-xs" style={{ color: 'var(--accent)' }}>{j.id}</td>
                        <td className="px-4 py-2.5 text-xs" style={{ color: 'var(--text-1)' }}>{j.customer_name || '—'}</td>
                        <td className="px-4 py-2.5">
                          <div className="text-xs" style={{ color: 'var(--text-3)' }}>{(j.projects as any)?.name || '—'}</div>
                          <div className="text-xs font-medium" style={{ color: 'var(--text-2)' }}>{j.room_no || '—'}</div>
                        </td>
                        <td className="px-4 py-2.5 text-xs" style={{ color: 'var(--text-2)' }}>{(j.sales as any)?.name || '—'}</td>
                        <td className="px-4 py-2.5 text-xs" style={{ color: 'var(--text-2)' }}>
                          {j.actual_deliver_date ? new Date(j.actual_deliver_date).toLocaleDateString('th-TH', { day: '2-digit', month: 'short', year: '2-digit' }) : '—'}
                        </td>
                        <td className="px-4 py-2.5 text-xs font-bold text-right" style={{ color: '#4ade80' }}>{f2(j.revenue_inc_vat || 0)}</td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr style={{ background: 'var(--hover-bg)', borderTop: '2px solid var(--divider)' }}>
                      <td colSpan={5} className="px-4 py-2.5 text-xs font-bold" style={{ color: 'var(--text-2)' }}>รวม {deliveredThisMonth.length} รายการ</td>
                      <td className="px-4 py-2.5 text-xs font-bold text-right" style={{ color: '#4ade80' }}>{f2(actualDeliv)}</td>
                    </tr>
                  </tfoot>
                </table>
              )}
            </div>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

        {/* Pipeline Funnel */}
        <div className="glass-card p-5">
          <div className="flex items-center gap-2 mb-4">
            <Target size={15} style={{ color: 'var(--accent)' }} />
            <h2 className="font-semibold text-sm" style={{ color: 'var(--text-1)' }}>Pipeline</h2>
          </div>
          <div className="space-y-3">
            {pipeline.map(s => (
              <div key={s.status}>
                <div className="flex items-center justify-between mb-1">
                  <span className="text-xs" style={{ color: 'var(--text-2)' }}>{STATUS_LABEL[s.status]}</span>
                  <div className="flex items-center gap-3">
                    {s.value > 0 && (
                      <span className="text-xs" style={{ color: 'var(--text-3)' }}>{f(s.value)}</span>
                    )}
                    <span className="text-xs font-semibold w-5 text-right" style={{ color: 'var(--text-1)' }}>{s.count}</span>
                  </div>
                </div>
                <div className="h-2 rounded-full overflow-hidden" style={{ background: 'var(--divider)' }}>
                  <div
                    className="h-full rounded-full transition-all duration-700"
                    style={{
                      width: s.count > 0 ? Math.max(s.count / pipelineMax * 100, 6) + '%' : '0%',
                      background: STATUS_COLOR[s.status] || 'var(--accent)',
                      opacity: 0.85,
                    }}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Sales Leaderboard */}
        <div className="glass-card p-5">
          <div className="flex items-center gap-2 mb-4">
            <Award size={15} style={{ color: '#fbbf24' }} />
            <h2 className="font-semibold text-sm" style={{ color: 'var(--text-1)' }}>Sales เดือนนี้</h2>
          </div>
          {leaderboard.length === 0 ? (
            <p className="text-sm text-center py-6" style={{ color: 'var(--text-3)' }}>ยังไม่มีข้อมูล</p>
          ) : (
            <div className="space-y-3">
              {leaderboard.map((p, i) => (
                <div key={p.name} className="flex items-center gap-3">
                  <span className="text-base w-6 flex-shrink-0">{rankIcon(i)}</span>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate" style={{ color: 'var(--text-1)' }}>{p.name}</p>
                    <p className="text-xs" style={{ color: 'var(--text-3)' }}>
                      โทร {p.calls} · เยี่ยม {p.visits}
                    </p>
                  </div>
                  <div className="text-right flex-shrink-0">
                    {p.value > 0 && (
                      <p className="text-sm font-semibold" style={{ color: '#4ade80' }}>{f(p.value)}</p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Recent Daily Reports */}
        <div className="glass-card p-5">
          <h2 className="font-semibold text-sm mb-4" style={{ color: 'var(--text-1)' }}>Daily Report ล่าสุด</h2>
          {recentReports.length === 0 ? (
            <p className="text-sm text-center py-6" style={{ color: 'var(--text-3)' }}>ยังไม่มีรายงาน</p>
          ) : (
            <div className="space-y-3">
              {recentReports.map(r => (
                <div key={r.id} className="flex items-center justify-between">
                  <div className="min-w-0">
                    <p className="text-sm font-medium truncate" style={{ color: 'var(--text-1)' }}>
                      {(r.users as any)?.name || '—'}
                    </p>
                    <p className="text-xs" style={{ color: 'var(--text-3)' }}>
                      {new Date(r.date).toLocaleDateString('th-TH', { day: '2-digit', month: 'short' })}
                      {' · '}โทร {r.calls || 0} · เยี่ยม {r.visits || 0}
                    </p>
                  </div>
                  <div className="text-right flex-shrink-0 ml-2">
                    {(r.booking_value || 0) > 0 && (
                      <p className="text-sm font-semibold" style={{ color: '#4ade80' }}>{f(r.booking_value)}</p>
                    )}
                    {(r.quotation_value || 0) > 0 && (
                      <p className="text-xs" style={{ color: 'var(--text-3)' }}>เสนอ {f(r.quotation_value)}</p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
