'use client'

import { useEffect, useState, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Plus, Wallet, Pencil, CheckCircle, AlertCircle, Clock } from 'lucide-react'
import Modal from '@/components/ui/Modal'
import { Input, Select, TextArea } from '@/components/ui/Input'

interface Payment {
  id: string; customer_id: string; project_id: string; room: string
  installment_no: number; installment_name: string
  due_date: string; amount: number; paid_date: string
  paid_amount: number; status: string; receipt_url: string; notes: string
  customers?: { name: string; phone: string }; projects?: { name: string }
  condo_leads?: { customer_name: string; phone: string }
}

interface Project { id: string; name: string }
interface Lead { id: number; tower: string; room_no: string; customer_name: string; phone: string }

const PAY_STATUS = [
  { value: 'pending', label: 'รอชำระ', color: 'bg-yellow-500/20 text-yellow-400' },
  { value: 'overdue', label: 'เกินกำหนด', color: 'bg-red-500/20 text-red-400' },
  { value: 'paid', label: 'ชำระแล้ว', color: 'bg-green-500/20 text-green-400' },
  { value: 'partial', label: 'ชำระบางส่วน', color: 'bg-blue-500/20 text-blue-400' },
]

const INSTALL_NAMES = [
  { value: '', label: '— งวด —' },
  { value: 'deposit', label: 'เงินจอง' },
  { value: 'down_50', label: 'มัดจำ 50%' },
  { value: 'final', label: 'ยอดสุดท้าย 100%' },
  { value: 'progress_1', label: 'งวดที่ 1 (เริ่มงาน)' },
  { value: 'progress_2', label: 'งวดที่ 2 (ครึ่งงาน)' },
  { value: 'progress_3', label: 'งวดที่ 3 (งานเสร็จ)' },
  { value: 'other', label: 'อื่นๆ' },
]

const emptyPay = {
  client_type: 'B2C' as 'B2C' | 'B2B',
  project_id: '', lead_id: '', customer_id: '',
  room: '', installment_no: 1, installment_name: '',
  due_date: '', amount: '', paid_date: '', paid_amount: '',
  status: 'pending', receipt_url: '', notes: ''
}

