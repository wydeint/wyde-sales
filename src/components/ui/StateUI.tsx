'use client'

import { AlertCircle, RefreshCw } from 'lucide-react'

/** Accessible CSS spinner — replaces emoji ⏳ across all pages */
export function Spinner({ label = 'กำลังโหลด...' }: { label?: string }) {
  return (
    <div className="flex flex-col items-center gap-3" style={{ color: 'var(--text-3)' }}>
      <div
        className="w-7 h-7 rounded-full border-2 border-t-transparent animate-spin"
        style={{ borderColor: 'var(--accent)', borderTopColor: 'transparent' }}
        role="status"
        aria-label={label}
      />
      <p className="text-sm">{label}</p>
    </div>
  )
}

/** Full-page centered spinner */
export function PageSpinner() {
  return (
    <div className="flex items-center justify-center h-64">
      <Spinner />
    </div>
  )
}

/** Full-page error with retry */
export function PageError({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <div className="flex items-center justify-center h-64">
      <div className="flex flex-col items-center gap-3 text-center max-w-xs">
        <AlertCircle size={28} style={{ color: 'var(--accent-orange)' }} />
        <p className="text-sm font-medium" style={{ color: 'var(--text-1)' }}>โหลดข้อมูลไม่สำเร็จ</p>
        <p className="text-xs" style={{ color: 'var(--text-3)' }}>{message}</p>
        <button
          onClick={onRetry}
          className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium transition-colors"
          style={{ background: 'var(--active-bg)', color: 'var(--accent)' }}
        >
          <RefreshCw size={14} aria-hidden="true" />ลองใหม่
        </button>
      </div>
    </div>
  )
}

/** Inline table-cell spinner (use inside <tr><td>) */
export function TableSpinner({ colSpan }: { colSpan: number }) {
  return (
    <tr>
      <td colSpan={colSpan} className="py-12 text-center">
        <div className="flex flex-col items-center gap-2" style={{ color: 'var(--text-3)' }}>
          <div
            className="w-6 h-6 rounded-full border-2 border-t-transparent animate-spin"
            style={{ borderColor: 'var(--accent)', borderTopColor: 'transparent' }}
            role="status"
            aria-label="กำลังโหลด"
          />
          <span className="text-sm">กำลังโหลด...</span>
        </div>
      </td>
    </tr>
  )
}

/** Inline table-cell error (use inside <tr><td>) */
export function TableError({ colSpan, message, onRetry }: { colSpan: number; message: string; onRetry: () => void }) {
  return (
    <tr>
      <td colSpan={colSpan} className="py-12 text-center">
        <div className="flex flex-col items-center gap-2">
          <AlertCircle size={24} style={{ color: 'var(--accent-orange)' }} aria-hidden="true" />
          <p className="text-sm" style={{ color: 'var(--text-2)' }}>โหลดข้อมูลไม่สำเร็จ</p>
          <button
            onClick={onRetry}
            className="flex items-center gap-1 text-xs px-3 py-1.5 rounded-lg"
            style={{ background: 'var(--active-bg)', color: 'var(--accent)' }}
          >
            <RefreshCw size={12} aria-hidden="true" />ลองใหม่
          </button>
        </div>
      </td>
    </tr>
  )
}
