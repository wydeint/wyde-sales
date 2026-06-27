'use client'

import { useState, useEffect } from 'react'
import { usePathname } from 'next/navigation'
import { Menu, X } from 'lucide-react'
import Sidebar from './Sidebar'

export default function DashboardShell({ children }: { children: React.ReactNode }) {
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const pathname = usePathname()

  // Close sidebar when route changes (mobile)
  useEffect(() => {
    setSidebarOpen(false)
  }, [pathname])

  // Close on ESC
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') setSidebarOpen(false) }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [])

  return (
    <div className="flex h-screen overflow-hidden">

      {/* ── Mobile overlay backdrop ─────────────────── */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 z-40 lg:hidden"
          onClick={() => setSidebarOpen(false)}
          aria-hidden="true"
        >
          <div className="absolute inset-0 bg-black/55 backdrop-blur-[2px]" />
        </div>
      )}

      {/* ── Sidebar ─────────────────────────────────── */}
      <div
        className={[
          'fixed inset-y-0 left-0 z-50',
          'lg:static lg:z-auto',
          'transition-transform duration-300 ease-in-out',
          sidebarOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0',
        ].join(' ')}
      >
        <Sidebar />
      </div>

      {/* ── Main content ────────────────────────────── */}
      <main className="flex-1 overflow-y-auto min-w-0">

        {/* Mobile top bar — hidden on Quick Mode (which has its own full-screen header) */}
        <div
          data-topbar
          className={`sticky top-0 z-[60] flex items-center gap-3 px-4 h-14 flex-shrink-0 ${pathname === '/dashboard/quick' ? 'hidden' : 'lg:hidden'}`}
          style={{
            background: 'var(--sidebar-bg)',
            borderBottom: '1px solid var(--sidebar-border)',
            backdropFilter: 'blur(20px) saturate(180%)',
            WebkitBackdropFilter: 'blur(20px) saturate(180%)',
          }}
        >
          {/* Toggle: hamburger when closed, X when open */}
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

        {children}
      </main>
    </div>
  )
}
