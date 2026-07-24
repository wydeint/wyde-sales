'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Plus, ShieldCheck, Pencil, AlertTriangle, Search } from 'lucide-react'
import { PageSpinner, PageError } from '@/components/ui/StateUI'
import Modal from '@/components/ui/Modal'
import { Input, Select, TextArea } from '@/components/ui/Input'

interface Warranty {
  id: string
  customer_id: string
  project_id: string
  room: string
  handover_date: string
  warranty_start: string
  warranty_end: string
  warranty_months: number
  status: string
  notes: string
  created_at: string
  customers?: { customer_name: string; phone: string }
  projects?: { name: string }
}

interface Customer { id: string; customer_name: string }
interface Project { id: string; name: string }

const STATUS = [
  { value: 'active', label: 'ยังอยู่ในประกัน', color: 'badge badge-green' },
  { value: 'expiring_soon', label: 'ใกล้หมด', color: 'badge badge-orange' },
  { value: 'expired', label: 'หมดประกันแล้ว', color: 'badge badge-red' },
]

const emptyForm = {
  customer_id: '', project_id: '', room: '',
  handover_date: '', warranty_start: '', warranty_end: '',
  warranty_months: 12, status: 'active', notes: ''
}

const dateStr = (d: string) => d ? new Date(d).toLocaleDateString('th-TH', { day: '2-digit', month: 'short', year: '2-digit' }) : '-'

function daysLeft(endDate: string) {
  if (!endDate) return null
  return Math.ceil((new Date(endDate).getTime() - Date.now()) / 86400000)
}

function computedStatus(endDate: string): string {
  if (!endDate) return 'active'
  const days = daysLeft(endDate)!
  if (days <= 0) return 'expired'
  if (days <= 30) return 'expiring_soon'
  return 'active'
}

