'use client'

import { useEffect, useState, useMemo } from 'react'
import { createClient } from '@/lib/supabase/client'
import { BarChart3, TrendingUp, Users, DollarSign, Target, Package, Award, } from 'lucide-react'
import { PageSpinner, PageError, EmptyState } from '@/components/ui/StateUI'
import PageHeader from '@/components/ui/PageHeader'
import FilterBar from '@/components/ui/FilterBar'
import PeriodPicker from '@/components/ui/PeriodPicker'
import { getPeriodBounds, MONTHS_TH, beYear, type PeriodUnit } from '@/lib/period'
import { crmStage, FUNNEL_ORDER, workCategory } from '@/lib/status'
import { baht, bahtShort } from '@/lib/money'
import { fetchAllRows } from '@/lib/fetchAll'
import {
  buildScorecard, settledByJob, pipelineFor, isIntragroup,
  type ScorecardJob, type ScorecardPayment,
} from '@/lib/salesScorecard'

type Customer = {
  id: string; customer_type: string
  source: string; created_at: string
  users?: { name: string }
}

type Job = {
  id: string; order_date: string; work_start_date: string; actual_deliver_date: string
  revenue_ex_vat: number; revenue_inc_vat: number; work_type: string; customer_type: string
  working_status: string; sales_id: string; crm_stage: string; customer_id: string | null
  sales?: { name: string }
  projects?: { name: string }
}
type PaidPayment = {
  paid_amount: number; paid_date: string; job_id: string
  // amount + voucher_amount are what buildScorecard settles with: a null
  // paid_amount falls back to the instalment amount, and a voucher is a
  // discount that settles the row rather than money still owed.
  amount: number; voucher_amount: number; status: string
  jobs: { sales_id: string } | null
}


const f = baht
// The K branch here rounded ฿1,600 to ฿2K and ฿999,499 to ฿999K. bahtShort
// shows the full value below a million instead, and MB. above it.
const fk = bahtShort
const pct = (a: number, b: number) => b > 0 ? Math.round(a / b * 100) : 0
/** ประเภทงาน dropdown value that means "drop the affiliated-company contracts". */
const NO_IG = 'NO_INTRAGROUP'


const ld = (d: Date) => `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`
/* Display year in Buddhist Era, as every other page does via the th-TH locale.
   ld() above stays Gregorian — it builds ISO keys for querying, not labels. */

