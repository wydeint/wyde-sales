'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Plus, CalendarDays, Pencil, Users, ChevronDown, ChevronUp } from 'lucide-react'
import Modal from '@/components/ui/Modal'
import { Input, Select, TextArea } from '@/components/ui/Input'

interface Project { id: string; name: string }
interface EventCustomer {
  id: string; customer_name: string; phone: string; email: string
  interested_room: string; status: string; notes: string
}
interface Event {
  id: string; project_id: string; project_name: string; event_type: string; event_name: string
  event_date: string; location: string; total_attendees: number; line_adds: number; notes: string
}

const EVENT_TYPES = [
  { value: '', label: '— ประเภท —' },
  { value: 'grand_opening', label: 'Grand Opening' },
  { value: 'road_show', label: 'Road Show' },
  { value: 'workshop', label: 'Workshop' },
  { value: 'site_visit', label: 'Site Visit' },
  { value: 'home_expo', label: 'Home Expo / งานแสดงสินค้า' },
  { value: 'online', label: 'Online Event' },
  { value: 'other', label: 'อื่นๆ' },
]

const emptyEvent = { project_id: '', project_name: '', event_type: '', event_name: '', event_date: '', location: '', total_attendees: 0, line_adds: 0, notes: '' }
const emptyCustomer = { customer_name: '', phone: '', email: '', interested_room: '', status: 'new', notes: '' }

const STATUS_COLORS: Record<string, string> = {
  new: 'bg-blue-500/20 text-blue-400',
  contacted: 'bg-yellow-500/20 text-yellow-400',
  converted: 'bg-green-500/20 text-green-400',
}

