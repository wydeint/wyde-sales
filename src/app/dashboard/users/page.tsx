'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Plus, UserCog, Pencil, CheckCircle, XCircle, AlertCircle } from 'lucide-react'
import Modal from '@/components/ui/Modal'
import { Input, Select } from '@/components/ui/Input'

interface User {
  id: string
  email: string
  name: string
  role: string
  level: string
  dept: string
  active: boolean
  manager_id: string
}

const ROLES = [
  { value: 'admin', label: 'Admin' },
  { value: 'sales', label: 'Sales' },
  { value: 'admin_sales', label: 'Admin Sales' },
  { value: 'executive', label: 'Executive' },
  { value: 'finance', label: 'Finance' },
]

const LEVELS = [
  { value: 'staff', label: 'Staff' },
  { value: 'manager', label: 'Manager' },
  { value: 'senior_manager', label: 'Senior Manager' },
  { value: 'avp', label: 'AVP' },
  { value: 'vp', label: 'VP' },
  { value: 'dmd', label: 'DMD' },
  { value: 'md', label: 'MD' },
]

const ROLE_COLORS: Record<string, string> = {
  admin: 'bg-orange-500/20 text-orange-400',
  sales: 'bg-green-500/20 text-green-400',
  admin_sales: 'bg-purple-500/20 text-purple-400',
  executive: 'bg-yellow-500/20 text-yellow-400',
  finance: 'bg-blue-500/20 text-blue-400',
}

const empty = { email: '', name: '', role: 'sales', level: 'staff', dept: '', active: true, manager_id: '' }

