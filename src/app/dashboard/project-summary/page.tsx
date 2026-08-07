'use client'

import { useEffect, useState, useMemo } from 'react'
import { createClient } from '@/lib/supabase/client'
import { PageSpinner } from '@/components/ui/StateUI'
import PageHeader from '@/components/ui/PageHeader'
import { Building2, TrendingUp, CheckCircle2, DollarSign, ChevronUp, ChevronDown } from 'lucide-react'

// ─── Types ─────────────────────────────────────────────────────────────────
interface ProjectRow {
  id: string
  name: string
  total_units: number
  booked: number
  // breakdown by customer_type × work_category
  b2c_rpt: number
  b2c_nrpt: number
  b2b_rpt: number
  b2b_nrpt: number
  jobs_active: number
  jobs_delivered: number
  jobs_total: number
  revenue_total: number
  revenue_delivered: number
}

type SortKey = 'name' | 'total_units' | 'booked' | 'jobs_total' | 'jobs_delivered' | 'revenue_total' | 'revenue_delivered'
type CustFilter = 'all' | 'B2C' | 'B2B'
type WorkFilter = 'all' | 'RPT' | 'N-RPT'

// ─── Helpers ────────────────────────────────────────────────────────────────
const fM = (n: number) => n > 0 ? '฿' + (n / 1e6).toLocaleString('th-TH', { maximumFractionDigits: 2 }) + 'M' : '–'
const fK = (n: number) => n > 0 ? '฿' + (n / 1000).toLocaleString('th-TH', { maximumFractionDigits: 0 }) + 'K' : '–'
const pct = (a: number, b: number) => b > 0 ? Math.round(a / b * 100) : 0

function isNrpt(wt: string | null) {
  return wt === 'N-RPT' || wt === 'N-RPT/EQ' || wt === 'N-RPT/Event'
}

// ─── Mini funnel bar ─────────────────────────────────────────────────────────
function FunnelBar({ delivered, total }: { delivered: number; total: number }) {
  const p = pct(delivered, total)
  return (
    <div className="flex items-center gap-2 min-w-[80px]">
      <div className="flex-1 h-1.5 rounded-full overflow-hidden" style={{ background: 'var(--divider)' }}>
        <div className="h-full rounded-full transition-all"
          style={{ width: `${p}%`, background: p >= 80 ? 'var(--accent-green)' : p >= 40 ? 'var(--accent)' : 'var(--accent-amber)' }} />
      </div>
      <span className="text-micro tabular-nums w-8 text-right" style={{ color: 'var(--text-3)' }}>{p}%</span>
    </div>
  )
}

// ─── Sort header ─────────────────────────────────────────────────────────────
function Th({ label, sortKey, current, dir, onSort, right = true }: {
  label: string; sortKey: SortKey; current: SortKey; dir: 'asc' | 'desc'
  onSort: (k: SortKey) => void; right?: boolean
}) {
  const active = current === sortKey
  return (
    <th className={`px-3 py-2.5 cursor-pointer select-none whitespace-nowrap ${right ? 'text-right' : 'text-left'}`}
      onClick={() => onSort(sortKey)}>
      <span className="inline-flex items-center gap-1 text-micro font-semibold uppercase tracking-wider"
        style={{ color: active ? 'var(--accent)' : 'var(--text-3)' }}>
        {label}
        {active ? (dir === 'asc' ? <ChevronUp size={10} /> : <ChevronDown size={10} />) : null}
      </span>
    </th>
  )
}


