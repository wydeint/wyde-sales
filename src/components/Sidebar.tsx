'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import {
  LayoutDashboard, Users, TrendingUp, CalendarDays,
  ClipboardList, DollarSign, ArrowRightLeft, FileText,
  ShieldCheck, BarChart3, Wallet, Building2, UserCog,
  Target, LogOut, Sun, Moon, ChevronRight,
  Briefcase, Settings2, TrendingDown, Database, Receipt, Zap, Search
} from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import { useTheme } from '@/components/ThemeProvider'
import { useEffect, useState } from 'react'
import NotificationBell from '@/components/NotificationBell'
import GlobalSearch from '@/components/GlobalSearch'

const NAV = [
  {
    label: 'MAIN',
    color: null,
    dot: null,
    items: [
      { href: '/dashboard', icon: LayoutDashboard, label: 'Dashboard' },
      { href: '/dashboard/quick', icon: Zap, label: 'Quick Mode' },
    ],
  },
  {
    label: 'SALES',
    color: 'text-emerald-400',
    dot: 'bg-emerald-400',
    items: [
      { href: '/dashboard/leads', icon: Database, label: 'Origin Pool' },
      { href: '/dashboard/pipeline', icon: TrendingUp, label: 'Prospects' },
      { href: '/dashboard/my-deals', icon: Briefcase, label: 'My Deals' },
      { href: '/dashboard/events', icon: CalendarDays, label: 'Events' },
    ],
  },
  {
    label: 'MONITORING',
    color: 'text-sky-400',
    dot: 'bg-sky-400',
    items: [
      { href: '/dashboard/customers', icon: Users, label: 'ลูกค้า' },
      { href: '/dashboard/handover', icon: ClipboardList, label: 'Handover' },
      { href: '/dashboard/payments', icon: Receipt, label: 'ชำระเงิน & เอกสาร' },
      { href: '/dashboard/warranty', icon: ShieldCheck, label: 'Warranty' },
    ],
  },
  {
    label: 'REPORTS',
    color: 'text-amber-400',
    dot: 'bg-amber-400',
    items: [
      { href: '/dashboard/revenue', icon: TrendingDown, label: 'รายได้ส่งมอบ' },
      { href: '/dashboard/project-summary', icon: BarChart3, label: 'สรุปรายโครงการ' },
      { href: '/dashboard/executive', icon: BarChart3, label: 'Executive Report' },
      { href: '/dashboard/jobs', icon: Briefcase, label: 'Wyde Clients' },
      { href: '/dashboard/finance', icon: Wallet, label: 'Finance & Ledger' },
      { href: '/dashboard/commission', icon: DollarSign, label: 'Commission' },
    ],
  },
  {
    label: 'ADMIN',
    color: null,
    dot: null,
    items: [
      { href: '/dashboard/admin-data', icon: Database, label: 'Data Entry' },
      { href: '/dashboard/projects', icon: Building2, label: 'Projects' },
      { href: '/dashboard/users', icon: UserCog, label: 'Users' },
      { href: '/dashboard/targets', icon: Target, label: 'Sales Targets' },
      { href: '/dashboard/settings', icon: Settings2, label: 'Commission Tiers' },
    ],
  },
]

