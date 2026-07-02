'use client'

import { useEffect, useState, useCallback, useRef } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import {
  Search, X, Plus, CheckCircle2, ChevronRight, AlertTriangle,
  Calendar, AlertCircle, ArrowLeft, Home,
  Briefcase, Users, CalendarDays, Database,
  Receipt, FileText, ArrowRightLeft, ClipboardList,
  DollarSign, LayoutDashboard, type LucideIcon
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
}

interface EventOption { id: string; eventName: string; projectId: string; projectName: string; eventDate: string }

// ─── Helpers ──────────────────────────────────────────────
const fmtBaht = (n: number) => {
  if (n >= 1000000) return '฿' + (n / 1000000).toFixed(1) + 'M'
  if (n >= 1000) return '฿' + Math.round(n / 1000) + 'k'
  return '฿' + n.toLocaleString()
}
const fmtDate = (d: string | null) =>
  d ? new Date(d).toLocaleDateString('th-TH', { day: '2-digit', month: 'short' }) : '—'

// ─── Bottom Sheet wrapper ──────────────────────────────────
function Sheet({ open, onClose, title, children }: {
  open: boolean; onClose: () => void; title: string; children: React.ReactNode
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
      <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.65)', backdropFilter: 'blur(4px)', WebkitBackdropFilter: 'blur(4px)' }} />

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
          background: 'var(--sidebar-bg)',
          border: '1px solid var(--glass-border)',
          borderRadius: 20,
          backdropFilter: 'blur(24px)',
          WebkitBackdropFilter: 'blur(24px)',
          overflow: 'hidden',
        }}
      >
        {/* title bar */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '16px 20px', borderBottom: '1px solid var(--divider)', flexShrink: 0 }}>
          <h3 style={{ fontWeight: 600, fontSize: 16, color: 'var(--text-1)', margin: 0 }}>{title}</h3>
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
const sheetInput = "w-full rounded-xl pl-9 pr-4 py-3 text-base focus:outline-none"
const sheetInputStyle: React.CSSProperties = {
  background: 'var(--input-bg)', border: '1px solid var(--divider)',
  color: 'var(--text-1)', fontSize: 16,
}
const sheetCard: React.CSSProperties = { background: 'var(--hover-bg)', border: '1px solid var(--divider)', borderRadius: 16, padding: '12px 16px' }
const sheetCardDark: React.CSSProperties = { background: 'var(--card-bg)', border: '1px solid var(--card-border)', borderRadius: 12, padding: '8px 12px' }
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
      .or(`customer_name.ilike.%${q}%,phone.ilike.%${q}%,room_no.ilike.%${q}%`)
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
    <Sheet open={open} onClose={() => { setSearch(''); setResults([]); onClose() }} title="🔍 ค้นหาลูกค้า (Origin Pool)">
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
              {r.phone && <p className="text-xs mt-1" style={{ color: 'var(--accent-blue)' }}>📞 {r.phone}</p>}
            </div>
          ))}
          {!loading && search && results.length === 0 && <p className="text-center py-6 text-sm" style={t2}>ไม่พบข้อมูล</p>}
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
      .or(`customer_name.ilike.%${q}%,room_no.ilike.%${q}%`)
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
    <Sheet open={open} onClose={() => { setSearch(''); setResults([]); onClose() }} title="👔 Wyde Clients">
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
                    <p className="text-[9px] mb-0.5" style={t3}>สถานะ</p>
                    <p className="text-xs font-medium truncate" style={{ color: '#d97706' }}>{j.working_status || '—'}</p>
                  </div>
                  <div className="rounded-xl p-2 text-center" style={sheetCardDark}>
                    <p className="text-[9px] mb-0.5" style={t3}>เริ่มงาน</p>
                    <p className="text-xs" style={t1}>{fmtDate(j.work_start_date)}</p>
                  </div>
                  <div className="rounded-xl p-2 text-center" style={over > 0 ? { ...sheetCardDark, background: 'rgba(239,68,68,0.1)', borderColor: 'rgba(239,68,68,0.3)' } : sheetCardDark}>
                    <p className="text-[9px] mb-0.5" style={t3}>ครบสัญญา</p>
                    <p className={`text-xs font-medium`} style={{ color: over > 0 ? '#dc2626' : 'var(--text-1)' }}>
                      {over > 0 ? `เกิน ${over}ว` : fmtDate(end)}
                    </p>
                  </div>
                </div>
                <p className="text-[10px] mt-2" style={t3}>Sales: {(j.sales as any)?.name || '—'}</p>
              </div>
            )
          })}
          {!loading && search && results.length === 0 && <p className="text-center py-6 text-sm" style={t2}>ไม่พบข้อมูล</p>}
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

  const STATUS_LABEL: Record<string, { label: string; color: string }> = {
    new: { label: 'ใหม่', color: 'text-blue-400' },
    following: { label: 'ติดตาม', color: 'text-yellow-400' },
    interested: { label: 'สนใจ', color: 'text-emerald-400' },
    not_interested: { label: 'ไม่สนใจ', color: 'text-red-400' },
    booked: { label: 'จอง', color: 'text-purple-400' },
  }

  const STATUS_COLOR: Record<string, string> = {
    new: '#2563eb', following: '#d97706', interested: '#16a34a',
    not_interested: '#dc2626', booked: '#7c3aed',
  }

  return (
    <Sheet open={open} onClose={() => { setSearch(''); setResults([]); onClose() }} title="👥 Prospects">
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
            const s = STATUS_LABEL[c.status] || { label: c.status || '—', color: '' }
            const sColor = STATUS_COLOR[c.status] || 'var(--text-2)'
            return (
              <div key={c.id} style={sheetCard}>
                <div className="flex justify-between items-start mb-1">
                  <p className="font-semibold" style={t1}>{c.customer_name}</p>
                  <span className="text-xs font-medium" style={{ color: sColor }}>{s.label}</span>
                </div>
                <p className="text-xs" style={t2}>{projectsMap[c.project_id] || '—'} · ห้อง {c.interested_room || '—'}</p>
                {c.phone && <p className="text-xs mt-1" style={{ color: 'var(--accent-blue)' }}>📞 {c.phone}</p>}
                {c.notes && <p className="text-xs mt-1 truncate" style={t3}>{c.notes}</p>}
              </div>
            )
          })}
          {!loading && search && results.length === 0 && <p className="text-center py-6 text-sm" style={t2}>ไม่พบข้อมูล</p>}
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
      .or(`customer_name.ilike.%${q}%,phone.ilike.%${q}%,room_no.ilike.%${q}%`)
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
    { value: 'interested',    label: 'สนใจ ติดตามต่อ', activeColor: '#16a34a', activeBg: '#dcfce7' },
    { value: 'booked',        label: 'Booked',           activeColor: '#1d4ed8', activeBg: '#dbeafe' },
    { value: 'not_interested',label: 'ไม่สนใจ',         activeColor: '#b91c1c', activeBg: '#fee2e2' },
    { value: 'not_met',       label: 'ไม่ได้พบ',        activeColor: '#92400e', activeBg: '#fef3c7' },
  ]

  return (
    <Sheet open={open} onClose={resetAndClose} title="📅 เพิ่มลูกค้า Event">
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
                    <p className="font-medium text-sm" style={t1}>{ev.eventName}</p>
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
                  <p className="text-sm font-medium" style={t1}>{l.customer_name}</p>
                  <p className="text-xs" style={t2}>{projectsMap[l.project_id] || '—'} · {l.tower ? `${l.tower}-` : ''}ห้อง {l.room_no || '—'} · {l.phone || '—'}</p>
                </div>
                <ChevronRight size={16} style={t3} />
              </button>
            ))}
            {!loading && search && leads.length === 0 && (
              <p className="text-center py-6 text-sm" style={t2}>ไม่พบข้อมูลใน Origin Pool</p>
            )}
          </div>
        </div>
      )}

      {step === 'form' && selectedLead && selectedEvent && (
        <div className="p-4 space-y-4">
          <button onClick={() => setStep('search')} className="text-sm flex items-center gap-1" style={{ color: 'var(--accent-blue)' }}>
            <ArrowLeft size={14} /> {selectedLead.customer_name}
          </button>
          <div style={{ ...sheetCard, borderRadius: 16, padding: '16px' }}>
            <p className="font-semibold" style={t1}>{selectedLead.customer_name}</p>
            <p className="text-xs mt-1" style={t2}>{selectedLead.tower ? `${selectedLead.tower}-` : ''}ห้อง {selectedLead.room_no || '—'} · {selectedLead.phone || '—'}</p>
            <p className="text-xs mt-0.5" style={t3}>Event: {selectedEvent.eventName}</p>
          </div>
          <div>
            <label className="text-xs mb-2 block" style={t3}>สถานะ</label>
            <div className="grid grid-cols-2 gap-2">
              {STATUS_OPTIONS.map(s => (
                <button key={s.value} onClick={() => setStatus(s.value)}
                  className="py-3 rounded-xl text-sm font-semibold transition-all border"
                  style={status === s.value
                    ? { background: s.activeBg, color: s.activeColor, borderColor: s.activeColor }
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
              className="w-full rounded-xl px-4 py-3 text-sm resize-none focus:outline-none"
              style={{ ...sheetInputStyle, fontSize: 14 }} />
          </div>
          <button onClick={save} disabled={saving}
            className="w-full py-4 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-40 text-white font-semibold rounded-2xl transition-colors text-base">
            {saving ? 'กำลังบันทึก...' : 'เพิ่มในรายชื่อ Event'}
          </button>
        </div>
      )}
    </Sheet>
  )
}

// ─── Quick Pay Sheet ───────────────────────────────────────
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
  useEffect(() => { setPaidDate(new Date().toISOString().slice(0, 10)) }, [])
  const [fileUrls, setFileUrls] = useState<string[]>([''])
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
    if (!selectedInst) return
    setSaving(true)
    const urls = fileUrls.filter(u => u.trim())
    await supabase.from('payments').update({
      status: 'paid', paid_date: paidDate,
      file_urls: urls.length > 0 ? urls : null,
    }).eq('id', selectedInst.id)

    if (selectedInst.is_work_trigger && selectedJob) {
      await supabase.from('jobs').update({ work_start_date: paidDate }).eq('id', selectedJob.id)
    }
    setSaving(false)
    resetAndClose()
  }

  function resetAndClose() {
    setStep('job'); setSearch(''); setSelectedJob(null)
    setInstallments([]); setSelectedInst(null); setFileUrls(['']); onClose()
  }

  const filteredJobs = jobs.filter(j =>
    !search || j.customerName.toLowerCase().includes(search.toLowerCase()) ||
    j.roomNo.toLowerCase().includes(search.toLowerCase()) ||
    j.projectName.toLowerCase().includes(search.toLowerCase())
  )

  return (
    <Sheet open={open} onClose={resetAndClose} title="💰 บันทึกรับเงิน">
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
                  <p className="font-medium text-sm" style={t1}>{j.customerName}</p>
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
          <AlertCircle size={40} className="mx-auto text-amber-400 mb-4" />
          <h4 className="font-semibold text-lg mb-2" style={t1}>ยังไม่ได้ตั้งแผนชำระ</h4>
          <p className="text-sm mb-2" style={t2}>{selectedJob.customerName}</p>
          <p className="text-sm mb-6" style={t2}>{selectedJob.roomNo} · {selectedJob.projectName}</p>
          <p className="text-xs mb-6" style={t3}>กรุณาตั้งแผนงวดชำระเงินก่อน จึงจะบันทึกรับเงินได้</p>
          <button onClick={() => setStep('job')}
            className="w-full py-3 rounded-xl mb-3 text-sm" style={{ background: 'var(--hover-bg)', color: 'var(--text-2)', border: '1px solid var(--divider)' }}>
            ← เลือกลูกค้าอื่น
          </button>
          <button onClick={resetAndClose}
            className="w-full py-3 bg-amber-500/20 text-amber-400 rounded-xl text-sm font-medium">
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
            <div className="text-center py-8" style={t2}>ชำระครบทุกงวดแล้ว ✅</div>
          ) : (
            <div className="space-y-2">
              <p className="text-xs mb-3" style={t2}>เลือกงวดที่ต้องการบันทึก</p>
              {installments.map((inst: any) => (
                <button key={inst.id} onClick={() => { setSelectedInst(inst); setStep('confirm') }}
                  className="w-full flex items-center justify-between px-4 py-4 rounded-xl transition-colors"
                  style={sheetCard}>
                  <div className="text-left">
                    <p className="font-medium text-sm" style={t1}>{inst.installment_name}</p>
                    {inst.is_work_trigger && <p className="text-xs mt-0.5" style={{ color: '#d97706' }}>⚡ ชำระแล้วเริ่มงาน</p>}
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
              <p className="text-xs mt-2" style={{ color: '#d97706' }}>⚡ ชำระงวดนี้ → เริ่มนับวันงาน</p>
            )}
          </div>
          <div>
            <label className="text-xs mb-2 block" style={t3}>วันที่ชำระ</label>
            <input type="date" value={paidDate} onChange={e => setPaidDate(e.target.value)}
              className="w-full rounded-xl px-4 py-3 text-sm focus:outline-none"
              style={sheetInputStyle} />
          </div>
          <div>
            <div className="flex justify-between mb-2">
              <label className="text-xs" style={t3}>Google Drive URL (สลิป/เอกสาร)</label>
              {fileUrls.length < 5 && (
                <button onClick={() => setFileUrls([...fileUrls, ''])} className="text-xs flex items-center gap-1" style={{ color: 'var(--accent-blue)' }}>
                  <Plus size={11} />เพิ่ม
                </button>
              )}
            </div>
            {fileUrls.map((url, i) => (
              <div key={i} className="flex gap-2 mb-2">
                <input value={url} onChange={e => { const n = [...fileUrls]; n[i] = e.target.value; setFileUrls(n) }}
                  placeholder="https://drive.google.com/..."
                  className="flex-1 rounded-xl px-3 py-2.5 text-xs focus:outline-none"
                  style={sheetInputStyle} />
                {fileUrls.length > 1 && (
                  <button onClick={() => setFileUrls(fileUrls.filter((_, idx) => idx !== i))} className="p-2" style={t3}><X size={13} /></button>
                )}
              </div>
            ))}
          </div>
          <button onClick={confirmPay} disabled={saving}
            className="w-full py-4 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-40 text-white font-semibold rounded-2xl transition-colors text-base">
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
    j.roomNo.toLowerCase().includes(search.toLowerCase())
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
    <Sheet open={open} onClose={resetAndClose} title="📊 ตั้งแผนชำระ">
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
                  <p className="font-medium text-sm" style={t1}>{j.customerName}</p>
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
              className="py-5 bg-blue-500/15 border border-blue-500/30 rounded-2xl font-semibold text-center" style={{ color: 'var(--accent-blue)' }}>
              <div className="text-2xl mb-1">👤</div>
              B2C
              <p className="text-xs font-normal mt-1" style={t3}>บุคคลธรรมดา</p>
            </button>
            <button onClick={() => setStep('b2b')}
              className="py-5 bg-purple-500/15 border border-purple-500/30 rounded-2xl font-semibold text-center" style={{ color: 'var(--accent-purple)' }}>
              <div className="text-2xl mb-1">🏢</div>
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
                    className="w-full py-3 bg-indigo-500/30 border border-indigo-500/40 rounded-xl text-sm font-semibold disabled:opacity-40" style={{ color: 'var(--accent)' }}>
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
                  className={`flex-1 py-3 rounded-xl text-sm font-semibold transition-colors ${b2bCount === n ? 'bg-purple-500/30 border border-purple-500/40' : ''}`}
                  style={b2bCount === n ? { color: 'var(--accent-purple)' } : { background: 'var(--hover-bg)', color: 'var(--text-2)', border: '1px solid var(--divider)' }}>
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
          <div className={`text-center text-sm mb-4 ${totalPct === 100 ? 'text-emerald-400' : 'text-red-400'}`}>
            รวม {totalPct}% {totalPct !== 100 && '— ต้องรวมได้ 100%'}
          </div>
          <button onClick={saveB2BInstallments} disabled={saving || totalPct !== 100}
            className="w-full py-4 bg-purple-600 hover:bg-purple-500 disabled:opacity-40 text-white font-semibold rounded-2xl transition-colors">
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
      j.roomNo.toLowerCase().includes(search.toLowerCase()) ||
      j.projectName.toLowerCase().includes(search.toLowerCase())
    )
  )

  return (
    <Sheet open={open} onClose={resetAndClose} title="🚚 บันทึกส่งมอบ">
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
                  <p className="font-medium text-sm" style={t1}>{j.customerName}</p>
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
            <div className="bg-red-500/10 border border-red-500/20 rounded-2xl p-4 text-center">
              <AlertTriangle size={24} className="mx-auto text-red-400 mb-2" />
              <p className="text-red-400 font-medium text-sm">ยังชำระไม่ครบ</p>
              <p className="text-xs mt-1" style={t2}>ต้องชำระงวดสุดท้ายก่อนจึงจะส่งมอบได้</p>
            </div>
          ) : (
            <>
              <div>
                <label className="text-xs mb-2 block" style={t3}>วันที่ส่งมอบจริง</label>
                <input type="date" value={deliveryDate} onChange={e => setDeliveryDate(e.target.value)}
                  className="w-full rounded-xl px-4 py-3 text-sm focus:outline-none" style={sheetInputStyle} />
              </div>
              <div>
                <label className="text-xs mb-2 block" style={t3}>เอกสารส่งมอบ (Google Drive URL)</label>
                <input value={fileUrl} onChange={e => setFileUrl(e.target.value)}
                  placeholder="https://drive.google.com/..."
                  className="w-full rounded-xl px-4 py-3 text-sm focus:outline-none" style={sheetInputStyle} />
              </div>
              <button onClick={saveDelivery} disabled={saving}
                className="w-full py-4 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-40 text-white font-semibold rounded-2xl transition-colors text-base">
                {saving ? 'กำลังบันทึก...' : '✅ ยืนยันส่งมอบงาน'}
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
    { value: 'in_progress', label: 'กำลังดำเนินการ', color: 'text-amber-400 bg-amber-500/15' },
    { value: 'ready_to_deliver', label: 'รอส่งมอบ', color: 'text-blue-400 bg-blue-500/15' },
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
      !search || j.customerName.toLowerCase().includes(search.toLowerCase()) || j.roomNo.toLowerCase().includes(search.toLowerCase())
    )
  )

  return (
    <Sheet open={open} onClose={() => { setSearch(''); onClose() }} title="🏗️ อัปเดตสถานะงาน">
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
                  <p className="text-sm font-medium" style={t1}>{j.customerName}</p>
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
                    className={`flex-1 py-2.5 rounded-lg text-xs font-medium transition-colors ${jobStatuses[j.id] === s.value ? s.color : ''}`}
                    style={jobStatuses[j.id] !== s.value ? { background: 'var(--card-bg)', color: 'var(--text-2)', border: '1px solid var(--divider)' } : undefined}>
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
    <Sheet open={open} onClose={onClose} title="⚠️ งานเกินกำหนด">
      <div className="p-4">
        {loading ? <p className="text-center py-8 text-sm" style={t2}>กำลังโหลด...</p>
          : items.length === 0 ? (
            <div className="text-center py-8">
              <CheckCircle2 size={32} className="mx-auto text-green-500/50 mb-3" />
              <p style={t2}>ไม่มีงานเกินกำหนด 🎉</p>
            </div>
          ) : items.map((j: any) => (
            <div key={j.id} className="bg-red-500/8 border border-red-500/20 rounded-xl p-3 mb-2">
              <div className="flex justify-between items-start">
                <div>
                  <p className="font-medium text-sm" style={t1}>{j.customer_name}</p>
                  <p className="text-xs" style={t2}>{j.room_no} · {(j.projects as any)?.name}</p>
                </div>
                <span className="text-red-400 font-bold text-sm">เกิน {j.daysOverdue} วัน</span>
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
    pending: 'text-amber-400', approved: 'text-emerald-400', paid: 'text-blue-400', rejected: 'text-red-400'
  }

  return (
    <Sheet open={open} onClose={onClose} title="💎 Commission ของฉัน">
      <div className="p-4">
        {loading ? <p className="text-center py-8 text-sm" style={t2}>กำลังโหลด...</p> : (
          <>
            <div className="grid grid-cols-3 gap-2 mb-5">
              <div className="rounded-2xl p-3 text-center" style={sheetCard}>
                <p className="text-[9px] mb-1" style={t3}>รวมทั้งหมด</p>
                <p className="font-bold text-sm" style={t1}>{fmtBaht(summary.total)}</p>
              </div>
              <div className="bg-amber-500/10 rounded-2xl p-3 text-center">
                <p className="text-[9px] mb-1" style={t3}>รอยืนยัน</p>
                <p className="text-amber-400 font-bold text-sm">{fmtBaht(summary.pending)}</p>
              </div>
              <div className="bg-emerald-500/10 rounded-2xl p-3 text-center">
                <p className="text-[9px] mb-1" style={t3}>อนุมัติแล้ว</p>
                <p className="font-bold text-sm" style={{ color: 'var(--accent-green)' }}>{fmtBaht(summary.approved)}</p>
              </div>
            </div>
            <div className="space-y-2">
              {items.map((c: any) => (
                <div key={c.id} className="rounded-xl p-3" style={sheetCard}>
                  <div className="flex justify-between items-start">
                    <div>
                      <p className="text-sm font-medium" style={t1}>{(c.jobs as any)?.customer_name || '—'}</p>
                      <p className="text-xs" style={t2}>{(c.jobs as any)?.room_no} · {((c.jobs as any)?.projects as any)?.name}</p>
                    </div>
                    <div className="text-right">
                      <p className="font-semibold text-sm" style={t1}>{fmtBaht(c.amount || 0)}</p>
                      <p className={`text-xs ${STATUS_STYLE[c.status] || ''}`} style={!STATUS_STYLE[c.status] ? t2 : undefined}>{c.status}</p>
                    </div>
                  </div>
                </div>
              ))}
              {items.length === 0 && <p className="text-center py-6 text-sm" style={t3}>ยังไม่มีข้อมูล commission</p>}
            </div>
          </>
        )}
      </div>
    </Sheet>
  )
}

// ─── Documents Sheet ──────────────────────────────────────
function DocumentsSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const supabase = createClient()
  const [search, setSearch] = useState('')
  const [jobs, setJobs] = useState<any[]>([])
  const [selectedJob, setSelectedJob] = useState<any | null>(null)
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const timerRef = useRef<ReturnType<typeof setTimeout>>(undefined)

  // Doc fields: [key, label, column_in_jobs]
  const DOC_FIELDS = [
    { key: 'quotation1_url', label: 'ใบเสนอราคา 1' },
    { key: 'quotation2_url', label: 'ใบเสนอราคา 2' },
    { key: 'id_card_url',    label: 'บัตรประชาชนลูกค้า' },
    { key: 'sale_slip_url',  label: 'สลิปโอนเงิน' },
    { key: 'sale_receipt_url', label: 'ใบเสร็จรับเงิน' },
    { key: 'delivery_doc_url', label: 'ใบส่งมอบงาน' },
    { key: 'satisfaction_url', label: 'แบบประเมินความพึงพอใจ' },
  ]

  const [urls, setUrls] = useState<Record<string, string>>({})

  async function doSearch(q: string) {
    if (!q.trim()) { setJobs([]); return }
    setLoading(true)
    const { data } = await supabase.from('jobs')
      .select('id, customer_name, room_no, projects:project_id(name), quotation1_url, quotation2_url, id_card_url, sale_slip_url, sale_receipt_url, delivery_doc_url, satisfaction_url')
      .or(`customer_name.ilike.%${q}%,room_no.ilike.%${q}%`)
      .not('working_status', 'eq', 'ยกเลิก')
      .order('customer_name').limit(10)
    setJobs(data || [])
    setLoading(false)
  }

  function handleSearch(v: string) {
    setSearch(v)
    clearTimeout(timerRef.current)
    timerRef.current = setTimeout(() => doSearch(v), 300)
  }

  function selectJob(job: any) {
    setSelectedJob(job)
    const u: Record<string, string> = {}
    DOC_FIELDS.forEach(f => { u[f.key] = job[f.key] || '' })
    setUrls(u)
  }

  async function saveUrls() {
    if (!selectedJob) return
    setSaving(true)
    const update: Record<string, string | null> = {}
    DOC_FIELDS.forEach(f => { update[f.key] = urls[f.key]?.trim() || null })
    await supabase.from('jobs').update(update).eq('id', selectedJob.id)
    setSaving(false)
    setSelectedJob(null)
    setSearch('')
    setJobs([])
    onClose()
    alert('บันทึกเอกสารเรียบร้อย ✅')
  }

  function resetAndClose() {
    setSelectedJob(null); setSearch(''); setJobs([]); setUrls({}); onClose()
  }

  return (
    <Sheet open={open} onClose={resetAndClose} title="📋 เอกสารลูกค้า">
      {!selectedJob ? (
        <div className="p-4">
          <div className="relative mb-4">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2" style={t3} />
            <input autoFocus value={search} onChange={e => handleSearch(e.target.value)}
              placeholder="ค้นหาชื่อลูกค้า / เลขห้อง..."
              className={sheetInput} style={sheetInputStyle} />
          </div>
          {loading && <p className="text-center py-4 text-sm" style={t2}>กำลังค้นหา...</p>}
          <div className="space-y-2">
            {jobs.map((j: any) => {
              const filled = DOC_FIELDS.filter(f => j[f.key]).length
              return (
                <button key={j.id} onClick={() => selectJob(j)}
                  className="w-full flex items-center justify-between px-4 py-3.5 rounded-xl text-left" style={sheetCard}>
                  <div>
                    <p className="font-medium text-sm" style={t1}>{j.customer_name}</p>
                    <p className="text-xs mt-0.5" style={t2}>{j.room_no} · {(j.projects as any)?.name}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className={`text-xs font-medium ${filled === DOC_FIELDS.length ? 'text-emerald-400' : 'text-amber-400'}`}>
                      {filled}/{DOC_FIELDS.length}
                    </span>
                    <ChevronRight size={16} style={t3} />
                  </div>
                </button>
              )
            })}
            {!loading && search && jobs.length === 0 && <p className="text-center py-6 text-sm" style={t2}>ไม่พบข้อมูล</p>}
            {!search && <p className="text-center py-8 text-sm" style={t3}>พิมพ์ชื่อลูกค้าเพื่อค้นหา</p>}
          </div>
        </div>
      ) : (
        <div className="p-4">
          <button onClick={() => setSelectedJob(null)} className="text-sm mb-4 flex items-center gap-1" style={{ color: 'var(--accent-blue)' }}>
            <ArrowLeft size={14} /> {selectedJob.customer_name} · {selectedJob.room_no}
          </button>
          <p className="text-xs mb-4" style={t2}>แนบ Google Drive URL สำหรับแต่ละเอกสาร</p>
          <div className="space-y-3 mb-6">
            {DOC_FIELDS.map(f => (
              <div key={f.key}>
                <div className="flex items-center gap-2 mb-1">
                  <span className={`w-2 h-2 rounded-full flex-shrink-0 ${urls[f.key] ? 'bg-emerald-400' : ''}`}
                    style={!urls[f.key] ? { background: 'var(--divider)' } : undefined} />
                  <label className="text-xs" style={t2}>{f.label}</label>
                </div>
                <input
                  value={urls[f.key] || ''}
                  onChange={e => setUrls(prev => ({ ...prev, [f.key]: e.target.value }))}
                  placeholder="https://drive.google.com/..."
                  className="w-full rounded-xl px-3 py-2.5 text-sm focus:outline-none"
                  style={{ ...sheetInputStyle, fontSize: 14 }}
                />
              </div>
            ))}
          </div>
          <button onClick={saveUrls} disabled={saving}
            className="w-full py-4 bg-purple-600 hover:bg-purple-500 disabled:opacity-40 text-white font-semibold rounded-2xl transition-colors">
            {saving ? 'กำลังบันทึก...' : '💾 บันทึกเอกสาร'}
          </button>
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
      supabase.from('jobs').select('id, customer_name, room_no, work_start_date, work_days, working_status, revenue_ex_vat, projects:project_id(name), sales:sales_id(name)').not('working_status', 'eq', 'ยกเลิก'),
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

  // ─── Button layout: 3 rows × 4 cols = 12 buttons ──────
  type Btn = { key: string; icon: LucideIcon; label: string; iconColor: string; bg: string; badge?: number; sheet?: string; href?: string }
  type Row = { header: string; color: string; buttons: Btn[] }

  const ROWS: Row[] = [
    {
      header: 'ลูกค้า', color: 'text-blue-400',
      buttons: [
        { key: 'clients',   icon: Briefcase,    label: 'Wyde\nClients',   iconColor: '#2563eb', bg: 'bg-blue-500/10 border-blue-500/25',       sheet: 'clients' },
        { key: 'prospects', icon: Users,         label: 'Prospects',        iconColor: '#4f46e5', bg: 'bg-indigo-500/10 border-indigo-500/25',   sheet: 'prospects' },
        { key: 'event',     icon: CalendarDays,  label: 'ลูกค้า\nEvent',   iconColor: '#059669', bg: 'bg-emerald-500/10 border-emerald-500/25',  sheet: 'event' },
        { key: 'lookup',    icon: Database,      label: 'ค้นหา\nลูกค้า',  iconColor: '#0891b2', bg: 'bg-cyan-500/10 border-cyan-500/25',        sheet: 'lookup' },
      ]
    },
    {
      header: 'การเงิน & งาน', color: 'text-amber-400',
      buttons: [
        { key: 'pay',      icon: Receipt,         label: 'บันทึก\nรับเงิน', iconColor: '#d97706', bg: 'bg-amber-500/10 border-amber-500/25',   badge: widgets.pendingInstallments, sheet: 'pay' },
        { key: 'docs',     icon: FileText,         label: 'เอกสาร\nลูกค้า', iconColor: '#7c3aed', bg: 'bg-purple-500/10 border-purple-500/25', sheet: 'docs' },
        { key: 'deliver',  icon: ArrowRightLeft,   label: 'บันทึก\nส่งมอบ', iconColor: '#16a34a', bg: 'bg-green-500/10 border-green-500/25',   badge: widgets.readyToDeliver, sheet: 'deliver' },
        { key: 'handover', icon: ClipboardList,    label: 'สถานะ\nงาน',     iconColor: '#0284c7', bg: 'bg-sky-500/10 border-sky-500/25',       sheet: 'handover' },
      ]
    },
    {
      header: 'ส่วนตัว', color: 'text-rose-400',
      buttons: [
        { key: 'overdue',    icon: AlertTriangle,   label: 'งานเกิน\nกำหนด', iconColor: '#dc2626', bg: widgets.overdueJobs > 0 ? 'bg-red-500/15 border-red-500/30' : '', badge: widgets.overdueJobs, sheet: 'overdue' },
        { key: 'report',     icon: ClipboardList,   label: 'Daily\nReport',   iconColor: '#6366f1', bg: 'bg-indigo-500/10 border-indigo-500/25', href: '/dashboard/daily-report' },
        { key: 'commission', icon: DollarSign,      label: 'Commission',      iconColor: '#ca8a04', bg: 'bg-yellow-500/10 border-yellow-500/25', sheet: 'commission' },
        { key: 'home',       icon: LayoutDashboard, label: 'หน้าหลัก',       iconColor: '#64748b', bg: 'bg-slate-500/10 border-slate-500/25',   href: '/dashboard' },
      ]
    }
  ]

  function handleAction(btn: Row['buttons'][0]) {
    if (btn.sheet) setOpenSheet(btn.sheet)
    else if (btn.href) router.push(btn.href)
  }

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto" style={{ background: 'var(--bg-gradient)', backgroundAttachment: 'fixed', paddingBottom: 'env(safe-area-inset-bottom)' }}>
      {/* Header — sticky so it stays visible when scrolling */}
      <div data-topbar-quick className="px-5 pb-3 sticky top-0 z-10" style={{ paddingTop: 'max(20px, env(safe-area-inset-top))', background: 'var(--bg-gradient)', backdropFilter: 'blur(12px)', WebkitBackdropFilter: 'blur(12px)' }}>
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2.5">
            <img src="/logo.svg" alt="WydE" style={{ height: 28, width: 'auto', objectFit: 'contain' }} />
            <div>
              <p className="text-white text-xs font-semibold leading-tight">Super Sales</p>
              <p className="text-indigo-400 text-[10px] font-bold tracking-widest uppercase leading-tight">Quick Mode</p>
            </div>
          </div>
          <button onClick={() => router.push('/dashboard')} aria-label="กลับหน้าหลัก"
            style={{ minWidth: 44, minHeight: 44, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-3)' }}>
            <Home size={20} />
          </button>
        </div>
        <h1 className="text-2xl font-bold" style={{ color: 'var(--text-1)' }}>{greeting} 👋</h1>
        <p className="text-sm mt-0.5" style={{ color: 'var(--text-3)' }}>{todayTH}</p>
      </div>

      {/* Widgets 2×2 */}
      <div className="px-5 mb-5">
        <p className="text-[10px] font-bold uppercase tracking-widest mb-3" style={{ color: 'var(--text-3)' }}>ภาพรวม</p>
        {loading ? (
          <div className="grid grid-cols-2 gap-3">
            {[1, 2, 3, 4].map(i => <div key={i} className="h-20 rounded-2xl animate-pulse" style={{ background: 'var(--card-bg)', border: '1px solid var(--card-border)' }} />)}
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-3">
            {[
              { label: 'งานกำลังทำ', value: widgets.inProgressJobs, sub: `${widgets.overdueJobs > 0 ? widgets.overdueJobs + ' เกินกำหนด' : 'ปกติทุกงาน'}`, color: 'text-amber-400', bg: 'bg-amber-500/8 border-amber-500/20' },
              { label: 'งวดรอชำระ', value: widgets.pendingInstallments, sub: fmtBaht(widgets.pendingAmount), color: 'text-blue-400', bg: 'bg-blue-500/8 border-blue-500/20' },
              { label: 'รอส่งมอบ', value: widgets.readyToDeliver, sub: 'งานเสร็จแล้ว', color: 'text-green-400', bg: 'bg-green-500/8 border-green-500/20' },
              { label: 'เกินกำหนด', value: widgets.overdueJobs, sub: 'กด ⚠️ ดูรายละเอียด', color: widgets.overdueJobs > 0 ? 'text-red-400' : '', bg: widgets.overdueJobs > 0 ? 'bg-red-500/8 border-red-500/20' : '' },
            ].map(w => (
              <div key={w.label} className={`rounded-2xl p-4 border ${w.bg}`}
                style={!w.bg ? { background: 'var(--card-bg)', borderColor: 'var(--divider)' } : undefined}>
                <p className="text-xs mb-1" style={{ color: 'var(--text-3)' }}>{w.label}</p>
                <p className={`text-3xl font-bold ${w.color}`} style={!w.color ? { color: 'var(--text-3)' } : undefined}>{w.value}</p>
                <p className={`text-xs mt-1 opacity-60 ${w.color}`} style={!w.color ? { color: 'var(--text-3)' } : undefined}>{w.sub}</p>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Action Grid — 3 rows with headers */}
      <div className="px-5 pb-6">
        {ROWS.map(row => (
          <div key={row.header} className="mb-5">
            <p className={`text-[10px] font-bold uppercase tracking-widest mb-3 ${row.color}`}>{row.header}</p>
            <div className="grid grid-cols-4 gap-2.5">
              {row.buttons.map(btn => (
                <button
                  key={btn.key}
                  onClick={() => handleAction(btn)}
                  className={`relative flex flex-col items-center gap-1.5 p-3 rounded-2xl border transition-all active:scale-95 ${btn.bg}`}
                  style={{ minHeight: 80, ...(!btn.bg ? { background: 'var(--card-bg)', borderColor: 'var(--divider)' } : {}) }}
                >
                  {btn.badge !== undefined && btn.badge > 0 && (
                    <div className="absolute -top-1 -right-1 w-5 h-5 bg-red-500 rounded-full flex items-center justify-center text-white text-[9px] font-bold z-10">
                      {btn.badge > 9 ? '9+' : btn.badge}
                    </div>
                  )}
                  <btn.icon size={24} color={btn.iconColor} strokeWidth={1.75} />
                  <span className="text-[11px] font-bold text-center leading-tight" style={{ whiteSpace: 'pre-line', color: 'var(--text-1)' }}>{btn.label}</span>
                </button>
              ))}
            </div>
          </div>
        ))}
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
