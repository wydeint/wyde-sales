'use client'

import { useEffect, useState, useCallback } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import {
  ArrowLeft, CheckCircle2, Circle, ChevronDown, ChevronUp,
  Wallet, Package, Wrench, ShoppingCart, AlertTriangle, X,
} from 'lucide-react'

// ─── Types ────────────────────────────────────────────────
type ClientType = 'B2C' | 'B2B'
type PlanType = 'A' | 'B' | 'C' | '2' | '3' | '4' | '5' | '6'

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
  file_urls: string[]
  voucher_code: string | null
  voucher_amount: number
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

// ─── Plan helpers ──────────────────────────────────────────
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
function SetupAndPayModal({ job, onClose, onSaved }: { job: Job; onClose: () => void; onSaved: () => void }) {
  const supabase = createClient()
  const [clientType, setClientType] = useState<ClientType>(job.customer_type || 'B2C')
  const [plan, setPlan] = useState<string>(job.payment_plan_type || 'B')
  const [workDays, setWorkDays] = useState(job.work_days || 45)
  const [depositAmount, setDepositAmount] = useState(0)
  const [b2bCount, setB2bCount] = useState(3)
  const [b2bPcts, setB2bPcts] = useState([30, 40, 30])
  const [paidDate, setPaidDate] = useState(today())
  const [useVoucher, setUseVoucher] = useState(false)
  const [voucherCode, setVoucherCode] = useState('')
  const [voucherAmount, setVoucherAmount] = useState(0)
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
      voucher_code: i === 0 && useVoucher && voucherCode ? voucherCode : null,
      voucher_amount: i === 0 && useVoucher && voucherAmount > 0 ? voucherAmount : null,
    }))
    await supabase.from('payments').insert(rows)
    setSaving(false); onSaved(); onClose()
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center" style={{ padding: '1rem', paddingTop: '3.5rem' }} onClick={onClose}>
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
      <div className="relative w-full max-w-md rounded-[18px] shadow-2xl max-h-[90vh] overflow-y-auto"
        data-panel style={{ background: 'var(--panel-bg)', border: '1px solid var(--card-border)' }}
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
                      <label className="text-xs" style={{ color: 'var(--text-2)' }}>ยอดมัดจำ (บาท)</label>
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
                      % แต่ละงวด <span className={pctValid ? 'text-green-400' : 'text-red-400'}>(รวม {pctSum}%)</span>
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
              <button onClick={() => setStep('pay')}
                className="w-full py-3 rounded-[11px] font-semibold text-sm text-white"
                style={{ background: 'var(--accent)' }}>
                ถัดไป → บันทึกงวดแรก
              </button>
            </>
          ) : (
            <>
              <div className="rounded-[11px] p-4" style={{ background: 'var(--hover-bg)' }}>
                <p className="text-xs mb-1" style={{ color: 'var(--text-2)' }}>งวดที่ 1 — {firstInstallment?.name}</p>
                <p className="text-2xl font-bold" style={{ color: 'var(--text-1)' }}>{fmtBaht(firstInstallment?.amount || 0)}</p>
                {firstInstallment?.trigger && <p className="text-xs mt-1 text-indigo-400">งวดนี้เป็นงวดเริ่มงาน</p>}
              </div>
              <div>
                <label className="text-xs" style={{ color: 'var(--text-2)' }}>วันที่รับเงิน</label>
                <input type="date" value={paidDate} onChange={e => setPaidDate(e.target.value)}
                  className="mt-1 w-full rounded-[8px] px-3 py-2 text-sm focus:outline-none"
                  style={{ background: 'var(--input-bg)', border: '1px solid var(--divider)', color: 'var(--text-1)' }} />
              </div>
              {firstInstallment?.final && (
                <div className="space-y-2">
                  <button onClick={() => setUseVoucher(v => !v)}
                    className="flex items-center gap-2 text-xs"
                    style={{ color: useVoucher ? 'var(--accent)' : 'var(--text-2)' }}>
                    <div className="w-4 h-4 rounded border flex items-center justify-center"
                      style={{ background: useVoucher ? 'var(--accent)' : 'transparent', borderColor: useVoucher ? 'var(--accent)' : 'var(--divider)' }}>
                      {useVoucher && <span className="text-white text-[10px] font-bold">✓</span>}
                    </div>
                    ใช้ Voucher
                  </button>
                  {useVoucher && (
                    <div className="flex gap-2">
                      <div className="flex-1">
                        <label className="text-xs" style={{ color: 'var(--text-2)' }}>รหัส Voucher</label>
                        <input type="text" value={voucherCode} onChange={e => setVoucherCode(e.target.value)}
                          placeholder="เช่น VOU-2024-001"
                          className="mt-1 w-full rounded-[8px] px-3 py-2 text-sm focus:outline-none"
                          style={{ background: 'var(--input-bg)', border: '1px solid var(--divider)', color: 'var(--text-1)' }} />
                      </div>
                      <div className="w-32">
                        <label className="text-xs" style={{ color: 'var(--text-2)' }}>มูลค่า (บาท)</label>
                        <input type="number" value={voucherAmount || ''} onChange={e => setVoucherAmount(Number(e.target.value))}
                          placeholder="0"
                          className="mt-1 w-full rounded-[8px] px-3 py-2 text-sm focus:outline-none"
                          style={{ background: 'var(--input-bg)', border: '1px solid var(--divider)', color: 'var(--text-1)' }} />
                      </div>
                    </div>
                  )}
                </div>
              )}
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
function PayModal({ job, onClose, onSaved, onError }: { job: Job; onClose: () => void; onSaved: () => void; onError?: (msg: string) => void }) {
  const supabase = createClient()
  const allInsts = [...job.installments].sort((a, b) => a.installment_no - b.installment_no)
  const firstPending = allInsts.find(i => i.status !== 'paid') || allInsts[0] || null
  const [selected, setSelected] = useState<Installment | null>(firstPending)
  const [paidDate, setPaidDate] = useState(firstPending?.paid_date || today())
  const [paidAmount, setPaidAmount] = useState(firstPending?.paid_amount ?? firstPending?.amount ?? 0)
  const [useVoucher, setUseVoucher] = useState(!!(firstPending?.voucher_amount))
  const [voucherCode, setVoucherCode] = useState(firstPending?.voucher_code || '')
  const [voucherAmount, setVoucherAmount] = useState(firstPending?.voucher_amount || 0)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const netAmount = paidAmount - (useVoucher ? voucherAmount : 0)

  function selectInst(inst: Installment) {
    setSelected(inst)
    setPaidAmount(inst.paid_amount ?? inst.amount ?? 0)
    setPaidDate(inst.paid_date || today())
    setUseVoucher(!!(inst.voucher_amount))
    setVoucherCode(inst.voucher_code || '')
    setVoucherAmount(inst.voucher_amount || 0)
  }

  async function save() {
    if (!selected) return
    if (!paidAmount) { setError('กรุณาระบุยอดเงิน'); return }
    if (useVoucher && voucherAmount >= paidAmount) { setError('ยอด Voucher ต้องน้อยกว่ายอดงวด'); return }
    setSaving(true); setError('')
    if (selected.is_work_trigger && !job.work_start_date) {
      await supabase.from('jobs').update({ work_start_date: paidDate, working_status: 'ดำเนินการ' }).eq('id', job.id)
      await supabase.from('customers').update({ status: 'closed' }).eq('id', job.customer_id)
    }
    const { error: e } = await supabase.from('payments').update({
      status: 'paid',
      paid_date: paidDate,
      paid_amount: useVoucher ? netAmount : paidAmount,
      voucher_code: useVoucher && voucherCode ? voucherCode : null,
      voucher_amount: useVoucher ? voucherAmount : 0,
    }).eq('id', selected.id)
    if (e) { const msg = e.message; setError(msg); onError?.(msg); setSaving(false); return }
    setSaving(false); onSaved(); onClose()
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center" style={{ padding: '1rem', paddingTop: '3.5rem' }} onClick={onClose}>
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
      <div className="relative w-full max-w-sm rounded-[18px] shadow-2xl max-h-[90vh] overflow-y-auto"
        data-panel style={{ background: 'var(--panel-bg)', border: '1px solid var(--card-border)' }}
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
              {allInsts.map(inst => (
                <button key={inst.id} onClick={() => selectInst(inst)}
                  className="w-full text-left px-4 py-3 rounded-[11px] border transition-all"
                  style={selected?.id === inst.id
                    ? { background: 'rgba(99,102,241,0.1)', border: '1px solid rgba(99,102,241,0.4)', color: 'var(--text-1)' }
                    : { background: 'var(--hover-bg)', border: '1px solid var(--divider)', color: 'var(--text-2)' }}>
                  <div className="flex justify-between">
                    <span className="text-sm font-semibold">{inst.installment_name}</span>
                    <span className="text-sm font-bold">{fmtBaht(inst.paid_amount ?? inst.amount)}</span>
                  </div>
                  <div className="flex gap-2 mt-0.5">
                    {inst.status === 'paid' && <span className="text-[10px] text-green-400">รับแล้ว {inst.paid_date ? fmtDate(inst.paid_date) : ''}</span>}
                    {inst.is_work_trigger && <span className="text-[10px] text-indigo-400">เริ่มงาน</span>}
                    {inst.is_final && <span className="text-[10px] text-amber-400">งวดสุดท้าย</span>}
                    {inst.voucher_amount > 0 && <span className="text-[10px] text-pink-400">Voucher -{fmtBaht(inst.voucher_amount)}</span>}
                    {inst.status !== 'paid' && inst.due_date && <span className="text-[10px]" style={{ color: 'var(--text-3)' }}>ครบ {fmtDate(inst.due_date)}</span>}
                  </div>
                </button>
              ))}
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs" style={{ color: 'var(--text-2)' }}>ยอดงวด (฿)</label>
              <input type="number" value={paidAmount || ''} onChange={e => setPaidAmount(+e.target.value)}
                className="mt-1 w-full rounded-[8px] px-3 py-2 text-sm focus:outline-none font-semibold"
                style={{ background: 'var(--input-bg)', border: '1px solid var(--divider)', color: 'var(--text-1)' }}
                placeholder="0" />
            </div>
            <div>
              <label className="text-xs" style={{ color: 'var(--text-2)' }}>วันที่รับเงิน</label>
              <input type="date" value={paidDate} onChange={e => setPaidDate(e.target.value)}
                className="mt-1 w-full rounded-[8px] px-3 py-2 text-sm focus:outline-none"
                style={{ background: 'var(--input-bg)', border: '1px solid var(--divider)', color: 'var(--text-1)' }} />
            </div>
          </div>

          {/* Voucher section */}
          <div className="rounded-[11px] overflow-hidden" style={{ border: '1px solid var(--divider)' }}>
            <label className="flex items-center gap-3 px-4 py-3 cursor-pointer" style={{ background: 'var(--hover-bg)' }}>
              <input type="checkbox" checked={useVoucher} onChange={e => { setUseVoucher(e.target.checked); if (!e.target.checked) { setVoucherAmount(0); setVoucherCode('') } }}
                className="w-4 h-4 rounded accent-pink-500" />
              <span className="text-sm font-semibold" style={{ color: 'var(--text-1)' }}>ใช้ Voucher / ส่วนลด</span>
            </label>
            {useVoucher && (
              <div className="px-4 pb-4 pt-3 space-y-3" style={{ borderTop: '1px solid var(--divider)' }}>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs" style={{ color: 'var(--text-2)' }}>รหัส Voucher</label>
                    <input type="text" value={voucherCode} onChange={e => setVoucherCode(e.target.value)}
                      placeholder="เช่น VOU-2024-001"
                      className="mt-1 w-full rounded-[8px] px-3 py-2 text-sm focus:outline-none"
                      style={{ background: 'var(--input-bg)', border: '1px solid var(--divider)', color: 'var(--text-1)' }} />
                  </div>
                  <div>
                    <label className="text-xs" style={{ color: 'var(--text-2)' }}>ยอดส่วนลด (฿)</label>
                    <input type="number" value={voucherAmount || ''} onChange={e => setVoucherAmount(+e.target.value)}
                      placeholder="0"
                      className="mt-1 w-full rounded-[8px] px-3 py-2 text-sm focus:outline-none font-semibold text-pink-400"
                      style={{ background: 'var(--input-bg)', border: '1px solid var(--divider)' }} />
                  </div>
                </div>
                {voucherAmount > 0 && (
                  <div className="rounded-[8px] p-3 space-y-1" style={{ background: 'var(--card-bg)' }}>
                    <div className="flex justify-between text-xs" style={{ color: 'var(--text-2)' }}>
                      <span>ยอดงวด</span><span>{fmtBaht(paidAmount)}</span>
                    </div>
                    <div className="flex justify-between text-xs text-pink-400">
                      <span>ส่วนลด Voucher</span><span>-{fmtBaht(voucherAmount)}</span>
                    </div>
                    <div className="flex justify-between text-sm font-bold pt-1" style={{ borderTop: '1px solid var(--divider)', color: 'var(--text-1)' }}>
                      <span>รับจริง (Net)</span><span className="text-green-400">{fmtBaht(netAmount)}</span>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>

          {error && <p className="text-xs text-red-400">{error}</p>}
          <button onClick={save} disabled={saving || !selected}
            className="w-full py-3 rounded-[11px] font-semibold text-sm text-white"
            style={{ background: saving ? '#999' : 'var(--accent)' }}>
            {saving ? 'กำลังบันทึก...' : `บันทึกรับเงิน ${selected ? fmtBaht(useVoucher && voucherAmount > 0 ? netAmount : paidAmount) : ''}`}
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Handover Modal ────────────────────────────────────────
function HandoverModal({ job, onClose, onSaved, onError }: { job: Job; onClose: () => void; onSaved: () => void; onError?: (msg: string) => void }) {
  const supabase = createClient()
  const [deliverDate, setDeliverDate] = useState(job.actual_deliver_date || today())
  const [warrantyMonths, setWarrantyMonths] = useState(12)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const finalInst = job.installments.find(i => i.is_final && i.status !== 'paid') || null
  // po_bill = ส่งมอบก่อน รับเงินภายหลัง → default ไม่ tick
  const [markFinalPaid, setMarkFinalPaid] = useState(!!finalInst && job.customer_type !== 'B2B')

  async function save() {
    setSaving(true); setError('')
    const wEnd = new Date(deliverDate)
    wEnd.setMonth(wEnd.getMonth() + warrantyMonths)
    const wEndStr = `${wEnd.getFullYear()}-${String(wEnd.getMonth() + 1).padStart(2, '0')}-${String(wEnd.getDate()).padStart(2, '0')}`

    const { error: e1 } = await supabase.from('jobs').update({
      actual_deliver_date: deliverDate,
      working_status: 'ส่งมอบแล้ว',
    }).eq('id', job.id)
    if (e1) { const msg = 'บันทึกไม่สำเร็จ: ' + e1.message; setError(msg); onError?.(msg); setSaving(false); return }

    if (markFinalPaid && finalInst) {
      await supabase.from('payments').update({ status: 'paid', paid_date: deliverDate }).eq('id', finalInst.id)
    }

    const handoverPayload = {
      job_id: job.id,
      customer_id: job.customer_id || null,
      project_id: job.project_id || null,
      room: job.room_no,
      delivery_date: deliverDate,
      work_status: 'ส่งมอบแล้ว',
    }
    const { data: existingHO } = await supabase.from('handovers').select('id').eq('job_id', job.id).maybeSingle()
    if (existingHO) {
      const { error: e2 } = await supabase.from('handovers').update(handoverPayload).eq('id', existingHO.id)
      if (e2) { const msg = 'handovers: ' + e2.message; setError(msg); onError?.(msg); setSaving(false); return }
    } else {
      const { error: e2 } = await supabase.from('handovers').insert(handoverPayload)
      if (e2) { const msg = 'handovers: ' + e2.message; setError(msg); onError?.(msg); setSaving(false); return }
    }

    const { error: e3 } = await supabase.from('warranties').upsert({
      id: `WAR-${job.id}`,
      customer_id: job.customer_id || null,
      project_id: job.project_id || null,
      room: job.room_no,
      handover_date: deliverDate,
      warranty_start: deliverDate,
      warranty_end: wEndStr,
      warranty_months: warrantyMonths,
      status: 'active',
    }, { onConflict: 'id' })
    if (e3) { setError('warranties: ' + e3.message); setSaving(false); return }

    setSaving(false); onSaved(); onClose()
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center" style={{ padding: '1rem', paddingTop: '3.5rem' }} onClick={onClose}>
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
      <div className="relative w-full max-w-sm rounded-[18px] shadow-2xl"
        data-panel style={{ background: 'var(--panel-bg)', border: '1px solid var(--card-border)' }}
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
                <input type="checkbox" checked={markFinalPaid} onChange={e => setMarkFinalPaid(e.target.checked)} className="w-4 h-4 rounded" />
                <div>
                  <p className="text-sm font-semibold" style={{ color: 'var(--text-1)' }}>
                    {job.customer_type === 'B2B' ? 'วางบิลและรับเงินพร้อมส่งมอบ' : 'รับเงินงวดสุดท้าย'}
                  </p>
                  <p className="text-xs mt-0.5" style={{ color: 'var(--text-2)' }}>{finalInst.installment_name} — {fmtBaht(finalInst.amount)}</p>
                </div>
              </label>
            </div>
          )}
          <div className="rounded-[11px] p-3" style={{ background: 'rgba(99,102,241,0.05)', border: '1px solid var(--divider)' }}>
            <p className="text-xs font-semibold" style={{ color: 'var(--text-2)' }}>ประกันรันอัตโนมัติ {warrantyMonths} เดือน</p>
            <p className="text-xs mt-0.5" style={{ color: 'var(--text-3)' }}>เริ่ม {deliverDate}</p>
          </div>
          {error && <p className="text-xs text-red-400 rounded-[8px] px-3 py-2" style={{ background: 'rgba(239,68,68,0.08)' }}>{error}</p>}
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

// ─── Installment Rows ──────────────────────────────────────
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
            <span className="text-xs font-semibold" style={{ color: 'var(--text-1)' }}>{inst.installment_name}</span>
            {inst.is_work_trigger && <span className="ml-1.5 text-[9px] px-1 rounded" style={{ background: 'color-mix(in srgb, var(--accent) 15%, transparent)', color: 'var(--accent)' }}>เริ่มงาน</span>}
            {inst.is_final && <span className="ml-1.5 text-[9px] px-1 rounded" style={{ background: 'color-mix(in srgb, var(--accent-orange) 15%, transparent)', color: 'var(--accent-orange)' }}>สุดท้าย</span>}
          </div>
          <div className="text-right flex-shrink-0">
            {inst.voucher_amount > 0 && inst.status === 'paid' ? (
              <>
                <span className="text-[10px] line-through" style={{ color: 'var(--text-3)' }}>{fmtBaht(inst.amount)}</span>
                <p className="text-[10px] text-pink-400">-{fmtBaht(inst.voucher_amount)}</p>
                <span className="text-xs font-semibold text-green-400">{fmtBaht(inst.paid_amount ?? 0)}</span>
              </>
            ) : (
              <span className="text-xs font-semibold" style={{ color: inst.status === 'paid' ? '#4ade80' : 'var(--text-1)' }}>
                {fmtBaht(inst.status === 'paid' && inst.paid_amount != null ? inst.paid_amount : inst.amount)}
              </span>
            )}
            {inst.paid_date && <p className="text-[10px]" style={{ color: 'var(--text-3)' }}>{fmtDate(inst.paid_date)}</p>}
            {inst.voucher_code && <p className="text-[10px] text-pink-400">{inst.voucher_code}</p>}
          </div>
        </div>
      ))}
    </div>
  )
}

// ─── Detail Page ───────────────────────────────────────────
export default function JobDetailPage() {
  const params = useParams()
  const router = useRouter()
  const supabase = createClient()
  const jobId = params.jobId as string

  const [job, setJob] = useState<Job | null>(null)
  const [loading, setLoading] = useState(true)
  const [expanded, setExpanded] = useState(false)
  const [modal, setModal] = useState<'setup' | 'pay' | 'handover' | null>(null)
  const [toast, setToast] = useState('')

  function showToast(msg: string) {
    setToast(msg)
    setTimeout(() => setToast(''), 4000)
  }

  const load = useCallback(async () => {
    setLoading(true)
    const { data: raw } = await supabase
      .from('jobs')
      .select('*, projects(name), sales:users!sales_id(name), installments:payments(*)')
      .eq('id', jobId)
      .single()

    if (!raw) { setLoading(false); return }

    const { data: war } = await supabase
      .from('warranties')
      .select('warranty_end')
      .eq('project_id', raw.project_id)
      .eq('room', raw.room_no)
      .maybeSingle()

    setJob({
      id: raw.id,
      customer_id: raw.customer_id,
      project_id: raw.project_id,
      project_name: (raw as any).projects?.name || raw.project_id,
      room_no: raw.room_no || '',
      customer_name: raw.customer_name || '',
      customer_type: raw.customer_type || 'B2C',
      work_type: raw.work_type || '',
      revenue_inc_vat: raw.revenue_inc_vat || 0,
      revenue_ex_vat: raw.revenue_ex_vat || 0,
      working_status: raw.working_status || '',
      actual_deliver_date: raw.actual_deliver_date || null,
      order_date: raw.order_date || null,
      sales_id: raw.sales_id || '',
      sales_name: (raw as any).sales?.name || '',
      payment_plan_type: raw.payment_plan_type || null,
      work_days: raw.work_days || null,
      contract_date: raw.contract_date || null,
      work_start_date: raw.work_start_date || null,
      delivery_doc_url: raw.delivery_doc_url || null,
      warranty_end: war?.warranty_end || null,
      installments: ((raw as any).installments || []).map((p: any) => ({
        id: p.id,
        installment_no: p.installment_no,
        installment_name: p.installment_name,
        amount: p.amount || 0,
        paid_amount: p.paid_amount ?? null,
        percentage: p.percentage || 0,
        status: p.status || 'pending',
        due_date: p.due_date || null,
        paid_date: p.paid_date || null,
        is_work_trigger: !!p.is_work_trigger,
        is_final: !!p.is_final,
        file_urls: p.file_urls || [],
        voucher_code: p.voucher_code || null,
        voucher_amount: p.voucher_amount || 0,
      })),
    })
    setLoading(false)
  }, [jobId])

  useEffect(() => { load() }, [load])

  if (loading) return (
    <div className="min-h-screen flex items-center justify-center" style={{ background: 'var(--page-bg)' }}>
      <p className="text-sm" style={{ color: 'var(--text-3)' }}>กำลังโหลด...</p>
    </div>
  )
  if (!job) return (
    <div className="min-h-screen flex items-center justify-center" style={{ background: 'var(--page-bg)' }}>
      <p className="text-sm" style={{ color: 'var(--text-3)' }}>ไม่พบข้อมูล</p>
    </div>
  )

  const { hasPlan, finalPaid, delivered, paidCount, totalCount, pendingInstallments, activeStage } = getStageInfo(job)
  const revenue = job.revenue_inc_vat || job.revenue_ex_vat || 0
  const overdueCount = job.installments.filter(i => i.status === 'overdue').length

  const stageColor = ['', '#6366f1', '#6366f1', '#f59e0b', '#059669']
  const stages = [
    { label: 'ขาย', icon: ShoppingCart, done: true },
    { label: 'เปิดงาน', icon: Wrench, done: hasPlan },
    { label: 'เก็บเงิน', icon: Wallet, done: finalPaid },
    { label: 'ส่งมอบ', icon: Package, done: delivered },
  ]

  return (
    <div className="min-h-screen p-4 md:p-6" style={{ background: 'var(--page-bg)' }}>
      {/* Back */}
      <button onClick={() => router.push('/dashboard/my-deals')}
        className="flex items-center gap-2 text-sm mb-5 -ml-1"
        style={{ color: 'var(--text-3)' }}>
        <ArrowLeft size={15} /> กลับ My Deals
      </button>

      <div className="max-w-lg mx-auto">
        {/* Header */}
        <div className="mb-4">
          <div className="flex items-center gap-3 mb-1">
            <span className="px-3 py-1 rounded-[8px] font-bold text-sm text-white"
              style={{ background: stageColor[activeStage] }}>
              {job.room_no}
            </span>
            <h1 className="text-lg font-bold" style={{ color: 'var(--text-1)' }}>{job.project_name}</h1>
          </div>
          <div className="flex items-center gap-3 text-xs" style={{ color: 'var(--text-3)' }}>
            <span>{job.customer_name}</span>
            {job.sales_name && <><span>·</span><span>{job.sales_name}</span></>}
            {job.order_date && <><span>·</span><span>ขาย {fmtDate(job.order_date)}</span></>}
          </div>
        </div>

        {/* Revenue + Stage card */}
        <div className="rounded-[14px] overflow-hidden mb-4"
          style={{ background: 'var(--card-bg)', border: '1px solid var(--card-border)' }}>
          {/* Revenue */}
          <div className="px-4 pt-4 pb-3 flex items-center justify-between">
            <div>
              <p className="text-xs" style={{ color: 'var(--text-3)' }}>มูลค่างาน (inc. VAT)</p>
              <p className="text-2xl font-bold mt-0.5" style={{ color: 'var(--text-1)' }}>{fmtBaht(revenue)}</p>
            </div>
            <div className="text-right">
              {hasPlan && totalCount > 0 && (
                <>
                  <p className="text-sm font-semibold" style={{ color: paidCount === totalCount ? '#4ade80' : '#f59e0b' }}>
                    {paidCount}/{totalCount} งวด
                  </p>
                  <p className="text-xs mt-0.5" style={{ color: 'var(--text-3)' }}>
                    เก็บแล้ว {fmtBaht(job.installments.filter(i => i.status === 'paid').reduce((s, i) => s + i.amount, 0))}
                  </p>
                </>
              )}
              {overdueCount > 0 && (
                <p className="text-xs text-red-400 flex items-center justify-end gap-0.5 mt-1">
                  <AlertTriangle size={10} /> {overdueCount} งวดเกินกำหนด
                </p>
              )}
            </div>
          </div>

          {/* Stage Bar */}
          <div className="px-4 pb-4">
            <div className="flex items-center">
              {stages.map((s, idx) => {
                const Icon = s.icon
                const isActive = idx + 1 === activeStage
                return (
                  <div key={s.label} className="flex items-center flex-1">
                    <div className="flex flex-col items-center gap-1">
                      <div className="w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0"
                        style={{
                          background: s.done ? '#059669' : isActive ? 'rgba(99,102,241,0.15)' : 'var(--hover-bg)',
                          border: s.done ? '1.5px solid #059669' : isActive ? '1.5px solid #6366f1' : '1.5px solid var(--divider)',
                        }}>
                        {s.done
                          ? <CheckCircle2 size={14} className="text-white" />
                          : <Icon size={13} style={{ color: isActive ? 'var(--accent)' : 'var(--text-3)' }} />}
                      </div>
                      <span className="text-[10px] font-semibold whitespace-nowrap"
                        style={{ color: s.done ? 'var(--accent-green)' : isActive ? 'var(--accent)' : 'var(--text-3)' }}>
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
          </div>

          {/* Installments toggle */}
          {hasPlan && (
            <>
              <button className="w-full flex items-center justify-between px-4 py-2.5"
                style={{ borderTop: '1px solid var(--divider)', color: 'var(--text-3)' }}
                onClick={() => setExpanded(e => !e)}>
                <span className="text-xs">งวดชำระเงิน</span>
                {expanded ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
              </button>
              {expanded && <InstallmentRows installments={job.installments} />}
            </>
          )}
        </div>

        {/* Actions */}
        {!delivered ? (
          <div className="space-y-2">
            {!hasPlan ? (
              <button onClick={() => setModal('setup')}
                className="w-full py-3 rounded-[12px] font-semibold text-sm text-white"
                style={{ background: 'var(--accent)' }}>
                + ตั้งแผนชำระเงิน & รับเงินงวดแรก
              </button>
            ) : pendingInstallments.length > 0 ? (
              <div className="flex gap-2">
                <button onClick={() => setModal('pay')}
                  className="flex-1 py-3 rounded-[12px] font-semibold text-sm text-white"
                  style={{ background: 'var(--accent)' }}>
                  + บันทึกรับเงิน
                </button>
                {(finalPaid || job.customer_type === 'B2B') && (
                  <button onClick={() => setModal('handover')}
                    className="flex-1 py-3 rounded-[12px] font-semibold text-sm text-white"
                    style={{ background: '#059669' }}>
                    บันทึกส่งมอบ
                  </button>
                )}
              </div>
            ) : (
              <button onClick={() => setModal('handover')}
                className="w-full py-3 rounded-[12px] font-semibold text-sm text-white"
                style={{ background: '#059669' }}>
                + บันทึกส่งมอบ
              </button>
            )}
          </div>
        ) : (
          <div className="space-y-2">
            <div className="rounded-[12px] p-4 text-center"
              style={{ background: 'rgba(5,150,105,0.08)', border: '1px solid rgba(5,150,105,0.2)' }}>
              <p className="text-sm font-semibold text-green-400">ส่งมอบแล้ว {fmtDate(job.actual_deliver_date)}</p>
              {job.warranty_end && (
                <p className="text-xs mt-1" style={{ color: 'var(--text-3)' }}>
                  ประกันหมด {fmtDate(job.warranty_end)}
                </p>
              )}
            </div>
            <div className="flex gap-2">
              <button onClick={() => setModal('pay')}
                className="flex-1 py-2.5 rounded-[12px] font-semibold text-sm"
                style={{ background: 'var(--hover-bg)', border: '1px solid var(--divider)', color: 'var(--text-2)' }}>
                แก้ไขงวดเงิน
              </button>
              <button onClick={() => setModal('handover')}
                className="flex-1 py-2.5 rounded-[12px] font-semibold text-sm"
                style={{ background: 'var(--hover-bg)', border: '1px solid var(--divider)', color: 'var(--text-2)' }}>
                แก้ไขวันส่งมอบ
              </button>
            </div>
          </div>
        )}
      </div>

      {modal === 'setup' && <SetupAndPayModal job={job} onClose={() => setModal(null)} onSaved={load} />}
      {modal === 'pay' && <PayModal job={job} onClose={() => setModal(null)} onSaved={load} onError={showToast} />}
      {modal === 'handover' && <HandoverModal job={job} onClose={() => setModal(null)} onSaved={load} onError={showToast} />}

      {toast && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-[999] px-4 py-3 rounded-[12px] text-sm font-semibold text-white shadow-xl"
          style={{ background: 'rgba(239,68,68,0.95)', backdropFilter: 'blur(8px)' }}>
          ⚠️ {toast}
        </div>
      )}
    </div>
  )
}
