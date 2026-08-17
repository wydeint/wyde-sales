'use client'

import { useEffect, useState, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Plus, Target, Pencil, Building2, Users } from 'lucide-react'
import { PageSpinner, PageError } from '@/components/ui/StateUI'
import Modal from '@/components/ui/Modal'
import PageHeader from '@/components/ui/PageHeader'
import FilterBar from '@/components/ui/FilterBar'
import { Input, Select } from '@/components/ui/Input'

interface OrgTarget {
  id: string; year: number; month: number
  target_sales_value: number; target_delivery_value: number
}

interface SalesTarget {
  id: string; user_id: string; project_id: string
  year: number; month: number
  target_calls: number; target_visits: number; target_leads: number
  target_bookings: number; target_booking_value: number
  target_closed: number; target_sales_value: number; target_delivery_value: number
  users?: { name: string }; projects?: { name: string }
}

interface User { id: string; name: string; manager_id?: string }
interface Project { id: string; name: string }

const MONTHS = [
  'ม.ค.','ก.พ.','มี.ค.','เม.ย.','พ.ค.','มิ.ย.',
  'ก.ค.','ส.ค.','ก.ย.','ต.ค.','พ.ย.','ธ.ค.'
]
const MONTHS_FULL = [
  'มกราคม','กุมภาพันธ์','มีนาคม','เมษายน','พฤษภาคม','มิถุนายน',
  'กรกฎาคม','สิงหาคม','กันยายน','ตุลาคม','พฤศจิกายน','ธันวาคม'
]

const thisYear = new Date().getFullYear()
const thisMonth = new Date().getMonth() + 1
const thisQ = Math.floor((thisMonth - 1) / 3) + 1

type ViewPeriod = 'month' | 'quarter' | 'year'
type TabView = 'org' | 'sales'

function getViewMonths(p: ViewPeriod): number[] {
  if (p === 'month') return [thisMonth]
  if (p === 'quarter') return [thisQ * 3 - 2, thisQ * 3 - 1, thisQ * 3]
  return [1,2,3,4,5,6,7,8,9,10,11,12]
}

const f = (v: number) => v ? '฿' + Math.round(v).toLocaleString() : '฿0'
const pct = (a: number, b: number) => b > 0 ? Math.min(Math.round(a / b * 100), 100) : 0

function ProgressBar({ value, max, color }: { value: number; max: number; color: string }) {
  const p = pct(value, max)
  return (
    <div className="w-full h-1.5 rounded-full bg-white/10 mt-1">
      <div className="h-1.5 rounded-full transition-all duration-500" style={{ width: `${p}%`, background: color }} />
    </div>
  )
}

function Sparkline({ points, color = 'var(--accent)', width = 64, height = 24 }: { points: number[]; color?: string; width?: number; height?: number }) {
  if (points.length < 2) return null
  const max = Math.max(...points, 1)
  const step = width / (points.length - 1)
  const pts = points.map((v, i) => `${i * step},${height - (v / max) * (height - 2) - 1}`)
  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} style={{ overflow: 'visible' }}>
      <polyline points={pts.join(' ')} fill="none" stroke={color} strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" />
      {points.map((v, i) => (
        <circle key={i} cx={i * step} cy={height - (v / max) * (height - 2) - 1} r={2} fill={color} />
      ))}
    </svg>
  )
}

const emptyOrgForm = { year: thisYear, month: thisMonth, target_sales_value: 0, target_delivery_value: 0 }
const emptySalesForm = {
  user_id: '', project_id: '', year: thisYear, month: thisMonth,
  target_calls: 0, target_visits: 0, target_leads: 0, target_bookings: 0,
  target_booking_value: 0, target_closed: 0, target_sales_value: 0, target_delivery_value: 0,
}

