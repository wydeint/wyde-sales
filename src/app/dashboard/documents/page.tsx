'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Plus, FileText, Pencil, ExternalLink } from 'lucide-react'
import Modal from '@/components/ui/Modal'
import { Input, Select, TextArea } from '@/components/ui/Input'

interface Document {
  id: string
  customer_id: string
  doc_type: string
  doc_name: string
  file_url: string
  issued_date: string
  expiry_date: string
  status: string
  notes: string
  created_at: string
  customers?: { name: string }
}

interface Customer { id: string; name: string }

const DOC_TYPES = [
  { value: '', label: '— ประเภทเอกสาร —' },
  { value: 'contract', label: 'สัญญาจ้าง' },
  { value: 'quotation', label: 'ใบเสนอราคา' },
  { value: 'invoice', label: 'ใบแจ้งหนี้' },
  { value: 'receipt', label: 'ใบเสร็จรับเงิน' },
  { value: 'drawing', label: 'แบบแปลน' },
  { value: 'permit', label: 'ใบอนุญาต' },
  { value: 'other', label: 'อื่นๆ' },
]

const STATUS = [
  { value: 'draft', label: 'ร่าง', color: 'bg-gray-500/20 text-gray-400' },
  { value: 'sent', label: 'ส่งแล้ว', color: 'bg-blue-500/20 text-blue-400' },
  { value: 'signed', label: 'เซ็นแล้ว', color: 'bg-green-500/20 text-green-400' },
  { value: 'expired', label: 'หมดอายุ', color: 'bg-red-500/20 text-red-400' },
]

const emptyForm = {
  customer_id: '', doc_type: '', doc_name: '',
  file_url: '', issued_date: '', expiry_date: '',
  status: 'draft', notes: ''
}