export default function Sidebar({ onClose }: { onClose?: () => void }) {
  const pathname = usePathname()
  const router = useRouter()
  const supabase = createClient()
  const { theme, toggle } = useTheme()
  const [userName, setUserName] = useState('')
  const [userInitial, setUserInitial] = useState('W')
  const [searchOpen, setSearchOpen] = useState(false)

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault()
        setSearchOpen(o => !o)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  useEffect(() => {
    async function getUser() {
      const { data: { user } } = await supabase.auth.getUser()
      if (user) {
        const { data } = await supabase.from('users').select('name').eq('email', user.email!).single()
        if (data?.name) {
          setUserName(data.name)
          setUserInitial(data.name[0].toUpperCase())
        }
      }
    }
    getUser()
  }, [])

  async function signOut() {
    if (!window.confirm('ออกจากระบบ?')) return
    await supabase.auth.signOut()
    router.push('/login')
  }

  return (
    <>
    {/*
      Width:
        < lg  : w-[60px]  — icon only
        lg+   : w-[216px] — full labels
    */}
    <aside
      className="w-[216px] flex-shrink-0 flex flex-col h-screen"
      style={{
        background: 'var(--sidebar-bg)',
        borderRight: '1px solid var(--sidebar-border)',
        backdropFilter: 'blur(28px) saturate(180%)',
        WebkitBackdropFilter: 'blur(28px) saturate(180%)',
      }}
    >
      {/* ── Logo ── */}
      <div className="px-4 pt-5 pb-4 flex-shrink-0 flex items-center gap-3" style={{ borderBottom: '1px solid var(--divider)' }}>
        <div className="flex-shrink-0 flex items-center" style={{ width: 68, height: 30 }}>
          <img src="/logo.svg" alt="WydE Int." style={{ width: '100%', height: '100%', objectFit: 'contain', objectPosition: 'left center' }} />
        </div>
        <div>
          <p className="font-semibold text-sm leading-tight" style={{ color: 'var(--text-1)' }}>Super Sales</p>
          <p className="text-[10px] leading-tight" style={{ color: 'var(--text-3)' }}>WydEInt Interior</p>
        </div>
      </div>

      {/* ── Search ── */}
      <div className="px-3 py-2 flex-shrink-0" style={{ borderBottom: '1px solid var(--divider)' }}>
        <button onClick={() => setSearchOpen(true)}
          className="w-full flex items-center gap-2 px-3 py-2 rounded-[8px] text-sm"
          style={{ background: 'var(--hover-bg)', color: 'var(--text-3)' }}>
          <Search size={13} aria-hidden="true" />
          <span className="flex-1 text-left text-xs">ค้นหา...</span>
          <kbd className="text-[10px] px-1 rounded" style={{ background: 'var(--card-bg)', color: 'var(--text-3)' }}>⌘K</kbd>
        </button>
      </div>

      {/* ── Nav ── */}
      <nav className="flex-1 overflow-y-auto py-3 px-3 space-y-0.5" aria-label="เมนูหลัก">
        {NAV.map(section => (
          <div key={section.label} className="mb-4">
            <div className="flex items-center gap-1.5 px-2 mb-1">
              {section.dot && <span className={`w-1.5 h-1.5 rounded-full ${section.dot}`} />}
              <span className={`text-[10px] font-bold tracking-widest uppercase ${section.color || ''}`}
                style={!section.color ? { color: 'var(--text-3)' } : undefined}>
                {section.label}
              </span>
            </div>

            {section.items.map(item => {
              const isActive = pathname === item.href
              const Icon = item.icon
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  title={item.label}
                  aria-label={item.label}
                  aria-current={isActive ? 'page' : undefined}
                  onClick={onClose}
                  className="flex items-center gap-2.5 rounded-[11px] mb-0.5 relative group transition-colors"
                  style={{
                    background: isActive ? 'var(--active-bg)' : 'transparent',
                    color: isActive ? 'var(--accent)' : 'var(--text-2)',
                  }}
                  onMouseEnter={e => { if (!isActive) (e.currentTarget as HTMLElement).style.background = 'var(--hover-bg)' }}
                  onMouseLeave={e => { if (!isActive) (e.currentTarget as HTMLElement).style.background = 'transparent' }}
                >
                  <span className="flex items-center justify-center py-2.5 px-3">
                    <Icon size={16} style={{ color: isActive ? 'var(--accent)' : 'var(--text-3)', flexShrink: 0 }} />
                  </span>
                  <span className="truncate flex-1 text-sm font-normal">{item.label}</span>
                  {isActive && <ChevronRight size={12} style={{ color: 'var(--accent)' }} className="flex-shrink-0 mr-2" />}
                </Link>
              )
            })}
          </div>
        ))}
      </nav>

      {/* ── Bottom bar ── */}
      <div className="flex-shrink-0 px-3 pb-3 pt-2.5" style={{ borderTop: '1px solid var(--divider)' }}>
        <div className="flex items-center gap-1.5">
          <div className="w-6 h-6 rounded-full flex items-center justify-center flex-shrink-0 text-white text-[10px] font-bold"
            style={{ background: 'linear-gradient(135deg, var(--accent), var(--accent-purple))' }}>
            {userInitial}
          </div>
          <span className="text-[11px] font-semibold truncate flex-1" style={{ color: 'var(--text-3)' }}>
            {userName || '...'}
          </span>
          <NotificationBell />
          <button onClick={toggle} aria-label={theme === 'dark' ? 'Light Mode' : 'Dark Mode'}
            className="w-7 h-7 flex items-center justify-center rounded-lg flex-shrink-0"
            style={{ color: 'var(--text-3)' }}
            onMouseEnter={e => (e.currentTarget.style.background = 'var(--hover-bg)')}
            onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}>
            {theme === 'dark' ? <Sun size={14} /> : <Moon size={14} />}
          </button>
          <button onClick={signOut} aria-label="ออกจากระบบ"
            className="w-7 h-7 flex items-center justify-center rounded-lg flex-shrink-0"
            style={{ color: 'var(--text-3)' }}
            onMouseEnter={e => (e.currentTarget.style.background = 'var(--hover-bg)')}
            onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}>
            <LogOut size={14} />
          </button>
        </div>
      </div>
    </aside>
    <GlobalSearch open={searchOpen} onClose={() => setSearchOpen(false)} />
    </>
  )
}
