'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Plus, ArrowLeft, Pencil, Trash2, Image as ImageIcon, FileDown } from 'lucide-react'
import { PageSpinner, PageError, TableEmpty } from '@/components/ui/StateUI'
import PageHeader from '@/components/ui/PageHeader'
import FilterBar from '@/components/ui/FilterBar'
import Modal from '@/components/ui/Modal'
import PeriodPicker from '@/components/ui/PeriodPicker'
import { Input, Select } from '@/components/ui/Input'
import { fetchAllRows } from '@/lib/fetchAll'
import { downloadCsv } from '@/lib/csv'
import { compareRoom, fmtDate } from '@/lib/utils'
import { baht, bahtShort } from '@/lib/money'
import { drawCostTable, copyCanvas, type CopyResult } from '@/lib/costImage'
import { showAlert } from '@/components/ui/dialog'
import { getPeriodBounds, type PeriodUnit } from '@/lib/period'
import {
  ANCHOR_LABELS, PO_KPI_DAYS, ROOM_STATUS_CLASS, anchorDate, effectiveCost,
  gpCosted, gpText, revenueBase, round2, exVatOf, saleSplitOf, SALE_PRICE_TOLERANCE, handoffDays, peopleFor, scoreAdmins, ADMIN_KPI_DAYS, poLeadDays, roomStatus, scorePeople, totalsOf,
  type CostAnchor, type CostCategory, type CostItem, type Supplier,
} from '@/lib/procurement'

/* ── shapes ─────────────────────────────────────────────── */

interface Job {
  id: string
  room_no: string | null
  customer_name: string | null
  customer_type: string | null
  project_id: string | null
  so_no: string | null
  pr_no: string | null
  pr_nos: string[] | null
  po_no: string | null
  revenue_inc_vat: number | null
  revenue_ex_vat: number | null
  order_date: string | null
  job_received_at: string | null
  procurement_received_at: string | null
  expected_finish_date: string | null
  actual_deliver_date: string | null
  working_status: string | null
  sales_id: string | null
  qs_id: string | null
  buyer_id: string | null
  admin_id: string | null
}

interface Project { id: string; name: string }
interface AppUser { id: string; name: string; role: string; dept: string | null }

type Tab = 'summary' | 'work' | 'docs' | 'people' | 'registry'

const TABS: { id: Tab; label: string }[] = [
  { id: 'summary', label: 'Cost & GP%' },
  { id: 'work', label: 'จัดซื้อจัดจ้าง' },
  { id: 'docs', label: 'เอกสาร' },
  { id: 'people', label: 'ผลงานรายคน' },
  { id: 'registry', label: 'ทะเบียน Supplier' },
]

/* PO ในแท็บนี้หมายถึง PO ที่ผู้ว่าจ้างออกมาให้เรา (งาน B2B) ไม่ใช่ PO
   ที่เราออกให้ Supplier — อันนั้นอยู่รายบรรทัดในแท็บจัดซื้อจัดจ้าง */
const DOC_FILTERS: { id: 'so' | 'pr' | 'po' | 'vat'; label: string; test: (j: Job) => boolean }[] = [
  { id: 'so', label: 'ยังไม่มี SO', test: j => !j.so_no },
  { id: 'pr', label: 'ยังไม่มี PR', test: j => !(j.pr_nos?.length) },
  { id: 'po', label: 'ยังไม่มี PO ผู้ว่าจ้าง', test: j => j.customer_type === 'B2B' && !j.po_no },
  // ห้องที่ระบบต้องถอด VAT ให้เอง — ยอดไม่รวม VAT ในระบบยังไม่ถูก รอคนไล่ตรวจ
  { id: 'vat', label: 'VAT ต้องตรวจ',
    test: j => revenueBase(j.revenue_inc_vat, j.revenue_ex_vat).derived },
]

const WRITE_ROLES = ['procurement', 'qs', 'admin', 'admin_sales']

