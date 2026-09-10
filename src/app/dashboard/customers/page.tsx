'use client'

import { Fragment, useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { MoneyField } from '@/components/ui/MoneyInput'
import {
  Plus, Users, Pencil, AlertCircle, Trash2, X,
  Phone, Mail, MessageCircle, Building2, Home, Banknote,
  Briefcase, FileText, CheckCircle, Clock, Shield, ChevronRight,
} from 'lucide-react'
import { TableSpinner, TableError, TableEmpty } from '@/components/ui/StateUI'
import Modal from '@/components/ui/Modal'
import PageHeader from '@/components/ui/PageHeader'
import FilterBar from '@/components/ui/FilterBar'
import Pagination, { PAGE_SIZE } from '@/components/ui/Pagination'
import { CRM_STAGES, crmStage, isProspectStage, WORK_TYPES, summariseCustomer, customerKind, CUSTOMER_KINDS } from '@/lib/status'
import { Input, Select, TextArea } from '@/components/ui/Input'
import { createProspectJob } from '@/lib/prospectJob'
import { showConfirm } from '@/components/ui/dialog'
import { compareRoom, sameRoom } from '@/lib/utils'
import { nextCustomerId } from '@/lib/customerId'
import { cleanName } from '@/lib/customerName'

interface Customer {
  id: string
  customer_name: string
  phone: string
  email: string
  line_id: string
  source: string
  project_id: string
  interested_room: string
  notes: string
  created_at: string
  projects?: { name: string }
  users?: { name: string }
}

interface Project { id: string; name: string }
interface User { id: string; name: string }

interface DetailJob {
  id: string
  po_no: string
  so_no: string
  room_no: string
  work_type: string
  package_type: string
  order_date: string | null
  revenue_ex_vat: number
  revenue_inc_vat: number
  payments?: { voucher_amount: number | null }[] | null
  working_status: string
  customer_name: string
  installments: DetailInstallment[]
  handover: { delivery_date: string | null; work_status: string } | null
}

interface DetailInstallment {
  id: string
  installment_no: number
  installment_name: string
  amount: number
  status: string
  due_date: string | null
  paid_date: string | null
  is_final: boolean
}

interface DetailWarranty {
  id: string
  warranty_start: string
  warranty_end: string
  warranty_months: number
  status: string
  room: string
  job_id: string | null
  handover_date: string | null
  notes: string
}


const STATUS_LIST = CRM_STAGES

const SOURCE_OPTIONS = [
  { value: '', label: '— เลือกช่องทาง —' },
  { value: 'event', label: 'Event' },
  { value: 'referral', label: 'Referral' },
  { value: 'walk_in', label: 'Walk-in' },
  { value: 'online', label: 'Online' },
  { value: 'cold_call', label: 'Cold Call' },
  { value: 'other', label: 'อื่นๆ' },
]

const emptyForm = {
  customer_name: '', phone: '', email: '', line_id: '', source: '',
  project_id: '', interested_room: '', budget: 0,
  assigned_to: '', notes: '',
  customer_type: 'B2C', work_type: '',
}

const statusInfo = crmStage

/** work_type and notes now live on the job — both columns were dropped from
 *  customers on 2026-08-25. A customer usually holds one job; take the first
 *  that carries a value so the drawer and the edit form still show it. */
const jobField = (c: any, f: 'work_type' | 'notes'): string =>
  (((c as any)?.jobs as any[]) || []).find(j => j?.[f])?.[f] || ''

/** ทศนิยม 2 ตำแหน่งเหมือน baht() ทั้งระบบ ต่างแค่ไม่มีสัญลักษณ์ ฿ เพราะ
 *  ลิ้นชักนี้เขียน "บ." ต่อท้ายเอง */
/* Voucher ของงานหนึ่งใบ = ผลรวม voucher_amount ของทุกงวด · `jobs.voucher` เป็น
   ช่องเก่าที่กรอกคนละทางและตัวเลขไม่ตรงกัน (39 ห้อง ฿1,515,000 กับ 32 ห้อง
   ฿932,697 เมื่อ 2026-09-08) เจ้าของสั่งให้ยึดฝั่ง payments · ดู lib/voucher.ts */
function voucherOfJob(job: { payments?: { voucher_amount: number | null }[] | null }): number {
  return (job.payments ?? []).reduce((s, p) => s + Number(p.voucher_amount || 0), 0)
}

function fmt(n: number) {
  return n ? n.toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '—'
}


/**
 * What this customer has bought from us, counted across every job.
 *
 * The page could show a customer's rooms and their money but not the one thing
 * a register is for — how many times this person has ordered, and where each
 * order stands. Answering it meant opening customers one at a time; thirty of
 * them have more than one job.
 */
type JobTally = {
  total: number
  booked: number
  working: number
  delivered: number
  cancelled: number
  /** Prospect jobs: opened, but no work booked yet. */
  prospect: number
  rooms: string[]
  revenue: number
  paid: number
}
/**
 * Every sales person who has sold this customer something, in the order the
 * jobs were opened.
 *
 * A customer record used to carry one assigned_to, so a repeat buyer served by
 * a second sales showed only the first — and updating the record erased who
 * sold the earlier job. The seller belongs to the order; 63 customers here have
 * more than one.
 */
/** The sales currently on this customer's jobs — seeds the assign field.
 *  customers.assigned_to was dropped on 2026-08-27; jobs.sales_id is the only
 *  copy left. */
function salesIdOf(c: any): string {
  for (const j of ((c?.jobs as any[]) || [])) if (j?.sales_id) return j.sales_id
  return ''
}

function salesOf(c: any): string[] {
  const names: string[] = []
  for (const j of ((c?.jobs as any[]) || [])) {
    const n = j?.sales?.name
    if (n && !names.includes(n)) names.push(n)
  }
  return names
}

function tallyJobs(c: any): JobTally {
  const jobs: any[] = (c?.jobs as any[]) || []
  const t: JobTally = { total: jobs.length, booked: 0, working: 0, delivered: 0, cancelled: 0, prospect: 0, rooms: [], revenue: 0, paid: 0 }
  const rooms = new Set<string>()
  for (const j of jobs) {
    const ws = j.working_status || ''
    if (ws === 'ยกเลิก') t.cancelled++
    else if (ws === 'ส่งมอบแล้ว') t.delivered++
    else if (ws === 'ดำเนินการ' || ws === 'รอส่งมอบ') t.working++
    else if (ws === 'จอง') t.booked++
    // working_status is null until a deal is booked — that is a prospect job,
    // not an unknown one.
    else t.prospect++
    if (j.room_no) rooms.add(String(j.room_no))
    // Cancelled work is not revenue.
    if (ws !== 'ยกเลิก') t.revenue += j.revenue_inc_vat || 0
    t.paid += ((j.payments || []) as any[])
      .filter(p => p.status === 'paid')
      .reduce((s, p) => s + (p.paid_amount ?? p.amount ?? 0), 0)
  }
  t.rooms = [...rooms].sort(compareRoom)
  return t
}

// ── Customer Detail Drawer ──────────────────────────────────────────────────
function CustomerDetail({
  customer, projects, onClose, onEdit,
}: {
  customer: Customer
  projects: Project[]
  onClose: () => void
  onEdit: () => void
}) {
  const supabase = createClient()
  const [jobs, setJobs] = useState<DetailJob[]>([])
  const [warranties, setWarranties] = useState<DetailWarranty[]>([])
  const [loading, setLoading] = useState(true)
  const [q, setQ] = useState('')
  const [roomStatus, setRoomStatus] = useState('')
  const [expanded, setExpanded] = useState<Set<string>>(new Set())
  const st = customerKind(summariseCustomer((customer as any).jobs).kind)

  /** A customer with one room should read like a page about that room, not a
   *  table you have to open first. Opening the only row is a default, not a
   *  second layout — same table, same code, one row already expanded. */
  useEffect(() => {
    setExpanded(jobs.length === 1 ? new Set([jobs[0].id]) : new Set())
  }, [jobs])

  /** warranties.room is written in the old sheet's notation ("Z-809") while
   *  jobs.room_no has been cleaned ("809"), so job_id is the reliable link and
   *  the room match only covers the six rows that have no job_id. */
  const warrantyOf = (job: DetailJob) =>
    warranties.find(w => w.job_id === job.id)
    || warranties.find(w => !w.job_id && sameRoom(w.room, job.room_no))

  const paidOf = (job: DetailJob) => job.installments
    .filter(i => i.status === 'paid')
    .reduce((s, i) => s + ((i as any).paid_amount ?? i.amount ?? 0), 0)

  useEffect(() => {
    let cancelled = false
    /* Voucher ของงานหนึ่งใบ = ผลรวม voucher_amount ของทุกงวด — ไม่ใช่
       jobs.voucher ซึ่งเป็นช่องเก่าที่กรอกคนละทางและไม่ตรงกัน (เจ้าของสั่ง
       2026-09-08) ดู lib/voucher.ts */
    async function fetchDetail() {
      setLoading(true)

      const [{ data: jobsRaw }, { data: warrantiesRaw }] = await Promise.all([
        supabase
          .from('jobs')
          .select('id, po_no, so_no, room_no, work_type, package_type, order_date, revenue_ex_vat, revenue_inc_vat, working_status, customer_name, payments(voucher_amount)')
          .eq('customer_id', customer.id)
          .order('order_date', { ascending: false }),
        supabase
          .from('warranties')
          .select('id, warranty_start, warranty_end, warranty_months, status, room, job_id, handover_date, notes')
          .eq('customer_id', customer.id),
      ])

      if (cancelled) return

      const jobIds = (jobsRaw || []).map((j: any) => j.id)

      const [{ data: installsRaw }, { data: handoversRaw }] = jobIds.length > 0
        ? await Promise.all([
            supabase.from('payments').select('id, job_id, installment_no, installment_name, amount, paid_amount, status, due_date, paid_date, is_final').in('job_id', jobIds).order('installment_no'),
            supabase.from('handovers').select('job_id, delivery_date, work_status').in('job_id', jobIds),
          ])
        : [{ data: [] }, { data: [] }]

      if (cancelled) return

      const installMap = new Map<string, DetailInstallment[]>()
      for (const p of (installsRaw || []) as any[]) {
        if (!installMap.has(p.job_id)) installMap.set(p.job_id, [])
        installMap.get(p.job_id)!.push(p)
      }
      const handoverMap = new Map<string, any>()
      for (const h of (handoversRaw || []) as any[]) {
        if (h.job_id) handoverMap.set(h.job_id, h)
      }

      setJobs((jobsRaw || []).map((j: any) => ({
        ...j,
        installments: installMap.get(j.id) || [],
        handover: handoverMap.get(j.id) || null,
      })))
      setWarranties((warrantiesRaw || []) as DetailWarranty[])
      setLoading(false)
    }
    fetchDetail()
    return () => { cancelled = true }
  }, [customer.id])

  const projectName = projects.find(p => p.id === customer.project_id)?.name

  return (
    <div className="modal-backdrop"
      onClick={onClose}>

      {/* Panel */}
      <div
        className="modal-panel modal-panel-wide flex flex-col"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-start justify-between px-5 pt-5 pb-4" style={{ borderBottom: '1px solid var(--divider)' }}>
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full flex items-center justify-center text-base font-bold flex-shrink-0"
              style={{ background: 'var(--active-bg)', color: 'var(--accent)' }}>
              {customer.customer_name[0]}
            </div>
            <div>
              <h2 className="text-section-title" style={{ color: 'var(--text-1)' }}>{customer.customer_name}</h2>
              <p className="text-xs font-mono mt-1" style={{ color: 'var(--text-3)' }}>{customer.id}</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <span className={st.badge}>
              {st.icon} {st.label}
            </span>
            <button onClick={onEdit} className="p-1.5 rounded-[8px] transition-colors" style={{ color: 'var(--text-2)', background: 'var(--hover-bg)' }} title="แก้ไขข้อมูล">
              <Pencil size={14} />
            </button>
            <button onClick={onClose} className="p-1.5 rounded-[8px] transition-colors" style={{ color: 'var(--text-2)', background: 'var(--hover-bg)' }}>
              <X size={16} />
            </button>
          </div>
        </div>

        <div className="flex-1 px-5 py-4 space-y-5">

          {/* Contact Info */}
          <section>
            <p className="text-xs font-semibold uppercase tracking-wider mb-2" style={{ color: 'var(--text-3)' }}>ข้อมูลติดต่อ</p>
            <div className="ds-card grid grid-cols-2 gap-3">
              <div className="flex items-center gap-2">
                <Phone size={13} style={{ color: 'var(--text-3)' }} />
                <span className="text-sm" style={{ color: 'var(--text-1)' }}>{customer.phone || '—'}</span>
              </div>
              <div className="flex items-center gap-2">
                <MessageCircle size={13} style={{ color: 'var(--text-3)' }} />
                <span className="text-sm" style={{ color: 'var(--text-1)' }}>{customer.line_id || '—'}</span>
              </div>
              {customer.email && (
                <div className="col-span-2 flex items-center gap-2">
                  <Mail size={13} style={{ color: 'var(--text-3)' }} />
                  <span className="text-sm" style={{ color: 'var(--text-1)' }}>{customer.email}</span>
                </div>
              )}
              <div className="flex items-center gap-2">
                <Building2 size={13} style={{ color: 'var(--text-3)' }} />
                <span className="text-sm" style={{ color: 'var(--text-2)' }}>{projectName || customer.project_id || '—'}</span>
              </div>
              <div className="flex items-center gap-2">
                <Home size={13} style={{ color: 'var(--text-3)' }} />
                <span className="text-sm font-mono" style={{ color: 'var(--accent)' }}>{customer.interested_room || '—'}</span>
              </div>
              <div className="flex items-center gap-2">
                <Banknote size={13} style={{ color: 'var(--text-3)' }} />
                {(() => {
                  const jobRev = ((customer as any).jobs as { revenue_inc_vat: number }[] | null)?.reduce((s, j) => s + (j.revenue_inc_vat || 0), 0) || 0
                  const val = jobRev
                  return <span className="text-sm font-semibold" style={{ color: val > 0 ? 'var(--accent-green)' : 'var(--text-2)' }}>
                    {val > 0 ? fmt(val) + ' บ.' : '—'}
                  </span>
                })()}
              </div>
              <div className="flex items-center gap-2">
                <Users size={13} style={{ color: 'var(--text-3)' }} />
                <span className="text-sm" style={{ color: 'var(--text-2)' }}>{salesOf(customer).join(' · ') || '—'}</span>
              </div>
              {jobField(customer, 'notes') && (
                <div className="col-span-2 text-xs px-3 py-2 rounded-lg" style={{ background: 'var(--hover-bg)', color: 'var(--text-2)' }}>
                  {jobField(customer, 'notes')}
                </div>
              )}
            </div>
          </section>

          {loading && (
            <div className="text-center py-8" style={{ color: 'var(--text-3)' }}>
              <div className="w-5 h-5 border-2 border-current border-t-transparent rounded-full animate-spin mx-auto mb-2" />
              <p className="text-xs">กำลังโหลดข้อมูล...</p>
            </div>
          )}

          {/* What this customer is worth to us, before the detail of how.
              The drawer listed every job but never said how many there were or
              what they came to — the two things you open a customer record for. */}
          {!loading && jobs.length > 0 && (
            <section>
              <p className="text-xs font-semibold uppercase tracking-wider mb-2" style={{ color: 'var(--text-3)' }}>สรุปการซื้อ</p>
              {(() => {
                const live = jobs.filter(j => j.working_status !== 'ยกเลิก')
                const revenue = live.reduce((s, j) => s + (j.revenue_inc_vat || 0), 0)
                const paid = jobs.reduce((s, j) => s + j.installments
                  .filter(i => i.status === 'paid')
                  .reduce((ps, i) => ps + ((i as any).paid_amount ?? i.amount ?? 0), 0), 0)
                const delivered = jobs.filter(j => j.working_status === 'ส่งมอบแล้ว').length
                const cancelled = jobs.length - live.length
                return (
                  <div className="ds-card grid grid-cols-3 gap-3">
                    <div>
                      <p className="text-micro" style={{ color: 'var(--text-3)' }}>ซื้อทั้งหมด</p>
                      <p className="text-base font-bold tabular-nums" style={{ color: 'var(--text-1)' }}>{jobs.length} งาน</p>
                      <p className="text-micro mt-1" style={{ color: 'var(--text-3)' }}>
                        ส่งมอบแล้ว {delivered}{cancelled > 0 ? ` · ยกเลิก ${cancelled}` : ''}
                      </p>
                    </div>
                    <div>
                      <p className="text-micro" style={{ color: 'var(--text-3)' }}>มูลค่ารวม</p>
                      <p className="text-base font-bold tabular-nums" style={{ color: 'var(--text-1)' }}>{fmt(revenue)}</p>
                      <p className="text-micro mt-1" style={{ color: 'var(--text-3)' }}>ไม่รวมงานที่ยกเลิก</p>
                    </div>
                    <div>
                      <p className="text-micro" style={{ color: 'var(--text-3)' }}>เก็บแล้ว</p>
                      <p className="text-base font-bold tabular-nums" style={{ color: paid > 0 ? 'var(--accent-green)' : 'var(--text-3)' }}>{fmt(paid)}</p>
                      <p className="text-micro mt-1" style={{ color: 'var(--text-3)' }}>
                        {revenue > 0 ? `${Math.round((paid / revenue) * 100)}% ของมูลค่า` : '—'}
                      </p>
                    </div>
                  </div>
                )
              })()}
            </section>
          )}

          {/* One list, whatever the size. A B2C buyer holds a single room; a
              developer here holds 145 in the same project, and after the
              duplicate customer records were merged those finally arrive on one
              screen. Two layouts — cards for the small case, a table for the
              big one — would have meant two things to keep in step and two
              different screens for the team to describe a bug against, so this
              is one table either way and the single row simply opens itself.

              The per-job "Journey" timeline that used to sit above this is
              gone. End to end it drew four steps per job — about 580 of them
              for the largest customer — and said what the rows below already
              say. A journey belongs to a room, not to a customer holding 145 of
              them, so it now lives inside the room's own expanded row. */}
          {!loading && (
            <section>
              <div className="flex items-center justify-between gap-2 mb-2">
                <p className="text-xs font-semibold uppercase tracking-wider flex items-center gap-1.5" style={{ color: 'var(--text-3)' }}>
                  <Briefcase size={12} />ห้อง ({jobs.length})
                </p>
                {jobs.length > 1 && (
                  <input
                    value={q} onChange={e => setQ(e.target.value)} placeholder="ค้นหาห้อง"
                    className="field-input" style={{ width: 150, padding: '5px 10px', fontSize: 12 }}
                  />
                )}
              </div>

              {jobs.length > 1 && (
                <div className="flex flex-wrap gap-1.5 mb-2">
                  {[
                    { value: '', label: 'ทั้งหมด' },
                    { value: 'ดำเนินการ', label: 'ดำเนินการ' },
                    { value: 'ส่งมอบแล้ว', label: 'ส่งมอบแล้ว' },
                    { value: 'ยกเลิก', label: 'ยกเลิก' },
                  ].map(s => {
                    const n = s.value === ''
                      ? jobs.length
                      : jobs.filter(j => (j.working_status || 'ดำเนินการ') === s.value).length
                    if (n === 0) return null
                    const on = roomStatus === s.value
                    return (
                      <button key={s.value} onClick={() => setRoomStatus(s.value)}
                        className="text-xs px-2.5 py-1 rounded-[8px] font-medium transition-colors"
                        style={{
                          background: on ? 'var(--active-bg)' : 'var(--hover-bg)',
                          color: on ? 'var(--accent)' : 'var(--text-2)',
                        }}>
                        {s.label} {n}
                      </button>
                    )
                  })}
                </div>
              )}

              {(() => {
                const shown = jobs.filter(j => {
                  const matchStatus = !roomStatus || (j.working_status || 'ดำเนินการ') === roomStatus
                  const s = q.trim().toLowerCase().replace(/-/g, '')
                  const matchQ = !s || (j.room_no || '').toLowerCase().replace(/-/g, '').includes(s)
                  return matchStatus && matchQ
                })

                if (jobs.length === 0) return (
                  <p className="text-xs px-3 py-4 rounded-[8px] text-center" style={{ background: 'var(--card-bg)', border: '1px solid var(--card-border)', color: 'var(--text-3)' }}>
                    ยังไม่มีงาน
                  </p>
                )
                if (shown.length === 0) return (
                  <p className="text-xs px-3 py-4 rounded-[8px] text-center" style={{ background: 'var(--card-bg)', border: '1px solid var(--card-border)', color: 'var(--text-3)' }}>
                    ไม่พบห้องที่ค้นหา
                  </p>
                )

                return (
                  <div className="tbl-scroll">
                    <table className="w-full tbl-dense tbl-tight tbl-rows">
                      <thead>
                        <tr>
                          <th className="text-left" style={{ width: '22%' }}>ห้อง</th>
                          <th className="text-left" style={{ width: '20%' }}>สถานะ</th>
                          <th className="num num-money" style={{ width: '20%' }}><span>มูลค่างาน</span></th>
                          <th className="num num-money" style={{ width: '18%' }}><span>ชำระ</span></th>
                          <th className="text-left" style={{ width: '20%' }}>ส่งมอบ</th>
                        </tr>
                      </thead>
                      <tbody>
                        {shown.map(job => {
                          const isOpen = expanded.has(job.id)
                          const paid = paidOf(job)
                          const total = job.installments.reduce((s, i) => s + i.amount, 0)
                          const pct = total > 0 ? Math.round(paid / total * 100) : 0
                          const delivered = job.working_status === 'ส่งมอบแล้ว'
                          const cancelled = job.working_status === 'ยกเลิก'
                          const warranty = warrantyOf(job)
                          const daysLeft = warranty?.warranty_end
                            ? Math.floor((new Date(warranty.warranty_end).getTime() - Date.now()) / 864e5)
                            : null

                          return (
                            <Fragment key={job.id}>
                              <tr
                                onClick={() => setExpanded(prev => {
                                  const next = new Set(prev)
                                  if (next.has(job.id)) next.delete(job.id); else next.add(job.id)
                                  return next
                                })}
                                className="cursor-pointer"
                                style={{ background: isOpen ? 'var(--hover-bg)' : undefined }}
                              >
                                <td>
                                  <span className="flex items-center gap-1">
                                    <ChevronRight size={11} className="transition-transform flex-shrink-0"
                                      style={{ color: 'var(--text-3)', transform: isOpen ? 'rotate(90deg)' : undefined }} />
                                    <span className="font-mono font-semibold" style={{ color: 'var(--accent)' }}>{job.room_no || '—'}</span>
                                  </span>
                                </td>
                                <td>
                                  <span className={`badge ${delivered ? 'badge-green' : cancelled ? 'badge-red' : 'badge-gray'}`}>
                                    {job.working_status || 'ดำเนินการ'}
                                  </span>
                                </td>
                                <td className="num num-money tabular-nums" style={{ color: 'var(--text-1)' }}><span>{fmt(job.revenue_inc_vat)}</span></td>
                                <td className="num num-pct tabular-nums" style={{ color: pct === 100 ? 'var(--accent-green)' : 'var(--text-2)' }}>
                                  <span>{total > 0 ? `${pct}%` : '—'}</span>
                                </td>
                                <td style={{ color: 'var(--text-2)' }}>{job.handover?.delivery_date?.slice(0, 10) || '—'}</td>
                              </tr>

                              {isOpen && (
                                <tr>
                                  <td colSpan={5} style={{ background: 'var(--hover-bg)', paddingTop: 0 }}>
                                    <div className="ds-card mb-1">
                                      <div className="grid grid-cols-2 gap-2 mb-4">
                                        {[
                                          { label: 'PO No.', value: job.po_no || '—' },
                                          { label: 'SO No.', value: job.so_no || '—' },
                                          { label: 'วันที่รับ PO', value: job.order_date?.slice(0, 10) || '—' },
                                          { label: 'Voucher', value: voucherOfJob(job) ? fmt(voucherOfJob(job)) + ' บ.' : '—' },
                                        ].map(f => (
                                          <div key={f.label} className="px-2 py-1.5 rounded-lg" style={{ background: 'var(--card-bg)' }}>
                                            <p className="text-micro uppercase tracking-wider" style={{ color: 'var(--text-3)' }}>{f.label}</p>
                                            <p className="text-xs font-semibold mt-1" style={{ color: 'var(--text-1)' }}>{f.value}</p>
                                          </div>
                                        ))}
                                      </div>

                                      <div className="flex items-center justify-between text-xs mb-4">
                                        <span style={{ color: 'var(--text-3)' }}>{job.work_type || '—'} · {job.package_type || '—'}</span>
                                        <span style={{ color: 'var(--text-3)' }}>
                                          ไม่รวม VAT <span className="font-semibold ml-1" style={{ color: 'var(--text-1)' }}>{fmt(job.revenue_ex_vat)} บ.</span>
                                        </span>
                                      </div>

                                      {job.installments.length > 0 && (
                                        <div className="mb-4">
                                          <div className="flex items-center justify-between text-xs mb-1.5">
                                            <span style={{ color: 'var(--text-3)' }}>
                                              <FileText size={10} className="inline mr-1" />การชำระเงิน ({job.installments.filter(i => i.status === 'paid').length}/{job.installments.length} งวด)
                                            </span>
                                            {/* fmt() prints "—" for zero, which read as
                                                "— / 8,000" on an unpaid room. Nothing is
                                                missing there; the amount paid is zero. */}
                                            <span style={{ color: pct === 100 ? 'var(--accent-green)' : 'var(--text-2)' }}>{paid.toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} / {fmt(total)} บ.</span>
                                          </div>
                                          <div className="h-1.5 rounded-full mb-2" style={{ background: 'var(--divider)' }}>
                                            <div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, background: pct === 100 ? 'var(--accent-green)' : 'var(--accent)' }} />
                                          </div>
                                          <div className="space-y-1">
                                            {job.installments.map(inst => (
                                              <div key={inst.id} className="flex items-center justify-between text-xs">
                                                <div className="flex items-center gap-1.5">
                                                  {inst.status === 'paid'
                                                    ? <CheckCircle size={10} style={{ color: 'var(--accent-green)' }} className="flex-shrink-0" />
                                                    : inst.status === 'overdue'
                                                    ? <AlertCircle size={10} style={{ color: 'var(--accent-red)' }} className="flex-shrink-0" />
                                                    : <Clock size={10} className="flex-shrink-0" style={{ color: 'var(--text-3)' }} />
                                                  }
                                                  <span style={{ color: 'var(--text-2)' }}>{inst.installment_name}</span>
                                                </div>
                                                <span style={{ color: inst.status === 'paid' ? 'var(--accent-green)' : inst.status === 'overdue' ? 'var(--accent-red)' : 'var(--text-2)' }}>
                                                  {fmt(inst.amount)} บ.
                                                </span>
                                              </div>
                                            ))}
                                          </div>
                                        </div>
                                      )}

                                      <div className="flex items-center justify-between text-xs pt-3" style={{ borderTop: '1px solid var(--divider)' }}>
                                        <span style={{ color: 'var(--text-3)' }}>ส่งมอบ</span>
                                        {/* handovers.work_status is constrained to English
                                            keys; the Thai label belongs on screen only. */}
                                        <span style={{ color: job.handover?.work_status === 'delivered' ? 'var(--accent-green)' : 'var(--text-2)' }}>
                                          {job.handover
                                            ? (({ delivered: 'ส่งมอบแล้ว', ready_to_deliver: 'รอส่งมอบ', in_progress: 'ดำเนินการ' } as Record<string, string>)[job.handover.work_status] || job.handover.work_status)
                                              + (job.handover.delivery_date ? ' · ' + job.handover.delivery_date.slice(0, 10) : '')
                                            : 'ยังไม่มีข้อมูลส่งมอบ'}
                                        </span>
                                      </div>

                                      {warranty && (
                                        <div className="flex items-center justify-between text-xs pt-2 mt-2" style={{ borderTop: '1px solid var(--divider)' }}>
                                          <span className="flex items-center gap-1" style={{ color: 'var(--text-3)' }}>
                                            <Shield size={10} />ประกัน {warranty.warranty_months || ''} เดือน
                                          </span>
                                          <span style={{ color: daysLeft !== null && daysLeft <= 0 ? 'var(--text-3)' : daysLeft !== null && daysLeft <= 30 ? 'var(--accent-amber)' : 'var(--accent-blue)' }}>
                                            {warranty.warranty_end?.slice(0, 10) || '—'}
                                            {daysLeft !== null && ' · ' + (daysLeft <= 0 ? 'หมดแล้ว' : `เหลือ ${daysLeft} วัน`)}
                                          </span>
                                        </div>
                                      )}
                                    </div>
                                  </td>
                                </tr>
                              )}
                            </Fragment>
                          )
                        })}
                      </tbody>
                    </table>
                  </div>
                )
              })()}
            </section>
          )}
        </div>
      </div>
    </div>
  )
}

