'use client'

import { useEffect, useState, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Search, CheckCircle2, Circle, Truck, Plus, X, Receipt } from 'lucide-react'

// ─── Types ───────────────────────────────────────────────
type Milestone = {
  installment_name: string
  amount: number
  status: 'pending' | 'paid' | 'overdue' | 'partial'
  due_date: string | null
  paid_date: string | null
  id: string
}

type JobRow = {
  id: string
  customer_id: string | null
  lead_id: number | null
  project_id: string
  room_no: string
  customer_name: string
  revenue_ex_vat: number
  working_status: string
  order_date: string | null
  sales_id: string
  sales_name: string
  project_name: string
  // milestones
  deposit: Milestone | null
  first50: Milestone | null
  final50: Milestone | null
  others: Milestone[]
}

type RawJob = {
  id: string
  customer_id: string | null
  lead_id: number | null
  project_id: string
  room_no: string
  revenue_ex_vat: number
  working_status: string
  order_date: string | null
  sales_id: string
  condo_leads?: { customer_name: string; room_no: string } | null
  customers?: { customer_name: string } | null
  projects?: { name: string } | null
  sales?: { name: string } | null
}

type RawPayment = {
  id: string
  customer_id: string | null
  job_id: string | null
  installment_name: string
  amount: number
  status: string
  due_date: string | null
  paid_date: string | null
}

// ─── Status helpers ───────────────────────────────────────
const INSTALL_NAMES = [
  { value: 'เงินจอง', label: 'เงินจอง' },
  { value: 'มัดจำ', label: 'มัดจำ' },
  { value: '50% แรก', label: '50% แรก' },
  { value: '50% หลัง', label: '50% หลัง (หลังส่งมอบ)' },
  { value: 'อื่นๆ', label: 'อื่นๆ' },
]

const PAY_CHANNELS = ['โอนเงิน', 'บัตรเครดิต', 'เงินสด', 'เช็ค']

function classifyInstallment(name: string): 'deposit' | 'first50' | 'final50' | 'other' {
  const n = name.toLowerCase()
  if (n.includes('จอง') || n.includes('มัดจำ') || n.includes('deposit') || n.includes('down')) return 'deposit'
  if (n.includes('50% แรก') || n.includes('งวดที่ 1') || n.includes('progress_1') || n.includes('50%แรก')) return 'first50'
  if (n.includes('50% หลัง') || n.includes('สุดท้าย') || n.includes('100%') || n.includes('final') || n.includes('งวดที่ 3')) return 'final50'
  return 'other'
}

function overallStatus(row: JobRow): { label: string; color: string } {
  if (row.final50?.status === 'paid') return { label: 'ชำระครบ', color: '#4ade80' }
  if (row.working_status === 'ส่งมอบแล้ว' && row.final50) return { label: 'ค้างหลังส่งมอบ', color: '#f87171' }
  if (row.working_status === 'ส่งมอบแล้ว') return { label: 'ส่งมอบแล้ว', color: '#60a5fa' }
  if (row.first50?.status === 'paid') return { label: 'รับ 50% แรกแล้ว', color: '#a78bfa' }
  if (row.deposit?.status === 'paid') return { label: 'รับมัดจำแล้ว', color: '#fbbf24' }
  if (row.deposit) return { label: 'รอมัดจำ', color: '#94a3b8' }
  return { label: 'ยังไม่มีงวด', color: '#475569' }
}

const f = (v?: number | null) => v ? '฿' + Math.round(v).toLocaleString() : '—'
const shortDate = (d?: string | null) => d ? new Date(d).toLocaleDateString('th-TH', { day: '2-digit', month: 'short', year: '2-digit' }) : null
const today = new Date().toISOString().slice(0, 10)

