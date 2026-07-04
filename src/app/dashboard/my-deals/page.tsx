'use client'

import { useEffect, useState, useCallback, useMemo, useRef } from 'react'
import { createClient } from '@/lib/supabase/client'
import {
  Search, X, ChevronRight, ChevronDown, Zap,
  CheckCircle2, Circle, Wallet, Package, Wrench, ShoppingCart, AlertTriangle,
} from 'lucide-react'

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
  percentage: number
  status: 'pending' | 'paid' | 'overdue'
  due_date: string | null
  paid_date: string | null
  is_work_trigger: boolean
  is_final: boolean
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
  wait:    { label: 'รอเปิดงาน',       bg: '#eeedfe', color: '#3c3489', border: '#afa9ec', dot: '#7f77dd' },
  collect: { label: 'กำลังเก็บเงิน',   bg: '#faeeda', color: '#633806', border: '#ef9f27', dot: '#ef9f27' },
  ready:   { label: 'รอส่งมอบ',        bg: '#e6f1fb', color: '#0c447c', border: '#85b7eb', dot: '#378add' },
  overdue: { label: 'งวดเกินกำหนด',    bg: '#fcebeb', color: '#501313', border: '#f09595', dot: '#e24b4a' },
  done:    { label: 'ส่งมอบแล้ว',      bg: '#eaf3de', color: '#173404', border: '#97c459', dot: '#639922' },
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
  const [b2bCount, setB2bCount] = useState(3)
  const [b2bPcts, setB2bPcts] = useState([30, 40, 30])
  const [paidDate, setPaidDate] = useState(todayStr())
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
      is_work_trigger: p.trigger,
      is_final: p.final,
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
                      % แต่ละงวด <span className={pctValid ? 'text-green-400' : 'text-red-400'}>(รวม {pctSum}%)</span>
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
                        {p.trigger && <span className="ml-2 text-[10px] px-1.5 py-0.5 rounded bg-indigo-500/15 text-indigo-400">เริ่มงาน</span>}
                        {p.final && <span className="ml-2 text-[10px] px-1.5 py-0.5 rounded bg-green-500/15 text-green-400">สุดท้าย</span>}
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
              <div>
                <label className="text-xs" style={{ color: 'var(--text-2)' }}>วันที่รับเงิน</label>
                <input type="date" value={paidDate} onChange={e => setPaidDate(e.target.value)}
                  className="mt-1 w-full rounded-[8px] px-3 py-2 text-sm focus:outline-none" style={inputStyle} />
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
  const pending = job.installments.filter(i => i.status !== 'paid').sort((a, b) => a.installment_no - b.installment_no)
  const [selected, setSelected] = useState<Installment | null>(pending[0] || null)
  const [paidDate, setPaidDate] = useState(todayStr())
  const [saving, setSaving] = useState(false)

  async function save() {
    if (!selected) return
    setSaving(true)
    if (selected.is_work_trigger && !job.work_start_date) {
      await supabase.from('jobs').update({ work_start_date: paidDate }).eq('id', job.id)
    }
    await supabase.from('payments').update({ status: 'paid', paid_date: paidDate }).eq('id', selected.id)
    setSaving(false); onSaved(); onClose()
  }

  const inputStyle = { background: 'var(--input-bg)', border: '1px solid var(--divider)', color: 'var(--text-1)' }

  return (
    <div className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center p-4" onClick={onClose}>
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
      <div className="relative w-full max-w-sm rounded-[18px] shadow-2xl"
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
            {pending.map(inst => (
              <button key={inst.id} onClick={() => setSelected(inst)}
                className="w-full text-left px-4 py-3 rounded-[11px] border"
                style={selected?.id === inst.id
                  ? { background: 'rgba(99,102,241,0.1)', border: '1px solid rgba(99,102,241,0.4)', color: 'var(--text-1)' }
                  : { background: 'var(--hover-bg)', border: '1px solid var(--divider)', color: 'var(--text-2)' }}>
                <div className="flex justify-between">
                  <span className="text-sm font-semibold">{inst.installment_name}</span>
                  <span className="text-sm font-bold">{fmtBaht(inst.amount)}</span>
                </div>
                <div className="flex gap-2 mt-0.5">
                  {inst.is_work_trigger && <span className="text-[10px] text-indigo-400">เริ่มงาน</span>}
                  {inst.is_final && <span className="text-[10px] text-amber-400">งวดสุดท้าย</span>}
                  {inst.due_date && <span className="text-[10px]" style={{ color: 'var(--text-3)' }}>ครบ {fmtDate(inst.due_date)}</span>}
                </div>
              </button>
            ))}
          </div>
          <div>
            <label className="text-xs" style={{ color: 'var(--text-2)' }}>วันที่รับเงิน</label>
            <input type="date" value={paidDate} onChange={e => setPaidDate(e.target.value)}
              className="mt-1 w-full rounded-[8px] px-3 py-2 text-sm focus:outline-none" style={inputStyle} />
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
  const [deliverDate, setDeliverDate] = useState(todayStr())
  const [warrantyMonths, setWarrantyMonths] = useState(12)
  const [saving, setSaving] = useState(false)
  const finalInst = job.installments.find(i => i.is_final && i.status !== 'paid') || null
  const [markFinalPaid, setMarkFinalPaid] = useState(!!finalInst)

  const inputStyle = { background: 'var(--input-bg)', border: '1px solid var(--divider)', color: 'var(--text-1)' }
  const btnActive = { background: 'var(--accent)', color: '#fff', border: '1px solid var(--accent)' }
  const btnIdle = { background: 'var(--hover-bg)', border: '1px solid var(--divider)', color: 'var(--text-2)' }

  async function save() {
    setSaving(true)
    const wEnd = new Date(deliverDate)
    wEnd.setMonth(wEnd.getMonth() + warrantyMonths)
    const wEndStr = `${wEnd.getFullYear()}-${String(wEnd.getMonth() + 1).padStart(2, '0')}-${String(wEnd.getDate()).padStart(2, '0')}`
    await supabase.from('jobs').update({ actual_deliver_date: deliverDate, working_status: 'ส่งมอบแล้ว' }).eq('id', job.id)
    if (markFinalPaid && finalInst) {
      await supabase.from('payments').update({ status: 'paid', paid_date: deliverDate }).eq('id', finalInst.id)
    }
    await supabase.from('handovers').upsert({
      job_id: job.id, customer_id: job.customer_id, project_id: job.project_id,
      room: job.room_no, delivery_date: deliverDate, work_status: 'ส่งมอบแล้ว',
    }, { onConflict: 'job_id' })
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
            <div className="rounded-[11px] p-3" style={{ background: 'var(--hover-bg)' }}>
              <label className="flex items-center gap-3 cursor-pointer">
                <input type="checkbox" checked={markFinalPaid} onChange={e => setMarkFinalPaid(e.target.checked)} className="w-4 h-4 rounded" />
                <div>
                  <p className="text-sm font-semibold" style={{ color: 'var(--text-1)' }}>รับเงินงวดสุดท้าย</p>
                  <p className="text-xs mt-0.5" style={{ color: 'var(--text-2)' }}>{finalInst.installment_name} — {fmtBaht(finalInst.amount)}</p>
                </div>
              </label>
            </div>
          )}
          <div className="rounded-[11px] p-3" style={{ background: 'rgba(99,102,241,0.05)', border: '1px solid var(--divider)' }}>
            <p className="text-xs font-semibold" style={{ color: 'var(--text-2)' }}>ประกันรันอัตโนมัติ {warrantyMonths} เดือน</p>
            <p className="text-xs mt-0.5" style={{ color: 'var(--text-3)' }}>เริ่ม {deliverDate}</p>
          </div>
          <button onClick={save} disabled={saving} className="w-full py-3 rounded-[11px] font-semibold text-sm text-white"
            style={{ background: saving ? '#999' : '#059669' }}>
            {saving ? 'กำลังบันทึก...' : 'ยืนยันส่งมอบ'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Deal Drawer (right panel) ─────────────────────────────
function DealDrawer({ job, onClose, onRefresh }: { job: FullJob; onClose: () => void; onRefresh: () => void }) {
  const [actionModal, setActionModal] = useState<'setup' | 'pay' | 'handover' | null>(null)
  const [instExpanded, setInstExpanded] = useState(false)
  const { hasPlan, finalPaid, delivered, paidCount, totalCount, pendingInstallments, activeStage } = getFullStageInfo(job)
  const revenue = job.revenue_inc_vat || job.revenue_ex_vat || 0
  const overdueCount = job.installments.filter(i => i.status === 'overdue').length

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
      <div className="fixed inset-0 z-40 bg-black/40" onClick={onClose} />
      {/* Drawer */}
      <div className="fixed right-0 top-0 bottom-0 z-50 w-full max-w-sm shadow-2xl flex flex-col"
        style={{ background: 'var(--card-bg)', borderLeft: '1px solid var(--card-border)' }}>
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4" style={{ borderBottom: '1px solid var(--divider)' }}>
          <div>
            <div className="flex items-center gap-2">
              <span className="px-2.5 py-1 rounded-[7px] font-bold text-xs text-white"
                style={{ background: delivered ? '#059669' : activeStage === 3 ? '#f59e0b' : activeStage === 4 ? '#378add' : '#6366f1' }}>
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
          <div className="rounded-[12px] p-4 flex items-center justify-between"
            style={{ background: 'var(--hover-bg)' }}>
            <div>
              <p className="text-xs" style={{ color: 'var(--text-3)' }}>มูลค่างาน (inc. VAT)</p>
              <p className="text-xl font-bold mt-0.5" style={{ color: 'var(--text-1)' }}>{fmtBaht(revenue)}</p>
            </div>
            {hasPlan && totalCount > 0 && (
              <div className="text-right">
                <p className="text-sm font-semibold" style={{ color: paidCount === totalCount ? '#4ade80' : '#f59e0b' }}>
                  {paidCount}/{totalCount} งวด
                </p>
                <p className="text-xs mt-0.5" style={{ color: 'var(--text-3)' }}>
                  เก็บแล้ว {fmtBaht(job.installments.filter(i => i.status === 'paid').reduce((s, i) => s + i.amount, 0))}
                </p>
                {overdueCount > 0 && (
                  <p className="text-xs text-red-400 flex items-center justify-end gap-0.5 mt-0.5">
                    <AlertTriangle size={10} /> {overdueCount} งวดเกิน
                  </p>
                )}
              </div>
            )}
          </div>

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
                        background: s.done ? '#059669' : isActive ? 'rgba(99,102,241,0.15)' : 'var(--hover-bg)',
                        border: s.done ? '1.5px solid #059669' : isActive ? '1.5px solid #6366f1' : '1.5px solid var(--divider)',
                      }}>
                      {s.done
                        ? <CheckCircle2 size={14} className="text-white" />
                        : <Icon size={13} style={{ color: isActive ? '#6366f1' : 'var(--text-3)' }} />}
                    </div>
                    <span className="text-[9px] font-medium whitespace-nowrap"
                      style={{ color: s.done ? '#059669' : isActive ? '#6366f1' : 'var(--text-3)' }}>
                      {s.label}
                    </span>
                  </div>
                  {idx < stages.length - 1 && (
                    <div className="flex-1 h-[1.5px] mx-1 mb-4"
                      style={{ background: s.done ? '#059669' : 'var(--divider)' }} />
                  )}
                </div>
              )
            })}
          </div>

          {/* Installments */}
          {hasPlan && (
            <div className="rounded-[12px] overflow-hidden" style={{ border: '1px solid var(--divider)' }}>
              <button className="w-full flex items-center justify-between px-4 py-2.5"
                style={{ color: 'var(--text-3)', background: 'var(--hover-bg)' }}
                onClick={() => setInstExpanded(e => !e)}>
                <span className="text-xs">งวดชำระเงิน</span>
                {instExpanded ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
              </button>
              {instExpanded && (
                <div className="divide-y" style={{ borderColor: 'var(--divider)' }}>
                  {job.installments.sort((a, b) => a.installment_no - b.installment_no).map(inst => (
                    <div key={inst.id} className="flex items-center gap-3 px-4 py-2.5">
                      <div className="flex-shrink-0">
                        {inst.status === 'paid'
                          ? <CheckCircle2 size={14} className="text-green-400" />
                          : <Circle size={14} style={{ color: 'var(--text-3)' }} />}
                      </div>
                      <div className="flex-1 min-w-0">
                        <span className="text-xs" style={{ color: 'var(--text-1)' }}>{inst.installment_name}</span>
                        {inst.is_final && <span className="ml-1.5 text-[9px] px-1 rounded bg-amber-500/15 text-amber-400">สุดท้าย</span>}
                      </div>
                      <div className="text-right">
                        <span className="text-xs font-semibold" style={{ color: inst.status === 'paid' ? '#4ade80' : 'var(--text-1)' }}>
                          {fmtBaht(inst.amount)}
                        </span>
                        {inst.paid_date && <p className="text-[10px]" style={{ color: 'var(--text-3)' }}>{fmtDate(inst.paid_date)}</p>}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Actions */}
        <div className="p-4" style={{ borderTop: '1px solid var(--divider)' }}>
          {delivered ? (
            <div className="rounded-[12px] p-3 text-center"
              style={{ background: 'rgba(5,150,105,0.08)', border: '1px solid rgba(5,150,105,0.2)' }}>
              <p className="text-sm font-semibold text-green-400">ส่งมอบแล้ว {fmtDate(job.actual_deliver_date)}</p>
              {job.warranty_end && (
                <p className="text-xs mt-0.5" style={{ color: 'var(--text-3)' }}>ประกันหมด {fmtDate(job.warranty_end)}</p>
              )}
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
                  style={{ background: '#059669' }}>
                  ส่งมอบ
                </button>
              )}
            </div>
          ) : (
            <button onClick={() => setActionModal('handover')}
              className="w-full py-3 rounded-[12px] font-semibold text-sm text-white"
              style={{ background: '#059669' }}>
              + บันทึกส่งมอบ
            </button>
          )}
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

  return (
    <button onClick={onClick}
      className="text-left rounded-[10px] p-3 transition-all hover:scale-[1.02]"
      style={{
        background: isDone ? 'var(--hover-bg)' : 'var(--card-bg)',
        border: `1px solid ${isDone ? 'var(--divider)' : 'var(--card-border)'}`,
        width: 140,
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
      {/* Customer */}
      <p className="text-[11px] truncate" style={{ color: 'var(--text-2)' }}>{job.customer_name || '—'}</p>
      {/* Sales + progress */}
      <div className="flex items-center justify-between mt-1">
        <p className="text-[10px]" style={{ color: 'var(--text-3)' }}>{job.sales_name || ''}</p>
        {job.has_plan && job.total_count > 0 && (
          <p className="text-[10px] font-semibold" style={{ color: job.paid_count === job.total_count ? '#4ade80' : '#f59e0b' }}>
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

  const load = useCallback(async () => {
    setLoading(true)
    const { data } = await supabase
      .from('jobs')
      .select('id, room_no, project_id, customer_name, actual_deliver_date, projects(name), sales:users!sales_id(name), installments:payments(status, is_final)')
      .neq('working_status', 'ยกเลิก')
      .order('order_date', { ascending: false })

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
      .select('*, projects(name), sales:users!sales_id(name), installments:payments(*)')
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
      installments: ((raw as any).installments || []).map((p: any) => ({
        id: p.id,
        installment_no: p.installment_no,
        installment_name: p.installment_name,
        amount: p.amount,
        percentage: p.percentage || 0,
        status: p.status || 'pending',
        due_date: p.due_date || null,
        paid_date: p.paid_date || null,
        is_work_trigger: !!p.is_work_trigger,
        is_final: !!p.is_final,
      })),
    })
    setDrawerLoading(false)
  }

  function closeDrawer() {
    setSelectedJobId(null)
    setDrawerJob(null)
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
            <div className="absolute right-0 top-full mt-1 w-56 rounded-[12px] shadow-xl z-30 py-1 overflow-hidden"
              style={{ background: 'var(--card-bg)', border: '1px solid var(--card-border)' }}>
              {grouped.map(g => (
                <button key={g.pid} onClick={() => jumpToProject(g.pid)}
                  className="w-full text-left px-4 py-2.5 text-sm hover:bg-[var(--hover-bg)] flex items-center justify-between"
                  style={{ color: 'var(--text-1)' }}>
                  <span className="truncate flex-1">{g.name}</span>
                  <span className="text-xs ml-2 flex-shrink-0" style={{ color: 'var(--text-3)' }}>
                    {g.active.length} ห้อง
                  </span>
                </button>
              ))}
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
                <span className="text-xs px-2 py-0.5 rounded-full font-medium"
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
          <div className="fixed inset-0 z-40 bg-black/40" onClick={closeDrawer} />
          <div className="fixed right-0 top-0 bottom-0 z-50 w-full max-w-sm flex items-center justify-center"
            style={{ background: 'var(--card-bg)', borderLeft: '1px solid var(--card-border)' }}>
            <p className="text-sm" style={{ color: 'var(--text-3)' }}>กำลังโหลด...</p>
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
