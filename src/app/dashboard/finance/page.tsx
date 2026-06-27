'use client'

import { useEffect, useState, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { TableSpinner, TableError } from '@/components/ui/StateUI'
import {
  Plus, Wallet, Pencil, AlertCircle, TrendingUp,
  TrendingDown, DollarSign, Activity, Trash2
} from 'lucide-react'
import Modal from '@/components/ui/Modal'
import { Input, Select, TextArea } from '@/components/ui/Input'

// ── Types ──────────────────────────────────────────────────
interface Payment {
  id: string; customer_id: string; project_id: string; room: string
  installment_no: number; installment_name: string
  due_date: string; amount: number; paid_date: string
  paid_amount: number; status: string; receipt_url: string; notes: string
  customers?: { name: string; phone: string }; projects?: { name: string }
}

interface Entry {
  id: number; type: 'income' | 'expense'; category: string
  amount: number; entry_date: string; description: string; ref_id: string
  created_at: string
}

interface Customer { id: string; name: string }
interface Project { id: string; name: string }

// ── Constants ──────────────────────────────────────────────
const INCOME_CATS = ['รับจากลูกค้า (งวด)', 'รับค่าออกแบบ', 'รับค่าวัสดุ', 'รายได้อื่นๆ']
const EXPENSE_CATS = ['เงินเดือน', 'ค่าเช่า/สำนักงาน', 'ค่าวัสดุ/สินค้า', 'ค่าขนส่ง', 'ค่าการตลาด', 'ค่าสาธารณูปโภค', 'ค่าใช้จ่ายอื่นๆ']

const PAY_STATUS = [
  { value: 'pending', label: 'รอชำระ', color: 'bg-yellow-500/20 text-yellow-400' },
  { value: 'overdue', label: 'เกินกำหนด', color: 'bg-red-500/20 text-red-400' },
  { value: 'paid', label: 'ชำระแล้ว', color: 'bg-green-500/20 text-green-400' },
  { value: 'partial', label: 'ชำระบางส่วน', color: 'bg-blue-500/20 text-blue-400' },
]

const INSTALL_NAMES = [
  { value: '', label: '— งวด —' },
  { value: 'deposit', label: 'เงินจอง' },
  { value: 'down_payment', label: 'เงินดาวน์' },
  { value: 'progress_1', label: 'งวดที่ 1 (เริ่มงาน)' },
  { value: 'progress_2', label: 'งวดที่ 2 (ครึ่งงาน)' },
  { value: 'progress_3', label: 'งวดที่ 3 (งานเสร็จ)' },
  { value: 'final', label: 'งวดสุดท้าย' },
  { value: 'other', label: 'อื่นๆ' },
]

const emptyPay = {
  customer_id: '', project_id: '', room: '', installment_no: 1,
  installment_name: '', due_date: '', amount: 0,
  paid_date: '', paid_amount: 0, status: 'pending', receipt_url: '', notes: ''
}

type EntryType = 'income' | 'expense'
const emptyEntry: { type: EntryType; category: string; amount: number; entry_date: string; description: string; ref_id: string } = { type: 'income', category: '', amount: 0, entry_date: new Date().toISOString().slice(0, 10), description: '', ref_id: '' }

// ── Helpers ────────────────────────────────────────────────
const f = (v: number) => '฿' + (v || 0).toLocaleString()
const dateStr = (d: string) => d ? new Date(d).toLocaleDateString('th-TH', { day: '2-digit', month: 'short', year: '2-digit' }) : '-'

type Period = 'week' | 'month' | 'quarter' | 'year'

function getPeriodRange(p: Period): { start: string; end: string; label: string } {
  const now = new Date()
  const y = now.getFullYear(), m = now.getMonth(), d = now.getDay()
  if (p === 'week') {
    const mon = new Date(now); mon.setDate(now.getDate() - ((d + 6) % 7)); mon.setHours(0,0,0,0)
    const sun = new Date(mon); sun.setDate(mon.getDate() + 6)
    return { start: mon.toISOString().slice(0,10), end: sun.toISOString().slice(0,10), label: 'สัปดาห์นี้' }
  }
  if (p === 'month') {
    const start = new Date(y, m, 1); const end = new Date(y, m+1, 0)
    return { start: start.toISOString().slice(0,10), end: end.toISOString().slice(0,10), label: 'เดือนนี้' }
  }
  if (p === 'quarter') {
    const q = Math.floor(m / 3); const start = new Date(y, q*3, 1); const end = new Date(y, q*3+3, 0)
    return { start: start.toISOString().slice(0,10), end: end.toISOString().slice(0,10), label: `ไตรมาส ${q+1}` }
  }
  // year
  return { start: `${y}-01-01`, end: `${y}-12-31`, label: `ปี ${y+543}` }
}

function last6Months() {
  const months = []
  for (let i = 5; i >= 0; i--) {
    const d = new Date(); d.setDate(1); d.setMonth(d.getMonth() - i)
    months.push({ key: d.toISOString().slice(0, 7), label: d.toLocaleDateString('th-TH', { month: 'short', year: '2-digit' }) })
  }
  return months
}

// ── Page ───────────────────────────────────────────────────
export default function FinancePage() {
  const supabase = createClient()
  const [tab, setTab] = useState<'overview' | 'ledger' | 'payments'>('overview')

  // Payments state
  const [payments, setPayments] = useState<Payment[]>([])
  const [customers, setCustomers] = useState<Customer[]>([])
  const [projects, setProjects] = useState<Project[]>([])
  const [payOpen, setPayOpen] = useState(false)
  const [editingPay, setEditingPay] = useState<Payment | null>(null)
  const [payForm, setPayForm] = useState(emptyPay)
  const [payTab, setPayTab] = useState<'outstanding' | 'paid' | 'all'>('outstanding')

  // Entries state
  const [entries, setEntries] = useState<Entry[]>([])
  const [entryOpen, setEntryOpen] = useState(false)
  const [editingEntry, setEditingEntry] = useState<Entry | null>(null)
  const [entryForm, setEntryForm] = useState(emptyEntry)
  const [entryFilter, setEntryFilter] = useState<'all' | 'income' | 'expense'>('all')
  const [entryMonth, setEntryMonth] = useState('')

  const [loading, setLoading] = useState(true)
  const [fetchError, setFetchError] = useState('')
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState('')
  const [period, setPeriod] = useState<Period>('month')

  const load = useCallback(async () => {
    setLoading(true)
    setFetchError('')
    const [{ data: p, error: e1 }, { data: c }, { data: pr }, { data: e }] = await Promise.all([
      supabase.from('payments').select('*, customers(name,phone), projects(name)').order('due_date'),
      supabase.from('customers').select('id,name').order('name'),
      supabase.from('projects').select('id,name').order('name'),
      supabase.from('finance_entries').select('*').order('entry_date', { ascending: false }),
    ])
    if (e1) { setFetchError(e1.message); setLoading(false); return }
    setPayments(p || [])
    setCustomers(c || [])
    setProjects(pr || [])
    setEntries((e as Entry[]) || [])
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

  // ── Payment CRUD ─────────────────────────────────────────
  function genPayId() {
    const nums = payments.map(p => parseInt(p.id.replace('PAY-', ''))).filter(n => !isNaN(n))
    return 'PAY-' + String(nums.length > 0 ? Math.max(...nums) + 1 : 1).padStart(4, '0')
  }

  async function savePay() {
    if (!payForm.customer_id || !payForm.amount) return
    setSaving(true); setSaveError('')
    const payload = { ...payForm, project_id: payForm.project_id || null }
    if (editingPay) {
      const { error } = await supabase.from('payments').update(payload).eq('id', editingPay.id)
      if (error) { setSaveError(error.message); setSaving(false); return }
    } else {
      const { error } = await supabase.from('payments').insert({ id: genPayId(), ...payload })
      if (error) { setSaveError(error.message); setSaving(false); return }
    }
    setSaving(false); setPayOpen(false); load()
  }

  // ── Entry CRUD ───────────────────────────────────────────
  async function saveEntry() {
    if (!entryForm.category || !entryForm.amount || !entryForm.entry_date) return
    setSaving(true); setSaveError('')
    if (editingEntry) {
      const { error } = await supabase.from('finance_entries').update(entryForm).eq('id', editingEntry.id)
      if (error) { setSaveError(error.message); setSaving(false); return }
    } else {
      const { error } = await supabase.from('finance_entries').insert(entryForm)
      if (error) { setSaveError(error.message); setSaving(false); return }
    }
    setSaving(false); setEntryOpen(false); load()
  }

  async function deleteEntry(id: number) {
    if (!confirm('ลบรายการนี้?')) return
    await supabase.from('finance_entries').delete().eq('id', id)
    load()
  }

  // ── Derived ──────────────────────────────────────────────
  const today = new Date().toISOString().slice(0, 10)
  const thisMonth = today.slice(0, 7)
  const overdue = payments.filter(p => p.status !== 'paid' && p.due_date < today)
  const outstanding = payments.filter(p => p.status !== 'paid')
  const paidPayments = payments.filter(p => p.status === 'paid')
  const months = last6Months()

  // Monthly income/expense from entries
  const monthlyData = months.map(m => ({
    ...m,
    income: entries.filter(e => e.type === 'income' && e.entry_date.startsWith(m.key)).reduce((s, e) => s + e.amount, 0),
    expense: entries.filter(e => e.type === 'expense' && e.entry_date.startsWith(m.key)).reduce((s, e) => s + e.amount, 0),
  }))

  // Period-filtered KPIs
  const { start: pStart, end: pEnd, label: pLabel } = getPeriodRange(period)
  const periodEntries = entries.filter(e => e.entry_date >= pStart && e.entry_date <= pEnd)
  const periodIncome = periodEntries.filter(e => e.type === 'income').reduce((s, e) => s + e.amount, 0)
  const periodExpense = periodEntries.filter(e => e.type === 'expense').reduce((s, e) => s + e.amount, 0)
  const periodProfit = periodIncome - periodExpense

  const thisMonthIncome = periodIncome
  const thisMonthExpense = periodExpense
  const thisMonthProfit = periodProfit

  const totalIncome = entries.filter(e => e.type === 'income').reduce((s, e) => s + e.amount, 0)
  const totalExpense = entries.filter(e => e.type === 'expense').reduce((s, e) => s + e.amount, 0)
  const totalPaidReceived = paidPayments.reduce((s, p) => s + p.paid_amount, 0)

  const maxBar = Math.max(...monthlyData.map(m => Math.max(m.income, m.expense)), 1)

  // Filtered entries
  const filteredEntries = entries.filter(e => {
    const matchType = entryFilter === 'all' || e.type === entryFilter
    const matchMonth = !entryMonth || e.entry_date.startsWith(entryMonth)
    return matchType && matchMonth
  })

  // Payment display
  const payBase = payTab === 'outstanding' ? outstanding : payTab === 'paid' ? paidPayments : payments

  const custOptions = [{ value: '', label: '— เลือกลูกค้า —' }, ...customers.map(c => ({ value: c.id, label: c.name }))]
  const projOptions = [{ value: '', label: '— เลือกโครงการ —' }, ...projects.map(p => ({ value: p.id, label: p.name }))]

  return (
    <div className="p-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-5">
        <div>
          <h1 className="text-xl font-bold" style={{ color: 'var(--text-1)' }}>Finance</h1>
          <p className="text-sm mt-0.5" style={{ color: 'var(--text-3)' }}>สุขภาพการเงิน · รายรับ-รายจ่าย · งวดชำระ</p>
        </div>
        {tab === 'payments' && (
          <button onClick={() => { setEditingPay(null); setPayForm(emptyPay); setSaveError(''); setPayOpen(true) }}
            className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium text-white transition-colors"
            style={{ background: 'var(--accent)' }}>
            <Plus size={15} />บันทึกงวดชำระ
          </button>
        )}
        {tab === 'ledger' && (
          <button onClick={() => { setEditingEntry(null); setEntryForm(emptyEntry); setSaveError(''); setEntryOpen(true) }}
            className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium text-white transition-colors"
            style={{ background: 'var(--accent)' }}>
            <Plus size={15} />เพิ่มรายการ
          </button>
        )}
      </div>

      {/* Tabs */}
      <div className="flex gap-1 rounded-xl p-1 mb-5 w-fit" style={{ background: 'var(--hover-bg)', border: '1px solid var(--glass-border)' }}>
        {[
          { key: 'overview', label: 'ภาพรวม', icon: Activity },
          { key: 'ledger', label: 'รายรับ-รายจ่าย', icon: DollarSign },
          { key: 'payments', label: 'งวดชำระ (ห้อง)', icon: Wallet },
        ].map(t => {
          const Icon = t.icon
          return (
            <button key={t.key} onClick={() => setTab(t.key as any)}
              className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors"
              style={{ background: tab === t.key ? 'var(--accent)' : 'transparent', color: tab === t.key ? '#fff' : 'var(--text-2)' }}>
              <Icon size={14} />{t.label}
            </button>
          )
        })}
      </div>

      {/* ── Tab: Overview ─────────────────────────────────── */}
      {tab === 'overview' && (
        <>
          {/* Period filter */}
          <div className="flex gap-2 mb-5 flex-wrap">
            {(['week', 'month', 'quarter', 'year'] as Period[]).map(p => (
              <button key={p} onClick={() => setPeriod(p)}
                className="px-4 py-1.5 rounded-full text-xs font-semibold transition-colors"
                style={{ background: period === p ? 'var(--accent)' : 'var(--hover-bg)', color: period === p ? '#fff' : 'var(--text-2)', border: '1px solid var(--glass-border)' }}>
                {p === 'week' ? 'สัปดาห์' : p === 'month' ? 'เดือน' : p === 'quarter' ? 'ไตรมาส' : 'ปี'}
              </button>
            ))}
            <span className="self-center text-xs ml-1" style={{ color: 'var(--text-3)' }}>{pLabel}</span>
          </div>

          {overdue.length > 0 && (
            <div className="flex items-center gap-3 p-3 rounded-xl mb-4 text-sm" style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)', color: '#f87171' }}>
              <AlertCircle size={15} />มี {overdue.length} งวดเกินกำหนด รวม {f(overdue.reduce((s, p) => s + p.amount, 0))}
            </div>
          )}

          {/* KPI cards */}
          <div className="grid grid-cols-2 gap-3 mb-5 md:grid-cols-4">
            {[
              { label: `รายรับ${pLabel}`, value: thisMonthIncome, color: '#34d399', icon: TrendingUp },
              { label: `รายจ่าย${pLabel}`, value: thisMonthExpense, color: '#f87171', icon: TrendingDown },
              { label: `กำไร${pLabel}`, value: thisMonthProfit, color: thisMonthProfit >= 0 ? '#34d399' : '#f87171', icon: Activity },
              { label: 'ยอดค้างรับ', value: outstanding.reduce((s, p) => s + p.amount, 0), color: '#fbbf24', icon: Wallet },
            ].map(card => {
              const Icon = card.icon
              return (
                <div key={card.label} className="rounded-2xl p-4" style={{ background: 'var(--glass-bg)', border: '1px solid var(--glass-border)' }}>
                  <div className="flex items-center justify-between mb-2">
                    <p className="text-xs" style={{ color: 'var(--text-3)' }}>{card.label}</p>
                    <Icon size={14} style={{ color: card.color }} />
                  </div>
                  <p className="text-xl font-bold" style={{ color: card.color }}>{f(card.value)}</p>
                </div>
              )
            })}
          </div>

          {/* Bar chart: income vs expense last 6 months */}
          <div className="rounded-2xl p-5 mb-5" style={{ background: 'var(--glass-bg)', border: '1px solid var(--glass-border)' }}>
            <p className="text-sm font-semibold mb-4" style={{ color: 'var(--text-1)' }}>รายรับ vs รายจ่าย (6 เดือนล่าสุด)</p>
            <div className="flex items-end gap-3 h-40">
              {monthlyData.map(m => (
                <div key={m.key} className="flex-1 flex flex-col items-center gap-1">
                  <div className="w-full flex gap-0.5 items-end" style={{ height: '120px' }}>
                    <div className="flex-1 rounded-t-md transition-all" style={{ height: `${(m.income / maxBar) * 100}%`, background: 'rgba(52,211,153,0.7)', minHeight: m.income > 0 ? 3 : 0 }} />
                    <div className="flex-1 rounded-t-md transition-all" style={{ height: `${(m.expense / maxBar) * 100}%`, background: 'rgba(248,113,113,0.7)', minHeight: m.expense > 0 ? 3 : 0 }} />
                  </div>
                  <p className="text-xs" style={{ color: 'var(--text-3)' }}>{m.label}</p>
                </div>
              ))}
            </div>
            <div className="flex gap-4 mt-2 justify-center">
              <span className="flex items-center gap-1 text-xs" style={{ color: 'var(--text-3)' }}><span className="w-3 h-3 rounded-sm" style={{ background: 'rgba(52,211,153,0.7)' }} />รายรับ</span>
              <span className="flex items-center gap-1 text-xs" style={{ color: 'var(--text-3)' }}><span className="w-3 h-3 rounded-sm" style={{ background: 'rgba(248,113,113,0.7)' }} />รายจ่าย</span>
            </div>
          </div>

          {/* Summary totals */}
          <div className="grid grid-cols-3 gap-3">
            {[
              { label: 'รายรับสะสมทั้งหมด', value: totalIncome, color: '#34d399' },
              { label: 'รายจ่ายสะสมทั้งหมด', value: totalExpense, color: '#f87171' },
              { label: 'รับชำระจากงวด (ห้อง)', value: totalPaidReceived, color: '#818cf8' },
            ].map(s => (
              <div key={s.label} className="rounded-2xl p-4" style={{ background: 'var(--glass-bg)', border: '1px solid var(--glass-border)' }}>
                <p className="text-xs mb-1" style={{ color: 'var(--text-3)' }}>{s.label}</p>
                <p className="text-lg font-bold" style={{ color: s.color }}>{f(s.value)}</p>
              </div>
            ))}
          </div>
        </>
      )}

      {/* ── Tab: Ledger ───────────────────────────────────── */}
      {tab === 'ledger' && (
        <>
          {/* Filters */}
          <div className="flex gap-3 mb-4 flex-wrap">
            <div className="flex rounded-xl overflow-hidden" style={{ border: '1px solid var(--glass-border)' }}>
              {(['all', 'income', 'expense'] as const).map(f => (
                <button key={f} onClick={() => setEntryFilter(f)}
                  className="px-3 py-2 text-xs font-medium transition-colors"
                  style={{ background: entryFilter === f ? 'var(--accent)' : 'var(--glass-bg)', color: entryFilter === f ? '#fff' : 'var(--text-2)' }}>
                  {f === 'all' ? 'ทั้งหมด' : f === 'income' ? '↑ รายรับ' : '↓ รายจ่าย'}
                </button>
              ))}
            </div>
            <input type="month" value={entryMonth} onChange={e => setEntryMonth(e.target.value)}
              className="rounded-xl px-3 py-2 text-sm outline-none"
              style={{ background: 'var(--glass-bg)', border: '1px solid var(--glass-border)', color: 'var(--text-1)' }} />
          </div>

          {/* Monthly KPI */}
          {entryMonth && (
            <div className="grid grid-cols-3 gap-3 mb-4">
              {['income', 'expense'].map(type => {
                const total = filteredEntries.filter(e => e.type === type).reduce((s, e) => s + e.amount, 0)
                return (
                  <div key={type} className="rounded-xl p-3" style={{ background: 'var(--glass-bg)', border: '1px solid var(--glass-border)' }}>
                    <p className="text-xs" style={{ color: 'var(--text-3)' }}>{type === 'income' ? 'รายรับ' : 'รายจ่าย'}</p>
                    <p className="text-lg font-bold" style={{ color: type === 'income' ? '#34d399' : '#f87171' }}>{f(total)}</p>
                  </div>
                )
              })}
              <div className="rounded-xl p-3" style={{ background: 'var(--glass-bg)', border: '1px solid var(--glass-border)' }}>
                <p className="text-xs" style={{ color: 'var(--text-3)' }}>กำไร</p>
                {(() => {
                  const net = filteredEntries.filter(e => e.type === 'income').reduce((s, e) => s + e.amount, 0)
                    - filteredEntries.filter(e => e.type === 'expense').reduce((s, e) => s + e.amount, 0)
                  return <p className="text-lg font-bold" style={{ color: net >= 0 ? '#34d399' : '#f87171' }}>{f(net)}</p>
                })()}
              </div>
            </div>
          )}

          <div className="rounded-2xl overflow-hidden" style={{ background: 'var(--glass-bg)', border: '1px solid var(--glass-border)' }}>
            <table className="w-full">
              <thead>
                <tr style={{ borderBottom: '1px solid var(--divider)' }}>
                  {['วันที่', 'ประเภท', 'หมวด', 'รายละเอียด', 'Ref', 'จำนวน', ''].map(h => (
                    <th key={h} className="text-left px-4 py-3 text-xs font-semibold" style={{ color: 'var(--text-3)' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {loading && <TableSpinner colSpan={7} />}
                {!loading && fetchError && <TableError colSpan={7} message={fetchError} onRetry={load} />}
                {!loading && filteredEntries.length === 0 && (
                  <tr><td colSpan={7} className="text-center py-10">
                    <DollarSign size={28} className="mx-auto mb-2" style={{ color: 'var(--text-3)' }} />
                    <p className="text-sm" style={{ color: 'var(--text-3)' }}>ยังไม่มีรายการ — กด "เพิ่มรายการ" เพื่อเริ่มต้น</p>
                  </td></tr>
                )}
                {filteredEntries.map((e, i) => (
                  <tr key={e.id} style={{ borderBottom: '1px solid var(--divider)', background: i % 2 ? 'var(--hover-bg)' : 'transparent' }}>
                    <td className="px-4 py-3 text-sm" style={{ color: 'var(--text-2)' }}>{dateStr(e.entry_date)}</td>
                    <td className="px-4 py-3">
                      <span className="text-xs px-2 py-0.5 rounded-full font-medium"
                        style={{ background: e.type === 'income' ? 'rgba(52,211,153,0.15)' : 'rgba(248,113,113,0.15)', color: e.type === 'income' ? '#34d399' : '#f87171' }}>
                        {e.type === 'income' ? '↑ รับ' : '↓ จ่าย'}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-sm" style={{ color: 'var(--text-2)' }}>{e.category}</td>
                    <td className="px-4 py-3 text-sm" style={{ color: 'var(--text-1)' }}>{e.description || '—'}</td>
                    <td className="px-4 py-3 text-xs font-mono" style={{ color: 'var(--text-3)' }}>{e.ref_id || '—'}</td>
                    <td className="px-4 py-3 text-sm font-semibold text-right"
                      style={{ color: e.type === 'income' ? '#34d399' : '#f87171' }}>
                      {e.type === 'income' ? '+' : '-'}{f(e.amount)}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <button onClick={() => { setEditingEntry(e); setEntryForm({ type: e.type, category: e.category, amount: e.amount, entry_date: e.entry_date, description: e.description || '', ref_id: e.ref_id || '' }); setSaveError(''); setEntryOpen(true) }}
                          style={{ color: 'var(--text-3)' }} className="hover:text-white transition-colors">
                          <Pencil size={13} />
                        </button>
                        <button onClick={() => deleteEntry(e.id)} className="text-red-400/50 hover:text-red-400 transition-colors">
                          <Trash2 size={13} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {!loading && (
              <div className="px-4 py-2 text-xs" style={{ borderTop: '1px solid var(--divider)', color: 'var(--text-3)' }}>
                {filteredEntries.length} รายการ
              </div>
            )}
          </div>
        </>
      )}

      {/* ── Tab: Payments ─────────────────────────────────── */}
      {tab === 'payments' && (
        <>
          {overdue.length > 0 && (
            <div className="flex items-center gap-3 p-3 rounded-xl mb-4 text-sm" style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)', color: '#f87171' }}>
              <AlertCircle size={15} />มี {overdue.length} งวดเกินกำหนด รวม {f(overdue.reduce((s, p) => s + p.amount, 0))}
            </div>
          )}
          <div className="grid grid-cols-3 gap-3 mb-4">
            <div className="rounded-xl p-3" style={{ background: 'var(--glass-bg)', border: '1px solid var(--glass-border)' }}>
              <p className="text-xs mb-1" style={{ color: 'var(--text-3)' }}>ยอดค้างรับ</p>
              <p className="text-lg font-bold text-yellow-400">{f(outstanding.reduce((s, p) => s + p.amount, 0))}</p>
            </div>
            <div className="rounded-xl p-3" style={{ background: 'var(--glass-bg)', border: '1px solid var(--glass-border)' }}>
              <p className="text-xs mb-1" style={{ color: 'var(--text-3)' }}>เกินกำหนด</p>
              <p className="text-lg font-bold text-red-400">{f(overdue.reduce((s, p) => s + p.amount, 0))}</p>
            </div>
            <div className="rounded-xl p-3" style={{ background: 'var(--glass-bg)', border: '1px solid var(--glass-border)' }}>
              <p className="text-xs mb-1" style={{ color: 'var(--text-3)' }}>รับแล้ว</p>
              <p className="text-lg font-bold text-green-400">{f(paidPayments.reduce((s, p) => s + p.paid_amount, 0))}</p>
            </div>
          </div>

          <div className="flex gap-1 rounded-xl p-1 mb-4 w-fit" style={{ background: 'var(--hover-bg)', border: '1px solid var(--glass-border)' }}>
            {[
              { key: 'outstanding', label: `ค้างชำระ (${outstanding.length})` },
              { key: 'paid', label: `ชำระแล้ว (${paidPayments.length})` },
              { key: 'all', label: 'ทั้งหมด' },
            ].map(t => (
              <button key={t.key} onClick={() => setPayTab(t.key as any)}
                className="px-3 py-1.5 rounded-lg text-xs font-medium transition-colors"
                style={{ background: payTab === t.key ? 'var(--accent)' : 'transparent', color: payTab === t.key ? '#fff' : 'var(--text-2)' }}>
                {t.label}
              </button>
            ))}
          </div>

          <div className="rounded-2xl overflow-hidden" style={{ background: 'var(--glass-bg)', border: '1px solid var(--glass-border)' }}>
            <table className="w-full">
              <thead>
                <tr style={{ borderBottom: '1px solid var(--divider)' }}>
                  {['ลูกค้า / ห้อง', 'งวด', 'กำหนดชำระ', 'ยอด', 'วันชำระ', 'ชำระแล้ว', 'สถานะ', ''].map(h => (
                    <th key={h} className="text-left px-4 py-3 text-xs font-semibold" style={{ color: 'var(--text-3)' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {loading && <TableSpinner colSpan={8} />}
                {!loading && fetchError && <TableError colSpan={8} message={fetchError} onRetry={load} />}
                {!loading && payBase.length === 0 && (
                  <tr><td colSpan={8} className="text-center py-10">
                    <Wallet size={28} className="mx-auto mb-2" style={{ color: 'var(--text-3)' }} />
                    <p className="text-sm" style={{ color: 'var(--text-3)' }}>ไม่มีรายการ</p>
                  </td></tr>
                )}
                {payBase.map((p, i) => {
                  const st = PAY_STATUS.find(s => s.value === p.status) || PAY_STATUS[0]
                  const isOD = p.status !== 'paid' && p.due_date < today
                  return (
                    <tr key={p.id} style={{ borderBottom: '1px solid var(--divider)', background: isOD ? 'rgba(239,68,68,0.04)' : i % 2 ? 'var(--hover-bg)' : 'transparent' }}>
                      <td className="px-4 py-3">
                        <p className="text-sm font-medium" style={{ color: 'var(--text-1)' }}>{(p as any).customers?.name || '-'}</p>
                        <p className="text-xs" style={{ color: 'var(--accent)' }}>{p.room || (p as any).projects?.name}</p>
                      </td>
                      <td className="px-4 py-3 text-sm" style={{ color: 'var(--text-2)' }}>{INSTALL_NAMES.find(x => x.value === p.installment_name)?.label || p.installment_name || '-'}</td>
                      <td className={`px-4 py-3 text-sm ${isOD ? 'text-red-400 font-medium' : ''}`} style={isOD ? {} : { color: 'var(--text-2)' }}>{dateStr(p.due_date)}</td>
                      <td className="px-4 py-3 text-sm font-medium text-right" style={{ color: 'var(--text-1)' }}>{f(p.amount)}</td>
                      <td className="px-4 py-3 text-sm" style={{ color: 'var(--text-2)' }}>{dateStr(p.paid_date)}</td>
                      <td className="px-4 py-3 text-right">
                        {p.paid_amount > 0 ? <span className="text-sm font-medium text-green-400">{f(p.paid_amount)}</span> : <span style={{ color: 'var(--text-3)' }}>—</span>}
                      </td>
                      <td className="px-4 py-3"><span className={`inline-block px-2 py-0.5 rounded text-xs ${st.color}`}>{st.label}</span></td>
                      <td className="px-4 py-3">
                        <button onClick={() => { setEditingPay(p); setPayForm({ customer_id: p.customer_id, project_id: p.project_id || '', room: p.room || '', installment_no: p.installment_no, installment_name: p.installment_name || '', due_date: p.due_date || '', amount: p.amount, paid_date: p.paid_date || '', paid_amount: p.paid_amount || 0, status: p.status, receipt_url: p.receipt_url || '', notes: p.notes || '' }); setSaveError(''); setPayOpen(true) }}
                          style={{ color: 'var(--text-3)' }} className="hover:text-white transition-colors">
                          <Pencil size={13} />
                        </button>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </>
      )}

      {/* ── Modal: Entry ──────────────────────────────────── */}
      <Modal open={entryOpen} onClose={() => setEntryOpen(false)} title={editingEntry ? 'แก้ไขรายการ' : 'เพิ่มรายการ'}>
        <div className="grid grid-cols-2 gap-4">
          <Select label="ประเภท" value={entryForm.type}
            onChange={e => setEntryForm({ ...entryForm, type: e.target.value as any, category: '' })}
            options={[{ value: 'income', label: '↑ รายรับ' }, { value: 'expense', label: '↓ รายจ่าย' }]} />
          <Select label="หมวด *" value={entryForm.category}
            onChange={e => setEntryForm({ ...entryForm, category: e.target.value })}
            options={[{ value: '', label: '— เลือกหมวด —' }, ...(entryForm.type === 'income' ? INCOME_CATS : EXPENSE_CATS).map(c => ({ value: c, label: c }))]} />
          <Input label="จำนวนเงิน (บาท) *" type="number" value={entryForm.amount} onChange={e => setEntryForm({ ...entryForm, amount: Number(e.target.value) })} />
          <Input label="วันที่ *" type="date" value={entryForm.entry_date} onChange={e => setEntryForm({ ...entryForm, entry_date: e.target.value })} />
          <div className="col-span-2">
            <Input label="รายละเอียด" value={entryForm.description} onChange={e => setEntryForm({ ...entryForm, description: e.target.value })} placeholder="เช่น เงินเดือนพนักงาน ก.ค. 68" />
          </div>
          <div className="col-span-2">
            <Input label="อ้างอิง (PAY-XXXX / JOB-XXXX)" value={entryForm.ref_id} onChange={e => setEntryForm({ ...entryForm, ref_id: e.target.value })} placeholder="ไม่บังคับ" />
          </div>
        </div>
        {saveError && (
          <div className="flex items-center gap-2 mt-3 p-3 rounded-xl text-xs text-red-400" style={{ background: 'rgba(239,68,68,0.1)' }}>
            <AlertCircle size={14} />{saveError}
          </div>
        )}
        <div className="flex justify-end gap-3 mt-5">
          <button onClick={() => setEntryOpen(false)} className="px-4 py-2 text-sm transition-colors" style={{ color: 'var(--text-3)' }}>ยกเลิก</button>
          <button onClick={saveEntry} disabled={saving || !entryForm.category || !entryForm.amount}
            className="px-4 py-2 text-sm rounded-xl text-white disabled:opacity-50 transition-colors" style={{ background: 'var(--accent)' }}>
            {saving ? 'กำลังบันทึก...' : 'บันทึก'}
          </button>
        </div>
      </Modal>

      {/* ── Modal: Payment ────────────────────────────────── */}
      <Modal open={payOpen} onClose={() => setPayOpen(false)} title={editingPay ? 'แก้ไขงวดชำระ' : 'เพิ่มงวดชำระ'} size="lg">
        <div className="grid grid-cols-2 gap-4">
          <Select label="ลูกค้า *" value={payForm.customer_id} onChange={e => setPayForm({ ...payForm, customer_id: e.target.value })} options={custOptions} />
          <Select label="โครงการ" value={payForm.project_id} onChange={e => setPayForm({ ...payForm, project_id: e.target.value })} options={projOptions} />
          <Input label="ห้อง" value={payForm.room} onChange={e => setPayForm({ ...payForm, room: e.target.value })} placeholder="A-1201" />
          <Input label="งวดที่" type="number" value={payForm.installment_no} onChange={e => setPayForm({ ...payForm, installment_no: Number(e.target.value) })} />
          <Select label="ชื่องวด" value={payForm.installment_name} onChange={e => setPayForm({ ...payForm, installment_name: e.target.value })} options={INSTALL_NAMES} />
          <Input label="กำหนดชำระ" type="date" value={payForm.due_date} onChange={e => setPayForm({ ...payForm, due_date: e.target.value })} />
          <Input label="ยอดที่ต้องชำระ *" type="number" value={payForm.amount} onChange={e => setPayForm({ ...payForm, amount: Number(e.target.value) })} />
          <Select label="สถานะ" value={payForm.status} onChange={e => setPayForm({ ...payForm, status: e.target.value })} options={PAY_STATUS.map(s => ({ value: s.value, label: s.label }))} />
          {(payForm.status === 'paid' || payForm.status === 'partial') && (<>
            <Input label="วันที่ชำระ" type="date" value={payForm.paid_date} onChange={e => setPayForm({ ...payForm, paid_date: e.target.value })} />
            <Input label="ยอดที่ชำระ" type="number" value={payForm.paid_amount} onChange={e => setPayForm({ ...payForm, paid_amount: Number(e.target.value) })} />
            <div className="col-span-2">
              <Input label="ลิงค์ใบเสร็จ" value={payForm.receipt_url} onChange={e => setPayForm({ ...payForm, receipt_url: e.target.value })} placeholder="https://drive.google.com/..." />
            </div>
          </>)}
          <div className="col-span-2">
            <TextArea label="หมายเหตุ" value={payForm.notes} onChange={e => setPayForm({ ...payForm, notes: e.target.value })} />
          </div>
        </div>
        {saveError && (
          <div className="flex items-center gap-2 mt-3 p-3 rounded-xl text-xs text-red-400" style={{ background: 'rgba(239,68,68,0.1)' }}>
            <AlertCircle size={14} />{saveError}
          </div>
        )}
        <div className="flex justify-end gap-3 mt-5">
          <button onClick={() => setPayOpen(false)} className="px-4 py-2 text-sm transition-colors" style={{ color: 'var(--text-3)' }}>ยกเลิก</button>
          <button onClick={savePay} disabled={saving || !payForm.customer_id || !payForm.amount}
            className="px-4 py-2 text-sm rounded-xl text-white disabled:opacity-50 transition-colors" style={{ background: 'var(--accent)' }}>
            {saving ? 'กำลังบันทึก...' : 'บันทึก'}
          </button>
        </div>
      </Modal>
    </div>
  )
}
