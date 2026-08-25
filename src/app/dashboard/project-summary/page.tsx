'use client'

import { useEffect, useState, useMemo } from 'react'
import { createClient } from '@/lib/supabase/client'
import { PageSpinner } from '@/components/ui/StateUI'
import PageHeader from '@/components/ui/PageHeader'
import FilterBar from '@/components/ui/FilterBar'
import { workCategory } from '@/lib/status'
import { fetchAllRows } from '@/lib/fetchAll'
import { thaiDate } from '@/lib/thaiDate'
import { bahtShortOrDash } from '@/lib/money'
import { Building2, TrendingUp, CheckCircle2, DollarSign, ChevronUp, ChevronDown, PackageCheck, XCircle } from 'lucide-react'

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
  /** Distinct rooms won in this project. Against total_units it gives the
   *  share of the building we hold; against jobs_total it shows repeats. */
  rooms_sold: number
  /** Who sells this project. Head of sales opens a project to find its owner;
   *  the page held sales_id on every job and never surfaced it. */
  bySales: Map<string, Slice>
  /** Every job in the project, so the drawer can list the actual rooms instead
   *  of only counting them. Sorted newest sale first. */
  jobsList: JobLine[]
  /** Rows this project still needs filled in — the drawer says which project to
   *  go and fix rather than leaving it to a separate audit. */
  miss_wt: number
  miss_order: number
  miss_sales: number
  /** Cancelled work split by what happened to the customer's money. ยกเลิก
   *  alone said a deal was lost but not whether we refunded or kept a deposit. */
  cancel_refund_n: number; cancel_refund_amt: number
  cancel_forfeit_n: number; cancel_forfeit_amt: number
  /** Prospects that never became a job — a different loss from a cancelled job,
   *  and the only one the หลุด figure was missing entirely. */
  lost_prospects: number
}

export type JobLine = {
  id: string; room: string; status: string; rev: number; cash: number
  order_date: string | null; delivered: boolean
}

/** `del`/`delRev` let one slice answer both sides: what was sold, and how much
 *  of it has been handed over. Backlog is the remainder — n − del, rev − delRev
 *  — so the two cards never need separate aggregations that could drift apart. */
export type Slice = { n: number; rev: number; cash: number; del: number; delRev: number }

type SortKey = 'name' | 'total_units' | 'booked' | 'jobs_total' | 'jobs_delivered' | 'revenue_total' | 'revenue_delivered' | 'jobs_cancelled' | 'backlog_rev' | 'outstanding'
type CustFilter = 'all' | 'B2C' | 'B2B'
type WorkFilter = 'all' | 'RPT' | 'N-RPT'

// ─── Helpers ────────────────────────────────────────────────────────────────
/** Every money slot on this page is a comparison across 52 projects or a
 *  breakdown inside a fixed-width drawer column, so all of them abbreviate.
 *  fM and fK are both bahtShortOrDash now: the old fK never rolled over, which
 *  is how ฿40 million came to print as ฿40,288K. */
const fM = bahtShortOrDash
const fK = bahtShortOrDash
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

// ─── Three-step comparison ───────────────────────────────────────────────────
/**
 * Both halves of the drawer answer the same shape of question — how much of the
 * whole did we reach, and how far along is it — so both are drawn the same way:
 * a total, then two steps measured against it. Reading one teaches you to read
 * the other.
 *
 * A step whose base is unknown shows a dash. Printing 0% when the denominator
 * was never recorded would be inventing a fact.
 */
