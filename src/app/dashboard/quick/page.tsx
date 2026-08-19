'use client'

import DateInput from '@/components/ui/DateInput'
import FileAttach from '@/components/ui/FileAttach'
import { useEffect, useState, useCallback, useRef } from 'react'
import { createClient } from '@/lib/supabase/client'
import { crmStage } from '@/lib/status'
import { Spinner, EmptyState } from '@/components/ui/StateUI'
import { useRouter } from 'next/navigation'
import {
  Search, X, CheckCircle2, ChevronRight, AlertTriangle,
  AlertCircle, ArrowLeft, Home,
  Briefcase, Users, CalendarDays, Database,
  Receipt, FileText, ArrowRightLeft, ClipboardList,
  DollarSign, Zap, Phone, User, Building2, Paperclip,
  type LucideIcon
} from 'lucide-react'

// ─── Types ────────────────────────────────────────────────
interface WidgetData {
  inProgressJobs: number
  overdueJobs: number
  pendingInstallments: number
  pendingAmount: number
  readyToDeliver: number
}

interface JobOption {
  id: string; customerName: string; roomNo: string
  projectName: string; salesName: string; revenue: number
  workingStatus: string; workStartDate: string | null; workDays: number | null
  expectedFinishDate: string | null
}

interface EventOption { id: string; eventName: string; projectId: string; projectName: string; eventDate: string }

// ─── Helpers ──────────────────────────────────────────────
// Dash-flexible room search: "D803" → also tries "D-803" for DB ilike queries
const buildRoomOr = (q: string, base: string) => {
  const d = q.replace(/([A-Za-z]+)([0-9]+)/g, '$1-$2')
  return d !== q ? `${base},room_no.ilike.%${d}%` : base
}
// For frontend includes: strip dashes from both sides before comparing
const normRoom = (s: string) => s.replace(/-/g, '').toLowerCase()

const fmtBaht = (n: number) => {
  if (n >= 1000000) return '฿' + (n / 1000000).toFixed(1) + 'M'
  if (n >= 1000) return '฿' + Math.round(n / 1000) + 'k'
  return '฿' + n.toLocaleString()
}
const fmtDate = (d: string | null) =>
  d ? new Date(d).toLocaleDateString('th-TH', { day: '2-digit', month: 'short' }) : '—'

// ─── Bottom Sheet wrapper ──────────────────────────────────
function Sheet({ open, onClose, title, icon: Icon, children }: {
  open: boolean; onClose: () => void; title: string; icon?: LucideIcon; children: React.ReactNode
}) {
  const [cardTop, setCardTop] = useState(16)

  useEffect(() => {
    if (!open) return
    // Measure Quick Mode's own header (DashboardShell header is hidden on this route)
    const bar = document.querySelector('[data-topbar-quick]') as HTMLElement | null
    if (bar) {
      const bottom = bar.getBoundingClientRect().bottom
      setCardTop(Math.round(bottom) + 16) // 16px (~5mm) gap below Quick Mode header
    }
  }, [open])

  if (!open) return null

  const PAD = 16   // ~5mm side/bottom gap

  return (
    <div
      onClick={onClose}
      style={{ position: 'fixed', inset: 0, zIndex: 200 }}
    >
      {/* backdrop */}
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />

      {/* floating card — 5mm below the top banner, measured live */}
      <div
        className="flex flex-col"
        onClick={e => e.stopPropagation()}
        style={{
          position: 'absolute',
          top: cardTop,
          left: PAD,
          right: PAD,
          bottom: PAD,
          background: 'var(--glass-bg)',
          border: '1px solid var(--glass-border)',
          borderRadius: 18,
          backdropFilter: 'blur(24px)',
          WebkitBackdropFilter: 'blur(24px)',
          overflow: 'hidden',
        }}
      >
        {/* title bar */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '16px 20px', borderBottom: '1px solid var(--divider)', flexShrink: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            {Icon && <Icon size={18} color="var(--accent)" strokeWidth={1.75} />}
            <h3 style={{ fontWeight: 600, fontSize: 16, color: 'var(--text-1)', margin: 0 }}>{title}</h3>
          </div>
          <button onClick={onClose} style={{ minWidth: 44, minHeight: 44, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-3)', background: 'none', border: 'none', cursor: 'pointer' }}>
            <X size={18} />
          </button>
        </div>
        {/* scrollable content */}
        <div style={{ overflowY: 'auto', flex: 1 }}>{children}</div>
      </div>
    </div>
  )
}

// ─── Shared themed input/card styles ──────────────────────
const sheetInput = "w-full rounded-[8px] pl-9 pr-4 py-3 text-base focus:outline-none"
const sheetInputStyle: React.CSSProperties = {
  background: 'var(--input-bg)', border: '1px solid var(--divider)',
  color: 'var(--text-1)', fontSize: 16,
}
const sheetCard: React.CSSProperties = { background: 'var(--hover-bg)', border: '1px solid var(--divider)', borderRadius: 18, padding: '12px 16px' }
const sheetCardDark: React.CSSProperties = { background: 'var(--card-bg)', border: '1px solid var(--card-border)', borderRadius: 11, padding: '8px 12px' }
const t1: React.CSSProperties = { color: 'var(--text-1)' }
const t2: React.CSSProperties = { color: 'var(--text-2)' }
const t3: React.CSSProperties = { color: 'var(--text-3)' }

// ─── Origin Pool Search Sheet ──────────────────────────────
function OriginPoolSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const supabase = createClient()
  const [search, setSearch] = useState('')
  const [results, setResults] = useState<any[]>([])
  const [loading, setLoading] = useState(false)
  const [projectsMap, setProjectsMap] = useState<Record<string, string>>({})
  const timerRef = useRef<ReturnType<typeof setTimeout>>(undefined)

  useEffect(() => {
    supabase.from('projects').select('id, name').then(({ data }) => {
      if (data) setProjectsMap(Object.fromEntries(data.map((p: any) => [p.id, p.name])))
    })
  }, [])

  async function doSearch(q: string) {
    if (!q.trim()) { setResults([]); return }
    setLoading(true)
    const { data, error } = await supabase
      .from('condo_leads')
      .select('id, customer_name, phone, room_no, tower, project_id')
      .or(buildRoomOr(q, `customer_name.ilike.%${q}%,phone.ilike.%${q}%,room_no.ilike.%${q}%`))
      .order('customer_name')
      .limit(15)
    if (error) console.error('OriginPoolSheet search error:', error)
    setResults(data || [])
    setLoading(false)
  }

  function handleChange(v: string) {
    setSearch(v)
    clearTimeout(timerRef.current)
    timerRef.current = setTimeout(() => doSearch(v), 300)
  }

  return (
    <Sheet open={open} onClose={() => { setSearch(''); setResults([]); onClose() }} title="ค้นหาลูกค้า (Origin Pool)" icon={Database}>
      <div className="p-4">
        <div className="relative mb-4">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2" style={t3} />
          <input autoFocus value={search} onChange={e => handleChange(e.target.value)}
            placeholder="ชื่อ / เบอร์โทร / เลขห้อง..."
            className={sheetInput} style={sheetInputStyle} />
        </div>
        {loading && <p className="text-center py-4 text-sm" style={t2}>กำลังค้นหา...</p>}
        <div className="space-y-2">
          {results.map((r: any) => (
            <div key={r.id} style={sheetCard}>
              <p className="font-semibold mb-1" style={t1}>{r.customer_name}</p>
              <p className="text-xs" style={t2}>
                {projectsMap[r.project_id] || '—'} · {r.tower ? `${r.tower}-` : ''}ห้อง {r.room_no || '—'}
              </p>
              {r.phone && <p className="text-xs mt-1 flex items-center gap-1" style={{ color: 'var(--accent-blue)' }}><Phone size={11} strokeWidth={1.75} />{r.phone}</p>}
            </div>
          ))}
          {!loading && search && results.length === 0 && <EmptyState message="ไม่พบข้อมูล" />}
          {!search && <p className="text-center py-8 text-sm" style={t3}>พิมพ์ชื่อหรือเบอร์โทรเพื่อค้นหา</p>}
        </div>
      </div>
    </Sheet>
  )
}

// ─── Wyde Clients Search Sheet ─────────────────────────────
function WydeClientsSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const supabase = createClient()
  const [search, setSearch] = useState('')
  const [results, setResults] = useState<any[]>([])
  const [loading, setLoading] = useState(false)
  const timerRef = useRef<ReturnType<typeof setTimeout>>(undefined)

  async function doSearch(q: string) {
    if (!q.trim()) { setResults([]); return }
    setLoading(true)
    const { data } = await supabase
      .from('jobs')
      .select('id, customer_name, room_no, working_status, work_start_date, work_days, revenue_ex_vat, projects:project_id(name), sales:sales_id(name)')
      .or(buildRoomOr(q, `customer_name.ilike.%${q}%,room_no.ilike.%${q}%`))
      .not('working_status', 'eq', 'ยกเลิก')
      .order('customer_name')
      .limit(10)
    setResults(data || [])
    setLoading(false)
  }

  function handleChange(v: string) {
    setSearch(v)
    clearTimeout(timerRef.current)
    timerRef.current = setTimeout(() => doSearch(v), 300)
  }

  function calcEndDate(start: string | null, days: number | null) {
    if (!start || !days) return null
    const d = new Date(start); d.setDate(d.getDate() + days)
    return d.toISOString().slice(0, 10)
  }
  function daysOverdue(end: string | null) {
    if (!end) return 0
    return Math.max(0, Math.floor((Date.now() - new Date(end).getTime()) / 86400000))
  }

  return (
    <Sheet open={open} onClose={() => { setSearch(''); setResults([]); onClose() }} title="Wyde Clients" icon={Briefcase}>
      <div className="p-4">
        <div className="relative mb-4">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2" style={t3} />
          <input autoFocus value={search} onChange={e => handleChange(e.target.value)}
            placeholder="ชื่อลูกค้า / เลขห้อง..."
            className={sheetInput} style={sheetInputStyle} />
        </div>
        {loading && <p className="text-center py-4 text-sm" style={t2}>กำลังค้นหา...</p>}
        <div className="space-y-3">
          {results.map((j: any) => {
            const end = calcEndDate(j.work_start_date, j.work_days)
            const over = daysOverdue(end)
            return (
              <div key={j.id} style={sheetCard}>
                <div className="flex justify-between items-start mb-2">
                  <div>
                    <p className="font-semibold" style={t1}>{j.customer_name}</p>
                    <p className="text-xs mt-0.5" style={t2}>{j.room_no} · {(j.projects as any)?.name}</p>
                  </div>
                  <span className="font-bold text-sm" style={{ color: 'var(--accent-green)' }}>{fmtBaht(j.revenue_ex_vat || 0)}</span>
                </div>
                <div className="grid grid-cols-3 gap-2">
                  <div className="rounded-xl p-2 text-center" style={sheetCardDark}>
                    <p className="text-micro mb-0.5" style={t3}>สถานะ</p>
                    <p className="text-xs font-semibold truncate" style={{ color: 'var(--accent-orange)' }}>{j.working_status || '—'}</p>
                  </div>
                  <div className="rounded-xl p-2 text-center" style={sheetCardDark}>
                    <p className="text-micro mb-0.5" style={t3}>เริ่มงาน</p>
                    <p className="text-xs" style={t1}>{fmtDate(j.work_start_date)}</p>
                  </div>
                  <div className="rounded-xl p-2 text-center" style={over > 0 ? { ...sheetCardDark, background: 'color-mix(in srgb, var(--accent-red) 10%, transparent)', borderColor: 'color-mix(in srgb, var(--accent-red) 30%, transparent)' } : sheetCardDark}>
                    <p className="text-micro mb-0.5" style={t3}>ครบสัญญา</p>
                    <p className={`text-xs font-semibold`} style={{ color: over > 0 ? 'var(--accent-red)' : 'var(--text-1)' }}>
                      {over > 0 ? `เกิน ${over}ว` : fmtDate(end)}
                    </p>
                  </div>
                </div>
                <p className="text-micro mt-2" style={t3}>Sales: {(j.sales as any)?.name || '—'}</p>
              </div>
            )
          })}
          {!loading && search && results.length === 0 && <EmptyState message="ไม่พบข้อมูล" />}
          {!search && <p className="text-center py-8 text-sm" style={t3}>พิมพ์ชื่อลูกค้าเพื่อค้นหา</p>}
        </div>
      </div>
    </Sheet>
  )
}

