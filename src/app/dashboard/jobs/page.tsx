'use client'

import { useEffect, useState, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Plus, Search, ChevronDown, X, Calculator, Briefcase } from 'lucide-react'

// ─────────────────────────────────────────
// Constants
// ─────────────────────────────────────────
const WORK_TYPES = ['N-RPT/Event', 'N-RPT/EQ', 'N-RPT', 'RPT', 'B2B', 'อื่นๆ']
const PACKAGE_TYPES = [
  'Starter set (S)', 'Combo (S)', 'Investor Pro (M)', 'Medium (M)',
  'Premium (L)', 'Fully design (L)', 'Design & Turnkey',
  'Built-in', 'Curtain', 'Wallcovering', 'Loose furniture', 'อื่นๆ',
]
const WORKING_STATUSES = ['ดำเนินการ', 'ส่งมอบแล้ว', 'รอเอกสาร', 'ยกเลิก']
const CHANNELS = ['โอนเงิน', 'บัตรเครดิต', 'เงินสด', 'เช็ค']
const COMMISSION_STATUSES = ['pending', 'approved', 'paid']
const COMMISSION_STATUS_LABEL: Record<string, string> = { pending: 'รอ', approved: 'อนุมัติ', paid: 'จ่ายแล้ว' }

type CommissionTier = {
  revenue_min: number
  revenue_max: number | null
  rate: number
  tier_name: string
}

type Job = {
  id: string
  customer_id: string
  project_id: string
  room_no: string
  customer_type: string
  company_name: string
  po_no: string
  so_no: string
  work_type: string
  package_type: string
  order_date: string
  revenue_ex_vat: number
  revenue_inc_vat: number
  transfer_amount: number
  voucher: number
  cost: number
  working_status: string
  room_status: string
  expected_finish_date: string
  actual_deliver_date: string
  sales_id: string
  qc_id: string
  commission_month: string
  commission_rate: number
  commission_amount: number
  commission_status: string
  notes: string
  customers?: { customer_name: string; room_no: string }
  projects?: { name: string }
  sales?: { name: string }
}

const emptyJob = (): Partial<Job> => ({
  customer_type: 'B2C',
  working_status: 'ดำเนินการ',
  commission_status: 'pending',
  revenue_ex_vat: 0,
  revenue_inc_vat: 0,
  transfer_amount: 0,
  voucher: 0,
  cost: 0,
  commission_rate: 0,
  commission_amount: 0,
})

const f = (v?: number) => '฿' + Math.round(v || 0).toLocaleString()
const pct = (v?: number) => ((v || 0) * 100).toFixed(1) + '%'

function calcCommission(revenue: number, tiers: CommissionTier[]): { rate: number; amount: number } {
  const sorted = [...tiers].sort((a, b) => a.revenue_min - b.revenue_min)
  for (const t of sorted) {
    if (t.revenue_max === null || revenue <= t.revenue_max) {
      return { rate: t.rate, amount: Math.round(revenue * t.rate) }
    }
  }
  return { rate: 0, amount: 0 }
}