function StepBar({ steps }: {
  // value may be null: a project whose unit count we do not trust shows a dash
  // rather than the placeholder 1 sitting in the column.
  steps: { label: string; value: number | null; sub?: string; color: string; base: number | null }[]
}) {
  return (
    <div className="space-y-2.5">
      {steps.map(s => {
        const p = s.value !== null && s.base && s.base > 0 ? Math.round(s.value / s.base * 100) : null
        return (
          <div key={s.label}>
            <div className="flex items-baseline justify-between gap-2">
              <span className="text-xs" style={{ color: 'var(--text-2)' }}>{s.label}</span>
              <span className="text-xs tabular-nums" style={{ color: 'var(--text-1)' }}>
                <span className="font-semibold" style={{ color: s.color }}>{s.value === null ? '–' : s.value.toLocaleString()}</span>
                {p !== null && <span style={{ color: 'var(--text-3)' }}> · {p}%</span>}
                {s.sub && <span style={{ color: 'var(--text-3)' }}> · {s.sub}</span>}
              </span>
            </div>
            {p !== null && (
              <div className="h-1.5 rounded-full mt-1 overflow-hidden" style={{ background: 'var(--divider)' }}>
                <div className="h-full rounded-full transition-all" style={{ width: `${Math.min(p, 100)}%`, background: s.color }} />
              </div>
            )}
          </div>
        )
      })}
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

  // total_units is trustworthy on 38 of 52 projects. The rest carry 0 or a
  // placeholder 1 — and one records 2 units against 8 rooms we have sold. A
  // penetration % off those numbers would be worse than none, so require the
  // count to at least exceed what we have already sold before dividing by it.
  const hasUnitCount = row.total_units > 1 && row.total_units >= row.rooms_sold
  const repeats = row.jobs_total - row.rooms_sold

  // Newest year first — this year is what anyone opens the drawer to see.
  const salesYears = [...row.salesByYear.entries()].sort((a, b) => b[0] - a[0])
  // Biggest seller first; the unassigned bucket sinks to the bottom whatever it
  // is worth, since it is a data gap rather than a person to rank.
  const salesRows = [...row.bySales.entries()].sort((a, b) => {
    const aGap = a[0] === 'ยังไม่ระบุเซลล์', bGap = b[0] === 'ยังไม่ระบุเซลล์'
    if (aGap !== bGap) return aGap ? 1 : -1
    return b[1].rev - a[1].rev
  })
  const missing = row.miss_wt + row.miss_order + row.miss_sales
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

  // Every one of these breakdowns answers the same question — what did we sell —
  // so they live inside the sales card as sub-blocks rather than as three more
  // cards floating below it. No ds-card wrapper here: the parent already is one.
  const Sub = ({ title, children }: { title: string; children: React.ReactNode }) => (
    <div className="pt-3" style={{ borderTop: '1px solid var(--divider)' }}>
      <p className="text-micro font-semibold uppercase tracking-wider mb-1.5" style={{ color: 'var(--text-3)' }}>{title}</p>
      {children}
    </div>
  )

  /** The same breakdown read two ways. On the sales side the question is what
   *  the work is worth and how much of it we have collected; on the delivery
   *  side it is how much of that work is still owed. One aggregation, two
   *  column sets — so the halves cannot disagree about the underlying jobs. */
  const Group = ({ title, items, firstCol, side }: {
    title: string; items: typeof catRows; firstCol: string; side: 'sales' | 'delivery'
  }) => {
    const cols = side === 'sales'
      ? ['งาน', 'มูลค่า', 'รับแล้ว']
      : ['งาน', 'ส่งมอบแล้ว', 'รอส่งมอบ', 'มูลค่าที่ค้าง']
    return (
      <Sub title={title}>
        <SubTable side={side}>
          <thead>
            <tr>
              <th className="text-left py-1 font-normal" style={{ color: 'var(--text-3)' }}>{firstCol}</th>
              {cols.map(c => (
                <th key={c} className="text-right py-1 font-normal whitespace-nowrap" style={{ color: 'var(--text-3)' }}>{c}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {items.filter(r => r.s.n > 0).map(r => {
              const waiting = r.s.n - r.s.del
              return (
                <tr key={r.label}>
                  <td className="py-1 font-semibold" style={{ color: r.color }}>{r.label}</td>
                  <td className="py-1 text-right tabular-nums" style={{ color: 'var(--text-1)' }}>{r.s.n}</td>
                  {side === 'sales' ? (
                    <>
                      <td className="py-1 text-right tabular-nums" style={{ color: 'var(--text-2)' }}>{fK(r.s.rev)}</td>
                      <td className="py-1 text-right tabular-nums font-semibold" style={{ color: 'var(--accent-green)' }}>{fK(r.s.cash)}</td>
                    </>
                  ) : (
                    <>
                      <td className="py-1 text-right tabular-nums" style={{ color: r.s.del > 0 ? 'var(--accent-green)' : 'var(--text-3)' }}>
                        {r.s.del > 0 ? `${r.s.del} · ${pct(r.s.del, r.s.n)}%` : '–'}
                      </td>
                      <td className="py-1 text-right tabular-nums" style={{ color: waiting > 0 ? 'var(--accent-amber)' : 'var(--text-3)' }}>
                        {waiting > 0 ? waiting : '–'}
                      </td>
                      <td className="py-1 text-right tabular-nums font-semibold" style={{ color: waiting > 0 ? 'var(--text-1)' : 'var(--text-3)' }}>
                        {waiting > 0 ? fK(r.s.rev - r.s.delRev) : '–'}
                      </td>
                    </>
                  )}
                </tr>
              )
            })}
            {items.every(r => r.s.n === 0) && (
              <tr><td colSpan={cols.length + 1} className="py-2 text-center" style={{ color: 'var(--text-3)' }}>ยังไม่มีงาน</td></tr>
            )}
          </tbody>
          <TotalRow slices={items.map(r => r.s)} side={side} />
        </SubTable>
      </Sub>
    )
  }

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
            {/* One icon colour across the drawer — emoji brought their own
                palette and fought the tokens either side of them. */}
            <p className="text-xs font-semibold uppercase tracking-wider mb-2 flex items-center gap-1.5" style={{ color: 'var(--text-3)' }}>
              <TrendingUp size={13} style={{ color: 'var(--accent)' }} /> ฝั่งขาย
            </p>
            <div className="ds-card p-4 space-y-3">
              <StepBar steps={[
                // Only 38 of 52 projects record a believable unit count — the rest
                // are one-off work carrying a placeholder 1, or a figure smaller
                // than the rooms we have already sold. A dash is the honest answer
                // there; a percentage would be fiction.
                { label: 'ห้องทั้งหมดในโครงการ', value: hasUnitCount ? row.total_units : null, color: 'var(--text-2)', base: null,
                  sub: hasUnitCount ? undefined : 'ยังไม่ได้ระบุจำนวนห้อง' },
                { label: 'ห้องที่เราขายได้', value: row.rooms_sold, color: 'var(--accent-blue)', base: hasUnitCount ? row.total_units : null },
                { label: 'เปิดงาน', value: row.jobs_total, color: 'var(--accent)', base: hasUnitCount ? row.total_units : null,
                  sub: repeats > 0 ? `ขายซ้ำห้องเดิม ${repeats} งาน` : undefined },
              ]} />
              <div className="flex items-center justify-between text-xs pt-2" style={{ borderTop: '1px solid var(--divider)' }}>
                <span style={{ color: 'var(--text-2)' }}>ลูกค้าจองแล้ว ยังไม่เปิดงาน</span>
                <span className="tabular-nums" style={{ color: row.booked > 0 ? 'var(--accent-amber)' : 'var(--text-3)' }}>
                  {row.booked > 0 ? `${row.booked} ราย` : '–'}
                </span>
              </div>

              {salesYears.length > 0 && (
                <Sub title="ยอดขายแยกตามปี">
                  <SubTable side="sales">
                    <thead>
                      <tr>
                        <th className="text-left py-1 font-normal" style={{ color: 'var(--text-3)' }}>ปีที่ขาย</th>
                        <th className="text-right py-1 font-normal" style={{ color: 'var(--text-3)' }}>งาน</th>
                        <th className="text-right py-1 font-normal" style={{ color: 'var(--text-3)' }}>มูลค่า</th>
                        <th className="text-right py-1 font-normal" style={{ color: 'var(--text-3)' }}>รับแล้ว</th>
                      </tr>
                    </thead>
                    <tbody>
                      {salesYears.map(([year, s]) => (
                        <tr key={year}>
                          {/* Buddhist era, matching every other date in the app */}
                          <td className="py-1 font-semibold tabular-nums" style={{ color: 'var(--text-1)' }}>{year + 543}</td>
                          <td className="py-1 text-right tabular-nums" style={{ color: 'var(--text-1)' }}>{s.n}</td>
                          <td className="py-1 text-right tabular-nums" style={{ color: 'var(--text-2)' }}>{fK(s.rev)}</td>
                          <td className="py-1 text-right tabular-nums font-semibold" style={{ color: 'var(--accent-green)' }}>{fK(s.cash)}</td>
                        </tr>
                      ))}
                    </tbody>
                    <TotalRow slices={salesYears.map(([, s]) => s)} side="sales" />
                  </SubTable>
                  {noOrderDate > 0 && (
                    <p className="text-micro mt-1" style={{ color: 'var(--accent-amber)' }}>
                      ⚠ อีก {noOrderDate} งานไม่มีวันขาย จึงไม่ปรากฏในตารางนี้
                    </p>
                  )}
                </Sub>
              )}

              <Group title="แยกตามประเภทงาน" items={catRows} firstCol="ประเภทงาน" side="sales" />
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

              <Group title="แยกตามประเภทลูกค้า" items={custRows} firstCol="ประเภทลูกค้า" side="sales" />

              {salesRows.length > 0 && (
                <Sub title="ทีมขายที่ดูแลโครงการนี้">
                  <SubTable side="sales">
                    <thead>
                      <tr>
                        <th className="text-left py-1 font-normal" style={{ color: 'var(--text-3)' }}>เซลล์</th>
                        <th className="text-right py-1 font-normal" style={{ color: 'var(--text-3)' }}>งาน</th>
                        <th className="text-right py-1 font-normal" style={{ color: 'var(--text-3)' }}>มูลค่า</th>
                        <th className="text-right py-1 font-normal" style={{ color: 'var(--text-3)' }}>รับแล้ว</th>
                      </tr>
                    </thead>
                    <tbody>
                      {salesRows.map(([who, s]) => (
                        <tr key={who}>
                          <td className="py-1 font-semibold" style={{ color: who === 'ยังไม่ระบุเซลล์' ? 'var(--accent-amber)' : 'var(--text-1)' }}>{who}</td>
                          <td className="py-1 text-right tabular-nums" style={{ color: 'var(--text-1)' }}>{s.n}</td>
                          <td className="py-1 text-right tabular-nums" style={{ color: 'var(--text-2)' }}>{fK(s.rev)}</td>
                          <td className="py-1 text-right tabular-nums font-semibold" style={{ color: 'var(--accent-green)' }}>{fK(s.cash)}</td>
                        </tr>
                      ))}
                    </tbody>
                    <TotalRow slices={salesRows.map(([, s]) => s)} side="sales" />
                  </SubTable>
                </Sub>
              )}
            </div>
          </section>

          <section>
            <p className="text-xs font-semibold uppercase tracking-wider mb-2 flex items-center gap-1.5" style={{ color: 'var(--text-3)' }}>
              <PackageCheck size={13} style={{ color: 'var(--accent)' }} /> ฝั่งส่งมอบ
            </p>
            <div className="ds-card p-4 space-y-3">
              <StepBar steps={[
                { label: 'งานทั้งหมด', value: row.jobs_total, color: 'var(--text-2)', base: null },
                { label: 'กำลังดำเนินการ', value: row.backlog.n, color: 'var(--accent-amber)', base: row.jobs_total,
                  sub: row.backlog.rev > 0 ? fK(row.backlog.rev) : undefined },
                { label: 'ส่งมอบแล้ว', value: row.jobs_delivered, color: 'var(--accent-green)', base: row.jobs_total,
                  sub: row.revenue_delivered > 0 ? fK(row.revenue_delivered) : undefined },
              ]} />

              <div className="flex items-center justify-between text-xs pt-2" style={{ borderTop: '1px solid var(--divider)' }}>
                <span style={{ color: 'var(--text-2)' }}>ขาย → ส่งมอบ เฉลี่ย</span>
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

              <Group title="ความคืบหน้าตามประเภทงาน" items={catRows} firstCol="ประเภทงาน" side="delivery" />
              <Group title="ความคืบหน้าตามประเภทลูกค้า" items={custRows} firstCol="ประเภทลูกค้า" side="delivery" />

              {/* Which years are still open is the question the sales-side year
                  table cannot answer: an old year with work outstanding is a
                  different problem from a new one. */}
              {salesYears.length > 0 && (
                <Sub title="งานค้างส่งมอบ แยกตามปีที่ขาย">
                  <SubTable side="delivery">
                    <thead>
                      <tr>
                        <th className="text-left py-1 font-normal" style={{ color: 'var(--text-3)' }}>ปีที่ขาย</th>
                        <th className="text-right py-1 font-normal" style={{ color: 'var(--text-3)' }}>งาน</th>
                        <th className="text-right py-1 font-normal whitespace-nowrap" style={{ color: 'var(--text-3)' }}>ส่งมอบแล้ว</th>
                        <th className="text-right py-1 font-normal whitespace-nowrap" style={{ color: 'var(--text-3)' }}>รอส่งมอบ</th>
                        <th className="text-right py-1 font-normal whitespace-nowrap" style={{ color: 'var(--text-3)' }}>มูลค่าที่ค้าง</th>
                      </tr>
                    </thead>
                    <tbody>
                      {salesYears.map(([year, s]) => {
                        const waiting = s.n - s.del
                        return (
                          <tr key={year}>
                            <td className="py-1 font-semibold tabular-nums" style={{ color: 'var(--text-1)' }}>{year + 543}</td>
                            <td className="py-1 text-right tabular-nums" style={{ color: 'var(--text-1)' }}>{s.n}</td>
                            <td className="py-1 text-right tabular-nums" style={{ color: s.del > 0 ? 'var(--accent-green)' : 'var(--text-3)' }}>
                              {s.del > 0 ? `${s.del} · ${pct(s.del, s.n)}%` : '–'}
                            </td>
                            <td className="py-1 text-right tabular-nums" style={{ color: waiting > 0 ? 'var(--accent-amber)' : 'var(--text-3)' }}>
                              {waiting > 0 ? waiting : '–'}
                            </td>
                            <td className="py-1 text-right tabular-nums font-semibold" style={{ color: waiting > 0 ? 'var(--text-1)' : 'var(--text-3)' }}>
                              {waiting > 0 ? fK(s.rev - s.delRev) : '–'}
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                    <TotalRow slices={salesYears.map(([, s]) => s)} side="delivery" />
                  </SubTable>
                </Sub>
              )}
            </div>
          </section>

          {/* ── What we lost ────────────────────────────────────────────
              Two different losses, and the page showed neither properly. A
              cancelled job had one line saying ยกเลิก with no mention of whose
              money went where; a prospect that never became a job had no line
              at all, because there is no job row to cancel. */}
          {(row.jobs_cancelled > 0 || row.lost_prospects > 0) && (
            <section>
              <p className="text-xs font-semibold uppercase tracking-wider mb-2 flex items-center gap-1.5" style={{ color: 'var(--text-3)' }}>
                <XCircle size={13} style={{ color: 'var(--accent-red)' }} /> งานที่หลุด
              </p>
              <div className="ds-card p-4 space-y-2.5">
                {row.jobs_cancelled > 0 && (
                  <div className="flex items-start justify-between">
                    <div>
                      <p className="text-xs" style={{ color: 'var(--text-2)' }}>งานที่ยกเลิก</p>
                      <p className="text-micro mt-0.5" style={{ color: 'var(--text-3)' }}>เปิดงานแล้วแต่ไม่ได้ทำต่อ</p>
                    </div>
                    <div className="text-right flex-shrink-0">
                      <p className="text-kpi-money" style={{ color: 'var(--accent-red)' }}>{fM(row.revenue_cancelled)}</p>
                      <p className="text-micro" style={{ color: 'var(--text-3)' }}>{row.jobs_cancelled} งาน</p>
                    </div>
                  </div>
                )}

                {/* Refund and forfeit both live in cancel_amount but point in
                    opposite directions — money out versus money kept. Netting
                    them into one figure would hide both. */}
                {row.cancel_refund_n > 0 && (
                  <div className="flex items-center justify-between text-xs pt-2" style={{ borderTop: '1px solid var(--divider)' }}>
                    <span style={{ color: 'var(--text-2)' }}>คืนเงินลูกค้า</span>
                    <span className="tabular-nums" style={{ color: 'var(--accent-orange)' }}>
                      {row.cancel_refund_n} งาน · {row.cancel_refund_amt > 0 ? fK(row.cancel_refund_amt) : 'ยังไม่ระบุยอด'}
                    </span>
                  </div>
                )}
                {row.cancel_forfeit_n > 0 && (
                  <div className="flex items-center justify-between text-xs">
                    <span style={{ color: 'var(--text-2)' }}>ยึดเงินจอง</span>
                    <span className="tabular-nums" style={{ color: 'var(--accent-green)' }}>
                      {row.cancel_forfeit_n} งาน · {row.cancel_forfeit_amt > 0 ? fK(row.cancel_forfeit_amt) : 'ยังไม่ระบุยอด'}
                    </span>
                  </div>
                )}

                {row.lost_prospects > 0 && (
                  <div className="flex items-center justify-between text-xs pt-2" style={{ borderTop: '1px solid var(--divider)' }}>
                    <div>
                      <span style={{ color: 'var(--text-2)' }}>ลูกค้าที่ปิดไม่ได้</span>
                      <p className="text-micro" style={{ color: 'var(--text-3)' }}>ยังไม่ถึงขั้นเปิดงาน จึงไม่มีมูลค่างาน</p>
                    </div>
                    <span className="tabular-nums flex-shrink-0" style={{ color: 'var(--accent-red)' }}>{row.lost_prospects} ราย</span>
                  </div>
                )}
              </div>
            </section>
          )}

          {/* ── Every job, by name ──────────────────────────────────────
              The drawer counted rooms in four different ways and never said
              which rooms. For a head of delivery chasing a specific unit that
              is the first question, and the page held the answer all along. */}
          {row.jobsList.length > 0 && (
            <section>
              <p className="text-xs font-semibold uppercase tracking-wider mb-2 flex items-center gap-1.5" style={{ color: 'var(--text-3)' }}>
                <Building2 size={13} style={{ color: 'var(--accent)' }} /> รายการห้อง ({row.jobsList.length} งาน)
              </p>
              <div className="ds-card overflow-hidden" style={{ padding: 0 }}>
                <div className="overflow-y-auto" style={{ maxHeight: 280 }}>
                  <table className="w-full text-xs">
                    <thead className="sticky top-0" style={{ background: 'var(--card-bg)' }}>
                      <tr style={{ borderBottom: '1px solid var(--divider)' }}>
                        <th className="text-left px-3 py-2 font-semibold" style={{ color: 'var(--text-3)' }}>ห้อง</th>
                        <th className="text-left px-3 py-2 font-semibold" style={{ color: 'var(--text-3)' }}>สถานะ</th>
                        <th className="text-right px-3 py-2 font-semibold" style={{ color: 'var(--text-3)' }}>วันที่ขาย</th>
                        <th className="text-right px-3 py-2 font-semibold" style={{ color: 'var(--text-3)' }}>มูลค่า</th>
                        <th className="text-right px-3 py-2 font-semibold" style={{ color: 'var(--text-3)' }}>รับแล้ว</th>
                      </tr>
                    </thead>
                    <tbody>
                      {row.jobsList.map(j => (
                        <tr key={j.id} style={{ borderTop: '1px solid var(--divider)' }}>
                          <td className="px-3 py-1.5 font-semibold" style={{ color: 'var(--text-1)' }}>{j.room}</td>
                          <td className="px-3 py-1.5" style={{ color: j.delivered ? 'var(--accent-green)' : 'var(--accent-amber)' }}>{j.status}</td>
                          <td className="px-3 py-1.5 text-right tabular-nums" style={{ color: j.order_date ? 'var(--text-2)' : 'var(--accent-amber)' }}>
                            {j.order_date ? thaiDate(j.order_date) : 'ไม่มีวันที่'}
                          </td>
                          <td className="px-3 py-1.5 text-right tabular-nums" style={{ color: 'var(--text-2)' }}>{fK(j.rev)}</td>
                          <td className="px-3 py-1.5 text-right tabular-nums font-semibold" style={{ color: 'var(--accent-green)' }}>{fK(j.cash)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </section>
          )}

          {/* Named per project so the fix has an address, rather than leaving a
              book-wide count that nobody owns. */}
          {missing > 0 && (
            <section>
              <div className="ds-card p-3" style={{ borderColor: 'var(--accent-amber)' }}>
                <p className="text-xs font-semibold mb-1.5" style={{ color: 'var(--accent-amber)' }}>ข้อมูลที่ยังไม่ครบในโครงการนี้</p>
                <div className="space-y-0.5 text-xs" style={{ color: 'var(--text-2)' }}>
                  {row.miss_wt > 0 && <p>• {row.miss_wt} งานยังไม่ระบุประเภทงาน (RPT / N-RPT)</p>}
                  {row.miss_order > 0 && <p>• {row.miss_order} งานยังไม่มีวันที่ขาย — ไม่เข้าตารางแยกตามปี และไม่เข้าค่าเฉลี่ยขาย→ส่งมอบ</p>}
                  {row.miss_sales > 0 && <p>• {row.miss_sales} งานยังไม่ระบุเซลล์ผู้ขาย</p>}
                </div>
                <p className="text-micro mt-1.5" style={{ color: 'var(--text-3)' }}>แก้ไขได้ที่หน้า Data Entry</p>
              </div>
            </section>
          )}

        </div>
      </div>
    </div>
  )
}

/** Every figure in these tables is rounded to the nearest ฿1K, so adding the
 *  printed values by hand can land a thousand off the real total — ฿401K +
 *  ฿40,288K reads as ฿40,689K where the true sum is ฿40,690K. Summing the raw
 *  numbers once and printing the answer removes the need to add them at all. */
function TotalRow({ slices, side }: { slices: Slice[]; side: 'sales' | 'delivery' }) {
  const t = slices.reduce((a, s) => ({
    n: a.n + s.n, rev: a.rev + s.rev, cash: a.cash + s.cash,
    del: a.del + s.del, delRev: a.delRev + s.delRev,
  }), { n: 0, rev: 0, cash: 0, del: 0, delRev: 0 })
  if (t.n === 0) return null
  const waiting = t.n - t.del
  const cell = 'py-1 text-right tabular-nums font-bold'
  return (
    <tfoot>
      <tr style={{ borderTop: '1px solid var(--divider)' }}>
        <td className="py-1 font-bold" style={{ color: 'var(--text-2)' }}>รวม</td>
        <td className={cell} style={{ color: 'var(--text-1)' }}>{t.n}</td>
        {side === 'sales' ? (
          <>
            <td className={cell} style={{ color: 'var(--text-1)' }}>{fK(t.rev)}</td>
            <td className={cell} style={{ color: 'var(--accent-green)' }}>{fK(t.cash)}</td>
          </>
        ) : (
          <>
            <td className={cell} style={{ color: 'var(--accent-green)' }}>{t.del > 0 ? t.del : '–'}</td>
            <td className={cell} style={{ color: 'var(--accent-amber)' }}>{waiting > 0 ? waiting : '–'}</td>
            <td className={cell} style={{ color: 'var(--text-1)' }}>{waiting > 0 ? fK(t.rev - t.delRev) : '–'}</td>
          </>
        )}
      </tr>
    </tfoot>
  )
}

/** Four breakdown tables stack inside one card, and left to themselves each one
 *  sizes its columns to its own contents — so ปีที่ขาย (short) and ประเภทลูกค้า
 *  (long) push their number columns to different x positions and the stack
 *  reads as ragged even though every figure is right-aligned. Fixed layout with
 *  one shared set of widths per side puts every column on the same line down
 *  the whole card. */
const COLS = {
  sales: ['38%', '14%', '24%', '24%'],
  delivery: ['30%', '12%', '20%', '16%', '22%'],
} as const

const SubTable = ({ side, children }: { side: 'sales' | 'delivery'; children: React.ReactNode }) => (
  <table className="w-full text-xs" style={{ tableLayout: 'fixed' }}>
    <colgroup>{COLS[side].map((w, i) => <col key={i} style={{ width: w }} />)}</colgroup>
    {children}
  </table>
)

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
      const [projRes, jobRes, custRes, payRes, userRes] = await Promise.all([
        supabase.from('projects').select('id, name, total_units').order('name'),
        supabase.from('jobs').select('id, project_id, room_no, working_status, revenue_inc_vat, work_type, customer_type, order_date, actual_deliver_date, sales_id, cancel_type, cancel_amount, crm_stage, customer_id'),
        supabase.from('customers').select('id, project_id, status'),
        // 1,173 instalment rows against PostgREST's 1,000 cap — fetchAllRows or
        // the cash figures come out short with no error to say so.
        fetchAllRows(() => supabase.from('payments')
          .select('job_id, status, amount, paid_amount, voucher_amount')),
        // No active/role filter: a job sold by someone who has since left still
        // needs a name against it, and 46 of 953 jobs carry no sales_id at all.
        supabase.from('users').select('id, name'),
      ])

      const projects = projRes.data || []
      const jobs = jobRes.data || []
      const customers = custRes.data || []
      const salesName = new Map<string, string>(
        ((userRes.data || []) as any[]).map(u => [u.id, u.name])
      )

      // Cash actually collected per job. Voucher counts: it settles the
      // instalment just as cash does, which is the rule every other page uses.
      const paidByJob = new Map<string, number>()
      for (const p of ((payRes.data || []) as any[])) {
        if (p.status !== 'paid') continue
        const got = Number(p.paid_amount ?? p.amount ?? 0) + Number(p.voucher_amount ?? 0)
        paidByJob.set(p.job_id, (paidByJob.get(p.job_id) || 0) + got)
      }

      const slice = (): Slice => ({ n: 0, rev: 0, cash: 0, del: 0, delRev: 0 })
      const addTo = (s: Slice, rev: number, cash: number, delivered = false) => {
        s.n++; s.rev += rev; s.cash += cash
        if (delivered) { s.del++; s.delRev += rev }
      }

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
        bySales: Map<string, Slice>
        jobsList: JobLine[]
        miss_wt: number; miss_order: number; miss_sales: number
        cancel_refund_n: number; cancel_refund_amt: number
        cancel_forfeit_n: number; cancel_forfeit_amt: number
        /** Distinct rooms won. Jobs outnumber rooms because a room can be sold
         *  again — the gap between the two is the repeat business. */
        rooms: Set<string>
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
        rooms: new Set<string>(),
        bySales: new Map<string, Slice>(),
        jobsList: [],
        miss_wt: 0, miss_order: 0, miss_sales: 0,
        cancel_refund_n: 0, cancel_refund_amt: 0,
        cancel_forfeit_n: 0, cancel_forfeit_amt: 0,
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
          // cancel_amount means opposite things either side of cancel_type:
          // money handed back on a refund, money we kept on a forfeit. Summing
          // them together would net a loss against a gain.
          const amt = Number(j.cancel_amount || 0)
          if (j.cancel_type === 'forfeit') { m.cancel_forfeit_n++; m.cancel_forfeit_amt += amt }
          else { m.cancel_refund_n++; m.cancel_refund_amt += amt }
          continue
        }

        const cash = paidByJob.get(j.id) || 0
        const isDel = j.working_status === 'ส่งมอบแล้ว'
        m.total++
        if (isDel) { m.delivered++; m.rev_del += rev; m.cash_del += cash }
        else m.active++
        m.rev_total += rev
        m.cash_total += cash

        if (j.room_no && String(j.room_no).trim()) m.rooms.add(String(j.room_no).trim())

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
            addTo(m.salesByYear.get(y)!, rev, cash, isDel)
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
        addTo(m.byCat[cat], rev, cash, isDel)
        addTo(m.byCust[ctype], rev, cash, isDel)

        const who = j.sales_id ? (salesName.get(j.sales_id) || 'ไม่ทราบชื่อ') : 'ยังไม่ระบุเซลล์'
        if (!m.bySales.has(who)) m.bySales.set(who, slice())
        addTo(m.bySales.get(who)!, rev, cash, isDel)

        m.jobsList.push({
          id: j.id,
          room: j.room_no ? String(j.room_no).trim() : '–',
          status: j.working_status || 'ไม่ระบุ',
          rev, cash,
          order_date: j.order_date || null,
          delivered: isDel,
        })

        if (!j.order_date) m.miss_order++
        if (!j.sales_id) m.miss_sales++
        if (cat === 'unknown') m.miss_wt++
        if (cat === 'unknown') m.unknown_wt++
        else if (ctype === 'B2B') { cat === 'N-RPT' ? m.b2b_nrpt++ : m.b2b_rpt++ }
        else                      { cat === 'N-RPT' ? m.b2c_nrpt++ : m.b2c_rpt++ }
      }

      // ── Prospect stages: the job decides, not the customer ─────────────
      // customers.status is a single field, and one customer can hold several
      // jobs — a room ordered twice shares the record. Every stage move writes
      // that field, so the last move overwrites what the other job was doing,
      // and counting customers by it both double-counts and loses stages.
      //
      // The rule: a customer's stages are their jobs' stages. customers.status
      // speaks only for the 13 prospects that have no job row at all — records
      // predating createProspectJob, 10 of them at จอง, and they would vanish
      // from this page entirely if the field were ignored outright.
      const custMap = new Map<string, number>()
      const lostMap = new Map<string, number>()
      const bump = (m: Map<string, number>, pid: string) => m.set(pid, (m.get(pid) || 0) + 1)

      for (const j of jobs as any[]) {
        if (!j.project_id) continue
        if (j.crm_stage === 'booked') bump(custMap, j.project_id)
        else if (j.crm_stage === 'lost') bump(lostMap, j.project_id)
      }
      const customersWithJobs = new Set((jobs as any[]).map(j => j.customer_id).filter(Boolean))
      for (const c of customers) {
        if (!c.project_id || customersWithJobs.has((c as any).id)) continue
        if (c.status === 'booked') bump(custMap, c.project_id)
        else if (c.status === 'lost') bump(lostMap, c.project_id)
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
          rooms_sold: j.rooms.size,
          bySales: j.bySales,
          // Newest sale first; jobs with no order_date sink to the bottom rather
          // than sorting as the epoch and heading the list.
          jobsList: j.jobsList.sort((a, b) => (b.order_date || '').localeCompare(a.order_date || '')),
          miss_wt: j.miss_wt, miss_order: j.miss_order, miss_sales: j.miss_sales,
          cancel_refund_n: j.cancel_refund_n, cancel_refund_amt: j.cancel_refund_amt,
          cancel_forfeit_n: j.cancel_forfeit_n, cancel_forfeit_amt: j.cancel_forfeit_amt,
          lost_prospects: lostMap.get(p.id) || 0,
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
    // Two sort keys are not flat properties: backlog_rev lives inside a slice,
    // and outstanding is a subtraction. Both are read rather than indexed.
    const sortVal = (r: ProjectRow) =>
      sortKey === 'backlog_rev' ? r.backlog.rev
      : sortKey === 'outstanding' ? Math.max(r.revenue_total - r.cash_total, 0)
      : (r[sortKey] as number)
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
    cash: acc.cash + r.cash_total,
    // Room numbers are only unique inside a project, so these sum rather than
    // going through a Set — two projects can each hold a room "910".
    rooms: acc.rooms + r.rooms_sold,
  }), { units: 0, booked: 0, jobs: 0, delivered: 0, rev: 0, revDel: 0, b2c_rpt: 0, b2c_nrpt: 0, b2b_rpt: 0, b2b_nrpt: 0, unknown_wt: 0, cancelled: 0, revCancelled: 0, backlogN: 0, backlogRev: 0, leadSum: 0, leadCount: 0, cash: 0, rooms: 0 }), [filtered])

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
              {/* The page reported what was sold and handed over but never what
                  had actually been collected — ฿73.75M outstanding across the
                  book, and finding the worst project meant opening 52 drawers. */}
              <Th label="ค้างรับ" sortKey="outstanding" current={sortKey} dir={sortDir} onSort={handleSort} />
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
                  {/* Rooms, not jobs. 18 projects have a room that ordered more
                      than once, so the job count overstated how much of the
                      building we have actually reached. Both are shown. */}
                  <td className="px-3 py-2.5 text-right">
                    {r.jobs_total > 0 ? (
                      <>
                        <span className="text-xs font-bold tabular-nums" style={{ color: 'var(--text-1)' }}>{r.rooms_sold} ห้อง</span>
                        {r.jobs_total > r.rooms_sold && (
                          <p className="text-micro tabular-nums" style={{ color: 'var(--text-3)' }}>{r.jobs_total} งาน</p>
                        )}
                      </>
                    ) : <span className="text-xs" style={{ color: 'var(--text-3)' }}>–</span>}
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
                  <td className="px-3 py-2.5 text-right">
                    {(() => {
                      const owed = Math.max(r.revenue_total - r.cash_total, 0)
                      if (owed <= 0) return <span className="text-xs" style={{ color: 'var(--text-3)' }}>–</span>
                      return (
                        <>
                          <p className="text-xs tabular-nums font-semibold" style={{ color: 'var(--accent-orange)' }}>{fK(owed)}</p>
                          <p className="text-micro tabular-nums" style={{ color: 'var(--text-3)' }}>
                            รับแล้ว {pct(r.cash_total, r.revenue_total)}%
                          </p>
                        </>
                      )
                    })()}
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
              <td className="px-3 py-2.5 text-right">
                <p className="text-xs font-bold tabular-nums" style={{ color: 'var(--text-1)' }}>{totals.rooms.toLocaleString()} ห้อง</p>
                {totals.jobs > totals.rooms && (
                  <p className="text-micro tabular-nums" style={{ color: 'var(--text-3)' }}>{totals.jobs} งาน</p>
                )}
              </td>
              <td className="px-3 py-2.5 text-right text-xs font-bold tabular-nums" style={{ color: 'var(--accent-green)' }}>{totals.delivered}</td>
              <td className="px-3 py-2.5"><FunnelBar delivered={totals.delivered} total={totals.jobs} /></td>
              <td className="px-3 py-2.5 text-right text-xs font-bold tabular-nums" style={{ color: 'var(--accent)' }}>{fM(totals.rev)}</td>
              <td className="px-3 py-2.5 text-right text-xs font-bold tabular-nums" style={{ color: 'var(--accent-green)' }}>{fM(totals.revDel)}</td>
              <td className="px-3 py-2.5 text-right">
                {totals.rev - totals.cash > 0 ? (
                  <>
                    <p className="text-xs font-bold tabular-nums" style={{ color: 'var(--accent-orange)' }}>{fM(totals.rev - totals.cash)}</p>
                    <p className="text-micro tabular-nums" style={{ color: 'var(--text-3)' }}>รับแล้ว {pct(totals.cash, totals.rev)}%</p>
                  </>
                ) : <span className="text-xs" style={{ color: 'var(--text-3)' }}>–</span>}
              </td>
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