// ─── Prospects Search Sheet ────────────────────────────────
function ProspectsSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const supabase = createClient()
  const [search, setSearch] = useState('')
  const [results, setResults] = useState<any[]>([])
  const [loading, setLoading] = useState(false)
  const [projectsMap, setProjectsMap] = useState<Record<string, string>>({})
  const timerRef = useRef<ReturnType<typeof setTimeout>>(undefined)

  useEffect(() => {
    supabase.from('projects').select('id, name').then(({ data }) => {
      if (data) setProjectsMap(Object.fromEntries(data.map((p: any) => [p.id, p.name])))
    })
  }, [])

  async function doSearch(q: string) {
    if (!q.trim()) { setResults([]); return }
    setLoading(true)
    const { data, error } = await supabase
      .from('customers')
      .select('id, customer_name, phone, interested_room, status, project_id, notes, created_at')
      .or(`customer_name.ilike.%${q}%,phone.ilike.%${q}%,interested_room.ilike.%${q}%`)
      .order('customer_name')
      .limit(12)
    if (error) console.error('ProspectsSheet search error:', error)
    setResults(data || [])
    setLoading(false)
  }

  function handleChange(v: string) {
    setSearch(v)
    clearTimeout(timerRef.current)
    timerRef.current = setTimeout(() => doSearch(v), 300)
  }

  return (
    <Sheet open={open} onClose={() => { setSearch(''); setResults([]); onClose() }} title="Prospects" icon={Users}>
      <div className="p-4">
        <div className="relative mb-4">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2" style={t3} />
          <input autoFocus value={search} onChange={e => handleChange(e.target.value)}
            placeholder="ชื่อ / เบอร์โทร / เลขห้อง..."
            className={sheetInput} style={sheetInputStyle} />
        </div>
        {loading && <p className="text-center py-4 text-sm" style={t2}>กำลังค้นหา...</p>}
        <div className="space-y-2">
          {results.map((c: any) => {
            const st = crmStage(c.status)
            return (
              <div key={c.id} style={sheetCard}>
                <div className="flex justify-between items-start gap-2 mb-1">
                  <p className="font-semibold" style={t1}>{c.customer_name}</p>
                  <span className={`${st.badge} flex-shrink-0`}>{st.label}</span>
                </div>
                <p className="text-xs" style={t2}>{projectsMap[c.project_id] || '—'} · ห้อง {c.interested_room || '—'}</p>
                {c.phone && <p className="text-xs mt-1 flex items-center gap-1" style={{ color: 'var(--accent-blue)' }}><Phone size={11} strokeWidth={1.75} />{c.phone}</p>}
                {c.notes && <p className="text-xs mt-1 truncate" style={t3}>{c.notes}</p>}
              </div>
            )
          })}
          {!loading && search && results.length === 0 && <EmptyState message="ไม่พบข้อมูล" />}
          {!search && <p className="text-center py-8 text-sm" style={t3}>พิมพ์ชื่อลูกค้าเพื่อค้นหา</p>}
        </div>
      </div>
    </Sheet>
  )
}

