'use client'

import { useEffect, useId, useRef } from 'react'
import { X } from 'lucide-react'

interface ModalProps {
  open: boolean
  onClose: () => void
  title: string
  children: React.ReactNode
  size?: 'sm' | 'md' | 'lg'
}

const FOCUSABLE = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(', ')

export default function Modal({ open, onClose, title, children, size = 'md' }: ModalProps) {
  const titleId = useId()
  const dialogRef = useRef<HTMLDivElement>(null)
  const previousFocus = useRef<HTMLElement | null>(null)

  const widths = { sm: 'max-w-md', md: 'max-w-xl', lg: 'max-w-3xl' }

  useEffect(() => {
    if (!open) return

    // Store element that had focus before modal opened
    previousFocus.current = document.activeElement as HTMLElement

    // Move focus into dialog on next tick (after render)
    const raf = requestAnimationFrame(() => {
      const first = dialogRef.current?.querySelectorAll<HTMLElement>(FOCUSABLE)[0]
      first ? first.focus() : dialogRef.current?.focus()
    })

    function handleKey(e: KeyboardEvent) {
      if (e.key === 'Escape') { onClose(); return }
      if (e.key !== 'Tab') return

      const focusable = Array.from(
        dialogRef.current?.querySelectorAll<HTMLElement>(FOCUSABLE) ?? []
      )
      if (!focusable.length) return

      const first = focusable[0]
      const last = focusable[focusable.length - 1]

      if (e.shiftKey) {
        if (document.activeElement === first) { e.preventDefault(); last.focus() }
      } else {
        if (document.activeElement === last) { e.preventDefault(); first.focus() }
      }
    }

    document.addEventListener('keydown', handleKey)
    return () => {
      cancelAnimationFrame(raf)
      document.removeEventListener('keydown', handleKey)
      // Restore focus to triggering element when modal closes
      previousFocus.current?.focus()
    }
  }, [open, onClose])

  if (!open) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop */}
      <div
        className="absolute inset-0"
        style={{ background: 'rgba(0,0,0,0.60)' }}
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Dialog */}
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        className={`relative w-full ${widths[size]} max-h-[90vh] overflow-y-auto rounded-xl focus:outline-none`}
        style={{
          background: 'var(--glass-bg)',
          backdropFilter: 'blur(24px) saturate(180%)',
          WebkitBackdropFilter: 'blur(24px) saturate(180%)',
          border: '1px solid var(--glass-border)',
          boxShadow: 'var(--glass-shadow)',
        }}
      >
        {/* Header */}
        <div
          className="flex items-center justify-between p-5"
          style={{ borderBottom: '1px solid var(--divider)' }}
        >
          <h2 id={titleId} className="font-semibold text-base" style={{ color: 'var(--text-1)' }}>
            {title}
          </h2>
          <button
            onClick={onClose}
            aria-label="ปิด"
            className="w-8 h-8 flex items-center justify-center rounded-lg transition-colors"
            style={{ color: 'var(--text-3)' }}
            onMouseEnter={e => (e.currentTarget.style.background = 'var(--hover-bg)')}
            onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
          >
            <X size={16} />
          </button>
        </div>

        {/* Body */}
        <div className="p-5">{children}</div>
      </div>
    </div>
  )
}
