'use client'

import { useEffect, useState, useCallback, useMemo } from 'react'
import { createClient } from '@/lib/supabase/client'
import { ExternalLink, FileText, X } from 'lucide-react'
import { PageSpinner } from '@/components/ui/StateUI'
import PageHeader from '@/components/ui/PageHeader'
import FilterBar from '@/components/ui/FilterBar'
import Pagination, { PAGE_SIZE } from '@/components/ui/Pagination'
import { fetchAllRows } from '@/lib/fetchAll'

// ─── Types ─────────────────────────────────────────────────
interface Installment {
  id: string
  installment_no: number
  installment_name: string
  amount: number
  paid_amount: number | null
  voucher_amount: number | null
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
const f = (n: number) => n ? '฿' + Math.round(n).toLocaleString('th-TH') : '฿0'

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
          background: has ? (isAuto ? 'color-mix(in srgb, var(--accent-green) 12%, transparent)' : 'color-mix(in srgb, var(--accent) 15%, transparent)') : 'var(--hover-bg)',
          color: has ? (isAuto ? 'var(--accent-green)' : 'var(--accent)') : 'var(--text-3)',
          border: `1px solid ${has ? (isAuto ? 'color-mix(in srgb, var(--accent-green) 30%, transparent)' : 'color-mix(in srgb, var(--accent) 30%, transparent)') : 'var(--divider)'}`,
        }}>
        {has ? <FileText size={12} /> : <span className="text-micro font-bold">{short}</span>}
      </div>
      <span className="text-micro" style={{ color: has ? (isAuto ? 'var(--accent-green)' : 'var(--accent)') : 'var(--text-3)' }}>{short}</span>
    </a>
  )
}

