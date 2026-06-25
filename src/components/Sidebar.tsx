'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import {
  LayoutDashboard, Users, TrendingUp, CalendarDays,
  ClipboardList, DollarSign, ArrowRightLeft, FileText,
  ShieldCheck, BarChart3, Wallet, Building2, UserCog,
  Target, LogOut, ChevronRight
} from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'

const navSections = [
  {
    label: 'MAIN',
    items: [
      { href: '/dashboard', icon: LayoutDashboard, label: 'Dashboard', roles: ['admin','sales','admin_sales','executive','finance'] },
    ]
  },
  {
    label: 'SALES',
    color: 'text-green-400',
    items: [
      { href: '/dashboard/customers', icon: Users, label: 'ลูกค้า Condo Origin', roles: ['admin','sales'] },
      { href: '/dashboard/pipeline', icon: TrendingUp, label: 'Pipeline', roles: ['admin','sales'] },
      { href: '/dashboard/events', icon: CalendarDays, label: 'Events', roles: ['admin','sales'] },
      { href: '/dashboard/daily-report', icon: ClipboardList, label: 'Daily Report', roles: ['admin','sales'] },
      { href: '/dashboard/commission', icon: DollarSign, label: 'Commission', roles: ['admin','sales'] },
      { href: '/dashboard/handover', icon: ArrowRightLeft, label: 'Handover', roles: ['admin','sales','admin_sales'] },
    ]
  },
  {
    label: 'ADMIN SALES',
    color: 'text-purple-400',
    items: [
      { href: '/dashboard/documents', icon: FileText, label: 'เอกสาร', roles: ['admin','admin_sales'] },
      { href: '/dashboard/warranty', icon: ShieldCheck, label: 'Warranty', roles: ['admin','admin_sales'] },
    ]
  },
  {
    label: 'REPORTS',
    color: 'text-orange-400',
    items: [
      { href: '/dashboard/executive', icon: BarChart3, label: 'Executive Report', roles: ['admin','executive'] },
      { href: '/dashboard/finance', icon: Wallet, label: 'Finance', roles: ['admin','finance'] },
    ]
  },
  {
    label: 'SETTINGS',
    items: [
      { href: '/dashboard/projects', icon: Building2, label: 'Projects', roles: ['admin'] },
      { href: '/dashboard/users', icon: UserCog, label: 'Users', roles: ['admin'] },
      { href: '/dashboard/targets', icon: Target, label: 'Sales Targets', roles: ['admin'] },
    ]
  },
]

export default function Sidebar() {
  const pathname = usePathname()
  const router = useRouter()
  const supabase = createClient()

  async function signOut() {
    await supabase.auth.signOut()
    router.push('/login')
  }

  return (
    <aside className="w-56 flex-shrink-0 bg-[#010409] border-r border-[#21262d] flex flex-col h-screen">

      {/* Logo */}
      <div className="p-4 border-b border-[#21262d]">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-[#1d6fa5] flex items-center justify-center flex-shrink-0">
            <span className="text-white text-sm font-bold">W</span>
          </div>
          <span className="text-white font-semibold text-sm">WydEInt CRM</span>
        </div>
      </div>

      {/* Nav */}
      <nav className="flex-1 overflow-y-auto py-3 px-2">
        {navSections.map((section) => (
          <div key={section.label} className="mb-4">
            <p className={`px-2 mb-1 text-[10px] font-bold tracking-wider ${section.color || 'text-[#484f58]'}`}>
              {section.label}
            </p>
            {section.items.map((item) => {
              const isActive = pathname === item.href
              const Icon = item.icon
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`flex items-center gap-2.5 px-2 py-1.5 rounded-md text-sm mb-0.5 transition-colors group ${
                    isActive
                      ? 'bg-[#1f6feb1a] text-white'
                      : 'text-[#8b949e] hover:text-white hover:bg-[#21262d]'
                  }`}
                >
                  <Icon size={15} className={isActive ? 'text-[#58a6ff]' : 'text-[#484f58] group-hover:text-[#8b949e]'} />
                  <span className="truncate">{item.label}</span>
                  {isActive && <ChevronRight size={12} className="ml-auto text-[#58a6ff]" />}
                </Link>
              )
            })}
          </div>
        ))}
      </nav>

      {/* User + Signout */}
      <div className="p-3 border-t border-[#21262d]">
        <button
          onClick={signOut}
          className="w-full flex items-center gap-2 px-2 py-1.5 rounded-md text-[#8b949e] hover:text-white hover:bg-[#21262d] transition-colors text-sm"
        >
          <LogOut size={15} />
          <span>ออกจากระบบ</span>
        </button>
      </div>
    </aside>
  )
}
