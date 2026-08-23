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
  /** Sold and not yet handed over. The page already showed รายได้รวม and
   *  รายได้ส่งมอบ; this is the difference between them, given a name. */
  backlog: Slice
  salesByYear: Map<number, Slice>
  /** Average days from order to handover for this project, and how many jobs
   *  that average is built from — an average over two jobs is not a trend. */
  lead_days_avg: number | null
  lead_sample: number
}

export type Slice = { n: number; rev: number; cash: number }

type SortKey = 'name' | 'total_units' | 'booked' | 'jobs_total' | 'jobs_delivered' | 'revenue_total' | 'revenue_delivered' | 'jobs_cancelled' | 'backlog_rev'
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
function ProjectDrawer({ row, overallLeadDays, onClose }: {
  row: ProjectRow; overallLeadDays: number | null; onClose: () => void
}) {
  const outstanding = Math.max(row.revenue_total - row.cash_total, 0)
  const collected = pct(row.cash_total, row.revenue_total)

  // Newest year first — this year is what anyone opens the drawer to see.
  const salesYears = [...row.salesByYear.entries()].sort((a, b) => b[0] - a[0])
  // Jobs with no order_date cannot appear in the year table. Saying how many
  // are missing stops the total silently disagreeing with มูลค่างาน above.
  const datedJobs = salesYears.reduce((s, [, v]) => s + v.n, 0)
  const noOrderDate = row.jobs_total - datedJobs

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

          {/* ── Sales side ──────────────────────────────────────────────
              The page told the delivery story only. What was sold, what is
              still owed as work, and how long this project takes to turn one
              into the other were all absent even though the data was loaded. */}
          <section>
            <p className="text-xs font-semibold uppercase tracking-wider mb-2" style={{ color: 'var(--text-3)' }}>ฝั่งขาย</p>
            <div className="ds-card p-4 space-y-3">
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-xs" style={{ color: 'var(--text-2)' }}>ขายแล้ว รอส่งมอบ</p>
                  <p className="text-micro mt-0.5" style={{ color: 'var(--text-3)' }}>งานที่ปิดการขายแล้วแต่ยังไม่ได้ส่งมอบ</p>
                </div>
                <div className="text-right flex-shrink-0">
                  <p className="text-kpi-money" style={{ color: 'var(--accent-blue)' }}>{fM(row.backlog.rev)}</p>
                  <p className="text-micro" style={{ color: 'var(--text-3)' }}>
                    {row.backlog.n} งาน · รับเงินแล้ว {fK(row.backlog.cash)}
                  </p>
                </div>
              </div>

              <div className="flex items-center justify-between pt-2" style={{ borderTop: '1px solid var(--divider)' }}>
                <span className="text-xs" style={{ color: 'var(--text-2)' }}>ขาย → ส่งมอบ เฉลี่ย</span>
                {row.lead_days_avg === null ? (
                  <span className="text-xs" style={{ color: 'var(--text-3)' }}>ยังไม่มีงานที่ส่งมอบครบรอบ</span>
                ) : (
                  <span className="text-xs tabular-nums" style={{ color: 'var(--text-1)' }}>
                    {row.lead_days_avg} วัน
                    {overallLeadDays !== null && (
                      <span style={{ color: row.lead_days_avg > overallLeadDays ? 'var(--accent-orange)' : 'var(--accent-green)' }}>
                        {' '}({row.lead_days_avg > overallLeadDays ? 'ช้ากว่า' : 'เร็วกว่า'}ค่าเฉลี่ย {overallLeadDays} วัน)
                      </span>
                    )}
                    <span style={{ color: 'var(--text-3)' }}> · จาก {row.lead_sample} งาน</span>
                  </span>
                )}
              </div>
            </div>
          </section>

          {salesYears.length > 0 && (
            <section>
              <p className="text-xs font-semibold uppercase tracking-wider mb-2" style={{ color: 'var(--text-3)' }}>ยอดขายแยกตามปี</p>
              <div className="ds-card overflow-hidden" style={{ padding: 0 }}>
                <table className="w-full text-xs">
                  <thead>
                    <tr style={{ borderBottom: '1px solid var(--divider)' }}>
                      <th className="text-left px-3 py-2 font-semibold" style={{ color: 'var(--text-3)' }}>ปีที่ขาย</th>
                      <th className="text-right px-3 py-2 font-semibold" style={{ color: 'var(--text-3)' }}>งาน</th>
                      <th className="text-right px-3 py-2 font-semibold" style={{ color: 'var(--text-3)' }}>มูลค่า</th>
                      <th className="text-right px-3 py-2 font-semibold" style={{ color: 'var(--text-3)' }}>รับแล้ว</th>
                    </tr>
                  </thead>
                  <tbody>
                    {salesYears.map(([year, s]) => (
                      <tr key={year} style={{ borderTop: '1px solid var(--divider)' }}>
                        {/* Buddhist era, matching every other date in the app */}
                        <td className="px-3 py-2 font-semibold tabular-nums" style={{ color: 'var(--text-1)' }}>{year + 543}</td>
                        <td className="px-3 py-2 text-right tabular-nums" style={{ color: 'var(--text-1)' }}>{s.n}</td>
                        <td className="px-3 py-2 text-right tabular-nums" style={{ color: 'var(--text-2)' }}>{fK(s.rev)}</td>
                        <td className="px-3 py-2 text-right tabular-nums font-semibold" style={{ color: 'var(--accent-green)' }}>{fK(s.cash)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {noOrderDate > 0 && (
                <p className="text-micro mt-1.5" style={{ color: 'var(--accent-amber)' }}>
                  ⚠ อีก {noOrderDate} งานไม่มีวันขาย จึงไม่ปรากฏในตารางนี้
                </p>
              )}
            </section>
          )}

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
        supabase.from('jobs').select('id, project_id, working_status, revenue_inc_vat, work_type, customer_type, order_date, actual_deliver_date'),
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
        /** Sold, not yet handed over — the gap between รายได้รวม and
         *  รายได้ส่งมอบ that the page showed but never named. */
        backlog: Slice
        /** order_date year → what was sold that year. */
        salesByYear: Map<number, Slice>
        /** Running total for the average sale-to-handover time. Kept as sum and
         *  count rather than a running mean so the division happens once. */
        leadDays: number; leadCount: number
      }
      const emptyAgg = (): JobAgg => ({
        active: 0, delivered: 0, total: 0, rev_total: 0, rev_del: 0,
        cash_total: 0, cash_del: 0,
        b2c_rpt: 0, b2c_nrpt: 0, b2b_rpt: 0, b2b_nrpt: 0, unknown_wt: 0,
        cancelled: 0, rev_cancelled: 0,
        byCat: { RPT: slice(), 'N-RPT': slice(), unknown: slice() },
        byCust: { B2C: slice(), B2B: slice() },
        backlog: slice(),
        salesByYear: new Map<number, Slice>(),
        leadDays: 0, leadCount: 0,
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

        // ── Sales side ──────────────────────────────────────────────
        // Backlog keys off working_status, not actual_deliver_date, so that
        // ส่งมอบแล้ว + รอส่งมอบ adds up to Wyde Clients. Seven jobs carry a
        // handover date while still marked ดำเนินการ; using the date here made
        // the two columns disagree by ฿813K with nothing on screen to explain it.
        // Whichever field is stale, the page has to pick one and stay with it.
        if (j.working_status !== 'ส่งมอบแล้ว') addTo(m.backlog, rev, cash)

        if (j.order_date) {
          const y = Number(String(j.order_date).slice(0, 4))
          if (y) {
            if (!m.salesByYear.has(y)) m.salesByYear.set(y, slice())
            addTo(m.salesByYear.get(y)!, rev, cash)
          }
          if (j.actual_deliver_date) {
            const days = Math.round(
              (new Date(j.actual_deliver_date).getTime() - new Date(j.order_date).getTime()) / 86400000
            )
            // Negative gaps exist in the imported data — a handover dated before
            // its own order. Counting them would drag the average below the truth,
            // so they are left out rather than silently absorbed.
            if (days >= 0) { m.leadDays += days; m.leadCount++ }
          }
        }

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
          backlog: j.backlog,
          salesByYear: j.salesByYear,
          lead_days_avg: j.leadCount > 0 ? Math.round(j.leadDays / j.leadCount) : null,
          lead_sample: j.leadCount,
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
    // backlog_rev is the one sort key that is not a flat property — it lives
    // inside the backlog slice, so it needs reading rather than indexing.
    const sortVal = (r: ProjectRow) =>
      sortKey === 'backlog_rev' ? r.backlog.rev : (r[sortKey] as number)
    return [...list].sort((a, b) => {
      const v = sortKey === 'name'
        ? a.name.localeCompare(b.name, 'th')
        : sortVal(a) - sortVal(b)
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
    backlogN: acc.backlogN + r.backlog.n,
    backlogRev: acc.backlogRev + r.backlog.rev,
    leadSum: acc.leadSum + (r.lead_days_avg !== null ? r.lead_days_avg * r.lead_sample : 0),
    leadCount: acc.leadCount + r.lead_sample,
  }), { units: 0, booked: 0, jobs: 0, delivered: 0, rev: 0, revDel: 0, b2c_rpt: 0, b2c_nrpt: 0, b2b_rpt: 0, b2b_nrpt: 0, unknown_wt: 0, cancelled: 0, revCancelled: 0, backlogN: 0, backlogRev: 0, leadSum: 0, leadCount: 0 }), [filtered])

  /** The book-wide average, so a project's own figure has something to sit
   *  against. Weighted by job count, not a mean of means. */
  const overallLeadDays = totals.leadCount > 0 ? Math.round(totals.leadSum / totals.leadCount) : null

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
              {/* B2C / B2B / RPT / N-RPT / ไม่ระบุ used to sit here. Five columns
                  of bare counts pushed the table to fifteen wide and forced a
                  sideways scroll on every read. They live in the drawer now,
                  where each one carries its value and cash alongside. */}
              {/* กำลังดำเนินการ used to sit here as a bare count. รอส่งมอบ below
                  is the same set of jobs — everything not handed over — but
                  carries its value too, so one column does the work of two and
                  the table stays inside the screen. */}
              <Th label="ส่งมอบแล้ว" sortKey="jobs_delivered" current={sortKey} dir={sortDir} onSort={handleSort} />
              <th className="px-3 py-2.5 text-left">
                <span className="text-micro font-semibold uppercase tracking-wider" style={{ color: 'var(--text-3)' }}>% ส่งมอบ</span>
              </th>
              <Th label="รายได้รวม" sortKey="revenue_total" current={sortKey} dir={sortDir} onSort={handleSort} />
              <Th label="รายได้ส่งมอบ" sortKey="revenue_delivered" current={sortKey} dir={sortDir} onSort={handleSort} />
              {/* Next to รายได้ส่งมอบ so the three read as one sentence: sold,
                  handed over, still owed to the customer in work. */}
              <Th label="รอส่งมอบ" sortKey="backlog_rev" current={sortKey} dir={sortDir} onSort={handleSort} />
              {/* Last, and away from the rest: this is work we no longer hold. */}
              <Th label="ยกเลิก" sortKey="jobs_cancelled" current={sortKey} dir={sortDir} onSort={handleSort} />
            </tr>
          </thead>
          <tbody>
            {filtered.map((r, i) => {
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
                  {/* รอส่งมอบ — sold, not handed over yet */}
                  <td className="px-3 py-2.5 text-right">
                    {r.backlog.n > 0 ? (
                      <>
                        <p className="text-xs tabular-nums font-semibold" style={{ color: 'var(--accent-blue)' }}>{fK(r.backlog.rev)}</p>
                        <p className="text-micro tabular-nums" style={{ color: 'var(--text-3)' }}>{r.backlog.n} งาน</p>
                      </>
                    ) : <span className="text-xs" style={{ color: 'var(--text-3)' }}>–</span>}
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
              <td className="px-3 py-2.5 text-right text-xs font-bold tabular-nums" style={{ color: 'var(--accent-green)' }}>{totals.delivered}</td>
              <td className="px-3 py-2.5"><FunnelBar delivered={totals.delivered} total={totals.jobs} /></td>
              <td className="px-3 py-2.5 text-right text-xs font-bold tabular-nums" style={{ color: 'var(--accent)' }}>{fM(totals.rev)}</td>
              <td className="px-3 py-2.5 text-right text-xs font-bold tabular-nums" style={{ color: 'var(--accent-green)' }}>{fM(totals.revDel)}</td>
              <td className="px-3 py-2.5 text-right">
                {totals.backlogN > 0 ? (
                  <>
                    <p className="text-xs font-bold tabular-nums" style={{ color: 'var(--accent-blue)' }}>{fM(totals.backlogRev)}</p>
                    <p className="text-micro tabular-nums" style={{ color: 'var(--text-3)' }}>{totals.backlogN} งาน</p>
                  </>
                ) : <span className="text-xs" style={{ color: 'var(--text-3)' }}>–</span>}
              </td>
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

      {openRow && <ProjectDrawer row={openRow} overallLeadDays={overallLeadDays} onClose={() => setOpenRow(null)} />}
    </div>
  )
}

