'use client'

import { crmStage, workingStatus, paymentStatus, type StatusEntry } from '@/lib/status'

type Kind = 'crm' | 'working' | 'payment'

const RESOLVE: Record<Kind, (s: string | null | undefined) => StatusEntry> = {
  crm: crmStage,
  working: workingStatus,
  payment: paymentStatus,
}

/**
 * Status chip for the three status vocabularies.
 *
 * `variant="solid"` is the plain `.badge` pill — use it in tables and headers.
 * `variant="outline"` adds a tinted background, border and leading dot; it is
 * the denser treatment the card views (My Deals, Prospects, Job drawer) were
 * each hand-rolling with their own inline style objects.
 */
export default function StatusChip({
  kind,
  status,
  variant = 'solid',
  showDot = false,
  className = '',
}: {
  kind: Kind
  status: string | null | undefined
  variant?: 'solid' | 'outline'
  showDot?: boolean
  className?: string
}) {
  const s = RESOLVE[kind](status)

  if (variant === 'solid') {
    return (
      <span className={`${s.badge} ${className}`.trim()}>
        {showDot && <Dot color={s.color} />}
        {s.label}
      </span>
    )
  }

  return (
    <span
      className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-[4px] text-xs font-semibold ${className}`.trim()}
      style={{
        background: `color-mix(in srgb, ${s.color} 12%, transparent)`,
        border: `1px solid color-mix(in srgb, ${s.color} 35%, transparent)`,
        color: s.color,
      }}
    >
      {showDot && <Dot color={s.color} />}
      {s.label}
    </span>
  )
}

function Dot({ color }: { color: string }) {
  return (
    <span
      aria-hidden="true"
      style={{ width: 6, height: 6, borderRadius: '50%', background: color, flexShrink: 0, display: 'block' }}
    />
  )
}
