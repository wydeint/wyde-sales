'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Plus, Users, Pencil, Search, Upload, CheckCircle, XCircle, AlertCircle } from 'lucide-react'
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
  { value: 'new', label: 'ใหม่', color: 'bg-blue-500/20 text-blue-400' },
  { value: 'interested', label: 'สนใจ', color: 'bg-cyan-500/20 text-cyan-400' },
  { value: 'quoted', label: 'เสนอราคาแล้ว', color: 'bg-yellow-500/20 text-yellow-400' },
  { value: 'booked', label: 'จอง', color: 'bg-orange-500/20 text-orange-400' },
  { value: 'close_pending', label: 'รอปิด', color: 'bg-purple-500/20 text-purple-400' },
  { value: 'closed', label: 'ปิดแล้ว', color: 'bg-green-500/20 text-green-400' },
  { value: 'lost', label: 'หลุด', color: 'bg-red-500/20 text-red-400' },
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

interface CsvRow {
  customer_name: string; phone: string; email: string; line_id: string
  source: string; project_id: string; interested_room: string
  budget: number; status: string; assigned_to: string; notes: string
  _valid: boolean; _error: string
}

// Map CSV header synonyms → DB field
const CSV_MAP: Record<string, string> = {
  'ชื่อ': 'customer_name', 'name': 'customer_name', 'customer_name': 'customer_name', 'ชื่อ-นามสกุล': 'customer_name',
  'เบอร์': 'phone', 'phone': 'phone', 'tel': 'phone', 'โทร': 'phone',
  'email': 'email', 'อีเมล': 'email',
  'line': 'line_id', 'line_id': 'line_id', 'ไลน์': 'line_id',
  'source': 'source', 'ช่องทาง': 'source',
  'project': 'project_id', 'project_id': 'project_id', 'โครงการ': 'project_id',
  'room': 'interested_room', 'ห้อง': 'interested_room', 'interested_room': 'interested_room',
  'budget': 'budget', 'งบ': 'budget', 'งบประมาณ': 'budget',
  'status': 'status', 'สถานะ': 'status',
  'sales': 'assigned_to', 'assigned_to': 'assigned_to', 'Sales': 'assigned_to',
  'notes': 'notes', 'หมายเหตุ': 'notes',
}

