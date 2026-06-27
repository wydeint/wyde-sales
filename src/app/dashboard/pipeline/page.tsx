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
        <h1 className="text-white text-xl font-bold">Pipeline</h1>
        <p className="text-[#8b949e] text-sm mt-0.5">ติดตามสถานะลูกค้าแต่ละขั้น</p>
      </div>

      {/* Summary bar */}
      <div className="grid grid-cols-3 md:grid-cols-6 gap-3 mb-6">
        {STAGES.map(s => {
          const list = customers.filter(c => c.status === s.value)
          const total = list.reduce((sum, c) => sum + (c.budget || 0), 0)
          return (
            <div key={s.value} className={`bg-[#161b22] border border-[#30363d] rounded-xl p-3 border-t-2 ${s.color}`}>
              <p className="text-[#8b949e] text-xs mb-1">{s.label}</p>
              <p className="text-white text-lg font-bold">{list.length}</p>
              {total > 0 && <p className="text-[#484f58] text-xs mt-0.5">{f(total)}</p>}
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
                <span className="text-[#8b949e] text-xs font-medium">{stage.label}</span>
                <span className="ml-auto text-[#484f58] text-xs bg-[#21262d] px-1.5 py-0.5 rounded">{list.length}</span>
              </div>
              <div className="space-y-2">
                {list.map(c => (
                  <div key={c.id} className={`bg-[#161b22] border border-[#30363d] rounded-xl p-3 ${stage.bg} border-l-2 ${stage.color}`}>
                    <div className="flex items-start justify-between gap-2 mb-2">
                      <div>
                        <p className="text-white text-sm font-medium leading-tight">{c.customer_name}</p>
                        <p className="text-[#484f58] text-xs font-mono">{c.id}</p>
                      </div>
                    </div>
                    {(c as any).projects?.name && (
                      <p className="text-[#58a6ff] text-xs mb-1">{(c as any).projects.name}</p>
                    )}
                    {c.interested_room && (
                      <p className="text-[#c9d1d9] text-xs mb-1">ห้อง {c.interested_room}</p>
                    )}
                    {c.budget > 0 && (
                      <p className="text-green-400 text-xs font-medium mb-2">{f(c.budget)}</p>
                    )}
                    {(c as any).users?.name && (
                      <p className="text-[#484f58] text-xs">👤 {(c as any).users.name}</p>
                    )}
                    {/* Move buttons */}
                    <div className="flex gap-1 mt-2 flex-wrap">
                      {STAGES.filter(s => s.value !== stage.value).slice(0, 3).map(s => (
                        <button key={s.value} onClick={() => updateStatus(c.id, s.value)}
                          className={`text-xs px-2 py-0.5 rounded border ${s.color} ${s.bg} text-[#8b949e] hover:text-white transition-colors`}>
                          → {s.label}
                        </button>
                      ))}
                    </div>
                  </div>
                ))}
                {list.length === 0 && (
                  <div className="border border-dashed border-[#30363d] rounded-xl p-4 text-center text-[#484f58] text-xs">
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
