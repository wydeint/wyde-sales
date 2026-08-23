'use client'

import { useEffect, useState, useMemo } from 'react'
import { createClient } from '@/lib/supabase/client'
import { PageSpinner } from '@/components/ui/StateUI'
import PageHeader from '@/components/ui/PageHeader'
import FilterBar from '@/components/ui/FilterBar'
import { workCategory } from '@/lib/status'
import { fetchAllRows } from '@/lib/fetchAll'
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
  /** work_type never filled in. Counted on its own rather than folded into
   *  RPT, which is where it used to land and what inflated that column. */
  unknown_wt: number
  jobs_active: number
  jobs_delivered: number
  jobs_total: number
  revenue_total: number
  revenue_delivered: number
  /** Cancelled work, held apart from every figure above so the deal we lost is
   *  visible instead of quietly inflating the ones we kept. */
  jobs_cancelled: number
  revenue_cancelled: number
  /** Cash in the door — paid instalments plus vouchers, the same settlement
   *  rule the rest of the app uses. Job value alone says what was sold, not
   *  what has actually been collected. */
  cash_total: number
  cash_delivered: number
  byCat: { RPT: Slice; 'N-RPT': Slice; unknown: Slice }
  byCust: { B2C: Slice; B2B: Slice }
}

export type Slice = { n: number; rev: number; cash: number }

type SortKey = 'name' | 'total_units' | 'booked' | 'jobs_total' | 'jobs_delivered' | 'revenue_total' | 'revenue_delivered' | 'jobs_cancelled'
type CustFilter = 'all' | 'B2C' | 'B2B'
type WorkFilter = 'all' | 'RPT' | 'N-RPT'

// ─── Helpers ────────────────────────────────────────────────────────────────
const fM = (n: number) => n > 0 ? '฿' + (n / 1e6).toLocaleString('th-TH', { maximumFractionDigits: 2 }) + 'M' : '–'
const fK = (n: number) => n > 0 ? '฿' + (n / 1000).toLocaleString('th-TH', { maximumFractionDigits: 0 }) + 'K' : '–'
const pct = (a: number, b: number) => b > 0 ? Math.round(a / b * 100) : 0

// workCategory lives in lib/status.ts alongside the value list it classifies
// and the CHECK constraint that enforces it.

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

// ─── Project drawer ──────────────────────────────────────────────────────────
/**
 * The table is fifteen columns wide and its header cannot stick, so reading one
 * project meant scrolling sideways and losing track of which row you were on.
 * The drawer answers "how is this project doing" in one place — and pairs every
 * count with what it is worth and what has actually been collected, which the
 * table never did.
 */