// ─────────────────────────────────────────
// Main Page
// ─────────────────────────────────────────
export default function JobsPage() {
  const supabase = createClient()
  const [jobs, setJobs] = useState<Job[]>([])
  const [customers, setCustomers] = useState<{ id: string; customer_name: string; room_no: string; project_id: string; project_name: string }[]>([])
  const [projects, setProjects] = useState<{ id: string; name: string }[]>([])
  const [users, setUsers] = useState<{ id: string; name: string }[]>([])
  const [tiers, setTiers] = useState<CommissionTier[]>([])
  const [myRole, setMyRole] = useState('')
  const [myId, setMyId] = useState('')
  const [loading, setLoading] = useState(true)

  // Filters
  const [search, setSearch] = useState('')
  const [filterProject, setFilterProject] = useState('')
  const [filterStatus, setFilterStatus] = useState('')
  const [filterSales, setFilterSales] = useState('')

  // Modal
  const [open, setOpen] = useState(false)
  const [editing, setEditing] = useState<Partial<Job>>(emptyJob())
  const [saving, setSaving] = useState(false)
  const [nextId, setNextId] = useState('JOB-001')

  // ─── Load ───
  const load = useCallback(async () => {
    const { data: { user } } = await supabase.auth.getUser()
    if (user) {
      const { data: u } = await supabase.from('users').select('id, role').eq('email', user.email!).single()
      if (u) { setMyRole(u.role); setMyId(u.id) }
    }
    const [
      { data: jobsData },
      { data: cusData },
      { data: projData },
      { data: usrData },
      { data: tierData },
    ] = await Promise.all([
      supabase.from('jobs').select('*, customers(customer_name,room_no), projects(name), sales:users!jobs_sales_id_fkey(name)').order('created_at', { ascending: false }),
      supabase.from('customers').select('id, customer_name, room_no, project_id, project_name').order('customer_name'),
      supabase.from('projects').select('id, name').eq('active', true).order('name'),
      supabase.from('users').select('id, name').eq('active', true).order('name'),
      supabase.from('commission_settings').select('*').eq('active', true).order('sort_order'),
    ])
    setJobs((jobsData as Job[]) || [])
    setCustomers(cusData || [])
    setProjects(projData || [])
    setUsers(usrData || [])
    setTiers(tierData || [])
    // Next ID
    const ids = (jobsData || []).map((j: Job) => parseInt(j.id.replace('JOB-', '')) || 0)
    const maxId = ids.length ? Math.max(...ids) : 0
    setNextId(`JOB-${String(maxId + 1).padStart(3, '0')}`)
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

  // ─── Commission auto-calc when revenue changes ───
  function handleRevenueChange(val: number) {
    const { rate, amount } = calcCommission(val, tiers)
    setEditing(e => ({ ...e, revenue_ex_vat: val, commission_rate: rate, commission_amount: amount }))
  }

  // ─── Open Add ───
  function openAdd() {
    setEditing({ ...emptyJob(), id: nextId, sales_id: myId })
    setOpen(true)
  }

  // ─── Open Edit ───
  function openEdit(j: Job) {
    setEditing({ ...j })
    setOpen(true)
  }

  // ─── Save ───
  async function save() {
    if (!editing.id) return
    setSaving(true)
    const payload = { ...editing }
    delete (payload as any).customers
    delete (payload as any).projects
    delete (payload as any).sales
    const isNew = !jobs.find(j => j.id === editing.id)
    if (isNew) {
      await supabase.from('jobs').insert([payload])
    } else {
      await supabase.from('jobs').update(payload).eq('id', editing.id!)
    }
    setSaving(false)
    setOpen(false)
    load()
  }

  // ─── Filter ───
  const filtered = jobs.filter(j => {
    const s = search.toLowerCase()
    const matchSearch = !s || [j.po_no, j.so_no, j.id,
      (j.customers as any)?.customer_name,
      (j.projects as any)?.name,
      j.room_no,
    ].some(v => v?.toLowerCase().includes(s))
    const matchProj = !filterProject || j.project_id === filterProject
    const matchStatus = !filterStatus || j.working_status === filterStatus
    const matchSales = !filterSales || j.sales_id === filterSales
    return matchSearch && matchProj && matchStatus && matchSales
  })

  // ─── Summary ───
  const totalRevenue = filtered.reduce((s, j) => s + (j.revenue_ex_vat || 0), 0)
  const totalCommission = filtered.reduce((s, j) => s + (j.commission_amount || 0), 0)
  const totalCost = filtered.reduce((s, j) => s + (j.cost || 0), 0)

  // ─── Form customer auto-fill ───
  function handleCustomerSelect(customerId: string) {
    const c = customers.find(x => x.id === customerId)
    setEditing(e => ({
      ...e,
      customer_id: customerId,
      project_id: c?.project_id || e.project_id,
      room_no: c?.room_no || e.room_no,
    }))
  }

  const profit = (editing.revenue_ex_vat || 0) - (editing.cost || 0)
  const gpPct = (editing.revenue_ex_vat || 0) > 0
    ? (profit / (editing.revenue_ex_vat || 1) * 100).toFixed(1) : '—'

  const canWrite = ['admin', 'admin_sales', 'sales'].includes(myRole)

  if (loading) return (
    <div className="flex items-center justify-center h-full" style={{ color: 'var(--text-3)' }}>
      <p className="text-sm">กำลังโหลด...</p>
    </div>
  )

  return (
    <div className="p-6 space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold" style={{ color: 'var(--text-1)' }}>ทะเบียนงาน (Jobs)</h1>
          <p className="text-xs mt-0.5" style={{ color: 'var(--text-3)' }}>บันทึก PO/SO ต่องาน · เทียบเท่า Sheet ลค. Event</p>
        </div>
        {canWrite && (
          <button onClick={openAdd}
            className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold text-white"
            style={{ background: 'linear-gradient(135deg,#6366f1,#8b5cf6)' }}>
            <Plus size={15} /> เพิ่มงาน
          </button>
        )}
      </div>

      {/* Summary KPI */}
      <div className="grid grid-cols-3 gap-4">
        {[
          { label: 'Revenue (Ex.VAT)', value: f(totalRevenue), color: '#4ade80' },
          { label: 'Cost รวม', value: f(totalCost), color: '#f87171' },
          { label: 'Commission รวม', value: f(totalCommission), color: '#fbbf24' },
        ].map(k => (
          <div key={k.label} className="glass-card p-4">
            <p className="text-xs mb-1" style={{ color: 'var(--text-3)' }}>{k.label}</p>
            <p className="text-lg font-bold" style={{ color: k.color }}>{k.value}</p>
          </div>
        ))}
      </div>

      {/* Filters */}
      <div className="glass-card p-4 flex flex-wrap gap-3">
        <div className="flex items-center gap-2 flex-1 min-w-48 rounded-xl px-3 py-2" style={{ background: 'var(--hover-bg)' }}>
          <Search size={14} style={{ color: 'var(--text-3)' }} />
          <input value={search} onChange={e => setSearch(e.target.value)}
            placeholder="ค้นหา PO / SO / ลูกค้า..." className="bg-transparent text-sm flex-1 outline-none"
            style={{ color: 'var(--text-1)' }} />
        </div>
        <select value={filterProject} onChange={e => setFilterProject(e.target.value)}
          className="rounded-xl px-3 py-2 text-sm outline-none"
          style={{ background: 'var(--hover-bg)', color: 'var(--text-2)' }}>
          <option value="">ทุกโครงการ</option>
          {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
        <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)}
          className="rounded-xl px-3 py-2 text-sm outline-none"
          style={{ background: 'var(--hover-bg)', color: 'var(--text-2)' }}>
          <option value="">ทุกสถานะ</option>
          {WORKING_STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
        </select>
        <select value={filterSales} onChange={e => setFilterSales(e.target.value)}
          className="rounded-xl px-3 py-2 text-sm outline-none"
          style={{ background: 'var(--hover-bg)', color: 'var(--text-2)' }}>
          <option value="">ทุก Sales</option>
          {users.map(u => <option key={u.id} value={u.id}>{u.name}</option>)}
        </select>
      </div>

      {/* Table */}
      <div className="glass-card overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr style={{ borderBottom: '1px solid var(--divider)' }}>
              {['Job ID','ลูกค้า','โครงการ / ห้อง','PO','SO','ประเภทงาน','Revenue','Cost','GP%','Commission','สถานะ','Sales','ส่งมอบ'].map(h => (
                <th key={h} className="text-left px-4 py-3 text-xs font-semibold"
                  style={{ color: 'var(--text-3)', whiteSpace: 'nowrap' }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 ? (
              <tr><td colSpan={13} className="text-center py-12 text-sm" style={{ color: 'var(--text-3)' }}>ยังไม่มีข้อมูล</td></tr>
            ) : filtered.map(j => {
              const profit = (j.revenue_ex_vat || 0) - (j.cost || 0)
              const gp = (j.revenue_ex_vat || 0) > 0 ? (profit / j.revenue_ex_vat * 100).toFixed(0) : '—'
              return (
                <tr key={j.id}
                  onClick={() => canWrite && openEdit(j)}
                  className="cursor-pointer transition-colors"
                  onMouseEnter={e => (e.currentTarget.style.background = 'var(--hover-bg)')}
                  onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                  style={{ borderBottom: '1px solid var(--divider)' }}>
                  <td className="px-4 py-3 font-mono text-xs" style={{ color: 'var(--accent)' }}>{j.id}</td>
                  <td className="px-4 py-3" style={{ color: 'var(--text-1)' }}>
                    <div className="font-medium">{(j.customers as any)?.customer_name || '—'}</div>
                    <div className="text-xs" style={{ color: 'var(--text-3)' }}>{j.customer_type}</div>
                  </td>
                  <td className="px-4 py-3" style={{ color: 'var(--text-2)' }}>
                    <div className="text-xs">{(j.projects as any)?.name || '—'}</div>
                    <div className="font-medium">{j.room_no || '—'}</div>
                  </td>
                  <td className="px-4 py-3 font-mono text-xs" style={{ color: 'var(--text-2)' }}>{j.po_no || '—'}</td>
                  <td className="px-4 py-3 font-mono text-xs" style={{ color: 'var(--text-2)' }}>{j.so_no || '—'}</td>
                  <td className="px-4 py-3">
                    <span className="px-2 py-0.5 rounded-full text-xs" style={{ background: 'var(--hover-bg)', color: 'var(--text-2)' }}>
                      {j.work_type || '—'}
                    </span>
                  </td>
                  <td className="px-4 py-3 font-semibold text-right" style={{ color: '#4ade80' }}>
                    {j.revenue_ex_vat ? f(j.revenue_ex_vat) : '—'}
                  </td>
                  <td className="px-4 py-3 text-right" style={{ color: '#f87171' }}>
                    {j.cost ? f(j.cost) : '—'}
                  </td>
                  <td className="px-4 py-3 text-right" style={{ color: profit >= 0 ? '#4ade80' : '#f87171' }}>
                    {gp !== '—' ? gp + '%' : '—'}
                  </td>
                  <td className="px-4 py-3 text-right" style={{ color: '#fbbf24' }}>
                    {j.commission_amount ? f(j.commission_amount) : '—'}
                    {j.commission_rate ? <div className="text-xs" style={{ color: 'var(--text-3)' }}>{pct(j.commission_rate)}</div> : null}
                  </td>
                  <td className="px-4 py-3">
                    <span className="px-2 py-0.5 rounded-full text-xs font-medium"
                      style={{
                        background: j.working_status === 'ส่งมอบแล้ว' ? 'rgba(74,222,128,0.15)' :
                          j.working_status === 'ยกเลิก' ? 'rgba(248,113,113,0.15)' : 'rgba(251,191,36,0.15)',
                        color: j.working_status === 'ส่งมอบแล้ว' ? '#4ade80' :
                          j.working_status === 'ยกเลิก' ? '#f87171' : '#fbbf24',
                      }}>
                      {j.working_status}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-xs" style={{ color: 'var(--text-2)' }}>
                    {(j.sales as any)?.name || '—'}
                  </td>
                  <td className="px-4 py-3 text-xs" style={{ color: 'var(--text-3)' }}>
                    {j.actual_deliver_date ? new Date(j.actual_deliver_date).toLocaleDateString('th-TH', { day: '2-digit', month: 'short' }) : '—'}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
        <div className="px-4 py-2 text-xs" style={{ color: 'var(--text-3)', borderTop: '1px solid var(--divider)' }}>
          {filtered.length} รายการ
        </div>
      </div>

      {/* ─── Add/Edit Modal ─── */}
      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ background: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(4px)' }}>
          <div className="w-full max-w-3xl max-h-[90vh] overflow-y-auto rounded-3xl p-6 space-y-5"
            style={{ background: 'var(--glass-bg)', border: '1px solid var(--glass-border)', backdropFilter: 'blur(32px)' }}>

            {/* Modal header */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Briefcase size={16} style={{ color: 'var(--accent)' }} />
                <h2 className="text-base font-bold" style={{ color: 'var(--text-1)' }}>
                  {jobs.find(j => j.id === editing.id) ? 'แก้ไขงาน' : 'เพิ่มงานใหม่'} — {editing.id}
                </h2>
              </div>
              <button onClick={() => setOpen(false)} style={{ color: 'var(--text-3)' }}><X size={18} /></button>
            </div>

            {/* ── Section: ลูกค้า & ห้อง ── */}
            <section>
              <p className="text-xs font-bold uppercase tracking-widest mb-3" style={{ color: 'var(--accent)' }}>ลูกค้า & ห้อง</p>
              <div className="grid grid-cols-2 gap-3">
                <div className="col-span-2">
                  <label className="field-label">ประเภทลูกค้า</label>
                  <div className="flex gap-2 mt-1">
                    {['B2C', 'B2B'].map(t => (
                      <button key={t} onClick={() => setEditing(e => ({ ...e, customer_type: t }))}
                        className="px-4 py-2 rounded-xl text-sm font-medium"
                        style={{
                          background: editing.customer_type === t ? 'var(--accent)' : 'var(--hover-bg)',
                          color: editing.customer_type === t ? '#fff' : 'var(--text-2)',
                        }}>{t}</button>
                    ))}
                  </div>
                </div>
                <div className="col-span-2">
                  <label className="field-label">ลูกค้า</label>
                  <select value={editing.customer_id || ''} onChange={e => handleCustomerSelect(e.target.value)}
                    className="field-input w-full mt-1">
                    <option value="">— เลือกลูกค้า —</option>
                    {customers.map(c => (
                      <option key={c.id} value={c.id}>{c.customer_name} ({c.project_name || c.project_id} · {c.room_no || 'ไม่มีห้อง'})</option>
                    ))}
                  </select>
                </div>
                {editing.customer_type === 'B2B' && (
                  <div className="col-span-2">
                    <label className="field-label">ชื่อบริษัท</label>
                    <input value={editing.company_name || ''} onChange={e => setEditing(e2 => ({ ...e2, company_name: e.target.value }))}
                      className="field-input w-full mt-1" placeholder="บริษัท..." />
                  </div>
                )}
                <div>
                  <label className="field-label">โครงการ</label>
                  <select value={editing.project_id || ''} onChange={e => setEditing(e2 => ({ ...e2, project_id: e.target.value }))}
                    className="field-input w-full mt-1">
                    <option value="">— เลือกโครงการ —</option>
                    {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                  </select>
                </div>
                <div>
                  <label className="field-label">เลขห้อง</label>
                  <input value={editing.room_no || ''} onChange={e => setEditing(e2 => ({ ...e2, room_no: e.target.value }))}
                    className="field-input w-full mt-1" placeholder="เช่น A201" />
                </div>
              </div>
            </section>

            {/* ── Section: Order ── */}
            <section>
              <p className="text-xs font-bold uppercase tracking-widest mb-3" style={{ color: 'var(--accent)' }}>ข้อมูลงาน / PO-SO</p>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="field-label">PO No. (Origin)</label>
                  <input value={editing.po_no || ''} onChange={e => setEditing(e2 => ({ ...e2, po_no: e.target.value }))}
                    className="field-input w-full mt-1" placeholder="WAG-SONO25-000001" />
                </div>
                <div>
                  <label className="field-label">SO No. (Wyde)</label>
                  <input value={editing.so_no || ''} onChange={e => setEditing(e2 => ({ ...e2, so_no: e.target.value }))}
                    className="field-input w-full mt-1" placeholder="SO-..." />
                </div>
                <div>
                  <label className="field-label">ประเภทงาน</label>
                  <select value={editing.work_type || ''} onChange={e => setEditing(e2 => ({ ...e2, work_type: e.target.value }))}
                    className="field-input w-full mt-1">
                    <option value="">— เลือก —</option>
                    {WORK_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                  </select>
                </div>
                <div>
                  <label className="field-label">Package</label>
                  <select value={editing.package_type || ''} onChange={e => setEditing(e2 => ({ ...e2, package_type: e.target.value }))}
                    className="field-input w-full mt-1">
                    <option value="">— เลือก —</option>
                    {PACKAGE_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                  </select>
                </div>
                <div>
                  <label className="field-label">วันที่รับ PO / วันที่รับยอด</label>
                  <input type="date" value={editing.order_date || ''} onChange={e => setEditing(e2 => ({ ...e2, order_date: e.target.value }))}
                    className="field-input w-full mt-1" />
                </div>
                <div>
                  <label className="field-label">Sales</label>
                  <select value={editing.sales_id || ''} onChange={e => setEditing(e2 => ({ ...e2, sales_id: e.target.value }))}
                    className="field-input w-full mt-1">
                    <option value="">— เลือก —</option>
                    {users.map(u => <option key={u.id} value={u.id}>{u.name}</option>)}
                  </select>
                </div>
              </div>
            </section>

            {/* ── Section: Revenue & Cost ── */}
            <section>
              <p className="text-xs font-bold uppercase tracking-widest mb-3" style={{ color: '#4ade80' }}>Revenue & Cost</p>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="field-label">Revenue (Ex.VAT) ฿</label>
                  <input type="number" value={editing.revenue_ex_vat || ''} onChange={e => handleRevenueChange(+e.target.value)}
                    className="field-input w-full mt-1" placeholder="0" />
                </div>
                <div>
                  <label className="field-label">Revenue (Inc.VAT) ฿</label>
                  <input type="number" value={editing.revenue_inc_vat || ''} onChange={e => setEditing(e2 => ({ ...e2, revenue_inc_vat: +e.target.value }))}
                    className="field-input w-full mt-1" placeholder="0" />
                </div>
                <div>
                  <label className="field-label">ยอดโอน (จาก Origin) ฿</label>
                  <input type="number" value={editing.transfer_amount || ''} onChange={e => setEditing(e2 => ({ ...e2, transfer_amount: +e.target.value }))}
                    className="field-input w-full mt-1" placeholder="0" />
                </div>
                <div>
                  <label className="field-label">Voucher / ส่วนลด ฿</label>
                  <input type="number" value={editing.voucher || ''} onChange={e => setEditing(e2 => ({ ...e2, voucher: +e.target.value }))}
                    className="field-input w-full mt-1" placeholder="0" />
                </div>
                <div>
                  <label className="field-label">Cost ฿</label>
                  <input type="number" value={editing.cost || ''} onChange={e => setEditing(e2 => ({ ...e2, cost: +e.target.value }))}
                    className="field-input w-full mt-1" placeholder="0" />
                </div>
                {/* Profit display */}
                <div className="rounded-xl p-3 flex flex-col justify-center" style={{ background: 'var(--hover-bg)' }}>
                  <div className="flex items-center gap-1 mb-1">
                    <Calculator size={12} style={{ color: 'var(--text-3)' }} />
                    <span className="text-xs" style={{ color: 'var(--text-3)' }}>Profit / GP%</span>
                  </div>
                  <p className="font-bold text-sm" style={{ color: profit >= 0 ? '#4ade80' : '#f87171' }}>
                    {f(profit)} <span style={{ color: 'var(--text-3)', fontWeight: 400 }}>({gpPct}%)</span>
                  </p>
                </div>
              </div>
            </section>

            {/* ── Section: Commission ── */}
            <section>
              <p className="text-xs font-bold uppercase tracking-widest mb-3" style={{ color: '#fbbf24' }}>Commission</p>
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="field-label">Rate (อัตโนมัติจาก Revenue)</label>
                  <div className="field-input mt-1 flex items-center gap-2" style={{ background: 'var(--hover-bg)' }}>
                    <span style={{ color: 'var(--text-1)', fontWeight: 600 }}>{pct(editing.commission_rate)}</span>
                    <span className="text-xs" style={{ color: 'var(--text-3)' }}>
                      {tiers.find(t => t.rate === editing.commission_rate)?.tier_name || ''}
                    </span>
                  </div>
                </div>
                <div>
                  <label className="field-label">Commission ฿</label>
                  <input type="number" value={editing.commission_amount || ''} onChange={e => setEditing(e2 => ({ ...e2, commission_amount: +e.target.value }))}
                    className="field-input w-full mt-1" placeholder="0" />
                </div>
                <div>
                  <label className="field-label">เดือนเบิก Commission</label>
                  <input type="month" value={editing.commission_month?.slice(0, 7) || ''} onChange={e => setEditing(e2 => ({ ...e2, commission_month: e.target.value + '-01' }))}
                    className="field-input w-full mt-1" />
                </div>
                <div className="col-span-3">
                  <label className="field-label">สถานะ Commission</label>
                  <div className="flex gap-2 mt-1">
                    {COMMISSION_STATUSES.map(s => (
                      <button key={s} onClick={() => setEditing(e => ({ ...e, commission_status: s }))}
                        className="px-3 py-1.5 rounded-xl text-xs font-medium"
                        style={{
                          background: editing.commission_status === s ? 'var(--accent)' : 'var(--hover-bg)',
                          color: editing.commission_status === s ? '#fff' : 'var(--text-2)',
                        }}>
                        {COMMISSION_STATUS_LABEL[s]}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            </section>

            {/* ── Section: Status & Delivery ── */}
            <section>
              <p className="text-xs font-bold uppercase tracking-widest mb-3" style={{ color: 'var(--text-3)' }}>สถานะ & ส่งมอบ</p>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="field-label">สถานะการทำงาน</label>
                  <select value={editing.working_status || ''} onChange={e => setEditing(e2 => ({ ...e2, working_status: e.target.value }))}
                    className="field-input w-full mt-1">
                    {WORKING_STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
                  </select>
                </div>
                <div>
                  <label className="field-label">สถานะห้อง</label>
                  <input value={editing.room_status || ''} onChange={e => setEditing(e2 => ({ ...e2, room_status: e.target.value }))}
                    className="field-input w-full mt-1" placeholder="เช่น ดำเนินการ / รอตรวจรับ" />
                </div>
                <div>
                  <label className="field-label">วันที่คาดส่งมอบ</label>
                  <input type="date" value={editing.expected_finish_date || ''} onChange={e => setEditing(e2 => ({ ...e2, expected_finish_date: e.target.value }))}
                    className="field-input w-full mt-1" />
                </div>
                <div>
                  <label className="field-label">วันที่ส่งมอบจริง</label>
                  <input type="date" value={editing.actual_deliver_date || ''} onChange={e => setEditing(e2 => ({ ...e2, actual_deliver_date: e.target.value }))}
                    className="field-input w-full mt-1" />
                </div>
                <div>
                  <label className="field-label">QC</label>
                  <select value={editing.qc_id || ''} onChange={e => setEditing(e2 => ({ ...e2, qc_id: e.target.value }))}
                    className="field-input w-full mt-1">
                    <option value="">— เลือก QC —</option>
                    {users.map(u => <option key={u.id} value={u.id}>{u.name}</option>)}
                  </select>
                </div>
                <div>
                  <label className="field-label">หมายเหตุ</label>
                  <input value={editing.notes || ''} onChange={e => setEditing(e2 => ({ ...e2, notes: e.target.value }))}
                    className="field-input w-full mt-1" placeholder="..." />
                </div>
              </div>
            </section>

            {/* Actions */}
            <div className="flex items-center justify-end gap-3 pt-2">
              <button onClick={() => setOpen(false)} className="px-4 py-2 rounded-xl text-sm"
                style={{ background: 'var(--hover-bg)', color: 'var(--text-2)' }}>ยกเลิก</button>
              <button onClick={save} disabled={saving}
                className="px-6 py-2 rounded-xl text-sm font-semibold text-white"
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
