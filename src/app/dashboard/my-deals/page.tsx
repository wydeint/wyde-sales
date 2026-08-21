'use client'

import { calcB2BInstallments, calcB2BSingleInstallment, calcB2CInstallments } from '@/lib/paymentPlans'
import React, { useEffect, useState, useCallback, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import {
  Search, X, ChevronRight, ChevronDown, Pencil, Trash2, Loader2, Plus,
  CheckCircle2, Circle, Wallet, Package, Wrench, ShoppingCart, AlertTriangle, Copy,
} from 'lucide-react'
import FileAttach from '@/components/ui/FileAttach'
import Money from '@/components/ui/Money'
import FilterBar from '@/components/ui/FilterBar'
import PageHeader from '@/components/ui/PageHeader'
import { EmptyState } from '@/components/ui/StateUI'
import { expectedDeliveryDate, fmtShortDate } from '@/lib/delivery'
import { generateLineMsg, type LineJob } from '@/lib/lineMessage'
import DateInput from '@/components/ui/DateInput'

// ─── LINE Logo ────────────────────────────────────────────
function LineLogo({ size = 14 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor">
      <path d="M19.365 9.863c.349 0 .63.285.63.631 0 .345-.281.63-.63.63H17.61v1.125h1.755c.349 0 .63.283.63.63 0 .344-.281.629-.63.629h-2.386c-.345 0-.627-.285-.627-.629V8.108c0-.345.282-.63.627-.63h2.386c.349 0 .63.285.63.63 0 .349-.281.63-.63.63H17.61v1.125h1.755zm-3.855 3.016c0 .27-.174.51-.432.596-.064.021-.133.031-.199.031-.211 0-.391-.09-.51-.25l-2.443-3.317v2.94c0 .344-.279.629-.631.629-.346 0-.626-.285-.626-.629V8.108c0-.27.173-.51.43-.595.06-.023.136-.033.194-.033.195 0 .375.104.495.254l2.462 3.33V8.108c0-.345.282-.63.63-.63.345 0 .63.285.63.63v4.771zm-5.741 0c0 .344-.282.629-.631.629-.345 0-.627-.285-.627-.629V8.108c0-.345.282-.63.627-.63.349 0 .631.285.631.63v4.771zm-2.466.629H4.917c-.345 0-.63-.285-.63-.629V8.108c0-.345.285-.63.63-.63.348 0 .63.285.63.63v4.141h1.756c.348 0 .629.283.629.63 0 .344-.281.629-.629.629M24 10.314C24 4.943 18.615.572 12 .572S0 4.943 0 10.314c0 4.811 4.27 8.842 10.035 9.608.391.082.923.258 1.058.59.12.301.079.766.038 1.08l-.164 1.02c-.045.301-.24 1.186 1.049.645 1.291-.539 6.916-4.078 9.436-6.975C23.176 14.393 24 12.458 24 10.314" />
    </svg>
  )
}

// ─── Types ────────────────────────────────────────────────
type ClientType = 'B2C' | 'B2B'

function buildSeqMap(jobs: { id: string; project_id: string; room_no: string; order_date?: string | null }[]): Record<string, number> {
  const groups: Record<string, typeof jobs> = {}
  for (const j of jobs) {
    const key = `${j.project_id}|${j.room_no}`
    if (!groups[key]) groups[key] = []
    groups[key].push(j)
  }
  const map: Record<string, number> = {}
  for (const group of Object.values(groups)) {
    if (group.length < 2) { map[group[0].id] = 1; continue }
    group.sort((a, b) => ((a as any).order_date || a.id) < ((b as any).order_date || b.id) ? -1 : 1)
    group.forEach((j, i) => { map[j.id] = i + 1 })
  }
  return map
}

interface RoomJob {
  id: string
  room_no: string
  project_id: string
  project_name: string
  customer_name: string
  customer_type: ClientType
  sales_name: string
  order_date: string | null
  actual_deliver_date: string | null
  has_plan: boolean
  has_overdue: boolean
  all_paid: boolean
  paid_count: number
  total_count: number
  total_amount: number
  /** Cash actually received, for the outstanding figure. */
  paid_amount_total: number
  total_paid: number
  total_settled: number
  revenue_inc_vat: number
  working_status: string
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
  voucher_code: string | null
  voucher_amount: number
  line_notified_at: string | null
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
  order_date: string | null
  contract_date: string | null
  expected_finish_date: string | null
  work_start_date: string | null
  warranty_end: string | null
  installments: Installment[]
  package_type: string | null
  // job-level docs
  quotation1_url: string | null
  quotation2_url: string | null
  id_card_url: string | null
  delivery_doc_url: string | null
  satisfaction_url: string | null
  sale_slip_url: string | null
  sale_receipt_url: string | null
}

const CHANNEL_OPTS = ['โอนเข้าบัญชีบริษัท', 'บัตรเครดิต', 'เงินสด', 'QR Code']

// ─── Stage helpers ─────────────────────────────────────────
type ChipStage = 'wait' | 'collect' | 'ready' | 'overdue' | 'done' | 'bill'

function getChipStage(j: RoomJob): ChipStage {
  if (j.actual_deliver_date) {
    // B2B ส่งมอบแล้วแต่ยังค้างรับเงิน
    if (j.customer_type === 'B2B' && !j.all_paid && j.has_plan) return 'bill'
    return 'done'
  }
  if (j.has_overdue) return 'overdue'
  if (!j.has_plan) return 'wait'
  if (j.all_paid) return 'ready'
  return 'collect'
}

/**
 * My Deals' own operational stages — derived from instalments and delivery
 * date, NOT a column in the database. Deliberately kept out of lib/status.ts,
 * which holds the three vocabularies that are stored and shared across pages.
 *
 * These keep one colour per stage rather than collapsing onto the semantic
 * scale: this chip is how the card grid is scanned, so distinguishable stages
 * carry more information here than strict red/orange/green semantics would.
 * Every value is still a token, so both themes stay correct.
 */
const STAGE_META: Record<ChipStage, { label: string; bg: string; color: string; border: string; dot: string }> = {
  wait:    { label: 'รอเปิดงาน',        bg: 'color-mix(in srgb, var(--accent-purple) 12%, transparent)', color: 'var(--accent-purple)', border: 'color-mix(in srgb, var(--accent-purple) 30%, transparent)', dot: 'var(--accent-purple)' },
  collect: { label: 'กำลังเก็บเงิน',    bg: 'color-mix(in srgb, var(--accent-orange) 12%, transparent)', color: 'var(--accent-orange)', border: 'color-mix(in srgb, var(--accent-orange) 30%, transparent)', dot: 'var(--accent-orange)' },
  ready:   { label: 'รอส่งมอบ',         bg: 'color-mix(in srgb, var(--accent-blue)   12%, transparent)', color: 'var(--accent-blue)',   border: 'color-mix(in srgb, var(--accent-blue)   30%, transparent)', dot: 'var(--accent-blue)' },
  overdue: { label: 'งวดเกินกำหนด',     bg: 'color-mix(in srgb, var(--accent-red)    12%, transparent)', color: 'var(--accent-red)',    border: 'color-mix(in srgb, var(--accent-red)    30%, transparent)', dot: 'var(--accent-red)' },
  done:    { label: 'ส่งมอบแล้ว',       bg: 'color-mix(in srgb, var(--accent-green)  12%, transparent)', color: 'var(--accent-green)',  border: 'color-mix(in srgb, var(--accent-green)  30%, transparent)', dot: 'var(--accent-green)' },
  bill:    { label: 'ส่งมอบแล้ว/ค้างรับเงิน', bg: 'color-mix(in srgb, var(--accent-orange) 12%, transparent)', color: 'var(--accent-orange)', border: 'color-mix(in srgb, var(--accent-orange) 30%, transparent)', dot: 'var(--accent-orange)' },
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
const B2B_PLANS = [
  { value: 'po_bill', label: 'PO → วางบิลเมื่อจบงาน', desc: '1 งวด (วางบิลส่งมอบ 100%)' },
  { value: 'custom', label: 'กำหนดงวดเอง', desc: 'ระบุ % แต่ละงวด' },
]
const WORK_DAYS_OPTIONS = [30, 45, 60, 90]



// ─── Setup + First Payment Modal ──────────────────────────
function SetupAndPayModal({ job, onClose, onSaved }: { job: FullJob; onClose: () => void; onSaved: () => void }) {
  const supabase = createClient()
  const [clientType, setClientType] = useState<ClientType>(job.customer_type || 'B2C')
  const [plan, setPlan] = useState(job.payment_plan_type || 'B')
  const [workDays, setWorkDays] = useState(job.work_days || 60)
  const [depositAmount, setDepositAmount] = useState(0)
  const [firstPaidAmount, setFirstPaidAmount] = useState(0)
  // The setup screen had no voucher option at all, so a plan whose first
  // instalment is also the last one (100%) could never record a discount here —
  // the only place offering it was the collect screen, which needs an existing
  // instalment to work on.
  const [useVoucher, setUseVoucher] = useState(false)
  const [voucherCode, setVoucherCode] = useState('')
  const [voucherAmount, setVoucherAmount] = useState(0)
  const [b2bPlan, setB2bPlan] = useState('po_bill')
  const [b2bPoDate, setB2bPoDate] = useState(todayStr())
  const [b2bCount, setB2bCount] = useState(3)
  const [b2bPcts, setB2bPcts] = useState([30, 40, 30])
  const [paidDate, setPaidDate] = useState(todayStr())
  const [channel, setChannel] = useState(CHANNEL_OPTS[0])
  const [slipUrl, setSlipUrl] = useState('')
  const [slipPosted, setSlipPosted] = useState(false)
  const [receiptUrl, setReceiptUrl] = useState('')
  const [receiptPosted, setReceiptPosted] = useState(false)
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
    : isSingleB2B
      ? calcB2BSingleInstallment(total)
      : calcB2BInstallments(b2bCount, total, b2bPcts.slice(0, b2bCount))
  const firstInst = preview[0]
  // A delivered room is being recorded after the fact. Its work started months
  // ago, so today's payment date must not be written over work_start_date — and
  // the trigger instalment must not clear it either.
  const isBackfill = !!job.actual_deliver_date

  async function save() {
    if (clientType === 'B2B' && !isSingleB2B && !pctValid) return
    setSaving(true)
    await supabase.from('jobs').update({
      customer_type: clientType,
      payment_plan_type: clientType === 'B2C' ? plan : isSingleB2B ? 'po_bill' : String(b2bCount),
      work_days: workDays,
      ...(isBackfill ? {} : { work_start_date: isSingleB2B ? b2bPoDate : (firstInst?.trigger ? paidDate : null) }),
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
      status: isSingleB2B ? 'pending' : (i === 0 ? 'paid' : 'pending'),
      paid_date: isSingleB2B ? null : (i === 0 ? paidDate : null),
      paid_amount: isSingleB2B ? null : (i === 0 ? (firstPaidAmount || p.amount) : null),
      channel: isSingleB2B ? null : (i === 0 ? (channel || null) : null),
      is_work_trigger: p.trigger,
      is_final: p.final,
      slip_url: isSingleB2B ? null : (i === 0 ? (slipUrl.trim() || (slipPosted ? 'posted' : null)) : null),
      receipt_url: isSingleB2B ? null : (i === 0 ? (receiptUrl.trim() || (receiptPosted ? 'posted' : null)) : null),
      voucher_code: i === 0 && useVoucher && voucherCode ? voucherCode : null,
      voucher_amount: i === 0 && useVoucher && voucherAmount > 0 ? voucherAmount : null,
    })))
    setSaving(false); onSaved(); onClose()
  }

  const inputStyle = { background: 'var(--input-bg)', border: '1px solid var(--divider)', color: 'var(--text-1)' }
  const btnActive = { background: 'var(--accent)', color: '#fff', border: '1px solid var(--accent)' }
  const btnIdle = { background: 'var(--hover-bg)', border: '1px solid var(--divider)', color: 'var(--text-2)' }

  return (
    <div className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center px-4 pb-4 pt-14 lg:pt-4" onClick={onClose}>
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
      <div className="relative w-full max-w-md rounded-[18px] shadow-2xl max-h-[88vh] overflow-y-auto overflow-x-hidden"
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
        {isBackfill && (
          <div className="mx-5 mt-4 rounded-[8px] p-3 text-xs"
            style={{ background: 'color-mix(in srgb, var(--accent-amber) 10%, transparent)', border: '1px solid color-mix(in srgb, var(--accent-amber) 30%, transparent)', color: 'var(--accent-amber)' }}>
            ห้องนี้ส่งมอบแล้ว — บันทึกงวดย้อนหลังเท่านั้น วันเริ่มงานและสถานะงานจะไม่ถูกเปลี่ยน
          </div>
        )}
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
                          ? { background: 'color-mix(in srgb, var(--accent) 10%, transparent)', border: '1px solid color-mix(in srgb, var(--accent) 40%, transparent)', color: 'var(--text-1)' }
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
                            ? { background: 'color-mix(in srgb, var(--accent) 10%, transparent)', border: '1px solid color-mix(in srgb, var(--accent) 40%, transparent)', color: 'var(--text-1)' }
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
                      <DateInput value={b2bPoDate} onChange={e => setB2bPoDate(e.target.value)}
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
                        {p.trigger && <span className="ml-2 text-micro px-1.5 py-0.5 rounded-[4px] font-semibold" style={{ background: 'color-mix(in srgb, var(--accent) 12%, transparent)', color: 'var(--accent)' }}>เริ่มงาน</span>}
                        {p.final && <span className="ml-2 text-micro px-1.5 py-0.5 rounded-[4px] font-semibold" style={{ background: 'color-mix(in srgb, var(--accent-green) 12%, transparent)', color: 'var(--accent-green)' }}>สุดท้าย</span>}
                      </div>
                      <span className="text-xs font-bold" style={{ color: 'var(--text-1)' }}>{fmtBaht(p.amount)}</span>
                    </div>
                  ))}
                </div>
              </div>
              <button
                onClick={() => isSingleB2B ? save() : setStep('pay')}
                disabled={saving}
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
                {firstInst?.trigger && <p className="text-xs mt-1 text-accent">งวดนี้เป็นงวดเริ่มงาน</p>}
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
                  <DateInput value={paidDate} onChange={e => setPaidDate(e.target.value)}
                    className="mt-1 w-full rounded-[8px] px-3 py-2 text-sm focus:outline-none" style={inputStyle} />
                </div>
              </div>
              <div>
                <label className="text-xs" style={{ color: 'var(--text-2)' }}>ช่องทางชำระเงิน</label>
                <select value={channel} onChange={e => setChannel(e.target.value)}
                  className="mt-1 w-full rounded-[8px] px-3 py-2 text-sm focus:outline-none appearance-none"
                  style={inputStyle}>
                  {CHANNEL_OPTS.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>
              {!isSingleB2B && (
                <div className="rounded-[8px] overflow-hidden" style={{ border: '1px solid var(--divider)' }}>
                  <label className="flex items-center gap-2.5 px-3 py-2.5 cursor-pointer select-none" style={{ background: 'var(--hover-bg)' }}>
                    <input type="checkbox" checked={useVoucher}
                      onChange={e => { setUseVoucher(e.target.checked); if (!e.target.checked) { setVoucherAmount(0); setVoucherCode('') } }}
                      className="w-4 h-4 rounded" style={{ accentColor: 'var(--accent-amber)' }} />
                    <span className="text-xs font-semibold" style={{ color: useVoucher ? 'var(--accent-amber)' : 'var(--text-2)' }}>
                      ใช้ Voucher / ส่วนลด
                    </span>
                  </label>
                  {useVoucher && (
                    <div className="p-3 space-y-2">
                      <input type="text" value={voucherCode} onChange={e => setVoucherCode(e.target.value)}
                        placeholder="รหัส Voucher"
                        className="w-full rounded-[8px] px-3 py-2 text-sm focus:outline-none" style={inputStyle} />
                      <input type="number" value={voucherAmount || ''} onChange={e => setVoucherAmount(+e.target.value)}
                        placeholder="ยอดส่วนลด (บาท)" inputMode="numeric"
                        className="w-full rounded-[8px] px-3 py-2 text-sm focus:outline-none" style={inputStyle} />
                      {voucherAmount > 0 && firstInst && (
                        <p className="text-micro" style={{ color: 'var(--text-3)' }}>
                          รับจริง {fmtBaht(Math.max((firstPaidAmount || firstInst.amount) - voucherAmount, 0))}
                          {' '}จากงวด {fmtBaht(firstInst.amount)}
                        </p>
                      )}
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

// ─── Record Payment Modal ──────────────────────────────────
function PayModal({ job, onClose, onSaved }: { job: FullJob; onClose: () => void; onSaved: () => void }) {
  const supabase = createClient()
  const allInsts = [...job.installments].sort((a, b) => a.installment_no - b.installment_no)
  const firstPending = allInsts.find(i => i.status !== 'paid') || allInsts[0] || null
  const [selected, setSelected] = useState<Installment | null>(firstPending)
  const [paidDate, setPaidDate] = useState(firstPending?.paid_date || todayStr())
  const [paidAmount, setPaidAmount] = useState(firstPending?.paid_amount ?? firstPending?.amount ?? 0)
  const [channel, setChannel] = useState(firstPending?.channel || CHANNEL_OPTS[0])
  const [slipUrl, setSlipUrl] = useState('')
  const [slipPosted, setSlipPosted] = useState(false)
  const [receiptUrl, setReceiptUrl] = useState('')
  const [receiptPosted, setReceiptPosted] = useState(false)
  const [useVoucher, setUseVoucher] = useState(!!(firstPending?.voucher_amount))
  const [voucherCode, setVoucherCode] = useState(firstPending?.voucher_code || '')
  const [voucherAmount, setVoucherAmount] = useState(firstPending?.voucher_amount || 0)
  const [saving, setSaving] = useState(false)

  const netAmount = paidAmount - (useVoucher ? voucherAmount : 0)

  function selectInst(inst: Installment) {
    setSelected(inst)
    setPaidAmount(inst.paid_amount ?? inst.amount ?? 0)
    setPaidDate(inst.paid_date || todayStr())
    setChannel(inst.channel || CHANNEL_OPTS[0])
    setSlipPosted(inst.slip_url === 'posted'); setSlipUrl(inst.slip_url && inst.slip_url !== 'posted' ? inst.slip_url : '')
    setReceiptPosted(inst.receipt_url === 'posted'); setReceiptUrl(inst.receipt_url && inst.receipt_url !== 'posted' ? inst.receipt_url : '')
    setUseVoucher(!!(inst.voucher_amount))
    setVoucherCode(inst.voucher_code || '')
    setVoucherAmount(inst.voucher_amount || 0)
  }

  async function save() {
    if (!selected) return
    setSaving(true)
    const thisAmt = (useVoucher ? netAmount : paidAmount) + (useVoucher ? voucherAmount : 0)
    const alreadySettled = job.installments
      .filter(i => i.status === 'paid' && i.id !== selected.id)
      .reduce((s, i) => s + Number(i.paid_amount ?? i.amount ?? 0) + Number(i.voucher_amount ?? 0), 0)
    const newTotal = alreadySettled + thisAmt
    const jobValue = job.revenue_inc_vat || 0
    const newPct = jobValue > 0 ? newTotal / jobValue : 0
    if (newPct >= 0.5 && !job.work_start_date) {
      await supabase.from('jobs').update({ work_start_date: paidDate, working_status: 'ดำเนินการ' }).eq('id', job.id)
    }
    await supabase.from('payments').update({
      status: 'paid',
      paid_date: paidDate,
      paid_amount: useVoucher ? netAmount : paidAmount,
      channel: channel || null,
      slip_url: slipUrl.trim() || (slipPosted ? 'posted' : null),
      receipt_url: receiptUrl.trim() || (receiptPosted ? 'posted' : null),
      voucher_code: useVoucher && voucherCode ? voucherCode : null,
      voucher_amount: useVoucher ? voucherAmount : 0,
    }).eq('id', selected.id)
    setSaving(false); onSaved(); onClose()
  }

  const inputStyle = { background: 'var(--input-bg)', border: '1px solid var(--divider)', color: 'var(--text-1)' }

  return (
    <div className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center px-4 pb-4 pt-14 lg:pt-4" onClick={onClose}>
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
      <div className="relative w-full max-w-sm rounded-[18px] shadow-2xl max-h-[90vh] overflow-y-auto overflow-x-hidden"
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
          <div className="space-y-2">
            {allInsts.map(inst => (
              <button key={inst.id} onClick={() => selectInst(inst)}
                className="w-full text-left px-4 py-3 rounded-[11px] border"
                style={selected?.id === inst.id
                  ? { background: 'color-mix(in srgb, var(--accent) 10%, transparent)', border: '1px solid color-mix(in srgb, var(--accent) 40%, transparent)', color: 'var(--text-1)' }
                  : { background: 'var(--hover-bg)', border: '1px solid var(--divider)', color: 'var(--text-2)' }}>
                <div className="flex justify-between">
                  <span className="text-sm font-semibold">{inst.installment_name}</span>
                  <span className="text-sm font-bold">{fmtBaht(inst.paid_amount ?? inst.amount)}</span>
                </div>
                <div className="flex gap-2 mt-0.5">
                  {inst.status === 'paid' && <span className="text-micro text-success">รับแล้ว {inst.paid_date ? fmtDate(inst.paid_date) : ''}</span>}
                  {inst.is_work_trigger && <span className="text-micro" style={{ color: 'var(--accent)' }}>เริ่มงาน</span>}
                  {inst.is_final && <span className="text-micro" style={{ color: 'var(--accent-orange)' }}>งวดสุดท้าย</span>}
                  {inst.status !== 'paid' && inst.due_date && <span className="text-micro" style={{ color: 'var(--text-3)' }}>ครบ {fmtDate(inst.due_date)}</span>}
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
              <DateInput value={paidDate} onChange={e => setPaidDate(e.target.value)}
                className="mt-1 w-full rounded-[8px] px-3 py-2 text-sm focus:outline-none" style={inputStyle} />
            </div>
          </div>
          {/* Channel */}
          <div>
            <label className="text-xs" style={{ color: 'var(--text-2)' }}>ช่องทางชำระเงิน</label>
            <select value={channel} onChange={e => setChannel(e.target.value)}
              className="mt-1 w-full rounded-[8px] px-3 py-2 text-sm focus:outline-none appearance-none"
              style={inputStyle}>
              {CHANNEL_OPTS.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
          {/* Voucher */}
          <div className="rounded-[11px] overflow-hidden" style={{ border: '1px solid var(--divider)' }}>
            <label className="flex items-center gap-3 px-4 py-3 cursor-pointer" style={{ background: 'var(--hover-bg)' }}>
              <input type="checkbox" checked={useVoucher} onChange={e => { setUseVoucher(e.target.checked); if (!e.target.checked) { setVoucherAmount(0); setVoucherCode('') } }}
                className="w-4 h-4 rounded" style={{ accentColor: 'var(--accent-amber)' }} />
              <span className="text-sm font-semibold" style={{ color: 'var(--text-1)' }}>ใช้ Voucher / ส่วนลด</span>
            </label>
            {useVoucher && (
              <div className="px-4 pb-4 pt-3 space-y-3" style={{ borderTop: '1px solid var(--divider)' }}>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs" style={{ color: 'var(--text-2)' }}>รหัส Voucher</label>
                    <input type="text" value={voucherCode} onChange={e => setVoucherCode(e.target.value)}
                      placeholder="เช่น VOU-2024-001"
                      className="mt-1 w-full rounded-[8px] px-3 py-2 text-sm focus:outline-none" style={inputStyle} />
                  </div>
                  <div>
                    <label className="text-xs" style={{ color: 'var(--text-2)' }}>ยอดส่วนลด (฿)</label>
                    <input type="number" value={voucherAmount || ''} onChange={e => setVoucherAmount(+e.target.value)}
                      placeholder="0"
                      className="mt-1 w-full rounded-[8px] px-3 py-2 text-sm focus:outline-none font-semibold text-value"
                      style={{ background: 'var(--input-bg)', border: '1px solid var(--divider)' }} />
                  </div>
                </div>
                {voucherAmount > 0 && (
                  <div className="rounded-[8px] p-3 space-y-1" style={{ background: 'var(--card-bg)' }}>
                    <div className="flex justify-between text-xs" style={{ color: 'var(--text-2)' }}>
                      <span>ยอดงวด</span><span>{fmtBaht(paidAmount)}</span>
                    </div>
                    <div className="flex justify-between text-xs text-value">
                      <span>ส่วนลด Voucher</span><span>-{fmtBaht(voucherAmount)}</span>
                    </div>
                    <div className="flex justify-between text-sm font-bold pt-1" style={{ borderTop: '1px solid var(--divider)', color: 'var(--text-1)' }}>
                      <span>รับจริง (Net)</span><span className="text-success">{fmtBaht(netAmount)}</span>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
          {/* Slip + Receipt checkboxes */}
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
          <button onClick={save} disabled={saving || !selected}
            className="w-full py-3 rounded-[11px] font-semibold text-sm text-white"
            style={{ background: saving ? '#999' : 'var(--accent)' }}>
            {saving ? 'กำลังบันทึก...' : `บันทึก ${selected ? fmtBaht(useVoucher && voucherAmount > 0 ? netAmount : paidAmount) : ''}`}
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Quick Deliver Modal (B2B: ส่งมอบก่อน วางบิลทีหลัง) ──
function QuickDeliverModal({ job, onClose, onSaved }: { job: FullJob; onClose: () => void; onSaved: () => void }) {
  const supabase = createClient()
  const [deliverDate, setDeliverDate] = useState(todayStr())
  const [warrantyMonths, setWarrantyMonths] = useState(6)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const inputStyle = { background: 'var(--input-bg)', border: '1px solid var(--divider)', color: 'var(--text-1)' }
  const btnActive = { background: 'var(--accent)', color: '#fff', border: '1px solid var(--accent)' }
  const btnIdle = { background: 'var(--hover-bg)', border: '1px solid var(--divider)', color: 'var(--text-2)' }

  async function save() {
    if (!deliverDate) return
    setSaving(true); setError('')
    const wEnd = new Date(deliverDate)
    wEnd.setMonth(wEnd.getMonth() + warrantyMonths)
    const wEndStr = `${wEnd.getFullYear()}-${String(wEnd.getMonth() + 1).padStart(2, '0')}-${String(wEnd.getDate()).padStart(2, '0')}`
    const commissionMonth = deliverDate.slice(0, 7) + '-01'

    const { error: e1 } = await supabase.from('jobs').update({
      actual_deliver_date: deliverDate,
      working_status: 'ส่งมอบแล้ว',
      commission_month: commissionMonth,
    }).eq('id', job.id)
    if (e1) { setError(e1.message); setSaving(false); return }

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
      <div className="relative w-full max-w-sm rounded-[18px] shadow-2xl"
        data-panel style={{ background: 'var(--panel-bg)', border: '1px solid var(--card-border)' }}
        onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between p-5" style={{ borderBottom: '1px solid var(--divider)' }}>
          <div>
            <h3 className="font-semibold" style={{ color: 'var(--text-1)' }}>ส่งมอบก่อนวางบิล</h3>
            <p className="text-xs mt-0.5" style={{ color: 'var(--text-2)' }}>{job.room_no} · {job.project_name} — ค้างรับเงินได้ทีหลัง</p>
          </div>
          <button onClick={onClose} className="p-1" style={{ color: 'var(--text-2)' }}><X size={18} /></button>
        </div>
        <div className="p-5 space-y-4">
          <div>
            <label className="text-xs" style={{ color: 'var(--text-2)' }}>วันที่ส่งมอบ</label>
            <DateInput value={deliverDate} onChange={e => setDeliverDate(e.target.value)}
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
          <div className="rounded-[11px] p-3" style={{ background: 'color-mix(in srgb, var(--accent-orange) 8%, transparent)', border: '1px solid color-mix(in srgb, var(--accent-orange) 25%, transparent)' }}>
            <p className="text-xs font-semibold text-warning">ยังไม่รับเงิน</p>
            <p className="text-xs mt-0.5" style={{ color: 'var(--text-3)' }}>สถานะจะแสดง "ส่งมอบแล้ว/ค้างรับเงิน" จนกว่าจะรับเงินครบ</p>
          </div>
          {error && <p className="text-xs text-danger">{error}</p>}
          <button onClick={save} disabled={saving || !deliverDate}
            className="w-full py-3 rounded-[var(--radius-pill)] font-bold text-sm text-white disabled:opacity-50"
            style={{ background: 'var(--accent-green)' }}>
            {saving ? 'กำลังบันทึก...' : 'บันทึกส่งมอบ (ยังไม่รับเงิน)'}
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
    <div className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center px-4 pb-4 pt-14 lg:pt-4" onClick={onClose}>
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
            <DateInput value={deliverDate} onChange={e => setDeliverDate(e.target.value)}
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
          <div className="rounded-[11px] p-3" style={{ background: 'color-mix(in srgb, var(--accent) 5%, transparent)', border: '1px solid var(--divider)' }}>
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

  function handleExChange(v: string) {
    setExVat(v)
    const n = parseFloat(v)
    if (!isNaN(n) && n > 0) setIncVat(String(Math.round(n * 1.07)))
    else setIncVat('')
  }

  function handleIncChange(v: string) {
    setIncVat(v)
    const n = parseFloat(v)
    if (!isNaN(n) && n > 0) setExVat(String(Math.round(n / 1.07)))
    else setExVat('')
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
      <div className="rounded-[11px] p-4" style={{ background: 'var(--hover-bg)', border: '1px solid var(--accent)' }}>
        <p className="text-xs font-semibold mb-3" style={{ color: 'var(--text-3)' }}>แก้ไขมูลค่างาน (VAT 7%)</p>
        <div className="space-y-2">
          <div>
            <label className="text-xs mb-1 block" style={{ color: 'var(--text-3)' }}>ราคา ex. VAT (บาท)</label>
            <input type="number" value={exVat} onChange={e => handleExChange(e.target.value)}
              className="w-full px-3 py-2 rounded-[8px] text-sm focus:outline-none"
              style={inputStyle} placeholder="0" />
          </div>
          <div>
            <label className="text-xs mb-1 block" style={{ color: 'var(--text-3)' }}>ราคา inc. VAT (บาท)</label>
            <input type="number" value={incVat} onChange={e => handleIncChange(e.target.value)}
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
    <div className="rounded-[11px] p-4 flex items-center justify-between"
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

// LINE message: see lib/lineMessage.ts (LineJobCtx kept as the local alias)
type LineJobCtx = LineJob

// ─── Deal Drawer (right panel) ─────────────────────────────
// ─── Doc field component ───────────────────────────────────
// ─── InstRow — inline paid_date edit ───────────────────────
function InstRow({ inst, job, onDateSaved, onDeleted, onUpdated, onCollect }: { inst: Installment; job: LineJobCtx; onDateSaved: (d: string | null) => void | Promise<void>; onDeleted?: () => void | Promise<void>; onUpdated?: (patch: Partial<Installment>) => void | Promise<void>; onCollect?: () => void }) {
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
    try {
      const res = await fetch('/api/line-notify', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ message: msg }) })
      if (res.ok) {
        const ts = new Date().toISOString()
        await supabase.from('payments').update({ line_notified_at: ts }).eq('id', inst.id)
        setLineNotifiedAt(ts); setLineSent('ok')
      } else { setLineSent('err') }
    } catch { setLineSent('err') }
    setLineSending(false); setTimeout(() => setLineSent(null), 3000)
  }
  async function saveDate() {
    setSaving(true)
    await supabase.from('payments').update({ paid_date: dateVal }).eq('id', inst.id)
    onDateSaved(dateVal); setSaving(false); setEditingDate(false)
  }
  async function saveAmount() {
    const num = Number(amountVal); if (!num) return
    setSaving(true)
    await supabase.from('payments').update({ paid_amount: num, amount: num }).eq('id', inst.id)
    await onUpdated?.({ paid_amount: num, amount: num }); setSaving(false); setEditingAmount(false)
  }
  async function toggleSlip() {
    setSavingSlip(true); const newVal = slipUrl ? null : 'posted'
    await supabase.from('payments').update({ slip_url: newVal }).eq('id', inst.id)
    setSlipUrl(newVal); setSavingSlip(false)
  }
  async function toggleReceipt() {
    setSavingReceipt(true); const newVal = receiptUrl ? null : 'posted'
    await supabase.from('payments').update({ receipt_url: newVal }).eq('id', inst.id)
    setReceiptUrl(newVal); setSavingReceipt(false)
  }
  async function saveEdit() {
    setSaving(true)
    const patch = { installment_name: editName, amount: Number(editAmount) || inst.amount, due_date: editDueDate || null }
    await supabase.from('payments').update(patch).eq('id', inst.id)
    onUpdated?.(patch); setSaving(false); setEditing(false)
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
        <DateInput value={editDueDate} onChange={e => setEditDueDate(e.target.value)}
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
        <span className="text-label font-semibold" style={{ color: 'var(--text-1)' }}>
          งวด {inst.installment_no} · {inst.installment_name}
        </span>
        {inst.is_final && (
          <span className="text-micro px-1.5 py-0.5 rounded-[4px] font-semibold" style={{ background: 'color-mix(in srgb, var(--accent-orange) 12%, transparent)', color: 'var(--accent-orange)' }}>สุดท้าย</span>
        )}
        {inst.is_work_trigger && inst.status !== 'paid' && (
          <span className="text-micro px-1.5 py-0.5 rounded-[4px] font-semibold" style={{ background: 'color-mix(in srgb, var(--accent) 12%, transparent)', color: 'var(--accent)' }}>เริ่มงาน</span>
        )}
        <div className="flex-1" />
        {/* Amount chip */}
        {inst.status === 'paid' && editingAmount ? (
          <div className="flex items-center gap-1">
            <input type="number" value={amountVal} onChange={e => setAmountVal(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') saveAmount(); if (e.key === 'Escape') setEditingAmount(false) }}
              autoFocus className="text-xs font-semibold w-24 px-2 py-0.5 rounded-[6px] focus:outline-none text-right"
              style={{ background: 'var(--input-bg)', border: '1px solid var(--accent)', color: 'var(--accent-green)' }} />
            <button onClick={saveAmount} disabled={saving} className="text-micro px-1.5 py-0.5 rounded font-semibold text-white" style={{ background: 'var(--accent)' }}>{saving ? '...' : '✓'}</button>
            <button onClick={() => setEditingAmount(false)} className="text-micro" style={{ color: 'var(--text-3)' }}>✕</button>
          </div>
        ) : (
          <button
            onClick={inst.status === 'paid' ? () => { setAmountVal(String(inst.paid_amount ?? inst.amount ?? '')); setEditingAmount(true) } : undefined}
            className="group flex items-center gap-1 rounded-[6px] px-1.5 py-0.5 transition-colors"
            style={{ background: 'none', border: 'none', cursor: inst.status === 'paid' ? 'pointer' : 'default' }}
            title={inst.status === 'paid' ? 'คลิกเพื่อแก้ไขยอด' : undefined}>
            <span className="text-sm font-bold tabular-nums" style={{ color: inst.status === 'paid' ? 'var(--accent-green)' : 'var(--text-2)' }}>
              {fmtBaht(inst.voucher_amount > 0 && inst.status === 'paid' ? (inst.paid_amount ?? 0) : (inst.paid_amount ?? inst.amount))}
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

      {/* Pending: due date */}
      {inst.status !== 'paid' && inst.due_date && (
        <div className="ml-5 mt-0.5 text-micro" style={{ color: 'var(--text-3)' }}>ครบ {fmtDate(inst.due_date)}</div>
      )}

      {/* Paid: voucher box */}
      {inst.status === 'paid' && inst.voucher_amount > 0 && (
        <div className="ml-5 mt-1 text-micro rounded-[6px] overflow-hidden" style={{ border: '1px solid var(--divider)' }}>
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
                <DateInput value={dateVal} onChange={e => setDateVal(e.target.value)}
                  className="text-micro rounded px-2 py-1 focus:outline-none"
                  style={{ background: 'var(--input-bg)', border: '1px solid var(--divider)', color: 'var(--text-1)' }} />
                <button onClick={saveDate} disabled={saving} className="text-micro px-1.5 py-0.5 rounded font-semibold text-white" style={{ background: 'var(--accent)' }}>{saving ? '...' : '✓'}</button>
                <button onClick={() => setEditingDate(false)} className="text-micro" style={{ color: 'var(--text-3)' }}>✕</button>
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
              className="text-micro px-2 py-1 rounded-[6px] focus:outline-none appearance-none"
              style={{ background: 'var(--input-bg)', border: '1px solid var(--divider)', color: 'var(--text-2)', fontFamily: 'inherit' }}>
              {CHANNEL_OPTS.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
          {/* Line 3 — เอกสาร */}
          <div className="flex items-center gap-2 flex-wrap">
            <span style={fieldLabelStyle}>เอกสาร</span>
            <button onClick={toggleSlip} disabled={savingSlip} style={{ ...docBtnStyle(!!slipUrl, 'var(--accent-blue)'), opacity: savingSlip ? 0.5 : 1 }}>
              {slipUrl ? <CheckCircle2 size={10} /> : <Circle size={10} />} Slip
            </button>
            <button onClick={toggleReceipt} disabled={savingReceipt} style={{ ...docBtnStyle(!!receiptUrl, 'var(--accent-green)'), opacity: savingReceipt ? 0.5 : 1 }}>
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
                style={{ background: 'none', border: 'none', color: lineSent === 'err' ? 'var(--accent-red)' : '#06C755', cursor: 'pointer' }}>
                {lineSending ? <Loader2 size={12} className="animate-spin" /> : <LineLogo size={14} />}
              </button>
            )}
            <button onClick={copyLine}
              className="flex items-center gap-1 p-1 rounded active:scale-95"
              title="คัดลอกข้อความโพสต์เองใน LINE"
              style={{ background: 'none', border: 'none', color: copied ? 'var(--accent-purple)' : 'var(--text-3)', cursor: 'pointer', fontSize: '10px' }}>
              {copied ? <CheckCircle2 size={10} /> : <Copy size={10} />}
              <span>{copied ? 'Copied!' : 'Copy'}</span>
            </button>
          </div>
          {/* Trash — ล่างสุดคนเดียว มีเส้น divider คั่น */}
          <div style={{ marginTop: '8px', borderTop: '1px solid var(--divider)', paddingTop: '8px' }}>
            <button onClick={deleteInst} disabled={deleting}
              className="flex items-center gap-1 px-2 py-1 rounded-[6px] active:scale-95 disabled:opacity-40"
              style={{ background: 'transparent', border: '1px solid var(--divider)', color: 'var(--text-3)', cursor: 'pointer', fontSize: '10px' }}
              onMouseEnter={e => { (e.currentTarget as HTMLElement).style.color = 'var(--accent-red)'; (e.currentTarget as HTMLElement).style.borderColor = 'color-mix(in srgb, var(--accent-red) 30%, transparent)' }}
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
            className="w-full flex items-center justify-center gap-1.5 py-2 rounded-[8px] text-label font-semibold active:scale-[0.98] transition-transform"
            style={{ background: 'color-mix(in srgb, var(--accent) 10%, transparent)', border: '1.5px solid color-mix(in srgb, var(--accent) 30%, transparent)', color: 'var(--accent)', cursor: 'pointer' }}>
            <Circle size={11} style={{ color: 'var(--accent)' }} />
            บันทึกรับเงินงวด {inst.installment_no}
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
    <label className="flex items-center gap-3 px-3 py-2.5 rounded-[8px] cursor-pointer transition-colors select-none"
      style={{ background: checked ? 'color-mix(in srgb, var(--accent-green) 10%, transparent)' : 'var(--hover-bg)', border: `1px solid ${checked ? 'color-mix(in srgb, var(--accent-green) 30%, transparent)' : 'var(--divider)'}` }}>
      <input type="checkbox" checked={checked} onChange={toggle} disabled={saving}
        className="w-4 h-4 rounded flex-shrink-0" style={{ accentColor: 'var(--accent-green)' }} />
      <span className="text-xs font-semibold flex-1" style={{ color: checked ? 'var(--accent-green)' : 'var(--text-2)' }}>{label}</span>
      {saving && <span className="text-micro" style={{ color: 'var(--text-3)' }}>...</span>}
    </label>
  )
}

function CancelModal({ onClose, onConfirm }: {
  onClose: () => void
  onConfirm: (type: 'forfeit' | 'refund', amount: number, date: string, notes: string) => Promise<void>
}) {
  const [cancelType, setCancelType] = useState<'forfeit' | 'refund'>('forfeit')
  const [amount, setAmount] = useState('')
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10))
  const [notes, setNotes] = useState('')
  const [saving, setSaving] = useState(false)

  async function confirm() {
    setSaving(true)
    await onConfirm(cancelType, Number(amount) || 0, date, notes)
    setSaving(false)
  }

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center px-4 pb-4 pt-14 lg:pt-4" onClick={onClose}>
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
      <div className="relative rounded-[16px] p-5 w-full max-w-sm space-y-4" data-panel style={{ background: 'var(--panel-bg)', border: '1px solid var(--card-border)' }}
        onClick={e => e.stopPropagation()}>
        <p className="font-bold text-sm" style={{ color: 'var(--text-1)' }}>ยกเลิกสัญญา</p>
        <div className="flex gap-2">
          {([['forfeit', 'ยึดเงินจอง'], ['refund', 'คืนเงิน']] as const).map(([val, label]) => (
            <button key={val} onClick={() => setCancelType(val)}
              className="flex-1 py-2 rounded-[8px] text-sm font-semibold transition-all"
              style={cancelType === val
                ? { background: val === 'forfeit' ? 'var(--accent-red)' : 'var(--accent-blue)', color: '#fff' }
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
            <DateInput value={date} onChange={e => setDate(e.target.value)}
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
            style={{ background: cancelType === 'forfeit' ? 'var(--accent-red)' : 'var(--accent-blue)' }}>
            {saving ? 'กำลังบันทึก...' : 'ยืนยันยกเลิก'}
          </button>
        </div>
      </div>
    </div>
  )
}

function AddInstallmentRow({ jobId, customerId, projectId, roomNo, nextNo, onAdded }: {
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
    onAdded({ ...row, paid_amount: null, paid_date: null, percentage: null, slip_url: null, receipt_url: null, channel: null, voucher_code: null, voucher_amount: 0 } as any)
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
        <DateInput value={dueDate} onChange={e => setDueDate(e.target.value)}
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

const PRODUCT_TYPES = [
  'Curtain', 'Wallcovering', 'Loose furniture', 'Built-in', 'Electric appliance',
  'Design', 'Design & Turnkey', 'Ready to move', 'IP', 'EQ', 'Mock up room',
]

function DealDrawer({ job: initialJob, onClose, onRefresh }: { job: FullJob; onClose: () => void; onRefresh: () => void }) {
  const supabase = createClient()
  const [job, setJob] = useState(initialJob)
  const [actionModal, setActionModal] = useState<'setup' | 'pay' | 'handover' | 'quick_deliver' | null>(null)
  const [docsExpanded, setDocsExpanded] = useState(false)
  const [showCancel, setShowCancel] = useState(false)
  const [showCancelSection, setShowCancelSection] = useState(false)
  const [cancelConfirmed, setCancelConfirmed] = useState(false)
  const [contractDateVal, setContractDateVal] = useState(initialJob.contract_date || '')
  const [expectedDateVal, setExpectedDateVal] = useState(initialJob.expected_finish_date || '')
  const [editingContract, setEditingContract] = useState(false)
  const [editingExpected, setEditingExpected] = useState(false)
  useEffect(() => {
    setJob(initialJob)
    setContractDateVal(initialJob.contract_date || '')
    setExpectedDateVal(initialJob.expected_finish_date || '')
  }, [initialJob])

  async function saveDateField(field: 'contract_date' | 'expected_finish_date', val: string) {
    const v = val || null
    await supabase.from('jobs').update({ [field]: v }).eq('id', job.id)
    setJob(prev => ({ ...prev, [field]: v }))
  }

  async function reloadJob() {
    const { data: raw } = await supabase
      .from('jobs')
      .select('*, projects(name), sales:users!sales_id(name), installments:payments(id, installment_no, installment_name, amount, paid_amount, percentage, status, due_date, paid_date, is_work_trigger, is_final, channel, slip_url, receipt_url, voucher_code, voucher_amount, line_notified_at)')
      .eq('id', job.id)
      .single()
    if (raw) {
      const installments = (raw.installments ?? []) as Installment[]
      // Auto-compute order_date and contract_date from payments
      const paidSorted = installments
        .filter(i => i.status === 'paid' && i.paid_date)
        .sort((a, b) => (a.paid_date || '').localeCompare(b.paid_date || ''))
      const orderDate = paidSorted[0]?.paid_date || null
      const revenue = raw.revenue_inc_vat || raw.revenue_ex_vat || 0
      let contractDate: string | null = null
      if (raw.customer_type === 'B2B') {
        contractDate = orderDate
      } else {
        const threshold = revenue * 0.5
        let cum = 0
        for (const p of paidSorted) {
          cum += ((p.paid_amount ?? p.amount) || 0) + ((p.voucher_amount ?? 0))
          if (cum >= threshold) { contractDate = p.paid_date; break }
        }
      }
      if (orderDate !== raw.order_date || contractDate !== raw.contract_date) {
        await supabase.from('jobs').update({ order_date: orderDate, contract_date: contractDate }).eq('id', job.id)
      }
      setJob(prev => ({
        ...prev,
        ...raw,
        order_date: orderDate,
        contract_date: contractDate,
        project_name: (raw.projects as any)?.name ?? prev.project_name,
        sales_name: (raw.sales as any)?.name ?? prev.sales_name,
        installments,
      }))
    }
    onRefresh()
  }
  const { hasPlan, finalPaid, delivered, paidCount, totalCount, pendingInstallments, activeStage } = getFullStageInfo(job)
  const overdueCount = job.installments.filter(i => i.status === 'overdue').length

  // Payment balance check — B2C only
  const isB2C = job.customer_type === 'B2C'
  const jobValue = job.revenue_inc_vat || job.revenue_ex_vat || 0
  const totalPaidAmount = job.installments
    .filter(i => i.status === 'paid')
    .reduce((s, i) => s + Number(i.paid_amount ?? i.amount) + Number(i.voucher_amount ?? 0), 0)
  const totalPlannedAmount = job.installments.reduce((s, i) => s + Number(i.amount), 0)
  const paymentDiff = isB2C && jobValue > 0 ? totalPaidAmount - jobValue : null
  const plannedDiff = isB2C && jobValue > 0 ? totalPlannedAmount - jobValue : null

  function updateDocField(field: keyof FullJob, val: string | null) {
    setJob(prev => ({ ...prev, [field]: val }))
  }

  const stages = [
    { label: 'ขาย', icon: ShoppingCart, done: true },
    { label: 'เปิดงาน', icon: Wrench, done: hasPlan },
    { label: 'เก็บเงิน', icon: Wallet, done: finalPaid },
    { label: 'ส่งมอบ', icon: Package, done: delivered },
  ]

  function handleSaved() { reloadJob() }

  return (
    <>
      {/* Backdrop */}
      <div className="fixed inset-0 z-40 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      {/* Centered Panel */}
      <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center pointer-events-none px-4 pb-4 pt-14 lg:pt-4">
      <div className="w-full max-w-[460px] max-h-[90vh] flex flex-col rounded-[20px] shadow-2xl pointer-events-auto"
        data-panel style={{ background: 'var(--panel-bg)', border: '1px solid var(--card-border)' }}>
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
              {job.customer_name}
              {job.sales_name ? ` · ${job.sales_name}` : ''}
            </p>
          </div>
          <button onClick={onClose} className="p-1 rounded-lg" style={{ color: 'var(--text-2)' }}><X size={18} /></button>
        </div>

        <div className="flex-1 overflow-y-auto overflow-x-hidden p-5 space-y-4" style={{ overscrollBehavior: 'contain', WebkitOverflowScrolling: 'touch' as any }}>
          {/* Revenue */}
          <RevenueCard job={job} onUpdated={(exVat, incVat) => setJob(prev => ({ ...prev, revenue_ex_vat: exVat, revenue_inc_vat: incVat }))} />

          {/* Product */}
          <div className="flex flex-col gap-1">
            <p className="field-label">Product</p>
            <div className="relative">
              <select
                value={job.package_type || ''}
                onChange={async e => {
                  const v = e.target.value || null
                  await supabase.from('jobs').update({ package_type: v }).eq('id', job.id)
                  setJob(prev => ({ ...prev, package_type: v }))
                }}
                className="field-input appearance-none pr-7">
                <option value="">— เลือก Product —</option>
                {PRODUCT_TYPES.map(p => <option key={p} value={p}>{p}</option>)}
              </select>
              <ChevronDown size={13} className="absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none" style={{ color: 'var(--text-3)' }} />
            </div>
          </div>

          {/* Dates */}
          <div className="grid grid-cols-3 gap-2">
            {/* วันรับจอง / รับ PO — read-only */}
            <div className="rounded-[8px] px-3 py-2.5" style={{ background: 'var(--hover-bg)' }}>
              <p className="text-micro" style={{ color: 'var(--text-3)' }}>{job.customer_type === 'B2B' ? 'วันรับ PO' : 'วันรับจอง'}</p>
              <p className="text-xs font-bold mt-1.5" style={{ color: job.order_date ? 'var(--text-1)' : 'var(--text-3)' }}>
                {fmtDate(job.order_date)}
              </p>
            </div>
            {/* วันทำสัญญา — click to edit */}
            <div className="rounded-[8px] px-3 py-2.5 cursor-pointer" style={{ background: 'var(--hover-bg)' }}
              onClick={() => !editingContract && setEditingContract(true)}>
              <p className="text-micro" style={{ color: 'var(--text-3)' }}>วันทำสัญญา</p>
              {editingContract ? (
                <DateInput value={contractDateVal} autoFocus
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
            <div className="rounded-[8px] px-3 py-2.5 cursor-pointer" style={{ background: 'var(--hover-bg)' }}
              onClick={() => !editingExpected && setEditingExpected(true)}>
              <p className="text-micro" style={{ color: 'var(--text-3)' }}>วันคาดเสร็จ</p>
              {editingExpected ? (
                <DateInput value={expectedDateVal} autoFocus
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

          {/* B2C payment balance warning */}
          {isB2C && jobValue > 0 && hasPlan && (() => {
            const fmtDiff = (v: number) => (v >= 0 ? '+' : '') + Math.abs(Math.round(v)).toLocaleString() + ' บาท'
            // Planned mismatch (งวดรวมไม่ตรงมูลค่างาน)
            if (plannedDiff !== null && Math.abs(plannedDiff) > 1) {
              const over = plannedDiff > 0
              return (
                <div className="flex items-start gap-2.5 rounded-[8px] px-3.5 py-2.5"
                  style={{ background: over ? 'color-mix(in srgb, var(--accent-orange) 12%, transparent)' : 'color-mix(in srgb, var(--accent-red) 12%, transparent)', border: `1px solid ${over ? 'var(--accent-orange)' : 'var(--accent-red)'}44` }}>
                  <AlertTriangle size={14} className="mt-0.5 flex-shrink-0" style={{ color: over ? 'var(--accent-orange)' : 'var(--accent-red)' }} />
                  <div>
                    <p className="text-xs font-bold" style={{ color: over ? 'var(--accent-orange)' : 'var(--accent-red)' }}>
                      {over ? `แผนงวดเกินมูลค่างาน ${fmtDiff(plannedDiff)}` : `แผนงวดขาดมูลค่างาน ${fmtDiff(plannedDiff)}`}
                    </p>
                    <p className="text-micro mt-0.5" style={{ color: 'var(--text-3)' }}>
                      แผนงวดรวม {Math.round(totalPlannedAmount).toLocaleString()} · มูลค่างาน {Math.round(jobValue).toLocaleString()} บาท · ต้องแก้ไขแผนงวดก่อนส่งมอบ
                    </p>
                  </div>
                </div>
              )
            }
            // Paid mismatch — only if some installments are paid
            if (paymentDiff !== null && totalPaidAmount > 0 && Math.abs(paymentDiff) > 1) {
              const over = paymentDiff > 0
              return (
                <div className="flex items-start gap-2.5 rounded-[8px] px-3.5 py-2.5"
                  style={{ background: over ? 'color-mix(in srgb, var(--accent-orange) 12%, transparent)' : 'color-mix(in srgb, var(--accent-red) 12%, transparent)', border: `1px solid ${over ? 'var(--accent-orange)' : 'var(--accent-red)'}44` }}>
                  <AlertTriangle size={14} className="mt-0.5 flex-shrink-0" style={{ color: over ? 'var(--accent-orange)' : 'var(--accent-red)' }} />
                  <div>
                    <p className="text-xs font-bold" style={{ color: over ? 'var(--accent-orange)' : 'var(--accent-red)' }}>
                      {over ? `รับเงินเกินมูลค่างาน ${fmtDiff(paymentDiff)}` : `ยังรับเงินไม่ครบ ขาด ${fmtDiff(Math.abs(paymentDiff))}`}
                    </p>
                    <p className="text-micro mt-0.5" style={{ color: 'var(--text-3)' }}>
                      รับแล้ว {Math.round(totalPaidAmount).toLocaleString()} · มูลค่างาน {Math.round(jobValue).toLocaleString()} บาท{!over ? ' · ไม่สามารถส่งมอบได้หากยอดไม่ครบ' : ''}
                    </p>
                  </div>
                </div>
              )
            }
            return null
          })()}

          {hasPlan && totalCount > 0 && (
            <div className="rounded-[11px] px-4 py-3 flex items-center justify-between"
              style={{ background: 'var(--hover-bg)' }}>
              <p className="text-sm font-semibold" style={{ color: paidCount === totalCount ? 'var(--accent-green)' : 'var(--accent-orange)' }}>
                {paidCount}/{totalCount} งวด
              </p>
              <div className="text-right">
                <p className="text-xs" style={{ color: 'var(--text-3)' }}>
                  เก็บแล้ว {fmtBaht(job.installments.filter(i => i.status === 'paid').reduce((s, i) => s + Number(i.amount), 0))}
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
                    <span className="text-micro font-semibold whitespace-nowrap"
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
            <div className="rounded-[11px] overflow-hidden" style={{ border: '1px solid var(--divider)' }}>
              <div className="flex items-center" style={{ background: 'var(--hover-bg)' }}>
                <span className="flex-1 px-4 py-2.5 text-micro font-semibold uppercase tracking-widest" style={{ color: 'var(--text-3)' }}>งวดชำระเงิน</span>
                <button onClick={() => setActionModal('setup')}
                  className="px-3 py-2.5 text-xs font-semibold"
                  style={{ color: 'var(--accent)', borderLeft: '1px solid var(--divider)' }}>
                  แก้ไข
                </button>
              </div>
              <div className="divide-y" style={{ borderColor: 'var(--divider)' }}>
                {job.installments.sort((a, b) => a.installment_no - b.installment_no).map(inst => (
                  <InstRow key={inst.id} inst={inst} job={job}
                    onDateSaved={() => reloadJob()}
                    onUpdated={() => reloadJob()}
                    onDeleted={() => reloadJob()}
                    onCollect={() => setActionModal('pay')} />
                ))}
                <AddInstallmentRow jobId={job.id} customerId={job.customer_id ?? ''} projectId={job.project_id} roomNo={job.room_no}
                  nextNo={job.installments.length + 1}
                  onAdded={() => reloadJob()} />
              </div>
            </div>
          )}

          {/* Documents section */}
          <div className="rounded-[11px] overflow-hidden" style={{ border: '1px solid var(--divider)' }}>
            <button className="w-full flex items-center justify-between px-4 py-2.5"
              style={{ color: 'var(--text-3)', background: 'var(--hover-bg)' }}
              onClick={() => setDocsExpanded(e => !e)}>
              <span className="text-xs">เอกสาร</span>
              <div className="flex items-center gap-2">
                <span className="text-micro" style={{ color: 'var(--text-3)' }}>
                  {[job.quotation1_url, job.quotation2_url, job.id_card_url, job.delivery_doc_url, job.satisfaction_url].filter(Boolean).length}/5
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
              </div>
            )}
          </div>

          {/* File Attachments */}
          <div className="rounded-[11px] p-3" style={{ border: '1px solid var(--divider)' }}>
            <FileAttach jobId={job.id} projectName={job.project_name} roomNo={job.room_no} />
          </div>

          {/* Cancel — hidden behind toggle */}
          {!delivered && (
            <div>
              <button
                onClick={() => { setShowCancelSection(s => !s); setCancelConfirmed(false) }}
                className="flex items-center gap-1 text-label transition-colors"
                style={{ color: 'var(--text-3)' }}>
                <ChevronRight size={12} style={{ transform: showCancelSection ? 'rotate(90deg)' : 'none', transition: 'transform 0.2s' }} />
                สถานะพิเศษ / ลูกค้ายกเลิก
              </button>
              {showCancelSection && (
                <div className="mt-2 rounded-[8px] p-3 space-y-3"
                  style={{ background: 'color-mix(in srgb, var(--accent-red) 6%, transparent)', border: '1px solid color-mix(in srgb, var(--accent-red) 20%, transparent)' }}>
                  <label className="flex items-center gap-2 cursor-pointer select-none">
                    <input type="checkbox" checked={cancelConfirmed} onChange={e => setCancelConfirmed(e.target.checked)}
                      className="w-4 h-4 rounded" style={{ accentColor: 'var(--accent-red)' }} />
                    <span className="text-xs" style={{ color: 'var(--text-2)' }}>ยืนยันว่าต้องการยกเลิกสัญญา</span>
                  </label>
                  <button onClick={() => setShowCancel(true)} disabled={!cancelConfirmed}
                    className="w-full py-2 rounded-[8px] text-xs font-semibold transition-all disabled:opacity-30"
                    style={{ background: 'color-mix(in srgb, var(--accent-red) 15%, transparent)', border: '1px solid color-mix(in srgb, var(--accent-red) 40%, transparent)', color: 'var(--accent-red)' }}>
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
                  {job.warranty_end && (
                    <p className="text-xs mt-0.5" style={{ color: 'var(--text-3)' }}>ประกันหมด {fmtDate(job.warranty_end)}</p>
                  )}
                </div>
                <div className="flex gap-2">
                  {/* A delivered room that never had a plan has no instalment for the
                      collect modal to work on, so "แก้ไขงวดเงิน" opened a form with
                      nothing to fill in and the money could not be recorded at all.
                      `delivered` is checked before `!hasPlan`, so the setup button was
                      unreachable for these — 61 rooms, ฿3.0M. Offer setup instead. */}
                  <button onClick={() => setActionModal(hasPlan ? 'pay' : 'setup')}
                    className="flex-1 py-2 rounded-[8px] text-xs font-semibold"
                    style={hasPlan
                      ? { background: 'var(--hover-bg)', border: '1px solid var(--divider)', color: 'var(--text-2)' }
                      : { background: 'var(--accent)', color: '#fff' }}>
                    {hasPlan ? 'แก้ไขงวดเงิน' : '+ ตั้งงวดเงินย้อนหลัง'}
                  </button>
                  <button onClick={() => setActionModal('handover')}
                    className="flex-1 py-2 rounded-[8px] text-xs font-semibold"
                    style={{ background: 'var(--hover-bg)', border: '1px solid var(--divider)', color: 'var(--text-2)' }}>
                    แก้ไขวันส่งมอบ
                  </button>
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
                {job.customer_type === 'B2B' && !delivered ? (
                  <button onClick={() => setActionModal('quick_deliver')}
                    className="flex-1 py-3 rounded-[var(--radius-pill)] font-bold text-sm text-white"
                    style={{ background: 'var(--accent-green)' }}>
                    ส่งมอบก่อนวางบิล
                  </button>
                ) : finalPaid ? (
                  <button onClick={() => setActionModal('handover')}
                    className="flex-1 py-3 rounded-[var(--radius-pill)] font-bold text-sm text-white"
                    style={{ background: 'var(--accent-green)' }}>
                    ส่งมอบ
                  </button>
                ) : null}
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
      {actionModal === 'quick_deliver' && <QuickDeliverModal job={job} onClose={() => setActionModal(null)} onSaved={handleSaved} />}
      {showCancel && (
        <CancelModal
          onClose={() => setShowCancel(false)}
          onConfirm={async (type, amount, date, notes) => {
            const { data: { session } } = await supabase.auth.getSession()
            await supabase.from('jobs').update({
              working_status: 'ยกเลิก',
              cancel_type: type,
              cancel_date: date || null,
              cancel_amount: amount || null,
              cancel_notes: notes || null,
            }).eq('id', job.id)
            if (amount > 0) {
              await supabase.from('finance_entries').insert({
                type: type === 'forfeit' ? 'income' : 'expense',
                category: type === 'forfeit' ? 'ยึดเงินจอง' : 'คืนเงินยกเลิก',
                amount,
                entry_date: date,
                description: `${type === 'forfeit' ? 'ยึดเงินจอง' : 'คืนเงิน'}: ${job.customer_name} ห้อง ${job.room_no}${notes ? ' — ' + notes : ''}`,
                ref_id: job.id,
                created_by: session?.user?.id || null,
              })
            }
            setShowCancel(false)
            onClose()
            onRefresh()
          }}
        />
      )}
    </>
  )
}

// ─── Room Card ─────────────────────────────────────────────
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

function RoomCard({ job, onClick, onDelete, seqNo }: { job: RoomJob; onClick: () => void; onDelete: () => void; seqNo?: number }) {
  const stage = getChipStage(job)
  const meta = STAGE_META[stage]
  const isDone = stage === 'done'
  const payPct = job.revenue_inc_vat > 0 ? Math.min(100, Math.round(job.total_settled / job.revenue_inc_vat * 100)) : null
  const barColor = payPct === null ? '' : payPct >= 100 ? 'var(--accent-green)' : payPct >= 50 ? 'var(--accent-blue)' : 'var(--accent-orange)'

  return (
    <div
      className="relative group w-full rounded-[11px] p-3 flex flex-col gap-2 transition-all cursor-pointer"
      style={{ background: 'var(--card-bg)', border: '1px solid var(--card-border)', opacity: isDone ? 0.7 : 1 }}
      onMouseEnter={e => (e.currentTarget.style.borderColor = 'var(--accent)')}
      onMouseLeave={e => (e.currentTarget.style.borderColor = 'var(--card-border)')}
      onClick={onClick}
    >
      {/* Row 1: room_no + subtitle | badge */}
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <p className="font-bold text-sm truncate" style={{ color: isDone ? 'var(--text-3)' : 'var(--text-1)' }}>{job.room_no}</p>
            {seqNo && seqNo > 1 && (
              <span className="text-micro font-bold px-1.5 py-0.5 rounded-[4px] flex-shrink-0"
                style={{ background: 'color-mix(in srgb, var(--accent) 15%, transparent)', color: 'var(--accent)' }}>
                งานที่ {seqNo}
              </span>
            )}
          </div>
          <p className="text-label truncate mt-0.5" style={{ color: 'var(--text-3)' }}>
            {job.customer_name || '—'}{job.project_name ? ` · ${job.project_name}` : ''}
          </p>
        </div>
        <span className="text-micro font-semibold px-1.5 py-0.5 rounded-[4px] flex-shrink-0 mt-0.5"
          style={{ background: meta.bg, color: meta.color, border: `1px solid ${meta.border}` }}>
          {meta.label}
        </span>
      </div>
      {/* Row 2: payment chips */}
      {job.has_plan && job.total_count > 0 && (
        <div className="flex items-center gap-1.5 flex-wrap">
          <span className="text-micro px-1.5 py-0.5 rounded-[4px] font-semibold"
            style={{ background: 'var(--hover-bg)', color: job.paid_count === job.total_count ? 'var(--accent-green)' : 'var(--accent-orange)' }}>
            {job.paid_count}/{job.total_count} งวด
          </span>
          {job.has_overdue && (
            <span className="text-micro px-1.5 py-0.5 rounded-[4px] font-semibold"
              style={{ background: 'color-mix(in srgb, var(--accent-red) 12%, transparent)', color: 'var(--accent-red)' }}>
              เกินกำหนด
            </span>
          )}
        </div>
      )}
      {/* Row 3: progress bar */}
      {payPct !== null && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: '10px', color: 'var(--text-3)' }}>ชำระแล้ว</span>
            <span style={{ fontSize: '10px', fontWeight: 700, color: barColor }}>{payPct}%</span>
          </div>
          <div style={{ height: '4px', borderRadius: '9999px', overflow: 'hidden', background: 'var(--hover-bg)' }}>
            <div style={{ height: '100%', width: `${payPct}%`, borderRadius: '9999px', background: barColor }} />
          </div>
        </div>
      )}
      {/* Row 4: amount + sales + chevron */}
      <div className="flex items-center justify-between gap-2">
        <div className="min-w-0 flex-1">
          {job.revenue_inc_vat > 0
            ? <p className="text-xs font-bold" style={{ color: 'var(--accent-green)' }}>฿<Money value={job.revenue_inc_vat} /></p>
            : <p className="text-micro" style={{ color: 'var(--text-3)' }}>ยังไม่มีมูลค่า</p>}
          {job.sales_name && <p className="text-micro truncate" style={{ color: 'var(--text-3)' }}>{job.sales_name}</p>}
        </div>
        <ChevronRight size={14} style={{ color: 'var(--text-3)' }} className="opacity-40 group-hover:opacity-100 transition-opacity flex-shrink-0" />
      </div>
      {/* Delete button */}
      <button
        onClick={e => { e.stopPropagation(); onDelete() }}
        className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity p-1 rounded-[6px]"
        style={{ color: 'var(--accent-red)', background: 'var(--hover-bg)' }}
        title="ลบงาน"
      >
        <Trash2 size={11} />
      </button>
    </div>
  )
}

// ─── Main Page ─────────────────────────────────────────────
export default function MyDealsPage() {
  const supabase = createClient()
  const router = useRouter()
  const [jobs, setJobs] = useState<RoomJob[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [filterProject, setFilterProject] = useState('')
  const [filterSales, setFilterSales] = useState('')
  const [filterStage, setFilterStage] = useState<ChipStage | ''>('')
  const [doneExpanded, setDoneExpanded] = useState<Record<string, boolean>>({})
  const [selectedJobId, setSelectedJobId] = useState<string | null>(null)
  const [drawerJob, setDrawerJob] = useState<FullJob | null>(null)
  const [drawerLoading, setDrawerLoading] = useState(false)
  const [salesUsers, setSalesUsers] = useState<string[]>([])
  const [returnTo] = useState(() =>
    typeof window !== 'undefined' ? new URLSearchParams(window.location.search).get('returnTo') : null
  )

  const load = useCallback(async () => {
    setLoading(true)
    const { data } = await supabase
      .from('jobs')
      .select('id, room_no, project_id, customer_name, customer_type, working_status, actual_deliver_date, work_start_date, work_days, order_date, contract_date, expected_finish_date, revenue_inc_vat, revenue_ex_vat, projects(name), sales:users!sales_id(name), installments:payments(id, installment_no, installment_name, amount, paid_amount, percentage, status, due_date, paid_date, is_work_trigger, is_final, channel, slip_url, receipt_url, voucher_code, voucher_amount, line_notified_at)')
      .neq('working_status', 'ยกเลิก')
      .neq('working_status', 'จอง')
      .order('room_no')

    const { data: usersData } = await supabase.from('users').select('name').eq('active', true).in('dept', ['Sales Executive', 'Administration']).order('name')
    setSalesUsers((usersData || []).map((u: any) => u.name))

    if (!data) { setLoading(false); return }

    setJobs((data as any[]).map(r => {
      const insts: { status: string; is_final: boolean; amount: number; paid_amount?: number | null; voucher_amount?: number; due_date?: string | null }[] = r.installments || []
      return {
        id: r.id,
        room_no: r.room_no || '',
        project_id: r.project_id || '',
        project_name: r.projects?.name || r.project_id || '',
        customer_name: r.customer_name || '',
        customer_type: r.customer_type || 'B2C',
        sales_name: r.sales?.name || '',
        order_date: r.order_date || null,
        actual_deliver_date: r.actual_deliver_date || null,
        revenue_inc_vat: r.revenue_inc_vat || r.revenue_ex_vat || 0,
        has_plan: insts.length > 0,
        // payments.status only ever holds 'paid' or 'pending' — there is no
        // 'overdue' row in the table, so the old check was false for every job
        // and the red งวดเกินกำหนด chip could never appear. Overdue is derived:
        // still pending, and its due date has passed.
        has_overdue: insts.some(i => i.status !== 'paid' && !!i.due_date && i.due_date < todayStr()),
        all_paid: insts.length > 0 && insts.every(i => i.status === 'paid'),
        paid_count: insts.filter(i => i.status === 'paid').length,
        total_count: insts.length,
        // The deal value, not the sum of the payment plan. Most jobs carry only a
        // booking instalment until the plan is set up, so summing the plan counted
        // a ฿2,000,000 room as ฿10,000 — ฿2.2M missing across the board.
        total_amount: r.revenue_inc_vat || r.revenue_ex_vat || 0,
        paid_amount_total: insts.filter(i => i.status === 'paid')
          .reduce((s, i) => s + Number(i.paid_amount ?? i.amount ?? 0), 0),
        total_paid: insts.filter(i => i.status === 'paid').reduce((s, i) => s + Number(i.paid_amount ?? i.amount ?? 0), 0),
        total_settled: insts.filter(i => i.status === 'paid').reduce((s, i) => s + Number(i.paid_amount ?? i.amount ?? 0) + Number(i.voucher_amount ?? 0), 0),
        working_status: r.working_status || '',
      }
    }))
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

  async function deleteJob(job: RoomJob) {
    if (!confirm(`ลบงาน "${job.room_no}" (${job.customer_name || ''}) ?\nงวดชำระทั้งหมดจะถูกลบด้วย`)) return
    await supabase.from('payments').delete().eq('job_id', job.id)
    await supabase.from('jobs').delete().eq('id', job.id)
    setJobs(prev => prev.filter(j => j.id !== job.id))
    if (selectedJobId === job.id) { setSelectedJobId(null); setDrawerJob(null) }
  }

  // Auto-open drawer from ?job= param (e.g. navigated from Handover)
  useEffect(() => {
    const jobId = new URLSearchParams(window.location.search).get('job')
    if (jobId) openDrawer(jobId)
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  async function openDrawer(jobId: string) {
    setSelectedJobId(jobId)
    setDrawerLoading(true)
    setDrawerJob(null)
    const { data: raw } = await supabase
      .from('jobs')
      .select('*, projects(name), sales:users!sales_id(name), installments:payments(id, installment_no, installment_name, amount, paid_amount, percentage, status, due_date, paid_date, is_work_trigger, is_final, channel, slip_url, receipt_url, voucher_code, voucher_amount, line_notified_at)')
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
      package_type: raw.package_type || null,
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
        voucher_amount: p.voucher_amount || 0,
      })),
    })
    setDrawerLoading(false)
  }

  function closeDrawer() {
    setSelectedJobId(null)
    setDrawerJob(null)
    setDrawerLoading(false)
    if (returnTo) router.push(returnTo)
  }

  async function handleRefresh() {
    await load()
    if (selectedJobId) await openDrawer(selectedJobId)
  }

  const projectOptions = useMemo(() => {
    const seen = new Map<string, string>()
    jobs.forEach(j => { if (j.project_id && !seen.has(j.project_id)) seen.set(j.project_id, j.project_name) })
    return Array.from(seen.entries()).sort((a, b) => a[1].localeCompare(b[1]))
  }, [jobs])


  /**
   * Everything the project / sales / search filters let through, before the
   * stage chips narrow it further. The chip counts are taken from here so they
   * describe what is actually on screen: pick a project and the counts follow.
   */
  const visibleBase = useMemo(() => {
    const q = search.toLowerCase().replace(/[-\s]/g, '')
    return jobs.filter(j => {
      if (filterProject && j.project_id !== filterProject) return false
      if (filterSales && j.sales_name !== filterSales) return false
      // Only show jobs with ≥50% settled (cash + voucher) — unless B2B, already delivered, or work has started
      if (j.customer_type !== 'B2B' && !j.actual_deliver_date) {
        const workStarted = j.working_status === 'ดำเนินการ' || j.working_status === 'รอส่งมอบ'
        const jobValue = j.revenue_inc_vat || 0
        if (jobValue > 0 && !workStarted && j.total_settled / jobValue < 0.5) return false
      }
      if (q) {
        const room = j.room_no.toLowerCase().replace(/[-\s]/g, '')
        return room.includes(q) || j.customer_name.toLowerCase().includes(search.toLowerCase())
          || j.project_name.toLowerCase().includes(search.toLowerCase())
      }
      return true
    })
  }, [jobs, search, filterProject, filterSales])

  const stageCounts = useMemo(() => {
    const c = { wait: 0, collect: 0, ready: 0, overdue: 0, done: 0, bill: 0 } as Record<ChipStage, number>
    for (const j of visibleBase) c[getChipStage(j)]++
    return c
  }, [visibleBase])

  const grouped = useMemo(() => {
    const visible = filterStage ? visibleBase.filter(j => getChipStage(j) === filterStage) : visibleBase

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
  }, [visibleBase, filterStage])

  const totalActive = useMemo(() => jobs.filter(j => !j.actual_deliver_date).length, [jobs])

  return (
    <div className="page-content">
      {/* Header */}
      <PageHeader
        title="My Deals"
        subtitle={loading ? undefined : `${totalActive} งานที่กำลังดำเนินการ · ${grouped.length} โครงการ`}
        className="mb-5"
      />

      {/* Filter bar — separate row, same position as Pipeline */}
      <FilterBar search={search} onSearchChange={setSearch} searchPlaceholder="ค้นหาห้อง, ลูกค้า..." className="mb-4">
        <select value={filterProject} onChange={e => setFilterProject(e.target.value)}
          className="field-input" style={{ width: 'auto', maxWidth: '10rem' }}>
          <option value="">ทุกโครงการ</option>
          {projectOptions.map(([pid, name]) => <option key={pid} value={pid}>{name}</option>)}
        </select>
        <select value={filterSales} onChange={e => setFilterSales(e.target.value)}
          className="field-input" style={{ width: 'auto' }}>
          <option value="">ทุก Sales</option>
          {salesUsers.map(n => <option key={n} value={n}>{n}</option>)}
        </select>
        {(search || filterProject || filterSales || filterStage) && (
          <button onClick={() => { setSearch(''); setFilterProject(''); setFilterSales(''); setFilterStage('') }}
            className="text-xs px-2 py-1.5 rounded-[8px] transition-colors"
            style={{ color: 'var(--text-3)', background: 'var(--hover-bg)', border: '1px solid var(--divider)' }}>
            ล้าง
          </button>
        )}
        <span className="text-xs ml-auto" style={{ color: 'var(--text-3)' }}>
          {grouped.reduce((s, g) => s + g.active.length + g.done.length, 0)} ราย
        </span>
      </FilterBar>

      {/* Stage chips — the colour key and the filter are the same control.
          They read as a legend when nothing is selected, so the meaning of each
          card colour is still explained, but clicking one narrows the grid to
          that stage. Counts come from visibleBase, so they always describe what
          the other filters have already let through. A stage with no rooms is
          shown greyed and unclickable rather than hidden, so the key stays
          complete. */}
      <div className="tab-group mb-6 flex-wrap">
        <button onClick={() => setFilterStage('')}
          className={`tab-btn ${!filterStage ? 'active' : ''}`}>
          ทั้งหมด {visibleBase.length}
        </button>
        {(Object.entries(STAGE_META) as [ChipStage, typeof STAGE_META[ChipStage]][]).map(([stage, m]) => {
          const n = stageCounts[stage]
          const on = filterStage === stage
          const empty = n === 0
          return (
            <button
              key={stage}
              disabled={empty}
              onClick={() => setFilterStage(on ? '' : stage)}
              aria-pressed={on}
              className="tab-btn"
              // The stage colour has to survive the active state: .tab-btn.active
              // paints everything --accent, which would turn the red overdue chip
              // purple exactly when it is selected. Shape, wrapper and sizing stay
              // the shared ones; only the two colours are the stage's own.
              style={{
                background: on ? m.bg : 'transparent',
                color: empty ? 'var(--text-3)' : on ? m.color : 'var(--text-2)',
                cursor: empty ? 'default' : 'pointer',
                opacity: empty ? 0.45 : 1,
              }}>
              <span style={{ width: 8, height: 8, borderRadius: '50%', background: m.dot, display: 'inline-block', flexShrink: 0 }} />
              {m.label} {n}
            </button>
          )
        })}
      </div>

      {/* Summary strip — the rooms still being worked on lead, because those are
          the ones anyone can still act on. Delivered rooms stay as the base each
          figure is measured against, on the second line. */}
      {!loading && jobs.length > 0 && (() => {
        const activeJobs = grouped.flatMap(g => g.active)
        const doneJobs = grouped.flatMap(g => g.done)
        const sumRev = (list: RoomJob[]) => list.reduce((s, j) => s + j.total_amount, 0)
        const sumPaid = (list: RoomJob[]) => list.reduce((s, j) => s + j.paid_amount_total, 0)
        const activeRev = sumRev(activeJobs), activePaid = sumPaid(activeJobs)
        const activeDue = Math.max(activeRev - activePaid, 0)
        const activePct = activeRev > 0 ? Math.round(activePaid / activeRev * 100) : 0
        const allRev = sumRev([...activeJobs, ...doneJobs])
        const allDue = Math.max(allRev - sumPaid([...activeJobs, ...doneJobs]), 0)
        const owing = activeJobs.filter(j => j.total_amount - j.paid_amount_total > 1).length
        const fk = (n: number) => n >= 1000000 ? '฿' + (n / 1000000).toFixed(1) + 'M'
          : n > 0 ? '฿' + Math.round(n / 1000).toLocaleString('th-TH') + 'K' : '฿0'
        return (
          <div className="flex-shrink-0 mb-4 grid grid-cols-3 gap-2">
            <div className="ds-card-sm text-center">
              <p className="text-micro font-semibold uppercase tracking-wider mb-1" style={{ color: 'var(--text-3)' }}>กำลังทำ</p>
              <p className="text-lg font-bold" style={{ color: 'var(--text-1)' }}>{activeJobs.length}</p>
              <p className="text-micro" style={{ color: 'var(--text-3)' }}>ส่งมอบแล้ว {doneJobs.length}</p>
            </div>
            <div className="ds-card-sm text-center">
              <p className="text-micro font-semibold uppercase tracking-wider mb-1" style={{ color: 'var(--text-3)' }}>มูลค่างานที่ทำอยู่</p>
              <p className="text-lg font-bold" style={{ color: 'var(--text-1)' }}>{fk(activeRev)}</p>
              {/* The all-rooms total lives here so nobody has to leave the page for
                  it — Revenue is period-scoped and cannot answer "everything so far". */}
              <p className="text-micro" style={{ color: 'var(--text-3)' }}>เก็บแล้ว {activePct}% · รวมส่งมอบ {fk(allRev)}</p>
            </div>
            <div className="ds-card-sm text-center">
              <p className="text-micro font-semibold uppercase tracking-wider mb-1" style={{ color: 'var(--text-3)' }}>ค้างรับ</p>
              <p className="text-lg font-bold" style={{ color: activeDue > 0 ? 'var(--accent-orange)' : 'var(--accent-green)' }}>{fk(activeDue)}</p>
              <p className="text-micro" style={{ color: 'var(--text-3)' }}>
                {owing} ห้อง · รวมส่งมอบ {fk(allDue)}
              </p>
            </div>
          </div>
        )
      })()}

      {/* Groups */}
      {loading ? (
        <div className="space-y-2">
          {[1, 2, 3, 4, 5].map(i => <CardSkeleton key={i} />)}
        </div>
      ) : grouped.length === 0 ? (
        <div className="ds-card"><EmptyState icon={Search} message="ไม่พบงาน" sub="ลองปรับ filter หรือตรวจสอบข้อมูล" /></div>
      ) : (
        <div className="space-y-8">
          {(() => {
            const allVisible = grouped.flatMap(g => [...g.active, ...g.done])
            const seqMap = buildSeqMap(allVisible)
            return grouped.map(({ pid, name, active, done }) => (
            <div key={pid}>
              {/* Project header */}
              <div className="flex items-center gap-2 mb-3 min-w-0">
                <span className="text-sm font-semibold truncate min-w-0" style={{ color: 'var(--text-1)' }}>{name}</span>
                <span className="text-xs px-2 py-0.5 rounded-[4px] font-semibold"
                  style={{ background: 'var(--hover-bg)', color: 'var(--text-3)' }}>
                  {filterStage ? active.length + done.length : active.length} ห้อง
                </span>
                {!filterStage && done.length > 0 && (
                  <span className="text-xs" style={{ color: 'var(--text-3)' }}>· ส่งมอบแล้ว {done.length}</span>
                )}
              </div>

              {/* Active room cards */}
              {active.length > 0 && (
                <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4 gap-3">
                  {active.map(j => (
                    <RoomCard key={j.id} job={j} onClick={() => openDrawer(j.id)} onDelete={() => deleteJob(j)} seqNo={seqMap[j.id]} />
                  ))}
                </div>
              )}

              {/* Done rooms collapsible — but when a stage chip is filtering to
                  a delivered stage, hiding the only matches behind a collapsed
                  toggle would show an empty project, so open it. */}
              {done.length > 0 && filterStage && (
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-3">
                  {done.map(j => (
                    <RoomCard key={j.id} job={j} onClick={() => openDrawer(j.id)} onDelete={() => deleteJob(j)} seqNo={seqMap[j.id]} />
                  ))}
                </div>
              )}
              {done.length > 0 && !filterStage && (
                <div className="mt-2">
                  <button
                    className="flex items-center gap-1.5 text-xs py-1"
                    style={{ color: 'var(--text-3)', background: 'none', border: 'none', cursor: 'pointer' }}
                    onClick={() => setDoneExpanded(prev => ({ ...prev, [pid]: !prev[pid] }))}>
                    {doneExpanded[pid] ? <ChevronDown size={12} style={{ color: 'var(--text-3)' }} /> : <ChevronRight size={12} style={{ color: 'var(--text-3)' }} />}
                    ส่งมอบแล้ว {done.length} ห้อง
                  </button>
                  {doneExpanded[pid] && (
                    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-3 mt-2">
                      {done.map(j => (
                        <RoomCard key={j.id} job={j} onClick={() => openDrawer(j.id)} onDelete={() => deleteJob(j)} seqNo={seqMap[j.id]} />
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          ))})()}
        </div>
      )}

      {/* Drawer loading indicator */}
      {drawerLoading && (
        <>
          <div className="fixed inset-0 z-40 bg-black/60 backdrop-blur-sm" onClick={closeDrawer} />
          <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center pointer-events-none px-4 pb-4 pt-14 lg:pt-4">
            <div className="w-full max-w-[460px] max-h-[90vh] flex items-center justify-center rounded-[20px] p-12 pointer-events-auto"
              data-panel style={{ background: 'var(--panel-bg)', border: '1px solid var(--card-border)' }}>
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

