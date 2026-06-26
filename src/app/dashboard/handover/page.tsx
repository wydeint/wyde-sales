'use client'

import { useEffect, useState, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Plus, ArrowRightLeft, Pencil, CheckCircle, Clock, Shield, AlertTriangle } from 'lucide-react'
import Modal from '@/components/ui/Modal'
import { Input, Select, TextArea } from '@/components/ui/Input'

interface Handover {
  id: string
  customer_id: string | null
  lead_id: number | null
  project_id: string | null
  room: string
  client_type: 'B2C' | 'B2B'
  total_amount: number | null
  job_start_date: string | null
  work_days: number | null
  expected_completion: string | null
  final_payment_date: string | null
  handover_date: string | null
  sales_sign_date: string | null
  customer_sign_date: string | null
  defect_noted: boolean
  defect_details: string
  warranty_days: number | null
  warranty_end: string | null
  status: string
  notes: string
  customers?: { name: string; phone: string } | null
  projects?: { name: string } | null
  condo_leads?: { customer_name: string; phone: string; tower: string; room_no: string } | null
}

interface Project { id: string; name: string }
interface Lead { id: number; tower: string; room_no: string; customer_name: string; phone: string }

const STATUS = [
  { value: 'scheduled', label: 'นัดหมายแล้ว', color: 'bg-blue-500/20 text-blue-400' },
  { value: 'in_progress', label: 'กำลังดำเนินการ', color: 'bg-yellow-500/20 text-yellow-400' },
  { value: 'completed', label: 'ส่งมอบแล้ว', color: 'bg-green-500/20 text-green-400' },
]

const WORK_DAYS_OPTS = [
  { value: '', label: '— ระยะเวลา —' },
  { value: '15', label: '15 วัน' },
  { value: '30', label: '30 วัน' },
  { value: '45', label: '45 วัน' },
  { value: '60', label: '60 วัน' },
  { value: '90', label: '90 วัน' },
]

const emptyForm = {
  client_type: 'B2C' as 'B2C' | 'B2B',
  project_id: '', lead_id: '',
  room: '', total_amount: '',
  job_start_date: '', work_days: '',
  final_payment_date: '', handover_date: '',
  sales_sign_date: '', customer_sign_date: '',
  defect_noted: false, defect_details: '',
  warranty_days: '', status: 'scheduled', notes: '',
}