function ProjectDrawer({ row, onClose }: { row: ProjectRow; onClose: () => void }) {
  const outstanding = Math.max(row.revenue_total - row.cash_total, 0)
  const collected = pct(row.cash_total, row.revenue_total)

  const catRows: { label: string; s: Slice; color: string }[] = [
    { label: 'RPT', s: row.byCat.RPT, color: 'var(--accent-green)' },
    { label: 'N-RPT', s: row.byCat['N-RPT'], color: 'var(--accent)' },
    { label: 'ไม่ระบุ', s: row.byCat.unknown, color: 'var(--accent-amber)' },
  ]
  const custRows: { label: string; s: Slice; color: string }[] = [
    { label: 'B2C', s: row.byCust.B2C, color: 'var(--accent-green)' },
    { label: 'B2B', s: row.byCust.B2B, color: 'var(--accent-blue)' },
  ]

  const Group = ({ title, items }: { title: string; items: typeof catRows }) => (
    <section>
      <p className="text-xs font-semibold uppercase tracking-wider mb-2" style={{ color: 'var(--text-3)' }}>{title}</p>
      <div className="ds-card overflow-hidden" style={{ padding: 0 }}>
        <table className="w-full text-xs">
          <thead>
            <tr style={{ borderBottom: '1px solid var(--divider)' }}>
              <th className="text-left px-3 py-2 font-semibold" style={{ color: 'var(--text-3)' }}>ประเภท</th>
              <th className="text-right px-3 py-2 font-semibold" style={{ color: 'var(--text-3)' }}>งาน</th>
              <th className="text-right px-3 py-2 font-semibold" style={{ color: 'var(--text-3)' }}>มูลค่า</th>
              <th className="text-right px-3 py-2 font-semibold" style={{ color: 'var(--text-3)' }}>รับแล้ว</th>
            </tr>
          </thead>
          <tbody>
            {items.filter(r => r.s.n > 0).map(r => (
              <tr key={r.label} style={{ borderTop: '1px solid var(--divider)' }}>
                <td className="px-3 py-2 font-semibold" style={{ color: r.color }}>{r.label}</td>
                <td className="px-3 py-2 text-right tabular-nums" style={{ color: 'var(--text-1)' }}>{r.s.n}</td>
                <td className="px-3 py-2 text-right tabular-nums" style={{ color: 'var(--text-2)' }}>{fK(r.s.rev)}</td>
                <td className="px-3 py-2 text-right tabular-nums font-semibold" style={{ color: 'var(--accent-green)' }}>{fK(r.s.cash)}</td>
              </tr>
            ))}
            {items.every(r => r.s.n === 0) && (
              <tr><td colSpan={4} className="px-3 py-3 text-center" style={{ color: 'var(--text-3)' }}>ยังไม่มีงาน</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </section>
  )

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal-panel modal-panel-wide flex flex-col" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <div className="min-w-0">
            <h3 className="modal-title truncate">{row.name}</h3>
            <p className="text-micro mt-0.5" style={{ color: 'var(--text-3)' }}>
              {row.id}{row.total_units > 0 ? ` · ${row.total_units.toLocaleString()} ห้องในโครงการ` : ''}
            </p>
          </div>
          <button onClick={onClose} style={{ color: 'var(--text-3)' }}>✕</button>
        </div>

        <div className="overflow-y-auto p-5 space-y-5">
          {/* Money first: sold, collected, still owed. */}
          <div className="grid grid-cols-3 gap-3">
            <div className="ds-card-sm p-3">
              <p className="text-micro mb-1" style={{ color: 'var(--text-3)' }}>มูลค่างาน</p>
              <p className="text-kpi-money" style={{ color: 'var(--accent)' }}>{fM(row.revenue_total)}</p>
              <p className="text-micro mt-0.5" style={{ color: 'var(--text-3)' }}>{row.jobs_total} งาน</p>
            </div>
            <div className="ds-card-sm p-3">
              <p className="text-micro mb-1" style={{ color: 'var(--text-3)' }}>รับเงินแล้ว</p>
              <p className="text-kpi-money" style={{ color: 'var(--accent-green)' }}>{fM(row.cash_total)}</p>
              <p className="text-micro mt-0.5" style={{ color: 'var(--text-3)' }}>{collected}% ของมูลค่า</p>
            </div>
            <div className="ds-card-sm p-3">
              <p className="text-micro mb-1" style={{ color: 'var(--text-3)' }}>ค้างรับ</p>
              <p className="text-kpi-money" style={{ color: outstanding > 0 ? 'var(--accent-orange)' : 'var(--text-3)' }}>{outstanding > 0 ? fM(outstanding) : '–'}</p>
              <p className="text-micro mt-0.5" style={{ color: 'var(--text-3)' }}>มูลค่า − รับแล้ว</p>
            </div>
          </div>

          <section>
            <p className="text-xs font-semibold uppercase tracking-wider mb-2" style={{ color: 'var(--text-3)' }}>ความคืบหน้า</p>
            <div className="ds-card p-4 space-y-2.5">
              <div className="flex items-center justify-between text-xs">
                <span style={{ color: 'var(--text-2)' }}>ส่งมอบแล้ว</span>
                <span className="tabular-nums" style={{ color: 'var(--text-1)' }}>
                  {row.jobs_delivered} / {row.jobs_total} งาน · <span style={{ color: 'var(--accent-green)' }}>{fK(row.revenue_delivered)}</span>
                </span>
              </div>
              <FunnelBar delivered={row.jobs_delivered} total={row.jobs_total} />
              <div className="flex items-center justify-between text-xs pt-1" style={{ borderTop: '1px solid var(--divider)' }}>
                <span style={{ color: 'var(--text-2)' }}>กำลังดำเนินการ</span>
                <span className="tabular-nums" style={{ color: 'var(--accent-amber)' }}>{row.jobs_active} งาน</span>
              </div>
              <div className="flex items-center justify-between text-xs">
                <span style={{ color: 'var(--text-2)' }}>ลูกค้าจองแล้ว (ยังไม่เปิดงาน)</span>
                <span className="tabular-nums" style={{ color: 'var(--text-1)' }}>{row.booked} ราย</span>
              </div>
              {row.jobs_cancelled > 0 && (
                <div className="flex items-center justify-between text-xs">
                  <span style={{ color: 'var(--text-2)' }}>ยกเลิก</span>
                  <span className="tabular-nums" style={{ color: 'var(--accent-red)' }}>
                    {row.jobs_cancelled} งาน · {fK(row.revenue_cancelled)}
                  </span>
                </div>
              )}
            </div>
          </section>

          <Group title="แยกตามประเภทงาน" items={catRows} />
          <Group title="แยกตามประเภทลูกค้า" items={custRows} />

          {row.byCat.unknown.n > 0 && (
            <p className="text-micro" style={{ color: 'var(--accent-amber)' }}>
              {/* Most unclassified rows are prospect placeholders worth nothing
                  yet, so "มูลค่ารวม –" read as an error. Say which case it is. */}
              ⚠ {row.byCat.unknown.n} งานยังไม่ได้ระบุประเภทงาน
              {row.byCat.unknown.rev > 0
                ? ` — มูลค่ารวม ${fK(row.byCat.unknown.rev)}`
                : ' (ยังไม่มีมูลค่า — เป็นงานที่รอเปิดดีล)'}
            </p>
          )}
        </div>
      </div>
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
  const [openRow, setOpenRow] = useState<ProjectRow | null>(null)

  useEffect(() => {
    async function load() {
      const [projRes, jobRes, custRes, payRes] = await Promise.all([
        supabase.from('projects').select('id, name, total_units').order('name'),
        supabase.from('jobs').select('id, project_id, working_status, revenue_inc_vat, work_type, customer_type'),
        supabase.from('customers').select('project_id, status'),
        // 1,173 instalment rows against PostgREST's 1,000 cap — fetchAllRows or
        // the cash figures come out short with no error to say so.
        fetchAllRows(() => supabase.from('payments')
          .select('job_id, status, amount, paid_amount, voucher_amount')),
      ])

      const projects = projRes.data || []
      const jobs = jobRes.data || []
      const customers = custRes.data || []

      // Cash actually collected per job. Voucher counts: it settles the
      // instalment just as cash does, which is the rule every other page uses.
      const paidByJob = new Map<string, number>()
      for (const p of ((payRes.data || []) as any[])) {
        if (p.status !== 'paid') continue
        const got = Number(p.paid_amount ?? p.amount ?? 0) + Number(p.voucher_amount ?? 0)
        paidByJob.set(p.job_id, (paidByJob.get(p.job_id) || 0) + got)
      }

      const slice = (): Slice => ({ n: 0, rev: 0, cash: 0 })
      const addTo = (s: Slice, rev: number, cash: number) => { s.n++; s.rev += rev; s.cash += cash }

      type JobAgg = {
        active: number; delivered: number; total: number
        rev_total: number; rev_del: number
        cash_total: number; cash_del: number
        b2c_rpt: number; b2c_nrpt: number; b2b_rpt: number; b2b_nrpt: number
        unknown_wt: number
        cancelled: number; rev_cancelled: number
        byCat: { RPT: Slice; 'N-RPT': Slice; unknown: Slice }
        byCust: { B2C: Slice; B2B: Slice }
      }
      const emptyAgg = (): JobAgg => ({
        active: 0, delivered: 0, total: 0, rev_total: 0, rev_del: 0,
        cash_total: 0, cash_del: 0,
        b2c_rpt: 0, b2c_nrpt: 0, b2b_rpt: 0, b2b_nrpt: 0, unknown_wt: 0,
        cancelled: 0, rev_cancelled: 0,
        byCat: { RPT: slice(), 'N-RPT': slice(), unknown: slice() },
        byCust: { B2C: slice(), B2B: slice() },
      })
      const jobMap = new Map<string, JobAgg>()
      for (const j of jobs as any[]) {
        if (!j.project_id) continue
        if (!jobMap.has(j.project_id)) jobMap.set(j.project_id, emptyAgg())
        const m = jobMap.get(j.project_id)!
        const rev = j.revenue_inc_vat || 0

        // A cancelled job is not work we hold, so it is kept out of every other
        // figure and counted on its own. This page was the only one still adding
        // them in: 7 jobs worth ฿1.1M were inflating Wyde Clients and รายได้รวม.
        if (j.working_status === 'ยกเลิก') {
          m.cancelled++
          m.rev_cancelled += rev
          continue
        }

        const cash = paidByJob.get(j.id) || 0
        m.total++
        if (j.working_status === 'ส่งมอบแล้ว') { m.delivered++; m.rev_del += rev; m.cash_del += cash }
        else m.active++
        m.rev_total += rev
        m.cash_total += cash

        const ctype: 'B2C' | 'B2B' = j.customer_type === 'B2B' ? 'B2B' : 'B2C'
        const cat = workCategory(j.work_type)
        addTo(m.byCat[cat], rev, cash)
        addTo(m.byCust[ctype], rev, cash)
        if (cat === 'unknown') m.unknown_wt++
        else if (ctype === 'B2B') { cat === 'N-RPT' ? m.b2b_nrpt++ : m.b2b_rpt++ }
        else                      { cat === 'N-RPT' ? m.b2c_nrpt++ : m.b2c_rpt++ }
      }

      // Aggregate customers
      const custMap = new Map<string, number>()
      for (const c of customers) {
        if (!c.project_id) continue
        if (c.status === 'booked') custMap.set(c.project_id, (custMap.get(c.project_id) || 0) + 1)
      }

      const result: ProjectRow[] = projects.map(p => {
        const j = jobMap.get(p.id) ?? emptyAgg()
        return {
          id: p.id, name: p.name, total_units: p.total_units || 0,
          booked: custMap.get(p.id) || 0,
          b2c_rpt: j.b2c_rpt, b2c_nrpt: j.b2c_nrpt,
          b2b_rpt: j.b2b_rpt, b2b_nrpt: j.b2b_nrpt,
          unknown_wt: j.unknown_wt,
          jobs_active: j.active, jobs_delivered: j.delivered, jobs_total: j.total,
          revenue_total: j.rev_total, revenue_delivered: j.rev_del,
          jobs_cancelled: j.cancelled, revenue_cancelled: j.rev_cancelled,
          cash_total: j.cash_total, cash_delivered: j.cash_del,
          byCat: j.byCat, byCust: j.byCust,
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
    // Unclassified jobs belong to neither RPT nor N-RPT and have no customer
    // type split of their own, so they only survive an unfiltered view. Leaving
    // them out of the filtered totals is what keeps the four category columns
    // adding up to what the filter actually selected.
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
    unknown_wt: acc.unknown_wt + r.unknown_wt,
    cancelled: acc.cancelled + r.jobs_cancelled,
    revCancelled: acc.revCancelled + r.revenue_cancelled,
  }), { units: 0, booked: 0, jobs: 0, delivered: 0, rev: 0, revDel: 0, b2c_rpt: 0, b2c_nrpt: 0, b2b_rpt: 0, b2b_nrpt: 0, unknown_wt: 0, cancelled: 0, revCancelled: 0 }), [filtered])

  if (loading) return <PageSpinner />

  const totalB2C = totals.b2c_rpt + totals.b2c_nrpt
  const totalB2B = totals.b2b_rpt + totals.b2b_nrpt
  const totalRPT  = totals.b2c_rpt + totals.b2b_rpt
  const totalNRPT = totals.b2c_nrpt + totals.b2b_nrpt
  const totalUnknownWT = totals.unknown_wt

  return (
    <div className="page-content">

      {/* Header */}
      <div className="pb-4 mb-4" style={{ borderBottom: '1px solid var(--divider)' }}>

        {/* Title */}
        <PageHeader
          title="Project Summary"
          subtitle="ภาพรวมห้อง ยอด Wyde Clients และรายได้ แยกตามโครงการ"
          className="mb-4"
          actions={<span className="text-xs" style={{ color: 'var(--text-3)' }}>{filtered.length} โครงการ</span>}
        />

        {/* The card holds the pickers; the chips sit below it — the arrangement
            every other list page uses. Two tab-groups plus a checkbox crammed
            inside the card made this page look like a different app. */}
        <FilterBar className="mb-4">
          <select value={search} onChange={e => setSearch(e.target.value)}
            className="field-input" style={{ width: '13rem' }}>
            <option value="">— ทุกโครงการ —</option>
            {rows.map(r => <option key={r.id} value={r.name}>{r.name}</option>)}
          </select>

          <label className="flex items-center gap-1.5 cursor-pointer select-none text-xs" style={{ color: 'var(--text-2)' }}>
            <input type="checkbox" checked={hideEmpty} onChange={e => setHideEmpty(e.target.checked)} className="rounded" />
            ซ่อนโครงการที่ยังไม่มีงาน
          </label>

          {(custFilter !== 'all' || workFilter !== 'all' || search) && (
            <button onClick={() => { setSearch(''); setCustFilter('all'); setWorkFilter('all') }}
              className="text-xs px-2 py-1.5 rounded-[8px] transition-colors"
              style={{ color: 'var(--text-3)', background: 'var(--hover-bg)', border: '1px solid var(--divider)' }}>
              ล้าง
            </button>
          )}
        </FilterBar>

        <div className="flex flex-wrap items-center gap-2 mb-1">
          <div className="tab-group flex-wrap">
            {(['all', 'B2C', 'B2B'] as CustFilter[]).map(v => (
              <button key={v} onClick={() => setCustFilter(v)}
                className={`tab-btn ${custFilter === v ? 'active' : ''}`}>
                {v === 'all' ? 'ลูกค้าทั้งหมด' : v}
              </button>
            ))}
          </div>

          <div className="tab-group flex-wrap">
            {(['all', 'RPT', 'N-RPT'] as WorkFilter[]).map(v => (
              <button key={v} onClick={() => setWorkFilter(v)}
                className={`tab-btn ${workFilter === v ? 'active' : ''}`}>
                {v === 'all' ? 'งานทั้งหมด' : v}
              </button>
            ))}
          </div>
        </div>
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

      </div>

      {/* Table */}
      <div className="tbl-scroll">
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
              {/* Its own column rather than silently padding RPT. Amber so it
                  reads as outstanding work — someone still has to classify these. */}
              <th className="px-3 py-2.5 text-center">
                <span className="text-micro font-semibold tracking-wider" style={{ color: 'var(--accent-amber)' }}>ไม่ระบุ</span>
              </th>
              <Th label="กำลังดำเนินการ" sortKey="jobs_total" current={sortKey} dir={sortDir} onSort={handleSort} />
              <Th label="ส่งมอบแล้ว" sortKey="jobs_delivered" current={sortKey} dir={sortDir} onSort={handleSort} />
              <th className="px-3 py-2.5 text-left">
                <span className="text-micro font-semibold uppercase tracking-wider" style={{ color: 'var(--text-3)' }}>% ส่งมอบ</span>
              </th>
              <Th label="รายได้รวม" sortKey="revenue_total" current={sortKey} dir={sortDir} onSort={handleSort} />
              <Th label="รายได้ส่งมอบ" sortKey="revenue_delivered" current={sortKey} dir={sortDir} onSort={handleSort} />
              {/* Last, and away from the rest: this is work we no longer hold. */}
              <Th label="ยกเลิก" sortKey="jobs_cancelled" current={sortKey} dir={sortDir} onSort={handleSort} />
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
                  className="cursor-pointer"
                  onClick={() => setOpenRow(r)}
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
                  {/* ไม่ระบุ */}
                  <td className="px-3 py-2.5 text-center">
                    {r.unknown_wt > 0
                      ? <span className="text-xs tabular-nums font-semibold" style={{ color: 'var(--accent-amber)' }}>{r.unknown_wt}</span>
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
                  {/* Count and value together — "how many did we lose" and "how
                      much was it worth" are the same question here. */}
                  <td className="px-3 py-2.5 text-right">
                    {r.jobs_cancelled > 0 ? (
                      <>
                        <p className="text-xs tabular-nums font-semibold" style={{ color: 'var(--accent-red)' }}>{r.jobs_cancelled}</p>
                        {r.revenue_cancelled > 0 && (
                          <p className="text-micro tabular-nums" style={{ color: 'var(--text-3)' }}>{fK(r.revenue_cancelled)}</p>
                        )}
                      </>
                    ) : <span className="text-xs" style={{ color: 'var(--text-3)' }}>–</span>}
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
              <td className="px-3 py-2.5 text-center text-xs font-bold tabular-nums" style={{ color: 'var(--accent-amber)' }}>{totalUnknownWT || '–'}</td>
              <td className="px-3 py-2.5 text-right text-xs font-bold tabular-nums" style={{ color: 'var(--accent-amber)' }}>{totals.jobs - totals.delivered || '–'}</td>
              <td className="px-3 py-2.5 text-right text-xs font-bold tabular-nums" style={{ color: 'var(--accent-green)' }}>{totals.delivered}</td>
              <td className="px-3 py-2.5"><FunnelBar delivered={totals.delivered} total={totals.jobs} /></td>
              <td className="px-3 py-2.5 text-right text-xs font-bold tabular-nums" style={{ color: 'var(--accent)' }}>{fM(totals.rev)}</td>
              <td className="px-3 py-2.5 text-right text-xs font-bold tabular-nums" style={{ color: 'var(--accent-green)' }}>{fM(totals.revDel)}</td>
              <td className="px-3 py-2.5 text-right">
                {totals.cancelled > 0 ? (
                  <>
                    <p className="text-xs font-bold tabular-nums" style={{ color: 'var(--accent-red)' }}>{totals.cancelled}</p>
                    <p className="text-micro tabular-nums" style={{ color: 'var(--text-3)' }}>{fM(totals.revCancelled)}</p>
                  </>
                ) : <span className="text-xs" style={{ color: 'var(--text-3)' }}>–</span>}
              </td>
            </tr>
          </tbody>
        </table>

        {filtered.length === 0 && (
          <div className="flex items-center justify-center h-32">
            <p className="text-sm" style={{ color: 'var(--text-3)' }}>ไม่พบโครงการ</p>
          </div>
        )}
      </div>

      {openRow && <ProjectDrawer row={openRow} onClose={() => setOpenRow(null)} />}
    </div>
  )
}

