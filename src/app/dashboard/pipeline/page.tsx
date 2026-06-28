'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { TrendingUp } from 'lucide-react'
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
  { value: 'new', label: 'ใหม่', color: 'border-blue-500', bg: 'bg-blue-500/10', dot: 'bg-blue-400' },
  { value: 'interested', label: 'สนใจ', color: 'border-cyan-500', bg: 'bg-cyan-500/10', dot: 'bg-cyan-400' },
  { value: 'quoted', label: 'เสนอราคา', color: 'border-yellow-500', bg: 'bg-yellow-500/10', dot: 'bg-yellow-400' },
  { value: 'booked', label: 'จอง', color: 'border-orange-500', bg: 'bg-orange-500/10', dot: 'bg-orange-400' },
  { value: 'close_pending', label: 'รอปิด', color: 'border-purple-500', bg: 'bg-purple-500/10', dot: 'bg-purple-400' },
  { value: 'closed', label: 'ปิดแล้ว', color: 'border-green-500', bg: 'bg-green-500/10', dot: 'bg-green-400' },
]

const f = (v: number) => v ? '฿' + v.toLocaleString() : '-'

export default function PipelinePage() {
  const supabase = createClient()
  const [customers, setCustomers] = useState<Customer[]>([])
  const [loading, setLoading] = useState(true)
  const [fetchError, setFetchError] = useState('')

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

  if (loading) return <PageSpinner />
  if (fetchError) return <PageError message={fetchError} onRetry={load} />

  return (
    <div className="p-6">
      <div className="mb-6">
        <h1 className="text-xl font-bold" style={{ color: 'var(--text-1)' }}>Pipeline</h1>
        <p className="text-sm mt-0.5" style={{ color: 'var(--text-2)' }}>ติดตามสถานะลูกค้าแต่ละขั้น</p>
      </div>

      {/* Summary bar */}
      <div className="grid grid-cols-3 md:grid-cols-6 gap-3 mb-6">
        {STAGES.map(s => {
          const list = customers.filter(c => c.status === s.value)
          const total = list.reduce((sum, c) => sum + (c.budget || 0), 0)
          return (
            <div key={s.value} className={`rounded-xl p-3 border-t-2 ${s.color}`} style={{ background: 'var(--card-bg)', border: '1px solid var(--card-border)', borderTopColor: undefined }}>
              <p className="text-xs mb-1" style={{ color: 'var(--text-2)' }}>{s.label}</p>
              <p className="text-lg font-bold" style={{ color: 'var(--text-1)' }}>{list.length}</p>
              {total > 0 && <p className="text-xs mt-0.5" style={{ color: 'var(--text-3)' }}>{f(total)}</p>}
            </div>
          )
        })}
      </div>

      {/* Kanban columns */}
      <div className="flex gap-4 overflow-x-auto pb-4">
        {STAGES.map(stage => {
          const list = customers.filter(c => c.status === stage.value)
          return (
            <div key={stage.value} className="flex-shrink-0 w-64">
              <div className={`flex items-center gap-2 mb-3 px-1`}>
                <div className={`w-2 h-2 rounded-full ${stage.dot}`} />
                <span className="text-xs font-medium" style={{ color: 'var(--text-2)' }}>{stage.label}</span>
                <span className="ml-auto text-xs px-1.5 py-0.5 rounded" style={{ color: 'var(--text-3)', background: 'var(--hover-bg)' }}>{list.length}</span>
              </div>
              <div className="space-y-2">
                {list.map(c => (
                  <div key={c.id} className={`rounded-xl p-3 ${stage.bg} border-l-2 ${stage.color}`} style={{ background: 'var(--card-bg)', border: '1px solid var(--card-border)' }}>
                    <div className="flex items-start justify-between gap-2 mb-2">
                      <div>
                        <p className="text-sm font-medium leading-tight" style={{ color: 'var(--text-1)' }}>{c.customer_name}</p>
                        <p className="text-xs font-mono" style={{ color: 'var(--text-3)' }}>{c.id}</p>
                      </div>
                    </div>
                    {(c as any).projects?.name && (
                      <p className="text-[#58a6ff] text-xs mb-1">{(c as any).projects.name}</p>
                    )}
                    {c.interested_room && (
                      <p className="text-xs mb-1" style={{ color: 'var(--text-2)' }}>ห้อง {c.interested_room}</p>
                    )}
                    {c.budget > 0 && (
                      <p className="text-green-400 text-xs font-medium mb-2">{f(c.budget)}</p>
                    )}
                    {(c as any).users?.name && (
                      <p className="text-xs" style={{ color: 'var(--text-3)' }}>👤 {(c as any).users.name}</p>
                    )}
                    {/* Move buttons */}
                    <div className="flex gap-1 mt-2 flex-wrap">
                      {STAGES.filter(s => s.value !== stage.value).slice(0, 3).map(s => (
                        <button key={s.value} onClick={() => updateStatus(c.id, s.value)}
                          className={`text-xs px-2 py-0.5 rounded border ${s.color} ${s.bg} hover:text-white transition-colors`} style={{ color: 'var(--text-2)' }}>
                          → {s.label}
                        </button>
                      ))}
                    </div>
                  </div>
                ))}
                {list.length === 0 && (
                  <div className="rounded-xl p-4 text-center text-xs border border-dashed" style={{ borderColor: 'var(--divider)', color: 'var(--text-3)' }}>
                    ไม่มีลูกค้า
                  </div>
                )}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
