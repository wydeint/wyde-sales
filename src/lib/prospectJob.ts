import type { SupabaseClient } from '@supabase/supabase-js'

/**
 * Open the job row that goes with a new customer.
 *
 * Every customer we sell to has at least one job, and the rest of the app is
 * built on that: the Prospect board renders one card per job, the ownership
 * rules put work type, room and cancellation on the job, and the Project
 * Summary counts jobs. A customer with no job is invisible to most of it.
 *
 * Only the Prospects page created one. Customers, Leads and Events each insert
 * a customer and stop, which is how thirteen records ended up with no job —
 * two of them added in the last week, carrying notes ("Model: 1 Bedroom Duo")
 * that the Leads page writes and that then had nowhere to live.
 *
 * Lifted out of pipeline/page.tsx so those three can call it too.
 *
 * `working_status` stays null on purpose: nobody has started building. It is
 * set when the deal is booked. See the jobs_closed_requires_working_status
 * constraint, which allows null at every stage except closed.
 */
export async function createProspectJob(
  supabase: SupabaseClient,
  args: {
    customerId: string
    customerName: string
    projectId: string | null
    roomNo: string | null
    /** Omit and the customers -> jobs trigger fills it from the customer. */
    customerType?: string | null
    workType?: string | null
    salesId?: string | null
    crmStage: string
    orderDate?: string | null
  },
): Promise<string> {
  const { data: allJobIds } = await supabase.from('jobs').select('id').like('id', 'JOB-%')
  let baseNum = 1
  if (allJobIds && allJobIds.length > 0) {
    const nums = (allJobIds as { id: string }[]).map(j => {
      const m = j.id.match(/JOB-(\d+)/)
      return m ? parseInt(m[1], 10) : 0
    })
    baseNum = Math.max(...nums) + 1
  }
  // Retry on a duplicate id: two people adding a prospect at once would other-
  // wise collide on the same computed number.
  for (let attempt = 0; attempt < 5; attempt++) {
    const jobId = `JOB-${baseNum + attempt}`
    const { error } = await supabase.from('jobs').insert({
      id: jobId,
      customer_id: args.customerId,
      customer_name: args.customerName,
      project_id: args.projectId,
      room_no: args.roomNo,
      customer_type: args.customerType ?? null,
      work_type: args.workType ?? null,
      sales_id: args.salesId ?? null,
      crm_stage: args.crmStage,
      working_status: null,
      order_date: args.orderDate ?? null,
    })
    if (!error) return jobId
    if (!error.message.includes('duplicate key')) return ''
  }
  return ''
}