const emptySupplier = { company_name: '', contact_name: '', email: '', phone: '', note: '', cats: [] as string[] }
export default function ProcurementPage() {
  const supabase = createClient()

  const [loading, setLoading] = useState(true)
  const [fetchError, setFetchError] = useState('')
  const [tab, setTab] = useState<Tab>('summary')

  const [jobs, setJobs] = useState<Job[]>([])
  const [items, setItems] = useState<CostItem[]>([])
  const [cats, setCats] = useState<CostCategory[]>([])
  const [sups, setSups] = useState<Supplier[]>([])
  const [supCats, setSupCats] = useState<{ supplier_id: string; category_id: string }[]>([])
  const [projects, setProjects] = useState<Project[]>([])
  const [users, setUsers] = useState<AppUser[]>([])
  const [myRole, setMyRole] = useState('')
  const [myUserId, setMyUserId] = useState('')

  // filters
  const [search, setSearch] = useState('')
  const [projectFilter, setProjectFilter] = useState('')
  const [typeFilter, setTypeFilter] = useState('')
  const [whoFilter, setWhoFilter] = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  /** แท็บเอกสารกรองด้วยคำถามของตัวเอง: อะไรยังไม่ได้กรอก */
  const [docFilter, setDocFilter] = useState<'' | 'so' | 'pr' | 'po' | 'vat'>('')
  /*
   * ตัวกรองช่วงเวลาเปิดตลอด ค่าเริ่มต้นคือเดือนปัจจุบัน — จัดซื้อใช้บ่อย
   * ปุ่ม "ทั้งหมด" อยู่ในแถวเดียวกันสำหรับตอนที่อยากเห็นงานค้างทุกเดือน
   */
  const [byPeriod, setByPeriod] = useState(true)
  const [anchor, setAnchor] = useState<CostAnchor>('delivery')
  const [unit, setUnit] = useState<PeriodUnit>('month')
  const [offset, setOffset] = useState(0)

  // drill-down + modals
  const [openJob, setOpenJob] = useState<string | null>(null)
  const [supModal, setSupModal] = useState<{ open: boolean; editing: Supplier | null }>({ open: false, editing: null })
  const [supForm, setSupForm] = useState(emptySupplier)
  const [catModal, setCatModal] = useState(false)
  const [editCat, setEditCat] = useState<CostCategory | null>(null)
  const [catForm, setCatForm] = useState({ id: '', name: '', owner_dept: 'procurement', needs_supplier: true })
  const [saving, setSaving] = useState(false)

  const canWrite = WRITE_ROLES.includes(myRole)


  /**
   * รายงานจัดซื้อจัดจ้าง — ไฟล์สิ้นเดือน หน้าตาเดียวกับชีต Revenue-Cost ที่ใช้จริง
   *
   * สองระดับเหมือนไฟล์ต้นฉบับ: แถวหัวห้องถือยอดรวมกับ GP แล้วบรรทัดจ้างไล่ลงมา
   * ใต้ห้องโดยเว้นช่องระดับห้องว่างไว้ ทำแบบนี้เพื่อให้คนที่เคยใช้ชีตเดิมเปิดแล้ว
   * อ่านออกทันที และเพราะยอดห้องปรากฏครั้งเดียว ใครรวมคอลัมน์ RV ก็ไม่ได้เลขเกิน
   *
   * ขอบเขต: **ห้องที่ส่งมอบจริงในช่วงที่เลือกเท่านั้น** ไม่ใช่เกณฑ์ "วันส่งมอบ
   * (จริง→คาด)" ที่หน้าจอใช้ — เจ้าของกำหนด 2026-09-08 ว่ารายงานนี้ปิดเดือน
   * จึงต้องเป็นของที่ส่งไปแล้วล้วน ห้องที่ยังไม่ส่งไม่เกี่ยว ตัวกรองอื่นบนจอ
   * (โครงการ · B2C/B2B · คน · คำค้น) ยังมีผลตามปกติ
   *
   * ห้องที่ส่งมอบแล้วแต่ยังไม่ลงต้นทุน **ใส่ลงไปด้วย** โดยช่อง Cost/GP ว่าง —
   * ประโยชน์หลักของรายงานสิ้นเดือนคือเห็นว่าเหลืออะไรยังไม่ทำ ถ้าตัดทิ้งเงียบๆ
   * ยอดรวมจะดูสวยแต่งานที่ค้างจะหายไปจากสายตา
   *
   * Voucher อ่านจาก `payments.voucher_amount` ไม่ใช่ `jobs.voucher` — สองช่อง
   * นี้ไม่ตรงกัน (39 ห้อง/฿1.52M กับ 32 ห้อง/฿0.93M เมื่อ 2026-09-08) และตัวที่
   * ผูกกับงวดที่รับจริงคือฝั่ง payments ดู lib/voucher.ts
   */
  async function exportReport() {
    const inPeriod = (d: string | null) =>
      !!d && (!byPeriod || (d >= bounds.start && d <= bounds.end))
    const rooms = liveJobs
      .filter(j => matchesFilters(j))
      .filter(j => inPeriod(j.actual_deliver_date))
      .sort((a, b) => (projById.get(a.project_id ?? '') ?? '').localeCompare(projById.get(b.project_id ?? '') ?? '', 'th')
        || compareRoom(a.room_no, b.room_no))

    // ดึงเฉพาะตอนกด — หน้านี้ไม่ได้ใช้ payments ในการแสดงผลปกติ
    const { data: pays } = await supabase.from('payments')
      .select('job_id, voucher_amount').in('job_id', rooms.map(r => r.id))
    const voucherOf = new Map<string, number>()
    for (const p of (pays ?? []) as { job_id: string; voucher_amount: number | null }[]) {
      voucherOf.set(p.job_id, (voucherOf.get(p.job_id) ?? 0) + Number(p.voucher_amount || 0))
    }

    const header = ['No', 'SO', 'Project', '_Projectunit_', 'Voucher', 'RV', 'Cost',
      'Baht', '%', 'วันส่งมอบ', 'หมวด', 'ราคาขาย', 'PO', 'Vendor name', 'Note']
    const out: (string | number | null)[][] = [header]
    let tRev = 0, tCost = 0, cRev = 0, cRooms = 0

    rooms.forEach((j, i) => {
      const lines = (itemsByJob.get(j.id) ?? [])
      const t = totalsOf(lines)
      const rev = revenueBase(j.revenue_inc_vat, j.revenue_ex_vat).value
      // ห้องที่ยังไม่ลงต้นทุนต้องเป็นช่องว่าง ไม่ใช่ 0 — 0 อ่านได้ว่า "จ้างฟรี"
      const costed = t.actLines > 0
      const cost = costed ? t.act : null
      const gpv = costed ? gpCosted(rev, t.act, t.actLines) : null
      tRev += rev
      if (costed) { tCost += t.act; cRev += rev; cRooms++ }
      out.push([i + 1, j.so_no ?? '', projById.get(j.project_id ?? '') ?? '', j.room_no ?? '',
        voucherOf.get(j.id) || '', round2(rev), cost === null ? '' : round2(cost), gpv === null ? '' : round2(rev - t.act),
        gpv === null ? '' : (gpv * 100).toFixed(1) + '%',
        j.actual_deliver_date ?? '', '', '', '', '', ''])
      for (const it of lines) {
        out.push(['', '', '', '', '', '', Number(it.act_cost) || '', '', '', '',
          catName(it.category_id), it.sale_price === null ? '' : round2(it.sale_price),
          it.is_stock ? 'เบิกสต๊อก' : (it.po_no ?? ''),
          supName(it.supplier_id), it.note ?? ''])
      }
    })

    /* สองบรรทัด ไม่ใช่บรรทัดเดียว — ถ้าเอา RV ของทุกห้องหารด้วยต้นทุนที่ลงแล้ว
       เท่านั้น GP% จะสูงเกินจริงตามสัดส่วนห้องที่ยังไม่กรอก (ส.ค. 2569: 44.7%
       แทนที่จะเป็น 26.3%) กติกาเดียวกับการ์ดสรุปบนจอ */
    out.push(['', '', `รวม ${rooms.length} ห้อง`, '', '', round2(tRev), round2(tCost), '', '',
      '', '', '', '', '', 'GP% ดูบรรทัดถัดไป — ยอดนี้รวมห้องที่ยังไม่ลงต้นทุน'])
    out.push(['', '', `เฉพาะห้องที่ลงต้นทุนแล้ว ${cRooms} ห้อง`, '', '', round2(cRev), round2(tCost),
      round2(cRev - tCost), cRev > 0 ? ((cRev - tCost) / cRev * 100).toFixed(1) + '%' : '',
      '', '', '', '', '', ''])

    downloadCsv(`รายงานจัดซื้อจัดจ้าง-${(byPeriod ? bounds.label : 'ทั้งหมด').replace(/\s/g, '-')}`, out)
  }

  /* ── load ─────────────────────────────────────────────── */

  async function load() {
    setLoading(true); setFetchError('')
    const { data: auth } = await supabase.auth.getUser()
    const [me, j, ci, c, s, sc, p, u] = await Promise.all([
      auth.user?.email
        ? supabase.from('users').select('id,role').eq('email', auth.user.email).maybeSingle()
        : Promise.resolve({ data: null }),
      // jobs และ job_cost_items ทะลุ 1,000 แถวได้ทั้งคู่ — ดู reference_row_cap
      fetchAllRows<Job>(() => supabase.from('jobs')
        .select('id,room_no,customer_name,customer_type,project_id,so_no,pr_no,pr_nos,po_no,revenue_inc_vat,revenue_ex_vat,order_date,job_received_at,procurement_received_at,expected_finish_date,actual_deliver_date,working_status,sales_id,qs_id,buyer_id,admin_id')
        .order('id')),
      fetchAllRows<CostItem>(() => supabase.from('job_cost_items').select('*')
        .order('created_at').order('id')),
      supabase.from('cost_categories').select('*').eq('active', true).order('sort_order'),
      supabase.from('suppliers').select('*').eq('active', true).order('company_name'),
      supabase.from('supplier_categories').select('*'),
      supabase.from('projects').select('id,name').order('name'),
      supabase.from('users').select('id,name,role,dept').eq('active', true).order('id'),
    ])
    const err = j.error || ci.error || c.error || s.error || sc.error || p.error || u.error
    if (err) { setFetchError(err.message); setLoading(false); return }
    const meRow = me.data as { id?: string; role?: string } | null
    setMyRole(meRow?.role ?? '')
    setMyUserId(meRow?.id ?? '')
    setJobs(j.data)
    setItems(ci.data.map(normalise))
    setCats((c.data ?? []) as CostCategory[])
    setSups((s.data ?? []) as Supplier[])
    setSupCats(sc.data ?? [])
    setProjects((p.data ?? []) as Project[])
    setUsers((u.data ?? []) as AppUser[])
    setLoading(false)
  }

  useEffect(() => { load() }, []) // eslint-disable-line react-hooks/exhaustive-deps

  /* ── derived ──────────────────────────────────────────── */

  const supById = useMemo(() => new Map(sups.map(s => [s.id, s])), [sups])
  const projById = useMemo(() => new Map(projects.map(p => [p.id, p.name])), [projects])
  const itemsByJob = useMemo(() => {
    const m = new Map<string, CostItem[]>()
    for (const it of items) (m.get(it.job_id) ?? m.set(it.job_id, []).get(it.job_id)!).push(it)
    return m
  }, [items])

  /** Supplier ที่รับหมวดนี้ — แหล่งเดียวของดรอปดาวในหน้ากรอก */
  const supsOfCat = useMemo(() => {
    const m = new Map<string, Supplier[]>()
    for (const link of supCats) {
      const s = supById.get(link.supplier_id)
      if (!s) continue
      ;(m.get(link.category_id) ?? m.set(link.category_id, []).get(link.category_id)!).push(s)
    }
    return m
  }, [supCats, supById])

  const bounds = useMemo(() => getPeriodBounds(unit, offset), [unit, offset])

  /** ห้องที่จัดซื้อทำงานด้วยได้ — งานที่ขายแล้วและยังไม่ยกเลิก */
  const liveJobs = useMemo(
    () => jobs.filter(j => j.working_status && j.working_status !== 'ยกเลิก'),
    [jobs])

  const inPeriod = useMemo(() => byPeriod ? liveJobs.filter(j => {
    const d = anchorDate(j, anchor)
    return !!d && d >= bounds.start && d <= bounds.end
  }) : liveJobs, [liveJobs, anchor, bounds, byPeriod])

  /* งานที่ไม่มีวันที่ตามเกณฑ์ที่เลือกจะหายไปจากทุกช่วงเวลา ไม่ใช่แค่ช่วงนี้ —
     ต้องบอกบนจอ ไม่งั้นดูเหมือนงานหาย ทั้งที่มันแค่ไม่มีวันให้จัดช่วง */
  const undated = useMemo(
    () => byPeriod ? liveJobs.filter(j => !anchorDate(j, anchor)).length : 0,
    [liveJobs, anchor, byPeriod])

  /* ทุกอย่างยกเว้นแถบสถานะ — ตัวเลขบนปุ่มสถานะต้องนับจากฐานนี้
     ไม่งั้นกดปุ่มไหนแล้วปุ่มอื่นจะกลายเป็น 0 ทันที */
  /* ตัวกรองทุกอย่าง**ยกเว้นช่วงเวลา** — แยกออกมาเพราะรายงานสิ้นเดือนใช้เกณฑ์
     วันของตัวเอง (วันส่งมอบจริงล้วน) แต่ต้องเคารพตัวกรองอื่นชุดเดียวกับบนจอ
     ถ้าเขียนแยกสองที่ วันหนึ่งจะกรองไม่เหมือนกันโดยไม่มีใครรู้ */
  const matchesFilters = useCallback((j: Job) => {
    const q = search.trim().toLowerCase()
    if (projectFilter && j.project_id !== projectFilter) return false
    if (typeFilter && j.customer_type !== typeFilter) return false
    if (whoFilter && j.qs_id !== whoFilter && j.buyer_id !== whoFilter && j.admin_id !== whoFilter) return false
    if (q) {
      const hay = `${j.room_no ?? ''} ${j.customer_name ?? ''} ${j.so_no ?? ''} ${(j.pr_nos ?? []).join(' ')} ${projById.get(j.project_id ?? '') ?? ''}`
      const poHay = (itemsByJob.get(j.id) ?? []).map(i => i.po_no ?? '').join(' ')
      if (!`${hay} ${poHay}`.toLowerCase().includes(q)) return false
    }
    return true
  }, [search, projectFilter, typeFilter, whoFilter, itemsByJob, projById])

  const periodRows = useMemo(
    () => inPeriod.filter(matchesFilters).sort((a, b) => compareRoom(a.room_no, b.room_no)),
    [inPeriod, matchesFilters])

  const rows = useMemo(() => statusFilter
    ? periodRows.filter(j => roomStatus(j.procurement_received_at, itemsByJob.get(j.id) ?? []) === statusFilter)
    : periodRows, [periodRows, statusFilter, itemsByJob])

  const docRows = useMemo(() => {
    const f = DOC_FILTERS.find(x => x.id === docFilter)
    return f ? periodRows.filter(f.test) : periodRows
  }, [periodRows, docFilter])

  const summary = useMemo(() => {
    // GP% ต้องคิดจาก **ห้องที่ลงต้นทุนแล้วเท่านั้น** ถ้าเอา revenue ของห้องที่ยัง
    // ไม่ได้ลงต้นทุนมารวมด้วย ตัวหารจะโตกว่าตัวตั้ง แล้ว GP% รวมจะสูงเกินจริง
    // ตามสัดส่วนของงานที่ยังไม่ได้กรอก
    let rev = 0, revCosted = 0, est = 0, act = 0, priced = 0, awaiting = 0, lines = 0, estLines = 0, actLines = 0
    let delivered = 0
    for (const j of rows) {
      if (j.actual_deliver_date) delivered++
      const list = itemsByJob.get(j.id) ?? []
      const t = totalsOf(list)
      // ฐานคิด GP% คือยอดไม่รวม VAT เสมอ ให้ตรงกับต้นทุนที่จัดซื้อกรอก
      const base = revenueBase(j.revenue_inc_vat, j.revenue_ex_vat).value
      rev += base
      est += t.est; act += t.act; awaiting += t.awaitingPo
      lines += t.lines; estLines += t.estLines; actLines += t.actLines
      if (list.length) { priced++; revCosted += base }
    }
    return { rev, revCosted, est, act, priced, awaiting, rooms: rows.length, delivered, lines, estLines, actLines }
  }, [rows, itemsByJob])

  const people = useMemo(() => scorePeople(rows, items, cats), [rows, items, cats])
  const admins = useMemo(() => scoreAdmins(rows), [rows])
  /* รายชื่อทุกตำแหน่ง ไม่ซ้ำ — wanwipa.o อยู่ทั้ง QS และจัดซื้อจึงต้อง dedupe */
  const seatPeople = useMemo(() => {
    const all = [...peopleFor(users, 'qs'), ...peopleFor(users, 'procurement'), ...peopleFor(users, 'admin')]
    return [...new Map(all.map(u => [u.id, u])).values()]
  }, [users])

  const nameOf = (id: string | null) => (id ? users.find(u => u.id === id)?.name ?? id : '—')
  const catName = (id: string | null) => (id ? cats.find(c => c.id === id)?.name ?? id : '')
  const supName = (id: string | null) => (id ? supById.get(id)?.company_name ?? '' : '')

  /* ── writes ───────────────────────────────────────────── */

  async function saveSupplier() {
    if (!supForm.company_name.trim()) return
    setSaving(true)
    const payload = {
      company_name: supForm.company_name.trim(),
      contact_name: supForm.contact_name.trim() || null,
      email: supForm.email.trim() || null,
      phone: supForm.phone.trim() || null,
      note: supForm.note.trim() || null,
    }
    let id = supModal.editing?.id
    if (id) {
      await supabase.from('suppliers').update(payload).eq('id', id)
      await supabase.from('supplier_categories').delete().eq('supplier_id', id)
    } else {
      const { data } = await supabase.from('suppliers').insert(payload).select('id').single()
      id = (data as { id: string } | null)?.id
    }
    if (id && supForm.cats.length) {
      await supabase.from('supplier_categories')
        .insert(supForm.cats.map(c => ({ supplier_id: id!, category_id: c })))
    }
    setSaving(false); setSupModal({ open: false, editing: null }); setSupForm(emptySupplier); load()
  }

  /**
   * กรอกในตาราง: บันทึกทีละช่องตอนออกจากช่อง
   *
   * เดิมเป็น modal — ห้องหนึ่งมี 10–20 รายการ แปลว่าเปิดปิด modal 20 รอบต่อห้อง
   * สำหรับงานที่ทำทุกวันนี่คือต้นทุนเวลาที่ใหญ่กว่าที่คิด
   *
   * เหลือทางเขียนทางเดียว ไม่มี modal คู่ขนาน — สองทางเข้าเมื่อไหร่
   * ก็เริ่มดริฟต์เมื่อนั้น ดู reference_duplicated_code
   */
  async function updateItemField(id: string, patch: Partial<CostItem>) {
    setItems(prev => prev.map(it => (it.id === id ? { ...it, ...patch } : it)))
    const { error } = await supabase.from('job_cost_items').update(patch).eq('id', id)
    if (error) { alert('บันทึกไม่สำเร็จ: ' + error.message); load() }
  }

  /** สร้างแถวใหม่ — ต้องมีชื่อรายการก่อน ไม่งั้นได้แถวว่างเต็มตาราง */
  async function createItem(categoryId: string, itemName: string) {
    if (!openJob || !itemName.trim()) return
    const { error } = await supabase.from('job_cost_items').insert({
      job_id: openJob, category_id: categoryId, item_name: itemName.trim(),
      // ไม่ส่งต้นทุนมาเลย = null = "ยังไม่กรอก" · ส่ง 0 มาจะแปลว่า in-house
      // ซึ่งเป็นคนละเรื่องและทำให้แถวใหม่ถูกนับว่ากรอกครบแล้วตั้งแต่วินาทีแรก
    })
    if (error) { alert('เพิ่มรายการไม่สำเร็จ: ' + error.message); return }
    load()
  }

  async function deleteItem(id: string) {
    await supabase.from('job_cost_items').delete().eq('id', id)
    load()
  }

  /**
   * เพิ่ม/แก้หมวดงาน
   *
   * ตอนแก้จะไม่แตะ `id` เลย เพราะเป็นกุญแจที่ `job_cost_items` และ
   * `supplier_categories` อ้างถึงอยู่ — เปลี่ยนเมื่อไหร่รายการต้นทุนกับ
   * รายชื่อซัพที่ผูกไว้จะหลุดทันที แก้ได้แค่ชื่อที่แสดงกับเจ้าของหมวด
   */
  async function saveCategory() {
    if (!catForm.name.trim()) return
    setSaving(true)
    const payload = {
      name: catForm.name.trim(),
      owner_dept: catForm.owner_dept,
      needs_supplier: catForm.needs_supplier,
    }
    const { error } = editCat
      ? await supabase.from('cost_categories').update(payload).eq('id', editCat.id)
      : await supabase.from('cost_categories').insert({
          ...payload,
          id: catForm.id.trim() || catForm.name.trim().toLowerCase().replace(/\s+/g, '_'),
          sort_order: (cats.at(-1)?.sort_order ?? 0) + 1,
        })
    setSaving(false)
    if (error) { alert('บันทึกไม่สำเร็จ: ' + error.message); return }
    setCatModal(false); setEditCat(null)
    setCatForm({ id: '', name: '', owner_dept: 'procurement', needs_supplier: true })
    load()
  }

  /**
   * บันทึกเลขเอกสารทีละช่อง จากแท็บเอกสาร
   *
   * ทั้ง 4 ช่องอยู่ในตาราง `jobs` อยู่แล้ว แท็บนี้เป็นแค่หน้าจอกรอกอีกทางหนึ่ง
   * ไม่ใช่ที่เก็บใหม่ — Job Registry จึงยังดึงไปแสดงได้เหมือนเดิมโดยไม่ต้องแก้
   *
   * แก้ได้ที่เดียวคือที่นี่ (เอาปุ่มในหน้ากรอกออกแล้ว) ถ้ามีสองทางเข้า
   * วันหนึ่งจะไม่รู้ว่าอันไหนคือของจริง
   */
  /** PR เก็บเป็นรายการ ไม่ใช่ค่าเดียว — ดู PrCell สำหรับเหตุผล */
  async function savePr(jobId: string, next: string[]) {
    setJobs(prev => prev.map(j => (j.id === jobId ? { ...j, pr_nos: next } : j)))
    const { error } = await supabase.from('jobs').update({ pr_nos: next }).eq('id', jobId)
    if (error) { alert('บันทึก PR ไม่สำเร็จ: ' + error.message); load() }
  }

  /** เลข PR → จำนวนห้องที่ใช้ใบนั้น นับจากงานทั้งหมด ไม่ใช่เฉพาะที่กรองอยู่
   *  เพราะ "ใช้กับอีกกี่ห้อง" ต้องเป็นความจริงทั้งระบบ ไม่ใช่ของหน้าจอตอนนั้น */
  const prUsedBy = useMemo(() => {
    const m = new Map<string, number>()
    for (const j of jobs) for (const pr of j.pr_nos ?? []) m.set(pr, (m.get(pr) ?? 0) + 1)
    return m
  }, [jobs])

  async function saveDoc(jobId: string, field: DocField, value: string) {
    const patch = { [field]: value.trim() || null }
    setJobs(prev => prev.map(j => (j.id === jobId ? { ...j, ...patch } : j)))
    const { error } = await supabase.from('jobs').update(patch).eq('id', jobId)
    if (error) { alert('บันทึกไม่สำเร็จ: ' + error.message); load() }
  }

  /**
   * มอบหมายงาน — เลือกคนได้จากดรอปดาว และจัดซื้อ/QS กด "รับงานนี้" ใส่ตัวเองได้
   *
   * เดิมมีแต่ปุ่มรับเอง และซ่อนจากทุก role ที่ไม่ใช่ procurement/qs
   * แปลว่าแอดมินกับผู้จัดการมองไม่เห็นทางมอบหมายงานเลยแม้แต่ทางเดียว
   */
  async function assign(job: Job, field: 'qs_id' | 'buyer_id' | 'admin_id', userId: string) {
    const { error } = await supabase.from('jobs').update({ [field]: userId || null }).eq('id', job.id)
    if (error) { alert('มอบหมายไม่สำเร็จ: ' + error.message); return }
    load()
  }

  /* ── render ───────────────────────────────────────────── */

  if (loading) return <div className="page-content"><PageSpinner /></div>
  if (fetchError) return <div className="page-content"><PageError message={fetchError} onRetry={load} /></div>

  const job = openJob ? jobs.find(j => j.id === openJob) ?? null : null
  /* ตอนเปิดห้องเดียว ตัวกรองกับแถบสถานะไม่มีอะไรให้กรอง — มันกรองรายการห้อง
     ไม่ใช่ห้องที่เปิดอยู่ ปล่อยไว้คือดันเนื้อหาลงไปเกือบ 500px โดยเปล่าประโยชน์ */
  const inRoom = tab === 'work' && !!job
  const showFilters = tab !== 'registry' && !inRoom

  return (
    <div className="page-content space-y-4">
      <PageHeader
        title="Cost & GP%"
        subtitle="ต้นทุน · จัดซื้อจัดจ้าง · กำไรขั้นต้นรายห้อง"
        className="mb-2"
        actions={!canWrite ? (
          <span className="badge badge-gray">ดูอย่างเดียว</span>
        ) : undefined}
      />

      <div className="tab-group w-fit flex-wrap">
        {TABS.map(t => (
          <button key={t.id} onClick={() => { setTab(t.id); setOpenJob(null) }}
            className={`tab-btn ${tab === t.id ? 'active' : ''}`}
            aria-pressed={tab === t.id}>{t.label}</button>
        ))}
      </div>

      {showFilters && (
        <FilterBar
          search={search}
          onSearchChange={setSearch}
          searchPlaceholder="ค้นหาห้อง · ลูกค้า · SO · PR · PO..."
        >
          <select className="field-input" style={{ width: 'auto', maxWidth: '11rem' }}
            value={projectFilter} onChange={e => setProjectFilter(e.target.value)} aria-label="โครงการ">
            <option value="">ทุกโครงการ</option>
            {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
          <select className="field-input" style={{ width: 'auto' }}
            value={typeFilter} onChange={e => setTypeFilter(e.target.value)} aria-label="ประเภทลูกค้า">
            <option value="">B2C + B2B</option>
            <option value="B2C">B2C</option>
            <option value="B2B">B2B</option>
          </select>
          <select className="field-input" style={{ width: 'auto' }}
            value={whoFilter} onChange={e => setWhoFilter(e.target.value)} aria-label="ผู้รับผิดชอบ">
            <option value="">ทุกคน</option>
            {seatPeople.map(u => <option key={u.id} value={u.id}>{u.name}</option>)}
          </select>
          <select className="field-input" style={{ width: 'auto' }} value={anchor}
            onChange={e => setAnchor(e.target.value as CostAnchor)} aria-label="นับตามวันไหน">
            {Object.entries(ANCHOR_LABELS).map(([k, v]) => <option key={k} value={k}>นับตาม{v}</option>)}
          </select>
          {/* ปุ่มนี้คุม PeriodPicker จึงต้องอยู่ติดกัน — เดิมลอยอยู่สุดแถวบน
              ห่างจากสิ่งที่มันเปิด-ปิดไปคนละบรรทัด */}
          <div className="flex items-center gap-2 w-full flex-wrap">
            <button onClick={() => setByPeriod(!byPeriod)}
              className={`tab-btn ${byPeriod ? '' : 'active'}`}
              style={byPeriod ? { border: '1px solid var(--divider)' } : undefined}
              aria-pressed={!byPeriod}>ทั้งหมด</button>
            {byPeriod && <PeriodPicker unit={unit} setUnit={setUnit} offset={offset} setOffset={setOffset} />}
            {/* อยู่ติด PeriodPicker เพราะช่วงเวลาคือสิ่งที่กำหนดขอบเขตของไฟล์ —
                ปุ่มที่ลอยห่างจากตัวควบคุมของตัวเองทำให้เดาไม่ออกว่าจะได้อะไรมา */}
            <button onClick={exportReport} className="btn-util ml-auto flex items-center gap-1.5"
              title="ห้องที่ส่งมอบจริงในช่วงที่เลือก · รูปแบบเดียวกับชีต Revenue-Cost">
              <FileDown size={13} /> รายงานจัดซื้อจัดจ้าง
            </button>
          </div>
          <p className="text-caption w-full flex items-center gap-x-2 gap-y-1 flex-wrap"
            style={{ color: 'var(--text-3)' }}>
            <span>
              <b style={{ color: 'var(--text-2)' }}>{summary.rooms}</b> ห้อง จาก {liveJobs.length}
              {/* เกณฑ์ "วันส่งมอบ" ใช้วันจริงก่อน ไม่มีจึงใช้วันคาด — ตัวเลขรวมจึงไม่เท่ากับ
                  "ห้องที่ส่งมอบแล้ว" ในหน้า Handover ต้องแยกให้เห็น ไม่งั้นสองหน้าดูขัดกัน
                  ทั้งที่ตอบคนละคำถาม (ส.ค. 2569: 47 = ส่งจริง 41 + คาดส่ง 6) */}
              {anchor === 'delivery' && summary.rooms > 0 && summary.delivered < summary.rooms &&
                ` (ส่งมอบแล้ว ${summary.delivered} · ยังไม่ส่ง ${summary.rooms - summary.delivered})`}
              {summary.rooms > 0 && summary.priced < summary.rooms &&
                ` · ยังไม่ลงต้นทุน ${summary.rooms - summary.priced}`}
            </span>
            {undated > 0 && (
              <span className="badge badge-orange" title={`งานที่ไม่มี${ANCHOR_LABELS[anchor]}จะไม่ขึ้นในทุกช่วงเวลา`}>
                {undated} ห้องไม่มี{ANCHOR_LABELS[anchor]}
              </span>
            )}
          </p>
        </FilterBar>
      )}

      {/* แถบสถานะอยู่ใต้การ์ดตัวกรอง เหมือน Customers และ Commission */}
      {showFilters && (
        <div className="tab-group w-fit flex-wrap">
          {tab === 'docs' ? (
            <>
              <button onClick={() => setDocFilter('')}
                className={`tab-btn ${docFilter === '' ? 'active' : ''}`}>
                ทั้งหมด {periodRows.length}
              </button>
              {DOC_FILTERS.map(f => (
                <button key={f.id} onClick={() => setDocFilter(f.id)}
                  className={`tab-btn ${docFilter === f.id ? 'active' : ''}`}>
                  {f.label} {periodRows.filter(f.test).length}
                </button>
              ))}
            </>
          ) : (
            <>
              <button onClick={() => setStatusFilter('')}
                className={`tab-btn ${statusFilter === '' ? 'active' : ''}`}>
                ทุกสถานะ {periodRows.length}
              </button>
              {Object.keys(ROOM_STATUS_CLASS).map(st => (
                <button key={st} onClick={() => setStatusFilter(statusFilter === st ? '' : st)}
                  className={`tab-btn ${statusFilter === st ? 'active' : ''}`}>
                  {st} {periodRows.filter(j =>
                    roomStatus(j.procurement_received_at, itemsByJob.get(j.id) ?? []) === st).length}
                </button>
              ))}
            </>
          )}
        </div>
      )}

      {tab === 'summary' && <SummaryTab {...{ summary, rows, itemsByJob, projById, setOpenJob, setTab }} />}

      {tab === 'work' && (job
        ? <RoomSheet
            job={job} items={itemsByJob.get(job.id) ?? []} cats={cats} supById={supById}
            supsOfCat={supsOfCat} canWrite={canWrite} nameOf={nameOf} projById={projById}
            myUserId={myUserId} myRole={myRole} users={users}
            onBack={() => setOpenJob(null)}
            onCreate={createItem}
            onPatch={updateItemField}
            onDelete={deleteItem}
            onAssign={assign}
            onSetReceived={v => saveDoc(job.id, 'procurement_received_at', v)}
          />
        : <WorkTab {...{ rows, itemsByJob, projById, nameOf, setOpenJob }} />)}

      {tab === 'docs' && (
        <DocsTab rows={docRows} projById={projById} itemsByJob={itemsByJob}
          canWrite={canWrite} nameOf={nameOf} adminPeople={peopleFor(users, 'admin')}
          onSave={saveDoc} onSavePr={savePr} prUsedBy={prUsedBy}
          onAssignAdmin={async (jobId, userId) => {
            const { error } = await supabase.from('jobs')
              .update({ admin_id: userId || null }).eq('id', jobId)
            if (error) alert('มอบหมายไม่สำเร็จ: ' + error.message)
            load()
          }}
          onOpen={id => { setOpenJob(id); setTab('work') }} />
      )}

      {tab === 'people' && <PeopleTab {...{ people, admins, users, nameOf }} />}

      {tab === 'registry' && (
        <RegistryTab
          cats={cats} sups={sups} supsOfCat={supsOfCat} items={items} canWrite={canWrite}
          onAddSupplier={cat => { setSupForm({ ...emptySupplier, cats: cat ? [cat] : [] }); setSupModal({ open: true, editing: null }) }}
          onEditSupplier={s => {
            setSupForm({
              company_name: s.company_name, contact_name: s.contact_name ?? '',
              email: s.email ?? '', phone: s.phone ?? '', note: s.note ?? '',
              cats: supCats.filter(l => l.supplier_id === s.id).map(l => l.category_id),
            })
            setSupModal({ open: true, editing: s })
          }}
          onAddCategory={() => { setCatForm({ id: '', name: '', owner_dept: 'procurement', needs_supplier: true }); setEditCat(null); setCatModal(true) }}
          onEditCategory={c => {
            setCatForm({ id: c.id, name: c.name, owner_dept: c.owner_dept, needs_supplier: c.needs_supplier })
            setEditCat(c); setCatModal(true)
          }}
        />
      )}

      {/* ── Supplier form ── */}
      <Modal open={supModal.open} onClose={() => setSupModal({ open: false, editing: null })}
        title={supModal.editing ? 'แก้ไข Supplier' : 'เพิ่ม Supplier'}>
        <div className="space-y-3">
          <Input label="ชื่อบริษัท / ผู้รับจ้าง" value={supForm.company_name}
            onChange={e => setSupForm({ ...supForm, company_name: e.target.value })} />
          <Input label="ชื่อผู้ติดต่อ" value={supForm.contact_name}
            onChange={e => setSupForm({ ...supForm, contact_name: e.target.value })} />
          <div className="grid grid-cols-2 gap-3">
            <Input label="อีเมล" type="email" value={supForm.email}
              onChange={e => setSupForm({ ...supForm, email: e.target.value })} />
            <Input label="เบอร์โทร" value={supForm.phone}
              onChange={e => setSupForm({ ...supForm, phone: e.target.value })} />
          </div>
          <div>
            <p className="text-caption mb-2" style={{ color: 'var(--text-2)' }}>
              หมวดงานที่รับ — เลือกได้หลายหมวด รายชื่อจะไปขึ้นเป็นตัวเลือกของหมวดนั้นในหน้ากรอก
            </p>
            <div className="flex flex-wrap gap-2">
              {cats.filter(c => c.needs_supplier).map(c => {
                const on = supForm.cats.includes(c.id)
                return (
                  <button key={c.id} type="button"
                    onClick={() => setSupForm({
                      ...supForm,
                      cats: on ? supForm.cats.filter(x => x !== c.id) : [...supForm.cats, c.id],
                    })}
                    className={`badge ${on ? 'badge-blue' : 'badge-gray'}`}
                    aria-pressed={on}>{c.name}</button>
                )
              })}
            </div>
          </div>
          <button className="btn-primary w-full py-2 rounded-[8px] font-semibold text-white"
            disabled={saving || !supForm.company_name.trim()} onClick={saveSupplier}>
            {saving ? 'กำลังบันทึก...' : 'บันทึก'}
          </button>
        </div>
      </Modal>

      {/* ── Category form ── */}
      <Modal open={catModal} onClose={() => { setCatModal(false); setEditCat(null) }}
        title={editCat ? 'แก้ไขหมวดงาน' : 'เพิ่มหมวดงาน'}>
        <div className="space-y-3">
          <Input label="ชื่อหมวด" value={catForm.name}
            onChange={e => setCatForm({ ...catForm, name: e.target.value })} />
          <Select label="ผู้ประมาณการ" value={catForm.owner_dept}
            onChange={e => setCatForm({ ...catForm, owner_dept: e.target.value })}
            options={[
              { value: 'procurement', label: 'จัดซื้อ' },
              { value: 'qs', label: 'QS' },
            ]} />
          <label className="flex items-center gap-2 text-body" style={{ color: 'var(--text-2)' }}>
            <input type="checkbox" checked={catForm.needs_supplier}
              onChange={e => setCatForm({ ...catForm, needs_supplier: e.target.checked })} />
            หมวดนี้ต้องมี Supplier
            <span className="text-caption" style={{ color: 'var(--text-3)' }}>
              (ปิดไว้สำหรับรายการปรับยอด เช่น ส่วนลด)
            </span>
          </label>
          <button className="btn-primary w-full py-2 rounded-[8px] font-semibold text-white"
            disabled={saving || !catForm.name.trim()} onClick={saveCategory}>
            {saving ? 'กำลังบันทึก...' : 'บันทึก'}
          </button>
        </div>
      </Modal>

    </div>
  )
}

/**
 * สีแถวสลับ — ทำแบบเดียวกับ Finance · Leads · Project Summary
 *
 * เคยลองทำเป็นคลาสกลางใน globals.css (`tbl-zebra tbody tr:nth-child(even)`)
 * แต่กฎไม่ถูกส่งมาถึงหน้าเว็บเลยแม้ restart dev server — ตรวจด้วย
 * document.styleSheets แล้วไม่เจอกฎนั้น ทุกหน้าในแอปนี้จึงยังทำ inline
 * และการทำ inline ยังคุมได้ด้วยว่าแถวหัวกลุ่มไม่ต้องนับเป็นแถวสลับ
 */

/* Postgres numerics arrive as strings through PostgREST. Casting once here
   keeps every `+` downstream from silently concatenating. */
function normalise(it: CostItem): CostItem {
  // null ต้องคงเป็น null ทุกช่อง — Number(null) เป็น 0 ซึ่งแปลว่า "in-house" หรือ
  // "รวมในบรรทัดอื่น" คนละเรื่องกับ "ยังไม่กรอก"
  const num = (v: unknown) => (v === null || v === undefined ? null : Number(v))
  return { ...it, est_cost: num(it.est_cost), act_cost: num(it.act_cost),
    sale_price: num(it.sale_price), sale_price_inc: num(it.sale_price_inc) }
}

/* ── Tab 1 · summary ────────────────────────────────────── */

function SummaryTab({ summary, rows, itemsByJob, projById, setOpenJob, setTab }: {
  summary: { rev: number; revCosted: number; est: number; act: number
             rooms: number; delivered: number; priced: number; awaiting: number
             lines: number; estLines: number; actLines: number }
  rows: Job[]
  itemsByJob: Map<string, CostItem[]>
  projById: Map<string, string>
  setOpenJob: (id: string) => void
  setTab: (t: Tab) => void
}) {
  // ปิดทุกโครงการไว้ก่อน — 915 ห้องใน 50 โครงการกางพร้อมกันคือเลื่อนหาไม่เจอ
  const [open, setOpen] = useState<Set<string>>(new Set())
  const toggle = (id: string) =>
    setOpen(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id); else next.add(id)
      return next
    })

  const estGp = gpCosted(summary.revCosted, summary.est, summary.estLines)
  const actGp = gpCosted(summary.revCosted, summary.act, summary.actLines)

  /** ยอดรวมรายโครงการ — GP% คิดจาก revenue ของห้องที่ลงต้นทุนแล้วเท่านั้น */
  const byProject = useMemo(() => {
    const m = new Map<string, Job[]>()
    for (const j of rows) {
      const k = j.project_id ?? ''
      ;(m.get(k) ?? m.set(k, []).get(k)!).push(j)
    }
    return [...m.entries()].map(([pid, list]) => {
      let rev = 0, revInc = 0, revCosted = 0, est = 0, act = 0, priced = 0, lines = 0, actLines = 0, awaiting = 0
      for (const j of list) {
        const t = totalsOf(itemsByJob.get(j.id) ?? [])
        const base = revenueBase(j.revenue_inc_vat, j.revenue_ex_vat).value
        rev += base
        revInc += Number(j.revenue_inc_vat || 0)
        est += t.est; act += t.act; lines += t.lines; actLines += t.actLines
        awaiting += t.awaitingPo
        if (t.lines) { priced++; revCosted += base }
      }
      return {
        pid, name: projById.get(pid) ?? 'ไม่ระบุโครงการ', list,
        rev, revInc, est, act, priced, lines, awaiting,
        gpv: gpCosted(revCosted, act, actLines),
      }
    }).sort((a, b) => b.rev - a.rev)   // โครงการใหญ่ก่อน เป็นที่ที่เงินอยู่
  }, [rows, itemsByJob, projById])

  return (
    <>
      <div className="grid gap-3" style={{ gridTemplateColumns: 'repeat(auto-fit,minmax(min(160px,100%),1fr))' }}>
        <Tile label="Revenue exc.VAT" value={bahtShort(summary.rev)}
          sub={summary.priced === summary.rooms
            ? `${summary.rooms} ห้อง · ${byProject.length} โครงการ`
            : `GP คิดจาก ${summary.priced} ใน ${summary.rooms} ห้อง`} />
        <Tile label="ประมาณการ" value={bahtShort(summary.est)} sub={`GP ${gpText(estGp)}`} />
        <Tile label="จัดจ้างจริง" value={bahtShort(summary.act)} sub={`GP ${gpText(actGp)}`} />
        <Tile label="GP% จริง" value={gpText(actGp)}
          sub={estGp !== null && actGp !== null
            ? `${actGp < estGp ? 'ต่ำกว่า' : 'ดีกว่า'}ที่ประมาณการ ${Math.abs((actGp - estGp) * 100).toFixed(2)} จุด`
            : 'ยังเทียบไม่ได้'} />
        <Tile label="รอเปิด PO" value={String(summary.awaiting)} sub="บรรทัด" />
      </div>

      <div className="ds-card ds-card-flush overflow-hidden mt-4">
        <div className="flex items-baseline justify-between gap-3 flex-wrap p-4 pb-3">
          <h2 className="text-section-title" style={{ color: 'var(--text-1)' }}>สรุปรายโครงการ</h2>
          <span className="text-caption" style={{ color: 'var(--text-3)' }}>
            เรียงตาม Revenue exc.VAT · กดชื่อโครงการเพื่อกางห้อง
          </span>
        </div>
        <div className="tbl-scroll">
          <table className="w-full tbl-rows">
            <thead>
              <tr>
                <th className="text-left th-muted">โครงการ</th>
                <th className="num num-count th-muted"><span>ห้อง</span></th>
                <th className="num num-money th-muted"><span>Revenue inc.VAT</span></th>
                <th className="num num-money th-muted"><span>Revenue exc.VAT</span></th>
                <th className="num num-money th-muted"><span>ประมาณการ</span></th>
                <th className="num num-money th-muted"><span>จัดจ้างจริง</span></th>
                <th className="num num-pct th-muted"><span>GP% จริง</span></th>
                <th className="text-left th-muted">ลงต้นทุนแล้ว</th>
              </tr>
            </thead>
            <tbody>
              {byProject.length === 0 && <TableEmpty colSpan={8} message="ไม่พบห้องในช่วงที่เลือก" />}
              {byProject.map(p => {
                const isOpen = open.has(p.pid)
                return (
                  <FragmentRows key={p.pid || 'none'}>
                    <tr className="cursor-pointer" style={{ background: 'var(--active-bg)' }}
                      onClick={() => toggle(p.pid)}>
                      <td className="font-semibold">
                        <span aria-hidden className="inline-block w-4"
                          style={{ color: 'var(--text-3)' }}>{isOpen ? '▾' : '▸'}</span>
                        {p.name}
                      </td>
                      <td className="num num-count tabular-nums"><span>{p.list.length}</span></td>
                      <td className="num num-money tabular-nums"><span>{bahtShort(p.revInc)}</span></td>
                      <td className="num num-money font-semibold tabular-nums"><span>{bahtShort(p.rev)}</span></td>
                      <td className="num num-money tabular-nums"><span>{p.est ? bahtShort(p.est) : '–'}</span></td>
                      <td className="num num-money font-semibold tabular-nums"><span>{p.act ? bahtShort(p.act) : '–'}</span></td>
                      <td className="num num-pct font-semibold tabular-nums"><span>{gpText(p.gpv)}</span></td>
                      <td className="text-caption" style={{ color: 'var(--text-3)' }}>
                        {p.priced}/{p.list.length}
                        {p.awaiting > 0 && (
                          <span className="badge badge-orange ml-2">รอเปิด PO {p.awaiting}</span>
                        )}
                      </td>
                    </tr>
                    {isOpen && [...p.list].sort((a, b) => compareRoom(a.room_no, b.room_no)).map((j, ri) => {
                      const t = totalsOf(itemsByJob.get(j.id) ?? [])
                      const st = roomStatus(j.procurement_received_at, itemsByJob.get(j.id) ?? [])
                      return (
                        <tr key={j.id} className="cursor-pointer"
                          onClick={() => { setOpenJob(j.id); setTab('work') }}>
                          <td style={{ paddingLeft: 34 }}>
                            <span className="font-semibold">{j.room_no ?? '—'}</span>
                            <span className="text-caption block" style={{ color: 'var(--text-3)' }}>
                              {j.customer_name ?? ''}
                            </span>
                          </td>
                          <td />
                          <td className="num num-money tabular-nums"><span>
                            {baht(Number(j.revenue_inc_vat || 0))}
                          </span></td>
                          <td className="num num-money tabular-nums"><span>
                            {baht(revenueBase(j.revenue_inc_vat, j.revenue_ex_vat).value)}
                          </span></td>
                          <td className="num num-money tabular-nums"><span>{baht(t.est)}</span></td>
                          <td className="num num-money tabular-nums"><span>{baht(t.act)}</span></td>
                          <td className="num num-pct tabular-nums"><span>
                            {gpText(gpCosted(revenueBase(j.revenue_inc_vat, j.revenue_ex_vat).value, t.act, t.actLines))}
                          </span></td>
                          <td><span className={ROOM_STATUS_CLASS[st]}>{st}</span></td>
                        </tr>
                      )
                    })}
                  </FragmentRows>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>
    </>
  )
}

function FragmentRows({ children }: { children: React.ReactNode }) {
  return <>{children}</>
}

function Tile({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="ds-card-sm px-3 py-2.5">
      <p className="text-caption" style={{ color: 'var(--text-3)' }}>{label}</p>
      <p className="text-kpi-money mt-1 tabular-nums" style={{ color: 'var(--text-1)' }}>{value}</p>
      {sub && <p className="text-caption tabular-nums" style={{ color: 'var(--text-3)' }}>{sub}</p>}
    </div>
  )
}

/* ── Tab 2 · room list ──────────────────────────────────── */

function WorkTab({ rows, itemsByJob, projById, nameOf, setOpenJob }: {
  rows: Job[]
  itemsByJob: Map<string, CostItem[]>
  projById: Map<string, string>
  nameOf: (id: string | null) => string
  setOpenJob: (id: string) => void
}) {
  return (
    <div className="ds-card ds-card-flush overflow-hidden">
      <div className="tbl-scroll">
        <table className="w-full tbl-rows">
          <thead>
            <tr>
              <th className="text-left th-muted">ห้อง</th>
              <th className="text-left th-muted">PR</th>
              <th className="text-left th-muted">จัดซื้อรับงาน</th>
              <th className="num num-money th-muted"><span>Revenue exc.VAT</span></th>
              <th className="num num-money th-muted"><span>ประมาณการ</span></th>
              <th className="num num-money th-muted"><span>จัดจ้างจริง</span></th>
              <th className="num num-pct th-muted"><span>GP%</span></th>
              <th className="text-left th-muted">KPI เปิด PO</th>
              <th className="text-left th-muted">ผู้รับผิดชอบ</th>
              <th className="text-left th-muted">สถานะ</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && <TableEmpty colSpan={10} message="ไม่พบห้องในช่วงที่เลือก" />}
            {rows.map((j, ri) => {
              const list = itemsByJob.get(j.id) ?? []
              const t = totalsOf(list)
              const st = roomStatus(j.procurement_received_at, list)
              const days = poLeadDays(j.procurement_received_at, list)
              return (
                <tr key={j.id} className="cursor-pointer"
                  onClick={() => setOpenJob(j.id)}>
                  <td>
                    <span className="font-semibold">{j.room_no ?? '—'}</span>
                    <span className="text-caption block" style={{ color: 'var(--text-3)' }}>
                      {projById.get(j.project_id ?? '') ?? ''}
                    </span>
                  </td>
                  {/* จัดซื้อต้องรู้แค่ว่ามี PR มาแล้วหรือยัง — SO เป็นเลขของฝั่งขาย
                      ดูได้ที่แท็บเอกสาร ไม่ต้องกินคอลัมน์ในหน้าทำงานประจำวัน */}
                  <td className="text-caption">
                    {j.pr_nos?.length
                      ? <span style={{ color: 'var(--text-2)' }}>{j.pr_nos.join(' · ')}</span>
                      : <span className="badge badge-gray">ยังไม่มี PR</span>}
                  </td>
                  <td className="text-caption">{fmtDate(j.procurement_received_at)}</td>
                  <td className="num num-money tabular-nums"><span>
                    {baht(revenueBase(j.revenue_inc_vat, j.revenue_ex_vat).value)}
                  </span></td>
                  <td className="num num-money tabular-nums"><span>{baht(t.est)}</span></td>
                  <td className="num num-money tabular-nums"><span>{baht(t.act)}</span></td>
                  <td className="num num-pct tabular-nums"><span>
                    {gpText(gpCosted(revenueBase(j.revenue_inc_vat, j.revenue_ex_vat).value, t.act, t.actLines))}
                  </span></td>
                  <td className="text-caption">
                    {days === null
                      ? <span style={{ color: 'var(--text-3)' }}>—</span>
                      : <span className={days <= PO_KPI_DAYS ? 'badge badge-green' : 'badge badge-red'}>
                          {days} วัน
                        </span>}
                  </td>
                  <td className="text-caption" style={{ color: 'var(--text-2)' }}>
                    {j.qs_id || j.buyer_id
                      ? <>QS {nameOf(j.qs_id)}<span className="block" style={{ color: 'var(--text-3)' }}>จัดซื้อ {nameOf(j.buyer_id)}</span></>
                      : <span style={{ color: 'var(--text-3)' }}>ยังไม่มอบหมาย</span>}
                  </td>
                  <td><span className={ROOM_STATUS_CLASS[st]}>{st}</span></td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}

/* ── Tab 2b · one room ──────────────────────────────────── */

function RoomSheet({
  job, items, cats, supById, supsOfCat, canWrite, nameOf, projById, myUserId, myRole, users,
  onBack, onCreate, onPatch, onDelete, onAssign, onSetReceived,
}: {
  job: Job
  items: CostItem[]
  cats: CostCategory[]
  supById: Map<string, Supplier>
  supsOfCat: Map<string, Supplier[]>
  canWrite: boolean
  nameOf: (id: string | null) => string
  projById: Map<string, string>
  myUserId: string
  myRole: string
  users: AppUser[]
  onBack: () => void
  onCreate: (categoryId: string, itemName: string) => void
  onPatch: (id: string, patch: Partial<CostItem>) => void
  onDelete: (id: string) => void
  onAssign: (job: Job, field: 'qs_id' | 'buyer_id' | 'admin_id', userId: string) => void
  onSetReceived: (value: string) => void
}) {
  // หมวดที่ห้องนี้ใช้จริง เรียงตามลำดับในทะเบียน + หมวดที่เพิ่งกดเปิดเพิ่ม
  // (เก็บเป็น state ของจอ ไม่ต้องบันทึก — พอมีรายการแรกมันก็อยู่ใน used เอง)
  const [extra, setExtra] = useState<Set<string>>(new Set())
  const used = cats.filter(c => items.some(i => i.category_id === c.id))
  const shown = cats.filter(c => used.includes(c) || extra.has(c.id))
  const unused = cats.filter(c => !shown.includes(c))
  const cols = canWrite ? 10 : 9
  const rev = Number(job.revenue_inc_vat || 0)
  const base = revenueBase(job.revenue_inc_vat, job.revenue_ex_vat)
  const revEx = base.value
  const vat = base.state
  const t = totalsOf(items)
  const split = saleSplitOf(items, rev)
  const days = poLeadDays(job.procurement_received_at, items)

  const [copyState, setCopyState] = useState<'idle' | 'busy' | CopyResult>('idle')

  /** ภาพตารางสำหรับแนบอีเมลขออนุมัติ — ประกอบจากข้อมูลชุดเดียวกับที่ตารางใช้
   *  ไม่ได้อ่านจาก DOM จึงได้ครบทุกบรรทัดแม้จอจะตัดตารางอยู่ */
  async function copyImage() {
    setCopyState('busy')
    try {
      const canvas = drawCostTable({
        project: projById.get(job.project_id ?? '') ?? '',
        room: job.room_no ?? '',
        customer: job.customer_name ?? '',
        so: job.so_no ?? '', pr: (job.pr_nos ?? []).join(' · '), po: job.po_no ?? '',
        revenueEx: revEx,
        // ภาพต้องเหมือนตารางบนจอทุกคอลัมน์ — คนอนุมัติเห็นสิ่งเดียวกับคนกรอก
        groups: shown.map(c => ({
          name: c.name,
          qs: c.owner_dept === 'qs',
          needsSupplier: c.needs_supplier,
          rows: items.filter(i => i.category_id === c.id).map(it => ({
            item: it.item_name ?? '',
            po: it.is_stock ? 'เบิกสต๊อก' : (it.po_no ?? ''),
            supplier: it.supplier_id ? supById.get(it.supplier_id)?.company_name ?? '' : '',
            saleInc: it.sale_price_inc,
            sale: it.sale_price,
            est: it.est_cost,
            act: it.act_cost,
            approved: fmtDate(it.approved_at),
          })),
        })),
        totalSaleInc: split.total,
        // ผลรวม exc.VAT รวมจากรายบรรทัด ไม่ใช่หาร split.total เพราะแต่ละบรรทัด
        // ปัดสตางค์ของตัวเอง — ต้องตรงกับเลขที่แสดงในคอลัมน์นั้นทุกบรรทัด
        totalSale: round2(items.reduce((sum, i) => sum + Number(i.sale_price ?? 0), 0)),
        totalEst: t.est, totalAct: t.act,
        gpEst: gpText(gpCosted(revEx, t.est, t.estLines)),
        gpAct: gpText(gpCosted(revEx, t.act, t.actLines)),
      })
      const how = await copyCanvas(canvas, `ต้นทุน-${job.room_no ?? 'ห้อง'}.png`)
      setCopyState(how)
    } catch {
      setCopyState('idle')
      await showAlert('สร้างภาพไม่สำเร็จ กรุณาลองใหม่')
      return
    }
    // ข้อความยืนยันอยู่บนปุ่มเอง ไม่ใช้ popup — แต่ต้องกลับเป็นปกติเองด้วย
    setTimeout(() => setCopyState('idle'), 4000)
  }

  return (
    <>
      <button onClick={onBack} className="flex items-center gap-1.5 text-sm font-semibold"
        style={{ color: 'var(--accent)' }}>
        <ArrowLeft size={15} /> กลับไปรายการห้อง
      </button>

      <div className="ds-card space-y-2.5">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div className="min-w-0">
            <h2 className="font-bold" style={{ fontSize: 13, lineHeight: 1.3, color: 'var(--text-1)' }}>
              ห้อง {job.room_no ?? '—'}
              <span className={`ml-2 badge ${job.customer_type === 'B2B' ? 'badge-purple' : 'badge-blue'}`}>
                {job.customer_type ?? '—'}
              </span>
            </h2>
            <p className="text-caption" style={{ color: 'var(--text-3)' }}>
              {projById.get(job.project_id ?? '') ?? ''} · {job.customer_name ?? ''}
            </p>
          </div>
          <div className="text-right flex-shrink-0">
            <p style={{ fontSize: 12, lineHeight: 1.4, color: 'var(--text-3)' }}>GP% จริง</p>
            <p className="font-bold tabular-nums"
              style={{ fontSize: 20, lineHeight: 1.2, color: 'var(--text-1)' }}>
              {gpText(gpCosted(revEx, t.act, t.actLines))}
            </p>
            <p style={{ fontSize: 12, lineHeight: 1.4, color: 'var(--text-3)' }}>คิดจาก Revenue exc.VAT</p>
          </div>
        </div>

        {/* ทุกช่องกว้างเท่ากันด้วย grid ไม่ใช่ flex — ด้วย flex ช่องที่ยังว่าง
            จะหดเหลือเท่าขีดกลาง หัวข้อทั้งแถวเลยไหลมากองชิดซ้ายและขยับตำแหน่ง
            ทุกครั้งที่มีใครกรอกข้อมูลเพิ่ม */}
        <div className="grid gap-x-4 gap-y-2 pt-2.5" style={{
          gridTemplateColumns: 'repeat(auto-fill,minmax(min(140px,100%),1fr))',
          borderTop: '1px solid var(--divider)',
        }}>
          <Field label="SO" value={job.so_no ?? '—'} />
          <Field label="PR" value={job.pr_nos?.length ? job.pr_nos.join(" · ") : "—"} />
          {/* B2B ลูกค้าออก PO มาให้เรา — คนละใบกับ PO ที่เราออกให้ Supplier */}
          {job.customer_type === 'B2B' && <Field label="PO จากลูกค้า" value={job.po_no ?? '—'} highlight />}
          <Field label="Revenue inc.VAT" value={baht(rev)} />
          <div className="min-w-0">
            <p style={{ fontSize: 12, lineHeight: 1.4, color: 'var(--text-3)' }}>
              Revenue exc.VAT
            </p>
            <p className="font-semibold tabular-nums"
              style={{ fontSize: 12.5, lineHeight: 1.45,
                color: vat === 'ok' ? 'var(--text-1)' : 'var(--accent-orange)' }}>
              {baht(revEx)}
            </p>
            {vat === 'not_removed' && <span className="badge badge-orange">ระบบถอด VAT ให้</span>}
            {vat === 'odd' && <span className="badge badge-red">ยอดในระบบไม่สอดคล้อง</span>}
          </div>
        </div>

        {/* timeline ร่วมกับเซลล์ — จัดซื้อต้องเห็นว่าเหลือเวลาอีกเท่าไรก่อนกำหนดส่ง */}
        <div className="grid gap-x-4 gap-y-2 pt-2.5" style={{
          gridTemplateColumns: 'repeat(auto-fill,minmax(min(140px,100%),1fr))',
          borderTop: '1px solid var(--divider)',
        }}>
          <Field label="ขายได้" value={fmtDate(job.order_date)} />
          <Field label="แอดมินรับงาน" value={fmtDate(job.job_received_at)} />
          {/* วันที่จัดซื้อรับงานต่อ — จุดเริ่มนับ KPI 14 วัน จัดซื้อกรอกเองได้จาก
              หน้าตัวเอง ไม่ต้องรอใคร */}
          <div className="min-w-0">
            <p style={{ fontSize: 12, lineHeight: 1.4, color: 'var(--accent)' }}>จัดซื้อรับงาน</p>
            <Cell v={job.procurement_received_at ?? ''} type="date" w="7.5rem" canWrite={canWrite}
              display={fmtDate(job.procurement_received_at)} placeholder="+ วันรับงาน"
              onSave={v => onSetReceived(v)} />
          </div>
          <Field label="คาดส่งมอบ" value={fmtDate(job.expected_finish_date)} />
          <Field label="ส่งมอบจริง" value={fmtDate(job.actual_deliver_date)} />
          <Field label="แอดมินส่งต่อ"
            value={(() => {
              const h = handoffDays(job.job_received_at, job.procurement_received_at)
              return h === null ? '—' : `${h} วัน`
            })()} />
          <Field label={`KPI เปิด PO (≤${PO_KPI_DAYS} วัน)`}
            value={days === null ? '—' : `${days} วัน`} />
        </div>

        <div className="grid gap-x-4 gap-y-2 pt-2.5" style={{
          gridTemplateColumns: 'repeat(auto-fill,minmax(min(180px,100%),1fr))',
          borderTop: '1px solid var(--divider)',
        }}>
          <AssignField label="ผู้รับผิดชอบ Built-in" value={job.qs_id}
            people={peopleFor(users, 'qs')} canWrite={canWrite}
            canTake={(myRole === 'qs' || myRole === 'procurement') && job.qs_id !== myUserId}
            onTake={() => onAssign(job, 'qs_id', myUserId)}
            onPick={id => onAssign(job, 'qs_id', id)} />
          <AssignField label="ผู้รับผิดชอบหมวดอื่น" value={job.buyer_id}
            people={peopleFor(users, 'procurement')} canWrite={canWrite}
            canTake={(myRole === 'qs' || myRole === 'procurement') && job.buyer_id !== myUserId}
            onTake={() => onAssign(job, 'buyer_id', myUserId)}
            onPick={id => onAssign(job, 'buyer_id', id)} />
        </div>
      </div>

      <div className="ds-card ds-card-flush overflow-hidden">
        <div className="flex items-baseline justify-between gap-3 flex-wrap p-4 pb-3">
          <div className="min-w-0">
            <h3 className="text-section-title" style={{ color: 'var(--text-1)' }}>
              รายการต้นทุน
              <span className="text-caption font-normal ml-2" style={{ color: 'var(--text-3)' }}>
                {shown.length ? `${shown.length} หมวด` : 'ยังไม่มี'}
              </span>
            </h3>
            {/* ฐานที่ใช้คิด GP% ต้องอยู่ในสายตาตอนกรอกต้นทุน ไม่ใช่ต้องเลื่อนขึ้นไปดู */}
            <p className="text-caption tabular-nums" style={{ color: 'var(--text-3)' }}>
              {projById.get(job.project_id ?? '') ?? 'ไม่ระบุโครงการ'}
              {' · '}ห้อง {job.room_no ?? '—'}
              {' · '}Revenue inc.VAT {baht(rev)}
              {' · '}exc.VAT <b style={{ color: 'var(--text-2)' }}>{baht(revEx)}</b>
            </p>
            {/* สถานะการระบุราคาขาย — อยู่ตรงนี้เพราะนี่คือหน้าที่ใช้ทำงานจริง
                คนกรอกต้องเห็นทันทีว่าครบหรือยังและยอดตรงไหม ไม่ใช่ไปรู้ตอนสรุป
                สิ้นเดือน · ยอมต่างได้ ฿1 เป็นเศษการปัดสตางค์ ถ้าเตือนทุกสตางค์
                เดี๋ยวคนเลิกสนใจคำเตือน (SALE_PRICE_TOLERANCE) */}
            {items.length > 0 && (
              <p className="text-caption tabular-nums mt-1">
                {split.filled === 0 ? (
                  <span style={{ color: 'var(--text-3)' }}>ยังไม่ได้ระบุราคาขายรายรายการ</span>
                ) : !split.complete ? (
                  <span style={{ color: 'var(--accent-orange)' }}>
                    ระบุราคาขายแล้ว {split.filled}/{split.lines} บรรทัด
                  </span>
                ) : Math.abs(split.diff) <= SALE_PRICE_TOLERANCE ? (
                  <span style={{ color: 'var(--accent-green)' }}>
                    ระบุราคาขายครบ · ยอดตรงกับ Revenue inc.VAT
                  </span>
                ) : (
                  <span style={{ color: 'var(--accent-red)' }}>
                    ราคาขายรวม {baht(split.total)} · {split.diff > 0 ? 'เกิน' : 'ขาด'} {baht(Math.abs(split.diff))}
                  </span>
                )}
              </p>
            )}
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            {/* จัดซื้อแคปหน้าจอตารางนี้ส่งอีเมลขออนุมัติอยู่แล้ว แต่จอตัดตาราง
                ที่ยาวเกินขอบ ภาพที่ส่งไปจึงขาดบรรทัดโดยไม่มีใครรู้ ปุ่มนี้วาด
                ตารางทั้งใบใหม่จากข้อมูล จึงครบเสมอ — ดู lib/costImage.ts */}
            {shown.length > 0 && (
              <button onClick={copyImage} disabled={copyState === 'busy'}
                className="text-xs px-2.5 py-1.5 rounded-[8px] font-medium transition-colors disabled:opacity-50 flex items-center gap-1.5"
                style={{ background: 'var(--hover-bg)', color: 'var(--text-2)', border: '1px solid var(--divider)' }}>
                <ImageIcon size={13} />
                {copyState === 'busy' ? 'กำลังสร้างภาพ…'
                  : copyState === 'copied' ? 'คัดลอกแล้ว — กด Ctrl+V ในอีเมล'
                  : copyState === 'downloaded' ? 'เบราว์เซอร์นี้คัดลอกไม่ได้ — บันทึกเป็นไฟล์ให้แล้ว'
                  : 'คัดลอกภาพตาราง'}
              </button>
            )}
            {canWrite && unused.length > 0 && (
              <select className="field-input" style={{ width: 'auto' }} value=""
                aria-label="เปิดหมวดงานเพิ่ม"
                onChange={e => { if (e.target.value) setExtra(prev => new Set(prev).add(e.target.value)) }}>
                <option value="">+ เปิดหมวดเพิ่ม</option>
                {unused.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            )}
          </div>
        </div>
        <div className="tbl-scroll">
          <table className="w-full tbl-dense tbl-rows">
            <thead>
              <tr>
                <th className="text-left th-muted">รายการ</th>
                <th className="text-left th-muted">PO</th>
                <th className="text-left th-muted">Supplier</th>
                {/* กรอกที่ช่องรวม VAT ตัวเดียว (ตรงกับใบเสนอราคา) ส่วน exc.VAT
                    คำนวณให้ ÷ 1.07 — เดิมให้กรอก exc.VAT น้องต้องหารเองทุกบรรทัด */}
                <th className="num num-money th-muted"><span>ราคาขาย inc.VAT</span></th>
                <th className="num num-money th-muted"><span>ราคาขาย exc.VAT</span></th>
                <th className="num num-money th-muted"><span>ประมาณการ</span></th>
                <th className="num num-money th-muted"><span>จัดจ้างจริง</span></th>
                <th className="num num-money th-muted"><span>ส่วนต่าง</span></th>
                <th className="text-left th-muted">วันที่ขออนุมัติ</th>
                {canWrite && <th />}
              </tr>
            </thead>
            <tbody>
              {shown.length === 0 && (
                <tr>
                  <td colSpan={cols} className="text-center" style={{ color: 'var(--text-3)' }}>
                    ยังไม่มีรายการต้นทุนในห้องนี้
                    {canWrite && <> — เลือก <b style={{ color: 'var(--accent)' }}>+ เปิดหมวดเพิ่ม</b> ด้านบนเพื่อเริ่ม</>}
                  </td>
                </tr>
              )}
              {shown.map((c, ci) => {
                const list = items.filter(i => i.category_id === c.id)
                const sups = supsOfCat.get(c.id) ?? []
                return (
                  <FragmentRows key={c.id}>
                    <tr style={{ background: 'var(--active-bg)' }}>
                      <td colSpan={cols}>
                        <span className="font-semibold">{ci + 1}. {c.name}</span>
                        {c.owner_dept === 'qs' && <span className="ml-2 badge badge-orange">QS</span>}
                        {!c.needs_supplier && <span className="ml-2 badge badge-gray">ไม่ต้องมี Supplier</span>}
                      </td>
                    </tr>
                    {list.map((it, ii) => (
                      <tr key={it.id}>
                        <td style={{ maxWidth: '13rem' }}>
                          <Cell v={it.item_name} w="12rem" wrap canWrite={canWrite}
                            onSave={v => { if (v.trim()) onPatch(it.id, { item_name: v.trim() }) }} />
                        </td>
                        <td>
                          {/* `is_stock` มีคอลัมน์และป้ายมาตั้งแต่แรก แต่ไม่เคยมีทางกดเปิด
                              จึงไม่มีสักแถวที่ใช้ — ของเบิกสต๊อกไม่มี PO และไม่มี Supplier
                              จึงต้องแยกออกจาก "ยังไม่เปิด PO" ให้ชัด */}
                          {it.is_stock ? (
                            <button type="button" disabled={!canWrite}
                              onClick={() => onPatch(it.id, { is_stock: false })}
                              title={canWrite ? 'กดเพื่อยกเลิกเบิกสต๊อก' : undefined}
                              className="badge badge-purple">เบิกสต๊อก</button>
                          ) : c.needs_supplier ? (
                            <div className="flex items-center gap-1">
                              <Cell v={it.po_no ?? ''} w="8.5rem" canWrite={canWrite} placeholder="ยังไม่เปิด PO"
                                onSave={v => onPatch(it.id, { po_no: v.trim() || null })} />
                              {canWrite && !it.po_no && (
                                <button type="button" title="ของนี้เบิกจากสต๊อก ไม่ได้เปิด PO"
                                  onClick={() => onPatch(it.id, { is_stock: true, supplier_id: null })}
                                  className="text-label flex-shrink-0 px-1.5 py-0.5 rounded-[8px]"
                                  style={{ color: 'var(--accent-purple)', border: '1px solid var(--divider)' }}>
                                  สต๊อก
                                </button>
                              )}
                            </div>
                          ) : <span style={{ color: 'var(--text-3)' }}>—</span>}
                        </td>
                        <td>
                          {c.needs_supplier && !it.is_stock ? (
                            canWrite ? (
                              <select className="field-input"
                                style={{ width: 'auto', maxWidth: '8.5rem', padding: '3px 6px', fontSize: 'var(--fs-caption)' }}
                                value={it.supplier_id ?? ''} aria-label={`Supplier ${it.item_name}`}
                                onChange={e => onPatch(it.id, { supplier_id: e.target.value || null })}>
                                <option value="">{sups.length ? '— เลือก —' : 'ยังไม่มีในหมวดนี้'}</option>
                                {sups.map(su => <option key={su.id} value={su.id}>{su.company_name}</option>)}
                              </select>
                            ) : (
                              <span className="text-caption" style={{ color: 'var(--text-2)' }}>
                                {it.supplier_id ? supById.get(it.supplier_id)?.company_name ?? '—' : '—'}
                              </span>
                            )
                          ) : <span style={{ color: 'var(--text-3)' }}>—</span>}
                        </td>
                        <td className="num num-money">
                          {/* สามค่า สามความหมาย ห้ามยุบรวมกัน:
                              null = ยังไม่ระบุ · 0 = รวมอยู่ในบรรทัดอื่นแล้ว · >0 = ราคาที่เสนอ
                              ใบเสนอราคาให้ลูกค้ามักมีบรรทัดเดียว ("ม่าน 1 ชุด") แต่ต้นทุนมี
                              หลายบรรทัด (ผ้า + ค่าติดตั้ง) — 93 คู่ห้อง-หมวดเป็นแบบนี้ ค่าติดตั้ง
                              จึงลง 0 แล้วผลรวมยังตรงกับ Revenue ของห้องพอดี
                              แสดงเป็นข้อความ ไม่ใช่ ฿0.00 เพราะศูนย์บาทอ่านได้ว่า "แถมฟรี" */}
                          <Cell v={it.sale_price_inc === null ? '' : String(it.sale_price_inc)} num w="6.5rem" canWrite={canWrite}
                            display={it.sale_price_inc === null ? '—' : it.sale_price_inc === 0 ? 'รวมในบรรทัดอื่น' : baht(it.sale_price_inc)}
                            placeholder="ยังไม่ระบุ"
                            onSave={v => {
                              const inc = v.trim() === '' ? null : Number(v) || 0
                              // เขียนคู่กันเสมอ — ทุกอย่างที่คิด GP อ่าน sale_price (exc.VAT)
                              // ถ้าเขียนตัวเดียวสองช่องจะเพี้ยนกันทันที
                              onPatch(it.id, { sale_price_inc: inc, sale_price: inc === null ? null : exVatOf(inc) })
                            }} />
                        </td>
                        <td className="num num-money tabular-nums"
                          style={{ color: it.sale_price === null ? 'var(--text-3)' : 'var(--text-2)' }}><span>
                          {it.sale_price === null ? '—' : it.sale_price === 0 ? 'รวมในบรรทัดอื่น' : baht(it.sale_price)}
                        </span></td>
                        <td className="num num-money">
                          {/* ว่าง = ยังไม่กรอก · 0 = ไม่มีต้นทุน — สองอย่างนี้ต่างกัน ห้ามยุบ
                              เป็นค่าเดียว · ใช้คำกลางๆ เพราะระบบรู้แค่ตัวเลข ไม่รู้เหตุผล
                              (ทำเอง in-house / เบิกสต๊อก / แถมฟรี ล้วนเป็น ฿0 ทั้งนั้น) —
                              เคสเบิกสต๊อกมีช่อง is_stock ของตัวเองแยกไว้แล้ว */}
                          <Cell v={it.est_cost === null ? '' : String(it.est_cost)} num w="6.5rem" canWrite={canWrite}
                            display={it.est_cost === null ? '—' : it.est_cost === 0 ? 'ไม่มีต้นทุน' : baht(it.est_cost)}
                            placeholder="ยังไม่กรอก"
                            onSave={v => onPatch(it.id, { est_cost: v.trim() === '' ? null : Number(v) || 0 })} />
                        </td>
                        <td className="num num-money">
                          <Cell v={it.act_cost === null ? '' : String(it.act_cost)} num w="6.5rem" canWrite={canWrite}
                            display={it.act_cost === null ? '—' : it.act_cost === 0 ? 'ไม่มีต้นทุน' : baht(it.act_cost)}
                            placeholder="ยังไม่กรอก"
                            onSave={v => onPatch(it.id, { act_cost: v.trim() === '' ? null : Number(v) || 0 })} />
                        </td>
                        <td className="num num-money tabular-nums"
                          style={{ color: (it.act_cost ?? 0) > (it.est_cost ?? 0) ? 'var(--accent-red)' : 'var(--text-2)' }}><span>
                          {it.act_cost !== null && it.est_cost !== null ? baht(it.act_cost - it.est_cost) : '—'}
                        </span></td>
                        <td>
                          <Cell v={it.approved_at ?? ''} type="date" w="7.5rem" canWrite={canWrite}
                            display={fmtDate(it.approved_at)}
                            onSave={v => onPatch(it.id, { approved_at: v || null })} />
                        </td>
                        {canWrite && (
                          <td className="num num-money whitespace-nowrap">
                            <button onClick={() => onDelete(it.id)} aria-label={`ลบ ${it.item_name}`}
                              style={{ color: 'var(--text-3)' }}><Trash2 size={14} /></button>
                          </td>
                        )}
                      </tr>
                    ))}
                    {/* บรรทัดว่างท้ายหมวด — พิมพ์ชื่อรายการแล้วแถวใหม่โผล่ต่อเอง
                        หมวดมาจากตำแหน่งของบรรทัด ไม่ต้องเลือกหมวดซ้ำทุกครั้ง */}
                    {canWrite && (
                      <tr>
                        <td colSpan={cols}>
                          <Cell v="" w="18rem" canWrite blank
                            placeholder="+ พิมพ์ชื่อรายการเพื่อเพิ่มบรรทัด"
                            onSave={v => onCreate(c.id, v)} />
                        </td>
                      </tr>
                    )}
                  </FragmentRows>
                )
              })}
            </tbody>
            {/* แถวรวมต้องมีช่องเท่าหัวตารางเป๊ะ (8 ช่อง) ไม่งั้นตัวเลขเลื่อนไป
                อยู่ใต้คอลัมน์ผิด — ยอดประมาณการเคยไปโผล่ใต้ Supplier */}
            <tfoot>
              {/* เน้นแถวรวมแบบเดียวกับตารางหน้า Revenue — เส้นสี accent กับพื้น
                  ที่เข้มขึ้น ไม่ใช่เส้น divider จางๆ ที่กลืนไปกับแถวข้อมูล */}
              <tr style={{ borderTop: '2px solid var(--accent)', background: 'var(--active-bg)' }}>
                <td className="font-bold">รวมทั้งห้อง</td>
                <td colSpan={2} className="text-caption" style={{ color: 'var(--text-3)' }}>
                  Revenue exc.VAT <b style={{ color: 'var(--text-2)' }}>{baht(revEx)}</b>
                </td>
                {/* ต้องมีครบทุกคอลัมน์ ไม่งั้นตัวเลขเลื่อนไปอยู่ใต้หัวคอลัมน์อื่น —
                    เดิมนับขาดไป 1 ช่อง ยอดประมาณการจึงไปอยู่ใต้ "ราคาขาย" */}
                <td className="num num-money font-bold tabular-nums"><span>{baht(split.total)}</span></td>
                <td className="num num-money font-bold tabular-nums">
                  <span>{baht(round2(items.reduce((sum, i) => sum + Number(i.sale_price ?? 0), 0)))}</span>
                </td>
                <td className="num num-money font-bold tabular-nums"><span>{baht(t.est)}</span></td>
                <td className="num num-money font-bold tabular-nums"><span>{baht(t.act)}</span></td>
                <td className="num num-money font-bold tabular-nums"><span>
                  {t.act && t.est ? baht(t.act - t.est) : '—'}
                </span></td>
                {/* GP คือตัวเลขที่คนกรอกต้นทุนจ้องดู — มันเคยเป็น text-caption
                    สีจาง เท่ากับหมายเหตุข้างๆ ทั้งที่เป็นผลลัพธ์ของทั้งตาราง
                    ตัวที่จริง (หลังจัดจ้าง) หนาและเข้ม ส่วนตัวประมาณการคงจาง
                    ไว้ เพราะมันคือจุดตั้งต้นที่ใช้เทียบ ไม่ใช่คำตอบ */}
                <td colSpan={canWrite ? 2 : 1} className="whitespace-nowrap tabular-nums"
                  style={{ color: 'var(--text-3)' }}>
                  <span className="text-caption">GP {gpText(gpCosted(revEx, t.est, t.estLines))} → </span>
                  <b style={{ color: 'var(--text-1)' }}>{gpText(gpCosted(revEx, t.act, t.actLines))}</b>
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      </div>
    </>
  )
}

/* ป้าย 11px / ค่า 12.5px — ขนาดเดียวกับ mockup ที่เจ้าของอนุมัติ
   การ์ดหัวห้องเป็นข้อมูลอ้างอิงที่กวาดตาอ่าน ไม่ใช่พาดหัว ตัวโตกว่านี้
   กินพื้นที่จนต้องเลื่อนจอเพื่อไปถึงตารางที่เป็นงานจริง */
function Field({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
  return (
    <div className="min-w-0">
      <p style={{ fontSize: 12, lineHeight: 1.4, color: 'var(--text-3)' }}>{label}</p>
      <p className="font-semibold tabular-nums"
        style={{ fontSize: 12.5, lineHeight: 1.45,
          color: highlight ? 'var(--accent-purple)' : 'var(--text-1)' }}>{value}</p>
    </div>
  )
}

function AssignField({ label, value, people, canWrite, canTake, onTake, onPick }: {
  label: string
  value: string | null
  people: AppUser[]
  canWrite: boolean
  canTake: boolean
  onTake: () => void
  onPick: (id: string) => void
}) {
  return (
    <div>
      <p style={{ fontSize: 12, lineHeight: 1.4, color: 'var(--text-3)' }}>{label}</p>
      {canWrite ? (
        <div className="flex items-center gap-2">
          <select
            className="field-input"
            style={{ width: 'auto', padding: '4px 8px', fontSize: 'var(--fs-caption)' }}
            value={value ?? ''}
            aria-label={label}
            onChange={e => onPick(e.target.value)}>
            <option value="">ยังไม่มอบหมาย</option>
            {people.map(u => <option key={u.id} value={u.id}>{u.name}</option>)}
          </select>
          {canTake && (
            <button onClick={onTake} className="text-xs font-semibold whitespace-nowrap"
              style={{ color: 'var(--accent)' }}>รับงานนี้</button>
          )}
        </div>
      ) : (
        <p className="font-semibold"
          style={{ fontSize: 12.5, lineHeight: 1.45, color: value ? 'var(--text-1)' : 'var(--text-3)' }}>
          {people.find(u => u.id === value)?.name ?? 'ยังไม่มอบหมาย'}
        </p>
      )}
    </div>
  )
}


/**
 * ช่องกรอกในตารางต้นทุน — กติกาเดียวกับแท็บเอกสาร
 *
 * อ่านอย่างเดียวจนกว่าจะกด · Enter บันทึก · Esc ยกเลิก · บันทึกตอนออกจากช่อง
 * และเขียนเฉพาะเมื่อค่าเปลี่ยนจริง กดเข้าไปแล้วกดออกเฉยๆ ไม่แตะฐานข้อมูล
 *
 * `blank` คือบรรทัดว่างท้ายหมวด: พอบันทึกแล้วต้องล้างตัวเองทิ้ง เพราะแถวจริง
 * จะถูกสร้างขึ้นมาแทน ถ้าไม่ล้าง ข้อความเดิมจะค้างอยู่บนบรรทัดว่างของแถวถัดไป
 */
function Cell({ v, onSave, canWrite, w, type = 'text', num, display, placeholder, blank, wrap }: {
  v: string
  onSave: (value: string) => void
  canWrite: boolean
  w: string
  type?: string
  num?: boolean
  display?: string
  placeholder?: string
  blank?: boolean
  /** ให้ข้อความยาวตัดบรรทัดแทนที่จะดันความกว้างของตาราง */
  wrap?: boolean
}) {
  const [editing, setEditing] = useState(false)
  const [val, setVal] = useState(v)
  useEffect(() => { if (!editing) setVal(v) }, [v, editing])

  if (!editing) {
    const label = display && v ? display : v || placeholder || '—'
    if (!canWrite) {
      return <span className="tabular-nums" style={{ color: v ? 'var(--text-1)' : 'var(--text-3)' }}>{label}</span>
    }
    return (
      <button type="button" onClick={() => { setVal(v); setEditing(true) }}
        className="text-left rounded-[8px] px-2 py-1 tabular-nums w-full"
        style={{
          color: v ? 'var(--text-1)' : 'var(--text-3)',
          fontSize: v ? undefined : 'var(--fs-caption)',
          cursor: 'text',
          ...(wrap ? { width: w, whiteSpace: 'normal' as const } : { minWidth: w }),
          textAlign: num ? 'right' : 'left',
        }}
        onMouseEnter={e => { e.currentTarget.style.background = 'var(--hover-bg)' }}
        onMouseLeave={e => { e.currentTarget.style.background = 'transparent' }}
      >{label}</button>
    )
  }

  const commit = () => {
    setEditing(false)
    if (val !== v) onSave(val)
    if (blank) setVal('')
  }

  return (
    <input
      className="field-input tabular-nums"
      style={{ width: w, padding: '3px 6px', fontSize: 'var(--fs-caption)', textAlign: num ? 'right' : 'left' }}
      /* เงินใช้ text เพื่อให้ใส่ , ได้ — type=number ไม่ยอมรับเครื่องหมายคั่น
         และบังคับให้คนนั่งนับศูนย์เอง */
      type={num ? 'text' : type}
      inputMode={num ? 'decimal' : undefined}
      value={val}
      autoFocus
      placeholder={placeholder}
      onWheel={e => e.currentTarget.blur()}
      onChange={e => setVal(num ? e.target.value.replace(/[^0-9.-]/g, '') : e.target.value)}
      onBlur={commit}
      onKeyDown={e => {
        if (e.key === 'Enter') e.currentTarget.blur()
        if (e.key === 'Escape') { setVal(v); setEditing(false) }
      }}
    />
  )
}

/* ── Tab · เอกสาร ───────────────────────────────────────
   งานแอดมิน: SO · PR · PO ผู้ว่าจ้าง · วันรับงาน — หนึ่งแถวต่อห้อง แก้ในตารางเลย
   ไม่ต้องเปิด modal ทีละห้อง เพราะงานนี้คือไล่กรอกทีละหลายสิบห้องรวด        */

type DocField = 'so_no' | 'po_no' | 'job_received_at' | 'procurement_received_at'

function DocsTab({ rows, projById, itemsByJob, canWrite, nameOf, adminPeople, onSave, onSavePr, prUsedBy, onAssignAdmin, onOpen }: {
  rows: Job[]
  projById: Map<string, string>
  itemsByJob: Map<string, CostItem[]>
  canWrite: boolean
  nameOf: (id: string | null) => string
  adminPeople: AppUser[]
  onAssignAdmin: (jobId: string, userId: string) => void
  onSave: (jobId: string, field: DocField, value: string) => void
  onSavePr: (jobId: string, next: string[]) => void
  prUsedBy: Map<string, number>
  onOpen: (jobId: string) => void
}) {
  return (
    <div className="ds-card ds-card-flush overflow-hidden">
      <div className="flex items-baseline justify-end gap-3 flex-wrap px-4 pt-3">
        <span className="text-caption" style={{ color: 'var(--text-3)' }}>
          กดที่ช่องเพื่อแก้ · Enter หรือคลิกที่อื่นเพื่อบันทึก · Esc เพื่อยกเลิก · {rows.length} ห้อง
        </span>
      </div>
      <div className="tbl-scroll">
        <table className="w-full tbl-dense tbl-rows" style={{ tableLayout: 'fixed' }}>
          <thead>
            <tr>
              <th className="text-left th-muted" style={{ width: '17%' }}>ห้อง</th>
              <th className="text-left th-muted" style={{ width: '12%' }}>SO</th>
              <th className="text-left th-muted" style={{ width: '12%' }}>PR</th>
              <th className="text-left th-muted" style={{ width: '11%' }}>PO ลูกค้า</th>
              <th className="text-left th-muted" style={{ width: '10%', whiteSpace: 'normal' }}>แอดมินรับงาน</th>
              <th className="text-left th-muted" style={{ width: '10%', whiteSpace: 'normal' }}>จัดซื้อรับงาน</th>
              <th className="text-left th-muted" style={{ width: '11%' }}>แอดมิน</th>
              <th className="num num-money th-muted" style={{ width: '10%', whiteSpace: 'normal' }}><span>Revenue exc.VAT</span></th>
              <th className="num num-count th-muted" style={{ width: '7%', whiteSpace: 'normal' }}><span>PO Supplier</span></th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && <TableEmpty colSpan={9} message="ไม่พบห้องตามตัวกรองที่เลือก" />}
            {rows.map((j, ri) => {
              const items = itemsByJob.get(j.id) ?? []
              const pos = new Set(items.filter(i => i.po_no).map(i => i.po_no!)).size
              return (
                <tr key={j.id}>
                  <td>
                    <span className="font-semibold">{j.room_no ?? '—'}</span>
                    <span className="text-caption block" style={{ color: 'var(--text-3)' }}>
                      {projById.get(j.project_id ?? '') ?? ''}
                    </span>
                  </td>
                  <td><DocCell job={j} field="so_no" canWrite={canWrite} onSave={onSave} /></td>
                  <td><PrCell job={j} canWrite={canWrite} usedBy={prUsedBy} onSave={onSavePr} /></td>
                  <td>
                    {/* PO ผู้ว่าจ้างมีเฉพาะงาน B2B — ช่องว่างบนงาน B2C ไม่ใช่ของขาด */}
                    {j.customer_type === 'B2B'
                      ? <DocCell job={j} field="po_no" canWrite={canWrite} onSave={onSave} />
                      : <span className="text-caption" style={{ color: 'var(--text-3)' }}>B2C</span>}
                  </td>
                  <td>
                    <DocCell job={j} field="job_received_at" type="date" canWrite={canWrite} onSave={onSave} />
                  </td>
                  {/* จัดซื้อกรอกเองที่แท็บจัดซื้อจัดจ้าง — โชว์ที่นี่ให้แอดมินเห็นว่า
                      งานส่งต่อไปถึงจัดซื้อแล้วหรือยัง */}
                  <td className="text-caption">
                    {j.procurement_received_at
                      ? <span style={{ color: 'var(--text-2)' }}>{fmtDate(j.procurement_received_at)}</span>
                      : <span className="badge badge-gray">รอจัดซื้อ</span>}
                  </td>
                  <td>
                    {/* มอบหมายแอดมินอยู่ที่นี่ ไม่ใช่หน้าจัดซื้อ — เอกสารเป็นงานของ
                        แอดมิน จึงควรมอบหมายในหน้าที่เขาทำงานอยู่ */}
                    {canWrite ? (
                      <select className="field-input"
                        style={{ width: '100%', padding: '3px 4px', fontSize: 'var(--fs-caption)' }}
                        value={j.admin_id ?? ''} aria-label={`แอดมิน ห้อง ${j.room_no ?? j.id}`}
                        onChange={e => onAssignAdmin(j.id, e.target.value)}>
                        <option value="">ยังไม่มอบหมาย</option>
                        {adminPeople.map(u => <option key={u.id} value={u.id}>{u.name}</option>)}
                      </select>
                    ) : (
                      <span className="text-caption" style={{ color: j.admin_id ? 'var(--text-2)' : 'var(--text-3)' }}>
                        {j.admin_id ? nameOf(j.admin_id) : 'ยังไม่มอบหมาย'}
                      </span>
                    )}
                  </td>
                  <td className="num num-money tabular-nums">
                    {(() => {
                      const b = revenueBase(j.revenue_inc_vat, j.revenue_ex_vat)
                      return (
                        <>
                          <span className="whitespace-nowrap">{baht(b.value)}</span>
                          {b.derived && (
                            <span className={`badge mt-1 ${b.state === 'odd' ? 'badge-red' : 'badge-orange'}`}
                              style={{ display: 'block', width: 'fit-content', marginLeft: 'auto' }}>
                              {b.state === 'odd' ? 'ยอดไม่สอดคล้อง' : 'ระบบถอดให้'}
                            </span>
                          )}
                        </>
                      )
                    })()}
                  </td>
                  <td className="num num-money">
                    <button onClick={() => onOpen(j.id)} className="text-xs font-semibold"
                      style={{ color: pos ? 'var(--accent)' : 'var(--text-3)' }}>
                      {pos ? `${pos} ใบ` : 'ยังไม่มี'} ›
                    </button>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}

/**
 * ช่องกรอกในตาราง — **อ่านอย่างเดียวจนกว่าจะกด**
 *
 * เดิมเป็น <input> ตลอดเวลาทั้ง 900 แถว ซึ่งเสี่ยงสองอย่าง: เลื่อนหน้าจอแล้ว
 * เผลอโดนช่องแล้วพิมพ์ทับของเดิมโดยไม่รู้ตัว และช่อง date เปลี่ยนค่าได้ด้วย
 * ลูกกลิ้งเมาส์ขณะที่ช่องนั้นโฟกัสอยู่ ตอนนี้ต้องกดที่ช่องก่อนถึงจะแก้ได้
 *
 * ปุ่มลัด: Enter = บันทึก · Esc = ยกเลิกกลับเป็นค่าเดิม
 * ค่าจะบันทึกก็ต่อเมื่อ**เปลี่ยนจริง**เท่านั้น กดเข้าไปแล้วกดออกเฉยๆ ไม่เขียนอะไร
 */
const DOC_CELL_HINT: Record<DocField, string> = {
  so_no: '+ เพิ่ม SO',
  po_no: '+ เพิ่ม PO',
  job_received_at: '+ วันรับงาน',
  procurement_received_at: '+ วันรับงาน',
}

function DocCell({ job, field, type = 'text', canWrite, onSave }: {
  job: Job
  field: DocField
  type?: string
  canWrite: boolean
  onSave: (jobId: string, field: DocField, value: string) => void
}) {
  const saved = (job[field] as string | null) ?? ''
  const [editing, setEditing] = useState(false)
  const [val, setVal] = useState(saved)

  const shown = !saved ? '' : type === 'date' ? fmtDate(saved) : saved

  if (!editing) {
    const label = shown || (canWrite ? DOC_CELL_HINT[field] : '—')
    return (
      <button
        type="button"
        disabled={!canWrite}
        onClick={() => { setVal(saved); setEditing(true) }}
        className="text-left w-full rounded-[8px] px-2 py-1 transition-colors"
        style={{
          color: saved ? 'var(--text-1)' : 'var(--text-3)',
          fontSize: saved ? undefined : 'var(--fs-caption)',
          cursor: canWrite ? 'text' : 'default',
          width: '100%',
        }}
        onMouseEnter={e => { if (canWrite) e.currentTarget.style.background = 'var(--hover-bg)' }}
        onMouseLeave={e => { e.currentTarget.style.background = 'transparent' }}
        aria-label={`${saved ? 'แก้ไข' : 'เพิ่ม'} ${field} ห้อง ${job.room_no ?? job.id}`}
      >{label}</button>
    )
  }

  const commit = () => {
    setEditing(false)
    if (val !== saved) onSave(job.id, field, val)
  }

  return (
    <input
      className="field-input"
      style={{ width: '100%', maxWidth: type === 'date' ? '8rem' : '9rem',
        padding: '4px 6px', fontSize: 'var(--fs-caption)' }}
      type={type}
      value={val}
      autoFocus
      aria-label={`${field} ห้อง ${job.room_no ?? job.id}`}
      onChange={e => setVal(e.target.value)}
      onBlur={commit}
      onKeyDown={e => {
        if (e.key === 'Enter') { e.currentTarget.blur() }
        // Esc ต้องคืนค่าเดิมก่อนปิด ไม่งั้น onBlur ที่ตามมาจะบันทึกสิ่งที่เพิ่งยกเลิก
        if (e.key === 'Escape') { setVal(saved); setEditing(false) }
      }}
    />
  )
}

/**
 * ช่อง PR — หลายใบต่อห้อง และใบเดียวใช้ได้หลายห้อง
 *
 * PR ผูกกับ**ล็อตการสั่งซื้อ** ไม่ใช่ห้อง: งานเป็นล็อต ได้ PO จากผู้ว่าจ้างใบเดียว
 * แล้วขอซื้อเป็นใบเดียวคุมหลายห้อง กลับกันห้องเดียวก็มีได้หลายใบ
 *
 * จงใจ**ไม่**ผูก PR กับหมวดงานหรือกับรายการต้นทุน แม้ PO ที่เราออกให้ซัพจะอยู่
 * ตรงนั้น เพราะแอดมินออก PR **ก่อน** จัดซื้อจะตั้งหมวด — JOB-1014 มี PR แล้ว
 * ตั้งแต่ยังไม่มีรายการต้นทุนสักบรรทัด ถ้าผูกกับหมวดจะกรอกไม่ได้จนกว่าจัดซื้อ
 * จะเริ่มงาน กลายเป็นคอขวดระหว่างสองทีม
 *
 * ความสัมพันธ์หลายห้องต่อหนึ่งใบไม่ต้องมีตารางกลาง — เลขเดียวกันปรากฏในหลาย
 * ห้องคือสิ่งที่แอดมินทำอยู่แล้ว และค้นด้วยเลขก็เจอครบทุกห้องที่ใช้ใบนั้น
 */
function PrCell({ job, canWrite, usedBy, onSave }: {
  job: Job
  canWrite: boolean
  /** เลข PR → จำนวนห้องที่ใช้ใบนั้น ใช้เตือนตอนพิมพ์ว่าเลขนี้มีอยู่แล้ว */
  usedBy: Map<string, number>
  onSave: (jobId: string, next: string[]) => void
}) {
  const list = job.pr_nos ?? []
  const [adding, setAdding] = useState(false)
  const [val, setVal] = useState('')

  const commit = () => {
    const v = val.trim()
    setAdding(false); setVal('')
    // กันซ้ำในห้องเดียวกัน — ใบเดิมซ้ำในห้องเดิมไม่มีความหมาย
    if (!v || list.includes(v)) return
    onSave(job.id, [...list, v])
  }
  const remove = (pr: string) => onSave(job.id, list.filter(x => x !== pr))

  // จำนวนห้องอื่นที่ใช้เลขที่กำลังพิมพ์ — บอกตอนพิมพ์ ไม่ใช่หลังบันทึก
  const typedElsewhere = val.trim() ? (usedBy.get(val.trim()) ?? 0) : 0

  return (
    <div className="flex flex-wrap items-center gap-1">
      {list.map(pr => {
        const others = (usedBy.get(pr) ?? 1) - 1
        return (
          <span key={pr} className="inline-flex items-center gap-1 rounded-[8px] px-1.5 py-0.5"
            style={{ background: 'var(--hover-bg)', border: '1px solid var(--divider)', fontSize: 'var(--fs-caption)' }}
            title={others > 0 ? `ใบนี้ใช้กับอีก ${others} ห้อง` : 'ใช้กับห้องนี้ห้องเดียว'}>
            <span style={{ color: 'var(--text-1)' }}>{pr}</span>
            {others > 0 && (
              <span style={{ color: 'var(--accent)' }}>+{others}</span>
            )}
            {canWrite && (
              <button onClick={() => remove(pr)} aria-label={`ลบ PR ${pr}`}
                style={{ color: 'var(--text-3)', lineHeight: 1 }}>×</button>
            )}
          </span>
        )
      })}

      {canWrite && (adding ? (
        <span className="inline-flex flex-col">
          <input className="field-input" autoFocus value={val}
            style={{ width: '9rem', padding: '4px 6px', fontSize: 'var(--fs-caption)' }}
            aria-label={`เพิ่ม PR ห้อง ${job.room_no ?? job.id}`}
            onChange={e => setVal(e.target.value)}
            onBlur={commit}
            onKeyDown={e => {
              if (e.key === 'Enter') e.currentTarget.blur()
              if (e.key === 'Escape') { setVal(''); setAdding(false) }
            }} />
          {typedElsewhere > 0 && (
            <span className="text-micro mt-1" style={{ color: 'var(--accent)' }}>
              ใบนี้ใช้กับอีก {typedElsewhere} ห้อง
            </span>
          )}
        </span>
      ) : (
        <button onClick={() => { setVal(''); setAdding(true) }}
          className="rounded-[8px] px-1.5 py-0.5"
          style={{ color: 'var(--text-3)', fontSize: 'var(--fs-caption)' }}
          aria-label={`เพิ่ม PR ห้อง ${job.room_no ?? job.id}`}>
          {list.length ? '+ PR' : '+ เพิ่ม PR'}
        </button>
      ))}
      {!canWrite && list.length === 0 && <span style={{ color: 'var(--text-3)' }}>—</span>}
    </div>
  )
}

/* ── Tab 3 · people ─────────────────────────────────────── */

function PeopleTab({ people, admins, users, nameOf }: {
  people: ReturnType<typeof scorePeople>
  admins: ReturnType<typeof scoreAdmins>
  users: AppUser[]
  nameOf: (id: string | null) => string
}) {
  const mgr = users.find(u => u.dept === 'Procurement / QS')
  /* บรรทัดบทบาทถูกถอดออก 2026-09-08 — ตั้งแต่รวมทีมจัดซื้อกับ QS เข้าด้วยกัน
     มันขึ้นข้อความเดียวกันทุกใบ ใครทำหมวดไหนดูได้จากตัวเลขในการ์ดอยู่แล้ว
     เพราะคิดจากเฉพาะหมวดที่คนนั้นถือจริง */

  return (
    <>
      {mgr && (
        <div className="ds-card-sm flex flex-wrap items-center gap-x-4 gap-y-1">
          <b className="text-card-title" style={{ color: 'var(--text-1)' }}>{mgr.name}</b>
          <span className="text-caption" style={{ color: 'var(--text-3)' }}>
            ผู้จัดการ คุมจัดซื้อ + QS — เห็นทุกห้อง ไม่นับเป็นผู้รับผิดชอบรายห้อง
          </span>
          <span className="ml-auto flex gap-2">
            <span className="badge badge-gray">จัดซื้อ {users.filter(u => u.role === 'procurement' && u.id !== mgr.id).length} คน</span>
            <span className="badge badge-orange">QS {users.filter(u => u.role === 'qs').length} คน</span>
          </span>
        </div>
      )}

      <div className="grid gap-4 mt-3" style={{ gridTemplateColumns: 'repeat(auto-fill,minmax(min(240px,100%),1fr))' }}>
        {people.length === 0 && (
          <p className="text-body" style={{ color: 'var(--text-3)' }}>
            ยังไม่มีใครถูกมอบหมายห้องในช่วงที่เลือก
          </p>
        )}
        {people.map(p => (
          <div key={p.userId} className="ds-card-sm">
            <h3 className="text-card-title" style={{ color: 'var(--text-1)' }}>{nameOf(p.userId)}</h3>
            {/* ขนาดงานเป็นบริบท ไม่ใช่ตัวชี้วัด — เดิมวางเป็นสองแถวหน้าตาเดียวกับ
                KPI ทำให้ของจริงสองตัวจมหายไปในสี่แถวที่เหมือนกันหมด · เงินเต็ม
                จำนวน ไม่ใช่ ฿0.61 MB. เพราะบรรทัดนี้กว้างพอ (lib/money.ts) */}
            <p className="text-caption" style={{ color: 'var(--text-3)' }}>
              {p.rooms} ห้อง · {baht(p.act)}
            </p>
            <dl className="mt-3 text-body">
              {/* ทุกแถวบอกฐานที่ใช้คิดไว้ด้วย — คลาด 19.7% จาก 3 ห้อง กับ 52.4%
                  จาก 17 ห้อง คนละน้ำหนักกัน แต่การ์ดเดิมวางเคียงกันเหมือนเทียบ
                  กันได้ตรงๆ · ยังไม่ใส่สีทุกแถวตามที่เจ้าของสั่ง 2026-09-08 */}
              <Row k="ประมาณการคลาดเฉลี่ย"
                v={p.accuracy === null ? '—' : `${p.accuracy.toFixed(1)}%`}
                sub={p.accuracy === null ? 'ยังไม่มีห้องที่เทียบได้' : `จาก ${p.measuredAcc} ห้อง`} />
              <Row k={`เปิด PO ทัน ${PO_KPI_DAYS} วัน`}
                v={p.measured ? `${p.onTime}/${p.measured}` : '—'}
                sub={p.measured ? undefined : 'ยังไม่มีห้องที่วัดได้'} />
              {/* "GP% เฉลี่ย" ไม่ใช่ "GP% จริง" — คำสั่งเจ้าของ 2026-09-08 · ไม่มีสี
                  โดยตั้งใจ เพราะ GP เป็นผลร่วมกับเซลล์ ใส่สีเมื่อไหร่ก็กลายเป็น
                  คะแนนตัดสินจัดซื้อทันที ซึ่งขัดกับหมายเหตุท้ายแท็บ */}
              <Row k="GP% เฉลี่ย"
                v={p.gpAvg === null ? '—' : `${(p.gpAvg * 100).toFixed(1)}%`}
                sub={p.gpAvg === null ? 'ยังไม่มีห้องที่ระบุราคาขายครบ' : `จาก ${p.gpRooms} ห้องที่ระบุราคาขายครบ`} />
              <Row k="ห้องที่ต้นทุนเกินรายรับ"
                v={p.gpRooms ? `${p.gpNegative} ห้อง` : '—'} />
            </dl>
          </div>
        ))}
      </div>

      <h3 className="text-section-title mt-6" style={{ color: 'var(--text-1)' }}>
        แอดมินเซลล์ · เอกสาร
        <span className="text-caption font-normal ml-2" style={{ color: 'var(--text-3)' }}>
          วัดจากห้องที่รับผิดชอบ ไม่ใช่ว่าใครพิมพ์
        </span>
      </h3>
      <div className="grid gap-4 mt-3" style={{ gridTemplateColumns: 'repeat(auto-fill,minmax(min(240px,100%),1fr))' }}>
        {admins.length === 0 && (
          <p className="text-body" style={{ color: 'var(--text-3)' }}>
            ยังไม่มีแอดมินถูกมอบหมายห้องในช่วงที่เลือก — มอบหมายได้ที่หัวห้องในแท็บจัดซื้อจัดจ้าง
          </p>
        )}
        {admins.map(a => (
          <div key={a.userId} className="ds-card-sm">
            <h3 className="text-card-title" style={{ color: 'var(--text-1)' }}>{nameOf(a.userId)}</h3>
            <p className="text-caption" style={{ color: 'var(--text-3)' }}>แอดมิน · เอกสาร</p>
            <dl className="mt-3 text-body">
              <Row k="ห้องที่ดูแล" v={String(a.rooms)} />
              <Row k="เอกสารครบทุกช่อง" v={`${a.complete}/${a.rooms}`} />
              <Row k="ช่องที่กรอกแล้ว"
                v={a.fieldsTotal ? `${Math.round(a.fields / a.fieldsTotal * 100)}%` : '—'} />
              <Row k={`ส่งต่อจัดซื้อทัน ${ADMIN_KPI_DAYS} วัน`}
                v={a.measured ? `${a.onTime}/${a.measured}` : '—'} />
            </dl>
          </div>
        ))}
      </div>

      <p className="text-caption mt-3" style={{ color: 'var(--text-3)' }}>
        <b style={{ color: 'var(--text-2)' }}>แอดมินวัดความครบถ้วนกับความเร็ว</b> — เอกสารครบกี่ห้อง
        และส่งงานต่อให้จัดซื้อภายใน {ADMIN_KPI_DAYS} วันหลังตัวเองรับงานกี่ห้อง
        (ช่วงที่รอเซลล์ไม่นับ เพราะแอดมินคุมไม่ได้)
      </p>

      <p className="text-caption mt-3" style={{ color: 'var(--text-3)' }}>
        <b style={{ color: 'var(--text-2)' }}>วัด 2 อย่าง ไม่ใช่ GP%</b> — งานจัดซื้อคือประมาณการให้แม่น
        (เซลล์เอาไปเสนอราคา ต่ำไปบริษัทขาดทุน) และเปิด PO ให้ทัน
        ส่วน GP% เป็นผลร่วมกับเซลล์ — เซลล์ลดราคา GP ก็ตกทั้งที่จัดซื้อทำดี
        คิดคะแนนจากเฉพาะหมวดที่คนนั้นรับผิดชอบ ไม่ใช่ทั้งห้อง
      </p>
    </>
  )
}

/* เส้นคั่นทุกแถว แถวสุดท้ายไม่มี — ตามที่เจ้าของขอให้เหมือน mockup
   ตัวเลขที่ไม่มีฐานให้คิดขึ้นเป็นข้อความบอกเหตุผล ไม่ใช่ขีดลอยๆ ซึ่งอ่านได้ว่า
   "ทำไม่ได้เลย" ทั้งที่แปลว่ายังไม่ได้กรอกต้นทุน */
function Row({ k, v, sub }: { k: string; v: string; sub?: string }) {
  return (
    <div className="flex justify-between items-start gap-2 py-1.5 border-b last:border-b-0"
      style={{ borderColor: 'var(--divider)' }}>
      <dt style={{ color: 'var(--text-3)' }}>{k}</dt>
      <dd className="text-right">
        <span className="font-semibold tabular-nums" style={{ color: 'var(--text-1)' }}>{v}</span>
        {sub && <span className="block text-label" style={{ color: 'var(--text-3)' }}>{sub}</span>}
      </dd>
    </div>
  )
}

/* ── Tab 4 · registry ───────────────────────────────────── */

function RegistryTab({ cats, sups, supsOfCat, items, canWrite, onAddSupplier, onEditSupplier, onAddCategory, onEditCategory }: {
  cats: CostCategory[]
  sups: Supplier[]
  supsOfCat: Map<string, Supplier[]>
  items: CostItem[]
  canWrite: boolean
  onAddSupplier: (cat: string) => void
  onEditSupplier: (s: Supplier) => void
  onAddCategory: () => void
  onEditCategory: (c: CostCategory) => void
}) {
  const use = useMemo(() => {
    const m = new Map<string, { n: number; val: number }>()
    for (const it of items) {
      if (!it.supplier_id) continue
      const cur = m.get(it.supplier_id) ?? { n: 0, val: 0 }
      m.set(it.supplier_id, { n: cur.n + 1, val: cur.val + effectiveCost(it) })
    }
    return m
  }, [items])

  const unlisted = sups.filter(s => ![...supsOfCat.values()].flat().some(x => x.id === s.id))

  return (
    <>
      <div className="ds-card ds-card-flush overflow-hidden">
        <div className="flex items-baseline justify-between gap-3 flex-wrap p-4 pb-3">
          <h2 className="text-section-title" style={{ color: 'var(--text-1)' }}>หมวดงาน</h2>
          <span className="text-caption" style={{ color: 'var(--text-3)' }}>
            ใช้เป็นตัวเลือกในหน้ากรอก · จัดซื้อเพิ่มเองได้
          </span>
        </div>
        <div className="tbl-scroll">
          <table className="w-full tbl-rows" style={{ tableLayout: 'fixed' }}>
            <thead>
              <tr>
                <th className="text-left th-muted" style={{ width: '46%' }}>หมวด</th>
                <th className="text-left th-muted" style={{ width: '22%' }}>ผู้ประมาณการ</th>
                <th className="num num-count th-muted" style={{ width: '22%' }}><span>Supplier ในหมวด</span></th>
                {canWrite && <th style={{ width: '10%' }} />}
              </tr>
            </thead>
            <tbody>
              {cats.map((c, ci) => (
                <tr key={c.id}>
                  <td className="font-semibold">{c.name}</td>
                  <td>
                    <span className={`badge ${c.owner_dept === 'qs' ? 'badge-orange' : 'badge-gray'}`}>
                      {c.owner_dept === 'qs' ? 'QS' : 'จัดซื้อ'}
                    </span>
                  </td>
                  <td className="num num-count tabular-nums">
                    <span>{c.needs_supplier
                      ? (supsOfCat.get(c.id)?.length ?? 0) || '—'
                      : <span className="badge badge-gray">ไม่ต้องมี</span>}</span>
                  </td>
                  {canWrite && (
                    <td className="num num-money">
                      <button onClick={() => onEditCategory(c)} aria-label={`แก้ไขหมวด ${c.name}`}
                        style={{ color: 'var(--text-3)' }}><Pencil size={14} /></button>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {canWrite && (
          <div className="p-4 pt-3">
            <button onClick={onAddCategory}
              className="btn-primary px-3 py-2 rounded-[8px] font-semibold text-white flex items-center gap-1.5">
              <Plus size={14} /> เพิ่มหมวดงาน
            </button>
          </div>
        )}
      </div>

      <div className="ds-card ds-card-flush overflow-hidden mt-4">
        <div className="flex items-baseline justify-between gap-3 flex-wrap p-4 pb-3">
          <h2 className="text-section-title" style={{ color: 'var(--text-1)' }}>
            ทะเบียน Supplier · แยกตามหมวดงาน
          </h2>
          <span className="text-caption" style={{ color: 'var(--text-3)' }}>
            รายชื่อในหมวดไหน จะไปขึ้นเป็นตัวเลือกของหมวดนั้นในหน้ากรอก
          </span>
        </div>
        <div className="tbl-scroll">
          <table className="w-full tbl-rows" style={{ tableLayout: 'fixed' }}>
            <thead>
              <tr>
                <th className="text-left th-muted" style={{ width: '34%' }}>ชื่อบริษัท / ผู้รับจ้าง</th>
                <th className="text-left th-muted" style={{ width: '14%' }}>ผู้ติดต่อ</th>
                <th className="text-left th-muted" style={{ width: '22%' }}>อีเมล</th>
                <th className="text-left th-muted" style={{ width: '12%' }}>เบอร์โทร</th>
                <th className="num num-count th-muted" style={{ width: '8%' }}><span>งานที่จ้าง</span></th>
                <th className="num num-money th-muted" style={{ width: '10%' }}><span>มูลค่ารวม</span></th>
                {canWrite && <th style={{ width: '5%' }} />}
              </tr>
            </thead>
            <tbody>
              {cats.filter(c => c.needs_supplier).map(c => {
                const list = supsOfCat.get(c.id) ?? []
                return (
                  <FragmentRows key={c.id}>
                    <tr style={{ background: 'var(--active-bg)' }}>
                      <td colSpan={canWrite ? 7 : 6}>
                        <span className="font-semibold">{c.name}</span>
                        {c.owner_dept === 'qs' && <span className="ml-2 badge badge-orange">QS</span>}
                        <span className="text-caption ml-2" style={{ color: 'var(--text-3)' }}>
                          {list.length} ราย
                        </span>
                        {canWrite && (
                          <button onClick={() => onAddSupplier(c.id)}
                            className="float-right text-xs font-semibold flex items-center gap-1"
                            style={{ color: 'var(--accent)' }}>
                            <Plus size={13} /> เพิ่ม Supplier
                          </button>
                        )}
                      </td>
                    </tr>
                    {list.length === 0 && (
                      <tr>
                        <td colSpan={canWrite ? 7 : 6} className="text-caption"
                          style={{ color: 'var(--text-3)' }}>ยังไม่มีรายชื่อในหมวดนี้</td>
                      </tr>
                    )}
                    {list.map((s, si) => <SupplierRow key={`${c.id}-${s.id}`} s={s} i={si} use={use} canWrite={canWrite} onEdit={onEditSupplier} />)}
                  </FragmentRows>
                )
              })}
              {unlisted.length > 0 && (
                <FragmentRows>
                  <tr style={{ background: 'var(--active-bg)' }}>
                    <td colSpan={canWrite ? 7 : 6}>
                      <span className="font-semibold">ยังไม่ได้ระบุหมวด</span>
                      <span className="text-caption ml-2" style={{ color: 'var(--text-3)' }}>
                        {unlisted.length} ราย — จะไม่ขึ้นในดรอปดาวจนกว่าจะเลือกหมวดให้
                      </span>
                    </td>
                  </tr>
                  {unlisted.map((s, si) => <SupplierRow key={s.id} s={s} i={si} use={use} canWrite={canWrite} onEdit={onEditSupplier} />)}
                </FragmentRows>
              )}
              {sups.length === 0 && <TableEmpty colSpan={canWrite ? 7 : 6} message="ยังไม่มี Supplier ในทะเบียน" />}
            </tbody>
          </table>
        </div>
      </div>
    </>
  )
}

function SupplierRow({ s, i, use, canWrite, onEdit }: {
  s: Supplier
  i: number
  use: Map<string, { n: number; val: number }>
  canWrite: boolean
  onEdit: (s: Supplier) => void
}) {
  const u = use.get(s.id)
  return (
    <tr>
      <td className="font-semibold" style={{ whiteSpace: 'normal' }}>{s.company_name}</td>
      <td style={{ whiteSpace: 'normal' }}>{s.contact_name ?? '—'}</td>
      {/* อีเมลไม่มีช่องว่างให้ตัดบรรทัด ถ้าไม่บังคับ overflow มันจะดันตารางทั้งอัน */}
      <td className="text-caption" style={{
        color: 'var(--text-2)', maxWidth: 0, overflow: 'hidden',
        textOverflow: 'ellipsis', whiteSpace: 'nowrap',
      }} title={s.email ?? ''}>{s.email ?? '—'}</td>
      <td className="text-caption whitespace-nowrap" style={{ color: 'var(--text-2)' }}>{s.phone ?? '—'}</td>
      <td className="num num-count tabular-nums"><span>{u?.n ?? '—'}</span></td>
      <td className="num num-money tabular-nums"><span>{u ? baht(u.val) : '—'}</span></td>
      {canWrite && (
        <td className="num num-money">
          <button onClick={() => onEdit(s)} aria-label={`แก้ไข ${s.company_name}`}
            style={{ color: 'var(--text-3)' }}><Pencil size={14} /></button>
        </td>
      )}
    </tr>
  )
}
