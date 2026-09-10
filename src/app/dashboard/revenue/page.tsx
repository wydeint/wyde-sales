'use client'

import React, { useEffect, useState, useMemo, useCallback } from 'react'
import { downloadCsv } from '@/lib/csv'
import { createClient } from '@/lib/supabase/client'
import { TrendingUp, ChevronLeft, ChevronRight, BarChart3, Users, Building2, List, ChevronDown, FileDown, ShoppingCart } from 'lucide-react'
import { PageSpinner, PageError } from '@/components/ui/StateUI'
import PageHeader from '@/components/ui/PageHeader'
import { WORKING_STATUSES } from '@/lib/status'
import StatusChip from '@/components/ui/StatusChip'
import FilterBar from '@/components/ui/FilterBar'
import PeriodPicker from '@/components/ui/PeriodPicker'
import { getPeriodBounds, UNIT_LABELS as PERIOD_LABELS, type PeriodUnit as Period } from '@/lib/period'
import { baht, bahtShort } from '@/lib/money'
import { compareRoom } from '@/lib/utils'

// ─────────────────────────────────────────
// Types & helpers
// ─────────────────────────────────────────
type Job = {
  id: string
  project_id: string
  room_no: string
  work_type: string
  customer_type: string
  package_type: string
  revenue_ex_vat: number
  revenue_inc_vat: number | null
  order_date: string | null
  work_start_date: string | null
  actual_deliver_date: string | null
  delivery_lot: string
  accounting_status: string
  working_status: string
  sales_id: string
  commission_amount: number
  notes: string
  customer_name?: string
  po_no?: string | null
  so_no?: string | null
  voucher?: string | null
  projects?: { name: string }
  sales?: { name: string }
}

type MainTab = 'sales' | 'deliver'
type ViewTab = 'summary' | 'sales' | 'project' | 'list'

type Tier = { revenue_min: number; revenue_max: number | null; rate: number; tier_name?: string }

function calcTier(revenue: number, tiers: Tier[]): { rate: number; amount: number } {
  const sorted = [...tiers].sort((a, b) => a.revenue_min - b.revenue_min)
  for (const t of sorted) {
    if (revenue >= t.revenue_min && (t.revenue_max === null || revenue <= t.revenue_max)) {
      return { rate: t.rate, amount: Math.round(revenue * t.rate) }
    }
  }
  return { rate: 0, amount: 0 }
}

function getJobCommission(j: Job, tiers: Tier[]) {
  if (j.commission_amount !== null && j.commission_amount !== undefined && j.commission_amount > 0) return j.commission_amount
  return calcTier(j.revenue_ex_vat || 0, tiers).amount
}

const jobRev = (j: { revenue_inc_vat: number | null; revenue_ex_vat: number }) => j.revenue_inc_vat ?? j.revenue_ex_vat ?? 0
const f = baht
const fk = bahtShort

function getJobDate(j: Job, mode: MainTab): string | null {
  if (mode === 'deliver') return j.actual_deliver_date
  return j.order_date || j.work_start_date
}

function getWeekRange(date: Date): { start: Date; end: Date; label: string } {
  const d = new Date(date)
  const day = d.getDay() === 0 ? 7 : d.getDay()
  const start = new Date(d); start.setDate(d.getDate() - day + 1); start.setHours(0, 0, 0, 0)
  const end = new Date(start); end.setDate(start.getDate() + 6); end.setHours(23, 59, 59, 999)
  const fmt = (dt: Date) => dt.toLocaleDateString('th-TH', { day: 'numeric', month: 'short' })
  return { start, end, label: `${fmt(start)} – ${fmt(end)}` }
}

/* Buddhist Era for display, matching the month label the th-TH locale produces
   a few lines below — quarter and year were printing the Gregorian year, so one
   page showed both 2569 and 2026 depending on the period picked. */
const beYear = (y: number) => y + 543
/* Bounds come from src/lib/period.ts now — this file had the third private copy.
   It compares Date objects, so widen the shared ISO strings to cover the day. */
function periodDates(period: Period, offset: number): { start: Date; end: Date; label: string } {
  const b = getPeriodBounds(period, offset)
  return { start: new Date(b.start + 'T00:00:00'), end: new Date(b.end + 'T23:59:59'), label: b.label }
}

function inRange(dateStr: string | null, start: Date, end: Date) {
  if (!dateStr) return false
  const d = new Date(dateStr)
  return d >= start && d <= end
}

const STATUS_COLORS: Record<string, string> = {
  'Reserved': 'var(--accent-amber)', 'Backlog': 'var(--accent-blue)', 'FC': 'var(--accent-green)', 'Backlog พต': 'var(--accent-purple)',
  'New Sale 2025': 'var(--accent-amber)', 'New Sale 2026': 'var(--accent-orange)',
}

// Derived from the shared vocabulary — this map used to colour จอง amber and
// รอส่งมอบ purple, disagreeing with every other page, and carried a
// 'กำลังดำเนินการ' key that does not occur in the data.
const WORKING_STATUS_COLORS: Record<string, { bg: string; color: string }> = Object.fromEntries(
  WORKING_STATUSES.map(s => [s.value, { bg: `color-mix(in srgb, ${s.color} 15%, transparent)`, color: s.color }])
)