// ─── Milestone Cell ───────────────────────────────────────
function MilestoneCell({ m, label }: { m: Milestone | null; label: string }) {
  if (!m) return (
    <td className="px-3 py-3 text-center" style={{ minWidth: 110 }}>
      <div className="flex flex-col items-center gap-0.5">
        <Circle size={18} style={{ color: 'var(--divider)' }} />
        <span className="text-[10px]" style={{ color: 'var(--text-3)' }}>—</span>
      </div>
    </td>
  )

  const paid = m.status === 'paid'
  const overdue = !paid && m.due_date && m.due_date < today
  const color = paid ? '#4ade80' : overdue ? '#f87171' : '#fbbf24'

  return (
    <td className="px-3 py-3 text-center" style={{ minWidth: 110 }}>
      <div className="flex flex-col items-center gap-0.5">
        {paid
          ? <CheckCircle2 size={18} style={{ color: '#4ade80' }} />
          : <Circle size={18} style={{ color: overdue ? '#f87171' : 'var(--text-3)' }} />
        }
        <span className="text-[10px] font-semibold" style={{ color }}>{f(m.amount)}</span>
        <span className="text-[9px]" style={{ color: 'var(--text-3)' }}>
          {paid ? shortDate(m.paid_date) : (overdue ? 'เกินกำหนด' : shortDate(m.due_date) || 'รอชำระ')}
        </span>
      </div>
    </td>
  )
}

// ─── Add/Edit Payment Modal ───────────────────────────────
type PayForm = {
  job_id: string
  customer_id: string
  installment_name: string
  amount: string
  due_date: string
  paid_date: string
  paid_amount: string
  status: string
  payment_channel: string
  notes: string
}

const emptyForm = (): PayForm => ({
  job_id: '', customer_id: '', installment_name: 'เงินจอง',
  amount: '', due_date: '', paid_date: '', paid_amount: '',
  status: 'pending', payment_channel: 'โอนเงิน', notes: '',
})