export default function DocumentsPage() {
  const supabase = createClient()
  const [docs, setDocs] = useState<Document[]>([])
  const [customers, setCustomers] = useState<Customer[]>([])
  const [loading, setLoading] = useState(true)
  const [open, setOpen] = useState(false)
  const [editing, setEditing] = useState<Document | null>(null)
  const [form, setForm] = useState(emptyForm)
  const [saving, setSaving] = useState(false)
  const [filterType, setFilterType] = useState('')

  async function load() {
    setLoading(true)
    const [{ data: d }, { data: c }] = await Promise.all([
      supabase.from('documents').select('*, customers(name)').order('created_at', { ascending: false }),
      supabase.from('customers').select('id,name').order('name'),
    ])
    setDocs(d || [])
    setCustomers(c || [])
    setLoading(false)
  }

  useEffect(() => { load() }, [])

  function genId() {
    const nums = docs.map(d => parseInt(d.id.replace('DOC-', ''))).filter(n => !isNaN(n))
    return 'DOC-' + String(nums.length > 0 ? Math.max(...nums) + 1 : 1).padStart(4, '0')
  }

  async function save() {
    if (!form.doc_name) return
    setSaving(true)
    if (editing) {
      await supabase.from('documents').update(form).eq('id', editing.id)
    } else {
      await supabase.from('documents').insert({ id: genId(), ...form })
    }
    setSaving(false)
    setOpen(false)
    load()
  }

  const custOptions = [{ value: '', label: '— เลือกลูกค้า —' }, ...customers.map(c => ({ value: c.id, label: c.name }))]
  const typeOptions = DOC_TYPES
  const statusOptions = STATUS.map(s => ({ value: s.value, label: s.label }))
  const typeFilterOptions = [{ value: '', label: 'ทุกประเภท' }, ...DOC_TYPES.filter(t => t.value)]

  const filtered = filterType ? docs.filter(d => d.doc_type === filterType) : docs

  const dateStr = (d: string) => d ? new Date(d).toLocaleDateString('th-TH', { day: '2-digit', month: 'short', year: '2-digit' }) : '-'

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-white text-xl font-bold">เอกสาร</h1>
          <p className="text-[#8b949e] text-sm mt-0.5">จัดการเอกสารทุกประเภท</p>
        </div>
        <button onClick={() => { setEditing(null); setForm(emptyForm); setOpen(true) }}
          className="flex items-center gap-2 bg-[#7c3aed] hover:bg-[#6d28d9] text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors">
          <Plus size={16} />เพิ่มเอกสาร
        </button>
      </div>

      {/* Summary by type */}
      <div className="flex gap-2 mb-4 flex-wrap">
        {DOC_TYPES.filter(t => t.value).map(t => {
          const count = docs.filter(d => d.doc_type === t.value).length
          if (!count) return null
          return (
            <button key={t.value} onClick={() => setFilterType(filterType === t.value ? '' : t.value)}
              className={`px-3 py-1 rounded-full text-xs font-medium transition-all border ${filterType === t.value ? 'border-purple-400 bg-purple-500/20 text-purple-300' : 'border-[#30363d] bg-[#161b22] text-[#8b949e] hover:text-white'}`}>
              {t.label} {count}
            </button>
          )
        })}
      </div>

      {/* Table */}
      <div className="bg-[#161b22] border border-[#30363d] rounded-xl overflow-hidden">
        <table className="w-full">
          <thead>
            <tr className="border-b border-[#21262d]">
              <th className="text-left px-4 py-3 text-[#8b949e] text-xs">ID</th>
              <th className="text-left px-4 py-3 text-[#8b949e] text-xs">ชื่อเอกสาร</th>
              <th className="text-left px-4 py-3 text-[#8b949e] text-xs">ประเภท</th>
              <th className="text-left px-4 py-3 text-[#8b949e] text-xs">ลูกค้า</th>
              <th className="text-left px-4 py-3 text-[#8b949e] text-xs">วันออก</th>
              <th className="text-left px-4 py-3 text-[#8b949e] text-xs">วันหมดอายุ</th>
              <th className="text-left px-4 py-3 text-[#8b949e] text-xs">สถานะ</th>
              <th className="text-left px-4 py-3 text-[#8b949e] text-xs">ไฟล์</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody>
            {loading && <tr><td colSpan={9} className="text-center py-12 text-[#8b949e]">กำลังโหลด...</td></tr>}
            {!loading && filtered.length === 0 && (
              <tr><td colSpan={9} className="text-center py-12">
                <FileText size={32} className="mx-auto text-[#484f58] mb-2" />
                <p className="text-[#8b949e] text-sm">ยังไม่มีเอกสาร</p>
              </td></tr>
            )}
            {filtered.map((d, i) => {
              const st = STATUS.find(s => s.value === d.status) || STATUS[0]
              const typeName = DOC_TYPES.find(t => t.value === d.doc_type)?.label || d.doc_type
              return (
                <tr key={d.id} className={`border-b border-[#21262d] hover:bg-[#1c2128] transition-colors ${i % 2 === 0 ? '' : 'bg-[#0d1117]/30'}`}>
                  <td className="px-4 py-3 text-[#58a6ff] text-xs font-mono">{d.id}</td>
                  <td className="px-4 py-3 text-white text-sm font-medium">{d.doc_name}</td>
                  <td className="px-4 py-3 text-[#8b949e] text-sm">{typeName}</td>
                  <td className="px-4 py-3 text-[#c9d1d9] text-sm">{(d as any).customers?.name || '-'}</td>
                  <td className="px-4 py-3 text-[#c9d1d9] text-sm">{dateStr(d.issued_date)}</td>
                  <td className="px-4 py-3 text-[#c9d1d9] text-sm">{dateStr(d.expiry_date)}</td>
                  <td className="px-4 py-3">
                    <span className={`inline-block px-2 py-0.5 rounded text-xs ${st.color}`}>{st.label}</span>
                  </td>
                  <td className="px-4 py-3">
                    {d.file_url ? (
                      <a href={d.file_url} target="_blank" rel="noreferrer"
                        className="flex items-center gap-1 text-[#58a6ff] text-xs hover:underline">
                        <ExternalLink size={12} />เปิดไฟล์
                      </a>
                    ) : <span className="text-[#484f58] text-xs">ไม่มีไฟล์</span>}
                  </td>
                  <td className="px-4 py-3">
                    <button onClick={() => {
                      setEditing(d)
                      setForm({ customer_id: d.customer_id || '', doc_type: d.doc_type, doc_name: d.doc_name, file_url: d.file_url || '', issued_date: d.issued_date || '', expiry_date: d.expiry_date || '', status: d.status, notes: d.notes || '' })
                      setOpen(true)
                    }} className="text-[#8b949e] hover:text-white transition-colors">
                      <Pencil size={14} />
                    </button>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      {/* Modal */}
      <Modal open={open} onClose={() => setOpen(false)} title={editing ? 'แก้ไขเอกสาร' : 'เพิ่มเอกสารใหม่'} size="lg">
        <div className="grid grid-cols-2 gap-4">
          <div className="col-span-2">
            <Input label="ชื่อเอกสาร *" value={form.doc_name} onChange={e => setForm({ ...form, doc_name: e.target.value })} placeholder="เช่น สัญญาจ้างตกแต่ง ห้อง A-1201" />
          </div>
          <Select label="ประเภทเอกสาร" value={form.doc_type} onChange={e => setForm({ ...form, doc_type: e.target.value })} options={typeOptions} />
          <Select label="ลูกค้า" value={form.customer_id} onChange={e => setForm({ ...form, customer_id: e.target.value })} options={custOptions} />
          <Input label="วันที่ออก" type="date" value={form.issued_date} onChange={e => setForm({ ...form, issued_date: e.target.value })} />
          <Input label="วันหมดอายุ" type="date" value={form.expiry_date} onChange={e => setForm({ ...form, expiry_date: e.target.value })} />
          <Select label="สถานะ" value={form.status} onChange={e => setForm({ ...form, status: e.target.value })} options={statusOptions} />
          <div className="col-span-2">
            <Input label="ลิงค์ไฟล์ (Google Drive)" value={form.file_url} onChange={e => setForm({ ...form, file_url: e.target.value })} placeholder="https://drive.google.com/..." />
          </div>
          <div className="col-span-2">
            <TextArea label="หมายเหตุ" value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} />
          </div>
        </div>
        <div className="flex justify-end gap-3 mt-5">
          <button onClick={() => setOpen(false)} className="px-4 py-2 text-[#8b949e] hover:text-white text-sm transition-colors">ยกเลิก</button>
          <button onClick={save} disabled={saving || !form.doc_name} className="px-4 py-2 bg-[#7c3aed] hover:bg-[#6d28d9] disabled:opacity-50 text-white text-sm rounded-lg transition-colors">
            {saving ? 'กำลังบันทึก...' : 'บันทึก'}
          </button>
        </div>
      </Modal>
    </div>
  )
}
