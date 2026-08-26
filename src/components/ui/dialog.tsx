'use client'

import { useEffect, useState } from 'react'
import Modal from '@/components/ui/Modal'

/**
 * The app's own replacement for window.alert / window.confirm.
 *
 * Twenty-four call sites used the browser's native dialogs. They look like
 * nothing else in the product — a grey OS box with an OK button, in the
 * browser's own font — and `alert` freezes the whole page until it is
 * dismissed, which is how a "กรุณากรอกงบก่อน" message read as the app hanging.
 *
 * The API is imperative and awaited on purpose, so replacing a call is one
 * line and the surrounding control flow is unchanged:
 *
 *     if (!confirm('ลบงวดนี้?')) return      →   if (!await showConfirm(...)) return
 *     alert('บันทึกไม่สำเร็จ: ' + e.message) →   await showAlert(...)
 *
 * `<DialogHost />` must be mounted once, high in the tree — DashboardShell does
 * it. Calling before it mounts falls back to the native dialog rather than
 * dropping the message on the floor.
 */

type Req = {
  title: string
  message: string
  kind: 'alert' | 'confirm'
  tone: 'normal' | 'danger'
  confirmLabel: string
  resolve: (ok: boolean) => void
}

let push: ((r: Req) => void) | null = null

export function showAlert(message: string, opts?: { title?: string; tone?: 'normal' | 'danger' }): Promise<boolean> {
  if (!push) { window.alert(message); return Promise.resolve(true) }
  return new Promise(resolve => push!({
    title: opts?.title ?? 'แจ้งเตือน', message, kind: 'alert',
    tone: opts?.tone ?? 'normal', confirmLabel: 'ตกลง', resolve,
  }))
}

export function showConfirm(message: string, opts?: { title?: string; confirmLabel?: string; tone?: 'normal' | 'danger' }): Promise<boolean> {
  if (!push) return Promise.resolve(window.confirm(message))
  return new Promise(resolve => push!({
    title: opts?.title ?? 'ยืนยัน', message, kind: 'confirm',
    tone: opts?.tone ?? 'danger', confirmLabel: opts?.confirmLabel ?? 'ยืนยัน', resolve,
  }))
}

export default function DialogHost() {
  // A queue, not a single slot: two messages in a row (a failed save followed
  // by a failed follow-up write) would otherwise overwrite each other and the
  // first promise would never settle.
  const [queue, setQueue] = useState<Req[]>([])
  const current = queue[0]

  useEffect(() => {
    push = r => setQueue(q => [...q, r])
    return () => { push = null }
  }, [])

  function close(ok: boolean) {
    if (!current) return
    current.resolve(ok)
    setQueue(q => q.slice(1))
  }

  // Drawers and Modal both sit at z-50, and the host mounts before them, so
  // without its own stacking context the message paints *behind* the drawer
  // that raised it. This wrapper puts every dialog above all of them.
  return (
    <div className="relative z-[100]">
    <Modal open={!!current} title={current?.title ?? ''} size="sm" onClose={() => close(false)}>
      {current && (
        <div className="space-y-4">
          <p className="text-sm whitespace-pre-line" style={{ color: 'var(--text-2)' }}>{current.message}</p>
          <div className="flex gap-2 pt-1">
            {current.kind === 'confirm' && (
              <button onClick={() => close(false)}
                className="flex-1 py-2.5 rounded-[8px] text-sm"
                style={{ border: '1px solid var(--divider)', color: 'var(--text-2)' }}>
                ยกเลิก
              </button>
            )}
            <button onClick={() => close(true)} autoFocus
              className="flex-1 py-2.5 rounded-[8px] text-sm font-semibold text-white"
              style={{ background: current.tone === 'danger' && current.kind === 'confirm' ? 'var(--accent-red)' : 'var(--accent)' }}>
              {current.confirmLabel}
            </button>
          </div>
        </div>
      )}
    </Modal>
    </div>
  )
}
