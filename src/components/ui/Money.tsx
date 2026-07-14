'use client'

import { fmtMoney, fmtCompact } from '@/lib/utils'

type Props = {
  value: number | null | undefined
  prefix?: string   // e.g. "฿"
  className?: string
}

// Desktop: full value (1,500,000)
// Mobile:  compact   (1.5M) — switches at sm breakpoint (640px)
export default function Money({ value, prefix = '', className = '' }: Props) {
  return (
    <span className={className}>
      <span className="hidden sm:inline">{prefix}{fmtMoney(value)}</span>
      <span className="sm:hidden">{prefix}{fmtCompact(value)}</span>
    </span>
  )
}
