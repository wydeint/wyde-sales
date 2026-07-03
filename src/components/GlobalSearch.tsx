'use client'

import { useEffect, useRef, useState } from 'react'
import { Search, Users, Briefcase, X } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'

interface SearchResult {
  type: 'customer' | 'job'
  id: string
  title: string
  subtitle: string
  href: string
}

interface GlobalSearchProps {
  open: boolean
  onClose: () => void
}

export default function GlobalSearch({ open, onClose }: GlobalSearchProps) {
  const supabase = createClient()
  const router = useRouter()
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<SearchResult[]>([])
  const [loading, setLoading] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (open) {
      setQuery(''); setResults([])
      setTimeout(() => inputRef.current?.focus(), 50)
    }
  }, [open])

  useEffect(() => {
    const q = query.trim()
    if (q.length < 2) { setResults([]); return }
    const timeout = setTimeout(async () => {
      setLoading(true)
      const [{ data: customers }, { data: jobs }] = await Promise.all([
        supabase.from('customers')
          .select('id, customer_name, phone, status')
          .or(`customer_name.ilike.%${q}%,phone.ilike.%${q}%`)
          .limit(5),
        supabase.from('jobs')
          .select('id, customer_name, room_no, working_status')
          .or(`customer_name.ilike.%${q}%,room_no.ilike.%${q}%`)
          .limit(5),
      ])

      const res: SearchResult[] = [
        ...(customers || []).map((c: any) => ({
          type: 'customer' as const,
          id: c.id,
          title: c.customer_name,
          subtitle: `${c.phone || '—'} · ${c.status}`,
          href: '/dashboard/customers',
        })),
        ...(jobs || []).map((j: any) => ({
          type: 'job' as const,
          id: j.id,
          title: j.customer_name,
          subtitle: `ห้อง ${j.room_no} · ${j.working_status}`,
          href: '/dashboard/jobs',
        })),
      ]
      setResults(res)
      setLoading(false)
    }, 250)
    return () => clearTimeout(timeout)
  }, [query])

  if (!open) return null

  return (
    <div className="fixed inset-0 z-[300] flex items-start justify-center pt-20 px-4" onClick={onClose}>
      <div className="absolute inset-0" style={{ background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(6px)' }} />
      <div className="relative w-full max-w-lg rounded-[18px] shadow-2xl overflow-hidden" style={{ background: 'var(--card-bg)', border: '1px solid var(--divider)' }}
        onClick={e => e.stopPropagation()}>
        {/* Input */}
        <div className="flex items-center gap-3 px-4 py-3" style={{ borderBottom: '1px solid var(--divider)' }}>
          <Search size={16} style={{ color: 'var(--text-3)', flexShrink: 0 }} />
          <input
            ref={inputRef}
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder="ค้นหาชื่อลูกค้า เบอร์โทร ห้อง..."
            className="flex-1 bg-transparent outline-none text-sm"
            style={{ color: 'var(--text-1)' }}
            onKeyDown={e => { if (e.key === 'Escape') onClose() }}
          />
          {query && (
            <button onClick={() => setQuery('')} style={{ color: 'var(--text-3)' }}><X size={14} /></button>
          )}
          <kbd className="text-[10px] px-1.5 py-0.5 rounded" style={{ background: 'var(--hover-bg)', color: 'var(--text-3)' }}>ESC</kbd>
        </div>

        {/* Results */}
        <div className="max-h-72 overflow-y-auto">
          {loading && (
            <div className="py-6 text-center text-xs" style={{ color: 'var(--text-3)' }}>กำลังค้นหา...</div>
          )}
          {!loading && query.length >= 2 && results.length === 0 && (
            <div className="py-8 text-center text-sm" style={{ color: 'var(--text-3)' }}>ไม่พบผลลัพธ์</div>
          )}
          {!loading && results.length > 0 && (
            <div>
              {['customer', 'job'].map(type => {
                const section = results.filter(r => r.type === type)
                if (!section.length) return null
                const Icon = type === 'customer' ? Users : Briefcase
                const label = type === 'customer' ? 'ลูกค้า' : 'งาน'
                return (
                  <div key={type}>
                    <div className="px-4 py-2" style={{ borderBottom: '1px solid var(--divider)', background: 'var(--hover-bg)' }}>
                      <span className="text-[10px] font-bold uppercase tracking-wider" style={{ color: 'var(--text-3)' }}>{label}</span>
                    </div>
                    {section.map(r => (
                      <button key={r.id} onClick={() => { router.push(r.href); onClose() }}
                        className="w-full text-left px-4 py-3 flex items-center gap-3 transition-colors"
                        style={{ borderBottom: '1px solid var(--divider)' }}
                        onMouseEnter={e => (e.currentTarget.style.background = 'var(--hover-bg)')}
                        onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}>
                        <Icon size={14} style={{ color: 'var(--text-3)', flexShrink: 0 }} />
                        <div>
                          <p className="text-sm font-semibold" style={{ color: 'var(--text-1)' }}>{r.title}</p>
                          <p className="text-xs" style={{ color: 'var(--text-3)' }}>{r.subtitle}</p>
                        </div>
                      </button>
                    ))}
                  </div>
                )
              })}
            </div>
          )}
          {query.length < 2 && (
            <div className="py-8 text-center text-xs" style={{ color: 'var(--text-3)' }}>
              พิมพ์อย่างน้อย 2 ตัวอักษร
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