export default function HandoverPage() {
  const supabase = createClient()
  const [handovers, setHandovers] = useState<Handover[]>([])
  const [projects, setProjects] = useState<Project[]>([])
  const [leads, setLeads] = useState<Lead[]>([])
  const [loading, setLoading] = useState(true)
  const [open, setOpen] = useState(false)
  const [editing, setEditing] = useState<Handover | null>(null)
  const [form, setForm] = useState(emptyForm)
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    const [{ data: h }, { data: p }] = await Promise.all([
      supabase.from('handovers').select('*, customers(name,phone), projects(name), condo_leads(customer_name,phone,tower,room_no)')
        .order('handover_date', { ascending: true }),
      supabase.from('projects').select('id,name').eq('active', true).order('name'),
    ])
    setHandovers((h as any) || [])
    setProjects(p || [])
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
    const nums = handovers.map(h => parseInt(h.id.replace('HOV-', ''))).filter(n => !isNaN(n))
    return 'HOV-' + String(nums.length > 0 ? Math.max(...nums) + 1 : 1).padStart(3, '0')
  }

  function calcDate(startDate: string, days: string) {
    if (!startDate || !days) return null
    const d = new Date(startDate)
    d.setDate(d.getDate() + parseInt(days))
    return d.toISOString().split('T')[0]
  }

  async function save() {
    setSaving(true); setSaveError('')
    const payload: any = {
      client_type: form.client_type,
      project_id: form.project_id || null,
      lead_id: form.client_type === 'B2C' ? (Number(form.lead_id) || null) : null,
      customer_id: null,
      room: form.room,
      total_amount: Number(form.total_amount) || null,
      job_start_date: form.job_start_date || null,
      work_days: form.work_days ? parseInt(form.work_days) : null,
      expected_completion: calcDate(form.job_start_date, form.work_days),
      final_payment_date: form.final_payment_date || null,
      handover_date: form.handover_date || null,
      sales_sign_date: form.sales_sign_date || null,
      customer_sign_date: form.customer_sign_date || null,
      defect_noted: form.defect_noted,
      defect_details: form.defect_details || null,
      warranty_days: form.warranty_days ? parseInt(form.warranty_days) : null,
      warranty_end: calcDate(form.handover_date, form.warranty_days),
      status: form.status,
      notes: form.notes || null,
    }
    if (editing) {
      const { error } = await supabase.from('handovers').update(payload).eq('id', editing.id)
      if (error) { setSaveError(error.message); setSaving(false); return }
    } else {
      const { error } = await supabase.from('handovers').insert({ id: genId(), ...payload })
      if (error) { setSaveError(error.message); setSaving(false); return }
    }
    setSaving(false); setOpen(false); load()
  }

  function openEdit(h: Handover) {
    setEditing(h)
    setForm({
      client_type: h.client_type || 'B2C',
      project_id: h.project_id || '',
      lead_id: h.lead_id ? String(h.lead_id) : '',
      room: h.room || '',
      total_amount: h.total_amount ? String(h.total_amount) : '',
      job_start_date: h.job_start_date || '',
      work_days: h.work_days ? String(h.work_days) : '',
      final_payment_date: h.final_payment_date || '',
      handover_date: h.handover_date || '',
      sales_sign_date: h.sales_sign_date || '',
      customer_sign_date: h.customer_sign_date || '',
      defect_noted: h.defect_noted,
      defect_details: h.defect_details || '',
      warranty_days: h.warranty_days ? String(h.warranty_days) : '',
      status: h.status,
      notes: h.notes || '',
    })
    if (h.project_id) loadLeads(h.project_id)
    setOpen(true)
  }

  const clientName = (h: Handover) =>
    (h.condo_leads as any)?.customer_name || (h.customers as any)?.name || '—'
  const clientPhone = (h: Handover) =>
    (h.condo_leads as any)?.phone || (h.customers as any)?.phone || ''
  const dateStr = (d: string | null) =>
    d ? new Date(d).toLocaleDateString('th-TH', { day: '2-digit', month: 'short', year: '2-digit' }) : '—'
  const fmtBaht = (n: number | null) => n ? n.toLocaleString('th-TH') : '—'

  const projOptions = [{ value: '', label: '— เลือกโครงการ —' }, ...projects.map(p => ({ value: p.id, label: p.name }))]
  const leadOptions = [
    { value: '', label: '— เลือกห้อง —' },
    ...leads.map(l => ({ value: String(l.id), label: `${l.tower}-${l.room_no} — ${l.customer_name}` }))
  ]

  const upcoming = handovers.filter(h => h.status !== 'completed')
  const done = handovers.filter(h => h.status === 'completed')

  const kpi = {
    scheduled: handovers.filter(h => h.status === 'scheduled').length,
    inProgress: handovers.filter(h => h.status === 'in_progress').length,
    completed: handovers.filter(h => h.status === 'completed').length,
  }

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-white text-xl font-bold">Handover — ส่งมอบงานตกแต่ง</h1>
          <p className="text-[#8b949e] text-sm mt-0.5">ติดตามการส่งมอบงาน เก็บเงินงวดสุดท้าย และประกัน</p>
        </div>
        <button onClick={() => { setEditing(null); setForm(emptyForm); setLeads([]); setSaveError(''); setOpen(true) }}
          className="flex items-center gap-2 bg-[#238636] hover:bg-[#2ea043] text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors">
          <Plus size={16} />เพิ่มรายการส่งมอบ
        </button>
      </div>

      {/* KPI */}
      <div className="grid grid-cols-3 gap-4 mb-6">
        <div className="bg-[#161b22] border border-[#30363d] rounded-xl p-4">
          <p className="text-[#8b949e] text-xs mb-1">นัดหมายแล้ว</p>
          <p className="text-blue-400 text-2xl font-bold">{kpi.scheduled}</p>
        </div>
        <div className="bg-[#161b22] border border-[#30363d] rounded-xl p-4">
          <p className="text-[#8b949e] text-xs mb-1">กำลังดำเนินการ</p>
          <p className="text-yellow-400 text-2xl font-bold">{kpi.inProgress}</p>
        </div>
        <div className="bg-[#161b22] border border-[#30363d] rounded-xl p-4">
          <p className="text-[#8b949e] text-xs mb-1">ส่งมอบแล้ว</p>
          <p className="text-green-400 text-2xl font-bold">{kpi.completed}</p>
        </div>
      </div>

      {/* Pending */}
      {upcoming.length > 0 && (
        <div className="mb-6">
          <h2 className="text-[#8b949e] text-xs font-bold uppercase tracking-widest mb-3">รอดำเนินการ ({upcoming.length})</h2>
          <div className="bg-[#161b22] border border-[#30363d] rounded-xl overflow-hidden">
            <table className="w-full">
              <thead>
                <tr className="border-b border-[#21262d]">
                  <th className="text-left px-4 py-3 text-[#8b949e] text-xs">ลูกค้า</th>
                  <th className="text-left px-4 py-3 text-[#8b949e] text-xs">โครงการ / ห้อง</th>
                  <th className="text-left px-4 py-3 text-[#8b949e] text-xs">ประเภท</th>
                  <th className="text-left px-4 py-3 text-[#8b949e] text-xs">มูลค่า</th>
                  <th className="text-left px-4 py-3 text-[#8b949e] text-xs">เริ่มงาน</th>
                  <th className="text-left px-4 py-3 text-[#8b949e] text-xs">กำหนดเสร็จ</th>
                  <th className="text-left px-4 py-3 text-[#8b949e] text-xs">วันส่งมอบ</th>
                  <th className="text-left px-4 py-3 text-[#8b949e] text-xs">เก็บเงินครั้งสุดท้าย</th>
                  <th className="text-left px-4 py-3 text-[#8b949e] text-xs">สถานะ</th>
                  <th className="px-4 py-3" />
                </tr>
              </thead>
              <tbody>
                {upcoming.map((h, i) => {
                  const st = STATUS.find(s => s.value === h.status) || STATUS[0]
                  const overdue = h.expected_completion && !h.handover_date && new Date(h.expected_completion) < new Date()
                  return (
                    <tr key={h.id} className={`border-b border-[#21262d] hover:bg-[#1c2128] transition-colors ${i % 2 === 0 ? '' : 'bg-[#0d1117]/30'}`}>
                      <td className="px-4 py-3">
                        <p className="text-white text-sm">{clientName(h)}</p>
                        <p className="text-[#484f58] text-xs">{clientPhone(h)}</p>
                      </td>
                      <td className="px-4 py-3">
                        <p className="text-[#c9d1d9] text-sm">{(h.projects as any)?.name || '—'}</p>
                        <p className="text-[#58a6ff] text-xs">{h.room || '—'}</p>
                      </td>
                      <td className="px-4 py-3">
                        <span className={`text-xs px-2 py-0.5 rounded ${h.client_type === 'B2C' ? 'bg-purple-500/20 text-purple-400' : 'bg-orange-500/20 text-orange-400'}`}>
                          {h.client_type || 'B2C'}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-[#c9d1d9] text-sm">{fmtBaht(h.total_amount)}</td>
                      <td className="px-4 py-3 text-[#c9d1d9] text-sm">{dateStr(h.job_start_date)}</td>
                      <td className="px-4 py-3">
                        {h.expected_completion
                          ? <span className={`text-sm flex items-center gap-1 ${overdue ? 'text-red-400' : 'text-[#c9d1d9]'}`}>
                              {overdue && <AlertTriangle size={12} />}
                              {dateStr(h.expected_completion)}
                            </span>
                          : <span className="text-[#484f58] text-sm">—</span>}
                      </td>
                      <td className="px-4 py-3">
                        {h.handover_date
                          ? <span className="text-green-400 text-xs flex items-center gap-1"><CheckCircle size={12} />{dateStr(h.handover_date)}</span>
                          : <span className="text-[#484f58] text-xs flex items-center gap-1"><Clock size={12} />รอ</span>}
                      </td>
                      <td className="px-4 py-3">
                        {h.final_payment_date
                          ? <span className="text-green-400 text-xs flex items-center gap-1"><CheckCircle size={12} />{dateStr(h.final_payment_date)}</span>
                          : <span className="text-[#484f58] text-xs">รอ</span>}
                      </td>
                      <td className="px-4 py-3">
                        <span className={`inline-block px-2 py-0.5 rounded text-xs ${st.color}`}>{st.label}</span>
                      </td>
                      <td className="px-4 py-3">
                        <button onClick={() => openEdit(h)} className="text-[#8b949e] hover:text-white transition-colors">
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
          <h2 className="text-[#8b949e] text-xs font-bold uppercase tracking-widest mb-3">ส่งมอบแล้ว ({done.length})</h2>
          <div className="bg-[#161b22] border border-[#30363d] rounded-xl overflow-hidden">
            <table className="w-full">
              <thead>
                <tr className="border-b border-[#21262d]">
                  <th className="text-left px-4 py-3 text-[#8b949e] text-xs">ลูกค้า</th>
                  <th className="text-left px-4 py-3 text-[#8b949e] text-xs">โครงการ / ห้อง</th>
                  <th className="text-left px-4 py-3 text-[#8b949e] text-xs">มูลค่า</th>
                  <th className="text-left px-4 py-3 text-[#8b949e] text-xs">วันส่งมอบ</th>
                  <th className="text-left px-4 py-3 text-[#8b949e] text-xs">เก็บเงินสุดท้าย</th>
                  <th className="text-left px-4 py-3 text-[#8b949e] text-xs">ประกัน</th>
                  <th className="text-left px-4 py-3 text-[#8b949e] text-xs">Defect</th>
                  <th className="px-4 py-3" />
                </tr>
              </thead>
              <tbody>
                {done.map((h, i) => {
                  const today = new Date()
                  const warrantyActive = h.warranty_end ? new Date(h.warranty_end) > today : false
                  return (
                    <tr key={h.id} className={`border-b border-[#21262d] hover:bg-[#1c2128] transition-colors ${i % 2 === 0 ? '' : 'bg-[#0d1117]/30'}`}>
                      <td className="px-4 py-3">
                        <p className="text-white text-sm">{clientName(h)}</p>
                        <p className="text-[#484f58] text-xs">{clientPhone(h)}</p>
                      </td>
                      <td className="px-4 py-3">
                        <p className="text-[#c9d1d9] text-sm">{(h.projects as any)?.name || '—'}</p>
                        <p className="text-[#58a6ff] text-xs">{h.room || '—'}</p>
                      </td>
                      <td className="px-4 py-3 text-[#c9d1d9] text-sm">{fmtBaht(h.total_amount)}</td>
                      <td className="px-4 py-3 text-green-400 text-sm">{dateStr(h.handover_date)}</td>
                      <td className="px-4 py-3 text-green-400 text-sm">{dateStr(h.final_payment_date)}</td>
                      <td className="px-4 py-3">
                        {h.warranty_end
                          ? <span className={`text-xs flex items-center gap-1 ${warrantyActive ? 'text-green-400' : 'text-[#484f58]'}`}>
                              <Shield size={12} />
                              {warrantyActive ? `ถึง ${dateStr(h.warranty_end)}` : 'หมดประกัน'}
                            </span>
                          : <span className="text-[#484f58] text-xs">—</span>}
                      </td>
                      <td className="px-4 py-3">
                        {h.defect_noted
                          ? <span className="text-red-400 text-xs">มี Defect</span>
                          : <span className="text-green-400 text-xs">ไม่มี</span>}
                      </td>
                      <td className="px-4 py-3">
                        <button onClick={() => openEdit(h)} className="text-[#8b949e] hover:text-white transition-colors">
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

      {!loading && handovers.length === 0 && (
        <div className="text-center py-16 bg-[#161b22] border border-[#30363d] rounded-xl">
          <ArrowRightLeft size={32} className="mx-auto text-[#484f58] mb-2" />
          <p className="text-[#8b949e] text-sm">ยังไม่มีรายการส่งมอบ</p>
        </div>
      )}

      {/* Modal */}
      <Modal open={open} onClose={() => setOpen(false)} title={editing ? 'แก้ไขรายการส่งมอบ' : 'เพิ่มรายการส่งมอบ'} size="lg">
        <div className="grid grid-cols-2 gap-4">

          {/* Client type */}
          <div className="col-span-2">
            <p className="text-[#8b949e] text-xs mb-2">ประเภทลูกค้า</p>
            <div className="flex gap-3">
              {(['B2C', 'B2B'] as const).map(t => (
                <button key={t}
                  onClick={() => { setForm({ ...form, client_type: t, lead_id: '' }); if (t === 'B2C') loadLeads(form.project_id) }}
                  className={`flex-1 py-2 rounded-lg text-sm font-medium border transition-colors ${form.client_type === t ? 'bg-[#1f6feb] border-[#1f6feb] text-white' : 'border-[#30363d] text-[#8b949e] hover:text-white'}`}>
                  {t === 'B2C' ? 'B2C — รายบุคคล / Condo' : 'B2B — องค์กร'}
                </button>
              ))}
            </div>
          </div>

          {/* Project + room */}
          <Select label="โครงการ" value={form.project_id}
            onChange={e => {
              setForm({ ...form, project_id: e.target.value, lead_id: '' })
              if (form.client_type === 'B2C') loadLeads(e.target.value)
            }}
            options={projOptions} />

          {form.client_type === 'B2C' ? (
            <Select label="ห้อง (จาก Origin Pool)" value={form.lead_id}
              onChange={e => {
                const lead = leads.find(l => String(l.id) === e.target.value)
                setForm({ ...form, lead_id: e.target.value, room: lead ? `${lead.tower}-${lead.room_no}` : form.room })
              }}
              options={leadOptions} />
          ) : (
            <Input label="ห้อง / สถานที่" value={form.room}
              onChange={e => setForm({ ...form, room: e.target.value })}
              placeholder="เช่น ชั้น 3 อาคาร A" />
          )}

          <Input label="มูลค่างาน (บาท)" type="number" value={form.total_amount}
            onChange={e => setForm({ ...form, total_amount: e.target.value })} />
          <Select label="สถานะ" value={form.status}
            onChange={e => setForm({ ...form, status: e.target.value })}
            options={STATUS.map(s => ({ value: s.value, label: s.label }))} />

          {/* Timeline */}
          <div className="col-span-2 border-t border-[#21262d] pt-4 mt-1">
            <p className="text-[#8b949e] text-xs font-semibold uppercase tracking-widest mb-3">ระยะเวลางาน</p>
          </div>
          <Input label="วันเริ่มงาน" type="date" value={form.job_start_date}
            onChange={e => setForm({ ...form, job_start_date: e.target.value })} />
          <Select label="ระยะเวลางาน" value={form.work_days}
            onChange={e => setForm({ ...form, work_days: e.target.value })}
            options={WORK_DAYS_OPTS} />
          {form.job_start_date && form.work_days && (
            <div className="col-span-2 text-xs text-[#8b949e] -mt-2 px-1">
              กำหนดแล้วเสร็จ: <span className="text-white">{calcDate(form.job_start_date, form.work_days) || '—'}</span>
            </div>
          )}

          {/* Delivery */}
          <div className="col-span-2 border-t border-[#21262d] pt-4 mt-1">
            <p className="text-[#8b949e] text-xs font-semibold uppercase tracking-widest mb-3">การส่งมอบ & เก็บเงิน</p>
          </div>
          <Input label="วันเก็บเงินงวดสุดท้าย (รับรู้รายได้)" type="date" value={form.final_payment_date}
            onChange={e => setForm({ ...form, final_payment_date: e.target.value })} />
          <Input label="วันส่งมอบงาน" type="date" value={form.handover_date}
            onChange={e => setForm({ ...form, handover_date: e.target.value })} />
          <Input label="วันที่ Sales เซ็น" type="date" value={form.sales_sign_date}
            onChange={e => setForm({ ...form, sales_sign_date: e.target.value })} />
          <Input label="วันที่ลูกค้าเซ็น" type="date" value={form.customer_sign_date}
            onChange={e => setForm({ ...form, customer_sign_date: e.target.value })} />

          {/* Warranty */}
          {form.handover_date && (
            <>
              <div className="col-span-2 border-t border-[#21262d] pt-4 mt-1">
                <p className="text-[#8b949e] text-xs font-semibold uppercase tracking-widest mb-3">ประกัน</p>
              </div>
              <Input label="ระยะประกัน (วัน)" type="number" value={form.warranty_days}
                onChange={e => setForm({ ...form, warranty_days: e.target.value })}
                placeholder="เช่น 365" />
              {form.warranty_days && (
                <div className="flex items-center text-xs text-[#8b949e] px-1">
                  ประกันสิ้นสุด: <span className="text-green-400 ml-1">{calcDate(form.handover_date, form.warranty_days) || '—'}</span>
                </div>
              )}
            </>
          )}

          {/* Defect */}
          <div className="col-span-2 flex items-center gap-3 border-t border-[#21262d] pt-4 mt-1">
            <input type="checkbox" id="defect" checked={form.defect_noted}
              onChange={e => setForm({ ...form, defect_noted: e.target.checked })}
              className="w-4 h-4 accent-red-500" />
            <label htmlFor="defect" className="text-[#c9d1d9] text-sm">มี Defect</label>
          </div>
          {form.defect_noted && (
            <div className="col-span-2">
              <TextArea label="รายละเอียด Defect" value={form.defect_details}
                onChange={e => setForm({ ...form, defect_details: e.target.value })}
                placeholder="ระบุรายละเอียด..." />
            </div>
          )}
          <div className="col-span-2">
            <TextArea label="หมายเหตุ" value={form.notes}
              onChange={e => setForm({ ...form, notes: e.target.value })} />
          </div>
        </div>

        {saveError && (
          <div className="flex items-center gap-2 mt-3 p-3 rounded-xl text-xs text-red-400" style={{ background: 'rgba(239,68,68,0.1)' }}>
            {saveError}
          </div>
        )}
        <div className="flex justify-end gap-3 mt-5">
          <button onClick={() => setOpen(false)} className="px-4 py-2 text-[#8b949e] hover:text-white text-sm transition-colors">ยกเลิก</button>
          <button onClick={save} disabled={saving}
            className="px-4 py-2 bg-[#238636] hover:bg-[#2ea043] disabled:opacity-50 text-white text-sm rounded-lg transition-colors">
            {saving ? 'กำลังบันทึก...' : 'บันทึก'}
          </button>
        </div>
      </Modal>
    </div>
  )
}
