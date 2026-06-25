'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Plus, Wallet, Pencil, CheckCircle, AlertCircle } from 'lucide-react'
import Modal from '@/components/ui/Modal'
import { Input, Select, TextArea } from '@/components/ui/Input'

interface Payment {
  id: string
  customer_id: string
  project_id: string
  room: string
  installment_no: number
  installment_name: string
  due_date: string
  amount: number
  paid_date: string
  paid_amount: number
  status: string
  receipt_url: string
  notes: string
  created_at: string
  customers?: { name: string; phone: string }
  projects?: { name: string }
}

interface Customer { id: string; name: string }
interface Project { id: string; name: string }

const STATUS = [
  { value: 'pending', label: 'รอชำระ', color: 'bg-yellow-500/20 text-yellow-400' },
  { value: 'overdue', label: 'เกินกำหนด', color: 'bg-red-500/20 text-red-400' },
  { value: 'paid', label: 'ชำระแล้ว', color: 'bg-green-500/20 text-green-400' },
  { value: 'partial', label: 'ชำระบางส่วน', color: 'bg-blue-500/20 text-blue-400' },
]

const INSTALLMENT_NAMES = [
  { value: '', label: '— งวด —' },
  { value: 'deposit', label: 'เงินจอง' },
  { value: 'down_payment', label: 'เงินดาวน์' },
  { value: 'progress_1', label: 'งวดที่ 1 (เริ่มงาน)' },
  { value: 'progress_2', label: 'งวดที่ 2 (ครึ่งงาน)' },
  { value: 'progress_3', label: 'งวดที่ 3 (งานเสร็จ)' },
  { value: 'final', label: 'งวดสุดท้าย' },
  { value: 'other', label: 'อื่นๆ' },
]

const emptyForm = {
  customer_id: '', project_id: '', room: '',
  installment_no: 1, installment_name: '',
  due_date: '', amount: 0,
  paid_date: '', paid_amount: 0,
  status: 'pending', receipt_url: '', notes: ''
}

const f = (v: number) => '฿' + (v || 0).toLocaleString()
const dateStr = (d: string) => d ? new Date(d).toLocaleDateString('th-TH', { day: '2-digit', month: 'short', year: '2-digit' }) : '-'

