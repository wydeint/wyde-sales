'use client'

import React, { useEffect, useState, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import {
  Plus, X, Phone, Mail, MessageCircle, Building2, Home,
  Banknote, FileText, Pencil, Save, ChevronRight, Search, Copy, Check,
  CheckCircle2, Circle,
} from 'lucide-react'
import FileAttach from '@/components/ui/FileAttach'
import { PageSpinner } from '@/components/ui/StateUI'
import Modal from '@/components/ui/Modal'
import { Input, Select, TextArea } from '@/components/ui/Input'
import SearchableSelect from '@/components/ui/SearchableSelect'

const WORK_TYPES = ['N-RPT/Event', 'N-RPT/EQ', 'N-RPT', 'RPT', 'อื่นๆ']
const todayStr = () => {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

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
  quotation1_url: string | null; quotation2_url: string | null; id_card_url: string | null
  delivery_doc_url: string | null; satisfaction_url: string | null
}
interface DetailWarranty {
  id: string; warranty_start: string; warranty_end: string; warranty_months: number
  status: string; room: string
}

// ─── Stage config ───────────────────────────────────────────
const STAGES = [
  { value: 'new',           label: 'ใหม่',         bg: 'rgba(59,130,246,0.08)',  border: '#3b82f680', text: '#60a5fa',  dot: '#60a5fa',  badge: 'rgba(59,130,246,0.15)',  chip: 'rgba(59,130,246,0.45)' },
  { value: 'interested',    label: 'สนใจ',          bg: 'rgba(6,182,212,0.08)',   border: '#06b6d480', text: '#22d3ee',  dot: '#22d3ee',  badge: 'rgba(6,182,212,0.15)',   chip: 'rgba(6,182,212,0.45)'  },
  { value: 'quoted',        label: 'เสนอราคาแล้ว',  bg: 'rgba(234,179,8,0.08)',   border: '#eab30880', text: '#fbbf24',  dot: '#fbbf24',  badge: 'rgba(234,179,8,0.15)',   chip: 'rgba(234,179,8,0.45)'  },
  { value: 'booked',        label: 'จอง',           bg: 'rgba(249,115,22,0.08)',  border: '#f9731680', text: '#fb923c',  dot: '#fb923c',  badge: 'rgba(249,115,22,0.15)',  chip: 'rgba(249,115,22,0.45)' },
  { value: 'close_pending', label: 'รอปิด',         bg: 'rgba(168,85,247,0.08)',  border: '#a855f780', text: '#c084fc',  dot: '#c084fc',  badge: 'rgba(168,85,247,0.15)',  chip: 'rgba(168,85,247,0.45)' },
  { value: 'closed',        label: 'ปิดแล้ว',       bg: 'rgba(34,197,94,0.08)',   border: '#22c55e80', text: '#4ade80',  dot: '#4ade80',  badge: 'rgba(34,197,94,0.15)',   chip: 'rgba(34,197,94,0.45)'  },
  { value: 'lost',          label: 'หลุด',          bg: 'rgba(239,68,68,0.08)',   border: '#ef444480', text: '#f87171',  dot: '#f87171',  badge: 'rgba(239,68,68,0.15)',   chip: 'rgba(239,68,68,0.45)'  },
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
  project_id: '', interested_room: '', budget: 0, status: 'booked', assigned_to: '', notes: '',
}

const f = (n: number) => n ? '฿' + n.toLocaleString('th-TH') : '—'
const fdate = (d: string | null) => d ? new Date(d).toLocaleDateString('th-TH', { day: '2-digit', month: 'short', year: '2-digit' }) : '—'

// ─── Skeleton card ──────────────────────────────────────────
function CardSkeleton() {
  return (
    <div className="ds-card p-3 animate-pulse">
      <div className="flex items-center gap-3">
        <div className="w-9 h-9 rounded-full flex-shrink-0" style={{ background: 'var(--hover-bg)' }} />
        <div className="flex-1 min-w-0">
          <div className="h-3 rounded-md mb-2" style={{ background: 'var(--hover-bg)', width: '55%' }} />
          <div className="h-2.5 rounded-md" style={{ background: 'var(--hover-bg)', width: '38%' }} />
        </div>
        <div className="w-4 h-4 rounded flex-shrink-0" style={{ background: 'var(--hover-bg)' }} />
      </div>
    </div>
  )
}

// ─── CustomerCard ───────────────────────────────────────────
function CustomerCard({ c, stage, onClick }: { c: Customer; stage: typeof STAGES[0]; onClick: () => void }) {
  return (
    <button onClick={onClick} className="ds-card w-full text-left p-3 transition-all hover:scale-[1.01] active:scale-[0.99]">
      <div className="flex items-start justify-between gap-1 mb-1">
        <p className="font-semibold text-sm leading-snug flex-1 min-w-0 truncate" style={{ color: 'var(--text-1)' }}>{c.customer_name}</p>
        <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-[4px] flex-shrink-0"
          style={{ background: stage.badge, color: stage.text, border: `1px solid ${stage.border}` }}>
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
function CancelModal({ onClose, onConfirm }: {
  onClose: () => void
  onConfirm: (type: 'forfeit' | 'refund', amount: number, date: string, notes: string) => Promise<void>
}) {
  const [cancelType, setCancelType] = useState<'forfeit' | 'refund'>('forfeit')
  const [amount, setAmount] = useState('')
  const [date, setDate] = useState(todayStr())
  const [notes, setNotes] = useState('')
  const [saving, setSaving] = useState(false)

  async function confirm() {
    setSaving(true)
    await onConfirm(cancelType, Number(amount) || 0, date, notes)
    setSaving(false)
  }

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center p-4" onClick={onClose}>
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
      <div className="relative rounded-[16px] p-5 w-full max-w-sm space-y-4" style={{ background: 'var(--card-bg)', border: '1px solid var(--divider)' }}
        onClick={e => e.stopPropagation()}>
        <p className="font-bold text-sm" style={{ color: 'var(--text-1)' }}>ยกเลิกสัญญา</p>

        <div className="flex gap-2">
          {([['forfeit', 'ยึดเงินจอง'], ['refund', 'คืนเงิน']] as const).map(([val, label]) => (
            <button key={val} onClick={() => setCancelType(val)}
              className="flex-1 py-2 rounded-[8px] text-sm font-semibold transition-all"
              style={cancelType === val
                ? { background: val === 'forfeit' ? '#f87171' : '#60a5fa', color: '#fff' }
                : { background: 'var(--hover-bg)', color: 'var(--text-2)', border: '1px solid var(--divider)' }}>
              {label}
            </button>
          ))}
        </div>

        <div className="space-y-2">
          <div>
            <label className="text-xs mb-1 block" style={{ color: 'var(--text-2)' }}>
              {cancelType === 'forfeit' ? 'ยอดที่ยึด (บาท)' : 'ยอดคืน (บาท)'}
            </label>
            <input type="number" value={amount} onChange={e => setAmount(e.target.value)} placeholder="0"
              className="w-full px-3 py-2 rounded-[8px] text-sm focus:outline-none"
              style={{ background: 'var(--input-bg)', border: '1px solid var(--divider)', color: 'var(--text-1)' }} />
          </div>
          <div>
            <label className="text-xs mb-1 block" style={{ color: 'var(--text-2)' }}>
              {cancelType === 'forfeit' ? 'วันที่ยึดเงิน' : 'วันที่คืนเงิน'}
            </label>
            <input type="date" value={date} onChange={e => setDate(e.target.value)}
              className="w-full px-3 py-2 rounded-[8px] text-sm focus:outline-none"
              style={{ background: 'var(--input-bg)', border: '1px solid var(--divider)', color: 'var(--text-1)' }} />
          </div>
        </div>

        <div>
          <p className="text-xs mb-1" style={{ color: 'var(--text-2)' }}>หมายเหตุ</p>
          <textarea value={notes} onChange={e => setNotes(e.target.value)} rows={2} placeholder="เหตุผลยกเลิก..."
            className="w-full px-3 py-2 rounded-[8px] text-sm focus:outline-none resize-none"
            style={{ background: 'var(--input-bg)', border: '1px solid var(--divider)', color: 'var(--text-1)' }} />
        </div>

        <div className="flex gap-2">
          <button onClick={onClose} className="flex-1 py-2 rounded-[8px] text-sm" style={{ border: '1px solid var(--divider)', color: 'var(--text-2)' }}>
            ยกเลิก
          </button>
          <button onClick={confirm} disabled={saving}
            className="flex-1 py-2 rounded-[8px] text-sm font-semibold text-white disabled:opacity-50"
            style={{ background: cancelType === 'forfeit' ? '#f87171' : '#60a5fa' }}>
            {saving ? 'กำลังบันทึก...' : 'ยืนยันยกเลิก'}
          </button>
        </div>
      </div>
    </div>
  )
}

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
  const [showCancel, setShowCancel] = useState(false)
  const [showCancelSection, setShowCancelSection] = useState(false)
  const [cancelConfirmed, setCancelConfirmed] = useState(false)

  useEffect(() => {
    let cancelled = false
    async function load() {
      setLoadingDetail(true)
      // Query jobs by customer_id (UUID — legacy) OR by project+room (new flow from เริ่มงาน)
      const expectedCustomerId = customer.project_id && customer.interested_room
        ? `${customer.project_id}-${customer.interested_room}` : null
      const jobQuery = supabase.from('jobs')
        .select('id, po_no, so_no, work_type, package_type, order_date, revenue_inc_vat, working_status, quotation1_url, quotation2_url, id_card_url, delivery_doc_url, satisfaction_url')
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
        style={{ background: 'var(--card-bg)', border: '1px solid var(--card-border)' }}>

        {/* Header */}
        <div className="flex items-start gap-3 p-5" style={{ borderBottom: '1px solid var(--divider)' }}>
          <div className="flex-1 min-w-0">
            <p className="font-bold text-base leading-snug" style={{ color: 'var(--text-1)' }}>{customer.customer_name}</p>
            <span className="inline-flex items-center gap-1.5 mt-1 px-2 py-0.5 rounded-[4px] text-xs font-semibold"
              style={{ background: stage.badge, color: stage.text }}>
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
              <div className="space-y-2">
                <p className="text-[10px] font-semibold uppercase tracking-widest" style={{ color: 'var(--text-3)' }}>ย้ายสถานะ</p>

                {/* Stage pills — all except closed & lost */}
                <div className="flex flex-wrap gap-1.5">
                  {STAGES.filter(s => s.value !== customer.status && s.value !== 'closed' && s.value !== 'lost').map(s => (
                    <button key={s.value} onClick={async () => {
                      await supabase.from('customers').update({ status: s.value }).eq('id', customer.id)
                      onUpdate({ ...customer, status: s.value })
                    }}
                      className="px-2.5 py-1 rounded-[var(--radius-pill)] text-[11px] font-semibold transition-colors"
                      style={{ background: s.chip, color: '#fff', border: `1px solid ${s.border}` }}>
                      → {s.label}
                    </button>
                  ))}
                  {customer.status !== 'lost' && (
                    <button onClick={async () => {
                      await supabase.from('customers').update({ status: 'lost' }).eq('id', customer.id)
                      onUpdate({ ...customer, status: 'lost' })
                    }}
                      className="px-2.5 py-1 rounded-[var(--radius-pill)] text-[11px] font-semibold transition-colors"
                      style={{ background: 'color-mix(in srgb, var(--accent-red) 20%, transparent)', color: '#fff', border: '1px solid color-mix(in srgb, var(--accent-red) 50%, transparent)' }}>
                      → หลุด
                    </button>
                  )}
                </div>
              </div>

              {customer.notes && (
                <div className="p-3 rounded-[10px] text-xs" style={{ background: 'var(--hover-bg)', color: 'var(--text-2)' }}>{customer.notes}</div>
              )}
            </div>
          )}

          {/* Jobs — right below customer info */}
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
                    {j.working_status && (
                      <span className="inline-block mt-1 text-[10px] font-semibold px-1.5 py-0.5 rounded-[4px]"
                        style={{
                          background: j.working_status === 'ส่งมอบแล้ว' ? 'color-mix(in srgb, var(--accent-green) 15%, transparent)' : 'color-mix(in srgb, var(--accent-orange) 15%, transparent)',
                          color: j.working_status === 'ส่งมอบแล้ว' ? 'var(--accent-green)' : 'var(--accent-orange)',
                        }}>
                        {j.working_status}
                      </span>
                    )}
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

          {/* Booking details panel (งวดชำระเงิน) */}
          {customer.status === 'booked' && <BookingPanel customer={customer} onTriggerStart={() => onStartJob(customer)} />}

          {/* เอกสาร — linked to first job's doc fields */}
          {!loadingDetail && jobs.length > 0 && (() => {
            const j = jobs[0]
            const docCount = [j.quotation1_url, j.quotation2_url, j.id_card_url, j.delivery_doc_url, j.satisfaction_url].filter(Boolean).length
            return (
              <div className="rounded-[12px] overflow-hidden" style={{ border: '1px solid var(--divider)' }}>
                <div className="px-4 py-2.5" style={{ background: 'var(--hover-bg)' }}>
                  <span className="text-[10px] font-semibold uppercase tracking-widest" style={{ color: 'var(--text-3)' }}>
                    เอกสาร {docCount}/5
                  </span>
                </div>
                <div className="px-3 pb-2">
                  <DocProspectField jobId={j.id} field="quotation1_url" label="ใบเสนอราคา 1" value={j.quotation1_url}
                    onUpdate={v => setJobs(prev => prev.map(jj => jj.id === j.id ? { ...jj, quotation1_url: v } : jj))} />
                  <DocProspectField jobId={j.id} field="quotation2_url" label="ใบเสนอราคา 2" value={j.quotation2_url}
                    onUpdate={v => setJobs(prev => prev.map(jj => jj.id === j.id ? { ...jj, quotation2_url: v } : jj))} />
                  <DocProspectField jobId={j.id} field="id_card_url" label="บัตรประชาชนลูกค้า" value={j.id_card_url}
                    onUpdate={v => setJobs(prev => prev.map(jj => jj.id === j.id ? { ...jj, id_card_url: v } : jj))} />
                  <DocProspectField jobId={j.id} field="delivery_doc_url" label="ใบส่งมอบ" value={j.delivery_doc_url}
                    onUpdate={v => setJobs(prev => prev.map(jj => jj.id === j.id ? { ...jj, delivery_doc_url: v } : jj))} />
                  <DocProspectField jobId={j.id} field="satisfaction_url" label="แบบประเมินความพึงพอใจ" value={j.satisfaction_url}
                    onUpdate={v => setJobs(prev => prev.map(jj => jj.id === j.id ? { ...jj, satisfaction_url: v } : jj))} />
                </div>
              </div>
            )
          })()}

          {/* File Attachments */}
          <div className="rounded-[12px] p-3" style={{ border: '1px solid var(--divider)' }}>
            <FileAttach
              customerId={customer.id}
              projectName={(customer as any).projects?.name || customer.project_id || ''}
              roomNo={customer.interested_room || ''}
            />
          </div>

          {/* Cancel — hidden behind toggle */}
          {customer.status === 'booked' && (
            <div>
              <button
                onClick={() => { setShowCancelSection(s => !s); setCancelConfirmed(false) }}
                className="flex items-center gap-1 text-[11px] transition-colors"
                style={{ color: 'var(--text-3)' }}>
                <ChevronRight size={12} style={{ transform: showCancelSection ? 'rotate(90deg)' : 'none', transition: 'transform 0.2s' }} />
                สถานะพิเศษ / ลูกค้ายกเลิก
              </button>
              {showCancelSection && (
                <div className="mt-2 rounded-[10px] p-3 space-y-3"
                  style={{ background: 'color-mix(in srgb, #f87171 6%, transparent)', border: '1px solid color-mix(in srgb, #f87171 20%, transparent)' }}>
                  <label className="flex items-center gap-2 cursor-pointer select-none">
                    <input type="checkbox" checked={cancelConfirmed} onChange={e => setCancelConfirmed(e.target.checked)}
                      className="w-4 h-4 rounded" style={{ accentColor: '#f87171' }} />
                    <span className="text-xs" style={{ color: 'var(--text-2)' }}>ยืนยันว่าต้องการยกเลิกสัญญา</span>
                  </label>
                  <button onClick={() => setShowCancel(true)} disabled={!cancelConfirmed}
                    className="w-full py-2 rounded-[8px] text-xs font-semibold transition-all disabled:opacity-30"
                    style={{ background: 'color-mix(in srgb, #f87171 15%, transparent)', border: '1px solid color-mix(in srgb, #f87171 40%, transparent)', color: '#f87171' }}>
                    ยกเลิกสัญญา
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
        {editing && (
          <div className="p-4" style={{ borderTop: '1px solid var(--divider)' }}>
            <button onClick={save} disabled={saving}
              className="w-full py-3 rounded-[var(--radius-pill)] font-bold text-sm text-white"
              style={{ background: saving ? 'var(--text-3)' : 'var(--accent)' }}>
              {saving ? 'กำลังบันทึก...' : '💾 บันทึกข้อมูล'}
            </button>
          </div>
        )}
      </div>
      </div>

      {showCancel && (
        <CancelModal
          onClose={() => setShowCancel(false)}
          onConfirm={async (type, amount, date, notes) => {
            const { data: { session } } = await supabase.auth.getSession()
            await supabase.from('customers').update({
              status: 'cancelled',
              cancel_type: type,
              cancel_date: date || null,
              cancel_amount: amount || null,
              cancel_notes: notes || null,
            }).eq('id', customer.id)
            if (amount > 0) {
              await supabase.from('finance_entries').insert({
                type: type === 'forfeit' ? 'income' : 'expense',
                category: type === 'forfeit' ? 'ยึดเงินจอง' : 'คืนเงินยกเลิก',
                amount,
                entry_date: date,
                description: `${type === 'forfeit' ? 'ยึดเงินจอง' : 'คืนเงิน'}: ${customer.customer_name}${notes ? ' — ' + notes : ''}`,
                ref_id: customer.id,
                created_by: session?.user?.id || null,
              })
            }
            onUpdate({ ...customer, status: 'cancelled' })
            setShowCancel(false)
          }}
        />
      )}
    </>
  )
}

// ─── Start Job Modal ────────────────────────────────────────
type BookingData = {
  booking_value: number | null; customer_type: string | null; work_type: string | null; job_type: string | null
  pay1_amount: number | null; pay1_date: string | null; pay1_done: boolean | null
  pay2_amount: number | null; pay2_date: string | null; pay2_done: boolean | null
  pay3_amount: number | null; pay3_date: string | null; pay3_done: boolean | null
  pay4_amount: number | null; pay4_date: string | null; pay4_done: boolean | null
  pay5_amount: number | null; pay5_date: string | null; pay5_done: boolean | null
  pay6_amount: number | null; pay6_date: string | null; pay6_done: boolean | null
}

function StartJobModal({ customer, users, onClose, onSaved }: {
  customer: Customer; users: User[]
  onClose: () => void; onSaved: () => void
}) {
  const supabase = createClient()
  const [roomNo, setRoomNo] = useState(customer.interested_room || '')
  const [revenue, setRevenue] = useState(customer.budget || 0)
  const [workType, setWorkType] = useState('N-RPT/Event')
  const [custType, setCustType] = useState<'B2C' | 'B2B'>('B2C')
  const [pkgType, setPkgType] = useState('')
  const [orderDate, setOrderDate] = useState(todayStr())
  const [salesId, setSalesId] = useState(customer.assigned_to || '')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [booking, setBooking] = useState<BookingData | null>(null)

  const inputStyle = { background: 'var(--input-bg)', border: '1px solid var(--divider)', color: 'var(--text-1)' }
  const revenueEx = revenue ? Math.round(revenue / 1.07) : 0

  // Fetch booking data to pre-fill
  useEffect(() => {
    supabase.from('customers')
      .select('booking_value,customer_type,work_type,job_type,pay1_amount,pay1_date,pay1_done,pay1_slip,pay1_receipt,pay2_amount,pay2_date,pay2_done,pay2_slip,pay2_receipt,pay3_amount,pay3_date,pay3_done,pay3_slip,pay3_receipt,pay4_amount,pay4_date,pay4_done,pay4_slip,pay4_receipt,pay5_amount,pay5_date,pay5_done,pay5_slip,pay5_receipt,pay6_amount,pay6_date,pay6_done,pay6_slip,pay6_receipt')
      .eq('id', customer.id).single()
      .then(({ data }) => {
        if (!data) return
        const b = data as BookingData
        setBooking(b)
        if (b.booking_value) setRevenue(b.booking_value)
        if (b.work_type) setWorkType(b.work_type)
        if (b.customer_type === 'B2B') setCustType('B2B')
        if (b.job_type) setPkgType(b.job_type)
      })
  }, [customer.id])

  // Derive installments from booking pay1..pay6
  const bookingInstallments = React.useMemo(() => {
    if (!booking) return []
    const rows = []
    for (let i = 1; i <= 6; i++) {
      const amt = (booking as any)[`pay${i}_amount`]
      if (amt) rows.push({
        no: i,
        name: i === 1 ? 'มัดจำ' : `งวดที่ ${i}`,
        amount: amt,
        due_date: (booking as any)[`pay${i}_date`] || null,
        is_paid: !!((booking as any)[`pay${i}_done`]),
        slip: !!((booking as any)[`pay${i}_slip`]),
        receipt: !!((booking as any)[`pay${i}_receipt`]),
        is_final: i === rows.length + 1, // will be set after
      })
    }
    // mark last as final
    if (rows.length > 0) rows[rows.length - 1].is_final = true
    return rows
  }, [booking])

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
      customer_name: customer.customer_name, customer_type: custType, status: 'active',
    }, { onConflict: 'id', ignoreDuplicates: true })

    // Insert job
    const { error: jobErr } = await supabase.from('jobs').insert({
      id: jobId, customer_id: customerId,
      project_id: customer.project_id, room_no: roomNo.trim(),
      customer_name: customer.customer_name, customer_type: custType,
      work_type: workType, package_type: pkgType || null, order_date: orderDate,
      revenue_inc_vat: revenue, revenue_ex_vat: revenueEx,
      transfer_amount: revenue, working_status: 'รับงาน',
      accounting_status: (() => {
        const totalPaid = bookingInstallments.filter(i => i.is_paid).reduce((s, i) => s + (i.amount || 0), 0)
        return revenue > 0 && totalPaid / revenue >= 0.5 ? 'Backlog' : 'Reserved'
      })(), sales_id: salesId || null,
    })

    if (jobErr) { setError('เกิดข้อผิดพลาด: ' + jobErr.message); setSaving(false); return }

    // Migrate booking installments → payments table (deduplicate deposit)
    if (bookingInstallments.length > 0) {
      // Remove duplicate deposit: if row 1 and row 2 have same amount and both paid, keep only row 1
      const deduped = bookingInstallments.filter((inst, idx, arr) => {
        if (idx === 0) return true
        const prev = arr[idx - 1]
        return !(inst.amount === prev.amount && inst.is_paid && prev.is_paid)
      })
      const payments = deduped.map((inst, i) => ({
        job_id: jobId,
        installment_no: i + 1,
        installment_name: inst.name,
        amount: inst.amount,
        status: inst.is_paid ? 'paid' : 'pending',
        due_date: inst.due_date || null,
        paid_date: inst.is_paid ? (inst.due_date || orderDate) : null,
        paid_amount: inst.is_paid ? inst.amount : null,
        is_final: i === deduped.length - 1,
        slip_url: inst.is_paid && inst.slip ? 'posted' : null,
        receipt_url: inst.is_paid && inst.receipt ? 'posted' : null,
      }))
      await supabase.from('payments').insert(payments)
    }

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
          {/* Booking data banner */}
          {booking && booking.booking_value && (
            <div className="rounded-[10px] px-3 py-2.5 flex flex-col gap-1"
              style={{ background: 'color-mix(in srgb, var(--accent-green) 10%, transparent)', border: '1px solid color-mix(in srgb, var(--accent-green) 25%, transparent)' }}>
              <p className="text-[11px] font-semibold" style={{ color: 'var(--accent-green)' }}>พบข้อมูล Booking</p>
              <p className="text-[11px]" style={{ color: 'var(--text-2)' }}>
                ฿{booking.booking_value.toLocaleString()} · {booking.customer_type || '—'} · {booking.job_type || '—'}
                {bookingInstallments.length > 0 && ` · ${bookingInstallments.length} งวด`}
              </p>
              {bookingInstallments.length > 0 && (
                <div className="flex flex-wrap gap-1 mt-0.5">
                  {bookingInstallments.map(inst => (
                    <span key={inst.no} className="text-[10px] px-1.5 py-0.5 rounded-full"
                      style={{ background: inst.is_paid ? 'color-mix(in srgb, var(--accent-green) 20%, transparent)' : 'var(--hover-bg)', color: inst.is_paid ? 'var(--accent-green)' : 'var(--text-3)' }}>
                      {inst.name} ฿{inst.amount.toLocaleString()}{inst.is_paid ? ' ✓' : ''}
                    </span>
                  ))}
                </div>
              )}
            </div>
          )}
          <div>
            <label className="text-xs mb-1 block" style={{ color: 'var(--text-2)' }}>เลขห้อง *</label>
            <input value={roomNo} onChange={e => setRoomNo(e.target.value)} autoFocus
              className="w-full px-3 py-2 rounded-[8px] text-sm focus:outline-none"
              style={inputStyle} placeholder="เช่น A-101" />
          </div>
          <div>
            <label className="text-xs mb-1 block" style={{ color: 'var(--text-2)' }}>มูลค่างาน (inc. VAT)</label>
            <input type="number" value={revenue || ''} onChange={e => setRevenue(Number(e.target.value))}
              className="w-full px-3 py-2 rounded-[8px] text-sm focus:outline-none" style={inputStyle} />
            {revenue > 0 && <p className="text-[11px] mt-1" style={{ color: 'var(--text-3)' }}>ex. VAT ≈ ฿{revenueEx.toLocaleString()}</p>}
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-xs mb-1 block" style={{ color: 'var(--text-2)' }}>ประเภทลูกค้า</label>
              <select value={custType} onChange={e => setCustType(e.target.value as 'B2C' | 'B2B')}
                className="field-input">
                <option value="B2C">B2C</option>
                <option value="B2B">B2B</option>
              </select>
            </div>
            <div>
              <label className="text-xs mb-1 block" style={{ color: 'var(--text-2)' }}>แพ็กเกจ</label>
              <input value={pkgType} onChange={e => setPkgType(e.target.value)}
                className="w-full px-3 py-2 rounded-[8px] text-sm focus:outline-none"
                style={inputStyle} placeholder="เช่น Standard" />
            </div>
          </div>
          <div>
            <label className="text-xs mb-1 block" style={{ color: 'var(--text-2)' }}>ประเภทงาน</label>
            <select value={workType} onChange={e => setWorkType(e.target.value)}
              className="field-input">
              {WORK_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
            </select>
          </div>
          <div>
            <label className="text-xs mb-1 block" style={{ color: 'var(--text-2)' }}>วันที่รับงาน</label>
            <input type="date" value={orderDate} onChange={e => setOrderDate(e.target.value)}
              className="w-full px-3 py-2 rounded-[8px] text-sm focus:outline-none" style={inputStyle} />
          </div>
          <div>
            <label className="text-xs mb-1 block" style={{ color: 'var(--text-2)' }}>Sales</label>
            <select value={salesId} onChange={e => setSalesId(e.target.value)}
              className="field-input">
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

// ─── BookingPanel ───────────────────────────────────────────
type InstRow = { name: string; amount_inc: number; due_date: string; done: boolean; slip: boolean; receipt: boolean; channel: string }

const B2C_PLANS = {
  A: { label: 'แบบ A — 100% ครั้งเดียว',     slots: ['ชำระเต็มจำนวน'] },
  B: { label: 'แบบ B — 50% + 50%',           slots: ['มัดจำ', 'งวด Final'] },
  C: { label: 'แบบ C — มัดจำ + 50% + 50%',  slots: ['มัดจำ', 'งวดที่ 2', 'งวด Final'] },
} as const

const CHANNEL_OPTS = ['โอนเข้าบัญชีบริษัท', 'บัตรเครดิต', 'เงินสด', 'QR Code']

function fLineDate(d: string | null) {
  const dt = d ? new Date(d) : new Date()
  const dd = String(dt.getDate()).padStart(2, '0')
  const mm = String(dt.getMonth() + 1).padStart(2, '0')
  const yy = String(dt.getFullYear()).slice(2)
  return `${dd}/${mm}/${yy}`
}

function BookingAttachBtn({ label, active, saving, onClick, activeColor }: { label: string; active: boolean; saving: boolean; onClick: () => void; activeColor: string }) {
  return (
    <button onClick={onClick} disabled={saving}
      className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-[6px] text-xs font-semibold transition-all active:scale-95"
      style={{
        background: active ? `color-mix(in srgb, ${activeColor} 12%, transparent)` : 'var(--hover-bg)',
        border: `1px solid ${active ? `color-mix(in srgb, ${activeColor} 30%, transparent)` : 'var(--divider)'}`,
        color: active ? activeColor : 'var(--text-3)',
        opacity: saving ? 0.5 : 1,
      }}>
      {active ? <Check size={10} /> : <Copy size={10} style={{ opacity: 0.5 }} />} {label}
    </button>
  )
}

function BookingCopyBtn({ lineMsg }: { lineMsg: string }) {
  const [copied, setCopied] = useState(false)
  function copy() {
    navigator.clipboard.writeText(lineMsg).then(() => { setCopied(true); setTimeout(() => setCopied(false), 2000) })
  }
  return (
    <button onClick={copy}
      className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-[6px] text-xs font-semibold transition-all active:scale-95"
      style={{
        background: copied ? 'rgba(74,222,128,0.15)' : 'rgba(0,185,107,0.08)',
        border: `1px solid ${copied ? 'rgba(74,222,128,0.4)' : 'rgba(0,185,107,0.25)'}`,
        color: copied ? '#4ade80' : '#00b96b',
      }}>
      {copied ? <Check size={10} /> : '💬'} {copied ? 'คัดลอก!' : 'LINE'}
    </button>
  )
}

function DocProspectField({ jobId, field, label, value, onUpdate }: {
  jobId: string; field: string; label: string; value: string | null
  onUpdate: (val: string | null) => void
}) {
  const supabase = createClient()
  const [checked, setChecked] = useState(!!value)
  const [saving, setSaving] = useState(false)
  async function toggle() {
    setSaving(true)
    const newVal = checked ? null : 'posted'
    await supabase.from('jobs').update({ [field]: newVal }).eq('id', jobId)
    setChecked(!checked)
    onUpdate(newVal)
    setSaving(false)
  }
  return (
    <button onClick={toggle} disabled={saving}
      className="flex items-center gap-2 w-full text-left py-1.5"
      style={{ opacity: saving ? 0.5 : 1 }}>
      <div className="w-4 h-4 rounded-[4px] flex items-center justify-center flex-shrink-0"
        style={{
          background: checked ? 'color-mix(in srgb, var(--accent) 15%, transparent)' : 'var(--hover-bg)',
          border: `1px solid ${checked ? 'var(--accent)' : 'var(--divider)'}`,
        }}>
        {checked && <Check size={10} style={{ color: 'var(--accent)' }} />}
      </div>
      <span className="text-xs" style={{ color: 'var(--text-2)' }}>{label}</span>
    </button>
  )
}

function BookingPanel({ customer, onTriggerStart }: { customer: Customer; onTriggerStart?: () => void }) {
  const customerId = customer.id
  const supabase = createClient()
  const [loading, setLoading]   = useState(true)
  const [saving, setSaving]     = useState(false)
  const [saveOk, setSaveOk]     = useState(false)
  const [err, setErr]           = useState('')
  const [revenueInc, setRevenueInc] = useState(0)
  const [depositInc, setDepositInc] = useState(0)
  const [depositDate, setDepositDate] = useState(todayStr())
  const [custType, setCustType] = useState<'B2C' | 'B2B'>('B2C')
  const [workType, setWorkType] = useState('')
  const [pkgType, setPkgType]   = useState('')
  const [plan, setPlan]         = useState<'A' | 'B' | 'C' | 'custom'>('A')
  const [rows, setRows]         = useState<InstRow[]>([])
  const [savingAttach, setSavingAttach] = useState<string | null>(null)

  const revenueEx = revenueInc ? Math.round(revenueInc / 1.07) : 0
  const instyle: React.CSSProperties = { background: 'var(--input-bg)', border: '1px solid var(--divider)', color: 'var(--text-1)' }

  useEffect(() => {
    async function load() {
      const { data } = await supabase.from('customers')
        .select('booking_value,deposit_cash,deposit_date,customer_type,work_type,job_type,pay1_amount,pay1_date,pay1_done,pay1_slip,pay1_receipt,pay1_channel,pay2_amount,pay2_date,pay2_done,pay2_slip,pay2_receipt,pay2_channel,pay3_amount,pay3_date,pay3_done,pay3_slip,pay3_receipt,pay3_channel,pay4_amount,pay4_date,pay4_done,pay4_slip,pay4_receipt,pay4_channel,pay5_amount,pay5_date,pay5_done,pay5_slip,pay5_receipt,pay5_channel,pay6_amount,pay6_date,pay6_done,pay6_slip,pay6_receipt,pay6_channel')
        .eq('id', customerId).single()
      if (data) {
        const d = data as any
        setRevenueInc(d.booking_value || 0)
        setCustType((d.customer_type as 'B2C' | 'B2B') || 'B2C')
        setWorkType(d.work_type || '')
        setPkgType(d.job_type || '')

        // Load installment rows from pay1..pay6 on the customer record
        const loaded: InstRow[] = []
        for (let i = 1; i <= 6; i++) {
          const amt = d[`pay${i}_amount`]
          if (amt) loaded.push({
            name: i === 1 ? 'มัดจำ' : `งวดที่ ${i}`,
            amount_inc: amt,
            due_date: d[`pay${i}_date`] || todayStr(),
            done: !!d[`pay${i}_done`],
            slip: !!d[`pay${i}_slip`],
            receipt: !!d[`pay${i}_receipt`],
            channel: d[`pay${i}_channel`] || '',
          })
        }

        // Primary deposit source: deposit_cash / deposit_date on customers record
        let depAmt = d.deposit_cash || 0
        let depDt  = d.deposit_date || todayStr()

        // Fallback: pay1_amount on customers record
        if (!depAmt && d.pay1_amount) { depAmt = d.pay1_amount; depDt = d.pay1_date || todayStr() }

        // Fallback: first installment from payments table via linked job
        if (!depAmt) {
          const expectedCid = customer.project_id && customer.interested_room
            ? `${customer.project_id}-${customer.interested_room}` : null
          if (expectedCid) {
            const { data: jobs } = await supabase.from('jobs').select('id')
              .or(`customer_id.eq.${customerId},customer_id.eq.${expectedCid}`)
              .limit(5)
            const jobIds = (jobs || []).map((j: any) => j.id)
            if (jobIds.length) {
              const { data: pmts } = await supabase.from('payments').select('amount, due_date, paid_date, status, slip_url, receipt_url')
                .in('job_id', jobIds).order('installment_no').limit(1)
              if (pmts && pmts[0]) {
                depAmt = pmts[0].amount || 0
                depDt  = pmts[0].paid_date || pmts[0].due_date || todayStr()
                if (!loaded.length) {
                  loaded.push({ name: 'มัดจำ', amount_inc: depAmt, due_date: depDt, done: pmts[0].status === 'paid', slip: !!pmts[0].slip_url, receipt: !!pmts[0].receipt_url, channel: '' })
                }
              }
            }
          }
        }

        setDepositInc(depAmt)
        setDepositDate(depDt)
        if (loaded.length) { setRows(loaded); setPlan('custom') }
      }
      setLoading(false)
    }
    load()
  }, [customerId])

  function applyPlan(p: 'A' | 'B' | 'C') {
    setPlan(p)
    setRows(B2C_PLANS[p].slots.map((name, i) => ({
      name,
      amount_inc: i === 0 ? depositInc : 0,
      due_date: i === 0 && depositDate ? depositDate : todayStr(),
      done: i === 0 && depositInc > 0,
      slip: false,
      receipt: false,
      channel: '',
    })))
  }

  function updRow(i: number, patch: Partial<InstRow>) {
    setRows(prev => prev.map((r, j) => j === i ? { ...r, ...patch } : r))
  }

  async function toggleAttachment(i: number, field: 'slip' | 'receipt') {
    const key = `${i}-${field}`
    setSavingAttach(key)
    const newVal = !rows[i][field]
    updRow(i, { [field]: newVal })
    await supabase.from('customers').update({ [`pay${i + 1}_${field}`]: newVal }).eq('id', customerId)
    setSavingAttach(null)
  }

  async function save() {
    setSaving(true); setErr(''); setSaveOk(false)
    const payload: Record<string, unknown> = {
      booking_value: revenueInc || null, deposit_cash: depositInc || null,
      deposit_date: depositDate || null, deposit_done: depositInc > 0,
      customer_type: custType, work_type: workType || null, job_type: pkgType || null,
    }
    for (let i = 1; i <= 6; i++) {
      const r = rows[i - 1]
      payload[`pay${i}_amount`]  = r?.amount_inc || null
      payload[`pay${i}_date`]    = r?.due_date || null
      payload[`pay${i}_done`]    = r?.done || false
      payload[`pay${i}_slip`]    = r?.slip || false
      payload[`pay${i}_receipt`] = r?.receipt || false
      payload[`pay${i}_channel`] = r?.channel || null
    }
    const { error: e } = await supabase.from('customers').update(payload).eq('id', customerId)
    if (e) { setErr(e.message); setSaving(false); return }

    // Auto-trigger start job if total paid ≥ 50% of booking value
    const totalPaid = rows.filter(r => r.done).reduce((s, r) => s + (r.amount_inc || 0), 0)
    const threshold = revenueInc ? revenueInc * 0.5 : 0
    if (totalPaid >= threshold && threshold > 0 && onTriggerStart) {
      onTriggerStart()
    } else {
      setSaveOk(true)
    }
    setSaving(false)
  }

  if (loading) return <div className="text-xs py-2" style={{ color: 'var(--text-3)' }}>กำลังโหลด...</div>

  const totalInst = rows.reduce((s, r) => s + (r.amount_inc || 0), 0)

  return (
    <div className="space-y-3">

      {/* ── Section 1: ข้อมูลการจอง ── */}
      <div className="rounded-[12px] overflow-hidden" style={{ border: '1px solid var(--divider)' }}>
        <div className="px-4 py-2.5" style={{ background: 'var(--hover-bg)', borderBottom: '1px solid var(--divider)' }}>
          <span className="text-[10px] font-semibold uppercase tracking-widest" style={{ color: 'var(--text-3)' }}>ข้อมูลการจอง</span>
        </div>
        <div className="p-4 space-y-3">
          {/* Revenue */}
          <div>
            <label className="text-[10px] mb-1 block" style={{ color: 'var(--text-3)' }}>มูลค่างาน (inc. VAT)</label>
            <input type="number" value={revenueInc || ''} onChange={e => setRevenueInc(Number(e.target.value))}
              className="w-full px-3 py-2 rounded-[8px] text-sm focus:outline-none" style={instyle} placeholder="0" />
            {revenueEx > 0 && <p className="text-[10px] mt-1" style={{ color: 'var(--text-3)' }}>ก่อน VAT (7%): {f(revenueEx)}</p>}
          </div>

          {/* Deposit */}
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-[10px] mb-1 block" style={{ color: 'var(--text-3)' }}>ยอดมัดจำ (inc. VAT)</label>
              <input type="number" value={depositInc || ''} onChange={e => setDepositInc(Number(e.target.value))}
                className="w-full px-3 py-2 rounded-[8px] text-sm focus:outline-none" style={instyle} placeholder="0" />
            </div>
            <div>
              <label className="text-[10px] mb-1 block" style={{ color: 'var(--text-3)' }}>วันที่รับ</label>
              <input type="date" value={depositDate} onChange={e => setDepositDate(e.target.value)}
                className="w-full px-3 py-2 rounded-[8px] text-sm focus:outline-none" style={instyle} />
            </div>
          </div>

          {/* Customer type */}
          <div className="flex gap-1.5">
            {(['B2C', 'B2B'] as const).map(t => (
              <button key={t} onClick={() => setCustType(t)}
                className="flex-1 py-1.5 rounded-[8px] text-xs font-semibold transition-all"
                style={custType === t
                  ? { background: 'var(--accent)', color: '#fff' }
                  : { background: 'var(--hover-bg)', color: 'var(--text-2)', border: '1px solid var(--divider)' }}>
                {t}
              </button>
            ))}
          </div>

          {/* Work type + Package */}
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-[10px] mb-1 block" style={{ color: 'var(--text-3)' }}>ประเภทงาน</label>
              <select value={workType} onChange={e => setWorkType(e.target.value)}
                className="field-input">
                <option value="">— เลือก —</option>
                {WORK_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
              </select>
            </div>
            <div>
              <label className="text-[10px] mb-1 block" style={{ color: 'var(--text-3)' }}>Package</label>
              <input value={pkgType} onChange={e => setPkgType(e.target.value)}
                className="w-full px-3 py-2 rounded-[8px] text-sm focus:outline-none" style={instyle} placeholder="เช่น Silver" />
            </div>
          </div>
        </div>
      </div>

      {/* ── Section 2: งวดชำระเงิน ── */}
      <div className="rounded-[12px] overflow-hidden" style={{ border: '1px solid var(--divider)' }}>
        <div className="flex items-center px-4 py-2.5" style={{ background: 'var(--hover-bg)', borderBottom: '1px solid var(--divider)' }}>
          <span className="text-[10px] font-semibold uppercase tracking-widest" style={{ color: 'var(--text-3)' }}>งวดชำระเงิน</span>
        </div>

        {/* Plan selector (B2C only) */}
        {custType === 'B2C' && (
          <div className="flex gap-1.5 flex-wrap px-4 py-2.5" style={{ borderBottom: '1px solid var(--divider)' }}>
            {(['A', 'B', 'C'] as const).map(p => (
              <button key={p} onClick={() => applyPlan(p)}
                className="px-2.5 py-1 rounded-[8px] text-[11px] font-semibold transition-all"
                style={plan === p
                  ? { background: 'var(--accent)', color: '#fff' }
                  : { background: 'var(--hover-bg)', color: 'var(--text-2)', border: '1px solid var(--divider)' }}>
                {B2C_PLANS[p].label}
              </button>
            ))}
            <button onClick={() => { setPlan('custom'); if (!rows.length) setRows([{ name: 'งวดที่ 1', amount_inc: 0, due_date: todayStr(), done: false, slip: false, receipt: false, channel: '' }]) }}
              className="px-2.5 py-1 rounded-[6px] text-[11px] font-semibold transition-all"
              style={plan === 'custom'
                ? { background: 'var(--accent)', color: '#fff' }
                : { background: 'var(--hover-bg)', color: 'var(--text-2)', border: '1px solid var(--divider)' }}>
              Custom
            </button>
          </div>
        )}

        <div className="divide-y" style={{ borderColor: 'var(--divider)' }}>
          {rows.map((r, i) => {
            const projectName = (customer as any).projects?.name || ''
            const salesName   = (customer as any).users?.name || ''
            const lineMsg = [
              `Wyde Int. (${i === 0 ? 'ลูกค้าใหม่' : 'ลูกค้าเก่า'})`,
              `วันที่ : ${fLineDate(r.due_date)}`,
              `โครงการ : ${projectName}`,
              `ห้อง : ${customer.interested_room || ''}`,
              `ลูกค้าชื่อ : ${customer.customer_name}`,
              `Sales Wyde : ${salesName}`,
              `Package : ${revenueInc.toLocaleString('th-TH')} บาท`,
              ...(i > 0 && rows[0].amount_inc > 0 ? [`หัก${rows[0].name} : ${rows[0].amount_inc.toLocaleString('th-TH')} บาท`] : []),
              `${r.name} : ${r.amount_inc.toLocaleString('th-TH')} บาท`,
              ...(r.channel ? [`ชำระผ่านทาง : ${r.channel}`] : []),
            ].join('\n')

            if (r.done) {
              return (
                <div key={i} className="px-4 py-2.5">
                  <div className="flex items-center gap-3">
                    <div className="flex-shrink-0">
                      <CheckCircle2 size={14} style={{ color: 'var(--accent-green)' }} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <span className="text-xs" style={{ color: 'var(--text-1)' }}>{r.name}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-semibold" style={{ color: 'var(--accent-green)' }}>{f(r.amount_inc)}</span>
                      <span className="text-[10px]" style={{ color: 'var(--text-3)' }}>{fLineDate(r.due_date)}</span>
                      <button onClick={() => updRow(i, { done: false })}
                        className="w-5 h-5 rounded flex items-center justify-center flex-shrink-0"
                        style={{ color: 'var(--text-3)', border: '1px solid var(--divider)' }}>
                        <X size={9} />
                      </button>
                    </div>
                  </div>
                  <div className="flex gap-1.5 mt-2 ml-7 flex-wrap">
                    <select value={r.channel} onChange={e => updRow(i, { channel: e.target.value })}
                      className="text-[10px] px-2 py-1 rounded-[6px] focus:outline-none appearance-none"
                      style={{ background: 'var(--input-bg)', border: '1px solid var(--divider)', color: 'var(--text-2)' }}>
                      <option value="">— ช่องทาง —</option>
                      {CHANNEL_OPTS.map(c => <option key={c} value={c}>{c}</option>)}
                    </select>
                    <BookingAttachBtn
                      label="Slip" active={r.slip} saving={savingAttach === `${i}-slip`}
                      onClick={() => toggleAttachment(i, 'slip')}
                      activeColor="#60a5fa" />
                    <BookingAttachBtn
                      label="ใบเสร็จ" active={r.receipt} saving={savingAttach === `${i}-receipt`}
                      onClick={() => toggleAttachment(i, 'receipt')}
                      activeColor="#4ade80" />
                    <BookingCopyBtn lineMsg={lineMsg} />
                  </div>
                </div>
              )
            }

            return (
              <div key={i} className="px-4 py-2">
                <div className="flex items-center gap-3">
                  <div className="flex-shrink-0">
                    <Circle size={14} style={{ color: 'var(--text-3)' }} />
                  </div>
                  <input value={r.name} onChange={e => updRow(i, { name: e.target.value })}
                    className="flex-1 min-w-0 px-2 py-1 rounded-[6px] text-xs focus:outline-none" style={instyle} />
                  <input type="number" value={r.amount_inc || ''} onChange={e => updRow(i, { amount_inc: Number(e.target.value) })}
                    className="w-20 px-2 py-1 rounded-[6px] text-xs focus:outline-none text-right" style={instyle} placeholder="ยอด" />
                  <input type="date" value={r.due_date} onChange={e => updRow(i, { due_date: e.target.value })}
                    className="w-28 px-2 py-1 rounded-[6px] text-xs focus:outline-none" style={instyle} />
                  <button onClick={() => updRow(i, { done: true })}
                    className="flex-shrink-0 w-6 h-6 rounded-[6px] flex items-center justify-center"
                    style={{ background: 'color-mix(in srgb, var(--accent-green) 15%, transparent)', border: '1px solid color-mix(in srgb, var(--accent-green) 35%, transparent)', color: 'var(--accent-green)' }}>
                    <Check size={11} />
                  </button>
                  <button onClick={() => setRows(rows.filter((_, j) => j !== i))}
                    className="flex-shrink-0 w-5 h-5 flex items-center justify-center" style={{ color: 'var(--text-3)' }}>
                    <X size={10} />
                  </button>
                </div>
              </div>
            )
          })}
          {rows.length < 6 && (
            <div className="px-4 py-2">
              <button onClick={() => setRows([...rows, { name: `งวดที่ ${rows.length + 1}`, amount_inc: 0, due_date: todayStr(), done: false, slip: false, receipt: false, channel: '' }])}
                className="flex items-center gap-1.5 text-xs" style={{ color: 'var(--text-3)' }}
                onMouseEnter={e => (e.currentTarget.style.color = 'var(--accent)')}
                onMouseLeave={e => (e.currentTarget.style.color = 'var(--text-3)')}>
                <Plus size={11} /> เพิ่มงวด
              </button>
            </div>
          )}
        </div>

        {rows.length > 0 && revenueInc > 0 && (
          <div className="px-4 py-2" style={{ borderTop: '1px solid var(--divider)' }}>
            <p className="text-[10px]" style={{ color: totalInst === revenueInc ? 'var(--accent-green)' : 'var(--text-3)' }}>
              รวมงวด: {f(totalInst)} / {f(revenueInc)}{totalInst === revenueInc ? ' ✓' : ''}
            </p>
          </div>
        )}
      </div>

      {/* ── Save ── */}
      {err && <p className="text-xs" style={{ color: 'var(--accent-red)' }}>{err}</p>}
      {saveOk && <p className="text-xs" style={{ color: 'var(--accent-green)' }}>บันทึกแล้ว ✓</p>}

      {(() => {
        const totalPaid = rows.filter(r => r.done).reduce((s, r) => s + (r.amount_inc || 0), 0)
        const willStart = revenueInc > 0 && totalPaid >= revenueInc * 0.5
        return (
          <button onClick={save} disabled={saving}
            className="w-full py-2 rounded-[var(--radius-pill)] text-sm font-semibold text-white"
            style={{ background: saving ? 'var(--text-3)' : willStart ? 'var(--accent-green)' : 'var(--accent-orange)' }}>
            {saving ? 'กำลังบันทึก...' : willStart ? '⚡ บันทึกและเริ่มงานอัตโนมัติ' : 'บันทึกการจอง'}
          </button>
        )
      })()}

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
  const [activeStage, setActiveStage] = useState('booked')
  const [search, setSearch] = useState('')
  const [filterProject, setFilterProject] = useState('')
  const [filterSales, setFilterSales] = useState('')
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
      supabase.from('users').select('id, name').eq('active', true).eq('dept', 'Sales Executive').order('name'),
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

  if (loading) return (
    <div className="h-screen flex flex-col" style={{ background: 'var(--bg-gradient)' }}>
      <div className="flex-shrink-0 px-6 pt-5 pb-3">
        <div className="h-6 w-28 rounded-lg mb-1 animate-pulse" style={{ background: 'var(--hover-bg)' }} />
        <div className="h-3 w-16 rounded-lg animate-pulse" style={{ background: 'var(--hover-bg)' }} />
      </div>
      <div className="px-6 space-y-2 pt-4">
        {[1, 2, 3, 4, 5].map(i => <CardSkeleton key={i} />)}
      </div>
    </div>
  )

  const stage = STAGES.find(s => s.value === activeStage) || STAGES[0]
  const list = customers.filter(c => {
    if (c.status !== activeStage) return false
    if (filterProject && c.project_id !== filterProject) return false
    if (filterSales && c.assigned_to !== filterSales) return false
    if (search) {
      const q = search.toLowerCase().replace(/[-\s]/g, '')
      const room = (c.interested_room || '').toLowerCase().replace(/[-\s]/g, '')
      return room.includes(q) || c.customer_name.toLowerCase().includes(search.toLowerCase())
    }
    return true
  })

  return (
    <div className="h-screen flex flex-col" style={{ background: 'var(--bg-gradient)' }}>

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
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-[6px] text-xs font-semibold transition-all"
                style={{
                  background: active ? s.badge : 'var(--hover-bg)',
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

      {/* Filter bar */}
      <div className="flex-shrink-0 px-6 pb-3 flex items-center gap-2 flex-wrap">
        <div className="relative">
          <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: 'var(--text-3)' }} />
          <input value={search} onChange={e => setSearch(e.target.value)}
            placeholder="ค้นหาห้อง, ลูกค้า..."
            className="pl-8 pr-7 py-2 rounded-[10px] text-sm focus:outline-none w-44"
            style={{ background: 'var(--input-bg)', border: '1px solid var(--divider)', color: 'var(--text-1)' }} />
          {search && (
            <button className="absolute right-2 top-1/2 -translate-y-1/2" onClick={() => setSearch('')}>
              <X size={12} style={{ color: 'var(--text-3)' }} />
            </button>
          )}
        </div>
        <select value={filterProject} onChange={e => setFilterProject(e.target.value)}
          className="py-2 pl-3 pr-7 rounded-[10px] text-sm focus:outline-none appearance-none"
          style={{ background: 'var(--input-bg)', border: `1px solid ${filterProject ? 'var(--accent)' : 'var(--divider)'}`, color: filterProject ? 'var(--text-1)' : 'var(--text-3)' }}>
          <option value="">โครงการ</option>
          {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
        <select value={filterSales} onChange={e => setFilterSales(e.target.value)}
          className="py-2 pl-3 pr-7 rounded-[10px] text-sm focus:outline-none appearance-none"
          style={{ background: 'var(--input-bg)', border: `1px solid ${filterSales ? 'var(--accent)' : 'var(--divider)'}`, color: filterSales ? 'var(--text-1)' : 'var(--text-3)' }}>
          <option value="">Sales</option>
          {users.map(u => <option key={u.id} value={u.id}>{u.name}</option>)}
        </select>
        {(search || filterProject || filterSales) && (
          <button onClick={() => { setSearch(''); setFilterProject(''); setFilterSales('') }}
            className="text-xs px-2 py-1.5 rounded-[8px] transition-colors"
            style={{ color: 'var(--text-3)', background: 'var(--hover-bg)', border: '1px solid var(--divider)' }}>
            ล้าง
          </button>
        )}
        <span className="text-xs ml-auto" style={{ color: 'var(--text-3)' }}>{list.length} ราย</span>
      </div>

      {/* Summary strip */}
      {list.length > 0 && (() => {
        const totalBudget = list.reduce((s, c) => s + (c.budget || 0), 0)
        const noSales = list.filter(c => !c.assigned_to).length
        return (
          <div className="flex-shrink-0 px-6 pb-3 grid grid-cols-3 gap-2">
            <div className="ds-card-sm text-center">
              <p className="text-[10px] font-semibold uppercase tracking-wider mb-1" style={{ color: 'var(--text-3)' }}>ในกลุ่มนี้</p>
              <p className="text-lg font-bold" style={{ color: 'var(--text-1)' }}>{list.length}</p>
              <p className="text-[10px]" style={{ color: 'var(--text-3)' }}>ราย</p>
            </div>
            <div className="ds-card-sm text-center">
              <p className="text-[10px] font-semibold uppercase tracking-wider mb-1" style={{ color: 'var(--text-3)' }}>มูลค่ารวม</p>
              <p className="text-lg font-bold" style={{ color: 'var(--text-1)' }}>{totalBudget > 0 ? '฿' + (totalBudget / 1000000).toFixed(1) + 'M' : '—'}</p>
              <p className="text-[10px]" style={{ color: 'var(--text-3)' }}>บาท</p>
            </div>
            <div className="ds-card-sm text-center">
              <p className="text-[10px] font-semibold uppercase tracking-wider mb-1" style={{ color: 'var(--text-3)' }}>ยังไม่มี Sales</p>
              <p className="text-lg font-bold" style={{ color: noSales > 0 ? 'var(--accent-orange)' : 'var(--accent-green)' }}>{noSales}</p>
              <p className="text-[10px]" style={{ color: 'var(--text-3)' }}>ราย</p>
            </div>
          </div>
        )
      })()}

      {/* Cards list */}
      <div className="flex-1 overflow-y-auto px-6 pb-6">
        {list.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-3 py-20">
            <div className="w-12 h-12 rounded-full flex items-center justify-center" style={{ background: 'var(--hover-bg)' }}>
              <Search size={20} style={{ color: 'var(--text-3)' }} />
            </div>
            <p className="text-sm font-semibold" style={{ color: 'var(--text-2)' }}>ไม่พบ Prospect ใน {stage.label}</p>
            <p className="text-xs" style={{ color: 'var(--text-3)' }}>ลองเลือกกลุ่มอื่น หรือเพิ่ม Prospect ใหม่</p>
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
