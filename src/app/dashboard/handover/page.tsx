'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Plus, ArrowRightLeft, Pencil, CheckCircle } from 'lucide-react'
import Modal from '@/components/ui/Modal'
import { Input, Select, TextArea } from '@/components/ui/Input'

interface Handover {
  id: string
  customer_id: string
  project_id: string
  room: string
  handover_date: string
  sales_sign_date: string
  customer_sign_date: string
  defect_noted: boolean
  defect_details: string
  status: string
  notes: string
  created_at: string
  customers?: { name: string; phone: string }
  projects?: { name: string }
}

interface Customer { id: string; name: string }
interface Project { id: string; name: string }

const STATUS = [
  { value: 'scheduled', label: 'นัดหมายแล้ว', color: 'bg-blue-500/20 text-blue-400' },
  { value: 'sales_signed', label: 'Sales เซ็นแล้ว', color: 'bg-yellow-500/20 text-yellow-400' },
  { value: 'completed', label: 'ส่งมอบแล้ว', color: 'bg-green-500/20 text-green-400' },
]

const emptyForm = {
  customer_id: '', project_id: '', room: '',
  handover_date: '', sales_sign_date: '', customer_sign_date: '',
  defect_noted: false, defect_details: '',
  status: 'scheduled', notes: ''
}