export default function UsersPage() {
  const supabase = createClient()
  const [users, setUsers] = useState<User[]>([])
  const [loading, setLoading] = useState(true)
  const [open, setOpen] = useState(false)
  const [editing, setEditing] = useState<User | null>(null)
  const [form, setForm] = useState(empty)
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState('')

  async function load() {
    setLoading(true)
    const { data } = await supabase.from('users').select('*').order('name')
    setUsers(data || [])
    setLoading(false)
  }

  useEffect(() => { load() }, [])

  function openNew() { setEditing(null); setForm(empty); setSaveError(''); setOpen(true) }
  function openEdit(u: User) {
    setEditing(u)
    setForm({ email: u.email, name: u.name, role: u.role, level: u.level, dept: u.dept || '', active: u.active, manager_id: u.manager_id || '' })
    setSaveError('')
    setOpen(true)
  }

  function genId(name: string) {
    const base = name.trim().toLowerCase().split(/\s+/)[0].replace(/[^a-z0-9]/g, '') || 'user'
    const existing = users.filter(u => u.id.startsWith(base + '-')).length
    return `${base}-${String(existing + 1).padStart(2, '0')}`
  }

  async function save() {
    if (!form.email || !form.name) return
    setSaving(true)
    setSaveError('')
    const payload = { ...form, manager_id: form.manager_id || null }
    if (editing) {
      const { error } = await supabase.from('users').update(payload).eq('id', editing.id)
      if (error) { setSaveError(error.message); setSaving(false); return }
    } else {
      const id = genId(form.name)
      const { error } = await supabase.from('users').insert({ id, ...payload })
      if (error) { setSaveError(error.message); setSaving(false); return }
    }
    setSaving(false)
    setOpen(false)
    load()
  }

  async function toggleActive(u: User) {
    await supabase.from('users').update({ active: !u.active }).eq('id', u.id)
    load()
  }

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-white text-xl font-bold">Users</h1>
          <p className="text-[#8b949e] text-sm mt-0.5">จัดการผู้ใช้และสิทธิ์การเข้าถึง</p>
        </div>
        <button onClick={openNew} className="flex items-center gap-2 bg-[#238636] hover:bg-[#2ea043] text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors">
          <Plus size={16} />เพิ่มผู้ใช้
        </button>
      </div>

      <div className="bg-[#161b22] border border-[#30363d] rounded-xl overflow-hidden">
        <table className="w-full">
          <thead>
            <tr className="border-b border-[#21262d]">
              <th className="text-left px-4 py-3 text-[#8b949e] text-xs font-medium">ชื่อ</th>
              <th className="text-left px-4 py-3 text-[#8b949e] text-xs font-medium">Email</th>
              <th className="text-left px-4 py-3 text-[#8b949e] text-xs font-medium">Role</th>
              <th className="text-left px-4 py-3 text-[#8b949e] text-xs font-medium">Level</th>
              <th className="text-left px-4 py-3 text-[#8b949e] text-xs font-medium">แผนก</th>
              <th className="text-center px-4 py-3 text-[#8b949e] text-xs font-medium">สถานะ</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody>
            {loading && <tr><td colSpan={7} className="text-center py-12 text-[#8b949e]">กำลังโหลด...</td></tr>}
            {!loading && users.length === 0 && (
              <tr><td colSpan={7} className="text-center py-12">
                <UserCog size={32} className="mx-auto text-[#484f58] mb-2" />
                <p className="text-[#8b949e] text-sm">ยังไม่มีผู้ใช้ กด "เพิ่มผู้ใช้" เพื่อเริ่มต้น</p>
              </td></tr>
            )}
            {users.map((u, i) => (
              <tr key={u.id} className={`border-b border-[#21262d] hover:bg-[#1c2128] transition-colors ${i % 2 === 0 ? '' : 'bg-[#0d1117]/30'}`}>
                <td className="px-4 py-3">
                  <div className="flex items-center gap-2">
                    <div className="w-7 h-7 rounded-full bg-[#30363d] flex items-center justify-center flex-shrink-0">
                      <span className="text-white text-xs font-medium">{u.name?.[0]?.toUpperCase()}</span>
                    </div>
                    <span className="text-white text-sm">{u.name}</span>
                  </div>
                </td>
                <td className="px-4 py-3 text-[#8b949e] text-sm">{u.email}</td>
                <td className="px-4 py-3">
                  <span className={`inline-block px-2 py-0.5 rounded text-xs font-medium ${ROLE_COLORS[u.role] || 'bg-gray-500/20 text-gray-400'}`}>
                    {u.role}
                  </span>
                </td>
                <td className="px-4 py-3 text-[#c9d1d9] text-sm capitalize">{u.level}</td>
                <td className="px-4 py-3 text-[#c9d1d9] text-sm">{u.dept}</td>
                <td className="px-4 py-3 text-center">
                  <button onClick={() => toggleActive(u)}>
                    {u.active
                      ? <CheckCircle size={16} className="text-green-400 mx-auto" />
                      : <XCircle size={16} className="text-[#484f58] mx-auto" />
                    }
                  </button>
                </td>
                <td className="px-4 py-3">
                  <button onClick={() => openEdit(u)} className="text-[#8b949e] hover:text-white transition-colors">
                    <Pencil size={14} />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <Modal open={open} onClose={() => setOpen(false)} title={editing ? 'แก้ไขผู้ใช้' : 'เพิ่มผู้ใช้ใหม่'}>
        <div className="grid grid-cols-2 gap-4">
          <div className="col-span-2">
            <Input label="ชื่อ-นามสกุล *" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} placeholder="เช่น สมชาย ใจดี" />
          </div>
          <div className="col-span-2">
            <Input label="Email *" type="email" value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} placeholder="email@company.com" />
          </div>
          <Select label="Role" value={form.role} onChange={e => setForm({ ...form, role: e.target.value })} options={ROLES} />
          <Select label="Level" value={form.level} onChange={e => setForm({ ...form, level: e.target.value })} options={LEVELS} />
          <div className="col-span-2">
            <Input label="แผนก" value={form.dept} onChange={e => setForm({ ...form, dept: e.target.value })} placeholder="เช่น Sales, Admin" />
          </div>
        </div>
        {saveError && (
          <div className="flex items-center gap-2 mt-3 p-3 rounded-xl text-xs text-red-400" style={{ background: 'rgba(239,68,68,0.1)' }}>
            <AlertCircle size={14} />{saveError}
          </div>
        )}
        <div className="flex justify-end gap-3 mt-5">
          <button onClick={() => setOpen(false)} className="px-4 py-2 text-[#8b949e] hover:text-white text-sm transition-colors">ยกเลิก</button>
          <button onClick={save} disabled={saving || !form.name || !form.email} className="px-4 py-2 bg-[#238636] hover:bg-[#2ea043] disabled:opacity-50 text-white text-sm rounded-lg transition-colors">
            {saving ? 'กำลังบันทึก...' : 'บันทึก'}
          </button>
        </div>
      </Modal>
    </div>
  )
}
