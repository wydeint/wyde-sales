'use client'

import { useEffect, useState, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import {
  Plus, X, Phone, Mail, MessageCircle, Building2, Home,
  Banknote, FileText, Pencil, Save, ChevronRight,
} from 'lucide-react'
import { PageSpinner } from '@/components/ui/StateUI'
import Modal from '@/components/ui/Modal'
import { Input, Select, TextArea } from '@/components/ui/Input'
import SearchableSelect from '@/components/ui/SearchableSelect'

const WORK_TYPES = ['N-RPT/Event', 'N-RPT/EQ', 'N-RPT', 'RPT', 'อื่นๆ']
const todayStr = () => new Date().toISOString().slice(0, 10)

// ─── Types ─────────────────────────────────────────────────
interface Customer {
  id: string; customer_name: string; phone: string; email: string; line_id: string
  source: string; project_id: string; interested_room: string; budget: number
  status: string; assigned_to: string; notes: string; created_at: string
  projects?: { name: string }; users?: { name: string }
}
interface Project { id: string; name: string }
interface User { id: string; name: string }
interface DetailJob {
  id: string; po_no: string; so_no: string; work_type: string; package_type: string
  order_date: string | null; revenue_inc_vat: number; working_status: string
  installments: { id: string; installment_no: number; installment_name: string; amount: number; status: string; due_date: string | null; paid_date: string | null; is_final: boolean }[]
  handover: { delivery_date: string | null; work_status: string } | null
}
interface DetailWarranty {
  id: string; warranty_start: string; warranty_end: string; warranty_months: number
  status: string; room: string
}

// ─── Stage config ───────────────────────────────────────────
const STAGES = [
  { value: 'new',           label: 'ใหม่',         bg: 'rgba(59,130,246,0.08)',  border: '#3b82f680', text: '#60a5fa',  dot: '#60a5fa',  chip: 'rgba(59,130,246,0.15)' },
  { value: 'interested',    label: 'สนใจ',          bg: 'rgba(6,182,212,0.08)',   border: '#06b6d480', text: '#22d3ee',  dot: '#22d3ee',  chip: 'rgba(6,182,212,0.15)'  },
  { value: 'quoted',        label: 'เสนอราคาแล้ว',  bg: 'rgba(234,179,8,0.08)',   border: '#eab30880', text: '#fbbf24',  dot: '#fbbf24',  chip: 'rgba(234,179,8,0.15)'  },
  { value: 'booked',        label: 'จอง',           bg: 'rgba(249,115,22,0.08)',  border: '#f9731680', text: '#fb923c',  dot: '#fb923c',  chip: 'rgba(249,115,22,0.15)' },
  { value: 'close_pending', label: 'รอปิด',         bg: 'rgba(168,85,247,0.08)',  border: '#a855f780', text: '#c084fc',  dot: '#c084fc',  chip: 'rgba(168,85,247,0.15)' },
  { value: 'closed',        label: 'ปิดแล้ว',       bg: 'rgba(34,197,94,0.08)',   border: '#22c55e80', text: '#4ade80',  dot: '#4ade80',  chip: 'rgba(34,197,94,0.15)'  },
  { value: 'lost',          label: 'หลุด',          bg: 'rgba(239,68,68,0.08)',   border: '#ef444480', text: '#f87171',  dot: '#f87171',  chip: 'rgba(239,68,68,0.15)'  },
]
const stageMap = Object.fromEntries(STAGES.map(s => [s.value, s]))

const SOURCE_OPTS = [
  { value: '', label: '— ช่องทาง —' }, { value: 'event', label: 'Event' },
  { value: 'referral', label: 'Referral' }, { value: 'walk_in', label: 'Walk-in' },
  { value: 'online', label: 'Online' }, { value: 'cold_call', label: 'Cold Call' },
  { value: 'other', label: 'อื่นๆ' },
]

const emptyForm = {
  customer_name: '', phone: '', email: '', line_id: '', source: '',
  project_id: '', interested_room: '', budget: 0, status: 'new', assigned_to: '', notes: '',
}

const f = (n: number) => n ? '฿' + n.toLocaleString('th-TH') : '—'
const fdate = (d: string | null) => d ? new Date(d).toLocaleDateString('th-TH', { day: '2-digit', month: 'short', year: '2-digit' }) : '—'

// ─── CustomerCard ───────────────────────────────────────────
function CustomerCard({ c, stage, onClick }: { c: Customer; stage: typeof STAGES[0]; onClick: () => void }) {
  return (
    <button onClick={onClick} className="ds-card w-full text-left p-3 transition-all hover:scale-[1.01] active:scale-[0.99]">
      <div className="flex items-start justify-between gap-1 mb-1">
        <p className="font-semibold text-sm leading-snug flex-1 min-w-0 truncate" style={{ color: 'var(--text-1)' }}>{c.customer_name}</p>
        <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-[4px] flex-shrink-0"
          style={{ background: stage.chip, color: stage.text, border: `1px solid ${stage.border}` }}>
          {stage.label}
        </span>
      </div>
      {(c as any).projects?.name && (
        <p className="text-[11px] mb-1.5 truncate" style={{ color: 'var(--text-3)' }}>{(c as any).projects.name}</p>
      )}
      <div className="flex items-center justify-between mt-1">
        {c.interested_room
          ? <span className="text-[10px] font-mono px-1.5 py-0.5 rounded" style={{ background: 'var(--hover-bg)', color: 'var(--text-2)' }}>ห้อง {c.interested_room}</span>
          : <span />}
        {c.budget > 0 && <span className="text-[10px] font-semibold" style={{ color: 'var(--text-2)' }}>{f(c.budget)}</span>}
      </div>
      {(c as any).users?.name && (
        <p className="text-[10px] mt-1 truncate" style={{ color: 'var(--text-3)' }}>{(c as any).users.name}</p>
      )}
    </button>
  )
}

// ─── CustomerDrawer ─────────────────────────────────────────
function CustomerDrawer({ customer, projects, users, onClose, onUpdate, onStartJob }: {
  customer: Customer; projects: Project[]; users: User[]
  onClose: () => void; onUpdate: (c: Customer) => void
  onStartJob: (c: Customer) => void
}) {
  const supabase = createClient()
  const stage = stageMap[customer.status] || STAGES[0]
  const [editing, setEditing] = useState(false)
  const [form, setForm] = useState({ ...customer })
  const [saving, setSaving] = useState(false)
  const [jobs, setJobs] = useState<DetailJob[]>([])
  const [warranties, setWarranties] = useState<DetailWarranty[]>([])
  const [loadingDetail, setLoadingDetail] = useState(true)

  useEffect(() => {
    let cancelled = false
    async function load() {
      setLoadingDetail(true)
      // Query jobs by customer_id (UUID — legacy) OR by project+room (new flow from เริ่มงาน)
      const expectedCustomerId = customer.project_id && customer.interested_room
        ? `${customer.project_id}-${customer.interested_room}` : null
      const jobQuery = supabase.from('jobs')
        .select('id, po_no, so_no, work_type, package_type, order_date, revenue_inc_vat, working_status')
        .order('order_date', { ascending: false })
      const [{ data: jobsRaw }, { data: wRaw }] = await Promise.all([
        expectedCustomerId
          ? jobQuery.or(`customer_id.eq.${customer.id},customer_id.eq.${expectedCustomerId}`)
          : jobQuery.eq('customer_id', customer.id),
        supabase.from('warranties').select('id, warranty_start, warranty_end, warranty_months, status, room')
          .eq('customer_id', customer.id),
      ])
      if (cancelled) return
      const jobIds = (jobsRaw || []).map((j: any) => j.id)
      const [{ data: insts }, { data: handovers }] = jobIds.length > 0
        ? await Promise.all([
            supabase.from('payments').select('id, job_id, installment_no, installment_name, amount, status, due_date, paid_date, is_final').in('job_id', jobIds).order('installment_no'),
            supabase.from('handovers').select('job_id, delivery_date, work_status').in('job_id', jobIds),
          ])
        : [{ data: [] }, { data: [] }]
      if (cancelled) return
      const iMap = new Map<string, any[]>()
      for (const p of (insts || []) as any[]) { if (!iMap.has(p.job_id)) iMap.set(p.job_id, []); iMap.get(p.job_id)!.push(p) }
      const hMap = new Map<string, any>()
      for (const h of (handovers || []) as any[]) { if (h.job_id) hMap.set(h.job_id, h) }
      setJobs((jobsRaw || []).map((j: any) => ({ ...j, installments: iMap.get(j.id) || [], handover: hMap.get(j.id) || null })))
      setWarranties((wRaw || []) as DetailWarranty[])
      setLoadingDetail(false)
    }
    load()
    return () => { cancelled = true }
  }, [customer.id])

  async function save() {
    setSaving(true)
    const payload: Record<string, unknown> = {
      customer_name: form.customer_name, phone: form.phone, email: form.email,
      line_id: form.line_id, source: form.source, project_id: form.project_id || null,
      interested_room: form.interested_room, budget: form.budget || 0,
      status: form.status, assigned_to: form.assigned_to || null, notes: form.notes,
    }
    const { error } = await supabase.from('customers').update(payload).eq('id', customer.id)
    if (!error) onUpdate({ ...customer, ...form } as Customer)
    setSaving(false)
    setEditing(false)
  }

  const fv = (k: keyof typeof form) => (v: unknown) => setForm(prev => ({ ...prev, [k]: v }))

  return (
    <>
      {/* Backdrop */}
      <div className="fixed inset-0 z-40" style={{ background: 'rgba(0,0,0,0.30)', backdropFilter: 'blur(6px)', WebkitBackdropFilter: 'blur(6px)' }} onClick={onClose} />
      {/* Centered Panel */}
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 pointer-events-none">
      <div className="w-full max-w-[460px] max-h-[90vh] flex flex-col rounded-[20px] shadow-2xl pointer-events-auto"
        style={{ background: 'var(--sidebar-bg)', border: '1px solid var(--card-border)' }}>

        {/* Header */}
        <div className="flex items-start gap-3 p-5" style={{ borderBottom: '1px solid var(--divider)' }}>
          <div className="flex-1 min-w-0">
            <p className="font-bold text-base leading-snug" style={{ color: 'var(--text-1)' }}>{customer.customer_name}</p>
            <span className="inline-flex items-center gap-1.5 mt-1 px-2 py-0.5 rounded-full text-xs font-semibold"
              style={{ background: stage.chip, color: stage.text }}>
              <span className="w-1.5 h-1.5 rounded-full" style={{ background: stage.dot }} />
              {stage.label}
            </span>
          </div>
          <div className="flex items-center gap-1">
            <button onClick={() => setEditing(e => !e)}
              className="p-2 rounded-[8px]" style={{ background: 'var(--hover-bg)', color: 'var(--text-2)' }}>
              <Pencil size={14} />
            </button>
            <button onClick={onClose} className="p-2 rounded-[8px]" style={{ background: 'var(--hover-bg)', color: 'var(--text-2)' }}>
              <X size={14} />
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-5 space-y-5">
          {/* Edit form */}
          {editing ? (
            <div className="space-y-3 p-4 rounded-[12px]" style={{ background: 'var(--hover-bg)', border: '1px solid var(--divider)' }}>
              <p className="text-xs font-semibold" style={{ color: 'var(--text-2)' }}>แก้ไขข้อมูล</p>
              <Input label="ชื่อลูกค้า" value={form.customer_name} onChange={e => setForm(p => ({ ...p, customer_name: e.target.value }))} />
              <div className="grid grid-cols-2 gap-2">
                <Input label="โทรศัพท์" value={form.phone} onChange={e => setForm(p => ({ ...p, phone: e.target.value }))} />
                <Input label="Line ID" value={form.line_id} onChange={e => setForm(p => ({ ...p, line_id: e.target.value }))} />
              </div>
              <Input label="Email" value={form.email} onChange={e => setForm(p => ({ ...p, email: e.target.value }))} />
              <div className="grid grid-cols-2 gap-2">
                <div><p className="text-xs mb-1" style={{ color: 'var(--text-2)' }}>โครงการ</p>
                  <SearchableSelect
                    value={form.project_id}
                    onChange={v => setForm(p => ({ ...p, project_id: String(v) }))}
                    options={[{ value: '', label: '— เลือก —' }, ...projects.map(p => ({ value: p.id, label: p.name }))]}
                  /></div>
                <Input label="ห้องที่สนใจ" value={form.interested_room} onChange={e => setForm(p => ({ ...p, interested_room: e.target.value }))} />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <Input label="งบประมาณ" type="number" value={String(form.budget || '')} onChange={e => setForm(p => ({ ...p, budget: Number(e.target.value) }))} />
                <Select label="ช่องทาง" value={form.source} onChange={e => setForm(p => ({ ...p, source: e.target.value }))} options={SOURCE_OPTS} />
              </div>
              <Select label="สถานะ" value={form.status}
                onChange={e => setForm(p => ({ ...p, status: e.target.value }))}
                options={STAGES.map(s => ({ value: s.value, label: s.label }))} />
              <div><p className="text-xs mb-1" style={{ color: 'var(--text-2)' }}>มอบหมายให้</p>
                <SearchableSelect
                  value={form.assigned_to}
                  onChange={v => setForm(p => ({ ...p, assigned_to: String(v) }))}
                  options={[{ value: '', label: '— เลือก —' }, ...users.map(u => ({ value: u.id, label: u.name }))]}
                /></div>
              <TextArea label="หมายเหตุ" value={form.notes} onChange={e => setForm(p => ({ ...p, notes: e.target.value }))} rows={2} />
              <div className="flex gap-2 pt-1">
                <button onClick={() => setEditing(false)} className="flex-1 py-2 rounded-[8px] text-sm border" style={{ border: '1px solid var(--divider)', color: 'var(--text-2)' }}>ยกเลิก</button>
                <button onClick={save} disabled={saving}
                  className="flex-1 py-2 rounded-[8px] text-sm font-semibold text-white flex items-center justify-center gap-1.5"
                  style={{ background: saving ? '#666' : 'var(--accent)' }}>
                  <Save size={13} /> {saving ? '...' : 'บันทึก'}
                </button>
              </div>
            </div>
          ) : (
            /* Read-only info */
            <div className="space-y-3">
              {/* Contact row */}
              <div className="flex gap-2 flex-wrap">
                {customer.phone && (
                  <a href={`tel:${customer.phone}`} className="flex items-center gap-1.5 px-3 py-1.5 rounded-[8px] text-xs"
                    style={{ background: 'var(--hover-bg)', color: 'var(--text-2)', border: '1px solid var(--divider)' }}>
                    <Phone size={12} /> {customer.phone}
                  </a>
                )}
                {customer.email && (
                  <a href={`mailto:${customer.email}`} className="flex items-center gap-1.5 px-3 py-1.5 rounded-[8px] text-xs"
                    style={{ background: 'var(--hover-bg)', color: 'var(--text-2)', border: '1px solid var(--divider)' }}>
                    <Mail size={12} /> {customer.email}
                  </a>
                )}
                {customer.line_id && (
                  <span className="flex items-center gap-1.5 px-3 py-1.5 rounded-[8px] text-xs"
                    style={{ background: 'var(--hover-bg)', color: 'var(--text-2)', border: '1px solid var(--divider)' }}>
                    <MessageCircle size={12} /> {customer.line_id}
                  </span>
                )}
              </div>

              {/* Info grid */}
              <div className="grid grid-cols-2 gap-2">
                {(customer as any).projects?.name && (
                  <InfoItem icon={<Building2 size={12} />} label="โครงการ" value={(customer as any).projects.name} />
                )}
                {customer.interested_room && (
                  <InfoItem icon={<Home size={12} />} label="ห้องที่สนใจ" value={customer.interested_room} />
                )}
                {customer.budget > 0 && (
                  <InfoItem icon={<Banknote size={12} />} label="งบประมาณ" value={f(customer.budget)} />
                )}
                {customer.source && (
                  <InfoItem icon={<FileText size={12} />} label="ช่องทาง" value={customer.source} />
                )}
                {(customer as any).users?.name && (
                  <InfoItem icon={<ChevronRight size={12} />} label="มอบหมาย" value={(customer as any).users.name} />
                )}
              </div>

              {/* Move stage */}
              <div>
                <p className="text-[10px] mb-1.5 font-semibold uppercase tracking-widest" style={{ color: 'var(--text-3)' }}>ย้ายสถานะ</p>
                <div className="flex flex-wrap gap-1.5">
                  {STAGES.filter(s => s.value !== customer.status).map(s => (
                    <button key={s.value} onClick={async () => {
                      if (s.value === 'closed') { onStartJob(customer); return }
                      await supabase.from('customers').update({ status: s.value }).eq('id', customer.id)
                      onUpdate({ ...customer, status: s.value })
                    }}
                      className="px-2.5 py-1 rounded-full text-[11px] font-semibold transition-colors"
                      style={s.value === 'closed'
                        ? { background: 'rgba(5,150,105,0.15)', color: '#34d399', border: '1px solid rgba(5,150,105,0.4)' }
                        : { background: s.chip, color: s.text, border: `1px solid ${s.border}` }}>
                      {s.value === 'closed' ? '⚡ เริ่มงาน' : `→ ${s.label}`}
                    </button>
                  ))}
                </div>
              </div>

              {customer.notes && (
                <div className="p-3 rounded-[10px] text-xs" style={{ background: 'var(--hover-bg)', color: 'var(--text-2)' }}>{customer.notes}</div>
              )}
            </div>
          )}

          {/* Jobs */}
          {!loadingDetail && jobs.length > 0 && (
            <div>
              <p className="text-[10px] mb-2 font-semibold uppercase tracking-widest" style={{ color: 'var(--text-3)' }}>งาน / Jobs</p>
              <div className="space-y-2">
                {jobs.map(j => (
                  <div key={j.id} className="rounded-[10px] p-3 text-xs" style={{ background: 'var(--hover-bg)', border: '1px solid var(--divider)' }}>
                    <div className="flex items-center justify-between mb-1">
                      <span className="font-semibold" style={{ color: 'var(--text-1)' }}>{j.work_type || 'งาน'} · {j.package_type}</span>
                      <span style={{ color: 'var(--text-3)' }}>{fdate(j.order_date)}</span>
                    </div>
                    {j.revenue_inc_vat > 0 && <p style={{ color: 'var(--accent)' }}>{f(j.revenue_inc_vat)}</p>}
                    <p className="mt-0.5" style={{ color: 'var(--text-3)' }}>{j.working_status}</p>
                    {j.installments.length > 0 && (
                      <div className="mt-2 space-y-1">
                        {j.installments.map(inst => (
                          <div key={inst.id} className="flex items-center justify-between">
                            <span style={{ color: 'var(--text-2)' }}>{inst.installment_name}</span>
                            <span className="flex items-center gap-1.5">
                              <span style={{ color: inst.status === 'paid' ? '#4ade80' : inst.status === 'overdue' ? '#f87171' : 'var(--text-3)' }}>
                                {inst.status === 'paid' ? '✓' : inst.status === 'overdue' ? '!' : '○'}
                              </span>
                              <span style={{ color: 'var(--text-2)' }}>{f(inst.amount)}</span>
                            </span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Warranties */}
          {!loadingDetail && warranties.length > 0 && (
            <div>
              <p className="text-[10px] mb-2 font-semibold uppercase tracking-widest" style={{ color: 'var(--text-3)' }}>ประกัน</p>
              <div className="space-y-2">
                {warranties.map(w => (
                  <div key={w.id} className="rounded-[10px] p-3 text-xs flex items-center justify-between"
                    style={{ background: 'var(--hover-bg)', border: '1px solid var(--divider)' }}>
                    <span style={{ color: 'var(--text-2)' }}>ห้อง {w.room} · {w.warranty_months} เดือน</span>
                    <span style={{ color: w.status === 'active' ? '#4ade80' : 'var(--text-3)' }}>{fdate(w.warranty_end)}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
      </div>
    </>
  )
}

// ─── Start Job Modal ────────────────────────────────────────
function StartJobModal({ customer, users, onClose, onSaved }: {
  customer: Customer; users: User[]
  onClose: () => void; onSaved: () => void
}) {
  const supabase = createClient()
  const [roomNo, setRoomNo] = useState(customer.interested_room || '')
  const [revenue, setRevenue] = useState(customer.budget || 0)
  const [workType, setWorkType] = useState('N-RPT/Event')
  const [orderDate, setOrderDate] = useState(todayStr())
  const [salesId, setSalesId] = useState(customer.assigned_to || '')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const inputStyle = { background: 'var(--input-bg)', border: '1px solid var(--divider)', color: 'var(--text-1)' }

  async function save() {
    if (!roomNo.trim()) { setError('กรุณาระบุเลขห้อง'); return }
    if (!customer.project_id) { setError('ไม่มีข้อมูลโครงการ กรุณาแก้ไขข้อมูล Prospect ก่อน'); return }
    setSaving(true); setError('')

    // Find max job number
    const { data: allJobs } = await supabase.from('jobs').select('id')
    const maxNum = (allJobs || []).reduce((max: number, j: { id: string }) => {
      const n = parseInt(j.id.replace(/\D/g, '')) || 0
      return Math.max(max, n)
    }, 0)
    const jobId = `JOB-${String(maxNum + 1).padStart(3, '0')}`
    const customerId = `${customer.project_id}-${roomNo.trim()}`

    // Upsert job-customer record (FK)
    await supabase.from('customers').upsert({
      id: customerId, project_id: customer.project_id,
      customer_name: customer.customer_name, customer_type: 'B2C', status: 'active',
    }, { onConflict: 'id', ignoreDuplicates: true })

    // Insert job
    const { error: jobErr } = await supabase.from('jobs').insert({
      id: jobId, customer_id: customerId,
      project_id: customer.project_id, room_no: roomNo.trim(),
      customer_name: customer.customer_name, customer_type: 'B2C',
      work_type: workType, order_date: orderDate,
      revenue_inc_vat: revenue, revenue_ex_vat: Math.round(revenue / 1.07),
      transfer_amount: revenue, working_status: 'รับงาน',
      accounting_status: 'Backlog', sales_id: salesId || null,
    })

    if (jobErr) { setError('เกิดข้อผิดพลาด: ' + jobErr.message); setSaving(false); return }

    // Update pipeline prospect to closed
    await supabase.from('customers').update({ status: 'closed' }).eq('id', customer.id)
    setSaving(false); onSaved(); onClose()
  }

  return (
    <div className="fixed inset-0 z-[70] flex items-end sm:items-center justify-center p-4" onClick={onClose}>
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
      <div className="relative w-full max-w-sm rounded-[18px] shadow-2xl"
        style={{ background: 'var(--card-bg)', border: '1px solid var(--card-border)' }}
        onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between p-5" style={{ borderBottom: '1px solid var(--divider)' }}>
          <div>
            <h3 className="font-semibold text-sm" style={{ color: 'var(--text-1)' }}>เริ่มงาน</h3>
            <p className="text-xs mt-0.5" style={{ color: 'var(--text-3)' }}>{customer.customer_name} · {(customer as any).projects?.name || customer.project_id}</p>
          </div>
          <button onClick={onClose} style={{ color: 'var(--text-2)' }}><X size={18} /></button>
        </div>
        <div className="p-5 space-y-3">
          <div>
            <p className="text-xs mb-1" style={{ color: 'var(--text-2)' }}>เลขห้อง *</p>
            <input value={roomNo} onChange={e => setRoomNo(e.target.value)} autoFocus
              className="w-full px-3 py-2 rounded-[8px] text-sm focus:outline-none"
              style={inputStyle} placeholder="เช่น A-101" />
          </div>
          <div>
            <p className="text-xs mb-1" style={{ color: 'var(--text-2)' }}>มูลค่างาน (inc. VAT)</p>
            <input type="number" value={revenue || ''} onChange={e => setRevenue(Number(e.target.value))}
              className="w-full px-3 py-2 rounded-[8px] text-sm focus:outline-none" style={inputStyle} />
          </div>
          <div>
            <p className="text-xs mb-1" style={{ color: 'var(--text-2)' }}>ประเภทงาน</p>
            <select value={workType} onChange={e => setWorkType(e.target.value)}
              className="w-full px-3 py-2 rounded-[8px] text-sm focus:outline-none" style={inputStyle}>
              {WORK_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
            </select>
          </div>
          <div>
            <p className="text-xs mb-1" style={{ color: 'var(--text-2)' }}>วันที่รับงาน</p>
            <input type="date" value={orderDate} onChange={e => setOrderDate(e.target.value)}
              className="w-full px-3 py-2 rounded-[8px] text-sm focus:outline-none" style={inputStyle} />
          </div>
          <div>
            <p className="text-xs mb-1" style={{ color: 'var(--text-2)' }}>Sales</p>
            <select value={salesId} onChange={e => setSalesId(e.target.value)}
              className="w-full px-3 py-2 rounded-[8px] text-sm focus:outline-none" style={inputStyle}>
              <option value="">— เลือก —</option>
              {users.map(u => <option key={u.id} value={u.id}>{u.name}</option>)}
            </select>
          </div>
          {error && <p className="text-xs text-red-400">{error}</p>}
          <button onClick={save} disabled={saving}
            className="w-full py-3 rounded-[12px] font-semibold text-sm text-white"
            style={{ background: saving ? '#666' : '#059669' }}>
            {saving ? 'กำลังสร้างงาน...' : '⚡ เริ่มงาน'}
          </button>
        </div>
      </div>
    </div>
  )
}

function InfoItem({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="flex items-start gap-1.5 text-xs">
      <span className="mt-0.5 flex-shrink-0" style={{ color: 'var(--text-3)' }}>{icon}</span>
      <div>
        <p className="text-[10px]" style={{ color: 'var(--text-3)' }}>{label}</p>
        <p style={{ color: 'var(--text-1)' }}>{value}</p>
      </div>
    </div>
  )
}

// ─── Add/Edit modal form ────────────────────────────────────
function CustomerForm({ initial, projects, users, onSave, onClose }: {
  initial?: typeof emptyForm; projects: Project[]; users: User[]
  onSave: (data: typeof emptyForm) => Promise<void>; onClose: () => void
}) {
  const [form, setForm] = useState(initial || emptyForm)
  const [saving, setSaving] = useState(false)
  const s = (k: keyof typeof emptyForm) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) =>
    setForm(p => ({ ...p, [k]: e.target.value }))

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (!form.customer_name.trim()) return
    setSaving(true)
    await onSave(form)
    setSaving(false)
  }

  return (
    <form onSubmit={submit} className="space-y-3">
      <Input label="ชื่อลูกค้า *" value={form.customer_name} onChange={s('customer_name')} autoFocus />
      <div className="grid grid-cols-2 gap-3">
        <Input label="โทรศัพท์" value={form.phone} onChange={s('phone')} />
        <Input label="Line ID" value={form.line_id} onChange={s('line_id')} />
      </div>
      <Input label="Email" value={form.email} onChange={s('email')} />
      <div className="grid grid-cols-2 gap-3">
        <div><p className="text-xs mb-1" style={{ color: 'var(--text-2)' }}>โครงการ</p>
          <SearchableSelect value={form.project_id}
            onChange={v => setForm(p => ({ ...p, project_id: String(v) }))}
            options={[{ value: '', label: '— เลือก —' }, ...projects.map(p => ({ value: p.id, label: p.name }))]} /></div>
        <Input label="ห้องที่สนใจ" value={form.interested_room} onChange={s('interested_room')} />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <Input label="งบประมาณ" type="number" value={String(form.budget || '')} onChange={e => setForm(p => ({ ...p, budget: Number(e.target.value) }))} />
        <Select label="ช่องทาง" value={form.source} onChange={s('source')} options={SOURCE_OPTS} />
      </div>
      <Select label="สถานะ" value={form.status} onChange={s('status')}
        options={STAGES.map(st => ({ value: st.value, label: st.label }))} />
      <div><p className="text-xs mb-1" style={{ color: 'var(--text-2)' }}>มอบหมายให้ (Sales)</p>
        <SearchableSelect value={form.assigned_to}
          onChange={v => setForm(p => ({ ...p, assigned_to: String(v) }))}
          options={[{ value: '', label: '— เลือก —' }, ...users.map(u => ({ value: u.id, label: u.name }))]} /></div>
      <TextArea label="หมายเหตุ" value={form.notes} onChange={s('notes')} rows={2} />
      <div className="flex gap-2 pt-1">
        <button type="button" onClick={onClose} className="flex-1 py-2.5 rounded-[10px] text-sm border" style={{ border: '1px solid var(--divider)', color: 'var(--text-2)' }}>ยกเลิก</button>
        <button type="submit" disabled={saving}
          className="flex-1 py-2.5 rounded-[10px] text-sm font-semibold text-white"
          style={{ background: saving ? '#666' : 'var(--accent)' }}>
          {saving ? 'กำลังบันทึก...' : 'บันทึก'}
        </button>
      </div>
    </form>
  )
}

// ─── Main ───────────────────────────────────────────────────
export default function ProspectsKanbanPage() {
  const supabase = createClient()
  const [customers, setCustomers] = useState<Customer[]>([])
  const [projects, setProjects] = useState<Project[]>([])
  const [users, setUsers] = useState<User[]>([])
  const [loading, setLoading] = useState(true)
  const [activeStage, setActiveStage] = useState('new')
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null)
  const [addModal, setAddModal] = useState(false)
  const [startJobCustomer, setStartJobCustomer] = useState<Customer | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    const [{ data: cData }, { data: pData }, { data: uData }] = await Promise.all([
      supabase.from('customers')
        .select('id, customer_name, phone, email, line_id, source, project_id, interested_room, budget, status, assigned_to, notes, created_at, projects(name), users!customers_assigned_to_fkey(name)')
        .order('created_at', { ascending: false }),
      supabase.from('projects').select('id, name').eq('active', true).order('name'),
      supabase.from('users').select('id, name').eq('active', true).order('name'),
    ])
    setCustomers((cData as any) || [])
    setProjects(pData || [])
    setUsers(uData || [])
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])


  async function addCustomer(form: typeof emptyForm) {
    const { data, error } = await supabase.from('customers').insert([{
      ...form, project_id: form.project_id || null, assigned_to: form.assigned_to || null, budget: form.budget || 0,
    }]).select('id, customer_name, phone, email, line_id, source, project_id, interested_room, budget, status, assigned_to, notes, created_at, projects(name), users!customers_assigned_to_fkey(name)').single()
    if (!error && data) setCustomers(prev => [data as any, ...prev])
    setAddModal(false)
  }

  function updateCustomer(updated: Customer) {
    setCustomers(prev => prev.map(c => c.id === updated.id ? updated : c))
    setSelectedCustomer(updated)
  }

  if (loading) return <PageSpinner />

  const stage = STAGES.find(s => s.value === activeStage) || STAGES[0]
  const list = customers.filter(c => c.status === activeStage)

  return (
    <div className="h-screen flex flex-col" style={{ background: 'var(--page-bg)' }}>

      {/* Header */}
      <div className="flex-shrink-0 px-6 pt-5 pb-3">
        <div className="flex items-center gap-3 mb-4">
          <div className="flex-1">
            <h1 className="text-lg font-bold" style={{ color: 'var(--text-1)' }}>Prospects</h1>
            <p className="text-xs mt-0.5" style={{ color: 'var(--text-3)' }}>{customers.length} ราย</p>
          </div>
          <button onClick={() => setAddModal(true)}
            className="flex items-center gap-1.5 px-4 py-2 rounded-[10px] text-sm font-semibold text-white"
            style={{ background: 'var(--accent)' }}>
            <Plus size={15} /> เพิ่ม Prospect
          </button>
        </div>

        {/* Stage chips — single select */}
        <div className="flex gap-1.5 flex-wrap">
          {STAGES.map(s => {
            const count = customers.filter(c => c.status === s.value).length
            const active = activeStage === s.value
            return (
              <button key={s.value} onClick={() => setActiveStage(s.value)}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold transition-all"
                style={{
                  background: active ? s.chip : 'var(--hover-bg)',
                  color: active ? s.text : 'var(--text-3)',
                  border: `1px solid ${active ? s.border : 'var(--divider)'}`,
                  opacity: active ? 1 : 0.6,
                }}>
                <span className="w-1.5 h-1.5 rounded-full" style={{ background: active ? s.dot : 'var(--text-3)' }} />
                {s.label}
                <span className="font-bold ml-0.5">{count}</span>
              </button>
            )
          })}
        </div>
      </div>

      {/* Cards grid */}
      <div className="flex-1 overflow-y-auto px-6 pb-6">
        {list.length === 0 ? (
          <div className="flex items-center justify-center h-32">
            <p className="text-sm" style={{ color: 'var(--text-3)' }}>ไม่มีข้อมูลในกลุ่ม "{stage.label}"</p>
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-3 pt-2">
            {list.map(c => (
              <CustomerCard key={c.id} c={c} stage={stage} onClick={() => setSelectedCustomer(c)} />
            ))}
          </div>
        )}
      </div>

      {/* Detail Drawer */}
      {selectedCustomer && (
        <CustomerDrawer
          customer={selectedCustomer}
          projects={projects}
          users={users}
          onClose={() => setSelectedCustomer(null)}
          onUpdate={updateCustomer}
          onStartJob={c => setStartJobCustomer(c)}
        />
      )}

      {startJobCustomer && (
        <StartJobModal
          customer={startJobCustomer}
          users={users}
          onClose={() => setStartJobCustomer(null)}
          onSaved={() => {
            setCustomers(prev => prev.map(c => c.id === startJobCustomer.id ? { ...c, status: 'closed' } : c))
            setStartJobCustomer(null)
            setSelectedCustomer(null)
          }}
        />
      )}

      {/* Add modal */}
      <Modal open={addModal} title="เพิ่ม Prospect" onClose={() => setAddModal(false)}>
        <CustomerForm projects={projects} users={users} onSave={addCustomer} onClose={() => setAddModal(false)} />
      </Modal>
    </div>
  )
}
