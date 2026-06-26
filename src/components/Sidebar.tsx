'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import {
  LayoutDashboard, Users, TrendingUp, CalendarDays,
  ClipboardList, DollarSign, ArrowRightLeft, FileText,
  ShieldCheck, BarChart3, Wallet, Building2, UserCog,
  Target, LogOut, Sun, Moon, ChevronRight, CreditCard,
  Briefcase, Settings2, TrendingDown, Database
} from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import { useTheme } from '@/components/ThemeProvider'
import { useEffect, useState } from 'react'

const NAV = [
  {
    label: 'MAIN',
    color: null,
    dot: null,
    items: [
      { href: '/dashboard', icon: LayoutDashboard, label: 'Dashboard' },
    ],
  },
  {
    label: 'SALES',
    color: 'text-emerald-400 dark:text-emerald-400',
    dot: 'bg-emerald-400',
    items: [
      { href: '/dashboard/customers', icon: Users, label: 'ลูกค้า Condo Origin' },
      { href: '/dashboard/pipeline', icon: TrendingUp, label: 'Pipeline' },
      { href: '/dashboard/events', icon: CalendarDays, label: 'Events' },
      { href: '/dashboard/daily-report', icon: ClipboardList, label: 'Daily Report' },
      { href: '/dashboard/commission', icon: DollarSign, label: 'Commission' },
      { href: '/dashboard/handover', icon: ArrowRightLeft, label: 'Handover' },
      { href: '/dashboard/finance', icon: CreditCard, label: 'การเงิน (ห้อง)' },
      { href: '/dashboard/leads', icon: Database, label: 'Leads Pool (Condo)' },
      { href: '/dashboard/jobs', icon: Briefcase, label: 'ทะเบียนงาน (Jobs)' },
    ],
  },
  {
    label: 'ADMIN SALES',
    color: 'text-violet-400 dark:text-violet-400',
    dot: 'bg-violet-400',
    items: [
      { href: '/dashboard/documents', icon: FileText, label: 'เอกสาร' },
      { href: '/dashboard/warranty', icon: ShieldCheck, label: 'Warranty' },
    ],
  },
  {
    label: 'REPORTS',
    color: 'text-amber-400 dark:text-amber-400',
    dot: 'bg-amber-400',
    items: [
      { href: '/dashboard/revenue', icon: TrendingDown, label: 'รายได้ส่งมอบ' },
      { href: '/dashboard/executive', icon: BarChart3, label: 'Executive Report' },
      { href: '/dashboard/finance', icon: Wallet, label: 'Finance' },
    ],
  },
  {
    label: 'SETTINGS',
    color: null,
    dot: null,
    items: [
      { href: '/dashboard/projects', icon: Building2, label: 'Projects' },
      { href: '/dashboard/users', icon: UserCog, label: 'Users' },
      { href: '/dashboard/targets', icon: Target, label: 'Sales Targets' },
      { href: '/dashboard/settings', icon: Settings2, label: 'Commission Tiers' },
    ],
  },
]

