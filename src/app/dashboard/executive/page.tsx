'use client'

import { useEffect, useState, useMemo } from 'react'
import { createClient } from '@/lib/supabase/client'
import { BarChart3, TrendingUp, Users, DollarSign, Target, Package, Award, ChevronLeft, ChevronRight } from 'lucide-react'
import { PageSpinner, PageError } from '@/components/ui/StateUI'

type Customer = {
  id: string; status: string; budget: number; customer_type: string
  source: string; assigned_to: string; created_at: string
  users?: { name: string }
}

type Job = {
  id: string; order_date: string; actual_deliver_date: string
  revenue_ex_vat: number; work_type: string; customer_type: string
  working_status: string; sales_id: string
  sales?: { name: string }
  projects?: { name: string }
}

type Report = { id: string; date: string; calls: number; visits: number; users?: { name: string } }

type Period = 'week' | 'month' | 'quarter' | 'year'

const f = (v: number) => '฿' + Math.round(v || 0).toLocaleString()
const fk = (v: number) => {
  if (v >= 1_000_000) return '฿' + (v / 1_000_000).toFixed(2) + 'M'
  if (v >= 1_000) return '฿' + (v / 1_000).toFixed(0) + 'K'
  return '฿' + Math.round(v || 0).toLocaleString()
}
const pct = (a: number, b: number) => b > 0 ? Math.round(a / b * 100) : 0

const STATUS_LABEL: Record<string, string> = {
  new: 'ใหม่', interested: 'สนใจ', quoted: 'เสนอราคา',
  booked: 'จอง', close_pending: 'รอปิด', closed: 'ปิดแล้ว', lost: 'หลุด'
}
const STATUS_COLOR: Record<string, string> = {
  new: '#60a5fa', interested: '#34d399', quoted: '#fbbf24',
  booked: '#f97316', close_pending: '#a78bfa', closed: '#4ade80', lost: '#f87171'
}
const MONTHS_TH = ['ม.ค.','ก.พ.','มี.ค.','เม.ย.','พ.ค.','มิ.ย.','ก.ค.','ส.ค.','ก.ย.','ต.ค.','พ.ย.','ธ.ค.']

const ld = (d: Date) => `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`
function getPeriodBounds(period: Period, offset = 0): { start: string; end: string; label: string } {
  const now = new Date()
  if (period === 'week') {
    const base = new Date(now); base.setDate(now.getDate() + offset * 7)
    const dow = base.getDay() === 0 ? 6 : base.getDay() - 1
    const mon = new Date(base); mon.setDate(base.getDate() - dow)
    const sun = new Date(mon); sun.setDate(mon.getDate() + 6)
    const fmt = (d: Date) => `${d.getDate()} ${MONTHS_TH[d.getMonth()]}`
    return { start: ld(mon), end: ld(sun), label: `${fmt(mon)} – ${fmt(sun)}` }
  }
  if (period === 'month') {
    const y = now.getFullYear(); const m = now.getMonth() + offset
    const d = new Date(y, m, 1)
    const last = new Date(y, m + 1, 0)
    return { start: ld(d), end: ld(last), label: `${MONTHS_TH[d.getMonth()]} ${d.getFullYear()}` }
  }
  if (period === 'quarter') {
    const totalQ = Math.floor(now.getMonth() / 3) + offset
    const y = now.getFullYear() + Math.floor(totalQ / 4)
    const q = ((totalQ % 4) + 4) % 4
    const qs = new Date(y, q * 3, 1); const qe = new Date(y, q * 3 + 3, 0)
    return { start: ld(qs), end: ld(qe), label: `Q${q + 1} ${y}` }
  }
  const y = now.getFullYear() + offset
  return { start: `${y}-01-01`, end: `${y}-12-31`, label: `ปี ${y}` }
}

