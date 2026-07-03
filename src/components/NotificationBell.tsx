'use client'

import { useEffect, useRef, useState } from 'react'
import { Bell, AlertCircle, ShieldAlert, X } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'

interface OverduePayment {
  id: string
  customer_name: string
  room_no: string
  amount: number
  due_date: string
  days_overdue: number
}

interface ExpiringWarranty {
  id: string
  customer_name: string
  room_no: string
  warranty_end: string
  days_left: number
}

export default function NotificationBell() {
  const supabase = createClient()
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [overduePayments, setOverduePayments] = useState<OverduePayment[]>([])
  const [expiringWarranties, setExpiringWarranties] = useState<ExpiringWarranty[]>([])
  const ref = useRef<HTMLDivElement>(null)

  const today = new Date().toISOString().slice(0, 10)
  const thirtyDaysLater = new Date(Date.now() + 30 * 864e5).toISOString().slice(0, 10)

  useEffect(() => {
    async function fetchAlerts() {
      const [{ data: payments }, { data: warranties }] = await Promise.all([
        supabase.from('payments')
          .select('id, amount, due_date, jobs(customer_name, room_no)')
          .neq('status', 'paid')
          .not('due_date', 'is', null)
          .lt('due_date', today)
          .order('due_date', { ascending: true })
          .limit(10),
        supabase.from('warranties')
          .select('id, customer_name, room_no, warranty_end')
          .not('warranty_end', 'is', null)
          .gte('warranty_end', today)
          .lte('warranty_end', thirtyDaysLater)
          .order('warranty_end', { ascending: true })
          .limit(10),
      ])

      const op: OverduePayment[] = (payments || []).map((p: any) => ({
        id: p.id,
        customer_name: p.jobs?.customer_name || '—',
        room_no: p.jobs?.room_no || '—',
        amount: p.amount,
        due_date: p.due_date,
        days_overdue: Math.floor((Date.now() - new Date(p.due_date).getTime()) / 864e5),
      }))

      const ew: ExpiringWarranty[] = (warranties || []).map((w: any) => ({
        id: w.id,
        customer_name: w.customer_name || '—',
        room_no: w.room_no || '—',
        warranty_end: w.warranty_end,
        days_left: Math.floor((new Date(w.warranty_end).getTime() - Date.now()) / 864e5),
      }))

      setOverduePayments(op)
      setExpiringWarranties(ew)
    }
    fetchAlerts()
  }, [])

  // Close on outside click
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    if (open) document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [open])

  const total = overduePayments.length + expiringWarranties.length

  const fmtDate = (d: string) => new Date(d).toLocaleDateString('th-TH', { day: '2-digit', month: 'short' })
  const fmtBaht = (n: number) => '฿' + Math.round(n).toLocaleString()

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen(v => !v)}
        className="w-7 h-7 flex items-center justify-center rounded-lg flex-shrink-0 relative"
        style={{ color: total > 0 ? '#f87171' : 'var(--text-3)' }}
        onMouseEnter={e => (e.currentTarget.style.background = 'var(--hover-bg)')}
        onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
        aria-label="การแจ้งเตือน"
      >
        <Bell size={14} />
        {total > 0 && (
          <span className="absolute -top-0.5 -right-0.5 w-3.5 h-3.5 rounded-full text-[8px] font-bold flex items-center justify-center text-white"
            style={{ background: '#ef4444' }}>
            {total > 9 ? '9+' : total}
          </span>
        )}
      </button>

      {open && (
        <div
          className="absolute bottom-9 left-0 w-72 rounded-[18px] shadow-2xl overflow-hidden z-[200]"
          style={{ background: 'var(--card-bg)', border: '1px solid var(--divider)', backdropFilter: 'blur(20px)' }}
        >
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3" style={{ borderBottom: '1px solid var(--divider)' }}>
            <span className="text-sm font-semibold" style={{ color: 'var(--text-1)' }}>การแจ้งเตือน</span>
            {total > 0 && (
              <span className="text-xs px-2 py-0.5 rounded-full font-bold" style={{ background: 'rgba(239,68,68,0.15)', color: '#f87171' }}>
                {total} รายการ
              </span>
            )}
            <button onClick={() => setOpen(false)} style={{ color: 'var(--text-3)' }}>
              <X size={14} />
            </button>
          </div>

          <div className="max-h-80 overflow-y-auto">
            {total === 0 ? (
              <div className="py-8 text-center">
                <Bell size={24} className="mx-auto mb-2" style={{ color: 'var(--text-3)' }} />
                <p className="text-sm" style={{ color: 'var(--text-3)' }}>ไม่มีการแจ้งเตือน</p>
              </div>
            ) : (
              <>
                {/* Overdue Payments */}
                {overduePayments.length > 0 && (
                  <div>
                    <div className="px-4 py-2 flex items-center gap-1.5" style={{ borderBottom: '1px solid var(--divider)', background: 'rgba(239,68,68,0.05)' }}>
                      <AlertCircle size={11} style={{ color: '#f87171' }} />
                      <span className="text-[10px] font-bold uppercase tracking-wider" style={{ color: '#f87171' }}>
                        งวดเกินกำหนด ({overduePayments.length})
                      </span>
                    </div>
                    {overduePayments.slice(0, 5).map(p => (
                      <button key={p.id} onClick={() => { router.push('/dashboard/payments'); setOpen(false) }}
                        className="w-full text-left px-4 py-2.5 transition-colors"
                        style={{ borderBottom: '1px solid var(--divider)' }}
                        onMouseEnter={e => (e.currentTarget.style.background = 'var(--hover-bg)')}
                        onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}>
                        <div className="flex justify-between items-start">
                          <div>
                            <p className="text-xs font-semibold" style={{ color: 'var(--text-1)' }}>{p.customer_name}</p>
                            <p className="text-[10px]" style={{ color: 'var(--text-3)' }}>{p.room_no} · เกิน {p.days_overdue} วัน</p>
                          </div>
                          <span className="text-xs font-semibold" style={{ color: '#f87171' }}>{fmtBaht(p.amount)}</span>
                        </div>
                      </button>
                    ))}
                    {overduePayments.length > 5 && (
                      <button onClick={() => { router.push('/dashboard/payments'); setOpen(false) }}
                        className="w-full text-center py-2 text-xs" style={{ color: 'var(--accent)' }}>
                        ดูทั้งหมด {overduePayments.length} รายการ →
                      </button>
                    )}
                  </div>
                )}

                {/* Expiring Warranties */}
                {expiringWarranties.length > 0 && (
                  <div>
                    <div className="px-4 py-2 flex items-center gap-1.5" style={{ borderBottom: '1px solid var(--divider)', background: 'rgba(251,191,36,0.05)' }}>
                      <ShieldAlert size={11} style={{ color: '#fbbf24' }} />
                      <span className="text-[10px] font-bold uppercase tracking-wider" style={{ color: '#fbbf24' }}>
                        ประกันใกล้หมด ({expiringWarranties.length})
                      </span>
                    </div>
                    {expiringWarranties.slice(0, 5).map(w => (
                      <button key={w.id} onClick={() => { router.push('/dashboard/warranty'); setOpen(false) }}
                        className="w-full text-left px-4 py-2.5 transition-colors"
                        style={{ borderBottom: '1px solid var(--divider)' }}
                        onMouseEnter={e => (e.currentTarget.style.background = 'var(--hover-bg)')}
                        onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}>
                        <div className="flex justify-between items-start">
                          <div>
                            <p className="text-xs font-semibold" style={{ color: 'var(--text-1)' }}>{w.customer_name}</p>
                            <p className="text-[10px]" style={{ color: 'var(--text-3)' }}>{w.room_no} · เหลือ {w.days_left} วัน</p>
                          </div>
                          <span className="text-[10px]" style={{ color: 'var(--text-3)' }}>{fmtDate(w.warranty_end)}</span>
                        </div>
                      </button>
                    ))}
                    {expiringWarranties.length > 5 && (
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
        </div>
      )}
    </div>
  )
}
