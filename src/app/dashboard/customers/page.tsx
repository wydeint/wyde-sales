'use client'

import { useEffect, useState, useId } from 'react'
import { createClient } from '@/lib/supabase/client'
import {
  Plus, Users, Pencil, Search, AlertCircle, Trash2, X,
  Phone, Mail, MessageCircle, Building2, Home, Banknote,
  Briefcase, FileText, CheckCircle, Clock, Shield, ChevronRight,
} from 'lucide-react'
import { TableSpinner, TableError } from '@/components/ui/StateUI'
import Modal from '@/components/ui/Modal'
import { Input, Select, TextArea } from '@/components/ui/Input'

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
  work_type: string
  package_type: string
  order_date: string | null
  revenue_ex_vat: number
  revenue_inc_vat: number
  voucher: number
  working_status: string
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

const STATUS_LIST = [
  { value: 'new', label: 'ใหม่', icon: '●', color: 'bg-blue-500/20 text-blue-400' },
  { value: 'interested', label: 'สนใจ', icon: '◉', color: 'bg-cyan-500/20 text-cyan-400' },
  { value: 'quoted', label: 'เสนอราคาแล้ว', icon: '◈', color: 'bg-yellow-500/20 text-yellow-400' },
  { value: 'booked', label: 'จอง', icon: '★', color: 'bg-orange-500/20 text-orange-400' },
  { value: 'close_pending', label: 'รอปิด', icon: '◷', color: 'bg-purple-500/20 text-purple-400' },
  { value: 'closed', label: 'ปิดแล้ว', icon: '✓', color: 'bg-green-500/20 text-green-400' },
  { value: 'lost', label: 'หลุด', icon: '✕', color: 'bg-red-500/20 text-red-400' },
]

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
  status: 'new', assigned_to: '', notes: ''
}

function statusInfo(s: string) {
  return STATUS_LIST.find(x => x.value === s) || STATUS_LIST[0]
}

