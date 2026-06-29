'use client'

import { useState, useRef, useEffect } from 'react'
import { ChevronDown, Search, X } from 'lucide-react'

interface Option {
  value: string
  label: string
}

interface SearchableSelectProps {
  value: string
  onChange: (value: string) => void
  options: Option[]
  placeholder?: string
  className?: string
  style?: React.CSSProperties
}

export default function SearchableSelect({
  value, onChange, options, placeholder = 'ทั้งหมด', className = '', style,
}: SearchableSelectProps) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const containerRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  const selected = options.find(o => o.value === value)
  const filtered = query
    ? options.filter(o => o.label.toLowerCase().includes(query.toLowerCase()))
    : options

  useEffect(() => {
    if (open) {
      setQuery('')
      setTimeout(() => inputRef.current?.focus(), 50)
    }
  }, [open])

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  return (
    <div ref={containerRef} className={`relative ${className}`} style={style}>
      {/* Trigger */}
      <button
        type="button"
        onClick={() => setOpen(v => !v)}
        className="flex items-center gap-2 w-full px-3 py-2 text-sm rounded-lg text-left"
        style={{
          background: 'var(--card-bg)',
          border: '1px solid var(--card-border)',
          color: selected && selected.value !== '' ? 'var(--text-1)' : 'var(--text-3)',
          minWidth: 140,
        }}
      >
        <span className="flex-1 truncate">{selected && selected.value !== '' ? selected.label : placeholder}</span>
        {value && value !== '' ? (
          <span onClick={e => { e.stopPropagation(); onChange(''); setOpen(false) }} className="flex-shrink-0 hover:opacity-70">
            <X size={12} />
          </span>
        ) : (
          <ChevronDown size={12} className="flex-shrink-0 opacity-50" />
        )}
      </button>

      {/* Dropdown */}
      {open && (
        <div
          className="absolute z-50 mt-1 rounded-xl overflow-hidden shadow-lg"
          style={{
            background: 'var(--glass-bg)',
            backdropFilter: 'blur(24px) saturate(180%)',
            border: '1px solid var(--glass-border)',
            minWidth: '100%',
            width: 'max-content',
            maxWidth: 280,
          }}
        >
          {/* Search input */}
          <div className="flex items-center gap-2 px-3 py-2" style={{ borderBottom: '1px solid var(--divider)' }}>
            <Search size={13} style={{ color: 'var(--text-3)', flexShrink: 0 }} />
            <input
              ref={inputRef}
              value={query}
              onChange={e => setQuery(e.target.value)}
              placeholder="พิมพ์เพื่อค้นหา..."
              className="bg-transparent text-sm outline-none flex-1"
              style={{ color: 'var(--text-1)' }}
            />
          </div>

          {/* Options */}
          <div className="overflow-y-auto" style={{ maxHeight: 220 }}>
            {filtered.length === 0 && (
              <p className="px-3 py-3 text-xs text-center" style={{ color: 'var(--text-3)' }}>ไม่พบผลลัพธ์</p>
            )}
            {filtered.map(o => (
              <button
                key={o.value}
                type="button"
                onClick={() => { onChange(o.value); setOpen(false) }}
                className="w-full text-left px-3 py-2 text-sm transition-colors"
                style={{
                  background: o.value === value ? 'var(--active-bg)' : 'transparent',
                  color: o.value === value ? 'var(--accent)' : 'var(--text-1)',
                }}
                onMouseEnter={e => { if (o.value !== value) (e.currentTarget as HTMLElement).style.background = 'var(--hover-bg)' }}
                onMouseLeave={e => { if (o.value !== value) (e.currentTarget as HTMLElement).style.background = 'transparent' }}
              >
                {o.label}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
