/**
 * Read a whole table past PostgREST's row cap.
 *
 * Supabase caps a single select at 1,000 rows by default and returns the first
 * 1,000 **without an error** — the page just quietly shows less than it has.
 * `condo_leads` has 1,542, so Origin Pool was missing 542 leads and its
 * "Lead ทั้งหมด" count was reading off the truncated set.
 *
 * Pass a factory that builds a fresh query each call: a PostgrestFilterBuilder
 * can only be awaited once, so the same object cannot be re-ranged.
 *
 *   const { data, error } = await fetchAllRows(() =>
 *     supabase.from('condo_leads').select('*, projects(name)').order('room_no'))
 *
 * Always give the query a deterministic `order()`. Without one, Postgres may
 * return rows in a different order per chunk and the pages can overlap or skip.
 */

const CHUNK = 1000
/** Refuse to spin forever if a query keeps returning full chunks. */
const MAX_CHUNKS = 50

export async function fetchAllRows<T = unknown>(
  build: () => PromiseLike<{ data: unknown[] | null; error: unknown }> & {
    range: (from: number, to: number) => PromiseLike<{ data: unknown[] | null; error: unknown }>
  },
): Promise<{ data: T[]; error: { message: string } | null; truncated: boolean }> {
  const out: T[] = []
  for (let i = 0; i < MAX_CHUNKS; i++) {
    const from = i * CHUNK
    const { data, error } = await build().range(from, from + CHUNK - 1)
    if (error) return { data: out, error: error as { message: string }, truncated: true }
    const rows = (data ?? []) as T[]
    out.push(...rows)
    if (rows.length < CHUNK) return { data: out, error: null, truncated: false }
  }
  return { data: out, error: null, truncated: true }
}
