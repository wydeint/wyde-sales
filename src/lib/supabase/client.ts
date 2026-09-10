import { createBrowserClient } from '@supabase/ssr'
import type { SupabaseClient } from '@supabase/supabase-js'
import { showAlert } from '@/components/ui/dialog'

// ─── Read-only mode (QC / PM) ───────────────────────────────
//
// The database is the real gate: RLS lets a qc_pm role read everything and
// write nothing. What that alone gives a QC/PM user is a raw PostgREST error at
// the end of a form they already filled in. This wrapper turns that into a
// sentence, in one place.
//
// One place, deliberately. There are 138 write call sites across 20 files, and
// the lesson from the cancel/handover work is that anything copied per screen
// drifts — a screen added next month would quietly be writable again. Here it
// cannot be: every write in the app goes through a client built by createClient.

let readOnly = false

/** Set once the signed-in user's role is known (see ReadOnlyGate). */
export function setReadOnly(value: boolean) { readOnly = value }
export function isReadOnly() { return readOnly }

const BLOCKED = ['insert', 'update', 'upsert', 'delete'] as const

const MESSAGE = 'บัญชีนี้เป็นสิทธิ์ QC / PM — ดูข้อมูลได้อย่างเดียว ไม่สามารถเพิ่ม แก้ไข หรือลบข้อมูลได้'

/** Shape a blocked call returns: awaited like a real query, always an error. */
function blocked() {
  const result = { data: null, error: { message: MESSAGE, code: 'READ_ONLY' } }
  // Thenable so `await supabase.from(x).update(y).eq(...)` still resolves, and
  // chainable so the filter methods that follow it do not throw first.
  const chain: Record<string, unknown> = {
    then: (resolve: (v: unknown) => unknown) => Promise.resolve(result).then(resolve),
    catch: () => Promise.resolve(result),
    finally: (fn: () => void) => Promise.resolve(result).finally(fn),
  }
  return new Proxy(chain, {
    get(target, prop) {
      if (prop in target) return target[prop as string]
      if (prop === 'select' || prop === 'single' || prop === 'maybeSingle') return () => proxied
      return () => proxied
    },
  })
}
const proxied = blocked()

export function createClient(): SupabaseClient {
  const client = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )

  const originalFrom = client.from.bind(client)
  client.from = ((table: string) => {
    const builder = originalFrom(table)
    if (!readOnly) return builder
    for (const method of BLOCKED) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (builder as any)[method] = () => {
        void showAlert(MESSAGE)
        return blocked()
      }
    }
    return builder
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  }) as any

  return client
}