export default function EventsPage() {
  const supabase = createClient()
  const [events, setEvents] = useState<Event[]>([])
  const [projects, setProjects] = useState<Project[]>([])
  const [loading, setLoading] = useState(true)
  const [openEvent, setOpenEvent] = useState(false)
  const [openCustomer, setOpenCustomer] = useState(false)
  const [editingEvent, setEditingEvent] = useState<Event | null>(null)
  const [selectedEvent, setSelectedEvent] = useState<Event | null>(null)
  const [customers, setCustomers] = useState<EventCustomer[]>([])
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [form, setForm] = useState(emptyEvent)
  const [custForm, setCustForm] = useState(emptyCustomer)
  const [saving, setSaving] = useState(false)

  async function load() {
    setLoading(true)
    const [{ data: ev }, { data: pr }] = await Promise.all([
      supabase.from('events').select('*').order('event_date', { ascending: false }),
      supabase.from('projects').select('id,name').eq('active', true).order('name'),
    ])
    setEvents(ev || [])
    setProjects(pr || [])
    setLoading(false)
  }

  async function loadCustomers(eventId: string) {
    const { data } = await supabase.from('event_customers').select('*').eq('event_id', eventId).order('created_at')
    setCustomers(data || [])
  }

  useEffect(() => { load() }, [])

  function genEventId() {
    const nums = events.map(e => parseInt(e.id.replace('EVT-', ''))).filter(n => !isNaN(n))
    const next = nums.length > 0 ? Math.max(...nums) + 1 : 1
    return 'EVT-' + String(next).padStart(3, '0')
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
    setSaving(false)
    setOpenEvent(false)
    load()
  }

  async function saveCustomer() {
    if (!custForm.customer_name || !selectedEvent) return
    setSaving(true)
    await supabase.from('event_customers').insert({ event_id: selectedEvent.id, ...custForm })
    setSaving(false)
    setOpenCustomer(false)
    setCustForm(emptyCustomer)
    loadCustomers(selectedEvent.id)
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

  const projectOptions = [{ value: '', label: '— เลือกโครงการ —' }, ...projects.map(p => ({ value: p.id, label: p.name }))]
  const typeLabel = (t: string) => EVENT_TYPES.find(e => e.value === t)?.label || t
  const statusOptions = [{ value: 'new', label: 'ใหม่' }, { value: 'contacted', label: 'ติดต่อแล้ว' }, { value: 'converted', label: 'แปลงแล้ว' }]

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-white text-xl font-bold">Events</h1>
          <p className="text-[#8b949e] text-sm mt-0.5">จัดการงาน Event และบันทึกรายชื่อลูกค้า</p>
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
        {events.map(ev => (
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
                <button onClick={() => { setSelectedEvent(ev); setOpenCustomer(true) }}
                  className="flex items-center gap-1.5 text-xs bg-[#1d6fa5] hover:bg-[#1f6feb] text-white px-3 py-1.5 rounded-lg transition-colors">
                  <Users size={13} />เพิ่มลูกค้า
                </button>
                <button onClick={() => { setEditingEvent(ev); setForm({ project_id: ev.project_id, project_name: ev.project_name, event_type: ev.event_type || '', event_name: ev.event_name, event_date: ev.event_date, location: ev.location, total_attendees: ev.total_attendees, line_adds: ev.line_adds, notes: ev.notes }); setOpenEvent(true) }}
                  className="text-[#8b949e] hover:text-white p-1.5 transition-colors">
                  <Pencil size={14} />
                </button>
                <button onClick={() => toggleExpand(ev)} className="text-[#8b949e] hover:text-white p-1.5 transition-colors">
                  {expandedId === ev.id ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                </button>
              </div>
            </div>

            {/* Customer list */}
            {expandedId === ev.id && (
              <div className="border-t border-[#21262d]">
                <div className="px-4 py-2 bg-[#0d1117]/50">
                  <p className="text-[#8b949e] text-xs font-medium">รายชื่อลูกค้าในงาน ({customers.length} คน)</p>
                </div>
                {customers.length === 0 && (
                  <div className="px-4 py-6 text-center text-[#8b949e] text-sm">ยังไม่มีรายชื่อลูกค้า</div>
                )}
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-[#21262d]">
                      <th className="text-left px-4 py-2 text-[#484f58] text-xs">ชื่อ</th>
                      <th className="text-left px-4 py-2 text-[#484f58] text-xs">เบอร์</th>
                      <th className="text-left px-4 py-2 text-[#484f58] text-xs">ห้องที่สนใจ</th>
                      <th className="text-left px-4 py-2 text-[#484f58] text-xs">สถานะ</th>
                      <th className="text-left px-4 py-2 text-[#484f58] text-xs">หมายเหตุ</th>
                    </tr>
                  </thead>
                  <tbody>
                    {customers.map(c => (
                      <tr key={c.id} className="border-b border-[#21262d] hover:bg-[#1c2128]">
                        <td className="px-4 py-2 text-white text-sm">{c.customer_name}</td>
                        <td className="px-4 py-2 text-[#8b949e] text-sm">{c.phone}</td>
                        <td className="px-4 py-2 text-[#c9d1d9] text-sm">{c.interested_room}</td>
                        <td className="px-4 py-2">
                          <select
                            value={c.status}
                            onChange={e => updateCustomerStatus(c.id, e.target.value)}
                            className={`text-xs px-2 py-1 rounded border-0 ${STATUS_COLORS[c.status]} bg-transparent cursor-pointer`}
                          >
                            <option value="new">ใหม่</option>
                            <option value="contacted">ติดต่อแล้ว</option>
                            <option value="converted">แปลงแล้ว</option>
                          </select>
                        </td>
                        <td className="px-4 py-2 text-[#8b949e] text-sm">{c.notes}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Event Modal */}
      <Modal open={openEvent} onClose={() => setOpenEvent(false)} title={editingEvent ? 'แก้ไข Event' : 'เพิ่ม Event ใหม่'}>
        <div className="grid grid-cols-2 gap-4">
          <div className="col-span-2">
            <Input label="ชื่องาน *" value={form.event_name} onChange={e => setForm({ ...form, event_name: e.target.value })} placeholder="เช่น Grand Opening The Origin Ladprao" />
          </div>
          <Select label="ประเภท Event" value={form.event_type} onChange={e => setForm({ ...form, event_type: e.target.value })} options={EVENT_TYPES} />
          <Input label="วันจัดงาน" type="date" value={form.event_date} onChange={e => setForm({ ...form, event_date: e.target.value })} />
          <Select label="โครงการ" value={form.project_id} onChange={e => setForm({ ...form, project_id: e.target.value })} options={projectOptions} />
          <div className="col-span-2">
            <Input label="สถานที่" value={form.location} onChange={e => setForm({ ...form, location: e.target.value })} placeholder="เช่น ล็อบบี้ตึก A" />
          </div>
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

      {/* Customer Modal */}
      <Modal open={openCustomer} onClose={() => setOpenCustomer(false)} title={`เพิ่มลูกค้า — ${selectedEvent?.event_name || ''}`}>
        <div className="grid grid-cols-2 gap-4">
          <div className="col-span-2">
            <Input label="ชื่อลูกค้า *" value={custForm.customer_name} onChange={e => setCustForm({ ...custForm, customer_name: e.target.value })} placeholder="ชื่อ-นามสกุล" />
          </div>
          <Input label="เบอร์โทร" value={custForm.phone} onChange={e => setCustForm({ ...custForm, phone: e.target.value })} placeholder="08x-xxx-xxxx" />
          <Input label="Email" type="email" value={custForm.email} onChange={e => setCustForm({ ...custForm, email: e.target.value })} />
          <div className="col-span-2">
            <Input label="ห้องที่สนใจ" value={custForm.interested_room} onChange={e => setCustForm({ ...custForm, interested_room: e.target.value })} placeholder="เช่น A-1201" />
          </div>
          <div className="col-span-2">
            <TextArea label="หมายเหตุ" value={custForm.notes} onChange={e => setCustForm({ ...custForm, notes: e.target.value })} />
          </div>
        </div>
        <div className="flex justify-end gap-3 mt-5">
          <button onClick={() => setOpenCustomer(false)} className="px-4 py-2 text-[#8b949e] hover:text-white text-sm transition-colors">ยกเลิก</button>
          <button onClick={saveCustomer} disabled={saving || !custForm.customer_name} className="px-4 py-2 bg-[#238636] hover:bg-[#2ea043] disabled:opacity-50 text-white text-sm rounded-lg transition-colors">
            {saving ? 'กำลังบันทึก...' : 'บันทึก'}
          </button>
        </div>
      </Modal>
    </div>
  )
}
