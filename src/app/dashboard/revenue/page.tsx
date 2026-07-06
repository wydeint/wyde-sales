'use client'

import React, { useEffect, useState, useMemo } from 'react'
import { createClient } from '@/lib/supabase/client'
import { TrendingUp, ChevronLeft, ChevronRight, BarChart3, Users, Building2, List, ChevronDown } from 'lucide-react'
import { PageSpinner, PageError } from '@/components/ui/StateUI'

// ─────────────────────────────────────────
// Types & helpers
// ─────────────────────────────────────────
type DeliveredJob = {
  id: string
  project_id: string
  room_no: string
  work_type: string
  customer_type: string
  package_type: string
  revenue_ex_vat: number
  revenue_inc_vat: number | null
  cost: number
  actual_deliver_date: string
  delivery_lot: string
  accounting_status: string
  working_status: string
  sales_id: string
  commission_amount: number
  notes: string
  customer_name?: string
  projects?: { name: string }
  sales?: { name: string }
}

type Period = 'week' | 'month' | 'quarter' | 'year'

const jobRev = (j: { revenue_inc_vat: number | null; revenue_ex_vat: number }) => j.revenue_inc_vat ?? j.revenue_ex_vat ?? 0
const f = (v: number) => '฿' + Math.round(v || 0).toLocaleString()
const fk = (v: number) => {
  if (v >= 1_000_000) return '฿' + (v / 1_000_000).toFixed(2) + 'M'
  if (v >= 1_000) return '฿' + (v / 1_000).toFixed(0) + 'K'
  return '฿' + Math.round(v || 0).toLocaleString()
}

function getWeekRange(date: Date): { start: Date; end: Date; label: string } {
  const d = new Date(date)
  const day = d.getDay() === 0 ? 7 : d.getDay()
  const start = new Date(d); start.setDate(d.getDate() - day + 1); start.setHours(0, 0, 0, 0)
  const end = new Date(start); end.setDate(start.getDate() + 6); end.setHours(23, 59, 59, 999)
  const fmt = (dt: Date) => dt.toLocaleDateString('th-TH', { day: 'numeric', month: 'short' })
  return { start, end, label: `${fmt(start)} – ${fmt(end)}` }
}

function getPeriodBounds(period: Period, offset: number): { start: Date; end: Date; label: string } {
  const now = new Date()
  if (period === 'week') {
    const base = new Date(now); base.setDate(now.getDate() + offset * 7)
    return getWeekRange(base)
  }
  if (period === 'month') {
    const y = now.getFullYear(); const m = now.getMonth() + offset
    const start = new Date(y, m, 1); const end = new Date(y, m + 1, 0, 23, 59, 59)
    const label = start.toLocaleDateString('th-TH', { month: 'long', year: 'numeric' })
    return { start, end, label }
  }
  if (period === 'quarter') {
    const totalQ = Math.floor(now.getMonth() / 3) + offset
    const y = now.getFullYear() + Math.floor(totalQ / 4)
    const q = ((totalQ % 4) + 4) % 4
    const start = new Date(y, q * 3, 1); const end = new Date(y, q * 3 + 3, 0, 23, 59, 59)
    return { start, end, label: `Q${q + 1} ${y}` }
  }
  // year
  const y = now.getFullYear() + offset
  return { start: new Date(y, 0, 1), end: new Date(y, 11, 31, 23, 59, 59), label: `ปี ${y}` }
}

function inRange(dateStr: string, start: Date, end: Date) {
  if (!dateStr) return false
  const d = new Date(dateStr)
  return d >= start && d <= end
}

const PERIOD_LABELS: Record<Period, string> = {
  week: 'สัปดาห์', month: 'เดือน', quarter: 'ไตรมาส', year: 'ปี'
}

const STATUS_COLORS: Record<string, string> = {
  'Backlog': '#60a5fa', 'FC': '#34d399', 'Backlog พต': '#a78bfa',
  'New Sale 2025': '#fbbf24', 'New Sale 2026': '#f97316',
}

