'use client'

import { useEffect, useState, useRef } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Search, CheckCircle2, Circle, ExternalLink, Plus, X, ChevronDown } from 'lucide-react'
import { PageSpinner, PageError } from '@/components/ui/StateUI'

// ─── Types ────────────────────────────────────────────────
interface Job {
  id: string
  customer_name: string
  room_no: string
  project_id: string
  projectName: string
  order_date: string | null
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

// Document checklist categories
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

// ─── Url Input Modal ───────────────────────────────────────
function UrlModal({ open, label, initialUrl, onSave, onClose }: {
  open: boolean; label: string; initialUrl: string; onSave: (url: string) => void; onClose: () => void
}) {
  const [url, setUrl] = useState(initialUrl)
  useEffect(() => { setUrl(initialUrl) }, [initialUrl, open])
  if (!open) return null
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
      <div className="relative rounded-2xl p-5 w-full max-w-md" style={{ background: 'var(--card-bg)', border: '1px solid var(--card-border)' }} onClick={e => e.stopPropagation()}>
        <div className="flex justify-between items-center mb-4">
          <h3 className="font-semibold text-sm" style={{ color: 'var(--text-1)' }}>{label}</h3>
          <button onClick={onClose} style={{ color: 'var(--text-3)' }}><X size={16} /></button>
        </div>
        <input value={url} onChange={e => setUrl(e.target.value)}
          placeholder="https://drive.google.com/..."
          className="w-full rounded-xl px-4 py-3 text-sm focus:outline-none mb-4"
          style={{ background: 'var(--input-bg)', border: '1px solid var(--divider)', color: 'var(--text-1)' }} />
        <div className="flex gap-2">
          <button onClick={onClose} className="flex-1 py-3 rounded-xl text-sm" style={{ background: 'var(--hover-bg)', color: 'var(--text-2)' }}>ยกเลิก</button>
          <button onClick={() => { onSave(url); onClose() }} className="flex-1 py-3 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-sm font-semibold">บันทึก</button>
        </div>
      </div>
    </div>
  )
}

