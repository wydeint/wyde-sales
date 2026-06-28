'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { BarChart3, TrendingUp, Users, DollarSign, Target } from 'lucide-react'
import { PageSpinner, PageError } from '@/components/ui/StateUI'

interface Customer {
  id: string; status: string; budget: number; project_id: string
  assigned_to: string; created_at: string
  users?: { name: string }
  projects?: { name: string }
}

interface DailyReport {
  id: string; date: string; sales_person_id: string
  calls: number; visits: number; follow_ups: number
  quotation_value: number; booking_value: number; revenue: number
  users?: { name: string }
}

interface SalesStat {
  name: string; total: number; closed: number
  booking_value: number; calls: number; visits: number
}

type Period = 'week' | 'month' | 'quarter' | 'year'

const f = (v: number) => '฿' + (v || 0).toLocaleString()
const pct = (a: number, b: number) => b > 0 ? Math.round(a / b * 100) : 0

const STATUS_LABEL: Record<string, string> = {
  new: 'ใหม่', interested: 'สนใจ', quoted: 'เสนอราคา',
  booked: 'จอง', close_pending: 'รอปิด', closed: 'ปิดแล้ว', lost: 'หลุด'
}
const MONTHS_TH = ['ม.ค.','ก.พ.','มี.ค.','เม.ย.','พ.ค.','มิ.ย.','ก.ค.','ส.ค.','ก.ย.','ต.ค.','พ.ย.','ธ.ค.']

function getPeriodRange(p: Period): { start: string; end: string; label: string } {
  const now = new Date()
  const y = now.getFullYear(), m = now.getMonth(), d = now.getDate()
  if (p === 'week') {
    const dow = now.getDay() === 0 ? 6 : now.getDay() - 1
    const mon = new Date(y, m, d - dow)
    const sun = new Date(y, m, d - dow + 6)
    return {
      start: mon.toISOString().slice(0, 10),
      end: sun.toISOString().slice(0, 10),
      label: `${mon.getDate()} ${MONTHS_TH[mon.getMonth()]} – ${sun.getDate()} ${MONTHS_TH[sun.getMonth()]}`
    }
  }
  if (p === 'month') {
    const last = new Date(y, m + 1, 0)
    return {
      start: `${y}-${String(m + 1).padStart(2, '0')}-01`,
      end: last.toISOString().slice(0, 10),
      label: `${MONTHS_TH[m]} ${y + 543}`
    }
  }
  if (p === 'quarter') {
    const q = Math.floor(m / 3)
    const qs = new Date(y, q * 3, 1)
    const qe = new Date(y, q * 3 + 3, 0)
    return {
      start: qs.toISOString().slice(0, 10),
      end: qe.toISOString().slice(0, 10),
      label: `Q${q + 1}/${y + 543}`
    }
  }
  return {
    start: `${y}-01-01`,
    end: `${y}-12-31`,
    label: `ปี ${y + 543}`
  }
}

