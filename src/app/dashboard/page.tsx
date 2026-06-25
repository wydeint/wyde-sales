'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Users, TrendingUp, PhoneCall, DollarSign, Target, Award } from 'lucide-react'

const STATUS_LABEL: Record<string, string> = {
  new: 'ใหม่', interested: 'สนใจ', quoted: 'เสนอราคา',
  booked: 'จอง', close_pending: 'รอปิด', closed: 'ปิดแล้ว', lost: 'หลุด'
}
const STATUS_COLOR: Record<string, string> = {
  new: '#60a5fa', interested: '#34d399', quoted: '#fbbf24',
  booked: '#f97316', close_pending: '#a78bfa', closed: '#4ade80', lost: '#f87171'
}

const f = (v: number) => '฿' + Math.round(v || 0).toLocaleString()
const fn = (v: number) => (v || 0).toLocaleString()

export default function DashboardPage() {
  const supabase = createClient()
  const [loading, setLoading] = useState(true)
  const [userName, setUserName] = useState('')
  const [userRole, setUserRole] = useState('')

  // KPIs
  const [totalCustomers, setTotalCustomers] = useState(0)
  const [newThisMonth, setNewThisMonth] = useState(0)
  const [bookedThisMonth, setBookedThisMonth] = useState(0)
  const [closedThisMonth, setClosedThisMonth] = useState(0)
  const [pipelineValue, setPipelineValue] = useState(0)
  const [callsThisMonth, setCallsThisMonth] = useState(0)
  const [visitsThisMonth, setVisitsThisMonth] = useState(0)
  const [bookingValueMonth, setBookingValueMonth] = useState(0)

  // Pipeline
  const [pipeline, setPipeline] = useState<{ status: string; count: number; value: number }[]>([])

  // Leaderboard
  const [leaderboard, setLeaderboard] = useState<{ name: string; calls: number; visits: number; bookings: number; value: number }[]>([])

  // Recent reports
  const [recentReports, setRecentReports] = useState<any[]>([])

  useEffect(() => {
    async function load() {
      const { data: { user } } = await supabase.auth.getUser()
      let currentUserName = ''
      if (user) {
        const { data: u } = await supabase.from('users').select('name, role').eq('email', user.email!).single()
        if (u) { setUserName(u.name); setUserRole(u.role); currentUserName = u.name }
      }

      const now = new Date()
      const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0, 10)

      const [{ data: customers }, { data: reports }] = await Promise.all([
        supabase.from('customers').select('status, budget, created_at, assigned_to'),
        supabase.from('daily_reports').select('*, users(name)').gte('date', monthStart).order('date', { ascending: false }),
      ])

      const c = customers || []
      const r = reports || []

      // KPIs
      setTotalCustomers(c.length)
      setNewThisMonth(c.filter(x => x.created_at?.slice(0, 10) >= monthStart).length)
      setBookedThisMonth(c.filter(x => x.status === 'booked').length)
      setClosedThisMonth(c.filter(x => x.status === 'closed').length)
      setPipelineValue(c.filter(x => !['closed', 'lost'].includes(x.status)).reduce((s, x) => s + (x.budget || 0), 0))
      setCallsThisMonth(r.reduce((s, x) => s + (x.calls || 0), 0))
      setVisitsThisMonth(r.reduce((s, x) => s + (x.visits || 0), 0))
      setBookingValueMonth(r.reduce((s, x) => s + (x.booking_value || 0), 0))

      // Pipeline funnel
      const pipelineOrder = ['new', 'interested', 'quoted', 'booked', 'close_pending', 'closed']
      setPipeline(pipelineOrder.map(s => ({
        status: s,
        count: c.filter(x => x.status === s).length,
        value: c.filter(x => x.status === s).reduce((sum, x) => sum + (x.budget || 0), 0)
      })))

      // Leaderboard — aggregate by user name from daily_reports
      const byPerson: Record<string, { calls: number; visits: number; bookings: number; value: number }> = {}
      for (const rep of r) {
        const name = (rep.users as any)?.name || rep.sales_person || '—'
        if (!byPerson[name]) byPerson[name] = { calls: 0, visits: 0, bookings: 0, value: 0 }
        byPerson[name].calls += rep.calls || 0
        byPerson[name].visits += rep.visits || 0
        byPerson[name].bookings += rep.bookings_count || 0
        byPerson[name].value += rep.booking_value || 0
      }
      const lb = Object.entries(byPerson)
        .map(([name, d]) => ({ name, ...d }))
        .sort((a, b) => b.value - a.value || b.calls - a.calls)
      setLeaderboard(lb)

      setRecentReports(r.slice(0, 6))
      setLoading(false)
    }
    load()
  }, [])

  const pipelineMax = Math.max(...pipeline.map(p => p.count), 1)
  const hour = new Date().getHours()
  const greeting = hour < 12 ? 'อรุณสวัสดิ์' : hour < 17 ? 'สวัสดีตอนบ่าย' : 'สวัสดีตอนเย็น'
  const rankIcon = (i: number) => i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `${i + 1}.`

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-center" style={{ color: 'var(--text-3)' }}>
          <div className="text-2xl mb-2">⏳</div>
          <p className="text-sm">กำลังโหลด...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="p-6 space-y-6">

      {/* Greeting */}
      <div>
        <h1 className="text-xl font-bold" style={{ color: 'var(--text-1)' }}>
          {greeting}คุณ{userName || '...'} 👋
        </h1>
        <p className="text-sm mt-0.5" style={{ color: 'var(--text-3)' }}>
          {new Date().toLocaleDateString('th-TH', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
        </p>
      </div>

      {/* KPI Cards Row 1 */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          { icon: Users, label: 'ลูกค้าทั้งหมด', value: fn(totalCustomers), sub: `+${newThisMonth} เดือนนี้`, color: '#60a5fa' },
          { icon: TrendingUp, label: 'จองอยู่', value: fn(bookedThisMonth), sub: `ปิดแล้ว ${closedThisMonth} ราย`, color: '#f97316' },
          { icon: DollarSign, label: 'Pipeline Value', value: f(pipelineValue), sub: 'Booking เดือนนี้ ' + f(bookingValueMonth), color: '#4ade80' },
          { icon: PhoneCall, label: 'โทร เดือนนี้', value: fn(callsThisMonth), sub: `เยี่ยม ${visitsThisMonth} ครั้ง`, color: '#fbbf24' },
        ].map(({ icon: Icon, label, value, sub, color }) => (
          <div key={label} className="glass-card p-4">
            <div className="flex items-center gap-2 mb-2">
              <Icon size={14} style={{ color }} />
              <span className="text-xs" style={{ color: 'var(--text-3)' }}>{label}</span>
            </div>
            <p className="text-2xl font-bold" style={{ color: 'var(--text-1)' }}>{value}</p>
            <p className="text-xs mt-1" style={{ color: 'var(--text-3)' }}>{sub}</p>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

        {/* Pipeline Funnel */}
        <div className="glass-card p-5">
          <div className="flex items-center gap-2 mb-4">
            <Target size={15} style={{ color: 'var(--accent)' }} />
            <h2 className="font-semibold text-sm" style={{ color: 'var(--text-1)' }}>Pipeline</h2>
          </div>
          <div className="space-y-3">
            {pipeline.map(s => (
              <div key={s.status}>
                <div className="flex items-center justify-between mb-1">
                  <span className="text-xs" style={{ color: 'var(--text-2)' }}>{STATUS_LABEL[s.status]}</span>
                  <div className="flex items-center gap-3">
                    {s.value > 0 && (
                      <span className="text-xs" style={{ color: 'var(--text-3)' }}>{f(s.value)}</span>
                    )}
                    <span className="text-xs font-semibold w-5 text-right" style={{ color: 'var(--text-1)' }}>{s.count}</span>
                  </div>
                </div>
                <div className="h-2 rounded-full overflow-hidden" style={{ background: 'var(--divider)' }}>
                  <div
                    className="h-full rounded-full transition-all duration-700"
                    style={{
                      width: s.count > 0 ? Math.max(s.count / pipelineMax * 100, 6) + '%' : '0%',
                      background: STATUS_COLOR[s.status] || 'var(--accent)',
                      opacity: 0.85,
                    }}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Sales Leaderboard */}
        <div className="glass-card p-5">
          <div className="flex items-center gap-2 mb-4">
            <Award size={15} style={{ color: '#fbbf24' }} />
            <h2 className="font-semibold text-sm" style={{ color: 'var(--text-1)' }}>Sales เดือนนี้</h2>
          </div>
          {leaderboard.length === 0 ? (
            <p className="text-sm text-center py-6" style={{ color: 'var(--text-3)' }}>ยังไม่มีข้อมูล</p>
          ) : (
            <div className="space-y-3">
              {leaderboard.map((p, i) => (
                <div key={p.name} className="flex items-center gap-3">
                  <span className="text-base w-6 flex-shrink-0">{rankIcon(i)}</span>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate" style={{ color: 'var(--text-1)' }}>{p.name}</p>
                    <p className="text-xs" style={{ color: 'var(--text-3)' }}>
                      โทร {p.calls} · เยี่ยม {p.visits}
                    </p>
                  </div>
                  <div className="text-right flex-shrink-0">
                    {p.value > 0 && (
                      <p className="text-sm font-semibold" style={{ color: '#4ade80' }}>{f(p.value)}</p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Recent Daily Reports */}
        <div className="glass-card p-5">
          <h2 className="font-semibold text-sm mb-4" style={{ color: 'var(--text-1)' }}>Daily Report ล่าสุด</h2>
          {recentReports.length === 0 ? (
            <p className="text-sm text-center py-6" style={{ color: 'var(--text-3)' }}>ยังไม่มีรายงาน</p>
          ) : (
            <div className="space-y-3">
              {recentReports.map(r => (
                <div key={r.id} className="flex items-center justify-between">
                  <div className="min-w-0">
                    <p className="text-sm font-medium truncate" style={{ color: 'var(--text-1)' }}>
                      {(r.users as any)?.name || '—'}
                    </p>
                    <p className="text-xs" style={{ color: 'var(--text-3)' }}>
                      {new Date(r.date).toLocaleDateString('th-TH', { day: '2-digit', month: 'short' })}
                      {' · '}โทร {r.calls || 0} · เยี่ยม {r.visits || 0}
                    </p>
                  </div>
                  <div className="text-right flex-shrink-0 ml-2">
                    {(r.booking_value || 0) > 0 && (
                      <p className="text-sm font-semibold" style={{ color: '#4ade80' }}>{f(r.booking_value)}</p>
                    )}
                    {(r.quotation_value || 0) > 0 && (
                      <p className="text-xs" style={{ color: 'var(--text-3)' }}>เสนอ {f(r.quotation_value)}</p>
                    )}
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