export default function ExecutivePage() {
  const supabase = createClient()
  const [allCustomers, setAllCustomers] = useState<Customer[]>([])
  const [allJobs, setAllJobs] = useState<Job[]>([])
  const [reports, setReports] = useState<Report[]>([])
  const [orgTarget, setOrgTarget] = useState<{ sales: number; delivery: number } | null>(null)
  const [loading, setLoading] = useState(true)
  const [fetchError, setFetchError] = useState('')

  const [period, setPeriod] = useState<Period>('month')
  const [offset, setOffset] = useState(0)
  const [filterCustType, setFilterCustType] = useState('')

  const { start, end, label } = getPeriodBounds(period, offset)

  useEffect(() => {
    async function load() {
      setLoading(true)
      setFetchError('')
      const [
        { data: cust, error: e1 },
        { data: jobs, error: e2 },
        { data: reps, error: e3 },
        { data: ot },
      ] = await Promise.all([
        supabase.from('customers').select('id,status,budget,customer_type,source,assigned_to,created_at,users!customers_assigned_to_fkey(name)'),
        supabase.from('jobs').select('id,order_date,actual_deliver_date,revenue_ex_vat,work_type,customer_type,working_status,sales_id,sales:users!jobs_sales_id_fkey(name),projects(name)'),
        supabase.from('daily_reports').select('id,date,calls,visits,users(name)').order('date', { ascending: false }),
        supabase.from('org_targets').select('target_sales_value,target_delivery_value,year,month').eq('year', new Date().getFullYear()).limit(12),
      ])
      if (e1 || e2 || e3) { setFetchError((e1 ?? e2 ?? e3)!.message); setLoading(false); return }
      setAllCustomers((cust || []) as unknown as Customer[])
      setAllJobs((jobs || []) as unknown as Job[])
      setReports((reps || []) as unknown as Report[])

      if (ot && ot.length > 0) {
        const now = new Date(); const m = now.getMonth() + 1; const q = Math.floor((m - 1) / 3)
        let rows = ot
        if (period === 'month') rows = ot.filter(x => x.month === m)
        else if (period === 'quarter') rows = ot.filter(x => x.month >= q * 3 + 1 && x.month <= q * 3 + 3)
        const sales = rows.reduce((s, x) => s + (x.target_sales_value || 0), 0)
        const delivery = rows.reduce((s, x) => s + (x.target_delivery_value || 0), 0)
        setOrgTarget(sales > 0 || delivery > 0 ? { sales, delivery } : null)
      }

      setLoading(false)
    }
    load()
  }, [])

  const customers = useMemo(() =>
    allCustomers.filter(c => !filterCustType || c.customer_type === filterCustType),
    [allCustomers, filterCustType]
  )

  const periodJobs = useMemo(() =>
    allJobs.filter(j => j.order_date >= start && j.order_date <= end &&
      (!filterCustType || j.customer_type === filterCustType)),
    [allJobs, start, end, filterCustType]
  )

  const deliveredJobs = useMemo(() =>
    allJobs.filter(j => j.actual_deliver_date >= start && j.actual_deliver_date <= end &&
      j.working_status === 'ส่งมอบแล้ว' &&
      (!filterCustType || j.customer_type === filterCustType)),
    [allJobs, start, end, filterCustType]
  )

  const periodReports = useMemo(() =>
    reports.filter(r => r.date >= start && r.date <= end),
    [reports, start, end]
  )

  // KPIs
  const salesRevenue = periodJobs.reduce((s, j) => s + (j.revenue_ex_vat || 0), 0)
  const deliveryRevenue = deliveredJobs.reduce((s, j) => s + (j.revenue_ex_vat || 0), 0)
  const closedCount = customers.filter(c => c.status === 'closed').length
  const lostCount = customers.filter(c => c.status === 'lost').length
  const winRate = pct(closedCount, closedCount + lostCount)
  const totalCalls = periodReports.reduce((s, r) => s + (r.calls || 0), 0)
  const totalVisits = periodReports.reduce((s, r) => s + (r.visits || 0), 0)

  // Pipeline funnel
  const pipelineOrder = ['new', 'interested', 'quoted', 'booked', 'close_pending', 'closed']
  const funnelData = useMemo(() => {
    const max = Math.max(...pipelineOrder.map(s => customers.filter(c => c.status === s).length), 1)
    return pipelineOrder.map(s => ({
      status: s,
      count: customers.filter(c => c.status === s).length,
      value: customers.filter(c => c.status === s).reduce((sum, c) => sum + (c.budget || 0), 0),
      max,
    }))
  }, [customers])

  // B2C / B2B split (period jobs)
  const b2cRevenue = periodJobs.filter(j => j.customer_type === 'B2C').reduce((s, j) => s + (j.revenue_ex_vat || 0), 0)
  const b2bRevenue = periodJobs.filter(j => j.customer_type === 'B2B').reduce((s, j) => s + (j.revenue_ex_vat || 0), 0)
  const rptRevenue = periodJobs.filter(j => j.work_type === 'RPT').reduce((s, j) => s + (j.revenue_ex_vat || 0), 0)

  // Sales ranking from jobs
  const salesRanking = useMemo(() => {
    const map = new Map<string, { name: string; units: number; revenue: number; calls: number; visits: number }>()
    periodJobs.forEach(j => {
      const name = (j.sales as any)?.name || 'ไม่ระบุ'
      const key = j.sales_id || name
      const cur = map.get(key) || { name, units: 0, revenue: 0, calls: 0, visits: 0 }
      map.set(key, { ...cur, units: cur.units + 1, revenue: cur.revenue + (j.revenue_ex_vat || 0) })
    })
    periodReports.forEach(r => {
      const name = (r.users as any)?.name || '—'
      const cur = map.get(name) || { name, units: 0, revenue: 0, calls: 0, visits: 0 }
      map.set(name, { ...cur, calls: cur.calls + (r.calls || 0), visits: cur.visits + (r.visits || 0) })
    })
    return [...map.values()].sort((a, b) => b.revenue - a.revenue || b.units - a.units)
  }, [periodJobs, periodReports])

  const salesMax = Math.max(...salesRanking.map(s => s.revenue), 1)

  // Lead source breakdown
  const sourceBreakdown = useMemo(() => {
    const map = new Map<string, number>()
    customers.forEach(c => {
      const src = c.source || 'ไม่ระบุ'
      map.set(src, (map.get(src) || 0) + 1)
    })
    return [...map.entries()].map(([source, count]) => ({ source, count }))
      .sort((a, b) => b.count - a.count)
  }, [customers])

  const sourceMax = Math.max(...sourceBreakdown.map(s => s.count), 1)

  // Monthly trend (year view)
  const monthlyTrend = useMemo(() => {
    if (period !== 'year') return []
    const y = parseInt(start.slice(0, 4))
    return Array.from({ length: 12 }, (_, m) => {
      const ms = `${y}-${String(m + 1).padStart(2, '0')}-01`
      const me = ld(new Date(y, m + 1, 0))
      const rev = allJobs.filter(j => j.order_date >= ms && j.order_date <= me &&
        (!filterCustType || j.customer_type === filterCustType))
        .reduce((s, j) => s + (j.revenue_ex_vat || 0), 0)
      return { label: MONTHS_TH[m], revenue: rev }
    })
  }, [allJobs, period, start, filterCustType])

  const trendMax = Math.max(...monthlyTrend.map(t => t.revenue), 1)

  if (loading) return <PageSpinner />
  if (fetchError) return <PageError message={fetchError} onRetry={() => { setLoading(true); setFetchError('') }} />

  const PERIODS: { key: Period; label: string }[] = [
    { key: 'week', label: 'สัปดาห์' },
    { key: 'month', label: 'เดือน' },
    { key: 'quarter', label: 'ไตรมาส' },
    { key: 'year', label: 'ปี' },
  ]

  return (
    <div className="p-6 space-y-5">

      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-page-title" style={{ color: 'var(--text-1)' }}>Sales Performance</h1>
          <p className="text-sm mt-0.5" style={{ color: 'var(--text-3)' }}>ยอดขายนับจาก order_date · ยอดส่งมอบจาก actual_deliver_date</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <select value={filterCustType} onChange={e => setFilterCustType(e.target.value)}
            className="rounded-[8px] px-3 py-1.5 text-sm outline-none"
            style={{ background: 'var(--hover-bg)', color: 'var(--text-2)' }}>
            <option value="">B2C + B2B</option>
            <option value="B2C">B2C</option>
            <option value="B2B">B2B</option>
          </select>
          <div className="flex rounded-[11px] overflow-hidden" style={{ border: '1px solid var(--divider)' }}>
            {PERIODS.map(p => (
              <button key={p.key} onClick={() => { setPeriod(p.key); setOffset(0) }}
                className="px-3 py-1.5 text-xs font-semibold"
                style={{ background: period === p.key ? 'var(--accent)' : 'var(--hover-bg)', color: period === p.key ? '#fff' : 'var(--text-2)' }}>
                {p.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Period navigation */}
      <div className="flex items-center gap-3">
        <button onClick={() => setOffset(o => o - 1)} className="p-2 rounded-[8px]"
          style={{ background: 'var(--hover-bg)', color: 'var(--text-2)' }}>
          <ChevronLeft size={15} />
        </button>
        <div className="glass-card px-5 py-2 text-sm font-semibold flex-1 text-center" style={{ color: 'var(--text-1)' }}>
          {label}
          {offset === 0 && <span className="ml-2 text-xs px-2 py-0.5 rounded-full" style={{ background: 'var(--active-bg)', color: 'var(--accent)' }}>ปัจจุบัน</span>}
        </div>
        <button onClick={() => setOffset(o => o + 1)} disabled={offset >= 0}
          className="p-2 rounded-[8px]"
          style={{ background: 'var(--hover-bg)', color: offset >= 0 ? 'var(--text-3)' : 'var(--text-2)' }}>
          <ChevronRight size={15} />
        </button>
      </div>

      {/* Org Target Banner */}
      {orgTarget && offset === 0 && (
        <div className="rounded-[18px] p-4 flex gap-6 flex-wrap" style={{ background: 'rgba(249,115,22,0.08)', border: '1px solid rgba(249,115,22,0.25)' }}>
          <div className="flex items-center gap-2">
            <Target size={13} className="text-orange-400" />
            <span className="text-orange-400 text-xs font-bold uppercase tracking-wider">เป้าองค์กร {label}</span>
          </div>
          <div className="flex gap-8 flex-wrap">
            <div>
              <p className="text-[10px]" style={{ color: 'var(--text-3)' }}>เป้ายอดขาย</p>
              <p className="text-emerald-400 font-bold text-sm">{f(orgTarget.sales)}</p>
              <div className="mt-1 h-1.5 w-36 rounded-full" style={{ background: 'var(--divider)' }}>
                <div className="h-1.5 rounded-full bg-emerald-400 transition-all" style={{ width: `${Math.min(pct(salesRevenue, orgTarget.sales), 100)}%` }} />
              </div>
              <p className="text-[10px] mt-0.5" style={{ color: 'var(--text-3)' }}>จริง {f(salesRevenue)} ({pct(salesRevenue, orgTarget.sales)}%)</p>
            </div>
            <div>
              <p className="text-[10px]" style={{ color: 'var(--text-3)' }}>เป้าส่งมอบ</p>
              <p className="text-blue-400 font-bold text-sm">{f(orgTarget.delivery)}</p>
              <div className="mt-1 h-1.5 w-36 rounded-full" style={{ background: 'var(--divider)' }}>
                <div className="h-1.5 rounded-full bg-blue-400 transition-all" style={{ width: `${Math.min(pct(deliveryRevenue, orgTarget.delivery), 100)}%` }} />
              </div>
              <p className="text-[10px] mt-0.5" style={{ color: 'var(--text-3)' }}>จริง {f(deliveryRevenue)} ({pct(deliveryRevenue, orgTarget.delivery)}%)</p>
            </div>
          </div>
        </div>
      )}

      {/* KPI Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          { icon: TrendingUp, label: 'ยอดขาย (Order Date)', value: fk(salesRevenue), sub: `${periodJobs.length} งาน`, color: '#4ade80' },
          { icon: Package, label: 'ยอดส่งมอบ', value: fk(deliveryRevenue), sub: `${deliveredJobs.length} งาน`, color: '#60a5fa' },
          { icon: Users, label: 'Win Rate', value: winRate + '%', sub: `ปิด ${closedCount} · หลุด ${lostCount}`, color: winRate >= 50 ? '#4ade80' : '#f97316' },
          { icon: DollarSign, label: 'โทร/เยี่ยม', value: totalCalls.toLocaleString(), sub: `เยี่ยม ${totalVisits} ครั้ง`, color: '#fbbf24' },
        ].map(({ icon: Icon, label: lbl, value, sub, color }) => (
          <div key={lbl} className="glass-card p-4">
            <div className="flex items-center gap-2 mb-2">
              <Icon size={13} style={{ color }} />
              <span className="text-card-title" style={{ color: 'var(--text-3)' }}>{lbl}</span>
            </div>
            <p className="text-kpi-number" style={{ color }}>{value}</p>
            <p className="text-xs mt-1" style={{ color: 'var(--text-3)' }}>{sub}</p>
          </div>
        ))}
      </div>

      {/* B2C / B2B / RPT split */}
      <div className="grid grid-cols-3 gap-4">
        {[
          { label: 'B2C', revenue: b2cRevenue, count: periodJobs.filter(j => j.customer_type === 'B2C').length, color: '#60a5fa' },
          { label: 'B2B', revenue: b2bRevenue, count: periodJobs.filter(j => j.customer_type === 'B2B').length, color: '#a78bfa' },
          { label: 'RPT', revenue: rptRevenue, count: periodJobs.filter(j => j.work_type === 'RPT').length, color: '#34d399' },
        ].map(s => (
          <div key={s.label} className="glass-card p-4">
            <div className="flex items-center justify-between mb-1">
              <span className="text-xs font-bold px-2 py-0.5 rounded-full" style={{ background: s.color + '22', color: s.color }}>{s.label}</span>
              <span className="text-xs" style={{ color: 'var(--text-3)' }}>{s.count} งาน</span>
            </div>
            <p className="text-lg font-bold mt-1" style={{ color: 'var(--text-1)' }}>{fk(s.revenue)}</p>
            <p className="text-xs mt-0.5" style={{ color: 'var(--text-3)' }}>
              {salesRevenue > 0 ? pct(s.revenue, salesRevenue) + '% ของยอดรวม' : '—'}
            </p>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">

        {/* Pipeline Funnel */}
        <div className="glass-card p-5">
          <div className="flex items-center gap-2 mb-1">
            <Target size={13} style={{ color: 'var(--accent)' }} />
            <h2 className="text-section-title" style={{ color: 'var(--text-1)' }}>Pipeline Funnel</h2>
          </div>
          <p className="text-xs mb-4" style={{ color: 'var(--text-3)' }}>ลูกค้าทั้งหมด {customers.length} ราย · Conversion {pct(closedCount, customers.length)}%</p>
          <div className="space-y-3">
            {funnelData.map(s => (
              <div key={s.status}>
                <div className="flex items-center justify-between mb-1">
                  <span className="text-xs" style={{ color: 'var(--text-2)' }}>{STATUS_LABEL[s.status]}</span>
                  <div className="flex items-center gap-3">
                    {s.value > 0 && <span className="text-xs" style={{ color: 'var(--text-3)' }}>{f(s.value)}</span>}
                    <span className="text-xs font-semibold w-5 text-right" style={{ color: 'var(--text-1)' }}>{s.count}</span>
                  </div>
                </div>
                <div className="h-2 rounded-full overflow-hidden" style={{ background: 'var(--divider)' }}>
                  <div className="h-full rounded-full transition-all duration-700"
                    style={{ width: s.count > 0 ? Math.max(s.count / s.max * 100, 4) + '%' : '0%', background: STATUS_COLOR[s.status], opacity: 0.85 }} />
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Lead Source */}
        <div className="glass-card p-5">
          <div className="flex items-center gap-2 mb-4">
            <BarChart3 size={13} style={{ color: '#fbbf24' }} />
            <h2 className="text-section-title" style={{ color: 'var(--text-1)' }}>Lead Source</h2>
          </div>
          {sourceBreakdown.length === 0 ? (
            <p className="text-sm text-center py-6" style={{ color: 'var(--text-3)' }}>ยังไม่มีข้อมูล</p>
          ) : (
            <div className="space-y-3">
              {sourceBreakdown.map((s, i) => (
                <div key={s.source}>
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-xs" style={{ color: 'var(--text-2)' }}>{s.source}</span>
                    <span className="text-xs font-semibold" style={{ color: 'var(--text-1)' }}>{s.count} · {pct(s.count, customers.length)}%</span>
                  </div>
                  <div className="h-2 rounded-full overflow-hidden" style={{ background: 'var(--divider)' }}>
                    <div className="h-full rounded-full transition-all"
                      style={{ width: Math.max(s.count / sourceMax * 100, 4) + '%', background: `hsl(${40 + i * 25},80%,65%)` }} />
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Monthly trend (year view) */}
      {period === 'year' && monthlyTrend.length > 0 && (
        <div className="glass-card p-5">
          <div className="flex items-center gap-2 mb-4">
            <BarChart3 size={13} style={{ color: 'var(--accent)' }} />
            <h2 className="text-section-title" style={{ color: 'var(--text-1)' }}>ยอดขายรายเดือน {start.slice(0, 4)}</h2>
          </div>
          <div className="flex items-end gap-1.5 h-28">
            {monthlyTrend.map(m => (
              <div key={m.label} className="flex-1 flex flex-col items-center gap-1">
                <div className="w-full rounded-t-lg relative group"
                  style={{ height: m.revenue > 0 ? Math.max(m.revenue / trendMax * 100, 4) + 'px' : '4px', background: m.revenue > 0 ? 'linear-gradient(180deg,var(--accent),rgba(99,102,241,0.4))' : 'var(--divider)', minHeight: '4px' }}>
                  {m.revenue > 0 && (
                    <div className="absolute -top-7 left-1/2 -translate-x-1/2 opacity-0 group-hover:opacity-100 transition-opacity text-xs whitespace-nowrap px-1.5 py-0.5 rounded-lg z-10"
                      style={{ background: 'var(--active-bg)', color: 'var(--text-1)' }}>
                      {fk(m.revenue)}
                    </div>
                  )}
                </div>
                <span className="text-[10px]" style={{ color: 'var(--text-3)' }}>{m.label}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Sales Ranking */}
      <div className="glass-card p-5">
        <div className="flex items-center gap-2 mb-4">
          <Award size={13} style={{ color: '#fbbf24' }} />
          <h2 className="text-section-title" style={{ color: 'var(--text-1)' }}>Sales Ranking — {label}</h2>
        </div>
        {salesRanking.length === 0 ? (
          <p className="text-sm text-center py-6" style={{ color: 'var(--text-3)' }}>ไม่มีข้อมูลในช่วงนี้</p>
        ) : (
          <div className="space-y-4">
            {salesRanking.map((s, i) => (
              <div key={s.name}>
                <div className="flex items-center gap-3 mb-1.5">
                  <span className="text-base w-6 flex-shrink-0">
                    {i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `${i + 1}.`}
                  </span>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold" style={{ color: 'var(--text-1)' }}>{s.name}</p>
                    <p className="text-xs" style={{ color: 'var(--text-3)' }}>
                      {s.units} งาน · โทร {s.calls} · เยี่ยม {s.visits}
                    </p>
                  </div>
                  <p className="text-sm font-bold flex-shrink-0" style={{ color: '#4ade80' }}>{fk(s.revenue)}</p>
                </div>
                <div className="h-1.5 rounded-full overflow-hidden ml-9" style={{ background: 'var(--divider)' }}>
                  <div className="h-full rounded-full transition-all"
                    style={{ width: (s.revenue / salesMax * 100) + '%', background: `hsl(${220 + i * 30},75%,65%)` }} />
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

    </div>
  )
}
