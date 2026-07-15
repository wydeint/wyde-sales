'use client'

import { useEffect, useState, useCallback, useMemo } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Search, ExternalLink, FileText, X } from 'lucide-react'
import { PageSpinner } from '@/components/ui/StateUI'

// ─── Types ─────────────────────────────────────────────────
interface Installment {
  id: string
  installment_no: number
  installment_name: string
  amount: number
  status: 'pending' | 'paid' | 'overdue'
  slip_url: string | null
  receipt_url: string | null
}

interface JobRow {
  id: string
  room_no: string
  project_id: string
  project_name: string
  customer_name: string
  sales_id: string | null
  sales_name: string
  revenue_inc_vat: number
  quotation1_url: string | null
  quotation2_url: string | null
  id_card_url: string | null
  delivery_doc_url: string | null
  satisfaction_url: string | null
  sale_receipt_url: string | null
  sale_slip_url: string | null
  working_status: string
  customer_status: string
  installments: Installment[]
  paid_total: number
  unpaid_total: number
}

interface Project { id: string; name: string }
interface User { id: string; name: string }

// ─── Helpers ───────────────────────────────────────────────
const f = (n: number) => n ? '฿' + n.toLocaleString('th-TH') : '฿0'

// ─── Auto-check rules ──────────────────────────────────────
// ส่งมอบแล้ว → เอกสารทุกอย่างครบ
// จอง / ดำเนินการ (customerStatus) → เอกสารส่วนลูกค้าครบ
function autoCheckedSale(job: JobRow) {
  return job.working_status === 'ส่งมอบแล้ว' || job.customer_status === 'จอง' || job.customer_status === 'ดำเนินการ'
}
function autoCheckedDelivery(job: JobRow) {
  return job.working_status === 'ส่งมอบแล้ว'
}

function DocIcon({ url, label, short, auto }: { url: string | null; label: string; short: string; auto?: boolean }) {
  const has = !!url || !!auto
  const isAuto = !url && !!auto
  return (
    <a href={url || undefined} target="_blank" rel="noopener noreferrer"
      onClick={e => { if (!url) e.preventDefault() }} title={isAuto ? `${label} (ติ๊กอัตโนมัติตามสถานะ)` : label}
      className="flex flex-col items-center gap-0.5 transition-opacity"
      style={{ opacity: has ? 1 : 0.25, cursor: url ? 'pointer' : 'default', textDecoration: 'none' }}>
      <div className="w-7 h-7 rounded flex items-center justify-center"
        style={{
          background: has ? (isAuto ? 'rgba(52,211,153,0.12)' : 'rgba(99,102,241,0.15)') : 'var(--hover-bg)',
          color: has ? (isAuto ? '#34d399' : 'var(--accent)') : 'var(--text-3)',
          border: `1px solid ${has ? (isAuto ? 'rgba(52,211,153,0.3)' : 'rgba(99,102,241,0.3)') : 'var(--divider)'}`,
        }}>
        {has ? <FileText size={12} /> : <span className="text-[9px] font-bold">{short}</span>}
      </div>
      <span className="text-[9px]" style={{ color: has ? (isAuto ? '#34d399' : 'var(--accent)') : 'var(--text-3)' }}>{short}</span>
    </a>
  )
}

function InstallmentBadge({ inst }: { inst: Installment }) {
  const color = inst.status === 'paid'
    ? { bg: 'rgba(34,197,94,0.12)', border: 'rgba(34,197,94,0.4)', text: '#4ade80' }
    : inst.status === 'overdue'
    ? { bg: 'rgba(239,68,68,0.12)', border: 'rgba(239,68,68,0.4)', text: '#f87171' }
    : { bg: 'var(--hover-bg)', border: 'var(--divider)', text: 'var(--text-3)' }

  return (
    <div className="flex flex-col items-center gap-0.5">
      <div className="relative group">
        <div className="w-7 h-7 rounded flex items-center justify-center text-[10px] font-bold cursor-default"
          style={{ background: color.bg, border: `1px solid ${color.border}`, color: color.text }}>
          {inst.installment_no}
        </div>
        <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-1.5 z-50 hidden group-hover:block pointer-events-none">
          <div className="bg-gray-900 text-white text-[10px] rounded-[6px] px-2 py-1.5 whitespace-nowrap shadow-lg">
            <p className="font-semibold">{inst.installment_name}</p>
            <p>{f(inst.amount)}</p>
            {(inst.slip_url || inst.receipt_url) && (
              <p className="text-green-300 mt-0.5">{[inst.slip_url && 'slip', inst.receipt_url && 'ใบเสร็จ'].filter(Boolean).join(', ')} แนบแล้ว</p>
            )}
          </div>
        </div>
      </div>
      <div className="flex gap-0.5">
        <span style={{ width: 4, height: 4, borderRadius: '50%', background: inst.slip_url ? '#60a5fa' : 'var(--divider)', display: 'block' }} />
        <span style={{ width: 4, height: 4, borderRadius: '50%', background: inst.receipt_url ? '#4ade80' : 'var(--divider)', display: 'block' }} />
      </div>
    </div>
  )
}

