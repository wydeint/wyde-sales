'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Plus, DollarSign, Pencil, CheckCircle } from 'lucide-react'
import { TableSpinner, TableError } from '@/components/ui/StateUI'
import Modal from '@/components/ui/Modal'
import { Input, Select, TextArea } from '@/components/ui/Input'

interface Commission {
  id: string
  customer_id: string
  sales_person_id: string
  project_id: string
  room: string
  sale_price: number
  commission_rate: number
  commission_amount: number
  bonus: number
  total_commission: number
  status: string
  paid_date: string
  notes: string
  created_at: string
  customers?: { name: string }
  users?: { name: string }
  projects?: { name: string }
}

interface Customer { id: string; name: string }
interface User { id: string; name: string }
interface Project { id: string; name: string }

const STATUS = [
  { value: 'pending', label: 'รอดำเนินการ', color: 'bg-yellow-500/20 text-yellow-400' },
  { value: 'approved', label: 'อนุมัติแล้ว', color: 'bg-blue-500/20 text-blue-400' },
  { value: 'paid', label: 'จ่ายแล้ว', color: 'bg-green-500/20 text-green-400' },
]

const emptyForm = {
  customer_id: '', sales_person_id: '', project_id: '', room: '',
  sale_price: 0, commission_rate: 3, commission_amount: 0,
  bonus: 0, total_commission: 0, status: 'pending', paid_date: '', notes: ''
}

const f = (v: number) => v ? '฿' + v.toLocaleString() : '฿0'
const pct = (v: number) => v ? v + '%' : '0%'