export default function WarrantyPage() {
  const supabase = createClient()
  const [warranties, setWarranties] = useState<Warranty[]>([])
  const [customers, setCustomers] = useState<Customer[]>([])
  const [projects, setProjects] = useState<Project[]>([])
  const [loading, setLoading] = useState(true)
  const [open, setOpen] = useState(false)
  const [editing, setEditing] = useState<Warranty | null>(null)
  const [form, setForm] = useState(emptyForm)
  const [saving, setSaving] = useState(false)
  const [fetchError, setFetchError] = useState('')
  const [search, setSearch] = useState('')
  const [projectFilter, setProjectFilter] = useState('')
  const [statusFilter, setStatusFilter] = useState('')

  async function load() {
    setLoading(true)
    setFetchError('')
    const [{ data: w, error: e1 }, { data: c, error: e2 }, { data: p, error: e3 }] = await Promise.all([
      supabase.from('warranties').select('*, customers(customer_name,phone), projects(name)').order('warranty_end', { ascending: true }),
      supabase.from('customers').select('id,customer_name').order('customer_name'),
      supabase.from('projects').select('id,name').order('name'),
    ])
    if (e1 || e2 || e3) { setFetchError((e1 ?? e2 ?? e3)!.message); setLoading(false); return }
    setWarranties(w || [])
    setCustomers(c || [])
    setProjects(p || [])
    setLoading(false)
  }

  useEffect(() => { load() }, [])

  function calcWarrantyEnd(start: string, months: number) {
    if (!start) return ''
    const d = new Date(start)
    d.setMonth(d.getMonth() + months)
    return d.toISOString().slice(0, 10)
  }

  function updateStart(val: string) {
    const end = calcWarrantyEnd(val, form.warranty_months)
    setForm({ ...form, warranty_start: val, warranty_end: end })
  }

  function updateMonths(val: number) {
    const end = calcWarrantyEnd(form.warranty_start, val)
    setForm({ ...form, warranty_months: val, warranty_end: end })
  }

  function genId() {
    const nums = warranties.map(w => parseInt(w.id.replace('WAR-', ''))).filter(n => !isNaN(n))
    return 'WAR-' + String(nums.length > 0 ? Math.max(...nums) + 1 : 1).padStart(3, '0')
  }

  async function save() {
    if (!form.customer_id) return
    setSaving(true)
    if (editing) {
      await supabase.from('warranties').update(form).eq('id', editing.id)
    } else {
      await supabase.from('warranties').insert({ id: genId(), ...form })
    }
    setSaving(false)
    setOpen(false)
    load()
  }

  const custOptions = [{ value: '', label: '— เลือกลูกค้า —' }, ...customers.map(c => ({ value: c.id, label: c.customer_name }))]
  const projOptions = [{ value: '', label: '— เลือกโครงการ —' }, ...projects.map(p => ({ value: p.id, label: p.name }))]
  const statusOptions = STATUS.map(s => ({ value: s.value, label: s.label }))

  const filtered = warranties.filter(w => {
    const q = search.toLowerCase()
    const qNorm = q.replace(/-/g, '')
    const matchSearch = !q ||
      ((w as any).customers?.customer_name || '').toLowerCase().includes(q) ||
      (w.room || '').toLowerCase().replace(/-/g, '').includes(qNorm)
    const matchProject = !projectFilter || w.project_id === projectFilter
    const matchStatus = !statusFilter || computedStatus(w.warranty_end) === statusFilter
    return matchSearch && matchProject && matchStatus
  })

  const active = filtered.filter(w => computedStatus(w.warranty_end) === 'active' || computedStatus(w.warranty_end) === 'expiring_soon')
  const expired = filtered.filter(w => computedStatus(w.warranty_end) === 'expired')
  const expiringSoon = filtered.filter(w => computedStatus(w.warranty_end) === 'expiring_soon')

  if (loading) return <PageSpinner />
  if (fetchError) return <PageError message={fetchError} onRetry={load} />

  return (
    <div className="page-content">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-page-title" style={{ color: 'var(--text-1)' }}>Warranty</h1>
          <p className="text-sm mt-0.5" style={{ color: 'var(--text-2)' }}>ติดตามระยะเวลาประกันผลงาน</p>
        </div>
        <button onClick={() => { setEditing(null); setForm(emptyForm); setOpen(true) }}
          className="flex items-center gap-2 btn-purple text-white px-4 py-2 rounded-lg text-sm font-semibold transition-colors">
          <Plus size={16} />เพิ่มประกัน
        </button>
      </div>

      {/* Alert Banner — expiring soon */}
      {expiringSoon.length > 0 && (
        <div className="rounded-[18px] p-4 mb-4 flex items-start gap-3" style={{ background: 'rgba(251,191,36,0.08)', border: '1px solid rgba(251,191,36,0.3)' }}>
          <AlertTriangle size={16} className="text-yellow-400 flex-shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-semibold text-yellow-400">ประกันใกล้หมด {expiringSoon.length} ราย</p>
            <p className="text-xs mt-0.5" style={{ color: 'var(--text-2)' }}>
              {expiringSoon.map(w => `${(w as any).customers?.customer_name || w.room} (เหลือ ${daysLeft(w.warranty_end)} วัน)`).join(' · ')}
            </p>
          </div>
        </div>
      )}

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3 mb-5 flex-wrap">
        <div className="relative flex-1 min-w-48">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: 'var(--text-3)' }} />
          <input value={search} onChange={e => setSearch(e.target.value)}
            placeholder="ค้นหาชื่อลูกค้า / เลขห้อง..."
            className="w-full pl-9 pr-4 py-2.5 rounded-[8px] text-sm focus:outline-none"
            style={{ background: 'var(--card-bg)', border: '1px solid var(--card-border)', color: 'var(--text-1)' }} />
        </div>
        <select value={projectFilter} onChange={e => setProjectFilter(e.target.value)}
          className="field-input" style={{ width: 'auto' }}>
          <option value="">ทุกโครงการ</option>
          {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
        <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)}
          className="field-input" style={{ width: 'auto' }}>
          <option value="">ทุกสถานะ</option>
          {STATUS.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
        </select>
      </div>

      {/* Summary */}
      <div className="grid grid-cols-3 gap-4 mb-6">
        {STATUS.map(s => (
          <div key={s.value} className="rounded-[18px] p-4" style={{ background: 'var(--card-bg)', border: '1px solid var(--card-border)' }}>
            <p className="text-xs mb-1" style={{ color: 'var(--text-2)' }}>{s.label}</p>
            <p className="text-kpi-number" style={{ color: s.value === 'active' ? 'var(--accent-green)' : s.value === 'expiring_soon' ? 'var(--accent-orange)' : 'var(--accent-red)' }}>{warranties.filter(w => computedStatus(w.warranty_end) === s.value).length}</p>
          </div>
        ))}
      </div>

      {/* Active warranties */}
      {active.length > 0 && (
        <div className="mb-6">
          <h2 className="text-xs font-bold mb-3" style={{ color: 'var(--text-2)' }}>อยู่ในประกัน ({active.length})</h2>
          <div className="rounded-[18px] overflow-hidden tbl-scroll" style={{ background: 'var(--card-bg)', border: '1px solid var(--card-border)' }}>
            <table className="w-full">
              <thead>
                <tr style={{ borderBottom: '1px solid var(--divider)' }}>
                  <th className="text-left px-4 py-3 text-xs" style={{ color: 'var(--text-2)' }}>ลูกค้า</th>
                  <th className="text-left px-4 py-3 text-xs" style={{ color: 'var(--text-2)' }}>โครงการ / ห้อง</th>
                  <th className="text-left px-4 py-3 text-xs" style={{ color: 'var(--text-2)' }}>เริ่มประกัน</th>
                  <th className="text-left px-4 py-3 text-xs" style={{ color: 'var(--text-2)' }}>หมดประกัน</th>
                  <th className="text-left px-4 py-3 text-xs" style={{ color: 'var(--text-2)' }}>คงเหลือ</th>
                  <th className="text-left px-4 py-3 text-xs" style={{ color: 'var(--text-2)' }}>สถานะ</th>
                  <th className="px-4 py-3" />
                </tr>
              </thead>
              <tbody>
                {active.map((w, i) => {
                  const st = STATUS.find(s => s.value === computedStatus(w.warranty_end)) || STATUS[0]
                  const days = daysLeft(w.warranty_end)
                  return (
                    <tr key={w.id} className="transition-colors" style={{ borderBottom: '1px solid var(--divider)', background: i % 2 !== 0 ? 'var(--hover-bg)' : undefined }}>
                      <td className="px-4 py-3">
                        <p className="text-sm" style={{ color: 'var(--text-1)' }}>{(w as any).customers?.customer_name || '-'}</p>
                        <p className="text-xs" style={{ color: 'var(--text-3)' }}>{(w as any).customers?.phone}</p>
                      </td>
                      <td className="px-4 py-3">
                        <p className="text-sm" style={{ color: 'var(--text-2)' }}>{(w as any).projects?.name || '-'}</p>
                        <p className="text-accent-blue text-xs">{w.room}</p>
                      </td>
                      <td className="px-4 py-3 text-sm" style={{ color: 'var(--text-2)' }}>{dateStr(w.warranty_start)}</td>
                      <td className="px-4 py-3 text-sm" style={{ color: 'var(--text-2)' }}>{dateStr(w.warranty_end)}</td>
                      <td className="px-4 py-3">
                        {days !== null && (
                          <span className={`text-sm font-semibold ${days <= 30 ? 'text-yellow-400' : 'text-green-400'}`}>
                            {days > 0 ? `${days} วัน` : 'หมดแล้ว'}
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <span className={st.color}>{st.label}</span>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          {computedStatus(w.warranty_end) === 'expiring_soon' && (
                            <button
                              onClick={() => window.open(`tel:${(w as any).customers?.phone || ''}`, '_self')}
                              className="text-xs px-2 py-1 rounded-lg font-semibold"
                              style={{ background: 'rgba(251,191,36,0.15)', color: '#fbbf24', border: '1px solid rgba(251,191,36,0.3)' }}>
                              📞 นัดตรวจ
                            </button>
                          )}
                          <button onClick={() => {
                            setEditing(w)
                            setForm({ customer_id: w.customer_id, project_id: w.project_id, room: w.room, handover_date: w.handover_date || '', warranty_start: w.warranty_start || '', warranty_end: w.warranty_end || '', warranty_months: w.warranty_months, status: w.status, notes: w.notes || '' })
                            setOpen(true)
                          }} className="transition-colors" style={{ color: 'var(--text-2)' }}>
                            <Pencil size={14} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Expired */}
      {expired.length > 0 && (
        <div>
          <h2 className="text-xs font-bold mb-3" style={{ color: 'var(--text-2)' }}>หมดประกันแล้ว ({expired.length})</h2>
          <div className="rounded-[18px] overflow-hidden" style={{ background: 'var(--card-bg)', border: '1px solid var(--card-border)', opacity: 0.75 }}>
            <table className="w-full">
              <thead>
                <tr style={{ borderBottom: '1px solid var(--divider)' }}>
                  <th className="text-left px-4 py-3 text-xs" style={{ color: 'var(--text-2)' }}>ลูกค้า</th>
                  <th className="text-left px-4 py-3 text-xs" style={{ color: 'var(--text-2)' }}>โครงการ / ห้อง</th>
                  <th className="text-left px-4 py-3 text-xs" style={{ color: 'var(--text-2)' }}>หมดประกัน</th>
                  <th className="px-4 py-3" />
                </tr>
              </thead>
              <tbody>
                {expired.map((w, i) => (
                  <tr key={w.id} className="transition-colors" style={{ borderBottom: '1px solid var(--divider)', background: i % 2 !== 0 ? 'var(--hover-bg)' : undefined }}>
                    <td className="px-4 py-3 text-sm" style={{ color: 'var(--text-1)' }}>{(w as any).customers?.customer_name || '-'}</td>
                    <td className="px-4 py-3">
                      <p className="text-sm" style={{ color: 'var(--text-2)' }}>{(w as any).projects?.name || '-'}</p>
                      <p className="text-accent-blue text-xs">{w.room}</p>
                    </td>
                    <td className="px-4 py-3 text-red-400 text-sm">{dateStr(w.warranty_end)}</td>
                    <td className="px-4 py-3">
                      <button onClick={() => {
                        setEditing(w)
                        setForm({ customer_id: w.customer_id, project_id: w.project_id, room: w.room, handover_date: w.handover_date || '', warranty_start: w.warranty_start || '', warranty_end: w.warranty_end || '', warranty_months: w.warranty_months, status: w.status, notes: w.notes || '' })
                        setOpen(true)
                      }} className="transition-colors" style={{ color: 'var(--text-2)' }}>
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

      {!loading && warranties.length === 0 && (
        <div className="text-center py-16 rounded-[18px]" style={{ background: 'var(--card-bg)', border: '1px solid var(--card-border)' }}>
          <ShieldCheck size={32} className="mx-auto mb-2" style={{ color: 'var(--text-3)' }} />
          <p className="text-sm" style={{ color: 'var(--text-2)' }}>ยังไม่มีข้อมูลประกัน</p>
        </div>
      )}

      {/* Modal */}
      <Modal open={open} onClose={() => setOpen(false)} title={editing ? 'แก้ไขประกัน' : 'เพิ่มประกันใหม่'} size="lg">
        <div className="grid grid-cols-2 gap-4">
          <Select label="ลูกค้า *" value={form.customer_id} onChange={e => setForm({ ...form, customer_id: e.target.value })} options={custOptions} />
          <Select label="โครงการ" value={form.project_id} onChange={e => setForm({ ...form, project_id: e.target.value })} options={projOptions} />
          <Input label="ห้อง" value={form.room} onChange={e => setForm({ ...form, room: e.target.value })} placeholder="A-1201" />
          <Input label="วัน Handover" type="date" lang="th-TH" value={form.handover_date} onChange={e => setForm({ ...form, handover_date: e.target.value })} />
          <Input label="วันเริ่มประกัน" type="date" lang="th-TH" value={form.warranty_start} onChange={e => updateStart(e.target.value)} />
          <Input label="ระยะเวลาประกัน (เดือน)" type="number" value={form.warranty_months} onChange={e => updateMonths(Number(e.target.value))} />
          <div className="col-span-2 rounded-lg p-3" style={{ background: 'var(--hover-bg)' }}>
            <p className="text-xs mb-1" style={{ color: 'var(--text-2)' }}>วันหมดประกัน (คำนวณอัตโนมัติ)</p>
            <p className="font-semibold" style={{ color: 'var(--text-1)' }}>{form.warranty_end ? dateStr(form.warranty_end) : '-'}</p>
          </div>
          <Select label="สถานะ" value={form.status} onChange={e => setForm({ ...form, status: e.target.value })} options={statusOptions} />
          <div className="col-span-2">
            <TextArea label="หมายเหตุ" value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} />
          </div>
        </div>
        <div className="flex justify-end gap-3 mt-5">
          <button onClick={() => setOpen(false)} className="px-4 py-2 text-sm transition-colors" style={{ color: 'var(--text-2)' }}>ยกเลิก</button>
          <button onClick={save} disabled={saving || !form.customer_id} className="px-4 py-2 btn-purple disabled:opacity-50 text-white text-sm rounded-lg transition-colors">
            {saving ? 'กำลังบันทึก...' : 'บันทึก'}
          </button>
        </div>
      </Modal>
    </div>
  )
}