// ─── Event Add Sheet ───────────────────────────────────────
function EventAddSheet({ open, onClose, events }: {
  open: boolean; onClose: () => void; events: EventOption[]
}) {
  const supabase = createClient()
  const [step, setStep] = useState<'event' | 'search' | 'form'>('event')
  const [selectedEvent, setSelectedEvent] = useState<EventOption | null>(null)
  const [search, setSearch] = useState('')
  const [leads, setLeads] = useState<any[]>([])
  const [selectedLead, setSelectedLead] = useState<any | null>(null)
  const [loading, setLoading] = useState(false)
  const [status, setStatus] = useState('new')
  const [note, setNote] = useState('')
  const [saving, setSaving] = useState(false)
  const [projectsMap, setProjectsMap] = useState<Record<string, string>>({})
  const timerRef = useRef<ReturnType<typeof setTimeout>>(undefined)

  useEffect(() => {
    supabase.from('projects').select('id, name').then(({ data }) => {
      if (data) setProjectsMap(Object.fromEntries(data.map((p: any) => [p.id, p.name])))
    })
  }, [])

  async function searchLeads(q: string) {
    if (!selectedEvent || !q.trim()) { setLeads([]); return }
    setLoading(true)
    const { data, error } = await supabase
      .from('condo_leads')
      .select('id, customer_name, phone, room_no, tower, project_id')
      .eq('project_id', selectedEvent.projectId)
      .or(buildRoomOr(q, `customer_name.ilike.%${q}%,phone.ilike.%${q}%,room_no.ilike.%${q}%`))
      .order('customer_name')
      .limit(15)
    if (error) console.error('EventAddSheet search error:', error)
    setLeads(data || [])
    setLoading(false)
  }

  function handleSearch(v: string) {
    setSearch(v)
    clearTimeout(timerRef.current)
    timerRef.current = setTimeout(() => searchLeads(v), 300)
  }

  async function save() {
    if (!selectedEvent || !selectedLead) return
    setSaving(true)
    const existing = await supabase.from('event_customers')
      .select('id').eq('event_id', selectedEvent.id).eq('lead_id', selectedLead.id).maybeSingle()
    if (existing.data) {
      alert('ลูกค้านี้อยู่ใน Event แล้ว')
    } else {
      const { data: { user } } = await supabase.auth.getUser()
      await supabase.from('event_customers').insert({
        event_id: selectedEvent.id,
        lead_id: selectedLead.id,
        customer_name: selectedLead.customer_name,
        phone: selectedLead.phone,
        room_no: selectedLead.room_no,
        status,
        note,
        sales_id: user?.id,
      })
    }
    setSaving(false)
    resetAndClose()
  }

  function resetAndClose() {
    setStep('event'); setSelectedEvent(null); setSearch('')
    setLeads([]); setSelectedLead(null); setStatus('new'); setNote('')
    onClose()
  }

  const STATUS_OPTIONS = [
    { value: 'interested',    label: 'สนใจ ติดตามต่อ', activeColor: 'var(--accent-green)',  activeBg: 'color-mix(in srgb, var(--accent-green)  15%, transparent)', activeBorder: 'color-mix(in srgb, var(--accent-green)  40%, transparent)' },
    { value: 'booked',        label: 'Booked',           activeColor: 'var(--accent-blue)',   activeBg: 'color-mix(in srgb, var(--accent-blue)   15%, transparent)', activeBorder: 'color-mix(in srgb, var(--accent-blue)   40%, transparent)' },
    { value: 'not_interested',label: 'ไม่สนใจ',         activeColor: 'var(--accent-red)',    activeBg: 'color-mix(in srgb, var(--accent-red)    15%, transparent)', activeBorder: 'color-mix(in srgb, var(--accent-red)    40%, transparent)' },
    { value: 'not_met',       label: 'ไม่ได้พบ',        activeColor: 'var(--accent-orange)', activeBg: 'color-mix(in srgb, var(--accent-orange) 15%, transparent)', activeBorder: 'color-mix(in srgb, var(--accent-orange) 40%, transparent)' },
  ]

  return (
    <Sheet open={open} onClose={resetAndClose} title="เพิ่มลูกค้า Event" icon={CalendarDays}>
      {step === 'event' && (
        <div className="p-4">
          <p className="text-xs mb-3" style={t2}>เลือก Event</p>
          {events.length === 0 ? (
            <p className="text-center py-8 text-sm" style={t3}>ไม่มี Event</p>
          ) : (
            <div className="space-y-2">
              {events.map(ev => (
                <button key={ev.id} onClick={() => { setSelectedEvent(ev); setStep('search') }}
                  className="w-full flex items-center justify-between px-4 py-4 rounded-xl text-left transition-colors"
                  style={sheetCard}>
                  <div>
                    <p className="font-semibold text-sm" style={t1}>{ev.eventName}</p>
                    <p className="text-xs mt-0.5" style={t2}>{ev.projectName} · {fmtDate(ev.eventDate)}</p>
                  </div>
                  <ChevronRight size={16} style={t3} />
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {step === 'search' && selectedEvent && (
        <div className="p-4">
          <button onClick={() => setStep('event')} className="text-sm mb-3 flex items-center gap-1" style={{ color: 'var(--accent-blue)' }}>
            <ArrowLeft size={14} /> {selectedEvent.eventName}
          </button>
          <div className="relative mb-3">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2" style={t3} />
            <input autoFocus value={search} onChange={e => handleSearch(e.target.value)}
              placeholder="ค้นหาชื่อ / เบอร์ / เลขห้อง..."
              className={sheetInput} style={sheetInputStyle} />
          </div>
          {loading && <p className="text-center py-4 text-sm" style={t2}>กำลังค้นหา...</p>}
          <div className="space-y-2">
            {leads.map((l: any) => (
              <button key={l.id} onClick={() => { setSelectedLead(l); setStep('form') }}
                className="w-full flex items-center justify-between px-4 py-3 rounded-xl text-left"
                style={sheetCard}>
                <div>
                  <p className="text-sm font-semibold" style={t1}>{l.customer_name}</p>
                  <p className="text-xs" style={t2}>{projectsMap[l.project_id] || '—'} · {l.tower ? `${l.tower}-` : ''}ห้อง {l.room_no || '—'} · {l.phone || '—'}</p>
                </div>
                <ChevronRight size={16} style={t3} />
              </button>
            ))}
            {!loading && search && leads.length === 0 && (
              <EmptyState message="ไม่พบข้อมูลใน Origin Pool" />
            )}
          </div>
        </div>
      )}

      {step === 'form' && selectedLead && selectedEvent && (
        <div className="p-4 space-y-4">
          <button onClick={() => setStep('search')} className="text-sm flex items-center gap-1" style={{ color: 'var(--accent-blue)' }}>
            <ArrowLeft size={14} /> {selectedLead.customer_name}
          </button>
          <div style={{ ...sheetCard, borderRadius: 18, padding: '16px' }}>
            <p className="font-semibold" style={t1}>{selectedLead.customer_name}</p>
            <p className="text-xs mt-1" style={t2}>{selectedLead.tower ? `${selectedLead.tower}-` : ''}ห้อง {selectedLead.room_no || '—'} · {selectedLead.phone || '—'}</p>
            <p className="text-xs mt-0.5" style={t3}>Event: {selectedEvent.eventName}</p>
          </div>
          <div>
            <label className="text-xs mb-2 block" style={t3}>สถานะ</label>
            <div className="grid grid-cols-2 gap-2">
              {STATUS_OPTIONS.map(s => (
                <button key={s.value} onClick={() => setStatus(s.value)}
                  className="py-3 rounded-[11px] text-sm font-semibold transition-all border"
                  style={status === s.value
                    ? { background: s.activeBg, color: s.activeColor, borderColor: s.activeBorder }
                    : { background: 'var(--hover-bg)', color: 'var(--text-2)', borderColor: 'var(--divider)' }}>
                  {s.label}
                </button>
              ))}
            </div>
          </div>
          <div>
            <label className="text-xs mb-2 block" style={t3}>หมายเหตุ</label>
            <textarea value={note} onChange={e => setNote(e.target.value)} rows={3}
              placeholder="บันทึกเพิ่มเติม..."
              className="w-full rounded-[8px] px-4 py-3 text-sm resize-none focus:outline-none"
              style={{ ...sheetInputStyle, fontSize: 14 }} />
          </div>
          <button onClick={save} disabled={saving}
            className="w-full py-4 disabled:opacity-40 text-white font-semibold rounded-[var(--radius-pill)] transition-colors text-base"
            style={{ background: 'var(--accent-green)' }}>
            {saving ? 'กำลังบันทึก...' : 'เพิ่มในรายชื่อ Event'}
          </button>
        </div>
      )}
    </Sheet>
  )
}

const CHANNEL_OPTS = ['โอนเข้าบัญชีบริษัท', 'บัตรเครดิต', 'เงินสด', 'QR Code']

// ─── Quick Pay Sheet ───────────────────────────────────────
function buildLineMsg(job: JobOption, inst: { installment_name: string; installment_no: number; paid_date: string; paid_amount: number; channel: string }, vcCode: string, vcAmt: number, monthTotal?: number): string {
  const isDelivered = job.workingStatus === 'ส่งมอบแล้ว'
  const isFirst = inst.installment_no === 1
  const type = isDelivered ? 'ลูกค้าเก่า ส่งมอบ' : isFirst ? 'ลูกค้าใหม่' : 'ลูกค้าเก่า'
  const d = inst.paid_date ? new Date(inst.paid_date) : new Date()
  const dateStr = `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${String(d.getFullYear()).slice(2)}`
  const fmt = (n: number) => n.toLocaleString('th-TH')
  const lines = [
    `Wyde Int. (${type})`,
    `วันที่ : ${dateStr}`,
    `โครงการ : ${job.projectName}`,
    `ห้อง : ${job.roomNo}`,
    `ลูกค้าชื่อ : ${job.customerName}`,
    `Sales Wyde : ${job.salesName}`,
    `Package : ${fmt(job.revenue)} บาท`,
    ...(vcAmt > 0 ? [`หัก Voucher${vcCode ? ` (${vcCode})` : ''} : ${fmt(vcAmt)} บาท`] : []),
    `${inst.installment_name} : ${fmt(inst.paid_amount)} บาท`,
    ...(inst.channel ? [`ชำระผ่านทาง : ${inst.channel}`] : []),
    ...(job.expectedFinishDate ? [`วันคาดส่งมอบ : ${(() => { const d = new Date(job.expectedFinishDate); return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${String(d.getFullYear()).slice(2)}` })()} `] : []),
    '-'.repeat(41),
    `รายรับรวมเดือนนี้ : ${fmt(monthTotal ?? 0)} บาท`,
  ]
  return lines.join('\n')
}

async function sendLineNotify(message: string): Promise<string | null> {
  try {
    const res = await fetch('/api/line-notify', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ message }) })
    if (!res.ok) return null
    return new Date().toISOString()
  } catch { return null }
}

function QuickPaySheet({ open, onClose, jobs }: {
  open: boolean; onClose: () => void; jobs: JobOption[]
}) {
  const supabase = createClient()
  const [step, setStep] = useState<'job' | 'no_plan' | 'installment' | 'confirm'>('job')
  const [search, setSearch] = useState('')
  const [selectedJob, setSelectedJob] = useState<JobOption | null>(null)
  const [installments, setInstallments] = useState<any[]>([])
  const [selectedInst, setSelectedInst] = useState<any | null>(null)
  const [paidDate, setPaidDate] = useState('')
  const [paidAmount, setPaidAmount] = useState(0)
  const [channel, setChannel] = useState(CHANNEL_OPTS[0])
  const [slipPosted, setSlipPosted] = useState(false)
  const [receiptPosted, setReceiptPosted] = useState(false)
  const [useVoucher, setUseVoucher] = useState(false)
  const [voucherCode, setVoucherCode] = useState('')
  const [voucherAmount, setVoucherAmount] = useState(0)
  useEffect(() => { setPaidDate(new Date().toISOString().slice(0, 10)) }, [])
  const [saving, setSaving] = useState(false)

  async function selectJob(job: JobOption) {
    setSelectedJob(job)
    const { data } = await supabase.from('payments')
      .select('id, installment_name, amount, is_work_trigger, installment_no')
      .eq('job_id', job.id)
      .eq('status', 'pending')
      .order('installment_no')
    if (!data || data.length === 0) {
      const { count } = await supabase.from('payments').select('*', { count: 'exact', head: true }).eq('job_id', job.id)
      if (!count || count === 0) {
        setStep('no_plan')
      } else {
        setInstallments([])
        setStep('installment')
      }
    } else {
      setInstallments(data)
      setStep('installment')
    }
  }

  async function confirmPay() {
    if (!selectedInst || !selectedJob) return
    setSaving(true)
    const vcAmt = useVoucher ? voucherAmount : 0
    const vcCode = useVoucher ? voucherCode : ''

    await supabase.from('payments').update({
      status: 'paid', paid_date: paidDate, paid_amount: paidAmount,
      channel: channel || null,
      slip_url: slipPosted ? 'posted' : null,
      receipt_url: receiptPosted ? 'posted' : null,
      voucher_code: vcCode || null,
      voucher_amount: vcAmt || null,
    }).eq('id', selectedInst.id)

    if (selectedInst.is_work_trigger) {
      await supabase.from('jobs').update({ work_start_date: paidDate, working_status: 'ดำเนินการ' }).eq('id', selectedJob.id)
      const { data: jobData } = await supabase.from('jobs').select('customer_id').eq('id', selectedJob.id).maybeSingle()
      if (jobData?.customer_id) {
        await supabase.from('customers').update({ status: 'closed' }).eq('id', jobData.customer_id)
      }
    }
    setSaving(false)
    resetAndClose()
  }

  function resetAndClose() {
    setStep('job'); setSearch(''); setSelectedJob(null)
    setInstallments([]); setSelectedInst(null)
    setSlipPosted(false); setReceiptPosted(false); setChannel(CHANNEL_OPTS[0])
    setUseVoucher(false); setVoucherCode(''); setVoucherAmount(0)
    onClose()
  }

  const filteredJobs = jobs.filter(j =>
    !search || j.customerName.toLowerCase().includes(search.toLowerCase()) ||
    normRoom(j.roomNo).includes(normRoom(search)) ||
    j.projectName.toLowerCase().includes(search.toLowerCase())
  )

  return (
    <Sheet open={open} onClose={resetAndClose} title="บันทึกรับเงิน" icon={Receipt}>
      {step === 'job' && (
        <div className="p-4">
          <div className="relative mb-3">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2" style={t3} />
            <input autoFocus value={search} onChange={e => setSearch(e.target.value)}
              placeholder="พิมพ์ชื่อลูกค้า / ห้อง / โครงการ..."
              className={sheetInput} style={sheetInputStyle} />
          </div>
          <div className="space-y-2">
            {filteredJobs.slice(0, 15).map(j => (
              <button key={j.id} onClick={() => selectJob(j)}
                className="w-full flex items-center justify-between px-4 py-3.5 rounded-xl transition-colors text-left"
                style={sheetCard}>
                <div>
                  <p className="font-semibold text-sm" style={t1}>{j.customerName}</p>
                  <p className="text-xs mt-0.5" style={t2}>{j.roomNo} · {j.projectName}</p>
                </div>
                <ChevronRight size={16} style={t3} />
              </button>
            ))}
          </div>
        </div>
      )}

      {step === 'no_plan' && selectedJob && (
        <div className="p-6 text-center">
          <AlertCircle size={40} className="mx-auto text-value mb-4" />
          <h4 className="font-semibold text-lg mb-2" style={t1}>ยังไม่ได้ตั้งแผนชำระ</h4>
          <p className="text-sm mb-2" style={t2}>{selectedJob.customerName}</p>
          <p className="text-sm mb-6" style={t2}>{selectedJob.roomNo} · {selectedJob.projectName}</p>
          <p className="text-xs mb-6" style={t3}>กรุณาตั้งแผนงวดชำระเงินก่อน จึงจะบันทึกรับเงินได้</p>
          <button onClick={() => setStep('job')}
            className="w-full py-3 rounded-[8px] mb-3 text-sm" style={{ background: 'var(--hover-bg)', color: 'var(--text-2)', border: '1px solid var(--divider)' }}>
            ← เลือกลูกค้าอื่น
          </button>
          <button onClick={resetAndClose}
            className="w-full py-3 rounded-[var(--radius-pill)] text-sm font-semibold"
            style={{ background: 'color-mix(in srgb, var(--accent-orange) 15%, transparent)', color: 'var(--accent-orange)' }}>
            ไปตั้งแผนชำระ →
          </button>
        </div>
      )}

      {step === 'installment' && selectedJob && (
        <div className="p-4">
          <button onClick={() => setStep('job')} className="text-sm mb-4 flex items-center gap-1" style={{ color: 'var(--accent-blue)' }}>
            <ArrowLeft size={14} /> {selectedJob.customerName} · {selectedJob.roomNo}
          </button>
          {installments.length === 0 ? (
            <div className="text-center py-8 flex items-center justify-center gap-2" style={t2}><CheckCircle2 size={16} style={{ color: 'var(--accent-green)' }} />ชำระครบทุกงวดแล้ว</div>
          ) : (
            <div className="space-y-2">
              <p className="text-xs mb-3" style={t2}>เลือกงวดที่ต้องการบันทึก</p>
              {installments.map((inst: any) => (
                <button key={inst.id} onClick={() => { setSelectedInst(inst); setPaidAmount(inst.amount || 0); setStep('confirm') }}
                  className="w-full flex items-center justify-between px-4 py-4 rounded-xl transition-colors"
                  style={sheetCard}>
                  <div className="text-left">
                    <p className="font-semibold text-sm" style={t1}>{inst.installment_name}</p>
                    {inst.is_work_trigger && <p className="text-xs mt-0.5 flex items-center gap-1" style={{ color: 'var(--accent-orange)' }}><Zap size={10} strokeWidth={2} />ชำระแล้วเริ่มงาน</p>}
                  </div>
                  <div className="text-right">
                    <p className="font-bold" style={{ color: 'var(--accent-green)' }}>{fmtBaht(inst.amount)}</p>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {step === 'confirm' && selectedInst && selectedJob && (
        <div className="p-4 space-y-4">
          <button onClick={() => setStep('installment')} className="text-sm flex items-center gap-1" style={{ color: 'var(--accent-blue)' }}>
            <ArrowLeft size={14} /> {selectedInst.installment_name}
          </button>
          <div className="rounded-2xl p-5 text-center" style={sheetCard}>
            <p className="text-xs mb-1" style={t2}>{selectedJob.customerName} · {selectedJob.roomNo}</p>
            <p className="text-3xl font-bold mb-1" style={t1}>{fmtBaht(selectedInst.amount)}</p>
            <p className="text-xs" style={t2}>{selectedInst.installment_name}</p>
            {selectedInst.is_work_trigger && (
              <p className="text-xs mt-2 flex items-center justify-center gap-1" style={{ color: 'var(--accent-orange)' }}><Zap size={11} strokeWidth={2} />ชำระงวดนี้ → เริ่มนับวันงาน</p>
            )}
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs mb-2 block" style={t3}>ยอดที่รับจริง (฿)</label>
              <input type="number" value={paidAmount || ''} onChange={e => setPaidAmount(+e.target.value)}
                className="w-full rounded-[8px] px-4 py-3 text-sm focus:outline-none font-semibold"
                style={sheetInputStyle} placeholder="0" />
            </div>
            <div>
              <label className="text-xs mb-2 block" style={t3}>วันที่ชำระ</label>
              <DateInput value={paidDate} onChange={e => setPaidDate(e.target.value)}
                className="w-full rounded-[8px] px-4 py-3 text-sm focus:outline-none"
                style={sheetInputStyle} />
            </div>
          </div>
          <div>
            <label className="text-xs mb-2 block" style={t3}>ช่องทางชำระเงิน</label>
            <select value={channel} onChange={e => setChannel(e.target.value)}
              className="w-full rounded-[8px] px-4 py-3 text-sm focus:outline-none appearance-none"
              style={sheetInputStyle}>
              {CHANNEL_OPTS.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
          <div className="rounded-[11px] p-3 space-y-2.5" style={{ background: 'var(--hover-bg)', border: '1px solid var(--divider)' }}>
            <label className="flex items-center gap-3 cursor-pointer select-none">
              <input type="checkbox" checked={useVoucher} onChange={e => setUseVoucher(e.target.checked)}
                className="w-4 h-4 rounded" style={{ accentColor: 'var(--accent-orange)' }} />
              <span className="text-xs font-semibold" style={{ color: useVoucher ? 'var(--accent-orange)' : 'var(--text-2)' }}>มีการใช้ Voucher</span>
            </label>
            {useVoucher && (
              <div className="grid grid-cols-2 gap-2 pt-1">
                <div>
                  <label className="text-xs mb-1 block" style={t3}>รหัส Voucher</label>
                  <input value={voucherCode} onChange={e => setVoucherCode(e.target.value)}
                    placeholder="VCH-XXXX" className="w-full rounded-[8px] px-3 py-2 text-sm focus:outline-none"
                    style={sheetInputStyle} />
                </div>
                <div>
                  <label className="text-xs mb-1 block" style={t3}>มูลค่า (฿)</label>
                  <input type="number" value={voucherAmount || ''} onChange={e => setVoucherAmount(+e.target.value)}
                    placeholder="0" className="w-full rounded-[8px] px-3 py-2 text-sm focus:outline-none"
                    style={sheetInputStyle} />
                </div>
              </div>
            )}
          </div>
          <div className="rounded-[11px] p-3 space-y-2.5" style={{ background: 'var(--hover-bg)', border: '1px solid var(--divider)' }}>
            <label className="flex items-center gap-3 cursor-pointer select-none">
              <input type="checkbox" checked={slipPosted} onChange={e => setSlipPosted(e.target.checked)}
                className="w-4 h-4 rounded" style={{ accentColor: 'var(--accent-blue)' }} />
              <span className="text-xs font-semibold" style={{ color: slipPosted ? 'var(--accent-blue)' : 'var(--text-2)' }}>สลิปโอนเงิน / บัตรเครดิต โพสต์ใน Line แล้ว</span>
            </label>
            <label className="flex items-center gap-3 cursor-pointer select-none">
              <input type="checkbox" checked={receiptPosted} onChange={e => setReceiptPosted(e.target.checked)}
                className="w-4 h-4 rounded" style={{ accentColor: 'var(--accent-green)' }} />
              <span className="text-xs font-semibold" style={{ color: receiptPosted ? 'var(--accent-green)' : 'var(--text-2)' }}>ใบเสร็จรับเงิน โพสต์ใน Line แล้ว</span>
            </label>
          </div>
          <button onClick={confirmPay} disabled={saving}
            className="w-full py-4 disabled:opacity-40 text-white font-semibold rounded-[var(--radius-pill)] transition-colors text-base"
            style={{ background: 'var(--accent-green)' }}>
            {saving ? 'กำลังบันทึก...' : 'ยืนยันรับเงิน'}
          </button>
        </div>
      )}
    </Sheet>
  )
}

// ─── Plan Setup Sheet ──────────────────────────────────────
function PlanSetupSheet({ open, onClose, jobs }: {
  open: boolean; onClose: () => void; jobs: JobOption[]
}) {
  const supabase = createClient()
  const [step, setStep] = useState<'job' | 'type' | 'b2c' | 'b2b'>('job')
  const [search, setSearch] = useState('')
  const [selectedJob, setSelectedJob] = useState<JobOption | null>(null)
  const [b2bCount, setB2bCount] = useState(3)
  const [b2bPcts, setB2bPcts] = useState<number[]>([34, 33, 33])
  const [saving, setSaving] = useState(false)

  const filteredJobs = jobs.filter(j =>
    !search || j.customerName.toLowerCase().includes(search.toLowerCase()) ||
    normRoom(j.roomNo).includes(normRoom(search))
  )

  function selectB2bCount(n: number) {
    setB2bCount(n)
    const base = Math.floor(100 / n)
    const rem = 100 - base * n
    setB2bPcts(Array.from({ length: n }, (_, i) => i === n - 1 ? base + rem : base))
  }

  function calcB2CInstallments(plan: 'A' | 'B' | 'C') {
    const total = selectedJob?.revenue || 0
    if (plan === 'A') return [
      { no: 1, name: 'ชำระเต็มจำนวน 100%', pct: 100, amount: total, trigger: true, final: true }
    ]
    if (plan === 'B') return [
      { no: 1, name: 'ชำระ 50% แรก (เริ่มงาน)', pct: 50, amount: Math.round(total * 0.5), trigger: true, final: false },
      { no: 2, name: 'ชำระ 50% สุดท้าย (ส่งมอบ)', pct: 50, amount: Math.round(total * 0.5), trigger: false, final: true },
    ]
    const dep = Math.round(total * 0.1)
    const rest = Math.round((total - dep) / 2)
    return [
      { no: 1, name: 'มัดจำจองสิทธิ์', pct: 10, amount: dep, trigger: false, final: false },
      { no: 2, name: 'ชำระ 50% แรก (เริ่มงาน)', pct: 45, amount: rest, trigger: true, final: false },
      { no: 3, name: 'ชำระ 50% สุดท้าย (ส่งมอบ)', pct: 45, amount: total - dep - rest, trigger: false, final: true },
    ]
  }

  async function saveInstallments(installments: any[]) {
    if (!selectedJob) return
    setSaving(true)
    await supabase.from('payments').delete().eq('job_id', selectedJob.id).eq('status', 'pending')
    const rows = installments.map(i => ({
      job_id: selectedJob.id,
      installment_no: i.no,
      installment_name: i.name,
      amount: i.amount,
      percentage: i.pct,
      status: 'pending',
      is_work_trigger: i.trigger,
      is_final: i.final,
    }))
    await supabase.from('payments').insert(rows)
    await supabase.from('jobs').update({ payment_plan_type: 'B2C' }).eq('id', selectedJob.id)
    setSaving(false)
    resetAndClose()
    alert('ตั้งแผนชำระเรียบร้อย ✅')
  }

  async function saveB2BInstallments() {
    if (!selectedJob) return
    const total = selectedJob.revenue
    const insts = b2bPcts.map((pct, i) => ({
      no: i + 1,
      name: i === 0 ? 'งวดที่ 1 (เริ่มงาน)' : i === b2bCount - 1 ? `งวดสุดท้าย (ส่งมอบ)` : `งวดที่ ${i + 1}`,
      pct, amount: Math.round((pct / 100) * total),
      trigger: i === 0, final: i === b2bCount - 1,
    }))
    setSaving(true)
    await supabase.from('payments').delete().eq('job_id', selectedJob.id).eq('status', 'pending')
    const rows = insts.map(i => ({
      job_id: selectedJob.id,
      installment_no: i.no, installment_name: i.name,
      amount: i.amount, percentage: i.pct, status: 'pending',
      is_work_trigger: i.trigger, is_final: i.final,
    }))
    await supabase.from('payments').insert(rows)
    await supabase.from('jobs').update({ payment_plan_type: 'B2B' }).eq('id', selectedJob.id)
    setSaving(false)
    resetAndClose()
    alert('ตั้งแผนชำระเรียบร้อย ✅')
  }

  function resetAndClose() {
    setStep('job'); setSearch(''); setSelectedJob(null)
    setB2bCount(3); setB2bPcts([34, 33, 33]); onClose()
  }

  const totalPct = b2bPcts.reduce((s, p) => s + p, 0)

  return (
    <Sheet open={open} onClose={resetAndClose} title="ตั้งแผนชำระ" icon={ClipboardList}>
      {step === 'job' && (
        <div className="p-4">
          <div className="relative mb-3">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2" style={t3} />
            <input autoFocus value={search} onChange={e => setSearch(e.target.value)}
              placeholder="ค้นหาลูกค้า Wyde..."
              className={sheetInput} style={sheetInputStyle} />
          </div>
          <div className="space-y-2">
            {filteredJobs.slice(0, 15).map(j => (
              <button key={j.id} onClick={() => { setSelectedJob(j); setStep('type') }}
                className="w-full flex items-center justify-between px-4 py-3.5 rounded-xl text-left" style={sheetCard}>
                <div>
                  <p className="font-semibold text-sm" style={t1}>{j.customerName}</p>
                  <p className="text-xs mt-0.5" style={t2}>{j.roomNo} · {j.projectName} · {fmtBaht(j.revenue)}</p>
                </div>
                <ChevronRight size={16} style={t3} />
              </button>
            ))}
          </div>
        </div>
      )}

      {step === 'type' && selectedJob && (
        <div className="p-4">
          <button onClick={() => setStep('job')} className="text-sm mb-4 flex items-center gap-1" style={{ color: 'var(--accent-blue)' }}>
            <ArrowLeft size={14} /> {selectedJob.customerName}
          </button>
          <div className="rounded-2xl p-4 mb-5" style={sheetCard}>
            <p className="font-semibold" style={t1}>{selectedJob.customerName}</p>
            <p className="text-xs mt-1" style={t2}>{selectedJob.roomNo} · {selectedJob.projectName}</p>
            <p className="font-bold mt-1" style={{ color: 'var(--accent-green)' }}>{fmtBaht(selectedJob.revenue)}</p>
          </div>
          <p className="text-xs mb-3" style={t2}>ประเภทลูกค้า</p>
          <div className="grid grid-cols-2 gap-3">
            <button onClick={() => setStep('b2c')}
              className="py-5 rounded-[18px] font-semibold text-center border"
              style={{ background: 'color-mix(in srgb, var(--accent-blue) 12%, transparent)', borderColor: 'color-mix(in srgb, var(--accent-blue) 30%, transparent)', color: 'var(--accent-blue)' }}>
              <User size={28} strokeWidth={1.5} className="mx-auto mb-1" />
              B2C
              <p className="text-xs font-normal mt-1" style={t3}>บุคคลธรรมดา</p>
            </button>
            <button onClick={() => setStep('b2b')}
              className="py-5 rounded-[18px] font-semibold text-center border"
              style={{ background: 'color-mix(in srgb, var(--accent-purple) 12%, transparent)', borderColor: 'color-mix(in srgb, var(--accent-purple) 30%, transparent)', color: 'var(--accent-purple)' }}>
              <Building2 size={28} strokeWidth={1.5} className="mx-auto mb-1" />
              B2B
              <p className="text-xs font-normal mt-1" style={t3}>นิติบุคคล</p>
            </button>
          </div>
        </div>
      )}

      {step === 'b2c' && selectedJob && (
        <div className="p-4">
          <button onClick={() => setStep('type')} className="text-sm mb-4 flex items-center gap-1" style={{ color: 'var(--accent-blue)' }}>
            <ArrowLeft size={14} /> เลือกแผน B2C
          </button>
          <div className="space-y-3">
            {(['A', 'B', 'C'] as const).map(plan => {
              const insts = calcB2CInstallments(plan)
              const labels: Record<string, string> = { A: 'แผน A — จ่ายครั้งเดียว 100%', B: 'แผน B — 50% + 50%', C: 'แผน C — มัดจำ + 50% + 50%' }
              return (
                <div key={plan} style={sheetCard}>
                  <p className="font-semibold mb-3" style={t1}>{labels[plan]}</p>
                  <div className="space-y-1 mb-4">
                    {insts.map(i => (
                      <div key={i.no} className="flex justify-between text-xs">
                        <span style={t2}>{i.name}</span>
                        <span style={t1}>{fmtBaht(i.amount)}</span>
                      </div>
                    ))}
                  </div>
                  <button onClick={() => saveInstallments(insts)} disabled={saving}
                    className="w-full py-3 rounded-[var(--radius-pill)] text-sm font-semibold disabled:opacity-40 border"
                    style={{ background: 'color-mix(in srgb, var(--accent) 20%, transparent)', borderColor: 'color-mix(in srgb, var(--accent) 40%, transparent)', color: 'var(--accent)' }}>
                    {saving ? 'กำลังบันทึก...' : `เลือกแผน ${plan}`}
                  </button>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {step === 'b2b' && selectedJob && (
        <div className="p-4">
          <button onClick={() => setStep('type')} className="text-sm mb-4 flex items-center gap-1" style={{ color: 'var(--accent-blue)' }}>
            <ArrowLeft size={14} /> B2B — กำหนดงวด
          </button>
          <div className="mb-4">
            <label className="text-xs mb-2 block" style={t3}>จำนวนงวด</label>
            <div className="flex gap-2">
              {[2, 3, 4, 5, 6].map(n => (
                <button key={n} onClick={() => selectB2bCount(n)}
                  className="flex-1 py-3 rounded-[8px] text-sm font-semibold transition-colors border"
                  style={b2bCount === n
                    ? { background: 'color-mix(in srgb, var(--accent-purple) 20%, transparent)', borderColor: 'color-mix(in srgb, var(--accent-purple) 40%, transparent)', color: 'var(--accent-purple)' }
                    : { background: 'var(--hover-bg)', color: 'var(--text-2)', borderColor: 'var(--divider)' }}>
                  {n}
                </button>
              ))}
            </div>
          </div>
          <div className="space-y-2 mb-4">
            {b2bPcts.map((pct, i) => (
              <div key={i} className="flex items-center gap-3 rounded-xl px-4 py-3" style={sheetCard}>
                <span className="text-xs w-16 flex-shrink-0" style={t2}>งวดที่ {i + 1}</span>
                <input type="number" value={pct}
                  onChange={e => { const n = [...b2bPcts]; n[i] = Number(e.target.value); setB2bPcts(n) }}
                  className="w-16 rounded-lg px-2 py-1.5 text-sm text-center focus:outline-none"
                  style={{ ...sheetCardDark, color: 'var(--text-1)', fontSize: 14 }} />
                <span className="text-xs" style={t2}>%</span>
                <span className="text-xs ml-auto" style={t1}>{fmtBaht(Math.round((pct / 100) * selectedJob.revenue))}</span>
              </div>
            ))}
          </div>
          <div className="text-center text-sm mb-4" style={{ color: totalPct === 100 ? 'var(--accent-green)' : 'var(--accent-red)' }}>
            รวม {totalPct}% {totalPct !== 100 && '— ต้องรวมได้ 100%'}
          </div>
          <button onClick={saveB2BInstallments} disabled={saving || totalPct !== 100}
            className="w-full py-4 disabled:opacity-40 text-white font-semibold rounded-[var(--radius-pill)] transition-colors"
            style={{ background: 'var(--accent-purple)' }}>
            {saving ? 'กำลังบันทึก...' : 'บันทึกแผนชำระ B2B'}
          </button>
        </div>
      )}
    </Sheet>
  )
}

// ─── Deliver Sheet ─────────────────────────────────────────
function DeliverSheet({ open, onClose, jobs }: {
  open: boolean; onClose: () => void; jobs: JobOption[]
}) {
  const supabase = createClient()
  const [step, setStep] = useState<'job' | 'confirm'>('job')
  const [search, setSearch] = useState('')
  const [selectedJob, setSelectedJob] = useState<JobOption | null>(null)
  const [deliveryDate, setDeliveryDate] = useState('')
  useEffect(() => { setDeliveryDate(new Date().toISOString().slice(0, 10)) }, [])
  const [fileUrl, setFileUrl] = useState('')
  const [saving, setSaving] = useState(false)
  const [canDeliver, setCanDeliver] = useState(false)
  const [checkingPlan, setCheckingPlan] = useState(false)

  async function selectJob(job: JobOption) {
    setSelectedJob(job)
    setCheckingPlan(true)
    const { data } = await supabase.from('payments')
      .select('id, is_final, status')
      .eq('job_id', job.id)
      .eq('is_final', true)
      .maybeSingle()
    setCanDeliver(!!data && data.status === 'paid')
    setCheckingPlan(false)
    setStep('confirm')
  }

  async function saveDelivery() {
    if (!selectedJob) return
    setSaving(true)
    const { data: existing } = await supabase.from('handovers')
      .select('id').eq('job_id', selectedJob.id).maybeSingle()
    if (existing) {
      await supabase.from('handovers').update({
        work_status: 'delivered',
        delivery_date: deliveryDate,
        delivery_file_url: fileUrl || null,
        commission_triggered: true,
      }).eq('job_id', selectedJob.id)
    } else {
      await supabase.from('handovers').insert({
        id: `HOV-${selectedJob.id}`,
        job_id: selectedJob.id,
        status: 'completed',
        work_status: 'delivered',
        delivery_date: deliveryDate,
        delivery_file_url: fileUrl || null,
        commission_triggered: true,
      })
    }
    await supabase.from('jobs').update({ working_status: 'ส่งมอบแล้ว' }).eq('id', selectedJob.id)
    setSaving(false)
    resetAndClose()
    alert('บันทึกส่งมอบเรียบร้อย ✅')
  }

  function resetAndClose() {
    setStep('job'); setSearch(''); setSelectedJob(null)
    setDeliveryDate(new Date().toISOString().slice(0, 10)); setFileUrl(''); onClose()
  }

  const filteredJobs = jobs.filter(j =>
    j.workingStatus !== 'ส่งมอบแล้ว' && (
      !search || j.customerName.toLowerCase().includes(search.toLowerCase()) ||
      normRoom(j.roomNo).includes(normRoom(search)) ||
      j.projectName.toLowerCase().includes(search.toLowerCase())
    )
  )

  return (
    <Sheet open={open} onClose={resetAndClose} title="บันทึกส่งมอบ" icon={ArrowRightLeft}>
      {step === 'job' && (
        <div className="p-4">
          <div className="relative mb-3">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2" style={t3} />
            <input autoFocus value={search} onChange={e => setSearch(e.target.value)}
              placeholder="ค้นหาลูกค้า..."
              className={sheetInput} style={sheetInputStyle} />
          </div>
          <div className="space-y-2">
            {filteredJobs.slice(0, 15).map(j => (
              <button key={j.id} onClick={() => selectJob(j)}
                className="w-full flex items-center justify-between px-4 py-3.5 rounded-xl text-left" style={sheetCard}>
                <div>
                  <p className="font-semibold text-sm" style={t1}>{j.customerName}</p>
                  <p className="text-xs mt-0.5" style={t2}>{j.roomNo} · {j.projectName}</p>
                  <p className="text-xs" style={t3}>{j.workingStatus}</p>
                </div>
                <ChevronRight size={16} style={t3} />
              </button>
            ))}
          </div>
        </div>
      )}

      {step === 'confirm' && selectedJob && (
        <div className="p-4 space-y-4">
          <button onClick={() => setStep('job')} className="text-sm flex items-center gap-1" style={{ color: 'var(--accent-blue)' }}>
            <ArrowLeft size={14} /> {selectedJob.customerName}
          </button>
          <div className="rounded-2xl p-4 text-center" style={sheetCard}>
            <p className="font-semibold text-lg" style={t1}>{selectedJob.customerName}</p>
            <p className="text-sm mt-1" style={t2}>{selectedJob.roomNo} · {selectedJob.projectName}</p>
            <p className="font-bold mt-2" style={{ color: 'var(--accent-green)' }}>{fmtBaht(selectedJob.revenue)}</p>
          </div>

          {checkingPlan ? (
            <p className="text-center text-sm" style={t2}>กำลังตรวจสอบ...</p>
          ) : !canDeliver ? (
            <div className="rounded-[18px] p-4 text-center" style={{ background: 'color-mix(in srgb, var(--accent-red) 10%, transparent)', border: '1px solid color-mix(in srgb, var(--accent-red) 20%, transparent)' }}>
              <AlertTriangle size={24} className="mx-auto mb-2" style={{ color: 'var(--accent-red)' }} />
              <p className="font-semibold text-sm" style={{ color: 'var(--accent-red)' }}>ยังชำระไม่ครบ</p>
              <p className="text-xs mt-1" style={t2}>ต้องชำระงวดสุดท้ายก่อนจึงจะส่งมอบได้</p>
            </div>
          ) : (
            <>
              <div>
                <label className="text-xs mb-2 block" style={t3}>วันที่ส่งมอบจริง</label>
                <DateInput value={deliveryDate} onChange={e => setDeliveryDate(e.target.value)}
                  className="w-full rounded-[8px] px-4 py-3 text-sm focus:outline-none" style={sheetInputStyle} />
              </div>
              <div>
                <label className="text-xs mb-2 block" style={t3}>เอกสารส่งมอบ (Google Drive URL)</label>
                <input value={fileUrl} onChange={e => setFileUrl(e.target.value)}
                  placeholder="https://drive.google.com/..."
                  className="w-full rounded-[8px] px-4 py-3 text-sm focus:outline-none" style={sheetInputStyle} />
              </div>
              <button onClick={saveDelivery} disabled={saving}
                className="w-full py-4 disabled:opacity-40 text-white font-semibold rounded-[var(--radius-pill)] transition-colors text-base"
                style={{ background: 'var(--accent-green)' }}>
                {saving ? 'กำลังบันทึก...' : 'ยืนยันส่งมอบงาน'}
              </button>
            </>
          )}
        </div>
      )}
    </Sheet>
  )
}

// ─── Handover Status Sheet ─────────────────────────────────
function QuickHandoverSheet({ open, onClose, jobs }: {
  open: boolean; onClose: () => void; jobs: JobOption[]
}) {
  const supabase = createClient()
  const [search, setSearch] = useState('')
  const [jobStatuses, setJobStatuses] = useState<Record<string, string>>({})
  const [saving, setSaving] = useState<string | null>(null)

  useEffect(() => {
    if (!open || jobs.length === 0) return
    supabase.from('handovers').select('job_id, work_status')
      .in('job_id', jobs.map(j => j.id))
      .then(({ data }) => {
        const map: Record<string, string> = {}
        ;(data || []).forEach((h: any) => { map[h.job_id] = h.work_status })
        setJobStatuses(map)
      })
  }, [open, jobs])

  const STATUS_OPTIONS = [
    { value: 'in_progress',      label: 'กำลังดำเนินการ', activeStyle: { color: 'var(--accent-orange)', background: 'color-mix(in srgb, var(--accent-orange) 15%, transparent)', borderColor: 'color-mix(in srgb, var(--accent-orange) 35%, transparent)' } },
    { value: 'ready_to_deliver', label: 'รอส่งมอบ',        activeStyle: { color: 'var(--accent-blue)',   background: 'color-mix(in srgb, var(--accent-blue)   15%, transparent)', borderColor: 'color-mix(in srgb, var(--accent-blue)   35%, transparent)' } },
  ]

  async function updateStatus(jobId: string, status: string) {
    setSaving(jobId)
    const { data: ex } = await supabase.from('handovers').select('id').eq('job_id', jobId).maybeSingle()
    if (ex) {
      await supabase.from('handovers').update({ work_status: status }).eq('job_id', jobId)
    } else {
      await supabase.from('handovers').insert({ id: `HOV-${jobId}`, job_id: jobId, work_status: status, status: 'scheduled' })
    }
    setJobStatuses(prev => ({ ...prev, [jobId]: status }))
    setSaving(null)
  }

  const filtered = jobs.filter(j =>
    j.workingStatus !== 'ส่งมอบแล้ว' && (
      !search || j.customerName.toLowerCase().includes(search.toLowerCase()) || normRoom(j.roomNo).includes(normRoom(search))
    )
  )

  return (
    <Sheet open={open} onClose={() => { setSearch(''); onClose() }} title="อัปเดตสถานะงาน" icon={ClipboardList}>
      <div className="p-4">
        <div className="relative mb-3">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2" style={t3} />
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="ค้นหา..."
            className={sheetInput} style={sheetInputStyle} />
        </div>
        <div className="space-y-2">
          {filtered.slice(0, 12).map(j => (
            <div key={j.id} className="rounded-xl p-3" style={sheetCard}>
              <div className="flex justify-between mb-1">
                <div>
                  <p className="text-sm font-semibold" style={t1}>{j.customerName}</p>
                  <p className="text-xs" style={t2}>{j.roomNo} · {j.projectName}</p>
                </div>
                {saving === j.id && <span className="text-xs" style={t2}>บันทึก...</span>}
              </div>
              {jobStatuses[j.id] && (
                <p className="text-xs mb-2" style={t3}>ปัจจุบัน: {STATUS_OPTIONS.find(s => s.value === jobStatuses[j.id])?.label || jobStatuses[j.id]}</p>
              )}
              <div className="flex gap-2">
                {STATUS_OPTIONS.map(s => (
                  <button key={s.value} onClick={() => updateStatus(j.id, s.value)}
                    className="flex-1 py-2.5 rounded-lg text-xs font-semibold transition-colors border"
                    style={jobStatuses[j.id] === s.value ? s.activeStyle : { background: 'var(--card-bg)', color: 'var(--text-2)', borderColor: 'var(--divider)' }}>
                    {s.label}
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </Sheet>
  )
}

// ─── Overdue Sheet ─────────────────────────────────────────
function OverdueSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const supabase = createClient()
  const [items, setItems] = useState<any[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!open) return
    setLoading(true)
    supabase.from('jobs')
      .select('id, customer_name, room_no, work_start_date, work_days, projects:project_id(name), sales:sales_id(name)')
      .not('work_start_date', 'is', null)
      .not('working_status', 'eq', 'ส่งมอบแล้ว')
      .not('working_status', 'eq', 'ยกเลิก')
      .then(({ data }) => {
        const today = Date.now()
        const list = (data || []).filter((j: any) => {
          if (!j.work_days) return false
          const end = new Date(j.work_start_date); end.setDate(end.getDate() + j.work_days)
          return end.getTime() < today
        }).map((j: any) => {
          const end = new Date(j.work_start_date); end.setDate(end.getDate() + j.work_days)
          return { ...j, daysOverdue: Math.floor((today - end.getTime()) / 86400000), endDate: end.toISOString().slice(0, 10) }
        }).sort((a: any, b: any) => b.daysOverdue - a.daysOverdue)
        setItems(list)
        setLoading(false)
      })
  }, [open])

  return (
    <Sheet open={open} onClose={onClose} title="งานเกินกำหนด" icon={AlertTriangle}>
      <div className="p-4">
        {loading ? <div className="py-8 flex justify-center"><Spinner /></div>
          : items.length === 0 ? (
            <div className="text-center py-8">
              <CheckCircle2 size={32} className="mx-auto mb-3" style={{ color: 'color-mix(in srgb, var(--accent-green) 50%, transparent)' }} />
              <p style={t2}>ไม่มีงานเกินกำหนด 🎉</p>
            </div>
          ) : items.map((j: any) => (
            <div key={j.id} className="rounded-[18px] p-3 mb-2" style={{ background: 'color-mix(in srgb, var(--accent-red) 8%, transparent)', border: '1px solid color-mix(in srgb, var(--accent-red) 20%, transparent)' }}>
              <div className="flex justify-between items-start">
                <div>
                  <p className="font-semibold text-sm" style={t1}>{j.customer_name}</p>
                  <p className="text-xs" style={t2}>{j.room_no} · {(j.projects as any)?.name}</p>
                </div>
                <span className="font-bold text-sm" style={{ color: 'var(--accent-red)' }}>เกิน {j.daysOverdue} วัน</span>
              </div>
              <p className="text-xs mt-1.5" style={t3}>ครบ {fmtDate(j.endDate)} · {(j.sales as any)?.name || '—'}</p>
            </div>
          ))}
      </div>
    </Sheet>
  )
}

// ─── Commission Sheet ──────────────────────────────────────
function CommissionSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const supabase = createClient()
  const [items, setItems] = useState<any[]>([])
  const [summary, setSummary] = useState({ total: 0, pending: 0, approved: 0 })
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!open) return
    setLoading(true)
    async function load() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return
      const { data: userData } = await supabase.from('users').select('id').eq('email', user.email!).maybeSingle()
      if (!userData) { setLoading(false); return }
      const { data } = await supabase.from('commissions')
        .select('id, job_id, amount, status, created_at, jobs:job_id(customer_name, room_no, projects:project_id(name))')
        .eq('sales_id', userData.id)
        .order('created_at', { ascending: false })
        .limit(20)
      const list = data || []
      setItems(list)
      setSummary({
        total: list.reduce((s: number, c: any) => s + (c.amount || 0), 0),
        pending: list.filter((c: any) => c.status === 'pending').reduce((s: number, c: any) => s + (c.amount || 0), 0),
        approved: list.filter((c: any) => c.status === 'approved').reduce((s: number, c: any) => s + (c.amount || 0), 0),
      })
      setLoading(false)
    }
    load()
  }, [open])

  const STATUS_STYLE: Record<string, string> = {
    pending: 'var(--accent-orange)', approved: 'var(--accent-green)', paid: 'var(--accent-blue)', rejected: 'var(--accent-red)'
  }

  return (
    <Sheet open={open} onClose={onClose} title="Commission ของฉัน" icon={DollarSign}>
      <div className="p-4">
        {loading ? <div className="py-8 flex justify-center"><Spinner /></div> : (
          <>
            <div className="grid grid-cols-3 gap-2 mb-5">
              <div className="rounded-2xl p-3 text-center" style={sheetCard}>
                <p className="text-micro mb-1" style={t3}>รวมทั้งหมด</p>
                <p className="font-bold text-sm" style={t1}>{fmtBaht(summary.total)}</p>
              </div>
              <div className="rounded-[18px] p-3 text-center" style={{ background: 'color-mix(in srgb, var(--accent-orange) 10%, transparent)' }}>
                <p className="text-micro mb-1" style={t3}>รอยืนยัน</p>
                <p className="font-bold text-sm" style={{ color: 'var(--accent-orange)' }}>{fmtBaht(summary.pending)}</p>
              </div>
              <div className="rounded-[18px] p-3 text-center" style={{ background: 'color-mix(in srgb, var(--accent-green) 10%, transparent)' }}>
                <p className="text-micro mb-1" style={t3}>อนุมัติแล้ว</p>
                <p className="font-bold text-sm" style={{ color: 'var(--accent-green)' }}>{fmtBaht(summary.approved)}</p>
              </div>
            </div>
            <div className="space-y-2">
              {items.map((c: any) => (
                <div key={c.id} className="rounded-xl p-3" style={sheetCard}>
                  <div className="flex justify-between items-start">
                    <div>
                      <p className="text-sm font-semibold" style={t1}>{(c.jobs as any)?.customer_name || '—'}</p>
                      <p className="text-xs" style={t2}>{(c.jobs as any)?.room_no} · {((c.jobs as any)?.projects as any)?.name}</p>
                    </div>
                    <div className="text-right">
                      <p className="font-semibold text-sm" style={t1}>{fmtBaht(c.amount || 0)}</p>
                      <p className="text-xs" style={{ color: STATUS_STYLE[c.status] || 'var(--text-2)' }}>{c.status}</p>
                    </div>
                  </div>
                </div>
              ))}
              {items.length === 0 && <EmptyState message="ยังไม่มีข้อมูล commission" />}
            </div>
          </>
        )}
      </div>
    </Sheet>
  )
}

// ─── Documents Sheet ──────────────────────────────────────
type DocTarget = { kind: 'job'; id: string; name: string; room: string; projectName: string } | { kind: 'customer'; id: string; name: string; room: string; projectName: string }

function DocumentsSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const supabase = createClient()
  const [search, setSearch] = useState('')
  const [results, setResults] = useState<DocTarget[]>([])
  const [selected, setSelected] = useState<DocTarget | null>(null)
  const [loading, setLoading] = useState(false)
  const timerRef = useRef<ReturnType<typeof setTimeout>>(undefined)

  async function doSearch(q: string) {
    if (!q.trim()) { setResults([]); return }
    setLoading(true)
    const or = buildRoomOr(q, `customer_name.ilike.%${q}%,room_no.ilike.%${q}%`)
    const [{ data: jobsData }, { data: custsData }] = await Promise.all([
      supabase.from('jobs')
        .select('id, customer_name, room_no, projects:project_id(name)')
        .or(or.replace(/room_no/g, 'room_no'))
        .not('working_status', 'eq', 'ยกเลิก')
        .order('customer_name').limit(8),
      supabase.from('customers')
        .select('id, customer_name, interested_room, projects:project_id(name)')
        .or(`customer_name.ilike.%${q}%,interested_room.ilike.%${q}%`)
        .not('status', 'eq', 'closed')
        .order('customer_name').limit(8),
    ])
    const jobs: DocTarget[] = (jobsData || []).map((j: any) => ({
      kind: 'job', id: j.id, name: j.customer_name || '—', room: j.room_no || '—',
      projectName: (j.projects as any)?.name || '—',
    }))
    const custs: DocTarget[] = (custsData || []).map((c: any) => ({
      kind: 'customer', id: c.id, name: c.customer_name || '—', room: c.interested_room || '—',
      projectName: (c.projects as any)?.name || '—',
    }))
    // Deduplicate by name+room across both lists
    const seen = new Set<string>()
    const merged: DocTarget[] = []
    for (const item of [...jobs, ...custs]) {
      const key = `${item.name}|${item.room}`
      if (!seen.has(key)) { seen.add(key); merged.push(item) }
    }
    setResults(merged)
    setLoading(false)
  }

  function handleSearch(v: string) {
    setSearch(v)
    clearTimeout(timerRef.current)
    timerRef.current = setTimeout(() => doSearch(v), 300)
  }

  function resetAndClose() { setSelected(null); setSearch(''); setResults([]); onClose() }

  return (
    <Sheet open={open} onClose={resetAndClose} title="ไฟล์แนบลูกค้า" icon={Paperclip}>
      {!selected ? (
        <div className="p-4">
          <div className="relative mb-4">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2" style={t3} />
            <input autoFocus value={search} onChange={e => handleSearch(e.target.value)}
              placeholder="ค้นหาชื่อลูกค้า / เลขห้อง..."
              className={sheetInput} style={sheetInputStyle} />
          </div>
          {loading && <p className="text-center py-4 text-sm" style={t2}>กำลังค้นหา...</p>}
          <div className="space-y-2">
            {results.map(r => (
              <button key={`${r.kind}-${r.id}`} onClick={() => setSelected(r)}
                className="w-full flex items-center justify-between px-4 py-3.5 rounded-xl text-left" style={sheetCard}>
                <div>
                  <p className="font-semibold text-sm" style={t1}>{r.name}</p>
                  <p className="text-xs mt-0.5" style={t2}>{r.room} · {r.projectName}</p>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-micro px-2 py-0.5 rounded-full font-semibold"
                    style={{ background: r.kind === 'job' ? 'color-mix(in srgb, var(--accent) 15%, transparent)' : 'color-mix(in srgb, var(--accent-orange) 15%, transparent)', color: r.kind === 'job' ? 'var(--accent)' : 'var(--accent-orange)' }}>
                    {r.kind === 'job' ? 'งาน' : 'Prospect'}
                  </span>
                  <ChevronRight size={16} style={t3} />
                </div>
              </button>
            ))}
            {!loading && search && results.length === 0 && <EmptyState message="ไม่พบข้อมูล" />}
            {!search && <p className="text-center py-8 text-sm" style={t3}>พิมพ์ชื่อหรือเลขห้องเพื่อค้นหา</p>}
          </div>
        </div>
      ) : (
        <div className="p-4">
          <button onClick={() => setSelected(null)} className="text-sm mb-4 flex items-center gap-1" style={{ color: 'var(--accent-blue)' }}>
            <ArrowLeft size={14} /> {selected.name} · {selected.room}
          </button>
          <div className="rounded-[11px] p-4 mb-4" style={sheetCard}>
            <p className="font-semibold text-sm mb-0.5" style={t1}>{selected.name}</p>
            <p className="text-xs" style={t2}>{selected.room} · {selected.projectName}</p>
          </div>
          <FileAttach
            {...(selected.kind === 'job' ? { jobId: selected.id } : { customerId: selected.id })}
            projectName={selected.projectName}
            roomNo={selected.room}
          />
        </div>
      )}
    </Sheet>
  )
}

// ─── Main Quick Page ───────────────────────────────────────
export default function QuickPage() {
  const router = useRouter()
  const supabase = createClient()
  const [widgets, setWidgets] = useState<WidgetData>({ inProgressJobs: 0, overdueJobs: 0, pendingInstallments: 0, pendingAmount: 0, readyToDeliver: 0 })
  const [allJobs, setAllJobs] = useState<JobOption[]>([])
  const [activeEvents, setActiveEvents] = useState<EventOption[]>([])
  const [loading, setLoading] = useState(true)
  const [greeting, setGreeting] = useState('')
  const [todayTH, setTodayTH] = useState('')
  const [openSheet, setOpenSheet] = useState<string | null>(null)

  useEffect(() => {
    const now = new Date()
    const h = now.getHours()
    setGreeting(h < 12 ? 'อรุณสวัสดิ์' : h < 17 ? 'สวัสดีตอนบ่าย' : 'สวัสดีตอนเย็น')
    setTodayTH(now.toLocaleDateString('th-TH', { weekday: 'long', day: 'numeric', month: 'long' }))
  }, [])

  const load = useCallback(async () => {
    setLoading(true)
    const [{ data: jobsData }, { data: paymentsData }, { data: handoverData }, { data: eventsData }] = await Promise.all([
      supabase.from('jobs').select('id, customer_name, room_no, work_start_date, work_days, working_status, revenue_ex_vat, expected_finish_date, projects:project_id(name), sales:sales_id(name)').not('working_status', 'eq', 'ยกเลิก'),
      supabase.from('payments').select('job_id, amount, status').eq('status', 'pending').not('job_id', 'is', null),
      supabase.from('handovers').select('job_id, work_status'),
      supabase.from('events').select('id, event_name, project_id, project_name, event_date').order('event_date', { ascending: false }).limit(10),
    ])

    const todayMs = Date.now()
    const hovMap = new Map<string, string>((handoverData || []).map((h: any) => [h.job_id, h.work_status]))
    let inProgress = 0, overdueJobs = 0, readyToDeliver = 0
    const jobs: JobOption[] = []

    for (const j of (jobsData || []) as any[]) {
      if (j.working_status === 'ส่งมอบแล้ว') continue
      inProgress++
      jobs.push({
        id: j.id, customerName: j.customer_name || '—', roomNo: j.room_no || '—',
        projectName: (j.projects as any)?.name || '—', salesName: (j.sales as any)?.name || '—',
        revenue: j.revenue_ex_vat || 0, workingStatus: j.working_status || '—',
        workStartDate: j.work_start_date, workDays: j.work_days,
        expectedFinishDate: j.expected_finish_date || null,
      })
      if (j.work_start_date && j.work_days) {
        const end = new Date(j.work_start_date); end.setDate(end.getDate() + j.work_days)
        if (end.getTime() < todayMs) overdueJobs++
      }
      if (hovMap.get(j.id) === 'ready_to_deliver') readyToDeliver++
    }

    const pendingInstallments = (paymentsData || []).length
    const pendingAmount = (paymentsData || []).reduce((s: number, p: any) => s + (p.amount || 0), 0)
    setWidgets({ inProgressJobs: inProgress, overdueJobs, pendingInstallments, pendingAmount, readyToDeliver })
    setAllJobs(jobs)
    setActiveEvents((eventsData || []).map((e: any) => ({ id: e.id, eventName: e.event_name, projectId: e.project_id, projectName: e.project_name, eventDate: e.event_date })))
    setLoading(false)
  }, [supabase])

  useEffect(() => { load() }, [load])

  // ─── Button layout: flat 3×4 grid = 12 buttons ──────
  type Btn = { key: string; icon: LucideIcon; label: string; iconColor: string; btnStyle: React.CSSProperties; badge?: number; sheet?: string; href?: string }

  const BUTTONS: Btn[] = [
    { key: 'clients',    icon: Briefcase,      label: 'Wyde\nClients',   iconColor: 'var(--accent-blue)',   btnStyle: { background: 'var(--card-bg)', borderColor: 'var(--divider)' }, sheet: 'clients' },
    { key: 'prospects',  icon: Users,           label: 'Prospects',       iconColor: 'var(--accent)',        btnStyle: { background: 'var(--card-bg)', borderColor: 'var(--divider)' }, sheet: 'prospects' },
    { key: 'event',      icon: CalendarDays,    label: 'ลูกค้า\nEvent',  iconColor: 'var(--accent-green)',  btnStyle: { background: 'var(--card-bg)', borderColor: 'var(--divider)' }, sheet: 'event' },
    { key: 'lookup',     icon: Database,        label: 'ค้นหา\nลูกค้า', iconColor: 'var(--accent-blue)',   btnStyle: { background: 'var(--card-bg)', borderColor: 'var(--divider)' }, sheet: 'lookup' },
    { key: 'pay',        icon: Receipt,         label: 'บันทึก\nรับเงิน',iconColor: 'var(--accent-orange)',btnStyle: { background: 'var(--card-bg)', borderColor: 'var(--divider)' }, badge: widgets.pendingInstallments, sheet: 'pay' },
    { key: 'docs',       icon: FileText,        label: 'เอกสาร\nลูกค้า', iconColor: 'var(--accent-purple)', btnStyle: { background: 'var(--card-bg)', borderColor: 'var(--divider)' }, sheet: 'docs' },
    { key: 'deliver',    icon: ArrowRightLeft,  label: 'บันทึก\nส่งมอบ', iconColor: 'var(--accent-green)',  btnStyle: { background: 'var(--card-bg)', borderColor: 'var(--divider)' }, badge: widgets.readyToDeliver, sheet: 'deliver' },
    { key: 'handover',   icon: ClipboardList,   label: 'สถานะ\nงาน',     iconColor: 'var(--accent-blue)',   btnStyle: { background: 'var(--card-bg)', borderColor: 'var(--divider)' }, sheet: 'handover' },
    { key: 'overdue',    icon: AlertTriangle,   label: 'งานเกิน\nกำหนด', iconColor: 'var(--accent-red)',    btnStyle: { background: 'var(--card-bg)', borderColor: 'var(--divider)' }, badge: widgets.overdueJobs, sheet: 'overdue' },
    { key: 'mydeals',    icon: Briefcase,       label: 'My\nDeals',       iconColor: 'var(--accent)',        btnStyle: { background: 'var(--card-bg)', borderColor: 'var(--divider)' }, href: '/dashboard/my-deals' },
    { key: 'commission', icon: DollarSign,      label: 'Commission',      iconColor: 'var(--accent-orange)', btnStyle: { background: 'var(--card-bg)', borderColor: 'var(--divider)' }, sheet: 'commission' },
    { key: 'home',       icon: Home,            label: 'หน้าหลัก',       iconColor: 'var(--text-3)',        btnStyle: { background: 'var(--card-bg)', borderColor: 'var(--divider)' }, href: '/dashboard' },
  ]

  function handleAction(btn: Btn) {
    if (btn.sheet) setOpenSheet(btn.sheet)
    else if (btn.href) router.push(btn.href)
  }

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto" style={{ background: 'var(--bg-gradient)', backgroundAttachment: 'fixed', paddingBottom: 'env(safe-area-inset-bottom)' }}>
      {/* Sticky topbar — logo + home only */}
      <div data-topbar-quick className="px-5 sticky top-0 z-10" style={{ paddingTop: 'max(14px, env(safe-area-inset-top))', paddingBottom: 14, background: 'var(--sidebar-bg)', borderBottom: '1px solid var(--sidebar-border)', backdropFilter: 'blur(20px) saturate(180%)', WebkitBackdropFilter: 'blur(20px) saturate(180%)' }}>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <img src="/logo.svg" alt="WydE" style={{ height: 28, width: 'auto', objectFit: 'contain' }} />
            <div>
              <p className="text-white text-xs font-semibold leading-tight">Super Sales</p>
              <p className="text-accent text-micro font-bold tracking-widest uppercase leading-tight">Quick Mode</p>
            </div>
          </div>
          <button onClick={() => router.push('/dashboard')} aria-label="กลับหน้าหลัก"
            style={{ minWidth: 44, minHeight: 44, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-3)' }}>
            <Home size={20} />
          </button>
        </div>
      </div>

      {/* Greeting — on gradient background */}
      <div className="px-5 pt-5 pb-4">
        <h1 className="text-page-title" style={{ color: 'var(--text-1)' }}>{greeting} 👋</h1>
        <p className="text-sm mt-0.5" style={{ color: 'var(--text-3)' }}>{todayTH}</p>
      </div>

      {/* ── Overview ── */}
      <div className="px-5 mb-6">
        <p className="text-micro font-bold uppercase tracking-widest mb-3" style={{ color: 'var(--text-3)' }}>Overview</p>
        {loading ? (
          <div className="grid grid-cols-2 gap-3">
            {[1, 2, 3, 4].map(i => <div key={i} className="h-20 rounded-[18px] animate-pulse" style={{ background: 'var(--card-bg)', border: '1px solid var(--card-border)' }} />)}
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-3">
            {[
              { label: 'งานกำลังทำ', value: widgets.inProgressJobs, sub: `${widgets.overdueJobs > 0 ? widgets.overdueJobs + ' เกินกำหนด' : 'ปกติทุกงาน'}`, varColor: 'var(--accent-orange)' },
              { label: 'งวดรอชำระ', value: widgets.pendingInstallments, sub: fmtBaht(widgets.pendingAmount), varColor: 'var(--accent-blue)' },
              { label: 'รอส่งมอบ', value: widgets.readyToDeliver, sub: 'งานเสร็จแล้ว', varColor: 'var(--accent-green)' },
              { label: 'เกินกำหนด', value: widgets.overdueJobs, sub: 'กดปุ่มดูรายละเอียด', varColor: widgets.overdueJobs > 0 ? 'var(--accent-red)' : 'var(--text-3)' },
            ].map(w => (
              <div key={w.label} className="rounded-[18px] p-4 border"
                style={{ background: 'var(--card-bg)', borderColor: 'var(--card-border)' }}>
                <p className="text-xs mb-1" style={{ color: 'var(--text-3)' }}>{w.label}</p>
                <p className="text-kpi-number" style={{ color: w.varColor }}>{w.value}</p>
                <p className="text-xs mt-1 opacity-60" style={{ color: w.varColor }}>{w.sub}</p>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ── Divider ── */}
      <div className="mx-5 mb-6" style={{ height: 1, background: 'linear-gradient(to right, transparent, var(--divider) 20%, var(--divider) 80%, transparent)' }} />

      {/* ── Quick Menu — flat 3×4 grid ── */}
      <div className="px-5 pb-8">
        <div className="flex items-center gap-3 mb-4">
          <p className="text-micro font-bold uppercase tracking-widest flex-shrink-0" style={{ color: 'var(--text-3)' }}>Quick Menu</p>
          <div style={{ flex: 1, height: 1, background: 'var(--divider)' }} />
        </div>
        <div className="grid grid-cols-4 gap-2.5">
          {BUTTONS.map(btn => (
            <button
              key={btn.key}
              onClick={() => handleAction(btn)}
              className="relative flex flex-col items-center gap-1.5 p-3 rounded-[18px] border transition-all active:scale-95"
              style={{ minHeight: 80, ...btn.btnStyle }}
            >
              {btn.badge !== undefined && btn.badge > 0 && (
                <div className="absolute -top-1.5 -right-1.5 min-w-[20px] h-5 px-1 rounded-full flex items-center justify-center text-micro font-black z-10" style={{ background: 'var(--accent-red)', color: '#ffffff', boxShadow: '0 0 0 2px var(--card-bg)' }}>
                  {btn.badge > 9 ? '9+' : btn.badge}
                </div>
              )}
              <btn.icon size={24} color={btn.iconColor} strokeWidth={1.75} />
              <span className="text-label font-bold text-center leading-tight" style={{ whiteSpace: 'pre-line', color: 'var(--text-1)' }}>{btn.label}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Sheets */}
      <OriginPoolSheet open={openSheet === 'lookup'} onClose={() => setOpenSheet(null)} />
      <WydeClientsSheet open={openSheet === 'clients'} onClose={() => setOpenSheet(null)} />
      <ProspectsSheet open={openSheet === 'prospects'} onClose={() => setOpenSheet(null)} />
      <EventAddSheet open={openSheet === 'event'} onClose={() => setOpenSheet(null)} events={activeEvents} />
      <QuickPaySheet open={openSheet === 'pay'} onClose={() => { setOpenSheet(null); load() }} jobs={allJobs} />
      <PlanSetupSheet open={openSheet === 'plan'} onClose={() => { setOpenSheet(null); load() }} jobs={allJobs} />
      <DeliverSheet open={openSheet === 'deliver'} onClose={() => { setOpenSheet(null); load() }} jobs={allJobs} />
      <QuickHandoverSheet open={openSheet === 'handover'} onClose={() => { setOpenSheet(null); load() }} jobs={allJobs} />
      <OverdueSheet open={openSheet === 'overdue'} onClose={() => setOpenSheet(null)} />
      <CommissionSheet open={openSheet === 'commission'} onClose={() => setOpenSheet(null)} />
      <DocumentsSheet open={openSheet === 'docs'} onClose={() => setOpenSheet(null)} />
    </div>
  )
}

