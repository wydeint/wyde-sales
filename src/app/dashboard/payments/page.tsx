'use client'

import { useEffect, useState, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Search, CheckCircle2, Circle, Plus, X, Paperclip, ChevronDown, ChevronUp, Settings2, AlertCircle } from 'lucide-react'
import { PageError } from '@/components/ui/StateUI'

// ─── Types ────────────────────────────────────────────────
type ClientType = 'B2C' | 'B2B'
type PlanType = 'A' | 'B' | 'C' | '2' | '3' | '4' | '5' | '6'

interface Job {
  id: string
  customer_id: string | null
  lead_id: number | null
  project_id: string
  room_no: string
  customer_name: string
  customer_type: ClientType
  revenue_ex_vat: number
  working_status: string
  order_date: string | null
  sales_id: string
  sales_name: string
  project_name: string
  payment_plan_type: PlanType | null
  work_days: number | null
  contract_date: string | null
  work_start_date: string | null
  installments: Installment[]
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
  file_urls: string[]
}

interface RawJob {
  id: string
  customer_id: string | null
  lead_id: number | null
  project_id: string
  room_no: string
  customer_name: string
  customer_type: string
  revenue_ex_vat: number
  working_status: string
  order_date: string | null
  sales_id: string
  payment_plan_type: string | null
  work_days: number | null
  contract_date: string | null
  work_start_date: string | null
  condo_leads?: { customer_name: string } | null
  projects?: { name: string } | null
  sales?: { name: string } | null
}

interface RawPayment {
  id: string
  job_id: string | null
  installment_no: number
  installment_name: string
  amount: number
  percentage: number | null
  status: string
  due_date: string | null
  paid_date: string | null
  is_work_trigger: boolean | null
  is_final: boolean | null
  file_urls: string[] | null
}

// ─── Helpers ──────────────────────────────────────────────
const fmtBaht = (n: number) => n ? '฿' + n.toLocaleString('th-TH') : '฿0'
const fmtDate = (d: string | null) => d ? new Date(d).toLocaleDateString('th-TH', { day: '2-digit', month: 'short', year: '2-digit' }) : '—'

const WORK_DAYS_OPTIONS = [
  { value: 30, label: '30 วัน' },
  { value: 45, label: '45 วัน' },
  { value: 60, label: '60 วัน' },
  { value: 90, label: '90 วัน' },
]

const B2C_PLANS = [
  { value: 'A', label: 'แบบ A — จ่ายทั้งหมด 100%', desc: '1 งวด ชำระเต็มจำนวน' },
  { value: 'B', label: 'แบบ B — 50% + 50%', desc: '2 งวด แรก 50% สุดท้าย 50%' },
  { value: 'C', label: 'แบบ C — มัดจำ + 50% + 50%', desc: '3 งวด มัดจำก่อน แล้วแบ่ง 50/50' },
]

function calcB2CInstallments(plan: string, total: number, deposit: number) {
  if (plan === 'A') return [
    { no: 1, name: 'ชำระเต็มจำนวน 100%', pct: 100, amount: total, trigger: true, final: true }
  ]
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
    name: i === 0 ? 'งวดที่ 1 เริ่มงาน' : i === count - 1 ? `งวดสุดท้าย ส่งมอบ` : `งวดที่ ${i + 1}`,
    pct,
    amount: Math.round((pct / 100) * total),
    trigger: i === 0,
    final: i === count - 1,
  }))
}

function statusBadge(s: string) {
  if (s === 'paid') return 'bg-green-500/15 text-green-400 border border-green-500/20'
  if (s === 'overdue') return 'bg-red-500/15 text-red-400 border border-red-500/20'
  return 'bg-[#21262d] text-[#8b949e] border border-[#30363d]'
}

function statusLabel(s: string) {
  if (s === 'paid') return 'ชำระแล้ว'
  if (s === 'overdue') return 'เกินกำหนด'
  return 'รอชำระ'
}

