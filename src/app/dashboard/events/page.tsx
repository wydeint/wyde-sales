'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Plus, CalendarDays, Pencil, Users, ChevronDown, ChevronUp, TrendingUp, UserPlus, CheckCircle2 } from 'lucide-react'
import Modal from '@/components/ui/Modal'
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
  { value: 'booked', label: 'Booked', color: 'bg-green-500/20 text-green-400' },
  { value: 'contacted', label: 'ติดตามต่อ', color: 'bg-yellow-500/20 text-yellow-400' },
  { value: 'not_purchased', label: 'ไม่ซื้อ', color: 'bg-red-500/20 text-red-400' },
  { value: 'not_talked', label: 'ไม่ได้คุย', color: 'bg-[#30363d] text-[#8b949e]' },
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

  async function load() {
    setLoading(true)
    const [{ data: ev }, { data: pr }, { data: u }] = await Promise.all([
      supabase.from('events').select('*').order('event_date', { ascending: false }),
      supabase.from('projects').select('id,name').eq('active', true).order('name'),
      supabase.from('users').select('id,name').eq('active', true).order('name'),
    ])
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
    setCustomers((data as any) || [])
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
    loadCustomers(selectedEvent.id)
  }

  async function promoteToProspect(c: EventCustomer) {
    if (promotedIds.has(c.id)) return
    // Check if already exists by lead_id or name+project
    const { data: existing } = await supabase.from('customers')
      .select('id')
      .eq('lead_id', c.lead_id ?? -1)
      .maybeSingle()
    if (existing) {
      setPromotedIds(prev => new Set(prev).add(c.id))
      return
    }
    const newId = 'PROS-' + c.id.slice(0, 8).toUpperCase()
    await supabase.from('customers').insert({
      id: newId,
      customer_name: c.customer_name,
      phone: c.phone || null,
      email: c.email || null,
      project_id: c.project_id || null,
      room_no: c.room_no || null,
      lead_id: c.lead_id || null,
      event_customer_id: c.id,
      source_event_id: selectedEvent?.id || null,
      source: 'event',
      status: 'booked',
      booking_date: c.booked_date || null,
    })
    setPromotedIds(prev => new Set(prev).add(c.id))
  }

  async function updateCustomerStatus(id: string, status: string) {
    await supabase.from('event_customers').update({ status }).eq('id', id)
    if (selectedEvent) loadCustomers(selectedEvent.id)
  }

  function toggleExpand(ev: Event) {
    if (expandedId === ev.id) {
      setExpandedId(null)
    } else {
      setExpandedId(ev.id)
      setSelectedEvent(ev)
      loadCustomers(ev.id)
    }
  }

  const stColor = (s: string) => CUST_STATUS.find(x => x.value === s)?.color || 'bg-[#30363d] text-[#8b949e]'
  const stLabel = (s: string) => CUST_STATUS.find(x => x.value === s)?.label || s
  const typeLabel = (t: string) => EVENT_TYPES.find(e => e.value === t)?.label || t

  const projOptions = [{ value: '', label: '— เลือกโครงการ —' }, ...projects.map(p => ({ value: p.id, label: p.name }))]
  const salesOptions = [{ value: '', label: '— Sales —' }, ...salesUsers.map(u => ({ value: u.id, label: u.name }))]
  const leadOptions = [
    { value: '', label: '— เลือกห้อง —' },
    ...eventLeads.map(l => ({ value: String(l.id), label: `${l.tower}-${l.room_no} — ${l.customer_name}` }))
  ]

  // Performance calc for expanded event
  function calcPerf(evId: string, attendees: number) {
    const c = customers // already loaded for expanded event
    const booked = c.filter(x => x.status === 'booked').length
    const contacted = c.filter(x => x.status === 'contacted').length
    const notPurchased = c.filter(x => x.status === 'not_purchased').length
    const notTalked = c.filter(x => x.status === 'not_talked').length
    const conv = attendees > 0 ? Math.round((booked / attendees) * 100) : 0
    const revenue = c.filter(x => x.status === 'booked').reduce((s, x) => s + (x.booked_value || 0), 0)
    const totalDeposit = c.filter(x => x.status === 'booked').reduce((s, x) => s + (x.deposit_amount || 0), 0)
    const bookedValue = revenue
    return { booked, contacted, notPurchased, notTalked, conv, revenue, bookedValue, totalDeposit }
  }

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-white text-xl font-bold">Events</h1>
          <p className="text-[#8b949e] text-sm mt-0.5">จัดการงาน Event · บันทึกลูกค้า · ติดตาม Performance</p>
        </div>
        <button onClick={() => { setEditingEvent(null); setForm(emptyEvent); setOpenEvent(true) }}
          className="flex items-center gap-2 bg-[#238636] hover:bg-[#2ea043] text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors">
          <Plus size={16} />เพิ่ม Event
        </button>
      </div>

      <div className="space-y-3">
        {loading && <div className="text-center py-12 text-[#8b949e]">กำลังโหลด...</div>}
        {!loading && events.length === 0 && (
          <div className="text-center py-16 bg-[#161b22] border border-[#30363d] rounded-xl">
            <CalendarDays size={32} className="mx-auto text-[#484f58] mb-2" />
            <p className="text-[#8b949e] text-sm">ยังไม่มี Event</p>
          </div>
        )}

        {events.map(ev => {
          const isExpanded = expandedId === ev.id
          const perf = isExpanded ? calcPerf(ev.id, ev.total_attendees) : null

          return (
            <div key={ev.id} className="bg-[#161b22] border border-[#30363d] rounded-xl overflow-hidden">
              {/* Event row */}
              <div className="flex items-center gap-4 px-4 py-4">
                <div className="flex-1">
                  <div className="flex items-center gap-3 mb-1">
                    <span className="text-[#58a6ff] text-xs font-mono">{ev.id}</span>
                    <h3 className="text-white font-medium">{ev.event_name}</h3>
                    {ev.event_type && <span className="text-xs bg-[#21262d] text-[#8b949e] px-2 py-0.5 rounded">{typeLabel(ev.event_type)}</span>}
                    {ev.project_name && <span className="text-xs bg-[#21262d] text-[#8b949e] px-2 py-0.5 rounded">{ev.project_name}</span>}
                  </div>
                  <div className="flex items-center gap-4 text-[#8b949e] text-xs">
                    {ev.event_date && <span>📅 {new Date(ev.event_date).toLocaleDateString('th-TH')}</span>}
                    {ev.location && <span>📍 {ev.location}</span>}
                    <span>👥 {ev.total_attendees} คน</span>
                    <span>➕ LINE {ev.line_adds}</span>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <button onClick={() => { setSelectedEvent(ev); setEventLeads([]); setCustForm(emptyCust); setOpenCustomer(true) }}
                    className="flex items-center gap-1.5 text-xs bg-[#1d6fa5] hover:bg-[#1f6feb] text-white px-3 py-1.5 rounded-lg transition-colors">
                    <Users size={13} />เพิ่มลูกค้า
                  </button>
                  <button onClick={() => {
                    setEditingEvent(ev)
                    setForm({ project_id: ev.project_id, project_name: ev.project_name, event_type: ev.event_type || '', event_name: ev.event_name, event_date: ev.event_date, location: ev.location, total_attendees: ev.total_attendees, line_adds: ev.line_adds, notes: ev.notes })
                    setOpenEvent(true)
                  }} className="text-[#8b949e] hover:text-white p-1.5 transition-colors">
                    <Pencil size={14} />
                  </button>
                  <button onClick={() => toggleExpand(ev)} className="text-[#8b949e] hover:text-white p-1.5 transition-colors">
                    {isExpanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                  </button>
                </div>
              </div>

              {/* Expanded: Performance + Customer List */}
              {isExpanded && (
                <div className="border-t border-[#21262d]">

                  {/* Performance Summary */}
                  {perf && (
                    <div className="px-4 py-4 bg-[#0d1117]/40">
                      <div className="flex items-center gap-2 mb-3">
                        <TrendingUp size={13} className="text-emerald-400" />
                        <p className="text-emerald-400 text-xs font-bold uppercase tracking-widest">Performance</p>
                      </div>

                      {/* KPI row */}
                      <div className="grid grid-cols-6 gap-3 mb-4">
                        {[
                          { label: 'ลูกค้ามา', value: ev.total_attendees, color: 'text-white' },
                          { label: 'ปิดการขาย', value: perf.booked, color: 'text-green-400' },
                          { label: 'ติดตามต่อ', value: perf.contacted, color: 'text-yellow-400' },
                          { label: 'ไม่ซื้อ', value: perf.notPurchased, color: 'text-red-400' },
                          { label: 'ไม่ได้คุย', value: perf.notTalked, color: 'text-[#484f58]' },
                          { label: 'Conv%', value: perf.conv + '%', color: perf.conv >= 20 ? 'text-green-400' : 'text-yellow-400' },
                        ].map(k => (
                          <div key={k.label} className="bg-[#161b22] rounded-xl p-3 text-center">
                            <p className="text-[#484f58] text-[10px] mb-1">{k.label}</p>
                            <p className={`text-lg font-bold ${k.color}`}>{k.value}</p>
                          </div>
                        ))}
                      </div>

                      {/* Revenue row */}
                      <div className="grid grid-cols-3 gap-3">
                        <div className="bg-[#161b22] rounded-xl p-3">
                          <p className="text-[#484f58] text-[10px] mb-1">Revenue (Booked Value)</p>
                          <p className="text-emerald-400 font-bold">{fmtBaht(perf.revenue)}</p>
                          <p className="text-[#484f58] text-[10px]">{perf.booked} ห้อง</p>
                        </div>
                        <div className="bg-[#161b22] rounded-xl p-3">
                          <p className="text-[#484f58] text-[10px] mb-1">เงินจอง (Booked Value)</p>
                          <p className="text-blue-400 font-bold">{fmtBaht(perf.bookedValue)}</p>
                          <p className="text-[#484f58] text-[10px]">{perf.booked} ห้อง booked</p>
                        </div>
                        <div className="bg-[#161b22] rounded-xl p-3">
                          <p className="text-[#484f58] text-[10px] mb-1">มัดจำ (เงินสด)</p>
                          <p className="text-purple-400 font-bold">{fmtBaht(perf.totalDeposit)}</p>
                          <p className="text-[#484f58] text-[10px]">{perf.booked} ห้องที่เก็บมัดจำ</p>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Customer List */}
                  <div className="px-4 py-2 bg-[#0d1117]/50 flex items-center justify-between">
                    <p className="text-[#8b949e] text-xs font-medium">รายชื่อลูกค้าในงาน ({customers.length} คน)</p>
                  </div>
                  {customers.length === 0 && (
                    <div className="px-4 py-6 text-center text-[#8b949e] text-sm">ยังไม่มีรายชื่อลูกค้า</div>
                  )}
                  {customers.length > 0 && (
                    <div className="overflow-x-auto">
                      <table className="w-full">
                        <thead>
                          <tr className="border-b border-[#21262d]">
                            <th className="text-left px-3 py-2 text-[#484f58] text-xs">#</th>
                            <th className="text-left px-3 py-2 text-[#484f58] text-xs">โครงการ</th>
                            <th className="text-left px-3 py-2 text-[#484f58] text-xs">เลขห้อง</th>
                            <th className="text-left px-3 py-2 text-[#484f58] text-xs">ชื่อลูกค้า</th>
                            <th className="text-left px-3 py-2 text-[#484f58] text-xs">SALES</th>
                            <th className="text-left px-3 py-2 text-[#484f58] text-xs">STATUS</th>
                            <th className="text-left px-3 py-2 text-[#484f58] text-xs">วัน BOOKED</th>
                            <th className="text-right px-3 py-2 text-[#484f58] text-xs">BOOKED VALUE</th>
                            <th className="text-right px-3 py-2 text-[#484f58] text-xs">มัดจำ (เงินสด)</th>
                            <th className="text-left px-3 py-2 text-[#484f58] text-xs">ประเภท</th>
                            <th className="px-3 py-2 text-[#484f58] text-xs">Prospects</th>
                          </tr>
                        </thead>
                        <tbody>
                          {customers.map((c, idx) => {
                            const promoted = promotedIds.has(c.id)
                            return (
                            <tr key={c.id} className="border-b border-[#21262d] hover:bg-[#1c2128]">
                              <td className="px-3 py-2 text-[#484f58] text-xs">{idx + 1}</td>
                              <td className="px-3 py-2 text-[#8b949e] text-xs">{projects.find(p => p.id === c.project_id)?.name || '—'}</td>
                              <td className="px-3 py-2 text-[#58a6ff] text-xs font-mono">{c.room_no || '—'}</td>
                              <td className="px-3 py-2 text-white text-sm font-medium">{c.customer_name}</td>
                              <td className="px-3 py-2 text-[#8b949e] text-xs">{(c.users as any)?.name || '—'}</td>
                              <td className="px-3 py-2">
                                <select
                                  value={c.status}
                                  onChange={e => updateCustomerStatus(c.id, e.target.value)}
                                  className={`text-xs px-2 py-0.5 rounded border-0 cursor-pointer ${stColor(c.status)} bg-transparent`}
                                >
                                  {CUST_STATUS.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
                                </select>
                              </td>
                              <td className="px-3 py-2 text-[#c9d1d9] text-xs">{dateStr(c.booked_date)}</td>
                              <td className="px-3 py-2 text-right text-emerald-400 text-sm font-semibold">{fmtBaht(c.booked_value)}</td>
                              <td className="px-3 py-2 text-right text-purple-400 text-sm">{fmtBaht(c.deposit_amount)}</td>
                              <td className="px-3 py-2">
                                <span className="text-xs bg-[#21262d] text-[#8b949e] px-2 py-0.5 rounded">{c.booking_type || 'Event'}</span>
                              </td>
                              <td className="px-3 py-2">
                                {c.status === 'booked' ? (
                                  promoted ? (
                                    <span className="flex items-center gap-1 text-xs text-emerald-400">
                                      <CheckCircle2 size={12} /> เพิ่มแล้ว
                                    </span>
                                  ) : (
                                    <button
                                      onClick={() => promoteToProspect(c)}
                                      className="flex items-center gap-1 text-xs px-2 py-1 rounded-lg bg-[#1d6fa5]/20 text-[#58a6ff] hover:bg-[#1d6fa5]/40 transition-colors"
                                      title="เพิ่มเป็น Prospect"
                                    >
                                      <UserPlus size={11} /> → Prospects
                                    </button>
                                  )
                                ) : <span className="text-[#484f58] text-xs">—</span>}
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
        <div className="grid grid-cols-2 gap-4">
          <div className="col-span-2">
            <Input label="ชื่องาน *" value={form.event_name} onChange={e => setForm({ ...form, event_name: e.target.value })} placeholder="เช่น ORI Sales Event — Origin Place Petchkasem" />
          </div>
          <Select label="ประเภท Event" value={form.event_type} onChange={e => setForm({ ...form, event_type: e.target.value })} options={EVENT_TYPES} />
          <Input label="วันจัดงาน" type="date" value={form.event_date} onChange={e => setForm({ ...form, event_date: e.target.value })} />
          <Select label="โครงการ" value={form.project_id} onChange={e => setForm({ ...form, project_id: e.target.value })} options={projOptions} />
          <Input label="สถานที่" value={form.location} onChange={e => setForm({ ...form, location: e.target.value })} placeholder="เช่น ล็อบบี้ตึก A" />
          <Input label="จำนวนคนเข้างาน" type="number" value={form.total_attendees} onChange={e => setForm({ ...form, total_attendees: Number(e.target.value) })} />
          <Input label="จำนวน LINE add" type="number" value={form.line_adds} onChange={e => setForm({ ...form, line_adds: Number(e.target.value) })} />
          <div className="col-span-2">
            <TextArea label="หมายเหตุ" value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} />
          </div>
        </div>
        <div className="flex justify-end gap-3 mt-5">
          <button onClick={() => setOpenEvent(false)} className="px-4 py-2 text-[#8b949e] hover:text-white text-sm transition-colors">ยกเลิก</button>
          <button onClick={saveEvent} disabled={saving || !form.event_name} className="px-4 py-2 bg-[#238636] hover:bg-[#2ea043] disabled:opacity-50 text-white text-sm rounded-lg transition-colors">
            {saving ? 'กำลังบันทึก...' : 'บันทึก'}
          </button>
        </div>
      </Modal>

      {/* Add Customer Modal */}
      <Modal open={openCustomer} onClose={() => setOpenCustomer(false)} title={`+ เพิ่มรายชื่อลูกค้า — ${selectedEvent?.event_name || ''}`} size="lg">
        <div className="grid grid-cols-2 gap-4">

          {/* Project → Room → auto-fill */}
          <Select label="โครงการ" value={custForm.project_id}
            onChange={e => {
              setCustForm({ ...custForm, project_id: e.target.value, lead_id: '', room_no: '', customer_name: '', phone: '' })
              loadLeads(e.target.value)
            }}
            options={projOptions} />

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

          <div className="col-span-2">
            <Input label="ชื่อลูกค้า *" value={custForm.customer_name}
              onChange={e => setCustForm({ ...custForm, customer_name: e.target.value })}
              placeholder="ดึงอัตโนมัติจากห้อง หรือพิมพ์เอง" />
          </div>

          <Input label="เบอร์โทร" value={custForm.phone}
            onChange={e => setCustForm({ ...custForm, phone: e.target.value })} />
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
              <Input label="วัน BOOKED" type="date" value={custForm.booked_date}
                onChange={e => setCustForm({ ...custForm, booked_date: e.target.value })} />
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

          <div className="col-span-2">
            <TextArea label="หมายเหตุ" value={custForm.notes}
              onChange={e => setCustForm({ ...custForm, notes: e.target.value })} />
          </div>
        </div>
        <div className="flex justify-end gap-3 mt-5">
          <button onClick={() => setOpenCustomer(false)} className="px-4 py-2 text-[#8b949e] hover:text-white text-sm transition-colors">ยกเลิก</button>
          <button onClick={saveCustomer} disabled={saving || !custForm.customer_name}
            className="px-4 py-2 bg-[#238636] hover:bg-[#2ea043] disabled:opacity-50 text-white text-sm rounded-lg transition-colors">
            {saving ? 'กำลังบันทึก...' : 'บันทึก'}
          </button>
        </div>
      </Modal>
    </div>
  )
}