export default function FinancePage() {
  const supabase = createClient()
  const [payments, setPayments] = useState<Payment[]>([])
  const [customers, setCustomers] = useState<Customer[]>([])
  const [projects, setProjects] = useState<Project[]>([])
  const [loading, setLoading] = useState(true)
  const [open, setOpen] = useState(false)
  const [editing, setEditing] = useState<Payment | null>(null)
  const [form, setForm] = useState(emptyForm)
  const [saving, setSaving] = useState(false)
  const [tab, setTab] = useState<'outstanding' | 'paid' | 'all'>('outstanding')
  const [myOnly, setMyOnly] = useState(false)
  const [myCustomerIds, setMyCustomerIds] = useState<string[]>([])

  async function load() {
    setLoading(true)
    const { data: { user } } = await supabase.auth.getUser()
    if (user) {
      const { data: u } = await supabase.from('users').select('id').eq('email', user.email!).single()
      if (u) {
        const { data: myC } = await supabase.from('customers').select('id').eq('assigned_to', u.id)
        setMyCustomerIds((myC || []).map((x: any) => x.id))
      }
    }
    const [{ data: p }, { data: c }, { data: pr }] = await Promise.all([
      supabase.from('payments').select('*, customers(name,phone), projects(name)').order('due_date', { ascending: true }),
      supabase.from('customers').select('id,name').order('name'),
      supabase.from('projects').select('id,name').order('name'),
    ])
    setPayments(p || [])
    setCustomers(c || [])
    setProjects(pr || [])
    setLoading(false)
  }

  useEffect(() => { load() }, [])

  function genId() {
    const nums = payments.map(p => parseInt(p.id.replace('PAY-', ''))).filter(n => !isNaN(n))
    return 'PAY-' + String(nums.length > 0 ? Math.max(...nums) + 1 : 1).padStart(4, '0')
  }

  async function save() {
    if (!form.customer_id || !form.amount) return
    setSaving(true)
    if (editing) {
      await supabase.from('payments').update(form).eq('id', editing.id)
    } else {
      await supabase.from('payments').insert({ id: genId(), ...form })
    }
    setSaving(false)
    setOpen(false)
    load()
  }

  const custOptions = [{ value: '', label: '— เลือกลูกค้า —' }, ...customers.map(c => ({ value: c.id, label: c.name }))]
  const projOptions = [{ value: '', label: '— เลือกโครงการ —' }, ...projects.map(p => ({ value: p.id, label: p.name }))]
  const statusOptions = STATUS.map(s => ({ value: s.value, label: s.label }))

  const today = new Date().toISOString().slice(0, 10)
  const overdue = payments.filter(p => p.status !== 'paid' && p.due_date < today)
  const outstanding = payments.filter(p => p.status !== 'paid')
  const paid = payments.filter(p => p.status === 'paid')

  const totalOutstanding = outstanding.reduce((s, p) => s + p.amount, 0)
  const totalPaid = paid.reduce((s, p) => s + p.paid_amount, 0)
  const totalOverdue = overdue.reduce((s, p) => s + p.amount, 0)

  const baseList = tab === 'outstanding' ? outstanding : tab === 'paid' ? paid : payments
  const displayList = myOnly && myCustomerIds.length > 0
    ? baseList.filter(p => myCustomerIds.includes(p.customer_id))
    : baseList

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-white text-xl font-bold">Finance</h1>
          <p className="text-[#8b949e] text-sm mt-0.5">ติดตามการรับชำระเงินและงวดค้างชำระ</p>
        </div>
        <button onClick={() => { setEditing(null); setForm(emptyForm); setOpen(true) }}
          className="flex items-center gap-2 bg-[#1d6fa5] hover:bg-[#1f6feb] text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors">
          <Plus size={16} />บันทึกงวดชำระ
        </button>
      </div>

      {/* Alert overdue */}
      {overdue.length > 0 && (
        <div className="bg-red-500/10 border border-red-500/30 rounded-xl p-4 mb-4 flex items-center gap-3">
          <AlertCircle size={16} className="text-red-400 flex-shrink-0" />
          <p className="text-red-300 text-sm">มี {overdue.length} งวดเกินกำหนดชำระ รวม {f(totalOverdue)}</p>
        </div>
      )}

      {/* Summary cards */}
      <div className="grid grid-cols-3 gap-4 mb-6">
        <div className="bg-[#161b22] border border-[#30363d] rounded-xl p-4">
          <p className="text-[#8b949e] text-xs mb-1">ยอดค้างรับทั้งหมด</p>
          <p className="text-yellow-400 text-xl font-bold">{f(totalOutstanding)}</p>
          <p className="text-[#484f58] text-xs mt-1">{outstanding.length} งวด</p>
        </div>
        <div className="bg-[#161b22] border border-[#30363d] rounded-xl p-4">
          <p className="text-[#8b949e] text-xs mb-1">เกินกำหนด</p>
          <p className="text-red-400 text-xl font-bold">{f(totalOverdue)}</p>
          <p className="text-[#484f58] text-xs mt-1">{overdue.length} งวด</p>
        </div>
        <div className="bg-[#161b22] border border-[#30363d] rounded-xl p-4">
          <p className="text-[#8b949e] text-xs mb-1">รับแล้วทั้งหมด</p>
          <p className="text-green-400 text-xl font-bold">{f(totalPaid)}</p>
          <p className="text-[#484f58] text-xs mt-1">{paid.length} งวด</p>
        </div>
      </div>

      {/* Tabs + My filter */}
      <div className="flex items-center gap-3 mb-4 flex-wrap">
      <div className="flex gap-1 bg-[#161b22] border border-[#30363d] rounded-lg p-1 w-fit">
        {[
          { key: 'outstanding', label: `ค้างชำระ (${outstanding.length})` },
          { key: 'paid', label: `ชำระแล้ว (${paid.length})` },
          { key: 'all', label: 'ทั้งหมด' },
        ].map(t => (
          <button key={t.key} onClick={() => setTab(t.key as any)}
            className={`px-4 py-1.5 rounded-md text-xs font-medium transition-colors ${tab === t.key ? 'bg-[#1d6fa5] text-white' : 'text-[#8b949e] hover:text-white'}`}>
            {t.label}
          </button>
        ))}
      </div>
      <button onClick={() => setMyOnly(!myOnly)}
        className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors ${myOnly ? 'bg-indigo-500/20 text-indigo-400 border-indigo-500/40' : 'text-[#8b949e] border-[#30363d] hover:text-white'}`}>
        {myOnly ? '● ของฉัน' : '○ ของฉัน'}
      </button>
      </div>

      {/* Table */}
      <div className="bg-[#161b22] border border-[#30363d] rounded-xl overflow-hidden">
        <table className="w-full">
          <thead>
            <tr className="border-b border-[#21262d]">
              <th className="text-left px-4 py-3 text-[#8b949e] text-xs">ลูกค้า / ห้อง</th>
              <th className="text-left px-4 py-3 text-[#8b949e] text-xs">งวด</th>
              <th className="text-left px-4 py-3 text-[#8b949e] text-xs">กำหนดชำระ</th>
              <th className="text-right px-4 py-3 text-[#8b949e] text-xs">ยอด</th>
              <th className="text-left px-4 py-3 text-[#8b949e] text-xs">วันชำระ</th>
              <th className="text-right px-4 py-3 text-[#8b949e] text-xs">ชำระแล้ว</th>
              <th className="text-left px-4 py-3 text-[#8b949e] text-xs">สถานะ</th>
              <th className="text-left px-4 py-3 text-[#8b949e] text-xs">ใบเสร็จ</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody>
            {loading && <tr><td colSpan={9} className="text-center py-12 text-[#8b949e]">กำลังโหลด...</td></tr>}
            {!loading && displayList.length === 0 && (
              <tr><td colSpan={9} className="text-center py-12">
                <Wallet size={32} className="mx-auto text-[#484f58] mb-2" />
                <p className="text-[#8b949e] text-sm">ไม่มีรายการ</p>
              </td></tr>
            )}
            {displayList.map((p, i) => {
              const st = STATUS.find(s => s.value === p.status) || STATUS[0]
              const isOverdue = p.status !== 'paid' && p.due_date < today
              return (
                <tr key={p.id} className={`border-b border-[#21262d] hover:bg-[#1c2128] transition-colors ${i % 2 === 0 ? '' : 'bg-[#0d1117]/30'} ${isOverdue ? 'bg-red-500/5' : ''}`}>
                  <td className="px-4 py-3">
                    <p className="text-white text-sm">{(p as any).customers?.name || '-'}</p>
                    <p className="text-[#58a6ff] text-xs">{p.room || (p as any).projects?.name}</p>
                  </td>
                  <td className="px-4 py-3">
                    <p className="text-[#c9d1d9] text-sm">{INSTALLMENT_NAMES.find(x => x.value === p.installment_name)?.label || p.installment_name || '-'}</p>
                    <p className="text-[#484f58] text-xs">งวดที่ {p.installment_no}</p>
                  </td>
                  <td className={`px-4 py-3 text-sm ${isOverdue ? 'text-red-400 font-medium' : 'text-[#c9d1d9]'}`}>
                    {dateStr(p.due_date)}
                    {isOverdue && <p className="text-red-400 text-xs">เกินกำหนด</p>}
                  </td>
                  <td className="px-4 py-3 text-right text-[#c9d1d9] text-sm font-medium">{f(p.amount)}</td>
                  <td className="px-4 py-3 text-[#c9d1d9] text-sm">{dateStr(p.paid_date)}</td>
                  <td className="px-4 py-3 text-right">
                    {p.paid_amount > 0
                      ? <span className="text-green-400 text-sm font-medium">{f(p.paid_amount)}</span>
                      : <span className="text-[#484f58] text-sm">-</span>}
                  </td>
                  <td className="px-4 py-3">
                    <span className={`inline-block px-2 py-0.5 rounded text-xs ${st.color}`}>{st.label}</span>
                  </td>
                  <td className="px-4 py-3">
                    {p.receipt_url
                      ? <a href={p.receipt_url} target="_blank" rel="noreferrer" className="text-[#58a6ff] text-xs hover:underline">ดูใบเสร็จ</a>
                      : <span className="text-[#484f58] text-xs">-</span>}
                  </td>
                  <td className="px-4 py-3">
                    <button onClick={() => {
                      setEditing(p)
                      setForm({ customer_id: p.customer_id, project_id: p.project_id || '', room: p.room || '', installment_no: p.installment_no, installment_name: p.installment_name || '', due_date: p.due_date || '', amount: p.amount, paid_date: p.paid_date || '', paid_amount: p.paid_amount || 0, status: p.status, receipt_url: p.receipt_url || '', notes: p.notes || '' })
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

      {/* Modal */}
      <Modal open={open} onClose={() => setOpen(false)} title={editing ? 'แก้ไขงวดชำระ' : 'เพิ่มงวดชำระ'} size="lg">
        <div className="grid grid-cols-2 gap-4">
          <Select label="ลูกค้า *" value={form.customer_id} onChange={e => setForm({ ...form, customer_id: e.target.value })} options={custOptions} />
          <Select label="โครงการ" value={form.project_id} onChange={e => setForm({ ...form, project_id: e.target.value })} options={projOptions} />
          <Input label="ห้อง" value={form.room} onChange={e => setForm({ ...form, room: e.target.value })} placeholder="A-1201" />
          <Input label="งวดที่" type="number" value={form.installment_no} onChange={e => setForm({ ...form, installment_no: Number(e.target.value) })} />
          <Select label="ชื่องวด" value={form.installment_name} onChange={e => setForm({ ...form, installment_name: e.target.value })} options={INSTALLMENT_NAMES} />
          <Input label="กำหนดชำระ" type="date" value={form.due_date} onChange={e => setForm({ ...form, due_date: e.target.value })} />
          <Input label="ยอดที่ต้องชำระ (บาท) *" type="number" value={form.amount} onChange={e => setForm({ ...form, amount: Number(e.target.value) })} />
          <Select label="สถานะ" value={form.status} onChange={e => setForm({ ...form, status: e.target.value })} options={statusOptions} />
          {(form.status === 'paid' || form.status === 'partial') && (<>
            <Input label="วันที่ชำระ" type="date" value={form.paid_date} onChange={e => setForm({ ...form, paid_date: e.target.value })} />
            <Input label="ยอดที่ชำระ (บาท)" type="number" value={form.paid_amount} onChange={e => setForm({ ...form, paid_amount: Number(e.target.value) })} />
            <div className="col-span-2">
              <Input label="ลิงค์ใบเสร็จ (Google Drive)" value={form.receipt_url} onChange={e => setForm({ ...form, receipt_url: e.target.value })} placeholder="https://drive.google.com/..." />
            </div>
          </>)}
          <div className="col-span-2">
            <TextArea label="หมายเหตุ" value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} />
          </div>
        </div>
        <div className="flex justify-end gap-3 mt-5">
          <button onClick={() => setOpen(false)} className="px-4 py-2 text-[#8b949e] hover:text-white text-sm transition-colors">ยกเลิก</button>
          <button onClick={save} disabled={saving || !form.customer_id || !form.amount} className="px-4 py-2 bg-[#1d6fa5] hover:bg-[#1f6feb] disabled:opacity-50 text-white text-sm rounded-lg transition-colors">
            {saving ? 'กำลังบันทึก...' : 'บันทึก'}
          </button>
        </div>
      </Modal>
    </div>
  )
}
