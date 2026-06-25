'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Plus, Building2, Pencil, ToggleLeft, ToggleRight } from 'lucide-react'
import Modal from '@/components/ui/Modal'
import { Input, TextArea } from '@/components/ui/Input'

interface Project {
  id: string
  name: string
  developer: string
  location: string
  tower_count: number
  total_units: number
  active: boolean
  notes: string
}

const empty: Omit<Project, 'id'> = {
  name: '', developer: '', location: '', tower_count: 1, total_units: 0, active: true, notes: ''
}

export default function ProjectsPage() {
  const supabase = createClient()
  const [projects, setProjects] = useState<Project[]>([])
  const [loading, setLoading] = useState(true)
  const [open, setOpen] = useState(false)
  const [editing, setEditing] = useState<Project | null>(null)
  const [form, setForm] = useState(empty)
  const [saving, setSaving] = useState(false)

  async function load() {
    setLoading(true)
    const { data } = await supabase.from('projects').select('*').order('id')
    setProjects(data || [])
    setLoading(false)
  }

  useEffect(() => { load() }, [])

  function openNew() {
    setEditing(null)
    setForm(empty)
    setOpen(true)
  }

  function openEdit(p: Project) {
    setEditing(p)
    setForm({ name: p.name, developer: p.developer, location: p.location, tower_count: p.tower_count, total_units: p.total_units, active: p.active, notes: p.notes })
    setOpen(true)
  }

  async function save() {
    if (!form.name) return
    setSaving(true)
    if (editing) {
      await supabase.from('projects').update(form).eq('id', editing.id)
    } else {
      const id = 'ZZZ' + String((projects.length + 1)).padStart(2, '0')
      await supabase.from('projects').insert({ id, ...form })
    }
    setSaving(false)
    setOpen(false)
    load()
  }

  async function toggleActive(p: Project) {
    await supabase.from('projects').update({ active: !p.active }).eq('id', p.id)
    load()
  }

  return (
    <div className="p-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-white text-xl font-bold">Projects</h1>
          <p className="text-[#8b949e] text-sm mt-0.5">จัดการข้อมูลโครงการ</p>
        </div>
        <button onClick={openNew} className="flex items-center gap-2 bg-[#238636] hover:bg-[#2ea043] text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors">
          <Plus size={16} />เพิ่มโครงการ
        </button>
      </div>

      {/* Table */}
      <div className="bg-[#161b22] border border-[#30363d] rounded-xl overflow-hidden">
        <table className="w-full">
          <thead>
            <tr className="border-b border-[#21262d]">
              <th className="text-left px-4 py-3 text-[#8b949e] text-xs font-medium">ID</th>
              <th className="text-left px-4 py-3 text-[#8b949e] text-xs font-medium">ชื่อโครงการ</th>
              <th className="text-left px-4 py-3 text-[#8b949e] text-xs font-medium">Developer</th>
              <th className="text-left px-4 py-3 text-[#8b949e] text-xs font-medium">ที่ตั้ง</th>
              <th className="text-center px-4 py-3 text-[#8b949e] text-xs font-medium">ตึก</th>
              <th className="text-center px-4 py-3 text-[#8b949e] text-xs font-medium">ห้องทั้งหมด</th>
              <th className="text-center px-4 py-3 text-[#8b949e] text-xs font-medium">สถานะ</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody>
            {loading && (
              <tr><td colSpan={8} className="text-center py-12 text-[#8b949e]">กำลังโหลด...</td></tr>
            )}
            {!loading && projects.length === 0 && (
              <tr><td colSpan={8} className="text-center py-12">
                <Building2 size={32} className="mx-auto text-[#484f58] mb-2" />
                <p className="text-[#8b949e] text-sm">ยังไม่มีโครงการ กด "เพิ่มโครงการ" เพื่อเริ่มต้น</p>
              </td></tr>
            )}
            {projects.map((p, i) => (
              <tr key={p.id} className={`border-b border-[#21262d] hover:bg-[#1c2128] transition-colors ${i % 2 === 0 ? '' : 'bg-[#0d1117]/30'}`}>
                <td className="px-4 py-3 text-[#58a6ff] text-sm font-mono">{p.id}</td>
                <td className="px-4 py-3 text-white text-sm font-medium">{p.name}</td>
                <td className="px-4 py-3 text-[#c9d1d9] text-sm">{p.developer}</td>
                <td className="px-4 py-3 text-[#c9d1d9] text-sm">{p.location}</td>
                <td className="px-4 py-3 text-[#c9d1d9] text-sm text-center">{p.tower_count}</td>
                <td className="px-4 py-3 text-[#c9d1d9] text-sm text-center">{p.total_units?.toLocaleString()}</td>
                <td className="px-4 py-3 text-center">
                  <button onClick={() => toggleActive(p)}>
                    {p.active
                      ? <span className="inline-flex items-center gap-1 text-green-400 text-xs"><ToggleRight size={16} />เปิด</span>
                      : <span className="inline-flex items-center gap-1 text-[#484f58] text-xs"><ToggleLeft size={16} />ปิด</span>
                    }
                  </button>
                </td>
                <td className="px-4 py-3">
                  <button onClick={() => openEdit(p)} className="text-[#8b949e] hover:text-white transition-colors">
                    <Pencil size={14} />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Modal */}
      <Modal open={open} onClose={() => setOpen(false)} title={editing ? 'แก้ไขโครงการ' : 'เพิ่มโครงการใหม่'}>
        <div className="grid grid-cols-2 gap-4">
          <div className="col-span-2">
            <Input label="ชื่อโครงการ *" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} placeholder="เช่น The Origin Ladprao" />
          </div>
          <Input label="Developer" value={form.developer} onChange={e => setForm({ ...form, developer: e.target.value })} placeholder="เช่น Origin Property" />
          <Input label="ที่ตั้ง" value={form.location} onChange={e => setForm({ ...form, location: e.target.value })} placeholder="เช่น ลาดพร้าว กรุงเทพ" />
          <Input label="จำนวนตึก" type="number" value={form.tower_count} onChange={e => setForm({ ...form, tower_count: Number(e.target.value) })} />
          <Input label="จำนวนห้องทั้งหมด" type="number" value={form.total_units} onChange={e => setForm({ ...form, total_units: Number(e.target.value) })} />
          <div className="col-span-2">
            <TextArea label="หมายเหตุ" value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} placeholder="รายละเอียดเพิ่มเติม..." />
          </div>
        </div>
        <div className="flex justify-end gap-3 mt-5">
          <button onClick={() => setOpen(false)} className="px-4 py-2 text-[#8b949e] hover:text-white text-sm transition-colors">ยกเลิก</button>
          <button onClick={save} disabled={saving || !form.name} className="px-4 py-2 bg-[#238636] hover:bg-[#2ea043] disabled:opacity-50 text-white text-sm rounded-lg transition-colors">
            {saving ? 'กำลังบันทึก...' : 'บันทึก'}
          </button>
        </div>
      </Modal>
    </div>
  )
}
