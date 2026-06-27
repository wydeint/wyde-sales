'use client'

import { useEffect, useRef, useState } from 'react'
import { RefreshCw, X } from 'lucide-react'

const POLL_INTERVAL = 5 * 60 * 1000 // 5 minutes
const VERSION_KEY = 'wyde_app_version'

export default function PwaUpdateBanner() {
  const [show, setShow] = useState(false)
  const [updating, setUpdating] = useState(false)
  const pollRef = useRef<ReturnType<typeof setInterval>>(undefined)

  useEffect(() => {
    if (typeof window === 'undefined') return

    // ── 1. Register Service Worker ──────────────────────────
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('/sw.js').catch(() => {})

      // SW waiting already (e.g. user came back after long time)
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

      // Reload when new SW takes control
      navigator.serviceWorker.addEventListener('controllerchange', () => {
        if (updating) window.location.reload()
      })
    }

    // ── 2. Version polling — detects Vercel re-deploys ──────
    async function checkVersion() {
      try {
        const res = await fetch('/api/version', { cache: 'no-store' })
        if (!res.ok) return
        const { version } = await res.json()
        if (!version || version === 'dev') return

        const stored = localStorage.getItem(VERSION_KEY)
        if (!stored) {
          // First visit — store current version
          localStorage.setItem(VERSION_KEY, version)
          return
        }
        if (stored !== version) {
          // New version deployed
          setShow(true)
        }
      } catch {
        // Network error — ignore silently
      }
    }

    checkVersion()
    pollRef.current = setInterval(checkVersion, POLL_INTERVAL)

    return () => clearInterval(pollRef.current)
  }, [])

  function applyUpdate() {
    setUpdating(true)
    // Update stored version
    fetch('/api/version', { cache: 'no-store' })
      .then(r => r.json())
      .then(({ version }) => { if (version) localStorage.setItem(VERSION_KEY, version) })
      .catch(() => {})

    // Tell waiting SW to activate
    navigator.serviceWorker?.ready.then(reg => {
      if (reg.waiting) {
        reg.waiting.postMessage('skipWaiting')
      } else {
        window.location.reload()
      }
    }).catch(() => window.location.reload())

    // Fallback reload after 1s if controllerchange doesn't fire
    setTimeout(() => window.location.reload(), 1200)
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
