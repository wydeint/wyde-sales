'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Search, CheckCircle2, ChevronDown, Paperclip, Lock } from 'lucide-react'
import { PageSpinner, PageError } from '@/components/ui/StateUI'
import SearchableSelect from '@/components/ui/SearchableSelect'

// ─── Types ────────────────────────────────────────────────
interface Job {
  id: string
  customer_name: string
  room_no: string
  project_id: string
  projectName: string
  sales_id: string | null
  salesName: string
  order_date: string | null
  working_status: string
  customerStatus: string
  // doc fields
  quotation1_url: string | null
  quotation2_url: string | null
  id_card_url: string | null
  sale_slip_url: string | null
  sale_receipt_url: string | null
  delivery_doc_url: string | null
  satisfaction_url: string | null
  // payments (filled after join)
  payments: Payment[]
}

interface Payment {
  id: string
  installment_no: number
  installment_name: string
  status: string
  slip_url: string | null
  receipt_url: string | null
}

interface DocCategory {
  key: string
  label: string
  color: string
  docs: DocItem[]
}

interface DocItem {
  key: string
  label: string
  urlField?: keyof Job
  fromPayments?: boolean
}

const DOC_SCHEMA: DocCategory[] = [
  {
    key: 'sale', label: 'เอกสารช่วงขาย', color: 'text-blue-400 border-blue-500/30 bg-blue-500/8',
    docs: [
      { key: 'quotation1', label: 'ใบเสนอราคา 1', urlField: 'quotation1_url' },
      { key: 'quotation2', label: 'ใบเสนอราคา 2', urlField: 'quotation2_url' },
      { key: 'id_card', label: 'บัตรประชาชนลูกค้า', urlField: 'id_card_url' },
      { key: 'sale_slip', label: 'สลิปโอนเงิน (ช่วงขาย)', urlField: 'sale_slip_url' },
      { key: 'sale_receipt', label: 'ใบเสร็จรับเงิน (ช่วงขาย)', urlField: 'sale_receipt_url' },
    ]
  },
  {
    key: 'payment', label: 'เอกสารชำระเงินตามงวด', color: 'text-amber-400 border-amber-500/30 bg-amber-500/8',
    docs: [
      { key: 'payment_slip', label: 'สลิปโอนเงิน (ต่องวด)', fromPayments: true },
      { key: 'payment_receipt', label: 'ใบเสร็จรับเงิน (ต่องวด)', fromPayments: true },
    ]
  },
  {
    key: 'delivery', label: 'เอกสารช่วงส่งมอบ', color: 'text-emerald-400 border-emerald-500/30 bg-emerald-500/8',
    docs: [
      { key: 'delivery_doc', label: 'ใบส่งมอบงาน', urlField: 'delivery_doc_url' },
      { key: 'satisfaction', label: 'แบบประเมินความพึงพอใจ', urlField: 'satisfaction_url' },
    ]
  }
]

// ─── Auto-checked logic ────────────────────────────────────
// ส่งมอบแล้ว → เอกสารครบทั้งหมด
// booked/closed → เอกสารช่วงขายครบ
// payment.status === 'paid' → สลิป + ใบเสร็จงวดนั้นครบ

function isAutoCheckedSaleDoc(job: Job): boolean {
  return job.working_status === 'ส่งมอบแล้ว' || ['booked', 'closed'].includes(job.customerStatus)
}

function isAutoCheckedDeliveryDoc(job: Job): boolean {
  return job.working_status === 'ส่งมอบแล้ว'
}

function isAutoCheckedPaymentDoc(payment: Payment): boolean {
  return payment.status === 'paid'
}

function effectiveChecked(job: Job, cat: string, urlVal: string | null): boolean {
  if (cat === 'sale') return isAutoCheckedSaleDoc(job) || !!urlVal
  if (cat === 'delivery') return isAutoCheckedDeliveryDoc(job) || !!urlVal
  return !!urlVal
}

