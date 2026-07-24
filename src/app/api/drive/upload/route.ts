import { NextRequest, NextResponse } from 'next/server'
import { google } from 'googleapis'
import { Readable } from 'stream'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'

const ALLOWED_TYPES = ['image/jpeg', 'image/jpg', 'application/pdf']
const MAX_SIZE = 5 * 1024 * 1024
const MAX_FILES = 10

function getDriveClient() {
  const auth = new google.auth.OAuth2(
    process.env.GOOGLE_OAUTH_CLIENT_ID!,
    process.env.GOOGLE_OAUTH_CLIENT_SECRET!,
  )
  auth.setCredentials({ refresh_token: process.env.GOOGLE_OAUTH_REFRESH_TOKEN! })
  return google.drive({ version: 'v3', auth })
}

async function findOrCreateFolder(
  drive: ReturnType<typeof google.drive>,
  name: string,
  parentId: string,
): Promise<string> {
  const safe = name.replace(/[/\\?%*:|"<>]/g, '-').trim()
  const res = await drive.files.list({
    q: `name='${safe}' and '${parentId}' in parents and mimeType='application/vnd.google-apps.folder' and trashed=false`,
    fields: 'files(id)',
    supportsAllDrives: true,
    includeItemsFromAllDrives: true,
  })
  if (res.data.files && res.data.files.length > 0) return res.data.files[0].id!
  const folder = await drive.files.create({
    requestBody: { name: safe, mimeType: 'application/vnd.google-apps.folder', parents: [parentId] },
    fields: 'id',
    supportsAllDrives: true,
  })
  return folder.data.id!
}

export async function POST(req: NextRequest) {
  try {
    // ── Auth: verify session from server cookies ──
    const cookieStore = await cookies()
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          getAll: () => cookieStore.getAll(),
          setAll: () => {},
        },
      },
    )
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const formData = await req.formData()
    const jobId = formData.get('job_id') as string | null
    const customerId = formData.get('customer_id') as string | null
    const projectName = (formData.get('project_name') as string) || 'Unknown Project'
    const roomNo = (formData.get('room_no') as string) || 'Unknown Room'
    const files = formData.getAll('files') as File[]

    if (!files.length) return NextResponse.json({ error: 'ไม่พบไฟล์' }, { status: 400 })
    if (files.length > MAX_FILES) return NextResponse.json({ error: 'เลือกได้สูงสุด ' + MAX_FILES + ' ไฟล์' }, { status: 400 })

    for (const file of files) {
      if (!ALLOWED_TYPES.includes(file.type))
        return NextResponse.json({ error: '"' + file.name + '" ต้องเป็น JPG หรือ PDF เท่านั้น' }, { status: 400 })
      if (file.size > MAX_SIZE)
        return NextResponse.json({ error: '"' + file.name + '" ขนาดเกิน 5MB' }, { status: 400 })
    }

    const drive = getDriveClient()
    const rootId = (process.env.GOOGLE_DRIVE_ROOT_FOLDER || '').replace(/^﻿/, '').trim()
    const projectFolderId = await findOrCreateFolder(drive, projectName, rootId)
    const roomFolderId = await findOrCreateFolder(drive, roomNo, projectFolderId)

    const uploaded: { name: string; url: string; id: string }[] = []

    for (const file of files) {
      const buffer = Buffer.from(await file.arrayBuffer())
      const stream = Readable.from(buffer)
      const res = await drive.files.create({
        requestBody: { name: file.name, parents: [roomFolderId] },
        media: { mimeType: file.type, body: stream },
        fields: 'id,webViewLink',
        supportsAllDrives: true,
      })
      const fileId = res.data.id!
      const fileUrl = res.data.webViewLink!

      await drive.permissions.create({
        fileId,
        requestBody: { role: 'reader', type: 'anyone' },
        supportsAllDrives: true,
      })

      await supabase.from('job_files').insert({
        job_id: jobId || null,
        customer_id: customerId || null,
        file_name: file.name,
        file_url: fileUrl,
        drive_file_id: fileId,
        drive_folder_id: roomFolderId,
        uploaded_by: user.id,
      })

      uploaded.push({ name: file.name, url: fileUrl, id: fileId })
    }

    return NextResponse.json({ success: true, files: uploaded })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Upload ล้มเหลว'
    console.error('Drive upload error:', err)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