// ─── Doc Status Badge ──────────────────────────────────────
function DocBadge({ hasUrl, url, onClick }: { hasUrl: boolean; url?: string | null; onClick: () => void }) {
  return (
    <div className="flex items-center gap-2">
      <button onClick={onClick} className="flex items-center gap-1.5 group">
        {hasUrl ? (
          <CheckCircle2 size={16} className="text-emerald-400 flex-shrink-0" />
        ) : (
          <Circle size={16} className="flex-shrink-0" style={{ color: 'var(--text-3)' }} />
        )}
      </button>
      {hasUrl && url && (
        <a href={url} target="_blank" rel="noopener noreferrer"
          className="text-blue-600 dark:text-[#58a6ff] hover:text-blue-800 dark:hover:text-blue-300 p-0.5" onClick={e => e.stopPropagation()}>
          <ExternalLink size={12} />
        </a>
      )}
    </div>
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
  const [expandedJob, setExpandedJob] = useState<string | null>(null)
  const [urlModal, setUrlModal] = useState<{ jobId: string; field: string; label: string; current: string } | null>(null)
  const [fetchError, setFetchError] = useState('')

  useEffect(() => { load() }, [])

  async function load() {
    setLoading(true)
    setFetchError('')
    const [{ data: jobsData, error: e1 }, { data: paymentsData }, { data: projData }] = await Promise.all([
      supabase.from('jobs').select(`
        id, customer_name, room_no, project_id, order_date,
        quotation1_url, quotation2_url, id_card_url, sale_slip_url, sale_receipt_url,
        delivery_doc_url, satisfaction_url,
        projects:project_id(id, name)
      `).not('working_status', 'eq', 'ยกเลิก').order('customer_name'),
      supabase.from('payments').select('job_id, id, installment_no, installment_name, status, slip_url, receipt_url').order('installment_no'),
      supabase.from('projects').select('id, name').order('name'),
    ])

    if (e1) { setFetchError(e1.message); setLoading(false); return }
    const payMap = new Map<string, Payment[]>()
    for (const p of (paymentsData || []) as any[]) {
      if (!payMap.has(p.job_id)) payMap.set(p.job_id, [])
      payMap.get(p.job_id)!.push({ id: p.id, installment_no: p.installment_no, installment_name: p.installment_name, status: p.status, slip_url: p.slip_url, receipt_url: p.receipt_url })
    }

    setJobs((jobsData || []).map((j: any) => ({
      ...j,
      projectName: (j.projects as any)?.name || '—',
      payments: payMap.get(j.id) || [],
    })))
    setProjects(projData || [])
    setLoading(false)
  }

  async function saveUrl(jobId: string, field: string, url: string) {
    if (field.startsWith('payment:')) {
      // payment slip/receipt: field = "payment:paymentId:slip_url" or "payment:paymentId:receipt_url"
      const [, payId, col] = field.split(':')
      await supabase.from('payments').update({ [col]: url || null }).eq('id', payId)
    } else {
      await supabase.from('jobs').update({ [field]: url || null }).eq('id', jobId)
    }
    await load()
  }

  const filtered = jobs.filter(j => {
    const q = search.toLowerCase()
    const matchSearch = !q || j.customer_name?.toLowerCase().includes(q) || j.room_no?.toLowerCase().includes(q)
    const matchProject = !projectFilter || j.project_id === projectFilter
    return matchSearch && matchProject
  })

  function getDocComplete(job: Job): { done: number; total: number } {
    let done = 0, total = 0
    // sale docs
    const saleFields: (keyof Job)[] = ['quotation1_url', 'quotation2_url', 'id_card_url', 'sale_slip_url', 'sale_receipt_url']
    for (const f of saleFields) { total++; if (job[f]) done++ }
    // payment docs
    for (const p of job.payments) {
      total += 2
      if (p.slip_url) done++
      if (p.receipt_url) done++
    }
    // delivery docs
    total += 2
    if (job.delivery_doc_url) done++
    if (job.satisfaction_url) done++
    return { done, total }
  }

  function openUrlModal(jobId: string, field: string, label: string, current: string | null) {
    setUrlModal({ jobId, field, label, current: current || '' })
  }

  return (
    <div className="p-6 max-w-5xl mx-auto">
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-2xl font-bold mb-1" style={{ color: 'var(--text-1)' }}>เอกสารลูกค้า</h1>
        <p className="text-sm" style={{ color: 'var(--text-3)' }}>ตรวจสอบและจัดการเอกสารทุกห้องลูกค้า</p>
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3 mb-5">
        <div className="relative flex-1">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: 'var(--text-3)' }} />
          <input value={search} onChange={e => setSearch(e.target.value)}
            placeholder="ค้นหาชื่อลูกค้า / เลขห้อง..."
            className="w-full pl-9 pr-4 py-2.5 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/40"
            style={{ background: 'var(--card-bg)', border: '1px solid var(--card-border)', color: 'var(--text-1)' }} />
        </div>
        <select value={projectFilter} onChange={e => setProjectFilter(e.target.value)}
          className="px-3 py-2.5 rounded-xl text-sm focus:outline-none min-w-[180px]"
          style={{ background: 'var(--card-bg)', border: '1px solid var(--card-border)', color: 'var(--text-1)' }}>
          <option value="">ทุกโครงการ</option>
          {[...projects].sort((a, b) => a.name.localeCompare(b.name)).map(p => (
            <option key={p.id} value={p.id}>{p.name}</option>
          ))}
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
                  {/* Progress circle */}
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
                    <p className="text-xs truncate" style={{ color: 'var(--text-3)' }}>{job.room_no} · {job.projectName}</p>
                  </div>

                  <div className="flex items-center gap-3 flex-shrink-0">
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
                              const currentUrl = job[urlKey] as string | null
                              return (
                                <div key={doc.key} className="flex items-center justify-between gap-3">
                                  <span className="text-sm flex-1" style={{ color: 'var(--text-2)' }}>{doc.label}</span>
                                  <DocBadge
                                    hasUrl={!!currentUrl}
                                    url={currentUrl}
                                    onClick={() => openUrlModal(job.id, doc.urlField as string, doc.label, currentUrl)}
                                  />
                                  <button
                                    onClick={() => openUrlModal(job.id, doc.urlField as string, doc.label, currentUrl)}
                                    className="text-xs px-2 py-1 rounded-lg flex items-center gap-1"
                                    style={{ color: 'var(--text-3)', background: 'var(--card-bg)', border: '1px solid var(--card-border)' }}
                                  >
                                    <Plus size={10} />{currentUrl ? 'แก้ไข' : 'เพิ่ม'}
                                  </button>
                                </div>
                              )
                            })
                          ) : (
                            // Payment installments
                            job.payments.length === 0 ? (
                              <p className="text-xs" style={{ color: 'var(--text-3)' }}>ยังไม่มีงวดชำระ</p>
                            ) : (
                              job.payments.map(pay => (
                                <div key={pay.id} className="space-y-2">
                                  <p className="text-xs font-medium" style={{ color: 'var(--text-2)' }}>
                                    งวด {pay.installment_no}: {pay.installment_name}
                                    <span className={`ml-2 text-[10px] ${pay.status === 'paid' ? 'text-emerald-400' : ''}`} style={pay.status !== 'paid' ? { color: 'var(--text-3)' } : undefined}>
                                      ({pay.status === 'paid' ? 'ชำระแล้ว' : 'รอชำระ'})
                                    </span>
                                  </p>
                                  <div className="pl-3 space-y-2">
                                    {[
                                      { label: 'สลิปโอนเงิน', col: 'slip_url', url: pay.slip_url },
                                      { label: 'ใบเสร็จรับเงิน', col: 'receipt_url', url: pay.receipt_url },
                                    ].map(d => (
                                      <div key={d.col} className="flex items-center justify-between gap-3">
                                        <span className="text-xs flex-1" style={{ color: 'var(--text-3)' }}>{d.label}</span>
                                        <DocBadge
                                          hasUrl={!!d.url}
                                          url={d.url}
                                          onClick={() => openUrlModal(job.id, `payment:${pay.id}:${d.col}`, `${d.label} (งวด ${pay.installment_no})`, d.url)}
                                        />
                                        <button
                                          onClick={() => openUrlModal(job.id, `payment:${pay.id}:${d.col}`, `${d.label} (งวด ${pay.installment_no})`, d.url)}
                                          className="text-xs px-2 py-1 rounded-lg flex items-center gap-1"
                                          style={{ color: 'var(--text-3)', background: 'var(--card-bg)', border: '1px solid var(--card-border)' }}
                                        >
                                          <Plus size={10} />{d.url ? 'แก้ไข' : 'เพิ่ม'}
                                        </button>
                                      </div>
                                    ))}
                                  </div>
                                </div>
                              ))
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

      {/* URL Modal */}
      {urlModal && (
        <UrlModal
          open
          label={urlModal.label}
          initialUrl={urlModal.current}
          onSave={(url) => saveUrl(urlModal.jobId, urlModal.field, url)}
          onClose={() => setUrlModal(null)}
        />
      )}
    </div>
  )
}