function fmt(n: number) {
  return n ? n.toLocaleString('th-TH') : '—'
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
          .select('id, po_no, so_no, work_type, package_type, order_date, revenue_ex_vat, revenue_inc_vat, voucher, working_status')
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
            supabase.from('payments').select('id, job_id, installment_no, installment_name, amount, status, due_date, paid_date, is_final').in('job_id', jobIds).order('installment_no'),
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
    <div className="fixed inset-0 z-50 flex justify-end" onClick={onClose}>
      {/* Backdrop */}
      <div className="absolute inset-0" style={{ background: 'rgba(0,0,0,0.45)', backdropFilter: 'blur(2px)' }} />

      {/* Panel */}
      <div
        className="relative flex flex-col h-full overflow-y-auto w-full max-w-xl"
        style={{ background: 'var(--glass-bg)', backdropFilter: 'blur(32px) saturate(180%)', borderLeft: '1px solid var(--glass-border)' }}
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
              <h2 className="font-bold text-base" style={{ color: 'var(--text-1)' }}>{customer.customer_name}</h2>
              <p className="text-xs font-mono mt-0.5" style={{ color: 'var(--text-3)' }}>{customer.id}</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium ${st.color}`}>
              {st.icon} {st.label}
            </span>
            <button onClick={onEdit} className="p-1.5 rounded-lg transition-colors" style={{ color: 'var(--text-2)', background: 'var(--hover-bg)' }} title="แก้ไขข้อมูล">
              <Pencil size={14} />
            </button>
            <button onClick={onClose} className="p-1.5 rounded-lg transition-colors" style={{ color: 'var(--text-2)', background: 'var(--hover-bg)' }}>
              <X size={16} />
            </button>
          </div>
        </div>

        <div className="flex-1 px-5 py-4 space-y-5">

          {/* Contact Info */}
          <section>
            <p className="text-xs font-semibold uppercase tracking-wider mb-2" style={{ color: 'var(--text-3)' }}>ข้อมูลติดต่อ</p>
            <div className="rounded-xl p-4 grid grid-cols-2 gap-3" style={{ background: 'var(--card-bg)', border: '1px solid var(--card-border)' }}>
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
                <span className="text-sm" style={{ color: 'var(--text-2)' }}>งบ {customer.budget ? fmt(customer.budget) + ' บ.' : '—'}</span>
              </div>
              <div className="flex items-center gap-2">
                <Users size={13} style={{ color: 'var(--text-3)' }} />
                <span className="text-sm" style={{ color: 'var(--text-2)' }}>{(customer as any).users?.name || '—'}</span>
              </div>
              {customer.notes && (
                <div className="col-span-2 text-xs px-3 py-2 rounded-lg" style={{ background: 'var(--hover-bg)', color: 'var(--text-2)' }}>
                  {customer.notes}
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

          {!loading && (
            <>
              {/* Jobs */}
              <section>
                <p className="text-xs font-semibold uppercase tracking-wider mb-2 flex items-center gap-1.5" style={{ color: 'var(--text-3)' }}>
                  <Briefcase size={12} />งาน ({jobs.length})
                </p>
                {jobs.length === 0 ? (
                  <p className="text-xs px-3 py-4 rounded-xl text-center" style={{ background: 'var(--card-bg)', border: '1px solid var(--card-border)', color: 'var(--text-3)' }}>
                    ยังไม่มีงาน
                  </p>
                ) : jobs.map(job => {
                  const paid = job.installments.filter(i => i.status === 'paid').reduce((s, i) => s + i.amount, 0)
                  const total = job.installments.reduce((s, i) => s + i.amount, 0)
                  const pct = total > 0 ? Math.round(paid / total * 100) : 0
                  return (
                    <div key={job.id} className="rounded-xl p-4 mb-3" style={{ background: 'var(--card-bg)', border: '1px solid var(--card-border)' }}>
                      {/* Job header */}
                      <div className="flex items-start justify-between mb-3">
                        <div>
                          <p className="text-xs" style={{ color: 'var(--text-3)' }}>{job.work_type || '—'} · {job.package_type || '—'}</p>
                        </div>
                        <span className="text-xs px-2 py-0.5 rounded-full" style={{
                          background: job.working_status === 'ส่งมอบแล้ว' ? 'rgba(52,211,153,0.15)' : 'var(--hover-bg)',
                          color: job.working_status === 'ส่งมอบแล้ว' ? '#34d399' : 'var(--text-2)',
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
                            <p className="text-[10px] uppercase tracking-wider" style={{ color: 'var(--text-3)' }}>{f.label}</p>
                            <p className="text-xs font-medium mt-0.5" style={{ color: 'var(--text-1)' }}>{f.value}</p>
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
                            <span style={{ color: pct === 100 ? '#34d399' : 'var(--text-2)' }}>{pct}%</span>
                          </div>
                          <div className="h-1.5 rounded-full mb-2" style={{ background: 'var(--divider)' }}>
                            <div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, background: pct === 100 ? '#34d399' : 'var(--accent)' }} />
                          </div>
                          <div className="space-y-1">
                            {job.installments.map(inst => (
                              <div key={inst.id} className="flex items-center justify-between text-xs">
                                <div className="flex items-center gap-1.5">
                                  {inst.status === 'paid'
                                    ? <CheckCircle size={10} className="text-green-400 flex-shrink-0" />
                                    : inst.status === 'overdue'
                                    ? <AlertCircle size={10} className="text-red-400 flex-shrink-0" />
                                    : <Clock size={10} className="flex-shrink-0" style={{ color: 'var(--text-3)' }} />
                                  }
                                  <span style={{ color: 'var(--text-2)' }}>{inst.installment_name}</span>
                                </div>
                                <span style={{ color: inst.status === 'paid' ? '#34d399' : inst.status === 'overdue' ? '#f87171' : 'var(--text-2)' }}>
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
                          <span style={{ color: job.handover.work_status === 'ส่งมอบแล้ว' ? '#34d399' : 'var(--text-2)' }}>
                            {job.handover.work_status}
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
                    <div key={w.id} className="rounded-xl p-4 mb-2" style={{ background: 'var(--card-bg)', border: '1px solid var(--card-border)' }}>
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-sm font-mono" style={{ color: 'var(--accent)' }}>ห้อง {w.room}</span>
                        <span className={`text-xs px-2 py-0.5 rounded-full ${w.status === 'active' ? 'bg-green-500/20 text-green-400' : w.status === 'expiring_soon' ? 'bg-yellow-500/20 text-yellow-400' : 'bg-slate-500/20 text-slate-400'}`}>
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
  const searchId = useId()
  const [filterStatus, setFilterStatus] = useState('')
  const [filterProject, setFilterProject] = useState('')
  const [detailCustomer, setDetailCustomer] = useState<Customer | null>(null)

  async function load() {
    setLoading(true)
    setFetchError('')
    const [
      { data: c, error: cErr },
      { data: p, error: pErr },
      { data: u, error: uErr },
    ] = await Promise.all([
      supabase.from('customers').select('id, customer_name, phone, email, line_id, source, project_id, interested_room, budget, status, assigned_to, notes, created_at, projects(name), users!customers_assigned_to_fkey(name)').order('created_at', { ascending: false }),
      supabase.from('projects').select('id,name').eq('active', true).order('name'),
      supabase.from('users').select('id,name').eq('active', true).order('name'),
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
    setSaving(true)
    setSaveError('')
    const payload = {
      ...form,
      project_id: form.project_id || null,
      assigned_to: form.assigned_to || null,
    }
    if (editing) {
      const { error } = await supabase.from('customers').update(payload).eq('id', editing.id)
      if (error) { setSaveError(error.message); setSaving(false); return }
    } else {
      const newId = genId()
      if (customers.some(c => c.id === newId)) {
        setSaveError(`ID "${newId}" มีอยู่แล้วในระบบ — กรุณาตรวจสอบโครงการและห้องอีกครั้ง`)
        setSaving(false)
        return
      }
      const { error } = await supabase.from('customers').insert({ id: newId, ...payload })
      if (error) { setSaveError(error.message); setSaving(false); return }
    }
    setSaving(false)
    setOpen(false)
    load()
  }

  async function deleteCustomer(c: Customer) {
    if (!confirm(`ลบลูกค้า "${c.customer_name}" ?\nข้อมูลการชำระเงินที่เชื่อมกับลูกค้านี้จะถูกลบด้วย`)) return
    setDeletingId(c.id)
    await supabase.from('payments').delete().eq('customer_id', c.id)
    await supabase.from('customers').delete().eq('id', c.id)
    setDeletingId(null)
    if (detailCustomer?.id === c.id) setDetailCustomer(null)
    load()
  }

  const projectOptions = [{ value: '', label: '— เลือกโครงการ —' }, ...projects.map(p => ({ value: p.id, label: p.name }))]
  const userOptions = [{ value: '', label: '— เลือก Sales —' }, ...users.map(u => ({ value: u.id, label: u.name }))]
  const statusOptions = [{ value: '', label: 'ทุกสถานะ' }, ...STATUS_LIST.map(s => ({ value: s.value, label: s.label }))]
  const projectFilterOptions = [{ value: '', label: 'ทุกโครงการ' }, ...projects.map(p => ({ value: p.id, label: p.name }))]

  const filtered = customers.filter(c => {
    const q = search.toLowerCase()
    const matchSearch = !q || c.customer_name.toLowerCase().includes(q) || c.phone?.includes(q) || c.interested_room?.toLowerCase().includes(q) || (c as any).projects?.name?.toLowerCase().includes(q)
    const matchStatus = !filterStatus || c.status === filterStatus
    const matchProject = !filterProject || c.project_id === filterProject
    return matchSearch && matchStatus && matchProject
  })

  return (
    <div className="p-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-bold" style={{ color: 'var(--text-1)' }}>ลูกค้า Condo Origin</h1>
          <p className="text-sm mt-0.5" style={{ color: 'var(--text-2)' }}>รายชื่อลูกค้าและ Pipeline การขาย</p>
        </div>
        <div className="flex gap-2">
          <button onClick={() => { setEditing(null); setForm(emptyForm); setSaveError(''); setOpen(true) }}
            className="flex items-center gap-2 bg-[#238636] hover:bg-[#2ea043] text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors">
            <Plus size={16} />เพิ่มลูกค้า
          </button>
        </div>
      </div>

      {/* Filters */}
      <div className="flex gap-3 mb-4 flex-wrap">
        <label htmlFor={searchId} className="sr-only">ค้นหาลูกค้า</label>
        <div className="flex items-center gap-2 rounded-lg px-3 py-2 flex-1 min-w-[200px]"
          style={{ background: 'var(--card-bg)', border: '1px solid var(--card-border)' }}>
          <Search size={14} style={{ color: 'var(--text-3)', flexShrink: 0 }} aria-hidden="true" />
          <input
            id={searchId}
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="ค้นหาชื่อ ห้อง โครงการ เบอร์..."
            className="bg-transparent text-sm outline-none flex-1"
            style={{ color: 'var(--text-1)' }}
          />
        </div>
        <label htmlFor="filter-status" className="sr-only">กรองตามสถานะ</label>
        <select id="filter-status" value={filterStatus} onChange={e => setFilterStatus(e.target.value)}
          className="field-input rounded-lg px-3 py-2 text-sm outline-none">
          {statusOptions.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
        <label htmlFor="filter-project" className="sr-only">กรองตามโครงการ</label>
        <select id="filter-project" value={filterProject} onChange={e => setFilterProject(e.target.value)}
          className="field-input rounded-lg px-3 py-2 text-sm outline-none">
          {projectFilterOptions.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
      </div>

      {/* Summary chips */}
      <div className="flex gap-2 mb-4 flex-wrap">
        {STATUS_LIST.map(s => {
          const count = customers.filter(c => c.status === s.value).length
          if (!count) return null
          return (
            <button key={s.value} onClick={() => setFilterStatus(filterStatus === s.value ? '' : s.value)}
              className={`px-3 py-1 rounded-full text-xs font-medium transition-all ${filterStatus === s.value ? s.color + ' ring-1 ring-current' : s.color + ' opacity-60 hover:opacity-100'}`}>
              {s.label} {count}
            </button>
          )
        })}
      </div>

      {/* Table */}
      <div className="rounded-xl overflow-hidden" style={{ background: 'var(--card-bg)', border: '1px solid var(--card-border)' }}>
        <table className="w-full">
          <thead>
            <tr style={{ borderBottom: '1px solid var(--divider)' }}>
              <th scope="col" className="text-left px-4 py-3 text-xs font-medium" style={{ color: 'var(--text-3)' }}>ลูกค้า</th>
              <th scope="col" className="text-left px-4 py-3 text-xs font-medium" style={{ color: 'var(--text-3)' }}>เบอร์ / LINE</th>
              <th scope="col" className="text-left px-4 py-3 text-xs font-medium" style={{ color: 'var(--text-3)' }}>โครงการ / ห้อง</th>
              <th scope="col" className="text-left px-4 py-3 text-xs font-medium" style={{ color: 'var(--text-3)' }}>ช่องทาง</th>
              <th scope="col" className="text-left px-4 py-3 text-xs font-medium" style={{ color: 'var(--text-3)' }}>Sales</th>
              <th scope="col" className="text-left px-4 py-3 text-xs font-medium" style={{ color: 'var(--text-3)' }}>สถานะ</th>
              <th scope="col" className="px-4 py-3"><span className="sr-only">แก้ไข</span></th>
            </tr>
          </thead>
          <tbody>
            {loading && <TableSpinner colSpan={7} />}
            {!loading && fetchError && <TableError colSpan={7} message={fetchError} onRetry={load} />}
            {!loading && !fetchError && filtered.length === 0 && (
              <tr><td colSpan={7} className="text-center py-12">
                <Users size={32} className="mx-auto mb-2" style={{ color: 'var(--text-3)' }} />
                <p className="text-sm" style={{ color: 'var(--text-2)' }}>ไม่พบลูกค้า</p>
              </td></tr>
            )}
            {filtered.map((c, i) => {
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
                        <span className="text-xs font-medium" style={{ color: 'var(--text-1)' }}>{c.customer_name[0]}</span>
                      </div>
                      <div>
                        <p className="text-sm font-medium flex items-center gap-1" style={{ color: 'var(--text-1)' }}>
                          {c.customer_name}
                          <ChevronRight size={12} style={{ color: 'var(--text-3)' }} />
                        </p>
                        <p className="text-xs font-mono" style={{ color: 'var(--text-3)' }}>{c.id}</p>
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <p className="text-sm" style={{ color: 'var(--text-2)' }}>{c.phone || '-'}</p>
                    {c.line_id && <p className="text-xs" style={{ color: 'var(--text-3)' }}>LINE: {c.line_id}</p>}
                  </td>
                  <td className="px-4 py-3">
                    <p className="text-sm" style={{ color: 'var(--text-2)' }}>{(c as any).projects?.name || '-'}</p>
                    {c.interested_room && <p className="text-xs" style={{ color: 'var(--accent)' }}>ห้อง {c.interested_room}</p>}
                  </td>
                  <td className="px-4 py-3 text-sm capitalize" style={{ color: 'var(--text-2)' }}>{c.source || '-'}</td>
                  <td className="px-4 py-3 text-sm" style={{ color: 'var(--text-2)' }}>{(c as any).users?.name || '-'}</td>
                  <td className="px-4 py-3">
                    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium ${st.color}`}>
                      <span aria-hidden="true">{st.icon}</span>{st.label}
                    </span>
                  </td>
                  <td className="px-4 py-3" onClick={e => e.stopPropagation()}>
                    <div className="flex items-center gap-2">
                      <button onClick={() => {
                        setEditing(c)
                        setForm({ customer_name: c.customer_name, phone: c.phone, email: c.email, line_id: c.line_id, source: c.source, project_id: c.project_id, interested_room: c.interested_room, budget: c.budget, status: c.status, assigned_to: c.assigned_to, notes: c.notes })
                        setOpen(true)
                      }} className="transition-colors" style={{ color: 'var(--text-2)' }}>
                        <Pencil size={14} />
                      </button>
                      <button
                        onClick={() => deleteCustomer(c)}
                        disabled={deletingId === c.id}
                        className="hover:text-red-400 transition-colors disabled:opacity-40"
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
          <div className="px-4 py-2 text-xs" style={{ borderTop: '1px solid var(--divider)', color: 'var(--text-3)' }}>
            แสดง {filtered.length} จาก {customers.length} ราย
          </div>
        )}
      </div>

      {/* Edit / Add Modal */}
      <Modal open={open} onClose={() => setOpen(false)} title={editing ? 'แก้ไขข้อมูลลูกค้า' : 'เพิ่มลูกค้าใหม่'} size="lg">
        {saveError && (
          <div role="alert" className="flex items-center gap-2 mb-4 p-3 rounded-xl text-xs" style={{ background: 'rgba(239,68,68,0.12)', color: '#ef4444' }}>
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
          <Select label="โครงการที่สนใจ" value={form.project_id} onChange={e => setForm({ ...form, project_id: e.target.value })} options={projectOptions} />
          <Input label="ห้องที่สนใจ" value={form.interested_room} onChange={e => setForm({ ...form, interested_room: e.target.value })} placeholder="เช่น Z-905" />
          {!editing && form.project_id && form.interested_room.trim() && (
            <div className="col-span-2 flex items-center gap-2 px-3 py-2 rounded-xl text-xs" style={{ background: 'var(--hover-bg)', border: '1px solid var(--divider)' }}>
              <span style={{ color: 'var(--text-3)' }}>Customer ID ที่จะถูกสร้าง:</span>
              <span className="font-mono font-bold" style={{ color: 'var(--accent)' }}>{form.project_id}-{form.interested_room.trim().toUpperCase()}</span>
            </div>
          )}
          <Select label="ช่องทาง" value={form.source} onChange={e => setForm({ ...form, source: e.target.value })} options={SOURCE_OPTIONS} />
          <Input label="งบประมาณ (บาท)" type="number" min={0} step={1000} value={form.budget} onChange={e => setForm({ ...form, budget: Number(e.target.value) })} />
          <Select label="สถานะ" value={form.status} onChange={e => setForm({ ...form, status: e.target.value })}
            options={STATUS_LIST.map(s => ({ value: s.value, label: `${s.icon} ${s.label}` }))} />
          <Select label="มอบหมายให้ Sales" value={form.assigned_to} onChange={e => setForm({ ...form, assigned_to: e.target.value })} options={userOptions} />
          <div className="col-span-2">
            <TextArea label="หมายเหตุ" value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} placeholder="บันทึกเพิ่มเติม..." />
          </div>
        </div>
        <div className="flex justify-end gap-3 mt-5">
          <button onClick={() => setOpen(false)} className="px-4 py-2 text-sm transition-colors" style={{ color: 'var(--text-3)' }}>ยกเลิก</button>
          <button onClick={save} disabled={saving || !form.customer_name}
            className="px-4 py-2 text-white text-sm rounded-xl transition-colors disabled:opacity-50"
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
              notes: detailCustomer.notes,
            })
            setOpen(true)
          }}
        />
      )}
    </div>
  )
}
