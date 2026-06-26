'use client'

import { useEffect, useState, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import {
  Search, Upload, CheckCircle, XCircle, AlertCircle,
  UserPlus, Users, RefreshCw, ChevronDown, ChevronUp, Filter
} from 'lucide-react'

interface Lead {
  id: number
  project_id: string
  tower: string
  room_no: string
  model_name: string
  customer_name: string
  phone: string
  email: string
  contract_price: number
  s00_budget: number
  transfer_date: string
  consent: string
  origin_sales: string
  customer_id: string | null
  projects?: { name: string }
}

interface Project { id: string; name: string }
interface User { id: string; name: string }

interface ImportRow {
  project_id: string
  tower: string
  room_no: string
  model_id: string
  model_name: string
  customer_name: string
  phone: string
  email: string
  contract_price: number
  s00_budget: number
  total_payment: number
  booking_date: string
  transfer_date: string
  consent: string
  origin_sales: string
  _valid: boolean
  _error: string
  _dup: boolean
}

// Column mapping for Origin CRM xlsx export
const LEAD_MAP: Record<string, string> = {
  'Customer': 'customer_name',
  'Call Contract': 'phone',
  'e-receipt': 'email',
  'Project ID': 'project_id',
  'Project Name Eng': '_project_name',
  'Tower': 'tower',
  'Room No': 'room_no',
  'Model ID': 'model_id',
  'Model Name': 'model_name',
  'ราคาหน้าสัญญา (ห้องที่ยังไม่ขาย BG Price)': 'contract_price',
  'ราคาหน้าสัญญา': 'contract_price',
  'SOO,C00': 's00_budget',
  'Total Payment': 'total_payment',
  'วันที่จอง': 'booking_date',
  'วันที่โอนกรรมสิทธิ์ตามสัญญา': 'transfer_date',
  'Call Contract\nConsent': 'consent',
  'Call Contract Consent': 'consent',
  'พนักงานขาย': 'origin_sales',
}

async function parseXlsxLeads(file: File): Promise<Record<string, string>[]> {
  const XLSX = await import('xlsx')
  const buf = await file.arrayBuffer()
  const wb = XLSX.read(buf, { type: 'array' })
  const ws = wb.Sheets[wb.SheetNames[0]]
  const range = XLSX.utils.decode_range(ws['!ref'] || 'A1')
  let headerRow = 0
  for (let r = range.s.r; r <= Math.min(range.s.r + 5, range.e.r); r++) {
    for (let c = range.s.c; c <= range.e.c; c++) {
      const cell = ws[XLSX.utils.encode_cell({ r, c })]
      if (cell && (cell.v === 'Customer' || cell.v === 'No.' || cell.v === 'Tower')) {
        headerRow = r
        break
      }
    }
    if (headerRow > 0) break
  }
  return XLSX.utils.sheet_to_json<Record<string, string>>(ws, { range: headerRow, defval: '', raw: false })
}

function numVal(v: string) {
  return Number(String(v).replace(/,/g, '').trim()) || 0
}

function fmtDate(v: string) {
  if (!v || v === 'NaN' || v.toLowerCase() === 'nan') return ''
  const d = new Date(v)
  return isNaN(d.getTime()) ? '' : d.toISOString().split('T')[0]
}

function fmtBaht(n: number) {
  if (!n) return '—'
  return n.toLocaleString('th-TH', { minimumFractionDigits: 0 })
}

export default function LeadsPage() {
  const supabase = createClient()
  const [leads, setLeads] = useState<Lead[]>([])
  const [projects, setProjects] = useState<Project[]>([])
  const [users, setUsers] = useState<User[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [filterProject, setFilterProject] = useState('')
  const [filterStatus, setFilterStatus] = useState<'all' | 'new' | 'in_pipeline'>('all')
  const [showImport, setShowImport] = useState(false)
  const [importRows, setImportRows] = useState<ImportRow[]>([])
  const [importing, setImporting] = useState(false)
  const [importResult, setImportResult] = useState<{ done: number; skipped: number; dup: number } | null>(null)
  const [addingId, setAddingId] = useState<number | null>(null)
  const [addError, setAddError] = useState<string>('')

  const load = useCallback(async () => {
    setLoading(true)
    const [{ data: l }, { data: p }, { data: u }] = await Promise.all([
      supabase.from('condo_leads').select('*, projects(name)').order('tower').order('room_no'),
      supabase.from('projects').select('id,name').eq('active', true).order('name'),
      supabase.from('users').select('id,name').eq('active', true).order('name'),
    ])
    setLeads((l as any) || [])
    setProjects(p || [])
    setUsers(u || [])
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

  // ── Import logic ─────────────────────────────────────────
  async function handleFile(file: File) {
    setImportResult(null)
    const rawRows = await parseXlsxLeads(file)
    const existingKeys = new Set(leads.map(l => `${l.project_id}|${l.tower}|${l.room_no}`))

    const parsed: ImportRow[] = rawRows.map(row => {
      const m: any = { _valid: true, _error: '', _dup: false }
      for (const [h, val] of Object.entries(row)) {
        const dbField = LEAD_MAP[h] || LEAD_MAP[h.trim()]
        if (dbField) m[dbField] = val
      }
      // Resolve project
      if (m.project_id) {
        const byId = projects.find(p => p.id === m.project_id)
        if (!byId) {
          const byName = projects.find(p => p.name.toLowerCase().includes((m._project_name || m.project_id).toLowerCase()))
          if (byName) m.project_id = byName.id
          else { m._valid = false; m._error = `ไม่พบโครงการ: ${m.project_id}` }
        }
      } else if (m._project_name) {
        const byName = projects.find(p => p.name.toLowerCase().includes(m._project_name.toLowerCase()))
        if (byName) m.project_id = byName.id
      }
      // Clean
      m.contract_price = numVal(m.contract_price)
      m.s00_budget = numVal(m.s00_budget)
      m.total_payment = numVal(m.total_payment)
      m.transfer_date = fmtDate(m.transfer_date)
      m.booking_date = fmtDate(m.booking_date)
      m.consent = m.consent || ''
      // Check dup
      const key = `${m.project_id}|${m.tower}|${m.room_no}`
      if (existingKeys.has(key)) { m._dup = true; m._valid = false; m._error = 'มีในระบบแล้ว' }
      if (!m.customer_name) { m._valid = false; m._error = 'ไม่มีชื่อ' }
      delete m._project_name
      return m as ImportRow
    }).filter(r => r.customer_name || r._error)

    setImportRows(parsed)
  }

  async function doImport() {
    const valid = importRows.filter(r => r._valid)
    if (!valid.length) return
    setImporting(true)
    let done = 0, skipped = 0, dup = importRows.filter(r => r._dup).length
    for (const row of valid) {
      const { _valid, _error, _dup, ...data } = row
      const { error } = await supabase.from('condo_leads').insert(data)
      if (error) skipped++; else done++
    }
    setImporting(false)
    setImportResult({ done, skipped, dup })
    setImportRows([])
    load()
  }

  // ── Add to Pipeline ───────────────────────────────────────
  async function addToPipeline(lead: Lead) {
    setAddingId(lead.id)
    setAddError('')
    // Generate customer id
    const { data: existing } = await supabase.from('customers').select('id').order('id', { ascending: false }).limit(1)
    const lastNum = existing?.[0]?.id ? parseInt(existing[0].id.replace('CST-', '')) : 0
    const newId = 'CST-' + String(lastNum + 1).padStart(4, '0')
    const projId = lead.project_id || null
    const room = lead.tower && lead.room_no ? `${lead.tower}-${lead.room_no}` : lead.room_no || ''
    const { error: ce } = await supabase.from('customers').insert({
      id: newId,
      customer_name: lead.customer_name,
      phone: lead.phone || '',
      email: lead.email || '',
      project_id: projId,
      interested_room: room,
      budget: lead.s00_budget || lead.contract_price || 0,
      status: 'new',
      notes: lead.model_name ? `Model: ${lead.model_name}` : '',
    })
    if (ce) { setAddError(ce.message); setAddingId(null); return }
    // Link lead → customer
    await supabase.from('condo_leads').update({ customer_id: newId }).eq('id', lead.id)
    setAddingId(null)
    load()
  }

  // ── Filter ────────────────────────────────────────────────
  const filtered = leads.filter(l => {
    const q = search.toLowerCase()
    const matchSearch = !q || l.customer_name?.toLowerCase().includes(q) ||
      l.phone?.includes(q) || l.room_no?.includes(q) || l.tower?.includes(q)
    const matchProject = !filterProject || l.project_id === filterProject
    const matchStatus = filterStatus === 'all' ? true
      : filterStatus === 'in_pipeline' ? !!l.customer_id
      : !l.customer_id
    return matchSearch && matchProject && matchStatus
  })

  const stats = {
    total: leads.length,
    inPipeline: leads.filter(l => l.customer_id).length,
    new: leads.filter(l => !l.customer_id).length,
  }

  return (
    <div className="p-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-5">
        <div>
          <h1 className="text-xl font-bold" style={{ color: 'var(--text-1)' }}>Condo Leads Pool</h1>
          <p className="text-sm mt-0.5" style={{ color: 'var(--text-3)' }}>
            ข้อมูลลูกค้าจาก Origin CRM — ดึงเข้า Pipeline เมื่อพร้อมขาย
          </p>
        </div>
        <div className="flex gap-2">
          <button onClick={() => load()} className="p-2 rounded-xl transition-colors" style={{ background: 'var(--hover-bg)', color: 'var(--text-2)' }}>
            <RefreshCw size={15} />
          </button>
          <button onClick={() => { setShowImport(!showImport); setImportResult(null); setImportRows([]) }}
            className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium transition-colors"
            style={{ background: 'var(--hover-bg)', color: 'var(--text-2)', border: '1px solid var(--glass-border)' }}>
            <Upload size={15} />นำเข้า xlsx
          </button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-3 mb-5">
        {[
          { label: 'Lead ทั้งหมด', value: stats.total, color: 'var(--text-1)' },
          { label: 'ยังไม่เข้า Pipeline', value: stats.new, color: '#f59e0b' },
          { label: 'เข้า Pipeline แล้ว', value: stats.inPipeline, color: '#34d399' },
        ].map(s => (
          <div key={s.label} className="rounded-2xl p-4" style={{ background: 'var(--glass-bg)', border: '1px solid var(--glass-border)' }}>
            <p className="text-xs mb-1" style={{ color: 'var(--text-3)' }}>{s.label}</p>
            <p className="text-2xl font-bold" style={{ color: s.color }}>{s.value.toLocaleString()}</p>
          </div>
        ))}
      </div>

      {/* Import Panel */}
      {showImport && (
        <div className="rounded-2xl p-5 mb-5" style={{ background: 'var(--glass-bg)', border: '1px solid var(--glass-border)' }}>
          <h3 className="text-sm font-semibold mb-3" style={{ color: 'var(--text-1)' }}>นำเข้าจาก Origin CRM (xlsx)</h3>
          {importResult ? (
            <div className="text-center py-4">
              <CheckCircle size={32} className="mx-auto mb-2 text-green-400" />
              <p className="font-medium" style={{ color: 'var(--text-1)' }}>นำเข้าสำเร็จ</p>
              <p className="text-sm mt-1" style={{ color: 'var(--text-2)' }}>
                เพิ่ม {importResult.done} ราย · ข้าม {importResult.skipped} ราย · ซ้ำ {importResult.dup} ราย
              </p>
              <button onClick={() => { setImportResult(null); setShowImport(false) }}
                className="mt-3 px-5 py-2 text-sm rounded-xl text-white" style={{ background: 'var(--accent)' }}>
                ปิด
              </button>
            </div>
          ) : importRows.length === 0 ? (
            <div
              className="border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition-colors"
              style={{ borderColor: 'var(--divider)', background: 'var(--hover-bg)' }}
              onDragOver={e => e.preventDefault()}
              onDrop={e => { e.preventDefault(); const f = e.dataTransfer.files[0]; if (f) handleFile(f) }}
              onClick={() => { const i = document.createElement('input'); i.type = 'file'; i.accept = '.xlsx,.xls,.csv'; i.onchange = (e: any) => handleFile(e.target.files[0]); i.click() }}
            >
              <Upload size={28} className="mx-auto mb-2" style={{ color: 'var(--text-3)' }} />
              <p className="text-sm font-medium" style={{ color: 'var(--text-2)' }}>วาง xlsx หรือคลิกเพื่อเลือกไฟล์</p>
              <p className="text-xs mt-1" style={{ color: 'var(--text-3)' }}>
                รองรับ Origin CRM Export: Tower, Room No, Customer, Phone, S00, ราคาสัญญา, วันโอน
              </p>
            </div>
          ) : (
            <>
              <div className="flex items-center justify-between mb-3">
                <p className="text-sm font-medium" style={{ color: 'var(--text-1)' }}>
                  พบ {importRows.length} แถว &nbsp;·&nbsp;
                  <span className="text-green-400">✅ {importRows.filter(r => r._valid).length} ใหม่</span> &nbsp;·&nbsp;
                  <span className="text-amber-400">🔁 {importRows.filter(r => r._dup).length} ซ้ำ</span> &nbsp;·&nbsp;
                  <span className="text-red-400">❌ {importRows.filter(r => !r._valid && !r._dup).length} error</span>
                </p>
                <button onClick={() => setImportRows([])} className="text-xs px-3 py-1 rounded-lg" style={{ color: 'var(--text-3)', background: 'var(--hover-bg)' }}>
                  เลือกใหม่
                </button>
              </div>
              <div className="overflow-auto max-h-60 rounded-xl border text-xs" style={{ borderColor: 'var(--divider)' }}>
                <table className="w-full">
                  <thead>
                    <tr style={{ background: 'var(--hover-bg)', borderBottom: '1px solid var(--divider)' }}>
                      {['', 'Tower-ห้อง', 'ชื่อลูกค้า', 'เบอร์', 'ราคาสัญญา', 'S00 (งบตกแต่ง)', 'วันโอน'].map(h => (
                        <th key={h} className="px-3 py-2 text-left" style={{ color: 'var(--text-3)' }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {importRows.slice(0, 100).map((r, i) => (
                      <tr key={i} style={{ borderBottom: '1px solid var(--divider)', background: r._dup ? 'rgba(245,158,11,0.05)' : !r._valid ? 'rgba(239,68,68,0.05)' : 'transparent' }}>
                        <td className="px-3 py-1.5">
                          {r._valid ? <CheckCircle size={11} className="text-green-400" />
                            : r._dup ? <span title={r._error} className="text-amber-400 text-xs">↩</span>
                            : <span title={r._error}><XCircle size={11} className="text-red-400" /></span>}
                        </td>
                        <td className="px-3 py-1.5" style={{ color: 'var(--text-2)' }}>{r.tower}-{r.room_no}</td>
                        <td className="px-3 py-1.5" style={{ color: 'var(--text-1)' }}>{r.customer_name}</td>
                        <td className="px-3 py-1.5" style={{ color: 'var(--text-2)' }}>{r.phone}</td>
                        <td className="px-3 py-1.5 text-right" style={{ color: 'var(--text-2)' }}>{fmtBaht(r.contract_price)}</td>
                        <td className="px-3 py-1.5 text-right font-medium" style={{ color: r.s00_budget ? '#34d399' : 'var(--text-3)' }}>{fmtBaht(r.s00_budget)}</td>
                        <td className="px-3 py-1.5" style={{ color: 'var(--text-3)' }}>{r.transfer_date || '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="flex justify-end gap-3 mt-3">
                <button onClick={() => setImportRows([])} className="px-4 py-2 text-sm" style={{ color: 'var(--text-3)' }}>ยกเลิก</button>
                <button onClick={doImport} disabled={importing || importRows.filter(r => r._valid).length === 0}
                  className="px-5 py-2 text-sm rounded-xl text-white disabled:opacity-50 flex items-center gap-2"
                  style={{ background: 'var(--accent)' }}>
                  {importing ? 'กำลังนำเข้า...' : `นำเข้า ${importRows.filter(r => r._valid).length} ราย`}
                </button>
              </div>
            </>
          )}
        </div>
      )}

      {/* Filters */}
      <div className="flex gap-3 mb-4 flex-wrap">
        <div className="flex items-center gap-2 rounded-xl px-3 py-2 flex-1 min-w-[200px]"
          style={{ background: 'var(--glass-bg)', border: '1px solid var(--glass-border)' }}>
          <Search size={14} style={{ color: 'var(--text-3)' }} />
          <input value={search} onChange={e => setSearch(e.target.value)}
            placeholder="ค้นหาชื่อ เบอร์ ตึก ห้อง..."
            className="bg-transparent text-sm outline-none flex-1" style={{ color: 'var(--text-1)' }} />
        </div>
        <select value={filterProject} onChange={e => setFilterProject(e.target.value)}
          className="rounded-xl px-3 py-2 text-sm outline-none" style={{ background: 'var(--glass-bg)', border: '1px solid var(--glass-border)', color: 'var(--text-1)' }}>
          <option value="">ทุกโครงการ</option>
          {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
        <div className="flex rounded-xl overflow-hidden" style={{ border: '1px solid var(--glass-border)' }}>
          {(['all', 'new', 'in_pipeline'] as const).map(s => (
            <button key={s} onClick={() => setFilterStatus(s)}
              className="px-3 py-2 text-xs font-medium transition-colors"
              style={{
                background: filterStatus === s ? 'var(--accent)' : 'var(--glass-bg)',
                color: filterStatus === s ? '#fff' : 'var(--text-2)',
              }}>
              {s === 'all' ? 'ทั้งหมด' : s === 'new' ? 'ยังไม่เข้า Pipeline' : 'เข้าแล้ว'}
            </button>
          ))}
        </div>
      </div>

      {addError && (
        <div className="flex items-center gap-2 mb-3 p-3 rounded-xl text-xs text-red-400" style={{ background: 'rgba(239,68,68,0.1)' }}>
          <AlertCircle size={14} />{addError}
        </div>
      )}

      {/* Table */}
      <div className="rounded-2xl overflow-hidden" style={{ background: 'var(--glass-bg)', border: '1px solid var(--glass-border)' }}>
        <table className="w-full">
          <thead>
            <tr style={{ borderBottom: '1px solid var(--divider)' }}>
              {['ตึก-ห้อง / Model', 'ชื่อลูกค้า', 'เบอร์โทร', 'ราคาสัญญา', 'S00 (งบตกแต่ง)', 'วันโอน', 'สถานะ', ''].map(h => (
                <th key={h} className="text-left px-4 py-3 text-xs font-semibold" style={{ color: 'var(--text-3)' }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {loading && (
              <tr><td colSpan={8} className="text-center py-12 text-sm" style={{ color: 'var(--text-3)' }}>กำลังโหลด...</td></tr>
            )}
            {!loading && filtered.length === 0 && (
              <tr><td colSpan={8} className="text-center py-12">
                <Users size={32} className="mx-auto mb-2" style={{ color: 'var(--text-3)' }} />
                <p className="text-sm" style={{ color: 'var(--text-3)' }}>
                  {leads.length === 0 ? 'ยังไม่มีข้อมูล — กด "นำเข้า xlsx" เพื่อเริ่มต้น' : 'ไม่พบ lead ที่ตรงกับการค้นหา'}
                </p>
              </td></tr>
            )}
            {filtered.map((l, i) => (
              <tr key={l.id} style={{ borderBottom: '1px solid var(--divider)', background: i % 2 ? 'var(--hover-bg)' : 'transparent' }}>
                <td className="px-4 py-3">
                  <p className="text-sm font-mono font-medium" style={{ color: 'var(--accent)' }}>{l.tower}-{l.room_no}</p>
                  <p className="text-xs" style={{ color: 'var(--text-3)' }}>{l.model_name || '—'}</p>
                </td>
                <td className="px-4 py-3">
                  <p className="text-sm font-medium" style={{ color: 'var(--text-1)' }}>{l.customer_name}</p>
                  {l.email && <p className="text-xs truncate max-w-[160px]" style={{ color: 'var(--text-3)' }}>{l.email}</p>}
                </td>
                <td className="px-4 py-3 text-sm" style={{ color: 'var(--text-2)' }}>{l.phone || '—'}</td>
                <td className="px-4 py-3 text-sm text-right" style={{ color: 'var(--text-2)' }}>{fmtBaht(l.contract_price)}</td>
                <td className="px-4 py-3 text-sm text-right font-semibold" style={{ color: l.s00_budget ? '#34d399' : 'var(--text-3)' }}>
                  {fmtBaht(l.s00_budget)}
                </td>
                <td className="px-4 py-3 text-xs" style={{ color: 'var(--text-3)' }}>{l.transfer_date ? l.transfer_date.slice(0, 7) : '—'}</td>
                <td className="px-4 py-3">
                  {l.customer_id
                    ? <span className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full" style={{ background: 'rgba(52,211,153,0.15)', color: '#34d399' }}>
                        <CheckCircle size={10} />เข้า Pipeline แล้ว
                      </span>
                    : <span className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full" style={{ background: 'rgba(245,158,11,0.15)', color: '#f59e0b' }}>
                        ยังไม่ได้ติดต่อ
                      </span>
                  }
                </td>
                <td className="px-4 py-3">
                  {!l.customer_id && (
                    <button
                      onClick={() => addToPipeline(l)}
                      disabled={addingId === l.id}
                      className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-xl font-medium disabled:opacity-50 transition-colors"
                      style={{ background: 'var(--accent)', color: '#fff' }}
                    >
                      <UserPlus size={12} />
                      {addingId === l.id ? '...' : 'เข้า Pipeline'}
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {!loading && (
          <div className="px-4 py-2 text-xs" style={{ borderTop: '1px solid var(--divider)', color: 'var(--text-3)' }}>
            แสดง {filtered.length} จาก {leads.length} lead
          </div>
        )}
      </div>
    </div>
  )
}
