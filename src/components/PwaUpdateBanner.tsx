'use client'

import { useEffect, useRef, useState } from 'react'
import { RefreshCw, X } from 'lucide-react'

const POLL_INTERVAL = 5 * 60 * 1000
const VERSION_KEY = 'wyde_app_version'

export default function PwaUpdateBanner() {
  const [show, setShow] = useState(false)
  const [updating, setUpdating] = useState(false)
  const latestVersionRef = useRef<string | null>(null)

  useEffect(() => {
    if (typeof window === 'undefined') return

    // ── Service Worker registration ─────────────────────────
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('/sw.js').catch(() => {})

      navigator.serviceWorker.ready.then(reg => {
        if (reg.waiting) setShow(true)
        reg.addEventListener('updatefound', () => {
          const newSW = reg.installing
          if (!newSW) return
          newSW.addEventListener('statechange', () => {
            if (newSW.state === 'installed') setShow(true)
          })
        })
      })

      // Reload when new SW takes control — no stale closure needed
      navigator.serviceWorker.addEventListener('controllerchange', () => {
        window.location.reload()
      })
    }

    // ── Version polling ─────────────────────────────────────
    async function checkVersion() {
      try {
        const res = await fetch('/api/version', { cache: 'no-store' })
        if (!res.ok) return
        const { version } = await res.json()
        if (!version || version === 'dev') return

        latestVersionRef.current = version // always keep latest in ref

        const stored = localStorage.getItem(VERSION_KEY)
        if (!stored) {
          localStorage.setItem(VERSION_KEY, version)
          return
        }
        if (stored !== version) setShow(true)
      } catch { /* ignore network errors */ }
    }

    checkVersion()
    const timer = setInterval(checkVersion, POLL_INTERVAL)
    return () => clearInterval(timer)
  }, [])

  function applyUpdate() {
    setUpdating(true)
    setShow(false) // hide banner immediately

    // Save new version NOW (before reload) so banner doesn't re-appear
    if (latestVersionRef.current) {
      localStorage.setItem(VERSION_KEY, latestVersionRef.current)
    }

    // Tell waiting SW to activate (if any)
    navigator.serviceWorker?.ready.then(reg => {
      if (reg.waiting) {
        reg.waiting.postMessage('skipWaiting')
        // controllerchange event will trigger reload
      } else {
        window.location.reload()
      }
    }).catch(() => window.location.reload())

    // Hard fallback in case SW events don't fire
    setTimeout(() => window.location.reload(), 1500)
  }

  if (!show) return null

  return (
    <div
      className="fixed bottom-5 left-4 right-4 z-[500] flex items-center gap-3 px-4 py-3 rounded-2xl shadow-2xl"
      style={{
        background: 'linear-gradient(135deg, rgba(99,102,241,0.95), rgba(139,92,246,0.95))',
        backdropFilter: 'blur(20px)',
        WebkitBackdropFilter: 'blur(20px)',
        maxWidth: 420,
        margin: '0 auto',
      }}
    >
      <div className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 bg-white/20">
        <RefreshCw size={16} className="text-white" />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-bold text-white">มีเวอร์ชันใหม่พร้อมใช้งาน</p>
        <p className="text-xs text-white/75">กด อัปเดต เพื่อใช้งานเวอร์ชันล่าสุด</p>
      </div>
      <button
        onClick={applyUpdate}
        disabled={updating}
        className="px-4 py-2 rounded-xl text-xs font-bold bg-white text-indigo-600 flex-shrink-0 disabled:opacity-60"
      >
        {updating ? '⏳' : 'อัปเดต'}
      </button>
      <button onClick={() => setShow(false)} className="flex-shrink-0 text-white/70 hover:text-white p-1">
        <X size={16} />
      </button>
    </div>
  )
}
