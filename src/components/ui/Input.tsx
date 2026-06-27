'use client'

import { useId } from 'react'
import { cn } from '@/lib/utils'

interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string
  error?: string
}

export function Input({ label, error, className, id: externalId, ...props }: InputProps) {
  const generatedId = useId()
  const id = externalId ?? generatedId
  const errId = `${id}-err`

  return (
    <div className="flex flex-col gap-1">
      {label && (
        <label htmlFor={id} className="field-label">
          {label}
          {props.required && (
            <span aria-hidden="true" style={{ color: 'var(--accent-orange)', marginLeft: 2 }}>*</span>
          )}
        </label>
      )}
      <input
        id={id}
        aria-required={props.required ? 'true' : undefined}
        aria-describedby={error ? errId : undefined}
        aria-invalid={error ? 'true' : undefined}
        className={cn('field-input w-full', error && 'border-red-500', className)}
        {...props}
      />
      {error && (
        <p id={errId} role="alert" className="text-xs" style={{ color: '#ef4444' }}>
          {error}
        </p>
      )}
    </div>
  )
}

interface SelectProps extends React.SelectHTMLAttributes<HTMLSelectElement> {
  label?: string
  options: { value: string; label: string }[]
  error?: string
}

export function Select({ label, options, className, id: externalId, error, ...props }: SelectProps) {
  const generatedId = useId()
  const id = externalId ?? generatedId
  const errId = `${id}-err`

  return (
    <div className="flex flex-col gap-1">
      {label && (
        <label htmlFor={id} className="field-label">
          {label}
          {props.required && (
            <span aria-hidden="true" style={{ color: 'var(--accent-orange)', marginLeft: 2 }}>*</span>
          )}
        </label>
      )}
      <select
        id={id}
        aria-required={props.required ? 'true' : undefined}
        aria-describedby={error ? errId : undefined}
        aria-invalid={error ? 'true' : undefined}
        className={cn('field-input w-full', error && 'border-red-500', className)}
        {...props}
      >
        {options.map(o => (
          <option key={o.value} value={o.value}>{o.label}</option>
        ))}
      </select>
      {error && (
        <p id={errId} role="alert" className="text-xs" style={{ color: '#ef4444' }}>
          {error}
        </p>
      )}
    </div>
  )
}

interface TextAreaProps extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {
  label?: string
  error?: string
}

export function TextArea({ label, className, id: externalId, error, ...props }: TextAreaProps) {
  const generatedId = useId()
  const id = externalId ?? generatedId
  const errId = `${id}-err`

  return (
    <div className="flex flex-col gap-1">
      {label && (
        <label htmlFor={id} className="field-label">
          {label}
          {props.required && (
            <span aria-hidden="true" style={{ color: 'var(--accent-orange)', marginLeft: 2 }}>*</span>
          )}
        </label>
      )}
      <textarea
        id={id}
        rows={3}
        aria-required={props.required ? 'true' : undefined}
        aria-describedby={error ? errId : undefined}
        aria-invalid={error ? 'true' : undefined}
        className={cn('field-input w-full resize-none', error && 'border-red-500', className)}
        {...props}
      />
      {error && (
        <p id={errId} role="alert" className="text-xs" style={{ color: '#ef4444' }}>
          {error}
        </p>
      )}
    </div>
  )
}
