'use client'

import { useEffect, useState, useCallback, useMemo, useRef } from 'react'
import { createClient } from '@/lib/supabase/client'
import {
  Search, X, CheckCircle2, Circle, ChevronDown, ChevronUp,
  Wallet, Package, Wrench, ShoppingCart, AlertTriangle,
} from 'lucide-react'

// ─── Types ────────────────────────────────────────────────
type ClientType = 'B2C' | 'B2B'
type PlanType = 'A' | 'B' | 'C' | '2' | '3' | '4' | '5' | '6'

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
  file_urls: string[]
}

interface Job {
  id: string
  customer_id: string | null
  project_id: string
  project_name: string
  room_no: string
  customer_name: string
  customer_type: ClientType
  work_type: string
  revenue_inc_vat: number
  revenue_ex_vat: number
  working_status: string
  actual_deliver_date: string | null
  order_date: string | null
  sales_id: string
  sales_name: string
  payment_plan_type: PlanType | null
  work_days: number | null
  contract_date: string | null
  work_start_date: string | null
  delivery_doc_url: string | null
  installments: Installment[]
  warranty_end: string | null
}

// ─── Helpers ──────────────────────────────────────────────
const fmtBaht = (n: number) => n ? '฿' + Math.round(n).toLocaleString('th-TH') : '฿0'
const fmtDate = (d: string | null) => d
  ? new Date(d).toLocaleDateString('th-TH', { day: '2-digit', month: 'short', year: '2-digit' })
  : '—'
