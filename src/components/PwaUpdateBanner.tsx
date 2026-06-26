'use client'

import { useEffect, useState } from 'react'
import { RefreshCw, X } from 'lucide-react'

export default function PwaUpdateBanner() {
  const [show, setShow] = useState(false)
  const [reg, setReg] = useState<ServiceWorkerRegistration | null>(null)

  useEffect(() => {
    if (typeof window === 'undefined' || !('serviceWorker' in navigator)) return

    navigator.serviceWorker.register('/sw.js').then(r => {
      setReg(r)

      // New SW found while page is open
      r.addEventListener('updatefound', () => {
        const sw = r.installing
        if (!sw) return
        sw.addEventListener('statechange', () => {
          if (sw.state === 'installed' && navigator.serviceWorker.controller) {
            setShow(true)
          }
        })
      })

      // SW already waiting (e.g. user came back after a while)
      if (r.waiting && navigator.serviceWorker.controller) setShow(true)
    })

    // When controller changes (after skipWaiting) → reload
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      window.location.reload()
    })
  }, [])

  function applyUpdate() {
    if (reg?.waiting) {
      reg.waiting.postMessage('skipWaiting')
    } else {
      window.location.reload()
    }
  }

  if (!show) return null

  return (
    <div
      className="fixed bottom-5 left-1/2 -translate-x-1/2 z-[200] flex items-center gap-3 px-4 py-3 rounded-2xl shadow-2xl"
      style={{
        background: 'var(--glass-bg)',
        border: '1px solid var(--glass-border)',
        backdropFilter: 'blur(32px) saturate(180%)',
        WebkitBackdropFilter: 'blur(32px) saturate(180%)',
        minWidth: 280,
      }}
    >
      <div className="w-8 h-8 rounded-xl flex items-center justify-center flex-shrink-0"
        style={{ background: 'rgba(99,102,241,0.15)' }}>
        <RefreshCw size={14} style={{ color: '#818cf8' }} />
      </div>
      <div className="flex-1">
        <p className="text-sm font-semibold" style={{ color: 'var(--text-1)' }}>มีเวอร์ชันใหม่</p>
        <p className="text-xs" style={{ color: 'var(--text-3)' }}>อัปเดตโดยไม่ต้องลบแอปใหม่</p>
      </div>
      <button
        onClick={applyUpdate}
        className="px-3 py-1.5 rounded-xl text-xs font-semibold text-white flex-shrink-0"
        style={{ background: 'linear-gradient(135deg,#6366f1,#8b5cf6)' }}
      >
        อัปเดต
      </button>
      <button onClick={() => setShow(false)} className="flex-shrink-0" style={{ color: 'var(--text-3)' }}>
        <X size={14} />
      </button>
    </div>
  )
}
