'use client'

import { useEffect, useState } from 'react'
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

const emptyForm = {
  user_id: '', project_id: '',
  year: thisYear, month: thisMonth,
  target_calls: 0, target_visits: 0, target_leads: 0,
  target_bookings: 0, target_booking_value: 0, target_closed: 0
}

const f = (v: number) => v ? '฿' + v.toLocaleString() : '฿0'

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
  const [filterMonth, setFilterMonth] = useState(thisMonth)

  async function load() {
    setLoading(true)
    const [{ data: t }, { data: u }, { data: p }] = await Promise.all([
      supabase.from('sales_targets').select('*, users(name), projects(name)').order('year', { ascending: false }).order('month', { ascending: false }),
      supabase.from('users').select('id,name').eq('active', true).order('name'),
      supabase.from('projects').select('id,name').order('name'),
    ])
    setTargets(t || [])
    setUsers(u || [])
    setProjects(p || [])
    setLoading(false)
  }

  useEffect(() => { load() }, [])

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

  const filtered = targets.filter(t => t.year === filterYear && t.month === filterMonth)

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
      <div className="flex gap-3 mb-6">
        <select value={filterYear} onChange={e => setFilterYear(Number(e.target.value))}
          className="bg-[#161b22] border border-[#30363d] rounded-lg px-3 py-2 text-white text-sm outline-none">
          {[thisYear - 1, thisYear, thisYear + 1].map(y => (
            <option key={y} value={y}>{y + 543} (พ.ศ.)</option>
          ))}
        </select>
        <select value={filterMonth} onChange={e => setFilterMonth(Number(e.target.value))}
          className="bg-[#161b22] border border-[#30363d] rounded-lg px-3 py-2 text-white text-sm outline-none">
          {MONTHS.map((m, i) => (
            <option key={i + 1} value={i + 1}>{m}</option>
          ))}
        </select>
      </div>

      {/* Targets grid */}
      {loading ? (
        <div className="text-center py-12 text-[#8b949e]">กำลังโหลด...</div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-16 bg-[#161b22] border border-[#30363d] rounded-xl">
          <Target size={32} className="mx-auto text-[#484f58] mb-2" />
          <p className="text-[#8b949e] text-sm">ยังไม่มีเป้าหมายสำหรับเดือนนี้</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {filtered.map(t => (
            <div key={t.id} className="bg-[#161b22] border border-[#30363d] rounded-xl p-4">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <div className="w-7 h-7 rounded-full bg-[#30363d] flex items-center justify-center">
                    <span className="text-white text-xs">{(t as any).users?.name?.[0]}</span>
                  </div>
                  <div>
                    <p className="text-white text-sm font-medium">{(t as any).users?.name || '-'}</p>
                    {(t as any).projects?.name && <p className="text-[#484f58] text-xs">{(t as any).projects.name}</p>}
                  </div>
                </div>
                <button onClick={() => {
                  setEditing(t)
                  setForm({ user_id: t.user_id, project_id: t.project_id || '', year: t.year, month: t.month, target_calls: t.target_calls, target_visits: t.target_visits, target_leads: t.target_leads, target_bookings: t.target_bookings, target_booking_value: t.target_booking_value, target_closed: t.target_closed })
                  setOpen(true)
                }} className="text-[#8b949e] hover:text-white transition-colors">
                  <Pencil size={14} />
                </button>
              </div>
              <div className="grid grid-cols-2 gap-2">
                {[
                  { label: 'โทร', value: t.target_calls },
                  { label: 'เยี่ยม', value: t.target_visits },
                  { label: 'Lead', value: t.target_leads },
                  { label: 'Booking', value: t.target_bookings },
                  { label: 'ปิด', value: t.target_closed },
                  { label: 'มูลค่า', value: null, display: f(t.target_booking_value) },
                ].map(item => (
                  <div key={item.label} className="bg-[#0d1117] rounded-lg p-2">
                    <p className="text-[#484f58] text-xs">{item.label}</p>
                    <p className="text-white text-sm font-medium">{item.display ?? item.value}</p>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Modal */}
      <Modal open={open} onClose={() => setOpen(false)} title={editing ? 'แก้ไขเป้าหมาย' : 'ตั้งเป้าหมายใหม่'}>
        <div className="grid grid-cols-2 gap-4">
          <Select label="Sales *" value={form.user_id} onChange={e => setForm({ ...form, user_id: e.target.value })} options={userOptions} />
          <Select label="โครงการ" value={form.project_id} onChange={e => setForm({ ...form, project_id: e.target.value })} options={projOptions} />
          <Select label="ปี" value={String(form.year)} onChange={e => setForm({ ...form, year: Number(e.target.value) })} options={yearOptions} />
          <Select label="เดือน" value={String(form.month)} onChange={e => setForm({ ...form, month: Number(e.target.value) })} options={monthOptions} />
          <Input label="เป้าโทร (ครั้ง)" type="number" value={form.target_calls} onChange={e => setForm({ ...form, target_calls: Number(e.target.value) })} />
          <Input label="เป้าเยี่ยม (ครั้ง)" type="number" value={form.target_visits} onChange={e => setForm({ ...form, target_visits: Number(e.target.value) })} />
          <Input label="เป้า Lead ใหม่" type="number" value={form.target_leads} onChange={e => setForm({ ...form, target_leads: Number(e.target.value) })} />
          <Input label="เป้า Booking" type="number" value={form.target_bookings} onChange={e => setForm({ ...form, target_bookings: Number(e.target.value) })} />
          <Input label="เป้าปิดการขาย" type="number" value={form.target_closed} onChange={e => setForm({ ...form, target_closed: Number(e.target.value) })} />
          <Input label="เป้ามูลค่า (บาท)" type="number" value={form.target_booking_value} onChange={e => setForm({ ...form, target_booking_value: Number(e.target.value) })} />
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