export default function Sidebar() {
  const pathname = usePathname()
  const router = useRouter()
  const supabase = createClient()
  const { theme, toggle } = useTheme()
  const [userName, setUserName] = useState('')
  const [userInitial, setUserInitial] = useState('W')

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
    await supabase.auth.signOut()
    router.push('/login')
  }

  return (
    <aside
      className="w-60 flex-shrink-0 flex flex-col h-screen relative"
      style={{
        background: 'var(--sidebar-bg)',
        borderRight: '1px solid var(--sidebar-border)',
        backdropFilter: 'blur(28px) saturate(180%)',
        WebkitBackdropFilter: 'blur(28px) saturate(180%)',
      }}
    >
      {/* Logo */}
      <div className="px-4 pt-5 pb-4" style={{ borderBottom: '1px solid var(--divider)' }}>
        <div className="flex items-center gap-3">
          {/* Logo mark */}
          <div className="flex-shrink-0 flex items-center" style={{ width: 72, height: 32 }}>
            <img src="/logo.svg" alt="WydE Int." style={{ width: '100%', height: '100%', objectFit: 'contain', objectPosition: 'left center' }} />
          </div>
          <div>
            <p className="font-semibold text-sm leading-tight" style={{ color: 'var(--text-1)' }}>
              Super Sales
            </p>
            <p className="text-[10px] leading-tight" style={{ color: 'var(--text-3)' }}>
              WydEInt Interior
            </p>
          </div>
        </div>
      </div>

      {/* Nav */}
      <nav className="flex-1 overflow-y-auto py-3 px-3 space-y-0.5">
        {NAV.map(section => (
          <div key={section.label} className="mb-3">
            {/* Section label */}
            <div className="flex items-center gap-1.5 px-2 mb-1">
              {section.dot && (
                <span className={`w-1.5 h-1.5 rounded-full ${section.dot}`} />
              )}
              <span
                className={`text-[10px] font-bold tracking-widest uppercase ${section.color || ''}`}
                style={!section.color ? { color: 'var(--text-3)' } : undefined}
              >
                {section.label}
              </span>
            </div>

            {/* Items */}
            {section.items.map(item => {
              const isActive = pathname === item.href
              const Icon = item.icon
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className="flex items-center gap-2.5 px-3 py-2 rounded-xl text-sm mb-0.5 relative group"
                  style={{
                    background: isActive ? 'var(--active-bg)' : 'transparent',
                    color: isActive ? 'var(--accent)' : 'var(--text-2)',
                  }}
                  onMouseEnter={e => {
                    if (!isActive) (e.currentTarget as HTMLElement).style.background = 'var(--hover-bg)'
                  }}
                  onMouseLeave={e => {
                    if (!isActive) (e.currentTarget as HTMLElement).style.background = 'transparent'
                  }}
                >
                  <Icon
                    size={15}
                    style={{ color: isActive ? 'var(--accent)' : 'var(--text-3)', flexShrink: 0 }}
                  />
                  <span className="truncate flex-1 font-medium">{item.label}</span>
                  {isActive && (
                    <ChevronRight size={12} style={{ color: 'var(--accent)' }} />
                  )}
                </Link>
              )
            })}
          </div>
        ))}
      </nav>

      {/* Bottom bar */}
      <div className="px-3 pb-4 pt-3 space-y-1" style={{ borderTop: '1px solid var(--divider)' }}>
        {/* User chip */}
        <div
          className="flex items-center gap-2.5 px-3 py-2 rounded-xl mb-1"
          style={{ background: 'var(--hover-bg)' }}
        >
          <div
            className="w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0 text-white text-xs font-bold"
            style={{ background: 'linear-gradient(135deg, #6366f1, #8b5cf6)' }}
          >
            {userInitial}
          </div>
          <span className="text-xs font-medium truncate" style={{ color: 'var(--text-2)' }}>
            {userName || 'Loading...'}
          </span>
        </div>

        {/* Theme toggle */}
        <button
          onClick={toggle}
          className="w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-sm"
          style={{ color: 'var(--text-2)' }}
          onMouseEnter={e => (e.currentTarget.style.background = 'var(--hover-bg)')}
          onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
        >
          {theme === 'dark'
            ? <Sun size={15} style={{ color: 'var(--text-3)' }} />
            : <Moon size={15} style={{ color: 'var(--text-3)' }} />
          }
          <span className="font-medium">{theme === 'dark' ? 'Light Mode' : 'Dark Mode'}</span>
        </button>

        {/* Sign out */}
        <button
          onClick={signOut}
          className="w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-sm"
          style={{ color: 'var(--text-2)' }}
          onMouseEnter={e => (e.currentTarget.style.background = 'var(--hover-bg)')}
          onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
        >
          <LogOut size={15} style={{ color: 'var(--text-3)' }} />
          <span className="font-medium">ออกจากระบบ</span>
        </button>
      </div>
    </aside>
  )
}
