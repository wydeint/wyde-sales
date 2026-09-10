import type { SupabaseClient } from '@supabase/supabase-js'

/**
 * The next free customer code.
 *
 * Every customer is `CST-nnnn` and nothing else. The code used to be
 * `PROJECT-ROOM`, which reads well until you notice it identifies a *sale*
 * rather than a *customer*: the moment one buyer holds two rooms the code names
 * only one of them. On 2026-09-01 that was true of 63 records — `TOR19-B-703`
 * held B703 through B707 — and on the B2B side it had gone further and minted a
 * whole new customer per room, 265 duplicates in all. All 627 records were
 * renumbered that day (backup `customers_recode_backup_20260901`, old-to-new
 * map kept permanently in `customer_id_map_20260901`).
 *
 * So the code deliberately carries no meaning. Project and room describe the
 * job and live on the job, where they stay true however many rooms are bought.
 */
export async function nextCustomerId(supabase: SupabaseClient): Promise<string> {
  // Highest existing number wins rather than a count, so deleting a record
  // never hands its code to someone else.
  const { data } = await supabase
    .from('customers').select('id').like('id', 'CST-%')
    .order('id', { ascending: false }).limit(1).maybeSingle()
  const n = data?.id ? parseInt(String(data.id).slice(4), 10) : 0
  return 'CST-' + String((Number.isFinite(n) ? n : 0) + 1).padStart(4, '0')
}

/**
 * The customer already on file for a room, if there is one.
 *
 * Under the old `PROJECT-ROOM` codes this question answered itself: build the
 * string and look it up. Codes mean nothing now, so the room has to be asked
 * about directly — either the record filed under it, or whoever already holds a
 * job in it. Without this, opening a job on a room that already has a customer
 * would mint a second record for it, which is the very duplication the recode
 * was meant to end.
 */
export async function findCustomerByRoom(supabase: SupabaseClient, projectId: string, roomNo: string) {
  const room = (roomNo || '').trim()
  if (!projectId || !room) return null

  const { data: byRoom } = await supabase.from('customers')
    .select('id').eq('project_id', projectId).ilike('interested_room', room).limit(1)
  if (byRoom?.[0]?.id) return byRoom[0].id as string

  const { data: byJob } = await supabase.from('jobs')
    .select('customer_id').eq('project_id', projectId).ilike('room_no', room)
    .not('customer_id', 'is', null).limit(1)
  return (byJob?.[0]?.customer_id as string) || null
}

/**
 * Which customer record a new job should hang off.
 *
 * A B2B buyer is a company, and companies buy repeatedly — one developer took
 * 145 rooms in the same project — so those are matched on (project, company
 * name). That is safe in a way it would not be for B2C: the name is a
 * registered company name, not a person's, and two people can share a name.
 *
 * Failing that, the room decides. A repeat B2C buyer taking a *different* room
 * is still attached by hand through Prospects' "ซื้อซ้ำ", because only a person
 * can tell two same-named buyers apart — but a job opened on a room that
 * already has a record must join that record, not start a rival one.
 */
export async function resolveCustomerId(supabase: SupabaseClient, args: {
  projectId: string
  roomNo: string
  customerName: string
  customerType: string
}): Promise<string> {
  const { projectId, roomNo, customerName, customerType } = args
  const name = (customerName || '').trim()

  if (customerType === 'B2B' && name && projectId) {
    const { data: company } = await supabase
      .from('customers')
      .select('id')
      .eq('project_id', projectId)
      .eq('customer_type', 'B2B')
      .eq('customer_name', name)
      .order('created_at')
      .limit(1)
      .maybeSingle()
    if (company?.id) return company.id
  }

  const onRoom = await findCustomerByRoom(supabase, projectId, roomNo)
  if (onRoom) return onRoom

  return nextCustomerId(supabase)
}
