'use client'

import { thaiDate } from '@/lib/thaiDate'

/**
 * A native date field with the chosen date spelled out beneath it.
 *
 * Drop-in for `<input type="date">` — same props, same className. Keeping the
 * native input matters: it is what opens the date wheel on iPhone. What it
 * cannot do is show วัน/เดือน/ปี, because Chrome renders it in the browser's
 * locale and ignores `lang` entirely. So the readable date goes underneath,
 * where `2/1/2569` can no longer be mistaken for 2 January.
 */
export default function DateInput({
  className = '', style, hint = true, ...props
}: React.InputHTMLAttributes<HTMLInputElement> & { hint?: boolean }) {
  const shown = thaiDate(typeof props.value === 'string' ? props.value : '')
  return (
    <div className="flex flex-col">
      <input type="date" className={className} style={style} {...props} />
      {hint && (
        // Reserved height so showing or clearing a date never nudges the layout.
        <span className="text-micro mt-0.5" style={{ color: 'var(--text-3)', minHeight: 14 }}>
          {shown || ' '}
        </span>
      )}
    </div>
  )
}
