'use client'

import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Bell, X, Home, Banknote } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import { baht } from '@/lib/money'
import { todayStr, daysAgoStr } from '@/lib/today'

interface HandoverItem {
  id: string; customer_name: string; room_no: string; handover_date: string; isToday: boolean
}
interface PaidItem {
  id: string; customer_name: string; room_no: string; paid_amount: number; installment_name: string; paid_date: string; isToday: boolean
}

export default function NotificationBell() {
  const supabase = createClient()
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [handovers, setHandovers] = useState<HandoverItem[]>([])
  const [paidToday, setPaidToday] = useState<PaidItem[]>([])
  const ref = useRef<HTMLDivElement>(null)

  const today = todayStr()
  const sevenDaysAgo = daysAgoStr(7)

  useEffect(() => {
    async function fetchAlerts() {
      const [{ data: handoverData }, { data: paidData }] = await Promise.all([
        // Handovers: today + last 7 days.
        //
        // Read from jobs, not customers. customers.handover_date is NULL on all
        // 936 rows and always has been, so this panel had never once shown a
        // handover — it was querying a column nothing writes to. The room number
        // came from customers.room_no, which is filled on 2 rows; the real one
        // is jobs.room_no.
        supabase.from('jobs')
          .select('id, customer_name, room_no, actual_deliver_date')
          .not('actual_deliver_date', 'is', null)
          .neq('working_status', 'ยกเลิก')
          .gte('actual_deliver_date', sevenDaysAgo)
          .lte('actual_deliver_date', today)
          .order('actual_deliver_date', { ascending: false }).limit(10),

        // Paid payments (booking + installments): today + last 7 days
        supabase.from('payments')
          .select('id, installment_name, paid_amount, voucher_amount, paid_date, jobs(customer_name, room_no)')
          .eq('status', 'paid').not('paid_date', 'is', null)
          .gte('paid_date', sevenDaysAgo)
          .lte('paid_date', today)
          .order('paid_date', { ascending: false }).limit(15),
      ])

      setHandovers((handoverData || []).map((h: any) => ({
        id: h.id, customer_name: h.customer_name || '—', room_no: h.room_no || '—',
        handover_date: h.actual_deliver_date, isToday: h.actual_deliver_date === today,
      })))

      setPaidToday((paidData || []).map((p: any) => ({
        id: p.id,
        customer_name: p.jobs?.customer_name || '—',
        room_no: p.jobs?.room_no || '—',
        paid_amount: p.paid_amount ?? 0,
        installment_name: p.installment_name || 'ชำระเงิน',
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

  // No count. The bell used to show how many of these happened "today", and
  // the number was wrong for the first seven hours of every day because
  // "today" was computed in UTC (see lib/today.ts). That is fixed, but the
  // count was never what the bell was for: it answers "has anything happened",
  // and the list underneath answers "what". A number invites arithmetic that
  // nobody needs and that the panel cannot back up — it holds the last seven
  // days, not today.
  const hasNews = handovers.length > 0 || paidToday.length > 0

  const fmtDate = (d: string) => new Date(d).toLocaleDateString('th-TH', { day: '2-digit', month: 'short' })
  const fmtBaht = baht

  function SectionHeader({ icon, label, color, bg }: { icon: React.ReactNode; label: string; color: string; bg: string }) {
    return (
      <div className="px-4 py-2 flex items-center gap-1.5" style={{ borderBottom: '1px solid var(--divider)', background: bg }}>
        <span style={{ color }}>{icon}</span>
        <span className="text-caption font-bold" style={{ color }}>{label}</span>
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
            <p className="text-micro" style={{ color: 'var(--text-3)' }}>{sub}</p>
          </div>
          <span className="text-micro font-semibold flex-shrink-0" style={{ color: rightColor || 'var(--text-3)' }}>{right}</span>
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
        style={{ color: hasNews ? 'var(--accent)' : 'var(--text-3)' }}
        onMouseEnter={e => (e.currentTarget.style.background = 'var(--hover-bg)')}
        onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
        aria-label={hasNews ? 'การแจ้งเตือน — มีรายการใหม่' : 'การแจ้งเตือน'}
      >
        <Bell size={14} />
        {hasNews && (
          /* A dot, not a number: it says there is something to look at without
             claiming how much. */
          <span aria-hidden="true"
            className="absolute -top-0.5 -right-0.5 w-2 h-2 rounded-full"
            style={{ background: 'var(--accent)' }} />
        )}
      </button>

      {open && dropPos && typeof document !== 'undefined' && createPortal(
        <div ref={dropdownRef} className="fixed w-80 rounded-[18px] shadow-2xl overflow-hidden z-[9999]"
          style={{ background: 'var(--panel-bg)', border: '1px solid var(--card-border)', backdropFilter: 'blur(20px)', WebkitBackdropFilter: 'blur(20px)', bottom: dropPos.bottom, left: dropPos.left }}>

          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3" style={{ borderBottom: '1px solid var(--divider)' }}>
            <span className="text-sm font-semibold" style={{ color: 'var(--text-1)' }}>การแจ้งเตือน</span>
            <span className="text-caption" style={{ color: 'var(--text-3)' }}>7 วันล่าสุด</span>
            <button onClick={() => setOpen(false)} style={{ color: 'var(--text-3)' }}><X size={14} /></button>
          </div>

          <div className="max-h-96 overflow-y-auto">
            {(paidToday.length === 0 && handovers.length === 0) ? (
              <div className="py-8 text-center">
                <Bell size={24} className="mx-auto mb-2" style={{ color: 'var(--text-3)' }} />
                <p className="text-sm" style={{ color: 'var(--text-3)' }}>ไม่มีการแจ้งเตือน</p>
              </div>
            ) : (
              <>
                {/* 1. Paid payments — booking deposit + installments */}
                {paidToday.length > 0 && (
                  <div>
                    <SectionHeader icon={<Banknote size={11} />}
                      label="รายรับล่าสุด"
                      color="var(--accent-blue)" bg="color-mix(in srgb, var(--accent-blue) 5%, transparent)" />
                    {paidToday.slice(0, 8).map(p => (
                      <ItemRow key={p.id} onClick={() => { router.push('/dashboard/payments'); setOpen(false) }}
                        name={p.customer_name}
                        sub={`${p.room_no} · ${p.installment_name} · ${p.isToday ? 'วันนี้' : fmtDate(p.paid_date)}`}
                        right={fmtBaht(p.paid_amount)} rightColor="var(--accent-blue)" />
                    ))}
                  </div>
                )}

                {/* 2. Handovers */}
                {handovers.length > 0 && (
                  <div>
                    <SectionHeader icon={<Home size={11} />}
                      label="ส่งมอบล่าสุด"
                      color="var(--accent-orange)" bg="color-mix(in srgb, var(--accent-orange) 5%, transparent)" />
                    {handovers.slice(0, 5).map(h => (
                      <ItemRow key={h.id} onClick={() => { router.push('/dashboard/handover'); setOpen(false) }}
                        name={h.customer_name}
                        sub={`${h.room_no} · ${h.isToday ? 'วันนี้' : fmtDate(h.handover_date)}`}
                        right={h.isToday ? '📅 วันนี้' : fmtDate(h.handover_date)} rightColor="var(--accent-orange)" />
                    ))}
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