export default function ExecutivePage() {
  const supabase = createClient()
  const [allCustomers, setAllCustomers] = useState<Customer[]>([])
  const [allJobs, setAllJobs] = useState<Job[]>([])
  const [rawOrgTargets, setRawOrgTargets] = useState<{ year: number; month: number; target_sales_value: number; target_delivery_value: number }[]>([])
  const [loading, setLoading] = useState(true)
  const [fetchError, setFetchError] = useState('')

  const [period, setPeriod] = useState<PeriodUnit>('month')
  const [offset, setOffset] = useState(0)
  const [filterCustType, setFilterCustType] = useState('')
  // '' means no filter. workCategory is the shared rule — an unclassified job
  // matches neither option, so it drops out of a filtered view rather than
  // being counted as whichever one the test happened to fall through to.
  const [filterWorkType, setFilterWorkType] = useState('')
  const matchWork = (wt: string | null | undefined) =>
    !filterWorkType || filterWorkType === NO_IG || workCategory(wt) === filterWorkType
  /* One scope test for every tab. NO_IG is not a work category — it drops the
     affiliated-company contracts (B2B + RPT), which no combination of the two
     dropdowns could express on their own: picking B2B keeps all B2B and picking
     RPT keeps all RPT. Excluding them used to be hard-coded inside the money
     buckets, which is why Sales Performance and Payments disagreed by ฿1.28 MB.
     on one person with nothing on screen to explain it. */
  const inScope = (j: { customer_type?: string | null; work_type?: string | null }) =>
    (!filterCustType || j.customer_type === filterCustType)
    && matchWork(j.work_type)
    && (filterWorkType !== NO_IG || !isIntragroup(j))
  const [allPayments, setAllPayments] = useState<PaidPayment[]>([])
  const [mainTab, setMainTab] = useState<'performance' | 'team' | 'individual'>('performance')
  const [teamUsers, setTeamUsers] = useState<{ id: string; name: string; manager_id: string | null; role: string }[]>([])
  const [selectedSales, setSelectedSales] = useState('')
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
        supabase.from('customers').select('id,customer_type,source,created_at'),
        fetchAllRows(() => supabase.from('jobs').select('id,order_date,work_start_date,actual_deliver_date,revenue_ex_vat,revenue_inc_vat,work_type,customer_type,working_status,crm_stage,sales_id,customer_id,sales:users!jobs_sales_id_fkey(name),projects(name)').order('id')),
        supabase.from('org_targets').select('target_sales_value,target_delivery_value,year,month').order('year').order('month'),
        // paid_date is no longer required: a paid instalment settles the job whether
        // or not someone typed the date. The team tab filters on paid_date itself,
        // and a null date simply fails that comparison. fetchAllRows because
        // payments sits close to PostgREST's 1,000-row cap.
        fetchAllRows(() => supabase.from('payments').select('paid_amount,paid_date,job_id,amount,voucher_amount,status,jobs(sales_id)').eq('status', 'paid').order('id')),
      ])
      if (e1 || e2) { setFetchError((e1 ?? e2)!.message); setLoading(false); return }
      setAllCustomers((cust || []) as unknown as Customer[])
      setAllJobs((jobs || []) as unknown as Job[])
      setAllPayments(((pmts as any) || []) as PaidPayment[])

      setRawOrgTargets(ot || [])

      // Load team data
      const [{ data: uData }, { data: stData }] = await Promise.all([
        // แผนก Sales เท่านั้น — แท็บนี้จัดกลุ่มจาก manager_id ล้วนๆ พอทีมจัดซื้อ/QS
        // ได้หัวหน้า (wanwipa.o) ตอนทำหน้า Cost มันก็โผล่มาเป็นทีมที่ 3 ทันที
        // ทั้งที่ไม่มีเป้ายอดขายและไม่มีงานผูก sales_id ตัวเลขจึงเป็น 0 ทั้งแถบ
        supabase.from('users').select('id, name, manager_id, role, dept')
          .eq('active', true).eq('dept', 'Sales Executive'),
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
      return !!d && d >= start && d <= end && inScope(j)
    }),
    [allJobs, start, end, filterCustType, filterWorkType]
  )

  const deliveredJobs = useMemo(() =>
    allJobs.filter(j => j.actual_deliver_date >= start && j.actual_deliver_date <= end &&
      j.working_status === 'ส่งมอบแล้ว' && inScope(j)),
    [allJobs, start, end, filterCustType, filterWorkType]
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
  // Counted from jobs, not customers: one buyer can hold a closed room and a
  // lost one at the same time, and customers.status could only say one of them.
  const periodJobIds = new Set(periodCustomers.map(c => c.id))
  const stageJobs = allJobs.filter(j => j.customer_id && periodJobIds.has(j.customer_id))
  const periodClosed = stageJobs.filter(j => j.crm_stage === 'closed').length
  const periodLost = stageJobs.filter(j => j.crm_stage === 'lost').length
  const winRate = pct(periodClosed, periodClosed + periodLost)

  // All-time closed/lost for pipeline funnel label
  const closedCount = allJobs.filter(j => j.crm_stage === 'closed').length
  const lostCount = allJobs.filter(j => j.crm_stage === 'lost').length

  // Pipeline funnel
  const pipelineOrder = FUNNEL_ORDER
  const funnelData = useMemo(() => {
    const max = Math.max(...pipelineOrder.map(s => allJobs.filter(j => j.crm_stage === s).length), 1)
    return pipelineOrder.map(s => ({
      status: s,
      count: allJobs.filter(j => j.crm_stage === s).length,
      // The job's own value. It used to fall back to customers.budget, retired
      // 2026-09-07 — every prospect now carries its value on the job.
      value: allJobs.filter(j => j.crm_stage === s)
        .reduce((sum, j) => sum + (j.revenue_inc_vat || 0), 0),
      max,
    }))
  }, [allJobs])

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
        inScope(j))
        .reduce((s, j) => s + (j.revenue_ex_vat || 0), 0)
      return { label: MONTHS_TH[m], revenue: rev }
    })
  }, [allJobs, period, start, filterCustType, filterWorkType])

  const trendMax = Math.max(...monthlyTrend.map(t => t.revenue), 1)

  if (loading) return <PageSpinner />
  if (fetchError) return <PageError message={fetchError} onRetry={() => { setLoading(true); setFetchError('') }} />

  
  return (
    <div className="page-content space-y-5">

      {/* Header */}
      <PageHeader
        title="Sales Performance"
        // Was "ยอดขายนับจาก order_date · ยอดส่งมอบจาก actual_deliver_date" — those are
        // database column names, not words the sales team uses.
        subtitle="ยอดขายนับจากวันที่ขาย · ยอดส่งมอบนับจากวันส่งมอบจริง"
        className="mb-5"
      />

      {/* Tab bar — same style as Finance */}
      {/* The team tab used to fill with --accent-purple — a second selection
          colour with no meaning behind it. Selection is always --accent. */}
      <div className="tab-group mb-5 w-fit">
        <button onClick={() => setMainTab('performance')}
          className={`tab-btn ${mainTab === 'performance' ? 'active' : ''}`}>
          <BarChart3 size={14} />ภาพรวม
        </button>
        <button onClick={() => setMainTab('team')}
          className={`tab-btn ${mainTab === 'team' ? 'active' : ''}`}>
          <Users size={14} />ทีม Sales
        </button>
        <button onClick={() => setMainTab('individual')}
          className={`tab-btn ${mainTab === 'individual' ? 'active' : ''}`}>
          <Award size={14} />รายคน
        </button>
      </div>

      {/* Period + filter row — always visible */}
      <FilterBar className="mb-5">
        <select value={filterCustType} onChange={e => setFilterCustType(e.target.value)}
          className="field-input" style={{ width: 'auto' }}>
          <option value="">B2C + B2B</option>
          <option value="B2C">B2C</option>
          <option value="B2B">B2B</option>
        </select>
        {/* N-RPT covers three stored values — N-RPT, N-RPT/EQ and N-RPT/Event —
            so the option groups them rather than listing all three, matching how
            Project Summary splits the same field. */}
        <select value={filterWorkType} onChange={e => setFilterWorkType(e.target.value)}
          className="field-input" style={{ width: 'auto' }}>
          <option value="">RPT + N-RPT</option>
          <option value="RPT">RPT</option>
          <option value="N-RPT">N-RPT</option>
          <option value={NO_IG}>ไม่รวมงานในเครือ</option>
        </select>
        <PeriodPicker unit={period} setUnit={setPeriod} offset={offset} setOffset={setOffset}
          units={['week','month','quarter','year']} />
      </FilterBar>

      {mainTab === 'performance' && <>

      {/* Org Target Banner.
          The `offset === 0` guard that used to be here hid the target for every
          period except the current one, so stepping back to compare against last
          month showed actuals with nothing to measure them against — even though
          orgTarget is computed from start/end and was already correct for any
          offset. The heading carries the period, so there is nothing to confuse. */}
      {orgTarget && (
        <div className="ds-card flex gap-6 flex-wrap">
          <div className="flex items-center gap-2">
            <Target size={13} style={{ color: 'var(--accent)' }} />
            <span className="text-label-upper" style={{ color: 'var(--text-2)' }}>เป้าองค์กร {label}</span>
          </div>
          <div className="flex gap-8 flex-wrap">
            <div>
              <p className="text-micro" style={{ color: 'var(--text-3)' }}>เป้ายอดขาย</p>
              <p className="font-bold text-sm" style={{ color: 'var(--accent-green)' }}>{f(orgTarget.sales)}</p>
              <div className="mt-1 h-1.5 w-36 rounded-full" style={{ background: 'var(--divider)' }}>
                <div className="h-1.5 rounded-full transition-all" style={{ background: 'var(--accent-green)', width: `${Math.min(pct(salesRevenue, orgTarget.sales), 100)}%` }} />
              </div>
              <p className="text-micro mt-1" style={{ color: 'var(--text-3)' }}>จริง {f(salesRevenue)} ({pct(salesRevenue, orgTarget.sales)}%)</p>
            </div>
            <div>
              <p className="text-micro" style={{ color: 'var(--text-3)' }}>เป้าส่งมอบ</p>
              <p className="font-bold text-sm" style={{ color: 'var(--accent-blue)' }}>{f(orgTarget.delivery)}</p>
              <div className="mt-1 h-1.5 w-36 rounded-full" style={{ background: 'var(--divider)' }}>
                <div className="h-1.5 rounded-full transition-all" style={{ background: 'var(--accent-blue)', width: `${Math.min(pct(deliveryRevenue, orgTarget.delivery), 100)}%` }} />
              </div>
              <p className="text-micro mt-1" style={{ color: 'var(--text-3)' }}>จริง {f(deliveryRevenue)} ({pct(deliveryRevenue, orgTarget.delivery)}%)</p>
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
              <span className="text-xs font-bold px-2 py-0.5 rounded-[8px]" style={{ background: s.color + '22', color: s.color }}>{s.label}</span>
              <span className="text-xs" style={{ color: 'var(--text-3)' }}>{s.count} งาน</span>
            </div>
            <p className="text-lg font-bold mt-1" style={{ color: 'var(--text-1)' }}>{fk(s.revenue)}</p>
            <p className="text-xs mt-1" style={{ color: 'var(--text-3)' }}>
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
      <div className="ds-card">
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
          <div className="ds-card"><EmptyState icon={Users} message="ยังไม่มีข้อมูลทีม" sub="กำหนดหัวหน้าทีมให้พนักงานที่หน้า Users ก่อน" /></div>
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
                          <p className="text-micro mt-1 text-right" style={{ color: item.color }}>{pct(item.val, item.tgt)}%</p>
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

      {/* ══ INDIVIDUAL TAB ════════════════════════════════════
          The three money buckets sales asked to see. Definitions live in
          lib/salesScorecard so a second screen cannot drift from this one. */}
      {mainTab === 'individual' && (() => {
        const settled = settledByJob(allPayments as unknown as ScorecardPayment[])
        // A prospect job has no revenue yet, so ③ falls back to the customer's
        const scopedJobs = allJobs.filter(inScope) as unknown as (ScorecardJob & { customer_id?: string | null })[]
        const jobsFor = (uid: string) =>
          allJobs.filter(j => j.sales_id === uid && inScope(j)) as unknown as ScorecardJob[]

        // Only people who actually hold jobs. The two managers hold none —
        // they run teams — so they belong in the team cards below, not here.
        // role === 'sales' only. Areeruk.y is an admin who happens to hold one
        // job — JOB-1096, the ฿39.18 MB. intragroup contract — and putting that
        // beside real sales figures makes every other number look like noise.
        const holders = teamUsers
          .filter(u => u.role === 'sales' && allJobs.some(j => j.sales_id === u.id))
          .map(u => ({ ...u, card: buildScorecard(jobsFor(u.id), settled, { from: start, to: end }) }))
          .sort((a, b) => b.card.soldValue - a.card.soldValue)

        if (!holders.length) return <EmptyState message="ยังไม่มีข้อมูลเซลล์" sub="ยังไม่มีงานที่ระบุเซลล์ผู้ดูแล" />

        const me = holders.find(h => h.id === selectedSales) ?? holders[0]
        const pipe = pipelineFor(scopedJobs, me.id)
        const waiting = me.card.openValue + me.card.gapValue

        const Tile = ({ label: lb, dot, value, sub, color }: {
          label: string; dot?: string; value: string; sub: React.ReactNode; color?: string
        }) => (
          <div className="ds-card-sm">
            <p className="text-micro uppercase tracking-wider flex items-center gap-1.5" style={{ color: 'var(--text-3)' }}>
              {dot && <i className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ background: dot }} />}
              {lb}
            </p>
            <p className="text-kpi-money font-bold mt-1.5" style={{ color: color || 'var(--text-1)' }}>{value}</p>
            <p className="text-micro mt-1" style={{ color: 'var(--text-3)' }}>{sub}</p>
          </div>
        )
        const Section = ({ title, note, children }: { title: string; note?: string; children: React.ReactNode }) => (
          <div className="ds-card">
            <div className="flex items-baseline justify-between gap-3 mb-4">
              <h3 className="font-semibold" style={{ fontSize: 'var(--fs-section)', color: 'var(--text-1)' }}>{title}</h3>
              {note && <span className="text-micro" style={{ color: 'var(--text-3)' }}>{note}</span>}
            </div>
            {children}
          </div>
        )
        const grid = 'grid gap-2.5 grid-cols-[repeat(auto-fill,minmax(min(190px,100%),1fr))]'

        // Team roll-up: a manager's numbers are their members', summed.
        const managerIds = [...new Set(teamUsers.filter(u => u.manager_id).map(u => u.manager_id!))]
        const teams = managerIds.map(mid => {
          const manager = teamUsers.find(u => u.id === mid)
          const members = teamUsers.filter(u => u.manager_id === mid)
          const memberJobs = allJobs.filter(j => members.some(m => m.id === j.sales_id) && inScope(j)) as unknown as ScorecardJob[]
          const card = buildScorecard(memberJobs, settled, { from: start, to: end })
          const tPipe = members.reduce((acc, m) => acc + pipelineFor(scopedJobs, m.id).value, 0)
          return { manager, members, card, tPipe, mine: members.some(m => m.id === me.id) }
        }).filter(t => t.members.length > 0)

        /* Three columns, not two. The amount and its "N งาน" used to share one
           right-aligned box, so every row's ฿ figure ended at a different x —
           the longer the note, the further left the money sat. The note now has
           a reserved column of its own (wide enough for "113 งาน"), which every
           row keeps whether it has a note or not, so the amounts line up. */
        const TeamRow = ({ label: lb, value, note, color, strong, last }: {
          label: string; value: string; note?: string; color?: string
          strong?: boolean; last?: boolean
        }) => (
          <div className="grid items-baseline gap-2 py-1.5"
            style={{
              gridTemplateColumns: '1fr auto 52px',
              borderBottom: last ? 'none' : '1px solid var(--divider)',
            }}>
            <span className="text-caption" style={{ color: strong ? 'var(--text-1)' : 'var(--text-2)', fontWeight: strong ? 600 : 400 }}>{lb}</span>
            <span className="text-caption font-bold tabular-nums text-right" style={{ color: color || 'var(--text-1)' }}>{value}</span>
            <span className="text-micro" style={{ color: 'var(--text-3)' }}>{note || ''}</span>
          </div>
        )

        return (
          <div className="space-y-4">
            {/* Who */}
            <div className="flex flex-wrap gap-2">
              {holders.map(h => {
                const on = h.id === me.id
                return (
                  <button key={h.id} onClick={() => setSelectedSales(h.id)}
                    className="flex items-center gap-2 rounded-full pl-1 pr-3 py-1 text-xs font-semibold transition-colors"
                    style={{
                      background: on ? 'color-mix(in srgb, var(--accent) 12%, var(--card-bg))' : 'var(--card-bg)',
                      border: `1px solid ${on ? 'var(--accent)' : 'var(--card-border)'}`,
                      color: on ? 'var(--text-1)' : 'var(--text-2)',
                    }}>
                    <span className="w-6 h-6 rounded-full grid place-items-center text-micro font-bold text-white"
                      style={{ background: 'var(--accent)' }}>{h.name?.[0] ?? '?'}</span>
                    {h.name}
                  </button>
                )
              })}
            </div>

            {/* ── การเงิน ── */}
            <Section title="การเงิน — เงินที่รออยู่" note={filterWorkType === NO_IG ? 'ภาพ ณ ปัจจุบัน · ไม่รวมงานในเครือ' : 'ภาพ ณ ปัจจุบัน · รวมงานในเครือ'}>
              <div className={grid}>
                <Tile label="เก็บเงินมาแล้ว" dot="var(--accent-green)" color="var(--accent-green)"
                  value={fk(me.card.collected)} sub={f(me.card.collected)} />
                <Tile label="① เปิดงานแล้ว ยังเก็บไม่ครบ" dot="var(--accent-orange)" color="var(--accent-orange)"
                  value={fk(me.card.openValue)} sub={`${me.card.openN} งานที่เปิดแล้ว`} />
                <Tile label="② โอกาสเก็บเพิ่มจากยอดจอง" dot="var(--accent)" color="var(--accent)"
                  value={fk(me.card.gapValue)} sub={`${me.card.gapN} งานจอง · เก็บถึง 50% แล้วเลื่อนเข้า My Deals`} />
                <Tile label="ค้างเกิน 60 วันหลังส่งมอบ" dot="var(--accent-red)"
                  color={me.card.lateValue > 10000 ? 'var(--accent-red)' : 'var(--text-3)'}
                  value={me.card.lateValue > 0 ? f(me.card.lateValue) : '—'}
                  sub={me.card.lateValue > 0 ? `${me.card.lateN} งาน ต้องตามเก็บ` : 'ไม่มีค้างเกินกำหนด'} />
              </div>
              {me.card.collected > 0 && (
                <p className="mt-3 rounded-[8px] p-3 text-caption leading-relaxed"
                  style={{
                    background: 'color-mix(in srgb, var(--accent) 9%, transparent)',
                    border: '1px solid color-mix(in srgb, var(--accent) 28%, transparent)',
                    color: 'var(--text-1)',
                  }}>
                  ถ้าเก็บครบทั้งสองก้อน <b style={{ color: 'var(--accent)' }}>{fk(waiting)}</b> จะเข้ามาเพิ่ม —
                  คิดเป็น <b style={{ color: 'var(--accent)' }}>{Math.round(waiting / me.card.collected * 100)}%</b>
                  {' '}ของที่ {me.name} เก็บมาได้ทั้งหมดแล้ว ({fk(me.card.collected)})
                </p>
              )}
            </Section>

            {/* ── ขาย ── */}
            <Section title="ขาย" note={`นับจากวันที่ขาย · ${label}`}>
              <div className={grid}>
                <Tile label="ยอดขาย" value={fk(me.card.soldValue)} sub={`${me.card.soldN} งาน`} />
                <Tile label="เฉลี่ยต่องาน"
                  value={me.card.soldN ? f(me.card.soldValue / me.card.soldN) : '—'}
                  sub={me.card.soldN ? (me.card.soldValue / me.card.soldN > 200000 ? 'งานใหญ่ ชิ้นน้อย' : 'งานเล็ก ปริมาณมาก') : 'ไม่มีงานในช่วงนี้'} />
                <Tile label="③ Pipeline ที่ยังไม่ปิด"
                  color={pipe.value ? 'var(--text-1)' : 'var(--text-3)'}
                  value={pipe.value ? fk(pipe.value) : '—'}
                  sub={pipe.value ? `${pipe.count} ราย ที่ยังไม่ปิด` : 'ยังไม่ได้ระบุงบ/เจ้าของ — กรอกที่หน้า Prospects'} />
              </div>
            </Section>

            {/* ── ส่งมอบ ── */}
            <Section title="ส่งมอบ" note={`นับจากวันส่งมอบจริง · ${label}`}>
              <div className={grid}>
                <Tile label="ส่งมอบแล้ว" color="var(--accent-blue)"
                  value={fk(me.card.delivValue)} sub={`${me.card.delivN} งาน`} />
                <Tile label="กำลังดำเนินการ" value={`${me.card.wipN} งาน`} sub="เปิดงานแล้ว ยังไม่ส่งมอบ" />
                {/* Not a ratio of the selected period. Prattana.o sold one job
                    in August and delivered 17 older ones, which the old
                    "ขาย → ส่งมอบ" card reported as 1835%. This counts the whole
                    book of work instead, so a quiet sales month cannot distort it. */}
                <Tile label="ส่งมอบแล้ว / งานที่ถืออยู่"
                  value={`${me.card.heldDelivN}/${me.card.heldN} งาน`}
                  sub={me.card.heldN
                    ? `ส่งมอบแล้ว ${Math.round(me.card.heldDelivN / me.card.heldN * 100)}% ของงานทั้งหมดที่ถืออยู่`
                    : 'ยังไม่มีงานในมือ'} />
              </div>
            </Section>

            {/* ── ทีม ── */}
            {teams.length > 0 && (
              <Section title="เทียบเป็นทีม" note="ทีมของคนที่เลือกอยู่จะมีขอบเน้น">
                <div className="grid gap-3 grid-cols-[repeat(auto-fit,minmax(min(280px,100%),1fr))]">
                  {teams.map(t => {
                    const k = t.members.length
                    return (
                      <div key={t.manager?.id} className="rounded-[8px] p-3.5"
                        style={{
                          background: 'var(--panel-bg)',
                          border: `1px solid ${t.mine ? 'var(--accent)' : 'var(--divider)'}`,
                        }}>
                        <div className="flex items-center gap-2.5 mb-4">
                          <span className="w-7 h-7 rounded-full grid place-items-center text-micro font-bold text-white"
                            style={{ background: 'var(--accent)' }}>{t.manager?.name?.[0] ?? '?'}</span>
                          <span>
                            <b className="block" style={{ fontSize: 'var(--fs-card-title)', color: 'var(--text-1)' }}>ทีม {t.manager?.name}</b>
                            <span className="text-micro" style={{ color: 'var(--text-3)' }}>
                              {k} คน · {t.members.map(m => m.name).join(' · ')}
                            </span>
                          </span>
                        </div>
                        <TeamRow label="ยอดขาย" value={fk(t.card.soldValue)} note={`${t.card.soldN} งาน`} />
                        <TeamRow label="ส่งมอบ" value={fk(t.card.delivValue)} note={`${t.card.delivN} งาน`} color="var(--accent-blue)" />
                        <TeamRow label="เก็บเงินมาแล้ว" value={fk(t.card.collected)} color="var(--accent-green)" />
                        <TeamRow label="① เปิดงานแล้ว ยังเก็บไม่ครบ" value={fk(t.card.openValue)} note={`${t.card.openN} งาน`} color="var(--accent-orange)" />
                        <TeamRow label="② โอกาสเก็บเพิ่มจากยอดจอง" value={fk(t.card.gapValue)} note={`${t.card.gapN} งาน`} color="var(--accent)" />
                        <TeamRow label="③ Pipeline ที่ยังไม่ปิด" value={t.tPipe ? fk(t.tPipe) : '—'} color="var(--text-2)" last />
                        {/* The averages go through the same TeamRow, so they sit
                            on the same three columns as the totals above. */}
                        <div className="mt-2 pt-1" style={{ borderTop: '2px solid var(--divider)' }}>
                          <TeamRow label="เฉลี่ยต่อคน — ยอดขาย" strong
                            value={fk(t.card.soldValue / k)} />
                          <TeamRow label="เฉลี่ยต่อคน — เงินที่รออยู่ ①+②" strong last
                            value={fk((t.card.openValue + t.card.gapValue) / k)} color="var(--accent)" />
                        </div>
                      </div>
                    )
                  })}
                </div>
                {/* The "ทีมต่างขนาดกัน" note that used to sit here was written to
                    explain the design in conversation, not to be read on the
                    screen every day. The team header already states the size
                    ("4 คน · …") and the เฉลี่ยต่อคน rows carry the same point
                    without a paragraph. */}
              </Section>
            )}

            {/* ── ตารางรวม ── */}
            <Section title="เทียบทั้งทีม" note="เรียงตามยอดขายในช่วงที่เลือก">
              <div className="tbl-scroll">
                <table className="w-full text-caption tabular-nums tbl-rows">
                  <thead>
                    <tr>
                      {['Sales', 'ยอดขาย', '① เก็บไม่ครบ', '② โอกาสเก็บเพิ่ม', '③ Pipeline', 'ส่งมอบ'].map((h, i) => (
                        <th key={h} className={` text-micro uppercase tracking-wider font-semibold ${i ? 'num num-count' : 'text-left'}`}
                          style={{ color: 'var(--text-3)', borderBottom: '1px solid var(--divider)' }}><span>{h}</span></th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {holders.map(h => {
                      const p = pipelineFor(scopedJobs, h.id)
                      const on = h.id === me.id
                      const td = 'num num-money whitespace-nowrap'
                      const bd = { borderBottom: '1px solid var(--divider)' }
                      return (
                        <tr key={h.id} onClick={() => setSelectedSales(h.id)} className="cursor-pointer"
                          style={{ background: on ? 'var(--hover-bg)' : 'transparent' }}>
                          <td className=" whitespace-nowrap"
                            style={{ ...bd, color: 'var(--text-1)', fontWeight: on ? 700 : 400 }}>{h.name}</td>
                          <td className={td} style={bd}>{fk(h.card.soldValue)}</td>
                          <td className={td} style={{ ...bd, color: 'var(--accent-orange)' }}>{fk(h.card.openValue)}</td>
                          <td className={td} style={{ ...bd, color: 'var(--accent)' }}>{fk(h.card.gapValue)}</td>
                          <td className={td} style={{ ...bd, color: p.value ? 'var(--text-1)' : 'var(--text-3)' }}>{p.value ? fk(p.value) : '—'}</td>
                          <td className={td} style={{ ...bd, color: 'var(--accent-blue)' }}>{fk(h.card.delivValue)}</td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            </Section>
          </div>
        )
      })()}

    </div>
  )
}