export default function ExecutivePage() {
  const supabase = createClient()
  const [customers, setCustomers] = useState<Customer[]>([])
  const [periodCustomers, setPeriodCustomers] = useState<Customer[]>([])
  const [reports, setReports] = useState<DailyReport[]>([])
  const [orgTarget, setOrgTarget] = useState<{ sales: number; delivery: number } | null>(null)
  const [loading, setLoading] = useState(true)
  const [fetchError, setFetchError] = useState('')
  const [period, setPeriod] = useState<Period>('month')

  const range = getPeriodRange(period)

  useEffect(() => {
    async function load() {
      setLoading(true)
      setFetchError('')

      const [
        { data: allC, error: e1 },
        { data: periodC, error: e2 },
        { data: r, error: e3 },
        { data: ot },
      ] = await Promise.all([
        supabase.from('customers').select('*, users!customers_assigned_to_fkey(name), projects(name)'),
        supabase.from('customers').select('*, users!customers_assigned_to_fkey(name), projects(name)')
          .gte('created_at', range.start).lte('created_at', range.end + 'T23:59:59'),
        supabase.from('daily_reports').select('*, users(name)')
          .gte('date', range.start).lte('date', range.end).order('date', { ascending: false }),
        supabase.from('org_targets').select('target_sales_value, target_delivery_value, year, month')
          .eq('year', new Date().getFullYear()).limit(12),
      ])
      if (e1 || e2 || e3) { setFetchError((e1 ?? e2 ?? e3)!.message); setLoading(false); return }
      setCustomers(allC || [])
      setPeriodCustomers(periodC || [])
      setReports(r || [])

      // Aggregate org target for current period
      if (ot && ot.length > 0) {
        const now = new Date()
        const m = now.getMonth() + 1
        const q = Math.floor((m - 1) / 3)
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
  }, [period])

  // Pipeline funnel (all customers)
  const pipelineOrder = ['new', 'interested', 'quoted', 'booked', 'close_pending', 'closed']
  const funnelData = pipelineOrder.map(s => ({
    status: s, label: STATUS_LABEL[s],
    count: customers.filter(c => c.status === s).length,
    value: customers.filter(c => c.status === s).reduce((sum, c) => sum + (c.budget || 0), 0)
  }))

  // Sales performance based on period
  const salesMap: Record<string, SalesStat> = {}
  periodCustomers.forEach(c => {
    const name = (c as any).users?.name || 'ไม่ระบุ'
    if (!salesMap[name]) salesMap[name] = { name, total: 0, closed: 0, booking_value: 0, calls: 0, visits: 0 }
    salesMap[name].total++
    if (c.status === 'closed') { salesMap[name].closed++; salesMap[name].booking_value += c.budget || 0 }
  })
  reports.forEach(r => {
    const name = (r as any).users?.name || 'ไม่ระบุ'
    if (!salesMap[name]) salesMap[name] = { name, total: 0, closed: 0, booking_value: 0, calls: 0, visits: 0 }
    salesMap[name].calls += r.calls || 0
    salesMap[name].visits += r.visits || 0
  })
  const salesRanking = Object.values(salesMap).sort((a, b) => b.closed - a.closed || b.booking_value - a.booking_value)

  // KPI
  const totalBookingValue = reports.reduce((s, r) => s + (r.booking_value || 0), 0)
  const totalCalls = reports.reduce((s, r) => s + (r.calls || 0), 0)
  const totalVisits = reports.reduce((s, r) => s + (r.visits || 0), 0)
  const newCustomers = periodCustomers.length
  const closedCount = customers.filter(c => c.status === 'closed').length
  const lostCount = customers.filter(c => c.status === 'lost').length

  // By project (period)
  const projMap: Record<string, { name: string; total: number; closed: number; value: number }> = {}
  periodCustomers.forEach(c => {
    const name = (c as any).projects?.name || 'ไม่ระบุ'
    if (!projMap[name]) projMap[name] = { name, total: 0, closed: 0, value: 0 }
    projMap[name].total++
    if (c.status === 'closed') { projMap[name].closed++; projMap[name].value += c.budget || 0 }
  })
  const byProject = Object.values(projMap).sort((a, b) => b.value - a.value)

  if (loading) return <PageSpinner />
  if (fetchError) return <PageError message={fetchError} onRetry={() => { setLoading(true); setFetchError('') }} />

  const PERIODS: { key: Period; label: string }[] = [
    { key: 'week', label: 'สัปดาห์' },
    { key: 'month', label: 'เดือน' },
    { key: 'quarter', label: 'ไตรมาส' },
    { key: 'year', label: 'ปี' },
  ]

  return (
    <div className="p-6">
      {/* Header + Period Selector */}
      <div className="flex items-center justify-between mb-6 flex-wrap gap-3">
        <div>
          <h1 className="text-xl font-bold" style={{ color: 'var(--text-1)' }}>Executive Report</h1>
          <p className="text-sm mt-0.5" style={{ color: 'var(--text-2)' }}>{range.label}</p>
        </div>
        <div className="flex gap-1 rounded-xl p-1" style={{ background: 'var(--hover-bg)', border: '1px solid var(--divider)' }}>
          {PERIODS.map(p => (
            <button key={p.key} onClick={() => setPeriod(p.key)}
              className="px-4 py-1.5 rounded-lg text-xs font-semibold transition-colors"
              style={{ background: period === p.key ? '#f97316' : 'transparent', color: period === p.key ? '#fff' : 'var(--text-3)' }}>
              {p.label}
            </button>
          ))}
        </div>
      </div>

      {/* Org Target Banner (if set) */}
      {orgTarget && (
        <div className="mb-6 rounded-xl p-4 flex gap-6 flex-wrap" style={{ background: 'rgba(249,115,22,0.08)', border: '1px solid rgba(249,115,22,0.25)' }}>
          <div className="flex items-center gap-2">
            <Target size={14} className="text-orange-400" />
            <span className="text-orange-400 text-xs font-bold uppercase tracking-wider">เป้าองค์กร {range.label}</span>
          </div>
          <div className="flex gap-6">
            <div>
              <p className="text-[10px]" style={{ color: 'var(--text-2)' }}>เป้ายอดขาย</p>
              <p className="text-emerald-400 font-bold text-sm">{f(orgTarget.sales)}</p>
              <div className="mt-1 h-1.5 w-36 rounded-full bg-white/10">
                <div className="h-1.5 rounded-full bg-emerald-400 transition-all" style={{ width: `${Math.min(pct(totalBookingValue, orgTarget.sales), 100)}%` }} />
              </div>
              <p className="text-[10px] mt-0.5" style={{ color: 'var(--text-3)' }}>จริง {f(totalBookingValue)} ({pct(totalBookingValue, orgTarget.sales)}%)</p>
            </div>
            <div>
              <p className="text-[10px]" style={{ color: 'var(--text-2)' }}>เป้าส่งมอบ</p>
              <p className="text-blue-400 font-bold text-sm">{f(orgTarget.delivery)}</p>
            </div>
          </div>
        </div>
      )}

      {/* KPI Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        {[
          { icon: <Users size={14} />, label: `ลูกค้าใหม่ (${range.label})`, value: newCustomers, sub: `ปิดแล้ว ${closedCount} | หลุด ${lostCount}`, color: '' },
          { icon: <DollarSign size={14} />, label: 'Booking Value', value: f(totalBookingValue), color: 'text-green-400' },
          { icon: <TrendingUp size={14} />, label: 'โทรหาลูกค้า', value: totalCalls.toLocaleString(), sub: `เยี่ยม ${totalVisits} ครั้ง`, color: 'text-blue-400' },
          { icon: <BarChart3 size={14} />, label: 'Conversion Rate', value: `${pct(closedCount, customers.length)}%`, sub: `${closedCount} จาก ${customers.length} ราย`, color: 'text-orange-400' },
        ].map((k, i) => (
          <div key={i} className="rounded-xl p-4" style={{ background: 'var(--card-bg)', border: '1px solid var(--divider)' }}>
            <div className="flex items-center gap-2 mb-2" style={{ color: 'var(--text-2)' }}>{k.icon}<p className="text-xs">{k.label}</p></div>
            <p className={`text-2xl font-bold ${k.color}`} style={!k.color ? { color: 'var(--text-1)' } : undefined}>{k.value}</p>
            {k.sub && <p className="text-xs mt-1" style={{ color: 'var(--text-3)' }}>{k.sub}</p>}
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
        {/* Pipeline Funnel (all customers) */}
        <div className="rounded-xl p-5" style={{ background: 'var(--card-bg)', border: '1px solid var(--divider)' }}>
          <h2 className="font-medium mb-1" style={{ color: 'var(--text-1)' }}>Pipeline Funnel</h2>
          <p className="text-xs mb-4" style={{ color: 'var(--text-3)' }}>สถานะลูกค้าทั้งหมดในระบบ</p>
          <div className="space-y-2">
            {funnelData.map((s, i) => {
              const maxCount = Math.max(...funnelData.map(x => x.count), 1)
              const width = s.count > 0 ? Math.max(s.count / maxCount * 100, 5) : 0
              const colors = ['bg-blue-400', 'bg-cyan-400', 'bg-yellow-400', 'bg-orange-400', 'bg-purple-400', 'bg-green-400']
              return (
                <div key={s.status}>
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-xs" style={{ color: 'var(--text-2)' }}>{s.label}</span>
                    <div className="text-right">
                      <span className="text-xs font-medium" style={{ color: 'var(--text-1)' }}>{s.count}</span>
                      {s.value > 0 && <span className="text-xs ml-2" style={{ color: 'var(--text-3)' }}>{f(s.value)}</span>}
                    </div>
                  </div>
                  <div className="h-2 rounded-full overflow-hidden" style={{ background: 'var(--hover-bg)' }}>
                    <div className={`h-full rounded-full ${colors[i]} transition-all duration-500`} style={{ width: width + '%' }} />
                  </div>
                </div>
              )
            })}
          </div>
        </div>

        {/* By Project (period) */}
        <div className="rounded-xl p-5" style={{ background: 'var(--card-bg)', border: '1px solid var(--divider)' }}>
          <h2 className="font-medium mb-1" style={{ color: 'var(--text-1)' }}>ยอดขายตามโครงการ</h2>
          <p className="text-xs mb-4" style={{ color: 'var(--text-3)' }}>{range.label}</p>
          <div className="space-y-3">
            {byProject.map(p => (
              <div key={p.name} className="flex items-center justify-between">
                <div>
                  <p className="text-sm" style={{ color: 'var(--text-1)' }}>{p.name}</p>
                  <p className="text-xs" style={{ color: 'var(--text-3)' }}>{p.total} ราย | ปิด {p.closed}</p>
                </div>
                <p className="text-green-400 text-sm font-medium">{f(p.value)}</p>
              </div>
            ))}
            {byProject.length === 0 && <p className="text-sm text-center py-4" style={{ color: 'var(--text-3)' }}>ไม่มีข้อมูล</p>}
          </div>
        </div>
      </div>

      {/* Sales Ranking */}
      <div className="rounded-xl p-5" style={{ background: 'var(--card-bg)', border: '1px solid var(--divider)' }}>
        <h2 className="font-medium mb-1" style={{ color: 'var(--text-1)' }}>Sales Ranking</h2>
        <p className="text-xs mb-4" style={{ color: 'var(--text-3)' }}>{range.label}</p>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr style={{ borderBottom: '1px solid var(--divider)' }}>
                {['#','Sales','ลูกค้าใหม่','ปิดแล้ว','โทร','เยี่ยม','Booking Value'].map((h, i) => (
                  <th key={h} className={`py-2 text-xs ${i > 1 ? 'text-center' : 'text-left'} ${i === 6 ? 'text-right' : ''}`} style={{ color: 'var(--text-2)' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {salesRanking.map((s, i) => (
                <tr key={s.name} style={{ borderBottom: '1px solid var(--divider)' }}
                  onMouseEnter={e => (e.currentTarget.style.background = 'var(--hover-bg)')}
                  onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}>
                  <td className="py-3 pr-4">
                    <span className={`text-sm font-bold ${i === 0 ? 'text-yellow-400' : i === 2 ? 'text-orange-400' : ''}`}
                      style={i === 1 ? { color: 'var(--text-2)' } : i > 2 ? { color: 'var(--text-3)' } : undefined}>#{i + 1}</span>
                  </td>
                  <td className="py-3">
                    <div className="flex items-center gap-2">
                      <div className="w-6 h-6 rounded-full flex items-center justify-center" style={{ background: 'var(--hover-bg)', border: '1px solid var(--divider)' }}>
                        <span className="text-xs" style={{ color: 'var(--text-1)' }}>{s.name[0]}</span>
                      </div>
                      <span className="text-sm" style={{ color: 'var(--text-1)' }}>{s.name}</span>
                    </div>
                  </td>
                  <td className="py-3 text-center text-sm" style={{ color: 'var(--text-1)' }}>{s.total}</td>
                  <td className="py-3 text-center text-green-400 text-sm font-medium">{s.closed}</td>
                  <td className="py-3 text-center text-sm" style={{ color: 'var(--text-1)' }}>{s.calls}</td>
                  <td className="py-3 text-center text-sm" style={{ color: 'var(--text-1)' }}>{s.visits}</td>
                  <td className="py-3 text-right text-green-400 text-sm font-medium">{f(s.booking_value)}</td>
                </tr>
              ))}
              {salesRanking.length === 0 && (
                <tr><td colSpan={7} className="py-8 text-center text-sm" style={{ color: 'var(--text-3)' }}>ไม่มีข้อมูลในช่วงนี้</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
