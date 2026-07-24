import { NextRequest, NextResponse } from 'next/server'

export async function POST(req: NextRequest) {
  try {
    const token = process.env.LINE_ACCESS_TOKEN?.replace(/^﻿/, '').trim()
    const groupId = process.env.LINE_GROUP_ID?.trim()

    if (!token) return NextResponse.json({ error: 'No LINE token configured' }, { status: 500 })
    if (!groupId) return NextResponse.json({ error: 'No LINE_GROUP_ID configured' }, { status: 500 })

    let body: { message?: string }
    try {
      body = await req.json()
    } catch {
      return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
    }

    const { message } = body
    if (!message) return NextResponse.json({ error: 'Missing message' }, { status: 400 })

    const lineRes = await fetch('https://api.line.me/v2/bot/message/push', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
      },
      body: JSON.stringify({
        to: groupId,
        messages: [{ type: 'text', text: message }],
      }),
    })

    const responseText = await lineRes.text()
    if (!lineRes.ok) {
      return NextResponse.json({ error: responseText, status: lineRes.status }, { status: lineRes.status })
    }

    return NextResponse.json({ ok: true })
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
