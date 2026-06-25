'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { ClipboardList, Plus, CheckCircle } from 'lucide-react'
import { Input, TextArea } from '@/components/ui/Input'

interface DailyReport {
  id: string; date: string; sales_person_id: string
  calls: number; visits: number; follow_ups: number
  quotations_sent: number; leads_created: number
  quotation_value: number; booking_value: number; revenue: number; notes: string
  users?: { name: string }
}

interface User { id: string; name: string }

const emptyForm = {
  date: new Date().toISOString().slice(0, 10),
  calls: 0, visits: 0, follow_ups: 0,
  quotations_sent: 0, leads_created: 0,
  quotation_value: 0, booking_value: 0, revenue: 0, notes: ''
}

export default function DailyReportPage() {
  const supabase = createClient()
  const [reports, setReports] = useState<DailyReport[]>([])
  const [users, setUsers] = useState<User[]>([])
  const [currentUser, setCurrentUser] = useState<User | null>(null)
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState(emptyForm)
  const [saving, setSaving] = useState(false)
  const [todayDone, setTodayDone] = useState(false)

  async function load() {
    setLoading(true)
    const { data: { user } } = await supabase.auth.getUser()
    if (user) {
      const { data: u } = await supabase.from('users').select('id,name').eq('email', user.email!).single()
      if (u) {
        setCurrentUser(u)
        const today = new Date().toISOString().slice(0, 10)
        const { data: reps } = await supabase
          .from('daily_reports')
          .select('*, users(name)')
          .order('date', { ascending: false })
          .limit(30)
        setReports(reps || [])
        const done = (reps || []).some(r => r.date === today && r.sales_person_id === u.id)
        setTodayDone(done)
      }
    }
    setLoading(false)
  }

  useEffect(() => { load() }, [])

  function genId() {
    const nums = reports.map(r => parseInt(r.id.replace('DLR-', ''))).filter(n => !isNaN(n))
    return 'DLR-' + String(nums.length > 0 ? Math.max(...nums) + 1 : 1).padStart(3, '0')
  }

  async function save() {
    if (!currentUser) return
    setSaving(true)
    await supabase.from('daily_reports').insert({
      id: genId(),
      sales_person_id: currentUser.id,
      ...form
    })
    setSaving(false)
    setShowForm(false)
    setForm(emptyForm)
    load()
  }

  const f = (v: number) => v ? v.toLocaleString() : '0'

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-white text-xl font-bold">Daily Report</h1>
          <p className="text-[#8b949e] text-sm mt-0.5">รายงานการทำงานประจำวัน</p>
        </div>
        {!todayDone && (
          <button onClick={() => setShowForm(!showForm)}
            className="flex items-center gap-2 bg-[#238636] hover:bg-[#2ea043] text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors">
            <Plus size={16} />บันทึกวันนี้
          </button>
        )}
        {todayDone && (
          <div className="flex items-center gap-2 text-green-400 text-sm">
            <CheckCircle size={16} />บันทึกแล้ววันนี้
          </div>
        )}
      </div>

      {/* Form */}
      {showForm && (
        <div className="bg-[#161b22] border border-[#30363d] rounded-xl p-5 mb-6">
          <h2 className="text-white font-medium mb-4">บันทึกรายงานวันที่ {new Date(form.date).toLocaleDateString('th-TH', { dateStyle: 'long' })}</h2>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
            <Input label="โทรหาลูกค้า (ครั้ง)" type="number" value={form.calls} onChange={e => setForm({ ...form, calls: Number(e.target.value) })} />
            <Input label="เยี่ยมลูกค้า (ครั้ง)" type="number" value={form.visits} onChange={e => setForm({ ...form, visits: Number(e.target.value) })} />
            <Input label="Follow Up (ครั้ง)" type="number" value={form.follow_ups} onChange={e => setForm({ ...form, follow_ups: Number(e.target.value) })} />
            <Input label="ส่งใบเสนอราคา (ใบ)" type="number" value={form.quotations_sent} onChange={e => setForm({ ...form, quotations_sent: Number(e.target.value) })} />
            <Input label="Lead ใหม่" type="number" value={form.leads_created} onChange={e => setForm({ ...form, leads_created: Number(e.target.value) })} />
            <Input label="มูลค่าใบเสนอราคา (บาท)" type="number" value={form.quotation_value} onChange={e => setForm({ ...form, quotation_value: Number(e.target.value) })} />
            <Input label="มูลค่า Booking (บาท)" type="number" value={form.booking_value} onChange={e => setForm({ ...form, booking_value: Number(e.target.value) })} />
            <Input label="รายได้ (บาท)" type="number" value={form.revenue} onChange={e => setForm({ ...form, revenue: Number(e.target.value) })} />
          </div>
          <div className="mb-4">
            <TextArea label="หมายเหตุ / สรุปวันนี้" value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} placeholder="สรุปกิจกรรมวันนี้..." />
          </div>
          <div className="flex justify-end gap-3">
            <button onClick={() => setShowForm(false)} className="px-4 py-2 text-[#8b949e] hover:text-white text-sm transition-colors">ยกเลิก</button>
            <button onClick={save} disabled={saving} className="px-4 py-2 bg-[#238636] hover:bg-[#2ea043] disabled:opacity-50 text-white text-sm rounded-lg transition-colors">
              {saving ? 'กำลังบันทึก...' : 'บันทึก'}
            </button>
          </div>
        </div>
      )}

      {/* History */}
      <div className="bg-[#161b22] border border-[#30363d] rounded-xl overflow-hidden">
        <div className="px-4 py-3 border-b border-[#21262d]">
          <p className="text-[#8b949e] text-xs font-medium">ประวัติรายงาน 30 วันล่าสุด</p>
        </div>
        <table className="w-full">
          <thead>
            <tr className="border-b border-[#21262d]">
              <th className="text-left px-4 py-3 text-[#8b949e] text-xs">วันที่</th>
              <th className="text-left px-4 py-3 text-[#8b949e] text-xs">Sales</th>
              <th className="text-center px-4 py-3 text-[#8b949e] text-xs">โทร</th>
              <th className="text-center px-4 py-3 text-[#8b949e] text-xs">เยี่ยม</th>
              <th className="text-center px-4 py-3 text-[#8b949e] text-xs">Follow</th>
              <th className="text-center px-4 py-3 text-[#8b949e] text-xs">ใบเสนอ</th>
              <th className="text-center px-4 py-3 text-[#8b949e] text-xs">Lead</th>
              <th className="text-right px-4 py-3 text-[#8b949e] text-xs">มูลค่าใบเสนอ</th>
              <th className="text-right px-4 py-3 text-[#8b949e] text-xs">Booking</th>
            </tr>
          </thead>
          <tbody>
            {loading && <tr><td colSpan={9} className="text-center py-12 text-[#8b949e]">กำลังโหลด...</td></tr>}
            {!loading && reports.length === 0 && (
              <tr><td colSpan={9} className="text-center py-12">
                <ClipboardList size={32} className="mx-auto text-[#484f58] mb-2" />
                <p className="text-[#8b949e] text-sm">ยังไม่มีรายงาน</p>
              </td></tr>
            )}
            {reports.map((r, i) => (
              <tr key={r.id} className={`border-b border-[#21262d] hover:bg-[#1c2128] ${i % 2 === 0 ? '' : 'bg-[#0d1117]/30'}`}>
                <td className="px-4 py-2.5 text-[#c9d1d9] text-sm">
                  {new Date(r.date).toLocaleDateString('th-TH', { day: '2-digit', month: 'short', year: '2-digit' })}
                </td>
                <td className="px-4 py-2.5 text-white text-sm">{(r as any).users?.name || '-'}</td>
                <td className="px-4 py-2.5 text-[#c9d1d9] text-sm text-center">{r.calls}</td>
                <td className="px-4 py-2.5 text-[#c9d1d9] text-sm text-center">{r.visits}</td>
                <td className="px-4 py-2.5 text-[#c9d1d9] text-sm text-center">{r.follow_ups}</td>
                <td className="px-4 py-2.5 text-[#c9d1d9] text-sm text-center">{r.quotations_sent}</td>
                <td className="px-4 py-2.5 text-[#c9d1d9] text-sm text-center">{r.leads_created}</td>
                <td className="px-4 py-2.5 text-[#c9d1d9] text-sm text-right">{f(r.quotation_value)}</td>
                <td className="px-4 py-2.5 text-green-400 text-sm text-right font-medium">{f(r.booking_value)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