// ─── Doc Checkbox ──────────────────────────────────────────
function DocCheckbox({
  checked,
  auto,
  onClick,
}: {
  checked: boolean
  auto: boolean
  onClick: () => void
}) {
  return (
    <button
      onClick={auto ? undefined : onClick}
      className="relative flex items-center justify-center w-6 h-6 rounded flex-shrink-0 transition-colors group"
      style={{
        border: `2px solid ${checked ? '#34d399' : 'var(--divider)'}`,
        background: checked ? (auto ? 'rgba(52,211,153,0.08)' : 'rgba(52,211,153,0.15)') : 'transparent',
        cursor: auto ? 'default' : 'pointer',
      }}
      title={auto ? 'ติ๊กอัตโนมัติตามสถานะของลูกค้า — ไม่สามารถแก้ไขได้' : undefined}
    >
      {checked && !auto && (
        <CheckCircle2 size={14} style={{ color: '#34d399' }} />
      )}
      {checked && auto && (
        <Lock size={11} style={{ color: 'rgba(52,211,153,0.55)' }} />
      )}
      {/* Tooltip */}
      {auto && (
        <span className="pointer-events-none absolute bottom-full left-1/2 -translate-x-1/2 mb-1.5 whitespace-nowrap rounded-lg px-2 py-1 text-[10px] font-medium opacity-0 group-hover:opacity-100 transition-opacity z-10"
          style={{ background: 'var(--card-bg)', border: '1px solid var(--divider)', color: 'var(--text-2)', boxShadow: '0 4px 12px rgba(0,0,0,0.15)' }}>
          ล็อกอัตโนมัติตามสถานะ
        </span>
      )}
    </button>
  )
}

// ─── Attach Button (placeholder) ──────────────────────────
function AttachButton() {
  return (
    <button
      disabled
      title="แนบไฟล์ (ยังไม่เปิดใช้งาน)"
      className="flex items-center justify-center w-6 h-6 rounded flex-shrink-0"
      style={{ color: 'var(--text-3)', opacity: 0.35, cursor: 'not-allowed' }}
    >
      <Paperclip size={13} />
    </button>
  )
}

