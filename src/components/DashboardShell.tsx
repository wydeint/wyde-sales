'use client'

import { useState } from 'react'
import { Menu } from 'lucide-react'
import Sidebar from './Sidebar'

export default function DashboardShell({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = useState(true)

  return (
    <div className="flex h-screen overflow-hidden">
      {/* Sidebar — toggleable */}
      <div
        className="flex-shrink-0 transition-all duration-300 ease-in-out overflow-hidden"
        style={{ width: open ? 216 : 0 }}
      >
        <Sidebar onToggle={() => setOpen(false)} />
      </div>

      {/* Main content */}
      <main className="flex-1 overflow-y-auto min-w-0 relative">
        {/* Hamburger — visible only when sidebar is closed */}
        {!open && (
          <button
            onClick={() => setOpen(true)}
            aria-label="เปิดเมนู"
            className="fixed top-3 left-3 z-50 w-9 h-9 flex items-center justify-center rounded-xl shadow-lg transition-all"
            style={{
              background: 'var(--sidebar-bg)',
              border: '1px solid var(--sidebar-border)',
              color: 'var(--text-2)',
              backdropFilter: 'blur(12px)',
            }}
          >
            <Menu size={18} />
          </button>
        )}
        {children}
      </main>
    </div>
  )
}
