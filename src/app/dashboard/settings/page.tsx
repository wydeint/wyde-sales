'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Settings2, Save, RefreshCw } from 'lucide-react'

type Tier = {
  id: number
  tier_name: string
  revenue_min: number
  revenue_max: number | null
  rate: number
  active: boolean
  sort_order: number
}

const f = (v: number) => '฿' + Math.round(v).toLocaleString()

export default function SettingsPage() {
  const supabase = createClient()
  const [tiers, setTiers] = useState<Tier[]>([])
  const [myRole, setMyRole] = useState('')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    async function load() {
      const { data: { user } } = await supabase.auth.getUser()
      if (user) {
        const { data: u } = await supabase.from('users').select('role').eq('email', user.email!).single()
        if (u) setMyRole(u.role)
      }
      const { data } = await supabase.from('commission_settings').select('*').order('sort_order')
      setTiers(data || [])
      setLoading(false)
    }
    load()
  }, [])

  function updateTier(id: number, field: keyof Tier, value: any) {
    setTiers(prev => prev.map(t => t.id === id ? { ...t, [field]: value } : t))
  }

  async function save() {
    setSaving(true)
    for (const t of tiers) {
      await supabase.from('commission_settings').update({
        tier_name: t.tier_name,
        revenue_min: t.revenue_min,
        revenue_max: t.revenue_max,
        rate: t.rate,
        active: t.active,
        sort_order: t.sort_order,
      }).eq('id', t.id)
    }
    setSaving(false)
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  }

  const isAdmin = myRole === 'admin'

  if (loading) return (
    <div className="flex items-center justify-center h-full" style={{ color: 'var(--text-3)' }}>
      <p className="text-sm">กำลังโหลด...</p>
    </div>
  )

  return (
    <div className="p-6 space-y-6 max-w-2xl">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold" style={{ color: 'var(--text-1)' }}>ตั้งค่าระบบ</h1>
          <p className="text-xs mt-0.5" style={{ color: 'var(--text-3)' }}>Commission tiers ปรับได้โดย Admin</p>
        </div>
        {isAdmin && (
          <button onClick={save} disabled={saving}
            className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold text-white"
            style={{ background: saved ? 'rgba(74,222,128,0.8)' : 'linear-gradient(135deg,#6366f1,#8b5cf6)', opacity: saving ? 0.7 : 1 }}>
            {saved ? <><RefreshCw size={14} /> บันทึกแล้ว!</> : <><Save size={14} /> บันทึก</>}
          </button>
        )}
      </div>

      {/* Commission Tiers */}
      <div className="glass-card p-5">
        <div className="flex items-center gap-2 mb-4">
          <Settings2 size={15} style={{ color: 'var(--accent)' }} />
          <h2 className="font-semibold text-sm" style={{ color: 'var(--text-1)' }}>Commission Tiers</h2>
          <span className="text-xs ml-auto" style={{ color: 'var(--text-3)' }}>คำนวณจาก Revenue (Ex.VAT)</span>
        </div>

        <div className="space-y-2">
          {/* Header */}
          <div className="grid grid-cols-12 gap-2 px-2 pb-1" style={{ borderBottom: '1px solid var(--divider)' }}>
            {['ชื่อ Tier', 'Revenue ขั้นต่ำ', 'Revenue สูงสุด', 'Rate (%)', 'ใช้งาน'].map(h => (
              <span key={h} className={`text-xs font-semibold col-span-${h === 'ชื่อ Tier' ? 3 : h === 'ใช้งาน' ? 2 : 'auto'}`}
                style={{ color: 'var(--text-3)' }}>{h}</span>
            ))}
          </div>

          {tiers.map(t => (
            <div key={t.id} className="grid grid-cols-12 gap-2 items-center py-1">
              <div className="col-span-3">
                {isAdmin ? (
                  <input value={t.tier_name} onChange={e => updateTier(t.id, 'tier_name', e.target.value)}
                    className="field-input w-full text-xs" />
                ) : (
                  <span className="text-sm font-medium" style={{ color: 'var(--text-1)' }}>{t.tier_name}</span>
                )}
              </div>
              <div className="col-span-3">
                {isAdmin ? (
                  <input type="number" value={t.revenue_min} onChange={e => updateTier(t.id, 'revenue_min', +e.target.value)}
                    className="field-input w-full text-xs" />
                ) : (
                  <span className="text-xs" style={{ color: 'var(--text-2)' }}>{f(t.revenue_min)}</span>
                )}
              </div>
              <div className="col-span-3">
                {isAdmin ? (
                  <input type="number" value={t.revenue_max ?? ''} onChange={e => updateTier(t.id, 'revenue_max', e.target.value === '' ? null : +e.target.value)}
                    className="field-input w-full text-xs" placeholder="ไม่จำกัด" />
                ) : (
                  <span className="text-xs" style={{ color: 'var(--text-2)' }}>{t.revenue_max ? f(t.revenue_max) : 'ไม่จำกัด'}</span>
                )}
              </div>
              <div className="col-span-2">
                {isAdmin ? (
                  <div className="flex items-center gap-1">
                    <input type="number" step="0.0001" value={t.rate} onChange={e => updateTier(t.id, 'rate', +e.target.value)}
                      className="field-input w-full text-xs" />
                  </div>
                ) : (
                  <span className="font-bold text-sm" style={{ color: '#fbbf24' }}>{(t.rate * 100).toFixed(2)}%</span>
                )}
              </div>
              <div className="col-span-1 flex justify-center">
                {isAdmin ? (
                  <input type="checkbox" checked={t.active} onChange={e => updateTier(t.id, 'active', e.target.checked)}
                    className="w-4 h-4 accent-indigo-500" />
                ) : (
                  <span style={{ color: t.active ? '#4ade80' : '#f87171' }}>{t.active ? '✓' : '✗'}</span>
                )}
              </div>
            </div>
          ))}
        </div>

        {/* Preview table */}
        <div className="mt-6 rounded-xl p-4" style={{ background: 'var(--hover-bg)' }}>
          <p className="text-xs font-semibold mb-3" style={{ color: 'var(--text-3)' }}>ตัวอย่าง Commission จาก Revenue</p>
          <div className="grid grid-cols-3 gap-2">
            {[50000, 100000, 300000, 500000, 1000000, 2000000, 3000000, 5000000].map(rev => {
              const tier = [...tiers].filter(t => t.active).sort((a, b) => a.revenue_min - b.revenue_min)
                .find(t => t.revenue_max === null || rev <= t.revenue_max)
              return (
                <div key={rev} className="text-xs">
                  <span style={{ color: 'var(--text-3)' }}>{f(rev)}: </span>
                  <span className="font-semibold" style={{ color: '#fbbf24' }}>
                    {tier ? f(Math.round(rev * tier.rate)) + ' (' + (tier.rate * 100).toFixed(2) + '%)' : '—'}
                  </span>
                </div>
              )
            })}
          </div>
        </div>
      </div>

      {!isAdmin && (
        <p className="text-xs text-center py-2" style={{ color: 'var(--text-3)' }}>
          เฉพาะ Admin เท่านั้นที่แก้ไขได้
        </p>
      )}
    </div>
  )
}