// ─── Main Page ─────────────────────────────────────────────
export default function DocumentsPage() {
  const supabase = createClient()
  const [jobs, setJobs] = useState<Job[]>([])
  const [projects, setProjects] = useState<{ id: string; name: string }[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [projectFilter, setProjectFilter] = useState('')
  const [salesFilter, setSalesFilter] = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [expandedJob, setExpandedJob] = useState<string | null>(null)
  const [fetchError, setFetchError] = useState('')
  const [salesList, setSalesList] = useState<{ id: string; name: string }[]>([])

  useEffect(() => { load() }, [])

  async function load() {
    setLoading(true)
    setFetchError('')
    const [{ data: jobsData, error: e1 }, { data: paymentsData }, { data: projData }, { data: salesData }] = await Promise.all([
      supabase.from('jobs').select(`
        id, customer_name, room_no, project_id, sales_id, order_date, working_status,
        quotation1_url, quotation2_url, id_card_url, sale_slip_url, sale_receipt_url,
        delivery_doc_url, satisfaction_url,
        projects:project_id(id, name),
        sales:users!jobs_sales_id_fkey(id, name),
        customers(status)
      `).not('working_status', 'eq', 'ยกเลิก').order('customer_name'),
      supabase.from('payments').select('job_id, id, installment_no, installment_name, status, slip_url, receipt_url').order('installment_no'),
      supabase.from('projects').select('id, name').order('name'),
      supabase.from('users').select('id, name').eq('role', 'sales').order('name'),
    ])

    if (e1) { setFetchError(e1.message); setLoading(false); return }
    const payMap = new Map<string, Payment[]>()
    for (const p of (paymentsData || []) as any[]) {
      if (!payMap.has(p.job_id)) payMap.set(p.job_id, [])
      payMap.get(p.job_id)!.push({ id: p.id, installment_no: p.installment_no, installment_name: p.installment_name, status: p.status, slip_url: p.slip_url, receipt_url: p.receipt_url })
    }

    setJobs((jobsData || []).map((j: any) => ({
      ...j,
      projectName: j.projects?.name || '—',
      salesName: j.sales?.name || '—',
      customerStatus: j.customers?.status || '',
      payments: payMap.get(j.id) || [],
    })))
    setProjects(projData || [])
    setSalesList(salesData || [])
    setLoading(false)
  }

  async function toggleDoc(jobId: string, field: string, currentValue: string | null) {
    const newValue = currentValue ? null : 'checked'
    if (field.startsWith('payment:')) {
      const [, payId, col] = field.split(':')
      await supabase.from('payments').update({ [col]: newValue }).eq('id', payId)
    } else {
      await supabase.from('jobs').update({ [field]: newValue }).eq('id', jobId)
    }
    await load()
  }

  const STATUS_OPTIONS = [
    { value: '', label: 'ทุกสถานะ' },
    { value: 'รับงาน', label: 'รับงาน' },
    { value: 'กำลังดำเนินการ', label: 'กำลังดำเนินการ' },
    { value: 'รอส่งมอบ', label: 'รอส่งมอบ' },
    { value: 'ส่งมอบแล้ว', label: 'ส่งมอบแล้ว' },
  ]

  const filtered = jobs.filter(j => {
    const q = search.toLowerCase()
    const matchSearch = !q || j.customer_name?.toLowerCase().includes(q) || j.room_no?.toLowerCase().includes(q)
    const matchProject = !projectFilter || j.project_id === projectFilter
    const matchSales = !salesFilter || j.sales_id === salesFilter
    const matchStatus = !statusFilter || j.working_status === statusFilter
    return matchSearch && matchProject && matchSales && matchStatus
  })

  function getDocComplete(job: Job): { done: number; total: number } {
    let done = 0, total = 0
    const saleFields: (keyof Job)[] = ['quotation1_url', 'quotation2_url', 'id_card_url', 'sale_slip_url', 'sale_receipt_url']
    for (const f of saleFields) {
      total++
      if (effectiveChecked(job, 'sale', job[f] as string | null)) done++
    }
    for (const p of job.payments) {
      total += 2
      if (isAutoCheckedPaymentDoc(p) || !!p.slip_url) done++
      if (isAutoCheckedPaymentDoc(p) || !!p.receipt_url) done++
    }
    total += 2
    if (effectiveChecked(job, 'delivery', job.delivery_doc_url)) done++
    if (effectiveChecked(job, 'delivery', job.satisfaction_url)) done++
    return { done, total }
  }

  return (
    <div className="p-6 max-w-5xl mx-auto">
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-2xl font-bold mb-1" style={{ color: 'var(--text-1)' }}>เอกสารลูกค้า</h1>
        <p className="text-sm" style={{ color: 'var(--text-3)' }}>
          ตรวจสอบและจัดการเอกสารทุกห้องลูกค้า ·
          <span className="ml-1" style={{ color: 'rgba(52,211,153,0.5)' }}>✓ จาง</span> = ติ๊กอัตโนมัติจากสถานะ ·
          <span className="ml-1"><Paperclip size={11} className="inline" style={{ opacity: 0.35 }} /></span> = แนบไฟล์ (เร็วๆ นี้)
        </p>
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3 mb-5 flex-wrap">
        <div className="relative flex-1 min-w-48">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: 'var(--text-3)' }} />
          <input value={search} onChange={e => setSearch(e.target.value)}
            placeholder="ค้นหาชื่อลูกค้า / เลขห้อง..."
            className="w-full pl-9 pr-4 py-2.5 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/40"
            style={{ background: 'var(--card-bg)', border: '1px solid var(--card-border)', color: 'var(--text-1)' }} />
        </div>
        <SearchableSelect
          value={projectFilter}
          onChange={v => setProjectFilter(v)}
          options={[{ value: '', label: 'ทุกโครงการ' }, ...[...projects].sort((a, b) => a.name.localeCompare(b.name)).map(p => ({ value: p.id, label: p.name }))]}
          placeholder="ทุกโครงการ"
        />
        <SearchableSelect
          value={salesFilter}
          onChange={v => setSalesFilter(v)}
          options={[{ value: '', label: 'ทุกเซลล์' }, ...salesList.map(s => ({ value: s.id, label: s.name }))]}
          placeholder="ทุกเซลล์"
        />
        <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)}
          className="rounded-xl px-3 py-2.5 text-sm focus:outline-none"
          style={{ background: 'var(--card-bg)', border: '1px solid var(--card-border)', color: 'var(--text-1)' }}>
          {STATUS_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
      </div>

      {loading && <div className="flex justify-center py-16"><PageSpinner /></div>}
      {!loading && fetchError && <PageError message={fetchError} onRetry={load} />}

      {/* Stats */}
      {!loading && !fetchError && (
        <div className="grid grid-cols-3 gap-3 mb-5">
          {[
            { label: 'ทั้งหมด', value: filtered.length },
            { label: 'ครบถ้วน', value: filtered.filter(j => { const { done, total } = getDocComplete(j); return done === total }).length, color: 'text-emerald-400' },
            { label: 'ยังไม่ครบ', value: filtered.filter(j => { const { done, total } = getDocComplete(j); return done < total }).length, color: 'text-amber-400' },
          ].map(s => (
            <div key={s.label} className="rounded-2xl p-4 border text-center" style={{ background: 'var(--card-bg)', borderColor: 'var(--card-border)' }}>
              <p className="text-xs mb-1" style={{ color: 'var(--text-3)' }}>{s.label}</p>
              <p className={`text-2xl font-bold ${s.color || ''}`} style={!s.color ? { color: 'var(--text-1)' } : undefined}>{s.value}</p>
            </div>
          ))}
        </div>
      )}

      {/* Job list */}
      {loading ? (
        <div className="space-y-3">
          {[1, 2, 3].map(i => <div key={i} className="h-20 rounded-2xl animate-pulse" style={{ background: 'var(--card-bg)' }} />)}
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-16" style={{ color: 'var(--text-3)' }}>ไม่พบข้อมูล</div>
      ) : (
        <div className="space-y-3">
          {filtered.map(job => {
            const { done, total } = getDocComplete(job)
            const pct = total > 0 ? Math.round((done / total) * 100) : 0
            const isExpanded = expandedJob === job.id
            const allDone = done === total

            return (
              <div key={job.id} className="rounded-2xl border overflow-hidden" style={{ background: 'var(--card-bg)', borderColor: 'var(--card-border)' }}>
                {/* Row header */}
                <button
                  onClick={() => setExpandedJob(isExpanded ? null : job.id)}
                  className="w-full flex items-center gap-4 px-5 py-4 text-left hover:bg-black/5 transition-colors"
                >
                  <div className="relative flex-shrink-0 w-10 h-10">
                    <svg className="w-10 h-10 -rotate-90" viewBox="0 0 36 36">
                      <circle cx="18" cy="18" r="15" fill="none" stroke="currentColor" strokeWidth="3" style={{ color: 'var(--divider)' }} />
                      <circle cx="18" cy="18" r="15" fill="none" stroke="currentColor" strokeWidth="3"
                        strokeDasharray={`${pct * 0.942} 100`}
                        className={allDone ? 'text-emerald-400' : 'text-amber-400'} />
                    </svg>
                    <span className="absolute inset-0 flex items-center justify-center text-[9px] font-bold" style={{ color: 'var(--text-1)' }}>{pct}%</span>
                  </div>

                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-sm truncate" style={{ color: 'var(--text-1)' }}>{job.customer_name}</p>
                    <p className="text-xs truncate" style={{ color: 'var(--text-3)' }}>{job.room_no} · {job.projectName} · {job.salesName}</p>
                  </div>

                  <div className="flex items-center gap-3 flex-shrink-0">
                    {job.working_status === 'ส่งมอบแล้ว' && (
                      <span className="text-[10px] px-1.5 py-0.5 rounded-full" style={{ background: 'rgba(52,211,153,0.1)', color: '#34d399' }}>โอนแล้ว</span>
                    )}
                    <span className={`text-xs font-semibold ${allDone ? 'text-emerald-400' : 'text-amber-400'}`}>
                      {done}/{total}
                    </span>
                    <ChevronDown size={16} style={{ color: 'var(--text-3)', transform: isExpanded ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s' }} />
                  </div>
                </button>

                {/* Expanded detail */}
                {isExpanded && (
                  <div className="border-t px-5 pb-5 pt-4 space-y-5" style={{ borderColor: 'var(--card-border)' }}>
                    {DOC_SCHEMA.map(cat => (
                      <div key={cat.key}>
                        <p className={`text-[10px] font-bold uppercase tracking-wider mb-3 ${cat.color.split(' ')[0]}`}>{cat.label}</p>
                        <div className={`rounded-2xl border p-4 space-y-3 ${cat.color.split(' ').slice(1).join(' ')}`}>
                          {cat.key !== 'payment' ? (
                            cat.docs.map(doc => {
                              const urlKey = doc.urlField as keyof Job
                              const rawVal = job[urlKey] as string | null
                              const auto = cat.key === 'sale'
                                ? isAutoCheckedSaleDoc(job)
                                : isAutoCheckedDeliveryDoc(job)
                              const checked = auto || !!rawVal
                              return (
                                <div key={doc.key} className="flex items-center gap-3">
                                  <DocCheckbox checked={checked} auto={auto && !rawVal} onClick={() => toggleDoc(job.id, doc.urlField as string, rawVal)} />
                                  <span className="text-sm flex-1" style={{ color: checked ? 'var(--text-1)' : 'var(--text-2)' }}>{doc.label}</span>
                                  <AttachButton />
                                </div>
                              )
                            })
                          ) : (
                            job.payments.length === 0 ? (
                              <p className="text-xs" style={{ color: 'var(--text-3)' }}>ยังไม่มีงวดชำระ</p>
                            ) : (
                              job.payments.map(pay => {
                                const autoPayment = isAutoCheckedPaymentDoc(pay)
                                return (
                                  <div key={pay.id} className="space-y-2">
                                    <p className="text-xs font-medium" style={{ color: 'var(--text-2)' }}>
                                      งวด {pay.installment_no}: {pay.installment_name}
                                      <span className={`ml-2 text-[10px] ${pay.status === 'paid' ? 'text-emerald-400' : ''}`}
                                        style={pay.status !== 'paid' ? { color: 'var(--text-3)' } : undefined}>
                                        ({pay.status === 'paid' ? 'ชำระแล้ว' : 'รอชำระ'})
                                      </span>
                                    </p>
                                    <div className="pl-3 space-y-2">
                                      {[
                                        { label: 'สลิปโอนเงิน', col: 'slip_url', url: pay.slip_url },
                                        { label: 'ใบเสร็จรับเงิน', col: 'receipt_url', url: pay.receipt_url },
                                      ].map(d => {
                                        const checked = autoPayment || !!d.url
                                        return (
                                          <div key={d.col} className="flex items-center gap-3">
                                            <DocCheckbox checked={checked} auto={autoPayment && !d.url} onClick={() => toggleDoc(job.id, `payment:${pay.id}:${d.col}`, d.url)} />
                                            <span className="text-xs flex-1" style={{ color: checked ? 'var(--text-1)' : 'var(--text-3)' }}>{d.label}</span>
                                            <AttachButton />
                                          </div>
                                        )
                                      })}
                                    </div>
                                  </div>
                                )
                              })
                            )
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