// ─── Main Page ────────────────────────────────────────────
export default function PaymentsPage() {
  const supabase = createClient()
  const [jobs, setJobs] = useState<JobRow[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [filterSales, setFilterSales] = useState('')
  const [filterProject, setFilterProject] = useState('')
  const [filterStatus, setFilterStatus] = useState('')
  const [viewTab, setViewTab] = useState<'by_sales' | 'all'>('by_sales')
  const [users, setUsers] = useState<{ id: string; name: string }[]>([])
  const [projects, setProjects] = useState<{ id: string; name: string }[]>([])

  // Add payment modal
  const [modalOpen, setModalOpen] = useState(false)
  const [form, setForm] = useState<PayForm>(emptyForm())
  const [saving, setSaving] = useState(false)

  const load = useCallback(async () => {
    const [
      { data: jobsData },
      { data: paymentsData },
      { data: usersData },
      { data: projData },
    ] = await Promise.all([
      supabase.from('jobs')
        .select('id, customer_id, lead_id, project_id, room_no, revenue_ex_vat, working_status, order_date, sales_id, condo_leads(customer_name,room_no), customers(customer_name), projects(name), sales:users!jobs_sales_id_fkey(name)')
        .order('order_date', { ascending: false }),
      supabase.from('payments').select('id, customer_id, job_id, installment_name, amount, status, due_date, paid_date').order('due_date'),
      supabase.from('users').select('id, name').eq('active', true).order('name'),
      supabase.from('projects').select('id, name').eq('active', true).order('name'),
    ])

    setUsers(usersData || [])
    setProjects(projData || [])

    // Group payments by customer_id and job_id
    const pmtByCustomer: Record<string, RawPayment[]> = {}
    const pmtByJob: Record<string, RawPayment[]> = {}
    for (const p of (paymentsData as RawPayment[]) || []) {
      if (p.job_id) {
        pmtByJob[p.job_id] = [...(pmtByJob[p.job_id] || []), p]
      } else if (p.customer_id) {
        pmtByCustomer[p.customer_id] = [...(pmtByCustomer[p.customer_id] || []), p]
      }
    }

    const rows: JobRow[] = ((jobsData as unknown as RawJob[]) || []).map(j => {
      const pmts = pmtByJob[j.id] || (j.customer_id ? pmtByCustomer[j.customer_id] : []) || []
      let deposit: Milestone | null = null
      let first50: Milestone | null = null
      let final50: Milestone | null = null
      const others: Milestone[] = []

      for (const p of pmts) {
        const m: Milestone = {
          id: p.id,
          installment_name: p.installment_name,
          amount: p.amount,
          status: p.status as any,
          due_date: p.due_date,
          paid_date: p.paid_date,
        }
        const cls = classifyInstallment(p.installment_name)
        if (cls === 'deposit' && !deposit) deposit = m
        else if (cls === 'first50' && !first50) first50 = m
        else if (cls === 'final50' && !final50) final50 = m
        else others.push(m)
      }

      return {
        id: j.id,
        customer_id: j.customer_id,
        lead_id: j.lead_id,
        project_id: j.project_id,
        room_no: (j.condo_leads as any)?.room_no || j.room_no || '',
        customer_name: (j.condo_leads as any)?.customer_name || (j.customers as any)?.customer_name || '—',
        revenue_ex_vat: j.revenue_ex_vat,
        working_status: j.working_status,
        order_date: j.order_date,
        sales_id: j.sales_id,
        sales_name: (j.sales as any)?.name || '—',
        project_name: (j.projects as any)?.name || '—',
        deposit, first50, final50, others,
      }
    })

    setJobs(rows)
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

  // ─── Filtered jobs ───
  const filtered = jobs.filter(j => {
    const s = search.toLowerCase()
    const matchSearch = !s || [j.customer_name, j.room_no, j.id, j.project_name].some(v => v?.toLowerCase().includes(s))
    const matchSales = !filterSales || j.sales_id === filterSales
    const matchProj = !filterProject || j.project_id === filterProject
    const matchStatus = !filterStatus || overallStatus(j).label === filterStatus
    return matchSearch && matchSales && matchProj && matchStatus
  })

  // ─── KPI ───
  const kpis = [
    { label: 'ทั้งหมด', value: filtered.length, color: 'var(--text-1)' },
    { label: 'รอมัดจำ', value: filtered.filter(j => !j.deposit?.status || j.deposit.status === 'pending').length, color: '#94a3b8' },
    { label: 'รับมัดจำแล้ว', value: filtered.filter(j => j.deposit?.status === 'paid' && j.first50?.status !== 'paid').length, color: '#fbbf24' },
    { label: 'รับ 50% แรก', value: filtered.filter(j => j.first50?.status === 'paid' && j.working_status !== 'ส่งมอบแล้ว').length, color: '#a78bfa' },
    { label: 'ส่งมอบแล้ว', value: filtered.filter(j => j.working_status === 'ส่งมอบแล้ว' && j.final50?.status !== 'paid').length, color: '#60a5fa' },
    { label: 'ค้างหลังส่งมอบ', value: filtered.filter(j => j.working_status === 'ส่งมอบแล้ว' && j.final50 && j.final50.status !== 'paid').length, color: '#f87171' },
    { label: 'ชำระครบ', value: filtered.filter(j => j.final50?.status === 'paid').length, color: '#4ade80' },
  ]

  // ─── Group by sales ───
  const salesGroups = (() => {
    const map = new Map<string, { name: string; rows: JobRow[] }>()
    for (const j of filtered) {
      if (!map.has(j.sales_id)) map.set(j.sales_id, { name: j.sales_name, rows: [] })
      map.get(j.sales_id)!.rows.push(j)
    }
    return [...map.values()].sort((a, b) => a.name.localeCompare(b.name, 'th'))
  })()

  // ─── Save payment ───
  async function savePayment() {
    setSaving(true)
    const payload = {
      job_id: form.job_id || null,
      customer_id: form.customer_id || null,
      installment_name: form.installment_name,
      amount: parseFloat(form.amount) || 0,
      due_date: form.due_date || null,
      paid_date: form.paid_date || null,
      paid_amount: parseFloat(form.paid_amount) || 0,
      status: form.status,
      payment_channel: form.payment_channel || null,
      notes: form.notes || null,
    }
    await supabase.from('payments').insert([payload])
    setSaving(false)
    setModalOpen(false)
    setForm(emptyForm())
    load()
  }

  function openAdd(j?: JobRow) {
    setForm({
      ...emptyForm(),
      job_id: j?.id || '',
      customer_id: j?.customer_id || '',
    })
    setModalOpen(true)
  }

  if (loading) return (
    <div className="flex items-center justify-center h-full" style={{ color: 'var(--text-3)' }}>
      <p className="text-sm">กำลังโหลด...</p>
    </div>
  )

  return (
    <div className="p-4 md:p-6 space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold" style={{ color: 'var(--text-1)' }}>การเก็บเงิน</h1>
          <p className="text-xs mt-0.5" style={{ color: 'var(--text-3)' }}>ติดตามการชำระเงินทุกงวด · แยกตามเซลล์</p>
        </div>
        <button onClick={() => openAdd()}
          className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold text-white"
          style={{ background: 'linear-gradient(135deg,#6366f1,#8b5cf6)' }}>
          <Plus size={15} /> เพิ่มงวด
        </button>
      </div>

      {/* KPI scroll row — iPad friendly */}
      <div className="flex gap-3 overflow-x-auto pb-1 -mx-1 px-1">
        {kpis.map(k => (
          <button key={k.label}
            onClick={() => setFilterStatus(filterStatus === k.label ? '' : k.label)}
            className="glass-card px-4 py-3 flex-shrink-0 text-center rounded-2xl min-w-[90px] transition-all"
            style={{
              border: filterStatus === k.label ? `1px solid ${k.color}` : '1px solid var(--glass-border)',
              background: filterStatus === k.label ? `${k.color}15` : undefined,
            }}>
            <p className="text-lg font-bold leading-tight" style={{ color: k.color }}>{k.value}</p>
            <p className="text-[10px] mt-0.5 whitespace-nowrap" style={{ color: 'var(--text-3)' }}>{k.label}</p>
          </button>
        ))}
      </div>

      {/* Filters */}
      <div className="glass-card p-3 flex flex-wrap gap-2.5">
        <div className="flex items-center gap-2 flex-1 min-w-44 rounded-xl px-3 py-2" style={{ background: 'var(--hover-bg)' }}>
          <Search size={13} style={{ color: 'var(--text-3)' }} />
          <input value={search} onChange={e => setSearch(e.target.value)}
            placeholder="ค้นหาลูกค้า / ห้อง..." className="bg-transparent text-sm flex-1 outline-none"
            style={{ color: 'var(--text-1)' }} />
        </div>
        <select value={filterSales} onChange={e => setFilterSales(e.target.value)}
          className="rounded-xl px-3 py-2 text-sm outline-none"
          style={{ background: 'var(--hover-bg)', color: 'var(--text-2)' }}>
          <option value="">ทุกเซลล์</option>
          {users.map(u => <option key={u.id} value={u.id}>{u.name}</option>)}
        </select>
        <select value={filterProject} onChange={e => setFilterProject(e.target.value)}
          className="rounded-xl px-3 py-2 text-sm outline-none"
          style={{ background: 'var(--hover-bg)', color: 'var(--text-2)' }}>
          <option value="">ทุกโปรเจกต์</option>
          {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
        {/* Tab toggle */}
        <div className="flex gap-1 rounded-xl p-1" style={{ background: 'var(--hover-bg)' }}>
          {(['by_sales', 'all'] as const).map(t => (
            <button key={t} onClick={() => setViewTab(t)}
              className="px-3 py-1 rounded-lg text-xs font-medium transition-all"
              style={{
                background: viewTab === t ? 'var(--accent)' : 'transparent',
                color: viewTab === t ? '#fff' : 'var(--text-3)',
              }}>
              {t === 'by_sales' ? 'แยกรายเซลล์' : 'ทั้งหมด'}
            </button>
          ))}
        </div>
      </div>

      {/* ─── Content ─── */}
      {viewTab === 'by_sales' ? (
        <div className="space-y-4">
          {salesGroups.length === 0 && (
            <div className="glass-card p-12 text-center text-sm" style={{ color: 'var(--text-3)' }}>ไม่มีข้อมูล</div>
          )}
          {salesGroups.map(g => {
            const totalVal = g.rows.reduce((s, r) => s + (r.revenue_ex_vat || 0), 0)
            const initial = g.name?.[0]?.toUpperCase() || '?'
            return (
              <div key={g.name} className="glass-card overflow-hidden">
                {/* Sales group header */}
                <div className="flex items-center gap-3 px-4 py-3" style={{ borderBottom: '1px solid var(--divider)', background: 'var(--hover-bg)' }}>
                  <div className="w-8 h-8 rounded-full flex items-center justify-center text-white text-xs font-bold flex-shrink-0"
                    style={{ background: 'linear-gradient(135deg,#6366f1,#8b5cf6)' }}>
                    {initial}
                  </div>
                  <div className="flex-1">
                    <p className="text-sm font-bold" style={{ color: 'var(--text-1)' }}>{g.name}</p>
                    <p className="text-xs" style={{ color: 'var(--text-3)' }}>
                      {g.rows.length} รายการ · มูลค่า {f(totalVal)}
                    </p>
                  </div>
                  <div className="flex gap-3 text-xs">
                    {[
                      { label: '🟡 รอมัดจำ', count: g.rows.filter(r => !r.deposit || r.deposit.status === 'pending').length },
                      { label: '🔴 ค้างหลังส่งมอบ', count: g.rows.filter(r => r.working_status === 'ส่งมอบแล้ว' && r.final50 && r.final50.status !== 'paid').length },
                    ].map(b => b.count > 0 && (
                      <span key={b.label} className="px-2 py-0.5 rounded-full" style={{ background: 'var(--hover-bg)', color: 'var(--text-3)' }}>
                        {b.label} {b.count}
                      </span>
                    ))}
                  </div>
                </div>

                {/* Milestone table */}
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr style={{ borderBottom: '1px solid var(--divider)' }}>
                        <th className="text-left px-4 py-2 text-xs font-semibold whitespace-nowrap" style={{ color: 'var(--text-3)', minWidth: 200 }}>ลูกค้า / ห้อง</th>
                        <th className="text-right px-3 py-2 text-xs font-semibold whitespace-nowrap" style={{ color: 'var(--text-3)', minWidth: 100 }}>มูลค่างาน</th>
                        <th className="text-center px-3 py-2 text-xs font-semibold whitespace-nowrap" style={{ color: '#fbbf24', minWidth: 110 }}>จอง / มัดจำ</th>
                        <th className="text-center px-3 py-2 text-xs font-semibold whitespace-nowrap" style={{ color: '#a78bfa', minWidth: 110 }}>50% แรก</th>
                        <th className="text-center px-3 py-2 text-xs font-semibold whitespace-nowrap" style={{ color: '#60a5fa', minWidth: 100 }}>ส่งมอบ</th>
                        <th className="text-center px-3 py-2 text-xs font-semibold whitespace-nowrap" style={{ color: '#4ade80', minWidth: 110 }}>50% หลัง</th>
                        <th className="text-left px-3 py-2 text-xs font-semibold whitespace-nowrap" style={{ color: 'var(--text-3)', minWidth: 120 }}>สถานะ</th>
                        <th className="px-3 py-2" style={{ minWidth: 40 }}></th>
                      </tr>
                    </thead>
                    <tbody>
                      {g.rows.map(j => {
                        const st = overallStatus(j)
                        const delivered = j.working_status === 'ส่งมอบแล้ว'
                        return (
                          <tr key={j.id}
                            className="transition-colors"
                            onMouseEnter={e => (e.currentTarget.style.background = 'var(--hover-bg)')}
                            onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                            style={{ borderBottom: '1px solid var(--divider)' }}>
                            <td className="px-4 py-3">
                              <p className="font-medium text-sm" style={{ color: 'var(--text-1)' }}>{j.customer_name}</p>
                              <p className="text-xs mt-0.5" style={{ color: 'var(--text-3)' }}>
                                {j.project_name} · {j.room_no || '—'}
                                {j.order_date && <span> · จอง {new Date(j.order_date).toLocaleDateString('th-TH', { day: '2-digit', month: 'short', year: '2-digit' })}</span>}
                              </p>
                            </td>
                            <td className="px-3 py-3 text-right">
                              <span className="font-semibold text-sm" style={{ color: '#4ade80' }}>{f(j.revenue_ex_vat)}</span>
                            </td>

                            <MilestoneCell m={j.deposit} label="มัดจำ" />
                            <MilestoneCell m={j.first50} label="50% แรก" />

                            {/* ส่งมอบ column */}
                            <td className="px-3 py-3 text-center" style={{ minWidth: 100 }}>
                              <div className="flex flex-col items-center gap-0.5">
                                {delivered
                                  ? <Truck size={16} style={{ color: '#60a5fa' }} />
                                  : <Truck size={16} style={{ color: 'var(--divider)' }} />
                                }
                                <span className="text-[10px]" style={{ color: delivered ? '#60a5fa' : 'var(--text-3)' }}>
                                  {delivered ? 'ส่งมอบแล้ว' : 'ยังไม่ส่งมอบ'}
                                </span>
                              </div>
                            </td>

                            <MilestoneCell m={j.final50} label="50% หลัง" />

                            <td className="px-3 py-3">
                              <span className="px-2 py-1 rounded-full text-[10px] font-semibold whitespace-nowrap"
                                style={{ background: `${st.color}18`, color: st.color }}>
                                {st.label}
                              </span>
                            </td>
                            <td className="px-3 py-3">
                              <button onClick={() => openAdd(j)}
                                className="w-7 h-7 flex items-center justify-center rounded-lg"
                                style={{ color: 'var(--text-3)' }}
                                title="เพิ่มงวดชำระ"
                                onMouseEnter={e => (e.currentTarget.style.background = 'var(--hover-bg)')}
                                onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}>
                                <Plus size={13} />
                              </button>
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            )
          })}
        </div>
      ) : (
        /* ── All view (flat table) ── */
        <div className="glass-card overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr style={{ borderBottom: '1px solid var(--divider)' }}>
                {['ลูกค้า / ห้อง', 'เซลล์', 'มูลค่างาน', 'จอง/มัดจำ', '50% แรก', 'ส่งมอบ', '50% หลัง', 'สถานะ', ''].map(h => (
                  <th key={h} className="text-left px-4 py-3 text-xs font-semibold whitespace-nowrap" style={{ color: 'var(--text-3)' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.map(j => {
                const st = overallStatus(j)
                const delivered = j.working_status === 'ส่งมอบแล้ว'
                return (
                  <tr key={j.id}
                    className="transition-colors"
                    onMouseEnter={e => (e.currentTarget.style.background = 'var(--hover-bg)')}
                    onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                    style={{ borderBottom: '1px solid var(--divider)' }}>
                    <td className="px-4 py-3">
                      <p className="font-medium" style={{ color: 'var(--text-1)' }}>{j.customer_name}</p>
                      <p className="text-xs" style={{ color: 'var(--text-3)' }}>{j.project_name} · {j.room_no}</p>
                    </td>
                    <td className="px-4 py-3 text-xs" style={{ color: 'var(--text-2)' }}>{j.sales_name}</td>
                    <td className="px-4 py-3 font-semibold text-right" style={{ color: '#4ade80' }}>{f(j.revenue_ex_vat)}</td>
                    <MilestoneCell m={j.deposit} label="มัดจำ" />
                    <MilestoneCell m={j.first50} label="50% แรก" />
                    <td className="px-3 py-3 text-center">
                      <Truck size={15} style={{ color: delivered ? '#60a5fa' : 'var(--divider)', margin: '0 auto' }} />
                    </td>
                    <MilestoneCell m={j.final50} label="50% หลัง" />
                    <td className="px-4 py-3">
                      <span className="px-2 py-1 rounded-full text-[10px] font-semibold whitespace-nowrap"
                        style={{ background: `${st.color}18`, color: st.color }}>
                        {st.label}
                      </span>
                    </td>
                    <td className="px-3 py-3">
                      <button onClick={() => openAdd(j)} className="w-7 h-7 flex items-center justify-center rounded-lg"
                        style={{ color: 'var(--text-3)' }}
                        onMouseEnter={e => (e.currentTarget.style.background = 'var(--hover-bg)')}
                        onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}>
                        <Plus size={13} />
                      </button>
                    </td>
                  </tr>
                )
              })}
              {filtered.length === 0 && (
                <tr><td colSpan={9} className="text-center py-12 text-sm" style={{ color: 'var(--text-3)' }}>ไม่มีข้อมูล</td></tr>
              )}
            </tbody>
          </table>
          <div className="px-4 py-2 text-xs" style={{ color: 'var(--text-3)', borderTop: '1px solid var(--divider)' }}>
            {filtered.length} รายการ
          </div>
        </div>
      )}

      {/* ─── Add Payment Modal ─── */}
      {modalOpen && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4"
          style={{ background: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(4px)' }}>
          <div className="w-full max-w-md rounded-3xl p-6 space-y-4"
            style={{ background: 'var(--glass-bg)', border: '1px solid var(--glass-border)', backdropFilter: 'blur(32px)' }}>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Receipt size={16} style={{ color: 'var(--accent)' }} />
                <h2 className="text-base font-bold" style={{ color: 'var(--text-1)' }}>บันทึกการชำระเงิน</h2>
              </div>
              <button onClick={() => setModalOpen(false)} style={{ color: 'var(--text-3)' }}><X size={18} /></button>
            </div>

            <div className="space-y-3">
              <div>
                <label className="field-label">งวดชำระ</label>
                <select value={form.installment_name} onChange={e => setForm(f => ({ ...f, installment_name: e.target.value }))}
                  className="field-input w-full mt-1">
                  {INSTALL_NAMES.map(n => <option key={n.value} value={n.value}>{n.label}</option>)}
                </select>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="field-label">ยอดเงิน (฿)</label>
                  <input type="number" value={form.amount} onChange={e => setForm(f => ({ ...f, amount: e.target.value }))}
                    className="field-input w-full mt-1" placeholder="0" />
                </div>
                <div>
                  <label className="field-label">กำหนดชำระ</label>
                  <input type="date" value={form.due_date} onChange={e => setForm(f => ({ ...f, due_date: e.target.value }))}
                    className="field-input w-full mt-1" />
                </div>
              </div>
              <div>
                <label className="field-label">สถานะ</label>
                <div className="flex gap-2 mt-1 flex-wrap">
                  {[
                    { v: 'pending', l: 'รอชำระ', c: '#fbbf24' },
                    { v: 'paid', l: 'ชำระแล้ว', c: '#4ade80' },
                    { v: 'overdue', l: 'เกินกำหนด', c: '#f87171' },
                  ].map(s => (
                    <button key={s.v} onClick={() => setForm(f => ({ ...f, status: s.v }))}
                      className="px-3 py-1.5 rounded-xl text-xs font-medium"
                      style={{
                        background: form.status === s.v ? `${s.c}30` : 'var(--hover-bg)',
                        color: form.status === s.v ? s.c : 'var(--text-3)',
                        border: form.status === s.v ? `1px solid ${s.c}60` : '1px solid transparent',
                      }}>
                      {s.l}
                    </button>
                  ))}
                </div>
              </div>
              {form.status === 'paid' && (
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="field-label">วันที่ชำระ</label>
                    <input type="date" value={form.paid_date} onChange={e => setForm(f => ({ ...f, paid_date: e.target.value }))}
                      className="field-input w-full mt-1" />
                  </div>
                  <div>
                    <label className="field-label">ช่องทาง</label>
                    <select value={form.payment_channel} onChange={e => setForm(f => ({ ...f, payment_channel: e.target.value }))}
                      className="field-input w-full mt-1">
                      {PAY_CHANNELS.map(c => <option key={c} value={c}>{c}</option>)}
                    </select>
                  </div>
                </div>
              )}
              <div>
                <label className="field-label">หมายเหตุ</label>
                <input value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
                  className="field-input w-full mt-1" placeholder="..." />
              </div>
            </div>

            <div className="flex gap-3 pt-1">
              <button onClick={() => setModalOpen(false)} className="flex-1 py-2.5 rounded-xl text-sm font-medium"
                style={{ background: 'var(--hover-bg)', color: 'var(--text-2)' }}>ยกเลิก</button>
              <button onClick={savePayment} disabled={saving}
                className="flex-1 py-2.5 rounded-xl text-sm font-semibold text-white"
                style={{ background: 'linear-gradient(135deg,#6366f1,#8b5cf6)', opacity: saving ? 0.7 : 1 }}>
                {saving ? 'กำลังบันทึก...' : 'บันทึก'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
