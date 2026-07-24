'use client'

import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Bell, X, Home, Banknote } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'

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

  const today = new Date().toISOString().slice(0, 10)
  const sevenDaysAgo = new Date(Date.now() - 7 * 864e5).toISOString().slice(0, 10)

  useEffect(() => {
    async function fetchAlerts() {
      const [{ data: handoverData }, { data: paidData }] = await Promise.all([
        // Handovers: today + last 7 days
        supabase.from('customers')
          .select('id, customer_name, room_no, handover_date')
          .not('handover_date', 'is', null)
          .gte('handover_date', sevenDaysAgo)
          .lte('handover_date', today)
          .order('handover_date', { ascending: false }).limit(10),

        // Paid payments (booking + installments): today + last 7 days
        supabase.from('payments')
          .select('id, installment_name, paid_amount, voucher_amount, paid_date, jobs(customer_name, room_no)')
          .eq('status', 'paid').not('paid_date', 'is', null)
          .gte('paid_date', sevenDaysAgo)
          .lte('paid_date', today)
          .order('paid_date', { ascending: false }).limit(15),
      ])

      setHandovers((handoverData || []).map((h: any) => ({
        id: h.id, customer_name: h.customer_name, room_no: h.room_no || '—',
        handover_date: h.handover_date, isToday: h.handover_date === today,
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

  const todayCount = handovers.filter(h => h.isToday).length + paidToday.filter(p => p.isToday).length
  const total = todayCount

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
        style={{ color: todayCount > 0 ? 'var(--accent)' : 'var(--text-3)' }}
        onMouseEnter={e => (e.currentTarget.style.background = 'var(--hover-bg)')}
        onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
        aria-label="การแจ้งเตือน"
      >
        <Bell size={14} />
        {total > 0 && (
          <span className="absolute -top-0.5 -right-0.5 w-3.5 h-3.5 rounded-full text-[8px] font-bold flex items-center justify-center text-white"
            style={{ background: 'var(--accent)' }}>
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
                style={{ background: 'color-mix(in srgb, var(--accent) 15%, transparent)', color: 'var(--accent)' }}>
                {total} รายการ
              </span>
            )}
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
                      label={paidToday.some(p => p.isToday) ? 'รายรับวันนี้' : 'รายรับล่าสุด'}
                      count={paidToday.length} color="#3b82f6" bg="color-mix(in srgb, #3b82f6 5%, transparent)" />
                    {paidToday.slice(0, 8).map(p => (
                      <ItemRow key={p.id} onClick={() => { router.push('/dashboard/payments'); setOpen(false) }}
                        name={p.customer_name}
                        sub={`${p.room_no} · ${p.installment_name} · ${p.isToday ? 'วันนี้' : fmtDate(p.paid_date)}`}
                        right={fmtBaht(p.paid_amount)} rightColor="#3b82f6" />
                    ))}
                  </div>
                )}

                {/* 2. Handovers */}
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
              </>
            )}
          </div>
        </div>,
        document.body
      )}
    </div>
  )
}
