'use client'

import { useEffect, useState, useId } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Plus, Users, Pencil, Search, AlertCircle } from 'lucide-react'
import { TableSpinner, TableError } from '@/components/ui/StateUI'
import Modal from '@/components/ui/Modal'
import { Input, Select, TextArea } from '@/components/ui/Input'

interface Customer {
  id: string
  customer_name: string
  phone: string
  email: string
  line_id: string
  source: string
  project_id: string
  interested_room: string
  budget: number
  status: string
  assigned_to: string
  notes: string
  created_at: string
  projects?: { name: string }
  users?: { name: string }
}

interface Project { id: string; name: string }
interface User { id: string; name: string }

const STATUS_LIST = [
  { value: 'new', label: 'ใหม่', icon: '●', color: 'bg-blue-500/20 text-blue-400' },
  { value: 'interested', label: 'สนใจ', icon: '◉', color: 'bg-cyan-500/20 text-cyan-400' },
  { value: 'quoted', label: 'เสนอราคาแล้ว', icon: '◈', color: 'bg-yellow-500/20 text-yellow-400' },
  { value: 'booked', label: 'จอง', icon: '★', color: 'bg-orange-500/20 text-orange-400' },
  { value: 'close_pending', label: 'รอปิด', icon: '◷', color: 'bg-purple-500/20 text-purple-400' },
  { value: 'closed', label: 'ปิดแล้ว', icon: '✓', color: 'bg-green-500/20 text-green-400' },
  { value: 'lost', label: 'หลุด', icon: '✕', color: 'bg-red-500/20 text-red-400' },
]

const SOURCE_OPTIONS = [
  { value: '', label: '— เลือกช่องทาง —' },
  { value: 'event', label: 'Event' },
  { value: 'referral', label: 'Referral' },
  { value: 'walk_in', label: 'Walk-in' },
  { value: 'online', label: 'Online' },
  { value: 'cold_call', label: 'Cold Call' },
  { value: 'other', label: 'อื่นๆ' },
]

const emptyForm = {
  customer_name: '', phone: '', email: '', line_id: '', source: '',
  project_id: '', interested_room: '', budget: 0,
  status: 'new', assigned_to: '', notes: ''
}

function statusInfo(s: string) {
  return STATUS_LIST.find(x => x.value === s) || STATUS_LIST[0]
}

