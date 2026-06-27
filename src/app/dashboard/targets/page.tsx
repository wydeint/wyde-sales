'use client'

import { useEffect, useState, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Plus, Target, Pencil } from 'lucide-react'
import Modal from '@/components/ui/Modal'
import { Input, Select } from '@/components/ui/Input'

interface SalesTarget {
  id: string
  user_id: string
  project_id: string
  year: number
  month: number
  target_calls: number
  target_visits: number
  target_leads: number
  target_bookings: number
  target_booking_value: number
  target_closed: number
  target_sales_value: number
  target_delivery_value: number
  users?: { name: string }
  projects?: { name: string }
}

interface User { id: string; name: string }
interface Project { id: string; name: string }

const MONTHS = [
  'มกราคม', 'กุมภาพันธ์', 'มีนาคม', 'เมษายน', 'พฤษภาคม', 'มิถุนายน',
  'กรกฎาคม', 'สิงหาคม', 'กันยายน', 'ตุลาคม', 'พฤศจิกายน', 'ธันวาคม'
]

const thisYear = new Date().getFullYear()
const thisMonth = new Date().getMonth() + 1
const thisQ = Math.floor((thisMonth - 1) / 3) + 1

type ViewPeriod = 'week' | 'month' | 'quarter' | 'year'

function getViewMonths(p: ViewPeriod, year: number): number[] {
  if (p === 'week' || p === 'month') return [thisMonth]
  if (p === 'quarter') return [thisQ * 3 - 2, thisQ * 3 - 1, thisQ * 3]
  return [1,2,3,4,5,6,7,8,9,10,11,12]
}

const emptyForm = {
  user_id: '', project_id: '',
  year: thisYear, month: thisMonth,
  target_calls: 0, target_visits: 0, target_leads: 0,
  target_bookings: 0, target_booking_value: 0, target_closed: 0,
  target_sales_value: 0, target_delivery_value: 0,
}

const f = (v: number) => v ? '฿' + v.toLocaleString() : '฿0'

function ProgressBar({ value, max, color }: { value: number; max: number; color: string }) {
  const pct = max > 0 ? Math.min((value / max) * 100, 100) : 0
  return (
    <div className="w-full h-1.5 rounded-full bg-white/10 mt-1">
      <div className="h-1.5 rounded-full transition-all" style={{ width: `${pct}%`, background: color }} />
    </div>
  )
}

