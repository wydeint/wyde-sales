import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { NextResponse } from 'next/server'

/**
 * Route-handler guard. RLS protects the tables, but these routes reach past
 * Postgres entirely — Google Drive and the LINE push API — so the role check
 * has to happen here or not at all.
 *
 * Returns null when the caller may write, or the response to send back when
 * they may not.
 */
export async function requireWriter(): Promise<NextResponse | null> {
  const cookieStore = await cookies()
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { getAll: () => cookieStore.getAll(), setAll: () => {} } },
  )

  const { data: { user }, error } = await supabase.auth.getUser()
  if (error || !user?.email) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // Same source of truth as the RLS policies, so one role change moves both.
  const { data } = await supabase
    .from('users').select('role, active').ilike('email', user.email).maybeSingle()
  const row = data as { role: string; active: boolean } | null

  if (!row || !row.active) {
    return NextResponse.json({ error: 'ไม่มีสิทธิ์เข้าใช้งานระบบ' }, { status: 403 })
  }
  if (row.role === 'qc_pm') {
    return NextResponse.json(
      { error: 'บัญชีนี้เป็นสิทธิ์ QC / PM — ดูข้อมูลได้อย่างเดียว' },
      { status: 403 },
    )
  }
  return null
}
