'use client'

import { useEffect, useState, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Plus, Target, Pencil, Building2, Users } from 'lucide-react'
import { PageSpinner, PageError } from '@/components/ui/StateUI'
import Modal from '@/components/ui/Modal'
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

interface User { id: string; name: string }
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
      { data: jobs },
      { data: hovs },
    ] = await Promise.all([
      supabase.from('org_targets').select('*').eq('year', filterYear).order('month'),
      supabase.from('sales_targets').select('*, users(name), projects(name)').eq('year', filterYear).order('month'),
      supabase.from('users').select('id,name').eq('active', true).order('name'),
      supabase.from('projects').select('id,name').order('name'),
      supabase.from('jobs').select('sales_id, revenue_ex_vat, order_date')
        .not('order_date', 'is', null).gte('order_date', `${filterYear}-01-01`).lte('order_date', `${filterYear}-12-31`),
      supabase.from('handovers').select('delivery_date, jobs(sales_id, revenue_ex_vat)')
        .not('delivery_date', 'is', null).gte('delivery_date', `${filterYear}-01-01`).lte('delivery_date', `${filterYear}-12-31`),
    ])

    if (e1 && !e1.message.includes('does not exist')) { setFetchError(e1.message); setLoading(false); return }
    if (e2 || e3) { setFetchError((e2 ?? e3)!.message); setLoading(false); return }

    setOrgTargets(ot || [])
    setSalesTargets(st || [])
    setUsers(u || [])
    setProjects(p || [])

    // Build by-user monthly actuals
    const salesByUser: Record<string, Record<number, number>> = {}
    const salesByMonth: Record<number, number> = {}
    for (const j of (jobs || [])) {
      if (!j.order_date) continue
      const m = parseInt(j.order_date.slice(5, 7))
      const val = j.revenue_ex_vat || 0
      salesByMonth[m] = (salesByMonth[m] || 0) + val
      if (j.sales_id) {
        if (!salesByUser[j.sales_id]) salesByUser[j.sales_id] = {}
        salesByUser[j.sales_id][m] = (salesByUser[j.sales_id][m] || 0) + val
      }
    }

    const delivByUser: Record<string, Record<number, number>> = {}
    const delivByMonth: Record<number, number> = {}
    for (const h of (hovs || [])) {
      const job = (h as any).jobs
      if (!job?.sales_id || !h.delivery_date) continue
      const m = parseInt(h.delivery_date.slice(5, 7))
      const val = job.revenue_ex_vat || 0
      delivByMonth[m] = (delivByMonth[m] || 0) + val
      if (!delivByUser[job.sales_id]) delivByUser[job.sales_id] = {}
      delivByUser[job.sales_id][m] = (delivByUser[job.sales_id][m] || 0) + val
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
    <div className="p-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-6 flex-wrap gap-3">
        <div>
          <h1 className="text-white text-xl font-bold">Sales Targets</h1>
          <p className="text-[#8b949e] text-sm mt-0.5">กำหนดและติดตามเป้าหมายการขาย</p>
        </div>
        <div className="flex gap-2">
          {tab === 'org' && (
            <button onClick={() => { setEditingOrg(null); setOrgForm({ ...emptyOrgForm, year: filterYear }); setOrgModalOpen(true) }}
              className="flex items-center gap-2 bg-[#238636] hover:bg-[#2ea043] text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors">
              <Plus size={16} />ตั้งเป้าองค์กร
            </button>
          )}
          {tab === 'sales' && (
            <button onClick={() => { setEditingSales(null); setSalesForm({ ...emptySalesForm, year: filterYear }); setSalesModalOpen(true) }}
              className="flex items-center gap-2 bg-[#238636] hover:bg-[#2ea043] text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors">
              <Plus size={16} />ตั้งเป้า Sales
            </button>
          )}
        </div>
      </div>

      {/* Tab + Period row */}
      <div className="flex items-center gap-3 mb-6 flex-wrap">
        {/* Tabs */}
        <div className="flex gap-1 rounded-xl p-1" style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid #30363d' }}>
          <button onClick={() => setTab('org')}
            className="flex items-center gap-1.5 px-4 py-1.5 rounded-lg text-xs font-semibold transition-colors"
            style={{ background: tab === 'org' ? '#f97316' : 'transparent', color: tab === 'org' ? '#fff' : '#8b949e' }}>
            <Building2 size={12} />เป้าองค์กร
          </button>
          <button onClick={() => setTab('sales')}
            className="flex items-center gap-1.5 px-4 py-1.5 rounded-lg text-xs font-semibold transition-colors"
            style={{ background: tab === 'sales' ? '#6366f1' : 'transparent', color: tab === 'sales' ? '#fff' : '#8b949e' }}>
            <Users size={12} />เป้า Sales
          </button>
        </div>

        {/* Period pills */}
        <div className="flex gap-1 rounded-xl p-1" style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid #30363d' }}>
          {(['month','quarter','year'] as ViewPeriod[]).map(p => (
            <button key={p} onClick={() => setViewPeriod(p)}
              className="px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors"
              style={{ background: viewPeriod === p ? (tab === 'org' ? '#f97316' : '#6366f1') : 'transparent', color: viewPeriod === p ? '#fff' : '#8b949e' }}>
              {p === 'month' ? 'เดือน' : p === 'quarter' ? 'ไตรมาส' : 'ปี'}
            </button>
          ))}
        </div>

        {/* Year */}
        <select value={filterYear} onChange={e => setFilterYear(Number(e.target.value))}
          className="bg-[#161b22] border border-[#30363d] rounded-lg px-3 py-2 text-white text-sm outline-none">
          {[thisYear - 1, thisYear, thisYear + 1].map(y => (
            <option key={y} value={y}>{y + 543} (พ.ศ.)</option>
          ))}
        </select>
        <span className="text-[#484f58] text-sm">{periodLabel}</span>
      </div>

      {loading ? (
        <div className="flex justify-center py-12">
          <div className="w-7 h-7 rounded-full border-2 border-t-transparent animate-spin" style={{ borderColor: '#f97316', borderTopColor: 'transparent' }} />
        </div>
      ) : fetchError ? (
        <PageError message={fetchError} onRetry={load} />
      ) : (
        <>
          {/* ══ ORG TARGETS TAB ══════════════════════════════ */}
          {tab === 'org' && (
            <div className="space-y-6">
              {/* Annual Summary Card */}
              <div className="rounded-xl p-5" style={{ background: 'rgba(249,115,22,0.07)', border: '1px solid rgba(249,115,22,0.25)' }}>
                <div className="flex items-center gap-2 mb-4">
                  <Building2 size={16} className="text-orange-400" />
                  <h2 className="text-orange-400 font-bold text-sm uppercase tracking-wider">สรุปเป้าองค์กร ปี {filterYear + 543}</h2>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <p className="text-[#8b949e] text-xs mb-1">เป้ายอดขายรวมทั้งปี</p>
                    <p className="text-emerald-400 font-bold text-xl">{f(orgAllSales)}</p>
                    <p className="text-[#484f58] text-xs mt-0.5">จริง ({periodLabel}): <span className="text-white">{f(orgActualSales)}</span></p>
                  </div>
                  <div>
                    <p className="text-[#8b949e] text-xs mb-1">เป้าส่งมอบรวมทั้งปี</p>
                    <p className="text-blue-400 font-bold text-xl">{f(orgAllDeliv)}</p>
                    <p className="text-[#484f58] text-xs mt-0.5">จริง ({periodLabel}): <span className="text-white">{f(orgActualDeliv)}</span></p>
                  </div>
                </div>
                {/* Period breakdown progress */}
                {(orgTotalSales > 0 || orgTotalDeliv > 0) && (
                  <div className="mt-4 pt-4 border-t border-orange-500/20 grid grid-cols-2 gap-4">
                    <div>
                      <div className="flex justify-between text-xs mb-1">
                        <span className="text-[#8b949e]">เป้า{periodLabel}</span>
                        <span className="text-emerald-400">{pct(orgActualSales, orgTotalSales)}%</span>
                      </div>
                      <ProgressBar value={orgActualSales} max={orgTotalSales} color="#34d399" />
                      <p className="text-[#484f58] text-[10px] mt-0.5">เป้า {f(orgTotalSales)}</p>
                    </div>
                    <div>
                      <div className="flex justify-between text-xs mb-1">
                        <span className="text-[#8b949e]">ส่งมอบ{periodLabel}</span>
                        <span className="text-blue-400">{pct(orgActualDeliv, orgTotalDeliv)}%</span>
                      </div>
                      <ProgressBar value={orgActualDeliv} max={orgTotalDeliv} color="#60a5fa" />
                      <p className="text-[#484f58] text-[10px] mt-0.5">เป้า {f(orgTotalDeliv)}</p>
                    </div>
                  </div>
                )}
              </div>

              {/* Sales team vs Org gap */}
              {orgTotalSales > 0 && salesTeamSalesTarget > 0 && (
                <div className="rounded-xl p-4" style={{ background: '#161b22', border: '1px solid #30363d' }}>
                  <p className="text-[#8b949e] text-xs font-semibold mb-3">เปรียบเทียบเป้าองค์กร vs เป้าทีมขาย ({periodLabel})</p>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <p className="text-[#484f58] text-[10px]">ยอดขาย</p>
                      <div className="flex items-end gap-2">
                        <span className="text-orange-400 text-sm font-bold">{f(orgTotalSales)}</span>
                        <span className="text-[#484f58] text-xs">เป้าองค์กร</span>
                      </div>
                      <div className="flex items-end gap-2 mt-0.5">
                        <span className="text-indigo-400 text-sm font-bold">{f(salesTeamSalesTarget)}</span>
                        <span className="text-[#484f58] text-xs">เป้าทีม</span>
                      </div>
                      {salesTeamSalesTarget < orgTotalSales && (
                        <p className="text-red-400 text-[10px] mt-1">ขาด {f(orgTotalSales - salesTeamSalesTarget)}</p>
                      )}
                    </div>
                    <div>
                      <p className="text-[#484f58] text-[10px]">ส่งมอบ</p>
                      <div className="flex items-end gap-2">
                        <span className="text-orange-400 text-sm font-bold">{f(orgTotalDeliv)}</span>
                        <span className="text-[#484f58] text-xs">เป้าองค์กร</span>
                      </div>
                      <div className="flex items-end gap-2 mt-0.5">
                        <span className="text-indigo-400 text-sm font-bold">{f(salesTeamDelivTarget)}</span>
                        <span className="text-[#484f58] text-xs">เป้าทีม</span>
                      </div>
                      {salesTeamDelivTarget < orgTotalDeliv && (
                        <p className="text-red-400 text-[10px] mt-1">ขาด {f(orgTotalDeliv - salesTeamDelivTarget)}</p>
                      )}
                    </div>
                  </div>
                </div>
              )}

              {/* Monthly breakdown table */}
              <div className="bg-[#161b22] border border-[#30363d] rounded-xl overflow-hidden">
                <div className="px-5 py-3 border-b border-[#30363d] flex justify-between items-center">
                  <h3 className="text-white font-medium text-sm">เป้ารายเดือน ปี {filterYear + 543}</h3>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead>
                      <tr className="border-b border-[#21262d]">
                        {['เดือน','เป้ายอดขาย','จริง (ขาย)','%','เป้าส่งมอบ','จริง (ส่งมอบ)','%',''].map((h, i) => (
                          <th key={i} className={`py-2 px-4 text-[#8b949e] text-xs font-medium ${i === 0 ? 'text-left' : 'text-right'}`}>{h}</th>
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
                          <tr key={m} className={`border-b border-[#21262d] hover:bg-[#1c2128] ${isCurrentMonth ? 'bg-[#1a1f28]' : ''}`}>
                            <td className="py-2.5 px-4 text-sm">
                              <span className={isCurrentMonth ? 'text-orange-400 font-bold' : 'text-[#c9d1d9]'}>
                                {MONTHS_FULL[m - 1]}
                              </span>
                            </td>
                            <td className="py-2.5 px-4 text-right text-sm text-emerald-400">{ot ? f(ot.target_sales_value) : <span className="text-[#484f58]">—</span>}</td>
                            <td className="py-2.5 px-4 text-right text-sm text-white">{actS > 0 ? f(actS) : <span className="text-[#484f58]">—</span>}</td>
                            <td className="py-2.5 px-4 text-right text-xs">
                              {ot && ot.target_sales_value > 0 ? (
                                <span className={pct(actS, ot.target_sales_value) >= 100 ? 'text-emerald-400' : 'text-[#8b949e]'}>
                                  {pct(actS, ot.target_sales_value)}%
                                </span>
                              ) : <span className="text-[#484f58]">—</span>}
                            </td>
                            <td className="py-2.5 px-4 text-right text-sm text-blue-400">{ot ? f(ot.target_delivery_value) : <span className="text-[#484f58]">—</span>}</td>
                            <td className="py-2.5 px-4 text-right text-sm text-white">{actD > 0 ? f(actD) : <span className="text-[#484f58]">—</span>}</td>
                            <td className="py-2.5 px-4 text-right text-xs">
                              {ot && ot.target_delivery_value > 0 ? (
                                <span className={pct(actD, ot.target_delivery_value) >= 100 ? 'text-blue-400' : 'text-[#8b949e]'}>
                                  {pct(actD, ot.target_delivery_value)}%
                                </span>
                              ) : <span className="text-[#484f58]">—</span>}
                            </td>
                            <td className="py-2.5 px-4 text-right">
                              <button onClick={() => {
                                if (ot) { setEditingOrg(ot); setOrgForm({ year: ot.year, month: ot.month, target_sales_value: ot.target_sales_value, target_delivery_value: ot.target_delivery_value }) }
                                else setOrgForm({ year: filterYear, month: m, target_sales_value: 0, target_delivery_value: 0 })
                                setOrgModalOpen(true)
                              }} className="text-[#8b949e] hover:text-white transition-colors">
                                <Pencil size={12} />
                              </button>
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                    <tfoot>
                      <tr className="border-t-2 border-[#30363d]">
                        <td className="py-3 px-4 text-[#8b949e] text-xs font-semibold">รวมทั้งปี</td>
                        <td className="py-3 px-4 text-right text-emerald-400 font-bold text-sm">{f(orgAllSales)}</td>
                        <td className="py-3 px-4 text-right text-white font-bold text-sm">{f(Object.values(actualSalesByMonth).reduce((s, v) => s + v, 0))}</td>
                        <td className="py-3 px-4 text-right text-xs text-[#8b949e]">
                          {orgAllSales > 0 ? `${pct(Object.values(actualSalesByMonth).reduce((s, v) => s + v, 0), orgAllSales)}%` : '—'}
                        </td>
                        <td className="py-3 px-4 text-right text-blue-400 font-bold text-sm">{f(orgAllDeliv)}</td>
                        <td className="py-3 px-4 text-right text-white font-bold text-sm">{f(Object.values(actualDelivByMonth).reduce((s, v) => s + v, 0))}</td>
                        <td className="py-3 px-4 text-right text-xs text-[#8b949e]">
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

          {/* ══ SALES TARGETS TAB ═══════════════════════════ */}
          {tab === 'sales' && (
            <div className="space-y-4">
              {grouped.length === 0 ? (
                <div className="text-center py-16 bg-[#161b22] border border-[#30363d] rounded-xl">
                  <Target size={32} className="mx-auto text-[#484f58] mb-2" />
                  <p className="text-[#8b949e] text-sm">ยังไม่มีเป้าหมายสำหรับช่วงนี้</p>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                  {grouped.map(t => {
                    const actS = getUserActual(t.user_id, 'sales')
                    const actD = getUserActual(t.user_id, 'deliv')
                    return (
                      <div key={t.user_id} className="bg-[#161b22] border border-[#30363d] rounded-xl p-4">
                        <div className="flex items-center justify-between mb-4">
                          <div className="flex items-center gap-2">
                            <div className="w-8 h-8 rounded-full flex items-center justify-center" style={{ background: '#21262d' }}>
                              <span className="text-white text-sm font-bold">{t.users?.name?.[0] || '?'}</span>
                            </div>
                            <div>
                              <p className="text-white text-sm font-semibold">{t.users?.name || '-'}</p>
                              {t.projects?.name && <p className="text-[#484f58] text-xs">{t.projects.name}</p>}
                            </div>
                          </div>
                          <button onClick={() => {
                            const r = filteredSales.find(r => r.user_id === t.user_id)
                            if (r) {
                              setEditingSales(r)
                              setSalesForm({ user_id: r.user_id, project_id: r.project_id || '', year: r.year, month: r.month, target_calls: r.target_calls, target_visits: r.target_visits, target_leads: r.target_leads, target_bookings: r.target_bookings, target_booking_value: r.target_booking_value, target_closed: r.target_closed, target_sales_value: r.target_sales_value || 0, target_delivery_value: r.target_delivery_value || 0 })
                              setSalesModalOpen(true)
                            }
                          }} className="text-[#8b949e] hover:text-white transition-colors p-1">
                            <Pencil size={14} />
                          </button>
                        </div>

                        <div className="grid grid-cols-2 gap-2 mb-3">
                          <div className="bg-[#0d1117] rounded-xl p-3">
                            <p className="text-[#484f58] text-[10px] mb-1">เป้ายอดขาย</p>
                            <p className="text-emerald-400 font-bold text-base">{f(t.target_sales_value)}</p>
                            <p className="text-[#484f58] text-[10px] mt-1">จริง <span className="text-white">{f(actS)}</span></p>
                            <ProgressBar value={actS} max={t.target_sales_value} color="#34d399" />
                            <p className="text-emerald-400 text-[10px] mt-0.5 text-right">{pct(actS, t.target_sales_value)}%</p>
                          </div>
                          <div className="bg-[#0d1117] rounded-xl p-3">
                            <p className="text-[#484f58] text-[10px] mb-1">เป้าส่งมอบ</p>
                            <p className="text-blue-400 font-bold text-base">{f(t.target_delivery_value)}</p>
                            <p className="text-[#484f58] text-[10px] mt-1">จริง <span className="text-white">{f(actD)}</span></p>
                            <ProgressBar value={actD} max={t.target_delivery_value} color="#60a5fa" />
                            <p className="text-blue-400 text-[10px] mt-0.5 text-right">{pct(actD, t.target_delivery_value)}%</p>
                          </div>
                        </div>

                        <div className="grid grid-cols-3 gap-2">
                          {[
                            { label: 'โทร', v: t.target_calls, c: '#fbbf24' },
                            { label: 'เยี่ยม', v: t.target_visits, c: '#fbbf24' },
                            { label: 'Lead', v: t.target_leads, c: '#a78bfa' },
                            { label: 'Booking', v: t.target_bookings, c: '#f472b6' },
                            { label: 'ปิดขาย', v: t.target_closed, c: '#34d399' },
                            { label: 'BK Value', v: null, d: f(t.target_booking_value), c: '#fb923c' },
                          ].map(item => (
                            <div key={item.label} className="bg-[#0d1117] rounded-lg p-2">
                              <p className="text-[#484f58] text-[10px]">{item.label}</p>
                              <p className="text-xs font-medium mt-0.5" style={{ color: item.c }}>{item.d ?? item.v}</p>
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
          <button onClick={() => setOrgModalOpen(false)} className="px-4 py-2 text-[#8b949e] hover:text-white text-sm transition-colors">ยกเลิก</button>
          <button onClick={saveOrg} disabled={orgSaving} className="px-4 py-2 bg-[#238636] hover:bg-[#2ea043] disabled:opacity-50 text-white text-sm rounded-lg transition-colors">
            {orgSaving ? 'กำลังบันทึก...' : 'บันทึก'}
          </button>
        </div>
      </Modal>

      {/* ── Sales Target Modal ────────────────────────── */}
      <Modal open={salesModalOpen} onClose={() => setSalesModalOpen(false)} title={editingSales ? 'แก้ไขเป้าหมาย Sales' : 'ตั้งเป้าหมาย Sales'}>
        <div className="grid grid-cols-2 gap-4">
          <Select label="Sales *" value={salesForm.user_id} onChange={e => setSalesForm({ ...salesForm, user_id: e.target.value })} options={userOptions} />
          <Select label="โครงการ" value={salesForm.project_id} onChange={e => setSalesForm({ ...salesForm, project_id: e.target.value })} options={projOptions} />
          <Select label="ปี" value={String(salesForm.year)} onChange={e => setSalesForm({ ...salesForm, year: Number(e.target.value) })} options={yearOptions} />
          <Select label="เดือน" value={String(salesForm.month)} onChange={e => setSalesForm({ ...salesForm, month: Number(e.target.value) })} options={monthOptions} />
          <div className="col-span-2 border-t border-[#30363d] pt-3">
            <p className="text-[#8b949e] text-xs font-semibold mb-2">เป้ายอดเงิน</p>
          </div>
          <Input label="เป้ายอดขาย (บาท)" type="number" value={salesForm.target_sales_value} onChange={e => setSalesForm({ ...salesForm, target_sales_value: Number(e.target.value) })} />
          <Input label="เป้าส่งมอบ (บาท)" type="number" value={salesForm.target_delivery_value} onChange={e => setSalesForm({ ...salesForm, target_delivery_value: Number(e.target.value) })} />
          <Input label="เป้า Booking Value (บาท)" type="number" value={salesForm.target_booking_value} onChange={e => setSalesForm({ ...salesForm, target_booking_value: Number(e.target.value) })} />
          <div className="col-span-2 border-t border-[#30363d] pt-3">
            <p className="text-[#8b949e] text-xs font-semibold mb-2">เป้ากิจกรรม</p>
          </div>
          <Input label="เป้าโทร (ครั้ง)" type="number" value={salesForm.target_calls} onChange={e => setSalesForm({ ...salesForm, target_calls: Number(e.target.value) })} />
          <Input label="เป้าเยี่ยม (ครั้ง)" type="number" value={salesForm.target_visits} onChange={e => setSalesForm({ ...salesForm, target_visits: Number(e.target.value) })} />
          <Input label="เป้า Lead ใหม่" type="number" value={salesForm.target_leads} onChange={e => setSalesForm({ ...salesForm, target_leads: Number(e.target.value) })} />
          <Input label="เป้า Booking" type="number" value={salesForm.target_bookings} onChange={e => setSalesForm({ ...salesForm, target_booking_value: Number(e.target.value) })} />
          <Input label="เป้าปิดการขาย" type="number" value={salesForm.target_closed} onChange={e => setSalesForm({ ...salesForm, target_closed: Number(e.target.value) })} />
        </div>
        <div className="flex justify-end gap-3 mt-5">
          <button onClick={() => setSalesModalOpen(false)} className="px-4 py-2 text-[#8b949e] hover:text-white text-sm transition-colors">ยกเลิก</button>
          <button onClick={saveSales} disabled={salesSaving || !salesForm.user_id} className="px-4 py-2 bg-[#238636] hover:bg-[#2ea043] disabled:opacity-50 text-white text-sm rounded-lg transition-colors">
            {salesSaving ? 'กำลังบันทึก...' : 'บันทึก'}
          </button>
        </div>
      </Modal>
    </div>
  )
}
