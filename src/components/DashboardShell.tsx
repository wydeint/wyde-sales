'use client'

import { useState, useEffect } from 'react'
import { usePathname } from 'next/navigation'

import { type LucideIcon, Menu, X, LayoutDashboard, Users, Zap, CalendarDays, MoreHorizontal } from 'lucide-react'
import Sidebar from './Sidebar'
import Link from 'next/link'

interface TabItem { href: string; icon: LucideIcon; label: string; center?: true }

const BOTTOM_TABS: TabItem[] = [
  { href: '/dashboard',           icon: LayoutDashboard, label: 'หน้าหลัก' },
  { href: '/dashboard/customers', icon: Users,           label: 'ลูกค้า'   },
  { href: '/dashboard/quick',     icon: Zap,             label: 'Quick',   center: true },
  { href: '/dashboard/events',    icon: CalendarDays,    label: 'Events'   },
]

export default function DashboardShell({ children }: { children: React.ReactNode }) {
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const pathname = usePathname()

  useEffect(() => { setSidebarOpen(false) }, [pathname])

  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') setSidebarOpen(false) }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [])

  const isQuick = pathname === '/dashboard/quick'

  return (
    <div className="flex h-screen overflow-hidden">

      {/* ── Mobile/Tablet overlay backdrop (< md) ─── */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 z-40 md:hidden"
          onClick={() => setSidebarOpen(false)}
          aria-hidden="true"
        >
          <div className="absolute inset-0 bg-black/60 backdrop-blur-[3px]" />
        </div>
      )}

      {/* ── Sidebar ─────────────────────────────────
           < md  : hidden (overlay only)
           md–lg : slim icon-only (w-16)
           lg+   : full (w-60)
      ──────────────────────────────────────────── */}
      <div
        className={[
          'fixed inset-y-0 left-0 z-50',
          'md:static md:z-auto md:flex-shrink-0',
          'transition-transform duration-300 ease-in-out',
          sidebarOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0',
        ].join(' ')}
      >
        <Sidebar onClose={() => setSidebarOpen(false)} />
      </div>

      {/* ── Main content ──────────────────────────── */}
      <main className="flex-1 overflow-y-auto min-w-0 flex flex-col">

        {/* Mobile top bar — only on phones (< md), hidden in Quick Mode */}
        {!isQuick && (
          <div
            data-topbar
            className="md:hidden sticky top-0 z-[60] flex items-center gap-3 px-4 h-14 flex-shrink-0"
            style={{
              background: 'var(--sidebar-bg)',
              borderBottom: '1px solid var(--sidebar-border)',
              backdropFilter: 'blur(20px) saturate(180%)',
              WebkitBackdropFilter: 'blur(20px) saturate(180%)',
            }}
          >
            <button
              onClick={() => setSidebarOpen(v => !v)}
              className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0"
              style={{ background: 'var(--hover-bg)', color: 'var(--text-2)' }}
              aria-label={sidebarOpen ? 'ปิดเมนู' : 'เปิดเมนู'}
            >
              {sidebarOpen ? <X size={18} /> : <Menu size={18} />}
            </button>
            <div className="flex items-center gap-2 min-w-0">
              <img src="/logo.svg" alt="WydE" style={{ width: 52, height: 22, objectFit: 'contain' }} />
              <span className="text-sm font-semibold truncate" style={{ color: 'var(--text-1)' }}>Super Sales</span>
            </div>
          </div>
        )}

        {/* Page content — add bottom padding on phones for tab bar */}
        <div className="flex-1 overflow-y-auto md:overflow-visible pb-[calc(4rem+env(safe-area-inset-bottom,0px))] md:pb-0">
          {children}
        </div>
      </main>

      {/* ── iOS-style Bottom Tab Bar (phones < md only) ──
           Hidden in Quick Mode (it has its own full-screen header)
      ──────────────────────────────────────────────────── */}
      {!isQuick && (
        <nav
          aria-label="เมนูหลัก"
          className="md:hidden fixed bottom-0 inset-x-0 z-[70] flex items-end"
          style={{
            background: 'var(--sidebar-bg)',
            borderTop: '1px solid var(--sidebar-border)',
            backdropFilter: 'blur(24px) saturate(180%)',
            WebkitBackdropFilter: 'blur(24px) saturate(180%)',
            paddingBottom: 'env(safe-area-inset-bottom, 0px)',
          }}
        >
          {BOTTOM_TABS.map(tab => {
            const Icon = tab.icon
            const isActive = pathname === tab.href
            if (tab.center) {
              return (
                <Link
                  key={tab.href}
                  href={tab.href}
                  className="flex-1 flex flex-col items-center justify-center py-2"
                  aria-label={tab.label}
                  aria-current={isActive ? 'page' : undefined}
                >
                  <div
                    className="w-12 h-12 rounded-2xl flex items-center justify-center mb-0.5 shadow-lg"
                    style={{
                      background: isActive
                        ? 'linear-gradient(135deg,#6366f1,#8b5cf6)'
                        : 'linear-gradient(135deg,#6366f1cc,#8b5cf6cc)',
                      transform: 'translateY(-8px)',
                    }}
                  >
                    <Icon size={22} color="#fff" />
                  </div>
                </Link>
              )
            }
            return (
              <Link
                key={tab.href}
                href={tab.href}
                className="flex-1 flex flex-col items-center justify-center gap-0.5 py-2 min-h-[3.5rem]"
                aria-current={isActive ? 'page' : undefined}
              >
                <Icon
                  size={20}
                  style={{ color: isActive ? 'var(--accent)' : 'var(--text-3)' }}
                />
                <span
                  className="text-[10px] font-medium leading-tight"
                  style={{ color: isActive ? 'var(--accent)' : 'var(--text-3)' }}
                >
                  {tab.label}
                </span>
              </Link>
            )
          })}

          {/* More — opens sidebar overlay */}
          <button
            onClick={() => setSidebarOpen(v => !v)}
            className="flex-1 flex flex-col items-center justify-center gap-0.5 py-2 min-h-[3.5rem]"
            aria-label="เมนูเพิ่มเติม"
          >
            <MoreHorizontal size={20} style={{ color: 'var(--text-3)' }} />
            <span className="text-[10px] font-medium leading-tight" style={{ color: 'var(--text-3)' }}>
              เพิ่มเติม
            </span>
          </button>
        </nav>
      )}
    </div>
  )
}
