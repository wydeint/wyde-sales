'use client'

import { useEffect, useState, useCallback, useMemo, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import {
  Search, X, ChevronRight, ChevronDown, Zap, Pencil,
  CheckCircle2, Circle, Wallet, Package, Wrench, ShoppingCart, AlertTriangle,
} from 'lucide-react'
import FileAttach from '@/components/ui/FileAttach'

// ─── Types ────────────────────────────────────────────────
type ClientType = 'B2C' | 'B2B'

interface RoomJob {
  id: string
  room_no: string
  project_id: string
  project_name: string
  customer_name: string
  sales_name: string
  actual_deliver_date: string | null
  has_plan: boolean
  has_overdue: boolean
  all_paid: boolean
  paid_count: number
  total_count: number
}

interface Installment {
  id: string
  installment_no: number
  installment_name: string
  amount: number
  paid_amount: number | null
  percentage: number
  status: 'pending' | 'paid' | 'overdue'
  due_date: string | null
  paid_date: string | null
  is_work_trigger: boolean
  is_final: boolean
  channel: string | null
  slip_url: string | null
  receipt_url: string | null
}

interface FullJob {
  id: string
  customer_id: string | null
  project_id: string
  project_name: string
  room_no: string
  customer_name: string
  customer_type: ClientType
  revenue_inc_vat: number
  revenue_ex_vat: number
  working_status: string
  actual_deliver_date: string | null
  sales_name: string
  payment_plan_type: string | null
  work_days: number | null
  contract_date: string | null
  work_start_date: string | null
  warranty_end: string | null
  installments: Installment[]
  // job-level docs
  quotation1_url: string | null
  quotation2_url: string | null
  id_card_url: string | null
  delivery_doc_url: string | null
  satisfaction_url: string | null
  sale_slip_url: string | null
  sale_receipt_url: string | null
}

// ─── Stage helpers ─────────────────────────────────────────
type ChipStage = 'wait' | 'collect' | 'ready' | 'overdue' | 'done'

function getChipStage(j: RoomJob): ChipStage {
  if (j.actual_deliver_date) return 'done'
  if (j.has_overdue) return 'overdue'
  if (!j.has_plan) return 'wait'
  if (j.all_paid) return 'ready'
  return 'collect'
}

const STAGE_META: Record<ChipStage, { label: string; bg: string; color: string; border: string; dot: string }> = {
  wait:    { label: 'รอเปิดงาน',     bg: 'color-mix(in srgb, var(--accent-purple) 12%, transparent)', color: 'var(--accent-purple)', border: 'color-mix(in srgb, var(--accent-purple) 30%, transparent)', dot: 'var(--accent-purple)' },
  collect: { label: 'กำลังเก็บเงิน', bg: 'color-mix(in srgb, var(--accent-orange) 12%, transparent)', color: 'var(--accent-orange)', border: 'color-mix(in srgb, var(--accent-orange) 30%, transparent)', dot: 'var(--accent-orange)' },
  ready:   { label: 'รอส่งมอบ',      bg: 'color-mix(in srgb, var(--accent-blue)   12%, transparent)', color: 'var(--accent-blue)',   border: 'color-mix(in srgb, var(--accent-blue)   30%, transparent)', dot: 'var(--accent-blue)' },
  overdue: { label: 'งวดเกินกำหนด',  bg: 'color-mix(in srgb, var(--accent-red)    12%, transparent)', color: 'var(--accent-red)',    border: 'color-mix(in srgb, var(--accent-red)    30%, transparent)', dot: 'var(--accent-red)' },
  done:    { label: 'ส่งมอบแล้ว',    bg: 'color-mix(in srgb, var(--accent-green)  12%, transparent)', color: 'var(--accent-green)',  border: 'color-mix(in srgb, var(--accent-green)  30%, transparent)', dot: 'var(--accent-green)' },
}

function getFullStageInfo(job: FullJob) {
  const hasPlan = job.installments.length > 0
  const finalPaid = job.installments.some(i => i.is_final && i.status === 'paid')
  const delivered = !!job.actual_deliver_date
  const paidCount = job.installments.filter(i => i.status === 'paid').length
  const totalCount = job.installments.length
  const pendingInstallments = job.installments
    .filter(i => i.status !== 'paid')
    .sort((a, b) => a.installment_no - b.installment_no)
  let activeStage = 1
  if (delivered) activeStage = 4
  else if (finalPaid) activeStage = 4
  else if (hasPlan) activeStage = 3
  else activeStage = 2
  return { hasPlan, finalPaid, delivered, paidCount, totalCount, pendingInstallments, activeStage }
}

// ─── Helpers ──────────────────────────────────────────────
const fmtBaht = (n: number) => n ? '฿' + Math.round(n).toLocaleString('th-TH') : '฿0'
const fmtDate = (d: string | null) => d
  ? new Date(d).toLocaleDateString('th-TH', { day: '2-digit', month: 'short', year: '2-digit' })
  : '—'
const todayStr = () => {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

// ─── Plan helpers ──────────────────────────────────────────
const B2C_PLANS = [
  { value: 'A', label: 'แบบ A — 100% ครั้งเดียว', desc: '1 งวด' },
  { value: 'B', label: 'แบบ B — 50% + 50%', desc: '2 งวด' },
  { value: 'C', label: 'แบบ C — มัดจำ + 50% + 50%', desc: '3 งวด' },
]
const WORK_DAYS_OPTIONS = [30, 45, 60, 90]

function calcB2CInstallments(plan: string, total: number, deposit: number) {
  if (plan === 'A') return [{ no: 1, name: 'ชำระเต็มจำนวน 100%', pct: 100, amount: total, trigger: true, final: true }]
  if (plan === 'B') return [
    { no: 1, name: 'ชำระ 50% แรก เริ่มงาน', pct: 50, amount: total * 0.5, trigger: true, final: false },
    { no: 2, name: 'ชำระ 50% สุดท้าย ส่งมอบ', pct: 50, amount: total * 0.5, trigger: false, final: true },
  ]
  if (plan === 'C') {
    const dep = deposit > 0 ? deposit : Math.round(total * 0.1)
    const rest = (total - dep) / 2
    return [
      { no: 1, name: 'มัดจำจองสิทธิ์', pct: Math.round((dep / total) * 100), amount: dep, trigger: false, final: false },
      { no: 2, name: 'ชำระ 50% แรก เริ่มงาน', pct: Math.round((rest / total) * 100), amount: rest, trigger: true, final: false },
      { no: 3, name: 'ชำระ 50% สุดท้าย ส่งมอบ', pct: Math.round((rest / total) * 100), amount: rest, trigger: false, final: true },
    ]
  }
  return []
}
function calcB2BInstallments(count: number, total: number, percentages: number[]) {
  return percentages.map((pct, i) => ({
    no: i + 1,
    name: i === 0 ? 'งวดที่ 1 เริ่มงาน' : i === count - 1 ? 'งวดสุดท้าย ส่งมอบ' : `งวดที่ ${i + 1}`,
    pct, amount: Math.round((pct / 100) * total),
    trigger: i === 0, final: i === count - 1,
  }))
}

// ─── Setup + First Payment Modal ──────────────────────────
function SetupAndPayModal({ job, onClose, onSaved }: { job: FullJob; onClose: () => void; onSaved: () => void }) {
  const supabase = createClient()
  const [clientType, setClientType] = useState<ClientType>(job.customer_type || 'B2C')
  const [plan, setPlan] = useState(job.payment_plan_type || 'B')
  const [workDays, setWorkDays] = useState(job.work_days || 45)
  const [depositAmount, setDepositAmount] = useState(0)
  const [firstPaidAmount, setFirstPaidAmount] = useState(0)
  const [b2bCount, setB2bCount] = useState(3)
  const [b2bPcts, setB2bPcts] = useState([30, 40, 30])
  const [paidDate, setPaidDate] = useState(todayStr())
  const [slipUrl, setSlipUrl] = useState('')
  const [slipPosted, setSlipPosted] = useState(false)
  const [receiptUrl, setReceiptUrl] = useState('')
  const [receiptPosted, setReceiptPosted] = useState(false)
  const [saving, setSaving] = useState(false)
  const [step, setStep] = useState<'plan' | 'pay'>('plan')

  const total = job.revenue_inc_vat || job.revenue_ex_vat || 0
  const pctSum = b2bPcts.slice(0, b2bCount).reduce((a, b) => a + b, 0)
  const pctValid = Math.abs(pctSum - 100) < 0.01

  function updateB2bCount(n: number) {
    setB2bCount(n)
    const even = Math.floor(100 / n)
    const last = 100 - even * (n - 1)
    setB2bPcts(Array(n).fill(even).map((v, i) => i === n - 1 ? last : v))
  }

  const preview = clientType === 'B2C'
    ? calcB2CInstallments(plan, total, depositAmount)
    : calcB2BInstallments(b2bCount, total, b2bPcts.slice(0, b2bCount))
  const firstInst = preview[0]

  async function save() {
    if (clientType === 'B2B' && !pctValid) return
    setSaving(true)
    await supabase.from('jobs').update({
      customer_type: clientType,
      payment_plan_type: clientType === 'B2C' ? plan : String(b2bCount),
      work_days: workDays,
      work_start_date: firstInst?.trigger ? paidDate : null,
    }).eq('id', job.id)
    await supabase.from('payments').delete().eq('job_id', job.id)
    await supabase.from('payments').insert(preview.map((p, i) => ({
      id: `PAY-${job.id}-${i + 1}`,
      job_id: job.id,
      customer_id: job.customer_id,
      project_id: job.project_id,
      room: job.room_no,
      installment_no: p.no,
      installment_name: p.name,
      percentage: p.pct,
      amount: p.amount,
      status: i === 0 ? 'paid' : 'pending',
      paid_date: i === 0 ? paidDate : null,
      paid_amount: i === 0 ? (firstPaidAmount || p.amount) : null,
      is_work_trigger: p.trigger,
      is_final: p.final,
      slip_url: i === 0 ? (slipUrl.trim() || (slipPosted ? 'posted' : null)) : null,
      receipt_url: i === 0 ? (receiptUrl.trim() || (receiptPosted ? 'posted' : null)) : null,
    })))
    setSaving(false); onSaved(); onClose()
  }

  const inputStyle = { background: 'var(--input-bg)', border: '1px solid var(--divider)', color: 'var(--text-1)' }
  const btnActive = { background: 'var(--accent)', color: '#fff', border: '1px solid var(--accent)' }
  const btnIdle = { background: 'var(--hover-bg)', border: '1px solid var(--divider)', color: 'var(--text-2)' }

  return (
    <div className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center p-4" onClick={onClose}>
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
      <div className="relative w-full max-w-md rounded-[18px] shadow-2xl max-h-[88vh] overflow-y-auto"
        style={{ background: 'var(--card-bg)', border: '1px solid var(--card-border)' }}
        onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between p-5" style={{ borderBottom: '1px solid var(--divider)' }}>
          <div>
            <h3 className="font-semibold" style={{ color: 'var(--text-1)' }}>
              {step === 'plan' ? 'ตั้งแผนชำระเงิน' : 'บันทึกรับเงินงวดแรก'}
            </h3>
            <p className="text-xs mt-0.5" style={{ color: 'var(--text-2)' }}>{job.room_no} · {job.project_name}</p>
          </div>
          <button onClick={onClose} className="p-1" style={{ color: 'var(--text-2)' }}><X size={18} /></button>
        </div>
        <div className="p-5 space-y-4">
          {step === 'plan' ? (
            <>
              <div className="rounded-[11px] p-3 text-center" style={{ background: 'var(--hover-bg)' }}>
                <p className="text-xs mb-0.5" style={{ color: 'var(--text-2)' }}>มูลค่างาน</p>
                <p className="text-xl font-bold" style={{ color: 'var(--text-1)' }}>{fmtBaht(total)}</p>
              </div>
              <div>
                <p className="text-xs mb-2" style={{ color: 'var(--text-2)' }}>ประเภทลูกค้า</p>
                <div className="grid grid-cols-2 gap-2">
                  {(['B2C', 'B2B'] as ClientType[]).map(t => (
                    <button key={t} onClick={() => setClientType(t)}
                      className="py-2 rounded-[11px] text-sm font-semibold border"
                      style={clientType === t ? btnActive : btnIdle}>{t}</button>
                  ))}
                </div>
              </div>
              {clientType === 'B2C' && (
                <div>
                  <p className="text-xs mb-2" style={{ color: 'var(--text-2)' }}>รูปแบบการชำระ</p>
                  <div className="space-y-2">
                    {B2C_PLANS.map(p => (
                      <button key={p.value} onClick={() => setPlan(p.value)}
                        className="w-full text-left px-4 py-3 rounded-[11px] border"
                        style={plan === p.value
                          ? { background: 'rgba(99,102,241,0.1)', border: '1px solid rgba(99,102,241,0.4)', color: 'var(--text-1)' }
                          : { background: 'var(--hover-bg)', border: '1px solid var(--divider)', color: 'var(--text-2)' }}>
                        <p className="text-sm font-semibold">{p.label}</p>
                        <p className="text-xs opacity-60 mt-0.5">{p.desc}</p>
                      </button>
                    ))}
                  </div>
                  {plan === 'C' && (
                    <div className="mt-3">
                      <label className="text-xs" style={{ color: 'var(--text-2)' }}>ยอดมัดจำ (บาท)</label>
                      <input type="number" value={depositAmount || ''} onChange={e => setDepositAmount(Number(e.target.value))}
                        placeholder={`เช่น ${Math.round(total * 0.1).toLocaleString()}`}
                        className="mt-1 w-full rounded-[8px] px-3 py-2 text-sm focus:outline-none" style={inputStyle} />
                    </div>
                  )}
                </div>
              )}
              {clientType === 'B2B' && (
                <div className="space-y-3">
                  <div>
                    <p className="text-xs mb-2" style={{ color: 'var(--text-2)' }}>จำนวนงวด</p>
                    <div className="flex gap-2">
                      {[2, 3, 4, 5, 6].map(n => (
                        <button key={n} onClick={() => updateB2bCount(n)}
                          className="flex-1 py-2 rounded-[11px] text-sm font-semibold border"
                          style={b2bCount === n ? btnActive : btnIdle}>{n}</button>
                      ))}
                    </div>
                  </div>
                  <div className="space-y-2">
                    <p className="text-xs" style={{ color: 'var(--text-2)' }}>
                      % แต่ละงวด <span style={{ color: pctValid ? 'var(--accent-green)' : 'var(--accent-red)' }}>(รวม {pctSum}%)</span>
                    </p>
                    {b2bPcts.slice(0, b2bCount).map((pct, i) => (
                      <div key={i} className="flex items-center gap-2">
                        <span className="text-xs w-14" style={{ color: 'var(--text-2)' }}>งวดที่ {i + 1}</span>
                        <input type="number" value={pct}
                          onChange={e => { const np = [...b2bPcts]; np[i] = Number(e.target.value); setB2bPcts(np) }}
                          className="w-16 rounded-[8px] px-2 py-1.5 text-sm text-center focus:outline-none" style={inputStyle} />
                        <span className="text-xs flex-1" style={{ color: 'var(--text-2)' }}>{fmtBaht(Math.round((pct / 100) * total))}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
              <div>
                <p className="text-xs mb-1.5" style={{ color: 'var(--text-2)' }}>ระยะเวลางาน</p>
                <div className="flex gap-2">
                  {WORK_DAYS_OPTIONS.map(d => (
                    <button key={d} onClick={() => setWorkDays(d)}
                      className="flex-1 py-1.5 rounded-[8px] text-xs border"
                      style={workDays === d ? btnActive : btnIdle}>{d} วัน</button>
                  ))}
                </div>
              </div>
              <div>
                <p className="text-xs mb-2" style={{ color: 'var(--text-2)' }}>ตัวอย่างงวด</p>
                <div className="space-y-1.5">
                  {preview.map(p => (
                    <div key={p.no} className="flex justify-between items-center px-3 py-2 rounded-[8px]"
                      style={{ background: 'var(--hover-bg)' }}>
                      <div>
                        <span className="text-xs font-semibold" style={{ color: 'var(--text-1)' }}>{p.name}</span>
                        {p.trigger && <span className="ml-2 text-[10px] px-1.5 py-0.5 rounded-[4px] font-semibold" style={{ background: 'color-mix(in srgb, var(--accent) 12%, transparent)', color: 'var(--accent)' }}>เริ่มงาน</span>}
                        {p.final && <span className="ml-2 text-[10px] px-1.5 py-0.5 rounded-[4px] font-semibold" style={{ background: 'color-mix(in srgb, var(--accent-green) 12%, transparent)', color: 'var(--accent-green)' }}>สุดท้าย</span>}
                      </div>
                      <span className="text-xs font-bold" style={{ color: 'var(--text-1)' }}>{fmtBaht(p.amount)}</span>
                    </div>
                  ))}
                </div>
              </div>
              <button onClick={() => setStep('pay')} className="w-full py-3 rounded-[11px] font-semibold text-sm text-white"
                style={{ background: 'var(--accent)' }}>ถัดไป → บันทึกงวดแรก</button>
            </>
          ) : (
            <>
              <div className="rounded-[11px] p-4" style={{ background: 'var(--hover-bg)' }}>
                <p className="text-xs mb-1" style={{ color: 'var(--text-2)' }}>งวดที่ 1 — {firstInst?.name}</p>
                <p className="text-2xl font-bold" style={{ color: 'var(--text-1)' }}>{fmtBaht(firstInst?.amount || 0)}</p>
                {firstInst?.trigger && <p className="text-xs mt-1 text-indigo-400">งวดนี้เป็นงวดเริ่มงาน</p>}
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs" style={{ color: 'var(--text-2)' }}>ยอดที่รับจริง (฿)</label>
                  <input type="number" value={firstPaidAmount || ''} onChange={e => setFirstPaidAmount(+e.target.value)}
                    className="mt-1 w-full rounded-[8px] px-3 py-2 text-sm focus:outline-none font-semibold" style={inputStyle}
                    placeholder={String(firstInst?.amount || 0)} />
                </div>
                <div>
                  <label className="text-xs" style={{ color: 'var(--text-2)' }}>วันที่รับเงิน</label>
                  <input type="date" value={paidDate} onChange={e => setPaidDate(e.target.value)}
                    className="mt-1 w-full rounded-[8px] px-3 py-2 text-sm focus:outline-none" style={inputStyle} />
                </div>
              </div>
              <div className="rounded-[10px] p-3 space-y-2" style={{ background: 'var(--hover-bg)', border: '1px solid var(--divider)' }}>
                <label className="flex items-center gap-2.5 cursor-pointer select-none">
                  <input type="checkbox" checked={slipPosted} onChange={e => setSlipPosted(e.target.checked)}
                    className="w-4 h-4 rounded" style={{ accentColor: 'var(--accent-blue)' }} />
                  <span className="text-xs font-semibold" style={{ color: slipPosted ? 'var(--accent-blue)' : 'var(--text-2)' }}>สลิปโอนเงิน / บัตรเครดิต โพสต์ใน Line แล้ว</span>
                </label>
                <label className="flex items-center gap-2.5 cursor-pointer select-none">
                  <input type="checkbox" checked={receiptPosted} onChange={e => setReceiptPosted(e.target.checked)}
                    className="w-4 h-4 rounded" style={{ accentColor: 'var(--accent-green)' }} />
                  <span className="text-xs font-semibold" style={{ color: receiptPosted ? 'var(--accent-green)' : 'var(--text-2)' }}>ใบเสร็จรับเงิน โพสต์ใน Line แล้ว</span>
                </label>
              </div>
              <div className="flex gap-2">
                <button onClick={() => setStep('plan')} className="flex-1 py-2.5 rounded-[11px] text-sm border"
                  style={btnIdle}>← ย้อนกลับ</button>
                <button onClick={save} disabled={saving} className="flex-1 py-2.5 rounded-[11px] font-semibold text-sm text-white"
                  style={{ background: saving ? '#999' : 'var(--accent)' }}>
                  {saving ? 'กำลังบันทึก...' : 'ตั้งค่าและบันทึก'}
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  )
}

// ─── Record Payment Modal ──────────────────────────────────
function PayModal({ job, onClose, onSaved }: { job: FullJob; onClose: () => void; onSaved: () => void }) {
  const supabase = createClient()
  const allInsts = [...job.installments].sort((a, b) => a.installment_no - b.installment_no)
  const firstPending = allInsts.find(i => i.status !== 'paid') || allInsts[0] || null
  const [selected, setSelected] = useState<Installment | null>(firstPending)
  const [paidDate, setPaidDate] = useState(firstPending?.paid_date || todayStr())
  const [paidAmount, setPaidAmount] = useState(firstPending?.paid_amount ?? firstPending?.amount ?? 0)
  const [slipUrl, setSlipUrl] = useState('')
  const [slipPosted, setSlipPosted] = useState(false)
  const [receiptUrl, setReceiptUrl] = useState('')
  const [receiptPosted, setReceiptPosted] = useState(false)
  const [saving, setSaving] = useState(false)

  function selectInst(inst: Installment) {
    setSelected(inst)
    setPaidAmount(inst.paid_amount ?? inst.amount ?? 0)
    setPaidDate(inst.paid_date || todayStr())
    setSlipPosted(inst.slip_url === 'posted'); setSlipUrl(inst.slip_url && inst.slip_url !== 'posted' ? inst.slip_url : '')
    setReceiptPosted(inst.receipt_url === 'posted'); setReceiptUrl(inst.receipt_url && inst.receipt_url !== 'posted' ? inst.receipt_url : '')
  }

  async function save() {
    if (!selected) return
    setSaving(true)
    if (selected.is_work_trigger && !job.work_start_date) {
      await supabase.from('jobs').update({ work_start_date: paidDate }).eq('id', job.id)
    }
    await supabase.from('payments').update({
      status: 'paid',
      paid_date: paidDate,
      paid_amount: paidAmount,
      slip_url: slipUrl.trim() || (slipPosted ? 'posted' : null),
      receipt_url: receiptUrl.trim() || (receiptPosted ? 'posted' : null),
    }).eq('id', selected.id)
    setSaving(false); onSaved(); onClose()
  }

  const inputStyle = { background: 'var(--input-bg)', border: '1px solid var(--divider)', color: 'var(--text-1)' }

  return (
    <div className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center p-4" onClick={onClose}>
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
      <div className="relative w-full max-w-sm rounded-[18px] shadow-2xl max-h-[90vh] overflow-y-auto"
        style={{ background: 'var(--card-bg)', border: '1px solid var(--card-border)' }}
        onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between p-5" style={{ borderBottom: '1px solid var(--divider)' }}>
          <div>
            <h3 className="font-semibold" style={{ color: 'var(--text-1)' }}>บันทึกรับเงิน</h3>
            <p className="text-xs mt-0.5" style={{ color: 'var(--text-2)' }}>{job.room_no} · {job.project_name}</p>
          </div>
          <button onClick={onClose} className="p-1" style={{ color: 'var(--text-2)' }}><X size={18} /></button>
        </div>
        <div className="p-5 space-y-4">
          <div className="space-y-2">
            {allInsts.map(inst => (
              <button key={inst.id} onClick={() => selectInst(inst)}
                className="w-full text-left px-4 py-3 rounded-[11px] border"
                style={selected?.id === inst.id
                  ? { background: 'rgba(99,102,241,0.1)', border: '1px solid rgba(99,102,241,0.4)', color: 'var(--text-1)' }
                  : { background: 'var(--hover-bg)', border: '1px solid var(--divider)', color: 'var(--text-2)' }}>
                <div className="flex justify-between">
                  <span className="text-sm font-semibold">{inst.installment_name}</span>
                  <span className="text-sm font-bold">{fmtBaht(inst.paid_amount ?? inst.amount)}</span>
                </div>
                <div className="flex gap-2 mt-0.5">
                  {inst.status === 'paid' && <span className="text-[10px] text-green-400">รับแล้ว {inst.paid_date ? fmtDate(inst.paid_date) : ''}</span>}
                  {inst.is_work_trigger && <span className="text-[10px]" style={{ color: 'var(--accent)' }}>เริ่มงาน</span>}
                  {inst.is_final && <span className="text-[10px]" style={{ color: 'var(--accent-orange)' }}>งวดสุดท้าย</span>}
                  {inst.status !== 'paid' && inst.due_date && <span className="text-[10px]" style={{ color: 'var(--text-3)' }}>ครบ {fmtDate(inst.due_date)}</span>}
                </div>
              </button>
            ))}
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs" style={{ color: 'var(--text-2)' }}>ยอดที่รับ (฿)</label>
              <input type="number" value={paidAmount || ''} onChange={e => setPaidAmount(+e.target.value)}
                className="mt-1 w-full rounded-[8px] px-3 py-2 text-sm focus:outline-none font-semibold" style={inputStyle} placeholder="0" />
            </div>
            <div>
              <label className="text-xs" style={{ color: 'var(--text-2)' }}>วันที่รับเงิน</label>
              <input type="date" value={paidDate} onChange={e => setPaidDate(e.target.value)}
                className="mt-1 w-full rounded-[8px] px-3 py-2 text-sm focus:outline-none" style={inputStyle} />
            </div>
          </div>
          {/* Slip + Receipt checkboxes */}
          <div className="rounded-[10px] p-3 space-y-2" style={{ background: 'var(--hover-bg)', border: '1px solid var(--divider)' }}>
            <label className="flex items-center gap-2.5 cursor-pointer select-none">
              <input type="checkbox" checked={slipPosted} onChange={e => setSlipPosted(e.target.checked)}
                className="w-4 h-4 rounded" style={{ accentColor: 'var(--accent-blue)' }} />
              <span className="text-xs font-semibold" style={{ color: slipPosted ? 'var(--accent-blue)' : 'var(--text-2)' }}>สลิปโอนเงิน / บัตรเครดิต โพสต์ใน Line แล้ว</span>
            </label>
            <label className="flex items-center gap-2.5 cursor-pointer select-none">
              <input type="checkbox" checked={receiptPosted} onChange={e => setReceiptPosted(e.target.checked)}
                className="w-4 h-4 rounded" style={{ accentColor: 'var(--accent-green)' }} />
              <span className="text-xs font-semibold" style={{ color: receiptPosted ? 'var(--accent-green)' : 'var(--text-2)' }}>ใบเสร็จรับเงิน โพสต์ใน Line แล้ว</span>
            </label>
          </div>
          <button onClick={save} disabled={saving || !selected}
            className="w-full py-3 rounded-[11px] font-semibold text-sm text-white"
            style={{ background: saving ? '#999' : 'var(--accent)' }}>
            {saving ? 'กำลังบันทึก...' : `บันทึก ${selected ? fmtBaht(selected.amount) : ''}`}
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Handover Modal ────────────────────────────────────────
function HandoverModal({ job, onClose, onSaved }: { job: FullJob; onClose: () => void; onSaved: () => void }) {
  const supabase = createClient()
  const [deliverDate, setDeliverDate] = useState(job.actual_deliver_date || todayStr())
  const [warrantyMonths, setWarrantyMonths] = useState(6)
  const [saving, setSaving] = useState(false)
  const finalInst = job.installments.find(i => i.is_final && i.status !== 'paid') || null
  const [markFinalPaid, setMarkFinalPaid] = useState(!!finalInst)
  const [finalPaidAmount, setFinalPaidAmount] = useState(finalInst?.amount || 0)

  const inputStyle = { background: 'var(--input-bg)', border: '1px solid var(--divider)', color: 'var(--text-1)' }
  const btnActive = { background: 'var(--accent)', color: '#fff', border: '1px solid var(--accent)' }
  const btnIdle = { background: 'var(--hover-bg)', border: '1px solid var(--divider)', color: 'var(--text-2)' }

  async function save() {
    setSaving(true)
    const wEnd = new Date(deliverDate)
    wEnd.setMonth(wEnd.getMonth() + warrantyMonths)
    const wEndStr = `${wEnd.getFullYear()}-${String(wEnd.getMonth() + 1).padStart(2, '0')}-${String(wEnd.getDate()).padStart(2, '0')}`
    const commissionMonth = deliverDate.slice(0, 7) + '-01'
    await supabase.from('jobs').update({
      actual_deliver_date: deliverDate,
      working_status: 'ส่งมอบแล้ว',
      commission_month: commissionMonth,
    }).eq('id', job.id)
    if (markFinalPaid && finalInst) {
      await supabase.from('payments').update({ status: 'paid', paid_date: deliverDate, paid_amount: finalPaidAmount }).eq('id', finalInst.id)
    }
    const handoverData = { job_id: job.id, customer_id: job.customer_id, project_id: job.project_id, room: job.room_no, delivery_date: deliverDate, work_status: 'ส่งมอบแล้ว' }
    const { data: existHO } = await supabase.from('handovers').select('id').eq('job_id', job.id).maybeSingle()
    if (existHO) { await supabase.from('handovers').update(handoverData).eq('id', existHO.id) }
    else { await supabase.from('handovers').insert(handoverData) }
    await supabase.from('warranties').upsert({
      id: `WAR-${job.id}`, customer_id: job.customer_id, project_id: job.project_id,
      room: job.room_no, handover_date: deliverDate, warranty_start: deliverDate,
      warranty_end: wEndStr, warranty_months: warrantyMonths, status: 'active',
    }, { onConflict: 'id' })
    setSaving(false); onSaved(); onClose()
  }

  return (
    <div className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center p-4" onClick={onClose}>
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
      <div className="relative w-full max-w-sm rounded-[18px] shadow-2xl"
        style={{ background: 'var(--card-bg)', border: '1px solid var(--card-border)' }}
        onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between p-5" style={{ borderBottom: '1px solid var(--divider)' }}>
          <div>
            <h3 className="font-semibold" style={{ color: 'var(--text-1)' }}>บันทึกส่งมอบ</h3>
            <p className="text-xs mt-0.5" style={{ color: 'var(--text-2)' }}>{job.room_no} · {job.project_name}</p>
          </div>
          <button onClick={onClose} className="p-1" style={{ color: 'var(--text-2)' }}><X size={18} /></button>
        </div>
        <div className="p-5 space-y-4">
          <div>
            <label className="text-xs" style={{ color: 'var(--text-2)' }}>วันที่ส่งมอบ</label>
            <input type="date" value={deliverDate} onChange={e => setDeliverDate(e.target.value)}
              className="mt-1 w-full rounded-[8px] px-3 py-2 text-sm focus:outline-none" style={inputStyle} />
          </div>
          <div>
            <label className="text-xs" style={{ color: 'var(--text-2)' }}>ระยะประกัน</label>
            <div className="flex gap-2 mt-1">
              {[6, 12, 24].map(m => (
                <button key={m} onClick={() => setWarrantyMonths(m)}
                  className="flex-1 py-2 rounded-[8px] text-xs border font-semibold"
                  style={warrantyMonths === m ? btnActive : btnIdle}>{m} เดือน</button>
              ))}
            </div>
          </div>
          {finalInst && (
            <div className="rounded-[11px] p-3 space-y-2" style={{ background: 'var(--hover-bg)' }}>
              <label className="flex items-center gap-3 cursor-pointer">
                <input type="checkbox" checked={markFinalPaid} onChange={e => setMarkFinalPaid(e.target.checked)} className="w-4 h-4 rounded" />
                <div>
                  <p className="text-sm font-semibold" style={{ color: 'var(--text-1)' }}>รับเงินงวดสุดท้าย</p>
                  <p className="text-xs mt-0.5" style={{ color: 'var(--text-2)' }}>{finalInst.installment_name} — {fmtBaht(finalInst.amount)}</p>
                </div>
              </label>
              {markFinalPaid && (
                <div>
                  <label className="text-xs" style={{ color: 'var(--text-2)' }}>ยอดที่รับจริง (฿)</label>
                  <input type="number" value={finalPaidAmount || ''} onChange={e => setFinalPaidAmount(+e.target.value)}
                    className="mt-1 w-full rounded-[8px] px-3 py-2 text-sm focus:outline-none font-semibold"
                    style={inputStyle} placeholder="0" />
                </div>
              )}
            </div>
          )}
          <div className="rounded-[11px] p-3" style={{ background: 'rgba(99,102,241,0.05)', border: '1px solid var(--divider)' }}>
            <p className="text-xs font-semibold" style={{ color: 'var(--text-2)' }}>ประกันรันอัตโนมัติ {warrantyMonths} เดือน</p>
            <p className="text-xs mt-0.5" style={{ color: 'var(--text-3)' }}>เริ่ม {deliverDate}</p>
          </div>
          <button onClick={save} disabled={saving} className="w-full py-3 rounded-[11px] font-semibold text-sm text-white"
            style={{ background: saving ? 'var(--text-3)' : 'var(--accent-green)' }}>
            {saving ? 'กำลังบันทึก...' : 'ยืนยันส่งมอบ'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Revenue Card (editable) ───────────────────────────────
function RevenueCard({ job, onUpdated }: {
  job: { id: string; revenue_ex_vat: number; revenue_inc_vat: number }
  onUpdated: (exVat: number, incVat: number) => void
}) {
  const supabase = createClient()
  const [editing, setEditing] = useState(false)
  const [exVat, setExVat] = useState(String(job.revenue_ex_vat || ''))
  const [incVat, setIncVat] = useState(String(job.revenue_inc_vat || ''))
  const [saving, setSaving] = useState(false)

  function openEdit() {
    setExVat(String(job.revenue_ex_vat || ''))
    setIncVat(String(job.revenue_inc_vat || ''))
    setEditing(true)
  }

  function autoCalcInc() {
    const ex = parseFloat(exVat)
    if (!isNaN(ex)) setIncVat(String(Math.round(ex * 1.07)))
  }

  async function save() {
    setSaving(true)
    const ex = parseFloat(exVat) || 0
    const inc = parseFloat(incVat) || 0
    await supabase.from('jobs').update({ revenue_ex_vat: ex, revenue_inc_vat: inc }).eq('id', job.id)
    onUpdated(ex, inc)
    setSaving(false)
    setEditing(false)
  }

  const inputStyle = { background: 'var(--input-bg)', border: '1px solid var(--divider)', color: 'var(--text-1)' }

  if (editing) {
    return (
      <div className="rounded-[12px] p-4" style={{ background: 'var(--hover-bg)', border: '1px solid var(--accent)' }}>
        <p className="text-xs font-semibold mb-3" style={{ color: 'var(--text-3)' }}>แก้ไขมูลค่างาน</p>
        <div className="space-y-2">
          <div>
            <label className="text-xs mb-1 block" style={{ color: 'var(--text-3)' }}>ราคา ex. VAT (บาท)</label>
            <input type="number" value={exVat} onChange={e => setExVat(e.target.value)}
              onBlur={autoCalcInc}
              className="w-full px-3 py-2 rounded-[8px] text-sm focus:outline-none"
              style={inputStyle} placeholder="0" />
          </div>
          <div>
            <label className="text-xs mb-1 flex items-center justify-between" style={{ color: 'var(--text-3)' }}>
              <span>ราคา inc. VAT (บาท)</span>
              <button onClick={autoCalcInc} className="text-[10px] px-2 py-0.5 rounded" style={{ color: 'var(--accent)', background: 'var(--active-bg)' }}>
                คำนวณ ×1.07
              </button>
            </label>
            <input type="number" value={incVat} onChange={e => setIncVat(e.target.value)}
              className="w-full px-3 py-2 rounded-[8px] text-sm focus:outline-none"
              style={inputStyle} placeholder="0" />
          </div>
        </div>
        <div className="flex gap-2 mt-3">
          <button onClick={() => setEditing(false)} className="flex-1 py-2 rounded-[8px] text-sm" style={{ color: 'var(--text-3)', background: 'var(--card-bg)' }}>ยกเลิก</button>
          <button onClick={save} disabled={saving} className="flex-1 py-2 rounded-[8px] text-sm font-semibold text-white disabled:opacity-50" style={{ background: 'var(--accent)' }}>
            {saving ? 'กำลังบันทึก...' : 'บันทึก'}
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="rounded-[12px] p-4 flex items-center justify-between"
      style={{ background: 'var(--hover-bg)' }}>
      <div>
        <p className="text-xs" style={{ color: 'var(--text-3)' }}>มูลค่างาน (inc. VAT)</p>
        <p className="text-xl font-bold mt-0.5" style={{ color: 'var(--text-1)' }}>{fmtBaht(job.revenue_inc_vat || job.revenue_ex_vat)}</p>
        {job.revenue_ex_vat > 0 && (
          <p className="text-xs mt-0.5" style={{ color: 'var(--text-3)' }}>ex. VAT {fmtBaht(job.revenue_ex_vat)}</p>
        )}
      </div>
      <button onClick={openEdit} className="p-2 rounded-[8px] transition-colors" style={{ color: 'var(--text-3)', background: 'var(--card-bg)' }}>
        <Pencil size={14} />
      </button>
    </div>
  )
}

// ─── LINE message generator ────────────────────────────────
interface LineJobCtx {
  project_name: string
  room_no: string
  customer_name: string
  sales_name: string
  revenue_inc_vat: number
  voucher?: number
  working_status: string
}

function generateLineMsg(job: LineJobCtx, inst: Installment): string {
  const isDelivered = job.working_status === 'ส่งมอบแล้ว'
  const isFirst = inst.installment_no === 1
  const type = isDelivered ? 'ลูกค้าเก่า ส่งมอบ' : isFirst ? 'ลูกค้าใหม่' : 'ลูกค้าเก่า'

  const d = inst.paid_date ? new Date(inst.paid_date) : new Date()
  const dd = String(d.getDate()).padStart(2, '0')
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  const yy = String(d.getFullYear()).slice(2)
  const dateStr = `${dd}/${mm}/${yy}`

  const fmt = (n: number) => n.toLocaleString('th-TH')
  const paid = inst.paid_amount ?? inst.amount

  let lines = [
    `Wyde Int. (${type})`,
    `วันที่ : ${dateStr}`,
    `โครงการ : ${job.project_name}`,
    `ห้อง : ${job.room_no}`,
    `ลูกค้าชื่อ : ${job.customer_name}`,
    `Sales Wyde : ${job.sales_name}`,
    `Package : ${fmt(job.revenue_inc_vat)} บาท`,
  ]
  if (job.voucher && job.voucher > 0) lines.push(`หัก Voucher : ${fmt(job.voucher)} บาท`)
  lines.push(`${inst.installment_name} : ${fmt(paid)} บาท`)
  if (inst.channel) lines.push(`ชำระผ่านทาง : ${inst.channel}`)
  return lines.join('\n')
}

// ─── Deal Drawer (right panel) ─────────────────────────────
// ─── Doc field component ───────────────────────────────────
// ─── InstRow — inline paid_date edit ───────────────────────
function InstRow({ inst, job, onDateSaved }: { inst: Installment; job: LineJobCtx; onDateSaved: (d: string | null) => void }) {
  const supabase = createClient()
  const [editingDate, setEditingDate] = useState(false)
  const [dateVal, setDateVal] = useState(inst.paid_date || todayStr())
  const [saving, setSaving] = useState(false)
  const [slipUrl, setSlipUrl] = useState(inst.slip_url)
  const [receiptUrl, setReceiptUrl] = useState(inst.receipt_url)
  const [savingSlip, setSavingSlip] = useState(false)
  const [savingReceipt, setSavingReceipt] = useState(false)
  const [copied, setCopied] = useState(false)

  function copyLine() {
    const msg = generateLineMsg(job, { ...inst, paid_date: dateVal })
    navigator.clipboard.writeText(msg).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    })
  }

  async function saveDate() {
    setSaving(true)
    await supabase.from('payments').update({ paid_date: dateVal }).eq('id', inst.id)
    onDateSaved(dateVal)
    setSaving(false)
    setEditingDate(false)
  }

  async function toggleSlip() {
    setSavingSlip(true)
    const newVal = slipUrl ? null : 'posted'
    await supabase.from('payments').update({ slip_url: newVal }).eq('id', inst.id)
    setSlipUrl(newVal)
    setSavingSlip(false)
  }

  async function toggleReceipt() {
    setSavingReceipt(true)
    const newVal = receiptUrl ? null : 'posted'
    await supabase.from('payments').update({ receipt_url: newVal }).eq('id', inst.id)
    setReceiptUrl(newVal)
    setSavingReceipt(false)
  }

  return (
    <div className="px-4 py-2.5">
      <div className="flex items-center gap-3">
        <div className="flex-shrink-0">
          {inst.status === 'paid'
            ? <CheckCircle2 size={14} style={{ color: 'var(--accent-green)' }} />
            : <Circle size={14} style={{ color: 'var(--text-3)' }} />}
        </div>
        <div className="flex-1 min-w-0">
          <span className="text-xs" style={{ color: 'var(--text-1)' }}>{inst.installment_name}</span>
          {inst.is_final && <span className="ml-1.5 text-[9px] px-1 rounded-[4px] font-semibold" style={{ background: 'color-mix(in srgb, var(--accent-orange) 12%, transparent)', color: 'var(--accent-orange)' }}>สุดท้าย</span>}
        </div>
        <div className="text-right">
          <span className="text-xs font-semibold" style={{ color: inst.status === 'paid' ? 'var(--accent-green)' : 'var(--text-1)' }}>
            {fmtBaht(inst.amount)}
          </span>
          {inst.status === 'paid' && (
            <div>
              {editingDate ? (
                <div className="flex items-center gap-1 mt-0.5">
                  <input type="date" value={dateVal} onChange={e => setDateVal(e.target.value)}
                    className="text-[10px] rounded px-1 py-0.5 focus:outline-none w-28"
                    style={{ background: 'var(--input-bg)', border: '1px solid var(--divider)', color: 'var(--text-1)' }} />
                  <button onClick={saveDate} disabled={saving}
                    className="text-[10px] px-1.5 py-0.5 rounded font-semibold text-white"
                    style={{ background: 'var(--accent)' }}>{saving ? '...' : '✓'}</button>
                  <button onClick={() => setEditingDate(false)} className="text-[10px]" style={{ color: 'var(--text-3)' }}>✕</button>
                </div>
              ) : (
                <button onClick={() => { setDateVal(inst.paid_date || todayStr()); setEditingDate(true) }}
                  className="text-[10px] mt-0.5 flex items-center gap-0.5"
                  style={{ color: inst.paid_date ? 'var(--text-3)' : 'var(--accent-orange)' }}>
                  {inst.paid_date ? fmtDate(inst.paid_date) : '+ วันที่รับเงิน'}
                </button>
              )}
            </div>
          )}
        </div>
      </div>
      {inst.status === 'paid' && (
        <div className="flex gap-2 mt-2 ml-7">
          <button onClick={toggleSlip} disabled={savingSlip}
            className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-[6px] text-xs font-semibold transition-all active:scale-95"
            style={{
              background: slipUrl ? 'rgba(96,165,250,0.12)' : 'var(--hover-bg)',
              border: `1px solid ${slipUrl ? 'rgba(96,165,250,0.3)' : 'var(--divider)'}`,
              color: slipUrl ? '#60a5fa' : 'var(--text-3)',
              opacity: savingSlip ? 0.5 : 1,
            }}>
            {slipUrl ? <CheckCircle2 size={11} /> : <Circle size={11} />} Slip
          </button>
          <button onClick={toggleReceipt} disabled={savingReceipt}
            className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-[6px] text-xs font-semibold transition-all active:scale-95"
            style={{
              background: receiptUrl ? 'rgba(74,222,128,0.12)' : 'var(--hover-bg)',
              border: `1px solid ${receiptUrl ? 'rgba(74,222,128,0.3)' : 'var(--divider)'}`,
              color: receiptUrl ? '#4ade80' : 'var(--text-3)',
              opacity: savingReceipt ? 0.5 : 1,
            }}>
            {receiptUrl ? <CheckCircle2 size={11} /> : <Circle size={11} />} ใบเสร็จ
          </button>
          <button onClick={copyLine}
            className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-[6px] text-xs font-semibold transition-all active:scale-95"
            style={{
              background: copied ? 'rgba(74,222,128,0.15)' : 'rgba(0,185,107,0.08)',
              border: `1px solid ${copied ? 'rgba(74,222,128,0.4)' : 'rgba(0,185,107,0.25)'}`,
              color: copied ? '#4ade80' : '#00b96b',
            }}>
            {copied ? <CheckCircle2 size={11} /> : '💬'} {copied ? 'คัดลอกแล้ว!' : 'LINE'}
          </button>
        </div>
      )}
    </div>
  )
}

function DocField({ jobId, field, label, value, onUpdate }: {
  jobId: string; field: string; label: string; value: string | null; onUpdate: (v: string | null) => void
}) {
  const supabase = createClient()
  const [saving, setSaving] = useState(false)
  const checked = !!value

  async function toggle() {
    setSaving(true)
    const newVal = checked ? null : 'posted'
    await supabase.from('jobs').update({ [field]: newVal }).eq('id', jobId)
    onUpdate(newVal)
    setSaving(false)
  }

  return (
    <label className="flex items-center gap-3 px-3 py-2.5 rounded-[10px] cursor-pointer transition-colors select-none"
      style={{ background: checked ? 'color-mix(in srgb, var(--accent-green) 10%, transparent)' : 'var(--hover-bg)', border: `1px solid ${checked ? 'color-mix(in srgb, var(--accent-green) 30%, transparent)' : 'var(--divider)'}` }}>
      <input type="checkbox" checked={checked} onChange={toggle} disabled={saving}
        className="w-4 h-4 rounded flex-shrink-0" style={{ accentColor: 'var(--accent-green)' }} />
      <span className="text-xs font-semibold flex-1" style={{ color: checked ? 'var(--accent-green)' : 'var(--text-2)' }}>{label}</span>
      {saving && <span className="text-[10px]" style={{ color: 'var(--text-3)' }}>...</span>}
    </label>
  )
}

function DealDrawer({ job: initialJob, onClose, onRefresh }: { job: FullJob; onClose: () => void; onRefresh: () => void }) {
  const [job, setJob] = useState(initialJob)
  const [actionModal, setActionModal] = useState<'setup' | 'pay' | 'handover' | null>(null)
  const [instExpanded, setInstExpanded] = useState(false)
  const [docsExpanded, setDocsExpanded] = useState(false)
  useEffect(() => { setJob(initialJob) }, [initialJob])
  const { hasPlan, finalPaid, delivered, paidCount, totalCount, pendingInstallments, activeStage } = getFullStageInfo(job)
  const overdueCount = job.installments.filter(i => i.status === 'overdue').length

  function updateDocField(field: keyof FullJob, val: string | null) {
    setJob(prev => ({ ...prev, [field]: val }))
  }

  const stages = [
    { label: 'ขาย', icon: ShoppingCart, done: true },
    { label: 'เปิดงาน', icon: Wrench, done: hasPlan },
    { label: 'เก็บเงิน', icon: Wallet, done: finalPaid },
    { label: 'ส่งมอบ', icon: Package, done: delivered },
  ]

  function handleSaved() { onRefresh() }

  return (
    <>
      {/* Backdrop */}
      <div className="fixed inset-0 z-40" style={{ background: 'rgba(0,0,0,0.30)', backdropFilter: 'blur(6px)', WebkitBackdropFilter: 'blur(6px)' }} onClick={onClose} />
      {/* Centered Panel */}
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 pointer-events-none">
      <div className="w-full max-w-[460px] max-h-[90vh] flex flex-col rounded-[20px] shadow-2xl pointer-events-auto"
        style={{ background: 'var(--card-bg)', border: '1px solid var(--card-border)' }}>
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4" style={{ borderBottom: '1px solid var(--divider)' }}>
          <div>
            <div className="flex items-center gap-2">
              <span className="px-2.5 py-1 rounded-[7px] font-bold text-xs text-white"
                style={{ background: delivered ? 'var(--accent-green)' : activeStage === 3 ? 'var(--accent-orange)' : activeStage === 4 ? 'var(--accent-blue)' : 'var(--accent)' }}>
                {job.room_no}
              </span>
              <span className="font-semibold text-sm" style={{ color: 'var(--text-1)' }}>{job.project_name}</span>
            </div>
            <p className="text-xs mt-1" style={{ color: 'var(--text-3)' }}>
              {job.customer_name}
              {job.sales_name ? ` · ${job.sales_name}` : ''}
            </p>
          </div>
          <button onClick={onClose} className="p-1 rounded-lg" style={{ color: 'var(--text-2)' }}><X size={18} /></button>
        </div>

        <div className="flex-1 overflow-y-auto p-5 space-y-4">
          {/* Revenue */}
          <RevenueCard job={job} onUpdated={(exVat, incVat) => setJob(prev => ({ ...prev, revenue_ex_vat: exVat, revenue_inc_vat: incVat }))} />
          {hasPlan && totalCount > 0 && (
            <div className="rounded-[12px] px-4 py-3 flex items-center justify-between"
              style={{ background: 'var(--hover-bg)' }}>
              <p className="text-sm font-semibold" style={{ color: paidCount === totalCount ? 'var(--accent-green)' : 'var(--accent-orange)' }}>
                {paidCount}/{totalCount} งวด
              </p>
              <div className="text-right">
                <p className="text-xs" style={{ color: 'var(--text-3)' }}>
                  เก็บแล้ว {fmtBaht(job.installments.filter(i => i.status === 'paid').reduce((s, i) => s + i.amount, 0))}
                </p>
                {overdueCount > 0 && (
                  <p className="text-xs flex items-center justify-end gap-0.5 mt-0.5" style={{ color: 'var(--accent-red)' }}>
                    <AlertTriangle size={10} /> {overdueCount} งวดเกิน
                  </p>
                )}
              </div>
            </div>
          )}

          {/* Stage bar */}
          <div className="flex items-center">
            {stages.map((s, idx) => {
              const Icon = s.icon
              const isActive = idx + 1 === activeStage
              return (
                <div key={s.label} className="flex items-center flex-1">
                  <div className="flex flex-col items-center gap-1">
                    <div className="w-8 h-8 rounded-full flex items-center justify-center"
                      style={{
                        background: s.done ? 'color-mix(in srgb, var(--accent-green) 15%, transparent)' : isActive ? 'color-mix(in srgb, var(--accent) 15%, transparent)' : 'var(--hover-bg)',
                        border: s.done ? `1.5px solid color-mix(in srgb, var(--accent-green) 60%, transparent)` : isActive ? '1.5px solid var(--accent)' : '1.5px solid var(--divider)',
                      }}>
                      {s.done
                        ? <CheckCircle2 size={14} style={{ color: 'var(--accent-green)' }} />
                        : <Icon size={13} style={{ color: isActive ? 'var(--accent)' : 'var(--text-3)' }} />}
                    </div>
                    <span className="text-[9px] font-semibold whitespace-nowrap"
                      style={{ color: s.done ? 'var(--accent-green)' : isActive ? 'var(--accent)' : 'var(--text-3)' }}>
                      {s.label}
                    </span>
                  </div>
                  {idx < stages.length - 1 && (
                    <div className="flex-1 h-[1.5px] mx-1 mb-4"
                      style={{ background: s.done ? 'var(--accent-green)' : 'var(--divider)' }} />
                  )}
                </div>
              )
            })}
          </div>

          {/* Installments */}
          {hasPlan && (
            <div className="rounded-[12px] overflow-hidden" style={{ border: '1px solid var(--divider)' }}>
              <div className="flex items-center" style={{ background: 'var(--hover-bg)' }}>
                <button className="flex-1 flex items-center justify-between px-4 py-2.5"
                  style={{ color: 'var(--text-3)' }}
                  onClick={() => setInstExpanded(e => !e)}>
                  <span className="text-xs">งวดชำระเงิน</span>
                  {instExpanded ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
                </button>
                <button onClick={() => setActionModal('setup')}
                  className="px-3 py-2.5 text-xs font-semibold"
                  style={{ color: 'var(--accent)', borderLeft: '1px solid var(--divider)' }}>
                  แก้ไข
                </button>
              </div>
              {instExpanded && (
                <div className="divide-y" style={{ borderColor: 'var(--divider)' }}>
                  {job.installments.sort((a, b) => a.installment_no - b.installment_no).map(inst => (
                    <InstRow key={inst.id} inst={inst} job={job}
                      onDateSaved={newDate => setJob(prev => ({
                        ...prev,
                        installments: prev.installments.map(i => i.id === inst.id ? { ...i, paid_date: newDate } : i)
                      }))} />
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Documents section */}
          <div className="rounded-[12px] overflow-hidden" style={{ border: '1px solid var(--divider)' }}>
            <button className="w-full flex items-center justify-between px-4 py-2.5"
              style={{ color: 'var(--text-3)', background: 'var(--hover-bg)' }}
              onClick={() => setDocsExpanded(e => !e)}>
              <span className="text-xs">เอกสาร</span>
              <div className="flex items-center gap-2">
                <span className="text-[10px]" style={{ color: 'var(--text-3)' }}>
                  {[job.quotation1_url, job.quotation2_url, job.id_card_url, job.delivery_doc_url, job.satisfaction_url, job.sale_slip_url, job.sale_receipt_url].filter(Boolean).length}/7
                </span>
                {docsExpanded ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
              </div>
            </button>
            {docsExpanded && (
              <div className="p-3 space-y-2">
                <DocField jobId={job.id} field="quotation1_url" label="ใบเสนอราคา 1"
                  value={job.quotation1_url} onUpdate={v => updateDocField('quotation1_url', v)} />
                <DocField jobId={job.id} field="quotation2_url" label="ใบเสนอราคา 2"
                  value={job.quotation2_url} onUpdate={v => updateDocField('quotation2_url', v)} />
                <DocField jobId={job.id} field="id_card_url" label="บัตรประชาชนลูกค้า"
                  value={job.id_card_url} onUpdate={v => updateDocField('id_card_url', v)} />
                <DocField jobId={job.id} field="delivery_doc_url" label="ใบส่งมอบ"
                  value={job.delivery_doc_url} onUpdate={v => updateDocField('delivery_doc_url', v)} />
                <DocField jobId={job.id} field="satisfaction_url" label="แบบประเมินความพึงพอใจ"
                  value={job.satisfaction_url} onUpdate={v => updateDocField('satisfaction_url', v)} />
                <DocField jobId={job.id} field="sale_slip_url" label="สลิปการขาย"
                  value={job.sale_slip_url} onUpdate={v => updateDocField('sale_slip_url', v)} />
                <DocField jobId={job.id} field="sale_receipt_url" label="ใบเสร็จรับเงิน (ช่วงขาย)"
                  value={job.sale_receipt_url} onUpdate={v => updateDocField('sale_receipt_url', v)} />
              </div>
            )}
          </div>
        </div>

          {/* File Attachments */}
          <div className="rounded-[12px] p-3" style={{ border: '1px solid var(--divider)' }}>
            <FileAttach jobId={job.id} projectName={job.project_name} roomNo={job.room_no} />
          </div>

        {/* Actions */}
        <div className="p-4" style={{ borderTop: '1px solid var(--divider)' }}>
          {delivered ? (
            <div className="space-y-2">
              <div className="rounded-[12px] p-3 text-center"
                style={{ background: 'color-mix(in srgb, var(--accent-green) 10%, transparent)', border: '1px solid color-mix(in srgb, var(--accent-green) 25%, transparent)' }}>
                <p className="text-sm font-semibold" style={{ color: 'var(--accent-green)' }}>ส่งมอบแล้ว {fmtDate(job.actual_deliver_date)}</p>
                {job.warranty_end && (
                  <p className="text-xs mt-0.5" style={{ color: 'var(--text-3)' }}>ประกันหมด {fmtDate(job.warranty_end)}</p>
                )}
              </div>
              <div className="flex gap-2">
                <button onClick={() => setActionModal('pay')}
                  className="flex-1 py-2 rounded-[10px] text-xs font-semibold"
                  style={{ background: 'var(--hover-bg)', border: '1px solid var(--divider)', color: 'var(--text-2)' }}>
                  แก้ไขงวดเงิน
                </button>
                <button onClick={() => setActionModal('handover')}
                  className="flex-1 py-2 rounded-[10px] text-xs font-semibold"
                  style={{ background: 'var(--hover-bg)', border: '1px solid var(--divider)', color: 'var(--text-2)' }}>
                  แก้ไขวันส่งมอบ
                </button>
              </div>
            </div>
          ) : !hasPlan ? (
            <button onClick={() => setActionModal('setup')}
              className="w-full py-3 rounded-[12px] font-semibold text-sm text-white"
              style={{ background: 'var(--accent)' }}>
              + ตั้งแผนชำระเงิน & รับเงินงวดแรก
            </button>
          ) : pendingInstallments.length > 0 ? (
            <div className="flex gap-2">
              <button onClick={() => setActionModal('pay')}
                className="flex-1 py-3 rounded-[12px] font-semibold text-sm text-white"
                style={{ background: 'var(--accent)' }}>
                + บันทึกรับเงิน
              </button>
              {finalPaid && (
                <button onClick={() => setActionModal('handover')}
                  className="flex-1 py-3 rounded-[12px] font-semibold text-sm text-white"
                  style={{ background: 'var(--accent-green)' }}>
                  ส่งมอบ
                </button>
              )}
            </div>
          ) : (
            <button onClick={() => setActionModal('handover')}
              className="w-full py-3 rounded-[12px] font-semibold text-sm text-white"
              style={{ background: 'var(--accent-green)' }}>
              + บันทึกส่งมอบ
            </button>
          )}
        </div>
      </div>
      </div>

      {actionModal === 'setup' && <SetupAndPayModal job={job} onClose={() => setActionModal(null)} onSaved={handleSaved} />}
      {actionModal === 'pay' && <PayModal job={job} onClose={() => setActionModal(null)} onSaved={handleSaved} />}
      {actionModal === 'handover' && <HandoverModal job={job} onClose={() => setActionModal(null)} onSaved={handleSaved} />}
    </>
  )
}

// ─── Room Card ─────────────────────────────────────────────
function RoomCard({ job, onClick }: { job: RoomJob; onClick: () => void }) {
  const stage = getChipStage(job)
  const meta = STAGE_META[stage]
  const isDone = stage === 'done'

  const tooltip = [job.customer_name, job.sales_name].filter(Boolean).join(' · ')

  return (
    <button onClick={onClick}
      title={tooltip}
      className="text-left rounded-[10px] p-3 transition-all hover:scale-[1.02]"
      style={{
        background: isDone ? 'var(--hover-bg)' : 'var(--card-bg)',
        border: `1px solid ${isDone ? 'var(--divider)' : 'var(--card-border)'}`,
        width: 130,
        opacity: isDone ? 0.7 : 1,
      }}>
      {/* Room number */}
      <p className="font-bold text-sm mb-1.5" style={{ color: isDone ? 'var(--text-3)' : 'var(--text-1)' }}>
        {job.room_no}
      </p>
      {/* Status tag */}
      <div className="mb-2">
        <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-[4px]"
          style={{ background: meta.bg, color: meta.color, border: `1px solid ${meta.border}` }}>
          {meta.label}
        </span>
      </div>
      {/* Sales + progress */}
      <div className="flex items-center justify-between">
        <p className="text-[10px] truncate flex-1" style={{ color: 'var(--text-3)' }}>{job.sales_name || ''}</p>
        {job.has_plan && job.total_count > 0 && (
          <p className="text-[10px] font-semibold ml-1 flex-shrink-0" style={{ color: job.paid_count === job.total_count ? 'var(--accent-green)' : 'var(--accent-orange)' }}>
            {job.paid_count}/{job.total_count}
          </p>
        )}
      </div>
    </button>
  )
}

// ─── Main Page ─────────────────────────────────────────────
export default function MyDealsPage() {
  const supabase = createClient()
  const router = useRouter()
  const [jobs, setJobs] = useState<RoomJob[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [doneExpanded, setDoneExpanded] = useState<Record<string, boolean>>({})
  const [selectedJobId, setSelectedJobId] = useState<string | null>(null)
  const [drawerJob, setDrawerJob] = useState<FullJob | null>(null)
  const [drawerLoading, setDrawerLoading] = useState(false)
  const [jumpOpen, setJumpOpen] = useState(false)
  const jumpRef = useRef<HTMLDivElement>(null)
  const projectRefs = useRef<Record<string, HTMLDivElement | null>>({})
  const [returnTo] = useState(() =>
    typeof window !== 'undefined' ? new URLSearchParams(window.location.search).get('returnTo') : null
  )

  const load = useCallback(async () => {
    setLoading(true)
    const { data } = await supabase
      .from('jobs')
      .select('id, room_no, project_id, customer_name, actual_deliver_date, work_start_date, projects(name), sales:users!sales_id(name), installments:payments(id, installment_no, installment_name, amount, paid_amount, percentage, status, due_date, paid_date, is_work_trigger, is_final, channel, slip_url, receipt_url)')
      .neq('working_status', 'ยกเลิก')
      .order('room_no')

    if (!data) { setLoading(false); return }

    setJobs((data as any[]).map(r => {
      const insts: { status: string; is_final: boolean }[] = r.installments || []
      return {
        id: r.id,
        room_no: r.room_no || '',
        project_id: r.project_id || '',
        project_name: r.projects?.name || r.project_id || '',
        customer_name: r.customer_name || '',
        sales_name: r.sales?.name || '',
        actual_deliver_date: r.actual_deliver_date || null,
        has_plan: insts.length > 0,
        has_overdue: insts.some(i => i.status === 'overdue'),
        all_paid: insts.length > 0 && insts.every(i => i.status === 'paid'),
        paid_count: insts.filter(i => i.status === 'paid').length,
        total_count: insts.length,
      }
    }))
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

  // Auto-open drawer from ?job= param (e.g. navigated from Handover)
  useEffect(() => {
    const jobId = new URLSearchParams(window.location.search).get('job')
    if (jobId) openDrawer(jobId)
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // Click outside jump dropdown
  useEffect(() => {
    function handler(e: MouseEvent) {
      if (jumpRef.current && !jumpRef.current.contains(e.target as Node)) setJumpOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  async function openDrawer(jobId: string) {
    setSelectedJobId(jobId)
    setDrawerLoading(true)
    setDrawerJob(null)
    const { data: raw } = await supabase
      .from('jobs')
      .select('*, projects(name), sales:users!sales_id(name), installments:payments(id, installment_no, installment_name, amount, paid_amount, percentage, status, due_date, paid_date, is_work_trigger, is_final, channel, slip_url, receipt_url)')
      .eq('id', jobId)
      .single()

    if (!raw) { setDrawerLoading(false); return }

    const { data: war } = await supabase
      .from('warranties').select('warranty_end')
      .eq('project_id', raw.project_id).eq('room', raw.room_no).maybeSingle()

    setDrawerJob({
      id: raw.id,
      customer_id: raw.customer_id,
      project_id: raw.project_id,
      project_name: (raw as any).projects?.name || raw.project_id,
      room_no: raw.room_no || '',
      customer_name: raw.customer_name || '',
      customer_type: raw.customer_type || 'B2C',
      revenue_inc_vat: raw.revenue_inc_vat || 0,
      revenue_ex_vat: raw.revenue_ex_vat || 0,
      working_status: raw.working_status || '',
      actual_deliver_date: raw.actual_deliver_date || null,
      sales_name: (raw as any).sales?.name || '',
      payment_plan_type: raw.payment_plan_type || null,
      work_days: raw.work_days || null,
      contract_date: raw.contract_date || null,
      work_start_date: raw.work_start_date || null,
      warranty_end: war?.warranty_end || null,
      quotation1_url: raw.quotation1_url || null,
      quotation2_url: raw.quotation2_url || null,
      id_card_url: raw.id_card_url || null,
      delivery_doc_url: raw.delivery_doc_url || null,
      satisfaction_url: raw.satisfaction_url || null,
      sale_slip_url: raw.sale_slip_url || null,
      sale_receipt_url: raw.sale_receipt_url || null,
      installments: ((raw as any).installments || []).map((p: any) => ({
        id: p.id,
        installment_no: p.installment_no,
        installment_name: p.installment_name,
        amount: p.amount,
        percentage: p.percentage || 0,
        status: p.status || 'pending',
        due_date: p.due_date || null,
        paid_date: p.paid_date || null,
        paid_amount: p.paid_amount ?? null,
        is_work_trigger: !!p.is_work_trigger,
        is_final: !!p.is_final,
        channel: p.channel || null,
        slip_url: p.slip_url || null,
        receipt_url: p.receipt_url || null,
      })),
    })
    setDrawerLoading(false)
  }

  function closeDrawer() {
    setSelectedJobId(null)
    setDrawerJob(null)
    if (returnTo) router.push(returnTo)
  }

  async function handleRefresh() {
    await load()
    if (selectedJobId) await openDrawer(selectedJobId)
  }

  function jumpToProject(pid: string) {
    const el = projectRefs.current[pid]
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' })
    setJumpOpen(false)
  }

  const grouped = useMemo(() => {
    const q = search.toLowerCase().replace(/[-\s]/g, '')
    const visible = q
      ? jobs.filter(j => {
          const room = j.room_no.toLowerCase().replace(/[-\s]/g, '')
          return room.includes(q) || j.customer_name.toLowerCase().includes(search.toLowerCase())
            || j.project_name.toLowerCase().includes(search.toLowerCase())
        })
      : jobs

    const map = new Map<string, { name: string; active: RoomJob[]; done: RoomJob[] }>()
    for (const j of visible) {
      if (!map.has(j.project_id)) map.set(j.project_id, { name: j.project_name, active: [], done: [] })
      const grp = map.get(j.project_id)!
      if (j.actual_deliver_date) grp.done.push(j)
      else grp.active.push(j)
    }
    return Array.from(map.entries())
      .map(([pid, g]) => ({ pid, ...g }))
      .sort((a, b) => b.active.length - a.active.length)
  }, [jobs, search])

  const totalActive = useMemo(() => jobs.filter(j => !j.actual_deliver_date).length, [jobs])

  return (
    <div className="min-h-screen p-4 md:p-6" style={{ background: 'var(--page-bg)' }}>
      {/* Header */}
      <div className="flex items-center gap-3 mb-5 flex-wrap">
        <div className="flex-1">
          <h1 className="text-xl font-bold" style={{ color: 'var(--text-1)' }}>My Deals</h1>
          {!loading && (
            <p className="text-xs mt-0.5" style={{ color: 'var(--text-3)' }}>
              {totalActive} งานที่กำลังดำเนินการ · {grouped.length} โครงการ
            </p>
          )}
        </div>

        {/* Jump to project */}
        <div className="relative" ref={jumpRef}>
          <button onClick={() => setJumpOpen(o => !o)}
            className="flex items-center gap-1.5 px-3 py-2 rounded-[10px] text-sm"
            style={{ background: 'var(--hover-bg)', border: '1px solid var(--divider)', color: 'var(--text-2)' }}>
            <Zap size={13} />
            Jump to project
            <ChevronDown size={12} />
          </button>
          {jumpOpen && (
            <div className="absolute right-0 top-full mt-1 rounded-[11px] shadow-lg z-30 overflow-hidden"
              style={{ background: 'var(--glass-bg)', backdropFilter: 'blur(24px) saturate(180%)', border: '1px solid var(--glass-border)', minWidth: 220, maxWidth: 320 }}>
              <div className="overflow-y-auto" style={{ maxHeight: 280 }}>
                {grouped.map(g => (
                  <button key={g.pid} onClick={() => jumpToProject(g.pid)}
                    className="w-full text-left px-3 py-2 text-sm flex items-center justify-between transition-colors"
                    style={{ color: 'var(--text-1)' }}
                    onMouseEnter={e => (e.currentTarget.style.background = 'var(--hover-bg)')}
                    onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}>
                    <span className="truncate flex-1">{g.name}</span>
                    <span className="text-xs ml-3 flex-shrink-0" style={{ color: 'var(--text-3)' }}>
                      {g.active.length} ห้อง
                    </span>
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Search */}
        <div className="relative">
          <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: 'var(--text-3)' }} />
          <input value={search} onChange={e => setSearch(e.target.value)}
            placeholder='ค้นหา "303", "A333"...'
            className="pl-8 pr-7 py-2 rounded-[10px] text-sm focus:outline-none w-44"
            style={{ background: 'var(--input-bg)', border: '1px solid var(--divider)', color: 'var(--text-1)' }} />
          {search && (
            <button className="absolute right-2 top-1/2 -translate-y-1/2" onClick={() => setSearch('')}>
              <X size={12} style={{ color: 'var(--text-3)' }} />
            </button>
          )}
        </div>
      </div>

      {/* Legend */}
      <div className="flex flex-wrap gap-x-4 gap-y-1.5 mb-6">
        {(Object.entries(STAGE_META) as [ChipStage, typeof STAGE_META[ChipStage]][]).map(([stage, m]) => (
          <span key={stage} className="flex items-center gap-1.5 text-xs" style={{ color: 'var(--text-3)' }}>
            <span style={{ width: 8, height: 8, borderRadius: '50%', background: m.dot, display: 'inline-block', flexShrink: 0 }} />
            {m.label}
          </span>
        ))}
      </div>

      {/* Groups */}
      {loading ? (
        <div className="flex items-center justify-center py-20">
          <p className="text-sm" style={{ color: 'var(--text-3)' }}>กำลังโหลด...</p>
        </div>
      ) : grouped.length === 0 ? (
        <div className="flex items-center justify-center py-20">
          <p className="text-sm" style={{ color: 'var(--text-2)' }}>ไม่พบงาน</p>
        </div>
      ) : (
        <div className="space-y-8">
          {grouped.map(({ pid, name, active, done }) => (
            <div key={pid} ref={el => { projectRefs.current[pid] = el }}>
              {/* Project header */}
              <div className="flex items-center gap-2 mb-3">
                <span className="text-sm font-semibold" style={{ color: 'var(--text-1)' }}>{name}</span>
                <span className="text-xs px-2 py-0.5 rounded-[4px] font-semibold"
                  style={{ background: 'var(--hover-bg)', color: 'var(--text-3)' }}>
                  {active.length} ห้อง
                </span>
                {done.length > 0 && (
                  <span className="text-xs" style={{ color: 'var(--text-3)' }}>· ส่งมอบแล้ว {done.length}</span>
                )}
              </div>

              {/* Active room cards */}
              {active.length > 0 && (
                <div className="flex flex-wrap gap-2">
                  {active.map(j => (
                    <RoomCard key={j.id} job={j} onClick={() => openDrawer(j.id)} />
                  ))}
                </div>
              )}

              {/* Done rooms collapsible */}
              {done.length > 0 && (
                <div className="mt-2">
                  <button
                    className="flex items-center gap-1.5 text-xs py-1"
                    style={{ color: 'var(--text-3)', background: 'none', border: 'none', cursor: 'pointer' }}
                    onClick={() => setDoneExpanded(prev => ({ ...prev, [pid]: !prev[pid] }))}>
                    {doneExpanded[pid] ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
                    ส่งมอบแล้ว {done.length} ห้อง
                  </button>
                  {doneExpanded[pid] && (
                    <div className="flex flex-wrap gap-2 mt-2">
                      {done.map(j => (
                        <RoomCard key={j.id} job={j} onClick={() => openDrawer(j.id)} />
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Drawer loading indicator */}
      {drawerLoading && (
        <>
          <div className="fixed inset-0 z-40" style={{ background: 'rgba(0,0,0,0.30)', backdropFilter: 'blur(6px)', WebkitBackdropFilter: 'blur(6px)' }} onClick={closeDrawer} />
          <div className="fixed inset-0 z-50 flex items-center justify-center">
            <div className="w-full max-w-[460px] max-h-[90vh] flex items-center justify-center rounded-[20px] p-12"
              style={{ background: 'var(--card-bg)', border: '1px solid var(--card-border)' }}>
              <p className="text-sm" style={{ color: 'var(--text-3)' }}>กำลังโหลด...</p>
            </div>
          </div>
        </>
      )}

      {/* Deal Drawer */}
      {drawerJob && !drawerLoading && (
        <DealDrawer job={drawerJob} onClose={closeDrawer} onRefresh={handleRefresh} />
      )}
    </div>
  )
}
