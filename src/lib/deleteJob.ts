import type { SupabaseClient } from '@supabase/supabase-js'

/**
 * ลบงานหนึ่งใบพร้อมทุกอย่างที่ผูกอยู่ — ที่เดียวสำหรับทั้ง Prospects และ My Deals
 *
 * เดิมทั้งสองหน้าเขียนเองว่า "ลบ payments แล้วลบ jobs" แล้ว**ไม่เช็คว่าสำเร็จ
 * ไหม** ก่อนเอาการ์ดออกจากหน้าจอ ผลคือวันที่ 2026-09-08 มีงาน 12 ใบที่กดลบ
 * ไปแล้วหน้าจอบอกว่าหายแต่ยังอยู่ในฐานข้อมูลครบทุกใบ — และงวดชำระของมันถูก
 * ลบไปก่อนหน้านั้นแล้ว จึงเหลือ "งานที่ไม่มีเงิน" ค้างไว้แทน
 *
 * ตัวที่บล็อกคือ `warranties.job_id` ซึ่งเป็น FK แบบ NO ACTION — Postgres ไม่ยอม
 * ให้ลบงานที่ยังมีใบรับประกันค้าง เหมือน `payments`
 *
 * กติกา FK ที่มีผลกับการลบงาน (ตรวจจากฐานข้อมูลจริง 2026-09-08):
 *   CASCADE  — job_cost_items · job_files · commission_referrals → ลบตามเอง
 *   NO ACTION— payments · warranties → **บล็อก** ต้องลบก่อน
 *   SET NULL — handovers → แถวไม่หาย เหลือ job_id ว่าง เป็นแถวกำพร้า
 *   ไม่มี FK  — condo_leads.job_id → ชี้ id ที่ตายแล้วเงียบๆ (เจอค้างอยู่ 7 แถว)
 *
 * ลำดับข้างล่างจึงไม่ใช่เรื่องความสวยงาม แต่เป็นเงื่อนไขให้ลบผ่าน
 *
 * **ทุกขั้นเช็ค error และหยุดทันทีเมื่อพลาด** ผู้เรียกต้องเอา `error` ไปแสดงบนจอ
 * ห้ามลบการ์ดออกจากหน้าจอถ้ายังไม่ได้ ok — อาการ "หน้าจอบอกลบแล้วแต่ข้อมูลอยู่"
 * แย่กว่าปุ่มที่ฟ้องว่าลบไม่ได้
 *
 * ไฟล์แนบ: `job_files` เก็บแค่ id ของไฟล์บน Google Drive แถวถูกลบตาม CASCADE
 * แต่ตัวไฟล์บน Drive ยังอยู่ — ต้องไปลบเองถ้าต้องการ
 */
export interface DeleteJobResult {
  ok: boolean
  /** ข้อความพร้อมแสดงบนจอเมื่อ ok = false */
  error?: string
}

export async function deleteJobCascade(
  supabase: SupabaseClient,
  jobId: string,
): Promise<DeleteJobResult> {
  const steps: { label: string; run: () => PromiseLike<{ error: { message: string } | null }> }[] = [
    { label: 'งวดชำระ', run: () => supabase.from('payments').delete().eq('job_id', jobId) },
    { label: 'ใบรับประกัน', run: () => supabase.from('warranties').delete().eq('job_id', jobId) },
    { label: 'ข้อมูลส่งมอบ', run: () => supabase.from('handovers').delete().eq('job_id', jobId) },
    // ลูกค้าใน Origin Pool กลับไปเป็น "ยังไม่เปิดงาน" ไม่ใช่ชี้ไปงานที่ไม่มีแล้ว
    { label: 'การเชื่อม Origin Pool', run: () => supabase.from('condo_leads').update({ job_id: null }).eq('job_id', jobId) },
    { label: 'ตัวงาน', run: () => supabase.from('jobs').delete().eq('id', jobId) },
  ]

  for (const s of steps) {
    const { error } = await s.run()
    if (error) return { ok: false, error: `ลบ${s.label}ไม่สำเร็จ: ${error.message}` }
  }
  return { ok: true }
}

/** ลบหลายใบตามลำดับ หยุดที่ใบแรกที่พลาดและบอกว่าใบไหน */
export async function deleteJobsCascade(
  supabase: SupabaseClient,
  jobIds: string[],
): Promise<DeleteJobResult> {
  for (const id of jobIds) {
    const res = await deleteJobCascade(supabase, id)
    if (!res.ok) return { ok: false, error: `${id} — ${res.error}` }
  }
  return { ok: true }
}
