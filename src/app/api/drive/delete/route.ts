import { NextRequest, NextResponse } from 'next/server'
import { google } from 'googleapis'
import { createClient } from '@supabase/supabase-js'

function getDriveClient() {
  const oAuth2Client = new google.auth.OAuth2(
    process.env.GOOGLE_OAUTH_CLIENT_ID,
    process.env.GOOGLE_OAUTH_CLIENT_SECRET,
    'https://developers.google.com/oauthplayground',
  )
  oAuth2Client.setCredentials({ refresh_token: process.env.GOOGLE_OAUTH_REFRESH_TOKEN })
  return google.drive({ version: 'v3', auth: oAuth2Client })
}

export async function DELETE(req: NextRequest) {
  try {
    const { job_file_id, drive_file_id } = await req.json()
    if (!job_file_id) return NextResponse.json({ error: 'missing job_file_id' }, { status: 400 })

    const authHeader = req.headers.get('Authorization')
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      authHeader ? { global: { headers: { Authorization: authHeader } } } : {},
    )

    // Delete from Drive (best-effort — file may already be gone)
    if (drive_file_id) {
      try {
        const drive = getDriveClient()
        await drive.files.delete({ fileId: drive_file_id, supportsAllDrives: true })
      } catch {
        // ignore — file already deleted or not found
      }
    }

    // Delete record from Supabase
    const { error } = await supabase.from('job_files').delete().eq('id', job_file_id)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    return NextResponse.json({ success: true })
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'Delete failed' }, { status: 500 })
  }
}
