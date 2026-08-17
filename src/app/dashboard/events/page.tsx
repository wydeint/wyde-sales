'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Plus, CalendarDays, Pencil, Users, ChevronDown, ChevronUp, TrendingUp, UserPlus, CheckCircle2, Smartphone, Save } from 'lucide-react'
import { PageError, EmptyState } from '@/components/ui/StateUI'
import Modal from '@/components/ui/Modal'
import PageHeader from '@/components/ui/PageHeader'
import { Input, Select, TextArea } from '@/components/ui/Input'

interface Project { id: string; name: string }
interface Lead { id: number; tower: string; room_no: string; customer_name: string; phone: string }
interface SalesUser { id: string; name: string }

interface EventCustomer {
  id: string
  customer_name: string
  phone: string
  email: string
  project_id: string | null
  lead_id: number | null
  room_no: string
  sales_id: string | null
  status: string
  booked_date: string | null
  booked_value: number
  deposit_amount: number
  booking_type: string
  notes: string
  line_added: boolean
  users?: { name: string }
}

interface Event {
  id: string; project_id: string; project_name: string; event_type: string; event_name: string
  event_date: string; location: string; total_attendees: number; line_adds: number; notes: string
}

const EVENT_TYPES = [
  { value: '', label: '— ประเภท —' },
  { value: 'ori_sales_event', label: 'ORI Sales Event' },
  { value: 'room_transfer', label: 'Room Transfer' },
  { value: 'financial_day', label: 'Financial Day' },
  { value: 'wyde_event', label: 'Wyde Event' },
  { value: 'online', label: 'Online Event' },
  { value: 'other', label: 'อื่นๆ' },
]

const CUST_STATUS = [
  { value: 'booked',          label: 'Booked',                    color: 'badge badge-green' },
  { value: 'converted',       label: 'เข้าระบบแล้ว',              color: 'badge badge-blue' },
  { value: 'interested',      label: 'สนใจ ติดตามต่อ',            color: 'badge badge-orange' },
  { value: 'not_interested',  label: 'ไม่สนใจ',                   color: 'badge badge-red' },
  { value: 'not_met',         label: 'ไม่ได้พบ ติดตามภายหลัง',   color: 'badge badge-gray' },
]

const BOOKING_TYPES = [
  { value: 'Event', label: 'Event' },
  { value: 'Walk-in', label: 'Walk-in' },
  { value: 'Other', label: 'Other' },
]

const emptyEvent = {
  project_id: '', project_name: '', event_type: '', event_name: '',
  event_date: '', location: '', total_attendees: 0, line_adds: 0, notes: ''
}

const emptyCust = {
  project_id: '', lead_id: '', sales_id: '', room_no: '',
  customer_name: '', phone: '', email: '',
  status: 'booked', booked_date: '', booked_value: '',
  deposit_amount: '', booking_type: 'Event', notes: ''
}

const fmtBaht = (n: number) => n ? '฿' + n.toLocaleString() : '—'
const dateStr = (d: string | null) => d ? new Date(d).toLocaleDateString('th-TH', { day: '2-digit', month: 'short', year: '2-digit' }) : '—'

