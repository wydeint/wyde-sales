'use client'

import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Bell, AlertCircle, ShieldAlert, X, Home, Banknote, BookMarked } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'

interface OverduePayment {
  id: string; customer_name: string; room_no: string; amount: number; due_date: string; days_overdue: number
}
interface ExpiringWarranty {
  id: string; customer_name: string; room_no: string; warranty_end: string; days_left: number
}
interface HandoverItem {
  id: string; customer_name: string; room_no: string; handover_date: string; isToday: boolean
}
interface BookingItem {
  id: string; customer_name: string; room_no: string; updated_at: string; isToday: boolean
}
interface PaidItem {
  id: string; customer_name: string; room_no: string; amount: number; paid_date: string; isToday: boolean
}

export default function NotificationBell() {
  const supabase = createClient()
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [overduePayments, setOverduePayments] = useState<OverduePayment[]>([])
  const [expiringWarranties, setExpiringWarranties] = useState<ExpiringWarranty[]>([])
  const [handovers, setHandovers] = useState<HandoverItem[]>([])
  const [bookings, setBookings] = useState<BookingItem[]>([])
  const [paidToday, setPaidToday] = useState<PaidItem[]>([])
  const ref = useRef<HTMLDivElement>(null)

  const today = new Date().toISOString().slice(0, 10)
  const thirtyDaysLater = new Date(Date.now() + 30 * 864e5).toISOString().slice(0, 10)
  const sevenDaysAgo = new Date(Date.now() - 7 * 864e5).toISOString().slice(0, 10)

  useEffect(() => {
    async function fetchAlerts() {
      const [
        { data: payments },
        { data: warranties },
        { data: handoverData },
        { data: bookingData },
        { data: paidData },
      ] = await Promise.all([
        // Overdue payments
        supabase.from('payments')
          .select('id, amount, due_date, jobs(customer_name, room_no)')
          .neq('status', 'paid').not('due_date', 'is', null).lt('due_date', today)
          .order('due_date', { ascending: true }).limit(10),

        // Expiring warranties (30 days)
        supabase.from('warranties')
          .select('id, room, warranty_end, customers(customer_name)')
          .not('warranty_end', 'is', null).gte('warranty_end', today).lte('warranty_end', thirtyDaysLater)
          .order('warranty_end', { ascending: true }).limit(10),

        // Handovers: today first, fallback to last 7 days
        supabase.from('customers')
          .select('id, customer_name, room_no, handover_date')
          .not('handover_date', 'is', null)
          .gte('handover_date', sevenDaysAgo)
          .lte('handover_date', today)
          .order('handover_date', { ascending: false }).limit(10),

        // Bookings: updated to 'booked' today first, fallback 7 days
        supabase.from('customers')
          .select('id, customer_name, room_no, updated_at')
          .eq('status', 'booked')
          .gte('updated_at', sevenDaysAgo + 'T00:00:00+00:00')
          .order('updated_at', { ascending: false }).limit(10),

        // Paid payments: today first, fallback 7 days
        supabase.from('payments')
          .select('id, amount, paid_date, jobs(customer_name, room_no)')
          .eq('status', 'paid').not('paid_date', 'is', null)
          .gte('paid_date', sevenDaysAgo)
          .lte('paid_date', today)
          .order('paid_date', { ascending: false }).limit(10),
      ])

      setOverduePayments((payments || []).map((p: any) => ({
        id: p.id,
        customer_name: p.jobs?.customer_name || '—',
        room_no: p.jobs?.room_no || '—',
        amount: p.amount,
        due_date: p.due_date,
        days_overdue: Math.floor((Date.now() - new Date(p.due_date).getTime()) / 864e5),
      })))

      setExpiringWarranties((warranties || []).map((w: any) => ({
        id: w.id,
        customer_name: w.customers?.customer_name || '—',
        room_no: w.room || '—',
        warranty_end: w.warranty_end,
        days_left: Math.floor((new Date(w.warranty_end).getTime() - Date.now()) / 864e5),
      })))

      setHandovers((handoverData || []).map((h: any) => ({
        id: h.id, customer_name: h.customer_name, room_no: h.room_no || '—',
        handover_date: h.handover_date, isToday: h.handover_date === today,
      })))

      setBookings((bookingData || []).map((b: any) => ({
        id: b.id, customer_name: b.customer_name, room_no: b.room_no || '—',
        updated_at: b.updated_at, isToday: b.updated_at?.slice(0, 10) === today,
      })))

      setPaidToday((paidData || []).map((p: any) => ({
        id: p.id,
        customer_name: p.jobs?.customer_name || '—',
        room_no: p.jobs?.room_no || '—',
        amount: p.amount,
        paid_date: p.paid_date,
        isToday: p.paid_date === today,
      })))
    }
    fetchAlerts()
  }, [])

  const dropdownRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      const t = e.target as Node
      if (ref.current && !ref.current.contains(t) && dropdownRef.current && !dropdownRef.current.contains(t)) setOpen(false)
    }
    if (open) document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [open])

  // Badge count: urgent items only (overdue) + today events
  const urgentCount = overduePayments.length
  const todayCount = handovers.filter(h => h.isToday).length + bookings.filter(b => b.isToday).length + paidToday.filter(p => p.isToday).length
  const total = urgentCount + todayCount

  const fmtDate = (d: string) => new Date(d).toLocaleDateString('th-TH', { day: '2-digit', month: 'short' })
  const fmtBaht = (n: number) => '฿' + Math.round(n).toLocaleString()

  function SectionHeader({ icon, label, count, color, bg }: { icon: React.ReactNode; label: string; count: number; color: string; bg: string }) {
    return (
      <div className="px-4 py-2 flex items-center gap-1.5" style={{ borderBottom: '1px solid var(--divider)', background: bg }}>
        <span style={{ color }}>{icon}</span>
        <span className="text-[10px] font-bold uppercase tracking-wider" style={{ color }}>{label} ({count})</span>
      </div>
    )
  }

  function ItemRow({ onClick, name, sub, right, rightColor }: { onClick: () => void; name: string; sub: string; right: string; rightColor?: string }) {
    return (
      <button onClick={onClick} className="w-full text-left px-4 py-2.5 transition-colors"
        style={{ borderBottom: '1px solid var(--divider)' }}
        onMouseEnter={e => (e.currentTarget.style.background = 'var(--hover-bg)')}
        onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}>
        <div className="flex justify-between items-start gap-2">
          <div className="min-w-0">
            <p className="text-xs font-semibold truncate" style={{ color: 'var(--text-1)' }}>{name}</p>
            <p className="text-[10px]" style={{ color: 'var(--text-3)' }}>{sub}</p>
          </div>
          <span className="text-[10px] font-semibold flex-shrink-0" style={{ color: rightColor || 'var(--text-3)' }}>{right}</span>
        </div>
      </button>
    )
  }

  const btnRef = useRef<HTMLButtonElement>(null)
  const [dropPos, setDropPos] = useState<{ bottom: number; left: number } | null>(null)

  function openPanel() {
    if (btnRef.current) {
      const r = btnRef.current.getBoundingClientRect()
      const panelW = 320
      const left = Math.min(r.left, window.innerWidth - panelW - 8)
      setDropPos({ bottom: window.innerHeight - r.top + 8, left: Math.max(8, left) })
    }
    setOpen(v => !v)
  }

  return (
    <div ref={ref} className="relative">
      <button
        ref={btnRef}
        onClick={openPanel}
        className="w-7 h-7 flex items-center justify-center rounded-lg flex-shrink-0 relative"
        style={{ color: urgentCount > 0 ? 'var(--accent-red)' : todayCount > 0 ? 'var(--accent)' : 'var(--text-3)' }}
        onMouseEnter={e => (e.currentTarget.style.background = 'var(--hover-bg)')}
        onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
        aria-label="การแจ้งเตือน"
      >
        <Bell size={14} />
        {total > 0 && (
          <span className="absolute -top-0.5 -right-0.5 w-3.5 h-3.5 rounded-full text-[8px] font-bold flex items-center justify-center text-white"
            style={{ background: urgentCount > 0 ? 'var(--accent-red)' : 'var(--accent)' }}>
            {total > 9 ? '9+' : total}
          </span>
        )}
      </button>

      {open && dropPos && typeof document !== 'undefined' && createPortal(
        <div ref={dropdownRef} className="fixed w-80 rounded-[18px] shadow-2xl overflow-hidden z-[9999]"
          style={{ background: 'var(--panel-bg)', border: '1px solid var(--card-border)', backdropFilter: 'blur(20px)', WebkitBackdropFilter: 'blur(20px)', bottom: dropPos.bottom, left: dropPos.left }}>

          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3" style={{ borderBottom: '1px solid var(--divider)' }}>
            <span className="text-sm font-semibold" style={{ color: 'var(--text-1)' }}>การแจ้งเตือน</span>
            {total > 0 && (
              <span className="text-xs px-2 py-0.5 rounded-[4px] font-bold"
                style={{ background: `color-mix(in srgb, ${urgentCount > 0 ? 'var(--accent-red)' : 'var(--accent)'} 15%, transparent)`, color: urgentCount > 0 ? 'var(--accent-red)' : 'var(--accent)' }}>
                {total} รายการ
              </span>
            )}
            <button onClick={() => setOpen(false)} style={{ color: 'var(--text-3)' }}><X size={14} /></button>
          </div>

          <div className="max-h-96 overflow-y-auto">
            {(total === 0 && expiringWarranties.length === 0 && handovers.length === 0 && bookings.length === 0 && paidToday.length === 0) ? (
              <div className="py-8 text-center">
                <Bell size={24} className="mx-auto mb-2" style={{ color: 'var(--text-3)' }} />
                <p className="text-sm" style={{ color: 'var(--text-3)' }}>ไม่มีการแจ้งเตือน</p>
              </div>
            ) : (
              <>
                {/* 1. Overdue Payments — urgent */}
                {overduePayments.length > 0 && (
                  <div>
                    <SectionHeader icon={<AlertCircle size={11} />} label="งวดเกินกำหนด" count={overduePayments.length} color="var(--accent-red)" bg="color-mix(in srgb, var(--accent-red) 5%, transparent)" />
                    {overduePayments.slice(0, 5).map(p => (
                      <ItemRow key={p.id} onClick={() => { router.push('/dashboard/payments'); setOpen(false) }}
                        name={p.customer_name} sub={`${p.room_no} · เกิน ${p.days_overdue} วัน`}
                        right={fmtBaht(p.amount)} rightColor="var(--accent-red)" />
                    ))}
                    {overduePayments.length > 5 && (
                      <button onClick={() => { router.push('/dashboard/payments'); setOpen(false) }}
                        className="w-full text-center py-2 text-xs" style={{ color: 'var(--accent)' }}>
                        ดูทั้งหมด {overduePayments.length} รายการ →
                      </button>
                    )}
                  </div>
                )}

                {/* 2. Paid today / recent */}
                {paidToday.length > 0 && (
                  <div>
                    <SectionHeader icon={<Banknote size={11} />}
                      label={paidToday.some(p => p.isToday) ? 'รายรับวันนี้' : 'รายรับล่าสุด'}
                      count={paidToday.length} color="#3b82f6" bg="color-mix(in srgb, #3b82f6 5%, transparent)" />
                    {paidToday.slice(0, 5).map(p => (
                      <ItemRow key={p.id} onClick={() => { router.push('/dashboard/payments'); setOpen(false) }}
                        name={p.customer_name}
                        sub={`${p.room_no} · ${p.isToday ? 'วันนี้' : fmtDate(p.paid_date)}`}
                        right={fmtBaht(p.amount)} rightColor="#3b82f6" />
                    ))}
                  </div>
                )}

                {/* 3. Bookings today / recent */}
                {bookings.length > 0 && (
                  <div>
                    <SectionHeader icon={<BookMarked size={11} />}
                      label={bookings.some(b => b.isToday) ? 'ลูกค้าจองวันนี้' : 'จองล่าสุด'}
                      count={bookings.length} color="#10b981" bg="color-mix(in srgb, #10b981 5%, transparent)" />
                    {bookings.slice(0, 5).map(b => (
                      <ItemRow key={b.id} onClick={() => { router.push('/dashboard/pipeline'); setOpen(false) }}
                        name={b.customer_name}
                        sub={`${b.room_no} · ${b.isToday ? 'วันนี้' : fmtDate(b.updated_at)}`}
                        right="" />
                    ))}
                  </div>
                )}

                {/* 4. Handovers today / recent */}
                {handovers.length > 0 && (
                  <div>
                    <SectionHeader icon={<Home size={11} />}
                      label={handovers.some(h => h.isToday) ? 'ส่งมอบวันนี้' : 'ส่งมอบล่าสุด'}
                      count={handovers.length} color="#f59e0b" bg="color-mix(in srgb, #f59e0b 5%, transparent)" />
                    {handovers.slice(0, 5).map(h => (
                      <ItemRow key={h.id} onClick={() => { router.push('/dashboard/handover'); setOpen(false) }}
                        name={h.customer_name}
                        sub={`${h.room_no} · ${h.isToday ? 'วันนี้' : fmtDate(h.handover_date)}`}
                        right={h.isToday ? '📅 วันนี้' : fmtDate(h.handover_date)} rightColor="#f59e0b" />
                    ))}
                  </div>
                )}

                {/* 5. Expiring Warranties — lowest priority */}
                {expiringWarranties.length > 0 && (
                  <div>
                    <SectionHeader icon={<ShieldAlert size={11} />} label="ประกันใกล้หมด" count={expiringWarranties.length} color="var(--accent-orange)" bg="color-mix(in srgb, var(--accent-orange) 5%, transparent)" />
                    {expiringWarranties.slice(0, 3).map(w => (
                      <ItemRow key={w.id} onClick={() => { router.push('/dashboard/warranty'); setOpen(false) }}
                        name={w.customer_name} sub={`${w.room_no} · เหลือ ${w.days_left} วัน`}
                        right={fmtDate(w.warranty_end)} />
                    ))}
                    {expiringWarranties.length > 3 && (
                      <button onClick={() => { router.push('/dashboard/warranty'); setOpen(false) }}
                        className="w-full text-center py-2 text-xs" style={{ color: 'var(--accent)' }}>
                        ดูทั้งหมด {expiringWarranties.length} รายการ →
                      </button>
                    )}
                  </div>
                )}
              </>
            )}
          </div>
        </div>,
        document.body
      )}
    </div>
  )
}