export default function CommissionPage() {
  const supabase = createClient()
  const [commissions, setCommissions] = useState<Commission[]>([])
  const [customers, setCustomers] = useState<Customer[]>([])
  const [users, setUsers] = useState<User[]>([])
  const [projects, setProjects] = useState<Project[]>([])
  const [loading, setLoading] = useState(true)
  const [open, setOpen] = useState(false)
  const [editing, setEditing] = useState<Commission | null>(null)
  const [form, setForm] = useState(emptyForm)
  const [saving, setSaving] = useState(false)
  const [fetchError, setFetchError] = useState('')

  async function load() {
    setLoading(true)
    setFetchError('')
    const [
      { data: com, error: e1 }, { data: cust, error: e2 },
      { data: u, error: e3 }, { data: p, error: e4 },
    ] = await Promise.all([
      supabase.from('commissions').select('*, customers(name), users!commissions_sales_person_id_fkey(name), projects(name)').order('created_at', { ascending: false }),
      supabase.from('customers').select('id,name').eq('status', 'closed').order('name'),
      supabase.from('users').select('id,name').eq('active', true).order('name'),
      supabase.from('projects').select('id,name').order('name'),
    ])
    if (e1 || e2 || e3 || e4) { setFetchError((e1 ?? e2 ?? e3 ?? e4)!.message); setLoading(false); return }
    setCommissions(com || [])
    setCustomers(cust || [])
    setUsers(u || [])
    setProjects(p || [])
    setLoading(false)
  }

  useEffect(() => { load() }, [])

  function calcCommission(price: number, rate: number, bonus: number) {
    const comm = Math.round(price * rate / 100)
    return { commission_amount: comm, total_commission: comm + bonus }
  }

  function updatePrice(val: number) {
    const { commission_amount, total_commission } = calcCommission(val, form.commission_rate, form.bonus)
    setForm({ ...form, sale_price: val, commission_amount, total_commission })
  }

  function updateRate(val: number) {
    const { commission_amount, total_commission } = calcCommission(form.sale_price, val, form.bonus)
    setForm({ ...form, commission_rate: val, commission_amount, total_commission })
  }

  function updateBonus(val: number) {
    setForm({ ...form, bonus: val, total_commission: form.commission_amount + val })
  }

  function genId() {
    const nums = commissions.map(c => parseInt(c.id.replace('COM-', ''))).filter(n => !isNaN(n))
    return 'COM-' + String(nums.length > 0 ? Math.max(...nums) + 1 : 1).padStart(3, '0')
  }

  async function save() {
    if (!form.customer_id || !form.sales_person_id) return
    setSaving(true)
    if (editing) {
      await supabase.from('commissions').update(form).eq('id', editing.id)
    } else {
      await supabase.from('commissions').insert({ id: genId(), ...form })
    }
    setSaving(false)
    setOpen(false)
    load()
  }

  const custOptions = [{ value: '', label: '— เลือกลูกค้า —' }, ...customers.map(c => ({ value: c.id, label: c.name }))]
  const userOptions = [{ value: '', label: '— เลือก Sales —' }, ...users.map(u => ({ value: u.id, label: u.name }))]
  const projOptions = [{ value: '', label: '— เลือกโครงการ —' }, ...projects.map(p => ({ value: p.id, label: p.name }))]
  const statusOptions = STATUS.map(s => ({ value: s.value, label: s.label }))

  const totalPending = commissions.filter(c => c.status === 'pending').reduce((s, c) => s + c.total_commission, 0)
  const totalApproved = commissions.filter(c => c.status === 'approved').reduce((s, c) => s + c.total_commission, 0)
  const totalPaid = commissions.filter(c => c.status === 'paid').reduce((s, c) => s + c.total_commission, 0)

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-bold" style={{ color: 'var(--text-1)' }}>Commission</h1>
          <p className="text-sm mt-0.5" style={{ color: 'var(--text-2)' }}>ติดตามค่าคอมมิชชั่นทีมขาย</p>
        </div>
        <button onClick={() => { setEditing(null); setForm(emptyForm); setOpen(true) }}
          className="flex items-center gap-2 bg-[#238636] hover:bg-[#2ea043] text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors">
          <Plus size={16} />บันทึก Commission
        </button>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-3 gap-4 mb-6">
        <div className="rounded-xl p-4" style={{ background: 'var(--card-bg)', border: '1px solid var(--card-border)' }}>
          <p className="text-xs mb-1" style={{ color: 'var(--text-2)' }}>รอดำเนินการ</p>
          <p className="text-yellow-400 text-xl font-bold">{f(totalPending)}</p>
          <p className="text-xs mt-1" style={{ color: 'var(--text-3)' }}>{commissions.filter(c => c.status === 'pending').length} รายการ</p>
        </div>
        <div className="rounded-xl p-4" style={{ background: 'var(--card-bg)', border: '1px solid var(--card-border)' }}>
          <p className="text-xs mb-1" style={{ color: 'var(--text-2)' }}>อนุมัติแล้ว</p>
          <p className="text-blue-400 text-xl font-bold">{f(totalApproved)}</p>
          <p className="text-xs mt-1" style={{ color: 'var(--text-3)' }}>{commissions.filter(c => c.status === 'approved').length} รายการ</p>
        </div>
        <div className="rounded-xl p-4" style={{ background: 'var(--card-bg)', border: '1px solid var(--card-border)' }}>
          <p className="text-xs mb-1" style={{ color: 'var(--text-2)' }}>จ่ายแล้ว</p>
          <p className="text-green-400 text-xl font-bold">{f(totalPaid)}</p>
          <p className="text-xs mt-1" style={{ color: 'var(--text-3)' }}>{commissions.filter(c => c.status === 'paid').length} รายการ</p>
        </div>
      </div>

      {/* Table */}
      <div className="rounded-xl overflow-hidden" style={{ background: 'var(--card-bg)', border: '1px solid var(--card-border)' }}>
        <table className="w-full">
          <thead>
            <tr style={{ borderBottom: '1px solid var(--divider)' }}>
              <th className="text-left px-4 py-3 text-xs" style={{ color: 'var(--text-2)' }}>ID</th>
              <th className="text-left px-4 py-3 text-xs" style={{ color: 'var(--text-2)' }}>ลูกค้า / ห้อง</th>
              <th className="text-left px-4 py-3 text-xs" style={{ color: 'var(--text-2)' }}>Sales</th>
              <th className="text-right px-4 py-3 text-xs" style={{ color: 'var(--text-2)' }}>ราคาขาย</th>
              <th className="text-right px-4 py-3 text-xs" style={{ color: 'var(--text-2)' }}>Rate</th>
              <th className="text-right px-4 py-3 text-xs" style={{ color: 'var(--text-2)' }}>Commission</th>
              <th className="text-right px-4 py-3 text-xs" style={{ color: 'var(--text-2)' }}>Bonus</th>
              <th className="text-right px-4 py-3 text-xs" style={{ color: 'var(--text-2)' }}>รวม</th>
              <th className="text-left px-4 py-3 text-xs" style={{ color: 'var(--text-2)' }}>สถานะ</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody>
            {loading && <TableSpinner colSpan={10} />}
            {!loading && fetchError && <TableError colSpan={10} message={fetchError} onRetry={load} />}
            {!loading && commissions.length === 0 && (
              <tr><td colSpan={10} className="text-center py-12">
                <DollarSign size={32} className="mx-auto mb-2" style={{ color: 'var(--text-3)' }} />
                <p className="text-sm" style={{ color: 'var(--text-2)' }}>ยังไม่มี Commission</p>
              </td></tr>
            )}
            {commissions.map((c, i) => {
              const st = STATUS.find(s => s.value === c.status) || STATUS[0]
              return (
                <tr key={c.id} className="transition-colors" style={{ borderBottom: '1px solid var(--divider)', background: i % 2 !== 0 ? 'var(--hover-bg)' : undefined }}>
                  <td className="px-4 py-3 text-[#58a6ff] text-xs font-mono">{c.id}</td>
                  <td className="px-4 py-3">
                    <p className="text-sm" style={{ color: 'var(--text-1)' }}>{(c as any).customers?.name || '-'}</p>
                    <p className="text-[#58a6ff] text-xs">{c.room || '-'}</p>
                  </td>
                  <td className="px-4 py-3 text-sm" style={{ color: 'var(--text-2)' }}>{(c as any).users?.name || '-'}</td>
                  <td className="px-4 py-3 text-right text-sm" style={{ color: 'var(--text-2)' }}>{f(c.sale_price)}</td>
                  <td className="px-4 py-3 text-right text-sm" style={{ color: 'var(--text-2)' }}>{pct(c.commission_rate)}</td>
                  <td className="px-4 py-3 text-right text-sm" style={{ color: 'var(--text-2)' }}>{f(c.commission_amount)}</td>
                  <td className="px-4 py-3 text-right text-yellow-400 text-sm">{c.bonus > 0 ? f(c.bonus) : '-'}</td>
                  <td className="px-4 py-3 text-right text-green-400 text-sm font-medium">{f(c.total_commission)}</td>
                  <td className="px-4 py-3">
                    <span className={`inline-block px-2 py-0.5 rounded text-xs ${st.color}`}>{st.label}</span>
                  </td>
                  <td className="px-4 py-3">
                    <button onClick={() => {
                      setEditing(c)
                      setForm({ customer_id: c.customer_id, sales_person_id: c.sales_person_id, project_id: c.project_id, room: c.room, sale_price: c.sale_price, commission_rate: c.commission_rate, commission_amount: c.commission_amount, bonus: c.bonus, total_commission: c.total_commission, status: c.status, paid_date: c.paid_date || '', notes: c.notes })
                      setOpen(true)
                    }} className="transition-colors" style={{ color: 'var(--text-2)' }}>
                      <Pencil size={14} />
                    </button>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      {/* Modal */}
      <Modal open={open} onClose={() => setOpen(false)} title={editing ? 'แก้ไข Commission' : 'บันทึก Commission ใหม่'} size="lg">
        <div className="grid grid-cols-2 gap-4">
          <Select label="ลูกค้า *" value={form.customer_id} onChange={e => setForm({ ...form, customer_id: e.target.value })} options={custOptions} />
          <Select label="Sales *" value={form.sales_person_id} onChange={e => setForm({ ...form, sales_person_id: e.target.value })} options={userOptions} />
          <Select label="โครงการ" value={form.project_id} onChange={e => setForm({ ...form, project_id: e.target.value })} options={projOptions} />
          <Input label="ห้อง" value={form.room} onChange={e => setForm({ ...form, room: e.target.value })} placeholder="A-1201" />
          <Input label="ราคาขาย (บาท)" type="number" value={form.sale_price} onChange={e => updatePrice(Number(e.target.value))} />
          <Input label="Commission Rate (%)" type="number" value={form.commission_rate} onChange={e => updateRate(Number(e.target.value))} />
          <div className="col-span-2 rounded-lg p-3 grid grid-cols-3 gap-3" style={{ background: 'var(--hover-bg)' }}>
            <div>
              <p className="text-xs mb-1" style={{ color: 'var(--text-2)' }}>Commission</p>
              <p className="font-medium" style={{ color: 'var(--text-1)' }}>{f(form.commission_amount)}</p>
            </div>
            <div>
              <p className="text-xs mb-1" style={{ color: 'var(--text-2)' }}>Bonus</p>
              <input type="number" value={form.bonus} onChange={e => updateBonus(Number(e.target.value))}
                className="bg-transparent text-yellow-400 font-medium text-sm w-full outline-none pb-0.5"
                style={{ borderBottom: '1px solid var(--divider)' }} />
            </div>
            <div>
              <p className="text-xs mb-1" style={{ color: 'var(--text-2)' }}>รวมทั้งหมด</p>
              <p className="text-green-400 font-bold">{f(form.total_commission)}</p>
            </div>
          </div>
          <Select label="สถานะ" value={form.status} onChange={e => setForm({ ...form, status: e.target.value })} options={statusOptions} />
          {form.status === 'paid' && (
            <Input label="วันที่จ่าย" type="date" value={form.paid_date} onChange={e => setForm({ ...form, paid_date: e.target.value })} />
          )}
          <div className="col-span-2">
            <TextArea label="หมายเหตุ" value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} />
          </div>
        </div>
        <div className="flex justify-end gap-3 mt-5">
          <button onClick={() => setOpen(false)} className="px-4 py-2 text-sm transition-colors" style={{ color: 'var(--text-2)' }}>ยกเลิก</button>
          <button onClick={save} disabled={saving || !form.customer_id || !form.sales_person_id} className="px-4 py-2 bg-[#238636] hover:bg-[#2ea043] disabled:opacity-50 text-white text-sm rounded-lg transition-colors">
            {saving ? 'กำลังบันทึก...' : 'บันทึก'}
          </button>
        </div>
      </Modal>
    </div>
  )
}