export default function PaymentsPage() {
  const supabase = createClient()
  const [payments, setPayments] = useState<Payment[]>([])
  const [projects, setProjects] = useState<Project[]>([])
  const [leads, setLeads] = useState<Lead[]>([])
  const [loading, setLoading] = useState(true)
  const [open, setOpen] = useState(false)
  const [editing, setEditing] = useState<Payment | null>(null)
  const [form, setForm] = useState(emptyPay)
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState('')
  const [viewTab, setViewTab] = useState<'outstanding' | 'paid' | 'all'>('outstanding')

  const load = useCallback(async () => {
    setLoading(true)
    const [{ data: p }, { data: pr }] = await Promise.all([
      supabase.from('payments').select('*, customers(name,phone), projects(name), condo_leads(customer_name,phone)').order('due_date'),
      supabase.from('projects').select('id,name').eq('active', true).order('name'),
    ])
    setPayments((p as any) || [])
    setProjects(pr || [])
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

  async function loadLeads(projectId: string) {
    if (!projectId) { setLeads([]); return }
    const { data } = await supabase.from('condo_leads')
      .select('id,tower,room_no,customer_name,phone')
      .eq('project_id', projectId)
      .order('tower').order('room_no')
    setLeads((data as any) || [])
  }

  function genId() {
    const nums = payments.map(p => parseInt(p.id.replace('PAY-', ''))).filter(n => !isNaN(n))
    return 'PAY-' + String(nums.length > 0 ? Math.max(...nums) + 1 : 1).padStart(4, '0')
  }

  async function save() {
    if (!form.amount) return
    setSaving(true); setSaveError('')
    const payload: any = {
      project_id: form.project_id || null,
      customer_id: form.customer_id || null,
      room: form.room,
      installment_no: form.installment_no,
      installment_name: form.installment_name,
      due_date: form.due_date || null,
      amount: Number(form.amount),
      paid_date: form.paid_date || null,
      paid_amount: Number(form.paid_amount) || 0,
      status: form.status,
      receipt_url: form.receipt_url || null,
      notes: form.notes || null,
    }
    if (editing) {
      const { error } = await supabase.from('payments').update(payload).eq('id', editing.id)
      if (error) { setSaveError(error.message); setSaving(false); return }
    } else {
      const { error } = await supabase.from('payments').insert({ id: genId(), ...payload })
      if (error) { setSaveError(error.message); setSaving(false); return }
    }
    setSaving(false); setOpen(false); load()
  }

  const today = new Date().toISOString().slice(0, 10)
  const outstanding = payments.filter(p => p.status !== 'paid')
  const paid = payments.filter(p => p.status === 'paid')
  const overdue = payments.filter(p => p.status !== 'paid' && p.due_date && p.due_date < today)
  const displayed = viewTab === 'outstanding' ? outstanding : viewTab === 'paid' ? paid : payments

  const statusInfo = (s: string) => PAY_STATUS.find(x => x.value === s) || PAY_STATUS[0]
  const dateStr = (d: string) => d ? new Date(d).toLocaleDateString('th-TH', { day: '2-digit', month: 'short', year: '2-digit' }) : '—'
  const fmtBaht = (n: number) => n ? ('฿' + n.toLocaleString()) : '—'
  const clientName = (p: Payment) => (p.condo_leads as any)?.customer_name || (p.customers as any)?.name || '—'

  const projOptions = [{ value: '', label: '— เลือกโครงการ —' }, ...projects.map(p => ({ value: p.id, label: p.name }))]
  const leadOptions = [
    { value: '', label: '— เลือกห้อง —' },
    ...leads.map(l => ({ value: String(l.id), label: `${l.tower}-${l.room_no} — ${l.customer_name}` }))
  ]

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-white text-xl font-bold">การเก็บเงิน</h1>
          <p className="text-[#8b949e] text-sm mt-0.5">บันทึกงวดชำระและแนบหลักฐาน</p>
        </div>
        <button onClick={() => { setEditing(null); setForm(emptyPay); setLeads([]); setSaveError(''); setOpen(true) }}
          className="flex items-center gap-2 bg-[#238636] hover:bg-[#2ea043] text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors">
          <Plus size={16} />บันทึกงวดชำระ
        </button>
      </div>

      {/* KPI */}
      <div className="grid grid-cols-3 gap-4 mb-5">
        <div className="bg-[#161b22] border border-[#30363d] rounded-xl p-4">
          <p className="text-[#8b949e] text-xs mb-1">ค้างรับ</p>
          <p className="text-yellow-400 text-2xl font-bold">{outstanding.length} งวด</p>
          <p className="text-[#8b949e] text-xs mt-1">{fmtBaht(outstanding.reduce((s, p) => s + p.amount, 0))}</p>
        </div>
        <div className="bg-[#161b22] border border-[#30363d] rounded-xl p-4">
          <p className="text-[#8b949e] text-xs mb-1">เกินกำหนด</p>
          <p className="text-red-400 text-2xl font-bold">{overdue.length} งวด</p>
          <p className="text-[#8b949e] text-xs mt-1">{fmtBaht(overdue.reduce((s, p) => s + p.amount, 0))}</p>
        </div>
        <div className="bg-[#161b22] border border-[#30363d] rounded-xl p-4">
          <p className="text-[#8b949e] text-xs mb-1">ได้รับแล้ว</p>
          <p className="text-green-400 text-2xl font-bold">{paid.length} งวด</p>
          <p className="text-[#8b949e] text-xs mt-1">{fmtBaht(paid.reduce((s, p) => s + p.paid_amount, 0))}</p>
        </div>
      </div>

      {/* Overdue alert */}
      {overdue.length > 0 && (
        <div className="flex items-center gap-3 p-3 rounded-xl mb-4 text-sm" style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)', color: '#f87171' }}>
          <AlertCircle size={15} />มี {overdue.length} งวดเกินกำหนดชำระ
        </div>
      )}

      {/* Tab filter */}
      <div className="flex gap-2 mb-4">
        {[
          { k: 'outstanding', l: `ค้างรับ (${outstanding.length})` },
          { k: 'paid', l: `ชำระแล้ว (${paid.length})` },
          { k: 'all', l: `ทั้งหมด (${payments.length})` },
        ].map(t => (
          <button key={t.k} onClick={() => setViewTab(t.k as any)}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${viewTab === t.k ? 'bg-[#238636] text-white' : 'bg-[#21262d] text-[#8b949e] hover:text-white'}`}>
            {t.l}
          </button>
        ))}
      </div>

      {/* Table */}
      <div className="bg-[#161b22] border border-[#30363d] rounded-xl overflow-hidden">
        <table className="w-full">
          <thead>
            <tr className="border-b border-[#21262d]">
              <th className="text-left px-4 py-3 text-[#8b949e] text-xs">ลูกค้า</th>
              <th className="text-left px-4 py-3 text-[#8b949e] text-xs">โครงการ / ห้อง</th>
              <th className="text-left px-4 py-3 text-[#8b949e] text-xs">งวด</th>
              <th className="text-left px-4 py-3 text-[#8b949e] text-xs">ยอด</th>
              <th className="text-left px-4 py-3 text-[#8b949e] text-xs">ครบกำหนด</th>
              <th className="text-left px-4 py-3 text-[#8b949e] text-xs">วันชำระ</th>
              <th className="text-left px-4 py-3 text-[#8b949e] text-xs">หลักฐาน</th>
              <th className="text-left px-4 py-3 text-[#8b949e] text-xs">สถานะ</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody>
            {loading && <tr><td colSpan={9} className="text-center py-12 text-[#8b949e]">กำลังโหลด...</td></tr>}
            {!loading && displayed.length === 0 && (
              <tr><td colSpan={9} className="text-center py-12">
                <Wallet size={32} className="mx-auto text-[#484f58] mb-2" />
                <p className="text-[#8b949e] text-sm">ยังไม่มีรายการ</p>
              </td></tr>
            )}
            {displayed.map((p, i) => {
              const st = statusInfo(p.status)
              const isOverdue = p.status !== 'paid' && p.due_date && p.due_date < today
              return (
                <tr key={p.id} className={`border-b border-[#21262d] hover:bg-[#1c2128] transition-colors ${i % 2 === 0 ? '' : 'bg-[#0d1117]/30'}`}>
                  <td className="px-4 py-3">
                    <p className="text-white text-sm">{clientName(p)}</p>
                    <p className="text-[#484f58] text-xs">{(p.customers as any)?.phone || (p.condo_leads as any)?.phone || ''}</p>
                  </td>
                  <td className="px-4 py-3">
                    <p className="text-[#c9d1d9] text-sm">{(p.projects as any)?.name || '—'}</p>
                    <p className="text-[#58a6ff] text-xs">{p.room}</p>
                  </td>
                  <td className="px-4 py-3 text-[#c9d1d9] text-sm">
                    {INSTALL_NAMES.find(n => n.value === p.installment_name)?.label || p.installment_name || `งวด ${p.installment_no}`}
                  </td>
                  <td className="px-4 py-3 font-semibold" style={{ color: '#4ade80' }}>{fmtBaht(p.amount)}</td>
                  <td className={`px-4 py-3 text-sm ${isOverdue ? 'text-red-400' : 'text-[#c9d1d9]'}`}>
                    {isOverdue && <AlertCircle size={12} className="inline mr-1" />}
                    {dateStr(p.due_date)}
                  </td>
                  <td className="px-4 py-3">
                    {p.paid_date
                      ? <span className="text-green-400 text-xs flex items-center gap-1"><CheckCircle size={12} />{dateStr(p.paid_date)}</span>
                      : <span className="text-[#484f58] text-xs flex items-center gap-1"><Clock size={12} />รอ</span>}
                  </td>
                  <td className="px-4 py-3">
                    {p.receipt_url
                      ? <a href={p.receipt_url} target="_blank" rel="noopener noreferrer" className="text-[#58a6ff] text-xs hover:underline">ดูไฟล์</a>
                      : <span className="text-[#484f58] text-xs">—</span>}
                  </td>
                  <td className="px-4 py-3">
                    <span className={`inline-block px-2 py-0.5 rounded text-xs ${st.color}`}>{st.label}</span>
                  </td>
                  <td className="px-4 py-3">
                    <button onClick={() => {
                      setEditing(p)
                      setForm({
                        client_type: 'B2C',
                        project_id: p.project_id || '',
                        lead_id: '', customer_id: p.customer_id || '',
                        room: p.room || '',
                        installment_no: p.installment_no,
                        installment_name: p.installment_name,
                        due_date: p.due_date || '',
                        amount: String(p.amount),
                        paid_date: p.paid_date || '',
                        paid_amount: String(p.paid_amount || ''),
                        status: p.status,
                        receipt_url: p.receipt_url || '',
                        notes: p.notes || '',
                      })
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
      <Modal open={open} onClose={() => setOpen(false)} title={editing ? 'แก้ไขงวดชำระ' : 'บันทึกงวดชำระ'} size="lg">
        <div className="grid grid-cols-2 gap-4">

          {/* Client type */}
          {!editing && (
            <div className="col-span-2">
              <p className="text-[#8b949e] text-xs mb-2">ประเภทลูกค้า</p>
              <div className="flex gap-3">
                {(['B2C', 'B2B'] as const).map(t => (
                  <button key={t}
                    onClick={() => setForm({ ...form, client_type: t, lead_id: '' })}
                    className={`flex-1 py-2 rounded-lg text-sm font-medium border transition-colors ${form.client_type === t ? 'bg-[#1f6feb] border-[#1f6feb] text-white' : 'border-[#30363d] text-[#8b949e] hover:text-white'}`}>
                    {t === 'B2C' ? 'B2C — Condo / รายบุคคล' : 'B2B — องค์กร'}
                  </button>
                ))}
              </div>
            </div>
          )}

          {!editing && (
            <>
              <Select label="โครงการ" value={form.project_id}
                onChange={e => {
                  setForm({ ...form, project_id: e.target.value, lead_id: '' })
                  if (form.client_type === 'B2C') loadLeads(e.target.value)
                }}
                options={projOptions} />
              {form.client_type === 'B2C' ? (
                <Select label="ห้อง (Origin Pool)" value={form.lead_id}
                  onChange={e => {
                    const lead = leads.find(l => String(l.id) === e.target.value)
                    setForm({ ...form, lead_id: e.target.value, room: lead ? `${lead.tower}-${lead.room_no}` : form.room })
                  }}
                  options={leadOptions} />
              ) : (
                <Input label="ห้อง / สถานที่" value={form.room}
                  onChange={e => setForm({ ...form, room: e.target.value })} />
              )}
            </>
          )}

          {editing && (
            <>
              <div className="col-span-2 text-sm" style={{ color: 'var(--text-2)' }}>
                ห้อง: <span className="text-white">{editing.room}</span> — {clientName(editing)}
              </div>
            </>
          )}

          <Select label="งวด" value={form.installment_name}
            onChange={e => setForm({ ...form, installment_name: e.target.value })}
            options={INSTALL_NAMES} />
          <Input label="งวดที่" type="number" value={form.installment_no}
            onChange={e => setForm({ ...form, installment_no: Number(e.target.value) })} />

          <Input label="ยอดชำระ (บาท) *" type="number" value={form.amount}
            onChange={e => setForm({ ...form, amount: e.target.value })} />
          <Input label="ครบกำหนด" type="date" value={form.due_date}
            onChange={e => setForm({ ...form, due_date: e.target.value })} />

          <Select label="สถานะ" value={form.status}
            onChange={e => setForm({ ...form, status: e.target.value })}
            options={PAY_STATUS.map(s => ({ value: s.value, label: s.label }))} />
          <Input label="วันที่ชำระ" type="date" value={form.paid_date}
            onChange={e => setForm({ ...form, paid_date: e.target.value })} />

          {(form.status === 'paid' || form.status === 'partial') && (
            <Input label="ยอดที่รับจริง (บาท)" type="number" value={form.paid_amount}
              onChange={e => setForm({ ...form, paid_amount: e.target.value })} />
          )}

          <div className="col-span-2">
            <Input label="URL หลักฐาน / สลิป" value={form.receipt_url}
              onChange={e => setForm({ ...form, receipt_url: e.target.value })}
              placeholder="https://drive.google.com/..." />
          </div>
          <div className="col-span-2">
            <TextArea label="หมายเหตุ" value={form.notes}
              onChange={e => setForm({ ...form, notes: e.target.value })} />
          </div>
        </div>

        {saveError && (
          <div className="flex items-center gap-2 mt-3 p-3 rounded-xl text-xs text-red-400" style={{ background: 'rgba(239,68,68,0.1)' }}>
            <AlertCircle size={14} />{saveError}
          </div>
        )}
        <div className="flex justify-end gap-3 mt-5">
          <button onClick={() => setOpen(false)} className="px-4 py-2 text-[#8b949e] hover:text-white text-sm transition-colors">ยกเลิก</button>
          <button onClick={save} disabled={saving || !form.amount}
            className="px-4 py-2 bg-[#238636] hover:bg-[#2ea043] disabled:opacity-50 text-white text-sm rounded-lg transition-colors">
            {saving ? 'กำลังบันทึก...' : 'บันทึก'}
          </button>
        </div>
      </Modal>
    </div>
  )
}
