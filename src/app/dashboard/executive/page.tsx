'use client'

import { useEffect, useState, useMemo } from 'react'
import { createClient } from '@/lib/supabase/client'
import { BarChart3, TrendingUp, Users, DollarSign, Target, Package, Award, ChevronLeft, ChevronRight } from 'lucide-react'
import { PageSpinner, PageError, EmptyState } from '@/components/ui/StateUI'
import PageHeader from '@/components/ui/PageHeader'
import { crmStage, FUNNEL_ORDER } from '@/lib/status'

type Customer = {
  id: string; status: string; budget: number; customer_type: string
  source: string; assigned_to: string; created_at: string
  users?: { name: string }
}

type Job = {
  id: string; order_date: string; work_start_date: string; actual_deliver_date: string
  revenue_ex_vat: number; revenue_inc_vat: number; work_type: string; customer_type: string
  working_status: string; sales_id: string
  sales?: { name: string }
  projects?: { name: string }
}
type PaidPayment = { paid_amount: number; paid_date: string; job_id: string; jobs: { sales_id: string } | null }

type Period = 'week' | 'month' | 'quarter' | 'year'

const f = (v: number) => '฿' + Math.round(v || 0).toLocaleString()
const fk = (v: number) => {
  if (v >= 1_000_000) return '฿' + (v / 1_000_000).toFixed(2) + 'M'
  if (v >= 1_000) return '฿' + (v / 1_000).toFixed(0) + 'K'
  return '฿' + Math.round(v || 0).toLocaleString()
}
const pct = (a: number, b: number) => b > 0 ? Math.round(a / b * 100) : 0

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
  const [rawOrgTargets, setRawOrgTargets] = useState<{ year: number; month: number; target_sales_value: number; target_delivery_value: number }[]>([])
  const [loading, setLoading] = useState(true)
  const [fetchError, setFetchError] = useState('')

  const [period, setPeriod] = useState<Period>('month')
  const [offset, setOffset] = useState(0)
  const [filterCustType, setFilterCustType] = useState('')
  const [allPayments, setAllPayments] = useState<PaidPayment[]>([])
  const [mainTab, setMainTab] = useState<'performance' | 'team'>('performance')
  const [teamUsers, setTeamUsers] = useState<{ id: string; name: string; manager_id: string | null }[]>([])
  const [salesTargets, setSalesTargets] = useState<{ user_id: string; month: number; year: number; target_sales_value: number; target_delivery_value: number }[]>([])

  const { start, end, label } = getPeriodBounds(period, offset)

  useEffect(() => {
    async function load() {
      setLoading(true)
      setFetchError('')
      const [
        { data: cust, error: e1 },
        { data: jobs, error: e2 },
        { data: ot },
        { data: pmts },
      ] = await Promise.all([
        supabase.from('customers').select('id,status,budget,customer_type,source,assigned_to,created_at,users!customers_assigned_to_fkey(name)'),
        supabase.from('jobs').select('id,order_date,work_start_date,actual_deliver_date,revenue_ex_vat,revenue_inc_vat,work_type,customer_type,working_status,sales_id,sales:users!jobs_sales_id_fkey(name),projects(name)'),
        supabase.from('org_targets').select('target_sales_value,target_delivery_value,year,month').order('year').order('month'),
        supabase.from('payments').select('paid_amount,paid_date,job_id,jobs(sales_id)').eq('status', 'paid').not('paid_date', 'is', null),
      ])
      if (e1 || e2) { setFetchError((e1 ?? e2)!.message); setLoading(false); return }
      setAllCustomers((cust || []) as unknown as Customer[])
      setAllJobs((jobs || []) as unknown as Job[])
      setAllPayments(((pmts as any) || []) as PaidPayment[])

      setRawOrgTargets(ot || [])

      // Load team data
      const [{ data: uData }, { data: stData }] = await Promise.all([
        supabase.from('users').select('id, name, manager_id').eq('active', true),
        supabase.from('sales_targets').select('user_id, month, year, target_sales_value, target_delivery_value').eq('year', new Date().getFullYear()),
      ])
      setTeamUsers((uData || []) as any)
      setSalesTargets((stData || []) as any)

      setLoading(false)
    }
    load()
  }, [])

  const customers = useMemo(() =>
    allCustomers.filter(c => !filterCustType || c.customer_type === filterCustType),
    [allCustomers, filterCustType]
  )

  const periodJobs = useMemo(() =>
    allJobs.filter(j => {
      const d = j.order_date || j.work_start_date
      return !!d && d >= start && d <= end && (!filterCustType || j.customer_type === filterCustType)
    }),
    [allJobs, start, end, filterCustType]
  )

  const deliveredJobs = useMemo(() =>
    allJobs.filter(j => j.actual_deliver_date >= start && j.actual_deliver_date <= end &&
      j.working_status === 'ส่งมอบแล้ว' &&
      (!filterCustType || j.customer_type === filterCustType)),
    [allJobs, start, end, filterCustType]
  )

  // Org target — reactive to period + offset
  const orgTarget = useMemo(() => {
    if (!rawOrgTargets.length) return null
    const startDate = new Date(start); const endDate = new Date(end)
    const startYear = startDate.getFullYear(); const startMonth = startDate.getMonth() + 1
    const endYear = endDate.getFullYear(); const endMonth = endDate.getMonth() + 1
    const rows = rawOrgTargets.filter(x => {
      if (x.year < startYear || x.year > endYear) return false
      if (x.year === startYear && x.month < startMonth) return false
      if (x.year === endYear && x.month > endMonth) return false
      return true
    })
    const sales = rows.reduce((s, x) => s + (x.target_sales_value || 0), 0)
    const delivery = rows.reduce((s, x) => s + (x.target_delivery_value || 0), 0)
    return sales > 0 || delivery > 0 ? { sales, delivery } : null
  }, [rawOrgTargets, start, end])

  // KPIs
  const salesRevenue = periodJobs.reduce((s, j) => s + (j.revenue_ex_vat || 0), 0)
  const deliveryRevenue = deliveredJobs.reduce((s, j) => s + (j.revenue_ex_vat || 0), 0)
  const avgRevenue = periodJobs.length > 0 ? Math.round(salesRevenue / periodJobs.length) : 0

  // Win Rate: customers ที่เข้า pipeline ในช่วงเวลานี้
  const periodCustomers = useMemo(() =>
    allCustomers.filter(c =>
      (!filterCustType || c.customer_type === filterCustType) &&
      c.created_at >= start && c.created_at <= end
    ),
    [allCustomers, filterCustType, start, end]
  )
  const periodClosed = periodCustomers.filter(c => c.status === 'closed').length
  const periodLost = periodCustomers.filter(c => c.status === 'lost').length
  const winRate = pct(periodClosed, periodClosed + periodLost)

  // All-time closed/lost for pipeline funnel label
  const closedCount = customers.filter(c => c.status === 'closed').length
  const lostCount = customers.filter(c => c.status === 'lost').length

  // Pipeline funnel
  const pipelineOrder = FUNNEL_ORDER
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

  // Sales ranking from jobs (inc_vat, consistent with dashboard)
  const salesRanking = useMemo(() => {
    const map = new Map<string, { name: string; units: number; revenue: number }>()
    periodJobs.forEach(j => {
      const name = (j.sales as any)?.name || 'ไม่ระบุ'
      const key = j.sales_id || name
      const cur = map.get(key) || { name, units: 0, revenue: 0 }
      map.set(key, { ...cur, units: cur.units + 1, revenue: cur.revenue + (j.revenue_inc_vat || j.revenue_ex_vat || 0) })
    })
    return [...map.values()].sort((a, b) => b.revenue - a.revenue || b.units - a.units)
  }, [periodJobs])

  const salesMax = Math.max(...salesRanking.map(s => s.revenue), 1)

  // Lead source breakdown — only customers whose source was actually recorded.
  // Including the blanks made ไม่ระบุ a 92% bar that dwarfed every real source
  // and left the chart unreadable. Nearly all blanks come from the one-time
  // import at go-live and cannot be backfilled, so they are stated as coverage
  // beneath the chart rather than drawn as a category.
  const sourceBreakdown = useMemo(() => {
    const map = new Map<string, number>()
    customers.forEach(c => {
      if (!c.source) return
      map.set(c.source, (map.get(c.source) || 0) + 1)
    })
    return [...map.entries()].map(([source, count]) => ({ source, count }))
      .sort((a, b) => b.count - a.count)
  }, [customers])

  const sourceKnown = useMemo(() => customers.filter(c => !!c.source).length, [customers])
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
    <div className="page-content space-y-5">

      {/* Header */}
      <PageHeader
        title="Sales Performance"
        subtitle="ยอดขายนับจาก order_date · ยอดส่งมอบจาก actual_deliver_date"
        className="mb-5"
      />

      {/* Tab bar — same style as Finance */}
      {/* The team tab used to fill with --accent-purple — a second selection
          colour with no meaning behind it. Selection is always --accent. */}
      <div className="tab-group mb-5 w-fit">
        <button onClick={() => setMainTab('performance')}
          className={`tab-btn ${mainTab === 'performance' ? 'active' : ''}`}>
          <BarChart3 size={14} />Sales Performance
        </button>
        <button onClick={() => setMainTab('team')}
          className={`tab-btn ${mainTab === 'team' ? 'active' : ''}`}>
          <Users size={14} />ทีม Sales
        </button>
      </div>

      {/* Period + filter row — same style as Finance, always visible */}
      <div className="flex items-center gap-3 flex-wrap mb-5">
        <select value={filterCustType} onChange={e => setFilterCustType(e.target.value)}
          className="field-input" style={{ width: 'auto' }}>
          <option value="">B2C + B2B</option>
          <option value="B2C">B2C</option>
          <option value="B2B">B2B</option>
        </select>
        <div className="tab-group">
          {PERIODS.map(p => (
            <button key={p.key} onClick={() => { setPeriod(p.key); setOffset(0) }}
              className={`tab-btn ${period === p.key ? 'active' : ''}`}>
              {p.label}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
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
      </div>

      {mainTab === 'performance' && <>

      {/* Org Target Banner */}
      {orgTarget && offset === 0 && (
        <div className="rounded-[18px] p-4 flex gap-6 flex-wrap" style={{ background: 'color-mix(in srgb, var(--accent-orange) 8%, transparent)', border: '1px solid color-mix(in srgb, var(--accent-orange) 25%, transparent)' }}>
          <div className="flex items-center gap-2">
            <Target size={13} style={{ color: 'var(--accent-orange)' }} />
            <span className="text-xs font-bold uppercase tracking-wider" style={{ color: 'var(--accent-orange)' }}>เป้าองค์กร {label}</span>
          </div>
          <div className="flex gap-8 flex-wrap">
            <div>
              <p className="text-micro" style={{ color: 'var(--text-3)' }}>เป้ายอดขาย</p>
              <p className="font-bold text-sm" style={{ color: 'var(--accent-green)' }}>{f(orgTarget.sales)}</p>
              <div className="mt-1 h-1.5 w-36 rounded-full" style={{ background: 'var(--divider)' }}>
                <div className="h-1.5 rounded-full transition-all" style={{ background: 'var(--accent-green)', width: `${Math.min(pct(salesRevenue, orgTarget.sales), 100)}%` }} />
              </div>
              <p className="text-micro mt-0.5" style={{ color: 'var(--text-3)' }}>จริง {f(salesRevenue)} ({pct(salesRevenue, orgTarget.sales)}%)</p>
            </div>
            <div>
              <p className="text-micro" style={{ color: 'var(--text-3)' }}>เป้าส่งมอบ</p>
              <p className="font-bold text-sm" style={{ color: 'var(--accent-blue)' }}>{f(orgTarget.delivery)}</p>
              <div className="mt-1 h-1.5 w-36 rounded-full" style={{ background: 'var(--divider)' }}>
                <div className="h-1.5 rounded-full transition-all" style={{ background: 'var(--accent-blue)', width: `${Math.min(pct(deliveryRevenue, orgTarget.delivery), 100)}%` }} />
              </div>
              <p className="text-micro mt-0.5" style={{ color: 'var(--text-3)' }}>จริง {f(deliveryRevenue)} ({pct(deliveryRevenue, orgTarget.delivery)}%)</p>
            </div>
          </div>
        </div>
      )}

      {/* KPI Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          { icon: TrendingUp, label: 'ยอดขาย (Order Date)', value: fk(salesRevenue), sub: `${periodJobs.length} งาน`, color: 'var(--accent-green)' },
          { icon: Package, label: 'ยอดส่งมอบ', value: fk(deliveryRevenue), sub: `${deliveredJobs.length} งาน`, color: 'var(--accent-blue)' },
          { icon: Users, label: 'Win Rate (ช่วงนี้)', value: winRate + '%', sub: `ปิด ${periodClosed} · หลุด ${periodLost} (เข้า pipeline ${start.slice(0,7)})`, color: winRate >= 50 ? 'var(--accent-green)' : 'var(--accent-orange)' },
          { icon: DollarSign, label: 'Revenue เฉลี่ย/งาน', value: fk(avgRevenue), sub: `จาก ${periodJobs.length} งาน`, color: 'var(--accent-amber)' },
        ].map(({ icon: Icon, label: lbl, value, sub, color }) => (
          <div key={lbl} className="ds-card-sm">
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
          { label: 'B2C', revenue: b2cRevenue, count: periodJobs.filter(j => j.customer_type === 'B2C').length, color: 'var(--accent-blue)' },
          { label: 'B2B', revenue: b2bRevenue, count: periodJobs.filter(j => j.customer_type === 'B2B').length, color: 'var(--accent-purple)' },
          { label: 'RPT', revenue: rptRevenue, count: periodJobs.filter(j => j.work_type === 'RPT').length, color: 'var(--accent-green)' },
        ].map(s => (
          <div key={s.label} className="ds-card-sm">
            <div className="flex items-center justify-between mb-1">
              <span className="text-xs font-bold px-2 py-0.5 rounded-[4px]" style={{ background: s.color + '22', color: s.color }}>{s.label}</span>
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
        <div className="ds-card">
          <div className="flex items-center gap-2 mb-1">
            <Target size={13} style={{ color: 'var(--accent)' }} />
            <h2 className="text-section-title" style={{ color: 'var(--text-1)' }}>Pipeline Funnel</h2>
          </div>
          <p className="text-xs mb-4" style={{ color: 'var(--text-3)' }}>ลูกค้าทั้งหมด {customers.length} ราย · Conversion {pct(closedCount, customers.length)}%</p>
          <div className="space-y-3">
            {funnelData.map(s => (
              <div key={s.status}>
                <div className="flex items-center justify-between mb-1">
                  <span className="text-xs" style={{ color: 'var(--text-2)' }}>{crmStage(s.status).label}</span>
                  <div className="flex items-center gap-3">
                    {s.value > 0 && <span className="text-xs" style={{ color: 'var(--text-3)' }}>{f(s.value)}</span>}
                    <span className="text-xs font-semibold w-5 text-right" style={{ color: 'var(--text-1)' }}>{s.count}</span>
                  </div>
                </div>
                <div className="h-2 rounded-full overflow-hidden" style={{ background: 'var(--divider)' }}>
                  <div className="h-full rounded-full transition-all duration-700"
                    style={{ width: s.count > 0 ? Math.max(s.count / s.max * 100, 4) + '%' : '0%', background: crmStage(s.status).color, opacity: 0.85 }} />
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Lead Source */}
        <div className="ds-card">
          <div className="flex items-center gap-2 mb-4">
            <BarChart3 size={13} style={{ color: 'var(--accent-orange)' }} />
            <h2 className="text-section-title" style={{ color: 'var(--text-1)' }}>Lead Source</h2>
          </div>
          {sourceBreakdown.length === 0 ? (
            <EmptyState message="ยังไม่มีลูกค้าที่บันทึกช่องทางไว้" />
          ) : (
            <>
              <div className="space-y-3">
                {sourceBreakdown.map(s => (
                  <div key={s.source}>
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-xs" style={{ color: 'var(--text-2)' }}>{s.source}</span>
                      {/* share of customers whose source is known, not of all customers */}
                      <span className="text-xs font-semibold" style={{ color: 'var(--text-1)' }}>{s.count} · {pct(s.count, sourceKnown)}%</span>
                    </div>
                    <div className="h-2 rounded-full overflow-hidden" style={{ background: 'var(--divider)' }}>
                      <div className="h-full rounded-full transition-all"
                        style={{ width: Math.max(s.count / sourceMax * 100, 4) + '%', background: 'var(--chart-1)' }} />
                    </div>
                  </div>
                ))}
              </div>
              <p className="text-label mt-3 pt-3" style={{ color: pct(sourceKnown, customers.length) < 50 ? 'var(--accent-orange)' : 'var(--text-3)', borderTop: '1px solid var(--divider)' }}>
                จากลูกค้าที่บันทึกช่องทางไว้ {sourceKnown}/{customers.length} ราย ({pct(sourceKnown, customers.length)}%)
              </p>
            </>
          )}
        </div>
      </div>

      {/* Monthly trend (year view) */}
      {period === 'year' && monthlyTrend.length > 0 && (
        <div className="ds-card">
          <div className="flex items-center gap-2 mb-4">
            <BarChart3 size={13} style={{ color: 'var(--accent)' }} />
            <h2 className="text-section-title" style={{ color: 'var(--text-1)' }}>ยอดขายรายเดือน {start.slice(0, 4)}</h2>
          </div>
          <div className="flex items-end gap-1.5 h-28">
            {monthlyTrend.map(m => (
              <div key={m.label} className="flex-1 flex flex-col items-center gap-1">
                <div className="w-full rounded-t-lg relative group"
                  style={{ height: m.revenue > 0 ? Math.max(m.revenue / trendMax * 100, 4) + 'px' : '4px', background: m.revenue > 0 ? 'linear-gradient(180deg,var(--accent),color-mix(in srgb, var(--accent) 40%, transparent))' : 'var(--divider)', minHeight: '4px' }}>
                  {m.revenue > 0 && (
                    <div className="absolute -top-7 left-1/2 -translate-x-1/2 opacity-0 group-hover:opacity-100 transition-opacity text-xs whitespace-nowrap px-1.5 py-0.5 rounded-lg z-10"
                      style={{ background: 'var(--active-bg)', color: 'var(--text-1)' }}>
                      {fk(m.revenue)}
                    </div>
                  )}
                </div>
                <span className="text-micro" style={{ color: 'var(--text-3)' }}>{m.label}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Sales Ranking */}
      <div className="ds-card p-5">
        <div className="flex items-center gap-2 mb-4">
          <Award size={13} style={{ color: 'var(--accent-amber)' }} />
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
                      {s.units} งาน
                    </p>
                  </div>
                  <p className="text-sm font-bold flex-shrink-0" style={{ color: 'var(--accent-green)' }}>{fk(s.revenue)}</p>
                </div>
                <div className="h-1.5 rounded-full overflow-hidden ml-9" style={{ background: 'var(--divider)' }}>
                  <div className="h-full rounded-full transition-all"
                    style={{ width: (s.revenue / salesMax * 100) + '%', background: 'var(--chart-1)' }} />
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      </>}

      {/* ══ TEAM TAB ══════════════════════════════════════════ */}
      {mainTab === 'team' && (() => {
        const now = new Date(); const thisMonth = now.getMonth() + 1
        const TEAM_COLORS = ['var(--chart-1)', 'var(--chart-2)']
        const managerIds = [...new Set(teamUsers.filter(u => u.manager_id).map(u => u.manager_id!))]
        const teamData = managerIds.map((mgrId, idx) => {
          const manager = teamUsers.find(u => u.id === mgrId) ?? { id: mgrId, name: mgrId, manager_id: null }
          const members = teamUsers.filter(u => u.manager_id === mgrId)
          const memberIds = new Set(members.map(m => m.id))
          const getActual = (uid: string, type: 'sales' | 'deliv') => {
            const monthJobs = allJobs.filter(j => {
              const d = type === 'sales' ? (j.order_date || j.work_start_date) : j.actual_deliver_date
              return d && d >= start && d <= end && j.sales_id === uid
            })
            return monthJobs.reduce((s, j) => s + (j.revenue_inc_vat || j.revenue_ex_vat || 0), 0)
          }
          const getReceived = (uid: string) =>
            allPayments.filter(p => p.jobs?.sales_id === uid && p.paid_date >= start && p.paid_date <= end)
              .reduce((s, p) => s + (p.paid_amount || 0), 0)
          const teamActualSales = members.reduce((s, u) => s + getActual(u.id, 'sales'), 0)
          const teamActualDeliv = members.reduce((s, u) => s + getActual(u.id, 'deliv'), 0)
          const teamActualReceived = members.reduce((s, u) => s + getReceived(u.id), 0)
          const teamTargetSales = salesTargets.filter(t => memberIds.has(t.user_id) && t.month === thisMonth).reduce((s, t) => s + (t.target_sales_value || 0), 0)
          const teamTargetDeliv = salesTargets.filter(t => memberIds.has(t.user_id) && t.month === thisMonth).reduce((s, t) => s + (t.target_delivery_value || 0), 0)
          const color = TEAM_COLORS[idx % TEAM_COLORS.length]
          return { manager, members, teamActualSales, teamActualDeliv, teamActualReceived, teamTargetSales, teamTargetDeliv, color, getActual, getReceived }
        })
        const ProgressBar = ({ value, max, color }: { value: number; max: number; color: string }) => (
          <div className="h-1 rounded-full mt-1 overflow-hidden" style={{ background: 'var(--divider)' }}>
            <div className="h-full rounded-full" style={{ width: Math.min(100, max > 0 ? value / max * 100 : 0) + '%', background: color }} />
          </div>
        )
        if (managerIds.length === 0) return (
          <div className="ds-card"><EmptyState icon={Users} message="ยังไม่มีข้อมูลทีม" sub="ตั้งค่า manager_id ที่หน้า Users" /></div>
        )
        return (
          <div className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {teamData.map(team => (
                <div key={team.manager.id} className="rounded-[18px] p-5 space-y-4"
                  style={{ background: 'var(--card-bg)', border: `1px solid ${team.color}40` }}>
                  <div className="flex items-center gap-3">
                    <div className="w-9 h-9 rounded-full flex items-center justify-center font-bold text-white" style={{ background: team.color }}>
                      {team.manager.name[0]}
                    </div>
                    <div>
                      <p className="text-sm font-semibold" style={{ color: 'var(--text-1)' }}>ทีม {team.manager.name}</p>
                      <p className="text-xs" style={{ color: 'var(--text-3)' }}>{team.members.length} คน · {label}</p>
                    </div>
                  </div>
                  <div className="grid grid-cols-3 gap-3">
                    {[{ label: 'ยอดขายทีม', val: team.teamActualSales, tgt: team.teamTargetSales, color: 'var(--accent-green)' },
                      { label: 'รายรับทีม', val: team.teamActualReceived, tgt: 0, color: 'var(--accent-green)' },
                      { label: 'ส่งมอบทีม', val: team.teamActualDeliv, tgt: team.teamTargetDeliv, color: 'var(--accent-blue)' }].map(item => (
                      <div key={item.label} className="rounded-lg p-3" style={{ background: 'var(--hover-bg)' }}>
                        <p className="text-micro mb-1" style={{ color: 'var(--text-3)' }}>{item.label}</p>
                        <p className="font-bold text-base" style={{ color: item.color }}>{f(item.val)}</p>
                        {item.tgt > 0 && <>
                          <p className="text-micro mt-1" style={{ color: 'var(--text-3)' }}>เป้า {f(item.tgt)}</p>
                          <ProgressBar value={item.val} max={item.tgt} color={item.color} />
                          <p className="text-micro mt-0.5 text-right" style={{ color: item.color }}>{pct(item.val, item.tgt)}%</p>
                        </>}
                      </div>
                    ))}
                  </div>
                  <div className="space-y-2">
                    <p className="text-micro font-semibold uppercase tracking-wider" style={{ color: 'var(--text-3)' }}>รายคน</p>
                    {team.members.map(u => {
                      const actS = team.getActual(u.id, 'sales')
                      const actD = team.getActual(u.id, 'deliv')
                      const actR = team.getReceived(u.id)
                      const tgtS = salesTargets.filter(t => t.user_id === u.id && t.month === thisMonth).reduce((s, t) => s + (t.target_sales_value || 0), 0)
                      const tgtD = salesTargets.filter(t => t.user_id === u.id && t.month === thisMonth).reduce((s, t) => s + (t.target_delivery_value || 0), 0)
                      return (
                        <div key={u.id} className="rounded-lg p-3" style={{ background: 'var(--hover-bg)' }}>
                          <div className="flex items-center justify-between mb-2">
                            <div className="flex items-center gap-2">
                              <div className="w-6 h-6 rounded-full flex items-center justify-center text-micro font-bold text-white"
                                style={{ background: team.color + '99' }}>{u.name[0]}</div>
                              <span className="text-xs font-semibold" style={{ color: 'var(--text-1)' }}>{u.name}</span>
                            </div>
                            {tgtS > 0 && <span className="text-micro font-semibold" style={{ color: pct(actS, tgtS) >= 100 ? 'var(--accent-green)' : 'var(--text-3)' }}>{pct(actS, tgtS)}%</span>}
                          </div>
                          <div className="grid grid-cols-3 gap-2 text-micro">
                            <div>
                              <span style={{ color: 'var(--text-3)' }}>ขาย </span>
                              <span style={{ color: 'var(--accent-green)' }}>{f(actS)}</span>
                              {tgtS > 0 && <><span style={{ color: 'var(--text-3)' }}> / {f(tgtS)}</span><ProgressBar value={actS} max={tgtS} color="var(--accent-green)" /></>}
                            </div>
                            <div>
                              <span style={{ color: 'var(--text-3)' }}>รายรับ </span>
                              <span style={{ color: 'var(--accent-green)' }}>{f(actR)}</span>
                            </div>
                            <div>
                              <span style={{ color: 'var(--text-3)' }}>ส่งมอบ </span>
                              <span style={{ color: 'var(--accent-blue)' }}>{f(actD)}</span>
                              {tgtD > 0 && <><span style={{ color: 'var(--text-3)' }}> / {f(tgtD)}</span><ProgressBar value={actD} max={tgtD} color="var(--accent-blue)" /></>}
                            </div>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )
      })()}

    </div>
  )
}
