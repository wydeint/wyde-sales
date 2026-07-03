'use client'

import { useState, useEffect } from 'react'
import { usePathname } from 'next/navigation'
import { Menu } from 'lucide-react'
import Sidebar from './Sidebar'

export default function DashboardShell({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = useState(false)
  const pathname = usePathname()

  useEffect(() => { setOpen(false) }, [pathname])

  useEffect(() => {
    const h = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false) }
    window.addEventListener('keydown', h)
    return () => window.removeEventListener('keydown', h)
  }, [])

  return (
    <div className="flex h-screen overflow-hidden">

      {/* ── Desktop sidebar — always visible (lg+) ── */}
      <div className="hidden lg:flex flex-shrink-0">
        <Sidebar />
      </div>

      {/* ── Mobile/iPad — overlay sidebar (< lg) ── */}
      {open && (
        <div
          className="lg:hidden fixed inset-0 z-40"
          onClick={() => setOpen(false)}
          aria-hidden="true"
          style={{ background: 'rgba(0,0,0,0.45)', backdropFilter: 'blur(2px)' }}
        />
      )}
      <div className={[
        'lg:hidden fixed inset-y-0 left-0 z-50 transition-transform duration-300 ease-in-out',
        open ? 'translate-x-0' : '-translate-x-full',
      ].join(' ')}>
        <Sidebar onClose={() => setOpen(false)} />
      </div>

      {/* ── Main content ── */}
      <div className="flex-1 flex flex-col overflow-hidden min-w-0">

        {/* Topbar — mobile/iPad only */}
        <header
          className="lg:hidden flex-shrink-0 flex items-center gap-3 px-4 h-14"
          style={{
            background: 'var(--sidebar-bg)',
            borderBottom: '1px solid var(--sidebar-border)',
            backdropFilter: 'blur(20px) saturate(180%)',
            WebkitBackdropFilter: 'blur(20px) saturate(180%)',
          }}
        >
          <button
            onClick={() => setOpen(v => !v)}
            aria-label="เปิด/ปิดเมนู"
            className="w-10 h-10 flex items-center justify-center rounded-[11px] flex-shrink-0 transition-colors"
            style={{ color: 'var(--text-2)' }}
            onMouseEnter={e => (e.currentTarget.style.background = 'var(--hover-bg)')}
            onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
          >
            <Menu size={20} />
          </button>
          <div className="flex items-center gap-2.5 min-w-0">
            <img src="/logo.svg" alt="WydE" style={{ width: 52, height: 22, objectFit: 'contain' }} />
            <span className="text-sm font-semibold" style={{ color: 'var(--text-1)' }}>Super Sales</span>
          </div>
        </header>

        <main className="flex-1 overflow-y-auto">
          {children}
        </main>
      </div>
    </div>
  )
}