// ─── Row detail drawer ──────────────────────────────────────
function RowDrawer({ job, onClose }: { job: JobRow; onClose: () => void }) {
  const paidCount = job.installments.filter(i => i.status === 'paid').length
  const total = job.installments.length

  return (
    <>
      <div className="fixed inset-0 z-40 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center pointer-events-none px-4 pb-4 pt-14 lg:pt-4">
      <div className="w-full max-w-[460px] max-h-[90vh] flex flex-col rounded-[20px] shadow-2xl pointer-events-auto"
        data-panel style={{ background: 'var(--panel-bg)', border: '1px solid var(--card-border)' }}>
        <div className="flex items-start gap-3 p-5" style={{ borderBottom: '1px solid var(--divider)' }}>
          <div className="flex-1">
            <p className="text-[10px] uppercase tracking-widest mb-0.5" style={{ color: 'var(--text-3)' }}>{job.project_name}</p>
            <p className="font-bold text-lg" style={{ color: 'var(--text-1)' }}>ห้อง {job.room_no}</p>
            <p className="text-sm" style={{ color: 'var(--text-2)' }}>{job.customer_name}</p>
          </div>
          <button onClick={onClose} className="p-2 rounded-[8px]" style={{ background: 'var(--hover-bg)', color: 'var(--text-2)' }}>
            <X size={14} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-5 space-y-5">
          {/* Summary */}
          <div className="grid grid-cols-2 gap-3">
            <div className="p-3 rounded-[10px]" style={{ background: 'rgba(34,197,94,0.08)', border: '1px solid rgba(34,197,94,0.3)' }}>
              <p className="text-[10px] font-semibold" style={{ color: 'var(--accent-green)' }}>รับแล้ว</p>
              <p className="font-bold text-base" style={{ color: 'var(--accent-green)' }}>{f(job.paid_total)}</p>
            </div>
            <div className="p-3 rounded-[10px]" style={{ background: 'color-mix(in srgb, var(--accent-red) 8%, transparent)', border: '1px solid color-mix(in srgb, var(--accent-red) 30%, transparent)' }}>
              <p className="text-[10px] font-semibold" style={{ color: 'var(--accent-red)' }}>คงเหลือ</p>
              <p className="font-bold text-base" style={{ color: 'var(--accent-red)' }}>{f(job.unpaid_total)}</p>
            </div>
          </div>

          {/* Installments */}
          <div>
            <p className="text-[10px] uppercase tracking-widest mb-2 font-semibold" style={{ color: 'var(--text-3)' }}>
              งวดชำระ ({paidCount}/{total})
            </p>
            <div className="space-y-2">
              {job.installments.map(inst => {
                const txtColor = inst.status === 'paid' ? 'var(--accent-green)' : inst.status === 'overdue' ? 'var(--accent-red)' : 'var(--text-3)'
                return (
                  <div key={inst.id} className="flex items-center gap-3 p-3 rounded-[10px]"
                    style={{ background: 'var(--hover-bg)', border: '1px solid var(--divider)' }}>
                    <div className="w-6 h-6 rounded-[6px] flex items-center justify-center text-[10px] font-bold flex-shrink-0"
                      style={{ background: inst.status === 'paid' ? 'color-mix(in srgb, var(--accent-green) 20%, transparent)' : inst.status === 'overdue' ? 'color-mix(in srgb, var(--accent-red) 20%, transparent)' : 'var(--card-bg)', color: txtColor }}>
                      {inst.installment_no}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs truncate" style={{ color: 'var(--text-1)' }}>{inst.installment_name}</p>
                      <p className="text-[10px]" style={{ color: 'var(--text-2)' }}>{f(inst.amount)}</p>
                    </div>
                    <div className="flex gap-1.5">
                      {inst.slip_url && (
                        <a href={inst.slip_url} target="_blank" rel="noopener noreferrer"
                          className="text-[10px] px-2 py-1 rounded flex items-center gap-1"
                          style={{ background: 'rgba(96,165,250,0.1)', color: '#60a5fa', border: '1px solid rgba(96,165,250,0.3)' }}>
                          <ExternalLink size={9} /> Slip
                        </a>
                      )}
                      {inst.receipt_url && (
                        <a href={inst.receipt_url} target="_blank" rel="noopener noreferrer"
                          className="text-[10px] px-2 py-1 rounded flex items-center gap-1"
                          style={{ background: 'rgba(34,197,94,0.1)', color: '#4ade80', border: '1px solid rgba(34,197,94,0.3)' }}>
                          <ExternalLink size={9} /> ใบเสร็จ
                        </a>
                      )}
                      {!inst.slip_url && !inst.receipt_url && (
                        <span className="text-[10px]" style={{ color: 'var(--text-3)' }}>ไม่มีไฟล์</span>
                      )}
                    </div>
                  </div>
                )
              })}
              {total === 0 && <p className="text-xs text-center py-4" style={{ color: 'var(--text-3)' }}>ยังไม่มีแผนงวดชำระ</p>}
            </div>
          </div>

          {/* Docs */}
          <div>
            <p className="text-[10px] uppercase tracking-widest mb-3 font-semibold" style={{ color: 'var(--text-3)' }}>เอกสาร</p>
            <div className="space-y-2">
              {[
                { url: job.quotation1_url, label: 'ใบเสนอราคา 1', short: 'Q1', auto: autoCheckedSale(job) },
                { url: job.quotation2_url, label: 'ใบเสนอราคา 2', short: 'Q2', auto: autoCheckedSale(job) },
                { url: job.id_card_url, label: 'บัตรประชาชนลูกค้า', short: 'ID', auto: autoCheckedSale(job) },
                { url: job.sale_slip_url, label: 'สลิปการขาย', short: 'SLP', auto: autoCheckedSale(job) },
                { url: job.sale_receipt_url, label: 'ใบเสร็จการขาย', short: 'RCP', auto: autoCheckedSale(job) },
                { url: job.delivery_doc_url, label: 'ใบส่งมอบ', short: 'HO', auto: autoCheckedDelivery(job) },
                { url: job.satisfaction_url, label: 'แบบประเมินความพึงพอใจ', short: 'SAT', auto: autoCheckedDelivery(job) },
              ].map(d => {
                const checked = !!d.url || d.auto
                const isAuto = !d.url && d.auto
                return (
                  <div key={d.short} className="flex items-center gap-2.5 p-2.5 rounded-[8px]"
                    style={{
                      background: checked ? (isAuto ? 'rgba(52,211,153,0.06)' : 'rgba(99,102,241,0.06)') : 'var(--hover-bg)',
                      border: `1px solid ${checked ? (isAuto ? 'rgba(52,211,153,0.2)' : 'rgba(99,102,241,0.2)') : 'var(--divider)'}`,
                    }}>
                    <span className="text-[10px] font-bold px-1.5 py-0.5 rounded w-9 text-center flex-shrink-0"
                      style={{
                        background: checked ? (isAuto ? 'rgba(52,211,153,0.15)' : 'rgba(99,102,241,0.15)') : 'var(--card-bg)',
                        color: checked ? (isAuto ? '#34d399' : 'var(--accent)') : 'var(--text-3)',
                      }}>
                      {d.short}
                    </span>
                    <span className="text-xs flex-1 truncate" style={{ color: checked ? 'var(--text-1)' : 'var(--text-3)' }}>{d.label}</span>
                    {d.url
                      ? <a href={d.url} target="_blank" rel="noopener noreferrer"><ExternalLink size={12} style={{ color: 'var(--accent)' }} /></a>
                      : isAuto
                        ? <span className="text-[10px]" style={{ color: '#34d399' }}>อัตโนมัติ</span>
                        : <span className="text-[10px]" style={{ color: 'var(--text-3)' }}>—</span>
                    }
                  </div>
                )
              })}
            </div>
          </div>
        </div>
      </div>
      </div>
    </>
  )
}

