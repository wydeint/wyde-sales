'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Settings2, Save, RefreshCw, AlertTriangle } from 'lucide-react'
import { PageSpinner, PageError } from '@/components/ui/StateUI'
import PageHeader from '@/components/ui/PageHeader'

function PasswordGate({ onUnlock }: { onUnlock: () => void }) {
  const [pw, setPw] = useState('')
  const [err, setErr] = useState(false)
  const [shake, setShake] = useState(false)
  function attempt() {
    if (pw === 'Wyde2026') { onUnlock() }
    else { setErr(true); setPw(''); setShake(true); setTimeout(() => setShake(false), 500) }
  }
  return (
    <div className="h-screen flex items-center justify-center" style={{ background: 'var(--page-bg)' }}>
      <div className="w-80 rounded-[16px] p-8 shadow-2xl" style={{ background: 'var(--card-bg)', border: '1px solid var(--card-border)' }}>
        <div className="flex items-center gap-2 mb-6">
          <AlertTriangle size={18} className="text-value" />
          <h2 className="font-bold text-base" style={{ color: 'var(--text-1)' }}>Commission Tiers</h2>
        </div>
        <p className="text-xs mb-5" style={{ color: 'var(--text-2)' }}>หน้านี้ต้องใช้รหัสผ่านเพื่อเข้าถึง</p>
        <input
          type="password" value={pw} onChange={e => { setPw(e.target.value); setErr(false) }}
          onKeyDown={e => e.key === 'Enter' && attempt()}
          placeholder="รหัสผ่าน"
          autoComplete="current-password"
          autoFocus
          className={`w-full px-4 py-2.5 rounded-[8px] text-sm mb-3 outline-none ${shake ? 'animate-shake' : ''}`}
          style={{ background: 'var(--input-bg)', border: `1px solid ${err ? 'var(--accent-red)' : 'var(--divider)'}`, color: 'var(--text-1)' }}
        />
        {err && <p className="text-xs text-danger mb-3">รหัสผ่านไม่ถูกต้อง กรุณาลองใหม่อีกครั้ง</p>}
        <button onClick={attempt} className="w-full py-2.5 rounded-[8px] text-sm font-semibold text-white" style={{ background: 'var(--accent)' }}>
          เข้าสู่ระบบ
        </button>
      </div>
    </div>
  )
}

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
  const [unlocked, setUnlocked] = useState(false)
  const [tiers, setTiers] = useState<Tier[]>([])
  const [myRole, setMyRole] = useState('')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [fetchError, setFetchError] = useState('')

  async function load() {
    setLoading(true)
    setFetchError('')
    const { data: { user } } = await supabase.auth.getUser()
    if (user) {
      const { data: u } = await supabase.from('users').select('role').eq('email', user.email!).single()
      if (u) setMyRole(u.role)
    }
    const { data, error } = await supabase.from('commission_settings').select('*').order('sort_order')
    if (error) { setFetchError(error.message); setLoading(false); return }
    setTiers(data || [])
    setLoading(false)
  }

  useEffect(() => { load() }, [])

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

  if (!unlocked) return <PasswordGate onUnlock={() => setUnlocked(true)} />
  if (loading) return <PageSpinner />
  if (fetchError) return <PageError message={fetchError} onRetry={load} />

  return (
    <div className="page-content space-y-6 max-w-2xl">
      <PageHeader
        title="Commission Tiers"
        subtitle="ขั้นค่าคอมมิชชั่น ปรับได้โดย Admin"
        className=""
        actions={isAdmin && (
          <button onClick={save} disabled={saving}
            className="flex items-center gap-2 px-4 py-2 rounded-[11px] text-sm font-semibold text-white"
            style={{ background: saved ? 'color-mix(in srgb, var(--accent-green) 80%, transparent)' : 'linear-gradient(135deg, var(--accent), var(--accent-purple))', opacity: saving ? 0.7 : 1 }}>
            {saved ? <><RefreshCw size={14} /> บันทึกแล้ว!</> : <><Save size={14} /> บันทึก</>}
          </button>
        )}
      />

      {/* Commission Tiers */}
      <div className="ds-card p-5">
        <div className="flex items-center gap-2 mb-4">
          <Settings2 size={15} style={{ color: 'var(--accent)' }} />
          <h2 className="text-section-title" style={{ color: 'var(--text-1)' }}>Commission Tiers</h2>
          <span className="text-xs ml-auto" style={{ color: 'var(--text-3)' }}>คำนวณจาก Revenue (Ex.VAT)</span>
        </div>

        <div className="overflow-x-auto">
        <div className="space-y-2" style={{ minWidth: '420px' }}>
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
                  <span className="text-sm font-semibold" style={{ color: 'var(--text-1)' }}>{t.tier_name}</span>
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
                  <span className="font-bold text-sm" style={{ color: 'var(--accent-amber)' }}>{(t.rate * 100).toFixed(2)}%</span>
                )}
              </div>
              <div className="col-span-1 flex justify-center">
                {isAdmin ? (
                  <input type="checkbox" checked={t.active} onChange={e => updateTier(t.id, 'active', e.target.checked)}
                    className="w-4 h-4" style={{ accentColor: 'var(--accent)' }} />
                ) : (
                  <span style={{ color: t.active ? 'var(--accent-green)' : 'var(--accent-red)' }}>{t.active ? '✓' : '✗'}</span>
                )}
              </div>
            </div>
          ))}
        </div>
        </div>

        {/* Preview table */}
        <div className="mt-6 rounded-[11px] p-4" style={{ background: 'var(--hover-bg)' }}>
          <p className="text-xs font-semibold mb-3" style={{ color: 'var(--text-3)' }}>ตัวอย่าง Commission จาก Revenue</p>
          <div className="grid grid-cols-3 gap-2">
            {[50000, 100000, 300000, 500000, 1000000, 2000000, 3000000, 5000000].map(rev => {
              const tier = [...tiers].filter(t => t.active).sort((a, b) => a.revenue_min - b.revenue_min)
                .find(t => t.revenue_max === null || rev <= t.revenue_max)
              return (
                <div key={rev} className="text-xs">
                  <span style={{ color: 'var(--text-3)' }}>{f(rev)}: </span>
                  <span className="font-semibold" style={{ color: 'var(--accent-amber)' }}>
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
