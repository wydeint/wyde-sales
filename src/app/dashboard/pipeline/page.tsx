'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { ChevronDown, ChevronRight } from 'lucide-react'
import { PageSpinner, PageError } from '@/components/ui/StateUI'

interface Customer {
  id: string; customer_name: string; phone: string
  project_id: string; interested_room: string
  budget: number; status: string; assigned_to: string
  created_at: string
  projects?: { name: string }
  users?: { name: string }
}

const STAGES = [
  { value: 'new',           label: 'ใหม่',         dot: 'bg-blue-400',   border: 'border-blue-500/40',   text: 'text-blue-400',   bg: 'rgba(59,130,246,0.08)' },
  { value: 'interested',    label: 'สนใจ',          dot: 'bg-cyan-400',   border: 'border-cyan-500/40',   text: 'text-cyan-400',   bg: 'rgba(6,182,212,0.08)'  },
  { value: 'quoted',        label: 'เสนอราคาแล้ว',  dot: 'bg-yellow-400', border: 'border-yellow-500/40', text: 'text-yellow-400', bg: 'rgba(234,179,8,0.08)'  },
  { value: 'booked',        label: 'จอง',           dot: 'bg-orange-400', border: 'border-orange-500/40', text: 'text-orange-400', bg: 'rgba(249,115,22,0.08)' },
  { value: 'close_pending', label: 'รอปิด',         dot: 'bg-purple-400', border: 'border-purple-500/40', text: 'text-purple-400', bg: 'rgba(168,85,247,0.08)' },
  { value: 'closed',        label: 'ปิดแล้ว',       dot: 'bg-green-400',  border: 'border-green-500/40',  text: 'text-green-400',  bg: 'rgba(34,197,94,0.08)'  },
]

const f = (v: number) => v ? '฿' + v.toLocaleString() : ''

export default function PipelinePage() {
  const supabase = createClient()
  const [customers, setCustomers] = useState<Customer[]>([])
  const [loading, setLoading] = useState(true)
  const [fetchError, setFetchError] = useState('')
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set(['closed']))

  async function load() {
    setLoading(true)
    setFetchError('')
    const { data, error } = await supabase
      .from('customers')
      .select('id, customer_name, phone, project_id, interested_room, budget, status, assigned_to, created_at, projects(name), users!customers_assigned_to_fkey(name)')
      .neq('status', 'lost')
      .order('created_at', { ascending: false })
    if (error) { setFetchError(error.message); setLoading(false); return }
    setCustomers((data as any) || [])
    setLoading(false)
  }

  useEffect(() => { load() }, [])

  async function updateStatus(id: string, status: string) {
    await supabase.from('customers').update({ status }).eq('id', id)
    setCustomers(prev => prev.map(c => c.id === id ? { ...c, status } : c))
  }

  function toggleCollapse(val: string) {
    setCollapsed(prev => {
      const next = new Set(prev)
      next.has(val) ? next.delete(val) : next.add(val)
      return next
    })
  }

  if (loading) return <PageSpinner />
  if (fetchError) return <PageError message={fetchError} onRetry={load} />

  return (
    <div className="p-6">
      <div className="mb-5">
        <h1 className="text-page-title" style={{ color: 'var(--text-1)' }}>Pipeline</h1>
        <p className="text-sm mt-0.5" style={{ color: 'var(--text-2)' }}>ติดตามสถานะลูกค้าแต่ละขั้น</p>
      </div>

      {/* Summary bar */}
      <div className="flex gap-2 mb-6 flex-wrap">
        {STAGES.map(s => {
          const count = customers.filter(c => c.status === s.value).length
          return (
            <button key={s.value} onClick={() => toggleCollapse(s.value)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-[8px] text-xs font-semibold transition-all border ${s.border} ${collapsed.has(s.value) ? 'opacity-50' : ''}`}
              style={{ background: s.bg, color: 'var(--text-2)' }}>
              <span className={`w-1.5 h-1.5 rounded-full ${s.dot}`} />
              {s.label}
              <span className="font-bold" style={{ color: 'var(--text-1)' }}>{count}</span>
            </button>
          )
        })}
      </div>

      {/* Vertical stages */}
      <div className="space-y-4">
        {STAGES.map(stage => {
          const list = customers.filter(c => c.status === stage.value)
          const isCollapsed = collapsed.has(stage.value)
          return (
            <div key={stage.value} className="rounded-[11px] overflow-hidden" style={{ border: '1px solid var(--card-border)' }}>
              {/* Stage header */}
              <button
                className="w-full flex items-center gap-2.5 px-4 py-2.5 text-left"
                style={{ background: stage.bg, borderBottom: isCollapsed ? 'none' : '1px solid var(--divider)' }}
                onClick={() => toggleCollapse(stage.value)}
              >
                <span className={`w-2 h-2 rounded-full flex-shrink-0 ${stage.dot}`} />
                <span className={`text-section-title ${stage.text}`}>{stage.label}</span>
                <span className="text-xs px-1.5 py-0.5 rounded font-semibold" style={{ background: 'var(--hover-bg)', color: 'var(--text-2)' }}>
                  {list.length}
                </span>
                <span className="ml-auto" style={{ color: 'var(--text-3)' }}>
                  {isCollapsed ? <ChevronRight size={14} /> : <ChevronDown size={14} />}
                </span>
              </button>

              {/* Cards grid */}
              {!isCollapsed && (
                <div className="p-3" style={{ background: 'var(--card-bg)' }}>
                  {list.length === 0 ? (
                    <p className="text-xs text-center py-3 border border-dashed rounded-lg" style={{ borderColor: 'var(--divider)', color: 'var(--text-3)' }}>
                      ไม่มีลูกค้า
                    </p>
                  ) : (
                    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-2">
                      {list.map(c => (
                        <div key={c.id} className={`rounded-[11px] p-2.5 border-l-2 ${stage.border}`}
                          style={{ background: 'var(--hover-bg)', border: '1px solid var(--divider)' }}>
                          <p className="text-card-title leading-snug mb-0.5 truncate" style={{ color: 'var(--text-1)' }} title={c.customer_name}>
                            {c.customer_name}
                          </p>
                          {(c as any).projects?.name && (
                            <p className="text-[10px] truncate mb-0.5" style={{ color: 'var(--accent)' }}>{(c as any).projects.name}</p>
                          )}
                          {c.interested_room && (
                            <p className="text-[10px]" style={{ color: 'var(--text-3)' }}>ห้อง {c.interested_room}</p>
                          )}
                          {(c as any).users?.name && (
                            <p className="text-[10px] mt-0.5 truncate" style={{ color: 'var(--text-3)' }}>{(c as any).users.name}</p>
                          )}
                          {/* Move buttons */}
                          <div className="flex gap-1 mt-1.5 flex-wrap">
                            {STAGES.filter(s => s.value !== stage.value).slice(0, 2).map(s => (
                              <button key={s.value} onClick={() => updateStatus(c.id, s.value)}
                                className={`text-[10px] px-1.5 py-0.5 rounded transition-colors ${s.text}`}
                                style={{ background: s.bg }}>
                                → {s.label}
                              </button>
                            ))}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
