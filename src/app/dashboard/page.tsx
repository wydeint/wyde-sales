'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Users, TrendingUp, PhoneCall, CalendarDays } from 'lucide-react'

interface KPI {
  totalCustomers: number
  newThisMonth: number
  closedThisMonth: number
  bookingValue: number
  callsThisWeek: number
  visitsThisWeek: number
  pipelineValue: number
  lostCount: number
}

const STATUS_LABEL: Record<string, string> = {
  new: 'ใหม่', interested: 'สนใจ', quoted: 'เสนอราคา',
  booked: 'จอง', close_pending: 'รอปิด', closed: 'ปิดแล้ว', lost: 'หลุด'
}

const f = (v: number) => '฿' + (v || 0).toLocaleString()

export default function DashboardPage() {
  const supabase = createClient()
  const [kpi, setKpi] = useState<KPI | null>(null)
  const [pipeline, setPipeline] = useState<{ status: string; count: number; value: number }[]>([])
  const [recentReports, setRecentReports] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [userName, setUserName] = useState('')

  useEffect(() => {
    async function load() {
      const { data: { user } } = await supabase.auth.getUser()
      if (user) {
        const { data: u } = await supabase.from('users').select('name').eq('email', user.email!).single()
        if (u) setUserName(u.name)
      }

      const now = new Date()
      const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString()
      const weekStart = new Date(now.getTime() - 7 * 86400000).toISOString().slice(0, 10)

      const [{ data: customers }, { data: reports }] = await Promise.all([
        supabase.from('customers').select('status, budget, created_at'),
        supabase.from('daily_reports').select('*, users(name)').gte('date', weekStart).order('date', { ascending: false }).limit(14),
      ])

      const c = customers || []
      const r = reports || []

      const pipelineOrder = ['new', 'interested', 'quoted', 'booked', 'close_pending', 'closed']
      const pipelineData = pipelineOrder.map(s => ({
        status: s,
        count: c.filter(x => x.status === s).length,
        value: c.filter(x => x.status === s).reduce((sum, x) => sum + (x.budget || 0), 0)
      }))

      setKpi({
        totalCustomers: c.length,
        newThisMonth: c.filter(x => x.created_at >= monthStart).length,
        closedThisMonth: c.filter(x => x.status === 'closed' && x.created_at >= monthStart).length,
        bookingValue: r.reduce((s, x) => s + (x.booking_value || 0), 0),
        callsThisWeek: r.reduce((s, x) => s + (x.calls || 0), 0),
        visitsThisWeek: r.reduce((s, x) => s + (x.visits || 0), 0),
        pipelineValue: c.filter(x => !['closed', 'lost'].includes(x.status)).reduce((s, x) => s + (x.budget || 0), 0),
        lostCount: c.filter(x => x.status === 'lost').length,
      })
      setPipeline(pipelineData)
      setRecentReports(r)
      setLoading(false)
    }
    load()
  }, [])

  if (loading) return <div className="p-6 text-[#8b949e]">กำลังโหลด...</div>

  const pipelineMax = Math.max(...pipeline.map(p => p.count), 1)
  const pipelineColors = ['bg-blue-400', 'bg-cyan-400', 'bg-yellow-400', 'bg-orange-400', 'bg-purple-400', 'bg-green-400']

  return (
    <div className="p-6">
      <div className="mb-6">
        <h1 className="text-white text-xl font-bold">
          {userName ? `สวัสดีครับ คุณ${userName} 👋` : 'Dashboard'}
        </h1>
        <p className="text-[#8b949e] text-sm mt-0.5">
          {new Date().toLocaleDateString('th-TH', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
        </p>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        <div className="bg-[#161b22] border border-[#30363d] rounded-xl p-4">
          <div className="flex items-center gap-2 mb-2">
            <Users size={14} className="text-blue-400" />
            <p className="text-[#8b949e] text-xs">ลูกค้าทั้งหมด</p>
          </div>
          <p className="text-white text-2xl font-bold">{kpi?.totalCustomers}</p>
          <p className="text-[#484f58] text-xs mt-1">เพิ่มเดือนนี้ +{kpi?.newThisMonth}</p>
        </div>
        <div className="bg-[#161b22] border border-[#30363d] rounded-xl p-4">
          <div className="flex items-center gap-2 mb-2">
            <TrendingUp size={14} className="text-green-400" />
            <p className="text-[#8b949e] text-xs">ปิดได้เดือนนี้</p>
          </div>
          <p className="text-green-400 text-2xl font-bold">{kpi?.closedThisMonth}</p>
          <p className="text-[#484f58] text-xs mt-1">Pipeline {f(kpi?.pipelineValue || 0)}</p>
        </div>
        <div className="bg-[#161b22] border border-[#30363d] rounded-xl p-4">
          <div className="flex items-center gap-2 mb-2">
            <PhoneCall size={14} className="text-orange-400" />
            <p className="text-[#8b949e] text-xs">โทร 7 วันล่าสุด</p>
          </div>
          <p className="text-orange-400 text-2xl font-bold">{kpi?.callsThisWeek}</p>
          <p className="text-[#484f58] text-xs mt-1">เยี่ยม {kpi?.visitsThisWeek} ครั้ง</p>
        </div>
        <div className="bg-[#161b22] border border-[#30363d] rounded-xl p-4">
          <div className="flex items-center gap-2 mb-2">
            <CalendarDays size={14} className="text-yellow-400" />
            <p className="text-[#8b949e] text-xs">Booking (7 วัน)</p>
          </div>
          <p className="text-yellow-400 text-2xl font-bold">{f(kpi?.bookingValue || 0)}</p>
          <p className="text-[#484f58] text-xs mt-1">หลุด {kpi?.lostCount} ราย</p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Pipeline Overview */}
        <div className="bg-[#161b22] border border-[#30363d] rounded-xl p-5">
          <h2 className="text-white font-medium mb-4">Pipeline Overview</h2>
          <div className="space-y-3">
            {pipeline.map((s, i) => (
              <div key={s.status}>
                <div className="flex items-center justify-between mb-1">
                  <span className="text-[#8b949e] text-xs">{STATUS_LABEL[s.status]}</span>
                  <div className="flex items-center gap-3">
                    {s.value > 0 && <span className="text-[#484f58] text-xs">{f(s.value)}</span>}
                    <span className="text-white text-xs font-medium w-4 text-right">{s.count}</span>
                  </div>
                </div>
                <div className="h-1.5 bg-[#21262d] rounded-full overflow-hidden">
                  <div className={`h-full rounded-full ${pipelineColors[i]} transition-all duration-700`}
                    style={{ width: s.count > 0 ? Math.max(s.count / pipelineMax * 100, 4) + '%' : '0%' }} />
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Recent Daily Reports */}
        <div className="bg-[#161b22] border border-[#30363d] rounded-xl p-5">
          <h2 className="text-white font-medium mb-4">Daily Report ล่าสุด</h2>
          {recentReports.length === 0 ? (
            <p className="text-[#484f58] text-sm text-center py-6">ยังไม่มีรายงาน</p>
          ) : (
            <div className="space-y-3">
              {recentReports.slice(0, 5).map(r => (
                <div key={r.id} className="flex items-center justify-between">
                  <div>
                    <p className="text-white text-sm">{r.users?.name || '-'}</p>
                    <p className="text-[#484f58] text-xs">
                      {new Date(r.date).toLocaleDateString('th-TH', { day: '2-digit', month: 'short' })}
                      {' · '}โทร {r.calls} · เยี่ยม {r.visits}
                    </p>
                  </div>
                  <div className="text-right">
                    {r.booking_value > 0 && <p className="text-green-400 text-sm font-medium">{f(r.booking_value)}</p>}
                    {r.quotation_value > 0 && <p className="text-[#484f58] text-xs">เสนอ {f(r.quotation_value)}</p>}
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
