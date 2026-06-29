'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { ClipboardList, Plus, CheckCircle } from 'lucide-react'
import { TableSpinner, TableError } from '@/components/ui/StateUI'
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
  const [fetchError, setFetchError] = useState('')

  async function load() {
    setLoading(true)
    setFetchError('')
    const { data: { user } } = await supabase.auth.getUser()
    if (user) {
      const { data: u, error: uErr } = await supabase.from('users').select('id,name').eq('email', user.email!).single()
      if (uErr) { setFetchError(uErr.message); setLoading(false); return }
      if (u) {
        setCurrentUser(u)
        const today = new Date().toISOString().slice(0, 10)
        const { data: reps, error: rErr } = await supabase
          .from('daily_reports')
          .select('*, users(name)')
          .order('date', { ascending: false })
          .limit(30)
        if (rErr) { setFetchError(rErr.message); setLoading(false); return }
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
          <h1 className="text-xl font-bold" style={{ color: 'var(--text-1)' }}>Daily Report</h1>
          <p className="text-sm mt-0.5" style={{ color: 'var(--text-2)' }}>รายงานการทำงานประจำวัน</p>
        </div>
        {!todayDone && (
          <button onClick={() => setShowForm(!showForm)}
            className="flex items-center gap-2 btn-green text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors">
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
        <div className="rounded-xl p-5 mb-6" style={{ background: 'var(--card-bg)', border: '1px solid var(--card-border)' }}>
          <h2 className="font-medium mb-4" style={{ color: 'var(--text-1)' }}>บันทึกรายงานวันที่ {new Date(form.date).toLocaleDateString('th-TH', { dateStyle: 'long' })}</h2>
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
            <button onClick={() => setShowForm(false)} className="px-4 py-2 text-sm transition-colors" style={{ color: 'var(--text-2)' }}>ยกเลิก</button>
            <button onClick={save} disabled={saving} className="px-4 py-2 btn-green disabled:opacity-50 text-white text-sm rounded-lg transition-colors">
              {saving ? 'กำลังบันทึก...' : 'บันทึก'}
            </button>
          </div>
        </div>
      )}

      {/* History */}
      <div className="rounded-xl overflow-hidden tbl-scroll" style={{ background: 'var(--card-bg)', border: '1px solid var(--card-border)' }}>
        <div className="px-4 py-3" style={{ borderBottom: '1px solid var(--divider)' }}>
          <p className="text-xs font-medium" style={{ color: 'var(--text-2)' }}>ประวัติรายงาน 30 วันล่าสุด</p>
        </div>
        <table className="w-full">
          <thead>
            <tr style={{ borderBottom: '1px solid var(--divider)' }}>
              <th className="text-left px-4 py-3 text-xs" style={{ color: 'var(--text-2)' }}>วันที่</th>
              <th className="text-left px-4 py-3 text-xs" style={{ color: 'var(--text-2)' }}>Sales</th>
              <th className="text-center px-4 py-3 text-xs" style={{ color: 'var(--text-2)' }}>โทร</th>
              <th className="text-center px-4 py-3 text-xs" style={{ color: 'var(--text-2)' }}>เยี่ยม</th>
              <th className="text-center px-4 py-3 text-xs" style={{ color: 'var(--text-2)' }}>Follow</th>
              <th className="text-center px-4 py-3 text-xs" style={{ color: 'var(--text-2)' }}>ใบเสนอ</th>
              <th className="text-center px-4 py-3 text-xs" style={{ color: 'var(--text-2)' }}>Lead</th>
              <th className="text-right px-4 py-3 text-xs" style={{ color: 'var(--text-2)' }}>มูลค่าใบเสนอ</th>
              <th className="text-right px-4 py-3 text-xs" style={{ color: 'var(--text-2)' }}>Booking</th>
            </tr>
          </thead>
          <tbody>
            {loading && <TableSpinner colSpan={9} />}
            {!loading && fetchError && <TableError colSpan={9} message={fetchError} onRetry={load} />}
            {!loading && reports.length === 0 && (
              <tr><td colSpan={9} className="text-center py-12">
                <ClipboardList size={32} className="mx-auto mb-2" style={{ color: 'var(--text-3)' }} />
                <p className="text-sm" style={{ color: 'var(--text-2)' }}>ยังไม่มีรายงาน</p>
              </td></tr>
            )}
            {reports.map((r, i) => (
              <tr key={r.id} className="transition-colors" style={{ borderBottom: '1px solid var(--divider)', background: i % 2 !== 0 ? 'var(--hover-bg)' : undefined }}>
                <td className="px-4 py-2.5 text-sm" style={{ color: 'var(--text-2)' }}>
                  {new Date(r.date).toLocaleDateString('th-TH', { day: '2-digit', month: 'short', year: '2-digit' })}
                </td>
                <td className="px-4 py-2.5 text-sm" style={{ color: 'var(--text-1)' }}>{(r as any).users?.name || '-'}</td>
                <td className="px-4 py-2.5 text-sm text-center" style={{ color: 'var(--text-2)' }}>{r.calls}</td>
                <td className="px-4 py-2.5 text-sm text-center" style={{ color: 'var(--text-2)' }}>{r.visits}</td>
                <td className="px-4 py-2.5 text-sm text-center" style={{ color: 'var(--text-2)' }}>{r.follow_ups}</td>
                <td className="px-4 py-2.5 text-sm text-center" style={{ color: 'var(--text-2)' }}>{r.quotations_sent}</td>
                <td className="px-4 py-2.5 text-sm text-center" style={{ color: 'var(--text-2)' }}>{r.leads_created}</td>
                <td className="px-4 py-2.5 text-sm text-right" style={{ color: 'var(--text-2)' }}>{f(r.quotation_value)}</td>
                <td className="px-4 py-2.5 text-green-400 text-sm text-right font-medium">{f(r.booking_value)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