// ─── Main ────────────────────────────────────────────────────────────────────
export default function ProjectSummaryPage() {
  const supabase = createClient()
  const [rows, setRows] = useState<ProjectRow[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [hideEmpty, setHideEmpty] = useState(true)
  const [custFilter, setCustFilter] = useState<CustFilter>('all')
  const [workFilter, setWorkFilter] = useState<WorkFilter>('all')
  const [sortKey, setSortKey] = useState<SortKey>('revenue_total')
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc')

  useEffect(() => {
    async function load() {
      const [projRes, jobRes, custRes] = await Promise.all([
        supabase.from('projects').select('id, name, total_units').order('name'),
        supabase.from('jobs').select('project_id, working_status, revenue_inc_vat, work_type, customer_type'),
        supabase.from('customers').select('project_id, status'),
      ])

      const projects = projRes.data || []
      const jobs = jobRes.data || []
      const customers = custRes.data || []

      type JobAgg = {
        active: number; delivered: number; total: number
        rev_total: number; rev_del: number
        b2c_rpt: number; b2c_nrpt: number; b2b_rpt: number; b2b_nrpt: number
      }
      const jobMap = new Map<string, JobAgg>()
      for (const j of jobs as any[]) {
        if (!j.project_id) continue
        if (!jobMap.has(j.project_id)) jobMap.set(j.project_id, { active: 0, delivered: 0, total: 0, rev_total: 0, rev_del: 0, b2c_rpt: 0, b2c_nrpt: 0, b2b_rpt: 0, b2b_nrpt: 0 })
        const m = jobMap.get(j.project_id)!
        m.total++
        const rev = j.revenue_inc_vat || 0
        if (j.working_status === 'ส่งมอบแล้ว') { m.delivered++; m.rev_del += rev }
        else m.active++
        m.rev_total += rev

        const ctype: string = j.customer_type || 'B2C'
        const nrpt = isNrpt(j.work_type)
        if (ctype === 'B2B') { nrpt ? m.b2b_nrpt++ : m.b2b_rpt++ }
        else                 { nrpt ? m.b2c_nrpt++ : m.b2c_rpt++ }
      }

      // Aggregate customers
      const custMap = new Map<string, number>()
      for (const c of customers) {
        if (!c.project_id) continue
        if (c.status === 'booked') custMap.set(c.project_id, (custMap.get(c.project_id) || 0) + 1)
      }

      const result: ProjectRow[] = projects.map(p => {
        const j = jobMap.get(p.id) ?? { active: 0, delivered: 0, total: 0, rev_total: 0, rev_del: 0, b2c_rpt: 0, b2c_nrpt: 0, b2b_rpt: 0, b2b_nrpt: 0 }
        return {
          id: p.id, name: p.name, total_units: p.total_units || 0,
          booked: custMap.get(p.id) || 0,
          b2c_rpt: j.b2c_rpt, b2c_nrpt: j.b2c_nrpt,
          b2b_rpt: j.b2b_rpt, b2b_nrpt: j.b2b_nrpt,
          jobs_active: j.active, jobs_delivered: j.delivered, jobs_total: j.total,
          revenue_total: j.rev_total, revenue_delivered: j.rev_del,
        }
      })

      setRows(result)
      setLoading(false)
    }
    load()
  }, [])

  function handleSort(k: SortKey) {
    if (sortKey === k) setSortDir(d => d === 'asc' ? 'desc' : 'asc')
    else { setSortKey(k); setSortDir('desc') }
  }

  // Apply filters and compute visible job counts per row
  function visibleJobs(r: ProjectRow): number {
    if (custFilter === 'all' && workFilter === 'all') return r.jobs_total
    const b2c = custFilter !== 'B2B', b2b = custFilter !== 'B2C'
    const rpt = workFilter !== 'N-RPT', nrpt = workFilter !== 'RPT'
    return (b2c && rpt ? r.b2c_rpt : 0) + (b2c && nrpt ? r.b2c_nrpt : 0) +
           (b2b && rpt ? r.b2b_rpt : 0) + (b2b && nrpt ? r.b2b_nrpt : 0)
  }

  const filtered = useMemo(() => {
    let list = rows
    if (hideEmpty) list = list.filter(r => r.jobs_total > 0 || r.booked > 0)
    if (search.trim()) {
      const q = search.toLowerCase()
      list = list.filter(r => r.name.toLowerCase().includes(q) || r.id.toLowerCase().includes(q))
    }
    // Filter by customer type / work type — only hide rows with 0 visible jobs
    if (custFilter !== 'all' || workFilter !== 'all') {
      list = list.filter(r => visibleJobs(r) > 0)
    }
    return [...list].sort((a, b) => {
      const v = sortKey === 'name'
        ? a.name.localeCompare(b.name, 'th')
        : (a[sortKey] as number) - (b[sortKey] as number)
      return sortDir === 'asc' ? v : -v
    })
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows, hideEmpty, search, sortKey, sortDir, custFilter, workFilter])

  // Grand totals (respecting filters)
  const totals = useMemo(() => filtered.reduce((acc, r) => ({
    units: acc.units + r.total_units,
    booked: acc.booked + r.booked,
    jobs: acc.jobs + r.jobs_total,
    delivered: acc.delivered + r.jobs_delivered,
    rev: acc.rev + r.revenue_total,
    revDel: acc.revDel + r.revenue_delivered,
    b2c_rpt: acc.b2c_rpt + r.b2c_rpt,
    b2c_nrpt: acc.b2c_nrpt + r.b2c_nrpt,
    b2b_rpt: acc.b2b_rpt + r.b2b_rpt,
    b2b_nrpt: acc.b2b_nrpt + r.b2b_nrpt,
  }), { units: 0, booked: 0, jobs: 0, delivered: 0, rev: 0, revDel: 0, b2c_rpt: 0, b2c_nrpt: 0, b2b_rpt: 0, b2b_nrpt: 0 }), [filtered])

  if (loading) return <PageSpinner />

  const totalB2C = totals.b2c_rpt + totals.b2c_nrpt
  const totalB2B = totals.b2b_rpt + totals.b2b_nrpt
  const totalRPT  = totals.b2c_rpt + totals.b2b_rpt
  const totalNRPT = totals.b2c_nrpt + totals.b2b_nrpt

  return (
    <div className="h-screen flex flex-col" style={{ background: 'var(--page-bg)' }}>

      {/* Header */}
      <div className="flex-shrink-0 px-6 pt-5 pb-4" style={{ borderBottom: '1px solid var(--divider)' }}>

        {/* Title */}
        <PageHeader
          title="Project Summary"
          subtitle="ภาพรวมห้อง ยอด Wyde Clients และรายได้ แยกตามโครงการ"
          className="mb-4"
          actions={<span className="text-xs" style={{ color: 'var(--text-3)' }}>{filtered.length} โครงการ</span>}
        />

        {/* KPI cards */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-4">
          {[
            { icon: Building2, label: 'โครงการที่มีงาน', value: `${filtered.length}`, sub: `จากทั้งหมด ${rows.length}`, color: 'var(--accent)' },
            { icon: TrendingUp, label: 'ห้องทั้งหมด', value: totals.units.toLocaleString(), sub: 'ตามที่บันทึก', color: 'var(--accent-blue)' },
            { icon: CheckCircle2, label: 'Wyde Clients', value: `${totals.jobs} ห้อง`, sub: `B2C ${totalB2C} · B2B ${totalB2B}`, color: 'var(--accent-green)' },
            { icon: DollarSign, label: 'รายได้รวม', value: fM(totals.rev), sub: `ส่งมอบแล้ว ${fM(totals.revDel)}`, color: 'var(--accent-amber)' },
          ].map(k => {
            const Icon = k.icon
            return (
              <div key={k.label} className="ds-card p-4">
                <div className="flex items-center gap-2 mb-2">
                  <Icon size={13} style={{ color: k.color }} />
                  <span className="text-card-title" style={{ color: 'var(--text-3)' }}>{k.label}</span>
                </div>
                <p className="text-kpi-number" style={{ color: k.color }}>{k.value}</p>
                <p className="text-xs mt-1" style={{ color: 'var(--text-3)' }}>{k.sub}</p>
              </div>
            )
          })}
        </div>

        {/* Filter row — Finance pill style */}
        <div className="flex items-center gap-3 flex-wrap">
          <select value={search} onChange={e => setSearch(e.target.value)}
            className="field-input" style={{ width: '13rem' }}>
            <option value="">— ทุกโครงการ —</option>
            {rows.map(r => <option key={r.id} value={r.name}>{r.name}</option>)}
          </select>

          <div className="flex gap-1 rounded-[11px] p-1" style={{ background: 'var(--hover-bg)', border: '1px solid var(--divider)' }}>
            {(['all', 'B2C', 'B2B'] as CustFilter[]).map(v => (
              <button key={v} onClick={() => setCustFilter(v)}
                className="px-3 py-1.5 rounded-[8px] text-xs font-semibold transition-colors"
                style={{ background: custFilter === v ? 'var(--accent)' : 'transparent', color: custFilter === v ? '#fff' : 'var(--text-2)' }}>
                {v === 'all' ? 'ลูกค้าทั้งหมด' : v}
              </button>
            ))}
          </div>

          <div className="flex gap-1 rounded-[11px] p-1" style={{ background: 'var(--hover-bg)', border: '1px solid var(--divider)' }}>
            {(['all', 'RPT', 'N-RPT'] as WorkFilter[]).map(v => (
              <button key={v} onClick={() => setWorkFilter(v)}
                className="px-3 py-1.5 rounded-[8px] text-xs font-semibold transition-colors"
                style={{ background: workFilter === v ? 'var(--accent)' : 'transparent', color: workFilter === v ? '#fff' : 'var(--text-2)' }}>
                {v === 'all' ? 'งานทั้งหมด' : v}
              </button>
            ))}
          </div>

          <label className="flex items-center gap-1.5 cursor-pointer select-none text-xs" style={{ color: 'var(--text-2)' }}>
            <input type="checkbox" checked={hideEmpty} onChange={e => setHideEmpty(e.target.checked)} className="rounded" />
            ซ่อนโครงการที่ยังไม่มีงาน
          </label>
        </div>
      </div>

      {/* Table */}
      <div className="flex-1 overflow-auto" style={{ overscrollBehavior: 'contain', WebkitOverflowScrolling: 'touch' } as React.CSSProperties}>
        <table className="w-full text-sm border-collapse" style={{ minWidth: 900 }}>
          <thead className="sticky top-0 z-10" style={{ background: 'var(--card-bg)', borderBottom: '1px solid var(--divider)' }}>
            <tr>
              <Th label="โครงการ" sortKey="name" current={sortKey} dir={sortDir} onSort={handleSort} right={false} />
              <Th label="ห้องทั้งหมด" sortKey="total_units" current={sortKey} dir={sortDir} onSort={handleSort} />
              <Th label="สนใจ/จอง" sortKey="booked" current={sortKey} dir={sortDir} onSort={handleSort} />
              <Th label="Wyde Clients" sortKey="jobs_total" current={sortKey} dir={sortDir} onSort={handleSort} />
              {/* Breakdown columns */}
              <th className="px-3 py-2.5 text-center">
                <span className="text-micro font-semibold uppercase tracking-wider" style={{ color: 'var(--accent-green)' }}>B2C</span>
              </th>
              <th className="px-3 py-2.5 text-center">
                <span className="text-micro font-semibold uppercase tracking-wider" style={{ color: 'var(--accent-blue)' }}>B2B</span>
              </th>
              <th className="px-3 py-2.5 text-center">
                <span className="text-micro font-semibold uppercase tracking-wider" style={{ color: 'var(--accent-green)' }}>RPT</span>
              </th>
              <th className="px-3 py-2.5 text-center">
                <span className="text-micro font-semibold uppercase tracking-wider" style={{ color: 'var(--accent)' }}>N-RPT</span>
              </th>
              <Th label="กำลังดำเนินการ" sortKey="jobs_total" current={sortKey} dir={sortDir} onSort={handleSort} />
              <Th label="ส่งมอบแล้ว" sortKey="jobs_delivered" current={sortKey} dir={sortDir} onSort={handleSort} />
              <th className="px-3 py-2.5 text-left">
                <span className="text-micro font-semibold uppercase tracking-wider" style={{ color: 'var(--text-3)' }}>% ส่งมอบ</span>
              </th>
              <Th label="รายได้รวม" sortKey="revenue_total" current={sortKey} dir={sortDir} onSort={handleSort} />
              <Th label="รายได้ส่งมอบ" sortKey="revenue_delivered" current={sortKey} dir={sortDir} onSort={handleSort} />
            </tr>
          </thead>
          <tbody>
            {filtered.map((r, i) => {
              const b2c = r.b2c_rpt + r.b2c_nrpt
              const b2b = r.b2b_rpt + r.b2b_nrpt
              const rpt  = r.b2c_rpt + r.b2b_rpt
              const nrpt = r.b2c_nrpt + r.b2b_nrpt
              return (
                <tr key={r.id}
                  style={{ background: i % 2 === 0 ? 'transparent' : 'var(--hover-bg)', borderBottom: '1px solid var(--divider)' }}
                  onMouseEnter={e => (e.currentTarget as HTMLElement).style.background = 'var(--active-bg)'}
                  onMouseLeave={e => (e.currentTarget as HTMLElement).style.background = i % 2 === 0 ? 'transparent' : 'var(--hover-bg)'}
                >
                  <td className="px-3 py-2.5">
                    <p className="font-semibold text-xs leading-tight" style={{ color: 'var(--text-1)' }}>{r.name}</p>
                    <p className="text-micro" style={{ color: 'var(--text-3)' }}>{r.id}</p>
                  </td>
                  <td className="px-3 py-2.5 text-right">
                    <span className="text-xs tabular-nums" style={{ color: 'var(--text-2)' }}>
                      {r.total_units > 0 ? r.total_units.toLocaleString() : '–'}
                    </span>
                  </td>
                  <td className="px-3 py-2.5 text-right">
                    {r.booked > 0
                      ? <span className="text-xs font-semibold tabular-nums" style={{ color: 'var(--accent-blue)' }}>{r.booked}</span>
                      : <span className="text-xs" style={{ color: 'var(--text-3)' }}>–</span>}
                  </td>
                  <td className="px-3 py-2.5 text-right">
                    {r.jobs_total > 0
                      ? <span className="text-xs font-bold tabular-nums" style={{ color: 'var(--text-1)' }}>{r.jobs_total}</span>
                      : <span className="text-xs" style={{ color: 'var(--text-3)' }}>–</span>}
                  </td>
                  {/* B2C */}
                  <td className="px-3 py-2.5 text-center">
                    {b2c > 0
                      ? <span className="text-xs font-semibold tabular-nums" style={{ color: 'var(--accent-green)' }}>{b2c}</span>
                      : <span className="text-xs" style={{ color: 'var(--text-3)' }}>–</span>}
                  </td>
                  {/* B2B */}
                  <td className="px-3 py-2.5 text-center">
                    {b2b > 0
                      ? <span className="text-xs font-semibold tabular-nums" style={{ color: 'var(--accent-blue)' }}>{b2b}</span>
                      : <span className="text-xs" style={{ color: 'var(--text-3)' }}>–</span>}
                  </td>
                  {/* RPT */}
                  <td className="px-3 py-2.5 text-center">
                    {rpt > 0
                      ? <span className="text-xs tabular-nums" style={{ color: 'var(--accent-green)' }}>{rpt}</span>
                      : <span className="text-xs" style={{ color: 'var(--text-3)' }}>–</span>}
                  </td>
                  {/* N-RPT */}
                  <td className="px-3 py-2.5 text-center">
                    {nrpt > 0
                      ? <span className="text-xs tabular-nums" style={{ color: 'var(--accent)' }}>{nrpt}</span>
                      : <span className="text-xs" style={{ color: 'var(--text-3)' }}>–</span>}
                  </td>
                  <td className="px-3 py-2.5 text-right">
                    {r.jobs_active > 0
                      ? <span className="text-xs tabular-nums" style={{ color: 'var(--accent-amber)' }}>{r.jobs_active}</span>
                      : <span className="text-xs" style={{ color: 'var(--text-3)' }}>–</span>}
                  </td>
                  <td className="px-3 py-2.5 text-right">
                    {r.jobs_delivered > 0
                      ? <span className="text-xs tabular-nums font-semibold" style={{ color: 'var(--accent-green)' }}>{r.jobs_delivered}</span>
                      : <span className="text-xs" style={{ color: 'var(--text-3)' }}>–</span>}
                  </td>
                  <td className="px-3 py-2.5">
                    {r.jobs_total > 0
                      ? <FunnelBar delivered={r.jobs_delivered} total={r.jobs_total} />
                      : <span className="text-xs" style={{ color: 'var(--text-3)' }}>–</span>}
                  </td>
                  <td className="px-3 py-2.5 text-right">
                    <span className="text-xs tabular-nums" style={{ color: 'var(--accent)' }}>
                      {r.revenue_total > 0 ? fK(r.revenue_total) : '–'}
                    </span>
                  </td>
                  <td className="px-3 py-2.5 text-right">
                    <span className="text-xs tabular-nums" style={{ color: 'var(--accent-green)' }}>
                      {r.revenue_delivered > 0 ? fK(r.revenue_delivered) : '–'}
                    </span>
                  </td>
                </tr>
              )
            })}

            {/* Totals row */}
            <tr style={{ background: 'var(--card-bg)', borderTop: '2px solid var(--divider)' }}>
              <td className="px-3 py-2.5 text-xs font-bold" style={{ color: 'var(--text-1)' }}>รวม {filtered.length} โครงการ</td>
              <td className="px-3 py-2.5 text-right text-xs font-bold tabular-nums" style={{ color: 'var(--text-1)' }}>{totals.units.toLocaleString()}</td>
              <td className="px-3 py-2.5 text-right text-xs font-bold tabular-nums" style={{ color: 'var(--accent-blue)' }}>{totals.booked || '–'}</td>
              <td className="px-3 py-2.5 text-right text-xs font-bold tabular-nums" style={{ color: 'var(--text-1)' }}>{totals.jobs}</td>
              <td className="px-3 py-2.5 text-center text-xs font-bold tabular-nums" style={{ color: 'var(--accent-green)' }}>{totalB2C || '–'}</td>
              <td className="px-3 py-2.5 text-center text-xs font-bold tabular-nums" style={{ color: 'var(--accent-blue)' }}>{totalB2B || '–'}</td>
              <td className="px-3 py-2.5 text-center text-xs font-bold tabular-nums" style={{ color: 'var(--accent-green)' }}>{totalRPT || '–'}</td>
              <td className="px-3 py-2.5 text-center text-xs font-bold tabular-nums" style={{ color: 'var(--accent)' }}>{totalNRPT || '–'}</td>
              <td className="px-3 py-2.5 text-right text-xs font-bold tabular-nums" style={{ color: 'var(--accent-amber)' }}>{totals.jobs - totals.delivered || '–'}</td>
              <td className="px-3 py-2.5 text-right text-xs font-bold tabular-nums" style={{ color: 'var(--accent-green)' }}>{totals.delivered}</td>
              <td className="px-3 py-2.5"><FunnelBar delivered={totals.delivered} total={totals.jobs} /></td>
              <td className="px-3 py-2.5 text-right text-xs font-bold tabular-nums" style={{ color: 'var(--accent)' }}>{fM(totals.rev)}</td>
              <td className="px-3 py-2.5 text-right text-xs font-bold tabular-nums" style={{ color: 'var(--accent-green)' }}>{fM(totals.revDel)}</td>
            </tr>
          </tbody>
        </table>

        {filtered.length === 0 && (
          <div className="flex items-center justify-center h-32">
            <p className="text-sm" style={{ color: 'var(--text-3)' }}>ไม่พบโครงการ</p>
          </div>
        )}
      </div>
    </div>
  )
}

