'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Plus, Building2, Pencil, ToggleLeft, ToggleRight, AlertCircle } from 'lucide-react'
import { TableSpinner, TableError } from '@/components/ui/StateUI'
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

const empty = {
  id: '', name: '', developer: '', location: '', tower_count: 1, total_units: 0, active: true, notes: ''
}

export default function ProjectsPage() {
  const supabase = createClient()
  const [projects, setProjects] = useState<Project[]>([])
  const [loading, setLoading] = useState(true)
  const [open, setOpen] = useState(false)
  const [editing, setEditing] = useState<Project | null>(null)
  const [form, setForm] = useState(empty)
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState('')
  const [fetchError, setFetchError] = useState('')

  async function load() {
    setLoading(true)
    setFetchError('')
    const { data, error } = await supabase.from('projects').select('*').order('id')
    if (error) { setFetchError(error.message); setLoading(false); return }
    setProjects(data || [])
    setLoading(false)
  }

  useEffect(() => { load() }, [])

  function openNew() {
    setEditing(null)
    setForm(empty)
    setSaveError('')
    setOpen(true)
  }

  function openEdit(p: Project) {
    setEditing(p)
    setForm({ id: p.id, name: p.name, developer: p.developer, location: p.location, tower_count: p.tower_count, total_units: p.total_units, active: p.active, notes: p.notes })
    setSaveError('')
    setOpen(true)
  }

  async function save() {
    if (!form.name) return
    setSaving(true)
    setSaveError('')
    if (editing) {
      const { name, developer, location, tower_count, total_units, active, notes } = form
      const { error } = await supabase.from('projects').update({ name, developer, location, tower_count, total_units, active, notes }).eq('id', editing.id)
      if (error) { setSaveError(error.message); setSaving(false); return }
    } else {
      const id = form.id.trim() || ('PRJ' + String((projects.length + 1)).padStart(2, '0'))
      const { error } = await supabase.from('projects').insert({ id, name: form.name, developer: form.developer, location: form.location, tower_count: form.tower_count, total_units: form.total_units, active: form.active, notes: form.notes })
      if (error) { setSaveError(error.message); setSaving(false); return }
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
          <h1 className="text-xl font-bold" style={{ color: 'var(--text-1)' }}>Projects</h1>
          <p className="text-sm mt-0.5" style={{ color: 'var(--text-2)' }}>จัดการข้อมูลโครงการ</p>
        </div>
        <button onClick={openNew} className="flex items-center gap-2 bg-[#238636] hover:bg-[#2ea043] text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors">
          <Plus size={16} />เพิ่มโครงการ
        </button>
      </div>

      {/* Table */}
      <div className="rounded-xl overflow-hidden" style={{ background: 'var(--card-bg)', border: '1px solid var(--card-border)' }}>
        <table className="w-full">
          <thead>
            <tr style={{ borderBottom: '1px solid var(--divider)' }}>
              <th className="text-left px-4 py-3 text-xs font-medium" style={{ color: 'var(--text-2)' }}>ID</th>
              <th className="text-left px-4 py-3 text-xs font-medium" style={{ color: 'var(--text-2)' }}>ชื่อโครงการ</th>
              <th className="text-left px-4 py-3 text-xs font-medium" style={{ color: 'var(--text-2)' }}>Developer</th>
              <th className="text-left px-4 py-3 text-xs font-medium" style={{ color: 'var(--text-2)' }}>ที่ตั้ง</th>
              <th className="text-center px-4 py-3 text-xs font-medium" style={{ color: 'var(--text-2)' }}>ตึก</th>
              <th className="text-center px-4 py-3 text-xs font-medium" style={{ color: 'var(--text-2)' }}>ห้องทั้งหมด</th>
              <th className="text-center px-4 py-3 text-xs font-medium" style={{ color: 'var(--text-2)' }}>สถานะ</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody>
            {loading && <TableSpinner colSpan={8} />}
            {!loading && fetchError && <TableError colSpan={8} message={fetchError} onRetry={load} />}
            {!loading && projects.length === 0 && (
              <tr><td colSpan={8} className="text-center py-12">
                <Building2 size={32} className="mx-auto mb-2" style={{ color: 'var(--text-3)' }} />
                <p className="text-sm" style={{ color: 'var(--text-2)' }}>ยังไม่มีโครงการ กด "เพิ่มโครงการ" เพื่อเริ่มต้น</p>
              </td></tr>
            )}
            {projects.map((p, i) => (
              <tr key={p.id} className="transition-colors" style={{ borderBottom: '1px solid var(--divider)', background: i % 2 !== 0 ? 'var(--hover-bg)' : undefined }}>
                <td className="px-4 py-3 text-[#58a6ff] text-sm font-mono">{p.id}</td>
                <td className="px-4 py-3 text-sm font-medium" style={{ color: 'var(--text-1)' }}>{p.name}</td>
                <td className="px-4 py-3 text-sm" style={{ color: 'var(--text-2)' }}>{p.developer}</td>
                <td className="px-4 py-3 text-sm" style={{ color: 'var(--text-2)' }}>{p.location}</td>
                <td className="px-4 py-3 text-sm text-center" style={{ color: 'var(--text-2)' }}>{p.tower_count}</td>
                <td className="px-4 py-3 text-sm text-center" style={{ color: 'var(--text-2)' }}>{p.total_units?.toLocaleString()}</td>
                <td className="px-4 py-3 text-center">
                  <button onClick={() => toggleActive(p)}>
                    {p.active
                      ? <span className="inline-flex items-center gap-1 text-green-400 text-xs"><ToggleRight size={16} />เปิด</span>
                      : <span className="inline-flex items-center gap-1 text-xs" style={{ color: 'var(--text-3)' }}><ToggleLeft size={16} />ปิด</span>
                    }
                  </button>
                </td>
                <td className="px-4 py-3">
                  <button onClick={() => openEdit(p)} className="transition-colors" style={{ color: 'var(--text-2)' }}>
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
          {!editing && (
            <div className="col-span-2">
              <Input label="รหัสโครงการ (เช่น OPL06)" value={form.id} onChange={e => setForm({ ...form, id: e.target.value.toUpperCase() })} placeholder="ระบุเอง หรือปล่อยว่างให้ระบบสร้างให้" />
            </div>
          )}
          {editing && (
            <div className="col-span-2">
              <label className="block text-xs font-semibold mb-1" style={{ color: 'var(--text-3)' }}>รหัสโครงการ</label>
              <p className="text-sm font-mono px-3 py-2 rounded-xl" style={{ background: 'var(--hover-bg)', color: 'var(--accent)' }}>{editing.id}</p>
            </div>
          )}
          <div className="col-span-2">
            <Input label="ชื่อโครงการ *" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} placeholder="เช่น Origin Place Phetkasem" />
          </div>
          <Input label="Developer" value={form.developer} onChange={e => setForm({ ...form, developer: e.target.value })} placeholder="เช่น Origin Property" />
          <Input label="ที่ตั้ง" value={form.location} onChange={e => setForm({ ...form, location: e.target.value })} placeholder="เช่น ลาดพร้าว กรุงเทพ" />
          <Input label="จำนวนตึก" type="number" value={form.tower_count} onChange={e => setForm({ ...form, tower_count: Number(e.target.value) })} />
          <Input label="จำนวนห้องทั้งหมด" type="number" value={form.total_units} onChange={e => setForm({ ...form, total_units: Number(e.target.value) })} />
          <div className="col-span-2">
            <TextArea label="หมายเหตุ" value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} placeholder="รายละเอียดเพิ่มเติม..." />
          </div>
        </div>
        {saveError && (
          <div className="flex items-center gap-2 mt-3 p-3 rounded-xl text-xs text-red-400" style={{ background: 'rgba(239,68,68,0.1)' }}>
            <AlertCircle size={14} />{saveError}
          </div>
        )}
        <div className="flex justify-end gap-3 mt-5">
          <button onClick={() => setOpen(false)} className="px-4 py-2 text-sm transition-colors" style={{ color: 'var(--text-2)' }}>ยกเลิก</button>
          <button onClick={save} disabled={saving || !form.name} className="px-4 py-2 bg-[#238636] hover:bg-[#2ea043] disabled:opacity-50 text-white text-sm rounded-lg transition-colors">
            {saving ? 'กำลังบันทึก...' : 'บันทึก'}
          </button>
        </div>
      </Modal>
    </div>
  )
}