const today = () => {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function roomSearch(room: string, query: string) {
  if (!query) return true
  const q = query.toLowerCase().replace(/[\-\s]/g, '')
  const r = room.toLowerCase().replace(/[\-\s]/g, '')
  return r.includes(q)
}

// Stage: 1=ขาย, 2=เปิดงาน(plan set), 3=เก็บเงิน(all paid), 4=ส่งมอบ
function getStageInfo(job: Job) {
  const hasPlan = job.installments.length > 0
  const finalPaid = job.installments.some(i => i.is_final && i.status === 'paid')
  const delivered = !!job.actual_deliver_date
  const paidCount = job.installments.filter(i => i.status === 'paid').length
  const totalCount = job.installments.length
  const pendingInstallments = job.installments.filter(i => i.status !== 'paid').sort((a, b) => a.installment_no - b.installment_no)

  let activeStage = 1
  if (delivered) activeStage = 4
  else if (finalPaid) activeStage = 4
  else if (hasPlan) activeStage = 3
  else activeStage = 2

  return { hasPlan, finalPaid, delivered, paidCount, totalCount, pendingInstallments, activeStage }
}

// ─── Plan helpers (same as payments page) ─────────────────
const B2C_PLANS = [
  { value: 'A', label: 'แบบ A — 100% ครั้งเดียว', desc: '1 งวด ชำระเต็มจำนวน' },
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
function SetupAndPayModal({ job, onClose, onSaved }: {
  job: Job; onClose: () => void; onSaved: () => void
}) {
  const supabase = createClient()
  const [clientType, setClientType] = useState<ClientType>(job.customer_type || 'B2C')
  const [plan, setPlan] = useState<string>(job.payment_plan_type || 'B')
  const [workDays, setWorkDays] = useState(job.work_days || 45)
  const [depositAmount, setDepositAmount] = useState(0)
  const [b2bCount, setB2bCount] = useState(3)
  const [b2bPcts, setB2bPcts] = useState([30, 40, 30])
  const [paidDate, setPaidDate] = useState(today())
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

  const firstInstallment = preview[0]

  async function save() {
    if (clientType === 'B2B' && !pctValid) return
    setSaving(true)
    await supabase.from('jobs').update({
      customer_type: clientType,
      payment_plan_type: clientType === 'B2C' ? plan : String(b2bCount),
      work_days: workDays,
      work_start_date: firstInstallment?.trigger ? paidDate : null,
    }).eq('id', job.id)

    await supabase.from('payments').delete().eq('job_id', job.id)
    const rows = preview.map((p, i) => ({
      id: `PAY-${job.id}-${i + 1}`,
      job_id: job.id,
      customer_id: job.customer_id || null,
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
    }))
    await supabase.from('payments').insert(rows)
    setSaving(false); onSaved(); onClose()
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4" onClick={onClose}>
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
      <div className="relative w-full max-w-md rounded-[18px] shadow-2xl max-h-[90vh] overflow-y-auto"
        style={{ background: 'var(--card-bg)', border: '1px solid var(--card-border)' }}
        onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div className="flex items-center justify-between p-5" style={{ borderBottom: '1px solid var(--divider)' }}>
          <div>
            <h3 className="font-semibold" style={{ color: 'var(--text-1)' }}>
              {step === 'plan' ? 'ตั้งแผนชำระเงิน' : 'บันทึกรับเงินงวดแรก'}
            </h3>
            <p className="text-xs mt-0.5" style={{ color: 'var(--text-2)' }}>
              {job.room_no} · {job.project_name}
            </p>
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
                      className="py-2 rounded-[11px] text-sm font-semibold border transition-all"
                      style={clientType === t
                        ? { background: 'var(--accent)', color: '#fff', border: '1px solid var(--accent)' }
                        : { background: 'var(--hover-bg)', border: '1px solid var(--divider)', color: 'var(--text-2)' }}>
                      {t}
                    </button>
                  ))}
                </div>
              </div>

              {clientType === 'B2C' && (
                <div>
                  <p className="text-xs mb-2" style={{ color: 'var(--text-2)' }}>รูปแบบการชำระ</p>
                  <div className="space-y-2">
                    {B2C_PLANS.map(p => (
                      <button key={p.value} onClick={() => setPlan(p.value)}
                        className="w-full text-left px-4 py-3 rounded-[11px] border transition-all"
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
                      <label className="text-xs" style={{ color: 'var(--text-2)' }}>ยอดมัดจำจองสิทธิ์ (บาท)</label>
                      <input type="number" value={depositAmount || ''} onChange={e => setDepositAmount(Number(e.target.value))}
                        placeholder={`เช่น ${Math.round(total * 0.1).toLocaleString()}`}
                        className="mt-1 w-full rounded-[8px] px-3 py-2 text-sm focus:outline-none"
                        style={{ background: 'var(--input-bg)', border: '1px solid var(--divider)', color: 'var(--text-1)' }} />
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
                          className="flex-1 py-2 rounded-[11px] text-sm font-semibold border transition-all"
                          style={b2bCount === n
                            ? { background: 'var(--accent)', color: '#fff', border: '1px solid var(--accent)' }
                            : { background: 'var(--hover-bg)', border: '1px solid var(--divider)', color: 'var(--text-2)' }}>
                          {n}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div className="space-y-2">
                    <p className="text-xs" style={{ color: 'var(--text-2)' }}>
                      % แต่ละงวด <span className={Math.abs(pctSum - 100) < 0.01 ? 'text-green-400' : 'text-red-400'}>(รวม {pctSum}%)</span>
                    </p>
                    {b2bPcts.slice(0, b2bCount).map((pct, i) => (
                      <div key={i} className="flex items-center gap-2">
                        <span className="text-xs w-14" style={{ color: 'var(--text-2)' }}>งวดที่ {i + 1}</span>
                        <input type="number" value={pct}
                          onChange={e => { const np = [...b2bPcts]; np[i] = Number(e.target.value); setB2bPcts(np) }}
                          className="w-16 rounded-[8px] px-2 py-1.5 text-sm text-center focus:outline-none"
                          style={{ background: 'var(--input-bg)', border: '1px solid var(--divider)', color: 'var(--text-1)' }} />
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
                      className="flex-1 py-1.5 rounded-[8px] text-xs border transition-all"
                      style={workDays === d
                        ? { background: 'var(--accent)', color: '#fff', border: '1px solid var(--accent)' }
                        : { background: 'var(--hover-bg)', border: '1px solid var(--divider)', color: 'var(--text-2)' }}>
                      {d} วัน
                    </button>
                  ))}
                </div>
              </div>

              {/* Preview */}
              <div>
                <p className="text-xs mb-2" style={{ color: 'var(--text-2)' }}>ตัวอย่างงวด</p>
                <div className="space-y-1.5">
                  {preview.map(p => (
                    <div key={p.no} className="flex justify-between items-center px-3 py-2 rounded-[8px]"
                      style={{ background: 'var(--hover-bg)' }}>
                      <div>
                        <span className="text-xs font-semibold" style={{ color: 'var(--text-1)' }}>{p.name}</span>
                        {p.trigger && <span className="ml-2 text-[10px] px-1.5 py-0.5 rounded bg-indigo-500/15 text-indigo-400">เริ่มงาน</span>}
                        {p.final && <span className="ml-2 text-[10px] px-1.5 py-0.5 rounded bg-green-500/15 text-green-400">งวดสุดท้าย</span>}
                      </div>
                      <span className="text-xs font-bold" style={{ color: 'var(--text-1)' }}>{fmtBaht(p.amount)}</span>
                    </div>
                  ))}
                </div>
              </div>

              <button onClick={() => setStep('pay')}
                className="w-full py-3 rounded-[11px] font-semibold text-sm text-white"
                style={{ background: 'var(--accent)' }}>
                ถัดไป → บันทึกงวดแรก
              </button>
            </>
          ) : (
            <>
              {/* Pay step */}
              <div className="rounded-[11px] p-4" style={{ background: 'var(--hover-bg)' }}>
                <p className="text-xs mb-1" style={{ color: 'var(--text-2)' }}>งวดที่ 1 — {firstInstallment?.name}</p>
                <p className="text-2xl font-bold" style={{ color: 'var(--text-1)' }}>{fmtBaht(firstInstallment?.amount || 0)}</p>
                {firstInstallment?.trigger && (
                  <p className="text-xs mt-1 text-indigo-400">งวดนี้เป็นงวดเริ่มงาน</p>
                )}
              </div>

              <div>
                <label className="text-xs" style={{ color: 'var(--text-2)' }}>วันที่รับเงิน</label>
                <input type="date" value={paidDate} onChange={e => setPaidDate(e.target.value)}
                  className="mt-1 w-full rounded-[8px] px-3 py-2 text-sm focus:outline-none"
                  style={{ background: 'var(--input-bg)', border: '1px solid var(--divider)', color: 'var(--text-1)' }} />
              </div>

              <div className="flex gap-2">
                <button onClick={() => setStep('plan')}
                  className="flex-1 py-2.5 rounded-[11px] text-sm border"
                  style={{ border: '1px solid var(--divider)', color: 'var(--text-2)' }}>
                  ← ย้อนกลับ
                </button>
                <button onClick={save} disabled={saving}
                  className="flex-1 py-2.5 rounded-[11px] font-semibold text-sm text-white"
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
function PayModal({ job, onClose, onSaved }: {
  job: Job; onClose: () => void; onSaved: () => void
}) {
  const supabase = createClient()
  const pending = job.installments.filter(i => i.status !== 'paid').sort((a, b) => a.installment_no - b.installment_no)
  const [selected, setSelected] = useState<Installment | null>(pending[0] || null)
  const [paidDate, setPaidDate] = useState(today())
  const [saving, setSaving] = useState(false)

  async function save() {
    if (!selected) return
    setSaving(true)
    const updates: Record<string, unknown> = { status: 'paid', paid_date: paidDate }
    if (selected.is_work_trigger && !job.work_start_date) {
      await supabase.from('jobs').update({ work_start_date: paidDate }).eq('id', job.id)
    }
    await supabase.from('payments').update(updates).eq('id', selected.id)
    setSaving(false); onSaved(); onClose()
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4" onClick={onClose}>
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
          <div>
            <p className="text-xs mb-2" style={{ color: 'var(--text-2)' }}>เลือกงวด</p>
            <div className="space-y-2">
              {pending.map(inst => (
                <button key={inst.id} onClick={() => setSelected(inst)}
                  className="w-full text-left px-4 py-3 rounded-[11px] border transition-all"
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
          </div>
          <div>
            <label className="text-xs" style={{ color: 'var(--text-2)' }}>วันที่รับเงิน</label>
            <input type="date" value={paidDate} onChange={e => setPaidDate(e.target.value)}
              className="mt-1 w-full rounded-[8px] px-3 py-2 text-sm focus:outline-none"
              style={{ background: 'var(--input-bg)', border: '1px solid var(--divider)', color: 'var(--text-1)' }} />
          </div>
          <button onClick={save} disabled={saving || !selected}
            className="w-full py-3 rounded-[11px] font-semibold text-sm text-white"
            style={{ background: saving ? '#999' : 'var(--accent)' }}>
            {saving ? 'กำลังบันทึก...' : `บันทึกรับเงิน ${selected ? fmtBaht(selected.amount) : ''}`}
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Handover Modal ────────────────────────────────────────
function HandoverModal({ job, onClose, onSaved }: {
  job: Job; onClose: () => void; onSaved: () => void
}) {
  const supabase = createClient()
  const [deliverDate, setDeliverDate] = useState(today())
  const [warrantyMonths, setWarrantyMonths] = useState(12)
  const [saving, setSaving] = useState(false)
  const finalInst = job.installments.find(i => i.is_final && i.status !== 'paid') || null
  const [markFinalPaid, setMarkFinalPaid] = useState(!!finalInst)

  async function save() {
    setSaving(true)
    // Compute warranty end
    const wStart = new Date(deliverDate)
    const wEnd = new Date(wStart)
    wEnd.setMonth(wEnd.getMonth() + warrantyMonths)
    const wEndStr = `${wEnd.getFullYear()}-${String(wEnd.getMonth() + 1).padStart(2, '0')}-${String(wEnd.getDate()).padStart(2, '0')}`

    // Update job
    await supabase.from('jobs').update({
      actual_deliver_date: deliverDate,
      working_status: 'ส่งมอบแล้ว',
    }).eq('id', job.id)

    // Mark final payment paid
    if (markFinalPaid && finalInst) {
      await supabase.from('payments').update({ status: 'paid', paid_date: deliverDate }).eq('id', finalInst.id)
    }

    // Insert or update handover record
    await supabase.from('handovers').upsert({
      job_id: job.id,
      customer_id: job.customer_id,
      project_id: job.project_id,
      room: job.room_no,
      delivery_date: deliverDate,
      work_status: 'ส่งมอบแล้ว',
    }, { onConflict: 'job_id' })

    // Auto-create warranty
    await supabase.from('warranties').upsert({
      id: `WAR-${job.id}`,
      customer_id: job.customer_id,
      project_id: job.project_id,
      room: job.room_no,
      handover_date: deliverDate,
      warranty_start: deliverDate,
      warranty_end: wEndStr,
      warranty_months: warrantyMonths,
      status: 'active',
    }, { onConflict: 'id' })

    setSaving(false); onSaved(); onClose()
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4" onClick={onClose}>
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
              className="mt-1 w-full rounded-[8px] px-3 py-2 text-sm focus:outline-none"
              style={{ background: 'var(--input-bg)', border: '1px solid var(--divider)', color: 'var(--text-1)' }} />
          </div>

          <div>
            <label className="text-xs" style={{ color: 'var(--text-2)' }}>ระยะประกัน (เดือน)</label>
            <div className="flex gap-2 mt-1">
              {[6, 12, 24].map(m => (
                <button key={m} onClick={() => setWarrantyMonths(m)}
                  className="flex-1 py-2 rounded-[8px] text-xs border font-semibold transition-all"
                  style={warrantyMonths === m
                    ? { background: 'var(--accent)', color: '#fff', border: '1px solid var(--accent)' }
                    : { background: 'var(--hover-bg)', border: '1px solid var(--divider)', color: 'var(--text-2)' }}>
                  {m} เดือน
                </button>
              ))}
            </div>
          </div>

          {finalInst && (
            <div className="rounded-[11px] p-3" style={{ background: 'var(--hover-bg)' }}>
              <label className="flex items-center gap-3 cursor-pointer">
                <input type="checkbox" checked={markFinalPaid} onChange={e => setMarkFinalPaid(e.target.checked)}
                  className="w-4 h-4 rounded" />
                <div>
                  <p className="text-sm font-semibold" style={{ color: 'var(--text-1)' }}>รับเงินงวดสุดท้าย</p>
                  <p className="text-xs mt-0.5" style={{ color: 'var(--text-2)' }}>
                    {finalInst.installment_name} — {fmtBaht(finalInst.amount)}
                  </p>
                </div>
              </label>
            </div>
          )}

          <div className="rounded-[11px] p-3 border" style={{ border: '1px solid var(--divider)', background: 'rgba(99,102,241,0.05)' }}>
            <p className="text-xs font-semibold" style={{ color: 'var(--text-2)' }}>ประกันจะรันอัตโนมัติ</p>
            <p className="text-xs mt-0.5" style={{ color: 'var(--text-3)' }}>
              {deliverDate} → หมดประกัน {warrantyMonths} เดือน
            </p>
          </div>

          <button onClick={save} disabled={saving}
            className="w-full py-3 rounded-[11px] font-semibold text-sm text-white"
            style={{ background: saving ? '#999' : '#059669' }}>
            {saving ? 'กำลังบันทึก...' : 'ยืนยันส่งมอบ'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Installment Row (expanded view) ──────────────────────
function InstallmentRows({ installments }: { installments: Installment[] }) {
  return (
    <div className="px-4 pb-3 space-y-1.5">
      {installments.sort((a, b) => a.installment_no - b.installment_no).map(inst => (
        <div key={inst.id} className="flex items-center gap-3 py-1.5 px-3 rounded-[8px]"
          style={{ background: 'var(--hover-bg)' }}>
          <div className="flex-shrink-0">
            {inst.status === 'paid'
              ? <CheckCircle2 size={14} className="text-green-400" />
              : <Circle size={14} style={{ color: 'var(--text-3)' }} />}
          </div>
          <div className="flex-1 min-w-0">
            <span className="text-xs font-medium truncate" style={{ color: 'var(--text-1)' }}>{inst.installment_name}</span>
            {inst.is_work_trigger && <span className="ml-1.5 text-[9px] px-1 rounded bg-indigo-500/15 text-indigo-400">เริ่มงาน</span>}
            {inst.is_final && <span className="ml-1.5 text-[9px] px-1 rounded bg-amber-500/15 text-amber-400">สุดท้าย</span>}
          </div>
          <div className="text-right flex-shrink-0">
            <span className="text-xs font-semibold" style={{ color: inst.status === 'paid' ? '#4ade80' : 'var(--text-1)' }}>
              {fmtBaht(inst.amount)}
            </span>
            {inst.paid_date && <p className="text-[10px]" style={{ color: 'var(--text-3)' }}>{fmtDate(inst.paid_date)}</p>}
          </div>
        </div>
      ))}
    </div>
  )
}

// ─── Job Card ──────────────────────────────────────────────
function JobCard({ job, onRefresh }: { job: Job; onRefresh: () => void }) {
  const [expanded, setExpanded] = useState(false)
  const [modal, setModal] = useState<'setup' | 'pay' | 'handover' | null>(null)
  const { hasPlan, finalPaid, delivered, paidCount, totalCount, pendingInstallments, activeStage } = getStageInfo(job)
  const revenue = job.revenue_inc_vat || job.revenue_ex_vat || 0

  const stageColor = ['', 'var(--text-3)', '#6366f1', '#f59e0b', '#10b981']
  const stages = [
    { label: 'ขาย', icon: ShoppingCart, done: true, active: activeStage === 1 },
    { label: 'เปิดงาน', icon: Wrench, done: hasPlan, active: activeStage === 2 },
    { label: 'เก็บเงิน', icon: Wallet, done: finalPaid, active: activeStage === 3 },
    { label: 'ส่งมอบ', icon: Package, done: delivered, active: activeStage === 4 },
  ]

  const overdueCount = job.installments.filter(i => i.status === 'overdue').length

  return (
    <>
      <div className="rounded-[14px] overflow-hidden" style={{ background: 'var(--card-bg)', border: '1px solid var(--card-border)' }}>
        {/* Card Header */}
        <div className="flex items-start gap-3 p-4 pb-3">
          <div className="flex-shrink-0 mt-0.5">
            <div className="px-2.5 py-1 rounded-[8px] font-bold text-sm text-white"
              style={{ background: stageColor[activeStage] }}>
              {job.room_no}
            </div>
          </div>
          <div className="flex-1 min-w-0">
            <p className="font-semibold text-sm truncate" style={{ color: 'var(--text-1)' }}>{job.project_name}</p>
            <p className="text-xs mt-0.5" style={{ color: 'var(--text-3)' }}>{job.customer_name}</p>
          </div>
          <div className="text-right flex-shrink-0">
            <p className="font-bold text-sm" style={{ color: 'var(--text-1)' }}>{fmtBaht(revenue)}</p>
            {hasPlan && totalCount > 0 && (
              <p className="text-xs mt-0.5" style={{ color: paidCount === totalCount ? '#4ade80' : '#f59e0b' }}>
                {paidCount}/{totalCount} งวด
              </p>
            )}
            {overdueCount > 0 && (
              <p className="text-[10px] text-red-400 flex items-center justify-end gap-0.5 mt-0.5">
                <AlertTriangle size={10} /> {overdueCount} งวดเกิน
              </p>
            )}
          </div>
        </div>

        {/* Stage Bar */}
        <div className="px-4 pb-3">
          <div className="flex items-center">
            {stages.map((s, idx) => {
              const Icon = s.icon
              return (
                <div key={s.label} className="flex items-center flex-1">
                  <div className="flex flex-col items-center gap-0.5">
                    <div className="w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0"
                      style={{
                        background: s.done ? '#10b981' : s.active ? 'rgba(99,102,241,0.15)' : 'var(--hover-bg)',
                        border: s.done ? '1.5px solid #10b981' : s.active ? '1.5px solid #6366f1' : '1.5px solid var(--divider)',
                      }}>
                      {s.done
                        ? <CheckCircle2 size={13} className="text-white" />
                        : <Icon size={12} style={{ color: s.active ? '#6366f1' : 'var(--text-3)' }} />}
                    </div>
                    <span className="text-[9px] font-medium whitespace-nowrap"
                      style={{ color: s.done ? '#10b981' : s.active ? '#6366f1' : 'var(--text-3)' }}>
                      {s.label}
                    </span>
                  </div>
                  {idx < stages.length - 1 && (
                    <div className="flex-1 h-[1.5px] mx-1 mb-3"
                      style={{ background: s.done ? '#10b981' : 'var(--divider)' }} />
                  )}
                </div>
              )
            })}
          </div>
        </div>

        {/* Expand installments */}
        {hasPlan && (
          <button className="w-full flex items-center justify-between px-4 py-2"
            style={{ borderTop: '1px solid var(--divider)', color: 'var(--text-3)' }}
            onClick={() => setExpanded(e => !e)}>
            <span className="text-xs">งวดชำระเงิน</span>
            {expanded ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
          </button>
        )}
        {expanded && <InstallmentRows installments={job.installments} />}

        {/* Actions */}
        {!delivered && (
          <div className="flex gap-2 px-4 py-3" style={{ borderTop: hasPlan ? 'none' : '1px solid var(--divider)', background: 'var(--hover-bg)' }}>
            {!hasPlan ? (
              <button onClick={() => setModal('setup')}
                className="flex-1 py-2.5 rounded-[10px] text-sm font-semibold text-white"
                style={{ background: 'var(--accent)' }}>
                + ตั้งแผน & รับเงินงวดแรก
              </button>
            ) : pendingInstallments.length > 0 ? (
              <>
                <button onClick={() => setModal('pay')}
                  className="flex-1 py-2.5 rounded-[10px] text-sm font-semibold text-white"
                  style={{ background: 'var(--accent)' }}>
                  + บันทึกรับเงิน
                </button>
                {finalPaid && (
                  <button onClick={() => setModal('handover')}
                    className="flex-1 py-2.5 rounded-[10px] text-sm font-semibold"
                    style={{ background: '#059669', color: '#fff' }}>
                    ส่งมอบ
                  </button>
                )}
              </>
            ) : (
              <button onClick={() => setModal('handover')}
                className="flex-1 py-2.5 rounded-[10px] text-sm font-semibold"
                style={{ background: '#059669', color: '#fff' }}>
                + บันทึกส่งมอบ
              </button>
            )}
          </div>
        )}

        {delivered && (
          <div className="px-4 py-3 text-center" style={{ borderTop: '1px solid var(--divider)', background: 'rgba(16,185,129,0.05)' }}>
            <p className="text-xs text-green-400 font-semibold">ส่งมอบแล้ว {fmtDate(job.actual_deliver_date)}</p>
            {job.warranty_end && (
              <p className="text-[10px] mt-0.5" style={{ color: 'var(--text-3)' }}>
                ประกันหมด {fmtDate(job.warranty_end)}
              </p>
            )}
          </div>
        )}
      </div>

      {modal === 'setup' && <SetupAndPayModal job={job} onClose={() => setModal(null)} onSaved={onRefresh} />}
      {modal === 'pay' && <PayModal job={job} onClose={() => setModal(null)} onSaved={onRefresh} />}
      {modal === 'handover' && <HandoverModal job={job} onClose={() => setModal(null)} onSaved={onRefresh} />}
    </>
  )
}

// ─── Main Page ─────────────────────────────────────────────
export default function MyDealsPage() {
  const supabase = createClient()
  const [jobs, setJobs] = useState<Job[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [filterProject, setFilterProject] = useState('')
  const [filterSales, setFilterSales] = useState('')
  const [filterStage, setFilterStage] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    const { data: rawJobs } = await supabase.from('jobs')
      .select('*, projects(name), sales:users!sales_id(name), installments:payments(*)')
      .neq('working_status', 'ยกเลิก')
      .order('order_date', { ascending: false })

    if (!rawJobs) { setLoading(false); return }

    const { data: warranties } = await supabase
      .from('warranties')
      .select('room, project_id, warranty_end')

    const warMap = new Map<string, string>()
    for (const w of (warranties || [])) {
      warMap.set(`${w.project_id}|${w.room}`, w.warranty_end)
    }

    const mapped: Job[] = (rawJobs as any[]).map(r => ({
      id: r.id,
      customer_id: r.customer_id,
      project_id: r.project_id,
      project_name: r.projects?.name || r.project_id,
      room_no: r.room_no || '',
      customer_name: r.customer_name || '',
      customer_type: r.customer_type || 'B2C',
      work_type: r.work_type || '',
      revenue_inc_vat: r.revenue_inc_vat || 0,
      revenue_ex_vat: r.revenue_ex_vat || 0,
      working_status: r.working_status || '',
      actual_deliver_date: r.actual_deliver_date || null,
      order_date: r.order_date || null,
      sales_id: r.sales_id || '',
      sales_name: r.sales?.name || '',
      payment_plan_type: r.payment_plan_type || null,
      work_days: r.work_days || null,
      contract_date: r.contract_date || null,
      work_start_date: r.work_start_date || null,
      delivery_doc_url: r.delivery_doc_url || null,
      warranty_end: warMap.get(`${r.project_id}|${r.room_no}`) || null,
      installments: (r.installments || []).map((p: any) => ({
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
        file_urls: p.file_urls || [],
      })),
    }))
    setJobs(mapped)
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

  const projectOptions = useMemo(() => [...new Set(jobs.map(j => j.project_name))].sort(), [jobs])
  const salesOptions = useMemo(() => [...new Set(jobs.map(j => j.sales_name).filter(Boolean))].sort(), [jobs])

  const filtered = useMemo(() => {
    return jobs.filter(j => {
      if (filterProject && j.project_name !== filterProject) return false
      if (filterSales && j.sales_name !== filterSales) return false
      if (filterStage) {
        const { activeStage, delivered } = getStageInfo(j)
        if (filterStage === 'delivered' && !delivered) return false
        if (filterStage === '1' && activeStage !== 1) return false
        if (filterStage === '2' && activeStage !== 2) return false
        if (filterStage === '3' && activeStage !== 3) return false
        if (filterStage === '4' && activeStage !== 4) return false
      }
      if (search) {
        const q = search.toLowerCase().replace(/[\-\s]/g, '')
        const roomMatch = j.room_no.toLowerCase().replace(/[\-\s]/g, '').includes(q)
        const custMatch = j.customer_name.toLowerCase().includes(search.toLowerCase())
        const projMatch = j.project_name.toLowerCase().includes(search.toLowerCase())
        if (!roomMatch && !custMatch && !projMatch) return false
      }
      return true
    })
  }, [jobs, search, filterProject, filterSales, filterStage])

  return (
    <div className="min-h-screen p-4 md:p-6" style={{ background: 'var(--page-bg)' }}>
      {/* Header */}
      <div className="flex items-center justify-between mb-5 flex-wrap gap-3">
        <div>
          <h1 className="text-xl font-bold" style={{ color: 'var(--text-1)' }}>My Deals</h1>
          <p className="text-xs mt-0.5" style={{ color: 'var(--text-3)' }}>
            {filtered.length} งาน {jobs.length !== filtered.length ? `จาก ${jobs.length}` : ''}
          </p>
        </div>
        <div className="relative">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: 'var(--text-3)' }} />
          <input
            value={search} onChange={e => setSearch(e.target.value)}
            placeholder='ค้นหาห้อง "303", "A333"...'
            className="pl-8 pr-4 py-2 rounded-[10px] text-sm focus:outline-none w-56"
            style={{ background: 'var(--input-bg)', border: '1px solid var(--divider)', color: 'var(--text-1)' }} />
          {search && (
            <button className="absolute right-2 top-1/2 -translate-y-1/2" onClick={() => setSearch('')}>
              <X size={12} style={{ color: 'var(--text-3)' }} />
            </button>
          )}
        </div>
      </div>

      {/* Filters */}
      <div className="flex gap-2 mb-5 flex-wrap">
        <select value={filterProject} onChange={e => setFilterProject(e.target.value)}
          className="rounded-[8px] px-3 py-1.5 text-xs focus:outline-none"
          style={{ background: 'var(--input-bg)', border: '1px solid var(--divider)', color: 'var(--text-2)' }}>
          <option value="">ทุกโครงการ</option>
          {projectOptions.map(p => <option key={p} value={p}>{p}</option>)}
        </select>
        <select value={filterSales} onChange={e => setFilterSales(e.target.value)}
          className="rounded-[8px] px-3 py-1.5 text-xs focus:outline-none"
          style={{ background: 'var(--input-bg)', border: '1px solid var(--divider)', color: 'var(--text-2)' }}>
          <option value="">ทุก Sales</option>
          {salesOptions.map(s => <option key={s} value={s}>{s}</option>)}
        </select>
        <select value={filterStage} onChange={e => setFilterStage(e.target.value)}
          className="rounded-[8px] px-3 py-1.5 text-xs focus:outline-none"
          style={{ background: 'var(--input-bg)', border: '1px solid var(--divider)', color: 'var(--text-2)' }}>
          <option value="">ทุก Stage</option>
          <option value="2">รอเปิดงาน</option>
          <option value="3">กำลังเก็บเงิน</option>
          <option value="4">รอส่งมอบ</option>
          <option value="delivered">ส่งมอบแล้ว</option>
        </select>
      </div>

      {/* Cards */}
      {loading ? (
        <div className="flex items-center justify-center py-20">
          <p className="text-sm" style={{ color: 'var(--text-3)' }}>กำลังโหลด...</p>
        </div>
      ) : filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 gap-2">
          <p className="text-sm font-medium" style={{ color: 'var(--text-2)' }}>ไม่พบงาน</p>
          {search && <p className="text-xs" style={{ color: 'var(--text-3)' }}>ลองเปลี่ยนคำค้นหา</p>}
        </div>
      ) : (
        <div className="space-y-3 max-w-xl mx-auto">
          {filtered.map(job => (
            <JobCard key={job.id} job={job} onRefresh={load} />
          ))}
        </div>
      )}
    </div>
  )
}