export default function TargetsPage() {
  const supabase = createClient()
  const [tab, setTab] = useState<TabView>('org')
  const [viewPeriod, setViewPeriod] = useState<ViewPeriod>('month')
  const [filterYear, setFilterYear] = useState(thisYear)
  const [loading, setLoading] = useState(true)
  const [fetchError, setFetchError] = useState('')

  // Org targets
  const [orgTargets, setOrgTargets] = useState<OrgTarget[]>([])
  const [orgModalOpen, setOrgModalOpen] = useState(false)
  const [editingOrg, setEditingOrg] = useState<OrgTarget | null>(null)
  const [orgForm, setOrgForm] = useState(emptyOrgForm)
  const [orgSaving, setOrgSaving] = useState(false)

  // Sales targets
  const [salesTargets, setSalesTargets] = useState<SalesTarget[]>([])
  const [users, setUsers] = useState<User[]>([])
  const [projects, setProjects] = useState<Project[]>([])
  const [salesModalOpen, setSalesModalOpen] = useState(false)
  const [salesModalStep, setSalesModalStep] = useState<1 | 2>(1)
  const [editingSales, setEditingSales] = useState<SalesTarget | null>(null)
  const [salesForm, setSalesForm] = useState(emptySalesForm)
  const [salesSaving, setSalesSaving] = useState(false)

  // Actual data
  const [actualSalesByUser, setActualSalesByUser] = useState<Record<string, Record<number, number>>>({})
  const [actualDelivByUser, setActualDelivByUser] = useState<Record<string, Record<number, number>>>({})
  const [actualSalesByMonth, setActualSalesByMonth] = useState<Record<number, number>>({})
  const [actualDelivByMonth, setActualDelivByMonth] = useState<Record<number, number>>({})

  const load = useCallback(async () => {
    setLoading(true); setFetchError('')

    const [
      { data: ot, error: e1 },
      { data: st, error: e2 },
      { data: u, error: e3 },
      { data: p },
      { data: saleJobs },
      { data: delivJobs },
    ] = await Promise.all([
      supabase.from('org_targets').select('*').eq('year', filterYear).order('month'),
      supabase.from('sales_targets').select('*, users(name), projects(name)').eq('year', filterYear).order('month'),
      supabase.from('users').select('id,name,manager_id').eq('active', true).eq('role', 'sales').order('name'),
      supabase.from('projects').select('id,name').order('name'),
      // ยอดขาย: order_date ในปีนั้น
      supabase.from('jobs').select('sales_id, revenue_ex_vat, order_date')
        .not('order_date', 'is', null)
        .not('working_status', 'eq', 'ยกเลิก')
        .gte('order_date', `${filterYear}-01-01`)
        .lte('order_date', `${filterYear}-12-31`),
      // ยอดส่งมอบ: actual_deliver_date ในปีนั้น (ใช้ jobs โดยตรง ไม่ใช่ handovers)
      supabase.from('jobs').select('sales_id, revenue_ex_vat, actual_deliver_date')
        .eq('working_status', 'ส่งมอบแล้ว')
        .not('actual_deliver_date', 'is', null)
        .gte('actual_deliver_date', `${filterYear}-01-01`)
        .lte('actual_deliver_date', `${filterYear}-12-31`),
    ])

    if (e1 && !e1.message.includes('does not exist')) { setFetchError(e1.message); setLoading(false); return }
    if (e2 || e3) { setFetchError((e2 ?? e3)!.message); setLoading(false); return }

    setOrgTargets(ot || [])
    setSalesTargets(st || [])
    setUsers(u || [])
    setProjects(p || [])

    // ยอดขาย by user & month
    const salesByUser: Record<string, Record<number, number>> = {}
    const salesByMonth: Record<number, number> = {}
    for (const j of (saleJobs || [])) {
      if (!j.order_date) continue
      const m = parseInt(j.order_date.slice(5, 7))
      const val = j.revenue_ex_vat || 0
      salesByMonth[m] = (salesByMonth[m] || 0) + val
      if (j.sales_id) {
        if (!salesByUser[j.sales_id]) salesByUser[j.sales_id] = {}
        salesByUser[j.sales_id][m] = (salesByUser[j.sales_id][m] || 0) + val
      }
    }

    // ยอดส่งมอบ by user & month (จาก actual_deliver_date)
    const delivByUser: Record<string, Record<number, number>> = {}
    const delivByMonth: Record<number, number> = {}
    for (const j of (delivJobs || [])) {
      if (!j.actual_deliver_date) continue
      const m = parseInt((j.actual_deliver_date as string).slice(5, 7))
      const val = j.revenue_ex_vat || 0
      delivByMonth[m] = (delivByMonth[m] || 0) + val
      if (j.sales_id) {
        if (!delivByUser[j.sales_id]) delivByUser[j.sales_id] = {}
        delivByUser[j.sales_id][m] = (delivByUser[j.sales_id][m] || 0) + val
      }
    }

    setActualSalesByUser(salesByUser)
    setActualDelivByUser(delivByUser)
    setActualSalesByMonth(salesByMonth)
    setActualDelivByMonth(delivByMonth)
    setLoading(false)
  }, [filterYear, supabase])

  useEffect(() => { load() }, [load])

  // ── Org target save ──────────────────────────────
  async function saveOrg() {
    setOrgSaving(true)
    if (editingOrg) {
      await supabase.from('org_targets').update({
        target_sales_value: orgForm.target_sales_value,
        target_delivery_value: orgForm.target_delivery_value,
      }).eq('id', editingOrg.id)
    } else {
      await supabase.from('org_targets').upsert({
        year: orgForm.year, month: orgForm.month,
        target_sales_value: orgForm.target_sales_value,
        target_delivery_value: orgForm.target_delivery_value,
      }, { onConflict: 'year,month' })
    }
    setOrgSaving(false); setOrgModalOpen(false); load()
  }

  // ── Sales target save ────────────────────────────
  async function saveSales() {
    if (!salesForm.user_id) return
    setSalesSaving(true)
    if (editingSales) {
      await supabase.from('sales_targets').update(salesForm).eq('id', editingSales.id)
    } else {
      await supabase.from('sales_targets').insert(salesForm)
    }
    setSalesSaving(false); setSalesModalOpen(false); load()
  }

  const viewMonths = getViewMonths(viewPeriod)
  const periodLabel = viewPeriod === 'month' ? MONTHS_FULL[thisMonth - 1]
    : viewPeriod === 'quarter' ? `Q${thisQ}/${filterYear + 543}`
    : `ปี ${filterYear + 543}`

  // Org aggregation for view period
  const orgInView = orgTargets.filter(o => viewMonths.includes(o.month))
  const orgTotalSales = orgInView.reduce((s, o) => s + (o.target_sales_value || 0), 0)
  const orgTotalDeliv = orgInView.reduce((s, o) => s + (o.target_delivery_value || 0), 0)
  const orgActualSales = viewMonths.reduce((s, m) => s + (actualSalesByMonth[m] || 0), 0)
  const orgActualDeliv = viewMonths.reduce((s, m) => s + (actualDelivByMonth[m] || 0), 0)

  // Sales: aggregate per user across viewMonths
  const filteredSales = salesTargets.filter(t => viewMonths.includes(t.month))
  const byUser = new Map<string, SalesTarget & { months: number[] }>()
  for (const t of filteredSales) {
    const ex = byUser.get(t.user_id)
    if (ex) {
      ex.target_sales_value += t.target_sales_value || 0
      ex.target_delivery_value += t.target_delivery_value || 0
      ex.target_calls += t.target_calls; ex.target_visits += t.target_visits
      ex.target_leads += t.target_leads; ex.target_bookings += t.target_bookings
      ex.target_closed += t.target_closed; ex.months.push(t.month)
    } else {
      byUser.set(t.user_id, { ...t, target_sales_value: t.target_sales_value || 0, target_delivery_value: t.target_delivery_value || 0, months: [t.month] })
    }
  }
  const grouped = Array.from(byUser.values())

  function getUserActual(uid: string, type: 'sales' | 'deliv') {
    const map = type === 'sales' ? actualSalesByUser[uid] : actualDelivByUser[uid]
    return viewMonths.reduce((s, m) => s + ((map || {})[m] || 0), 0)
  }

  const userOptions = [{ value: '', label: '— เลือก Sales —' }, ...users.map(u => ({ value: u.id, label: u.name }))]
  const projOptions = [{ value: '', label: '— ทุกโครงการ —' }, ...projects.map(p => ({ value: p.id, label: p.name }))]
  const yearOptions = [thisYear - 1, thisYear, thisYear + 1].map(y => ({ value: String(y), label: `${y + 543} (พ.ศ.)` }))
  const monthOptions = MONTHS_FULL.map((m, i) => ({ value: String(i + 1), label: m }))

  // Org annual summary (all 12 months)
  const orgAllSales = orgTargets.reduce((s, o) => s + (o.target_sales_value || 0), 0)
  const orgAllDeliv = orgTargets.reduce((s, o) => s + (o.target_delivery_value || 0), 0)

  // Sales team total target vs org target
  const salesTeamSalesTarget = salesTargets.filter(t => viewMonths.includes(t.month)).reduce((s, t) => s + (t.target_sales_value || 0), 0)
  const salesTeamDelivTarget = salesTargets.filter(t => viewMonths.includes(t.month)).reduce((s, t) => s + (t.target_delivery_value || 0), 0)

  return (
    <div className="page-content">
      {/* Header */}
      <PageHeader
        title="Sales Targets"
        subtitle="กำหนดและติดตามเป้าหมายการขาย"
        actions={
          <>
          {tab === 'org' && (
            <button onClick={() => { setEditingOrg(null); setOrgForm({ ...emptyOrgForm, year: filterYear }); setOrgModalOpen(true) }}
              className="flex items-center gap-2 btn-primary text-white px-4 py-2 rounded-lg text-sm font-semibold transition-colors">
              <Plus size={16} />ตั้งเป้าองค์กร
            </button>
          )}
          {tab === 'sales' && (
            <button onClick={() => { setEditingSales(null); setSalesForm({ ...emptySalesForm, year: filterYear }); setSalesModalStep(1); setSalesModalOpen(true) }}
              className="flex items-center gap-2 btn-primary text-white px-4 py-2 rounded-lg text-sm font-semibold transition-colors">
              <Plus size={16} />ตั้งเป้า Sales
            </button>
          )}
          </>
        }
      />

      {/* Tab + Period row */}
      <FilterBar className="mb-6">
        {/* Tabs — .tab-group like every other page. The old markup filled the
            active tab with --accent-orange, the only orange selection in the
            app, and orange is reserved for "needs attention". */}
        <div className="tab-group">
          <button onClick={() => setTab('org')} className={`tab-btn ${tab === 'org' ? 'active' : ''}`}>
            <Building2 size={12} />เป้าองค์กร
          </button>
          <button onClick={() => setTab('sales')} className={`tab-btn ${tab === 'sales' ? 'active' : ''}`}>
            <Users size={12} />เป้า Sales
          </button>
        </div>

        {/* Period pills — the active colour used to swap with the tab above it,
            so an unrelated control changed this one's appearance. */}
        <div className="tab-group">
          {(['month','quarter','year'] as ViewPeriod[]).map(p => (
            <button key={p} onClick={() => setViewPeriod(p)}
              className={`tab-btn ${viewPeriod === p ? 'active' : ''}`}>
              {p === 'month' ? 'เดือน' : p === 'quarter' ? 'ไตรมาส' : 'ปี'}
            </button>
          ))}
        </div>

        {/* Year */}
        <select value={filterYear} onChange={e => setFilterYear(Number(e.target.value))}
          className="field-input" style={{ width: 'auto' }}>
          {[thisYear - 1, thisYear, thisYear + 1].map(y => (
            <option key={y} value={y}>{y + 543} (พ.ศ.)</option>
          ))}
        </select>
        <span className="text-sm" style={{ color: 'var(--text-3)' }}>{periodLabel}</span>
      </FilterBar>

      {loading ? (
        <div className="flex justify-center py-12">
          <div className="w-7 h-7 rounded-full border-2 border-t-transparent animate-spin" style={{ borderColor: 'var(--accent-orange)', borderTopColor: 'transparent' }} />
        </div>
      ) : fetchError ? (
        <PageError message={fetchError} onRetry={load} />
      ) : (
        <>
          {/* ══ ORG TARGETS TAB ══════════════════════════════ */}
          {tab === 'org' && (
            <div className="space-y-6">
              {/* Annual Summary Card */}
              {/* Plain card. This was tinted orange end to end, but nothing here
                  needs attention — it is just the org target summary, and orange
                  means "act on this" everywhere else in the app. */}
              <div className="ds-card p-5">
                <div className="flex items-center gap-2 mb-4">
                  <Building2 size={16} style={{ color: 'var(--accent)' }} />
                  <h2 className="text-label-upper" style={{ color: 'var(--text-2)' }}>สรุปเป้าองค์กร ปี {filterYear + 543}</h2>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <p className="text-xs mb-1" style={{ color: 'var(--text-2)' }}>เป้ายอดขายรวมทั้งปี</p>
                    <p className="text-success font-bold text-xl">{f(orgAllSales)}</p>
                    <p className="text-xs mt-0.5" style={{ color: 'var(--text-3)' }}>จริง ({periodLabel}): <span style={{ color: 'var(--text-1)' }}>{f(orgActualSales)}</span></p>
                  </div>
                  <div>
                    <p className="text-xs mb-1" style={{ color: 'var(--text-2)' }}>เป้าส่งมอบรวมทั้งปี</p>
                    <p className="text-info font-bold text-xl">{f(orgAllDeliv)}</p>
                    <p className="text-xs mt-0.5" style={{ color: 'var(--text-3)' }}>จริง ({periodLabel}): <span style={{ color: 'var(--text-1)' }}>{f(orgActualDeliv)}</span></p>
                  </div>
                </div>
                {/* Period breakdown progress */}
                {(orgTotalSales > 0 || orgTotalDeliv > 0) && (
                  <div className="mt-4 pt-4 border-t grid grid-cols-2 gap-4">
                    <div>
                      <div className="flex justify-between text-xs mb-1">
                        <span style={{ color: 'var(--text-2)' }}>เป้า{periodLabel}</span>
                        <span className="text-success">{pct(orgActualSales, orgTotalSales)}%</span>
                      </div>
                      <ProgressBar value={orgActualSales} max={orgTotalSales} color="var(--accent-green)" />
                      <p className="text-micro mt-0.5" style={{ color: 'var(--text-3)' }}>เป้า {f(orgTotalSales)}</p>
                    </div>
                    <div>
                      <div className="flex justify-between text-xs mb-1">
                        <span style={{ color: 'var(--text-2)' }}>ส่งมอบ{periodLabel}</span>
                        <span className="text-info">{pct(orgActualDeliv, orgTotalDeliv)}%</span>
                      </div>
                      <ProgressBar value={orgActualDeliv} max={orgTotalDeliv} color="var(--accent-blue)" />
                      <p className="text-micro mt-0.5" style={{ color: 'var(--text-3)' }}>เป้า {f(orgTotalDeliv)}</p>
                    </div>
                  </div>
                )}
              </div>

              {/* Sales team vs Org gap */}
              {orgTotalSales > 0 && salesTeamSalesTarget > 0 && (
                <div className="ds-card p-4">
                  <p className="text-card-title mb-3" style={{ color: 'var(--text-2)' }}>เปรียบเทียบเป้าองค์กร vs เป้าทีมขาย ({periodLabel})</p>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <p className="text-micro" style={{ color: 'var(--text-3)' }}>ยอดขาย</p>
                      <div className="flex items-end gap-2">
                        <span className="text-sm font-bold" style={{ color: 'var(--chart-1)' }}>{f(orgTotalSales)}</span>
                        <span className="text-xs" style={{ color: 'var(--text-3)' }}>เป้าองค์กร</span>
                      </div>
                      <div className="flex items-end gap-2 mt-0.5">
                        <span className="text-sm font-bold" style={{ color: 'var(--chart-2)' }}>{f(salesTeamSalesTarget)}</span>
                        <span className="text-xs" style={{ color: 'var(--text-3)' }}>เป้าทีม</span>
                      </div>
                      {salesTeamSalesTarget < orgTotalSales && (
                        <p className="text-danger text-micro mt-1">ขาด {f(orgTotalSales - salesTeamSalesTarget)}</p>
                      )}
                    </div>
                    <div>
                      <p className="text-micro" style={{ color: 'var(--text-3)' }}>ส่งมอบ</p>
                      <div className="flex items-end gap-2">
                        <span className="text-sm font-bold" style={{ color: 'var(--chart-1)' }}>{f(orgTotalDeliv)}</span>
                        <span className="text-xs" style={{ color: 'var(--text-3)' }}>เป้าองค์กร</span>
                      </div>
                      <div className="flex items-end gap-2 mt-0.5">
                        <span className="text-sm font-bold" style={{ color: 'var(--chart-2)' }}>{f(salesTeamDelivTarget)}</span>
                        <span className="text-xs" style={{ color: 'var(--text-3)' }}>เป้าทีม</span>
                      </div>
                      {salesTeamDelivTarget < orgTotalDeliv && (
                        <p className="text-danger text-micro mt-1">ขาด {f(orgTotalDeliv - salesTeamDelivTarget)}</p>
                      )}
                    </div>
                  </div>
                </div>
              )}

              {/* Monthly breakdown table */}
              <div className="ds-card overflow-hidden tbl-scroll" style={{ padding: 0 }}>
                <div className="px-5 py-3 flex justify-between items-center" style={{ borderBottom: '1px solid var(--divider)' }}>
                  <h3 className="text-section-title" style={{ color: 'var(--text-1)' }}>เป้ารายเดือน ปี {filterYear + 543}</h3>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead>
                      <tr style={{ borderBottom: '1px solid var(--divider)' }}>
                        {['เดือน','เป้ายอดขาย','จริง (ขาย)','%','เป้าส่งมอบ','จริง (ส่งมอบ)','%',''].map((h, i) => (
                          <th key={i} className={`py-2 px-4 text-xs font-semibold ${i === 0 ? 'text-left' : 'text-right'}`} style={{ color: 'var(--text-2)' }}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {Array.from({ length: 12 }, (_, i) => i + 1).map(m => {
                        const ot = orgTargets.find(o => o.month === m)
                        const actS = actualSalesByMonth[m] || 0
                        const actD = actualDelivByMonth[m] || 0
                        const isCurrentMonth = m === thisMonth && filterYear === thisYear
                        return (
                          <tr key={m}
                            style={{ borderBottom: '1px solid var(--divider)', background: isCurrentMonth ? 'var(--hover-bg)' : 'transparent' }}
                            onMouseEnter={e => (e.currentTarget.style.background = 'var(--hover-bg)')}
                            onMouseLeave={e => (e.currentTarget.style.background = isCurrentMonth ? 'var(--hover-bg)' : 'transparent')}>
                            <td className="py-2.5 px-4 text-sm">
                              <span className={isCurrentMonth ? 'text-accent font-bold' : ''} style={isCurrentMonth ? {} : { color: 'var(--text-2)' }}>
                                {MONTHS_FULL[m - 1]}
                              </span>
                            </td>
                            <td className="py-2.5 px-4 text-right text-sm text-success">{ot ? f(ot.target_sales_value) : <span style={{ color: 'var(--text-3)' }}>—</span>}</td>
                            <td className="py-2.5 px-4 text-right text-sm" style={{ color: 'var(--text-1)' }}>{actS > 0 ? f(actS) : <span style={{ color: 'var(--text-3)' }}>—</span>}</td>
                            <td className="py-2.5 px-4 text-right text-xs">
                              {ot && ot.target_sales_value > 0 ? (
                                <span className={pct(actS, ot.target_sales_value) >= 100 ? 'text-success' : ''} style={pct(actS, ot.target_sales_value) >= 100 ? {} : { color: 'var(--text-2)' }}>
                                  {pct(actS, ot.target_sales_value)}%
                                </span>
                              ) : <span style={{ color: 'var(--text-3)' }}>—</span>}
                            </td>
                            <td className="py-2.5 px-4 text-right text-sm text-info">{ot ? f(ot.target_delivery_value) : <span style={{ color: 'var(--text-3)' }}>—</span>}</td>
                            <td className="py-2.5 px-4 text-right text-sm" style={{ color: 'var(--text-1)' }}>{actD > 0 ? f(actD) : <span style={{ color: 'var(--text-3)' }}>—</span>}</td>
                            <td className="py-2.5 px-4 text-right text-xs">
                              {ot && ot.target_delivery_value > 0 ? (
                                <span className={pct(actD, ot.target_delivery_value) >= 100 ? 'text-info' : ''} style={pct(actD, ot.target_delivery_value) >= 100 ? {} : { color: 'var(--text-2)' }}>
                                  {pct(actD, ot.target_delivery_value)}%
                                </span>
                              ) : <span style={{ color: 'var(--text-3)' }}>—</span>}
                            </td>
                            <td className="py-2.5 px-4 text-right">
                              <button onClick={() => {
                                if (ot) { setEditingOrg(ot); setOrgForm({ year: ot.year, month: ot.month, target_sales_value: ot.target_sales_value, target_delivery_value: ot.target_delivery_value }) }
                                else setOrgForm({ year: filterYear, month: m, target_sales_value: 0, target_delivery_value: 0 })
                                setOrgModalOpen(true)
                              }} className="transition-colors" style={{ color: 'var(--text-2)' }}
                                onMouseEnter={e => (e.currentTarget.style.color = 'var(--text-1)')}
                                onMouseLeave={e => (e.currentTarget.style.color = 'var(--text-2)')}>
                                <Pencil size={12} />
                              </button>
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                    <tfoot>
                      <tr style={{ borderTop: '2px solid var(--divider)' }}>
                        <td className="py-3 px-4 text-xs font-semibold" style={{ color: 'var(--text-2)' }}>รวมทั้งปี</td>
                        <td className="py-3 px-4 text-right text-success font-bold text-sm">{f(orgAllSales)}</td>
                        <td className="py-3 px-4 text-right font-bold text-sm" style={{ color: 'var(--text-1)' }}>{f(Object.values(actualSalesByMonth).reduce((s, v) => s + v, 0))}</td>
                        <td className="py-3 px-4 text-right text-xs" style={{ color: 'var(--text-2)' }}>
                          {orgAllSales > 0 ? `${pct(Object.values(actualSalesByMonth).reduce((s, v) => s + v, 0), orgAllSales)}%` : '—'}
                        </td>
                        <td className="py-3 px-4 text-right text-info font-bold text-sm">{f(orgAllDeliv)}</td>
                        <td className="py-3 px-4 text-right font-bold text-sm" style={{ color: 'var(--text-1)' }}>{f(Object.values(actualDelivByMonth).reduce((s, v) => s + v, 0))}</td>
                        <td className="py-3 px-4 text-right text-xs" style={{ color: 'var(--text-2)' }}>
                          {orgAllDeliv > 0 ? `${pct(Object.values(actualDelivByMonth).reduce((s, v) => s + v, 0), orgAllDeliv)}%` : '—'}
                        </td>
                        <td />
                      </tr>
                    </tfoot>
                  </table>
                </div>
              </div>
            </div>
          )}

          {/* ══ SALES TARGETS TAB ═══════════════════════════ (placeholder removed) */}
          {false && (() => {
            const TEAM_COLORS = ['var(--chart-1)', 'var(--chart-2)']
            const managerIds = [...new Set(users.filter(u => u.manager_id).map(u => u.manager_id!))]
            const teamData = managerIds.map((mgrId, idx) => {
              const manager = users.find(u => u.id === mgrId) ?? { id: mgrId, name: mgrId }
              const members = users.filter(u => u.manager_id === mgrId)
              const memberIds = new Set(members.map(m => m.id))
              const teamActualSales = members.reduce((s, u) => s + getUserActual(u.id, 'sales'), 0)
              const teamActualDeliv = members.reduce((s, u) => s + getUserActual(u.id, 'deliv'), 0)
              const teamTargetSales = filteredSales.filter(t => memberIds.has(t.user_id)).reduce((s, t) => s + (t.target_sales_value || 0), 0)
              const teamTargetDeliv = filteredSales.filter(t => memberIds.has(t.user_id)).reduce((s, t) => s + (t.target_delivery_value || 0), 0)
              const color = TEAM_COLORS[idx % TEAM_COLORS.length]
              return { manager, members, teamActualSales, teamActualDeliv, teamTargetSales, teamTargetDeliv, color }
            })

            return (
              <div className="space-y-6">
                {/* ── Side-by-side team comparison ─── */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {teamData.map(team => (
                    <div key={team.manager.id} className="rounded-[18px] p-5 space-y-4"
                      style={{ background: 'var(--card-bg)', border: `1px solid ${team.color}40` }}>
                      {/* Team header */}
                      <div className="flex items-center gap-3">
                        <div className="w-9 h-9 rounded-full flex items-center justify-center font-bold text-white"
                          style={{ background: team.color }}>
                          {team.manager.name[0]}
                        </div>
                        <div>
                          <p className="text-section-title" style={{ color: 'var(--text-1)' }}>ทีม {team.manager.name}</p>
                          <p className="text-xs" style={{ color: 'var(--text-3)' }}>{team.members.length} คน · {periodLabel}</p>
                        </div>
                      </div>

                      {/* Team totals */}
                      <div className="grid grid-cols-2 gap-3">
                        <div className="rounded-lg p-3" style={{ background: 'var(--hover-bg)' }}>
                          <p className="text-micro mb-1" style={{ color: 'var(--text-3)' }}>ยอดขายทีม</p>
                          <p className="font-bold text-base" style={{ color: 'var(--accent-green)' }}>{f(team.teamActualSales)}</p>
                          {team.teamTargetSales > 0 && <>
                            <p className="text-micro mt-1" style={{ color: 'var(--text-3)' }}>เป้า {f(team.teamTargetSales)}</p>
                            <ProgressBar value={team.teamActualSales} max={team.teamTargetSales} color="var(--accent-green)" />
                            <p className="text-micro mt-0.5 text-right" style={{ color: 'var(--accent-green)' }}>{pct(team.teamActualSales, team.teamTargetSales)}%</p>
                          </>}
                        </div>
                        <div className="rounded-lg p-3" style={{ background: 'var(--hover-bg)' }}>
                          <p className="text-micro mb-1" style={{ color: 'var(--text-3)' }}>ส่งมอบทีม</p>
                          <p className="font-bold text-base" style={{ color: 'var(--accent-blue)' }}>{f(team.teamActualDeliv)}</p>
                          {team.teamTargetDeliv > 0 && <>
                            <p className="text-micro mt-1" style={{ color: 'var(--text-3)' }}>เป้า {f(team.teamTargetDeliv)}</p>
                            <ProgressBar value={team.teamActualDeliv} max={team.teamTargetDeliv} color="var(--accent-blue)" />
                            <p className="text-micro mt-0.5 text-right" style={{ color: 'var(--accent-blue)' }}>{pct(team.teamActualDeliv, team.teamTargetDeliv)}%</p>
                          </>}
                        </div>
                      </div>

                      {/* Member breakdown */}
                      <div className="space-y-2">
                        <p className="text-micro font-semibold uppercase tracking-wider" style={{ color: 'var(--text-3)' }}>รายคน</p>
                        {team.members.map(u => {
                          const actS = getUserActual(u.id, 'sales')
                          const actD = getUserActual(u.id, 'deliv')
                          const tgtS = filteredSales.filter(t => t.user_id === u.id).reduce((s, t) => s + (t.target_sales_value || 0), 0)
                          const tgtD = filteredSales.filter(t => t.user_id === u.id).reduce((s, t) => s + (t.target_delivery_value || 0), 0)
                          return (
                            <div key={u.id} className="rounded-lg p-3" style={{ background: 'var(--hover-bg)' }}>
                              <div className="flex items-center justify-between mb-2">
                                <div className="flex items-center gap-2">
                                  <div className="w-6 h-6 rounded-full flex items-center justify-center text-micro font-bold text-white"
                                    style={{ background: team.color + '99' }}>{u.name[0]}</div>
                                  <span className="text-xs font-semibold" style={{ color: 'var(--text-1)' }}>{u.name}</span>
                                </div>
                                {tgtS > 0 && (
                                  <span className="text-micro font-semibold" style={{ color: pct(actS, tgtS) >= 100 ? 'var(--accent-green)' : 'var(--text-3)' }}>
                                    {pct(actS, tgtS)}%
                                  </span>
                                )}
                              </div>
                              <div className="grid grid-cols-2 gap-2 text-micro">
                                <div>
                                  <span style={{ color: 'var(--text-3)' }}>ขาย </span>
                                  <span style={{ color: 'var(--accent-green)' }}>{f(actS)}</span>
                                  {tgtS > 0 && <span style={{ color: 'var(--text-3)' }}> / {f(tgtS)}</span>}
                                  {tgtS > 0 && <ProgressBar value={actS} max={tgtS} color="var(--accent-green)" />}
                                </div>
                                <div>
                                  <span style={{ color: 'var(--text-3)' }}>ส่งมอบ </span>
                                  <span style={{ color: 'var(--accent-blue)' }}>{f(actD)}</span>
                                  {tgtD > 0 && <span style={{ color: 'var(--text-3)' }}> / {f(tgtD)}</span>}
                                  {tgtD > 0 && <ProgressBar value={actD} max={tgtD} color="var(--accent-blue)" />}
                                </div>
                              </div>
                            </div>
                          )
                        })}
                      </div>
                    </div>
                  ))}
                </div>

                {/* ── Cross-team comparison table ─── */}
                {teamData.length >= 2 && (
                  <div className="rounded-[18px] overflow-hidden" style={{ background: 'var(--card-bg)', border: '1px solid var(--divider)' }}>
                    <div className="px-5 py-3" style={{ borderBottom: '1px solid var(--divider)' }}>
                      <p className="text-section-title" style={{ color: 'var(--text-1)' }}>เปรียบเทียบผลทีม ({periodLabel})</p>
                    </div>
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead>
                          <tr style={{ borderBottom: '1px solid var(--divider)' }}>
                            <th className="text-left px-4 py-2 text-xs font-semibold" style={{ color: 'var(--text-3)' }}>ชื่อ</th>
                            {teamData.map(t => (
                              <th key={t.manager.id} colSpan={2} className="text-center px-4 py-2 text-xs font-semibold" style={{ color: t.color }}>
                                ทีม {t.manager.name}
                              </th>
                            ))}
                          </tr>
                          <tr style={{ borderBottom: '1px solid var(--divider)' }}>
                            <th className="text-left px-4 py-1.5 text-micro" style={{ color: 'var(--text-3)' }}></th>
                            {teamData.map(t => (
                              <>
                                <th key={t.manager.id + 's'} className="text-right px-3 py-1.5 text-micro" style={{ color: 'var(--text-3)' }}>ยอดขาย</th>
                                <th key={t.manager.id + 'd'} className="text-right px-3 py-1.5 text-micro" style={{ color: 'var(--text-3)' }}>ส่งมอบ</th>
                              </>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {/* max members rows */}
                          {Array.from({ length: Math.max(...teamData.map(t => t.members.length)) }, (_, i) => (
                            <tr key={i} style={{ borderBottom: '1px solid var(--divider)' }}>
                              <td className="px-4 py-2 text-xs" style={{ color: 'var(--text-3)' }}>#{i + 1}</td>
                              {teamData.map(t => {
                                const u = t.members[i]
                                if (!u) return <><td key={t.manager.id + 's'} className="px-3 py-2" /><td key={t.manager.id + 'd'} className="px-3 py-2" /></>
                                return (
                                  <>
                                    <td key={t.manager.id + 's'} className="px-3 py-2">
                                      <p className="text-xs font-semibold" style={{ color: 'var(--text-1)' }}>{u.name}</p>
                                      <p className="text-micro" style={{ color: 'var(--accent-green)' }}>{f(getUserActual(u.id, 'sales'))}</p>
                                    </td>
                                    <td key={t.manager.id + 'd'} className="px-3 py-2 text-right">
                                      <p className="text-micro" style={{ color: 'var(--accent-blue)' }}>{f(getUserActual(u.id, 'deliv'))}</p>
                                    </td>
                                  </>
                                )
                              })}
                            </tr>
                          ))}
                          {/* team total row */}
                          <tr style={{ borderTop: '2px solid var(--divider)', background: 'var(--hover-bg)' }}>
                            <td className="px-4 py-2 text-xs font-bold" style={{ color: 'var(--text-1)' }}>รวมทีม</td>
                            {teamData.map(t => (
                              <>
                                <td key={t.manager.id + 'ts'} className="px-3 py-2">
                                  <p className="text-xs font-bold" style={{ color: 'var(--accent-green)' }}>{f(t.teamActualSales)}</p>
                                  {t.teamTargetSales > 0 && <p className="text-micro" style={{ color: 'var(--text-3)' }}>{pct(t.teamActualSales, t.teamTargetSales)}%</p>}
                                </td>
                                <td key={t.manager.id + 'td'} className="px-3 py-2 text-right">
                                  <p className="text-xs font-bold" style={{ color: 'var(--accent-blue)' }}>{f(t.teamActualDeliv)}</p>
                                  {t.teamTargetDeliv > 0 && <p className="text-micro" style={{ color: 'var(--text-3)' }}>{pct(t.teamActualDeliv, t.teamTargetDeliv)}%</p>}
                                </td>
                              </>
                            ))}
                          </tr>
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}
              </div>
            )
          })()}

          {/* ══ SALES TARGETS TAB ═══════════════════════════ */}
          {tab === 'sales' && (
            <div className="space-y-4">
              {grouped.length === 0 ? (
                <div className="text-center py-16 ds-card">
                  <Target size={32} className="mx-auto mb-2" style={{ color: 'var(--text-3)' }} />
                  <p className="text-sm" style={{ color: 'var(--text-2)' }}>ยังไม่มีเป้าหมายสำหรับช่วงนี้</p>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                  {grouped.map(t => {
                    const actS = getUserActual(t.user_id, 'sales')
                    const actD = getUserActual(t.user_id, 'deliv')
                    // Sparkline: last 3 months actuals
                    const sparkMonths = [thisMonth - 2, thisMonth - 1, thisMonth].map(m => m <= 0 ? m + 12 : m)
                    const sparkSales = sparkMonths.map(m => (actualSalesByUser[t.user_id]?.[m] || 0))
                    const sparkDeliv = sparkMonths.map(m => (actualDelivByUser[t.user_id]?.[m] || 0))
                    const trend = sparkSales[2] > sparkSales[0] ? '↑' : sparkSales[2] < sparkSales[0] ? '↓' : '→'
                    const trendColor = trend === '↑' ? 'var(--accent-green)' : trend === '↓' ? 'var(--accent-red)' : 'var(--text-3)'
                    return (
                      <div key={t.user_id} className="ds-card p-4">
                        <div className="flex items-center justify-between mb-4">
                          <div className="flex items-center gap-2">
                            <div className="w-8 h-8 rounded-full flex items-center justify-center" style={{ background: 'var(--hover-bg)' }}>
                              <span className="text-sm font-bold" style={{ color: 'var(--text-1)' }}>{t.users?.name?.[0] || '?'}</span>
                            </div>
                            <div>
                              <p className="text-sm font-semibold" style={{ color: 'var(--text-1)' }}>{t.users?.name || '-'}</p>
                              {t.projects?.name && <p className="text-xs" style={{ color: 'var(--text-3)' }}>{t.projects.name}</p>}
                            </div>
                          </div>
                          <button onClick={() => {
                            const r = filteredSales.find(r => r.user_id === t.user_id)
                            if (r) {
                              setEditingSales(r)
                              setSalesForm({ user_id: r.user_id, project_id: r.project_id || '', year: r.year, month: r.month, target_calls: r.target_calls, target_visits: r.target_visits, target_leads: r.target_leads, target_bookings: r.target_bookings, target_booking_value: r.target_booking_value, target_closed: r.target_closed, target_sales_value: r.target_sales_value || 0, target_delivery_value: r.target_delivery_value || 0 })
                              setSalesModalStep(1); setSalesModalOpen(true)
                            }
                          }} className="transition-colors p-1" style={{ color: 'var(--text-2)' }}
                            onMouseEnter={e => (e.currentTarget.style.color = 'var(--text-1)')}
                            onMouseLeave={e => (e.currentTarget.style.color = 'var(--text-2)')}>
                            <Pencil size={14} />
                          </button>
                        </div>

                        <div className="grid grid-cols-2 gap-2 mb-3">
                          <div className="rounded-[11px] p-3" style={{ background: 'var(--card-bg)' }}>
                            <p className="text-micro mb-1" style={{ color: 'var(--text-3)' }}>เป้ายอดขาย</p>
                            <p className="text-success font-bold text-base">{f(t.target_sales_value)}</p>
                            <p className="text-micro mt-1" style={{ color: 'var(--text-3)' }}>จริง <span style={{ color: 'var(--text-1)' }}>{f(actS)}</span></p>
                            <ProgressBar value={actS} max={t.target_sales_value} color="var(--accent-green)" />
                            <p className="text-success text-micro mt-0.5 text-right">{pct(actS, t.target_sales_value)}%</p>
                          </div>
                          <div className="rounded-[11px] p-3" style={{ background: 'var(--card-bg)' }}>
                            <p className="text-micro mb-1" style={{ color: 'var(--text-3)' }}>เป้าส่งมอบ</p>
                            <p className="text-info font-bold text-base">{f(t.target_delivery_value)}</p>
                            <p className="text-micro mt-1" style={{ color: 'var(--text-3)' }}>จริง <span style={{ color: 'var(--text-1)' }}>{f(actD)}</span></p>
                            <ProgressBar value={actD} max={t.target_delivery_value} color="var(--accent-blue)" />
                            <p className="text-info text-micro mt-0.5 text-right">{pct(actD, t.target_delivery_value)}%</p>
                          </div>
                        </div>

                        {/* Trend sparkline */}
                        <div className="rounded-lg p-3 flex items-center gap-4" style={{ background: 'var(--hover-bg)' }}>
                          <div>
                            <p className="text-micro mb-1" style={{ color: 'var(--text-3)' }}>
                              trend 3 เดือน <span style={{ color: trendColor }}>{trend}</span>
                            </p>
                            <Sparkline points={sparkSales} color="var(--accent-green)" />
                          </div>
                          <div>
                            <p className="text-micro mb-1" style={{ color: 'var(--text-3)' }}>ส่งมอบ</p>
                            <Sparkline points={sparkDeliv} color="var(--accent-blue)" />
                          </div>
                          <div className="text-micro space-y-0.5 ml-auto">
                            {sparkMonths.map((m, i) => (
                              <div key={m} className="flex gap-2 justify-between" style={{ color: 'var(--text-3)' }}>
                                <span>{MONTHS[m - 1]}</span>
                                <span style={{ color: 'var(--accent-green)' }}>{sparkSales[i] > 0 ? `฿${(sparkSales[i] / 1e6).toFixed(1)}M` : '—'}</span>
                              </div>
                            ))}
                          </div>
                        </div>

                        <div className="grid grid-cols-3 gap-2">
                          {[
                            { label: 'โทร', v: t.target_calls, c: 'var(--accent-amber)' },
                            { label: 'เยี่ยม', v: t.target_visits, c: 'var(--accent-amber)' },
                            { label: 'Lead', v: t.target_leads, c: 'var(--accent-purple)' },
                            { label: 'Booking', v: t.target_bookings, c: 'var(--accent-purple)' },
                            { label: 'ปิดขาย', v: t.target_closed, c: 'var(--accent-green)' },
                            { label: 'BK Value', v: null, d: f(t.target_booking_value), c: 'var(--accent-orange)' },
                          ].map(item => (
                            <div key={item.label} className="rounded-lg p-2" style={{ background: 'var(--card-bg)' }}>
                              <p className="text-micro" style={{ color: 'var(--text-3)' }}>{item.label}</p>
                              <p className="text-xs font-semibold mt-0.5" style={{ color: item.c }}>{item.d ?? item.v}</p>
                            </div>
                          ))}
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          )}
        </>
      )}

      {/* ── Org Target Modal ─────────────────────────── */}
      <Modal open={orgModalOpen} onClose={() => setOrgModalOpen(false)} title="ตั้งเป้าองค์กร">
        <div className="grid grid-cols-2 gap-4">
          <Select label="ปี" value={String(orgForm.year)} onChange={e => setOrgForm({ ...orgForm, year: Number(e.target.value) })} options={yearOptions} />
          <Select label="เดือน" value={String(orgForm.month)} onChange={e => setOrgForm({ ...orgForm, month: Number(e.target.value) })} options={monthOptions} />
          <Input label="เป้ายอดขาย (บาท)" type="number" value={orgForm.target_sales_value} onChange={e => setOrgForm({ ...orgForm, target_sales_value: Number(e.target.value) })} />
          <Input label="เป้าส่งมอบ (บาท)" type="number" value={orgForm.target_delivery_value} onChange={e => setOrgForm({ ...orgForm, target_delivery_value: Number(e.target.value) })} />
        </div>
        <div className="flex justify-end gap-3 mt-5">
          <button onClick={() => setOrgModalOpen(false)} className="px-4 py-2 text-sm transition-colors" style={{ color: 'var(--text-2)' }}
            onMouseEnter={e => (e.currentTarget.style.color = 'var(--text-1)')}
            onMouseLeave={e => (e.currentTarget.style.color = 'var(--text-2)')}>ยกเลิก</button>
          <button onClick={saveOrg} disabled={orgSaving} className="px-4 py-2 btn-primary disabled:opacity-50 text-white text-sm rounded-lg transition-colors">
            {orgSaving ? 'กำลังบันทึก...' : 'บันทึก'}
          </button>
        </div>
      </Modal>

      {/* ── Sales Target Modal (2-step) ───────────────── */}
      <Modal open={salesModalOpen} onClose={() => setSalesModalOpen(false)} title={editingSales ? 'แก้ไขเป้าหมาย Sales' : 'ตั้งเป้าหมาย Sales'}>
        {/* Step indicator */}
        <div className="flex items-center gap-2 mb-5">
          {[1, 2].map(s => (
            <div key={s} className="flex items-center gap-2">
              <div className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold"
                style={{ background: salesModalStep >= s ? 'var(--accent)' : 'var(--hover-bg)', color: salesModalStep >= s ? '#fff' : 'var(--text-3)' }}>
                {s}
              </div>
              <span className="text-xs" style={{ color: salesModalStep === s ? 'var(--text-1)' : 'var(--text-3)' }}>
                {s === 1 ? 'ยอดเงิน' : 'กิจกรรม'}
              </span>
              {s < 2 && <div className="w-8 h-px" style={{ background: 'var(--divider)' }} />}
            </div>
          ))}
        </div>

        {salesModalStep === 1 && (
          <div className="grid grid-cols-2 gap-4">
            <Select label="Sales *" value={salesForm.user_id} onChange={e => setSalesForm({ ...salesForm, user_id: e.target.value })} options={userOptions} />
            <Select label="โครงการ" value={salesForm.project_id} onChange={e => setSalesForm({ ...salesForm, project_id: e.target.value })} options={projOptions} />
            <Select label="ปี" value={String(salesForm.year)} onChange={e => setSalesForm({ ...salesForm, year: Number(e.target.value) })} options={yearOptions} />
            <Select label="เดือน" value={String(salesForm.month)} onChange={e => setSalesForm({ ...salesForm, month: Number(e.target.value) })} options={monthOptions} />
            <Input label="เป้ายอดขาย (บาท)" type="number" value={salesForm.target_sales_value} onChange={e => setSalesForm({ ...salesForm, target_sales_value: Number(e.target.value) })} />
            <Input label="เป้าส่งมอบ (บาท)" type="number" value={salesForm.target_delivery_value} onChange={e => setSalesForm({ ...salesForm, target_delivery_value: Number(e.target.value) })} />
            <div className="col-span-2">
              <Input label="เป้า Booking Value (บาท)" type="number" value={salesForm.target_booking_value} onChange={e => setSalesForm({ ...salesForm, target_booking_value: Number(e.target.value) })} />
            </div>
            {/* Copy from prev month */}
            {(() => {
              const prevMonth = salesForm.month === 1 ? 12 : salesForm.month - 1
              const prevYear = salesForm.month === 1 ? salesForm.year - 1 : salesForm.year
              const prevTarget = salesTargets.find(t => t.user_id === salesForm.user_id && t.month === prevMonth && t.year === prevYear)
              if (!prevTarget || !salesForm.user_id) return null
              return (
                <div className="col-span-2">
                  <button onClick={() => setSalesForm(f => ({ ...f, target_sales_value: prevTarget.target_sales_value || 0, target_delivery_value: prevTarget.target_delivery_value || 0, target_booking_value: prevTarget.target_booking_value || 0, target_calls: prevTarget.target_calls, target_visits: prevTarget.target_visits, target_leads: prevTarget.target_leads, target_bookings: prevTarget.target_bookings, target_closed: prevTarget.target_closed }))}
                    className="text-xs px-3 py-1.5 rounded-lg border transition-colors"
                    style={{ color: 'var(--accent)', borderColor: 'var(--accent)', background: 'transparent' }}>
                    ใช้เป้าเดิม ({MONTHS[prevMonth - 1]})
                  </button>
                </div>
              )
            })()}
          </div>
        )}

        {salesModalStep === 2 && (
          <div className="grid grid-cols-2 gap-4">
            <Input label="เป้าโทร (ครั้ง)" type="number" value={salesForm.target_calls} onChange={e => setSalesForm({ ...salesForm, target_calls: Number(e.target.value) })} />
            <Input label="เป้าเยี่ยม (ครั้ง)" type="number" value={salesForm.target_visits} onChange={e => setSalesForm({ ...salesForm, target_visits: Number(e.target.value) })} />
            <Input label="เป้า Lead ใหม่" type="number" value={salesForm.target_leads} onChange={e => setSalesForm({ ...salesForm, target_leads: Number(e.target.value) })} />
            <Input label="เป้า Booking" type="number" value={salesForm.target_bookings} onChange={e => setSalesForm({ ...salesForm, target_bookings: Number(e.target.value) })} />
            <Input label="เป้าปิดการขาย" type="number" value={salesForm.target_closed} onChange={e => setSalesForm({ ...salesForm, target_closed: Number(e.target.value) })} />
          </div>
        )}

        <div className="flex justify-between gap-3 mt-5">
          <button onClick={() => salesModalStep === 1 ? setSalesModalOpen(false) : setSalesModalStep(1)}
            className="px-4 py-2 text-sm transition-colors" style={{ color: 'var(--text-2)' }}
            onMouseEnter={e => (e.currentTarget.style.color = 'var(--text-1)')}
            onMouseLeave={e => (e.currentTarget.style.color = 'var(--text-2)')}>
            {salesModalStep === 1 ? 'ยกเลิก' : '← ย้อนกลับ'}
          </button>
          {salesModalStep === 1 ? (
            <button onClick={() => setSalesModalStep(2)} disabled={!salesForm.user_id}
              className="px-4 py-2 disabled:opacity-50 text-white text-sm rounded-lg transition-colors"
              style={{ background: 'var(--accent)' }}>
              ถัดไป →
            </button>
          ) : (
            <button onClick={saveSales} disabled={salesSaving}
              className="px-4 py-2 btn-primary disabled:opacity-50 text-white text-sm rounded-lg transition-colors">
              {salesSaving ? 'กำลังบันทึก...' : 'บันทึก'}
            </button>
          )}
        </div>
      </Modal>
    </div>
  )
}