export default function HandoverPage() {
  const supabase = createClient()
  const [handovers, setHandovers] = useState<Handover[]>([])
  const [customers, setCustomers] = useState<Customer[]>([])
  const [projects, setProjects] = useState<Project[]>([])
  const [loading, setLoading] = useState(true)
  const [open, setOpen] = useState(false)
  const [editing, setEditing] = useState<Handover | null>(null)
  const [form, setForm] = useState(emptyForm)
  const [saving, setSaving] = useState(false)

  async function load() {
    setLoading(true)
    const [{ data: h }, { data: c }, { data: p }] = await Promise.all([
      supabase.from('handovers').select('*, customers(name,phone), projects(name)').order('handover_date', { ascending: true }),
      supabase.from('customers').select('id,name').order('name'),
      supabase.from('projects').select('id,name').order('name'),
    ])
    setHandovers(h || [])
    setCustomers(c || [])
    setProjects(p || [])
    setLoading(false)
  }

  useEffect(() => { load() }, [])

  function genId() {
    const nums = handovers.map(h => parseInt(h.id.replace('HOV-', ''))).filter(n => !isNaN(n))
    return 'HOV-' + String(nums.length > 0 ? Math.max(...nums) + 1 : 1).padStart(3, '0')
  }

  async function save() {
    if (!form.customer_id) return
    setSaving(true)
    if (editing) {
      await supabase.from('handovers').update(form).eq('id', editing.id)
    } else {
      await supabase.from('handovers').insert({ id: genId(), ...form })
    }
    setSaving(false)
    setOpen(false)
    load()
  }

  const custOptions = [{ value: '', label: '— เลือกลูกค้า —' }, ...customers.map(c => ({ value: c.id, label: c.name }))]
  const projOptions = [{ value: '', label: '— เลือกโครงการ —' }, ...projects.map(p => ({ value: p.id, label: p.name }))]
  const statusOptions = STATUS.map(s => ({ value: s.value, label: s.label }))

  const upcoming = handovers.filter(h => h.status !== 'completed')
  const done = handovers.filter(h => h.status === 'completed')

  const dateStr = (d: string) => d ? new Date(d).toLocaleDateString('th-TH', { day: '2-digit', month: 'short', year: '2-digit' }) : '-'

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-white text-xl font-bold">Handover</h1>
          <p className="text-[#8b949e] text-sm mt-0.5">ติดตามการส่งมอบห้องให้ลูกค้า</p>
        </div>
        <button onClick={() => { setEditing(null); setForm(emptyForm); setOpen(true) }}
          className="flex items-center gap-2 bg-[#238636] hover:bg-[#2ea043] text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors">
          <Plus size={16} />นัด Handover
        </button>
      </div>

      {/* Summary */}
      <div className="grid grid-cols-3 gap-4 mb-6">
        {STATUS.map(s => {
          const count = handovers.filter(h => h.status === s.value).length
          return (
            <div key={s.value} className="bg-[#161b22] border border-[#30363d] rounded-xl p-4">
              <p className="text-[#8b949e] text-xs mb-1">{s.label}</p>
              <p className={`text-2xl font-bold ${s.color.split(' ')[1]}`}>{count}</p>
            </div>
          )
        })}
      </div>

      {/* Upcoming */}
      {upcoming.length > 0 && (
        <div className="mb-6">
          <h2 className="text-[#8b949e] text-xs font-bold mb-3">รอดำเนินการ ({upcoming.length})</h2>
          <div className="bg-[#161b22] border border-[#30363d] rounded-xl overflow-hidden">
            <table className="w-full">
              <thead>
                <tr className="border-b border-[#21262d]">
                  <th className="text-left px-4 py-3 text-[#8b949e] text-xs">ลูกค้า</th>
                  <th className="text-left px-4 py-3 text-[#8b949e] text-xs">โครงการ / ห้อง</th>
                  <th className="text-left px-4 py-3 text-[#8b949e] text-xs">วันนัด Handover</th>
                  <th className="text-left px-4 py-3 text-[#8b949e] text-xs">Sales เซ็น</th>
                  <th className="text-left px-4 py-3 text-[#8b949e] text-xs">ลูกค้าเซ็น</th>
                  <th className="text-left px-4 py-3 text-[#8b949e] text-xs">Defect</th>
                  <th className="text-left px-4 py-3 text-[#8b949e] text-xs">สถานะ</th>
                  <th className="px-4 py-3" />
                </tr>
              </thead>
              <tbody>
                {upcoming.map((h, i) => {
                  const st = STATUS.find(s => s.value === h.status) || STATUS[0]
                  return (
                    <tr key={h.id} className={`border-b border-[#21262d] hover:bg-[#1c2128] transition-colors ${i % 2 === 0 ? '' : 'bg-[#0d1117]/30'}`}>
                      <td className="px-4 py-3">
                        <p className="text-white text-sm">{(h as any).customers?.name || '-'}</p>
                        <p className="text-[#484f58] text-xs">{(h as any).customers?.phone}</p>
                      </td>
                      <td className="px-4 py-3">
                        <p className="text-[#c9d1d9] text-sm">{(h as any).projects?.name || '-'}</p>
                        <p className="text-[#58a6ff] text-xs">{h.room}</p>
                      </td>
                      <td className="px-4 py-3 text-[#c9d1d9] text-sm">{dateStr(h.handover_date)}</td>
                      <td className="px-4 py-3">
                        {h.sales_sign_date
                          ? <span className="text-green-400 text-xs flex items-center gap-1"><CheckCircle size={12} />{dateStr(h.sales_sign_date)}</span>
                          : <span className="text-[#484f58] text-xs">รอเซ็น</span>}
                      </td>
                      <td className="px-4 py-3">
                        {h.customer_sign_date
                          ? <span className="text-green-400 text-xs flex items-center gap-1"><CheckCircle size={12} />{dateStr(h.customer_sign_date)}</span>
                          : <span className="text-[#484f58] text-xs">รอเซ็น</span>}
                      </td>
                      <td className="px-4 py-3">
                        {h.defect_noted
                          ? <span className="text-red-400 text-xs">มี Defect</span>
                          : <span className="text-[#484f58] text-xs">ไม่มี</span>}
                      </td>
                      <td className="px-4 py-3">
                        <span className={`inline-block px-2 py-0.5 rounded text-xs ${st.color}`}>{st.label}</span>
                      </td>
                      <td className="px-4 py-3">
                        <button onClick={() => {
                          setEditing(h)
                          setForm({ customer_id: h.customer_id, project_id: h.project_id, room: h.room, handover_date: h.handover_date || '', sales_sign_date: h.sales_sign_date || '', customer_sign_date: h.customer_sign_date || '', defect_noted: h.defect_noted, defect_details: h.defect_details || '', status: h.status, notes: h.notes || '' })
                          setOpen(true)
                        }} className="text-[#8b949e] hover:text-white transition-colors">
                          <Pencil size={14} />
                        </button>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Completed */}
      {done.length > 0 && (
        <div>
          <h2 className="text-[#8b949e] text-xs font-bold mb-3">ส่งมอบแล้ว ({done.length})</h2>
          <div className="bg-[#161b22] border border-[#30363d] rounded-xl overflow-hidden">
            <table className="w-full">
              <thead>
                <tr className="border-b border-[#21262d]">
                  <th className="text-left px-4 py-3 text-[#8b949e] text-xs">ลูกค้า</th>
                  <th className="text-left px-4 py-3 text-[#8b949e] text-xs">โครงการ / ห้อง</th>
                  <th className="text-left px-4 py-3 text-[#8b949e] text-xs">วัน Handover</th>
                  <th className="text-left px-4 py-3 text-[#8b949e] text-xs">Defect</th>
                  <th className="px-4 py-3" />
                </tr>
              </thead>
              <tbody>
                {done.map((h, i) => (
                  <tr key={h.id} className={`border-b border-[#21262d] hover:bg-[#1c2128] transition-colors ${i % 2 === 0 ? '' : 'bg-[#0d1117]/30'}`}>
                    <td className="px-4 py-3 text-white text-sm">{(h as any).customers?.name || '-'}</td>
                    <td className="px-4 py-3">
                      <p className="text-[#c9d1d9] text-sm">{(h as any).projects?.name || '-'}</p>
                      <p className="text-[#58a6ff] text-xs">{h.room}</p>
                    </td>
                    <td className="px-4 py-3 text-[#c9d1d9] text-sm">{dateStr(h.handover_date)}</td>
                    <td className="px-4 py-3">
                      {h.defect_noted
                        ? <span className="text-red-400 text-xs">มี Defect</span>
                        : <span className="text-green-400 text-xs">ไม่มี</span>}
                    </td>
                    <td className="px-4 py-3">
                      <button onClick={() => {
                        setEditing(h)
                        setForm({ customer_id: h.customer_id, project_id: h.project_id, room: h.room, handover_date: h.handover_date || '', sales_sign_date: h.sales_sign_date || '', customer_sign_date: h.customer_sign_date || '', defect_noted: h.defect_noted, defect_details: h.defect_details || '', status: h.status, notes: h.notes || '' })
                        setOpen(true)
                      }} className="text-[#8b949e] hover:text-white transition-colors">
                        <Pencil size={14} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {!loading && handovers.length === 0 && (
        <div className="text-center py-16 bg-[#161b22] border border-[#30363d] rounded-xl">
          <ArrowRightLeft size={32} className="mx-auto text-[#484f58] mb-2" />
          <p className="text-[#8b949e] text-sm">ยังไม่มีการ Handover</p>
        </div>
      )}

      {/* Modal */}
      <Modal open={open} onClose={() => setOpen(false)} title={editing ? 'แก้ไข Handover' : 'นัด Handover ใหม่'} size="lg">
        <div className="grid grid-cols-2 gap-4">
          <Select label="ลูกค้า *" value={form.customer_id} onChange={e => setForm({ ...form, customer_id: e.target.value })} options={custOptions} />
          <Select label="โครงการ" value={form.project_id} onChange={e => setForm({ ...form, project_id: e.target.value })} options={projOptions} />
          <Input label="ห้อง" value={form.room} onChange={e => setForm({ ...form, room: e.target.value })} placeholder="A-1201" />
          <Input label="วันนัด Handover" type="date" value={form.handover_date} onChange={e => setForm({ ...form, handover_date: e.target.value })} />
          <Input label="วันที่ Sales เซ็น" type="date" value={form.sales_sign_date} onChange={e => setForm({ ...form, sales_sign_date: e.target.value })} />
          <Input label="วันที่ลูกค้าเซ็น" type="date" value={form.customer_sign_date} onChange={e => setForm({ ...form, customer_sign_date: e.target.value })} />
          <Select label="สถานะ" value={form.status} onChange={e => setForm({ ...form, status: e.target.value })} options={statusOptions} />
          <div className="flex items-center gap-3 pt-5">
            <input type="checkbox" id="defect" checked={form.defect_noted}
              onChange={e => setForm({ ...form, defect_noted: e.target.checked })}
              className="w-4 h-4 accent-red-500" />
            <label htmlFor="defect" className="text-[#c9d1d9] text-sm">มี Defect</label>
          </div>
          {form.defect_noted && (
            <div className="col-span-2">
              <TextArea label="รายละเอียด Defect" value={form.defect_details} onChange={e => setForm({ ...form, defect_details: e.target.value })} placeholder="ระบุรายละเอียดข้อบกพร่อง..." />
            </div>
          )}
          <div className="col-span-2">
            <TextArea label="หมายเหตุ" value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} />
          </div>
        </div>
        <div className="flex justify-end gap-3 mt-5">
          <button onClick={() => setOpen(false)} className="px-4 py-2 text-[#8b949e] hover:text-white text-sm transition-colors">ยกเลิก</button>
          <button onClick={save} disabled={saving || !form.customer_id} className="px-4 py-2 bg-[#238636] hover:bg-[#2ea043] disabled:opacity-50 text-white text-sm rounded-lg transition-colors">
            {saving ? 'กำลังบันทึก...' : 'บันทึก'}
          </button>
        </div>
      </Modal>
    </div>
  )
}
