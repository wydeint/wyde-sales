'use client'

import { useRef, useState, useEffect } from 'react'
import { Paperclip, FileText, ImageIcon, ExternalLink, Loader2 } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'

interface JobFile {
  id: string
  file_name: string
  file_url: string
  created_at: string
}

interface Props {
  jobId?: string
  customerId?: string
  projectName: string
  roomNo: string
}

const MAX_FILES = 10
const MAX_SIZE = 5 * 1024 * 1024

export default function FileAttach({ jobId, customerId, projectName, roomNo }: Props) {
  const supabase = createClient()
  const inputRef = useRef<HTMLInputElement>(null)
  const [files, setFiles] = useState<JobFile[]>([])
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState('')
  const [pendingNames, setPendingNames] = useState<string[]>([])

  useEffect(() => { loadFiles() }, [jobId, customerId])

  async function loadFiles() {
    if (!jobId && !customerId) return
    let q = supabase.from('job_files').select('*').order('created_at', { ascending: false })
    if (jobId) q = q.eq('job_id', jobId)
    else if (customerId) q = q.eq('customer_id', customerId)
    const { data } = await q
    setFiles((data as JobFile[]) || [])
  }

  async function handleSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const selected = Array.from(e.target.files || [])
    e.target.value = ''
    setError('')

    if (!selected.length) return
    if (selected.length > MAX_FILES) {
      setError('เลือกได้สูงสุด ' + MAX_FILES + ' ไฟล์')
      return
    }
    for (const f of selected) {
      if (!['image/jpeg', 'image/jpg', 'application/pdf'].includes(f.type)) {
        setError('"' + f.name + '" ต้องเป็น JPG หรือ PDF เท่านั้น')
        return
      }
      if (f.size > MAX_SIZE) {
        setError('"' + f.name + '" ขนาดเกิน 5MB')
        return
      }
    }

    setPendingNames(selected.map(f => f.name))
    setUploading(true)

    const { data: { session } } = await supabase.auth.getSession()
    const form = new FormData()
    if (jobId) form.append('job_id', jobId)
    if (customerId) form.append('customer_id', customerId)
    form.append('project_name', projectName)
    form.append('room_no', roomNo)
    if (session?.user?.id) form.append('user_id', session.user.id)
    selected.forEach(f => form.append('files', f))

    const res = await fetch('/api/drive/upload', {
      method: 'POST',
      headers: session?.access_token ? { Authorization: 'Bearer ' + session.access_token } : {},
      body: form,
    })
    const json = await res.json()

    setUploading(false)
    setPendingNames([])

    if (!res.ok) {
      setError(json.error || 'Upload ล้มเหลว')
      return
    }
    await loadFiles()
  }

  const isJpg = (name: string) => /\.(jpg|jpeg)$/i.test(name)

  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs font-semibold" style={{ color: 'var(--text-2)' }}>
          ไฟล์แนบ ({files.length})
        </span>
        <button
          onClick={() => inputRef.current?.click()}
          disabled={uploading}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-[8px] text-xs font-semibold transition-colors"
          style={{ background: 'var(--hover-bg)', border: '1px solid var(--divider)', color: 'var(--text-2)' }}>
          {uploading
            ? <Loader2 size={12} className="animate-spin" />
            : <Paperclip size={12} />}
          {uploading ? 'กำลังอัปโหลด...' : 'แนบไฟล์'}
        </button>
        <input
          ref={inputRef}
          type="file"
          multiple
          accept=".jpg,.jpeg,.pdf"
          className="hidden"
          onChange={handleSelect}
        />
      </div>

      {error && (
        <p className="text-xs mb-2 px-2 py-1.5 rounded-[6px]"
          style={{ color: '#f87171', background: 'rgba(248,113,113,0.1)' }}>
          {error}
        </p>
      )}

      {pendingNames.length > 0 && (
        <div className="space-y-1 mb-2">
          {pendingNames.map((name, i) => (
            <div key={i} className="flex items-center gap-2 px-3 py-2 rounded-[8px]"
              style={{ background: 'var(--hover-bg)', border: '1px solid var(--divider)' }}>
              <Loader2 size={11} className="animate-spin" style={{ color: 'var(--accent)' }} />
              <span className="text-xs flex-1 truncate" style={{ color: 'var(--text-2)' }}>{name}</span>
            </div>
          ))}
        </div>
      )}

      {files.length > 0 && (
        <div className="space-y-1">
          {files.map(f => (
            <a key={f.id} href={f.file_url} target="_blank" rel="noopener noreferrer"
              className="flex items-center gap-2 px-3 py-2 rounded-[8px] transition-colors"
              style={{ background: 'var(--hover-bg)', border: '1px solid var(--divider)' }}>
              {isJpg(f.file_name)
                ? <ImageIcon size={12} style={{ color: '#4ade80' }} />
                : <FileText size={12} style={{ color: '#f87171' }} />}
              <span className="text-xs flex-1 truncate" style={{ color: 'var(--text-1)' }}>{f.file_name}</span>
              <ExternalLink size={11} style={{ color: 'var(--text-3)' }} />
            </a>
          ))}
        </div>
      )}

      {files.length === 0 && !uploading && (
        <p className="text-xs text-center py-3" style={{ color: 'var(--text-3)' }}>ยังไม่มีไฟล์แนบ</p>
      )}

      <p className="text-xs mt-2" style={{ color: 'var(--text-3)' }}>JPG, PDF · สูงสุด 10 ไฟล์ · 5MB/ไฟล์</p>
    </div>
  )
}
