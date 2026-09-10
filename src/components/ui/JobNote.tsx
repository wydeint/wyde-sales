'use client'

import { useEffect, useRef, useState } from 'react'
import { StickyNote } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'

/**
 * หมายเหตุของงาน — ช่องเดียว ตำแหน่งเดียว ทุกหน้าที่เปิดงานใบนั้น
 *
 * `jobs.notes` เป็นคอลัมน์เดียวบนงานใบเดียว เซลล์เขียนที่ Prospects หรือ
 * My Deals แล้วคนที่ดูภาพรวมเห็นข้อความเดียวกันที่ Job Registry ทันที —
 * ไม่ใช่เพราะ sync แต่เพราะเป็นแถวเดียวกันจริงๆ
 *
 * วางไว้บนสุดของลิ้นชักเหนือกล่องมูลค่างานทุกหน้า เพราะสิ่งที่ต้องรู้ก่อนตัดสินใจ
 * ต้องอยู่ก่อนตัวเลข ไม่ใช่ให้เลื่อนหา และตำแหน่งเดียวกันทุกหน้าทำให้ไม่ต้องจำ
 * ว่าหน้านี้ซ่อนไว้ตรงไหน
 *
 * เดิมกรอกได้แค่ 2 หน้า — และหนึ่งในนั้น (Customer Registry) เขียนได้เฉพาะ
 * ลูกค้าที่มีงานใบเดียว ที่เหลือพิมพ์แล้วหายเงียบ จึงมีแค่ 25 จาก 974 งาน
 * ที่มีหมายเหตุ
 */
export default function JobNote({ jobId, value, onSaved, disabled }: {
  jobId: string
  value: string | null
  /** ส่งค่าใหม่กลับให้หน้าแม่ เพื่อให้ปิดลิ้นชักแล้วเปิดใหม่ยังเห็นของที่เพิ่งพิมพ์ */
  onSaved?: (next: string) => void
  disabled?: boolean
}) {
  const supabase = createClient()
  const [editing, setEditing] = useState(false)
  const [text, setText] = useState(value || '')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const ref = useRef<HTMLTextAreaElement>(null)

  useEffect(() => { setText(value || '') }, [value, jobId])

  // Grow with the text instead of scrolling inside three fixed lines — a note
  // is read at a glance or not at all.
  useEffect(() => {
    const el = ref.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = el.scrollHeight + 'px'
  }, [text, editing])

  async function save() {
    const next = text.trim()
    setEditing(false)
    if (next === (value || '')) return
    setSaving(true); setError('')
    const { error: e } = await supabase.from('jobs')
      .update({ notes: next || null }).eq('id', jobId)
    setSaving(false)
    if (e) { setError(e.message); setText(value || ''); return }
    onSaved?.(next)
  }

  if (disabled && !value) return null

  const empty = !text.trim()

  return (
    <div className="mb-4">
      {editing ? (
        <textarea
          ref={ref}
          value={text}
          autoFocus
          onChange={e => setText(e.target.value)}
          onBlur={save}
          // Enter saves; Shift+Enter keeps a second line. Escape puts back what
          // was there — a note half-typed and abandoned should not overwrite one
          // that was already useful.
          onKeyDown={e => {
            if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); save() }
            if (e.key === 'Escape') { setText(value || ''); setEditing(false) }
          }}
          placeholder="พิมพ์หมายเหตุ… (Enter บันทึก · Shift+Enter ขึ้นบรรทัดใหม่)"
          rows={1}
          className="w-full text-xs rounded-[8px] px-3 py-2 focus:outline-none resize-none"
          style={{
            background: 'var(--input-bg)', color: 'var(--text-1)',
            border: '1px solid var(--accent)', lineHeight: 1.5,
          }}
        />
      ) : (
        <button
          onClick={() => !disabled && setEditing(true)}
          disabled={disabled}
          className="w-full text-left rounded-[8px] px-3 py-2 flex items-start gap-2 transition-colors"
          style={{
            background: empty ? 'transparent' : 'color-mix(in srgb, var(--accent-amber) 10%, transparent)',
            border: `1px ${empty ? 'dashed' : 'solid'} ${empty ? 'var(--divider)' : 'color-mix(in srgb, var(--accent-amber) 35%, transparent)'}`,
            cursor: disabled ? 'default' : 'pointer',
          }}>
          <StickyNote size={12} className="flex-shrink-0 mt-1"
            style={{ color: empty ? 'var(--text-3)' : 'var(--accent-amber)' }} />
          <span className="text-xs whitespace-pre-wrap break-words"
            style={{ color: empty ? 'var(--text-3)' : 'var(--text-1)' }}>
            {saving ? 'กำลังบันทึก…' : empty ? '+ เพิ่มหมายเหตุ' : text}
          </span>
        </button>
      )}
      {error && (
        <p className="text-micro mt-1" style={{ color: 'var(--accent-red)' }}>
          บันทึกหมายเหตุไม่สำเร็จ: {error}
        </p>
      )}
    </div>
  )
}