export default function EventsPage() {
  const supabase = createClient()
  const [events, setEvents] = useState<Event[]>([])
  const [projects, setProjects] = useState<Project[]>([])
  const [salesUsers, setSalesUsers] = useState<SalesUser[]>([])
  const [loading, setLoading] = useState(true)

  const [openEvent, setOpenEvent] = useState(false)
  const [openCustomer, setOpenCustomer] = useState(false)
  const [editingEvent, setEditingEvent] = useState<Event | null>(null)
  const [selectedEvent, setSelectedEvent] = useState<Event | null>(null)
  const [customers, setCustomers] = useState<EventCustomer[]>([])
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [eventLeads, setEventLeads] = useState<Lead[]>([])

  const [form, setForm] = useState(emptyEvent)
  const [custForm, setCustForm] = useState(emptyCust)
  const [saving, setSaving] = useState(false)
  const [promotedIds, setPromotedIds] = useState<Set<string>>(new Set())
  const [promotingAll, setPromotingAll] = useState(false)
  const [systemStatus, setSystemStatus] = useState<Map<string, string>>(new Map()) // event_customer.id → "Wyde Clients"|"Prospects"
  const [fetchError, setFetchError] = useState('')
  const [editingCustomer, setEditingCustomer] = useState<EventCustomer | null>(null)
  const [editCustForm, setEditCustForm] = useState(emptyCust)
  const [editSaving, setEditSaving] = useState(false)
  // Dup check state for Add Customer modal
  const [dupCheck, setDupCheck] = useState<{
    checking: boolean
    inEvent: string | null          // ชื่อลูกค้าที่ซ้ำในงานนี้ → block
    inSystem: { src: string; name: string } | null  // มีในระบบ → warn
  }>({ checking: false, inEvent: null, inSystem: null })
  const [dupConfirmed, setDupConfirmed] = useState(false)

  async function load() {
    setLoading(true)
    setFetchError('')
    const [{ data: ev, error: e1 }, { data: pr }, { data: u }] = await Promise.all([
      supabase.from('events').select('*').order('event_date', { ascending: false }),
      supabase.from('projects').select('id,name').eq('active', true).order('name'),
      supabase.from('users').select('id,name').eq('active', true).eq('role', 'sales').order('name'),
    ])
    if (e1) { setFetchError(e1.message); setLoading(false); return }
    setEvents(ev || [])
    setProjects(pr || [])
    setSalesUsers(u || [])
    setLoading(false)
  }

  async function loadCustomers(eventId: string) {
    const { data } = await supabase.from('event_customers')
      .select('*, users:sales_id(name)')
      .eq('event_id', eventId)
      .order('created_at')
    const rows: EventCustomer[] = (data as any) || []
    setCustomers(rows)

    // Batch-check which event_customers already exist in jobs / customers
    const phones = rows.map(c => c.phone).filter(Boolean) as string[]
    const leadIds = rows.map(c => c.lead_id).filter(Boolean) as number[]
    const eventCustIds = rows.map(c => c.id)

    const [{ data: jobRows }, { data: custRows }, { data: byEventCustId }] = await Promise.all([
      phones.length
        ? supabase.from('jobs').select('phone, customer_name').in('phone', phones)
        : Promise.resolve({ data: [] }),
      phones.length
        ? supabase.from('customers').select('phone, customer_name, status').in('phone', phones)
        : Promise.resolve({ data: [] }),
      supabase.from('customers').select('event_customer_id').in('event_customer_id', eventCustIds),
    ])

    const jobPhones = new Set((jobRows || []).map((j: any) => j.phone))
    const custPhones = new Set((custRows || []).map((c: any) => c.phone))
    const ecIdLinked = new Set((byEventCustId || []).map((c: any) => c.event_customer_id).filter(Boolean))

    const statusMap = new Map<string, string>()
    const alreadyPromoted = new Set<string>()
    for (const c of rows) {
      const inJob = c.phone && jobPhones.has(c.phone)
      const inCust = c.phone && custPhones.has(c.phone)
      const linked = ecIdLinked.has(c.id)
      const isConverted = normStatus(c.status) === 'converted'
      if (inJob) { statusMap.set(c.id, 'Wyde Clients'); alreadyPromoted.add(c.id) }
      else if (inCust || linked) { statusMap.set(c.id, 'Prospects'); alreadyPromoted.add(c.id) }
      else if (isConverted) { alreadyPromoted.add(c.id) }
    }
    setSystemStatus(statusMap)
    setPromotedIds(prev => new Set([...prev, ...alreadyPromoted]))
  }

  async function loadLeads(projectId: string) {
    if (!projectId) { setEventLeads([]); return }
    const { data } = await supabase.from('condo_leads')
      .select('id,tower,room_no,customer_name,phone')
      .eq('project_id', projectId)
      .order('tower').order('room_no')
    setEventLeads((data as any) || [])
  }

  useEffect(() => { load() }, [])

  function genEventId() {
    const nums = events.map(e => parseInt(e.id.replace('EVT-', ''))).filter(n => !isNaN(n))
    return 'EVT-' + String(nums.length > 0 ? Math.max(...nums) + 1 : 1).padStart(3, '0')
  }

  async function genJobId(): Promise<string> {
    const { data } = await supabase.from('jobs').select('id').order('id', { ascending: false }).limit(1)
    if (!data || data.length === 0) return 'JOB-001'
    const last = data[0].id.replace('JOB-', '')
    const num = parseInt(last) || 0
    return 'JOB-' + String(num + 1).padStart(3, '0')
  }

  async function genCustomerId(): Promise<string> {
    const { data } = await supabase.from('customers').select('id').order('created_at', { ascending: false }).limit(1)
    if (!data || data.length === 0) return 'PROS-001'
    return 'PROS-' + Date.now().toString(36).toUpperCase().slice(-6)
  }

  async function saveEvent() {
    if (!form.event_name) return
    setSaving(true)
    const proj = projects.find(p => p.id === form.project_id)
    const data = {
      ...form,
      project_name: proj?.name || '',
      project_id: form.project_id || null,
      event_date: form.event_date || null,
      event_type: form.event_type || null,
    }
    if (editingEvent) {
      await supabase.from('events').update(data).eq('id', editingEvent.id)
    } else {
      await supabase.from('events').insert({ id: genEventId(), ...data })
    }
    setSaving(false); setOpenEvent(false); load()
  }

  async function saveCustomer() {
    if (!custForm.customer_name || !selectedEvent) return
    if (dupCheck.inEvent) return  // blocked — ซ้ำในงานนี้
    if (dupCheck.inSystem && !dupConfirmed) return  // ต้องกด confirm ก่อน
    setSaving(true)
    const selectedLead = eventLeads.find(l => String(l.id) === custForm.lead_id)
    const payload: any = {
      event_id: selectedEvent.id,
      project_id: custForm.project_id || null,
      lead_id: Number(custForm.lead_id) || null,
      room_no: custForm.room_no || (selectedLead ? `${selectedLead.tower}-${selectedLead.room_no}` : ''),
      sales_id: custForm.sales_id || null,
      customer_name: custForm.customer_name,
      phone: custForm.phone || null,
      email: custForm.email || null,
      status: custForm.status,
      booked_date: custForm.booked_date || null,
      booked_value: Number(custForm.booked_value) || 0,
      deposit_amount: Number(custForm.deposit_amount) || 0,
      booking_type: custForm.booking_type,
      notes: custForm.notes || null,
    }
    await supabase.from('event_customers').insert(payload)
    setSaving(false); setOpenCustomer(false)
    setCustForm(emptyCust); setEventLeads([])
    setDupCheck({ checking: false, inEvent: null, inSystem: null }); setDupConfirmed(false)
    loadCustomers(selectedEvent.id)
  }

  // ── Dup check for Add Customer modal ────────────────────
  function normPhone(p: string) {
    return (p || '').replace(/[\s\-().+]/g, '').replace(/^66/, '0').trim()
  }

  async function checkDup(phone: string, name: string) {
    if (!phone && !name) return
    setDupCheck({ checking: true, inEvent: null, inSystem: null })
    const ph = normPhone(phone)
    let inEvent: string | null = null
    let inSystem: { src: string; name: string } | null = null

    // 1. Check same event
    if (selectedEvent) {
      const q = supabase.from('event_customers').select('customer_name, phone').eq('event_id', selectedEvent.id)
      const { data: ec } = await q
      for (const c of (ec || []) as any[]) {
        const samePh = ph && normPhone(c.phone) === ph
        const sameName = name && c.customer_name?.toLowerCase() === name.toLowerCase()
        if (samePh || sameName) { inEvent = c.customer_name; break }
      }
    }

    // 2. Check system (customers, jobs, condo_leads) — only if phone provided
    if (!inEvent && ph) {
      const [{ data: cust }, { data: jobs }, { data: leads }] = await Promise.all([
        supabase.from('customers').select('customer_name').eq('phone', phone).limit(1),
        supabase.from('jobs').select('customer_name').eq('phone', phone).limit(1),
        supabase.from('condo_leads').select('customer_name').eq('phone', phone).limit(1),
      ])
      if (cust?.[0]) inSystem = { src: 'Prospects/Pipeline', name: (cust[0] as any).customer_name }
      else if (jobs?.[0]) inSystem = { src: 'Wyde Clients', name: (jobs[0] as any).customer_name }
      else if (leads?.[0]) inSystem = { src: 'Origin Pool', name: (leads[0] as any).customer_name }
    }

    setDupCheck({ checking: false, inEvent, inSystem })
    if (inEvent || inSystem) setDupConfirmed(false)
  }

  // ── Dedup helper: find existing customer by lead_id → phone
  async function findExistingCustomer(c: EventCustomer): Promise<string | null> {
    if (c.lead_id) {
      const { data } = await supabase.from('customers').select('id').eq('lead_id', c.lead_id).maybeSingle()
      if (data) return data.id
    }
    if (c.phone) {
      const { data } = await supabase.from('customers').select('id').eq('phone', c.phone).maybeSingle()
      if (data) return data.id
    }
    return null
  }

  // Check job duplicate: same customer + room
  async function jobExists(customerId: string, roomNo: string | null): Promise<boolean> {
    if (!roomNo) return false
    const { data } = await supabase.from('jobs')
      .select('id').eq('customer_id', customerId).eq('room_no', roomNo).maybeSingle()
    return !!data
  }

  // Promote booked → jobs table (auto-create job)
  async function promoteBooked(c: EventCustomer) {
    if (promotedIds.has(c.id)) return

    // 1. Find or create customer (dedup by lead_id → phone)
    let customerId = await findExistingCustomer(c)
    if (customerId) {
      await supabase.from('customers').update({ status: 'booked', booking_date: c.booked_date || undefined })
        .eq('id', customerId)
    } else {
      customerId = await genCustomerId()
      const projectId = c.project_id || selectedEvent?.project_id || null
      await supabase.from('customers').insert({
        id: customerId,
        customer_name: c.customer_name,
        phone: c.phone || null,
        email: c.email || null,
        project_id: projectId,
        interested_room: c.room_no || null,
        lead_id: c.lead_id || null,
        event_customer_id: c.id,
        source_event_id: selectedEvent?.id || null,
        source: 'event',
        status: 'booked',
        booking_date: c.booked_date || null,
      })
    }

    // 2. Create job only if not duplicate (same customer + room)
    const alreadyHasJob = await jobExists(customerId, c.room_no || null)
    if (!alreadyHasJob) {
      const jobId = await genJobId()
      const projId = c.project_id || selectedEvent?.project_id || null
      const exVat = c.booked_value || 0
      const incVat = exVat ? Math.round(exVat * 1.07) : 0
      await supabase.from('jobs').insert({
        id: jobId,
        customer_id: customerId,
        project_id: projId,
        room_no: c.room_no || null,
        lead_id: c.lead_id || null,
        customer_name: c.customer_name,
        sales_id: c.sales_id || null,
        customer_type: 'B2C',
        revenue_ex_vat: exVat,
        revenue_inc_vat: incVat,
        order_date: c.booked_date || null,
        working_status: 'ดำเนินการ',
      })
    }

    setPromotedIds(prev => new Set(prev).add(c.id))
  }

  // Promote interested / not_met → customers (Prospects)
  async function promoteToProspect(c: EventCustomer) {
    if (promotedIds.has(c.id)) return
    // Dedup by lead_id → phone
    const existing = await findExistingCustomer(c)
    if (existing) {
      setPromotedIds(prev => new Set(prev).add(c.id))
      return
    }
    const customerId = await genCustomerId()
    await supabase.from('customers').insert({
      id: customerId,
      customer_name: c.customer_name,
      phone: c.phone || null,
      email: c.email || null,
      project_id: c.project_id || selectedEvent?.project_id || null,
      interested_room: c.room_no || null,
      lead_id: c.lead_id || null,
      event_customer_id: c.id,
      source_event_id: selectedEvent?.id || null,
      source: 'event',
      status: 'interested',
      first_contact_date: c.booked_date || null,
    })
    setPromotedIds(prev => new Set(prev).add(c.id))
  }

  async function promoteCustomer(c: EventCustomer) {
    const s = normStatus(c.status)
    if (s === 'booked') await promoteBooked(c)
    else if (s === 'interested' || s === 'not_met') await promoteToProspect(c)
  }

  async function promoteAll() {
    setPromotingAll(true)
    const eligible = customers.filter(c =>
      normStatus(c.status) !== 'not_interested' && !promotedIds.has(c.id)
    )
    for (const c of eligible) {
      await promoteCustomer(c)
    }
    setPromotingAll(false)
  }

  async function updateCustomerStatus(id: string, status: string) {
    await supabase.from('event_customers').update({ status }).eq('id', id)
    if (selectedEvent) loadCustomers(selectedEvent.id)
  }

  async function toggleLineAdded(id: string, current: boolean) {
    await supabase.from('event_customers').update({ line_added: !current }).eq('id', id)
    if (selectedEvent) loadCustomers(selectedEvent.id)
  }

  async function saveEditCustomer() {
    if (!editingCustomer || !selectedEvent) return
    setEditSaving(true)
    await supabase.from('event_customers').update({
      customer_name: editCustForm.customer_name,
      phone: editCustForm.phone || null,
      room_no: editCustForm.room_no || null,
      sales_id: editCustForm.sales_id || null,
      status: editCustForm.status,
      booked_date: editCustForm.booked_date || null,
      booked_value: Number(editCustForm.booked_value) || 0,
      deposit_amount: Number(editCustForm.deposit_amount) || 0,
      booking_type: editCustForm.booking_type,
      notes: editCustForm.notes || null,
    }).eq('id', editingCustomer.id)
    setEditSaving(false)
    setEditingCustomer(null)
    loadCustomers(selectedEvent.id)
  }

  function toggleExpand(ev: Event) {
    if (expandedId === ev.id) {
      setExpandedId(null)
    } else {
      setExpandedId(ev.id)
      setSelectedEvent(ev)
      setPromotedIds(new Set())
      setSystemStatus(new Map())
      loadCustomers(ev.id)
    }
  }

  const normStatus = (s: string | null | undefined): string => {
    if (!s || s.trim() === '') return 'booked'
    const lower = s.toLowerCase().trim()
    const map: Record<string, string> = { booked: 'booked', interested: 'interested', not_interested: 'not_interested', not_met: 'not_met' }
    return map[lower] ?? lower
  }
  const stColor = (s: string | null | undefined) => CUST_STATUS.find(x => x.value === normStatus(s))?.color || 'badge badge-gray'
  const stLabel = (s: string | null | undefined) => CUST_STATUS.find(x => x.value === normStatus(s))?.label || s || ''
  const typeLabel = (t: string) => EVENT_TYPES.find(e => e.value === t)?.label || t

  const projOptions = [{ value: '', label: '— เลือกโครงการ —' }, ...projects.map(p => ({ value: p.id, label: p.name }))]
  const salesOptions = [{ value: '', label: '— Sales —' }, ...salesUsers.map(u => ({ value: u.id, label: u.name }))]
  const leadOptions = [
    { value: '', label: '— เลือกห้อง —' },
    ...eventLeads.map(l => ({ value: String(l.id), label: `${l.tower}-${l.room_no} — ${l.customer_name}` }))
  ]

  function calcPerf() {
    const isBooked = (x: EventCustomer) => normStatus(x.status) === 'booked' || normStatus(x.status) === 'converted'
    const booked       = customers.filter(isBooked).length
    const interested   = customers.filter(x => x.status === 'interested').length
    const notInterested = customers.filter(x => x.status === 'not_interested').length
    const notMet       = customers.filter(x => x.status === 'not_met').length
    const lineAdds     = customers.filter(x => x.line_added).length
    const attendees    = selectedEvent?.total_attendees || 0
    const conv = attendees > 0 ? Math.round((booked / attendees) * 100) : 0
    const revenue      = customers.filter(isBooked).reduce((s, x) => s + (Number(x.booked_value) || 0), 0)
    const totalDeposit = customers.filter(isBooked).reduce((s, x) => s + (Number(x.deposit_amount) || 0), 0)
    return { booked, interested, notInterested, notMet, lineAdds, conv, revenue, totalDeposit }
  }

  function getPromoteLabel(c: EventCustomer): string | null {
    const s = normStatus(c.status)
    if (s === 'booked')      return '→ Wyde Clients'
    if (s === 'interested')  return '→ Prospects'
    if (s === 'not_met')     return '→ Prospects'
    return null
  }

  return (
    <div className="page-content">
      <PageHeader
        title="Events"
        subtitle="จัดการงาน Event · บันทึกลูกค้า · ติดตาม Performance"
        actions={
          <button onClick={() => { setEditingEvent(null); setForm(emptyEvent); setOpenEvent(true) }}
            className="flex items-center gap-2 btn-green text-white px-3 py-2 sm:px-4 rounded-lg text-sm font-semibold transition-colors flex-shrink-0">
            <Plus size={16} /><span className="hidden sm:inline">เพิ่ม Event</span><span className="sm:hidden">เพิ่ม</span>
          </button>
        }
      />

      <div className="space-y-3">
        {loading && <div className="flex justify-center py-12"><div className="w-7 h-7 rounded-full border-2 border-t-transparent animate-spin" style={{ borderColor: 'var(--accent)', borderTopColor: 'transparent' }} role="status" aria-label="กำลังโหลด" /></div>}
        {!loading && fetchError && <PageError message={fetchError} onRetry={load} />}
        {!loading && events.length === 0 && (
          <div className="ds-card"><EmptyState icon={CalendarDays} message="ยังไม่มี Event" /></div>
        )}

        {events.map(ev => {
          const isExpanded = expandedId === ev.id
          const perf = isExpanded ? calcPerf() : null

          return (
            <div key={ev.id} className="ds-card overflow-hidden">
              {/* Event row */}
              <div className="flex items-start gap-3 px-4 py-4">
                <div className="flex-1 min-w-0">
                  {/* Title + badges */}
                  <div className="flex flex-wrap items-center gap-x-2 gap-y-1 mb-1.5">
                    <span className="text-accent-blue text-xs font-mono flex-shrink-0">{ev.id}</span>
                    <h3 className="font-semibold text-sm" style={{ color: 'var(--text-1)' }}>{ev.event_name}</h3>
                    {ev.event_type && <span className="text-xs px-1.5 py-0.5 rounded" style={{ background: 'var(--hover-bg)', color: 'var(--text-2)' }}>{typeLabel(ev.event_type)}</span>}
                    {ev.project_name && <span className="text-xs px-1.5 py-0.5 rounded" style={{ background: 'var(--hover-bg)', color: 'var(--text-2)' }}>{ev.project_name}</span>}
                  </div>
                  {/* Meta — wraps on mobile */}
                  <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-xs" style={{ color: 'var(--text-2)' }}>
                    {ev.event_date && <span>📅 {new Date(ev.event_date).toLocaleDateString('th-TH', { day: '2-digit', month: 'short', year: '2-digit' })}</span>}
                    {ev.location && <span className="truncate max-w-[140px]">📍 {ev.location}</span>}
                    <span>👥 {ev.total_attendees}</span>
                    <span>📲 LINE {ev.line_adds}</span>
                  </div>
                </div>
                {/* Action buttons — stack tightly */}
                <div className="flex items-center gap-1.5 flex-shrink-0">
                  <button onClick={() => {
                    setSelectedEvent(ev)
                    setCustForm({ ...emptyCust, project_id: ev.project_id || '', booked_date: ev.event_date || '' })
                    if (ev.project_id) loadLeads(ev.project_id)
                    setOpenCustomer(true)
                  }}
                    className="flex items-center gap-1 text-xs btn-blue text-white px-2.5 py-1.5 rounded-lg transition-colors">
                    <Users size={12} /><span className="hidden sm:inline">เพิ่มลูกค้า</span><span className="sm:hidden">+</span>
                  </button>
                  <button onClick={() => {
                    setEditingEvent(ev)
                    setForm({ project_id: ev.project_id, project_name: ev.project_name, event_type: ev.event_type || '', event_name: ev.event_name, event_date: ev.event_date, location: ev.location, total_attendees: ev.total_attendees, line_adds: ev.line_adds, notes: ev.notes })
                    setOpenEvent(true)
                  }} className="p-2 rounded-lg transition-colors" style={{ color: 'var(--text-2)', background: 'var(--hover-bg)' }}>
                    <Pencil size={14} />
                  </button>
                  <button onClick={() => toggleExpand(ev)} className="p-2 rounded-lg transition-colors" style={{ color: 'var(--text-2)', background: 'var(--hover-bg)' }}>
                    {isExpanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                  </button>
                </div>
              </div>

              {/* Expanded: Performance + Customer List */}
              {isExpanded && (
                <div style={{ borderTop: '1px solid var(--divider)' }}>

                  {/* Performance Summary */}
                  {perf && (
                    <div className="px-4 py-4" style={{ background: 'var(--hover-bg)' }}>
                      <div className="flex items-center gap-2 mb-3">
                        <TrendingUp size={13} className="text-success" />
                        <p className="text-label-upper text-success">Performance</p>
                      </div>

                      {/* KPI row */}
                      <div className="grid grid-cols-4 sm:grid-cols-7 gap-2 mb-4">
                        {[
                          { label: 'ลูกค้ามา', value: ev.total_attendees, color: 'var(--text-1)' },
                          { label: 'ปิดการขาย', value: perf.booked, colorClass: 'text-success' },
                          { label: 'สนใจ ติดตามต่อ', value: perf.interested, colorClass: 'text-value' },
                          { label: 'ไม่สนใจ', value: perf.notInterested, colorClass: 'text-danger' },
                          { label: 'ไม่ได้พบ', value: perf.notMet, color: 'var(--text-3)' },
                          { label: 'Add LINE', value: perf.lineAdds, colorClass: 'text-success' },
                          { label: 'Conv%', value: perf.conv + '%', colorClass: perf.conv >= 20 ? 'text-success' : 'text-value' },
                        ].map(k => (
                          <div key={k.label} className="rounded-[18px] p-3 text-center" style={{ background: 'var(--card-bg)' }}>
                            <p className="text-micro mb-1 leading-tight" style={{ color: 'var(--text-3)' }}>{k.label}</p>
                            <p className={`text-lg font-bold ${'colorClass' in k ? k.colorClass : ''}`} style={'color' in k && k.color ? { color: k.color } : undefined}>{k.value}</p>
                          </div>
                        ))}
                      </div>

                      {/* Revenue row */}
                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                        <div className="rounded-[18px] p-3" style={{ background: 'var(--card-bg)' }}>
                          <p className="text-micro mb-1" style={{ color: 'var(--text-3)' }}>มูลค่างานรวม (Booked Value)</p>
                          <p className="text-success font-bold">{fmtBaht(perf.revenue)}</p>
                          <p className="text-micro" style={{ color: 'var(--text-3)' }}>{perf.booked} ห้อง booked</p>
                        </div>
                        <div className="rounded-[18px] p-3" style={{ background: 'var(--card-bg)' }}>
                          <p className="text-micro mb-1" style={{ color: 'var(--text-3)' }}>เฉลี่ย / ห้อง</p>
                          <p className="text-info font-bold">{fmtBaht(perf.booked > 0 ? Math.round(perf.revenue / perf.booked) : 0)}</p>
                          <p className="text-micro" style={{ color: 'var(--text-3)' }}>avg booked value</p>
                        </div>
                        <div className="rounded-[18px] p-3" style={{ background: 'var(--card-bg)' }}>
                          <p className="text-micro mb-1" style={{ color: 'var(--text-3)' }}>มัดจำ (เงินสด)</p>
                          <p className="text-premium font-bold">{fmtBaht(perf.totalDeposit)}</p>
                          <p className="text-micro" style={{ color: 'var(--text-3)' }}>{perf.booked} ห้องที่เก็บมัดจำ</p>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Customer List header */}
                  <div className="px-4 py-2 flex items-center justify-between" style={{ background: 'var(--hover-bg)' }}>
                    <p className="text-xs font-semibold" style={{ color: 'var(--text-2)' }}>รายชื่อลูกค้าในงาน ({customers.length} คน)</p>
                    {customers.some(c => normStatus(c.status) !== 'not_interested' && !promotedIds.has(c.id)) && (
                      <button
                        onClick={promoteAll}
                        disabled={promotingAll}
                        className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg text-accent transition-colors font-semibold disabled:opacity-50"
                        style={{ background: 'color-mix(in srgb, var(--accent) 15%, transparent)' }}
                      >
                        <UserPlus size={12} />
                        {promotingAll ? 'กำลังนำเข้า...' : 'นำรายชื่อเข้าระบบ'}
                      </button>
                    )}
                  </div>

                  {customers.length === 0 && (
                    <div className="px-4 py-6 text-center text-sm" style={{ color: 'var(--text-2)' }}>ยังไม่มีรายชื่อลูกค้า</div>
                  )}
                  {customers.length > 0 && (
                    <div className="overflow-x-auto">
                      <table className="w-full" style={{ minWidth: 700 }}>
                        <thead>
                          <tr style={{ borderBottom: '1px solid var(--divider)' }}>
                            <th className="text-left px-3 py-2 text-xs" style={{ color: 'var(--text-3)' }}>#</th>
                            <th className="text-left px-3 py-2 text-xs" style={{ color: 'var(--text-3)' }}>โครงการ</th>
                            <th className="text-left px-3 py-2 text-xs" style={{ color: 'var(--text-3)' }}>ห้อง</th>
                            <th className="text-left px-3 py-2 text-xs" style={{ color: 'var(--text-3)' }}>ชื่อลูกค้า</th>
                            <th className="text-left px-3 py-2 text-xs" style={{ color: 'var(--text-3)' }}>SALES</th>
                            <th className="text-left px-3 py-2 text-xs" style={{ color: 'var(--text-3)' }}>STATUS</th>
                            <th className="text-center px-3 py-2 text-xs" style={{ color: 'var(--text-3)' }}>
                              <Smartphone size={11} className="inline mr-1" />LINE
                            </th>
                            <th className="text-left px-3 py-2 text-xs" style={{ color: 'var(--text-3)' }}>วัน BOOKED</th>
                            <th className="text-right px-3 py-2 text-xs" style={{ color: 'var(--text-3)' }}>BOOKED VALUE</th>
                            <th className="text-right px-3 py-2 text-xs" style={{ color: 'var(--text-3)' }}>มัดจำ</th>
                            <th className="px-3 py-2 text-xs" style={{ color: 'var(--text-3)' }}>แก้ไข</th>
                            <th className="px-3 py-2 text-xs" style={{ color: 'var(--text-3)' }}>นำเข้าระบบ</th>
                          </tr>
                        </thead>
                        <tbody>
                          {customers.map((c, idx) => {
                            const promoted = promotedIds.has(c.id)
                            const promoteLabel = getPromoteLabel(c)
                            return (
                              <tr key={c.id} className="transition-colors" style={{ borderBottom: '1px solid var(--divider)' }}>
                                <td className="px-3 py-2 text-xs" style={{ color: 'var(--text-3)' }}>{idx + 1}</td>
                                <td className="px-3 py-2 text-xs" style={{ color: 'var(--text-2)' }}>{projects.find(p => p.id === c.project_id)?.name || '—'}</td>
                                <td className="px-3 py-2 text-accent-blue text-xs font-mono">{c.room_no || '—'}</td>
                                <td className="px-3 py-2 text-body-strong" style={{ color: 'var(--text-1)' }}>{c.customer_name}</td>
                                <td className="px-3 py-2 text-xs" style={{ color: 'var(--text-2)' }}>{(c.users as any)?.name || '—'}</td>
                                <td className="px-3 py-2">
                                  <select
                                    value={normStatus(c.status)}
                                    onChange={e => updateCustomerStatus(c.id, e.target.value)}
                                    className={`text-xs px-2 py-0.5 rounded border-0 cursor-pointer ${stColor(c.status)} bg-transparent`}
                                  >
                                    {CUST_STATUS.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
                                  </select>
                                </td>
                                <td className="px-3 py-2 text-center">
                                  <button
                                    onClick={() => toggleLineAdded(c.id, c.line_added)}
                                    className={`w-8 h-8 rounded-full flex items-center justify-center mx-auto transition-colors text-sm ${c.line_added ? 'bg-green-500/20 text-success' : ''}`}
                                    style={!c.line_added ? { background: 'var(--hover-bg)', color: 'var(--text-3)' } : undefined}
                                    title={c.line_added ? 'Add LINE แล้ว' : 'ยังไม่ได้ Add LINE'}
                                  >
                                    {c.line_added ? '✓' : '+'}
                                  </button>
                                </td>
                                <td className="px-3 py-2 text-xs" style={{ color: 'var(--text-2)' }}>{dateStr(c.booked_date)}</td>
                                <td className="px-3 py-2 text-right text-success text-sm font-semibold">{fmtBaht(c.booked_value)}</td>
                                <td className="px-3 py-2 text-right text-premium text-sm">{fmtBaht(c.deposit_amount)}</td>
                                <td className="px-3 py-2">
                                  <button
                                    onClick={() => {
                                      setEditingCustomer(c)
                                      setEditCustForm({
                                        project_id: c.project_id || '',
                                        lead_id: String(c.lead_id || ''),
                                        sales_id: c.sales_id || '',
                                        room_no: c.room_no || '',
                                        customer_name: c.customer_name,
                                        phone: c.phone || '',
                                        email: c.email || '',
                                        status: c.status,
                                        booked_date: c.booked_date || '',
                                        booked_value: String(c.booked_value || ''),
                                        deposit_amount: String(c.deposit_amount || ''),
                                        booking_type: c.booking_type || 'Event',
                                        notes: c.notes || '',
                                      })
                                    }}
                                    className="p-1.5 transition-colors"
                                    style={{ color: 'var(--text-3)' }}
                                    title="แก้ไข"
                                  >
                                    <Pencil size={13} />
                                  </button>
                                </td>
                                <td className="px-3 py-2">
                                  {normStatus(c.status) === 'not_interested' ? (
                                    <span className="text-xs" style={{ color: 'var(--text-3)' }}>ไม่โปรโมท</span>
                                  ) : promoted ? (
                                    <span className="flex items-center gap-1 text-xs text-success">
                                      <CheckCircle2 size={12} />
                                      {systemStatus.get(c.id) ? `อยู่ใน ${systemStatus.get(c.id)}` : 'เพิ่มแล้ว'}
                                    </span>
                                  ) : promoteLabel ? (
                                    <button
                                      onClick={() => promoteCustomer(c)}
                                      className={`flex items-center gap-1 text-xs px-2 py-1 rounded-lg transition-colors ${
                                        c.status === 'booked'
                                          ? 'text-premium hover:brightness-110'
                                          : 'bg-[var(--accent-blue)]/20 text-accent-blue hover:bg-[var(--accent-blue)]/40'
                                      }`}
                                    >
                                      <UserPlus size={11} /> {promoteLabel}
                                    </button>
                                  ) : <span className="text-xs" style={{ color: 'var(--text-3)' }}>—</span>}
                                </td>
                              </tr>
                            )
                          })}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              )}
            </div>
          )
        })}
      </div>

      {/* Event Modal */}
      <Modal open={openEvent} onClose={() => setOpenEvent(false)} title={editingEvent ? 'แก้ไข Event' : 'เพิ่ม Event ใหม่'}>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="sm:col-span-2">
            <Input label="ชื่องาน *" value={form.event_name} onChange={e => setForm({ ...form, event_name: e.target.value })} placeholder="เช่น ORI Sales Event — Origin Place Petchkasem" />
          </div>
          <Select label="ประเภท Event" value={form.event_type} onChange={e => setForm({ ...form, event_type: e.target.value })} options={EVENT_TYPES} />
          <Input label="วันจัดงาน" type="date" lang="th-TH" value={form.event_date} onChange={e => setForm({ ...form, event_date: e.target.value })} />
          <Select label="โครงการ" value={form.project_id} onChange={e => setForm({ ...form, project_id: e.target.value })} options={projOptions} />
          <Input label="สถานที่" value={form.location} onChange={e => setForm({ ...form, location: e.target.value })} placeholder="เช่น ล็อบบี้ตึก A" />
          <Input label="จำนวนคนเข้างาน" type="number" value={form.total_attendees} onChange={e => setForm({ ...form, total_attendees: Number(e.target.value) })} />
          <Input label="จำนวน LINE add (รวมทั้งงาน)" type="number" value={form.line_adds} onChange={e => setForm({ ...form, line_adds: Number(e.target.value) })} />
          <div className="sm:col-span-2">
            <TextArea label="หมายเหตุ" value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} />
          </div>
        </div>
        <div className="flex justify-end gap-3 mt-5">
          <button onClick={() => setOpenEvent(false)} className="px-4 py-2 text-sm transition-colors" style={{ color: 'var(--text-2)' }}>ยกเลิก</button>
          <button onClick={saveEvent} disabled={saving || !form.event_name} className="px-4 py-2 btn-green disabled:opacity-50 text-white text-sm rounded-lg transition-colors">
            {saving ? 'กำลังบันทึก...' : 'บันทึก'}
          </button>
        </div>
      </Modal>

      {/* Edit Customer Modal */}
      <Modal open={!!editingCustomer} onClose={() => setEditingCustomer(null)} title={`แก้ไขข้อมูล — ${editingCustomer?.customer_name || ''}`} size="lg">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Input label="ชื่อลูกค้า *" value={editCustForm.customer_name}
            onChange={e => setEditCustForm({ ...editCustForm, customer_name: e.target.value })} />
          <Input label="เบอร์โทร" value={editCustForm.phone}
            onChange={e => setEditCustForm({ ...editCustForm, phone: e.target.value })} />
          <Input label="เลขห้อง" value={editCustForm.room_no}
            onChange={e => setEditCustForm({ ...editCustForm, room_no: e.target.value })}
            placeholder="เช่น Z-501" />
          <Select label="Sales" value={editCustForm.sales_id}
            onChange={e => setEditCustForm({ ...editCustForm, sales_id: e.target.value })}
            options={salesOptions} />
          <Select label="STATUS" value={editCustForm.status}
            onChange={e => setEditCustForm({ ...editCustForm, status: e.target.value })}
            options={CUST_STATUS.map(s => ({ value: s.value, label: s.label }))} />
          <Input label="วัน BOOKED" type="date" lang="th-TH" value={editCustForm.booked_date}
            onChange={e => setEditCustForm({ ...editCustForm, booked_date: e.target.value })} />
          <Input label="BOOKED VALUE (บาท)" type="number" value={editCustForm.booked_value}
            onChange={e => setEditCustForm({ ...editCustForm, booked_value: e.target.value })} />
          <Input label="มัดจำ เงินสด (บาท)" type="number" value={editCustForm.deposit_amount}
            onChange={e => setEditCustForm({ ...editCustForm, deposit_amount: e.target.value })} />
          <div className="sm:col-span-2">
            <TextArea label="หมายเหตุ" value={editCustForm.notes}
              onChange={e => setEditCustForm({ ...editCustForm, notes: e.target.value })} />
          </div>
        </div>
        <div className="flex justify-end gap-3 mt-5">
          <button onClick={() => setEditingCustomer(null)} className="px-4 py-2 text-sm transition-colors" style={{ color: 'var(--text-2)' }}>ยกเลิก</button>
          <button onClick={saveEditCustomer} disabled={editSaving || !editCustForm.customer_name}
            className="flex items-center gap-2 px-4 py-2 btn-green disabled:opacity-50 text-white text-sm rounded-lg transition-colors">
            <Save size={14} />{editSaving ? 'กำลังบันทึก...' : 'บันทึก'}
          </button>
        </div>
      </Modal>

      {/* Add Customer Modal */}
      <Modal open={openCustomer} onClose={() => {
        setOpenCustomer(false)
        setDupCheck({ checking: false, inEvent: null, inSystem: null })
        setDupConfirmed(false)
      }} title={`+ เพิ่มรายชื่อลูกค้า — ${selectedEvent?.event_name || ''}`} size="lg">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <p className="text-xs mb-1" style={{ color: 'var(--text-2)' }}>โครงการ</p>
            <div className="rounded-lg px-3 py-2 text-sm" style={{ background: 'var(--hover-bg)', border: '1px solid var(--divider)', color: 'var(--text-2)' }}>
              {projects.find(p => p.id === custForm.project_id)?.name || '— ไม่ระบุโครงการ —'}
            </div>
          </div>

          <Select label="เลือกห้อง (Origin Pool)" value={custForm.lead_id}
            onChange={e => {
              const lead = eventLeads.find(l => String(l.id) === e.target.value)
              setCustForm({
                ...custForm,
                lead_id: e.target.value,
                room_no: lead ? `${lead.tower}-${lead.room_no}` : custForm.room_no,
                customer_name: lead ? lead.customer_name : custForm.customer_name,
                phone: lead ? lead.phone : custForm.phone,
              })
            }}
            options={leadOptions} />

          <div className="sm:col-span-2">
            <Input label="ชื่อลูกค้า *" value={custForm.customer_name}
              onChange={e => setCustForm({ ...custForm, customer_name: e.target.value })}
              placeholder="ดึงอัตโนมัติจากห้อง หรือพิมพ์เอง" />
          </div>

          <Input label="เบอร์โทร" value={custForm.phone}
            onChange={e => { setCustForm({ ...custForm, phone: e.target.value }); setDupCheck({ checking: false, inEvent: null, inSystem: null }); setDupConfirmed(false) }}
            onBlur={e => checkDup(e.target.value, custForm.customer_name)} />
          <Input label="เลขห้อง" value={custForm.room_no}
            onChange={e => setCustForm({ ...custForm, room_no: e.target.value })}
            placeholder="เช่น Z-501" />

          <Select label="Sales" value={custForm.sales_id}
            onChange={e => setCustForm({ ...custForm, sales_id: e.target.value })}
            options={salesOptions} />

          <Select label="STATUS" value={custForm.status}
            onChange={e => setCustForm({ ...custForm, status: e.target.value })}
            options={CUST_STATUS.map(s => ({ value: s.value, label: s.label }))} />

          {custForm.status === 'booked' && (
            <>
              <div>
                <p className="text-xs mb-1" style={{ color: 'var(--text-2)' }}>วัน BOOKED (วันจัดงาน)</p>
                <div className="rounded-lg px-3 py-2 text-sm" style={{ background: 'var(--hover-bg)', border: '1px solid var(--divider)', color: 'var(--text-2)' }}>
                  {custForm.booked_date ? new Date(custForm.booked_date).toLocaleDateString('th-TH', { day: '2-digit', month: 'short', year: '2-digit' }) : '—'}
                </div>
              </div>
              <Select label="ประเภท" value={custForm.booking_type}
                onChange={e => setCustForm({ ...custForm, booking_type: e.target.value })}
                options={BOOKING_TYPES.map(t => ({ value: t.value, label: t.label }))} />
              <Input label="BOOKED VALUE (บาท)" type="number" value={custForm.booked_value}
                onChange={e => setCustForm({ ...custForm, booked_value: e.target.value })}
                placeholder="ราคาซื้อ" />
              <Input label="มัดจำ เงินสด (บาท)" type="number" value={custForm.deposit_amount}
                onChange={e => setCustForm({ ...custForm, deposit_amount: e.target.value })}
                placeholder="เงินมัดจำที่รับจริง" />
            </>
          )}

          <div className="sm:col-span-2">
            <TextArea label="หมายเหตุ" value={custForm.notes}
              onChange={e => setCustForm({ ...custForm, notes: e.target.value })} />
          </div>
        </div>
        {/* Dup warning */}
        {dupCheck.checking && (
          <div className="mt-3 flex items-center gap-2 text-xs py-2 px-3 rounded-[8px]" style={{ background: 'var(--hover-bg)', color: 'var(--text-3)' }}>
            <div className="w-3 h-3 rounded-full border border-current border-t-transparent animate-spin flex-shrink-0" />
            กำลังตรวจสอบข้อมูลซ้ำ...
          </div>
        )}
        {dupCheck.inEvent && (
          <div className="mt-3 flex items-start gap-2 text-xs py-2.5 px-3 rounded-[8px]" style={{ background: 'color-mix(in srgb, var(--accent-red) 10%, transparent)', border: '1px solid color-mix(in srgb, var(--accent-red) 30%, transparent)', color: 'var(--accent-red)' }}>
            <span className="text-base leading-none flex-shrink-0">🚫</span>
            <div>
              <p className="font-semibold">ซ้ำในงานนี้ — ไม่สามารถเพิ่มได้</p>
              <p className="opacity-80 mt-0.5">"{dupCheck.inEvent}" มีอยู่ใน Event นี้แล้ว (เบอร์หรือชื่อตรงกัน)</p>
            </div>
          </div>
        )}
        {!dupCheck.inEvent && dupCheck.inSystem && (
          <div className="mt-3 rounded-[8px] overflow-hidden" style={{ border: '1px solid color-mix(in srgb, var(--accent-orange) 40%, transparent)' }}>
            <div className="flex items-start gap-2 text-xs py-2.5 px-3" style={{ background: 'color-mix(in srgb, var(--accent-orange) 10%, transparent)', color: 'var(--accent-orange)' }}>
              <span className="text-base leading-none flex-shrink-0">⚠️</span>
              <div className="flex-1">
                <p className="font-semibold">พบในระบบแล้ว ({dupCheck.inSystem.src})</p>
                <p className="opacity-80 mt-0.5">"{dupCheck.inSystem.name}" มีอยู่ใน {dupCheck.inSystem.src} แล้ว</p>
              </div>
            </div>
            {!dupConfirmed && (
              <div className="px-3 py-2 flex items-center justify-between" style={{ borderTop: '1px solid color-mix(in srgb, var(--accent-orange) 20%, transparent)', background: 'var(--hover-bg)' }}>
                <p className="text-xs" style={{ color: 'var(--text-3)' }}>ยังต้องการเพิ่มในงานนี้หรือไม่?</p>
                <button onClick={() => setDupConfirmed(true)}
                  className="text-xs px-3 py-1 rounded-[6px] font-semibold"
                  style={{ background: 'color-mix(in srgb, var(--accent-orange) 20%, transparent)', color: 'var(--accent-orange)' }}>
                  ยืนยัน — เพิ่มต่อ
                </button>
              </div>
            )}
            {dupConfirmed && (
              <div className="px-3 py-2 text-xs" style={{ borderTop: '1px solid color-mix(in srgb, var(--accent-orange) 20%, transparent)', background: 'var(--hover-bg)', color: 'var(--accent-green)' }}>
                ✓ ยืนยันแล้ว — จะบันทึกรายการนี้ลง Event
              </div>
            )}
          </div>
        )}

        <div className="flex justify-end gap-3 mt-5">
          <button onClick={() => { setOpenCustomer(false); setDupCheck({ checking: false, inEvent: null, inSystem: null }); setDupConfirmed(false) }}
            className="px-4 py-2 text-sm transition-colors" style={{ color: 'var(--text-2)' }}>ยกเลิก</button>
          <button onClick={saveCustomer}
            disabled={saving || !custForm.customer_name || !!dupCheck.inEvent || (!dupConfirmed && !!dupCheck.inSystem)}
            className="px-4 py-2 btn-green disabled:opacity-50 text-white text-sm rounded-lg transition-colors">
            {saving ? 'กำลังบันทึก...' : 'บันทึก'}
          </button>
        </div>
      </Modal>
    </div>
  )
}