function InstallmentBadge({ inst }: { inst: Installment }) {
  const color = inst.status === 'paid'
    ? { bg: 'color-mix(in srgb, var(--accent-green) 12%, transparent)', border: 'color-mix(in srgb, var(--accent-green) 40%, transparent)', text: 'var(--accent-green)' }
    : inst.status === 'overdue'
    ? { bg: 'color-mix(in srgb, var(--accent-red) 12%, transparent)', border: 'color-mix(in srgb, var(--accent-red) 40%, transparent)', text: 'var(--accent-red)' }
    : { bg: 'var(--hover-bg)', border: 'var(--divider)', text: 'var(--text-3)' }

  return (
    <div className="flex flex-col items-center gap-0.5">
      <div className="relative group">
        <div className="w-7 h-7 rounded flex items-center justify-center text-micro font-bold cursor-default"
          style={{ background: color.bg, border: `1px solid ${color.border}`, color: color.text }}>
          {inst.installment_no}
        </div>
        <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-1.5 z-50 hidden group-hover:block pointer-events-none">
          <div className="text-micro rounded-[6px] px-2 py-1.5 whitespace-nowrap shadow-lg"
            style={{ background: 'var(--tooltip-bg)', color: 'var(--tooltip-fg)' }}>
            <p className="font-semibold">{inst.installment_name}</p>
            <p>{f(inst.amount)}</p>
            {(inst.slip_url || inst.receipt_url) && (
              <p className="mt-0.5" style={{ opacity: 0.75 }}>{[inst.slip_url && 'slip', inst.receipt_url && 'ใบเสร็จ'].filter(Boolean).join(', ')} แนบแล้ว</p>
            )}
          </div>
        </div>
      </div>
      <div className="flex gap-0.5">
        <span style={{ width: 4, height: 4, borderRadius: '50%', background: inst.slip_url ? 'var(--accent-blue)' : 'var(--divider)', display: 'block' }} />
        <span style={{ width: 4, height: 4, borderRadius: '50%', background: inst.receipt_url ? 'var(--accent-green)' : 'var(--divider)', display: 'block' }} />
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
            <p className="text-micro uppercase tracking-widest mb-0.5" style={{ color: 'var(--text-3)' }}>{job.project_name}</p>
            <p className="font-bold text-lg" style={{ color: 'var(--text-1)' }}>ห้อง {job.room_no}</p>
            <p className="text-sm" style={{ color: 'var(--text-2)' }}>{job.customer_name}</p>
          </div>
          <button onClick={onClose} className="p-2 rounded-[8px]" style={{ background: 'var(--hover-bg)', color: 'var(--text-2)' }}>
            <X size={14} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-5 space-y-5">
          {/* Summary */}
          <div className="grid grid-cols-3 gap-3">
            <div className="p-3 rounded-[8px]" style={{ background: 'var(--hover-bg)', border: '1px solid var(--divider)' }}>
              <p className="text-micro font-semibold" style={{ color: 'var(--text-3)' }}>มูลค่างาน</p>
              <p className="font-bold text-base" style={{ color: 'var(--text-1)' }}>{f(job.revenue_inc_vat)}</p>
            </div>
            <div className="p-3 rounded-[8px]" style={{ background: 'color-mix(in srgb, var(--accent-green) 8%, transparent)', border: '1px solid color-mix(in srgb, var(--accent-green) 30%, transparent)' }}>
              <p className="text-micro font-semibold" style={{ color: 'var(--accent-green)' }}>ชำระแล้ว</p>
              <p className="font-bold text-base" style={{ color: 'var(--accent-green)' }}>{f(job.paid_total)}</p>
            </div>
            {/* Outstanding balance is a normal state, not an error — orange, not red.
                Red stays reserved for instalments that are actually overdue. */}
            <div className="p-3 rounded-[8px]" style={{ background: 'color-mix(in srgb, var(--accent-orange) 8%, transparent)', border: '1px solid color-mix(in srgb, var(--accent-orange) 30%, transparent)' }}>
              <p className="text-micro font-semibold" style={{ color: 'var(--accent-orange)' }}>คงเหลือ</p>
              <p className="font-bold text-base" style={{ color: 'var(--accent-orange)' }}>
                {job.unpaid_total < -1 ? `เกิน ${f(-job.unpaid_total)}` : job.unpaid_total > 1 ? f(job.unpaid_total) : 'ครบแล้ว'}
              </p>
            </div>
          </div>

          {/* Installments */}
          <div>
            <p className="text-micro uppercase tracking-widest mb-2 font-semibold" style={{ color: 'var(--text-3)' }}>
              งวดชำระ ({paidCount}/{total})
            </p>
            <div className="space-y-2">
              {job.installments.map(inst => {
                const txtColor = inst.status === 'paid' ? 'var(--accent-green)' : inst.status === 'overdue' ? 'var(--accent-red)' : 'var(--text-3)'
                return (
                  <div key={inst.id} className="flex items-center gap-3 p-3 rounded-[8px]"
                    style={{ background: 'var(--hover-bg)', border: '1px solid var(--divider)' }}>
                    <div className="w-6 h-6 rounded-[6px] flex items-center justify-center text-micro font-bold flex-shrink-0"
                      style={{ background: inst.status === 'paid' ? 'color-mix(in srgb, var(--accent-green) 20%, transparent)' : inst.status === 'overdue' ? 'color-mix(in srgb, var(--accent-red) 20%, transparent)' : 'var(--card-bg)', color: txtColor }}>
                      {inst.installment_no}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs truncate" style={{ color: 'var(--text-1)' }}>{inst.installment_name}</p>
                      <p className="text-micro" style={{ color: 'var(--text-2)' }}>{f(inst.amount)}</p>
                    </div>
                    <div className="flex gap-1.5">
                      {inst.slip_url && (
                        <a href={inst.slip_url} target="_blank" rel="noopener noreferrer"
                          className="text-micro px-2 py-1 rounded flex items-center gap-1"
                          style={{ background: 'color-mix(in srgb, var(--accent-blue) 10%, transparent)', color: 'var(--accent-blue)', border: '1px solid color-mix(in srgb, var(--accent-blue) 30%, transparent)' }}>
                          <ExternalLink size={9} /> Slip
                        </a>
                      )}
                      {inst.receipt_url && (
                        <a href={inst.receipt_url} target="_blank" rel="noopener noreferrer"
                          className="text-micro px-2 py-1 rounded flex items-center gap-1"
                          style={{ background: 'color-mix(in srgb, var(--accent-green) 10%, transparent)', color: 'var(--accent-green)', border: '1px solid color-mix(in srgb, var(--accent-green) 30%, transparent)' }}>
                          <ExternalLink size={9} /> ใบเสร็จ
                        </a>
                      )}
                      {!inst.slip_url && !inst.receipt_url && (
                        <span className="text-micro" style={{ color: 'var(--text-3)' }}>ไม่มีไฟล์</span>
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
            <p className="text-micro uppercase tracking-widest mb-3 font-semibold" style={{ color: 'var(--text-3)' }}>เอกสาร</p>
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
                      background: checked ? (isAuto ? 'color-mix(in srgb, var(--accent-green) 6%, transparent)' : 'color-mix(in srgb, var(--accent) 6%, transparent)') : 'var(--hover-bg)',
                      border: `1px solid ${checked ? (isAuto ? 'color-mix(in srgb, var(--accent-green) 20%, transparent)' : 'color-mix(in srgb, var(--accent) 20%, transparent)') : 'var(--divider)'}`,
                    }}>
                    <span className="text-micro font-bold px-1.5 py-0.5 rounded w-9 text-center flex-shrink-0"
                      style={{
                        background: checked ? (isAuto ? 'color-mix(in srgb, var(--accent-green) 15%, transparent)' : 'color-mix(in srgb, var(--accent) 15%, transparent)') : 'var(--card-bg)',
                        color: checked ? (isAuto ? 'var(--accent-green)' : 'var(--accent)') : 'var(--text-3)',
                      }}>
                      {d.short}
                    </span>
                    <span className="text-xs flex-1 truncate" style={{ color: checked ? 'var(--text-1)' : 'var(--text-3)' }}>{d.label}</span>
                    {d.url
                      ? <a href={d.url} target="_blank" rel="noopener noreferrer"><ExternalLink size={12} style={{ color: 'var(--accent)' }} /></a>
                      : isAuto
                        ? <span className="text-micro" style={{ color: 'var(--accent-green)' }}>อัตโนมัติ</span>
                        : <span className="text-micro" style={{ color: 'var(--text-3)' }}>—</span>
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
      supabase.from('users').select('id, name').eq('active', true).in('dept', ['Sales Executive', 'Administration']).order('name'),
    ])

    const jobIds = (jobsRaw || []).map((j: any) => j.id)
    // Chunked: these jobs have 1,184 instalments between them and PostgREST caps
    // a select at 1,000, silently. The missing rows dropped out of paid_total,
    // which made คงเหลือ too high on whichever jobs lost them.
    const { data: instsRaw } = jobIds.length > 0
      ? await fetchAllRows<Installment & { job_id: string }>(() =>
          supabase.from('payments')
            .select('id, job_id, installment_no, installment_name, amount, paid_amount, voucher_amount, status, slip_url, receipt_url')
            .in('job_id', jobIds).order('id'))
      : { data: [] }

    const instMap = new Map<string, Installment[]>()
    for (const p of (instsRaw || []) as any[]) {
      if (!instMap.has(p.job_id)) instMap.set(p.job_id, [])
      instMap.get(p.job_id)!.push(p)
    }
    // The query orders by id so the chunks cannot overlap; badges still need to
    // read 1, 2, 3, so sort each job's own list here.
    for (const list of instMap.values()) list.sort((a, b) => a.installment_no - b.installment_no)

    const built: JobRow[] = (jobsRaw || []).map((j: any) => {
      const insts: Installment[] = instMap.get(j.id) || []
      // A voucher settles part of an instalment: paid_amount holds the cash and
      // voucher_amount the rest, so the job is closed only when both are counted.
      // Counting cash alone left five fully-paid rooms showing an outstanding
      // balance equal to their voucher, flagged "ค้างชำระ". My Deals and Jobs
      // both add the two — this page was the odd one out.
      const paid_total = insts.filter(i => i.status === 'paid')
        .reduce((s, i) => s + Number(i.paid_amount ?? i.amount ?? 0) + Number(i.voucher_amount ?? 0), 0)
      // Outstanding is revenue minus what came in — NOT the sum of unpaid
      // instalments. Most jobs carry only the booking instalment until the plan
      // is set up, so summing unpaid rows reported ฿0 owing on a ฿2,000,000 job
      // that had received ฿10,000. Across the book that hid ฿31.8M on 350 jobs.
      const unpaid_total = (j.revenue_inc_vat || 0) - paid_total
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

  // Finding the rooms that need attention meant paging through 900 rows by eye,
  // or searching one at a time — a day's data cleanup that the table already had
  // the answers for.
  type MoneyFilter = 'all' | 'owing' | 'settled' | 'over' | 'noplan'
  const [filterMoney, setFilterMoney] = useState<MoneyFilter>('all')
  const [page, setPage] = useState(1)

  const preFiltered = useMemo(() => {
    let r = rows
    if (filterProject) r = r.filter(j => j.project_id === filterProject)
    if (filterSales) r = r.filter(j => (j as any).sales_id === filterSales)
    if (search.trim()) {
      const q = search.toLowerCase().replace(/-/g, '')
      r = r.filter(j => (j.room_no.toLowerCase().replace(/-/g, '')).includes(q) || j.customer_name.toLowerCase().includes(search.toLowerCase()))
    }
    return r
  }, [rows, filterProject, filterSales, search])

  // Declared before `filtered`: useMemo runs its factory during render, so a
  // const defined further down is still in the temporal dead zone and the page
  // throws the moment a chip is clicked.
  const moneyOf = (j: JobRow): MoneyFilter =>
    j.installments.length === 0 ? 'noplan'
    : j.unpaid_total > 1 ? 'owing'
    : j.unpaid_total < -1 ? 'over'
    : 'settled'

  const filtered = useMemo(
    () => filterMoney === 'all' ? preFiltered : preFiltered.filter(j => moneyOf(j) === filterMoney),
    [preFiltered, filterMoney]) // eslint-disable-line react-hooks/exhaustive-deps

  // Counts come from the set the other filters already narrowed, so a chip
  // always says how many it will actually show.
  const moneyCounts = useMemo(() => {
    const c = { all: preFiltered.length, owing: 0, settled: 0, over: 0, noplan: 0 } as Record<MoneyFilter, number>
    for (const j of preFiltered) c[moneyOf(j)]++
    return c
  }, [preFiltered])

  // Reset to page 1 whenever the filter changes, or a narrow filter can land
  // the reader on an empty page that used to have rows.
  useEffect(() => { setPage(1) }, [search, filterProject, filterSales, filterMoney])
  const paginated = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE)

  const totalRevenue = filtered.reduce((s, j) => s + j.revenue_inc_vat, 0)
  const totalPaid = filtered.reduce((s, j) => s + j.paid_total, 0)
  const totalUnpaid = filtered.reduce((s, j) => s + j.unpaid_total, 0)

  const inputStyle = { background: 'var(--input-bg)', border: '1px solid var(--divider)', color: 'var(--text-1)' }

  if (loading) return <PageSpinner />

  return (
    <div className="page-content">
        <PageHeader
          title="Payments"
          subtitle="สถานะชำระเงินและเอกสารรายห้อง"
          className="mb-4"
          actions={<button onClick={load} className="text-xs px-3 py-1.5 rounded-[8px]" style={inputStyle}>รีเฟรช</button>}
        />

        {/* Filters */}
        <FilterBar search={search} onSearchChange={setSearch} searchPlaceholder="ค้นหาห้อง / ลูกค้า" sticky className="mb-3">
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
        </FilterBar>

        {/* Money-state chips, in their own row above the data they narrow —
            the Customers pattern. Without these, finding the rooms that need
            attention meant paging through 900 rows or searching one at a time. */}
        <div className="tab-group mb-4 flex-wrap">
          {([
            ['all',     'ทั้งหมด'],
            ['owing',   'ค้างชำระ'],
            ['settled', 'ครบแล้ว'],
            ['over',    'เก็บเกิน'],
            ['noplan',  'ยังไม่มีแผนชำระ'],
          ] as [MoneyFilter, string][]).map(([key, label]) => (
            <button key={key} onClick={() => setFilterMoney(key)}
              className={`tab-btn ${filterMoney === key ? 'active' : ''}`}>
              {label} {moneyCounts[key].toLocaleString('th-TH')}
            </button>
          ))}
        </div>

        {/* Summary — ds-card KPI tiles, as on every other page. This was the
            only summary in the app rendered as tinted pills, with the record
            count loose beside them instead of inside a tile.
            คงเหลือ stays orange: outstanding is a normal state, not an error. */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-4">
          <div className="ds-card p-4">
            <p className="text-xs mb-1" style={{ color: 'var(--text-3)' }}>มูลค่างาน</p>
            <p className="text-kpi-money" style={{ color: 'var(--text-1)' }}>{f(totalRevenue)}</p>
          </div>
          <div className="ds-card p-4">
            <p className="text-xs mb-1" style={{ color: 'var(--text-3)' }}>ชำระแล้ว</p>
            <p className="text-kpi-money" style={{ color: 'var(--accent-green)' }}>{f(totalPaid)}</p>
            <p className="text-micro mt-0.5" style={{ color: 'var(--text-3)' }}>
              {totalRevenue > 0 ? Math.round(totalPaid / totalRevenue * 100) : 0}% ของมูลค่างาน
            </p>
          </div>
          <div className="ds-card p-4">
            <p className="text-xs mb-1" style={{ color: 'var(--text-3)' }}>คงเหลือ</p>
            <p className="text-kpi-money" style={{ color: 'var(--accent-orange)' }}>{f(totalUnpaid)}</p>
          </div>
          <div className="ds-card p-4 col-span-2 lg:col-span-1">
            <p className="text-xs mb-1" style={{ color: 'var(--text-3)' }}>รายการ</p>
            <p className="text-kpi-number" style={{ color: 'var(--text-1)' }}>{filtered.length.toLocaleString('th-TH')}</p>
          </div>
        </div>

      {/* Table */}
      <div className="tbl-scroll rounded-[11px]"
        style={{ border: '1px solid var(--card-border)', background: 'var(--card-bg)' }}>
        <table className="text-sm" style={{ borderCollapse: 'collapse', width: '100%', minWidth: 900 }}>
          <thead>
            <tr style={{ background: 'var(--hover-bg)' }}>
              {['ห้อง / โครงการ', 'ลูกค้า / Sales', 'งวดชำระ', 'มูลค่างาน', 'ชำระแล้ว', 'คงเหลือ', 'เอกสาร'].map(h => (
                <th key={h} className="text-xs font-semibold" style={{ padding: '12px 16px', textAlign: 'left', borderBottom: '1px solid var(--divider)', color: 'var(--text-3)', whiteSpace: 'nowrap' }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 ? (
              <tr><td colSpan={7} style={{ textAlign: 'center', padding: '3rem', color: 'var(--text-3)' }}>ไม่พบข้อมูล</td></tr>
            ) : paginated.map((job, ri) => {
              const paidCount = job.installments.filter(i => i.status === 'paid').length
              const docsDone = [job.quotation1_url, job.id_card_url, job.delivery_doc_url, job.satisfaction_url].filter(Boolean).length
              return (
                <tr key={job.id} onClick={() => setSelected(job)}
                  style={{ background: ri % 2 === 0 ? 'transparent' : 'rgba(0,0,0,0.015)', borderBottom: '1px solid var(--divider)', cursor: 'pointer' }}
                  onMouseEnter={e => (e.currentTarget.style.background = 'var(--hover-bg)')}
                  onMouseLeave={e => (e.currentTarget.style.background = ri % 2 === 0 ? 'transparent' : 'rgba(0,0,0,0.015)')}>

                  <td style={{ padding: '10px 16px', verticalAlign: 'middle' }}>
                    <p className="font-bold" style={{ color: 'var(--text-1)' }}>{job.room_no}</p>
                    <p className="text-micro mt-0.5 truncate max-w-[140px]" style={{ color: 'var(--accent)' }}>{job.project_name}</p>
                  </td>

                  <td style={{ padding: '10px 16px', verticalAlign: 'middle' }}>
                    <p style={{ color: 'var(--text-1)' }}>{job.customer_name}</p>
                    <p className="text-micro" style={{ color: 'var(--text-3)' }}>{job.sales_name}</p>
                  </td>

                  <td style={{ padding: '10px 16px', verticalAlign: 'middle' }}>
                    <div className="flex items-end gap-1 flex-wrap">
                      {job.installments.length === 0
                        ? <span style={{ color: 'var(--text-3)' }}>ยังไม่มีแผน</span>
                        : job.installments.map(inst => <InstallmentBadge key={inst.id} inst={inst} />)}
                    </div>
                    {job.installments.length > 0 && (
                      <p className="text-micro mt-1" style={{ color: 'var(--text-3)' }}>
                        {paidCount}/{job.installments.length} งวด · เหลือ {job.installments.length - paidCount}
                      </p>
                    )}
                  </td>

                  {/* มูลค่างาน → ชำระแล้ว → คงเหลือ, so the subtraction is on screen
                      and the reader can check it. */}
                  <td style={{ padding: '10px 16px', verticalAlign: 'middle' }}>
                    <p className="font-semibold" style={{ color: 'var(--text-1)' }}>{f(job.revenue_inc_vat)}</p>
                  </td>

                  <td style={{ padding: '10px 16px', verticalAlign: 'middle' }}>
                    <p className="font-semibold" style={{ color: 'var(--accent-green)' }}>{f(job.paid_total)}</p>
                  </td>

                  <td style={{ padding: '10px 16px', verticalAlign: 'middle' }}>
                    {job.unpaid_total > 1 ? (
                      <p className="font-semibold" style={{ color: 'var(--accent-orange)' }}>{f(job.unpaid_total)}</p>
                    ) : job.unpaid_total < -1 ? (
                      // 80 jobs have taken more than the recorded revenue. Saying
                      // "เกิน" is honest; a negative number reads as a mistake.
                      <p className="font-semibold" style={{ color: 'var(--accent-blue)' }} title="รับเงินเกินมูลค่างานที่บันทึกไว้">
                        เกิน {f(-job.unpaid_total)}
                      </p>
                    ) : (
                      <p className="font-semibold" style={{ color: 'var(--accent-green)' }}>ครบแล้ว</p>
                    )}
                  </td>

                  <td style={{ padding: '10px 16px', verticalAlign: 'middle' }}>
                    <div className="flex gap-1.5">
                      <DocIcon url={job.quotation1_url} label="ใบเสนอราคา 1" short="Q1" auto={autoCheckedSale(job)} />
                      <DocIcon url={job.quotation2_url} label="ใบเสนอราคา 2" short="Q2" auto={autoCheckedSale(job)} />
                      <DocIcon url={job.id_card_url} label="บัตรประชาชน" short="ID" auto={autoCheckedSale(job)} />
                      <DocIcon url={job.sale_slip_url} label="สลิปการขาย" short="SLP" auto={autoCheckedSale(job)} />
                      <DocIcon url={job.sale_receipt_url} label="ใบเสร็จ (ช่วงขาย)" short="RCP" auto={autoCheckedSale(job)} />
                      <DocIcon url={job.delivery_doc_url} label="ใบส่งมอบ" short="HO" auto={autoCheckedDelivery(job)} />
                      <DocIcon url={job.satisfaction_url} label="แบบประเมิน" short="SAT" auto={autoCheckedDelivery(job)} />
                    </div>
                    <p className="text-micro mt-1" style={{ color: 'var(--text-3)' }}>
                      {[job.quotation1_url, job.id_card_url, job.sale_slip_url, job.sale_receipt_url, job.delivery_doc_url, job.satisfaction_url].filter(Boolean).length}/6 เอกสาร
                    </p>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
        <Pagination page={page} setPage={setPage} total={filtered.length} unit="งาน"
          grandTotal={rows.length} />
      </div>

      {selected && <RowDrawer job={selected} onClose={() => setSelected(null)} />}
    </div>
  )
}
