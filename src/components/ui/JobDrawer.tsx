'use client'

import React, { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import {
  X, ChevronRight, ChevronDown, Plus, Pencil,
  CheckCircle2, Circle, Wallet, Package, Wrench, ShoppingCart,
  Trash2, AlertTriangle, Loader2, Copy,
} from 'lucide-react'
import FileAttach from '@/components/ui/FileAttach'

// ─── Types ────────────────────────────────────────────────
export type ClientType = 'B2C' | 'B2B'

export interface Installment {
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
  voucher_code: string | null
  voucher_amount: number | null
  line_notified_at: string | null
}

export interface FullJob {
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
  order_date: string | null
  contract_date: string | null
  expected_finish_date: string | null
  work_start_date: string | null
  warranty_end: string | null
  installments: Installment[]
  quotation1_url: string | null
  quotation2_url: string | null
  id_card_url: string | null
  delivery_doc_url: string | null
  satisfaction_url: string | null
  sale_slip_url: string | null
  sale_receipt_url: string | null
}

// ─── Constants ────────────────────────────────────────────
export const CHANNEL_OPTS = ['โอนเข้าบัญชีบริษัท', 'บัตรเครดิต', 'เงินสด', 'QR Code']
const WORK_TYPES = ['N-RPT/Event', 'N-RPT/EQ', 'N-RPT', 'RPT', 'อื่นๆ']
const B2C_PLANS = [
  { value: 'A', label: 'แบบ A — 100% ครั้งเดียว', desc: '1 งวด' },
  { value: 'B', label: 'แบบ B — 50% + 50%', desc: '2 งวด' },
  { value: 'C', label: 'แบบ C — มัดจำ + 50% + 50%', desc: '3 งวด' },
]
const B2B_PLANS = [
  { value: 'po_bill', label: 'PO → วางบิลเมื่อจบงาน', desc: '1 งวด (วางบิลส่งมอบ 100%)' },
  { value: 'custom', label: 'กำหนดงวดเอง', desc: 'ระบุ % แต่ละงวด' },
]
const WORK_DAYS_OPTIONS = [30, 45, 60, 90]

// ─── Helpers ──────────────────────────────────────────────
export const fmtBaht = (n: number) => n ? '฿' + Math.round(n).toLocaleString('th-TH') : '฿0'

async function sendLineNotify(message: string): Promise<{ ts: string; error?: undefined } | { ts?: undefined; error: string }> {
  try {
    const res = await fetch('/api/line-notify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message }),
    })
    if (!res.ok) {
      const body = await res.json().catch(() => ({}))
      return { error: body?.error || `HTTP ${res.status}` }
    }
    return { ts: new Date().toISOString() }
  } catch (e) {
    return { error: String(e) }
  }
}
export const fmtDate = (d: string | null) => d
  ? new Date(d).toLocaleDateString('th-TH', { day: '2-digit', month: 'short', year: '2-digit' })
  : '—'
