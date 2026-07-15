import { NextRequest, NextResponse } from 'next/server'
import { google } from 'googleapis'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'

function getDriveClient() {
  const auth = new google.auth.OAuth2(
    process.env.GOOGLE_OAUTH_CLIENT_ID!,
    process.env.GOOGLE_OAUTH_CLIENT_SECRET!,
  )
  auth.setCredentials({ refresh_token: process.env.GOOGLE_OAUTH_REFRESH_TOKEN! })
  return google.drive({ version: 'v3', auth })
}

export async function DELETE(req: NextRequest) {
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

    const { job_file_id, drive_file_id } = await req.json()
    if (!job_file_id) return NextResponse.json({ error: 'missing job_file_id' }, { status: 400 })

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
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Delete failed'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
