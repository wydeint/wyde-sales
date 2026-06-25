import { cn } from '@/lib/utils'

interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string
  error?: string
}

export function Input({ label, error, className, ...props }: InputProps) {
  return (
    <div className="flex flex-col gap-1">
      {label && <label className="text-[#8b949e] text-xs font-medium">{label}</label>}
      <input
        className={cn(
          'bg-[#0d1117] border border-[#30363d] rounded-lg px-3 py-2 text-white text-sm placeholder-[#484f58] focus:outline-none focus:border-[#58a6ff] transition-colors',
          error && 'border-red-500',
          className
        )}
        {...props}
      />
      {error && <p className="text-red-400 text-xs">{error}</p>}
    </div>
  )
}

interface SelectProps extends React.SelectHTMLAttributes<HTMLSelectElement> {
  label?: string
  options: { value: string; label: string }[]
}

export function Select({ label, options, className, ...props }: SelectProps) {
  return (
    <div className="flex flex-col gap-1">
      {label && <label className="text-[#8b949e] text-xs font-medium">{label}</label>}
      <select
        className={cn(
          'bg-[#0d1117] border border-[#30363d] rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-[#58a6ff] transition-colors',
          className
        )}
        {...props}
      >
        {options.map(o => (
          <option key={o.value} value={o.value}>{o.label}</option>
        ))}
      </select>
    </div>
  )
}

interface TextAreaProps extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {
  label?: string
}

export function TextArea({ label, className, ...props }: TextAreaProps) {
  return (
    <div className="flex flex-col gap-1">
      {label && <label className="text-[#8b949e] text-xs font-medium">{label}</label>}
      <textarea
        rows={3}
        className={cn(
          'bg-[#0d1117] border border-[#30363d] rounded-lg px-3 py-2 text-white text-sm placeholder-[#484f58] focus:outline-none focus:border-[#58a6ff] transition-colors resize-none',
          className
        )}
        {...props}
      />
    </div>
  )
}