// ─── Main ───────────────────────────────────────────────────
export default function PaymentsPage() {
  const supabase = createClient()
  const [rows, setRows] = useState<JobRow[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [filterProject, setFilterProject] = useState('')
  const [filterSales, setFilterSales] = useState('')
  const [projects, setProjects] = useState<Project[]>([])
  const [users, setUsers] = useState<User[]>([])
  const [selected, setSelected] = useState<JobRow | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    const [{ data: jobsRaw }, { data: pData }, { data: uData }] = await Promise.all([
      supabase.from('jobs').select(
        'id, room_no, project_id, customer_name, sales_id, revenue_inc_vat, working_status, quotation1_url, quotation2_url, id_card_url, delivery_doc_url, satisfaction_url, sale_receipt_url, sale_slip_url, projects(name), sales:users!sales_id(name), customers:customer_id(status)'
      ).neq('working_status', 'ยกเลิก').order('room_no'),
      supabase.from('projects').select('id, name').eq('active', true).order('name'),
      supabase.from('users').select('id, name').eq('active', true).eq('dept', 'Sales Executive').order('name'),
    ])

    const jobIds = (jobsRaw || []).map((j: any) => j.id)
    const { data: instsRaw } = jobIds.length > 0
      ? await supabase.from('payments').select('id, job_id, installment_no, installment_name, amount, paid_amount, status, slip_url, receipt_url').in('job_id', jobIds).order('installment_no')
      : { data: [] }

    const instMap = new Map<string, Installment[]>()
    for (const p of (instsRaw || []) as any[]) {
      if (!instMap.has(p.job_id)) instMap.set(p.job_id, [])
      instMap.get(p.job_id)!.push(p)
    }

    const built: JobRow[] = (jobsRaw || []).map((j: any) => {
      const insts: Installment[] = instMap.get(j.id) || []
      const paid_total = insts.filter(i => i.status === 'paid').reduce((s, i) => s + ((i as any).paid_amount ?? i.amount), 0)
      const unpaid_total = insts.filter(i => i.status !== 'paid').reduce((s, i) => s + i.amount, 0)
      return {
        id: j.id, room_no: j.room_no, project_id: j.project_id,
        project_name: j.projects?.name || j.project_id,
        customer_name: j.customer_name || '—',
        sales_id: j.sales_id || null,
        sales_name: j.sales?.name || '—',
        revenue_inc_vat: j.revenue_inc_vat || 0,
        quotation1_url: j.quotation1_url, quotation2_url: j.quotation2_url,
        id_card_url: j.id_card_url, delivery_doc_url: j.delivery_doc_url,
        satisfaction_url: j.satisfaction_url,
        sale_receipt_url: j.sale_receipt_url, sale_slip_url: j.sale_slip_url,
        working_status: j.working_status || '',
        customer_status: (j as any).customers?.status || '',
        installments: insts, paid_total, unpaid_total,
      }
    })

    setRows(built)
    setProjects(pData || [])
    setUsers(uData || [])
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

  const filtered = useMemo(() => {
    let r = rows
    if (filterProject) r = r.filter(j => j.project_id === filterProject)
    if (filterSales) r = r.filter(j => (j as any).sales_id === filterSales)
    if (search.trim()) {
      const q = search.toLowerCase().replace(/-/g, '')
      r = r.filter(j => (j.room_no.toLowerCase().replace(/-/g, '')).includes(q) || j.customer_name.toLowerCase().includes(search.toLowerCase()))
    }
    return r
  }, [rows, filterProject, filterSales, search])

  const totalPaid = filtered.reduce((s, j) => s + j.paid_total, 0)
  const totalUnpaid = filtered.reduce((s, j) => s + j.unpaid_total, 0)

  const inputStyle = { background: 'var(--input-bg)', border: '1px solid var(--divider)', color: 'var(--text-1)' }

  if (loading) return <PageSpinner />

  return (
    <div className="h-screen flex flex-col" style={{ background: 'var(--page-bg)' }}>

      {/* Header */}
      <div className="flex-shrink-0 px-6 pt-5 pb-3">
        <div className="flex items-center gap-3 mb-4">
          <h1 className="text-lg font-bold flex-1" style={{ color: 'var(--text-1)' }}>สถานะชำระเงิน & เอกสาร</h1>
          <button onClick={load} className="text-xs px-3 py-1.5 rounded-[8px]" style={inputStyle}>รีเฟรช</button>
        </div>

        {/* Filters */}
        <div className="flex gap-2 mb-3 flex-wrap">
          <div className="relative">
            <Search size={12} className="absolute left-2.5 top-1/2 -translate-y-1/2" style={{ color: 'var(--text-3)' }} />
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder="ค้นหาห้อง / ลูกค้า"
              className="pl-7 pr-6 py-1.5 rounded-[8px] text-xs focus:outline-none w-44" style={inputStyle} />
            {search && <button onClick={() => setSearch('')} className="absolute right-2 top-1/2 -translate-y-1/2"><X size={10} style={{ color: 'var(--text-3)' }} /></button>}
          </div>
          <select value={filterProject} onChange={e => setFilterProject(e.target.value)}
            className="field-input" style={{ width: 'auto' }}>
            <option value="">ทุกโครงการ</option>
            {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
          <select value={filterSales} onChange={e => setFilterSales(e.target.value)}
            className="field-input" style={{ width: 'auto' }}>
            <option value="">ทุก Sales</option>
            {users.map(u => <option key={u.id} value={u.id}>{u.name}</option>)}
          </select>
        </div>

        {/* Summary */}
        <div className="flex gap-3 flex-wrap">
          <div className="flex items-center gap-2 px-3 py-2 rounded-[8px]"
            style={{ background: 'color-mix(in srgb, var(--accent-green) 8%, transparent)', border: '1px solid color-mix(in srgb, var(--accent-green) 30%, transparent)' }}>
            <p className="text-[10px] font-semibold" style={{ color: 'var(--accent-green)' }}>รับแล้ว</p>
            <p className="text-sm font-bold" style={{ color: 'var(--accent-green)' }}>{f(totalPaid)}</p>
          </div>
          <div className="flex items-center gap-2 px-3 py-2 rounded-[8px]"
            style={{ background: 'color-mix(in srgb, var(--accent-red) 8%, transparent)', border: '1px solid color-mix(in srgb, var(--accent-red) 30%, transparent)' }}>
            <p className="text-[10px] font-semibold" style={{ color: 'var(--accent-red)' }}>คงเหลือ</p>
            <p className="text-sm font-bold" style={{ color: 'var(--accent-red)' }}>{f(totalUnpaid)}</p>
          </div>
          <p className="text-xs self-center" style={{ color: 'var(--text-3)' }}>{filtered.length} รายการ</p>
        </div>
      </div>

      {/* Table */}
      <div className="flex-1 overflow-auto mx-6 mb-6 rounded-[12px]"
        style={{ border: '1px solid var(--card-border)', background: 'var(--card-bg)' }}>
        <table style={{ borderCollapse: 'collapse', width: '100%', minWidth: 900, fontSize: 12 }}>
          <thead>
            <tr style={{ background: 'var(--hover-bg)', position: 'sticky', top: 0, zIndex: 10 }}>
              {['ห้อง / โครงการ', 'ลูกค้า / Sales', 'งวดชำระ', 'รับแล้ว', 'คงเหลือ', 'เอกสาร'].map(h => (
                <th key={h} style={{ padding: '10px 12px', textAlign: 'left', borderBottom: '1px solid var(--divider)', color: 'var(--text-3)', fontWeight: 600, whiteSpace: 'nowrap' }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 ? (
              <tr><td colSpan={6} style={{ textAlign: 'center', padding: '3rem', color: 'var(--text-3)' }}>ไม่พบข้อมูล</td></tr>
            ) : filtered.map((job, ri) => {
              const paidCount = job.installments.filter(i => i.status === 'paid').length
              const docsDone = [job.quotation1_url, job.id_card_url, job.delivery_doc_url, job.satisfaction_url].filter(Boolean).length
              return (
                <tr key={job.id} onClick={() => setSelected(job)}
                  style={{ background: ri % 2 === 0 ? 'transparent' : 'rgba(0,0,0,0.015)', borderBottom: '1px solid var(--divider)', cursor: 'pointer' }}
                  onMouseEnter={e => (e.currentTarget.style.background = 'var(--hover-bg)')}
                  onMouseLeave={e => (e.currentTarget.style.background = ri % 2 === 0 ? 'transparent' : 'rgba(0,0,0,0.015)')}>

                  <td style={{ padding: '10px 12px', verticalAlign: 'middle' }}>
                    <p className="font-bold" style={{ color: 'var(--text-1)' }}>{job.room_no}</p>
                    <p className="text-[10px] mt-0.5 truncate max-w-[140px]" style={{ color: 'var(--accent)' }}>{job.project_name}</p>
                  </td>

                  <td style={{ padding: '10px 12px', verticalAlign: 'middle' }}>
                    <p style={{ color: 'var(--text-1)' }}>{job.customer_name}</p>
                    <p className="text-[10px]" style={{ color: 'var(--text-3)' }}>{job.sales_name}</p>
                  </td>

                  <td style={{ padding: '10px 12px', verticalAlign: 'middle' }}>
                    <div className="flex items-end gap-1 flex-wrap">
                      {job.installments.length === 0
                        ? <span style={{ color: 'var(--text-3)' }}>ยังไม่มีแผน</span>
                        : job.installments.map(inst => <InstallmentBadge key={inst.id} inst={inst} />)}
                    </div>
                    {job.installments.length > 0 && (
                      <p className="text-[10px] mt-1" style={{ color: 'var(--text-3)' }}>
                        {paidCount}/{job.installments.length} งวด · เหลือ {job.installments.length - paidCount}
                      </p>
                    )}
                  </td>

                  <td style={{ padding: '10px 12px', verticalAlign: 'middle' }}>
                    <p className="font-semibold" style={{ color: 'var(--accent-green)' }}>{f(job.paid_total)}</p>
                  </td>

                  <td style={{ padding: '10px 12px', verticalAlign: 'middle' }}>
                    <p className="font-semibold" style={{ color: job.unpaid_total > 0 ? 'var(--accent-red)' : 'var(--text-3)' }}>
                      {job.unpaid_total > 0 ? f(job.unpaid_total) : '—'}
                    </p>
                  </td>

                  <td style={{ padding: '10px 12px', verticalAlign: 'middle' }}>
                    <div className="flex gap-1.5">
                      <DocIcon url={job.quotation1_url} label="ใบเสนอราคา 1" short="Q1" auto={autoCheckedSale(job)} />
                      <DocIcon url={job.quotation2_url} label="ใบเสนอราคา 2" short="Q2" auto={autoCheckedSale(job)} />
                      <DocIcon url={job.id_card_url} label="บัตรประชาชน" short="ID" auto={autoCheckedSale(job)} />
                      <DocIcon url={job.sale_slip_url} label="สลิปการขาย" short="SLP" auto={autoCheckedSale(job)} />
                      <DocIcon url={job.sale_receipt_url} label="ใบเสร็จ (ช่วงขาย)" short="RCP" auto={autoCheckedSale(job)} />
                      <DocIcon url={job.delivery_doc_url} label="ใบส่งมอบ" short="HO" auto={autoCheckedDelivery(job)} />
                      <DocIcon url={job.satisfaction_url} label="แบบประเมิน" short="SAT" auto={autoCheckedDelivery(job)} />
                    </div>
                    <p className="text-[10px] mt-1" style={{ color: 'var(--text-3)' }}>
                      {[job.quotation1_url, job.id_card_url, job.sale_slip_url, job.sale_receipt_url, job.delivery_doc_url, job.satisfaction_url].filter(Boolean).length}/6 เอกสาร
                    </p>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      {selected && <RowDrawer job={selected} onClose={() => setSelected(null)} />}
    </div>
  )
}