export const todayStr = () => {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function calcB2BSingleInstallment(total: number) {
  return [{ no: 1, name: 'วางบิลเมื่อส่งมอบงาน', pct: 100, amount: total, trigger: false, final: true }]
}
function calcB2CInstallments(plan: string, total: number, deposit: number) {
  if (plan === 'A') return [{ no: 1, name: 'ชำระเต็มจำนวน 100%', pct: 100, amount: total, trigger: true, final: true }]
  if (plan === 'B') return [
    { no: 1, name: 'ชำระ 50% แรก เริ่มงาน', pct: 50, amount: total * 0.5, trigger: true, final: false },
    { no: 2, name: 'ชำระ 50% สุดท้าย ส่งมอบ', pct: 50, amount: total * 0.5, trigger: false, final: true },
  ]
  if (plan === 'C') {
    const dep = deposit > 0 ? deposit : Math.round(total * 0.1)
    const first50 = Math.round(total * 0.5)
    const last50 = total - dep - first50
    return [
      { no: 1, name: 'มัดจำจองสิทธิ์', pct: Math.round((dep / total) * 100), amount: dep, trigger: false, final: false },
      { no: 2, name: 'ชำระ 50% แรก เริ่มงาน', pct: 50, amount: first50, trigger: true, final: false },
      { no: 3, name: 'ชำระ 50% สุดท้าย ส่งมอบ', pct: Math.round((last50 / total) * 100), amount: last50, trigger: false, final: true },
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

export function getFullStageInfo(job: FullJob) {
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

function generateLineMsg(
  job: { project_name: string; room_no: string; customer_name: string; sales_name: string; revenue_inc_vat: number; voucher?: number; working_status: string },
  inst: Installment
): string {
  const isDelivered = job.working_status === 'ส่งมอบแล้ว'
  const isFirst = inst.installment_no === 1
  const type = isDelivered ? 'ลูกค้าเก่า ส่งมอบ' : isFirst ? 'ลูกค้าใหม่' : 'ลูกค้าเก่า'
  const d = inst.paid_date ? new Date(inst.paid_date) : new Date()
  const dateStr = `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${String(d.getFullYear()).slice(2)}`
  const fmt = (n: number) => n.toLocaleString('th-TH')
  const paid = inst.paid_amount ?? inst.amount
  const lines = [
    `Wyde Int. (${type})`,
    `วันที่ : ${dateStr}`,
    `โครงการ : ${job.project_name}`,
    `ห้อง : ${job.room_no}`,
    `ลูกค้าชื่อ : ${job.customer_name}`,
    `Sales Wyde : ${job.sales_name}`,
    `Package : ${fmt(job.revenue_inc_vat)} บาท`,
    ...(job.voucher && job.voucher > 0 ? [`หัก Voucher : ${fmt(job.voucher)} บาท`] : []),
    `${inst.installment_name} : ${fmt(paid)} บาท`,
    ...(inst.channel ? [`ชำระผ่านทาง : ${inst.channel}`] : []),
  ]
  return lines.join('\n')
}

// ─── SetupAndPayModal ─────────────────────────────────────
export function SetupAndPayModal({ job, onClose, onSaved }: { job: FullJob; onClose: () => void; onSaved: () => void }) {
  const supabase = createClient()
  const [clientType, setClientType] = useState<ClientType>(job.customer_type || 'B2C')
  const [plan, setPlan] = useState(job.payment_plan_type || 'B')
  const [workDays, setWorkDays] = useState(job.work_days || 60)
  const [depositAmount, setDepositAmount] = useState(0)
  const [firstPaidAmount, setFirstPaidAmount] = useState(0)
  const [b2bPlan, setB2bPlan] = useState('po_bill')
  const [b2bPoDate, setB2bPoDate] = useState(todayStr())
  const [b2bCount, setB2bCount] = useState(3)
  const [b2bPcts, setB2bPcts] = useState([30, 40, 30])
  const [paidDate, setPaidDate] = useState(job.order_date || todayStr())
  const [channel, setChannel] = useState(CHANNEL_OPTS[0])
  const [slipPosted, setSlipPosted] = useState(false)
  const [receiptPosted, setReceiptPosted] = useState(false)
  const [useVoucher, setUseVoucher] = useState(false)
  const [voucherCode, setVoucherCode] = useState('')
  const [voucherAmount, setVoucherAmount] = useState(0)
  const [saving, setSaving] = useState(false)
  const [step, setStep] = useState<'plan' | 'pay'>('plan')

  const total = job.revenue_inc_vat || job.revenue_ex_vat || 0
  const pctSum = b2bPcts.slice(0, b2bCount).reduce((a, b) => a + b, 0)
  const pctValid = Math.abs(pctSum - 100) < 0.01
  const isSingleB2B = clientType === 'B2B' && b2bPlan === 'po_bill'

  function updateB2bCount(n: number) {
    setB2bCount(n)
    const even = Math.floor(100 / n)
    const last = 100 - even * (n - 1)
    setB2bPcts(Array(n).fill(even).map((v, i) => i === n - 1 ? last : v))
  }

  const preview = clientType === 'B2C'
    ? calcB2CInstallments(plan, total, depositAmount)
    : isSingleB2B ? calcB2BSingleInstallment(total)
    : calcB2BInstallments(b2bCount, total, b2bPcts.slice(0, b2bCount))
  const firstInst = preview[0]

  async function save() {
    if (clientType === 'B2B' && !isSingleB2B && !pctValid) return
    setSaving(true)
    await supabase.from('jobs').update({
      customer_type: clientType,
      payment_plan_type: clientType === 'B2C' ? plan : isSingleB2B ? 'po_bill' : String(b2bCount),
      work_days: workDays,
      work_start_date: isSingleB2B ? b2bPoDate : (firstInst?.trigger ? paidDate : null),
      working_status: isSingleB2B || firstInst?.trigger ? 'ดำเนินการ' : job.working_status,
    }).eq('id', job.id)
    if ((isSingleB2B || firstInst?.trigger) && job.customer_id) {
      await supabase.from('customers').update({ status: 'closed' }).eq('id', job.customer_id)
    }
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
      status: isSingleB2B ? 'pending' : (i === 0 ? 'paid' : 'pending'),
      paid_date: isSingleB2B ? null : (i === 0 ? paidDate : null),
      paid_amount: isSingleB2B ? null : (i === 0 ? (firstPaidAmount || p.amount) : null),
      channel: isSingleB2B ? null : (i === 0 ? (channel || null) : null),
      is_work_trigger: p.trigger,
      is_final: p.final,
      slip_url: isSingleB2B ? null : (i === 0 ? (slipPosted ? 'posted' : null) : null),
      receipt_url: isSingleB2B ? null : (i === 0 ? (receiptPosted ? 'posted' : null) : null),
      voucher_code: i === 0 && useVoucher && voucherCode ? voucherCode : null,
      voucher_amount: i === 0 && useVoucher && voucherAmount > 0 ? voucherAmount : null,
    })))
    // Auto-send LINE for first paid installment (not B2B PO-only)
    if (!isSingleB2B && firstInst) {
      const vcCode = useVoucher && voucherCode ? voucherCode : null
      const vcAmt = useVoucher && voucherAmount > 0 ? voucherAmount : 0
      const instId = `PAY-${job.id}-1`
      const lineMsg = generateLineMsg(job, {
        id: instId, installment_no: 1, installment_name: firstInst.name,
        amount: firstInst.amount, paid_amount: firstPaidAmount || firstInst.amount,
        percentage: firstInst.pct, status: 'paid', due_date: null, paid_date: paidDate,
        is_work_trigger: firstInst.trigger, is_final: firstInst.final,
        channel, slip_url: slipPosted ? 'posted' : null, receipt_url: receiptPosted ? 'posted' : null,
        voucher_code: vcCode, voucher_amount: vcAmt, line_notified_at: null,
      })
      const result = await sendLineNotify(lineMsg)
      if (result.ts) await supabase.from('payments').update({ line_notified_at: result.ts }).eq('id', instId)
    }
    setSaving(false); onSaved(); onClose()
  }

  const inputStyle = { background: 'var(--input-bg)', border: '1px solid var(--divider)', color: 'var(--text-1)' }
  const btnActive = { background: 'var(--accent)', color: '#fff', border: '1px solid var(--accent)' }
  const btnIdle = { background: 'var(--hover-bg)', border: '1px solid var(--divider)', color: 'var(--text-2)' }

  return (
    <div className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center px-4 pb-4 pt-14 lg:pt-4" onClick={onClose}>
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
      <div data-panel className="relative w-full max-w-md rounded-[18px] shadow-2xl max-h-[88vh] overflow-y-auto"
        style={{ background: 'var(--panel-bg)', border: '1px solid var(--card-border)' }}
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
                    <p className="text-xs mb-2" style={{ color: 'var(--text-2)' }}>รูปแบบ B2B</p>
                    <div className="space-y-2">
                      {B2B_PLANS.map(p => (
                        <button key={p.value} onClick={() => setB2bPlan(p.value)}
                          className="w-full text-left px-4 py-3 rounded-[11px] border"
                          style={b2bPlan === p.value
                            ? { background: 'rgba(99,102,241,0.1)', border: '1px solid rgba(99,102,241,0.4)', color: 'var(--text-1)' }
                            : { background: 'var(--hover-bg)', border: '1px solid var(--divider)', color: 'var(--text-2)' }}>
                          <p className="text-sm font-semibold">{p.label}</p>
                          <p className="text-xs opacity-60 mt-0.5">{p.desc}</p>
                        </button>
                      ))}
                    </div>
                  </div>
                  {isSingleB2B && (
                    <div>
                      <label className="text-xs" style={{ color: 'var(--text-2)' }}>วันรับ PO / วันเริ่มงาน</label>
                      <input type="date" lang="th-TH" value={b2bPoDate} onChange={e => setB2bPoDate(e.target.value)}
                        className="mt-1 w-full rounded-[8px] px-3 py-2 text-sm focus:outline-none" style={inputStyle} />
                    </div>
                  )}
                  {!isSingleB2B && (
                    <>
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
                    </>
                  )}
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
              <button onClick={() => isSingleB2B ? save() : setStep('pay')} disabled={saving}
                className="w-full py-3 rounded-[11px] font-semibold text-sm text-white"
                style={{ background: saving ? '#999' : 'var(--accent)' }}>
                {isSingleB2B ? (saving ? 'กำลังบันทึก...' : 'บันทึกแผน') : 'ถัดไป → บันทึกงวดแรก'}
              </button>
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
                  <input type="date" lang="th-TH" value={paidDate} onChange={e => setPaidDate(e.target.value)}
                    className="mt-1 w-full rounded-[8px] px-3 py-2 text-sm focus:outline-none" style={inputStyle} />
                </div>
              </div>
              <div>
                <label className="text-xs" style={{ color: 'var(--text-2)' }}>ช่องทางชำระเงิน</label>
                <select value={channel} onChange={e => setChannel(e.target.value)}
                  className="mt-1 w-full rounded-[8px] px-3 py-2 text-sm focus:outline-none appearance-none" style={inputStyle}>
                  {CHANNEL_OPTS.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>
              {firstInst?.final && (
                <div className="space-y-2">
                  <label className="flex items-center gap-2 cursor-pointer select-none text-xs"
                    style={{ color: useVoucher ? 'var(--accent)' : 'var(--text-2)' }}>
                    <input type="checkbox" checked={useVoucher} onChange={e => setUseVoucher(e.target.checked)}
                      className="w-4 h-4 rounded" style={{ accentColor: 'var(--accent)' }} />
                    ใช้ Voucher / ส่วนลด
                  </label>
                  {useVoucher && (
                    <div className="flex gap-2">
                      <div className="flex-1">
                        <label className="text-xs" style={{ color: 'var(--text-2)' }}>รหัส Voucher</label>
                        <input type="text" value={voucherCode} onChange={e => setVoucherCode(e.target.value)}
                          placeholder="เช่น VOU-2024-001"
                          className="mt-1 w-full rounded-[8px] px-3 py-2 text-sm focus:outline-none" style={inputStyle} />
                      </div>
                      <div className="w-32">
                        <label className="text-xs" style={{ color: 'var(--text-2)' }}>มูลค่า (บาท)</label>
                        <input type="number" value={voucherAmount || ''} onChange={e => setVoucherAmount(Number(e.target.value))}
                          placeholder="0"
                          className="mt-1 w-full rounded-[8px] px-3 py-2 text-sm focus:outline-none" style={inputStyle} />
                      </div>
                    </div>
                  )}
                </div>
              )}
              <div className="rounded-[8px] p-3 space-y-2" style={{ background: 'var(--hover-bg)', border: '1px solid var(--divider)' }}>
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

// ─── PayModal ──────────────────────────────────────────────
export function PayModal({ job, onClose, onSaved }: { job: FullJob; onClose: () => void; onSaved: () => void }) {
  const supabase = createClient()
  const allInsts = [...job.installments].sort((a, b) => a.installment_no - b.installment_no)
  const firstPending = allInsts.find(i => i.status !== 'paid') || allInsts[0] || null
  const [selected, setSelected] = useState<Installment | null>(firstPending)
  const [paidDate, setPaidDate] = useState(firstPending?.paid_date || todayStr())
  const [paidAmount, setPaidAmount] = useState(firstPending?.paid_amount ?? firstPending?.amount ?? 0)
  const [channel, setChannel] = useState(firstPending?.channel || CHANNEL_OPTS[0])
  const [slipPosted, setSlipPosted] = useState(false)
  const [receiptPosted, setReceiptPosted] = useState(false)
  const [useVoucher, setUseVoucher] = useState(!!(firstPending?.voucher_amount))
  const [voucherCode, setVoucherCode] = useState(firstPending?.voucher_code || '')
  const [voucherAmount, setVoucherAmount] = useState(firstPending?.voucher_amount || 0)
  const [saving, setSaving] = useState(false)

  function selectInst(inst: Installment) {
    setSelected(inst)
    setPaidAmount(inst.paid_amount ?? inst.amount ?? 0)
    setPaidDate(inst.paid_date || todayStr())
    setChannel(inst.channel || CHANNEL_OPTS[0])
    setSlipPosted(inst.slip_url === 'posted')
    setReceiptPosted(inst.receipt_url === 'posted')
    setUseVoucher(!!(inst.voucher_amount))
    setVoucherCode(inst.voucher_code || '')
    setVoucherAmount(inst.voucher_amount || 0)
  }

  async function save() {
    if (!selected) return
    setSaving(true)
    if (selected.is_work_trigger && !job.work_start_date) {
      await supabase.from('jobs').update({ work_start_date: paidDate, working_status: 'ดำเนินการ' }).eq('id', job.id)
      if (job.customer_id) {
        await supabase.from('customers').update({ status: 'closed' }).eq('id', job.customer_id)
      }
    }
    const vcCode = useVoucher && voucherCode ? voucherCode : null
    const vcAmt = useVoucher && voucherAmount > 0 ? voucherAmount : 0
    await supabase.from('payments').update({
      status: 'paid', paid_date: paidDate, paid_amount: paidAmount,
      channel: channel || null,
      slip_url: slipPosted ? 'posted' : null,
      receipt_url: receiptPosted ? 'posted' : null,
      voucher_code: vcCode,
      voucher_amount: vcAmt || null,
    }).eq('id', selected.id)
    // Auto-send LINE (only if not already sent)
    if (!selected.line_notified_at) {
      const lineMsg = generateLineMsg(job, { ...selected, paid_date: paidDate, paid_amount: paidAmount, channel, voucher_code: vcCode, voucher_amount: vcAmt })
      const result = await sendLineNotify(lineMsg)
      if (result.ts) await supabase.from('payments').update({ line_notified_at: result.ts }).eq('id', selected.id)
    }
    setSaving(false); onSaved(); onClose()
  }

  const inputStyle = { background: 'var(--input-bg)', border: '1px solid var(--divider)', color: 'var(--text-1)' }

  return (
    <div className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center px-4 pb-4 pt-14 lg:pt-4" onClick={onClose}>
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
      <div data-panel className="relative w-full max-w-sm rounded-[18px] shadow-2xl max-h-[90vh] overflow-y-auto"
        style={{ background: 'var(--panel-bg)', border: '1px solid var(--card-border)' }}
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
                className="mt-1 w-full rounded-[8px] px-3 py-2 text-sm focus:outline-none font-semibold" style={inputStyle} />
            </div>
            <div>
              <label className="text-xs" style={{ color: 'var(--text-2)' }}>วันที่รับเงิน</label>
              <input type="date" lang="th-TH" value={paidDate} onChange={e => setPaidDate(e.target.value)}
                className="mt-1 w-full rounded-[8px] px-3 py-2 text-sm focus:outline-none" style={inputStyle} />
            </div>
          </div>
          <div>
            <label className="text-xs" style={{ color: 'var(--text-2)' }}>ช่องทางชำระเงิน</label>
            <select value={channel} onChange={e => setChannel(e.target.value)}
              className="mt-1 w-full rounded-[8px] px-3 py-2 text-sm focus:outline-none appearance-none" style={inputStyle}>
              {CHANNEL_OPTS.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
          <div className="space-y-2">
            <label className="flex items-center gap-2 cursor-pointer select-none text-xs"
              style={{ color: useVoucher ? 'var(--accent)' : 'var(--text-2)' }}>
              <input type="checkbox" checked={useVoucher} onChange={e => setUseVoucher(e.target.checked)}
                className="w-4 h-4 rounded" style={{ accentColor: 'var(--accent)' }} />
              ใช้ Voucher / ส่วนลด
            </label>
            {useVoucher && (
              <div className="flex gap-2">
                <div className="flex-1">
                  <label className="text-xs" style={{ color: 'var(--text-2)' }}>รหัส Voucher</label>
                  <input type="text" value={voucherCode} onChange={e => setVoucherCode(e.target.value)}
                    placeholder="เช่น VOU-2024-001"
                    className="mt-1 w-full rounded-[8px] px-3 py-2 text-sm focus:outline-none" style={inputStyle} />
                </div>
                <div className="w-32">
                  <label className="text-xs" style={{ color: 'var(--text-2)' }}>มูลค่า (บาท)</label>
                  <input type="number" value={voucherAmount || ''} onChange={e => setVoucherAmount(Number(e.target.value))}
                    placeholder="0"
                    className="mt-1 w-full rounded-[8px] px-3 py-2 text-sm focus:outline-none" style={inputStyle} />
                </div>
              </div>
            )}
          </div>
          <div className="rounded-[8px] p-3 space-y-2" style={{ background: 'var(--hover-bg)', border: '1px solid var(--divider)' }}>
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
          {useVoucher && voucherAmount > 0 && (
            <div className="rounded-[8px] px-3 py-2.5 space-y-1" style={{ background: 'var(--hover-bg)', border: '1px solid var(--divider)' }}>
              <div className="flex justify-between text-xs" style={{ color: 'var(--text-2)' }}>
                <span>มูลค่างวด</span><span>{fmtBaht(paidAmount)}</span>
              </div>
              <div className="flex justify-between text-xs" style={{ color: 'var(--accent-orange)' }}>
                <span>หัก Voucher{voucherCode ? ` (${voucherCode})` : ''}</span><span>-{fmtBaht(voucherAmount)}</span>
              </div>
              <div className="flex justify-between text-xs font-bold border-t pt-1" style={{ color: 'var(--accent-green)', borderColor: 'var(--divider)' }}>
                <span>ยอดรับจริง</span><span>{fmtBaht(Math.max(0, paidAmount - voucherAmount))}</span>
              </div>
            </div>
          )}
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

// ─── HandoverModal ────────────────────────────────────────
export function HandoverModal({ job, onClose, onSaved }: { job: FullJob; onClose: () => void; onSaved: () => void }) {
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
      actual_deliver_date: deliverDate, working_status: 'ส่งมอบแล้ว', commission_month: commissionMonth,
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
    <div className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center px-4 pb-4 pt-14 lg:pt-4" onClick={onClose}>
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
      <div data-panel className="relative w-full max-w-sm rounded-[18px] shadow-2xl"
        style={{ background: 'var(--panel-bg)', border: '1px solid var(--card-border)' }}
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
            <input type="date" lang="th-TH" value={deliverDate} onChange={e => setDeliverDate(e.target.value)}
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
                    className="mt-1 w-full rounded-[8px] px-3 py-2 text-sm focus:outline-none font-semibold" style={inputStyle} />
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

// ─── RevenueCard ──────────────────────────────────────────
export function RevenueCard({ job, onUpdated }: {
  job: { id: string; revenue_ex_vat: number; revenue_inc_vat: number }
  onUpdated: (exVat: number, incVat: number) => void
}) {
  const supabase = createClient()
  const [editing, setEditing] = useState(false)
  const [exVat, setExVat] = useState(String(job.revenue_ex_vat || ''))
  const [incVat, setIncVat] = useState(String(job.revenue_inc_vat || ''))
  const [saving, setSaving] = useState(false)
  const inputStyle = { background: 'var(--input-bg)', border: '1px solid var(--divider)', color: 'var(--text-1)' }

  function openEdit() { setExVat(String(job.revenue_ex_vat || '')); setIncVat(String(job.revenue_inc_vat || '')); setEditing(true) }
  function handleExChange(v: string) { setExVat(v); const n = parseFloat(v); if (!isNaN(n) && n > 0) setIncVat(String(Math.round(n * 1.07))); else setIncVat('') }
  function handleIncChange(v: string) { setIncVat(v); const n = parseFloat(v); if (!isNaN(n) && n > 0) setExVat(String(Math.round(n / 1.07))); else setExVat('') }

  async function save() {
    setSaving(true)
    const ex = parseFloat(exVat) || 0; const inc = parseFloat(incVat) || 0
    await supabase.from('jobs').update({ revenue_ex_vat: ex, revenue_inc_vat: inc }).eq('id', job.id)
    onUpdated(ex, inc); setSaving(false); setEditing(false)
  }

  if (editing) return (
    <div className="rounded-[11px] p-4" style={{ background: 'var(--hover-bg)', border: '1px solid var(--accent)' }}>
      <p className="text-xs font-semibold mb-3" style={{ color: 'var(--text-3)' }}>แก้ไขมูลค่างาน (VAT 7%)</p>
      <div className="space-y-2">
        <div>
          <label className="text-xs mb-1 block" style={{ color: 'var(--text-3)' }}>ราคา ex. VAT (บาท)</label>
          <input type="number" value={exVat} onChange={e => handleExChange(e.target.value)}
            className="w-full px-3 py-2 rounded-[8px] text-sm focus:outline-none" style={inputStyle} />
        </div>
        <div>
          <label className="text-xs mb-1 block" style={{ color: 'var(--text-3)' }}>ราคา inc. VAT (บาท)</label>
          <input type="number" value={incVat} onChange={e => handleIncChange(e.target.value)}
            className="w-full px-3 py-2 rounded-[8px] text-sm focus:outline-none" style={inputStyle} />
        </div>
      </div>
      <div className="flex gap-2 mt-3">
        <button onClick={() => setEditing(false)} className="flex-1 py-2 rounded-[8px] text-sm" style={{ color: 'var(--text-3)', background: 'var(--card-bg)' }}>ยกเลิก</button>
        <button onClick={save} disabled={saving} className="flex-1 py-2 rounded-[8px] text-sm font-semibold text-white disabled:opacity-50" style={{ background: 'var(--accent)' }}>
          {saving ? '...' : 'บันทึก'}
        </button>
      </div>
    </div>
  )

  return (
    <div className="rounded-[11px] p-4 flex items-center justify-between" style={{ background: 'var(--hover-bg)' }}>
      <div>
        <p className="text-xs" style={{ color: 'var(--text-3)' }}>มูลค่างาน (inc. VAT)</p>
        <p className="text-xl font-bold mt-0.5" style={{ color: 'var(--text-1)' }}>{fmtBaht(job.revenue_inc_vat || job.revenue_ex_vat)}</p>
        {job.revenue_ex_vat > 0 && <p className="text-xs mt-0.5" style={{ color: 'var(--text-3)' }}>ex. VAT {fmtBaht(job.revenue_ex_vat)}</p>}
      </div>
      <button onClick={openEdit} className="p-2 rounded-[8px]" style={{ color: 'var(--text-3)', background: 'var(--card-bg)' }}>
        <Pencil size={14} />
      </button>
    </div>
  )
}

// ─── InstRow ──────────────────────────────────────────────
export function InstRow({ inst, job, onDateSaved, onDeleted, onUpdated, onCollect }: {
  inst: Installment
  job: { project_name: string; room_no: string; customer_name: string; sales_name: string; revenue_inc_vat: number; working_status: string }
  onDateSaved: (d: string | null) => void
  onDeleted?: () => void
  onUpdated?: (patch: Partial<Installment>) => void
  onCollect?: () => void
}) {
  const supabase = createClient()
  const [editingDate, setEditingDate] = useState(false)
  const [dateVal, setDateVal] = useState(inst.paid_date || todayStr())
  const [saving, setSaving] = useState(false)
  const [slipUrl, setSlipUrl] = useState(inst.slip_url)
  const [receiptUrl, setReceiptUrl] = useState(inst.receipt_url)
  const [savingSlip, setSavingSlip] = useState(false)
  const [savingReceipt, setSavingReceipt] = useState(false)
  const [lineSending, setLineSending] = useState(false)
  const [lineSent, setLineSent] = useState<'ok' | 'err' | null>(null)
  const [lineNotifiedAt, setLineNotifiedAt] = useState<string | null>(inst.line_notified_at)
  const [copied, setCopied] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [channel, setChannel] = useState(inst.channel || CHANNEL_OPTS[0])
  const [editing, setEditing] = useState(false)
  const [editName, setEditName] = useState(inst.installment_name)
  const [editAmount, setEditAmount] = useState(String(inst.amount || ''))
  const [editDueDate, setEditDueDate] = useState(inst.due_date || todayStr())
  const [editingAmount, setEditingAmount] = useState(false)
  const [amountVal, setAmountVal] = useState(String(inst.paid_amount ?? inst.amount ?? ''))

  async function deleteInst() {
    if (!confirm(`ลบงวด "${inst.installment_name}" (${fmtBaht(inst.amount)}) ออกจากระบบ?`)) return
    setDeleting(true)
    await supabase.from('payments').delete().eq('id', inst.id)
    setDeleting(false); onDeleted?.()
  }
  async function saveChannel(val: string) { setChannel(val); await supabase.from('payments').update({ channel: val }).eq('id', inst.id) }
  function copyLine() {
    const msg = generateLineMsg(job, { ...inst, paid_date: dateVal, channel })
    navigator.clipboard.writeText(msg).then(() => { setCopied(true); setTimeout(() => setCopied(false), 2000) })
  }
  async function sendLine(force = false) {
    if (lineNotifiedAt && !force) return
    if (force && !confirm('ส่ง LINE notification อีกครั้ง?')) return
    setLineSending(true)
    const msg = generateLineMsg(job, { ...inst, paid_date: dateVal, channel })
    const result = await sendLineNotify(msg)
    if (result.ts) {
      await supabase.from('payments').update({ line_notified_at: result.ts }).eq('id', inst.id)
      setLineNotifiedAt(result.ts); setLineSent('ok')
    } else {
      alert(`ส่ง LINE ไม่สำเร็จ: ${result.error}`); setLineSent('err')
    }
    setLineSending(false); setTimeout(() => setLineSent(null), 3000)
  }
  async function saveDate() {
    setSaving(true)
    await supabase.from('payments').update({ paid_date: dateVal }).eq('id', inst.id)
    onDateSaved(dateVal); setSaving(false); setEditingDate(false)
  }
  async function toggleSlip() {
    setSavingSlip(true)
    const newVal = slipUrl ? null : 'posted'
    await supabase.from('payments').update({ slip_url: newVal }).eq('id', inst.id)
    setSlipUrl(newVal); setSavingSlip(false)
  }
  async function toggleReceipt() {
    setSavingReceipt(true)
    const newVal = receiptUrl ? null : 'posted'
    await supabase.from('payments').update({ receipt_url: newVal }).eq('id', inst.id)
    setReceiptUrl(newVal); setSavingReceipt(false)
  }
  async function saveEdit() {
    setSaving(true)
    const patch = { installment_name: editName, amount: Number(editAmount) || inst.amount, due_date: editDueDate || null }
    await supabase.from('payments').update(patch).eq('id', inst.id)
    onUpdated?.(patch); setSaving(false); setEditing(false)
  }
  async function saveAmount() {
    const num = Number(amountVal)
    if (!num) return
    setSaving(true)
    await supabase.from('payments').update({ paid_amount: num, amount: num }).eq('id', inst.id)
    onUpdated?.({ paid_amount: num, amount: num }); setSaving(false); setEditingAmount(false)
  }

  const fieldLabelStyle: React.CSSProperties = { color: 'var(--text-3)', fontSize: '10px', minWidth: '72px', flexShrink: 0 }
  const docBtnStyle = (active: boolean, activeColor: string): React.CSSProperties => ({
    display: 'inline-flex', alignItems: 'center', gap: '4px',
    fontSize: '10px', fontWeight: 500, padding: '2px 0', background: 'none', border: 'none',
    color: active ? activeColor : 'var(--text-3)', cursor: 'pointer',
  })

  if (editing && inst.status !== 'paid') return (
    <div className="px-4 py-3 space-y-2">
      <input value={editName} onChange={e => setEditName(e.target.value)}
        className="w-full px-3 py-1.5 rounded-[8px] text-xs focus:outline-none"
        style={{ background: 'var(--input-bg)', border: '1px solid var(--divider)', color: 'var(--text-1)' }} />
      <div className="flex gap-2">
        <input type="number" value={editAmount} onChange={e => setEditAmount(e.target.value)} placeholder="ยอด"
          className="flex-1 px-3 py-1.5 rounded-[8px] text-xs focus:outline-none"
          style={{ background: 'var(--input-bg)', border: '1px solid var(--divider)', color: 'var(--text-1)' }} />
        <input type="date" lang="th-TH" value={editDueDate} onChange={e => setEditDueDate(e.target.value)}
          className="flex-1 px-3 py-1.5 rounded-[8px] text-xs focus:outline-none"
          style={{ background: 'var(--input-bg)', border: '1px solid var(--divider)', color: 'var(--text-1)' }} />
      </div>
      <div className="flex gap-2">
        <button onClick={() => setEditing(false)} className="flex-1 py-1.5 rounded-[8px] text-xs"
          style={{ background: 'var(--hover-bg)', border: '1px solid var(--divider)', color: 'var(--text-2)' }}>ยกเลิก</button>
        <button onClick={saveEdit} disabled={saving} className="flex-1 py-1.5 rounded-[8px] text-xs font-semibold text-white"
          style={{ background: 'var(--accent)' }}>{saving ? '...' : 'บันทึก'}</button>
      </div>
    </div>
  )

  return (
    <div className="px-4 py-2.5">
      {/* ── Line 1: status · name · badges · amount · date ── */}
      <div className="flex items-center gap-1.5 flex-wrap">
        <div className="flex-shrink-0">
          {inst.status === 'paid'
            ? <CheckCircle2 size={14} style={{ color: 'var(--accent-green)' }} />
            : <Circle size={14} style={{ color: 'var(--text-3)' }} />}
        </div>
        <span className="text-[11px] font-semibold" style={{ color: 'var(--text-1)' }}>
          งวด {inst.installment_no} · {inst.installment_name}
        </span>
        {inst.is_final && (
          <span className="text-[9px] px-1.5 py-0.5 rounded-[4px] font-semibold" style={{ background: 'color-mix(in srgb, var(--accent-orange) 12%, transparent)', color: 'var(--accent-orange)' }}>สุดท้าย</span>
        )}
        {inst.is_work_trigger && inst.status !== 'paid' && (
          <span className="text-[9px] px-1.5 py-0.5 rounded-[4px] font-semibold" style={{ background: 'color-mix(in srgb, var(--accent) 12%, transparent)', color: 'var(--accent)' }}>เริ่มงาน</span>
        )}
        <div className="flex-1" />
        {/* Amount chip */}
        {inst.status === 'paid' && editingAmount ? (
          <div className="flex items-center gap-1">
            <input type="number" value={amountVal} onChange={e => setAmountVal(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') saveAmount(); if (e.key === 'Escape') setEditingAmount(false) }}
              autoFocus className="text-xs font-semibold w-24 px-2 py-0.5 rounded-[6px] focus:outline-none text-right"
              style={{ background: 'var(--input-bg)', border: '1px solid var(--accent)', color: 'var(--accent-green)' }} />
            <button onClick={saveAmount} disabled={saving} className="text-[10px] px-1.5 py-0.5 rounded font-semibold text-white" style={{ background: 'var(--accent)' }}>{saving ? '...' : '✓'}</button>
            <button onClick={() => setEditingAmount(false)} className="text-[10px]" style={{ color: 'var(--text-3)' }}>✕</button>
          </div>
        ) : (
          <button
            onClick={inst.status === 'paid' ? () => { setAmountVal(String(inst.paid_amount ?? inst.amount ?? '')); setEditingAmount(true) } : undefined}
            className="group flex items-center gap-1 rounded-[6px] px-1.5 py-0.5 transition-colors"
            style={{ background: 'none', border: 'none', cursor: inst.status === 'paid' ? 'pointer' : 'default' }}
            title={inst.status === 'paid' ? 'คลิกเพื่อแก้ไขยอด' : undefined}>
            <span className="text-[13px] font-bold tabular-nums" style={{ color: inst.status === 'paid' ? 'var(--accent-green)' : 'var(--text-2)' }}>
              {fmtBaht(inst.paid_amount ?? inst.amount)}
            </span>
            {inst.status === 'paid' && <Pencil size={9} className="opacity-0 group-hover:opacity-60 transition-opacity" style={{ color: 'var(--accent-green)' }} />}
          </button>
        )}
        {/* Pending: edit pencil */}
        {inst.status !== 'paid' && (
          <button onClick={() => { setEditName(inst.installment_name); setEditAmount(String(inst.amount || '')); setEditDueDate(inst.due_date || todayStr()); setEditing(true) }}
            className="p-1 rounded" style={{ color: 'var(--text-3)', background: 'none', border: 'none', cursor: 'pointer' }}
            onMouseEnter={e => (e.currentTarget.style.color = 'var(--text-1)')}
            onMouseLeave={e => (e.currentTarget.style.color = 'var(--text-3)')}>
            <Pencil size={11} />
          </button>
        )}
      </div>

      {/* Pending: due date + amount */}
      {inst.status !== 'paid' && inst.due_date && (
        <div className="ml-5 mt-0.5 text-[10px]" style={{ color: 'var(--text-3)' }}>ครบ {fmtDate(inst.due_date)}</div>
      )}

      {/* Paid: voucher box */}
      {inst.status === 'paid' && inst.voucher_amount && inst.voucher_amount > 0 && (
        <div className="ml-5 mt-1 text-[10px] rounded-[6px] overflow-hidden" style={{ border: '1px solid var(--divider)' }}>
          <div className="px-2 py-1 space-y-0.5" style={{ background: 'var(--hover-bg)' }}>
            <div className="flex justify-between">
              <span style={{ color: 'var(--text-3)' }}>ยอดงวด (Gross)</span>
              <span style={{ color: 'var(--text-2)' }}>{fmtBaht(inst.amount)}</span>
            </div>
            <div className="flex justify-between">
              <span style={{ color: 'var(--text-3)' }}>หัก Voucher</span>
              <span style={{ color: 'var(--accent-orange)' }}>-{fmtBaht(inst.voucher_amount)}</span>
            </div>
            {inst.voucher_code && (
              <div style={{ color: 'var(--text-3)', paddingLeft: '8px' }}>No. {inst.voucher_code}</div>
            )}
          </div>
          <div className="px-2 py-1 flex justify-between" style={{ borderTop: '1px solid var(--divider)' }}>
            <span style={{ color: 'var(--text-3)' }}>รับจริง (Net)</span>
            <span style={{ color: 'var(--accent-green)', fontWeight: 600 }}>{fmtBaht(inst.paid_amount ?? Math.max(0, inst.amount - inst.voucher_amount))}</span>
          </div>
        </div>
      )}

      {/* Paid body: Lines 2-4 */}
      {inst.status === 'paid' && (
        <div className="ml-5 mt-2 space-y-1.5">
          {/* Line 2 — วันที่รับเงิน */}
          <div className="flex items-center gap-2">
            <span style={fieldLabelStyle}>วันที่รับเงิน</span>
            {editingDate ? (
              <div className="flex items-center gap-1">
                <input type="date" lang="th-TH" value={dateVal} onChange={e => setDateVal(e.target.value)}
                  className="text-[10px] rounded px-2 py-1 focus:outline-none"
                  style={{ background: 'var(--input-bg)', border: '1px solid var(--divider)', color: 'var(--text-1)' }} />
                <button onClick={saveDate} disabled={saving} className="text-[10px] px-1.5 py-0.5 rounded font-semibold text-white" style={{ background: 'var(--accent)' }}>{saving ? '...' : '✓'}</button>
                <button onClick={() => setEditingDate(false)} className="text-[10px]" style={{ color: 'var(--text-3)' }}>✕</button>
              </div>
            ) : (
              <button onClick={() => { setDateVal(inst.paid_date || todayStr()); setEditingDate(true) }}
                className="group flex items-center gap-1.5 px-2 py-1 rounded-[6px]"
                style={{ background: 'var(--hover-bg)', border: '1px solid var(--divider)', color: inst.paid_date ? 'var(--text-2)' : 'var(--accent-orange)', cursor: 'pointer', fontSize: '10px', fontWeight: 500 }}>
                {inst.paid_date ? fmtDate(inst.paid_date) : '+ เพิ่มวันที่'}
                <Pencil size={9} className="opacity-0 group-hover:opacity-60 transition-opacity" style={{ color: 'var(--text-3)' }} />
              </button>
            )}
          </div>
          {/* Line 3 — ช่องทางชำระ */}
          <div className="flex items-center gap-2">
            <span style={fieldLabelStyle}>ช่องทางชำระ</span>
            <select value={channel} onChange={e => saveChannel(e.target.value)}
              className="text-[10px] px-2 py-1 rounded-[6px] focus:outline-none appearance-none"
              style={{ background: 'var(--input-bg)', border: '1px solid var(--divider)', color: 'var(--text-2)', fontFamily: 'inherit' }}>
              {CHANNEL_OPTS.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
          {/* Line 3 — เอกสาร */}
          <div className="flex items-center gap-2 flex-wrap">
            <span style={fieldLabelStyle}>เอกสาร</span>
            <button onClick={toggleSlip} disabled={savingSlip} style={{ ...docBtnStyle(!!slipUrl, '#60a5fa'), opacity: savingSlip ? 0.5 : 1 }}>
              {slipUrl ? <CheckCircle2 size={10} /> : <Circle size={10} />} Slip
            </button>
            <button onClick={toggleReceipt} disabled={savingReceipt} style={{ ...docBtnStyle(!!receiptUrl, '#4ade80'), opacity: savingReceipt ? 0.5 : 1 }}>
              {receiptUrl ? <CheckCircle2 size={10} /> : <Circle size={10} />} ใบเสร็จรับเงิน
            </button>
          </div>
          {/* Line 4 — แจ้งทีม (divider คั่นจากเอกสาร) */}
          <div className="flex items-center gap-2 flex-wrap" style={{ borderTop: '1px solid var(--divider)', paddingTop: '6px', marginTop: '2px' }}>
            <span style={fieldLabelStyle}>แจ้งทีม</span>
            {lineNotifiedAt ? (
              <button onClick={() => sendLine(true)} disabled={lineSending}
                title={`โพสต์แล้ว ${fmtDate(lineNotifiedAt)} — คลิกส่งซ้ำ`}
                className="flex items-center p-1 rounded active:scale-95 disabled:opacity-50"
                style={{ background: 'none', border: 'none', color: 'rgba(6,199,85,0.8)', cursor: 'pointer' }}>
                {lineSending ? <Loader2 size={12} className="animate-spin" /> : <CheckCircle2 size={12} />}
              </button>
            ) : (
              <button onClick={() => sendLine()} disabled={lineSending}
                title={lineSent === 'err' ? 'ส่งไม่สำเร็จ — คลิกลองใหม่' : 'ส่ง LINE อัตโนมัติ'}
                className="flex items-center p-1 rounded active:scale-95 disabled:opacity-50"
                style={{ background: 'none', border: 'none', color: lineSent === 'err' ? '#f87171' : '#06C755', cursor: 'pointer' }}>
                {lineSending ? <Loader2 size={12} className="animate-spin" /> : <span style={{ fontSize: '14px', lineHeight: 1 }}>💬</span>}
              </button>
            )}
            <button onClick={copyLine}
              className="flex items-center gap-1 p-1 rounded active:scale-95"
              title="คัดลอกข้อความโพสต์เองใน LINE"
              style={{ background: 'none', border: 'none', color: copied ? '#a78bfa' : 'var(--text-3)', cursor: 'pointer', fontSize: '10px' }}>
              {copied ? <CheckCircle2 size={10} /> : <Copy size={10} />}
              <span>{copied ? 'Copied!' : 'Copy'}</span>
            </button>
          </div>
          {/* Trash — ล่างสุดคนเดียว มีเส้น divider คั่น */}
          <div style={{ borderTop: '1px solid var(--divider)', paddingTop: '8px', marginTop: '4px' }}>
            <button onClick={deleteInst} disabled={deleting}
              className="flex items-center gap-1 px-2 py-1 rounded-[6px] active:scale-95 disabled:opacity-40"
              style={{ background: 'transparent', border: '1px solid var(--divider)', color: 'var(--text-3)', cursor: 'pointer', fontSize: '10px' }}
              onMouseEnter={e => { (e.currentTarget as HTMLElement).style.color = '#f87171'; (e.currentTarget as HTMLElement).style.borderColor = 'rgba(248,113,113,0.3)' }}
              onMouseLeave={e => { (e.currentTarget as HTMLElement).style.color = 'var(--text-3)'; (e.currentTarget as HTMLElement).style.borderColor = 'var(--divider)' }}>
              {deleting ? <Loader2 size={10} className="animate-spin" /> : <Trash2 size={10} />}
            </button>
          </div>
        </div>
      )}

      {/* Pending: บันทึกรับเงิน button */}
      {inst.status !== 'paid' && onCollect && (
        <div className="ml-5 mt-2">
          <button onClick={onCollect}
            className="w-full flex items-center justify-center gap-1.5 py-2 rounded-[8px] text-[11px] font-semibold active:scale-[0.98] transition-transform"
            style={{ background: 'rgba(99,102,241,0.1)', border: '1.5px solid rgba(99,102,241,0.3)', color: '#818cf8', cursor: 'pointer' }}>
            <Circle size={11} style={{ color: '#818cf8' }} />
            บันทึกรับเงินงวด {inst.installment_no}
          </button>
        </div>
      )}
    </div>
  )
}

// ─── AddInstallmentRow ────────────────────────────────────
export function AddInstallmentRow({ jobId, customerId, projectId, roomNo, nextNo, onAdded }: {
  jobId: string; customerId: string; projectId: string; roomNo: string; nextNo: number
  onAdded: (inst: Installment) => void
}) {
  const supabase = createClient()
  const [open, setOpen] = useState(false)
  const [name, setName] = useState(`งวดที่ ${nextNo}`)
  const [amount, setAmount] = useState('')
  const [dueDate, setDueDate] = useState(todayStr())
  const [saving, setSaving] = useState(false)

  async function add() {
    setSaving(true)
    const id = `PAY-${jobId}-${nextNo}-${Date.now()}`
    const row = {
      id, job_id: jobId, customer_id: customerId, project_id: projectId, room: roomNo,
      installment_no: nextNo, installment_name: name,
      amount: Number(amount) || 0, due_date: dueDate || null,
      status: 'pending', is_final: false, is_work_trigger: false,
    }
    await supabase.from('payments').insert(row)
    onAdded({ ...row, paid_amount: null, paid_date: null, percentage: 0, slip_url: null, receipt_url: null, channel: null, voucher_code: null, voucher_amount: null, line_notified_at: null } as Installment)
    setOpen(false); setName(`งวดที่ ${nextNo + 1}`); setAmount(''); setSaving(false)
  }

  if (!open) return (
    <div className="px-4 py-2">
      <button onClick={() => setOpen(true)} className="flex items-center gap-1.5 text-xs" style={{ color: 'var(--text-3)' }}
        onMouseEnter={e => (e.currentTarget.style.color = 'var(--accent)')}
        onMouseLeave={e => (e.currentTarget.style.color = 'var(--text-3)')}>
        <Plus size={11} /> เพิ่มงวด
      </button>
    </div>
  )

  return (
    <div className="px-4 py-3 space-y-2">
      <input value={name} onChange={e => setName(e.target.value)}
        className="w-full px-3 py-1.5 rounded-[8px] text-xs focus:outline-none"
        style={{ background: 'var(--input-bg)', border: '1px solid var(--divider)', color: 'var(--text-1)' }} />
      <div className="flex gap-2">
        <input type="number" value={amount} onChange={e => setAmount(e.target.value)} placeholder="ยอด (บาท)"
          className="flex-1 px-3 py-1.5 rounded-[8px] text-xs focus:outline-none"
          style={{ background: 'var(--input-bg)', border: '1px solid var(--divider)', color: 'var(--text-1)' }} />
        <input type="date" lang="th-TH" value={dueDate} onChange={e => setDueDate(e.target.value)}
          className="flex-1 px-3 py-1.5 rounded-[8px] text-xs focus:outline-none"
          style={{ background: 'var(--input-bg)', border: '1px solid var(--divider)', color: 'var(--text-1)' }} />
      </div>
      <div className="flex gap-2">
        <button onClick={() => setOpen(false)} className="flex-1 py-1.5 rounded-[8px] text-xs"
          style={{ background: 'var(--hover-bg)', border: '1px solid var(--divider)', color: 'var(--text-2)' }}>ยกเลิก</button>
        <button onClick={add} disabled={saving || !amount} className="flex-1 py-1.5 rounded-[8px] text-xs font-semibold text-white disabled:opacity-50"
          style={{ background: 'var(--accent)' }}>{saving ? '...' : '+ เพิ่ม'}</button>
      </div>
    </div>
  )
}

// ─── DocField ─────────────────────────────────────────────
export function DocField({ jobId, field, label, value, onUpdate }: {
  jobId: string; field: string; label: string; value: string | null; onUpdate: (v: string | null) => void
}) {
  const supabase = createClient()
  const [saving, setSaving] = useState(false)
  const checked = !!value
  async function toggle() {
    setSaving(true)
    const newVal = checked ? null : 'posted'
    await supabase.from('jobs').update({ [field]: newVal }).eq('id', jobId)
    onUpdate(newVal); setSaving(false)
  }
  return (
    <label className="flex items-center gap-3 px-3 py-2.5 rounded-[8px] cursor-pointer select-none"
      style={{ background: checked ? 'color-mix(in srgb, var(--accent-green) 10%, transparent)' : 'var(--hover-bg)', border: `1px solid ${checked ? 'color-mix(in srgb, var(--accent-green) 30%, transparent)' : 'var(--divider)'}` }}>
      <input type="checkbox" checked={checked} onChange={toggle} disabled={saving}
        className="w-4 h-4 rounded flex-shrink-0" style={{ accentColor: 'var(--accent-green)' }} />
      <span className="text-xs font-semibold flex-1" style={{ color: checked ? 'var(--accent-green)' : 'var(--text-2)' }}>{label}</span>
      {saving && <span className="text-[10px]" style={{ color: 'var(--text-3)' }}>...</span>}
    </label>
  )
}

// ─── JobCancelModal ───────────────────────────────────────
function JobCancelModal({ onClose, onConfirm }: {
  onClose: () => void
  onConfirm: (type: 'forfeit' | 'refund', amount: number, date: string, notes: string) => Promise<void>
}) {
  const [cancelType, setCancelType] = useState<'forfeit' | 'refund'>('forfeit')
  const [amount, setAmount] = useState('')
  const [date, setDate] = useState(todayStr())
  const [notes, setNotes] = useState('')
  const [saving, setSaving] = useState(false)

  async function confirm() { setSaving(true); await onConfirm(cancelType, Number(amount) || 0, date, notes); setSaving(false) }

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center px-4 pb-4 pt-14 lg:pt-4" onClick={onClose}>
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
      <div data-panel className="relative rounded-[16px] p-5 w-full max-w-sm space-y-4"
        style={{ background: 'var(--panel-bg)', border: '1px solid var(--card-border)' }}
        onClick={e => e.stopPropagation()}>
        <p className="font-bold text-sm" style={{ color: 'var(--text-1)' }}>ยกเลิกสัญญา</p>
        <div className="flex gap-2">
          {([['forfeit', 'ยึดเงินจอง'], ['refund', 'คืนเงิน']] as const).map(([val, label]) => (
            <button key={val} onClick={() => setCancelType(val)}
              className="flex-1 py-2 rounded-[8px] text-sm font-semibold"
              style={cancelType === val ? { background: val === 'forfeit' ? '#f87171' : '#60a5fa', color: '#fff' }
                : { background: 'var(--hover-bg)', color: 'var(--text-2)', border: '1px solid var(--divider)' }}>
              {label}
            </button>
          ))}
        </div>
        <div className="space-y-2">
          <div>
            <label className="text-xs mb-1 block" style={{ color: 'var(--text-2)' }}>{cancelType === 'forfeit' ? 'ยอดที่ยึด (บาท)' : 'ยอดคืน (บาท)'}</label>
            <input type="number" value={amount} onChange={e => setAmount(e.target.value)} placeholder="0"
              className="w-full px-3 py-2 rounded-[8px] text-sm focus:outline-none"
              style={{ background: 'var(--input-bg)', border: '1px solid var(--divider)', color: 'var(--text-1)' }} />
          </div>
          <div>
            <label className="text-xs mb-1 block" style={{ color: 'var(--text-2)' }}>{cancelType === 'forfeit' ? 'วันที่ยึดเงิน' : 'วันที่คืนเงิน'}</label>
            <input type="date" lang="th-TH" value={date} onChange={e => setDate(e.target.value)}
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
          <button onClick={onClose} className="flex-1 py-2 rounded-[8px] text-sm" style={{ border: '1px solid var(--divider)', color: 'var(--text-2)' }}>ยกเลิก</button>
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

// ─── DealDrawer (shared, exported) ───────────────────────
export function DealDrawer({ job: initialJob, onClose, onRefresh, topSlot }: {
  job: FullJob
  onClose: () => void
  onRefresh: () => void
  topSlot?: React.ReactNode
}) {
  const supabase = createClient()
  const [job, setJob] = useState(initialJob)
  const [actionModal, setActionModal] = useState<'setup' | 'pay' | 'handover' | null>(null)
  const [docsExpanded, setDocsExpanded] = useState(false)
  const [showCancel, setShowCancel] = useState(false)
  const [showCancelSection, setShowCancelSection] = useState(false)
  const [cancelConfirmed, setCancelConfirmed] = useState(false)
  const [contractDateVal, setContractDateVal] = useState(job.contract_date || '')
  const [expectedDateVal, setExpectedDateVal] = useState(job.expected_finish_date || '')
  const [editingContract, setEditingContract] = useState(false)
  const [editingExpected, setEditingExpected] = useState(false)
  useEffect(() => { setJob(initialJob); setContractDateVal(initialJob.contract_date || ''); setExpectedDateVal(initialJob.expected_finish_date || '') }, [initialJob])

  async function saveDateField(field: 'contract_date' | 'expected_finish_date', val: string) {
    const v = val || null
    await supabase.from('jobs').update({ [field]: v }).eq('id', job.id)
    setJob(prev => ({ ...prev, [field]: v }))
  }

  const { hasPlan, finalPaid, delivered, paidCount, totalCount, pendingInstallments, activeStage } = getFullStageInfo(job)
  const overdueCount = job.installments.filter(i => i.status === 'overdue').length

  function updateDocField(field: keyof FullJob, val: string | null) { setJob(prev => ({ ...prev, [field]: val })) }
  function handleSaved() { onRefresh() }

  const stages = [
    { label: 'ขาย', icon: ShoppingCart, done: true },
    { label: 'เปิดงาน', icon: Wrench, done: hasPlan },
    { label: 'เก็บเงิน', icon: Wallet, done: finalPaid },
    { label: 'ส่งมอบ', icon: Package, done: delivered },
  ]

  return (
    <>
      {/* Backdrop */}
      <div className="fixed inset-0 z-40 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      {/* Panel */}
      <div className="fixed inset-0 z-50 flex items-center justify-center pointer-events-none px-4 pb-4 pt-14 lg:pt-4">
        <div data-panel className="w-full max-w-[460px] max-h-[90vh] flex flex-col rounded-[20px] shadow-2xl pointer-events-auto"
          style={{ background: 'var(--panel-bg)', border: '1px solid var(--card-border)' }}>

          {/* Header */}
          <div className="flex items-center justify-between px-5 py-4" style={{ borderBottom: '1px solid var(--divider)' }}>
            <div>
              <div className="flex items-center gap-2">
                <span className="px-2.5 py-1 rounded-[8px] font-bold text-xs text-white"
                  style={{ background: delivered ? 'var(--accent-green)' : activeStage === 3 ? 'var(--accent-orange)' : activeStage === 4 ? 'var(--accent-blue)' : 'var(--accent)' }}>
                  {job.room_no}
                </span>
                <span className="font-semibold text-sm" style={{ color: 'var(--text-1)' }}>{job.project_name}</span>
              </div>
              <p className="text-xs mt-1" style={{ color: 'var(--text-3)' }}>
                {job.customer_name}{job.sales_name ? ` · ${job.sales_name}` : ''}
              </p>
            </div>
            <button onClick={onClose} className="p-1 rounded-lg" style={{ color: 'var(--text-2)' }}><X size={18} /></button>
          </div>

          <div className="flex-1 overflow-y-auto p-5 space-y-4">
            {/* Revenue */}
            <RevenueCard job={job} onUpdated={(exVat, incVat) => setJob(prev => ({ ...prev, revenue_ex_vat: exVat, revenue_inc_vat: incVat }))} />

            {/* 3-column date row — same height, same Thai format */}
            <div className="grid grid-cols-3 gap-2">
              {/* วันรับจอง / รับ PO — read-only */}
              <div className="rounded-[11px] px-3 py-2.5" style={{ background: 'var(--hover-bg)' }}>
                <p className="text-[10px]" style={{ color: 'var(--text-3)' }}>{job.customer_type === 'B2B' ? 'วันรับ PO' : 'วันรับจอง'}</p>
                <p className="text-xs font-bold mt-1.5" style={{ color: job.order_date ? 'var(--text-1)' : 'var(--text-3)' }}>
                  {job.order_date ? fmtDate(job.order_date) : '—'}
                </p>
              </div>
              {/* วันทำสัญญา — click to edit */}
              <div className="rounded-[11px] px-3 py-2.5 cursor-pointer" style={{ background: 'var(--hover-bg)' }}
                onClick={() => !editingContract && setEditingContract(true)}>
                <p className="text-[10px]" style={{ color: 'var(--text-3)' }}>วันทำสัญญา</p>
                {editingContract ? (
                  <input type="date" lang="th-TH" value={contractDateVal} autoFocus
                    onChange={e => setContractDateVal(e.target.value)}
                    onBlur={e => { saveDateField('contract_date', e.target.value); setEditingContract(false) }}
                    onKeyDown={e => { if (e.key === 'Enter' || e.key === 'Escape') { saveDateField('contract_date', contractDateVal); setEditingContract(false) } }}
                    className="w-full text-xs font-semibold focus:outline-none mt-1"
                    style={{ background: 'transparent', color: 'var(--text-1)', border: 'none' }} />
                ) : (
                  <p className="text-xs font-bold mt-1.5" style={{ color: contractDateVal ? 'var(--text-1)' : 'var(--text-3)' }}>
                    {contractDateVal ? fmtDate(contractDateVal) : '+ ระบุ'}
                  </p>
                )}
              </div>
              {/* วันคาดเสร็จ — click to edit */}
              <div className="rounded-[11px] px-3 py-2.5 cursor-pointer" style={{ background: 'var(--hover-bg)' }}
                onClick={() => !editingExpected && setEditingExpected(true)}>
                <p className="text-[10px]" style={{ color: 'var(--text-3)' }}>วันคาดเสร็จ</p>
                {editingExpected ? (
                  <input type="date" lang="th-TH" value={expectedDateVal} autoFocus
                    onChange={e => setExpectedDateVal(e.target.value)}
                    onBlur={e => { saveDateField('expected_finish_date', e.target.value); setEditingExpected(false) }}
                    onKeyDown={e => { if (e.key === 'Enter' || e.key === 'Escape') { saveDateField('expected_finish_date', expectedDateVal); setEditingExpected(false) } }}
                    className="w-full text-xs font-semibold focus:outline-none mt-1"
                    style={{ background: 'transparent', color: 'var(--text-1)', border: 'none' }} />
                ) : (
                  <p className="text-xs font-bold mt-1.5" style={{ color: expectedDateVal ? 'var(--text-1)' : 'var(--text-3)' }}>
                    {expectedDateVal ? fmtDate(expectedDateVal) : '+ ระบุ'}
                  </p>
                )}
              </div>
            </div>

            {/* topSlot — ย้ายสถานะ for Prospect, nothing for My Deals */}
            {topSlot}

            {hasPlan && totalCount > 0 && (
              <div className="rounded-[11px] px-4 py-3 flex items-center justify-between" style={{ background: 'var(--hover-bg)' }}>
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
                          border: s.done ? '1.5px solid color-mix(in srgb, var(--accent-green) 60%, transparent)' : isActive ? '1.5px solid var(--accent)' : '1.5px solid var(--divider)',
                        }}>
                        {s.done ? <CheckCircle2 size={14} style={{ color: 'var(--accent-green)' }} />
                          : <Icon size={13} style={{ color: isActive ? 'var(--accent)' : 'var(--text-3)' }} />}
                      </div>
                      <span className="text-[9px] font-semibold whitespace-nowrap"
                        style={{ color: s.done ? 'var(--accent-green)' : isActive ? 'var(--accent)' : 'var(--text-3)' }}>
                        {s.label}
                      </span>
                    </div>
                    {idx < stages.length - 1 && (
                      <div className="flex-1 h-[1.5px] mx-1 mb-4" style={{ background: s.done ? 'var(--accent-green)' : 'var(--divider)' }} />
                    )}
                  </div>
                )
              })}
            </div>

            {/* Installments */}
            {hasPlan && (
              <div className="rounded-[11px] overflow-hidden" style={{ border: '1px solid var(--divider)' }}>
                <div className="flex items-center" style={{ background: 'var(--hover-bg)' }}>
                  <span className="flex-1 px-4 py-2.5 text-[10px] font-semibold uppercase tracking-widest" style={{ color: 'var(--text-3)' }}>งวดชำระเงิน</span>
                  <button onClick={() => setActionModal('setup')}
                    className="px-3 py-2.5 text-xs font-semibold"
                    style={{ color: 'var(--accent)', borderLeft: '1px solid var(--divider)' }}>แก้ไข</button>
                </div>
                <div className="divide-y" style={{ borderColor: 'var(--divider)' }}>
                  {job.installments.sort((a, b) => a.installment_no - b.installment_no).map(inst => (
                    <InstRow key={inst.id} inst={inst} job={job}
                      onDateSaved={newDate => setJob(prev => ({ ...prev, installments: prev.installments.map(i => i.id === inst.id ? { ...i, paid_date: newDate } : i) }))}
                      onUpdated={patch => setJob(prev => ({ ...prev, installments: prev.installments.map(i => i.id === inst.id ? { ...i, ...patch } : i) }))}
                      onDeleted={() => setJob(prev => ({ ...prev, installments: prev.installments.filter(i => i.id !== inst.id) }))}
                      onCollect={() => setActionModal('pay')} />
                  ))}
                  <AddInstallmentRow jobId={job.id} customerId={job.customer_id ?? ''} projectId={job.project_id} roomNo={job.room_no}
                    nextNo={job.installments.length + 1}
                    onAdded={newInst => setJob(prev => ({ ...prev, installments: [...prev.installments, newInst] }))} />
                </div>
              </div>
            )}

            {/* Documents */}
            <div className="rounded-[11px] overflow-hidden" style={{ border: '1px solid var(--divider)' }}>
              <button className="w-full flex items-center justify-between px-4 py-2.5"
                style={{ color: 'var(--text-3)', background: 'var(--hover-bg)' }}
                onClick={() => setDocsExpanded(e => !e)}>
                <span className="text-xs">เอกสาร</span>
                <div className="flex items-center gap-2">
                  <span className="text-[10px]" style={{ color: 'var(--text-3)' }}>
                    {[job.quotation1_url, job.quotation2_url, job.id_card_url, job.delivery_doc_url, job.satisfaction_url].filter(Boolean).length}/5
                  </span>
                  {docsExpanded ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
                </div>
              </button>
              {docsExpanded && (
                <div className="p-3 space-y-2">
                  <DocField jobId={job.id} field="quotation1_url" label="ใบเสนอราคา 1" value={job.quotation1_url} onUpdate={v => updateDocField('quotation1_url', v)} />
                  <DocField jobId={job.id} field="quotation2_url" label="ใบเสนอราคา 2" value={job.quotation2_url} onUpdate={v => updateDocField('quotation2_url', v)} />
                  <DocField jobId={job.id} field="id_card_url" label="บัตรประชาชนลูกค้า" value={job.id_card_url} onUpdate={v => updateDocField('id_card_url', v)} />
                  <DocField jobId={job.id} field="delivery_doc_url" label="ใบส่งมอบ" value={job.delivery_doc_url} onUpdate={v => updateDocField('delivery_doc_url', v)} />
                  <DocField jobId={job.id} field="satisfaction_url" label="แบบประเมินความพึงพอใจ" value={job.satisfaction_url} onUpdate={v => updateDocField('satisfaction_url', v)} />
                </div>
              )}
            </div>

            {/* File Attachments */}
            <div className="rounded-[11px] p-3" style={{ border: '1px solid var(--divider)' }}>
              <FileAttach jobId={job.id} projectName={job.project_name} roomNo={job.room_no} />
            </div>

            {/* Cancel */}
            {!delivered && (
              <div>
                <button onClick={() => { setShowCancelSection(s => !s); setCancelConfirmed(false) }}
                  className="flex items-center gap-1 text-[11px]"
                  style={{ color: 'var(--text-3)' }}>
                  <ChevronRight size={12} style={{ transform: showCancelSection ? 'rotate(90deg)' : 'none', transition: 'transform 0.2s' }} />
                  สถานะพิเศษ / ลูกค้ายกเลิก
                </button>
                {showCancelSection && (
                  <div className="mt-2 rounded-[8px] p-3 space-y-3"
                    style={{ background: 'color-mix(in srgb, #f87171 6%, transparent)', border: '1px solid color-mix(in srgb, #f87171 20%, transparent)' }}>
                    <label className="flex items-center gap-2 cursor-pointer select-none">
                      <input type="checkbox" checked={cancelConfirmed} onChange={e => setCancelConfirmed(e.target.checked)}
                        className="w-4 h-4 rounded" style={{ accentColor: '#f87171' }} />
                      <span className="text-xs" style={{ color: 'var(--text-2)' }}>ยืนยันว่าต้องการยกเลิกสัญญา</span>
                    </label>
                    <button onClick={() => setShowCancel(true)} disabled={!cancelConfirmed}
                      className="w-full py-2 rounded-[8px] text-xs font-semibold disabled:opacity-30"
                      style={{ background: 'color-mix(in srgb, #f87171 15%, transparent)', border: '1px solid color-mix(in srgb, #f87171 40%, transparent)', color: '#f87171' }}>
                      ยกเลิกสัญญา
                    </button>
                  </div>
                )}
              </div>
            )}

            {/* Action buttons */}
            <div className="pt-3" style={{ borderTop: '1px solid var(--divider)' }}>
              {delivered ? (
                <div className="space-y-2">
                  <div className="rounded-[11px] p-3 text-center"
                    style={{ background: 'color-mix(in srgb, var(--accent-green) 10%, transparent)', border: '1px solid color-mix(in srgb, var(--accent-green) 25%, transparent)' }}>
                    <p className="text-sm font-semibold" style={{ color: 'var(--accent-green)' }}>ส่งมอบแล้ว {fmtDate(job.actual_deliver_date)}</p>
                    {job.warranty_end && <p className="text-xs mt-0.5" style={{ color: 'var(--text-3)' }}>ประกันหมด {fmtDate(job.warranty_end)}</p>}
                  </div>
                  <div className="flex gap-2">
                    <button onClick={() => setActionModal('pay')} className="flex-1 py-2 rounded-[8px] text-xs font-semibold"
                      style={{ background: 'var(--hover-bg)', border: '1px solid var(--divider)', color: 'var(--text-2)' }}>แก้ไขงวดเงิน</button>
                    <button onClick={() => setActionModal('handover')} className="flex-1 py-2 rounded-[8px] text-xs font-semibold"
                      style={{ background: 'var(--hover-bg)', border: '1px solid var(--divider)', color: 'var(--text-2)' }}>แก้ไขวันส่งมอบ</button>
                  </div>
                </div>
              ) : !hasPlan ? (
                <button onClick={() => setActionModal('setup')}
                  className="w-full py-3 rounded-[var(--radius-pill)] font-bold text-sm text-white"
                  style={{ background: 'var(--accent)' }}>
                  + ตั้งแผนชำระเงิน & รับเงินงวดแรก
                </button>
              ) : pendingInstallments.length > 0 ? (
                <div className="flex gap-2">
                  <button onClick={() => setActionModal('pay')}
                    className="flex-1 py-3 rounded-[var(--radius-pill)] font-bold text-sm text-white"
                    style={{ background: 'var(--accent)' }}>
                    + บันทึกรับเงิน
                  </button>
                  {finalPaid && (
                    <button onClick={() => setActionModal('handover')}
                      className="flex-1 py-3 rounded-[var(--radius-pill)] font-bold text-sm text-white"
                      style={{ background: 'var(--accent-green)' }}>
                      ส่งมอบ
                    </button>
                  )}
                </div>
              ) : (
                <button onClick={() => setActionModal('handover')}
                  className="w-full py-3 rounded-[var(--radius-pill)] font-bold text-sm text-white"
                  style={{ background: 'var(--accent-green)' }}>
                  + บันทึกส่งมอบ
                </button>
              )}
            </div>
          </div>
        </div>
      </div>

      {actionModal === 'setup' && <SetupAndPayModal job={job} onClose={() => setActionModal(null)} onSaved={handleSaved} />}
      {actionModal === 'pay' && <PayModal job={job} onClose={() => setActionModal(null)} onSaved={handleSaved} />}
      {actionModal === 'handover' && <HandoverModal job={job} onClose={() => setActionModal(null)} onSaved={handleSaved} />}
      {showCancel && (
        <JobCancelModal
          onClose={() => setShowCancel(false)}
          onConfirm={async (type, amount, date, notes) => {
            const { data: { session } } = await supabase.auth.getSession()
            await supabase.from('jobs').update({
              working_status: 'ยกเลิก',
              cancel_type: type, cancel_date: date || null,
              cancel_amount: amount || null, cancel_notes: notes || null,
            }).eq('id', job.id)
            if (amount > 0) {
              await supabase.from('finance_entries').insert({
                type: type === 'forfeit' ? 'income' : 'expense',
                category: type === 'forfeit' ? 'ยึดเงินจอง' : 'คืนเงินยกเลิก',
                amount, entry_date: date,
                description: `${type === 'forfeit' ? 'ยึดเงินจอง' : 'คืนเงิน'}: ${job.customer_name} ห้อง ${job.room_no}${notes ? ' — ' + notes : ''}`,
                ref_id: job.id,
                created_by: session?.user?.id || null,
              })
            }
            setShowCancel(false); onClose(); onRefresh()
          }}
        />
      )}
    </>
  )
}

// ─── loadFullJob helper ───────────────────────────────────
export async function loadFullJob(jobId: string): Promise<FullJob | null> {
  const supabase = createClient()
  const { data: raw } = await supabase
    .from('jobs')
    .select('*, projects(name), sales:users!sales_id(name), installments:payments(id, installment_no, installment_name, amount, paid_amount, percentage, status, due_date, paid_date, is_work_trigger, is_final, channel, slip_url, receipt_url, voucher_code, voucher_amount, line_notified_at)')
    .eq('id', jobId)
    .single()
  if (!raw) return null
  const { data: war } = await supabase.from('warranties').select('warranty_end')
    .eq('project_id', raw.project_id).eq('room', raw.room_no).maybeSingle()
  return {
    id: raw.id,
    customer_id: raw.customer_id,
    project_id: raw.project_id,
    project_name: (raw as any).projects?.name || raw.project_id,
    room_no: raw.room_no || '',
    customer_name: raw.customer_name || '',
    customer_type: raw.customer_type || 'B2C',
    revenue_inc_vat: raw.revenue_inc_vat || raw.revenue_ex_vat || 0,
    revenue_ex_vat: raw.revenue_ex_vat || 0,
    working_status: raw.working_status || '',
    actual_deliver_date: raw.actual_deliver_date || null,
    sales_name: (raw as any).sales?.name || '',
    payment_plan_type: raw.payment_plan_type || null,
    work_days: raw.work_days || null,
    order_date: raw.order_date || null,
    contract_date: raw.contract_date || null,
    expected_finish_date: raw.expected_finish_date || null,
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
      voucher_code: p.voucher_code || null,
      voucher_amount: p.voucher_amount ?? null,
      line_notified_at: p.line_notified_at || null,
    })),
  }
}