// ─────────────────────────────────────────
// Main page
// ─────────────────────────────────────────
export default function RevenuePage() {
  const supabase = createClient()
  const [allJobs, setAllJobs] = useState<DeliveredJob[]>([])
  const [targets, setTargets] = useState<{ user_id: string; year: number; month: number; target_revenue: number }[]>([])
  const [loading, setLoading] = useState(true)
  const [fetchError, setFetchError] = useState('')

  // Period state
  const [period, setPeriod] = useState<Period>('month')
  const [offset, setOffset] = useState(0)
  const [view, setView] = useState<'summary' | 'sales' | 'project' | 'list'>('summary')
  const [filterSales, setFilterSales] = useState('')
  const [filterCustType, setFilterCustType] = useState('')
  const [filterWorkType, setFilterWorkType] = useState('')
  const [expandedProjects, setExpandedProjects] = useState<Set<string>>(new Set())
  const [expandedSales, setExpandedSales] = useState<Set<string>>(new Set())

  // Unique users
  const users = useMemo(() => {
    const map = new Map<string, string>()
    allJobs.forEach(j => {
      const salesData = j.sales as any
      const name = salesData?.name
      if (j.sales_id && name) map.set(j.sales_id, name)
    })
    return Array.from(map.entries()).map(([id, name]) => ({ id, name }))
  }, [allJobs])

  useEffect(() => {
    async function load() {
      setLoading(true)
      setFetchError('')
      const [{ data: jobsData, error: e1 }, { data: targetsData, error: e2 }] = await Promise.all([
        supabase.from('jobs')
          .select('id,project_id,room_no,customer_name,work_type,customer_type,package_type,revenue_ex_vat,revenue_inc_vat,cost,actual_deliver_date,delivery_lot,accounting_status,working_status,sales_id,commission_amount,notes,projects(name),sales:users!jobs_sales_id_fkey(name)')
          .eq('working_status', 'ส่งมอบแล้ว')
          .not('actual_deliver_date', 'is', null)
          .order('actual_deliver_date', { ascending: false }),
        supabase.from('sales_targets').select('user_id,year,month,target_revenue'),
      ])
      if (e1 || e2) { setFetchError((e1 ?? e2)!.message); setLoading(false); return }
      setAllJobs((jobsData as unknown as DeliveredJob[]) || [])
      setTargets(targetsData || [])
      setLoading(false)
    }
    load()
  }, [])

  const { start, end, label } = getPeriodBounds(period, offset)

  const workTypes = useMemo(() => {
    const s = new Set(allJobs.map(j => j.work_type).filter(Boolean))
    return Array.from(s).sort()
  }, [allJobs])

  // Jobs in current period
  const periodJobs = useMemo(() =>
    allJobs.filter(j => inRange(j.actual_deliver_date, start, end) &&
      (!filterSales || j.sales_id === filterSales) &&
      (!filterCustType || j.customer_type === filterCustType) &&
      (!filterWorkType || j.work_type === filterWorkType)),
    [allJobs, start, end, filterSales, filterCustType, filterWorkType]
  )

  // Jobs in previous period
  const prevBounds = getPeriodBounds(period, offset - 1)
  const prevJobs = useMemo(() =>
    allJobs.filter(j => inRange(j.actual_deliver_date, prevBounds.start, prevBounds.end)),
    [allJobs, prevBounds]
  )

  const totalRevenue = periodJobs.reduce((s, j) => s + (jobRev(j)), 0)
  const totalRevenueEx = periodJobs.reduce((s, j) => s + (j.revenue_ex_vat || 0), 0)
  const totalCost = periodJobs.reduce((s, j) => s + (j.cost || 0), 0)
  const totalProfit = totalRevenueEx - totalCost
  const totalCommission = periodJobs.reduce((s, j) => s + (j.commission_amount || 0), 0)
  const prevRevenue = prevJobs.reduce((s, j) => s + (jobRev(j)), 0)
  const growthPct = prevRevenue > 0 ? ((totalRevenue - prevRevenue) / prevRevenue * 100).toFixed(1) : null
  const unitCount = periodJobs.length

  // By sales
  const bySales = useMemo(() => {
    const map = new Map<string, { name: string; revenue: number; revenueEx: number; units: number; commission: number }>()
    periodJobs.forEach(j => {
      const salesData = j.sales as any
      const name = salesData?.name || 'ไม่ระบุ'
      const key = j.sales_id || name
      const cur = map.get(key) || { name, revenue: 0, revenueEx: 0, units: 0, commission: 0 }
      map.set(key, { name, revenue: cur.revenue + (jobRev(j)), revenueEx: cur.revenueEx + (j.revenue_ex_vat || 0), units: cur.units + 1, commission: cur.commission + (j.commission_amount || 0) })
    })
    return [...map.values()].sort((a, b) => b.revenue - a.revenue)
  }, [periodJobs])

  // By project
  const byProject = useMemo(() => {
    const map = new Map<string, { name: string; revenue: number; units: number; jobs: DeliveredJob[] }>()
    periodJobs.forEach(j => {
      const projectData = j.projects as any
      const name = projectData?.name || j.project_id || 'ไม่ระบุ'
      const cur = map.get(name) || { name, revenue: 0, units: 0, jobs: [] }
      map.set(name, { name, revenue: cur.revenue + (jobRev(j)), units: cur.units + 1, jobs: [...cur.jobs, j] })
    })
    return [...map.values()].sort((a, b) => b.revenue - a.revenue)
  }, [periodJobs])

  // By accounting status
  const byStatus = useMemo(() => {
    const map = new Map<string, number>()
    periodJobs.forEach(j => {
      const s = j.accounting_status || 'Backlog'
      map.set(s, (map.get(s) || 0) + (jobRev(j)))
    })
    return [...map.entries()].map(([status, revenue]) => ({ status, revenue })).sort((a, b) => b.revenue - a.revenue)
  }, [periodJobs])

  // Bar chart max
  const salesMax = Math.max(...bySales.map(s => s.revenue), 1)

  // Monthly trend for year view (12 months)
  const monthlyTrend = useMemo(() => {
    if (period !== 'year') return []
    const y = start.getFullYear()
    return Array.from({ length: 12 }, (_, m) => {
      const mStart = new Date(y, m, 1)
      const mEnd = new Date(y, m + 1, 0, 23, 59, 59)
      const rev = allJobs.filter(j => inRange(j.actual_deliver_date, mStart, mEnd)).reduce((s, j) => s + (jobRev(j)), 0)
      return { month: m + 1, label: mStart.toLocaleDateString('th-TH', { month: 'short' }), revenue: rev }
    })
  }, [allJobs, period, start])

  const trendMax = Math.max(...monthlyTrend.map(t => t.revenue), 1)

  if (loading) return <PageSpinner />
  if (fetchError) return <PageError message={fetchError} onRetry={() => { setLoading(true); setFetchError('') }} />

  return (
    <div className="page-content space-y-5">

      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-page-title" style={{ color: 'var(--text-1)' }}>รายได้ส่งมอบ</h1>
          <p className="text-xs mt-0.5" style={{ color: 'var(--text-3)' }}>Revenue Recognition — นับเมื่อ working_status = ส่งมอบแล้ว</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <select value={filterCustType} onChange={e => setFilterCustType(e.target.value)}
            className="field-input" style={{ width: 'auto' }}>
            <option value="">B2C + B2B</option>
            <option value="B2C">B2C</option>
            <option value="B2B">B2B</option>
          </select>
          <select value={filterWorkType} onChange={e => setFilterWorkType(e.target.value)}
            className="field-input" style={{ width: 'auto' }}>
            <option value="">ทุกประเภทงาน</option>
            {workTypes.map(w => <option key={w} value={w}>{w}</option>)}
          </select>
          {/* Sales filter */}
          <select value={filterSales} onChange={e => setFilterSales(e.target.value)}
            className="field-input" style={{ width: 'auto' }}>
            <option value="">ทุก Sales</option>
            {users.map(u => <option key={u.id} value={u.id}>{u.name}</option>)}
          </select>
          {/* Period tabs */}
          <div className="flex rounded-[11px] overflow-hidden" style={{ border: '1px solid var(--divider)' }}>
            {(['week', 'month', 'quarter', 'year'] as Period[]).map(p => (
              <button key={p} onClick={() => { setPeriod(p); setOffset(0) }}
                className="px-3 py-2 text-xs font-semibold"
                style={{
                  background: period === p ? 'var(--accent)' : 'var(--hover-bg)',
                  color: period === p ? '#fff' : 'var(--text-2)',
                }}>
                {PERIOD_LABELS[p]}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Period navigation */}
      <div className="flex items-center gap-3">
        <button onClick={() => setOffset(o => o - 1)} className="p-2 rounded-[8px]"
          style={{ background: 'var(--hover-bg)', color: 'var(--text-2)' }}>
          <ChevronLeft size={16} />
        </button>
        <div className="ds-card px-5 py-2 text-sm font-semibold flex-1 text-center"
          style={{ color: 'var(--text-1)' }}>
          {label}
          {offset === 0 && <span className="ml-2 text-xs px-2 py-0.5 rounded-full" style={{ background: 'var(--active-bg)', color: 'var(--accent)' }}>ปัจจุบัน</span>}
        </div>
        <button onClick={() => setOffset(o => o + 1)} className="p-2 rounded-[8px]"
          disabled={offset >= 0}
          style={{ background: 'var(--hover-bg)', color: offset >= 0 ? 'var(--text-3)' : 'var(--text-2)' }}>
          <ChevronRight size={16} />
        </button>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          {
            label: 'Revenue ส่งมอบ (Inc.VAT)',
            value: fk(totalRevenue),
            sub: growthPct ? `${growthPct > '0' ? '+' : ''}${growthPct}% vs ${PERIOD_LABELS[period]}ก่อน` : `vs ก่อนหน้า ${fk(prevRevenue)}`,
            color: '#4ade80',
          },
          {
            label: 'จำนวนห้อง/งาน',
            value: unitCount + ' งาน',
            sub: `เฉลี่ย ${unitCount > 0 ? fk(totalRevenue / unitCount) : '—'}/งาน`,
            color: '#60a5fa',
          },
          {
            label: 'Profit (Ex.VAT-Cost)',
            value: fk(totalProfit),
            sub: totalRevenueEx > 0 ? 'GP ' + (totalProfit / totalRevenueEx * 100).toFixed(1) + '%' : '—',
            color: totalProfit >= 0 ? '#4ade80' : '#f87171',
          },
          {
            label: 'Commission รวม',
            value: fk(totalCommission),
            sub: totalRevenue > 0 ? (totalCommission / totalRevenue * 100).toFixed(2) + '% ของ Revenue' : '—',
            color: '#fbbf24',
          },
        ].map(k => (
          <div key={k.label} className="ds-card p-4">
            <p className="text-card-title mb-1" style={{ color: 'var(--text-3)' }}>{k.label}</p>
            <p className="text-kpi-number" style={{ color: k.color }}>{k.value}</p>
            <p className="text-xs mt-1" style={{ color: 'var(--text-3)' }}>{k.sub}</p>
          </div>
        ))}
      </div>

      {/* Year trend chart */}
      {period === 'year' && monthlyTrend.length > 0 && (
        <div className="ds-card p-5">
          <div className="flex items-center gap-2 mb-4">
            <BarChart3 size={14} style={{ color: 'var(--accent)' }} />
            <h2 className="text-section-title" style={{ color: 'var(--text-1)' }}>รายได้รายเดือน {start.getFullYear()}</h2>
          </div>
          <div className="flex items-end gap-1.5 h-32">
            {monthlyTrend.map(m => (
              <div key={m.month} className="flex-1 flex flex-col items-center gap-1">
                <div className="w-full rounded-t-lg relative group" style={{
                  height: m.revenue > 0 ? Math.max(m.revenue / trendMax * 112, 4) + 'px' : '4px',
                  background: m.revenue > 0 ? 'linear-gradient(180deg,var(--accent),rgba(99,102,241,0.4))' : 'var(--divider)',
                  minHeight: '4px',
                }}>
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

      {/* View tabs */}
      <div className="flex gap-2">
        {([['summary', BarChart3, 'สรุป'], ['sales', Users, 'รายคน'], ['project', Building2, 'รายโครงการ'], ['list', List, 'รายงาน']] as const).map(([v, Icon, lbl]) => (
          <button key={v} onClick={() => setView(v)}
            className="flex items-center gap-1.5 px-4 py-2 rounded-[11px] text-sm font-semibold"
            style={{
              background: view === v ? 'var(--active-bg)' : 'var(--hover-bg)',
              color: view === v ? 'var(--accent)' : 'var(--text-2)',
            }}>
            <Icon size={13} />
            {lbl}
          </button>
        ))}
      </div>

      {/* ── Summary view ── */}
      {view === 'summary' && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
          {/* By sales mini */}
          <div className="ds-card p-5">
            <h2 className="text-section-title mb-4 flex items-center gap-2" style={{ color: 'var(--text-1)' }}>
              <Users size={13} style={{ color: '#60a5fa' }} /> Revenue by Sales
            </h2>
            {bySales.length === 0 ? (
              <p className="text-sm text-center py-6" style={{ color: 'var(--text-3)' }}>ยังไม่มีข้อมูล</p>
            ) : bySales.map((s, i) => (
              <div key={s.name} className="mb-3">
                <div className="flex items-center justify-between mb-1">
                  <div className="flex items-center gap-2">
                    <span className="text-xs w-4" style={{ color: 'var(--text-3)' }}>{i + 1}.</span>
                    <span className="text-sm font-semibold" style={{ color: 'var(--text-1)' }}>{s.name}</span>
                    <span className="text-xs" style={{ color: 'var(--text-3)' }}>{s.units} งาน</span>
                  </div>
                  <span className="text-sm font-bold" style={{ color: '#4ade80' }}>{fk(s.revenue)}</span>
                </div>
                <div className="h-2 rounded-full overflow-hidden" style={{ background: 'var(--divider)' }}>
                  <div className="h-full rounded-full" style={{
                    width: (s.revenue / salesMax * 100) + '%',
                    background: `hsl(${220 + i * 30}, 80%, 65%)`,
                  }} />
                </div>
              </div>
            ))}
          </div>

          {/* By accounting status */}
          <div className="ds-card p-5">
            <h2 className="text-section-title mb-4" style={{ color: 'var(--text-1)' }}>ประเภทงาน (Accounting Status)</h2>
            {byStatus.length === 0 ? (
              <p className="text-sm text-center py-6" style={{ color: 'var(--text-3)' }}>ยังไม่มีข้อมูล</p>
            ) : byStatus.map(s => (
              <div key={s.status} className="flex items-center gap-3 mb-3">
                <span className="w-3 h-3 rounded-full flex-shrink-0" style={{ background: STATUS_COLORS[s.status] || '#888' }} />
                <span className="text-sm flex-1" style={{ color: 'var(--text-2)' }}>{s.status}</span>
                <span className="text-sm font-bold" style={{ color: 'var(--text-1)' }}>{fk(s.revenue)}</span>
                <span className="text-xs" style={{ color: 'var(--text-3)' }}>
                  {totalRevenue > 0 ? (s.revenue / totalRevenue * 100).toFixed(0) : 0}%
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Sales view ── */}
      {view === 'sales' && (
        <div className="ds-card overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr style={{ borderBottom: '1px solid var(--divider)' }}>
                {['Sales', 'จำนวนงาน', 'Revenue (Inc.VAT)', 'Cost', 'Profit (Ex-Cost)', 'GP%', 'Commission'].map(h => (
                  <th key={h} className="text-left px-4 py-3 text-xs font-semibold" style={{ color: 'var(--text-3)' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {bySales.length === 0 ? (
                <tr><td colSpan={7} className="text-center py-10 text-sm" style={{ color: 'var(--text-3)' }}>ยังไม่มีข้อมูล</td></tr>
              ) : bySales.map(s => {
                const salesJobs = periodJobs.filter(j => {
                  const salesData = j.sales as any
                  return salesData?.name === s.name
                })
                const cost = salesJobs.reduce((sum, j) => sum + (j.cost || 0), 0)
                const profit = s.revenueEx - cost
                const gp = s.revenueEx > 0 ? (profit / s.revenueEx * 100).toFixed(1) : '—'
                const expanded = expandedSales.has(s.name)
                return (
                  <React.Fragment key={s.name}>
                  <tr style={{ borderBottom: expanded ? 'none' : '1px solid var(--divider)', cursor: 'pointer' }}
                    onClick={() => {
                      const next = new Set(expandedSales)
                      next.has(s.name) ? next.delete(s.name) : next.add(s.name)
                      setExpandedSales(next)
                    }}>
                    <td className="px-4 py-3 font-semibold" style={{ color: 'var(--text-1)' }}>
                      <div className="flex items-center gap-2">
                        <ChevronDown size={12} style={{ color: 'var(--text-3)', transform: expanded ? 'rotate(180deg)' : 'none', transition: 'transform 0.15s', flexShrink: 0 }} />
                        <div className="w-6 h-6 rounded-full flex items-center justify-center text-xs text-white font-bold"
                          style={{ background: 'linear-gradient(135deg,#6366f1,#8b5cf6)' }}>
                          {s.name[0]}
                        </div>
                        {s.name}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-center" style={{ color: 'var(--text-2)' }}>{s.units}</td>
                    <td className="px-4 py-3 font-bold" style={{ color: '#4ade80' }}>{f(s.revenue)}</td>
                    <td className="px-4 py-3" style={{ color: '#f87171' }}>{cost ? f(cost) : '—'}</td>
                    <td className="px-4 py-3" style={{ color: profit >= 0 ? '#4ade80' : '#f87171' }}>{cost ? f(profit) : '—'}</td>
                    <td className="px-4 py-3" style={{ color: 'var(--text-2)' }}>{gp}{gp !== '—' ? '%' : ''}</td>
                    <td className="px-4 py-3" style={{ color: '#fbbf24' }}>{s.commission ? f(s.commission) : '—'}</td>
                  </tr>
                  {expanded && (
                    <tr style={{ borderBottom: '1px solid var(--divider)' }}>
                      <td colSpan={7} className="px-4 pb-3 pt-0">
                        <div className="rounded-[10px] overflow-hidden" style={{ background: 'var(--active-bg)', border: '1px solid var(--divider)' }}>
                          <table className="w-full text-xs">
                            <thead>
                              <tr style={{ borderBottom: '1px solid var(--divider)' }}>
                                {['ห้อง', 'โครงการ', 'ลูกค้า', 'วันส่งมอบ', 'ประเภทงาน', 'Revenue (Inc.VAT)'].map(h => (
                                  <th key={h} className="text-left px-3 py-2 font-semibold whitespace-nowrap" style={{ color: 'var(--text-3)' }}>{h}</th>
                                ))}
                              </tr>
                            </thead>
                            <tbody>
                              {salesJobs.map(j => (
                                <tr key={j.id} style={{ borderBottom: '1px solid var(--divider)' }}>
                                  <td className="px-3 py-2 font-mono font-semibold" style={{ color: 'var(--accent)' }}>{j.room_no || '—'}</td>
                                  <td className="px-3 py-2" style={{ color: 'var(--text-2)' }}>{(j.projects as any)?.name || j.project_id || '—'}</td>
                                  <td className="px-3 py-2" style={{ color: 'var(--text-1)' }}>{j.customer_name || '—'}</td>
                                  <td className="px-3 py-2 whitespace-nowrap" style={{ color: 'var(--text-3)' }}>{j.actual_deliver_date?.slice(0, 10) || '—'}</td>
                                  <td className="px-3 py-2" style={{ color: 'var(--text-2)' }}>{j.work_type || '—'}</td>
                                  <td className="px-3 py-2 font-bold" style={{ color: '#4ade80' }}>{f(jobRev(j))}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      </td>
                    </tr>
                  )}
                  </React.Fragment>
                )
              })}
              {/* Total row */}
              <tr style={{ borderTop: '2px solid var(--accent)', background: 'var(--active-bg)' }}>
                <td className="px-4 py-3 font-bold" style={{ color: 'var(--text-1)' }}>รวมทั้งหมด</td>
                <td className="px-4 py-3 text-center font-bold" style={{ color: 'var(--text-1)' }}>{unitCount}</td>
                <td className="px-4 py-3 font-bold" style={{ color: '#4ade80' }}>{f(totalRevenue)}</td>
                <td className="px-4 py-3 font-bold" style={{ color: '#f87171' }}>{f(totalCost)}</td>
                <td className="px-4 py-3 font-bold" style={{ color: totalProfit >= 0 ? '#4ade80' : '#f87171' }}>{f(totalProfit)}</td>
                <td className="px-4 py-3 font-bold" style={{ color: 'var(--text-2)' }}>
                  {totalRevenueEx > 0 ? (totalProfit / totalRevenueEx * 100).toFixed(1) + '%' : '—'}
                </td>
                <td className="px-4 py-3 font-bold" style={{ color: '#fbbf24' }}>{f(totalCommission)}</td>
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
              <Building2 size={14} style={{ color: '#f97316' }} />
              <h2 className="text-section-title" style={{ color: 'var(--text-1)' }}>รายโครงการ</h2>
              <span className="text-xs" style={{ color: 'var(--text-3)' }}>{byProject.length} โครงการ · {periodJobs.length} งาน</span>
            </div>
            <button className="text-xs px-2 py-1 rounded-lg" style={{ color: 'var(--accent)', background: 'var(--hover-bg)' }}
              onClick={() => {
                const allExpanded = byProject.every(p => expandedProjects.has(p.name))
                setExpandedProjects(allExpanded ? new Set() : new Set(byProject.map(p => p.name)))
              }}>
              {byProject.every(p => expandedProjects.has(p.name)) ? 'ย่อทั้งหมด' : 'ขยายทั้งหมด'}
            </button>
          </div>
          {byProject.length === 0 ? (
            <p className="text-sm text-center py-10" style={{ color: 'var(--text-3)' }}>ยังไม่มีข้อมูล</p>
          ) : byProject.map((p, i) => {
            const expanded = expandedProjects.has(p.name)
            const color = `hsl(${(i * 47) % 360}, 65%, 55%)`
            return (
              <div key={p.name} style={{ borderBottom: '1px solid var(--divider)' }}>
                {/* Project header row */}
                <button className="w-full flex items-center gap-3 px-5 py-3 text-left"
                  style={{ background: expanded ? 'var(--hover-bg)' : 'transparent' }}
                  onClick={() => {
                    const next = new Set(expandedProjects)
                    next.has(p.name) ? next.delete(p.name) : next.add(p.name)
                    setExpandedProjects(next)
                  }}>
                  <span className="text-xs font-bold w-5 text-right flex-shrink-0" style={{ color: 'var(--text-3)' }}>{i + 1}</span>
                  <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: color }} />
                  <span className="flex-1 text-sm font-semibold" style={{ color: 'var(--text-1)' }}>{p.name}</span>
                  <span className="text-xs px-2 py-0.5 rounded-full flex-shrink-0"
                    style={{ background: 'var(--hover-bg)', color: 'var(--text-3)' }}>{p.units} งาน</span>
                  <span className="text-sm font-bold flex-shrink-0 w-24 text-right" style={{ color: '#4ade80' }}>{fk(p.revenue)}</span>
                  <ChevronDown size={14} className="flex-shrink-0 transition-transform" style={{ color: 'var(--text-3)', transform: expanded ? 'rotate(180deg)' : 'rotate(0deg)' }} />
                </button>
                {/* Expanded job list */}
                {expanded && (
                  <div className="overflow-x-auto" style={{ background: 'var(--active-bg)' }}>
                    <table className="w-full text-xs">
                      <thead>
                        <tr style={{ borderBottom: '1px solid var(--divider)' }}>
                          {['ห้อง', 'ลูกค้า', 'วันส่งมอบ', 'ประเภท', 'Sales', 'Revenue (Inc.VAT)', 'GP%'].map(h => (
                            <th key={h} className="text-left px-4 py-2 font-semibold whitespace-nowrap" style={{ color: 'var(--text-3)' }}>{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {p.jobs.sort((a, b) => (a.room_no || '').localeCompare(b.room_no || '')).map(j => {
                          const gp = j.revenue_ex_vat > 0 ? ((j.revenue_ex_vat - j.cost) / j.revenue_ex_vat * 100) : null
                          return (
                            <tr key={j.id} style={{ borderBottom: '1px solid var(--divider)' }}>
                              <td className="px-4 py-2 font-semibold" style={{ color: 'var(--text-1)' }}>{j.room_no || '—'}</td>
                              <td className="px-4 py-2" style={{ color: 'var(--text-2)' }}>{j.customer_name || '—'}</td>
                              <td className="px-4 py-2 whitespace-nowrap" style={{ color: 'var(--text-2)' }}>
                                {j.actual_deliver_date ? new Date(j.actual_deliver_date).toLocaleDateString('th-TH', { day: '2-digit', month: 'short', year: '2-digit' }) : '—'}
                              </td>
                              <td className="px-4 py-2 whitespace-nowrap" style={{ color: 'var(--text-3)' }}>{j.work_type || '—'}</td>
                              <td className="px-4 py-2 whitespace-nowrap" style={{ color: 'var(--text-3)' }}>{(j.sales as any)?.name || '—'}</td>
                              <td className="px-4 py-2 font-bold text-right whitespace-nowrap" style={{ color: '#4ade80' }}>{f(jobRev(j))}</td>
                              <td className="px-4 py-2 text-right whitespace-nowrap" style={{ color: gp !== null ? (gp >= 30 ? '#4ade80' : gp >= 15 ? '#fbbf24' : '#f87171') : 'var(--text-3)' }}>
                                {gp !== null ? gp.toFixed(1) + '%' : '—'}
                              </td>
                            </tr>
                          )
                        })}
                      </tbody>
                      <tfoot>
                        <tr style={{ background: 'var(--hover-bg)', borderTop: '2px solid var(--divider)' }}>
                          <td colSpan={5} className="px-4 py-2 font-semibold" style={{ color: 'var(--text-2)' }}>รวม {p.units} งาน</td>
                          <td className="px-4 py-2 font-bold text-right" style={{ color: '#4ade80' }}>{f(p.revenue)}</td>
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
      )}

      {/* ── List view ── */}
      {view === 'list' && (
        <div className="ds-card overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr style={{ borderBottom: '1px solid var(--divider)' }}>
                {['วันที่ส่งมอบ', 'ลูกค้า', 'โครงการ / ห้อง', 'SO', 'ประเภท', 'Revenue (Inc.VAT)', 'Cost', 'GP%', 'Lot', 'Status', 'Sales'].map(h => (
                  <th key={h} className="text-left px-3 py-3 text-xs font-semibold whitespace-nowrap"
                    style={{ color: 'var(--text-3)' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {periodJobs.length === 0 ? (
                <tr><td colSpan={11} className="text-center py-12 text-sm" style={{ color: 'var(--text-3)' }}>ยังไม่มีข้อมูล</td></tr>
              ) : periodJobs.map(j => {
                const profit = (j.revenue_ex_vat || 0) - (j.cost || 0)
                const gp = j.revenue_ex_vat > 0 ? (profit / j.revenue_ex_vat * 100).toFixed(0) : '—'
                const revDisplay = jobRev(j)
                return (
                  <tr key={j.id} style={{ borderBottom: '1px solid var(--divider)' }}>
                    <td className="px-3 py-2.5 text-xs whitespace-nowrap" style={{ color: 'var(--text-2)' }}>
                      {new Date(j.actual_deliver_date).toLocaleDateString('th-TH', { day: '2-digit', month: 'short', year: '2-digit' })}
                    </td>
                    <td className="px-3 py-2.5" style={{ color: 'var(--text-1)' }}>
                      {j.customer_name || '—'}
                    </td>
                    <td className="px-3 py-2.5">
                      <div className="text-xs" style={{ color: 'var(--text-3)' }}>{(j.projects as any)?.name || '—'}</div>
                      <div className="font-semibold" style={{ color: 'var(--text-1)' }}>{j.room_no || '—'}</div>
                    </td>
                    <td className="px-3 py-2.5 font-mono text-xs" style={{ color: 'var(--text-3)' }}>—</td>
                    <td className="px-3 py-2.5">
                      <span className="px-1.5 py-0.5 rounded-full text-xs"
                        style={{ background: 'var(--hover-bg)', color: 'var(--text-2)' }}>
                        {j.work_type || '—'}
                      </span>
                    </td>
                    <td className="px-3 py-2.5 font-bold text-right" style={{ color: '#4ade80' }}>
                      {revDisplay ? f(revDisplay) : '—'}
                    </td>
                    <td className="px-3 py-2.5 text-right" style={{ color: '#f87171' }}>
                      {j.cost ? f(j.cost) : '—'}
                    </td>
                    <td className="px-3 py-2.5 text-right" style={{ color: profit >= 0 ? '#4ade80' : '#f87171' }}>
                      {gp}{gp !== '—' ? '%' : ''}
                    </td>
                    <td className="px-3 py-2.5 text-xs" style={{ color: 'var(--text-3)' }}>
                      {j.delivery_lot || '—'}
                    </td>
                    <td className="px-3 py-2.5">
                      <span className="px-1.5 py-0.5 rounded-full text-xs"
                        style={{
                          background: j.working_status === 'ส่งมอบแล้ว' ? 'rgba(74,222,128,0.15)' : 'rgba(251,191,36,0.15)',
                          color: j.working_status === 'ส่งมอบแล้ว' ? '#4ade80' : '#fbbf24',
                        }}>
                        {j.working_status || '—'}
                      </span>
                    </td>
                    <td className="px-3 py-2.5 text-xs" style={{ color: 'var(--text-2)' }}>
                      {(j.sales as any)?.name || '—'}
                    </td>
                  </tr>
                )
              })}
            </tbody>
            <tfoot>
              <tr style={{ borderTop: '2px solid var(--accent)', background: 'var(--active-bg)' }}>
                <td colSpan={5} className="px-3 py-2.5 font-bold text-xs" style={{ color: 'var(--text-1)' }}>
                  รวม {periodJobs.length} รายการ
                </td>
                <td className="px-3 py-2.5 font-bold text-right" style={{ color: '#4ade80' }}>{f(totalRevenue)}</td>
                <td className="px-3 py-2.5 font-bold text-right" style={{ color: '#f87171' }}>{f(totalCost)}</td>
                <td className="px-3 py-2.5 font-bold text-right" style={{ color: 'var(--text-2)' }}>
                  {totalRevenueEx > 0 ? (totalProfit / totalRevenueEx * 100).toFixed(1) + '%' : '—'}
                </td>
                <td colSpan={3} />
              </tr>
            </tfoot>
          </table>
        </div>
      )}
    </div>
  )
}
