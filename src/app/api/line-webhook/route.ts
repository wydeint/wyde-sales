import { NextRequest, NextResponse } from 'next/server'

// LINE sends POST with events when something happens in the group.
// We log the groupId here so you can copy it from Vercel logs and set LINE_GROUP_ID env.
export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const events: any[] = body.events ?? []

    for (const event of events) {
      const source = event.source ?? {}
      if (source.type === 'group' && source.groupId) {
        // Copy this value from Vercel logs → set as LINE_GROUP_ID env variable
        console.log('[LINE Webhook] groupId:', source.groupId, '| eventType:', event.type)
      }
    }

    return NextResponse.json({ ok: true })
  } catch {
    // Always return 200 so LINE doesn't retry
    return NextResponse.json({ ok: true })
  }
}

// LINE console "Verify" button sends GET — must return 200
export async function GET() {
  return NextResponse.json({ ok: true })
}
