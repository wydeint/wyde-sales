'use client'

import DateInput from '@/components/ui/DateInput'
import FileAttach from '@/components/ui/FileAttach'
import { useEffect, useState, useCallback, useRef, useMemo } from 'react'
import { createClient } from '@/lib/supabase/client'
import MoneyInput from '@/components/ui/MoneyInput'
import { crmStage, EVENT_CUSTOMER_STATUSES } from '@/lib/status'
import { Spinner, EmptyState } from '@/components/ui/StateUI'
import { useRouter } from 'next/navigation'
import { bahtShort } from '@/lib/money'
import {
  Search, X, CheckCircle2, ChevronRight, AlertTriangle,
  AlertCircle, ArrowLeft, Home, Plus, BadgeCheck,
  Briefcase, Users, CalendarDays, Database,
  Receipt, FileText, ArrowRightLeft, ClipboardList,
  DollarSign, Zap, Phone, User, Building2, Paperclip,
  type LucideIcon
} from 'lucide-react'
import { showAlert } from '@/components/ui/dialog'
import { netReceived, settledAmount } from '@/lib/voucher'
import { deliverJob } from '@/lib/jobLifecycle'
import { todayStr, daysFromToday } from '@/lib/today'
import { compareThai } from '@/lib/utils'
import { createProspectJob as createProspectJobShared } from '@/lib/prospectJob'
import { cleanName } from '@/lib/customerName'
import { nextCustomerId } from '@/lib/customerId'
import { calcB2CInstallments } from '@/lib/paymentPlans'
import { fetchAllRows } from '@/lib/fetchAll'

// ─── Types ────────────────────────────────────────────────
interface WidgetData {
  inProgressJobs: number
  overdueJobs: number
  pendingInstallments: number
  pendingAmount: number
  readyToDeliver: number
}

/**
 * The four numbers at the top of Quick Mode — all of them the logged-in
 * seller's own, never the company's.
 *
 * They used to be company-wide: the query behind them never filtered
 * `sales_id`, so a seller holding 21 jobs opened the page to a count in the
 * three hundreds with not one of their own jobs in it. Nothing to act on, so
 * nobody read the cards.
 *
 * Sold / delivered / collected are *this month* — they answer "how am I
 * doing". `gap` is a standing figure and answers "what is left to do": booked
 * customers who have paid a deposit but have not reached 50%, which is the
 * step that moves a job from Prospects into My Deals. It is the only one of
 * the four that is never zero, which is why it gets its own wide card.
 *
 * Definitions come from lib/salesScorecard.ts so these agree with Sales
 * Performance › รายคน to the baht. The one deliberate difference: `cash`
 * counts `paid_amount` only. Voucher money is paid by the developer, not by
 * the customer (see reference_rpt_axis), so it is not cash the seller
 * collected.
 */