export default function CustomersPage() {
  const supabase = createClient()
  const [customers, setCustomers] = useState<Customer[]>([])
  const [projects, setProjects] = useState<Project[]>([])
  const [users, setUsers] = useState<User[]>([])
  const [loading, setLoading] = useState(true)
  const [open, setOpen] = useState(false)
  const [editing, setEditing] = useState<Customer | null>(null)
  const [form, setForm] = useState(emptyForm)
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState('')
  const [fetchError, setFetchError] = useState('')
  const [search, setSearch] = useState('')
  const searchId = useId()
  const [filterStatus, setFilterStatus] = useState('')
  const [filterProject, setFilterProject] = useState('')

  async function load() {
    setLoading(true)
    setFetchError('')
    const [
      { data: c, error: cErr },
      { data: p, error: pErr },
      { data: u, error: uErr },
    ] = await Promise.all([
      supabase.from('customers').select('id, customer_name, phone, email, line_id, source, project_id, interested_room, budget, status, assigned_to, notes, created_at, projects(name), users!customers_assigned_to_fkey(name)').order('created_at', { ascending: false }),
      supabase.from('projects').select('id,name').eq('active', true).order('name'),
      supabase.from('users').select('id,name').eq('active', true).order('name'),
    ])
    if (cErr || pErr || uErr) {
      setFetchError((cErr ?? pErr ?? uErr)!.message)
      setLoading(false)
      return
    }
    setCustomers((c as any) || [])
    setProjects(p || [])
    setUsers(u || [])
    setLoading(false)
  }

  useEffect(() => { load() }, [])

  function genId() {
    const nums = customers.map(c => parseInt(c.id.replace('CST-', ''))).filter(n => !isNaN(n))
    return 'CST-' + String(nums.length > 0 ? Math.max(...nums) + 1 : 1).padStart(4, '0')
  }

  async function save() {
    if (!form.customer_name) return
    setSaving(true)
    setSaveError('')
    const payload = {
      ...form,
      project_id: form.project_id || null,
      assigned_to: form.assigned_to || null,
    }
    if (editing) {
      const { error } = await supabase.from('customers').update(payload).eq('id', editing.id)
      if (error) { setSaveError(error.message); setSaving(false); return }
    } else {
      const { error } = await supabase.from('customers').insert({ id: genId(), ...payload })
      if (error) { setSaveError(error.message); setSaving(false); return }
    }
    setSaving(false)
    setOpen(false)
    load()
  }

  const projectOptions = [{ value: '', label: '— เลือกโครงการ —' }, ...projects.map(p => ({ value: p.id, label: p.name }))]
  const userOptions = [{ value: '', label: '— เลือก Sales —' }, ...users.map(u => ({ value: u.id, label: u.name }))]
  const statusOptions = [{ value: '', label: 'ทุกสถานะ' }, ...STATUS_LIST.map(s => ({ value: s.value, label: s.label }))]
  const projectFilterOptions = [{ value: '', label: 'ทุกโครงการ' }, ...projects.map(p => ({ value: p.id, label: p.name }))]

  const filtered = customers.filter(c => {
    const q = search.toLowerCase()
    const matchSearch = !q || c.customer_name.toLowerCase().includes(q) || c.phone?.includes(q) || c.interested_room?.toLowerCase().includes(q)
    const matchStatus = !filterStatus || c.status === filterStatus
    const matchProject = !filterProject || c.project_id === filterProject
    return matchSearch && matchStatus && matchProject
  })

  return (
    <div className="p-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-white text-xl font-bold">ลูกค้า Condo Origin</h1>
          <p className="text-[#8b949e] text-sm mt-0.5">รายชื่อลูกค้าและ Pipeline การขาย</p>
        </div>
        <div className="flex gap-2">
          <button onClick={() => { setEditing(null); setForm(emptyForm); setSaveError(''); setOpen(true) }}
            className="flex items-center gap-2 bg-[#238636] hover:bg-[#2ea043] text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors">
            <Plus size={16} />เพิ่มลูกค้า
          </button>
        </div>
      </div>

      {/* Filters */}
      <div className="flex gap-3 mb-4 flex-wrap">
        <label htmlFor={searchId} className="sr-only">ค้นหาลูกค้า</label>
        <div className="flex items-center gap-2 rounded-lg px-3 py-2 flex-1 min-w-[200px]"
          style={{ background: 'var(--card-bg)', border: '1px solid var(--card-border)' }}>
          <Search size={14} style={{ color: 'var(--text-3)', flexShrink: 0 }} aria-hidden="true" />
          <input
            id={searchId}
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="ค้นหาชื่อ เบอร์ ห้อง..."
            className="bg-transparent text-sm outline-none flex-1"
            style={{ color: 'var(--text-1)' }}
          />
        </div>
        <label htmlFor="filter-status" className="sr-only">กรองตามสถานะ</label>
        <select id="filter-status" value={filterStatus} onChange={e => setFilterStatus(e.target.value)}
          className="field-input rounded-lg px-3 py-2 text-sm outline-none">
          {statusOptions.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
        <label htmlFor="filter-project" className="sr-only">กรองตามโครงการ</label>
        <select id="filter-project" value={filterProject} onChange={e => setFilterProject(e.target.value)}
          className="field-input rounded-lg px-3 py-2 text-sm outline-none">
          {projectFilterOptions.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
      </div>

      {/* Summary chips */}
      <div className="flex gap-2 mb-4 flex-wrap">
        {STATUS_LIST.map(s => {
          const count = customers.filter(c => c.status === s.value).length
          if (!count) return null
          return (
            <button key={s.value} onClick={() => setFilterStatus(filterStatus === s.value ? '' : s.value)}
              className={`px-3 py-1 rounded-full text-xs font-medium transition-all ${filterStatus === s.value ? s.color + ' ring-1 ring-current' : s.color + ' opacity-60 hover:opacity-100'}`}>
              {s.label} {count}
            </button>
          )
        })}
      </div>

      {/* Table */}
      <div className="bg-[#161b22] border border-[#30363d] rounded-xl overflow-hidden">
        <table className="w-full">
          <thead>
            <tr style={{ borderBottom: '1px solid var(--divider)' }}>
              <th scope="col" className="text-left px-4 py-3 text-xs font-medium" style={{ color: 'var(--text-3)' }}>ลูกค้า</th>
              <th scope="col" className="text-left px-4 py-3 text-xs font-medium" style={{ color: 'var(--text-3)' }}>เบอร์ / LINE</th>
              <th scope="col" className="text-left px-4 py-3 text-xs font-medium" style={{ color: 'var(--text-3)' }}>โครงการ / ห้อง</th>
              <th scope="col" className="text-left px-4 py-3 text-xs font-medium" style={{ color: 'var(--text-3)' }}>ช่องทาง</th>
              <th scope="col" className="text-left px-4 py-3 text-xs font-medium" style={{ color: 'var(--text-3)' }}>Sales</th>
              <th scope="col" className="text-left px-4 py-3 text-xs font-medium" style={{ color: 'var(--text-3)' }}>สถานะ</th>
              <th scope="col" className="px-4 py-3"><span className="sr-only">แก้ไข</span></th>
            </tr>
          </thead>
          <tbody>
            {loading && <TableSpinner colSpan={7} />}
            {!loading && fetchError && <TableError colSpan={7} message={fetchError} onRetry={load} />}
            {!loading && !fetchError && filtered.length === 0 && (
              <tr><td colSpan={7} className="text-center py-12">
                <Users size={32} className="mx-auto text-[#484f58] mb-2" />
                <p className="text-[#8b949e] text-sm">ไม่พบลูกค้า</p>
              </td></tr>
            )}
            {filtered.map((c, i) => {
              const st = statusInfo(c.status)
              return (
                <tr key={c.id} className={`border-b border-[#21262d] hover:bg-[#1c2128] transition-colors ${i % 2 === 0 ? '' : 'bg-[#0d1117]/30'}`}>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <div className="w-7 h-7 rounded-full bg-[#30363d] flex items-center justify-center flex-shrink-0">
                        <span className="text-white text-xs font-medium">{c.customer_name[0]}</span>
                      </div>
                      <div>
                        <p className="text-white text-sm font-medium">{c.customer_name}</p>
                        <p className="text-[#484f58] text-xs font-mono">{c.id}</p>
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <p className="text-[#c9d1d9] text-sm">{c.phone || '-'}</p>
                    {c.line_id && <p className="text-[#484f58] text-xs">LINE: {c.line_id}</p>}
                  </td>
                  <td className="px-4 py-3">
                    <p className="text-[#c9d1d9] text-sm">{(c as any).projects?.name || '-'}</p>
                    {c.interested_room && <p className="text-[#58a6ff] text-xs">ห้อง {c.interested_room}</p>}
                  </td>
                  <td className="px-4 py-3 text-[#8b949e] text-sm capitalize">{c.source || '-'}</td>
                  <td className="px-4 py-3 text-[#c9d1d9] text-sm">{(c as any).users?.name || '-'}</td>
                  <td className="px-4 py-3">
                    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium ${st.color}`}>
                      <span aria-hidden="true">{st.icon}</span>{st.label}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <button onClick={() => {
                      setEditing(c)
                      setForm({ customer_name: c.customer_name, phone: c.phone, email: c.email, line_id: c.line_id, source: c.source, project_id: c.project_id, interested_room: c.interested_room, budget: c.budget, status: c.status, assigned_to: c.assigned_to, notes: c.notes })
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
        {!loading && (
          <div className="px-4 py-2 border-t border-[#21262d] text-[#484f58] text-xs">
            แสดง {filtered.length} จาก {customers.length} ราย
          </div>
        )}
      </div>



      {/* Modal */}
      <Modal open={open} onClose={() => setOpen(false)} title={editing ? 'แก้ไขข้อมูลลูกค้า' : 'เพิ่มลูกค้าใหม่'} size="lg">
        {/* Error banner at top — visible without scrolling */}
        {saveError && (
          <div role="alert" className="flex items-center gap-2 mb-4 p-3 rounded-xl text-xs" style={{ background: 'rgba(239,68,68,0.12)', color: '#ef4444' }}>
            <AlertCircle size={14} aria-hidden="true" />{saveError}
          </div>
        )}
        <div className="grid grid-cols-2 gap-4">
          <div className="col-span-2">
            <Input label="ชื่อ-นามสกุล" required value={form.customer_name} onChange={e => setForm({ ...form, customer_name: e.target.value })} placeholder="ชื่อ-นามสกุล" />
          </div>
          <Input label="เบอร์โทร" type="tel" value={form.phone} onChange={e => setForm({ ...form, phone: e.target.value })} placeholder="08x-xxx-xxxx" />
          <Input label="LINE ID" value={form.line_id} onChange={e => setForm({ ...form, line_id: e.target.value })} placeholder="@lineid" />
          <div className="col-span-2">
            <Input label="Email" type="email" value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} placeholder="email@example.com" />
          </div>
          <Select label="โครงการที่สนใจ" value={form.project_id} onChange={e => setForm({ ...form, project_id: e.target.value })} options={projectOptions} />
          <Input label="ห้องที่สนใจ" value={form.interested_room} onChange={e => setForm({ ...form, interested_room: e.target.value })} placeholder="เช่น A-1201" />
          <Select label="ช่องทาง" value={form.source} onChange={e => setForm({ ...form, source: e.target.value })} options={SOURCE_OPTIONS} />
          <Input label="งบประมาณ (บาท)" type="number" min={0} step={1000} value={form.budget} onChange={e => setForm({ ...form, budget: Number(e.target.value) })} />
          <Select label="สถานะ" value={form.status} onChange={e => setForm({ ...form, status: e.target.value })}
            options={STATUS_LIST.map(s => ({ value: s.value, label: `${s.icon} ${s.label}` }))} />
          <Select label="มอบหมายให้ Sales" value={form.assigned_to} onChange={e => setForm({ ...form, assigned_to: e.target.value })} options={userOptions} />
          <div className="col-span-2">
            <TextArea label="หมายเหตุ" value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} placeholder="บันทึกเพิ่มเติม..." />
          </div>
        </div>
        <div className="flex justify-end gap-3 mt-5">
          <button onClick={() => setOpen(false)} className="px-4 py-2 text-sm transition-colors" style={{ color: 'var(--text-3)' }}>ยกเลิก</button>
          <button onClick={save} disabled={saving || !form.customer_name}
            className="px-4 py-2 text-white text-sm rounded-xl transition-colors disabled:opacity-50"
            style={{ background: 'var(--accent-green)' }}>
            {saving ? 'กำลังบันทึก...' : 'บันทึก'}
          </button>
        </div>
      </Modal>
    </div>
  )
}
