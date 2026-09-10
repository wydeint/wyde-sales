'use client'

import { useEffect, useRef } from 'react'

/**
 * ช่องกรอกจำนวนเงินที่มีเครื่องหมายคั่นหลักพัน **ขณะพิมพ์**
 *
 * `<input type="number">` แสดง `1070000` ติดกันเป็นพืด คนกรอกต้องนั่งนับศูนย์
 * ทีละตัว ซึ่งเป็นวิธีที่พลาดง่ายที่สุดเท่าที่จะออกแบบได้ — และตัวเลขพวกนี้คือ
 * มูลค่างานกับต้นทุน ผิดหนึ่งหลักคือผิดสิบเท่า
 *
 * เวอร์ชันแรกจัดรูปแบบตอนออกจากช่อง ซึ่งช่วยไม่ทัน: คนพิมพ์ต้องเห็น `,`
 * *ระหว่าง* พิมพ์ถึงจะรู้ว่าใส่ครบหลักไหม
 *
 * ปัญหาของการจัดรูปแบบสด คือเคอร์เซอร์กระโดดไปท้ายช่องทุกครั้งที่ React
 * เขียนค่าใหม่ลงไป แก้ด้วยการนับ "จำนวนหลักที่อยู่ก่อนเคอร์เซอร์" ก่อนจัดรูปแบบ
 * แล้ววางเคอร์เซอร์กลับหลังหลักที่เท่ากันนั้น — ตำแหน่งจึงคงที่ในสายตาคนพิมพ์
 * แม้จำนวน `,` จะเปลี่ยนไป
 */

/** ตัวเลขล้วน → มี `,` คั่นหลักพัน (ทศนิยมไม่ถูกแตะ) */
export function withCommas(raw: string): string {
  if (!raw) return ''
  const neg = raw.startsWith('-')
  const body = neg ? raw.slice(1) : raw
  const [int, ...rest] = body.split('.')
  const grouped = int ? Number(int).toLocaleString('en-US') : ''
  const dec = rest.length ? '.' + rest.join('') : ''
  // `1.` ระหว่างพิมพ์ต้องไม่ถูกกลืนหาย ไม่งั้นพิมพ์ทศนิยมต่อไม่ได้
  return (neg ? '-' : '') + (int === '' && dec ? '' : grouped) + dec
}

/** เก็บเฉพาะสิ่งที่เป็นตัวเลขได้ — ใช้ตอนรับค่าที่คนวาง (paste) มาด้วย */
const digitsOnly = (v: string) => v.replace(/[^0-9.-]/g, '')

export default function MoneyInput({
  value,
  onChange,
  className = 'field-input',
  placeholder,
  style,
  ariaLabel,
  disabled,
  onBlur,
  onKeyDown,
  autoFocus,
}: {
  /** ตัวเลขล้วน (สตริง) เช่น "1070000" — ผู้เรียกไม่ต้องยุ่งกับ comma เลย */
  value: string
  onChange: (raw: string) => void
  className?: string
  placeholder?: string
  style?: React.CSSProperties
  ariaLabel?: string
  disabled?: boolean
  onBlur?: () => void
  /** Enter/Escape ของช่องแก้ยอดแบบ inline — ถ้าไม่ส่งผ่าน การกด Enter จะเงียบ */
  onKeyDown?: (e: React.KeyboardEvent<HTMLInputElement>) => void
  autoFocus?: boolean
}) {
  const ref = useRef<HTMLInputElement>(null)
  /** ตำแหน่งเคอร์เซอร์ที่ต้องวางคืนหลัง React เขียนค่าใหม่ */
  const caret = useRef<number | null>(null)

  useEffect(() => {
    if (caret.current !== null && ref.current) {
      ref.current.setSelectionRange(caret.current, caret.current)
      caret.current = null
    }
  })

  function handle(e: React.ChangeEvent<HTMLInputElement>) {
    const el = e.target
    const pos = el.selectionStart ?? el.value.length
    // นับหลักที่อยู่ก่อนเคอร์เซอร์ — เป็นสิ่งเดียวที่คงที่เมื่อ `,` ขยับ
    const digitsBefore = el.value.slice(0, pos).replace(/[^0-9.-]/g, '').length

    const raw = digitsOnly(el.value)
    const pretty = withCommas(raw)

    let seen = 0
    let next = pretty.length
    for (let i = 0; i < pretty.length; i++) {
      if (/[0-9.-]/.test(pretty[i])) seen++
      if (seen === digitsBefore) { next = i + 1; break }
    }
    caret.current = digitsBefore === 0 ? 0 : next

    onChange(raw)
  }

  return (
    <input
      ref={ref}
      type="text"
      inputMode="decimal"
      className={className}
      style={style}
      placeholder={placeholder}
      aria-label={ariaLabel}
      disabled={disabled}
      autoFocus={autoFocus}
      value={withCommas(value)}
      onChange={handle}
      onBlur={onBlur}
      onKeyDown={onKeyDown}
    />
  )
}

/**
 * MoneyInput ที่มีป้ายกำกับ — ใช้แทน `<Input label=... type="number">`
 * ในช่องที่เป็นจำนวนเงิน โครงสร้างเดียวกับ `Input` เพื่อให้หน้าตาเสมอกัน
 */
export function MoneyField({ label, value, onChange, required, placeholder, disabled }: {
  label: string
  value: string
  onChange: (raw: string) => void
  required?: boolean
  placeholder?: string
  disabled?: boolean
}) {
  return (
    <div className="flex flex-col gap-1">
      <label className="field-label">
        {label}
        {required && (
          <span aria-hidden="true" style={{ color: 'var(--accent-orange)', marginLeft: 2 }}>*</span>
        )}
      </label>
      <MoneyInput value={value} onChange={onChange} ariaLabel={label}
        className="field-input w-full" placeholder={placeholder} disabled={disabled} />
    </div>
  )
}