export default function TargetsPage() {
  const supabase = createClient()
  const [targets, setTargets] = useState<SalesTarget[]>([])
  const [users, setUsers] = useState<User[]>([])
  const [projects, setProjects] = useState<Project[]>([])
  const [loading, setLoading] = useState(true)
  const [open, setOpen] = useState(false)
  const [editing, setEditing] = useState<SalesTarget | null>(null)
  const [form, setForm] = useState(emptyForm)
  const [saving, setSaving] = useState(false)
  const [filterYear, setFilterYear] = useState(thisYear)
  const [viewPeriod, setViewPeriod] = useState<ViewPeriod>('month')

  // Actual data
  const [actualSales, setActualSales] = useState<Record<string, number>>({})
  const [actualDelivery, setActualDelivery] = useState<Record<string, number>>({})

  const load = useCallback(async () => {
    setLoading(true)
    const [{ data: t }, { data: u }, { data: p }] = await Promise.all([
      supabase.from('sales_targets').select('*, users(name), projects(name)').order('year', { ascending: false }).order('month', { ascending: false }),
      supabase.from('users').select('id,name').eq('active', true).order('name'),
      supabase.from('projects').select('id,name').order('name'),
    ])
    setTargets(t || [])
    setUsers(u || [])
    setProjects(p || [])

    // Fetch actual sales value by user (jobs with order_date in current year, grouped by sales_id)
    const { data: jobsData } = await supabase
      .from('jobs')
      .select('sales_id, revenue_ex_vat, order_date')
      .not('order_date', 'is', null)
      .gte('order_date', `${thisYear}-01-01`)
      .lte('order_date', `${thisYear}-12-31`)

    // Fetch actual delivery value by user (handovers with delivery_date in current year)
    const { data: hovData } = await supabase
      .from('handovers')
      .select('job_id, delivery_date, jobs(sales_id, revenue_ex_vat)')
      .not('delivery_date', 'is', null)
      .gte('delivery_date', `${thisYear}-01-01`)
      .lte('delivery_date', `${thisYear}-12-31`)

    const salesMap: Record<string, Record<number, number>> = {}
    for (const j of (jobsData || [])) {
      if (!j.sales_id || !j.order_date) continue
      const m = parseInt(j.order_date.slice(5,7))
      if (!salesMap[j.sales_id]) salesMap[j.sales_id] = {}
      salesMap[j.sales_id][m] = (salesMap[j.sales_id][m] || 0) + (j.revenue_ex_vat || 0)
    }

    const delivMap: Record<string, Record<number, number>> = {}
    for (const h of (hovData || [])) {
      const job = (h as any).jobs
      if (!job?.sales_id || !h.delivery_date) continue
      const m = parseInt(h.delivery_date.slice(5,7))
      if (!delivMap[job.sales_id]) delivMap[job.sales_id] = {}
      delivMap[job.sales_id][m] = (delivMap[job.sales_id][m] || 0) + (job.revenue_ex_vat || 0)
    }

    setActualSales(Object.fromEntries(Object.entries(salesMap).map(([uid, mo]) => [uid, mo])) as any)
    setActualDelivery(Object.fromEntries(Object.entries(delivMap).map(([uid, mo]) => [uid, mo])) as any)

    setLoading(false)
  }, [supabase])

  useEffect(() => { load() }, [load])

  async function save() {
    if (!form.user_id) return
    setSaving(true)
    if (editing) {
      await supabase.from('sales_targets').update(form).eq('id', editing.id)
    } else {
      await supabase.from('sales_targets').insert(form)
    }
    setSaving(false)
    setOpen(false)
    load()
  }

  const userOptions = [{ value: '', label: '— เลือก Sales —' }, ...users.map(u => ({ value: u.id, label: u.name }))]
  const projOptions = [{ value: '', label: '— ทุกโครงการ —' }, ...projects.map(p => ({ value: p.id, label: p.name }))]
  const yearOptions = [thisYear - 1, thisYear, thisYear + 1].map(y => ({ value: String(y), label: String(y + 543) + ' (พ.ศ.)' }))
  const monthOptions = MONTHS.map((m, i) => ({ value: String(i + 1), label: m }))

  const viewMonths = getViewMonths(viewPeriod, filterYear)

  // Aggregate targets by user across viewMonths
  const filteredTargets = targets.filter(t => t.year === filterYear && viewMonths.includes(t.month))

  // Group by user_id, summing numeric targets
  const byUser = new Map<string, SalesTarget & { months: number[] }>()
  for (const t of filteredTargets) {
    const existing = byUser.get(t.user_id)
    if (existing) {
      existing.target_calls += t.target_calls
      existing.target_visits += t.target_visits
      existing.target_leads += t.target_leads
      existing.target_bookings += t.target_bookings
      existing.target_booking_value += t.target_booking_value
      existing.target_closed += t.target_closed
      existing.target_sales_value += (t.target_sales_value || 0)
      existing.target_delivery_value += (t.target_delivery_value || 0)
      existing.months.push(t.month)
    } else {
      byUser.set(t.user_id, { ...t, target_sales_value: t.target_sales_value || 0, target_delivery_value: t.target_delivery_value || 0, months: [t.month] })
    }
  }
  const grouped = Array.from(byUser.values())

  // Get actual for a user across viewMonths
  function getActualSales(userId: string) {
    const mo = (actualSales as any)[userId] || {}
    return viewMonths.reduce((s: number, m: number) => s + (mo[m] || 0), 0)
  }
  function getActualDelivery(userId: string) {
    const mo = (actualDelivery as any)[userId] || {}
    return viewMonths.reduce((s: number, m: number) => s + (mo[m] || 0), 0)
  }

  const periodLabel = viewPeriod === 'week' ? 'สัปดาห์นี้' : viewPeriod === 'month' ? `${MONTHS[thisMonth-1]}` : viewPeriod === 'quarter' ? `Q${thisQ}` : `ปี ${thisYear+543}`

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-white text-xl font-bold">Sales Targets</h1>
          <p className="text-[#8b949e] text-sm mt-0.5">กำหนดและติดตามเป้าหมายการขาย</p>
        </div>
        <button onClick={() => { setEditing(null); setForm(emptyForm); setOpen(true) }}
          className="flex items-center gap-2 bg-[#238636] hover:bg-[#2ea043] text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors">
          <Plus size={16} />ตั้งเป้าหมาย
        </button>
      </div>

      {/* Period selector */}
      <div className="flex items-center gap-3 mb-6 flex-wrap">
        <div className="flex gap-1 rounded-xl p-1" style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid #30363d' }}>
          {(['week','month','quarter','year'] as ViewPeriod[]).map(p => (
            <button key={p} onClick={() => setViewPeriod(p)}
              className="px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors"
              style={{ background: viewPeriod === p ? '#6366f1' : 'transparent', color: viewPeriod === p ? '#fff' : '#8b949e' }}>
              {p === 'week' ? 'สัปดาห์' : p === 'month' ? 'เดือน' : p === 'quarter' ? 'ไตรมาส' : 'ปี'}
            </button>
          ))}
        </div>
        <select value={filterYear} onChange={e => setFilterYear(Number(e.target.value))}
          className="bg-[#161b22] border border-[#30363d] rounded-lg px-3 py-2 text-white text-sm outline-none">
          {[thisYear - 1, thisYear, thisYear + 1].map(y => (
            <option key={y} value={y}>{y + 543} (พ.ศ.)</option>
          ))}
        </select>
        <span className="text-[#484f58] text-sm">{periodLabel}</span>
      </div>

      {/* Targets grid */}
      {loading ? (
        <div className="text-center py-12 text-[#8b949e]">กำลังโหลด...</div>
      ) : grouped.length === 0 ? (
        <div className="text-center py-16 bg-[#161b22] border border-[#30363d] rounded-xl">
          <Target size={32} className="mx-auto text-[#484f58] mb-2" />
          <p className="text-[#8b949e] text-sm">ยังไม่มีเป้าหมายสำหรับช่วงนี้</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {grouped.map(t => {
            const actSales = getActualSales(t.user_id)
            const actDeliv = getActualDelivery(t.user_id)
            return (
              <div key={t.user_id} className="bg-[#161b22] border border-[#30363d] rounded-xl p-4">
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-2">
                    <div className="w-7 h-7 rounded-full bg-[#30363d] flex items-center justify-center">
                      <span className="text-white text-xs">{t.users?.name?.[0]}</span>
                    </div>
                    <div>
                      <p className="text-white text-sm font-medium">{t.users?.name || '-'}</p>
                      {t.projects?.name && <p className="text-[#484f58] text-xs">{t.projects.name}</p>}
                    </div>
                  </div>
                  <button onClick={() => {
                    // Edit the first month's record
                    const firstRecord = filteredTargets.find(r => r.user_id === t.user_id)
                    if (firstRecord) {
                      setEditing(firstRecord)
                      setForm({
                        user_id: firstRecord.user_id, project_id: firstRecord.project_id || '',
                        year: firstRecord.year, month: firstRecord.month,
                        target_calls: firstRecord.target_calls, target_visits: firstRecord.target_visits,
                        target_leads: firstRecord.target_leads, target_bookings: firstRecord.target_bookings,
                        target_booking_value: firstRecord.target_booking_value, target_closed: firstRecord.target_closed,
                        target_sales_value: firstRecord.target_sales_value || 0,
                        target_delivery_value: firstRecord.target_delivery_value || 0,
                      })
                      setOpen(true)
                    }
                  }} className="text-[#8b949e] hover:text-white transition-colors">
                    <Pencil size={14} />
                  </button>
                </div>

                {/* Value targets — prominent */}
                <div className="grid grid-cols-2 gap-2 mb-3">
                  <div className="bg-[#0d1117] rounded-xl p-3">
                    <p className="text-[#484f58] text-[10px] mb-0.5">เป้ายอดขาย</p>
                    <p className="text-emerald-400 font-bold text-sm">{f(t.target_sales_value)}</p>
                    <p className="text-[#484f58] text-[10px] mt-0.5">จริง: <span className="text-white">{f(actSales)}</span></p>
                    <ProgressBar value={actSales} max={t.target_sales_value} color="#34d399" />
                  </div>
                  <div className="bg-[#0d1117] rounded-xl p-3">
                    <p className="text-[#484f58] text-[10px] mb-0.5">เป้าส่งมอบ</p>
                    <p className="text-blue-400 font-bold text-sm">{f(t.target_delivery_value)}</p>
                    <p className="text-[#484f58] text-[10px] mt-0.5">จริง: <span className="text-white">{f(actDeliv)}</span></p>
                    <ProgressBar value={actDeliv} max={t.target_delivery_value} color="#60a5fa" />
                  </div>
                </div>

                {/* Activity targets */}
                <div className="grid grid-cols-3 gap-2">
                  {[
                    { label: 'โทร', value: t.target_calls, color: '#fbbf24' },
                    { label: 'เยี่ยม', value: t.target_visits, color: '#fbbf24' },
                    { label: 'Lead', value: t.target_leads, color: '#a78bfa' },
                    { label: 'Booking', value: t.target_bookings, color: '#f472b6' },
                    { label: 'ปิดการขาย', value: t.target_closed, color: '#34d399' },
                    { label: 'มูลค่า Booking', value: null, display: f(t.target_booking_value), color: '#fb923c' },
                  ].map(item => (
                    <div key={item.label} className="bg-[#0d1117] rounded-lg p-2">
                      <p className="text-[#484f58] text-[10px]">{item.label}</p>
                      <p className="text-white text-xs font-medium mt-0.5" style={{ color: item.color }}>{item.display ?? item.value}</p>
                    </div>
                  ))}
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* Modal */}
      <Modal open={open} onClose={() => setOpen(false)} title={editing ? 'แก้ไขเป้าหมาย' : 'ตั้งเป้าหมายใหม่'}>
        <div className="grid grid-cols-2 gap-4">
          <Select label="Sales *" value={form.user_id} onChange={e => setForm({ ...form, user_id: e.target.value })} options={userOptions} />
          <Select label="โครงการ" value={form.project_id} onChange={e => setForm({ ...form, project_id: e.target.value })} options={projOptions} />
          <Select label="ปี" value={String(form.year)} onChange={e => setForm({ ...form, year: Number(e.target.value) })} options={yearOptions} />
          <Select label="เดือน" value={String(form.month)} onChange={e => setForm({ ...form, month: Number(e.target.value) })} options={monthOptions} />
          <div className="col-span-2 border-t border-[#30363d] pt-3">
            <p className="text-[#8b949e] text-xs font-semibold mb-2">เป้ายอดเงิน</p>
          </div>
          <Input label="เป้ายอดขาย (บาท)" type="number" value={form.target_sales_value} onChange={e => setForm({ ...form, target_sales_value: Number(e.target.value) })} />
          <Input label="เป้ายอดส่งมอบ (บาท)" type="number" value={form.target_delivery_value} onChange={e => setForm({ ...form, target_delivery_value: Number(e.target.value) })} />
          <Input label="เป้า Booking Value (บาท)" type="number" value={form.target_booking_value} onChange={e => setForm({ ...form, target_booking_value: Number(e.target.value) })} />
          <div className="col-span-2 border-t border-[#30363d] pt-3">
            <p className="text-[#8b949e] text-xs font-semibold mb-2">เป้ากิจกรรม</p>
          </div>
          <Input label="เป้าโทร (ครั้ง)" type="number" value={form.target_calls} onChange={e => setForm({ ...form, target_calls: Number(e.target.value) })} />
          <Input label="เป้าเยี่ยม (ครั้ง)" type="number" value={form.target_visits} onChange={e => setForm({ ...form, target_visits: Number(e.target.value) })} />
          <Input label="เป้า Lead ใหม่" type="number" value={form.target_leads} onChange={e => setForm({ ...form, target_leads: Number(e.target.value) })} />
          <Input label="เป้า Booking (ห้อง)" type="number" value={form.target_bookings} onChange={e => setForm({ ...form, target_bookings: Number(e.target.value) })} />
          <Input label="เป้าปิดการขาย (ห้อง)" type="number" value={form.target_closed} onChange={e => setForm({ ...form, target_closed: Number(e.target.value) })} />
        </div>
        <div className="flex justify-end gap-3 mt-5">
          <button onClick={() => setOpen(false)} className="px-4 py-2 text-[#8b949e] hover:text-white text-sm transition-colors">ยกเลิก</button>
          <button onClick={save} disabled={saving || !form.user_id} className="px-4 py-2 bg-[#238636] hover:bg-[#2ea043] disabled:opacity-50 text-white text-sm rounded-lg transition-colors">
            {saving ? 'กำลังบันทึก...' : 'บันทึก'}
          </button>
        </div>
      </Modal>
    </div>
  )
}
