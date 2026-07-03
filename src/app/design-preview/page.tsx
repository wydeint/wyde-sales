'use client'

import { useState } from 'react'
import Modal from '@/components/ui/Modal'
import { Input, Select, TextArea } from '@/components/ui/Input'
import { PageError, TableError, PageSpinner } from '@/components/ui/StateUI'

export default function DesignPreviewPage() {
  const [modalOpen, setModalOpen] = useState(false)
  const [tab, setTab] = useState('a')

  return (
    <div className="min-h-screen p-8 space-y-10 max-w-4xl mx-auto">
      <div>
        <p className="text-xs mb-1" style={{ color: 'var(--text-3)' }}>
          Style guide — อ้างอิงจาก .claude/design/design.md, เปิดสาธารณะไว้ตั้งใจ ไม่ใช่หน้าในระบบจริง
        </p>
        <h1 className="text-page-title" style={{ color: 'var(--text-1)' }}>WydE Sales — Style Guide</h1>
      </div>

      {/* Typography */}
      <section className="space-y-2">
        <p className="text-label-upper" style={{ color: 'var(--text-3)' }}>Typography</p>
        <div className="glass-card p-5 space-y-3">
          <p className="text-page-title" style={{ color: 'var(--text-1)' }}>Page Title 20px/700</p>
          <p className="text-section-title" style={{ color: 'var(--text-1)' }}>Section Title 15px/600</p>
          <p className="text-card-title" style={{ color: 'var(--text-1)' }}>Card Title 13px/600</p>
          <p className="text-body-strong" style={{ color: 'var(--text-1)' }}>Body Strong 13px/600</p>
          <p className="text-sm" style={{ color: 'var(--text-2)' }}>Body ปกติ (Tailwind text-sm) — ยังไม่เปลี่ยนในรอบนี้</p>
          <p className="text-kpi-number" style={{ color: 'var(--text-1)' }}>฿1,234,567</p>
          <p className="text-label-upper" style={{ color: 'var(--text-3)' }}>Label Uppercase 11px/600</p>
        </div>
      </section>

      {/* Card */}
      <section className="space-y-2">
        <p className="text-label-upper" style={{ color: 'var(--text-3)' }}>Card (.glass-card) — radius 18px, no shadow</p>
        <div className="grid grid-cols-2 gap-4">
          <div className="glass-card p-4">
            <p className="text-card-title" style={{ color: 'var(--text-1)' }}>KPI การ์ด</p>
            <p className="text-kpi-number mt-1" style={{ color: 'var(--text-1)' }}>128</p>
            <p className="text-xs mt-1" style={{ color: 'var(--text-3)' }}>ลูกค้าทั้งหมด</p>
          </div>
          <div className="glass-card p-4">
            <p className="text-card-title" style={{ color: 'var(--text-1)' }}>KPI การ์ด 2</p>
            <p className="text-kpi-number mt-1" style={{ color: 'var(--text-1)' }}>฿4.2M</p>
            <p className="text-xs mt-1" style={{ color: 'var(--text-3)' }}>ยอดขายเดือนนี้</p>
          </div>
        </div>
      </section>

      {/* Buttons */}
      <section className="space-y-2">
        <p className="text-label-upper" style={{ color: 'var(--text-3)' }}>Buttons — pill radius, weight 600, press = scale(0.95)</p>
        <div className="flex items-center gap-3 flex-wrap">
          <button className="px-4 py-2 btn-green text-white text-sm">เพิ่มรายการ</button>
          <button className="px-4 py-2 btn-purple text-white text-sm">Warranty</button>
          <button className="px-4 py-2 btn-blue text-white text-sm">ดูรายละเอียด</button>
          <button onClick={() => setModalOpen(true)} className="px-4 py-2 btn-green text-white text-sm">เปิด Modal</button>
        </div>
      </section>

      {/* Tab group */}
      <section className="space-y-2">
        <p className="text-label-upper" style={{ color: 'var(--text-3)' }}>Tab group — radius scale, weight 600, no glow shadow</p>
        <div className="tab-group w-fit">
          <button className={`tab-btn ${tab === 'a' ? 'active' : ''}`} onClick={() => setTab('a')}>รายรับ</button>
          <button className={`tab-btn ${tab === 'b' ? 'active' : ''}`} onClick={() => setTab('b')}>รายจ่าย</button>
          <button className={`tab-btn ${tab === 'c' ? 'active' : ''}`} onClick={() => setTab('c')}>สรุป</button>
        </div>
      </section>

      {/* Inputs */}
      <section className="space-y-2">
        <p className="text-label-upper" style={{ color: 'var(--text-3)' }}>Inputs (.field-input) — radius 8px</p>
        <div className="glass-card p-5 grid grid-cols-2 gap-4">
          <Input label="ชื่อลูกค้า" placeholder="กรอกชื่อ" required />
          <Select label="สถานะ" options={[{ value: 'new', label: 'ใหม่' }, { value: 'closed', label: 'ปิดแล้ว' }]} />
          <div className="col-span-2">
            <TextArea label="หมายเหตุ" placeholder="รายละเอียดเพิ่มเติม" />
          </div>
        </div>
      </section>

      {/* Nav-item-style radius sample */}
      <section className="space-y-2">
        <p className="text-label-upper" style={{ color: 'var(--text-3)' }}>Nav item radius (11px) — จำลองจาก Sidebar</p>
        <div className="w-56 space-y-0.5">
          <div className="flex items-center gap-2.5 rounded-[11px] px-3 py-2 text-sm" style={{ background: 'var(--active-bg)', color: 'var(--accent)' }}>
            เมนูที่กำลังเปิดอยู่
          </div>
          <div className="flex items-center gap-2.5 rounded-[11px] px-3 py-2 text-sm" style={{ color: 'var(--text-2)' }}>
            เมนูปกติ
          </div>
        </div>
      </section>

      {/* StateUI */}
      <section className="space-y-2">
        <p className="text-label-upper" style={{ color: 'var(--text-3)' }}>StateUI — retry button now pill, weight 600</p>
        <div className="glass-card p-2">
          <PageError message="ตัวอย่างข้อความ error" onRetry={() => {}} />
        </div>
        <table className="w-full glass-card">
          <tbody>
            <TableError colSpan={3} message="โหลดตารางไม่สำเร็จ (ตัวอย่าง)" onRetry={() => {}} />
          </tbody>
        </table>
      </section>

      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title="ตัวอย่าง Modal — radius 18px">
        <p className="text-sm" style={{ color: 'var(--text-2)' }}>
          นี่คือตัวอย่างเนื้อหาใน Modal หลังปรับ radius เป็น 18px ตาม design.md — เงายังคงอยู่ตามข้อยกเว้นของ overlay
        </p>
        <div className="mt-4 flex justify-end gap-2">
          <button onClick={() => setModalOpen(false)} className="px-4 py-2 btn-blue text-white text-sm">ปิด</button>
        </div>
      </Modal>
    </div>
  )
}