interface Overview {
  soldValue: number; soldN: number; soldPrev: number
  delivValue: number; delivN: number; delivPrev: number
  cashValue: number; cashPrev: number
  gapValue: number; gapN: number
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

/** Phone-first, so figures abbreviate — but by the app-wide rule now, not this
 *  page's own. The layout stays deliberately different from the desktop pages;
 *  what a number means should not. The old version rounded ฿1,499,000 to
 *  ฿1.5M and ฿1,600 to ฿2k, which is a lot of precision to lose on a screen
 *  people use to quote customers. */
const fmtBaht = bahtShort

/** How far either side of today an event still counts as "on now". */
const EVENT_BANNER_DAYS = 2

/** First day of the month `back` months ago, as YYYY-MM-DD.
 *
 *  Built from local date parts on purpose. `toISOString()` converts to UTC, and
 *  Bangkok is UTC+7 — between midnight and 7am it reports the previous day, so
 *  on the 1st of a month it would hand back the month before. */
function monthStart(back = 0): string {
  const d = new Date()
  d.setDate(1)
  d.setMonth(d.getMonth() - back)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`
}

/** The note moved to the job in the customers/jobs de-duplication. A customer
 *  can hold several; show the first one that has anything to say. */
const jobNote = (c: any): string =>
  ((c.jobs as { notes: string | null }[] | null) || []).find(j => j.notes)?.notes || ''
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
          // --panel-bg, the same surface Modal and JobDrawer use, not
          // --glass-bg. Glass is white at 62%, and over the black/60 scrim that
          // composites to RGB(196,196,197) — a mid grey, not a white card. The
          // secondary text on it then measures 3.61:1 (--text-3) and 3.95:1
          // (--text-2), both under the 4.5:1 that body text needs. On
          // --panel-bg the same two read 5.98:1 and 6.53:1.
          //
          // Dark mode never showed it: --glass-bg #202020 and --panel-bg #1d1d1d
          // are three shades apart, so the fault only ever appeared in light.
          //
          // The blur goes with it. At 96% opacity there is nothing left to see
          // through, and a full-screen backdrop-filter is not free on a phone.
          background: 'var(--panel-bg)',
          border: '1px solid var(--card-border)',
          borderRadius: 'var(--radius-lg)',
          overflow: 'hidden',
        }}
      >
        {/* title bar */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '16px 20px', borderBottom: '1px solid var(--divider)', flexShrink: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            {Icon && <Icon size={18} color="var(--accent)" strokeWidth={1.75} />}
            <h3 style={{ fontWeight: 600, fontSize: 'var(--fs-body)', color: 'var(--text-1)', margin: 0 }}>{title}</h3>
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
  color: 'var(--text-1)', fontSize: 'var(--fs-body)',
}
/* 8, not 18 and not 11. The system has two corner sizes: 18 for something
 * floating on the page background, 8 for something sitting inside something
 * else. These rows sit inside the sheet, so they take 8 — they were 18, the
 * same corner as the sheet holding them, which is what made a list of them
 * read as a stack of loose cards. The 11 on the second one is older still: it
 * was .ds-card-sm's radius, retired when the card sizes were merged. */
const sheetCard: React.CSSProperties = { background: 'var(--hover-bg)', border: '1px solid var(--divider)', borderRadius: 'var(--radius-md)', padding: '12px 16px' }
const sheetCardDark: React.CSSProperties = { background: 'var(--card-bg)', border: '1px solid var(--card-border)', borderRadius: 'var(--radius-md)', padding: '8px 12px' }
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
    setResults(sortByName(data))
    setLoading(false)
  }

  function handleChange(v: string) {
    setSearch(v)
    clearTimeout(timerRef.current)
    timerRef.current = setTimeout(() => doSearch(v), 300)
  }

  return (
    <Sheet open={open} onClose={() => { setSearch(''); setResults([]); onClose() }} title="Origin Pool" icon={Database}>
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

// ─── Job Registry Search Sheet ─────────────────────────────
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
    setResults(sortByName(data))
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
    <Sheet open={open} onClose={() => { setSearch(''); setResults([]); onClose() }} title="Job Registry" icon={Briefcase}>
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
                    <p className="text-xs mt-1" style={t2}>{j.room_no} · {(j.projects as any)?.name}</p>
                  </div>
                  <span className="font-bold text-sm" style={{ color: 'var(--accent-green)' }}>{fmtBaht(j.revenue_ex_vat || 0)}</span>
                </div>
                <div className="grid grid-cols-3 gap-2">
                  <div className="rounded-xl p-2 text-center" style={sheetCardDark}>
                    <p className="text-micro mb-1" style={t3}>สถานะ</p>
                    <p className="text-xs font-semibold truncate" style={{ color: 'var(--accent-orange)' }}>{j.working_status || '—'}</p>
                  </div>
                  <div className="rounded-xl p-2 text-center" style={sheetCardDark}>
                    <p className="text-micro mb-1" style={t3}>เริ่มงาน</p>
                    <p className="text-xs" style={t1}>{fmtDate(j.work_start_date)}</p>
                  </div>
                  <div className="rounded-xl p-2 text-center" style={over > 0 ? { ...sheetCardDark, background: 'color-mix(in srgb, var(--accent-red) 10%, transparent)', borderColor: 'color-mix(in srgb, var(--accent-red) 30%, transparent)' } : sheetCardDark}>
                    <p className="text-micro mb-1" style={t3}>ครบสัญญา</p>
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
      // customers.status is gone — stage lives on the job. Asking for it made
      // PostgREST reject the query and this sheet returned nothing at all.
      .select('id, customer_name, phone, interested_room, project_id, created_at, jobs(crm_stage, notes)')
      .or(`customer_name.ilike.%${q}%,phone.ilike.%${q}%,interested_room.ilike.%${q}%`)
      .order('customer_name')
      .limit(12)
    if (error) console.error('ProspectsSheet search error:', error)
    setResults(sortByName(data))
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
            // Stage belongs to the job. A prospect holds one; take the first
            // that carries a stage, the way the register's drawer does.
            const st = crmStage((c.jobs as any[] | null)?.find(j => j?.crm_stage)?.crm_stage || 'new')
            return (
              <div key={c.id} style={sheetCard}>
                <div className="flex justify-between items-start gap-2 mb-1">
                  <p className="font-semibold" style={t1}>{c.customer_name}</p>
                  <span className={`${st.badge} flex-shrink-0`}>{st.label}</span>
                </div>
                <p className="text-xs" style={t2}>{projectsMap[c.project_id] || '—'} · ห้อง {c.interested_room || '—'}</p>
                {c.phone && <p className="text-xs mt-1 flex items-center gap-1" style={{ color: 'var(--accent-blue)' }}><Phone size={11} strokeWidth={1.75} />{c.phone}</p>}
                {jobNote(c) && <p className="text-xs mt-1 truncate" style={t3}>{jobNote(c)}</p>}
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
    setLeads(sortByName(data))
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
      await showAlert('ลูกค้านี้อยู่ใน Event แล้ว')
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

  /* One list for both screens — see EVENT_CUSTOMER_STATUSES in lib/status.ts
     for what these had drifted into. The colours here come from the shared
     entry so a status looks the same on a phone as it does on the Events
     page. */
  const STATUS_OPTIONS = EVENT_CUSTOMER_STATUSES.map(e => ({
    value: e.value,
    label: e.label,
    activeColor: e.color,
    activeBg: `color-mix(in srgb, ${e.color} 15%, transparent)`,
    activeBorder: `color-mix(in srgb, ${e.color} 40%, transparent)`,
  }))

  return (
    <Sheet open={open} onClose={resetAndClose} title="เพิ่มลูกค้า Event" icon={CalendarDays}>
      {step === 'event' && (
        <div className="p-4">
          <p className="text-xs mb-4" style={t2}>เลือก Event</p>
          {events.length === 0 ? (
            <p className="text-center py-8 text-sm" style={t3}>ยังไม่มี Event</p>
          ) : (
            <div className="space-y-2">
              {events.map(ev => (
                <button key={ev.id} onClick={() => { setSelectedEvent(ev); setStep('search') }}
                  className="w-full flex items-center justify-between px-4 py-4 rounded-xl text-left transition-colors"
                  style={sheetCard}>
                  <div>
                    <p className="font-semibold text-sm" style={t1}>{ev.eventName}</p>
                    <p className="text-xs mt-1" style={t2}>{ev.projectName} · {fmtDate(ev.eventDate)}</p>
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
          <button onClick={() => setStep('event')} className="text-sm mb-4 flex items-center gap-1" style={{ color: 'var(--accent-blue)' }}>
            <ArrowLeft size={14} /> {selectedEvent.eventName}
          </button>
          <div className="relative mb-4">
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
            <p className="text-xs mt-1" style={t3}>Event: {selectedEvent.eventName}</p>
          </div>
          <div>
            <label className="text-xs mb-2 block" style={t3}>สถานะ</label>
            <div className="grid grid-cols-2 gap-2">
              {STATUS_OPTIONS.map(s => (
                <button key={s.value} onClick={() => setStatus(s.value)}
                  className="py-3 rounded-[8px] text-sm font-semibold transition-all border"
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
              style={{ ...sheetInputStyle, fontSize: 'var(--fs-body)' }} />
          </div>
          <button onClick={save} disabled={saving}
            className="w-full py-4 disabled:opacity-40 text-white font-semibold rounded-[8px] transition-colors text-base"
            style={{ background: 'var(--accent-green)' }}>
            {saving ? 'กำลังบันทึก...' : 'เพิ่มในรายชื่อ Event'}
          </button>
        </div>
      )}
    </Sheet>
  )
}

/**
 * `.order('customer_name')` on the query sorts with the database collation
 * (en_US.UTF-8), which puts Thai leading vowels — เ แ โ ใ ไ — before the
 * consonant they are read after. 47% of the Thai names in the table come back
 * in the wrong place. The query keeps its order so the `.limit()` picks a
 * stable slice; the list the salesperson actually reads is sorted here.
 */
function sortByName<T extends { customer_name?: string | null }>(rows: T[] | null): T[] {
  return [...(rows || [])].sort((a, b) => compareThai(a.customer_name, b.customer_name))
}

const CHANNEL_OPTS = ['โอนเข้าบัญชีบริษัท', 'บัตรเครดิต', 'เงินสด', 'QR Code']

// ─── Quick Pay Sheet ───────────────────────────────────────
// buildLineMsg and sendLineNotify used to sit here — a third copy of the LINE
// message, plus its sender, left behind when auto-posting was removed. Nothing
// called either one. Quick Mode has no LINE button; posting happens from My
// Deals and Prospects, both on lib/lineMessage.ts.
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
  useEffect(() => { setPaidDate(todayStr()) }, [])
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
      status: 'paid', paid_date: paidDate, paid_amount: netReceived(paidAmount, vcAmt),
      channel: channel || null,
      slip_url: slipPosted ? 'posted' : null,
      receipt_url: receiptPosted ? 'posted' : null,
      voucher_code: vcCode || null,
      voucher_amount: vcAmt || null,
    }).eq('id', selectedInst.id)

    if (selectedInst.is_work_trigger) {
      await supabase.from('jobs').update({ work_start_date: paidDate, working_status: 'ดำเนินการ', crm_stage: 'closed' }).eq('id', selectedJob.id)
      const { data: jobData } = await supabase.from('jobs').select('customer_id').eq('id', selectedJob.id).maybeSingle()
      if (jobData?.customer_id) {
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
          <div className="relative mb-4">
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
                  <p className="text-xs mt-1" style={t2}>{j.roomNo} · {j.projectName}</p>
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
          <p className="text-xs mb-6" style={t3}>งานนี้ยังไม่มีงวดชำระในระบบ · ตั้งแผนได้ที่หน้า Prospect หรือ My Deals บนคอมพิวเตอร์</p>
          <button onClick={() => setStep('job')}
            className="w-full py-3 rounded-[8px] mb-4 text-sm" style={{ background: 'var(--hover-bg)', color: 'var(--text-2)', border: '1px solid var(--divider)' }}>
            ← เลือกลูกค้าอื่น
          </button>
          <button onClick={resetAndClose}
            className="w-full py-3 rounded-[8px] text-sm font-semibold"
            style={{ background: 'color-mix(in srgb, var(--accent-orange) 15%, transparent)', color: 'var(--accent-orange)' }}>
            ปิดหน้านี้
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
              <p className="text-xs mb-4" style={t2}>เลือกงวดที่ต้องการบันทึก</p>
              {installments.map((inst: any) => (
                <button key={inst.id} onClick={() => { setSelectedInst(inst); setPaidAmount(inst.amount || 0); setStep('confirm') }}
                  className="w-full flex items-center justify-between px-4 py-4 rounded-xl transition-colors"
                  style={sheetCard}>
                  <div className="text-left">
                    <p className="font-semibold text-sm" style={t1}>{inst.installment_name}</p>
                    {inst.is_work_trigger && <p className="text-xs mt-1 flex items-center gap-1" style={{ color: 'var(--accent-orange)' }}><Zap size={10} strokeWidth={2} />ชำระแล้วเริ่มงาน</p>}
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
              <MoneyInput value={paidAmount ? String(paidAmount) : ''} onChange={v => setPaidAmount(Number(v) || 0)} ariaLabel="ยอดที่รับจริง" 
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
          <div className="rounded-[8px] p-3 space-y-2.5" style={{ background: 'var(--hover-bg)', border: '1px solid var(--divider)' }}>
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
                  <label className="text-xs mb-1 block" style={t3}>มูลค่างาน (฿)</label>
                  <MoneyInput value={voucherAmount ? String(voucherAmount) : ''} onChange={v => setVoucherAmount(Number(v) || 0)} ariaLabel="มูลค่า Voucher" 
                    placeholder="0" className="w-full rounded-[8px] px-3 py-2 text-sm focus:outline-none"
                    style={sheetInputStyle} />
                </div>
              </div>
            )}
          </div>
          <div className="rounded-[8px] p-3 space-y-2.5" style={{ background: 'var(--hover-bg)', border: '1px solid var(--divider)' }}>
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
            className="w-full py-4 disabled:opacity-40 text-white font-semibold rounded-[8px] transition-colors text-base"
            style={{ background: 'var(--accent-green)' }}>
            {saving ? 'กำลังบันทึก...' : 'ยืนยันรับเงิน'}
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
  useEffect(() => { setDeliveryDate(todayStr()) }, [])
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
    // JobOption carries only what the picker shows; the shared writer needs the
    // customer and project to stamp on the handover and warranty rows.
    const { data: jobRow } = await supabase.from('jobs')
      .select('id, customer_id, project_id, room_no, customer_name')
      .eq('id', selectedJob.id).maybeSingle()

    // Quick Mode used to write neither actual_deliver_date, commission_month nor
    // a warranty, and used its own `HOV-` id — a room delivered here dropped out
    // of Warranty and Commission entirely. Same writer as every other screen now;
    // warranty is created automatically at the standard 6 months, editable later
    // from the Warranty page, so Quick Mode stays one tap.
    const res = await deliverJob(supabase, jobRow || { id: selectedJob.id }, {
      deliverDate: deliveryDate,
      deliveryFileUrl: fileUrl || null,
    })
    setSaving(false)
    if (!res.ok) { await showAlert(res.error!); return }
    resetAndClose()
    await showAlert(res.warning || 'บันทึกส่งมอบเรียบร้อย ✅')
  }

  function resetAndClose() {
    setStep('job'); setSearch(''); setSelectedJob(null)
    setDeliveryDate(todayStr()); setFileUrl(''); onClose()
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
          <div className="relative mb-4">
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
                  <p className="text-xs mt-1" style={t2}>{j.roomNo} · {j.projectName}</p>
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
            <div className="rounded-[8px] p-4 text-center" style={{ background: 'color-mix(in srgb, var(--accent-red) 10%, transparent)', border: '1px solid color-mix(in srgb, var(--accent-red) 20%, transparent)' }}>
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
                className="w-full py-4 disabled:opacity-40 text-white font-semibold rounded-[8px] transition-colors text-base"
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
    // `HO-`, same id scheme as deliverJob — with `HOV-` this row and the one
    // written at delivery were two different rows for the same job. Insert only
    // when there is nothing there: a plain upsert would reset `status` back to
    // 'scheduled' on a job that has already been handed over.
    const { data: ex } = await supabase.from('handovers').select('id').eq('job_id', jobId).maybeSingle()
    if (ex) {
      await supabase.from('handovers').update({ work_status: status }).eq('id', ex.id)
    } else {
      await supabase.from('handovers').insert({ id: `HO-${jobId}`, job_id: jobId, work_status: status, status: 'scheduled' })
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
        <div className="relative mb-4">
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
                    className="flex-1 py-2.5 rounded-[8px] text-xs font-semibold transition-colors border"
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
              <CheckCircle2 size={32} className="mx-auto mb-4" style={{ color: 'color-mix(in srgb, var(--accent-green) 50%, transparent)' }} />
              <p style={t2}>ยังไม่มีงานเกินกำหนด 🎉</p>
            </div>
          ) : items.map((j: any) => (
            <div key={j.id} className="rounded-[8px] p-3 mb-2" style={{ background: 'color-mix(in srgb, var(--accent-red) 8%, transparent)', border: '1px solid color-mix(in srgb, var(--accent-red) 20%, transparent)' }}>
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

// ─── Commission — a tab inside เช็คยอดเงิน, not a button of its own ─────────
// It answers "how am I doing", which is the same question as the balance tab
// next to it, and it was opened about as often as a monthly payslip.
function CommissionBody({ active }: { active: boolean }) {
  const supabase = createClient()
  const [items, setItems] = useState<any[]>([])
  const [summary, setSummary] = useState({ total: 0, pending: 0, approved: 0 })
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!active) return
    setLoading(true)
    async function load() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return
      const { data: userData } = await supabase.from('users').select('id').eq('email', user.email!).maybeSingle()
      if (!userData) { setLoading(false); return }
      // Commission lives on the job — jobs.commission_amount / _status — and is
      // what the Commission page reads. This sheet used to query a `commissions`
      // table with columns it does not have (job_id, amount, sales_id), so
      // PostgREST rejected it; the table also holds zero rows, so even a
      // corrected query against it would have shown an empty sheet forever.
      const { data } = await supabase.from('jobs')
        .select('id, customer_name, room_no, commission_amount, commission_status, order_date, projects(name)')
        .eq('sales_id', userData.id)
        .neq('working_status', 'ยกเลิก')
        .gt('commission_amount', 0)
        .order('order_date', { ascending: false })
        .limit(20)
      const list = data || []
      setItems(list)
      const amt = (c: any) => c.commission_amount || 0
      setSummary({
        total: list.reduce((s: number, c: any) => s + amt(c), 0),
        pending: list.filter((c: any) => (c.commission_status || 'pending') === 'pending').reduce((s: number, c: any) => s + amt(c), 0),
        approved: list.filter((c: any) => c.commission_status === 'approved').reduce((s: number, c: any) => s + amt(c), 0),
      })
      setLoading(false)
    }
    load()
  }, [active])

  const STATUS_STYLE: Record<string, string> = {
    pending: 'var(--accent-orange)', approved: 'var(--accent-green)', paid: 'var(--accent-blue)', rejected: 'var(--accent-red)'
  }

  return (
      <div className="p-4">
        {loading ? <div className="py-8 flex justify-center"><Spinner /></div> : (
          <>
            <div className="grid grid-cols-3 gap-2 mb-5">
              <div className="rounded-2xl p-3 text-center" style={sheetCard}>
                <p className="text-micro mb-1" style={t3}>รวมทั้งหมด</p>
                <p className="font-bold text-sm" style={t1}>{fmtBaht(summary.total)}</p>
              </div>
              <div className="rounded-[8px] p-3 text-center" style={{ background: 'color-mix(in srgb, var(--accent-orange) 10%, transparent)' }}>
                <p className="text-micro mb-1" style={t3}>รอยืนยัน</p>
                <p className="font-bold text-sm" style={{ color: 'var(--accent-orange)' }}>{fmtBaht(summary.pending)}</p>
              </div>
              <div className="rounded-[8px] p-3 text-center" style={{ background: 'color-mix(in srgb, var(--accent-green) 10%, transparent)' }}>
                <p className="text-micro mb-1" style={t3}>อนุมัติแล้ว</p>
                <p className="font-bold text-sm" style={{ color: 'var(--accent-green)' }}>{fmtBaht(summary.approved)}</p>
              </div>
            </div>
            <div className="space-y-2">
              {items.map((c: any) => (
                <div key={c.id} className="rounded-xl p-3" style={sheetCard}>
                  <div className="flex justify-between items-start">
                    <div>
                      <p className="text-sm font-semibold" style={t1}>{c.customer_name || '—'}</p>
                      <p className="text-xs" style={t2}>{c.room_no} · {(c.projects as any)?.name}</p>
                    </div>
                    <div className="text-right">
                      <p className="font-semibold text-sm" style={t1}>{fmtBaht(c.commission_amount || 0)}</p>
                      <p className="text-xs" style={{ color: STATUS_STYLE[c.commission_status || 'pending'] || 'var(--text-2)' }}>{c.commission_status || 'pending'}</p>
                    </div>
                  </div>
                </div>
              ))}
              {items.length === 0 && <EmptyState message="ยังไม่มีข้อมูล Commission" />}
            </div>
          </>
        )}
      </div>
  )
}

// ─── เช็คยอดเงิน ───────────────────────────────────────────
/**
 * Read-only on purpose, and separate from บันทึกรับเงิน even though both read
 * the same instalments.
 *
 * The moment it serves is a phone call: the customer asks what is still owed
 * and the answer has to arrive in a few seconds. Walking that through the
 * recording flow would put a "save payment" button under the seller's thumb
 * while they are mid-conversation — one mis-tap and money is booked that was
 * never received. Nothing in here writes.
 */
function BalanceSheet({ open, onClose, jobs }: {
  open: boolean; onClose: () => void; jobs: JobOption[]
}) {
  const supabase = createClient()
  const [tab, setTab] = useState<'job' | 'mine'>('job')
  const [search, setSearch] = useState('')
  const [selected, setSelected] = useState<JobOption | null>(null)
  const [detail, setDetail] = useState<{ total: number; settled: number; rows: any[] } | null>(null)
  const [loading, setLoading] = useState(false)

  async function pick(job: JobOption) {
    setSelected(job); setDetail(null); setLoading(true)
    const [{ data: jobRow }, { data: pays }] = await Promise.all([
      supabase.from('jobs').select('revenue_inc_vat').eq('id', job.id).maybeSingle(),
      supabase.from('payments')
        .select('id, installment_name, installment_no, amount, paid_amount, voucher_amount, status, due_date, paid_date')
        .eq('job_id', job.id).order('installment_no'),
    ])
    const rows = pays || []
    // settledAmount, not paid_amount: a voucher settles the customer's side of
    // the instalment even though the cash comes from the developer. The
    // question here is "what do I still owe", so it counts both.
    const settled = rows.filter(r => r.status === 'paid')
      .reduce((s, r) => s + settledAmount(r.paid_amount, r.amount, r.voucher_amount), 0)
    setDetail({ total: Number(jobRow?.revenue_inc_vat) || 0, settled, rows })
    setLoading(false)
  }

  function back() { setSelected(null); setDetail(null) }
  function closeAll() { setSearch(''); setSelected(null); setDetail(null); setTab('job'); onClose() }

  const filtered = jobs.filter(j =>
    !search || j.customerName.toLowerCase().includes(search.toLowerCase()) ||
    normRoom(j.roomNo).includes(normRoom(search)) ||
    j.projectName.toLowerCase().includes(search.toLowerCase()))

  const next = detail?.rows.find(r => r.status !== 'paid') ?? null
  const remaining = detail ? Math.max(0, detail.total - detail.settled) : 0

  return (
    <Sheet open={open} onClose={closeAll} title="เช็คยอดเงิน" icon={DollarSign}>
      <div className="flex gap-2 px-4 pt-4">
        {([['job', 'ยอดลูกค้า'], ['mine', 'Commission']] as const).map(([v, label]) => (
          <button key={v} onClick={() => setTab(v)}
            className="flex-1 py-2.5 rounded-[8px] text-body font-bold transition-colors"
            style={tab === v
              ? { background: 'var(--accent)', color: '#fff' }
              : { background: 'var(--hover-bg)', color: 'var(--text-2)', border: '1px solid var(--divider)' }}>
            {label}
          </button>
        ))}
      </div>

      {tab === 'mine' && <CommissionBody active={open && tab === 'mine'} />}

      {tab === 'job' && !selected && (
        <div className="p-4">
          <div className="relative mb-4">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2" style={t3} />
            <input autoFocus value={search} onChange={e => setSearch(e.target.value)}
              placeholder="พิมพ์ชื่อลูกค้า / ห้อง / โครงการ..."
              className={sheetInput} style={sheetInputStyle} />
          </div>
          <div className="space-y-2">
            {filtered.slice(0, 15).map(j => (
              <button key={j.id} onClick={() => pick(j)}
                className="w-full flex items-center justify-between px-4 py-3.5 rounded-[8px] text-left"
                style={sheetCard}>
                <div>
                  <p className="font-semibold text-body" style={t1}>{j.customerName}</p>
                  <p className="text-label mt-1" style={t2}>{j.roomNo} · {j.projectName}</p>
                </div>
                <ChevronRight size={16} style={t3} />
              </button>
            ))}
            {filtered.length === 0 && <EmptyState message="ไม่พบงานที่ค้นหา" />}
          </div>
        </div>
      )}

      {tab === 'job' && selected && (
        <div className="p-4">
          <button onClick={back} className="text-label mb-4 flex items-center gap-1" style={{ color: 'var(--accent-blue)' }}>
            <ArrowLeft size={14} /> เลือกงานอื่น
          </button>
          <p className="font-semibold text-body" style={t1}>{selected.customerName}</p>
          <p className="text-label mb-4" style={t2}>{selected.roomNo} · {selected.projectName}</p>

          {loading ? <div className="py-8 flex justify-center"><Spinner /></div> : detail && (
            <>
              <div className="grid grid-cols-2 gap-2 mb-4">
                <div className="p-3 rounded-[8px]" style={{ background: 'color-mix(in srgb, var(--accent-green) 10%, transparent)' }}>
                  <p className="text-micro mb-1" style={t3}>ชำระแล้ว</p>
                  <p className="font-bold text-body" style={{ color: 'var(--accent-green)' }}>{fmtBaht(detail.settled)}</p>
                </div>
                <div className="p-3 rounded-[8px]" style={{ background: 'color-mix(in srgb, var(--accent-orange) 10%, transparent)' }}>
                  <p className="text-micro mb-1" style={t3}>คงเหลือ</p>
                  <p className="font-bold text-body" style={{ color: 'var(--accent-orange)' }}>{fmtBaht(remaining)}</p>
                </div>
              </div>
              <p className="text-label mb-3" style={t3}>มูลค่างานรวม {fmtBaht(detail.total)}</p>

              {next ? (
                <div className="p-3 rounded-[8px] mb-4" style={sheetCard}>
                  <p className="text-micro mb-1" style={t3}>งวดถัดไป</p>
                  <p className="font-semibold text-body" style={t1}>{next.installment_name || 'งวดที่ ' + next.installment_no}</p>
                  <p className="text-label mt-1" style={t2}>
                    {fmtBaht(next.amount || 0)} · ครบกำหนด {next.due_date ? fmtDate(next.due_date) : 'ยังไม่กำหนด'}
                  </p>
                </div>
              ) : (
                <div className="p-3 rounded-[8px] mb-4 text-center" style={{ background: 'color-mix(in srgb, var(--accent-green) 10%, transparent)' }}>
                  <p className="text-body font-semibold" style={{ color: 'var(--accent-green)' }}>เก็บครบทุกงวดแล้ว</p>
                </div>
              )}

              {/* Every instalment, not only the next one — the caller often asks
                  "what did I pay in June", which a summary cannot answer. */}
              <p className="text-micro font-bold uppercase tracking-widest mb-2" style={t3}>ทุกงวด</p>
              <div className="space-y-2">
                {detail.rows.map(r => (
                  <div key={r.id} className="flex items-center justify-between p-3 rounded-[8px]" style={sheetCard}>
                    <div className="min-w-0">
                      <p className="text-label font-semibold truncate" style={t1}>{r.installment_name || 'งวดที่ ' + r.installment_no}</p>
                      <p className="text-micro mt-0.5" style={t3}>
                        {r.status === 'paid'
                          ? 'จ่ายแล้ว ' + (r.paid_date ? fmtDate(r.paid_date) : '')
                          : 'ครบกำหนด ' + (r.due_date ? fmtDate(r.due_date) : 'ยังไม่กำหนด')}
                      </p>
                    </div>
                    <div className="text-right flex-shrink-0 ml-2">
                      <p className="text-label font-semibold" style={t1}>{fmtBaht(r.amount || 0)}</p>
                      <p className="text-micro" style={{ color: r.status === 'paid' ? 'var(--accent-green)' : 'var(--accent-orange)' }}>
                        {r.status === 'paid' ? 'ชำระแล้ว' : 'รอชำระ'}
                      </p>
                    </div>
                  </div>
                ))}
                {detail.rows.length === 0 && <EmptyState message="งานนี้ยังไม่มีงวดชำระในระบบ" />}
              </div>
            </>
          )}
        </div>
      )}
    </Sheet>
  )
}

// ─── สร้างงานใหม่ ──────────────────────────────────────────
/**
 * Opens a prospect from the field — one room, one seller, one value.
 *
 * It searches before it creates, and that is the point of the first step. The
 * register has been merged once already for 265 duplicate people; a seller
 * standing in a sales gallery has no way to know the customer in front of them
 * is already in the system under a slightly different spelling. So the name
 * goes in first and anything close comes back before "new customer" is offered.
 *
 * The row is written through lib/prospectJob, the same function the desktop
 * Prospects page uses. Opening a prospect touches customers and jobs together
 * and has already been the source of two silent failures (a dropped `budget`
 * column, then `notes`), so this screen does not get its own copy of it.
 */
function NewJobSheet({ open, onClose, myId, onCreated }: {
  open: boolean; onClose: () => void; myId: string | null; onCreated: () => void
}) {
  const supabase = createClient()
  const [step, setStep] = useState<'search' | 'form'>('search')
  const [search, setSearch] = useState('')
  const [matches, setMatches] = useState<any[]>([])
  const [searching, setSearching] = useState(false)
  const [existing, setExisting] = useState<any | null>(null)
  const [projects, setProjects] = useState<{ id: string; name: string }[]>([])
  const [form, setForm] = useState({ name: '', phone: '', projectId: '', room: '', value: 0 })
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState('')
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined)

  useEffect(() => {
    if (!open || projects.length) return
    supabase.from('projects').select('id, name').order('name')
      .then(({ data }) => setProjects((data || []) as any))
  }, [open])

  function lookup(q: string) {
    setSearch(q)
    clearTimeout(timer.current)
    if (!q.trim()) { setMatches([]); return }
    timer.current = setTimeout(async () => {
      setSearching(true)
      const { data } = await supabase.from('customers')
        .select('id, customer_name, phone, project_id, projects(name)')
        .or(`customer_name.ilike.%${q}%,phone.ilike.%${q}%`)
        .limit(20)
      // Sorted here, not by the query: Postgres collates Thai by code point and
      // puts the leading vowels เ แ โ ใ ไ before their consonant.
      setMatches(sortByName(data as any))
      setSearching(false)
    }, 300)
  }

  function startNew() {
    setExisting(null)
    setForm({ name: search.trim(), phone: '', projectId: '', room: '', value: 0 })
    setErr(''); setStep('form')
  }

  function startRepeat(c: any) {
    setExisting(c)
    setForm({ name: c.customer_name || '', phone: c.phone || '', projectId: c.project_id || '', room: '', value: 0 })
    setErr(''); setStep('form')
  }

  function reset() {
    setStep('search'); setSearch(''); setMatches([]); setExisting(null); setErr('')
    setForm({ name: '', phone: '', projectId: '', room: '', value: 0 })
  }
  function closeAll() { reset(); onClose() }

  async function save() {
    if (!form.name.trim()) { setErr('กรุณาใส่ชื่อลูกค้า'); return }
    if (!form.projectId) { setErr('กรุณาเลือกโครงการ'); return }
    if (!form.room.trim()) { setErr('กรุณาใส่เลขห้อง'); return }
    setSaving(true); setErr('')
    try {
      let customerId = existing?.id as string | undefined
      if (!customerId) {
        customerId = await nextCustomerId(supabase)
        const { error } = await supabase.from('customers').insert([{
          id: customerId,
          customer_name: cleanName(form.name),
          phone: form.phone.trim() || null,
          project_id: form.projectId,
          interested_room: form.room.trim(),
          customer_type: 'B2C',
          source: 'Quick Mode',
        }])
        if (error) throw new Error(error.message)
      }
      await createProspectJobShared(supabase, {
        customerId: customerId!,
        customerName: cleanName(form.name),
        projectId: form.projectId,
        roomNo: form.room.trim(),
        customerType: 'B2C',
        // The seller who opened it owns it. 36 of the 49 prospects in the
        // system have no sales_id at all, which is why nobody chases them.
        salesId: myId,
        crmStage: 'interested',
        revenueIncVat: form.value || 0,
      })
      onCreated()
      closeAll()
    } catch (e: any) {
      setErr(e?.message || 'บันทึกไม่สำเร็จ')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Sheet open={open} onClose={closeAll} title="สร้างงานใหม่" icon={Plus}>
      {step === 'search' && (
        <div className="p-4">
          <p className="text-label mb-3" style={t3}>ค้นก่อนว่าเคยมีลูกค้ารายนี้ในระบบหรือยัง</p>
          <div className="relative mb-4">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2" style={t3} />
            <input autoFocus value={search} onChange={e => lookup(e.target.value)}
              placeholder="ชื่อลูกค้า หรือ เบอร์โทร..."
              className={sheetInput} style={sheetInputStyle} />
          </div>

          {searching && <div className="py-6 flex justify-center"><Spinner /></div>}

          {!searching && search.trim() !== '' && (
            <>
              {matches.length > 0 && (
                <>
                  <p className="text-micro font-bold uppercase tracking-widest mb-2" style={t3}>มีอยู่แล้วในระบบ</p>
                  <div className="space-y-2 mb-4">
                    {matches.map(c => (
                      <button key={c.id} onClick={() => startRepeat(c)}
                        className="w-full flex items-center justify-between px-4 py-3 rounded-[8px] text-left"
                        style={sheetCard}>
                        <div className="min-w-0">
                          <p className="font-semibold text-body truncate" style={t1}>{c.customer_name}</p>
                          <p className="text-label truncate" style={t2}>
                            {c.phone || 'ไม่มีเบอร์'}{(c.projects as any)?.name ? ' · ' + (c.projects as any).name : ''}
                          </p>
                        </div>
                        <ChevronRight size={16} style={t3} />
                      </button>
                    ))}
                  </div>
                </>
              )}
              <button onClick={startNew}
                className="w-full py-3.5 rounded-[8px] text-body font-semibold"
                style={{ background: 'var(--hover-bg)', color: 'var(--text-2)', border: '1px solid var(--divider)' }}>
                + เป็นลูกค้าใหม่ ไม่ตรงกับรายชื่อข้างบน
              </button>
            </>
          )}

          {!searching && !search.trim() && (
            <p className="text-center text-label py-8" style={t3}>พิมพ์ชื่อหรือเบอร์เพื่อเริ่ม</p>
          )}
        </div>
      )}

      {step === 'form' && (
        <div className="p-4 space-y-4">
          <button onClick={() => setStep('search')} className="text-label flex items-center gap-1" style={{ color: 'var(--accent-blue)' }}>
            <ArrowLeft size={14} /> กลับไปค้นหา
          </button>

          {existing && (
            <div className="p-3 rounded-[8px]" style={{ background: 'color-mix(in srgb, var(--accent-blue) 10%, transparent)' }}>
              <p className="text-label" style={{ color: 'var(--accent-blue)' }}>
                ลูกค้ารายเดิม — งานนี้จะถูกเพิ่มใต้ระเบียนเดิม ไม่สร้างลูกค้าซ้ำ
              </p>
            </div>
          )}

          <div>
            <label className="text-label block mb-1.5" style={t3}>ชื่อลูกค้า</label>
            <input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })}
              disabled={!!existing}
              className="w-full rounded-[8px] px-4 py-3 focus:outline-none disabled:opacity-60"
              style={sheetInputStyle} />
          </div>

          <div>
            <label className="text-label block mb-1.5" style={t3}>เบอร์โทร</label>
            <input value={form.phone} onChange={e => setForm({ ...form, phone: e.target.value })}
              inputMode="tel" placeholder="ไม่ใส่ก็ได้"
              className="w-full rounded-[8px] px-4 py-3 focus:outline-none"
              style={sheetInputStyle} />
          </div>

          <div>
            <label className="text-label block mb-1.5" style={t3}>โครงการ</label>
            <select value={form.projectId} onChange={e => setForm({ ...form, projectId: e.target.value })}
              className="w-full rounded-[8px] px-4 py-3 focus:outline-none"
              style={sheetInputStyle}>
              <option value="">— เลือกโครงการ —</option>
              {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </div>

          <div>
            <label className="text-label block mb-1.5" style={t3}>เลขห้อง</label>
            <input value={form.room} onChange={e => setForm({ ...form, room: e.target.value })}
              placeholder="เช่น A1203"
              className="w-full rounded-[8px] px-4 py-3 focus:outline-none"
              style={sheetInputStyle} />
          </div>

          <div>
            <label className="text-label block mb-1.5" style={t3}>มูลค่างานโดยประมาณ (รวม VAT)</label>
            <MoneyInput value={form.value ? String(form.value) : ''}
              onChange={v => setForm({ ...form, value: Number(v) || 0 })}
              ariaLabel="มูลค่างานโดยประมาณ" className={sheetInput.replace('pl-9', 'px-4')} style={sheetInputStyle} />
            <p className="text-micro mt-1.5" style={t3}>ใส่คร่าวๆ ได้ ตัวเลขจริงจะยืนยันอีกครั้งตอนบันทึกจอง</p>
          </div>

          {err && (
            <div className="p-3 rounded-[8px]" style={{ background: 'color-mix(in srgb, var(--accent-red) 10%, transparent)' }}>
              <p className="text-label" style={{ color: 'var(--accent-red)' }}>{err}</p>
            </div>
          )}

          <button onClick={save} disabled={saving}
            className="w-full py-4 disabled:opacity-40 text-white font-semibold rounded-[8px] text-body"
            style={{ background: 'var(--accent-blue)' }}>
            {saving ? 'กำลังบันทึก...' : 'สร้างงาน'}
          </button>
          <p className="text-micro text-center" style={t3}>บันทึกเป็นสถานะ "สนใจ" และใส่ชื่อคุณเป็นผู้ดูแลอัตโนมัติ</p>
        </div>
      )}
    </Sheet>
  )
}

// ─── บันทึกจอง ─────────────────────────────────────────────
/** The instalment the seller is actually chasing after a booking, by name. */
const FIRST_50 = 'ชำระ 50% แรก เริ่มงาน'

/** How long the 50% instalment gets before it is due. 60 days is the house
 *  default; the others are there because a room waiting on transfer from the
 *  developer cannot be held to the same clock. */
const DUE_DAY_CHOICES = [30, 45, 60, 90, 180]
const DUE_DAY_DEFAULT = 60

/**
 * Turns an interested prospect into a booked job in one save.
 *
 * Doing it in the normal screens takes two trips: move the stage to จอง, then
 * open the payment plan and build it by hand. That gap is where the deals sit —
 * 123 of the 161 booked jobs in the system have a deposit row and nothing else,
 * so the seller who wants to collect the 50% has no instalment to collect
 * against and the job never moves.
 *
 * So this writes all three at once: the plan, the deposit as received, and the
 * stage. The instalment shapes come from lib/paymentPlans — there used to be a
 * fourth copy of that maths in this file, and its plan C split the remainder
 * after the deposit instead of taking 50% of the job, which is how 13 of 52
 * plan-C jobs ended up the wrong shape.
 */
function BookingSheet({ open, onClose, myId, onSaved }: {
  open: boolean; onClose: () => void; myId: string | null; onSaved: () => void
}) {
  const supabase = createClient()
  const [step, setStep] = useState<'pick' | 'form'>('pick')
  const [list, setList] = useState<any[]>([])
  const [loading, setLoading] = useState(false)
  const [search, setSearch] = useState('')
  const [job, setJob] = useState<any | null>(null)
  const [value, setValue] = useState(0)
  const [deposit, setDeposit] = useState(0)
  const [paidDate, setPaidDate] = useState('')
  const [dueDays, setDueDays] = useState(DUE_DAY_DEFAULT)
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState('')

  useEffect(() => { setPaidDate(todayStr()) }, [])

  useEffect(() => {
    if (!open) return
    setLoading(true)
    ;(async () => {
      // Prospect stages only. A job that is already booked has a plan; sending
      // it through here again would write a second one.
      let q = supabase.from('jobs')
        .select('id, customer_id, customer_name, room_no, revenue_inc_vat, crm_stage, project_id, projects(name)')
        .in('crm_stage', ['new', 'interested', 'quoted', 'close_pending'])
        .or('working_status.neq.ยกเลิก,working_status.is.null')
      if (myId) q = q.eq('sales_id', myId)
      const { data } = await q.limit(200)
      setList(sortByName(data as any))
      setLoading(false)
    })()
  }, [open, myId])

  function pick(j: any) {
    setJob(j)
    setValue(Number(j.revenue_inc_vat) || 0)
    setDeposit(0)
    setDueDays(DUE_DAY_DEFAULT)
    setErr('')
    setStep('form')
  }

  function reset() {
    setStep('pick'); setJob(null); setSearch(''); setValue(0); setDeposit(0)
    setDueDays(DUE_DAY_DEFAULT); setErr('')
  }
  function closeAll() { reset(); onClose() }

  const plan = value > 0 ? calcB2CInstallments('C', value, deposit) : []

  async function save() {
    if (!job) return
    if (value <= 0) { setErr('กรุณาใส่มูลค่างาน'); return }
    if (deposit <= 0) { setErr('กรุณาใส่ยอดมัดจำที่รับมา'); return }
    if (deposit >= value) { setErr('ยอดมัดจำต้องน้อยกว่ามูลค่างาน'); return }
    setSaving(true); setErr('')
    try {
      const { count } = await supabase.from('payments')
        .select('*', { count: 'exact', head: true }).eq('job_id', job.id)
      if (count && count > 0) throw new Error('งานนี้มีงวดชำระอยู่แล้ว กรุณาใช้ปุ่มบันทึกรับเงินแทน')

      const due = daysFromToday(dueDays)
      const rows = plan.map(p => ({
        // payments.id has no default — the row is rejected without one. Same
        // shape the other plan-setup screens use, so the ids stay comparable.
        id: `PAY-${job.id}-${p.no}`,
        job_id: job.id,
        // Denormalised onto the payment by the rest of the app; keep them in
        // step or this job's instalments look different from every other one.
        customer_id: job.customer_id ?? null,
        project_id: job.project_id ?? null,
        room: job.room_no ?? null,
        installment_no: p.no,
        installment_name: p.name,
        amount: p.amount,
        percentage: p.pct,
        is_work_trigger: p.trigger,
        is_final: p.final,
        // Only the 50% instalment gets a date. The deposit is already in hand,
        // and the final one falls due on handover, which has no date yet.
        due_date: p.name === FIRST_50 ? due : null,
        // The deposit is being received right now; the rest is outstanding.
        status: p.no === 1 ? 'paid' : 'pending',
        paid_date: p.no === 1 ? paidDate : null,
        paid_amount: p.no === 1 ? p.amount : null,
      }))
      const { error: payErr } = await supabase.from('payments').insert(rows)
      if (payErr) throw new Error(payErr.message)

      const { error: jobErr } = await supabase.from('jobs').update({
        revenue_inc_vat: value,
        revenue_ex_vat: Math.round((value / 1.07) * 100) / 100,
        crm_stage: 'booked',
        working_status: 'จอง',
        payment_plan_type: 'C',
        order_date: paidDate,
        ...(myId ? { sales_id: myId } : {}),
      }).eq('id', job.id)
      if (jobErr) throw new Error(jobErr.message)

      onSaved()
      closeAll()
    } catch (e: any) {
      setErr(e?.message || 'บันทึกไม่สำเร็จ')
    } finally {
      setSaving(false)
    }
  }

  const filtered = list.filter(j =>
    !search || (j.customer_name || '').toLowerCase().includes(search.toLowerCase()) ||
    normRoom(j.room_no || '').includes(normRoom(search)))

  return (
    <Sheet open={open} onClose={closeAll} title="บันทึกจอง" icon={BadgeCheck}>
      {step === 'pick' && (
        <div className="p-4">
          <div className="relative mb-4">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2" style={t3} />
            <input autoFocus value={search} onChange={e => setSearch(e.target.value)}
              placeholder="ชื่อลูกค้า / ห้อง..."
              className={sheetInput} style={sheetInputStyle} />
          </div>
          {loading ? <div className="py-8 flex justify-center"><Spinner /></div> : (
            <div className="space-y-2">
              {filtered.slice(0, 20).map(j => (
                <button key={j.id} onClick={() => pick(j)}
                  className="w-full flex items-center justify-between px-4 py-3.5 rounded-[8px] text-left"
                  style={sheetCard}>
                  <div className="min-w-0">
                    <p className="font-semibold text-body truncate" style={t1}>{j.customer_name || '—'}</p>
                    <p className="text-label truncate" style={t2}>
                      {j.room_no || '—'}{(j.projects as any)?.name ? ' · ' + (j.projects as any).name : ''}
                    </p>
                  </div>
                  <span className="badge badge-blue flex-shrink-0 ml-2">{crmStage(j.crm_stage).label}</span>
                </button>
              ))}
              {filtered.length === 0 && (
                <EmptyState message="ไม่มีลูกค้าที่ยังไม่จองในความดูแลของคุณ" />
              )}
            </div>
          )}
        </div>
      )}

      {step === 'form' && job && (
        <div className="p-4 space-y-4">
          <button onClick={() => setStep('pick')} className="text-label flex items-center gap-1" style={{ color: 'var(--accent-blue)' }}>
            <ArrowLeft size={14} /> เลือกลูกค้าอื่น
          </button>
          <div>
            <p className="font-semibold text-body" style={t1}>{job.customer_name || '—'}</p>
            <p className="text-label" style={t2}>{job.room_no || '—'}{(job.projects as any)?.name ? ' · ' + (job.projects as any).name : ''}</p>
          </div>

          <div>
            <label className="text-label block mb-1.5" style={t3}>มูลค่างาน (รวม VAT)</label>
            <MoneyInput value={value ? String(value) : ''} onChange={v => setValue(Number(v) || 0)}
              ariaLabel="มูลค่างาน" className="w-full rounded-[8px] px-4 py-3 focus:outline-none" style={sheetInputStyle} />
            <p className="text-micro mt-1.5" style={t3}>ตัวเลขนี้คือยอดยืนยันจริง จะทับค่าที่ใส่ไว้ตอนสร้างงาน</p>
          </div>

          <div>
            <label className="text-label block mb-1.5" style={t3}>ยอดมัดจำที่รับมา</label>
            <MoneyInput value={deposit ? String(deposit) : ''} onChange={v => setDeposit(Number(v) || 0)}
              ariaLabel="ยอดมัดจำ" className="w-full rounded-[8px] px-4 py-3 focus:outline-none" style={sheetInputStyle} />
          </div>

          <div>
            <label className="text-label block mb-1.5" style={t3}>วันที่รับมัดจำ</label>
            <DateInput value={paidDate} onChange={e => setPaidDate(e.target.value)} />
          </div>

          <div>
            <label className="text-label block mb-2" style={t3}>งวด 50% ครบกำหนดในอีก</label>
            <div className="grid grid-cols-5 gap-1.5">
              {DUE_DAY_CHOICES.map(d => (
                <button key={d} onClick={() => setDueDays(d)}
                  className="py-2.5 rounded-[8px] text-label font-bold"
                  style={dueDays === d
                    ? { background: 'var(--accent)', color: '#fff' }
                    : { background: 'var(--hover-bg)', color: 'var(--text-2)', border: '1px solid var(--divider)' }}>
                  {d} วัน
                </button>
              ))}
            </div>
            <p className="text-micro mt-1.5" style={t3}>ครบกำหนด {fmtDate(daysFromToday(dueDays))}</p>
          </div>

          {plan.length > 0 && (
            <div className="p-3 rounded-[8px]" style={sheetCard}>
              <p className="text-micro font-bold uppercase tracking-widest mb-2" style={t3}>แผนที่จะสร้าง (แผน C)</p>
              {plan.map(p => (
                <div key={p.no} className="flex items-center justify-between py-1">
                  <span className="text-label" style={t2}>{p.no}. {p.name}</span>
                  <span className="text-label font-semibold" style={p.no === 1 ? { color: 'var(--accent-green)' } : t1}>
                    {fmtBaht(p.amount)}{p.no === 1 ? ' · รับแล้ว' : ''}
                  </span>
                </div>
              ))}
            </div>
          )}

          {err && (
            <div className="p-3 rounded-[8px]" style={{ background: 'color-mix(in srgb, var(--accent-red) 10%, transparent)' }}>
              <p className="text-label" style={{ color: 'var(--accent-red)' }}>{err}</p>
            </div>
          )}

          <button onClick={save} disabled={saving}
            className="w-full py-4 disabled:opacity-40 text-white font-semibold rounded-[8px] text-body"
            style={{ background: 'var(--accent)' }}>
            {saving ? 'กำลังบันทึก...' : 'บันทึกจอง + ตั้งงวด'}
          </button>
          <p className="text-micro text-center" style={t3}>สร้างงวดครบ 3 งวด · ลงรับเงินมัดจำ · เปลี่ยนสถานะเป็นจอง ในครั้งเดียว</p>
        </div>
      )}
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
        // `customers.status` no longer exists — a person has no status, their
        // orders do, and the stage moved to jobs.crm_stage. The filter was left
        // behind pointing at the dropped column, so PostgREST rejected this
        // whole query and Quick Mode search returned no customers at all, only
        // jobs. Dropped rather than rewritten: a customer whose orders are all
        // closed is still someone you would want to find by name here.
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
    setResults(merged.sort((a, b) => compareThai(a.name, b.name)))
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
                  <p className="text-xs mt-1" style={t2}>{r.room} · {r.projectName}</p>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-micro px-2 py-0.5 rounded-[8px] font-semibold"
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
          <div className="rounded-[8px] p-4 mb-4" style={sheetCard}>
            <p className="font-semibold text-sm mb-1" style={t1}>{selected.name}</p>
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
  const [overview, setOverview] = useState<Overview | null>(null)
  const [seller, setSeller] = useState(true)
  const [myId, setMyId] = useState<string | null>(null)
  const [scope, setScope] = useState<'mine' | 'all'>('all')
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

  /**
   * Who is looking, and whether they should see their own figures or everyone's.
   *
   * A seller (`sales`/`staff` — six people) is always scoped to their own jobs;
   * that is the whole point of the cards. Anyone else — the two sales managers,
   * the executives, the admins — owns few jobs or none, so scoping to them
   * would show a page of ฿0. They get the company's figures and a toggle back
   * to their own, because one admin (Areeruk.y) does carry a couple of jobs.
   */
  const loadMe = useCallback(async (): Promise<{ id: string; seller: boolean } | null> => {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user?.email) return null
    const { data } = await supabase.from('users').select('id, role, level').eq('email', user.email).maybeSingle()
    if (!data) return null
    return { id: data.id, seller: data.role === 'sales' && data.level === 'staff' }
  }, [supabase])

  /** `salesId` null = every seller's jobs, for managers and admins. */
  const loadOverview = useCallback(async (salesId: string | null) => {
    const thisMonth = monthStart(0)
    const prevMonth = monthStart(1)

    // Both tables are at or past PostgREST's 1,000-row cap, which truncates
    // without erroring — a plain select would quietly under-count.
    const [{ data: myJobs }, { data: myPays }] = await Promise.all([
      fetchAllRows<any>(() => {
        let q = supabase.from('jobs')
          .select('id, revenue_inc_vat, order_date, actual_deliver_date, crm_stage, working_status')
          // `.neq()` alone drops NULL rows silently, and a prospect's
          // working_status is NULL — they would vanish from the gap figure.
          .or('working_status.neq.ยกเลิก,working_status.is.null')
        if (salesId) q = q.eq('sales_id', salesId)
        return q.order('id')
      }),
      fetchAllRows<any>(() => {
        let q = supabase.from('payments')
          .select('job_id, amount, paid_amount, voucher_amount, status, paid_date, jobs!inner(sales_id)')
          .eq('status', 'paid')
        if (salesId) q = q.eq('jobs.sales_id', salesId)
        return q.order('id')
      }),
    ])

    const settled: Record<string, number> = {}
    let cashValue = 0, cashPrev = 0
    for (const p of myPays || []) {
      if (p.job_id) settled[p.job_id] = (settled[p.job_id] || 0) + settledAmount(p.paid_amount, p.amount, p.voucher_amount)
      const cash = Number(p.paid_amount) || 0
      if (p.paid_date >= thisMonth) cashValue += cash
      else if (p.paid_date >= prevMonth) cashPrev += cash
    }

    const o: Overview = {
      soldValue: 0, soldN: 0, soldPrev: 0,
      delivValue: 0, delivN: 0, delivPrev: 0,
      cashValue, cashPrev, gapValue: 0, gapN: 0,
    }
    for (const j of myJobs || []) {
      const rev = Number(j.revenue_inc_vat) || 0
      if (j.order_date >= thisMonth) { o.soldValue += rev; o.soldN++ }
      else if (j.order_date >= prevMonth) o.soldPrev += rev
      if (j.actual_deliver_date >= thisMonth) { o.delivValue += rev; o.delivN++ }
      else if (j.actual_deliver_date >= prevMonth) o.delivPrev += rev
      // ② from lib/salesScorecard — a booked customer still short of 50%.
      // The ฿100 floor is there because instalments are percentage splits, so a
      // job can sit a few satang short of its own value and read as money owed.
      const gap = rev * 0.5 - (settled[j.id] || 0)
      if (j.crm_stage === 'booked' && gap >= 100) { o.gapValue += gap; o.gapN++ }
    }
    setOverview(o)
  }, [supabase])

  const load = useCallback(async () => {
    setLoading(true)
    const me = await loadMe()
    // A seller sees their own; everyone else opens on the company total. The
    // toggle below re-runs this for the non-seller who wants their own back.
    if (me) { setSeller(me.seller); setMyId(me.id); loadOverview(me.seller ? me.id : null) }
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
  }, [supabase, loadMe, loadOverview])

  useEffect(() => { load() }, [load])

  /**
   * The event whose banner is showing, if any.
   *
   * `events` holds a date, not a status, so "on now" is a window around today.
   * Two days either side: a booth usually runs a weekend, and someone entering
   * the customers they met on Sunday evening should still see it on Monday.
   */
  const liveEvent = useMemo(() => {
    const day = 86400000
    const today = new Date(todayStr()).getTime()
    return activeEvents.find(e => {
      if (!e.eventDate) return false
      const d = new Date(e.eventDate).getTime()
      return Math.abs(d - today) <= EVENT_BANNER_DAYS * day
    }) ?? null
  }, [activeEvents])

  /** Managers and admins only — a seller has no toggle to move. */
  useEffect(() => {
    if (!myId || seller) return
    loadOverview(scope === 'mine' ? myId : null)
  }, [scope, myId, seller, loadOverview])

  /**
   * Eight buttons in two rows, ordered by what a seller actually does.
   *
   * The old grid held twelve and opened with a whole row of lookups — Job
   * Registry, Prospects, ลูกค้า Event, Origin Pool — while the most-used action
   * in the app sat on the second row. Measured over the four weeks to
   * 2026-09-14, by rows written: recording a payment 35–149 a week, attaching a
   * file 31–78, recording a delivery 15–25, opening a job 3–19, adding a
   * customer 3–8.
   *
   * Gone from the grid, and why:
   *   อัปเดตสถานะงาน — working_status moves on its own now (owner's call)
   *   My Deals       — jumps out to a desktop page, against the point of this mode
   *   หน้าหลัก        — now the full-width row under the grid
   *   Job Registry / Prospects — folded into ติดตามลูกค้า
   *   Commission     — second tab of เช็คยอดเงิน
   *   ลูกค้า Event    — a banner that appears only while an event is on; it was
   *                    used 0 times in 28 days and then 88 times in one day
   *   งานเกินกำหนด    — late *work*, not late money; the Overview covers what
   *                    needs chasing and the owner dropped this one
   *
   * Labels are at most two lines of seven Thai characters: a 375px screen
   * leaves each cell ~76px, and ~52px of that is text.
   */
  type Btn = { key: string; icon: LucideIcon; label: string; iconColor: string; btnStyle: React.CSSProperties; badge?: number; sheet?: string; href?: string }

  const TILE: React.CSSProperties = { background: 'var(--card-bg)', borderColor: 'var(--divider)' }
  const BUTTONS: Btn[] = [
    { key: 'pay',      icon: Receipt,        label: 'บันทึก\nรับเงิน',  iconColor: 'var(--accent-orange)', btnStyle: TILE, badge: widgets.pendingInstallments, sheet: 'pay' },
    { key: 'docs',     icon: FileText,       label: 'ไฟล์แนบ\nลูกค้า', iconColor: 'var(--accent-purple)', btnStyle: TILE, sheet: 'docs' },
    { key: 'deliver',  icon: ArrowRightLeft, label: 'บันทึก\nส่งมอบ',  iconColor: 'var(--accent-green)',  btnStyle: TILE, badge: widgets.readyToDeliver, sheet: 'deliver' },
    { key: 'newjob',   icon: Plus,           label: 'สร้างงาน\nใหม่',  iconColor: 'var(--accent-blue)',   btnStyle: TILE, sheet: 'newjob' },
    // 'booking' — บันทึกจอง — is built and tested but deliberately not on the
    // grid yet. It sets plan C only, and the owner is still deciding how the
    // other plans (A, B and the B2B shapes) should reach a phone, since a B2B
    // job also has to pass through จอง before its instalments can be set. The
    // sheet stays in the file rather than being deleted and rewritten; put the
    // tile back here once that is settled.
    { key: 'follow',   icon: Users,          label: 'ติดตาม\nลูกค้า',  iconColor: 'var(--accent)',        btnStyle: TILE, sheet: 'follow' },
    { key: 'balance',  icon: DollarSign,     label: 'เช็ค\nยอดเงิน',   iconColor: 'var(--accent-orange)', btnStyle: TILE, sheet: 'balance' },
    { key: 'lookup',   icon: Database,       label: 'Origin\nPool',     iconColor: 'var(--accent-blue)',   btnStyle: TILE, sheet: 'lookup' },
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
        <p className="text-sm mt-1" style={{ color: 'var(--text-3)' }}>{todayTH}</p>
      </div>

      {/* ── Overview ── */}
      <div className="px-5 mb-6">
        <div className="flex items-center justify-between mb-4">
          <p className="text-micro font-bold uppercase tracking-widest" style={{ color: 'var(--text-3)' }}>Overview</p>
          {!seller && (
            <div className="flex rounded-[8px] overflow-hidden" style={{ border: '1px solid var(--divider)' }}>
              {([['all', 'ทั้งบริษัท'], ['mine', 'ของฉัน']] as const).map(([v, label]) => (
                <button key={v} onClick={() => setScope(v)} className="px-3 py-1.5 text-label font-bold"
                  style={scope === v
                    ? { background: 'var(--accent)', color: '#fff' }
                    : { background: 'transparent', color: 'var(--text-3)' }}>
                  {label}
                </button>
              ))}
            </div>
          )}
        </div>
        {loading ? (
          <>
            <div className="h-24 rounded-[18px] animate-pulse mb-3" style={{ background: 'var(--card-bg)', border: '1px solid var(--card-border)' }} />
            <div className="h-24 rounded-[18px] animate-pulse" style={{ background: 'var(--card-bg)', border: '1px solid var(--card-border)' }} />
          </>
        ) : (
          <>
            {/* Three figures for "how am I doing this month". One strip, hairline
                dividers — they are read together, so they are one object, not
                three cards competing with the one below that has work in it.

                Every slot carries a count and last month's figure: mid-September,
                three of seven sellers are still on ฿0 for sales and three on ฿0
                for deliveries. A bare zero reads as a broken page; "฿0 · เดือนก่อน
                ฿283K" reads as a month that has not started. */}
            {/* The fourth figure is the only one you can act on: booked
                customers who paid a deposit but have not reached 50%.
                It has no tap target yet — the list it should open is the
                "ติดตามลูกค้า" sheet, still being specified, and a control that
                opens nothing is worse than a figure that plainly reads. */}
            <div className="qm-overview ds-card ds-card-flush">
              {[
                { label: 'ยอดขาย', value: overview?.soldValue ?? 0, n: overview?.soldN ?? 0, prev: overview?.soldPrev ?? 0, tone: 'var(--accent)', sub: null as string | null },
                { label: 'ยอดส่งมอบ', value: overview?.delivValue ?? 0, n: overview?.delivN ?? 0, prev: overview?.delivPrev ?? 0, tone: 'var(--accent-green)', sub: null as string | null },
                { label: 'เงินสดรับ', value: overview?.cashValue ?? 0, n: null, prev: overview?.cashPrev ?? 0, tone: 'var(--accent-blue)', sub: null as string | null },
                { label: 'โอกาสเก็บเงินถึง 50%', value: overview?.gapValue ?? 0, n: null, prev: 0, tone: 'var(--accent-orange)',
                  sub: `${overview?.gapN ?? 0} งานที่เก็บได้แค่งวดมัดจำจองสิทธิ์` as string | null },
              ].map(c => (
                <div key={c.label}>
                  <p className="text-label" style={{ color: 'var(--text-3)' }}>{c.label}</p>
                  <p className="text-kpi-money mt-0.5" style={{ color: c.tone }}>{fmtBaht(c.value)}</p>
                  <p className="text-micro mt-1" style={{ color: 'var(--text-3)' }}>
                    {c.sub ?? <>{c.n !== null && `${c.n} งาน · `}เดือนก่อน {fmtBaht(c.prev)}</>}
                  </p>
                </div>
              ))}
            </div>
          </>
        )}
      </div>

      {/* ── Divider ── */}
      <div className="mx-5 mb-6" style={{ height: 1, background: 'linear-gradient(to right, transparent, var(--divider) 20%, var(--divider) 80%, transparent)' }} />

      {/* ── Event banner — only while an event is on ──
          Adding customers at a booth is the one thing here that is not a daily
          job: zero uses in 28 days, then 88 in a single day. A permanent tile
          spends a slot on that; a banner spends nothing and is larger than a
          tile on the day it matters. */}
      {liveEvent && (
        <div className="px-5 mb-6">
          <button onClick={() => setOpenSheet('event')}
            className="w-full ds-card flex items-center gap-3 text-left active:scale-[0.99] transition-transform"
            style={{ borderColor: 'color-mix(in srgb, var(--accent-green) 40%, transparent)', background: 'color-mix(in srgb, var(--accent-green) 8%, var(--card-bg))' }}>
            <CalendarDays size={22} style={{ color: 'var(--accent-green)', flexShrink: 0 }} />
            <div className="min-w-0 flex-1">
              <p className="text-body font-bold truncate" style={{ color: 'var(--text-1)' }}>{liveEvent.eventName}</p>
              <p className="text-label truncate" style={{ color: 'var(--text-3)' }}>{liveEvent.projectName} · แตะเพื่อเพิ่มลูกค้า</p>
            </div>
            <ChevronRight size={18} style={{ color: 'var(--text-3)', flexShrink: 0 }} />
          </button>
        </div>
      )}

      {/* ── Quick Menu — 2 rows of 4 ── */}
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

        {/* Leaving Quick Mode is not a ninth function, so it does not look like
            one: no card fill, just a rule around it, and it says where it goes
            rather than showing a house. It sits last because that is where you
            are when you have finished. */}
        <button onClick={() => router.push('/dashboard')}
          className="w-full mt-2.5 flex items-center justify-center gap-2 rounded-[18px] border transition-all active:scale-[0.99]"
          style={{ minHeight: 56, background: 'transparent', borderColor: 'var(--divider)', color: 'var(--text-2)' }}>
          <ArrowLeft size={16} />
          <span className="text-body font-bold">ไปหน้าหลัก</span>
        </button>
      </div>

      {/* Sheets */}
      <OriginPoolSheet open={openSheet === 'lookup'} onClose={() => setOpenSheet(null)} />
      <WydeClientsSheet open={openSheet === 'clients'} onClose={() => setOpenSheet(null)} />
      {/* ติดตามลูกค้า — still the Prospects sheet while the two groups
          ("ของฉัน" / "ยังไม่มีเจ้าของ") are being built onto it. */}
      <ProspectsSheet open={openSheet === 'follow'} onClose={() => setOpenSheet(null)} />
      <EventAddSheet open={openSheet === 'event'} onClose={() => setOpenSheet(null)} events={activeEvents} />
      <QuickPaySheet open={openSheet === 'pay'} onClose={() => { setOpenSheet(null); load() }} jobs={allJobs} />
      <DeliverSheet open={openSheet === 'deliver'} onClose={() => { setOpenSheet(null); load() }} jobs={allJobs} />
      <QuickHandoverSheet open={openSheet === 'handover'} onClose={() => { setOpenSheet(null); load() }} jobs={allJobs} />
      <OverdueSheet open={openSheet === 'overdue'} onClose={() => setOpenSheet(null)} />
      <BalanceSheet open={openSheet === 'balance'} onClose={() => setOpenSheet(null)} jobs={allJobs} />
      <NewJobSheet open={openSheet === 'newjob'} onClose={() => setOpenSheet(null)} myId={myId} onCreated={load} />
      <BookingSheet open={openSheet === 'booking'} onClose={() => setOpenSheet(null)} myId={myId} onSaved={load} />
      <DocumentsSheet open={openSheet === 'docs'} onClose={() => setOpenSheet(null)} />
    </div>
  )
}