function parseCSV(text: string): { headers: string[]; rows: Record<string, string>[] } {
  const lines = text.trim().split(/\r?\n/)
  if (lines.length < 2) return { headers: [], rows: [] }
  const headers = lines[0].split(',').map(h => h.trim().replace(/^["']|["']$/g, ''))
  const rows = lines.slice(1).map(line => {
    const vals = line.split(',').map(v => v.trim().replace(/^["']|["']$/g, ''))
    const obj: Record<string, string> = {}
    headers.forEach((h, i) => { obj[h] = vals[i] || '' })
    return obj
  })
  return { headers, rows }
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
  const [search, setSearch] = useState('')
  const [filterStatus, setFilterStatus] = useState('')
  const [filterProject, setFilterProject] = useState('')

  // CSV import state
  const [csvOpen, setCsvOpen] = useState(false)
  const [csvRows, setCsvRows] = useState<CsvRow[]>([])
  const [csvHeaders, setCsvHeaders] = useState<string[]>([])
  const [csvImporting, setCsvImporting] = useState(false)
  const [csvResult, setCsvResult] = useState<{ done: number; skipped: number } | null>(null)

  async function load() {
    setLoading(true)
    const [{ data: c }, { data: p }, { data: u }] = await Promise.all([
      supabase.from('customers').select('id, customer_name, phone, email, line_id, source, project_id, interested_room, budget, status, assigned_to, notes, created_at, projects(name), users!customers_assigned_to_fkey(name)').order('created_at', { ascending: false }),
      supabase.from('projects').select('id,name').eq('active', true).order('name'),
      supabase.from('users').select('id,name').eq('active', true).order('name'),
    ])
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
    if (editing) {
      await supabase.from('customers').update(form).eq('id', editing.id)
    } else {
      await supabase.from('customers').insert({ id: genId(), ...form })
    }
    setSaving(false)
    setOpen(false)
    load()
  }

  function handleCsvFile(file: File) {
    setCsvResult(null)
    const reader = new FileReader()
    reader.onload = e => {
      const text = e.target?.result as string
      const { headers, rows } = parseCSV(text)
      setCsvHeaders(headers)
      const parsed: CsvRow[] = rows.map(row => {
        const mapped: any = { _valid: true, _error: '' }
        for (const [csvH, val] of Object.entries(row)) {
          const dbField = CSV_MAP[csvH] || CSV_MAP[csvH.toLowerCase()]
          if (dbField) mapped[dbField] = val
        }
        // Resolve project name → id
        if (mapped.project_id && !mapped.project_id.startsWith('PRJ')) {
          const proj = projects.find(p => p.name.toLowerCase().includes(mapped.project_id.toLowerCase()))
          if (proj) mapped.project_id = proj.id
          else { mapped._valid = false; mapped._error = `ไม่พบโครงการ: ${mapped.project_id}` }
        }
        // Resolve user name → id
        if (mapped.assigned_to && mapped.assigned_to.length > 2) {
          const u = users.find(x => x.name.toLowerCase().includes(mapped.assigned_to.toLowerCase()))
          if (u) mapped.assigned_to = u.id
        }
        if (!mapped.customer_name) { mapped._valid = false; mapped._error = 'ไม่มีชื่อลูกค้า' }
        mapped.budget = Number(mapped.budget) || 0
        mapped.status = mapped.status || 'new'
        return mapped as CsvRow
      }).filter(r => r.customer_name || r._error)
      setCsvRows(parsed)
    }
    reader.readAsText(file, 'UTF-8')
  }

  async function importCsv() {
    const valid = csvRows.filter(r => r._valid)
    if (!valid.length) return
    setCsvImporting(true)
    let done = 0, skipped = 0
    const existingNums = customers.map(c => parseInt(c.id.replace('CST-', ''))).filter(n => !isNaN(n))
    let nextNum = existingNums.length > 0 ? Math.max(...existingNums) + 1 : 1
    for (const row of valid) {
      const { _valid, _error, ...data } = row
      const id = 'CST-' + String(nextNum++).padStart(4, '0')
      const { error } = await supabase.from('customers').insert({ id, ...data })
      if (error) skipped++; else done++
    }
    setCsvImporting(false)
    setCsvResult({ done, skipped })
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
          <button onClick={() => { setCsvRows([]); setCsvResult(null); setCsvOpen(true) }}
            className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors"
            style={{ background: 'var(--hover-bg)', color: 'var(--text-2)', border: '1px solid var(--glass-border)' }}>
            <Upload size={15} />นำเข้า CSV
          </button>
          <button onClick={() => { setEditing(null); setForm(emptyForm); setOpen(true) }}
            className="flex items-center gap-2 bg-[#238636] hover:bg-[#2ea043] text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors">
            <Plus size={16} />เพิ่มลูกค้า
          </button>
        </div>
      </div>

      {/* Filters */}
      <div className="flex gap-3 mb-4 flex-wrap">
        <div className="flex items-center gap-2 bg-[#161b22] border border-[#30363d] rounded-lg px-3 py-2 flex-1 min-w-[200px]">
          <Search size={14} className="text-[#484f58]" />
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="ค้นหาชื่อ เบอร์ ห้อง..."
            className="bg-transparent text-white text-sm placeholder-[#484f58] outline-none flex-1"
          />
        </div>
        <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)}
          className="bg-[#161b22] border border-[#30363d] rounded-lg px-3 py-2 text-sm text-white outline-none">
          {statusOptions.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
        <select value={filterProject} onChange={e => setFilterProject(e.target.value)}
          className="bg-[#161b22] border border-[#30363d] rounded-lg px-3 py-2 text-sm text-white outline-none">
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
            <tr className="border-b border-[#21262d]">
              <th className="text-left px-4 py-3 text-[#8b949e] text-xs font-medium">ลูกค้า</th>
              <th className="text-left px-4 py-3 text-[#8b949e] text-xs font-medium">เบอร์ / LINE</th>
              <th className="text-left px-4 py-3 text-[#8b949e] text-xs font-medium">โครงการ / ห้อง</th>
              <th className="text-left px-4 py-3 text-[#8b949e] text-xs font-medium">ช่องทาง</th>
              <th className="text-left px-4 py-3 text-[#8b949e] text-xs font-medium">Sales</th>
              <th className="text-left px-4 py-3 text-[#8b949e] text-xs font-medium">สถานะ</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody>
            {loading && <tr><td colSpan={7} className="text-center py-12 text-[#8b949e]">กำลังโหลด...</td></tr>}
            {!loading && filtered.length === 0 && (
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
                    <span className={`inline-block px-2 py-0.5 rounded text-xs font-medium ${st.color}`}>{st.label}</span>
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

      {/* CSV Import Modal */}
      <Modal open={csvOpen} onClose={() => setCsvOpen(false)} title="นำเข้าลูกค้าจาก CSV" size="lg">
        {csvResult ? (
          <div className="text-center py-6">
            <CheckCircle size={40} className="mx-auto mb-3 text-green-400" />
            <p className="text-lg font-semibold" style={{ color: 'var(--text-1)' }}>นำเข้าสำเร็จ</p>
            <p className="text-sm mt-1" style={{ color: 'var(--text-2)' }}>
              เพิ่ม {csvResult.done} ราย · ข้าม {csvResult.skipped} ราย
            </p>
            <button onClick={() => setCsvOpen(false)} className="mt-4 px-6 py-2 bg-[#238636] hover:bg-[#2ea043] text-white text-sm rounded-lg transition-colors">
              ปิด
            </button>
          </div>
        ) : (
          <>
            {/* Drop zone */}
            {csvRows.length === 0 && (
              <div
                className="border-2 border-dashed rounded-xl p-8 text-center cursor-pointer mb-4 transition-colors"
                style={{ borderColor: 'var(--divider)', background: 'var(--hover-bg)' }}
                onDragOver={e => e.preventDefault()}
                onDrop={e => { e.preventDefault(); const f = e.dataTransfer.files[0]; if (f) handleCsvFile(f) }}
                onClick={() => { const i = document.createElement('input'); i.type = 'file'; i.accept = '.csv'; i.onchange = (e: any) => handleCsvFile(e.target.files[0]); i.click() }}
              >
                <Upload size={28} className="mx-auto mb-2" style={{ color: 'var(--text-3)' }} />
                <p className="text-sm font-medium" style={{ color: 'var(--text-2)' }}>วาง CSV หรือคลิกเพื่อเลือกไฟล์</p>
                <p className="text-xs mt-1" style={{ color: 'var(--text-3)' }}>
                  คอลัมน์: ชื่อ, เบอร์, LINE, โครงการ, ห้อง, งบ, สถานะ, Sales
                </p>
              </div>
            )}

            {/* Preview table */}
            {csvRows.length > 0 && (
              <>
                <div className="flex items-center justify-between mb-3">
                  <p className="text-sm font-medium" style={{ color: 'var(--text-1)' }}>
                    พบ {csvRows.length} แถว · ✅ {csvRows.filter(r => r._valid).length} · ❌ {csvRows.filter(r => !r._valid).length}
                  </p>
                  <button onClick={() => setCsvRows([])} className="text-xs px-3 py-1 rounded-lg" style={{ color: 'var(--text-3)', background: 'var(--hover-bg)' }}>
                    เลือกใหม่
                  </button>
                </div>
                <div className="overflow-auto max-h-64 rounded-xl border" style={{ borderColor: 'var(--divider)' }}>
                  <table className="w-full text-xs">
                    <thead>
                      <tr style={{ background: 'var(--hover-bg)', borderBottom: '1px solid var(--divider)' }}>
                        <th className="px-3 py-2 text-left" style={{ color: 'var(--text-3)' }}></th>
                        <th className="px-3 py-2 text-left" style={{ color: 'var(--text-3)' }}>ชื่อ</th>
                        <th className="px-3 py-2 text-left" style={{ color: 'var(--text-3)' }}>เบอร์</th>
                        <th className="px-3 py-2 text-left" style={{ color: 'var(--text-3)' }}>โครงการ</th>
                        <th className="px-3 py-2 text-left" style={{ color: 'var(--text-3)' }}>ห้อง</th>
                        <th className="px-3 py-2 text-left" style={{ color: 'var(--text-3)' }}>สถานะ</th>
                      </tr>
                    </thead>
                    <tbody>
                      {csvRows.map((r, i) => (
                        <tr key={i} style={{ borderBottom: '1px solid var(--divider)', background: r._valid ? 'transparent' : 'rgba(239,68,68,0.05)' }}>
                          <td className="px-3 py-2">
                            {r._valid
                              ? <CheckCircle size={12} className="text-green-400" />
                              : <XCircle size={12} className="text-red-400" title={r._error} />}
                          </td>
                          <td className="px-3 py-2" style={{ color: 'var(--text-1)' }}>{r.customer_name || '—'}</td>
                          <td className="px-3 py-2" style={{ color: 'var(--text-2)' }}>{r.phone || '—'}</td>
                          <td className="px-3 py-2" style={{ color: 'var(--text-2)' }}>
                            {projects.find(p => p.id === r.project_id)?.name || r.project_id || '—'}
                          </td>
                          <td className="px-3 py-2" style={{ color: 'var(--text-2)' }}>{r.interested_room || '—'}</td>
                          <td className="px-3 py-2" style={{ color: 'var(--text-2)' }}>{r.status || 'new'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <div className="flex justify-end gap-3 mt-4">
                  <button onClick={() => setCsvOpen(false)} className="px-4 py-2 text-sm transition-colors" style={{ color: 'var(--text-3)' }}>ยกเลิก</button>
                  <button onClick={importCsv} disabled={csvImporting || csvRows.filter(r => r._valid).length === 0}
                    className="px-5 py-2 bg-[#238636] hover:bg-[#2ea043] disabled:opacity-50 text-white text-sm rounded-lg transition-colors flex items-center gap-2">
                    {csvImporting ? 'กำลังนำเข้า...' : `นำเข้า ${csvRows.filter(r => r._valid).length} ราย`}
                  </button>
                </div>
              </>
            )}
          </>
        )}
      </Modal>

      {/* Modal */}
      <Modal open={open} onClose={() => setOpen(false)} title={editing ? 'แก้ไขข้อมูลลูกค้า' : 'เพิ่มลูกค้าใหม่'} size="lg">
        <div className="grid grid-cols-2 gap-4">
          <div className="col-span-2">
            <Input label="ชื่อ-นามสกุล *" value={form.customer_name} onChange={e => setForm({ ...form, customer_name: e.target.value })} placeholder="ชื่อ-นามสกุล" />
          </div>
          <Input label="เบอร์โทร" value={form.phone} onChange={e => setForm({ ...form, phone: e.target.value })} placeholder="08x-xxx-xxxx" />
          <Input label="LINE ID" value={form.line_id} onChange={e => setForm({ ...form, line_id: e.target.value })} placeholder="@lineid" />
          <div className="col-span-2">
            <Input label="Email" type="email" value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} placeholder="email@example.com" />
          </div>
          <Select label="โครงการที่สนใจ" value={form.project_id} onChange={e => setForm({ ...form, project_id: e.target.value })} options={projectOptions} />
          <Input label="ห้องที่สนใจ" value={form.interested_room} onChange={e => setForm({ ...form, interested_room: e.target.value })} placeholder="เช่น A-1201" />
          <Select label="ช่องทาง" value={form.source} onChange={e => setForm({ ...form, source: e.target.value })} options={SOURCE_OPTIONS} />
          <Input label="งบประมาณ (บาท)" type="number" value={form.budget} onChange={e => setForm({ ...form, budget: Number(e.target.value) })} />
          <Select label="สถานะ" value={form.status} onChange={e => setForm({ ...form, status: e.target.value })}
            options={STATUS_LIST.map(s => ({ value: s.value, label: s.label }))} />
          <Select label="มอบหมายให้ Sales" value={form.assigned_to} onChange={e => setForm({ ...form, assigned_to: e.target.value })} options={userOptions} />
          <div className="col-span-2">
            <TextArea label="หมายเหตุ" value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} placeholder="บันทึกเพิ่มเติม..." />
          </div>
        </div>
        <div className="flex justify-end gap-3 mt-5">
          <button onClick={() => setOpen(false)} className="px-4 py-2 text-[#8b949e] hover:text-white text-sm transition-colors">ยกเลิก</button>
          <button onClick={save} disabled={saving || !form.customer_name} className="px-4 py-2 bg-[#238636] hover:bg-[#2ea043] disabled:opacity-50 text-white text-sm rounded-lg transition-colors">
            {saving ? 'กำลังบันทึก...' : 'บันทึก'}
          </button>
        </div>
      </Modal>
    </div>
  )
}