// ── Main Page ───────────────────────────────────────────────────────────────
export default function CustomersPage() {
  const supabase = createClient()
  const [customers, setCustomers] = useState<Customer[]>([])
  const [projects, setProjects] = useState<Project[]>([])
  const [users, setUsers] = useState<User[]>([])
  const [loading, setLoading] = useState(true)
  const [open, setOpen] = useState(false)
  const [editing, setEditing] = useState<Customer | null>(null)
  const [form, setForm] = useState(emptyForm)
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState('')
  const [fetchError, setFetchError] = useState('')
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [filterStatus, setFilterStatus] = useState('')
  const [filterRepeat, setFilterRepeat] = useState(false)
  const [filterProject, setFilterProject] = useState('')
  const [detailCustomer, setDetailCustomer] = useState<Customer | null>(null)
  const [page, setPage] = useState(1)

  async function load() {
    setLoading(true)
    setFetchError('')
    const [
      { data: c, error: cErr },
      { data: p, error: pErr },
      { data: u, error: uErr },
    ] = await Promise.all([
      supabase.from('customers').select('id, customer_name, phone, email, line_id, source, project_id, interested_room, created_at, customer_type, projects(name), jobs(id, work_type, notes, revenue_inc_vat, working_status, room_no, crm_stage, customer_name, sales_id, sales:users!jobs_sales_id_fkey(name), payments(amount, paid_amount, status))').order('customer_name'),
      supabase.from('projects').select('id,name').eq('active', true).order('name'),
      supabase.from('users').select('id,name').eq('active', true).eq('role', 'sales').order('name'),
    ])
    if (cErr || pErr || uErr) {
      setFetchError((cErr ?? pErr ?? uErr)!.message)
      setLoading(false)
      return
    }
    setCustomers((c as any) || [])
    setProjects(p || [])
    setUsers(u || [])
    setLoading(false)
  }

  useEffect(() => { load() }, [])

  // One scheme for every customer — see lib/customerId.ts for why the room is
  // no longer part of the code.
  const genId = () => nextCustomerId(supabase)

  async function save() {
    if (!form.customer_name) return
    if (!form.project_id) { setSaveError('กรุณาเลือกโครงการ'); return }
    setSaving(true)
    setSaveError('')
    // work_type and notes describe the order, so they are written to the job,
    // not the customer row — the two columns were dropped from customers on
    // 2026-08-25. Everything else on this form describes the person.
    // status left out too: it is a job's stage, not a person's, and the column
    // is on its way out. A customer added here starts with a job at 'new'.
    const { work_type: formWorkType, notes: formNotes, ...customerFields } = form
    // assigned_to stays in the form (it is how you pick a seller) but is written
    // to jobs.sales_id below — the customers column is gone.
    const { assigned_to: _formSales, budget: _formBudget, ...personFields } = customerFields
    // budget moved to jobs.revenue_inc_vat — a customer can hold many rooms and
    // one budget column cannot say which room the number belongs to. Written to
    // the job below; the column stays until the reads are cleaned up.
    const revInc = Number(form.budget) || 0
    const revEx = revInc ? Math.round((revInc / 1.07) * 100) / 100 : 0
    const payload = {
      ...personFields,
      project_id: form.project_id || null,
    }
    if (editing) {
      const { error } = await supabase.from('customers').update(payload).eq('id', editing.id)
      if (error) { setSaveError(error.message); setSaving(false); return }
      // work_type still pushes to the job when the customer has exactly one.
      // notes no longer does — it is edited on the job, on every screen that
      // shows a job.
      const { data: theirJobs } = await supabase.from('jobs').select('id').eq('customer_id', editing.id)
      if (theirJobs && theirJobs.length === 1) {
        await supabase.from('jobs')
          .update({ work_type: formWorkType || null, revenue_inc_vat: revInc, revenue_ex_vat: revEx })
          .eq('id', (theirJobs[0] as { id: string }).id)
      }
      // The sales owner belongs to the job now — and unlike notes it applies to
      // all of them (option 1): re-assigning a customer re-assigns their book.
      if (form.assigned_to !== salesIdOf(editing)) {
        await supabase.from('jobs')
          .update({ sales_id: form.assigned_to || null }).eq('customer_id', editing.id)
      }
    } else {
      // ป้องกัน duplicate: ตรวจเบอร์โทรก่อน insert
      if (form.phone) {
        const { data: dup } = await supabase.from('customers')
          .select('id,customer_name').eq('phone', form.phone).maybeSingle()
        if (dup) {
          setSaveError(`เบอร์ ${form.phone} มีอยู่แล้วในระบบ — ลูกค้า: "${dup.customer_name}" (${dup.id})`)
          setSaving(false)
          return
        }
      }
      const newId = await genId()
      if (customers.some(c => c.id === newId)) {
        setSaveError(`ID "${newId}" มีอยู่แล้วในระบบ — กรุณาตรวจสอบโครงการและห้องอีกครั้ง`)
        setSaving(false)
        return
      }
      const { error } = await supabase.from('customers').insert({ id: newId, ...payload })
      if (error) { setSaveError(error.message); setSaving(false); return }
      // Open the job that goes with the customer. Without it the record is
      // invisible to the Prospect board, Project Summary and everything else
      // that counts jobs — which is how thirteen customers ended up stranded.
      await createProspectJob(supabase, {
        customerId: newId,
        customerName: cleanName(String(payload.customer_name || '')),
        projectId: (payload.project_id as string) || null,
        roomNo: (payload.interested_room as string) || null,
        workType: formWorkType || null,
        notes: null,
        salesId: form.assigned_to || null,
        crmStage: 'new',
        revenueIncVat: revInc,
      })
    }
    setSaving(false)
    setOpen(false)
    load()
  }

  async function deleteCustomer(c: Customer) {
    if (!await showConfirm(`ลบลูกค้า "${c.customer_name}" ?\nข้อมูลการชำระเงินที่เชื่อมกับลูกค้านี้จะถูกลบด้วย`)) return
    setDeletingId(c.id)
    await supabase.from('payments').delete().eq('customer_id', c.id)
    await supabase.from('customers').delete().eq('id', c.id)
    setDeletingId(null)
    if (detailCustomer?.id === c.id) setDetailCustomer(null)
    load()
  }

  const projectOptions = [{ value: '', label: '— เลือกโครงการ —' }, ...projects.map(p => ({ value: p.id, label: p.name }))]
  const userOptions = [{ value: '', label: '— เลือก Sales —' }, ...users.map(u => ({ value: u.id, label: u.name }))]


  // Reset to page 1 whenever filters change
  useEffect(() => { setPage(1) }, [search, filterStatus, filterProject])

  // Everything the search and project filters allow through, before the status
  // pills narrow it further. The pill counts come from here so they describe
  // what is actually on screen: the counts used to be taken from the full
  // customer list, so choosing a project left all seven numbers unchanged while
  // the table below showed a fraction of them. A pill cannot filter by its own
  // dimension, so status is applied after.
  const baseFiltered = customers.filter(c => {
    const q = search.toLowerCase()
    const qNorm = q.replace(/-/g, '')
    // Search the rooms they hold jobs in, not just the one they were filed
    // under — a repeat buyer's second room was unfindable by room number.
    const jobRooms = (((c as any).jobs as any[]) || []).map(j => String(j.room_no || '').replace(/-/g, '').toLowerCase())
    // Also the name written on the job. On eighteen jobs that is the resident,
    // while the customer record is the developer who hired us — Origin Place
    // Samut Prakan holds fourteen rooms under one company. Searching the
    // resident's name found nothing, which reads as "this job has no customer".
    const jobNames = (((c as any).jobs as any[]) || []).map(j => String(j.customer_name || '').toLowerCase())
    const matchSearch = !q || c.customer_name.toLowerCase().includes(q) || c.phone?.includes(q)
      || (c.interested_room?.replace(/-/g, '').toLowerCase() || '').includes(qNorm)
      || jobRooms.some(r => r.includes(qNorm))
      || jobNames.some(n => n.includes(q))
      || (c as any).projects?.name?.toLowerCase().includes(q)
    const matchProject = !filterProject || c.project_id === filterProject
    return matchSearch && matchProject
  })

  const repeatBuyers = baseFiltered.filter(c => tallyJobs(c).total > 1)
  const filtered = filterRepeat
    ? repeatBuyers
    : filterStatus ? baseFiltered.filter(c => summariseCustomer((c as any).jobs).kind === filterStatus) : baseFiltered

  const paginated = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE)

  return (
    <div className="page-content">
      {/* Header */}
      <PageHeader title="Customer Registry" subtitle="ทะเบียนลูกค้าทั้งหมด" />

      {/* Filters */}
      <FilterBar
        search={search}
        onSearchChange={setSearch}
        searchPlaceholder="ค้นหาชื่อ ห้อง โครงการ เบอร์..."
        searchLabel="ค้นหาลูกค้า"
        sticky
        className="mb-4"
      >
        <select
          value={filterProject}
          onChange={e => setFilterProject(e.target.value)}
          className="field-input"
          style={{ width: 'auto', maxWidth: '12rem' }}
        >
          <option value="">ทุกโครงการ</option>
          {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
        {(search || filterProject) && (
          <button onClick={() => { setSearch(''); setFilterProject('') }}
            className="text-xs px-2 py-1.5 rounded-[8px] transition-colors"
            style={{ color: 'var(--text-3)', background: 'var(--hover-bg)', border: '1px solid var(--divider)' }}>
            ล้าง
          </button>
        )}
      </FilterBar>

      {/* Status filter pills */}
      <div className="tab-group mb-4 flex-wrap">
        <button onClick={() => { setFilterStatus(''); setFilterRepeat(false) }}
          className={`tab-btn ${!filterStatus && !filterRepeat ? 'active' : ''}`}>
          ทั้งหมด {baseFiltered.length}
        </button>
        {CUSTOMER_KINDS.map(s => {
          const count = baseFiltered.filter(c => summariseCustomer((c as any).jobs).kind === s.value).length
          if (!count) return null
          return (
            <button key={s.value} onClick={() => { setFilterRepeat(false); setFilterStatus(filterStatus === s.value ? '' : s.value) }}
              className={`tab-btn ${!filterRepeat && filterStatus === s.value ? 'active' : ''}`}>
              {s.label} {count}
            </button>
          )
        })}
        {/* The register's own question, and the one the CRM stages cannot
            answer: who has bought from us more than once. */}
        {repeatBuyers.length > 0 && (
          <button onClick={() => { setFilterStatus(''); setFilterRepeat(v => !v) }}
            className={`tab-btn ${filterRepeat ? 'active' : ''}`}>
            ซื้อซ้ำ {repeatBuyers.length}
          </button>
        )}
      </div>

      {/* Table */}
      <div className="ds-card overflow-hidden tbl-scroll">
        <table className="w-full tbl-rows">
          <thead>
            <tr style={{ borderBottom: '1px solid var(--divider)' }}>
              <th scope="col" className="text-left text-card-title" style={{ color: 'var(--text-3)' }}>ลูกค้า</th>
              <th scope="col" className="text-left text-card-title" style={{ color: 'var(--text-3)' }}>ประเภท</th>
              <th scope="col" className="text-left text-card-title" style={{ color: 'var(--text-3)' }}>โครงการ / ห้อง</th>
              <th scope="col" className="text-left text-card-title" style={{ color: 'var(--text-3)' }}>งาน</th>
              <th scope="col" className="text-left text-card-title" style={{ color: 'var(--text-3)' }}>ช่องทาง</th>
              <th scope="col" className="text-left text-card-title" style={{ color: 'var(--text-3)' }}>Sales</th>
              <th scope="col" className="num num-money text-card-title" style={{ color: 'var(--text-3)' }}><span>มูลค่า / งบ</span></th>
              <th scope="col" className="num num-money text-card-title" style={{ color: 'var(--text-3)' }}><span>เก็บแล้ว</span></th>
              <th scope="col" className="text-left text-card-title" style={{ color: 'var(--text-3)' }}>สถานะ</th>
              <th scope="col" className="px-4 py-3"><span className="sr-only">แก้ไข</span></th>
            </tr>
          </thead>
          <tbody>
            {loading && <TableSpinner colSpan={10} />}
            {!loading && fetchError && <TableError colSpan={10} message={fetchError} onRetry={load} />}
            {!loading && !fetchError && paginated.length === 0 && (
              <TableEmpty colSpan={10} icon={Users} message="ไม่พบลูกค้า" sub={search ? 'ลองเปลี่ยนคำค้นหา' : undefined} />
            )}
            {paginated.map((c, i) => {
              const st = customerKind(summariseCustomer((c as any).jobs).kind)
              return (
                <tr
                  key={c.id}
                  className="transition-colors cursor-pointer"
                  style={{ background: detailCustomer?.id === c.id ? 'var(--active-bg)' : undefined }}
                  onClick={() => setDetailCustomer(detailCustomer?.id === c.id ? null : c)}
                >
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <div className="w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0" style={{ background: 'var(--divider)' }}>
                        <span className="text-xs font-semibold" style={{ color: 'var(--text-1)' }}>{c.customer_name[0]}</span>
                      </div>
                      <div>
                        <p className="text-body-strong flex items-center gap-1" style={{ color: 'var(--text-1)' }}>
                          {c.customer_name}
                          <ChevronRight size={12} style={{ color: 'var(--text-3)' }} />
                        </p>
                        <p className="text-xs font-mono" style={{ color: 'var(--text-3)' }}>{c.id}</p>
                      </div>
                    </div>
                  </td>
                  {/* Read-only. The row already opens the record and the edit
                      button is right there, so a control here only adds a way to
                      change a customer by mis-clicking while scanning the list. */}
                  <td className="px-4 py-3">
                    <span className="text-micro font-semibold px-1.5 py-0.5 rounded-[8px]"
                      style={{
                        background: (c as any).customer_type === 'B2B'
                          ? 'color-mix(in srgb, var(--accent-amber) 15%, transparent)'
                          : 'color-mix(in srgb, var(--accent-blue) 12%, transparent)',
                        color: (c as any).customer_type === 'B2B' ? 'var(--accent-amber)' : 'var(--accent-blue)',
                      }}>
                      {(c as any).customer_type || 'B2C'}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <p className="text-sm" style={{ color: 'var(--text-2)' }}>{(c as any).projects?.name || '-'}</p>
                    {(() => {
                      // The rooms they actually have jobs in, falling back to the
                      // room they were filed under. A customer with two orders in
                      // two rooms was showing only one of them.
                      const t = tallyJobs(c)
                      const rooms = t.rooms.length ? t.rooms : (c.interested_room ? [c.interested_room] : [])
                      if (!rooms.length) return null
                      // Merging the duplicate B2B records gave one developer 145
                      // rooms on a single row, and printing them all made that
                      // row about a thousand pixels tall. Past a handful the
                      // list is not what the column is for — the count is, and
                      // the drawer has the searchable table.
                      const shown = rooms.slice(0, 6)
                      const rest = rooms.length - shown.length
                      return (
                        <p className="text-xs" style={{ color: 'var(--accent)' }}>
                          ห้อง {shown.join(', ')}
                          {rest > 0 && <span style={{ color: 'var(--text-3)' }}> +อีก {rest} ห้อง</span>}
                        </p>
                      )
                    })()}
                  </td>
                  <td className="px-4 py-3">
                    {(() => {
                      const t = tallyJobs(c)
                      if (!t.total) return <span className="text-xs" style={{ color: 'var(--text-3)' }}>—</span>
                      const chips: [number, string, string][] = [
                        [t.prospect, 'Prospect', 'var(--text-3)'],
                        [t.booked, 'จอง', 'var(--accent-blue)'],
                        [t.working, 'กำลังทำ', 'var(--accent-amber)'],
                        [t.delivered, 'ส่งมอบ', 'var(--accent-green)'],
                        [t.cancelled, 'ยกเลิก', 'var(--accent-red)'],
                      ]
                      // Number on its own line, chips always beneath it. Letting
                      // them wrap put the first chip beside the number and the
                      // rest below, so the column read differently row by row
                      // depending on how many states a customer happened to have.
                      return (
                        <div className="flex flex-col gap-1 items-start">
                          <span className="text-sm font-semibold tabular-nums" style={{ color: 'var(--text-1)' }}>{t.total}</span>
                          <div className="flex gap-1 flex-wrap">
                            {chips.filter(([n]) => n > 0).map(([n, label, color]) => (
                              <span key={label} className="text-micro font-semibold px-1.5 py-0.5 rounded-[8px] whitespace-nowrap"
                                style={{ background: `color-mix(in srgb, ${color} 12%, transparent)`, color }}>
                                {label} {n}
                              </span>
                            ))}
                          </div>
                        </div>
                      )
                    })()}
                  </td>
                  <td className=" text-sm capitalize" style={{ color: 'var(--text-2)' }}>{c.source || '-'}</td>
                  <td className=" text-sm" style={{ color: 'var(--text-2)' }}>{salesOf(c).join(' · ') || '-'}</td>
                  {(() => {
                    const cJobs: any[] = (c as any).jobs || []
                    const jobRev = cJobs.reduce((s: number, j: any) => s + (j.revenue_inc_vat || 0), 0)
                    // "ประมาณ" now means: a prospect job whose value is the
                    // sales estimate rather than a signed number.
                    const isBudget = jobRev > 0 && summariseCustomer((c as any).jobs).kind === 'prospect'
                    const totalRev = jobRev
                    const totalPaid = cJobs.reduce((s: number, j: any) =>
                      s + ((j.payments || []) as any[]).filter((p: any) => p.status === 'paid').reduce((ps: number, p: any) => ps + (p.paid_amount ?? p.amount ?? 0), 0), 0)
                    return (
                      <>
                        <td className=" num num-money tabular-nums">
                          {totalRev > 0 ? (
                            <div className="flex items-center justify-end gap-1.5">
                              {isBudget && (
                                <span className="text-micro font-semibold px-1.5 py-0.5 rounded-[8px]"
                                  style={{ background: 'color-mix(in srgb, var(--accent-amber) 12%, transparent)', color: 'var(--accent-amber)', border: '1px solid color-mix(in srgb, var(--accent-amber) 30%, transparent)' }}>
                                  งบ
                                </span>
                              )}
                              <span className="text-sm font-semibold" style={{ color: isBudget ? 'var(--text-2)' : 'var(--text-1)' }}>{fmt(totalRev)}</span>
                            </div>
                          ) : <span className="text-sm font-semibold" style={{ color: 'var(--text-3)' }}>—</span>}
                        </td>
                        <td className=" num num-money text-sm font-semibold tabular-nums" style={{ color: totalPaid > 0 ? 'var(--accent-green)' : 'var(--text-3)' }}>
                          <span>{totalPaid > 0 ? fmt(totalPaid) : '—'}</span>
                        </td>
                      </>
                    )
                  })()}
                  <td className="px-4 py-3">
                    <span className={st.badge}>
                      <span aria-hidden="true">{st.icon}</span>{st.label}
                    </span>
                  </td>
                  <td className="px-4 py-3" onClick={e => e.stopPropagation()}>
                    <div className="flex items-center gap-2">
                      <button onClick={() => {
                        setEditing(c)
                        setForm({ customer_name: c.customer_name, phone: c.phone, email: c.email, line_id: c.line_id, source: c.source, project_id: c.project_id, interested_room: c.interested_room, budget: ((c as any).jobs?.[0]?.revenue_inc_vat) || 0, assigned_to: salesIdOf(c), notes: jobField(c, 'notes'), customer_type: (c as any).customer_type || 'B2C', work_type: jobField(c, 'work_type') })
                        setOpen(true)
                      }} className="transition-colors" style={{ color: 'var(--text-2)' }}>
                        <Pencil size={14} />
                      </button>
                      <button
                        onClick={() => deleteCustomer(c)}
                        disabled={deletingId === c.id}
                        className="transition-colors disabled:opacity-40"
                        onMouseEnter={e => (e.currentTarget as HTMLButtonElement).style.color = 'var(--accent-red)'}
                        onMouseLeave={e => (e.currentTarget as HTMLButtonElement).style.color = 'var(--text-2)'}
                        style={{ color: 'var(--text-2)' }}
                        title="ลบลูกค้า"
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
        {!loading && (
          <Pagination page={page} setPage={setPage} total={filtered.length} pageSize={PAGE_SIZE}
            unit="ราย" grandTotal={customers.length} />
        )}
      </div>

      {/* Edit / Add Modal */}
      <Modal open={open} onClose={() => setOpen(false)} title={editing ? 'แก้ไขข้อมูลลูกค้า' : 'เพิ่มลูกค้าใหม่'} size="lg">
        {saveError && (
          <div role="alert" className="flex items-center gap-2 mb-4 p-3 rounded-[18px] text-xs" style={{ background: 'color-mix(in srgb, var(--accent-red) 12%, transparent)', color: 'var(--accent-red)' }}>
            <AlertCircle size={14} aria-hidden="true" />{saveError}
          </div>
        )}
        <div className="grid grid-cols-2 gap-4">
          <div className="col-span-2">
            <Input label="ชื่อ-นามสกุล" required value={form.customer_name} onChange={e => setForm({ ...form, customer_name: e.target.value })} placeholder="ชื่อ-นามสกุล" />
          </div>
          <Input label="เบอร์โทร" type="tel" value={form.phone} onChange={e => setForm({ ...form, phone: e.target.value })} placeholder="08x-xxx-xxxx" />
          <Input label="LINE ID" value={form.line_id} onChange={e => setForm({ ...form, line_id: e.target.value })} placeholder="@lineid" />
          <div className="col-span-2">
            <Input label="Email" type="email" value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} placeholder="email@example.com" />
          </div>
          <Select label="โครงการที่สนใจ *" value={form.project_id} onChange={e => setForm({ ...form, project_id: e.target.value })} options={projectOptions} />
          <Input label="ห้องที่สนใจ" value={form.interested_room} onChange={e => setForm({ ...form, interested_room: e.target.value })} placeholder="เช่น Z-905" />
          {/* The code the record is about to get used to be previewed here. It
              could be, because it was built from the project and room on this
              very form; a CST- number comes from the database instead and is
              not known until save. Nothing is lost — the code is an internal
              handle, and the drawer shows it once the record exists. */}
          <div>
            <label className="field-label">ประเภทลูกค้า</label>
            <div className="flex gap-2 mt-1">
              {(['B2C', 'B2B'] as const).map(t => (
                <button key={t} type="button"
                  onClick={() => setForm({ ...form, customer_type: t })}
                  className="flex-1 py-2 rounded-[8px] text-sm font-semibold transition-colors"
                  style={{ background: form.customer_type === t ? 'var(--accent)' : 'var(--hover-bg)', color: form.customer_type === t ? '#fff' : 'var(--text-2)' }}>
                  {t}
                </button>
              ))}
            </div>
          </div>
          <div>
            <label className="field-label">ประเภทงาน</label>
            <select value={form.work_type} onChange={e => setForm({ ...form, work_type: e.target.value })} className="field-input w-full mt-1">
              <option value="">— เลือก —</option>
              {WORK_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
            </select>
          </div>
          <Select label="ช่องทาง" value={form.source} onChange={e => setForm({ ...form, source: e.target.value })} options={SOURCE_OPTIONS} />
          <MoneyField label="มูลค่างาน (บาท)" value={form.budget ? String(form.budget) : ''}
            onChange={v => setForm({ ...form, budget: Number(v) || 0 })} />
          {/* No status field. A customer has no stage of their own — the stage
              belongs to each job and is moved from the Prospects card. */}
          <Select label="มอบหมายให้ Sales" value={form.assigned_to} onChange={e => setForm({ ...form, assigned_to: e.target.value })} options={userOptions} />
          <div className="col-span-2">
            {/* No หมายเหตุ here. A note is about an order, not a person: this
                form could only write it when the customer had exactly one job,
                so anyone with two rooms typed a note that was silently dropped.
                It is edited on the job itself — Prospects, My Deals, Job
                Registry — where it is always clear which room it belongs to. */}
          </div>
        </div>
        <div className="flex justify-end gap-3 mt-5">
          <button onClick={() => setOpen(false)} className="px-4 py-2 text-sm transition-colors" style={{ color: 'var(--text-3)' }}>ยกเลิก</button>
          <button onClick={save} disabled={saving || !form.customer_name}
            className="px-4 py-2 text-white text-sm rounded-[8px] transition-colors disabled:opacity-50"
            style={{ background: 'var(--accent-green)' }}>
            {saving ? 'กำลังบันทึก...' : 'บันทึก'}
          </button>
        </div>
      </Modal>

      {/* Customer Detail Drawer */}
      {detailCustomer && (
        <CustomerDetail
          customer={detailCustomer}
          projects={projects}
          onClose={() => setDetailCustomer(null)}
          onEdit={() => {
            // Close the drawer as the edit form opens. Without this the form
            // appeared behind the drawer, and the only way to reach it was to
            // dismiss the drawer by hand — the button looked like it had done
            // nothing.
            setDetailCustomer(null)
            setEditing(detailCustomer)
            setForm({
              customer_name: detailCustomer.customer_name,
              phone: detailCustomer.phone,
              email: detailCustomer.email,
              line_id: detailCustomer.line_id,
              source: detailCustomer.source,
              project_id: detailCustomer.project_id,
              interested_room: detailCustomer.interested_room,
              // Seed from the job, not the customer — same reason as the save.
              budget: ((detailCustomer as any).jobs?.[0]?.revenue_inc_vat) || 0,
              assigned_to: salesIdOf(detailCustomer),
              notes: jobField(detailCustomer, 'notes'),
              customer_type: (detailCustomer as any).customer_type || 'B2C',
              work_type: jobField(detailCustomer, 'work_type'),
            })
            setOpen(true)
          }}
        />
      )}
    </div>
  )
}
