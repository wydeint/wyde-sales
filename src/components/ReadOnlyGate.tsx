'use client'

import { useEffect, useState } from 'react'
import { Eye } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { setReadOnly } from '@/lib/supabase/client'
import { appUserRole, QC_PM_ROLE } from '@/lib/currentUser'

/**
 * Reads the signed-in person's role once and puts the app into read-only mode
 * for QC / PM, plus a bar saying so.
 *
 * The bar is the cheap half of hiding 40–60 buttons: a QC/PM user knows before
 * they start filling anything in, rather than finding out on the save button.
 * The database is what actually stops the write — see the RLS split — so a
 * failure to load the role here is a cosmetic problem, not a security one.
 */
export default function ReadOnlyGate() {
  const [viewer, setViewer] = useState(false)

  useEffect(() => {
    let cancelled = false
    const supabase = createClient()
    appUserRole(supabase).then(role => {
      if (cancelled) return
      const isViewer = role === QC_PM_ROLE
      setReadOnly(isViewer)
      setViewer(isViewer)
    })
    return () => { cancelled = true }
  }, [])

  if (!viewer) return null

  return (
    <div
      className="flex-shrink-0 flex items-center justify-center gap-2 px-4 py-1.5 text-xs font-semibold"
      style={{
        background: 'color-mix(in srgb, var(--accent-blue) 12%, transparent)',
        borderBottom: '1px solid color-mix(in srgb, var(--accent-blue) 30%, transparent)',
        color: 'var(--accent-blue)',
      }}
    >
      <Eye size={13} />
      โหมดดูอย่างเดียว (QC / PM) — เปิดดูและกรองข้อมูลได้ทุกหน้า แต่แก้ไขข้อมูลไม่ได้
    </div>
  )
}