// ─────────────────────────────────────────
// Main page
// ─────────────────────────────────────────
export default function RevenuePage() {
  const supabase = createClient()
  const [allDeliverJobs, setAllDeliverJobs] = useState<Job[]>([])
  const [allSalesJobs, setAllSalesJobs] = useState<Job[]>([])
  const [tiers, setTiers] = useState<Tier[]>([])
  const [targets, setTargets] = useState<{ user_id: string; year: number; month: number; target_revenue: number }[]>([])
  const [loading, setLoading] = useState(true)
  const [fetchError, setFetchError] = useState('')

  const [mainTab, setMainTab] = useState<MainTab>('sales')
  const [period, setPeriod] = useState<Period>('month')
  const [offset, setOffset] = useState(0)
  const [view, setView] = useState<ViewTab>('summary')
  const [filterSales, setFilterSales] = useState('')
  const [filterCustType, setFilterCustType] = useState('')
  const [filterWorkType, setFilterWorkType] = useState('')
  const [expandedProjects, setExpandedProjects] = useState<Set<string>>(new Set())
  const [expandedSales, setExpandedSales] = useState<Set<string>>(new Set())
  const [salesUsers, setSalesUsers] = useState<{ id: string; name: string }[]>([])
  const [referrals, setReferrals] = useState<{ job_id: string; referrer_name: string; referral_amount: number }[]>([])
  /** ต้นทุนรวมต่อห้อง — คำนวณสดจาก job_cost_items (jobs.cost ถูกลบในเฟส 5) */
  const [costByJob, setCostByJob] = useState<Map<string, number>>(new Map())
  const [voucherByJob, setVoucherByJob] = useState<Map<string, number>>(new Map())
  const costOf = useCallback((id: string) => costByJob.get(id) ?? 0, [costByJob])

  useEffect(() => {
    async function load() {
      setLoading(true); setFetchError('')
      const fields = 'id,project_id,room_no,customer_name,work_type,customer_type,package_type,revenue_ex_vat,revenue_inc_vat,order_date,work_start_date,actual_deliver_date,delivery_lot,accounting_status,working_status,sales_id,commission_amount,notes,po_no,so_no,voucher,projects(name),sales:users!jobs_sales_id_fkey(name)'
      const [{ data: deliverData, error: e1 }, { data: salesData, error: e2 }, { data: targetsData }, { data: tierData }, { data: usersData }, { data: refData }, { data: costItems }, { data: payRows }] = await Promise.all([
        supabase.from('jobs').select(fields).eq('working_status', 'ส่งมอบแล้ว').not('actual_deliver_date', 'is', null).order('actual_deliver_date', { ascending: false }),
        supabase.from('jobs').select(fields).or('working_status.neq.ยกเลิก,working_status.is.null').order('order_date', { ascending: false }),
        supabase.from('sales_targets').select('user_id,year,month,target_revenue'),
        supabase.from('commission_settings').select('revenue_min,revenue_max,rate,tier_name').eq('active', true),
        supabase.from('users').select('id, name').eq('active', true).in('dept', ['Sales Executive', 'Administration']).order('name'),
        supabase.from('commission_referrals').select('job_id,referrer_name,referral_amount').order('created_at'),
        supabase.from('job_cost_items').select('job_id, est_cost, act_cost'),
        supabase.from('payments').select('job_id, voucher_amount'),
      ])
      if (e1 || e2) { setFetchError((e1 ?? e2)!.message); setLoading(false); return }

      /* ยอดจ้างจริงก่อน ยังไม่จ้างจึงใช้ประมาณการ — กติกาเดียวกับหน้า Cost & GP% */
      const cm = new Map<string, number>()
      for (const it of (costItems ?? []) as { job_id: string; est_cost: number; act_cost: number }[]) {
        const v = Number(it.act_cost || 0) > 0 ? Number(it.act_cost) : Number(it.est_cost || 0)
        cm.set(it.job_id, (cm.get(it.job_id) ?? 0) + v)
      }
      setCostByJob(cm)
      /* Voucher มาจาก `payments.voucher_amount` เท่านั้น — คำสั่งเจ้าของ 2026-09-08
         `jobs.voucher` เป็นช่องเก่าที่กรอกแยกกันคนละทาง ตัวเลขสองฝั่งไม่ตรงกัน
         (39 ห้อง ฿1,515,000 กับ 32 ห้อง ฿932,697) ตัวที่ผูกกับงวดที่รับเงินจริงคือ
         ฝั่ง payments ดู lib/voucher.ts */
      const vm = new Map<string, number>()
      for (const p2 of (payRows ?? []) as { job_id: string; voucher_amount: number | null }[]) {
        vm.set(p2.job_id, (vm.get(p2.job_id) ?? 0) + Number(p2.voucher_amount || 0))
      }
      setVoucherByJob(vm)
      setAllDeliverJobs((deliverData as unknown as Job[]) || [])
      setAllSalesJobs((salesData as unknown as Job[]) || [])
      setTargets(targetsData || [])
      setTiers((tierData || []) as Tier[])
      setSalesUsers((usersData || []) as { id: string; name: string }[])
      setReferrals((refData || []) as { job_id: string; referrer_name: string; referral_amount: number }[])
      setLoading(false)
    }
    load()
  }, [])

  const allJobs = mainTab === 'deliver' ? allDeliverJobs : allSalesJobs
  const { start, end, label } = periodDates(period, offset)

  const workTypes = useMemo(() => {
    const s = new Set(allJobs.map(j => j.work_type).filter(Boolean))
    return Array.from(s).sort()
  }, [allJobs])

  const periodJobs = useMemo(() =>
    allJobs.filter(j =>
      inRange(getJobDate(j, mainTab), start, end) &&
      (!filterSales || j.sales_id === filterSales) &&
      (!filterCustType || j.customer_type === filterCustType) &&
      (!filterWorkType || j.work_type === filterWorkType)
    ),
    [allJobs, start, end, filterSales, filterCustType, filterWorkType, mainTab]
  )

  const prevBounds = periodDates(period, offset - 1)
  const prevJobs = useMemo(() =>
    allJobs.filter(j => inRange(getJobDate(j, mainTab), prevBounds.start, prevBounds.end)),
    [allJobs, prevBounds, mainTab]
  )

  const totalRevenue = periodJobs.reduce((s, j) => s + jobRev(j), 0)
  const totalRevenueEx = periodJobs.reduce((s, j) => s + (j.revenue_ex_vat || 0), 0)
  const totalCost = periodJobs.reduce((s, j) => s + costOf(j.id), 0)
  const totalProfit = totalRevenueEx - totalCost
  const totalCommission = periodJobs.reduce((s, j) => s + getJobCommission(j, tiers), 0)
  const prevRevenue = prevJobs.reduce((s, j) => s + jobRev(j), 0)
  const growthPct = prevRevenue > 0 ? ((totalRevenue - prevRevenue) / prevRevenue * 100).toFixed(2) : null
  const unitCount = periodJobs.length

  const bySales = useMemo(() => {
    const map = new Map<string, { name: string; revenue: number; revenueEx: number; units: number; commission: number }>()
    periodJobs.forEach(j => {
      const name = (j.sales as any)?.name || 'ไม่ระบุ'
      const key = j.sales_id || name
      const cur = map.get(key) || { name, revenue: 0, revenueEx: 0, units: 0, commission: 0 }
      map.set(key, { name, revenue: cur.revenue + jobRev(j), revenueEx: cur.revenueEx + (j.revenue_ex_vat || 0), units: cur.units + 1, commission: cur.commission + getJobCommission(j, tiers) })
    })
    return [...map.values()].sort((a, b) => b.revenue - a.revenue)
  }, [periodJobs, tiers])

  const byProject = useMemo(() => {
    const map = new Map<string, { name: string; revenue: number; units: number; jobs: Job[] }>()
    periodJobs.forEach(j => {
      const name = (j.projects as any)?.name || j.project_id || 'ไม่ระบุ'
      const cur = map.get(name) || { name, revenue: 0, units: 0, jobs: [] }
      map.set(name, { name, revenue: cur.revenue + jobRev(j), units: cur.units + 1, jobs: [...cur.jobs, j] })
    })
    return [...map.values()].sort((a, b) => b.revenue - a.revenue)
  }, [periodJobs])

  const byStatus = useMemo(() => {
    const map = new Map<string, number>()
    periodJobs.forEach(j => {
      const s = mainTab === 'deliver' ? (j.accounting_status || 'Reserved') : (j.working_status || 'ไม่ระบุ')
      map.set(s, (map.get(s) || 0) + jobRev(j))
    })
    return [...map.entries()].map(([status, revenue]) => ({ status, revenue })).sort((a, b) => b.revenue - a.revenue)
  }, [periodJobs, mainTab])

  const salesMax = Math.max(...bySales.map(s => s.revenue), 1)

  const monthlyTrend = useMemo(() => {
    if (period !== 'year') return []
    const y = start.getFullYear()
    return Array.from({ length: 12 }, (_, m) => {
      const mStart = new Date(y, m, 1)
      const mEnd = new Date(y, m + 1, 0, 23, 59, 59)
      const rev = allJobs.filter(j => inRange(getJobDate(j, mainTab), mStart, mEnd)).reduce((s, j) => s + jobRev(j), 0)
      return { month: m + 1, label: mStart.toLocaleDateString('th-TH', { month: 'short' }), revenue: rev }
    })
  }, [allJobs, period, start, mainTab])

  const trendMax = Math.max(...monthlyTrend.map(t => t.revenue), 1)

  function exportCSV() {
    const isSalesMode = mainTab === 'sales'
    const headers = [
      'ลูกค้า', 'ประเภทลูกค้า', 'โครงการ', 'ห้อง', 'Job ID',
      'ประเภทงาน', 'แพ็กเกจ',
      isSalesMode ? 'วันจอง / เริ่มงาน' : 'วันส่งมอบ (จริง)',
      'สถานะงาน',
      'Revenue (exc.VAT)', 'Revenue (inc.VAT)',
      ...(mainTab === 'deliver' ? ['Cost', 'GP%'] : []),
      'เกณฑ์ Commission (Tier)', 'Commission Rate%', 'Commission',
      'Sales', 'PO No.', 'SO No.', 'Voucher',
      'ผู้แนะนำ (Referral)', 'ค่าแนะนำรวม',
    ]
    const fmt = (d: string | null) => d ? new Date(d).toLocaleDateString('th-TH', { day: '2-digit', month: 'short', year: '2-digit' }) : ''
    const rows = periodJobs.map(j => {
      const project = (j.projects as any)?.name || ''
      const sales = (j.sales as any)?.name || ''
      const gp = (j.revenue_ex_vat || 0) > 0 ? ((((j.revenue_ex_vat || 0) - costOf(j.id)) / j.revenue_ex_vat) * 100).toFixed(2) : ''
      const jobRefs = referrals.filter(r => r.job_id === j.id)
      const refNames = jobRefs.map(r => `${r.referrer_name} (${Math.round(r.referral_amount).toLocaleString()})`).join(', ')
      const refTotal = jobRefs.reduce((s, r) => s + r.referral_amount, 0)
      const { rate: tierRate } = calcTier(j.revenue_ex_vat || 0, tiers)
      const sorted = [...tiers].sort((a, b) => a.revenue_min - b.revenue_min)
      const matchedTier = sorted.find(t => (j.revenue_ex_vat || 0) >= t.revenue_min && (t.revenue_max === null || (j.revenue_ex_vat || 0) <= t.revenue_max))
      const tierName = matchedTier?.tier_name || (tierRate ? `${(tierRate * 100).toFixed(2)}%` : '—')
      const dateCol = isSalesMode ? fmt(j.order_date || j.work_start_date) : fmt(j.actual_deliver_date)
      return [
        j.customer_name || '', j.customer_type || '', project, j.room_no || '', j.id,
        j.work_type || '', j.package_type || '', dateCol, j.working_status || '',
        j.revenue_ex_vat || 0, j.revenue_inc_vat || 0,
        ...(mainTab === 'deliver' ? [costOf(j.id), gp] : []),
        tierName, tierRate ? (tierRate * 100).toFixed(2) : '', getJobCommission(j, tiers),
        sales, j.po_no || '', j.so_no || '', voucherByJob.get(j.id) || '',
        refNames, refTotal || '',
      ]
    })
    downloadCsv(`${mainTab === 'sales' ? 'sales' : 'revenue'}-${label.replace(/\s/g, '-')}`,
      [headers, ...rows])
  }

  if (loading) return <PageSpinner />
  if (fetchError) return <PageError message={fetchError} onRetry={() => { setLoading(true); setFetchError('') }} />

  return (
    <div className="page-content space-y-5">

      {/* Header */}
      <PageHeader
        title="Revenue"
        // The delivery subtitle read "working_status = ส่งมอบแล้ว" — a column name
        // and a code comparison shown to the reader.
        subtitle={mainTab === 'sales' ? 'ยอดขาย — นับตามวันจอง / เริ่มงาน' : 'ยอดส่งมอบ — นับเมื่องานส่งมอบแล้ว'}
        className=""
        actions={
          <button onClick={exportCSV}
            className="flex items-center gap-1.5 px-3 py-2 rounded-[8px] text-xs font-semibold"
            style={{ background: 'var(--glass-bg)', border: '1px solid var(--glass-border)', color: 'var(--text-2)' }}>
            <FileDown size={13} /> Export CSV
          </button>
        }
      />

      {/* Main tab: ยอดขาย / ยอดส่งมอบ */}
      <div className="tab-group w-fit">
        {([
          ['sales', ShoppingCart, 'ยอดขาย'],
          ['deliver', TrendingUp, 'ยอดส่งมอบ'],
        ] as const).map(([key, Icon, lbl]) => (
          <button key={key} onClick={() => { setMainTab(key); setExpandedProjects(new Set()); setExpandedSales(new Set()) }}
            className={`tab-btn ${mainTab === key ? 'active' : ''}`}>
            <Icon size={14} />{lbl}
          </button>
        ))}
      </div>

      {/* View tabs */}
      <div className="tab-group w-fit">
        {([['summary', BarChart3, 'สรุป'], ['sales', Users, 'รายคน'], ['project', Building2, 'รายโครงการ'], ['list', List, 'รายงาน']] as const).map(([v, Icon, lbl]) => (
          <button key={v} onClick={() => setView(v)}
            className={`tab-btn ${view === v ? 'active' : ''}`}>
            <Icon size={14} />{lbl}
          </button>
        ))}
      </div>

      {/* Filters + Period — one card, like every list page */}
      <FilterBar className="">
        <div className="w-full flex items-center gap-3 flex-wrap">
          <select value={filterCustType} onChange={e => setFilterCustType(e.target.value)} className="field-input" style={{ width: 'auto' }}>
            <option value="">B2C + B2B</option>
            <option value="B2C">B2C</option>
            <option value="B2B">B2B</option>
          </select>
          <select value={filterWorkType} onChange={e => setFilterWorkType(e.target.value)} className="field-input" style={{ width: 'auto' }}>
            <option value="">ทุกประเภทงาน</option>
            {workTypes.map(w => <option key={w} value={w}>{w}</option>)}
          </select>
          <select value={filterSales} onChange={e => setFilterSales(e.target.value)} className="field-input" style={{ width: 'auto' }}>
            <option value="">ทุก Sales</option>
            {salesUsers.map(u => <option key={u.id} value={u.id}>{u.name}</option>)}
          </select>
          <PeriodPicker unit={period} setUnit={setPeriod} offset={offset} setOffset={setOffset}
            units={['today','week','month','quarter','year']} />
        </div>
      </FilterBar>

      {/* KPI Cards */}
      {(() => {
        const kpis = mainTab === 'sales' ? [
          { label: 'จำนวนงาน', value: unitCount + ' งาน', sub: `เฉลี่ย ${unitCount > 0 ? fk(totalRevenue / unitCount) : '—'}/งาน`, color: 'var(--accent-blue)' },
          { label: 'ยอดขาย (inc.VAT)', value: fk(totalRevenue), sub: growthPct ? `${Number(growthPct) > 0 ? '+' : ''}${growthPct}% vs ${PERIOD_LABELS[period]}ก่อน` : `vs ก่อนหน้า ${fk(prevRevenue)}`, color: 'var(--accent-orange)' },
          { label: 'ยอดขาย (exc.VAT)', value: fk(totalRevenueEx), sub: totalRevenue > 0 ? `VAT ${fk(totalRevenue - totalRevenueEx)}` : '—', color: 'var(--accent-amber)' },
          { label: 'Commission (คาดการณ์)', value: fk(totalCommission), sub: totalRevenueEx > 0 ? (totalCommission / totalRevenueEx * 100).toFixed(2) + '% ของ exc.VAT' : '—', color: 'var(--accent-purple)' },
        ] : [
          { label: 'จำนวนห้อง/งาน', value: unitCount + ' งาน', sub: `เฉลี่ย ${unitCount > 0 ? fk(totalRevenue / unitCount) : '—'}/งาน`, color: 'var(--accent-blue)' },
          { label: 'Revenue ส่งมอบ (inc.VAT)', value: fk(totalRevenue), sub: growthPct ? `${Number(growthPct) > 0 ? '+' : ''}${growthPct}% vs ${PERIOD_LABELS[period]}ก่อน` : `vs ก่อนหน้า ${fk(prevRevenue)}`, color: 'var(--accent-green)' },
          { label: 'Revenue (exc.VAT)', value: fk(totalRevenueEx), sub: totalRevenue > 0 ? `VAT ${fk(totalRevenue - totalRevenueEx)}` : '—', color: 'var(--accent-amber)' },
          { label: 'Profit (GP)', value: fk(totalProfit), sub: totalRevenueEx > 0 ? 'GP ' + (totalProfit / totalRevenueEx * 100).toFixed(2) + '%' : '—', color: totalProfit >= 0 ? 'var(--accent-green)' : 'var(--accent-red)' },
        ]
        return (
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            {kpis.map(k => (
              <div key={k.label} className="ds-card">
                <p className="text-card-title mb-1" style={{ color: 'var(--text-3)' }}>{k.label}</p>
                <p className="text-kpi-number" style={{ color: k.color }}>{k.value}</p>
                <p className="text-xs mt-1" style={{ color: 'var(--text-3)' }}>{k.sub}</p>
              </div>
            ))}
          </div>
        )
      })()}

      {/* Year trend chart */}
      {period === 'year' && monthlyTrend.length > 0 && (
        <div className="ds-card">
          <div className="flex items-center gap-2 mb-4">
            <BarChart3 size={14} style={{ color: 'var(--accent)' }} />
            <h2 className="text-section-title" style={{ color: 'var(--text-1)' }}>
              {mainTab === 'sales' ? 'ยอดขายรายเดือน' : 'รายได้รายเดือน'} {start.getFullYear()}
            </h2>
          </div>
          <div className="flex items-end gap-1.5 h-32">
            {monthlyTrend.map(m => (
              <div key={m.month} className="flex-1 flex flex-col items-center gap-1">
                <div className="w-full rounded-t-lg relative group" style={{
                  height: m.revenue > 0 ? Math.max(m.revenue / trendMax * 112, 4) + 'px' : '4px',
                  background: m.revenue > 0 ? 'linear-gradient(180deg,var(--accent),color-mix(in srgb, var(--accent) 40%, transparent))' : 'var(--divider)',
                  minHeight: '4px',
                }}>
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

      {/* ── Summary view ── */}
      {view === 'summary' && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
          <div className="ds-card">
            <h2 className="text-section-title mb-4 flex items-center gap-2" style={{ color: 'var(--text-1)' }}>
              <Users size={13} style={{ color: 'var(--accent-blue)' }} />
              {mainTab === 'sales' ? 'ยอดขาย by Sales' : 'Revenue by Sales'}
            </h2>
            {bySales.length === 0 ? (
              <p className="text-sm text-center py-6" style={{ color: 'var(--text-3)' }}>ยังไม่มีข้อมูล</p>
            ) : bySales.map((s, i) => (
              <div key={s.name} className="mb-4">
                <div className="flex items-center justify-between mb-1">
                  <div className="flex items-center gap-2">
                    <span className="text-xs w-4" style={{ color: 'var(--text-3)' }}>{i + 1}.</span>
                    <span className="text-sm font-semibold" style={{ color: 'var(--text-1)' }}>{s.name}</span>
                    <span className="text-xs" style={{ color: 'var(--text-3)' }}>{s.units} งาน</span>
                  </div>
                  <span className="text-sm font-bold" style={{ color: mainTab === 'sales' ? 'var(--accent-orange)' : 'var(--accent-green)' }}>{fk(s.revenue)}</span>
                </div>
                <div className="h-2 rounded-full overflow-hidden" style={{ background: 'var(--divider)' }}>
                  <div className="h-full rounded-full" style={{ width: (s.revenue / salesMax * 100) + '%', background: 'var(--chart-1)' }} />
                </div>
              </div>
            ))}
          </div>

          <div className="ds-card">
            <h2 className="text-section-title mb-4" style={{ color: 'var(--text-1)' }}>
              {mainTab === 'sales' ? 'สถานะงาน' : 'ประเภทงาน (Accounting Status)'}
            </h2>
            {byStatus.length === 0 ? (
              <p className="text-sm text-center py-6" style={{ color: 'var(--text-3)' }}>ยังไม่มีข้อมูล</p>
            ) : byStatus.map(s => {
              const wsCfg = WORKING_STATUS_COLORS[s.status]
              return (
                <div key={s.status} className="flex items-center gap-3 mb-4">
                  <span className="w-3 h-3 rounded-full flex-shrink-0"
                    style={{ background: wsCfg?.color || STATUS_COLORS[s.status] || 'var(--text-3)' }} />
                  <span className="text-sm flex-1" style={{ color: 'var(--text-2)' }}>{s.status}</span>
                  <span className="text-sm font-bold" style={{ color: 'var(--text-1)' }}>{fk(s.revenue)}</span>
                  <span className="text-xs" style={{ color: 'var(--text-3)' }}>
                    {totalRevenue > 0 ? (s.revenue / totalRevenue * 100).toFixed(0) : 0}%
                  </span>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* ── Sales view ── */}
      {view === 'sales' && (
        <div className="ds-card tbl-scroll">
          <table className="w-full text-sm tbl-rows">
            <thead>
              <tr style={{ borderBottom: '1px solid var(--divider)' }}>
                {['Sales', 'จำนวนงาน', 'Revenue (inc.VAT)', ...(mainTab === 'deliver' ? ['Cost', 'Profit (Ex-Cost)', 'GP%'] : [])].map(h => (
                  <th key={h} className="text-left text-xs font-semibold" style={{ color: 'var(--text-3)' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {bySales.length === 0 ? (
                <tr><td colSpan={6} className="text-center text-sm" style={{ color: 'var(--text-3)' }}>ยังไม่มีข้อมูล</td></tr>
              ) : bySales.map(s => {
                const salesJobs = periodJobs.filter(j => (j.sales as any)?.name === s.name)
                const cost = salesJobs.reduce((sum, j) => sum + costOf(j.id), 0)
                const profit = s.revenueEx - cost
                const gp = s.revenueEx > 0 ? (profit / s.revenueEx * 100).toFixed(2) : '—'
                const expanded = expandedSales.has(s.name)
                return (
                  <React.Fragment key={s.name}>
                    <tr style={{ borderBottom: expanded ? 'none' : '1px solid var(--divider)', cursor: 'pointer' }}
                      onClick={() => { const n = new Set(expandedSales); n.has(s.name) ? n.delete(s.name) : n.add(s.name); setExpandedSales(n) }}>
                      <td className="px-4 py-3 font-semibold" style={{ color: 'var(--text-1)' }}>
                        <div className="flex items-center gap-2">
                          <ChevronDown size={12} style={{ color: 'var(--text-3)', transform: expanded ? 'rotate(180deg)' : 'none', transition: 'transform 0.15s' }} />
                          <div className="w-6 h-6 rounded-full flex items-center justify-center text-xs text-white font-bold"
                            style={{ background: 'linear-gradient(135deg, var(--accent), var(--accent-purple))' }}>
                            {s.name[0]}
                          </div>
                          {s.name}
                        </div>
                      </td>
                      <td className=" text-center" style={{ color: 'var(--text-2)' }}>{s.units}</td>
                      <td className=" font-bold" style={{ color: mainTab === 'sales' ? 'var(--accent-orange)' : 'var(--accent-green)' }}>{f(s.revenue)}</td>
                      {mainTab === 'deliver' && <>
                        <td className="" style={{ color: 'var(--accent-red)' }}>{cost ? f(cost) : '—'}</td>
                        <td className="" style={{ color: profit >= 0 ? 'var(--accent-green)' : 'var(--accent-red)' }}>{cost ? f(profit) : '—'}</td>
                        <td className="" style={{ color: 'var(--text-2)' }}>{gp}{gp !== '—' ? '%' : ''}</td>
                      </>}
                    </tr>
                    {expanded && (
                      <tr style={{ borderBottom: '1px solid var(--divider)' }}>
                        <td colSpan={mainTab === 'deliver' ? 6 : 3} className="px-4 pb-3 pt-0">
                          <div className="rounded-[8px] overflow-hidden" style={{ background: 'var(--active-bg)', border: '1px solid var(--divider)' }}>
                            <table className="w-full text-xs tbl-rows">
                              <thead>
                                <tr style={{ borderBottom: '1px solid var(--divider)' }}>
                                  {['ห้อง', 'โครงการ', 'ลูกค้า', mainTab === 'sales' ? 'วันจอง' : 'วันส่งมอบ', 'ประเภทงาน',
                                    mainTab === 'sales' ? 'สถานะ' : '', 'Revenue (inc.VAT)'].filter(Boolean).map(h => (
                                    <th key={h} className="text-left font-semibold whitespace-nowrap" style={{ color: 'var(--text-3)' }}>{h}</th>
                                  ))}
                                </tr>
                              </thead>
                              <tbody>
                                {salesJobs.map(j => {
                                  const d = mainTab === 'sales' ? (j.order_date || j.work_start_date) : j.actual_deliver_date
                                  return (
                                    <tr key={j.id} style={{ borderBottom: '1px solid var(--divider)' }}>
                                      <td className=" font-semibold" style={{ color: 'var(--accent)' }}>{j.room_no || '—'}</td>
                                      <td className="" style={{ color: 'var(--text-2)' }}>{(j.projects as any)?.name || '—'}</td>
                                      <td className="" style={{ color: 'var(--text-1)' }}>{j.customer_name || '—'}</td>
                                      <td className=" whitespace-nowrap" style={{ color: 'var(--text-3)' }}>{d?.slice(0, 10) || '—'}</td>
                                      <td className="" style={{ color: 'var(--text-2)' }}>{j.work_type || '—'}</td>
                                      {mainTab === 'sales' && (
                                        <td className="px-3 py-2">
                                          <StatusChip kind="working" status={j.working_status} variant="outline" />
                                        </td>
                                      )}
                                      <td className=" font-bold" style={{ color: mainTab === 'sales' ? 'var(--accent-orange)' : 'var(--accent-green)' }}>{f(jobRev(j))}</td>
                                    </tr>
                                  )
                                })}
                              </tbody>
                            </table>
                          </div>
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                )
              })}
              <tr style={{ borderTop: '2px solid var(--accent)', background: 'var(--active-bg)' }}>
                <td className=" font-bold" style={{ color: 'var(--text-1)' }}>รวมทั้งหมด</td>
                <td className=" text-center font-bold" style={{ color: 'var(--text-1)' }}>{unitCount}</td>
                <td className=" font-bold" style={{ color: mainTab === 'sales' ? 'var(--accent-orange)' : 'var(--accent-green)' }}>{f(totalRevenue)}</td>
                {mainTab === 'deliver' && <>
                  <td className=" font-bold" style={{ color: 'var(--accent-red)' }}>{f(totalCost)}</td>
                  <td className=" font-bold" style={{ color: totalProfit >= 0 ? 'var(--accent-green)' : 'var(--accent-red)' }}>{f(totalProfit)}</td>
                  <td className=" font-bold" style={{ color: 'var(--text-2)' }}>
                    {totalRevenueEx > 0 ? (totalProfit / totalRevenueEx * 100).toFixed(2) + '%' : '—'}
                  </td>
                </>}
              </tr>
            </tbody>
          </table>
        </div>
      )}

      {/* ── Project view ── */}
      {view === 'project' && (
        <div className="ds-card overflow-hidden">
          <div className="flex items-center justify-between px-5 py-4" style={{ borderBottom: '1px solid var(--divider)' }}>
            <div className="flex items-center gap-2">
              <Building2 size={14} style={{ color: 'var(--accent-orange)' }} />
              <h2 className="text-section-title" style={{ color: 'var(--text-1)' }}>รายโครงการ</h2>
              <span className="text-xs" style={{ color: 'var(--text-3)' }}>{byProject.length} โครงการ · {periodJobs.length} งาน</span>
            </div>
            <button className="text-xs px-2 py-1 rounded-[8px]" style={{ color: 'var(--accent)', background: 'var(--hover-bg)' }}
              onClick={() => {
                const allExp = byProject.every(p => expandedProjects.has(p.name))
                setExpandedProjects(allExp ? new Set() : new Set(byProject.map(p => p.name)))
              }}>
              {byProject.every(p => expandedProjects.has(p.name)) ? 'ย่อทั้งหมด' : 'ขยายทั้งหมด'}
            </button>
          </div>
          {byProject.length === 0 ? (
            <p className="text-sm text-center py-10" style={{ color: 'var(--text-3)' }}>ยังไม่มีข้อมูล</p>
          ) : byProject.map((p, i) => {
            const expanded = expandedProjects.has(p.name)
            const color = 'var(--chart-1)'
            return (
              <div key={p.name} style={{ borderBottom: '1px solid var(--divider)' }}>
                <button className="w-full flex items-center gap-3 px-5 py-3 text-left"
                  style={{ background: expanded ? 'var(--hover-bg)' : 'transparent' }}
                  onClick={() => { const n = new Set(expandedProjects); n.has(p.name) ? n.delete(p.name) : n.add(p.name); setExpandedProjects(n) }}>
                  <span className="text-xs font-bold w-5 text-right flex-shrink-0" style={{ color: 'var(--text-3)' }}>{i + 1}</span>
                  <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: color }} />
                  <span className="flex-1 text-sm font-semibold" style={{ color: 'var(--text-1)' }}>{p.name}</span>
                  <span className="text-xs px-2 py-0.5 rounded-[8px] flex-shrink-0" style={{ background: 'var(--hover-bg)', color: 'var(--text-3)' }}>{p.units} งาน</span>
                  <span className="text-sm font-bold flex-shrink-0 w-24 text-right" style={{ color: mainTab === 'sales' ? 'var(--accent-orange)' : 'var(--accent-green)' }}>{fk(p.revenue)}</span>
                  <ChevronDown size={14} className="flex-shrink-0 transition-transform" style={{ color: 'var(--text-3)', transform: expanded ? 'rotate(180deg)' : 'rotate(0deg)' }} />
                </button>
                {expanded && (
                  <div className="overflow-x-auto" style={{ background: 'var(--active-bg)' }}>
                    <table className="w-full text-xs tbl-rows">
                      <thead>
                        <tr style={{ borderBottom: '1px solid var(--divider)' }}>
                          {['ห้อง', 'ลูกค้า', mainTab === 'sales' ? 'วันจอง' : 'วันส่งมอบ', 'ประเภท', 'Sales',
                            mainTab === 'sales' ? 'สถานะ' : '', 'Revenue (inc.VAT)',
                            mainTab === 'deliver' ? 'GP%' : ''].filter(Boolean).map(h => (
                            <th key={h} className="text-left font-semibold whitespace-nowrap" style={{ color: 'var(--text-3)' }}>{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {p.jobs.sort((a, b) => compareRoom(a.room_no, b.room_no)).map(j => {
                          const d = mainTab === 'sales' ? (j.order_date || j.work_start_date) : j.actual_deliver_date
                          const gp = j.revenue_ex_vat > 0 ? ((j.revenue_ex_vat - costOf(j.id)) / j.revenue_ex_vat * 100) : null
                          return (
                            <tr key={j.id} style={{ borderBottom: '1px solid var(--divider)' }}>
                              <td className=" font-semibold" style={{ color: 'var(--text-1)' }}>{j.room_no || '—'}</td>
                              <td className="" style={{ color: 'var(--text-2)' }}>{j.customer_name || '—'}</td>
                              <td className=" whitespace-nowrap" style={{ color: 'var(--text-2)' }}>
                                {d ? new Date(d).toLocaleDateString('th-TH', { day: '2-digit', month: 'short', year: '2-digit' }) : '—'}
                              </td>
                              <td className="" style={{ color: 'var(--text-3)' }}>{j.work_type || '—'}</td>
                              <td className="" style={{ color: 'var(--text-3)' }}>{(j.sales as any)?.name || '—'}</td>
                              {mainTab === 'sales' && (
                                <td className="px-4 py-2">
                                  <StatusChip kind="working" status={j.working_status} variant="outline" />
                                </td>
                              )}
                              <td className=" font-bold num num-money" style={{ color: mainTab === 'sales' ? 'var(--accent-orange)' : 'var(--accent-green)' }}><span>{f(jobRev(j))}</span></td>
                              {mainTab === 'deliver' && (
                                <td className=" num num-pct" style={{ color: gp !== null ? (gp >= 30 ? 'var(--accent-green)' : gp >= 15 ? 'var(--accent-amber)' : 'var(--accent-red)') : 'var(--text-3)' }}><span>
                                  {gp !== null ? gp.toFixed(2) + '%' : '—'}
                                </span></td>
                              )}
                            </tr>
                          )
                        })}
                      </tbody>
                      <tfoot>
                        <tr style={{ background: 'var(--hover-bg)', borderTop: '2px solid var(--divider)' }}>
                          <td colSpan={mainTab === 'sales' ? 5 : 5} className=" font-semibold" style={{ color: 'var(--text-2)' }}>รวม {p.units} งาน</td>
                          <td className=" font-bold num num-money" style={{ color: mainTab === 'sales' ? 'var(--accent-orange)' : 'var(--accent-green)' }}><span>{f(p.revenue)}</span></td>
                          {mainTab === 'deliver' && <td />}
                        </tr>
                      </tfoot>
                    </table>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}

      {/* ── List view ── */}
      {view === 'list' && (
        <div className="ds-card tbl-scroll">
          <table className="w-full text-sm tbl-rows">
            <thead>
              <tr style={{ borderBottom: '1px solid var(--divider)' }}>
                {[
                  mainTab === 'sales' ? 'วันจอง' : 'วันส่งมอบ',
                  'ลูกค้า', 'โครงการ / ห้อง', 'ประเภท', 'Revenue (inc.VAT)',
                  mainTab === 'deliver' ? 'Cost' : '',
                  mainTab === 'deliver' ? 'GP%' : '',
                  'สถานะ', 'Sales',
                ].filter(Boolean).map(h => (
                  <th key={h} className="text-left text-xs font-semibold whitespace-nowrap" style={{ color: 'var(--text-3)' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {periodJobs.length === 0 ? (
                <tr><td colSpan={9} className="text-center text-sm" style={{ color: 'var(--text-3)' }}>ยังไม่มีข้อมูล</td></tr>
              ) : periodJobs.map(j => {
                const d = mainTab === 'sales' ? (j.order_date || j.work_start_date) : j.actual_deliver_date
                const profit = (j.revenue_ex_vat || 0) - costOf(j.id)
                const gp = j.revenue_ex_vat > 0 ? (profit / j.revenue_ex_vat * 100).toFixed(0) : '—'
                return (
                  <tr key={j.id} style={{ borderBottom: '1px solid var(--divider)' }}>
                    <td className=" text-xs whitespace-nowrap" style={{ color: 'var(--text-2)' }}>
                      {d ? new Date(d).toLocaleDateString('th-TH', { day: '2-digit', month: 'short', year: '2-digit' }) : '—'}
                    </td>
                    <td className="" style={{ color: 'var(--text-1)' }}>{j.customer_name || '—'}</td>
                    <td className="px-3 py-2.5">
                      <div className="text-xs" style={{ color: 'var(--text-3)' }}>{(j.projects as any)?.name || '—'}</div>
                      <div className="font-semibold" style={{ color: 'var(--text-1)' }}>{j.room_no || '—'}</div>
                    </td>
                    <td className="px-3 py-2.5">
                      <span className="px-1.5 py-0.5 rounded-[8px] text-xs" style={{ background: 'var(--hover-bg)', color: 'var(--text-2)' }}>
                        {j.work_type || '—'}
                      </span>
                    </td>
                    <td className=" font-bold num num-money" style={{ color: mainTab === 'sales' ? 'var(--accent-orange)' : 'var(--accent-green)' }}><span>
                      {f(jobRev(j))}
                    </span></td>
                    {mainTab === 'deliver' && <>
                      <td className=" num num-money" style={{ color: 'var(--accent-red)' }}><span>{costOf(j.id) ? f(costOf(j.id)) : '—'}</span></td>
                      <td className=" num num-pct" style={{ color: profit >= 0 ? 'var(--accent-green)' : 'var(--accent-red)' }}><span>{gp}{gp !== '—' ? '%' : ''}</span></td>
                    </>}
                    <td className="px-3 py-2.5">
                      <StatusChip kind="working" status={j.working_status} variant="outline" />
                    </td>
                    <td className=" text-xs" style={{ color: 'var(--text-2)' }}>{(j.sales as any)?.name || '—'}</td>
                  </tr>
                )
              })}
            </tbody>
            <tfoot>
              <tr style={{ borderTop: '2px solid var(--accent)', background: 'var(--active-bg)' }}>
                <td colSpan={4} className=" font-bold text-xs" style={{ color: 'var(--text-1)' }}>
                  รวม {periodJobs.length} รายการ
                </td>
                <td className=" font-bold num num-money" style={{ color: mainTab === 'sales' ? 'var(--accent-orange)' : 'var(--accent-green)' }}><span>{f(totalRevenue)}</span></td>
                {mainTab === 'deliver' && <>
                  <td className=" font-bold num num-money" style={{ color: 'var(--accent-red)' }}><span>{f(totalCost)}</span></td>
                  <td className=" font-bold num num-pct" style={{ color: 'var(--text-2)' }}>
                    <span>{totalRevenueEx > 0 ? (totalProfit / totalRevenueEx * 100).toFixed(2) + '%' : '—'}</span>
                  </td>
                </>}
                <td colSpan={2} />
              </tr>
            </tfoot>
          </table>
        </div>
      )}
    </div>
  )
}
