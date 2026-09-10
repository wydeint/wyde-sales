'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { ClipboardList, Plus, CheckCircle } from 'lucide-react'
import { TableSpinner, TableError, TableEmpty } from '@/components/ui/StateUI'
import { Input, TextArea } from '@/components/ui/Input'
import { MoneyField } from '@/components/ui/MoneyInput'
import PageHeader from '@/components/ui/PageHeader'
import { todayStr } from '@/lib/today'

interface DailyReport {
  id: string; date: string; sales_person_id: string
  calls: number; visits: number; follow_ups: number
  quotations_sent: number; leads_created: number
  quotation_value: number; booking_value: number; revenue: number; notes: string
  users?: { name: string }
}

interface User { id: string; name: string }

const emptyForm = {
  date: todayStr(),
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
        const today = todayStr()
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
    <div className="page-content">
      <PageHeader
        title="Daily Report"
        subtitle="รายงานการทำงานประจำวัน"
        actions={
          <>
        {!todayDone && (
          <button onClick={() => setShowForm(!showForm)}
            className="flex items-center gap-2 btn-primary text-white px-4 py-2 rounded-lg font-semibold transition-colors">
            <Plus size={16} />บันทึกวันนี้
          </button>
        )}
        {todayDone && (
          <div className="flex items-center gap-2 text-sm" style={{ color: 'var(--accent-green)' }}>
            <CheckCircle size={16} />บันทึกแล้ววันนี้
          </div>
        )}
          </>
        }
      />

      {/* Form */}
      {showForm && (
        <div className="ds-card mb-6">
          <h2 className="text-section-title mb-4" style={{ color: 'var(--text-1)' }}>บันทึกรายงานวันที่ {new Date(form.date).toLocaleDateString('th-TH', { dateStyle: 'long' })}</h2>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
            <Input label="โทรหาลูกค้า (ครั้ง)" type="number" value={form.calls} onChange={e => setForm({ ...form, calls: Number(e.target.value) })} />
            <Input label="เยี่ยมลูกค้า (ครั้ง)" type="number" value={form.visits} onChange={e => setForm({ ...form, visits: Number(e.target.value) })} />
            <Input label="Follow Up (ครั้ง)" type="number" value={form.follow_ups} onChange={e => setForm({ ...form, follow_ups: Number(e.target.value) })} />
            <Input label="ส่งใบเสนอราคา (ใบ)" type="number" value={form.quotations_sent} onChange={e => setForm({ ...form, quotations_sent: Number(e.target.value) })} />
            <Input label="Lead ใหม่" type="number" value={form.leads_created} onChange={e => setForm({ ...form, leads_created: Number(e.target.value) })} />
            <MoneyField label="มูลค่าใบเสนอราคา (บาท)" value={String(form.quotation_value || '')} onChange={v => setForm({ ...form, quotation_value: Number(v) || 0 })} />
            <MoneyField label="มูลค่า Booking (บาท)" value={String(form.booking_value || '')} onChange={v => setForm({ ...form, booking_value: Number(v) || 0 })} />
            <MoneyField label="รายได้ (บาท)" value={String(form.revenue || '')} onChange={v => setForm({ ...form, revenue: Number(v) || 0 })} />
          </div>
          <div className="mb-4">
            <TextArea label="หมายเหตุ / สรุปวันนี้" value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} placeholder="สรุปกิจกรรมวันนี้..." />
          </div>
          <div className="flex justify-end gap-3">
            <button onClick={() => setShowForm(false)} className="px-4 py-2 text-sm transition-colors" style={{ color: 'var(--text-2)' }}>ยกเลิก</button>
            <button onClick={save} disabled={saving} className="px-4 py-2 btn-primary disabled:opacity-50 text-white rounded-lg transition-colors">
              {saving ? 'กำลังบันทึก...' : 'บันทึก'}
            </button>
          </div>
        </div>
      )}

      {/* History */}
      <div className="ds-card overflow-hidden tbl-scroll" style={{ padding: 0 }}>
        <div className="px-4 py-3" style={{ borderBottom: '1px solid var(--divider)' }}>
          <p className="text-card-title" style={{ color: 'var(--text-2)' }}>ประวัติรายงาน 30 วันล่าสุด</p>
        </div>
        <table className="w-full tbl-rows">
          <thead>
            <tr style={{ borderBottom: '1px solid var(--divider)' }}>
              <th className="text-left text-xs" style={{ color: 'var(--text-2)' }}>วันที่</th>
              <th className="text-left text-xs" style={{ color: 'var(--text-2)' }}>Sales</th>
              <th className="text-center text-xs" style={{ color: 'var(--text-2)' }}>โทร</th>
              <th className="text-center text-xs" style={{ color: 'var(--text-2)' }}>เยี่ยม</th>
              <th className="text-center text-xs" style={{ color: 'var(--text-2)' }}>Follow</th>
              <th className="text-center text-xs" style={{ color: 'var(--text-2)' }}>ใบเสนอ</th>
              <th className="text-center text-xs" style={{ color: 'var(--text-2)' }}>Lead</th>
              <th className="num num-money text-xs" style={{ color: 'var(--text-2)' }}><span>มูลค่าใบเสนอ</span></th>
              <th className="num num-money text-xs" style={{ color: 'var(--text-2)' }}><span>Booking</span></th>
            </tr>
          </thead>
          <tbody>
            {loading && <TableSpinner colSpan={9} />}
            {!loading && fetchError && <TableError colSpan={9} message={fetchError} onRetry={load} />}
            {!loading && reports.length === 0 && (
              <TableEmpty colSpan={9} icon={ClipboardList} message="ยังไม่มีรายงาน" />
            )}
            {reports.map((r, i) => (
              <tr key={r.id} className="transition-colors">
                <td className=" text-sm" style={{ color: 'var(--text-2)' }}>
                  {new Date(r.date).toLocaleDateString('th-TH', { day: '2-digit', month: 'short', year: '2-digit' })}
                </td>
                <td className=" text-sm" style={{ color: 'var(--text-1)' }}>{(r as any).users?.name || '-'}</td>
                <td className=" text-sm text-center" style={{ color: 'var(--text-2)' }}>{r.calls}</td>
                <td className=" text-sm text-center" style={{ color: 'var(--text-2)' }}>{r.visits}</td>
                <td className=" text-sm text-center" style={{ color: 'var(--text-2)' }}>{r.follow_ups}</td>
                <td className=" text-sm text-center" style={{ color: 'var(--text-2)' }}>{r.quotations_sent}</td>
                <td className=" text-sm text-center" style={{ color: 'var(--text-2)' }}>{r.leads_created}</td>
                <td className=" text-sm num num-money" style={{ color: 'var(--text-2)' }}><span>{f(r.quotation_value)}</span></td>
                <td className=" text-success text-sm num num-money font-semibold"><span>{f(r.booking_value)}</span></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