// ─── Plan Setup Modal ──────────────────────────────────────
function PlanSetupModal({
  job, open, onClose, onSaved
}: {
  job: Job; open: boolean; onClose: () => void; onSaved: () => void
}) {
  const supabase = createClient()
  const [clientType, setClientType] = useState<ClientType>(job.customer_type)
  const [plan, setPlan] = useState<string>(job.payment_plan_type || 'C')
  const [workDays, setWorkDays] = useState(job.work_days || 45)
  const [contractDate, setContractDate] = useState(job.contract_date || '')
  const [depositAmount, setDepositAmount] = useState(0)
  const [b2bCount, setB2bCount] = useState(3)
  const [b2bPcts, setB2bPcts] = useState([30, 40, 30])
  const [saving, setSaving] = useState(false)

  const total = job.revenue_ex_vat || 0

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

  async function save() {
    if (clientType === 'B2B' && !pctValid) return
    setSaving(true)

    // Update job
    await supabase.from('jobs').update({
      customer_type: clientType,
      payment_plan_type: clientType === 'B2C' ? plan : String(b2bCount),
      work_days: workDays,
      contract_date: contractDate || null,
    }).eq('id', job.id)

    // Delete old installments for this job
    await supabase.from('payments').delete().eq('job_id', job.id)

    // Insert new installments
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
      status: 'pending',
      is_work_trigger: p.trigger,
      is_final: p.final,
    }))
    await supabase.from('payments').insert(rows)

    setSaving(false)
    onSaved()
    onClose()
  }

  if (!open) return null

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4" onClick={onClose}>
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
      <div
        className="relative w-full max-w-lg bg-[#161b22] border border-[#30363d] rounded-2xl shadow-2xl max-h-[90vh] overflow-y-auto"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between p-5 border-b border-[#21262d]">
          <div>
            <h3 className="text-white font-semibold">ตั้งแผนชำระเงิน</h3>
            <p className="text-[#8b949e] text-xs mt-0.5">{job.id} · {job.customer_name} · {job.room_no}</p>
          </div>
          <button onClick={onClose} className="text-[#8b949e] hover:text-white p-1"><X size={18} /></button>
        </div>

        <div className="p-5 space-y-5">
          {/* Total */}
          <div className="bg-[#0d1117] rounded-xl p-4 text-center">
            <p className="text-[#8b949e] text-xs mb-1">มูลค่างานรวม</p>
            <p className="text-2xl font-bold text-white">{fmtBaht(total)}</p>
          </div>

          {/* Client type */}
          <div>
            <p className="text-xs text-[#8b949e] mb-2">ประเภทลูกค้า</p>
            <div className="grid grid-cols-2 gap-2">
              {(['B2C', 'B2B'] as ClientType[]).map(t => (
                <button key={t} onClick={() => setClientType(t)}
                  className={`py-2.5 rounded-xl text-sm font-semibold border transition-all ${clientType === t ? 'bg-indigo-500/20 border-indigo-500/50 text-indigo-300' : 'bg-[#21262d] border-[#30363d] text-[#8b949e]'}`}>
                  {t}
                </button>
              ))}
            </div>
          </div>

          {/* B2C Plan */}
          {clientType === 'B2C' && (
            <div>
              <p className="text-xs text-[#8b949e] mb-2">รูปแบบการชำระ</p>
              <div className="space-y-2">
                {B2C_PLANS.map(p => (
                  <button key={p.value} onClick={() => setPlan(p.value)}
                    className={`w-full text-left px-4 py-3 rounded-xl border transition-all ${plan === p.value ? 'bg-amber-500/10 border-amber-500/30 text-amber-200' : 'bg-[#21262d] border-[#30363d] text-[#c9d1d9] hover:border-[#484f58]'}`}>
                    <p className="text-sm font-medium">{p.label}</p>
                    <p className="text-xs opacity-60 mt-0.5">{p.desc}</p>
                  </button>
                ))}
              </div>
              {plan === 'C' && (
                <div className="mt-3">
                  <label className="text-xs text-[#8b949e]">ยอดมัดจำจองสิทธิ์ (บาท)</label>
                  <input type="number" value={depositAmount || ''} onChange={e => setDepositAmount(Number(e.target.value))}
                    placeholder={`เช่น ${Math.round(total * 0.1).toLocaleString()} (10%)`}
                    className="mt-1 w-full bg-[#21262d] border border-[#30363d] rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-[#58a6ff]" />
                </div>
              )}
            </div>
          )}

          {/* B2B Plan */}
          {clientType === 'B2B' && (
            <div className="space-y-3">
              <div>
                <p className="text-xs text-[#8b949e] mb-2">จำนวนงวด</p>
                <div className="flex gap-2">
                  {[2, 3, 4, 5, 6].map(n => (
                    <button key={n} onClick={() => updateB2bCount(n)}
                      className={`flex-1 py-2 rounded-xl text-sm font-semibold border transition-all ${b2bCount === n ? 'bg-blue-500/20 border-blue-500/40 text-blue-300' : 'bg-[#21262d] border-[#30363d] text-[#8b949e]'}`}>
                      {n}
                    </button>
                  ))}
                </div>
              </div>
              <div className="space-y-2">
                <p className="text-xs text-[#8b949e]">% แต่ละงวด <span className={pctValid ? 'text-green-400' : 'text-red-400'}>(รวม {pctSum}%)</span></p>
                {b2bPcts.slice(0, b2bCount).map((pct, i) => (
                  <div key={i} className="flex items-center gap-3">
                    <span className="text-xs text-[#8b949e] w-16">งวดที่ {i + 1}</span>
                    <input type="number" value={pct}
                      onChange={e => {
                        const np = [...b2bPcts]; np[i] = Number(e.target.value); setB2bPcts(np)
                      }}
                      className="w-20 bg-[#21262d] border border-[#30363d] rounded-lg px-2 py-1.5 text-sm text-white text-center focus:outline-none focus:border-[#58a6ff]" />
                    <span className="text-[#8b949e] text-xs">% = {fmtBaht(Math.round((pct / 100) * total))}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Work days + Contract date */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <p className="text-xs text-[#8b949e] mb-1.5">ระยะเวลางาน</p>
              <select value={workDays} onChange={e => setWorkDays(Number(e.target.value))}
                className="w-full bg-[#21262d] border border-[#30363d] rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-[#58a6ff]">
                {WORK_DAYS_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            </div>
            <div>
              <p className="text-xs text-[#8b949e] mb-1.5">วันเซ็นสัญญา</p>
              <input type="date" value={contractDate} onChange={e => setContractDate(e.target.value)}
                className="w-full bg-[#21262d] border border-[#30363d] rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-[#58a6ff]" />
            </div>
          </div>

          {/* Preview */}
          {preview.length > 0 && (
            <div className="bg-[#0d1117] rounded-xl p-4">
              <p className="text-xs text-[#8b949e] mb-3 font-medium">ตัวอย่างแผนงวด</p>
              <div className="space-y-2">
                {preview.map((p, i) => (
                  <div key={i} className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <div className={`w-5 h-5 rounded-full flex items-center justify-center text-[9px] font-bold ${p.trigger ? 'bg-amber-500/20 text-amber-300' : p.final ? 'bg-green-500/20 text-green-400' : 'bg-[#21262d] text-[#8b949e]'}`}>
                        {p.no}
                      </div>
                      <span className="text-xs text-[#c9d1d9]">{p.name}</span>
                      {p.trigger && <span className="text-[9px] bg-amber-500/15 text-amber-300 px-1.5 py-0.5 rounded">▶ เริ่มงาน</span>}
                      {p.final && <span className="text-[9px] bg-green-500/15 text-green-400 px-1.5 py-0.5 rounded">⚑ สุดท้าย</span>}
                    </div>
                    <div className="text-right">
                      <span className="text-sm font-semibold text-white">{fmtBaht(p.amount)}</span>
                      <span className="text-xs text-[#484f58] ml-1">({p.pct}%)</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        <div className="flex justify-end gap-3 p-5 border-t border-[#21262d]">
          <button onClick={onClose} className="px-4 py-2 text-[#8b949e] hover:text-white text-sm">ยกเลิก</button>
          <button onClick={save} disabled={saving || (clientType === 'B2B' && !pctValid) || preview.length === 0}
            className="px-5 py-2 bg-[#238636] hover:bg-[#2ea043] disabled:opacity-40 text-white text-sm rounded-xl font-medium transition-colors">
            {saving ? 'กำลังบันทึก...' : 'บันทึกแผน'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Record Payment Modal ──────────────────────────────────
function RecordPaymentModal({
  installment, open, onClose, onSaved
}: {
  installment: Installment | null; open: boolean; onClose: () => void; onSaved: (jobId: string | null, isWorkTrigger: boolean) => void
}) {
  const supabase = createClient()
  const [paidDate, setPaidDate] = useState(new Date().toISOString().slice(0, 10))
  const [fileUrls, setFileUrls] = useState<string[]>([''])
  const [saving, setSaving] = useState(false)

  function addFileUrl() { if (fileUrls.length < 5) setFileUrls([...fileUrls, '']) }
  function removeFileUrl(i: number) { setFileUrls(fileUrls.filter((_, idx) => idx !== i)) }
  function updateFileUrl(i: number, v: string) { const n = [...fileUrls]; n[i] = v; setFileUrls(n) }

  async function save() {
    if (!installment) return
    setSaving(true)
    const urls = fileUrls.filter(u => u.trim())
    await supabase.from('payments').update({
      status: 'paid',
      paid_date: paidDate,
      file_urls: urls.length > 0 ? urls : null,
    }).eq('id', installment.id)

    setSaving(false)
    onSaved(null, installment.is_work_trigger)
    onClose()
  }

  if (!open || !installment) return null

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4" onClick={onClose}>
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
      <div className="relative w-full max-w-md bg-[#161b22] border border-[#30363d] rounded-2xl shadow-2xl" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between p-5 border-b border-[#21262d]">
          <div>
            <h3 className="text-white font-semibold">บันทึกการชำระเงิน</h3>
            <p className="text-[#8b949e] text-xs mt-0.5">{installment.installment_name}</p>
          </div>
          <button onClick={onClose} className="text-[#8b949e] hover:text-white"><X size={18} /></button>
        </div>
        <div className="p-5 space-y-4">
          <div className="bg-[#0d1117] rounded-xl p-4 text-center">
            <p className="text-[#8b949e] text-xs mb-1">ยอดชำระ</p>
            <p className="text-2xl font-bold text-white">{fmtBaht(installment.amount)}</p>
            {installment.is_work_trigger && (
              <p className="text-amber-400 text-xs mt-2">⚡ งวดนี้จะ trigger วันเริ่มงาน</p>
            )}
            {installment.is_final && (
              <p className="text-green-400 text-xs mt-1">⚑ งวดสุดท้าย — unlock การส่งมอบ</p>
            )}
          </div>

          <div>
            <label className="text-xs text-[#8b949e] mb-1.5 block">วันที่ชำระ</label>
            <input type="date" value={paidDate} onChange={e => setPaidDate(e.target.value)}
              className="w-full bg-[#21262d] border border-[#30363d] rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-[#58a6ff]" />
          </div>

          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-xs text-[#8b949e]">แนบสลิป/เอกสาร (Google Drive URL)</label>
              {fileUrls.length < 5 && (
                <button onClick={addFileUrl} className="text-xs text-[#58a6ff] flex items-center gap-1">
                  <Plus size={12} />เพิ่มไฟล์
                </button>
              )}
            </div>
            <div className="space-y-2">
              {fileUrls.map((url, i) => (
                <div key={i} className="flex gap-2">
                  <input value={url} onChange={e => updateFileUrl(i, e.target.value)}
                    placeholder="https://drive.google.com/..."
                    className="flex-1 bg-[#21262d] border border-[#30363d] rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-[#58a6ff]" />
                  {fileUrls.length > 1 && (
                    <button onClick={() => removeFileUrl(i)} className="text-[#484f58] hover:text-red-400 p-2"><X size={14} /></button>
                  )}
                </div>
              ))}
            </div>
            <p className="text-[#484f58] text-[10px] mt-1">รองรับ jpg, pdf — ไม่เกิน 5 ไฟล์</p>
          </div>
        </div>
        <div className="flex justify-end gap-3 p-5 border-t border-[#21262d]">
          <button onClick={onClose} className="px-4 py-2 text-[#8b949e] hover:text-white text-sm">ยกเลิก</button>
          <button onClick={save} disabled={saving}
            className="px-5 py-2 bg-[#238636] hover:bg-[#2ea043] disabled:opacity-40 text-white text-sm rounded-xl font-medium">
            {saving ? 'กำลังบันทึก...' : 'บันทึก'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Main Page ─────────────────────────────────────────────
export default function PaymentsPage() {
  const supabase = createClient()
  const [jobs, setJobs] = useState<Job[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [planJob, setPlanJob] = useState<Job | null>(null)
  const [recordInstallment, setRecordInstallment] = useState<Installment | null>(null)
  const [fetchError, setFetchError] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    setFetchError('')
    const { data: jobsData, error: e1 } = await supabase
      .from('jobs')
      .select('*, condo_leads:lead_id(customer_name), projects:project_id(name), sales:sales_id(name)')
      .not('working_status', 'eq', 'ยกเลิก')
      .order('created_at', { ascending: false })

    const { data: paymentsData } = await supabase
      .from('payments')
      .select('*')
      .not('job_id', 'is', null)
      .order('installment_no')

    const rawJobs = (jobsData as unknown as RawJob[]) || []
    const rawPays = (paymentsData as unknown as RawPayment[]) || []

    const payMap = new Map<string, RawPayment[]>()
    for (const p of rawPays) {
      if (!p.job_id) continue
      if (!payMap.has(p.job_id)) payMap.set(p.job_id, [])
      payMap.get(p.job_id)!.push(p)
    }

    const mapped: Job[] = rawJobs.map(j => ({
      id: j.id,
      customer_id: j.customer_id,
      lead_id: j.lead_id,
      project_id: j.project_id,
      room_no: j.room_no,
      customer_name: j.customer_name || j.condo_leads?.customer_name || '—',
      customer_type: (j.customer_type as ClientType) || 'B2C',
      revenue_ex_vat: j.revenue_ex_vat,
      working_status: j.working_status,
      order_date: j.order_date,
      sales_id: j.sales_id,
      sales_name: (j.sales as any)?.name || '—',
      project_name: (j.projects as any)?.name || '—',
      payment_plan_type: j.payment_plan_type as PlanType | null,
      work_days: j.work_days,
      contract_date: j.contract_date,
      work_start_date: j.work_start_date,
      installments: (payMap.get(j.id) || []).map(p => ({
        id: p.id,
        installment_no: p.installment_no,
        installment_name: p.installment_name,
        amount: p.amount,
        percentage: p.percentage || 0,
        status: p.status as Installment['status'],
        due_date: p.due_date,
        paid_date: p.paid_date,
        is_work_trigger: p.is_work_trigger || false,
        is_final: p.is_final || false,
        file_urls: p.file_urls || [],
      })),
    }))

    if (e1) { setFetchError(e1.message); setLoading(false); return }
    setJobs(mapped)
    setLoading(false)
  }, [supabase])

  useEffect(() => { load() }, [load])

  async function handlePaymentSaved(jobId: string | null, isWorkTrigger: boolean) {
    if (isWorkTrigger && recordInstallment) {
      // Find which job owns this installment
      const job = jobs.find(j => j.installments.some(i => i.id === recordInstallment.id))
      if (job) {
        await supabase.from('jobs').update({ work_start_date: new Date().toISOString().slice(0, 10) }).eq('id', job.id)
      }
    }
    await load()
  }

  const filtered = jobs.filter(j =>
    !search ||
    j.customer_name.toLowerCase().includes(search.toLowerCase()) ||
    j.room_no.toLowerCase().includes(search.toLowerCase()) ||
    j.project_name.toLowerCase().includes(search.toLowerCase()) ||
    j.id.toLowerCase().includes(search.toLowerCase())
  )

  // Summary KPIs
  const totalRevenue = jobs.reduce((s, j) => s + j.revenue_ex_vat, 0)
  const paidAmount = jobs.reduce((s, j) => s + j.installments.filter(i => i.status === 'paid').reduce((a, i) => a + i.amount, 0), 0)
  const pendingAmount = jobs.reduce((s, j) => s + j.installments.filter(i => i.status !== 'paid').reduce((a, i) => a + i.amount, 0), 0)
  const jobsWithPlan = jobs.filter(j => j.installments.length > 0).length
  const jobsNoPlan = jobs.filter(j => j.installments.length === 0).length

  return (
    <div className="p-4 md:p-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-5">
        <div>
          <h1 className="text-white text-xl font-bold">สถานะการชำระเงิน</h1>
          <p className="text-[#8b949e] text-sm mt-0.5">แผนงวด · บันทึกรับเงิน · ติดตามการชำระ</p>
        </div>
      </div>

      {/* KPI bar */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-5">
        {[
          { label: 'มูลค่างานรวม', value: fmtBaht(totalRevenue), color: 'text-white' },
          { label: 'ชำระแล้ว', value: fmtBaht(paidAmount), color: 'text-green-400' },
          { label: 'ค้างชำระ', value: fmtBaht(pendingAmount), color: 'text-amber-400' },
          { label: 'มีแผนงวดแล้ว', value: jobsWithPlan + ' งาน', color: 'text-blue-400' },
          { label: 'ยังไม่ตั้งแผน', value: jobsNoPlan + ' งาน', color: 'text-red-400' },
        ].map(k => (
          <div key={k.label} className="bg-[#161b22] border border-[#30363d] rounded-xl p-3">
            <p className="text-[#484f58] text-xs mb-1">{k.label}</p>
            <p className={`font-bold text-sm ${k.color}`}>{k.value}</p>
          </div>
        ))}
      </div>

      {/* Search */}
      <div className="relative mb-4">
        <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#484f58]" />
        <input value={search} onChange={e => setSearch(e.target.value)}
          placeholder="ค้นหาชื่อลูกค้า, ห้อง, โครงการ..."
          className="w-full bg-[#161b22] border border-[#30363d] rounded-xl pl-9 pr-4 py-2.5 text-sm text-white placeholder-[#484f58] focus:outline-none focus:border-[#58a6ff]" />
      </div>

      {/* Job list */}
      {loading && <div className="flex justify-center py-16"><div className="w-7 h-7 rounded-full border-2 border-t-transparent animate-spin" style={{ borderColor: 'var(--accent)', borderTopColor: 'transparent' }} role="status" aria-label="กำลังโหลด" /></div>}
      {!loading && fetchError && <PageError message={fetchError} onRetry={load} />}
      <div className="space-y-3">
        {filtered.map(job => {
          const expanded = expandedId === job.id
          const paidCount = job.installments.filter(i => i.status === 'paid').length
          const totalCount = job.installments.length
          const hasPlan = totalCount > 0
          const lastPaid = job.installments.filter(i => i.status === 'paid').pop()
          const nextPending = job.installments.find(i => i.status !== 'paid')

          return (
            <div key={job.id} className="bg-[#161b22] border border-[#30363d] rounded-xl overflow-hidden">
              {/* Job row */}
              <div
                className="flex items-center gap-3 px-4 py-3.5 cursor-pointer hover:bg-[#1c2128] transition-colors"
                onClick={() => setExpandedId(expanded ? null : job.id)}
              >
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap mb-1">
                    <span className="text-[#58a6ff] text-xs font-mono">{job.id}</span>
                    <span className="text-white text-sm font-medium truncate">{job.customer_name}</span>
                    <span className="text-[#484f58] text-xs">{job.room_no}</span>
                    <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded border ${job.customer_type === 'B2B' ? 'bg-blue-500/10 text-blue-400 border-blue-500/20' : 'bg-purple-500/10 text-purple-400 border-purple-500/20'}`}>
                      {job.customer_type}
                    </span>
                  </div>
                  <div className="flex items-center gap-3 text-[#8b949e] text-xs flex-wrap">
                    <span>{job.project_name}</span>
                    <span>· {job.sales_name}</span>
                    {job.work_start_date && <span className="text-amber-400">▶ เริ่มงาน {fmtDate(job.work_start_date)}</span>}
                  </div>
                </div>

                <div className="flex items-center gap-3 flex-shrink-0">
                  {!hasPlan ? (
                    <button
                      onClick={e => { e.stopPropagation(); setPlanJob(job) }}
                      className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg bg-amber-500/15 text-amber-300 hover:bg-amber-500/25 border border-amber-500/20 transition-colors"
                    >
                      <Settings2 size={12} />ตั้งแผนงวด
                    </button>
                  ) : (
                    <div className="text-right">
                      <p className="text-xs text-[#8b949e]">งวด {paidCount}/{totalCount}</p>
                      <div className="flex gap-1 mt-1">
                        {job.installments.map(i => (
                          <div key={i.id} className={`h-1.5 flex-1 rounded-full ${i.status === 'paid' ? 'bg-green-500' : i.status === 'overdue' ? 'bg-red-500' : 'bg-[#30363d]'}`} />
                        ))}
                      </div>
                    </div>
                  )}

                  <div className="text-right">
                    <p className="text-white text-sm font-semibold">{fmtBaht(job.revenue_ex_vat)}</p>
                    {nextPending && <p className="text-amber-400 text-xs">งวดถัดไป {fmtBaht(nextPending.amount)}</p>}
                  </div>

                  {expanded ? <ChevronUp size={16} className="text-[#484f58]" /> : <ChevronDown size={16} className="text-[#484f58]" />}
                </div>
              </div>

              {/* Expanded: installments */}
              {expanded && (
                <div className="border-t border-[#21262d] p-4">
                  {!hasPlan ? (
                    <div className="text-center py-8">
                      <AlertCircle size={28} className="mx-auto text-amber-500/50 mb-3" />
                      <p className="text-[#8b949e] text-sm mb-3">ยังไม่ได้ตั้งแผนการชำระเงิน</p>
                      <button onClick={() => setPlanJob(job)}
                        className="flex items-center gap-2 mx-auto px-4 py-2 bg-amber-500/15 text-amber-300 hover:bg-amber-500/25 border border-amber-500/20 rounded-xl text-sm transition-colors">
                        <Settings2 size={14} />ตั้งแผนงวดการชำระเงิน
                      </button>
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {/* Plan info bar */}
                      <div className="flex items-center gap-3 mb-4 flex-wrap">
                        <span className="text-xs bg-[#21262d] text-[#8b949e] px-2 py-1 rounded-lg">
                          แผน {job.payment_plan_type} · {job.work_days} วัน
                        </span>
                        {job.contract_date && (
                          <span className="text-xs text-[#8b949e]">สัญญา {fmtDate(job.contract_date)}</span>
                        )}
                        {job.work_start_date && (
                          <span className="text-xs text-amber-400">เริ่มงาน {fmtDate(job.work_start_date)}</span>
                        )}
                        {job.work_start_date && job.work_days && (
                          <span className="text-xs text-[#8b949e]">
                            → คาดเสร็จ {fmtDate(new Date(new Date(job.work_start_date).getTime() + job.work_days * 86400000).toISOString().slice(0, 10))}
                          </span>
                        )}
                        <button onClick={e => { e.stopPropagation(); setPlanJob(job) }}
                          className="text-xs text-[#58a6ff] flex items-center gap-1 hover:underline">
                          <Settings2 size={11} />แก้ไขแผน
                        </button>
                      </div>

                      {job.installments.map(inst => (
                        <div key={inst.id} className={`flex items-center gap-3 p-3 rounded-xl border ${inst.status === 'paid' ? 'bg-green-500/5 border-green-500/15' : 'bg-[#0d1117] border-[#21262d]'}`}>
                          <div className="flex-shrink-0">
                            {inst.status === 'paid'
                              ? <CheckCircle2 size={18} className="text-green-400" />
                              : <Circle size={18} className="text-[#30363d]" />
                            }
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="text-sm text-white font-medium">{inst.installment_name}</span>
                              {inst.is_work_trigger && <span className="text-[9px] bg-amber-500/15 text-amber-300 px-1.5 py-0.5 rounded">▶ เริ่มงาน</span>}
                              {inst.is_final && <span className="text-[9px] bg-green-500/15 text-green-400 px-1.5 py-0.5 rounded">⚑ สุดท้าย</span>}
                            </div>
                            <div className="flex items-center gap-3 mt-0.5 text-xs text-[#8b949e]">
                              {inst.paid_date
                                ? <span className="text-green-400">ชำระ {fmtDate(inst.paid_date)}</span>
                                : inst.due_date
                                  ? <span>กำหนด {fmtDate(inst.due_date)}</span>
                                  : null
                              }
                              {inst.file_urls.length > 0 && (
                                <span className="flex items-center gap-1 text-[#58a6ff]">
                                  <Paperclip size={10} />{inst.file_urls.length} ไฟล์
                                </span>
                              )}
                            </div>
                          </div>
                          <div className="text-right flex-shrink-0">
                            <p className="text-white font-semibold">{fmtBaht(inst.amount)}</p>
                            <p className="text-xs text-[#484f58]">{inst.percentage}%</p>
                          </div>
                          {inst.status !== 'paid' && (
                            <button
                              onClick={() => setRecordInstallment(inst)}
                              className="flex-shrink-0 text-xs px-3 py-1.5 rounded-lg bg-[#238636]/20 text-green-400 hover:bg-[#238636]/40 border border-green-600/20 transition-colors"
                            >
                              บันทึก
                            </button>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          )
        })}
      </div>

      {/* Modals */}
      {planJob && (
        <PlanSetupModal job={planJob} open={!!planJob} onClose={() => setPlanJob(null)} onSaved={load} />
      )}
      <RecordPaymentModal
        installment={recordInstallment}
        open={!!recordInstallment}
        onClose={() => setRecordInstallment(null)}
        onSaved={handlePaymentSaved}
      />
    </div>
  )
}
