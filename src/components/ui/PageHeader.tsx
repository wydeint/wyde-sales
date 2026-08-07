'use client'

import type React from 'react'

/**
 * Canonical page header — title, optional subtitle, optional right-side actions.
 *
 * Replaces the hand-copied h1 + p block that had drifted into four different
 * treatments across the dashboard (text-sm/--text-2, text-sm/--text-3,
 * text-xs/--text-3, and none). Subtitle uses --text-2 per color.md, which
 * assigns --text-2 to descriptions and --text-3 to muted/placeholder text.
 *
 * `className` replaces the default bottom margin — pass "" or "mb-0" on pages
 * whose wrapper already spaces children with space-y-*.
 */
export default function PageHeader({
  title,
  subtitle,
  actions,
  className,
}: {
  title: React.ReactNode
  subtitle?: React.ReactNode
  actions?: React.ReactNode
  className?: string
}) {
  return (
    <div className={`flex items-center justify-between gap-3 flex-wrap ${className ?? 'mb-6'}`}>
      <div className="min-w-0">
        <h1 className="text-page-title" style={{ color: 'var(--text-1)' }}>{title}</h1>
        {subtitle && (
          <p className="text-sm mt-0.5" style={{ color: 'var(--text-2)' }}>{subtitle}</p>
        )}
      </div>
      {actions && <div className="flex items-center gap-2 flex-shrink-0">{actions}</div>}
    </div>
  )
}
