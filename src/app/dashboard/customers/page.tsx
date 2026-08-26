'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
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
import { CRM_STAGES, crmStage, isProspectStage, WORK_TYPES } from '@/lib/status'
import { Input, Select, TextArea } from '@/components/ui/Input'
import { createProspectJob } from '@/lib/prospectJob'
import { showConfirm } from '@/components/ui/dialog'

interface Customer {
  id: string
  customer_name: string
  phone: string
  email: string
  line_id: string
  source: string
  project_id: string
  interested_room: string
  budget: number
  status: string
  assigned_to: string
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
  voucher: number
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
  status: 'new', assigned_to: '', notes: '',
  customer_type: 'B2C', work_type: '',
}

const statusInfo = crmStage

/** work_type and notes now live on the job — both columns were dropped from
 *  customers on 2026-08-25. A customer usually holds one job; take the first
 *  that carries a value so the drawer and the edit form still show it. */
const jobField = (c: any, f: 'work_type' | 'notes'): string =>
  (((c as any)?.jobs as any[]) || []).find(j => j?.[f])?.[f] || ''

function fmt(n: number) {
  return n ? n.toLocaleString('th-TH') : '—'
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
  t.rooms = [...rooms]
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
  const st = statusInfo(customer.status)

  useEffect(() => {
    let cancelled = false
    async function fetchDetail() {
      setLoading(true)

      const [{ data: jobsRaw }, { data: warrantiesRaw }] = await Promise.all([
        supabase
          .from('jobs')
          .select('id, po_no, so_no, room_no, work_type, package_type, order_date, revenue_ex_vat, revenue_inc_vat, voucher, working_status, customer_name')
          .eq('customer_id', customer.id)
          .order('order_date', { ascending: false }),
        supabase
          .from('warranties')
          .select('id, warranty_start, warranty_end, warranty_months, status, room, handover_date, notes')
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
              <p className="text-xs font-mono mt-0.5" style={{ color: 'var(--text-3)' }}>{customer.id}</p>
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
            <div className="ds-card p-4 grid grid-cols-2 gap-3">
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
                  const val = jobRev || customer.budget || 0
                  return <span className="text-sm font-semibold" style={{ color: val > 0 ? 'var(--accent-green)' : 'var(--text-2)' }}>
                    {val > 0 ? fmt(val) + ' บ.' : '—'}
                  </span>
                })()}
              </div>
              <div className="flex items-center gap-2">
                <Users size={13} style={{ color: 'var(--text-3)' }} />
                <span className="text-sm" style={{ color: 'var(--text-2)' }}>{(customer as any).users?.name || '—'}</span>
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
                  <div className="ds-card p-4 grid grid-cols-3 gap-3">
                    <div>
                      <p className="text-micro" style={{ color: 'var(--text-3)' }}>ซื้อทั้งหมด</p>
                      <p className="text-base font-bold tabular-nums" style={{ color: 'var(--text-1)' }}>{jobs.length} งาน</p>
                      <p className="text-micro mt-0.5" style={{ color: 'var(--text-3)' }}>
                        ส่งมอบแล้ว {delivered}{cancelled > 0 ? ` · ยกเลิก ${cancelled}` : ''}
                      </p>
                    </div>
                    <div>
                      <p className="text-micro" style={{ color: 'var(--text-3)' }}>มูลค่ารวม</p>
                      <p className="text-base font-bold tabular-nums" style={{ color: 'var(--text-1)' }}>{fmt(revenue)}</p>
                      <p className="text-micro mt-0.5" style={{ color: 'var(--text-3)' }}>ไม่รวมงานที่ยกเลิก</p>
                    </div>
                    <div>
                      <p className="text-micro" style={{ color: 'var(--text-3)' }}>เก็บแล้ว</p>
                      <p className="text-base font-bold tabular-nums" style={{ color: paid > 0 ? 'var(--accent-green)' : 'var(--text-3)' }}>{fmt(paid)}</p>
                      <p className="text-micro mt-0.5" style={{ color: 'var(--text-3)' }}>
                        {revenue > 0 ? `${Math.round((paid / revenue) * 100)}% ของมูลค่า` : '—'}
                      </p>
                    </div>
                  </div>
                )
              })()}
            </section>
          )}

          {!loading && (
            <>
              {/* Journey Timeline */}
              <section>
                <p className="text-xs font-semibold uppercase tracking-wider mb-3" style={{ color: 'var(--text-3)' }}>Journey</p>
                <div className="relative pl-5">
                  {/* vertical line */}
                  <div className="absolute left-1.5 top-2 bottom-2 w-px" style={{ background: 'var(--divider)' }} />

                  {/* Step: Booked / Status */}
                  {(() => {
                    const isBooked = ['booked','close_pending','closed'].includes(customer.status)
                    const st = statusInfo(customer.status)
                    return (
                      <div className="relative mb-3 flex items-start gap-3">
                        <div className="w-3 h-3 rounded-full flex-shrink-0 mt-0.5 border-2" style={{ background: isBooked ? 'var(--accent-orange)' : 'var(--divider)', borderColor: isBooked ? 'var(--accent-orange)' : 'var(--text-3)' }} />
                        <div>
                          <p className="text-xs font-semibold" style={{ color: isBooked ? 'var(--accent-orange)' : 'var(--text-3)' }}>
                            {isBooked ? '★ Booked' : `สถานะ: ${st.label}`}
                          </p>
                          {customer.status === 'lost' && <p className="text-micro" style={{ color: 'var(--accent-red)' }}>หลุดแล้ว</p>}
                        </div>
                      </div>
                    )
                  })()}

                  {/* Steps: per job */}
                  {jobs.length === 0 ? (
                    <div className="relative mb-3 flex items-start gap-3">
                      <div className="w-3 h-3 rounded-full flex-shrink-0 mt-0.5 border-2" style={{ background: 'var(--divider)', borderColor: 'var(--text-3)' }} />
                      <p className="text-xs" style={{ color: 'var(--text-3)' }}>ยังไม่แปลงเป็น Job</p>
                    </div>
                  ) : jobs.map(job => {
                    const paidCount = job.installments.filter(i => i.status === 'paid').length
                    const totalCount = job.installments.length
                    const isDelivered = job.working_status === 'ส่งมอบแล้ว'
                    const warranty = warranties.find(w => w.room === (job as any).room_no)
                    const warrantDaysLeft = warranty?.warranty_end ? Math.floor((new Date(warranty.warranty_end).getTime() - Date.now()) / 864e5) : null

                    return (
                      <div key={job.id}>
                        {/* สั่งงาน */}
                        <div className="relative mb-3 flex items-start gap-3">
                          <div className="w-3 h-3 rounded-full flex-shrink-0 mt-0.5" style={{ background: 'var(--accent)' }} />
                          <div>
                            <p className="text-xs font-semibold" style={{ color: 'var(--accent-purple)' }}>📋 สั่งงาน</p>
                            <p className="text-micro" style={{ color: 'var(--text-3)' }}>
                              {job.room_no && <span className="font-mono mr-1" style={{ color: 'var(--accent)' }}>ห้อง {job.room_no}</span>}
                              {job.work_type} · {job.order_date?.slice(0, 10) || '—'} · {fmt(job.revenue_ex_vat)} บ.
                            </p>
                            {/* Eighteen jobs carry a different name from their
                                customer: the record is the developer who hired
                                us, the job is the resident of that room. Showing
                                it is the difference between "this job has no
                                customer" and "this room belongs to that
                                company". Not a mismatch to fix — see
                                lib/ownership.ts on customer_name. */}
                            {job.customer_name && job.customer_name.trim() !== customer.customer_name.trim() && (
                              <p className="text-micro mt-0.5" style={{ color: 'var(--text-2)' }}>
                                ผู้อยู่อาศัย: {job.customer_name}
                              </p>
                            )}
                          </div>
                        </div>

                        {/* งวดชำระ */}
                        {totalCount > 0 && (
                          <div className="relative mb-3 flex items-start gap-3">
                            <div className="w-3 h-3 rounded-full flex-shrink-0 mt-0.5" style={{ background: paidCount === totalCount ? 'var(--accent-green)' : 'var(--accent-amber)' }} />
                            <div>
                              <p className="text-xs font-semibold" style={{ color: paidCount === totalCount ? 'var(--accent-green)' : 'var(--accent-amber)' }}>
                                💰 ชำระ {paidCount}/{totalCount} งวด
                              </p>
                              <p className="text-micro" style={{ color: 'var(--text-3)' }}>
                                {fmt(job.installments.filter(i => i.status === 'paid').reduce((s, i) => s + i.amount, 0))} / {fmt(job.installments.reduce((s, i) => s + i.amount, 0))} บ.
                              </p>
                            </div>
                          </div>
                        )}

                        {/* ส่งมอบ */}
                        <div className="relative mb-3 flex items-start gap-3">
                          <div className="w-3 h-3 rounded-full flex-shrink-0 mt-0.5 border-2" style={{ background: isDelivered ? 'var(--accent-green)' : 'var(--divider)', borderColor: isDelivered ? 'var(--accent-green)' : 'var(--text-3)' }} />
                          <div>
                            <p className="text-xs font-semibold" style={{ color: isDelivered ? 'var(--accent-green)' : 'var(--text-3)' }}>
                              {isDelivered ? '✅ ส่งมอบแล้ว' : '○ รอส่งมอบ'}
                            </p>
                            {isDelivered && job.handover?.delivery_date && (
                              <p className="text-micro" style={{ color: 'var(--text-3)' }}>{job.handover.delivery_date.slice(0, 10)}</p>
                            )}
                          </div>
                        </div>

                        {/* ประกัน */}
                        {warranty && (
                          <div className="relative mb-3 flex items-start gap-3">
                            <div className="w-3 h-3 rounded-full flex-shrink-0 mt-0.5" style={{ background: warrantDaysLeft !== null && warrantDaysLeft <= 0 ? 'var(--text-3)' : warrantDaysLeft !== null && warrantDaysLeft <= 30 ? 'var(--accent-amber)' : 'var(--accent-blue)' }} />
                            <div>
                              <p className="text-xs font-semibold" style={{ color: warrantDaysLeft !== null && warrantDaysLeft <= 0 ? 'var(--text-3)' : 'var(--accent-blue)' }}>
                                🛡️ ประกัน {warranty.warranty_months || ''} เดือน
                              </p>
                              <p className="text-micro" style={{ color: 'var(--text-3)' }}>
                                {warranty.warranty_end?.slice(0, 10)} · {warrantDaysLeft !== null ? (warrantDaysLeft <= 0 ? 'หมดแล้ว' : `เหลือ ${warrantDaysLeft} วัน`) : ''}
                              </p>
                            </div>
                          </div>
                        )}
                      </div>
                    )
                  })}
                </div>
              </section>

              {/* Jobs */}
              <section>
                <p className="text-xs font-semibold uppercase tracking-wider mb-2 flex items-center gap-1.5" style={{ color: 'var(--text-3)' }}>
                  <Briefcase size={12} />งาน ({jobs.length})
                </p>
                {jobs.length === 0 ? (
                  <p className="text-xs px-3 py-4 rounded-[11px] text-center" style={{ background: 'var(--card-bg)', border: '1px solid var(--card-border)', color: 'var(--text-3)' }}>
                    ยังไม่มีงาน
                  </p>
                ) : jobs.map(job => {
                  const paid = job.installments.filter(i => i.status === 'paid').reduce((s, i) => s + ((i as any).paid_amount ?? i.amount), 0)
                  const total = job.installments.reduce((s, i) => s + i.amount, 0)
                  const pct = total > 0 ? Math.round(paid / total * 100) : 0
                  return (
                    <div key={job.id} className="ds-card p-4 mb-3">
                      {/* Job header */}
                      <div className="flex items-start justify-between mb-3">
                        <div>
                          {job.room_no && <p className="text-sm font-semibold font-mono mb-0.5" style={{ color: 'var(--accent)' }}>ห้อง {job.room_no}</p>}
                          <p className="text-xs" style={{ color: 'var(--text-3)' }}>{job.work_type || '—'} · {job.package_type || '—'}</p>
                        </div>
                        <span className="text-xs px-2 py-0.5 rounded-[4px] font-semibold" style={{
                          background: job.working_status === 'ส่งมอบแล้ว' ? 'color-mix(in srgb, var(--accent-green) 15%, transparent)' : 'var(--hover-bg)',
                          color: job.working_status === 'ส่งมอบแล้ว' ? 'var(--accent-green)' : 'var(--text-2)',
                        }}>{job.working_status || 'ดำเนินการ'}</span>
                      </div>

                      {/* PO / SO / Date / Voucher */}
                      <div className="grid grid-cols-2 gap-2 mb-3">
                        {[
                          { label: 'PO No.', value: job.po_no || '—' },
                          { label: 'SO No.', value: job.so_no || '—' },
                          { label: 'วันที่รับ PO', value: job.order_date?.slice(0, 10) || '—' },
                          { label: 'Voucher', value: job.voucher ? fmt(job.voucher) + ' บ.' : '—' },
                        ].map(f => (
                          <div key={f.label} className="px-2 py-1.5 rounded-lg" style={{ background: 'var(--hover-bg)' }}>
                            <p className="text-micro uppercase tracking-wider" style={{ color: 'var(--text-3)' }}>{f.label}</p>
                            <p className="text-xs font-semibold mt-0.5" style={{ color: 'var(--text-1)' }}>{f.value}</p>
                          </div>
                        ))}
                      </div>

                      {/* Revenue */}
                      <div className="flex items-center justify-between text-xs mb-3">
                        <span style={{ color: 'var(--text-3)' }}>Revenue (excl. VAT)</span>
                        <span className="font-semibold" style={{ color: 'var(--text-1)' }}>{fmt(job.revenue_ex_vat)} บ.</span>
                      </div>

                      {/* Payment progress */}
                      {job.installments.length > 0 && (
                        <div>
                          <div className="flex items-center justify-between text-xs mb-1.5">
                            <span style={{ color: 'var(--text-3)' }}>
                              <FileText size={10} className="inline mr-1" />การชำระเงิน ({job.installments.filter(i => i.status === 'paid').length}/{job.installments.length} งวด)
                            </span>
                            <span style={{ color: pct === 100 ? 'var(--accent-green)' : 'var(--text-2)' }}>{pct}%</span>
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

                      {/* Handover */}
                      {job.handover && (
                        <div className="mt-3 pt-3 flex items-center justify-between text-xs" style={{ borderTop: '1px solid var(--divider)' }}>
                          <span style={{ color: 'var(--text-3)' }}>ส่งมอบ</span>
                          {/* handovers.work_status is constrained to English
                              keys; the Thai label belongs on screen only. */}
                          <span style={{ color: job.handover.work_status === 'delivered' ? 'var(--accent-green)' : 'var(--text-2)' }}>
                            {({ delivered: 'ส่งมอบแล้ว', ready_to_deliver: 'รอส่งมอบ', in_progress: 'ดำเนินการ' } as Record<string,string>)[job.handover.work_status] || job.handover.work_status}
                            {job.handover.delivery_date ? ' · ' + job.handover.delivery_date.slice(0, 10) : ''}
                          </span>
                        </div>
                      )}
                    </div>
                  )
                })}
              </section>

              {/* Warranty */}
              {warranties.length > 0 && (
                <section>
                  <p className="text-xs font-semibold uppercase tracking-wider mb-2 flex items-center gap-1.5" style={{ color: 'var(--text-3)' }}>
                    <Shield size={12} />ประกัน ({warranties.length})
                  </p>
                  {warranties.map(w => (
                    <div key={w.id} className="ds-card p-4 mb-2">
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-sm font-mono" style={{ color: 'var(--accent)' }}>ห้อง {w.room}</span>
                        <span className={`badge ${w.status === 'active' ? 'badge-green' : w.status === 'expiring_soon' ? 'badge-orange' : 'badge-gray'}`}>
                          {w.status === 'active' ? 'ยังอยู่ในประกัน' : w.status === 'expiring_soon' ? 'ใกล้หมด' : 'หมดแล้ว'}
                        </span>
                      </div>
                      <div className="grid grid-cols-2 gap-1 text-xs">
                        <span style={{ color: 'var(--text-3)' }}>เริ่ม</span>
                        <span style={{ color: 'var(--text-2)' }}>{w.warranty_start?.slice(0, 10) || '—'}</span>
                        <span style={{ color: 'var(--text-3)' }}>สิ้นสุด</span>
                        <span style={{ color: 'var(--text-2)' }}>{w.warranty_end?.slice(0, 10) || '—'}</span>
                        <span style={{ color: 'var(--text-3)' }}>ระยะ</span>
                        <span style={{ color: 'var(--text-2)' }}>{w.warranty_months} เดือน</span>
                      </div>
                      {w.notes && <p className="text-xs mt-2" style={{ color: 'var(--text-3)' }}>{w.notes}</p>}
                    </div>
                  ))}
                </section>
              )}
            </>
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
      supabase.from('customers').select('id, customer_name, phone, email, line_id, source, project_id, interested_room, budget, status, assigned_to, created_at, customer_type, projects(name), users!assigned_to(name), jobs(id, work_type, notes, revenue_inc_vat, working_status, room_no, crm_stage, customer_name, payments(amount, paid_amount, status))').order('customer_name'),
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

  function genId() {
    if (form.project_id && form.interested_room.trim()) {
      return `${form.project_id}-${form.interested_room.trim().toUpperCase()}`
    }
    const nums = customers.map(c => parseInt(c.id.replace('CST-', ''))).filter(n => !isNaN(n))
    return 'CST-' + String(nums.length > 0 ? Math.max(...nums) + 1 : 1).padStart(4, '0')
  }

  async function save() {
    if (!form.customer_name) return
    if (!form.project_id) { setSaveError('กรุณาเลือกโครงการ'); return }
    setSaving(true)
    setSaveError('')
    // work_type and notes describe the order, so they are written to the job,
    // not the customer row — the two columns were dropped from customers on
    // 2026-08-25. Everything else on this form describes the person.
    const { work_type: formWorkType, notes: formNotes, ...customerFields } = form
    const payload = {
      ...customerFields,
      project_id: form.project_id || null,
      assigned_to: form.assigned_to || null,
    }
    if (editing) {
      const { error } = await supabase.from('customers').update(payload).eq('id', editing.id)
      if (error) { setSaveError(error.message); setSaving(false); return }
      // Push to the job when the customer has exactly one. With several there is
      // no way to tell which order the note is about, so those are edited on the
      // job itself from Prospects or Data Entry.
      const { data: theirJobs } = await supabase.from('jobs').select('id').eq('customer_id', editing.id)
      if (theirJobs && theirJobs.length === 1) {
        await supabase.from('jobs')
          .update({ work_type: formWorkType || null, notes: formNotes || null })
          .eq('id', (theirJobs[0] as { id: string }).id)
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
      const newId = genId()
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
        customerName: String(payload.customer_name || ''),
        projectId: (payload.project_id as string) || null,
        roomNo: (payload.interested_room as string) || null,
        workType: formWorkType || null,
        notes: formNotes || null,
        salesId: (payload.assigned_to as string) || null,
        crmStage: String(payload.status || 'new'),
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
    : filterStatus ? baseFiltered.filter(c => c.status === filterStatus) : baseFiltered

  const paginated = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE)

  return (
    <div className="page-content">
      {/* Header */}
      <PageHeader title="Customers" subtitle="รายชื่อลูกค้าและ Pipeline การขาย" />

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
        {STATUS_LIST.map(s => {
          const count = baseFiltered.filter(c => c.status === s.value).length
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
        <table className="w-full">
          <thead>
            <tr style={{ borderBottom: '1px solid var(--divider)' }}>
              <th scope="col" className="text-left px-4 py-3 text-card-title" style={{ color: 'var(--text-3)' }}>ลูกค้า</th>
              <th scope="col" className="text-left px-4 py-3 text-card-title" style={{ color: 'var(--text-3)' }}>ประเภท</th>
              <th scope="col" className="text-left px-4 py-3 text-card-title" style={{ color: 'var(--text-3)' }}>โครงการ / ห้อง</th>
              <th scope="col" className="text-left px-4 py-3 text-card-title" style={{ color: 'var(--text-3)' }}>งาน</th>
              <th scope="col" className="text-left px-4 py-3 text-card-title" style={{ color: 'var(--text-3)' }}>ช่องทาง</th>
              <th scope="col" className="text-left px-4 py-3 text-card-title" style={{ color: 'var(--text-3)' }}>Sales</th>
              <th scope="col" className="text-right px-4 py-3 text-card-title" style={{ color: 'var(--text-3)' }}>มูลค่า / งบ</th>
              <th scope="col" className="text-right px-4 py-3 text-card-title" style={{ color: 'var(--text-3)' }}>เก็บแล้ว</th>
              <th scope="col" className="text-left px-4 py-3 text-card-title" style={{ color: 'var(--text-3)' }}>สถานะ</th>
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
              const st = statusInfo(c.status)
              return (
                <tr
                  key={c.id}
                  className="transition-colors cursor-pointer"
                  style={{ borderBottom: '1px solid var(--divider)', background: detailCustomer?.id === c.id ? 'var(--active-bg)' : i % 2 !== 0 ? 'var(--hover-bg)' : undefined }}
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
                    <span className="text-micro font-semibold px-1.5 py-0.5 rounded-[4px]"
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
                      return <p className="text-xs" style={{ color: 'var(--accent)' }}>ห้อง {rooms.join(', ')}</p>
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
                              <span key={label} className="text-micro font-semibold px-1.5 py-0.5 rounded-[4px] whitespace-nowrap"
                                style={{ background: `color-mix(in srgb, ${color} 12%, transparent)`, color }}>
                                {label} {n}
                              </span>
                            ))}
                          </div>
                        </div>
                      )
                    })()}
                  </td>
                  <td className="px-4 py-3 text-sm capitalize" style={{ color: 'var(--text-2)' }}>{c.source || '-'}</td>
                  <td className="px-4 py-3 text-sm" style={{ color: 'var(--text-2)' }}>{(c as any).users?.name || '-'}</td>
                  {(() => {
                    const cJobs: any[] = (c as any).jobs || []
                    const jobRev = cJobs.reduce((s: number, j: any) => s + (j.revenue_inc_vat || 0), 0)
                    const isBudget = jobRev === 0 && (c.budget || 0) > 0 && isProspectStage(c.status)
                    const totalRev = jobRev || c.budget || 0
                    const totalPaid = cJobs.reduce((s: number, j: any) =>
                      s + ((j.payments || []) as any[]).filter((p: any) => p.status === 'paid').reduce((ps: number, p: any) => ps + (p.paid_amount ?? p.amount ?? 0), 0), 0)
                    return (
                      <>
                        <td className="px-4 py-3 text-right tabular-nums">
                          {totalRev > 0 ? (
                            <div className="flex items-center justify-end gap-1.5">
                              {isBudget && (
                                <span className="text-micro font-semibold px-1.5 py-0.5 rounded-[4px]"
                                  style={{ background: 'color-mix(in srgb, var(--accent-amber) 12%, transparent)', color: 'var(--accent-amber)', border: '1px solid color-mix(in srgb, var(--accent-amber) 30%, transparent)' }}>
                                  งบ
                                </span>
                              )}
                              <span className="text-sm font-semibold" style={{ color: isBudget ? 'var(--text-2)' : 'var(--text-1)' }}>{fmt(totalRev)}</span>
                            </div>
                          ) : <span className="text-sm font-semibold" style={{ color: 'var(--text-3)' }}>—</span>}
                        </td>
                        <td className="px-4 py-3 text-right text-sm font-semibold tabular-nums" style={{ color: totalPaid > 0 ? 'var(--accent-green)' : 'var(--text-3)' }}>
                          {totalPaid > 0 ? fmt(totalPaid) : '—'}
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
                        setForm({ customer_name: c.customer_name, phone: c.phone, email: c.email, line_id: c.line_id, source: c.source, project_id: c.project_id, interested_room: c.interested_room, budget: c.budget, status: c.status, assigned_to: c.assigned_to, notes: jobField(c, 'notes'), customer_type: (c as any).customer_type || 'B2C', work_type: jobField(c, 'work_type') })
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
          {!editing && form.project_id && form.interested_room.trim() && (
            <div className="col-span-2 flex items-center gap-2 px-3 py-2 rounded-[18px] text-xs" style={{ background: 'var(--hover-bg)', border: '1px solid var(--divider)' }}>
              <span style={{ color: 'var(--text-3)' }}>Customer ID ที่จะถูกสร้าง:</span>
              <span className="font-mono font-bold" style={{ color: 'var(--accent)' }}>{form.project_id}-{form.interested_room.trim().toUpperCase()}</span>
            </div>
          )}
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
          <Input label="งบประมาณ (บาท)" type="number" min={0} step={1000} value={form.budget} onChange={e => setForm({ ...form, budget: Number(e.target.value) })} />
          <Select label="สถานะ" value={form.status} onChange={e => setForm({ ...form, status: e.target.value })}
            options={STATUS_LIST.filter(s => s.value !== 'closed' || form.status === 'closed').map(s => ({ value: s.value, label: `${s.icon} ${s.label}` }))} />
          <Select label="มอบหมายให้ Sales" value={form.assigned_to} onChange={e => setForm({ ...form, assigned_to: e.target.value })} options={userOptions} />
          <div className="col-span-2">
            <TextArea label="หมายเหตุ" value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} placeholder="บันทึกเพิ่มเติม..." />
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
              budget: detailCustomer.budget,
              status: detailCustomer.status,
              assigned_to: detailCustomer.assigned_to,
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
