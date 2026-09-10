import type { SupabaseClient } from '@supabase/supabase-js'

/**
 * The signed-in person's id **in our `users` table** — not the Supabase auth id.
 *
 * These are two different things and they look alike enough to be confused:
 * `session.user.id` is a Supabase auth UUID, while `users.id` is the short
 * handle the rest of the schema points at ('phonsirit-01'). Three screens wrote
 * the auth UUID into `finance_entries.created_by`, which has
 * `REFERENCES users(id)`, so every one of those inserts failed the foreign key.
 * Two of the three ignored the error; the third had only just started reporting
 * it. The visible symptom was a refund on a cancelled booking that never
 * reached Finance — money the books did not know had left.
 *
 * Returns null when there is no session or no matching user row, which the
 * column allows: an entry with no author is worth more than no entry at all.
 */
export async function appUserId(supabase: SupabaseClient): Promise<string | null> {
  const { data: { session } } = await supabase.auth.getSession()
  const email = session?.user?.email
  if (!email) return null
  // ilike, not eq: three rows were stored with capitals while Google always
  // hands back a lower-cased address, so an exact compare silently missed them.
  // The rows are normalised now, but the next capital typed into the Users page
  // must not break this again.
  const { data } = await supabase.from('users').select('id').ilike('email', email).maybeSingle()
  return (data as { id: string } | null)?.id ?? null
}

/** The signed-in person's role, or null when they are not registered staff. */
export async function appUserRole(supabase: SupabaseClient): Promise<string | null> {
  const { data: { session } } = await supabase.auth.getSession()
  const email = session?.user?.email
  if (!email) return null
  const { data } = await supabase.from('users').select('role').ilike('email', email).maybeSingle()
  return (data as { role: string } | null)?.role ?? null
}

/** QC / PM: sees everything, changes nothing. Enforced in RLS; this is the UI half. */
export const QC_PM_ROLE = 'qc_pm'
