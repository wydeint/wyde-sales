'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { BarChart3, TrendingUp, Users, DollarSign } from 'lucide-react'
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
  name: string
  total: number
  closed: number
  booking_value: number
  calls: number
  visits: number
}

const f = (v: number) => '฿' + (v || 0).toLocaleString()
const STATUS_LABEL: Record<string, string> = {
  new: 'ใหม่', interested: 'สนใจ', quoted: 'เสนอราคา',
  booked: 'จอง', close_pending: 'รอปิด', closed: 'ปิดแล้ว', lost: 'หลุด'
}

export default function ExecutivePage() {
  const supabase = createClient()
  const [customers, setCustomers] = useState<Customer[]>([])
  const [reports, setReports] = useState<DailyReport[]>([])
  const [loading, setLoading] = useState(true)
  const [fetchError, setFetchError] = useState('')
  const [period, setPeriod] = useState(30)

  useEffect(() => {
    async function load() {
      setLoading(true)
      setFetchError('')
      const cutoff = new Date()
      cutoff.setDate(cutoff.getDate() - period)
      const dateStr = cutoff.toISOString().slice(0, 10)

      const [{ data: c, error: e1 }, { data: r, error: e2 }] = await Promise.all([
        supabase.from('customers').select('*, users!customers_assigned_to_fkey(name), projects(name)'),
        supabase.from('daily_reports').select('*, users(name)').gte('date', dateStr).order('date', { ascending: false }),
      ])
      if (e1 || e2) { setFetchError((e1 ?? e2)!.message); setLoading(false); return }
      setCustomers(c || [])
      setReports(r || [])
      setLoading(false)
    }
    load()
  }, [period])

  // Pipeline funnel
  const pipelineOrder = ['new', 'interested', 'quoted', 'booked', 'close_pending', 'closed']
  const funnelData = pipelineOrder.map(s => ({
    status: s,
    label: STATUS_LABEL[s],
    count: customers.filter(c => c.status === s).length,
    value: customers.filter(c => c.status === s).reduce((sum, c) => sum + (c.budget || 0), 0)
  }))

  // Sales performance
  const salesMap: Record<string, SalesStat> = {}
  customers.forEach(c => {
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

  // KPI summary
  const totalBookingValue = reports.reduce((s, r) => s + (r.booking_value || 0), 0)
  const totalCalls = reports.reduce((s, r) => s + (r.calls || 0), 0)
  const totalVisits = reports.reduce((s, r) => s + (r.visits || 0), 0)
  const closedCount = customers.filter(c => c.status === 'closed').length
  const lostCount = customers.filter(c => c.status === 'lost').length

  // By project
  const projMap: Record<string, { name: string; total: number; closed: number; value: number }> = {}
  customers.forEach(c => {
    const name = (c as any).projects?.name || 'ไม่ระบุ'
    if (!projMap[name]) projMap[name] = { name, total: 0, closed: 0, value: 0 }
    projMap[name].total++
    if (c.status === 'closed') { projMap[name].closed++; projMap[name].value += c.budget || 0 }
  })
  const byProject = Object.values(projMap).sort((a, b) => b.value - a.value)

  if (loading) return <PageSpinner />
  if (fetchError) return <PageError message={fetchError} onRetry={() => { setLoading(true); setFetchError('') }} />

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-white text-xl font-bold">Executive Report</h1>
          <p className="text-[#8b949e] text-sm mt-0.5">ภาพรวมผลการดำเนินงาน</p>
        </div>
        <div className="flex gap-2">
          {[7, 30, 90].map(d => (
            <button key={d} onClick={() => setPeriod(d)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${period === d ? 'bg-orange-500/20 text-orange-400 border border-orange-500/30' : 'bg-[#161b22] text-[#8b949e] border border-[#30363d] hover:text-white'}`}>
              {d} วัน
            </button>
          ))}
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        <div className="bg-[#161b22] border border-[#30363d] rounded-xl p-4">
          <div className="flex items-center gap-2 mb-2">
            <Users size={14} className="text-[#8b949e]" />
            <p className="text-[#8b949e] text-xs">ลูกค้าทั้งหมด</p>
          </div>
          <p className="text-white text-2xl font-bold">{customers.length}</p>
          <p className="text-[#484f58] text-xs mt-1">ปิดแล้ว {closedCount} | หลุด {lostCount}</p>
        </div>
        <div className="bg-[#161b22] border border-[#30363d] rounded-xl p-4">
          <div className="flex items-center gap-2 mb-2">
            <DollarSign size={14} className="text-[#8b949e]" />
            <p className="text-[#8b949e] text-xs">Booking Value ({period}ว.)</p>
          </div>
          <p className="text-green-400 text-2xl font-bold">{f(totalBookingValue)}</p>
        </div>
        <div className="bg-[#161b22] border border-[#30363d] rounded-xl p-4">
          <div className="flex items-center gap-2 mb-2">
            <TrendingUp size={14} className="text-[#8b949e]" />
            <p className="text-[#8b949e] text-xs">โทรหาลูกค้า ({period}ว.)</p>
          </div>
          <p className="text-blue-400 text-2xl font-bold">{totalCalls.toLocaleString()}</p>
          <p className="text-[#484f58] text-xs mt-1">เยี่ยม {totalVisits} ครั้ง</p>
        </div>
        <div className="bg-[#161b22] border border-[#30363d] rounded-xl p-4">
          <div className="flex items-center gap-2 mb-2">
            <BarChart3 size={14} className="text-[#8b949e]" />
            <p className="text-[#8b949e] text-xs">Conversion Rate</p>
          </div>
          <p className="text-orange-400 text-2xl font-bold">
            {customers.length > 0 ? Math.round(closedCount / customers.length * 100) : 0}%
          </p>
          <p className="text-[#484f58] text-xs mt-1">{closedCount} จาก {customers.length} ราย</p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
        {/* Pipeline Funnel */}
        <div className="bg-[#161b22] border border-[#30363d] rounded-xl p-5">
          <h2 className="text-white font-medium mb-4">Pipeline Funnel</h2>
          <div className="space-y-2">
            {funnelData.map((s, i) => {
              const maxCount = Math.max(...funnelData.map(x => x.count), 1)
              const width = s.count > 0 ? Math.max(s.count / maxCount * 100, 5) : 0
              const colors = ['bg-blue-400', 'bg-cyan-400', 'bg-yellow-400', 'bg-orange-400', 'bg-purple-400', 'bg-green-400']
              return (
                <div key={s.status}>
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-[#8b949e] text-xs">{s.label}</span>
                    <div className="text-right">
                      <span className="text-white text-xs font-medium">{s.count}</span>
                      {s.value > 0 && <span className="text-[#484f58] text-xs ml-2">{f(s.value)}</span>}
                    </div>
                  </div>
                  <div className="h-2 bg-[#21262d] rounded-full overflow-hidden">
                    <div className={`h-full rounded-full ${colors[i]} transition-all duration-500`} style={{ width: width + '%' }} />
                  </div>
                </div>
              )
            })}
          </div>
        </div>

        {/* By Project */}
        <div className="bg-[#161b22] border border-[#30363d] rounded-xl p-5">
          <h2 className="text-white font-medium mb-4">ยอดขายตามโครงการ</h2>
          <div className="space-y-3">
            {byProject.map(p => (
              <div key={p.name} className="flex items-center justify-between">
                <div>
                  <p className="text-white text-sm">{p.name}</p>
                  <p className="text-[#484f58] text-xs">{p.total} ราย | ปิด {p.closed}</p>
                </div>
                <p className="text-green-400 text-sm font-medium">{f(p.value)}</p>
              </div>
            ))}
            {byProject.length === 0 && <p className="text-[#484f58] text-sm text-center py-4">ไม่มีข้อมูล</p>}
          </div>
        </div>
      </div>

      {/* Sales Ranking */}
      <div className="bg-[#161b22] border border-[#30363d] rounded-xl p-5">
        <h2 className="text-white font-medium mb-4">Sales Ranking</h2>
        <table className="w-full">
          <thead>
            <tr className="border-b border-[#21262d]">
              <th className="text-left py-2 text-[#8b949e] text-xs">#</th>
              <th className="text-left py-2 text-[#8b949e] text-xs">Sales</th>
              <th className="text-center py-2 text-[#8b949e] text-xs">ลูกค้าทั้งหมด</th>
              <th className="text-center py-2 text-[#8b949e] text-xs">ปิดแล้ว</th>
              <th className="text-center py-2 text-[#8b949e] text-xs">โทร ({period}ว.)</th>
              <th className="text-center py-2 text-[#8b949e] text-xs">เยี่ยม ({period}ว.)</th>
              <th className="text-right py-2 text-[#8b949e] text-xs">Booking Value</th>
            </tr>
          </thead>
          <tbody>
            {salesRanking.map((s, i) => (
              <tr key={s.name} className="border-b border-[#21262d] hover:bg-[#1c2128]">
                <td className="py-3 pr-4">
                  <span className={`text-sm font-bold ${i === 0 ? 'text-yellow-400' : i === 1 ? 'text-gray-300' : i === 2 ? 'text-orange-400' : 'text-[#484f58]'}`}>
                    #{i + 1}
                  </span>
                </td>
                <td className="py-3">
                  <div className="flex items-center gap-2">
                    <div className="w-6 h-6 rounded-full bg-[#30363d] flex items-center justify-center">
                      <span className="text-white text-xs">{s.name[0]}</span>
                    </div>
                    <span className="text-white text-sm">{s.name}</span>
                  </div>
                </td>
                <td className="py-3 text-center text-[#c9d1d9] text-sm">{s.total}</td>
                <td className="py-3 text-center text-green-400 text-sm font-medium">{s.closed}</td>
                <td className="py-3 text-center text-[#c9d1d9] text-sm">{s.calls}</td>
                <td className="py-3 text-center text-[#c9d1d9] text-sm">{s.visits}</td>
                <td className="py-3 text-right text-green-400 text-sm font-medium">{f(s.booking_value)}</td>
              </tr>
            ))}
            {salesRanking.length === 0 && (
              <tr><td colSpan={7} className="py-8 text-center text-[#484f58] text-sm">ไม่มีข้อมูล</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
